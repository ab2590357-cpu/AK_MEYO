import { registerCommand } from '../../lib/core/registry.js';
import { db } from '../../lib/core/database.js';
import { config } from '../../lib/config.js';

function stateLabel(value) {
  return value ? 'ENABLED ✅' : 'DISABLED ⛔';
}

function aiEngineLabel() {
  if (!config.ai.enabled) return 'AI engine: OFF — set AI_ENABLED=true';
  if (!config.ai.apiKey) return 'AI key: MISSING — set AI_API_KEY';
  return `AI engine: READY • Model: ${config.ai.model || 'auto'}`;
}

registerCommand({
  name: 'autoai',
  aliases: ['auto-ai', 'assistant', 'aiassistant', 'botai'],
  category: 'settings',
  description: 'Toggle Abdullah AI assistant for unavailable hours',
  ownerOnly: true,
  usage: 'autoai on|off|status',
  async run(ctx) {
    const action = String(ctx.args[0] || 'status').toLowerCase();
    if (!['on', 'off', 'status', 'check'].includes(action)) {
      return ctx.reply(`Usage: ${ctx.prefix}autoai on|off|status`);
    }

    if (action === 'on' || action === 'off') {
      ctx.sessionSettings.autoAI = action === 'on';
      if (ctx.sessionSettings.autoAI) {
        ctx.sessionSettings.aiPersona ||= 'professional';
        ctx.sessionSettings.aiCooldownSeconds = Math.max(10, Math.min(180, Number(ctx.sessionSettings.aiCooldownSeconds || 20)));
      }
      await db.save();
    }

    const enabled = Boolean(ctx.sessionSettings.autoAI);
    await ctx.reply([
      '╭━━━〔 🤖 𝐀𝐁𝐃𝐔𝐋𝐋𝐀𝐇 𝐀𝐈 𝐀𝐒𝐒𝐈𝐒𝐓𝐀𝐍𝐓 〕━━━╮',
      `┃ Status : ${stateLabel(enabled)}`,
      '┃ Scope  : Unavailable hours only',
      '┃ Office : 9:00 PM – 8:00 AM',
      '┃ Sleep  : 10:00 AM – 4:00 PM',
      '┃ Group  : Mention only, reply stays in group',
      `┃ ${aiEngineLabel()}`,
      '╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
      '',
      'Fixed office/sleep auto reply stays ON even when Auto AI is OFF.',
      '',
      '★ 𝐏𝐎𝐖𝐄𝐑𝐄𝐃 𝐁𝐘 𝐀𝐁𝐃𝐔𝐋𝐋𝐀𝐇_𝐗_𝐇𝐊 ★'
    ].join('\n'));
  }
});
