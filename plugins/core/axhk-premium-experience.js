import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { registerCommand } from '../../lib/core/registry.js';
import { db } from '../../lib/core/database.js';
import { config } from '../../lib/config.js';
import { logger } from '../../lib/core/logger.js';
import { OWNER_PROFILE } from '../../lib/core/owner-profile.js';
import { contextInfo, targetJidFromMessage, unwrapMessage, extractText } from '../../lib/utils/message.js';
import { recentChatMessages } from '../../lib/services/chat-history.js';
import { askAI, askAIVision, generateAIImage, synthesizeSpeech, transcribeAudio } from '../../lib/services/ai.js';
import {
  renderPoster, renderDpStudio, renderMeme,
  sendCard, sendOwnerCard, sendControlCenter, sendAxhkOs, sendAIAnswerCard, stableMemberId
} from '../../lib/services/premium-experience.js';

function quotedMessage(msg) {
  return contextInfo(msg)?.quotedMessage || null;
}

function quotedText(msg) {
  const q = quotedMessage(msg);
  if (!q) return '';
  return extractText({ message: q });
}

function quotedKind(msg) {
  const q = unwrapMessage(quotedMessage(msg) || {});
  if (q.imageMessage) return 'image';
  if (q.audioMessage) return 'audio';
  if (q.videoMessage) return 'video';
  if (q.stickerMessage) return 'sticker';
  if (q.conversation || q.extendedTextMessage) return 'text';
  return '';
}

async function quotedBuffer(ctx) {
  const q = quotedMessage(ctx.msg);
  if (!q) return null;
  const target = { ...ctx.msg, message: q };
  return downloadMediaMessage(target, 'buffer', {}, { logger, reuploadRequest: ctx.sock.updateMediaMessage });
}

function displayName(ctx) {
  const push = String(ctx.msg?.pushName || '').trim();
  if (push) return push.slice(0, 42);
  const n = String(ctx.senderNumber || '').replace(/\D/g, '');
  return n ? `USER ${n.slice(-4)}` : 'A_X_HK MEMBER';
}

function today() {
  return new Intl.DateTimeFormat('en-GB', { timeZone: config.timezone, dateStyle: 'medium' }).format(new Date());
}

function levelFor(commands = 0) {
  return Math.max(1, Math.floor(Math.sqrt(Math.max(0, Number(commands || 0)))) + 1);
}

async function sendImage(ctx, image, caption = '') {
  return ctx.send({ image, caption }, { quoted: ctx.msg });
}

registerCommand({
  name: 'axcenter', aliases: ['axcontrol', 'axhub'], category: 'system', description: 'Open the A_X_HK premium WhatsApp control center', cooldown: 3,
  async run(ctx) { await sendControlCenter(ctx); }
});

registerCommand({
  name: 'axhk', aliases: ['axhkos', 'os'], category: 'system', description: 'Open A_X_HK OS premium experience', cooldown: 3,
  async run(ctx) { await sendAxhkOs(ctx); }
});

registerCommand({
  name: 'secret', aliases: ['vaultmenu', 'hiddenmenu'], category: 'premium', description: 'Open the hidden A_X_HK premium layer', cooldown: 3,
  async run(ctx) {
    await sendCard(ctx, {
      kicker: 'A_X_HK • HIDDEN LAYER',
      title: 'SECRET MENU',
      subtitle: 'DISCOVER • CREATE • UNLOCK',
      badge: '◈',
      lines: [
        `${ctx.prefix}box      • Mystery Box`,
        `${ctx.prefix}story    • AI Story Mode`,
        `${ctx.prefix}vibe     • Personality/Vibe Scan`,
        `${ctx.prefix}poster   • Instant Poster`,
        `${ctx.prefix}pass     • Access Pass`,
        `${ctx.prefix}id       • Digital Identity`,
        '',
        'SECRET LAYER • PUBLIC SAFE MODE'
      ]
    });
  }
});

registerCommand({
  name: 'pass', aliases: ['accesspass', 'memberpass'], category: 'profile', description: 'Show your premium A_X_HK access pass', cooldown: 5,
  async run(ctx) {
    const memberId = stableMemberId(ctx.sessionId, ctx.sender);
    const joined = ctx.user.axhkJoinedAt || today();
    const commands = Number(ctx.user.commandCount || 0);
    const vip = Boolean(ctx.user.premium);
    ctx.user.axhkJoinedAt ||= joined;
    await db.save();
    await ctx.reply([
      '╭━━━━〔 🎟️ *A_X_HK ACCESS PASS* 〕━━━━╮',
      `┃ 👤 *Holder*     • ${displayName(ctx)}`,
      `┃ 🪪 *Member ID*  • ${memberId}`,
      `┃ 💎 *Tier*       • ${vip ? 'VIP VERIFIED' : 'STANDARD MEMBER'}`,
      `┃ 🟢 *Status*     • ACTIVE`,
      `┃ 📅 *Member Since* • ${joined}`,
      `┃ ⚡ *Activity*   • ${commands} COMMANDS`,
      '┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫',
      '┃ ✦ PRIVATE DIGITAL ACCESS',
      '┃ ✦ A_X_HK WHATSAPP OS MEMBER',
      '╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
      '',
      config.footerMessage
    ].join('\n'));
  }
});

registerCommand({
  name: 'digitalid', aliases: ['id', 'identity', 'myid'], category: 'profile', description: 'Show your A_X_HK digital identity card', cooldown: 5,
  async run(ctx) {
    const memberId = stableMemberId(ctx.sessionId, ctx.sender);
    const commands = Number(ctx.user.commandCount || 0);
    const vip = Boolean(ctx.user.premium);
    const number = String(ctx.senderNumber || '').replace(/\D/g, '') || 'PRIVATE';
    await ctx.reply([
      '╭━━━━〔 🪪 *A_X_HK DIGITAL IDENTITY* 〕━━━━╮',
      `┃ 👤 *Identity*   • ${displayName(ctx)}`,
      `┃ 📱 *WhatsApp*   • +${number}`,
      `┃ 🔐 *Bot ID*     • ${memberId}`,
      `┃ 💠 *Tier*       • ${vip ? 'VIP' : 'STANDARD'}`,
      `┃ ⭐ *Level*      • ${levelFor(commands)}`,
      `┃ ⚡ *Activity*   • ${commands} COMMANDS`,
      `┃ 🟢 *Network*    • A_X_HK OS`,
      '┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫',
      '┃ ✓ VERIFIED INSIDE THIS BOT',
      '┃ ⚠ NOT A GOVERNMENT / LEGAL ID',
      '╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
      '',
      config.footerMessage
    ].join('\n'));
  }
});

registerCommand({
  name: 'vip', aliases: ['setvip'], category: 'owner', description: 'Grant A_X_HK VIP badge to a user', usage: 'vip <number> or reply', ownerOnly: true, cooldown: 2,
  async run(ctx) {
    const jid = targetJidFromMessage(ctx.msg, ctx.args);
    if (!jid) return ctx.reply(`Usage: ${ctx.prefix}vip <number> or reply to the user.`);
    const user = db.user(jid, ctx.sessionId);
    user.premium = true;
    user.vipGrantedAt = new Date().toISOString();
    await db.save();
    await ctx.reply(`💎 VIP VERIFIED\n${jid.split('@')[0]} now has the A_X_HK VIP badge.`);
  }
});

registerCommand({
  name: 'unvip', aliases: ['removevip'], category: 'owner', description: 'Remove A_X_HK VIP badge from a user', usage: 'unvip <number> or reply', ownerOnly: true, cooldown: 2,
  async run(ctx) {
    const jid = targetJidFromMessage(ctx.msg, ctx.args);
    if (!jid) return ctx.reply(`Usage: ${ctx.prefix}unvip <number> or reply to the user.`);
    const user = db.user(jid, ctx.sessionId);
    user.premium = false;
    delete user.vipGrantedAt;
    await db.save();
    await ctx.reply(`VIP removed for ${jid.split('@')[0]}.`);
  }
});

registerCommand({
  name: 'vibe', aliases: ['vibescan', 'personality'], category: 'ai', description: 'Create an entertainment-only AI vibe scan', cooldown: 8,
  async run(ctx) {
    const direct = String(ctx.argText || '').trim();
    const quoted = quotedText(ctx.msg);
    const recent = recentChatMessages(ctx.sessionId, ctx.chat, 18)
      .filter((r) => r.sender === ctx.sender && !r.text.startsWith(ctx.prefix))
      .map((r) => r.text)
      .slice(-8)
      .join('\n');
    const sample = direct || quoted || recent;
    if (!sample) return ctx.reply(`Write some text or reply to a message with ${ctx.prefix}vibe.`);
    let result;
    try {
      result = await askAI([
        'Create a playful entertainment-only vibe scan from the writing sample.',
        'Do not diagnose mental health, intelligence, protected traits, or anything sensitive.',
        'Return exactly 5 short lines: VIBE TITLE, ENERGY, CHAT STYLE, SIGNATURE TRAIT, FUN SCORE (0-100).',
        '',
        sample.slice(0, 3500)
      ].join('\n'), ctx.senderNumber, { temperature: 0.8 });
    } catch {
      result = 'VIBE TITLE: DIGITAL MAVERICK\nENERGY: Bold & curious\nCHAT STYLE: Fast and direct\nSIGNATURE TRAIT: Likes things different\nFUN SCORE: 88/100';
    }
    await sendCard(ctx, {
      kicker: 'A_X_HK • VIBE SCANNER',
      title: 'AI VIBE SCAN',
      subtitle: 'FOR ENTERTAINMENT ONLY',
      badge: '◉',
      lines: result.split('\n').slice(0, 8)
    }, { caption: result });
  }
});

registerCommand({
  name: 'poster', aliases: ['posterpro'], category: 'media', description: 'Create a premium instant A_X_HK poster', usage: 'poster <headline> | <subline>', cooldown: 6,
  async run(ctx) {
    const raw = String(ctx.argText || '').trim();
    const [headlineRaw, sublineRaw] = raw.split('|');
    const headline = (headlineRaw || displayName(ctx)).trim();
    const subline = (sublineRaw || 'PREMIUM WHATSAPP EXPERIENCE').trim();
    const image = await renderPoster({ headline, subline });
    await sendImage(ctx, image, `🎨 *A_X_HK INSTANT POSTER*\n${config.footerMessage}`);
  }
});

registerCommand({
  name: 'dp', aliases: ['dpstudio', 'profilepic'], category: 'media', description: 'Turn a replied image into an A_X_HK premium profile picture', usage: 'dp (reply to image)', cooldown: 6,
  async run(ctx) {
    if (quotedKind(ctx.msg) !== 'image') return ctx.reply(`Reply to an image with ${ctx.prefix}dp.`);
    const buffer = await quotedBuffer(ctx);
    if (!buffer || buffer.length > 20 * 1024 * 1024) return ctx.reply('Image unavailable or too large.');
    const image = await renderDpStudio(buffer, { label: ctx.user.premium ? 'A_X_HK • VIP' : 'A_X_HK', vip: Boolean(ctx.user.premium) });
    await sendImage(ctx, image, `🖼️ *A_X_HK DP STUDIO*\n${ctx.user.premium ? '💎 VIP EDITION\n' : ''}${config.footerMessage}`);
  }
});

registerCommand({
  name: 'meme', aliases: ['mememe'], category: 'fun', description: 'Create a smart meme from a replied image', usage: 'meme [caption] (reply to image)', cooldown: 8,
  async run(ctx) {
    if (quotedKind(ctx.msg) !== 'image') return ctx.reply(`Reply to an image with ${ctx.prefix}meme [optional caption].`);
    const buffer = await quotedBuffer(ctx);
    if (!buffer) return;
    let caption = String(ctx.argText || '').trim();
    if (!caption) {
      try {
        caption = await askAIVision('Write one short funny meme caption for this image. Safe, clever, no slurs. Return caption only.', buffer, { maxChars: 180 });
      } catch {
        caption = 'WHEN THE PLAN ACTUALLY WORKS';
      }
    }
    const parts = caption.split(/[|\n]/).map((v) => v.trim()).filter(Boolean);
    const image = await renderMeme(buffer, { top: parts[0] || caption, bottom: parts[1] || 'A_X_HK MOMENT' });
    await sendImage(ctx, image, `😂 *A_X_HK MEME ENGINE*\n${config.footerMessage}`);
  }
});

registerCommand({
  name: 'magic', aliases: ['magicreply'], category: 'ai', description: 'Transform a quoted message into a creative image, voice or AI response', usage: 'magic (reply to message)', cooldown: 10,
  async run(ctx) {
    const kind = quotedKind(ctx.msg);
    if (!kind) return ctx.reply(`Reply to a message with ${ctx.prefix}magic.`);

    if (kind === 'image') {
      const buffer = await quotedBuffer(ctx);
      let caption = 'A_X_HK MAGIC';
      try {
        caption = await askAIVision('Create one clever short premium meme-style caption for this image. Return only the caption.', buffer, { maxChars: 160 });
      } catch {}
      const image = await renderMeme(buffer, { top: caption, bottom: 'MAGIC MODE • A_X_HK' });
      return sendImage(ctx, image, `🪄 *MAGIC IMAGE*\n${config.footerMessage}`);
    }

    if (kind === 'audio') {
      const buffer = await quotedBuffer(ctx);
      const transcript = await transcribeAudio(buffer, { fileName: 'magic.ogg', mimeType: 'audio/ogg' });
      const answer = await askAI(`Reply creatively and briefly to this voice message transcript:\n${transcript}`, ctx.senderNumber, { temperature: 0.8 });
      try {
        const audio = await synthesizeSpeech(answer);
        return ctx.send({ audio, mimetype: 'audio/mpeg', ptt: true }, { quoted: ctx.msg });
      } catch {
        return sendAIAnswerCard(ctx, answer, 'MAGIC VOICE RESPONSE');
      }
    }

    const source = quotedText(ctx.msg) || '[media message]';
    let answer;
    try {
      answer = await askAI(`Create a smart, playful, premium WhatsApp response to this message. Keep it concise and natural:\n\n${source}`, ctx.senderNumber, { temperature: 0.85 });
    } catch {
      answer = `✨ Magic reply: ${source.slice(0, 220)}`;
    }
    return sendAIAnswerCard(ctx, answer, 'MAGIC REPLY');
  }
});

registerCommand({
  name: 'story', aliases: ['aistory'], category: 'fun', description: 'Start or continue an interactive AI story', usage: 'story [theme|1|2|3]', cooldown: 8,
  async run(ctx) {
    const input = String(ctx.argText || '').trim();
    const previous = ctx.user.axhkStory || '';
    let prompt;
    if (previous && /^[123]$/.test(input)) {
      prompt = `Continue this interactive story based on choice ${input}. Keep it under 220 words and end with exactly three numbered choices 1, 2, 3.\n\nSTORY SO FAR:\n${previous.slice(-3500)}`;
    } else {
      const theme = input || 'mystery adventure';
      prompt = `Start a cinematic interactive ${theme} story under 220 words. Make the reader the main character. End with exactly three numbered choices 1, 2, 3.`;
    }
    let story;
    try { story = await askAI(prompt, ctx.senderNumber, { temperature: 0.95 }); }
    catch { story = 'You step into a dark neon corridor marked A_X_HK. A hidden door unlocks.\n\n1. Enter the AI chamber\n2. Follow the music\n3. Open the mystery vault'; }
    ctx.user.axhkStory = story.slice(0, 5000);
    await sendCard(ctx, {
      kicker: 'A_X_HK • INTERACTIVE STORY',
      title: 'STORY MODE',
      subtitle: 'YOUR CHOICE CHANGES THE NEXT SCENE',
      badge: '✦',
      lines: story.split('\n').filter(Boolean).slice(0, 10)
    }, { caption: `${story}\n\nReply with *${ctx.prefix}story 1*, *2* or *3*.` });
  }
});

registerCommand({
  name: 'box', aliases: ['mysterybox', 'mystery'], category: 'fun', description: 'Open a premium A_X_HK mystery box', cooldown: 12,
  async run(ctx) {
    const rewards = [
      ['NEON DROP', 'Your next poster gets the NEON legend title.', '⚡'],
      ['VIP ENERGY', 'A rare VIP-style visual has appeared.', '💎'],
      ['SECRET KEY', `Hidden route: ${ctx.prefix}secret`, '🔐'],
      ['CREATOR DROP', `Create something now: ${ctx.prefix}poster YOUR NAME`, '🎨'],
      ['MUSIC DROP', `Try: ${ctx.prefix}playlist night drive`, '🎵'],
      ['MAGIC DROP', `Reply to any message with ${ctx.prefix}magic`, '🪄']
    ];
    const reward = rewards[Math.floor(Math.random() * rewards.length)];
    ctx.user.mysteryBoxes = Number(ctx.user.mysteryBoxes || 0) + 1;
    await sendCard(ctx, {
      kicker: 'A_X_HK • MYSTERY BOX',
      title: reward[0],
      subtitle: reward[1],
      badge: reward[2],
      lines: [
        `BOX #${ctx.user.mysteryBoxes}`,
        'RARITY • PREMIUM DROP',
        '',
        'NO REAL MONEY • NO GAMBLING',
        'JUST A_X_HK FUN'
      ]
    });
  }
});

registerCommand({
  name: 'playlist', aliases: ['musiclist'], category: 'media', description: 'Show a premium music playlist card from live search results', usage: 'playlist <mood/song/artist>', cooldown: 8,
  async run(ctx) {
    const q = String(ctx.argText || '').trim() || 'trending';
    const url = new URL('https://api.deezer.com/search');
    url.searchParams.set('q', q);
    url.searchParams.set('limit', '6');
    let rows = [];
    try {
      const res = await fetch(url, { headers: { 'user-agent': 'A-X-HK-WhatsApp-Bot/4.10' }, signal: AbortSignal.timeout(10000) });
      const data = res.ok ? await res.json() : {};
      rows = Array.isArray(data?.data) ? data.data : [];
    } catch {}
    if (!rows.length) return ctx.reply('Playlist search is temporarily unavailable.');
    await sendCard(ctx, {
      kicker: 'A_X_HK • MUSIC DECK',
      title: 'PLAYLIST',
      subtitle: q.toUpperCase(),
      badge: '♫',
      lines: rows.map((item, i) => `${i + 1}. ${String(item.title_short || item.title || '').slice(0, 25)} — ${String(item.artist?.name || '').slice(0, 20)}`)
    }, { caption: rows.map((item, i) => `${i + 1}. *${item.title_short || item.title}* — ${item.artist?.name || ''}\n   Play: ${ctx.prefix}song ${item.title_short || item.title} ${item.artist?.name || ''}`).join('\n\n') });
  }
});

registerCommand({
  name: 'ownerprofilecard', aliases: ['ownerpro'], category: 'system', description: 'Show the premium A_X_HK owner profile card', cooldown: 3,
  async run(ctx) { await sendOwnerCard(ctx, OWNER_PROFILE); }
});
