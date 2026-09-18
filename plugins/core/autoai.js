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
  description: 'Master-owner control for A_X_HK AI assistant',
  ownerOnly: true,
  masterOnly: true,
  usage: 'autoai on|off|status',
  async run(ctx) {
    if (ctx.sessionId !== 'main' || !ctx.isMasterOwnerAction) return;
    const action = String(ctx.args[0] || 'status').toLowerCase();
    if (!['on', 'off', 'status', 'check'].includes(action)) {
      return ctx.reply(`Usage: ${ctx.prefix}autoai on|off|status`);
    }

    if (action === 'on' || action === 'off') {
      ctx.sessionSettings.autoAI = action === 'on';
      if (ctx.sessionSettings.autoAI) {
        ctx.sessionSettings.aiPersona ||= 'professional';
        ctx.sessionSettings.aiCooldownSeconds = 0;
      }
      await db.save();
    }

    const enabled = Boolean(ctx.sessionSettings.autoAI);
    await ctx.reply([
      '╭━━━〔 🤖 𝐀_𝐗_𝐇𝐊 𝐀𝐔𝐓𝐎 𝐀𝐈 〕━━━╮',
      `┃ Status : ${stateLabel(enabled)}`,
      '┃ Private: Every incoming message',
      '┃ Group  : Mention only, reply stays in group',
      '┃ Time   : Pakistan / Asia-Karachi aware',
      '┃ Office : 9:00 PM – 8:00 AM',
      '┃ Sleep  : 10:00 AM – 4:00 PM',
      '┃ Free   : 8–10 AM and 4–9 PM',
      `┃ ${aiEngineLabel()}`,
      '╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
      '',
      'Master owner / main session only. Auto AI is independent from the fixed Time Reply feature.',
      '',
      '★ 𝐏𝐎𝐖𝐄𝐑𝐄𝐃 𝐁𝐘 𝐀𝐁𝐃𝐔𝐋𝐋𝐀𝐇_𝐗_𝐇𝐊 ★'
    ].join('\n'));
  }
});
