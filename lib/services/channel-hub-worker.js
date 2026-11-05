// Polls the cloud queue using outgoing HTTPS requests: no public tunnel is required.
// Explicitly opt in with CHANNEL_HUB_ENABLED=true. Never auto-retry ambiguous sends.
import { logger } from '../core/logger.js';
import { channelMenuPostStatus, ownedChannelJid } from './channel-menu.js';

const DEFAULT_INTERVAL_MS = 5_000;
export const LINK_HUB_WEBSITE = 'https://axhk-channel-link-hub.vercel.app/';

export function formatChannelLinkPost(item) {
  const kind = item?.kind;
  const link = String(item?.link || '');
  if (!['group', 'channel'].includes(kind) ||
      !/^https:\/\/(?:chat\.whatsapp\.com\/|whatsapp\.com\/channel\/)[A-Za-z0-9]+$/.test(link))
    throw new Error('Invalid WhatsApp Group or Channel invite link');
  const isGroup = kind === 'group';
  return [
    isGroup ? '📢 *WhatsApp Group*' : '📣 *WhatsApp Channel*',
    '',
    isGroup ? '🔗 *Group Invite Link*' : '🔗 *Channel Link*',
    link,
    '',
    '━━━━━━━━━━━━━━',
    '🌐 *A-X-HK Website*',
    LINK_HUB_WEBSITE,
    '✨ *Shared automatically via ABDULLAH X MD LINKS ZONE*'
  ].join('\n');
}
function isDnsError(error) {
  const code = error?.cause?.code || error?.code;
  return code === 'ENOTFOUND' || code === 'EAI_AGAIN';
}
export function normalizeChannelJid(value) {
  const jid = String(value || '').trim();
  if (!/^[0-9]{10,30}@newsletter$/.test(jid)) throw new Error('Set CHANNEL_HUB_CHANNEL_JID to a valid WhatsApp Channel JID, not a public invite link.');
  return jid;
}
function enabled() {
  return process.env.CHANNEL_HUB_ENABLED === 'true'
    && Boolean(process.env.CHANNEL_HUB_API_URL)
    && Boolean(process.env.CHANNEL_HUB_WORKER_TOKEN)
    && Boolean(process.env.CHANNEL_HUB_CHANNEL_JID || process.env.CHANNEL_HUB_INVITE_CODE);
}
function endpoint() {
  const url = new URL(process.env.CHANNEL_HUB_API_URL);
  if (url.protocol !== 'https:') throw new Error('CHANNEL_HUB_API_URL must be HTTPS');
  url.searchParams.set('mode', 'worker');
  return url;
}
async function request(method, body, fetcher, mode = 'worker') {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const requestUrl = endpoint();
    requestUrl.searchParams.set('mode', mode);
    const options = {
      method, signal: controller.signal,
      headers: { Authorization: 'Bearer ' + process.env.CHANNEL_HUB_WORKER_TOKEN, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    };
    // On mobile networks, DNS can temporarily fail even while WhatsApp is
    // connected. Retry only confirmed DNS failures: all other request errors
    // remain non-retriable to avoid ambiguous queue claims/acknowledgements.
    for (let attempt = 0; attempt < 2; attempt++) {
      let res;
      try { res = await fetcher(requestUrl, options); }
      catch (error) {
        if (attempt !== 0 || !isDnsError(error)) throw error;
        await new Promise(resolve => setTimeout(resolve, 650));
        continue;
      }
      if (!res.ok) throw new Error('Channel Hub API returned HTTP ' + res.status);
      return res.json();
    }
  } finally { clearTimeout(timeout); }
}
export function createChannelHubWorker({ getSocket, getState, fetcher = fetch, getChannelSource = channelMenuPostStatus, log = logger, intervalMs = DEFAULT_INTERVAL_MS }) {
  let timer = null, busy = false, stopped = false;
  const interval = Math.max(5000, Number(intervalMs) || DEFAULT_INTERVAL_MS);

  async function tick() {
    if (busy || stopped || !enabled()) return;
    const sock = getSocket();
    const connected = getState()?.status === 'connected' && Boolean(sock?.user);
    if (!connected) return;
    busy = true;
    let item;
    try {
      const source = await getChannelSource();
      // Only permit public posting after the owner has actually published the
      // menu to this specific WhatsApp Channel and the message is confirmed.
      const jid = normalizeChannelJid(await ownedChannelJid(sock));
      const verified = source?.jid === jid && Boolean(source?.messageId);
      await request('POST',{channelJid:jid,verified},fetcher,'heartbeat');
      if (!verified) return;
      const out = await request('GET', undefined, fetcher);
      item = out.item;
      if (!item) return;
      const text = formatChannelLinkPost(item);
      // Baileys Channel publishing is unofficial; only the owner-verified
      // Channel JID is used as destination, never any submitted invite URL.
      const result = await sock.sendMessage(jid, { text });
      if (result?.key?.remoteJid && result.key.remoteJid !== jid)
        throw new Error('WhatsApp returned a different Channel destination; check owner Channel manually');
      if (!result?.key?.id) throw new Error('WhatsApp did not confirm a message ID; manually verify Channel before retrying');
      try {
        await request('POST', { id: item.id, claimToken: item.claimToken, status: 'posted', messageId: result.key.id }, fetcher);
      } catch (ackError) {
        // Do not automatically resend; claim will become needs_review.
        log.warn({ err: ackError, submissionId: item.id }, 'Channel post sent but queue acknowledgement failed; manual review required');
      }
    } catch (error) {
      log.warn({ err: error, submissionId: item?.id }, 'Channel Link Hub worker error');
      if (item?.id && item?.claimToken) {
        try {
          await request('POST', { id: item.id, claimToken: item.claimToken, status: 'failed', error: String(error?.message || error).slice(0,240) }, fetcher);
        } catch (ackError) {
          log.warn({ err: ackError }, 'Failed to report Channel posting error');
        }
      }
    } finally {
      busy = false;
    }
  }
  function start() {
    if (!enabled()) { log.info('Channel Link Hub is disabled until configured'); return false; }
    if (process.env.CHANNEL_HUB_CHANNEL_JID) normalizeChannelJid(process.env.CHANNEL_HUB_CHANNEL_JID);
    else if (!/^[A-Za-z0-9]{8,80}$/.test(process.env.CHANNEL_HUB_INVITE_CODE || '')) throw new Error('Invalid Channel invite code');
    stopped = false;
    timer = setInterval(() => { tick().catch(err => log.warn({ err }, 'Channel Hub poll failed')); }, interval);
    timer.unref?.();
    tick().catch(err => log.warn({ err }, 'Initial Channel Hub poll failed'));
    log.info('Channel Link Hub worker started in opt-in mode');
    return true;
  }
  function stop() {
    stopped = true;
    if (timer) clearInterval(timer);
    timer = null;
  }
  return { start, stop, tick };
}
