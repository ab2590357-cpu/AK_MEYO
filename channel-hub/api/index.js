import crypto from 'node:crypto';

// Server-only API. Never expose Supabase service keys or worker/admin tokens to browsers.
function send(res, status, payload, headers = {}) {
  res.statusCode = status;
  for (const [name, value] of Object.entries({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers })) res.setHeader(name, value);
  res.end(JSON.stringify(payload));
}
function secureEqual(a, b) {
  const aa = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  return aa.length > 0 && aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}
function secret(name) { return String(process.env[name] || '').trim(); }
function hash(value) {
  const key = secret('HASH_SALT');
  if (key.length < 32) throw new Error('HASH_SALT must contain at least 32 characters');
  return crypto.createHmac('sha256', key).update(String(value)).digest('hex');
}
function cookieId(req) {
  const raw = String(req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith('axhk_visit='));
  const value = raw ? raw.slice('axhk_visit='.length) : '';
  const [id, sig] = value.split('.');
  if (id && sig && /^[a-f0-9-]{36}$/.test(id) && secureEqual(sig, hash('cookie:' + id))) return { id, fresh: false };
  return { id: crypto.randomUUID(), fresh: true };
}
function originAllowed(req) {
  const origin = req.headers.origin;
  const host = req.headers.host;
  if (!origin) return true;
  try { return new URL(origin).host === host; } catch { return false; }
}
function canonicalLink(raw) {
  const u = new URL(String(raw || '').trim());
  if (u.protocol !== 'https:' || u.username || u.password || u.port) throw new Error('Enter a WhatsApp Group or Channel invite link');
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  if (host === 'chat.whatsapp.com' && /^\/[A-Za-z0-9]{15,40}\/?$/.test(u.pathname)) return { kind: 'group', link: 'https://chat.whatsapp.com' + u.pathname.replace(/\/$/, '') };
  if (host === 'whatsapp.com' && /^\/channel\/[A-Za-z0-9]{8,80}\/?$/.test(u.pathname)) return { kind: 'channel', link: 'https://whatsapp.com' + u.pathname.replace(/\/$/, '') };
  throw new Error('Only valid WhatsApp Group or Channel links are allowed');
}
async function supabase(path, { method = 'GET', body } = {}) {
  const base = secret('SUPABASE_URL').replace(/\/$/, '');
  const token = secret('EDGE_PROXY_TOKEN');
  if (!/^https:\/\/[a-z0-9.-]+\.supabase\.co$/.test(base) || token.length < 32)
    throw new Error('Secure database gateway is not configured');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(base + '/functions/v1/axhk-channel-gateway', {
      method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'x-axhk-proxy-token': token },
      body: JSON.stringify({ path, method, body })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error('Database gateway failed: HTTP ' + response.status);
    return data;
  } finally { clearTimeout(timeout); }
}
const rpc = (name, body) => supabase('rpc/' + name, { method: 'POST', body });
function auth(req, env) { return secureEqual(String(req.headers.authorization || '').replace(/^Bearer /i, ''), secret(env)); }
function ensureConfigured() {
  return secret('SUPABASE_URL') && secret('EDGE_PROXY_TOKEN').length >= 32 && secret('HASH_SALT').length >= 32 && secret('WORKER_TOKEN').length >= 32 && secret('ADMIN_TOKEN').length >= 32;
}
const uuidRe = /^[a-f0-9-]{36}$/i;
export default async function handler(req, res) {
  const mode = String(req.query?.mode || '');
  if (req.method === 'GET' && mode === 'health') {
    const configured = Boolean(ensureConfigured());
    let databaseConnected = false;
    if (configured) {
      try {
        const items = await supabase('axhk_channel_submissions?select=id,link,kind,status,created_at,posted_at,attempts,last_error&order=created_at.desc&limit=60');
        databaseConnected = Array.isArray(items);
      } catch (error) { console.error('Channel Hub health check unavailable', error?.message); }
    }
    const submissionsRequested = secret('CHANNEL_HUB_ENABLED') === 'true';
    let workerReady = false;
    if (submissionsRequested && databaseConnected) {
      try { workerReady = (await rpc('axhk_worker_ready', {})) === true; }
      catch (error) { console.error('Worker readiness check failed', error?.message); }
    }
    const submissionsOpen = submissionsRequested && workerReady;
    return send(res, 200, { ok: true, configured, databaseConnected, workerReady, submissionsOpen, ready: configured && databaseConnected && submissionsOpen });
  }
  if (!ensureConfigured()) return send(res, 503, { error: 'Channel Link Hub is not configured yet' });
  try {
    if (mode === 'submit' && req.method === 'POST') {
      if (secret('CHANNEL_HUB_ENABLED') !== 'true') return send(res, 503, { error: 'Submissions are not open yet' });
      const workerReady = await rpc('axhk_worker_ready', {});
      if (workerReady !== true) return send(res, 503, { error: 'Our WhatsApp Channel bot is offline or not verified. Please try again when it is online.' });
      if (!originAllowed(req)) return send(res, 403, { error: 'Origin not allowed' });
      if (req.body?.website) return send(res, 400, { error: 'Submission rejected' }); // honeypot
      const { link, kind } = canonicalLink(req.body?.link);
      const visitor = cookieId(req);
      const ip = String(req.headers['x-vercel-forwarded-for'] || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim().slice(0,150);
      const receipt = crypto.randomBytes(32).toString('hex');
      const result = await rpc('axhk_submit_link', {
        p_link: link, p_kind: kind,
        p_actor_hash: hash('visitor:' + visitor.id),
        p_ip_hash: hash('ip:' + ip),
        p_receipt_hash: hash('receipt:' + receipt)
      });
      const cookie = 'axhk_visit=' + visitor.id + '.' + hash('cookie:' + visitor.id) + '; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax';
      return send(res, result?.accepted ? 200 : 429, result?.accepted ? { ok: true, id: result.id, receipt, kind, status: 'pending', nextAllowedAt: result.nextAllowedAt } : { ok: false, error: result?.error || 'Try again later', nextAllowedAt: result?.nextAllowedAt }, { 'Set-Cookie': cookie });
    }
    if (mode === 'status' && req.method === 'GET') {
      const id = String(req.query?.id || '');
      const receipt = String(req.query?.receipt || '');
      if (!uuidRe.test(id) || !/^[a-f0-9]{64}$/i.test(receipt)) return send(res, 400, { error: 'Invalid receipt' });
      const rows = await supabase('axhk_channel_submissions?select=id,status,created_at,posted_at,kind,last_error&id=eq.' + encodeURIComponent(id) + '&receipt_hash=eq.' + hash('receipt:' + receipt) + '&limit=1');
      if (!Array.isArray(rows) || !rows.length) return send(res, 404, { error: 'Submission not found' });
      const x = rows[0];
      return send(res, 200, { ok: true, id: x.id, status: x.status, kind: x.kind, createdAt: x.created_at, postedAt: x.posted_at || null, note: x.status === 'failed' ? 'Posting failed. Owner can review and retry.' : undefined });
    }
    if (mode === 'heartbeat' && req.method === 'POST' && auth(req, 'WORKER_TOKEN')) {
      if (secret('CHANNEL_HUB_ENABLED') !== 'true') return send(res,503,{error:'Worker disabled'});
      const jid = String(req.body?.channelJid || '');
      const verified = req.body?.verified === true;
      if (!/^[0-9]{10,30}@newsletter$/.test(jid)) return send(res,400,{error:'Invalid Channel JID'});
      const ok = await rpc('axhk_record_worker_heartbeat',{p_channel_jid:jid,p_verified:verified});
      return send(res,ok===true?200:503,{ok:ok===true});
    }
    if (mode === 'worker' && auth(req, 'WORKER_TOKEN')) {
      if (req.method === 'GET' && req.query?.action === 'verify') {
        return send(res,200,{ok:true,workerAuthenticated:true,submissionsEnabled:secret('CHANNEL_HUB_ENABLED')==='true'});
      }
      if (req.method === 'GET') {
        if (secret('CHANNEL_HUB_ENABLED') !== 'true' || await rpc('axhk_worker_ready', {}) !== true)
          return send(res, 503, { error: 'Worker not verified' });
        const result = await rpc('axhk_claim_link', {});
        return send(res, 200, { ok: true, item: result || null });
      }
      if (req.method === 'POST') {
        if (!uuidRe.test(String(req.body?.id || '')) || !uuidRe.test(String(req.body?.claimToken || ''))) return send(res, 400, { error: 'Invalid claim' });
        const status = req.body?.status === 'posted' ? 'posted' : 'failed';
        const ok = await rpc('axhk_complete_link', {
          p_id: req.body.id, p_claim_token: req.body.claimToken, p_status: status,
          p_message_id: String(req.body?.messageId || '').slice(0,150),
          p_error: String(req.body?.error || '').slice(0,240)
        });
        return send(res, ok ? 200 : 409, { ok: Boolean(ok) });
      }
    }
    if (mode === 'admin' && auth(req, 'ADMIN_TOKEN')) {
      if (req.method === 'POST' && req.body?.action === 'submit') {
        if (!originAllowed(req)) return send(res, 403, { error: 'Origin not allowed' });
        if (secret('CHANNEL_HUB_ENABLED') !== 'true' || await rpc('axhk_worker_ready', {}) !== true)
          return send(res, 503, { error: 'Bot is offline or Channel is not verified' });
        const { link, kind } = canonicalLink(req.body?.link);
        const receipt = crypto.randomBytes(32).toString('hex');
        const ownerHash = hash('owner:channel-hub');
        const result = await rpc('axhk_submit_link', {
          p_link: link, p_kind: kind,
          p_actor_hash: ownerHash,
          p_ip_hash: ownerHash,
          p_receipt_hash: hash('receipt:' + receipt)
        });
        return send(res, result?.accepted ? 200 : 409,
          result?.accepted ? { ok: true, id: result.id, receipt, kind, status:'pending' }
                           : { ok: false, error: result?.error || 'Owner submission not accepted' });
      }
      if (req.method === 'GET') {
        const rows = await supabase('axhk_channel_submissions?select=id,link,kind,status,created_at,posted_at,attempts,last_error&order=created_at.desc&limit=60');
        return send(res, 200, { ok: true, submissions: rows });
      }
      if (req.method === 'POST') {
        if (!uuidRe.test(String(req.body?.id || '')) || !['retry', 'reject'].includes(req.body?.action)) return send(res, 400, { error: 'Invalid action' });
        const updated = await rpc('axhk_admin_link_action', { p_id: req.body.id, p_action: req.body.action });
        return send(res, updated ? 200 : 409, { ok: Boolean(updated) });
      }
    }
    if ((mode === 'worker' || mode === 'heartbeat' || mode === 'admin') && !auth(req, mode === 'admin' ? 'ADMIN_TOKEN' : 'WORKER_TOKEN')) return send(res, 401, { error: 'Unauthorized' });
    return send(res, 404, { error: 'Endpoint not found' });
  } catch (error) {
    if (mode === 'submit' && /WhatsApp|Group|Channel|https/i.test(String(error?.message || '')) && !String(error.message).includes('Database')) return send(res, 400, { error: error.message });
    console.error('Channel Hub server error', error?.message);
    return send(res, 503, { error: 'Service temporarily unavailable' });
  }
}
