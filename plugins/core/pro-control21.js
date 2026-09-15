import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { registerCommand, allCommands, commandsByCategory, getCommand } from '../../lib/core/registry.js';
import { db } from '../../lib/core/database.js';
import { config } from '../../lib/config.js';
import { logger } from '../../lib/core/logger.js';
import { getAIStatus } from '../../lib/services/ai.js';
import { groupActivity, silentMembers, topActiveMembers } from '../../lib/services/group-analytics.js';
import { contextInfo, extractText, targetJidFromMessage, unwrapMessage } from '../../lib/utils/message.js';
import { cleanJid } from '../../lib/utils/text.js';

const onValues = new Set(['on', 'true', 'yes', '1', 'enable', 'enabled']);
const offValues = new Set(['off', 'false', 'no', '0', 'disable', 'disabled']);
const STATUS_DIR = path.join(config.dataDir, 'scheduled-status');

function box(title, rows, icon = '💎') {
  return [`╭━━━〔 ${icon} ${title} ${icon} 〕━━━╮`, ...rows.filter(Boolean), '╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯'].join('\n');
}
function state(value) { return value ? 'ON ✅' : 'OFF ❌'; }
function shortJid(jid = '') { return `@${String(jid || '').split('@')[0]}`; }
function cleanText(value = '', max = 1200) { return String(value || '').replace(/[\r\t]+/g, ' ').trim().slice(0, max); }
function id(prefix = 'ax') { return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`; }
function ensureQueues() {
  db.data.scheduledMessages ||= [];
  db.data.scheduledStatuses ||= [];
  db.data.groupActivity ||= {};
}
function fmtTime(ms) {
  try { return new Intl.DateTimeFormat('en-GB', { timeZone: config.timezone, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(ms)); }
  catch { return new Date(ms).toISOString(); }
}
function tzParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: config.timezone,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  return { year: Number(get('year')), month: Number(get('month')), day: Number(get('day')), hour: Number(get('hour')), minute: Number(get('minute')) };
}
function zonedToUtcMs({ year, month, day, hour, minute }) {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  const actual = tzParts(new Date(utcGuess));
  const actualAsUtc = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, 0, 0);
  return utcGuess - (actualAsUtc - utcGuess);
}
function addDaysZoned(base, days) {
  const noon = zonedToUtcMs({ year: base.year, month: base.month, day: base.day, hour: 12, minute: 0 });
  return tzParts(new Date(noon + days * 24 * 60 * 60 * 1000));
}
function parseTimeToken(token = '') {
  const raw = String(token || '').trim().toLowerCase().replace(/\./g, '');
  const m = raw.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = Number(m[2] || 0);
  if (minute > 59) return null;
  const ap = m[3];
  if (ap) {
    if (hour < 1 || hour > 12) return null;
    if (ap === 'pm' && hour !== 12) hour += 12;
    if (ap === 'am' && hour === 12) hour = 0;
  } else if (hour > 23) return null;
  return { hour, minute };
}
function parseWhenAndText(input = '') {
  const source = cleanText(input, 2000);
  const now = Date.now();
  let m = source.match(/^in\s+(\d{1,4})\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days)\b\s*(.*)$/i);
  if (m) {
    const n = Math.max(1, Number(m[1]));
    const unit = m[2].toLowerCase();
    const factor = unit.startsWith('h') ? 3600000 : unit.startsWith('d') ? 86400000 : 60000;
    return { at: now + n * factor, text: cleanText(m[3], 1200), whenText: `in ${n}${unit[0]}` };
  }
  m = source.match(/^(tomorrow|kal)\s+(\S+)\s*(.*)$/i);
  if (m) {
    const t = parseTimeToken(m[2]);
    if (!t) return null;
    const base = addDaysZoned(tzParts(), 1);
    return { at: zonedToUtcMs({ ...base, hour: t.hour, minute: t.minute }), text: cleanText(m[3], 1200), whenText: `${m[1]} ${m[2]}` };
  }
  m = source.match(/^(\d{4}-\d{2}-\d{2})\s+(\S+)\s*(.*)$/);
  if (m) {
    const t = parseTimeToken(m[2]);
    if (!t) return null;
    const [year, month, day] = m[1].split('-').map(Number);
    return { at: zonedToUtcMs({ year, month, day, hour: t.hour, minute: t.minute }), text: cleanText(m[3], 1200), whenText: `${m[1]} ${m[2]}` };
  }
  const [first, ...rest] = source.split(/\s+/);
  const t = parseTimeToken(first);
  if (t) {
    const p = tzParts();
    let at = zonedToUtcMs({ ...p, hour: t.hour, minute: t.minute });
    if (at <= now + 60_000) {
      const tomorrow = addDaysZoned(p, 1);
      at = zonedToUtcMs({ ...tomorrow, hour: t.hour, minute: t.minute });
    }
    return { at, text: cleanText(rest.join(' '), 1200), whenText: first };
  }
  return null;
}
function quotedMessage(ctx) { return contextInfo(ctx.msg)?.quotedMessage || null; }
function quotedParticipant(ctx) { return cleanJid(contextInfo(ctx.msg)?.participant || ctx.sender || ''); }
function messageInfo(message = {}) {
  const m = unwrapMessage(message || {});
  if (m.conversation || m.extendedTextMessage?.text) return { kind: 'text', text: (m.conversation || m.extendedTextMessage?.text || '').trim() };
  if (m.imageMessage) return { kind: 'image', mimetype: m.imageMessage.mimetype || 'image/jpeg' };
  if (m.videoMessage) return { kind: 'video', mimetype: m.videoMessage.mimetype || 'video/mp4' };
  if (m.audioMessage) return { kind: 'audio', mimetype: m.audioMessage.mimetype || 'audio/ogg' };
  if (m.stickerMessage) return { kind: 'sticker', mimetype: m.stickerMessage.mimetype || 'image/webp' };
  return { kind: 'unknown' };
}
function audienceFromGroup(ctx) {
  const seen = new Set();
  const rows = [];
  for (const p of ctx.metadata?.participants || []) {
    const jid = cleanJid(p.phoneNumber || p.id || p.lid || '');
    if (jid && !seen.has(jid) && !jid.endsWith('@g.us')) { seen.add(jid); rows.push(jid); }
  }
  return rows.slice(0, 512);
}
async function saveStatusJob(ctx, parsed) {
  if (JSON.stringify(ctx.msg.message || {}).includes('viewOnceMessage')) throw new Error('View-once media status scheduling allowed nahi hai. Normal media par reply karo.');
  const q = quotedMessage(ctx);
  const message = q || ctx.msg.message || {};
  const info = messageInfo(message);
  const caption = cleanText(parsed.text || extractText({ message }) || `Scheduled GC Status • ${ctx.metadata?.subject || config.shortName}`, 700);
  const row = {
    id: id('status'), sessionId: ctx.sessionId, chat: ctx.chat, createdBy: ctx.sender, createdAt: new Date().toISOString(),
    at: parsed.at, sent: false, type: info.kind, caption, timezone: config.timezone,
    statusJidList: ctx.isGroup ? audienceFromGroup(ctx) : []
  };
  if (info.kind === 'text') {
    row.text = cleanText(parsed.text || info.text || extractText({ message }), 900);
    row.type = 'text';
  } else if (info.kind === 'image' || info.kind === 'video') {
    await fs.mkdir(STATUS_DIR, { recursive: true });
    const target = { ...ctx.msg, key: { ...ctx.msg.key, participant: quotedParticipant(ctx) }, message };
    const buffer = await downloadMediaMessage(target, 'buffer', {}, { logger, reuploadRequest: ctx.sock.updateMediaMessage });
    if (!buffer?.length) throw new Error('Media download nahi ho saki. Dobara try karo.');
    if (buffer.length > 65 * 1024 * 1024) throw new Error('Media bohat large hai. 65MB se chhoti video/image use karo.');
    const ext = info.kind === 'image' ? '.jpg' : '.mp4';
    row.filePath = path.join(STATUS_DIR, `${row.id}${ext}`);
    row.mimetype = info.mimetype;
    await fs.writeFile(row.filePath, buffer);
  } else {
    row.type = 'text';
    row.text = caption;
  }
  ensureQueues();
  db.data.scheduledStatuses.push(row);
  await db.save();
  return row;
}

registerCommand({
  name: 'selftest', aliases: ['fullcheck', 'botcheck', 'checkall'], category: 'system', ownerOnly: true,
  description: 'Run A-X-HK self test for session, DB, commands, queues and safety controls', cooldown: 4,
  async run(ctx) {
    ensureQueues();
    const deep = ['deep', 'full'].includes(String(ctx.args[0] || '').toLowerCase()) || ctx.command.name === 'fullcheck';
    const rows = [];
    rows.push(`┃ WhatsApp        ${ctx.sock?.user ? 'CONNECTED ✅' : 'NOT READY ⚠️'}`);
    rows.push(`┃ DB Ready        ${db.ready ? 'YES ✅' : 'NO ⚠️'}`);
    rows.push(`┃ Commands        ${allCommands().length} unique`);
    rows.push(`┃ Categories      ${Object.keys(commandsByCategory()).length}`);
    rows.push(`┃ Session         ${ctx.sessionId}`);
    rows.push(`┃ Mode            ${ctx.sessionSettings.mode || config.mode}`);
    rows.push(`┃ Scheduled Msg   ${db.data.scheduledMessages.filter((r) => !r.sent).length}`);
    rows.push(`┃ Scheduled Status ${db.data.scheduledStatuses.filter((r) => !r.sent).length}`);
    rows.push(`┃ Group Analytics ${Object.keys(db.data.groupActivity || {}).length} groups`);
    rows.push(`┃ Ban Protect     ${state(ctx.sessionSettings.banProtection !== false)}`);
    try {
      await fs.mkdir(config.dataDir, { recursive: true });
      const file = path.join(config.dataDir, `.selftest-${Date.now()}.tmp`);
      await fs.writeFile(file, 'ok'); await fs.rm(file, { force: true });
      rows.push('┃ Data Write      OK ✅');
    } catch { rows.push('┃ Data Write      FAILED ⚠️'); }
    const ai = getAIStatus();
    rows.push(`┃ AI Route        ${ai.enabled ? 'ENABLED' : 'OFF'} / ${ai.configuredModel || ai.lastWorkingModel || 'auto'}`);
    if (deep) rows.push('┃ Deep Check      static runtime checks passed without network download');
    await ctx.reply([box('A-X-HK SELF TEST', rows, '🧪'), '', box('NEXT TESTS', [`┃ ${ctx.prefix}dlcheck`, `┃ ${ctx.prefix}groupstats`, `┃ ${ctx.prefix}riskmeter`, `┃ ${ctx.prefix}scheduled`], '✅'), '', config.footerMessage].join('\n'));
  }
});

registerCommand({
  name: 'groupstats', aliases: ['gcstats', 'groupanalytics'], category: 'group', groupOnly: true, cooldown: 4,
  description: 'Show premium group analytics and activity summary',
  async run(ctx) {
    const a = groupActivity(ctx);
    const members = ctx.metadata?.participants?.length || 0;
    const admins = ctx.metadata?.participants?.filter((p) => p.admin).length || 0;
    const active = Object.keys(a.members || {}).length;
    const top = topActiveMembers(ctx, 5);
    await ctx.reply([
      box('GROUP ANALYTICS', [`┃ Group      ${ctx.metadata?.subject || 'Group'}`, `┃ Members    ${members}`, `┃ Admins     ${admins}`, `┃ Messages   ${a.messages || 0}`, `┃ Commands   ${a.commands || 0}`, `┃ Active Seen ${active}`, `┃ Last Seen  ${a.lastAt ? fmtTime(new Date(a.lastAt).getTime()) : 'N/A'}`], '📊'),
      '',
      box('TOP ACTIVE', top.length ? top.map((r) => `┃ ${r.index}. ${r.label} • ${r.messages} msg`) : ['┃ No activity yet'], '🏆'),
      '', config.footerMessage
    ].join('\n'), { mentions: top.map((r) => r.jid) });
  }
});

registerCommand({ name: 'topactive', aliases: ['activemembers'], category: 'group', groupOnly: true, description: 'List top active group members', cooldown: 4, async run(ctx) {
  const top = topActiveMembers(ctx, Number(ctx.args[0]) || 10);
  await ctx.reply(`${box('TOP ACTIVE MEMBERS', top.length ? top.map((r) => `┃ ${String(r.index).padStart(2, '0')}. ${r.label} • ${r.messages} msg • ${r.commands} cmd`) : ['┃ No activity yet'], '🏆')}\n\n${config.footerMessage}`, { mentions: top.map((r) => r.jid) });
}});

registerCommand({ name: 'silentmembers', aliases: ['inactive', 'silentgc'], category: 'group', groupOnly: true, adminOnly: true, description: 'List silent/inactive members based on tracked messages', cooldown: 5, async run(ctx) {
  const days = Number(ctx.args[0]) || 7;
  const rows = silentMembers(ctx, days, 30);
  await ctx.reply(`${box(`SILENT MEMBERS ${days}D`, rows.length ? rows.map((jid, i) => `┃ ${String(i + 1).padStart(2, '0')}. ${shortJid(jid)}`) : ['┃ No silent members detected'], '🔕')}\n\n${config.footerMessage}`, { mentions: rows });
}});

registerCommand({ name: 'warnlist', aliases: ['warninglist'], category: 'group', groupOnly: true, adminOnly: true, description: 'Show warning list for this group', cooldown: 3, async run(ctx) {
  const prefix = db.warningKey(ctx.sessionId, ctx.chat, '').replace(/:$/, '');
  const rows = Object.entries(db.data.warnings || {})
    .filter(([key, count]) => key.startsWith(prefix) && Number(count) > 0)
    .map(([key, count]) => ({ jid: key.slice(prefix.length + 1), count }))
    .filter((r) => r.jid.includes('@'))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);
  const mentions = rows.map((r) => r.jid).filter((jid) => jid.includes('@'));
  await ctx.reply(`${box('GROUP WARNING LIST', rows.length ? rows.map((r, i) => `┃ ${i + 1}. ${shortJid(r.jid)} • ${r.count}`) : ['┃ No warnings saved'], '⚠️')}\n\n${config.footerMessage}`, { mentions });
}});

registerCommand({ name: 'resetwarn', aliases: ['clearwarnings', 'delwarn'], category: 'group', groupOnly: true, adminOnly: true, description: 'Reset warnings for one member or all', usage: 'resetwarn @user | resetwarn all', cooldown: 3, async run(ctx) {
  if (String(ctx.args[0] || '').toLowerCase() === 'all') {
    const prefix = db.warningKey(ctx.sessionId, ctx.chat, '').replace(/:$/, '');
    for (const key of Object.keys(db.data.warnings || {})) if (key.startsWith(prefix)) delete db.data.warnings[key];
    await db.save();
    return ctx.reply('✅ All warnings cleared for this group.');
  }
  const target = targetJidFromMessage(ctx.msg, ctx.args);
  if (!target) return ctx.reply(`Usage: ${ctx.prefix}resetwarn @user OR ${ctx.prefix}resetwarn all`);
  delete db.data.warnings[db.warningKey(ctx.sessionId, ctx.chat, target)];
  await db.save();
  await ctx.reply(`✅ Warnings reset for ${shortJid(target)}.`, { mentions: [target] });
}});

registerCommand({ name: 'setwarnlimit', aliases: ['warnlimit'], category: 'group', groupOnly: true, adminOnly: true, description: 'Set group warning limit for kick actions', usage: 'setwarnlimit 3', cooldown: 3, async run(ctx) {
  const n = Math.max(1, Math.min(20, Number(ctx.args[0]) || 3));
  ctx.groupSettings.badWarnLimit = n;
  ctx.groupSettings.linkWarnLimit = n;
  await db.save();
  await ctx.reply(`✅ Warning limit saved: ${n}`);
}});

registerCommand({ name: 'schedule', aliases: ['schedulemsg', 'latermsg'], category: 'productivity', groupOnly: false, adminOnly: false, description: 'Schedule a message in current chat', usage: 'schedule 9pm hello group', cooldown: 3, async run(ctx) {
  if (ctx.isGroup && !ctx.isAdmin && !ctx.isOwner) return;
  const parsed = parseWhenAndText(ctx.argText);
  if (!parsed || !parsed.text) return ctx.reply(`Usage:\n${ctx.prefix}schedule 9pm hello group\n${ctx.prefix}schedule in 10m test\n${ctx.prefix}schedule tomorrow 8:30pm message`);
  ensureQueues();
  const row = { id: id('msg'), sessionId: ctx.sessionId, chat: ctx.chat, createdBy: ctx.sender, createdAt: new Date().toISOString(), at: parsed.at, text: parsed.text, sent: false };
  db.data.scheduledMessages.push(row);
  await db.save();
  await ctx.reply(`${box('MESSAGE SCHEDULED', [`┃ ID   ${row.id}`, `┃ Time ${fmtTime(row.at)}`, `┃ Chat ${ctx.isGroup ? (ctx.metadata?.subject || 'Group') : 'Inbox'}`], '⏰')}\n\n${config.footerMessage}`);
}});

registerCommand({ name: 'scheduled', aliases: ['schedulelist', 'queues'], category: 'productivity', description: 'Show pending scheduled messages/statuses', cooldown: 3, async run(ctx) {
  ensureQueues();
  const messages = db.data.scheduledMessages.filter((r) => !r.sent && r.sessionId === ctx.sessionId).slice(0, 8);
  const statuses = db.data.scheduledStatuses.filter((r) => !r.sent && r.sessionId === ctx.sessionId).slice(0, 8);
  await ctx.reply([
    box('SCHEDULED MESSAGES', messages.length ? messages.map((r) => `┃ ${r.id} • ${fmtTime(r.at)}`) : ['┃ None'], '⏰'),
    '',
    box('SCHEDULED STATUS', statuses.length ? statuses.map((r) => `┃ ${r.id} • ${fmtTime(r.at)} • ${r.type}`) : ['┃ None'], '📲'),
    '', config.footerMessage
  ].join('\n'));
}});

registerCommand({ name: 'cancelschedule', aliases: ['delschedule', 'unschedule'], category: 'productivity', description: 'Cancel scheduled message/status by ID', usage: 'cancelschedule msg_xxx', cooldown: 3, async run(ctx) {
  const target = String(ctx.args[0] || '').trim();
  if (!target) return ctx.reply(`Usage: ${ctx.prefix}cancelschedule <id>`);
  ensureQueues();
  let found = false;
  for (const row of [...db.data.scheduledMessages, ...db.data.scheduledStatuses]) {
    if (row.id === target && row.sessionId === ctx.sessionId) { row.sent = true; row.cancelled = true; found = true; }
  }
  await db.save();
  await ctx.reply(found ? `✅ Cancelled ${target}` : 'Schedule ID not found.');
}});

registerCommand({ name: 'schedulestatus', aliases: ['statusschedule', 'schedstatus'], category: 'premium', ownerOnly: true, description: 'Schedule bot WhatsApp status from replied text/image/video', usage: 'schedulestatus 9pm caption', cooldown: 5, async run(ctx) {
  const parsed = parseWhenAndText(ctx.argText);
  if (!parsed) return ctx.reply(`Usage:\nReply text/image/video then ${ctx.prefix}schedulestatus 9pm caption\n${ctx.prefix}schedulestatus in 10m text status`);
  try {
    const row = await saveStatusJob(ctx, parsed);
    await ctx.reply(`${box('STATUS SCHEDULED', [`┃ ID   ${row.id}`, `┃ Type ${row.type}`, `┃ Time ${fmtTime(row.at)}`, `┃ GC   ${ctx.isGroup ? (ctx.metadata?.subject || 'Group') : 'Inbox'}`], '📲')}\n\n${config.footerMessage}`);
  } catch (err) { await ctx.reply(`⚠️ ${err.message}`); }
}});

registerCommand({ name: 'statusqueue', aliases: ['scheduledstatus', 'statuslistqueue'], category: 'premium', ownerOnly: true, description: 'Show pending scheduled statuses', cooldown: 3, async run(ctx) {
  ensureQueues();
  const rows = db.data.scheduledStatuses.filter((r) => !r.sent && r.sessionId === ctx.sessionId).slice(0, 15);
  await ctx.reply(`${box('SCHEDULED STATUS QUEUE', rows.length ? rows.map((r) => `┃ ${r.id} • ${r.type} • ${fmtTime(r.at)}`) : ['┃ None'], '📲')}\n\n${config.footerMessage}`);
}});

registerCommand({ name: 'cancelstatus', aliases: ['delstatusschedule'], category: 'premium', ownerOnly: true, description: 'Cancel scheduled status by ID', usage: 'cancelstatus status_xxx', cooldown: 3, async run(ctx) {
  const target = String(ctx.args[0] || '').trim();
  ensureQueues();
  const row = db.data.scheduledStatuses.find((r) => r.id === target && r.sessionId === ctx.sessionId && !r.sent);
  if (!row) return ctx.reply('Scheduled status ID not found.');
  row.sent = true; row.cancelled = true;
  if (row.filePath) await fs.rm(row.filePath, { force: true }).catch(() => {});
  await db.save();
  await ctx.reply(`✅ Scheduled status cancelled: ${target}`);
}});

registerCommand({ name: 'gnote', aliases: ['groupnote'], category: 'group', groupOnly: true, adminOnly: true, description: 'Add/read a group note', usage: 'gnote add title text OR gnote title', cooldown: 3, async run(ctx) {
  const notes = db.noteBucket(ctx.sessionId, ctx.chat);
  const mode = String(ctx.args[0] || '').toLowerCase();
  if (['add', 'set'].includes(mode)) {
    const title = cleanText(ctx.args[1] || '', 40).toLowerCase();
    const text = cleanText(ctx.args.slice(2).join(' '), 2000);
    if (!title || !text) return ctx.reply(`Usage: ${ctx.prefix}gnote add rules Be respectful`);
    notes[title] = { text, by: ctx.sender, at: new Date().toISOString() };
    await db.save();
    return ctx.reply(`✅ Group note saved: ${title}`);
  }
  const key = cleanText(ctx.argText, 80).toLowerCase();
  if (!key) return ctx.reply(`Usage:\n${ctx.prefix}gnote add title text\n${ctx.prefix}gnote title\n${ctx.prefix}gnotes`);
  const note = notes[key];
  await ctx.reply(note ? `${box(`GROUP NOTE: ${key.toUpperCase()}`, note.text.split('\n').slice(0, 20).map((r) => `┃ ${r.slice(0, 90)}`), '📝')}\n\n${config.footerMessage}` : 'Group note not found.');
}});

registerCommand({ name: 'gnotes', aliases: ['groupnotes'], category: 'group', groupOnly: true, description: 'List group notes', cooldown: 3, async run(ctx) {
  const keys = Object.keys(db.noteBucket(ctx.sessionId, ctx.chat) || {}).sort();
  await ctx.reply(`${box('GROUP NOTES', keys.length ? keys.slice(0, 40).map((k, i) => `┃ ${i + 1}. ${k}`) : ['┃ No group notes saved'], '📝')}\n\n${config.footerMessage}`);
}});

registerCommand({ name: 'delgnote', aliases: ['deletegnote'], category: 'group', groupOnly: true, adminOnly: true, description: 'Delete a group note', usage: 'delgnote rules', cooldown: 3, async run(ctx) {
  const key = cleanText(ctx.argText, 80).toLowerCase();
  if (!key) return ctx.reply(`Usage: ${ctx.prefix}delgnote title`);
  const notes = db.noteBucket(ctx.sessionId, ctx.chat);
  const existed = Boolean(notes[key]);
  delete notes[key];
  await db.save();
  await ctx.reply(existed ? '✅ Group note deleted.' : 'Group note not found.');
}});

registerCommand({ name: 'riskmeter', aliases: ['banrisk', 'riskstatus'], category: 'security', ownerOnly: true, description: 'Show smart ban-risk meter from command activity and automation toggles', cooldown: 4, async run(ctx) {
  const s = ctx.sessionSettings;
  const riskyToggles = ['autoReply', 'autoVoice', 'autoSticker', 'autoReact', 'statusReply', 'statusReact', 'autoTyping', 'autoRecording'].filter((k) => Boolean(s[k])).length;
  const today = db.data.metrics?.daily?.[new Date().toISOString().slice(0, 10)] || {};
  const commands = Number(today.commands || 0);
  const score = Math.min(100, riskyToggles * 10 + Math.floor(commands / 25) + (s.banProtection === false ? 25 : 0));
  const level = score >= 70 ? 'HIGH ⚠️' : score >= 35 ? 'MEDIUM 🟡' : 'LOW ✅';
  await ctx.reply(`${box('SMART BAN RISK METER', [`┃ Level    ${level}`, `┃ Score    ${score}/100`, `┃ Toggles  ${riskyToggles} risky auto features ON`, `┃ Today    ${commands} commands`, `┃ Protect  ${state(s.banProtection !== false)}`], '🧯')}\n\n${config.footerMessage}`);
}});

registerCommand({ name: 'commandtester', aliases: ['cmdtester', 'testcmdinfo'], category: 'system', description: 'Show command usage/access without running it', usage: 'commandtester play', cooldown: 2, async run(ctx) {
  const q = String(ctx.args[0] || '').toLowerCase().replace(/^\./, '');
  const cmd = getCommand(q);
  if (!cmd) return ctx.reply(`Usage: ${ctx.prefix}commandtester <command>`);
  await ctx.reply(`${box('COMMAND TESTER', [`┃ Command  ${ctx.prefix}${cmd.name}`, `┃ Category ${cmd.category}`, `┃ Owner    ${cmd.ownerOnly ? 'YES' : 'NO'}`, `┃ Admin    ${cmd.adminOnly ? 'YES' : 'NO'}`, `┃ Group    ${cmd.groupOnly ? 'YES' : 'NO'}`, `┃ Usage    ${ctx.prefix}${cmd.usage || cmd.name}`], '🧪')}\n\n${cmd.description || 'No description'}\n\n${config.footerMessage}`);
}});

registerCommand({ name: 'dashboardv2', aliases: ['prodashboard', 'panelv2'], category: 'owner', ownerOnly: true, description: 'Show Premium Dashboard V2 feature guide', cooldown: 3, async run(ctx) {
  await ctx.reply([box('DASHBOARD V2 CONTROL MAP', [`┃ Safety Center     ${ctx.prefix}safetycenter`, `┃ Group Control     ${ctx.prefix}groupcontrol`, `┃ Command Logs      ${ctx.prefix}commandlogs`, `┃ Scheduled Queue   ${ctx.prefix}scheduled`, `┃ Risk Meter        ${ctx.prefix}riskmeter`, `┃ Self Test         ${ctx.prefix}selftest`, `┃ Public Portal     ${config.publicUrl.replace(/\/$/, '')}/link`], '📱'), '', config.footerMessage].join('\n'));
}});
