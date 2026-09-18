import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { registerCommand } from '../../lib/core/registry.js';
import { db } from '../../lib/core/database.js';
import { config } from '../../lib/config.js';
import { askAI, listAIModels, synthesizeSpeech, transcribeAudio } from '../../lib/services/ai.js';
import { recentChatMessages } from '../../lib/services/chat-history.js';
import { contextInfo, unwrapMessage } from '../../lib/utils/message.js';
import { logger } from '../../lib/core/logger.js';
import { translateText } from '../../lib/services/translate.js';

const LANGS = {
  en: 'English', ur: 'Urdu', hi: 'Hindi', ar: 'Arabic', fr: 'French', de: 'German', es: 'Spanish',
  it: 'Italian', pt: 'Portuguese', tr: 'Turkish', ru: 'Russian', zh: 'Chinese', ja: 'Japanese', ko: 'Korean',
  pa: 'Punjabi', bn: 'Bengali', fa: 'Persian', id: 'Indonesian', ms: 'Malay'
};

function quotedMessage(ctx) { return contextInfo(ctx.msg)?.quotedMessage || null; }
function quotedText(ctx) {
  const q = quotedMessage(ctx);
  if (!q) return '';
  const m = unwrapMessage(q);
  return String(m.conversation || m.extendedTextMessage?.text || m.imageMessage?.caption || m.videoMessage?.caption || '').trim();
}
function historyText(rows) {
  return rows.map((r) => `${r.fromMe ? 'Me' : 'Them'}: ${String(r.text).replace(/\s+/g, ' ').slice(0, 700)}`).join('\n');
}


registerCommand({
  name: 'autoai', category: 'ai', ownerOnly: true, masterOnly: true,
  description: 'Toggle automatic AI replies for all private chats and direct group mentions', usage: 'auto ai on|off',
  async run(ctx) {
    if (ctx.sessionId !== 'main' || !ctx.isMasterOwnerAction) return;
    const value = String(ctx.args[0] || '').toLowerCase();
    if (!['on', 'off'].includes(value)) return ctx.reply(`Usage: ${ctx.prefix}auto ai on|off`);
    ctx.sessionSettings.autoAI = value === 'on';
    await db.save();
    await ctx.reply(`🤖 Auto AI: ${value.toUpperCase()}\n${value === 'on' ? 'Private incoming messages will get AI replies. In groups, AI replies only when this bot account is directly mentioned.' : 'Global automatic AI replies are disabled. Per-chat .smartreply settings remain separate.'}`);
  }
});

registerCommand({
  name: 'aimodels', category: 'ai', ownerOnly: true, masterOnly: true,
  description: 'Show model IDs returned by the configured AI provider', usage: 'aimodels', cooldown: 10,
  async run(ctx) {
    const models = await listAIModels();
    const shown = models.slice(0, 40);
    await ctx.reply(`🧠 *A-X-HK AI MODELS*\n\nConfigured: ${config.ai.model}\nReturned: ${models.length}\n\n${shown.length ? shown.map((m, i) => `${i + 1}. ${m}`).join('\n') : 'Provider returned no model IDs.'}${models.length > shown.length ? `\n\n+${models.length - shown.length} more` : ''}`);
  }
});

registerCommand({
  name: 'smartreply', aliases: ['smartmode'], category: 'ai', ownerOnly: true, masterOnly: true,
  description: 'Toggle AI smart replies for the current 1-to-1 chat', usage: 'smartreply on|off',
  async run(ctx) {
    if (ctx.isGroup) return ctx.reply('Smart Reply can only be enabled for a private/inbox chat.');
    const value = String(ctx.args[0] || '').toLowerCase();
    if (!['on', 'off'].includes(value)) return ctx.reply(`Usage: ${ctx.prefix}smartreply on|off`);
    ctx.sessionSettings.smartReplyChats ||= {};
    ctx.sessionSettings.smartReplyChats[ctx.chat] = value === 'on';
    await db.save();
    await ctx.reply(`🧠 Smart Reply for this chat: ${value.toUpperCase()}\nAI must be configured for automatic replies to work.`);
  }
});

registerCommand({
  name: 'summary', aliases: ['chatsummary'], category: 'ai', description: 'Summarize recent in-memory messages from this chat', usage: 'summary 30', cooldown: 8,
  async run(ctx) {
    const limit = Math.max(5, Math.min(80, Number(ctx.args[0]) || 30));
    const rows = recentChatMessages(ctx.sessionId, ctx.chat, limit);
    if (rows.length < 2) return ctx.reply('Not enough recent chat text is available yet. History is memory-only and resets when the bot restarts.');
    const result = await askAI(`Summarize the following WhatsApp conversation. Keep it factual, concise, and separate decisions/action items if present.\n\n${historyText(rows)}`, ctx.senderNumber, {
      temperature: 0.2,
      fallbackModels: Array.isArray(ctx.sessionSettings.aiFallbackModels) ? ctx.sessionSettings.aiFallbackModels : []
    });
    await ctx.reply(`🧾 *CHAT SUMMARY • LAST ${rows.length}*\n\n${result}`);
  }
});

registerCommand({
  name: 'translate', aliases: ['tr', 'trans'], category: 'ai', description: 'Translate supplied or quoted text with direct translation and AI fallback', usage: 'tr ur hello world', cooldown: 5,
  async run(ctx) {
    const code = String(ctx.args[0] || '').toLowerCase();
    const lang = LANGS[code] || (code.length > 1 && code.length < 30 ? code : '');
    const text = ctx.args.slice(1).join(' ').trim() || quotedText(ctx);
    if (!lang || !text) return ctx.reply(`Usage: ${ctx.prefix}tr ur hello\nSupported shortcuts: ${Object.keys(LANGS).join(', ')}`);

    let result = '';
    let directError = null;
    if (LANGS[code]) {
      try {
        result = await translateText(text, code);
      } catch (err) {
        directError = err;
        logger.warn({ err, target: code }, 'Direct translation fallback failed');
      }
    }

    if (!result) {
      try {
        result = await askAI(`Translate the text below into ${lang}. Preserve names, numbers, links and formatting. Return only the translation.\n\n${text}`, ctx.senderNumber, {
          temperature: 0.1,
          fallbackModels: Array.isArray(ctx.sessionSettings.aiFallbackModels) ? ctx.sessionSettings.aiFallbackModels : []
        });
      } catch (aiError) {
        if (directError) throw new Error(`Translation is temporarily unavailable. Direct translator: ${directError.message} AI fallback: ${aiError.message}`);
        throw aiError;
      }
    }

    await ctx.reply(`🌐 *${String(lang).toUpperCase()}*\n\n${result}`);
  }
});

registerCommand({
  name: 'tts', aliases: ['texttospeech'], category: 'ai', description: 'Convert text to an MP3 voice using the configured AI provider', usage: 'tts hello', cooldown: 8,
  async run(ctx) {
    const text = ctx.argText.trim() || quotedText(ctx);
    if (!text) return ctx.reply(`Usage: ${ctx.prefix}tts your text`);
    const audio = await synthesizeSpeech(text.slice(0, 3000));
    if (audio.length > 16 * 1024 * 1024) throw new Error('Generated audio is too large.');
    await ctx.send({ audio, mimetype: 'audio/mpeg', ptt: false }, { quoted: ctx.msg });
  }
});

registerCommand({
  name: 'voicetotext', aliases: ['stt', 'transcribe'], category: 'ai', description: 'Transcribe a quoted voice note/audio using the configured AI provider', usage: 'voicetotext (reply to audio)', cooldown: 10,
  async run(ctx) {
    const q = quotedMessage(ctx);
    const m = unwrapMessage(q || {});
    if (!m.audioMessage) return ctx.reply('Reply to a normal voice note/audio message with this command.');
    const target = { ...ctx.msg, message: q };
    const buffer = await downloadMediaMessage(target, 'buffer', {}, { logger, reuploadRequest: ctx.sock.updateMediaMessage });
    if (!buffer || buffer.length > 25 * 1024 * 1024) throw new Error('Voice note is unavailable or larger than 25 MB.');
    const mime = m.audioMessage.mimetype || 'audio/ogg';
    const ext = mime.includes('mpeg') ? 'mp3' : mime.includes('mp4') ? 'm4a' : 'ogg';
    const text = await transcribeAudio(buffer, { fileName: `voice.${ext}`, mimeType: mime });
    await ctx.reply(`🎙️ *VOICE → TEXT*\n\n${text}`);
  }
});
