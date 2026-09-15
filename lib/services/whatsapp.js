import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs/promises';
import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import { config, ownerJid } from '../config.js';
import { db } from '../core/database.js';
import { logger } from '../core/logger.js';
import { dispatchMessage } from '../core/dispatcher.js';
import { bareNumber, cleanJid, sleep } from '../utils/text.js';
import { extractText } from '../utils/message.js';
import { serifBold, premiumLabel, premiumTitle } from '../utils/brand-style.js';
import { readMenuCard } from './menu-card.js';
import { handleIncomingStatus } from './status-studio.js';

const ACTIVE_STATES = new Set(['starting', 'connecting', 'waiting_for_pair', 'pair_code_ready', 'connected']);
const hashToken = (value = '') => crypto.createHash('sha256').update(String(value)).digest('hex');
const maskPhone = (value = '') => {
  const digits = String(value).replace(/\D/g, '');
  return digits.length > 4 ? `${'*'.repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}` : digits;
};
const safeLabel = (value = '') => String(value || '').replace(/[\r\n\t]/g, ' ').trim().slice(0, 50);


function connectedQuickStartRows(prefix) {
  return [
    `┃ 🚀 *${prefix}menu*`,
    `┃ 📚 *${prefix}menu all*`,
    `┃ 🎭 *${prefix}reactionmenu*`,
    `┃ 🎧 *${prefix}play <song>*`,
    `┃ 🎬 *${prefix}video <song>*`,
    `┃ 🟢 *${prefix}alive*`,
    `┃ ⚡ *${prefix}ping*`,
    `┃ 👑 *${prefix}owner*`
  ];
}

function connectedFooterBlock() {
  return [
    `╭━━━〔 👑 ${serifBold('POWERED BY')} 👑 〕━━━╮`,
    `┃ ${serifBold('ABDULLAH-X-HACKER')}`,
    `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯`
  ];
}

function connectedBox(title, rows, icon = '✨') {
  return [
    `╭━━━〔 ${icon} ${serifBold(title)} ${icon} 〕━━━╮`,
    ...rows,
    `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯`
  ];
}

const PRIVATE_DELETE_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const PRIVATE_DELETE_CACHE_MAX = 500;
const PRIVATE_DELETE_DEDUPE_TTL_MS = 10 * 60 * 1000;

function cacheKeyForMessage(key = {}, fallbackChat = '') {
  const chat = cleanJid(key?.remoteJid || fallbackChat || '');
  const id = String(key?.id || '').trim();
  return chat && id ? `${chat}::${id}` : '';
}

function unwrapTransportMessage(message = {}) {
  let current = message || {};
  for (let i = 0; i < 5; i += 1) {
    if (current.ephemeralMessage?.message) current = current.ephemeralMessage.message;
    else if (current.documentWithCaptionMessage?.message) current = current.documentWithCaptionMessage.message;
    else break;
  }
  return current || {};
}

function containsViewOnce(message = {}) {
  let current = message || {};
  for (let i = 0; i < 6; i += 1) {
    if (current.viewOnceMessage?.message || current.viewOnceMessageV2?.message || current.viewOnceMessageV2Extension?.message) return true;
    if (current.ephemeralMessage?.message) current = current.ephemeralMessage.message;
    else if (current.documentWithCaptionMessage?.message) current = current.documentWithCaptionMessage.message;
    else break;
  }
  return false;
}

function revokeTargetKey(message = {}) {
  const current = unwrapTransportMessage(message);
  const protocol = current.protocolMessage;
  if (!protocol?.key?.id) return null;
  const type = Number(protocol.type);
  return type === 0 ? protocol.key : null;
}

function hasForwardableMedia(message = {}) {
  const current = unwrapTransportMessage(message);
  return Boolean(
    current.imageMessage || current.videoMessage || current.audioMessage || current.documentMessage ||
    current.stickerMessage || current.contactMessage || current.contactsArrayMessage || current.locationMessage ||
    current.liveLocationMessage
  );
}

const isPnJid = (jid = '') => /@s\.whatsapp\.net$/i.test(String(jid));
const isLidJid = (jid = '') => /@lid$/i.test(String(jid));
async function resolveOwnPhoneJid(sock, rawId = '', rawLid = '', fallbackPhone = '') {
  const id = cleanJid(rawId || '');
  const lid = cleanJid(rawLid || '');
  if (isPnJid(id)) return id;
  if (isPnJid(lid)) return lid;
  for (const candidate of [id, lid]) {
    if (!isLidJid(candidate)) continue;
    try {
      const mapped = await sock.signalRepository?.lidMapping?.getPNForLID?.(candidate);
      if (mapped) return cleanJid(mapped);
    } catch {}
  }
  const phone = String(fallbackPhone || '').replace(/\D/g, '');
  return phone ? `${phone}@s.whatsapp.net` : id || lid;
}

async function registeredAuth(dir) {
  try {
    const raw = await fs.readFile(path.join(dir, 'creds.json'), 'utf8');
    return Boolean(JSON.parse(raw)?.registered);
  } catch { return false; }
}

class WhatsAppInstance {
  constructor({ id, sessionDir, claimedPhone = '', label = '', isMain = false, onConnected = null, onStatus = null }) {
    this.id = id;
    this.sessionDir = sessionDir;
    this.claimedPhone = String(claimedPhone || '').replace(/\D/g, '');
    this.label = safeLabel(label) || (isMain ? 'Owner Session' : 'Linked Session');
    this.isMain = isMain;
    this.onConnected = onConnected;
    this.onStatus = onStatus;
    this.sock = null;
    this.state = this.#freshState('stopped');
    this.starting = null;
    this.reconnectTimer = null;
    this.reconnectAttempt = 0;
    this.authState = null;
    this.generation = 0;
    this.pairRequest = null;
    this.pairCodeTimer = null;
    this.waVersionTuple = null;
    this.connectedNoticeSent = false;
    this.connectedNoticeTimer = null;
    this.privateMessageCache = new Map();
    this.privateDeleteNotified = new Map();
    this.disabled = false;
  }

  #freshState(status) {
    return {
      status, qr: null, pairCode: null, pairCodeCreatedAt: null, pairingPhoneMasked: null,
      connectedAt: null, lastDisconnect: null, user: null, version: null
    };
  }

  runtime() {
    const liveNumber = bareNumber(cleanJid(this.sock?.user?.id || ''));
    return { sessionId: this.id, ownerNumber: liveNumber || this.claimedPhone, label: this.label, isMain: this.isMain };
  }

  snapshot() {
    return {
      id: this.id,
      label: this.label,
      isMain: this.isMain,
      status: this.state.status,
      pairCode: this.state.pairCode,
      pairCodeCreatedAt: this.state.pairCodeCreatedAt,
      pairingPhoneMasked: this.state.pairingPhoneMasked,
      hasQr: Boolean(this.state.qr),
      connectedAt: this.state.connectedAt,
      lastDisconnect: this.state.lastDisconnect,
      user: this.state.user,
      version: this.state.version,
      botName: config.botName,
      shortName: config.shortName,
      sessionRegistered: Boolean(this.authState?.creds?.registered),
      reconnectAttempt: this.reconnectAttempt,
      claimedPhoneMasked: maskPhone(this.claimedPhone)
    };
  }

  async start() {
    this.disabled = false;
    if (this.starting) return this.starting;
    if (this.sock && ACTIVE_STATES.has(this.state.status)) return this.sock;
    this.starting = this.#startInternal().finally(() => { this.starting = null; });
    return this.starting;
  }

  async #startInternal() {
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    await fs.mkdir(this.sessionDir, { recursive: true });
    this.state.status = 'starting';
    const { state, saveCreds } = await useMultiFileAuthState(this.sessionDir);
    this.authState = state;

    let version = this.waVersionTuple;
    if (!version) {
      try {
        const latest = await fetchLatestBaileysVersion();
        version = latest.version;
        this.waVersionTuple = version;
        this.state.version = version.join('.');
      } catch (err) { logger.warn({ err, sessionId: this.id }, 'Could not fetch latest WhatsApp Web version; using Baileys default'); }
    } else this.state.version = version.join('.');

    const generation = ++this.generation;
    const socketConfig = {
      auth: state,
      logger: pino({ level: 'silent' }),
      browser: Browsers.macOS('Safari'),
      markOnlineOnConnect: false,
      syncFullHistory: false,
      generateHighQualityLinkPreview: false,
      connectTimeoutMs: 60_000,
      defaultQueryTimeoutMs: 60_000,
      keepAliveIntervalMs: 25_000,
      getMessage: async () => undefined
    };
    if (version) socketConfig.version = version;

    const sock = makeWASocket(socketConfig);
    this.sock = sock;
    this.state.status = state.creds.registered ? 'connecting' : 'waiting_for_pair';
    this.onStatus?.(this);

    sock.ev.on('creds.update', async () => {
      if (generation !== this.generation) return;
      try { await saveCreds(); } catch (err) { logger.error({ err, sessionId: this.id }, 'Saving WhatsApp credentials failed'); }
    });

    sock.ev.on('connection.update', async (update) => {
      if (generation !== this.generation) return;
      const { connection, lastDisconnect, qr } = update;
      if (qr && !state.creds.registered) {
        this.state.qr = qr;
        if (this.state.status !== 'pair_code_ready') this.state.status = 'waiting_for_pair';
        this.onStatus?.(this);
      }
      if (connection === 'connecting' && this.state.status !== 'pair_code_ready') {
        this.state.status = state.creds.registered ? 'connecting' : 'waiting_for_pair';
        this.onStatus?.(this);
      }
      if (connection === 'open') {
        const registered = Boolean(state.creds.registered || this.authState?.creds?.registered);
        if (!registered) {
          this.state.status = 'waiting_for_pair';
          this.state.user = null;
        } else {
          this.reconnectAttempt = 0;
          this.state.status = 'connected';
          this.state.qr = null;
          clearTimeout(this.pairCodeTimer);
          this.pairCodeTimer = null;
          this.state.pairCode = null;
          this.state.pairCodeCreatedAt = null;
          this.state.pairingPhoneMasked = null;
          this.state.connectedAt = new Date().toISOString();
          this.state.lastDisconnect = null;
          const resolvedUserJid = await resolveOwnPhoneJid(
            sock,
            sock.user?.id || '',
            sock.user?.lid || '',
            this.claimedPhone || (this.isMain ? config.ownerNumber : '')
          );
          this.state.user = {
            id: resolvedUserJid || cleanJid(sock.user?.id || ''),
            lid: cleanJid(sock.user?.lid || ''),
            name: sock.user?.name || config.botName
          };
          const linkedNumber = isPnJid(this.state.user.id) ? bareNumber(this.state.user.id) : '';
          if (linkedNumber) this.claimedPhone = linkedNumber;
          logger.info({ sessionId: this.id, user: this.state.user }, `${config.botName} connected`);
          await this.onConnected?.(this);
          if (!this.connectedNoticeSent) this.#scheduleConnectedNotice(sock, generation);
        }
        this.onStatus?.(this);
      }
      if (connection === 'close') {
        let code = null;
        try { code = new Boom(lastDisconnect?.error)?.output?.statusCode; } catch {}
        if (generation !== this.generation) return;
        if (this.sock === sock) this.sock = null;
        const loggedOut = code === DisconnectReason.loggedOut;
        const restartRequired = code === DisconnectReason.restartRequired || code === 515;
        if (restartRequired) {
          try {
            await saveCreds();
            logger.info({ sessionId: this.id, code }, 'WhatsApp credentials flushed before restart reconnect');
          } catch (err) {
            logger.error({ err, sessionId: this.id, code }, 'WhatsApp credential flush before restart reconnect failed');
          }
        }
        this.state.status = loggedOut ? 'logged_out' : (restartRequired ? 'restarting' : 'disconnected');
        this.state.lastDisconnect = { code, at: new Date().toISOString() };
        this.state.user = null;
        clearTimeout(this.connectedNoticeTimer);
        this.connectedNoticeTimer = null;
        logger.warn({ sessionId: this.id, code, loggedOut, restartRequired }, 'WhatsApp connection closed');
        if (loggedOut) this.connectedNoticeSent = false;
        this.onStatus?.(this);
        if (!loggedOut && !this.disabled) this.#scheduleReconnect(generation, restartRequired ? 1200 : undefined);
      }
    });

    sock.ev.on('messages.upsert', async ({ messages, type, requestId }) => {
      if (generation !== this.generation || type !== 'notify' || requestId) return;
      for (const msg of messages) {
        try {
          if (msg?.key?.remoteJid === 'status@broadcast') {
            await handleIncomingStatus(sock, msg, this.id);
            continue;
          }
          const revoked = revokeTargetKey(msg?.message);
          if (revoked) {
            await this.#handlePrivateDelete(sock, revoked, generation, msg?.key?.remoteJid || '');
            continue;
          }
          this.#rememberPrivateMessage(msg);
          await dispatchMessage(sock, msg, this.runtime());
        }
        catch (err) { logger.error({ err, sessionId: this.id }, 'Message dispatch failed'); }
      }
    });

    sock.ev.on('messages.update', async (updates = []) => {
      if (generation !== this.generation) return;
      for (const row of updates || []) {
        try {
          const revoked = revokeTargetKey(row?.update?.message || row?.message || {});
          if (revoked) await this.#handlePrivateDelete(sock, revoked, generation, row?.key?.remoteJid || '');
        } catch (err) { logger.warn({ err, sessionId: this.id }, 'Private anti-delete update handler failed'); }
      }
    });

    sock.ev.on('messages.delete', async (event = {}) => {
      if (generation !== this.generation) return;
      if (!Array.isArray(event?.keys)) return;
      for (const key of event.keys) {
        try { await this.#handlePrivateDelete(sock, key, generation, key?.remoteJid || ''); }
        catch (err) { logger.warn({ err, sessionId: this.id }, 'Private anti-delete delete handler failed'); }
      }
    });

    sock.ev.on('call', async (calls = []) => {
      if (generation !== this.generation) return;
      const settings = db.session(this.id);
      if (!settings.antiCall) return;
      const rows = Array.isArray(calls) ? calls : [calls];
      for (const call of rows) {
        const from = cleanJid(call?.from || call?.chatId || call?.fromMe || '');
        const id = call?.id || call?.callId || '';
        if (!from || call?.fromMe) continue;
        try {
          if (typeof sock.rejectCall === 'function' && id) await sock.rejectCall(id, from);
        } catch (err) { logger.warn({ err, sessionId: this.id, from }, 'A-X-HK anti-call reject failed'); }
        try {
          const text = [
            '╭━━━〔 📞 A-X-HK CALL GUARD 📞 〕━━━╮',
            `┃ ${String(settings.antiCallText || 'Please do not call. Send a message and I will reply soon.').slice(0, 900)}`,
            '╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
            '',
            config.footerMessage
          ].join('\n');
          await sock.sendMessage(from, { text });
        } catch (err) { logger.warn({ err, sessionId: this.id, from }, 'A-X-HK anti-call notice failed'); }
      }
    });

    sock.ev.on('group-participants.update', async (event) => {
      if (generation !== this.generation) return;
      const group = db.group(event.id, this.id);
      if (!group.welcome && !group.goodbye && !group.adminEvents) return;
      const participantRows = Array.isArray(event.participants) ? event.participants : [];
      const participants = participantRows.map((p) => cleanJid(typeof p === 'string' ? p : p?.id)).filter(Boolean);
      if (!participants.length) return;
      try {
        const metadata = await sock.groupMetadata(event.id).catch(() => null);
        const groupName = metadata?.subject || 'the group';
        const count = metadata?.participants?.length || '';
        const mentionText = participants.map((jid) => `@${jid.split('@')[0]}`).join(' ');
        const render = (template, fallback) => String(template || fallback)
          .replaceAll('{user}', mentionText).replaceAll('{group}', groupName).replaceAll('{count}', String(count));
        const premiumEventText = (title, icon, bodyRows = []) => [
          `╭━━━〔 ${icon} A-X-HK ${title} ${icon} 〕━━━╮`,
          `┃ 👥 GROUP    ${String(groupName).slice(0, 58)}`,
          `┃ 👤 USER     ${mentionText}`,
          count ? `┃ 🧩 MEMBERS  ${count}` : '',
          ...bodyRows.map((row) => `┃ ${row}`),
          '╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
          '',
          config.footerMessage
        ].filter(Boolean).join('\n');

        if (event.action === 'add') {
          if (group.welcome) {
            const text = render(group.welcomeText, premiumEventText('WELCOME', '✨', ['🎉 Welcome to the family.']));
            if (group.welcomeImage) {
              try { await sock.sendMessage(event.id, { image: await fs.readFile(group.welcomeImage), caption: text, mentions: participants }); }
              catch { await sock.sendMessage(event.id, { text, mentions: participants }); }
            } else await sock.sendMessage(event.id, { text, mentions: participants });
          } else if (group.adminEvents) {
            await sock.sendMessage(event.id, { text: premiumEventText('MEMBER ADDED', '➕', ['🛡️ Join event logged.']), mentions: participants });
          }
        }
        if (event.action === 'remove') {
          if (group.goodbye) {
            const text = render(group.goodbyeText, premiumEventText('GOODBYE', '👋', ['We hope to see you again.']));
            if (group.goodbyeImage) {
              try { await sock.sendMessage(event.id, { image: await fs.readFile(group.goodbyeImage), caption: text, mentions: participants }); }
              catch { await sock.sendMessage(event.id, { text, mentions: participants }); }
            } else await sock.sendMessage(event.id, { text, mentions: participants });
          } else if (group.adminEvents) {
            await sock.sendMessage(event.id, { text: premiumEventText('MEMBER REMOVED', '🚪', ['🛡️ Admin action logged.']), mentions: participants });
          }
        }
        if (group.adminEvents && event.action === 'promote') {
          await sock.sendMessage(event.id, { text: premiumEventText('PROMOTED', '👑', ['✅ User is now group admin.']), mentions: participants });
        }
        if (group.adminEvents && event.action === 'demote') {
          await sock.sendMessage(event.id, { text: premiumEventText('DEMOTED', '📉', ['ℹ️ Admin role removed.']), mentions: participants });
        }
      } catch (err) { logger.warn({ err, sessionId: this.id }, 'Premium group event message failed'); }
    });
    return sock;
  }


  #prunePrivateDeleteCache(now = Date.now()) {
    for (const [key, row] of this.privateMessageCache) {
      if (!row?.at || now - row.at > PRIVATE_DELETE_CACHE_TTL_MS) this.privateMessageCache.delete(key);
    }
    for (const [key, at] of this.privateDeleteNotified) {
      if (!at || now - at > PRIVATE_DELETE_DEDUPE_TTL_MS) this.privateDeleteNotified.delete(key);
    }
    while (this.privateMessageCache.size > PRIVATE_DELETE_CACHE_MAX) {
      const oldest = this.privateMessageCache.keys().next().value;
      if (!oldest) break;
      this.privateMessageCache.delete(oldest);
    }
  }

  #rememberPrivateMessage(msg) {
    const settings = db.session(this.id);
    const chat = cleanJid(msg?.key?.remoteJid || '');
    if (!chat || chat === 'status@broadcast' || msg?.key?.fromMe) return;
    const isGroup = chat.endsWith('@g.us');
    if (isGroup) {
      const group = db.group(chat, this.id);
      if (!group.antiDelete) return;
    } else if (!settings.antiDeletePrivate) return;
    if (!msg?.message || revokeTargetKey(msg.message) || containsViewOnce(msg.message)) return;
    const key = cacheKeyForMessage(msg.key);
    if (!key) return;
    const now = Date.now();
    this.#prunePrivateDeleteCache(now);
    this.privateMessageCache.set(key, {
      at: now,
      chat,
      msg,
      text: extractText(msg),
      media: hasForwardableMedia(msg.message),
      isGroup
    });
    this.#prunePrivateDeleteCache(now);
  }

  async #ownInboxCandidates(sock) {
    const resolved = await resolveOwnPhoneJid(
      sock,
      this.state.user?.id || sock.user?.id || '',
      this.state.user?.lid || sock.user?.lid || '',
      this.claimedPhone || (this.isMain ? config.ownerNumber : '')
    );
    const phone = this.claimedPhone || (isPnJid(resolved) ? bareNumber(resolved) : '') || (this.isMain ? config.ownerNumber : '');
    const candidates = [];
    const add = (jid) => {
      const clean = cleanJid(jid || '');
      if (clean && !candidates.includes(clean)) candidates.push(clean);
    };
    if (phone) add(`${String(phone).replace(/\D/g, '')}@s.whatsapp.net`);
    if (this.isMain) add(ownerJid());
    add(resolved);
    add(sock.user?.id);
    add(sock.user?.lid);
    return candidates;
  }

  async #handlePrivateDelete(sock, deletedKey, expectedGeneration, fallbackChat = '') {
    db.session(this.id);
    if (expectedGeneration !== this.generation || this.sock !== sock || this.state.status !== 'connected') return false;

    this.#prunePrivateDeleteCache();
    const wantedId = String(deletedKey?.id || '').trim();
    if (!wantedId) return false;
    const directKey = cacheKeyForMessage(deletedKey, fallbackChat);
    let cacheKey = directKey;
    let cached = directKey ? this.privateMessageCache.get(directKey) : null;
    if (!cached) {
      for (const [key, row] of this.privateMessageCache) {
        if (String(row?.msg?.key?.id || '') === wantedId) { cacheKey = key; cached = row; break; }
      }
    }
    if (!cached || containsViewOnce(cached.msg?.message || {})) return false;
    if (this.privateDeleteNotified.has(cacheKey)) return false;
    this.privateDeleteNotified.set(cacheKey, Date.now());
    this.privateMessageCache.delete(cacheKey);

    const sender = bareNumber(cached.chat) || 'Unknown';
    const when = new Date(cached.at || Date.now()).toLocaleString('en-PK', { timeZone: config.timezone });
    const header = [
      `╭━━━━〔 🛡️ ${config.shortName} ANTI-DELETE 〕━━━━╮`,
      cached.isGroup ? `│  👥 Group message recovered` : `│  💬 Private inbox message recovered`,
      `│  👤 From   : ${sender === 'Unknown' ? sender : (cached.isGroup ? sender : `+${sender}`)}`,
      `│  🕒 Sent   : ${when}`,
      `╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯`
    ].join('\n');

    const candidates = await this.#ownInboxCandidates(sock);
    let lastError = null;
    for (const target of candidates) {
      if (expectedGeneration !== this.generation || this.sock !== sock || this.state.status !== 'connected') return false;
      try {
        if (cached.media) {
          await sock.sendMessage(target, { text: `${header}\n\n📎 *Original media/message:*` });
          try {
            await sock.sendMessage(target, { forward: cached.msg, force: true });
          } catch (forwardErr) {
            const fallback = cached.text ? `\n\n📝 *Caption/Text*\n${cached.text}` : '\n\n⚠️ The original non-text media could not be forwarded after deletion.';
            await sock.sendMessage(target, { text: `${header}${fallback}\n\n${config.footerMessage}` });
          }
        } else {
          const body = cached.text || '[Unsupported non-text message]';
          await sock.sendMessage(target, { text: `${header}\n\n📝 *MESSAGE*\n${body}\n\n${config.footerMessage}` });
        }
        logger.info({ sessionId: this.id, source: cached.chat, target }, 'A-X-HK anti-delete owner log recovered a deleted message');
        return true;
      } catch (err) {
        lastError = err;
        logger.warn({ err, sessionId: this.id, target }, 'Private anti-delete target failed; trying fallback');
      }
    }
    if (lastError) throw lastError;
    return false;
  }


  #scheduleConnectedNotice(sock, expectedGeneration, attempt = 0) {
    clearTimeout(this.connectedNoticeTimer);
    const delays = [850, 1500, 2500];
    const delay = delays[Math.min(attempt, delays.length - 1)];
    this.connectedNoticeTimer = setTimeout(async () => {
      this.connectedNoticeTimer = null;
      if (this.connectedNoticeSent) return;
      if (expectedGeneration !== this.generation || this.sock !== sock || this.state.status !== 'connected') return;
      try {
        const sent = await this.#sendConnectedNoticeNow(sock, expectedGeneration);
        if (sent) {
          this.connectedNoticeSent = true;
          logger.info({ sessionId: this.id, target: sent }, 'Connected image + inbox notice sent');
          return;
        }
        throw new Error('No valid WhatsApp self-chat target was available.');
      } catch (err) {
        logger.warn({ err, sessionId: this.id, attempt: attempt + 1 }, 'Connected notice attempt failed');
        if (!this.connectedNoticeSent && attempt < delays.length - 1 && expectedGeneration === this.generation && this.state.status === 'connected') {
          this.#scheduleConnectedNotice(sock, expectedGeneration, attempt + 1);
        }
      }
    }, delay);
    this.connectedNoticeTimer.unref?.();
  }

  async #sendConnectedNoticeNow(sock, expectedGeneration) {
    if (expectedGeneration !== this.generation || this.sock !== sock || this.state.status !== 'connected') return '';
    const resolved = await resolveOwnPhoneJid(
      sock,
      this.state.user?.id || sock.user?.id || '',
      this.state.user?.lid || sock.user?.lid || '',
      this.claimedPhone || (this.isMain ? config.ownerNumber : '')
    );
    const phone = this.claimedPhone || (isPnJid(resolved) ? bareNumber(resolved) : '') || (this.isMain ? config.ownerNumber : '');
    const candidates = [];
    const add = (jid) => {
      const clean = cleanJid(jid || '');
      if (clean && !candidates.includes(clean)) candidates.push(clean);
    };
    if (phone) add(`${String(phone).replace(/\D/g, '')}@s.whatsapp.net`);
    if (this.isMain) add(ownerJid());
    add(resolved);
    add(sock.user?.id);
    add(sock.user?.lid);
    if (!candidates.length) return '';

    const settings = db.session(this.id);
    const prefix = settings.prefix || config.prefix;
    const caption = [
      ...connectedBox('WHATSAPP LINKED', [
        `┃ ✅ STATUS  ONLINE`,
        `┃ 🤖 BOT     ${config.shortName}`,
        `┃ 🔗 SESSION ${this.label}`,
        `┃ 📞 NUMBER  +${String(phone || bareNumber(resolved) || '').replace(/\D/g, '')}`,
        `┃ 🏷️ VERSION V${config.version}`
      ], '✅'),
      '',
      ...connectedBox('QUICK START', connectedQuickStartRows(prefix), '🚀'),
      '',
      ...connectedBox('HOST NOTE', [
        '┃ 🔒 Credentials stay on bot host',
        '┃ ⚡ Keep server online for reconnect'
      ], '🛡️'),
      '',
      ...connectedFooterBlock()
    ].join('\n');

    let image = null;
    try { ({ buffer: image } = await readMenuCard()); }
    catch (err) { logger.warn({ err, sessionId: this.id }, 'Connected notice image could not be read'); }

    let lastError = null;
    for (const target of candidates) {
      if (expectedGeneration !== this.generation || this.sock !== sock || this.state.status !== 'connected') return '';
      try {
        if (image) await sock.sendMessage(target, { image, caption });
        else await sock.sendMessage(target, { text: caption });
        return target;
      } catch (err) {
        lastError = err;
        logger.warn({ err, sessionId: this.id, target }, 'Connected notice target failed; trying fallback');
      }
    }
    if (lastError) throw lastError;
    return '';
  }

  #scheduleReconnect(expectedGeneration, overrideDelay) {
    if (this.reconnectTimer || expectedGeneration !== this.generation || this.disabled) return;
    this.reconnectAttempt += 1;
    const baseDelay = Math.min(120_000, 5000 * (2 ** Math.min(this.reconnectAttempt - 1, 5)));
    const jitter = Math.floor(Math.random() * 1500);
    const delay = overrideDelay ?? (baseDelay + jitter);
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      if (expectedGeneration !== this.generation || this.disabled) return;
      try { await this.start(); }
      catch (err) { logger.error({ err, sessionId: this.id }, 'Reconnect failed'); this.#scheduleReconnect(this.generation); }
    }, delay);
    this.reconnectTimer.unref?.();
  }

  async #waitForPairingReady(timeoutMs = 15_000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (this.state.qr || this.state.status === 'connected') return;
      if (!this.sock) throw new Error('WhatsApp socket closed before pairing became ready.');
      await sleep(250);
    }
  }

  async requestPairingCode(phoneNumber) {
    if (this.pairRequest) throw new Error('A pairing request is already in progress. Wait a moment and try again.');
    const phone = String(phoneNumber || '').replace(/[^0-9]/g, '');
    if (phone.length < 8 || phone.length > 15) throw new Error('Enter a valid WhatsApp number with country code, digits only.');
    if (this.state.status === 'connected') throw new Error('This bot session is already connected.');
    if (this.authState?.creds?.registered) throw new Error('A saved WhatsApp session already exists. Reset it before pairing another account.');
    this.pairRequest = (async () => {
      if (!this.sock || !ACTIVE_STATES.has(this.state.status)) await this.start();
      await this.#waitForPairingReady();
      if (typeof this.sock?.requestPairingCode !== 'function') throw new Error('Pairing-code API is unavailable. Use QR pairing instead.');
      const code = await this.sock.requestPairingCode(phone);
      this.claimedPhone = phone;
      this.state.pairCode = String(code || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
      this.state.pairCodeCreatedAt = new Date().toISOString();
      this.state.pairingPhoneMasked = maskPhone(phone);
      this.state.status = 'pair_code_ready';
      clearTimeout(this.pairCodeTimer);
      this.pairCodeTimer = setTimeout(() => {
        if (this.state.status === 'pair_code_ready') this.state.status = this.state.qr ? 'waiting_for_pair' : 'connecting';
        this.state.pairCode = null;
        this.state.pairCodeCreatedAt = null;
        this.state.pairingPhoneMasked = null;
        this.pairCodeTimer = null;
      }, 120_000);
      this.pairCodeTimer.unref?.();
      return this.state.pairCode;
    })();
    try { return await this.pairRequest; } finally { this.pairRequest = null; }
  }

  async applyProfileBranding() {
    if (!this.sock || this.state.status !== 'connected') throw new Error('Connect this WhatsApp session first.');
    const results = { name: false, bio: false, avatar: false, errors: [] };
    try { await this.sock.updateProfileName(config.botName); results.name = true; } catch (err) { results.errors.push(`name: ${err?.message || err}`); }
    try { await this.sock.updateProfileStatus(`${config.footerText} • ${config.shortName}`.slice(0, 139)); results.bio = true; } catch (err) { results.errors.push(`bio: ${err?.message || err}`); }
    try { await this.sock.updateProfilePicture(this.sock.user?.id, { url: config.avatarPath }); results.avatar = true; } catch (err) { results.errors.push(`avatar: ${err?.message || err}`); }
    return results;
  }

  async stop() {
    this.disabled = true;
    ++this.generation;
    clearTimeout(this.reconnectTimer);
    clearTimeout(this.pairCodeTimer);
    clearTimeout(this.connectedNoticeTimer);
    this.reconnectTimer = null;
    this.pairCodeTimer = null;
    this.connectedNoticeTimer = null;
    const old = this.sock;
    this.sock = null;
    try { old?.end?.(new Error('Session stopped')); } catch {}
    this.state.status = 'stopped';
    this.onStatus?.(this);
  }

  async logoutAndReset({ restart = true } = {}) {
    this.disabled = true;
    ++this.generation;
    clearTimeout(this.reconnectTimer);
    clearTimeout(this.pairCodeTimer);
    clearTimeout(this.connectedNoticeTimer);
    this.reconnectTimer = null;
    this.pairCodeTimer = null;
    this.connectedNoticeTimer = null;
    this.pairRequest = null;
    const old = this.sock;
    this.sock = null;
    try { await old?.logout?.(); } catch (err) { logger.warn({ err, sessionId: this.id }, 'WhatsApp logout returned an error'); }
    await fs.rm(this.sessionDir, { recursive: true, force: true });
    this.authState = null;
    this.connectedNoticeSent = false;
    this.state = this.#freshState('stopped');
    if (restart) { this.disabled = false; return this.start(); }
  }

  async reconnectNow() {
    ++this.generation;
    clearTimeout(this.reconnectTimer);
    clearTimeout(this.connectedNoticeTimer);
    this.reconnectTimer = null;
    this.connectedNoticeTimer = null;
    this.pairRequest = null;
    const old = this.sock;
    this.sock = null;
    try { old?.end?.(new Error('Manual reconnect')); } catch {}
    this.state.status = 'restarting';
    this.disabled = false;
    return this.start();
  }
}

class MultiWhatsAppManager {
  constructor() {
    this.instances = new Map();
    this.main = this.#createInstance({ id: 'main', sessionDir: config.sessionDir, claimedPhone: config.ownerNumber, label: 'Owner Session', isMain: true });
  }

  get sock() { return this.main.sock; }
  get state() { return this.main.state; }
  snapshot() { return this.main.snapshot(); }
  getSocket(sessionId = 'main') { return this.instances.get(sessionId)?.sock || null; }
  getInstance(sessionId = 'main') { return this.instances.get(sessionId) || null; }

  #createInstance(opts) {
    const inst = new WhatsAppInstance({
      ...opts,
      onConnected: async (instance) => {
        if (instance.id !== 'main') {
          const meta = db.data.linkedSessions[instance.id];
          if (meta) {
            meta.linkedNumber = bareNumber(instance.state.user?.id || '') || meta.phone || '';
            meta.linkedName = instance.state.user?.name || '';
            meta.lastConnectedAt = new Date().toISOString();
            meta.lastStatus = 'connected';
            await db.save();
          }
        }
      },
      onStatus: (instance) => {
        if (instance.id !== 'main' && db.data.linkedSessions?.[instance.id]) {
          db.data.linkedSessions[instance.id].lastStatus = instance.state.status;
          db.data.linkedSessions[instance.id].lastActiveAt = new Date().toISOString();
          db.save().catch(() => {});
        }
      }
    });
    this.instances.set(opts.id, inst);
    return inst;
  }

  async start() {
    await fs.mkdir(config.multiSessionDir, { recursive: true });
    await this.main.start();
    await this.restoreSavedSessions();
    return this.main.sock;
  }

  async restoreSavedSessions() {
    const rows = Object.entries(db.data.linkedSessions || {}).filter(([, m]) => m?.enabled !== false).slice(0, config.multi.maxSessions);
    for (const [id, meta] of rows) {
      const dir = path.join(config.multiSessionDir, id);
      if (!(await registeredAuth(dir))) continue;
      if (this.instances.has(id)) continue;
      const inst = this.#createInstance({ id, sessionDir: dir, claimedPhone: meta.linkedNumber || meta.phone || '', label: meta.label || 'Linked User' });
      inst.start().catch((err) => logger.error({ err, sessionId: id }, 'Saved multi-session start failed'));
      await sleep(250);
    }
  }

  verifySessionToken(id, token) {
    const meta = db.data.linkedSessions?.[id];
    if (!meta?.tokenHash || !token) return false;
    const a = Buffer.from(meta.tokenHash);
    const b = Buffer.from(hashToken(token));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  async createPublicSession({ phone, label, ttlDays = config.multi.defaultTtlDays }) {
    if (!config.multi.enabled) throw new Error('Public multi-linking is disabled by the owner.');
    const digits = String(phone || '').replace(/\D/g, '');
    if (digits.length < 8 || digits.length > 15) throw new Error('Enter a valid WhatsApp number with country code.');
    if (digits === String(config.ownerNumber || '').replace(/\D/g, '')) throw new Error('This number is already reserved for the owner session.');
    const current = Object.values(db.data.linkedSessions || {}).filter((m) => m?.enabled !== false).length;
    if (current >= config.multi.maxSessions) throw new Error(`Server session limit reached (${config.multi.maxSessions}).`);
    const duplicate = Object.entries(db.data.linkedSessions || {}).find(([, m]) => m?.enabled !== false && [m.phone, m.linkedNumber].includes(digits));
    if (duplicate) throw new Error('This number already has a session on this A-X-HK server.');

    const id = `ax_${crypto.randomBytes(7).toString('hex')}`;
    const token = crypto.randomBytes(32).toString('base64url');
    const ttl = Math.max(0, Math.min(3650, Number(ttlDays) || 0));
    db.data.linkedSessions[id] = {
      id, label: safeLabel(label) || `A-X-HK ${digits.slice(-4)}`, phone: digits,
      tokenHash: hashToken(token), createdAt: new Date().toISOString(), lastActiveAt: new Date().toISOString(),
      lastStatus: 'starting', enabled: true, expiresAt: ttl > 0 ? new Date(Date.now() + ttl * 86400000).toISOString() : null
    };
    db.session(id);
    await db.save();
    const inst = this.#createInstance({ id, sessionDir: path.join(config.multiSessionDir, id), claimedPhone: digits, label: db.data.linkedSessions[id].label });
    await inst.start();
    return { id, token, label: inst.label, phoneMasked: maskPhone(digits) };
  }

  async ensurePublicSession(id) {
    const meta = db.data.linkedSessions?.[id];
    if (!meta || meta.enabled === false) throw new Error('Session not found.');
    let inst = this.instances.get(id);
    const created = !inst;
    if (!inst) inst = this.#createInstance({ id, sessionDir: path.join(config.multiSessionDir, id), claimedPhone: meta.linkedNumber || meta.phone || '', label: meta.label || 'Linked User' });

    // Read-only portal polling must not compete with the socket's own reconnect timer.
    // It used to call start() whenever a disconnected socket had been nulled, which could
    // race the scheduled reconnect and cause visible connected/disconnected flapping.
    if (created) await inst.start();
    else if (!inst.sock && !ACTIVE_STATES.has(inst.state.status) && !inst.reconnectTimer && !['logged_out', 'stopped'].includes(inst.state.status)) await inst.start();
    return inst;
  }

  async requestPairingCode(phone, sessionId = 'main') {
    const inst = sessionId === 'main' ? this.main : await this.ensurePublicSession(sessionId);
    return inst.requestPairingCode(phone);
  }
  async applyProfileBranding(sessionId = 'main') {
    const inst = sessionId === 'main' ? this.main : await this.ensurePublicSession(sessionId);
    return inst.applyProfileBranding();
  }
  async logoutAndReset(sessionId = 'main') {
    const inst = sessionId === 'main' ? this.main : await this.ensurePublicSession(sessionId);
    return inst.logoutAndReset({ restart: true });
  }
  async reconnectNow(sessionId = 'main') {
    const inst = sessionId === 'main' ? this.main : await this.ensurePublicSession(sessionId);
    return inst.reconnectNow();
  }

  async stopAll() {
    const rows = [...this.instances.values()];
    await Promise.allSettled(rows.map((inst) => inst.stop()));
  }

  listSessions() {
    const extra = Object.entries(db.data.linkedSessions || {}).map(([id, meta]) => {
      const inst = this.instances.get(id);
      const snap = inst?.snapshot();
      return {
        id, label: meta.label, phoneMasked: maskPhone(meta.linkedNumber || meta.phone || ''), createdAt: meta.createdAt, expiresAt: meta.expiresAt || null,
        lastActiveAt: meta.lastActiveAt, status: snap?.status || meta.lastStatus || 'offline', connected: snap?.status === 'connected' && snap?.sessionRegistered,
        linkedName: snap?.user?.name || meta.linkedName || null, enabled: meta.enabled !== false
      };
    });
    return [{ id: 'main', label: 'Owner Session', phoneMasked: maskPhone(config.ownerNumber), createdAt: null, status: this.main.state.status, connected: this.main.state.status === 'connected' && Boolean(this.main.authState?.creds?.registered), linkedName: this.main.state.user?.name || null, enabled: true, isMain: true }, ...extra];
  }

  async removePublicSession(id) {
    if (!id || id === 'main') throw new Error('The owner session cannot be removed here.');
    const meta = db.data.linkedSessions?.[id];
    if (!meta) throw new Error('Session not found.');
    let inst = this.instances.get(id);
    if (!inst) {
      try { inst = await this.ensurePublicSession(id); } catch {}
    }
    if (inst) {
      await inst.logoutAndReset({ restart: false }).catch(() => {});
      this.instances.delete(id);
    }
    await fs.rm(path.join(config.multiSessionDir, id), { recursive: true, force: true });
    delete db.data.linkedSessions[id];
    delete db.data.sessions[id];
    delete db.data.sessionAutoReplies[id];
    await db.save();
  }
}

export const waManager = new MultiWhatsAppManager();
