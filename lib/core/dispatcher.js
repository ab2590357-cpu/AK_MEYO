import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { Sticker, StickerTypes } from 'wa-sticker-formatter';
import { config } from '../config.js';
import { db } from './database.js';
import { commandsByCategory, getCommand } from './registry.js';
import { checkBurst, checkCooldown } from './rate-limit.js';
import { logger } from './logger.js';
import { buildContext, isKnownBotOutbound } from './context.js';
import { rememberChatMessage, recentChatMessages } from '../services/chat-history.js';
import { askAI } from '../services/ai.js';
import { rememberRecentImage } from '../services/recent-media.js';
import { mentionedJids, unwrapMessage } from '../utils/message.js';
import { cleanJid } from '../utils/text.js';
import { synthesizeFreeTTS } from '../services/voice-studio.js';
import { commandPermissionState, safetyLimitState } from '../services/safety-control.js';
import { trackGroupActivity, trackGroupCommand } from '../services/group-analytics.js';

function parseCommand(text, prefix) {
  if (!text.startsWith(prefix)) return null;
  const body = text.slice(prefix.length).trim();
  if (!body) return null;
  let [name, ...args] = body.split(/\s+/);
  name = name.toLowerCase();
  const lower = args.map((v) => String(v).toLowerCase());

  // Friendly phrase aliases: users often type these controls with spaces.
  if (name === 'menu' && ['dp', 'image', 'photo'].includes(lower[0])) {
    name = 'menudp';
    args = args.slice(1);
  } else if (name === 'auto' && lower[0] === 'ai') {
    name = 'autoai';
    args = args.slice(1);
  } else if (name === 'auto' && lower[0] === 'react') {
    name = 'autoreact';
    args = args.slice(1);
  } else if (name === 'anti' && lower[0] === 'delete') {
    name = 'antidelete';
    args = lower[1] === 'message' ? args.slice(2) : args.slice(1);
  } else if (['youtube', 'yt'].includes(name) && lower[0] === 'search') {
    name = 'ytsearch';
    args = args.slice(1);
  } else if (['youtube', 'yt'].includes(name) && ['audio', 'mp3'].includes(lower[0])) {
    name = 'ytaudio';
    args = args.slice(1);
  } else if (['youtube', 'yt'].includes(name) && ['video', 'mp4'].includes(lower[0])) {
    name = 'video';
    args = args.slice(1);
  } else if (name === 'tiktok' && lower[0] === 'search') {
    name = 'tiktoksearch';
    args = args.slice(1);
  } else if (name === 'tiktok' && ['profile', 'user', 'id'].includes(lower[0])) {
    name = 'tiktokprofile';
    args = args.slice(1);
  } else if (name === 'snapchat' && lower[0] === 'search') {
    name = 'snapsearch';
    args = args.slice(1);
  } else if (name === 'snapchat' && ['profile', 'user', 'id'].includes(lower[0])) {
    name = 'snapprofile';
    args = args.slice(1);
  } else if (name === 'search' && ['youtube', 'yt'].includes(lower[0])) {
    name = 'ytsearch';
    args = args.slice(1);
  } else if (name === 'search' && ['tiktok', 'tt'].includes(lower[0])) {
    name = 'tiktoksearch';
    args = args.slice(1);
  } else if (name === 'search' && ['snapchat', 'snap'].includes(lower[0])) {
    name = 'snapsearch';
    args = args.slice(1);
  } else if (name === 'search' && ['x', 'twitter'].includes(lower[0])) {
    name = 'xsearch';
    args = args.slice(1);
  } else if (name === 'search' && ['img', 'image', 'images', 'photo', 'photos'].includes(lower[0])) {
    name = 'img';
    args = args.slice(1);
  } else if (name === 'google' && ['img', 'image', 'images', 'photo', 'photos'].includes(lower[0])) {
    name = 'img';
    args = args.slice(1);
  } else if (name === 'google' && ['video', 'videos', 'vid'].includes(lower[0])) {
    name = 'googlevideo';
    args = args.slice(1);
  }
  return { name, args, argText: args.join(' ') };
}


const CATEGORY_COMMAND_ALIASES = {
  downloads: 'download', downloader: 'download', dl: 'download',
  sticker: 'media', stickers: 'media', image: 'media', images: 'media', gif: 'media',
  games: 'games', game: 'games', groups: 'group', group: 'group',
  tool: 'tools', tools: 'tools', utility: 'utility', utilities: 'utility', util: 'utility',
  owner: 'owner', owners: 'owner', admin: 'group', admins: 'group',
  ai: 'ai', fun: 'fun', search: 'search', media: 'media', download: 'download'
};

function categoryForBareCommand(name) {
  const grouped = commandsByCategory();
  const key = String(name || '').toLowerCase();
  if (grouped[key]) return key;
  const mapped = CATEGORY_COMMAND_ALIASES[key];
  return mapped && grouped[mapped] ? mapped : '';
}

const DEFAULT_REACTIONS = ['❤️', '🔥', '👍', '😂', '✨'];
const autoReplyAt = new Map();
const xpAt = new Map();
const autoFeatureAt = new Map();

function hhmmInZone(zone) {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: zone || config.timezone,
      hour: '2-digit', minute: '2-digit', hour12: false
    }).formatToParts(new Date());
    const h = parts.find((p) => p.type === 'hour')?.value || '00';
    const m = parts.find((p) => p.type === 'minute')?.value || '00';
    return `${h}:${m}`;
  } catch { return '00:00'; }
}

function isQuiet(settings) {
  const q = settings?.quietHours;
  if (!q?.enabled || !q.start || !q.end) return false;
  const now = hhmmInZone(config.timezone);
  if (q.start === q.end) return true;
  return q.start < q.end ? (now >= q.start && now < q.end) : (now >= q.start || now < q.end);
}

function aiPersonaPrompt(value = 'default') {
  const persona = String(value || 'default').toLowerCase();
  const map = {
    default: 'Use a concise, helpful and natural WhatsApp tone.',
    professional: 'Use a concise, professional and polished business tone.',
    friendly: 'Use a warm, friendly and natural conversational tone without overdoing emojis.',
    short: 'Keep the reply extremely short and direct unless more detail is essential.',
    urdu: 'Reply in clear Urdu script unless the user clearly asks for another language.',
    roman: 'Reply in natural Roman Urdu / Roman English, matching the user style.'
  };
  return map[persona] || map.default;
}

function reactionRuleEmoji(settings, text) {
  const rules = settings?.reactionRules || {};
  const lower = String(text || '').toLowerCase();
  for (const [word, emoji] of Object.entries(rules)) {
    if (word && lower.includes(String(word).toLowerCase())) return String(emoji || '').slice(0, 16);
  }
  return '';
}

async function maybeDirectAutomation(ctx) {
  if (ctx.msg.key?.fromMe || isQuiet(ctx.sessionSettings)) return false;
  const key = `${ctx.sessionId}:${ctx.chat}`;
  const now = Date.now();
  const last = autoReplyAt.get(key) || 0;
  const afk = ctx.sessionSettings.afk;
  const away = ctx.sessionSettings.away;

  if (!ctx.isGroup && (afk?.enabled || away?.enabled) && now - last > 30 * 60 * 1000) {
    autoReplyAt.set(key, now);
    const text = afk?.enabled
      ? `💤 AFK • ${afk.reason || 'Away for a while'}`
      : `📨 ${away.text || 'I am currently away.'}`;
    await ctx.reply(`${text}\n\n${config.footerMessage}`);
    return true;
  }

  const botRefs = [ctx.botJid, ctx.sock.user?.id, ctx.sock.user?.lid].map(cleanJid).filter(Boolean);
  const wasMentioned = ctx.isGroup && mentionedJids(ctx.msg).map(cleanJid).some((jid) => botRefs.includes(jid));
  const privateAI = !ctx.isGroup && (ctx.sessionSettings.autoAI || ctx.sessionSettings.smartReplyChats?.[ctx.chat]);
  const groupAI = ctx.isGroup && ctx.sessionSettings.autoAI && wasMentioned;

  const aiCooldownMs = Math.max(5, Math.min(120, Number(ctx.sessionSettings.aiCooldownSeconds || 15))) * 1000;

  if ((privateAI || groupAI) && now - last > aiCooldownMs) {
    try {
      const historyLimit = Math.max(4, Math.min(24, Number(ctx.sessionSettings.aiHistoryLimit || (ctx.isGroup ? 16 : 12))));
      const rows = recentChatMessages(ctx.sessionId, ctx.chat, historyLimit);
      const history = rows.map((r) => {
        const who = r.fromMe ? 'Me' : (ctx.isGroup ? `Member ${String(r.sender || '').replace(/@.*/, '').slice(-6)}` : 'Them');
        return `${who}: ${r.text}`;
      }).join('\n');
      const instruction = ctx.isGroup
        ? 'You were directly mentioned in a WhatsApp group. Reply only to the latest relevant message. Do not respond to unrelated group chatter and do not claim actions you did not perform.'
        : 'You are replying on behalf of the linked WhatsApp user. Give one natural reply to the latest message. Do not claim actions you did not perform.';
      const persona = aiPersonaPrompt(ctx.sessionSettings.aiPersona);
      const aiReply = await askAI(`${instruction}\n${persona}\nConversation:\n${history}`, ctx.senderNumber, {
        temperature: 0.4, maxChars: 1200,
        fallbackModels: Array.isArray(ctx.sessionSettings.aiFallbackModels) ? ctx.sessionSettings.aiFallbackModels : []
      });
      autoReplyAt.set(key, now);
      await ctx.reply(aiReply);
      rememberChatMessage({ sessionId: ctx.sessionId, chat: ctx.chat, sender: ctx.botJid, fromMe: true, text: aiReply });
      return true;
    } catch (err) {
      logger.warn({ err, sessionId: ctx.sessionId }, 'Auto AI reply skipped');
    }
  }
  return false;
}

function maybeAwardXp(ctx) {
  if (!ctx.isGroup || !ctx.groupSettings?.xpEnabled || ctx.msg.key?.fromMe) return;
  const key = `${ctx.sessionId}:${ctx.chat}:${ctx.sender}`;
  const now = Date.now();
  if (now - (xpAt.get(key) || 0) < 60_000) return;
  xpAt.set(key, now);
  const row = db.xpBucket(ctx.sessionId, ctx.chat, ctx.sender);
  row.xp = (row.xp || 0) + 5 + Math.floor(Math.random() * 6);
  row.messages = (row.messages || 0) + 1;
  row.lastAt = now;
}

function autoFeatureAllowed(ctx, key, minSeconds = 45) {
  const mapKey = `${ctx.sessionId}:${ctx.chat}:${key}`;
  const now = Date.now();
  const wait = Math.max(20, Math.min(600, Number(ctx.sessionSettings.autoFeatureCooldownSeconds || minSeconds))) * 1000;
  if (now - (autoFeatureAt.get(mapKey) || 0) < wait) return false;
  autoFeatureAt.set(mapKey, now);
  if (autoFeatureAt.size > 2000) autoFeatureAt.clear();
  return true;
}

function mediaKind(message = {}) {
  const m = unwrapMessage(message || {});
  if (m.imageMessage) return { kind: 'image', mimetype: m.imageMessage.mimetype || 'image/jpeg' };
  if (m.videoMessage) return { kind: 'video', mimetype: m.videoMessage.mimetype || 'video/mp4' };
  if (m.stickerMessage) return { kind: 'sticker', mimetype: m.stickerMessage.mimetype || 'image/webp' };
  return null;
}

async function maybeAutoSticker(ctx, sock, msg) {
  if (!ctx.sessionSettings.autoSticker || !autoFeatureAllowed(ctx, 'sticker')) return;
  const info = mediaKind(msg.message || {});
  if (!info || !['image', 'sticker'].includes(info.kind)) return;
  try {
    const buffer = await downloadMediaMessage(msg, 'buffer', {}, { logger, reuploadRequest: sock.updateMediaMessage });
    if (!buffer?.length || buffer.length > 8 * 1024 * 1024) return;
    const saved = ctx.sessionSettings.stickerPack || {};
    const sticker = new Sticker(buffer, {
      pack: saved.pack || config.shortName,
      author: saved.author || config.ownerName,
      type: StickerTypes.FULL,
      quality: 60
    });
    await sock.sendMessage(ctx.chat, { sticker: await sticker.toBuffer() }, { quoted: msg }).catch(() => {});
  } catch (err) { logger.warn({ err, sessionId: ctx.sessionId }, 'Auto sticker skipped'); }
}

async function maybeAutoVoice(ctx, sock, msg) {
  if (!ctx.sessionSettings.autoVoice || !ctx.text || ctx.text.startsWith(ctx.prefix) || !autoFeatureAllowed(ctx, 'voice')) return;
  const text = String(ctx.sessionSettings.autoVoiceText || `A-X-HK received your message. ${config.ownerName} will reply soon.`).slice(0, 220);
  try {
    const audio = await synthesizeFreeTTS(text, { lang: /[\u0600-\u06FF]/.test(text) ? 'ur' : 'en' });
    await sock.sendMessage(ctx.chat, { audio, mimetype: 'audio/mpeg', ptt: false, fileName: 'A-X-HK-auto-voice.mp3' }, { quoted: msg }).catch(() => {});
  } catch (err) { logger.warn({ err, sessionId: ctx.sessionId }, 'Auto voice skipped'); }
}

function applyAutoFeatures(ctx, sock, msg) {
  if (msg.key?.fromMe) return;
  const settings = ctx.sessionSettings;
  if (isQuiet(settings)) return;
  if (settings.autoRead) sock.readMessages([msg.key]).catch(() => {});
  if (settings.alwaysOnline && typeof sock.sendPresenceUpdate === 'function') sock.sendPresenceUpdate('available', ctx.chat).catch(() => {});

  const ruleEmoji = reactionRuleEmoji(settings, ctx.text);
  if ((ruleEmoji || settings.autoReact) && autoFeatureAllowed(ctx, 'react', 30)) {
    const choices = Array.isArray(settings.autoReactEmojis) && settings.autoReactEmojis.length
      ? settings.autoReactEmojis.slice(0, 10)
      : DEFAULT_REACTIONS;
    const emoji = ruleEmoji || choices[Math.floor(Math.random() * choices.length)] || '❤️';
    sock.sendMessage(ctx.chat, { react: { text: emoji, key: msg.key } }).catch(() => {});
  }

  const presence = settings.autoRecording ? 'recording' : (settings.autoTyping ? 'composing' : null);
  if (presence && autoFeatureAllowed(ctx, 'presence', 30) && typeof sock.sendPresenceUpdate === 'function') {
    sock.sendPresenceUpdate(presence, ctx.chat).catch(() => {});
    const timer = setTimeout(() => sock.sendPresenceUpdate('paused', ctx.chat).catch(() => {}), 1400);
    timer.unref?.();
  }

  maybeAutoSticker(ctx, sock, msg).catch(() => {});
  maybeAutoVoice(ctx, sock, msg).catch(() => {});
}

function extractDomains(text = '') {
  const found = new Set();
  const re = /(?:https?:\/\/)?(?:www\.)?([a-z0-9-]+(?:\.[a-z0-9-]+)+)(?:\/[^\s]*)?/gi;
  for (const match of String(text || '').matchAll(re)) {
    const host = String(match[1] || '').toLowerCase().replace(/^www\./, '');
    if (host && !host.endsWith('whatsapp.net')) found.add(host);
  }
  if (/chat\.whatsapp\.com\//i.test(text)) found.add('chat.whatsapp.com');
  if (/wa\.me\//i.test(text)) found.add('wa.me');
  return [...found];
}

function domainAllowed(domains, allowed = []) {
  const rows = Array.isArray(allowed) ? allowed.map((d) => String(d || '').toLowerCase().replace(/^www\./, '')) : [];
  return domains.some((host) => rows.some((ok) => host === ok || host.endsWith(`.${ok}`)));
}

function badWordMatch(text = '', words = []) {
  const lower = String(text || '').toLowerCase();
  for (const word of Array.isArray(words) ? words : []) {
    const w = String(word || '').toLowerCase().trim();
    if (!w) continue;
    if (w.includes(' ')) { if (lower.includes(w)) return w; }
    else {
      const re = new RegExp(`(^|[^\\p{L}\\p{N}_])${w.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}($|[^\\p{L}\\p{N}_])`, 'iu');
      if (re.test(lower)) return w;
    }
  }
  return '';
}

async function applyModerationAction(ctx, type, reason, action = 'delete', limit = 3) {
  const target = ctx.sender;
  if (ctx.isBotAdmin && ['delete', 'warn', 'kick'].includes(action)) {
    try { await ctx.sock.sendMessage(ctx.chat, { delete: ctx.msg.key }); }
    catch (err) { logger.warn({ err }, 'Could not delete moderated message'); }
  }
  const key = db.warningKey(ctx.sessionId, ctx.chat, target);
  const shouldWarn = action === 'warn' || action === 'kick';
  if (shouldWarn) db.data.warnings[key] = (db.data.warnings[key] || 0) + 1;
  const count = db.data.warnings[key] || 0;
  await db.save();
  if (action === 'kick' && ctx.isBotAdmin && count >= limit) {
    try {
      await ctx.sock.groupParticipantsUpdate(ctx.chat, [target], 'remove');
      await ctx.sock.sendMessage(ctx.chat, { text: [
        `╭━━━〔 🛡️ A-X-HK ${type.toUpperCase()} GUARD 🛡️ 〕━━━╮`,
        `┃ Removed @${target.split('@')[0]}`,
        `┃ Reason ${reason}`,
        `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯`,
        '', config.footerMessage
      ].join('\n'), mentions: [target] });
      delete db.data.warnings[key];
      await db.save();
      return true;
    } catch (err) { logger.warn({ err }, 'Moderation kick failed'); }
  }
  await ctx.sock.sendMessage(ctx.chat, { text: [
    `╭━━━〔 🛡️ A-X-HK ${type.toUpperCase()} GUARD 🛡️ 〕━━━╮`,
    `┃ User   @${target.split('@')[0]}`,
    `┃ Reason ${reason}`,
    shouldWarn ? `┃ Warns  ${count}/${limit}` : '┃ Action DELETE',
    `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯`,
    '', config.footerMessage
  ].join('\n'), mentions: [target] }).catch(() => {});
  return true;
}

async function moderation(ctx) {
  if (!ctx.isGroup || !ctx.groupSettings) return false;
  const settings = ctx.groupSettings;
  if (settings.muted && !ctx.isAdmin && !ctx.isOwner) return true;

  if (settings.antiLink && !ctx.isAdmin && !ctx.isOwner) {
    const domains = extractDomains(ctx.text);
    if (domains.length && !domainAllowed(domains, settings.linkAllowedDomains)) {
      return applyModerationAction(ctx, 'link', domains[0], settings.linkAction || 'delete', Number(settings.linkWarnLimit || 3));
    }
  }

  if (settings.antiBad && !ctx.isAdmin && !ctx.isOwner) {
    const hit = badWordMatch(ctx.text, settings.badWords);
    if (hit) return applyModerationAction(ctx, 'bad word', hit, settings.badAction || 'delete', Number(settings.badWarnLimit || 3));
  }
  return false;
}

export async function dispatchMessage(sock, msg, runtime = {}) {
  if (!msg?.message || msg.key?.remoteJid === 'status@broadcast') return;
  if (msg.key?.fromMe && isKnownBotOutbound(msg)) return;

  const ctx = await buildContext(sock, msg, runtime);
  db.touchMessage();
  rememberRecentImage(ctx.sessionId, ctx.chat, msg);
  rememberChatMessage({
    sessionId: ctx.sessionId,
    chat: ctx.chat,
    sender: ctx.sender,
    fromMe: Boolean(msg.key?.fromMe),
    text: ctx.text
  });

  // Strict private mode is intentionally silent for every non-owner message.
  // This runs before auto-read, reactions, away replies, AI, saved replies and command errors.
  const effectiveMode = ctx.sessionSettings.mode || config.mode;
  if (effectiveMode === 'private' && !ctx.isOwner) return;

  maybeAwardXp(ctx);
  trackGroupActivity(ctx);
  applyAutoFeatures(ctx, sock, msg);
  if (!ctx.text) return;

  if (await moderation(ctx)) return;

  const parsed = parseCommand(ctx.text, ctx.prefix);
  if (!parsed) {
    const exact = db.autoReplies(ctx.sessionId)[ctx.text.toLowerCase()];
    if (exact) {
      await ctx.reply(exact);
      await db.save();
      return;
    }
    await maybeDirectAutomation(ctx);
    return;
  }

  if (!parsed.argText) {
    const category = categoryForBareCommand(parsed.name);
    if (category) {
      parsed.name = 'menu';
      parsed.args = [category];
      parsed.argText = category;
    }
  }

  const silentRejects = ctx.sessionSettings.silentCommandRejects !== false;
  const silentErrors = ctx.sessionSettings.silentCommandErrors !== false;
  const ownerReject = async (text) => {
    // Public/non-owner command rejects are always silent. The owner can disable
    // Silent Rejects from the protected dashboard only for temporary debugging.
    if (!ctx.isOwner || silentRejects) return;
    await ctx.reply(text);
  };

  const command = getCommand(parsed.name);
  if (!command) {
    const saved = db.savedReplies(ctx.sessionId)[parsed.name];
    if (saved) {
      await ctx.reply(saved);
      db.touchCommand(`saved:${parsed.name}`, ctx.sender, true, ctx.sessionId, { chat: ctx.chat, isGroup: ctx.isGroup });
      await db.save();
      return;
    }
    await ownerReject(`❌ *${config.shortName} COMMAND NOT FOUND*

No command named ${ctx.prefix}${parsed.name}.
Try ${ctx.prefix}searchcmd ${parsed.name} or ${ctx.prefix}menu.`);
    return;
  }

  const commandMeta = () => ({ chat: ctx.chat, isGroup: ctx.isGroup });
  const blockCommand = async (reason) => {
    db.touchCommand(command.name, ctx.sender, false, ctx.sessionId, { ...commandMeta(), blocked: true, reason });
    await db.save();
  };

  if (ctx.user.banned && !ctx.isOwner) { await blockCommand('user banned'); return; }
  if (ctx.isGroup && ctx.groupSettings?.disabledCommands?.includes(command.name) && !ctx.isOwner) { await blockCommand('group disabled command'); return; }
  const permission = commandPermissionState(ctx, command);
  if (!permission.allowed) { await blockCommand(permission.reason || 'permission blocked'); return; }
  if (command.ownerOnly && !ctx.isOwner) { await blockCommand('owner only command'); return; }
  if (command.groupOnly && !ctx.isGroup) { await blockCommand('group only command'); await ownerReject('👥 GROUP COMMAND • use this command inside a WhatsApp group.'); return; }
  if (command.adminOnly && !ctx.isAdmin && !ctx.isOwner) { await blockCommand('admin only command'); return; }
  if (command.botAdminRequired && !ctx.isBotAdmin) { await blockCommand('bot admin required'); await ownerReject('🤖 BOT ADMIN REQUIRED • promote the linked bot account to group admin first.'); return; }

  if (!ctx.isOwner && (ctx.sessionSettings.banProtection !== false || (ctx.isGroup && (ctx.groupSettings?.antiSpam || ctx.groupSettings?.antiFlood)))) {
    const burstWindow = ctx.sessionSettings.banProtection !== false ? 8 : 10;
    const burstWait = checkBurst(`${ctx.sessionId}:${ctx.sender}`, burstWindow, 12);
    if (burstWait) { await blockCommand('anti-spam burst guard'); return; }
  }
  const safety = safetyLimitState(ctx, command);
  if (!safety.allowed) { await blockCommand(safety.reason || 'safety limit'); return; }

  const wait = ctx.isOwner ? 0 : checkCooldown(`${ctx.sessionId}:${ctx.sender}`, command.name, command.cooldown);
  if (wait) { await blockCommand('command cooldown'); return; }

  ctx.user.commandCount = (ctx.user.commandCount || 0) + 1;
  try {
    await command.run({ ...ctx, args: parsed.args, argText: parsed.argText, command });
    trackGroupCommand(ctx);
    db.touchCommand(command.name, ctx.sender, true, ctx.sessionId, commandMeta());
    await db.save();
  } catch (err) {
    db.touchCommand(command.name, ctx.sender, false, ctx.sessionId, { ...commandMeta(), reason: 'command error' });
    await db.save();
    logger.error({ err, command: command.name, sender: ctx.sender, sessionId: ctx.sessionId }, 'Command failed silently');
    // Never expose failures to public/non-owner chats. Owner-only debug errors
    // can be enabled explicitly from the protected dashboard; default is silent.
    if (ctx.isOwner && !silentErrors) {
      await ctx.reply(`⚠️ *${config.shortName} COMMAND ERROR*
${String(err?.message || 'Command failed').slice(0, 300)}`);
    }
  }
}
