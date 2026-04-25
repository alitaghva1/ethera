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

const ZONES = [
  // CENTRAL PLAZA — ground level (elevation 0), heart of the hamlet.
  { name: 'central_plaza', col: 11, row: 9,  w: 9, h: 6, terrain: 'stone', elevation: 0 },
  // NORTH SHRINE — RAISED platform (elevation 1). Terrain GRASS
  // (Iteration 6) for consistency with the other elevated platforms
  // after Iter 4 made them grass. The path bake automatically converts
  // the central col 14-16 strip from grass to stone where the
  // plaza→shrine path crosses, giving a stone access path through the
  // grass shrine top. Priestess + circle prop sit on this stone path.
  { name: 'north_shrine',  col: 13, row: 1,  w: 5, h: 4, terrain: 'grass', elevation: 1 },
  // WEST RUIN — RAISED graveyard balcony. Terrain GRASS (Iteration 4) —
  // matches the demo's grass-topped platforms with stone path entries.
  // The path bake automatically converts cols 8-12 rows 9-11 to stone
  // where the plaza→west_ruin path crosses, giving a natural stone
  // entry path from the east stair into the cemetery grass.
  { name: 'west_ruin',     col: 0,  row: 7,  w: 9, h: 5, terrain: 'grass', elevation: 1 },
  // EAST WORKSHOP — RAISED trade alcove. Terrain GRASS (Iteration 4)
  // for the same reason. Path bake creates a stone entry from the
  // west stair (cols 19-22 rows 9-11) through the workshop grass.
  { name: 'east_workshop', col: 21, row: 7,  w: 9, h: 5, terrain: 'grass', elevation: 1 },
  // SOUTH ENTRANCE — ground level gateway pad, hero spawn.
  { name: 'south_entrance',col: 13, row: 16, w: 5, h: 4, terrain: 'stone', elevation: 0 },
  // HERB GARDEN — ground-level NW alcove. Extended to 4 rows tall
  // (was 3) so it can hold a scaled tree without foliage overflowing
  // into void above. Also gives the alcove enough vertical breathing
  // room to feel like a real garden, not a thin strip.
  { name: 'herb_garden',   col: 8,  row: 3,  w: 4, h: 4, terrain: 'grass', elevation: 0 },
];

// ELEVATION PASSAGES — cells where Pass 4 should NOT paint wall_face,
// keeping them walkable so the hero can enter / cross an elevated zone.
//
// - north_shrine doorway: col 15 rows 5-6 (Cainos has no N/S stair
//   sprite, so a passage through the south face is the access point)
// - west_ruin stair footprint: col 8 rows 12-13 (under E-stair body)
//   PLUS cols 9-10 row 11 (under stair high end where it meets platform —
//   without these, the new east face wall_face would seal the stair top)
// - east_workshop stair footprint: col 21 rows 12-13 (under W-stair)
//   PLUS cols 19-20 row 11 (stair high end, same logic)
const ELEVATION_PASSAGES = new Set([
  '15,5', '15,6',
  '8,12', '8,13',
  '9,11', '10,11',
  '21,12', '21,13',
  '19,11', '20,11',
]);
function isPassageCell(col, row) { return ELEVATION_PASSAGES.has(`${col},${row}`); }

// STONE PATCHES — small irregular paving patches that overlay corridor
// grass to mimic the demo's "scattered old courtyard" feel. Without
// these, the corridor grass spans look like uniform fields between
// zones; with these, the grass reads as overgrown around remnants of
// old paving. Each patch is { col, row, w, h }; Pass 3.5 converts
// grass in the patch footprint to stone, then the 9-slice classifier
// gives them proper edge tiles automatically.
const STONE_PATCHES = [
  // North-of-plaza upper grass — 2 small patches flanking the central
  // shrine path (cols 14-16 rows 5-8 already stone).
  { col: 11, row: 7, w: 2, h: 2 },
  { col: 18, row: 7, w: 2, h: 2 },
  // South-of-plaza grass — small patch flanking the central south path
  // (cols 14-16 rows 15-16 already stone).
  { col: 11, row: 15, w: 2, h: 1 },
  { col: 18, row: 15, w: 2, h: 1 },
  // Horizontal corridor patches BELOW the south brick face of west_ruin
  // and east_workshop (row 14, in corridor grass). Without these the
  // grass strip below each platform's south face was uniform; the
  // patches read as remnants of old courtyard paving at the foot of
  // the platforms.
  { col: 5, row: 14, w: 3, h: 1 },
  { col: 22, row: 14, w: 3, h: 1 },
  // Session P additions: paving directly under each stair sprite's
  // south end so the stair descends onto STONE instead of grass.
  // Without these the stair felt like it just stopped at the grass
  // edge; with them it reads as descending onto a paved courtyard.
  { col: 8, row: 14, w: 3, h: 1 },
  { col: 20, row: 14, w: 2, h: 1 },
  // Session Q additions: small paving patches in the south-of-plaza
  // corridor (rows 15-16) so the corridor grass between plaza and
  // south_entrance has visual variety — currently it's a uniform
  // grass strip with just the central cobble path.
  { col: 12, row: 16, w: 1, h: 1 },
  { col: 18, row: 16, w: 1, h: 1 },
  // Iteration 1 additions — more irregular paving in the upper
  // grass band (between platforms and shrine path) and west connector
  // grass area, matching the demo's "scattered old courtyard" pattern.
  { col: 11, row: 6, w: 2, h: 1 },     // north-of-plaza, west of shrine path
  { col: 18, row: 6, w: 2, h: 1 },     // north-of-plaza, east of shrine path
  { col: 6, row: 8, w: 2, h: 1 },      // west corridor near west_ruin south
  { col: 23, row: 8, w: 2, h: 1 },     // east corridor near east_workshop south
  { col: 13, row: 19, w: 1, h: 1 },    // south spur small patch
  { col: 17, row: 19, w: 1, h: 1 },    // south spur small patch
  { col: 6, row: 5, w: 2, h: 1 },      // west connector grass
  { col: 11, row: 13, w: 2, h: 1 },    // SW corner of plaza-east transition
  // Iteration 5 — stone bases UNDER each prop on the new grass
  // platforms. After Iter 4 made platform terrain grass, the grave-
  // stones and crates were sitting on bare grass which read as scattered
  // not deliberate. These small patches give each cluster a stone
  // "plot" or "loading area" base — same approach as the demo's mixed
  // grass+stone platform tops.
  // West_ruin (cemetery) — stone bases under each gravestone cluster.
  { col: 2, row: 7, w: 2, h: 2 },      // under gravestone A (cols 2-3 rows 7-8)
  { col: 6, row: 7, w: 2, h: 2 },      // under gravestone B (cols 6-7 rows 7-8)
  { col: 4, row: 9, w: 2, h: 2 },      // under gravestone C (cols 4-5 rows 9-10)
  { col: 0, row: 10, w: 2, h: 2 },     // cemetery extension (graves+crosses)
  // East_workshop — stone bases under each crate cluster.
  { col: 21, row: 7, w: 3, h: 2 },     // under west crate (cols 21-23 rows 7-8)
  { col: 24, row: 7, w: 3, h: 2 },     // under center crate cluster (cols 24-26)
  { col: 27, row: 7, w: 3, h: 2 },     // under east crate cluster (cols 27-29)
  { col: 22, row: 10, w: 1, h: 1 },    // under west barrel
  { col: 26, row: 10, w: 1, h: 1 },    // under east barrel
  { col: 28, row: 10, w: 1, h: 1 },    // under far-east barrel
  { col: 27, row: 11, w: 1, h: 1 },    // under sign post
];

// WALL FACE PANELS — explicit list of brick-body panels around elevated
// zones. The demo's elevation feel comes from MULTIPLE faces of brick
// wrapping each platform (south + the side that has the stair), not
// just the south face. Each panel is { col, row, w, h, capRow } where
// capRow is the row that gets the dark trim 'wall_face_top'; other
// rows get plain 'wall_face_body'. Cells in ELEVATION_PASSAGES are
// skipped so they remain walkable for stair / doorway access.
const WALL_FACE_PANELS = [
  // ── NORTH_SHRINE — south face only (no stairs, doorway access).
  { col: 13, row: 5,  w: 5, h: 2, capRow: 5  },
  // ── WEST_RUIN — south face (cols 0-8 rows 12-14) + east face.
  // South face deepened from 2 rows → 3 rows in Iteration 3 so the
  // brick face below the platform reads as substantial like the
  // demo. Cells at row 14 cols 0-8 were corridor grass / stone
  // patches; now wall_face_body. Hero loses east-west traversal
  // along row 14 cols 0-8, but corridor at rows 7-13 + plaza row 14
  // cols 11-19 + horizontal corridor north (rows 7-13) still
  // provide ample pathing.
  { col: 0,  row: 12, w: 9, h: 3, capRow: 12 },
  { col: 9,  row: 7,  w: 2, h: 4, capRow: 7  },
  // ── EAST_WORKSHOP — south face (cols 21-29 rows 12-14) + west face.
  // South face deepened to 3 rows (Iteration 3) — same logic as the
  // west_ruin south face deepening above.
  { col: 21, row: 12, w: 9, h: 3, capRow: 12 },
  { col: 20, row: 7,  w: 2, h: 4, capRow: 7  },
  // ══════════════════════════════════════════════════════════════════════
  // PLAZA ENCLOSURE — Iteration 8. The central plaza (cols 11-19 rows
  // 9-14) flowed seamlessly into the surrounding corridor grass, which
  // didn't read as a "courtyard." Demo plazas are enclosed by walls
  // with specific access gateways. These 6 new panels add brick walls
  // around all 4 plaza edges, with openings at:
  //   - NORTH path to shrine (cols 14-16 row 8) — kept walkable
  //   - WEST stair to west_ruin (col 10 row 11) — already passage
  //   - EAST stair to east_workshop (col 20 row 11) — already passage
  //   - SOUTH path to south_entrance (cols 14-16 row 15) — kept walkable
  // ══════════════════════════════════════════════════════════════════════
  // North wall — row 8 cols 11-13 + 17-19 (skip cols 14-16 path)
  { col: 11, row: 8,  w: 3, h: 1, capRow: 8  },
  { col: 17, row: 8,  w: 3, h: 1, capRow: 8  },
  // West wall — col 10 rows 12-14 (rows 7-10 already wall_face from
  // west_ruin east face panel; row 11 stays passage for stair top)
  { col: 10, row: 12, w: 1, h: 3, capRow: 12 },
  // East wall — col 20 rows 12-14 (mirror of west)
  { col: 20, row: 12, w: 1, h: 3, capRow: 12 },
  // South wall — row 15 cols 11-13 + 17-19 (skip cols 14-16 path)
  { col: 11, row: 15, w: 3, h: 1, capRow: 15 },
  { col: 17, row: 15, w: 3, h: 1, capRow: 15 },
  // ── Iteration 9: Gateway JAMBS — narrow the plaza N/S gateways
  // from 3-tile path openings to 1-tile doorways with brick jambs
  // flanking col 15. The user's red markup explicitly showed walls
  // tightening the gateway entries; their instinct matches the demo's
  // pattern of narrow framed doorways through brick walls.
  // North gateway jambs (cols 14, 16 row 8 — col 15 stays path stone)
  { col: 14, row: 8,  w: 1, h: 1, capRow: 8  },
  { col: 16, row: 8,  w: 1, h: 1, capRow: 8  },
  // South gateway jambs (cols 14, 16 row 15)
  { col: 14, row: 15, w: 1, h: 1, capRow: 15 },
  { col: 16, row: 15, w: 1, h: 1, capRow: 15 },
  // ── OUTER SOUTH WALL BAND — Iteration 2 (T2b).
  // The demo has a thick brick wall band extending below the silhouette
  // at the south. Ours stopped at the silhouette edge (1-row walls
  // around south_entrance + 2 rows south spur grass) — felt unfinished
  // compared to the demo's "fortified hamlet edge."
  //
  // SW outer band: 4 rows × 2 cols of brick body extending south-west
  // from the south_entrance west edge (col 13). Cells were void; become
  // wall_face_top (row 17) + body (rows 18-20).
  { col: 11, row: 17, w: 2, h: 4, capRow: 17 },
  // South spur conversion: row 20 cols 13-17 (was south spur grass)
  // becomes wall_face_top — the thick southern brick band the demo
  // shows at the very bottom of the map.
  { col: 13, row: 20, w: 5, h: 1, capRow: 20 },
  // SE outer band: mirror of SW.
  { col: 18, row: 17, w: 2, h: 4, capRow: 17 },
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
  // for grass dominance over stone. EXTENDED in Session M to cols 0-29
  // (was 5-27) so corridor grass reaches the canvas edge below the
  // newly-extended west_ruin (cols 0-8) and east_workshop (cols 21-29)
  // platforms — without this the south of those extensions had no
  // walkable grass below their brick face.
  { col: 0,  row: 7,  w: 30, h: 8 },
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

  // Iteration 6 — scaled tree on west_ruin grass top. Foliage extends
  // through the west connector grass + west_ruin grass. Tree lightly
  // shades gravestone B to its east — natural cemetery + tree feel.
  { sheet: 'cainos_plant', sx: 0 * PT, sy: 0 * PT, sw: 3 * PT, sh: 4 * PT,
    x: 208, y: 288, scale: 0.7 },

  // West cemetery extension (cols 0-1 rows 7-11, added in Session M).
  // 1 large gravestone + 2 cross headstones — extends the graveyard
  // visual into the new western jut.
  { sheet: 'cainos_props', sx: 7 * PT, sy: 5 * PT, sw: 2 * PT, sh: 2 * PT,
    x: 32, y: 320, scale: 1.0 },
  { sheet: 'cainos_props', sx: 7 * PT, sy: 9 * PT, sw: PT, sh: PT,
    x: 16, y: 352, scale: 1.0 },
  { sheet: 'cainos_props', sx: 7 * PT, sy: 9 * PT, sw: PT, sh: PT,
    x: 48, y: 352, scale: 1.0 },

  // ══════════════════════════════════════════════════════════════════════
  // EAST WORKSHOP / ARCHIVE (cols 21-27, rows 7-11) — trade district.
  // 2 crate stacks + 3 barrels + vase + sign post.
  // ══════════════════════════════════════════════════════════════════════

  { sheet: 'cainos_props', sx: 3 * PT, sy: 0 * PT, sw: 2 * PT, sh: 2 * PT,
    x: 720, y: 288, scale: 1.0 },
  // Iter 7: replaced this crate with the chest variant (sx=32 sy=0) so
  // the workshop has visual variety instead of three identical crates
  // lined up across the top row — the "row of identical boxes" was
  // reading as poorly-placed clutter in the prior screenshot.
  { sheet: 'cainos_props', sx: 1 * PT, sy: 0 * PT, sw: 2 * PT, sh: 2 * PT,
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

  // Iteration 6 — scaled tree on east_workshop grass top, between
  // crate clusters. Foliage extends through the workshop grass with
  // some overlap with crate tops at row 8 — reads as "tree branches
  // hanging over the loading area," natural for an outdoor workshop.
  { sheet: 'cainos_plant', sx: 9 * PT, sy: 0 * PT, sw: 3 * PT, sh: 4 * PT,
    x: 752, y: 352, scale: 0.7 },

  // Iteration 10 — second tree on east_workshop's east edge for
  // visual symmetry and "lots of trees" density matching demo.
  // Anchor at workshop grass; foliage overlaps the M-extension crate
  // at col 28 row 9 (tree drawn after crate, branches hang over).
  { sheet: 'cainos_plant', sx: 0 * PT, sy: 0 * PT, sw: 3 * PT, sh: 4 * PT,
    x: 912, y: 320, scale: 0.6 },

  // East storage extension (cols 28-29 rows 7-11, added in Session M).
  // 1 more crate stack + 1 barrel + 1 vase — extends the workshop
  // visual into the new eastern jut. Iter 7: kept as a CRATE here
  // (different from the center chest) so the 3 props read as
  // "crate / chest / crate" trio with visual variety.
  { sheet: 'cainos_props', sx: 3 * PT, sy: 0 * PT, sw: 2 * PT, sh: 2 * PT,
    x: 912, y: 288, scale: 1.0 },
  { sheet: 'cainos_props', sx: 4 * PT, sy: 4 * PT, sw: PT, sh: PT,
    x: 912, y: 336, scale: 1.0 },
  { sheet: 'cainos_props', sx: 4 * PT, sy: 5 * PT, sw: PT, sh: PT,
    x: 944, y: 320, scale: 1.0 },

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
  // HERB GARDEN (cols 8-11, rows 3-6) — NW alcove, gravekeeper's
  // private patch. Extended to 4 rows tall (was 3) so a small tree
  // fits without foliage spilling into void above. 3 bushes + 1
  // scaled tree + a rock cluster.
  // ══════════════════════════════════════════════════════════════════════

  // Scaled-down tree in the garden (sprite is 4×3 tiles native; at
  // scale 0.7 = 67×90 px the foliage span fits inside the now 4-row
  // garden without overflowing into the void cells above row 3).
  // Iter 7: anchor moved from (304, 192) to (304, 224) so the foliage
  // is centered DEEPER in the garden (rows 4-6 instead of rows 3-5)
  // — keeps a buffer row of grass at the top edge so the tree doesn't
  // visually press up against the void boundary.
  { sheet: 'cainos_plant', sx: 0 * PT, sy: 0 * PT, sw: 3 * PT, sh: 4 * PT,
    x: 304, y: 224, scale: 0.7 },

  // Bushes scattered through the garden's bottom rows.
  { sheet: 'cainos_plant', sx: 0 * PT, sy: 5 * PT, sw: PT, sh: PT,
    x: 272, y: 192, scale: 1.0 },
  { sheet: 'cainos_plant', sx: 2 * PT, sy: 5 * PT, sw: PT, sh: PT,
    x: 368, y: 192, scale: 1.0 },
  { sheet: 'cainos_plant', sx: 1 * PT, sy: 5 * PT, sw: PT, sh: PT,
    x: 304, y: 224, scale: 1.0 },

  // ══════════════════════════════════════════════════════════════════════
  // FOLIAGE — bushes + rock clusters in grass corridors. NO TREES.
  //
  // Trees were removed entirely in Session J: the smallest tree sprite
  // is 4 tiles tall (128px), and our grass corridors are too narrow for
  // that height. Trees in the previous layout had foliage extending
  // INTO elevated platforms or into void above the silhouette, reading
  // as "cropped at the top." Bushes (1×1) and rock clusters (3×1) sit
  // on the ground and don't extend upward — they fill the visual
  // without overflowing.
  // ══════════════════════════════════════════════════════════════════════

  // Bushes scattered through the upper grass corridor (north of plaza,
  // around the shrine doorway path).
  { sheet: 'cainos_plant', sx: 0 * PT, sy: 5 * PT, sw: PT, sh: PT,
    x: 368, y: 256, scale: 1.0 },
  { sheet: 'cainos_plant', sx: 2 * PT, sy: 5 * PT, sw: PT, sh: PT,
    x: 400, y: 224, scale: 1.0 },
  { sheet: 'cainos_plant', sx: 1 * PT, sy: 5 * PT, sw: PT, sh: PT,
    x: 592, y: 256, scale: 1.0 },
  { sheet: 'cainos_plant', sx: 4 * PT, sy: 5 * PT, sw: PT, sh: PT,
    x: 624, y: 224, scale: 1.0 },

  // Rock clusters (3×1, sx=256 sy=480) in the wider grass spans either
  // side of the shrine path. Positioned to NOT overlap the base-of-
  // brick-face tufts added in Session H at cols 13/17 row 7.
  // West cluster sprite extends across cols 9-11 row 6 (all grass) —
  // anchor at col 10 row 7 is wall_face after Session P, but only the
  // sprite's top half renders in the row 6 grass. East cluster moved
  // from (656, 224) → (608, 224) so its sprite no longer extends to
  // col 21 row 6 (which is void).
  { sheet: 'cainos_props', sx: 8 * PT, sy: 15 * PT, sw: 3 * PT, sh: PT,
    x: 336, y: 224, scale: 1.0 },
  { sheet: 'cainos_props', sx: 8 * PT, sy: 15 * PT, sw: 3 * PT, sh: PT,
    x: 608, y: 224, scale: 1.0 },

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

  // ══════════════════════════════════════════════════════════════════════
  // ELEVATED PLATFORM ACCESS — stairs (Cainos TX Struct) + shrine doorway
  // archway. These render LAST in the prop pass so they overlay walls and
  // the brick face naturally, completing the "raised platform with a way
  // up" silhouette.
  //
  // Each stair sprite is 4×3 tiles (128×96 px). It renders ON TOP of the
  // existing tiles at its footprint — those cells stay walkable thanks
  // to ELEVATION_PASSAGES exempting the col under the stair from
  // Pass 4's wall_face conversion.
  // ══════════════════════════════════════════════════════════════════════

  // East-facing stair on WEST_RUIN's east edge. High end at col 8 (ruin
  // east edge), low end at col 11 (plaza side). Hero ascends west onto
  // the ruin from the plaza-west path. Sprite covers cols 8-11 rows 11-13.
  { sheet: 'cainos_struct', sx: 4 * PT, sy: 9 * PT, sw: 4 * PT, sh: 3 * PT,
    x: 320, y: 448, scale: 1.0 },

  // West-facing stair on EAST_WORKSHOP's west edge. High end at col 21,
  // low end at col 18 (plaza side). Sprite covers cols 18-21 rows 11-13.
  { sheet: 'cainos_struct', sx: 0 * PT, sy: 9 * PT, sw: 4 * PT, sh: 3 * PT,
    x: 640, y: 448, scale: 1.0 },

  // (Iter 7: shrine archway prop removed — its 2×2 sprite was overlaying
  // the wall_face brick at cols 14-16 rows 5-6 with a different brick
  // texture, creating a visual "double brick / broken stack" effect on
  // the shrine south face. The 1-tile col-15 passage reads cleanly as a
  // doorway in the brick wall without the extra archway frame.)

  // Wooden doorway tiles cut into the south brick face of west_ruin
  // and east_workshop — gives the brick walls "shop door" detail
  // visible in the demo. Each is the 1×3 doorway sprite from TX Wall
  // (sx=160 sy=224 — body brick with door inset). Anchored at row 14
  // bottom so the sprite spans rows 11-13: row 11 = platform stone
  // (zone), rows 12-13 = wall_face (brick face). The door visual sits
  // in the brick rows. 6 doors total spread along the brick faces —
  // demo has multiple doors per wall, ours felt sparse with just 2.
  { sheet: 'cainos_wall', sx: 5 * PT, sy: 7 * PT, sw: PT, sh: 3 * PT,
    x: 80, y: 448, scale: 1.0 },
  { sheet: 'cainos_wall', sx: 5 * PT, sy: 7 * PT, sw: PT, sh: 3 * PT,
    x: 208, y: 448, scale: 1.0 },
  { sheet: 'cainos_wall', sx: 5 * PT, sy: 7 * PT, sw: PT, sh: 3 * PT,
    x: 816, y: 448, scale: 1.0 },
  { sheet: 'cainos_wall', sx: 5 * PT, sy: 7 * PT, sw: PT, sh: 3 * PT,
    x: 944, y: 448, scale: 1.0 },

  // ── BRICK-FACE BASE TUFTS — soft grass at the foot of every elevated
  // platform's south face, breaking the sharp brick-meets-grass cut.
  // Two per zone (or fewer where there's no grass below the face).
  // Shrine base (row 7 — col 13 and col 17 are corridor grass; cols
  // 14-16 are path bake stone, no tufts there).
  { sheet: 'cainos_plant', sx: 0 * PT, sy: 11 * PT, sw: PT, sh: PT,
    x: 432, y: 256, scale: 1.0 },
  { sheet: 'cainos_plant', sx: 1 * PT, sy: 11 * PT, sw: PT, sh: PT,
    x: 560, y: 256, scale: 1.0 },
  // West_ruin base (row 14 — cols 5-7 corridor grass; cols 2-4 are void).
  { sheet: 'cainos_plant', sx: 2 * PT, sy: 11 * PT, sw: PT, sh: PT,
    x: 176, y: 448, scale: 1.0 },
  { sheet: 'cainos_plant', sx: 0 * PT, sy: 12 * PT, sw: PT, sh: PT,
    x: 240, y: 448, scale: 1.0 },
  // East_workshop base (row 14 — cols 22-24 corridor grass).
  { sheet: 'cainos_plant', sx: 1 * PT, sy: 12 * PT, sw: PT, sh: PT,
    x: 720, y: 448, scale: 1.0 },
  { sheet: 'cainos_plant', sx: 2 * PT, sy: 12 * PT, sw: PT, sh: PT,
    x: 784, y: 448, scale: 1.0 },

  // ── DENSITY BURST — Session L. Bushes, pebbles, and tufts in grass
  // cells that were too sparse on the prior screenshot review. The
  // hamlet's grass corridors had a lot of empty strips between the
  // existing decorations; these fill them at low visual cost.
  // South-of-plaza grass band (rows 15-16):
  { sheet: 'cainos_plant', sx: 1 * PT, sy: 5 * PT, sw: PT, sh: PT,
    x: 368, y: 480, scale: 1.0 },
  { sheet: 'cainos_plant', sx: 3 * PT, sy: 5 * PT, sw: PT, sh: PT,
    x: 624, y: 480, scale: 1.0 },
  { sheet: 'cainos_props', sx: 1 * PT, sy: 15 * PT, sw: PT, sh: PT,
    x: 336, y: 480, scale: 1.0 },
  { sheet: 'cainos_props', sx: 4 * PT, sy: 15 * PT, sw: PT, sh: PT,
    x: 656, y: 480, scale: 1.0 },
  { sheet: 'cainos_plant', sx: 0 * PT, sy: 12 * PT, sw: PT, sh: PT,
    x: 400, y: 480, scale: 1.0 },
  { sheet: 'cainos_plant', sx: 2 * PT, sy: 11 * PT, sw: PT, sh: PT,
    x: 592, y: 480, scale: 1.0 },
  // Far-south grass tuft (south spur below south_entrance):
  { sheet: 'cainos_plant', sx: 1 * PT, sy: 11 * PT, sw: PT, sh: PT,
    x: 432, y: 656, scale: 1.0 },
  // Bush at SE corner of west_ruin's south corridor:
  { sheet: 'cainos_plant', sx: 4 * PT, sy: 5 * PT, sw: PT, sh: PT,
    x: 256, y: 448, scale: 1.0 },
  // Bush at SE corner of east_workshop's south corridor:
  { sheet: 'cainos_plant', sx: 5 * PT, sy: 5 * PT, sw: PT, sh: PT,
    x: 864, y: 448, scale: 1.0 },
  // Extra bush in vertical corridor at col 17 row 8:
  { sheet: 'cainos_plant', sx: 0 * PT, sy: 5 * PT, sw: PT, sh: PT,
    x: 560, y: 256, scale: 1.0 },

  // Iteration 10 — 2 trees flanking the south side of the plaza
  // walls, in the south corridor grass. Adds vertical mass to the
  // bottom-half of the hamlet which had no trees previously.
  // Anchors on vertical corridor grass; foliage overlaps the new
  // plaza south walls (row 15 wall_face) — tree branches hanging
  // over plaza wall, natural feel.
  { sheet: 'cainos_plant', sx: 9 * PT, sy: 0 * PT, sw: 3 * PT, sh: 4 * PT,
    x: 336, y: 480, scale: 0.6 },
  { sheet: 'cainos_plant', sx: 0 * PT, sy: 0 * PT, sw: 3 * PT, sh: 4 * PT,
    x: 656, y: 480, scale: 0.6 },

  // Iteration 6 — additional bushes/tufts on the new grass platforms
  // to fill the empty grass cells between props.
  // West_ruin grass (cemetery): bush at east edge (col 8 row 9)
  { sheet: 'cainos_plant', sx: 4 * PT, sy: 5 * PT, sw: PT, sh: PT,
    x: 256, y: 320, scale: 1.0 },
  // East_workshop grass: bush at south edge between sign and crate (col 27 row 10)
  { sheet: 'cainos_plant', sx: 5 * PT, sy: 5 * PT, sw: PT, sh: PT,
    x: 864, y: 352, scale: 1.0 },
  // North_shrine grass (now grass after Iter 6): tufts flanking priestess
  { sheet: 'cainos_plant', sx: 1 * PT, sy: 11 * PT, sw: PT, sh: PT,
    x: 432, y: 96, scale: 1.0 },
  { sheet: 'cainos_plant', sx: 2 * PT, sy: 11 * PT, sw: PT, sh: PT,
    x: 560, y: 96, scale: 1.0 },
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
