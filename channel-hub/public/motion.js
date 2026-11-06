/* Progressive GSAP enhancement: semantic content remains visible without JavaScript animation. */
(()=>{
'use strict';
const start=()=>{
 const root=document.documentElement;
 if(root.dataset.motion==='off'||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
 const gsap=window.gsap;
 if(!gsap)return;
 const enhanced=root.dataset.motion!=='balanced';
 const hero=document.querySelector('.axhk-hero');
 if(hero){
  const targets=['.eyebrow','.hero-badge','h1','.lead','.axhk-hero-ctas','.pills'].map(s=>hero.querySelector(s)).filter(Boolean);
  gsap.from(targets,{autoAlpha:0,y:enhanced?23:12,duration:enhanced?.76:.48,stagger:.075,ease:'power3.out',clearProps:'all'});
  const frame=hero.querySelector('.visual-frame');
  if(frame)gsap.from(frame,{autoAlpha:0,y:25,scale:.97,duration:.9,delay:.16,ease:'power3.out',clearProps:'all'});
 }
 const targets=document.querySelectorAll('.submit-panel,.side-panel,.help-panel,.community-band,.axhk-founder,.site-footer,.admin-card,.studio-panel');
 if('IntersectionObserver' in window){
  const io=new IntersectionObserver(entries=>{
   entries.forEach(entry=>{
    if(!entry.isIntersecting)return;
    io.unobserve(entry.target);
    gsap.fromTo(entry.target,{opacity:.72,y:enhanced?24:12},{opacity:1,y:0,duration:enhanced?.72:.45,ease:'power2.out',clearProps:'all'});
   });
  },{threshold:.08});
  targets.forEach(t=>io.observe(t));
 }
 if(enhanced&&matchMedia('(hover: hover) and (pointer: fine)').matches){
  const visual=document.querySelector('.hero-image-stage');
  const container=document.querySelector('.visual-frame');
  if(visual&&container){
   const xTo=gsap.quickTo(visual,'x',{duration:.55,ease:'power3.out'});
   const yTo=gsap.quickTo(visual,'y',{duration:.55,ease:'power3.out'});
   container.addEventListener('pointermove',event=>{
    const rect=container.getBoundingClientRect();
    xTo((event.clientX-rect.left-rect.width/2)*.045);
    yTo((event.clientY-rect.top-rect.height/2)*.045);
   });
   container.addEventListener('pointerleave',()=>{xTo(0);yTo(0)});
  }
 }
};
Promise.resolve(window.AXHK_BRAND_PROMISE).then(start).catch(()=>{});
})();