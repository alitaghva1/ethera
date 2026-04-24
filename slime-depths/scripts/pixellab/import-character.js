// Importer for PixelLab Character Creator exports.
//
// Reads an unzipped character export (our imports/<name>/ folder) with
// the PixelLab-native layout:
//
//   <char>/rotations/{south,south-east,east,...}.png          (idle facing per direction)
//   <char>/animations/<anim_name>-<hash>/<direction>/frame_NNN.png
//   <char>/metadata.json
//
// …and produces our in-game grid sheets at
//   slime-depths/public/assets/characters/<class>_{idle,walk,attack,hurt,death}.png
//
// Sheet layout (same as the earlier generate/assemble pipeline):
//   rows = 8 directions in OUR north-first clockwise order:
//          north, north-east, east, south-east, south, south-west, west, north-west
//   cols = N animation frames
//   cell = TARGET_CELL px square (default 128, matches hero.js SPR)
//
// PixelLab's export uses SOUTH-first clockwise; we remap to north-first
// at import time so downstream game code is unchanged.
//
// Usage:
//   node scripts/pixellab/import-character.js --char mage --class mage
//   node scripts/pixellab/import-character.js --char mage --class knight   (overwrite knight)
//
// The --class flag controls the OUTPUT filename prefix. The fastest way
// to see the new character live is to import --class knight (overwrites
// existing knight_*.png sheets) so hero.js / loader.js don't need
// changes. Proper multi-class routing lands in a later session.

import { readdir, readFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));

// CLI
const args = new Map();
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i].startsWith('--')) args.set(process.argv[i].slice(2), process.argv[i + 1] || true);
}
const charName = args.get('char') || 'mage';
const classOut = args.get('class') || charName;
const TARGET_CELL = Number(args.get('cell') || 128);

const SRC_ROOT = join(__dirname, 'imports', charName);
const OUT_DIR = join(__dirname, '..', '..', 'public', 'assets', 'characters');

// OUR in-game direction order (north-first clockwise). Output rows
// follow this order; PixelLab's folder names are remapped to match.
const DIRECTIONS_OUT = [
  'north',
  'north-east',
  'east',
  'south-east',
  'south',
  'south-west',
  'west',
  'north-west',
];

// Map our state names → the PixelLab animation folder prefix. The
// exporter names folders after the action text you typed + a short
// hash suffix, so we match by prefix. If you named your animations
// differently, edit this table.
const STATE_MAP = {
  idle:   { prefix: 'Fight_Stance_Idle', notes: 'Using fight-stance idle (ready pose)' },
  walk:   { prefix: 'Running',           notes: '' },
  attack: { prefix: 'both_hands_thrust', notes: 'Arcane blast cast' },
  hurt:   { prefix: 'Taking_Punch',      notes: '' },
  death:  { prefix: 'mage_collapsing',   notes: '' },
};

async function findAnimFolder(prefix) {
  const entries = await readdir(join(SRC_ROOT, 'animations'));
  const match = entries.find((e) => e.startsWith(prefix));
  if (!match) throw new Error(`No animation folder matching prefix "${prefix}" in ${SRC_ROOT}/animations`);
  return match;
}

// PixelLab-native frames have significant transparent padding around the
// character (headroom for arms extending up during attack/cast). A straight
// resize leaves the body centered in the cell, which makes the hero
// appear to FLOAT above its ground shadow in-game. To fix: trim each
// frame to actual pixel bounds, scale by a CANONICAL scale factor
// (computed once from rotations/south.png), then bottom-align in the
// target cell. Feet land at cell-bottom across every frame/direction.

let _canonicalScale = null;
async function getCanonicalScale() {
  if (_canonicalScale !== null) return _canonicalScale;
  const refBuf = await readFile(join(SRC_ROOT, 'rotations', 'south.png'));
  const trimmed = await sharp(refBuf).trim({ threshold: 1 }).toBuffer();
  const meta = await sharp(trimmed).metadata();
  // Scale so canonical body height fills ~92% of cell (8% breathing room)
  _canonicalScale = (TARGET_CELL * 0.92) / meta.height;
  return _canonicalScale;
}

async function resizeToCell(srcBuf) {
  const scale = await getCanonicalScale();
  const trimmed = await sharp(srcBuf).trim({ threshold: 1 }).toBuffer();
  const meta = await sharp(trimmed).metadata();
  const newW = Math.max(1, Math.round(meta.width * scale));
  const newH = Math.max(1, Math.round(meta.height * scale));
  let scaledBuf = await sharp(trimmed)
    .resize(newW, newH, { kernel: sharp.kernel.nearest })
    .toBuffer();

  // If the scaled frame EXCEEDS the cell in either dimension (e.g. attack
  // poses with arms or spell VFX extending outward), center-crop to fit.
  // Width: center-crop horizontally. Height: bottom-aligned crop (preserve
  // the feet, sacrifice headroom — an overflowing pointed hood is fine).
  let finalW = newW, finalH = newH;
  if (newW > TARGET_CELL || newH > TARGET_CELL) {
    const cropW = Math.min(newW, TARGET_CELL);
    const cropH = Math.min(newH, TARGET_CELL);
    const cropL = Math.max(0, Math.floor((newW - TARGET_CELL) / 2));
    const cropT = Math.max(0, newH - TARGET_CELL);    // preserve bottom
    scaledBuf = await sharp(scaledBuf)
      .extract({ left: cropL, top: cropT, width: cropW, height: cropH })
      .toBuffer();
    finalW = cropW; finalH = cropH;
  }

  // Horizontal: center. Vertical: bottom-align with 4px ground margin.
  const left = Math.max(0, Math.floor((TARGET_CELL - finalW) / 2));
  const top = Math.max(0, TARGET_CELL - finalH - 4);
  return sharp({
    create: {
      width: TARGET_CELL,
      height: TARGET_CELL,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: scaledBuf, left, top }])
    .png()
    .toBuffer();
}

async function assembleSheet(stateName, prefix) {
  const animFolder = await findAnimFolder(prefix);
  const animPath = join(SRC_ROOT, 'animations', animFolder);
  // Frame count = number of files in any direction (every direction
  // has the same count per a PixelLab export).
  const southFrames = (await readdir(join(animPath, 'south')))
    .filter((f) => f.startsWith('frame_') && f.endsWith('.png'))
    .sort();
  const cols = southFrames.length;
  const rows = DIRECTIONS_OUT.length;

  const composite = [];
  for (let r = 0; r < rows; r++) {
    const dir = DIRECTIONS_OUT[r];
    for (let c = 0; c < cols; c++) {
      const frameName = `frame_${String(c).padStart(3, '0')}.png`;
      const srcPath = join(animPath, dir, frameName);
      const srcBuf = await readFile(srcPath);
      const resized = await resizeToCell(srcBuf);
      composite.push({ input: resized, left: c * TARGET_CELL, top: r * TARGET_CELL });
    }
  }

  const outPath = join(OUT_DIR, `${classOut}_${stateName}.png`);
  await mkdir(OUT_DIR, { recursive: true });
  await sharp({
    create: {
      width: cols * TARGET_CELL,
      height: rows * TARGET_CELL,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(composite)
    .png()
    .toFile(outPath);
  return { outPath, cols, rows };
}

console.log(`→ importing PixelLab character "${charName}" as class "${classOut}" (cell=${TARGET_CELL}²)`);
console.log(`  source: ${SRC_ROOT}`);
console.log(`  output: ${OUT_DIR}/${classOut}_*.png`);
console.log();

const summary = [];
for (const [state, { prefix, notes }] of Object.entries(STATE_MAP)) {
  try {
    const { outPath, cols, rows } = await assembleSheet(state, prefix);
    const label = `${classOut}_${state}.png`;
    console.log(`✓ ${label.padEnd(22)} ${cols} frames × ${rows} dirs   ${notes}`);
    summary.push({ state, cols, rows, outPath });
  } catch (e) {
    console.error(`✗ ${state}: ${e.message}`);
  }
}

console.log();
console.log(`done — ${summary.length}/${Object.keys(STATE_MAP).length} sheets written`);
