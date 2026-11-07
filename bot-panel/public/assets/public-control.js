(()=>{
 const ready=()=>document.querySelector('main');
 function init(){
  const main=ready();if(!main)return;
  const section=document.createElement('section');
  section.className='section';
  section.style.cssText='padding-top:28px;padding-bottom:20px';
  section.innerHTML='<div class="shell"><div class="card" style="padding:clamp(22px,4vw,38px);border:1px solid rgba(83,237,167,.25);background:linear-gradient(135deg,#071d17,#07110e 70%);border-radius:20px"><div class="sectionhead"><div><div class="badge">OWNER ACCESS CONTROL</div><h2 style="margin:16px 0 8px">Public Pairing Center</h2><p style="max-width:630px">Open or temporarily close new WhatsApp pairings without taking your website offline. Existing linked sessions stay untouched.</p></div><span class="pill" id="public-pair-pill">Checking…</span></div><div class="grid"><div class="half"><div class="field"><label for="public-pair-message">Message visitors see when pairing is locked</label><textarea class="input" id="public-pair-message" maxlength="240" rows="3" style="min-height:95px;resize:vertical"></textarea></div><div class="actions"><button class="btn primary" type="button" id="public-pair-open">Unlock Public Pairing</button><button class="btn ghost" type="button" id="public-pair-close">Lock Public Pairing</button></div><div class="tiny muted" id="public-pair-result" aria-live="polite" style="margin-top:12px"></div></div><div class="half"><div class="card soft" style="height:100%;border:1px solid #28483a"><h3 style="margin:0 0 14px">Public website</h3><p class="muted">Anyone can open this website. Only this protected Owner Control Center can change whether new pairings are allowed.</p><a class="btn gold" href="https://axhk-user-pairing.vercel.app" target="_blank" rel="noopener noreferrer">Open Public Pairing Website</a><p class="tiny muted" style="margin-top:18px">The owner account and owner WhatsApp session are never shared with public users.</p></div></div></div></div></div>';
  main.prepend(section);
  const pill=document.getElementById('public-pair-pill');
  const msg=document.getElementById('public-pair-message');
  const out=document.getElementById('public-pair-result');
  const open=document.getElementById('public-pair-open');
  const close=document.getElementById('public-pair-close');
  let loading=false;
  function render(d){pill.textContent=d.enabled?'UNLOCKED · PUBLIC':'LOCKED · PRIVATE';pill.style.color=d.enabled?'#34e7a1':'#ffbb9d';msg.value=d.message||'';out.textContent=d.enabled?'New pairing requests are enabled.':'Website stays online, but no new pairing can begin.'}
  async function read(){try{const r=await fetch('/api/cloud/pairing',{cache:'no-store'});const d=await r.json();if(!r.ok)throw Error(d.error||'Could not load');render(d)}catch(e){out.textContent='Pairing control unavailable: '+e.message}}
  async function save(enabled){
   if(loading)return;
   loading=true;open.disabled=close.disabled=true;out.textContent='Saving secure owner setting…';
   try{
    const r=await fetch('/api/cloud/pairing',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({enabled,message:msg.value}),cache:'no-store'});
    const d=await r.json();if(!r.ok)throw Error(d.error||'Update failed');
    render(d);
    out.textContent=enabled?'Public gateway unlocked. Syncing no-invite access with Termux…':'Public gateway locked. Syncing Termux access mode…';
    try{
     const changes=enabled?{publicMultiEnabled:true,inviteOnly:false,allowMode:false}:{publicMultiEnabled:false};
     const local=await fetch('/api/admin/policy',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(changes),cache:'no-store'});
     const result=await local.json().catch(()=>({}));
     if(!local.ok)throw Error(result.error||'Termux owner policy did not acknowledge the change');
     out.textContent=enabled?'✓ Public pairing unlocked. Bot multi-session enabled; invite-only and allow-list disabled.':'✓ Public pairing locked. The website and existing WhatsApp sessions remain online.';
    }catch(err){
     out.textContent=enabled?'Gateway open but Termux pairing mode has not synced: '+err.message+' (retry Unlock after Bridge is online).':'Gateway is locked; Termux update pending: '+err.message;
    }
   }catch(e){out.textContent='Could not save: '+e.message}
   finally{loading=false;open.disabled=close.disabled=false}
  }
  open.onclick=()=>save(true);
  close.onclick=()=>save(false);
  read();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();