const buckets = new Map();
const bursts = new Map();

export function checkCooldown(userJid, command, seconds = 2) {
  const key = `${userJid}:${command}`;
  const now = Date.now();
  const last = buckets.get(key) || 0;
  const waitMs = seconds * 1000 - (now - last);
  if (waitMs > 0) return Math.ceil(waitMs / 1000);
  buckets.set(key, now);
  if (buckets.size > 10000) {
    for (const [k, value] of buckets.entries()) if (now - value > 3600000) buckets.delete(k);
  }
  return 0;
}

export function checkBurst(userJid, limit = 10, windowSeconds = 12) {
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const list = (bursts.get(userJid) || []).filter((at) => now - at < windowMs);
  if (list.length >= limit) {
    bursts.set(userJid, list);
    return Math.ceil((windowMs - (now - list[0])) / 1000);
  }
  list.push(now);
  bursts.set(userJid, list);
  if (bursts.size > 10000) {
    for (const [key, values] of bursts.entries()) {
      if (!values.length || now - values[values.length - 1] > 3600000) bursts.delete(key);
    }
  }
  return 0;
}
