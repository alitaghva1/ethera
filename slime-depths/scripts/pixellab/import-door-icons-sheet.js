// Importer for the PixelLab-generated 8-icon door medallion sheet.
//
// Alternative to import-door-icons.js (which reads 8 separate Character
// folders). This script reads ONE sheet PNG and slices it into 8 cells.
//
// Sheet layout (canonical 512×128, 4 cells × 2 rows × 64×64):
//
//   row 1: combat   | mythic    | boss     | altar
//   row 2: shop     | sanctuary | event    | chest
//
// (Order matches the prompt below — fixed.)
//
// Workflow:
//   1. Generate the sheet in PixelLab → Objects with the prompt from
//      the chat thread. Set canvas to 512 × 128.
//   2. Drop the PNG at:
//        scripts/pixellab/imports/door-icons/sheet_door_icons.png
//   3. Run: node scripts/pixellab/import-door-icons-sheet.js
//
// Slices each 64×64 cell, trims transparent margins per cell, scales to
// fit a 4-px-padded 64×64 canonical output, writes individual PNGs to
// public/assets/door_icons/door_<key>.png.

import { mkdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, 'imports', 'door-icons', 'sheet_door_icons.png');
const OUT_DIR = join(__dirname, '..', '..', 'public', 'assets', 'door_icons');

// Sheet layout — 4 wide × 2 tall, 64-px cells. Order matches the prompt
// (left-to-right, top-to-bottom). DO NOT reorder without also updating
// the prompt in the chat thread or your icons will land in the wrong
// keys.
const ORDER = [
  ['combat',    'mythic',    'boss',  'altar'],
  ['shop',      'sanctuary', 'event', 'chest'],
];
const SHEET_W = 512;
const SHEET_H = 128;
const OUT_CELL = 64;
const PAD = 4;

async function exists(path) {
  try { await stat(path); return true; } catch { return false; }
}

async function trimBox(buffer, width, height) {
  let top = height, bottom = -1, left = width, right = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = buffer[(y * width + x) * 4 + 3];
      if (a > 8) {
        if (y < top) top = y;
        if (y > bottom) bottom = y;
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
  }
  if (bottom < 0) return null;
  return { left, top, w: right - left + 1, h: bottom - top + 1 };
}

if (!(await exists(SRC))) {
  console.error(`✗ Sheet not found: ${SRC}`);
  console.error(`  Generate in PixelLab (512×128 canvas, 8 icons in a 4×2 grid).`);
  console.error(`  Prompt is in the chat thread.`);
  process.exit(1);
}

const meta = await sharp(SRC).metadata();
if (meta.width !== SHEET_W || meta.height !== SHEET_H) {
  console.warn(
    `⚠ Sheet is ${meta.width}×${meta.height}, expected ${SHEET_W}×${SHEET_H}. ` +
    `Continuing — splitting into 4×2 equal cells regardless.`
  );
}
const cellW = Math.floor(meta.width / 4);
const cellH = Math.floor(meta.height / 2);

await mkdir(OUT_DIR, { recursive: true });

console.log(`→ slicing 8-icon door sheet`);
console.log(`  source: ${SRC}`);
console.log(`  output: ${OUT_DIR}`);
console.log('');

let landed = 0;
for (let row = 0; row < 2; row++) {
  for (let col = 0; col < 4; col++) {
    const id = ORDER[row][col];
    const left = col * cellW;
    const top = row * cellH;

    const cellRaw = await sharp(SRC)
      .extract({ left, top, width: cellW, height: cellH })
      .ensureAlpha()
      .raw()
      .toBuffer();
    const bbox = await trimBox(cellRaw, cellW, cellH);
    if (!bbox) {
      console.warn(`  [EMPTY] cell (${row},${col}) → ${id} fully transparent`);
      continue;
    }

    const targetMax = OUT_CELL - PAD * 2;
    const longAxis = Math.max(bbox.w, bbox.h);
    const scale = targetMax / longAxis;
    const outW = Math.max(1, Math.round(bbox.w * scale));
    const outH = Math.max(1, Math.round(bbox.h * scale));

    const trimmed = await sharp(SRC)
      .ensureAlpha()
      .extract({
        left: left + bbox.left,
        top: top + bbox.top,
        width: bbox.w,
        height: bbox.h,
      })
      .resize(outW, outH, { kernel: sharp.kernel.nearest })
      .png()
      .toBuffer();

    const xOff = Math.round((OUT_CELL - outW) / 2);
    const yOff = Math.round((OUT_CELL - outH) / 2);

    const dst = join(OUT_DIR, `door_${id}.png`);
    await sharp({
      create: { width: OUT_CELL, height: OUT_CELL, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .composite([{ input: trimmed, left: xOff, top: yOff }])
      .png()
      .toFile(dst);

    console.log(
      `  [OK]    cell (${row},${col}) → door_${id.padEnd(10)} ` +
      `(art ${bbox.w}×${bbox.h} → ${outW}×${outH})`
    );
    landed++;
  }
}

console.log('');
console.log(`Wrote ${landed}/8 door icons to ${OUT_DIR}.`);
console.log('');
console.log('In doorPortals.js, the existing _spriteKeyMap aliases also light up:');
console.log('  fusion / legendary  → door_mythic');
console.log('  challenge / miniboss / elite → door_boss');
console.log('  trove → door_chest');
console.log('');
console.log('Reload the game; sprites auto-replace the procedural fallbacks.');
