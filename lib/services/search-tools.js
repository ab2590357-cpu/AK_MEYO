import dns from 'node:dns/promises';
import net from 'node:net';
import { truncate } from '../utils/text.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36 A-X-HK/4.10';
const MAX_PAGE_BYTES = 2 * 1024 * 1024;
const SEARCH_CACHE_MS = 2 * 60 * 1000;
const searchCache = new Map();

function decodeHtml(value = '') {
  return String(value)
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&nbsp;/gi, ' ');
}

function stripTags(value = '') {
  return decodeHtml(String(value).replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ').trim();
}

function metaContent(html, key, attr = 'property') {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<meta[^>]+${attr}=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+${attr}=["']${escaped}["'][^>]*>`, 'i')
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m) return decodeHtml(m[1]).trim();
  }
  return '';
}

function linkHref(html, rel) {
  const escaped = rel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<link[^>]+rel=["'][^"']*${escaped}[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>`, 'i'),
    new RegExp(`<link[^>]+href=["']([^"']+)["'][^>]+rel=["'][^"']*${escaped}[^"']*["'][^>]*>`, 'i')
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m) return decodeHtml(m[1]).trim();
  }
  return '';
}

function titleText(html) {
  return stripTags(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '');
}

function isPrivateIp(address) {
  const ip = String(address || '').toLowerCase();
  if (net.isIP(ip) === 4) {
    const p = ip.split('.').map(Number);
    return p[0] === 10 || p[0] === 127 || p[0] === 0 ||
      (p[0] === 169 && p[1] === 254) || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
      (p[0] === 192 && p[1] === 168) || (p[0] === 100 && p[1] >= 64 && p[1] <= 127) ||
      p[0] >= 224;
  }
  if (net.isIP(ip) === 6) {
    if (ip.startsWith('::ffff:')) {
      const mapped = ip.slice(7);
      if (net.isIP(mapped) === 4) return isPrivateIp(mapped);
    }
    return ip === '::1' || ip === '::' || ip.startsWith('fc') || ip.startsWith('fd') || ip.startsWith('fe8') || ip.startsWith('fe9') || ip.startsWith('fea') || ip.startsWith('feb');
  }
  return false;
}

async function assertPublicUrl(raw) {
  let url;
  try { url = new URL(String(raw || '').trim()); } catch { throw new Error('Provide a valid public http/https URL.'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only public http/https URLs are supported.');
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!host || host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) throw new Error('Local/private URLs are not allowed.');
  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new Error('Local/private URLs are not allowed.');
  } else {
    const rows = await dns.lookup(host, { all: true, verbatim: true }).catch(() => []);
    if (!rows.length) throw new Error('Domain could not be resolved.');
    if (rows.some((row) => isPrivateIp(row.address))) throw new Error('Local/private URLs are not allowed.');
  }
  return url;
}

async function readTextLimited(response, maxBytes = MAX_PAGE_BYTES) {
  const announced = Number(response.headers.get('content-length') || 0);
  if (announced && announced > maxBytes) throw new Error('Page is too large to inspect safely.');
  if (!response.body?.getReader) {
    const buf = Buffer.from(await response.arrayBuffer());
    if (buf.length > maxBytes) throw new Error('Page is too large to inspect safely.');
    return buf.toString('utf8');
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new Error('Page is too large to inspect safely.');
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function fetchPublicPage(rawUrl, { timeoutMs = 15000, maxBytes = MAX_PAGE_BYTES, accept = 'text/html,application/xhtml+xml' } = {}) {
  let current = await assertPublicUrl(rawUrl);
  for (let hop = 0; hop < 5; hop += 1) {
    const response = await fetch(current, {
      redirect: 'manual',
      headers: { 'user-agent': UA, accept, 'accept-language': 'en-US,en;q=0.8' },
      signal: AbortSignal.timeout(timeoutMs)
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) throw new Error(`Redirect ${response.status} had no destination.`);
      current = await assertPublicUrl(new URL(location, current).toString());
      continue;
    }
    const type = String(response.headers.get('content-type') || '').toLowerCase();
    if (!response.ok) throw new Error(`Public page returned ${response.status}.`);
    if (type && !/text\/html|application\/xhtml\+xml|application\/json|text\/plain/.test(type)) throw new Error('The URL did not return an inspectable public page.');
    const text = await readTextLimited(response, maxBytes);
    return { url: current.toString(), status: response.status, contentType: type, text };
  }
  throw new Error('Too many redirects.');
}

function normalizeResultUrl(raw) {
  const value = decodeHtml(raw || '');
  try {
    const url = new URL(value, 'https://html.duckduckgo.com');
    const redirected = url.searchParams.get('uddg');
    const finalUrl = redirected ? decodeURIComponent(redirected) : url.toString();
    if (!/^https?:\/\//i.test(finalUrl)) return '';
    return finalUrl;
  } catch { return ''; }
}

function cacheGet(key) {
  const item = searchCache.get(key);
  if (!item || Date.now() - item.at > SEARCH_CACHE_MS) { searchCache.delete(key); return null; }
  return item.value;
}
function cacheSet(key, value) {
  searchCache.set(key, { at: Date.now(), value });
  if (searchCache.size > 80) searchCache.delete(searchCache.keys().next().value);
  return value;
}

export async function searchWeb(rawQuery, limit = 6) {
  const query = String(rawQuery || '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 220);
  if (!query) throw new Error('Provide something to search.');
  const wanted = Math.max(1, Math.min(10, Number(limit) || 6));
  const cacheKey = `${query}\u0000${wanted}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const rows = [];
  try {
    const url = new URL('https://html.duckduckgo.com/html/');
    url.searchParams.set('q', query);
    const response = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html' }, signal: AbortSignal.timeout(12000) });
    if (response.ok) {
      const html = await readTextLimited(response, 1024 * 1024);
      for (const match of html.matchAll(/<a[^>]+class=["'][^"']*result__a[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
        const resultUrl = normalizeResultUrl(match[1]);
        const title = stripTags(match[2]);
        if (!resultUrl || !title || rows.some((r) => r.url === resultUrl)) continue;
        rows.push({ title: truncate(title, 180), url: resultUrl, source: 'DuckDuckGo' });
        if (rows.length >= wanted) break;
      }
    }
  } catch {}

  if (!rows.length) {
    try {
      const url = new URL('https://www.bing.com/search');
      url.searchParams.set('q', query);
      url.searchParams.set('count', String(wanted));
      const response = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html' }, signal: AbortSignal.timeout(12000) });
      if (response.ok) {
        const html = await readTextLimited(response, 1024 * 1024);
        for (const match of html.matchAll(/<li[^>]+class=["'][^"']*b_algo[^"']*["'][\s\S]*?<h2[^>]*>\s*<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
          const resultUrl = decodeHtml(match[1]);
          const title = stripTags(match[2]);
          if (!/^https?:\/\//i.test(resultUrl) || !title || rows.some((r) => r.url === resultUrl)) continue;
          rows.push({ title: truncate(title, 180), url: resultUrl, source: 'Bing' });
          if (rows.length >= wanted) break;
        }
      }
    } catch {}
  }

  return cacheSet(cacheKey, rows);
}

function safeUsername(raw) {
  const value = String(raw || '').trim().replace(/^@+/, '');
  if (!/^[A-Za-z0-9._-]{2,40}$/.test(value)) throw new Error('Provide a valid public username/ID.');
  return value;
}

function walkForUserInfo(root, username) {
  const seen = new Set();
  const stack = [{ value: root, depth: 0 }];
  while (stack.length) {
    const { value, depth } = stack.pop();
    if (!value || typeof value !== 'object' || seen.has(value) || depth > 10) continue;
    seen.add(value);
    if (value.user && value.stats && typeof value.user === 'object' && typeof value.stats === 'object') {
      const id = String(value.user.uniqueId || value.user.unique_id || '').toLowerCase();
      if (!id || id === username.toLowerCase()) return value;
    }
    for (const child of Object.values(value)) if (child && typeof child === 'object') stack.push({ value: child, depth: depth + 1 });
  }
  return null;
}


function collectVisibleVideoViews(root) {
  const seenObjects = new Set();
  const seenVideos = new Set();
  const stack = [{ value: root, depth: 0 }];
  let views = 0;
  let sampledVideos = 0;
  while (stack.length) {
    const { value, depth } = stack.pop();
    if (!value || typeof value !== 'object' || seenObjects.has(value) || depth > 11) continue;
    seenObjects.add(value);

    const id = String(value.id || value.awemeId || value.itemId || '').trim();
    const play = Number(value?.stats?.playCount ?? value?.statistics?.playCount ?? value?.playCount ?? 0);
    if (id && Number.isFinite(play) && play >= 0 && !seenVideos.has(id)) {
      seenVideos.add(id);
      views += play;
      sampledVideos += 1;
    }

    for (const child of Object.values(value)) {
      if (child && typeof child === 'object') stack.push({ value: child, depth: depth + 1 });
    }
  }
  return { views, sampledVideos };
}

function parseJsonScript(html, id) {
  const re = new RegExp(`<script[^>]+id=["']${id}["'][^>]*>([\\s\\S]*?)<\\/script>`, 'i');
  const raw = html.match(re)?.[1]?.trim();
  if (!raw) return null;
  try { return JSON.parse(decodeHtml(raw)); } catch {
    try { return JSON.parse(raw); } catch { return null; }
  }
}

export async function getTikTokProfile(rawUsername) {
  const username = safeUsername(rawUsername);
  const page = await fetchPublicPage(`https://www.tiktok.com/@${encodeURIComponent(username)}`, { timeoutMs: 18000, maxBytes: 5 * 1024 * 1024 });
  const html = page.text;
  let info = null;
  let visibleViewStats = { views: 0, sampledVideos: 0 };
  for (const id of ['__UNIVERSAL_DATA_FOR_REHYDRATION__', 'SIGI_STATE']) {
    const data = parseJsonScript(html, id);
    if (!data) continue;
    const candidateViews = collectVisibleVideoViews(data);
    if (candidateViews.sampledVideos > visibleViewStats.sampledVideos) visibleViewStats = candidateViews;
    info = walkForUserInfo(data, username);
    if (info) break;
    const module = data?.UserModule;
    if (module?.users && module?.stats) {
      const user = Object.values(module.users).find((row) => String(row?.uniqueId || '').toLowerCase() === username.toLowerCase());
      if (user) info = { user, stats: module.stats[user.id] || {} };
    }
    if (info) break;
  }

  const user = info?.user || {};
  const stats = info?.stats || {};
  const ogTitle = metaContent(html, 'og:title');
  const ogDesc = metaContent(html, 'og:description');
  const ogImage = metaContent(html, 'og:image');
  return {
    platform: 'TikTok',
    username: user.uniqueId || username,
    nickname: user.nickname || stripTags(ogTitle).replace(/\(@[^)]+\).*$/, '').trim() || username,
    bio: user.signature || ogDesc || '',
    verified: Boolean(user.verified),
    avatar: user.avatarLarger || user.avatarMedium || user.avatarThumb || ogImage || '',
    followers: Number(stats.followerCount ?? stats.followers ?? 0),
    following: Number(stats.followingCount ?? stats.following ?? 0),
    likes: Number(stats.heartCount ?? stats.heart ?? 0),
    videos: Number(stats.videoCount ?? stats.videos ?? 0),
    friends: Number(stats.friendCount ?? 0),
    visibleViews: Number(visibleViewStats.views || 0),
    visibleViewVideos: Number(visibleViewStats.sampledVideos || 0),
    profileUrl: page.url
  };
}

export async function getSnapchatProfile(rawUsername) {
  const username = safeUsername(rawUsername);
  const page = await fetchPublicPage(`https://www.snapchat.com/add/${encodeURIComponent(username)}`, { timeoutMs: 16000 });
  const html = page.text;
  const canonical = linkHref(html, 'canonical') || page.url;
  return {
    platform: 'Snapchat',
    username,
    title: metaContent(html, 'og:title') || titleText(html) || username,
    description: metaContent(html, 'og:description') || metaContent(html, 'description', 'name') || '',
    avatar: metaContent(html, 'og:image') || '',
    profileUrl: canonical
  };
}

export async function seoAudit(rawUrl) {
  let value = String(rawUrl || '').trim();
  if (value && !/^https?:\/\//i.test(value)) value = `https://${value}`;
  const page = await fetchPublicPage(value, { timeoutMs: 18000 });
  const html = page.text;
  const visible = stripTags(html);
  const title = titleText(html);
  const description = metaContent(html, 'description', 'name');
  const canonical = linkHref(html, 'canonical');
  const robots = metaContent(html, 'robots', 'name');
  const viewport = metaContent(html, 'viewport', 'name');
  const ogTitle = metaContent(html, 'og:title');
  const ogDescription = metaContent(html, 'og:description');
  const h1 = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) => stripTags(m[1])).filter(Boolean);
  const links = [...html.matchAll(/<a\b[^>]+href=/gi)].length;
  const images = [...html.matchAll(/<img\b/gi)].length;
  const jsonLd = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["']/gi)].length;
  const words = visible ? visible.split(/\s+/).filter(Boolean).length : 0;
  return {
    url: page.url,
    status: page.status,
    title,
    description,
    canonical,
    robots,
    viewport: Boolean(viewport),
    ogTitle,
    ogDescription,
    h1,
    links,
    images,
    jsonLd,
    words
  };
}
