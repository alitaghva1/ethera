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
  // (cobble + cobble_worn tile sets removed — paths now use the same
  // stone tiles as the plaza for visual unity. Those tiles read as
  // "cobble decoration scattered in grass" not "path edge transitions",
  // so they fought with the plaza visually.)
  // ── STONE PLAZA — ONE tile, no variants. The Cainos auto-tile blocks
  // each contain tiles with DIFFERENT internal grout patterns at slightly
  // different positions; picking variants randomly produces visible seams
  // where the internal patterns don't align. Solution: single tile,
  // perfect repetition. Rich-looking auto-tile transitions with corners
  // and edges will land when we implement true 9-slice tiling — a
  // separate pass.
  stone: [
    { sheet: 'cainos_stone_ground', sx: 1 * T, sy: 1 * T },
  ],
  // ── COBBLE PATH — same approach: one tile only. Picked from the
  // interior of the cobble auto-tile block in the Grass sheet
  // (cols 0-3, rows 4-7). Repeated everywhere a path tile is needed.
  cobble: [
    { sheet: 'cainos_grass', sx: 1 * T, sy: 5 * T },
  ],
  // ── WALL 9-SLICE AUTOTILE ─────────────────────────────────────────
  // Sourced from the small-frame block at cols 0-3 rows 0-3 of TX
  // Tileset Wall.png. The 9 pieces tile around any walkable shape:
  //
  //   row 0:  TL  N   N   TR
  //   row 1:  W   .   .   E
  //   row 2:  W   .   .   E
  //   row 3:  SW  S   S   SE
  //
  // The interior (cols 1-2 rows 1-2) is hollow (transparent) so we
  // can't use it as body fill — the long-body band at rows 5-7 of the
  // sheet provides actual body brick if we ever need it (inner corners
  // or weird neighbor patterns fall through to `wall_body`).
  wall_corner_nw: [{ sheet: 'cainos_wall', sx: 0 * T, sy: 0 * T }],
  wall_corner_ne: [{ sheet: 'cainos_wall', sx: 3 * T, sy: 0 * T }],
  wall_corner_sw: [{ sheet: 'cainos_wall', sx: 0 * T, sy: 3 * T }],
  wall_corner_se: [{ sheet: 'cainos_wall', sx: 3 * T, sy: 3 * T }],
  wall_edge_n: [
    { sheet: 'cainos_wall', sx: 1 * T, sy: 0 * T },
    { sheet: 'cainos_wall', sx: 2 * T, sy: 0 * T },
  ],
  wall_edge_s: [
    { sheet: 'cainos_wall', sx: 1 * T, sy: 3 * T },
    { sheet: 'cainos_wall', sx: 2 * T, sy: 3 * T },
  ],
  wall_edge_w: [
    { sheet: 'cainos_wall', sx: 0 * T, sy: 1 * T },
    { sheet: 'cainos_wall', sx: 0 * T, sy: 2 * T },
  ],
  wall_edge_e: [
    { sheet: 'cainos_wall', sx: 3 * T, sy: 1 * T },
    { sheet: 'cainos_wall', sx: 3 * T, sy: 2 * T },
  ],
  // Body brick fill — only used when neighbor pattern doesn't match a
  // 9-slice piece (inner corners, surrounded tiles). 4 variants from
  // the long-body band (rows 6-7 at cols 1-4 of the sheet).
  wall_body: [
    { sheet: 'cainos_wall', sx: 1 * T, sy: 6 * T },
    { sheet: 'cainos_wall', sx: 2 * T, sy: 6 * T },
    { sheet: 'cainos_wall', sx: 3 * T, sy: 6 * T },
    { sheet: 'cainos_wall', sx: 4 * T, sy: 6 * T },
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

// ─── HAMLET LAYOUT — ZONE-BASED IRREGULAR SILHOUETTE ─────────────────────
// Replaces the previous "single rectangular plaza + radial paths" model
// with a multi-zone layout that mirrors the Cainos Scene Overview's design
// logic: distinct districts connected by paths through grass, with an
// irregular outer boundary instead of a rectangular room.
//
// Stage 1 — five zones laid out on a 30×21 grid:
//
//   row 1-5   ┌──────┐                      <- NORTH SHRINE (raised in S3)
//   row 6                                   <- grass corridor (stairs in S3)
//   row 7-12  ┌───────┐  ┌─────┐  ┌──────┐  <- WEST RUIN, CENTRAL PLAZA, EAST WORKSHOP
//   row 13-18                               <- grass corridor / SOUTH connector
//   row 19-20      ┌─────┐                  <- SOUTH ENTRANCE (gateway pad)
//
// The outer silhouette is the union of the zones + the grass corridors
// connecting them. Tiles outside that union render as void (non-walkable).
//
// Stage 2 — paths (baked into TERRAIN_GRID at module load):
//   south_entrance → central_plaza         (main artery)
//   central_plaza → north_shrine           (north spine)
//   central_plaza → east_workshop          (east spur)
//   central_plaza → west_ruin              (west spur)
//
// Each zone is a `{ col, row, w, h, terrain, name }` rectangle. `terrain`
// declares the zone's interior fill (stone for finished, grass for raw).

const ZONES = [
  // CENTRAL PLAZA — visual anchor, where fountain/portal/firepit/keeper/oracle
  // sit. 9×6 (was 7×5) so there's room for fountain centerpiece + benches +
  // 2 NPCs without crowding.
  { name: 'central_plaza', col: 11, row: 9,  w: 9, h: 6, terrain: 'stone' },
  // NORTH SHRINE — raised platform in Stage C, containing the shrine.
  // Slightly off-center to break the symmetric look.
  { name: 'north_shrine',  col: 13, row: 1,  w: 5, h: 4, terrain: 'stone' },
  // WEST RUIN — broken courtyard for the gravekeeper / curses. 7×5 (was
  // 6×4) so 6+ gravestones + arch + statue cluster without overlap.
  { name: 'west_ruin',     col: 2,  row: 7,  w: 7, h: 5, terrain: 'stone' },
  // EAST WORKSHOP — trade / archive district. 7×5 (was 6×4) for crate
  // stacks + barrels + sign post layout.
  { name: 'east_workshop', col: 21, row: 7,  w: 7, h: 5, terrain: 'stone' },
  // SOUTH ENTRANCE — gateway pad, hero spawn, exit back to menu. 5×4
  // (was 5×3) so lanterns can flank inside the zone instead of in void.
  { name: 'south_entrance',col: 13, row: 16, w: 5, h: 4, terrain: 'stone' },
  // HERB GARDEN — small NW alcove for visual asymmetry. The gravekeeper's
  // private patch — bushes + grass-decor flowers + a pebble cluster. Adds
  // a jutty bit to the silhouette so it's not 4 zones in a precise cross.
  { name: 'herb_garden',   col: 8,  row: 4,  w: 4, h: 3, terrain: 'grass' },
];

// Path segments — each connects two zones via an axis-aligned route.
// Drawn as 2-tile-wide stone bands overlaying whatever was below.
const PATH_SEGMENTS = [
  // SOUTH entrance → CENTRAL plaza (vertical corridor through middle)
  { ax: 15, ay: 16, bx: 15, by: 15 },
  // CENTRAL plaza → NORTH shrine (vertical corridor through middle)
  { ax: 15, ay: 9,  bx: 15, by: 5 },
  // CENTRAL plaza → EAST workshop (horizontal corridor)
  { ax: 20, ay: 10, bx: 21, by: 10 },
  // CENTRAL plaza → WEST ruin (horizontal corridor)
  { ax: 11, ay: 10, bx: 9,  by: 10 },
  // (herb_garden intentionally has NO stone path — reached via grass
  // through west_connector from west_ruin, keeping its garden character.)
];
const PATH_HALF_WIDTH = 1;     // 3 tiles wide total (col-1 .. col+1)

// Grass corridors — areas of WALKABLE grass connecting adjacent zones,
// even where there's no stone path. These define the irregular outer
// silhouette: any tile inside ANY corridor or any zone is walkable; all
// other tiles render as void.
const GRASS_CORRIDORS = [
  // Vertical corridor down the middle (south entrance → plaza → shrine).
  // Wider (11) so grass dominates over stone — matches the demo's
  // "grass with stone paths" feel rather than "stone with grass spots."
  { col: 10, row: 5,  w: 11, h: 12 },
  // Horizontal corridor (west_ruin ↔ plaza ↔ east_workshop). Taller (8)
  // for the same reason.
  { col: 5,  row: 7,  w: 23, h: 8 },
  // South spur extending below south_entrance (gateway approach).
  { col: 13, row: 19, w: 5, h: 2 },
  // West connector — herb_garden ↔ west_ruin link via grass column.
  { col: 5,  row: 5,  w: 4, h: 3 },
];

// ─── PRECOMPUTED GRIDS ────────────────────────────────────────────────────
// Built once at module load from ZONES + PATH_SEGMENTS + GRASS_CORRIDORS.
// `WALKABLE_GRID[row][col] = true` iff the tile is part of the hamlet
// (not void). `TERRAIN_GRID[row][col] = 'grass'|'stone'|'cobble'|'void'`.
const WALKABLE_GRID = [];
const TERRAIN_GRID = [];
(function buildGrids() {
  for (let r = 0; r < HAMLET_ROWS; r++) {
    WALKABLE_GRID.push(new Array(HAMLET_COLS).fill(false));
    TERRAIN_GRID.push(new Array(HAMLET_COLS).fill('void'));
  }
  // Pass 1: grass corridors define the basic walkable footprint
  for (const c of GRASS_CORRIDORS) {
    for (let r = c.row; r < c.row + c.h && r < HAMLET_ROWS; r++) {
      for (let x = c.col; x < c.col + c.w && x < HAMLET_COLS; x++) {
        if (r < 0 || x < 0) continue;
        WALKABLE_GRID[r][x] = true;
        TERRAIN_GRID[r][x] = 'grass';
      }
    }
  }
  // Pass 2: zones overwrite their footprint with their terrain
  for (const z of ZONES) {
    for (let r = z.row; r < z.row + z.h && r < HAMLET_ROWS; r++) {
      for (let x = z.col; x < z.col + z.w && x < HAMLET_COLS; x++) {
        if (r < 0 || x < 0) continue;
        WALKABLE_GRID[r][x] = true;
        TERRAIN_GRID[r][x] = z.terrain;
      }
    }
  }
  // Pass 3: paths bake stone tiles where they cross grass (zones already
  // have stone, so this is effectively grass→cobble path conversion)
  for (const p of PATH_SEGMENTS) {
    const dx = Math.sign(p.bx - p.ax), dy = Math.sign(p.by - p.ay);
    let cx = p.ax, cy = p.ay;
    while (true) {
      for (let oy = -PATH_HALF_WIDTH; oy <= PATH_HALF_WIDTH; oy++) {
        for (let ox = -PATH_HALF_WIDTH; ox <= PATH_HALF_WIDTH; ox++) {
          const tx = cx + ox, ty = cy + oy;
          if (tx < 0 || ty < 0 || tx >= HAMLET_COLS || ty >= HAMLET_ROWS) continue;
          if (!WALKABLE_GRID[ty][tx]) continue;          // don't paint void
          // Convert grass tiles along the path to stone (paving extends);
          // already-stone tiles (zones) stay stone.
          if (TERRAIN_GRID[ty][tx] === 'grass') TERRAIN_GRID[ty][tx] = 'stone';
        }
      }
      if (cx === p.bx && cy === p.by) break;
      cx += dx; cy += dy;
    }
  }
})();

// True iff the tile (col, row) is part of the hamlet's walkable area.
// Used by the wall-detection logic (walls go on void tiles ADJACENT to
// walkable) and by hero collision via isHamletWalkable below.
function isWalkable(col, row) {
  if (col < 0 || row < 0 || col >= HAMLET_COLS || row >= HAMLET_ROWS) return false;
  return WALKABLE_GRID[row][col];
}

// World-space walkability for collision. (worldX, worldY) → tile, then
// checks the grid. Hero is bounded by this, plus the existing prop circles.
export function isHamletWalkable(worldX, worldY) {
  const col = Math.floor(worldX / CAINOS_TILE);
  const row = Math.floor(worldY / CAINOS_TILE);
  return isWalkable(col, row);
}

// Decide what tile type should occupy (col, row). Now reads from the
// precomputed terrain grid instead of computing geometry per-frame.
function tileTypeAt(col, row) {
  const t = TERRAIN_GRID[row]?.[col];
  if (!t || t === 'void') return null;     // outside silhouette — don't render
  if (t === 'grass') {
    // ~6% of grass tiles get the decorative variant for sparse life
    const h = hash2(col, row);
    return (h % 100) < 6 ? 'grass_decor' : 'grass';
  }
  return t;
}


// ─── WALL DETECTION — 9-SLICE AUTOTILE FOR IRREGULAR SILHOUETTE ───────
// A wall lives on any VOID tile that has at least one orthogonally-
// adjacent walkable tile. The specific variant comes from the 4-bit
// neighbor walkability mask (N=1, E=2, S=4, W=8):
//
//   single neighbor walkable → that face becomes an EDGE tile
//   two adjacent neighbors walkable → corner tile (NW/NE/SW/SE)
//   three neighbors walkable → inner corner (rare; falls through to body)
//
// Which corner depends on which two neighbors are walkable:
//   E + S walkable → wall is at the NW void of a walkable platform → CORNER NW
//   S + W walkable → CORNER NE
//   N + E walkable → CORNER SW
//   N + W walkable → CORNER SE
//
// This produces full perimeter walls on ALL four sides of every zone
// + irregular silhouette, with the right corner pieces bridging
// edges. Compared to the old N-only wall band, this gives every zone
// the "walled compound" look from the Cainos demo.

function getWallVariant(col, row) {
  if (isWalkable(col, row)) return null;
  const N = isWalkable(col, row - 1);
  const E = isWalkable(col + 1, row);
  const S = isWalkable(col, row + 1);
  const W = isWalkable(col - 1, row);
  let key;
  if (N || E || S || W) {
    // Has orthogonal walkable → standard 9-slice classification.
    const mask = (N ? 1 : 0) | (E ? 2 : 0) | (S ? 4 : 0) | (W ? 8 : 0);
    switch (mask) {
      case 4:  key = 'wall_edge_n';   break;   // S walkable → wall is N-edge
      case 1:  key = 'wall_edge_s';   break;   // N walkable → wall is S-edge
      case 2:  key = 'wall_edge_w';   break;   // E walkable → wall is W-edge
      case 8:  key = 'wall_edge_e';   break;   // W walkable → wall is E-edge
      case 6:  key = 'wall_corner_nw'; break;  // E+S walkable → NW void corner
      case 12: key = 'wall_corner_ne'; break;  // S+W walkable → NE void corner
      case 3:  key = 'wall_corner_sw'; break;  // N+E walkable → SW void corner
      case 9:  key = 'wall_corner_se'; break;  // N+W walkable → SE void corner
      default: key = 'wall_body';              // inner corners / surrounded
    }
  } else {
    // No orthogonal walkable — check diagonals for outer corners. This
    // happens at the diagonal-NW void of a rectangular zone's NW corner
    // (e.g. col 1 row 6 outside west_ruin's NW corner at col 2 row 7).
    const NE = isWalkable(col + 1, row - 1);
    const NW = isWalkable(col - 1, row - 1);
    const SE = isWalkable(col + 1, row + 1);
    const SW = isWalkable(col - 1, row + 1);
    if (SE && !SW && !NE && !NW) key = 'wall_corner_nw';
    else if (SW && !SE && !NE && !NW) key = 'wall_corner_ne';
    else if (NE && !NW && !SE && !SW) key = 'wall_corner_sw';
    else if (NW && !NE && !SE && !SW) key = 'wall_corner_se';
    else return null;                          // not a wall, just void
  }
  const variants = TILES[key];
  return variants[hash2(col, row) % variants.length];
}

// ─── PROPS ─────────────────────────────────────────────────────────────────
// World-positioned sprites blitted from the Cainos prop / plant sheets.
// Each prop declares { sheet, sx, sy, sw, sh, x, y } where (x, y) is the
// world position of the prop's BOTTOM-CENTER (= its "feet" touching the
// floor, like every other entity in the game).
//
// First pass: a fountain at the plaza center, 3 trees lining the back of
// the hamlet, a cluster of bushes near each ruin corner. Designed to
// gesture at the Scene Overview's "walled compound with greenery" feel
// without trying to replicate it tile-for-tile.
const PT = 32;     // texture tile unit (Cainos sheets use 32px)

// All entries are organized BY ZONE so it's clear-as-day where each prop
// belongs and what its job is. Every (x, y) is verified against the
// WALKABLE_GRID + TERRAIN_GRID below at module load via the assertProps
// helper — fail loudly in dev if a prop ever lands on the wrong terrain.
const HAMLET_PROPS = [
  // ══════════════════════════════════════════════════════════════════════
  // CENTRAL PLAZA (cols 11-19, rows 9-14) — the visual heart of the hub.
  // Fountain centerpiece + 2 benches facing inward + 2 corner lanterns.
  // ══════════════════════════════════════════════════════════════════════

  // Fountain — the round 4×3 fountain at plaza center, anchor row 14.
  // Hero collision via HAMLET_OBSTACLES (r=38 around the same point).
  { sheet: 'cainos_props', sx: 11 * PT, sy: 8 * PT, sw: 4 * PT, sh: 3 * PT,
    x: 496, y: 448, scale: 1.0 },

  // Two stone-slab benches south of fountain, facing inward. Using the
  // 3×2 sofa/bench sprite (sx=192 sy=0 — the long horizontal bench at
  // cols 6-8 rows 0-1 of TX Props). Old coords (288, 32) pulled a piece
  // of the standing-stone area — this is the actual bench sprite.
  { sheet: 'cainos_props', sx: 6 * PT, sy: 0 * PT, sw: 3 * PT, sh: 2 * PT,
    x: 400, y: 480, scale: 1.0 },
  { sheet: 'cainos_props', sx: 6 * PT, sy: 0 * PT, sw: 3 * PT, sh: 2 * PT,
    x: 592, y: 480, scale: 1.0 },

  // Two corner lanterns at the plaza's NW + NE corners.
  { sheet: 'cainos_props', sx: 11 * PT, sy: 6 * PT, sw: PT, sh: 2 * PT,
    x: 368, y: 384, scale: 1.0 },
  { sheet: 'cainos_props', sx: 11 * PT, sy: 6 * PT, sw: PT, sh: 2 * PT,
    x: 624, y: 384, scale: 1.0 },

  // ══════════════════════════════════════════════════════════════════════
  // NORTH SHRINE (cols 13-17, rows 1-4) — sacred ring under priestess +
  // priestess statue + 2 flanking lanterns. Stage C will raise this to
  // elevation 1.
  // ══════════════════════════════════════════════════════════════════════

  // Stone halo / ring on the floor — drawn FIRST so the priestess kneels
  // on it. 2×2 prop from the bottom-right "ruin halo" area of TX Props.
  { sheet: 'cainos_props', sx: 13 * PT, sy: 11 * PT, sw: 2 * PT, sh: 2 * PT,
    x: 496, y: 144, scale: 1.0 },

  // Kneeling priestess statue — 1×4 at col 10 of TX Props (sx=320 sy=0).
  // Old coords (sx=448 sy=32) were pulling pixels from the altar/sign
  // area — this is the actual priestess sprite per visual confirmation.
  { sheet: 'cainos_props', sx: 10 * PT, sy: 0 * PT, sw: PT, sh: 4 * PT,
    x: 496, y: 144, scale: 1.0 },

  // Two lanterns flanking the statue.
  { sheet: 'cainos_props', sx: 11 * PT, sy: 6 * PT, sw: PT, sh: 2 * PT,
    x: 432, y: 144, scale: 1.0 },
  { sheet: 'cainos_props', sx: 11 * PT, sy: 6 * PT, sw: PT, sh: 2 * PT,
    x: 560, y: 144, scale: 1.0 },

  // ══════════════════════════════════════════════════════════════════════
  // WEST RUIN / GRAVEYARD (cols 2-8, rows 7-11) — gravekeeper's district.
  // 3 large gravestones + 3 cross headstones + 1 standing stone.
  // ══════════════════════════════════════════════════════════════════════

  // Three large 2×2 gravestones, each a different sheet variant.
  { sheet: 'cainos_props', sx: 7 * PT, sy: 5 * PT, sw: 2 * PT, sh: 2 * PT,
    x: 112, y: 288, scale: 1.0 },
  { sheet: 'cainos_props', sx: 7 * PT, sy: 7 * PT, sw: 2 * PT, sh: 2 * PT,
    x: 224, y: 288, scale: 1.0 },
  { sheet: 'cainos_props', sx: 7 * PT, sy: 10 * PT, sw: 2 * PT, sh: 2 * PT,
    x: 176, y: 352, scale: 1.0 },

  // Three small cross headstones (1×1 each).
  { sheet: 'cainos_props', sx: 7 * PT, sy: 9 * PT, sw: PT, sh: PT,
    x: 80, y: 320, scale: 1.0 },
  { sheet: 'cainos_props', sx: 7 * PT, sy: 9 * PT, sw: PT, sh: PT,
    x: 240, y: 352, scale: 1.0 },
  { sheet: 'cainos_props', sx: 7 * PT, sy: 9 * PT, sw: PT, sh: PT,
    x: 144, y: 320, scale: 1.0 },

  // Standing stone at NW corner — taller silhouette anchors the ruin.
  { sheet: 'cainos_props', sx: 9 * PT, sy: 0 * PT, sw: PT, sh: 3 * PT,
    x: 80, y: 256, scale: 1.0 },

  // ══════════════════════════════════════════════════════════════════════
  // EAST WORKSHOP / ARCHIVE (cols 21-27, rows 7-11) — trade district.
  // 2 crate stacks + 3 barrels + vase + sign post.
  // ══════════════════════════════════════════════════════════════════════

  { sheet: 'cainos_props', sx: 3 * PT, sy: 0 * PT, sw: 2 * PT, sh: 2 * PT,
    x: 720, y: 288, scale: 1.0 },
  { sheet: 'cainos_props', sx: 3 * PT, sy: 0 * PT, sw: 2 * PT, sh: 2 * PT,
    x: 816, y: 288, scale: 1.0 },
  { sheet: 'cainos_props', sx: 4 * PT, sy: 4 * PT, sw: PT, sh: PT,
    x: 720, y: 336, scale: 1.0 },
  { sheet: 'cainos_props', sx: 4 * PT, sy: 4 * PT, sw: PT, sh: PT,
    x: 848, y: 336, scale: 1.0 },
  { sheet: 'cainos_props', sx: 4 * PT, sy: 4 * PT, sw: PT, sh: PT,
    x: 784, y: 304, scale: 1.0 },
  { sheet: 'cainos_props', sx: 4 * PT, sy: 5 * PT, sw: PT, sh: PT,
    x: 784, y: 336, scale: 1.0 },
  { sheet: 'cainos_props', sx: 3 * PT, sy: 4 * PT, sw: PT, sh: 2 * PT,
    x: 880, y: 352, scale: 1.0 },

  // Sign post advertising the workshop, NW corner.
  { sheet: 'cainos_props', sx: 3 * PT, sy: 4 * PT, sw: PT, sh: 2 * PT,
    x: 688, y: 352, scale: 1.0 },

  // ══════════════════════════════════════════════════════════════════════
  // SOUTH ENTRANCE (cols 13-17, rows 16-19) — gateway pad, hero spawn.
  // 2 lanterns flanking the entrance lane (centered inside the zone now,
  // not in void at cols 8/21 like before) + welcome sign post.
  // ══════════════════════════════════════════════════════════════════════

  { sheet: 'cainos_props', sx: 11 * PT, sy: 6 * PT, sw: PT, sh: 2 * PT,
    x: 432, y: 608, scale: 1.0 },
  { sheet: 'cainos_props', sx: 11 * PT, sy: 6 * PT, sw: PT, sh: 2 * PT,
    x: 560, y: 608, scale: 1.0 },

  // Welcome sign post (1×2) — at col 14 row 18 area, gateway approach.
  { sheet: 'cainos_props', sx: 3 * PT, sy: 4 * PT, sw: PT, sh: 2 * PT,
    x: 464, y: 624, scale: 1.0 },

  // ══════════════════════════════════════════════════════════════════════
  // HERB GARDEN (cols 8-11, rows 4-6) — small NW alcove, gravekeeper's
  // private patch. 3 bushes scattered.
  // ══════════════════════════════════════════════════════════════════════

  { sheet: 'cainos_plant', sx: 0 * PT, sy: 5 * PT, sw: PT, sh: PT,
    x: 272, y: 192, scale: 1.0 },
  { sheet: 'cainos_plant', sx: 2 * PT, sy: 5 * PT, sw: PT, sh: PT,
    x: 336, y: 192, scale: 1.0 },
  { sheet: 'cainos_plant', sx: 1 * PT, sy: 5 * PT, sw: PT, sh: PT,
    x: 304, y: 224, scale: 1.0 },

  // Squat rock cluster (3×1 at sx=256 sy=480) — adds organic stone to
  // the garden's floor. Sits at the south edge of the herb garden.
  { sheet: 'cainos_props', sx: 8 * PT, sy: 15 * PT, sw: 3 * PT, sh: PT,
    x: 304, y: 192, scale: 1.0 },

  // ══════════════════════════════════════════════════════════════════════
  // TREES — strictly on grass corridor tiles, never on stone or in void.
  // 6 trees distributed across the 3 main grass spans.
  // ══════════════════════════════════════════════════════════════════════

  { sheet: 'cainos_plant', sx: 0 * PT, sy: 0 * PT, sw: 3 * PT, sh: 4 * PT,
    x: 368, y: 256, scale: 1.0 },
  { sheet: 'cainos_plant', sx: 4 * PT, sy: 0 * PT, sw: 4 * PT, sh: 4 * PT,
    x: 592, y: 256, scale: 1.0 },
  { sheet: 'cainos_plant', sx: 0 * PT, sy: 0 * PT, sw: 3 * PT, sh: 4 * PT,
    x: 208, y: 448, scale: 1.0 },
  { sheet: 'cainos_plant', sx: 9 * PT, sy: 0 * PT, sw: 3 * PT, sh: 4 * PT,
    x: 848, y: 448, scale: 1.0 },
  { sheet: 'cainos_plant', sx: 0 * PT, sy: 0 * PT, sw: 3 * PT, sh: 4 * PT,
    x: 400, y: 512, scale: 1.0 },
  { sheet: 'cainos_plant', sx: 9 * PT, sy: 0 * PT, sw: 3 * PT, sh: 4 * PT,
    x: 592, y: 512, scale: 1.0 },

  // ══════════════════════════════════════════════════════════════════════
  // BUSHES along grass corridor edges (4 entries) — visual softness.
  // ══════════════════════════════════════════════════════════════════════

  { sheet: 'cainos_plant', sx: 3 * PT, sy: 5 * PT, sw: PT, sh: PT,
    x: 304, y: 256, scale: 1.0 },
  { sheet: 'cainos_plant', sx: 4 * PT, sy: 5 * PT, sw: PT, sh: PT,
    x: 688, y: 384, scale: 1.0 },
  { sheet: 'cainos_plant', sx: 5 * PT, sy: 5 * PT, sw: PT, sh: PT,
    x: 272, y: 384, scale: 1.0 },
  { sheet: 'cainos_plant', sx: 3 * PT, sy: 5 * PT, sw: PT, sh: PT,
    x: 720, y: 416, scale: 1.0 },

  // ══════════════════════════════════════════════════════════════════════
  // GRASS TUFTS — small foliage details on grass spans (8 entries).
  // ══════════════════════════════════════════════════════════════════════

  { sheet: 'cainos_plant', sx: 0 * PT, sy: 11 * PT, sw: PT, sh: PT,
    x: 368, y: 224, scale: 1.0 },
  { sheet: 'cainos_plant', sx: 1 * PT, sy: 11 * PT, sw: PT, sh: PT,
    x: 656, y: 256, scale: 1.0 },
  { sheet: 'cainos_plant', sx: 2 * PT, sy: 11 * PT, sw: PT, sh: PT,
    x: 432, y: 192, scale: 1.0 },
  { sheet: 'cainos_plant', sx: 0 * PT, sy: 12 * PT, sw: PT, sh: PT,
    x: 304, y: 416, scale: 1.0 },
  { sheet: 'cainos_plant', sx: 1 * PT, sy: 12 * PT, sw: PT, sh: PT,
    x: 720, y: 448, scale: 1.0 },
  { sheet: 'cainos_plant', sx: 2 * PT, sy: 12 * PT, sw: PT, sh: PT,
    x: 560, y: 192, scale: 1.0 },
  { sheet: 'cainos_plant', sx: 0 * PT, sy: 11 * PT, sw: PT, sh: PT,
    x: 432, y: 480, scale: 1.0 },
  { sheet: 'cainos_plant', sx: 2 * PT, sy: 12 * PT, sw: PT, sh: PT,
    x: 560, y: 480, scale: 1.0 },

  // ══════════════════════════════════════════════════════════════════════
  // SCATTERED PEBBLES (5 entries) — small organic stone debris on grass.
  // ══════════════════════════════════════════════════════════════════════

  { sheet: 'cainos_props', sx: 1 * PT, sy: 15 * PT, sw: PT, sh: PT,
    x: 240, y: 192, scale: 1.0 },
  { sheet: 'cainos_props', sx: 2 * PT, sy: 15 * PT, sw: PT, sh: PT,
    x: 624, y: 224, scale: 1.0 },
  { sheet: 'cainos_props', sx: 3 * PT, sy: 15 * PT, sw: PT, sh: PT,
    x: 752, y: 416, scale: 1.0 },
  { sheet: 'cainos_props', sx: 4 * PT, sy: 15 * PT, sw: PT, sh: PT,
    x: 240, y: 416, scale: 1.0 },
  { sheet: 'cainos_props', sx: 5 * PT, sy: 15 * PT, sw: PT, sh: PT,
    x: 336, y: 480, scale: 1.0 },
];

// ─── DEV ASSERT — every prop must land on a valid (non-void) tile ───
// Catches regressions where a layout edit invalidates a prop's position
// without the dev noticing. Tree-only-on-grass rule enforced too.
if (import.meta.env?.DEV) {
  for (const p of HAMLET_PROPS) {
    const col = Math.floor(p.x / CAINOS_TILE);
    const row = Math.floor(p.y / CAINOS_TILE);
    const t = TERRAIN_GRID[row]?.[col];
    if (!t || t === 'void') {
      console.warn(`[hamlet] prop in void: ${p.sheet} at (${p.x},${p.y}) → tile (${col},${row})`);
    }
    if (p.sheet === 'cainos_plant' && p.sh >= 4 * PT && t !== 'grass') {
      // Trees (>=4 tiles tall) only on grass.
      console.warn(`[hamlet] tree on non-grass: (${p.x},${p.y}) → tile (${col},${row}) terrain=${t}`);
    }
  }
}

// ─── RENDER ────────────────────────────────────────────────────────────────
// Pass 1: floor tiles (grass / cobble / stone) across the entire grid.
// Pass 2: wall tiles overwrite the floor where the perimeter wall sits.
// Pass 3: world-positioned props rendered with bottom-center anchor.
//
// Floor + walls are 32px tile blits. Props can be any size and are scaled
// by their `scale` field (Cainos sprites are large enough that 1.0 = native).
export function drawHamletFloor(ctx) {
  // Pixel-art tiles need crisp nearest-neighbor scaling. The default
  // canvas smoothing creates faint seams between tiles — disable it for
  // the floor pass and restore on the way out.
  const prevSmoothing = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  // ─── Pass 1 + 2: floor + walls in one sweep ────────────────────────────
  for (let row = 0; row < HAMLET_ROWS; row++) {
    for (let col = 0; col < HAMLET_COLS; col++) {
      // Walls take priority — render wall tile over what would have been
      // floor. getWallVariant returns null for non-wall tiles.
      let variant = getWallVariant(col, row);
      if (!variant) {
        const type = tileTypeAt(col, row);
        const variants = TILES[type];
        if (!variants || variants.length === 0) continue;
        variant = variants[hash2(col, row) % variants.length];
      }
      const img = images[variant.sheet];
      if (!img) continue;
      ctx.drawImage(
        img,
        variant.sx, variant.sy, CAINOS_TILE, CAINOS_TILE,
        col * CAINOS_TILE, row * CAINOS_TILE, CAINOS_TILE, CAINOS_TILE,
      );
    }
  }

  // ─── Pass 3: props (bottom-center anchored) ────────────────────────────
  // Drawn after walls so trees / fountain sit in front of the wall band.
  for (const p of HAMLET_PROPS) {
    const img = images[p.sheet];
    if (!img) continue;
    const w = p.sw * (p.scale || 1);
    const h = p.sh * (p.scale || 1);
    ctx.drawImage(
      img,
      p.sx, p.sy, p.sw, p.sh,
      Math.round(p.x - w / 2), Math.round(p.y - h),
      w, h,
    );
  }
  ctx.imageSmoothingEnabled = prevSmoothing;
}

// Debug helper — exposes the layout as a printable grid for inspection.
export function debugTileGrid() {
  const symbols = { grass: '.', grass_decor: ',', cobble: 'c', stone: 'S' };
  const lines = [];
  for (let r = 0; r < HAMLET_ROWS; r++) {
    let line = '';
    for (let c = 0; c < HAMLET_COLS; c++) line += symbols[tileTypeAt(c, r)] || '?';
    lines.push(line);
  }
  return lines.join('\n');
}
