import test from 'node:test';
import assert from 'node:assert/strict';

// The smoke checks are side-effect-free; they must never touch WhatsApp.
process.env.AXHK_TERMUX_MODE = '1';
const {safeChannelJid,publishChannelMenu,channelMenuPostStatus,buildChannelMenuAnnouncement,isBrandedChannelMenuMessage,forwardChannelMenu,CHANNEL_URL} =
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
test('Termux accepts valid PNG menu and rejects incomplete pretend JPEG', async()=>{
  const png = Buffer.from([
    137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,
    0,0,0,64,0,0,0,64,8,6,0,0,0,0,0,0,0
  ]);
  assert.deepEqual(await normalizeMenuCard(png),png);
  const incomplete=Buffer.from([0xff,0xd8,0xff,0xe0,1,2,3,4,0xff,0xd9]);
  await assert.rejects(()=>normalizeMenuCard(incomplete),/valid JPG/);
});

test('genuine premium Channel menu caption stays inside media limits',()=>{
 const caption=buildChannelMenuAnnouncement({prefix:'.',categories:['ai','tools','utility','productivity','entertainment','media','owner','system','group','download','fun','games','settings','security','premium','profile','romantic','reaction','cute','emotion','actions','text','document','search','funny','funtext']});
 assert.ok(caption.length<1024);
 assert.match(caption,/A-X-HK PREMIUM MENU/);
 assert.match(caption,/\.menu all/);
 assert.match(caption,/\.alive/);
 assert.match(caption,/\.ping/);
 assert.match(caption,/whatsapp.com\/channel/);
});
test('only original image-and-caption menu update qualifies for native premium forward',()=>{
 const caption=buildChannelMenuAnnouncement();
 assert.equal(isBrandedChannelMenuMessage({message:{imageMessage:{caption}}}),true);
 assert.equal(isBrandedChannelMenuMessage({message:{extendedTextMessage:{text:caption}}}),false);
 assert.equal(isBrandedChannelMenuMessage({message:{imageMessage:{caption:'old caption'}}}),false);
});
test('premium forward does not send anything when owner session is absent',async()=>{
 let count=0;
 assert.equal(await forwardChannelMenu({sessionId:'linked',send:()=>{count++;},sock:{}}),false);
 assert.equal(count,0);
});

test('premium Channel announcement embeds main commands and categories under image caption limit',()=>{
  const caption=buildChannelMenuAnnouncement({prefix:'.',categories:['system','media','owner','group','tools','utility','download','ai','profile','reaction']});
  assert.match(caption,/A-X-HK PREMIUM MENU/);
  assert.match(caption,/\.menu all/);
  assert.match(caption,/\.alive/);
  assert.match(caption,/\.ping/);
  assert.match(caption,/\.channel/);
  assert.match(caption,/https:\/\/whatsapp\.com\/channel\//);
  assert.match(caption,/SYSTEM/);
  assert.ok(caption.length <= 1024);
});
test('native Channel-branded update must include image and correct caption marker',()=>{
  const caption=buildChannelMenuAnnouncement();
  assert.equal(isBrandedChannelMenuMessage({message:{imageMessage:{caption}}}),true);
  assert.equal(isBrandedChannelMenuMessage({message:{extendedTextMessage:{text:caption}}}),false);
  assert.equal(isBrandedChannelMenuMessage({message:{imageMessage:{caption:'random channel post'}}}),false);
});
test('linked multi-session does not forward owner Channel message',async()=>{
  let sends=0;
  const ok=await forwardChannelMenu({sessionId:'other',send:async()=>{sends++}});
  assert.equal(ok,false);
  assert.equal(sends,0);
});
