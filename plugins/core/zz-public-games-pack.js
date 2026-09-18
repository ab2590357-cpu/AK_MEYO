import crypto from 'node:crypto';
import { registerCommand, getCommand } from '../../lib/core/registry.js';
import { db } from '../../lib/core/database.js';

const pick = (rows) => rows[Math.floor(Math.random() * rows.length)];
const clean = (value = '', max = 1500) => String(value || '').replace(/\0/g, '').trim().slice(0, max);

function registerPublic(definition) {
  const name = String(definition?.name || '').toLowerCase();
  if (!name || getCommand(name)) return false;
  const aliases = (Array.isArray(definition.aliases) ? definition.aliases : [])
    .map((v) => String(v || '').toLowerCase())
    .filter((v) => v && v !== name && !getCommand(v));
  registerCommand({ ownerOnly: false, masterOnly: false, ...definition, name, aliases });
  return true;
}

function stablePercent(value = '') {
  const hex = crypto.createHash('sha256').update(String(value).toLowerCase()).digest('hex').slice(0, 8);
  return Number.parseInt(hex, 16) % 101;
}

function progressBar(n) {
  const value = Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
  const filled = Math.round(value / 10);
  return '[' + '#'.repeat(filled) + '-'.repeat(10 - filled) + '] ' + value + '%';
}

const challengeRows = [
  'Send your next message using only emojis.',
  'Put your phone down for 10 minutes.',
  'Delete 10 useless screenshots.',
  'Drink a glass of water.',
  'Send a nice message to a friend.',
  'Do 20 seconds of stretching.',
  'Change your wallpaper for one hour.',
  'Write one goal for this week.'
];

registerPublic({
  name: 'challengefriend',
  aliases: ['friendchallenge'],
  category: 'games',
  description: 'Get a quick safe challenge to send to a friend',
  async run(ctx) { await ctx.reply('FRIEND CHALLENGE\n\n' + pick(challengeRows)); }
});

const emojiQuiz = [
  { q: '🌧️☂️', a: 'rain' },
  { q: '🍎📱', a: 'apple' },
  { q: '🕷️👨', a: 'spiderman' },
  { q: '⭐⚔️', a: 'star wars' },
  { q: '🦁👑', a: 'lion king' },
  { q: '❄️👸', a: 'frozen' },
  { q: '🐼🥋', a: 'kung fu panda' },
  { q: '🚢🧊💔', a: 'titanic' }
];

registerPublic({
  name: 'emojiquiz',
  aliases: ['guessemoji'],
  category: 'games',
  description: 'Start an emoji guessing quiz',
  async run(ctx) {
    const item = pick(emojiQuiz);
    ctx.user.publicEmojiQuiz = item;
    await db.save();
    await ctx.reply('EMOJI QUIZ\n\n' + item.q + '\n\nReply: ' + ctx.prefix + 'emojianswer <answer>');
  }
});

registerPublic({
  name: 'emojianswer',
  aliases: ['eanswer'],
  category: 'games',
  description: 'Answer your latest emoji quiz',
  usage: 'emojianswer <answer>',
  async run(ctx) {
    const item = ctx.user.publicEmojiQuiz;
    if (!item) return ctx.reply('Start with ' + ctx.prefix + 'emojiquiz.');
    const answer = clean(ctx.argText, 80).toLowerCase();
    if (!answer) return ctx.reply('Usage: ' + ctx.prefix + 'emojianswer <answer>');
    const ok = answer === item.a || item.a.includes(answer) || answer.includes(item.a);
    if (ok) {
      ctx.user.publicEmojiQuiz = null;
      await db.save();
    }
    await ctx.reply(ok ? 'Correct!' : 'Not quite. Try again.');
  }
});

const chainWords = [
  'apple','eagle','earth','house','energy','yellow','water','river','robot','table','engine','night',
  'tree','elephant','tiger','rain','network','kite','event','train','nature','echo','orange','game',
  'music','code','email','lamp','phone','queen','note','easy','youth','home','idea'
];

registerPublic({
  name: 'wordchain',
  aliases: ['chainword'],
  category: 'games',
  description: 'Play a simple word-chain game with the bot',
  usage: 'wordchain start | wordchain <word>',
  async run(ctx) {
    const value = clean(ctx.argText, 40).toLowerCase().replace(/[^a-z]/g, '');
    if (!value || value === 'start') {
      const first = pick(chainWords);
      ctx.user.publicWordChainLast = first;
      await db.save();
      return ctx.reply('WORD CHAIN\n\nBot: ' + first + '\nYour word must start with ' + first.slice(-1).toUpperCase() + '.\nReply: ' + ctx.prefix + 'wordchain <word>');
    }
    const last = String(ctx.user.publicWordChainLast || '');
    if (!last) return ctx.reply('Start with ' + ctx.prefix + 'wordchain start');
    if (value[0] !== last.slice(-1)) return ctx.reply('Your word must start with ' + last.slice(-1).toUpperCase() + '.');
    const next = chainWords.filter((w) => w[0] === value.slice(-1) && w !== value);
    if (!next.length) {
      ctx.user.publicWordChainLast = null;
      await db.save();
      return ctx.reply('Nice one. I have no simple word for ' + value.slice(-1).toUpperCase() + '. You win this round.');
    }
    const botWord = pick(next);
    ctx.user.publicWordChainLast = botWord;
    await db.save();
    await ctx.reply('Bot: ' + botWord + '\nNext letter: ' + botWord.slice(-1).toUpperCase());
  }
});

const scrambleWords = ['javascript','whatsapp','computer','internet','developer','keyboard','browser','picture','network','science','football','android'];

registerPublic({
  name: 'scramble',
  aliases: ['wordscramble'],
  category: 'games',
  description: 'Start a scrambled-word game',
  async run(ctx) {
    const word = pick(scrambleWords);
    let shuffled = word;
    for (let tries = 0; tries < 6 && shuffled === word; tries += 1) shuffled = [...word].sort(() => Math.random() - 0.5).join('');
    ctx.user.publicScramble = word;
    await db.save();
    await ctx.reply('WORD SCRAMBLE\n\n' + shuffled.toUpperCase() + '\n\nReply: ' + ctx.prefix + 'scrambleanswer <word>');
  }
});

registerPublic({
  name: 'scrambleanswer',
  aliases: ['sanswer'],
  category: 'games',
  description: 'Answer your latest scramble',
  usage: 'scrambleanswer <word>',
  async run(ctx) {
    const target = String(ctx.user.publicScramble || '');
    if (!target) return ctx.reply('Start with ' + ctx.prefix + 'scramble.');
    const ok = clean(ctx.argText, 60).toLowerCase() === target;
    if (ok) {
      ctx.user.publicScramble = null;
      await db.save();
    }
    await ctx.reply(ok ? 'Correct!' : 'Try again.');
  }
});

registerPublic({
  name: 'anagram',
  aliases: ['mixletters'],
  category: 'fun',
  description: 'Create random letter-mixes from a word',
  usage: 'anagram hello',
  async run(ctx) {
    const word = clean(ctx.argText, 24).replace(/\s+/g, '');
    if (word.length < 3) return ctx.reply('Usage: ' + ctx.prefix + 'anagram <word>');
    const rows = new Set();
    for (let i = 0; i < 20 && rows.size < 5; i += 1) rows.add([...word].sort(() => Math.random() - 0.5).join(''));
    await ctx.reply('LETTER MIXES\n\n' + [...rows].map((v, i) => (i + 1) + '. ' + v).join('\n') + '\n\nNot guaranteed to be dictionary words.');
  }
});

function newMathQuestion() {
  const a = 2 + Math.floor(Math.random() * 30);
  const b = 2 + Math.floor(Math.random() * 20);
  const op = pick(['+','-','x']);
  const answer = op === '+' ? a + b : op === '-' ? a - b : a * b;
  return { q: a + ' ' + op + ' ' + b, a: answer };
}

registerPublic({
  name: 'mathquiz',
  aliases: ['quickmath'],
  category: 'games',
  description: 'Start a quick maths quiz',
  async run(ctx) {
    const item = newMathQuestion();
    ctx.user.publicMathQuiz = item;
    await db.save();
    await ctx.reply('MATH QUIZ\n\n' + item.q + ' = ?\n\nReply: ' + ctx.prefix + 'mathanswer <number>');
  }
});

registerPublic({
  name: 'mathanswer',
  aliases: ['manswer'],
  category: 'games',
  description: 'Answer your latest maths quiz',
  async run(ctx) {
    const item = ctx.user.publicMathQuiz;
    if (!item) return ctx.reply('Start with ' + ctx.prefix + 'mathquiz.');
    const n = Number(ctx.args[0]);
    const ok = Number.isFinite(n) && n === item.a;
    if (ok) {
      ctx.user.publicMathQuiz = null;
      await db.save();
    }
    await ctx.reply(ok ? 'Correct!' : 'Not correct. Try again.');
  }
});

const typingSentences = [
  'Fast hands are useful, but accurate hands are better.',
  'Small improvements become big results with enough consistency.',
  'The quick brown fox jumps over the lazy dog.',
  'Good code is easier to read than it is to explain.'
];

registerPublic({
  name: 'typingtest',
  aliases: ['typetest'],
  category: 'games',
  description: 'Start a simple WhatsApp typing-speed challenge',
  async run(ctx) {
    const sentence = pick(typingSentences);
    ctx.user.publicTypingTest = { sentence, at: Date.now() };
    await db.save();
    await ctx.reply('TYPING TEST\n\nType this exactly:\n\n' + sentence + '\n\nSend: ' + ctx.prefix + 'typinganswer ' + sentence);
  }
});

registerPublic({
  name: 'typinganswer',
  aliases: ['typeanswer'],
  category: 'games',
  description: 'Finish your typing test',
  async run(ctx) {
    const row = ctx.user.publicTypingTest;
    if (!row?.sentence) return ctx.reply('Start with ' + ctx.prefix + 'typingtest.');
    const answer = clean(ctx.argText, 600);
    const seconds = Math.max(1, (Date.now() - Number(row.at || Date.now())) / 1000);
    const words = row.sentence.trim().split(/\s+/).length;
    const wpm = Math.round(words / (seconds / 60));
    const exact = answer === row.sentence;
    ctx.user.publicTypingTest = null;
    await db.save();
    await ctx.reply((exact ? 'Exact match' : 'Text did not exactly match') + '\nTime: ' + seconds.toFixed(1) + 's\nApprox WPM: ' + Math.max(0, Math.min(400, wpm)));
  }
});

const firstNames = ['Nova','Pixel','Shadow','Echo','Blaze','Orbit','Neo','Frost','Volt','Ace','Ghost','Zen'];
const secondNames = ['Wolf','Coder','Storm','Byte','Knight','Wave','Core','Fox','Mode','Spark','Rider','X'];

registerPublic({
  name: 'randomname',
  aliases: ['namegen'],
  category: 'fun',
  description: 'Generate random display-name ideas',
  async run(ctx) {
    const rows = Array.from({ length: 6 }, () => pick(firstNames) + pick(secondNames) + Math.floor(Math.random() * 100));
    await ctx.reply('RANDOM NAMES\n\n' + [...new Set(rows)].map((v, i) => (i + 1) + '. ' + v).join('\n'));
  }
});

registerPublic({
  name: 'randomteam',
  aliases: ['maketeams'],
  category: 'games',
  description: 'Randomly split names into teams',
  usage: 'randomteam 2 | Ali | Sara | Ahmed | Zoya',
  async run(ctx) {
    const parts = clean(ctx.argText, 1500).split('|').map((v) => v.trim()).filter(Boolean);
    const count = Math.max(2, Math.min(6, Number(parts.shift()) || 2));
    if (parts.length < count) return ctx.reply('Usage: ' + ctx.prefix + 'randomteam 2 | Ali | Sara | Ahmed | Zoya');
    parts.sort(() => Math.random() - 0.5);
    const teams = Array.from({ length: count }, () => []);
    parts.forEach((name, i) => teams[i % count].push(name));
    await ctx.reply(teams.map((team, i) => 'TEAM ' + (i + 1) + '\n' + team.join(', ')).join('\n\n'));
  }
});

registerPublic({
  name: 'spin',
  aliases: ['wheel'],
  category: 'fun',
  description: 'Pick one option at random',
  usage: 'spin tea | coffee | juice',
  async run(ctx) {
    const rows = clean(ctx.argText, 1000).split('|').map((v) => v.trim()).filter(Boolean);
    if (rows.length < 2 || rows.length > 30) return ctx.reply('Usage: ' + ctx.prefix + 'spin option 1 | option 2');
    await ctx.reply('SPIN RESULT\n\n' + pick(rows));
  }
});

function parseSeconds(value = '') {
  const raw = String(value).trim().toLowerCase();
  const m = raw.match(/^(\d+(?:\.\d+)?)\s*(s|sec|secs|second|seconds|m|min|mins|minute|minutes|h|hr|hour|hours)?$/);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2] || 's';
  const mult = unit.startsWith('h') ? 3600 : unit.startsWith('m') ? 60 : 1;
  return Math.round(n * mult);
}

registerPublic({
  name: 'countdowntext',
  aliases: ['counttext'],
  category: 'utility',
  description: 'Format a duration as a readable countdown',
  usage: 'countdowntext 90s',
  async run(ctx) {
    const seconds = parseSeconds(ctx.argText);
    if (!Number.isFinite(seconds) || seconds < 0 || seconds > 7 * 86400) return ctx.reply('Usage: ' + ctx.prefix + 'countdowntext 90s | 10m | 2h');
    let s = seconds;
    const d = Math.floor(s / 86400); s %= 86400;
    const h = Math.floor(s / 3600); s %= 3600;
    const m = Math.floor(s / 60); s %= 60;
    const rows = [d && d + 'd', h && h + 'h', m && m + 'm', (s || (!d && !h && !m)) && s + 's'].filter(Boolean);
    await ctx.reply(rows.join(' '));
  }
});

registerPublic({
  name: 'decision',
  aliases: ['decide'],
  category: 'fun',
  description: 'Get a random just-for-fun decision',
  usage: 'decision should I watch a movie?',
  async run(ctx) {
    const q = clean(ctx.argText, 300) || 'Your question';
    const answer = pick(['YES','NO','MAYBE','ASK AGAIN LATER','GO FOR IT','NOT TODAY']);
    await ctx.reply('DECISION - FOR FUN\n\n' + q + '\n\n' + answer);
  }
});

const hotseat = [
  'What is your most-used app?',
  'What is a skill you secretly want to learn?',
  'What is the funniest thing in your camera roll?',
  'What would you buy first if you got a surprise bonus?',
  'Which habit would you delete instantly if you could?',
  'What is your current favorite song?'
];
const never = [
  'Never have I ever stayed awake until sunrise.',
  'Never have I ever sent a message to the wrong person.',
  'Never have I ever pretended not to see a notification.',
  'Never have I ever deleted a post because it got no attention.',
  'Never have I ever laughed at my own message before sending it.',
  'Never have I ever forgotten why I opened an app.'
];
const likely = [
  'Who is most likely to reply after three business days?',
  'Who is most likely to become famous?',
  'Who is most likely to fall asleep during a movie?',
  'Who is most likely to lose their charger?',
  'Who is most likely to start a random road trip?',
  'Who is most likely to survive without social media for a month?'
];

registerPublic({ name:'hotseat', category:'games', description:'Get a safe hot-seat question', async run(ctx){ await ctx.reply('HOT SEAT\n\n' + pick(hotseat)); } });
registerPublic({ name:'neverhaveiever', aliases:['nhie'], category:'games', description:'Get a safe Never Have I Ever prompt', async run(ctx){ await ctx.reply('NEVER HAVE I EVER\n\n' + pick(never)); } });
registerPublic({ name:'mostlikely', aliases:['mostlikelyto'], category:'games', description:'Get a Who Is Most Likely To prompt', async run(ctx){ await ctx.reply('MOST LIKELY TO\n\n' + pick(likely)); } });

registerPublic({
  name: 'rankrandom',
  aliases: ['randomrank'],
  category: 'fun',
  description: 'Randomly rank supplied items for fun',
  usage: 'rankrandom pizza | burger | pasta',
  async run(ctx) {
    const rows = clean(ctx.argText, 1200).split('|').map((v) => v.trim()).filter(Boolean);
    if (rows.length < 2 || rows.length > 20) return ctx.reply('Usage: ' + ctx.prefix + 'rankrandom item 1 | item 2 | item 3');
    rows.sort(() => Math.random() - 0.5);
    await ctx.reply('RANDOM RANKING - FOR FUN\n\n' + rows.map((v, i) => (i + 1) + '. ' + v).join('\n'));
  }
});

registerPublic({
  name: 'emojiart',
  aliases: ['emojiwall'],
  category: 'fun',
  description: 'Create a simple emoji pattern',
  usage: 'emojiart fire-emoji',
  async run(ctx) {
    const emoji = clean(ctx.argText, 8) || '✨';
    const row = Array(5).fill(emoji).join(' ');
    await ctx.reply([row, '  ' + row, row, '  ' + row, row].join('\n'));
  }
});

const morseMap = { A:'.-',B:'-...',C:'-.-.',D:'-..',E:'.',F:'..-.',G:'--.',H:'....',I:'..',J:'.---',K:'-.-',L:'.-..',M:'--',N:'-.',O:'---',P:'.--.',Q:'--.-',R:'.-.',S:'...',T:'-',U:'..-',V:'...-',W:'.--',X:'-..-',Y:'-.--',Z:'--..' };

registerPublic({
  name:'morseplay',
  aliases:['morsequiz'],
  category:'games',
  description:'Start a Morse-code letter quiz',
  async run(ctx){
    const letter=pick(Object.keys(morseMap));
    ctx.user.publicMorseQuiz={letter,code:morseMap[letter]};
    await db.save();
    await ctx.reply('MORSE QUIZ\n\nWhat letter is: ' + morseMap[letter] + ' ?\nReply: ' + ctx.prefix + 'morseanswer <letter>');
  }
});

registerPublic({
  name:'morseanswer',
  aliases:['moanswer'],
  category:'games',
  description:'Answer latest Morse quiz',
  async run(ctx){
    const row=ctx.user.publicMorseQuiz;
    if(!row) return ctx.reply('Start with ' + ctx.prefix + 'morseplay.');
    const ok=clean(ctx.argText,4).toUpperCase()===row.letter;
    if(ok){ctx.user.publicMorseQuiz=null; await db.save();}
    await ctx.reply(ok?'Correct!':'Try again.');
  }
});

registerPublic({
  name:'binaryquiz',
  aliases:['binquiz'],
  category:'games',
  description:'Start a binary-to-decimal mini quiz',
  async run(ctx){
    const n=Math.floor(Math.random()*31)+1;
    ctx.user.publicBinaryQuiz=n;
    await db.save();
    await ctx.reply('BINARY QUIZ\n\n' + n.toString(2) + ' = ? in decimal\nReply: ' + ctx.prefix + 'binaryanswer <number>');
  }
});

registerPublic({
  name:'binaryanswer',
  aliases:['binanswer'],
  category:'games',
  description:'Answer latest binary quiz',
  async run(ctx){
    const target=Number(ctx.user.publicBinaryQuiz);
    if(!target) return ctx.reply('Start with ' + ctx.prefix + 'binaryquiz.');
    const ok=Number(ctx.args[0])===target;
    if(ok){ctx.user.publicBinaryQuiz=null; await db.save();}
    await ctx.reply(ok?'Correct!':'Try again.');
  }
});

const devQuotes = [
  'Make it work, make it right, then make it fast.',
  'Readable code is a feature.',
  'The best bug is the one your test catches first.',
  'Automate the boring part, understand the important part.',
  'Simple code is easier to trust.'
];

registerPublic({ name:'devquote', aliases:['coderquote'], category:'fun', description:'Get a short developer quote', async run(ctx){ await ctx.reply(pick(devQuotes)); } });

const techTrivia = [
  {q:'What does CPU stand for?',a:'central processing unit'},
  {q:'Which protocol is normally used for secure web browsing?',a:'https'},
  {q:'What does RAM stand for?',a:'random access memory'},
  {q:'Which company originally created Android?',a:'android inc'},
  {q:'What does URL stand for?',a:'uniform resource locator'}
];

registerPublic({
  name:'techtrivia',
  aliases:['techquiz'],
  category:'games',
  description:'Start a technology trivia question',
  async run(ctx){
    const item=pick(techTrivia);
    ctx.user.publicTechTrivia=item;
    await db.save();
    await ctx.reply('TECH TRIVIA\n\n'+item.q+'\nReply: '+ctx.prefix+'techanswer <answer>');
  }
});

registerPublic({
  name:'techanswer',
  aliases:['tqanswer'],
  category:'games',
  description:'Answer latest tech trivia',
  async run(ctx){
    const item=ctx.user.publicTechTrivia;
    if(!item) return ctx.reply('Start with '+ctx.prefix+'techtrivia.');
    const a=clean(ctx.argText,100).toLowerCase();
    const ok=a===item.a||item.a.includes(a)||a.includes(item.a);
    if(ok){ctx.user.publicTechTrivia=null; await db.save();}
    await ctx.reply(ok?'Correct!':'Not quite.');
  }
});

const cyberTrivia = [
  {q:'Should you reuse the same password across many sites?',a:'no',why:'Unique passwords reduce damage if one site is breached.'},
  {q:'What does MFA add besides a password?',a:'another factor',why:'MFA adds a second verification factor.'},
  {q:'Is it safe to share a one-time login code with someone claiming to be support?',a:'no',why:'Legitimate support should not need your one-time code.'},
  {q:'What should you check before opening a suspicious link?',a:'domain',why:'Checking the real domain helps detect phishing.'},
  {q:'Should software security updates generally be installed promptly?',a:'yes',why:'Updates often patch known vulnerabilities.'}
];

registerPublic({
  name:'cyberquiz',
  aliases:['securityquiz'],
  category:'games',
  description:'Start a defensive cybersecurity quiz',
  async run(ctx){
    const item=pick(cyberTrivia);
    ctx.user.publicCyberTrivia=item;
    await db.save();
    await ctx.reply('CYBER QUIZ - DEFENSIVE\n\n'+item.q+'\nReply: '+ctx.prefix+'cyberanswer <answer>');
  }
});

registerPublic({
  name:'cyberanswer',
  aliases:['secanswer'],
  category:'games',
  description:'Answer latest defensive cybersecurity quiz',
  async run(ctx){
    const item=ctx.user.publicCyberTrivia;
    if(!item) return ctx.reply('Start with '+ctx.prefix+'cyberquiz.');
    const a=clean(ctx.argText,120).toLowerCase();
    const target=item.a.toLowerCase();
    const ok=a===target||target.includes(a)||a.includes(target);
    if(ok){ctx.user.publicCyberTrivia=null; await db.save();}
    await ctx.reply((ok?'Correct!':'Not quite.')+'\n'+item.why);
  }
});

registerPublic({
  name: 'vibecheck',
  aliases: ['vibe'],
  category: 'fun',
  description: 'Give a stable fun vibe score',
  usage: 'vibecheck <name/text>',
  async run(ctx) {
    const value = clean(ctx.argText || 'you', 120);
    const score = stablePercent('vibe:' + value);
    const label = score >= 85 ? 'ELITE ENERGY' : score >= 65 ? 'STRONG VIBE' : score >= 40 ? 'CHILL VIBE' : score >= 20 ? 'MYSTERY MODE' : 'LOW BATTERY VIBE';
    await ctx.reply('VIBE CHECK\n\n' + value + '\n' + progressBar(score) + '\n' + label + '\n\nFor fun only.');
  }
});

registerPublic({
  name: 'compat',
  aliases: ['compatibility', 'match'],
  category: 'fun',
  description: 'Fun compatibility score between two names',
  usage: 'compat Ali | Sara',
  async run(ctx) {
    const parts = clean(ctx.argText, 180).split('|').map((v) => v.trim()).filter(Boolean);
    if (parts.length !== 2) return ctx.reply('Usage: ' + ctx.prefix + 'compat Name 1 | Name 2');
    const normalized = [...parts].map((v) => v.toLowerCase()).sort().join('|');
    const score = stablePercent('compat:' + normalized);
    await ctx.reply('COMPATIBILITY\n\n' + parts[0] + ' x ' + parts[1] + '\n' + progressBar(score) + '\n\nFor fun only.');
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
    const names = [
      a.slice(0, Math.max(1, Math.ceil(a.length / 2))) + b.slice(Math.floor(b.length / 2)),
      b.slice(0, Math.max(1, Math.ceil(b.length / 2))) + a.slice(Math.floor(a.length / 2)),
      a.slice(0, Math.max(1, Math.floor(a.length / 2))) + b.slice(Math.ceil(b.length / 2))
    ];
    await ctx.reply('SHIP NAMES\n\n' + [...new Set(names)].map((v, i) => (i + 1) + '. ' + v).join('\n'));
  }
});

const thisOrThat = [
  'Tea or Coffee?',
  'Android or iPhone?',
  'Mountains or Beach?',
  'Night or Morning?',
  'Gaming or Movies?',
  'Money or Free Time?',
  'Texting or Calling?',
  'City or Village?',
  'Coding or Designing?',
  'Music or Podcasts?'
];

registerPublic({ name:'thisorthat', aliases:['eitheror'], category:'games', description:'Get a random this-or-that question', async run(ctx){ await ctx.reply('THIS OR THAT\n\n'+pick(thisOrThat)); } });

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

registerPublic({ name:'icebreaker', aliases:['breakice'], category:'games', description:'Get a random conversation starter', async run(ctx){ await ctx.reply('ICEBREAKER\n\n'+pick(icebreakers)); } });

const pickupLines = [
  'Are you Wi-Fi? Because I am definitely feeling a connection.',
  'You must be a keyboard, because you are just my type.',
  'Are you a bug fix? Because you just made my day work better.',
  'You must be dark mode, because everything looks better with you around.',
  'Are you a notification? Because you got my attention instantly.'
];

registerPublic({ name:'pickup', aliases:['pickupline'], category:'fun', description:'Get a light clean pickup line', async run(ctx){ await ctx.reply(pick(pickupLines)); } });

const motivation = [
  'Do the smallest useful step first. Momentum usually follows.',
  'You do not need perfect conditions to make real progress.',
  'Finish one thing before starting five more.',
  'A rough version today beats a perfect version that never ships.',
  'Consistency looks boring until the results show up.',
  'If the task feels huge, shrink the next step, not the goal.'
];

registerPublic({ name:'motivate', aliases:['motivation'], category:'fun', description:'Get a short motivation line', async run(ctx){ await ctx.reply(pick(motivation)); } });

registerPublic({
  name: 'moodcheck',
  aliases: ['moodmeter'],
  category: 'fun',
  description: 'Get a fun mood meter',
  usage: 'moodcheck [name]',
  async run(ctx) {
    const value = clean(ctx.argText || 'Your mood', 80);
    const score = stablePercent('mood:' + value + ':' + new Date().toISOString().slice(0, 10));
    await ctx.reply('MOOD METER\n\n' + value + '\n' + progressBar(score) + '\n\nFor fun only.');
  }
});
