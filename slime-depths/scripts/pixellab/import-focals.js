// Importer for PixelLab-generated room focal-piece PNGs.
//
// Workflow:
//   1. User generates 7 focal pieces in PixelLab → Objects tab. See
//      FOCAL_PLAN.md for prompts + the canonical 96×96 source size.
//   2. User drops PNGs into scripts/pixellab/imports/focals/ with these
//      exact filenames:
//
//         obelisk.png
//         brazier.png
//         crater.png
//         altar.png
//         tomb.png
//         glyph_circle.png
//         plinth.png
//
//   3. Run: node scripts/pixellab/import-focals.js
//
// The script:
//   - Reads each PNG, trims transparent margins so the piece is
//     centered, then composites onto a 64×64 RGBA cell with the
//     piece bottom-aligned (so vertical pieces like the obelisk
//     stand on the floor and don't visually float). The 64×64 cell
//     is slightly larger than the 48-px tile so tall pieces don't
//     clip against neighboring tiles.
//   - Writes to public/assets/props/focals/focal_<name>.png so the
//     loader can import them with predictable keys (focal_obelisk,
//     focal_brazier, etc.)
//   - Prints a summary
//   - Does NOT modify loader.js or roomComposition.js on its own —
//     after import, Claude wires the draw path to use the new
//     sprites (replacing the procedural _draw<Name> bodies).
//
// Missing focals are logged but not fatal — you can regenerate one
// at a time and re-run this script to pick them up incrementally.

import { readFile, mkdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = join(__dirname, 'imports', 'focals');
const OUT_DIR = join(__dirname, '..', '..', 'public', 'assets', 'props', 'focals');

// Canonical runtime cell. The TILE constant in src/room.js is 48 px,
// but vertical focal pieces (obelisk, plinth, tomb) need ~16 px of
// vertical headroom so the cap doesn't visually clip against the
// north-neighbor floor tile. 64×64 gives room without doubling the
// blit cost.
const CELL = 64;

// 4 px of padding from the bottom of the cell — the tile underneath
// extends to the cell's full height, so the piece's "feet" want to
// rest a few pixels above the absolute bottom edge to look like it's
// standing ON a tile, not OFF its bottom edge.
const FOOT_MARGIN = 4;

const FOCALS = [
  { src: 'obelisk.png',      dst: 'focal_obelisk.png',      role: 'combat focal — tall stone column with cyan rune' },
  { src: 'brazier.png',      dst: 'focal_brazier.png',      role: 'combat alt + challenge + focal-light source' },
  { src: 'crater.png',       dst: 'focal_crater.png',       role: 'elite focal — recessed glowing pit (FLAT — no vertical body)' },
  { src: 'altar.png',        dst: 'focal_altar.png',        role: 'sanctuary / reward focal — stepped slab with bowl' },
  { src: 'tomb.png',         dst: 'focal_tomb.png',         role: 'miniboss + boss focal — sarcophagus' },
  { src: 'glyph_circle.png', dst: 'focal_glyph_circle.png', role: 'event focal — flat rune ring + short monolith' },
  { src: 'plinth.png',       dst: 'focal_plinth.png',       role: 'reserved — slim pedestal (currently unused by FOCAL_RULES)' },
];

async function exists(path) {
  try { await stat(path); return true; } catch { return false; }
}

// Find the bounding box of non-transparent pixels in an RGBA buffer.
// PixelLab outputs include transparent margins around the actual art;
// we trim them so the piece sits centered in our 64×64 cell.
async function trimTransparentMargins(srcPath) {
  const img = sharp(srcPath);
  const meta = await img.metadata();
  const width = meta.width | 0;
  const height = meta.height | 0;
  const raw = await img.ensureAlpha().raw().toBuffer();
  // Walk the alpha channel for the tightest box around alpha > 8.
  // (Threshold 8 avoids picking up faint anti-alias halos PixelLab
  // sometimes leaves; the visible art is always alpha > 200.)
  let top = height, bottom = -1, left = width, right = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = raw[(y * width + x) * 4 + 3];
      if (a > 8) {
        if (y < top) top = y;
        if (y > bottom) bottom = y;
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
  }
  if (bottom < 0) {
    // Fully transparent input — skip.
    return null;
  }
  const w = right - left + 1;
  const h = bottom - top + 1;
  return { left, top, w, h, srcWidth: width, srcHeight: height };
}

await mkdir(OUT_DIR, { recursive: true });

console.log(`→ importing focal pieces`);
console.log(`  source: ${SRC_DIR}`);
console.log(`  output: ${OUT_DIR}`);
console.log(`  cell:   ${CELL}×${CELL} (${FOOT_MARGIN}px foot margin)`);
console.log('');

let landed = 0;
let missing = 0;
const summary = [];

for (const focal of FOCALS) {
  const srcPath = join(SRC_DIR, focal.src);
  const dstPath = join(OUT_DIR, focal.dst);

  if (!(await exists(srcPath))) {
    console.log(`  [SKIP]    ${focal.src.padEnd(20)} (not found — generate later)`);
    missing++;
    summary.push({ name: focal.dst, status: 'missing', role: focal.role });
    continue;
  }

  // Find the actual content bounding box.
  const bbox = await trimTransparentMargins(srcPath);
  if (!bbox) {
    console.log(`  [EMPTY]   ${focal.src.padEnd(20)} (fully transparent — re-export)`);
    summary.push({ name: focal.dst, status: 'empty', role: focal.role });
    continue;
  }

  // Extract trimmed art, then optionally scale down so the piece fits
  // comfortably within the cell. We scale to (CELL - 2*FOOT_MARGIN) on
  // the larger axis if needed.
  const maxDim = Math.max(bbox.w, bbox.h);
  const targetMax = CELL - FOOT_MARGIN * 2;
  let outW = bbox.w;
  let outH = bbox.h;
  if (maxDim > targetMax) {
    const scale = targetMax / maxDim;
    outW = Math.max(1, Math.round(bbox.w * scale));
    outH = Math.max(1, Math.round(bbox.h * scale));
  }

  // Trim then scale.
  const trimmed = await sharp(srcPath)
    .ensureAlpha()
    .extract({ left: bbox.left, top: bbox.top, width: bbox.w, height: bbox.h })
    .resize(outW, outH, { kernel: sharp.kernel.nearest })
    .png()
    .toBuffer();

  // Composite onto a 64×64 transparent cell, bottom-aligned with foot
  // margin. Vertical pieces (obelisk, tomb, plinth) end up standing on
  // the floor; flat pieces (crater, glyph_circle) end up centered
  // vertically since their natural bbox is short.
  const xOffset = Math.round((CELL - outW) / 2);
  // For flat pieces (height < 30% of cell), center vertically instead
  // of bottom-aligning — they read better in the middle of the cell.
  const isFlat = outH <= CELL * 0.30;
  const yOffset = isFlat
    ? Math.round((CELL - outH) / 2)
    : CELL - outH - FOOT_MARGIN;

  await sharp({
    create: {
      width: CELL,
      height: CELL,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: trimmed, left: xOffset, top: yOffset }])
    .png()
    .toFile(dstPath);

  console.log(
    `  [OK]      ${focal.src.padEnd(20)} → ${focal.dst.padEnd(26)} ` +
    `(art ${bbox.w}×${bbox.h}${maxDim > targetMax ? ` → ${outW}×${outH}` : ''}, ` +
    `${isFlat ? 'centered' : 'bottom-aligned'})`
  );
  landed++;
  summary.push({ name: focal.dst, status: 'imported', role: focal.role });
}

console.log('');
console.log(`Summary: ${landed} landed, ${missing} missing of ${FOCALS.length} focal pieces.`);
if (missing > 0) {
  console.log('');
  console.log('Missing pieces (not fatal — generate + re-run when ready):');
  for (const s of summary) {
    if (s.status !== 'imported') {
      console.log(`  - ${s.name.padEnd(28)} ${s.role}`);
    }
  }
}
console.log('');
console.log('Next: run lint+build, then ask Claude to wire the loader + replace');
console.log('the procedural _draw<Name> bodies in src/roomComposition.js with');
console.log('image blits (preserving the per-piece halo/flame/pulse animation).');
