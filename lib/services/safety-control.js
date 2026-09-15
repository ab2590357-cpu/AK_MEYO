import { db } from '../core/database.js';

const HIGH_RISK_COMMANDS = new Set([
  'tagall', 'hidetag', 'gcstatus', 'statussave', 'statusreply', 'statusreact',
  'autovoice', 'autosticker', 'autoreact', 'broadcast', 'forward', 'sendall'
]);
const RISKY_CATEGORIES = new Set(['group', 'media']);

function dayKey() { return new Date().toISOString().slice(0, 10); }
function userKey(ctx) {
  const sender = String(ctx.senderNumber || ctx.sender || 'unknown').replace(/\D/g, '') || String(ctx.sender || 'unknown');
  return `${dayKey()}::${ctx.sessionId || 'main'}::${sender}`;
}
function clampNumber(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

export function isHighRiskCommand(command) {
  if (!command?.name) return false;
  return HIGH_RISK_COMMANDS.has(String(command.name).toLowerCase()) || Boolean(command.highRisk) || RISKY_CATEGORIES.has(String(command.category || '').toLowerCase()) && Number(command.cooldown || 0) >= 15;
}

export function commandPermissionState(ctx, command) {
  const name = String(command?.name || '').toLowerCase();
  const permissions = ctx.sessionSettings?.commandPermissions || {};
  const policy = String(permissions[name] || '').toLowerCase();
  if (!policy) return { allowed: true, policy: 'default' };
  if (ctx.isOwner) return { allowed: true, policy };
  if (policy === 'disabled' || policy === 'disable' || policy === 'off') return { allowed: false, reason: 'command disabled by owner', policy: 'disabled' };
  if (policy === 'owner' || policy === 'owneronly') return { allowed: false, reason: 'owner only permission policy', policy };
  if (policy === 'admin' || policy === 'adminonly') {
    if (!ctx.isGroup || !ctx.isAdmin) return { allowed: false, reason: 'admin only permission policy', policy };
  }
  if (policy === 'group' || policy === 'grouponly') {
    if (!ctx.isGroup) return { allowed: false, reason: 'group only permission policy', policy };
  }
  if (policy === 'private' || policy === 'inbox') {
    if (ctx.isGroup) return { allowed: false, reason: 'inbox only permission policy', policy };
  }
  return { allowed: true, policy };
}

export function safetyLimitState(ctx, command) {
  if (ctx.isOwner || ctx.isLinkedOwnerAction) return { allowed: true, reason: 'owner bypass' };
  const settings = ctx.sessionSettings || {};
  if (settings.banProtection === false) return { allowed: true, reason: 'ban protection off' };

  db.data.safetyDaily ||= {};
  const key = userKey(ctx);
  const row = db.data.safetyDaily[key] ||= { day: dayKey(), commands: 0, highRisk: 0, byCommand: {} };
  row.commands += 1;
  row.byCommand ||= {};
  const name = String(command?.name || 'unknown').toLowerCase();
  row.byCommand[name] = (row.byCommand[name] || 0) + 1;
  const risky = isHighRiskCommand(command);
  if (risky) row.highRisk += 1;

  // Keep only recent days to stop the safety table growing forever.
  const keepDays = new Set([dayKey()]);
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  keepDays.add(yesterday);
  for (const existingKey of Object.keys(db.data.safetyDaily)) {
    const day = String(existingKey).split('::')[0];
    if (!keepDays.has(day)) delete db.data.safetyDaily[existingKey];
  }

  const dailyLimit = clampNumber(settings.dailyCommandLimit, 80, 10, 1000);
  const highRiskLimit = clampNumber(settings.highRiskDailyLimit, 8, 1, 100);
  if (row.commands > dailyLimit) return { allowed: false, reason: `daily command limit ${dailyLimit}`, row };
  if (risky && row.highRisk > highRiskLimit) return { allowed: false, reason: `daily high-risk limit ${highRiskLimit}`, row };
  return { allowed: true, reason: 'ok', row };
}

export function permissionLabel(command) {
  const flags = [];
  if (command?.ownerOnly) flags.push('OWNER');
  if (command?.adminOnly) flags.push('ADMIN');
  if (command?.groupOnly) flags.push('GROUP');
  if (command?.botAdminRequired) flags.push('BOT ADMIN');
  return flags.length ? flags.join(' + ') : 'PUBLIC';
}

export function safetySummary(settings = {}) {
  return {
    banProtection: settings.banProtection !== false,
    dailyCommandLimit: clampNumber(settings.dailyCommandLimit, 80, 10, 1000),
    highRiskDailyLimit: clampNumber(settings.highRiskDailyLimit, 8, 1, 100),
    commandPermissions: Object.keys(settings.commandPermissions || {}).length
  };
}
