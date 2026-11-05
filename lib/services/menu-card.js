import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { isTermux, loadSharp } from '../utils/termux-native.js';
const sharp = await loadSharp();

function isJpeg(buf) {
  return Buffer.isBuffer(buf) && buf.length >= 4 &&
    buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff &&
    buf[buf.length - 2] === 0xff && buf[buf.length - 1] === 0xd9;
}
function isPng(buf) {
  return Buffer.isBuffer(buf) && buf.length >= 8 &&
    buf.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
}
function mimeOf(buf) { return isJpeg(buf) ? 'image/jpeg' : isPng(buf) ? 'image/png' : 'application/octet-stream'; }

export async function readMenuCard() {
  try {
    return { buffer: await fs.readFile(config.customMenuCardPath), custom: true };
  } catch (err) {
    if (err?.code !== 'ENOENT') throw err;
    return { buffer: await fs.readFile(config.menuCardPath || config.brandCardPath), custom: false };
  }
}

export async function normalizeMenuCard(buffer) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw new Error('Choose a valid menu image.');
  if (buffer.length > 8 * 1024 * 1024) throw new Error('Menu image must be 8 MB or smaller.');
  if (isTermux) {
    // Native sharp/libvips is unavailable on Android. A genuine JPEG can be
    // sent as-is by Baileys without decoding/resizing it on the bot host.
    if (!isJpeg(buffer)) throw new Error('Termux currently accepts JPG/JPEG menu images only. Please convert PNG or WEBP to JPG first.');
    return Buffer.from(buffer);
  }
  try {
    return await sharp(buffer, { failOn: 'error', limitInputPixels: 40_000_000 })
      .rotate()
      .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 90, mozjpeg: true })
      .toBuffer();
  } catch {
    throw new Error('Unsupported or invalid image. Use JPG, PNG or WebP.');
  }
}

export async function saveMenuCard(buffer) {
  const normalized = await normalizeMenuCard(buffer);
  await fs.mkdir(path.dirname(config.customMenuCardPath), { recursive: true });
  const tmp = `${config.customMenuCardPath}.tmp`;
  await fs.writeFile(tmp, normalized, { mode: 0o600 });
  await fs.rename(tmp, config.customMenuCardPath);
  return config.customMenuCardPath;
}

export async function menuCardPreview() {
  const { buffer, custom } = await readMenuCard();
  if (isTermux) return { buffer, custom, mime: mimeOf(buffer) };
  const jpeg = await sharp(buffer, { failOn: 'none' })
    .rotate()
    .resize({ width: 900, height: 900, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 84, mozjpeg: true })
    .toBuffer();
  return { buffer: jpeg, custom, mime: 'image/jpeg' };
}

export async function resetMenuCard() {
  try { await fs.unlink(config.customMenuCardPath); }
  catch (err) { if (err?.code !== 'ENOENT') throw err; }
}
