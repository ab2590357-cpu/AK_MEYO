import { registerCommand } from '../../lib/core/registry.js';
import { db } from '../../lib/core/database.js';

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const truths = [
  'What is a habit you want to improve?',
  'What is the best decision you made this year?',
  'What is something you are proud of but rarely mention?',
  'What skill would you learn instantly if you could?',
  'What is the funniest mistake you have made recently?',
  'What is one goal you have not told many people about?'
];
const dares = [
  'Send a kind message to someone you appreciate.',
  'Drink a glass of water.',
  'Do 10 safe stretches.',
  'Organize five files or photos on your phone.',
  'Write down one thing you are grateful for.',
  'Use only emojis in your next message.'
];
const wyr = [
  'Would you rather travel to the past or the future?',
  'Would you rather have unlimited books or unlimited movies?',
  'Would you rather work four long days or five shorter days?',
  'Would you rather explore the ocean or space?',
  'Would you rather always be early or always be exactly on time?'
];
const compliments = [
  'You bring good energy to the conversation.',
  'Your curiosity is a strong skill.',
  'You seem persistent when you want to get something done.',
  'You ask practical questions and keep moving.',
  'Your willingness to learn is valuable.'
];
const fortunes = [
  'A small improvement will save you time later.',
  'A useful opportunity may come from an old contact.',
  'Finishing one pending task will create momentum.',
  'A simple solution is likely better than an overcomplicated one.',
  'Your next good idea may appear while doing something routine.'
];
const facts = [
  'Octopuses have three hearts.',
  'A day on Venus is longer than a year on Venus.',
  'Honey can remain edible for a very long time when sealed properly.',
  'Bananas are berries botanically, while strawberries are not.',
  'The Eiffel Tower can grow slightly taller in hot weather due to thermal expansion.'
];
const riddles = [
  { q: 'What has keys but cannot open locks?', a: 'A piano' },
  { q: 'What gets wetter the more it dries?', a: 'A towel' },
  { q: 'What has hands but cannot clap?', a: 'A clock' },
  { q: 'What has a neck but no head?', a: 'A bottle' },
  { q: 'What can travel around the world while staying in one corner?', a: 'A stamp' }
];
const trivia = [
  { q: 'Which planet is known as the Red Planet?', a: 'mars' },
  { q: 'What is the largest ocean on Earth?', a: 'pacific' },
  { q: 'How many sides does a hexagon have?', a: '6' },
  { q: 'What gas do plants absorb from the atmosphere?', a: 'carbon dioxide' },
  { q: 'What is the capital of Japan?', a: 'tokyo' }
];

registerCommand({ name: 'truth', category: 'games', description: 'Get a truth question', async run(ctx) { await ctx.reply(pick(truths)); } });
registerCommand({ name: 'dare', category: 'games', description: 'Get a light, safe dare', async run(ctx) { await ctx.reply(pick(dares)); } });
registerCommand({ name: 'wouldyourather', aliases: ['wyr'], category: 'games', description: 'Get a would-you-rather question', async run(ctx) { await ctx.reply(pick(wyr)); } });
registerCommand({ name: 'compliment', category: 'games', description: 'Get a friendly compliment', async run(ctx) { await ctx.reply(pick(compliments)); } });
registerCommand({ name: 'fortune', category: 'games', description: 'Get a light fortune-style prompt', async run(ctx) { await ctx.reply(pick(fortunes)); } });
registerCommand({ name: 'fact', category: 'games', description: 'Get a random general fact', async run(ctx) { await ctx.reply(pick(facts)); } });
registerCommand({ name: 'rps', category: 'games', description: 'Play rock-paper-scissors', usage: 'rps rock', async run(ctx) { const user = String(ctx.args[0] || '').toLowerCase(); if (!['rock','paper','scissors'].includes(user)) throw new Error('Usage: rps rock|paper|scissors'); const bot = pick(['rock','paper','scissors']); const win = (user === 'rock' && bot === 'scissors') || (user === 'paper' && bot === 'rock') || (user === 'scissors' && bot === 'paper'); await ctx.reply(`You: ${user}\nA-X-HK: ${bot}\n${user === bot ? 'Draw.' : win ? 'You win.' : 'A-X-HK wins.'}`); } });
registerCommand({ name: 'riddle', category: 'games', description: 'Get a riddle; use riddleanswer to reveal it', async run(ctx) { const item = pick(riddles); ctx.user.lastRiddle = item; await db.save(); await ctx.reply(`${item.q}\nUse ${ctx.prefix}riddleanswer when ready.`); } });
registerCommand({ name: 'riddleanswer', aliases: ['ranswer'], category: 'games', description: 'Reveal your latest riddle answer', async run(ctx) { const item = ctx.user.lastRiddle; if (!item) return ctx.reply('Ask for a riddle first.'); await ctx.reply(`Answer: ${item.a}`); } });
registerCommand({ name: 'trivia', category: 'games', description: 'Start a trivia question', async run(ctx) { const item = pick(trivia); ctx.user.lastTrivia = item; await db.save(); await ctx.reply(`${item.q}\nReply with ${ctx.prefix}triviaanswer <answer>`); } });
registerCommand({ name: 'triviaanswer', aliases: ['tanswer'], category: 'games', description: 'Answer your latest trivia question', async run(ctx) { const item = ctx.user.lastTrivia; if (!item) return ctx.reply('Start with trivia first.'); const answer = ctx.argText.trim().toLowerCase(); if (!answer) throw new Error('Provide your answer.'); const ok = answer === item.a || item.a.includes(answer) || answer.includes(item.a); if (ok) { ctx.user.triviaScore = (ctx.user.triviaScore || 0) + 1; ctx.user.lastTrivia = null; await db.save(); } await ctx.reply(ok ? `Correct. Score: ${ctx.user.triviaScore}` : 'Not quite. Try again or ask for another trivia question.'); } });
registerCommand({ name: 'triviascore', category: 'games', description: 'Show your trivia score', async run(ctx) { await ctx.reply(`Trivia score: ${ctx.user.triviaScore || 0}`); } });
registerCommand({ name: 'numbergame', category: 'games', description: 'Start a 1-20 number guessing game', async run(ctx) { ctx.user.numberGame = Math.floor(Math.random() * 20) + 1; ctx.user.numberGameTries = 0; await db.save(); await ctx.reply(`I picked a number from 1 to 20. Use ${ctx.prefix}guess <number>.`); } });
registerCommand({ name: 'guess', category: 'games', description: 'Guess the current number game', async run(ctx) { const target = Number(ctx.user.numberGame); const n = Number(ctx.args[0]); if (!target) return ctx.reply(`Start with ${ctx.prefix}numbergame.`); if (!Number.isInteger(n) || n < 1 || n > 20) throw new Error('Guess a whole number from 1 to 20.'); ctx.user.numberGameTries = (ctx.user.numberGameTries || 0) + 1; if (n === target) { const tries = ctx.user.numberGameTries; ctx.user.numberGame = null; ctx.user.numberGameTries = 0; await db.save(); return ctx.reply(`Correct in ${tries} attempt(s).`); } await db.save(); await ctx.reply(n < target ? 'Higher.' : 'Lower.'); } });
registerCommand({ name: 'emojiroll', category: 'games', description: 'Get a random emoji', async run(ctx) { await ctx.reply(pick([':D', ':)', ';)', '<3', ':P', 'B)', '^_^', ':-)'])); } });
