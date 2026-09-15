import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { logger } from '../core/logger.js';

const AUTH_FILE = path.join(config.dataDir, 'admin-auth.json');
const attempts = new Map();
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_ATTEMPTS = 8;
const WINDOW_MS = 15 * 60 * 1000;

function b64(buf) { return Buffer.from(buf).toString('base64url'); }
function fromB64(value) { return Buffer.from(String(value || ''), 'base64url'); }
function hashPassword(password, salt) { return crypto.scryptSync(String(password), salt, 64); }
function safeEqual(a, b) {
  const x = Buffer.from(a || '');
  const y = Buffer.from(b || '');
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
function clientKey(req) { return String(req.ip || req.socket?.remoteAddress || 'unknown').slice(0, 160); }
function rateState(req) {
  const key = clientKey(req);
  const now = Date.now();
  const current = attempts.get(key);
  if (!current || now - current.startedAt > WINDOW_MS) {
    const next = { count: 0, startedAt: now };
    attempts.set(key, next);
    return next;
  }
  return current;
}

class AdminAuth {
  constructor() { this.record = null; }

  async writeRecord() {
    await fs.mkdir(config.dataDir, { recursive: true });
    await fs.writeFile(AUTH_FILE, JSON.stringify(this.record, null, 2), { mode: 0o600 });
  }

  async init() {
    await fs.mkdir(config.dataDir, { recursive: true });
    try {
      const raw = await fs.readFile(AUTH_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed?.salt && parsed?.hash) {
        this.record = parsed;
        // Seamless upgrade from V3/V4 password files. The HMAC secret makes
        // browser logins survive Node restarts without storing the password.
        if (!this.record.sessionSecret) {
          this.record.version = 2;
          this.record.sessionSecret = b64(crypto.randomBytes(32));
          await this.writeRecord();
        }
      }
    } catch (err) {
      if (err.code !== 'ENOENT') logger.warn({ err }, 'Admin auth file could not be loaded');
    }
  }

  isSetup() { return Boolean(this.record?.salt && this.record?.hash); }

  async setup(password) {
    if (this.isSetup()) throw new Error('Admin setup is already complete. Use the same password to log in.');
    const value = String(password || '');
    if (value.length < 10) throw new Error('Choose a dashboard password with at least 10 characters.');
    if (value.length > 200) throw new Error('Dashboard password is too long.');
    const salt = crypto.randomBytes(16);
    const hash = hashPassword(value, salt);
    this.record = {
      version: 2,
      salt: b64(salt),
      hash: b64(hash),
      sessionSecret: b64(crypto.randomBytes(32)),
      createdAt: new Date().toISOString()
    };
    await this.writeRecord();
    return this.createSession();
  }

  verify(password, req) {
    if (!this.isSetup()) return false;
    const state = rateState(req);
    if (state.count >= MAX_ATTEMPTS) throw new Error('Too many login attempts. Try again later.');
    const actual = hashPassword(String(password || ''), fromB64(this.record.salt));
    const expected = fromB64(this.record.hash);
    const ok = safeEqual(actual, expected);
    if (!ok) state.count += 1;
    else attempts.delete(clientKey(req));
    return ok;
  }

  createSession() {
    if (!this.record?.sessionSecret) throw new Error('Admin authentication is not initialized.');
    const payload = b64(Buffer.from(JSON.stringify({
      v: 1,
      iat: Date.now(),
      exp: Date.now() + SESSION_TTL_MS,
      nonce: b64(crypto.randomBytes(12))
    })));
    const signature = b64(crypto.createHmac('sha256', fromB64(this.record.sessionSecret)).update(payload).digest());
    return `${payload}.${signature}`;
  }

  verifySession(token) {
    if (!this.record?.sessionSecret) return false;
    const [payload, signature, extra] = String(token || '').split('.');
    if (!payload || !signature || extra) return false;
    const expected = crypto.createHmac('sha256', fromB64(this.record.sessionSecret)).update(payload).digest();
    if (!safeEqual(fromB64(signature), expected)) return false;
    try {
      const decoded = JSON.parse(fromB64(payload).toString('utf8'));
      return decoded?.v === 1 && Number(decoded.exp) > Date.now();
    } catch { return false; }
  }

  // Session cookies are signed/stateless so they survive process restarts.
  // Logout clears the browser cookie; password changes/secret rotation invalidate all.
  destroySession() {}
}

export const adminAuth = new AdminAuth();
