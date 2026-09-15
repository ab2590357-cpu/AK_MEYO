import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { registerCommand } from '../../lib/core/registry.js';
import { logger } from '../../lib/core/logger.js';
import { config } from '../../lib/config.js';
import { contextInfo, unwrapMessage } from '../../lib/utils/message.js';
import { synthesizeSpeech } from '../../lib/services/ai.js';
import { deleteVoiceProfile, getVoiceStatus, saveVoiceSample, synthesizeCustomVoice, synthesizeElevenLabs, synthesizeFreeTTS, voiceSetupHelp } from '../../lib/services/voice-studio.js';

const execFileAsync = promisify(execFile);

function qmsg(ctx) { return contextInfo(ctx.msg)?.quotedMessage || null; }
function audioInfo(message = {}) {
  const m = unwrapMessage(message || {});
  if (m.audioMessage) return { node: m.audioMessage, mime: m.audioMessage.mimetype || 'audio/ogg', fileName: 'voice.ogg', kind: 'audio' };
  if (m.documentMessage && /^audio\//i.test(m.documentMessage.mimetype || '')) return { node: m.documentMessage, mime: m.documentMessage.mimetype, fileName: m.documentMessage.fileName || 'voice-audio', kind: 'document' };
  if (m.videoMessage) return { node: m.videoMessage, mime: m.videoMessage.mimetype || 'video/mp4', fileName: 'voice-video.mp4', kind: 'video' };
  return null;
}
async function getVoiceMedia(ctx) {
  let target = ctx.msg;
  let info = audioInfo(ctx.msg.message || {});
  const q = qmsg(ctx);
  if (!info && q) { target = { ...ctx.msg, message: q }; info = audioInfo(q); }
  if (!info) throw new Error('1-2 minute clean voice note/audio send karo, phir us par reply karke .setvoice likho.');
  const buffer = await downloadMediaMessage(target, 'buffer', {}, { logger, reuploadRequest: ctx.sock.updateMediaMessage });
  if (!buffer) throw new Error('Voice sample download nahi ho saki. Dobara voice note send karo.');
  return { buffer, ...info };
}
function voiceText(ctx) { return String(ctx.argText || '').trim(); }
function parseVoiceText(ctx) {
  const raw = voiceText(ctx);
  const m = raw.match(/^([a-z]{2})(?:-[a-z]{2})?\s+([\s\S]+)/i);
  if (m) return { text: m[2].trim(), lang: m[1].toLowerCase() };
  return { text: raw, lang: '' };
}
async function makeNormalVoice(text, { lang = '' } = {}) {
  const provider = String(config.voice?.provider || '').toLowerCase();
  let last = null;

  // If a dedicated premium voice provider is configured, use it first.
  if ((provider === 'elevenlabs' || provider === '11labs') && config.voice?.apiKey) {
    try { return { buffer: await synthesizeElevenLabs(text, { cloned: false }), source: 'ElevenLabs default', mime: 'audio/mpeg' }; }
    catch (err) { last = err; }
  }

  // Free no-key fallback keeps .voice/.say working on fresh Railway deploys.
  try { return { buffer: await synthesizeFreeTTS(text, { lang }), source: 'Free TTS', mime: 'audio/mpeg' }; }
  catch (err) { last = err; }

  // AI/OpenAI-compatible TTS is only a backup so unsupported AI gateways do not block the normal voice command first.
  try { return { buffer: await synthesizeSpeech(text), source: 'AI TTS', mime: 'audio/mpeg' }; }
  catch (err) { throw new Error(`Voice ready nahi ho saki. ${last?.message || ''} ${err?.message || ''}`.trim()); }
}
function voiceInputExt(mime = '', fileName = '') {
  const named = String(fileName || '').match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toLowerCase();
  if (named && ['mp3', 'ogg', 'opus', 'm4a', 'mp4', 'wav', 'webm', 'aac'].includes(named)) return named === 'opus' ? 'ogg' : named;
  const m = String(mime || '').toLowerCase();
  if (m.includes('ogg') || m.includes('opus')) return 'ogg';
  if (m.includes('mp4') || m.includes('m4a')) return 'm4a';
  if (m.includes('wav')) return 'wav';
  if (m.includes('webm')) return 'webm';
  if (m.includes('aac')) return 'aac';
  return 'mp3';
}

async function toWhatsAppVoiceNote(buffer, { mime = 'audio/mpeg', fileName = 'A-X-HK-voice.mp3' } = {}) {
  if (!buffer?.length) throw new Error('Voice audio empty hai.');
  const job = `axhk-voice-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const dir = path.join(os.tmpdir(), 'axhk-voice');
  await fs.mkdir(dir, { recursive: true });
  const inputPath = path.join(dir, `${job}.${voiceInputExt(mime, fileName)}`);
  const outputPath = path.join(dir, `${job}.ogg`);
  await fs.writeFile(inputPath, buffer);
  try {
    await execFileAsync('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-i', inputPath,
      '-vn', '-ac', '1', '-ar', '48000',
      '-c:a', 'libopus', '-b:a', '32k', '-application', 'voip',
      '-f', 'ogg', outputPath
    ], { timeout: 60_000, maxBuffer: 2 * 1024 * 1024, windowsHide: true });
    const opus = await fs.readFile(outputPath);
    if (!opus?.length || opus.length < 200) throw new Error('Converted audio invalid hai.');
    return opus;
  } finally {
    await fs.rm(inputPath, { force: true }).catch(() => {});
    await fs.rm(outputPath, { force: true }).catch(() => {});
  }
}

async function sendVoice(ctx, buffer, { ptt = true, mime = 'audio/mpeg', fileName = 'A-X-HK-voice.mp3', caption = '' } = {}) {
  if (!buffer?.length) throw new Error('Voice audio empty hai.');
  if (buffer.length > 16 * 1024 * 1024) throw new Error('Generated voice 16 MB se bari hai. Text short karo.');

  let audio = buffer;
  let mimetype = mime || 'audio/mpeg';
  let finalFileName = fileName;
  let finalPtt = Boolean(ptt);

  if (finalPtt) {
    try {
      audio = await toWhatsAppVoiceNote(buffer, { mime, fileName });
      mimetype = 'audio/ogg; codecs=opus';
      finalFileName = String(fileName || 'A-X-HK-voice.mp3').replace(/\.[a-z0-9]+$/i, '') + '.ogg';
    } catch (err) {
      logger.warn({ err: err?.message || err }, 'Voice note opus conversion failed; sending playable normal audio');
      finalPtt = false;
      mimetype = mime || 'audio/mpeg';
      audio = buffer;
    }
  }

  await ctx.send({ audio, mimetype, fileName: finalFileName, ptt: finalPtt }, { quoted: ctx.msg });
  if (caption) await ctx.reply(caption);
}
function statusCard(status) {
  const size = status.sampleBytes ? `${(status.sampleBytes / 1024 / 1024).toFixed(2)} MB` : '—';
  return [
    '╭━━━〔 🎙️ VOICE STUDIO 🎙️ 〕━━━╮',
    `┃ 🤖 Bot: ${config.shortName}`,
    `┃ 🔊 Provider: ${String(status.provider || 'AI TTS').toUpperCase()}`,
    `┃ ✅ API Ready: ${status.cloneApiReady ? 'YES' : 'NO'}`,
    `┃ 🎧 Sample: ${status.sampleExists ? 'SAVED' : 'NOT SAVED'}`,
    `┃ 📦 Size: ${size}`,
    `┃ 🧬 Clone ID: ${status.clonedVoiceId ? 'SAVED' : 'NOT SET'}`,
    status.sampleSavedAt ? `┃ 🕒 Saved: ${new Date(status.sampleSavedAt).toLocaleString('en-US', { timeZone: config.timezone })}` : '',
    status.lastError ? `┃ ⚠️ Last: ${status.lastError.slice(0, 80)}` : '',
    '╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
    '',
    '🔹 .voice <text>',
    '🔹 .say <text>',
    '🔹 .setvoice  (reply to 1-2 min voice note)',
    '🔹 .clonevoice <text>',
    '🔹 .delvoice'
  ].filter(Boolean).join('\n');
}

registerCommand({
  name: 'voice', aliases: ['aivoice', 'speak'], category: 'ai', description: 'Generate a normal AI voice note from text', usage: 'voice hello bro', cooldown: 8,
  async run(ctx) {
    const { text, lang } = parseVoiceText(ctx);
    if (!text) return ctx.reply(`Usage: ${ctx.prefix}voice hello bro`);
    try {
      const out = await makeNormalVoice(text.slice(0, 2500), { lang });
      await sendVoice(ctx, out.buffer, { ptt: true, mime: out.mime, fileName: 'A-X-HK-normal-voice.mp3' });
    } catch (err) {
      await ctx.reply(`${voiceSetupHelp(ctx.prefix)}

⚠️ ${String(err?.message || err).slice(0, 220)}`);
    }
  }
});

registerCommand({
  name: 'say', aliases: ['quickvoice', 'qvoice'], category: 'ai', description: 'Quick WhatsApp voice note from text', usage: 'say hello bro', cooldown: 8,
  async run(ctx) {
    const { text, lang } = parseVoiceText(ctx);
    if (!text) return ctx.reply(`Usage: ${ctx.prefix}say welcome to A-X-HK`);
    try {
      const out = await makeNormalVoice(text.slice(0, 1200), { lang });
      await sendVoice(ctx, out.buffer, { ptt: true, mime: out.mime, fileName: 'A-X-HK-say.mp3' });
    } catch (err) {
      await ctx.reply(`${voiceSetupHelp(ctx.prefix)}

⚠️ ${String(err?.message || err).slice(0, 220)}`);
    }
  }
});

registerCommand({
  name: 'setvoice', aliases: ['savevoice', 'voiceclone', 'setclone'], category: 'owner', ownerOnly: true,
  description: 'Save owner voice sample and create cloned voice when provider is configured', usage: 'setvoice (reply to 1-2 min voice note)', cooldown: 15,
  async run(ctx) {
    const media = await getVoiceMedia(ctx);
    const saved = await saveVoiceSample(media.buffer, { mime: media.mime, fileName: media.fileName, autoClone: true });
    await ctx.reply([
      '╭━━━〔 🧬 OWNER VOICE SAVED 🧬 〕━━━╮',
      `┃ 🎧 Sample: SAVED`,
      `┃ 📦 Size: ${(media.buffer.length / 1024 / 1024).toFixed(2)} MB`,
      `┃ 🧬 Clone: ${saved.cloneCreated ? 'CREATED' : 'PENDING API'}`,
      saved.needsApi ? '┃ 🔑 Set VOICE_API_KEY for real clone voice' : '',
      saved.lastError ? `┃ ⚠️ ${saved.lastError.slice(0, 120)}` : '',
      '╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
      '',
      `${ctx.prefix}clonevoice Assalam o alaikum welcome to A-X-HK`
    ].filter(Boolean).join('\n'));
  }
});

registerCommand({
  name: 'clonevoice', aliases: ['clonedvoice', 'vclone'], category: 'owner', ownerOnly: true,
  description: 'Generate speech using the saved owner cloned voice', usage: 'clonevoice your text', cooldown: 12,
  async run(ctx) {
    const text = voiceText(ctx);
    if (!text) return ctx.reply(`Usage: ${ctx.prefix}clonevoice Assalam o alaikum`);
    const status = await getVoiceStatus();
    const provider = String(status.provider || '').toLowerCase();
    const publicProvider = ['uncloseai', 'unturf', 'openai-tts', 'openai-speech'].includes(provider);
    if (!status.clonedVoiceId && !publicProvider) return ctx.reply('🧬 Voice ID saved nahi hai. Pehle 1-2 min voice note par reply karke .setvoice chalao. Free public TTS ke liye Railway me VOICE_PROVIDER=uncloseai set karo.');
    try {
      const audio = ['voiceforge', 'openvoice', 'custom', 'f5server', 'f5-tts-server', 'uncloseai', 'unturf', 'openai-tts', 'openai-speech'].includes(provider)
        ? await synthesizeCustomVoice(text.slice(0, 2500), { voiceId: status.clonedVoiceId })
        : await synthesizeElevenLabs(text.slice(0, 2500), { cloned: true });
      const mime = ['voiceforge', 'openvoice', 'custom', 'f5server', 'f5-tts-server'].includes(provider) ? 'audio/wav' : 'audio/mpeg';
      await sendVoice(ctx, audio, { ptt: true, mime, fileName: 'A-X-HK-cloned-voice.wav' });
    } catch (err) {
      await ctx.reply(`${voiceSetupHelp(ctx.prefix)}

⚠️ ${String(err?.message || err).slice(0, 220)}`);
    }
  }
});

registerCommand({
  name: 'voiceinfo', aliases: ['voicestatus'], category: 'owner', ownerOnly: true, description: 'Show saved voice sample and clone status', cooldown: 3,
  async run(ctx) { await ctx.reply(statusCard(await getVoiceStatus())); }
});

registerCommand({
  name: 'delvoice', aliases: ['deletevoice', 'resetvoice'], category: 'owner', ownerOnly: true, description: 'Delete local owner voice sample/clone state', cooldown: 10,
  async run(ctx) { await deleteVoiceProfile({ remote: config.voice?.deleteRemote }); await ctx.reply('🗑️ Owner voice sample/clone state deleted.'); }
});

registerCommand({
  name: 'voiceprovider', aliases: ['voiceapi', 'freevoice'], category: 'owner', ownerOnly: true,
  description: 'Show free voice clone provider setup options', cooldown: 3,
  async run(ctx) {
    const status = await getVoiceStatus();
    await ctx.reply([
      '╭━━━〔 🧬 VOICE PROVIDER 〕━━━╮',
      `┃ Provider: ${String(status.provider || 'none').toUpperCase()}`,
      `┃ Clone API: ${status.cloneApiReady ? 'READY' : 'NOT READY'}`,
      `┃ Saved Voice: ${status.clonedVoiceId ? 'YES' : 'NO'}`,
      '╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
      '',
      'Fast free public TTS setup:',
      'VOICE_PROVIDER=uncloseai',
      'VOICE_CUSTOM_URL=https://speech.ai.unturf.com/v1',
      'VOICE_CUSTOM_MODEL=tts-1-f5',
      'VOICE_CUSTOM_VOICE=atlas',
      '',
      'Self-hosted real clone setup:',
      'VOICE_PROVIDER=voiceforge',
      'VOICE_CUSTOM_URL=https://your-voiceforge-url',
      'VOICE_CUSTOM_ENGINE=openvoice-v2',
      '',
      'Commands:',
      `${ctx.prefix}setvoice  (reply voice note)`,
      `${ctx.prefix}clonevoice your text`
    ].join('\n'));
  }
});
