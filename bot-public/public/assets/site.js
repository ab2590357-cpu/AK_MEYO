(()=>{
 'use strict';
 const $=id=>document.getElementById(id);
 const ID_KEY='axhk_public_session_id',TOKEN_KEY='axhk_public_session_token',PHONE_KEY='axhk_public_pairing_phone';
 let id=localStorage.getItem(ID_KEY)||'',token=localStorage.getItem(TOKEN_KEY)||'',phone=localStorage.getItem(PHONE_KEY)||'';
 let available=false,pairingAllowed=false,connected=false,createBusy=false,codeBusy=false,qrBusy=false,stateBusy=false,statusBusy=false,qrRequestedAt=0;
 let method='qr',lastStatus=null,lastSessionState=null,closing=false;
 const text=(id,value)=>{const e=$(id);if(e)e.textContent=String(value??'')};
 const show=(id,visible)=>{const e=$(id);if(e)e.classList.toggle('hidden',!visible)};
 const digits=value=>String(value||'').replace(/\D/g,'');
 const path=(suffix)=>'/api/multi/'+encodeURIComponent(id)+'/'+suffix;
 const statusError=e=>String(e?.message||e||'Request failed');
 function error(message,target='manageError'){text(target,message||'');}
 function showPane(pane){for(const k of ['loadingPane','lockPane','offlinePane','createPane','managePane'])show(k,k===pane)}
 const controllerFetch=async(url,options={},ms=29000)=>{
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),ms);
  try{return await fetch(url,{...options,signal:controller.signal,cache:'no-store'})}
  catch(e){if(e?.name==='AbortError')throw Error('Connection timed out. Please check bot availability before retrying.');throw e}
  finally{clearTimeout(timer)}
 };
 async function proxy(route,method='GET',data={}){
  const r=await controllerFetch('/api/proxy',{method:'POST',headers:{'content-type':'application/json',...(token?{'x-session-token':token}:{})},body:JSON.stringify({path:route,method,data})},29000);
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw Error(d.error||'The pairing gateway did not accept the request ('+r.status+').');
  return d;
 }
 function renderMethod(next,{request=false}={}){
  method=next==='code'?'code':'qr';
  $('methodQrLabel').classList.toggle('selected',method==='qr');
  $('methodCodeLabel').classList.toggle('selected',method==='code');
  for(const [name,active] of [['tabQr',method==='qr'],['tabCode',method==='code']]){
   const b=$(name);b.classList.toggle('active',active);b.setAttribute('aria-selected',String(active));
  }
  show('qrMethodPanel',method==='qr');
  show('codeMethodPanel',method==='code');
  if(request&&id&&available&&!connected&&pairingAllowed){
   if(method==='code'&&!lastSessionState?.pairCode)generateCode();
   if(method==='qr')refreshQr();
  }
 }
 document.querySelectorAll('input[name="pairingMethod"]').forEach(input=>input.addEventListener('change',()=>renderMethod(input.value)));
 $('tabQr').addEventListener('click',()=>renderMethod('qr',{request:true}));
 $('tabCode').addEventListener('click',()=>renderMethod('code',{request:true}));
 function renderStatus(st){
  lastStatus=st;
  const on=!!st.online,allowed=!!st.enabled;
  const hostReady=st.hostPairingEnabled!==false;
  available=on&&hostReady;pairingAllowed=allowed&&hostReady;
  $('statusDot').className='pulse '+(on&&allowed&&hostReady?'ok':'paused');
  text('statusLabel',!on?'NETWORK OFFLINE':!allowed?'PAIRING PAUSED':!hostReady?'BOT PAIRING SETUP':'NETWORK ONLINE');
  show('lockPane',!allowed&&!(on&&id));
  show('offlinePane',allowed&&(!on||!hostReady));
  show('loadingPane',false);
  show('createPane',on&&allowed&&hostReady&&!id);
  show('managePane',on&&!!id&&hostReady);
  text('offlinePaneTitle',on&&allowed&&!hostReady?'BOT PAIRING SETUP PENDING':'GATEWAY OFFLINE');
  text('offlinePaneDescription',on&&allowed&&!hostReady?
   'The bot is connected but public multi-session pairing is not enabled yet. Owner setup or a bridge sync is required; please contact owner support.':
   'The owner bridge is temporarily unavailable. Please retry when it reconnects. No WhatsApp account has been unlinked.');
  if(!allowed)text('lockMessage',st.message||'The owner has temporarily paused new pairings.');
  $('pairBtn').disabled=codeBusy||!allowed||!on||connected;
  $('refreshQr').disabled=qrBusy||!allowed||!on||connected;
  if(!allowed&&id&&!connected)error('New linking has been paused by the owner. Your existing session was not deleted.');
  if(on&&id&&!stateBusy&&!createBusy&&!codeBusy)readState();
 }
 async function checkStatus(){
  if(statusBusy)return;
  statusBusy=true;
  try{
   const r=await controllerFetch('/api/status',{method:'GET'},11000);
   const st=await r.json();
   if(!r.ok)throw Error(st.error||'Could not contact pairing network');
   renderStatus(st);
  }catch(e){
   available=false;
   $('statusDot').className='pulse paused';text('statusLabel','SERVICE UNAVAILABLE');
   showPane('offlinePane');
  }finally{statusBusy=false}
 }
 async function createSession(ev){
  ev.preventDefault();if(createBusy||!available||!pairingAllowed)return;
  const inputPhone=digits($('phone').value),label=$('nickname').value.trim().slice(0,50);
  if(inputPhone.length<8||inputPhone.length>15){error('Enter a valid international WhatsApp number, 8 to 15 digits.','createError');$('phone').focus();return}
  if(label.length<2){error('Please enter a session name (at least 2 characters).','createError');$('nickname').focus();return}
  const chosen=document.querySelector('input[name="pairingMethod"]:checked')?.value||'qr';
  createBusy=true;const b=$('createBtn');b.disabled=true;b.innerHTML='CREATING PRIVATE SESSION <span aria-hidden="true">◌</span>';
  error('Connecting to your A-X-HK session…','createError');
  try{
   const d=await proxy('/api/multi/create','POST',{phone:inputPhone,label});
   if(!/^ax_[a-f0-9]{14}$/.test(String(d.id||''))||!String(d.token||''))throw Error('The server did not return a valid private session key.');
   id=d.id;token=d.token;phone=inputPhone;
   localStorage.setItem(ID_KEY,id);localStorage.setItem(TOKEN_KEY,token);localStorage.setItem(PHONE_KEY,phone);
   lastSessionState=null;qrRequestedAt=0;connected=false;
   text('sessionTitle',label.toUpperCase());error('','createError');showPane('managePane');
   renderMethod(chosen);
   text('detailId',id);
   text('sessionStatus','PAIRING READY');
   if(chosen==='code')await generateCode({auto:true});
   else await readState();
  }catch(e){
   const msg=statusError(e);
   if(/access code|owner invite/i.test(msg))error('Public invite-only mode is still enabled on the bot host. Ask the owner to turn off Invite code required in Owner Dashboard → User access control.','createError');
   else if(/timed out|did not respond/i.test(msg))error('The network is slow. The request may still be processing. Please do NOT repeatedly create a session; contact the owner if needed.','createError');
   else error(msg,'createError');
  }finally{createBusy=false;b.disabled=false;b.innerHTML='GENERATE MY SECURE LINK <span aria-hidden="true">↗</span>'}
 }
 $('createForm').addEventListener('submit',createSession);
 async function readState(){
  if(stateBusy||!id||!token||!available)return;
  stateBusy=true;
  try{
   const d=await proxy(path('state'),'GET');
   lastSessionState=d;connected=!!d.connected;
   text('sessionTitle',String(d.label||'YOUR A-X-HK SESSION').toUpperCase());
   text('sessionStatus',connected?'● CONNECTED':String(d.status||'PAIRING').toUpperCase());
   text('detailStatus',connected?'ONLINE':String(d.status||'STARTING').toUpperCase());
   text('detailId',id);text('detailPrefix',d.prefix||'.');text('detailMode',String(d.mode||'public').toUpperCase());
   $('botMode').value=d.mode==='private'?'private':'public';
   $('botPrefix').value=d.prefix||'.';
   show('connectedMessage',connected);show('tabQr',!connected);show('tabCode',!connected);
   $('pairBtn').disabled=connected||!pairingAllowed;$('refreshQr').disabled=connected||!pairingAllowed;
   if(d.pairCode){text('pairCode',d.pairCode);if(method==='code')error('Your phone code is ready. Enter it in WhatsApp → Linked devices.')}
   if(connected){
    $('qrBox').replaceChildren(document.createTextNode('✓ WHATSAPP CONNECTED'));
    error('Connection verified. Your private session is online.');
    return;
   }
   if(method==='qr'){
    if(d.hasQr&&!qrBusy&&!$('qrBox').querySelector('img'))await fetchQr();
    else if(!d.hasQr&&!qrBusy&&!$('qrBox').querySelector('img')){
     text('qrBox','GENERATING PRIVATE QR…');
    }
   }
   if(!d.pairCode)error('');
  }catch(e){
   const msg=statusError(e);
   error(msg);
   if(/invalid session management key|session not found/i.test(msg)){
    clearSession();showPane('createPane');error('Session not found; create a fresh private link.','createError');
   }
  }finally{stateBusy=false}
 }
 async function fetchQr(){
  if(qrBusy||!available||!pairingAllowed||connected||!id||!token)return;
  qrBusy=true;$('refreshQr').disabled=true;qrRequestedAt=Date.now();
  try{
   const d=await proxy(path('qr'),'GET');
   if(!/^data:image\/png;base64,[a-z0-9+/=]+$/i.test(String(d.dataUrl||'')))throw Error('The QR is not ready yet. Please refresh shortly.');
   const image=new Image();image.alt='Secure private WhatsApp pairing QR';image.src=d.dataUrl;
   $('qrBox').replaceChildren(image);
   error('');
  }catch(e){
   const message=statusError(e);
   text('qrBox',/not ready/i.test(message)?'QR IS BEING GENERATED. TRY REFRESHING.':message);
   if(!/not ready/i.test(message))error(message);
  }finally{qrBusy=false;$('refreshQr').disabled=!pairingAllowed||connected}
 }
 async function refreshQr(){
  if(!available||!pairingAllowed)return;
  if(lastSessionState?.hasQr)await fetchQr();
  else await readState();
 }
 $('refreshQr').addEventListener('click',refreshQr);
 async function generateCode({auto=false}={}){
  if(codeBusy||!id||!token||!available||!pairingAllowed||connected)return;
  let n=digits(phone||$('phone').value||localStorage.getItem(PHONE_KEY));
  if(n.length<8||n.length>15){
   n=digits(prompt('Enter the WhatsApp number you want to link, including country code:'));
   if(n.length<8||n.length>15){error('Valid WhatsApp number required for code pairing.');return}
  }
  codeBusy=true;$('pairBtn').disabled=true;
  text('pairCode','GENERATING…');
  error('Generating your private linked-device code…');
  try{
   const d=await proxy(path('pair'),'POST',{phone:n});
   const code=String(d.formattedCode||d.code||'').trim();
   if(!code)throw Error('The server did not return a phone pairing code. Use QR if your device does not support it.');
   text('pairCode',code);error('✓ Pairing code ready. In WhatsApp, open Linked devices → Link a device → Link with phone number instead. Codes usually expire within a short time.');
  }catch(e){
   text('pairCode','— — — —');
   error((auto?'Automatic pairing code could not be generated. ':'')+statusError(e)+'. You can retry or switch to QR code.');
  }finally{codeBusy=false;$('pairBtn').disabled=!pairingAllowed||connected}
 }
 $('pairBtn').addEventListener('click',()=>generateCode());
 $('saveSettings').addEventListener('click',async()=>{
  if(!available||!id||!token)return;
  $('saveSettings').disabled=true;error('Saving your private settings…');
  try{
   await proxy(path('settings'),'POST',{mode:$('botMode').value,prefix:$('botPrefix').value});
   error('✓ Settings saved for your session.');
  }catch(e){error(statusError(e))}
  finally{$('saveSettings').disabled=false}
 });
 function clearSession(){
  localStorage.removeItem(ID_KEY);localStorage.removeItem(TOKEN_KEY);localStorage.removeItem(PHONE_KEY);
  id='';token='';phone='';connected=false;lastSessionState=null;
 }
 $('forgetBrowser').addEventListener('click',()=>{
  if(!confirm('Forget your browser management key? This does NOT unlink the WhatsApp bot, but you may lose access to this session from this browser.'))return;
  clearSession();window.location.reload();
 });
 $('lockRefresh').onclick=checkStatus;
 $('offlineRefresh').onclick=checkStatus;
 function init(){
  if(phone&&!$('phone').value)$('phone').value=phone;
  if(id&&token){showPane('loadingPane');text('sessionTitle','RESTORING YOUR SESSION')}
  renderMethod('qr');checkStatus();
  setInterval(()=>checkStatus(),45000);
  setInterval(()=>{if(available&&id&&!stateBusy&&!codeBusy)readState()},18000);
  const observer=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{
    for(const item of entries)if(item.isIntersecting){item.target.classList.add('in-view');observer.unobserve(item.target)}
  },{threshold:.12}):null;
  document.querySelectorAll('.step-card,.benefit-grid>div,.section-heading,.faq-list details').forEach(el=>{
   if(observer){el.classList.add('reveal');observer.observe(el)}
  });
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();