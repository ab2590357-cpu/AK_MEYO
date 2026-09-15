import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { config } from '../config.js';
import { logger } from '../core/logger.js';
import { contextInfo, unwrapMessage, extractText } from '../utils/message.js';
import { cleanJid } from '../utils/text.js';

function quotedMessage(ctx) {
  return contextInfo(ctx.msg)?.quotedMessage || null;
}

function quotedParticipant(ctx) {
  return cleanJid(contextInfo(ctx.msg)?.participant || ctx.sender || '');
}

function premiumCaption(ctx, custom = '') {
  const groupName = String(ctx.metadata?.subject || 'Group').slice(0, 70);
  const text = String(custom || '').trim().slice(0, 700);
  return [
    text,
    text ? '' : '',
    `📍 GC STATUS • ${groupName}`,
    '© POWERED BY ABDULLAH-X-HACKER.'
  ].filter((line, i, arr) => line || (i === 1 && arr[0])).join('\n');
}

function messageInfo(message = {}) {
  const m = unwrapMessage(message || {});
  if (m.conversation || m.extendedTextMessage?.text) return { kind: 'text', text: (m.conversation || m.extendedTextMessage?.text || '').trim() };
  if (m.imageMessage) return { kind: 'image', mimetype: m.imageMessage.mimetype || 'image/jpeg' };
  if (m.videoMessage) return { kind: 'video', mimetype: m.videoMessage.mimetype || 'video/mp4' };
  if (m.audioMessage) return { kind: 'audio', mimetype: m.audioMessage.mimetype || 'audio/ogg' };
  if (m.stickerMessage) return { kind: 'sticker', mimetype: m.stickerMessage.mimetype || 'image/webp' };
  if (m.documentMessage) return { kind: 'document', mimetype: m.documentMessage.mimetype || 'application/octet-stream', fileName: m.documentMessage.fileName || 'file' };
  return { kind: 'unknown' };
}

function audienceFromGroup(ctx) {
  const seen = new Set();
  const rows = [];
  for (const p of ctx.metadata?.participants || []) {
    for (const raw of [p.phoneNumber, p.id, p.lid]) {
      const jid = cleanJid(raw || '');
      if (!jid || jid.endsWith('@g.us') || jid.endsWith('@broadcast') || seen.has(jid)) continue;
      seen.add(jid);
      rows.push(jid);
      break;
    }
  }
  for (const jid of [ctx.sender, ctx.botJid]) {
    const clean = cleanJid(jid || '');
    if (clean && !seen.has(clean)) { seen.add(clean); rows.push(clean); }
  }
  return rows.slice(0, 512);
}

async function sendStatus(sock, content, statusJidList) {
  const options = statusJidList?.length ? { statusJidList } : {};
  try { return await sock.sendMessage('status@broadcast', content, options); }
  catch (err) {
    logger.warn({ err }, 'GC status with audience failed; retrying default status send');
    return sock.sendMessage('status@broadcast', content);
  }
}

export async function postQuotedToStatus(ctx) {
  const q = quotedMessage(ctx);
  const message = q || ctx.msg.message || {};
  const info = messageInfo(message);
  const statusJidList = ctx.isGroup ? audienceFromGroup(ctx) : [ctx.sender].filter(Boolean);
  const customCaption = ctx.argText;
  const caption = premiumCaption(ctx, customCaption || extractText({ message }) || '');

  if (info.kind === 'text') {
    const text = String(customCaption || info.text || extractText({ message }) || '').trim();
    if (!text) throw new Error(`Reply to a message/media or type ${ctx.prefix}gcstatus your text.`);
    await sendStatus(ctx.sock, { text: `${text}\n\n© POWERED BY ABDULLAH-X-HACKER.`, backgroundColor: '#0b141a', font: 1 }, statusJidList);
    return { kind: 'text' };
  }

  if (!q && !['image', 'video'].includes(info.kind)) throw new Error(`Reply to text/image/video for GC status. Audio/sticker/doc statuses are sent as a text note.`);

  if (info.kind === 'image' || info.kind === 'video') {
    const target = { ...ctx.msg, key: { ...ctx.msg.key, participant: quotedParticipant(ctx) }, message };
    const buffer = await downloadMediaMessage(target, 'buffer', {}, { logger, reuploadRequest: ctx.sock.updateMediaMessage });
    if (!buffer?.length) throw new Error('Media download nahi ho saki. Dobara try karo.');
    if (info.kind === 'image') await sendStatus(ctx.sock, { image: buffer, caption, mimetype: info.mimetype }, statusJidList);
    else await sendStatus(ctx.sock, { video: buffer, caption, mimetype: info.mimetype || 'video/mp4' }, statusJidList);
    return { kind: info.kind };
  }

  const note = String(customCaption || extractText({ message }) || `${String(info.kind).toUpperCase()} message from ${ctx.metadata?.subject || 'group'}`).slice(0, 600);
  await sendStatus(ctx.sock, { text: `${note}\n\n📍 GC STATUS\n© POWERED BY ABDULLAH-X-HACKER.`, backgroundColor: '#0b141a', font: 1 }, statusJidList);
  return { kind: 'text-note' };
}
