import { createClient } from 'npm:@supabase/supabase-js@2.80.0';

const endpoint = Deno.env.get('SUPABASE_URL') || '';
const defaults = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}');
const privateKey = defaults.default || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const db = createClient(endpoint, privateKey, { auth: { autoRefreshToken: false, persistSession: false } });
const allowedRpc = new Set(['axhk_submit_link','axhk_claim_link','axhk_complete_link','axhk_admin_link_action','axhk_record_worker_heartbeat','axhk_worker_ready','axhk_admin_submit_link','axhk_brand_get','axhk_brand_save']);
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const hex64 = /^[a-f0-9]{64}$/i;

function reply(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status, headers: { 'content-type': 'application/json; charset=utf-8',
      'cache-control':'no-store','x-content-type-options':'nosniff' }
  });
}
function safeEq(a: string, b: string) {
  if (a.length !== b.length || !a.length) return false;
  let diff = 0; for (let i=0; i<a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
async function hashToken(raw: string) {
  const bytes = new TextEncoder().encode(raw);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('');
}
Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return reply(405,{error:'Method not allowed'});
  if (!endpoint || !privateKey) return reply(503,{error:'Backend configuration unavailable'});
  const presented = req.headers.get('x-axhk-proxy-token') || '';
  if (!hex64.test(presented)) return reply(401,{error:'Unauthorized'});
  try {
    const { data:settings, error:settingsError } = await db.from('axhk_channel_config')
      .select('config_value').eq('config_key','edge_proxy_sha256').maybeSingle();
    if (settingsError || !safeEq(await hashToken(presented),String(settings?.config_value || ''))) return reply(401,{error:'Unauthorized'});
    const payload = await req.json();
    const path = String(payload?.path || '');
    const method = String(payload?.method || 'GET');
    if (path.startsWith('rpc/')) {
      const name = path.slice(4);
      if (method !== 'POST' || !allowedRpc.has(name)) return reply(403,{error:'Blocked function'});
      const params = payload?.body && typeof payload.body==='object' ? payload.body : {};
      const { data, error } = await db.rpc(name, params);
      if (error) { console.error('Gateway rpc error',error.code); return reply(500,{error:'Operation failed'}); }
      return reply(200,data);
    }
    if (path.startsWith('axhk_channel_submissions?') && method==='GET') {
      const q = new URL('https://internal.local/'+path).searchParams;
      if (q.get('id') && q.get('receipt_hash')) {
        const id = String(q.get('id')).replace(/^eq\./,'');
        const hash = String(q.get('receipt_hash')).replace(/^eq\./,'');
        if (!uuid.test(id) || !hex64.test(hash)) return reply(400,{error:'Bad receipt'});
        const {data,error}=await db.from('axhk_channel_submissions')
          .select('id,status,created_at,posted_at,kind,last_error').eq('id',id).eq('receipt_hash',hash).limit(1);
        if (error) return reply(500,{error:'Query failed'});
        return reply(200,data || []);
      }
      if (q.get('order')==='created_at.desc' && q.get('limit')==='60') {
        const {data,error}=await db.from('axhk_channel_submissions')
          .select('id,link,kind,status,created_at,posted_at,attempts,last_error')
          .order('created_at',{ascending:false}).limit(60);
        if (error) return reply(500,{error:'Query failed'});
        return reply(200,data || []);
      }
    }
    return reply(403,{error:'Blocked request'});
  } catch (error) {
    console.error('Channel Hub gateway request failed',String(error).slice(0,140));
    return reply(503,{error:'Gateway unavailable'});
  }
});