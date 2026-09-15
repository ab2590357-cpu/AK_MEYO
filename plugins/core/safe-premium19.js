import fs from 'node:fs/promises';
import path from 'node:path';
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { registerCommand } from '../../lib/core/registry.js';
import { db } from '../../lib/core/database.js';
import { config } from '../../lib/config.js';
import { contextInfo, unwrapMessage } from '../../lib/utils/message.js';
import { downloadPublicMedia, cleanupDownloadedMedia } from '../../lib/services/media-downloader.js';
import { postQuotedToStatus } from '../../lib/services/gc-status.js';

const onValues = new Set(['on','true','yes','1','enable','enabled']);
const offValues = new Set(['off','false','no','0','disable','disabled']);
const safe = (value = '', max = 1200) => String(value || '').replace(/[\r\t]+/g, ' ').trim().slice(0, max);
const footer = () => config.footerMessage || '*© POWERED BY ABDULLAH-X-HACKER.*';

function box(title, rows, icon = '💎') {
  return [`╭━━━〔 ${icon} ${title} ${icon} 〕━━━╮`, ...rows, '╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯'].join('\n');
}
function stateText(v) { return v ? 'ON ✅' : 'OFF ❌'; }
async function groupToggle(ctx, key, label) {
  const v = String(ctx.args[0] || '').toLowerCase();
  if (!onValues.has(v) && !offValues.has(v)) return ctx.reply(`Usage: ${ctx.prefix}${ctx.command.name} on|off`);
  ctx.groupSettings[key] = onValues.has(v);
  await db.save();
  return ctx.reply(`${box(label.toUpperCase(), [`┃ 👥 GROUP  ${safe(ctx.metadata?.subject || 'Group', 50)}`, `┃ STATUS ${stateText(ctx.groupSettings[key])}`], '🛡️')}\n\n${footer()}`);
}
async function sessionToggle(ctx, key, label) {
  const v = String(ctx.args[0] || '').toLowerCase();
  if (!onValues.has(v) && !offValues.has(v)) return ctx.reply(`Usage: ${ctx.prefix}${ctx.command.name} on|off`);
  ctx.sessionSettings[key] = onValues.has(v);
  await db.save();
  return ctx.reply(`${box(label.toUpperCase(), [`┃ STATUS ${stateText(ctx.sessionSettings[key])}`], '⚙️')}\n\n${footer()}`);
}
function quotedMessage(ctx) { return contextInfo(ctx.msg)?.quotedMessage || null; }
function quotedMediaKind(message = {}) {
  const m = unwrapMessage(message || {});
  if (m.imageMessage) return { kind: 'image', mimetype: m.imageMessage.mimetype || 'image/jpeg' };
  if (m.videoMessage) return { kind: 'video', mimetype: m.videoMessage.mimetype || 'video/mp4' };
  if (m.audioMessage) return { kind: 'audio', mimetype: m.audioMessage.mimetype || 'audio/ogg' };
  if (m.documentMessage) return { kind: 'document', mimetype: m.documentMessage.mimetype || 'application/octet-stream', fileName: m.documentMessage.fileName || 'file' };
  return null;
}
async function sendDownloaded(ctx, item, label) {
  const caption = [
    `╭━━━〔 📥 A-X-HK ${label.toUpperCase()} 📥 〕━━━╮`,
    `┃ TITLE  ${safe(item.title || item.fileName || label, 80)}`,
    item.uploader ? `┃ SOURCE ${safe(item.uploader, 70)}` : '',
    item.bytes ? `┃ SIZE   ${(item.bytes / 1024 / 1024).toFixed(1)} MB` : '',
    '╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
    '',
    '© POWERED BY ABDULLAH-X-HACKER.'
  ].filter(Boolean).join('\n');
  if (item.kind === 'video') return ctx.send({ video: { url: item.filePath }, mimetype: item.mimetype || 'video/mp4', fileName: item.fileName, caption }, { quoted: ctx.msg });
  if (item.kind === 'audio') return ctx.send({ audio: { url: item.filePath }, mimetype: item.mimetype || 'audio/mpeg', fileName: item.fileName, ptt: false, caption }, { quoted: ctx.msg });
  if (item.kind === 'image') return ctx.send({ image: { url: item.filePath }, caption }, { quoted: ctx.msg });
  return ctx.send({ document: { url: item.filePath }, mimetype: item.mimetype || 'application/octet-stream', fileName: item.fileName, caption }, { quoted: ctx.msg });
}

registerCommand({ name: 'automationstudio', aliases: ['autostudio','safecontrol','controlpack'], category: 'premium', ownerOnly: true, description: 'Show Safe Premium Control Pack switches', cooldown: 3, async run(ctx) {
  const s = ctx.sessionSettings, g = ctx.groupSettings || {};
  await ctx.reply([
    box('A-X-HK SAFE PREMIUM CONTROL', [
      `┃ AutoReact       ${stateText(s.autoReact)}`,
      `┃ AutoSticker     ${stateText(s.autoSticker)}`,
      `┃ AutoVoice       ${stateText(s.autoVoice)}`,
      `┃ Status Seen     ${stateText(s.statusSeen)}`,
      `┃ Status Reply    ${stateText(s.statusReply)}`,
      `┃ Status React    ${stateText(s.statusReact)}`,
      `┃ AntiCall        ${stateText(s.antiCall)}`,
      `┃ Private Delete  ${stateText(s.antiDeletePrivate)}`,
      ctx.isGroup ? `┃ AntiLink        ${stateText(g.antiLink)}` : '',
      ctx.isGroup ? `┃ AntiBad         ${stateText(g.antiBad)}` : '',
      ctx.isGroup ? `┃ GC AntiDelete   ${stateText(g.antiDelete)}` : ''
    ].filter(Boolean), '🛡️'),
    '',
    box('QUICK COMMANDS', [
      `┃ ${ctx.prefix}autosticker on/off`,
      `┃ ${ctx.prefix}autovoice on/off`,
      `┃ ${ctx.prefix}statuscooldown 90`,
      `┃ ${ctx.prefix}linkaction warn/delete/kick`,
      `┃ ${ctx.prefix}badword add word`,
      `┃ ${ctx.prefix}gcstatus  (reply media/text)`
    ], '⚙️'),
    '', footer()
  ].join('\n'));
}});

registerCommand({ name: 'autosticker', aliases: ['autostickers'], category: 'settings', ownerOnly: true, description: 'Auto convert incoming images into stickers with cooldown', usage: 'autosticker on|off', cooldown: 2, async run(ctx) { await sessionToggle(ctx, 'autoSticker', 'Auto sticker'); }});
registerCommand({ name: 'autovoice', aliases: ['autovoicenote'], category: 'settings', ownerOnly: true, description: 'Auto send a short voice response with cooldown', usage: 'autovoice on|off', cooldown: 2, async run(ctx) { await sessionToggle(ctx, 'autoVoice', 'Auto voice'); }});
registerCommand({ name: 'alwaysonline', aliases: ['onlinealways'], category: 'settings', ownerOnly: true, description: 'Keep linked WhatsApp presence available while messages arrive', usage: 'alwaysonline on|off', cooldown: 2, async run(ctx) { await sessionToggle(ctx, 'alwaysOnline', 'Always online'); }});
registerCommand({ name: 'autocooldown', aliases: ['autodelay'], category: 'settings', ownerOnly: true, description: 'Set auto feature cooldown seconds', usage: 'autocooldown 60', cooldown: 2, async run(ctx) {
  const n = Math.max(20, Math.min(600, Number(ctx.args[0]) || 45));
  ctx.sessionSettings.autoFeatureCooldownSeconds = n;
  await db.save();
  await ctx.reply(`✅ Auto feature cooldown saved: ${n}s`);
}});
registerCommand({ name: 'statuscooldown', aliases: ['statusdelay'], category: 'settings', ownerOnly: true, description: 'Set status auto reply/react cooldown seconds', usage: 'statuscooldown 90', cooldown: 2, async run(ctx) {
  const n = Math.max(30, Math.min(900, Number(ctx.args[0]) || 90));
  ctx.sessionSettings.statusCooldownSeconds = n;
  await db.save();
  await ctx.reply(`✅ Status automation cooldown saved: ${n}s`);
}});

registerCommand({ name: 'antibad', aliases: ['badguard'], category: 'group', groupOnly: true, adminOnly: true, description: 'Toggle premium bad-word guard', usage: 'antibad on|off', cooldown: 2, async run(ctx) { await groupToggle(ctx, 'antiBad', 'Anti bad words'); }});
registerCommand({ name: 'badword', aliases: ['badwords'], category: 'group', groupOnly: true, adminOnly: true, description: 'Manage bad words list: add/remove/list/clear', usage: 'badword add word', cooldown: 2, async run(ctx) {
  const action = String(ctx.args[0] || 'list').toLowerCase();
  ctx.groupSettings.badWords ||= [];
  if (action === 'list') return ctx.reply(`${box('ANTI-BAD WORDS', [`┃ STATUS ${stateText(ctx.groupSettings.antiBad)}`, `┃ WORDS  ${ctx.groupSettings.badWords.length || 0}`, `┃ LIST   ${ctx.groupSettings.badWords.join(', ') || 'empty'}`], '🧹')}\n\n${footer()}`);
  if (action === 'clear') { ctx.groupSettings.badWords = []; await db.save(); return ctx.reply('✅ Bad words list cleared.'); }
  const word = safe(ctx.args.slice(1).join(' '), 60).toLowerCase();
  if (!word) return ctx.reply(`Usage: ${ctx.prefix}badword add badword`);
  if (action === 'add') { if (!ctx.groupSettings.badWords.includes(word)) ctx.groupSettings.badWords.push(word); await db.save(); return ctx.reply(`✅ Added bad word: ${word}`); }
  if (['remove','del','delete'].includes(action)) { ctx.groupSettings.badWords = ctx.groupSettings.badWords.filter((w) => w !== word); await db.save(); return ctx.reply(`✅ Removed bad word: ${word}`); }
  return ctx.reply(`Usage: ${ctx.prefix}badword add|remove|list|clear`);
}});
registerCommand({ name: 'badaction', aliases: ['badmode'], category: 'group', groupOnly: true, adminOnly: true, description: 'Set anti-bad action warn/delete/kick', usage: 'badaction warn', cooldown: 2, async run(ctx) {
  const action = String(ctx.args[0] || '').toLowerCase();
  if (!['warn','delete','kick'].includes(action)) return ctx.reply(`Usage: ${ctx.prefix}badaction warn|delete|kick`);
  ctx.groupSettings.badAction = action;
  await db.save();
  await ctx.reply(`✅ Anti-bad action saved: ${action.toUpperCase()}`);
}});
registerCommand({ name: 'badwarnlimit', aliases: ['badlimit'], category: 'group', groupOnly: true, adminOnly: true, description: 'Set bad-word warning limit', usage: 'badwarnlimit 3', cooldown: 2, async run(ctx) {
  ctx.groupSettings.badWarnLimit = Math.max(1, Math.min(10, Number(ctx.args[0]) || 3));
  await db.save();
  await ctx.reply(`✅ Bad-word warning limit: ${ctx.groupSettings.badWarnLimit}`);
}});

registerCommand({ name: 'linkaction', aliases: ['antilinkmode'], category: 'group', groupOnly: true, adminOnly: true, description: 'Set anti-link action delete/warn/kick', usage: 'linkaction warn', cooldown: 2, async run(ctx) {
  const action = String(ctx.args[0] || '').toLowerCase();
  if (!['delete','warn','kick'].includes(action)) return ctx.reply(`Usage: ${ctx.prefix}linkaction delete|warn|kick`);
  ctx.groupSettings.linkAction = action;
  await db.save();
  await ctx.reply(`✅ Anti-link action saved: ${action.toUpperCase()}`);
}});
registerCommand({ name: 'linkwarnlimit', aliases: ['linklimit'], category: 'group', groupOnly: true, adminOnly: true, description: 'Set link warning limit', usage: 'linkwarnlimit 3', cooldown: 2, async run(ctx) {
  ctx.groupSettings.linkWarnLimit = Math.max(1, Math.min(10, Number(ctx.args[0]) || 3));
  await db.save();
  await ctx.reply(`✅ Anti-link warning limit: ${ctx.groupSettings.linkWarnLimit}`);
}});
registerCommand({ name: 'allowdomain', aliases: ['linkallow'], category: 'group', groupOnly: true, adminOnly: true, description: 'Allow a domain while anti-link is on', usage: 'allowdomain youtube.com', cooldown: 2, async run(ctx) {
  const domain = safe(ctx.args[0], 120).toLowerCase().replace(/^https?:\/\//,'').replace(/^www\./,'').split('/')[0];
  if (!domain || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) return ctx.reply(`Usage: ${ctx.prefix}allowdomain youtube.com`);
  ctx.groupSettings.linkAllowedDomains ||= [];
  if (!ctx.groupSettings.linkAllowedDomains.includes(domain)) ctx.groupSettings.linkAllowedDomains.push(domain);
  await db.save();
  await ctx.reply(`✅ Allowed domain: ${domain}`);
}});
registerCommand({ name: 'removedomain', aliases: ['linkdeny'], category: 'group', groupOnly: true, adminOnly: true, description: 'Remove an allowed anti-link domain', usage: 'removedomain youtube.com', cooldown: 2, async run(ctx) {
  const domain = safe(ctx.args[0], 120).toLowerCase().replace(/^https?:\/\//,'').replace(/^www\./,'').split('/')[0];
  ctx.groupSettings.linkAllowedDomains = (ctx.groupSettings.linkAllowedDomains || []).filter((d) => d !== domain);
  await db.save();
  await ctx.reply(`✅ Removed allowed domain: ${domain}`);
}});
registerCommand({ name: 'allowedlinks', aliases: ['allowlinks'], category: 'group', groupOnly: true, adminOnly: true, description: 'Show allowed domains', cooldown: 2, async run(ctx) {
  await ctx.reply(`${box('ALLOWED LINK DOMAINS', [`┃ ${ctx.groupSettings.linkAllowedDomains?.join(', ') || 'empty'}`], '🔗')}\n\n${footer()}`);
}});
registerCommand({ name: 'resetwarns', aliases: ['clearwarningsall'], category: 'group', groupOnly: true, adminOnly: true, description: 'Clear all warning rows for this group', cooldown: 4, async run(ctx) {
  const prefix = db.scopedKey(ctx.sessionId, `${ctx.chat}:`);
  let n = 0;
  for (const key of Object.keys(db.data.warnings || {})) if (key.startsWith(prefix)) { delete db.data.warnings[key]; n++; }
  await db.save();
  await ctx.reply(`✅ Cleared ${n} warning row(s) for this group.`);
}});

registerCommand({ name: 'gantidelete', aliases: ['groupantidelete','antideletegroup','delguard'], category: 'group', groupOnly: true, adminOnly: true, description: 'Log deleted group messages to owner inbox only', usage: 'gantidelete on|off', cooldown: 2, async run(ctx) { await groupToggle(ctx, 'antiDelete', 'Group anti-delete owner log'); }});

registerCommand({ name: 'gcstatus', aliases: ['gcs','groupstatus','poststatus','notegcstatus','notegcs'], category: 'group', groupOnly: true, adminOnly: true, cooldown: 20, description: 'Post replied group text/image/video to bot WhatsApp Status', usage: 'gcstatus (reply to text/image/video) [caption]', async run(ctx) {
  const result = await postQuotedToStatus(ctx);
  await ctx.reply(`${box('GC STATUS POSTED', [`┃ TYPE   ${String(result.kind || 'status').toUpperCase()}`, `┃ GROUP  ${safe(ctx.metadata?.subject || 'Group', 52)}`, `┃ SAFE   View-once bypass disabled`], '📣')}\n\n${footer()}`);
}});

registerCommand({ name: 'megadl', aliases: ['megaurl','megadownload'], category: 'download', cooldown: 15, description: 'Download a public MEGA file link up to 95 MB', usage: 'megadl <mega.nz/file link>', async run(ctx) {
  const url = safe(ctx.argText, 700);
  if (!/^https?:\/\/(?:www\.)?mega\.nz\//i.test(url)) return ctx.reply(`Usage: ${ctx.prefix}megadl https://mega.nz/file/...`);
  let Mega;
  try { Mega = await import('megajs'); } catch { throw new Error('MEGA engine missing. Run npm install after deploy/build.'); }
  const File = Mega.File || Mega.default?.File;
  if (!File?.fromURL) throw new Error('MEGA engine API unavailable.');
  const file = File.fromURL(url);
  await file.loadAttributes();
  if (Number(file.size || 0) > 95 * 1024 * 1024) throw new Error('MEGA file is larger than 95 MB.');
  const buffer = await file.downloadBuffer();
  await ctx.send({ document: buffer, mimetype: 'application/octet-stream', fileName: safe(file.name || `A-X-HK-MEGA-${Date.now()}`, 90), caption: `${box('MEGA DOWNLOAD', [`┃ FILE  ${safe(file.name || 'MEGA file', 60)}`, `┃ SIZE  ${(Number(file.size || buffer.length) / 1024 / 1024).toFixed(1)} MB`], '📦')}\n\n${footer()}` }, { quoted: ctx.msg });
}});

registerCommand({ name: 'pdftools', aliases: ['pdfmenu'], category: 'document', description: 'Show premium PDF tools', cooldown: 2, async run(ctx) {
  await ctx.reply(`${box('A-X-HK PDF TOOLS', [`┃ ${ctx.prefix}pdf <text>`, `┃ ${ctx.prefix}imgtopdf  (reply image)`, `┃ ${ctx.prefix}pdftoimg  (reply PDF)`, `┃ ${ctx.prefix}txt <text>`], '📄')}\n\n${footer()}`);
}});

registerCommand({ name: 'stickerpackinfo', aliases: ['packinfo'], category: 'media', description: 'Show current sticker pack settings', cooldown: 2, async run(ctx) {
  const pack = ctx.sessionSettings.stickerPack || {};
  await ctx.reply(`${box('STICKER PACK SETTINGS', [`┃ PACK   ${safe(pack.pack || config.shortName, 60)}`, `┃ AUTHOR ${safe(pack.author || config.ownerName, 60)}`, `┃ SET    ${ctx.prefix}stickerpack Pack | Author`], '🎨')}\n\n${footer()}`);
}});
