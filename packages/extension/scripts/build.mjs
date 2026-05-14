// Build script for the Project Extraction browser extension.
//
// Bundles three TS entry points with esbuild and copies static assets
// (manifest.json, popup.html, icons) into dist/.

import { build, context } from 'esbuild';
import { promises as fs } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync, crc32 } from 'node:zlib';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');
const SRC = join(ROOT, 'src');
const PUBLIC_DIR = join(ROOT, 'public');
const DIST = join(ROOT, 'dist');

const watchMode = process.argv.includes('--watch');

const entryPoints = {
  background: join(SRC, 'background', 'index.ts'),
  content: join(SRC, 'content', 'index.ts'),
  popup: join(SRC, 'popup', 'index.ts'),
};

const buildOptions = {
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['chrome111'],
  sourcemap: watchMode ? 'inline' : false,
  minify: !watchMode,
  legalComments: 'none',
  logLevel: 'info',
};

async function ensureDir(path) {
  await fs.mkdir(path, { recursive: true });
}

async function rimraf(path) {
  try {
    await fs.rm(path, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

async function copyFile(src, dest) {
  await ensureDir(dirname(dest));
  await fs.copyFile(src, dest);
}

async function copyDir(src, dest) {
  let entries;
  try {
    entries = await fs.readdir(src, { withFileTypes: true });
  } catch {
    return;
  }
  await ensureDir(dest);
  for (const entry of entries) {
    const s = join(src, entry.name);
    const d = join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(s, d);
    } else if (entry.isFile()) {
      await fs.copyFile(s, d);
    }
  }
}

// --- Icon synthesis -----------------------------------------------------
// Generates placeholder PNG icons on the fly if none exist. This keeps the
// repo free of binary blobs while still producing a valid loadable bundle.

const ICON_SIZES = [16, 32, 48, 128];
const ICON_FG = { r: 0xff, g: 0x33, b: 0x33, a: 0xff };
const ICON_BG = { r: 0x0a, g: 0x0a, b: 0x0a, a: 0xff };

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  const crc = crc32(Buffer.concat([typeBuf, data]));
  crcBuf.writeUInt32BE(crc >>> 0, 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function makeIconPng(size) {
  const rowLen = 1 + size * 4;
  const raw = Buffer.alloc(rowLen * size);
  const inset = Math.max(1, Math.floor(size / 5));
  for (let y = 0; y < size; y++) {
    raw[y * rowLen] = 0;
    for (let x = 0; x < size; x++) {
      const offset = y * rowLen + 1 + x * 4;
      const inBox = x >= inset && x < size - inset && y >= inset && y < size - inset;
      const c = inBox ? ICON_FG : ICON_BG;
      raw[offset] = c.r;
      raw[offset + 1] = c.g;
      raw[offset + 2] = c.b;
      raw[offset + 3] = c.a;
    }
  }
  const idat = deflateSync(raw);
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

async function ensureIcons() {
  const iconsDir = join(PUBLIC_DIR, 'icons');
  await ensureDir(iconsDir);
  for (const size of ICON_SIZES) {
    const path = join(iconsDir, `icon-${size}.png`);
    try {
      await fs.access(path);
    } catch {
      const png = makeIconPng(size);
      await fs.writeFile(path, png);
    }
  }
}

async function copyStaticAssets() {
  await ensureIcons();
  await copyFile(join(PUBLIC_DIR, 'manifest.json'), join(DIST, 'manifest.json'));
  await copyFile(join(SRC, 'popup', 'popup.html'), join(DIST, 'popup.html'));
  await copyDir(join(PUBLIC_DIR, 'icons'), join(DIST, 'icons'));
}

async function bundleAll() {
  await Promise.all(
    Object.entries(entryPoints).map(([name, entry]) =>
      build({
        ...buildOptions,
        entryPoints: [entry],
        outfile: join(DIST, `${name}.js`),
      }),
    ),
  );
}

async function watchAll() {
  await Promise.all(
    Object.entries(entryPoints).map(async ([name, entry]) => {
      const ctx = await context({
        ...buildOptions,
        entryPoints: [entry],
        outfile: join(DIST, `${name}.js`),
      });
      await ctx.watch();
    }),
  );
  // eslint-disable-next-line no-console
  console.log('[extension] watching for changes...');
}

async function main() {
  await rimraf(DIST);
  await ensureDir(DIST);
  await copyStaticAssets();
  if (watchMode) {
    await watchAll();
  } else {
    await bundleAll();
    // eslint-disable-next-line no-console
    console.log('[extension] build complete -> dist/');
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[extension] build failed:', err);
  process.exit(1);
});
