// Server-only A-X-HK relay storage adapter.
// Exactly the restricted private KV keys used by the existing cloud panel.
const endpoint=String(process.env.AXHK_SUPABASE_RELAY_URL||"");
const secret=String(process.env.AXHK_SUPABASE_RELAY_TOKEN||"");
async function operation(action,fields={}){
 if(!/^https:\/\/[a-z0-9.-]+\.supabase\.co\/functions\/v1\/axhk-private-relay$/i.test(endpoint)||!secret)
  throw new Error("A-X-HK private Supabase relay is not configured");
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
 try{
  const r=await fetch(endpoint,{
   method:"POST",headers:{"content-type":"application/json","x-axhk-relay-token":secret},
   body:JSON.stringify({action,...fields}),cache:"no-store",signal:controller.signal
  });
  const body=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error("Supabase relay "+action+" failed (HTTP "+r.status+"): "+String(body.error||"unknown").slice(0,120));
  return body;
 }finally{clearTimeout(timer)}
}
export async function readJSON(path){
 const result=await operation("get",{path});
 return result.found?result.value:null;
}
export async function writeJSON(path,value,_options={}){
 await operation("put",{path,value});
 return {pathname:path};
}
export async function deleteJSON(path){
 await operation("del",{path});
}
export async function listJSON({prefix,limit=25}={}){
 const result=await operation("list",{prefix,limit});
 return {blobs:(result.paths||[]).map(pathname=>({pathname}))};
}
