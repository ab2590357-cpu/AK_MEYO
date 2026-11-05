import test from 'node:test';
import assert from 'node:assert/strict';

// The smoke checks are side-effect-free; they must never touch WhatsApp.
process.env.AXHK_TERMUX_MODE = '1';
const {safeChannelJid,publishChannelMenu,channelMenuPostStatus,CHANNEL_URL} =
  await import('../lib/services/channel-menu.js');
const {normalizeMenuCard} = await import('../lib/services/menu-card.js');

test('only a numeric newsletter JID is a valid Channel destination', () => {
  assert.equal(safeChannelJid('123456789012345@newsletter'),'123456789012345@newsletter');
  assert.throws(() => safeChannelJid('https://whatsapp.com/channel/0029VbA4HK9LNSaApTeufD1F'));
  assert.throws(() => safeChannelJid('123@g.us'));
  assert.match(CHANNEL_URL,/^https:\/\/whatsapp.com\/channel\//);
});
test('non-owner cannot publish a Channel menu', async () => {
  await assert.rejects(()=>publishChannelMenu({isMasterOwnerAction:false,sessionId:'main'}),/Only Abdullah/);
  await assert.rejects(()=>publishChannelMenu({isMasterOwnerAction:true,sessionId:'public'}),/Only Abdullah/);
});
test('Termux accepts a JPEG unchanged and rejects incompatible PNG data',async()=>{
  const jpeg=Buffer.from([0xff,0xd8,0xff,0xe0,1,2,3,4,0xff,0xd9]);
  assert.deepEqual(await normalizeMenuCard(jpeg),jpeg);
  await assert.rejects(()=>normalizeMenuCard(Buffer.from([137,80,78,71,13,10,26,10])),/JPG\/JPEG/);
});
