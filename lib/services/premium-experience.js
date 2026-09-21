import crypto from 'node:crypto';
import sharp from 'sharp';
import { generateWAMessageFromContent, proto } from '@whiskeysockets/baileys';
import { config } from '../config.js';

const BRAND = {
  bg1: '#07110f',
  bg2: '#101e1a',
  panel: '#132620',
  line: '#2f6654',
  text: '#f5fbf8',
  muted: '#a9c4ba',
  accent: '#72f2bd',
  gold: '#e3c46f'
};

function esc(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function clean(value = '', max = 240) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function wrap(value = '', maxChars = 34, maxLines = 8) {
  const words = clean(value, maxChars * maxLines + 120).split(' ').filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (!line || next.length <= maxChars) {
      line = next;
      continue;
    }
    lines.push(line);
    line = word;
    if (lines.length >= maxLines - 1) break;
  }
  if (line && lines.length < maxLines) lines.push(line);
  if (words.join(' ').length > lines.join(' ').length && lines.length) {
    const i = lines.length - 1;
    lines[i] = `${lines[i].slice(0, Math.max(1, maxChars - 1))}…`;
  }
  return lines;
}

function textRows(lines, { x = 74, y = 300, size = 36, gap = 54, color = BRAND.text, weight = 600 } = {}) {
  return lines.map((line, i) =>
    `<text x="${x}" y="${y + (i * gap)}" fill="${color}" font-family="Arial,Helvetica,sans-serif" font-size="${size}" font-weight="${weight}">${esc(line)}</text>`
  ).join('');
}

function shellSvg({ title, kicker = 'A_X_HK • PREMIUM WHATSAPP', subtitle = '', lines = [], badge = '◆', width = 1080, height = 1080, footer = '' }) {
  const body = Array.isArray(lines) ? lines : wrap(lines, 36, 9);
  const titleLines = wrap(title, 25, 2);
  const subtitleLines = subtitle ? wrap(subtitle, 42, 2) : [];
  const topY = 190;
  const bodyY = subtitleLines.length ? 390 : 340;
  return `
  <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${BRAND.bg1}"/>
        <stop offset="1" stop-color="${BRAND.bg2}"/>
      </linearGradient>
      <radialGradient id="glow" cx="82%" cy="10%" r="80%">
        <stop offset="0" stop-color="${BRAND.accent}" stop-opacity=".18"/>
        <stop offset="1" stop-color="${BRAND.accent}" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="100%" height="100%" rx="62" fill="url(#bg)"/>
    <rect width="100%" height="100%" rx="62" fill="url(#glow)"/>
    <rect x="38" y="38" width="${width - 76}" height="${height - 76}" rx="44" fill="none" stroke="${BRAND.line}" stroke-width="3"/>
    <rect x="68" y="72" width="${width - 136}" height="74" rx="28" fill="${BRAND.panel}" opacity=".92"/>
    <text x="96" y="120" fill="${BRAND.accent}" font-family="Arial,Helvetica,sans-serif" font-size="25" font-weight="800" letter-spacing="3">${esc(kicker.toUpperCase())}</text>
    <text x="${width - 96}" y="122" text-anchor="end" fill="${BRAND.gold}" font-family="Arial,Helvetica,sans-serif" font-size="30" font-weight="800">${esc(badge)}</text>
    ${textRows(titleLines, { x: 74, y: topY + 70, size: 62, gap: 70, color: BRAND.text, weight: 900 })}
    ${textRows(subtitleLines, { x: 76, y: topY + 205, size: 29, gap: 42, color: BRAND.muted, weight: 500 })}
    <line x1="74" y1="${bodyY - 48}" x2="${width - 74}" y2="${bodyY - 48}" stroke="${BRAND.line}" stroke-width="2"/>
    ${textRows(body, { x: 78, y: bodyY + 20, size: 34, gap: 58, color: BRAND.text, weight: 600 })}
    <rect x="68" y="${height - 145}" width="${width - 136}" height="76" rx="28" fill="${BRAND.panel}" opacity=".88"/>
    <text x="96" y="${height - 97}" fill="${BRAND.muted}" font-family="Arial,Helvetica,sans-serif" font-size="24" font-weight="600">${esc(footer || config.footerDisplayText || 'POWERED BY ABDULLAH-X-HK')}</text>
    <circle cx="${width - 103}" cy="${height - 108}" r="15" fill="${BRAND.accent}"/>
  </svg>`;
}

export async function renderPremiumCard(opts = {}) {
  return sharp(Buffer.from(shellSvg(opts))).png().toBuffer();
}

export function stableMemberId(sessionId = 'main', sender = '') {
  const hash = crypto.createHash('sha256').update(`${sessionId}:${sender}:A_X_HK`).digest('hex').slice(0, 10).toUpperCase();
  return `AX-${hash.slice(0, 5)}-${hash.slice(5)}`;
}

export async function renderPassCard({ name = 'A-X-HK MEMBER', memberId = '', vip = false, joined = '', commands = 0 } = {}) {
  return renderPremiumCard({
    kicker: vip ? 'A_X_HK • VIP ACCESS PASS' : 'A_X_HK • ACCESS PASS',
    title: vip ? 'VIP MEMBER' : 'MEMBER PASS',
    subtitle: clean(name, 42),
    badge: vip ? 'VIP' : 'PASS',
    lines: [
      `MEMBER  •  ${clean(name, 32)}`,
      `ID      •  ${memberId}`,
      `STATUS  •  ${vip ? 'VIP VERIFIED' : 'ACTIVE'}`,
      `SINCE   •  ${joined || 'TODAY'}`,
      `USES    •  ${Number(commands || 0)} COMMANDS`,
      '',
      'PRIVATE DIGITAL ACCESS • NON-TRANSFERABLE'
    ]
  });
}

export async function renderIdentityCard({ name = 'A-X-HK USER', memberId = '', vip = false, level = 1, commands = 0 } = {}) {
  return renderPremiumCard({
    kicker: 'A_X_HK • DIGITAL IDENTITY',
    title: 'DIGITAL ID',
    subtitle: clean(name, 42),
    badge: vip ? '◆ VIP' : '◆ ID',
    lines: [
      `IDENTITY  •  ${memberId}`,
      `TIER      •  ${vip ? 'VIP' : 'STANDARD'}`,
      `LEVEL     •  ${level}`,
      `ACTIVITY  •  ${Number(commands || 0)} COMMANDS`,
      'NETWORK   •  A_X_HK WHATSAPP OS',
      '',
      'VERIFIED INSIDE THIS BOT • NOT A GOVERNMENT ID'
    ]
  });
}

export async function renderPoster({ headline = 'A_X_HK', subline = 'PREMIUM WHATSAPP EXPERIENCE', footer = '' } = {}) {
  return renderPremiumCard({
    kicker: 'A_X_HK • INSTANT POSTER',
    title: clean(headline, 54).toUpperCase(),
    subtitle: clean(subline, 90),
    badge: '✦',
    lines: [
      'DIGITAL • BOLD • PERSONAL',
      '',
      'CREATED INSIDE WHATSAPP',
      'A_X_HK VISUAL STUDIO'
    ],
    footer
  });
}

export async function renderDpStudio(buffer, { label = 'A_X_HK', vip = false } = {}) {
  const size = 1080;
  const image = await sharp(buffer, { failOn: 'none' })
    .rotate()
    .resize(size - 130, size - 130, { fit: 'cover', position: 'attention' })
    .png()
    .toBuffer();

  const inner = size - 130;
  const mask = Buffer.from(`<svg width="${inner}" height="${inner}" xmlns="http://www.w3.org/2000/svg">
    <circle cx="${inner / 2}" cy="${inner / 2}" r="${(inner / 2) - 18}" fill="white"/>
  </svg>`);
  const masked = await sharp(image)
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer();

  const frame = Buffer.from(`<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${BRAND.bg1}"/><stop offset="1" stop-color="${BRAND.bg2}"/></linearGradient>
    </defs>
    <rect width="1080" height="1080" fill="url(#g)"/>
    <circle cx="540" cy="500" r="452" fill="none" stroke="${vip ? BRAND.gold : BRAND.accent}" stroke-width="14"/>
    <circle cx="540" cy="500" r="470" fill="none" stroke="${BRAND.line}" stroke-width="3"/>
    <rect x="150" y="958" width="780" height="76" rx="38" fill="${BRAND.panel}"/>
    <text x="540" y="1008" text-anchor="middle" fill="${BRAND.text}" font-family="Arial,Helvetica,sans-serif" font-size="32" font-weight="800" letter-spacing="4">${esc(clean(label, 28).toUpperCase())}</text>
  </svg>`);

  return sharp(frame).composite([{ input: masked, left: 65, top: 65 }]).png().toBuffer();
}

export async function renderMeme(buffer, { top = '', bottom = '' } = {}) {
  const base = await sharp(buffer, { failOn: 'none' }).rotate().resize(1080, 1080, { fit: 'cover', position: 'attention' }).png().toBuffer();
  const topLines = wrap(top, 28, 3);
  const bottomLines = wrap(bottom, 28, 3);
  const overlay = `<svg width="1080" height="1080" xmlns="http://www.w3.org/2000/svg">
    <rect width="1080" height="1080" fill="none"/>
    <rect x="0" y="0" width="1080" height="${120 + topLines.length * 55}" fill="#000" opacity=".48"/>
    <rect x="0" y="${880 - bottomLines.length * 55}" width="1080" height="${200 + bottomLines.length * 55}" fill="#000" opacity=".48"/>
    ${textRows(topLines, { x: 540, y: 80, size: 48, gap: 58, color: '#ffffff', weight: 900 }).replace(/x="540"/g,'x="540" text-anchor="middle"')}
    ${textRows(bottomLines, { x: 540, y: 930 - ((bottomLines.length - 1) * 58), size: 48, gap: 58, color: '#ffffff', weight: 900 }).replace(/x="540"/g,'x="540" text-anchor="middle"')}
    <text x="1020" y="1040" text-anchor="end" fill="#d7fff0" font-family="Arial,Helvetica,sans-serif" font-size="22" font-weight="700">A_X_HK MEME ENGINE</text>
  </svg>`;
  return sharp(base).composite([{ input: Buffer.from(overlay) }]).png().toBuffer();
}

export async function sendCard(ctx, opts = {}, { caption = '' } = {}) {
  const finalCaption = caption || opts.caption || '';
  try {
    const image = await renderPremiumCard(opts);
    return await ctx.send({ image, caption: finalCaption }, { quoted: ctx.msg });
  } catch (err) {
    const fallback = [
      opts.kicker && `◆ ${opts.kicker}`,
      opts.title && `*${opts.title}*`,
      opts.subtitle,
      ...(Array.isArray(opts.lines) ? opts.lines : []),
      finalCaption
    ].filter(Boolean).join('\n');
    return ctx.reply(fallback || 'A_X_HK');
  }
}

function quickButton(id, displayText) {
  return {
    name: 'quick_reply',
    buttonParamsJson: JSON.stringify({ display_text: displayText, id })
  };
}

export async function sendInteractiveHub(ctx, { title = 'A_X_HK OS', body = 'Choose a module', cards = [] } = {}) {
  try {
    const safeCards = cards.slice(0, 8).map((card) => {
      const buttons = (card.buttons || []).slice(0, 3).map((b) => quickButton(b.id, b.text));
      return proto.Message.InteractiveMessage.create({
        body: proto.Message.InteractiveMessage.Body.create({ text: clean(card.body || card.title, 220) }),
        footer: proto.Message.InteractiveMessage.Footer.create({ text: clean(card.footer || config.shortName, 60) }),
        nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({ buttons })
      });
    });

    const interactive = proto.Message.InteractiveMessage.create({
      body: proto.Message.InteractiveMessage.Body.create({ text: clean(body, 700) }),
      footer: proto.Message.InteractiveMessage.Footer.create({ text: config.footerDisplayText }),
      carouselMessage: proto.Message.InteractiveMessage.CarouselMessage.create({ cards: safeCards })
    });
    const message = generateWAMessageFromContent(ctx.chat, {
      viewOnceMessage: { message: { interactiveMessage: interactive } }
    }, { userJid: ctx.sock.user?.id, quoted: ctx.msg });
    await ctx.sock.relayMessage(ctx.chat, message.message, { messageId: message.key.id });
    return true;
  } catch {
    const fallbackLines = cards.map((c) => `• ${c.title}: ${(c.buttons || []).map((b) => b.id).join(' • ')}`);
    await sendCard(ctx, {
      kicker: 'A_X_HK • CONTROL CENTER',
      title,
      subtitle: body,
      badge: 'OS',
      lines: fallbackLines
    });
    return false;
  }
}

export async function sendOwnerCard(ctx, profile = {}) {
  const services = (profile.services || []).slice(0, 4);
  return sendCard(ctx, {
    kicker: 'A_X_HK • VERIFIED OWNER',
    title: profile.brandLong || config.ownerName,
    subtitle: 'FOUNDER • BUILDER • AUTOMATION & AI',
    badge: '👑',
    lines: [
      `NAME     •  ${profile.name || config.ownerName}`,
      `BRAND    •  ${profile.brand || config.shortName}`,
      `REGION   •  ${profile.locationLabel || 'Pakistan'}`,
      '',
      ...services.map((s) => `◆ ${clean(s, 42)}`)
    ]
  }, { caption: `👑 *${profile.brandLong || config.ownerName}*\n${config.ownerContactUrl || ''}\n\n${config.footerMessage}` });
}

export async function sendControlCenter(ctx) {
  const p = ctx.prefix || '.';
  const text = [
    '╭━━━〔 ⚡ *A_X_HK CONTROL CENTER* 〕━━━╮',
    '┃ *PREMIUM WHATSAPP SYSTEM*',
    '┃',
    '┃ 🤖 *AI CORE*',
    `┃  • ${p}ai <question>`,
    `┃  • ${p}vibe`,
    '┃',
    '┃ 🪄 *MAGIC LAB*',
    `┃  • ${p}magic  _(reply to a message)_`,
    `┃  • ${p}meme   _(reply to an image)_`,
    '┃',
    '┃ 🪪 *IDENTITY*',
    `┃  • ${p}pass`,
    `┃  • ${p}id`,
    '┃',
    '┃ 🎨 *VISUAL STUDIO*',
    `┃  • ${p}poster <name>`,
    `┃  • ${p}dp      _(reply to an image)_`,
    `┃  • ${p}sticker _(reply to media)_`,
    '┃',
    '┃ 🎵 *MUSIC DECK*',
    `┃  • ${p}song <name>`,
    `┃  • ${p}playlist <mood>`,
    '┃',
    '┃ 🥷 *HIDDEN LAYER*',
    `┃  • ${p}secret`,
    `┃  • ${p}story`,
    `┃  • ${p}box`,
    '┃',
    '┃ 👑 *PROFILE*',
    `┃  • ${p}owner`,
    `┃  • ${p}axhk`,
    '┃',
    `┃ 📚 *ALL COMMANDS*  •  ${p}menu all`,
    '╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
    '',
    `✦ ${config.footerDisplayText || 'POWERED BY ABDULLAH-X-HK'}`
  ].join('\n');
  return ctx.reply(text);
}
export async function sendAxhkOs(ctx) {
  const p = ctx.prefix || '.';
  const text = [
    '╭━━━〔 ✦ *A_X_HK OS* 〕━━━╮',
    '┃ *PRIVATE DIGITAL EXPERIENCE*',
    '┃',
    '┃ ◈ *NEURAL AI*',
    `┃   ${p}ai  •  ${p}vibe`,
    '┃',
    '┃ ◈ *MAGIC LAB*',
    `┃   ${p}magic  •  ${p}meme`,
    '┃',
    '┃ ◈ *IDENTITY CORE*',
    `┃   ${p}pass  •  ${p}id`,
    '┃',
    '┃ ◈ *VISUAL STUDIO*',
    `┃   ${p}poster  •  ${p}dp  •  ${p}sticker`,
    '┃',
    '┃ ◈ *MUSIC DECK*',
    `┃   ${p}song  •  ${p}playlist`,
    '┃',
    '┃ ◈ *HIDDEN LAYER*',
    `┃   ${p}secret  •  ${p}story  •  ${p}box`,
    '┃',
    '┃ ◈ *OWNER PROFILE*',
    `┃   ${p}owner`,
    '┃',
    `┃ ⚡ CONTROL CENTER  •  ${p}menu`,
    '╰━━━━━━━━━━━━━━━━━━━━━━━━╯',
    '',
    'A_X_HK OS • ONLINE',
    `${config.footerDisplayText || 'POWERED BY ABDULLAH-X-HK'}`
  ].join('\n');
  return ctx.reply(text);
}
export async function sendAIAnswerCard(ctx, answer = '', question = '') {
  const answerLines = wrap(answer, 38, 9);
  return sendCard(ctx, {
    kicker: 'A_X_HK • AI ANSWER',
    title: 'NEURAL RESPONSE',
    subtitle: clean(question, 100) || 'AI RESPONSE',
    badge: 'AI',
    lines: answerLines
  }, { caption: answer.length > 900 ? `${answer.slice(0, 3400)}` : '' });
}

export async function sendMusicCard(ctx, item = {}, fallbackTitle = 'A_X_HK MUSIC') {
  const title = clean(item.title || item.trackName || fallbackTitle, 50);
  const artist = clean(item.uploader || item.artist || item.artistName || 'Unknown artist', 40);
  const image = await renderPremiumCard({
    kicker: 'A_X_HK • MUSIC DECK',
    title,
    subtitle: artist,
    badge: '♫',
    lines: [
      `SOURCE  •  ${clean(item.platform || item.source || 'Music', 34)}`,
      `TYPE    •  PREMIUM AUDIO CARD`,
      '',
      'PLAYBACK READY',
      'A_X_HK MUSIC ENGINE'
    ]
  });
  return ctx.send({ image, caption: `🎵 *${title}*\n👤 ${artist}\n\n${config.footerMessage}` }, { quoted: ctx.msg });
}

export async function sendCinematicIntro(ctx) {
  return sendCard(ctx, {
    kicker: 'A_X_HK • PRIVATE DIGITAL EXPERIENCE',
    title: 'WELCOME TO A_X_HK',
    subtitle: 'THIS IS NOT A STANDARD WHATSAPP BOT',
    badge: '✦',
    lines: [
      'AI • MAGIC • MUSIC • IDENTITY',
      'POSTERS • DP STUDIO • MEMES',
      'MEMBER PASS • SECRET LAYER',
      '',
      `ENTER  •  ${ctx.prefix}axhk`,
      `MENU   •  ${ctx.prefix}menu`
    ]
  }, { caption: `✨ *A_X_HK OS ONLINE*\nType *${ctx.prefix}axhk* to enter.\n\n${config.footerMessage}` });
}
