/* A-X-HK premium motion system. Progressive, accessible and admin-configurable. */
(()=>{
'use strict';
const root=document.documentElement;
const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
const level=()=>root.dataset.motion||'enhanced';
const enabled=()=>level()!=='off'&&!reduced();
const enhanced=()=>level()==='enhanced';
const gsap=()=>window.gsap;
const cleanups=[];
const permanentCleanups=[];
const add=(target,type,handler,opts)=>{target.addEventListener(type,handler,opts);cleanups.push(()=>target.removeEventListener(type,handler,opts))};
let animations=[];
function clear(){
 for(const fn of cleanups.splice(0))fn();
 for(const anim of animations.splice(0))try{anim.kill()}catch{}
 document.querySelectorAll('.axhk-reveal-pending').forEach(el=>el.classList.remove('axhk-reveal-pending'));
}
function start(){
 clear();
 if(!enabled())return;
 const g=gsap();
 if(!g)return;
 const speed=enhanced()?1:.65;
 const entrance=(els,options={})=>{
  const targets=Array.from(els).filter(Boolean);
  if(!targets.length)return;
  animations.push(g.from(targets,{autoAlpha:0,y:enhanced()?25:12,duration:.75*speed,stagger:.07,ease:'power3.out',clearProps:'all',...options}));
 };
 entrance(document.querySelectorAll('.axhk-hero .eyebrow,.axhk-hero .hero-badge,.axhk-hero h1,.axhk-hero .lead,.axhk-hero .axhk-hero-ctas,.axhk-hero .pills'),{delay:.05});
 entrance(document.querySelectorAll('.admin-hero .eyebrow,.admin-hero h1,.admin-hero .lead,.admin-hero-symbol'),{delay:.05});
 entrance(document.querySelectorAll('.hero-visual .visual-frame,.hero-visual .visual-floating-card'),{delay:.2,stagger:.13});
 const sections=document.querySelectorAll('.submit-panel,.side-panel,.help-panel,.community-band,.axhk-founder,.site-footer,.admin-card,.studio-panel,.metric-card,.section-heading-row');
 if('IntersectionObserver' in window){
  const observer=new IntersectionObserver(entries=>{
   entries.forEach(entry=>{
    if(!entry.isIntersecting)return;
    observer.unobserve(entry.target);
    animations.push(g.fromTo(entry.target,{autoAlpha:.65,y:enhanced()?24:12},{autoAlpha:1,y:0,duration:.7*speed,ease:'power2.out',clearProps:'all'}));
   });
  },{threshold:.07,rootMargin:'0px 0px -24px 0px'});
  sections.forEach(el=>observer.observe(el));
  cleanups.push(()=>observer.disconnect());
 }
 if(enhanced()&&matchMedia('(hover: hover) and (pointer: fine)').matches){
  const visual=document.querySelector('.hero-image-stage'),frame=document.querySelector('.visual-frame');
  if(visual&&frame){
   const x=g.quickTo(visual,'x',{duration:.65,ease:'power3.out'});
   const y=g.quickTo(visual,'y',{duration:.65,ease:'power3.out'});
   add(frame,'pointermove',e=>{
    const r=frame.getBoundingClientRect();
    x((e.clientX-r.left-r.width/2)*.035);
    y((e.clientY-r.top-r.height/2)*.035);
   },{passive:true});
   add(frame,'pointerleave',()=>{x(0);y(0)});
  }
  document.querySelectorAll('.axhk-main-cta,.button-primary,.axhk-ghost-cta').forEach(el=>{
   const x=g.quickTo(el,'x',{duration:.3,ease:'power2.out'});
   const y=g.quickTo(el,'y',{duration:.3,ease:'power2.out'});
   add(el,'pointermove',e=>{
    const r=el.getBoundingClientRect();
    x(Math.max(-7,Math.min(7,(e.clientX-r.left-r.width/2)*.07)));
    y(Math.max(-5,Math.min(5,(e.clientY-r.top-r.height/2)*.07)));
   },{passive:true});
   add(el,'pointerleave',()=>{x(0);y(0)});
   add(el,'blur',()=>{x(0);y(0)});
  });
 }
}
function progress(){
 if(!document.querySelector('.axhk-scroll-progress')){
  const bar=document.createElement('div');
  bar.className='axhk-scroll-progress';
  bar.setAttribute('aria-hidden','true');
  document.body.append(bar);
 }
 const bar=document.querySelector('.axhk-scroll-progress');
 let scheduled=false;
 const paint=()=>{
  scheduled=false;
  const max=Math.max(1,document.documentElement.scrollHeight-innerHeight);
  bar.style.transform='scaleX('+Math.max(0,Math.min(1,scrollY/max))+')';
 };
 const onScroll=()=>{if(!scheduled){scheduled=true;requestAnimationFrame(paint)}};
 window.addEventListener('scroll',onScroll,{passive:true});
 window.addEventListener('resize',paint,{passive:true});
 permanentCleanups.push(()=>window.removeEventListener('scroll',onScroll),()=>window.removeEventListener('resize',paint));
 paint();
}
Promise.resolve(window.AXHK_BRAND_PROMISE).catch(()=>{}).then(()=>{
 progress();
 start();
 const media=matchMedia('(prefers-reduced-motion: reduce)');
 if(media.addEventListener)add(media,'change',start);
 const observer=new MutationObserver(records=>{
  if(records.some(r=>r.attributeName==='data-motion'))start();
 });
 observer.observe(root,{attributes:true,attributeFilter:['data-motion']});
});
})();
