// Polls the cloud queue using outgoing HTTPS requests: no public tunnel is required.
// Explicitly opt in with CHANNEL_HUB_ENABLED=true. Never auto-retry ambiguous sends.
import { logger } from '../core/logger.js';
import { channelMenuPostStatus } from './channel-menu.js';

const DEFAULT_INTERVAL_MS = 8_000;
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
    const res = await fetcher(requestUrl, {
      method, signal: controller.signal,
      headers: { Authorization: 'Bearer ' + process.env.CHANNEL_HUB_WORKER_TOKEN, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    if (!res.ok) throw new Error('Channel Hub API returned HTTP ' + res.status);
    return res.json();
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
      let jid;
      if (process.env.CHANNEL_HUB_CHANNEL_JID) {
        jid = normalizeChannelJid(process.env.CHANNEL_HUB_CHANNEL_JID);
      } else {
        const invite = process.env.CHANNEL_HUB_INVITE_CODE;
        if (!/^[A-Za-z0-9]{8,80}$/.test(invite || '')) throw new Error('Invalid Channel invite code');
        if (typeof sock.newsletterMetadata !== 'function') throw new Error('Baileys does not support newsletterMetadata');
        const meta = await sock.newsletterMetadata('invite', invite);
        jid = normalizeChannelJid(meta?.id || meta?.jid);
      }
      const verified = source?.jid === jid && Boolean(source?.messageId);
      await request('POST',{channelJid:jid,verified},fetcher,'heartbeat');
      if (!verified) return;
      const out = await request('GET', undefined, fetcher);
      item = out.item;
      if (!item) return;
      if (!['group', 'channel'].includes(item.kind) || !/^https:\/\/(?:chat\.whatsapp\.com\/|whatsapp\.com\/channel\/)[A-Za-z0-9]+$/.test(item.link))
        throw new Error('Submission failed link validation on worker');
      const intro = item.kind === 'group' ? '📢 WhatsApp Group' : '📣 WhatsApp Channel';
      // Baileys Channel support is unofficial. Test with an admin-owned test channel first.
      const result = await sock.sendMessage(jid, { text: intro + '\n\n' + item.link });
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
  function stop() { stopped = true; if (timer) clearInterval(timer); timer = null; }
  return { start, stop, tick };
}
