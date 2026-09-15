import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { config } from '../config.js';
import { logger } from '../core/logger.js';

function fmtBytes(n) {
  n = Number(n) || 0;
  const units = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i += 1; }
  return `${n.toFixed(i ? 1 : 0)} ${units[i]}`;
}

async function statSafe(file) {
  try { return await fs.stat(file); } catch { return null; }
}

async function sizeOf(file) {
  const st = await statSafe(file);
  if (!st) return 0;
  if (st.isFile()) return st.size || 0;
  if (!st.isDirectory()) return 0;
  let total = 0;
  const rows = await fs.readdir(file, { withFileTypes: true }).catch(() => []);
  for (const row of rows) total += await sizeOf(path.join(file, row.name));
  return total;
}

async function listDirs(root) {
  const rows = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
  const dirs = [];
  for (const row of rows) {
    if (!row.isDirectory()) continue;
    const full = path.join(root, row.name);
    const st = await statSafe(full);
    dirs.push({ path: full, name: row.name, mtimeMs: st?.mtimeMs || 0 });
  }
  return dirs;
}

async function removePath(file) {
  const bytes = await sizeOf(file).catch(() => 0);
  await fs.rm(file, { recursive: true, force: true }).catch(() => {});
  return bytes;
}

async function pruneBackupFolders(keep = 2) {
  const backupRoot = path.join(config.dataDir, 'backups');
  const dirs = (await listDirs(backupRoot)).sort((a, b) => b.name.localeCompare(a.name));
  let removed = 0;
  let bytes = 0;
  for (const row of dirs.slice(Math.max(0, keep))) {
    bytes += await removePath(row.path);
    removed += 1;
  }
  return { removed, bytes };
}

async function cleanupOldChildren(root, maxAgeMs) {
  const rows = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
  const now = Date.now();
  let removed = 0;
  let bytes = 0;
  for (const row of rows) {
    const full = path.join(root, row.name);
    const st = await statSafe(full);
    if (!st || now - st.mtimeMs < maxAgeMs) continue;
    bytes += await removePath(full);
    removed += 1;
  }
  return { removed, bytes };
}

export async function diskUsage() {
  await fs.mkdir(config.persistentRoot, { recursive: true }).catch(() => {});
  const st = await fs.statfs(config.persistentRoot);
  const free = Number(st.bavail) * Number(st.bsize);
  const total = Number(st.blocks) * Number(st.bsize);
  const used = Math.max(0, total - free);
  const percentFree = total ? free / total : 1;
  return { free, total, used, percentFree, freeText: fmtBytes(free), totalText: fmtBytes(total), usedText: fmtBytes(used) };
}

export async function cleanupStorage({ aggressive = false, reason = 'manual', backupKeep = 2 } = {}) {
  const started = await diskUsage().catch(() => null);
  let removed = 0;
  let bytes = 0;
  const add = (r) => { removed += r.removed || 0; bytes += r.bytes || 0; };

  // Never touch WhatsApp auth folders: config.sessionDir and config.multiSessionDir are intentionally excluded.
  add(await pruneBackupFolders(aggressive ? 1 : Math.max(1, Math.min(3, Number(backupKeep) || 2))).catch(() => ({ removed: 0, bytes: 0 })));
  add(await cleanupOldChildren(path.join(config.persistentRoot, 'tmp'), aggressive ? 0 : 30 * 60 * 1000).catch(() => ({ removed: 0, bytes: 0 })));
  add(await cleanupOldChildren(path.join(config.dataDir, 'downloads'), aggressive ? 0 : 60 * 60 * 1000).catch(() => ({ removed: 0, bytes: 0 })));
  add(await cleanupOldChildren(path.join(config.dataDir, 'status'), aggressive ? 0 : 24 * 60 * 60 * 1000).catch(() => ({ removed: 0, bytes: 0 })));
  add(await cleanupOldChildren(path.join(config.dataDir, 'temp'), aggressive ? 0 : 30 * 60 * 1000).catch(() => ({ removed: 0, bytes: 0 })));
  add(await cleanupOldChildren(path.join(os.tmpdir(), 'axhk-apk'), aggressive ? 0 : 30 * 60 * 1000).catch(() => ({ removed: 0, bytes: 0 })));

  const ended = await diskUsage().catch(() => null);
  logger.info({ reason, aggressive, removed, freed: fmtBytes(bytes), beforeFree: started?.freeText, afterFree: ended?.freeText }, 'A-X-HK storage cleanup completed');
  return { removed, bytes, freedText: fmtBytes(bytes), before: started, after: ended };
}

export async function ensureDiskSpace({ minFreeBytes = 40 * 1024 * 1024, minFreeRatio = 0.12, reason = 'guard' } = {}) {
  const before = await diskUsage().catch(() => null);
  if (!before) return null;
  if (before.free >= minFreeBytes && before.percentFree >= minFreeRatio) return { ok: true, before, cleaned: null };
  const cleaned = await cleanupStorage({ aggressive: true, reason });
  const after = await diskUsage().catch(() => cleaned.after || null);
  return { ok: Boolean(after && after.free >= Math.min(minFreeBytes, 5 * 1024 * 1024)), before, after, cleaned };
}

export function isNoSpaceError(err) {
  return err?.code === 'ENOSPC' || /no space left on device/i.test(String(err?.message || err || ''));
}

export { fmtBytes };
