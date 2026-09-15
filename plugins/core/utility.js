import crypto from 'node:crypto';
import QRCode from 'qrcode';
import { create, all } from 'mathjs';
import { registerCommand } from '../../lib/core/registry.js';
import { db } from '../../lib/core/database.js';
import { config } from '../../lib/config.js';
import { parseDuration } from '../../lib/utils/text.js';

const math = create(all, {});

registerCommand({
  name: 'calc', aliases: ['calculate'], category: 'utility', description: 'Calculate a math expression', usage: 'calc 2*(5+3)',
  async run(ctx) {
    if (!ctx.argText || ctx.argText.length > 100) return ctx.reply(`Usage: ${ctx.prefix}calc 2*(5+3)`);
    if (!/^[0-9+\-*/%^().,\s]+$/.test(ctx.argText)) return ctx.reply('For safety, calc accepts numeric arithmetic only.');
    const result = math.evaluate(ctx.argText);
    if (typeof result === 'function' || typeof result === 'object') return ctx.reply('Only scalar math results are supported.');
    await ctx.reply(`${ctx.argText} = ${String(result)}`);
  }
});

registerCommand({
  name: 'qr', category: 'utility', description: 'Generate a QR image from text', usage: 'qr hello', cooldown: 3,
  async run(ctx) {
    if (!ctx.argText || ctx.argText.length > 1000) return ctx.reply(`Usage: ${ctx.prefix}qr your text`);
    const image = await QRCode.toBuffer(ctx.argText, { type: 'png', margin: 2, width: 700 });
    await ctx.send({ image, caption: `${config.shortName} QR Generator` }, { quoted: ctx.msg });
  }
});

registerCommand({
  name: 'base64', aliases: ['b64'], category: 'utility', description: 'Encode text as base64',
  async run(ctx) {
    if (!ctx.argText) return ctx.reply(`Usage: ${ctx.prefix}base64 hello`);
    await ctx.reply(Buffer.from(ctx.argText, 'utf8').toString('base64'));
  }
});

registerCommand({
  name: 'unbase64', aliases: ['deb64'], category: 'utility', description: 'Decode base64 text',
  async run(ctx) {
    if (!ctx.argText) return ctx.reply(`Usage: ${ctx.prefix}unbase64 SGVsbG8=`);
    await ctx.reply(Buffer.from(ctx.argText, 'base64').toString('utf8').slice(0, 3900));
  }
});

registerCommand({
  name: 'hash', category: 'utility', description: 'SHA-256 hash text',
  async run(ctx) {
    if (!ctx.argText) return ctx.reply(`Usage: ${ctx.prefix}hash text`);
    await ctx.reply(crypto.createHash('sha256').update(ctx.argText).digest('hex'));
  }
});

registerCommand({
  name: 'uuid', category: 'utility', description: 'Generate a UUID',
  async run(ctx) { await ctx.reply(crypto.randomUUID()); }
});

registerCommand({
  name: 'password', aliases: ['passgen'], category: 'utility', description: 'Generate a random password',
  async run(ctx) {
    const requested = Number(ctx.args[0] || 20);
    const len = Math.min(64, Math.max(8, Number.isFinite(requested) ? requested : 20));
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%_-';
    const bytes = crypto.randomBytes(len);
    let out = '';
    for (let i = 0; i < len; i += 1) out += chars[bytes[i] % chars.length];
    await ctx.reply(out);
  }
});

registerCommand({
  name: 'time', category: 'utility', description: 'Show current bot time',
  async run(ctx) {
    const now = new Intl.DateTimeFormat('en-GB', { dateStyle: 'full', timeStyle: 'long', timeZone: config.timezone }).format(new Date());
    await ctx.reply(`${config.timezone}\n${now}`);
  }
});

registerCommand({
  name: 'timestamp', category: 'utility', description: 'Show Unix timestamp',
  async run(ctx) { await ctx.reply(`${Math.floor(Date.now() / 1000)}`); }
});

registerCommand({
  name: 'remind', aliases: ['reminder'], category: 'utility', description: 'Set a reminder', usage: 'remind 10m drink water',
  async run(ctx) {
    const duration = parseDuration(ctx.args[0]);
    const text = ctx.args.slice(1).join(' ').trim();
    if (!duration || !text) return ctx.reply(`Usage: ${ctx.prefix}remind 10m your message\nUnits: s, m, h, d (max 30d)`);
    db.data.reminders.push({
      id: crypto.randomUUID(), sessionId: ctx.sessionId, chat: ctx.chat, user: ctx.sender, text: text.slice(0, 1000), at: Date.now() + duration, sent: false
    });
    await db.save();
    await ctx.reply('Reminder saved.');
  }
});

registerCommand({
  name: 'note', category: 'utility', description: 'Save a personal note', usage: 'note key = value',
  async run(ctx) {
    const match = ctx.argText.match(/^([^=]{1,50})=(.+)$/s);
    if (!match) return ctx.reply(`Usage: ${ctx.prefix}note project = finish homepage`);
    const notes = db.noteBucket(ctx.sessionId, ctx.sender);
    notes[match[1].trim().toLowerCase()] = match[2].trim().slice(0, 2000);
    await db.save();
    await ctx.reply('Note saved.');
  }
});

registerCommand({
  name: 'notes', category: 'utility', description: 'List your note keys',
  async run(ctx) {
    const notes = db.noteBucket(ctx.sessionId, ctx.sender);
    const keys = Object.keys(notes);
    await ctx.reply(keys.length ? `Your notes:\n${keys.map((k) => `- ${k}`).join('\n')}` : 'No notes saved.');
  }
});

registerCommand({
  name: 'getnote', category: 'utility', description: 'Read a saved note',
  async run(ctx) {
    const key = ctx.argText.trim().toLowerCase();
    const value = db.noteBucket(ctx.sessionId, ctx.sender)?.[key];
    await ctx.reply(value || 'Note not found.');
  }
});

registerCommand({
  name: 'delnote', category: 'utility', description: 'Delete a saved note',
  async run(ctx) {
    const key = ctx.argText.trim().toLowerCase();
    const notes = db.noteBucket(ctx.sessionId, ctx.sender);
    if (!key || !notes?.[key]) return ctx.reply('Note not found.');
    delete notes[key];
    await db.save();
    await ctx.reply('Note deleted.');
  }
});

registerCommand({
  name: 'poll', category: 'utility', description: 'Create a WhatsApp poll', usage: 'poll Question | A | B', groupOnly: true,
  async run(ctx) {
    const parts = ctx.argText.split('|').map((v) => v.trim()).filter(Boolean);
    if (parts.length < 3 || parts.length > 13) return ctx.reply(`Usage: ${ctx.prefix}poll Question | Option A | Option B`);
    await ctx.send({ poll: { name: parts[0].slice(0, 200), values: parts.slice(1).map((v) => v.slice(0, 100)), selectableCount: 1 } });
  }
});
