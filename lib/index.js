import { config } from './config.js';
import { db } from './core/database.js';
import { logger } from './core/logger.js';

import { loadPlugins } from './core/plugin-loader.js';

import { waManager } from './services/whatsapp.js';
import { startWebServer } from './services/web.js';
import { adminAuth } from './services/admin-auth.js';
import { ensureMediaDownloader } from './services/media-downloader.js';
import { startReminderWorker, stopReminderWorker } from './services/reminders.js';
import { startBackgroundWorkers, stopBackgroundWorkers } from './services/background.js';

let webServer = null;
let shuttingDown = false;

async function closeServer(server) {
  if (!server?.listening) return;
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 5000);
    timer.unref?.();
    server.close(() => { clearTimeout(timer); resolve(); });
  });
}

async function gracefulShutdown(signal, exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal, exitCode }, 'A-X-HK graceful shutdown started');
  stopReminderWorker();
  stopBackgroundWorkers();
  try { await closeServer(webServer); } catch (err) { logger.warn({ err }, 'Web server close failed'); }
  try { await waManager.stopAll(); } catch (err) { logger.warn({ err }, 'WhatsApp shutdown failed'); }
  try { await db.save(); } catch (err) { logger.warn({ err }, 'Final database save failed'); }
  logger.info({ signal }, 'A-X-HK graceful shutdown complete');
  process.exit(exitCode);
}

process.on('SIGTERM', () => { gracefulShutdown('SIGTERM', 0).catch(() => process.exit(0)); });
process.on('SIGINT', () => { gracefulShutdown('SIGINT', 0).catch(() => process.exit(0)); });
process.on('unhandledRejection', (err) => logger.error({ err }, 'Unhandled rejection'));
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception');
  gracefulShutdown('uncaughtException', 1).catch(() => process.exit(1));
});

await loadPlugins({ logger });

await db.init();
await adminAuth.init();
webServer = startWebServer();
startReminderWorker((sessionId) => waManager.getSocket(sessionId));
startBackgroundWorkers(waManager);

logger.info(`${config.botName} starting`);
// Pre-warm the verified public-media downloader in the background so the first social download is faster.
ensureMediaDownloader().then(() => logger.info('A-X-HK public-media downloader ready')).catch((err) => logger.warn({ err }, 'Media downloader pre-warm skipped'));
waManager.start().catch((err) => logger.error({ err }, 'Initial WhatsApp start failed'));
