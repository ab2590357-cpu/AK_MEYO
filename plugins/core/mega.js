import fs from 'node:fs/promises';
import { registerCommand } from '../../lib/core/registry.js';
import { config } from '../../lib/config.js';
import { db } from '../../lib/core/database.js';
import { targetJidFromMessage } from '../../lib/utils/message.js';
import { serifBold, premiumLabel, premiumTitle } from '../../lib/utils/brand-style.js';

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const hashScore = (value = '') => {
  let h = 2166136261;
  for (const ch of String(value)) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h >>> 0) % 101;
};
const humanize = (name) => String(name).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[0-9]+$/g, '').replace(/[_-]/g, ' ');
const targetInfo = (ctx) => {
  const jid = targetJidFromMessage(ctx.msg, ctx.args);
  if (jid) return { jid, label: `@${jid.split('@')[0]}`, mentions: [jid] };
  return { jid: '', label: 'you', mentions: [] };
};
const targetSeed = (ctx, name) => `${ctx.senderNumber}:${ctx.argText}:${name}:${new Date().toISOString().slice(0, 10)}`;
const safeText = (text, max = 1200) => String(text || '').trim().slice(0, max);

function vipFooter() {
  return [
    `╭━━━〔 👑 ${serifBold('POWERED BY')} 👑 〕━━━╮`,
    `┃ ${serifBold('ABDULLAH-X-HACKER')}`,
    `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯`
  ];
}

function vipBox(title, rows, icon = '✨') {
  return [
    `╭━━━〔 ${icon} ${serifBold(title)} ${icon} 〕━━━╮`,
    ...rows,
    `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯`
  ];
}

function registerSimple(name, category, description, handler, aliases = []) {
  registerCommand({ name, aliases, category, description, cooldown: 1, async run(ctx) { await handler(ctx); } });
}

// Reference-style mood/tools that are fully local and reliable.
const moodCommands = {
  happy: '😄✨ A-X-HK mood: HAPPY MODE ON!',
  heart: '💚💚💚 A-X-HK sends good vibes.',
  angry: '😤⚡ Anger detected. Cool down, reset, move smart.',
  sad: '💙 Tough moment. Take it one step at a time.',
  shy: '🙈✨ Shy mode activated.',
  moon: '🌙✨ Night vibes by A-X-HK.',
  confused: '🤔 Confused? Break the problem into smaller steps.',
  nikal: '😂 A-X-HK says: chalo bhai, scene change!',
  boost: '⚡ BOOST MODE: focus + speed + consistency = ON.'
};
for (const [name, text] of Object.entries(moodCommands)) {
  registerSimple(name, name === 'happy' ? 'emotion' : 'tools', `A-X-HK ${name} reaction`, async (ctx) => ctx.reply(text));
}

registerSimple('hashtag', 'tools', 'Turn words into hashtags', async (ctx) => {
  if (!ctx.argText) return ctx.reply(`Usage: ${ctx.prefix}hashtag whatsapp bot pakistan`);
  const tags = ctx.argText.split(/\s+/).map((v) => v.replace(/[^\p{L}\p{N}_]/gu, '')).filter(Boolean).slice(0, 30);
  await ctx.reply(tags.map((v) => `#${v}`).join(' '));
});

registerSimple('fancy', 'tools', 'Convert text to full-width fancy text', async (ctx) => {
  if (!ctx.argText) return ctx.reply(`Usage: ${ctx.prefix}fancy Abdullah X HK`);
  const out = [...ctx.argText].map((ch) => {
    const code = ch.charCodeAt(0);
    if (code === 32) return '　';
    if (code >= 33 && code <= 126) return String.fromCharCode(code + 0xFEE0);
    return ch;
  }).join('');
  await ctx.reply(out.slice(0, 3500));
});

// Friendly action commands. They mention a replied/mentioned user when one is supplied.
const actionLabels = {
  cry: ['cries dramatically 😭', 'needs a tissue 😭🧻'],
  cuddle: ['sends a warm virtual cuddle 🤗', 'wraps a cozy virtual hug 🫂'],
  hug: ['sends a big hug 🤗', 'gives a friendly hug 🫂'],
  awoo: ['goes AWOOOO 🐺🌙', 'howls at the moon 🐺'],
  lick: ['sends a silly puppy-style lick 🐶😄'],
  pat: ['gives a friendly head pat ✨', 'sends a supportive pat 🤝'],
  smug: ['activates smug mode 😏'],
  bonk: ['sends a harmless virtual bonk 😄🔨'],
  yeet: ['yeets the bad vibes away 🚀'],
  blush: ['is blushing 🙈✨'],
  handhold: ['offers a friendly hand 🤝'],
  highfive: ['high-fives ✋⚡'],
  nom: ['says nom nom 😋'],
  wave: ['waves hello 👋'],
  smile: ['sends a smile 😊'],
  wink: ['winks 😉'],
  glomp: ['sends an enthusiastic hug 🤗✨'],
  bite: ['does a cartoon chomp 😄'],
  poke: ['pokes playfully 👉😄'],
  cringe: ['cringe meter activated 😬'],
  dance: ['starts dancing 💃🕺'],
  kiss: ['sends a sweet virtual kiss 💚'],
  fluff: ['fluffy vibes activated ☁️✨'],
  pout: ['pout mode 😗'],
  tail: ['happy tail-wag mode 🐶'],
  tickle: ['sends virtual tickles 😂'],
  roll: ['rolls into the chat 🔄😄'],
  flirt2: ['drops a harmless cheesy line 😄💚'],
  laugh: ['bursts out laughing 😂', 'cannot stop laughing 🤣'],
  punch: ['throws a harmless cartoon punch 👊😄'],
  slap: ['sends a harmless cartoon slap ✋😄'],
  shrug: ['shrugs 🤷', 'shrug mode activated 🤷‍♂️'],
  stare: ['stares dramatically 👀', 'intense stare mode 👀'],
  nod: ['nods in agreement 🙂‍↕️', 'gives an approving nod ✅'],
  spin: ['spins into the chat 🌀😄'],
  shake: ['shakes it off 💃✨'],
  run: ['runs through the chat 🏃💨'],
  nya: ['says nya~ 🐱✨'],
  wag: ['happy tail wag 🐶💚'],
  baka: ['says baka in anime mode 😄🎌'],
  sleep: ['falls into sleep mode 😴💤'],
  sip: ['takes a calm sip ☕😌'],
  yawn: ['yawns dramatically 🥱'],
  bored: ['is officially bored 😐🎮']
};
const actionCategories = {
  cuddle: 'romantic', hug: 'romantic', kiss: 'romantic', pat: 'romantic',
  laugh: 'funny', tickle: 'funny', poke: 'funny', wink: 'funny',
  punch: 'action', slap: 'action', bonk: 'action',
  smile: 'emotion', blush: 'emotion', smug: 'emotion',
  shrug: 'reaction', stare: 'reaction', nod: 'reaction',
  dance: 'entertainment', spin: 'entertainment', shake: 'entertainment', run: 'entertainment',
  nya: 'cute', wag: 'cute', bite: 'cute', baka: 'cute',
  sleep: 'mood', sip: 'mood', yawn: 'mood', bored: 'mood'
};
for (const [name, variants] of Object.entries(actionLabels)) {
  registerSimple(name, actionCategories[name] || 'actions', `${humanize(name)} reaction`, async (ctx) => {
    const t = targetInfo(ctx);
    await ctx.reply(`${t.label} ${pick(variants)}`, t.mentions.length ? { mentions: t.mentions } : {});
  });
}

registerCommand({
  name: 'reactionmenu', aliases: ['reactions', 'actionmenu', 'reactionlist'], category: 'actions',
  description: 'Show the premium interactive reaction command pack', cooldown: 1,
  async run(ctx) {
    await ctx.reply([
      `╭━━━━━━━━〔 💖 ${serifBold('A-X-HK REACTION HUB')} ✨ 〕━━━━━━━━╮`,
      `│`,
      `│ ${premiumTitle('PREMIUM INTERACTIVE REACTIONS', '💫', '💫')}`,
      `│`,
      `│ ${premiumLabel('VERSION', `V${config.version}`, '🏷️')}`,
      `│`,
      `│ ${premiumLabel('WORKS IN', 'INBOX + GROUPS', '💬')}`,
      `│`,
      `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯`, '',
      `⚡ *${serifBold('AUTO REACTION')}*`,
      `• *${ctx.prefix}autoreact on*   • *${ctx.prefix}autoreact off*`,
      `• *${ctx.prefix}auto react on* • *${ctx.prefix}auto react off*`, '',
      `❤️ *${serifBold('ROMANTIC')}*`,
      `${ctx.prefix}hug • ${ctx.prefix}kiss • ${ctx.prefix}cuddle • ${ctx.prefix}pat`, '',
      `😂 *${serifBold('FUNNY')}*`,
      `${ctx.prefix}laugh • ${ctx.prefix}tickle • ${ctx.prefix}poke • ${ctx.prefix}wink`, '',
      `👊 *${serifBold('ACTION')}*`,
      `${ctx.prefix}slap • ${ctx.prefix}punch • ${ctx.prefix}kick • ${ctx.prefix}bonk`, '',
      `😊 *${serifBold('EMOTION')}*`,
      `${ctx.prefix}happy • ${ctx.prefix}smile • ${ctx.prefix}blush • ${ctx.prefix}smug`, '',
      `🤷 *${serifBold('REACTION')}*`,
      `${ctx.prefix}shrug • ${ctx.prefix}stare • ${ctx.prefix}clap • ${ctx.prefix}nod`, '',
      `💃 *${serifBold('ENTERTAINMENT')}*`,
      `${ctx.prefix}dance • ${ctx.prefix}spin • ${ctx.prefix}shake • ${ctx.prefix}run`, '',
      `🐱 *${serifBold('CUTE')}*`,
      `${ctx.prefix}nya • ${ctx.prefix}wag • ${ctx.prefix}bite • ${ctx.prefix}baka`, '',
      `😴 *${serifBold('DAILY MOOD')}*`,
      `${ctx.prefix}sleep • ${ctx.prefix}sip • ${ctx.prefix}yawn • ${ctx.prefix}bored`, '',
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `✅ *Groups + Inbox*   •   ⚡ *Fast*   •   🔥 *Smooth*`,
      ``,
      config.footerMessage
    ].join('\n'));
  }
});


const scoreCommands = {
  compatibility: 'Compatibility',
  aura: 'Aura power',
  lovetest: 'Love vibe',
  ship: 'Ship score',
  crush: 'Crush energy',
  ishqmeter: 'Ishq meter',
  stresslevel: 'Stress meter',
  lifebattery: 'Life battery',
  personalitytest: 'Personality spark',
  superpower: 'Superpower level',
  celebmatch: 'Celebrity-match vibe',
  friendtype: 'Friendship energy',
  typingSpeed: 'Typing-speed vibe',
  monsterenergy: 'Monster energy',
  emotionaldamage: 'Drama meter',
  nightowl: 'Night-owl level',
  loveCalc2: 'Love calculator',
  soulcolor: 'Soul glow',
  weatherMood: 'Weather mood',
  pizzaorbiryani: 'Food-decision confidence'
};
for (const [nameRaw, label] of Object.entries(scoreCommands)) {
  const name = nameRaw.toLowerCase();
  registerSimple(name, 'funtext', `${label} fun score`, async (ctx) => {
    const score = hashScore(targetSeed(ctx, name));
    const subject = ctx.argText ? `“${safeText(ctx.argText, 100)}”` : 'today';
    await ctx.reply(`${label}: ${score}%\nSubject: ${subject}\n🎮 Just for fun — ${config.shortName}`);
  });
}

const funLines = {
  texi: 'A-X-HK text vibe: clean, sharp, premium. ✨',
  funxy: 'Fun mode activated. 😄⚡',
  andhaishq: 'Andha ishq result: dil says yes, logic says “check again” 😂',
  lafzmohabbat: 'Mohabbat ka lafz: respect + trust + consistency. 💚',
  pehlinazar: 'Pehli nazar verdict: strong first impression ✨',
  dillagi: 'Dillagi meter: thori si masti, thora sa scene 😄',
  khoobsurat: 'Khoobsurti score: confidence makes the difference ✨',
  dhadkan: 'Dhadkan status: fast but stable 💚',
  pehlaakhat: 'Pehla khat: “Tumhari vibe achi hai, bas itna hi kehna tha.” 💌',
  ziddidil: 'Ziddi dil: mission pe laga hua hai 😄',
  yaadaata: 'Yaad mode: old memories unlocked 📸',
  taubatauba: 'Tauba tauba 😄 A-X-HK ne scene dekh liya.',
  pehlamuhabbat: 'Pehli mohabbat: unforgettable chapter, not always the final chapter.',
  wafaimtihaan: 'Wafa test: actions > words. ✅',
  donokikahani: 'Do log, aik chat, aur bohat sari notifications — kahani shuru 😄',
  gulabbhejo: '🌹 A virtual rose from A-X-HK.',
  aankhein: 'Aankhon ka message: sometimes silence says enough. 👀',
  shayarban: 'Shayar mode: “Raasta lamba sahi, hausla kam na ho.”',
  dushmandost: 'Plot twist: kabhi dushman bhi dost ban jata hai 😄',
  tangkarna: 'Tang karna level: playful only 😄',
  smilechurao: 'Smile successfully stolen 😄✨',
  jaan: 'Jaan mode: VIP vibes only 💚',
  qismatwala: 'Qismat meter says: apni mehnat se odds improve karo. ⚡',
  jhoothpyaar: 'Red flag detector: consistency check karo. 🚩',
  siyaanibaat: 'Siyaani baat: reply dene se pehle context zaroor dekho.',
  mohabbatqarz: 'Mohabbat qarz nahi — mutual respect honi chahiye.',
  nazarutarao: '🧿 Good vibes, bad vibes out.',
  romanticbakwaas: 'Romantic bakwaas mode: “Wi-Fi weak ho sakta hai, connection nahi.” 😄',
  aashiqanaaward: '🏆 Aashiqana award: confidence category.',
  mohabbatteri: 'Mohabbat status: soft vibes 💚',
  dilkhol: 'Dil khol ke bolo — respectful communication wins.',
  gussapyaar: 'Gussa + pyaar combo: pehle cool down, phir baat.',
  jasoos: 'Detective mode: clues collect karo, assumptions nahi. 🕵️',
  tangaphanda: 'A-X-HK says: overthinking ka phanda mat banao 😄',
  muftadvice: 'Muft advice: backups rakho, passwords unique rakho, aur pani piyo.',
  nakhrebaaz: 'Nakhre level: premium 😄✨',
  anokhapyaar: 'Anokha pyaar: respect + memes + support.',
  bhaaggaya: 'Scene se koi bhaag gaya 🏃💨',
  khushnaseebi: 'Khushnaseebi: good people + good timing + gratitude.',
  ronewala: 'Rona allowed hai, phir reset bhi zaroor. 💙',
  waqtguzarna: 'Waqt guzarna hai to kuch useful bhi build kar lo ⚡',
  chandsa: '🌙 Chand sa vibe detected.',
  dostyadildar: 'Dosti verdict: loyalty > daily messages.',
  galatfehmi: 'Galatfehmi fix: pooch lo, assume mat karo.',
  perfectmatch: 'Perfect match rule: respect, communication, humor.',
  raazkhola: 'Raaz: A-X-HK ko chai aur uptime pasand hai 😄',
  mohabbatdarjaa: 'Mohabbat darja: premium feelings, sensible decisions.',
  dua: '🤲 Dua: Allah aap ke liye asani aur barkat ata farmaye.',
  khwaabon: 'Khwaab dekho, phir unka plan banao.',
  akela: 'Akele waqt ko recharge mode banao.',
  bewafa: 'Bewafa detector: promises se zyada patterns dekho.',
  chakkar: 'Chakkar status: unnecessary drama avoid karo 😄',
  ullubana: 'A-X-HK ko ullu banana mushkil hai 😄',
  taalibajao: '👏 Taaliyan! Scene acha tha.',
  neenduraai: '😴 Neend aa rahi hai? Phone side pe, rest mode on.',
  chatpata: '🌶️ Chatpata vibe detected.',
  waitingroom: '⏳ Waiting room: patience loading…',
  taj: '👑 Taj A-X-HK style.',
  lafanga: 'Lafanga mode: harmless masti only 😄',
  chocolatewala: '🍫 Virtual chocolate delivered.',
  baatkaatna: 'Conversation rule: suno bhi, bolo bhi.',
  palat: 'Plot twist: palat ke dekha aur bot online tha 😄',
  haaththamnaa: '🤝 Support mode activated.',
  chuprahna: 'Kabhi kabhi silence bhi smart response hota hai.',
  phoolonkahaar: '💐 Virtual flowers delivered.',
  ghoordekhna: '👀 Stare detector activated.',
  bahaana: 'Bahaana detector: 87% suspicious 😄',
  tarkeeb: 'Tarkeeb: problem ko steps me tod do.',
  hassichhupa: 'Hansi chupana mushkil 😂',
  mobileband: '📵 Mobile break challenge: 10 minutes.',
  pagalpanCert: '📜 Certified harmless pagalpan 😄',
  wallpaper: 'Wallpaper tip: clean dark background + high contrast.',
  donobaat: 'Dono sides suno, phir decision lo.',
  kaanpakadna: '😄 Virtual apology accepted.',
  taqdir: 'Taqdir ke saath tadbeer bhi zaroori hai.',
  kapkapi: '🥶 Kapkapi mode activated.',
  taarifcommit: 'Commit message: feat: add premium-level confidence ✅',
  captioncontest: 'Caption: “Online, focused, and slightly overpowered.”',
  zyadaSocha: 'Overthinking alert: write the next action and do just that.',
  ghazab: '🔥 Ghazab! Premium scene.',
  buranamaano: 'Bura na mano, bot hai 😄',
  mirrormirror: 'Mirror says: confidence looks good on you.',
  merahero: '🦸 Hero mode: help someone today.',
  natkhat: '😄 Natkhat mode activated.',
  pareshan: 'Pareshani ko task list me convert karo.',
  interview: 'Interview tip: answer with situation, action, result.',
  kheltamam: '🎮 Khel tamam — GG!',
  rishtapakka: 'Rishtay ka bot verdict: humans decide, A-X-HK only jokes 😄',
  pyaardukaan: '💚 Pyaar ki dukaan: respect free, drama expensive.',
  zabaansambhlo: 'Friendly reminder: words matter.',
  jhootawada: 'Jhoota wada detector: verify actions.',
  sonawala: '😴 Sleep mode suggestion: ON.',
  gossip: 'Gossip filter: private matters private rakho.',
  funnyrishtedar: 'Every family has a comedian 😄',
  aankheband: '🙈 Eyes closed, confidence open.',
  alvidanahi: 'Alvida nahi — phir milenge 👋',
  desimom: 'Desi mom mode: “Phone choro, khana khao.” 😄',
  desidad: 'Desi dad mode: “Light band karo.” 😄',
  khanajudge: 'Food judge: biryani gets automatic bonus points.',
  rishtaaunt: 'Rishta aunty mode: profile review pending 😄',
  challenge: 'Challenge: 15 minutes without distractions — finish one task.',
  pakoraweather: 'Pakora weather detector: chai strongly recommended ☕',
  result: 'Result: effort detected. Keep going. ✅',
  cricketcomm: '🏏 Commentary: clean shot, perfect timing!',
  shadiprediction: 'Wedding prediction: A-X-HK refuses to predict real life 😄 Plan smart.',
  motivationalslap: '⚡ Motivation: stop waiting for perfect — ship the next small step.',
  wikifact: 'Fact mode: ask .wiki <topic> for a real Wikipedia lookup.',
  animepersonality: 'Anime personality: calm strategist with hidden power 😄',
  taunt: 'Mild taunt: loading speed se zyada excuses fast hain 😄',
  gharkawifi: 'Home Wi-Fi rule: router ko restart karna IT ka universal dua hai 😄',
  problems: 'Problems? List top 3, then solve the smallest first.',
  hugkr: '🤗 Virtual hug delivered.',
  mildroast: 'Mild roast: your “5 minute task” has been open for 3 days 😄',
  wisdomcookie: '🥠 Wisdom: simple systems beat heroic effort.',
  socialmedia: 'Social media reminder: consume less, create more.',
  whatanimal: 'Spirit animal: determined cat with Wi-Fi access 😄',
  complainbox: '📮 Complaint received by imaginary A-X-HK support desk.',
  naammatlab: 'Name meaning mode: use .wiki <name> for reliable background.',
  compliment2: '✨ You are doing better than your unfinished tabs suggest.',
  examseason: 'Exam mode: past papers + focused blocks + sleep.',
  pakfact: '🇵🇰 Pakistan became independent on 14 August 1947.',
  storygenerate: 'Story seed: A late-night coder, one stubborn bug, and a bot that refused to go offline.',
  botroast: 'Bot roast: I have 0 coffee and still reply faster 😄',
  weeklyreport: 'Weekly report: wins, lessons, next 3 priorities. Keep it simple.',
  shukria: '💚 Shukriya! A-X-HK appreciates you.',
  desiwisdom: 'Desi wisdom: kaam pe focus, baqi scene baad me.',
  kindness: 'Kindness challenge: send one sincere thank-you today.',
  newcmds: 'Use .menu all to see the expanded A-X-HK V4.9 catalog.'
};
for (const [raw, text] of Object.entries(funLines)) {
  const name = raw.toLowerCase();
  registerSimple(name, 'funtext', `${humanize(name)} fun response`, async (ctx) => ctx.reply(text));
}

// Respect / positive-response pack inspired by the reference menu, implemented locally.
const respectCommands = {
  respect: 'Respect always. 🤝', salute: 'Salute! 🫡', salam: 'Assalamualaikum! 🤝', adab: 'Adab! ✨',
  jazakallah: 'JazakAllah khair. 🤲', thankyou: 'Thank you! 💚', sorry: 'Sorry — respect first.', maafi: 'Maafi mangna strength hoti hai. 🤝',
  tazeem: 'Tazeem aur adab. ✨', izzat: 'Izzat do, izzat lo. 🤝', qadr: 'Qadr karo un logon ki jo saath dete hain.', ahsan: 'Ahsan ka jawab shukriya aur behtari se.',
  mehrbani: 'Bohat mehrbani. 💚', nawaz: 'Aap ki nawazish. ✨', salaam: 'Salaam! Peace and respect.', tasleem: 'Tasleem o adab.',
  shandar: 'Shandaar! 🔥', zabardast: 'Zabardast! ⚡', kamaal: 'Kamaal kar diya! ✨', lajawab: 'Lajawab! 👏',
  mashallah: 'MashaAllah. ✨', subhanallah: 'SubhanAllah. 🤲', barkatein: 'Allah barkat ata farmaye. 🤲', duain: 'Duaein aur best wishes. 💚',
  khidmat: 'Khidmat aur support appreciated.', ehtram: 'Ehtram sab se pehle.', appreciation: 'Appreciation deserved. 👏', proud: 'Proud moment. Keep going.',
  grateful: 'Stay grateful. 💚', karam: 'Karam aur meherbani.', inayat: 'Aap ki inayat. ✨', lutf: 'Lutf aur khushi.',
  mihr: 'Mehr aur kindness. 💚', shafqat: 'Shafqat is strength.', rahmat: 'Rahmat aur asani ki dua.', naimat: 'Naimaton ki qadr karein.',
  congratulations: 'Congratulations! 🎉', mubarak: 'Mubarak ho! 🎉', badhai: 'Bohat badhai! 🎊', tahseen: 'Tahseen! Excellent work.',
  afreen: 'Afreen! 👏', wah: 'Wah! Kya baat hai. 👏', khushi: 'Khushi share karne se barhti hai. 😊', dilse: 'Dil se shukriya. 💚',
  legend: 'Legend vibes. 👑', hero: 'Hero mode. 🦸', superstar: 'Superstar energy. ⭐', rockstar: 'Rockstar! 🎸',
  champion: 'Champion mindset. 🏆', boss: 'Boss mode. 👑', king: 'King energy. 👑', queen: 'Queen energy. 👑',
  gem: 'A real gem. 💎', diamond: 'Diamond-level value. 💎', precious: 'Precious people deserve appreciation.', valuable: 'Your contribution is valuable.',
  deserving: 'Well deserved. 👏', inspiration: 'Keep inspiring. ✨', rolemodel: 'Lead by example.', mentor: 'Good mentors multiply growth.',
  genius: 'Genius moment. 🧠', talent: 'Talent + practice = power.', skillful: 'Skillful work. ⚡', awesome: 'Awesome! 🔥',
  wonderful: 'Wonderful! ✨', fantastic: 'Fantastic! 🚀', excellence: 'Excellence through consistency.', perfect: 'Clean work. ✅', blessed: 'Stay blessed. 🤲'
};
for (const [name, text] of Object.entries(respectCommands)) {
  registerSimple(name, 'respect', `Send a ${humanize(name)} response`, async (ctx) => ctx.reply(text));
}

// Useful reference-compatible commands.
registerSimple('rcolor', 'utility', 'Generate a random HEX/RGB color', async (ctx) => {
  const n = Math.floor(Math.random() * 0x1000000);
  const hex = `#${n.toString(16).padStart(6, '0').toUpperCase()}`;
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  await ctx.reply(`🎨 Random color\nHEX: ${hex}\nRGB: ${r}, ${g}, ${b}`);
});

registerSimple('readmore', 'utility', 'Create a WhatsApp read-more break', async (ctx) => {
  const parts = ctx.argText.split('|').map((v) => v.trim());
  if (parts.length < 2) return ctx.reply(`Usage: ${ctx.prefix}readmore visible text | hidden text`);
  await ctx.reply(`${parts[0]}${'\u200e'.repeat(1800)}\n${parts.slice(1).join('|')}`.slice(0, 3900));
});

registerSimple('url', 'utility', 'Inspect a URL without opening it', async (ctx) => {
  if (!ctx.argText) return ctx.reply(`Usage: ${ctx.prefix}url https://example.com/path`);
  try {
    const u = new URL(ctx.argText.trim());
    await ctx.reply(`Protocol: ${u.protocol}\nHost: ${u.host}\nPath: ${u.pathname || '/'}\nQuery params: ${[...u.searchParams.keys()].length}`);
  } catch { await ctx.reply('That is not a valid absolute URL.'); }
});

registerSimple('timenow', 'utility', 'Alias for current A-X-HK time', async (ctx) => {
  const now = new Intl.DateTimeFormat('en-GB', { dateStyle: 'full', timeStyle: 'long', timeZone: config.timezone }).format(new Date());
  await ctx.reply(`${config.timezone}\n${now}`);
});

registerSimple('cid', 'profile', 'Show current chat ID', async (ctx) => ctx.reply(ctx.chat));
registerCommand({
  name: 'bot', category: 'settings', description: 'Show bot status or switch public/private mode', usage: 'bot [public|private]', cooldown: 2,
  async run(ctx) {
    const requested = String(ctx.args[0] || '').toLowerCase();
    if (!requested) {
      return ctx.reply([
        ...vipBox('BOT STATUS', [
          `┃ 🤖 ${config.botName}`,
          `┃ 🏷️ V${config.version}`,
          `┃ ⚙️ Mode ${String(ctx.sessionSettings.mode || config.mode).toUpperCase()}`,
          `┃ ⚡ Prefix ${ctx.sessionSettings.prefix || config.prefix}`,
          `┃ 👑 ${ctx.prefix}bot public | ${ctx.prefix}bot private`
        ], '🤖'),
        '',
        ...vipFooter()
      ].join('\n'));
    }
    if (!['public', 'private'].includes(requested)) return ctx.reply([...vipBox('BOT MODE', [`┃ Usage: ${ctx.prefix}bot public|private`], '⚙️'), '', ...vipFooter()].join('\n'));
    if (!ctx.isOwner) return ctx.reply([...vipBox('OWNER ONLY', ['┃ 👑 Only owner can control mode'], '🔐'), '', ...vipFooter()].join('\n'));
    ctx.sessionSettings.mode = requested;
    await db.save();
    await ctx.reply([
      ...vipBox('MODE UPDATED', [
        `┃ 🤖 ${config.shortName}`,
        `┃ ⚙️ ${requested.toUpperCase()}`,
        requested === 'public' ? '┃ 🌍 Public commands enabled' : '┃ 🔐 Owner-only private mode'
      ], '✅'),
      '',
      ...vipFooter()
    ].join('\n'));
  }
});
registerSimple('info', 'system', 'Show bot information', async (ctx) => ctx.reply([
  ...vipBox('BOT INFO', [
    `┃ 🤖 ${config.botName}`,
    `┃ 👑 ${config.ownerName}`,
    `┃ 📞 +${config.ownerNumber}`,
    `┃ ⚡ ${config.tagline}`,
    `┃ 🏷️ V${config.version}`
  ], '💎'),
  '',
  ...vipFooter()
].join('\n')));
registerSimple('repo', 'system', 'Show configured repository link', async (ctx) => ctx.reply(config.githubUrl || 'GitHub repository URL is not configured yet.'));
registerSimple('prefix', 'settings', 'Show current command prefix', async (ctx) => ctx.reply([...vipBox('PREFIX', [`┃ ⚡ ${ctx.sessionSettings.prefix || config.prefix}`], '⚡'), '', ...vipFooter()].join('\n')));
registerSimple('botname', 'settings', 'Show current bot name', async (ctx) => ctx.reply([...vipBox('BOT NAME', [`┃ 🤖 ${config.botName}`], '🤖'), '', ...vipFooter()].join('\n')));
registerSimple('ownername', 'settings', 'Show configured owner name', async (ctx) => ctx.reply([...vipBox('OWNER NAME', [`┃ 👑 ${config.ownerName}`], '👑'), '', ...vipFooter()].join('\n')));
registerSimple('ownernumber', 'settings', 'Show configured owner number', async (ctx) => ctx.reply(`+${config.ownerNumber}`));
registerSimple('description', 'settings', 'Show A-X-HK description', async (ctx) => ctx.reply(`${config.botName}\n${config.tagline}\nSafe multi-device automation bot.`));
registerSimple('settings', 'settings', 'Show public bot settings', async (ctx) => ctx.reply(`Mode: ${ctx.sessionSettings.mode || config.mode}\nPrefix: ${ctx.sessionSettings.prefix || config.prefix}\nAuto-read: ${ctx.sessionSettings.autoRead ? 'ON' : 'OFF'}\nAuto-react: ${ctx.sessionSettings.autoReact ? 'ON' : 'OFF'}\nAuto-typing: ${ctx.sessionSettings.autoTyping ? 'ON' : 'OFF'}\nAuto-recording: ${ctx.sessionSettings.autoRecording ? 'ON' : 'OFF'}\nStatus seen: ${ctx.sessionSettings.statusSeen ? 'ON' : 'OFF'}\nTimezone: ${config.timezone}`));

registerSimple('botdp', 'profile', 'Send the bundled A-X-HK avatar', async (ctx) => {
  const image = await fs.readFile(config.avatarPath);
  await ctx.send({ image, caption: `${config.shortName} avatar` }, { quoted: ctx.msg });
});

registerSimple('getpp', 'profile', 'Get a user profile picture when available', async (ctx) => {
  const target = targetJidFromMessage(ctx.msg, ctx.args) || ctx.sender;
  try {
    const url = await ctx.sock.profilePictureUrl(target, 'image');
    await ctx.send({ image: { url }, caption: `Profile picture: @${target.split('@')[0]}`, mentions: [target] }, { quoted: ctx.msg });
  } catch { await ctx.reply('Profile picture is unavailable or private.'); }
});

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { 'user-agent': 'A-X-HK-WhatsApp-Bot/4.0' },
    signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) throw new Error(`Remote service returned ${response.status}`);
  return response.json();
}

registerSimple('weather', 'search', 'Current weather by city (wttr.in)', async (ctx) => {
  const city = safeText(ctx.argText, 100);
  if (!city) return ctx.reply(`Usage: ${ctx.prefix}weather Karachi`);
  try {
    const data = await fetchJson(`https://wttr.in/${encodeURIComponent(city)}?format=j1`);
    const c = data.current_condition?.[0];
    const area = data.nearest_area?.[0];
    if (!c) throw new Error('Weather data unavailable');
    const place = [area?.areaName?.[0]?.value, area?.country?.[0]?.value].filter(Boolean).join(', ') || city;
    await ctx.reply(`🌤️ ${place}\n${c.weatherDesc?.[0]?.value || 'Weather'}\nTemperature: ${c.temp_C}°C\nFeels like: ${c.FeelsLikeC}°C\nHumidity: ${c.humidity}%\nWind: ${c.windspeedKmph} km/h`);
  } catch (err) { await ctx.reply(`Weather lookup failed: ${err.message}`); }
});

registerSimple('github', 'search', 'Look up a public GitHub user', async (ctx) => {
  const username = String(ctx.args[0] || '').replace(/[^A-Za-z0-9-]/g, '').slice(0, 39);
  if (!username) return ctx.reply(`Usage: ${ctx.prefix}github username`);
  try {
    const u = await fetchJson(`https://api.github.com/users/${encodeURIComponent(username)}`);
    await ctx.reply(`💻 GitHub: ${u.login}\nName: ${u.name || '-'}\nPublic repos: ${u.public_repos}\nFollowers: ${u.followers}\nFollowing: ${u.following}\nProfile: ${u.html_url}`);
  } catch (err) { await ctx.reply(`GitHub lookup failed: ${err.message}`); }
});

registerSimple('npm', 'search', 'Look up an npm package', async (ctx) => {
  const pkg = safeText(ctx.args[0], 120);
  if (!pkg || !/^[@A-Za-z0-9._/-]+$/.test(pkg)) return ctx.reply(`Usage: ${ctx.prefix}npm express`);
  try {
    const data = await fetchJson(`https://registry.npmjs.org/${encodeURIComponent(pkg)}/latest`);
    await ctx.reply(`📦 ${data.name}@${data.version}\n${safeText(data.description || 'No description', 400)}\nLicense: ${data.license || '-'}\nHomepage: ${data.homepage || '-'}`);
  } catch (err) { await ctx.reply(`npm lookup failed: ${err.message}`); }
});

registerSimple('wiki', 'search', 'Search Wikipedia summaries', async (ctx) => {
  const q = safeText(ctx.argText, 160);
  if (!q) return ctx.reply(`Usage: ${ctx.prefix}wiki WhatsApp`);
  try {
    const result = await fetchJson(`https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(q)}&gsrlimit=1&prop=extracts|info&exintro=1&explaintext=1&inprop=url&format=json&origin=*`);
    const page = Object.values(result.query?.pages || {})[0];
    if (!page) return ctx.reply('No Wikipedia result found.');
    await ctx.reply(`📚 ${page.title}\n\n${safeText(page.extract || 'No summary available.', 2500)}\n\n${page.fullurl || ''}`);
  } catch (err) { await ctx.reply(`Wikipedia lookup failed: ${err.message}`); }
});

registerSimple('roast', 'fun', 'Get a mild, friendly roast', async (ctx) => {
  const lines = [
    'Your browser has fewer tabs than your unfinished ideas. 😄',
    'You said “five minutes” with the confidence of a full project manager. 😄',
    'Your to-do list has started asking for a status update. 😄',
    'Even your charger is tired of supporting you. 😄'
  ];
  await ctx.reply(pick(lines));
});

registerSimple('pickupline', 'fun', 'Get a harmless cheesy pickup line', async (ctx) => {
  await ctx.reply(pick([
    'Are you Wi-Fi? Because the connection feels strong. 😄',
    'Are you a clean commit? Because you just fixed my whole day. 😄',
    'You must be uptime, because I hope you never go down. 😄'
  ]));
});

registerSimple('character', 'fun', 'Get a random character archetype', async (ctx) => {
  await ctx.reply(`Your A-X-HK character: ${pick(['Calm Strategist', 'Chaos Engineer', 'Night Builder', 'Silent Leader', 'Creative Hacker (the legal kind)', 'Problem Solver'])}`);
});

registerSimple('propose', 'fun', 'Generate a light proposal-style line', async (ctx) => {
  const t = targetInfo(ctx);
  await ctx.reply(`💚 ${t.label}, A-X-HK proposal draft: “Coffee, good conversation, and zero unnecessary drama?” 😄`, t.mentions.length ? { mentions: t.mentions } : {});
});

registerSimple('marige', 'fun', 'Lighthearted marriage compatibility joke', async (ctx) => {
  const score = hashScore(targetSeed(ctx, 'marige'));
  await ctx.reply(`💍 Marriage-vibe score: ${score}%\nJust for fun — real decisions belong to real people.`);
});
registerSimple('husband', 'fun', 'Lighthearted husband-role prompt', async (ctx) => ctx.reply('Husband-mode checklist: respect, responsibility, communication, humor. ✅'));
registerSimple('wife', 'fun', 'Lighthearted wife-role prompt', async (ctx) => ctx.reply('Partner-mode checklist: respect, trust, communication, teamwork. ✅'));
registerSimple('bacha', 'fun', 'Playful child-mode message', async (ctx) => ctx.reply('👦 Bacha mode: snack + game + zero meetings. 😄'));
registerSimple('bachi', 'fun', 'Playful child-mode message', async (ctx) => ctx.reply('👧 Bachi mode: sparkle + confidence + zero boring meetings. ✨'));
registerSimple('breakup', 'fun', 'Lighthearted breakup advice', async (ctx) => ctx.reply('Breakup rule: keep dignity, respect boundaries, focus on recovery. 💙'));
registerSimple('emoji', 'fun', 'Get a random emoji combo', async (ctx) => ctx.reply(pick(['🔥⚡👑', '💚✨🤖', '😄🚀💎', '🌙⚡🖤', '🤝💚✅'])));

