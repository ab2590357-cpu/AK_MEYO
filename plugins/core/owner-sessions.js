import { registerCommand } from '../../lib/core/registry.js';
import { db } from '../../lib/core/database.js';
import { config } from '../../lib/config.js';
import { waManager } from '../../lib/services/whatsapp.js';
import { bareNumber, cleanJid } from '../../lib/utils/text.js';

const digits = (value = '') => String(value || '').replace(/\D/g, '');
const yesNo = (value) => value ? 'ON' : 'OFF';
const safe = (value = '', fallback = '-') => {
  const text = String(value ?? '').replace(/[\r\n\t]+/g, ' ').trim();
  return text || fallback;
};

function mainPhone() {
  const inst = waManager.getInstance('main');
  return digits(bareNumber(cleanJid(inst?.state?.user?.id || '')) || inst?.runtime?.().ownerNumber || config.ownerNumber);
}

function sessionRows() {
  const rows = [];
  const main = waManager.getInstance('main');
  const mainSnap = main?.snapshot?.() || {};
  rows.push({
    id: 'main',
    isMain: true,
    label: 'Owner Session',
    phone: mainPhone(),
    linkedName: mainSnap.user?.name || config.ownerName || 'Owner',
    status: mainSnap.status || 'offline',
    connected: mainSnap.status === 'connected' && Boolean(mainSnap.sessionRegistered),
    registered: Boolean(mainSnap.sessionRegistered),
    enabled: true,
    createdAt: null,
    lastActiveAt: mainSnap.connectedAt || null,
    lastConnectedAt: mainSnap.connectedAt || null,
    expiresAt: null,
    version: mainSnap.version || null,
    reconnectAttempt: Number(mainSnap.reconnectAttempt || 0)
  });

  for (const [id, meta] of Object.entries(db.data.linkedSessions || {})) {
    const inst = waManager.getInstance(id);
    const snap = inst?.snapshot?.() || {};
    const runtime = inst?.runtime?.() || {};
    const phone = digits(
      bareNumber(cleanJid(snap.user?.id || '')) ||
      runtime.ownerNumber ||
      meta.linkedNumber ||
      meta.phone ||
      ''
    );
    rows.push({
      id,
      isMain: false,
      label: meta.label || 'Linked User',
      phone,
      linkedName: snap.user?.name || meta.linkedName || meta.label || 'Linked User',
      status: snap.status || meta.lastStatus || 'offline',
      connected: snap.status === 'connected' && Boolean(snap.sessionRegistered),
      registered: Boolean(snap.sessionRegistered),
      enabled: meta.enabled !== false,
      createdAt: meta.createdAt || null,
      lastActiveAt: meta.lastActiveAt || null,
      lastConnectedAt: meta.lastConnectedAt || snap.connectedAt || null,
      expiresAt: meta.expiresAt || null,
      version: snap.version || null,
      reconnectAttempt: Number(snap.reconnectAttempt || 0)
    });
  }
  return rows;
}

function resolveSession(input = '') {
  const q = String(input || '').trim();
  const qDigits = digits(q);
  const rows = sessionRows();

  if (!q) return null;
  if (q.toLowerCase() === 'main') return rows.find((r) => r.id === 'main') || null;

  const byId = rows.find((r) => r.id.toLowerCase() === q.toLowerCase());
  if (byId) return byId;

  if (qDigits) {
    const exact = rows.find((r) => r.phone === qDigits);
    if (exact) return exact;
    const suffix = rows.filter((r) => r.phone && (r.phone.endsWith(qDigits) || qDigits.endsWith(r.phone)));
    if (suffix.length === 1) return suffix[0];
  }
  return null;
}

function formatDate(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return safe(value);
  try {
    return new Intl.DateTimeFormat('en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: config.timezone || 'Asia/Karachi'
    }).format(d);
  } catch {
    return d.toISOString();
  }
}

function ownerGuard(ctx) {
  return ctx.sessionId === 'main' && ctx.isMasterOwnerAction;
}

registerCommand({
  name: 'activebot',
  aliases: ['activebots', 'active'],
  category: 'owner',
  description: 'Master-owner list of linked WhatsApp bot sessions with names, numbers and live status',
  usage: 'activebot',
  ownerOnly: true,
  masterOnly: true,
  cooldown: 2,
  async run(ctx) {
    if (!ownerGuard(ctx)) return;

    const rows = sessionRows();
    const active = rows.filter((r) => r.connected);
    const inactive = rows.filter((r) => !r.connected);

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
          `${i + 1}. *${safe(r.linkedName, r.label)}*`,
          `   Number : +${r.phone || '-'}`,
          `   Session: ${r.id}`,
          `   Status : ${String(r.status || 'connected').toUpperCase()}`,
          ''
        );
      });
    }

    if (inactive.length) {
      lines.push(`Offline / not connected: ${inactive.length}`);
      lines.push(`Use ${ctx.prefix}sessioninfo <number> for full details.`);
    }

    await ctx.reply(lines.join('\n').trim());
  }
});

registerCommand({
  name: 'sessioninfo',
  aliases: ['botinfo', 'linkedinfo'],
  category: 'owner',
  description: 'Master-owner details for one linked bot session',
  usage: 'sessioninfo <number|session-id>',
  ownerOnly: true,
  masterOnly: true,
  cooldown: 2,
  async run(ctx) {
    if (!ownerGuard(ctx)) return;
    const row = resolveSession(ctx.argText);
    if (!row) {
      return ctx.reply(`Usage: ${ctx.prefix}sessioninfo <number|session-id>\nExample: ${ctx.prefix}sessioninfo 923001234567`);
    }

    await ctx.reply([
      '╭━━━〔 📱 A_X_HK SESSION INFO 〕━━━╮',
      `┃ Name      : ${safe(row.linkedName, row.label)}`,
      `┃ Number    : +${row.phone || '-'}`,
      `┃ Session ID: ${row.id}`,
      `┃ Type      : ${row.isMain ? 'MASTER / MAIN' : 'LINKED USER'}`,
      `┃ Status    : ${String(row.status || 'offline').toUpperCase()}`,
      `┃ Connected : ${row.connected ? 'YES' : 'NO'}`,
      `┃ Registered: ${row.registered ? 'YES' : 'NO / NOT LOADED'}`,
      `┃ Enabled   : ${row.enabled ? 'YES' : 'NO'}`,
      `┃ Created   : ${formatDate(row.createdAt)}`,
      `┃ Last Seen : ${formatDate(row.lastActiveAt)}`,
      `┃ Last Link : ${formatDate(row.lastConnectedAt)}`,
      `┃ Expires   : ${formatDate(row.expiresAt)}`,
      `┃ WA Version: ${safe(row.version)}`,
      `┃ Reconnect : ${row.reconnectAttempt}`,
      '╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
      '',
      `Settings: ${ctx.prefix}sessionsettings ${row.phone || row.id}`,
      `Credential state: ${ctx.prefix}cfile ${row.phone || row.id}`
    ].join('\n'));
  }
});

registerCommand({
  name: 'sessionsettings',
  aliases: ['usersettings', 'botsettings'],
  category: 'owner',
  description: 'Master-owner summary of one linked session settings',
  usage: 'sessionsettings <number|session-id>',
  ownerOnly: true,
  masterOnly: true,
  cooldown: 2,
  async run(ctx) {
    if (!ownerGuard(ctx)) return;
    const row = resolveSession(ctx.argText);
    if (!row) {
      return ctx.reply(`Usage: ${ctx.prefix}sessionsettings <number|session-id>`);
    }

    const s = db.session(row.id);
    const quiet = s.quietHours || {};
    const away = s.away || {};
    const smartCount = Object.values(s.smartReplyChats || {}).filter(Boolean).length;

    await ctx.reply([
      '╭━━━〔 ⚙️ A_X_HK USER SETTINGS 〕━━━╮',
      `┃ Name       : ${safe(row.linkedName, row.label)}`,
      `┃ Number     : +${row.phone || '-'}`,
      `┃ Session ID : ${row.id}`,
      '┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫',
      `┃ Prefix     : ${safe(s.prefix || config.prefix || '.')}`,
      `┃ Mode       : ${safe(s.mode || config.mode || 'public').toUpperCase()}`,
      `┃ Auto Read  : ${yesNo(s.autoRead)}`,
      `┃ Auto React : ${yesNo(s.autoReact)}`,
      `┃ Auto Typing: ${yesNo(s.autoTyping)}`,
      `┃ Recording  : ${yesNo(s.autoRecording)}`,
      `┃ Always On  : ${yesNo(s.alwaysOnline)}`,
      `┃ AutoSticker: ${yesNo(s.autoSticker)}`,
      `┃ Auto Voice : ${yesNo(s.autoVoice)}`,
      '┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫',
      `┃ Status Seen: ${yesNo(s.statusSeen)}`,
      `┃ StatusReply: ${yesNo(s.statusReply)}`,
      `┃ StatusReact: ${yesNo(s.statusReact)}`,
      `┃ Anti Call  : ${yesNo(s.antiCall)}`,
      `┃ Anti Delete: ${yesNo(s.antiDeletePrivate)}`,
      '┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫',
      `┃ Auto AI    : ${yesNo(s.autoAI)}`,
      `┃ Chatbot    : ${yesNo(s.chatbot)}`,
      `┃ AI Persona : ${safe(s.aiPersona, 'default')}`,
      `┃ AI Cooldown: ${Number(s.aiCooldownSeconds || 0)}s`,
      `┃ AI History : ${Number(s.aiHistoryLimit || 0)} msgs`,
      `┃ Smart Chats: ${smartCount}`,
      '┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫',
      `┃ Time Reply : ${yesNo(away.enabled !== false)}`,
      `┃ Reply Wait : ${Number(s.awayCooldownMinutes || 5)}m`,
      `┃ Quiet Hours: ${quiet.enabled ? `${safe(quiet.start)}-${safe(quiet.end)}` : 'OFF'}`,
      `┃ Fun Visuals: ${yesNo(s.funVisuals !== false)}`,
      `┃ AutoCleanup: ${yesNo(s.autoCleanup !== false)}`,
      `┃ Daily Limit: ${Number(s.dailyCommandLimit || 0)}`,
      `┃ High Risk  : ${Number(s.highRiskDailyLimit || 0)}`,
      `┃ Menu Theme : ${safe(s.menuTheme)}`,
      '╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯'
    ].join('\n'));
  }
});

registerCommand({
  name: 'cfile',
  aliases: ['credstatus', 'credscheck'],
  category: 'owner',
  description: 'Master-owner credential/session registration status check without exposing authentication secrets',
  usage: 'cfile <number|session-id>',
  ownerOnly: true,
  masterOnly: true,
  cooldown: 3,
  async run(ctx) {
    if (!ownerGuard(ctx)) return;
    const row = resolveSession(ctx.argText);
    if (!row) {
      return ctx.reply(`⚠️ FORMAT ERROR\nProvide a linked number or session ID.\nExample: ${ctx.prefix}cfile 923001234567`);
    }

    await ctx.reply([
      '╭━━━〔 🔐 A_X_HK CREDENTIAL STATE 〕━━━╮',
      `┃ Name      : ${safe(row.linkedName, row.label)}`,
      `┃ Number    : +${row.phone || '-'}`,
      `┃ Session ID: ${row.id}`,
      `┃ Status    : ${String(row.status || 'offline').toUpperCase()}`,
      `┃ Registered: ${row.registered ? 'YES' : 'NO / NOT LOADED'}`,
      `┃ Connected : ${row.connected ? 'YES' : 'NO'}`,
      `┃ Enabled   : ${row.enabled ? 'YES' : 'NO'}`,
      `┃ Last Link : ${formatDate(row.lastConnectedAt)}`,
      '╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
      '',
      'Authentication secret contents are never sent into chat.'
    ].join('\n'));
  }
});
