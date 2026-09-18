import os from 'node:os';
import fs from 'node:fs/promises';
import { registerCommand, allCommands, commandsByCategory, getCommand } from '../../lib/core/registry.js';
import { menuCategoryRows } from '../../lib/core/menu-categories.js';
import { config } from '../../lib/config.js';
import { db } from '../../lib/core/database.js';
import { formatUptime, sleep } from '../../lib/utils/text.js';
import { serifBold, premiumLabel, premiumTitle } from '../../lib/utils/brand-style.js';
import { readMenuCard } from '../../lib/services/menu-card.js';
import { waManager } from '../../lib/services/whatsapp.js';

const categoryIcons = {
  system: '🤖', tools: '🧰', utility: '🛠️', text: '✍️', productivity: '📋', games: '🎮', fun: '🎉',
  funtext: '💬', actions: '✨', romantic: '❤️', funny: '😂', action: '👊', emotion: '😊', reaction: '🤷',
  entertainment: '💃', cute: '🐱', mood: '😴', respect: '🤝', search: '🔎', ai: '🧠', group: '👥', owner: '👑',
  media: '🎨', document: '📄', security: '🛡️', download: '⬇️', profile: '🪪', settings: '⚙️', premium: '💎'
};

const CATEGORY_ALIASES = {
  downloads: 'download', downloader: 'download', dl: 'download',
  tool: 'tools', utilities: 'utility', util: 'utility',
  sticker: 'media', stickers: 'media', gif: 'media', image: 'media', images: 'media',
  game: 'games', groups: 'group', admin: 'group', admins: 'group',
  owners: 'owner', settings: 'settings', setting: 'settings',
  system: 'system', premium: 'premium', profile: 'profile', security: 'security',
  text: 'text', productivity: 'productivity', document: 'document', docs: 'document'
};

function resolveCategoryName(value, grouped = commandsByCategory()) {
  const raw = String(value || '').toLowerCase().replace(/[^a-z0-9_-]/g, '');
  if (!raw) return '';
  if (grouped[raw]) return raw;
  const mapped = CATEGORY_ALIASES[raw];
  return mapped && grouped[mapped] ? mapped : '';
}

function menuRows() {
  return menuCategoryRows(commandsByCategory());
}

function menuOpenExamples(prefix) {
  return [
    `Type *${prefix}fun* / *${prefix}ai* / *${prefix}download*`,
    `Type *${prefix}search* / *${prefix}tools* / *${prefix}media*`,
    `Type *${prefix}menu all* for full catalog`
  ];
}

function quickStartRows(prefix) {
  return [
    `┃ 🚀 *${prefix}menu*`,
    `┃ 📚 *${prefix}menu all*`,
    `┃ 🎭 *${prefix}reactionmenu*`,
    `┃ 🎧 *${prefix}play <song>*`,
    `┃ 🎬 *${prefix}video <song>*`,
    `┃ 🟢 *${prefix}alive*`,
    `┃ ⚡ *${prefix}ping*`,
    `┃ 👑 *${prefix}owner*`
  ];
}

function premiumFooterBlock() {
  return [
    `╭━━━〔 👑 ${serifBold('POWERED BY')} 👑 〕━━━╮`,
    `┃ ${serifBold('ABDULLAH-X-HACKER')}`,
    `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯`
  ];
}

function rowBox(title, rows, icon = '✨') {
  return [
    `╭━━━〔 ${icon} ${serifBold(title)} ${icon} 〕━━━╮`,
    ...rows,
    `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯`
  ];
}

const DEFAULT_PUBLIC_BASE_URL = 'https://zesty-solace-production-29fe.up.railway.app';
const DEFAULT_CREATOR_STUDIO_URL = 'https://abdullah-x-hk-studio.vercel.app/';

function publicBaseUrl() {
  return String(config.publicUrl || DEFAULT_PUBLIC_BASE_URL).replace(/\/+$/, '');
}

function userLinkPortalUrl() {
  return `${publicBaseUrl()}/link`;
}

function formatDirectPairCode(value = '') {
  const code = String(value || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
  return code.match(/.{1,4}/g)?.join('-') || code;
}

function existingLinkedSessionId(phone = '') {
  const digits = String(phone || '').replace(/\D/g, '');
  const hit = Object.entries(db.data.linkedSessions || {}).find(([, meta]) => {
    if (meta?.enabled === false) return false;
    return [meta?.phone, meta?.linkedNumber].some((value) => String(value || '').replace(/\D/g, '') === digits);
  });
  return hit?.[0] || '';
}

function creatorStudioUrl() {
  return String(config.creatorStudioUrl || DEFAULT_CREATOR_STUDIO_URL).trim() || DEFAULT_CREATOR_STUDIO_URL;
}

function creatorStudioBlock() {
  return rowBox('A-X-HK CREATOR STUDIO', [
    `┃ 🎨 *PREMIUM CREATOR TOOLS*`,
    `┃ 🚀 *LOGO • BOT • BRANDING*`,
    `┃ 🔗 ${creatorStudioUrl()}`
  ], '💎');
}

function premiumAutoFeatureBlock(prefix) {
  return rowBox('PREMIUM AUTO FEATURES', [
    `┃ 📲 *${prefix}statuslist*  •  *${prefix}statussave 1*`,
    `┃ ❤️ *${prefix}statusreact on*  •  *${prefix}statusreply on*`,
    `┃ 👥 *${prefix}adminevents on*`,
    `┃ 📞 *${prefix}anticall on*  •  *${prefix}callguard*`,
    `┃ 🛡️ *${prefix}automationstudio*  •  *${prefix}gcstatus*`,
    `┃ 🧯 *${prefix}safetycenter*  •  *${prefix}banprotect on*`,
    `┃ 🔐 *${prefix}cmdperm*  •  *${prefix}commandlogs*`,
    `┃ 🔗 *${prefix}linkaction warn*  •  *${prefix}badword list*`,
    `┃ 💾 *${prefix}backupnow*  •  *${prefix}dlcheck*`,
    `┃ 🧪 *${prefix}selftest*  •  *${prefix}groupstats*`,
    `┃ ⏰ *${prefix}schedule*  •  *${prefix}schedulestatus*`,
    `┃ 📝 *${prefix}gnote*  •  *${prefix}riskmeter*`,
    `┃ 💎 *${prefix}premiumfeatures*`
  ], '🛡️');
}

function themeTokens(theme = 'royal') {
  const key = ['royal', 'neon', 'minimal'].includes(String(theme).toLowerCase()) ? String(theme).toLowerCase() : 'royal';
  if (key === 'neon') return { key, crown: '⚡', sparkle: '🟢', top: '╔════════', bottom: '╚════════', bullet: '▸', divider: '━━━━━━━━' };
  if (key === 'minimal') return { key, crown: '◆', sparkle: '•', top: '┌────────', bottom: '└────────', bullet: '•', divider: '────────' };
  return { key, crown: '👑', sparkle: '✨', top: '╭━━━━━━━━', bottom: '╰━━━━━━━━', bullet: '◆', divider: '━━━━━━━━' };
}

function categoryMenu(prefix, requested, mode = config.mode, theme = 'royal', menuSettings = {}) {
  const grouped = commandsByCategory();
  const menuTitle = String(menuSettings.menuTitle || 'A-X-HK VIP MENU').trim().slice(0, 42);
  const menuSubtitle = String(menuSettings.menuSubtitle || 'FAST • SECURE • MULTI').trim().slice(0, 54);
  const key = resolveCategoryName(requested, grouped);
  if (String(requested || '').trim() && !key) return null;

  if (key) {
    const commands = grouped[key] || [];
    const label = String(requested || key).toUpperCase();
    const icon = categoryIcons[key] || '◆';
    const rows = commands.map((cmd) => `┃ 🔹 *${prefix}${cmd.name}*`);
    return [
      ...rowBox(`${label} COMMANDS`, [
        `┃ ${icon} ${commands.length} tools available`,
        `┃ ℹ️ *${prefix}commandinfo <cmd>* for details`
      ], icon),
      '',
      ...rows,
      '',
      `╭━━━〔 🧭 ${serifBold('NAVIGATION')} 🧭 〕━━━╮`,
      `┃ 🔙 *${prefix}menu*`,
      `┃ 📚 *${prefix}menu all*`,
      `┃ 🔎 *${prefix}searchcmd <word>*`,
      `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯`,
      '',
      ...premiumFooterBlock()
    ].join('\n');
  }

  const lines = [
    ...rowBox(menuTitle, [
      `┃ 🤖 *${config.shortName}*`,
      `┃ 🟢 STATUS  ONLINE`,
      `┃ 🏷️ VERSION  V${config.version}`,
      `┃ ⚡ PREFIX   ${prefix}`,
      `┃ 💎 ${menuSubtitle}`
    ], '✨'),
    '',
    ...rowBox('CATEGORIES', menuRows().map((row) => `┃ ${row}`), '📂'),
    '',
    ...rowBox('QUICK START', quickStartRows(prefix), '🚀'),
    '',
    ...rowBox('OPEN CATEGORY', [
      `┃ Type *${prefix}fun*   Type *${prefix}ai*`,
      `┃ Type *${prefix}download*  Type *${prefix}search*`,
      `┃ Type *${prefix}tools*  Type *${prefix}media*`,
      `┃ Type *${prefix}menu all* for full catalog`
    ], '🧭'),
    '',
    ...premiumAutoFeatureBlock(prefix),
    '',
    ...creatorStudioBlock(),
    '',
    ...premiumFooterBlock()
  ];
  return lines.join('\n');
}

async function sendMenuCard(ctx, caption) {
  try {
    const { buffer: image } = await readMenuCard();
    return await ctx.send({ image, caption }, { quoted: ctx.msg });
  } catch {
    return ctx.reply(caption);
  }
}

async function sendBrandCard(ctx, caption) {
  try {
    const image = await fs.readFile(config.brandCardPath);
    return await ctx.send({ image, caption }, { quoted: ctx.msg });
  } catch {
    return ctx.reply(caption);
  }
}

const FULL_MENU_ORDER = [
  'ai', 'download', 'fun', 'search', 'tools', 'media', 'group', 'owner', 'utility', 'text',
  'productivity', 'games', 'profile', 'settings', 'security', 'document', 'premium', 'system'
];

function niceCategoryLabel(category = '') {
  return String(category || 'general').replace(/[-_]+/g, ' ').trim().toUpperCase();
}

function orderedCategoryEntries() {
  const grouped = commandsByCategory();
  const orderIndex = new Map(FULL_MENU_ORDER.map((name, i) => [name, i]));
  return Object.entries(grouped)
    .map(([category, commands]) => [category, [...commands].sort((a, b) => a.name.localeCompare(b.name))])
    .sort(([a], [b]) => {
      const ai = orderIndex.has(a) ? orderIndex.get(a) : 999;
      const bi = orderIndex.has(b) ? orderIndex.get(b) : 999;
      return ai === bi ? a.localeCompare(b) : ai - bi;
    });
}

function splitFullMenuBodies(prefix, maxLen = 3300) {
  const bodies = [];
  let current = '';
  const pushCurrent = () => {
    if (current.trim()) bodies.push(current.trim());
    current = '';
  };
  for (const [category, commands] of orderedCategoryEntries()) {
    const icon = categoryIcons[category] || '◆';
    const blockLines = [
      `╭━━〔 ${icon} ${serifBold(niceCategoryLabel(category))} 〕━━╮`,
      `┃ 🧩 ${commands.length} COMMANDS`,
      ...commands.map((cmd) => `┃ ➤ *${prefix}${cmd.name}*`),
      `╰━━━━━━━━━━━━━━━━━━━━╯`,
      ''
    ];
    for (const line of blockLines) {
      const next = current ? `${current}\n${line}` : line;
      if (current && next.length > maxLen) pushCurrent();
      current = current ? `${current}\n${line}` : line;
    }
  }
  pushCurrent();
  return bodies;
}

function fullMenuMessages(prefix, maxLen = 3800) {
  const bodyLimit = Math.max(2200, maxLen - 520);
  const bodies = splitFullMenuBodies(prefix, bodyLimit);
  const total = allCommands().length;
  const pages = bodies.length || 1;
  return bodies.map((body, i) => [
    `╭━━━〔 📚 ${serifBold('A-X-HK FULL MENU')} ${i + 1}/${pages} 📚 〕━━━╮`,
    `┃ 🤖 ${serifBold(config.shortName)}    🏷️ V${config.version}`,
    `┃ 🧩 TOTAL COMMANDS: ${total}`,
    `┃ ⚡ PREFIX: ${prefix}`,
    `┃ 🔎 DETAILS: *${prefix}commandinfo <cmd>*`,
    `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯`,
    '',
    body,
    '',
    i + 1 === pages ? premiumFooterBlock().join('\n') : `╭━━〔 ⏭️ NEXT 〕━━╮\n┃ Sending page ${i + 2}/${pages}\n╰━━━━━━━━━━━━╯`
  ].join('\n'));
}

async function sendFullMenuChat(ctx) {
  const chunks = fullMenuMessages(ctx.prefix);
  for (let i = 0; i < chunks.length; i += 1) {
    if (i === 0) await ctx.reply(chunks[i]);
    else await ctx.send({ text: chunks[i] });
    if (i + 1 < chunks.length) await sleep(450);
  }
}

registerCommand({
  name: 'menu', aliases: ['help', 'commands'], category: 'system', description: 'Show premium command menu or one category', usage: 'menu [category|all]', cooldown: 3,
  async run(ctx) {
    const requested = String(ctx.args[0] || '').toLowerCase();
    if (requested === 'all') return sendFullMenuChat(ctx);
    const text = categoryMenu(ctx.prefix, requested, ctx.sessionSettings.mode || config.mode, ctx.sessionSettings.menuTheme || 'royal', ctx.sessionSettings);
    if (!text) return;
    // Main menu and category menus are always delivered as one WhatsApp media message.
    await sendMenuCard(ctx, text);
  }
});

registerCommand({
  name: 'fullmenu', aliases: ['menu2', 'allmenu'], category: 'system', description: 'Send the full command catalog in premium chat messages', cooldown: 5,
  async run(ctx) { await sendFullMenuChat(ctx); }
});

registerCommand({
  name: 'categories', category: 'system', description: 'List command categories',
  async run(ctx) {
    await sendMenuCard(ctx, [
      ...rowBox('CATEGORIES', menuRows().map((row) => `┃ ${row}`), '📂'),
      '',
      ...rowBox('OPEN CATEGORY', menuOpenExamples(ctx.prefix).map((row) => `┃ ${row}`), '🧭'),
      '',
      ...premiumFooterBlock()
    ].join('\n'));
  }
});

registerCommand({
  name: 'searchcmd', aliases: ['findcmd'], category: 'system', description: 'Search the command catalog', usage: 'searchcmd text',
  async run(ctx) {
    const q = ctx.argText.trim().toLowerCase();
    if (!q) throw new Error('Provide a search word.');
    const found = allCommands().filter((c) => [c.name, c.category, c.description, ...(c.aliases || [])].join(' ').toLowerCase().includes(q)).slice(0, 30);
    await ctx.reply(found.length ? [`╭━━〔 🔎 SEARCH RESULTS 〕━━╮`,`Query: ${q}`,'',...found.map((c) => `◆ ${ctx.prefix}${c.name} • ${c.category}\n  ↳ ${c.description}`),'',config.footerMessage].join('\n') : `No matching commands for “${q}”. Try ${ctx.prefix}menu.`);
  }
});

function statusClock() {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: config.timezone,
      year: 'numeric', month: 'short', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: true
    }).format(new Date());
  } catch {
    return new Date().toISOString();
  }
}

async function sendAliveCard(ctx, caption) {
  try {
    const { buffer: image } = await readMenuCard();
    return await ctx.send({ image, caption }, { quoted: ctx.msg });
  } catch {
    return ctx.reply(caption);
  }
}

registerCommand({
  name: 'alive', aliases: ['status', 'botstatus', 'botinfo', 'online'], category: 'system', description: 'Show the live bot status card with the current menu image',
  cooldown: 2,
  async run(ctx) {
    const mode = ctx.sessionSettings.mode || config.mode;
    const mem = process.memoryUsage();
    const aiState = config.ai.enabled && config.ai.apiKey ? 'READY' : config.ai.enabled ? 'KEY MISSING' : 'OFF';
    const connected = ctx.sock?.user?.id ? 'CONNECTED' : 'ONLINE';
    const sessionLabel = ctx.sessionId && ctx.sessionId !== 'main' ? ctx.sessionId : 'MAIN';
    const caption = [
      `╭━━━━〔 🔥 ${serifBold(config.shortName)} 🔥 〕━━━━╮`,
      `│`,
      `│ ✅ *Status*   : ${connected}`,
      `│ 🤖 *Bot*      : ${config.shortName}`,
      `│ 👑 *Owner*    : ${config.ownerName}`,
      `│ 📦 *Prefix*   : ${ctx.prefix}`,
      `│ ⚙️ *Mode*     : ${String(mode).toUpperCase()}`,
      `│ 🏷️ *Version*  : V${config.version}`,
      `│ 🧩 *Commands* : ${allCommands().length}`,
      `│ ⏱️ *Uptime*   : ${formatUptime(process.uptime())}`,
      `│ 🧠 *AI*       : ${aiState}`,
      `│ 💾 *RAM*      : ${(mem.rss / 1024 / 1024).toFixed(1)} MB`,
      `│ 🔗 *Session*  : ${sessionLabel}`,
      `│ 🕒 *Time*     : ${statusClock()} (${config.timezone})`,
      `│`,
      `│ 🧭 *Menu*     : ${ctx.prefix}menu`,
      `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯`,
      ``,
      config.footerMessage
    ].join('\n');
    await sendAliveCard(ctx, caption);
  }
});

registerCommand({
  name: 'ping', aliases: ['ping2'], category: 'system', description: 'Measure live WhatsApp send latency and runtime', cooldown: 1,
  async run(ctx) {
    const start = performance.now();
    try { await ctx.send({ react: { text: '⚡', key: ctx.msg.key } }); } catch {}
    const ms = Math.max(1, Math.round(performance.now() - start));
    const mem = process.memoryUsage();
    await ctx.reply([
      premiumTitle(`${config.shortName} PONG`, '⚡', '✨'), '',
      premiumLabel('SEND LATENCY', `${ms} ms`, '🚀'), '',
      premiumLabel('UPTIME', formatUptime(process.uptime()), '⏱️'), '',
      premiumLabel('RAM', `${(mem.rss / 1024 / 1024).toFixed(1)} MB`, '🧠'), '',
      premiumLabel('STATUS', `ONLINE • V${config.version}`, '🟢'), '',
      config.footerMessage
    ].join('\n'));
  }
});

registerCommand({ name: 'runtime', aliases: ['uptime'], category: 'system', description: 'Show bot uptime', async run(ctx) { await ctx.reply([...rowBox('UPTIME', [`┃ ⏱️ ${formatUptime(process.uptime())}`, `┃ 🤖 ${config.shortName}`], '⚡'), '', ...premiumFooterBlock()].join('\n')); } });
registerCommand({ name: 'version', category: 'system', description: 'Show A-X-HK version', async run(ctx) { await ctx.reply([...rowBox('VERSION', [`┃ 🤖 ${config.botName}`, `┃ 🏷️ V${config.version}`, `┃ ⚙️ BAILEYS 7.X`, `┃ 🛡️ PREMIUM MULTI`], '💎'), '', ...premiumFooterBlock()].join('\n')); } });
registerCommand({ name: 'platform', category: 'system', description: 'Show runtime platform', async run(ctx) { await ctx.reply([...rowBox('PLATFORM', [`┃ 💻 ${os.platform()} ${os.arch()}`, `┃ 🟢 Node ${process.version}`], '🖥️'), '', ...premiumFooterBlock()].join('\n')); } });

registerCommand({
  name: 'stats', category: 'system', description: 'Show process and bot stats', cooldown: 3,
  async run(ctx) {
    const mem = process.memoryUsage();
    await ctx.reply([
      `╭━━〔 📊 ${config.shortName} SYSTEM STATS 〕━━╮`,
      `│ ⏱ Uptime    : ${formatUptime(process.uptime())}`,
      `│ 🧠 RAM       : ${(mem.rss / 1024 / 1024).toFixed(1)} MB`,
      `│ ⚙️ Heap      : ${(mem.heapUsed / 1024 / 1024).toFixed(1)} MB`,
      `│ 🖥 CPU cores : ${os.cpus().length}`,
      `│ 💻 Platform  : ${os.platform()} ${os.arch()}`,
      `│ 💎 Commands  : ${allCommands().length}`,
      `│ 🚀 Runs      : ${db.data.metrics.commandsRun || 0}`,
      `│ 💬 Messages  : ${db.data.metrics.messagesSeen || 0}`,
      `│ 👤 Users     : ${Object.keys(db.data.users).length}`,
      `│ 👥 Groups    : ${Object.keys(db.data.groups).length}`,
      `╰━━━━━━━━━━━━━━━━━━━━╯`,
      config.footerMessage
    ].join('\n'));
  }
});

registerCommand({
  name: 'owner', aliases: ['ownerinfo', 'contactowner'], category: 'system', description: 'Show bot owner in premium style',
  async run(ctx) {
    const number = config.ownerNumber ? `+${config.ownerNumber}` : 'Not configured';
    await ctx.reply([
      `╭━━━〔 👑 ${serifBold('OWNER CARD')} 👑 〕━━━╮`,
      `┃ 🧑‍💻 NAME   ${serifBold(config.ownerName)}`,
      `┃ 📞 NUMBER ${serifBold(number)}`,
      `┃ 🔗 WA     ${config.ownerContactUrl || 'Contact link not configured'}`,
      `┃ 🤖 BOT    ${serifBold(config.shortName)}`,
      `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯`,
      '',
      ...premiumFooterBlock()
    ].join('\n'));
  }
});


registerCommand({ name: 'dashboard', category: 'owner', ownerOnly: true, description: 'Show the protected owner dashboard URL', async run(ctx) { const base=String(config.publicUrl||'').replace(/\/$/,''); await ctx.reply([...rowBox('OWNER DASHBOARD', [`┃ 🔐 ${base ? `${base}/owner` : `http://localhost:${config.port}/owner`}`, `┃ 👑 Protected admin area`], '🛡️'), '', ...premiumFooterBlock()].join('\n')); } });
registerCommand({ name: 'pairsite', aliases: ['ownerpair'], category: 'owner', ownerOnly: true, description: 'Show protected owner pairing URL', async run(ctx) { const base=String(config.publicUrl||'').replace(/\/$/,''); await ctx.reply([...rowBox('OWNER PAIR CENTER', [`┃ 🔐 ${base ? `${base}/pair` : `http://localhost:${config.port}/pair`}`, `┃ 👑 Owner-only pairing area`], '🔗'), '', ...premiumFooterBlock()].join('\n')); } });
registerCommand({
  name: 'pair',
  aliases: ['pairlink', 'linkwhatsapp'],
  category: 'system',
  description: 'Generate a WhatsApp pairing code directly in private chat',
  usage: 'pair <country-code-number>',
  cooldown: 30,
  async run(ctx) {
    if (ctx.isGroup) return ctx.reply('For security, use this command in a private chat with the bot.');

    const phone = String(ctx.args[0] || '').replace(/\D/g, '');
    if (phone.length < 8 || phone.length > 15) {
      return ctx.reply(`Usage: ${ctx.prefix}pair <country-code-number>\nExample: ${ctx.prefix}pair 923001234567`);
    }

    const sender = String(ctx.senderNumber || '').replace(/\D/g, '');
    if (!ctx.isMasterOwnerAction && sender && phone !== sender) {
      return ctx.reply('For security, you can only generate a pairing code for your own WhatsApp number.');
    }

    if (!config.multi.enabled) return ctx.reply('Multi-session pairing is currently disabled by the owner.');
    if (!ctx.isMasterOwnerAction && (config.multi.accessCode || db.data.sessionPolicy?.inviteOnly)) {
      return ctx.reply('Direct pairing is currently restricted by the owner.');
    }

    try {
      let sessionId = existingLinkedSessionId(phone);
      let inst = sessionId ? await waManager.ensurePublicSession(sessionId) : null;

      if (inst?.snapshot?.().connected) {
        return ctx.reply('This WhatsApp number is already connected to A-X-HK.');
      }

      if (!sessionId) {
        const created = await waManager.createPublicSession({
          phone,
          label: `A-X-HK ${phone.slice(-4)}`
        });
        sessionId = created.id;
        inst = waManager.getInstance(sessionId);
      }

      const code = await waManager.requestPairingCode(phone, sessionId);
      const copyCode = String(code || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
      const formatted = formatDirectPairCode(copyCode);

      await ctx.reply([
        '╭━━━〔 🔗 A_X_HK PAIR CODE 〕━━━╮',
        `┃ Number : +${phone}`,
        `┃ Code   : *${formatted}*`,
        `┃ Session: ${sessionId}`,
        '╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
        '',
        'WhatsApp → Linked devices → Link a device → Link with phone number instead',
        `Enter: *${formatted}*`,
        '',
        'This code is temporary. Do not share it with anyone.'
      ].join('\n'));

      // Send the exact code again as a separate message so it can be copied instantly.
      await ctx.reply(copyCode);
    } catch (err) {
      await ctx.reply(`Pairing failed: ${String(err?.message || err).slice(0, 300)}`);
    }
  }
});
registerCommand({ name: 'minisite', category: 'system', description: 'Show configured mini-site URL', async run(ctx) { await ctx.reply([...rowBox('MINI SITE', [`┃ 🔗 ${config.miniSiteUrl || 'Not configured yet'}`], '🌐'), '', ...premiumFooterBlock()].join('\n')); } });

registerCommand({
  name: 'links', category: 'system', description: 'Show configured bot links',
  async run(ctx) {
    const base = publicBaseUrl();
    const links = [
      base && `┃ 🔗 Link WhatsApp: ${base}/link`,
      config.miniSiteUrl && `┃ 🌐 Mini Bot: ${config.miniSiteUrl}`,
      `┃ 💎 Creator Studio: ${creatorStudioUrl()}`,
      config.githubUrl && `┃ 🧩 GitHub: ${config.githubUrl}`,
      config.whatsappChannelUrl && `┃ 📣 Channel: ${config.whatsappChannelUrl}`,
      config.youtubeUrl && `┃ ▶️ YouTube: ${config.youtubeUrl}`,
      config.tutorialUrl && `┃ 🎓 Tutorial: ${config.tutorialUrl}`,
      config.ownerContactUrl && `┃ 👑 Owner: ${config.ownerContactUrl}`
    ].filter(Boolean);
    await ctx.reply(links.length ? [...rowBox(`${config.shortName} LINKS`, links, '🔗'), '', ...premiumFooterBlock()].join('\n') : [...rowBox('LINKS', ['┃ No public links are configured yet.'], '🔗'), '', ...premiumFooterBlock()].join('\n'));
  }
});

registerCommand({
  name: 'intro', aliases: ['aboutbot', 'promo'], category: 'system', description: 'Show A-X-HK bot introduction',
  async run(ctx) {
    const lines = [
      '====================================',
      `   ${config.botName}`,
      '====================================',
      config.tagline,
      '',
      `Bot: ${config.shortName}`,
      `Owner: ${config.ownerName}`,
      `Version: ${config.version}`,
      `Commands: ${allCommands().length}`,
      config.miniSiteUrl && `Mini Bot: ${config.miniSiteUrl}`,
      `Link Portal: ${userLinkPortalUrl()}`,
      `Creator Studio: ${creatorStudioUrl()}`,
      config.githubUrl && `GitHub: ${config.githubUrl}`,
      config.whatsappChannelUrl && `Updates: ${config.whatsappChannelUrl}`,
      config.ownerContactUrl && `Owner Contact: ${config.ownerContactUrl}`,
      '',
      `Type ${ctx.prefix}menu to open the command menu.`,
      '===================================='
    ].filter(Boolean);
    await sendBrandCard(ctx, lines.join('\n'));
  }
});

registerCommand({ name: 'privacy', category: 'system', description: 'Show privacy note', async run(ctx) { await ctx.reply('A-X-HK stores bot settings, command counters, notes, reminders and session credentials locally on the host. Never publish .env, .session, or .sessions files.'); } });
registerCommand({ name: 'safety', category: 'system', description: 'Show safety policy for this build', async run(ctx) { await ctx.reply('This A-X-HK build excludes crash/freeze exploits, credential theft, view-once bypass, hidden remote shell code and unsolicited mass-DM features.'); } });
registerCommand({ name: 'support', category: 'system', description: 'Show owner/support link', async run(ctx) { await ctx.reply([...rowBox('SUPPORT', [`┃ 👑 ${config.ownerName}`, `┃ 🔗 ${config.ownerContactUrl || config.whatsappChannelUrl || 'Not configured'}`], '🛟'), '', ...premiumFooterBlock()].join('\n')); } });

registerCommand({
  name: 'multilink', aliases: ['linkbot', 'multibot'], category: 'system', description: 'Show the public A-X-HK multi-link portal',
  async run(ctx) {
    const url = userLinkPortalUrl();
    await ctx.reply(`🔗 *A-X-HK USER LINK*\n${url}\n\nThis page only links the visitor's own WhatsApp. Owner/admin controls are protected separately.`);
  }
});

registerCommand({
  name: 'sessioninfo', aliases: ['mysession'], category: 'system', description: 'Show this linked A-X-HK session information',
  async run(ctx) {
    await ctx.reply([
      `╭━━〔 🔗 MY A-X-HK SESSION 〕━━╮`,
      `│ Label: ${ctx.sessionLabel}`,
      `│ ID: ${ctx.sessionId}`,
      `│ Mode: ${(ctx.sessionSettings.mode || config.mode).toUpperCase()}`,
      `│ Prefix: ${ctx.sessionSettings.prefix || config.prefix}`,
      `│ Account: ${ctx.sessionOwnerNumber ? `+${ctx.sessionOwnerNumber}` : 'current WhatsApp account'}`,
      `╰━━━━━━━━━━━━━━━━━━━━╯`,
      config.footerMessage
    ].join('\n'));
  }
});
