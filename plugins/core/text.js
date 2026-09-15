import { registerCommand } from '../../lib/core/registry.js';

const need = (ctx, label = 'text') => {
  const value = String(ctx.argText || '').trim();
  if (!value) throw new Error(`Provide ${label}.`);
  if (value.length > 2500) throw new Error('Input is too long. Maximum is 2500 characters.');
  return value;
};

const cut = (value, max = 3500) => String(value).slice(0, max);
const words = (value) => value.trim().split(/\s+/).filter(Boolean);

const titleCase = (value) => value.toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase());
const sentenceCase = (value) => value.toLowerCase().replace(/(^\s*\w|[.!?]\s+\w)/g, (m) => m.toUpperCase());
const shuffle = (arr) => {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

const rot13 = (value) => value.replace(/[a-z]/gi, (c) => {
  const base = c <= 'Z' ? 65 : 97;
  return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
});

const MORSE = {
  A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....', I: '..', J: '.---',
  K: '-.-', L: '.-..', M: '--', N: '-.', O: '---', P: '.--.', Q: '--.-', R: '.-.', S: '...', T: '-',
  U: '..-', V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..', 0: '-----', 1: '.----', 2: '..---',
  3: '...--', 4: '....-', 5: '.....', 6: '-....', 7: '--...', 8: '---..', 9: '----.'
};
const UNMORSE = Object.fromEntries(Object.entries(MORSE).map(([k, v]) => [v, k]));

registerCommand({ name: 'upper', category: 'text', description: 'Convert text to uppercase', async run(ctx) { await ctx.reply(need(ctx).toUpperCase()); } });
registerCommand({ name: 'lower', category: 'text', description: 'Convert text to lowercase', async run(ctx) { await ctx.reply(need(ctx).toLowerCase()); } });
registerCommand({ name: 'titlecase', aliases: ['title'], category: 'text', description: 'Convert text to title case', async run(ctx) { await ctx.reply(titleCase(need(ctx))); } });
registerCommand({ name: 'sentencecase', category: 'text', description: 'Convert text to sentence case', async run(ctx) { await ctx.reply(sentenceCase(need(ctx))); } });
registerCommand({ name: 'reverse', category: 'text', description: 'Reverse text', async run(ctx) { await ctx.reply([...need(ctx)].reverse().join('')); } });
registerCommand({
  name: 'repeat', category: 'text', description: 'Repeat text up to 5 lines inside one safe reply', usage: 'repeat 3 hello',
  async run(ctx) {
    const count = Math.max(1, Math.min(5, Number(ctx.args[0]) || 1));
    const text = ctx.args.slice(1).join(' ').trim();
    if (!text) throw new Error('Usage: repeat 3 hello');
    await ctx.reply(cut(Array(count).fill(text).join('\n')));
  }
});
registerCommand({ name: 'clap', category: 'reaction', description: 'Clap reaction, or put claps between supplied words', async run(ctx) { const value = String(ctx.argText || '').trim(); await ctx.reply(value ? words(value).join(' 👏 ') : '👏👏👏 A-X-HK applause!'); } });
registerCommand({ name: 'spaced', category: 'text', description: 'Add spaces between characters', async run(ctx) { await ctx.reply(cut([...need(ctx)].join(' '))); } });
registerCommand({ name: 'nospace', category: 'text', description: 'Remove whitespace', async run(ctx) { await ctx.reply(need(ctx).replace(/\s+/g, '')); } });
registerCommand({ name: 'trim', category: 'text', description: 'Normalize extra whitespace', async run(ctx) { await ctx.reply(need(ctx).replace(/\s+/g, ' ').trim()); } });
registerCommand({ name: 'wordcount', aliases: ['wc'], category: 'text', description: 'Count words', async run(ctx) { await ctx.reply(`Words: ${words(need(ctx)).length}`); } });
registerCommand({ name: 'charcount', aliases: ['cc'], category: 'text', description: 'Count characters', async run(ctx) { await ctx.reply(`Characters: ${need(ctx).length}`); } });
registerCommand({ name: 'linecount', category: 'text', description: 'Count lines', async run(ctx) { await ctx.reply(`Lines: ${need(ctx).split(/\r?\n/).length}`); } });
registerCommand({ name: 'sortwords', category: 'text', description: 'Sort words alphabetically', async run(ctx) { await ctx.reply(words(need(ctx)).sort((a, b) => a.localeCompare(b)).join(' ')); } });
registerCommand({ name: 'shufflewords', category: 'text', description: 'Shuffle words', async run(ctx) { await ctx.reply(shuffle(words(need(ctx))).join(' ')); } });
registerCommand({ name: 'uniquewords', category: 'text', description: 'Remove duplicate words', async run(ctx) { await ctx.reply([...new Set(words(need(ctx)))].join(' ')); } });
registerCommand({ name: 'slug', category: 'text', description: 'Create a URL-friendly slug', async run(ctx) { await ctx.reply(need(ctx).toLowerCase().normalize('NFKD').replace(/[^a-z0-9\s-]/g, '').trim().replace(/[\s_-]+/g, '-')); } });
registerCommand({ name: 'urlencode', category: 'text', description: 'URL-encode text', async run(ctx) { await ctx.reply(encodeURIComponent(need(ctx))); } });
registerCommand({ name: 'urldecode', category: 'text', description: 'Decode URL-encoded text', async run(ctx) { await ctx.reply(decodeURIComponent(need(ctx))); } });
registerCommand({
  name: 'jsonpretty', category: 'text', description: 'Pretty-print JSON',
  async run(ctx) {
    const parsed = JSON.parse(need(ctx, 'valid JSON'));
    await ctx.reply(cut(JSON.stringify(parsed, null, 2)));
  }
});
registerCommand({ name: 'extractlinks', category: 'text', description: 'Extract web links from text', async run(ctx) { const found = need(ctx).match(/https?:\/\/[^\s]+/gi) || []; await ctx.reply(found.length ? found.slice(0, 20).join('\n') : 'No links found.'); } });
registerCommand({ name: 'extractemails', category: 'text', description: 'Extract email addresses from text', async run(ctx) { const found = need(ctx).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []; await ctx.reply(found.length ? [...new Set(found)].slice(0, 20).join('\n') : 'No email addresses found.'); } });
registerCommand({ name: 'rot13', category: 'text', description: 'Apply ROT13', async run(ctx) { await ctx.reply(rot13(need(ctx))); } });
registerCommand({ name: 'binary', category: 'text', description: 'Convert text to binary bytes', async run(ctx) { const value = need(ctx).slice(0, 350); await ctx.reply([...Buffer.from(value)].map((b) => b.toString(2).padStart(8, '0')).join(' ')); } });
registerCommand({ name: 'unbinary', category: 'text', description: 'Convert binary bytes to text', async run(ctx) { const parts = need(ctx).split(/\s+/); if (!parts.every((p) => /^[01]{8}$/.test(p))) throw new Error('Use 8-bit binary bytes separated by spaces.'); await ctx.reply(Buffer.from(parts.map((p) => parseInt(p, 2))).toString('utf8')); } });
registerCommand({ name: 'hex', category: 'text', description: 'Convert text to hexadecimal', async run(ctx) { await ctx.reply(Buffer.from(need(ctx)).toString('hex')); } });
registerCommand({ name: 'unhex', category: 'text', description: 'Decode hexadecimal text', async run(ctx) { const value = need(ctx).replace(/\s+/g, ''); if (!/^[0-9a-f]+$/i.test(value) || value.length % 2) throw new Error('Provide valid even-length hexadecimal.'); await ctx.reply(Buffer.from(value, 'hex').toString('utf8')); } });
registerCommand({ name: 'morse', category: 'text', description: 'Convert letters/numbers to Morse code', async run(ctx) { const out = [...need(ctx).toUpperCase()].map((c) => c === ' ' ? '/' : (MORSE[c] || c)).join(' '); await ctx.reply(cut(out)); } });
registerCommand({ name: 'unmorse', category: 'text', description: 'Decode basic Morse code', async run(ctx) { const out = need(ctx).split(/\s+/).map((x) => x === '/' ? ' ' : (UNMORSE[x] || '?')).join(''); await ctx.reply(out); } });
registerCommand({ name: 'initials', category: 'text', description: 'Get initials from words', async run(ctx) { await ctx.reply(words(need(ctx)).map((w) => w[0]?.toUpperCase() || '').join('')); } });
registerCommand({ name: 'acronym', category: 'text', description: 'Create an acronym', async run(ctx) { await ctx.reply(words(need(ctx)).filter((w) => w.length > 2).map((w) => w[0].toUpperCase()).join('')); } });
registerCommand({ name: 'palindrome', category: 'text', description: 'Check if text is a palindrome', async run(ctx) { const value = need(ctx).toLowerCase().replace(/[^a-z0-9]/g, ''); await ctx.reply(value && value === [...value].reverse().join('') ? 'Yes, it is a palindrome.' : 'No, it is not a palindrome.'); } });
registerCommand({
  name: 'replace', category: 'text', description: 'Replace text', usage: 'replace old | new | sentence',
  async run(ctx) { const parts = ctx.argText.split('|').map((x) => x.trim()); if (parts.length < 3 || !parts[0]) throw new Error('Usage: replace old | new | sentence'); await ctx.reply(cut(parts.slice(2).join(' | ').split(parts[0]).join(parts[1]))); }
});
registerCommand({
  name: 'remove', category: 'text', description: 'Remove a phrase from text', usage: 'remove phrase | sentence',
  async run(ctx) { const parts = ctx.argText.split('|').map((x) => x.trim()); if (parts.length < 2 || !parts[0]) throw new Error('Usage: remove phrase | sentence'); await ctx.reply(cut(parts.slice(1).join(' | ').split(parts[0]).join(''))); }
});
registerCommand({
  name: 'wrap', category: 'text', description: 'Wrap text to a line width', usage: 'wrap 40 your text',
  async run(ctx) {
    const width = Math.max(10, Math.min(100, Number(ctx.args[0]) || 40));
    const input = ctx.args.slice(1).join(' ');
    if (!input) throw new Error('Usage: wrap 40 your text');
    const out = []; let line = '';
    for (const word of words(input)) {
      if ((line + ' ' + word).trim().length > width) { if (line) out.push(line); line = word; }
      else line = (line + ' ' + word).trim();
    }
    if (line) out.push(line);
    await ctx.reply(cut(out.join('\n')));
  }
});
registerCommand({ name: 'quoteformat', category: 'text', description: 'Format text as a quoted block', async run(ctx) { await ctx.reply(cut(need(ctx).split(/\r?\n/).map((line) => `> ${line}`).join('\n'))); } });
registerCommand({ name: 'codeblock', category: 'text', description: 'Format text as a code block', async run(ctx) { await ctx.reply(cut(`\`\`\`\n${need(ctx)}\n\`\`\``)); } });
registerCommand({ name: 'length', category: 'text', description: 'Show text length and word count', async run(ctx) { const value = need(ctx); await ctx.reply(`Characters: ${value.length}\nWords: ${words(value).length}\nBytes: ${Buffer.byteLength(value, 'utf8')}`); } });
registerCommand({
  name: 'startswith', category: 'text', description: 'Check text prefix', usage: 'startswith prefix | text',
  async run(ctx) { const [needle, ...rest] = ctx.argText.split('|').map((x) => x.trim()); if (!needle || !rest.length) throw new Error('Usage: startswith prefix | text'); await ctx.reply(rest.join(' | ').startsWith(needle) ? 'Yes.' : 'No.'); }
});
registerCommand({
  name: 'endswith', category: 'text', description: 'Check text suffix', usage: 'endswith suffix | text',
  async run(ctx) { const [needle, ...rest] = ctx.argText.split('|').map((x) => x.trim()); if (!needle || !rest.length) throw new Error('Usage: endswith suffix | text'); await ctx.reply(rest.join(' | ').endsWith(needle) ? 'Yes.' : 'No.'); }
});
