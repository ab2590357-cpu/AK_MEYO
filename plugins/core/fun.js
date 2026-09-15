import { registerCommand } from '../../lib/core/registry.js';
import { randomItem } from '../../lib/utils/text.js';
import { sendFunSticker } from '../../lib/services/fun-visual.js';

const answers = ['Yes', 'No', 'Probably', 'Probably not', 'Definitely', 'Ask again later', 'Looks good', 'I would not bet on it'];
const jokes = [
  'Why do programmers prefer dark mode? Because light attracts bugs.',
  'I told my code to behave. It threw an exception.',
  'There are 10 kinds of people: those who understand binary and those who do not.',
  'A SQL query walks into a bar, sees two tables, and asks: Can I join you?'
];
const quotes = [
  'Small progress is still progress.',
  'Make it work, then make it clear, then make it fast.',
  'Consistency beats intensity when intensity is temporary.',
  'Build systems that make the right action easy.'
];

async function visualReply(ctx, visual, text) {
  // One-command / one-message rule: the sticker itself contains the result.
  // Only fall back to text if sticker rendering is unavailable.
  const sent = await sendFunSticker(ctx, visual);
  if (!sent && text) await ctx.reply(text);
}

registerCommand({ name: 'dice', category: 'fun', description: 'Roll a dice with a visual sticker', async run(ctx) { const n=1+Math.floor(Math.random()*6); await visualReply(ctx,{title:'DICE',value:String(n),footer:'ROLL'},`🎲 Dice: ${n}`); } });
registerCommand({ name: 'coin', aliases: ['flip'], category: 'fun', description: 'Flip a coin with a visual sticker', async run(ctx) { const v=Math.random()<0.5?'HEADS':'TAILS'; await visualReply(ctx,{title:'COIN FLIP',value:v,footer:'A-X-HK'},`🪙 ${v[0]}${v.slice(1).toLowerCase()}`); } });
registerCommand({ name: '8ball', category: 'fun', description: 'Ask the magic 8-ball with a visual sticker', async run(ctx) { const v=randomItem(answers); await visualReply(ctx,{title:'8 BALL',value:v,footer:'ANSWER'},`🎱 ${v}`); } });
registerCommand({ name: 'joke', category: 'fun', description: 'Get a programming joke plus a fun sticker', async run(ctx) { const v=randomItem(jokes); await visualReply(ctx,{title:'JOKE',value:v,footer:'FUN MODE'},`😂 ${v}`); } });
registerCommand({ name: 'quote', category: 'fun', description: 'Get a short quote plus a visual sticker', async run(ctx) { const v=randomItem(quotes); await visualReply(ctx,{title:'QUOTE',value:v,footer:'A-X-HK'},`✨ ${v}`); } });
registerCommand({
  name: 'choose', category: 'fun', description: 'Choose between options with a visual sticker', usage: 'choose tea | coffee',
  async run(ctx) {
    const options = ctx.argText.split('|').map((v) => v.trim()).filter(Boolean);
    if (options.length < 2 || options.length > 20) return ctx.reply(`Usage: ${ctx.prefix}choose option 1 | option 2`);
    const chosen = randomItem(options);
    await visualReply(ctx,{title:'A-X-HK PICKS',value:chosen,footer:'CHOOSE'},`🎯 A-X-HK chooses: ${chosen}`);
  }
});
registerCommand({
  name: 'rate', category: 'fun', description: 'Give a random fun rating with a visual sticker',
  async run(ctx) {
    const what = ctx.argText || 'that';
    const score = Math.floor(Math.random() * 101);
    await visualReply(ctx,{title:'RATING',value:`${what.slice(0, 45)}: ${score}/100`,footer:'FOR FUN'},`${what.slice(0, 150)}: ${score}/100`);
  }
});
