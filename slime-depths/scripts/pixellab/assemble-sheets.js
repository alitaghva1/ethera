// Knight sprite-sheet assembler. Stitches the per-frame PNGs in
// scripts/pixellab/out/knight/<state>/<dir>/f{i}.png into 5 grid sheets
// under public/assets/characters/knight_<state>.png.
//
// ── Output grid layout ─────────────────────────────────────────────────
// Every sheet is a 2D grid of 128×128 cells. The grid is indexed by
// (row, col) where:
//
//   row = direction  (0..7, top to bottom)
//   col = frame idx  (0..N-1, left to right, N = frames for that state)
//
// Row index → direction mapping (IMPORTANT — consumer game code must
// match this order, NOT alphabetical):
//
//   row 0 : north
//   row 1 : north-east
//   row 2 : east
//   row 3 : south-east
//   row 4 : south
//   row 5 : south-west
//   row 6 : west
//   row 7 : north-west
//
// To sample a frame in-game, derive pixel offsets from (dirIdx, frameIdx):
//
//   const CELL = 128;
//   const srcX = frameIdx * CELL;
//   const srcY = dirIdx   * CELL;
//   ctx.drawImage(sheet, srcX, srcY, CELL, CELL, destX, destY, CELL, CELL);
//
// Sheet dimensions per state:
//
//   knight_idle.png   :  6 × 128 wide  = 768  × 1024
//   knight_walk.png   :  8 × 128 wide  = 1024 × 1024
//   knight_attack.png :  7 × 128 wide  = 896  × 1024
//   knight_hurt.png   :  4 × 128 wide  = 512  × 1024
//   knight_death.png  :  4 × 128 wide  = 512  × 1024
//
// Backgrounds are transparent (RGBA). Missing per-frame inputs are
// tolerated — the corresponding cell is left transparent and the tail
// summary reports which (state, dir) combos are incomplete.
//
// ── Usage ──────────────────────────────────────────────────────────────
//   node scripts/pixellab/assemble-sheets.js                  # all 5 sheets
//   node scripts/pixellab/assemble-sheets.js --state walk     # one state
//   node scripts/pixellab/assemble-sheets.js --dir south      # one row
//   node scripts/pixellab/assemble-sheets.js --state walk --dir south
//
// Idempotent: each run overwrites the output PNGs with a fresh assembly.

import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));

const STATES = [
  { name: 'idle', frames: 6 },
  { name: 'walk', frames: 8 },
  { name: 'attack', frames: 7 },
  { name: 'hurt', frames: 4 },
  { name: 'death', frames: 4 },
];

const DIRECTIONS = [
  'north',
  'north-east',
  'east',
  'south-east',
  'south',
  'south-west',
  'west',
  'north-west',
];

const CELL = 128;

const IN_ROOT = join(__dirname, 'out', 'knight');
const OUT_DIR = join(__dirname, '..', '..', 'public', 'assets', 'characters');

// ── CLI parsing ────────────────────────────────────────────────────────
const args = new Map();
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith('--')) {
    const key = a.slice(2);
    const val = process.argv[i + 1];
    if (val && !val.startsWith('--')) {
      args.set(key, val);
      i++;
    } else {
      args.set(key, true);
    }
  }
}
const onlyState = typeof args.get('state') === 'string' ? args.get('state') : null;
const onlyDir = typeof args.get('dir') === 'string' ? args.get('dir') : null;

if (onlyState && !STATES.some((s) => s.name === onlyState)) {
  console.error(`unknown --state '${onlyState}' (valid: ${STATES.map((s) => s.name).join(', ')})`);
  process.exit(1);
}
if (onlyDir && !DIRECTIONS.includes(onlyDir)) {
  console.error(`unknown --dir '${onlyDir}' (valid: ${DIRECTIONS.join(', ')})`);
  process.exit(1);
}

const targetStates = onlyState ? STATES.filter((s) => s.name === onlyState) : STATES;

async function fileExists(path) {
  try {
    await access(path, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

// Build a single sheet and write it to disk.
// Returns a per-direction completeness map: { [dir]: { have, total } }.
async function assembleSheet({ name, frames }) {
  const width = frames * CELL;
  const height = DIRECTIONS.length * CELL;

  console.log(`\n→ assembling knight_${name}.png  (${frames} frames × ${DIRECTIONS.length} dirs)`);

  const completeness = Object.fromEntries(
    DIRECTIONS.map((d) => [d, { have: 0, total: frames }]),
  );
  const composites = [];

  for (let r = 0; r < DIRECTIONS.length; r++) {
    const dir = DIRECTIONS[r];

    // When --dir is active, skip other rows entirely. Their cells stay
    // transparent in this run's output. (The sheet is always written
    // full-height so in-game row indexing stays stable.)
    if (onlyDir && dir !== onlyDir) continue;

    for (let c = 0; c < frames; c++) {
      const srcPath = join(IN_ROOT, name, dir, `f${c}.png`);
      if (!(await fileExists(srcPath))) {
        console.warn(`  ! missing ${name}/${dir}/f${c}.png — leaving cell transparent`);
        continue;
      }
      try {
        const buf = await readFile(srcPath);
        composites.push({
          input: buf,
          left: c * CELL,
          top: r * CELL,
        });
        completeness[dir].have++;
      } catch (err) {
        console.warn(`  ! failed to read ${name}/${dir}/f${c}.png: ${err.message}`);
      }
    }
  }

  const canvas = sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  });

  const outPath = join(OUT_DIR, `knight_${name}.png`);
  await canvas.composite(composites).png().toFile(outPath);

  // Per-sheet complete/incomplete summary line.
  const dirsToReport = onlyDir ? [onlyDir] : DIRECTIONS;
  const incomplete = dirsToReport.filter((d) => completeness[d].have < completeness[d].total);
  if (incomplete.length === 0) {
    console.log(`  all combos complete`);
  } else {
    for (const d of incomplete) {
      const { have, total } = completeness[d];
      console.log(`  ${name}: ${have}/${total} complete for ${d}`);
    }
  }
  console.log(`✓ wrote slime-depths/public/assets/characters/knight_${name}.png  (${width}×${height})`);

  return { state: name, frames, completeness };
}

await mkdir(OUT_DIR, { recursive: true });

const results = [];
for (const state of targetStates) {
  results.push(await assembleSheet(state));
}

// ── Final tail summary ────────────────────────────────────────────────
console.log('\n── summary ──');
for (const { state, frames, completeness } of results) {
  const dirsToReport = onlyDir ? [onlyDir] : DIRECTIONS;
  const complete = dirsToReport.filter((d) => completeness[d].have === frames);
  const partial = dirsToReport.filter(
    (d) => completeness[d].have > 0 && completeness[d].have < frames,
  );
  const empty = dirsToReport.filter((d) => completeness[d].have === 0);

  if (partial.length === 0 && empty.length === 0) {
    console.log(`${state}: ${frames}/${frames} complete per dir (all ${dirsToReport.length} dirs)`);
  } else {
    console.log(`${state}:`);
    console.log(`  complete (${complete.length}/${dirsToReport.length}): ${complete.join(', ') || '—'}`);
    if (partial.length) {
      for (const d of partial) {
        console.log(`  partial: ${completeness[d].have}/${frames} for ${d}`);
      }
    }
    if (empty.length) {
      console.log(`  empty: ${empty.join(', ')}`);
    }
  }
}
