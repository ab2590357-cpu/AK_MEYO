import test from 'node:test';
import assert from 'node:assert/strict';
import { patchDispatcherSource } from '../scripts/apply-away-policy.mjs';
import { enforceAwayPolicy } from '../lib/core/database.js';
import {
  AUTO_REPLY_TEXT,
  DEFAULT_AWAY_COOLDOWN_HOURS,
  activeReplySlot,
  normalizeAwayText,
  shouldSendAwayReply
} from '../lib/core/auto-reply-policy.js';

const officeNow = new Date('2026-01-01T16:30:00Z').getTime();
const sleepNow = new Date('2026-01-01T05:30:00Z').getTime();
const availableNow = new Date('2026-01-01T12:30:00Z').getTime();

test('dispatcher patch upgrades scheduled replies into timed AI-aware flow', () => {
  const source = [
    "import { AUTO_REPLY_TEXT, awayCooldownMs, normalizeAwayText, shouldSendAwayReply } from './auto-reply-policy.js';",
    'const ownerActivityAt = new Map();',
    'function rememberOwnerActivity(ctx) { ownerActivityAt.set(`${ctx.sessionId}:${ctx.chat}`, Date.now()); }',
    'async function maybeDirectAutomation(ctx) {',
    '  const away = ctx.sessionSettings.away;',
    '  if (shouldSendAwayReply({ ownerLastActiveAt: ownerActivityAt.get(key) || 0 })) {',
    '    const text = normalizeAwayText(away?.text) || AUTO_REPLY_TEXT;',
    '  }',
    '}',
    'function maybeAwardXp(ctx) { return ctx; }',
    'export async function dispatchMessage(sock, msg, runtime = {}) {',
    '  applyAutoFeatures(ctx, sock, msg);',
    '  if (!ctx.text) return;',
    '',
    '  if (await moderation(ctx)) return;',
    '  rememberOwnerActivity(ctx);',
    '}'
  ].join('\n');

  const patched = patchDispatcherSource(source);

  assert.match(patched, /activeReplySlot/);
  assert.match(patched, /ctx\.sessionSettings\.autoAI/);
  assert.match(patched, /You are Abdullah\\'s official AI assistant on WhatsApp/);
  assert.match(patched, /falling back to scheduled reply/);
  assert.doesNotMatch(patched, /AFK|afk\?\.enabled|ctx\.sessionSettings\.afk/);
  assert.doesNotMatch(patched, /30 \* 60 \* 1000/);
});

test('scheduled auto reply still runs for non-text messages', () => {
  const source = [
    "import { AUTO_REPLY_TEXT, awayCooldownMs, normalizeAwayText, shouldSendAwayReply } from './auto-reply-policy.js';",
    'const ownerActivityAt = new Map();',
    'function rememberOwnerActivity(ctx) { ownerActivityAt.set(`${ctx.sessionId}:${ctx.chat}`, Date.now()); }',
    'async function maybeDirectAutomation(ctx) { const text = normalizeAwayText(away?.text); shouldSendAwayReply({}); }',
    'function maybeAwardXp(ctx) { return ctx; }',
    'export async function dispatchMessage(sock, msg, runtime = {}) {',
    '  rememberOwnerActivity(ctx);',
    '  applyAutoFeatures(ctx, sock, msg);',
    '  if (!ctx.text) return;',
    '',
    '  if (await moderation(ctx)) return;',
    '}'
  ].join('\n');

  const patched = patchDispatcherSource(source);

  assert.doesNotMatch(patched, /if \(!ctx\.text\) return;/);
  assert.match(patched, /if \(!ctx\.text\) \{\n    await maybeDirectAutomation\(ctx\);\n    return;\n  \}/);
});

test('session away policy stays enabled while AFK remains disabled', () => {
  const patched = enforceAwayPolicy({
    away: { enabled: false, text: 'I am currently away. I will reply when I am available.' },
    awayCooldownHours: 1,
    afk: { enabled: true, reason: 'old afk' }
  });

  assert.equal(patched.away.enabled, true);
  assert.equal(patched.awayCooldownHours, DEFAULT_AWAY_COOLDOWN_HOURS);
  assert.equal(patched.afk.enabled, false);
  assert.equal(patched.afk.reason, '');
});

test('time slots return office, sleep, and available states', () => {
  assert.equal(activeReplySlot(officeNow, 'Asia/Karachi')?.key, 'office');
  assert.equal(activeReplySlot(sleepNow, 'Asia/Karachi')?.key, 'sleep');
  assert.equal(activeReplySlot(availableNow, 'Asia/Karachi'), null);
});

test('office and sleep text identify Abdullah AI assistant', () => {
  assert.match(AUTO_REPLY_TEXT, /Abdullah|office/i);
  assert.match(normalizeAwayText('', officeNow, 'Asia/Karachi'), /I’m Abdullah’s AI assistant/);
  assert.match(normalizeAwayText('', sleepNow, 'Asia/Karachi'), /I’m Abdullah’s AI assistant/);
  assert.match(normalizeAwayText('', officeNow, 'Asia/Karachi'), /𝐏𝐎𝐖𝐄𝐑𝐄𝐃 𝐁𝐘 𝐀𝐁𝐃𝐔𝐋𝐋𝐀𝐇_𝐗_𝐇𝐊/);
  assert.equal(normalizeAwayText('', availableNow, 'Asia/Karachi'), '');
});

test('reply policy allows unavailable time only and group mentions only', () => {
  const twentyMinutes = 20 * 60 * 1000;

  assert.equal(shouldSendAwayReply({ now: officeNow, cooldownMs: twentyMinutes, timezone: 'Asia/Karachi' }), true);
  assert.equal(shouldSendAwayReply({ now: sleepNow, cooldownMs: twentyMinutes, timezone: 'Asia/Karachi' }), true);
  assert.equal(shouldSendAwayReply({ now: availableNow, cooldownMs: twentyMinutes, timezone: 'Asia/Karachi' }), false);
  assert.equal(shouldSendAwayReply({ now: officeNow, ownerLastActiveAt: officeNow - 60_000, cooldownMs: twentyMinutes, timezone: 'Asia/Karachi' }), false);
  assert.equal(shouldSendAwayReply({ isGroup: true, wasMentioned: false, now: officeNow, cooldownMs: twentyMinutes, timezone: 'Asia/Karachi' }), false);
  assert.equal(shouldSendAwayReply({ isGroup: true, wasMentioned: true, now: officeNow, cooldownMs: twentyMinutes, timezone: 'Asia/Karachi' }), true);
});
