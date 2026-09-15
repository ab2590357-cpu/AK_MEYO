import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';

const KEY_PATH = path.join(config.dataDir, 'vault.key');
let cachedKey = null;

async function key() {
  if (cachedKey) return cachedKey;
  await fs.mkdir(config.dataDir, { recursive: true });
  try {
    const raw = await fs.readFile(KEY_PATH);
    if (raw.length === 32) { cachedKey = raw; return cachedKey; }
  } catch {}
  const fresh = crypto.randomBytes(32);
  await fs.writeFile(KEY_PATH, fresh, { mode: 0o600 });
  cachedKey = fresh;
  return cachedKey;
}

export async function encryptVaultText(text) {
  const k = await key();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', k, iv);
  const ciphertext = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { v: 1, iv: iv.toString('base64'), tag: tag.toString('base64'), data: ciphertext.toString('base64') };
}

export async function decryptVaultText(record) {
  if (!record?.iv || !record?.tag || !record?.data) throw new Error('Vault record is invalid.');
  const k = await key();
  const decipher = crypto.createDecipheriv('aes-256-gcm', k, Buffer.from(record.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(record.tag, 'base64'));
  const plain = Buffer.concat([decipher.update(Buffer.from(record.data, 'base64')), decipher.final()]);
  return plain.toString('utf8');
}

export function vaultKeyPath() { return KEY_PATH; }
