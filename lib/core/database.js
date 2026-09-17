import fs from 'node:fs/promises';
import path from 'node:path';
import { logger } from './logger.js';
import { config } from '../config.js';
import { ensureDiskSpace, isNoSpaceError } from '../services/storage-guard.js';

const DB_PATH = path.join(config.dataDir, 'database.json');
const safeSessionId = (value = 'main') => String(value || 'main').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) || 'main';
const scoped = (sessionId, value) => `${safeSessionId(sessionId)}::${String(value || '')}`;
const DEFAULT_AWAY_TEXT = process.env.AWAY_AUTO_REPLY_TEXT || 'I am currently busy. I will reply as soon as I am available.';
const DEFAULT_AWAY_COOLDOWN_HOURS = Math.max(3, Math.min(24, Number(process.env.AWAY_COOLDOWN_HOURS || 4)));

export function enforceAwayPolicy(session = {}) {
  const next = { ...(session && typeof session === 'object' ? session : {}) };
  const away = next.away && typeof next.away === 'object' ? next.away : {};
  const awayText = String(away.text || '').trim() || DEFAULT_AWAY_TEXT;

  next.away = { ...away, enabled: true, text: awayText };
  next.awayCooldownHours = DEFAULT_AWAY_COOLDOWN_HOURS;
  next.afk = {
    ...(next.afk && typeof next.afk === 'object' ? next.afk : {}),
    enabled: false,
    reason: ''
  };
  return next;
}

const sessionDefaults = () => enforceAwayPolicy({
  prefix: null, mode: null, autoRead: false, autoReact: false, autoTyping: false, autoRecording: false,
  statusSeen: false, statusReply: false, statusReplyText: '', statusReact: false, statusReactEmoji: '❤️',
  antiCall: false, antiCallText: 'Please do not call. Send a message and I will reply soon.',
  antiDeletePrivate: false, chatbot: false, autoAI: false, autoReactEmojis: ['❤️', '🔥', '👍', '😂', '✨'],
  autoSticker: false, autoVoice: false, alwaysOnline: false, autoFeatureCooldownSeconds: 45, statusCooldownSeconds: 90,
  reactionRules: {}, smartReplyChats: {}, quietHours: { enabled: false, start: '01:00', end: '07:00' },
  away: { enabled: true, text: DEFAULT_AWAY_TEXT }, awayCooldownHours: DEFAULT_AWAY_COOLDOWN_HOURS,
  afk: { enabled: false, reason: '' }, stickerPack: { pack: 'A-X-HK', author: 'ABDULLAH-X-HK' },
  menuTheme: 'royal', ownerAlerts: true, autoCleanup: true, funVisuals: true,
  silentCommandErrors: true, silentCommandRejects: true,
  banProtection: true, dailyCommandLimit: 80, highRiskDailyLimit: 8, commandPermissions: {},
  autoBackup: true, backupIntervalHours: 6, backupKeep: 10, dashboardSecurityAlerts: true,
  menuTitle: 'A-X-HK PREMIUM', menuSubtitle: 'FAST • SECURE • MULTI SESSION', menuFooter: '',
  aiPersona: 'default', aiCooldownSeconds: 15, aiHistoryLimit: 12, aiFallbackModels: []
});
const globalDefaults = sessionDefaults;
const groupDefaults = () => ({
  welcome: false, goodbye: false, adminEvents: false, antiLink: false, antiSpam: true, antiFlood: true, muted: false, xpEnabled: false,
  antiBad: false, antiDelete: false, linkAction: 'delete', linkWarnLimit: 3, linkAllowedDomains: [],
  badWords: [], badAction: 'delete', badWarnLimit: 3,
  disabledCommands: [], rules: '', welcomeText: '', goodbyeText: '', welcomeImage: '', goodbyeImage: ''
});
const userDefaults = () => ({
  premium: false, banned: false, commandCount: 0, timezone: '', todos: [], triviaScore: 0,
  lastRiddle: null, lastTrivia: null, numberGame: null, numberGameTries: 0
});
const defaults = () => ({
  global: globalDefaults(),
  sessions: {},
  linkedSessions: {},
  groups: {}, users: {}, warnings: {}, notes: {}, autoReplies: {}, sessionAutoReplies: {}, reminders: [],
  birthdays: [], events: [], scheduledMessages: [], scheduledStatuses: [], sessionSavedReplies: {}, groupXp: {}, groupActivity: {}, vault: {},
  invites: {}, sessionPolicy: { blockedPhones: [], allowedPhones: [], allowMode: false, inviteOnly: false },
  ui: { dashboardTheme: 'emerald' },
  metrics: { messagesSeen: 0, commandsRun: 0, commandErrors: 0, lastMessageAt: null, lastCommandAt: null, commandsByName: {}, daily: {} },
  activity: [], commandAudit: [], safetyDaily: {}, backups: []
});

class JsonDatabase {
  constructor() {
    this.data = defaults();
    this.ready = false;
    this.writeQueue = Promise.resolve();
  }

  async init() {
    await fs.mkdir(path.dirname(DB_PATH), { recursive: true });
    try {
      const raw = await fs.readFile(DB_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      const base = defaults();
      this.data = {
        ...base, ...parsed,
        global: enforceAwayPolicy({ ...base.global, ...(parsed.global || {}) }),
        sessions: parsed.sessions || {},
        linkedSessions: parsed.linkedSessions || {},
        metrics: { ...base.metrics, ...(parsed.metrics || {}), commandsByName: parsed.metrics?.commandsByName || {}, daily: parsed.metrics?.daily || {} },
        groups: parsed.groups || {}, users: parsed.users || {}, warnings: parsed.warnings || {}, notes: parsed.notes || {},
        autoReplies: parsed.autoReplies || {}, sessionAutoReplies: parsed.sessionAutoReplies || {},
        reminders: Array.isArray(parsed.reminders) ? parsed.reminders : [],
        birthdays: Array.isArray(parsed.birthdays) ? parsed.birthdays : [],
        events: Array.isArray(parsed.events) ? parsed.events : [],
        scheduledMessages: Array.isArray(parsed.scheduledMessages) ? parsed.scheduledMessages : [],
        scheduledStatuses: Array.isArray(parsed.scheduledStatuses) ? parsed.scheduledStatuses : [],
        sessionSavedReplies: parsed.sessionSavedReplies || {}, groupXp: parsed.groupXp || {}, groupActivity: parsed.groupActivity || {}, vault: parsed.vault || {},
        invites: parsed.invites || {}, sessionPolicy: { ...base.sessionPolicy, ...(parsed.sessionPolicy || {}) },
        ui: { ...base.ui, ...(parsed.ui || {}) },
        activity: Array.isArray(parsed.activity) ? parsed.activity.slice(-250) : [],
        commandAudit: Array.isArray(parsed.commandAudit) ? parsed.commandAudit.slice(-500) : [],
        safetyDaily: parsed.safetyDaily || {},
        backups: Array.isArray(parsed.backups) ? parsed.backups.slice(-100) : []
      };
      // Preserve legacy main settings/data while moving new installs to per-session namespaces.
      this.data.sessions.main = enforceAwayPolicy({ ...sessionDefaults(), ...(this.data.global || {}), ...(this.data.sessions.main || {}) });
      for (const [sessionId, session] of Object.entries({ ...this.data.sessions })) {
        this.data.sessions[sessionId] = enforceAwayPolicy({ ...sessionDefaults(), ...(session || {}) });
      }
      for (const [key, value] of Object.entries({ ...this.data.groups })) {
        if (!key.includes('::')) { this.data.groups[`main::${key}`] ||= value; delete this.data.groups[key]; }
      }
      for (const [key, value] of Object.entries({ ...this.data.users })) {
        if (!key.includes('::')) { this.data.users[`main::${key}`] ||= value; delete this.data.users[key]; }
      }
      for (const [key, value] of Object.entries({ ...this.data.notes })) {
        if (!key.includes('::')) { this.data.notes[`main::${key}`] ||= value; delete this.data.notes[key]; }
      }
      for (const [key, value] of Object.entries({ ...this.data.warnings })) {
        if (!key.startsWith('main::') && !/^ax_[a-f0-9]+::/.test(key)) { this.data.warnings[`main::${key}`] ||= value; delete this.data.warnings[key]; }
      }
      await this.save();
    } catch (err) {
      if (err.code !== 'ENOENT') logger.warn({ err }, 'Database load failed; using defaults');
      this.data.sessions.main = sessionDefaults();
      await this.save();
    }
    this.ready = true;
  }

  async save() {
    const payload = JSON.stringify(this.data, null, 2);
    this.writeQueue = this.writeQueue.then(async () => {
      const tmp = `${DB_PATH}.tmp`;
      try {
        await ensureDiskSpace({ minFreeBytes: Math.max(8 * 1024 * 1024, payload.length * 3), minFreeRatio: 0.03, reason: 'before-db-save' });
        await fs.writeFile(tmp, payload, 'utf8');
        await fs.rename(tmp, DB_PATH);
      } catch (err) {
        if (!isNoSpaceError(err)) throw err;
        logger.warn({ err }, 'Database write hit ENOSPC; running emergency cleanup and retrying once');
        await ensureDiskSpace({ minFreeBytes: Math.max(16 * 1024 * 1024, payload.length * 4), minFreeRatio: 0.05, reason: 'db-save-enospc' });
        await fs.writeFile(tmp, payload, 'utf8');
        await fs.rename(tmp, DB_PATH);
      }
    }).catch((err) => logger.error({ err }, 'Database write failed'));
    return this.writeQueue;
  }

  session(sessionId = 'main') {
    const id = safeSessionId(sessionId);
    this.data.sessions[id] = enforceAwayPolicy({ ...sessionDefaults(), ...(this.data.sessions[id] || {}) });
    return this.data.sessions[id];
  }

  group(jid, sessionId = 'main') {
    const key = scoped(sessionId, jid);
    this.data.groups[key] = { ...groupDefaults(), ...(this.data.groups[key] || {}) };
    if (!Array.isArray(this.data.groups[key].disabledCommands)) this.data.groups[key].disabledCommands = [];
    if (!Array.isArray(this.data.groups[key].linkAllowedDomains)) this.data.groups[key].linkAllowedDomains = [];
    if (!Array.isArray(this.data.groups[key].badWords)) this.data.groups[key].badWords = [];
    return this.data.groups[key];
  }

  user(jid, sessionId = 'main') {
    const key = scoped(sessionId, jid);
    this.data.users[key] = { ...userDefaults(), ...(this.data.users[key] || {}) };
    if (!Array.isArray(this.data.users[key].todos)) this.data.users[key].todos = [];
    return this.data.users[key];
  }

  autoReplies(sessionId = 'main') {
    const id = safeSessionId(sessionId);
    this.data.sessionAutoReplies[id] ||= {};
    if (id === 'main' && !Object.keys(this.data.sessionAutoReplies[id]).length && Object.keys(this.data.autoReplies || {}).length) {
      this.data.sessionAutoReplies[id] = { ...this.data.autoReplies };
    }
    return this.data.sessionAutoReplies[id];
  }

  noteBucket(sessionId, jid) {
    const key = scoped(sessionId, jid);
    this.data.notes[key] ||= {};
    return this.data.notes[key];
  }

  savedReplies(sessionId = 'main') {
    const id = safeSessionId(sessionId);
    this.data.sessionSavedReplies[id] ||= {};
    return this.data.sessionSavedReplies[id];
  }

  xpBucket(sessionId, groupJid, userJid) {
    const key = scoped(sessionId, `${groupJid}:${userJid}`);
    this.data.groupXp[key] ||= { xp: 0, messages: 0, lastAt: 0 };
    return this.data.groupXp[key];
  }

  warningKey(sessionId, groupJid, userJid) { return scoped(sessionId, `${groupJid}:${userJid}`); }
  scopedKey(sessionId, value) { return scoped(sessionId, value); }

  touchMessage() {
    this.data.metrics.messagesSeen = (this.data.metrics.messagesSeen || 0) + 1;
    this.data.metrics.lastMessageAt = new Date().toISOString();
    this.data.metrics.daily ||= {};
    const day = new Date().toISOString().slice(0, 10);
    this.data.metrics.daily[day] ||= { commands: 0, errors: 0, messages: 0 };
    this.data.metrics.daily[day].messages += 1;
  }

  touchCommand(name, sender, ok = true, sessionId = 'main', meta = {}) {
    this.data.metrics.commandsRun = (this.data.metrics.commandsRun || 0) + 1;
    if (!ok) this.data.metrics.commandErrors = (this.data.metrics.commandErrors || 0) + 1;
    this.data.metrics.commandsByName ||= {};
    this.data.metrics.commandsByName[name] = (this.data.metrics.commandsByName[name] || 0) + 1;
    this.data.metrics.daily ||= {};
    const nowIso = new Date().toISOString();
    const day = nowIso.slice(0, 10);
    this.data.metrics.daily[day] ||= { commands: 0, errors: 0, messages: 0 };
    this.data.metrics.daily[day].commands += 1;
    if (!ok) this.data.metrics.daily[day].errors += 1;
    this.data.metrics.lastCommandAt = nowIso;
    const compact = {
      at: nowIso, type: ok ? 'command' : (meta.blocked ? 'blocked' : 'error'), command: String(name || ''),
      sender: String(sender || '').replace(/@.*/, '').slice(-6), sessionId: safeSessionId(sessionId),
      group: Boolean(meta.isGroup), reason: meta.reason ? String(meta.reason).slice(0, 80) : undefined
    };
    this.data.activity.push(compact);
    if (this.data.activity.length > 150) this.data.activity = this.data.activity.slice(-150);
    this.data.commandAudit ||= [];
    this.data.commandAudit.push({
      ...compact,
      chat: String(meta.chat || '').replace(/@.*/, '').slice(-16),
      ok: Boolean(ok), blocked: Boolean(meta.blocked)
    });
    if (this.data.commandAudit.length > 500) this.data.commandAudit = this.data.commandAudit.slice(-500);
  }
}

export const db = new JsonDatabase();
