// Native image dependencies require platform-specific binaries.
// Termux installs use npm --ignore-scripts while core WhatsApp and Channel Hub features
// are tested; media-only features must fail locally rather than preventing startup.
// Linux/other supported hosts retain the original strict module-loading behavior.
export const isTermux = process.platform === 'android'
  || String(process.env.PREFIX || '').includes('/com.termux/');

function unavailable(feature) {
  throw new Error(feature + ' is not yet available in this Termux build. The bot and Channel Hub can still run.');
}

export async function loadSharp() {
  try {
    const loaded = await import('sharp');
    return loaded.default || loaded;
  } catch (err) {
    if (!isTermux) throw err;
    return function unavailableSharp() { return unavailable('Image processing'); };
  }
}

export async function loadStickerFormatter() {
  try {
    return await import('wa-sticker-formatter');
  } catch (err) {
    if (!isTermux) throw err;
    return {
      Sticker: class UnavailableSticker {
        constructor() { unavailable('Sticker generation'); }
      },
      StickerTypes: { FULL: 'full' }
    };
  }
}
