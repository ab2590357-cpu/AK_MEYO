// Share an authentic menu announcement from the owner's own WhatsApp Channel.
// No fake forwarded metadata is constructed: forward only the real WAMessage
// returned by WhatsApp after a deliberate owner-only publish operation.
import fs from 'node:fs/promises';
import path from 'node:path';
import { proto } from '@whiskeysockets/baileys';
import { config } from '../config.js';
import { readMenuCard } from './menu-card.js';
import { logger } from '../core/logger.js';

const STORE = path.join(config.dataDir, 'channel-menu-post.bin');
const DEFAULT_INVITE_CODE = '0029VbA4HK9LNSaApTeufD1F';
export const CHANNEL_URL = 'https://whatsapp.com/channel/' + DEFAULT_INVITE_CODE;

export function safeChannelJid(value) {
  const jid = String(value || '');
  if (!/^[0-9]{10,30}@newsletter$/.test(jid)) throw new Error('Channel ID was not recognized by WhatsApp');
  return jid;
}

export async function ownedChannelJid(sock) {
  if (process.env.CHANNEL_HUB_CHANNEL_JID) return safeChannelJid(process.env.CHANNEL_HUB_CHANNEL_JID);
  if (typeof sock?.newsletterMetadata !== 'function') throw new Error('This WhatsApp connection cannot resolve Channel details');
  const code = process.env.CHANNEL_HUB_INVITE_CODE || DEFAULT_INVITE_CODE;
  if (!/^[A-Za-z0-9]{8,80}$/.test(code)) throw new Error('Invalid Channel invite');
  const data = await sock.newsletterMetadata('invite', code);
  return safeChannelJid(data?.id || data?.jid);
}

export async function publishChannelMenu(ctx) {
  if (!ctx.isMasterOwnerAction || ctx.sessionId !== 'main')
    throw new Error('Only Abdullah can publish the menu to the owned Channel');
  if (!ctx.sock?.user) throw new Error('WhatsApp account is not connected');
  const jid = await ownedChannelJid(ctx.sock);
  const old = await channelMenuPostStatus();
  if (old && Date.now() - old.createdAt < 60 * 60 * 1000)
    throw new Error('Menu already published recently. Wait an hour before publishing again.');
  const {buffer} = await readMenuCard();
  const caption = [
    '👑 *ABDULLAH-X-MD | A-X-HK*',
    '📚 *Official WhatsApp Bot Command Menu*',
    '🤖 Type *.menu* or *.menu all* in a chat with the bot to see available commands.',
    '',
    '📣 *Official Channel*',
    CHANNEL_URL
  ].join('\n');
  // Publishing is done only on explicit owner's command. It should NEVER
  // happen automatically as a side effect of viewers requesting .menu.
  const posted = await ctx.sock.sendMessage(jid, { image: buffer, caption });
  if (!posted?.key?.id || posted?.key?.remoteJid !== jid)
    throw new Error('WhatsApp did not return the owned Channel message confirmation; check the Channel before retrying');
  const bytes = Buffer.from(proto.WebMessageInfo.encode(posted).finish());
  await fs.mkdir(config.dataDir, {recursive:true});
  const tmp = STORE + '.tmp';
  await fs.writeFile(tmp, bytes, {mode:0o600});
  await fs.rename(tmp, STORE);
  logger.info({channel:jid, messageId:posted.key.id}, 'Owned Channel menu published and saved for genuine forwarding');
  return {jid, messageId:posted.key.id};
}

export async function channelMenuPostStatus() {
  try {
    const stat = await fs.stat(STORE);
    const bytes = await fs.readFile(STORE);
    const decoded = proto.WebMessageInfo.decode(bytes);
    const jid = safeChannelJid(decoded?.key?.remoteJid);
    if (!decoded.message || !decoded.key?.id) return null;
    return {jid, createdAt:stat.mtimeMs, messageId:decoded.key.id, message:decoded};
  } catch (err) {
    if (err?.code !== 'ENOENT') logger.warn({err}, 'Stored Channel menu post could not be read');
    return null;
  }
}

export async function forwardChannelMenu(ctx) {
  if (ctx.sessionId !== 'main') return false;
  const stored = await channelMenuPostStatus();
  if (!stored) return false;
  try {
    const jid = await ownedChannelJid(ctx.sock);
    if (stored.jid !== jid) return false;
    await ctx.sock.sendMessage(ctx.chat, {forward:stored.message, force:true});
    return true;
  } catch (err) {
    logger.warn({err}, 'Authentic Channel post could not be forwarded; using standard image + Channel link fallback');
    return false;
  }
}

export async function disableChannelMenuForward() {
  try { await fs.rm(STORE); } catch(err) { if (err?.code !== 'ENOENT') throw err; }
}
