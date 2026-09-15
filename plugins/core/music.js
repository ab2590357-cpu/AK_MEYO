import { registerCommand } from '../../lib/core/registry.js';
import { cleanupDownloadedMedia, downloadPublicMedia, downloadSearchMedia } from '../../lib/services/media-downloader.js';

const ITUNES_SEARCH = 'https://itunes.apple.com/search';
const DEEZER_SEARCH = 'https://api.deezer.com/search';
const UA = 'A-X-HK-WhatsApp-Bot/4.2';
const CACHE_TTL = 5 * 60 * 1000;
const searchCache = new Map();

function text(value, max = 160) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function duration(msOrSeconds, seconds = false) {
  const total = Math.max(0, Math.round(seconds ? Number(msOrSeconds || 0) : Number(msOrSeconds || 0) / 1000));
  const m = Math.floor(total / 60);
  const s = String(total % 60).padStart(2, '0');
  return `${m}:${s}`;
}

function year(date) {
  const d = new Date(date || 0);
  return Number.isFinite(d.getTime()) && d.getUTCFullYear() > 1970 ? d.getUTCFullYear() : '—';
}

function safeFileName(value) {
  return text(value, 80).replace(/[\\/:*?"<>|]+/g, '').trim() || 'A-X-HK-media';
}

function isYouTubeUrl(value) {
  try {
    const u = new URL(String(value || '').trim());
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    return ['youtube.com', 'youtu.be', 'youtube-nocookie.com'].some((d) => host === d || host.endsWith(`.${d}`));
  } catch { return false; }
}

function titleFromFileName(name) {
  return text(String(name || '').replace(/\.[a-z0-9]+$/i, '').replace(/[-_][A-Za-z0-9_-]{6,}$/g, '').replace(/[_]+/g, ' '), 120);
}

function mediaTitle(item, fallback = 'A-X-HK Media') {
  return text(item?.title || titleFromFileName(item?.fileName) || fallback, 120);
}

function durationText(seconds) {
  const n = Number(seconds || 0);
  return n > 0 ? duration(n, true) : '—';
}

function fileSize(bytes) {
  const n = Number(bytes || 0);
  if (!n) return '—';
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

function sourceLabel(item, fallback = 'YouTube') {
  const label = String(item?.platform || fallback || 'YouTube').replace(/-/g, ' ');
  return label.replace(/\b\w/g, (c) => c.toUpperCase());
}

function audioInfoCard(item, fallbackTitle = 'A-X-HK Audio') {
  const title = mediaTitle(item, fallbackTitle);
  const artist = text(item?.uploader || item?.artist || '', 70);
  return [
    '╭━━━〔 🎧 A-X-HK AUDIO 🎧 〕━━━╮',
    `┃ 🎵 TITLE   ${title}`,
    artist ? `┃ 👤 ARTIST  ${artist}` : '',
    `┃ ⏱️ TIME    ${durationText(item?.duration || item?.durationSeconds)}`,
    `┃ 💾 SIZE    ${fileSize(item?.bytes)}`,
    `┃ 📡 SOURCE  ${sourceLabel(item, 'YouTube')}`,
    '╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
    '',
    '© POWERED BY ABDULLAH-X-HACKER.'
  ].filter(Boolean).join('\n');
}

function videoCaption(item, fallbackTitle = 'A-X-HK Video') {
  const title = mediaTitle(item, fallbackTitle);
  const channel = text(item?.uploader || '', 70);
  return [
    '╭━━━〔 🎬 A-X-HK VIDEO 🎬 〕━━━╮',
    `┃ 🎞️ TITLE   ${title}`,
    channel ? `┃ 📺 CHANNEL ${channel}` : '',
    `┃ ⏱️ TIME    ${durationText(item?.duration)}`,
    `┃ 💾 SIZE    ${fileSize(item?.bytes)}`,
    `┃ 📡 SOURCE  ${sourceLabel(item, 'YouTube')}`,
    '╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
    '',
    '© POWERED BY ABDULLAH-X-HACKER.'
  ].filter(Boolean).join('\n');
}

function externalAdReply(item, title, body) {
  const url = item?.webpageUrl || '';
  const preview = {
    title: text(title, 70),
    body: text(body, 80),
    mediaType: 1,
    showAdAttribution: false
  };
  if (/^https?:\/\//i.test(url)) preview.sourceUrl = url;
  if (/^https?:\/\//i.test(item?.thumbnail || '')) preview.thumbnailUrl = item.thumbnail;
  return { externalAdReply: preview };
}

async function sendAudioItem(ctx, item, fallbackTitle = 'A-X-HK Audio') {
  const title = mediaTitle(item, fallbackTitle);
  await ctx.reply(audioInfoCard(item, fallbackTitle));
  return ctx.send({
    audio: { url: item.filePath },
    mimetype: item.mimetype || 'audio/mp4',
    fileName: item.fileName || `${safeFileName(title)}.m4a`,
    ptt: false,
    contextInfo: externalAdReply(item, `🎧 ${title}`, item.uploader || 'A-X-HK Audio')
  }, { quoted: ctx.msg });
}

function cacheGet(key) {
  const item = searchCache.get(key);
  if (!item || Date.now() - item.at > CACHE_TTL) { searchCache.delete(key); return null; }
  return item.value;
}
function cacheSet(key, value) {
  searchCache.set(key, { at: Date.now(), value });
  if (searchCache.size > 80) searchCache.delete(searchCache.keys().next().value);
  return value;
}

async function fetchJson(url, timeout = 10_000) {
  const key = String(url);
  const cached = cacheGet(key);
  if (cached) return cached;
  const response = await fetch(url, {
    headers: { 'user-agent': UA, accept: 'application/json' },
    signal: AbortSignal.timeout(timeout)
  });
  if (!response.ok) throw new Error(`media search returned ${response.status}`);
  return cacheSet(key, await response.json());
}

async function searchDeezer(query, limit = 8) {
  const q = text(query, 180);
  if (!q) return [];
  const url = new URL(DEEZER_SEARCH);
  url.searchParams.set('q', q);
  url.searchParams.set('limit', String(Math.max(1, Math.min(limit, 10))));
  const data = await fetchJson(url);
  const rows = Array.isArray(data?.data) ? data.data : [];
  return rows.map((item) => ({
    title: item.title || item.title_short || '',
    artist: item.artist?.name || '',
    album: item.album?.title || 'Single',
    durationSeconds: Number(item.duration || 0),
    previewUrl: item.preview || '',
    pageUrl: item.link || '',
    artwork: item.album?.cover_xl || item.album?.cover_big || item.album?.cover_medium || '',
    source: 'Deezer preview'
  }));
}

async function searchItunes(entity, query, limit = 5) {
  const q = text(query, 180);
  if (!q) return [];
  const url = new URL(ITUNES_SEARCH);
  url.searchParams.set('term', q);
  url.searchParams.set('entity', entity);
  url.searchParams.set('limit', String(Math.max(1, Math.min(limit, 10))));
  url.searchParams.set('country', 'PK');
  const data = await fetchJson(url);
  return Array.isArray(data.results) ? data.results : [];
}

async function searchTracks(query, limit = 8) {
  try {
    const rows = await searchDeezer(query, limit);
    if (rows.some((x) => x.previewUrl)) return rows;
  } catch {}
  const rows = await searchItunes('song', query, limit);
  return rows.map((item) => ({
    title: item.trackName || '',
    artist: item.artistName || '',
    album: item.collectionName || 'Single',
    durationSeconds: Math.round(Number(item.trackTimeMillis || 0) / 1000),
    previewUrl: item.previewUrl || '',
    pageUrl: item.trackViewUrl || '',
    artwork: item.artworkUrl100 ? String(item.artworkUrl100).replace(/100x100bb/, '600x600bb') : '',
    releaseDate: item.releaseDate,
    source: 'Apple preview'
  }));
}

async function downloadMedia(url, { maxBytes = 15 * 1024 * 1024, timeout = 25_000 } = {}) {
  if (!/^https:\/\//i.test(String(url || ''))) throw new Error('No official preview is available for this result.');
  const response = await fetch(url, {
    headers: { 'user-agent': UA, accept: '*/*' },
    redirect: 'follow',
    signal: AbortSignal.timeout(timeout)
  });
  if (!response.ok) throw new Error(`preview download returned ${response.status}`);
  const length = Number(response.headers.get('content-length') || 0);
  if (length > maxBytes) throw new Error('Preview file is too large to send.');
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length || buffer.length > maxBytes) throw new Error('Preview is unavailable or too large.');
  return { buffer, mimetype: response.headers.get('content-type')?.split(';')[0] || 'application/octet-stream' };
}

function songLine(item, index) {
  return `${index}. ${text(item.title)} — ${text(item.artist)}\n   ${text(item.album || 'Single')} • ${duration(item.durationSeconds, true)}`;
}

registerCommand({
  name: 'play', aliases: ['song', 'music', 'playaudio', 'ytplay', 'ytmusic', 'playmp3'], category: 'media',
  description: 'Search YouTube for a public song/video and send the full audio; falls back to an official preview', usage: 'play song name', cooldown: 6,
  async run(ctx) {
    if (!ctx.argText) return ctx.reply(`Usage: ${ctx.prefix}play Pasoori\nYouTube link: ${ctx.prefix}play https://youtu.be/...`);
    const query = text(ctx.argText, 220);
    ctx.sock.sendMessage(ctx.chat, { react: { text: '🎵', key: ctx.msg.key } }).catch(() => {});

    if (isYouTubeUrl(query)) {
      let item;
      try {
        item = await downloadPublicMedia(query, { platform: 'youtube', kind: 'audio' });
        if (item.kind !== 'audio') throw new Error('The YouTube link did not return a sendable audio stream.');
        await sendAudioItem(ctx, item, query);
        ctx.sock.sendMessage(ctx.chat, { react: { text: '✅', key: ctx.msg.key } }).catch(() => {});
        return;
      } finally {
        if (item) await cleanupDownloadedMedia(item);
      }
    }

    // Prefer a full public YouTube audio download for search words. If YouTube blocks
    // the server for this result, fall back to the existing official preview providers.
    let searchedItem;
    try {
      searchedItem = await downloadSearchMedia(query, { kind: 'audio' });
      if (searchedItem.kind === 'audio') {
        await sendAudioItem(ctx, searchedItem, query);
        ctx.sock.sendMessage(ctx.chat, { react: { text: '✅', key: ctx.msg.key } }).catch(() => {});
        return;
      }
    } catch {} finally {
      if (searchedItem) await cleanupDownloadedMedia(searchedItem);
    }

    let tracks = await searchTracks(query, 8);
    let track = tracks.find((item) => item.previewUrl);
    if (!track) return ctx.reply('Full public YouTube audio aur official preview dono available nahi mile. Exact title/artist ya public YouTube link try karein.');

    let audio;
    try {
      audio = await downloadMedia(track.previewUrl, { maxBytes: 14 * 1024 * 1024 });
    } catch (firstError) {
      // If the primary provider has a temporary CDN failure, try Apple once.
      const fallback = (await searchItunes('song', query, 8)).find((item) => item.previewUrl);
      if (!fallback) throw firstError;
      track = {
        title: fallback.trackName || query,
        artist: fallback.artistName || '',
        album: fallback.collectionName || 'Single',
        durationSeconds: Math.round(Number(fallback.trackTimeMillis || 0) / 1000),
        previewUrl: fallback.previewUrl,
        pageUrl: fallback.trackViewUrl || '',
        artwork: fallback.artworkUrl100 ? String(fallback.artworkUrl100).replace(/100x100bb/, '600x600bb') : '',
        source: 'Apple preview'
      };
      audio = await downloadMedia(track.previewUrl, { maxBytes: 14 * 1024 * 1024 });
    }

    const mime = /mpeg|mp3/i.test(audio.mimetype) ? 'audio/mpeg' : (/mp4|m4a/i.test(audio.mimetype) ? 'audio/mp4' : audio.mimetype);
    const ext = mime === 'audio/mpeg' ? 'mp3' : 'm4a';
    await ctx.reply(audioInfoCard({ ...track, bytes: audio.buffer.length, mimetype: mime, platform: track.source || 'Preview' }, track.title || query));
    await ctx.send({
      audio: audio.buffer,
      mimetype: mime,
      ptt: false,
      fileName: `${safeFileName(`${track.artist} - ${track.title}`)}.${ext}`,
      contextInfo: externalAdReply({ ...track, webpageUrl: track.pageUrl }, `🎧 ${track.title || query}`, track.artist || track.source || 'A-X-HK Audio')
    }, { quoted: ctx.msg });
  }
});

registerCommand({
  name: 'video', aliases: ['mv', 'playvideo', 'songvideo', 'ytvideo', 'youtubevideo', 'ytmp4', 'mp4'], category: 'media',
  description: 'Search a public music video by name and send only the downloaded video file', usage: 'video song name', cooldown: 10,
  async run(ctx) {
    if (!ctx.argText) return ctx.reply(`Usage: ${ctx.prefix}video Pasoori\nYouTube link: ${ctx.prefix}video https://youtu.be/...`);
    const query = text(ctx.argText, 220);
    ctx.sock.sendMessage(ctx.chat, { react: { text: '🎬', key: ctx.msg.key } }).catch(() => {});
    let item;
    try {
      item = isYouTubeUrl(query)
        ? await downloadPublicMedia(query, { platform: 'youtube', kind: 'video' })
        : await downloadSearchMedia(query, { kind: 'video' });
      if (item.kind !== 'video') throw new Error('The search result was not a WhatsApp-compatible video. Try a more exact song/artist name.');
      await ctx.send({
        video: { url: item.filePath },
        mimetype: item.mimetype || 'video/mp4',
        fileName: item.fileName || 'A-X-HK-video.mp4',
        caption: videoCaption(item, query),
        contextInfo: externalAdReply(item, `🎬 ${mediaTitle(item, query)}`, item.uploader || 'A-X-HK Video')
      }, { quoted: ctx.msg });
      ctx.sock.sendMessage(ctx.chat, { react: { text: '✅', key: ctx.msg.key } }).catch(() => {});
    } finally {
      if (item) await cleanupDownloadedMedia(item);
    }
  }
});

registerCommand({
  name: 'musicsearch', aliases: ['songsearch', 'searchsong'], category: 'search',
  description: 'Search the music catalog and list matching tracks', usage: 'musicsearch song or artist', cooldown: 4,
  async run(ctx) {
    if (!ctx.argText) return ctx.reply(`Usage: ${ctx.prefix}musicsearch Arijit Singh`);
    const results = await searchTracks(ctx.argText, 5);
    if (!results.length) return ctx.reply('No matching tracks found.');
    await ctx.reply(`🎵 MUSIC SEARCH — ${text(ctx.argText, 80)}\n\n${results.map(songLine).join('\n\n')}\n\n${ctx.prefix}play <name> = audio\n${ctx.prefix}video <name> = direct video`);
  }
});

registerCommand({
  name: 'trackinfo', aliases: ['songinfo', 'musicinfo'], category: 'search',
  description: 'Show detailed information for a song', usage: 'trackinfo song name', cooldown: 4,
  async run(ctx) {
    if (!ctx.argText) return ctx.reply(`Usage: ${ctx.prefix}trackinfo song name`);
    const [track] = await searchTracks(ctx.argText, 1);
    if (!track) return ctx.reply('Track not found.');
    await ctx.reply([
      `🎵 ${text(track.title)}`,
      `👤 Artist: ${text(track.artist)}`,
      `💿 Album: ${text(track.album || 'Single')}`,
      `⏱️ Duration: ${duration(track.durationSeconds, true)}`,
      track.releaseDate ? `📅 Year: ${year(track.releaseDate)}` : '',
      track.pageUrl ? `🔗 Official page: ${track.pageUrl}` : '',
      `🎧 Preview: ${track.previewUrl ? 'available' : 'not available'}`
    ].filter(Boolean).join('\n'));
  }
});

registerCommand({
  name: 'artistsearch', aliases: ['artist', 'findartist'], category: 'search',
  description: 'Search music artists', usage: 'artistsearch artist name', cooldown: 4,
  async run(ctx) {
    if (!ctx.argText) return ctx.reply(`Usage: ${ctx.prefix}artistsearch Atif Aslam`);
    const results = await searchItunes('musicArtist', ctx.argText, 5);
    if (!results.length) return ctx.reply('No matching artists found.');
    await ctx.reply(results.map((item, i) => [
      `${i + 1}. ${text(item.artistName)}`,
      `   Genre: ${text(item.primaryGenreName || '—')}`,
      item.artistLinkUrl ? `   ${item.artistLinkUrl}` : ''
    ].filter(Boolean).join('\n')).join('\n\n'));
  }
});

registerCommand({
  name: 'albumsearch', aliases: ['album', 'findalbum'], category: 'search',
  description: 'Search music albums', usage: 'albumsearch album or artist', cooldown: 4,
  async run(ctx) {
    if (!ctx.argText) return ctx.reply(`Usage: ${ctx.prefix}albumsearch album name`);
    const results = await searchItunes('album', ctx.argText, 5);
    if (!results.length) return ctx.reply('No matching albums found.');
    await ctx.reply(results.map((item, i) => [
      `${i + 1}. ${text(item.collectionName)}`,
      `   Artist: ${text(item.artistName)}`,
      `   Genre: ${text(item.primaryGenreName || '—')} • ${year(item.releaseDate)}`,
      item.collectionViewUrl ? `   ${item.collectionViewUrl}` : ''
    ].filter(Boolean).join('\n')).join('\n\n'));
  }
});
