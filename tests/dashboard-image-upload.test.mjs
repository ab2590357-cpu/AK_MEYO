import test from 'node:test';
import assert from 'node:assert/strict';

process.env.AXHK_TERMUX_MODE = '1';
const { inspectRasterImage } = await import('../lib/utils/image-assets.js');
const { readMenuCard, menuCardPreview, normalizeMenuCard } = await import('../lib/services/menu-card.js');
const { readLinkLogo, linkLogoPreview, normalizeLinkLogo } = await import('../lib/services/link-logo.js');

const png = Buffer.from([
  137,80,78,71,13,10,26,10, 0,0,0,13,73,72,68,82,
  0,0,0,64,0,0,0,64,8,6,0,0,0,0,0,0,0
]);

test('PNG is accepted for menu and link logo without native sharp',async()=>{
  assert.equal(inspectRasterImage(png).mime,'image/png');
  assert.deepEqual(await normalizeMenuCard(png),png);
  assert.deepEqual(await normalizeLinkLogo(png),png);
});

test('invalid HTML and SVG payloads do not pass image validation',async()=>{
  assert.throws(()=>inspectRasterImage(Buffer.from('<html>broken image</html>')),/Unsupported/);
  assert.throws(()=>inspectRasterImage(Buffer.from('<svg xmlns="x">bad</svg>')),/Unsupported/);
});

test('Termux menu card preview reports correct image MIME',async()=>{
  const result=await menuCardPreview();
  assert.equal(result.mime,inspectRasterImage(result.buffer).mime);
  assert.ok(result.buffer.length>100);
});

test('Termux animated logo fallback resolves bundled files and correct MIME',async()=>{
  const read=await readLinkLogo();
  assert.ok(read.buffer.length>100);
  const result=await linkLogoPreview();
  assert.equal(result.mime,inspectRasterImage(result.buffer).mime);
});
