import test from 'node:test';
import assert from 'node:assert/strict';
import { patchDispatcherSource } from '../scripts/apply-away-policy.mjs';
import { enforceAwayPolicy } from '../lib/core/database.js';
import { AUTO_REPLY_TEXT, normalizeAwayText, shouldSendAwayReply } from '../lib/core/auto-reply-policy.js';

test('dispatcher away policy validates helper-based owner activity suppression', () => {
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
    'export async function dispatchMessage(sock, msg, runtime = {}) {',
    '  applyAutoFeatures(ctx, sock, msg);',
    '  if (!ctx.text) return;',
    '',
    '  if (await moderation(ctx)) return;',
    '  rememberOwnerActivity(ctx);',
    '}'
  ].join('\n');

  const patched = patchDispatcherSource(source);

  assert.match(patched, /shouldSendAwayReply/);
  assert.match(patched, /ownerActivityAt/);
  assert.match(patched, /rememberOwnerActivity\(ctx\)/);
  assert.doesNotMatch(patched, /AFK|afk\?\.enabled|ctx\.sessionSettings\.afk/);
  assert.doesNotMatch(patched, /30 \* 60 \* 1000/);
});

test('away auto reply still runs for non-text messages', () => {
  const source = [
    "import { shouldSendAwayReply } from './auto-reply-policy.js';",
    'const ownerActivityAt = new Map();',
    'function rememberOwnerActivity(ctx) { ownerActivityAt.set(`${ctx.sessionId}:${ctx.chat}`, Date.now()); }',
    'function maybeDirectAutomation(ctx) { const text = normalizeAwayText(away?.text); shouldSendAwayReply({}); }',
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

test('session away policy forces selected auto response on and AFK off', () => {
  const patched = enforceAwayPolicy({
    away: { enabled: false, text: 'I am currently away. I will reply when I am available.' },
    awayCooldownHours: 1,
    afk: { enabled: true, reason: 'old afk' }
  });

  assert.equal(patched.away.enabled, true);
  assert.equal(patched.away.text, AUTO_REPLY_TEXT);
  assert.equal(patched.awayCooldownHours, 4);
  assert.equal(patched.afk.enabled, false);
  assert.equal(patched.afk.reason, '');
});

test('normalizeAwayText always returns selected mobile-safe text', () => {
  assert.equal(normalizeAwayText(''), AUTO_REPLY_TEXT);
  assert.equal(normalizeAwayText('Custom busy reply'), AUTO_REPLY_TEXT);
  assert.equal(normalizeAwayText('I am currently away. I will reply when I am available.'), AUTO_REPLY_TEXT);
});

test('selected auto reply text is premium and stays mobile-safe', () => {
  const lines = AUTO_REPLY_TEXT.split('\n').filter(Boolean);
  assert.deepEqual(lines, [
    '╭─〔 ⚡ 𝐀_𝐗_𝐇𝐊 𝐑𝐄𝐏𝐋𝐘 〕─╮',
    '┃ Thank you for your message.',
    '┃ Owner is busy right now.',
    '┃ Your message is received.',
    '┃ He will reply soon.',
    '╰──────────────────╯',
    '© 𝐏𝐎𝐖𝐄𝐑𝐄𝐃 𝐁𝐘 𝐀_𝐗_𝐇𝐊'
  ]);
  assert.ok(lines.every((line) => Array.from(line).length <= 34));
});

test('session away policy provides mobile-safe selected default text', () => {
  const patched = enforceAwayPolicy({ away: { enabled: false, text: '' }, afk: { enabled: true, reason: 'old' } });

  assert.equal(patched.away.enabled, true);
  assert.equal(patched.away.text, AUTO_REPLY_TEXT);
  assert.equal(patched.awayCooldownHours, 4);
  assert.equal(patched.afk.enabled, false);
});

test('away reply policy blocks repeats while owner is active and allows group mentions only', () => {
  const now = 10_000_000;
  const fourHours = 4 * 60 * 60 * 1000;
  const away = { enabled: true, text: AUTO_REPLY_TEXT };

  assert.equal(shouldSendAwayReply({ away, now, cooldownMs: fourHours }), true);
  assert.equal(shouldSendAwayReply({ away, now, ownerLastActiveAt: now - 60_000, cooldownMs: fourHours }), false);
  assert.equal(shouldSendAwayReply({ away, isGroup: true, wasMentioned: false, now, cooldownMs: fourHours }), false);
  assert.equal(shouldSendAwayReply({ away, isGroup: true, wasMentioned: true, now, cooldownMs: fourHours }), true);
});
