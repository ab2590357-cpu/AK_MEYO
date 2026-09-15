import crypto from 'node:crypto';
import path from 'node:path';
import express from 'express';
import QRCode from 'qrcode';
import { config } from '../config.js';
import { db } from '../core/database.js';
import { logger } from '../core/logger.js';
import { allCommands, commandsByCategory } from '../core/registry.js';
import { adminAuth } from './admin-auth.js';
import { waManager } from './whatsapp.js';
import { getAIStatus, testAI } from './ai.js';
import { menuCardPreview, saveMenuCard, resetMenuCard } from './menu-card.js';
import { linkLogoPreview, saveLinkLogo, resetLinkLogo } from './link-logo.js';
import { deleteVoiceProfile, getVoiceStatus, saveVoiceSample } from './voice-studio.js';

const COOKIE_NAME = 'axhk_admin';
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60 * 1000;
const createBuckets = new Map();

function secureCompare(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
function cookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const index = part.indexOf('=');
    if (index < 1) continue;
    out[decodeURIComponent(part.slice(0, index).trim())] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return out;
}
function adminSession(req) { return cookies(req)[COOKIE_NAME] || ''; }
function legacyTokenValid(req) {
  if (!config.dashboardToken) return false;
  const token = req.headers['x-dashboard-token'] || req.body?.token || '';
  return secureCompare(token, config.dashboardToken);
}
function isAdmin(req) { return adminAuth.verifySession(adminSession(req)) || legacyTokenValid(req); }
function requireAdmin(req, res, next) {
  if (!adminAuth.isSetup() && !config.dashboardToken) return res.status(428).json({ error: 'First-run dashboard setup is required.', setupRequired: true });
  if (!isAdmin(req)) return res.status(401).json({ error: 'Dashboard login required.' });
  res.setHeader('Cache-Control', 'no-store');
  next();
}
function requireAdminPage(req, res, next) {
  // Protected HTML should never become a navigation path for visitors arriving
  // through the public user-link portal. Owners enter through /owner explicitly.
  if (!adminAuth.isSetup() && !config.dashboardToken) return res.redirect(isLoopback(req) || config.ownerSetupCode ? '/setup' : '/link');
  if (!isAdmin(req)) return res.redirect('/link');
  res.setHeader('Cache-Control', 'no-store');
  next();
}
function sessionToken(req) { return String(req.headers['x-session-token'] || req.body?.sessionToken || ''); }
function requireLinkedSession(req, res, next) {
  const id = String(req.params.id || '');
  if (!waManager.verifySessionToken(id, sessionToken(req))) return res.status(401).json({ error: 'Invalid session management key.' });
  res.setHeader('Cache-Control', 'no-store');
  next();
}
function setAdminCookie(req, res, token) {
  const forwarded = String(req.headers['x-forwarded-proto'] || '').toLowerCase();
  res.cookie(COOKIE_NAME, token, { httpOnly: true, sameSite: 'strict', secure: req.secure || forwarded === 'https', path: '/', maxAge: COOKIE_MAX_AGE });
}
function clearAdminCookie(req, res) {
  const forwarded = String(req.headers['x-forwarded-proto'] || '').toLowerCase();
  res.clearCookie(COOKIE_NAME, { httpOnly: true, sameSite: 'strict', secure: req.secure || forwarded === 'https', path: '/' });
}
function publicBrand() {
  const base = String(config.publicUrl || '').replace(/\/$/, '');
  return {
    botName: config.botName, shortName: config.shortName, ownerName: config.ownerName, tagline: config.tagline,
    footerText: config.footerDisplayText, version: config.version,
    userLink: base ? `${base}${config.userLinkPath}` : config.userLinkPath,
    multi: { enabled: config.multi.enabled, maxSessions: config.multi.maxSessions, accessCodeRequired: Boolean(config.multi.accessCode || db.data.sessionPolicy?.inviteOnly) },
    links: {
      userLink: base ? `${base}${config.userLinkPath}` : config.userLinkPath,
      miniSite: config.miniSiteUrl, github: config.githubUrl,
      channel: config.whatsappChannelUrl, youtube: config.youtubeUrl, tutorial: config.tutorialUrl, owner: config.ownerContactUrl
    }
  };
}
function safeMainStatus() {
  const snapshot = waManager.snapshot();
  const settings = db.session('main');
  return {
    ...snapshot, pairCode: undefined, pairingPhoneMasked: undefined,
    user: snapshot.user ? { connected: true, name: snapshot.user.name || config.shortName } : null,
    uptime: Math.floor(process.uptime()), commands: allCommands().length, categories: Object.keys(commandsByCategory()).length,
    mode: settings.mode || config.mode, prefix: settings.prefix || config.prefix,
    knownGroups: Object.keys(db.data.groups).length, knownUsers: Object.keys(db.data.users).length,
    linkedSessions: waManager.listSessions().length - 1,
    connectedSessions: waManager.listSessions().filter((s) => s.connected).length
  };
}
function formatPairCode(value) {
  const code = String(value || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
  return code.match(/.{1,4}/g)?.join('-') || code;
}
function clientIp(req) { return String(req.ip || req.socket?.remoteAddress || 'unknown').slice(0, 120); }
function isLoopback(req) {
  const raw = String(req.ip || req.socket?.remoteAddress || '').replace(/^::ffff:/, '');
  return raw === '127.0.0.1' || raw === '::1' || raw === 'localhost';
}
function setupGate(req) {
  if (isLoopback(req)) return { allowed: true, codeRequired: false };
  if (!config.ownerSetupCode) return { allowed: false, codeRequired: true, reason: 'Remote first-run owner setup is locked. Configure OWNER_SETUP_CODE or complete setup locally on the host.' };
  const supplied = String(req.body?.setupCode || req.headers['x-owner-setup-code'] || '').trim();
  if (!secureCompare(supplied, config.ownerSetupCode)) return { allowed: false, codeRequired: true, reason: 'Invalid owner setup code.' };
  return { allowed: true, codeRequired: true };
}
function allowSessionCreate(req) {
  const key = clientIp(req);
  const now = Date.now();
  const hour = 60 * 60 * 1000;
  const recent = (createBuckets.get(key) || []).filter((t) => now - t < hour);
  if (recent.length >= config.multi.createLimitPerHour) return false;
  recent.push(now);
  createBuckets.set(key, recent);
  return true;
}

function normalizePhone(value = '') { return String(value || '').replace(/\D/g, ''); }
function phonePolicy(phone) {
  const digits = normalizePhone(phone);
  const policy = db.data.sessionPolicy || {};
  if ((policy.blockedPhones || []).includes(digits)) return { ok: false, reason: 'This number is blocked from creating a public session.' };
  if (policy.allowMode && !(policy.allowedPhones || []).includes(digits)) return { ok: false, reason: 'This server currently allows only approved WhatsApp numbers.' };
  return { ok: true };
}
function inviteHash(code = '') { return crypto.createHash('sha256').update(String(code).trim()).digest('hex'); }
function findInvite(code = '') {
  const hash = inviteHash(code);
  const now = Date.now();
  for (const row of Object.values(db.data.invites || {})) {
    if (!row?.hash || row.hash !== hash) continue;
    if (row.expiresAt && new Date(row.expiresAt).getTime() <= now) return null;
    if (Number(row.usesRemaining || 0) <= 0) return null;
    return row;
  }
  return null;
}
function accessGrant(code = '') {
  const supplied = String(code || '').trim();
  if (config.multi.accessCode && secureCompare(supplied, config.multi.accessCode)) return { ok: true, ttlDays: config.multi.defaultTtlDays, invite: null };
  const invite = supplied ? findInvite(supplied) : null;
  if (invite) return { ok: true, ttlDays: Number(invite.sessionTtlDays || config.multi.defaultTtlDays || 0), invite };
  if (config.multi.accessCode || db.data.sessionPolicy?.inviteOnly) return { ok: false, error: 'A valid owner invite/access code is required.' };
  return { ok: true, ttlDays: config.multi.defaultTtlDays, invite: null };
}
async function consumeInvite(row) {
  if (!row) return;
  row.usesRemaining = Math.max(0, Number(row.usesRemaining || 0) - 1);
  row.usedAt = new Date().toISOString();
  await db.save();
}
function safeBackupPayload() {
  return {
    format: 'axhk-safe-backup-v1', version: config.version, createdAt: new Date().toISOString(),
    sessions: db.data.sessions, groups: db.data.groups, users: db.data.users, warnings: db.data.warnings,
    notes: db.data.notes, sessionAutoReplies: db.data.sessionAutoReplies, reminders: db.data.reminders,
    birthdays: db.data.birthdays, events: db.data.events, scheduledMessages: db.data.scheduledMessages, scheduledStatuses: db.data.scheduledStatuses, sessionSavedReplies: db.data.sessionSavedReplies,
    groupXp: db.data.groupXp, groupActivity: db.data.groupActivity, sessionPolicy: db.data.sessionPolicy, ui: db.data.ui
  };
}
function publicSessionState(inst) {
  const state = inst.snapshot();
  const settings = db.session(inst.id);
  return {
    id: state.id, label: state.label, status: state.status,
    connected: state.status === 'connected' && state.sessionRegistered,
    hasQr: state.hasQr,
    pairCode: state.pairCode ? formatPairCode(state.pairCode) : null,
    pairCodeCreatedAt: state.pairCodeCreatedAt,
    linkedName: state.user?.name || null,
    sessionRegistered: state.sessionRegistered,
    lastDisconnect: state.lastDisconnect,
    version: state.version,
    mode: settings.mode || config.mode,
    prefix: settings.prefix || config.prefix,
    autoRead: Boolean(settings.autoRead),
    autoReact: Boolean(settings.autoReact),
    autoTyping: Boolean(settings.autoTyping),
    autoRecording: Boolean(settings.autoRecording),
    statusSeen: Boolean(settings.statusSeen),
    antiDeletePrivate: Boolean(settings.antiDeletePrivate),
    quietHours: settings.quietHours || { enabled: false, start: '01:00', end: '07:00' },
    away: settings.away || { enabled: false, text: '' }, menuTheme: settings.menuTheme || 'royal',
    expiresAt: db.data.linkedSessions?.[inst.id]?.expiresAt || null,
    botName: config.botName,
    shortName: config.shortName
  };
}

export function startWebServer() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    if (['/health', '/ready', '/api/status', '/api/brand', '/api/commands'].includes(req.path)) res.setHeader('Access-Control-Allow-Origin', '*');
    next();
  });
  app.use(express.json({ limit: '1mb' }));
  // Serve assets only. HTML control surfaces are routed explicitly below so
  // visitors cannot bypass owner authentication by requesting *.html files.
  app.use('/assets', express.static(path.resolve('lib/public/assets'), { maxAge: '10m', etag: true, index: false }));

  app.get('/', (req, res) => res.redirect(isAdmin(req) ? '/dashboard' : '/link'));
  app.get('/link', (req, res) => res.sendFile(path.resolve('lib/public/link.html')));
  app.get('/multi', (req, res) => res.redirect('/link'));
  app.get('/owner', (req, res) => {
    if (!adminAuth.isSetup() && !config.dashboardToken) {
      if (!isLoopback(req) && !config.ownerSetupCode) return res.redirect('/link');
      return res.redirect('/setup');
    }
    if (isAdmin(req)) return res.redirect('/dashboard');
    res.setHeader('Cache-Control', 'no-store');
    return res.sendFile(path.resolve('lib/public/login.html'));
  });
  app.get('/login', (req, res) => res.redirect('/owner'));
  app.get('/setup', (req, res) => {
    if (adminAuth.isSetup()) return res.redirect(isAdmin(req) ? '/dashboard' : '/link');
    if (!isLoopback(req) && !config.ownerSetupCode) return res.redirect('/link');
    res.setHeader('Cache-Control', 'no-store');
    return res.sendFile(path.resolve('lib/public/setup.html'));
  });
  app.get('/dashboard', requireAdminPage, (req, res) => res.sendFile(path.resolve('lib/public/index.html')));
  app.get('/pair', requireAdminPage, (req, res) => res.sendFile(path.resolve('lib/public/pair.html')));
  app.get('/sessions', requireAdminPage, (req, res) => res.sendFile(path.resolve('lib/public/sessions.html')));
  app.get('/deploy', requireAdminPage, (req, res) => res.sendFile(path.resolve('lib/public/deploy.html')));

  app.get('/health', (req, res) => res.json({ ok: true, bot: config.shortName, version: config.version, status: waManager.state.status, sessions: waManager.listSessions().length, uptime: Math.floor(process.uptime()) }));
  app.get('/ready', (req, res) => {
    const status = String(waManager.state.status || 'starting');
    res.json({ ok: true, ready: ['connected','waiting_for_pair','pair_code_ready','connecting','starting','disconnected','restarting'].includes(status), whatsapp: status, version: config.version });
  });
  app.get('/api/brand', (req, res) => res.json(publicBrand()));
  app.get('/api/status', (req, res) => res.json(safeMainStatus()));
  app.get('/api/commands', (req, res) => {
    res.json(allCommands().map(({ name, aliases, category, description, usage, ownerOnly, groupOnly, adminOnly, botAdminRequired }) => ({
      name, aliases, category, description, usage, ownerOnly, groupOnly, adminOnly, botAdminRequired
    })));
  });

  app.get('/api/auth/state', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const remoteSetupLocked = !adminAuth.isSetup() && !isLoopback(req);
    res.json({
      setupRequired: !adminAuth.isSetup(),
      authenticated: isAdmin(req),
      legacyTokenEnabled: Boolean(config.dashboardToken),
      setupCodeRequired: remoteSetupLocked,
      remoteSetupAllowed: !remoteSetupLocked || Boolean(config.ownerSetupCode)
    });
  });
  app.post('/api/auth/setup', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      if (adminAuth.isSetup()) return res.status(409).json({ error: 'Dashboard setup is already complete.' });
      const gate = setupGate(req);
      if (!gate.allowed) return res.status(config.ownerSetupCode ? 401 : 403).json({ error: gate.reason, setupCodeRequired: gate.codeRequired });
      const token = await adminAuth.setup(req.body?.password);
      setAdminCookie(req, res, token);
      res.json({ ok: true });
    } catch (err) { res.status(400).json({ error: err.message }); }
  });
  app.post('/api/auth/login', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      if (!adminAuth.isSetup()) return res.status(428).json({ error: 'Complete first-run setup first.', setupRequired: true });
      if (!adminAuth.verify(req.body?.password, req)) return res.status(401).json({ error: 'Incorrect dashboard password.' });
      const token = adminAuth.createSession();
      setAdminCookie(req, res, token);
      res.json({ ok: true });
    } catch (err) { res.status(429).json({ error: err.message }); }
  });
  app.post('/api/auth/logout', (req, res) => {
    adminAuth.destroySession(adminSession(req));
    clearAdminCookie(req, res);
    res.json({ ok: true });
  });

  // Owner/main-session dashboard APIs.
  app.get('/api/ai/status', requireAdmin, (req, res) => {
    const status = getAIStatus();
    res.json({
      ...status,
      apiKeyConfigured: Boolean(config.ai.apiKey),
      apiKey: undefined,
      provider: (() => { try { return new URL(config.ai.baseUrl).host; } catch { return 'configured'; } })()
    });
  });
  app.post('/api/ai/test', requireAdmin, async (req, res) => {
    try {
      const prompt = String(req.body?.prompt || 'Reply with exactly: A-X-HK AI OK').trim().slice(0, 400);
      const fallbackModels = Array.isArray(db.session('main').aiFallbackModels) ? db.session('main').aiFallbackModels : [];
      const result = await testAI(prompt || 'Reply with exactly: A-X-HK AI OK', { fallbackModels });
      res.json({ ok: true, text: result.text, latencyMs: result.latencyMs, model: result.status.lastWorkingModel || result.status.lastModel || result.status.configuredModel });
    } catch (err) { res.status(502).json({ ok: false, error: String(err?.message || err).slice(0, 500) }); }
  });

  app.get('/api/dashboard', requireAdmin, (req, res) => {
    const settings = db.session('main');
    res.json({
      brand: publicBrand(), status: waManager.snapshot(), uptime: Math.floor(process.uptime()), commands: allCommands().length,
      categories: Object.fromEntries(Object.entries(commandsByCategory()).map(([key, value]) => [key, value.length])),
      mode: settings.mode || config.mode, prefix: settings.prefix || config.prefix,
      metrics: db.data.metrics, groups: Object.keys(db.data.groups).length, users: Object.keys(db.data.users).length,
      premiumUsers: Object.values(db.data.users).filter((u) => u?.premium).length,
      bannedUsers: Object.values(db.data.users).filter((u) => u?.banned).length,
      reminders: db.data.reminders.length, activity: db.data.activity.slice(-30).reverse(),
      analytics: {
        topCommands: Object.entries(db.data.metrics.commandsByName || {}).sort((a,b) => b[1]-a[1]).slice(0,10).map(([name,count]) => ({ name, count })),
        daily: Object.entries(db.data.metrics.daily || {}).sort((a,b) => a[0].localeCompare(b[0])).slice(-14).map(([day,value]) => ({ day, ...value }))
      },
      ui: db.data.ui || { dashboardTheme: 'emerald' }, sessionPolicy: db.data.sessionPolicy || {},
      sessionSummary: { total: waManager.listSessions().length, connected: waManager.listSessions().filter((s) => s.connected).length, maxPublic: config.multi.maxSessions }
    });
  });
  app.post('/api/pair', requireAdmin, async (req, res) => {
    try {
      const code = await waManager.requestPairingCode(req.body?.phone, 'main');
      res.json({ ok: true, code, formattedCode: formatPairCode(code), createdAt: waManager.state.pairCodeCreatedAt });
    } catch (err) { res.status(400).json({ error: err.message }); }
  });
  app.get('/api/pair/state', requireAdmin, (req, res) => {
    const state = waManager.snapshot();
    res.json({
      status: state.status, connected: state.status === 'connected' && state.sessionRegistered, hasQr: state.hasQr,
      pairCode: state.pairCode ? formatPairCode(state.pairCode) : null, pairCodeCreatedAt: state.pairCodeCreatedAt,
      pairingPhoneMasked: state.pairingPhoneMasked, linkedName: state.user?.name || null, version: state.version,
      sessionRegistered: state.sessionRegistered, lastDisconnect: state.lastDisconnect
    });
  });
  app.get('/api/qr', requireAdmin, async (req, res) => {
    try {
      if (!waManager.state.qr) return res.status(404).json({ error: 'QR is not ready yet. Wait a few seconds and try again.' });
      const dataUrl = await QRCode.toDataURL(waManager.state.qr, { width: 480, margin: 2, errorCorrectionLevel: 'M' });
      res.json({ ok: true, dataUrl });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });
  app.get('/api/settings', requireAdmin, (req, res) => {
    const settings = db.session('main');
    res.json({
      botName: config.botName, shortName: config.shortName, ownerName: config.ownerName, ownerNumber: config.ownerNumber,
      ownerContactUrl: config.ownerContactUrl, prefix: settings.prefix || config.prefix, mode: settings.mode || config.mode,
      autoRead: settings.autoRead, autoReact: settings.autoReact, autoTyping: settings.autoTyping, autoRecording: settings.autoRecording,
      statusSeen: settings.statusSeen, antiDeletePrivate: settings.antiDeletePrivate, autoReactEmojis: settings.autoReactEmojis,
      quietHours: settings.quietHours, away: settings.away, menuTheme: settings.menuTheme || 'royal', ownerAlerts: settings.ownerAlerts !== false, autoCleanup: settings.autoCleanup !== false,
      silentCommandErrors: settings.silentCommandErrors !== false, silentCommandRejects: settings.silentCommandRejects !== false,
      banProtection: settings.banProtection !== false, dailyCommandLimit: settings.dailyCommandLimit || 80, highRiskDailyLimit: settings.highRiskDailyLimit || 8,
      autoBackup: settings.autoBackup !== false, backupIntervalHours: settings.backupIntervalHours || 6, backupKeep: settings.backupKeep || 10,
      commandPermissions: settings.commandPermissions || {}, dashboardSecurityAlerts: settings.dashboardSecurityAlerts !== false,
      menuTitle: settings.menuTitle || 'A-X-HK PREMIUM', menuSubtitle: settings.menuSubtitle || 'FAST • SECURE • MULTI SESSION', menuFooter: settings.menuFooter || '',
      dashboardTheme: db.data.ui?.dashboardTheme || 'emerald', aiEnabled: config.ai.enabled, multiEnabled: config.multi.enabled, maxMultiSessions: config.multi.maxSessions
    });
  });
  app.post('/api/settings', requireAdmin, async (req, res) => {
    const settings = db.session('main');
    const { prefix, mode, autoRead, autoReact, autoTyping, autoRecording, statusSeen, antiDeletePrivate, menuTheme, ownerAlerts, autoCleanup, dashboardTheme, silentCommandErrors, silentCommandRejects, banProtection, dailyCommandLimit, highRiskDailyLimit, autoBackup, backupIntervalHours, backupKeep, dashboardSecurityAlerts, menuTitle, menuSubtitle, menuFooter } = req.body || {};
    if (prefix !== undefined) {
      if (typeof prefix !== 'string' || prefix.length < 1 || prefix.length > 3 || /\s/.test(prefix)) return res.status(400).json({ error: 'Prefix must be 1-3 non-space characters.' });
      settings.prefix = prefix;
    }
    if (mode !== undefined) {
      if (!['public', 'private'].includes(mode)) return res.status(400).json({ error: 'Mode must be public or private.' });
      settings.mode = mode;
    }
    if (autoRead !== undefined) settings.autoRead = Boolean(autoRead);
    if (autoReact !== undefined) settings.autoReact = Boolean(autoReact);
    if (autoTyping !== undefined) settings.autoTyping = Boolean(autoTyping);
    if (autoRecording !== undefined) settings.autoRecording = Boolean(autoRecording);
    if (statusSeen !== undefined) settings.statusSeen = Boolean(statusSeen);
    if (antiDeletePrivate !== undefined) settings.antiDeletePrivate = Boolean(antiDeletePrivate);
    if (menuTheme !== undefined) { if (!['royal','neon','minimal'].includes(menuTheme)) return res.status(400).json({ error: 'Invalid menu theme.' }); settings.menuTheme = menuTheme; }
    if (ownerAlerts !== undefined) settings.ownerAlerts = Boolean(ownerAlerts);
    if (autoCleanup !== undefined) settings.autoCleanup = Boolean(autoCleanup);
    if (silentCommandErrors !== undefined) settings.silentCommandErrors = Boolean(silentCommandErrors);
    if (silentCommandRejects !== undefined) settings.silentCommandRejects = Boolean(silentCommandRejects);
    if (banProtection !== undefined) settings.banProtection = Boolean(banProtection);
    if (dailyCommandLimit !== undefined) settings.dailyCommandLimit = Math.max(10, Math.min(1000, Number(dailyCommandLimit) || 80));
    if (highRiskDailyLimit !== undefined) settings.highRiskDailyLimit = Math.max(1, Math.min(100, Number(highRiskDailyLimit) || 8));
    if (autoBackup !== undefined) settings.autoBackup = Boolean(autoBackup);
    if (backupIntervalHours !== undefined) settings.backupIntervalHours = Math.max(1, Math.min(72, Number(backupIntervalHours) || 6));
    if (backupKeep !== undefined) settings.backupKeep = Math.max(3, Math.min(50, Number(backupKeep) || 10));
    if (dashboardSecurityAlerts !== undefined) settings.dashboardSecurityAlerts = Boolean(dashboardSecurityAlerts);
    if (menuTitle !== undefined) settings.menuTitle = String(menuTitle).replace(/[\r\n\t]+/g, ' ').trim().slice(0, 60) || 'A-X-HK PREMIUM';
    if (menuSubtitle !== undefined) settings.menuSubtitle = String(menuSubtitle).replace(/[\r\n\t]+/g, ' ').trim().slice(0, 100) || 'FAST • SECURE • MULTI SESSION';
    if (menuFooter !== undefined) settings.menuFooter = String(menuFooter).replace(/[\r\n\t]+/g, ' ').trim().slice(0, 180);
    if (dashboardTheme !== undefined) { if (!['emerald','gold','cyber','minimal'].includes(dashboardTheme)) return res.status(400).json({ error: 'Invalid dashboard theme.' }); db.data.ui ||= {}; db.data.ui.dashboardTheme = dashboardTheme; }
    if (settings.autoTyping && settings.autoRecording) {
      if (autoRecording !== undefined) settings.autoTyping = false;
      else settings.autoRecording = false;
    }
    await db.save();
    res.json({ ok: true });
  });

  app.get('/api/voice/status', requireAdmin, async (req, res) => {
    try { res.json(await getVoiceStatus()); }
    catch (err) { res.status(500).json({ error: err?.message || 'Voice status failed' }); }
  });
  app.post('/api/voice/sample', requireAdmin, express.raw({ type: ['audio/ogg','audio/opus','audio/mpeg','audio/mp4','audio/wav','audio/webm','video/mp4','application/octet-stream'], limit: '30mb' }), async (req, res) => {
    try {
      const mime = String(req.headers['content-type'] || 'audio/ogg').split(';')[0];
      const saved = await saveVoiceSample(Buffer.from(req.body || []), { mime, fileName: `dashboard-voice.${mime.includes('mpeg') ? 'mp3' : mime.includes('wav') ? 'wav' : mime.includes('mp4') ? 'm4a' : 'ogg'}`, autoClone: true });
      res.json({ ok: true, cloneCreated: Boolean(saved.cloneCreated), needsApi: Boolean(saved.needsApi), status: await getVoiceStatus(), message: saved.cloneCreated ? 'Voice sample uploaded and clone created.' : 'Voice sample uploaded. Configure VOICE_API_KEY for real clone voice.' });
    } catch (err) { res.status(400).json({ error: err?.message || 'Voice sample upload failed' }); }
  });
  app.delete('/api/voice/sample', requireAdmin, async (req, res) => {
    try { await deleteVoiceProfile({ remote: config.voice?.deleteRemote }); res.json({ ok: true, message: 'Voice sample and local clone state deleted.' }); }
    catch (err) { res.status(400).json({ error: err?.message || 'Voice reset failed' }); }
  });

  app.get('/api/link-logo/image', async (req, res) => {
    try {
      const { buffer, custom } = await linkLogoPreview();
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('X-A-X-HK-Custom-Link-Logo', custom ? '1' : '0');
      res.send(buffer);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });
  app.post('/api/link-logo/image', requireAdmin, express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '8mb' }), async (req, res) => {
    try {
      if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: 'Choose a JPG, PNG or WebP logo first.' });
      await saveLinkLogo(req.body);
      res.json({ ok: true, message: 'Animated link-page logo saved to persistent storage.' });
    } catch (err) { res.status(400).json({ error: err.message }); }
  });
  app.delete('/api/link-logo/image', requireAdmin, async (req, res) => {
    try { await resetLinkLogo(); res.json({ ok: true, message: 'Link-page logo reset. It will fall back to menu DP / bundled logo.' }); }
    catch (err) { res.status(400).json({ error: err.message }); }
  });

  app.get('/api/menu/image', requireAdmin, async (req, res) => {
    try {
      const { buffer, custom } = await menuCardPreview();
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('X-A-X-HK-Custom-Menu-Image', custom ? '1' : '0');
      res.send(buffer);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });
  app.post('/api/menu/image', requireAdmin, express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '8mb' }), async (req, res) => {
    try {
      if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: 'Choose a JPG, PNG or WebP image first.' });
      await saveMenuCard(req.body);
      res.json({ ok: true, message: 'Menu image saved to persistent storage.' });
    } catch (err) { res.status(400).json({ error: err.message }); }
  });
  app.delete('/api/menu/image', requireAdmin, async (req, res) => {
    try { await resetMenuCard(); res.json({ ok: true, message: 'Bundled menu image restored.' }); }
    catch (err) { res.status(400).json({ error: err.message }); }
  });

  app.get('/api/groups', requireAdmin, (req, res) => {
    const groups = Object.entries(db.data.groups).filter(([key]) => key.startsWith('main::')).map(([jid, settings]) => ({
      jid: jid.slice('main::'.length), settings: {
        welcome: Boolean(settings.welcome), goodbye: Boolean(settings.goodbye), antiLink: Boolean(settings.antiLink),
        muted: Boolean(settings.muted), disabledCommands: settings.disabledCommands?.length || 0, rules: Boolean(settings.rules)
      }
    }));
    res.json(groups);
  });
  app.post('/api/profile/brand', requireAdmin, async (req, res) => {
    if (req.body?.confirm !== 'APPLY') return res.status(400).json({ error: 'Send confirm=APPLY to change the linked WhatsApp profile name, bio and picture.' });
    try { const results = await waManager.applyProfileBranding('main'); res.json({ ok: results.name || results.bio || results.avatar, results }); }
    catch (err) { res.status(400).json({ error: err.message }); }
  });
  app.post('/api/reconnect', requireAdmin, async (req, res) => {
    waManager.reconnectNow('main').catch((err) => logger.error({ err }, 'Manual reconnect failed'));
    res.json({ ok: true, status: 'restarting' });
  });
  app.post('/api/logout', requireAdmin, async (req, res) => {
    if (req.body?.confirm !== 'UNLINK') return res.status(400).json({ error: 'Send confirm=UNLINK to unlink and reset the saved WhatsApp session.' });
    waManager.logoutAndReset('main').catch((err) => logger.error({ err }, 'Logout/reset failed'));
    res.json({ ok: true, status: 'resetting' });
  });

  // Admin multi-session center.
  app.get('/api/admin/sessions', requireAdmin, (req, res) => res.json({ sessions: waManager.listSessions(), maxPublic: config.multi.maxSessions, enabled: config.multi.enabled }));
  app.post('/api/admin/sessions/:id/reconnect', requireAdmin, async (req, res) => {
    try { await waManager.reconnectNow(req.params.id); res.json({ ok: true }); } catch (err) { res.status(400).json({ error: err.message }); }
  });
  app.delete('/api/admin/sessions/:id', requireAdmin, async (req, res) => {
    try { await waManager.removePublicSession(req.params.id); res.json({ ok: true }); } catch (err) { res.status(400).json({ error: err.message }); }
  });

  app.get('/api/admin/policy', requireAdmin, (req, res) => {
    res.json({ policy: db.data.sessionPolicy || {}, invites: Object.values(db.data.invites || {}).map(({ hash, ...row }) => row) });
  });
  app.post('/api/admin/policy', requireAdmin, async (req, res) => {
    const policy = db.data.sessionPolicy ||= { blockedPhones: [], allowedPhones: [], allowMode: false, inviteOnly: false };
    if (req.body?.allowMode !== undefined) policy.allowMode = Boolean(req.body.allowMode);
    if (req.body?.inviteOnly !== undefined) policy.inviteOnly = Boolean(req.body.inviteOnly);
    const action = String(req.body?.action || '');
    const phone = normalizePhone(req.body?.phone);
    if (action && phone.length < 8) return res.status(400).json({ error: 'Valid phone with country code required.' });
    if (action === 'block') { if (!policy.blockedPhones.includes(phone)) policy.blockedPhones.push(phone); policy.allowedPhones = policy.allowedPhones.filter((x) => x !== phone); }
    if (action === 'unblock') policy.blockedPhones = policy.blockedPhones.filter((x) => x !== phone);
    if (action === 'allow') { if (!policy.allowedPhones.includes(phone)) policy.allowedPhones.push(phone); policy.blockedPhones = policy.blockedPhones.filter((x) => x !== phone); }
    if (action === 'unallow') policy.allowedPhones = policy.allowedPhones.filter((x) => x !== phone);
    await db.save(); res.json({ ok: true, policy });
  });
  app.post('/api/admin/invites', requireAdmin, async (req, res) => {
    const uses = Math.max(1, Math.min(100, Number(req.body?.uses) || 1));
    const validHours = Math.max(1, Math.min(24 * 30, Number(req.body?.validHours) || 24));
    const sessionTtlDays = Math.max(0, Math.min(3650, Number(req.body?.sessionTtlDays) || 0));
    const code = `AXHK-${crypto.randomBytes(4).toString('hex').toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const id = crypto.randomUUID();
    db.data.invites ||= {};
    db.data.invites[id] = { id, hash: inviteHash(code), hint: `${code.slice(0,9)}…${code.slice(-4)}`, usesRemaining: uses, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + validHours * 3600000).toISOString(), sessionTtlDays };
    await db.save(); res.json({ ok: true, id, code, ...db.data.invites[id], hash: undefined });
  });
  app.delete('/api/admin/invites/:id', requireAdmin, async (req, res) => { delete db.data.invites?.[req.params.id]; await db.save(); res.json({ ok: true }); });
  app.get('/api/backup', requireAdmin, (req, res) => { res.setHeader('Content-Disposition', `attachment; filename="A-X-HK-safe-backup-${Date.now()}.json"`); res.json(safeBackupPayload()); });
  app.post('/api/backup/restore', requireAdmin, async (req, res) => {
    const b = req.body?.backup || req.body;
    if (!b || b.format !== 'axhk-safe-backup-v1') return res.status(400).json({ error: 'Invalid A-X-HK safe backup file.' });
    for (const key of ['sessions','groups','users','warnings','notes','sessionAutoReplies','sessionSavedReplies','groupXp','groupActivity']) if (b[key] && typeof b[key] === 'object') db.data[key] = b[key];
    for (const key of ['reminders','birthdays','events','scheduledMessages','scheduledStatuses']) if (Array.isArray(b[key])) db.data[key] = b[key];
    if (b.sessionPolicy && typeof b.sessionPolicy === 'object') db.data.sessionPolicy = { ...db.data.sessionPolicy, ...b.sessionPolicy };
    if (b.ui && typeof b.ui === 'object') db.data.ui = { ...db.data.ui, ...b.ui };
    await db.save(); res.json({ ok: true, message: 'Safe settings restored. WhatsApp credentials/admin auth/vault were not changed.' });
  });
  app.get('/api/update/info', requireAdmin, (req, res) => res.json({ version: config.version, node: process.version, platform: process.platform, uptime: Math.floor(process.uptime()), persistentRoot: config.persistentRoot, message: 'Use a FULL A-X-HK ZIP upgrade after taking a safe backup. WhatsApp credentials remain in persistent storage.' }));

  // Public multi-link portal. Users can only manage the session whose management key they received.
  app.post('/api/multi/create', async (req, res) => {
    try {
      if (!config.multi.enabled) return res.status(403).json({ error: 'Multi-linking is disabled.' });
      if (!allowSessionCreate(req)) return res.status(429).json({ error: 'Too many new sessions from this connection. Try again later.' });
      const policy = phonePolicy(req.body?.phone);
      if (!policy.ok) return res.status(403).json({ error: policy.reason });
      const grant = accessGrant(req.body?.accessCode);
      if (!grant.ok) return res.status(401).json({ error: grant.error });
      const created = await waManager.createPublicSession({ phone: req.body?.phone, label: req.body?.label, ttlDays: grant.ttlDays });
      await consumeInvite(grant.invite);
      res.json({ ok: true, ...created, warning: 'This management key is shown only to your browser. Do not share it.' });
    } catch (err) { res.status(400).json({ error: err.message }); }
  });
  app.get('/api/multi/:id/state', requireLinkedSession, async (req, res) => {
    try { const inst = await waManager.ensurePublicSession(req.params.id); res.json(publicSessionState(inst)); }
    catch (err) { res.status(404).json({ error: err.message }); }
  });
  app.get('/api/multi/:id/qr', requireLinkedSession, async (req, res) => {
    try {
      const inst = await waManager.ensurePublicSession(req.params.id);
      if (!inst.state.qr) return res.status(404).json({ error: 'QR is not ready yet. Wait a few seconds and refresh.' });
      const dataUrl = await QRCode.toDataURL(inst.state.qr, { width: 520, margin: 2, errorCorrectionLevel: 'M' });
      res.json({ ok: true, dataUrl });
    } catch (err) { res.status(400).json({ error: err.message }); }
  });
  app.post('/api/multi/:id/pair', requireLinkedSession, async (req, res) => {
    try {
      const code = await waManager.requestPairingCode(req.body?.phone, req.params.id);
      const inst = waManager.getInstance(req.params.id);
      res.json({ ok: true, code, formattedCode: formatPairCode(code), createdAt: inst?.state?.pairCodeCreatedAt || null });
    } catch (err) { res.status(400).json({ error: err.message }); }
  });
  app.post('/api/multi/:id/reconnect', requireLinkedSession, async (req, res) => {
    try { await waManager.reconnectNow(req.params.id); res.json({ ok: true }); } catch (err) { res.status(400).json({ error: err.message }); }
  });
  app.post('/api/multi/:id/reset', requireLinkedSession, async (req, res) => {
    if (req.body?.confirm !== 'UNLINK') return res.status(400).json({ error: 'Confirmation required.' });
    try { await waManager.logoutAndReset(req.params.id); res.json({ ok: true }); } catch (err) { res.status(400).json({ error: err.message }); }
  });
  app.post('/api/multi/:id/brand', requireLinkedSession, async (req, res) => {
    if (req.body?.confirm !== 'APPLY') return res.status(400).json({ error: 'Confirmation required.' });
    try { res.json({ ok: true, results: await waManager.applyProfileBranding(req.params.id) }); } catch (err) { res.status(400).json({ error: err.message }); }
  });
  app.post('/api/multi/:id/settings', requireLinkedSession, async (req, res) => {
    const settings = db.session(req.params.id);
    const { mode, prefix, autoRead, autoReact, autoTyping, autoRecording, statusSeen, antiDeletePrivate, menuTheme, quietEnabled, quietStart, quietEnd, awayEnabled, awayText } = req.body || {};
    if (mode !== undefined) {
      if (!['public', 'private'].includes(mode)) return res.status(400).json({ error: 'Mode must be public or private.' });
      settings.mode = mode;
    }
    if (prefix !== undefined) {
      if (typeof prefix !== 'string' || prefix.length < 1 || prefix.length > 3 || /\s/.test(prefix)) return res.status(400).json({ error: 'Prefix must be 1-3 non-space characters.' });
      settings.prefix = prefix;
    }
    if (autoRead !== undefined) settings.autoRead = Boolean(autoRead);
    if (autoReact !== undefined) settings.autoReact = Boolean(autoReact);
    if (autoTyping !== undefined) settings.autoTyping = Boolean(autoTyping);
    if (autoRecording !== undefined) settings.autoRecording = Boolean(autoRecording);
    if (statusSeen !== undefined) settings.statusSeen = Boolean(statusSeen);
    if (antiDeletePrivate !== undefined) settings.antiDeletePrivate = Boolean(antiDeletePrivate);
    if (menuTheme !== undefined) { if (!['royal','neon','minimal'].includes(menuTheme)) return res.status(400).json({ error: 'Invalid menu theme.' }); settings.menuTheme = menuTheme; }
    if (quietEnabled !== undefined || quietStart !== undefined || quietEnd !== undefined) { settings.quietHours ||= { enabled:false,start:'01:00',end:'07:00' }; if (quietEnabled !== undefined) settings.quietHours.enabled = Boolean(quietEnabled); if (quietStart !== undefined && /^([01]\d|2[0-3]):[0-5]\d$/.test(quietStart)) settings.quietHours.start = quietStart; if (quietEnd !== undefined && /^([01]\d|2[0-3]):[0-5]\d$/.test(quietEnd)) settings.quietHours.end = quietEnd; }
    if (awayEnabled !== undefined || awayText !== undefined) { settings.away ||= { enabled:false,text:'' }; if (awayEnabled !== undefined) settings.away.enabled = Boolean(awayEnabled); if (awayText !== undefined) settings.away.text = String(awayText).slice(0,1000); }
    if (settings.autoTyping && settings.autoRecording) {
      if (autoRecording !== undefined) settings.autoTyping = false;
      else settings.autoRecording = false;
    }
    await db.save();
    res.json({
      ok: true, mode: settings.mode || config.mode, prefix: settings.prefix || config.prefix, autoRead: settings.autoRead,
      autoReact: settings.autoReact, autoTyping: settings.autoTyping, autoRecording: settings.autoRecording, statusSeen: settings.statusSeen, antiDeletePrivate: settings.antiDeletePrivate,
      menuTheme: settings.menuTheme || 'royal', quietHours: settings.quietHours, away: settings.away
    });
  });
  app.delete('/api/multi/:id', requireLinkedSession, async (req, res) => {
    if (req.body?.confirm !== 'DELETE') return res.status(400).json({ error: 'Confirmation required.' });
    try { await waManager.removePublicSession(req.params.id); res.json({ ok: true }); } catch (err) { res.status(400).json({ error: err.message }); }
  });

  app.use((req, res) => res.status(404).json({ error: 'Not found' }));
  const server = app.listen(config.port, '0.0.0.0', () => logger.info({ port: config.port }, `${config.shortName} dashboard listening`));
  return server;
}
