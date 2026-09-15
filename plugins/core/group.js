import { registerCommand } from '../../lib/core/registry.js';
import { db } from '../../lib/core/database.js';
import { targetJidFromMessage } from '../../lib/utils/message.js';
import { bareNumber, cleanJid } from '../../lib/utils/text.js';


function participantRefs(p) {
  return [p?.id, p?.phoneNumber, p?.lid].map((v) => cleanJid(v || '')).filter(Boolean);
}

function participantPreferredJid(p) {
  return cleanJid(p?.phoneNumber || p?.id || p?.lid || '');
}

function resolveGroupTarget(ctx, target) {
  const wanted = cleanJid(target || '');
  const wantedNumber = bareNumber(wanted);
  const row = (ctx.metadata?.participants || []).find((p) => participantRefs(p).some((jid) => jid === wanted || (wantedNumber && bareNumber(jid) === wantedNumber)));
  return cleanJid(row?.id || wanted);
}


const TAG_LIMIT = 3200;
const BOX = {
  tl: '\u256D', tr: '\u256E', bl: '\u2570', br: '\u256F', h: '\u2501', v: '\u2503'
};
const TAG_ICON = '\u{1F4E2}';
const GROUP_ICON = '\u{1F465}';
const PIN_ICON = '\u{1F4CC}';
const POWER_ICON = '\u26A1';

function line(char = BOX.h, count = 28) {
  return char.repeat(count);
}

function boxedTop(title) {
  return `${BOX.tl}${line(BOX.h, 3)}[ ${title} ]${line(BOX.h, 3)}${BOX.tr}`;
}

function boxedBottom(count = 38) {
  return `${BOX.bl}${line(BOX.h, count)}${BOX.br}`;
}

function cleanTagText(text) {
  const value = String(text || '').trim();
  return (value || 'Attention everyone').slice(0, 900);
}

function cleanHiddenTagText(text) {
  return String(text || '').trim().slice(0, 1200);
}

function mentionText(jid) {
  return `@${String(jid || '').split('@')[0]}`;
}

function premiumFooter() {
  return [
    '',
    `${BOX.tl}${line(BOX.h, 3)}[ \u00A9 POWERED BY ]${line(BOX.h, 3)}${BOX.tr}`,
    `${BOX.v} ABDULLAH-X-HACKER.`,
    boxedBottom(34)
  ].join('\n');
}

function groupParticipants(ctx) {
  const seen = new Set();
  const rows = [];
  for (const participant of ctx.metadata?.participants || []) {
    const jid = participantPreferredJid(participant);
    if (!jid || seen.has(jid)) continue;
    seen.add(jid);
    rows.push(jid);
  }
  return rows.slice(0, 200);
}

function tagHeader(ctx, title, total, page, pages, note) {
  const groupName = String(ctx.metadata?.subject || 'Group').slice(0, 60);
  const head = [
    boxedTop(`${TAG_ICON} A-X-HK ${title} ${TAG_ICON}`),
    `${BOX.v} ${GROUP_ICON} GROUP   ${groupName}`,
    `${BOX.v} ${PIN_ICON} MEMBERS ${total}`,
    `${BOX.v} ${POWER_ICON} PAGE    ${page}/${pages}`,
    boxedBottom(38),
    '',
    `${BOX.tl}${line(BOX.h, 3)}[ ${TAG_ICON} ATTENTION ]${line(BOX.h, 3)}${BOX.tr}`
  ];
  for (const row of note.split('\n').slice(0, 8)) head.push(`${BOX.v} ${row.slice(0, 80)}`);
  head.push(boxedBottom(34));
  return head.join('\n');
}

function buildTagAllPages(ctx, participants, note) {
  const rows = participants.map((jid, index) => `${BOX.v} ${String(index + 1).padStart(2, '0')}. ${mentionText(jid)}`);
  const blocks = [];
  let current = [];
  let length = 0;
  for (const row of rows) {
    const add = row.length + 1;
    if (current.length && length + add > TAG_LIMIT) {
      blocks.push(current);
      current = [];
      length = 0;
    }
    current.push(row);
    length += add;
  }
  if (current.length) blocks.push(current);
  const totalPages = Math.max(1, blocks.length);
  return blocks.map((block, index) => [
    tagHeader(ctx, 'GROUP TAGALL', participants.length, index + 1, totalPages, note),
    '',
    boxedTop(`${GROUP_ICON} MEMBERS`),
    ...block,
    boxedBottom(34),
    premiumFooter()
  ].join('\n'));
}

function buildHiddenTagText(ctx, participants, note) {
  return cleanHiddenTagText(note);
}

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function setToggle(ctx, key, label) {
  const value = String(ctx.args[0] || '').toLowerCase();
  if (!['on', 'off'].includes(value)) return ctx.reply(`Usage: ${ctx.prefix}${ctx.command.name} on|off`);
  ctx.groupSettings[key] = value === 'on';
  await db.save();
  await ctx.reply(`${label}: ${value.toUpperCase()}`);
}

registerCommand({
  name: 'groupinfo', aliases: ['ginfo'], category: 'group', description: 'Show group information', groupOnly: true,
  async run(ctx) {
    const m = ctx.metadata;
    if (!m) return ctx.reply('Could not load group metadata.');
    await ctx.reply([
      `Name: ${m.subject}`,
      `Members: ${m.participants.length}`,
      `Admins: ${m.participants.filter((p) => p.admin).length}`,
      `ID: ${ctx.chat}`,
      `Welcome: ${ctx.groupSettings.welcome ? 'ON' : 'OFF'}`,
      `Goodbye: ${ctx.groupSettings.goodbye ? 'ON' : 'OFF'}`,
      `Anti-link: ${ctx.groupSettings.antiLink ? 'ON' : 'OFF'}`,
      `Muted: ${ctx.groupSettings.muted ? 'YES' : 'NO'}`
    ].join('\n'));
  }
});

registerCommand({
  name: 'admins', category: 'group', description: 'List group admins', groupOnly: true,
  async run(ctx) {
    const admins = ctx.metadata?.participants.filter((p) => p.admin) || [];
    const mentions = admins.map(participantPreferredJid).filter(Boolean);
    const text = admins.map((p, i) => { const jid = participantPreferredJid(p); return `${i + 1}. @${jid.split('@')[0]}${p.admin === 'superadmin' ? ' (owner)' : ''}`; }).join('\n');
    await ctx.send({ text: text || 'No admins found.', mentions }, { quoted: ctx.msg });
  }
});

registerCommand({
  name: 'tagall', aliases: ['mentionall', 'everyone', 'alltag', 'tag', 'attention'], category: 'group', description: 'Premium one-column mention list for all group members', groupOnly: true, adminOnly: true, cooldown: 15,
  async run(ctx) {
    const participants = groupParticipants(ctx);
    if (!participants.length) return ctx.reply('No group members found to tag.');
    const note = cleanTagText(ctx.argText);
    const pages = buildTagAllPages(ctx, participants, note);
    for (let i = 0; i < pages.length; i += 1) {
      await ctx.send({ text: pages[i], mentions: participants }, { quoted: i === 0 ? ctx.msg : undefined });
      if (i < pages.length - 1) await wait(550);
    }
  }
});

registerCommand({
  name: 'hidetag', aliases: ['htag', 'hiddentag', 'hidden', 'taghide', 'silenttag'], category: 'group', description: 'Hidden tag all group members with only your message text', groupOnly: true, adminOnly: true, cooldown: 15,
  async run(ctx) {
    const participants = groupParticipants(ctx);
    if (!participants.length) return ctx.reply('No group members found to tag.');
    const note = cleanHiddenTagText(ctx.argText);
    if (!note) return ctx.reply(`Usage: ${ctx.prefix}${ctx.command.name} your message`);
    await ctx.send({ text: buildHiddenTagText(ctx, participants, note), mentions: participants });
  }
});

registerCommand({
  name: 'promote', category: 'group', description: 'Promote a member', groupOnly: true, adminOnly: true, botAdminRequired: true,
  async run(ctx) {
    const requested = targetJidFromMessage(ctx.msg, ctx.args);
    if (!requested) return ctx.reply('Mention/reply to a member or provide a number.');
    const target = resolveGroupTarget(ctx, requested);
    await ctx.sock.groupParticipantsUpdate(ctx.chat, [target], 'promote');
    await ctx.reply(`Promoted @${target.split('@')[0]}`, { mentions: [target] });
  }
});

registerCommand({
  name: 'demote', category: 'group', description: 'Demote an admin', groupOnly: true, adminOnly: true, botAdminRequired: true,
  async run(ctx) {
    const requested = targetJidFromMessage(ctx.msg, ctx.args);
    if (!requested) return ctx.reply('Mention/reply to an admin or provide a number.');
    const target = resolveGroupTarget(ctx, requested);
    await ctx.sock.groupParticipantsUpdate(ctx.chat, [target], 'demote');
    await ctx.reply(`Demoted @${target.split('@')[0]}`, { mentions: [target] });
  }
});

registerCommand({
  name: 'kick', aliases: ['kickuser'], category: 'action', description: 'Virtual kick reaction; group admins can remove a mentioned member', cooldown: 5,
  async run(ctx) {
    const requested = targetJidFromMessage(ctx.msg, ctx.args);
    if (ctx.isGroup && requested && (ctx.isAdmin || ctx.isOwner)) {
      if (!ctx.isBotAdmin) return ctx.reply('Make the bot a group admin first.');
      const target = resolveGroupTarget(ctx, requested);
      if ([target, requested].includes(ctx.botJid)) return ctx.reply('I will not remove myself.');
      await ctx.sock.groupParticipantsUpdate(ctx.chat, [target], 'remove');
      return ctx.reply(`Removed @${target.split('@')[0]}`, { mentions: [target] });
    }
    const label = requested ? `@${requested.split('@')[0]}` : 'you';
    return ctx.reply(`${label} gets a harmless cartoon kick 🦵😄`, requested ? { mentions: [requested] } : {});
  }
});

registerCommand({
  name: 'open', category: 'group', description: 'Allow members to send messages', groupOnly: true, adminOnly: true, botAdminRequired: true,
  async run(ctx) { await ctx.sock.groupSettingUpdate(ctx.chat, 'not_announcement'); await ctx.reply('Group opened.'); }
});

registerCommand({
  name: 'close', category: 'group', description: 'Admins-only group messages', groupOnly: true, adminOnly: true, botAdminRequired: true,
  async run(ctx) { await ctx.sock.groupSettingUpdate(ctx.chat, 'announcement'); await ctx.reply('Group closed.'); }
});

registerCommand({
  name: 'setsubject', aliases: ['setname'], category: 'group', description: 'Change group subject', groupOnly: true, adminOnly: true, botAdminRequired: true,
  async run(ctx) {
    if (!ctx.argText || ctx.argText.length > 100) return ctx.reply(`Usage: ${ctx.prefix}setsubject New Group Name`);
    await ctx.sock.groupUpdateSubject(ctx.chat, ctx.argText);
    await ctx.reply('Group subject updated.');
  }
});

registerCommand({
  name: 'setdesc', category: 'group', description: 'Change group description', groupOnly: true, adminOnly: true, botAdminRequired: true,
  async run(ctx) {
    if (!ctx.argText || ctx.argText.length > 1500) return ctx.reply(`Usage: ${ctx.prefix}setdesc New description`);
    await ctx.sock.groupUpdateDescription(ctx.chat, ctx.argText);
    await ctx.reply('Group description updated.');
  }
});

registerCommand({
  name: 'grouplink', aliases: ['link'], category: 'group', description: 'Get group invite link', groupOnly: true, adminOnly: true, botAdminRequired: true,
  async run(ctx) {
    const code = await ctx.sock.groupInviteCode(ctx.chat);
    await ctx.reply(`https://chat.whatsapp.com/${code}`);
  }
});

registerCommand({
  name: 'revokelink', category: 'group', description: 'Reset group invite link', groupOnly: true, adminOnly: true, botAdminRequired: true,
  async run(ctx) { await ctx.sock.groupRevokeInvite(ctx.chat); await ctx.reply('Invite link revoked.'); }
});

registerCommand({ name: 'welcome', category: 'group', description: 'Toggle welcome messages', groupOnly: true, adminOnly: true, async run(ctx) { await setToggle(ctx, 'welcome', 'Welcome'); } });
registerCommand({ name: 'goodbye', category: 'group', description: 'Toggle goodbye messages', groupOnly: true, adminOnly: true, async run(ctx) { await setToggle(ctx, 'goodbye', 'Goodbye'); } });
registerCommand({ name: 'antilink', category: 'group', description: 'Toggle anti-link moderation', groupOnly: true, adminOnly: true, async run(ctx) { await setToggle(ctx, 'antiLink', 'Anti-link'); } });
registerCommand({ name: 'mute', category: 'group', description: 'Ignore non-admin bot commands in group', groupOnly: true, adminOnly: true, async run(ctx) { ctx.groupSettings.muted = true; await db.save(); await ctx.reply('Bot commands muted for non-admins in this group.'); } });
registerCommand({ name: 'unmute', category: 'group', description: 'Unmute bot commands in group', groupOnly: true, adminOnly: true, async run(ctx) { ctx.groupSettings.muted = false; await db.save(); await ctx.reply('Bot commands unmuted.'); } });

registerCommand({
  name: 'warn', category: 'group', description: 'Warn a member', groupOnly: true, adminOnly: true,
  async run(ctx) {
    const target = targetJidFromMessage(ctx.msg, ctx.args);
    if (!target) return ctx.reply('Mention/reply to a member.');
    const key = db.warningKey(ctx.sessionId, ctx.chat, target);
    db.data.warnings[key] = (db.data.warnings[key] || 0) + 1;
    await db.save();
    await ctx.reply(`Warning for @${target.split('@')[0]}: ${db.data.warnings[key]}/3`, { mentions: [target] });
  }
});

registerCommand({
  name: 'warnings', category: 'group', description: 'Check member warnings', groupOnly: true,
  async run(ctx) {
    const target = targetJidFromMessage(ctx.msg, ctx.args) || ctx.sender;
    const count = db.data.warnings[db.warningKey(ctx.sessionId, ctx.chat, target)] || 0;
    await ctx.reply(`@${target.split('@')[0]} has ${count} warning(s).`, { mentions: [target] });
  }
});

registerCommand({
  name: 'clearwarn', category: 'group', description: 'Clear member warnings', groupOnly: true, adminOnly: true,
  async run(ctx) {
    const target = targetJidFromMessage(ctx.msg, ctx.args);
    if (!target) return ctx.reply('Mention/reply to a member.');
    delete db.data.warnings[db.warningKey(ctx.sessionId, ctx.chat, target)];
    await db.save();
    await ctx.reply('Warnings cleared.');
  }
});

registerCommand({
  name: 'disablecmd', category: 'group', description: 'Disable a command in this group', groupOnly: true, adminOnly: true,
  async run(ctx) {
    const name = String(ctx.args[0] || '').toLowerCase();
    if (!name) return ctx.reply(`Usage: ${ctx.prefix}disablecmd joke`);
    if (!ctx.groupSettings.disabledCommands.includes(name)) ctx.groupSettings.disabledCommands.push(name);
    await db.save();
    await ctx.reply(`${name} disabled in this group.`);
  }
});

registerCommand({
  name: 'enablecmd', category: 'group', description: 'Enable a command in this group', groupOnly: true, adminOnly: true,
  async run(ctx) {
    const name = String(ctx.args[0] || '').toLowerCase();
    ctx.groupSettings.disabledCommands = ctx.groupSettings.disabledCommands.filter((v) => v !== name);
    await db.save();
    await ctx.reply(`${name || 'Command'} enabled in this group.`);
  }
});

registerCommand({
  name: 'lockinfo', category: 'group', description: 'Allow only admins to edit group info', groupOnly: true, adminOnly: true, botAdminRequired: true,
  async run(ctx) { await ctx.sock.groupSettingUpdate(ctx.chat, 'locked'); await ctx.reply('Group info editing locked to admins.'); }
});

registerCommand({
  name: 'unlockinfo', category: 'group', description: 'Allow members to edit group info', groupOnly: true, adminOnly: true, botAdminRequired: true,
  async run(ctx) { await ctx.sock.groupSettingUpdate(ctx.chat, 'unlocked'); await ctx.reply('Group info editing unlocked.'); }
});

registerCommand({
  name: 'pending', aliases: ['joinrequests'], category: 'group', description: 'List pending join requests', groupOnly: true, adminOnly: true, botAdminRequired: true,
  async run(ctx) {
    if (typeof ctx.sock.groupRequestParticipantsList !== 'function') throw new Error('Join-request API is unavailable in this Baileys version.');
    const rows = await ctx.sock.groupRequestParticipantsList(ctx.chat);
    if (!rows?.length) return ctx.reply('No pending join requests.');
    const jids = rows.slice(0, 50).map((r) => cleanJid(r.jid || r.id || '')).filter(Boolean);
    await ctx.send({ text: jids.map((jid, i) => `${i + 1}. @${jid.split('@')[0]}`).join('\n'), mentions: jids }, { quoted: ctx.msg });
  }
});

registerCommand({
  name: 'approve', category: 'group', description: 'Approve a pending join request', groupOnly: true, adminOnly: true, botAdminRequired: true,
  async run(ctx) {
    if (typeof ctx.sock.groupRequestParticipantsUpdate !== 'function') throw new Error('Join-request API is unavailable in this Baileys version.');
    const target = targetJidFromMessage(ctx.msg, ctx.args);
    if (!target) return ctx.reply('Provide the pending member number, e.g. approve 923001234567.');
    await ctx.sock.groupRequestParticipantsUpdate(ctx.chat, [target], 'approve');
    await ctx.reply(`Approved @${target.split('@')[0]}.`, { mentions: [target] });
  }
});

registerCommand({
  name: 'reject', category: 'group', description: 'Reject a pending join request', groupOnly: true, adminOnly: true, botAdminRequired: true,
  async run(ctx) {
    if (typeof ctx.sock.groupRequestParticipantsUpdate !== 'function') throw new Error('Join-request API is unavailable in this Baileys version.');
    const target = targetJidFromMessage(ctx.msg, ctx.args);
    if (!target) return ctx.reply('Provide the pending member number, e.g. reject 923001234567.');
    await ctx.sock.groupRequestParticipantsUpdate(ctx.chat, [target], 'reject');
    await ctx.reply(`Rejected @${target.split('@')[0]}.`, { mentions: [target] });
  }
});

registerCommand({
  name: 'setrules', category: 'group', description: 'Set saved group rules', groupOnly: true, adminOnly: true, usage: 'setrules Rule 1...',
  async run(ctx) {
    const text = ctx.argText.trim();
    if (!text || text.length > 2500) return ctx.reply(`Usage: ${ctx.prefix}setrules Your group rules`);
    ctx.groupSettings.rules = text;
    await db.save();
    await ctx.reply('Group rules saved.');
  }
});

registerCommand({
  name: 'rules', category: 'group', description: 'Show saved group rules', groupOnly: true,
  async run(ctx) { await ctx.reply(ctx.groupSettings.rules || 'No group rules have been saved yet.'); }
});

registerCommand({
  name: 'clearrules', category: 'group', description: 'Clear saved group rules', groupOnly: true, adminOnly: true,
  async run(ctx) { ctx.groupSettings.rules = ''; await db.save(); await ctx.reply('Group rules cleared.'); }
});

registerCommand({
  name: 'setwelcome', category: 'group', description: 'Set a custom welcome message', groupOnly: true, adminOnly: true, usage: 'setwelcome Welcome {user} to {group}',
  async run(ctx) {
    const text = ctx.argText.trim();
    if (!text || text.length > 1200) return ctx.reply(`Usage: ${ctx.prefix}setwelcome Welcome {user} to {group}`);
    ctx.groupSettings.welcomeText = text;
    await db.save();
    await ctx.reply('Custom welcome message saved. Use {user}, {group}, {count}.');
  }
});

registerCommand({
  name: 'setgoodbye', category: 'group', description: 'Set a custom goodbye message', groupOnly: true, adminOnly: true, usage: 'setgoodbye Goodbye {user}',
  async run(ctx) {
    const text = ctx.argText.trim();
    if (!text || text.length > 1200) return ctx.reply(`Usage: ${ctx.prefix}setgoodbye Goodbye {user}`);
    ctx.groupSettings.goodbyeText = text;
    await db.save();
    await ctx.reply('Custom goodbye message saved. Use {user}, {group}, {count}.');
  }
});

registerCommand({
  name: 'groupowner', category: 'group', description: 'Show the detected group owner', groupOnly: true,
  async run(ctx) {
    const owner = cleanJid(ctx.metadata?.ownerPn || ctx.metadata?.owner || participantPreferredJid(ctx.metadata?.participants?.find((p) => p.admin === 'superadmin')) || '');
    if (!owner) return ctx.reply('Group owner is not available in metadata.');
    await ctx.reply(`Group owner: @${owner.split('@')[0]}`, { mentions: [owner] });
  }
});

registerCommand({ name: 'membercount', aliases: ['members'], category: 'group', description: 'Show group member count', groupOnly: true, async run(ctx) { await ctx.reply(`Members: ${ctx.metadata?.participants?.length || 0}`); } });
registerCommand({ name: 'groupid', category: 'group', description: 'Show this group JID', groupOnly: true, async run(ctx) { await ctx.reply(ctx.chat); } });
registerCommand({
  name: 'groupsettings', aliases: ['gsettings'], category: 'group', description: 'Show local A-X-HK settings for this group', groupOnly: true,
  async run(ctx) {
    await ctx.reply([
      `Welcome: ${ctx.groupSettings.welcome ? 'ON' : 'OFF'}`,
      `Goodbye: ${ctx.groupSettings.goodbye ? 'ON' : 'OFF'}`,
      `Anti-link: ${ctx.groupSettings.antiLink ? 'ON' : 'OFF'} (${ctx.groupSettings.linkAction || 'delete'})`,
      `Anti-bad: ${ctx.groupSettings.antiBad ? 'ON' : 'OFF'} (${ctx.groupSettings.badWords?.length || 0} words)`,
      `Group anti-delete owner log: ${ctx.groupSettings.antiDelete ? 'ON' : 'OFF'}`,
      `Admin events: ${ctx.groupSettings.adminEvents ? 'ON' : 'OFF'}`,
      `Bot muted: ${ctx.groupSettings.muted ? 'YES' : 'NO'}`,
      `Disabled commands: ${ctx.groupSettings.disabledCommands?.length || 0}`,
      `Rules saved: ${ctx.groupSettings.rules ? 'YES' : 'NO'}`
    ].join('\n'));
  }
});
