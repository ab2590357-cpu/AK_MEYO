import test from 'node:test';
import assert from 'node:assert/strict';
import { patchDispatcherSource } from '../scripts/apply-away-policy.mjs';
import { enforceAwayPolicy } from '../lib/core/database.js';
import {
  AUTO_REPLY_TEXT,
  DEFAULT_AWAY_COOLDOWN_HOURS,
  activeReplySlot,
  normalizeAwayText,
  shouldSendAwayReply
} from '../lib/core/auto-reply-policy.js';

const officeNow = new Date('2026-01-01T16:30:00Z').getTime();
const sleepNow = new Date('2026-01-01T05:30:00Z').getTime();
const availableNow = new Date('2026-01-01T12:30:00Z').getTime();

test('dispatcher validator accepts private-only automation flow', () => {
  const source = [
    "async function maybeDirectAutomation(ctx) {",
    "  if (ctx.msg.key?.fromMe || !isPrivateUserChat(ctx)) return false;",
    "  const privateAI = ctx.sessionId === 'main' && isPrivateUserChat(ctx) && Boolean(ctx.sessionSettings.autoAI);",
    "}",
    "function applyAutoFeatures(ctx, sock, msg) {",
    "  if (!isPrivateUserChat(ctx)) return;",
    "}",
    "export async function dispatchMessage(sock, msg, runtime = {}) {",
    "  if (!ctx.isGroup && !isPrivateUserChat(ctx)) return;",
    "  const exact = isPrivateUserChat(ctx) ? db.autoReplies(ctx.sessionId)[ctx.text.toLowerCase()] : '';",
    "}"
  ].join('\\n');

  assert.equal(patchDispatcherSource(source), source);
});

test('dispatcher validator rejects group-triggered automation and cinematic welcome', () => {
  const unsafe = [
    "async function maybeDirectAutomation(ctx) {",
    "  if (ctx.msg.key?.fromMe || !isPrivateUserChat(ctx)) return false;",
    "  const privateAI = ctx.sessionId === 'main' && isPrivateUserChat(ctx) && Boolean(ctx.sessionSettings.autoAI);",
    "  const groupAI = ctx.isGroup && Boolean(ctx.sessionSettings.autoAI);",
    "}",
    "function applyAutoFeatures(ctx, sock, msg) {",
    "  if (!isPrivateUserChat(ctx)) return;",
    "}",
    "export async function dispatchMessage(sock, msg, runtime = {}) {",
    "  if (!ctx.isGroup && !isPrivateUserChat(ctx)) return;",
    "  const exact = isPrivateUserChat(ctx) ? db.autoReplies(ctx.sessionId)[ctx.text.toLowerCase()] : '';",
    "  sendCinematicIntro(ctx);",
    "}"
  ].join('\\n');

  assert.throws(() => patchDispatcherSource(unsafe), /private-only automation policy validation failed/i);
});

test('session scheduled-reply toggle stays independent while AFK remains disabled', () => {
  const patched = enforceAwayPolicy({
    away: { enabled: false, text: 'I am currently away. I will reply when I am available.' },
    awayCooldownHours: 1,
    afk: { enabled: true, reason: 'old afk' }
  });

  assert.equal(patched.away.enabled, false);
  assert.equal(patched.awayCooldownHours, DEFAULT_AWAY_COOLDOWN_HOURS);
  assert.equal(patched.afk.enabled, false);
  assert.equal(patched.afk.reason, '');
});

test('time slots return office, sleep, and available states', () => {
  assert.equal(activeReplySlot(officeNow, 'Asia/Karachi')?.key, 'office');
  assert.equal(activeReplySlot(sleepNow, 'Asia/Karachi')?.key, 'sleep');
  assert.equal(activeReplySlot(availableNow, 'Asia/Karachi'), null);
});

test('office and sleep text are clearly labeled fixed schedule replies', () => {
  assert.match(AUTO_REPLY_TEXT, /Abdullah|office/i);
  assert.match(normalizeAwayText('', officeNow, 'Asia/Karachi'), /Automated schedule reply/);
  assert.match(normalizeAwayText('', sleepNow, 'Asia/Karachi'), /Automated schedule reply/);
  assert.match(normalizeAwayText('', officeNow, 'Asia/Karachi'), /𝐏𝐎𝐖𝐄𝐑𝐄𝐃 𝐁𝐘 𝐀𝐁𝐃𝐔𝐋𝐋𝐀𝐇_𝐗_𝐇𝐊/);
  assert.equal(normalizeAwayText('', availableNow, 'Asia/Karachi'), '');
});

test('reply policy allows unavailable time only and group mentions only', () => {
  const twentyMinutes = 20 * 60 * 1000;

  assert.equal(shouldSendAwayReply({ now: officeNow, cooldownMs: twentyMinutes, timezone: 'Asia/Karachi' }), true);
  assert.equal(shouldSendAwayReply({ now: sleepNow, cooldownMs: twentyMinutes, timezone: 'Asia/Karachi' }), true);
  assert.equal(shouldSendAwayReply({ now: availableNow, cooldownMs: twentyMinutes, timezone: 'Asia/Karachi' }), false);
  assert.equal(shouldSendAwayReply({ now: officeNow, away: { enabled: false }, cooldownMs: twentyMinutes, timezone: 'Asia/Karachi' }), false);
  assert.equal(shouldSendAwayReply({ now: officeNow, ownerLastActiveAt: officeNow - 60_000, cooldownMs: twentyMinutes, timezone: 'Asia/Karachi' }), false);
  assert.equal(shouldSendAwayReply({ isGroup: true, wasMentioned: false, now: officeNow, cooldownMs: twentyMinutes, timezone: 'Asia/Karachi' }), false);
  assert.equal(shouldSendAwayReply({ isGroup: true, wasMentioned: true, now: officeNow, cooldownMs: twentyMinutes, timezone: 'Asia/Karachi' }), false);
});
