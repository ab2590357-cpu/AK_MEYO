import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const read=(p)=>fs.readFile(new URL('../'+p,import.meta.url),'utf8');
const api=await read('channel-hub/api/index.js');
const index=await read('channel-hub/public/index.html');
const admin=await read('channel-hub/public/admin.html');
const adminJs=await read('channel-hub/public/admin.js');
const brandJs=await read('channel-hub/public/brand.js');
const app=await read('channel-hub/public/app.js');
const styles=await read('channel-hub/public/style.css');
const motion=await read('channel-hub/public/motion.js');
const start=api.indexOf('const BRAND_DEFAULTS = Object.freeze(');
const literal=api.slice(start+'const BRAND_DEFAULTS = Object.freeze('.length,api.indexOf('});',start)+1);
const defaults=vm.runInNewContext('('+literal+')');

test('every persisted branding setting is exposed in owner Brand Studio',()=>{
  assert.ok(Object.keys(defaults).length>50);
  for(const field of Object.keys(defaults)){
    assert.ok(adminJs.includes("['"+field+"',"),'Admin editor is missing '+field);
  }
});

test('public portal has safe confirmation CTA gated by verified posting',()=>{
  assert.match(index,/id="submitForm"/);
  assert.match(index,/id="visitChannel"[^>]*class="button-primary channel-visit-button hidden"/);
  assert.match(app,/const success=state==='posted'/);
  assert.match(app,/visit\.classList\.toggle\('hidden',!success\)/);
  assert.match(app,/mode=status&id=/);
  assert.match(app,/sessionStorage\.setItem\('axhk-link-receipt'/);
  assert.match(app,/12-hour cooldown/);
});

test('day-night toggle, reduced motion and scoped studio controls are included',()=>{
  assert.match(styles,/html\[data-theme="light"\]/);
  assert.match(styles,/prefers-reduced-motion:reduce/);
  assert.match(motion,/prefers-reduced-motion: reduce/);
  assert.match(brandJs,/allowThemeToggle/);
  assert.match(brandJs,/darkTextColor/);
  assert.match(admin,/id="brandEditor"/);
  assert.match(admin,/id="brandLivePreview"/);
  assert.match(adminJs,/toDataURL/); // Uploaded images are compressed client-side.
  assert.doesNotMatch(adminJs,/localStorage\.setItem\([^)]*token/i);
});

test('owner editor preserves public cooldown separation',()=>{
  assert.match(adminJs,/action:'submit'/);
  assert.match(index,/id="countdown"/);
  assert.match(app,/nextAllowedAt/);
  assert.match(app,/serviceReady/);
});

test('public critical navigation, forms and status content are accessible',()=>{
  for(const id of ['themeToggle','mobileMenuToggle','heroTitle','submitTitle','link','message','submissionHeading',
    'postingStatus','visitChannel','mainNav','how-it-works','community','founderName','footerCopyright']){
    assert.ok(index.includes('id="'+id+'"'),'Missing public element '+id);
  }
  assert.match(index,/aria-live="polite"/);
  assert.match(index,/rel="noopener noreferrer"/);
  assert.match(admin,/id="token" type="password"/);
  assert.match(admin,/id="brandStatus"/);
});
