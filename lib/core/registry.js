const commands = new Map();
const categories = new Map();
const disabledCommandNames = new Set(['afk']);

export function registerCommand(definition) {
  if (!definition?.name || typeof definition.run !== 'function') {
    throw new Error('Invalid command definition');
  }
  const def = {
    aliases: [],
    category: 'general',
    description: 'No description',
    usage: '',
    ownerOnly: false,
    masterOnly: false,
    groupOnly: false,
    adminOnly: false,
    botAdminRequired: false,
    cooldown: 2,
    ...definition
  };
  const keys = [def.name, ...def.aliases].map((v) => String(v).toLowerCase());
  if (keys.some((key) => disabledCommandNames.has(key))) return null;
  for (const key of keys) {
    const existing = commands.get(key);
    if (existing && existing.name !== def.name) {
      throw new Error(`Duplicate command/alias key: ${key} (${existing.name} vs ${def.name})`);
    }
    commands.set(key, def);
  }
  if (!categories.has(def.category)) categories.set(def.category, new Set());
  categories.get(def.category).add(def.name);
  return def;
}

export function getCommand(name) {
  return commands.get(String(name || '').toLowerCase());
}

export function allCommands() {
  const unique = new Map();
  for (const cmd of commands.values()) unique.set(cmd.name, cmd);
  return [...unique.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function commandsByCategory() {
  const out = {};
  for (const cmd of allCommands()) {
    if (!out[cmd.category]) out[cmd.category] = [];
    out[cmd.category].push(cmd);
  }
  return out;
}

export function commandKeyCount() {
  return commands.size;
}
