(()=>{
  const channelUrl='https://whatsapp.com/channel/0029VbA4HK9LNSaApTeufD1F';
  const contactUrl='https://wa.me/923044596780?text=Assalamualaikum%20Abdullah%2C%20I%20am%20contacting%20you%20from%20A-X-HK%20Channel%20Hub.';
  const icon='<svg viewBox="0 0 32 32" aria-hidden="true" fill="currentColor"><path d="M16 1.1A14.9 14.9 0 0 0 3.3 23.8L1.4 31l7.3-1.9a14.9 14.9 0 1 0 7.3-28Zm0 27.1c-2.2 0-4.4-.6-6.3-1.7l-.5-.3-4.3 1.1L6 23.1l-.3-.5A12.3 12.3 0 1 1 16 28.2Zm7-9.2c-.4-.2-2.2-1.1-2.6-1.2s-.6-.2-.9.2c-.3.4-1 1.2-1.2 1.4-.2.3-.5.3-.9.1-.4-.2-1.7-.6-3.1-1.9-1.2-1-2-2.3-2.2-2.7-.2-.4 0-.6.2-.8l.6-.7.4-.6c.1-.2.1-.4 0-.7-.1-.2-.9-2.2-1.2-3-.3-.7-.6-.6-.9-.6h-.8c-.3 0-.7.1-1.1.5-.4.4-1.5 1.4-1.5 3.4s1.5 4 1.7 4.2c.2.3 2.9 4.5 7 6.3 1 .4 1.8.7 2.4.8 1 .3 1.9.2 2.6.2.8-.1 2.2-.9 2.5-1.8.3-.9.3-1.7.2-1.8-.1-.2-.3-.3-.7-.5Z"/></svg>';
  const a=document.createElement('a');a.href=contactUrl;a.target='_blank';a.rel='noopener noreferrer';
  a.className='axhk-contact';a.setAttribute('aria-label','Contact Abdullah on WhatsApp');
  a.innerHTML=icon+'<span class="axhk-contact-label">Chat with Abdullah</span>';
  document.body.appendChild(a);

  const top=document.querySelector('.topright');
  if(top){top.replaceChildren();const nav=document.createElement('nav');nav.className='axhk-nav';nav.setAttribute('aria-label','Quick links');
    const join=document.createElement('a');join.href=channelUrl;join.target='_blank';join.rel='noopener noreferrer';join.textContent='Join Our Channel ↗';join.className='axhk-channel-link';nav.appendChild(join);top.appendChild(nav);
  }
  const intro=document.querySelector('.intro');
  if(intro){intro.classList.add('axhk-hero');
    const art=document.createElement('div');art.className='axhk-hero-art';art.setAttribute('aria-hidden','true');
    art.innerHTML='<div class="axhk-hero-ring"></div><div class="axhk-hero-monogram">AX<span>HK</span></div>';
    intro.insertBefore(art,intro.firstChild);
    const h=intro.querySelector('h1');if(h)h.innerHTML='Share your <em>community.</em><br>Grow together.';
    const lead=intro.querySelector('.lead');if(lead)lead.textContent='Your WhatsApp Group or Channel deserves to be discovered. Share your invite link and connect your community with A-X-HK.';
    const ctas=document.createElement('div');ctas.className='axhk-hero-ctas';
    const submit=document.createElement('a');submit.href='#submitForm';submit.className='axhk-main-cta';submit.textContent='Submit Your Link ↗';
    const discover=document.createElement('a');discover.href=channelUrl;discover.target='_blank';discover.rel='noopener noreferrer';discover.className='axhk-ghost-cta';discover.textContent='Explore Our Channel ↗';
    ctas.append(submit,discover);const pills=intro.querySelector('.pills');if(pills)intro.insertBefore(ctas,pills);
  }
  const side=document.querySelector('.side-panel');if(side)side.id='how-it-works';
  const footer=document.querySelector('footer');
  if(footer){
    const section=document.createElement('section');section.className='axhk-founder';
    section.innerHTML='<div class="axhk-founder-mark">A<span>X</span></div><div class="axhk-founder-body"><small>FOUNDED BY ABDULLAH</small><h2>ABDULLAH-X-HACKER.</h2><p>Building a connected network of creators, groups and channels. Need assistance or want to collaborate?</p></div>';
    const button=document.createElement('a');button.className='axhk-founder-cta';button.href=contactUrl;button.target='_blank';button.rel='noopener noreferrer';button.textContent='Contact Abdullah ↗';section.appendChild(button);
    footer.parentNode.insertBefore(section,footer);
  }
  const revealItems=document.querySelectorAll('.panel,.side-panel,.help-panel,.axhk-founder');
  if('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches){
    const io=new IntersectionObserver(entries=>{for(const e of entries){if(e.isIntersecting){e.target.classList.add('axhk-revealed');io.unobserve(e.target)}}},{threshold:.08});
    revealItems.forEach(el=>{el.classList.add('axhk-reveal-ready');io.observe(el)});
  }
})();