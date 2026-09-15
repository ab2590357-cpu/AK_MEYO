import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { db } from '../core/database.js';
import { logger } from '../core/logger.js';
import { config } from '../config.js';
import { cleanJid } from '../utils/text.js';
import { unwrapMessage, extractText } from '../utils/message.js';

const STATUS_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_STATUS_ROWS = 50;
const statusBuckets = new Map();
const autoStatusReplyDedupe = new Set();
const statusAutoAt = new Map();

function bucketKey(sessionId = 'main') {
  return String(sessionId || 'main');
}

function prune(sessionId = 'main', now = Date.now()) {
  const key = bucketKey(sessionId);
  const rows = (statusBuckets.get(key) || []).filter((row) => row?.at && now - row.at < STATUS_TTL_MS);
  statusBuckets.set(key, rows.slice(0, MAX_STATUS_ROWS));
}

function statusSender(msg = {}) {
  return cleanJid(msg?.key?.participant || msg?.participant || msg?.message?.senderKeyDistributionMessage?.groupId || '');
}

function mediaInfo(message = {}) {
  const m = unwrapMessage(message || {});
  if (m.imageMessage) return { type: 'image', mimetype: m.imageMessage.mimetype || 'image/jpeg' };
  if (m.videoMessage) return { type: 'video', mimetype: m.videoMessage.mimetype || 'video/mp4' };
  if (m.audioMessage) return { type: 'audio', mimetype: m.audioMessage.mimetype || 'audio/ogg', ptt: Boolean(m.audioMessage.ptt) };
  return null;
}

function rowTitle(row = {}) {
  const sender = row.sender ? `@${row.sender.split('@')[0]}` : 'Unknown';
  const kind = row.kind ? row.kind.toUpperCase() : 'TEXT';
  const when = new Date(row.at || Date.now()).toLocaleString('en-GB', { timeZone: config.timezone, hour12: false });
  return { sender, kind, when };
}

function premiumStatusCaption(row = {}) {
  const info = rowTitle(row);
  return [
    '╭━━━〔 📲 A-X-HK STATUS SAVE 📲 〕━━━╮',
    `┃ 👤 SOURCE  ${info.sender}`,
    `┃ 🎞️ TYPE    ${info.kind}`,
    `┃ 🕒 TIME    ${info.when}`,
    '╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
    row.text ? `\n${String(row.text).slice(0, 900)}\n` : '',
    config.footerMessage
  ].filter(Boolean).join('\n');
}

export function rememberStatusMessage(sessionId = 'main', msg = {}) {
  if (msg?.key?.remoteJid !== 'status@broadcast' || msg?.key?.fromMe) return false;
  const sender = statusSender(msg);
  if (!sender) return false;
  const key = bucketKey(sessionId);
  prune(sessionId);
  const rows = statusBuckets.get(key) || [];
  const id = String(msg?.key?.id || `${Date.now()}`);
  const existing = rows.findIndex((row) => row.id === id && row.sender === sender);
  const media = mediaInfo(msg.message || {});
  const row = {
    id,
    at: Date.now(),
    sender,
    kind: media?.type || 'text',
    mimetype: media?.mimetype || '',
    ptt: Boolean(media?.ptt),
    text: extractText(msg) || '',
    msg
  };
  if (existing >= 0) rows.splice(existing, 1);
  rows.unshift(row);
  statusBuckets.set(key, rows.slice(0, MAX_STATUS_ROWS));
  return true;
}

export function recentStatuses(sessionId = 'main') {
  prune(sessionId);
  return [...(statusBuckets.get(bucketKey(sessionId)) || [])];
}

export function statusListText(sessionId = 'main') {
  const rows = recentStatuses(sessionId);
  if (!rows.length) return `No recent statuses are cached yet. Turn on ${config.prefix}statusseen on or wait for a contact status update.`;
  const body = rows.slice(0, 20).map((row, index) => {
    const info = rowTitle(row);
    const text = row.text ? ` • ${row.text.replace(/\s+/g, ' ').slice(0, 50)}` : '';
    return `┃ ${String(index + 1).padStart(2, '0')}. ${info.sender} • ${info.kind}${text}`;
  });
  return [
    '╭━━━〔 📲 A-X-HK STATUS VAULT 📲 〕━━━╮',
    `┃ 🧩 CACHED  ${rows.length}`,
    `┃ ⏳ TTL     24 hours`,
    `┃ 📥 SAVE    ${config.prefix}statussave 1`,
    '╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
    '',
    '╭━━━〔 RECENT STATUS 〕━━━╮',
    ...body,
    '╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
    '',
    config.footerMessage
  ].join('\n');
}

export async function sendStatusByIndex(sock, chat, sessionId = 'main', index = 1, options = {}) {
  const rows = recentStatuses(sessionId);
  const row = rows[Math.max(0, Number(index || 1) - 1)];
  if (!row) throw new Error('No cached status found for that number. Use .statuslist first.');
  const quoted = options.quoted;
  const caption = premiumStatusCaption(row);
  try {
    await sock.sendMessage(chat, { forward: row.msg, force: true }, quoted ? { quoted } : {});
    await sock.sendMessage(chat, { text: caption }, quoted ? { quoted } : {});
    return row;
  } catch (err) {
    logger.warn({ err }, 'Forwarding cached status failed; trying media download fallback');
  }
  if (row.kind === 'text') {
    await sock.sendMessage(chat, { text: row.text || caption }, quoted ? { quoted } : {});
    return row;
  }
  const buffer = await downloadMediaMessage(row.msg, 'buffer', {}, { logger, reuploadRequest: sock.updateMediaMessage });
  if (!buffer) throw new Error('Status media could not be downloaded. It may have expired.');
  const payload = { mimetype: row.mimetype || undefined };
  if (row.kind === 'image') Object.assign(payload, { image: buffer, caption });
  else if (row.kind === 'video') Object.assign(payload, { video: buffer, caption });
  else if (row.kind === 'audio') Object.assign(payload, { audio: buffer, ptt: row.ptt });
  else Object.assign(payload, { document: buffer, fileName: `A-X-HK-status-${Date.now()}`, caption });
  await sock.sendMessage(chat, payload, quoted ? { quoted } : {});
  return row;
}

export async function handleIncomingStatus(sock, msg, sessionId = 'main') {
  const settings = db.session(sessionId);
  rememberStatusMessage(sessionId, msg);
  if (msg.key?.fromMe) return;

  const sender = statusSender(msg);
  const now = Date.now();
  const cooldownMs = Math.max(30, Math.min(900, Number(settings.statusCooldownSeconds || 90))) * 1000;
  const key = `${sessionId}:${sender || 'unknown'}`;
  const allowed = now - (statusAutoAt.get(key) || 0) >= cooldownMs;

  if (settings.statusSeen) sock.readMessages([msg.key]).catch(() => {});

  if (allowed && settings.statusReact) {
    const emoji = String(settings.statusReactEmoji || '❤️').trim().slice(0, 16) || '❤️';
    statusAutoAt.set(key, now);
    sock.sendMessage('status@broadcast', { react: { text: emoji, key: msg.key } }).catch((err) => logger.warn({ err }, 'Status reaction failed'));
  }

  if (allowed && settings.statusReply) {
    const id = `${sessionId}:${sender}:${msg?.key?.id || ''}`;
    if (sender && !autoStatusReplyDedupe.has(id)) {
      autoStatusReplyDedupe.add(id);
      statusAutoAt.set(key, now);
      const text = String(settings.statusReplyText || `✨ ${config.shortName} saw your status.

${config.footerMessage}`).slice(0, 1200);
      sock.sendMessage(sender, { text }, { quoted: msg }).catch((err) => logger.warn({ err, sender }, 'Status auto reply failed'));
      if (autoStatusReplyDedupe.size > 1000) autoStatusReplyDedupe.clear();
      if (statusAutoAt.size > 1000) statusAutoAt.clear();
    }
  }
}
