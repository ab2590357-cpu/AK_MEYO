import crypto from 'node:crypto';
const OWNER='https://axhk-bot-panel.vercel.app';
const json=(res,status,obj)=>res.status(status).setHeader('Cache-Control','no-store, private').setHeader('X-Content-Type-Options','nosniff').json(obj);
const reqLimits=new Map();
function permitted(path,method){
 if(path==='/api/brand')return method==='GET';
 if(path==='/api/multi/create')return method==='POST';
 return /^\/api\/multi\/ax_[a-f0-9]{14}\/(state|qr|pair|reconnect|settings)$/.test(path) &&
  ((/\/(state|qr)$/.test(path)&&method==='GET')||(/\/(pair|reconnect|settings)$/.test(path)&&method==='POST'));
}
function limitCreate(req){
 const ip=String(req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0].slice(0,90);
 const now=Date.now(),hour=3600000;
 const row=(reqLimits.get(ip)||[]).filter(x=>now-x<hour);
 if(row.length>=5)return false;
 row.push(now);reqLimits.set(ip,row);
 if(reqLimits.size>1500)reqLimits.clear();
 return true;
}
async function ownerFetch(route,options={}){
 const secret=process.env.AXHK_PUBLIC_RELAY_KEY;
 const bypass=process.env.AXHK_OWNER_PROTECTION_BYPASS;
 if(!secret||!bypass)throw Error('Public relay has not been configured');
 const r=await fetch(OWNER+'/api/public/'+route,{
  method:options.method||'GET',
  headers:{'content-type':'application/json','x-axhk-public-key':secret,'x-vercel-protection-bypass':bypass},
  body:options.body?JSON.stringify(options.body):undefined,
  redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(27000)
 });
 if(r.status>=300&&r.status<400)throw Error('Protected owner relay did not accept gateway authentication');
 const d=await r.json().catch(()=>({}));
 return {status:r.status,data:d};
}
export default async function handler(req,res){
 try{
  if(req.method==='OPTIONS')return res.status(405).end();
  const route=String(req.query.route||'').replace(/^\/+|\/+$/g,'');
  if(route==='status'&&req.method==='GET'){
   const u=await ownerFetch('status');
   if(u.status!==200)return json(res,503,{error:'Pairing service is temporarily unavailable'});
   return json(res,200,{enabled:!!u.data.enabled,online:!!u.data.online,message:String(u.data.message||'').slice(0,240),updatedAt:u.data.updatedAt||null});
  }
  if(route==='brand'&&req.method==='GET'){
   const u=await ownerFetch('relay',{method:'POST',body:{path:'/api/brand',method:'GET',token:'',data:{}}});
   if(u.status!==200)return json(res,u.status,{error:u.data?.error||'Bot brand details unavailable'});
   return json(res,200,{botName:u.data?.botName||'A-X-HK',version:u.data?.version||'',multi:{enabled:!!u.data?.multi?.enabled,maxSessions:Number(u.data?.multi?.maxSessions||0),accessCodeRequired:!!u.data?.multi?.accessCodeRequired}});
  }
  if(route!=='proxy'||req.method!=='POST')return json(res,404,{error:'Not found'});
  const path=String(req.body?.path||''),method=String(req.body?.method||'GET').toUpperCase();
  const token=String(req.headers['x-session-token']||'');
  const data=req.body?.data||{};
  if(!permitted(path,method))return json(res,403,{error:'This action is not available on the public portal'});
  if(!data||typeof data!=='object'||Array.isArray(data)||JSON.stringify(data).length>6000||token.length>180)
   return json(res,400,{error:'Invalid request'});
  if(path!=='/api/multi/create'&&path!=='/api/brand'&&token.length<24)return json(res,401,{error:'Session key required'});
  if(path==='/api/multi/create'&&!limitCreate(req))return json(res,429,{error:'Too many pairing requests. Try again later.'});
  // Preserve per-visitor creation limits across the Termux relay without exposing raw IPs.
  const ip=String(req.headers['x-vercel-forwarded-for']||req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0].trim().slice(0,200);
  const clientKey=crypto.createHmac('sha256',process.env.AXHK_PUBLIC_RELAY_KEY||'').update(ip).digest('hex').slice(0,32);
  const u=await ownerFetch('relay',{method:'POST',body:{path,method,token,data,clientKey}});
  return json(res,u.status,u.data);
 }catch(err){
  console.error('[A-X-HK public relay]',String(err?.message||err).slice(0,130));
  return json(res,503,{error:'Secure pairing service is temporarily unavailable. Please retry shortly.'});
 }
}