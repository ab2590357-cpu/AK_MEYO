// Copy this file, rename it without the leading underscore, edit the fields,
// and place it anywhere under plugins/. No index/menu edit is required.
export default {
  name: 'hello',
  aliases: ['hi'],
  category: 'fun',
  description: 'Simple example plugin command',
  usage: 'hello',
  cooldown: 2,
  async run(ctx) {
    await ctx.reply('Hello from A-X-HK plugin 👋');
  }
};
