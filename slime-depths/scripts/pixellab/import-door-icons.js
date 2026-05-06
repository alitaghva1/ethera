// Importer for PixelLab-generated door medallion icons.
//
// Door medallions show a small icon describing what's beyond each door:
//   combat / fusion / mythic / legendary / boss / altar / shop /
//   sanctuary / event / challenge / chest / trove
//
// (The 5 theme icons — storm/flame/blood/vow/shadow — are imported
//  separately by import-themes.js.)
//
// Workflow mirrors import-themes.js exactly:
//   1. User generates each icon as a PixelLab Character (8-direction
//      export). Only the south rotation is used at runtime.
//   2. User drops each Character folder into:
//        scripts/pixellab/imports/door-icons/<icon-name>/
//      e.g. scripts/pixellab/imports/door-icons/combat/
//   3. Run: node scripts/pixellab/import-door-icons.js
//
// The importer:
//   - Walks each folder and finds states/<prompt>/rotations/south.png
//   - Trims transparent margins, resizes onto a padded 64×64 cell
//   - Writes public/assets/door_icons/door_<id>.png
//
// Missing icons are non-fatal — partial drop + re-run is supported.
// The runtime drawDoorIcon() helper in doorPortals.js falls back to
// the procedural shape for any iconKind without a loaded sprite, so
// the game keeps working at every step.

import { readdir, mkdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = join(__dirname, 'imports', 'door-icons');
const OUT_DIR = join(__dirname, '..', '..', 'public', 'assets', 'door_icons');

// Folder name in imports/door-icons/ → engine key. boss/miniboss/elite
// optionally share a single 'boss' sprite (the procedural code already
// uses the same skull silhouette for all three); generate boss alone
// and the importer will copy it to all three keys.
const FOLDER_TO_KEYS = {
  'combat':       ['door_combat'],
  'fusion':       ['door_fusion'],
  'mythic':       ['door_mythic'],     // 6-point sun-star
  'legendary':    ['door_legendary'],  // 4-point star
  'boss':         ['door_boss', 'door_miniboss', 'door_elite'],
  'altar':        ['door_altar'],
  'shop':         ['door_shop'],
  'sanctuary':    ['door_sanctuary'],
  'event':        ['door_event'],
  'challenge':    ['door_challenge'],
  'chest':        ['door_chest'],
  'trove':        ['door_trove'],
};

const OUT_CELL = 64;
const PAD = 4;

async function exists(path) {
  try { await stat(path); return true; } catch { return false; }
}

async function findSouthPng(folder) {
  const states = join(folder, 'states');
  if (!(await exists(states))) return null;
  const promptDirs = await readdir(states);
  for (const p of promptDirs) {
    const candidate = join(states, p, 'rotations', 'south.png');
    if (await exists(candidate)) return candidate;
  }
  return null;
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

await mkdir(OUT_DIR, { recursive: true });

console.log(`→ importing door medallion icons`);
console.log(`  source: ${SRC_DIR}`);
console.log(`  output: ${OUT_DIR}`);
console.log('');

let landed = 0;
const missing = [];

for (const [folderName, keys] of Object.entries(FOLDER_TO_KEYS)) {
  const folder = join(SRC_DIR, folderName);
  if (!(await exists(folder))) {
    console.log(`  [SKIP]  ${folderName.padEnd(11)} (folder missing)`);
    missing.push(folderName);
    continue;
  }
  const southPng = await findSouthPng(folder);
  if (!southPng) {
    console.log(`  [SKIP]  ${folderName.padEnd(11)} (no states/.../rotations/south.png)`);
    missing.push(folderName);
    continue;
  }

  const meta = await sharp(southPng).metadata();
  const raw = await sharp(southPng).ensureAlpha().raw().toBuffer();
  const bbox = await trimBox(raw, meta.width, meta.height);
  if (!bbox) {
    console.log(`  [EMPTY] ${folderName.padEnd(11)} (south.png is fully transparent)`);
    missing.push(folderName);
    continue;
  }

  const targetMax = OUT_CELL - PAD * 2;
  const longAxis = Math.max(bbox.w, bbox.h);
  const scale = targetMax / longAxis;
  const outW = Math.max(1, Math.round(bbox.w * scale));
  const outH = Math.max(1, Math.round(bbox.h * scale));

  const trimmed = await sharp(southPng)
    .ensureAlpha()
    .extract({ left: bbox.left, top: bbox.top, width: bbox.w, height: bbox.h })
    .resize(outW, outH, { kernel: sharp.kernel.nearest })
    .png()
    .toBuffer();

  const xOff = Math.round((OUT_CELL - outW) / 2);
  const yOff = Math.round((OUT_CELL - outH) / 2);

  // Compose the canonical 64×64 cell once.
  const composed = await sharp({
    create: { width: OUT_CELL, height: OUT_CELL, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: trimmed, left: xOff, top: yOff }])
    .png()
    .toBuffer();

  // Write to each output key (boss writes to door_boss + door_miniboss + door_elite).
  for (const key of keys) {
    const dst = join(OUT_DIR, `${key}.png`);
    await sharp(composed).toFile(dst);
  }

  console.log(
    `  [OK]    ${folderName.padEnd(11)} → ${keys.join(' + ').padEnd(36)} ` +
    `(art ${bbox.w}×${bbox.h} → ${outW}×${outH}, centered in ${OUT_CELL}×${OUT_CELL})`
  );
  landed++;
}

console.log('');
console.log(`Wrote ${landed}/${Object.keys(FOLDER_TO_KEYS).length} door icons to ${OUT_DIR}.`);
if (missing.length > 0) {
  console.log(`Missing: ${missing.join(', ')} — drop folders + re-run when ready.`);
}
console.log('');
console.log('Loader auto-loads door_*.png on next reload. Procedural fallback');
console.log('keeps the game playable for any icon you haven\'t generated yet.');
