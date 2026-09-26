const buckets = new Map();
const MAX_PER_CHAT = 60;
const MAX_CHATS = 300;
const MAX_AGE_MS = 6 * 60 * 60 * 1000;

function key(sessionId, chat) { return `${String(sessionId || 'main')}::${String(chat || '')}`; }

function prune(rows, now = Date.now()) {
  const filtered = rows.filter((row) => now - Number(row.at || 0) <= MAX_AGE_MS);
  return filtered.slice(-MAX_PER_CHAT);
}

function pruneBuckets(now = Date.now()) {
  for (const [k, rows] of buckets) {
    const kept = prune(rows, now);
    if (!kept.length) buckets.delete(k);
    else buckets.set(k, kept);
  }

  while (buckets.size > MAX_CHATS) {
    const oldest = buckets.keys().next().value;
    if (oldest === undefined) break;
    buckets.delete(oldest);
  }
}

export function rememberChatMessage({ sessionId = 'main', chat = '', sender = '', fromMe = false, text = '' } = {}) {
  const value = String(text || '').trim();
  if (!chat || !value) return;

  const now = Date.now();
  const k = key(sessionId, chat);
  const rows = prune(buckets.get(k) || [], now);
  rows.push({
    at: now,
    sender: String(sender || ''),
    fromMe: Boolean(fromMe),
    text: value.slice(0, 2500)
  });

  // Refresh insertion order so global eviction approximates LRU.
  buckets.delete(k);
  buckets.set(k, rows.slice(-MAX_PER_CHAT));

  if (buckets.size > MAX_CHATS) pruneBuckets(now);
}

export function recentChatMessages(sessionId, chat, limit = 30) {
  const k = key(sessionId, chat);
  const rows = prune(buckets.get(k) || []);

  if (rows.length) {
    buckets.delete(k);
    buckets.set(k, rows);
  } else {
    buckets.delete(k);
  }

  const n = Math.max(1, Math.min(100, Number(limit) || 30));
  return rows.slice(-n);
}

export function clearChatHistory(sessionId, chat) {
  buckets.delete(key(sessionId, chat));
}

export function chatHistoryStats() {
  pruneBuckets();
  let messages = 0;
  for (const rows of buckets.values()) messages += rows.length;
  return { chats: buckets.size, messages };
}
