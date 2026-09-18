import crypto from 'node:crypto';
import { registerCommand, getCommand } from '../../lib/core/registry.js';
import { askAI } from '../../lib/services/ai.js';
import { contextInfo, unwrapMessage } from '../../lib/utils/message.js';

const pick = (rows) => rows[Math.floor(Math.random() * rows.length)];
const clean = (value = '', max = 1600) => String(value || '').replace(/\0/g, '').trim().slice(0, max);

function quotedText(ctx) {
  const quoted = contextInfo(ctx.msg)?.quotedMessage;
  if (!quoted) return '';
  const m = unwrapMessage(quoted);
  return clean(
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.documentMessage?.caption ||
    '',
    1800
  );
}

function inputText(ctx) {
  return clean(ctx.argText || quotedText(ctx), 1800);
}

function stablePercent(value = '') {
  const hex = crypto.createHash('sha256').update(String(value).toLowerCase()).digest('hex').slice(0, 8);
  return Number.parseInt(hex, 16) % 101;
}

function registerPublic(definition) {
  const name = String(definition?.name || '').toLowerCase();
  if (!name || getCommand(name)) return false;
  const aliases = (Array.isArray(definition.aliases) ? definition.aliases : [])
    .map((v) => String(v || '').toLowerCase())
    .filter((v) => v && v !== name && !getCommand(v));
  registerCommand({ ...definition, name, aliases });
  return true;
}

function progressBar(n) {
  const value = Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
  const filled = Math.round(value / 10);
  return '[' + '█'.repeat(filled) + '░'.repeat(10 - filled) + '] ' + value + '%';
}

function aiReplyPrompt(style, text) {
  const rules = {
    roast: 'Write one playful witty roast. No slurs, protected-trait insults, threats, cruelty, sexual humiliation, or encouragement of harassment.',
    funny: 'Write one genuinely funny casual WhatsApp reply. Keep it natural and short.',
    savage: 'Write one sharp confident comeback, but keep it non-threatening, non-hateful and not excessively abusive.',
    polite: 'Write one calm, respectful, friendly WhatsApp reply.',
    comeback: 'Write one clever comeback that is confident but not threatening, hateful, or cruel.'
  };
  return [
    'Create ONE WhatsApp reply to the message below.',
    rules[style] || rules.funny,
    'Match the language and vibe of the original message.',
    'Return only the reply text.',
    '',
    'Message:',
    text
  ].join('\n');
}

for (const [name, style, aliases] of [
  ['roast', 'roast', ['roastme']],
  ['funny', 'funny', ['funnyreplyall']],
  ['savage', 'savage', ['savageresponse']],
  ['polite', 'polite', ['politereplyall']],
  ['comeback', 'comeback', ['replyback']]
]) {
  registerPublic({
    name,
    aliases,
    category: 'ai',
    description: 'Generate a ' + style + ' reply for supplied or quoted text',
    usage: name + ' <text> or reply to a message',
    cooldown: 8,
    async run(ctx) {
      const text = inputText(ctx);
      if (!text) return ctx.reply('Reply to a message or add text after ' + ctx.prefix + name + '.');
      const out = await askAI(aiReplyPrompt(style, text), ctx.senderNumber, { maxChars: 900 });
      await ctx.reply(out);
    }
  });
}

registerPublic({
  name: 'vibecheck',
  aliases: ['vibe'],
  category: 'fun',
  description: 'Give a stable fun vibe score',
  usage: 'vibecheck <name/text>',
  cooldown: 2,
  async run(ctx) {
    const value = clean(ctx.argText || 'you', 120);
    const score = stablePercent('vibe:' + value);
    const labels = score >= 85 ? 'ELITE ENERGY 🔥' : score >= 65 ? 'STRONG VIBE 😎' : score >= 40 ? 'CHILL VIBE ✨' : score >= 20 ? 'MYSTERY MODE 👀' : 'LOW BATTERY VIBE 🪫';
    await ctx.reply('✨ *VIBE CHECK*\n\n' + value + '\n' + progressBar(score) + '\n' + labels + '\n\n_For fun only._');
  }
});

registerPublic({
  name: 'compat',
  aliases: ['compatibility', 'match'],
  category: 'fun',
  description: 'Fun compatibility score between two names',
  usage: 'compat Ali | Sara',
  cooldown: 2,
  async run(ctx) {
    const parts = clean(ctx.argText, 180).split('|').map((v) => v.trim()).filter(Boolean);
    if (parts.length !== 2) return ctx.reply('Usage: ' + ctx.prefix + 'compat Name 1 | Name 2');
    const normalized = [...parts].map((v) => v.toLowerCase()).sort().join('|');
    const score = stablePercent('compat:' + normalized);
    await ctx.reply('💫 *COMPATIBILITY*\n\n' + parts[0] + ' × ' + parts[1] + '\n' + progressBar(score) + '\n\n_For fun only._');
  }
});

registerPublic({
  name: 'shipname',
  aliases: ['mixname'],
  category: 'fun',
  description: 'Mix two names into ship-name ideas',
  usage: 'shipname Ali | Sara',
  async run(ctx) {
    const parts = clean(ctx.argText, 160).split('|').map((v) => v.replace(/\s+/g, '').trim()).filter(Boolean);
    if (parts.length !== 2) return ctx.reply('Usage: ' + ctx.prefix + 'shipname Name 1 | Name 2');
    const [a, b] = parts;
    const a1 = a.slice(0, Math.max(1, Math.ceil(a.length / 2)));
    const a2 = a.slice(0, Math.max(1, Math.floor(a.length / 2)));
    const b1 = b.slice(Math.floor(b.length / 2));
    const b2 = b.slice(Math.ceil(b.length / 2));
    const names = [...new Set([a1 + b1, b.slice(0, Math.ceil(b.length / 2)) + a.slice(Math.floor(a.length / 2)), a2 + b2])];
    await ctx.reply('💞 *SHIP NAMES*\n\n' + names.map((v, i) => (i + 1) + '. ' + v).join('\n'));
  }
});

registerPublic({
  name: 'nickname',
  aliases: ['nickgen'],
  category: 'fun',
  description: 'Generate fun nickname ideas',
  usage: 'nickname Abdullah',
  async run(ctx) {
    const name = clean(ctx.argText, 60).replace(/\s+/g, ' ') || 'Legend';
    const base = name.split(/\s+/)[0];
    const prefixes = ['Neo', 'Dark', 'Lil', 'Mr', 'Captain', 'Ultra', 'Ghost', 'King', 'Ace', 'Pixel'];
    const suffixes = ['X', 'OP', 'Pro', 'Prime', 'Mode', 'Wave', '.exe', '99', 'HQ', 'Max'];
    const seed = stablePercent(name);
    const out = [
      prefixes[seed % prefixes.length] + base,
      base + suffixes[(seed + 3) % suffixes.length],
      prefixes[(seed + 5) % prefixes.length] + base + suffixes[(seed + 7) % suffixes.length],
      base.slice(0, Math.max(2, Math.ceil(base.length * 0.7))) + 'zy',
      base.toUpperCase() + '⚡'
    ];
    await ctx.reply('😎 *NICKNAME IDEAS*\n\n' + [...new Set(out)].map((v, i) => (i + 1) + '. ' + v).join('\n'));
  }
});

const thisOrThat = [
  'Tea ☕ or Coffee ☕?',
  'Android 🤖 or iPhone 🍎?',
  'Mountains 🏔️ or Beach 🏖️?',
  'Night 🌙 or Morning ☀️?',
  'Gaming 🎮 or Movies 🎬?',
  'Money 💸 or Free Time ⏳?',
  'Texting 💬 or Calling 📞?',
  'City 🌆 or Village 🌿?',
  'Coding 💻 or Designing 🎨?',
  'Music 🎧 or Podcasts 🎙️?'
];

registerPublic({
  name: 'thisorthat',
  aliases: ['eitheror'],
  category: 'games',
  description: 'Get a random this-or-that question',
  async run(ctx) { await ctx.reply('⚡ *THIS OR THAT*\n\n' + pick(thisOrThat)); }
});

const icebreakers = [
  'What is something you could talk about for hours?',
  'What app do you use way more than you should?',
  'If you could instantly master one skill, what would it be?',
  'What is the best thing you bought recently?',
  'Which fictional world would you visit for one week?',
  'What small thing instantly improves your mood?',
  'If you had a free flight tonight, where would you go?',
  'What is one unpopular opinion you actually stand by?'
];

registerPublic({
  name: 'icebreaker',
  aliases: ['breakice'],
  category: 'games',
  description: 'Get a random conversation starter',
  async run(ctx) { await ctx.reply('🧊 *ICEBREAKER*\n\n' + pick(icebreakers)); }
});

const challenges = [
  'Send your next message using only emojis.',
  'Do 15 squats or 20 seconds of stretching.',
  'Delete 10 useless screenshots from your phone.',
  'Message someone you have not spoken to in a while.',
  'Drink a glass of water right now.',
  'Spend 5 minutes organizing your home screen.',
  'Write one goal for this week and one step toward it.',
  'Go 20 minutes without opening social media.'
];

registerPublic({
  name: 'challenge',
  aliases: ['minichallenge'],
  category: 'games',
  description: 'Get a quick safe challenge',
  async run(ctx) { await ctx.reply('🎯 *MINI CHALLENGE*\n\n' + pick(challenges)); }
});

const pickupLines = [
  'Are you Wi-Fi? Because I’m definitely feeling a connection. 😄',
  'You must be a keyboard, because you’re just my type. ⌨️',
  'Are you a bug fix? Because you just made my day work better. 😄',
  'You must be dark mode, because everything looks better with you around. 🌙',
  'Are you a notification? Because you got my attention instantly. 👀'
];

registerPublic({
  name: 'pickup',
  aliases: ['pickupline'],
  category: 'fun',
  description: 'Get a light, clean pickup line',
  async run(ctx) { await ctx.reply('😄 ' + pick(pickupLines)); }
});

const motivation = [
  'Do the smallest useful step first. Momentum usually follows.',
  'You do not need perfect conditions to make real progress.',
  'Finish one thing before starting five more.',
  'A rough version today beats a perfect version that never ships.',
  'Consistency looks boring until the results show up.',
  'If the task feels huge, shrink the next step—not the goal.'
];

registerPublic({
  name: 'motivate',
  aliases: ['motivation'],
  category: 'fun',
  description: 'Get a short motivation line',
  async run(ctx) { await ctx.reply('⚡ ' + pick(motivation)); }
});

registerPublic({
  name: 'moodcheck',
  aliases: ['moodmeter'],
  category: 'fun',
  description: 'Get a random fun mood meter',
  usage: 'moodcheck [name]',
  async run(ctx) {
    const value = clean(ctx.argText || 'Your mood', 80);
    const score = stablePercent('mood:' + value + ':' + new Date().toISOString().slice(0, 10));
    const face = score >= 75 ? '😄' : score >= 50 ? '😎' : score >= 25 ? '🙂' : '😴';
    await ctx.reply(face + ' *MOOD METER*\n\n' + value + '\n' + progressBar(score) + '\n\n_For fun only._');
  }
});

registerPublic({
  name: 'randomcolor',
  aliases: ['randcolor'],
  category: 'utility',
  description: 'Generate a random HEX color',
  async run(ctx) {
    const hex = '#' + crypto.randomBytes(3).toString('hex').toUpperCase();
    await ctx.reply('🎨 Random color: *' + hex + '*');
  }
});

registerPublic({
  name: 'progress',
  aliases: ['progressbar'],
  category: 'utility',
  description: 'Create a text progress bar',
  usage: 'progress 75',
  async run(ctx) {
    const n = Number(ctx.args[0]);
    if (!Number.isFinite(n) || n < 0 || n > 100) return ctx.reply('Usage: ' + ctx.prefix + 'progress 0-100');
    await ctx.reply(progressBar(n));
  }
});

registerPublic({
  name: 'mocktext',
  aliases: ['mockcase'],
  category: 'text',
  description: 'Convert text to alternating meme case',
  usage: 'mocktext hello world',
  async run(ctx) {
    const value = clean(ctx.argText, 1200);
    if (!value) return ctx.reply('Usage: ' + ctx.prefix + 'mocktext your text');
    let upper = false;
    const out = [...value].map((ch) => {
      if (!/[a-z]/i.test(ch)) return ch;
      upper = !upper;
      return upper ? ch.toUpperCase() : ch.toLowerCase();
    }).join('');
    await ctx.reply(out);
  }
});

registerPublic({
  name: 'emojify',
  aliases: ['letteremoji'],
  category: 'text',
  description: 'Turn letters into regional-indicator emoji',
  usage: 'emojify hello',
  async run(ctx) {
    const value = clean(ctx.argText, 80);
    if (!value) return ctx.reply('Usage: ' + ctx.prefix + 'emojify hello');
    const out = [...value.toUpperCase()].map((ch) => {
      if (/[A-Z]/.test(ch)) return String.fromCodePoint(0x1F1E6 + ch.charCodeAt(0) - 65);
      if (ch === ' ') return '  ';
      return ch;
    }).join(' ');
    await ctx.reply(out);
  }
});

registerPublic({
  name: 'leet',
  aliases: ['leetspeak'],
  category: 'text',
  description: 'Convert text to simple leetspeak',
  usage: 'leet hacker',
  async run(ctx) {
    const value = clean(ctx.argText, 1200);
    if (!value) return ctx.reply('Usage: ' + ctx.prefix + 'leet your text');
    const map = { a: '4', e: '3', i: '1', o: '0', s: '5', t: '7', g: '9' };
    await ctx.reply([...value].map((ch) => map[ch.toLowerCase()] || ch).join(''));
  }
});

registerPublic({
  name: 'wordmix',
  aliases: ['shuffletext'],
  category: 'text',
  description: 'Shuffle words in supplied text',
  usage: 'wordmix one two three four',
  async run(ctx) {
    const words = clean(ctx.argText, 1200).split(/\s+/).filter(Boolean);
    if (words.length < 2) return ctx.reply('Usage: ' + ctx.prefix + 'wordmix some words here');
    for (let i = words.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [words[i], words[j]] = [words[j], words[i]];
    }
    await ctx.reply(words.join(' '));
  }
});
