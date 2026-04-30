// Smoke test for the animation pipeline. Takes ONE direction (south)
// of the user-built reference character and animates it walking.
// Single batched API call, ~1 credit. The output frames tell us whether
// animateWithText preserves the character's silhouette + palette well
// enough to commit to the full 40-call run (5 states × 8 directions).
//
// Usage:
//   node scripts/pixellab/animate-test.js
//   node scripts/pixellab/animate-test.js --dir east --action attack
//
// Output: scripts/pixellab/out/animtest/<dir>_<action>_f{0..N}.png
import { mkdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { Base64Image } from '@pixellab-code/pixellab';
import { getClient, saveBase64Png } from './client.js';
import { SEED, KNIGHT_PROMPTS } from './config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// CLI: simple --flag value parser
const args = new Map();
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith('--')) args.set(a.slice(2), process.argv[i + 1] || true);
}
const dir = args.get('dir') || 'south';
const action = args.get('action') || 'walk';
const nFrames = Number(args.get('frames') || 4);

// animateWithText is 64×64 only — accept the constraint for now. If the
// quality is good upscaled, we proceed. If not, we switch to
// animateWithSkeleton at 128 for production.
const SIZE = 64;

// PixelLab requires the reference image to match the requested output
// size. Our rotations are 92×92; resize on the fly with sharp (nearest
// neighbor to preserve pixel-art crunch).
const refPath = join(__dirname, 'rotations', `${dir}.png`);
const refPng = await readFile(refPath);
const resizedBuf = await sharp(refPng)
  .resize(SIZE, SIZE, { kernel: sharp.kernel.nearest })
  .png()
  .toBuffer();
const referenceImage = Base64Image.fromBuffer(resizedBuf, 'png');

const client = getClient();
console.log(`→ animate-with-text  dir=${dir} action=${action} frames=${nFrames} size=${SIZE}²`);

const t0 = Date.now();
const result = await client.animateWithText({
  description: KNIGHT_PROMPTS.moderate,
  action,
  view: 'low top-down',
  direction: dir,
  referenceImage,
  imageSize: { width: SIZE, height: SIZE },
  nFrames,
  seed: SEED,
});
const elapsedMs = Date.now() - t0;

const outDir = join(__dirname, 'out', 'animtest');
await mkdir(outDir, { recursive: true });
for (let i = 0; i < result.images.length; i++) {
  await saveBase64Png(result.images[i].base64, join(outDir, `${dir}_${action}_f${i}.png`));
}

console.log(`✓ ${result.images.length} frames saved to ${outDir}`);
console.log(`  cost: $${result.usage.usd.toFixed(4)}  (${elapsedMs} ms)`);
