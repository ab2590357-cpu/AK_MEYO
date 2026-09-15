import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { db } from '../core/database.js';
import { cleanupStorage, ensureDiskSpace, isNoSpaceError } from './storage-guard.js';

function stamp() { return new Date().toISOString().replace(/[:.]/g, '-'); }
async function exists(file) { try { await fs.access(file); return true; } catch { return false; } }
async function copyIfExists(src, dest) {
  if (!(await exists(src))) return false;
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.copyFile(src, dest);
  return true;
}
async function copyDirIfExists(src, dest) {
  if (!(await exists(src))) return false;
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) await copyDirIfExists(from, to);
    else if (entry.isFile()) await copyIfExists(from, to);
  }
  return true;
}

export async function runBackup(reason = 'manual') {
  await fs.mkdir(config.dataDir, { recursive: true });
  await ensureDiskSpace({ minFreeBytes: 60 * 1024 * 1024, minFreeRatio: 0.15, reason: 'before-backup' });
  await db.save();
  const backupRoot = path.join(config.dataDir, 'backups');
  const dir = path.join(backupRoot, `axhk-${stamp()}`);
  await fs.mkdir(dir, { recursive: true });
  const databasePath = path.join(config.dataDir, 'database.json');
  if (await exists(databasePath)) await fs.copyFile(databasePath, path.join(dir, 'database.json'));
  else await fs.writeFile(path.join(dir, 'database.json'), JSON.stringify(db.data, null, 2));

  await copyIfExists(config.customMenuCardPath, path.join(dir, path.basename(config.customMenuCardPath)));
  await copyIfExists(config.customLinkLogoPath, path.join(dir, path.basename(config.customLinkLogoPath)));
  await copyDirIfExists(path.join(config.dataDir, 'voice'), path.join(dir, 'voice'));
  await copyDirIfExists(path.join(config.dataDir, 'status'), path.join(dir, 'status'));

  const manifest = {
    format: 'axhk-local-backup-v1', version: config.version, reason,
    createdAt: new Date().toISOString(), dataDir: config.dataDir,
    includes: ['database.json', 'custom menu/logo if present', 'voice/status folders if present'],
    excludes: ['WhatsApp auth session credentials', 'dashboard auth password hash']
  };
  await fs.writeFile(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  const row = { at: manifest.createdAt, reason, path: dir, version: config.version };
  db.data.backups ||= [];
  db.data.backups.push(row);
  if (db.data.backups.length > 100) db.data.backups = db.data.backups.slice(-100);
  await db.save();
  await pruneBackups(Number(db.session('main').backupKeep || 3));
  return row;
}

export async function listBackups(limit = 10) {
  const rows = Array.isArray(db.data.backups) ? db.data.backups : [];
  return rows.slice(-Math.max(1, Math.min(50, Number(limit) || 10))).reverse();
}

export async function pruneBackups(keep = 3) {
  keep = Math.max(1, Math.min(20, Math.trunc(Number(keep) || 3)));
  db.data.backups ||= [];
  const sorted = db.data.backups.slice().sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const keepPaths = new Set(sorted.slice(0, keep).map((row) => row.path));
  for (const row of sorted.slice(keep)) {
    if (row.path) await fs.rm(row.path, { recursive: true, force: true }).catch(() => {});
  }
  db.data.backups = sorted.filter((row) => keepPaths.has(row.path)).sort((a, b) => String(a.at).localeCompare(String(b.at)));
  await db.save();
}
