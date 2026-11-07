#!/usr/bin/env node
// A-X-HK private outbound Termux bridge. Never exposes localhost to the internet.
import 'dotenv/config';
import {setTimeout as sleep} from 'node:timers/promises';

const panel=String(process.env.AXHK_PANEL_URL||'https://axhk-bot-panel.vercel.app').replace(/\/$/,'');
const key=String(process.env.AXHK_BRIDGE_SECRET||'');
const bypass=String(process.env.AXHK_VERCEL_BYPASS||'');
const local='http://127.0.0.1:'+String(process.env.PORT||'3000');
const localToken=String(process.env.DASHBOARD_TOKEN||'');
const localPassword=String(process.env.AXHK_LOCAL_OWNER_PASSWORD||'');
if(!/^https:\/\/[a-z0-9.-]+$/i.test(panel)||!key||!bypass){
 console.error('A-X-HK Panel Bridge requires AXHK_PANEL_URL, AXHK_BRIDGE_SECRET and AXHK_VERCEL_BYPASS from your private Vercel project.');
 process.exit(1);
}
if(!localToken&&!localPassword){
 console.error('Local owner login needed. Set AXHK_LOCAL_OWNER_PASSWORD in this Termux session, or use your existing DASHBOARD_TOKEN. Never paste credentials in a chat.');
 process.exit(1);
}
let cookie='',running=true,lastBeat=0,currentStatus='starting';
const workerHeaders=()=>({
 'x-axhk-bridge-key':key,
 'x-vercel-protection-bypass':bypass,
 'content-type':'application/json',
 'cache-control':'no-store'
});
async function cloud(route,options={}){
 const res=await fetch(panel+'/api/bridge/'+route,{...options,headers:{...workerHeaders(),...(options.headers||{})},cache:'no-store',signal:AbortSignal.timeout(17000)});
 const type=res.headers.get('content-type')||'';
 if(!type.includes('application/json'))throw Error('Vercel bridge returned a non-JSON response. Check Deployment Protection bypass configuration.');
 const obj=await res.json();
 if(!res.ok)throw Error('Cloud bridge request failed ('+res.status+'): '+String(obj.error||'unknown').slice(0,150));
 return obj;
}
async function authenticate(){
 if(localToken)return;
 const resp=await fetch(local+'/api/auth/login',{
  method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify({password:localPassword}),signal:AbortSignal.timeout(12000)
 });
 if(!resp.ok)throw Error('Local dashboard login failed ('+resp.status+'). Check AXHK_LOCAL_OWNER_PASSWORD.');
 const value=resp.headers.get('set-cookie')||'';
 cookie=value.split(';')[0];
 if(!cookie.startsWith('axhk_admin='))throw Error('Local login did not issue a session cookie.');
}
async function requestLocal(job,allowRetry=true){
 if(!/^\/api\//.test(job.path)||!['GET','POST','DELETE'].includes(job.method))throw Error('Refused invalid local action');
 if(!localToken&&!cookie)await authenticate();
 const body=job.method==='GET'?undefined:Buffer.from(String(job.bodyBase64||''),'base64');
 const headers={'accept':'application/json','x-axhk-cloud-relay':'1','content-type':job.contentType||'application/json'};
 if(localToken)headers['x-dashboard-token']=localToken;
 if(cookie)headers.cookie=cookie;
 const response=await fetch(local+job.path,{
  method:job.method,headers,body,redirect:'manual',signal:AbortSignal.timeout(16000)
 });
 if((response.status===401||response.status===428)&&allowRetry&&!localToken){
  cookie='';await authenticate();return requestLocal(job,false);
 }
 const payload=Buffer.from(await response.arrayBuffer());
 if(payload.length>2_900_000)throw Error('Local response is too large for this relay');
 return {id:job.id,status:response.status,contentType:(response.headers.get('content-type')||'application/json').slice(0,110),
  bodyBase64:payload.toString('base64')};
}
async function heartbeat(){
 let snapshot={};
 try{
  const resp=await fetch(local+'/api/status',{signal:AbortSignal.timeout(5000)});
  if(resp.ok)snapshot=await resp.json();
 }catch{}
 currentStatus=String(snapshot.status||'local_offline');
 const b={botStatus:currentStatus,linkedName:String(snapshot.user?.name||''),version:String(snapshot.version||'')};
 await cloud('heartbeat',{method:'POST',body:JSON.stringify(b)});
 lastBeat=Date.now();
}
const completed=new Map();
process.on('SIGINT',()=>{running=false});
process.on('SIGTERM',()=>{running=false});
console.log('[A-X-HK] Secure outbound Vercel relay starting. Owner auth stays on this phone.');
while(running){
 try {
  if(Date.now()-lastBeat>45000)await heartbeat();
  const response=await cloud('next');
  const job=response.job;
  if(job){
   if(!/^[0-9a-f-]{36}$/.test(job.id))throw Error('Invalid queued command ID');
   let result=completed.get(job.id);
   if(!result){
    try{result=await requestLocal(job)}
    catch(error){
     result={id:job.id,status:502,contentType:'application/json',
      bodyBase64:Buffer.from(JSON.stringify({error:'Termux execution failed: '+String(error.message).slice(0,150)})).toString('base64')};
    }
    completed.set(job.id,result);
    if(completed.size>100)completed.delete(completed.keys().next().value);
   }
   await cloud('result',{method:'POST',body:JSON.stringify(result)});
  }
 }catch(err){
  console.error('[A-X-HK relay]',String(err.message||err).slice(0,210));
  await sleep(10000);
 }
 await sleep(5000);
}
console.log('[A-X-HK] Relay stopped; WhatsApp bot was not stopped or reset.');
