export function serifBold(value = '') {
  let out = '';
  for (const ch of String(value)) {
    const code = ch.codePointAt(0);
    if (code >= 65 && code <= 90) out += String.fromCodePoint(0x1D400 + (code - 65));
    else if (code >= 97 && code <= 122) out += String.fromCodePoint(0x1D41A + (code - 97));
    else if (code >= 48 && code <= 57) out += String.fromCodePoint(0x1D7CE + (code - 48));
    else out += ch;
  }
  return out;
}

export function premiumLabel(label, value, emoji = '✨') {
  return `${emoji} *${serifBold(label)}*  ${serifBold(value)}`;
}

export function premiumTitle(value, left = '✨', right = '✨') {
  return `${left} *${serifBold(value)}* ${right}`;
}
