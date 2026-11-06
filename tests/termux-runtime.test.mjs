import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// Set Termux mode BEFORE imports so the native-media policy is stable.
process.env.AXHK_TERMUX_MODE = '1';
const { isTermux } = await import('../lib/utils/termux-native.js');
const { ensureMediaDownloader } = await import('../lib/services/media-downloader.js');
const { connectedNoticePayload } = await import('../lib/services/whatsapp.js');

test('Termux reconnect notice is text-only even if a menu image is available', () => {
  assert.equal(isTermux, true);
  const image = Buffer.from('image-data');
  assert.deepEqual(connectedNoticePayload('A-X-HK connected', image, true), {
    text: 'A-X-HK connected'
  });
  assert.deepEqual(connectedNoticePayload('A-X-HK connected', image, false), {
    image, caption: 'A-X-HK connected'
  });
  assert.deepEqual(connectedNoticePayload('A-X-HK connected', null, false), {
    text: 'A-X-HK connected'
  });
});

test('Termux uses an installed executable, never a downloaded Linux binary', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'axhk-ytdlp-'));
  const executable = path.join(tmp, 'yt-dlp');
  const previousOverride = process.env.AXHK_YT_DLP_PATH;
  try {
    await fs.writeFile(executable, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    await fs.chmod(executable, 0o755);
    process.env.AXHK_YT_DLP_PATH = executable;
    assert.equal(await ensureMediaDownloader(), executable);
  } finally {
    if (previousOverride === undefined) delete process.env.AXHK_YT_DLP_PATH;
    else process.env.AXHK_YT_DLP_PATH = previousOverride;
    await fs.rm(tmp, { recursive: true, force: true });
  }
});
