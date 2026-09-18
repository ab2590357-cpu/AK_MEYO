const FOOTER = '★ 𝐏𝐎𝐖𝐄𝐑𝐄𝐃 𝐁𝐘 𝐀𝐁𝐃𝐔𝐋𝐋𝐀𝐇_𝐗_𝐇𝐊 ★';
const DEFAULT_TIMEZONE = process.env.TIMEZONE || 'Asia/Karachi';

const OFFICE_REPLY_TEXT = [
  '╭━━━〔 🏢 𝐀_𝐗_𝐇𝐊 𝐀𝐈 𝐀𝐒𝐒𝐈𝐒𝐓𝐀𝐍𝐓 🏢 〕━━━╮',
  '┃ ✅ Your message has been received.',
  '┃ 🤖 I’m Abdullah’s AI assistant.',
  '┃ 👑 Abdullah is currently at the office.',
  '┃ 🕘 Office Time: 9:00 PM – 8:00 AM',
  '┃ ⏳ He will reply as soon as he is available.',
  '╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
  '',
  FOOTER
].join('\n');

const SLEEP_REPLY_TEXT = [
  '╭━━━〔 🌙 𝐀_𝐗_𝐇𝐊 𝐀𝐈 𝐀𝐒𝐒𝐈𝐒𝐓𝐀𝐍𝐓 🌙 〕━━━╮',
  '┃ ✅ Your message has been received.',
  '┃ 🤖 I’m Abdullah’s AI assistant.',
  '┃ 👑 Abdullah is currently resting.',
  '┃ 🕙 Sleep Time: 10:00 AM – 5:00 PM',
  '┃ ⏳ He will reply after he is available.',
  '╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
  '',
  FOOTER
].join('\n');

export const AUTO_REPLY_TEXT = OFFICE_REPLY_TEXT;
export const DEFAULT_AWAY_COOLDOWN_MINUTES = Math.max(5, Math.min(60, Number(process.env.AUTO_REPLY_COOLDOWN_MINUTES || process.env.AWAY_COOLDOWN_MINUTES || 20)));
export const DEFAULT_AWAY_COOLDOWN_HOURS = DEFAULT_AWAY_COOLDOWN_MINUTES / 60;

const OFFICE_START = 21 * 60;
const OFFICE_END = 8 * 60;
const SLEEP_START = 10 * 60;
const SLEEP_END = 17 * 60;

function timeParts(date = new Date(), timezone = DEFAULT_TIMEZONE) {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).formatToParts(date);
    const hour = Number(parts.find((p) => p.type === 'hour')?.value || 0);
    const minute = Number(parts.find((p) => p.type === 'minute')?.value || 0);
    return { hour, minute };
  } catch {
    const fallback = new Date(date);
    return { hour: fallback.getHours(), minute: fallback.getMinutes() };
  }
}

function minuteOfDay(now = Date.now(), timezone = DEFAULT_TIMEZONE) {
  const { hour, minute } = timeParts(new Date(now), timezone);
  return hour * 60 + minute;
}

function inRange(value, start, end) {
  return start <= end ? value >= start && value < end : value >= start || value < end;
}

export function activeReplySlot(now = Date.now(), timezone = DEFAULT_TIMEZONE) {
  const minute = minuteOfDay(now, timezone);
  if (inRange(minute, OFFICE_START, OFFICE_END)) return { key: 'office', text: OFFICE_REPLY_TEXT };
  if (inRange(minute, SLEEP_START, SLEEP_END)) return { key: 'sleep', text: SLEEP_REPLY_TEXT };
  return null;
}

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

export function normalizeAwayText(_value = '', now = Date.now(), timezone = DEFAULT_TIMEZONE) {
  return activeReplySlot(now, timezone)?.text || '';
}

export function awayCooldownMs(settings = {}) {
  const explicitMinutes = settings.awayCooldownMinutes
    ?? settings.autoReplyCooldownMinutes
    ?? process.env.AUTO_REPLY_COOLDOWN_MINUTES
    ?? process.env.AWAY_COOLDOWN_MINUTES;
  let minutes = Number(explicitMinutes);

  if (!Number.isFinite(minutes)) {
    const legacyHours = Number(settings.awayCooldownHours ?? process.env.AWAY_COOLDOWN_HOURS);
    if (Number.isFinite(legacyHours) && legacyHours > 0) minutes = legacyHours * 60;
  }

  const safeMinutes = Math.max(5, Math.min(60, Number.isFinite(minutes) ? minutes : DEFAULT_AWAY_COOLDOWN_MINUTES));
  return safeMinutes * 60 * 1000;
}

export function shouldSendAwayReply({
  isGroup = false,
  wasMentioned = false,
  now = Date.now(),
  lastReplyAt = 0,
  ownerLastActiveAt = 0,
  cooldownMs = DEFAULT_AWAY_COOLDOWN_MINUTES * 60 * 1000,
  timezone = DEFAULT_TIMEZONE
} = {}) {
  const slot = activeReplySlot(now, timezone);
  if (!slot) return false;
  if (isGroup && !wasMentioned) return false;
  if (ownerLastActiveAt && now - ownerLastActiveAt < cooldownMs) return false;
  if (lastReplyAt && now - lastReplyAt < cooldownMs) return false;
  return true;
}
