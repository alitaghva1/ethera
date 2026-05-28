// Full Knight animation pipeline. Generates 5 states × 8 directions = 40
// animated sprite sets via PixelLab's animate-with-skeleton endpoint.
// Output structure:
//   scripts/pixellab/out/knight/<state>/<direction>/f{i}.png
//
// Also caches the estimated rest-pose skeleton per direction at:
//   scripts/pixellab/out/knight/_skeletons/<direction>.json
//
// The assemble-sheets.js script reads this tree + produces grid PNGs.
//
// Progress/errors stream to stdout + also to
// scripts/pixellab/out/knight/_progress.log so a background run can be
// monitored from another terminal.
//
// Usage:
//   node scripts/pixellab/generate-animations.js
//   node scripts/pixellab/generate-animations.js --dir south         # single direction
//   node scripts/pixellab/generate-animations.js --state walk        # single state
//   node scripts/pixellab/generate-animations.js --dir south --state walk
//   node scripts/pixellab/generate-animations.js --resume            # skip already-done combos
//
// Pipeline is idempotent via --resume — rerunning after a failure
// picks up where it left off.

import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { Base64Image } from '@pixellab-code/pixellab';
import { getClient, saveBase64Png } from './client.js';
import { SEED } from './config.js';
import { POSES, DIRECTIONS, STATES, buildFrames } from './poses.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SIZE = 128;
const OUT_ROOT = join(__dirname, 'out', 'knight');
const SKELETON_DIR = join(OUT_ROOT, '_skeletons');
const PROGRESS_LOG = join(OUT_ROOT, '_progress.log');

// ── CLI parsing ──────────────────────────────────────────────────────
const args = new Map();
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith('--')) args.set(a.slice(2), process.argv[i + 1] || true);
}
const onlyDir = args.get('dir');
const onlyState = args.get('state');
const resume = !!args.get('resume');

const targetDirs = onlyDir ? [onlyDir] : DIRECTIONS;
const targetStates = onlyState ? [onlyState] : STATES;

await mkdir(SKELETON_DIR, { recursive: true });

async function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try {
    await writeFile(PROGRESS_LOG, line + '\n', { flag: 'a' });
  } catch {}
}

async function fileExists(path) {
  try {
    await access(path, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

// Pad a 92×92 directional reference to 128×128 with transparent border.
// The rest-pose keypoint estimate needs a 128 image so the animate
// call's reference + keypoints live in the same coordinate space.
async function loadAndPadReference(direction) {
  const srcPath = join(__dirname, 'rotations', `${direction}.png`);
  const buf = await readFile(srcPath);
  const padded = await sharp(buf)
    .resize(SIZE, SIZE, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      kernel: sharp.kernel.nearest,
    })
    .png()
    .toBuffer();
  return Base64Image.fromBuffer(padded, 'png');
}

// Cached estimateSkeleton per direction. Saves the rest pose to JSON so
// we don't re-call estimateSkeleton on resume.
async function getRestSkeleton(client, direction, refImage) {
  const cachePath = join(SKELETON_DIR, `${direction}.json`);
  if (await fileExists(cachePath)) {
    const cached = JSON.parse(await readFile(cachePath, 'utf8'));
    return cached.keypoints;
  }
  await log(`  estimate-skeleton ${direction}`);
  const skel = await client.estimateSkeleton({ image: refImage });
  await writeFile(cachePath, JSON.stringify({ direction, keypoints: skel.keypoints }, null, 2));
  return skel.keypoints;
}

// animate-with-skeleton call via raw fetch. The SDK schema wraps
// keypoints in {keypoints: [...]}, which the API rejects; we inline
// a list-of-lists here. The API REQUIRES exactly 3 keypoint frames
// per call (returns 3 output frames). Longer animations are produced
// by chaining multiple chunked calls.
async function animateChunk({ refImage, threeFrames, direction }) {
  if (threeFrames.length !== 3) throw new Error(`Expected 3 frames, got ${threeFrames.length}`);
  const body = {
    image_size: { width: SIZE, height: SIZE },
    reference_guidance_scale: 1.1,
    pose_guidance_scale: 3,
    view: 'low top-down',
    direction,
    isometric: false,
    oblique_projection: false,
    init_images: null,
    init_image_strength: 300,
    skeleton_keypoints: threeFrames,
    reference_image: refImage.modelDump(),
    inpainting_images: [null, null],   // N-1 for N=3
    mask_images: [null, null],
    color_image: null,
    seed: SEED,
  };
  const res = await fetch('https://api.pixellab.ai/v1/animate-with-skeleton', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.PIXELLAB_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 400)}`);
  }
  return res.json();
}

// Generate N frames by chaining 3-frame chunked calls. Pads the final
// chunk with repeats of the last keypoint so the call still sends 3
// frames; output is trimmed to exactly N.
async function animateFull({ refImage, keypointFrames, direction }) {
  const N = keypointFrames.length;
  const out = [];
  let totalUsd = 0;
  for (let i = 0; i < N; i += 3) {
    let chunk = keypointFrames.slice(i, i + 3);
    while (chunk.length < 3) chunk = [...chunk, chunk[chunk.length - 1]];
    const resp = await animateChunk({ refImage, threeFrames: chunk, direction });
    const imgs = resp.images || [];
    const needed = Math.min(3, N - i);
    out.push(...imgs.slice(0, needed));
    totalUsd += resp.usage?.usd || 0;
  }
  return { images: out, usage: { usd: totalUsd } };
}

// ── MAIN LOOP ────────────────────────────────────────────────────────
import 'dotenv/config';
const client = getClient();

let calls = 0;
let skipped = 0;
const totalCombos = targetDirs.length * targetStates.length;
await log(`START  dirs=${targetDirs.length} states=${targetStates.length} total=${totalCombos} resume=${resume}`);

const startAll = Date.now();
for (const direction of targetDirs) {
  const refImage = await loadAndPadReference(direction);
  const rest = await getRestSkeleton(client, direction, refImage);

  for (const stateName of targetStates) {
    const state = POSES[stateName];
    const outDir = join(OUT_ROOT, stateName, direction);
    const doneMarker = join(outDir, '.done');

    // Resume-skip: if the done-marker file is present, state is complete.
    if (resume && (await fileExists(doneMarker))) {
      skipped++;
      await log(`SKIP   ${stateName}/${direction} (already done)`);
      continue;
    }

    await mkdir(outDir, { recursive: true });
    const keypointFrames = buildFrames(state, rest);
    const t0 = Date.now();
    try {
      const resp = await animateFull({ refImage, keypointFrames, direction });
      for (let i = 0; i < resp.images.length; i++) {
        await saveBase64Png(resp.images[i].base64, join(outDir, `f${i}.png`));
      }
      await writeFile(doneMarker, new Date().toISOString());
      calls++;
      const dt = Date.now() - t0;
      const pct = ((calls + skipped) / totalCombos * 100).toFixed(0);
      await log(`OK     ${stateName}/${direction}  frames=${resp.images.length}  ${dt}ms  cost=$${(resp.usage?.usd || 0).toFixed(4)}  [${pct}%]`);
    } catch (e) {
      await log(`FAIL   ${stateName}/${direction}  ${e.message}`);
      // keep going — --resume will retry later
    }
  }
}

const total = (Date.now() - startAll) / 1000;
await log(`DONE   calls=${calls} skipped=${skipped} total_time=${total.toFixed(0)}s`);
