import { OWNER_PROFILE } from '../core/owner-profile.js';
import { allCommands, commandsByCategory, getCommand } from '../core/registry.js';

const clean = (value = '') => String(value || '').replace(/\s+/g, ' ').trim();
const lower = (value = '') => clean(value).toLowerCase();

function romanStyle(text = '') {
  return /\b(kya|kia|hai|han|haan|yar|yaar|bhai|kr|kar|karo|bata|bta|mujhe|muje|ap|aap|abdullah|kab|kahan|kaam|chahiye|theek|acha|ni|nahi|nai|ho|hoga)\b/i.test(text);
}

function availabilityText(slot) {
  if (slot?.key === 'sleep') return 'Abdullah abhi rest/sleep time mein hain (10 AM–4 PM).';
  if (slot?.key === 'office') return 'Abdullah abhi office time mein hain (9 PM–8 AM).';
  return 'Abdullah abhi free/available window mein ho sakte hain (8–10 AM ya 4–9 PM).';
}

function accessLabel(cmd) {
  if (cmd.masterOnly) return 'master owner only';
  if (cmd.ownerOnly) return 'owner only';
  if (cmd.groupOnly) return 'group only';
  if (cmd.adminOnly) return 'group admin';
  return 'public';
}

function commandFromQuestion(text = '') {
  const raw = lower(text);
  const dotted = [...raw.matchAll(/\.([a-z0-9_-]+)/g)].map((m) => m[1]);
  for (const name of dotted) {
    const cmd = getCommand(name);
    if (cmd) return cmd;
  }

  const direct = raw.match(/\b(?:command\s+)?([a-z0-9_-]{2,30})\s+(?:kis liye|kya karta|kya karti|what does|usage|use|kaise)\b/i);
  if (direct?.[1]) {
    const cmd = getCommand(direct[1]);
    if (cmd) return cmd;
  }
  return null;
}

function commandReply(cmd, prefix = '.') {
  const aliases = Array.isArray(cmd.aliases) && cmd.aliases.length
    ? `\nAliases: ${cmd.aliases.slice(0, 8).map((a) => prefix + a).join(', ')}`
    : '';
  return [
    `*${prefix}${cmd.name}*`,
    cmd.description || 'Bot command.',
    cmd.usage ? `Usage: ${prefix}${cmd.usage}` : '',
    `Access: ${accessLabel(cmd)}`,
    aliases
  ].filter(Boolean).join('\n');
}

function menuSummary(prefix = '.') {
  const grouped = commandsByCategory();
  const top = Object.entries(grouped)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 8)
    .map(([name, rows]) => `${name}: ${rows.length}`)
    .join(' • ');
  return `A_X_HK mein ${allCommands().length} registered commands hain. Main categories: ${top}. Full list ke liye ${prefix}menu ya command dhoondhne ke liye ${prefix}searchcmd <name> use karein.`;
}

function simpleMath(text = '') {
  const value = clean(text)
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/\bplus\b/gi, '+')
    .replace(/\bminus\b/gi, '-')
    .replace(/\b(?:times|multiply by)\b/gi, '*')
    .replace(/\b(?:divided by|divide by)\b/gi, '/')
    .replace(/\bwhat is\b|\bcalculate\b|\bcalc\b|\bkitna hota hai\b|\bkitne hotay hain\b/gi, '')
    .trim();

  if (!/^[\d\s()+\-*/%.]+$/.test(value) || !/[+\-*/%]/.test(value) || value.length > 80) return '';
  try {
    const result = Function(`"use strict"; return (${value})`)();
    if (!Number.isFinite(result)) return '';
    return `Result: *${result}*`;
  } catch {
    return '';
  }
}

function genericFallback(text, slot, currentTime, roman) {
  const short = clean(text).slice(0, 220);
  if (/[?؟]$/.test(short) || /\b(kya|kia|kaise|kesy|kyun|q|kab|kahan|kon|who|what|why|how|when|where|can you|could you)\b/i.test(short)) {
    return roman
      ? `Main A_X_HK local assistant mode mein hoon. API ke baghair is sawal ka exact factual jawab guess nahi karunga. Aap thora context/detail de dein, main jitna locally samajh sakta hoon utna help karunga. ${availabilityText(slot)}`
      : `I’m running in A_X_HK local-assistant mode. Without the AI provider I won’t guess an exact factual answer. Add a little context/detail and I’ll still help with what I can locally. ${availabilityText(slot)}`;
  }

  return roman
    ? `Samajh gaya. Aap ka message receive ho gaya hai. ${availabilityText(slot)} Agar aap ko Abdullah se related kaam, project, bot command, Shopify, website/app ya automation chahiye ho to details bhej dein — main yahin guide kar deta hoon.`
    : `Got it — your message has been received. ${availabilityText(slot)} If this is about Abdullah, a project, bot command, Shopify, a website/app, or automation, send the details and I’ll guide you here.`;
}

export function localAssistantReply(ctx, { slot = null, currentTime = '' } = {}) {
  const text = clean(ctx?.text);
  if (!text) return '';
  const v = lower(text);
  const roman = romanStyle(text);
  const prefix = ctx?.prefix || '.';

  const cmd = commandFromQuestion(text);
  if (cmd) return commandReply(cmd, prefix);

  const math = simpleMath(text);
  if (math) return math;

  if (/^(hi+|hello+|hey+|hlo+|salam|assalam(?:u)?alaikum|aoa|aslam o alaikum|hy)[!.\s]*$/i.test(v)) {
    return roman
      ? `Salam 👋 Main A_X_HK Assistant hoon. ${availabilityText(slot)} Batao kis cheez mein help chahiye?`
      : `Hi 👋 I’m A_X_HK Assistant. ${availabilityText(slot)} How can I help?`;
  }

  if (/\b(how are you|kaise ho|kesy ho|kese ho|kya haal|kia haal|haal chal)\b/i.test(v)) {
    return roman ? 'Main theek hoon yar 😄 A_X_HK Assistant ready hai. Batao kya kaam hai?' : 'I’m good 😄 A_X_HK Assistant is ready. What do you need?';
  }

  if (/\b(thank you|thanks|thx|shukriya|jazakallah|meherbani)\b/i.test(v)) {
    return roman ? 'Khushi hui yar 🤝 Jab chaho message kar dena.' : 'You’re welcome 🤝 Message anytime.';
  }

  if (/^(ok+|okay|theek|thik|acha|achha|done|haan|han|yes|yup|hmm+|alright)[!.\s]*$/i.test(v)) {
    return roman ? 'Theek hai 👍' : 'Alright 👍';
  }

  if (/\b(who are you|tum kon ho|tum kaun ho|ap kon ho|aap kaun ho|bot kon hai|bot kaun hai)\b/i.test(v)) {
    return roman
      ? 'Main A_X_HK AI/Local Assistant hoon — Abdullah ka official WhatsApp bot assistant. Main Abdullah ban kar reply nahi karta; unki public info, bot commands aur project inquiries handle karta hoon.'
      : 'I’m A_X_HK Assistant, Abdullah’s official WhatsApp bot assistant. I don’t impersonate Abdullah; I handle public info, bot commands, and project inquiries.';
  }

  if (/\b(abdullah kon|abdullah kaun|who is abdullah|abdullah kya karta|abdullah kia karta|what does abdullah do)\b/i.test(v)) {
    return roman
      ? `Abdullah A_X_HK / ABDULLAH-X-HK ke naam se kaam karte hain. Unka kaam full-stack web/apps, Shopify/e-commerce, automation/bots, WhatsApp bots, AI integrations, dashboards/APIs aur custom software/tools hai. ${availabilityText(slot)}`
      : `Abdullah works under A_X_HK / ABDULLAH-X-HK. His work includes full-stack web/apps, Shopify/e-commerce, automation and WhatsApp bots, AI integrations, dashboards/APIs, and custom software/tools. ${availabilityText(slot)}`;
  }

  if (/\b(abdullah.*(kahan|where|available|free|busy)|where.*abdullah|kab.*free|kab.*available|office.*time|sleep.*time|rest.*time|free.*time)\b/i.test(v)) {
    return `${availabilityText(slot)} Office: ${OWNER_PROFILE.officeHours}. Rest: ${OWNER_PROFILE.sleepHours}. Free windows: ${OWNER_PROFILE.freeHours}. Current Pakistan time: ${currentTime || 'runtime time'}.`;
  }

  if (/\b(services?|kaam kya|kia kaam|kya kya karte|what can abdullah|website|web app|mobile app|shopify|automation|whatsapp bot|ai integration|dashboard|api|backend|software)\b/i.test(v)) {
    if (/\b(price|pricing|cost|rate|charges|kitne|kitna|budget)\b/i.test(v)) {
      return roman
        ? 'Pricing fixed guess nahi karunga — project scope par depend karti hai. Aap project type, required features, deadline aur approx budget bhej dein; Abdullah review karke confirm kar sakte hain.'
        : 'Pricing depends on scope, so I won’t invent a fixed quote. Send the project type, required features, deadline, and approximate budget; Abdullah can confirm after review.';
    }
    return roman
      ? 'Haan, A_X_HK web/app development, Shopify stores, automation/workflows, WhatsApp bots, AI integrations, dashboards, APIs/backends aur custom tools par kaam karta hai. Aap jo banwana/fix karwana chahte ho uski short details bhej do.'
      : 'Yes. A_X_HK handles web/app development, Shopify stores, automation/workflows, WhatsApp bots, AI integrations, dashboards, APIs/backends, and custom tools. Send a short description of what you want built or fixed.';
  }

  if (/\b(project|client|work|hire|banwana|banana hai|bana do|fix karna|problem hai|issue hai|store|website|app)\b/i.test(v)) {
    return roman
      ? 'Bilkul. Project ka type, exact goal/features, koi reference/link, deadline aur agar ho to budget range bhej dein. Main details organize karke Abdullah ke liye clear rakh dunga.'
      : 'Sure. Send the project type, exact goal/features, any reference/link, deadline, and budget range if you have one. I’ll keep the details organized for Abdullah.';
  }

  if (/\b(call|phone|contact|baat karni|baat kara|abdullah se baat|reply kab|direct baat)\b/i.test(v)) {
    return roman
      ? `${availabilityText(slot)} Aap yahin apna message/detail bhej dein. Important ho to clearly “important / Abdullah ko bata dena” likh dein; bot usay owner alert mein note karega.`
      : `${availabilityText(slot)} Send your message/details here. If it is important, clearly say “important / tell Abdullah”; the bot will save it as an owner alert.`;
  }

  if (/\b(menu|commands?|bot kya karta|bot kia karta|features?|kya kya command|commands list)\b/i.test(v)) {
    return menuSummary(prefix);
  }

  if (/\b(pair|pairing|connect whatsapp|link device|bot connect|number connect)\b/i.test(v)) {
    return `WhatsApp bot pair karne ke liye private chat mein *${prefix}pair <country-code-number>* use karein. Pairing code isi chat mein aayega.`;
  }

  if (/\b(time|waqt|date|tareekh|tarikh)\b/i.test(v) && /\b(abhi|now|current|pakistan)\b/i.test(v)) {
    return roman
      ? `Pakistan runtime time: *${currentTime || 'available nahi'}*. ${availabilityText(slot)}`
      : `Pakistan runtime time: *${currentTime || 'unavailable'}*. ${availabilityText(slot)}`;
  }

  if (/\b(joke|mazak|funny)\b/i.test(v)) {
    return roman ? 'Developer ka favourite cardio? Production bug ke peeche bhaagna 😄' : 'A developer’s favorite cardio? Chasing a production bug 😄';
  }

  if (/\b(sorry|maaf|maazrat)\b/i.test(v)) {
    return roman ? 'Koi masla nahi yar 👍' : 'No problem 👍';
  }

  return genericFallback(text, slot, currentTime, roman);
}
