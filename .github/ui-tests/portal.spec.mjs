import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { chromium } from 'playwright';

const here=path.dirname(fileURLToPath(import.meta.url));
const webroot=path.resolve(here,'../../channel-hub/public');
const gsapFile=path.resolve(here,'node_modules/gsap/dist/gsap.min.js');
const shotDir=path.resolve(here,'screenshots');
const state={brand:{},status:'pending',posts:0,saved:null};
const fakeId='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const receipt='b'.repeat(64);
const header={'content-type':'application/json; charset=utf-8','cache-control':'no-store'};
const respond=(res,code,body)=>{res.writeHead(code,header);res.end(JSON.stringify(body));};
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml'};

const server=createServer(async(req,res)=>{
 const u=new URL(req.url||'/', 'http://localhost');
 if(u.pathname==='/api/index'){
  const mode=u.searchParams.get('mode');
  if(mode==='health')return respond(res,200,{ok:true,ready:true,configured:true,workerReady:true,submissionsOpen:true,databaseConnected:true});
  if(mode==='brand')return respond(res,200,{ok:true,branding:state.brand});
  if(mode==='status')return respond(res,200,{ok:true,status:state.status,id:fakeId});
  if(mode==='submit' && req.method==='POST'){
   state.posts++;return respond(res,200,{ok:true,id:fakeId,receipt,nextAllowedAt:new Date(Date.now()+12*3600e3).toISOString(),status:'pending'});
  }
  if(mode==='admin'){
   if(req.headers.authorization!=='Bearer test-owner-token')return respond(res,401,{error:'Unauthorized'});
   if(req.method==='GET'&&u.searchParams.get('action')==='brand')return respond(res,200,{ok:true,branding:state.brand});
   if(req.method==='GET')return respond(res,200,{ok:true,submissions:[]});
   if(req.method==='POST'){
    let data='';for await(const part of req)data+=part;
    const body=JSON.parse(data||'{}');
    if(body.action==='saveBrand'){state.saved=body.branding;state.brand=body.branding;return respond(res,200,{ok:true,branding:body.branding});}
   }
  }
  return respond(res,404,{error:'No test handler'});
 }
 let requested=u.pathname==='/'?'/index.html':u.pathname;
 if(requested==='/admin')requested='/admin.html';
 const full=path.resolve(webroot,'.'+requested);
 if(!full.startsWith(webroot+path.sep))return respond(res,403,{error:'Forbidden'});
 try {
  const data=await fs.readFile(full);
  res.writeHead(200,{'content-type':mime[path.extname(full)]||'application/octet-stream'});
  res.end(data);
 } catch {respond(res,404,{error:'Not found'});}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const root='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
await fs.mkdir(shotDir,{recursive:true});
test.after(async()=>{await browser.close();await new Promise(resolve=>server.close(resolve));});
async function pageFor(width=1440,height=900){
 const context=await browser.newContext({viewport:{width,height},reducedMotion:'reduce'});
 const page=await context.newPage();
 page.setDefaultTimeout(10000);
 await page.route('**/cdn.jsdelivr.net/**',async route=>{
  const bytes=await fs.readFile(gsapFile);
  await route.fulfill({status:200,body:bytes,contentType:'text/javascript'});
 });
 await page.route('**/fonts.googleapis.com/**',route=>route.abort());
 await page.route('**/fonts.gstatic.com/**',route=>route.abort());
 const errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 return {page,context,errors};
}
const waitReady=page=>page.waitForFunction(()=>document.querySelector('#send')?.disabled===false,{timeout:10000});
test('public UI: no overflow, real images and accessible controls at four breakpoints',async()=>{
 for(const width of [375,768,1024,1440]){
  const {page,context,errors}=await pageFor(width);
  await page.goto(root+'/',{waitUntil:'domcontentloaded'});
  await page.waitForSelector('#siteLogo');
  await waitReady(page);
  const info=await page.evaluate(()=>{
   const ids=['.topbar','.intro.axhk-hero','.layout','.site-footer'];
   return {
    overflow:document.documentElement.scrollWidth>innerWidth+3,
    bad:ids.filter(id=>{const e=document.querySelector(id);if(!e)return true;const r=e.getBoundingClientRect();return r.right>innerWidth+4 || r.left < -4;}),
    logo:document.getElementById('siteLogo').naturalWidth>0,
    hero:document.getElementById('heroImage').naturalWidth>0,
    visibleContact:!!document.getElementById('contactWidget')
   };
  });
  assert.equal(info.overflow,false,'Horizontal overflow at '+width);
  assert.deepEqual(info.bad,[],'Offscreen sections at '+width);
  assert.equal(info.logo,true,'Missing logo at '+width);
  assert.equal(info.hero,true,'Missing hero image at '+width);
  assert.equal(info.visibleContact,true);
  assert.deepEqual(errors,[],'Client errors at '+width);
  if(width===375||width===1440)await page.screenshot({path:path.join(shotDir,'public-'+width+'.png'),fullPage:true});
  await context.close();
 }
});
test('theme toggle and mobile navigation work with keyboard',async()=>{
 const {page,context,errors}=await pageFor(375,812);
 await page.goto(root+'/',{waitUntil:'domcontentloaded'});
 await waitReady(page);
 const before=await page.locator('html').getAttribute('data-theme');
 await page.locator('#themeToggle').click();
 assert.notEqual(await page.locator('html').getAttribute('data-theme'),before);
 await page.locator('#mobileMenuToggle').click();
 assert.equal(await page.locator('#mobileMenuToggle').getAttribute('aria-expanded'),'true');
 await page.keyboard.press('Escape');
 assert.equal(await page.locator('#mobileMenuToggle').getAttribute('aria-expanded'),'false');
 assert.deepEqual(errors,[]);
 await context.close();
});
test('submit form validates and the Channel button appears only after a verified post',async()=>{
 state.status='pending';state.posts=0;
 const {page,context,errors}=await pageFor(375,812);
 await page.goto(root+'/',{waitUntil:'domcontentloaded'});
 await waitReady(page);
 await page.locator('#link').fill('https://example.com/fake');
 await page.locator('#send').click();
 assert.match(await page.locator('#message').innerText(),/valid official WhatsApp/i);
 assert.equal(state.posts,0);
 await page.locator('#link').fill('https://chat.whatsapp.com/ABC123456789012345');
 await page.locator('#send').click();
 await page.locator('#submitted:not(.hidden)').waitFor();
 assert.equal(await page.locator('#visitChannel').isVisible(),false);
 state.status='posted';
 await page.waitForFunction(()=>{const x=document.querySelector('#visitChannel');return !!x&&!x.classList.contains('hidden')},{timeout:14000});
 assert.equal(await page.locator('#visitChannel').isVisible(),true);
 assert.equal(state.posts,1);
 assert.deepEqual(errors,[]);
 await page.screenshot({path:path.join(shotDir,'submitted-posted.png'),fullPage:true});
 await context.close();
});
test('admin studio allows owner to edit, preview and persist layout and visibility controls',async()=>{
 const {page,context,errors}=await pageFor(1440,900);
 await page.goto(root+'/admin.html',{waitUntil:'domcontentloaded'});
 await page.locator('#token').fill('test-owner-token');
 await page.locator('#load').click();
 await page.locator('#brandSave:not([disabled])').waitFor();
 await page.getByRole('tab',{name:'Theme & motion'}).click();
 for(const [name,value] of [['siteWidth','wide'],['heroScale','statement'],['sectionDensity','cinematic']]){
  await page.locator('#field-'+name).selectOption(value);
 }
 for(const key of ['showContactWidget','showFounder','showCommunity','showHeroVisual']){
  await page.locator('#field-'+key).uncheck();
 }
 await page.locator('#brandSave').click();
 await page.waitForFunction(()=>document.querySelector('#brandStatus')?.textContent?.includes('saved'));
 assert.equal(state.saved.siteWidth,'wide');
 assert.equal(state.saved.heroScale,'statement');
 assert.equal(state.saved.sectionDensity,'cinematic');
 assert.equal(state.saved.showContactWidget,false);
 assert.equal(state.saved.showFounder,false);
 await page.screenshot({path:path.join(shotDir,'admin-editor.png'),fullPage:true});
 await page.goto(root+'/',{waitUntil:'domcontentloaded'});
 await waitReady(page);
 await page.waitForFunction(()=>document.documentElement.dataset.siteWidth==='wide');
 assert.equal(await page.locator('#contactWidget').isVisible(),false);
 assert.equal(await page.locator('.axhk-founder').isVisible(),false);
 assert.equal(await page.locator('.community-band').isVisible(),false);
 assert.equal(await page.locator('.hero-visual').isVisible(),false);
 assert.deepEqual(errors,[]);
 await context.close();
});
