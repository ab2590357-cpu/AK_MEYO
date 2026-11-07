// Termux startup-import smoke test. Never opens a WhatsApp session or publishes anything.
import { loadPlugins } from '../lib/core/plugin-loader.js';
import { allCommands } from '../lib/core/registry.js';
console.log('A-X-HK: checking core modules...');
await import('../lib/services/whatsapp.js');
await import('../lib/services/web.js');
await import('../lib/services/channel-hub-worker.js');
console.log('A-X-HK: core imports OK; checking all required command plugins...');
const summary = await loadPlugins({
  logger: {
    info() {},
    warn() {},
    error(item, message) {
      console.warn(message, item?.plugin || '', item?.err?.message || '');
    }
  }
});
console.log(JSON.stringify({
  platform: process.platform,
  pluginsDiscovered: summary.discovered,
  pluginsLoaded: summary.loaded,
  commands: allCommands().length,
  failures: summary.failures
}, null, 2));
if (summary.failures.length > 0) {
  process.exitCode = 1;
  console.error('Some plugins still need Termux compatibility fixes.');
} else console.log('A-X-HK core startup imports PASS. No WhatsApp session was started.');
