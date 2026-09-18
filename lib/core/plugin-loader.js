import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { allCommands, registerCommand } from './registry.js';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEFAULT_PLUGIN_DIR = path.join(PROJECT_ROOT, 'plugins');

function isPluginFile(name) {
  const lower = String(name || '').toLowerCase();
  if (name.startsWith('_') || name.startsWith('.')) return false;
  if (lower.endsWith('.disabled.js') || lower.endsWith('.disabled.mjs')) return false;
  return lower.endsWith('.js') || lower.endsWith('.mjs');
}

async function discoverPluginFiles(rootDir) {
  const found = [];
  async function walk(dir) {
    let entries = [];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (error) {
      if (error?.code === 'ENOENT' && dir === rootDir) return;
      throw error;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.') && !entry.name.startsWith('_')) await walk(fullPath);
      } else if (entry.isFile() && isPluginFile(entry.name)) {
        found.push(fullPath);
      }
    }
  }
  await walk(rootDir);
  return found.sort((a, b) => a.localeCompare(b));
}

function exportedDefinitions(moduleNamespace) {
  const candidates = [];
  const seen = new Set();
  const add = (value) => {
    const items = Array.isArray(value) ? value : [value];
    for (const item of items) {
      if (!item || typeof item !== 'object' || seen.has(item)) continue;
      seen.add(item);
      if (item.name && typeof item.run === 'function') candidates.push(item);
    }
  };
  add(moduleNamespace.default);
  if (moduleNamespace.commands !== moduleNamespace.default) add(moduleNamespace.commands);
  if (moduleNamespace.command !== moduleNamespace.default) add(moduleNamespace.command);
  return candidates;
}

function requiredPlugin(filePath, rootDir, requiredDirName) {
  if (!requiredDirName) return false;
  const relative = path.relative(rootDir, filePath);
  const firstSegment = relative.split(path.sep)[0];
  return firstSegment === requiredDirName;
}

export async function loadPlugins({
  pluginDir = DEFAULT_PLUGIN_DIR,
  requiredDirName = 'core',
  logger = console
} = {}) {
  const files = await discoverPluginFiles(pluginDir);
  // Personal AI pack inspects the live registry so load it after every normal
  // core/community plugin. This lets it skip aliases/names already owned by
  // existing commands instead of shadowing or crashing the bot.
  files.sort((a, b) => {
    const aPersonal = path.basename(a) === 'personal-ai-pack.js' ? 1 : 0;
    const bPersonal = path.basename(b) === 'personal-ai-pack.js' ? 1 : 0;
    return aPersonal - bPersonal || a.localeCompare(b);
  });
  const summary = { discovered: files.length, loaded: 0, registered: 0, failures: [] };

  for (const filePath of files) {
    const before = allCommands().length;
    try {
      const moduleNamespace = await import(pathToFileURL(filePath).href);
      const definitions = exportedDefinitions(moduleNamespace);
      for (const definition of definitions) {
        registerCommand(definition);
        summary.registered += 1;
      }
      const after = allCommands().length;
      if (after === before && definitions.length === 0) {
        throw new Error('Plugin loaded but registered no commands');
      }
      summary.loaded += 1;
    } catch (error) {
      const relative = path.relative(pluginDir, filePath) || path.basename(filePath);
      const failure = { file: relative, error: error?.message || String(error) };
      summary.failures.push(failure);
      if (requiredPlugin(filePath, pluginDir, requiredDirName)) {
        const wrapped = new Error(`Required plugin failed: ${relative}: ${failure.error}`);
        wrapped.cause = error;
        throw wrapped;
      }
      logger?.error?.({ err: error, plugin: relative }, 'A-X-HK custom plugin failed to load');
    }
  }

  logger?.info?.(summary, 'A-X-HK plugin loader ready');
  return summary;
}

export { DEFAULT_PLUGIN_DIR, discoverPluginFiles, isPluginFile };
