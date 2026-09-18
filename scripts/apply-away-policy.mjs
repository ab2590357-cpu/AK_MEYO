import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DISPATCHER_PATH = path.join(repoRoot, 'lib/core/dispatcher.js');

const OLD_NO_TEXT_BLOCK = [
  '  applyAutoFeatures(ctx, sock, msg);',
  '  if (!ctx.text) return;',
  '',
  '  if (await moderation(ctx)) return;'
].join('\n');

const NEW_NO_TEXT_BLOCK = [
  '  applyAutoFeatures(ctx, sock, msg);',
  '  if (!ctx.text) {',
  '    await maybeDirectAutomation(ctx);',
  '    return;',
  '  }',
  '',
  '  if (await moderation(ctx)) return;'
].join('\n');

const OLD_REPLY_MAP = "const autoReplyAt = new Map();";
const NEW_REPLY_MAP = "const scheduledReplyAt = new Map();\nconst aiReplyAt = new Map();";

const OLD_POLICY_IMPORT = "import { AUTO_REPLY_TEXT, awayCooldownMs, normalizeAwayText, shouldSendAwayReply } from './auto-reply-policy.js';";
const NEW_POLICY_IMPORT = "import { AUTO_REPLY_TEXT, activeReplySlot, awayCooldownMs, normalizeAwayText, shouldSendAwayReply } from './auto-reply-policy.js';";

const NEW_MAYBE_DIRECT_AUTOMATION = [
  "async function maybeDirectAutomation(ctx) {",
  "  if (ctx.msg.key?.fromMe) return false;",
  "",
  "  const key = directKey(ctx);",
  "  const now = Date.now();",
  "  const away = ctx.sessionSettings.away || { enabled: false };",
  "  const slot = activeReplySlot(now, config.timezone);",
  "",
  "  const botRefs = [ctx.botJid, ctx.sock.user?.id, ctx.sock.user?.lid].map(cleanJid).filter(Boolean);",
  "  const wasMentioned = ctx.isGroup && mentionedJids(ctx.msg).map(cleanJid).some((jid) => botRefs.includes(jid));",
  "",
  "  let replied = false;",
  "",
  "  // Scheduled office/sleep reply is an independent feature.",
  "  // It can be ON or OFF regardless of Auto AI.",
  "  if (away?.enabled && slot) {",
  "    const cooldownMs = awayCooldownMs(ctx.sessionSettings);",
  "    const lastScheduled = scheduledReplyAt.get(key) || 0;",
  "    if (shouldSendAwayReply({",
  "      isGroup: ctx.isGroup,",
  "      wasMentioned,",
  "      away,",
  "      now,",
  "      lastReplyAt: lastScheduled,",
  "      ownerLastActiveAt: ownerActivityAt.get(key) || 0,",
  "      cooldownMs,",
  "      timezone: config.timezone",
  "    })) {",
  "      scheduledReplyAt.set(key, now);",
  "      const text = normalizeAwayText(away?.text, now, config.timezone) || AUTO_REPLY_TEXT;",
  "      await ctx.reply(text);",
  "      replied = true;",
  "    }",
  "  }",
  "",
  "  // Auto AI is completely independent from the scheduled reply.",
  "  // ON = every private incoming message gets an AI answer.",
  "  // Groups = AI answers only when the bot is directly mentioned.",
  "  const privateAI = !ctx.isGroup && Boolean(ctx.sessionSettings.autoAI);",
  "  const groupAI = ctx.isGroup && Boolean(ctx.sessionSettings.autoAI) && wasMentioned;",
  "",
  "  if (privateAI || groupAI) {",
  "    try {",
  "      const historyLimit = Math.max(4, Math.min(24, Number(ctx.sessionSettings.aiHistoryLimit || (ctx.isGroup ? 16 : 12))));",
  "      const rows = recentChatMessages(ctx.sessionId, ctx.chat, historyLimit);",
  "      const history = rows.map((r) => {",
  "        const who = r.fromMe ? 'Assistant/Owner' : (ctx.isGroup ? `Member ${String(r.sender || '').replace(/@.*/, '').slice(-6)}` : 'User');",
  "        return `${who}: ${r.text}`;",
  "      }).join('\\n');",
  "",
  "      const currentTime = hhmmInZone(config.timezone || 'Asia/Karachi');",
  "      const availability = slot?.key === 'sleep'",
  "        ? 'Abdullah is currently resting/sleeping. Sleep time is 10:00 AM to 4:00 PM.'",
  "        : slot?.key === 'office'",
  "          ? 'Abdullah is currently at the office. Office time is 9:00 PM to 8:00 AM.'",
  "          : 'Abdullah is currently in his free/available period. His free windows are 8:00 AM to 10:00 AM and 4:00 PM to 9:00 PM. He may reply personally when available.';",
  "",
  "      const instruction = ctx.isGroup",
  "        ? 'You were directly mentioned in a WhatsApp group. Answer the latest relevant message in the group only.'",
  "        : 'You are handling a private WhatsApp chat. Answer every incoming message naturally and helpfully.';",
  "",
  "      const persona = aiPersonaPrompt(ctx.sessionSettings.aiPersona || 'professional');",
  "      const aiPrompt = [",
  "        \"Identity: You are A_X_HK AI Assistant, Abdullah's official WhatsApp AI assistant. You are not Abdullah himself.\",",
  "        `Current Pakistan time: ${currentTime} (Asia/Karachi).`,",
  "        `Abdullah availability: ${availability}`,",
  "        \"Greeting rule: If the latest user message is a simple greeting such as hi, hello, hey or salam, begin with 'Hello! I’m A_X_HK AI Assistant.' Then briefly mention Abdullah's current availability and ask how you can help.\",",
  "        \"Question rule: For normal questions, answer the question directly using your general knowledge. Do not force the office/sleep message into every answer unless it is relevant or the user asks where Abdullah is.\",",
  "        \"Freshness rule: If a question requires live or real-time information that you do not actually have, say that clearly instead of inventing current facts.\",",
  "        \"Identity rule: Never pretend to be Abdullah and never claim Abdullah personally read a message unless he actually replied.\",",
  "        instruction,",
  "        persona,",
  "        'Conversation:\\n' + (history || ('User: ' + (ctx.text || '[media/message received]')))",
  "      ].join('\\n\\n');",
  "",
  "      const aiReply = await askAI(aiPrompt, ctx.senderNumber, {",
  "        temperature: 0.45,",
  "        maxChars: 1600,",
  "        systemPrompt: \"You are A_X_HK AI Assistant, Abdullah's official WhatsApp AI assistant. Answer naturally, concisely and helpfully. Never pretend to be Abdullah.\",",
  "        fallbackModels: Array.isArray(ctx.sessionSettings.aiFallbackModels) ? ctx.sessionSettings.aiFallbackModels : []",
  "      });",
  "",
  "      aiReplyAt.set(key, now);",
  "      await ctx.reply(aiReply);",
  "      rememberChatMessage({ sessionId: ctx.sessionId, chat: ctx.chat, sender: ctx.botJid, fromMe: true, text: aiReply });",
  "      replied = true;",
  "    } catch (err) {",
  "      logger.warn({ err, sessionId: ctx.sessionId }, 'Auto AI reply failed');",
  "    }",
  "  }",
  "",
  "  return replied;",
  "}",
  "",
  "function maybeAwardXp(ctx)",
].join('\n');

export function patchDispatcherSource(source) {
  let next = String(source || '');
  if (next.includes(OLD_POLICY_IMPORT)) next = next.replace(OLD_POLICY_IMPORT, NEW_POLICY_IMPORT);
  if (next.includes(OLD_REPLY_MAP)) next = next.replace(OLD_REPLY_MAP, NEW_REPLY_MAP);
  if (next.includes(OLD_NO_TEXT_BLOCK)) next = next.replace(OLD_NO_TEXT_BLOCK, NEW_NO_TEXT_BLOCK);

  if (!next.includes("Auto AI is completely independent from the scheduled reply.")) {
    const matcher = /async function maybeDirectAutomation\(ctx\) \{[\s\S]*?\n\}\n\nfunction maybeAwardXp\(ctx\)/;
    if (!matcher.test(next)) throw new Error('Could not locate maybeDirectAutomation for A-X-HK auto AI patch.');
    next = next.replace(matcher, NEW_MAYBE_DIRECT_AUTOMATION);
  }

  const hasPolicyHelper = next.includes('shouldSendAwayReply')
    && next.includes('activeReplySlot')
    && next.includes('ctx.sessionSettings.autoAI')
    && next.includes("Auto AI is completely independent from the scheduled reply.")
    && next.includes("scheduledReplyAt")
    && next.includes("aiReplyAt");
  const hasLegacyAfk = /AFK|afk\?\.enabled|ctx\.sessionSettings\.afk/.test(next);
  const hasOldCooldown = next.includes('30 * 60 * 1000');
  const handlesNoText = next.includes('if (!ctx.text) {\n    await maybeDirectAutomation(ctx);\n    return;\n  }');

  if (!hasPolicyHelper || hasLegacyAfk || hasOldCooldown || !handlesNoText) {
    throw new Error('A-X-HK timed AI auto reply policy is not cleanly applied.');
  }

  return next;
}

export async function applyAwayPolicy(filePath = DISPATCHER_PATH) {
  const source = await fs.readFile(filePath, 'utf8');
  const patched = patchDispatcherSource(source);
  if (patched !== source) await fs.writeFile(filePath, patched);
  return patched !== source;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  applyAwayPolicy()
    .then((changed) => {
      console.log(changed ? 'A-X-HK timed AI auto reply source applied' : 'A-X-HK timed AI auto reply source ready');
    })
    .catch((error) => {
      console.error(error?.message || error);
      process.exit(1);
    });
}
