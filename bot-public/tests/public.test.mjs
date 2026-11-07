import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const file=p=>fs.readFile(new URL('../'+p,import.meta.url),'utf8');
test('public page has no owner access code field and offers phone and QR choice',async()=>{
 const s=await file('public/index.html');
 assert.doesNotMatch(s,/id="accessCode"|id="accessWrap"/);
 for(const id of ['createForm','phone','nickname','tabQr','tabCode','qrBox','pairCode','createBtn','wa-float-nope']) {
  if(id==='wa-float-nope')assert.match(s,/class="wa-float"/);
  else assert.match(s,new RegExp('id="'+id+'"'));
 }
 assert.match(s,/name="pairingMethod" value="qr"/);
 assert.match(s,/name="pairingMethod" value="code"/);
 assert.match(s,/wa\.me\/923044596780/);
});
test('public client starts phone code automatically but does not retry a timed-out creation',async()=>{
 const s=await file('public/assets/site.js');
 assert.match(s,/await generateCode\(\{auto:true\}\)/);
 assert.match(s,/localStorage\.setItem\(ID_KEY,id\)/);
 assert.match(s,/Please do NOT repeatedly create a session/);
 assert.match(s,/hostPairingEnabled/);
 assert.doesNotMatch(s,/accessCode/);
});
test('public gateway only allows sanctioned methods and per-session token',async()=>{
 const s=await file('api/index.js');
 assert.match(s,/function permitted\(path,method\)/);
 assert.match(s,/x-session-token/);
 assert.match(s,/createHmac/);
 assert.doesNotMatch(s,/\/api\/admin\/policy/);
});
test('public CSS supports reduced motion and responsive mobile',async()=>{
 const css=await file('public/assets/site.css');
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(css,/@media\(max-width:580px\)/);
 assert.match(css,/\.wa-float/);
});
test('host runtime supports owner-enabled multi-pairing switch',async()=>{
 const host=await fs.readFile(new URL('../../lib/services/web.js',import.meta.url),'utf8');
 assert.match(host,/policy\.publicMultiEnabled = req\.body\.publicMultiEnabled/);
 assert.match(host,/config\.multi\.enabled = policy\.publicMultiEnabled/);
 const agent=await fs.readFile(new URL('../../bot-panel/termux-agent.mjs',import.meta.url),'utf8');
 assert.match(agent,/publicPairingEnabled/);
 assert.match(agent,/publicMultiEnabled:true/);
});