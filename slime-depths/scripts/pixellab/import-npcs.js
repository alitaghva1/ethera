// Importer for the v2 hamlet NPC sprites — single south-facing idle PNGs
// generated via PixelLab Character Creator using mage_style_ref.png as the
// style anchor. See HAMLET_PLAN.md for the prompt template + workflow.
//
// Workflow:
//   1. User generates each NPC in PixelLab UI (Humanoid, 128px, Low Top-Down)
//      with the prompts in this session's chat history.
//   2. User downloads each export as a folder containing rotations/south.png
//      (PixelLab gives 8 directions; we only need south for hub NPCs).
//   3. User copies south.png from each export folder to:
//        scripts/pixellab/imports/npcs/<id>.png
//      where <id> is one of: keeper, smith, archivist, gravekeeper,
//      oracle, wanderer.
//   4. Run: node scripts/pixellab/import-npcs.js
//
// The script:
//   - Reads each <id>.png from imports/npcs/
//   - Re-encodes via sharp (strips metadata, ensures clean PNG)
//   - Writes to public/assets/hamlet/npc_v2_<id>.png
//   - Logs a summary
//
// Missing files are flagged but not fatal — you can drop NPCs incrementally.
// hamletScene.js's drawNpc falls back to the old hamlet_npcp_* sprites if
// a v2 file isn't available, so partial drops still render correctly.

import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = join(__dirname, 'imports', 'npcs');
const OUT_DIR = join(__dirname, '..', '..', 'public', 'assets', 'hamlet');

const NPCS = [
  { id: 'keeper',      role: 'central plaza merchant — last of his trade' },
  { id: 'smith',       role: 'top-right forge — gaunt smith with cracked hammer' },
  { id: 'archivist',   role: 'mid-left archive nook — hooded scholar bent over tome' },
  { id: 'gravekeeper', role: 'top-left graveyard — lantern-bearer for restless souls' },
  { id: 'oracle',      role: 'top-center altar — floating mystic with crystal staff' },
  { id: 'wanderer',    role: 'south-east tent — burdened traveler with backpack' },
];

async function exists(path) {
  try { await stat(path); return true; } catch { return false; }
}

await mkdir(OUT_DIR, { recursive: true });

console.log(`→ importing v2 hamlet NPCs`);
console.log(`  source: ${SRC_DIR}`);
console.log(`  output: ${OUT_DIR}`);
console.log();

let imported = 0;
let missing = 0;
for (const n of NPCS) {
  const srcPath = join(SRC_DIR, `${n.id}.png`);
  const dstPath = join(OUT_DIR, `npc_v2_${n.id}.png`);
  if (!(await exists(srcPath))) {
    console.log(`○ ${n.id.padEnd(14)} not found at ${srcPath} (${n.role})`);
    missing++;
    continue;
  }
  const srcBuf = await readFile(srcPath);
  const meta = await sharp(srcBuf).metadata();
  const outBuf = await sharp(srcBuf).png().toBuffer();
  await writeFile(dstPath, outBuf);
  console.log(`✓ npc_v2_${n.id.padEnd(14)} ${meta.width}×${meta.height} — ${n.role}`);
  imported++;
}

console.log();
console.log(`done — ${imported} imported, ${missing} missing`);
if (imported > 0) {
  console.log();
  console.log('next: ensure loader.js registers npc_v2_<id> for each, and');
  console.log('      hamletScene.drawNpc prefers them over hamlet_npcp_*.');
}
