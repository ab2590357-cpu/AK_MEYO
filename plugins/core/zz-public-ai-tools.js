import crypto from 'node:crypto';
import { registerCommand, getCommand } from '../../lib/core/registry.js';
import { askAI } from '../../lib/services/ai.js';
import { contextInfo, unwrapMessage } from '../../lib/utils/message.js';

const clean = (value = '', max = 3000) => String(value || '').replace(/\0/g, '').trim().slice(0, max);

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
    3000
  );
}

function inputText(ctx, max = 3000) {
  return clean(ctx.argText || quotedText(ctx), max);
}

function registerPublic(definition) {
  const name = String(definition?.name || '').toLowerCase();
  if (!name || getCommand(name)) return false;
  const aliases = (Array.isArray(definition.aliases) ? definition.aliases : [])
    .map((v) => String(v || '').toLowerCase())
    .filter((v) => v && v !== name && !getCommand(v));
  registerCommand({ ownerOnly: false, masterOnly: false, ...definition, name, aliases });
  return true;
}

async function aiText(ctx, instruction, maxChars = 1800) {
  const text = inputText(ctx);
  if (!text) return ctx.reply('Add text/topic after ' + ctx.prefix + ctx.command.name + ' or reply to a text message.');
  const out = await askAI(
    instruction + '\nMatch the user language where practical. Be concise and useful.\n\nInput:\n' + text,
    ctx.senderNumber,
    { maxChars }
  );
  await ctx.reply(out);
}

for (const row of [
  ['define', ['meaning'], 'Explain this word or term simply. Include a short definition and one easy example. If ambiguous, mention the most common meaning first.'],
  ['synonym', ['synonyms'], 'Give useful synonyms for this word or phrase. Group by meaning if needed.'],
  ['antonym', ['antonyms'], 'Give useful antonyms or opposites for this word or phrase.'],
  ['grammar', ['grammarfix'], 'Fix grammar and punctuation. Return the corrected version first, then one very short note only if a meaningful correction was needed.'],
  ['spellcheck', ['spelling'], 'Correct spelling mistakes while preserving the original meaning and tone. Return the corrected text.'],
  ['eli5', ['simpleexplain'], 'Explain this like the reader is a beginner. Avoid jargon or explain it in plain words.'],
  ['proscons', ['advantages'], 'Give a balanced short pros-and-cons list for this topic. Do not make the decision for the user.'],
  ['brainstorm', ['ideas'], 'Brainstorm 8 practical and varied ideas for this topic.'],
  ['story', ['shortstory'], 'Write a short original story based on this topic. Keep it suitable for a general audience.'],
  ['poem', ['shortpoem'], 'Write a short original poem based on this topic.'],
  ['excuse', ['funexcuse'], 'Write one light, harmless excuse for this situation. Avoid excuses for illegal, dangerous, fraudulent, or seriously deceptive conduct.'],
  ['codeexplain', ['explaincode'], 'Explain what this code does in plain language. Point out important behavior and obvious risks, but do not invent missing context.'],
  ['codefix', ['fixcode'], 'Review this code for likely bugs. Suggest a safe corrected version or precise fixes. Do not fabricate dependencies or APIs.'],
  ['linuxcmd', ['linuxhelp'], 'Explain what this Linux command means and what its common flags do. Explain only; do not encourage destructive, evasive, or unauthorized activity.'],
  ['gitcmd', ['githelp'], 'Explain what this Git command does, common safe usage, and any risk of losing work.']
]) {
  const [name, aliases, instruction] = row;
  registerPublic({
    name,
    aliases,
    category: name.includes('code') || name.includes('linux') || name.includes('git') ? 'tools' : 'ai',
    description: instruction.split('.')[0],
    usage: name + ' <text/topic>',
    cooldown: 6,
    async run(ctx) { await aiText(ctx, instruction); }
  });
}

registerPublic({
  name: 'passwordstrength',
  aliases: ['passstrength'],
  category: 'utility',
  description: 'Estimate password-pattern strength locally',
  usage: 'passwordstrength <sample-password>',
  async run(ctx) {
    const value = clean(ctx.argText, 128);
    if (!value) return ctx.reply('Use a SAMPLE/test password only - do not send a real password.\nUsage: ' + ctx.prefix + 'passwordstrength <sample>');
    let score = 0;
    if (value.length >= 12) score += 2; else if (value.length >= 8) score += 1;
    if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score += 1;
    if (/\d/.test(value)) score += 1;
    if (/[^a-z0-9]/i.test(value)) score += 1;
    if (/(.)\1{2,}/.test(value) || /1234|qwerty|password|admin|letmein/i.test(value)) score -= 2;
    const label = score >= 5 ? 'Strong pattern' : score >= 3 ? 'Medium pattern' : 'Weak pattern';
    await ctx.reply('Password strength: ' + label + '\nScore: ' + Math.max(0, score) + '/5\n\nUse unique passwords and a password manager. Do not send real passwords to chats.');
  }
});

registerPublic({
  name: 'jsonvalidate',
  aliases: ['checkjson'],
  category: 'tools',
  description: 'Check whether supplied JSON parses correctly',
  usage: 'jsonvalidate {"a":1}',
  async run(ctx) {
    const value = inputText(ctx, 5000);
    if (!value) return ctx.reply('Usage: ' + ctx.prefix + 'jsonvalidate <json>');
    try {
      const parsed = JSON.parse(value);
      const type = Array.isArray(parsed) ? 'array' : parsed === null ? 'null' : typeof parsed;
      await ctx.reply('Valid JSON\nTop-level type: ' + type);
    } catch (err) {
      await ctx.reply('Invalid JSON\n' + clean(err.message, 240));
    }
  }
});

registerPublic({
  name: 'regexcheck',
  aliases: ['regexmatch'],
  category: 'tools',
  description: 'Test a short regular expression against text',
  usage: 'regexcheck pattern | text',
  async run(ctx) {
    const parts = clean(ctx.argText, 700).split('|');
    if (parts.length < 2) return ctx.reply('Usage: ' + ctx.prefix + 'regexcheck pattern | text');
    const pattern = parts.shift().trim();
    const text = parts.join('|').trim();
    if (!pattern || pattern.length > 80 || text.length > 500) return ctx.reply('Pattern/text is too long.');
    if (/\([^)]*[+*][^)]*\)[+*{]/.test(pattern) || /(\.\*){2,}|(\.\+){2,}/.test(pattern)) {
      return ctx.reply('That pattern is blocked because it may be computationally expensive.');
    }
    try {
      const re = new RegExp(pattern, 'i');
      const match = text.match(re);
      await ctx.reply(match ? 'MATCH\n' + clean(match[0], 300) : 'NO MATCH');
    } catch (err) {
      await ctx.reply('Invalid regex\n' + clean(err.message, 220));
    }
  }
});

registerPublic({
  name: 'colorpalette',
  aliases: ['palette'],
  category: 'utility',
  description: 'Generate a random 5-color HEX palette',
  async run(ctx) {
    const rows = Array.from({ length: 5 }, () => '#' + crypto.randomBytes(3).toString('hex').toUpperCase());
    await ctx.reply('COLOR PALETTE\n\n' + rows.join('\n'));
  }
});

registerPublic({
  name: 'gradientgen',
  aliases: ['cssgradient'],
  category: 'utility',
  description: 'Generate a random CSS gradient',
  async run(ctx) {
    const a = '#' + crypto.randomBytes(3).toString('hex').toUpperCase();
    const b = '#' + crypto.randomBytes(3).toString('hex').toUpperCase();
    const angle = Math.floor(Math.random() * 360);
    await ctx.reply('CSS GRADIENT\n\nlinear-gradient(' + angle + 'deg, ' + a + ', ' + b + ');');
  }
});

registerPublic({
  name: 'ascii',
  aliases: ['textbanner'],
  category: 'text',
  description: 'Create a simple text banner',
  usage: 'ascii hello',
  async run(ctx) {
    const value = clean(ctx.argText, 40);
    if (!value) return ctx.reply('Usage: ' + ctx.prefix + 'ascii <text>');
    const line = '='.repeat(Math.min(44, Math.max(12, value.length + 6)));
    await ctx.reply('+' + line + '+\n   ' + value.toUpperCase() + '\n+' + line + '+');
  }
});

const circled = {
  A:'Ⓐ',B:'Ⓑ',C:'Ⓒ',D:'Ⓓ',E:'Ⓔ',F:'Ⓕ',G:'Ⓖ',H:'Ⓗ',I:'Ⓘ',J:'Ⓙ',K:'Ⓚ',L:'Ⓛ',M:'Ⓜ',
  N:'Ⓝ',O:'Ⓞ',P:'Ⓟ',Q:'Ⓠ',R:'Ⓡ',S:'Ⓢ',T:'Ⓣ',U:'Ⓤ',V:'Ⓥ',W:'Ⓦ',X:'Ⓧ',Y:'Ⓨ',Z:'Ⓩ'
};
const boldUpper = [...'𝐀𝐁𝐂𝐃𝐄𝐅𝐆𝐇𝐈𝐉𝐊𝐋𝐌𝐍𝐎𝐏𝐐𝐑𝐒𝐓𝐔𝐕𝐖𝐗𝐘𝐙'];
const normalUpper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const boldLower = [...'𝐚𝐛𝐜𝐝𝐞𝐟𝐠𝐡𝐢𝐣𝐤𝐥𝐦𝐧𝐨𝐩𝐪𝐫𝐬𝐭𝐮𝐯𝐰𝐱𝐲𝐳'];
const normalLower = 'abcdefghijklmnopqrstuvwxyz';

registerPublic({
  name: 'bubbletext',
  aliases: ['circletext'],
  category: 'text',
  description: 'Convert Latin letters to circled Unicode text',
  usage: 'bubbletext hello',
  async run(ctx) {
    const value = clean(ctx.argText, 250);
    if (!value) return ctx.reply('Usage: ' + ctx.prefix + 'bubbletext <text>');
    await ctx.reply([...value].map((ch) => circled[ch.toUpperCase()] || ch).join(''));
  }
});

registerPublic({
  name: 'boldtext',
  aliases: ['fancybold'],
  category: 'text',
  description: 'Convert Latin letters to bold Unicode text',
  usage: 'boldtext hello',
  async run(ctx) {
    const value = clean(ctx.argText, 250);
    if (!value) return ctx.reply('Usage: ' + ctx.prefix + 'boldtext <text>');
    const out = [...value].map((ch) => {
      let i = normalUpper.indexOf(ch);
      if (i >= 0) return boldUpper[i];
      i = normalLower.indexOf(ch);
      if (i >= 0) return boldLower[i];
      return ch;
    }).join('');
    await ctx.reply(out);
  }
});

registerPublic({
  name: 'randomcolor',
  aliases: ['randcolor'],
  category: 'utility',
  description: 'Generate a random HEX color',
  async run(ctx) {
    await ctx.reply('Random color: #' + crypto.randomBytes(3).toString('hex').toUpperCase());
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
    const value = Math.round(n);
    const filled = Math.round(value / 10);
    await ctx.reply('[' + '#'.repeat(filled) + '-'.repeat(10 - filled) + '] ' + value + '%');
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

registerPublic({
  name: 'reversewords',
  aliases: ['revwords'],
  category: 'text',
  description: 'Reverse word order',
  usage: 'reversewords one two three',
  async run(ctx) {
    const words = clean(ctx.argText, 1500).split(/\s+/).filter(Boolean);
    if (!words.length) return ctx.reply('Usage: ' + ctx.prefix + 'reversewords <text>');
    await ctx.reply(words.reverse().join(' '));
  }
});

registerPublic({
  name: 'piglatin',
  category: 'text',
  description: 'Convert simple English text to Pig Latin',
  usage: 'piglatin hello world',
  async run(ctx) {
    const value = clean(ctx.argText, 1000);
    if (!value) return ctx.reply('Usage: ' + ctx.prefix + 'piglatin <English text>');
    const out = value.split(/\s+/).map((word) => {
      const m = word.match(/^([^a-z]*)([a-z]+)([^a-z]*)$/i);
      if (!m) return word;
      const core = m[2];
      if (/^[aeiou]/i.test(core)) return m[1] + core + 'way' + m[3];
      const c = core.match(/^[^aeiou]+/i)?.[0] || core[0];
      return m[1] + core.slice(c.length) + c + 'ay' + m[3];
    }).join(' ');
    await ctx.reply(out);
  }
});

const fileTypes = {
  jpg:'JPEG image',jpeg:'JPEG image',png:'PNG image',webp:'WebP image',gif:'GIF image or animation',
  pdf:'Portable Document Format',csv:'Comma-separated values data',json:'JavaScript Object Notation data',
  xml:'Extensible Markup Language data',zip:'ZIP compressed archive',rar:'RAR compressed archive',
  apk:'Android application package',exe:'Windows executable program',dmg:'macOS disk image',
  psd:'Adobe Photoshop document',svg:'Scalable Vector Graphics image',mp3:'MP3 audio',mp4:'MPEG-4 video',
  mov:'QuickTime movie',js:'JavaScript source file',py:'Python source file',html:'HTML webpage file',css:'CSS stylesheet'
};

registerPublic({
  name:'filetype',
  aliases:['extinfo2'],
  category:'utility',
  description:'Explain a common file extension',
  usage:'filetype apk',
  async run(ctx){
    const ext=clean(ctx.argText,20).toLowerCase().replace(/^\./,'');
    if(!ext) return ctx.reply('Usage: '+ctx.prefix+'filetype apk');
    await ctx.reply(fileTypes[ext] ? '.'+ext+' - '+fileTypes[ext] : 'I do not have a built-in description for .'+ext+'. Try '+ctx.prefix+'ai what is a .'+ext+' file?');
  }
});

const httpCodes = {
  200:'OK - request succeeded',201:'Created - resource was created',204:'No Content - succeeded with no response body',
  301:'Moved Permanently - permanent redirect',302:'Found - temporary redirect',304:'Not Modified - cached version can be used',
  400:'Bad Request - request was invalid',401:'Unauthorized - authentication is required',403:'Forbidden - server refuses access',
  404:'Not Found - resource was not found',408:'Request Timeout',409:'Conflict - request conflicts with current state',
  429:'Too Many Requests - rate limited',500:'Internal Server Error',502:'Bad Gateway',503:'Service Unavailable',504:'Gateway Timeout'
};

registerPublic({
  name:'httpcode',
  aliases:['statuscode'],
  category:'tools',
  description:'Explain a common HTTP status code',
  usage:'httpcode 404',
  async run(ctx){
    const code=Number(ctx.args[0]);
    await ctx.reply(httpCodes[code] ? 'HTTP '+code+'\n'+httpCodes[code] : 'Unknown or unlisted code. Try '+ctx.prefix+'ai explain HTTP status '+(ctx.args[0]||'code'));
  }
});

const ports = {
  20:'FTP data, legacy',21:'FTP control, legacy',22:'SSH secure remote shell',25:'SMTP mail transfer',
  53:'DNS',67:'DHCP server',68:'DHCP client',80:'HTTP web traffic',110:'POP3 email retrieval',
  123:'NTP time synchronization',143:'IMAP email retrieval',443:'HTTPS secure web traffic',
  465:'SMTPS commonly used for secure SMTP',587:'SMTP message submission',993:'IMAPS secure IMAP',
  995:'POP3S secure POP3',3306:'MySQL default port',5432:'PostgreSQL default port',6379:'Redis default port'
};

registerPublic({
  name:'portinfo',
  aliases:['porthelp'],
  category:'tools',
  description:'Explain a common network port',
  usage:'portinfo 443',
  async run(ctx){
    const p=Number(ctx.args[0]);
    await ctx.reply(ports[p] ? 'PORT '+p+'\n'+ports[p]+'\n\nEducational reference only.' : 'Port not in the built-in common-port list.');
  }
});

registerPublic({
  name:'safepassword',
  aliases:['passtips'],
  category:'utility',
  description:'Generate a safe password-pattern example and tips',
  async run(ctx){
    const words=['River','Pixel','Orbit','Cedar','Mango','Quartz','Nova','Tiger','Cloud','Maple'];
    const example=words[crypto.randomInt(words.length)]+'-'+words[crypto.randomInt(words.length)]+'-'+crypto.randomInt(100,999)+'-'+['!','@','#','$','%'][crypto.randomInt(5)];
    await ctx.reply('PASSWORD IDEA\n\nExample pattern: '+example+'\n\nUse a password manager and a unique password for every important account. For real accounts, generate and store the final password inside your password manager rather than sending it in chat.');
  }
});

registerPublic({
  name:'sqlformat',
  aliases:['formatsql'],
  category:'tools',
  description:'Basic local formatting for a SQL query',
  usage:'sqlformat select * from users where id=1',
  async run(ctx){
    let sql=inputText(ctx,5000);
    if(!sql) return ctx.reply('Usage: '+ctx.prefix+'sqlformat <query>');
    const kws=['SELECT','FROM','WHERE','GROUP BY','ORDER BY','HAVING','LIMIT','JOIN','LEFT JOIN','RIGHT JOIN','INNER JOIN','OUTER JOIN','VALUES','SET'];
    for(const kw of kws){
      const re=new RegExp('\\s+'+kw.replace(' ','\\s+')+'\\s+','ig');
      sql=sql.replace(re,'\n'+kw+' ');
    }
    sql=sql.replace(/\s*,\s*/g,', ').replace(/[ \t]+/g,' ').trim();
    await ctx.reply('SQL\n\n'+sql.slice(0,5000));
  }
});
