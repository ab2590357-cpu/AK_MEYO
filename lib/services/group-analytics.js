import { db } from '../core/database.js';
import { cleanJid } from '../utils/text.js';

const MAX_MEMBERS = 500;

function memberLabel(jid = '') {
  return `@${String(jid || '').split('@')[0]}`;
}

export function trackGroupActivity(ctx) {
  if (!ctx?.isGroup || !ctx.chat || !ctx.sender || ctx.msg?.key?.fromMe) return;
  db.data.groupActivity ||= {};
  const key = db.scopedKey(ctx.sessionId, ctx.chat);
  const nowIso = new Date().toISOString();
  const bucket = db.data.groupActivity[key] ||= {
    chat: ctx.chat,
    subject: ctx.metadata?.subject || 'Group',
    messages: 0,
    commands: 0,
    lastAt: nowIso,
    members: {}
  };
  bucket.chat = ctx.chat;
  bucket.subject = ctx.metadata?.subject || bucket.subject || 'Group';
  bucket.messages = Number(bucket.messages || 0) + 1;
  bucket.lastAt = nowIso;
  bucket.members ||= {};
  const sender = cleanJid(ctx.sender);
  const row = bucket.members[sender] ||= { messages: 0, commands: 0, firstAt: nowIso, lastAt: nowIso, lastText: '' };
  row.messages = Number(row.messages || 0) + 1;
  row.lastAt = nowIso;
  row.lastText = String(ctx.text || '').replace(/\s+/g, ' ').slice(0, 160);
  const entries = Object.entries(bucket.members);
  if (entries.length > MAX_MEMBERS) {
    bucket.members = Object.fromEntries(entries.sort((a, b) => Number(b[1].messages || 0) - Number(a[1].messages || 0)).slice(0, MAX_MEMBERS));
  }
}

export function trackGroupCommand(ctx) {
  if (!ctx?.isGroup || !ctx.chat || !ctx.sender) return;
  db.data.groupActivity ||= {};
  const key = db.scopedKey(ctx.sessionId, ctx.chat);
  const bucket = db.data.groupActivity[key];
  if (!bucket) return;
  bucket.commands = Number(bucket.commands || 0) + 1;
  const sender = cleanJid(ctx.sender);
  const row = bucket.members?.[sender];
  if (row) row.commands = Number(row.commands || 0) + 1;
}

export function groupActivity(ctx) {
  db.data.groupActivity ||= {};
  const key = db.scopedKey(ctx.sessionId, ctx.chat);
  return db.data.groupActivity[key] || { chat: ctx.chat, subject: ctx.metadata?.subject || 'Group', messages: 0, commands: 0, members: {} };
}

export function topActiveMembers(ctx, limit = 10) {
  const activity = groupActivity(ctx);
  return Object.entries(activity.members || {})
    .sort((a, b) => Number(b[1].messages || 0) - Number(a[1].messages || 0))
    .slice(0, Math.max(1, Math.min(50, Number(limit) || 10)))
    .map(([jid, row], index) => ({ index: index + 1, jid, label: memberLabel(jid), messages: Number(row.messages || 0), commands: Number(row.commands || 0), lastAt: row.lastAt || '' }));
}

export function silentMembers(ctx, days = 7, limit = 25) {
  const known = new Set(Object.keys(groupActivity(ctx).members || {}));
  const cutoff = Date.now() - Math.max(1, Math.min(365, Number(days) || 7)) * 24 * 60 * 60 * 1000;
  const rows = [];
  for (const p of ctx.metadata?.participants || []) {
    const jid = cleanJid(p.phoneNumber || p.id || p.lid || '');
    if (!jid) continue;
    const last = groupActivity(ctx).members?.[jid]?.lastAt;
    if (!known.has(jid) || !last || new Date(last).getTime() < cutoff) rows.push(jid);
  }
  return rows.slice(0, Math.max(1, Math.min(100, Number(limit) || 25)));
}
