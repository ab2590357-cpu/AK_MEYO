import { unwrapMessage } from '../utils/message.js';

const RECENT_TTL_MS = 2 * 60 * 1000;
const recentImages = new Map();

function key(sessionId, chat) {
  return `${String(sessionId || 'main')}::${String(chat || '')}`;
}

function prune(now = Date.now()) {
  for (const [k, value] of recentImages) {
    if (!value?.at || now - value.at > RECENT_TTL_MS) recentImages.delete(k);
  }
}

export function messageHasImage(msg) {
  const m = unwrapMessage(msg?.message || msg || {});
  return Boolean(m?.imageMessage);
}

export function rememberRecentImage(sessionId, chat, msg) {
  if (!messageHasImage(msg)) return;
  prune();
  recentImages.set(key(sessionId, chat), { at: Date.now(), msg });
}

export function getRecentImage(sessionId, chat) {
  prune();
  const row = recentImages.get(key(sessionId, chat));
  return row?.msg || null;
}

export function clearRecentImage(sessionId, chat) {
  recentImages.delete(key(sessionId, chat));
}
