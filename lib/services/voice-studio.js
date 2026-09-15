import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { truncate } from '../utils/text.js';

const MAX_SAMPLE_BYTES = 30 * 1024 * 1024;
const MAX_TEXT = 2500;
const voiceDir = path.join(config.dataDir, 'voice');
const statePath = path.join(voiceDir, 'voice-state.json');

const FREE_TTS_LANGS = new Set(['en','ur','hi','ar','es','fr','de','it','pt','tr','id','ms','bn','pa','fa','zh','ja','ko']);
function normalizeTtsLang(lang = '', text = '') {
  const raw = String(lang || '').trim().toLowerCase().replace(/[^a-z-]/g, '');
  const base = raw.split('-')[0];
  if (FREE_TTS_LANGS.has(base)) return base;
  const sample = String(text || '');
  if (/[\u0600-\u06FF]/.test(sample)) return 'ur';
  if (/[\u0900-\u097F]/.test(sample)) return 'hi';
  if (/[\u4E00-\u9FFF]/.test(sample)) return 'zh';
  if (/[\u3040-\u30FF]/.test(sample)) return 'ja';
  if (/[\uAC00-\uD7AF]/.test(sample)) return 'ko';
  return 'en';
}
function freeTtsText(value = '') {
  const text = safeText(value, 220).replace(/\s+/g, ' ').trim();
  if (!text) throw new Error('Voice text is empty.');
  if (String(value || '').trim().length > 220) throw new Error('Free voice max 220 characters hai. Long text ke liye VOICE_API_KEY set karo.');
  return text;
}
export async function synthesizeFreeTTS(text, { lang = 'en' } = {}) {
  const input = freeTtsText(text);
  const tl = normalizeTtsLang(lang, input);
  const qs = new URLSearchParams({ ie: 'UTF-8', q: input, tl, client: 'tw-ob' });
  const response = await fetch(`https://translate.google.com/translate_tts?${qs.toString()}`, {
    headers: {
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
      accept: 'audio/mpeg,*/*;q=0.8'
    },
    signal: AbortSignal.timeout(25000)
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Free TTS returned ${response.status}: ${truncate(detail, 180)}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length) throw new Error('Free TTS returned empty audio.');
  return buffer;
}
export function voiceSetupHelp(prefix = '.') {
  return [
    '╭━━━〔 🎙️ VOICE SETUP 〕━━━╮',
    '┃ ✅ Normal short voice: no API fallback included',
    '┃ 🔑 Premium/clone voice: API required',
    '┃ 🧬 Clone: reply voice note with .setvoice',
    '╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
    '',
    `Try: ${prefix}voice hello bro`,
    `Urdu/Hindi: ${prefix}voice ur assalam o alaikum`,
    '',
    'For paid clone: VOICE_PROVIDER=elevenlabs + VOICE_API_KEY',
    'For free public TTS: VOICE_PROVIDER=uncloseai',
    'VOICE_CUSTOM_URL=https://your-free-voice-api',
    'VOICE_CUSTOM_ENGINE=openvoice-v2'
  ].join('\n');
}


function nowIso() { return new Date().toISOString(); }
function safeText(value = '', max = MAX_TEXT) {
  const text = String(value || '').replace(/[\r\t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  if (!text) throw new Error('Voice text is empty.');
  return text.slice(0, max);
}
function extFor(mime = '', fileName = '') {
  const fromName = String(fileName || '').match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toLowerCase();
  if (fromName && ['ogg','opus','mp3','m4a','mp4','wav','webm','aac','flac'].includes(fromName)) return fromName;
  const m = String(mime || '').toLowerCase();
  if (m.includes('ogg') || m.includes('opus')) return 'ogg';
  if (m.includes('mpeg') || m.includes('mp3')) return 'mp3';
  if (m.includes('mp4') || m.includes('m4a')) return 'm4a';
  if (m.includes('wav')) return 'wav';
  if (m.includes('webm')) return 'webm';
  if (m.includes('flac')) return 'flac';
  return 'ogg';
}
function mimeForExt(ext = 'ogg') {
  return ({ ogg: 'audio/ogg', opus: 'audio/ogg', mp3: 'audio/mpeg', m4a: 'audio/mp4', mp4: 'audio/mp4', wav: 'audio/wav', webm: 'audio/webm', aac: 'audio/aac', flac: 'audio/flac' })[ext] || 'application/octet-stream';
}
function isElevenLabs() {
  const provider = String(config.voice?.provider || '').toLowerCase();
  return provider === 'elevenlabs' || provider === '11labs' || Boolean(config.voice?.apiKey && provider === '');
}
function requireElevenLabs() {
  if (!isElevenLabs() || !config.voice?.apiKey) throw new Error('Clone voice provider is not configured. Set VOICE_PROVIDER=elevenlabs and VOICE_API_KEY in Railway variables.');
}
function customProviderKind() {
  const provider = String(config.voice?.provider || '').toLowerCase();
  if (['voiceforge', 'openvoice', 'f5server', 'f5-tts-server', 'custom', 'uncloseai', 'unturf', 'openai-tts', 'openai-speech'].includes(provider)) return provider;
  return '';
}
function isOpenAiSpeechProvider(kind = customProviderKind()) {
  return ['uncloseai', 'unturf', 'openai-tts', 'openai-speech'].includes(String(kind || '').toLowerCase());
}
function isCustomVoiceProvider() {
  const kind = customProviderKind();
  return Boolean(kind && (isOpenAiSpeechProvider(kind) || config.voice?.customUrl));
}
function joinCustomUrl(pathPart = '') {
  const kind = customProviderKind();
  const fallbackBase = isOpenAiSpeechProvider(kind) ? 'https://speech.ai.unturf.com/v1' : '';
  const base = String(config.voice?.customUrl || fallbackBase).replace(/\/+$/, '');
  const part = String(pathPart || '').trim();
  if (!base) throw new Error('Free voice provider URL missing hai. Set VOICE_CUSTOM_URL in Railway.');
  if (/^https?:\/\//i.test(part)) return part;
  return `${base}/${part.replace(/^\/+/, '')}`;
}
function customHeaders(extra = {}) {
  const headers = { ...extra };
  if (config.voice?.customApiKey) headers.authorization = `Bearer ${config.voice.customApiKey}`;
  return headers;
}
async function customFetch(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: customHeaders(options.headers || {}),
    signal: options.signal || AbortSignal.timeout(config.voice?.customTimeoutMs || 180000)
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Free voice API returned ${response.status}: ${truncate(detail, 320)}`);
  }
  return response;
}
function parseVoiceId(data = {}) {
  return data.voiceId || data.voice_id || data.id || data.voice?.id || data.data?.voiceId || data.data?.id || data.filename || data.path || data.ref_audio || '';
}
async function createVoiceForgeClone(buffer, { mime = 'audio/ogg', fileName = 'owner-voice.ogg' } = {}) {
  const form = new FormData();
  form.append('name', `${config.shortName} Owner Voice`.slice(0, 80));
  form.append('engine_id', config.voice?.customEngine || 'openvoice-v2');
  form.append('tier', 'instant');
  form.append('consent', 'true');
  form.append('language', config.voice?.customLanguage || 'en');
  form.append('files', new Blob([buffer], { type: mime }), fileName);
  const response = await customFetch(joinCustomUrl(config.voice?.customCreatePath || '/v1/voices'), { method: 'POST', body: form, headers: {} });
  const data = await response.json().catch(() => ({}));
  const voiceId = parseVoiceId(data);
  if (!voiceId) throw new Error('Free voice API ne voice id return nahi ki.');
  return { voiceId, voiceName: data.name || `${config.shortName} VoiceForge`, raw: data };
}
async function createF5ServerReference(buffer, { mime = 'audio/ogg', fileName = 'owner-voice.ogg' } = {}) {
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: mime }), fileName);
  const response = await customFetch(joinCustomUrl(config.voice?.customCreatePath || '/upload-ref-audio/'), { method: 'POST', body: form, headers: {} });
  const data = await response.json().catch(() => ({}));
  const voiceId = parseVoiceId(data);
  if (!voiceId) throw new Error('F5-TTS server ne reference audio filename return nahi ki.');
  return { voiceId, voiceName: data.name || 'F5-TTS Reference', raw: data };
}
async function createOpenAiSpeechReference() {
  // Public OpenAI-compatible TTS endpoints (like uncloseai) do not accept owner sample uploads.
  // We save a stable selected voice name so .clonevoice works immediately with the same clear public voice.
  const selectedVoice = String(config.voice?.customVoice || config.voice?.defaultVoiceId || 'atlas').trim() || 'atlas';
  return { voiceId: selectedVoice, voiceName: `OpenAI Speech ${selectedVoice}`, raw: { publicTtsVoice: selectedVoice, note: 'public built-in voice; not owner voice clone' } };
}
async function synthesizeOpenAiSpeech(text, { voiceId = '' } = {}) {
  const input = safeText(text);
  const response = await customFetch(joinCustomUrl(config.voice?.customSynthPath || '/audio/speech'), {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'audio/mpeg,audio/wav,*/*' },
    body: JSON.stringify({
      model: config.voice?.customModel || 'tts-1-f5',
      voice: voiceId || config.voice?.customVoice || config.voice?.defaultVoiceId || 'atlas',
      input,
      speed: config.voice?.customSpeed || 1
    })
  });
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length) throw new Error('Free OpenAI-compatible TTS returned empty audio.');
  return buffer;
}
async function createCustomCloneFromSample(buffer, opts = {}) {
  const kind = customProviderKind();
  if (!isCustomVoiceProvider()) throw new Error('Free voice provider not configured. Set VOICE_PROVIDER=voiceforge/uncloseai and VOICE_CUSTOM_URL.');
  if (isOpenAiSpeechProvider(kind)) return createOpenAiSpeechReference();
  if (kind === 'f5server' || kind === 'f5-tts-server') return createF5ServerReference(buffer, opts);
  return createVoiceForgeClone(buffer, opts);
}
export async function synthesizeCustomVoice(text, { voiceId = '' } = {}) {
  const input = safeText(text);
  if (!isCustomVoiceProvider()) throw new Error('Free voice provider not configured. Set VOICE_PROVIDER=voiceforge and VOICE_CUSTOM_URL.');
  const state = await readState();
  const kind = customProviderKind();
  const id = voiceId || state.voiceId || state.refAudio || config.voice?.clonedVoiceId || (isOpenAiSpeechProvider(kind) ? (config.voice?.customVoice || config.voice?.defaultVoiceId || 'atlas') : '');
  if (!id) throw new Error('Free cloned voice ID/ref audio saved nahi hai. .setvoice dobara chalao.');
  if (isOpenAiSpeechProvider(kind)) return synthesizeOpenAiSpeech(input, { voiceId: id });
  let response;
  if (kind === 'f5server' || kind === 'f5-tts-server') {
    response = await customFetch(joinCustomUrl(config.voice?.customSynthPath || '/tts/'), {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'audio/wav,audio/mpeg,*/*' },
      body: JSON.stringify({ gen_text: input, ref_audio: id, speed: config.voice?.customSpeed || 1, nfe_steps: config.voice?.customSteps || 32 })
    });
  } else {
    response = await customFetch(joinCustomUrl(config.voice?.customSynthPath || '/v1/synthesize'), {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'audio/wav,audio/mpeg,*/*' },
      body: JSON.stringify({ voiceId: id, voice_id: id, text: input, gen_text: input, language: config.voice?.customLanguage || 'en' })
    });
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length) throw new Error('Free voice API returned empty audio.');
  return buffer;
}
async function ensureDir() { await fs.mkdir(voiceDir, { recursive: true }); }
async function readState() {
  try { return JSON.parse(await fs.readFile(statePath, 'utf8')); } catch { return {}; }
}
async function writeState(next) {
  await ensureDir();
  await fs.writeFile(statePath, JSON.stringify({ ...next, updatedAt: nowIso() }, null, 2));
}

export async function getVoiceStatus() {
  const state = await readState();
  const kind = customProviderKind();
  let sampleExists = false;
  let sampleBytes = 0;
  if (state.samplePath) {
    try { const stat = await fs.stat(state.samplePath); sampleExists = stat.isFile(); sampleBytes = stat.size; } catch {}
  }
  return {
    provider: isElevenLabs() ? 'elevenlabs' : (isCustomVoiceProvider() ? customProviderKind() : (config.voice?.provider || 'ai-tts')),
    configured: Boolean((isElevenLabs() && config.voice?.apiKey) || isCustomVoiceProvider() || config.ai?.apiKey),
    cloneApiReady: Boolean((isElevenLabs() && config.voice?.apiKey) || isCustomVoiceProvider()),
    defaultVoiceId: config.voice?.defaultVoiceId || '',
    clonedVoiceId: state.voiceId || state.refAudio || config.voice?.clonedVoiceId || (isOpenAiSpeechProvider(kind) ? (config.voice?.customVoice || config.voice?.defaultVoiceId || 'atlas') : '') || '',
    sampleExists,
    sampleBytes,
    sampleMime: state.sampleMime || '',
    sampleName: state.sampleName || '',
    sampleSavedAt: state.sampleSavedAt || null,
    voiceCreatedAt: state.voiceCreatedAt || null,
    lastError: state.lastError || ''
  };
}

async function elevenFetch(url, options = {}) {
  requireElevenLabs();
  const response = await fetch(url, {
    ...options,
    headers: { 'xi-api-key': config.voice.apiKey, ...(options.headers || {}) },
    signal: options.signal || AbortSignal.timeout(120000)
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Voice API returned ${response.status}: ${truncate(detail, 320)}`);
  }
  return response;
}

export async function synthesizeElevenLabs(text, { voiceId = '', cloned = false } = {}) {
  const input = safeText(text);
  const id = voiceId || (cloned ? (await readState()).voiceId || config.voice?.clonedVoiceId : config.voice?.defaultVoiceId);
  if (!id) throw new Error('No voice ID is configured. Set VOICE_DEFAULT_ID or save a cloned voice with .setvoice.');
  const url = `${config.voice.baseUrl}/text-to-speech/${encodeURIComponent(id)}?output_format=${encodeURIComponent(config.voice.outputFormat || 'mp3_44100_128')}`;
  const response = await elevenFetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'audio/mpeg' },
    body: JSON.stringify({
      text: input,
      model_id: config.voice.model || 'eleven_multilingual_v2',
      voice_settings: {
        stability: Number.isFinite(config.voice.stability) ? config.voice.stability : 0.45,
        similarity_boost: Number.isFinite(config.voice.similarityBoost) ? config.voice.similarityBoost : 0.85
      }
    })
  });
  return Buffer.from(await response.arrayBuffer());
}

export async function createCloneFromSample(buffer, { mime = 'audio/ogg', fileName = 'owner-voice.ogg', name = '' } = {}) {
  requireElevenLabs();
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw new Error('Voice sample is empty.');
  const form = new FormData();
  const voiceName = String(name || `${config.shortName} Owner Voice ${Date.now()}`).slice(0, 80);
  form.append('name', voiceName);
  form.append('description', `${config.shortName} owner voice sample. Use only with owner permission.`.slice(0, 500));
  form.append('remove_background_noise', 'true');
  form.append('files', new Blob([buffer], { type: mime }), fileName);
  const response = await elevenFetch(`${config.voice.baseUrl}/voices/add`, { method: 'POST', body: form, headers: {} });
  const data = await response.json().catch(() => ({}));
  const voiceId = data.voice_id || data.voiceId || data.id;
  if (!voiceId) throw new Error('Voice API did not return a voice_id.');
  return { voiceId, voiceName };
}

export async function saveVoiceSample(buffer, { mime = 'audio/ogg', fileName = 'owner-voice.ogg', autoClone = true } = {}) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw new Error('Voice sample is empty.');
  if (buffer.length > MAX_SAMPLE_BYTES) throw new Error('Voice sample is larger than 30 MB. Use a clean 1-2 minute voice note.');
  const ext = extFor(mime, fileName);
  const finalMime = mime || mimeForExt(ext);
  await ensureDir();
  const samplePath = path.join(voiceDir, `owner-voice.${ext}`);
  await fs.writeFile(samplePath, buffer);
  const state = await readState();
  const next = {
    ...state,
    samplePath,
    sampleMime: finalMime,
    sampleName: fileName || `owner-voice.${ext}`,
    sampleBytes: buffer.length,
    sampleSavedAt: nowIso(),
    lastError: ''
  };
  let clone = null;
  if (autoClone && config.voice?.cloneAuto !== false && ((isElevenLabs() && config.voice?.apiKey) || isCustomVoiceProvider())) {
    try {
      clone = (isElevenLabs() && config.voice?.apiKey)
        ? await createCloneFromSample(buffer, { mime: finalMime, fileName: next.sampleName })
        : await createCustomCloneFromSample(buffer, { mime: finalMime, fileName: next.sampleName });
      next.voiceId = clone.voiceId;
      next.voiceName = clone.voiceName;
      next.voiceCreatedAt = nowIso();
      if (customProviderKind().startsWith('f5')) next.refAudio = clone.voiceId;
    } catch (err) {
      next.lastError = truncate(err?.message || String(err), 500);
    }
  }
  await writeState(next);
  return { ...next, cloneCreated: Boolean(clone), needsApi: !clone && !((isElevenLabs() && config.voice?.apiKey) || isCustomVoiceProvider()) };
}

export async function deleteVoiceProfile({ remote = config.voice?.deleteRemote } = {}) {
  const state = await readState();
  const voiceId = state.voiceId;
  if (remote && voiceId && isElevenLabs() && config.voice?.apiKey) {
    try { await elevenFetch(`${config.voice.baseUrl}/voices/${encodeURIComponent(voiceId)}`, { method: 'DELETE' }); } catch {}
  }
  if (state.samplePath) await fs.rm(state.samplePath, { force: true }).catch(() => {});
  await fs.rm(statePath, { force: true }).catch(() => {});
  return true;
}
