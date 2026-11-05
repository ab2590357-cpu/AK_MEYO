// Pure-JS detection for images supplied through the owner dashboard.
// Avoids requiring sharp/libvips on Android Termux. No SVG/HTML uploads.
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export function inspectRasterImage(bytes, options = {}) {
  const maxBytes = options.maxBytes ?? MAX_IMAGE_BYTES;
  if (!Buffer.isBuffer(bytes) || bytes.length < 12) throw new Error('Select a valid JPG, PNG or WebP image.');
  if (bytes.length > maxBytes) throw new Error('Image must be 8 MB or smaller.');
  const b = bytes;
  let mime = '', width = null, height = null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    mime = 'image/jpeg';
    // Validate header and locate an actual Start Of Frame segment.
    let pos = 2;
    while (pos + 4 < b.length) {
      if (b[pos] !== 0xff) break;
      const marker = b[pos + 1];
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker === 0x00 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { pos += 2; continue; }
      const segment = b.readUInt16BE(pos + 2);
      if (segment < 2 || pos + 2 + segment > b.length) break;
      if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker) && segment >= 7) {
        height = b.readUInt16BE(pos + 5);
        width = b.readUInt16BE(pos + 7);
        break;
      }
      pos += segment + 2;
    }
  } else if (b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) {
    mime = 'image/png';
    if (b.length < 24 || b.toString('ascii',12,16) !== 'IHDR') throw new Error('PNG image header is invalid.');
    width = b.readUInt32BE(16); height = b.readUInt32BE(20);
  } else if (b.toString('ascii',0,4) === 'RIFF' && b.toString('ascii',8,12) === 'WEBP') {
    mime = 'image/webp';
    if (b.length >= 30 && b.toString('ascii',12,16) === 'VP8X') {
      width = b.readUIntLE(24,3)+1; height = b.readUIntLE(27,3)+1;
    }
  } else throw new Error('Unsupported format. Use a real JPG, PNG or WebP image.');
  if (width !== null && (!width || !height || width > 10000 || height > 10000 || width * height > 40000000)) {
    throw new Error('Image dimensions are invalid or too large (max 40 megapixels).');
  }
  return { mime, width, height };
}
