// ============================================================================
// HAMLET FLOOR — tilemap renderer using Cainos pixel-art sheets.
//
// Replaces the procedural cobble + dirt + zone painters in hamletScene.js
// with a real tilemap. The hamlet is laid out as a 30×21 grid of 32px
// Cainos tiles, fitting exactly in the existing 960×672 hamlet world
// (= 20×14 game tiles at 48px). Hero physics still operates on the
// 48px game tile grid; only the floor RENDERING uses 32px tiles.
//
// Tiles are referenced by sub-rect into the Cainos texture sheets — no
// per-tile PNG splitting required. The lookup tables below name the
// (sheet, sx, sy) of each tile we use, so editing the tilemap is just
// editing names in TILE_DEFS or the layout function.
// ============================================================================

import { images } from './loader.js';

// Source-tile size in the Cainos sheets.
export const CAINOS_TILE = 32;
// Hamlet floor grid (30×21) sized so the world bounds match the existing
// 960×672 hamlet room exactly. NPC positions and obstacles work unchanged.
export const HAMLET_COLS = 30;
export const HAMLET_ROWS = 21;
export const HAMLET_W = HAMLET_COLS * CAINOS_TILE;   // 960
export const HAMLET_H = HAMLET_ROWS * CAINOS_TILE;   // 672

// ─── TILE LOOKUP ───────────────────────────────────────────────────────────
// Each tile name resolves to { sheet, sx, sy } — the source rect within a
// Cainos sheet. sheet keys are the loader.js image keys (cainos_grass etc).
//
// Variants are arrays so the renderer can pick one deterministically per
// (col, row) for visual variation without obvious tiling.
const T = CAINOS_TILE;
export const TILES = {
  // ── GRASS variants (rows 0-3 of the Grass sheet, cols 0-3 = plain;
  //    cols 4-7 = with debris/flowers).
  grass: [
    { sheet: 'cainos_grass', sx: 0 * T, sy: 0 * T },
    { sheet: 'cainos_grass', sx: 1 * T, sy: 0 * T },
    { sheet: 'cainos_grass', sx: 2 * T, sy: 0 * T },
    { sheet: 'cainos_grass', sx: 3 * T, sy: 0 * T },
    { sheet: 'cainos_grass', sx: 0 * T, sy: 1 * T },
    { sheet: 'cainos_grass', sx: 1 * T, sy: 1 * T },
    { sheet: 'cainos_grass', sx: 2 * T, sy: 1 * T },
    { sheet: 'cainos_grass', sx: 3 * T, sy: 1 * T },
    { sheet: 'cainos_grass', sx: 0 * T, sy: 2 * T },
    { sheet: 'cainos_grass', sx: 1 * T, sy: 2 * T },
    { sheet: 'cainos_grass', sx: 2 * T, sy: 2 * T },
    { sheet: 'cainos_grass', sx: 3 * T, sy: 2 * T },
  ],
  // Grass with subtle bone/flower decorations — used sparingly to add
  // life to the open spaces without making the floor look busy.
  grass_decor: [
    { sheet: 'cainos_grass', sx: 4 * T, sy: 0 * T },
    { sheet: 'cainos_grass', sx: 5 * T, sy: 0 * T },
    { sheet: 'cainos_grass', sx: 6 * T, sy: 0 * T },
    { sheet: 'cainos_grass', sx: 7 * T, sy: 0 * T },
    { sheet: 'cainos_grass', sx: 4 * T, sy: 1 * T },
    { sheet: 'cainos_grass', sx: 5 * T, sy: 1 * T },
    { sheet: 'cainos_grass', sx: 6 * T, sy: 1 * T },
    { sheet: 'cainos_grass', sx: 7 * T, sy: 1 * T },
  ],
  // ── COBBLE PATH (rows 4-7 of the Grass sheet — full cobble blocks
  //    in cols 0-3, partially-grown-over variants in cols 4-7).
  // Pure cobble center — the "this is a path" tile.
  cobble: [
    { sheet: 'cainos_grass', sx: 1 * T, sy: 4 * T },
    { sheet: 'cainos_grass', sx: 2 * T, sy: 4 * T },
    { sheet: 'cainos_grass', sx: 1 * T, sy: 5 * T },
    { sheet: 'cainos_grass', sx: 2 * T, sy: 5 * T },
  ],
  // Cobble breaking down into grass — used at path edges for organic
  // transitions instead of a hard line.
  cobble_worn: [
    { sheet: 'cainos_grass', sx: 4 * T, sy: 5 * T },
    { sheet: 'cainos_grass', sx: 5 * T, sy: 5 * T },
    { sheet: 'cainos_grass', sx: 6 * T, sy: 5 * T },
    { sheet: 'cainos_grass', sx: 7 * T, sy: 5 * T },
    { sheet: 'cainos_grass', sx: 0 * T, sy: 6 * T },
    { sheet: 'cainos_grass', sx: 1 * T, sy: 6 * T },
    { sheet: 'cainos_grass', sx: 2 * T, sy: 6 * T },
    { sheet: 'cainos_grass', sx: 3 * T, sy: 6 * T },
  ],
  // ── STONE PLAZA (Stone Ground sheet — pristine cut stone, used at
  //    the hamlet's center under firepit + portal).
  // The 4×4 block of large stone slabs at (0..3, 0..3) tiles cleanly
  // when placed in a 4×4 group. We pick interchangeable centers from
  // rows 0..3 for the plaza interior + use the full block at edges.
  stone: [
    { sheet: 'cainos_stone_ground', sx: 5 * T, sy: 5 * T },
    { sheet: 'cainos_stone_ground', sx: 6 * T, sy: 5 * T },
    { sheet: 'cainos_stone_ground', sx: 7 * T, sy: 5 * T },
    { sheet: 'cainos_stone_ground', sx: 5 * T, sy: 6 * T },
    { sheet: 'cainos_stone_ground', sx: 6 * T, sy: 6 * T },
    { sheet: 'cainos_stone_ground', sx: 7 * T, sy: 6 * T },
    { sheet: 'cainos_stone_ground', sx: 0 * T, sy: 7 * T },
    { sheet: 'cainos_stone_ground', sx: 1 * T, sy: 7 * T },
    { sheet: 'cainos_stone_ground', sx: 2 * T, sy: 7 * T },
  ],
};

// ─── HASH (deterministic noise) ────────────────────────────────────────────
// Variant picker — each tile coord deterministically picks the same variant
// every frame, so the floor doesn't shimmer between draws.
function hash2(x, y) {
  let n = (x * 374761393) ^ (y * 668265263);
  n = (n ^ (n >>> 13)) >>> 0;
  return ((n * 1274126177) >>> 0) % 0xffff;
}

// ─── HAMLET TILEMAP (procedural) ───────────────────────────────────────────
// Anchor positions for the layout, in tile coords (col, row).
// Centered on the hamlet's NPC anchors so the floor matches where things
// actually are. PLAZA is the central stone block; PATHS radiate to the
// listed POIs.
const PLAZA_CENTER = { col: 15, row: 15 };          // tile world (480, 480)
const PLAZA_HALF_W = 5;                              // ± from center horizontally
const PLAZA_HALF_H = 4;                              // ± from center vertically

// Path destinations — tile (col, row) of each NPC / POI we want a cobble
// path leading to. Hand-tuned to match HAMLET_ENTITIES in hamletScene.js.
const PATH_TARGETS = [
  { col: 15, row: 6  },    // PORTAL (center-north)
  { col: 5,  row: 13 },    // SHRINE (west)
  { col: 5,  row: 12 },    // GRAVEKEEPER (west, north of shrine)
  { col: 7,  row: 18 },    // SMITH (southwest)
  { col: 24, row: 18 },    // ARCHIVIST (southeast)
  { col: 27, row: 13 },    // WANDERER (east)
];
const PATH_HALF_WIDTH = 1;     // tiles each side of the cobble line

// Decide what tile type should occupy (col, row).
// Plaza (stone) > Path (cobble) > Grass (with sparse decoration).
function tileTypeAt(col, row) {
  // PLAZA — central rectangle of stone
  if (
    col >= PLAZA_CENTER.col - PLAZA_HALF_W && col <= PLAZA_CENTER.col + PLAZA_HALF_W &&
    row >= PLAZA_CENTER.row - PLAZA_HALF_H && row <= PLAZA_CENTER.row + PLAZA_HALF_H
  ) {
    return 'stone';
  }
  // COBBLE PATHS — straight lines from plaza center to each anchor.
  // Tile is on a path if it's within PATH_HALF_WIDTH of any path segment.
  for (const target of PATH_TARGETS) {
    if (onPathSegment(col, row, PLAZA_CENTER.col, PLAZA_CENTER.row, target.col, target.row, PATH_HALF_WIDTH)) {
      // Tiles right at the path edge (1 tile away from the line center)
      // get the worn variant for an organic edge transition.
      const distFromCenter = pointToSegmentDist(col, row, PLAZA_CENTER.col, PLAZA_CENTER.row, target.col, target.row);
      return distFromCenter > 0.7 ? 'cobble_worn' : 'cobble';
    }
  }
  // GRASS with sparse decoration. Only ~6% of grass tiles get the
  // decorative variant so the floor stays calm.
  const h = hash2(col, row);
  return (h % 100) < 6 ? 'grass_decor' : 'grass';
}

// True iff (x, y) is within `halfW` tiles of the segment from (x0, y0) → (x1, y1).
function onPathSegment(x, y, x0, y0, x1, y1, halfW) {
  return pointToSegmentDist(x, y, x0, y0, x1, y1) <= halfW;
}

function pointToSegmentDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx, cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

// ─── RENDER ────────────────────────────────────────────────────────────────
// Iterate the 30×21 grid; for each cell pick a tile variant deterministically
// from the type's list and blit the source rect onto the floor.
export function drawHamletFloor(ctx) {
  for (let row = 0; row < HAMLET_ROWS; row++) {
    for (let col = 0; col < HAMLET_COLS; col++) {
      const type = tileTypeAt(col, row);
      const variants = TILES[type];
      if (!variants || variants.length === 0) continue;
      // Deterministic variant pick per coord
      const variant = variants[hash2(col, row) % variants.length];
      const img = images[variant.sheet];
      if (!img) continue;
      ctx.drawImage(
        img,
        variant.sx, variant.sy, CAINOS_TILE, CAINOS_TILE,
        col * CAINOS_TILE, row * CAINOS_TILE, CAINOS_TILE, CAINOS_TILE,
      );
    }
  }
}

// Debug helper — exposes the layout as a printable grid for inspection.
export function debugTileGrid() {
  const symbols = { grass: '.', grass_decor: ',', cobble: 'c', cobble_worn: 'w', stone: 'S' };
  const lines = [];
  for (let r = 0; r < HAMLET_ROWS; r++) {
    let line = '';
    for (let c = 0; c < HAMLET_COLS; c++) line += symbols[tileTypeAt(c, r)] || '?';
    lines.push(line);
  }
  return lines.join('\n');
}
