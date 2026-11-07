// Native media is optional on Termux. It must never block the core bot and
// Channel Hub worker, which only need normal Node.js and Baileys messaging.
// On non-Termux platforms keep the original strict native module behavior.
const locations = [
  process.env.PREFIX,
  process.env.HOME,
  process.env.TMPDIR,
  process.execPath,
  process.cwd()
].filter(Boolean);
export const isTermux = process.env.AXHK_TERMUX_MODE === '1'
  || process.platform === 'android'
  || Boolean(process.env.TERMUX_VERSION)
  || locations.some(value => String(value).includes('com.termux'));

function unavailable(feature) {
  throw new Error(feature + ' is unavailable in Termux without compatible native media binaries. Text-based bot commands and Channel Hub can still work.');
}
function unavailableSharp() { return unavailable('Image processing'); }

export async function loadSharp() {
  // Never import a known-incompatible .node binary when Termux was installed
  // using npm --ignore-scripts: native import side effects can crash startup.
  if (isTermux) return unavailableSharp;
  const loaded = await import('sharp');
  return loaded.default || loaded;
}

export async function loadStickerFormatter() {
  if (isTermux) {
    return {
      Sticker: class UnavailableSticker {
        constructor() { unavailable('Sticker generation'); }
      },
      StickerTypes: { FULL: 'full', CIRCLE: 'circle', CROPPED: 'cropped' }
    };
  }
  return import('wa-sticker-formatter');
}
