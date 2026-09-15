import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { Sticker, StickerTypes } from 'wa-sticker-formatter';
import { registerCommand } from '../../lib/core/registry.js';
import { config } from '../../lib/config.js';
import { logger } from '../../lib/core/logger.js';
import { unwrapMessage, contextInfo } from '../../lib/utils/message.js';

function hasSupportedMedia(message) {
  const m = unwrapMessage(message || {});
  return Boolean(m.imageMessage || m.videoMessage || m.stickerMessage);
}

function quotedMessage(msg) {
  return contextInfo(msg)?.quotedMessage || null;
}

registerCommand({
  name: 'sticker', aliases: ['s', 'stiker'], category: 'media', description: 'Convert an image/video to sticker', cooldown: 5,
  async run(ctx) {
    let target = ctx.msg;
    const quoted = quotedMessage(ctx.msg);
    if (!hasSupportedMedia(ctx.msg.message) && quoted) {
      target = { ...ctx.msg, message: quoted };
    }
    if (!hasSupportedMedia(target.message)) return ctx.reply('Send/reply to an image or short video with the sticker command.');

    const buffer = await downloadMediaMessage(target, 'buffer', {}, { logger, reuploadRequest: ctx.sock.updateMediaMessage });
    if (!buffer || buffer.length > 20 * 1024 * 1024) return ctx.reply('Media is too large. Maximum 20 MB.');
    const sticker = new Sticker(buffer, {
      pack: config.shortName,
      author: config.ownerName,
      type: StickerTypes.FULL,
      quality: 65
    });
    const out = await sticker.toBuffer();
    await ctx.send({ sticker: out }, { quoted: ctx.msg });
  }
});

function hasViewOnceWrapper(message = {}) {
  return Boolean(message.viewOnceMessage || message.viewOnceMessageV2 || message.viewOnceMessageV2Extension);
}

function regularMediaType(message = {}) {
  const m = unwrapMessage(message || {});
  if (m.imageMessage) return ['image', m.imageMessage.mimetype || 'image/jpeg'];
  if (m.videoMessage) return ['video', m.videoMessage.mimetype || 'video/mp4'];
  if (m.audioMessage) return ['audio', m.audioMessage.mimetype || 'audio/ogg'];
  if (m.documentMessage) return ['document', m.documentMessage.mimetype || 'application/octet-stream'];
  return null;
}

registerCommand({
  name: 'save', aliases: ['repost', 'resendmedia'], category: 'media',
  description: 'Re-send normal quoted media (view-once privacy is not bypassed)', usage: 'save (reply to media)', cooldown: 3,
  async run(ctx) {
    const quoted = quotedMessage(ctx.msg);
    if (!quoted) return ctx.reply('Reply to a normal image, video, audio, or document with this command.');
    if (hasViewOnceWrapper(quoted)) return ctx.reply('View-once media is privacy-protected and is not extracted by this bot.');
    const kind = regularMediaType(quoted);
    if (!kind) return ctx.reply('The replied message does not contain supported normal media.');
    const target = { ...ctx.msg, message: quoted };
    const buffer = await downloadMediaMessage(target, 'buffer', {}, { logger, reuploadRequest: ctx.sock.updateMediaMessage });
    if (!buffer || buffer.length > 25 * 1024 * 1024) return ctx.reply('Media is unavailable or larger than 25 MB.');
    const [type, mimetype] = kind;
    const payload = { [type]: buffer, mimetype };
    if (type === 'audio') payload.ptt = false;
    if (type === 'document') payload.fileName = 'A-X-HK-file';
    await ctx.send(payload, { quoted: ctx.msg });
  }
});
