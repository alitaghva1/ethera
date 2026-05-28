// Importer for PixelLab Animated Object exports — stitches per-frame PNGs
// into a single horizontal sprite sheet that the in-game FX renderer can
// frame-cycle through.
//
// PixelLab exports an animated object as:
//   <ExportFolder>/
//     metadata.json
//     rotations/<dir>.png             (single-frame state — unused here)
//     animations/<full-prompt-name>/<dir>/frame_000.png
//                                         frame_001.png
//                                         ...
//                                         frame_NNN.png
//
// Where <dir> is "south" / "north" / etc. for multi-direction objects, or
// just "unknown" for 1-direction objects. We assume top-down 1-direction
// for hamlet FX (flames, portal, etc.).
//
// Workflow:
//   1. Drop the PixelLab export folder into Project - Ethera/
//      (the project root, not into the worktree — same as how character
//       and NPC exports were dropped)
//   2. Run: node scripts/pixellab/import-fx.js <id> <ExportFolderName>
//      Examples:
//        node scripts/pixellab/import-fx.js firepit Animated_firepit
//        node scripts/pixellab/import-fx.js portal Animated_portal
//   3. The script stitches all frames horizontally into a single sheet at:
//      public/assets/hamlet/fx_<id>.png
//   4. Print: dimensions + frame count for the loader registration step.

import { readFile, writeFile, readdir, mkdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..', '..', '..', '..', '..');     // project parent containing the worktree
const OUT_DIR = join(__dirname, '..', '..', 'public', 'assets', 'hamlet');

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('Usage: node import-fx.js <id> <ExportFolderName>');
  console.error('Example: node import-fx.js firepit Animated_firepit');
  process.exit(1);
}
const [id, folderName] = args;

const exportPath = join(PROJECT_ROOT, folderName);
const animationsDir = join(exportPath, 'animations');

await mkdir(OUT_DIR, { recursive: true });

console.log(`→ importing FX animation`);
console.log(`  id:     ${id}`);
console.log(`  source: ${exportPath}`);
console.log(`  output: ${join(OUT_DIR, `fx_${id}.png`)}`);

// Find the animation subfolder (PixelLab names it after the prompt)
let animSubfolders;
try {
  animSubfolders = await readdir(animationsDir);
} catch {
  console.error(`Error: animations folder not found at ${animationsDir}`);
  console.error('Is the export folder structure correct?');
  process.exit(1);
}
if (animSubfolders.length === 0) {
  console.error('Error: no animation folders found in animations/');
  process.exit(1);
}
// Use the first animation subfolder (PixelLab supports multiple animations
// per object; for hamlet FX we just want the first one)
const animName = animSubfolders[0];
const dirsPath = join(animationsDir, animName);
const dirs = await readdir(dirsPath);
const dirName = dirs[0];     // typically 'unknown' for 1-direction
const framesPath = join(dirsPath, dirName);
const frameFiles = (await readdir(framesPath))
  .filter(f => f.startsWith('frame_') && f.endsWith('.png'))
  .sort();

if (frameFiles.length === 0) {
  console.error(`Error: no frame_*.png files found in ${framesPath}`);
  process.exit(1);
}

// Read first frame to get dimensions
const firstFrame = sharp(await readFile(join(framesPath, frameFiles[0])));
const meta = await firstFrame.metadata();
const frameW = meta.width;
const frameH = meta.height;
const frameCount = frameFiles.length;

console.log(`  frames: ${frameCount} × ${frameW}×${frameH}`);

// Build the sheet by compositing each frame at x = i * frameW
const sheetW = frameW * frameCount;
const sheetH = frameH;
const composites = [];
for (let i = 0; i < frameCount; i++) {
  const buf = await readFile(join(framesPath, frameFiles[i]));
  composites.push({ input: buf, left: i * frameW, top: 0 });
}
const sheetBuf = await sharp({
  create: { width: sheetW, height: sheetH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
}).composite(composites).png().toBuffer();

await writeFile(join(OUT_DIR, `fx_${id}.png`), sheetBuf);

console.log(`✓ wrote fx_${id}.png — ${sheetW}×${sheetH} (${frameCount} frames horizontally)`);
console.log();
console.log('next: register in loader.js as');
console.log(`  loadImage('fx_${id}',  'assets/hamlet/fx_${id}.png'),`);
console.log(`and configure FX overlay in hamletScene.js with frameCount=${frameCount}, frameW=${frameW}, frameH=${frameH}.`);
