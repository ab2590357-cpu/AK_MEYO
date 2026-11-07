/* Theme switch, accessible mobile navigation and direct WhatsApp assistance. */
(()=>{
'use strict';
const root=document.documentElement;
const menu=document.querySelector('#mainNav'),toggle=document.querySelector('#mobileMenuToggle'),themeButton=document.querySelector('#themeToggle');
let settings={defaultTheme:'dark',allowThemeToggle:true};
const saved=()=>{try{return localStorage.getItem('axhk-theme-choice')}catch{return null}};
const store=value=>{try{localStorage.setItem('axhk-theme-choice',value)}catch{}};
const system=()=>matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';
const effective=()=>{const pref=saved();return pref==='light'||pref==='dark'?pref:(settings.defaultTheme==='system'?system():settings.defaultTheme==='light'?'light':'dark');};
function setTheme(){
 const mode=effective();
 root.dataset.theme=mode;
 if(themeButton){
  themeButton.hidden=settings.allowThemeToggle===false;
  themeButton.querySelector('.theme-icon').textContent=mode==='dark'?'☀':'☾';
  themeButton.setAttribute('aria-label','Switch to '+(mode==='dark'?'light':'dark')+' theme');
  themeButton.title='Switch to '+(mode==='dark'?'light':'dark')+' theme';
 }
}
window.AXHK_THEME_CONFIG=b=>{settings={...settings,...b};setTheme();};
themeButton?.addEventListener('click',()=>{store(effective()==='dark'?'light':'dark');setTheme();});
const media=matchMedia('(prefers-color-scheme: light)');
if(media.addEventListener)media.addEventListener('change',()=>{if(!saved())setTheme()});
function closeMenu(){menu?.classList.remove('is-open');toggle?.setAttribute('aria-expanded','false');toggle?.setAttribute('aria-label','Open menu');}
toggle?.addEventListener('click',()=>{const open=menu?.classList.toggle('is-open');toggle.setAttribute('aria-expanded',String(Boolean(open)));toggle.setAttribute('aria-label',open?'Close menu':'Open menu');});
menu?.querySelectorAll('a').forEach(a=>a.addEventListener('click',closeMenu));
document.addEventListener('keydown',event=>{if(event.key==='Escape')closeMenu()});
document.addEventListener('click',event=>{if(menu&&!menu.contains(event.target)&&toggle&&!toggle.contains(event.target))closeMenu()});
setTheme();
})();