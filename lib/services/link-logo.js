import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { config } from '../config.js';

async function readFirstExisting(paths) {
  for (const candidate of paths) {
    if (!candidate) continue;
    try {
      return { buffer: await fs.readFile(candidate), source: candidate };
    } catch (err) {
      if (err?.code !== 'ENOENT') continue;
    }
  }
  throw new Error('No logo image is available.');
}

export async function normalizeLinkLogo(buffer) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw new Error('Choose a valid logo image.');
  if (buffer.length > 8 * 1024 * 1024) throw new Error('Logo image must be 8 MB or smaller.');
  try {
    return await sharp(buffer, { failOn: 'error', limitInputPixels: 40_000_000 })
      .rotate()
      .resize(640, 640, { fit: 'cover', position: 'attention' })
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toBuffer();
  } catch {
    throw new Error('Unsupported or invalid logo. Use JPG, PNG or WebP.');
  }
}

export async function readLinkLogo() {
  const { buffer, source } = await readFirstExisting([
    config.customLinkLogoPath,
    config.customMenuCardPath,
    config.avatarPath,
    config.linkLogoPath,
    'public/assets/logo.svg'
  ]);
  return { buffer, custom: source === config.customLinkLogoPath, source };
}

export async function linkLogoPreview() {
  const { buffer, custom } = await readLinkLogo();
  const png = await sharp(buffer, { failOn: 'none' })
    .rotate()
    .resize(420, 420, { fit: 'cover', position: 'attention' })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
  return { buffer: png, custom };
}

export async function saveLinkLogo(buffer) {
  const normalized = await normalizeLinkLogo(buffer);
  await fs.mkdir(path.dirname(config.customLinkLogoPath), { recursive: true });
  const tmp = `${config.customLinkLogoPath}.tmp`;
  await fs.writeFile(tmp, normalized);
  await fs.rename(tmp, config.customLinkLogoPath);
  return config.customLinkLogoPath;
}

export async function resetLinkLogo() {
  try { await fs.unlink(config.customLinkLogoPath); }
  catch (err) { if (err?.code !== 'ENOENT') throw err; }
}
