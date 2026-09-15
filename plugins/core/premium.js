import crypto from 'node:crypto';
import path from 'node:path';
import { registerCommand } from '../../lib/core/registry.js';

const need = (ctx, hint = '') => {
  const value = String(ctx.argText || '').trim();
  if (!value) throw new Error(hint || `Usage: ${ctx.prefix}${ctx.command?.name || 'command'} <value>`);
  return value;
};
const cut = (s, n = 3900) => String(s).slice(0, n);
const num = (v, label = 'number') => {
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`Provide a valid ${label}.`);
  return n;
};
const int = (v, min, max, fallback) => {
  const n = Number(v);
  if (!Number.isInteger(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};
const gcd2 = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a; };
const cleanTracking = (u) => {
  const url = new URL(u);
  const exact = new Set(['fbclid','gclid','dclid','msclkid','igshid','mc_cid','mc_eid','ref','ref_src','si','feature']);
  for (const key of [...url.searchParams.keys()]) if (key.toLowerCase().startsWith('utm_') || exact.has(key.toLowerCase())) url.searchParams.delete(key);
  return url.toString();
};
const htmlDecode = (s) => s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&');
const humanBytes = (bytes) => {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n < 0) throw new Error('Provide a byte value of 0 or greater.');
  const units = ['B','KB','MB','GB','TB','PB'];
  let value = n, i = 0;
  while (value >= 1024 && i < units.length - 1) { value /= 1024; i += 1; }
  return `${Number(value.toFixed(3))} ${units[i]}`;
};
const wcag = (hex) => {
  let h = String(hex || '').trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(h)) h = [...h].map(x => x + x).join('');
  if (!/^[0-9a-f]{6}$/i.test(h)) throw new Error('Use HEX colors like #22C55E.');
  const rgb = [0,2,4].map(i => parseInt(h.slice(i,i+2),16)/255).map(c => c <= .03928 ? c/12.92 : ((c+.055)/1.055)**2.4);
  return .2126*rgb[0] + .7152*rgb[1] + .0722*rgb[2];
};

registerCommand({ name:'textstats', aliases:['analyzetext'], category:'premium', description:'Detailed text statistics', usage:'textstats your text', async run(ctx){
  const t=need(ctx); const words=t.trim().split(/\s+/).filter(Boolean); const lines=t.split(/\r?\n/); const sentences=(t.match(/[.!?]+(?:\s|$)/g)||[]).length || (t.trim()?1:0);
  const unique=new Set(words.map(w=>w.toLowerCase().replace(/[^\p{L}\p{N}]/gu,''))).size; const mins=Math.max(1,Math.ceil(words.length/220));
  await ctx.reply(`💎 A-X-HK TEXT INTELLIGENCE\n\nWords: ${words.length}\nCharacters: ${t.length}\nCharacters (no spaces): ${t.replace(/\s/g,'').length}\nLines: ${lines.length}\nSentences: ${sentences}\nUnique words: ${unique}\nReading time: ~${mins} min`);
}});
registerCommand({ name:'urlclean', aliases:['cleanurl','striputm'], category:'premium', description:'Remove common tracking parameters from a URL', usage:'urlclean https://example.com/?utm_source=x', async run(ctx){ try{await ctx.reply(cleanTracking(need(ctx)));}catch{throw new Error('Provide a valid absolute http/https URL.');} } });
registerCommand({ name:'domaininfo', aliases:['parseurl'], category:'premium', description:'Inspect URL components without opening it', usage:'domaininfo https://example.com/path?a=1', async run(ctx){
  let u; try{u=new URL(need(ctx));}catch{throw new Error('Provide a valid absolute URL.');}
  await ctx.reply(`🌐 URL INSPECTOR\n\nProtocol: ${u.protocol}\nHost: ${u.hostname}\nPort: ${u.port||'default'}\nPath: ${u.pathname||'/'}\nQuery items: ${[...u.searchParams.keys()].length}\nHash: ${u.hash||'-'}`);
}});
registerCommand({ name:'jsonminify', aliases:['minifyjson'], category:'premium', description:'Validate and minify JSON', usage:'jsonminify {"ok": true}', async run(ctx){ const v=JSON.parse(need(ctx,'Provide valid JSON.')); await ctx.reply(cut(JSON.stringify(v))); } });
registerCommand({ name:'jwtdecode', aliases:['decodejwt'], category:'premium', description:'Decode JWT header/payload without verifying signature', usage:'jwtdecode eyJ...', async run(ctx){
  const parts=need(ctx).split('.'); if(parts.length<2) throw new Error('Provide a JWT with header.payload.signature.');
  const dec=(v)=>JSON.parse(Buffer.from(v.replace(/-/g,'+').replace(/_/g,'/'),'base64').toString('utf8'));
  let header,payload; try{header=dec(parts[0]);payload=dec(parts[1]);}catch{throw new Error('JWT header or payload is not valid JSON.');}
  await ctx.reply(cut(`🔐 JWT DECODE (signature NOT verified)\n\nHEADER\n${JSON.stringify(header,null,2)}\n\nPAYLOAD\n${JSON.stringify(payload,null,2)}`));
}});
registerCommand({ name:'randomstring', aliases:['randstr'], category:'premium', description:'Generate a cryptographically random string', usage:'randomstring 24', async run(ctx){ const len=int(ctx.args[0],8,128,24); const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'; const b=crypto.randomBytes(len); await ctx.reply([...b].map(x=>alphabet[x%alphabet.length]).join('')); } });
registerCommand({ name:'securepin', aliases:['randompin'], category:'premium', description:'Generate a random numeric PIN', usage:'securepin 6', async run(ctx){ const len=int(ctx.args[0],4,12,6); let out=''; while(out.length<len) out += String(crypto.randomInt(0,10)); await ctx.reply(`🔢 ${len}-digit PIN\n${out}`); } });
registerCommand({ name:'lorem', category:'premium', description:'Generate placeholder text', usage:'lorem 2', async run(ctx){ const count=int(ctx.args[0],1,6,1); const base='Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer posuere, nibh sed facilisis faucibus, justo erat luctus nibh, vitae dictum sapien arcu at nibh.'; await ctx.reply(Array(count).fill(base).join('\n\n')); } });
registerCommand({ name:'dedupe', aliases:['uniquelines'], category:'premium', description:'Remove duplicate lines while preserving order', usage:'dedupe line1 | line2 | line1', async run(ctx){ const raw=need(ctx); const parts=raw.includes('|')?raw.split('|'):raw.split(/\r?\n/); const seen=new Set(); const out=parts.map(x=>x.trim()).filter(x=>x&&!seen.has(x.toLowerCase())&&seen.add(x.toLowerCase())); await ctx.reply(cut(out.join('\n'))); } });
registerCommand({ name:'sortlines', category:'premium', description:'Sort supplied lines alphabetically', usage:'sortlines z | a | m', async run(ctx){ const raw=need(ctx); const p=(raw.includes('|')?raw.split('|'):raw.split(/\r?\n/)).map(x=>x.trim()).filter(Boolean).sort((a,b)=>a.localeCompare(b)); await ctx.reply(cut(p.join('\n'))); } });
registerCommand({ name:'shufflelines', category:'premium', description:'Shuffle supplied lines', usage:'shufflelines a | b | c', async run(ctx){ const raw=need(ctx); const p=(raw.includes('|')?raw.split('|'):raw.split(/\r?\n/)).map(x=>x.trim()).filter(Boolean); for(let i=p.length-1;i>0;i--){const j=crypto.randomInt(0,i+1);[p[i],p[j]]=[p[j],p[i]];} await ctx.reply(cut(p.join('\n'))); } });
registerCommand({ name:'numberformat', aliases:['commas'], category:'premium', description:'Format a number with separators', usage:'numberformat 1234567.89', async run(ctx){ const n=num(need(ctx)); await ctx.reply(new Intl.NumberFormat('en-US',{maximumFractionDigits:12}).format(n)); } });
registerCommand({ name:'humanbytes', aliases:['bytesize'], category:'premium', description:'Convert bytes to a human-readable size', usage:'humanbytes 1048576', async run(ctx){ await ctx.reply(humanBytes(need(ctx))); } });
registerCommand({ name:'countdown', category:'premium', description:'Show time remaining until a date/time', usage:'countdown 2026-12-31T23:59:59Z', async run(ctx){ const d=new Date(need(ctx)); if(Number.isNaN(d.getTime())) throw new Error('Use an ISO-like date, e.g. 2026-12-31T23:59:59Z.'); let ms=d-Date.now(); const past=ms<0; ms=Math.abs(ms); const days=Math.floor(ms/86400000); ms%=86400000; const hours=Math.floor(ms/3600000); ms%=3600000; const mins=Math.floor(ms/60000); const secs=Math.floor((ms%60000)/1000); await ctx.reply(`⏳ ${past?'Elapsed since':'Time remaining'}\n${days}d ${hours}h ${mins}m ${secs}s`); } });
registerCommand({ name:'unixdate', aliases:['tounix'], category:'premium', description:'Convert a date to Unix seconds', usage:'unixdate 2026-12-31T00:00:00Z', async run(ctx){ const d=new Date(need(ctx)); if(Number.isNaN(d.getTime())) throw new Error('Provide a valid date/time.'); await ctx.reply(String(Math.floor(d.getTime()/1000))); } });
registerCommand({ name:'fromunix', aliases:['epochdate'], category:'premium', description:'Convert Unix seconds to ISO date', usage:'fromunix 1798675200', async run(ctx){ const n=num(need(ctx)); const ms=n>1e12?n:n*1000; const d=new Date(ms); if(Number.isNaN(d.getTime())) throw new Error('Provide a valid Unix timestamp.'); await ctx.reply(d.toISOString()); } });
registerCommand({ name:'percentagechange', aliases:['pctchange'], category:'premium', description:'Calculate percentage change old → new', usage:'percentagechange 80 100', async run(ctx){ const a=num(ctx.args[0],'old value'), b=num(ctx.args[1],'new value'); if(a===0) throw new Error('Old value cannot be zero.'); await ctx.reply(`${(((b-a)/Math.abs(a))*100).toFixed(2)}%`); } });
registerCommand({ name:'ratio', category:'premium', description:'Reduce two integers to a ratio', usage:'ratio 1920 1080', async run(ctx){ const a=Math.trunc(num(ctx.args[0])),b=Math.trunc(num(ctx.args[1])); if(!a||!b) throw new Error('Use two non-zero integers.'); const g=gcd2(a,b); await ctx.reply(`${a/g}:${b/g}`); } });
registerCommand({ name:'gcd', category:'premium', description:'Greatest common divisor', usage:'gcd 48 18', async run(ctx){ const a=Math.trunc(num(ctx.args[0])),b=Math.trunc(num(ctx.args[1])); await ctx.reply(String(gcd2(a,b))); } });
registerCommand({ name:'lcm', category:'premium', description:'Least common multiple', usage:'lcm 12 18', async run(ctx){ const a=Math.trunc(num(ctx.args[0])),b=Math.trunc(num(ctx.args[1])); if(!a||!b) throw new Error('Use two non-zero integers.'); await ctx.reply(String(Math.abs(a*b)/gcd2(a,b))); } });
registerCommand({ name:'prime', aliases:['isprime'], category:'premium', description:'Check whether an integer is prime', usage:'prime 97', async run(ctx){ const n=Math.trunc(num(need(ctx))); if(n<2) return ctx.reply(`${n} is not prime.`); if(n>10_000_000) throw new Error('Prime check limit is 10,000,000.'); let ok=true; for(let i=2;i*i<=n;i++){if(n%i===0){ok=false;break;}} await ctx.reply(`${n} ${ok?'is':'is not'} prime.`); } });
registerCommand({ name:'factors', category:'premium', description:'List integer factors', usage:'factors 84', async run(ctx){ const n=Math.abs(Math.trunc(num(need(ctx)))); if(n<1||n>1_000_000) throw new Error('Use an integer from 1 to 1,000,000.'); const a=[],b=[]; for(let i=1;i*i<=n;i++) if(n%i===0){a.push(i);if(i!==n/i)b.push(n/i);} await ctx.reply([...a,...b.reverse()].join(', ')); } });
registerCommand({ name:'contrast', aliases:['contrastcheck'], category:'premium', description:'WCAG contrast ratio between two HEX colors', usage:'contrast #000000 #FFFFFF', async run(ctx){ const l1=wcag(ctx.args[0]),l2=wcag(ctx.args[1]); const ratio=(Math.max(l1,l2)+.05)/(Math.min(l1,l2)+.05); await ctx.reply(`🎨 Contrast: ${ratio.toFixed(2)}:1\nAA normal text: ${ratio>=4.5?'PASS':'FAIL'}\nAAA normal text: ${ratio>=7?'PASS':'FAIL'}`); } });
registerCommand({ name:'gradient', category:'premium', description:'Create a CSS linear-gradient string', usage:'gradient #22C55E #0B1220 135', async run(ctx){ const a=String(ctx.args[0]||''),b=String(ctx.args[1]||''),deg=int(ctx.args[2],0,360,135); if(!/^#[0-9a-f]{3,8}$/i.test(a)||!/^#[0-9a-f]{3,8}$/i.test(b)) throw new Error('Usage: gradient #22C55E #0B1220 135'); await ctx.reply(`linear-gradient(${deg}deg, ${a}, ${b})`); } });
registerCommand({ name:'htmlencode', category:'premium', description:'Escape HTML special characters', usage:'htmlencode <b>Hello</b>', async run(ctx){ const t=need(ctx); await ctx.reply(cut(t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'))); } });
registerCommand({ name:'htmldecode', category:'premium', description:'Decode common HTML entities', usage:'htmldecode &lt;b&gt;', async run(ctx){ await ctx.reply(cut(htmlDecode(need(ctx)))); } });
registerCommand({ name:'markdownescape', aliases:['mdescape'], category:'premium', description:'Escape common Markdown control characters', usage:'markdownescape *hello*', async run(ctx){ await ctx.reply(cut(need(ctx).replace(/([\\`*_{}\[\]()#+\-.!|>])/g,'\\$1'))); } });
registerCommand({ name:'extinfo', aliases:['fileext'], category:'premium', description:'Inspect a filename extension locally', usage:'extinfo archive.tar.gz', async run(ctx){ const name=path.basename(need(ctx)); const ext=path.extname(name).toLowerCase()||'(none)'; await ctx.reply(`📄 FILE INFO\nName: ${name}\nExtension: ${ext}`); } });
