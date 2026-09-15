import { registerCommand, allCommands } from '../../lib/core/registry.js';
import { db } from '../../lib/core/database.js';
import { config } from '../../lib/config.js';
import { targetJidFromMessage } from '../../lib/utils/message.js';

registerCommand({
  name: 'mode', category: 'owner', description: 'Set public/private mode', ownerOnly: true,
  async run(ctx) {
    const mode = String(ctx.args[0] || '').toLowerCase();
    if (!['public', 'private'].includes(mode)) return ctx.reply(`Usage: ${ctx.prefix}mode public|private`);
    ctx.sessionSettings.mode = mode;
    await db.save();
    await ctx.reply(`Bot mode is now ${mode}.`);
  }
});

registerCommand({
  name: 'setprefix', category: 'owner', description: 'Change command prefix', ownerOnly: true,
  async run(ctx) {
    const prefix = String(ctx.args[0] || '');
    if (!prefix || prefix.length > 3 || /\s/.test(prefix)) return ctx.reply('Prefix must be 1-3 non-space characters.');
    ctx.sessionSettings.prefix = prefix;
    await db.save();
    await ctx.reply(`Prefix changed to ${prefix}`);
  }
});

registerCommand({
  name: 'setbotname', category: 'owner', description: 'Update WhatsApp profile name', ownerOnly: true,
  async run(ctx) {
    if (!ctx.argText || ctx.argText.length > 100) return ctx.reply(`Usage: ${ctx.prefix}setbotname A-X-HK BOT`);
    if (typeof ctx.sock.updateProfileName !== 'function') return ctx.reply('This Baileys build does not expose profile-name updates.');
    await ctx.sock.updateProfileName(ctx.argText);
    await ctx.reply('WhatsApp profile name update requested.');
  }
});

registerCommand({
  name: 'setbio', category: 'owner', description: 'Update WhatsApp profile bio/status', ownerOnly: true,
  async run(ctx) {
    if (!ctx.argText || ctx.argText.length > 139) return ctx.reply(`Usage: ${ctx.prefix}setbio ${config.footerText}`);
    if (typeof ctx.sock.updateProfileStatus !== 'function') return ctx.reply('This Baileys build does not expose profile-status updates.');
    await ctx.sock.updateProfileStatus(ctx.argText);
    await ctx.reply('Profile bio/status update requested.');
  }
});

registerCommand({
  name: 'ban', category: 'owner', description: 'Ban a user from bot commands', ownerOnly: true,
  async run(ctx) {
    const target = targetJidFromMessage(ctx.msg, ctx.args);
    if (!target) return ctx.reply('Mention/reply to a user or provide a number.');
    db.user(target, ctx.sessionId).banned = true;
    await db.save();
    await ctx.reply(`Banned @${target.split('@')[0]}`, { mentions: [target] });
  }
});

registerCommand({
  name: 'unban', category: 'owner', description: 'Unban a user', ownerOnly: true,
  async run(ctx) {
    const target = targetJidFromMessage(ctx.msg, ctx.args);
    if (!target) return ctx.reply('Mention/reply to a user or provide a number.');
    db.user(target, ctx.sessionId).banned = false;
    await db.save();
    await ctx.reply('User unbanned.');
  }
});

registerCommand({
  name: 'premium', category: 'owner', description: 'Set premium user on/off', ownerOnly: true,
  async run(ctx) {
    const value = String(ctx.args.at(-1) || '').toLowerCase();
    const target = targetJidFromMessage(ctx.msg, ctx.args);
    if (!target || !['on', 'off'].includes(value)) return ctx.reply(`Usage: ${ctx.prefix}premium @user on|off`);
    db.user(target, ctx.sessionId).premium = value === 'on';
    await db.save();
    await ctx.reply(`Premium ${value.toUpperCase()} for @${target.split('@')[0]}`, { mentions: [target] });
  }
});

registerCommand({
  name: 'autoread', category: 'owner', description: 'Toggle automatic read receipts', ownerOnly: true,
  async run(ctx) {
    const value = String(ctx.args[0] || '').toLowerCase();
    if (!['on', 'off'].includes(value)) return ctx.reply(`Usage: ${ctx.prefix}autoread on|off`);
    ctx.sessionSettings.autoRead = value === 'on';
    await db.save();
    await ctx.reply(`Auto-read: ${value.toUpperCase()}`);
  }
});

registerCommand({
  name: 'autoreply', category: 'owner', description: 'Manage exact custom auto replies', ownerOnly: true,
  async run(ctx) {
    const action = String(ctx.args[0] || '').toLowerCase();
    if (action === 'add') {
      const pair = ctx.args.slice(1).join(' ').split('|');
      if (pair.length < 2) return ctx.reply(`Usage: ${ctx.prefix}autoreply add hello | Hi from A-X-HK`);
      const key = pair.shift().trim().toLowerCase().slice(0, 200);
      const value = pair.join('|').trim().slice(0, 2000);
      if (!key || !value) return ctx.reply('Trigger and reply cannot be empty.');
      db.autoReplies(ctx.sessionId)[key] = value;
      await db.save();
      return ctx.reply('Auto reply added.');
    }
    if (action === 'del') {
      const key = ctx.args.slice(1).join(' ').trim().toLowerCase();
      delete db.autoReplies(ctx.sessionId)[key];
      await db.save();
      return ctx.reply('Auto reply removed.');
    }
    if (action === 'list') {
      const keys = Object.keys(db.autoReplies(ctx.sessionId));
      return ctx.reply(keys.length ? keys.map((k) => `- ${k}`).join('\n') : 'No custom auto replies.');
    }
    return ctx.reply(`Usage:\n${ctx.prefix}autoreply add trigger | reply\n${ctx.prefix}autoreply del trigger\n${ctx.prefix}autoreply list`);
  }
});


registerCommand({
  name: 'brandprofile', aliases: ['applybrand'], category: 'owner', description: 'Apply A-X-HK name, bio and avatar to the linked WhatsApp profile', ownerOnly: true, usage: 'brandprofile apply',
  async run(ctx) {
    if (String(ctx.args[0] || '').toLowerCase() !== 'apply') return ctx.reply(`This changes the linked WhatsApp profile. Use ${ctx.prefix}brandprofile apply to confirm.`);
    const results = { name: false, bio: false, avatar: false, errors: [] };
    try { await ctx.sock.updateProfileName(config.botName); results.name = true; } catch (err) { results.errors.push(`name: ${err?.message || err}`); }
    try { await ctx.sock.updateProfileStatus(`${config.footerText} • ${config.shortName}`.slice(0, 139)); results.bio = true; } catch (err) { results.errors.push(`bio: ${err?.message || err}`); }
    try { await ctx.sock.updateProfilePicture(ctx.sock.user?.id || ctx.botJid, { url: config.avatarPath }); results.avatar = true; } catch (err) { results.errors.push(`avatar: ${err?.message || err}`); }
    await ctx.reply([`A-X-HK profile branding`, `Name: ${results.name ? 'OK' : 'FAILED'}`, `Bio: ${results.bio ? 'OK' : 'FAILED'}`, `Avatar: ${results.avatar ? 'OK' : 'FAILED'}`, results.errors.length ? `Details: ${results.errors.join(' | ')}` : 'Branding applied.'].join('\n'));
  }
});

registerCommand({
  name: 'botconfig', category: 'owner', description: 'Show non-secret bot config', ownerOnly: true,
  async run(ctx) {
    await ctx.reply([
      `BOT_NAME=${config.botName}`,
      `SHORT_NAME=${config.shortName}`,
      `OWNER_NAME=${config.ownerName}`,
      `OWNER_NUMBER=${config.ownerNumber ? `+${config.ownerNumber}` : 'not set'}`,
      `PREFIX=${ctx.sessionSettings.prefix || config.prefix}`,
      `MODE=${ctx.sessionSettings.mode || config.mode}`,
      `AI_ENABLED=${config.ai.enabled}`,
      `COMMANDS=${allCommands().length}`
    ].join('\n'));
  }
});

async function setSessionToggle(ctx, key, label, { exclusive = null } = {}) {
  const value = String(ctx.args[0] || '').toLowerCase();
  if (!['on', 'off'].includes(value)) return ctx.reply(`Usage: ${ctx.prefix}${ctx.command.name} on|off`);
  ctx.sessionSettings[key] = value === 'on';
  if (value === 'on' && exclusive) ctx.sessionSettings[exclusive] = false;
  await db.save();
  const state = value === 'on' ? 'ENABLED' : 'DISABLED';
  const extra = value === 'on' && exclusive ? `\n│  ↳ ${exclusive === 'autoTyping' ? 'Auto-typing' : 'Auto-recording'}: OFF` : '';
  await ctx.reply([
    `╭━━━━〔 ⚙️ ${config.shortName} AUTO CONTROL 〕━━━━╮`,
    `│  ${label}: ${state}${extra}`,
    `╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯`,
    ``,
    config.footerMessage
  ].join('\n'));
}

registerCommand({
  name: 'autoreact', aliases: ['autoreaction'], category: 'settings', description: 'Toggle automatic positive emoji reactions', ownerOnly: true, usage: 'autoreact on|off',
  async run(ctx) { await setSessionToggle(ctx, 'autoReact', 'Auto-reaction'); }
});

registerCommand({
  name: 'antidelete', aliases: ['anti-delete', 'antideletemsg', 'deletedmessage', 'deletedmsg'], category: 'settings',
  description: 'Recover deleted messages from private inbox chats only', ownerOnly: true, usage: 'antidelete on|off',
  async run(ctx) {
    const value = String(ctx.args[0] || '').toLowerCase();
    if (!['on', 'off'].includes(value)) return ctx.reply(`Usage: ${ctx.prefix}antidelete on|off`);
    ctx.sessionSettings.antiDeletePrivate = value === 'on';
    await db.save();
    await ctx.reply([
      `╭━━━━〔 🛡️ ${config.shortName} PRIVATE ANTI-DELETE 〕━━━━╮`,
      `│  Status : ${value === 'on' ? 'ENABLED ✅' : 'DISABLED ⛔'}`,
      `│  Scope  : 1-to-1 inbox chats only`,
      `│  Groups : EXCLUDED`,
      `│  View-once: EXCLUDED`,
      `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯`,
      value === 'on' ? 'Only new messages received after enabling can be recovered.' : 'New deleted messages will no longer be recovered.',
      '', config.footerMessage
    ].join('\n'));
  }
});

registerCommand({
  name: 'autoreactemoji', aliases: ['reactemojis'], category: 'settings', description: 'Set emojis used by auto-reaction', ownerOnly: true, usage: 'autoreactemoji ❤️ 🔥 👍',
  async run(ctx) {
    const values = String(ctx.argText || '').split(/[\s,]+/).map((v) => v.trim()).filter(Boolean).slice(0, 10);
    if (!values.length) return ctx.reply(`Usage: ${ctx.prefix}autoreactemoji ❤️ 🔥 👍 😂 ✨`);
    const emojiish = values.filter((v) => [...v].length <= 8 && !/[A-Za-z0-9]/.test(v));
    if (!emojiish.length) return ctx.reply('Provide emoji reactions only.');
    ctx.sessionSettings.autoReactEmojis = emojiish;
    await db.save();
    await ctx.reply(`Auto-reaction emojis: ${emojiish.join(' ')}`);
  }
});

registerCommand({
  name: 'autotyping', aliases: ['typing'], category: 'settings', description: 'Toggle automatic typing presence', ownerOnly: true, usage: 'autotyping on|off',
  async run(ctx) { await setSessionToggle(ctx, 'autoTyping', 'Auto-typing', { exclusive: 'autoRecording' }); }
});

registerCommand({
  name: 'autorecording', aliases: ['recording'], category: 'settings', description: 'Toggle automatic recording presence', ownerOnly: true, usage: 'autorecording on|off',
  async run(ctx) { await setSessionToggle(ctx, 'autoRecording', 'Auto-recording', { exclusive: 'autoTyping' }); }
});

registerCommand({
  name: 'statusseen', aliases: ['statusview', 'autostatusseen'], category: 'settings', description: 'Toggle automatic WhatsApp Status seen receipts', ownerOnly: true, usage: 'statusseen on|off',
  async run(ctx) { await setSessionToggle(ctx, 'statusSeen', 'Auto status seen'); }
});

registerCommand({
  name: 'automode', aliases: ['autofeatures'], category: 'settings', description: 'Show automatic feature switches for this linked WhatsApp session', ownerOnly: true,
  async run(ctx) {
    const s = ctx.sessionSettings;
    await ctx.reply([
      `⚙️ ${config.shortName} AUTO FEATURES`,
      '',
      `Auto read: ${s.autoRead ? 'ON' : 'OFF'}`,
      `Auto reaction: ${s.autoReact ? 'ON' : 'OFF'}`,
      `Auto typing: ${s.autoTyping ? 'ON' : 'OFF'}`,
      `Auto recording: ${s.autoRecording ? 'ON' : 'OFF'}`,
      `Status seen: ${s.statusSeen ? 'ON' : 'OFF'}`,
      `Status reply: ${s.statusReply ? 'ON' : 'OFF'}`,
      `Status react: ${s.statusReact ? 'ON' : 'OFF'} ${s.statusReactEmoji || ''}`,
      `Anti-call: ${s.antiCall ? 'ON' : 'OFF'}`,
      `Private anti-delete: ${s.antiDeletePrivate ? 'ON' : 'OFF'}`,
      `Reaction emojis: ${(Array.isArray(s.autoReactEmojis) ? s.autoReactEmojis : ['❤️', '🔥', '👍', '😂', '✨']).join(' ')}`,
      '',
      `${ctx.prefix}autoreact on|off  •  ${ctx.prefix}auto react on|off`,
      `${ctx.prefix}autotyping on|off`,
      `${ctx.prefix}autorecording on|off`,
      `${ctx.prefix}statusseen on|off`,
      `${ctx.prefix}statusreply on|off  •  ${ctx.prefix}statusreact on|off`,
      `${ctx.prefix}anticall on|off  •  ${ctx.prefix}setreject text`,
      `${ctx.prefix}antidelete on|off  •  ${ctx.prefix}anti delete message on|off`,
      `${ctx.prefix}autoread on|off`
    ].join('\n'));
  }
});
