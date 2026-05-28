// import-frostwindz-fx.js
//
// Imports the Frostwindz Pixel Art Animations packs the user dropped
// into the project root. These are hand-painted, AAA-quality slash +
// portal animations — a major leap over the PixelLab-generated FX in
// iter 87 (which were 4-frame procedurally-generated sheets).
//
// Source packs:
//   "Pixel Art Animations - Slashes"   — 3 slash variants × 5 colors
//   "Pixel Art Animated Portal"         — 7-frame summon portal
//
// Both ship as individual PNG frames (one file per frame). This script
// concatenates them into horizontal strips — the format fx_sprite.gd
// expects — and writes meta sidecars.
//
// Output (replaces the iter-87 PixelLab versions):
//   slime-depths-godot/assets/fx/slash_arc_sheet.png   (9f × 128px, blue)
//   slime-depths-godot/assets/fx/slash_arc_meta.json
//   slime-depths-godot/assets/fx/spawn_portal_sheet.png (7f × 64px, purple)
//   slime-depths-godot/assets/fx/spawn_portal_meta.json
//
// Theme color variants (red/orange/green/purple slashes) are NOT
// imported here — kept as a future polish iter so we don't compound
// the integration surface in one commit. The blue slash (color5) is
// the universal default; FxSprite's modulate param tints it lightly
// for theme effect.

import { mkdir, writeFile, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Source root is the user's "Project - Ethera" folder (outside the
// worktree). Hardcoded path — this script is run-once after the user
// drops packs in.
const SRC_ROOT =
  'C:\\Users\\14164\\Documents\\Claude\\Projects\\Project - Ethera';

// Output goes to the Godot port's fx folder.
const OUT_DIR = join(
  __dirname,
  '..',
  '..',
  '..',
  'slime-depths-godot',
  'assets',
  'fx'
);

// Import plan. Each entry:
//   name      → slime-depths-godot/assets/fx/<name>_sheet.png target
//   src_dir   → folder containing individual frame PNGs
//   fps       → animation playback speed
//   reverse   → if true, sort frames in reverse (rare; default false)
const IMPORTS = [
  {
    name: 'slash_arc',
    // color5 = blue — closest match to our existing cyan-white energy
    // slash aesthetic. Other colors (red/orange/purple/green) available
    // for future theme-tint variants.
    src_dir: join(
      SRC_ROOT,
      'Pixel Art Animations - Slashes',
      '128x128',
      'Slash 1',
      'color5',
      'Frames'
    ),
    fps: 30, // 9 frames @ 30fps = 0.3s — punchy melee slash duration
  },
  {
    name: 'spawn_portal',
    src_dir: join(SRC_ROOT, 'Pixel Art Animated Portal', 'Frames'),
    fps: 14, // 7 frames @ 14fps = 0.5s — portal open + brief active + close
  },
];

await mkdir(OUT_DIR, { recursive: true });

for (const imp of IMPORTS) {
  console.log(`\n━━━ ${imp.name} ━━━`);

  // Read frame files, sorted by trailing frame number (handles both
  // "Slash_colorN_frameM.png" and "portalN_frame_M.png" naming).
  const all = await readdir(imp.src_dir);
  const files = all
    .filter((f) => f.endsWith('.png'))
    .sort((a, b) => {
      const aMatch = a.match(/frame[_]?(\d+)/i);
      const bMatch = b.match(/frame[_]?(\d+)/i);
      if (aMatch && bMatch) {
        return parseInt(aMatch[1], 10) - parseInt(bMatch[1], 10);
      }
      return a.localeCompare(b);
    });

  if (files.length === 0) {
    console.error(`  ! no PNGs found in ${imp.src_dir}`);
    continue;
  }

  // Read each frame; infer cell size from frame 1.
  const frameBufs = await Promise.all(
    files.map((f) => sharp(join(imp.src_dir, f)).toBuffer())
  );
  const meta = await sharp(frameBufs[0]).metadata();
  const cellSize = meta.width;
  if (meta.width !== meta.height) {
    console.warn(`  ! non-square frames (${meta.width}×${meta.height}) — using width`);
  }

  console.log(`  ${files.length} frames @ ${cellSize}×${cellSize}`);

  // Concatenate horizontally into a single strip.
  const stripW = cellSize * frameBufs.length;
  const stripPath = join(OUT_DIR, `${imp.name}_sheet.png`);
  await sharp({
    create: {
      width: stripW,
      height: cellSize,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(
      frameBufs.map((buf, i) => ({ input: buf, top: 0, left: i * cellSize }))
    )
    .png()
    .toFile(stripPath);

  // Meta sidecar (read by fx_sprite.gd at runtime).
  const metaPath = join(OUT_DIR, `${imp.name}_meta.json`);
  await writeFile(
    metaPath,
    JSON.stringify(
      {
        name: imp.name,
        frames: frameBufs.length,
        fps: imp.fps,
        cell_size: cellSize,
        sheet_width: stripW,
        sheet_height: cellSize,
        source: imp.src_dir,
        source_pack: 'Frostwindz Pixel Art Animations',
        imported_at: new Date().toISOString(),
      },
      null,
      2
    )
  );

  console.log(`  ✓ ${stripPath}  (${stripW}×${cellSize})`);
  console.log(`  ✓ ${metaPath}`);
}

console.log('\n━━━ done ━━━');
