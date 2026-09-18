import { registerCommand } from '../../lib/core/registry.js';
import { db } from '../../lib/core/database.js';
import { config } from '../../lib/config.js';
import { listInspectableSessions, resolveInspectableSession } from '../../lib/services/session-inspector.js';

const yesNo = (value) => value ? 'ON' : 'OFF';
const guard = (ctx) => ctx.sessionId === 'main' && ctx.isMasterOwnerAction;

registerCommand({
  name: 'activebot',
  aliases: ['activebots'],
  category: 'owner',
  description: 'Master-owner view of active linked bot sessions',
  usage: 'activebot',
  ownerOnly: true,
  masterOnly: true,
  cooldown: 2,
  async run(ctx) {
    if (!guard(ctx)) return;
    const rows = listInspectableSessions();
    const active = rows.filter((r) => r.connected);
    const lines = [
      '╭━━━〔 🤖 A_X_HK ACTIVE BOT 〕━━━╮',
      `┃ Active : ${active.length}`,
      `┃ Saved  : ${rows.length}`,
      '╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
      ''
    ];
    if (!active.length) {
      lines.push('No connected bot sessions right now.');
    } else {
      active.forEach((r, i) => {
        lines.push(
          `${i + 1}. *${r.phone || '-'}*${r.linkedName ? ` — ${r.linkedName}` : ''}`,
          `   Session: ${r.id}`,
          `   Status : ${String(r.status || 'connected').toUpperCase()}`,
          ''
        );
      });
    }
    const offline = rows.length - active.length;
    if (offline > 0) lines.push(`Offline / not connected: ${offline}`);
    await ctx.reply(lines.join('\n').trim());
  }
});

registerCommand({
  name: 'sessionsettings',
  aliases: ['linkedsettings'],
  category: 'owner',
  description: 'Master-owner summary of settings for a linked session by full number or session ID',
  usage: 'sessionsettings <number|session-id>',
  ownerOnly: true,
  masterOnly: true,
  cooldown: 2,
  async run(ctx) {
    if (!guard(ctx)) return;
    const target = String(ctx.args[0] || '').trim();
    const row = resolveInspectableSession(target);
    if (!row) return ctx.reply(`Usage: ${ctx.prefix}sessionsettings <number|session-id>\nUse ${ctx.prefix}activebot to see full numbers and IDs.`);
    const s = db.session(row.id);
    const q = s.quietHours || {};
    await ctx.reply([
      '╭━━━〔 ⚙️ A_X_HK SESSION SETTINGS 〕━━━╮',
      `┃ Name       : ${row.linkedName || row.label || 'Linked User'}`,
      `┃ Number     : ${row.phone || '-'}`,
      `┃ Session ID : ${row.id}`,
      '┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫',
      `┃ Prefix     : ${s.prefix || config.prefix || '.'}`,
      `┃ Mode       : ${String(s.mode || config.mode || 'public').toUpperCase()}`,
      `┃ Auto Read  : ${yesNo(s.autoRead)}`,
      `┃ Auto React : ${yesNo(s.autoReact)}`,
      `┃ Auto Typing: ${yesNo(s.autoTyping)}`,
      `┃ Recording  : ${yesNo(s.autoRecording)}`,
      `┃ Always On  : ${yesNo(s.alwaysOnline)}`,
      `┃ AutoSticker: ${yesNo(s.autoSticker)}`,
      `┃ Auto Voice : ${yesNo(s.autoVoice)}`,
      `┃ Status Seen: ${yesNo(s.statusSeen)}`,
      `┃ StatusReply: ${yesNo(s.statusReply)}`,
      `┃ StatusReact: ${yesNo(s.statusReact)}`,
      `┃ Anti Call  : ${yesNo(s.antiCall)}`,
      `┃ Anti Delete: ${yesNo(s.antiDeletePrivate)}`,
      `┃ Chatbot    : ${yesNo(s.chatbot)}`,
      `┃ Quiet Hours: ${q.enabled ? `${q.start}-${q.end}` : 'OFF'}`,
      `┃ Fun Visuals: ${yesNo(s.funVisuals !== false)}`,
      `┃ AutoCleanup: ${yesNo(s.autoCleanup !== false)}`,
      '╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯'
    ].join('\n'));
  }
});

registerCommand({
  name: 'cfile',
  aliases: ['sessionstate'],
  category: 'owner',
  description: 'Master-owner check for a saved linked session state by full number or session ID',
  usage: 'cfile <number|session-id>',
  ownerOnly: true,
  masterOnly: true,
  cooldown: 2,
  async run(ctx) {
    if (!guard(ctx)) return;
    const target = String(ctx.args[0] || '').trim();
    const row = resolveInspectableSession(target);
    if (!row) return ctx.reply(`Usage: ${ctx.prefix}cfile <number|session-id>\nUse ${ctx.prefix}activebot to see full numbers and IDs.`);
    await ctx.reply([
      '╭━━━〔 📁 A_X_HK SESSION STATE 〕━━━╮',
      `┃ Name      : ${row.linkedName || row.label || 'Linked User'}`,
      `┃ Number    : ${row.phone || '-'}`,
      `┃ Session ID: ${row.id}`,
      `┃ Status    : ${String(row.status || 'offline').toUpperCase()}`,
      `┃ Connected : ${row.connected ? 'YES' : 'NO'}`,
      `┃ Enabled   : ${row.enabled !== false ? 'YES' : 'NO'}`,
      '╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯'
    ].join('\n'));
  }
});
