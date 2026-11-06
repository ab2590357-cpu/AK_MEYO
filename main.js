// A-X-HK entry point: protect Signal ratchet data before loading Baileys.
import { installSignalLogRedaction } from './lib/core/signal-log-redaction.js';
installSignalLogRedaction();
await import('./lib/index.js');
