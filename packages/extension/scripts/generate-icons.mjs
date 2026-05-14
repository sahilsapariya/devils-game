// Generate placeholder PNG icons for the extension.
// We don't pull in a graphics library — instead, we synthesize tiny
// solid-color PNGs with a manually written deflate stream.

import { promises as fs } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync, crc32 } from 'node:zlib';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');
const ICONS_DIR = join(ROOT, 'public', 'icons');

const SIZES = [16, 32, 48, 128];

// Operational red on near-black background.
const FG = { r: 0xff, g: 0x33, b: 0x33, a: 0xff };
const BG = { r: 0x0a, g: 0x0a, b: 0x0a, a: 0xff };

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  const crc = crc32(Buffer.concat([typeBuf, data]));
  crcBuf.writeUInt32BE(crc >>> 0, 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function makePng(size) {
  // Filter byte (0) per scanline + RGBA pixels.
  const rowLen = 1 + size * 4;
  const raw = Buffer.alloc(rowLen * size);
  // Draw: filled background with a red square in the middle.
  const inset = Math.max(1, Math.floor(size / 5));
  for (let y = 0; y < size; y++) {
    raw[y * rowLen] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const offset = y * rowLen + 1 + x * 4;
      const inBox = x >= inset && x < size - inset && y >= inset && y < size - inset;
      const c = inBox ? FG : BG;
      raw[offset] = c.r;
      raw[offset + 1] = c.g;
      raw[offset + 2] = c.b;
      raw[offset + 3] = c.a;
    }
  }
  const idatData = deflateSync(raw);

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', idatData),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

async function main() {
  await fs.mkdir(ICONS_DIR, { recursive: true });
  for (const size of SIZES) {
    const png = makePng(size);
    const path = join(ICONS_DIR, `icon-${size}.png`);
    await fs.writeFile(path, png);
    // eslint-disable-next-line no-console
    console.log(`[icons] wrote ${path} (${png.length} bytes)`);
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
