// One-time Android owner setup. Stores the worker token only in local .env.
// Never echo, print, upload or commit the token. Does not change WhatsApp session.
import fs from 'node:fs/promises';
import path from 'node:path';
import { stdin, stdout } from 'node:process';

const projectRoot=path.resolve(import.meta.dirname,'..');
const envFile=path.join(projectRoot,'.env');
function securePrompt(label){
  return new Promise((resolve,reject)=>{
    if(!stdin.isTTY||!stdin.setRawMode){reject(new Error('Run this directly in Termux (interactive terminal required).'));return;}
    let value='';
    stdout.write(label+'\nPaste the Vercel WORKER_TOKEN, then press Enter. Input is hidden: ');
    stdin.setRawMode(true);
    stdin.resume();
    const onData=(buffer)=>{
      for(const byte of buffer){
        if(byte===3){finish(new Error('Cancelled'));return;}
        if(byte===10||byte===13){finish(null,value.trim());return;}
        if(byte===127||byte===8){value=value.slice(0,-1);continue;}
        if(byte>=32&&byte<=126)value+=String.fromCharCode(byte);
      }
    };
    const finish=(err,result)=>{
      stdin.off('data',onData);stdin.setRawMode(false);stdin.pause();stdout.write('\n');
      err?reject(err):resolve(result);
    };
    stdin.on('data',onData);
  });
}
function updateEnv(existing,values){
  const lines=existing.split('\n');
  const keys=new Set(Object.keys(values));
  const seen=new Set();
  const next=lines.map(line=>{
    const m=line.match(/^([A-Z][A-Z0-9_]*)=/);
    if(!m||!keys.has(m[1]))return line;
    if(seen.has(m[1]))return ''; // Avoid duplicate env keys.
    seen.add(m[1]);return m[1]+'='+values[m[1]];
  });
  for(const [k,v] of Object.entries(values))if(!seen.has(k))next.push(k+'='+v);
  return next.join('\n').trimEnd()+'\n';
}
const token=await securePrompt('🔒 A-X-HK PRIVATE CHANNEL WORKER SETUP');
if(!/^[a-f0-9]{64}$/i.test(token)){console.error('Invalid token. Copy WORKER_TOKEN (64 hexadecimal characters) from Vercel project environment settings.');process.exitCode=1;}
else {
  const workerApi='https://axhk-channel-link-hub.vercel.app/api/index';
  try {
    const response=await fetch(workerApi+'?mode=worker&action=verify',{
      headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)
    });
    const verified=await response.json().catch(()=>({}));
    if(response.status!==200||verified?.workerAuthenticated!==true)
      throw new Error('The token does not match the live Vercel worker authentication (HTTP '+response.status+'). No local settings changed.');
    console.log('✅ Vercel worker token verified without claiming or posting links.');
  } catch(err) {
    console.error('Token verification failed:',err.message);
    process.exit(1);
  }
  const data=await fs.readFile(envFile,'utf8').catch(err=>err.code==='ENOENT'?'':Promise.reject(err));
  const output=updateEnv(data,{
    CHANNEL_HUB_API_URL:'https://axhk-channel-link-hub.vercel.app/api/index',
    CHANNEL_HUB_INVITE_CODE:'0029VbA4HK9LNSaApTeufD1F',
    CHANNEL_HUB_CHANNEL_JID:'', // Always resolve the actual owned Channel from the invite, not an old numeric override.
    CHANNEL_HUB_WORKER_TOKEN:token,
    CHANNEL_HUB_ENABLED:'true',
    BOT_PREFIX:'.',
    AXHK_TERMUX_MODE:'1'
  });
  const temp=envFile+'.tmp';
  await fs.writeFile(temp,output,{mode:0o600});
  await fs.chmod(temp,0o600);
  await fs.rename(temp,envFile);
  console.log('✅ A-X-HK worker configured locally. Secret was NOT printed.');
  console.log('✅ Existing session and other .env settings preserved.');
  console.log('✅ Posting remains blocked until .channelmenu publish succeeds and the authenticated bot sends a verified heartbeat.');
  console.log('Restart the bot with: AXHK_TERMUX_MODE=1 BOT_PREFIX=. MULTI_PAIR_ENABLED=false npm start');
}
