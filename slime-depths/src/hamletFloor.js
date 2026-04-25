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
  // ── WALL — outer perimeter brick wall. Body tiles only (no edges
  // baked in) so we can tile a flat wall band along the room border.
  wall_body: [
    { sheet: 'cainos_wall', sx: 1 * T, sy: 7 * T },
    { sheet: 'cainos_wall', sx: 2 * T, sy: 7 * T },
    { sheet: 'cainos_wall', sx: 3 * T, sy: 7 * T },
    { sheet: 'cainos_wall', sx: 4 * T, sy: 7 * T },
  ],
  // Wall TOP edge — has the dark capstone trim along its top edge
  // for the north wall row to look like a finished wall, not a strip.
  wall_top: [
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
  // CENTRAL PLAZA — visual anchor, where firepit/portal/oracle sit.
  // Compact 7×5 — much smaller than the prior 11×9 so the rest of the
  // layout has room to breathe.
  { name: 'central_plaza', col: 12, row: 9,  w: 7, h: 5, terrain: 'stone' },
  // NORTH SHRINE — raised platform in Stage 3, containing the shrine.
  // Slightly off-center to break the symmetric look.
  { name: 'north_shrine',  col: 13, row: 1,  w: 5, h: 4, terrain: 'stone' },
  // WEST RUIN — broken courtyard for the gravekeeper / curses.
  { name: 'west_ruin',     col: 2,  row: 8,  w: 6, h: 4, terrain: 'stone' },
  // EAST WORKSHOP — trade / archive district.
  { name: 'east_workshop', col: 22, row: 8,  w: 6, h: 4, terrain: 'stone' },
  // SOUTH ENTRANCE — gateway pad, hero spawn, exit back to menu.
  { name: 'south_entrance',col: 13, row: 17, w: 5, h: 3, terrain: 'stone' },
];

// Path segments — each connects two zones via an axis-aligned route.
// Drawn as 2-tile-wide stone bands overlaying whatever was below.
const PATH_SEGMENTS = [
  // SOUTH entrance → CENTRAL plaza (vertical corridor through middle)
  { ax: 15, ay: 17, bx: 15, by: 14 },
  // CENTRAL plaza → NORTH shrine (vertical corridor through middle)
  { ax: 15, ay: 9,  bx: 15, by: 5 },
  // CENTRAL plaza → EAST workshop (horizontal corridor)
  { ax: 19, ay: 11, bx: 22, by: 11 },
  // CENTRAL plaza → WEST ruin (horizontal corridor)
  { ax: 12, ay: 11, bx: 8,  by: 11 },
];
const PATH_HALF_WIDTH = 1;     // 3 tiles wide total (col-1 .. col+1)

// Grass corridors — areas of WALKABLE grass connecting adjacent zones,
// even where there's no stone path. These define the irregular outer
// silhouette: any tile inside ANY corridor or any zone is walkable; all
// other tiles render as void.
const GRASS_CORRIDORS = [
  // Vertical corridor down the middle (south entrance → plaza → shrine)
  { col: 11, row: 5,  w: 8, h: 14 },
  // Horizontal corridor across the middle (west ruin → plaza → east workshop)
  { col: 6,  row: 7,  w: 22, h: 7 },
  // South spur extending down from south entrance (gateway approach)
  { col: 13, row: 17, w: 5, h: 4 },
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


// ─── PERIMETER WALL ────────────────────────────────────────────────────────
// Inset-by-1 stone perimeter band around the playable area. Two rows thick
// on the north (so the wall has visible "depth" looking down) and one row
// thick on the south + sides. The hamlet's interior playable area becomes
// the inner rectangle (cols 1..w-2, rows 2..h-2).
// ─── WALL DETECTION — IRREGULAR SILHOUETTE ────────────────────────────
// Walls live on tiles that are themselves VOID (non-walkable) but whose
// SOUTH neighbor is walkable. That gives a single row of wall framing
// the northern edge of every walkable area, without painting a
// rectangular border. The capstone variant (with the dark trim across
// its top edge) renders when the tile two rows north is also void —
// i.e. the wall is at least 2 rows tall, which gives the platform
// silhouette its visual depth.
//
// Side and bottom edges of walkable areas don't render walls — that
// would close every zone into a fully-enclosed box. The Cainos demo
// shows side/bottom edges as transitions to grass with TX Struct
// elevation faces (Stage 3 work).

function isWallTile(col, row) {
  if (isWalkable(col, row)) return false;
  // Wall iff the tile's south neighbor is walkable (this is the "north
  // wall" of a walkable area, looking at it from the front).
  return isWalkable(col, row + 1);
}

// Pick the wall variant: tiles whose own north neighbor is ALSO void
// (i.e. there's at least one tile of brick above this one) get the
// CAPSTONE; otherwise plain BODY.
function wallTileFor(col, row) {
  const hasNorthVoid = !isWalkable(col, row - 1);
  const type = hasNorthVoid ? 'wall_top' : 'wall_body';
  const variants = TILES[type];
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

const HAMLET_PROPS = [
  // ── FOUNTAIN at plaza center (the round 4×3 fountain, bottom-right
  // area of TX Props sheet). The hamlet's heart, where firepit/portal
  // entities live for interaction.
  { sheet: 'cainos_props', sx: 11 * PT, sy: 8 * PT, sw: 4 * PT, sh: 3 * PT,
    x: 480, y: 540, scale: 1.0 },

  // ── TREES along the back rows. Trees ONLY sit on grass (Cainos demo
  // convention) — the previous middle-tree at x=470 sat directly on the
  // north path and got visually clipped by the cobble. Moved to x=620
  // so it stands on grass east of the path.
  { sheet: 'cainos_plant', sx: 0 * PT, sy: 0 * PT, sw: 3 * PT, sh: 4 * PT,
    x: 130, y: 200, scale: 1.0 },
  { sheet: 'cainos_plant', sx: 4 * PT, sy: 0 * PT, sw: 4 * PT, sh: 4 * PT,
    x: 320, y: 180, scale: 1.0 },
  { sheet: 'cainos_plant', sx: 9 * PT, sy: 0 * PT, sw: 3 * PT, sh: 4 * PT,
    x: 620, y: 200, scale: 1.0 },
  { sheet: 'cainos_plant', sx: 4 * PT, sy: 0 * PT, sw: 4 * PT, sh: 4 * PT,
    x: 830, y: 200, scale: 0.85 },

  // ── EXTRA TREES — add depth to mid-zones. Two more, smaller than the
  // back-row ones, placed where the grass would otherwise feel empty.
  { sheet: 'cainos_plant', sx: 0 * PT, sy: 0 * PT, sw: 3 * PT, sh: 4 * PT,
    x: 60, y: 300, scale: 0.85 },
  { sheet: 'cainos_plant', sx: 0 * PT, sy: 0 * PT, sw: 3 * PT, sh: 4 * PT,
    x: 900, y: 320, scale: 0.85 },
  { sheet: 'cainos_plant', sx: 9 * PT, sy: 0 * PT, sw: 3 * PT, sh: 4 * PT,
    x: 380, y: 290, scale: 0.7 },
  { sheet: 'cainos_plant', sx: 9 * PT, sy: 0 * PT, sw: 3 * PT, sh: 4 * PT,
    x: 720, y: 310, scale: 0.7 },

  // ── BUSHES — denser scatter around the perimeter and along path edges
  // for visual softness. The bush sprites are 1 tile each.
  { sheet: 'cainos_plant', sx: 0 * PT, sy: 5 * PT, sw: PT, sh: PT, x: 100, y: 480, scale: 1.0 },
  { sheet: 'cainos_plant', sx: 1 * PT, sy: 5 * PT, sw: PT, sh: PT, x: 130, y: 590, scale: 1.0 },
  { sheet: 'cainos_plant', sx: 2 * PT, sy: 5 * PT, sw: PT, sh: PT, x: 870, y: 480, scale: 1.0 },
  { sheet: 'cainos_plant', sx: 3 * PT, sy: 5 * PT, sw: PT, sh: PT, x: 880, y: 600, scale: 1.0 },
  { sheet: 'cainos_plant', sx: 4 * PT, sy: 5 * PT, sw: PT, sh: PT, x: 350, y: 300, scale: 1.0 },
  { sheet: 'cainos_plant', sx: 5 * PT, sy: 5 * PT, sw: PT, sh: PT, x: 620, y: 300, scale: 1.0 },
  { sheet: 'cainos_plant', sx: 0 * PT, sy: 5 * PT, sw: PT, sh: PT, x: 70, y: 580, scale: 1.0 },
  { sheet: 'cainos_plant', sx: 1 * PT, sy: 5 * PT, sw: PT, sh: PT, x: 920, y: 580, scale: 1.0 },
  { sheet: 'cainos_plant', sx: 2 * PT, sy: 5 * PT, sw: PT, sh: PT, x: 250, y: 250, scale: 1.0 },
  { sheet: 'cainos_plant', sx: 3 * PT, sy: 5 * PT, sw: PT, sh: PT, x: 770, y: 270, scale: 1.0 },

  // ── GRASS TUFTS — small foliage details from the bottom of TX Plant
  // (rows 11-14 col 0-2 area). Adds organic texture to large grass spans.
  { sheet: 'cainos_plant', sx: 0 * PT, sy: 11 * PT, sw: PT, sh: PT, x: 280, y: 360, scale: 1.0 },
  { sheet: 'cainos_plant', sx: 1 * PT, sy: 11 * PT, sw: PT, sh: PT, x: 720, y: 380, scale: 1.0 },
  { sheet: 'cainos_plant', sx: 2 * PT, sy: 11 * PT, sw: PT, sh: PT, x: 420, y: 380, scale: 1.0 },
  { sheet: 'cainos_plant', sx: 0 * PT, sy: 12 * PT, sw: PT, sh: PT, x: 540, y: 380, scale: 1.0 },
  { sheet: 'cainos_plant', sx: 1 * PT, sy: 12 * PT, sw: PT, sh: PT, x: 180, y: 540, scale: 1.0 },
  { sheet: 'cainos_plant', sx: 2 * PT, sy: 12 * PT, sw: PT, sh: PT, x: 800, y: 540, scale: 1.0 },

  // ── LANTERN POSTS flanking the south entrance.
  { sheet: 'cainos_props', sx: 11 * PT, sy: 6 * PT, sw: PT, sh: 2 * PT,
    x: 280, y: 620, scale: 1.0 },
  { sheet: 'cainos_props', sx: 11 * PT, sy: 6 * PT, sw: PT, sh: 2 * PT,
    x: 680, y: 620, scale: 1.0 },

  // ── KNEELING SHRINE STATUE — replaces the old standing stone at the
  // shrine entity position (~150, 440). 1×4 tile praying figure prop.
  { sheet: 'cainos_props', sx: 14 * PT, sy: 1 * PT, sw: PT, sh: 4 * PT,
    x: 150, y: 460, scale: 1.0 },

  // ── GRAVESTONES in the gravekeeper district (NW corner).
  // Each gravestone is 2×2 tiles. Three variants for visual variety.
  { sheet: 'cainos_props', sx: 7 * PT, sy: 6 * PT, sw: 2 * PT, sh: 2 * PT,
    x: 80,  y: 360, scale: 1.0 },
  { sheet: 'cainos_props', sx: 7 * PT, sy: 8 * PT, sw: 2 * PT, sh: 2 * PT,
    x: 200, y: 350, scale: 1.0 },
  { sheet: 'cainos_props', sx: 7 * PT, sy: 10 * PT, sw: 2 * PT, sh: 2 * PT,
    x: 270, y: 380, scale: 1.0 },

  // ── STONE BENCHES on the plaza (south side, facing the fountain).
  // The bench sprite is 2×2 tiles.
  { sheet: 'cainos_props', sx: 9 * PT, sy: 1 * PT, sw: 2 * PT, sh: 2 * PT,
    x: 380, y: 605, scale: 1.0 },
  { sheet: 'cainos_props', sx: 9 * PT, sy: 1 * PT, sw: 2 * PT, sh: 2 * PT,
    x: 580, y: 605, scale: 1.0 },

  // ── ARCHIVE PROPS (east side near archivist NPC).
  // Crate + barrel + vases.
  { sheet: 'cainos_props', sx: 5 * PT, sy: 0 * PT, sw: 2 * PT, sh: 2 * PT,
    x: 820, y: 595, scale: 1.0 },
  { sheet: 'cainos_props', sx: 5 * PT, sy: 5 * PT, sw: PT, sh: PT,
    x: 870, y: 600, scale: 1.0 },
  { sheet: 'cainos_props', sx: 5 * PT, sy: 7 * PT, sw: PT, sh: PT,
    x: 750, y: 615, scale: 1.0 },

  // ── FORGE PROPS (SW near smith NPC).
  // Crate + sign post (sign placed off the south entrance lane).
  { sheet: 'cainos_props', sx: 3 * PT, sy: 1 * PT, sw: 2 * PT, sh: 2 * PT,
    x: 175, y: 615, scale: 1.0 },
  { sheet: 'cainos_props', sx: 3 * PT, sy: 5 * PT, sw: PT, sh: 2 * PT,
    x: 130, y: 615, scale: 1.0 },

  // ── SCATTERED ROCKS in the grass for organic decoration.
  // Small pebbles + medium rocks from the bottom row of the props sheet.
  { sheet: 'cainos_props', sx: 1 * PT, sy: 15 * PT, sw: PT, sh: PT, x: 380, y: 270, scale: 1.0 },
  { sheet: 'cainos_props', sx: 2 * PT, sy: 15 * PT, sw: PT, sh: PT, x: 600, y: 290, scale: 1.0 },
  { sheet: 'cainos_props', sx: 3 * PT, sy: 15 * PT, sw: PT, sh: PT, x: 220, y: 300, scale: 1.0 },
  { sheet: 'cainos_props', sx: 4 * PT, sy: 15 * PT, sw: PT, sh: PT, x: 750, y: 310, scale: 1.0 },
  { sheet: 'cainos_props', sx: 5 * PT, sy: 15 * PT, sw: PT, sh: PT, x: 850, y: 320, scale: 1.0 },
  { sheet: 'cainos_props', sx: 6 * PT, sy: 15 * PT, sw: PT, sh: PT, x: 100, y: 280, scale: 1.0 },
];

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
      // Walls take priority — render wall tile over what would have been floor.
      let variant;
      if (isWallTile(col, row)) {
        variant = wallTileFor(col, row);
      } else {
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
