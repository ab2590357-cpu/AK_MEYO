import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { logger } from '../../lib/core/logger.js';
import { contextInfo, unwrapMessage } from '../../lib/utils/message.js';

function quotedMessage(msg) {
  return contextInfo(msg)?.quotedMessage || null;
}

function isViewOnce(message = {}) {
  return Boolean(
    message.viewOnceMessage ||
    message.viewOnceMessageV2 ||
    message.viewOnceMessageV2Extension
  );
}

function mediaInfo(message = {}) {
  const m = unwrapMessage(message);
  if (m.imageMessage) return { type: 'image', mimetype: m.imageMessage.mimetype || 'image/jpeg' };
  if (m.videoMessage) return { type: 'video', mimetype: m.videoMessage.mimetype || 'video/mp4' };
  if (m.audioMessage) return { type: 'audio', mimetype: m.audioMessage.mimetype || 'audio/ogg' };
  if (m.documentMessage) return {
    type: 'document',
    mimetype: m.documentMessage.mimetype || 'application/octet-stream',
    fileName: m.documentMessage.fileName || 'A-X-HK-file'
  };
  return null;
}

export default {
  name: 'vv',
  aliases: ['resend'],
  category: 'media',
  description: 'Resend ordinary quoted media; ViewOnce extraction is blocked for privacy.',
  usage: 'vv (reply to normal image/video/audio/document)',
  cooldown: 3,
  async run(ctx) {
    const quoted = quotedMessage(ctx.msg);
    if (!quoted) {
      return ctx.reply(
        `Reply to normal media with ${ctx.prefix}vv. ViewOnce media is not extracted.`
      );
    }

    if (isViewOnce(quoted)) {
      return ctx.reply(
        '⚠️ ViewOnce media is privacy-protected, so this bot will not extract or bypass it.'
      );
    }

    const info = mediaInfo(quoted);
    if (!info) {
      return ctx.reply('Supported media: normal image, video, audio, or document.');
    }

    const target = { ...ctx.msg, message: quoted };
    const buffer = await downloadMediaMessage(
      target,
      'buffer',
      {},
      { logger, reuploadRequest: ctx.sock.updateMediaMessage }
    );

    if (!buffer) throw new Error('Media is unavailable.');
    if (buffer.length > 25 * 1024 * 1024) {
      return ctx.reply('Media is too large. Maximum allowed size is 25 MB.');
    }

    const payload = {
      [info.type]: buffer,
      mimetype: info.mimetype
    };
    if (info.type === 'audio') payload.ptt = false;
    if (info.type === 'document') payload.fileName = info.fileName;

    await ctx.send(payload, { quoted: ctx.msg });
  }
};