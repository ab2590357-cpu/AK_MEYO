import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  applyPersistentAwaySettings,
  applySessionAwaySettings,
  patchDispatcherSource
} from '../scripts/apply-away-policy.mjs';

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

test('session away settings force auto response on and AFK off', () => {
  const patched = applySessionAwaySettings({
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

test('persistent database sessions are migrated before bot startup', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'axhk-away-'));
  const dbPath = path.join(dir, 'database.json');
  await fs.writeFile(dbPath, JSON.stringify({
    global: { away: { enabled: false, text: '' }, afk: { enabled: true, reason: 'old' } },
    sessions: {
      main: { away: { enabled: false, text: 'Main busy' }, afk: { enabled: true, reason: 'main' }, awayCooldownHours: 1 },
      ax_test: { away: { enabled: false, text: '' }, afk: { enabled: true, reason: 'linked' } }
    }
  }), 'utf8');

  const changed = await applyPersistentAwaySettings(dir);
  const data = JSON.parse(await fs.readFile(dbPath, 'utf8'));

  assert.equal(changed, true);
  assert.equal(data.global.away.enabled, true);
  assert.equal(data.global.awayCooldownHours, 4);
  assert.equal(data.global.afk.enabled, false);
  assert.equal(data.sessions.main.away.enabled, true);
  assert.equal(data.sessions.main.away.text, 'Main busy');
  assert.equal(data.sessions.main.awayCooldownHours, 4);
  assert.equal(data.sessions.main.afk.enabled, false);
  assert.equal(data.sessions.ax_test.away.enabled, true);
  assert.equal(data.sessions.ax_test.away.text, 'I am currently busy. I will reply as soon as I am available.');
  assert.equal(data.sessions.ax_test.awayCooldownHours, 4);
  assert.equal(data.sessions.ax_test.afk.enabled, false);
});
