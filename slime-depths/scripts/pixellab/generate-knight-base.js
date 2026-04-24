// Step 1 of the Knight pipeline: generate the canonical idle sprite.
// This is the single source-of-truth image every downstream call
// (estimateSkeleton, animateWithSkeleton) references, so nailing this
// one matters more than any other call.
//
// Usage:
//   node scripts/pixellab/generate-knight-base.js [--prompt terse|moderate|descriptive]
//
// Default prompt is `moderate`. Output lands at
//   scripts/pixellab/out/knight_idle_base.png
//   scripts/pixellab/out/knight_idle_base.meta.json
// along with a usage-cost readout to stdout. The meta sidecar records
// the exact prompt + params used so we can reproduce or branch off it.

import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { getClient, saveBase64Png } from './client.js';
import { SPR, SEED, COMMON, KNIGHT_PROMPTS, OUT_DIR } from './config.js';

const args = new Map(
  process.argv.slice(2).reduce((acc, arg, i, arr) => {
    if (arg.startsWith('--')) acc.push([arg.slice(2), arr[i + 1] ?? true]);
    return acc;
  }, [])
);
const promptKey = args.get('prompt') || 'moderate';
const description = KNIGHT_PROMPTS[promptKey];
if (!description) {
  console.error(`Unknown prompt key "${promptKey}". Use: terse | moderate | descriptive`);
  process.exit(1);
}

const client = getClient();

console.log(`→ generate-image-pixflux  (prompt=${promptKey}, seed=${SEED}, size=${SPR}×${SPR})`);
console.log(`  "${description.slice(0, 100)}${description.length > 100 ? '…' : ''}"`);

const t0 = Date.now();
const result = await client.generateImagePixflux({
  description,
  imageSize: { width: SPR, height: SPR },
  seed: SEED,
  ...COMMON,
});
const elapsedMs = Date.now() - t0;

const outPng = join(OUT_DIR, 'knight_idle_base.png');
const outMeta = join(OUT_DIR, 'knight_idle_base.meta.json');
await mkdir(OUT_DIR, { recursive: true });
await saveBase64Png(result.image.base64, outPng);
await writeFile(
  outMeta,
  JSON.stringify(
    {
      prompt: description,
      promptKey,
      seed: SEED,
      imageSize: { width: SPR, height: SPR },
      common: COMMON,
      usage: result.usage,
      elapsedMs,
      generatedAt: new Date().toISOString(),
    },
    null,
    2
  )
);

console.log(`✓ saved ${outPng}`);
console.log(`✓ meta  ${outMeta}`);
console.log(`  cost: $${result.usage.usd.toFixed(4)}  (${elapsedMs} ms)`);
