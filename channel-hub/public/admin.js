/* Protected owner console. Tokens remain in the password field, not storage. */
(()=>{
'use strict';
const $=id=>document.getElementById(id);
const config=window.AXHK_BRAND_DEFAULTS||{};
const brandForm=$('brandEditor');
const groups=[
 {id:'identity',label:'Identity & logo',description:'Official name, owner identity, logo and support details.',fields:[
  ['brandName','Brand name','text',45],['brandTagline','Brand tagline','text',50],
  ['logoData','Official logo image','image',160000],
  ['contactNumber','WhatsApp contact number with country code','tel',16],
  ['contactLabel','Floating WhatsApp label','text',65],
  ['channelUrl','Official WhatsApp Channel URL','url',220]
 ]},
 {id:'hero',label:'Header & hero',description:'Navigation links, hero copy, visual image and conversion buttons.',fields:[
  ['headerChannelLabel','Header Channel button','text',45],
  ['headerSubmitLabel','Header submission button','text',45],
  ['navHowLabel','Header How it works link','text',45],['navCommunityLabel','Header Community link','text',45],
  ['visualTopLabel','Hero visual network label','text',65],
  ['eyebrow','Hero eyebrow','text',100],
  ['heroBadge','Hero network badge','text',100],
  ['heroTitle','Hero heading — line one','text',100],
  ['heroHighlight','Hero highlighted line','text',100],
  ['heroDescription','Hero description','textarea',450],
  ['visualCardTitle','Hero visual card heading','text',65],['visualCardText','Hero visual card description','text',65],
  ['heroPrimaryLabel','Hero primary button','text',65],
  ['heroSecondaryLabel','Hero secondary button','text',65],
  ['heroImageData','Hero feature image','image',240000],
  ['trustOne','First trust item','text',95],['trustTwo','Second trust item','text',95],['trustThree','Third trust item','text',95]
 ]},
 {id:'submission',label:'Submission form',description:'Form heading, helper content and primary submission button.',fields:[
  ['sectionHeadingTitle','Submission section heading','text',90],
  ['sectionHeadingHighlight','Section highlighted text','text',90],
  ['sectionHeadingDescription','Section introduction','textarea',250],
  ['submitTitle','Submission heading','text',80],
  ['submitDescription','Form description','textarea',260],
  ['submitButton','Submit button text','text',80],
  ['formFieldLabel','Invitation field label','text',95],['formPlaceholder','Invitation placeholder','text',120],
  ['formHelper','Link form helper','textarea',230],
  ['formFooterLeft','Form bottom label (left)','text',70],
  ['formFooterRight','Form bottom label (right)','text',70]
 ]},
 {id:'receipt',label:'After submission',description:'Customize every receipt state. The Channel CTA appears only after a verified post.',fields:[
  ['acceptedTitle','Accepted heading','text',100],
  ['acceptedText','Accepted description','textarea',260],
  ['pendingTitle','Pending heading','text',100],
  ['pendingText','Pending description','textarea',250],
  ['postedTitle','Published heading','text',100],
  ['postedText','Published description','textarea',260],
  ['failedTitle','Needs review heading','text',100],
  ['failedText','Needs review description','textarea',270],
  ['channelButton','Confirmed Channel button','text',85],
  ['channelButtonNote','Confirmed Channel helper','textarea',190]
 ]},
 {id:'steps',label:'Process & fairness',description:'Three steps and public cooldown guidance.',fields:[
  ['howTitle','Process section title','text',110],
  ['howDescription','Process introduction','textarea',250],
  ['step1Title','Step one heading','text',85],['step1Description','Step one description','textarea',190],
  ['step2Title','Step two heading','text',85],['step2Description','Step two description','textarea',190],
  ['step3Title','Step three heading','text',85],['step3Description','Step three description','textarea',190],
  ['cooldownTitle','Cooldown card title','text',95],
  ['cooldownText','Cooldown card description','textarea',260],
  ['communityEyebrow','Community eyebrow','text',90],
  ['communityTitle','Community heading','text',100],
  ['communityHighlight','Community highlighted text','text',100],
  ['communityDescription','Community description','textarea',240],
  ['communityButton','Community Channel button','text',80]
 ]},
 {id:'footer',label:'Founder & footer',description:'Founder section, contact call to action and footer copy.',fields:[
  ['founderEyebrow','Founder eyebrow','text',65],
  ['founderName','Founder name','text',90],
  ['founderDescription','Founder description','textarea',260],
  ['founderButton','Founder contact button','text',65],
  ['footerDescription','Footer brand description','textarea',320],
  ['footerCopyright','Footer copyright','text',140],
  ['footerNote','Footer operational note','textarea',250],
  ['footerExploreTitle','Footer Explore heading','text',50],['footerConnectTitle','Footer Connect heading','text',50],
  ['footerHomeLabel','Footer Home link','text',60],['footerSubmitLabel','Footer Submit link','text',60],
  ['footerHowLabel','Footer How it works link','text',60],['footerChannelLabel','Footer Channel link','text',70],
  ['footerSupportLabel','Footer Support link','text',70],['footerStudioLabel','Footer Studio link','text',70]
 ]},
 {id:'appearance',label:'Theme & motion',description:'Editable dark and light palettes, default mode, font, corners and animation.',fields:[
  ['accentColor','Accent color','color',0],
  ['backgroundColor','Dark background','color',0],
  ['surfaceColor','Dark cards','color',0],
  ['darkTextColor','Dark text color','color',0],
  ['lightBackgroundColor','Light background','color',0],
  ['lightSurfaceColor','Light cards','color',0],
  ['lightTextColor','Light text color','color',0],
  ['defaultTheme','Default theme','select',0,[['dark','Dark'],['light','Light'],['system','Follow device']]],
  ['fontFamily','Typography','select',0,[['manrope','Manrope + DM Sans'],['inter','Inter'],['spacegrotesk','Space Grotesk']]],
  ['radiusStyle','Corner style','select',0,[['rounded','Rounded'],['soft','Soft'],['sharp','Sharp']]],
  ['motionLevel','Animation intensity','select',0,[['enhanced','Enhanced'],['balanced','Balanced'],['off','No motion']]],
  ['allowThemeToggle','Let visitors switch themes','checkbox',0],
  ['siteWidth','Page content width','select',0,[['standard','Standard · 1280px'],['wide','Wide · 1480px'],['full','Full · 1680px']]],
  ['heroScale','Hero heading scale','select',0,[['regular','Balanced'],['large','Large'],['statement','Statement']]],
  ['sectionDensity','Section vertical spacing','select',0,[['compact','Compact'],['comfortable','Comfortable'],['cinematic','Cinematic']]],
  ['ambientEffects','Ambient background glow','checkbox',0],
  ['showHeroVisual','Display hero artwork','checkbox',0],
  ['showCommunity','Display Community section','checkbox',0],
  ['showFounder','Display Founder section','checkbox',0],
  ['showContactWidget','Display floating WhatsApp button','checkbox',0]
 ]}
];
const maxColor=s=>/^#[0-9a-f]{6}$/i.test(s||'')?s:'#a8ffbf';
let activeBrand=null,queue=[],activeTab='identity';
const api=(method,body,action)=>{
 const token=$('token').value.trim();if(!token)throw Error('Enter your private Admin Token first.');
 const qs='/api/index?mode=admin'+(action?'&action='+encodeURIComponent(action):'');
 return fetch(qs,{method,cache:'no-store',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)})
  .then(async response=>{const result=await response.json().catch(()=>({}));if(!response.ok)throw Error(result.error||'Request failed: HTTP '+response.status);return result;});
};
const status=(el,text,ok=false)=>{el.textContent=text;el.classList.toggle('ok',ok);};
const mk=(tag,className,text)=>{const el=document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=text;return el};
const allGroups=new Map();
function imageField(key,title,max){
 const wrap=mk('div','editor-field editor-field-image is-wide');
 const label=mk('label','field-label',title);label.htmlFor=key+'File';
 const controls=mk('div','image-editor');
 const preview=mk('img','image-editor-preview');preview.id=key+'Preview';preview.src='/axhk-logo.webp';preview.alt=title+' preview';preview.width=85;preview.height=85;
 const right=mk('div','image-editor-controls');
 const choose=mk('label','button-secondary','Choose '+(key==='logoData'?'logo':'hero image'));choose.htmlFor=key+'File';
 const input=document.createElement('input');input.type='file';input.id=key+'File';input.accept='image/png,image/jpeg,image/webp';input.hidden=true;
 const reset=mk('button','button-secondary','Restore default');reset.type='button';
 const note=mk('small','','JPG, PNG or WebP. Images are optimized before saving.');
 right.append(choose,input,reset,note);controls.append(preview,right);wrap.append(label,controls);
 input.addEventListener('change',async()=>{
  const file=input.files?.[0];if(!file)return;
  if(!activeBrand){status($('brandStatus'),'Load your existing settings before uploading.',false);return}
  if(!/^image\/(?:jpeg|png|webp)$/.test(file.type)||file.size>8*1024*1024){
   status($('brandStatus'),'Use a JPG, PNG or WebP image under 8 MB.',false);input.value='';return;
  }
  try{
   status($('brandStatus'),'Optimizing your image locally…');
   const output=await compress(file,max,key==='logoData'?440:1600,key==='logoData'?440:1000);
   activeBrand[key]=output;preview.src=output;renderPreview();
   status($('brandStatus'),'Image is ready. Click Save website design to publish it.',true);
  }catch(err){status($('brandStatus'),err.message||'Could not optimize image.');}
  input.value='';
 });
 reset.addEventListener('click',()=>{
  if(!activeBrand){status($('brandStatus'),'Load your settings first.');return}
  activeBrand[key]='';preview.src=key==='logoData'?'/axhk-logo.webp':(activeBrand.logoData||'/axhk-logo.webp');renderPreview();
  status($('brandStatus'),'Default image selected. Save to apply.',true);
 });
 return wrap;
}
async function compress(file,limit,maxW,maxH){
 const objectUrl=URL.createObjectURL(file),image=new Image();
 try{
  await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error('Invalid or unsupported image file'));image.src=objectUrl;});
  const factor=Math.min(1,maxW/image.naturalWidth,maxH/image.naturalHeight);
  if(!Number.isFinite(factor)||factor<=0)throw Error('Invalid image size');
  for(const scale of [1,.85,.7,.55]){
   const canvas=document.createElement('canvas');
   canvas.width=Math.max(1,Math.round(image.naturalWidth*factor*scale));
   canvas.height=Math.max(1,Math.round(image.naturalHeight*factor*scale));
   canvas.getContext('2d',{alpha:false}).drawImage(image,0,0,canvas.width,canvas.height);
   for(const quality of [.85,.72,.6,.48]){
    for(const mime of ['image/webp','image/jpeg']){
     const data=canvas.toDataURL(mime,quality);
     if(data.length<=limit&&data.startsWith('data:image/'))return data;
    }
   }
  }
  throw Error('Image remains too large. Choose a smaller file or reduce dimensions.');
 }finally{URL.revokeObjectURL(objectUrl);}
}
function createInput([key,title,type,max,options]){
 if(type==='image')return imageField(key,title,max);
 const wrap=mk('label','editor-field'+(type==='textarea'?' is-wide':''));
 if(type==='checkbox'){wrap.classList.add('checkbox-field');const input=document.createElement('input');input.type='checkbox';input.name=key;input.id='field-'+key;wrap.append(input,mk('span','',title));return wrap}
 wrap.append(mk('span','field-label',title));
 let el;
 if(type==='textarea'){el=document.createElement('textarea');el.rows=3}
 else if(type==='select'){el=document.createElement('select');for(const [value,label] of options){const option=mk('option','',label);option.value=value;el.append(option)}}
 else{el=document.createElement('input');el.type=type==='tel'?'text':type; if(type==='tel')el.inputMode='numeric';if(type==='color')el.className='editor-color';}
 el.name=key;el.id='field-'+key;if(max)el.maxLength=max;
 if(type==='color')el.value=config[key]||'#a8ffbf';
 if(type==='url')el.placeholder='https://whatsapp.com/channel/...';
 wrap.append(el);return wrap;
}
function buildEditor(){
 for(const g of groups){
  const tab=mk('button','studio-tab',g.label);tab.type='button';tab.id='tab-'+g.id;tab.setAttribute('role','tab');tab.setAttribute('aria-controls','section-'+g.id);
  tab.addEventListener('click',()=>activateTab(g.id));
  $('editorTabs').append(tab);
  const panel=mk('section','editor-section');panel.id='section-'+g.id;panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',tab.id);
  panel.append(mk('h3','',g.label),mk('p','editor-description',g.description));
  const grid=mk('div','editor-grid');for(const f of g.fields)grid.append(createInput(f));
  panel.append(grid);$('brandFields').append(panel);allGroups.set(g.id,{tab,panel});
 }
 activateTab('identity');
}
function activateTab(id){
 activeTab=id;
 for(const [key,v] of allGroups){
  const active=key===id;v.tab.classList.toggle('is-active',active);v.tab.setAttribute('aria-selected',String(active));v.tab.tabIndex=active?0:-1;v.panel.hidden=!active;
 }
}
$('editorTabs').addEventListener('keydown',event=>{
 if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
 const ids=groups.map(g=>g.id),current=ids.indexOf(activeTab);
 let i=event.key==='Home'?0:event.key==='End'?ids.length-1:
  (current+(event.key==='ArrowLeft'?-1:1)+ids.length)%ids.length;
 activateTab(ids[i]);allGroups.get(ids[i]).tab.focus();event.preventDefault();
});
function editorValue(){
 const b={...activeBrand};
 for(const group of groups)for(const [key,,type] of group.fields){
  if(type==='image')continue;
  const el=brandForm.elements.namedItem(key);if(!el)continue;
  b[key]=type==='checkbox'?Boolean(el.checked):el.value;
 }
 return b;
}
function renderPreview(){
 const b=activeBrand?editorValue():(window.AXHK_BRAND||config);
 const preview=$('brandLivePreview');
 const light=b.defaultTheme==='light'||(b.defaultTheme==='system'&&matchMedia('(prefers-color-scheme: light)').matches);
 preview.dataset.previewTheme=light?'light':'dark';
 preview.style.setProperty('--preview-accent',maxColor(b.accentColor));
 preview.style.setProperty('--preview-bg',maxColor(light?b.lightBackgroundColor:b.backgroundColor));
 preview.style.setProperty('--preview-surface',maxColor(light?b.lightSurfaceColor:b.surfaceColor));
 preview.style.setProperty('--preview-text',light?maxColor(b.lightTextColor):'#f5fff7');
 const font={manrope:"'Manrope',sans-serif",inter:"'Inter',sans-serif",spacegrotesk:"'Space Grotesk',sans-serif"};
 preview.style.setProperty('--preview-font',font[b.fontFamily]||font.manrope);
 preview.dataset.previewRadius=b.radiusStyle||'rounded';
  preview.dataset.previewScale=b.heroScale||'regular';
  preview.dataset.previewDensity=b.sectionDensity||'comfortable';
  preview.style.setProperty('--preview-glow',b.ambientEffects===false?'0':'.15');
 $('previewName').textContent=b.brandName||'A-X-HK';
 $('previewTagline').textContent=b.brandTagline||'OFFICIAL NETWORK';
 $('previewHeading').textContent=b.heroTitle||'Share your community.';
 $('previewHighlight').textContent=b.heroHighlight||'Grow together.';
 $('previewDescription').textContent=b.heroDescription||'Discover the A-X-HK community.';
 $('previewCTA').textContent=(b.heroPrimaryLabel||'Submit your link')+' ↗';
 $('previewLogo').src=b.logoData||'/axhk-logo.webp';
 preview.style.backgroundImage=b.heroImageData?'linear-gradient(120deg, var(--preview-bg), transparent),url("'+b.heroImageData+'")':'';
}
function fillEditor(saved){
 activeBrand={...config,...saved};
 for(const g of groups)for(const [key,,type] of g.fields){
  if(type==='image')continue;
  const el=brandForm.elements.namedItem(key);if(!el)continue;
  if(type==='checkbox')el.checked=Boolean(activeBrand[key]);
  else if(typeof activeBrand[key]==='string')el.value=activeBrand[key];
 }
 $('logoDataPreview').src=activeBrand.logoData||'/axhk-logo.webp';
 $('heroImageDataPreview').src=activeBrand.heroImageData||activeBrand.logoData||'/axhk-logo.webp';
 $('brandSave').disabled=false;renderPreview();
 status($('brandStatus'),'Settings loaded. Customize any section and Save when ready.',true);
}
async function loadBrand(){
 try{status($('brandStatus'),'Loading saved brand settings…');const data=await api('GET',undefined,'brand');if(!data.branding)throw Error('Brand settings unavailable');fillEditor(data.branding);}
 catch(err){status($('brandStatus'),err.message);}
}
$('brandLoad').addEventListener('click',loadBrand);
brandForm.addEventListener('input',()=>{if(activeBrand)renderPreview()});
brandForm.addEventListener('change',()=>{if(activeBrand)renderPreview()});
brandForm.addEventListener('submit',async event=>{
 event.preventDefault();if(!activeBrand){status($('brandStatus'),'Load settings first.');return;}
 const button=$('brandSave');button.disabled=true;status($('brandStatus'),'Saving permanently to Supabase…');
 try{
  const saved=await api('POST',{action:'saveBrand',branding:editorValue()});
  if(saved.ok!==true||!saved.branding)throw Error('Brand save could not be verified');
  fillEditor(saved.branding);status($('brandStatus'),'✓ Website branding saved. Open the public site to view your changes.',true);
 }catch(err){status($('brandStatus'),err.message||'Brand save failed.');}
 finally{button.disabled=false;}
});
function renderQueue(){
 const filter=$('filterStatus').value;const tbody=$('rows');tbody.replaceChildren();
 const rows=queue.filter(x=>filter==='all'||x.status===filter);
 if(!rows.length){const tr=mk('tr'),td=mk('td','','No submissions match this filter.');td.colSpan=4;tr.append(td);tbody.append(tr);return}
 for(const item of rows){
  const tr=mk('tr');
  const date=mk('td','',Number.isFinite(Date.parse(item.created_at))?new Date(item.created_at).toLocaleString():'—');tr.append(date);
  const td=mk('td');const link=String(item.link||'');
  if(/^https:\/\/(?:chat\.whatsapp\.com\/|(?:www\.)?whatsapp\.com\/channel\/)/.test(link)){
   const a=mk('a','queue-link',link);a.href=link;a.target='_blank';a.rel='noopener noreferrer';td.append(a)
  }else td.textContent='Invalid link';
  tr.append(td);
  const statusTd=mk('td'),pill=mk('span','queue-status state-'+String(item.status||'unknown'),String(item.status||'unknown').replaceAll('_',' '));statusTd.append(pill);tr.append(statusTd);
  const actions=mk('td','queue-actions');
  if(item.status==='failed'){
   const retry=mk('button','button-secondary','Retry');retry.type='button';
   retry.addEventListener('click',async()=>{
    if(!confirm('Check your Channel FIRST. Retry only if this invitation definitely was not posted. Continue?'))return;
    try{await api('POST',{action:'retry',id:item.id});await loadQueue();}
    catch(err){status($('note'),err.message);}
   });actions.append(retry);
  }
  if(['pending','failed','needs_review'].includes(item.status)){
   const reject=mk('button','button-secondary','Reject');reject.type='button';
   reject.addEventListener('click',async()=>{
    if(!confirm('Reject this submission?'))return;
    try{await api('POST',{action:'reject',id:item.id});await loadQueue();}
    catch(err){status($('note'),err.message);}
   });actions.append(reject);
  }
  if(!actions.childNodes.length)actions.textContent='—';
  tr.append(actions);tbody.append(tr);
 }
}
function metrics(){
 const count=(fn)=>queue.filter(fn).length;
 $('countAll').textContent=String(queue.length);
 $('countPosted').textContent=String(count(x=>x.status==='posted'));
 $('countPending').textContent=String(count(x=>x.status==='pending'||x.status==='processing'));
 $('countReview').textContent=String(count(x=>['failed','needs_review','rejected'].includes(x.status)));
}
async function loadQueue(){
 const data=await api('GET');queue=Array.isArray(data.submissions)?data.submissions:[];
 renderQueue();metrics();$('authState').textContent='Verified owner';$('authState').classList.add('is-active');
 status($('note'),'✓ '+queue.length+' recent submissions loaded.',true);
}
$('filterStatus').addEventListener('change',renderQueue);
$('refreshQueue').addEventListener('click',()=>loadQueue().catch(e=>status($('note'),e.message)));
$('load').addEventListener('click',async()=>{
 $('load').disabled=true;status($('note'),'Authenticating owner and loading data…');
 try{await loadQueue();await loadBrand();}
 catch(err){status($('note'),err.message);$('authState').textContent='Access unavailable';$('authState').classList.remove('is-active');}
 finally{$('load').disabled=false;}
});
$('ownerSubmit').addEventListener('submit',async event=>{
 event.preventDefault();const button=$('ownerButton');button.disabled=true;status($('ownerStatus'),'Sending link to verified bot queue…');
 try{
  const link=$('ownerLink').value.trim();
  if(!/^https:\/\/(?:chat\.whatsapp\.com\/[A-Za-z0-9]{15,40}|(?:www\.)?whatsapp\.com\/channel\/[A-Za-z0-9]{8,80})\/?(?:\?.*)?$/i.test(link))throw Error('Enter a valid official WhatsApp invitation.');
  const result=await api('POST',{action:'submit',link});
  status($('ownerStatus'),'✓ '+(result.kind||'WhatsApp')+' invitation accepted. Watch the Channel queue for actual publishing confirmation.',true);
  $('ownerLink').value='';await loadQueue();
 }catch(err){status($('ownerStatus'),err.message);}
 finally{button.disabled=false;}
});
async function health(){
 try{const r=await fetch('/api/index?mode=health',{cache:'no-store'}),data=await r.json();
  $('apiHealth').textContent=data.configured&&data.databaseConnected?'Connected':'Setup required';
  $('workerHealth').textContent=data.workerReady?'Verified online':'Offline';
  $('submissionHealth').textContent=data.submissionsOpen?'Open':'Paused';
 }catch{$('apiHealth').textContent='Unavailable';$('workerHealth').textContent='Unknown';$('submissionHealth').textContent='Paused'}
}
buildEditor();renderPreview();health();setInterval(health,12000);
})();