// Upstream libsignal-node logs Signal session objects directly to console,
// independently of Baileys' Pino logger. Those objects include ephemeral
// private keys and root keys. Do not print those object graphs.
// Only redacts the known session lifecycle messages with a Signal record.
const SENSITIVE_MESSAGES = new Set([
  'Closing session:',
  'Opening session:',
  'Removing old closed session:',
  'Session already closed'
]);
const methods = ['info', 'warn', 'log'];

function hasSignalSessionShape(value) {
  return value !== null && typeof value === 'object' &&
    ('currentRatchet' in value || '_chains' in value || 'indexInfo' in value);
}

export function installSignalLogRedaction(consoleObject = console, { now = Date.now, summaryIntervalMs = 300000 } = {}) {
  const originals = new Map();
  const lastSummary = new Map();
  for (const method of methods) {
    if (typeof consoleObject[method] !== 'function') continue;
    const original = consoleObject[method];
    originals.set(method, original);
    consoleObject[method] = function (...args) {
      const label = typeof args[0] === 'string' ? args[0].trim() : '';
      if (SENSITIVE_MESSAGES.has(label) && hasSignalSessionShape(args[1])) {
        const last = lastSummary.get(label);
        const current = now();
        if (last === undefined || current - last >= summaryIntervalMs) {
          lastSummary.set(label, current);
          original.call(this, '[signal] Session lifecycle update (sensitive key material redacted)');
        }
        return;
      }
      return original.apply(this, args);
    };
  }
  return () => {
    for (const [method, original] of originals) consoleObject[method] = original;
  };
}
