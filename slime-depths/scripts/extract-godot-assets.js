// ============================================================================
// EXTRACT-GODOT-ASSETS — one-off preprocessing for the Godot vertical slice
//
// Pulls the cleanest assets out of slime-depths/public/assets/ into
// slime-depths-godot/assets/. For the hero's 8-direction sheets we extract
// just row 4 (south-facing) as horizontal strips so Godot's AnimatedSprite2D
// can consume them with no atlas-region math. Slime sheets are already
// single-direction strips — copied verbatim. Ruins composite is copied
// verbatim too.
//
// Usage:  node scripts/extract-godot-assets.js
// Run from inside slime-depths/. Writes to ../slime-depths-godot/assets/.
// ============================================================================

import { copyFile, mkdir } from 'node:fs/promises';
import sharp from 'sharp';

const SRC = 'public/assets';
const DST = '../slime-depths-godot/assets';
const SPR = 128;           // hero cell size
const SOUTH_ROW = 4;       // row 4 of the 8-direction sheet = south-facing

async function ensureDir(p) {
  await mkdir(p, { recursive: true });
}

// Extract row N from an 8-row grid sheet → horizontal strip.
async function extractHeroRow(srcFile, dstFile) {
  const meta = await sharp(srcFile).metadata();
  if (meta.height !== SPR * 8) {
    throw new Error(`${srcFile}: expected height=${SPR * 8} (8 rows), got ${meta.height}`);
  }
  const y = SOUTH_ROW * SPR;
  await sharp(srcFile)
    .extract({ left: 0, top: y, width: meta.width, height: SPR })
    .png()
    .toFile(dstFile);
  const frameCount = meta.width / SPR;
  console.log(`  ${srcFile.split('/').pop().padEnd(28)} → ${dstFile.split('/').pop()}  (${frameCount} frames, ${meta.width}x${SPR})`);
}

// Plain copy (used for slime + ruins assets).
async function copy(srcFile, dstFile) {
  await copyFile(srcFile, dstFile);
  console.log(`  ${srcFile.split('/').pop().padEnd(28)} → ${dstFile.split('/').pop()}  (copied)`);
}

(async () => {
  await ensureDir(`${DST}/characters`);
  await ensureDir(`${DST}/enemies`);
  await ensureDir(`${DST}/rooms`);

  console.log('--- Hero (extract south-row from 8-dir sheet) ---');
  await extractHeroRow(`${SRC}/characters/mage_idle.png`,   `${DST}/characters/mage_idle.png`);
  await extractHeroRow(`${SRC}/characters/mage_walk.png`,   `${DST}/characters/mage_walk.png`);
  await extractHeroRow(`${SRC}/characters/mage_attack.png`, `${DST}/characters/mage_attack.png`);

  console.log('--- Slime enemy (single-direction strip, copy verbatim) ---');
  await copy(`${SRC}/enemies/slime_idle.png`,   `${DST}/enemies/slime_idle.png`);
  await copy(`${SRC}/enemies/slime_walk.png`,   `${DST}/enemies/slime_walk.png`);
  await copy(`${SRC}/enemies/slime_death.png`,  `${DST}/enemies/slime_death.png`);

  console.log('--- Skeleton enemy (128×128 cells, ERW crypt pack — single-direction) ---');
  await copy(`${SRC}/enemies/skel_idle.png`,   `${DST}/enemies/skel_idle.png`);
  await copy(`${SRC}/enemies/skel_walk.png`,   `${DST}/enemies/skel_walk.png`);
  await copy(`${SRC}/enemies/skel_attack.png`, `${DST}/enemies/skel_attack.png`);
  await copy(`${SRC}/enemies/skel_death.png`,  `${DST}/enemies/skel_death.png`);

  // 2026-05-08 — ancient_ruins.png deliberately NOT copied. The slice
  // uses the pre-pack procedural dungeon look instead; see
  // scripts/extract-godot-procedural-floor.js.

  console.log('\n[done] assets prepared at slime-depths-godot/assets/');
})();
