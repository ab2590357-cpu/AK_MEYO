import { truncate } from '../utils/text.js';

const GOOGLE_TRANSLATE_URL = 'https://translate.googleapis.com/translate_a/single';
const MYMEMORY_TRANSLATE_URL = 'https://api.mymemory.translated.net/get';

function cleanCode(value, fallback = '') {
  const code = String(value || '').trim().toLowerCase();
  return /^[a-z]{2,3}(?:-[a-z]{2,4})?$/.test(code) ? code : fallback;
}

function mostlyLatin(text) {
  const letters = String(text || '').match(/\p{L}/gu) || [];
  if (!letters.length) return true;
  const latin = String(text || '').match(/[A-Za-z]/g) || [];
  return latin.length / letters.length >= 0.75;
}

async function googleTranslate(text, targetCode, sourceCode, timeoutMs) {
  const url = new URL(GOOGLE_TRANSLATE_URL);
  url.searchParams.set('client', 'gtx');
  url.searchParams.set('sl', sourceCode || 'auto');
  url.searchParams.set('tl', targetCode);
  url.searchParams.set('dt', 't');
  url.searchParams.set('q', text);

  const response = await fetch(url, {
    headers: { 'user-agent': 'Mozilla/5.0 A-X-HK-WhatsApp-Bot/4.10.1' },
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Google translate returned ${response.status}: ${truncate(detail, 180)}`);
  }

  const data = await response.json();
  const translated = Array.isArray(data?.[0])
    ? data[0].map((part) => Array.isArray(part) ? String(part[0] || '') : '').join('')
    : '';
  if (!translated.trim()) throw new Error('Google translate returned no text.');
  return translated.trim();
}

async function myMemoryTranslate(text, targetCode, sourceCode, timeoutMs) {
  // MyMemory needs an explicit source language. It is a useful no-key fallback
  // for the common English/Latin -> target use case when Google is unavailable.
  const source = cleanCode(sourceCode) || (mostlyLatin(text) ? 'en' : '');
  if (!source || source === targetCode) throw new Error('No safe source language for translator fallback.');

  const url = new URL(MYMEMORY_TRANSLATE_URL);
  url.searchParams.set('q', text.slice(0, 450));
  url.searchParams.set('langpair', `${source}|${targetCode}`);

  const response = await fetch(url, {
    headers: { 'user-agent': 'A-X-HK-WhatsApp-Bot/4.10.1' },
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`MyMemory returned ${response.status}: ${truncate(detail, 180)}`);
  }

  const data = await response.json();
  const translated = String(data?.responseData?.translatedText || '').trim();
  if (!translated) throw new Error('MyMemory returned no text.');
  return translated;
}

export async function translateText(text, targetCode, { sourceCode = 'auto', timeoutMs = 15000 } = {}) {
  const value = String(text || '').trim();
  const target = cleanCode(targetCode);
  const source = sourceCode === 'auto' ? 'auto' : cleanCode(sourceCode, 'auto');
  if (!value) throw new Error('Provide text to translate.');
  if (!target) throw new Error('Unsupported translation language code.');
  if (value.length > 5000) throw new Error('Translation text is too long (max 5000 characters).');

  const errors = [];
  try {
    return await googleTranslate(value, target, source, timeoutMs);
  } catch (err) {
    errors.push(err);
  }

  try {
    return await myMemoryTranslate(value, target, source, Math.min(timeoutMs, 12000));
  } catch (err) {
    errors.push(err);
  }

  const detail = errors.map((err) => err?.message).filter(Boolean).join(' | ');
  throw new Error(`Direct translation services are unavailable.${detail ? ` ${truncate(detail, 260)}` : ''}`);
}
