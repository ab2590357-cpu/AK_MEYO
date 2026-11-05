import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { isTermux, loadSharp } from '../utils/termux-native.js';
import { inspectRasterImage } from '../utils/image-assets.js';
import { fileURLToPath } from 'node:url';
const sharp = await loadSharp();

const assetDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public/assets');

export async function readMenuCard() {
  try {
    return { buffer: await fs.readFile(config.customMenuCardPath), custom: true };
  } catch (err) {
    if (err?.code !== 'ENOENT') throw err;
    const bundled = path.join(assetDir,'menu-card.png');
    for (const candidate of [config.menuCardPath, bundled, config.brandCardPath, path.join(assetDir,'brand-card.png')]) {
      if (!candidate) continue;
      try { return { buffer: await fs.readFile(candidate), custom: false }; }
      catch (err) { if (err?.code !== 'ENOENT') throw err; }
    }
    throw new Error('No menu image found. Upload a JPEG in the owner dashboard.');
  }
}

export async function normalizeMenuCard(buffer) {
  const {mime} = inspectRasterImage(buffer);
  if (isTermux) {
    if (mime === 'image/webp') throw new Error('For WhatsApp menu images, please use JPG or PNG. WebP can be used for the link logo.');
    return Buffer.from(buffer);
  }
  try {
    return await sharp(buffer,{failOn:'error',limitInputPixels:40000000})
      .rotate().resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true})
      .jpeg({quality:90}).toBuffer();
  } catch {
    throw new Error('Image could not be processed. Use a valid JPG or PNG.');
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
  const {buffer,custom}=await readMenuCard();
  if(isTermux) return {buffer,custom,mime:inspectRasterImage(buffer).mime};
  try {
    const jpeg=await sharp(buffer,{failOn:'error'}).rotate()
      .resize({width:900,height:900,fit:'inside',withoutEnlargement:true})
      .jpeg({quality:84}).toBuffer();
    return {buffer:jpeg,custom,mime:'image/jpeg'};
  } catch {
    return {buffer,custom,mime:inspectRasterImage(buffer).mime};
  }
}

export async function resetMenuCard() {
  try { await fs.unlink(config.customMenuCardPath); }
  catch (err) { if (err?.code !== 'ENOENT') throw err; }
}
