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
  // ── STONE PLAZA (Stone Ground sheet — pristine cut stone, used at
  //    the hamlet's center under firepit + portal).
  // ALL picks below are verified fully-opaque (≥1018/1024 pixels). The
  // earlier set hit transparent slots which produced a checkerboard of
  // black void where the tile failed to render.
  stone: [
    // The "small stones" 4×4 block — each tile renders as a 2×2 array of
    // pristine flat slabs. Tiles cleanly even when picked individually.
    { sheet: 'cainos_stone_ground', sx: 4 * T, sy: 0 * T },
    { sheet: 'cainos_stone_ground', sx: 5 * T, sy: 0 * T },
    { sheet: 'cainos_stone_ground', sx: 6 * T, sy: 0 * T },
    { sheet: 'cainos_stone_ground', sx: 7 * T, sy: 0 * T },
    { sheet: 'cainos_stone_ground', sx: 4 * T, sy: 1 * T },
    { sheet: 'cainos_stone_ground', sx: 5 * T, sy: 1 * T },
    { sheet: 'cainos_stone_ground', sx: 6 * T, sy: 1 * T },
    { sheet: 'cainos_stone_ground', sx: 7 * T, sy: 1 * T },
    { sheet: 'cainos_stone_ground', sx: 4 * T, sy: 2 * T },
    { sheet: 'cainos_stone_ground', sx: 5 * T, sy: 2 * T },
    { sheet: 'cainos_stone_ground', sx: 6 * T, sy: 2 * T },
    { sheet: 'cainos_stone_ground', sx: 7 * T, sy: 2 * T },
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

// ─── HAMLET TILEMAP (procedural) ───────────────────────────────────────────
// Anchor positions for the layout, in tile coords (col, row).
// Centered on the hamlet's NPC anchors so the floor matches where things
// actually are. PLAZA is the central stone block; PATHS radiate to the
// listed POIs.
const PLAZA_CENTER = { col: 15, row: 15 };          // tile world (480, 480)
const PLAZA_HALF_W = 5;                              // ± from center horizontally
const PLAZA_HALF_H = 4;                              // ± from center vertically

// ─── PATH GEOMETRY — ORTHOGONAL ────────────────────────────────────────
// Previous design: radial spokes from plaza center to every NPC anchor.
// That created overlapping diagonals where multiple paths intersected
// near the plaza, and read as visual noise rather than designed architecture.
//
// New design: paths only run on cardinal axes (N/S/E/W), each leaving
// from the EDGE of the plaza (not its center) and bending at right
// angles to reach off-axis NPC anchors. This gives the hamlet a
// designed-courtyard read — like the Scene Overview where every path
// is rectilinear.
//
// Each path is one or two segments. A two-segment path bends at the
// "corner" point (col, row) — it's an L-shape from plaza edge to corner
// to target.
const PATHS = [
  // NORTH path → portal (single segment due north)
  { from: { col: 15, row: 11 }, corner: null, to: { col: 15, row: 7 } },
  // SOUTH path → south entrance (single segment due south)
  { from: { col: 15, row: 19 }, corner: null, to: { col: 15, row: 20 } },
  // WEST path → shrine + gravekeeper area (single west segment)
  { from: { col: 11, row: 15 }, corner: null, to: { col: 5,  row: 15 } },
  // EAST path → wanderer + archive (single east segment)
  { from: { col: 19, row: 15 }, corner: null, to: { col: 27, row: 15 } },
  // SW spur off the west path → smith (south-southwest)
  { from: { col: 7,  row: 15 }, corner: null, to: { col: 7,  row: 18 } },
  // SE spur off the east path → archivist (south-southeast)
  { from: { col: 24, row: 15 }, corner: null, to: { col: 24, row: 18 } },
];
// 5-tile wide path total (2 tiles each side of the line center).
const PATH_HALF_WIDTH = 2;

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
  // PATHS — orthogonal rectilinear paths leaving the plaza on the four
  // cardinal axes. Each path is one or two straight segments (L-shapes
  // for off-axis targets). All use the SAME stone tile set as the plaza
  // so the floor reads as one continuous paving with the plaza at the
  // intersection.
  for (const p of PATHS) {
    if (p.corner) {
      // L-shaped path: two segments meeting at the corner
      if (pointToSegmentDist(col, row, p.from.col, p.from.row, p.corner.col, p.corner.row) <= PATH_HALF_WIDTH) return 'stone';
      if (pointToSegmentDist(col, row, p.corner.col, p.corner.row, p.to.col, p.to.row) <= PATH_HALF_WIDTH) return 'stone';
    } else {
      // Single straight segment
      if (pointToSegmentDist(col, row, p.from.col, p.from.row, p.to.col, p.to.row) <= PATH_HALF_WIDTH) return 'stone';
    }
  }
  // GRASS with sparse decoration. Only ~6% of grass tiles get the
  // decorative variant so the floor stays calm.
  const h = hash2(col, row);
  return (h % 100) < 6 ? 'grass_decor' : 'grass';
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

// ─── PERIMETER WALL ────────────────────────────────────────────────────────
// Inset-by-1 stone perimeter band around the playable area. Two rows thick
// on the north (so the wall has visible "depth" looking down) and one row
// thick on the south + sides. The hamlet's interior playable area becomes
// the inner rectangle (cols 1..w-2, rows 2..h-2).
const WALL_NORTH_DEPTH = 2;    // top wall is 2 tiles tall (capstone + body)
const WALL_OTHER_DEPTH = 1;    // sides/bottom are 1 tile thick

function isWallTile(col, row) {
  // North wall: top WALL_NORTH_DEPTH rows, full width
  if (row < WALL_NORTH_DEPTH) return true;
  // South wall: bottom WALL_OTHER_DEPTH rows, full width
  if (row >= HAMLET_ROWS - WALL_OTHER_DEPTH) return true;
  // West wall + east wall (single column each)
  if (col < WALL_OTHER_DEPTH) return true;
  if (col >= HAMLET_COLS - WALL_OTHER_DEPTH) return true;
  return false;
}

// Pick the right wall variant: top-row tiles get the capstone (with the
// dark trim); inner-row tiles get plain wall body.
function wallTileFor(col, row) {
  const type = (row === 0) ? 'wall_top' : 'wall_body';
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

  // ── TREES along the back rows. Three from TX Plant — small / large /
  // medium, framing the top of the hamlet.
  { sheet: 'cainos_plant', sx: 0 * PT, sy: 0 * PT, sw: 3 * PT, sh: 4 * PT,
    x: 130, y: 200, scale: 1.0 },
  { sheet: 'cainos_plant', sx: 4 * PT, sy: 0 * PT, sw: 4 * PT, sh: 4 * PT,
    x: 470, y: 180, scale: 1.0 },
  { sheet: 'cainos_plant', sx: 9 * PT, sy: 0 * PT, sw: 3 * PT, sh: 4 * PT,
    x: 830, y: 210, scale: 1.0 },

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
  const symbols = { grass: '.', grass_decor: ',', stone: 'S' };
  const lines = [];
  for (let r = 0; r < HAMLET_ROWS; r++) {
    let line = '';
    for (let c = 0; c < HAMLET_COLS; c++) line += symbols[tileTypeAt(c, r)] || '?';
    lines.push(line);
  }
  return lines.join('\n');
}
