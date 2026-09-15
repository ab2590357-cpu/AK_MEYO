import fs from 'node:fs/promises';
import { db } from '../core/database.js';
import { logger } from '../core/logger.js';
import { config } from '../config.js';

let timer = null;


async function sendScheduledMessage(sock, row) {
  await sock.sendMessage(row.chat, { text: `⏰ *A-X-HK SCHEDULED MESSAGE*\n\n${row.text}\n\n${config.footerMessage}` });
}

async function sendScheduledStatus(sock, row) {
  const caption = String(row.caption || '').trim();
  const audience = Array.isArray(row.statusJidList) && row.statusJidList.length ? { statusJidList: row.statusJidList } : {};
  const footer = '© POWERED BY ABDULLAH-X-HACKER.';
  if (row.type === 'image' && row.filePath) {
    await sock.sendMessage('status@broadcast', { image: await fs.readFile(row.filePath), caption: `${caption}\n\n${footer}`.trim(), mimetype: row.mimetype || 'image/jpeg' }, audience);
    return;
  }
  if (row.type === 'video' && row.filePath) {
    await sock.sendMessage('status@broadcast', { video: await fs.readFile(row.filePath), caption: `${caption}\n\n${footer}`.trim(), mimetype: row.mimetype || 'video/mp4' }, audience);
    return;
  }
  const text = String(row.text || caption || 'A-X-HK scheduled status').slice(0, 900);
  await sock.sendMessage('status@broadcast', { text: `${text}\n\n${footer}`, backgroundColor: '#0b141a', font: 1 }, audience);
}

function zonedParts() {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: config.timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false
    }).formatToParts(new Date());
    const get = (t) => parts.find((p) => p.type === t)?.value;
    return { year: Number(get('year')), month: get('month'), day: get('day'), hour: Number(get('hour')) };
  } catch {
    const d = new Date();
    return { year: d.getFullYear(), month: String(d.getMonth()+1).padStart(2,'0'), day: String(d.getDate()).padStart(2,'0'), hour: d.getHours() };
  }
}

export function startReminderWorker(getSock) {
  if (timer) return;
  timer = setInterval(async () => {
    const now = Date.now();
    let dirty = false;

    const due = db.data.reminders.filter((r) => !r.sent && r.at <= now);
    for (const reminder of due) {
      const sock = getSock(reminder.sessionId || 'main');
      if (!sock?.user) continue;
      try {
        await sock.sendMessage(reminder.chat, { text: `⏰ *A-X-HK REMINDER*\n\n${reminder.text}` });
        reminder.sent = true;
        dirty = true;
      } catch (err) { logger.warn({ err, reminder }, 'Reminder send failed'); }
    }

    const scheduledMessages = (db.data.scheduledMessages || []).filter((r) => !r.sent && r.at <= now);
    for (const row of scheduledMessages) {
      const sock = getSock(row.sessionId || 'main');
      if (!sock?.user) continue;
      try {
        await sendScheduledMessage(sock, row);
        row.sent = true;
        row.sentAt = new Date().toISOString();
        dirty = true;
      } catch (err) { logger.warn({ err, row }, 'Scheduled message send failed'); }
    }

    const scheduledStatuses = (db.data.scheduledStatuses || []).filter((r) => !r.sent && r.at <= now);
    for (const row of scheduledStatuses) {
      const sock = getSock(row.sessionId || 'main');
      if (!sock?.user) continue;
      try {
        await sendScheduledStatus(sock, row);
        row.sent = true;
        row.sentAt = new Date().toISOString();
        if (row.filePath) await fs.rm(row.filePath, { force: true }).catch(() => {});
        dirty = true;
      } catch (err) { logger.warn({ err, row }, 'Scheduled status send failed'); }
    }

    const events = (db.data.events || []).filter((r) => !r.sent && r.at <= now);
    for (const event of events) {
      const sock = getSock(event.sessionId || 'main');
      if (!sock?.user) continue;
      try {
        await sock.sendMessage(event.chat, { text: `📅 *A-X-HK EVENT*\n\n${event.name}\nEvent time has arrived.` });
        event.sent = true;
        dirty = true;
      } catch (err) { logger.warn({ err, event }, 'Event send failed'); }
    }

    const z = zonedParts();
    if (z.hour >= 8) {
      for (const bday of db.data.birthdays || []) {
        if (bday.lastSentYear === z.year) continue;
        const md = String(bday.date || '').slice(5);
        if (md !== `${z.month}-${z.day}`) continue;
        const sock = getSock(bday.sessionId || 'main');
        if (!sock?.user) continue;
        try {
          await sock.sendMessage(bday.chat, { text: `🎂 *HAPPY BIRTHDAY ${String(bday.name || '').toUpperCase()}!* 🎉\n\nWishing you a great year ahead.\n\n${config.footerMessage}` });
          bday.lastSentYear = z.year;
          dirty = true;
        } catch (err) { logger.warn({ err, bday }, 'Birthday wish failed'); }
      }
    }

    if (dirty) await db.save();
  }, 10_000);
  timer.unref?.();
}

export function stopReminderWorker() {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}
