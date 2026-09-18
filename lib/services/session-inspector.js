import { db } from '../core/database.js';
import { config } from '../config.js';
import { waManager } from './whatsapp.js';
import { bareNumber, cleanJid } from '../utils/text.js';

const digits = (value = '') => String(value || '').replace(/\D/g, '');

export function safeSessionText(value = '', fallback = '-') {
  const text = String(value ?? '').replace(/[\r\n\t]+/g, ' ').trim();
  return text || fallback;
}

function mainPhone() {
  const inst = waManager.getInstance('main');
  return digits(bareNumber(cleanJid(inst?.state?.user?.id || '')) || inst?.runtime?.().ownerNumber || config.ownerNumber);
}

export function listInspectableSessions() {
  const rows = [];
  const main = waManager.getInstance('main');
  const mainSnap = main?.snapshot?.() || {};

  rows.push({
    id: 'main',
    isMain: true,
    label: 'Owner Session',
    phone: mainPhone(),
    linkedName: mainSnap.user?.name || config.ownerName || 'Owner',
    status: mainSnap.status || 'offline',
    connected: mainSnap.status === 'connected' && Boolean(mainSnap.sessionRegistered),
    registered: Boolean(mainSnap.sessionRegistered),
    enabled: true,
    createdAt: null,
    lastActiveAt: mainSnap.connectedAt || null,
    lastConnectedAt: mainSnap.connectedAt || null,
    expiresAt: null,
    version: mainSnap.version || null,
    reconnectAttempt: Number(mainSnap.reconnectAttempt || 0)
  });

  for (const [id, meta] of Object.entries(db.data.linkedSessions || {})) {
    const inst = waManager.getInstance(id);
    const snap = inst?.snapshot?.() || {};
    const runtime = inst?.runtime?.() || {};
    const phone = digits(
      bareNumber(cleanJid(snap.user?.id || '')) ||
      runtime.ownerNumber ||
      meta.linkedNumber ||
      meta.phone ||
      ''
    );

    rows.push({
      id,
      isMain: false,
      label: meta.label || 'Linked User',
      phone,
      linkedName: snap.user?.name || meta.linkedName || meta.label || 'Linked User',
      status: snap.status || meta.lastStatus || 'offline',
      connected: snap.status === 'connected' && Boolean(snap.sessionRegistered),
      registered: Boolean(snap.sessionRegistered),
      enabled: meta.enabled !== false,
      createdAt: meta.createdAt || null,
      lastActiveAt: meta.lastActiveAt || null,
      lastConnectedAt: meta.lastConnectedAt || snap.connectedAt || null,
      expiresAt: meta.expiresAt || null,
      version: snap.version || null,
      reconnectAttempt: Number(snap.reconnectAttempt || 0)
    });
  }

  return rows;
}

export function resolveInspectableSession(input = '') {
  const q = String(input || '').trim();
  const qDigits = digits(q);
  const rows = listInspectableSessions();

  if (!q) return null;
  if (q.toLowerCase() === 'main') return rows.find((r) => r.id === 'main') || null;

  const byId = rows.find((r) => r.id.toLowerCase() === q.toLowerCase());
  if (byId) return byId;

  if (qDigits) {
    const exact = rows.find((r) => r.phone === qDigits);
    if (exact) return exact;
    const suffix = rows.filter((r) => r.phone && (r.phone.endsWith(qDigits) || qDigits.endsWith(r.phone)));
    if (suffix.length === 1) return suffix[0];
  }

  return null;
}

export function formatSessionDate(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return safeSessionText(value);
  try {
    return new Intl.DateTimeFormat('en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: config.timezone || 'Asia/Karachi'
    }).format(d);
  } catch {
    return d.toISOString();
  }
}
