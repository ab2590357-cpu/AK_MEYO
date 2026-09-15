import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { config } from '../config.js';

const SEARCH_URL = 'https://ws75.aptoide.com/api/7/apps/search';
const META_URL = 'https://ws2.aptoide.com/api/7/app/getMeta';
const MAX_APK_BYTES = 200 * 1024 * 1024;
const SAFE_DOWNLOAD_DOMAINS = ['aptoide.com', 'aptoideusercontent.com', 'aptoidecdn.com'];
const BLOCKED_QUERY = /\b(?:mod(?:ded)?|crack(?:ed)?|premium\s*unlocked|hack(?:ed)?|cheat(?:ed)?|patched|unlocked\s*pro)\b/i;

function hostMatches(host, domain) {
  return host === domain || host.endsWith(`.${domain}`);
}

function normalizeQuery(value = '') {
  const q = String(value || '').replace(/[\r\n\t]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100);
  if (q.length < 2) throw new Error('Type an Android app or game name after .apk.');
  if (BLOCKED_QUERY.test(q)) throw new Error('A-X-HK APK only fetches normal public app/game releases, not modded/cracked builds.');
  return q;
}

function normalizeText(value = '') {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function safeFilePart(value = 'app') {
  return String(value || 'app').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'app';
}

function prettyBytes(bytes) {
  const n = Number(bytes || 0);
  if (!n) return 'Unknown';
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function validateAptoideUrl(raw) {
  let url;
  try { url = new URL(String(raw || '')); } catch { throw new Error('The APK mirror returned an invalid download URL.'); }
  if (url.protocol !== 'https:') throw new Error('APK download must use HTTPS.');
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  if (!SAFE_DOWNLOAD_DOMAINS.some((domain) => hostMatches(host, domain))) {
    throw new Error('APK download host is not in the trusted Aptoide allow-list.');
  }
  return url.toString();
}

async function fetchJson(url, timeoutMs = 18_000) {
  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
      'user-agent': `A-X-HK/${config.version} Android APK Finder`
    },
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!response.ok) throw new Error(`APK metadata service returned ${response.status}.`);
  return response.json();
}

function searchRows(json) {
  if (Array.isArray(json?.datalist?.list)) return json.datalist.list;
  if (Array.isArray(json?.data?.list)) return json.data.list;
  if (Array.isArray(json?.list)) return json.list;
  if (Array.isArray(json?.data)) return json.data;
  return [];
}

function metaRow(json) {
  if (json?.data && !Array.isArray(json.data)) return json.data;
  if (json?.datalist?.list?.[0]) return json.datalist.list[0];
  if (json?.app) return json.app;
  return json || null;
}

function scoreApp(app, query) {
  const q = normalizeText(query);
  const name = normalizeText(app?.name || '');
  const pkg = String(app?.package || app?.package_name || '').toLowerCase();
  let score = 0;
  if (name === q) score += 100;
  if (pkg === String(query || '').toLowerCase()) score += 130;
  if (name.startsWith(q)) score += 35;
  if (name.includes(q)) score += 20;
  const rank = String(app?.file?.malware?.rank || '').toUpperCase();
  if (rank === 'TRUSTED') score += 60;
  score += Math.min(15, Math.log10(Math.max(1, Number(app?.stats?.downloads || app?.downloads || 0))) * 2);
  return score;
}

function normalizeApp(raw, { trustedSearch = false } = {}) {
  if (!raw || typeof raw !== 'object') return null;
  const file = raw.file || raw.apk?.file || {};
  const packageName = raw.package || raw.package_name || raw.packageName || '';
  const primary = file.path || file.path_alt || raw.path || raw.download_url || raw.downloadUrl || '';
  const alternate = file.path_alt || file.path || raw.path_alt || '';
  if (!packageName || !primary) return null;

  let downloadUrl;
  let altDownloadUrl = '';
  try { downloadUrl = validateAptoideUrl(primary); } catch { return null; }
  try { if (alternate && alternate !== primary) altDownloadUrl = validateAptoideUrl(alternate); } catch {}

  const malwareRank = String(file?.malware?.rank || raw?.malware?.rank || '').toUpperCase();
  if (malwareRank && malwareRank !== 'TRUSTED') return null;
  if (!malwareRank && !trustedSearch) return null;

  return {
    name: raw.name || packageName || 'Android App',
    package: packageName,
    version: file.vername || raw.vername || raw.version || '',
    versionCode: file.vercode || raw.vercode || raw.version_code || '',
    size: Number(file.filesize || raw.size || raw.filesize || 0),
    downloads: Number(raw.stats?.downloads || raw.downloads || 0),
    md5: String(file.md5sum || raw.md5sum || raw.md5 || '').toLowerCase(),
    icon: raw.icon || raw.graphic || '',
    downloadUrl,
    altDownloadUrl,
    malwareRank: malwareRank || 'TRUSTED_FILTER',
    trustSource: malwareRank === 'TRUSTED' ? 'Aptoide malware rank: TRUSTED' : 'Aptoide trusted-search filter'
  };
}

async function searchRaw(query, limit) {
  const count = Math.max(1, Math.min(12, limit));
  const queryStyle = new URL(SEARCH_URL);
  queryStyle.searchParams.set('query', query);
  queryStyle.searchParams.set('limit', String(count));
  queryStyle.searchParams.set('mature', 'false');
  queryStyle.searchParams.set('trusted', 'true');
  queryStyle.searchParams.set('aab', 'false');

  try {
    const json = await fetchJson(queryStyle, 18_000);
    const rows = searchRows(json);
    if (rows.length) return rows;
  } catch {}

  const pathStyle = `${SEARCH_URL}/query=${encodeURIComponent(query)}/limit=${count}/mature=false/trusted=true/aab=false`;
  const json = await fetchJson(pathStyle, 18_000);
  return searchRows(json);
}

async function getMetaByPackage(packageName) {
  const pkg = String(packageName || '').trim();
  if (!pkg) return null;
  const pathStyle = `${META_URL}/package_name=${encodeURIComponent(pkg)}`;
  try { return metaRow(await fetchJson(pathStyle, 18_000)); }
  catch {
    const queryStyle = new URL(META_URL);
    queryStyle.searchParams.set('package_name', pkg);
    try { return metaRow(await fetchJson(queryStyle, 18_000)); } catch { return null; }
  }
}

async function enrichCandidate(raw) {
  const packageName = raw?.package || raw?.package_name || raw?.packageName || '';
  if (packageName) {
    const meta = await getMetaByPackage(packageName);
    const normalized = normalizeApp(meta, { trustedSearch: true });
    if (normalized) {
      // Preserve search stats/name when the metadata endpoint omits them.
      normalized.name ||= raw?.name || packageName;
      if (!normalized.downloads) normalized.downloads = Number(raw?.stats?.downloads || raw?.downloads || 0);
      if (!normalized.icon) normalized.icon = raw?.icon || '';
      return normalized;
    }
  }
  return normalizeApp(raw, { trustedSearch: true });
}

export async function searchApks(input, limit = 5) {
  const query = normalizeQuery(input);
  const wanted = Math.max(1, Math.min(10, limit));
  const raw = await searchRaw(query, Math.max(wanted + 3, 8));
  const sorted = [...raw].sort((a, b) => scoreApp(b, query) - scoreApp(a, query));
  const out = [];

  // Metadata requests are intentionally bounded; this keeps the command responsive.
  for (const candidate of sorted.slice(0, Math.min(10, sorted.length))) {
    try {
      const app = await enrichCandidate(candidate);
      if (!app) continue;
      out.push(app);
      if (out.length >= wanted) break;
    } catch {}
  }
  return out;
}

async function fetchApk(url) {
  const response = await fetch(url, {
    redirect: 'follow',
    headers: { 'user-agent': `A-X-HK/${config.version} APK Downloader` },
    signal: AbortSignal.timeout(180_000)
  });
  if (!response.ok || !response.body) throw new Error(`APK download failed (${response.status}).`);
  validateAptoideUrl(response.url || url);
  return response;
}

export async function downloadApkByName(input) {
  const query = normalizeQuery(input);
  const results = await searchApks(query, 5);
  const app = results[0];
  if (!app) throw new Error('No trusted public APK mirror result was found for that app/game name.');
  if (app.size && app.size > MAX_APK_BYTES) {
    throw new Error(`APK is ${prettyBytes(app.size)}, above the A-X-HK safe transfer limit of ${prettyBytes(MAX_APK_BYTES)}.`);
  }

  let response;
  let lastError;
  for (const url of [app.downloadUrl, app.altDownloadUrl].filter(Boolean)) {
    try { response = await fetchApk(url); break; }
    catch (err) { lastError = err; }
  }
  if (!response) throw lastError || new Error('APK download failed.');

  const announced = Number(response.headers.get('content-length') || 0);
  if (announced && announced > MAX_APK_BYTES) throw new Error(`APK is ${prettyBytes(announced)}, above the A-X-HK transfer limit.`);

  const tempDir = path.join(os.tmpdir(), 'axhk-apk');
  await fs.mkdir(tempDir, { recursive: true });
  const fileName = `${safeFilePart(app.name)}-${safeFilePart(app.version || 'latest')}.apk`;
  const filePath = path.join(tempDir, `${Date.now()}-${crypto.randomBytes(5).toString('hex')}-${fileName}`);
  const md5 = crypto.createHash('md5');
  let bytes = 0;
  const meter = new Transform({
    transform(chunk, encoding, callback) {
      bytes += chunk.length;
      if (bytes > MAX_APK_BYTES) return callback(new Error(`APK exceeded the A-X-HK ${prettyBytes(MAX_APK_BYTES)} transfer limit.`));
      md5.update(chunk);
      callback(null, chunk);
    }
  });

  try {
    await pipeline(Readable.fromWeb(response.body), meter, createWriteStream(filePath, { flags: 'wx' }));
    const header = Buffer.alloc(4);
    const handle = await fs.open(filePath, 'r');
    try { await handle.read(header, 0, 4, 0); } finally { await handle.close(); }
    if (header[0] !== 0x50 || header[1] !== 0x4b) throw new Error('Downloaded file is not a valid APK/ZIP container.');
    const actualMd5 = md5.digest('hex').toLowerCase();
    if (app.md5 && /^[a-f0-9]{32}$/.test(app.md5) && actualMd5 !== app.md5) throw new Error('APK checksum verification failed.');
    return { ...app, filePath, fileName, downloadedBytes: bytes, actualMd5 };
  } catch (err) {
    await fs.rm(filePath, { force: true }).catch(() => {});
    throw err;
  }
}

export async function cleanupApk(item) {
  if (item?.filePath) await fs.rm(item.filePath, { force: true }).catch(() => {});
}

export function apkStoreInfo() {
  return {
    provider: 'Aptoide public v7 API',
    maxBytes: MAX_APK_BYTES,
    maxText: prettyBytes(MAX_APK_BYTES),
    trustedOnly: true
  };
}
