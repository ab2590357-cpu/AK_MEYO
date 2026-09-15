import { registerCommand } from '../../lib/core/registry.js';
import { db } from '../../lib/core/database.js';
import { config } from '../../lib/config.js';

const nums = (text) => String(text || '').split(/[\s,|]+/).filter(Boolean).map(Number);
const finiteNums = (text) => {
  const out = nums(text);
  if (!out.length || out.some((n) => !Number.isFinite(n))) throw new Error('Provide valid numbers.');
  return out;
};
const fmt = (n, digits = 4) => Number(n.toFixed(digits)).toString();

function validZone(zone) {
  try { new Intl.DateTimeFormat('en-US', { timeZone: zone }).format(); return true; } catch { return false; }
}
function userZone(ctx) { return ctx.user.timezone || config.timezone; }
function parseDate(text) {
  const date = new Date(String(text || '').trim());
  if (Number.isNaN(date.getTime())) throw new Error('Use a valid date, for example 2026-12-31.');
  return date;
}
function monthCalendar(year, month) {
  const first = new Date(Date.UTC(year, month, 1));
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const start = first.getUTCDay();
  const title = first.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const rows = ['Su Mo Tu We Th Fr Sa'];
  let row = Array(start).fill('  ');
  for (let day = 1; day <= days; day += 1) {
    row.push(String(day).padStart(2, ' '));
    if (row.length === 7) { rows.push(row.join(' ')); row = []; }
  }
  if (row.length) rows.push([...row, ...Array(7 - row.length).fill('  ')].join(' '));
  return `${title}\n${rows.join('\n')}`;
}
function romanize(number) {
  let n = Number(number);
  if (!Number.isInteger(n) || n < 1 || n > 3999) throw new Error('Roman conversion supports integers 1-3999.');
  const map = [['M',1000],['CM',900],['D',500],['CD',400],['C',100],['XC',90],['L',50],['XL',40],['X',10],['IX',9],['V',5],['IV',4],['I',1]];
  let out = '';
  for (const [symbol, value] of map) while (n >= value) { out += symbol; n -= value; }
  return out;
}
function unroman(value) {
  const s = String(value || '').toUpperCase().trim();
  if (!/^[MDCLXVI]+$/.test(s)) throw new Error('Provide a valid Roman numeral.');
  const map = { I:1,V:5,X:10,L:50,C:100,D:500,M:1000 };
  let total = 0;
  for (let i = 0; i < s.length; i += 1) total += map[s[i]] < (map[s[i + 1]] || 0) ? -map[s[i]] : map[s[i]];
  if (romanize(total) !== s) throw new Error('Roman numeral is not in canonical form.');
  return total;
}

registerCommand({ name: 'date', category: 'productivity', description: 'Show date/time in your bot timezone', async run(ctx) { await ctx.reply(new Intl.DateTimeFormat('en-GB', { timeZone: userZone(ctx), dateStyle: 'full', timeStyle: 'medium' }).format(new Date())); } });
registerCommand({ name: 'timezone', aliases: ['tz'], category: 'productivity', description: 'Show your configured timezone', async run(ctx) { await ctx.reply(`Timezone: ${userZone(ctx)}`); } });
registerCommand({
  name: 'settimezone', aliases: ['settz'], category: 'productivity', description: 'Set your personal IANA timezone', usage: 'settimezone Asia/Karachi',
  async run(ctx) { const zone = ctx.argText.trim(); if (!zone || !validZone(zone)) throw new Error('Provide a valid IANA timezone, for example Asia/Karachi.'); ctx.user.timezone = zone; await db.save(); await ctx.reply(`Timezone saved: ${zone}`); }
});
registerCommand({
  name: 'calendar', category: 'productivity', description: 'Show a simple monthly calendar', usage: 'calendar 2026 9',
  async run(ctx) { const now = new Date(); const year = Number(ctx.args[0]) || now.getFullYear(); const month = (Number(ctx.args[1]) || (now.getMonth() + 1)) - 1; if (year < 1970 || year > 2100 || month < 0 || month > 11) throw new Error('Usage: calendar 2026 9'); await ctx.reply('```\n' + monthCalendar(year, month) + '\n```'); }
});
registerCommand({
  name: 'daysuntil', category: 'productivity', description: 'Count days until a date', usage: 'daysuntil 2026-12-31',
  async run(ctx) { const target = parseDate(ctx.argText); const diff = Math.ceil((target.getTime() - Date.now()) / 86400000); await ctx.reply(diff >= 0 ? `${diff} day(s) remaining.` : `${Math.abs(diff)} day(s) ago.`); }
});
registerCommand({
  name: 'age', category: 'productivity', description: 'Calculate age from a birth date', usage: 'age 2000-01-15',
  async run(ctx) { const birth = parseDate(ctx.argText); const now = new Date(); if (birth > now) throw new Error('Birth date cannot be in the future.'); let years = now.getFullYear() - birth.getFullYear(); const beforeBirthday = now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate()); if (beforeBirthday) years -= 1; await ctx.reply(`Age: ${years} year(s)`); }
});
registerCommand({ name: 'sum', category: 'productivity', description: 'Add a list of numbers', async run(ctx) { const n = finiteNums(ctx.argText); await ctx.reply(`Sum: ${fmt(n.reduce((a,b) => a+b, 0))}`); } });
registerCommand({ name: 'average', aliases: ['avg'], category: 'productivity', description: 'Average a list of numbers', async run(ctx) { const n = finiteNums(ctx.argText); await ctx.reply(`Average: ${fmt(n.reduce((a,b) => a+b, 0) / n.length)}`); } });
registerCommand({ name: 'median', category: 'productivity', description: 'Median of a list of numbers', async run(ctx) { const n = finiteNums(ctx.argText).sort((a,b) => a-b); const m = Math.floor(n.length / 2); const value = n.length % 2 ? n[m] : (n[m - 1] + n[m]) / 2; await ctx.reply(`Median: ${fmt(value)}`); } });
registerCommand({ name: 'minmax', category: 'productivity', description: 'Find min and max values', async run(ctx) { const n = finiteNums(ctx.argText); await ctx.reply(`Min: ${Math.min(...n)}\nMax: ${Math.max(...n)}`); } });
registerCommand({
  name: 'randnum', aliases: ['randomnumber'], category: 'productivity', description: 'Generate a random integer', usage: 'randnum 1 100',
  async run(ctx) { let a = Number(ctx.args[0]); let b = Number(ctx.args[1]); if (!Number.isFinite(a) || !Number.isFinite(b)) throw new Error('Usage: randnum 1 100'); if (a > b) [a,b] = [b,a]; a = Math.ceil(a); b = Math.floor(b); if (b - a > 1000000000) throw new Error('Range is too large.'); await ctx.reply(String(Math.floor(Math.random() * (b - a + 1)) + a)); }
});
registerCommand({
  name: 'pickone', category: 'productivity', description: 'Pick one item from a pipe-separated list', usage: 'pickone red | blue | green',
  async run(ctx) { const items = ctx.argText.split('|').map((x) => x.trim()).filter(Boolean); if (items.length < 2 || items.length > 50) throw new Error('Provide 2-50 choices separated by |.'); await ctx.reply(items[Math.floor(Math.random() * items.length)]); }
});
registerCommand({
  name: 'percent', aliases: ['percentage'], category: 'productivity', description: 'Calculate a percentage', usage: 'percent 25 200',
  async run(ctx) { const p = Number(ctx.args[0]); const value = Number(ctx.args[1]); if (![p,value].every(Number.isFinite)) throw new Error('Usage: percent 25 200'); await ctx.reply(`${p}% of ${value} = ${fmt((p/100)*value)}`); }
});
registerCommand({
  name: 'discount', category: 'productivity', description: 'Calculate price after discount', usage: 'discount 1500 20',
  async run(ctx) { const price = Number(ctx.args[0]); const pct = Number(ctx.args[1]); if (![price,pct].every(Number.isFinite) || price < 0 || pct < 0 || pct > 100) throw new Error('Usage: discount 1500 20'); const saved = price * pct / 100; await ctx.reply(`Final: ${fmt(price-saved)}\nSaved: ${fmt(saved)}`); }
});
registerCommand({
  name: 'tip', category: 'productivity', description: 'Calculate tip and total', usage: 'tip 2500 15',
  async run(ctx) { const bill = Number(ctx.args[0]); const pct = Number(ctx.args[1]); if (![bill,pct].every(Number.isFinite) || bill < 0 || pct < 0) throw new Error('Usage: tip 2500 15'); const t = bill*pct/100; await ctx.reply(`Tip: ${fmt(t)}\nTotal: ${fmt(bill+t)}`); }
});
registerCommand({
  name: 'splitbill', category: 'productivity', description: 'Split a bill between people', usage: 'splitbill 5000 4',
  async run(ctx) { const bill = Number(ctx.args[0]); const people = Number(ctx.args[1]); if (!Number.isFinite(bill) || !Number.isInteger(people) || bill < 0 || people < 1 || people > 1000) throw new Error('Usage: splitbill 5000 4'); await ctx.reply(`Per person: ${fmt(bill/people)}`); }
});
registerCommand({
  name: 'converttemp', aliases: ['tempconvert'], category: 'productivity', description: 'Convert C/F/K temperatures', usage: 'converttemp 32 F C',
  async run(ctx) { const value = Number(ctx.args[0]); const from = String(ctx.args[1] || '').toUpperCase(); const to = String(ctx.args[2] || '').toUpperCase(); if (!Number.isFinite(value) || !['C','F','K'].includes(from) || !['C','F','K'].includes(to)) throw new Error('Usage: converttemp 32 F C'); let c = from === 'C' ? value : from === 'F' ? (value-32)*5/9 : value-273.15; const out = to === 'C' ? c : to === 'F' ? c*9/5+32 : c+273.15; await ctx.reply(`${fmt(value)} ${from} = ${fmt(out)} ${to}`); }
});
registerCommand({
  name: 'convertlength', aliases: ['lengthconvert'], category: 'productivity', description: 'Convert mm/cm/m/km/in/ft/yd/mi', usage: 'convertlength 10 km mi',
  async run(ctx) { const value = Number(ctx.args[0]); const from = String(ctx.args[1] || '').toLowerCase(); const to = String(ctx.args[2] || '').toLowerCase(); const m = { mm:0.001, cm:0.01, m:1, km:1000, in:0.0254, ft:0.3048, yd:0.9144, mi:1609.344 }; if (!Number.isFinite(value) || !m[from] || !m[to]) throw new Error('Usage: convertlength 10 km mi'); await ctx.reply(`${fmt(value)} ${from} = ${fmt(value*m[from]/m[to], 6)} ${to}`); }
});
registerCommand({
  name: 'convertweight', aliases: ['weightconvert'], category: 'productivity', description: 'Convert mg/g/kg/oz/lb', usage: 'convertweight 5 kg lb',
  async run(ctx) { const value = Number(ctx.args[0]); const from = String(ctx.args[1] || '').toLowerCase(); const to = String(ctx.args[2] || '').toLowerCase(); const g = { mg:0.001, g:1, kg:1000, oz:28.349523125, lb:453.59237 }; if (!Number.isFinite(value) || !g[from] || !g[to]) throw new Error('Usage: convertweight 5 kg lb'); await ctx.reply(`${fmt(value)} ${from} = ${fmt(value*g[from]/g[to], 6)} ${to}`); }
});
registerCommand({
  name: 'convertstorage', aliases: ['storageconvert'], category: 'productivity', description: 'Convert B/KB/MB/GB/TB using 1024 base', usage: 'convertstorage 2 GB MB',
  async run(ctx) { const value = Number(ctx.args[0]); const from = String(ctx.args[1] || '').toUpperCase(); const to = String(ctx.args[2] || '').toUpperCase(); const b = { B:1, KB:1024, MB:1024**2, GB:1024**3, TB:1024**4 }; if (!Number.isFinite(value) || !b[from] || !b[to]) throw new Error('Usage: convertstorage 2 GB MB'); await ctx.reply(`${fmt(value)} ${from} = ${fmt(value*b[from]/b[to], 6)} ${to}`); }
});
registerCommand({ name: 'roman', category: 'productivity', description: 'Convert integer to Roman numeral', async run(ctx) { await ctx.reply(romanize(ctx.argText)); } });
registerCommand({ name: 'unroman', category: 'productivity', description: 'Convert Roman numeral to integer', async run(ctx) { await ctx.reply(String(unroman(ctx.argText))); } });
registerCommand({
  name: 'rgbtohex', category: 'productivity', description: 'Convert RGB to HEX', usage: 'rgbtohex 255 128 0',
  async run(ctx) { const [r,g,b] = nums(ctx.argText); if (![r,g,b].every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) throw new Error('Usage: rgbtohex 255 128 0'); await ctx.reply('#' + [r,g,b].map((n) => n.toString(16).padStart(2,'0')).join('').toUpperCase()); }
});
registerCommand({
  name: 'hextorgb', category: 'productivity', description: 'Convert HEX color to RGB', usage: 'hextorgb #FF8000',
  async run(ctx) { const hex = ctx.argText.trim().replace(/^#/, ''); if (!/^[0-9a-f]{6}$/i.test(hex)) throw new Error('Usage: hextorgb #FF8000'); const n = parseInt(hex, 16); await ctx.reply(`RGB: ${(n>>16)&255}, ${(n>>8)&255}, ${n&255}`); }
});

registerCommand({
  name: 'todoadd', aliases: ['addtodo'], category: 'productivity', description: 'Add a personal todo item', usage: 'todoadd Finish homepage',
  async run(ctx) { const text = ctx.argText.trim().slice(0, 300); if (!text) throw new Error('Provide a todo item.'); ctx.user.todos ||= []; if (ctx.user.todos.length >= 50) throw new Error('Todo limit reached (50).'); ctx.user.todos.push({ text, done: false, createdAt: Date.now() }); await db.save(); await ctx.reply(`Todo #${ctx.user.todos.length} added.`); }
});
registerCommand({
  name: 'todos', aliases: ['todolist'], category: 'productivity', description: 'List your todo items',
  async run(ctx) { ctx.user.todos ||= []; if (!ctx.user.todos.length) return ctx.reply('Your todo list is empty.'); await ctx.reply(ctx.user.todos.map((t,i) => `${i+1}. [${t.done ? 'x' : ' '}] ${t.text}`).join('\n').slice(0, 3500)); }
});
registerCommand({
  name: 'tododone', aliases: ['donetodo'], category: 'productivity', description: 'Mark a todo complete/incomplete', usage: 'tododone 2',
  async run(ctx) { ctx.user.todos ||= []; const i = Number(ctx.args[0]) - 1; if (!Number.isInteger(i) || !ctx.user.todos[i]) throw new Error('Provide a valid todo number.'); ctx.user.todos[i].done = !ctx.user.todos[i].done; await db.save(); await ctx.reply(`Todo #${i+1}: ${ctx.user.todos[i].done ? 'done' : 'open'}.`); }
});
registerCommand({
  name: 'tododel', aliases: ['deltodo'], category: 'productivity', description: 'Delete a todo item', usage: 'tododel 2',
  async run(ctx) { ctx.user.todos ||= []; const i = Number(ctx.args[0]) - 1; if (!Number.isInteger(i) || !ctx.user.todos[i]) throw new Error('Provide a valid todo number.'); ctx.user.todos.splice(i,1); await db.save(); await ctx.reply('Todo deleted.'); }
});
registerCommand({
  name: 'todoclear', category: 'productivity', description: 'Clear completed todos or all todos', usage: 'todoclear done|all',
  async run(ctx) { ctx.user.todos ||= []; const mode = String(ctx.args[0] || 'done').toLowerCase(); if (!['done','all'].includes(mode)) throw new Error('Usage: todoclear done|all'); ctx.user.todos = mode === 'all' ? [] : ctx.user.todos.filter((t) => !t.done); await db.save(); await ctx.reply(`Todo list cleaned (${mode}).`); }
});
