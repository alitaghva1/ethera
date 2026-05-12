// generate-godot-fx-pack.js
//
// Generates a combat-FX sprite sheet pack for slime-depths-godot via
// PixelLab's animateWithText endpoint. Each effect goes through two API
// calls:
//   1. generateImagePixflux  → base frame (~$0.01)
//   2. animateWithText       → N animated frames (~$0.05-0.15)
//
// Output structure:
//   slime-depths-godot/assets/fx/<name>_sheet.png   (horizontal strip)
//   slime-depths-godot/assets/fx/<name>_meta.json   (frame count + fps)
//
// PixelLab constraint: animateWithText is 64×64 only. We generate at
// that resolution and the Godot side scales via AnimatedSprite2D.scale
// (no manual pixel squashing — Godot's nearest-neighbor scaling
// preserves pixel-art crunch at any zoom).
//
// Usage:
//   node scripts/pixellab/generate-godot-fx-pack.js            # all FX
//   node scripts/pixellab/generate-godot-fx-pack.js slash_arc  # one
//
// Total cost estimate: ~$0.50 for the full pack of 4 effects.

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { Base64Image } from '@pixellab-code/pixellab';
import { getClient, saveBase64Png } from './client.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// PixelLab animateWithText is locked to 64×64. Larger output happens via
// Godot's AnimatedSprite2D.scale — NOT via manual squashing.
const SPR = 64;

// Output: drop directly into the Godot project's assets folder so the
// Godot side just needs to reference res://assets/fx/<name>_sheet.png.
const OUT_DIR = join(
  __dirname,
  '..',
  '..',
  '..',
  'slime-depths-godot',
  'assets',
  'fx'
);
// Intermediate raw frames live here for debugging (which frames came back
// pristine vs degraded). Not consumed by the game.
const RAW_DIR = join(__dirname, 'out', 'fx');

// FX pack — each entry generates one sprite sheet. The shape of each
// entry mirrors what animate-slime-api.js uses for the slime, scaled
// down for short-lifetime burst FX (4-10 frames per effect).
//
// PROMPT DESIGN — three lessons from the slime + knight runs:
//   1. base_description should be a NOUN PHRASE describing the OBJECT,
//      not the action. "curved cyan slash arc" not "the sword swings."
//   2. action should be a VERB PHRASE describing the MOTION across
//      the lifetime. "expanding outward then dissipating" not "boom."
//   3. negative should ban human/character/weapon explicitly — without
//      this the API often pastes a tiny knight body into the effect.
const FX_PACK = [
  {
    name: 'slash_arc',
    base_description:
      'curved cyan and white energy slash arc, glowing magical sweep ' +
      'with motion blur trail, painterly pixel art, dark fantasy game ' +
      'effect, viewed from above, isolated effect on transparent background',
    action:
      'energy arc sweeping from upper-left to lower-right across the frame, ' +
      'brightening at peak motion, then dissipating into faint sparks',
    negative:
      'character, person, warrior, knight, wizard, sword, weapon, hand, ' +
      'body, blood, gore, background, scenery, ground, floor',
    frames: 8,
    fps: 28,
    // Optional: tint the resulting strip if PixelLab's output drifts
    // off our intended color. Leave null to use raw output.
    target_tint: null,
  },
  {
    name: 'dash_impact',
    base_description:
      'top-down view of a bright cyan-white radial shockwave explosion ' +
      'with expanding dust ring and ground crack fragments scattering, ' +
      'painterly pixel art, dark fantasy combat effect, isolated on ' +
      'transparent background',
    action:
      'shockwave rapidly expanding outward from the center, peaking at ' +
      'mid-animation, then ring continues outward while core fades to nothing',
    negative:
      'character, person, warrior, weapon, sword, body, ground, floor, ' +
      'walls, scenery, background, color background',
    frames: 10,
    fps: 30,
    target_tint: null,
  },
  {
    name: 'parry_burst',
    base_description:
      'top-down view of a circular golden shield deflect flash with four ' +
      'radial energy beams firing outward in cardinal directions, holy ' +
      'magic, painterly pixel art, dark fantasy game effect, isolated on ' +
      'transparent background',
    action:
      'golden ring forming and brightening, four energy beams shooting ' +
      'outward in cardinal directions, then ring expands and everything fades',
    negative:
      'character, person, warrior, knight, hero, shield prop, weapon, ' +
      'body, ground, background, scenery',
    frames: 6,
    fps: 18,
    target_tint: null,
  },
  {
    name: 'hit_spark',
    base_description:
      'small white and cream impact spark burst with sharp radiating ' +
      'spikes, painterly pixel art, dark fantasy combat, isolated on ' +
      'transparent background, no scenery',
    action:
      'spark burst exploding outward in all directions with eight short ' +
      'spikes, peaking at frame 2, then quickly fading',
    negative:
      'character, person, weapon, blood, ground, floor, background, scenery',
    frames: 5,
    fps: 32,
    target_tint: null,
  },
];

// ── CLI parsing ──────────────────────────────────────────────────────
const args = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const onlyName = args[0] || null;
const targets = onlyName
  ? FX_PACK.filter((f) => f.name === onlyName)
  : FX_PACK;
if (targets.length === 0) {
  console.error(
    `unknown FX name "${onlyName}". valid: ${FX_PACK.map((f) => f.name).join(', ')}`
  );
  process.exit(1);
}

await mkdir(OUT_DIR, { recursive: true });
await mkdir(RAW_DIR, { recursive: true });

const client = getClient();

// Process effects sequentially (PixelLab API rate-limits parallel calls
// in practice; serial keeps cost-tracking clean too).
let totalCost = 0;
const tStart = Date.now();
for (const fx of targets) {
  console.log(`\n━━━ ${fx.name} (${fx.frames} frames @ ${fx.fps} fps) ━━━`);

  // STEP 1: generate the base/seed frame via generateImagePixflux.
  // This anchors the look of the effect. The animateWithText call below
  // takes it as a reference and produces N motion frames consistent with it.
  console.log(`→ step 1 — base frame (generateImagePixflux, ${SPR}×${SPR})`);
  const t1 = Date.now();
  const baseResult = await client.generateImagePixflux({
    description: fx.base_description,
    negativeDescription: fx.negative,
    imageSize: { width: SPR, height: SPR },
    textGuidanceScale: 9,    // tighter than character-default 8 — bias to prompt
    noBackground: true,
  });
  totalCost += baseResult.usage?.usd || 0;
  const baseBuf = Buffer.from(baseResult.image.base64.split(',', 2)[1] || baseResult.image.base64, 'base64');
  const baseImage = Base64Image.fromBuffer(baseBuf, 'png');
  // Save the raw base for debugging.
  await saveBase64Png(baseResult.image.base64, join(RAW_DIR, `${fx.name}_base.png`));
  console.log(
    `  ✓ base saved  (${Date.now() - t1}ms, $${(baseResult.usage?.usd || 0).toFixed(4)})`
  );

  // STEP 2: animate the base with action prompt — returns N pixel-art
  // frames showing the motion. Each frame is a fresh AI-generated image,
  // not a transformed copy — that's what gives the painterly per-frame
  // change instead of "same image scaled different."
  console.log(`→ step 2 — animate (animateWithText, ${fx.frames} frames)`);
  const t2 = Date.now();
  const animResult = await client.animateWithText({
    imageSize: { width: SPR, height: SPR },
    description: fx.base_description,
    action: fx.action,
    negativeDescription: fx.negative,
    referenceImage: baseImage,
    view: 'low top-down',
    direction: 'south',
    nFrames: fx.frames,
    textGuidanceScale: 9,
    // imageGuidanceScale balance: too low = drifts off the base style;
    // too high = frames look like reference scaled, no motion. The slime
    // run found 7 = good compromise. Use 6 here since FX bursts evolve
    // more than character actions — looser guidance lets the shape
    // genuinely change frame-to-frame.
    imageGuidanceScale: 6,
  });
  totalCost += animResult.usage?.usd || 0;
  console.log(
    `  ✓ ${animResult.images.length} frames  (${Date.now() - t2}ms, $${(animResult.usage?.usd || 0).toFixed(4)})`
  );

  // STEP 3: save individual raw frames + assemble horizontal strip.
  // The strip is what Godot loads as a single texture; the script
  // slices it into per-frame regions at render time.
  const frameBufs = [];
  for (let i = 0; i < animResult.images.length; i++) {
    const framePath = join(RAW_DIR, `${fx.name}_f${String(i).padStart(2, '0')}.png`);
    await saveBase64Png(animResult.images[i].base64, framePath);
    let frameBuf = await sharp(framePath).toBuffer();
    if (fx.target_tint) {
      // Optional post-process tint via sharp's modulate. Identity if null.
      frameBuf = await sharp(frameBuf).modulate(fx.target_tint).png().toBuffer();
    }
    frameBufs.push(frameBuf);
  }

  const stripW = SPR * frameBufs.length;
  const stripPath = join(OUT_DIR, `${fx.name}_sheet.png`);
  await sharp({
    create: {
      width: stripW,
      height: SPR,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(frameBufs.map((buf, i) => ({ input: buf, top: 0, left: i * SPR })))
    .png()
    .toFile(stripPath);

  // STEP 4: write metadata sidecar — Godot reads this to construct the
  // SpriteFrames with the right cell count + fps.
  const metaPath = join(OUT_DIR, `${fx.name}_meta.json`);
  await writeFile(
    metaPath,
    JSON.stringify(
      {
        name: fx.name,
        frames: frameBufs.length,
        fps: fx.fps,
        cell_size: SPR,
        sheet_width: stripW,
        sheet_height: SPR,
        generated_at: new Date().toISOString(),
        prompt: {
          base_description: fx.base_description,
          action: fx.action,
          negative: fx.negative,
        },
      },
      null,
      2
    )
  );

  console.log(`✓ ${fx.name}_sheet.png  (${stripW}×${SPR})`);
  console.log(`✓ ${fx.name}_meta.json`);
}

const totalElapsed = ((Date.now() - tStart) / 1000).toFixed(1);
console.log(`\n━━━ done in ${totalElapsed}s, total cost $${totalCost.toFixed(4)} ━━━`);
console.log(`output: ${OUT_DIR}`);
