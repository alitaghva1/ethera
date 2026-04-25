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
// Hamlet floor grid — STAGE 1 REBUILD: expanded from 30×21 → 34×24 to give
// room for the new staggered silhouette (irregular ruined compound with
// protrusions for cemetery W, workshop E, SW courtyard, and N shrine
// terrace). World 1088×768 px. Camera lock target is (544, 384) (center
// of new bounds).
export const HAMLET_COLS = 34;
export const HAMLET_ROWS = 24;
export const HAMLET_W = HAMLET_COLS * CAINOS_TILE;   // 1088
export const HAMLET_H = HAMLET_ROWS * CAINOS_TILE;   // 768

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
  // ── STONE PATH 9-SLICE AUTOTILE ───────────────────────────────────
  // Sourced from the 3×3 block at cols 0-2 rows 0-2 of TX Tileset Stone
  // Ground.png. Each piece tiles based on the neighbor mask of stone vs
  // non-stone in classifyStone(): edges face the side that's NOT stone,
  // corners are placed where 2 adjacent neighbors are non-stone.
  stone: [
    { sheet: 'cainos_stone_ground', sx: 1 * T, sy: 1 * T },        // body — fallback
  ],
  stone_body: [
    { sheet: 'cainos_stone_ground', sx: 1 * T, sy: 1 * T },
  ],
  stone_corner_nw: [{ sheet: 'cainos_stone_ground', sx: 0 * T, sy: 0 * T }],
  stone_corner_ne: [{ sheet: 'cainos_stone_ground', sx: 2 * T, sy: 0 * T }],
  stone_corner_sw: [{ sheet: 'cainos_stone_ground', sx: 0 * T, sy: 2 * T }],
  stone_corner_se: [{ sheet: 'cainos_stone_ground', sx: 2 * T, sy: 2 * T }],
  stone_edge_n: [{ sheet: 'cainos_stone_ground', sx: 1 * T, sy: 0 * T }],
  stone_edge_s: [{ sheet: 'cainos_stone_ground', sx: 1 * T, sy: 2 * T }],
  stone_edge_w: [{ sheet: 'cainos_stone_ground', sx: 0 * T, sy: 1 * T }],
  stone_edge_e: [{ sheet: 'cainos_stone_ground', sx: 2 * T, sy: 1 * T }],
  // ── COBBLE PATH — kept as alias of stone_body for now since paths
  // bake to terrain='stone' (cobble distinction was removed in
  // Session A). Reserved for future paving variations.
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
  // ── ELEVATED-PLATFORM SOUTH FACE ───────────────────────────────────
  // The brick "wall face" rendered in cells south of an elevated zone,
  // representing the visible side of a raised platform when viewed from
  // the camera's slight angle. Top row (closest to platform) gets the
  // CAP variant with the dark trim band so it reads as the platform's
  // south edge. Lower rows are pure body brick.
  wall_face_top: [
    { sheet: 'cainos_wall', sx: 1 * T, sy: 5 * T },
    { sheet: 'cainos_wall', sx: 2 * T, sy: 5 * T },
    { sheet: 'cainos_wall', sx: 3 * T, sy: 5 * T },
    { sheet: 'cainos_wall', sx: 4 * T, sy: 5 * T },
  ],
  wall_face_body: [
    { sheet: 'cainos_wall', sx: 1 * T, sy: 7 * T },
    { sheet: 'cainos_wall', sx: 2 * T, sy: 7 * T },
    { sheet: 'cainos_wall', sx: 3 * T, sy: 7 * T },
    { sheet: 'cainos_wall', sx: 4 * T, sy: 7 * T },
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

// STAGE 1 REBUILD — single zone for elevation differentiation only.
// Walkable silhouette is defined entirely by GRASS_CORRIDORS below.
// Zones in this rebuild only carry an elevation field for wall_face
// panel logic to reference. Terrain everywhere defaults to grass.
const ZONES = [
  // North shrine terrace (raised, elev 1). The wall_face panel south
  // of this zone gives the visible "platform face" depth. Stair sprite
  // bridges to the lower compound on the east side (cols 18-21 rows 6-8).
  { name: 'north_shrine', col: 13, row: 1, w: 10, h: 5, terrain: 'grass', elevation: 1 },
];

// STAGE 1: no elevation passage exemptions yet. The single E-facing
// stair on terrace east edge (cols 18-21 rows 6-8) sits on cells that
// are already walkable via GRASS_CORRIDORS — no wall_face panel
// covers those cells, so no exemption needed.
const ELEVATION_PASSAGES = new Set([]);
function isPassageCell(col, row) { return ELEVATION_PASSAGES.has(`${col},${row}`); }

// STAGE 1 — broken cobble path patches will be added in Stage 3 along
// with prop clusters. Path bake (Pass 3) handles the main spine.
const STONE_PATCHES = [
  // Plaza paving around well — 6×3 stone block as the "central plaza"
  // visible base. The well/shrine prop will sit at the center.
  { col: 14, row: 12, w: 6, h: 3 },
];

// WALL FACE PANELS — explicit list of brick-body panels around elevated
// zones. The demo's elevation feel comes from MULTIPLE faces of brick
// wrapping each platform (south + the side that has the stair), not
// just the south face. Each panel is { col, row, w, h, capRow } where
// capRow is the row that gets the dark trim 'wall_face_top'; other
// rows get plain 'wall_face_body'. Cells in ELEVATION_PASSAGES are
// skipped so they remain walkable for stair / doorway access.
// STAGE 1 — minimal wall_face panels for the new layout.
//
// (1) Shrine south face — brick body extending below terrace south
//     edge (row 6) flanking the stair sprite on east + west sides.
//     The stair sprite spans cols 18-21 rows 6-8; cells flanking it
//     (cols 13-17 row 6 west of stair, plus column 22 east of stair
//     just narrowly) become wall_face_top so the terrace reads as
//     raised with a clear stair access in the middle-east.
//
// (2) The wall classifier (getWallVariant) handles all OTHER outer
//     perimeter walls of the silhouette automatically based on void↔
//     walkable adjacency. Stage 1 only needs explicit panels for the
//     shrine elevation visual.
const WALL_FACE_PANELS = [
  // Shrine south face — west of stair (cols 13-17 row 6)
  { col: 13, row: 6, w: 5, h: 1, capRow: 6 },
  // Shrine south face — east of stair (col 22 row 6)
  { col: 22, row: 6, w: 1, h: 1, capRow: 6 },
];

// STAGE 1 — path network for new layout. PATH_HALF_WIDTH=1 gives
// 3-tile-wide bands along each segment.
//
// Main spine: stair base (col 17 row 7) → spawn area (col 16 row 22)
// E spur: well center → workshop east edge
// W spur: well center → cemetery west edge
// SW spur: compound south → SW courtyard
const PATH_SEGMENTS = [
  // Main S-N spine through compound + south corridor
  { ax: 17, ay: 7,  bx: 17, by: 22 },
  // E spur from well to workshop area
  { ax: 17, ay: 13, bx: 28, by: 13 },
  // W spur from well to cemetery area
  { ax: 17, ay: 13, bx: 6,  by: 13 },
  // SW spur — diagonal-ish path to SW courtyard
  { ax: 16, ay: 17, bx: 8,  by: 19 },
];
const PATH_HALF_WIDTH = 1;     // 3 tiles wide total (col-1 .. col+1)

// STAGE 1 REBUILD — GRASS_CORRIDORS define the WALKABLE SILHOUETTE.
// One rectangle per row range in most cases, with col widths varying
// to create the staggered ruined-compound shape.
//
// Walkable shape (row → col range):
//   rows 1-5  : cols 13-22  (north shrine terrace, raised)
//   row  6    : cols 14-21  (stair landing — slightly narrower than terrace)
//   row  7    : cols 9-22   (compound NW shoulder)
//   row  8    : cols 8-26   (compound widens east)
//   row  9    : cols 5-29   (wider, both sides bulge out)
//   rows 10-11: cols 1-30   (cemetery W + workshop E protrude)
//   rows 12-14: cols 1-31   (widest middle band, workshop bulges 1 more east)
//   row  15   : cols 2-29   (compound starts narrowing)
//   row  16   : cols 4-28   (narrower)
//   row  17   : cols 4-25   (narrower still, workshop ends)
//   rows 18-20: cols 4-12   (SW courtyard protrusion)
//             + cols 15-18  (south corridor — DISCONNECTED from SW at 18-20)
//   rows 21-22: cols 15-18  (south corridor only — courtyard ends at row 21)
const GRASS_CORRIDORS = [
  // North shrine terrace (rows 1-5)
  { col: 13, row: 1,  w: 10, h: 5 },
  // Stair landing row
  { col: 14, row: 6,  w: 8,  h: 1 },
  // Compound body — staggered rows
  { col: 9,  row: 7,  w: 14, h: 1 },
  { col: 8,  row: 8,  w: 19, h: 1 },
  { col: 5,  row: 9,  w: 25, h: 1 },
  { col: 1,  row: 10, w: 30, h: 2 },     // rows 10-11
  { col: 1,  row: 12, w: 31, h: 3 },     // rows 12-14 (widest, workshop bulges)
  { col: 2,  row: 15, w: 28, h: 1 },
  { col: 4,  row: 16, w: 25, h: 1 },
  { col: 4,  row: 17, w: 22, h: 1 },
  // SW courtyard
  { col: 4,  row: 18, w: 9,  h: 3 },
  // South corridor (separate, disjoint from SW courtyard at rows 18-20)
  { col: 15, row: 18, w: 4,  h: 5 },     // rows 18-22
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
  // Pass 3.5: stone patches — small irregular paving overlays in
  // corridor grass for visual variety. Only converts grass to stone
  // (leaves zone stone, void, and other terrains alone). Runs AFTER
  // paths bake (Pass 3) and BEFORE elevation faces (Pass 4) so the
  // patches can fall in places that aren't part of any path or zone
  // but still get the stone 9-slice edge tiles via classifyStone.
  for (const patch of STONE_PATCHES) {
    for (let r = patch.row; r < patch.row + patch.h && r < HAMLET_ROWS; r++) {
      for (let c = patch.col; c < patch.col + patch.w && c < HAMLET_COLS; c++) {
        if (c < 0 || r < 0) continue;
        if (!WALKABLE_GRID[r][c]) continue;          // skip void
        if (TERRAIN_GRID[r][c] === 'grass') TERRAIN_GRID[r][c] = 'stone';
      }
    }
  }
  // Pass 4: elevation faces — paint brick body (wall_face) on the panels
  // listed in WALL_FACE_PANELS. Each panel can wrap any side of an
  // elevated zone (south, east, west). The demo's depth feel comes from
  // brick body extending along multiple faces of each platform, with the
  // stair sprites cutting through them at specific rows.
  //
  // Cells in ELEVATION_PASSAGES are skipped so they remain walkable for
  // hero access (doorway through north_shrine south face; stair tops on
  // west_ruin and east_workshop side faces).
  for (const panel of WALL_FACE_PANELS) {
    for (let r = panel.row; r < panel.row + panel.h && r < HAMLET_ROWS; r++) {
      for (let c = panel.col; c < panel.col + panel.w && c < HAMLET_COLS; c++) {
        if (c < 0 || r < 0) continue;
        if (isPassageCell(c, r)) continue;
        WALKABLE_GRID[r][c] = false;
        TERRAIN_GRID[r][c] = (r === panel.capRow) ? 'wall_face_top' : 'wall_face_body';
      }
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
// For stone tiles, classifies the cell against its 4 orthogonal neighbors
// and picks a 9-slice variant (corner / edge / body) so paths read as
// paths instead of solid slabs.
function tileTypeAt(col, row) {
  const t = TERRAIN_GRID[row]?.[col];
  if (!t || t === 'void') return null;     // outside silhouette — don't render
  if (t === 'grass') {
    // ~6% of grass tiles get the decorative variant for sparse life
    const h = hash2(col, row);
    return (h % 100) < 6 ? 'grass_decor' : 'grass';
  }
  if (t === 'stone') {
    return classifyStone(col, row);
  }
  // wall_face_top, wall_face_body, etc. — return as-is, TILES has them.
  return t;
}

// Stone 9-slice classifier. For each STONE cell, build the 4-bit mask
// of which orthogonal neighbors are NON-stone (i.e. grass or void),
// then map to the right edge / corner piece. Lookup convention:
//   bit 0 (1): N is non-stone
//   bit 1 (2): E is non-stone
//   bit 2 (4): S is non-stone
//   bit 3 (8): W is non-stone
//
// Two adjacent non-stone bits → outer corner of the stone area facing
// those directions. Single non-stone bit → straight edge. Multiple
// non-adjacent or 3+ non-stone bits → body fallback (rare, would only
// happen for 1-tile-wide paths with weird neighbors).
function classifyStone(col, row) {
  const isStone = (c, r) => TERRAIN_GRID[r]?.[c] === 'stone';
  const N = !isStone(col, row - 1);
  const E = !isStone(col + 1, row);
  const S = !isStone(col, row + 1);
  const W = !isStone(col - 1, row);
  const mask = (N ? 1 : 0) | (E ? 2 : 0) | (S ? 4 : 0) | (W ? 8 : 0);
  switch (mask) {
    case 0:  return 'stone_body';
    case 1:  return 'stone_edge_n';
    case 2:  return 'stone_edge_e';
    case 4:  return 'stone_edge_s';
    case 8:  return 'stone_edge_w';
    case 9:  return 'stone_corner_nw';   // N + W non-stone
    case 3:  return 'stone_corner_ne';   // N + E non-stone
    case 12: return 'stone_corner_sw';   // S + W non-stone
    case 6:  return 'stone_corner_se';   // S + E non-stone
    default: return 'stone_body';        // 3+ edges, opposite edges, or inner corners
  }
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
  // wall_face cells already render their own brick (via tileTypeAt) —
  // don't paint a wall variant on top of the elevated platform's face.
  const here = TERRAIN_GRID[row]?.[col];
  if (here === 'wall_face_top' || here === 'wall_face_body') return null;
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
  // STAGE 1 — only the stair sprite is in HAMLET_PROPS for now. Stage 3
  // will repopulate with prop clusters (gravestones, crates, lanterns,
  // shrine, benches, etc.) per the new layout zones.
  //
  // East-facing stair sprite (TX Struct sx=128 sy=288, 4×3 = 128×96 px)
  // bridges terrace south edge (cols 18-21 row 6) down to compound
  // upper grass band (rows 7-8). High end on west, low end on east —
  // hero ascends west onto the terrace from the east-side compound.
  // Anchor (640, 288) = bottom-center of cols 18-21 rows 6-8.
  { sheet: 'cainos_struct', sx: 4 * PT, sy: 9 * PT, sw: 4 * PT, sh: 3 * PT,
    x: 640, y: 288, scale: 1.0 },
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

  // ─── Pass 3: props (bottom-center anchored) with drop shadows ─────────
  // Each FREE-STANDING prop gets a soft elliptical drop shadow so it
  // reads as sitting on the floor. Architectural props (cainos_struct =
  // stairs, archways, building facades) are SKIPPED — they're already
  // floor-level structural elements, an elliptical shadow under them
  // looks like a glitch. Tiny props (1-tile sprites: tufts, pebbles)
  // also skip shadows — at 32px they're too small for a shadow to
  // read cleanly, and the existing prop art already has its own
  // contact shading.
  for (const p of HAMLET_PROPS) {
    const img = images[p.sheet];
    if (!img) continue;
    const w = p.sw * (p.scale || 1);
    const h = p.sh * (p.scale || 1);
    const skipShadow = p.sheet === 'cainos_struct' || (p.sw <= PT && p.sh <= PT);
    if (!skipShadow) {
      const shadowRx = w * 0.42;
      const shadowRy = Math.max(4, w * 0.13);
      ctx.save();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.26)';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y - 1, shadowRx, shadowRy, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
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
