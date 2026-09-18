const MOBILE_AUTO_REPLY_TEXT = [
  '╭─〔 A-X-HK REPLY 〕─╮',
  '┃ Thanks for msg.',
  '┃ Owner is busy now.',
  '┃ Msg received.',
  '┃ Reply soon.',
  '╰──────────────╯',
  '',
  '© A-X-HK'
].join('\n');

export const AUTO_REPLY_TEXT = MOBILE_AUTO_REPLY_TEXT;
export const DEFAULT_AWAY_COOLDOWN_HOURS = Math.max(1, Math.min(24, Number(process.env.AWAY_COOLDOWN_HOURS || 4)));

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
  const hours = Number(settings.awayCooldownHours || DEFAULT_AWAY_COOLDOWN_HOURS);
  const safeHours = Math.max(1, Math.min(24, Number.isFinite(hours) ? hours : DEFAULT_AWAY_COOLDOWN_HOURS));
  return safeHours * 60 * 60 * 1000;
}

export function shouldSendAwayReply({
  isGroup = false,
  wasMentioned = false,
  away = {},
  now = Date.now(),
  lastReplyAt = 0,
  ownerLastActiveAt = 0,
  cooldownMs = DEFAULT_AWAY_COOLDOWN_HOURS * 60 * 60 * 1000
} = {}) {
  if (!away?.enabled) return false;
  if (isGroup && !wasMentioned) return false;
  if (ownerLastActiveAt && now - ownerLastActiveAt < cooldownMs) return false;
  if (lastReplyAt && now - lastReplyAt < cooldownMs) return false;
  return true;
}
