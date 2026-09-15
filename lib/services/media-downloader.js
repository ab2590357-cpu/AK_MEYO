import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { config } from '../config.js';

const execFileAsync = promisify(execFile);
const MAX_DOWNLOAD_BYTES = 95 * 1024 * 1024;
const MAX_DOWNLOAD_LABEL = '95 MB';
const PUBLIC_DOWNLOAD_TIMEOUT_MS = 240_000;
const TOOL_VERSION = '2026.08.19';
const TOOL_BUILDS = {
  win32: {
    file: 'yt-dlp.exe',
    url: `https://github.com/yt-dlp/yt-dlp/releases/download/${TOOL_VERSION}/yt-dlp.exe`,
    sha256: '66674953fe251b89f4d08c5f0e35e0728679bd67ab3d7d05c0562af101dd3e7a',
    maxBytes: 24 * 1024 * 1024
  },
  linux: {
    file: 'yt-dlp_linux',
    url: `https://github.com/yt-dlp/yt-dlp/releases/download/${TOOL_VERSION}/yt-dlp_linux`,
    sha256: '58162f9bfdc27458ea47bfcb311cf47028f17d8154a8bf7d689861d46399230a',
    maxBytes: 48 * 1024 * 1024
  }
};

export const PLATFORM_DOMAINS = {
  tiktok: ['tiktok.com'],
  instagram: ['instagram.com'],
  facebook: ['facebook.com', 'fb.watch'],
  twitter: ['twitter.com', 'x.com'],
  youtube: ['youtube.com', 'youtu.be', 'youtube-nocookie.com'],
  reddit: ['reddit.com', 'redd.it'],
  pinterest: ['pinterest.com', 'pin.it'],
  threads: ['threads.net'],
  twitch: ['twitch.tv', 'clips.twitch.tv'],
  vimeo: ['vimeo.com'],
  dailymotion: ['dailymotion.com', 'dai.ly'],
  soundcloud: ['soundcloud.com'],
  snapchat: ['snapchat.com'],
  tumblr: ['tumblr.com'],
  imgur: ['imgur.com'],
  streamable: ['streamable.com'],
  bilibili: ['bilibili.com', 'b23.tv'],
  vk: ['vk.com'],
  rumble: ['rumble.com'],
  bandcamp: ['bandcamp.com']
};

const ALL_DOMAINS = [...new Set(Object.values(PLATFORM_DOMAINS).flat())];
let toolPromise = null;

function hostMatches(host, domain) {
  return host === domain || host.endsWith(`.${domain}`);
}

function sanitizeUrl(raw, platform = 'download') {
  let url;
  try { url = new URL(String(raw || '').trim()); } catch { throw new Error('Provide a valid public media URL.'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only http/https media URLs are supported.');
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  if (!host || host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) throw new Error('Local/private URLs are not allowed.');
  const domains = platform !== 'download' && PLATFORM_DOMAINS[platform] ? PLATFORM_DOMAINS[platform] : ALL_DOMAINS;
  if (!domains.some((domain) => hostMatches(host, domain))) {
    if (platform === 'download') throw new Error('This site is not in the supported public-media list. Try a platform command such as .tiktok, .instagram, .youtube, .facebook, .twitter, .reddit, .pinterest, .vimeo or .soundcloud.');
    throw new Error(`That URL does not look like a ${platform} link.`);
  }
  return url.toString();
}

async function downloadTool(build, destination) {
  const response = await fetch(build.url, {
    redirect: 'follow',
    headers: { 'user-agent': `A-X-HK/${config.version}` },
    signal: AbortSignal.timeout(60_000)
  });
  if (!response.ok) throw new Error(`Downloader bootstrap failed (${response.status}).`);
  const announced = Number(response.headers.get('content-length') || 0);
  if (announced && announced > build.maxBytes) throw new Error('Downloader bootstrap file is unexpectedly large.');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || bytes.length > build.maxBytes) throw new Error('Downloader bootstrap file failed size validation.');
  const actual = crypto.createHash('sha256').update(bytes).digest('hex');
  if (actual !== build.sha256) throw new Error('Downloader bootstrap checksum verification failed.');
  await fs.mkdir(path.dirname(destination), { recursive: true });
  const tmp = `${destination}.${process.pid}.tmp`;
  await fs.writeFile(tmp, bytes);
  await fs.rename(tmp, destination);
  if (process.platform !== 'win32') await fs.chmod(destination, 0o755);
}

export async function ensureMediaDownloader() {
  if (toolPromise) return toolPromise;
  toolPromise = (async () => {
    const build = TOOL_BUILDS[process.platform];
    if (!build) throw new Error(`Media downloads are currently packaged for Windows and Linux hosts, not ${process.platform}.`);
    const toolDir = path.join(config.dataDir, 'tools');
    const toolPath = path.join(toolDir, build.file);
    try {
      const bytes = await fs.readFile(toolPath);
      const hash = crypto.createHash('sha256').update(bytes).digest('hex');
      if (hash === build.sha256) {
        if (process.platform !== 'win32') await fs.chmod(toolPath, 0o755).catch(() => {});
        return toolPath;
      }
    } catch {}
    await downloadTool(build, toolPath);
    return toolPath;
  })().catch((err) => { toolPromise = null; throw err; });
  return toolPromise;
}

function inferMediaKind(filePath, preferred = 'video') {
  const ext = path.extname(filePath).toLowerCase();
  if (['.mp3', '.m4a', '.aac', '.ogg', '.opus', '.wav', '.flac'].includes(ext)) return 'audio';
  if (preferred === 'audio' && ext === '.webm') return 'audio';
  if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) return 'image';
  if (['.mp4', '.mov', '.m4v', '.webm', '.3gp'].includes(ext)) return 'video';
  return preferred === 'audio' ? 'audio' : 'document';
}

function mimetypeFor(filePath, kind) {
  const ext = path.extname(filePath).toLowerCase();
  const map = {
    '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.3gp': 'video/3gpp',
    '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.ogg': 'audio/ogg', '.opus': 'audio/ogg', '.wav': 'audio/wav', '.flac': 'audio/flac',
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp'
  };
  if (kind === 'audio' && ext === '.webm') return 'audio/webm';
  return map[ext] || (kind === 'audio' ? 'audio/mpeg' : kind === 'video' ? 'video/mp4' : 'application/octet-stream');
}

async function newestFile(dir) {
  const names = await fs.readdir(dir).catch(() => []);
  const rows = [];
  for (const name of names) {
    const full = path.join(dir, name);
    const stat = await fs.stat(full).catch(() => null);
    if (stat?.isFile()) rows.push({ full, mtime: stat.mtimeMs, size: stat.size });
  }
  return rows.sort((a, b) => b.mtime - a.mtime)[0] || null;
}

function isYoutubeUrl(raw) {
  try {
    const u = new URL(String(raw || '').trim());
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    return PLATFORM_DOMAINS.youtube.some((domain) => hostMatches(host, domain));
  } catch {
    return false;
  }
}

function cleanDownloaderMessage(err) {
  return String(err?.stderr || err?.message || err)
    .replace(/https?:\/\/[^\s]+/gi, '[link]')
    .replace(/\s+/g, ' ')
    .trim();
}

function isProtectedMediaError(message) {
  return /(?:this video is private|private video|members[- ]only|premium content|drm protected|has drm|login required|sign in to confirm your age|age[- ]restricted)/i.test(message);
}

function isAnonymousYoutubeBlock(message) {
  return /(?:sign in to confirm you(?:'|’)?re not a bot|confirm you(?:'|’)?re not a bot|youtube.*(?:http error 403|403 forbidden)|requested format is not available.*youtube)/i.test(message);
}

const META_PREFIX = '__AXHK_META__';

function cleanMeta(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text || /^(?:NA|null|undefined|none)$/i.test(text)) return '';
  return text;
}

function parseDownloaderMetadata(stdout) {
  const lines = String(stdout || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const line = [...lines].reverse().find((value) => value.startsWith(META_PREFIX));
  if (!line) return {};
  const [title, uploader, duration, webpageUrl, thumbnail, id] = line.slice(META_PREFIX.length).split('\t');
  return {
    title: cleanMeta(title),
    uploader: cleanMeta(uploader),
    duration: Number(duration || 0) || 0,
    webpageUrl: cleanMeta(webpageUrl),
    thumbnail: cleanMeta(thumbnail),
    id: cleanMeta(id)
  };
}

function titleFromFileName(filePath) {
  return path.basename(String(filePath || ''), path.extname(String(filePath || '')))
    .replace(/[-_][A-Za-z0-9_-]{6,}$/g, '')
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function downloadFormats(kind, youtubeTarget) {
  if (kind === 'audio') {
    return youtubeTarget
      ? [
          'ba[acodec^=mp4a]/ba/b',
          'bestaudio[ext=m4a]/bestaudio/best'
        ]
      : ['bestaudio[ext=m4a]/bestaudio[ext=mp3]/bestaudio/best'];
  }
  if (youtubeTarget) {
    return [
      'bv*[vcodec^=avc1][height<=720]+ba[acodec^=mp4a]/b[vcodec^=avc1][height<=720]/b[height<=720]',
      'bv*[vcodec^=avc1][height<=480]+ba[acodec^=mp4a]/b[vcodec^=avc1][height<=480]/b[height<=480]',
      'bv*[height<=480]+ba/b[height<=480]/best'
    ];
  }
  return ['best[ext=mp4][height<=720]/best[height<=720]/best[ext=mp4]/best'];
}

async function clearJobDir(jobDir) {
  const entries = await fs.readdir(jobDir).catch(() => []);
  await Promise.all(entries.map((name) => fs.rm(path.join(jobDir, name), { recursive: true, force: true }).catch(() => {})));
}

async function execDownloader(toolPath, args, timeout = PUBLIC_DOWNLOAD_TIMEOUT_MS) {
  return execFileAsync(toolPath, args, {
    timeout,
    maxBuffer: 4 * 1024 * 1024,
    windowsHide: true,
    env: { ...process.env, PYTHONUTF8: '1' }
  });
}

async function findDownloadedFile(jobDir, stdout) {
  const printed = String(stdout || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean).reverse();
  const jobRoot = `${path.resolve(jobDir)}${path.sep}`;
  for (const candidate of printed) {
    const normalized = path.resolve(candidate);
    if (!normalized.startsWith(jobRoot)) continue;
    try { if ((await fs.stat(normalized)).isFile()) return normalized; } catch {}
  }
  return (await newestFile(jobDir))?.full || null;
}

async function runDownloadJob(toolPath, target, { jobDir, outputTemplate, kind, youtubeTarget }) {
  const formats = downloadFormats(kind, youtubeTarget);
  let lastError = null;
  for (const format of formats) {
    await clearJobDir(jobDir);
    const args = [
      '--no-playlist', '--no-warnings', '--no-progress', '--restrict-filenames', '--no-part',
      '--socket-timeout', '20', '--retries', '4', '--fragment-retries', '4', '--extractor-retries', '3',
      '--concurrent-fragments', '2', '--max-filesize', '95M'
    ];
    args.push('--format', format);
    if (kind === 'audio' && youtubeTarget) {
      args.push('--extract-audio', '--audio-format', 'm4a', '--audio-quality', '0');
    } else if (kind === 'video' && youtubeTarget) {
      args.push('--merge-output-format', 'mp4', '--remux-video', 'mp4', '--recode-video', 'mp4', '--postprocessor-args', '-movflags +faststart');
    }
    args.push(
      '--output', outputTemplate,
      '--print', 'after_move:filepath',
      '--print', `after_move:${META_PREFIX}%(title)s\t%(uploader)s\t%(duration)s\t%(webpage_url)s\t%(thumbnail)s\t%(id)s`,
      target
    );

    try {
      const { stdout } = await execDownloader(toolPath, args);
      const filePath = await findDownloadedFile(jobDir, stdout);
      if (!filePath) throw new Error('The downloader returned no media file.');
      const stat = await fs.stat(filePath);
      if (!stat.size) throw new Error('Downloaded media is empty.');
      if (stat.size > MAX_DOWNLOAD_BYTES) {
        lastError = new Error(`Media is larger than the ${MAX_DOWNLOAD_LABEL} bot download limit.`);
        continue;
      }
      const actualKind = inferMediaKind(filePath, kind);
      const metadata = parseDownloaderMetadata(stdout);
      if (!metadata.title) metadata.title = titleFromFileName(filePath);
      return { filePath, stat, actualKind, metadata };
    } catch (err) {
      lastError = err;
      const message = cleanDownloaderMessage(err);
      if (isProtectedMediaError(message) || isAnonymousYoutubeBlock(message)) break;
      if (!/requested format|format is not available|larger than|max-filesize|file is larger|unable to download|http error 4\d\d|fragment/i.test(message)) break;
    }
  }
  throw lastError || new Error('The platform did not return a downloadable media file.');
}

function friendlyDownloadError(err, youtubeTarget = false) {
  const message = cleanDownloaderMessage(err);
  if (isProtectedMediaError(message)) {
    return new Error('That media is genuinely private, members-only, age/login-protected, DRM-protected, or otherwise restricted. That protected media is not supported by this downloader.');
  }
  if (youtubeTarget && isAnonymousYoutubeBlock(message)) {
    return new Error('YouTube refused the Railway server anonymous access for this public video. The downloader cannot access that video anonymously from this server. Try another public link or a different public video.');
  }
  if (/larger than|max-filesize|File is larger/i.test(message)) return new Error(`Media is larger than the ${MAX_DOWNLOAD_LABEL} bot download limit.`);
  if (/Unsupported URL/i.test(message)) return new Error('This public URL is not supported by the current downloader engine.');
  return new Error(`Download failed: ${message.slice(0, 260) || 'platform unavailable'}`);
}

export async function downloadPublicMedia(rawUrl, { platform = 'download', kind = '' } = {}) {
  const url = sanitizeUrl(rawUrl, platform);
  const toolPath = await ensureMediaDownloader();
  const requestedKind = ['audio', 'video'].includes(String(kind || '').toLowerCase()) ? String(kind).toLowerCase() : '';
  const preferredKind = requestedKind || (platform === 'soundcloud' || platform === 'bandcamp' ? 'audio' : 'video');
  const youtubeTarget = platform === 'youtube' || isYoutubeUrl(url);
  const root = path.join(config.persistentRoot, 'tmp', 'downloads');
  await fs.mkdir(root, { recursive: true });
  const jobDir = await fs.mkdtemp(path.join(root, 'job-'));
  const outputTemplate = path.join(jobDir, '%(title).80s-%(id)s.%(ext)s');
  try {
    const { filePath, stat, actualKind, metadata } = await runDownloadJob(toolPath, url, {
      jobDir, outputTemplate, kind: preferredKind, youtubeTarget
    });
    return {
      filePath,
      jobDir,
      fileName: path.basename(filePath),
      kind: actualKind,
      mimetype: mimetypeFor(filePath, actualKind),
      bytes: stat.size,
      platform: youtubeTarget ? 'youtube' : platform,
      title: metadata.title,
      uploader: metadata.uploader,
      duration: metadata.duration,
      webpageUrl: metadata.webpageUrl || url,
      thumbnail: metadata.thumbnail,
      id: metadata.id
    };
  } catch (err) {
    await fs.rm(jobDir, { recursive: true, force: true }).catch(() => {});
    throw friendlyDownloadError(err, youtubeTarget);
  }
}

export async function cleanupDownloadedMedia(item) {
  if (!item?.jobDir) return;
  await fs.rm(item.jobDir, { recursive: true, force: true }).catch(() => {});
}

export function downloaderInfo() {
  return {
    engine: 'yt-dlp',
    version: TOOL_VERSION,
    platforms: Object.keys(PLATFORM_DOMAINS),
    host: `${os.platform()} ${os.arch()}`
  };
}

function sanitizeSearchQuery(raw) {
  const value = String(raw || '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180);
  if (!value) throw new Error('Provide a song/video name to search.');
  return value;
}

export async function searchYouTubeVideos(rawQuery, limit = 8) {
  const query = sanitizeSearchQuery(rawQuery);
  const count = Math.max(1, Math.min(12, Number(limit) || 8));
  const toolPath = await ensureMediaDownloader();
  const search = `ytsearch${count}:${query}`;
  const args = [
    '--flat-playlist', '--dump-single-json', '--no-warnings', '--no-progress',
    '--socket-timeout', '15', '--retries', '2', '--playlist-end', String(count),
    search
  ];
  try {
    const { stdout } = await execFileAsync(toolPath, args, {
      timeout: 75_000,
      maxBuffer: 8 * 1024 * 1024,
      windowsHide: true,
      env: { ...process.env, PYTHONUTF8: '1' }
    });
    const data = JSON.parse(String(stdout || '{}'));
    const entries = Array.isArray(data?.entries) ? data.entries : [];
    return entries.slice(0, count).map((item) => {
      const id = String(item?.id || '').trim();
      const webpage = String(item?.webpage_url || item?.url || '').trim();
      const url = /^https?:\/\//i.test(webpage)
        ? webpage
        : (id ? `https://www.youtube.com/watch?v=${encodeURIComponent(id)}` : '');
      return {
        id,
        title: String(item?.title || 'Untitled').trim(),
        channel: String(item?.channel || item?.uploader || item?.channel_name || '').trim(),
        duration: Number(item?.duration || 0),
        views: Number(item?.view_count || 0),
        url,
        thumbnail: String(item?.thumbnail || '').trim()
      };
    }).filter((item) => item.url);
  } catch (err) {
    const message = String(err?.stderr || err?.message || err).replace(/https?:\/\/[^\s]+/gi, '[link]').replace(/\s+/g, ' ').trim();
    throw new Error(`YouTube search failed: ${message.slice(0, 220) || 'search service unavailable'}`);
  }
}

// Search a public YouTube result by name and download the actual media file.
// This is intentionally media-only: callers receive a local file and decide how to send it.
export async function downloadSearchMedia(rawQuery, { kind = 'video' } = {}) {
  const query = sanitizeSearchQuery(rawQuery);
  if (!['video', 'audio'].includes(kind)) throw new Error('Unsupported search media type.');
  const toolPath = await ensureMediaDownloader();
  const root = path.join(config.persistentRoot, 'tmp', 'search-downloads');
  await fs.mkdir(root, { recursive: true });
  const jobDir = await fs.mkdtemp(path.join(root, 'job-'));
  const outputTemplate = path.join(jobDir, '%(title).80s-%(id)s.%(ext)s');
  const search = `ytsearch1:${query}`;
  try {
    const { filePath, stat, actualKind, metadata } = await runDownloadJob(toolPath, search, {
      jobDir, outputTemplate, kind, youtubeTarget: true
    });
    return {
      filePath,
      jobDir,
      fileName: path.basename(filePath),
      kind: actualKind,
      mimetype: mimetypeFor(filePath, actualKind),
      bytes: stat.size,
      platform: 'youtube-search',
      title: metadata.title || query,
      uploader: metadata.uploader,
      duration: metadata.duration,
      webpageUrl: metadata.webpageUrl,
      thumbnail: metadata.thumbnail,
      id: metadata.id
    };
  } catch (err) {
    await fs.rm(jobDir, { recursive: true, force: true }).catch(() => {});
    const friendly = friendlyDownloadError(err, true);
    if (/larger than/i.test(friendly.message)) throw friendly;
    throw new Error(`YouTube search download failed: ${friendly.message.replace(/^Download failed:\s*/i, '')}`);
  }
}
