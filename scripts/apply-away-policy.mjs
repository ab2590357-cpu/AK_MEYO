import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DISPATCHER_PATH = path.join(repoRoot, 'lib/core/dispatcher.js');

export function patchDispatcherSource(source) {
  const next = String(source || '');
  const required = [
    "if (ctx.msg.key?.fromMe || !isPrivateUserChat(ctx)) return false;",
    "const privateAI = ctx.sessionId === 'main' && isPrivateUserChat(ctx)",
    "if (!ctx.isGroup && !isPrivateUserChat(ctx)) return;",
    "if (!isPrivateUserChat(ctx)) return;",
    "const exact = isPrivateUserChat(ctx) ? db.autoReplies(ctx.sessionId)[ctx.text.toLowerCase()] : '';"
  ];
  const forbidden = [
    'const groupAI =',
    'sendCinematicIntro(ctx)',
    'wasMentioned = ctx.isGroup'
  ];

  const missing = required.filter((marker) => !next.includes(marker));
  const unsafe = forbidden.filter((marker) => next.includes(marker));
  if (missing.length || unsafe.length) {
    const detail = [
      missing.length ? `missing: ${missing.join(' | ')}` : '',
      unsafe.length ? `unsafe: ${unsafe.join(' | ')}` : ''
    ].filter(Boolean).join('; ');
    throw new Error(`A-X-HK private-only automation policy validation failed (${detail}).`);
  }
  return next;
}

export async function applyAwayPolicy(filePath = DISPATCHER_PATH) {
  const source = await fs.readFile(filePath, 'utf8');
  patchDispatcherSource(source);
  return false;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  applyAwayPolicy()
    .then(() => {
      console.log('A-X-HK private-only timed/AI auto reply policy ready');
    })
    .catch((error) => {
      console.error(error?.message || error);
      process.exit(1);
    });
}
