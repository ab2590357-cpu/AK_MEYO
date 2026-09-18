import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { config, ownerJid } from '../config.js';
import { db } from '../core/database.js';
import { logger } from '../core/logger.js';
import { runBackup } from './backup.js';
import { cleanupStorage, diskUsage, ensureDiskSpace } from './storage-guard.js';
import { askAI } from './ai.js';

let timer = null;
let lastHealthAt = 0;
const sessionAlertState = new Map();
const watchdogAt = new Map();
const DOWN_STATES = new Set(['disconnected', 'logged_out', 'stopped']);
const WATCHDOG_STATES = new Set(['disconnected', 'restarting', 'connecting']);
const DOWN_STABLE_MS = 5 * 60 * 1000;
const RECOVERY_STABLE_MS = 2 * 60 * 1000;
const WATCHDOG_STABLE_MS = 10 * 60 * 1000;
const WATCHDOG_GAP_MS = 10 * 60 * 1000;
const ALERT_GAP_MS = 15 * 60 * 1000;
const alertAt = new Map();
let lastBackupAt = 0;

function fmtBytes(n) {
  n = Number(n) || 0;
  const units = ['B','KB','MB','GB','TB']; let i=0;
  while(n>=1024&&i<units.length-1){n/=1024;i++;}
  return `${n.toFixed(i?1:0)} ${units[i]}`;
}
async function sendOwnerAlert(waManager, key, text, minGapMs = ALERT_GAP_MS) {
  if (!db.session('main').ownerAlerts) return;
  const now = Date.now();
  if (now - (alertAt.get(key) || 0) < minGapMs) return;
  const sock = waManager.getSocket('main');
  const target = ownerJid();
  if (!sock?.user || !target) return;
  try {
    await sock.sendMessage(target, { text: `🔔 *A-X-HK OWNER ALERT*\n\n${text}\n\n${config.footerMessage}` });
    alertAt.set(key, now);
  } catch (err) { logger.warn({ err }, 'Owner alert failed'); }
}
async function cleanupOld(root, maxAgeMs = 2 * 60 * 60 * 1000) {
  let rows=[]; try{rows=await fs.readdir(root,{withFileTypes:true});}catch{return 0;}
  let removed=0; const now=Date.now();
  for(const row of rows){const file=path.join(root,row.name);try{const st=await fs.stat(file);if(now-st.mtimeMs>maxAgeMs){await fs.rm(file,{recursive:true,force:true});removed++;}}catch{}}
  return removed;
}

function dayHourInZone(now = Date.now(), zone = config.timezone) {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: zone || 'Asia/Karachi',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit',
      hour12: false
    }).formatToParts(new Date(now));
    const get = (type) => parts.find((p) => p.type === type)?.value || '';
    return { date: get('year') + '-' + get('month') + '-' + get('day'), hour: Number(get('hour') || 0) };
  } catch {
    const d = new Date(now);
    return { date: d.toISOString().slice(0, 10), hour: d.getUTCHours() };
  }
}

async function maybeDailyDrop(waManager, now = Date.now()) {
  const settings = db.session('main');
  if (!settings.dailyDrop) return;
  const local = dayHourInZone(now, config.timezone || 'Asia/Karachi');
  const wantedHour = Math.max(0, Math.min(23, Number(settings.dailyDropHour ?? 18)));
  if (local.hour !== wantedHour || settings.dailyDropLastDate === local.date) return;

  // Mark first so a provider failure cannot trigger an AI call every 30 seconds.
  settings.dailyDropLastDate = local.date;
  await db.save();

  const sock = waManager.getSocket('main');
  const target = ownerJid();
  if (!sock?.user || !target) return;

  const themes = [
    'a surprising but accurate technology fact',
    'a useful coding or debugging trick',
    'a defensive cybersecurity fact or safety tip',
    'a short clever joke for a developer',
    'a strange but true science/internet fact',
    'a concise productivity trick for a developer',
    'a short thought-provoking quote or idea without fake attribution'
  ];
  const seed = [...local.date].reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  const theme = themes[seed % themes.length];

  try {
    const text = await askAI(
      'Create today\'s A_X_HK DAILY DROP for Abdullah. Give ' + theme + '. Keep it under 120 words, useful/fun, and do not invent factual claims. No long intro.',
      'owner-daily-drop',
      { maxChars: 1000 }
    );
    await sock.sendMessage(target, {
      text: ['🎲 *A_X_HK DAILY DROP*', '', text, '', config.footerMessage].join('\n')
    });
  } catch (err) {
    logger.warn({ err }, 'Daily drop generation failed');
  }
}

async function watchdogSession(waManager, row, state, now) {
  if (!WATCHDOG_STATES.has(state.status) || now - state.since < WATCHDOG_STABLE_MS) return;
  const inst = waManager.getInstance(row.id);
  if (!inst || inst.disabled || inst.reconnectTimer || inst.starting) return;
  if (['logged_out', 'stopped', 'waiting_for_pair', 'pair_code_ready'].includes(String(inst.state?.status || ''))) return;
  const last = watchdogAt.get(row.id) || 0;
  if (now - last < WATCHDOG_GAP_MS) return;
  watchdogAt.set(row.id, now);
  logger.warn({ sessionId: row.id, status: state.status }, 'Connection watchdog requesting a controlled reconnect');
  try { await waManager.reconnectNow(row.id); }
  catch (err) { logger.warn({ err, sessionId: row.id }, 'Connection watchdog reconnect failed'); }
}

export function startBackgroundWorkers(waManager) {
  if (timer) return;
  timer = setInterval(async () => {
    const now = Date.now();
    try {
      await maybeDailyDrop(waManager, now);

            // Expire public sessions whose owner/invite TTL has elapsed.
      for (const [id, meta] of Object.entries(db.data.linkedSessions || {})) {
        if (!meta?.expiresAt || new Date(meta.expiresAt).getTime() > now) continue;
        await sendOwnerAlert(waManager, `expiry:${id}`, `Session *${meta.label || id}* expired and will be removed.`, ALERT_GAP_MS);
        await waManager.removePublicSession(id).catch((err) => logger.warn({ err, id }, 'Expired session removal failed'));
      }

      // Session alerts are incident-based, not transition-based. Short reconnect flaps stay silent.
      const seenIds = new Set();
      for (const row of waManager.listSessions()) {
        seenIds.add(row.id);
        const status = String(row.status || 'offline');
        let state = sessionAlertState.get(row.id);
        if (!state) {
          state = { status, since: now, downAlerted: false };
          sessionAlertState.set(row.id, state);
          continue;
        }
        if (state.status !== status) {
          state.status = status;
          state.since = now;
        }

        await watchdogSession(waManager, row, state, now);

        if (DOWN_STATES.has(status) && !state.downAlerted && now - state.since >= DOWN_STABLE_MS) {
          await sendOwnerAlert(
            waManager,
            `down:${row.id}`,
            `Session *${row.label}* has remained *${status}* for at least 5 minutes. A-X-HK will keep trying controlled reconnects automatically.`,
            ALERT_GAP_MS
          );
          state.downAlerted = true;
        } else if (status === 'connected' && state.downAlerted && now - state.since >= RECOVERY_STABLE_MS) {
          await sendOwnerAlert(
            waManager,
            `recovered:${row.id}`,
            `Session *${row.label}* recovered and has stayed connected for at least 2 minutes.`,
            ALERT_GAP_MS
          );
          state.downAlerted = false;
        }
      }
      for (const id of sessionAlertState.keys()) if (!seenIds.has(id)) sessionAlertState.delete(id);
      for (const id of watchdogAt.keys()) if (!seenIds.has(id)) watchdogAt.delete(id);

      if (now - lastHealthAt > 5 * 60 * 1000) {
        lastHealthAt = now;
        if (db.session('main').autoCleanup) {
          const roots = [
            path.join(config.persistentRoot,'tmp','downloads'),
            path.join(config.persistentRoot,'tmp','search-downloads'),
            path.join(os.tmpdir(), 'axhk-apk')
          ];
          let removed = 0;
          for (const root of roots) removed += await cleanupOld(root);
          if (removed) logger.info({ removed }, 'Auto cleanup removed stale temporary jobs');
        }
        const mem = process.memoryUsage();
        if (mem.rss > Math.max(1024 * 1024 * 1024, os.totalmem() * 0.85)) {
          await sendOwnerAlert(waManager, 'high-memory', `High bot memory usage: ${fmtBytes(mem.rss)} RSS.`, 30 * 60 * 1000);
        }
        try {
          const usage = await diskUsage();
          if (usage.percentFree < 0.15) await cleanupStorage({ aggressive: usage.percentFree < 0.08, reason: 'background-low-disk', backupKeep: db.session('main').backupKeep || 3 });
          const afterUsage = await diskUsage();
          if (afterUsage.total && afterUsage.percentFree < 0.08) await sendOwnerAlert(waManager, 'low-disk', `Low disk space: ${afterUsage.freeText} free of ${afterUsage.totalText}. Cleanup already ran.`, 60 * 60 * 1000);
        } catch {}

        const settings = db.session('main');
        const intervalMs = Math.max(1, Math.min(72, Number(settings.backupIntervalHours || 6))) * 60 * 60 * 1000;
        if (settings.autoBackup !== false && now - lastBackupAt > intervalMs) {
          const usage = await ensureDiskSpace({ minFreeBytes: 80 * 1024 * 1024, minFreeRatio: 0.18, reason: 'before-auto-backup' });
          if (usage?.after && usage.after.percentFree < 0.10) {
            lastBackupAt = now;
            logger.warn({ free: usage.after.freeText, total: usage.after.totalText }, 'Skipping automatic backup because persistent disk is still low');
          } else {
            lastBackupAt = now;
            runBackup('auto').then((row) => logger.info({ path: row.path }, 'A-X-HK automatic backup completed')).catch((err) => logger.warn({ err }, 'A-X-HK automatic backup failed'));
          }
        }
      }
    } catch (err) { logger.warn({ err }, 'Background worker cycle failed'); }
  }, 30_000);
  timer.unref?.();
}

export function stopBackgroundWorkers() {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}
