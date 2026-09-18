const PREMIUM_AUTO_REPLY_TEXT = [
  '╭━━━〔 📨 𝐀_𝐗_𝐇𝐊 𝐀𝐔𝐓𝐎 𝐑𝐄𝐏𝐋𝐘 📨 〕━━━╮',
  '┃ ✅ Message received successfully.',
  '┃ 👑 Owner is currently busy.',
  '┃ ⏳ Please wait — he will reply as soon as possible.',
  '┃ 🤝 Thank you for contacting A_X_HK.',
  '╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
  '',
  '© 𝐏𝐎𝐖𝐄𝐑𝐄𝐃 𝐁𝐘 𝐀_𝐗_𝐇𝐊'
].join('\n');

export const AUTO_REPLY_TEXT = PREMIUM_AUTO_REPLY_TEXT;
export const DEFAULT_AWAY_COOLDOWN_MINUTES = Math.max(1, Math.min(60, Number(process.env.AWAY_COOLDOWN_MINUTES || 5)));
export const DEFAULT_AWAY_COOLDOWN_HOURS = DEFAULT_AWAY_COOLDOWN_MINUTES / 60;

export function isLegacyAwayText(value = '') {
  const text = String(value || '').trim();
  if (!text) return true;
  return [
    'I am currently busy. I will reply as soon as I am available.',
    'I am currently away.',
    'I am currently away. I will reply when I am available.',
    'Owner is currently busy and will reply soon.',
    'Thanks for your message. Owner is currently busy and will reply soon.'
  ].includes(text) || /^💤\s*AFK\b/i.test(text);
}

export function normalizeAwayText() {
  return AUTO_REPLY_TEXT;
}

export function awayCooldownMs(settings = {}) {
  const minutes = Number(settings.awayCooldownMinutes || process.env.AWAY_COOLDOWN_MINUTES || DEFAULT_AWAY_COOLDOWN_MINUTES);
  const safeMinutes = Math.max(1, Math.min(60, Number.isFinite(minutes) ? minutes : DEFAULT_AWAY_COOLDOWN_MINUTES));
  return safeMinutes * 60 * 1000;
}

export function shouldSendAwayReply({
  isGroup = false,
  wasMentioned = false,
  away = {},
  now = Date.now(),
  lastReplyAt = 0,
  ownerLastActiveAt = 0,
  cooldownMs = DEFAULT_AWAY_COOLDOWN_MINUTES * 60 * 1000
} = {}) {
  void ownerLastActiveAt;
  if (!away?.enabled) return false;
  if (isGroup && !wasMentioned) return false;
  if (lastReplyAt && now - lastReplyAt < cooldownMs) return false;
  return true;
}
