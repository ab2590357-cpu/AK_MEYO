import { config } from '../config.js';
import { db } from './database.js';
import { bareNumber, cleanJid } from '../utils/text.js';
import { extractText, reply } from '../utils/message.js';

const recentOutboundIds = new Map();
const OUTBOUND_TTL_MS = 2 * 60 * 1000;

function pruneOutbound(now = Date.now()) {
  for (const [id, at] of recentOutboundIds) if (now - at > OUTBOUND_TTL_MS) recentOutboundIds.delete(id);
}
function rememberOutbound(result) {
  const id = result?.key?.id;
  if (!id) return result;
  const now = Date.now();
  pruneOutbound(now);
  recentOutboundIds.set(id, now);
  return result;
}
export function isKnownBotOutbound(msg) {
  const id = msg?.key?.id;
  if (!id) return false;
  pruneOutbound();
  return recentOutboundIds.has(id);
}

const isPn = (jid = '') => /@s\.whatsapp\.net$/i.test(String(jid));
const isLid = (jid = '') => /@lid$/i.test(String(jid));
async function resolvePhoneJid(sock, primary, alternate) {
  const p = cleanJid(primary || '');
  const a = cleanJid(alternate || '');
  if (isPn(p)) return p;
  if (isPn(a)) return a;
  if (isLid(p)) {
    try {
      const mapped = await sock.signalRepository?.lidMapping?.getPNForLID?.(p);
      if (mapped) return cleanJid(mapped);
    } catch {}
  }
  return p || a;
}
function participantKeys(participant) {
  const keys = [];
  for (const value of [participant?.id, participant?.phoneNumber, participant?.lid]) {
    const jid = cleanJid(value || '');
    if (jid) keys.push(jid);
  }
  return keys;
}

export async function buildContext(sock, msg, runtime = {}) {
  const sessionId = String(runtime.sessionId || 'main');
  const sessionSettings = db.session(sessionId);
  const chat = msg.key.remoteJid;
  const isGroup = chat?.endsWith('@g.us');
  const rawSender = cleanJid(isGroup ? (msg.key.participant || msg.participant || '') : chat);
  const alternateSender = cleanJid(isGroup ? (msg.key.participantAlt || '') : (msg.key.remoteJidAlt || ''));
  const sender = await resolvePhoneJid(sock, rawSender, alternateSender);
  const senderNumber = bareNumber(sender);

  const rawBotJid = cleanJid(sock.user?.id || '');
  const botJid = await resolvePhoneJid(sock, rawBotJid, sock.user?.lid || '');
  const botNumber = bareNumber(botJid);
  const botLid = cleanJid(sock.user?.lid || '');
  const directJids = [rawSender, alternateSender, sender].map(cleanJid).filter(Boolean);
  const directCandidates = directJids.map(bareNumber).filter(Boolean);
  const selfJidMatch = directJids.some((jid) => jid === rawBotJid || jid === botJid || (botLid && jid === botLid));
  const isSelfChat = Boolean(!isGroup && msg.key?.fromMe && (selfJidMatch || (botNumber && directCandidates.includes(botNumber))));

  // Bot-created outbound IDs are filtered before this function. Any remaining fromMe command is a human command
  // typed from the linked WhatsApp account, so that linked account owns its own A-X-HK session.
  const isLinkedOwnerAction = Boolean(msg.key?.fromMe);
  const sessionOwnerNumber = String(runtime.ownerNumber || botNumber || '').replace(/\D/g, '');
  const isMasterOwner = Boolean(config.ownerNumber && senderNumber === config.ownerNumber);
  const owner = Boolean(isLinkedOwnerAction || isMasterOwner || (sessionOwnerNumber && senderNumber === sessionOwnerNumber));

  let metadata = null;
  let admins = [];
  let isAdmin = false;
  let isBotAdmin = false;
  if (isGroup) {
    try {
      metadata = await sock.groupMetadata(chat);
      const adminSet = new Set();
      for (const participant of metadata.participants || []) {
        if (!participant.admin) continue;
        for (const key of participantKeys(participant)) adminSet.add(key);
      }
      admins = [...adminSet];
      isAdmin = [rawSender, alternateSender, sender].filter(Boolean).some((jid) => adminSet.has(jid));
      isBotAdmin = [rawBotJid, botJid, sock.user?.lid].map(cleanJid).filter(Boolean).some((jid) => adminSet.has(jid));
    } catch { metadata = null; }
  }

  const text = extractText(msg);
  const prefix = sessionSettings.prefix || config.prefix;
  return {
    sock, msg, chat, sender, rawSender, senderNumber, botJid, isGroup, metadata, admins, isAdmin, isBotAdmin,
    isOwner: owner, isSelfChat, isLinkedOwnerAction, text, prefix, sessionId, sessionSettings,
    sessionLabel: runtime.label || (sessionId === 'main' ? 'Owner' : 'Linked User'),
    sessionOwnerNumber,
    groupSettings: isGroup ? db.group(chat, sessionId) : null,
    user: db.user(sender, sessionId),
    reply: async (value, extra) => rememberOutbound(await reply(sock, msg, value, extra)),
    send: async (content, options = {}) => rememberOutbound(await sock.sendMessage(chat, content, options))
  };
}
