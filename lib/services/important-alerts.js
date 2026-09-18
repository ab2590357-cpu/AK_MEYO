import { config } from '../config.js';
import { db } from '../core/database.js';
import { logger } from '../core/logger.js';
import { cleanJid } from '../utils/text.js';
import { recentChatMessages } from './chat-history.js';
import { askAI } from './ai.js';

const memoryAlertAt = new Map();
const DEFAULT_COOLDOWN_MINUTES = 30;

function compact(value = '', max = 500) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
}

function signalScore(text = '') {
  const value = String(text || '').toLowerCase();
  let score = 0;
  const hit = (re, points) => { if (re.test(value)) score += points; };

  hit(/\b(urgent|asap|emergency|immediately|today|jaldi|foran|zaroor|important)\b/i, 3);
  hit(/\b(payment|paid|pay|budget|invoice|advance|deposit|quotation|quote|price|usd|pkr|dollar|rupees?|rs\.?|refund|dispute)\b|\$/i, 3);
  hit(/\b(deadline|delivery|launch|complete|finish|due|kal|tomorrow|tonight)\b/i, 2);
  hit(/\b(complaint|security|hacked|hack|fraud|legal|problem|issue|broken|not working|critical)\b/i, 3);
  hit(/\b(abdullah|owner|personally|directly|call me|contact me|speak to|baat karni|baat kara|reply kare|contact kare)\b/i, 3);
  hit(/\b(project|shopify|website|store|app|application|bot|automation|dashboard|design|develop|development|developer|build|custom software|tool)\b/i, 2);
  hit(/\b(client|business|company|order|hire|work with|service chahiye|banwana|banwani|banana hai|karwana)\b/i, 2);
  return score;
}

function fallbackClassification(text = '') {
  const score = signalScore(text);
  const lower = String(text || '').toLowerCase();
  const high = score >= 6 || /payment|budget|urgent|asap|complaint|hacked|fraud|legal|abdullah.*(call|contact|reply)|owner.*(call|contact|reply)/i.test(lower);
  if (high) {
    return {
      important: true,
      priority: 'high',
      reason: 'Urgent, commercial, security, complaint, payment, or direct-owner attention signal',
      summary: compact(text, 240)
    };
  }
  if (score >= 4) {
    return {
      important: true,
      priority: 'medium',
      reason: 'Serious project/service inquiry or deadline-related message',
      summary: compact(text, 240)
    };
  }
  return { important: false, priority: 'normal', reason: '', summary: '' };
}

function parseClassification(raw = '', fallback) {
  const value = String(raw || '').trim().replace(/^~~~json\s*/i, '').replace(/^~~~/, '').replace(/~~~$/, '').trim();
  try {
    const data = JSON.parse(value);
    const priority = ['high', 'medium', 'normal'].includes(String(data.priority || '').toLowerCase())
      ? String(data.priority).toLowerCase()
      : fallback.priority;
    return {
      important: Boolean(data.important),
      priority,
      reason: compact(data.reason || fallback.reason, 180),
      summary: compact(data.summary || fallback.summary, 320)
    };
  } catch {
    return fallback;
  }
}

function alertCooldownMs(settings = {}) {
  const minutes = Number(settings.importantAlertCooldownMinutes || DEFAULT_COOLDOWN_MINUTES);
  return Math.max(5, Math.min(240, Number.isFinite(minutes) ? minutes : DEFAULT_COOLDOWN_MINUTES)) * 60 * 1000;
}

function lastAlertForChat(chat = '') {
  const rows = Array.isArray(db.data.importantAlerts) ? db.data.importantAlerts : [];
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    if (rows[i]?.chat === chat) return rows[i];
  }
  return null;
}

function shouldSkipDuplicate(ctx, classification, now = Date.now()) {
  const key = String(ctx.sessionId) + ':' + String(ctx.chat);
  const lastMemory = memoryAlertAt.get(key) || 0;
  const previous = lastAlertForChat(ctx.chat);
  const lastPersisted = Number(previous?.at || 0);
  const last = Math.max(lastMemory, lastPersisted);
  const cooldown = alertCooldownMs(ctx.sessionSettings);
  if (!last || now - last >= cooldown) return false;
  if (classification.priority === 'high' && previous?.priority !== 'high' && now - last >= 5 * 60 * 1000) return false;
  return true;
}

function ownerTargets(ctx) {
  const rows = [];
  const add = (jid) => {
    const clean = cleanJid(jid || '');
    if (clean && !rows.includes(clean)) rows.push(clean);
  };
  if (config.ownerNumber) add(String(config.ownerNumber).replace(/\D/g, '') + '@s.whatsapp.net');
  add(ctx.botJid);
  add(ctx.sock?.user?.id);
  add(ctx.sock?.user?.lid);
  return rows;
}

async function classifyImportant(ctx) {
  const rows = recentChatMessages(ctx.sessionId, ctx.chat, 18);
  const transcript = rows.map((row) => {
    const who = row.fromMe ? 'Assistant/Owner' : 'User';
    return who + ': ' + compact(row.text, 700);
  }).join('\n');

  const fallback = fallbackClassification(ctx.text);
  if (signalScore(ctx.text) < 2) return fallback;

  try {
    const prompt = [
      'Classify whether Abdullah needs a private owner alert for this WhatsApp conversation.',
      'Return ONLY strict JSON with keys: important, priority, reason, summary.',
      'priority must be one of: high, medium, normal.',
      'HIGH: payment/budget/quote with serious intent, urgent deadline, complaint, security/fraud/legal issue, or a direct request to contact/speak with Abdullah personally.',
      'MEDIUM: credible project/service inquiry, business lead, deadline discussion, or a meaningful new development Abdullah should review.',
      'NORMAL: greetings, casual chat, general knowledge, bot-help questions, jokes, vague browsing, or ordinary conversation that does not need owner attention.',
      'Do not mark something important merely because the word important appears. Judge the conversation meaning.',
      'Keep summary under 240 characters and reason under 120 characters.',
      '',
      'Conversation:',
      transcript || ('User: ' + ctx.text)
    ].join('\n');

    const result = await askAI(prompt, 'owner-alert-classifier', {
      maxChars: 700,
      systemPrompt: 'You are a strict WhatsApp triage classifier. Output JSON only. Do not chat with the user.'
    });
    return parseClassification(result, fallback);
  } catch (err) {
    logger.warn({ err, sessionId: ctx.sessionId }, 'Important alert classifier fell back to local signals');
    return fallback;
  }
}

function formatAlert(ctx, result, now = Date.now()) {
  const from = ctx.senderNumber ? '+' + ctx.senderNumber : String(ctx.sender || 'Unknown');
  const when = new Date(now).toLocaleString('en-PK', { timeZone: config.timezone || 'Asia/Karachi' });
  return [
    '╭━━━〔 🚨 A_X_HK IMPORTANT ALERT 〕━━━╮',
    '┃ Priority : ' + String(result.priority || 'medium').toUpperCase(),
    '┃ From     : ' + from,
    '┃ Reason   : ' + compact(result.reason, 150),
    '╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
    '',
    '🧠 *SUMMARY*',
    compact(result.summary || ctx.text, 500),
    '',
    '💬 *LATEST MESSAGE*',
    compact(ctx.text, 700),
    '',
    '🕒 ' + when + ' PKT',
    '',
    'Use *.important* to view recent important conversations.',
    '',
    config.footerMessage
  ].join('\n');
}

export async function maybeSendImportantAlert(ctx) {
  if (!ctx || ctx.sessionId !== 'main' || ctx.msg?.key?.fromMe || ctx.isGroup) return false;
  if (ctx.sessionSettings?.importantAlerts === false) return false;
  if (!String(ctx.text || '').trim()) return false;

  const result = await classifyImportant(ctx);
  if (!result.important || !['high', 'medium'].includes(result.priority)) return false;

  const now = Date.now();
  if (shouldSkipDuplicate(ctx, result, now)) return false;

  const text = formatAlert(ctx, result, now);
  let sentTarget = '';
  let lastError = null;
  for (const target of ownerTargets(ctx)) {
    try {
      await ctx.sock.sendMessage(target, { text });
      sentTarget = target;
      break;
    } catch (err) {
      lastError = err;
    }
  }
  if (!sentTarget) {
    if (lastError) throw lastError;
    return false;
  }

  const record = {
    id: 'imp_' + now + '_' + Math.random().toString(36).slice(2, 8),
    at: now,
    chat: String(ctx.chat || ''),
    sender: String(ctx.senderNumber || ''),
    priority: result.priority,
    reason: compact(result.reason, 180),
    summary: compact(result.summary || ctx.text, 500),
    latestMessage: compact(ctx.text, 700)
  };
  db.data.importantAlerts ||= [];
  db.data.importantAlerts.push(record);
  if (db.data.importantAlerts.length > 100) db.data.importantAlerts = db.data.importantAlerts.slice(-100);
  memoryAlertAt.set(String(ctx.sessionId) + ':' + String(ctx.chat), now);
  await db.save();
  logger.info({ sessionId: ctx.sessionId, priority: result.priority }, 'Important owner alert sent');
  return true;
}

export function recentImportantAlerts(limit = 8) {
  const rows = Array.isArray(db.data.importantAlerts) ? db.data.importantAlerts : [];
  const n = Math.max(1, Math.min(20, Number(limit) || 8));
  return rows.slice(-n).reverse();
}

export function clearImportantAlerts() {
  db.data.importantAlerts = [];
  memoryAlertAt.clear();
}
