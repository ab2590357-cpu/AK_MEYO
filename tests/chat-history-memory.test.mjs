import test from 'node:test';
import assert from 'node:assert/strict';
import { rememberChatMessage, chatHistoryStats } from '../lib/services/chat-history.js';

test('chat history globally bounds distinct chats to prevent unbounded heap growth', () => {
  for (let i = 0; i < 450; i += 1) {
    rememberChatMessage({
      sessionId: 'memory-regression',
      chat: `chat-${i}@s.whatsapp.net`,
      sender: `user-${i}`,
      text: 'x'.repeat(2500)
    });
  }

  const stats = chatHistoryStats();
  assert.ok(stats.chats <= 300, `expected <=300 chats, got ${stats.chats}`);
});
