import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { registerCommand } from '../../lib/core/registry.js';
import { config } from '../../lib/config.js';
import { logger } from '../../lib/core/logger.js';
import { contextInfo, unwrapMessage } from '../../lib/utils/message.js';
import { getRecentImage, clearRecentImage, messageHasImage } from '../../lib/services/recent-media.js';
import { readMenuCard, saveMenuCard, resetMenuCard } from '../../lib/services/menu-card.js';

function quotedImageTarget(ctx) {
  const q = contextInfo(ctx.msg)?.quotedMessage || null;
  if (!q) return null;
  const m = unwrapMessage(q);
  if (!m?.imageMessage) return null;
  return { ...ctx.msg, message: q };
}

function currentImageTarget(ctx) {
  return messageHasImage(ctx.msg) ? ctx.msg : null;
}

async function downloadImage(ctx) {
  let target = currentImageTarget(ctx);
  let source = 'current image';

  if (!target) {
    target = quotedImageTarget(ctx);
    source = 'quoted image';
  }

  if (!target) {
    target = getRecentImage(ctx.sessionId, ctx.chat);
    source = 'recent image';
  }

  if (!target || !messageHasImage(target)) {
    throw new Error(`Send an image with ${ctx.prefix}menudp as its caption, reply to an image with ${ctx.prefix}menudp, or send an image then type ${ctx.prefix}menudp within 2 minutes.`);
  }

  const buffer = await downloadMediaMessage(target, 'buffer', {}, {
    logger,
    reuploadRequest: ctx.sock.updateMediaMessage
  });
  if (!buffer?.length) throw new Error('That image could not be downloaded from WhatsApp.');
  if (buffer.length > 15 * 1024 * 1024) throw new Error('Menu image is larger than 15 MB. Use a smaller image.');

  // Sharp is optional at command runtime. A broken native image binary must never
  // prevent the whole WhatsApp bot from starting. On supported systems we still
  // optimise the menu image; otherwise the original WhatsApp image is stored.
  let output = buffer;
  try {
    const sharp = (await import('sharp')).default;
    output = await sharp(buffer)
      .rotate()
      .resize({ width: 1600, height: 2000, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 90, mozjpeg: true })
      .toBuffer();
  } catch (error) {
    logger.warn({ err: error?.message || String(error) }, 'Menu DP image optimisation unavailable; using original image');
  }

  return { buffer: output, source };
}

registerCommand({
  name: 'menudp',
  aliases: ['menuimage', 'setmenudp', 'menuavatar', 'statusdp', 'alivedp'],
  category: 'owner',
  ownerOnly: true,
  description: 'Change the image shown with .menu and .alive/.status; persists across restarts/upgrades',
  usage: 'menudp | menudp show | menudp reset',
  cooldown: 2,
  async run(ctx) {
    const action = String(ctx.args[0] || '').toLowerCase();

    if (action === 'show') {
      const { buffer, custom } = await readMenuCard();
      return ctx.send({
        image: buffer,
        caption: `🖼️ *A-X-HK MENU DP*\n\nStatus: *${custom ? 'CUSTOM' : 'DEFAULT'}*\n\n${config.footerMessage}`
      }, { quoted: ctx.msg });
    }

    if (action === 'reset' || action === 'default') {
      await resetMenuCard();
      const { buffer } = await readMenuCard();
      await ctx.send({
        image: buffer,
        caption: `✅ *MENU DP RESET*\n\nOriginal A-X-HK menu image restored.\n\n${config.footerMessage}`
      }, { quoted: ctx.msg });
      return;
    }

    const { buffer, source } = await downloadImage(ctx);
    await saveMenuCard(buffer);
    clearRecentImage(ctx.sessionId, ctx.chat);
    await ctx.send({
      image: buffer,
      caption: [
        '✅ *A-X-HK MENU DP UPDATED*',
        '',
        `🖼️ Source: *${source.toUpperCase()}*`,
        '',
        `Now type *${ctx.prefix}menu* or *${ctx.prefix}alive* to see the new image.`,
        '',
        `Use *${ctx.prefix}menudp reset* to restore the original.`,
        '',
        config.footerMessage
      ].join('\n')
    }, { quoted: ctx.msg });
  }
});
