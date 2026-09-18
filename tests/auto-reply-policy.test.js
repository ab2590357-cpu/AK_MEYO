import assert from 'node:assert/strict';
import {
  AUTO_REPLY_TEXT,
  awayCooldownMs,
  normalizeAwayText,
  shouldSendAwayReply
} from '../lib/core/auto-reply-policy.js';

const FOUR_HOURS = 4 * 60 * 60 * 1000;
const now = 1_000_000_000;
const away = { enabled: true, text: AUTO_REPLY_TEXT };

assert.equal(awayCooldownMs({ awayCooldownHours: 4 }), FOUR_HOURS);
assert.equal(normalizeAwayText('I am currently busy. I will reply as soon as I am available.'), AUTO_REPLY_TEXT);
assert.equal(shouldSendAwayReply({ away, now }), true, 'new private chat should receive away reply');
assert.equal(
  shouldSendAwayReply({ away, now, lastReplyAt: now - FOUR_HOURS + 1, cooldownMs: FOUR_HOURS }),
  false,
  'same chat should not repeat before cooldown'
);
assert.equal(
  shouldSendAwayReply({ away, now, ownerLastActiveAt: now - 60_000, cooldownMs: FOUR_HOURS }),
  false,
  'active owner conversation should suppress away reply'
);
assert.equal(
  shouldSendAwayReply({ away, isGroup: true, wasMentioned: false, now }),
  false,
  'group messages without mention should not receive away reply'
);
assert.equal(
  shouldSendAwayReply({ away, isGroup: true, wasMentioned: true, now }),
  true,
  'group mention should receive away reply in the same group chat'
);

console.log('auto-reply policy tests passed');
