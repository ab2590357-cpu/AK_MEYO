import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const read=p=>fs.readFile(path.join(root,p),'utf8');
test('cloud routes require owner login and worker authentication',async()=>{
 const api=await read('api/index.js');
 assert.match(api,/validSession\(req\)/);
 assert.match(api,/workerAuth\(req\)/);
 assert.match(api,/crypto\.scryptSync/);
 assert.match(api,/HttpOnly; SameSite=Strict/);
 assert.match(api,/Termux bridge is offline/);
 assert.match(api,/supabase-store/);
 assert.doesNotMatch(api,/@vercel\\/blob/);
 assert.match(api,/AXHK_SUPABASE_RELAY_URL/);
 assert.doesNotMatch(api,/https?:\/\/127\.0\.0\.1/);
});
test('Termux agent connects only outbound and keeps credentials on localhost',async()=>{
 const agent=await read('termux-agent.mjs');
 assert.match(agent,/http:\/\/127\.0\.0\.1:/);
 assert.match(agent,/AXHK_BRIDGE_SECRET/);
 assert.match(agent,/AXHK_VERCEL_BYPASS/);
 assert.match(agent,/\/api\/auth\/login/);
 assert.doesNotMatch(agent,/\.listen\(|0\.0\.0\.0/);
});
test('all original owner pages plus the premium cloud UI exist',async()=>{
 for(const p of ['dashboard.html','pair.html','sessions.html','deploy.html','link.html','owner.html']){
  const h=await read('public/'+p);
  assert.match(h,/viewport/i);
  assert.match(h,/A-X-HK/i);
  if(p!=='owner.html')assert.match(h,/cloud\.js/);
 }
 for(const p of ['assets/app.js','assets/pair.js','assets/style.css','assets/logo.svg','assets/cloud.js','assets/cloud.css','assets/brand-card.png']){
  const b=await fs.readFile(path.join(root,'public',p));assert.ok(b.length>50);
 }
});
test('Vercel rewrites support owner pages and protected API',async()=>{
 const cfg=JSON.parse(await read('vercel.json'));
 const paths=cfg.rewrites.map(x=>x.source);
 assert.ok(paths.includes('/api/:path*'));
 for(const p of ['/owner','/dashboard','/pair','/sessions','/deploy'])assert.ok(paths.includes(p));
 assert.equal(cfg.functions['api/index.js'].maxDuration,30);
});

test('private Supabase relay credentials remain server-side and access is scoped',async()=>{
 const a=await read('api/supabase-store.js');
 assert.match(a,/AXHK_SUPABASE_RELAY_TOKEN/);
 assert.match(a,/x-axhk-relay-token/);
 assert.match(a,/signal:controller.signal/);
 const api=await read('api/index.js');
 assert.match(api,/enabled:false/);
 assert.doesNotMatch(api,/BLOB_READ_WRITE_TOKEN/);
});
test('Termux agent polls at a free-tier-friendly interval',async()=>{
 const agent=await read('termux-agent.mjs');
 assert.match(agent,/await sleep\(12000\)/);
 assert.match(agent,/publicPairingEnabled/);
});
