import { config } from '../config.js';
import { truncate } from '../utils/text.js';

let lastWorkingModel = '';
let modelCache = { at: 0, models: [] };
const badModelUntil = new Map();
const runtime = {
  attempts: 0,
  successes: 0,
  failures: 0,
  retries: 0,
  discoveries: 0,
  lastModel: '',
  lastLatencyMs: 0,
  lastSuccessAt: null,
  lastErrorAt: null,
  lastError: ''
};

const MODEL_CACHE_MS = 5 * 60 * 1000;
const BAD_MODEL_MS = 10 * 60 * 1000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function ensureAI() {
  if (!config.ai.enabled) throw new Error('AI is disabled. Set AI_ENABLED=true.');
  if (!config.ai.apiKey) throw new Error('AI_API_KEY is not configured.');
}

function uniqueModels(values = []) {
  return [...new Set(values.map((v) => String(v || '').trim()).filter(Boolean))];
}

function isAutoModel(value) {
  return ['', 'auto', 'automatic', 'discover', 'default'].includes(String(value || '').trim().toLowerCase());
}

function modelRouteError(status, detail = '') {
  return [400, 404, 408, 409, 429, 500, 502, 503, 504].includes(Number(status)) &&
    /model[_ -]?not[_ -]?found|no available channel|model .*unavailable|invalid model|unknown model|unsupported model|route .*model|no route|channel .*unavailable|provider .*unavailable/i.test(String(detail));
}

function transientError(err) {
  const status = Number(err?.status || 0);
  if (modelRouteError(status, err?.detail || err?.message)) return false;
  if (['AbortError', 'TimeoutError'].includes(String(err?.name || ''))) return true;
  return [408, 409, 425, 429, 500, 502, 503, 504].includes(status);
}

function recordFailure(err) {
  runtime.failures += 1;
  runtime.lastErrorAt = new Date().toISOString();
  runtime.lastError = truncate(err?.detail || err?.message || String(err), 500);
}

function chatModelScore(model, preferred = '') {
  const id = String(model || '').toLowerCase();
  let score = 0;
  if (!id) return -999;
  if (preferred && !isAutoModel(preferred) && id === String(preferred).toLowerCase()) score += 1000;
  if (/gpt|claude|gemini|grok|deepseek|llama|mistral|qwen|chat|instruct|sonnet|opus|haiku/.test(id)) score += 50;
  if (/mini|flash|small|lite|turbo/.test(id)) score += 8;
  if (/latest/.test(id)) score += 6;
  if (/embedding|embed|rerank|moderation|whisper|transcri|speech|tts|audio|image|dall|vision-only|realtime/.test(id)) score -= 200;
  return score;
}

function orderChatModels(models, preferred = '') {
  return uniqueModels(models)
    .filter((model) => model && !isAutoModel(model))
    .sort((a, b) => chatModelScore(b, preferred) - chatModelScore(a, preferred));
}

function extractModelRows(data) {
  const candidates = [data?.data, data?.models, data?.result, data?.result?.data, data?.result?.models, data?.data?.models];
  return candidates.find(Array.isArray) || [];
}

function isTemporarilyBad(model) {
  const until = badModelUntil.get(model) || 0;
  if (until <= Date.now()) {
    badModelUntil.delete(model);
    return false;
  }
  return true;
}

function markBadModel(model) {
  if (model) badModelUntil.set(model, Date.now() + BAD_MODEL_MS);
}

export function getAIStatus() {
  return {
    enabled: config.ai.enabled,
    baseUrl: config.ai.baseUrl,
    configuredModel: config.ai.model,
    fallbackModels: [...(config.ai.fallbackModels || [])],
    lastWorkingModel,
    timeoutMs: config.ai.timeoutMs,
    retriesConfigured: config.ai.retries,
    cachedModels: modelCache.models.length,
    temporarilyBlockedModels: [...badModelUntil.keys()].filter((model) => isTemporarilyBad(model)),
    ...runtime
  };
}

export function resetAIState() {
  lastWorkingModel = '';
  modelCache = { at: 0, models: [] };
  badModelUntil.clear();
  runtime.attempts = 0;
  runtime.successes = 0;
  runtime.failures = 0;
  runtime.retries = 0;
  runtime.discoveries = 0;
  runtime.lastModel = '';
  runtime.lastLatencyMs = 0;
  runtime.lastSuccessAt = null;
  runtime.lastErrorAt = null;
  runtime.lastError = '';
}

export async function listAIModels({ timeoutMs = 15000, refresh = false } = {}) {
  ensureAI();
  if (!refresh && modelCache.models.length && Date.now() - modelCache.at < MODEL_CACHE_MS) {
    return [...modelCache.models];
  }
  runtime.discoveries += 1;
  const response = await fetch(`${config.ai.baseUrl}/models`, {
    headers: { authorization: `Bearer ${config.ai.apiKey}` },
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`AI model list returned ${response.status}: ${truncate(detail, 300)}`);
  }
  const data = await response.json();
  const rows = extractModelRows(data);
  const models = uniqueModels(rows.map((row) => typeof row === 'string'
    ? row
    : (row?.id || row?.model || row?.name || row?.slug || row?.model_name)));
  modelCache = { at: Date.now(), models };
  return [...models];
}

async function chatOnce(model, prompt, user, options) {
  const started = Date.now();
  runtime.attempts += 1;
  runtime.lastModel = model;
  const payload = {
    model,
    messages: [
      { role: 'system', content: options.systemPrompt || config.ai.systemPrompt },
      { role: 'user', content: String(prompt) }
    ],
    user: String(user).slice(0, 64)
  };

  // Newer OpenAI reasoning/chat models may reject custom temperature values.
  // Omit temperature by default so the provider can use the model-supported default.
  // Explicit temperature can still be enabled for compatible models with forceTemperature.
  if (options.forceTemperature === true && Number.isFinite(options.temperature)) {
    payload.temperature = options.temperature;
  }

  const response = await fetch(`${config.ai.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${config.ai.apiKey}`
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(options.timeoutMs || config.ai.timeoutMs || 60000)
  });

  runtime.lastLatencyMs = Date.now() - started;
  if (!response.ok) {
    const detail = await response.text();
    const err = new Error(`AI provider returned ${response.status}: ${truncate(detail, 300)}`);
    err.status = response.status;
    err.detail = detail;
    throw err;
  }
  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error('AI provider returned no text.');
  runtime.successes += 1;
  runtime.lastSuccessAt = new Date().toISOString();
  runtime.lastError = '';
  return truncate(text, options.maxChars || 3900);
}

async function chatWithRetry(model, prompt, user, options) {
  const retryLimit = Number.isInteger(options.retries) ? options.retries : config.ai.retries;
  let lastError = null;
  for (let attempt = 0; attempt <= retryLimit; attempt += 1) {
    try {
      return await chatOnce(model, prompt, user, options);
    } catch (err) {
      lastError = err;
      if (modelRouteError(err?.status, err?.detail || err?.message)) throw err;
      if (!transientError(err) || attempt >= retryLimit) throw err;
      runtime.retries += 1;
      const base = Number(options.retryBaseMs || config.ai.retryBaseMs || 1200);
      const jitter = Math.floor(Math.random() * 350);
      await sleep(Math.min(10000, base * (2 ** attempt)) + jitter);
    }
  }
  throw lastError || new Error('AI request failed.');
}

export async function askAI(prompt, user = 'whatsapp-user', options = {}) {
  ensureAI();
  const preferred = String(options.model || config.ai.model || '').trim();
  const configured = uniqueModels([
    lastWorkingModel,
    ...(isAutoModel(preferred) ? [] : [preferred]),
    ...(Array.isArray(options.fallbackModels) ? options.fallbackModels : []),
    ...(config.ai.fallbackModels || [])
  ]).filter((model) => !isTemporarilyBad(model));

  let candidates = [...configured];
  let lastError = null;
  let discovered = false;

  // The AI hotfix from V4.9.2 is intentionally preserved here: automatic mode
  // discovers live provider routes first, while explicit models keep a fast path.
  if (!candidates.length || isAutoModel(preferred)) {
    discovered = true;
    try {
      const live = await listAIModels({ timeoutMs: Math.min(15000, options.timeoutMs || 15000) });
      candidates = orderChatModels([...candidates, ...live], preferred).filter((model) => !isTemporarilyBad(model));
    } catch (err) {
      lastError = err;
    }
  }

  if (!candidates.length && lastError) {
    recordFailure(lastError);
    throw lastError;
  }
  if (!candidates.length) {
    const err = new Error('AI provider returned no usable chat model IDs. Set AI_MODEL to a live model or configure AI_FALLBACK_MODELS.');
    recordFailure(err);
    throw err;
  }

  for (let index = 0; index < candidates.length; index += 1) {
    const model = candidates[index];
    try {
      const text = await chatWithRetry(model, prompt, user, options);
      lastWorkingModel = model;
      badModelUntil.delete(model);
      return text;
    } catch (err) {
      lastError = err;
      if (!modelRouteError(err?.status, err?.detail || err?.message)) {
        recordFailure(err);
        throw err;
      }
      markBadModel(model);

      if (!discovered) {
        discovered = true;
        try {
          const live = await listAIModels({ timeoutMs: Math.min(15000, options.timeoutMs || 15000), refresh: true });
          const remaining = candidates.slice(index + 1);
          const fresh = orderChatModels(live, preferred).filter((item) => !isTemporarilyBad(item));
          candidates = uniqueModels([...candidates.slice(0, index + 1), ...remaining, ...fresh]);
        } catch (discoveryErr) {
          if (!lastError) lastError = discoveryErr;
        }
      }
    }
  }

  recordFailure(lastError || new Error('No usable AI model route.'));
  const detail = truncate(lastError?.detail || lastError?.message || 'No usable AI model route.', 220);
  throw new Error(`AI provider has no currently routable chat model. A-X-HK tried configured models, fallbacks and live provider discovery. ${detail}`);
}

export async function testAI(prompt = 'Reply with exactly: A-X-HK AI OK', options = {}) {
  const started = Date.now();
  const text = await askAI(prompt, 'owner-ai-test', { ...options, maxChars: 800, temperature: 0.1 });
  return { text, latencyMs: Date.now() - started, status: getAIStatus() };
}

export async function transcribeAudio(buffer, { fileName = 'voice.ogg', mimeType = 'audio/ogg' } = {}) {
  ensureAI();
  const form = new FormData();
  form.append('model', config.ai.transcriptionModel);
  form.append('file', new Blob([buffer], { type: mimeType }), fileName);
  const response = await fetch(`${config.ai.baseUrl}/audio/transcriptions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${config.ai.apiKey}` },
    body: form,
    signal: AbortSignal.timeout(Math.max(60000, config.ai.timeoutMs || 60000))
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Transcription provider returned ${response.status}: ${truncate(detail, 300)}`);
  }
  const data = await response.json();
  const text = data?.text || data?.transcript;
  if (!text) throw new Error('Transcription provider returned no text.');
  return truncate(text, 3900);
}

export async function synthesizeSpeech(text, { voice = config.ai.ttsVoice } = {}) {
  ensureAI();
  const value = String(text || '').trim();
  if (!value) throw new Error('Provide text for TTS.');
  const response = await fetch(`${config.ai.baseUrl}/audio/speech`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${config.ai.apiKey}`
    },
    body: JSON.stringify({ model: config.ai.ttsModel, voice, input: value.slice(0, 3000), format: 'mp3' }),
    signal: AbortSignal.timeout(Math.max(60000, config.ai.timeoutMs || 60000))
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`TTS provider returned ${response.status}: ${truncate(detail, 300)}`);
  }
  return Buffer.from(await response.arrayBuffer());
}


function parseProviderTextContent(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value.map((row) => typeof row === 'string' ? row : (row?.text || row?.content || '')).filter(Boolean).join('\n');
  }
  return '';
}

async function imageResultBuffer(data) {
  const row = data?.data?.[0] || data?.result?.data?.[0] || data?.result?.[0] || {};
  const b64 = row?.b64_json || row?.b64 || row?.base64;
  if (b64) return Buffer.from(String(b64), 'base64');
  const url = row?.url;
  if (url) {
    const response = await fetch(url, { signal: AbortSignal.timeout(Math.max(60000, config.ai.timeoutMs || 60000)) });
    if (!response.ok) throw new Error(`AI image download returned ${response.status}.`);
    return Buffer.from(await response.arrayBuffer());
  }
  throw new Error('AI image provider returned no image data.');
}

export async function generateAIImage(prompt, { size = '1024x1024', transparent = false } = {}) {
  ensureAI();
  const value = String(prompt || '').trim();
  if (!value) throw new Error('Provide an image prompt.');
  const payload = {
    model: config.ai.imageModel,
    prompt: value.slice(0, 3500),
    size
  };
  if (transparent) payload.background = 'transparent';

  const response = await fetch(`${config.ai.baseUrl}/images/generations`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${config.ai.apiKey}`
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(Math.max(120000, config.ai.timeoutMs || 60000))
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`AI image provider returned ${response.status}: ${truncate(detail, 300)}`);
  }
  return imageResultBuffer(await response.json());
}

export async function editAIImage(buffer, prompt, { fileName = 'image.png', mimeType = 'image/png', size = '1024x1024' } = {}) {
  ensureAI();
  if (!buffer?.length) throw new Error('Provide an image to edit.');
  const value = String(prompt || '').trim();
  if (!value) throw new Error('Provide image edit instructions.');

  const form = new FormData();
  form.append('model', config.ai.imageModel);
  form.append('prompt', value.slice(0, 3500));
  form.append('size', size);
  form.append('image', new Blob([buffer], { type: mimeType }), fileName);

  const response = await fetch(`${config.ai.baseUrl}/images/edits`, {
    method: 'POST',
    headers: { authorization: `Bearer ${config.ai.apiKey}` },
    body: form,
    signal: AbortSignal.timeout(Math.max(120000, config.ai.timeoutMs || 60000))
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`AI image edit provider returned ${response.status}: ${truncate(detail, 300)}`);
  }
  return imageResultBuffer(await response.json());
}

export async function askAIVision(prompt, imageBuffer, { mimeType = 'image/jpeg', maxChars = 2600 } = {}) {
  ensureAI();
  if (!imageBuffer?.length) throw new Error('Provide an image for vision analysis.');
  const preferred = String(config.ai.visionModel || config.ai.model || '').trim();
  let candidates = uniqueModels([
    ...(config.ai.visionModel ? [config.ai.visionModel] : []),
    ...(!isAutoModel(preferred) ? [preferred] : []),
    ...(config.ai.fallbackModels || [])
  ]);

  try {
    const live = await listAIModels({ timeoutMs: Math.min(15000, config.ai.timeoutMs || 15000) });
    const visionish = orderChatModels(live, preferred).filter((id) => !/embedding|moderation|audio|speech|transcri|tts|image-only|realtime/i.test(id));
    candidates = uniqueModels([...candidates, ...visionish]);
  } catch {}

  if (!candidates.length) throw new Error('No AI vision-capable chat model is available.');

  const dataUrl = `data:${mimeType || 'image/jpeg'};base64,${Buffer.from(imageBuffer).toString('base64')}`;
  let lastError = null;

  for (const model of candidates.slice(0, 10)) {
    try {
      const response = await fetch(`${config.ai.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${config.ai.apiKey}`
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: 'You are A-X-HK visual assistant. Be accurate, concise and useful. If text in the image is unclear, say so instead of guessing.' },
            {
              role: 'user',
              content: [
                { type: 'text', text: String(prompt || 'Explain this image.').slice(0, 2500) },
                { type: 'image_url', image_url: { url: dataUrl } }
              ]
            }
          ]
        }),
        signal: AbortSignal.timeout(Math.max(90000, config.ai.timeoutMs || 60000))
      });

      if (!response.ok) {
        const detail = await response.text();
        const err = new Error(`AI vision provider returned ${response.status}: ${truncate(detail, 260)}`);
        err.status = response.status;
        err.detail = detail;
        lastError = err;
        const unsupportedVision = response.status === 400 && /image|vision|multimodal|content.*type|unsupported/i.test(detail);
        if (modelRouteError(response.status, detail) || unsupportedVision) {
          markBadModel(model);
          continue;
        }
        throw err;
      }

      const data = await response.json();
      const text = parseProviderTextContent(data?.choices?.[0]?.message?.content);
      if (!text) throw new Error('AI vision provider returned no text.');
      return truncate(text, maxChars);
    } catch (err) {
      lastError = err;
      if (!(err?.status === 400 || modelRouteError(err?.status, err?.detail || err?.message))) throw err;
    }
  }

  throw lastError || new Error('No AI vision-capable model route worked.');
}
