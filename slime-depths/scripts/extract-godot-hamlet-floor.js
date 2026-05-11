// ============================================================================
// EXTRACT-GODOT-HAMLET-FLOOR — bakes the hamlet hub's grass + path floor
// for the Godot slice. Goal: replace flat-color squares with a richer
// painterly look that still reads at 32-px pixel-art scale.
//
// Layout: 1280×768, 40×24 tiles. Grass base everywhere. Horizontal cobble
// path crosses east-west (3 tiles tall, rows 11-13). Vertical cobble
// spur drops south to the portal at (640, 730) — columns 19-21.
//
// Approach (per-pass):
//   1. Grass base — 5 shades, blob-clustered via low-freq noise so the
//      ground looks like turf instead of static. ~5% grass-tuft pixel
//      clusters scattered for texture.
//   2. Tree-canopy shadow blobs — 4 dark green ellipses in corners,
//      decorative "distant trees" hint.
//   3. Cobblestone path — each ~10-12px polygon is filled with mortar
//      gaps + dark inner shadow + slight color variation per stone +
//      tiny pebbles in the gaps.
//   4. Path edges — dirt border that transitions grass→stone, plus a
//      few grass blades encroaching into the stone for organic feel.
//   5. South-edge portal shadow gradient — subtle darkening near
//      (640, 730) so the portal sits in a slight pool of shadow.
//
// Palette — extends the slime-depths "grass" / hamlet tone (room.js):
//   GRASS_DEEP   #243818  darkest moss / under-canopy shadow
//   GRASS_DARK   #2c4624  rich shadowed grass
//   GRASS_BASE   #3a5a30  midtone — most common cell
//   GRASS_LIT    #4a6a3c  sunlit grass
//   GRASS_DRY    #6a7a44  dry / yellowed patches (rare)
//   GRASS_TUFT   #5a7a3c  bright blade highlight (for tufts)
//   STONE_BASE   #7a6a52  warm sandy cobble
//   STONE_LIT    #8a7a62  sunlit cobble
//   STONE_DARK   #5a4a32  shadowed cobble
//   STONE_RIM    #2c1c10  mortar / outline
//   MORTAR_LIGHT #4a3a2a  soft mortar
//   DIRT_EDGE    #4a3828  path-edge dirt
//   PEBBLE       #8a7a64  small cobble fleck
//   CANOPY       #1c2c10  distant tree-canopy shadow (very dark green)
//   FLOWER_A     #d8b8e0  soft purple wildflower
//   FLOWER_B     #e8d460  gold wildflower
// ============================================================================

import sharp from 'sharp';

const W = 1280, H = 768, TILE = 32;
const COLS = W / TILE, ROWS = H / TILE;

const hex = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];

// ── Grass palette ────────────────────────────────────────────────────
const GRASS_DEEP = hex('#243818');
const GRASS_DARK = hex('#2c4624');
const GRASS_BASE = hex('#3a5a30');
const GRASS_LIT  = hex('#4a6a3c');
const GRASS_DRY  = hex('#6a7a44');
const GRASS_TUFT = hex('#5a7a3c');
// ── Stone palette ────────────────────────────────────────────────────
const STONE_BASE = hex('#7a6a52');
const STONE_LIT  = hex('#8a7a62');
const STONE_DARK = hex('#5a4a32');
const STONE_RIM  = hex('#2c1c10');
const MORTAR     = hex('#4a3a2a');
const DIRT_EDGE  = hex('#4a3828');
const PEBBLE     = hex('#8a7a64');
// ── Decoration palette ───────────────────────────────────────────────
const CANOPY     = hex('#1c2c10');
const FLOWER_A   = hex('#d8b8e0');
const FLOWER_B   = hex('#e8d460');

// Deterministic hash — mirrors slime-depths/src/room.js so the look is reproducible.
function hash(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177 | 0;
  return (h ^ (h >>> 16)) >>> 0;
}

// Two-octave value-noise — gives the "blob-clustered" feel at low cost.
// Coarse blobs (scale 6) modulated by fine detail (scale 2).
function blobNoise(x, y) {
  const cx = Math.floor(x / 6), cy = Math.floor(y / 6);
  const fx = Math.floor(x / 2), fy = Math.floor(y / 2);
  return ((hash(cx, cy) >>> 0) % 100) * 0.7 + ((hash(fx + 1000, fy + 1000) >>> 0) % 100) * 0.3;
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

// Which path region is this pixel in? Used by the grass pass to avoid
// painting tufts where the stone will overwrite them anyway.
function isPathPx(x, y) {
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  if (ty >= 11 && ty <= 13) return true;          // horizontal path
  if (tx >= 19 && tx <= 21 && ty >= 11) return true; // vertical spur
  return false;
}

// ── Pass 1: grass base — blob-clustered shades per pixel ─────────────
// Per-pixel noise into 5 buckets. The blob noise function clusters
// nearby pixels into the same shade so it reads as turf, not static.
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const n = blobNoise(x, y);
    let color = GRASS_BASE;
    if      (n < 12) color = GRASS_DEEP;
    else if (n < 32) color = GRASS_DARK;
    else if (n < 70) color = GRASS_BASE;
    else if (n < 90) color = GRASS_LIT;
    else             color = GRASS_DRY;
    setPx(x, y, color);
  }
}

// ── Pass 2: grass tufts — 3-4 pixel L-shapes, ~5% of grass cells ─────
// L-shaped clusters give "blade group" silhouette much better than
// scattered single pixels.
for (let ty = 0; ty < ROWS; ty++) {
  for (let tx = 0; tx < COLS; tx++) {
    const h = hash(tx, ty);
    if ((h >>> 4) % 100 >= 5) continue;
    // Pick a sub-pixel inside the tile, biased toward not-on-the-edge
    const cx = tx * TILE + 4 + ((h >>> 8) % 24);
    const cy = ty * TILE + 4 + ((h >>> 14) % 24);
    if (isPathPx(cx, cy)) continue;
    // L-shape variations (4 orientations)
    const variant = (h >>> 20) & 3;
    const tuftColor = ((h >>> 22) & 1) ? GRASS_TUFT : GRASS_LIT;
    if (variant === 0)      { setPx(cx, cy, tuftColor); setPx(cx + 1, cy, tuftColor); setPx(cx, cy - 1, tuftColor); setPx(cx + 1, cy + 1, GRASS_DARK); }
    else if (variant === 1) { setPx(cx, cy, tuftColor); setPx(cx - 1, cy, tuftColor); setPx(cx, cy - 1, tuftColor); setPx(cx - 1, cy + 1, GRASS_DARK); }
    else if (variant === 2) { setPx(cx, cy, tuftColor); setPx(cx + 1, cy, tuftColor); setPx(cx, cy + 1, tuftColor); setPx(cx - 1, cy - 1, GRASS_DARK); }
    else                    { setPx(cx, cy, tuftColor); setPx(cx - 1, cy, tuftColor); setPx(cx, cy + 1, tuftColor); setPx(cx + 1, cy - 1, GRASS_DARK); }
    // 25% chance a wildflower sits on this tuft
    if ((h >>> 24) % 100 < 25) {
      const flower = ((h >>> 25) & 1) ? FLOWER_A : FLOWER_B;
      setPx(cx, cy - 2, flower);
    }
  }
}

// ── Pass 3: distant tree-canopy shadows (decorative ellipses) ────────
// 4 dark green ellipses in corners — gives a sense of forest edges
// without painting actual trees that would block the playable space.
function paintEllipseSoft(cx, cy, rx, ry, color, maxAlpha = 0.55) {
  for (let dy = -ry; dy <= ry; dy++) {
    for (let dx = -rx; dx <= rx; dx++) {
      const d = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry);
      if (d > 1) continue;
      // Soft falloff to feather the edge
      const alpha = maxAlpha * Math.max(0, 1 - Math.pow(d, 0.7));
      // Don't darken the cobble paths
      if (isPathPx(cx + dx, cy + dy)) continue;
      blendPx(cx + dx, cy + dy, color, alpha);
    }
  }
}
// Corners only — keeps mid-map walkable + open
paintEllipseSoft(140, 110, 90, 50, CANOPY, 0.55);
paintEllipseSoft(1130, 90, 110, 55, CANOPY, 0.55);
paintEllipseSoft(180, 690, 80, 45, CANOPY, 0.50);
paintEllipseSoft(1110, 700, 100, 50, CANOPY, 0.50);

// ── Pass 4: cobblestone path ─────────────────────────────────────────
// A "cobble" is an irregular ~10-14px polygon. We generate cobble cells
// as a 12px grid with hash-jittered centroids, then for each pixel in
// the path region we pick the nearest centroid (Voronoi-ish). Mortar
// pixels are the boundaries between neighbors. Inner cobble color is
// hash-varied per-cell.
const COBBLE_PITCH = 12;
function cobbleCenterFor(gx, gy) {
  const h = hash(gx + 7000, gy + 7000);
  const jx = ((h >>> 0) % 7) - 3;     // -3..+3
  const jy = ((h >>> 8) % 7) - 3;
  return [gx * COBBLE_PITCH + COBBLE_PITCH / 2 + jx, gy * COBBLE_PITCH + COBBLE_PITCH / 2 + jy];
}
function cobbleColorFor(gx, gy) {
  const h = hash(gx + 7000, gy + 7000);
  const r = h % 100;
  if (r < 25) return STONE_DARK;
  if (r < 45) return STONE_LIT;
  return STONE_BASE;
}

function paintCobblePixel(px, py) {
  // Which 12-px cobble grid cell are we in (roughly)?
  const gx0 = Math.floor(px / COBBLE_PITCH);
  const gy0 = Math.floor(py / COBBLE_PITCH);
  // Find nearest centroid among the 3×3 neighborhood
  let best = Infinity, bestGx = gx0, bestGy = gy0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const [cx, cy] = cobbleCenterFor(gx0 + dx, gy0 + dy);
      const d = (cx - px) * (cx - px) + (cy - py) * (cy - py);
      if (d < best) { best = d; bestGx = gx0 + dx; bestGy = gy0 + dy; }
    }
  }
  // Second-best distance — if very close to first, we're on a mortar boundary
  let second = Infinity;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (gx0 + dx === bestGx && gy0 + dy === bestGy) continue;
      const [cx, cy] = cobbleCenterFor(gx0 + dx, gy0 + dy);
      const d = (cx - px) * (cx - px) + (cy - py) * (cy - py);
      if (d < second) second = d;
    }
  }
  const isMortar = (Math.sqrt(second) - Math.sqrt(best)) < 1.2;
  const baseColor = cobbleColorFor(bestGx, bestGy);
  if (isMortar) {
    // Pick mortar dark-vs-light by proximity — outer rim is darker
    setPx(px, py, ((Math.sqrt(second) - Math.sqrt(best)) < 0.4) ? STONE_RIM : MORTAR);
  } else {
    // Slight inner-shadow on the south/east edges of each cobble for relief
    const [cx, cy] = cobbleCenterFor(bestGx, bestGy);
    const onShadowSide = (px - cx) > 1 || (py - cy) > 1;
    const dist = Math.sqrt(best);
    if (onShadowSide && dist > COBBLE_PITCH * 0.32) {
      setPx(px, py, STONE_DARK);
    } else {
      setPx(px, py, baseColor);
    }
  }
}

// Horizontal path: rows 11-13 → y 352..447
for (let y = 11 * TILE; y < 14 * TILE; y++) {
  for (let x = 0; x < W; x++) {
    paintCobblePixel(x, y);
  }
}
// Vertical spur: columns 19-21 → x 608..703, rows 14..ROWS
for (let y = 14 * TILE; y < H; y++) {
  for (let x = 19 * TILE; x < 22 * TILE; x++) {
    paintCobblePixel(x, y);
  }
}
// Fill the small intersection square (cols 19-21 × rows 11-13) — already done
// in the horizontal pass since y is in range; vertical only starts row 14.

// ── Pass 5: pebbles in mortar gaps ───────────────────────────────────
// Small bright flecks at mortar intersections — keep density low.
for (let gy = 0; gy < H / COBBLE_PITCH; gy++) {
  for (let gx = 0; gx < W / COBBLE_PITCH; gx++) {
    const h = hash(gx + 11000, gy + 11000);
    if (h % 100 >= 12) continue;
    const [cx, cy] = cobbleCenterFor(gx, gy);
    // Offset slightly toward a neighbor so the pebble lands in a gap
    const ox = ((h >>> 8) % 5) - 2;
    const oy = ((h >>> 12) % 5) - 2;
    const px = cx + ox + 4, py = cy + oy + 4;
    if (!isPathPx(px, py)) continue;
    setPx(px, py, PEBBLE);
  }
}

// ── Pass 6: path edges — dirt border + grass encroachment ─────────────
// 1-2 px dirt-color line on grass-side of the path; plus occasional
// grass blades poking into the stone for an organic transition.
function paintDirtEdge(x, y) {
  const cur = getPx(x, y);
  if (!cur) return;
  // Only paint if this pixel is currently grass (don't overwrite stone)
  const isGrass = cur[0] < 110 && cur[1] > cur[0]; // grass colors are green-dominant
  if (!isGrass) return;
  setPx(x, y, DIRT_EDGE);
}
// Horizontal path edges
for (let x = 0; x < W; x++) {
  paintDirtEdge(x, 11 * TILE - 1);
  paintDirtEdge(x, 11 * TILE - 2);
  paintDirtEdge(x, 14 * TILE);
  paintDirtEdge(x, 14 * TILE + 1);
}
// Vertical spur edges (only south of intersection)
for (let y = 14 * TILE; y < H; y++) {
  paintDirtEdge(19 * TILE - 1, y);
  paintDirtEdge(19 * TILE - 2, y);
  paintDirtEdge(22 * TILE, y);
  paintDirtEdge(22 * TILE + 1, y);
}
// Grass encroachment — short blades poking into the stone, deterministic per col
for (let x = 0; x < W; x += 7) {
  const h = hash(x, 999);
  if (h % 100 < 30) {
    setPx(x, 11 * TILE, GRASS_LIT);
    setPx(x, 11 * TILE + 1, GRASS_DARK);
  }
  if ((h >>> 8) % 100 < 30) {
    setPx(x, 14 * TILE - 1, GRASS_LIT);
    setPx(x, 14 * TILE - 2, GRASS_DARK);
  }
}

// ── Pass 7: south-edge portal shadow ─────────────────────────────────
// Subtle darkening around the portal landing at (640, 730) — gives the
// portal a place to sit visually without painting anything that would
// be obscured by the portal sprite itself.
function paintPortalShadow(cx, cy, rx, ry, alpha) {
  for (let dy = -ry; dy <= ry; dy++) {
    for (let dx = -rx; dx <= rx; dx++) {
      const d = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry);
      if (d > 1) continue;
      const a = alpha * Math.max(0, 1 - Math.pow(d, 0.6));
      blendPx(cx + dx, cy + dy, [10, 6, 4], a);
    }
  }
}
paintPortalShadow(640, 720, 150, 50, 0.35);

await sharp(buf, { raw: { width: W, height: H, channels: 4 } })
  .png()
  .toFile('../slime-depths-godot/assets/rooms/hamlet_floor.png');

console.log(`[done] hamlet_floor.png  (${W}×${H}, grass + cobble path layout, 7 passes)`);
