(()=>{
 const $=id=>document.getElementById(id);
 const KEY='axhk_public_session_id',TOKEN='axhk_public_session_token';
 let id=localStorage.getItem(KEY)||'',token=localStorage.getItem(TOKEN)||'',isBusy=false,stateBusy=false,qrBusy=false,connected=false,available=false;
 const setText=(k,v)=>{$(k).textContent=String(v??'')};
 const show=(k,on)=>$(k).classList.toggle('hidden',!on);
 function message(msg,where='manageError'){setText(where,msg||'')}
 async function proxy(path,method='GET',data={}){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),29000);
  try{
   const r=await fetch('/api/proxy',{method:'POST',headers:{'content-type':'application/json',...(token?{'x-session-token':token}:{})},body:JSON.stringify({path,method,data}),signal:controller.signal,cache:'no-store'});
   const d=await r.json().catch(()=>({}));
   if(!r.ok)throw Error(d.error||'Secure service request failed');
   return d;
  }finally{clearTimeout(timer)}
 }
 async function checkStatus(){
  try{
   const r=await fetch('/api/status',{cache:'no-store'});
   const state=await r.json();
   if(!r.ok)throw Error(state.error||'Unavailable');
   const on=!!state.online,enabled=!!state.enabled;
   available=on&&enabled;
   $('statusDot').className='pulse '+(on&&enabled?'ok':'paused');
   setText('statusLabel',enabled?(on?'BOT NETWORK ONLINE':'BOT NETWORK OFFLINE'):'PAIRING PAUSED');
   show('loadingPane',false);show('lockPane',!enabled);show('offlinePane',enabled&&!on);
   show('createPane',available&&!id);show('managePane',available&&!!id);
   if(!enabled){setText('lockMessage',state.message||'Pairing is temporarily disabled by the owner.');}
   if(available&&id&&!stateBusy){await readState();}
  }catch(e){
   available=false;show('loadingPane',false);show('lockPane',false);show('createPane',false);show('managePane',false);show('offlinePane',true);
   $('statusDot').className='pulse paused';setText('statusLabel','SERVICE UNAVAILABLE');
  }
 }
 function clearSession(){localStorage.removeItem(KEY);localStorage.removeItem(TOKEN);id='';token='';connected=false;}
 $('createForm').onsubmit=async e=>{
  e.preventDefault();if(isBusy||!available)return;
  const phone=$('phone').value.replace(/\D/g,''),label=$('nickname').value.trim().slice(0,50),accessCode=$('accessCode').value.trim();
  if(phone.length<8||phone.length>15)return message('Enter a valid WhatsApp number with country code.','createError');
  isBusy=true;$('createBtn').disabled=true;message('Creating your secure session…','createError');
  try{
   const result=await proxy('/api/multi/create','POST',{phone,label,accessCode});
   if(!result?.id||!result?.token)throw Error('Session key was not received. Please retry.');
   id=result.id;token=result.token;localStorage.setItem(KEY,id);localStorage.setItem(TOKEN,token);
   setText('sessionTitle',label||'Your A-X-HK session');
   message('','createError');show('createPane',false);show('managePane',true);await readState();
  }catch(err){message(err.message,'createError')}
  finally{isBusy=false;$('createBtn').disabled=false}
 };
 async function readState(){
  if(!available||!id||!token||stateBusy)return;
  stateBusy=true;
  try{
   const d=await proxy('/api/multi/'+encodeURIComponent(id)+'/state');
   connected=!!d.connected;
   setText('sessionStatus',connected?'ONLINE':String(d.status||'CONNECTING').toUpperCase());
   setText('detailStatus',connected?'CONNECTED':String(d.status||'STARTING').toUpperCase());
   setText('detailId',id);setText('detailPrefix',d.prefix||'.');setText('detailMode',d.mode||'public');
   setText('sessionTitle',d.label||'Your A-X-HK session');
   $('botMode').value=['public','private'].includes(d.mode)?d.mode:'public';
   $('botPrefix').value=d.prefix||'.';
   show('connectedMessage',connected);show('pairActions',!connected);show('refreshQr',!connected);
   if(connected){setText('qrBox','✓ CONNECTED');}
   else if(d.hasQr&&!$('qrBox').querySelector('img')&&!qrBusy)await fetchQr();
   message('');
  }catch(e){
   message(e.message);
   if(/invalid session management key/i.test(e.message)){clearSession();show('managePane',false);show('createPane',true)}
  }finally{stateBusy=false}
 }
 async function fetchQr(){
  if(qrBusy||!id||!token||connected||!available)return;
  qrBusy=true;
  try{
   const d=await proxy('/api/multi/'+encodeURIComponent(id)+'/qr');
   if(!/^data:image\/png;base64,[a-z0-9+/=]+$/i.test(String(d.dataUrl||'')))throw Error('QR not ready');
   const img=new Image();img.src=d.dataUrl;img.alt='Private WhatsApp device pairing QR';
   $('qrBox').replaceChildren(img);
  }catch(e){setText('qrBox',e.message==='QR not ready'?'Generating QR…':e.message)}
  finally{qrBusy=false}
 }
 $('refreshQr').onclick=()=>fetchQr();
 $('pairBtn').onclick=async()=>{
  if(!available||connected)return;
  const phone=$('phone').value.replace(/\D/g,'')||prompt('WhatsApp number including country code');
  if(!phone||phone.replace(/\D/g,'').length<8)return;
  $('pairBtn').disabled=true;message('Generating device code…');
  try{
   const d=await proxy('/api/multi/'+encodeURIComponent(id)+'/pair','POST',{phone:phone.replace(/\D/g,'')});
   setText('pairCode',d.formattedCode||d.code||'Unavailable');message('');
  }catch(e){message(e.message)}finally{$('pairBtn').disabled=false}
 };
 $('saveSettings').onclick=async()=>{
  if(!available)return;
  $('saveSettings').disabled=true;message('Saving your bot settings…');
  try{
   await proxy('/api/multi/'+encodeURIComponent(id)+'/settings','POST',{mode:$('botMode').value,prefix:$('botPrefix').value});
   message('✓ Your bot settings were saved.');await readState();
  }catch(e){message(e.message)}finally{$('saveSettings').disabled=false}
 };
 $('forgetBrowser').onclick=()=>{
  if(!confirm('Forget this browser key? The WhatsApp bot will remain linked, but you will lose access to its session controls on this browser.'))return;
  clearSession();location.reload();
 };
 $('lockRefresh').onclick=()=>checkStatus();
 $('offlineRefresh').onclick=()=>checkStatus();
 checkStatus();
 setInterval(()=>{checkStatus()},30000);
 setInterval(()=>{if(available&&id&&!stateBusy)readState()},18000);
})();