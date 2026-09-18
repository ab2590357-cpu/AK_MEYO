import assert from 'node:assert/strict';
import {
  AUTO_REPLY_TEXT,
  activeReplySlot,
  awayCooldownMs,
  normalizeAwayText,
  shouldSendAwayReply
} from '../lib/core/auto-reply-policy.js';

const MINUTE = 60 * 1000;
const officeNow = new Date('2026-01-01T16:30:00Z').getTime(); // 9:30 PM Asia/Karachi
const sleepNow = new Date('2026-01-01T05:30:00Z').getTime(); // 10:30 AM Asia/Karachi
const availableNow = new Date('2026-01-01T12:30:00Z').getTime(); // 5:30 PM Asia/Karachi

assert.equal(awayCooldownMs({}), 5 * MINUTE);
assert.equal(awayCooldownMs({ awayCooldownMinutes: 15 }), 15 * MINUTE);
assert.equal(awayCooldownMs({ awayCooldownHours: 4 }), 60 * MINUTE);

assert.equal(activeReplySlot(officeNow, 'Asia/Karachi')?.key, 'office');
assert.equal(activeReplySlot(sleepNow, 'Asia/Karachi')?.key, 'sleep');
assert.equal(activeReplySlot(availableNow, 'Asia/Karachi'), null);

assert.match(normalizeAwayText('', officeNow, 'Asia/Karachi'), /Office Time: 9:00 PM/);
assert.match(normalizeAwayText('', sleepNow, 'Asia/Karachi'), /Sleep Time: 10:00 AM/);
assert.equal(normalizeAwayText('', availableNow, 'Asia/Karachi'), '');
assert.match(AUTO_REPLY_TEXT, /Abdullah.*office|office/i);

assert.equal(shouldSendAwayReply({ now: officeNow, timezone: 'Asia/Karachi' }), true, 'office time private chat should receive reply');
assert.equal(shouldSendAwayReply({ now: officeNow, away: { enabled: false }, timezone: 'Asia/Karachi' }), false, 'time reply OFF should stay silent');
assert.equal(
  shouldSendAwayReply({ now: officeNow, lastReplyAt: officeNow - (20 * MINUTE) + 1, cooldownMs: 20 * MINUTE, timezone: 'Asia/Karachi' }),
  false,
  'same chat should not repeat before cooldown'
);
assert.equal(
  shouldSendAwayReply({ now: officeNow, ownerLastActiveAt: officeNow - 60_000, cooldownMs: 20 * MINUTE, timezone: 'Asia/Karachi' }),
  false,
  'active owner conversation should suppress scheduled reply'
);
assert.equal(
  shouldSendAwayReply({ isGroup: true, wasMentioned: false, now: officeNow, timezone: 'Asia/Karachi' }),
  false,
  'group messages without mention should not receive reply'
);
assert.equal(
  shouldSendAwayReply({ isGroup: true, wasMentioned: true, now: officeNow, timezone: 'Asia/Karachi' }),
  true,
  'group mention should receive reply in the same group chat'
);
assert.equal(
  shouldSendAwayReply({ now: availableNow, timezone: 'Asia/Karachi' }),
  false,
  'available time should not receive scheduled reply'
);

console.log('auto-reply policy tests passed');
