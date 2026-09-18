import { allCommands, commandsByCategory, getCommand } from './registry.js';

const STOP_WORDS = new Set([
  'the','a','an','is','are','am','to','for','of','in','on','and','or','this','that','it','me','my','you','your',
  'kya','hai','ka','ki','ke','ko','se','ye','ya','mein','main','batao','bata','kar','karo','kr','ky','kis','liye',
  'what','does','do','can','how','which','command','commands','bot','available','feature','features'
]);

function cleanWords(value = '') {
  return [...new Set(String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9_\-.\s]/g, ' ')
    .split(/\s+/)
    .map((v) => v.replace(/^\.+/, '').trim())
    .filter((v) => v.length > 1 && !STOP_WORDS.has(v)))];
}

function permissionLabel(cmd) {
  const tags = [];
  if (cmd.masterOnly) tags.push('master-owner-only');
  else if (cmd.ownerOnly) tags.push('owner-only');
  if (cmd.groupOnly) tags.push('group-only');
  if (cmd.adminOnly) tags.push('group-admin');
  if (cmd.botAdminRequired) tags.push('bot-admin-required');
  return tags.length ? tags.join(', ') : 'public';
}

function commandLine(cmd) {
  const aliases = Array.isArray(cmd.aliases) && cmd.aliases.length
    ? ` | aliases: ${cmd.aliases.map((a) => '.' + a).join(', ')}`
    : '';
  const usage = cmd.usage ? ` | usage: .${cmd.usage}` : '';
  return `.${cmd.name} — ${cmd.description || 'No description'} | category: ${cmd.category || 'general'} | access: ${permissionLabel(cmd)}${usage}${aliases}`;
}

function exactCommandFromText(text = '') {
  const raw = String(text || '').toLowerCase();
  const dotted = [...raw.matchAll(/\.([a-z0-9_-]+)/g)].map((m) => m[1]);
  for (const name of dotted) {
    const cmd = getCommand(name);
    if (cmd) return cmd;
  }

  const words = cleanWords(raw);
  for (const word of words) {
    const cmd = getCommand(word);
    if (cmd) return cmd;
  }
  return null;
}

function scoreCommand(cmd, words) {
  const hay = [
    cmd.name,
    ...(Array.isArray(cmd.aliases) ? cmd.aliases : []),
    cmd.category,
    cmd.description,
    cmd.usage
  ].join(' ').toLowerCase();

  let score = 0;
  for (const word of words) {
    if (String(cmd.name).toLowerCase() === word) score += 20;
    if ((cmd.aliases || []).some((a) => String(a).toLowerCase() === word)) score += 16;
    if (String(cmd.category || '').toLowerCase() === word) score += 8;
    if (hay.includes(word)) score += Math.min(6, Math.max(2, word.length - 1));
  }
  return score;
}

function looksBroad(text = '') {
  const v = String(text || '').toLowerCase();
  return /what.*bot|bot.*what|kya.*bot|bot.*kya|all commands|saare commands|sari commands|features|capabilities|kya kya|what can|commands available|bot ke bare|bot kya karta/.test(v);
}

export function botKnowledgePrompt(userText = '') {
  const commands = allCommands();
  const grouped = commandsByCategory();
  const exact = exactCommandFromText(userText);

  const rules = [
    'BOT KNOWLEDGE RULES:',
    '- Treat this runtime command registry as the source of truth for A_X_HK bot features.',
    '- Never invent a command, alias, capability, permission or usage that is not shown here.',
    '- If a requested command/feature is not confirmed by this registry context, say you cannot confirm it and suggest .menu or .searchcmd.',
    '- When a command is owner-only/admin-only/group-only, say that clearly.',
    '- Do not reveal passwords, API keys, tokens, private configuration values or other secrets.',
    '- For a broad “what can this bot do?” question, summarize categories and useful examples instead of dumping hundreds of commands.'
  ];

  if (exact) {
    return [
      ...rules,
      '',
      `TOTAL REGISTERED COMMANDS: ${commands.length}`,
      'EXACT MATCH:',
      commandLine(exact)
    ].join('\n');
  }

  const words = cleanWords(userText);
  const ranked = commands
    .map((cmd) => ({ cmd, score: scoreCommand(cmd, words) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.cmd.name.localeCompare(b.cmd.name))
    .slice(0, 14)
    .map((row) => row.cmd);

  if (ranked.length && !looksBroad(userText)) {
    return [
      ...rules,
      '',
      `TOTAL REGISTERED COMMANDS: ${commands.length}`,
      'BEST MATCHING COMMANDS FOR THIS QUESTION:',
      ...ranked.map(commandLine)
    ].join('\n');
  }

  const categoryRows = Object.entries(grouped)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, rows]) => {
      const names = rows.slice(0, 6).map((cmd) => '.' + cmd.name).join(', ');
      const more = rows.length > 6 ? ` +${rows.length - 6} more` : '';
      return `- ${category}: ${rows.length} commands | examples: ${names}${more}`;
    });

  return [
    ...rules,
    '',
    `TOTAL REGISTERED COMMANDS: ${commands.length}`,
    'LIVE BOT CATEGORIES:',
    ...categoryRows
  ].join('\n');
}
