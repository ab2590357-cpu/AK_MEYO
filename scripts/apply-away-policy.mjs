import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DISPATCHER_PATH = path.join(repoRoot, 'lib/core/dispatcher.js');

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
  if (next.includes(OLD_NO_TEXT_BLOCK)) next = next.replace(OLD_NO_TEXT_BLOCK, NEW_NO_TEXT_BLOCK);

  const hasPolicyHelper = next.includes('shouldSendAwayReply')
    && next.includes('ownerActivityAt')
    && next.includes('rememberOwnerActivity(ctx)')
    && next.includes('normalizeAwayText(away?.text)');
  const hasLegacyAfk = /AFK|afk\?\.enabled|ctx\.sessionSettings\.afk/.test(next);
  const hasOldCooldown = next.includes('30 * 60 * 1000');
  const handlesNoText = next.includes('if (!ctx.text) {\n    await maybeDirectAutomation(ctx);\n    return;\n  }');

  if (!hasPolicyHelper || hasLegacyAfk || hasOldCooldown || !handlesNoText) {
    throw new Error('A-X-HK away auto reply policy is not cleanly applied.');
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
