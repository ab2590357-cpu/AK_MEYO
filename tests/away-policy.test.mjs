import test from 'node:test';
import assert from 'node:assert/strict';
import { patchDispatcherSource } from '../scripts/apply-away-policy.mjs';

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
