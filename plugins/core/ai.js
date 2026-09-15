import { registerCommand } from '../../lib/core/registry.js';
import { askAI } from '../../lib/services/ai.js';

function personaPrompt(value = 'default') {
  const map = {
    default: 'Use a concise, helpful and natural WhatsApp tone.',
    professional: 'Use a concise, professional and polished business tone.',
    friendly: 'Use a warm, friendly and natural conversational tone without overdoing emojis.',
    short: 'Keep the reply extremely short and direct unless more detail is essential.',
    urdu: 'Reply in clear Urdu script unless the user clearly asks for another language.',
    roman: 'Reply in natural Roman Urdu / Roman English, matching the user style.'
  };
  return map[String(value || 'default').toLowerCase()] || map.default;
}

function aiOptions(ctx, extra = {}) {
  return {
    systemPrompt: `You are A-X-HK, a helpful WhatsApp assistant. ${personaPrompt(ctx.sessionSettings.aiPersona)}`,
    fallbackModels: Array.isArray(ctx.sessionSettings.aiFallbackModels) ? ctx.sessionSettings.aiFallbackModels : [],
    ...extra
  };
}

registerCommand({
  name: 'ai', aliases: ['ask', 'askai', 'chatgpt', 'gpt', 'gpt35', 'gpt4', 'gpt4o', 'gemini', 'geminipro', 'grok', 'deepseek', 'llama', 'llama3', 'mistral', 'perplex', 'brain', 'think'], category: 'ai', description: 'Ask the configured AI assistant', cooldown: 5,
  async run(ctx) {
    if (!ctx.argText || ctx.argText.length > 6000) return ctx.reply(`Usage: ${ctx.prefix}ai your question`);
    const result = await askAI(ctx.argText, ctx.senderNumber, aiOptions(ctx));
    await ctx.reply(result);
  }
});

registerCommand({
  name: 'summarize', category: 'ai', description: 'Summarize supplied text with AI', cooldown: 5,
  async run(ctx) {
    if (!ctx.argText) return ctx.reply(`Usage: ${ctx.prefix}summarize long text here`);
    const result = await askAI(`Summarize this clearly and concisely:\n\n${ctx.argText}`, ctx.senderNumber, aiOptions(ctx, { temperature: 0.2 }));
    await ctx.reply(result);
  }
});

registerCommand({
  name: 'rewrite', category: 'ai', description: 'Rewrite supplied text professionally', cooldown: 5,
  async run(ctx) {
    if (!ctx.argText) return ctx.reply(`Usage: ${ctx.prefix}rewrite text here`);
    const result = await askAI(`Rewrite this clearly and professionally. Return only the rewritten text:\n\n${ctx.argText}`, ctx.senderNumber, aiOptions(ctx, { temperature: 0.3 }));
    await ctx.reply(result);
  }
});
