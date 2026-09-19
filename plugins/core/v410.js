import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { registerCommand } from '../../lib/core/registry.js';
import { db } from '../../lib/core/database.js';
import { config } from '../../lib/config.js';
import { getAIStatus, resetAIState, testAI } from '../../lib/services/ai.js';
import { makeFunSticker } from '../../lib/services/fun-visual.js';
import { logger } from '../../lib/core/logger.js';
import { contextInfo, unwrapMessage } from '../../lib/utils/message.js';

const PERSONAS = {
  default: 'Normal concise A-X-HK assistant',
  professional: 'Professional, clear and business-like',
  friendly: 'Warm, friendly and natural',
  short: 'Very short direct answers',
  urdu: 'Answer in readable Urdu script unless another language is requested',
  roman: 'Answer in natural Roman Urdu / Roman English unless another language is requested'
};

function fmtMs(value) {
  const ms = Number(value || 0);
  if (!ms) return 'n/a';
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`;
}

function fmtUptime(seconds = process.uptime()) {
  let s = Math.max(0, Math.floor(Number(seconds) || 0));
  const d = Math.floor(s / 86400); s %= 86400;
  const h = Math.floor(s / 3600); s %= 3600;
  const m = Math.floor(s / 60); s %= 60;
  return `${d ? `${d}d ` : ''}${h ? `${h}h ` : ''}${m}m ${s}s`;
}

function providerHost() {
  try { return new URL(config.ai.baseUrl).host; } catch { return 'configured provider'; }
}

function quotedVideo(ctx) {
  const q = contextInfo(ctx.msg)?.quotedMessage || null;
  const own = unwrapMessage(ctx.msg?.message || {});
  if (own.videoMessage) return { target: ctx.msg, node: own.videoMessage };
  if (!q) return null;
  const m = unwrapMessage(q);
  if (!m.videoMessage) return null;
  return { target: { ...ctx.msg, message: q }, node: m.videoMessage };
}

registerCommand({
  name: 'aistatus', aliases: ['aistats'], category: 'ai', ownerOnly: true, masterOnly: true,
  description: 'Show AI provider health, latency, retries and last result without exposing the API key',
  async run(ctx) {
    const s = getAIStatus();
    const fallbacks = [...(ctx.sessionSettings.aiFallbackModels || []), ...(s.fallbackModels || [])].filter(Boolean);
    await ctx.reply([
      '🧠 *A-X-HK AI STATUS*', '',
      `Enabled: ${s.enabled ? 'YES' : 'NO'}`,
      `Provider: ${providerHost()}`,
      `Configured model: ${s.configuredModel || 'not set'}`,
      `Last working model: ${s.lastWorkingModel || 'none yet'}`,
      `Session fallbacks: ${fallbacks.length ? fallbacks.join(', ') : 'none'}`,
      `Timeout: ${fmtMs(s.timeoutMs)}`,
      `Retry limit: ${s.retriesConfigured}`,
      '',
      `Attempts: ${s.attempts} • Success: ${s.successes} • Failed: ${s.failures}`,
      `Retries used: ${s.retries}`,
      `Quota block: ${s.quotaBlockedUntil ? `ACTIVE until ${s.quotaBlockedUntil}` : 'none'}`,
      `Last latency: ${fmtMs(s.lastLatencyMs)}`,
      `Last success: ${s.lastSuccessAt || 'none'}`,
      `Last error: ${s.lastError ? s.lastError.slice(0, 250) : 'none'}`,
      '',
      `Persona: ${ctx.sessionSettings.aiPersona || 'default'}`,
      `Auto-AI cooldown: ${ctx.sessionSettings.aiCooldownSeconds || 15}s`,
      `History: ${ctx.sessionSettings.aiHistoryLimit || 12} messages`
    ].join('\n'));
  }
});

registerCommand({
  name: 'aitest', aliases: ['testai'], category: 'ai', ownerOnly: true, masterOnly: true, cooldown: 10,
  description: 'Send one controlled AI health test and report response latency', usage: 'aitest [optional prompt]',
  async run(ctx) {
    const prompt = String(ctx.argText || '').trim().slice(0, 400) || 'Reply with exactly: A-X-HK AI OK';
    const result = await testAI(prompt, { fallbackModels: ctx.sessionSettings.aiFallbackModels || [] });
    await ctx.reply(`✅ *AI TEST*\n\nModel: ${result.status.lastWorkingModel || result.status.lastModel || result.status.configuredModel}\nLatency: ${fmtMs(result.latencyMs)}\n\n${result.text}`);
  }
});

registerCommand({
  name: 'aipersona', aliases: ['personalityai'], category: 'ai', ownerOnly: true, masterOnly: true,
  description: 'Choose the AI reply style for this linked session', usage: 'aipersona default|professional|friendly|short|urdu|roman',
  async run(ctx) {
    const value = String(ctx.args[0] || '').toLowerCase();
    if (!PERSONAS[value]) {
      return ctx.reply(`Usage: ${ctx.prefix}aipersona default|professional|friendly|short|urdu|roman\n\n${Object.entries(PERSONAS).map(([k,v]) => `${k}: ${v}`).join('\n')}`);
    }
    ctx.sessionSettings.aiPersona = value;
    await db.save();
    await ctx.reply(`🧠 AI persona set to *${value}*\n${PERSONAS[value]}`);
  }
});

registerCommand({
  name: 'aicooldown', category: 'ai', ownerOnly: true, masterOnly: true,
  description: 'Set minimum seconds between automatic AI replies per chat', usage: 'aicooldown 15',
  async run(ctx) {
    const seconds = Number(ctx.args[0]);
    if (!Number.isFinite(seconds) || seconds < 5 || seconds > 120) return ctx.reply(`Usage: ${ctx.prefix}aicooldown 15\nAllowed: 5-120 seconds.`);
    ctx.sessionSettings.aiCooldownSeconds = Math.round(seconds);
    await db.save();
    await ctx.reply(`⏱ Auto-AI cooldown: ${ctx.sessionSettings.aiCooldownSeconds}s`);
  }
});

registerCommand({
  name: 'aihistory', category: 'ai', ownerOnly: true, masterOnly: true,
  description: 'Set how many recent chat messages Auto AI may use as context', usage: 'aihistory 12',
  async run(ctx) {
    const count = Number(ctx.args[0]);
    if (!Number.isFinite(count) || count < 4 || count > 24) return ctx.reply(`Usage: ${ctx.prefix}aihistory 12\nAllowed: 4-24 messages.`);
    ctx.sessionSettings.aiHistoryLimit = Math.round(count);
    await db.save();
    await ctx.reply(`🧾 Auto-AI context history: ${ctx.sessionSettings.aiHistoryLimit} messages`);
  }
});

registerCommand({
  name: 'aifallback', aliases: ['aifallbacks'], category: 'ai', ownerOnly: true, masterOnly: true,
  description: 'Set backup AI model IDs used when the primary model route is unavailable', usage: 'aifallback model-a,model-b | off',
  async run(ctx) {
    const raw = String(ctx.argText || '').trim();
    if (!raw) {
      const rows = ctx.sessionSettings.aiFallbackModels || [];
      return ctx.reply(`AI fallback models: ${rows.length ? rows.join(', ') : 'none'}\n\nUsage: ${ctx.prefix}aifallback model-a,model-b\nClear: ${ctx.prefix}aifallback off`);
    }
    if (/^(?:off|clear|none)$/i.test(raw)) {
      ctx.sessionSettings.aiFallbackModels = [];
      await db.save();
      return ctx.reply('🧠 Session AI fallback models cleared.');
    }
    const models = [...new Set(raw.split(',').map((v) => v.trim()).filter((v) => /^[a-zA-Z0-9._:/-]{2,100}$/.test(v)))].slice(0, 6);
    if (!models.length) return ctx.reply('No valid model IDs found. Separate model IDs with commas.');
    ctx.sessionSettings.aiFallbackModels = models;
    await db.save();
    await ctx.reply(`🧠 AI fallbacks saved:\n${models.map((m, i) => `${i + 1}. ${m}`).join('\n')}`);
  }
});

registerCommand({
  name: 'aireload', aliases: ['aireset'], category: 'ai', ownerOnly: true, masterOnly: true,
  description: 'Clear AI runtime health/model cache without exposing or changing the API key',
  async run(ctx) {
    resetAIState();
    await ctx.reply('♻️ AI runtime state reset. Environment variables and API key were not changed.');
  }
});

registerCommand({
  name: 'funvisual', aliases: ['funsticker'], category: 'fun', ownerOnly: true,
  description: 'Turn rich sticker output for fun commands on or off', usage: 'funvisual on|off',
  async run(ctx) {
    const value = String(ctx.args[0] || '').toLowerCase();
    if (!['on', 'off'].includes(value)) return ctx.reply(`Usage: ${ctx.prefix}funvisual on|off`);
    ctx.sessionSettings.funVisuals = value === 'on';
    await db.save();
    await ctx.reply(`🎨 Fun command sticker output: ${value.toUpperCase()}`);
  }
});

registerCommand({
  name: 'stickertext', aliases: ['textsticker', 'txtsticker'], category: 'media', cooldown: 4,
  description: 'Create a branded WhatsApp sticker from short text', usage: 'stickertext hello',
  async run(ctx) {
    const text = String(ctx.argText || '').replace(/\s+/g, ' ').trim();
    if (!text) return ctx.reply(`Usage: ${ctx.prefix}stickertext hello`);
    if (text.length > 60) return ctx.reply('Sticker text is limited to 60 characters.');
    const pack = ctx.sessionSettings.stickerPack || {};
    const sticker = await makeFunSticker({
      title: 'A-X-HK', value: text, footer: 'STICKER TEXT',
      pack: pack.pack || config.shortName, author: pack.author || config.ownerName
    });
    await ctx.send({ sticker }, { quoted: ctx.msg });
  }
});

registerCommand({
  name: 'togif', aliases: ['gif', 'makegif'], category: 'media', cooldown: 6,
  description: 'Re-send a short quoted video as a looping WhatsApp GIF', usage: 'togif (reply to short video)',
  async run(ctx) {
    const media = quotedVideo(ctx);
    if (!media) return ctx.reply('Reply to a short video with this command.');
    const seconds = Number(media.node?.seconds || 0);
    if (seconds > 30) return ctx.reply('GIF conversion is limited to videos up to 30 seconds.');
    const buffer = await downloadMediaMessage(media.target, 'buffer', {}, { logger, reuploadRequest: ctx.sock.updateMediaMessage });
    if (!buffer || buffer.length > 18 * 1024 * 1024) throw new Error('Video is unavailable or larger than 18 MB.');
    await ctx.send({ video: buffer, gifPlayback: true, mimetype: 'video/mp4' }, { quoted: ctx.msg });
  }
});

registerCommand({
  name: 'sessionstats', aliases: ['botstatslive'], category: 'system', ownerOnly: true,
  description: 'Show runtime and current-session operating settings',
  async run(ctx) {
    const m = process.memoryUsage();
    await ctx.reply([
      `📊 *${config.shortName} SESSION STATS*`, '',
      `Version: ${config.version}`,
      `Mode: ${(ctx.sessionSettings.mode || config.mode).toUpperCase()}`,
      `Uptime: ${fmtUptime()}`,
      `Memory RSS: ${(m.rss / 1024 / 1024).toFixed(1)} MB`,
      `Auto AI: ${ctx.sessionSettings.autoAI ? 'ON' : 'OFF'}`,
      `Fun visuals: ${ctx.sessionSettings.funVisuals === false ? 'OFF' : 'ON'}`,
      `Owner alerts: ${ctx.sessionSettings.ownerAlerts === false ? 'OFF' : 'ON'}`,
      `Auto cleanup: ${ctx.sessionSettings.autoCleanup === false ? 'OFF' : 'ON'}`,
      '',
      'Private mode: public commands stay blocked for non-owners, while Auto AI and scheduled Time Reply can continue working.'
    ].join('\n'));
  }
});

registerCommand({
  name: 'privatestatus', aliases: ['privateguard'], category: 'owner', ownerOnly: true,
  description: 'Explain and verify the strict private-mode guard for this session',
  async run(ctx) {
    const mode = ctx.sessionSettings.mode || config.mode;
    await ctx.reply([
      '🔒 *A-X-HK PRIVATE GUARD*', '',
      `Current mode: ${String(mode).toUpperCase()}`,
      'Owner recognition: linked account + configured owner identity',
      'When PRIVATE: public/non-owner bot commands stay blocked.',
      'Auto AI and scheduled Time Reply remain independent and can still answer normal incoming messages when enabled.',
      'Only owner-level controls can switch private/public mode.'
    ].join('\n'));
  }
});
