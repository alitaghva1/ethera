// Skeleton-animate smoke test at 128×128. Goal: confirm animateWithSkeleton
// produces sharper output than the 64×64 animateWithText result.
//
// Flow:
//   1. Pad south.png (92×92) to 128×128 with transparent border
//   2. estimateSkeleton — get rest-pose keypoints
//   3. Author 4 walk-cycle keyframes by offsetting leg keypoints
//   4. animateWithSkeleton — batched call, one image per keyframe
//   5. Save 4 PNG frames
//
// Usage:
//   node scripts/pixellab/animate-skeleton-test.js
//
// Output: scripts/pixellab/out/animtest/sk_south_walk_f{0..3}.png
//         scripts/pixellab/out/animtest/sk_south_walk.keypoints.json

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { Base64Image } from '@pixellab-code/pixellab';
import { getClient, saveBase64Png } from './client.js';
import { SEED } from './config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SIZE = 128;

// ── 1. PAD reference 92→128 (center, transparent border) ──────────────
const refPath = join(__dirname, 'rotations', 'south.png');
const src = await readFile(refPath);
const paddedBuf = await sharp(src)
  .resize(SIZE, SIZE, {
    fit: 'contain',
    background: { r: 0, g: 0, b: 0, alpha: 0 },
    kernel: sharp.kernel.nearest,
  })
  .png()
  .toBuffer();
const referenceImage = Base64Image.fromBuffer(paddedBuf, 'png');
console.log(`→ padded south.png 92→${SIZE}²`);

const client = getClient();

// ── 2. estimateSkeleton — rest-pose rig ──────────────────────────────
console.log('→ estimate-skeleton');
const t0 = Date.now();
const skel = await client.estimateSkeleton({ image: referenceImage });
const restKeypoints = skel.keypoints;
console.log(`  got ${restKeypoints.length} keypoints (${Date.now() - t0} ms)`);

// Keypoints are returned in NORMALIZED (0..1) image space. Offsets are
// expressed in the same normalized space — 0.03 ≈ 4 px at 128².
function poseWithOffsets(base, offsets) {
  return base.map((k) => {
    const dy = offsets[k.label] ?? 0;
    return { ...k, y: k.y + dy };
  });
}

// ── 3. Author a 4-frame walk cycle (offsets in normalized space) ─────
const LEFT_UP = {
  'LEFT HIP': -0.008, 'LEFT KNEE': -0.025, 'LEFT LEG': -0.035,
  'RIGHT HIP': 0.008, 'RIGHT KNEE': 0.015, 'RIGHT LEG': 0.015,
};
const RIGHT_UP = {
  'RIGHT HIP': -0.008, 'RIGHT KNEE': -0.025, 'RIGHT LEG': -0.035,
  'LEFT HIP': 0.008, 'LEFT KNEE': 0.015, 'LEFT LEG': 0.015,
};
const NONE = {};

// API returns N-1 frames for N keypoint sets (keypoints act as
// start/end of each interpolated step). So 3 keypoints → 2 output
// frames for a start/mid/end half-cycle.
const walk = [
  poseWithOffsets(restKeypoints, LEFT_UP),
  poseWithOffsets(restKeypoints, NONE),
  poseWithOffsets(restKeypoints, RIGHT_UP),
];

const outDir = join(__dirname, 'out', 'animtest');
await mkdir(outDir, { recursive: true });
await writeFile(
  join(outDir, 'sk_south_walk.keypoints.json'),
  JSON.stringify({ rest: restKeypoints, walk }, null, 2)
);

// ── 4. animate-with-skeleton (raw fetch; SDK wraps frames wrongly) ───
console.log(`→ animate-with-skeleton  size=${SIZE}²  frames=${walk.length}`);
const t1 = Date.now();
const body = {
  image_size: { width: SIZE, height: SIZE },
  reference_guidance_scale: 1.1,
  pose_guidance_scale: 3,
  view: 'low top-down',
  direction: 'south',
  isometric: false,
  oblique_projection: false,
  init_images: null,
  init_image_strength: 300,
  skeleton_keypoints: walk, // list of lists, matches API spec
  reference_image: referenceImage.modelDump(),
  // API expects N-1 mask/inpainting images for N keypoint frames
  // ("pose images" per-transition between keyframes).
  inpainting_images: walk.slice(0, -1).map(() => null),
  mask_images: walk.slice(0, -1).map(() => null),
  color_image: null,
  seed: SEED,
};
const raw = await fetch('https://api.pixellab.ai/v1/animate-with-skeleton', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${process.env.PIXELLAB_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(body),
});
if (!raw.ok) {
  console.error('RAW STATUS:', raw.status);
  console.error('RAW BODY:', (await raw.text()).slice(0, 2000));
  process.exit(1);
}
const result = await raw.json();
const elapsedMs = Date.now() - t1;

// ── 5. Save frames ───────────────────────────────────────────────────
for (let i = 0; i < result.images.length; i++) {
  await saveBase64Png(result.images[i].base64, join(outDir, `sk_south_walk_f${i}.png`));
}
console.log(`✓ ${result.images.length} frames saved`);
console.log(`  cost: $${result.usage.usd.toFixed(4)}  (${elapsedMs} ms)`);
