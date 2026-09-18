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

const OLD_POLICY_IMPORT = "import { AUTO_REPLY_TEXT, awayCooldownMs, normalizeAwayText, shouldSendAwayReply } from './auto-reply-policy.js';";
const NEW_POLICY_IMPORT = "import { AUTO_REPLY_TEXT, activeReplySlot, awayCooldownMs, normalizeAwayText, shouldSendAwayReply } from './auto-reply-policy.js';";

const NEW_MAYBE_DIRECT_AUTOMATION = [
  'async function maybeDirectAutomation(ctx) {',
  '  if (ctx.msg.key?.fromMe || isQuiet(ctx.sessionSettings)) return false;',
  '  const key = directKey(ctx);',
  '  const now = Date.now();',
  '  const last = autoReplyAt.get(key) || 0;',
  '  const away = ctx.sessionSettings.away;',
  '  const slot = activeReplySlot(now, config.timezone);',
  '',
  '  const botRefs = [ctx.botJid, ctx.sock.user?.id, ctx.sock.user?.lid].map(cleanJid).filter(Boolean);',
  '  const wasMentioned = ctx.isGroup && mentionedJids(ctx.msg).map(cleanJid).some((jid) => botRefs.includes(jid));',
  '  const cooldownMs = awayCooldownMs(ctx.sessionSettings);',
  '',
  '  const shouldReplyNow = shouldSendAwayReply({',
  '    isGroup: ctx.isGroup,',
  '    wasMentioned,',
  '    away,',
  '    now,',
  '    lastReplyAt: last,',
  '    ownerLastActiveAt: ownerActivityAt.get(key) || 0,',
  '    cooldownMs,',
  '    timezone: config.timezone',
  '  });',
  '',
  '  if (!slot || !shouldReplyNow) return false;',
  '',
  '  const privateAI = !ctx.isGroup && (ctx.sessionSettings.autoAI || ctx.sessionSettings.smartReplyChats?.[ctx.chat]);',
  '  const groupAI = ctx.isGroup && ctx.sessionSettings.autoAI && wasMentioned;',
  '  const aiCooldownMs = Math.max(10, Math.min(180, Number(ctx.sessionSettings.aiCooldownSeconds || 20))) * 1000;',
  '',
  '  if ((privateAI || groupAI) && now - last > aiCooldownMs) {',
  '    try {',
  '      const historyLimit = Math.max(4, Math.min(24, Number(ctx.sessionSettings.aiHistoryLimit || (ctx.isGroup ? 16 : 12))));',
  '      const rows = recentChatMessages(ctx.sessionId, ctx.chat, historyLimit);',
  '      const history = rows.map((r) => {',
  "        const who = r.fromMe ? 'Me' : (ctx.isGroup ? `Member ${String(r.sender || '').replace(/@.*/, '').slice(-6)}` : 'Them');",
  '        return `${who}: ${r.text}`;',
  '      }).join(\'\\n\');',
  "      const statusLine = slot.key === 'sleep'",
  "        ? 'Abdullah is currently resting/sleeping. Sleep Time: 10:00 AM to 5:00 PM.'",
  "        : 'Abdullah is currently at the office. Office Time: 9:00 PM to 8:00 AM.';",
  '      const instruction = ctx.isGroup',
  "        ? 'You were directly mentioned in a WhatsApp group. Reply only to the latest relevant message, and keep the reply inside the group.'",
  "        : 'You are replying in a private WhatsApp chat. Give one natural helpful reply to the latest message.';",
  '      const persona = aiPersonaPrompt(ctx.sessionSettings.aiPersona || \'professional\');',
  '      const aiPrompt = [',
  "        'Identity: You are Abdullah\\'s official AI assistant on WhatsApp. You are not Abdullah himself.',",
  '        `Availability: ${statusLine}`,' ,
  '        `Schedule timezone: ${config.timezone || \'Asia/Karachi\'}.`,' ,
  "        'Rules: Always be honest that you are Abdullah\\'s AI assistant. Never claim Abdullah personally read the message. If someone asks where Abdullah is, answer using the availability above. Do not send group replies to personal inbox. Keep replies concise, professional and natural.',",
  '        instruction,',
  '        persona,',
  "        'Conversation:\\n' + (history || ('Them: ' + (ctx.text || '[media/message received]')))",
  '      ].join(\'\\n\\n\');',
  '',
  '      const aiReply = await askAI(aiPrompt, ctx.senderNumber, {',
  '        temperature: 0.35,',
  '        maxChars: 1400,',
  "        systemPrompt: 'You are Abdullah\\'s official AI assistant on WhatsApp. You are not Abdullah himself. Keep replies professional, brief and natural.',",
  '        fallbackModels: Array.isArray(ctx.sessionSettings.aiFallbackModels) ? ctx.sessionSettings.aiFallbackModels : []',
  '      });',
  '      autoReplyAt.set(key, now);',
  '      await ctx.reply(aiReply);',
  '      rememberChatMessage({ sessionId: ctx.sessionId, chat: ctx.chat, sender: ctx.botJid, fromMe: true, text: aiReply });',
  '      return true;',
  '    } catch (err) {',
  "      logger.warn({ err, sessionId: ctx.sessionId }, 'Auto AI reply skipped; falling back to scheduled reply');",
  '    }',
  '  }',
  '',
  '  autoReplyAt.set(key, now);',
  '  const text = normalizeAwayText(away?.text, now, config.timezone) || AUTO_REPLY_TEXT;',
  '  await ctx.reply(text);',
  '  return true;',
  '}',
  '',
  'function maybeAwardXp(ctx)'
].join('\n');

export function patchDispatcherSource(source) {
  let next = String(source || '');
  if (next.includes(OLD_POLICY_IMPORT)) next = next.replace(OLD_POLICY_IMPORT, NEW_POLICY_IMPORT);
  if (next.includes(OLD_NO_TEXT_BLOCK)) next = next.replace(OLD_NO_TEXT_BLOCK, NEW_NO_TEXT_BLOCK);

  if (!next.includes("Identity: You are Abdullah\\'s official AI assistant on WhatsApp")) {
    const matcher = /async function maybeDirectAutomation\(ctx\) \{[\s\S]*?\n\}\n\nfunction maybeAwardXp\(ctx\)/;
    if (!matcher.test(next)) throw new Error('Could not locate maybeDirectAutomation for A-X-HK auto AI patch.');
    next = next.replace(matcher, NEW_MAYBE_DIRECT_AUTOMATION);
  }

  const hasPolicyHelper = next.includes('shouldSendAwayReply')
    && next.includes('activeReplySlot')
    && next.includes('ctx.sessionSettings.autoAI')
    && next.includes("You are Abdullah\\'s official AI assistant on WhatsApp");
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
