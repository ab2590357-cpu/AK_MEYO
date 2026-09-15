import { registerCommand } from '../../lib/core/registry.js';
import { cleanupDownloadedMedia, downloadPublicMedia, downloadSearchMedia, searchYouTubeVideos, PLATFORM_DOMAINS } from '../../lib/services/media-downloader.js';
import { getSnapchatProfile, getTikTokProfile, searchWeb, seoAudit } from '../../lib/services/search-tools.js';
import { config } from '../../lib/config.js';
import { searchImageCollage, searchImageSet } from '../../lib/services/image-search.js';

function compact(value, max = 180) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function formatCount(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return '—';
  return new Intl.NumberFormat('en', { notation: n >= 10000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(n);
}

function formatDuration(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds || 0)));
  if (!total) return '—';
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

function titleFromFileName(name) {
  return compact(String(name || '').replace(/\.[a-z0-9]+$/i, '').replace(/[-_][A-Za-z0-9_-]{6,}$/g, '').replace(/[_]+/g, ' '), 120);
}

function mediaTitle(item, fallback = 'A-X-HK Media') {
  return compact(item?.title || titleFromFileName(item?.fileName) || fallback, 120);
}

function fileSize(bytes) {
  const n = Number(bytes || 0);
  if (!n) return '—';
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

function mediaInfoCard(item, label = 'Download') {
  const title = mediaTitle(item, label);
  const who = compact(item?.uploader || '', 70);
  return [
    `╭━━━〔 ${item?.kind === 'audio' ? '🎧' : '🎬'} A-X-HK ${String(label || 'MEDIA').toUpperCase()} 〕━━━╮`,
    `┃ 🎵 TITLE   ${title}`,
    who ? `┃ 👤 SOURCE  ${who}` : '',
    `┃ ⏱️ TIME    ${formatDuration(item?.duration)}`,
    `┃ 💾 SIZE    ${fileSize(item?.bytes)}`,
    '╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
    '',
    '© POWERED BY ABDULLAH-X-HACKER.'
  ].filter(Boolean).join('\n');
}

function mediaContext(item, label = 'A-X-HK Media') {
  const preview = {
    title: mediaTitle(item, label),
    body: compact(item?.uploader || label, 80),
    mediaType: 1,
    showAdAttribution: false
  };
  if (/^https?:\/\//i.test(item?.webpageUrl || '')) preview.sourceUrl = item.webpageUrl;
  if (/^https?:\/\//i.test(item?.thumbnail || '')) preview.thumbnailUrl = item.thumbnail;
  return { externalAdReply: preview };
}

async function sendProfileCard(ctx, avatar, caption) {
  if (avatar && /^https:\/\//i.test(avatar)) {
    try {
      await ctx.send({ image: { url: avatar }, caption }, { quoted: ctx.msg });
      return;
    } catch {}
  }
  await ctx.reply(caption);
}


function isHttpUrl(value = '') {
  return /^https?:\/\//i.test(String(value || '').trim());
}

function hostMatches(host, domain) {
  return host === domain || host.endsWith(`.${domain}`);
}

function platformForUrl(raw = '') {
  try {
    const u = new URL(String(raw || '').trim());
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    for (const [platform, domains] of Object.entries(PLATFORM_DOMAINS)) {
      if (domains.some((domain) => hostMatches(host, domain))) return platform;
    }
  } catch {}
  return 'download';
}

function isSupportedMediaUrl(raw = '') {
  return platformForUrl(raw) !== 'download';
}

async function sendDownloadedItem(ctx, item, label = 'Download') {
  const caption = mediaInfoCard(item, label);
  if (item.kind === 'video') return ctx.send({ video: { url: item.filePath }, mimetype: item.mimetype, fileName: item.fileName, caption, contextInfo: mediaContext(item, label) }, { quoted: ctx.msg });
  if (item.kind === 'audio') {
    await ctx.reply(caption);
    return ctx.send({ audio: { url: item.filePath }, mimetype: item.mimetype, fileName: item.fileName, ptt: false, contextInfo: mediaContext(item, label) }, { quoted: ctx.msg });
  }
  if (item.kind === 'image') return ctx.send({ image: { url: item.filePath }, mimetype: item.mimetype, caption }, { quoted: ctx.msg });
  return ctx.send({ document: { url: item.filePath }, mimetype: item.mimetype, fileName: item.fileName, caption }, { quoted: ctx.msg });
}

async function sendImageResultPack(ctx, result) {
  const images = result.images.slice(0, 10);
  let sent = 0;
  for (let i = 0; i < images.length; i += 1) {
    const caption = i === 0
      ? [
          `🖼️ *${config.shortName} IMAGE DOWNLOAD*`,
          `Query: ${result.query}`,
          `Images: ${images.length} • ${result.provider}`,
          'Direct image results only — no source links.'
        ].join('\n')
      : `🖼️ ${result.query} • ${i + 1}/${images.length}`;
    await ctx.send({ image: images[i].buffer, caption }, { quoted: i === 0 ? ctx.msg : undefined });
    sent += 1;
  }
  return sent;
}

registerCommand({
  name: 'search', aliases: ['websearch', 'google', 'findweb'], category: 'search', cooldown: 5,
  description: 'Search the public web and return useful result links', usage: 'search your query',
  async run(ctx) {
    const query = compact(ctx.argText, 220);
    if (!query) return ctx.reply(`Usage: ${ctx.prefix}search latest technology news`);
    const rows = await searchWeb(query, 6);
    if (!rows.length) return ctx.reply('No public web results were returned right now. Try a more specific query.');
    await ctx.reply([
      `🔎 *${config.shortName} WEB SEARCH*`,
      `Query: ${query}`, '',
      ...rows.map((row, i) => `${i + 1}. *${compact(row.title, 120)}*\n${row.url}`),
      '', 'Public search results only • links may change over time.'
    ].join('\n\n'));
  }
});

registerCommand({
  name: 'img', aliases: ['image', 'images', 'imgsearch', 'gimg', 'googleimage', 'googleimages'], category: 'search', cooldown: 8,
  description: 'Search public images and send 8-10 direct image results in chat (no source links)', usage: 'img your image query',
  async run(ctx) {
    const query = compact(ctx.argText, 180);
    if (!query) return ctx.reply(`Usage: ${ctx.prefix}img black BMW M4`);
    const result = await searchImageSet(query, 10);
    const sent = await sendImageResultPack(ctx, result);
    if (!sent) await ctx.reply('No sendable images were returned right now.');
  }
});

registerCommand({
  name: 'imgcollage', aliases: ['imggrid', 'collageimg'], category: 'search', cooldown: 8,
  description: 'Search public images and return them in one collage image', usage: 'imgcollage your image query',
  async run(ctx) {
    const query = compact(ctx.argText, 180);
    if (!query) return ctx.reply(`Usage: ${ctx.prefix}imgcollage black BMW M4`);
    const result = await searchImageCollage(query, 8);
    const caption = [
      `🖼️ *${config.shortName} IMAGE COLLAGE*`,
      `Query: ${result.query}`,
      `Results: ${result.images.length} • ${result.provider}`,
      'All results are combined into one collage image.'
    ].join('\n');
    await ctx.send({ image: result.buffer, caption }, { quoted: ctx.msg });
  }
});

registerCommand({
  name: 'ytsearch', aliases: ['youtubesearch', 'searchyoutube', 'ytfind'], category: 'search', cooldown: 7,
  description: 'Search YouTube and return up to 10 public video links', usage: 'ytsearch song or topic',
  async run(ctx) {
    const query = compact(ctx.argText, 180);
    if (!query) return ctx.reply(`Usage: ${ctx.prefix}ytsearch Atif Aslam`);
    const rows = await searchYouTubeVideos(query, 10);
    if (!rows.length) return ctx.reply('No YouTube results were returned. Try another query.');
    await ctx.reply([
      `▶️ *${config.shortName} YOUTUBE SEARCH*`,
      `Query: ${query}`, '',
      ...rows.map((row, i) => [
        `${i + 1}. *${compact(row.title, 120)}*`,
        `Channel: ${compact(row.channel || 'Unknown', 70)} • ${formatDuration(row.duration)}`,
        row.views ? `Views: ${formatCount(row.views)}` : '',
        row.url
      ].filter(Boolean).join('\n')),
      '',
      `${ctx.prefix}video <YouTube link> = video`,
      `${ctx.prefix}audio <YouTube link> = audio`
    ].join('\n\n'));
  }
});

registerCommand({
  name: 'ytaudio', aliases: ['audio', 'mp3', 'yta', 'youtubeaudio', 'youtubea', 'ytmp3'], category: 'download', cooldown: 10,
  description: 'Send full audio from a public YouTube URL or search words', usage: 'audio <YouTube URL or search words>',
  async run(ctx) {
    const url = compact(ctx.argText, 500);
    if (!url) return ctx.reply(`Usage: ${ctx.prefix}audio <YouTube URL or search words>`);
    let item;
    try {
      item = /^https?:\/\//i.test(url)
        ? await downloadPublicMedia(url, { platform: 'youtube', kind: 'audio' })
        : await downloadSearchMedia(url, { kind: 'audio' });
      if (item.kind !== 'audio') throw new Error('That link did not return a sendable audio stream.');
      await sendDownloadedItem(ctx, item, 'YouTube Audio');
    } finally {
      if (item) await cleanupDownloadedMedia(item);
    }
  }
});

registerCommand({
  name: 'googlevideo', aliases: ['gvideo', 'googlevid', 'gvid', 'googlev'], category: 'download', cooldown: 10,
  description: 'Find a public supported video from web search and send it directly in chat', usage: 'googlevideo your query or public URL',
  async run(ctx) {
    const query = compact(ctx.argText, 220);
    if (!query) return ctx.reply(`Usage: ${ctx.prefix}googlevideo nature documentary`);
    let item;
    try {
      if (isHttpUrl(query)) {
        const platform = platformForUrl(query);
        item = await downloadPublicMedia(query, { platform });
      } else {
        const rows = await searchWeb(`${query} video`, 10);
        const candidates = rows.map((row) => row.url).filter((url) => isSupportedMediaUrl(url));
        if (!candidates.length) {
          return ctx.reply([
            'No directly downloadable public video source was found from web search.',
            'Try one of these instead:',
            `${ctx.prefix}youtube ${query}`,
            `${ctx.prefix}ytsearch ${query}`
          ].join('\n'));
        }
        const target = candidates[0];
        item = await downloadPublicMedia(target, { platform: platformForUrl(target) });
      }
      await sendDownloadedItem(ctx, item, 'Google Video');
    } finally {
      if (item) await cleanupDownloadedMedia(item);
    }
  }
});

registerCommand({
  name: 'tiktoksearch', aliases: ['ttsearch', 'searchtiktok'], category: 'search', cooldown: 6,
  description: 'Search public TikTok profiles/videos and return matching links', usage: 'tiktoksearch username or topic',
  async run(ctx) {
    const query = compact(ctx.argText, 120);
    if (!query) return ctx.reply(`Usage: ${ctx.prefix}tiktoksearch username`);
    const rows = (await searchWeb(`site:tiktok.com/@ ${query}`, 8))
      .filter((row) => /https?:\/\/(?:www\.)?tiktok\.com\/@/i.test(row.url))
      .slice(0, 6);
    if (!rows.length) return ctx.reply(`No public TikTok results found. For an exact ID try ${ctx.prefix}tiktokprofile @username`);
    await ctx.reply([
      '🎵 *TIKTOK SEARCH*', `Query: ${query}`, '',
      ...rows.map((row, i) => `${i + 1}. ${compact(row.title, 110)}\n${row.url}`),
      '', `Exact public account details: ${ctx.prefix}tiktokprofile @username`
    ].join('\n\n'));
  }
});

registerCommand({
  name: 'tiktokprofile', aliases: ['ttprofile', 'tiktokuser', 'ttuser'], category: 'search', cooldown: 8,
  description: 'Show public TikTok account details and profile picture when TikTok exposes them', usage: 'tiktokprofile @username',
  async run(ctx) {
    const username = compact(ctx.argText, 60);
    if (!username) return ctx.reply(`Usage: ${ctx.prefix}tiktokprofile @username`);
    const p = await getTikTokProfile(username);
    const caption = [
      '🎵 *TIKTOK PUBLIC PROFILE*', '',
      `Name: ${compact(p.nickname || p.username, 80)}${p.verified ? ' ✅' : ''}`,
      `ID: @${p.username}`,
      p.bio ? `Bio: ${compact(p.bio, 300)}` : '',
      `Followers: ${formatCount(p.followers)}`,
      `Following: ${formatCount(p.following)}`,
      `Likes: ${formatCount(p.likes)}`,
      `Videos: ${formatCount(p.videos)}`,
      p.visibleViewVideos ? `Visible video views: ${formatCount(p.visibleViews)} (${formatCount(p.visibleViewVideos)} videos sampled)` : '',
      p.friends ? `Friends: ${formatCount(p.friends)}` : '',
      `Profile: ${p.profileUrl}`,
      '',
      'Only public fields exposed by TikTok are shown. Private/non-public stats are not inferred.'
    ].filter(Boolean).join('\n');
    await sendProfileCard(ctx, p.avatar, caption);
  }
});

registerCommand({
  name: 'snapsearch', aliases: ['snapchatsearch', 'searchsnap'], category: 'search', cooldown: 6,
  description: 'Search public Snapchat profile links', usage: 'snapsearch username',
  async run(ctx) {
    const query = compact(ctx.argText, 100);
    if (!query) return ctx.reply(`Usage: ${ctx.prefix}snapsearch username`);
    const rows = (await searchWeb(`site:snapchat.com/add ${query}`, 8))
      .filter((row) => /snapchat\.com\/(?:add|p)\//i.test(row.url))
      .slice(0, 6);
    if (!rows.length) return ctx.reply(`No public Snapchat result found. Try ${ctx.prefix}snapprofile username`);
    await ctx.reply(['👻 *SNAPCHAT SEARCH*', '', ...rows.map((r, i) => `${i + 1}. ${compact(r.title, 110)}\n${r.url}`)].join('\n\n'));
  }
});

registerCommand({
  name: 'snapprofile', aliases: ['snapchatprofile', 'snapuser'], category: 'search', cooldown: 8,
  description: 'Show public Snapchat profile metadata and profile image when available', usage: 'snapprofile username',
  async run(ctx) {
    const username = compact(ctx.argText, 60);
    if (!username) return ctx.reply(`Usage: ${ctx.prefix}snapprofile username`);
    const p = await getSnapchatProfile(username);
    const caption = [
      '👻 *SNAPCHAT PUBLIC PROFILE*', '',
      `Username: ${p.username}`,
      `Name: ${compact(p.title || p.username, 120)}`,
      p.description ? `About: ${compact(p.description, 320)}` : '',
      `Profile: ${p.profileUrl}`,
      '', 'Only metadata visible on the public Snapchat profile page is shown.'
    ].filter(Boolean).join('\n');
    await sendProfileCard(ctx, p.avatar, caption);
  }
});

registerCommand({
  name: 'xsearch', aliases: ['twittersearch', 'searchx'], category: 'search', cooldown: 6,
  description: 'Search public X/Twitter pages and return matching links', usage: 'xsearch person or topic',
  async run(ctx) {
    const query = compact(ctx.argText, 140);
    if (!query) return ctx.reply(`Usage: ${ctx.prefix}xsearch OpenAI`);
    const rows = (await searchWeb(`site:x.com ${query}`, 8)).filter((r) => /https?:\/\/(?:www\.)?(?:x\.com|twitter\.com)\//i.test(r.url)).slice(0, 6);
    if (!rows.length) return ctx.reply('No public X/Twitter results returned right now.');
    await ctx.reply(['𝕏 *PUBLIC SEARCH*', '', ...rows.map((r, i) => `${i + 1}. ${compact(r.title, 110)}\n${r.url}`)].join('\n\n'));
  }
});

registerCommand({
  name: 'seo', aliases: ['seocheck', 'siteaudit'], category: 'search', cooldown: 8,
  description: 'Run a safe public-page SEO metadata audit', usage: 'seo example.com',
  async run(ctx) {
    const target = compact(ctx.argText, 500);
    if (!target) return ctx.reply(`Usage: ${ctx.prefix}seo example.com`);
    const s = await seoAudit(target);
    const issues = [];
    if (!s.title) issues.push('Missing page title');
    else if (s.title.length < 20 || s.title.length > 65) issues.push(`Title length ${s.title.length} (usually aim ~20-65)`);
    if (!s.description) issues.push('Missing meta description');
    else if (s.description.length < 60 || s.description.length > 170) issues.push(`Description length ${s.description.length} (usually aim ~60-170)`);
    if (s.h1.length !== 1) issues.push(`H1 count is ${s.h1.length}; one clear primary H1 is usually preferable`);
    if (!s.canonical) issues.push('No canonical link found');
    if (!s.viewport) issues.push('No viewport meta tag found');
    if (!s.ogTitle) issues.push('No Open Graph title found');
    if (/noindex/i.test(s.robots)) issues.push('Robots meta contains noindex');
    const score = Math.max(0, 100 - issues.length * 10);
    await ctx.reply([
      '📈 *PUBLIC SEO AUDIT*', '',
      `URL: ${s.url}`,
      `HTTP: ${s.status}`,
      `Quick score: ${score}/100`,
      `Title (${s.title.length}): ${compact(s.title || '—', 160)}`,
      `Description (${s.description.length}): ${compact(s.description || '—', 220)}`,
      `H1: ${s.h1.length}${s.h1[0] ? ` • ${compact(s.h1[0], 120)}` : ''}`,
      `Canonical: ${s.canonical || '—'}`,
      `Robots: ${s.robots || '—'}`,
      `Viewport: ${s.viewport ? 'YES' : 'NO'} • OpenGraph: ${s.ogTitle ? 'YES' : 'NO'}`,
      `Words: ${s.words} • Links: ${s.links} • Images: ${s.images} • JSON-LD: ${s.jsonLd}`,
      '',
      issues.length ? `Checks to review:\n${issues.map((x) => `• ${x}`).join('\n')}` : 'No obvious metadata issues found in this lightweight audit.',
      '', 'This checks the public HTML response only; it is not a full crawler or ranking guarantee.'
    ].join('\n'));
  }
});
