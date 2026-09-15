import { Sticker, StickerTypes } from 'wa-sticker-formatter';
import { config } from '../config.js';
import { logger } from '../core/logger.js';

function xml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function fit(value = '', max = 120) {
  const clean = String(value || '').replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, Math.max(1, max - 1))}…` : clean;
}

function wrapLines(value = '', maxChars = 19, maxLines = 5) {
  const words = fit(value, maxChars * maxLines + 20).split(' ').filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length <= maxChars || !line) {
      line = next;
      continue;
    }
    lines.push(line);
    line = word;
    if (lines.length >= maxLines - 1) break;
  }
  if (line && lines.length < maxLines) lines.push(line);
  const original = words.join(' ');
  const shown = lines.join(' ');
  if (original.length > shown.length && lines.length) {
    const last = lines.length - 1;
    lines[last] = `${lines[last].slice(0, Math.max(1, maxChars - 1))}…`;
  }
  return lines;
}

export async function makeFunSticker({ title = 'A-X-HK', value = '', footer = 'FUN MODE', pack = config.shortName, author = config.ownerName } = {}) {
  const sharp = (await import('sharp')).default;
  const titleText = xml(fit(title.toUpperCase(), 20));
  const valueLines = wrapLines(value, 19, 5);
  const footerText = xml(fit(footer.toUpperCase(), 24));
  const longest = Math.max(1, ...valueLines.map((line) => line.length));
  const valueSize = valueLines.length >= 4 ? 48 : valueLines.length >= 3 ? 56 : longest > 16 ? 64 : longest > 10 ? 76 : 98;
  const lineHeight = Math.round(valueSize * 1.12);
  const startY = 270 - ((valueLines.length - 1) * lineHeight) / 2;
  const valueText = valueLines.map((line, i) => `<text x="256" y="${Math.round(startY + i * lineHeight)}" text-anchor="middle" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="${valueSize}" font-weight="800">${xml(line)}</text>`).join('');
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#10151d"/>
          <stop offset="1" stop-color="#202a38"/>
        </linearGradient>
      </defs>
      <rect x="18" y="18" width="476" height="476" rx="94" fill="url(#g)"/>
      <rect x="31" y="31" width="450" height="450" rx="82" fill="none" stroke="#ffffff" stroke-opacity="0.16" stroke-width="3"/>
      <text x="256" y="135" text-anchor="middle" fill="#d7e7df" font-family="Arial, Helvetica, sans-serif" font-size="42" font-weight="700" letter-spacing="2">${titleText}</text>
      ${valueText}
      <text x="256" y="405" text-anchor="middle" fill="#aab7c4" font-family="Arial, Helvetica, sans-serif" font-size="26" font-weight="600" letter-spacing="3">${footerText}</text>
    </svg>`;
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  const sticker = new Sticker(png, { pack, author, type: StickerTypes.FULL, quality: 82 });
  return sticker.toBuffer();
}

export async function sendFunSticker(ctx, { title, value, footer } = {}) {
  if (ctx.sessionSettings?.funVisuals === false) return false;
  try {
    const saved = ctx.sessionSettings?.stickerPack || {};
    const sticker = await makeFunSticker({
      title,
      value,
      footer,
      pack: saved.pack || config.shortName,
      author: saved.author || config.ownerName
    });
    await ctx.send({ sticker }, { quoted: ctx.msg });
    return true;
  } catch (err) {
    logger.warn({ err: err?.message || String(err), command: ctx.command?.name }, 'Fun sticker rendering skipped');
    return false;
  }
}
