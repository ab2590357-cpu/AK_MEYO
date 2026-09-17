import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DISPATCHER_PATH = path.join(repoRoot, 'lib/core/dispatcher.js');

const OLD_BLOCK = [
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
  '  }'
].join('\n');

const NEW_BLOCK = [
  '  const last = autoReplyAt.get(key) || 0;',
  '  const away = ctx.sessionSettings.away;',
  '  const awayCooldownMs = Math.max(',
  '    3,',
  '    Math.min(24, Number(ctx.sessionSettings.awayCooldownHours || 4))',
  '  ) * 60 * 60 * 1000;',
  '',
  '  if (!ctx.isGroup && away?.enabled && now - last > awayCooldownMs) {',
  '    autoReplyAt.set(key, now);',
  "    const text = `📨 ${away.text || 'I am currently busy. I will reply as soon as I am available.'}`;",
  '    await ctx.reply(`${text}\\n\\n${config.footerMessage}`);',
  '    return true;',
  '  }'
].join('\n');

const OLD_NO_TEXT_BLOCK = [
  '  applyAutoFeatures(ctx, sock, msg);',
  '  if (!ctx.text) return;',
  '',
  '  if (await moderation(ctx)) return;'
].join('\n');

const NEW_NO_TEXT_BLOCK = [
  '  applyAutoFeatures(ctx, sock, msg);',
  '  if (!ctx.text) {',
  '    await maybeDirectAutomation(ctx);',
  '    return;',
  '  }',
  '',
  '  if (await moderation(ctx)) return;'
].join('\n');

export function patchDispatcherSource(source) {
  let next = String(source || '');
  if (next.includes(OLD_BLOCK)) next = next.replace(OLD_BLOCK, NEW_BLOCK);
  if (next.includes(OLD_NO_TEXT_BLOCK)) next = next.replace(OLD_NO_TEXT_BLOCK, NEW_NO_TEXT_BLOCK);

  const hasOldAfkReply = /AFK|afk\?\.enabled|ctx\.sessionSettings\.afk/.test(next);
  const hasOldCooldown = next.includes('30 * 60 * 1000');
  const hasAwayPolicy = next.includes('away?.enabled') && next.includes('awayCooldownHours || 4');
  const stillSkipsNoText = next.includes('if (!ctx.text) return;');
  const handlesNoText = next.includes('if (!ctx.text) {\n    await maybeDirectAutomation(ctx);\n    return;\n  }');

  if (hasOldAfkReply || hasOldCooldown || !hasAwayPolicy || stillSkipsNoText || !handlesNoText) {
    throw new Error('A-X-HK away policy patch could not be applied cleanly.');
  }

  return next;
}

export async function applyAwayPolicy(filePath = DISPATCHER_PATH) {
  const source = await fs.readFile(filePath, 'utf8');
  const patched = patchDispatcherSource(source);
  if (patched !== source) await fs.writeFile(filePath, patched);
  return patched !== source;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  applyAwayPolicy()
    .then((changed) => {
      console.log(changed ? 'A-X-HK away policy source applied' : 'A-X-HK away policy source ready');
    })
    .catch((error) => {
      console.error(error?.message || error);
      process.exit(1);
    });
}
