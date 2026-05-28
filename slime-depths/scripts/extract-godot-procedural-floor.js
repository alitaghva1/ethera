// ============================================================================
// EXTRACT-GODOT-PROCEDURAL-FLOOR — bake a single procedural-style dungeon
// floor PNG for the Godot slice. Goal: actual stone-masonry feel, not a
// flat noise field.
//
// Approach (per-pass):
//   1. Floor tiles — each 32-px cell is one of 7 stone shades from a
//      hash-driven distribution. ~15% of cells get a chiselled split
//      (two shades within one tile) for stonework variation.
//   2. Mortar grid — 1-2 px darker lines between every tile so the
//      grid reads as MASONRY rather than noise.
//   3. Cracks — zig-zag or curved at ~5% density, 4-7 pixels long.
//   4. Floor decals — rare skull / chain / coin silhouettes at ~1
//      per 200 tiles, only in interior floor cells.
//   5. Edge wear — tiles adjacent to the wall border have a 1-2 px
//      darker rim on the wall-facing edge (water staining).
//   6. Wall border — 3-tile band painted as THREE distinct courses of
//      stacked bricks in Flemish bond (alternating offsets row to row).
//      Each brick gets its own shade, mortar lines, and inner darken.
//      Top-row gets a highlight catching imagined torchlight.
//
// Palette source: src/room.js → vault biome:
//   FLOOR_S1..S7  spectrum from very dark to lit warm-brown stone
//   WALL_BODY     #2c242b  perimeter wall fill
//   WALL_LIT      #3c343b  brighter brick face
//   WALL_DARK     #1c1418  shadowed brick face
//   WALL_TOP      #594a55  upper-edge highlight (torch catch)
//   WALL_RIM      #100b15  outer outline / mortar
//   CRACK         #1a131a  hairline crack
//   STAIN         #261d22  edge-wear darkening
//
// Output:  slime-depths-godot/assets/rooms/procedural_dungeon.png  (1280×768)
// Layout:  40 × 24 tiles at 32 px each.
// Walls:   3-tile border around the playable area on all four sides.
// ============================================================================

import sharp from 'sharp';

const W = 1280, H = 768, TILE = 32;
const COLS = W / TILE, ROWS = H / TILE;
const WALL_THICKNESS = 3;

const hex = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
// 7 stone shades — distributed by hash for per-tile variation.
const FLOOR_S1 = hex('#241a20');   // darkest
const FLOOR_S2 = hex('#2b2228');
const FLOOR_S3 = hex('#33292f');   // most common (matches old FLOOR_BASE)
const FLOOR_S4 = hex('#3a2f35');
const FLOOR_S5 = hex('#403640');
const FLOOR_S6 = hex('#473a44');
const FLOOR_S7 = hex('#4d4048');   // lightest
const SHADES   = [FLOOR_S1, FLOOR_S2, FLOOR_S3, FLOOR_S4, FLOOR_S5, FLOOR_S6, FLOOR_S7];
// Mortar lines + cracks
const MORTAR    = hex('#1d161b');
const MORTAR_LT = hex('#2a2128');
const CRACK     = hex('#1a131a');
// Edge wear
const STAIN     = hex('#261d22');
// Wall palette
const WALL_BODY = hex('#2c242b');
const WALL_LIT  = hex('#3c343b');
const WALL_DARK = hex('#1c1418');
const WALL_TOP  = hex('#594a55');
const WALL_RIM  = hex('#100b15');
// Decal palette
const BONE      = hex('#cac0b0');
const BONE_DARK = hex('#5a5448');
const CHAIN     = hex('#48424a');
const COIN      = hex('#d4a848');
const COIN_DARK = hex('#7a5c20');

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
function getPx(x, y) {
  if (x < 0 || y < 0 || x >= W || y >= H) return null;
  const i = (y * W + x) * 4;
  return [buf[i], buf[i + 1], buf[i + 2]];
}
function blendPx(x, y, [r, g, b], alpha) {
  const cur = getPx(x, y);
  if (!cur) return;
  setPx(x, y, [
    Math.round(cur[0] * (1 - alpha) + r * alpha),
    Math.round(cur[1] * (1 - alpha) + g * alpha),
    Math.round(cur[2] * (1 - alpha) + b * alpha),
  ]);
}
function fillRect(x0, y0, w, h, color) {
  for (let y = y0; y < y0 + h; y++)
    for (let x = x0; x < x0 + w; x++)
      setPx(x, y, color);
}

function isWallTile(tx, ty) {
  return tx < WALL_THICKNESS || tx >= COLS - WALL_THICKNESS
      || ty < WALL_THICKNESS || ty >= ROWS - WALL_THICKNESS;
}

// Pick a stone shade based on hash distribution — most common is mid
// (S3 / S4), rarer dark + light flank.
function pickShade(h) {
  const r = h % 100;
  if (r < 8)  return FLOOR_S1;
  if (r < 22) return FLOOR_S2;
  if (r < 48) return FLOOR_S3;
  if (r < 72) return FLOOR_S4;
  if (r < 88) return FLOOR_S5;
  if (r < 96) return FLOOR_S6;
  return FLOOR_S7;
}

// ── Pass 1: floor tiles (interior cells only) ────────────────────────
// Each tile gets a single shade; ~15% of tiles get split into two
// shades along a diagonal for a chiselled / repaired look.
for (let ty = 0; ty < ROWS; ty++) {
  for (let tx = 0; tx < COLS; tx++) {
    if (isWallTile(tx, ty)) continue;
    const h = hash(tx, ty);
    const baseShade = pickShade(h);
    const splitChance = (h >>> 8) % 100;
    if (splitChance < 15) {
      // Diagonal-split tile: paint two halves with different shades
      const altShade = pickShade(h >>> 4);
      const dir = (h >>> 12) & 3; // 4 split directions
      for (let py = 0; py < TILE; py++) {
        for (let px = 0; px < TILE; px++) {
          let useAlt;
          if      (dir === 0) useAlt = (px + py) > TILE;     // NE-SW
          else if (dir === 1) useAlt = (px - py) > 0;        // NW-SE
          else if (dir === 2) useAlt = px > TILE / 2;        // vertical
          else                useAlt = py > TILE / 2;        // horizontal
          setPx(tx * TILE + px, ty * TILE + py, useAlt ? altShade : baseShade);
        }
      }
    } else {
      fillRect(tx * TILE, ty * TILE, TILE, TILE, baseShade);
    }
  }
}

// ── Pass 2: mortar grid — 1-px darker lines between tiles ────────────
// Painted only between interior (floor) tiles so wall block-pattern
// can lay its own mortar lines in pass 6.
for (let ty = WALL_THICKNESS; ty < ROWS - WALL_THICKNESS; ty++) {
  for (let tx = WALL_THICKNESS; tx < COLS - WALL_THICKNESS; tx++) {
    // Right edge — between tx and tx+1 (only if tx+1 also floor)
    if (tx + 1 < COLS - WALL_THICKNESS) {
      const x = (tx + 1) * TILE - 1;
      for (let y = ty * TILE; y < (ty + 1) * TILE; y++) {
        blendPx(x, y, MORTAR, 0.55);
        blendPx(x + 1, y, MORTAR_LT, 0.30);
      }
    }
    // Bottom edge — between ty and ty+1 (only if ty+1 also floor)
    if (ty + 1 < ROWS - WALL_THICKNESS) {
      const y = (ty + 1) * TILE - 1;
      for (let x = tx * TILE; x < (tx + 1) * TILE; x++) {
        blendPx(x, y, MORTAR, 0.55);
        blendPx(x, y + 1, MORTAR_LT, 0.30);
      }
    }
  }
}

// ── Pass 3: cracks — zig-zag pixel walks at ~5% density per tile ─────
function paintCrack(startX, startY, length, h) {
  let x = startX, y = startY;
  for (let i = 0; i < length; i++) {
    setPx(x, y, CRACK);
    // Curved walk: 60% step in primary direction, 40% sideways
    const r = (h >>> (i * 3)) % 100;
    const primaryDir = ((h >>> (i * 3 + 8)) & 3);
    if (r < 60) {
      if      (primaryDir === 0) x++;
      else if (primaryDir === 1) y++;
      else if (primaryDir === 2) { x++; y++; }
      else                       { x--; y++; }
    } else {
      if      (primaryDir === 0) y++;
      else if (primaryDir === 1) x++;
      else if (primaryDir === 2) { x++; y--; }
      else                       { x--; y--; }
    }
  }
}
for (let ty = WALL_THICKNESS; ty < ROWS - WALL_THICKNESS; ty++) {
  for (let tx = WALL_THICKNESS; tx < COLS - WALL_THICKNESS; tx++) {
    const h = hash(tx + 5000, ty + 5000);
    if (h % 100 >= 5) continue;
    const cx = tx * TILE + 6 + ((h >>> 8) % (TILE - 12));
    const cy = ty * TILE + 6 + ((h >>> 12) % (TILE - 12));
    const length = 4 + ((h >>> 16) % 4); // 4-7
    paintCrack(cx, cy, length, h);
  }
}

// ── Pass 4: edge wear — wall-facing rim darkening on adjacent floor ──
// Tiles directly bordering the wall get a 1-2 px dark stain on the
// wall-side edge — reads as moisture seepage / scuff from the wall.
for (let tx = 0; tx < COLS; tx++) {
  // North-edge stain
  for (let x = tx * TILE; x < (tx + 1) * TILE; x++) {
    if (tx >= WALL_THICKNESS && tx < COLS - WALL_THICKNESS) {
      blendPx(x, WALL_THICKNESS * TILE, STAIN, 0.6);
      blendPx(x, WALL_THICKNESS * TILE + 1, STAIN, 0.35);
    }
  }
  // South-edge stain
  for (let x = tx * TILE; x < (tx + 1) * TILE; x++) {
    if (tx >= WALL_THICKNESS && tx < COLS - WALL_THICKNESS) {
      blendPx(x, (ROWS - WALL_THICKNESS) * TILE - 1, STAIN, 0.6);
      blendPx(x, (ROWS - WALL_THICKNESS) * TILE - 2, STAIN, 0.35);
    }
  }
}
for (let ty = WALL_THICKNESS; ty < ROWS - WALL_THICKNESS; ty++) {
  for (let y = ty * TILE; y < (ty + 1) * TILE; y++) {
    // West-edge stain
    blendPx(WALL_THICKNESS * TILE, y, STAIN, 0.6);
    blendPx(WALL_THICKNESS * TILE + 1, y, STAIN, 0.35);
    // East-edge stain
    blendPx((COLS - WALL_THICKNESS) * TILE - 1, y, STAIN, 0.6);
    blendPx((COLS - WALL_THICKNESS) * TILE - 2, y, STAIN, 0.35);
  }
}

// ── Pass 5: floor decals — sparse silhouettes (skull / chain / coin) ─
// Hash-positioned so they're deterministic. Density ~1 per 100 tiles
// → ~6-8 across the floor area. Skull is the most striking; chain +
// coin are subtler ambient props.
function paintSkull(cx, cy) {
  // 5×4 cranium + 3×2 jaw, all in BONE_DARK with BONE eye sockets
  fillRect(cx - 2, cy - 2, 5, 4, BONE_DARK);
  setPx(cx - 1, cy - 1, BONE);  // brow shadow
  setPx(cx + 1, cy - 1, BONE);
  setPx(cx - 1, cy, [10, 8, 10]); // left eye socket (very dark)
  setPx(cx + 1, cy, [10, 8, 10]); // right eye socket
  setPx(cx, cy + 1, [10, 8, 10]); // nasal cavity
  // Jaw (a row of 3 pixels just below)
  setPx(cx - 1, cy + 2, BONE_DARK);
  setPx(cx, cy + 2, BONE);
  setPx(cx + 1, cy + 2, BONE_DARK);
}
function paintChain(cx, cy, h) {
  // 4 link silhouette zig-zagging — alternating diagonal links
  for (let i = 0; i < 5; i++) {
    const lx = cx + i * 2;
    const ly = cy + ((i & 1) ? 1 : 0);
    setPx(lx, ly, CHAIN);
    setPx(lx + 1, ly, CHAIN);
    setPx(lx, ly + 1, ((h >>> i) & 1) ? CHAIN : MORTAR);
  }
}
function paintCoin(cx, cy) {
  setPx(cx - 1, cy, COIN_DARK);
  setPx(cx, cy - 1, COIN);
  setPx(cx, cy, COIN);
  setPx(cx + 1, cy, COIN_DARK);
  setPx(cx, cy + 1, COIN_DARK);
}
for (let ty = WALL_THICKNESS + 1; ty < ROWS - WALL_THICKNESS - 1; ty++) {
  for (let tx = WALL_THICKNESS + 1; tx < COLS - WALL_THICKNESS - 1; tx++) {
    const h = hash(tx + 13000, ty + 13000);
    if (h % 200 !== 0) continue;
    const cx = tx * TILE + 8 + ((h >>> 8) % 16);
    const cy = ty * TILE + 8 + ((h >>> 12) % 16);
    const which = (h >>> 16) % 3;
    if      (which === 0) paintSkull(cx, cy);
    else if (which === 1) paintChain(cx, cy, h);
    else                  paintCoin(cx, cy);
  }
}

// ── Pass 6: wall border — 3 courses of bricks in Flemish bond ────────
// Each "course" is a 32-px row of bricks. Bricks are nominal 64-px wide
// stretchers, but every other course is offset by 32 px (Flemish bond)
// so vertical mortar lines never line up. Within a course, bricks are
// painted with hash-driven shade variation + a 1-px mortar gap.
const BRICK_W = 64;
function paintBrickCourse(rowY, courseIdx, isTopWall) {
  const offset = (courseIdx & 1) ? BRICK_W / 2 : 0;
  // Bricks extend from x = -offset to x = W + BRICK_W in steps of BRICK_W
  for (let bx = -offset; bx < W + BRICK_W; bx += BRICK_W) {
    const brickHash = hash(bx + 17000, rowY + courseIdx * 31);
    const r = brickHash % 100;
    // Brick face color — most are WALL_BODY, ~20% lighter, ~25% darker
    let face = WALL_BODY;
    if      (r < 25) face = WALL_DARK;
    else if (r < 45) face = WALL_LIT;
    // Paint brick face (32 tall)
    for (let py = 0; py < TILE; py++) {
      for (let px = 0; px < BRICK_W; px++) {
        const x = bx + px;
        const y = rowY + py;
        if (x < 0 || x >= W) continue;
        // 1-px inner-bottom shadow on each brick (relief)
        if (py === TILE - 2) {
          setPx(x, y, WALL_DARK);
        } else {
          setPx(x, y, face);
        }
      }
    }
    // Vertical mortar line — left edge of brick, 1 px
    for (let py = 0; py < TILE; py++) {
      const y = rowY + py;
      setPx(bx, y, WALL_RIM);
    }
    // Top-of-brick highlight (only for the very top course of the top wall)
    if (isTopWall && courseIdx === 0) {
      for (let px = 1; px < BRICK_W - 1; px++) {
        const x = bx + px;
        if (x < 0 || x >= W) continue;
        setPx(x, rowY, WALL_TOP);
      }
    }
  }
  // Horizontal mortar line at the bottom of this course
  for (let x = 0; x < W; x++) {
    setPx(x, rowY + TILE - 1, WALL_RIM);
  }
}

// Top wall — 3 courses at ty = 0, 1, 2
for (let ci = 0; ci < WALL_THICKNESS; ci++) {
  paintBrickCourse(ci * TILE, ci, true);
}
// Bottom wall — 3 courses at ty = ROWS-3, ROWS-2, ROWS-1
for (let ci = 0; ci < WALL_THICKNESS; ci++) {
  paintBrickCourse((ROWS - WALL_THICKNESS + ci) * TILE, ci, false);
}

// Left + right walls — paint vertical brick columns over the existing
// top/bottom-wall paint where they overlap. Vertical bricks are 32 wide
// × 64 tall, offset every other column.
function paintBrickColumn(colX, colIdx) {
  const offset = (colIdx & 1) ? BRICK_W / 2 : 0;
  for (let by = -offset; by < H + BRICK_W; by += BRICK_W) {
    const brickHash = hash(colX + colIdx * 41 + 19000, by + 19000);
    const r = brickHash % 100;
    let face = WALL_BODY;
    if      (r < 25) face = WALL_DARK;
    else if (r < 45) face = WALL_LIT;
    for (let py = 0; py < BRICK_W; py++) {
      for (let px = 0; px < TILE; px++) {
        const x = colX + px;
        const y = by + py;
        if (y < 0 || y >= H) continue;
        // Inner-right edge shadow on each brick (relief)
        if (px === TILE - 2) {
          setPx(x, y, WALL_DARK);
        } else {
          setPx(x, y, face);
        }
      }
    }
    // Horizontal mortar line at the top of this brick, 1 px
    for (let px = 0; px < TILE; px++) {
      const x = colX + px;
      const y = by;
      if (y < 0 || y >= H) continue;
      setPx(x, y, WALL_RIM);
    }
  }
  // Vertical mortar line at the right of this column
  for (let y = 0; y < H; y++) {
    setPx(colX + TILE - 1, y, WALL_RIM);
  }
}
// Left walls — columns 0, 1, 2. Paint only over the rows that aren't
// already top/bottom wall (i.e. between WALL_THICKNESS and ROWS-WALL_THICKNESS).
function paintSideColumn(colX, colIdx, isLeftWall) {
  const offset = (colIdx & 1) ? BRICK_W / 2 : 0;
  const yStart = WALL_THICKNESS * TILE;
  const yEnd = (ROWS - WALL_THICKNESS) * TILE;
  for (let by = yStart - offset - BRICK_W; by < yEnd + BRICK_W; by += BRICK_W) {
    const brickHash = hash(colX + colIdx * 41 + 19000, by + 19000);
    const r = brickHash % 100;
    let face = WALL_BODY;
    if      (r < 25) face = WALL_DARK;
    else if (r < 45) face = WALL_LIT;
    for (let py = 0; py < BRICK_W; py++) {
      for (let px = 0; px < TILE; px++) {
        const x = colX + px;
        const y = by + py;
        if (y < yStart || y >= yEnd) continue;
        if (px === TILE - 2) setPx(x, y, WALL_DARK);
        else                 setPx(x, y, face);
      }
    }
    // Horizontal mortar at the top of this brick
    for (let px = 0; px < TILE; px++) {
      const x = colX + px;
      const y = by;
      if (y < yStart || y >= yEnd) continue;
      setPx(x, y, WALL_RIM);
    }
  }
  // Right-edge mortar (the wall-facing side of this column)
  for (let y = yStart; y < yEnd; y++) {
    setPx(colX + TILE - 1, y, WALL_RIM);
  }
  // Inner-rim highlight on the wall-facing edge (separates wall from floor)
  if (isLeftWall) {
    // For left wall: the EAST face of column 2 is wall-facing
    if (colIdx === WALL_THICKNESS - 1) {
      for (let y = yStart; y < yEnd; y++) {
        setPx(colX + TILE - 2, y, WALL_RIM);
      }
    }
  } else {
    // For right wall: the WEST face of column 0 is wall-facing
    if (colIdx === 0) {
      for (let y = yStart; y < yEnd; y++) {
        setPx(colX, y, WALL_RIM);
      }
    }
  }
}
for (let ci = 0; ci < WALL_THICKNESS; ci++) {
  paintSideColumn(ci * TILE, ci, true);
  paintSideColumn((COLS - WALL_THICKNESS + ci) * TILE, ci, false);
}

// Re-paint the top + bottom inner-rim lines (over the side-column overpaint
// near corners) so the playable-edge of the top/bottom walls stays crisp.
for (let x = WALL_THICKNESS * TILE; x < W - WALL_THICKNESS * TILE; x++) {
  setPx(x, WALL_THICKNESS * TILE - 1, WALL_RIM);
  setPx(x, WALL_THICKNESS * TILE - 2, WALL_RIM);
  setPx(x, H - WALL_THICKNESS * TILE, WALL_RIM);
  setPx(x, H - WALL_THICKNESS * TILE + 1, WALL_RIM);
}
// Top wall topmost highlight — re-establish the torch-catch line
for (let x = 0; x < W; x++) {
  setPx(x, 0, WALL_TOP);
  setPx(x, 1, WALL_TOP);
}

await sharp(buf, { raw: { width: W, height: H, channels: 4 } })
  .png()
  .toFile('../slime-depths-godot/assets/rooms/procedural_dungeon.png');

console.log(`[done] procedural_dungeon.png  (${W}×${H}, ${COLS}×${ROWS} tiles, Flemish-bond brick walls + masonry floor)`);
