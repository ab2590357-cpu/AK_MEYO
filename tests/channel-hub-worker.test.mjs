import test from 'node:test';
import assert from 'node:assert/strict';
import { createChannelHubWorker, normalizeChannelJid } from '../lib/services/channel-hub-worker.js';

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
