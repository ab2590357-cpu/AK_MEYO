import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { registerCommand } from '../../lib/core/registry.js';
import { db } from '../../lib/core/database.js';
import { config } from '../../lib/config.js';
import { logger } from '../../lib/core/logger.js';
import { contextInfo, unwrapMessage } from '../../lib/utils/message.js';

async function toggle(ctx, key, label) {
  const v = String(ctx.args[0] || '').toLowerCase();
  if (!['on','off'].includes(v)) return ctx.reply(`Usage: ${ctx.prefix}${ctx.command.name} on|off`);
  ctx.groupSettings[key] = v === 'on';
  await db.save();
  await ctx.reply(`${label}: ${v.toUpperCase()}`);
}

registerCommand({ name:'antispam', category:'group', groupOnly:true, adminOnly:true, description:'Toggle group command spam protection', usage:'antispam on|off', async run(ctx){ await toggle(ctx,'antiSpam','Anti-spam'); } });
registerCommand({ name:'antiflood', category:'group', groupOnly:true, adminOnly:true, description:'Toggle group flood-rate protection', usage:'antiflood on|off', async run(ctx){ await toggle(ctx,'antiFlood','Anti-flood'); } });

function quotedImage(ctx) {
  const q = contextInfo(ctx.msg)?.quotedMessage;
  const m = unwrapMessage(q || {});
  return m.imageMessage ? q : null;
}
async function saveGroupImage(ctx, type) {
  const q = quotedImage(ctx);
  if (!q) return ctx.reply(`Reply to an image with ${ctx.prefix}${type}image.`);
  const target = { ...ctx.msg, message: q };
  const buffer = await downloadMediaMessage(target, 'buffer', {}, { logger, reuploadRequest: ctx.sock.updateMediaMessage });
  if (!buffer || buffer.length > 8 * 1024 * 1024) throw new Error('Image is unavailable or larger than 8 MB.');
  const root = path.join(config.dataDir, 'group-assets');
  await fs.mkdir(root, { recursive: true });
  const id = crypto.createHash('sha256').update(`${ctx.sessionId}:${ctx.chat}:${type}`).digest('hex').slice(0,24);
  const file = path.join(root, `${id}.jpg`);
  await fs.writeFile(file, buffer);
  ctx.groupSettings[`${type}Image`] = file;
  await db.save();
  await ctx.reply(`${type === 'welcome' ? '✨ Welcome' : '👋 Goodbye'} image saved for this group.`);
}

registerCommand({ name:'welcomeimage', aliases:['setwelcomeimage'], category:'group', groupOnly:true, adminOnly:true, description:'Set a welcome image by replying to an image', async run(ctx){ await saveGroupImage(ctx,'welcome'); } });
registerCommand({ name:'goodbyeimage', aliases:['setgoodbyeimage'], category:'group', groupOnly:true, adminOnly:true, description:'Set a goodbye image by replying to an image', async run(ctx){ await saveGroupImage(ctx,'goodbye'); } });
registerCommand({ name:'clearwelcomeimage', category:'group', groupOnly:true, adminOnly:true, description:'Remove the saved welcome image', async run(ctx){const f=ctx.groupSettings.welcomeImage;ctx.groupSettings.welcomeImage='';await db.save();if(f)await fs.rm(f,{force:true}).catch(()=>{});await ctx.reply('Welcome image cleared.');} });
registerCommand({ name:'cleargoodbyeimage', category:'group', groupOnly:true, adminOnly:true, description:'Remove the saved goodbye image', async run(ctx){const f=ctx.groupSettings.goodbyeImage;ctx.groupSettings.goodbyeImage='';await db.save();if(f)await fs.rm(f,{force:true}).catch(()=>{});await ctx.reply('Goodbye image cleared.');} });

async function preview(ctx,type){
  const isWelcome=type==='welcome';
  const text=String(isWelcome?ctx.groupSettings.welcomeText:ctx.groupSettings.goodbyeText || '') || (isWelcome?'Welcome {user} to *{group}* 🎉':'Goodbye {user} from *{group}* 👋');
  const rendered=text.replaceAll('{user}',`@${ctx.sender.split('@')[0]}`).replaceAll('{group}',ctx.metadata?.subject||'Group').replaceAll('{count}',String(ctx.metadata?.participants?.length||''));
  const file=ctx.groupSettings[`${type}Image`];
  if(file){try{const image=await fs.readFile(file);return ctx.send({image,caption:rendered,mentions:[ctx.sender]},{quoted:ctx.msg});}catch{}}
  return ctx.send({text:rendered,mentions:[ctx.sender]},{quoted:ctx.msg});
}
registerCommand({ name:'welcomepreview', category:'group', groupOnly:true, adminOnly:true, description:'Preview the current welcome design', async run(ctx){await preview(ctx,'welcome');} });
registerCommand({ name:'goodbyepreview', category:'group', groupOnly:true, adminOnly:true, description:'Preview the current goodbye design', async run(ctx){await preview(ctx,'goodbye');} });
