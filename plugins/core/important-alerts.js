import { registerCommand } from '../../lib/core/registry.js';
import { db } from '../../lib/core/database.js';
import { config } from '../../lib/config.js';
import { recentImportantAlerts, clearImportantAlerts } from '../../lib/services/important-alerts.js';

function stateLabel(value) {
  return value ? 'ENABLED ✅' : 'DISABLED ⛔';
}

function formatWhen(at) {
  try {
    return new Date(Number(at || Date.now())).toLocaleString('en-PK', { timeZone: config.timezone || 'Asia/Karachi' });
  } catch {
    return '';
  }
}

registerCommand({
  name: 'alerts',
  aliases: ['importantalerts'],
  category: 'settings',
  description: 'Master-owner control for smart important-message alerts',
  ownerOnly: true,
  usage: 'alerts on|off|status',
  async run(ctx) {
    if (ctx.sessionId !== 'main' || !ctx.isMasterOwnerAction) return;

    const action = String(ctx.args[0] || 'status').toLowerCase();
    if (!['on', 'off', 'status', 'check'].includes(action)) {
      return ctx.reply('Usage: ' + ctx.prefix + 'alerts on|off|status');
    }

    if (action === 'on' || action === 'off') {
      ctx.sessionSettings.importantAlerts = action === 'on';
      ctx.sessionSettings.importantAlertCooldownMinutes = Math.max(
        5,
        Math.min(240, Number(ctx.sessionSettings.importantAlertCooldownMinutes || 30))
      );
      await db.save();
    }

    const enabled = ctx.sessionSettings.importantAlerts !== false;
    const cooldown = Number(ctx.sessionSettings.importantAlertCooldownMinutes || 30);

    await ctx.reply([
      '╭━━━〔 🚨 𝐀_𝐗_𝐇𝐊 𝐈𝐌𝐏𝐎𝐑𝐓𝐀𝐍𝐓 𝐀𝐋𝐄𝐑𝐓𝐒 〕━━━╮',
      '┃ Status   : ' + stateLabel(enabled),
      '┃ Scope    : Main private chats',
      '┃ Priority : HIGH + MEDIUM only',
      '┃ Cooldown : ' + cooldown + ' min per chat',
      '┃ Delivery : Owner private/self inbox',
      '┃ Control  : Master owner only',
      '╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
      '',
      'Smart triage watches for serious project leads, payment/budget, urgent deadlines, complaints, security/legal issues, and direct requests for Abdullah.',
      '',
      '★ 𝐏𝐎𝐖𝐄𝐑𝐄𝐃 𝐁𝐘 𝐀𝐁𝐃𝐔𝐋𝐋𝐀𝐇_𝐗_𝐇𝐊 ★'
    ].join('\n'));
  }
});

registerCommand({
  name: 'important',
  aliases: ['importantchat', 'importantchats', 'alertdigest'],
  category: 'owner',
  description: 'Show recent important chat alerts',
  ownerOnly: true,
  usage: 'important [1-20|clear]',
  async run(ctx) {
    if (ctx.sessionId !== 'main' || !ctx.isMasterOwnerAction) return;

    const action = String(ctx.args[0] || '').toLowerCase();
    if (action === 'clear') {
      clearImportantAlerts();
      await db.save();
      return ctx.reply('✅ Important alert history cleared.');
    }

    const limit = Math.max(1, Math.min(20, Number(action) || 8));
    const rows = recentImportantAlerts(limit);
    if (!rows.length) {
      return ctx.reply([
        '╭━━━〔 🚨 A_X_HK IMPORTANT DIGEST 〕━━━╮',
        '┃ No important conversations saved yet.',
        '╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
        '',
        config.footerMessage
      ].join('\n'));
    }

    const body = rows.map((row, index) => {
      const sender = row.sender ? '+' + row.sender : 'Unknown';
      return [
        (index + 1) + '. [' + String(row.priority || 'medium').toUpperCase() + '] ' + sender,
        '   ' + String(row.summary || row.latestMessage || '').slice(0, 260),
        '   ' + formatWhen(row.at) + ' PKT'
      ].join('\n');
    }).join('\n\n');

    await ctx.reply([
      '╭━━━〔 🚨 A_X_HK IMPORTANT DIGEST 〕━━━╮',
      '┃ Showing latest ' + rows.length + ' alert(s)',
      '╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
      '',
      body,
      '',
      'Use ' + ctx.prefix + 'important clear to clear saved alert history.',
      '',
      config.footerMessage
    ].join('\n'));
  }
});
