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

// Validated, persistently stored public brand settings. The private admin token
// is required for writes; none of the secret database configuration is returned.
const BRAND_DEFAULTS = Object.freeze({
  brandName:'A-X-HK', brandTagline:'OFFICIAL NETWORK',
  heroTitle:'Share your community.',heroHighlight:'Grow together.',
  heroDescription:'Your WhatsApp Group or Channel deserves to be discovered. Share your invite link and connect your community with A-X-HK.',
  eyebrow:'✦ COMMUNITY DISCOVERY NETWORK ✦',
  submitTitle:'Share your link',
  submitDescription:'Paste an invitation link below. Only official WhatsApp invitation URLs are accepted.',
  submitButton:'Submit & auto-publish link',
  acceptedTitle:'Link accepted!',
  acceptedText:'Your link has been submitted. Our bot is publishing it automatically.',
  postedTitle:'Your link is posted on our Channel!',
  postedText:'Your invitation is now published. Tap below to check it on our official WhatsApp Channel.',
  channelButton:'View your link on our Channel ↗',
  pendingTitle:'Publishing your link…',
  pendingText:'Your link is in the queue. This screen updates automatically.',
  channelUrl:'https://whatsapp.com/channel/0029VbA4HK9LNSaApTeufD1F',
  contactNumber:'923044596780',contactLabel:'Chat with Abdullah',
  founderName:'ABDULLAH-X-HACKER',
  founderDescription:'Building a connected network of creators, groups and channels.',
  headerChannelLabel:'Explore Channel',headerSubmitLabel:'Submit Link',
  heroPrimaryLabel:'Submit your link',heroSecondaryLabel:'Explore the Channel',heroBadge:'CONNECTED COMMUNITY NETWORK',
  trustOne:'Official WhatsApp invites',trustTwo:'12-hour fair-use cooldown',trustThree:'Publishing when bot is online',
  sectionHeadingTitle:'Put your link',sectionHeadingHighlight:'in motion.',
  sectionHeadingDescription:'Share an invitation. Follow its real publishing status. Every successful post leads directly to the official Channel.',
  formHelper:'Official invitation links only. Verified posting requires the WhatsApp bot to be connected.',
  formFooterLeft:'ENCRYPTED TRANSFER',formFooterRight:'STATUS UPDATED AUTOMATICALLY',
  visualCardTitle:'Community first',visualCardText:'One link. Wider reach.',
  communityEyebrow:'THE A-X-HK NETWORK',communityTitle:'Community without',communityHighlight:'limits to discovery.',
  communityDescription:'Discover our official WhatsApp Channel and connect through shared communities.',
  communityButton:'Explore Official Channel',
  footerExploreTitle:'Explore',footerConnectTitle:'Connect',
  footerHomeLabel:'Home',footerSubmitLabel:'Submit link',footerHowLabel:'How it works',
  footerChannelLabel:'WhatsApp Channel',footerSupportLabel:'WhatsApp support',footerStudioLabel:'Owner Studio',
  howTitle:'From your link to our Channel.',howDescription:'One submission, a verified bot and a clear publishing status.',
  step1Title:'Paste your invitation',step1Description:'Share an invite for a WhatsApp Group or Channel you manage.',
  step2Title:'Instant validation',step2Description:'We check the format, duplicates and fair-use cooldown.',
  step3Title:'Verified Channel post',step3Description:'Our connected bot posts automatically; we show confirmation when WhatsApp returns a receipt.',
  cooldownTitle:'A fair space for every community',cooldownText:'Public visitors can submit one link per 12 hours. Owner submissions are managed separately.',
  failedTitle:'This link needs review',failedText:'A confirmed Channel post is not available. Please contact the owner for help.',
  channelButtonNote:'Open the official Channel to see the latest posts.',
  founderEyebrow:'FOUNDER & COMMUNITY SUPPORT',founderButton:'Connect with Abdullah',
  footerDescription:'Your community deserves the right audience. Discover, connect and grow through our verified WhatsApp network.',
  footerCopyright:'© 2026 A-X-HK. Powered by ABDULLAH-X-HACKER.',
  footerNote:'Automated publishing depends on an active verified bot connection.',
  accentColor:'#a8ffbf', backgroundColor:'#090f0e',surfaceColor:'#121b19',darkTextColor:'#f5fff7',
  lightBackgroundColor:'#f2f6f2',lightSurfaceColor:'#ffffff',lightTextColor:'#12231b',
  defaultTheme:'dark',motionLevel:'enhanced',fontFamily:'manrope',radiusStyle:'rounded',allowThemeToggle:true,
  logoData:'',heroImageData:''
});
function validBrand(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Brand settings object required');
  const clean={...BRAND_DEFAULTS};
  const textLimits={
    brandName:45,brandTagline:50,heroTitle:100,heroHighlight:100,
    heroDescription:450,eyebrow:100,submitTitle:80,submitDescription:260,
    submitButton:80,acceptedTitle:100,acceptedText:260,postedTitle:100,
    postedText:260,channelButton:85,pendingTitle:100,pendingText:250,
    contactLabel:65,founderName:90,founderDescription:260,
    headerChannelLabel:45,headerSubmitLabel:45,heroPrimaryLabel:65,heroSecondaryLabel:65,heroBadge:100,
    trustOne:95,trustTwo:95,trustThree:95,
    sectionHeadingTitle:90,sectionHeadingHighlight:90,sectionHeadingDescription:250,
    formHelper:230,formFooterLeft:70,formFooterRight:70,visualCardTitle:65,visualCardText:65,
    communityEyebrow:90,communityTitle:100,communityHighlight:100,communityDescription:240,communityButton:80,
    footerExploreTitle:50,footerConnectTitle:50,footerHomeLabel:60,footerSubmitLabel:60,footerHowLabel:60,
    footerChannelLabel:70,footerSupportLabel:70,footerStudioLabel:70,
    howTitle:110,howDescription:250,
    step1Title:85,step1Description:190,step2Title:85,step2Description:190,step3Title:85,step3Description:190,
    cooldownTitle:95,cooldownText:260,failedTitle:100,failedText:270,
    channelButtonNote:190,founderEyebrow:65,founderButton:65,footerDescription:320,footerCopyright:140,footerNote:250
  };
  for(const [key,max] of Object.entries(textLimits)){
    if(body[key]!==undefined){
      if(typeof body[key]!=='string' || body[key].length>max) throw new Error('Invalid branding field: '+key);
      clean[key]=body[key].trim();
    }
  }
  for(const key of ['accentColor','backgroundColor','surfaceColor','lightBackgroundColor','lightSurfaceColor','lightTextColor','darkTextColor']){
    if(body[key]!==undefined){
      if(typeof body[key]!=='string'||!/^#[0-9a-fA-F]{6}$/.test(body[key])) throw new Error('Invalid color: '+key);
      clean[key]=body[key];
    }
  }
  for(const [key,values] of Object.entries({
    defaultTheme:['dark','light','system'],
    motionLevel:['enhanced','balanced','off'],
    fontFamily:['manrope','inter','spacegrotesk'],
    radiusStyle:['rounded','soft','sharp']
  })){
    if(body[key]!==undefined){
      if(typeof body[key]!=='string'||!values.includes(body[key])) throw new Error('Invalid appearance setting: '+key);
      clean[key]=body[key];
    }
  }
  if(body.allowThemeToggle!==undefined){
    if(typeof body.allowThemeToggle!=='boolean') throw new Error('Invalid theme toggle setting');
    clean.allowThemeToggle=body.allowThemeToggle;
  }
  if(body.contactNumber!==undefined){
    if(!/^[0-9]{10,16}$/.test(body.contactNumber)) throw new Error('Contact number must include country code and digits only');
    clean.contactNumber=body.contactNumber;
  }
  if(body.channelUrl!==undefined){
    const parsed=canonicalLink(body.channelUrl);
    if(parsed.kind!=='channel') throw new Error('Enter a valid WhatsApp Channel link');
    clean.channelUrl=parsed.link;
  }
  for(const [field,max] of Object.entries({logoData:240000,heroImageData:480000})){
    if(body[field]===undefined)continue;
    const image=body[field];
    if(typeof image!=='string'||image.length>max||
       (image && !/^data:image\/(?:webp|png|jpeg);base64,[A-Za-z0-9+/]+=*$/.test(image)))
      throw new Error(field+' must be a compressed JPG/PNG/WebP data image within the limit');
    clean[field]=image;
  }
  return clean;
}
async function readBrand(){
  const saved=await rpc('axhk_brand_get',{});
  return validBrand({...BRAND_DEFAULTS,...(saved&&typeof saved==='object'&&!Array.isArray(saved)?saved:{})});
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
  if (req.method === 'GET' && mode === 'brand') {
    if(!ensureConfigured()) return send(res,200,{ok:true,branding:BRAND_DEFAULTS});
    try{return send(res,200,{ok:true,branding:await readBrand()});}
    catch(error){console.error('Brand settings unavailable',error?.message);return send(res,200,{ok:true,branding:BRAND_DEFAULTS});}
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
      if(req.method==='GET'&&req.query?.action==='brand'){
        return send(res,200,{ok:true,branding:await readBrand()});
      }
      if(req.method==='POST'&&req.body?.action==='saveBrand'){
        if(!originAllowed(req)) return send(res,403,{error:'Origin not allowed'});
        let branding;
        try{branding=validBrand(req.body?.branding);}
        catch(error){return send(res,400,{error:error.message});}
        const saved=await rpc('axhk_brand_save',{p_settings:branding});
        return send(res,saved===true?200:503,{ok:saved===true,branding});
      }

      if (req.method === 'POST' && req.body?.action === 'submit') {
        if (!originAllowed(req)) return send(res, 403, { error: 'Origin not allowed' });
        if (secret('CHANNEL_HUB_ENABLED') !== 'true' || await rpc('axhk_worker_ready', {}) !== true)
          return send(res, 503, { error: 'Bot is offline or Channel is not verified' });
        const { link, kind } = canonicalLink(req.body?.link);
        const receipt = crypto.randomBytes(32).toString('hex');
        const result = await rpc('axhk_admin_submit_link', {
          p_link: link, p_kind: kind,
          p_actor_hash: hash('owner:channel-hub'),
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
