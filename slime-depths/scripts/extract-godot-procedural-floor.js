// ============================================================================
// EXTRACT-GODOT-PROCEDURAL-FLOOR — bake a single procedural-style dungeon
// floor PNG that mimics slime-depths' drawFloorTile output (vault biome).
//
// The original game renders the floor per-cell every frame: base color +
// hash-driven noise (12% darker / 5% lighter) + subtle embossed patterns.
// For the Godot slice we don't need real-time procedurality — one baked
// PNG of the right look is sufficient. The slice already evaluates engine
// fit; the floor sprite just needs to LOOK like the old game.
//
// Palette source: src/room.js → vault biome (the "dungeon proper" look).
//   floorBase  #33292f  (warm dark brown — most common cell)
//   floorLit   #3a2f35  (~5% slightly lighter)
//   floorDark  #2b2228  (~12% slightly darker)
//   wallBody   #2c242b  (perimeter wall fill)
//   wallTopMid #594a55  (top edge of walls — catches "torchlight")
//   wallRim    #100b15  (outer wall outline)
//
// Output:  slime-depths-godot/assets/rooms/procedural_dungeon.png  (1280×768)
// Layout:  40 × 24 tiles at 32 px each, matching the ruins composite.
// Walls:   3-tile border around the playable area (top/bottom/left/right).
// ============================================================================

import sharp from 'sharp';

const W = 1280, H = 768, TILE = 32;
const COLS = W / TILE, ROWS = H / TILE;
const WALL_THICKNESS = 3;             // tile border on all four sides

// Hex → [r,g,b]
const hex = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
const FLOOR_BASE = hex('#33292f');
const FLOOR_LIT  = hex('#3a2f35');
const FLOOR_DARK = hex('#2b2228');
const WALL_BODY  = hex('#2c242b');
const WALL_TOP   = hex('#594a55');
const WALL_RIM   = hex('#100b15');
const CRACK      = hex('#1a131a');

// Hash function mirroring slime-depths/src/room.js — same input → same output.
function hash(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177 | 0;
  return (h ^ (h >>> 16)) >>> 0;
}

// Allocate raw RGBA buffer.
const buf = Buffer.alloc(W * H * 4);

function setPx(x, y, [r, g, b], a = 255) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 4;
  buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = a;
}
function fillRect(x0, y0, w, h, color) {
  for (let y = y0; y < y0 + h; y++)
    for (let x = x0; x < x0 + w; x++)
      setPx(x, y, color);
}
function fillTile(tx, ty, color) {
  fillRect(tx * TILE, ty * TILE, TILE, TILE, color);
}

// ── Pass 1: paint floor over the entire canvas ──────────────────────
for (let ty = 0; ty < ROWS; ty++) {
  for (let tx = 0; tx < COLS; tx++) {
    const h = hash(tx, ty);
    // 12% darker, 5% lighter, else base — matches the old random-tint logic.
    const r = h % 100;
    let color = FLOOR_BASE;
    if (r < 12) color = FLOOR_DARK;
    else if (r < 17) color = FLOOR_LIT;
    fillTile(tx, ty, color);
    // 8% chance of a single dark "crack" pixel for stone-texture flavor.
    if ((h >>> 8) % 100 < 8) {
      const cx = tx * TILE + ((h >>> 12) % TILE);
      const cy = ty * TILE + ((h >>> 16) % TILE);
      setPx(cx, cy, CRACK);
      // 1-2 extra pixels along a random axis so the crack reads as a line
      const dx = ((h >>> 20) & 1) ? 1 : 0;
      const dy = ((h >>> 20) & 1) ? 0 : 1;
      setPx(cx + dx, cy + dy, CRACK);
      setPx(cx + 2 * dx, cy + 2 * dy, CRACK);
    }
  }
}

// ── Pass 2: 3-tile wall border on all sides ─────────────────────────
// Body fill: WALL_BODY. Then a 2-px WALL_RIM line on the inner edge
// (catches the eye as "the corner of a step"), and a 1-px WALL_TOP
// highlight on the upper edge of horizontal walls (torch catch).
for (let ty = 0; ty < ROWS; ty++) {
  for (let tx = 0; tx < COLS; tx++) {
    const isWall = tx < WALL_THICKNESS || tx >= COLS - WALL_THICKNESS
                || ty < WALL_THICKNESS || ty >= ROWS - WALL_THICKNESS;
    if (!isWall) continue;
    const h = hash(tx, ty);
    // Slight variation within the wall too — same noise rule as floor.
    const r = h % 100;
    let color = WALL_BODY;
    if (r < 18) color = [Math.max(0, WALL_BODY[0] - 6), Math.max(0, WALL_BODY[1] - 6), Math.max(0, WALL_BODY[2] - 6)];
    fillTile(tx, ty, color);
  }
}
// Inner-edge rim (1-px line along the playable-area-facing edge of walls).
// Helps the eye read where "wall" ends and "floor" begins.
for (let x = WALL_THICKNESS * TILE; x < W - WALL_THICKNESS * TILE; x++) {
  // top wall's lower edge
  setPx(x, WALL_THICKNESS * TILE - 1, WALL_RIM);
  setPx(x, WALL_THICKNESS * TILE - 2, WALL_RIM);
  // bottom wall's upper edge
  setPx(x, H - WALL_THICKNESS * TILE,     WALL_RIM);
  setPx(x, H - WALL_THICKNESS * TILE + 1, WALL_RIM);
}
for (let y = WALL_THICKNESS * TILE; y < H - WALL_THICKNESS * TILE; y++) {
  setPx(WALL_THICKNESS * TILE - 1,     y, WALL_RIM);
  setPx(WALL_THICKNESS * TILE - 2,     y, WALL_RIM);
  setPx(W - WALL_THICKNESS * TILE,     y, WALL_RIM);
  setPx(W - WALL_THICKNESS * TILE + 1, y, WALL_RIM);
}
// Top-edge highlight on the top wall row — fake torchlight catch.
for (let x = 0; x < W; x++) {
  setPx(x, 0, WALL_TOP);
  setPx(x, 1, WALL_TOP);
}

await sharp(buf, { raw: { width: W, height: H, channels: 4 } })
  .png()
  .toFile('../slime-depths-godot/assets/rooms/procedural_dungeon.png');

console.log(`[done] procedural_dungeon.png  (${W}×${H}, ${COLS}×${ROWS} tiles, ${WALL_THICKNESS}-tile wall border)`);
