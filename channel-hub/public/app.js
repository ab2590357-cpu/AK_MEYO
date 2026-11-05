const form=document.querySelector('#submitForm');
const message=document.querySelector('#message');
const button=document.querySelector('#send');
const label=document.querySelector('#buttonLabel');
const view=document.querySelector('#submitted');
const statusEl=document.querySelector('#postingStatus');
const countdown=document.querySelector('#countdown');
const api=mode=>'/api/index?mode='+encodeURIComponent(mode);
const statuses={pending:'Queued — publishing shortly',processing:'Publishing now…',posted:'Published on WhatsApp Channel ✓',failed:'Could not publish — owner review',needs_review:'Needs owner review',rejected:'Rejected'};
let last=null,pollHandle=null,clockHandle=null,serviceReady=false,busy=false;
function msg(text,ok=false){message.textContent=text;message.classList.toggle('ok',ok)}
function refreshButton(){
  if(last)return;
  button.disabled=busy||!serviceReady;
  label.textContent=busy?'Sending…':serviceReady?'Submit & auto-publish link':'Bot offline — submissions paused';
}
async function refreshAvailability(){
  if(last)return;
  try{
    const response=await fetch(api('health'),{cache:'no-store'});
    const data=await response.json();
    serviceReady=Boolean(response.ok&&data.ready===true&&data.workerReady===true);
    if(!busy)msg(serviceReady?
      '✓ Auto-publishing is online. Send your link once; our bot publishes it to the Channel automatically.':
      'The publishing bot is currently offline. Submissions will reopen when it reconnects.',serviceReady);
  }catch{
    serviceReady=false;
    if(!busy)msg('Cannot reach the publishing service. Please try again shortly.');
  }
  refreshButton();
}
function renderCountdown(){
  if(!last)return;
  const ms=Math.max(0,Date.parse(last.nextAllowedAt)-Date.now());
  const h=Math.floor(ms/3600000),m=Math.floor(ms%3600000/60000),s=Math.floor(ms%60000/1000);
  countdown.textContent=ms?(h+'h '+m+'m '+s+'s'):'Available now';
}
async function poll(){
  if(!last)return;
  try{
    const response=await fetch(api('status')+'&id='+encodeURIComponent(last.id)+'&receipt='+encodeURIComponent(last.receipt),{cache:'no-store'});
    const data=await response.json();
    if(response.ok){
      statusEl.textContent=statuses[data.status]||data.status;
      if(['posted','failed','rejected','needs_review'].includes(data.status)){
        clearInterval(pollHandle);pollHandle=null;
      }
    }
  }catch{}
}
function showSubmission(){
  form.classList.add('hidden');view.classList.remove('hidden');
  renderCountdown();poll();
  clearInterval(pollHandle);clearInterval(clockHandle);
  pollHandle=setInterval(poll,3000);
  clockHandle=setInterval(renderCountdown,1000);
}
form?.addEventListener('submit',async event=>{
  event.preventDefault();
  if(!serviceReady||busy){msg('The Channel bot is offline. Please check again when it reconnects.');return;}
  const link=document.querySelector('#link').value.trim();
  if(!/^https:\/\/(?:chat\.whatsapp\.com\/[A-Za-z0-9]{15,40}|(?:www\.)?whatsapp\.com\/channel\/[A-Za-z0-9]{8,80})\/?(?:\?.*)?$/i.test(link)){
    msg('Please enter a valid WhatsApp Group or Channel invite link.');return;
  }
  busy=true;refreshButton();msg('');
  try{
    const response=await fetch(api('submit'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({link,website:document.querySelector('#website').value})});
    const data=await response.json();
    if(!response.ok)throw Error(data.error||'Submission failed');
    last={id:data.id,receipt:data.receipt,nextAllowedAt:data.nextAllowedAt};
    showSubmission();
  }catch(error){msg(error.message||'Could not submit. Please try again shortly.')}
  finally{busy=false;refreshButton()}
});
document.querySelector('#resetView')?.addEventListener('click',()=>{
  form.classList.remove('hidden');view.classList.add('hidden');
  msg('Your previous submission still has a 24-hour cooldown. Submit again only when eligible.');
  last=null;
  refreshAvailability();
});
refreshAvailability();
setInterval(refreshAvailability,8000);
