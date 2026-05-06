// Importer for PixelLab-generated theme symbol assets.
//
// Theme system has 5 themes (storm/flame/blood/vow/shadow). Each renders
// a small symbol on pedestals, doors, and the relic-choice modal —
// previously procedural in `_drawThemeGlyphAt` (pedestals.js, mirrored
// in relicChoiceModal.js + doorPortals.js).
//
// PixelLab format
// ----------------
// User generated each theme via PixelLab's Character tool, which exports
// a folder containing 8-direction rotations:
//
//   <theme-folder>/
//     metadata.json
//     states/
//       <prompt-derived>/
//         rotations/
//           south.png  south-east.png  east.png  ...  (8 total)
//
// For static theme symbols we only need ONE direction. We grab south.png
// (the canonical front-facing view per the project's PixelLab convention
// — see CLAUDE.md "north-first clockwise" note) and resize it onto a
// padded 64×64 cell so the in-game blit has predictable dimensions.
//
// Folder name → theme id mapping
// ------------------------------
// User folder names match natural English (fire / lightning / vow-shield)
// but the engine code uses the theme registry keys (flame / storm / vow).
// Map at import time so the output filenames match what the loader keys
// off (theme_flame.png, theme_storm.png, theme_vow.png).
//
//   imports/themes/blood        → public/assets/themes/theme_blood.png
//   imports/themes/fire         → public/assets/themes/theme_flame.png
//   imports/themes/lightning    → public/assets/themes/theme_storm.png
//   imports/themes/shadow       → public/assets/themes/theme_shadow.png
//   imports/themes/vow-shield   → public/assets/themes/theme_vow.png

import { readdir, mkdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = join(__dirname, 'imports', 'themes');
const OUT_DIR = join(__dirname, '..', '..', 'public', 'assets', 'themes');

// Folder name in imports/themes/ → engine theme id.
const FOLDER_TO_THEME = {
  'blood':       'blood',
  'fire':        'flame',
  'lightning':   'storm',
  'shadow':      'shadow',
  'vow-shield':  'vow',
};

// Output cell size. Pedestal renders at glyphR=22 (44px diameter), modal
// chip at ~30px, doors at ~16-24px. 64×64 source scales cleanly to all
// three with image-rendering: pixelated (the canvas-wide setting in
// main.js).
const OUT_CELL = 64;
const PAD = 4;     // transparent margin on each side

async function exists(path) {
  try { await stat(path); return true; } catch { return false; }
}

// PixelLab nests the rotations under a prompt-derived folder name we
// can't predict (e.g. "top-down_pixel_art_sprite_of"). Walk down two
// levels from <theme>/states/ to find the rotations directory.
async function findSouthPng(themeFolder) {
  const statesDir = join(themeFolder, 'states');
  if (!(await exists(statesDir))) return null;
  const promptDirs = await readdir(statesDir);
  for (const promptDir of promptDirs) {
    const candidate = join(statesDir, promptDir, 'rotations', 'south.png');
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

console.log(`→ importing theme symbols`);
console.log(`  source: ${SRC_DIR}`);
console.log(`  output: ${OUT_DIR}`);
console.log('');

let landed = 0;
const missing = [];

for (const [folderName, themeId] of Object.entries(FOLDER_TO_THEME)) {
  const themeFolder = join(SRC_DIR, folderName);
  if (!(await exists(themeFolder))) {
    console.log(`  [SKIP]  ${folderName.padEnd(14)} (folder missing)`);
    missing.push(folderName);
    continue;
  }
  const southPng = await findSouthPng(themeFolder);
  if (!southPng) {
    console.log(`  [SKIP]  ${folderName.padEnd(14)} (no states/.../rotations/south.png)`);
    missing.push(folderName);
    continue;
  }

  // Read the source, find the trim box, scale to fit a (CELL - 2*PAD)
  // long axis, center on a transparent CELL×CELL canvas.
  const meta = await sharp(southPng).metadata();
  const raw = await sharp(southPng).ensureAlpha().raw().toBuffer();
  const bbox = await trimBox(raw, meta.width, meta.height);
  if (!bbox) {
    console.log(`  [EMPTY] ${folderName.padEnd(14)} (south.png is fully transparent)`);
    missing.push(folderName);
    continue;
  }

  const targetMax = OUT_CELL - PAD * 2;
  const longAxis = Math.max(bbox.w, bbox.h);
  const scale = longAxis > targetMax ? targetMax / longAxis : (targetMax / longAxis);
  // For symbols smaller than the target we still upscale (nearest-neighbor)
  // to fill the cell — keeps pixel-art crisp at consistent in-game scale.
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

  const dst = join(OUT_DIR, `theme_${themeId}.png`);
  await sharp({
    create: { width: OUT_CELL, height: OUT_CELL, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: trimmed, left: xOff, top: yOff }])
    .png()
    .toFile(dst);

  console.log(
    `  [OK]    ${folderName.padEnd(14)} → theme_${themeId.padEnd(7)} ` +
    `(art ${bbox.w}×${bbox.h} → ${outW}×${outH}, centered in ${OUT_CELL}×${OUT_CELL})`
  );
  landed++;
}

console.log('');
console.log(`Wrote ${landed}/${Object.keys(FOLDER_TO_THEME).length} theme symbols to ${OUT_DIR}.`);
if (missing.length > 0) {
  console.log(`Missing: ${missing.join(', ')}`);
}
console.log('');
console.log('Next: Claude wires loader.js to register the new images,');
console.log('then replaces _drawThemeGlyphAt\'s procedural switch with');
console.log('ctx.drawImage blits (preserving the existing tint/halo wrapper).');
