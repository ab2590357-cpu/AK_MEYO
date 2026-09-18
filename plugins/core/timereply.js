import { registerCommand } from '../../lib/core/registry.js';
import { db } from '../../lib/core/database.js';

function stateLabel(value) {
  return value ? 'ENABLED ✅' : 'DISABLED ⛔';
}

registerCommand({
  name: 'timereply',
  aliases: ['time-reply', 'scheduledreply', 'fixedreply'],
  category: 'settings',
  description: 'Master-owner control for fixed office and sleep replies',
  ownerOnly: true,
  masterOnly: true,
  usage: 'timereply on|off|status',
  async run(ctx) {
    if (ctx.sessionId !== 'main' || !ctx.isMasterOwnerAction) return;
    const action = String(ctx.args[0] || 'status').toLowerCase();
    if (!['on', 'off', 'status', 'check'].includes(action)) {
      return ctx.reply(`Usage: ${ctx.prefix}timereply on|off|status`);
    }

    ctx.sessionSettings.away ||= { enabled: true, text: '' };

    if (action === 'on' || action === 'off') {
      ctx.sessionSettings.away.enabled = action === 'on';
      ctx.sessionSettings.awayCooldownMinutes = 5;
      ctx.sessionSettings.awayCooldownHours = 5 / 60;
      await db.save();
    }

    const enabled = ctx.sessionSettings.away?.enabled !== false;
    const aiEnabled = Boolean(ctx.sessionSettings.autoAI);

    await ctx.reply([
      '╭━━━〔 ⏰ 𝐀_𝐗_𝐇𝐊 𝐓𝐈𝐌𝐄 𝐑𝐄𝐏𝐋𝐘 〕━━━╮',
      `┃ Status : ${stateLabel(enabled)}`,
      '┃ Office : 9:00 PM – 8:00 AM',
      '┃ Sleep  : 10:00 AM – 4:00 PM',
      '┃ Free   : No fixed time reply',
      '┃ Repeat : 5 minute cooldown per chat',
      '┃ Group  : Mention only',
      `┃ Auto AI: ${stateLabel(aiEnabled)} (independent)`,
      '╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
      '',
      'Master owner / main session only. This fixed schedule reply can be ON or OFF separately from Auto AI.',
      '',
      '★ 𝐏𝐎𝐖𝐄𝐑𝐄𝐃 𝐁𝐘 𝐀𝐁𝐃𝐔𝐋𝐋𝐀𝐇_𝐗_𝐇𝐊 ★'
    ].join('\n'));
  }
});
