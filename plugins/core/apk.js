import { registerCommand } from '../../lib/core/registry.js';
import { config } from '../../lib/config.js';
import { apkStoreInfo, cleanupApk, downloadApkByName, searchApks } from '../../lib/services/apk-store.js';

function fmtSize(bytes) {
  const n = Number(bytes || 0);
  return n ? `${(n / (1024 * 1024)).toFixed(1)} MB` : 'Unknown';
}

async function react(ctx, emoji) {
  try { await ctx.sock.sendMessage(ctx.chat, { react: { text: emoji, key: ctx.msg.key } }); } catch {}
}

function appLine(app, i = 0) {
  return `${i ? `${i}. ` : ''}${app.name}\n   ${app.package || 'Unknown package'} • ${app.version || 'latest'} • ${fmtSize(app.size)}\n   🛡 ${app.malwareRank || 'trusted filter'}`;
}

registerCommand({
  name: 'apk', aliases: ['getapk', 'appapk', 'androidapk'], category: 'download',
  description: 'Find a trusted public Android app/game APK by name and send the APK file', usage: 'apk <app or game name>', cooldown: 15,
  async run(ctx) {
    const query = String(ctx.argText || '').trim();
    if (!query) return ctx.reply(`Usage: ${ctx.prefix}apk WhatsApp\nExample: ${ctx.prefix}apk Subway Surfers`);
    await react(ctx, '📦');
    let item;
    try {
      item = await downloadApkByName(query);
      const caption = [
        `📦 ${item.name}`,
        `📱 Package: ${item.package || 'Unknown'}`,
        `🧩 Version: ${item.version || 'Latest'}`,
        `💾 Size: ${fmtSize(item.downloadedBytes || item.size)}`,
        `🛡 Trust: ${item.malwareRank || 'TRUSTED_FILTER'}`,
        '🌐 Source: public Aptoide mirror',
        '',
        `Sent by ${config.shortName}`,
        '',
        config.footerMessage
      ].join('\n');
      await ctx.send({
        document: { url: item.filePath },
        mimetype: 'application/vnd.android.package-archive',
        fileName: item.fileName,
        caption
      }, { quoted: ctx.msg });
      await react(ctx, '✅');
    } finally {
      if (item) await cleanupApk(item);
    }
  }
});

registerCommand({
  name: 'apksearch', aliases: ['appsearch', 'searchapk'], category: 'download',
  description: 'Search trusted public Android APK mirror results without downloading', usage: 'apksearch <app/game name>', cooldown: 5,
  async run(ctx) {
    const query = String(ctx.argText || '').trim();
    if (!query) return ctx.reply(`Usage: ${ctx.prefix}apksearch Instagram`);
    await react(ctx, '🔎');
    const results = await searchApks(query, 5);
    if (!results.length) return ctx.reply('No trusted public APK results found. Try the exact app name or package name.');
    const lines = results.map((app, i) => appLine(app, i + 1));
    const info = apkStoreInfo();
    await ctx.reply([
      `📦 ${config.shortName} APK SEARCH`, '', ...lines, '',
      `Use: ${ctx.prefix}apk <app name>`,
      `Details: ${ctx.prefix}apkinfo <app name>`,
      `Transfer limit: ${info.maxText}`,
      'Normal public releases only; modded/cracked builds are blocked.'
    ].join('\n'));
  }
});

registerCommand({
  name: 'apkinfo', aliases: ['appinfoapk'], category: 'download',
  description: 'Show trusted APK metadata without downloading the file', usage: 'apkinfo <app/game name>', cooldown: 5,
  async run(ctx) {
    const query = String(ctx.argText || '').trim();
    if (!query) return ctx.reply(`Usage: ${ctx.prefix}apkinfo WhatsApp`);
    const [app] = await searchApks(query, 1);
    if (!app) return ctx.reply('No trusted public APK metadata was found for that app.');
    await ctx.reply([
      `📦 *${app.name}*`,
      `📱 Package: ${app.package || 'Unknown'}`,
      `🧩 Version: ${app.version || 'Latest'}${app.versionCode ? ` (${app.versionCode})` : ''}`,
      `💾 Size: ${fmtSize(app.size)}`,
      `⬇️ Downloads: ${Number(app.downloads || 0).toLocaleString()}`,
      `🛡 Trust: ${app.malwareRank || 'TRUSTED_FILTER'}`,
      '',
      `Download: ${ctx.prefix}apk ${app.name}`
    ].join('\n'));
  }
});
