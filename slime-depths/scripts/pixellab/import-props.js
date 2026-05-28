// Importer for PixelLab-generated hamlet prop PNGs (Path A of the
// hamlet rebuild — see HAMLET_PLAN.md).
//
// Workflow:
//   1. User generates 8 props in PixelLab Objects tab — see
//      HAMLET_PLAN.md for exact prompts + dimensions.
//   2. User drops PNGs into scripts/pixellab/imports/props/ with
//      these exact filenames:
//
//         forge.png         (forge hut)
//         dome.png          (archive dome)
//         tower.png         (descent watchtower, tall+narrow)
//         shrine.png        (watcher standing stone)
//         gate.png          (collapsed archway, east ruin)
//         bell.png          (fallen bronze bell)
//         scaffolding.png   (rebuild-zone wooden framework)
//         campfire.png      (plaza stone firepit)
//
//   3. Run: node scripts/pixellab/import-props.js
//
// The script:
//   - Copies each PNG to public/assets/props/hamlet/ with namespaced
//     filenames (hamlet_forge.png, etc.)
//   - Prints a summary so you can confirm all 8 landed
//   - Does NOT modify loader.js or hamletScene.js on its own — the
//     next step is Claude rewiring draw calls against the new assets
//     (easier to see in a code review that way)
//
// Missing props are logged but not fatal — you can regenerate props
// one at a time and re-run this script to pick them up incrementally.

import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = join(__dirname, 'imports', 'props');
const OUT_DIR = join(__dirname, '..', '..', 'public', 'assets', 'props', 'hamlet');

const PROPS = [
  { src: 'forge.png',       dst: 'hamlet_forge.png',       role: 'forge hut — south-west district' },
  { src: 'dome.png',        dst: 'hamlet_dome.png',        role: 'archive dome — east district' },
  { src: 'tower.png',       dst: 'hamlet_tower.png',       role: 'descent watchtower — center-back' },
  { src: 'shrine.png',      dst: 'hamlet_shrine.png',      role: 'watcher standing stone — north-west' },
  { src: 'gate.png',        dst: 'hamlet_gate.png',        role: 'collapsed archway — east ruin' },
  { src: 'bell.png',        dst: 'hamlet_bell.png',        role: 'fallen bronze bell — tower base' },
  { src: 'scaffolding.png', dst: 'hamlet_scaffolding.png', role: 'wooden rebuild framework' },
  { src: 'campfire.png',    dst: 'hamlet_campfire.png',    role: 'plaza stone firepit' },
];

async function exists(path) {
  try { await stat(path); return true; } catch { return false; }
}

await mkdir(OUT_DIR, { recursive: true });

console.log(`→ importing hamlet props`);
console.log(`  source: ${SRC_DIR}`);
console.log(`  output: ${OUT_DIR}`);
console.log();

let imported = 0;
let missing = 0;
for (const p of PROPS) {
  const srcPath = join(SRC_DIR, p.src);
  const dstPath = join(OUT_DIR, p.dst);
  if (!(await exists(srcPath))) {
    console.log(`○ ${p.src.padEnd(18)} not found (${p.role}) — regenerate + re-run`);
    missing++;
    continue;
  }
  // Pass through sharp — re-encodes cleanly + strips stray metadata.
  const srcBuf = await readFile(srcPath);
  const meta = await sharp(srcBuf).metadata();
  const outBuf = await sharp(srcBuf).png().toBuffer();
  await writeFile(dstPath, outBuf);
  console.log(`✓ ${p.dst.padEnd(22)} ${meta.width}×${meta.height} — ${p.role}`);
  imported++;
}

console.log();
console.log(`done — ${imported} imported, ${missing} missing`);
if (imported > 0) {
  console.log();
  console.log('next step: Claude wires these into hamletScene.js — they replace');
  console.log('the procedural draw calls for forge/dome/tower/shrine/etc.');
}
