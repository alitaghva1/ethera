// ============================================================================
// EXTRACT-GODOT-HAMLET-FLOOR — bakes the hamlet hub's grass + path floor
// for the Godot slice. Same approach as the dungeon-floor baker; just a
// different palette + a stone-path strip down the middle.
//
// Layout: 1280×768, 40×24 tiles. Grass base everywhere. Horizontal
// stone path crosses the map east-west (3 tiles tall, centered Y=12).
// A vertical stone path drops south from the building cluster to the
// portal at (20, 22).
//
// Palette (matches slime-depths' "grass" / hamlet tone):
//   grassBase  #3a5a30
//   grassLit   #4a6a3c
//   grassDark  #2c4624
//   stonePath  #7a6a52  (warm sandy stone)
//   stoneDark  #5a4a32
//   stoneEdge  #2c1c10
// ============================================================================

import sharp from 'sharp';

const W = 1280, H = 768, TILE = 32;
const COLS = W / TILE, ROWS = H / TILE;

const hex = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
const GRASS      = hex('#3a5a30');
const GRASS_LIT  = hex('#4a6a3c');
const GRASS_DARK = hex('#2c4624');
const STONE      = hex('#7a6a52');
const STONE_DARK = hex('#5a4a32');
const STONE_EDGE = hex('#2c1c10');
const FLOWER_A   = hex('#d8b8e0');   // soft purple — tiny grass flowers
const FLOWER_B   = hex('#e8d460');   // gold

function hash(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177 | 0;
  return (h ^ (h >>> 16)) >>> 0;
}

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

// ── Pass 1: grass floor over the entire canvas ──────────────────────
for (let ty = 0; ty < ROWS; ty++) {
  for (let tx = 0; tx < COLS; tx++) {
    const h = hash(tx, ty);
    const r = h % 100;
    let color = GRASS;
    if (r < 14) color = GRASS_DARK;
    else if (r < 22) color = GRASS_LIT;
    fillTile(tx, ty, color);
    // 2% chance: a single bright pixel = wildflower
    if ((h >>> 8) % 100 < 2) {
      const cx = tx * TILE + ((h >>> 12) % TILE);
      const cy = ty * TILE + ((h >>> 16) % TILE);
      const flower = ((h >>> 20) & 1) ? FLOWER_A : FLOWER_B;
      setPx(cx, cy, flower);
      setPx(cx + 1, cy, flower);
      setPx(cx, cy + 1, flower);
    }
  }
}

// ── Pass 2: horizontal stone path (east-west, 3 tiles tall, Y rows 11-13)
function paintStoneTile(tx, ty) {
  const h = hash(tx, ty);
  const r = h % 100;
  let color = STONE;
  if (r < 22) color = STONE_DARK;
  fillTile(tx, ty, color);
  // Sparse pebbles
  if ((h >>> 8) % 100 < 6) {
    const cx = tx * TILE + ((h >>> 12) % TILE);
    const cy = ty * TILE + ((h >>> 16) % TILE);
    setPx(cx, cy, STONE_EDGE);
  }
}
for (let tx = 0; tx < COLS; tx++) {
  for (let ty = 11; ty <= 13; ty++) {
    paintStoneTile(tx, ty);
  }
}
// Path edges — single line of darker stone on north + south edges of the path
for (let x = 0; x < W; x++) {
  setPx(x, 11 * TILE, STONE_EDGE);
  setPx(x, 11 * TILE - 1, STONE_EDGE);
  setPx(x, 14 * TILE - 1, STONE_EDGE);
  setPx(x, 14 * TILE, STONE_EDGE);
}

// ── Pass 3: vertical stone path (south spur to portal) at columns 19-21
// from row 14 to bottom edge
for (let tx = 19; tx <= 21; tx++) {
  for (let ty = 14; ty < ROWS; ty++) {
    paintStoneTile(tx, ty);
  }
}
for (let y = 14 * TILE; y < H; y++) {
  setPx(19 * TILE - 1, y, STONE_EDGE);
  setPx(19 * TILE, y, STONE_EDGE);
  setPx(22 * TILE - 1, y, STONE_EDGE);
  setPx(22 * TILE, y, STONE_EDGE);
}

await sharp(buf, { raw: { width: W, height: H, channels: 4 } })
  .png()
  .toFile('../slime-depths-godot/assets/rooms/hamlet_floor.png');

console.log(`[done] hamlet_floor.png  (${W}×${H}, grass + stone path layout)`);
