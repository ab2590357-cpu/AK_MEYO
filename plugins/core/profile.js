import { registerCommand } from '../../lib/core/registry.js';

registerCommand({
  name: 'jid', aliases: ['id'], category: 'profile', description: 'Show current chat/sender IDs',
  async run(ctx) {
    await ctx.reply(`Chat: ${ctx.chat}\nSender: ${ctx.sender}\nBot: ${ctx.botJid}`);
  }
});

registerCommand({
  name: 'whoami', aliases: ['me'], category: 'profile', description: 'Show your bot permissions',
  async run(ctx) {
    await ctx.reply([
      `JID: ${ctx.sender}`,
      `Owner: ${ctx.isOwner ? 'YES' : 'NO'}`,
      `Group: ${ctx.isGroup ? 'YES' : 'NO'}`,
      `Group admin: ${ctx.isAdmin ? 'YES' : 'NO'}`,
      `Premium: ${ctx.user.premium ? 'YES' : 'NO'}`,
      `Banned: ${ctx.user.banned ? 'YES' : 'NO'}`,
      `Commands used: ${ctx.user.commandCount || 0}`
    ].join('\n'));
  }
});
