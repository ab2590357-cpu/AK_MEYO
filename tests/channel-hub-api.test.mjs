import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../channel-hub/api/index.js';

async function run({ mode='health', method='GET', body={}, headers={} }={}){
  let output='',status=200,hs={};
  const req={query:{mode},method,body,headers:{host:'example.vercel.app',...headers},socket:{remoteAddress:'127.0.0.1'}};
  const res={setHeader(k,v){hs[k]=v},set statusCode(v){status=v},get statusCode(){return status},end(s){output=s}};
  await handler(req,res);
  return {status,headers:hs,body:JSON.parse(output)};
}
test('unconfigured health returns not ready',async()=>{
  const result=await run();assert.equal(result.status,200);assert.equal(result.body.ready,false);
});
test('unconfigured service refuses public submission and worker queue',async()=>{
  let a=await run({mode:'submit',method:'POST',body:{link:'https://chat.whatsapp.com/ABC123456789012345'}});
  assert.equal(a.status,503);
  a=await run({mode:'worker'});
  assert.equal(a.status,503);
});
test('unconfigured service cannot reveal admin submissions',async()=>{
  const x=await run({mode:'admin'});assert.equal(x.status,503);
});

test('owner-only submission requires valid token and uses separate owner RPC',async()=>{
  const before={...process.env},originalFetch=global.fetch,calls=[];
  try{
    Object.assign(process.env,{
      SUPABASE_URL:'https://example.supabase.co',
      EDGE_PROXY_TOKEN:'a'.repeat(64),HASH_SALT:'b'.repeat(64),
      WORKER_TOKEN:'c'.repeat(64),ADMIN_TOKEN:'d'.repeat(64),
      CHANNEL_HUB_ENABLED:'true'
    });
    global.fetch=async(_url,options)=>{
      const req=JSON.parse(options.body);
      calls.push(req.path);
      return {ok:true,json:async()=> req.path==='rpc/axhk_worker_ready'
        ? true
        : {accepted:true,id:'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1'}};
    };
    const request={mode:'admin',method:'POST',body:{action:'submit',link:'https://whatsapp.com/channel/0029VbA4HK9LNSaApTeufD1F'}};
    const unauthenticated=await run(request);
    assert.equal(unauthenticated.status,401);
    const allowed=await run({...request,headers:{authorization:'Bearer '+'d'.repeat(64)}});
    assert.equal(allowed.status,200);
    assert.equal(allowed.body.status,'pending');
    assert.deepEqual(calls,['rpc/axhk_worker_ready','rpc/axhk_admin_submit_link']);
  }finally{process.env=before;global.fetch=originalFetch;}
});


test('public branding endpoint returns defaults without configured secrets',async()=>{
  const result=await run({mode:'brand'});
  assert.equal(result.status,200);
  assert.equal(result.body.branding.brandName,'A-X-HK');
  assert.ok(result.body.branding.channelUrl.startsWith('https://whatsapp.com/channel/'));
});
test('branding admin rejects invalid colors and external links before database write',async()=>{
  const old={...process.env},fetchBefore=global.fetch;
  try{
    Object.assign(process.env,{
      SUPABASE_URL:'https://example.supabase.co',
      EDGE_PROXY_TOKEN:'a'.repeat(64),HASH_SALT:'b'.repeat(64),
      WORKER_TOKEN:'c'.repeat(64),ADMIN_TOKEN:'d'.repeat(64),CHANNEL_HUB_ENABLED:'true'
    });
    const headers={authorization:'Bearer '+'d'.repeat(64)};
    let called=0;
    global.fetch=async()=>{called++;return {ok:true,json:async()=>true}};
    let result=await run({mode:'admin',method:'POST',headers,body:{action:'saveBrand',branding:{accentColor:'evil();'}}});
    assert.equal(result.status,400);
    assert.equal(called,0);
    result=await run({mode:'admin',method:'POST',headers,body:{action:'saveBrand',branding:{channelUrl:'https://example.org/phishing'}}});
    assert.equal(result.status,400);
    assert.equal(called,0);
  }finally{process.env=old;global.fetch=fetchBefore;}
});
test('unauthorized user cannot save branding',async()=>{
  const old={...process.env},fetchBefore=global.fetch;
  try{
    Object.assign(process.env,{
      SUPABASE_URL:'https://example.supabase.co',
      EDGE_PROXY_TOKEN:'a'.repeat(64),HASH_SALT:'b'.repeat(64),
      WORKER_TOKEN:'c'.repeat(64),ADMIN_TOKEN:'d'.repeat(64)
    });
    let called=0;global.fetch=async()=>{called++;throw Error('should never fetch');};
    const response=await run({mode:'admin',method:'POST',body:{action:'saveBrand',branding:{brandName:'Hacker'}}});
    assert.equal(response.status,401);assert.equal(called,0);
  }finally{process.env=old;global.fetch=fetchBefore;}
});
