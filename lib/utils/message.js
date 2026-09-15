import { cleanJid } from './text.js';

export function unwrapMessage(message = {}) {
  let m = message;
  for (let i = 0; i < 4; i += 1) {
    if (m.ephemeralMessage?.message) m = m.ephemeralMessage.message;
    else if (m.documentWithCaptionMessage?.message) m = m.documentWithCaptionMessage.message;
    else break;
  }
  return m;
}

export function extractText(msg) {
  const m = unwrapMessage(msg.message || {});
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.buttonsResponseMessage?.selectedButtonId ||
    m.listResponseMessage?.singleSelectReply?.selectedRowId ||
    m.templateButtonReplyMessage?.selectedId ||
    ''
  ).trim();
}

export function contextInfo(msg) {
  const m = unwrapMessage(msg.message || {});
  const value = Object.values(m)[0];
  return value?.contextInfo || {};
}

export function mentionedJids(msg) {
  return contextInfo(msg).mentionedJid || [];
}

export function quotedParticipant(msg) {
  return cleanJid(contextInfo(msg).participant || '');
}

export function targetJidFromMessage(msg, args = []) {
  const mentioned = mentionedJids(msg);
  if (mentioned[0]) return cleanJid(mentioned[0]);
  const quoted = quotedParticipant(msg);
  if (quoted) return quoted;
  const number = String(args[0] || '').replace(/[^0-9]/g, '');
  return number ? `${number}@s.whatsapp.net` : '';
}

export async function reply(sock, msg, text, extra = {}) {
  const content = { text: String(text), ...extra };
  try {
    return await sock.sendMessage(msg.key.remoteJid, content, { quoted: msg });
  } catch {
    return sock.sendMessage(msg.key.remoteJid, content);
  }
}
