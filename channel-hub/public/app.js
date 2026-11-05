const form=document.querySelector('#submitForm');
const message=document.querySelector('#message');
const button=document.querySelector('#send');
const label=document.querySelector('#buttonLabel');
const view=document.querySelector('#submitted');
const statusEl=document.querySelector('#postingStatus');
const countdown=document.querySelector('#countdown');
let last=null, pollHandle=null,clockHandle=null,serviceReady=false;
const api=mode=>'/api/index?mode='+encodeURIComponent(mode);
const statuses={pending:'Pending',processing:'Publishing',posted:'Published ✓',failed:'Failed — review',needs_review:'Needs owner review',rejected:'Rejected'};
function msg(t,ok=false){message.textContent=t;message.classList.toggle('ok',ok)}
function setBusy(v){button.disabled=v||!serviceReady;label.textContent=v?'Submitting...':serviceReady?'Submit my link':'Bot offline — submissions paused'}
async function checkService(){
  if(last) return;
  try{
    const r=await fetch(api('health'),{cache:'no-store'});
    const d=await r.json();
    serviceReady=r.ok&&d.ready===true;
    button.disabled=!serviceReady;
    label.textContent=serviceReady?'Submit my link':'Bot offline — submissions paused';
    if(!serviceReady) msg('Submissions open only when our verified WhatsApp Channel bot is connected. Please check again shortly.');
    else if(message.textContent.startsWith('Submissions open')) msg('');
  }catch{
    serviceReady=false;
    button.disabled=true;label.textContent='Connection unavailable';
    msg('Cannot contact the publishing service right now.');
  }
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
    const r=await fetch(api('status')+'&id='+encodeURIComponent(last.id)+'&receipt='+encodeURIComponent(last.receipt),{cache:'no-store'});
    const data=await r.json();
    if(r.ok){
      statusEl.textContent=statuses[data.status]||data.status;
      if(['posted','failed','rejected','needs_review'].includes(data.status)){clearInterval(pollHandle);pollHandle=null;}
    }
  }catch{}
}
function showSubmission(){
  form.classList.add('hidden');view.classList.remove('hidden');renderCountdown();poll();
  clearInterval(pollHandle);clearInterval(clockHandle);pollHandle=setInterval(poll,10000);clockHandle=setInterval(renderCountdown,1000);
}
form?.addEventListener('submit',async e=>{
  e.preventDefault();
  if(!serviceReady){msg('The Channel bot is currently offline; please try again when it is online.');return;}
  const link=document.querySelector('#link').value.trim();
  if(!/^https:\/\/(?:chat\.whatsapp\.com\/[A-Za-z0-9]{15,40}|(?:www\.)?whatsapp\.com\/channel\/[A-Za-z0-9]{8,80})\/?(?:\?.*)?$/i.test(link)){msg('Please enter a valid WhatsApp group or channel link.');return;}
  setBusy(true);msg('');
  try{
    const r=await fetch(api('submit'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({link,website:document.querySelector('#website').value})});
    const data=await r.json();
    if(!r.ok)throw Error(data.error||'Submission failed');
    last={id:data.id,receipt:data.receipt,nextAllowedAt:data.nextAllowedAt};showSubmission();
  }catch(e){msg(e.message||'Could not submit. Try again later.')}finally{setBusy(false)}
});
document.querySelector('#resetView')?.addEventListener('click',()=>{
  form.classList.remove('hidden');view.classList.add('hidden');msg('Your previous submission is still subject to the 24-hour cooldown.');
});

checkService();
setInterval(checkService, 15000);
