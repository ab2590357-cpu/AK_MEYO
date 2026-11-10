import crypto from 'node:crypto';
import {readJSON,writeJSON,deleteJSON,listJSON} from './supabase-store.js';

const QUEUE_PREFIX='pending-v2/';
const reply=(res,code,obj)=>{res.status(code).setHeader('Cache-Control','private, no-store').setHeader('X-Content-Type-Options','nosniff').json(obj)};
const limitText=(x,n)=>String(x||'').slice(0,n);
const safeEqual=(a,b)=>{const x=Buffer.from(String(a||'')),y=Buffer.from(String(b||''));return x.length===y.length&&crypto.timingSafeEqual(x,y)};
const cookie=(req,name)=>String(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='))?.slice(name.length+1)||'';
const authCookie='axhk_cloud_owner';
const hours=12*3600*1000;
const sign=(value)=>crypto.createHmac('sha256',process.env.AXHK_PANEL_SESSION_SECRET||'').update(value).digest('base64url');
function validSession(req) {
 if(!process.env.AXHK_PANEL_SESSION_SECRET)return false;
 const raw=cookie(req,authCookie), parts=raw.split('.');
 if(parts.length!==3)return false;
 const [exp,nonce,signature]=parts;
 if(!/^[0-9]{10,14}$/.test(exp)||Number(exp)<Date.now()||!nonce||!safeEqual(signature,sign(exp+'.'+nonce)))return false;
 return true;
}
function setCookie(res,token,maxAge=hours){
 res.setHeader('Set-Cookie',authCookie+'='+token+'; Path=/; Max-Age='+Math.max(0,Math.floor(maxAge/1000))+'; Secure; HttpOnly; SameSite=Strict');
}
function ownerLogin(res) {
 const exp=String(Date.now()+hours),nonce=crypto.randomBytes(18).toString('base64url');
 setCookie(res,[exp,nonce,sign(exp+'.'+nonce)].join('.'));
}
const localAllowed=/^\/api\/(?:dashboard|status|brand|commands|pair(?:\/state)?|qr|settings|groups|reconnect|profile\/brand|voice\/status|voice\/sample|link-logo\/image|menu\/image|backup|update\/info|ai\/(?:status|test)|admin\/(?:sessions(?:\/[a-zA-Z0-9_-]+\/reconnect)?|policy|invites(?:\/[a-zA-Z0-9_-]+)?)|multi(?:\/create|\/[a-zA-Z0-9_-]+\/(?:state|qr|pair|reconnect|settings|brand)))$/;
const denied=/\/(?:logout|reset|backup\/restore|auth\/|multi\/[^/]+\/delete)$/;
function validateLocal(path,method){
 return typeof path==='string'&&path.length<180&&/^\/api\//.test(path)
  &&localAllowed.test(path)&&!denied.test(path)&&['GET','POST','DELETE'].includes(method);
}
async function getAgent(){
 try{return await readJSON('status/agent.json')}catch{return null}
}
const asleep=(a)=>!a?.at||Date.now()-Number(a.at)>150_000;
const pairingDefault={enabled:false,message:'New public pairing is temporarily unavailable while the owner completes secure relay setup. Existing linked sessions are unaffected.'};
async function pairingPolicy(){
 try{
  const p=await readJSON('policy/public-pairing.json');
  return p&&typeof p.enabled==='boolean'?{enabled:p.enabled,message:limitText(p.message||pairingDefault.message,240),updatedAt:p.updatedAt||null}:pairingDefault;
 }catch{return pairingDefault}
}
const publicPathAllowed=(path,method)=>{
 if(path==='/api/brand')return method==='GET';
 if(path==='/api/multi/create')return method==='POST';
 return /^\/api\/multi\/ax_[a-f0-9]{14}\/(?:state|qr|pair|reconnect|settings)$/.test(path) &&
  ((/\/(?:state|qr)$/.test(path)&&method==='GET')||(/\/(?:pair|reconnect|settings)$/.test(path)&&method==='POST'));
};
function workerAuth(req) {
 const expected=process.env.AXHK_BRIDGE_SECRET;
 return Boolean(expected&&safeEqual(req.headers['x-axhk-bridge-key'],expected));
}
function ownerAuth(req){
 // The project additionally uses Vercel SSO for every deployment.
 return validSession(req);
}
function pathname(req){
 const path=limitText(req.query.route||'',200);
 return '/api/'+path.replace(/^\/+/,'');
}
async function commandProxy(req,res,path){
 if(!validateLocal(path,req.method))return reply(res,403,{error:'Unsupported or restricted local action'});
 const agent=await getAgent();
 if(asleep(agent))return reply(res,503,{error:'Termux bridge is offline. Start its authorized agent before using live controls.'});
 const binary=Buffer.isBuffer(req.body)?req.body:
  typeof req.body==='string'?Buffer.from(req.body):
  req.body===undefined?Buffer.alloc(0):Buffer.from(JSON.stringify(req.body));
 if(binary.length>2_800_000)return reply(res,413,{error:'Files over 2.8 MB require local Termux upload, not the cloud relay.'});
 const sessionToken=/^\/api\/multi\/ax_[a-f0-9]{14}\//.test(path)?String(req.headers['x-session-token']||''):'';
 const publicClient=(path==='/api/multi/create'&&/^[a-f0-9]{32}$/.test(String(req.headers['x-axhk-public-client']||'')))?String(req.headers['x-axhk-public-client']):'';
 if(sessionToken&&!/^[a-zA-Z0-9_-]{32,180}$/.test(sessionToken))return reply(res,400,{error:'Invalid session key'});
 const id=crypto.randomUUID();
 const pendingPath=QUEUE_PREFIX+id+'.json';
 await writeJSON(pendingPath,{
  id,at:Date.now(),path,method:req.method,sessionToken,publicClient,
  contentType:limitText(req.headers['content-type']||'application/json',110),
  bodyBase64:binary.toString('base64')
 });
 const resultPath='results/'+id+'.json';
 const deadline=Date.now()+23_000;
 while(Date.now()<deadline){
  await new Promise(resolve=>setTimeout(resolve,1100));
  let result;
  try{result=await readJSON(resultPath)}catch{}
  if(!result)continue;
  await deleteJSON(resultPath).catch(()=>{});
  const body=Buffer.from(result.bodyBase64||'','base64');
  res.status(Math.min(599,Math.max(100,Number(result.status||502))));
  res.setHeader('Cache-Control','private, no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Content-Type',String(result.contentType||'application/json').slice(0,120));
  return res.end(body);
 }
 // A timed-out read is no longer useful: do not let it clog the queue.
 // Preserve timed-out writes because they may already be executing on Termux.
 if(req.method==='GET')await deleteJSON(pendingPath).catch(()=>{});
 return reply(res,504,{error:'Termux bridge did not respond in time. Check the phone before retrying a write; the request may still execute.'});
}
export default async function handler(req,res){
 try {
  if(!process.env.AXHK_SUPABASE_RELAY_URL||!process.env.AXHK_SUPABASE_RELAY_TOKEN)return reply(res,503,{error:'Private Supabase relay storage is not configured'});
  const p=pathname(req);
  if(p.startsWith('/api/public/')){
   if(!process.env.AXHK_PUBLIC_RELAY_KEY||!safeEqual(req.headers['x-axhk-public-key'],process.env.AXHK_PUBLIC_RELAY_KEY))
    return reply(res,401,{error:'Private public-gateway credential required'});
   const policy=await pairingPolicy();
   const agent=await getAgent();
   if(p==='/api/public/status'&&req.method==='GET'){
    return reply(res,200,{enabled:policy.enabled,message:policy.message,online:!asleep(agent),hostPairingEnabled:agent?.multiEnabled!==false,updatedAt:policy.updatedAt||null});
   }
   if(p==='/api/public/relay'&&req.method==='POST'){
    const path=String(req.body?.path||''),method=String(req.body?.method||'GET').toUpperCase();
    const token=String(req.body?.token||'');
    const input=req.body?.data||{};
    if(!publicPathAllowed(path,method))return reply(res,403,{error:'Unsupported public pairing action'});
    if((path==='/api/multi/create'||/\/(?:pair|qr)$/.test(path))&&!policy.enabled)
     return reply(res,423,{error:policy.message||'Pairing is temporarily closed'});
    if(!input||typeof input!=='object'||Array.isArray(input))return reply(res,400,{error:'Invalid request'});
    if(JSON.stringify(input).length>8000||token.length>180)return reply(res,413,{error:'Request too large'});
    if(path!=='/api/multi/create'&&path!=='/api/brand'&&token.length<24)
     return reply(res,401,{error:'Session management key required'});
    const clientKey=/^[a-f0-9]{32}$/.test(String(req.body?.clientKey||''))?String(req.body.clientKey):'';
    const forwarded={...req,method,body:input,headers:{...req.headers,'content-type':'application/json','x-session-token':token,'x-axhk-public-client':clientKey}};
    return commandProxy(forwarded,res,path);
   }
   return reply(res,404,{error:'Unknown public pairing operation'});
  }
  if(p.startsWith('/api/bridge/')){
   if(!workerAuth(req))return reply(res,401,{error:'Bridge credential required'});
   if(p==='/api/bridge/next'&&req.method==='GET'){
    const batch=await listJSON({prefix:QUEUE_PREFIX,limit:25});
    for(const candidate of batch.blobs||[]){
     const job=await readJSON(candidate.pathname).catch(()=>null);
     if(!job)continue;
     // A request older than two minutes must not unexpectedly execute later.
     if(Date.now()-Number(job.at||0)>120_000){
      await deleteJSON(candidate.pathname).catch(()=>{});
      continue;
     }
     return reply(res,200,{job});
    }
    return reply(res,200,{job:null});
   }
   if(p==='/api/bridge/heartbeat'&&req.method==='POST'){
    const b=req.body||{};
    await writeJSON('status/agent.json',{at:Date.now(),botStatus:limitText(b.botStatus,40),linkedName:limitText(b.linkedName,120),version:limitText(b.version,50),multiEnabled:typeof b.multiEnabled==='boolean'?b.multiEnabled:null,platform:'Termux'}, {allowOverwrite:true});
    const policy=await pairingPolicy();
    return reply(res,200,{ok:true,publicPairingEnabled:policy.enabled});
   }
   if(p==='/api/bridge/result'&&req.method==='POST'){
    const b=req.body||{},id=String(b.id||'');
    if(!/^[0-9a-f-]{36}$/.test(id)||!Number.isInteger(b.status)||typeof b.bodyBase64!=='string'||b.bodyBase64.length>5_500_000)
     return reply(res,400,{error:'Invalid bridge result'});
    await writeJSON('results/'+id+'.json',{status:b.status,contentType:limitText(b.contentType,120),bodyBase64:b.bodyBase64},{allowOverwrite:true});
    await deleteJSON(QUEUE_PREFIX+id+'.json').catch(()=>{});
    return reply(res,200,{ok:true});
   }
   return reply(res,404,{error:'Unknown bridge operation'});
  }
  // A second, independent signed owner login is required in addition to Vercel SSO.
  // Never let an automation bypass header be used as a dashboard session.
  if(req.headers['x-vercel-protection-bypass']||req.query['x-vercel-protection-bypass'])
   return reply(res,403,{error:'Automation credentials cannot access owner controls'});
  if(p==='/api/cloud/auth'&&req.method==='GET'){
    const owner=await readJSON('auth/owner.json');
    return reply(res,200,{configured:!!owner,authenticated:ownerAuth(req)});
  }
  if(p==='/api/cloud/setup'&&req.method==='POST'){
    const password=String(req.body?.password||'');
    if(password.length<14||password.length>200)return reply(res,400,{error:'Choose an owner password of at least 14 characters'});
    if(await readJSON('auth/owner.json'))return reply(res,409,{error:'Owner account is already configured'});
    const salt=crypto.randomBytes(20),hash=crypto.scryptSync(password,salt,64);
    await writeJSON('auth/owner.json',{salt:salt.toString('base64url'),hash:hash.toString('base64url'),createdAt:Date.now()});
    ownerLogin(res);return reply(res,200,{ok:true});
  }
  if(p==='/api/cloud/login'&&req.method==='POST'){
    const owner=await readJSON('auth/owner.json');
    if(!owner)return reply(res,428,{error:'Owner account requires initial setup'});
    const pass=String(req.body?.password||'');
    if(pass.length>200)return reply(res,401,{error:'Invalid credentials'});
    const candidate=crypto.scryptSync(pass,Buffer.from(owner.salt,'base64url'),64);
    if(!safeEqual(candidate.toString('hex'),Buffer.from(owner.hash,'base64url').toString('hex')))
      return reply(res,401,{error:'Invalid credentials'});
    ownerLogin(res);return reply(res,200,{ok:true});
  }
  if(p==='/api/cloud/logout'&&req.method==='POST'){setCookie(res,'',0);return reply(res,200,{ok:true})}
  if(!ownerAuth(req))return reply(res,401,{error:'Owner login required',cloudOwnerLogin:true});
  if(p==='/api/cloud/pairing'&&req.method==='GET')return reply(res,200,await pairingPolicy());
  if(p==='/api/cloud/pairing'&&req.method==='POST'){
   if(typeof req.body?.enabled!=='boolean')return reply(res,400,{error:'Choose enabled or disabled'});
   const current=await pairingPolicy();
   const message=limitText(String(req.body.message||current.message).trim(),240);
   const policy={enabled:req.body.enabled,message:message||pairingDefault.message,updatedAt:new Date().toISOString()};
   await writeJSON('policy/public-pairing.json',policy,{allowOverwrite:true});
   return reply(res,200,policy);
  }
  if(p==='/api/cloud/status'&&req.method==='GET'){
    const agent=await getAgent();
    return reply(res,200,{online:!asleep(agent),agent:asleep(agent)?null:agent});
  }
  if(p==='/api/auth/state')return reply(res,200,{authenticated:true,setupRequired:false});
  if(p==='/api/auth/logout'&&req.method==='POST'){setCookie(res,'',0);return reply(res,200,{ok:true})}
  if(p==='/api/auth/login'||p==='/api/auth/setup')return reply(res,403,{error:'Use the secured cloud owner login'});
  if(!p.startsWith('/api/'))return reply(res,404,{error:'Not found'});
  return await commandProxy(req,res,p);
 } catch(e){
  console.error('[AXHK cloud relay]',String(e?.message||e).slice(0,160));
  return reply(res,500,{error:'Cloud relay service error'});
 }
}
