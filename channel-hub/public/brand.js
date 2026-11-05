/* Public branding applies only validated settings returned by the server. */
(()=>{
  const defaults={
    brandName:'A-X-HK',brandTagline:'OFFICIAL NETWORK',
    heroTitle:'Share your community.',heroHighlight:'Grow together.',
    heroDescription:'Your WhatsApp Group or Channel deserves to be discovered. Share your invite link and connect your community with A-X-HK.',
    eyebrow:'✦ COMMUNITY DISCOVERY NETWORK ✦',
    submitTitle:'Share your link',
    submitDescription:'Paste an invitation link below. Only official WhatsApp invitation URLs are accepted.',
    submitButton:'Submit & auto-publish link',
    channelUrl:'https://whatsapp.com/channel/0029VbA4HK9LNSaApTeufD1F',
    contactNumber:'923044596780',contactLabel:'Chat with Abdullah',
    founderName:'ABDULLAH-X-HACKER',
    founderDescription:'Building a connected network of creators, groups and channels.',
    accentColor:'#a8ffbf',backgroundColor:'#090f0e',surfaceColor:'#121b19'
  };
  const get=id=>document.getElementById(id);
  function set(id,value){const el=get(id);if(el)el.textContent=value}
  function color(value,fallback){return /^#[0-9a-fA-F]{6}$/.test(value)?value:fallback}
  function apply(data){
    const b={...defaults,...(data||{})};
    window.AXHK_BRAND=b;
    document.documentElement.style.setProperty('--mint',color(b.accentColor,defaults.accentColor));
    document.documentElement.style.setProperty('--bg',color(b.backgroundColor,defaults.backgroundColor));
    document.documentElement.style.setProperty('--surface',color(b.surfaceColor,defaults.surfaceColor));
    set('brandName',b.brandName);set('brandTagline',b.brandTagline);
    set('heroEyebrow',b.eyebrow);
    set('submitTitle',b.submitTitle);set('submitDescription',b.submitDescription);
    if(get('buttonLabel'))get('buttonLabel').textContent=b.submitButton;
    const intro=document.querySelector('.axhk-hero h1');
    if(intro){
      intro.replaceChildren(document.createTextNode(b.heroTitle+' '));
      const em=document.createElement('em');em.textContent=b.heroHighlight;intro.append(em);
    }
    const lead=document.querySelector('.axhk-hero .lead');
    if(lead)lead.textContent=b.heroDescription;
    const logo=get('siteLogo');
    if(logo){
      logo.src=b.logoData||'/axhk-logo.webp';
      logo.alt=b.brandName+' logo';
      logo.onerror=()=>{logo.src='/axhk-logo.webp';logo.onerror=null};
    }
    document.querySelectorAll('.axhk-channel-link,.axhk-ghost-cta,#visitChannel').forEach(link=>{
      link.href=b.channelUrl;
    });
    const contact=document.querySelector('.axhk-contact');
    const number=/^[0-9]{10,16}$/.test(b.contactNumber)?b.contactNumber:defaults.contactNumber;
    const contactHref='https://wa.me/'+number+'?text='+encodeURIComponent('Assalamualaikum, contacting you from '+b.brandName+' Channel Hub');
    if(contact){contact.href=contactHref;contact.setAttribute('aria-label',b.contactLabel)}
    const contactText=document.querySelector('.axhk-contact-label');
    if(contactText)contactText.textContent=b.contactLabel;
    const founder=document.querySelector('.axhk-founder-body');
    if(founder){
      const h=founder.querySelector('h2'),p=founder.querySelector('p');
      if(h)h.textContent=b.founderName;
      if(p)p.textContent=b.founderDescription;
    }
    const founderButton=document.querySelector('.axhk-founder-cta');
    if(founderButton)founderButton.href=contactHref;
  }
  window.AXHK_APPLY_BRAND=apply;
  apply(defaults);
  fetch('/api/index?mode=brand',{cache:'no-store'}).then(r=>r.ok?r.json():null)
    .then(data=>{if(data?.branding)apply(data.branding)})
    .catch(()=>{});
})();