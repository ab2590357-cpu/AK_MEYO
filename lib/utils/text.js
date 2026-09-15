export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return [d ? `${d}d` : '', h ? `${h}h` : '', m ? `${m}m` : '', `${s}s`].filter(Boolean).join(' ');
}

export function cleanJid(jid = '') {
  return String(jid).replace(/:\d+@/, '@');
}

export function bareNumber(jid = '') {
  return cleanJid(jid).split('@')[0].replace(/[^0-9]/g, '');
}

export function truncate(text, max = 3500) {
  const value = String(text ?? '');
  return value.length > max ? `${value.slice(0, max - 20)}\n...[truncated]` : value;
}

export function randomItem(list) {
  return list[Math.floor(Math.random() * list.length)];
}

export function parseDuration(input = '') {
  const match = String(input).trim().match(/^(\d+)(s|m|h|d)$/i);
  if (!match) return null;
  const n = Number(match[1]);
  const factor = { s: 1000, m: 60000, h: 3600000, d: 86400000 }[match[2].toLowerCase()];
  const ms = n * factor;
  return ms > 0 && ms <= 30 * 86400000 ? ms : null;
}
