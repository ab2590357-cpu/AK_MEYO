import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { Sticker, StickerTypes } from 'wa-sticker-formatter';
import { registerCommand } from '../../lib/core/registry.js';
import { db } from '../../lib/core/database.js';
import { config } from '../../lib/config.js';
import { logger } from '../../lib/core/logger.js';
import { contextInfo, unwrapMessage } from '../../lib/utils/message.js';

function quoted(ctx) { return contextInfo(ctx.msg)?.quotedMessage || null; }
function messageKind(message = {}) {
  const m = unwrapMessage(message);
  if (m.imageMessage) return { kind: 'image', node: m.imageMessage, mime: m.imageMessage.mimetype || 'image/jpeg' };
  if (m.videoMessage) return { kind: 'video', node: m.videoMessage, mime: m.videoMessage.mimetype || 'video/mp4' };
  if (m.stickerMessage) return { kind: 'sticker', node: m.stickerMessage, mime: m.stickerMessage.mimetype || 'image/webp' };
  if (m.documentMessage) return { kind: 'document', node: m.documentMessage, mime: m.documentMessage.mimetype || 'application/octet-stream', fileName: m.documentMessage.fileName || 'file' };
  return null;
}
async function mediaBuffer(ctx, accepted = []) {
  let target = ctx.msg;
  let info = messageKind(ctx.msg.message || {});
  const q = quoted(ctx);
  if ((!info || (accepted.length && !accepted.includes(info.kind))) && q) {
    target = { ...ctx.msg, message: q };
    info = messageKind(q);
  }
  if (!info || (accepted.length && !accepted.includes(info.kind))) throw new Error(`Reply/send supported media: ${accepted.join(', ')}.`);
  const buffer = await downloadMediaMessage(target, 'buffer', {}, { logger, reuploadRequest: ctx.sock.updateMediaMessage });
  if (!buffer) throw new Error('Media is unavailable.');
  return { buffer, info };
}
async function sharpLib() {
  try { return (await import('sharp')).default; } catch { throw new Error('Image engine is not installed yet. Run npm install once, then restart the bot.'); }
}
async function sendImage(ctx, buffer, caption) { await ctx.send({ image: buffer, caption: caption || undefined }, { quoted: ctx.msg }); }

registerCommand({
  name: 'stickerpack', aliases: ['setstickerpack'], category: 'media', ownerOnly: true, description: 'Set default sticker pack and author for this linked session', usage: 'stickerpack A-X-HK | ABDULLAH-X-HK',
  async run(ctx) {
    const [pack, author] = ctx.argText.split('|').map((x) => x.trim());
    if (!pack) return ctx.reply(`Usage: ${ctx.prefix}stickerpack Pack Name | Author`);
    ctx.sessionSettings.stickerPack = { pack: pack.slice(0, 80), author: (author || config.ownerName).slice(0, 80) };
    await db.save();
    await ctx.reply(`🎨 Sticker pack saved\nPack: ${ctx.sessionSettings.stickerPack.pack}\nAuthor: ${ctx.sessionSettings.stickerPack.author}`);
  }
});
registerCommand({ name: 'stickername', aliases: ['packname'], category: 'media', ownerOnly: true, description: 'Set only the default sticker pack name', usage: 'stickername A-X-HK', async run(ctx) { const pack=ctx.argText.trim(); if(!pack)return ctx.reply(`Usage: ${ctx.prefix}stickername Pack Name`); ctx.sessionSettings.stickerPack ||= {}; ctx.sessionSettings.stickerPack.pack=pack.slice(0,80); ctx.sessionSettings.stickerPack.author ||= config.ownerName; await db.save(); await ctx.reply(`Sticker pack name: ${ctx.sessionSettings.stickerPack.pack}`); } });

registerCommand({
  name: 'take', aliases: ['resticker'], category: 'media', description: 'Rebuild quoted sticker/image with your A-X-HK sticker metadata', usage: 'take [Pack | Author]', cooldown: 5,
  async run(ctx) {
    const { buffer } = await mediaBuffer(ctx, ['image','video','sticker']);
    if (buffer.length > 20 * 1024 * 1024) throw new Error('Media is larger than 20 MB.');
    const saved = ctx.sessionSettings.stickerPack || {};
    const [packArg, authorArg] = ctx.argText.split('|').map((x) => x.trim());
    const sticker = new Sticker(buffer, { pack: packArg || saved.pack || config.shortName, author: authorArg || saved.author || config.ownerName, type: StickerTypes.FULL, quality: 70 });
    await ctx.send({ sticker: await sticker.toBuffer() }, { quoted: ctx.msg });
  }
});

registerCommand({
  name: 'circle', aliases: ['circlesticker'], category: 'media', description: 'Create a cropped/circle-style sticker from an image', cooldown: 5,
  async run(ctx) {
    const { buffer } = await mediaBuffer(ctx, ['image']);
    const saved = ctx.sessionSettings.stickerPack || {};
    const type = StickerTypes.CIRCLE || StickerTypes.CROPPED || StickerTypes.FULL;
    const sticker = new Sticker(buffer, { pack: saved.pack || config.shortName, author: saved.author || config.ownerName, type, quality: 75 });
    await ctx.send({ sticker: await sticker.toBuffer() }, { quoted: ctx.msg });
  }
});

registerCommand({
  name: 'resize', category: 'media', description: 'Resize a quoted image', usage: 'resize 800x600', cooldown: 4,
  async run(ctx) {
    const { buffer } = await mediaBuffer(ctx, ['image']); const sharp = await sharpLib();
    const m = String(ctx.args[0] || '').match(/^(\d{2,4})(?:x(\d{2,4}))?$/i); if (!m) return ctx.reply(`Usage: ${ctx.prefix}resize 800x600`);
    const width=Math.min(4096,Number(m[1])), height=m[2]?Math.min(4096,Number(m[2])):null;
    const out=await sharp(buffer).resize({ width, height, fit:'inside', withoutEnlargement:true }).jpeg({ quality:88 }).toBuffer();
    await sendImage(ctx,out,`🖼️ Resized • ${width}${height?`x${height}`:''}`);
  }
});
registerCommand({
  name: 'compress', aliases: ['compressimage'], category: 'media', description: 'Compress a quoted image', usage: 'compress 70', cooldown: 4,
  async run(ctx) { const {buffer}=await mediaBuffer(ctx,['image']); const sharp=await sharpLib(); const q=Math.max(25,Math.min(95,Number(ctx.args[0])||70)); const out=await sharp(buffer).jpeg({quality:q,mozjpeg:true}).toBuffer(); await sendImage(ctx,out,`📦 Compressed • quality ${q}`); }
});
registerCommand({ name:'tojpg', category:'media', description:'Convert a quoted image to JPEG', async run(ctx){const {buffer}=await mediaBuffer(ctx,['image','sticker']);const sharp=await sharpLib();const out=await sharp(buffer).jpeg({quality:92}).toBuffer();await sendImage(ctx,out,'JPEG • A-X-HK');} });
registerCommand({ name:'topng', category:'media', description:'Convert a quoted image/sticker to PNG', async run(ctx){const {buffer}=await mediaBuffer(ctx,['image','sticker']);const sharp=await sharpLib();const out=await sharp(buffer).png({compressionLevel:8}).toBuffer();await sendImage(ctx,out,'PNG • A-X-HK');} });
registerCommand({ name:'blur', category:'media', description:'Blur a quoted image', usage:'blur 8', async run(ctx){const {buffer}=await mediaBuffer(ctx,['image']);const sharp=await sharpLib();const sigma=Math.max(.3,Math.min(20,Number(ctx.args[0])||6));const out=await sharp(buffer).blur(sigma).jpeg({quality:90}).toBuffer();await sendImage(ctx,out,`Blur ${sigma}`);} });
registerCommand({ name:'grayscale', aliases:['greyscale','bw'], category:'media', description:'Convert a quoted image to grayscale', async run(ctx){const {buffer}=await mediaBuffer(ctx,['image']);const sharp=await sharpLib();const out=await sharp(buffer).grayscale().jpeg({quality:90}).toBuffer();await sendImage(ctx,out,'Grayscale • A-X-HK');} });

registerCommand({
  name:'readqr', aliases:['scanqr'], category:'utility', description:'Read a QR code from a quoted image', cooldown:4,
  async run(ctx){
    const {buffer}=await mediaBuffer(ctx,['image']); const sharp=await sharpLib();
    let jsQR; try { jsQR=(await import('jsqr')).default; } catch { throw new Error('QR reader dependency is not installed. Run npm install once.'); }
    const {data,info}=await sharp(buffer).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    const result=jsQR(new Uint8ClampedArray(data.buffer,data.byteOffset,data.byteLength),info.width,info.height);
    await ctx.reply(result?.data ? `🔎 *QR RESULT*\n\n${String(result.data).slice(0,3900)}` : 'No readable QR code was found in that image.');
  }
});

registerCommand({
  name:'txt', aliases:['totxt'], category:'document', description:'Send supplied text as a .txt document', usage:'txt hello world',
  async run(ctx){const text=ctx.argText.trim();if(!text)return ctx.reply(`Usage: ${ctx.prefix}txt your text`);await ctx.send({document:Buffer.from(text,'utf8'),mimetype:'text/plain',fileName:'A-X-HK.txt'},{quoted:ctx.msg});}
});
registerCommand({
  name:'pdf', aliases:['texttopdf'], category:'document', description:'Turn supplied text into a simple PDF document', usage:'pdf your text', cooldown:5,
  async run(ctx){
    const text=ctx.argText.trim();if(!text)return ctx.reply(`Usage: ${ctx.prefix}pdf your text`);
    let PDFDocument,StandardFonts,rgb; try{({PDFDocument,StandardFonts,rgb}=await import('pdf-lib'));}catch{throw new Error('PDF engine is not installed yet. Run npm install once.');}
    const doc=await PDFDocument.create();const font=await doc.embedFont(StandardFonts.Helvetica);let page=doc.addPage([595,842]);let y=800;
    const words=text.replace(/\r/g,'').split(/\s+/);let line='';const lines=[];for(const w of words){const next=(line?line+' ':'')+w;if(font.widthOfTextAtSize(next,12)>515){lines.push(line);line=w;}else line=next;}if(line)lines.push(line);
    for(const l of lines.slice(0,500)){if(y<50){page=doc.addPage([595,842]);y=800;}page.drawText(l,{x:40,y,size:12,font,color:rgb(0.08,0.08,0.08)});y-=18;}
    const bytes=Buffer.from(await doc.save());await ctx.send({document:bytes,mimetype:'application/pdf',fileName:'A-X-HK-document.pdf'},{quoted:ctx.msg});
  }
});
registerCommand({
  name:'imgtopdf', aliases:['imagepdf'], category:'document', description:'Convert a quoted image to PDF', cooldown:5,
  async run(ctx){
    const {buffer,info}=await mediaBuffer(ctx,['image']); let PDFDocument;try{({PDFDocument}=await import('pdf-lib'));}catch{throw new Error('PDF engine is not installed yet.');}
    const doc=await PDFDocument.create();let img;try{img=info.mime.includes('png')?await doc.embedPng(buffer):await doc.embedJpg(buffer);}catch{const sharp=await sharpLib();img=await doc.embedJpg(await sharp(buffer).jpeg().toBuffer());}
    const maxW=560,maxH=800,scale=Math.min(maxW/img.width,maxH/img.height,1);const w=img.width*scale,h=img.height*scale;const page=doc.addPage([w+35,h+35]);page.drawImage(img,{x:17.5,y:17.5,width:w,height:h});const bytes=Buffer.from(await doc.save());await ctx.send({document:bytes,mimetype:'application/pdf',fileName:'A-X-HK-image.pdf'},{quoted:ctx.msg});
  }
});
registerCommand({
  name:'pdftoimg', aliases:['pdfimage'], category:'document', description:'Render up to 3 pages of a quoted PDF into images', cooldown:10,
  async run(ctx){
    const {buffer,info}=await mediaBuffer(ctx,['document']); if(!String(info.mime).includes('pdf')&&!String(info.fileName||'').toLowerCase().endsWith('.pdf'))throw new Error('Reply to a PDF document.'); if(buffer.length>20*1024*1024)throw new Error('PDF is larger than 20 MB.');
    let pdfjs,createCanvas;try{pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');({createCanvas}=await import('@napi-rs/canvas'));}catch{throw new Error('PDF renderer is not installed yet. Run npm install once.');}
    const task=pdfjs.getDocument({data:new Uint8Array(buffer),disableWorker:true});const pdf=await task.promise;const pages=Math.min(3,pdf.numPages);
    for(let n=1;n<=pages;n++){const p=await pdf.getPage(n);const viewport=p.getViewport({scale:1.5});const canvas=createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height));const context=canvas.getContext('2d');await p.render({canvasContext:context,viewport}).promise;const out=canvas.toBuffer('image/png');await ctx.send({image:out,caption:`PDF page ${n}/${pdf.numPages}`});}
    if(pdf.numPages>pages)await ctx.reply(`Rendered first ${pages} pages. PDF has ${pdf.numPages} pages.`);
  }
});
