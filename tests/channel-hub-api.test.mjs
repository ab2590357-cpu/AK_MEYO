import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../channel-hub/api/index.js';

async function run({ mode='health', method='GET', body={}, headers={} }={}){
  let output='',status=200,hs={};
  const req={query:{mode},method,body,headers:{host:'example.vercel.app',...headers},socket:{remoteAddress:'127.0.0.1'}};
  const res={setHeader(k,v){hs[k]=v},set statusCode(v){status=v},get statusCode(){return status},end(s){output=s}};
  await handler(req,res);
  return {status,headers:hs,body:JSON.parse(output)};
}
test('unconfigured health returns not ready',async()=>{
  const result=await run();assert.equal(result.status,200);assert.equal(result.body.ready,false);
});
test('unconfigured service refuses public submission and worker queue',async()=>{
  let a=await run({mode:'submit',method:'POST',body:{link:'https://chat.whatsapp.com/ABC123456789012345'}});
  assert.equal(a.status,503);
  a=await run({mode:'worker'});
  assert.equal(a.status,503);
});
test('unconfigured service cannot reveal admin submissions',async()=>{
  const x=await run({mode:'admin'});assert.equal(x.status,503);
});
