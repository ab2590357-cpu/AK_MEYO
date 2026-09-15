import fs from 'node:fs/promises';
import path from 'node:path';
import { registerCommand, allCommands, getCommand } from '../../lib/core/registry.js';
import { db } from '../../lib/core/database.js';
import { config, ownerJid } from '../../lib/config.js';
import { ensureMediaDownloader } from '../../lib/services/media-downloader.js';
import { adminAuth } from '../../lib/services/admin-auth.js';
import { listBackups, runBackup } from '../../lib/services/backup.js';
import { permissionLabel, safetySummary } from '../../lib/services/safety-control.js';

const onValues = new Set(['on', 'true', 'yes', '1', 'enable', 'enabled']);
const offValues = new Set(['off', 'false', 'no', '0', 'disable', 'disabled']);
const safe = (value = '', max = 1200) => String(value || '').replace(/[\r\t]+/g, ' ').trim().slice(0, max);
const state = (value) => value ? 'ON ✅' : 'OFF ❌';
const fmtBytes = (n) => {
  n = Number(n) || 0;
  const u = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i += 1; }
  return `${n.toFixed(i ? 1 : 0)} ${u[i]}`;
};

function box(title, rows, icon = '🛡️') {
  return [`╭━━━〔 ${icon} ${title} ${icon} 〕━━━╮`, ...rows.filter(Boolean), '╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯'].join('\n');
}
function parseToggle(ctx, key, label) {
  const v = String(ctx.args[0] || '').toLowerCase();
  if (!onValues.has(v) && !offValues.has(v)) return ctx.reply(`Usage: ${ctx.prefix}${ctx.command.name} on|off`);
  ctx.sessionSettings[key] = onValues.has(v);
  return db.save().then(() => ctx.reply(`${box(label.toUpperCase(), [`┃ STATUS ${state(ctx.sessionSettings[key])}`], '⚙️')}\n\n${config.footerMessage}`));
}
function numberArg(ctx, fallback, min, max) {
  const n = Number(ctx.args[0]);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}
function policyText(policy) {
  if (!policy) return 'default';
  return String(policy).toUpperCase();
}

registerCommand({
  name: 'safetycenter', aliases: ['safemode', 'controlcenter', 'banmode'], category: 'security', ownerOnly: true,
  description: 'Show Premium Safety Control Center status', cooldown: 2,
  async run(ctx) {
    const s = safetySummary(ctx.sessionSettings);
    await ctx.reply([
      box('A-X-HK SAFETY CONTROL CENTER', [
        `┃ Ban Protection     ${state(s.banProtection)}`,
        `┃ Daily Cmd Limit    ${s.dailyCommandLimit}`,
        `┃ High-Risk Limit    ${s.highRiskDailyLimit}`,
        `┃ Custom Perms       ${s.commandPermissions}`,
        `┃ Auto Backup        ${state(ctx.sessionSettings.autoBackup !== false)}`,
        `┃ Owner Alerts       ${state(ctx.sessionSettings.ownerAlerts !== false)}`
      ], '🛡️'),
      '',
      box('QUICK COMMANDS', [
        `┃ ${ctx.prefix}banprotect on/off`,
        `┃ ${ctx.prefix}dailycmdlimit 80`,
        `┃ ${ctx.prefix}risklimit 8`,
        `┃ ${ctx.prefix}cmdperm play public`,
        `┃ ${ctx.prefix}commandlogs`,
        `┃ ${ctx.prefix}backupnow`,
        `┃ ${ctx.prefix}dlcheck`
      ], '⚙️'),
      '', config.footerMessage
    ].join('\n'));
  }
});

registerCommand({ name: 'banprotect', aliases: ['banprotection', 'safeauto'], category: 'security', ownerOnly: true, description: 'Toggle ban-protection cooldowns and daily limits', usage: 'banprotect on|off', cooldown: 2, async run(ctx) { return parseToggle(ctx, 'banProtection', 'Ban protection'); }});
registerCommand({ name: 'dailycmdlimit', aliases: ['cmdlimit', 'dailycommands'], category: 'security', ownerOnly: true, description: 'Set daily command limit per public user', usage: 'dailycmdlimit 80', cooldown: 2, async run(ctx) { ctx.sessionSettings.dailyCommandLimit = numberArg(ctx, 80, 10, 1000); await db.save(); await ctx.reply(`✅ Daily command limit saved: ${ctx.sessionSettings.dailyCommandLimit}`); }});
registerCommand({ name: 'risklimit', aliases: ['highrisklimit', 'spamlimit'], category: 'security', ownerOnly: true, description: 'Set daily high-risk command limit per user', usage: 'risklimit 8', cooldown: 2, async run(ctx) { ctx.sessionSettings.highRiskDailyLimit = numberArg(ctx, 8, 1, 100); await db.save(); await ctx.reply(`✅ High-risk daily limit saved: ${ctx.sessionSettings.highRiskDailyLimit}`); }});
registerCommand({ name: 'safetylimits', aliases: ['limits', 'limitstatus'], category: 'security', ownerOnly: true, description: 'Show current safety limits and today usage rows', cooldown: 2, async run(ctx) {
  const prefix = `${new Date().toISOString().slice(0, 10)}::${ctx.sessionId}::`;
  const rows = Object.values(db.data.safetyDaily || {}).filter((_, i) => Object.keys(db.data.safetyDaily || {})[i]?.startsWith(prefix));
  const top = rows.sort((a, b) => (b.commands || 0) - (a.commands || 0)).slice(0, 8);
  const s = safetySummary(ctx.sessionSettings);
  await ctx.reply([
    box('SAFETY LIMITS', [`┃ Ban Protection  ${state(s.banProtection)}`, `┃ Daily Limit     ${s.dailyCommandLimit}`, `┃ High-Risk Limit ${s.highRiskDailyLimit}`, `┃ Active Users    ${rows.length}`], '🧯'),
    '', top.length ? top.map((r, i) => `${i + 1}. ${r.commands || 0} cmds • ${r.highRisk || 0} risky`).join('\n') : 'No public usage rows yet.',
    '', config.footerMessage
  ].join('\n'));
}});

registerCommand({
  name: 'cmdperm', aliases: ['commandperm', 'setcmdperm', 'permcmd'], category: 'owner', ownerOnly: true,
  description: 'Set command permission override', usage: 'cmdperm play public|admin|owner|group|private|disable|reset', cooldown: 2,
  async run(ctx) {
    const target = String(ctx.args[0] || '').toLowerCase().replace(/^[.]/, '');
    const policy = String(ctx.args[1] || '').toLowerCase();
    const cmd = getCommand(target);
    if (!cmd) return ctx.reply(`Command not found. Use ${ctx.prefix}searchcmd ${target || '<name>'}`);
    const allowed = ['public', 'admin', 'owner', 'group', 'private', 'disable', 'disabled', 'reset', 'default'];
    if (!allowed.includes(policy)) return ctx.reply(`Usage: ${ctx.prefix}cmdperm ${cmd.name} public|admin|owner|group|private|disable|reset`);
    ctx.sessionSettings.commandPermissions ||= {};
    if (policy === 'reset' || policy === 'default') delete ctx.sessionSettings.commandPermissions[cmd.name];
    else ctx.sessionSettings.commandPermissions[cmd.name] = policy === 'disable' ? 'disabled' : policy;
    await db.save();
    await ctx.reply(`${box('COMMAND PERMISSION', [`┃ Command ${ctx.prefix}${cmd.name}`, `┃ Default ${permissionLabel(cmd)}`, `┃ Override ${policyText(ctx.sessionSettings.commandPermissions[cmd.name])}`], '🔐')}\n\n${config.footerMessage}`);
  }
});

registerCommand({ name: 'cmdperms', aliases: ['commandperms', 'permlist'], category: 'owner', ownerOnly: true, description: 'List command permission overrides', cooldown: 2, async run(ctx) {
  const rows = Object.entries(ctx.sessionSettings.commandPermissions || {}).sort();
  await ctx.reply(rows.length ? `${box('COMMAND PERMISSIONS', rows.map(([name, policy]) => `┃ ${ctx.prefix}${name}  ${policyText(policy)}`), '🔐')}\n\n${config.footerMessage}` : 'No custom command permissions saved.');
}});

registerCommand({ name: 'commandinfo', aliases: ['cmdinfo', 'helpcommand', 'howcmd'], category: 'system', description: 'Show detailed help for one command', usage: 'commandinfo play', cooldown: 2, async run(ctx) {
  const q = String(ctx.args[0] || '').toLowerCase().replace(/^[.]/, '');
  const cmd = getCommand(q);
  if (!cmd) return ctx.reply(`Command not found. Try ${ctx.prefix}searchcmd ${q || '<word>'}`);
  const override = ctx.sessionSettings.commandPermissions?.[cmd.name] || 'default';
  await ctx.reply([
    box('COMMAND INFO', [
      `┃ Command   ${ctx.prefix}${cmd.name}`,
      `┃ Category  ${cmd.category || 'general'}`,
      `┃ Access    ${permissionLabel(cmd)}`,
      `┃ Override  ${policyText(override)}`,
      `┃ Cooldown  ${cmd.cooldown || 0}s`,
      cmd.usage ? `┃ Usage     ${ctx.prefix}${cmd.usage}` : `┃ Usage     ${ctx.prefix}${cmd.name}`
    ], 'ℹ️'),
    '',
    `📝 ${cmd.description || 'No description saved.'}`,
    cmd.aliases?.length ? `\n🔁 Aliases: ${cmd.aliases.map((a) => `${ctx.prefix}${a}`).join(', ')}` : '',
    '', config.footerMessage
  ].join('\n'));
}});

registerCommand({ name: 'commandlogs', aliases: ['cmdlogs', 'logs'], category: 'owner', ownerOnly: true, description: 'Show recent command logs and blocked attempts', cooldown: 3, async run(ctx) {
  const rows = (db.data.commandAudit || db.data.activity || []).slice(-20).reverse();
  await ctx.reply(rows.length ? [
    box('RECENT COMMAND LOGS', rows.slice(0, 12).map((r, i) => `┃ ${String(i + 1).padStart(2, '0')}. ${r.type || (r.ok ? 'ok' : 'err')} .${r.command} • ${r.sender || '-'}`), '🧾'),
    '', config.footerMessage
  ].join('\n') : 'No command logs yet.');
}});
registerCommand({ name: 'cmdstats', aliases: ['commandstats'], category: 'owner', ownerOnly: true, description: 'Show command success/error stats', cooldown: 3, async run(ctx) {
  const m = db.data.metrics || {};
  const today = m.daily?.[new Date().toISOString().slice(0, 10)] || {};
  await ctx.reply(`${box('COMMAND STATS', [`┃ Total Commands ${m.commandsRun || 0}`, `┃ Errors         ${m.commandErrors || 0}`, `┃ Today Commands ${today.commands || 0}`, `┃ Today Errors   ${today.errors || 0}`, `┃ Audit Rows     ${(db.data.commandAudit || []).length}`], '📊')}\n\n${config.footerMessage}`);
}});
registerCommand({ name: 'topcommands', aliases: ['topcmds'], category: 'owner', ownerOnly: true, description: 'Show most used commands', cooldown: 3, async run(ctx) {
  const top = Object.entries(db.data.metrics?.commandsByName || {}).sort((a, b) => b[1] - a[1]).slice(0, 15);
  await ctx.reply(top.length ? `${box('TOP COMMANDS', top.map(([name, count], i) => `┃ ${i + 1}. ${ctx.prefix}${name} • ${count}`), '🏆')}\n\n${config.footerMessage}` : 'No command stats yet.');
}});

registerCommand({ name: 'groupcontrol', aliases: ['gcontrol', 'groupcenter', 'groupguardpanel'], category: 'group', groupOnly: true, adminOnly: true, description: 'Premium group control panel', cooldown: 3, async run(ctx) {
  const g = ctx.groupSettings;
  await ctx.reply([
    box('GROUP CONTROL PANEL', [
      `┃ Group      ${safe(ctx.metadata?.subject || 'Group', 42)}`,
      `┃ Welcome    ${state(g.welcome)}`,
      `┃ Goodbye    ${state(g.goodbye)}`,
      `┃ AdminEvents ${state(g.adminEvents)}`,
      `┃ AntiLink   ${state(g.antiLink)} (${g.linkAction || 'delete'})`,
      `┃ AntiBad    ${state(g.antiBad)} (${g.badWords?.length || 0} words)`,
      `┃ AntiDelete ${state(g.antiDelete)}`,
      `┃ AntiSpam   ${state(g.antiSpam !== false)}`
    ], '👥'),
    '',
    box('GROUP COMMANDS', [
      `┃ ${ctx.prefix}welcome on/off`,
      `┃ ${ctx.prefix}goodbye on/off`,
      `┃ ${ctx.prefix}adminevents on/off`,
      `┃ ${ctx.prefix}antilink on`,
      `┃ ${ctx.prefix}linkaction warn/delete/kick`,
      `┃ ${ctx.prefix}antibad on`,
      `┃ ${ctx.prefix}badword add word`,
      `┃ ${ctx.prefix}groupguard on/off`
    ], '⚙️'),
    '', config.footerMessage
  ].join('\n'));
}});
registerCommand({ name: 'groupguard', aliases: ['antispamguard', 'floodguard'], category: 'group', groupOnly: true, adminOnly: true, description: 'Toggle group anti-spam/anti-flood guard', usage: 'groupguard on|off', cooldown: 2, async run(ctx) {
  const v = String(ctx.args[0] || '').toLowerCase();
  if (!onValues.has(v) && !offValues.has(v)) return ctx.reply(`Usage: ${ctx.prefix}groupguard on|off`);
  ctx.groupSettings.antiSpam = onValues.has(v);
  ctx.groupSettings.antiFlood = onValues.has(v);
  await db.save();
  await ctx.reply(`${box('GROUP SPAM GUARD', [`┃ STATUS ${state(ctx.groupSettings.antiSpam)}`], '🧯')}\n\n${config.footerMessage}`);
}});

registerCommand({ name: 'alertcenter', aliases: ['owneralertcenter'], category: 'owner', ownerOnly: true, description: 'Show owner alert center status', cooldown: 2, async run(ctx) {
  await ctx.reply(`${box('OWNER ALERT CENTER', [`┃ Alerts       ${state(ctx.sessionSettings.ownerAlerts !== false)}`, `┃ Runtime      watchdog enabled`, `┃ Memory/Disk   smart alerts enabled`, `┃ Dashboard    ${state(ctx.sessionSettings.dashboardSecurityAlerts !== false)}`], '🔔')}\n\n${ctx.prefix}owneralerts on/off\n${ctx.prefix}alerttest\n\n${config.footerMessage}`);
}});
registerCommand({ name: 'alerttest', aliases: ['testalert'], category: 'owner', ownerOnly: true, description: 'Send a test owner inbox alert', cooldown: 10, async run(ctx) {
  const target = ownerJid();
  if (!target) return ctx.reply('Owner number is not configured.');
  await ctx.sock.sendMessage(target, { text: `🔔 *A-X-HK TEST ALERT*\n\nOwner alert center is working.\nSession: ${ctx.sessionLabel}\n\n${config.footerMessage}` });
  await ctx.reply('✅ Test alert sent to owner inbox.');
}});

registerCommand({ name: 'backupnow', aliases: ['localbackup', 'makebackup'], category: 'owner', ownerOnly: true, description: 'Create a local /data backup folder now', cooldown: 10, async run(ctx) {
  const row = await runBackup('manual-command');
  await ctx.reply(`${box('LOCAL BACKUP CREATED', [`┃ Version ${row.version}`, `┃ Path    ${row.path}`, `┃ Time    ${row.at}`], '💾')}\n\n${config.footerMessage}`);
}});
registerCommand({ name: 'backups', aliases: ['backuplist'], category: 'owner', ownerOnly: true, description: 'List recent local /data backups', cooldown: 3, async run(ctx) {
  const rows = await listBackups(10);
  await ctx.reply(rows.length ? `${box('RECENT BACKUPS', rows.map((r, i) => `┃ ${i + 1}. ${String(r.at).slice(0, 19)} • ${r.reason}`), '💾')}\n\n${config.footerMessage}` : 'No local backups found yet. Use .backupnow');
}});
registerCommand({ name: 'autobackup', aliases: ['backupauto'], category: 'owner', ownerOnly: true, description: 'Toggle automatic local /data backups', usage: 'autobackup on|off', cooldown: 2, async run(ctx) { return parseToggle(ctx, 'autoBackup', 'Auto backup'); }});
registerCommand({ name: 'backupinterval', aliases: ['backupdelay'], category: 'owner', ownerOnly: true, description: 'Set auto-backup interval in hours', usage: 'backupinterval 6', cooldown: 2, async run(ctx) { ctx.sessionSettings.backupIntervalHours = numberArg(ctx, 6, 1, 72); await db.save(); await ctx.reply(`✅ Auto-backup interval: ${ctx.sessionSettings.backupIntervalHours}h`); }});
registerCommand({ name: 'backupkeep', aliases: ['keepbackups'], category: 'owner', ownerOnly: true, description: 'Set how many local backups to keep', usage: 'backupkeep 10', cooldown: 2, async run(ctx) { ctx.sessionSettings.backupKeep = numberArg(ctx, 10, 3, 50); await db.save(); await ctx.reply(`✅ Backups to keep: ${ctx.sessionSettings.backupKeep}`); }});

registerCommand({ name: 'dlcheck', aliases: ['downloadercheck', 'downloadcheck'], category: 'download', ownerOnly: true, description: 'Check public downloader engines and package availability', cooldown: 8, async run(ctx) {
  const checks = [];
  try { const tool = await ensureMediaDownloader(); const st = await fs.stat(tool); checks.push(`┃ yt-dlp engine ✅ ${fmtBytes(st.size)}`); } catch (err) { checks.push(`┃ yt-dlp engine ❌ ${safe(err?.message || err, 80)}`); }
  try { await import('megajs'); checks.push('┃ MEGA package ✅'); } catch { checks.push('┃ MEGA package ❌'); }
  try { await import('pdf-lib'); checks.push('┃ PDF package ✅'); } catch { checks.push('┃ PDF package ❌'); }
  checks.push(`┃ Platform ${process.platform}`);
  checks.push(`┃ Node     ${process.version}`);
  await ctx.reply(`${box('DOWNLOADER HEALTH CHECK', checks, '📥')}\n\n${config.footerMessage}`);
}});

registerCommand({ name: 'dashboardsecurity', aliases: ['dashsecurity', 'dashboardguard', 'securitypanel'], category: 'security', ownerOnly: true, description: 'Show dashboard security and login protection status', cooldown: 3, async run(ctx) {
  await ctx.reply(`${box('DASHBOARD SECURITY', [`┃ Password Setup   ${state(adminAuth.isSetup())}`, `┃ Login Rate Limit  ON ✅`, `┃ Signed Cookie     ON ✅`, `┃ Legacy Token      ${config.dashboardToken ? 'ENABLED ⚠️' : 'OFF ✅'}`, `┃ Public /link      isolated ✅`, `┃ Security Alerts   ${state(ctx.sessionSettings.dashboardSecurityAlerts !== false)}`], '🔒')}\n\n${ctx.prefix}dashboardalerts on/off\n\n${config.footerMessage}`);
}});
registerCommand({ name: 'dashboardalerts', aliases: ['dashalerts'], category: 'security', ownerOnly: true, description: 'Toggle dashboard security alert preference', usage: 'dashboardalerts on|off', cooldown: 2, async run(ctx) { return parseToggle(ctx, 'dashboardSecurityAlerts', 'Dashboard security alerts'); }});

registerCommand({ name: 'permissionmenu', aliases: ['permmenu'], category: 'owner', ownerOnly: true, description: 'Show quick examples for command permissions', cooldown: 2, async run(ctx) {
  await ctx.reply([
    box('PERMISSION MENU', [
      `┃ ${ctx.prefix}cmdperm play public`,
      `┃ ${ctx.prefix}cmdperm tagall admin`,
      `┃ ${ctx.prefix}cmdperm gcstatus owner`,
      `┃ ${ctx.prefix}cmdperm img disable`,
      `┃ ${ctx.prefix}cmdperm img reset`,
      `┃ ${ctx.prefix}cmdperms`
    ], '🔐'),
    '', config.footerMessage
  ].join('\n'));
}});

import { cleanupStorage, diskUsage } from '../../lib/services/storage-guard.js';

registerCommand({ name: 'diskstatus', aliases: ['storage', 'storagestatus', 'volumestatus'], category: 'owner', ownerOnly: true, description: 'Show Railway /data storage health', cooldown: 3, async run(ctx) {
  const u = await diskUsage();
  const pct = u.total ? Math.round((u.free / u.total) * 100) : 0;
  await ctx.reply(`${box('A-X-HK STORAGE HEALTH', [`┃ Used   ${u.usedText}`, `┃ Free   ${u.freeText}`, `┃ Total  ${u.totalText}`, `┃ Free % ${pct}%`, `┃ Safe   ${pct >= 12 ? 'YES ✅' : 'LOW ⚠️'}`], '💽')}\n\nIf low, run ${ctx.prefix}storageclean\n\n${config.footerMessage}`);
}});

registerCommand({ name: 'storageclean', aliases: ['diskclean', 'cleanstorage', 'fixdisk', 'cleandata'], category: 'owner', ownerOnly: true, description: 'Free disk space without deleting WhatsApp sessions', cooldown: 15, async run(ctx) {
  const result = await cleanupStorage({ aggressive: true, reason: 'owner-command', backupKeep: 1 });
  const after = result.after || await diskUsage();
  await db.save();
  await ctx.reply(`${box('STORAGE CLEANUP DONE', [`┃ Removed items ${result.removed}`, `┃ Freed approx   ${result.freedText}`, `┃ Free now       ${after.freeText}`, `┃ Total          ${after.totalText}`, `┃ Sessions       NOT DELETED ✅`], '🧹')}\n\n${config.footerMessage}`);
}});
