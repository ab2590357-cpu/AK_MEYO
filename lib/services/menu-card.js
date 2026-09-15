import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import sharp from 'sharp';

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
  await fs.writeFile(tmp, normalized);
  await fs.rename(tmp, config.customMenuCardPath);
  return config.customMenuCardPath;
}

export async function menuCardPreview() {
  const { buffer, custom } = await readMenuCard();
  const jpeg = await sharp(buffer, { failOn: 'none' })
    .rotate()
    .resize({ width: 900, height: 900, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 84, mozjpeg: true })
    .toBuffer();
  return { buffer: jpeg, custom };
}

export async function resetMenuCard() {
  try { await fs.unlink(config.customMenuCardPath); }
  catch (err) { if (err?.code !== 'ENOENT') throw err; }
}
