import { readFileSync } from 'node:fs';
import { registerCommand } from '../../lib/core/registry.js';
import { config } from '../../lib/config.js';
import { PLATFORM_DOMAINS, cleanupDownloadedMedia, downloadPublicMedia, downloadSearchMedia, downloaderInfo } from '../../lib/services/media-downloader.js';

const MEDIA_CONFIG_URL = new URL('../../.media.json', import.meta.url);
const ALLOWED_MEDIA_PLATFORMS = new Set(['download', ...Object.keys(PLATFORM_DOMAINS)]);

function loadMediaSpecs() {
  const data = JSON.parse(readFileSync(MEDIA_CONFIG_URL, 'utf8'));
  if (data?.schemaVersion !== 1 || !Array.isArray(data?.commands)) {
    throw new Error('Invalid .media.json: expected schemaVersion 1 and a commands array.');
  }
  const usedKeys = new Set();
  const rows = [];
  for (const row of data.commands) {
    if (row?.enabled === false) continue;
    const name = String(row?.name || '').trim().toLowerCase();
    const aliases = Array.isArray(row?.aliases) ? row.aliases.map((v) => String(v || '').trim().toLowerCase()).filter(Boolean) : [];
    const platform = String(row?.platform || '').trim().toLowerCase();
    const description = String(row?.description || '').trim() || `Download public ${platform || 'media'}`;
    const usage = String(row?.usage || '').trim() || `${name} <public URL>`;
    const cooldown = Math.max(0, Math.min(120, Number(row?.cooldown ?? 8) || 8));
    if (!/^[a-z0-9][a-z0-9_-]*$/.test(name)) throw new Error(`Invalid .media.json command name: ${name || '(blank)'}`);
    if (!ALLOWED_MEDIA_PLATFORMS.has(platform)) throw new Error(`Invalid .media.json platform for ${name}: ${platform || '(blank)'}`);
    for (const key of [name, ...aliases]) {
      if (!/^[a-z0-9][a-z0-9_-]*$/.test(key)) throw new Error(`Invalid .media.json command/alias key: ${key}`);
      if (usedKeys.has(key)) throw new Error(`Duplicate .media.json command/alias key: ${key}`);
      usedKeys.add(key);
    }
    rows.push({ name, aliases, platform, description, usage, cooldown });
  }
  if (!rows.length) throw new Error('Invalid .media.json: no enabled media commands.');
  return rows;
}

const mediaSpecs = loadMediaSpecs();

function prettyPlatform(name) {
  return ({ twitter: 'X / Twitter', youtube: 'YouTube', tiktok: 'TikTok', instagram: 'Instagram', facebook: 'Facebook', soundcloud: 'SoundCloud', dailymotion: 'Dailymotion', bilibili: 'Bilibili', bandcamp: 'Bandcamp' })[name] || name[0].toUpperCase() + name.slice(1);
}

function compact(value, max = 120) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function titleFromFileName(name) {
  return compact(String(name || '').replace(/\.[a-z0-9]+$/i, '').replace(/[-_][A-Za-z0-9_-]{6,}$/g, '').replace(/[_]+/g, ' '), 120);
}

function durationText(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds || 0)));
  if (!total) return '—';
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

function fileSize(bytes) {
  const n = Number(bytes || 0);
  if (!n) return '—';
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

function mediaCaption(item, label) {
  const title = compact(item?.title || titleFromFileName(item?.fileName) || label, 120);
  const source = compact(item?.uploader || label, 70);
  return [
    `╭━━━〔 ${item?.kind === 'audio' ? '🎧' : '⬇️'} A-X-HK DOWNLOAD 〕━━━╮`,
    `┃ 🎵 TITLE   ${title}`,
    source ? `┃ 📡 SOURCE  ${source}` : '',
    `┃ ⏱️ TIME    ${durationText(item?.duration)}`,
    `┃ 💾 SIZE    ${fileSize(item?.bytes)}`,
    '╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
    '',
    '© POWERED BY ABDULLAH-X-HACKER.'
  ].filter(Boolean).join('\n');
}

function mediaContext(item, label) {
  const preview = {
    title: compact(item?.title || titleFromFileName(item?.fileName) || label, 70),
    body: compact(item?.uploader || label, 80),
    mediaType: 1,
    showAdAttribution: false
  };
  if (/^https?:\/\//i.test(item?.webpageUrl || '')) preview.sourceUrl = item.webpageUrl;
  if (/^https?:\/\//i.test(item?.thumbnail || '')) preview.thumbnailUrl = item.thumbnail;
  return { externalAdReply: preview };
}

async function react(ctx, emoji) {
  try { await ctx.sock.sendMessage(ctx.chat, { react: { text: emoji, key: ctx.msg.key } }); } catch {}
}

async function sendDownloaded(ctx, item, platform) {
  const label = prettyPlatform(platform === 'download' ? item.platform || 'Media' : platform);
  const caption = mediaCaption(item, label);
  const contextInfo = mediaContext(item, label);
  if (item.kind === 'video') {
    return ctx.send({ video: { url: item.filePath }, mimetype: item.mimetype, fileName: item.fileName, caption, contextInfo }, { quoted: ctx.msg });
  }
  if (item.kind === 'audio') {
    await ctx.reply(caption);
    return ctx.send({ audio: { url: item.filePath }, mimetype: item.mimetype, fileName: item.fileName, ptt: false, contextInfo }, { quoted: ctx.msg });
  }
  if (item.kind === 'image') {
    return ctx.send({ image: { url: item.filePath }, mimetype: item.mimetype, caption }, { quoted: ctx.msg });
  }
  return ctx.send({ document: { url: item.filePath }, mimetype: item.mimetype, fileName: item.fileName, caption }, { quoted: ctx.msg });
}

async function runDownloader(ctx, platform) {
  const url = String(ctx.argText || '').trim();
  if (!url) return ctx.reply(platform === 'youtube' ? `Usage: ${ctx.prefix}${ctx.command.name} <YouTube URL or search words>` : `Usage: ${ctx.prefix}${ctx.command.name} https://...`);
  await react(ctx, '⬇️');
  let item;
  try {
    item = platform === 'youtube' && !/^https?:\/\//i.test(url)
      ? await downloadSearchMedia(url, { kind: 'video' })
      : await downloadPublicMedia(url, { platform });
    await sendDownloaded(ctx, item, platform);
    await react(ctx, '✅');
  } finally {
    if (item) await cleanupDownloadedMedia(item);
  }
}

for (const spec of mediaSpecs) {
  registerCommand({
    name: spec.name, aliases: spec.aliases, category: 'download', description: spec.description, usage: spec.usage, cooldown: spec.cooldown,
    async run(ctx) { await runDownloader(ctx, spec.platform); }
  });
}

registerCommand({
  name: 'downloaders', aliases: ['dlmenu', 'downloaderinfo'], category: 'download', description: 'Show A-X-HK public-media downloader commands', cooldown: 2,
  async run(ctx) {
    const info = downloaderInfo();
    await ctx.reply([
      `⬇️ ${config.shortName} MEDIA DOWNLOADERS`,
      '',
      ...mediaSpecs.map((spec) => `${ctx.prefix}${spec.usage}`),
      `${ctx.prefix}googlevideo <query or public URL>`,
      '',
      `Engine: ${info.engine} ${info.version}`,
      'Public media only • private/paywalled/DRM media is not supported',
      'Downloaded media is sent directly in chat; source links are not echoed.'
    ].join('\n'));
  }
});
