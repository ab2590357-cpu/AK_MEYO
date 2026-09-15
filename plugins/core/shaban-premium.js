import { registerCommand } from '../../lib/core/registry.js';
import { db } from '../../lib/core/database.js';
import { config } from '../../lib/config.js';
import { recentStatuses, statusListText, sendStatusByIndex } from '../../lib/services/status-studio.js';

function enabled(value) {
  return ['on', 'true', 'yes', '1', 'enable', 'enabled'].includes(String(value || '').toLowerCase());
}
function disabled(value) {
  return ['off', 'false', 'no', '0', 'disable', 'disabled'].includes(String(value || '').toLowerCase());
}
async function setSessionBool(ctx, key, label, extra = {}) {
  const value = String(ctx.args[0] || '').trim();
  if (!enabled(value) && !disabled(value)) return ctx.reply(`Usage: ${ctx.prefix}${ctx.command.name} on|off`);
  ctx.sessionSettings[key] = enabled(value);
  if (extra.exclusive && ctx.sessionSettings[key]) ctx.sessionSettings[extra.exclusive] = false;
  await db.save();
  await ctx.reply([
    `╭━━━〔 ⚙️ ${label.toUpperCase()} ⚙️ 〕━━━╮`,
    `┃ STATUS  ${ctx.sessionSettings[key] ? 'ON ✅' : 'OFF ❌'}`,
    `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯`,
    '',
    config.footerMessage
  ].join('\n'));
}
async function setGroupBool(ctx, key, label) {
  const value = String(ctx.args[0] || '').trim();
  if (!enabled(value) && !disabled(value)) return ctx.reply(`Usage: ${ctx.prefix}${ctx.command.name} on|off`);
  ctx.groupSettings[key] = enabled(value);
  await db.save();
  await ctx.reply([
    `╭━━━〔 👥 ${label.toUpperCase()} 👥 〕━━━╮`,
    `┃ GROUP   ${String(ctx.metadata?.subject || 'Group').slice(0, 48)}`,
    `┃ STATUS  ${ctx.groupSettings[key] ? 'ON ✅' : 'OFF ❌'}`,
    `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯`,
    '',
    config.footerMessage
  ].join('\n'));
}
function cleanText(value, fallback, max = 1200) {
  const text = String(value || '').trim();
  return (text || fallback).slice(0, max);
}
function premiumFeatureCard(ctx) {
  const s = ctx.sessionSettings;
  const g = ctx.groupSettings || {};
  return [
    '╭━━━〔 💎 A-X-HK PREMIUM FEATURE PACK 💎 〕━━━╮',
    `┃ 📲 STATUS SAVE/REPLY/REACT  ${s.statusSeen || s.statusReply || s.statusReact ? 'ON' : 'READY'}`,
    `┃ 👥 WELCOME/GOODBYE          ${g.welcome || g.goodbye ? 'ON' : 'READY'}`,
    `┃ 🛡️ ADMIN EVENTS            ${g.adminEvents ? 'ON' : 'READY'}`,
    `┃ 📞 ANTI CALL               ${s.antiCall ? 'ON' : 'READY'}`,
    `┃ 🛡️ ANTI LINK/BAD           ${g.antiLink || g.antiBad ? 'ON' : 'READY'}`,
    `┃ 🗑️ ANTI DELETE OWNER LOG   ${s.antiDeletePrivate || g.antiDelete ? 'ON' : 'READY'}`,
    `┃ 📣 GC STATUS               READY`,
    `┃ ✍️ AUTO TYPING/RECORDING   ${s.autoTyping || s.autoRecording ? 'ON' : 'READY'}`,
    `┃ 🎨 AUTO STICKER/VOICE      ${s.autoSticker || s.autoVoice ? 'ON' : 'READY'}`,
    `┃ 📥 STATUS CACHE            ${recentStatuses(ctx.sessionId).length}`,
    '╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
    '',
    '╭━━━〔 COMMANDS 〕━━━╮',
    `┃ ${ctx.prefix}statuslist  •  ${ctx.prefix}statussave 1`,
    `┃ ${ctx.prefix}statusreply on  •  ${ctx.prefix}statusreact on`,
    `┃ ${ctx.prefix}adminevents on`,
    `┃ ${ctx.prefix}anticall on  •  ${ctx.prefix}setreject text`,
    `┃ ${ctx.prefix}autotyping on  •  ${ctx.prefix}autorecording on`,
    `┃ ${ctx.prefix}autosticker on  •  ${ctx.prefix}autovoice on`,
    `┃ ${ctx.prefix}gcstatus  •  ${ctx.prefix}automationstudio`,
    '╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
    '',
    config.footerMessage
  ].join('\n');
}

registerCommand({
  name: 'premiumfeatures', aliases: ['shabanfeatures', 'featurepack', 'autopack'], category: 'premium', description: 'Show the premium SHABAN-inspired feature pack status', cooldown: 3,
  async run(ctx) { await ctx.reply(premiumFeatureCard(ctx)); }
});

registerCommand({
  name: 'statuslist', aliases: ['laststatus', 'statuses', 'statusvault'], category: 'media', description: 'List recent cached WhatsApp statuses', ownerOnly: true, cooldown: 3,
  async run(ctx) { await ctx.reply(statusListText(ctx.sessionId)); }
});

registerCommand({
  name: 'statussave', aliases: ['savestatus', 'getstatus', 'statussend', 'sendstatus'], category: 'media', description: 'Send a cached WhatsApp status to the current chat', ownerOnly: true, usage: 'statussave 1', cooldown: 5,
  async run(ctx) {
    const index = Number(ctx.args[0] || 1);
    await sendStatusByIndex(ctx.sock, ctx.chat, ctx.sessionId, Number.isFinite(index) ? index : 1, { quoted: ctx.msg });
  }
});

registerCommand({
  name: 'statusreply', aliases: ['autostatusreply', 'statusautoreply'], category: 'settings', description: 'Auto reply to new WhatsApp statuses', ownerOnly: true, usage: 'statusreply on|off', cooldown: 2,
  async run(ctx) { await setSessionBool(ctx, 'statusReply', 'Status auto reply'); }
});

registerCommand({
  name: 'statusreplytext', aliases: ['setstatusreply', 'statusmsg'], category: 'settings', description: 'Set auto status reply text', ownerOnly: true, usage: 'statusreplytext Thanks for the status', cooldown: 2,
  async run(ctx) {
    ctx.sessionSettings.statusReplyText = cleanText(ctx.argText, `✨ ${config.shortName} saw your status.\n\n${config.footerMessage}`);
    await db.save();
    await ctx.reply('✅ Status auto-reply text saved.');
  }
});

registerCommand({
  name: 'statusreact', aliases: ['autostatusreact', 'statusreaction'], category: 'settings', description: 'Auto react to WhatsApp statuses', ownerOnly: true, usage: 'statusreact on|off', cooldown: 2,
  async run(ctx) { await setSessionBool(ctx, 'statusReact', 'Status auto reaction'); }
});

registerCommand({
  name: 'statusreactemoji', aliases: ['setstatusreact', 'statusemoji'], category: 'settings', description: 'Set status auto-reaction emoji', ownerOnly: true, usage: 'statusreactemoji ❤️', cooldown: 2,
  async run(ctx) {
    const emoji = String(ctx.argText || '').trim().slice(0, 16);
    if (!emoji) return ctx.reply(`Usage: ${ctx.prefix}statusreactemoji ❤️`);
    ctx.sessionSettings.statusReactEmoji = emoji;
    await db.save();
    await ctx.reply(`✅ Status reaction emoji saved: ${emoji}`);
  }
});

registerCommand({
  name: 'adminevents', aliases: ['groupevents', 'adminalert', 'promotealert'], category: 'group', description: 'Premium alerts for promote/demote/remove group events', groupOnly: true, adminOnly: true, usage: 'adminevents on|off', cooldown: 2,
  async run(ctx) { await setGroupBool(ctx, 'adminEvents', 'Admin events'); }
});

registerCommand({
  name: 'welcometest', aliases: ['testwelcome'], category: 'group', description: 'Preview the premium welcome message', groupOnly: true, adminOnly: true, cooldown: 3,
  async run(ctx) {
    const who = `@${ctx.sender.split('@')[0]}`;
    await ctx.reply([
      '╭━━━〔 ✨ A-X-HK WELCOME ✨ 〕━━━╮',
      `┃ 👋 WELCOME  ${who}`,
      `┃ 👥 GROUP    ${ctx.metadata?.subject || 'Group'}`,
      `┃ 🧩 MEMBERS  ${ctx.metadata?.participants?.length || 0}`,
      '╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
      '',
      config.footerMessage
    ].join('\n'), { mentions: [ctx.sender] });
  }
});

registerCommand({
  name: 'goodbyetest', aliases: ['testgoodbye'], category: 'group', description: 'Preview the premium goodbye message', groupOnly: true, adminOnly: true, cooldown: 3,
  async run(ctx) {
    const who = `@${ctx.sender.split('@')[0]}`;
    await ctx.reply([
      '╭━━━〔 👋 A-X-HK GOODBYE 👋 〕━━━╮',
      `┃ USER   ${who}`,
      `┃ GROUP  ${ctx.metadata?.subject || 'Group'}`,
      '╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
      '',
      config.footerMessage
    ].join('\n'), { mentions: [ctx.sender] });
  }
});

registerCommand({
  name: 'anticall', aliases: ['callreject', 'rejectcall', 'callblock'], category: 'settings', description: 'Reject incoming WhatsApp calls and send a premium message', ownerOnly: true, usage: 'anticall on|off', cooldown: 2,
  async run(ctx) { await setSessionBool(ctx, 'antiCall', 'Anti call'); }
});

registerCommand({
  name: 'setreject', aliases: ['rejectmsg', 'setcallmsg'], category: 'settings', description: 'Set anti-call reject message', ownerOnly: true, usage: 'setreject Please message me only', cooldown: 2,
  async run(ctx) {
    ctx.sessionSettings.antiCallText = cleanText(ctx.argText, 'Please do not call. Send a message and I will reply soon.', 900);
    await db.save();
    await ctx.reply('✅ Anti-call reject message saved.');
  }
});

registerCommand({
  name: 'callguard', aliases: ['callsettings'], category: 'settings', description: 'Show anti-call settings', ownerOnly: true, cooldown: 2,
  async run(ctx) {
    await ctx.reply([
      '╭━━━〔 📞 A-X-HK CALL GUARD 📞 〕━━━╮',
      `┃ STATUS  ${ctx.sessionSettings.antiCall ? 'ON ✅' : 'OFF ❌'}`,
      `┃ TEXT    ${String(ctx.sessionSettings.antiCallText || '').slice(0, 70) || 'Default'}`,
      '╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
      '',
      `${ctx.prefix}anticall on|off`,
      `${ctx.prefix}setreject your message`,
      '',
      config.footerMessage
    ].join('\n'));
  }
});

registerCommand({
  name: 'viewonce', aliases: ['vv', 'antivv', 'viewonceinfo'], category: 'security', description: 'Privacy-safe view-once note', cooldown: 3,
  async run(ctx) {
    await ctx.reply([
      '╭━━━〔 🛡️ A-X-HK VIEW-ONCE GUARD 🛡️ 〕━━━╮',
      '┃ View-once media privacy is respected.',
      '┃ Normal media can be saved with .save',
      '┃ View-once bypass/extraction is not enabled.',
      '╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
      '',
      config.footerMessage
    ].join('\n'));
  }
});
