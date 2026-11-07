import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import { isTermux, loadSharp } from '../utils/termux-native.js';
import { inspectRasterImage } from '../utils/image-assets.js';

const sharp = await loadSharp();
const assetDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public/assets');

async function readFirstExisting(paths) {
  for (const candidate of paths) {
    if (!candidate) continue;
    try { return {buffer:await fs.readFile(candidate),source:candidate}; }
    catch (err) { if (err?.code !== 'ENOENT') throw err; }
  }
  throw new Error('No logo image available');
}

export async function normalizeLinkLogo(buffer) {
  const {mime} = inspectRasterImage(buffer);
  // Android cannot load sharp without native libvips. Do not decode uploaded media;
  // preserve the original format and send its correct content type to the browser.
  if (isTermux) return Buffer.from(buffer);
  try {
    return await sharp(buffer, { failOn: 'error', limitInputPixels: 40_000_000 })
      .rotate().resize(640,640,{fit:'cover',position:'attention'})
      .png({compressionLevel:9,adaptiveFiltering:true}).toBuffer();
  } catch {
    throw new Error('Image could not be processed. Use a valid JPG, PNG or WebP.');
  }
}

export async function readLinkLogo() {
  const { buffer, source } = await readFirstExisting([
    config.customLinkLogoPath, config.customMenuCardPath,
    config.avatarPath, config.linkLogoPath,
    path.join(assetDir,'avatar.png'), path.join(assetDir,'menu-card.png'),
    path.join(assetDir,'brand-card.png')
  ]);
  return {buffer,custom:source===config.customLinkLogoPath,source};
}

export async function linkLogoPreview() {
  const {buffer,custom} = await readLinkLogo();
  if (isTermux) {
    const {mime} = inspectRasterImage(buffer);
    return {buffer,custom,mime};
  }
  try {
    const png=await sharp(buffer,{failOn:'error'}).rotate()
      .resize(420,420,{fit:'cover',position:'attention'})
      .png({compressionLevel:9,adaptiveFiltering:true}).toBuffer();
    return {buffer:png,custom,mime:'image/png'};
  } catch(err) {
    const {mime}=inspectRasterImage(buffer);
    return {buffer,custom,mime};
  }
}

export async function saveLinkLogo(buffer) {
  const normalized=await normalizeLinkLogo(buffer);
  await fs.mkdir(path.dirname(config.customLinkLogoPath),{recursive:true});
  const tmp=config.customLinkLogoPath+'.tmp';
  await fs.writeFile(tmp,normalized,{mode:0o600});
  await fs.rename(tmp,config.customLinkLogoPath);
  return config.customLinkLogoPath;
}

export async function resetLinkLogo() {
  try { await fs.unlink(config.customLinkLogoPath); }
  catch(err) { if(err?.code!=='ENOENT') throw err; }
}
