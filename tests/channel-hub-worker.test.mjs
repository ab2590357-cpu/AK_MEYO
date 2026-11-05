import test from 'node:test';
import assert from 'node:assert/strict';
import { createChannelHubWorker, normalizeChannelJid, formatChannelLinkPost, buildChannelLinkMessage, LINK_HUB_WEBSITE } from '../lib/services/channel-hub-worker.js';

test('Channel JID cannot be confused with invite URLs or groups', () => {
  assert.equal(normalizeChannelJid('123456789012345@newsletter'), '123456789012345@newsletter');
  assert.throws(() => normalizeChannelJid('https://whatsapp.com/channel/123456789012'), /JID/);
  assert.throws(() => normalizeChannelJid('12345@g.us'), /JID/);
});
test('worker never claims queue unless linked owner WhatsApp is connected', async () => {
  const old = { ...process.env };
  Object.assign(process.env, {
    CHANNEL_HUB_ENABLED: 'true',
    CHANNEL_HUB_API_URL: 'https://example.vercel.app/api/index',
    CHANNEL_HUB_WORKER_TOKEN: 'test-secret',
    CHANNEL_HUB_CHANNEL_JID: '123456789012345@newsletter'
  });
  let requests = 0;
  try {
    const worker = createChannelHubWorker({
      getSocket: () => null, getState: () => ({ status: 'offline' }),
      fetcher: async () => { requests++; throw new Error('Should not run'); },
      log: { warn() {}, info() {} }
    });
    await worker.tick();
    assert.equal(requests, 0);
    worker.stop();
  } finally { process.env = old; }
});
test('connected worker posts once, then confirms with claim ID', async () => {
  const old = { ...process.env };
  Object.assign(process.env, {
    CHANNEL_HUB_ENABLED: 'true', CHANNEL_HUB_API_URL: 'https://example.vercel.app/api/index',
    CHANNEL_HUB_WORKER_TOKEN: 'test-secret', CHANNEL_HUB_CHANNEL_JID: '123456789012345@newsletter'
  });
  const calls = [], sent = [];
  try {
    const worker = createChannelHubWorker({
      getSocket: () => ({ user: { id:'owner' }, sendMessage: async (to, msg) => { sent.push([to,msg]); return { key: { id: 'posted-message-123' } }; } }),
      getState: () => ({ status: 'connected' }),
      getChannelSource: async () => ({ jid: '123456789012345@newsletter', messageId: 'verified-test-post' }),
      fetcher: async (url, opts) => {
        calls.push({ mode: url.searchParams.get('mode'), method: opts.method, body: opts.body ? JSON.parse(opts.body) : null });
        return { ok: true, json: async () => opts.method === 'GET'
          ? { item: { id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', claimToken: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb', link: 'https://whatsapp.com/channel/ABC123456789', kind: 'channel' } }
          : { ok: true } };
      },
      log: { warn() {}, info() {} }
    });
    await worker.tick();
    assert.equal(sent.length, 1);
    assert.equal(sent[0][0], '123456789012345@newsletter');
    assert.match(sent[0][1].text, /whatsapp.com\/channel/);
    assert.equal(calls.length, 3);
    assert.equal(calls[0].mode, 'heartbeat');
    assert.deepEqual(calls[0].body,{channelJid:'123456789012345@newsletter',verified:true});
    assert.equal(calls[1].mode,'worker');
    assert.deepEqual(calls[2].body, { id:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',claimToken:'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',status:'posted',messageId:'posted-message-123' });
    worker.stop();
  } finally { process.env = old; }
});

test('worker refuses all queued posts until a verified original Channel post exists', async () => {
  const old = {...process.env};
  Object.assign(process.env, {
    CHANNEL_HUB_ENABLED:'true', CHANNEL_HUB_API_URL:'https://example.vercel.app/api/index',
    CHANNEL_HUB_WORKER_TOKEN:'test-secret', CHANNEL_HUB_CHANNEL_JID:'123456789012345@newsletter'
  });
  const calls=[];
  try {
    const worker=createChannelHubWorker({
      getSocket:()=>({user:{id:'owner'},sendMessage:async()=>{throw new Error('Must not post unverified')}}),
      getState:()=>({status:'connected'}),
      getChannelSource:async()=>null,
      fetcher:async(url,opts)=>{calls.push({mode:url.searchParams.get('mode'),body:JSON.parse(opts.body||'null')});return {ok:true,json:async()=>({ok:true})}},
      log:{warn(){},info(){}}
    });
    await worker.tick();
    assert.deepEqual(calls,[{mode:'heartbeat',body:{channelJid:'123456789012345@newsletter',verified:false}}]);
    worker.stop();
  } finally {process.env=old;}
});

test('published Group invite has Group heading and official website attribution',()=>{
  const text=formatChannelLinkPost({kind:'group',link:'https://chat.whatsapp.com/ABCDEFGHIJKLMNOPQRST'});
  assert.match(text,/WhatsApp Group/);
  assert.doesNotMatch(text,/WhatsApp Channel/);
  assert.match(text,/SUBMIT YOUR GROUP OR CHANNEL/);
  assert.ok(text.includes(LINK_HUB_WEBSITE));
  assert.match(text,/chat\.whatsapp\.com/);
});
test('published Channel invite has Channel heading and official website attribution',()=>{
  const text=formatChannelLinkPost({kind:'channel',link:'https://whatsapp.com/channel/0029VbA4HK9LNSaApTeufD1F'});
  assert.match(text,/WhatsApp Channel/);
  assert.doesNotMatch(text,/WhatsApp Group/);
  assert.match(text,/SUBMIT YOUR GROUP OR CHANNEL/);
  assert.ok(text.includes(LINK_HUB_WEBSITE));
  assert.throws(()=>formatChannelLinkPost({kind:'group',link:'https://evil.example/other'}));
});
test('temporary canonical hostname DNS error retries only on same-project Vercel fallback',async()=>{
  const old={...process.env};
  Object.assign(process.env,{
    CHANNEL_HUB_ENABLED:'true',
    CHANNEL_HUB_API_URL:'https://axhk-channel-link-hub.vercel.app/api/index',
    CHANNEL_HUB_WORKER_TOKEN:'test-secret',CHANNEL_HUB_CHANNEL_JID:'123456789012345@newsletter'
  });
  const visited=[];
  try{
    const worker=createChannelHubWorker({
      getSocket:()=>({user:{id:'owner'}}),
      getState:()=>({status:'connected'}),
      getChannelSource:async()=>({jid:'123456789012345@newsletter',messageId:'owner-channel-post'}),
      fetcher:async(url,opts)=>{
        visited.push(url.hostname);
        if(visited.length===1){const error=new Error('DNS resolution failed');error.cause={code:'ENOTFOUND'};throw error;}
        return {ok:true,json:async()=>opts.method==='GET'?{item:null}:{ok:true}};
      },
      log:{warn(){},info(){}}
    });
    await worker.tick();
    assert.deepEqual(visited.slice(0,2),[
      'axhk-channel-link-hub.vercel.app','axhk-channel-link-hub-abdulteam.vercel.app'
    ]);
    worker.stop();
  }finally{process.env=old;}
});

test('Group invite metadata creates a rich preview without joining the group',async()=>{
  let queried=0,joinCalled=false,images=0;
  const sock={
    groupGetInviteInfo:async(code)=>{queried++;assert.equal(code,'ABCDEFGHIJKLMNOPQRST');return {id:'1234567890@g.us',subject:'Our Test Community'};},
    groupAcceptInvite:()=>{joinCalled=true;throw new Error('Never auto-join');},
    profilePictureUrl:async()=>undefined
  };
  const msg=await buildChannelLinkMessage(sock,{kind:'group',link:'https://chat.whatsapp.com/ABCDEFGHIJKLMNOPQRST'},{
    imageFetcher:async()=>{images++;throw new Error('Unexpected image fetch');}
  });
  assert.equal(queried,1);
  assert.equal(joinCalled,false);
  assert.equal(images,0);
  assert.equal(msg.linkPreview.title,'Our Test Community');
  assert.equal(msg.linkPreview.description,'Group chat invite');
  assert.equal(msg.linkPreview['matched-text'],'https://chat.whatsapp.com/ABCDEFGHIJKLMNOPQRST');
  assert.match(msg.text,/Our Test Community/);
  assert.ok(msg.text.indexOf('https://chat.whatsapp.com') < msg.text.indexOf(LINK_HUB_WEBSITE));
});
test('Channel invite metadata gets a Channel preview, not a Group invite',async()=>{
  const msg=await buildChannelLinkMessage({
    newsletterMetadata:async()=>({id:'123456789012345@newsletter',name:'Our Channel'})
  },{kind:'channel',link:'https://whatsapp.com/channel/0029VbA4HK9LNSaApTeufD1F'});
  assert.equal(msg.linkPreview.title,'Our Channel');
  assert.equal(msg.linkPreview.description,'WhatsApp Channel');
  assert.match(msg.text,/Follow this WhatsApp Channel/);
});
test('unavailable metadata still publishes the original invite as one text message',async()=>{
  const link='https://chat.whatsapp.com/ABCDEFGHIJKLMNOPQRST';
  const msg=await buildChannelLinkMessage({
    groupGetInviteInfo:async()=>{throw new Error('Invite metadata unavailable');}
  },{kind:'group',link});
  assert.equal(msg.text.includes(link),true);
  assert.equal(msg.linkPreview,undefined);
  assert.equal(msg.text.includes(LINK_HUB_WEBSITE),true);
});
test('rejects incorrectly paired link types',()=>{
  assert.throws(()=>formatChannelLinkPost({kind:'group',link:'https://whatsapp.com/channel/0029VbA4HK9LNSaApTeufD1F'}));
  assert.throws(()=>formatChannelLinkPost({kind:'channel',link:'https://chat.whatsapp.com/ABCDEFGHIJKLMNOPQRST'}));
});

test('smart Group invitation preview uses WhatsApp metadata and no automatic joining',async()=>{
  const calls=[];
  const item={kind:'group',link:'https://chat.whatsapp.com/ABCDEFGHIJKLMNOPQRST'};
  const message=await buildChannelLinkMessage({
    groupGetInviteInfo:async code=>{calls.push(code);return {id:'123456789012345@g.us',subject:'Test Community'};},
    profilePictureUrl:async()=> 'https://pps.whatsapp.net/v/sample.jpg'
  },item,{
    imageFetcher:async()=>({ok:true,headers:{get:()=> '8'},arrayBuffer:async()=>new Uint8Array([255,216,255,224,0,0,0,0]).buffer})
  });
  assert.equal(calls.length,1);
  assert.equal(message.linkPreview.title,'Test Community');
  assert.equal(message.linkPreview.description,'Group chat invite');
  assert.equal(message.linkPreview.jpegThumbnail.length,8);
  assert.equal(message.text.split('\n')[0],item.link);
  assert.match(message.text,/A-X-HK Website|SUBMIT YOUR GROUP/);
});
test('Channel invitation preview resolves public name without joining',async()=>{
  const item={kind:'channel',link:'https://whatsapp.com/channel/0029VbA4HK9LNSaApTeufD1F'};
  const msg=await buildChannelLinkMessage({
    newsletterMetadata:async()=>({id:'123456789012345@newsletter',name:'Artist Channel'})
  },item);
  assert.equal(msg.linkPreview.title,'Artist Channel');
  assert.equal(msg.linkPreview.description,'WhatsApp Channel');
  assert.match(msg.text,/Follow this WhatsApp Channel/);
});
test('missing metadata falls back to single plain link message, never breaks queue',async()=>{
  const item={kind:'group',link:'https://chat.whatsapp.com/ABCDEFGHIJKLMNOPQRST'};
  const msg=await buildChannelLinkMessage({
    groupGetInviteInfo:async()=>{throw new Error('not a member')}
  },item);
  assert.equal(msg.linkPreview,undefined);
  assert.equal(msg.text.split('\n')[0],item.link);
  assert.match(msg.text,/A-X-HK Website|SUBMIT YOUR GROUP/);
});
