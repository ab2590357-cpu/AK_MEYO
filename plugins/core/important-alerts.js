import { registerCommand } from '../../lib/core/registry.js';
import { db } from '../../lib/core/database.js';
import { config } from '../../lib/config.js';
import { recentImportantAlerts, clearImportantAlerts } from '../../lib/services/important-alerts.js';

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
  description: 'Show always-on smart important-message alert status',
  ownerOnly: true,
  masterOnly: true,
  usage: 'alerts',
  async run(ctx) {
    if (ctx.sessionId !== 'main' || !ctx.isMasterOwnerAction) return;

    ctx.sessionSettings.importantAlerts = true;
    ctx.sessionSettings.importantAlertCooldownMinutes = Math.max(
      5,
      Math.min(240, Number(ctx.sessionSettings.importantAlertCooldownMinutes || 30))
    );
    await db.save();

    const cooldown = Number(ctx.sessionSettings.importantAlertCooldownMinutes || 30);

    await ctx.reply([
      '╭━━━〔 🚨 𝐀_𝐗_𝐇𝐊 𝐈𝐌𝐏𝐎𝐑𝐓𝐀𝐍𝐓 𝐀𝐋𝐄𝐑𝐓𝐒 〕━━━╮',
      '┃ Status   : ALWAYS ON ✅',
      '┃ Scope    : Main private chats',
      '┃ Priority : HIGH + MEDIUM',
      '┃ Cooldown : ' + cooldown + ' min per chat',
      '┃ Delivery : Owner private/self inbox',
      '┃ Control  : Cannot be disabled',
      '╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
      '',
      'Explicit requests like “important hai”, “note karlo”, “Abdullah ko bata dena”, “zaroor/lazmi bata dena” are treated as direct owner-attention signals.',
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
