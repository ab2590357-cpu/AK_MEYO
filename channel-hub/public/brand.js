/* The public brand is a validated, persistent settings document from Supabase. */
(()=>{
'use strict';
const defaults={
  brandName:'A-X-HK',brandTagline:'OFFICIAL NETWORK',eyebrow:'✦ COMMUNITY DISCOVERY NETWORK ✦',
  heroTitle:'Share your community.',heroHighlight:'Grow together.',
  heroDescription:'Your WhatsApp Group or Channel deserves to be discovered. Share your invite link and connect your community with A-X-HK.',
  heroPrimaryLabel:'Submit your link',heroSecondaryLabel:'Explore the Channel',heroBadge:'CONNECTED COMMUNITY NETWORK',
  headerChannelLabel:'Explore Channel',headerSubmitLabel:'Submit link',
  trustOne:'Official WhatsApp invites',trustTwo:'12-hour fair-use cooldown',trustThree:'Publishing when bot is online',
  submitTitle:'Share your link',submitDescription:'Paste an invitation link below. Only official WhatsApp invitation URLs are accepted.',
  submitButton:'Submit & auto-publish link',
  acceptedTitle:'Link accepted!',acceptedText:'Your link has been submitted. Our bot is publishing it automatically.',
  pendingTitle:'Publishing your link…',pendingText:'Your link is in the queue. This screen updates automatically.',
  postedTitle:'Your link is posted on our Channel!',postedText:'Your invitation is now published. Tap below to check it on our official WhatsApp Channel.',
  failedTitle:'This link needs review',failedText:'A confirmed Channel post is not available. Please contact the owner for help.',
  channelButton:'View your link on our Channel ↗',channelButtonNote:'Open the official Channel to see the latest posts.',
  sectionHeadingTitle:'Put your link',sectionHeadingHighlight:'in motion.',
  sectionHeadingDescription:'Share an invitation. Follow its real publishing status. Every successful post leads directly to the official Channel.',
  formHelper:'Official invitation links only. Verified posting requires the WhatsApp bot to be connected.',
  formFooterLeft:'ENCRYPTED TRANSFER',formFooterRight:'STATUS UPDATED AUTOMATICALLY',
  visualCardTitle:'Community first',visualCardText:'One link. Wider reach.',
  communityEyebrow:'THE A-X-HK NETWORK',communityTitle:'Community without',communityHighlight:'limits to discovery.',
  communityDescription:'Discover our official WhatsApp Channel and connect through shared communities.',
  communityButton:'Explore Official Channel',
  footerExploreTitle:'Explore',footerConnectTitle:'Connect',
  footerHomeLabel:'Home',footerSubmitLabel:'Submit link',footerHowLabel:'How it works',
  footerChannelLabel:'WhatsApp Channel',footerSupportLabel:'WhatsApp support',footerStudioLabel:'Owner Studio',
  howTitle:'From your link to our Channel.',howDescription:'One submission, a verified bot and a clear publishing status.',
  step1Title:'Paste your invitation',step1Description:'Share an invite for a WhatsApp Group or Channel you manage.',
  step2Title:'Instant validation',step2Description:'We check the format, duplicates and fair-use cooldown.',
  step3Title:'Verified Channel post',step3Description:'Our connected bot posts automatically; we show confirmation when WhatsApp returns a receipt.',
  cooldownTitle:'A fair space for every community',cooldownText:'Public visitors can submit one link per 12 hours. Owner submissions are managed separately.',
  founderEyebrow:'FOUNDER & COMMUNITY SUPPORT',founderName:'ABDULLAH-X-HACKER',
  founderDescription:'Building a connected network of creators, groups and channels.',founderButton:'Connect with Abdullah',
  footerDescription:'Your community deserves the right audience. Discover, connect and grow through our verified WhatsApp network.',
  footerCopyright:'© 2026 A-X-HK. Powered by ABDULLAH-X-HACKER.',
  footerNote:'Automated publishing depends on an active verified bot connection.',
  channelUrl:'https://whatsapp.com/channel/0029VbA4HK9LNSaApTeufD1F',contactNumber:'923044596780',contactLabel:'Chat with Abdullah',
  accentColor:'#a8ffbf',backgroundColor:'#090f0e',surfaceColor:'#121b19',darkTextColor:'#f5fff7',
  lightBackgroundColor:'#f2f6f2',lightSurfaceColor:'#ffffff',lightTextColor:'#12231b',
  defaultTheme:'dark',motionLevel:'enhanced',fontFamily:'manrope',radiusStyle:'rounded',allowThemeToggle:true,
  logoData:'',heroImageData:''
};
window.AXHK_BRAND_DEFAULTS={...defaults};
const get=id=>document.getElementById(id);
const color=(s,fallback)=>typeof s==='string'&&/^#[0-9a-fA-F]{6}$/.test(s)?s:fallback;
const set=(id,value)=>{const el=get(id);if(el&&typeof value==='string')el.textContent=value;};
const mainLink='https://whatsapp.com/channel/0029VbA4HK9LNSaApTeufD1F';
function apply(b){
 b={...defaults,...(b||{})};
 window.AXHK_BRAND=b;
 const root=document.documentElement;
 for(const [name,value] of Object.entries({
   '--accent':color(b.accentColor,defaults.accentColor),
   '--dark-bg':color(b.backgroundColor,defaults.backgroundColor),
   '--dark-surface':color(b.surfaceColor,defaults.surfaceColor),
   '--dark-text':color(b.darkTextColor,defaults.darkTextColor),
   '--light-bg':color(b.lightBackgroundColor,defaults.lightBackgroundColor),
   '--light-surface':color(b.lightSurfaceColor,defaults.lightSurfaceColor),
   '--light-text':color(b.lightTextColor,defaults.lightTextColor)
 }))root.style.setProperty(name,value);
 const fonts={
   manrope:["'Manrope', sans-serif","'DM Sans', sans-serif"],
   inter:["'Inter', sans-serif","'Inter', sans-serif"],
   spacegrotesk:["'Space Grotesk', sans-serif","'DM Sans', sans-serif"]
 };
 const family=fonts[b.fontFamily]||fonts.manrope;
 root.style.setProperty('--font-display',family[0]);root.style.setProperty('--font-body',family[1]);
 root.dataset.radius=['rounded','soft','sharp'].includes(b.radiusStyle)?b.radiusStyle:'rounded';
 root.dataset.motion=['enhanced','balanced','off'].includes(b.motionLevel)?b.motionLevel:'enhanced';
 if(typeof window.AXHK_THEME_CONFIG==='function')window.AXHK_THEME_CONFIG(b);
 [
  'brandName','brandTagline','heroEyebrow','heroBadge','heroDescription','headerChannelLabel','headerSubmitLabel',
  'trustOne','trustTwo','trustThree','submitTitle','submitDescription',
  'sectionHeadingTitle','sectionHeadingHighlight','sectionHeadingDescription','formHelper','formFooterLeft','formFooterRight',
  'visualCardTitle','visualCardText','communityEyebrow','communityTitle','communityHighlight','communityDescription','communityButton',
  'footerExploreTitle','footerConnectTitle','footerHomeLabel','footerSubmitLabel','footerHowLabel',
  'footerChannelLabel','footerSupportLabel','footerStudioLabel',
  'howTitle','howDescription','step1Title','step1Description','step2Title','step2Description','step3Title','step3Description',
  'cooldownTitle','cooldownText','founderEyebrow','founderName','founderDescription',
  'footerDescription','footerCopyright','footerNote'
 ].forEach(id=>set(id,id==='heroEyebrow'?b.eyebrow:b[id]));
 set('heroTitleLine',b.heroTitle);set('heroHighlight',b.heroHighlight);
 const heroPrimary=get('heroPrimaryLabel'),heroSecondary=get('heroSecondaryLabel');
 if(heroPrimary){const span=heroPrimary.querySelector('span');if(span)span.textContent=b.heroPrimaryLabel;}
 if(heroSecondary){const span=heroSecondary.querySelector('span');if(span)span.textContent=b.heroSecondaryLabel;}
 if(get('founderButton')){const btn=get('founderButton');btn.firstChild.textContent=b.founderButton+' ';}
 const logo=get('siteLogo');
 if(logo){logo.src=b.logoData||'/axhk-logo.webp';logo.alt=b.brandName+' logo';logo.onerror=()=>{logo.onerror=null;logo.src='/axhk-logo.webp';};}
 const image=get('heroImage');if(image){image.src=b.heroImageData||b.logoData||'/axhk-logo.webp';image.onerror=()=>{image.onerror=null;image.src='/axhk-logo.webp';};}
 for(const link of document.querySelectorAll('.axhk-channel-link,#heroSecondaryLabel,#visitChannel')){
   link.href=/^https:\/\/(?:www\.)?whatsapp\.com\/channel\/[A-Za-z0-9]{8,80}\/?$/.test(b.channelUrl)?b.channelUrl:mainLink;
 }
 const number=/^[0-9]{10,16}$/.test(b.contactNumber)?b.contactNumber:defaults.contactNumber;
 const contact='https://wa.me/'+number+'?text='+encodeURIComponent('Assalamualaikum, contacting you from '+b.brandName+' Channel Hub');
 for(const link of document.querySelectorAll('#contactWidget,#footerContact,#founderButton')){
   link.href=contact;
   if(link.id==='contactWidget')link.setAttribute('aria-label',b.contactLabel);
 }
 const tag=document.querySelector('.axhk-contact-label');if(tag)tag.textContent=b.contactLabel;
 document.querySelectorAll('title').forEach(t=>t.textContent=b.brandName+' • Premium Community Link Hub');
 window.dispatchEvent(new CustomEvent('axhk-brand-changed',{detail:b}));
}
window.AXHK_APPLY_BRAND=apply;
apply(defaults);
window.AXHK_BRAND_PROMISE=fetch('/api/index?mode=brand',{cache:'no-store'}).then(async r=>r.ok?r.json():null).then(data=>{if(data?.branding)apply(data.branding);return window.AXHK_BRAND;}).catch(()=>window.AXHK_BRAND);
})();