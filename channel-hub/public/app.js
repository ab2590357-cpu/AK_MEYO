/* Public invitation funnel, server-verified publishing receipt and twelve-hour cooldown. */
(()=>{
'use strict';
const byId=id=>document.getElementById(id);
const form=byId('submitForm');if(!form)return;
const message=byId('message'),button=byId('send'),buttonLabel=byId('buttonLabel'),view=byId('submitted');
const statusEl=byId('postingStatus'),countdown=byId('countdown'),visit=byId('visitChannel'),note=byId('channelButtonNote');
const healthEndpoint='/api/index?mode=health';
const statuses={pending:'Queued — publishing shortly',processing:'Publishing now…',posted:'Published on Channel ✓',
 failed:'Publishing failed — owner review',needs_review:'Needs owner review',rejected:'Rejected'};
let last=null,pollTimer=null,countTimer=null,serviceReady=false,busy=false,currentStatus='pending';
const brand=()=>window.AXHK_BRAND||{};
const setMessage=(text,ok=false)=>{message.textContent=text;message.classList.toggle('ok',ok)};
const safeStore=value=>{try{if(value)sessionStorage.setItem('axhk-link-receipt',JSON.stringify(value));else sessionStorage.removeItem('axhk-link-receipt')}catch{}};
function refreshButton(){
 const underCooldown=last&&Date.now()<Date.parse(last.nextAllowedAt);
 button.disabled=busy||!serviceReady||Boolean(underCooldown);
 buttonLabel.textContent=busy?'Submitting your invitation…':!serviceReady?'Bot offline — submissions paused':
 underCooldown?'12-hour cooldown is active':(brand().submitButton||'Submit & auto-publish link');
}
function updateHealth(ok){
 const service=byId('formServiceStatus'),hero=byId('heroServiceStatus'),beacon=byId('heroServiceDot'),panel=document.querySelector('.panel-status');
 if(service)service.textContent=ok?'BOT CONNECTED · READY TO POST':'PUBLISHING SERVICE UNAVAILABLE';
 if(hero)hero.textContent=ok?'Verified bot online':'Awaiting bot connection';
 if(beacon)beacon.classList.toggle('is-live',ok);
 if(panel)panel.classList.toggle('is-live',ok);
}
async function refreshAvailability(){
 try{
  const r=await fetch(healthEndpoint,{cache:'no-store'}),data=await r.json();
  serviceReady=Boolean(r.ok&&data.ready===true&&data.workerReady===true&&data.submissionsOpen===true);
 }catch{serviceReady=false}
 updateHealth(serviceReady);
 if(!last&&!busy)setMessage(serviceReady?'✓ Verified bot online. Submit your invitation to publish automatically.':'The publishing bot is currently offline. You can return when it reconnects.',serviceReady);
 refreshButton();
}
function renderCountdown(){
 if(!last)return;
 const remaining=Math.max(0,new Date(last.nextAllowedAt).getTime()-Date.now());
 if(!Number.isFinite(remaining)){countdown.textContent='12 hours';return}
 const h=Math.floor(remaining/3600000),m=Math.floor(remaining%3600000/60000),s=Math.floor(remaining%60000/1000);
 countdown.textContent=remaining?(h+'h '+String(m).padStart(2,'0')+'m '+String(s).padStart(2,'0')+'s'):'Available now';
 refreshButton();
}
function receiptCopy(state){
 const b=brand(),heading=byId('submissionHeading'),copy=byId('submissionCopy'),symbol=byId('resultSymbol');
 currentStatus=state;
 view.classList.toggle('is-posted',state==='posted');
 const success=state==='posted',failure=['failed','rejected','needs_review'].includes(state);
 heading.textContent=success?(b.postedTitle||'Your link is posted on our Channel!'):
  failure?(b.failedTitle||'This link needs review'):(b.pendingTitle||'Publishing your link…');
 copy.textContent=success?(b.postedText||'Your invitation is now published.'):
  failure?(b.failedText||'A confirmed Channel post is not available. Please contact the owner.'):
  (b.pendingText||'Your link is in the queue. This screen updates automatically.');
 symbol.textContent=success?'✓':failure?'!':'⌁';
 statusEl.textContent=statuses[state]||'Checking posting status…';
 visit.classList.toggle('hidden',!success);
 note.classList.toggle('hidden',!success);
 if(success){byId('visitChannelLabel').textContent=b.channelButton||'Open WhatsApp Channel ↗';note.textContent=b.channelButtonNote||'Open the official Channel to see the latest posts.'}
}
async function poll(){
 if(!last)return;
 try{
  const url='/api/index?mode=status&id='+encodeURIComponent(last.id)+'&receipt='+encodeURIComponent(last.receipt);
  const response=await fetch(url,{cache:'no-store'}),data=await response.json();
  if(!response.ok){statusEl.textContent='Status temporarily unavailable';return}
  const state=Object.hasOwn(statuses,data.status)?data.status:'pending';
  receiptCopy(state);
  if(['posted','failed','rejected','needs_review'].includes(state)){clearInterval(pollTimer);pollTimer=null;}
 }catch{statusEl.textContent='Reconnecting to status service…'}
}
function showSubmission(){
 form.classList.add('hidden');view.classList.remove('hidden');
 receiptCopy(currentStatus);
 if(brand().channelUrl)visit.href=brand().channelUrl;
 renderCountdown();poll();
 if(pollTimer)clearInterval(pollTimer);pollTimer=setInterval(poll,3500);
 if(countTimer)clearInterval(countTimer);countTimer=setInterval(renderCountdown,1000);
}
function showForm(){
 form.classList.remove('hidden');view.classList.add('hidden');
 setMessage(last?'Your previous submission still has a cooldown. Refresh this page to return to its posting status.':'',false);
 refreshButton();
}
byId('resetView')?.addEventListener('click',showForm);
byId('link')?.addEventListener('input',()=>{
 const input=byId('link').value.trim(),tag=byId('linkTypeTag');
 tag.textContent=input.includes('chat.whatsapp.com/')?'GROUP LINK':
  input.includes('whatsapp.com/channel/')?'CHANNEL LINK':'INVITE LINK';
});
form.addEventListener('submit',async event=>{
 event.preventDefault();
 if(busy||!serviceReady){setMessage('The verified Channel bot is offline. Please try when it reconnects.');return}
 if(last&&Date.now()<Date.parse(last.nextAllowedAt)){setMessage('This browser has an active submission cooldown.');return}
 const link=byId('link').value.trim();
 if(!/^https:\/\/(?:chat\.whatsapp\.com\/[A-Za-z0-9]{15,40}|(?:www\.)?whatsapp\.com\/channel\/[A-Za-z0-9]{8,80})\/?(?:\?.*)?$/i.test(link)){
  setMessage('Please paste a valid official WhatsApp Group or Channel invitation URL.');byId('link').focus();return;
 }
 busy=true;refreshButton();setMessage('');
 try{
  const response=await fetch('/api/index?mode=submit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({link,website:byId('website').value})});
  const data=await response.json();
  if(!response.ok)throw Error(data.error||'Could not submit this link.');
  if(!data.id||!data.receipt)throw Error('The service did not return a valid receipt.');
  last={id:data.id,receipt:data.receipt,nextAllowedAt:data.nextAllowedAt};
  currentStatus='pending';safeStore(last);showSubmission();
 }catch(error){setMessage(error.message||'Submission unavailable. Please try again shortly.')}
 finally{busy=false;refreshButton()}
});
window.addEventListener('axhk-brand-changed',()=>{
 if(!last)refreshButton();
 else{receiptCopy(currentStatus);if(brand().channelUrl)visit.href=brand().channelUrl}
});
try{
 const restored=JSON.parse(sessionStorage.getItem('axhk-link-receipt')||'null');
 if(restored&&/^[0-9a-f-]{36}$/i.test(restored.id)&&/^[0-9a-f]{64}$/i.test(restored.receipt)&&Number.isFinite(Date.parse(restored.nextAllowedAt))){
  last=restored;currentStatus='pending';showSubmission();
 }
}catch{}
refreshAvailability();setInterval(refreshAvailability,9000);
})();