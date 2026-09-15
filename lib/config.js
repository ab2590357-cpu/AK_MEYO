import 'dotenv/config';
import os from 'node:os';
import path from 'node:path';

const bool = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
};

const normalizeNumber = (value = '') => String(value).replace(/[^0-9]/g, '');
const int = (value, fallback, min, max) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
};

// Local installs keep credentials outside the extracted ZIP so upgrades do not
// force a new dashboard password or WhatsApp re-pair. Hosting platforms can
// continue to override DATA_DIR / SESSION_DIR / MULTI_SESSION_DIR explicitly.
const persistentRoot = path.resolve(process.env.AXHK_HOME || path.join(os.homedir(), '.axhk-whatsapp-bot'));
const stablePath = (envName, child) => path.resolve(process.env[envName] || path.join(persistentRoot, child));

export const config = {
  version: '4.10.28',
  botName: process.env.BOT_NAME || 'ABDULLAH-X-HK WHATSAPP BOT',
  shortName: process.env.SHORT_NAME || 'A-X-HK',
  ownerName: process.env.OWNER_NAME || 'ABDULLAH-X-HK',
  ownerNumber: normalizeNumber(process.env.OWNER_NUMBER || '923044596780'),
  tagline: process.env.BRAND_TAGLINE || 'FAST - SECURE - RELIABLE',
  footerText: process.env.FOOTER_TEXT || '© 𝙿𝙾𝚆𝙴𝚁𝙴𝙳 𝙱𝚈 𝙰𝙱𝙳𝚄𝙻𝙻𝙰𝙷-𝚇-𝙷𝙰𝙲𝙺𝙴𝚁.',
  footerDisplayText: process.env.FOOTER_DISPLAY_TEXT || '© 𝐏𝐎𝐖𝐄𝐑𝐄𝐃 𝐁𝐘 𝐀𝐁𝐃𝐔𝐋𝐋𝐀𝐇-𝐗-𝐇𝐀𝐂𝐊𝐄𝐑.',
  footerMessage: process.env.FOOTER_MESSAGE || '*© 𝐏𝐎𝐖𝐄𝐑𝐄𝐃 𝐁𝐘 𝐀𝐁𝐃𝐔𝐋𝐋𝐀𝐇-𝐗-𝐇𝐀𝐂𝐊𝐄𝐑.*',
  prefix: process.env.PREFIX || '.',
  mode: ['public', 'private'].includes(process.env.MODE) ? process.env.MODE : 'public',
  port: Number(process.env.PORT || 3000),
  dashboardToken: process.env.DASHBOARD_TOKEN || '',
  ownerSetupCode: String(process.env.OWNER_SETUP_CODE || '').trim(),
  persistentRoot,
  sessionDir: stablePath('SESSION_DIR', 'session'),
  multiSessionDir: stablePath('MULTI_SESSION_DIR', 'sessions'),
  dataDir: stablePath('DATA_DIR', 'data'),
  logLevel: process.env.LOG_LEVEL || 'info',
  timezone: process.env.TIMEZONE || 'Asia/Karachi',
  publicUrl: process.env.PUBLIC_URL || 'https://zesty-solace-production-29fe.up.railway.app',
  userLinkPath: '/link',
  ownerPortalPath: '/owner',
  miniSiteUrl: process.env.MINI_SITE_URL || '',
  creatorStudioUrl: process.env.CREATOR_STUDIO_URL || 'https://abdullah-x-hk-studio.vercel.app/',
  pairSiteUrl: process.env.PAIR_SITE_URL || '',
  githubUrl: process.env.GITHUB_URL || '',
  whatsappChannelUrl: process.env.WHATSAPP_CHANNEL_URL || '',
  youtubeUrl: process.env.YOUTUBE_URL || '',
  tutorialUrl: process.env.TUTORIAL_URL || '',
  ownerContactUrl: process.env.OWNER_CONTACT_URL || 'https://wa.me/923044596780',
  brandCardPath: path.resolve(process.env.BRAND_CARD_PATH || 'public/assets/brand-card.png'),
  menuCardPath: path.resolve(process.env.MENU_CARD_PATH || 'public/assets/menu-card.png'),
  customMenuCardPath: path.resolve(process.env.CUSTOM_MENU_CARD_PATH || path.join(stablePath('DATA_DIR', 'data'), 'menu-card-custom.jpg')),
  linkLogoPath: path.resolve(process.env.LINK_LOGO_PATH || 'public/assets/logo.svg'),
  customLinkLogoPath: path.resolve(process.env.CUSTOM_LINK_LOGO_PATH || path.join(stablePath('DATA_DIR', 'data'), 'link-logo-custom.png')),
  avatarPath: path.resolve(process.env.AVATAR_PATH || 'public/assets/avatar.png'),
  multi: {
    enabled: bool(process.env.MULTI_PAIR_ENABLED, true),
    maxSessions: int(process.env.MAX_MULTI_SESSIONS, 20, 1, 100),
    accessCode: String(process.env.MULTI_PAIR_ACCESS_CODE || '').trim(),
    createLimitPerHour: int(process.env.MULTI_CREATE_LIMIT_PER_HOUR, 5, 1, 50),
    defaultTtlDays: int(process.env.PUBLIC_SESSION_TTL_DAYS, 0, 0, 3650)
  },

  voice: {
    provider: (process.env.VOICE_PROVIDER || '').trim().toLowerCase(),
    apiKey: process.env.VOICE_API_KEY || process.env.ELEVENLABS_API_KEY || '',
    baseUrl: (process.env.VOICE_BASE_URL || 'https://api.elevenlabs.io/v1').replace(/\/$/, ''),
    defaultVoiceId: process.env.VOICE_DEFAULT_ID || process.env.ELEVENLABS_VOICE_ID || 'JBFqnCBsd6RMkjVDRZzb',
    clonedVoiceId: process.env.VOICE_CLONED_ID || '',
    model: process.env.VOICE_MODEL || 'eleven_multilingual_v2',
    outputFormat: process.env.VOICE_OUTPUT_FORMAT || 'mp3_44100_128',
    customUrl: (process.env.VOICE_CUSTOM_URL || process.env.VOICEFORGE_URL || '').replace(/\/$/, ''),
    customApiKey: process.env.VOICE_CUSTOM_API_KEY || process.env.VOICEFORGE_API_TOKEN || '',
    customCreatePath: process.env.VOICE_CUSTOM_CREATE_PATH || '',
    customSynthPath: process.env.VOICE_CUSTOM_SYNTH_PATH || '',
    customEngine: process.env.VOICE_CUSTOM_ENGINE || 'openvoice-v2',
    customModel: process.env.VOICE_CUSTOM_MODEL || process.env.VOICE_TTS_MODEL || 'tts-1-f5',
    customVoice: process.env.VOICE_CUSTOM_VOICE || process.env.VOICE_TTS_VOICE || '',
    customLanguage: process.env.VOICE_CUSTOM_LANGUAGE || 'en',
    customTimeoutMs: int(process.env.VOICE_CUSTOM_TIMEOUT_MS, 180000, 10000, 600000),
    customSpeed: Number(process.env.VOICE_CUSTOM_SPEED || 1),
    customSteps: int(process.env.VOICE_CUSTOM_STEPS, 32, 8, 64),
    deleteRemote: bool(process.env.VOICE_DELETE_REMOTE, false),
    cloneAuto: bool(process.env.VOICE_CLONE_AUTO, true),
    stability: Number(process.env.VOICE_STABILITY || 0.45),
    similarityBoost: Number(process.env.VOICE_SIMILARITY_BOOST || 0.85)
  },
  ai: {
    enabled: bool(process.env.AI_ENABLED, false),
    baseUrl: (process.env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, ''),
    apiKey: process.env.AI_API_KEY || '',
    model: process.env.AI_MODEL || 'auto',
    fallbackModels: String(process.env.AI_FALLBACK_MODELS || '').split(',').map((v) => v.trim()).filter(Boolean),
    systemPrompt: process.env.AI_SYSTEM_PROMPT || 'You are A-X-HK, a concise and helpful WhatsApp assistant.',
    transcriptionModel: process.env.AI_TRANSCRIPTION_MODEL || 'gpt-4o-mini-transcribe',
    ttsModel: process.env.AI_TTS_MODEL || 'gpt-4o-mini-tts',
    ttsVoice: process.env.AI_TTS_VOICE || 'alloy',
    timeoutMs: int(process.env.AI_TIMEOUT_MS, 60000, 5000, 180000),
    retries: int(process.env.AI_RETRIES, 2, 0, 5),
    retryBaseMs: int(process.env.AI_RETRY_BASE_MS, 1200, 250, 10000)
  }
};

export const ownerJid = () => config.ownerNumber ? `${config.ownerNumber}@s.whatsapp.net` : '';
