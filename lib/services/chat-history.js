const buckets = new Map();
const MAX_PER_CHAT = 120;
const MAX_AGE_MS = 6 * 60 * 60 * 1000;

function key(sessionId, chat) { return `${String(sessionId || 'main')}::${String(chat || '')}`; }
function prune(rows, now = Date.now()) {
  const filtered = rows.filter((row) => now - Number(row.at || 0) <= MAX_AGE_MS);
  return filtered.slice(-MAX_PER_CHAT);
}

export function rememberChatMessage({ sessionId = 'main', chat = '', sender = '', fromMe = false, text = '' } = {}) {
  const value = String(text || '').trim();
  if (!chat || !value) return;
  const k = key(sessionId, chat);
  const rows = prune(buckets.get(k) || []);
  rows.push({ at: Date.now(), sender: String(sender || ''), fromMe: Boolean(fromMe), text: value.slice(0, 2500) });
  buckets.set(k, rows.slice(-MAX_PER_CHAT));
}

export function recentChatMessages(sessionId, chat, limit = 30) {
  const k = key(sessionId, chat);
  const rows = prune(buckets.get(k) || []);
  buckets.set(k, rows);
  const n = Math.max(1, Math.min(100, Number(limit) || 30));
  return rows.slice(-n);
}

export function clearChatHistory(sessionId, chat) {
  buckets.delete(key(sessionId, chat));
}

export function chatHistoryStats() {
  let messages = 0;
  for (const rows of buckets.values()) messages += rows.length;
  return { chats: buckets.size, messages };
}
