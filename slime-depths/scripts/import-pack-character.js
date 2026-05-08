// ============================================================================
// IMPORT-PACK-CHARACTER — unified importer for Epic RPG World pack characters
//
// Reads source sprite sheets from C:/Users/14164/Documents/Claude/Projects/Game X/
// and emits horizontal strips at public/assets/enemies/<prefix>_<state>.png
// in the format src/enemies.js expects:
//
//   • Each output sheet is a single row of N square frames of size
//     `cellSize × cellSize`. Frame 0 leftmost. Width = cellSize × N.
//   • Body bottom-aligned (anchor: 'bottom') with a small ground margin —
//     matches the existing crypt_spider / archer / brood layout.
//   • Source layouts can be either single horizontal strips OR multi-row
//     grids (e.g. Imp Demon's attack is a 4×4 grid). The manifest declares
//     `cols × rows` for each state file; frames are read in row-major order.
//
// Why a separate importer (vs the existing tools/ingest_enemy_pack.py):
//   • The Python tool only handles single-row strips. ERW's bigger
//     animations (rocky-dude, imp-demon attacks, mountain-boss death)
//     ship as multi-row grids.
//   • Source frames vary widely (96×96 bat → 351×207 mountain boss). A
//     manifest-driven flow lets us pick the right output cellSize per
//     character (small flyer → 64; standard humanoid → 96; boss → 128)
//     and forget about it.
//   • Source paths use Windows forward-slash absolute paths so sharp can
//     find them regardless of cwd / git-bash mount remapping.
//
// Usage:
//   node scripts/import-pack-character.js                     # imports all in MANIFEST
//   node scripts/import-pack-character.js stone_golem bat     # subset
//   node scripts/import-pack-character.js --list              # list manifest entries
// ============================================================================

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Source pack root — Windows forward-slash so sharp can resolve it from
// any cwd (git-bash mount paths like /c/Users/... break sharp).
const PACK_ROOT = 'C:/Users/14164/Documents/Claude/Projects/Game X';

// Output dir — game's enemy sprite folder.
const OUT_DIR = join(__dirname, '..', 'public', 'assets', 'enemies');

// ============================================================================
// MANIFEST — one entry per imported character.
//
// Each entry declares:
//   prefix          output filename prefix (foo_idle.png, foo_walk.png, …)
//   cellSize        output square cell size in pixels (must match def.cellSize
//                   in src/enemies.js — 64 for compact flyers, 96 for standard
//                   humanoids, 128 for bosses)
//   anchor          'bottom' for ground enemies, 'center' for flyers
//   bodyHeightFrac  fraction of the cell the body should fill vertically
//                   (default 0.92). Bosses with wide attack arcs (Mountain
//                   Boss hammer slam) want lower so the arc isn't cropped.
//   states          per-state config:
//     <state>: {
//       file:        absolute source path (use forward slashes)
//       cols:        grid columns
//       rows:        grid rows
//       frames:      total frame count (cols × rows might be larger; trailing
//                    empty cells are dropped)
//     }
//
// State names match what src/enemies.js looks for: idle, walk, attack,
// hurt, death, cast. (`hurt` is optional but if present, the renderer
// uses it on damage flinch.)
// ============================================================================

const MANIFEST = {
  // ──────────────────────────────────────────────────────────────────────
  // STONE GOLEM (Ruins boss — replaces orc Grudnok in Zone 1)
  // Source:  ERW - Ancient Ruins V 2.2.1
  // Layout:  Single horizontal strip, 224×192 frames. Cleanest pack —
  //          dimensions in filename, no grids, "v2" version is the
  //          polished art.
  // ──────────────────────────────────────────────────────────────────────
  stone_golem: {
    prefix: 'stone_golem',
    cellSize: 128,
    anchor: 'bottom',
    bodyHeightFrac: 0.92,
    states: {
      idle:   { file: `${PACK_ROOT}/ERW - Ancient Ruins V 2.2.1/ERW - Ancient Ruins V 2.2.1/Characters/Stone  Golem/Stone-golem v2-idle-224x192.png`,    cols: 8,  rows: 1, frames: 8 },
      walk:   { file: `${PACK_ROOT}/ERW - Ancient Ruins V 2.2.1/ERW - Ancient Ruins V 2.2.1/Characters/Stone  Golem/Stone-golem v2-run-224x192.png`,     cols: 8,  rows: 1, frames: 8 },
      attack: { file: `${PACK_ROOT}/ERW - Ancient Ruins V 2.2.1/ERW - Ancient Ruins V 2.2.1/Characters/Stone  Golem/Stone-golem v2-attack-224x192.png`,  cols: 17, rows: 1, frames: 17 },
      hurt:   { file: `${PACK_ROOT}/ERW - Ancient Ruins V 2.2.1/ERW - Ancient Ruins V 2.2.1/Characters/Stone  Golem/Stone-golem v2-hurt-224x192.png`,    cols: 12, rows: 1, frames: 12 },
      death:  { file: `${PACK_ROOT}/ERW - Ancient Ruins V 2.2.1/ERW - Ancient Ruins V 2.2.1/Characters/Stone  Golem/Stone-golem v2-death-224x192.png`,   cols: 13, rows: 1, frames: 13 },
    },
  },

  // ──────────────────────────────────────────────────────────────────────
  // MOUNTAIN BOSS (Mountain pack)
  // Source:  Epic RPG World - The dephs of the Mountain V1.5.1
  // Layout:  Wide single strips. Frame W = 351, H = 207. GCD trick:
  //            idle 2808 / 351 = 8     hurt   2808 / 351 = 8
  //            walk 3510 / 351 = 10    death  3510 / 351 = 10
  //            atk1 5616 / 351 = 16
  // bodyHeightFrac 0.70 — boss has wide hammer-arc attacks; leaves
  // horizontal headroom for the swing instead of cropping it.
  // ──────────────────────────────────────────────────────────────────────
  mountain_boss: {
    prefix: 'mountain_boss',
    cellSize: 128,
    anchor: 'bottom',
    bodyHeightFrac: 0.70,
    states: {
      idle:   { file: `${PACK_ROOT}/Epic RPG World - The dephs of the Mountain V1.5.1/Epic RPG World - The dephs of the Mountain V1.5.1/Characters/Boss/boss anims-idle.png`,  cols: 8,  rows: 1, frames: 8 },
      walk:   { file: `${PACK_ROOT}/Epic RPG World - The dephs of the Mountain V1.5.1/Epic RPG World - The dephs of the Mountain V1.5.1/Characters/Boss/boss anims-walk.png`,  cols: 10, rows: 1, frames: 10 },
      attack: { file: `${PACK_ROOT}/Epic RPG World - The dephs of the Mountain V1.5.1/Epic RPG World - The dephs of the Mountain V1.5.1/Characters/Boss/boss anims-atk1.png`,  cols: 16, rows: 1, frames: 16 },
      hurt:   { file: `${PACK_ROOT}/Epic RPG World - The dephs of the Mountain V1.5.1/Epic RPG World - The dephs of the Mountain V1.5.1/Characters/Boss/boss anims-hurt.png`,  cols: 8,  rows: 1, frames: 8 },
      death:  { file: `${PACK_ROOT}/Epic RPG World - The dephs of the Mountain V1.5.1/Epic RPG World - The dephs of the Mountain V1.5.1/Characters/Boss/boss anims-death.png`, cols: 10, rows: 1, frames: 10 },
    },
  },

  // ──────────────────────────────────────────────────────────────────────
  // BAT (Cemetery pack — flying enemy)
  // Source:  EPIC RPG World Pack - Cemetery V 1.6
  // Layout:  Per-state files at 96-tall single strips. 96×96 frames per
  //          filename hint (`Bat-all-animations-96x96-each-row...`).
  //          Probe shows individual state strips:
  //            Idle   768×96 (8 frames)
  //            walk   768×96 (8 frames)
  //            atk    1440×96 (15 frames — full attack cycle)
  //            hurt   864×96 (9 frames)
  //            death  1344×96 (14 frames)
  // anchor: 'center' — bats fly, no ground anchor.
  // cellSize: 64 — same as crypt_spider, the existing compact-enemy
  // precedent.
  // ──────────────────────────────────────────────────────────────────────
  bat: {
    prefix: 'cemetery_bat',
    cellSize: 64,
    anchor: 'center',
    bodyHeightFrac: 0.85,
    states: {
      idle:   { file: `${PACK_ROOT}/EPIC RPG World Pack - Cemetery V 1.6/EPIC RPG World Pack - Cemetery V 1.6/Characters/bat/Bat-Idle animation.png`,    cols: 8,  rows: 1, frames: 8 },
      walk:   { file: `${PACK_ROOT}/EPIC RPG World Pack - Cemetery V 1.6/EPIC RPG World Pack - Cemetery V 1.6/Characters/bat/Bat-walk animation.png`,    cols: 8,  rows: 1, frames: 8 },
      attack: { file: `${PACK_ROOT}/EPIC RPG World Pack - Cemetery V 1.6/EPIC RPG World Pack - Cemetery V 1.6/Characters/bat/Bat-atk animation.png`,     cols: 15, rows: 1, frames: 15 },
      hurt:   { file: `${PACK_ROOT}/EPIC RPG World Pack - Cemetery V 1.6/EPIC RPG World Pack - Cemetery V 1.6/Characters/bat/Bat-hurt animation.png`,    cols: 9,  rows: 1, frames: 9 },
      death:  { file: `${PACK_ROOT}/EPIC RPG World Pack - Cemetery V 1.6/EPIC RPG World Pack - Cemetery V 1.6/Characters/bat/Bat-death animation.png`,   cols: 14, rows: 1, frames: 14 },
    },
  },

  // ──────────────────────────────────────────────────────────────────────
  // IMP DEMON (Volcano pack — fast harasser)
  // Source:  Epic RPG World - Volcano V1.6.1
  // Layout:  Mixed strips + grids. Frame size 192×160 across all states.
  //            idle    1728×160  cols=9  rows=1  (filename: 9frames)
  //            walk    1152×160  cols=6  rows=1  (filename: 6frames)
  //            atk1     768×640  cols=4  rows=4  frames=13 (rest empty)
  //            hurt    1920×160  cols=10 rows=1  (filename: 10frames)
  //            death   1152×800  cols=6  rows=5  frames=29 (filename: 29frames)
  // ──────────────────────────────────────────────────────────────────────
  imp_demon: {
    prefix: 'imp_demon',
    cellSize: 96,
    anchor: 'bottom',
    bodyHeightFrac: 0.88,
    states: {
      idle:   { file: `${PACK_ROOT}/Epic RPG World - Volcano V1.6.1/Epic RPG World - Volcano V1.6/Characters/imp-like demon/no shadow/imp-idle_9frames.png`,    cols: 9,  rows: 1, frames: 9 },
      walk:   { file: `${PACK_ROOT}/Epic RPG World - Volcano V1.6.1/Epic RPG World - Volcano V1.6/Characters/imp-like demon/no shadow/imp-walk_6frames.png`,    cols: 6,  rows: 1, frames: 6 },
      attack: { file: `${PACK_ROOT}/Epic RPG World - Volcano V1.6.1/Epic RPG World - Volcano V1.6/Characters/imp-like demon/no shadow/imp-attack1_13frames.png`, cols: 4, rows: 4, frames: 13 },
      hurt:   { file: `${PACK_ROOT}/Epic RPG World - Volcano V1.6.1/Epic RPG World - Volcano V1.6/Characters/imp-like demon/no shadow/imp-hurt_10frames.png`,   cols: 10, rows: 1, frames: 10 },
      death:  { file: `${PACK_ROOT}/Epic RPG World - Volcano V1.6.1/Epic RPG World - Volcano V1.6/Characters/imp-like demon/no shadow/imp-death_29frames.png`,  cols: 6,  rows: 5, frames: 29 },
    },
  },

  // ──────────────────────────────────────────────────────────────────────
  // ROCKY DUDE (Volcano pack — heavy melee)
  // Source:  Epic RPG World - Volcano V1.6.1
  // Layout:  All grids. Frame counts in filename + 480-divisible widths
  //          let us derive layouts:
  //            idle1   480×480   cols=3  rows=3  frames=7  (W=160 H=160)
  //            walk     480×320  cols=3  rows=2  frames=6  (W=160 H=160)
  //            atk1     800×640  cols=5  rows=4  frames=19 (W=160 H=160)
  //            hurt     640×640  cols=5  rows=4  frames=17 (W=128 H=160)
  //            death    640×640  cols=4  rows=4  frames=14 (W=160 H=160)
  // ──────────────────────────────────────────────────────────────────────
  rocky_dude: {
    prefix: 'rocky_dude',
    cellSize: 96,
    anchor: 'bottom',
    bodyHeightFrac: 0.92,
    states: {
      idle:   { file: `${PACK_ROOT}/Epic RPG World - Volcano V1.6.1/Epic RPG World - Volcano V1.6/Characters/rocky dude/no shadow/rocky-dude_idle1_7frames.png`,  cols: 3, rows: 3, frames: 7 },
      walk:   { file: `${PACK_ROOT}/Epic RPG World - Volcano V1.6.1/Epic RPG World - Volcano V1.6/Characters/rocky dude/no shadow/rocky-dude_walk_6frames.png`,   cols: 3, rows: 2, frames: 6 },
      attack: { file: `${PACK_ROOT}/Epic RPG World - Volcano V1.6.1/Epic RPG World - Volcano V1.6/Characters/rocky dude/no shadow/rocky-dude_atk1_19frames.png`,  cols: 5, rows: 4, frames: 19 },
      hurt:   { file: `${PACK_ROOT}/Epic RPG World - Volcano V1.6.1/Epic RPG World - Volcano V1.6/Characters/rocky dude/no shadow/rocky-dude_hurt_17frames.png`,  cols: 5, rows: 4, frames: 17 },
      death:  { file: `${PACK_ROOT}/Epic RPG World - Volcano V1.6.1/Epic RPG World - Volcano V1.6/Characters/rocky dude/no shadow/rocky-dude_death_14frames.png`, cols: 4, rows: 4, frames: 14 },
    },
  },
};

// ── CLI ────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
if (argv.includes('--list')) {
  console.log('Available characters:');
  for (const [key, cfg] of Object.entries(MANIFEST)) {
    const states = Object.keys(cfg.states).join(', ');
    console.log(`  ${key.padEnd(16)} prefix=${cfg.prefix.padEnd(16)} cell=${cfg.cellSize}  states: ${states}`);
  }
  process.exit(0);
}
const targets = argv.length ? argv : Object.keys(MANIFEST);

// ── Per-state import: read sheet, slice frames, fit each into a cell,
// emit a horizontal strip ──────────────────────────────────────────────
async function importState(stateName, cfg, charCfg) {
  const { file, cols, rows, frames } = cfg;
  const { cellSize, anchor, bodyHeightFrac } = charCfg;

  // Load source. sharp.metadata gives us width/height; raw extraction
  // happens via .extract({ left, top, width, height }).
  const meta = await sharp(file).metadata();
  if (!meta.width || !meta.height) {
    throw new Error(`Source has no dimensions: ${file}`);
  }
  const frameW = Math.floor(meta.width / cols);
  const frameH = Math.floor(meta.height / rows);

  // Compose output: a sharp() blank canvas, composite each fitted frame.
  const outW = cellSize * frames;
  const outH = cellSize;
  const composites = [];

  for (let i = 0; i < frames; i++) {
    const c = i % cols;
    const r = Math.floor(i / cols);
    const sx = c * frameW;
    const sy = r * frameH;

    // Step 1: extract the source frame.
    const srcFrame = await sharp(file)
      .extract({ left: sx, top: sy, width: frameW, height: frameH })
      .toBuffer();

    // Step 2: trim transparent borders so resize isn't dominated by
    // empty padding (very common in ERW boss frames where the canvas
    // is sized for the widest attack pose, idle has lots of empty
    // space). Keeps body proportions consistent across states.
    let trimmedBuf, trimmedMeta;
    try {
      const trimmed = sharp(srcFrame).trim({ threshold: 1 });
      trimmedBuf = await trimmed.toBuffer();
      trimmedMeta = await sharp(trimmedBuf).metadata();
    } catch {
      // Fully-empty frame — skip the resize, leave a transparent cell.
      continue;
    }
    const tw = trimmedMeta.width || 1;
    const th = trimmedMeta.height || 1;

    // Step 3: scale so trimmed body fits within cell. Cap height at
    // bodyHeightFrac × cellSize so wide attack arcs don't crop, then
    // bound width by cellSize too. Whichever constraint binds, use it.
    const maxBodyH = cellSize * bodyHeightFrac;
    const scaleByH = maxBodyH / th;
    const scaleByW = cellSize / tw;
    const scale = Math.min(scaleByH, scaleByW);
    const newW = Math.max(1, Math.round(tw * scale));
    const newH = Math.max(1, Math.round(th * scale));

    // Step 4: nearest-neighbour for upscale (preserve pixel-art edges)
    // / lanczos for downscale (smoother). sharp picks based on
    // `kernel` setting.
    const resized = await sharp(trimmedBuf)
      .resize(newW, newH, {
        kernel: scale >= 1 ? 'nearest' : 'lanczos3',
        fit: 'fill',
      })
      .toBuffer();

    // Step 5: anchor inside the cell — bottom for ground enemies
    // (feet at cell bottom with a small ground margin), center for
    // flyers.
    const groundMargin = anchor === 'bottom' ? 2 : 0;
    const offsetX = i * cellSize + Math.floor((cellSize - newW) / 2);
    const offsetY =
      anchor === 'bottom'
        ? cellSize - newH - groundMargin
        : Math.floor((cellSize - newH) / 2);

    composites.push({ input: resized, left: offsetX, top: offsetY });
  }

  // Build the output sheet on a transparent background.
  await mkdir(OUT_DIR, { recursive: true });
  const outPath = join(OUT_DIR, `${charCfg.prefix}_${stateName}.png`);
  await sharp({
    create: {
      width: outW,
      height: outH,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(composites)
    .png()
    .toFile(outPath);

  console.log(`  ${stateName.padEnd(7)} ${frames} frames  ${outW}x${outH}  → ${outPath.split(/[\\/]/).slice(-2).join('/')}`);
}

// ── Main ───────────────────────────────────────────────────────────────
let ok = 0, fail = 0;
for (const key of targets) {
  const cfg = MANIFEST[key];
  if (!cfg) {
    console.log(`! unknown character "${key}" (use --list to see options)`);
    fail++;
    continue;
  }
  console.log(`\n--- ${key} (prefix=${cfg.prefix}, cell=${cfg.cellSize}, anchor=${cfg.anchor}) ---`);
  for (const [stateName, stateCfg] of Object.entries(cfg.states)) {
    try {
      await importState(stateName, stateCfg, cfg);
    } catch (e) {
      console.log(`  ! failed ${stateName}: ${e.message}`);
      fail++;
    }
  }
  ok++;
}
console.log(`\n[done] ${ok} characters imported, ${fail} failures`);
