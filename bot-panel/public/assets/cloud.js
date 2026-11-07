(()=>{
 const banner=document.createElement('aside');banner.className='cloud-bridge-banner';banner.setAttribute('role','status');
 banner.innerHTML='<div class="cloud-title"><span class="cloud-status-dot" id="cloud-dot"></span><span>A-X-HK / REMOTE CONTROL</span></div><span class="cloud-info" id="cloud-connection">Checking secure Termux connection…</span><button type="button" id="cloud-theme">Day / Night</button>';
 document.body.prepend(banner);
 const notice=document.createElement('div');notice.className='cloud-offline-notice';notice.hidden=true;notice.setAttribute('role','status');document.body.append(notice);
 document.querySelectorAll('.nav a[href="/link"],a[href="/link"]').forEach(a=>{a.href='https://axhk-user-pairing.vercel.app';a.title='Public A-X-HK WhatsApp pairing portal';a.target='_blank';a.rel='noopener noreferrer'});
 const theme=localStorage.getItem('axhk_cloud_theme')||'dark';
 document.documentElement.dataset.cloudTheme=theme;
 document.getElementById('cloud-theme').onclick=()=>{
  const next=document.documentElement.dataset.cloudTheme==='light'?'dark':'light';
  document.documentElement.dataset.cloudTheme=next;localStorage.setItem('axhk_cloud_theme',next);
 };
 const set=(online,text)=>{
  document.getElementById('cloud-dot').classList.toggle('online',online);
  document.getElementById('cloud-connection').textContent=text;
  notice.hidden=online;
  if(!online)notice.textContent='Termux is offline or the secure bridge is not configured. Dashboard is reachable, but pairing and live controls require your phone to be online.';
 };
 async function poll(){
  try{
   const r=await fetch('/api/cloud/status',{cache:'no-store'});
   if(r.status===401){location.replace('/owner');return}
   if(!r.ok)throw Error('Cloud status unavailable');
   const j=await r.json();
   const name=j.agent?.linkedName||'Bot';
   set(!!j.online,j.online?('Bridge online • '+name+' • '+String(j.agent?.botStatus||'ready').toUpperCase()):'BRIDGE OFFLINE • Connect your Termux agent');
  }catch{set(false,'Cloud status temporarily unavailable')}
 }
 poll();setInterval(poll,25000);
 document.querySelectorAll('img[src^="/api/"]').forEach(img=>{img.addEventListener('error',()=>{img.src='/assets/brand-card.png'},{once:true})});
})();
