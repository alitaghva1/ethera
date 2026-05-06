// Importer for the PixelLab-generated theme-symbol sheet.
//
// The theme system has 5 themes (storm/flame/blood/vow/shadow). Each
// renders a small symbol on pedestals, doors, and the relic-choice
// modal — currently drawn procedurally by `_drawThemeGlyphAt` in
// src/pedestals.js (mirrored in relicChoiceModal.js + doorPortals.js).
//
// Workflow:
//   1. User generates ONE PixelLab sheet (320×64 PNG, 5 cells × 64px
//      wide × 64px tall). Prompt is in the chat thread; not committed
//      to a separate plan file because it's just one prompt.
//   2. User drops the PNG at:
//        scripts/pixellab/imports/themes/sheet_themes.png
//   3. Run: node scripts/pixellab/import-themes.js
//
// The script:
//   - Slices the sheet into 5 cells in fixed left-to-right order:
//        storm | flame | blood | vow | shadow
//   - Trims transparent margins per cell (PixelLab leaves padding)
//   - Resizes the trimmed art to fit within a 64×64 canonical cell
//     with 4 px padding on each side, centered
//   - Writes individual PNGs to public/assets/themes/theme_<id>.png
//
// Re-run safe: re-runs overwrite the outputs cleanly. If you only
// regenerated the storm symbol, you can drop a new sheet (the other
// 4 cells just get re-imported identically).
//
// After import, Claude wires loader.js + replaces the procedural
// switch in _drawThemeGlyphAt with image blits — preserving the
// existing tint/halo wrapper so colors and pulse animation stay
// in code rather than baked into the sprite.

import { readFile, mkdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, 'imports', 'themes', 'sheet_themes.png');
const OUT_DIR = join(__dirname, '..', '..', 'public', 'assets', 'themes');

// Source sheet layout — 5 cells, 64 px each, horizontal.
const SHEET_W = 320;
const SHEET_H = 64;
const CELL = 64;
const ORDER = ['storm', 'flame', 'blood', 'vow', 'shadow'];

// Output canonical cell size — same as source. The procedural glyph
// renderer uses radius 22 (44 px diameter) on pedestals, ~16 on doors,
// ~30 in the modal chip; 64×64 sprites scale down cleanly to all
// three with image-rendering: pixelated.
const OUT_CELL = 64;
const PAD = 4;     // transparent margin around trimmed art

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
  console.error(`  Generate the sheet in PixelLab (320×64, 5 horizontal cells)`);
  console.error(`  and drop it at the path above. Prompt is in the chat thread.`);
  process.exit(1);
}

const meta = await sharp(SRC).metadata();
if (meta.width !== SHEET_W || meta.height !== SHEET_H) {
  console.warn(
    `⚠ Sheet is ${meta.width}×${meta.height}, expected ${SHEET_W}×${SHEET_H}. ` +
    `Continuing — will scale per-cell to fit, but tighter results come ` +
    `from the canonical 320×64.`
  );
}

await mkdir(OUT_DIR, { recursive: true });

console.log(`→ slicing theme symbol sheet`);
console.log(`  source: ${SRC}`);
console.log(`  output: ${OUT_DIR}`);
console.log('');

// Compute cell dims based on actual sheet size (in case the user gave
// us 640×128 or similar — we still split into 5 equal-width cells).
const cellW = Math.floor(meta.width / 5);
const cellH = meta.height;

for (let i = 0; i < 5; i++) {
  const id = ORDER[i];
  const cellLeft = i * cellW;

  // Extract the cell raw RGBA, find its trim box, then composite into
  // a 64×64 padded canvas centered.
  const cell = await sharp(SRC)
    .extract({ left: cellLeft, top: 0, width: cellW, height: cellH })
    .ensureAlpha()
    .raw()
    .toBuffer();
  const bbox = await trimBox(cell, cellW, cellH);
  if (!bbox) {
    console.warn(`  [EMPTY] cell ${i} (${id}) is fully transparent — re-export`);
    continue;
  }

  // Trim to bbox then scale to fit (OUT_CELL - 2*PAD) on the long axis.
  const targetMax = OUT_CELL - PAD * 2;
  const longAxis = Math.max(bbox.w, bbox.h);
  const scale = longAxis > targetMax ? targetMax / longAxis : 1;
  const outW = Math.max(1, Math.round(bbox.w * scale));
  const outH = Math.max(1, Math.round(bbox.h * scale));

  const trimmed = await sharp(SRC)
    .ensureAlpha()
    .extract({
      left: cellLeft + bbox.left,
      top: bbox.top,
      width: bbox.w,
      height: bbox.h,
    })
    .resize(outW, outH, { kernel: sharp.kernel.nearest })
    .png()
    .toBuffer();

  const xOff = Math.round((OUT_CELL - outW) / 2);
  const yOff = Math.round((OUT_CELL - outH) / 2);

  const dst = join(OUT_DIR, `theme_${id}.png`);
  await sharp({
    create: { width: OUT_CELL, height: OUT_CELL, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: trimmed, left: xOff, top: yOff }])
    .png()
    .toFile(dst);

  console.log(
    `  [OK]    theme_${id.padEnd(7)}  art ${bbox.w}×${bbox.h}` +
    `${scale < 1 ? ` → ${outW}×${outH}` : ''}, centered in ${OUT_CELL}×${OUT_CELL}`
  );
}

console.log('');
console.log(`Wrote 5 theme PNGs to ${OUT_DIR}.`);
console.log('Next: Claude wires loader.js to register theme_<id>, then');
console.log('replaces the switch in _drawThemeGlyphAt with image blits.');
