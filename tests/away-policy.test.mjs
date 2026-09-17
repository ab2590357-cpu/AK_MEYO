import test from 'node:test';
import assert from 'node:assert/strict';
import { patchDispatcherSource } from '../scripts/apply-away-policy.mjs';
import { enforceAwayPolicy } from '../lib/core/database.js';

test('away auto reply ignores AFK and uses a four hour cooldown', () => {
  const legacy = [
    'async function maybeDirectAutomation(ctx) {',
    '  const key = `${ctx.sessionId}:${ctx.chat}`;',
    '  const now = Date.now();',
    '  const last = autoReplyAt.get(key) || 0;',
    '  const afk = ctx.sessionSettings.afk;',
    '  const away = ctx.sessionSettings.away;',
    '',
    '  if (!ctx.isGroup && (afk?.enabled || away?.enabled) && now - last > 30 * 60 * 1000) {',
    '    autoReplyAt.set(key, now);',
    '    const text = afk?.enabled',
    "      ? `💤 AFK • ${afk.reason || 'Away for a while'}`",
    "      : `📨 ${away.text || 'I am currently away.'}`;",
    '    await ctx.reply(`${text}\\n\\n${config.footerMessage}`);',
    '    return true;',
    '  }',
    '}'
  ].join('\n');

  const patched = patchDispatcherSource(legacy);

  assert.match(patched, /away\?\.enabled/);
  assert.match(patched, /awayCooldownHours \|\| 4/);
  assert.doesNotMatch(patched, /AFK|afk\?\.enabled|ctx\.sessionSettings\.afk/);
  assert.doesNotMatch(patched, /30 \* 60 \* 1000/);
});

test('away auto reply still runs for non-text private messages', () => {
  const source = [
    'export async function dispatchMessage(sock, msg, runtime = {}) {',
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

test('session away policy forces auto response on and AFK off', () => {
  const patched = enforceAwayPolicy({
    away: { enabled: false, text: 'Custom busy reply' },
    awayCooldownHours: 1,
    afk: { enabled: true, reason: 'old afk' }
  });

  assert.equal(patched.away.enabled, true);
  assert.equal(patched.away.text, 'Custom busy reply');
  assert.equal(patched.awayCooldownHours, 4);
  assert.equal(patched.afk.enabled, false);
  assert.equal(patched.afk.reason, '');
});

test('session away policy provides default text when saved text is blank', () => {
  const patched = enforceAwayPolicy({ away: { enabled: false, text: '' }, afk: { enabled: true, reason: 'old' } });

  assert.equal(patched.away.enabled, true);
  assert.equal(patched.away.text, 'I am currently busy. I will reply as soon as I am available.');
  assert.equal(patched.awayCooldownHours, 4);
  assert.equal(patched.afk.enabled, false);
});
