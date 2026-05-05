// Room — procedural renderer. We deliberately DO NOT use the Kenney tileset
// for floors/walls/pillars here; that led to busy patterns + wrong tile picks
// on an unlabeled 6500-cell sheet. Drawing geometry gives a consistent dark
// stone look tuned for the Slime Depths palette.

import { setDustBiome, setWeatherBiome } from './particles.js';
import { images } from './loader.js';
// Composition layer (Phase 1-3 vertical slice) — adds floor zones, focal
// points, and door architecture without changing the underlying generator.
import {
  FZ,
  applyZoneTone,
  assignRoomFocal,
  buildFloorZones,
  drawZoneWear,
  drawZoneOverlays,
  drawFloorKindTint,
  drawFocal as drawFocalPiece,
  drawDoorArchitecture,
  applyRoomKindDressing,
  placeRoomKindProps,
  getEffectiveRoomKind,
} from './roomComposition.js';
import { pickAuthoredShell, applyAuthoredShell } from './roomShells.js';

export const TILE = 48;
// Default room dimensions. Per-room sizes can override via `data.w` / `data.h`
// in `buildRoomFromData`. The active dimensions live on `room.w` / `room.h`,
// which all internal helpers (door positions, perimeter, collision) now read
// from. ROOM_W / ROOM_H stay exported for callers that need the standard
// medium-room baseline (e.g. floor.js spawn templates).
//
// HADES-STYLE ROOM SHAPES — sizes are picked per-kind so the player feels
// the difference walking between rooms instead of grinding through a chain
// of identical 20×14 rectangles. See `pickRoomSize` in floor.js.
export const ROOM_W = 20;
export const ROOM_H = 14;
// Size templates exposed for floor.js. Picked per room kind.
export const ROOM_SIZES = {
  small:   { w: 16, h: 11 },     // intimate sanctuary / reward — feels like a chapel
  medium:  { w: 20, h: 14 },     // default combat / event
  wide:    { w: 26, h: 13 },     // long hall — encourages flanking + ranged play
  tall:    { w: 18, h: 18 },     // tall arena — vertical movement matters
  large:   { w: 26, h: 18 },     // boss / mini-boss — epic scale
};

// ─── ROOM SHAPES ───────────────────────────────────────────────────────────
// Beyond size, the playable area can be carved into non-rectangular shapes by
// walling off corner regions. The carve happens AFTER perimeter walls + pillar
// placement in buildRoomFromData, so a shape is just "rectangle minus these
// corner blocks." Doors and pedestal stay in the middle bands so they're
// never blocked.
//
// Carve dimensions scale with room size (~25% width × ~35% height per corner)
// so the same shape reads consistently in small vs large rooms.
//
// Shapes available:
//   rect      — no carves (default rectangle)
//   L_NE/NW/SE/SW — one corner walled (creates an L / J / Γ silhouette)
//   T_top/bottom/left/right — two adjacent corners walled (T silhouette,
//                              with the "stem" pointing AWAY from the carved side)
//   plus      — all four corners walled (cross / plus silhouette)
export const ROOM_SHAPES = {
  rect:     { carves: [] },
  L_NE:     { carves: ['NE'] },
  L_NW:     { carves: ['NW'] },
  L_SE:     { carves: ['SE'] },
  L_SW:     { carves: ['SW'] },
  T_top:    { carves: ['NE', 'NW'] },     // arms extend from the bottom
  T_bottom: { carves: ['SE', 'SW'] },     // arms extend from the top
  T_left:   { carves: ['NW', 'SW'] },     // arms extend rightward
  T_right:  { carves: ['NE', 'SE'] },     // arms extend leftward
  plus:     { carves: ['NE', 'NW', 'SE', 'SW'] },
};

// Compute carve block dimensions for a given room. Centralized so doors and
// spawns and the build pass all reason about the same boundaries.
export function getCarveSize(w, h) {
  return {
    cw: Math.max(2, Math.floor(w * 0.25)),
    ch: Math.max(2, Math.floor(h * 0.35)),
  };
}

// True iff the tile at (x, y) lies inside one of the shape's corner carves.
// Used by spawnCells (avoid spawning enemies in carved areas) and the door
// X picker (north door must land in a non-carved column).
export function isCarvedTile(x, y, w, h, shape) {
  const def = ROOM_SHAPES[shape] || ROOM_SHAPES.rect;
  if (!def.carves.length) return false;
  const { cw, ch } = getCarveSize(w, h);
  for (const corner of def.carves) {
    const x0 = corner.includes('W') ? 0 : w - cw;
    const x1 = x0 + cw;
    const y0 = corner.includes('N') ? 0 : h - ch;
    const y1 = y0 + ch;
    if (x >= x0 && x < x1 && y >= y0 && y < y1) return true;
  }
  return false;
}

// Returns the inclusive [min, max] tile-X range where a NORTH-wall door
// can be placed for the given shape (i.e. the floor tile directly below
// the wall row is NOT in a carved area). 3-tile padding from each
// corner keeps doors away from corner-pillar art. Used by computeDoorXs
// in main.js.
export function getValidNorthDoorXRange(w, h, shape) {
  const def = ROOM_SHAPES[shape] || ROOM_SHAPES.rect;
  const { cw } = getCarveSize(w, h);
  const carvesNW = def.carves.includes('NW');
  const carvesNE = def.carves.includes('NE');
  return {
    min: carvesNW ? cw + 1 : 3,
    max: carvesNE ? w - cw - 2 : w - 4,
  };
}

// Apply the shape carves to a tile grid in-place. Run AFTER perimeter walls
// and pillar placement, so any pillars in the carved region get overwritten
// by wall (fine — shaped rooms have less empty floor anyway).
function applyShapeCarves(tiles, w, h, shape) {
  const def = ROOM_SHAPES[shape] || ROOM_SHAPES.rect;
  if (!def.carves.length) return;
  const { cw, ch } = getCarveSize(w, h);
  for (const corner of def.carves) {
    const x0 = corner.includes('W') ? 0 : w - cw;
    const x1 = x0 + cw;
    const y0 = corner.includes('N') ? 0 : h - ch;
    const y1 = y0 + ch;
    for (let y = y0; y < y1; y++) {
      if (!tiles[y]) continue;
      for (let x = x0; x < x1; x++) {
        tiles[y][x] = 'wall';
      }
    }
  }
}

// Three biome palettes — swapped per floor for visual identity.
// setBiome(id) switches the active palette which drawRoom + lighting read.
// Per-biome floor wear overlay — moss in the crypt, blood in the vault, scorch in the abyss.
// Each function draws a patch at (cx, cy) with a given "seed" hash.
function drawMossPatch(ctx, cx, cy, seed) {
  // Green-blue mossy blob with soft falloff
  const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, 16);
  g.addColorStop(0, 'rgba(80, 130, 90, 0.45)');
  g.addColorStop(0.55, 'rgba(60, 100, 80, 0.22)');
  g.addColorStop(1, 'rgba(40, 80, 70, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(cx - 18, cy - 18, 36, 36);
  // Specks
  ctx.fillStyle = 'rgba(120, 180, 120, 0.4)';
  const sA = seed;
  for (let i = 0; i < 5; i++) {
    const ox = ((sA >> (i * 3)) & 15) - 8;
    const oy = ((sA >> (i * 3 + 2)) & 15) - 8;
    ctx.fillRect(cx + ox, cy + oy, 1.5, 1.5);
  }
}
function drawBloodPatch(ctx, cx, cy, seed) {
  // Dark red irregular blob
  const g = ctx.createRadialGradient(cx, cy, 1, cx, cy, 14);
  g.addColorStop(0, 'rgba(100, 20, 22, 0.65)');
  g.addColorStop(0.5, 'rgba(70, 10, 16, 0.35)');
  g.addColorStop(1, 'rgba(30, 5, 8, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(cx - 16, cy - 16, 32, 32);
  // Splatter droplets
  ctx.fillStyle = 'rgba(70, 8, 12, 0.6)';
  for (let i = 0; i < 4; i++) {
    const ox = ((seed >> (i * 4)) & 31) - 16;
    const oy = ((seed >> (i * 4 + 3)) & 31) - 16;
    ctx.beginPath();
    ctx.arc(cx + ox, cy + oy, 1 + (((seed >> (i*2)) & 1) ? 1 : 0), 0, Math.PI * 2);
    ctx.fill();
  }
}
function drawScorchPatch(ctx, cx, cy, seed) {
  // Charred dark circle with ember flecks
  const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, 18);
  g.addColorStop(0, 'rgba(15, 6, 10, 0.75)');
  g.addColorStop(0.5, 'rgba(35, 12, 14, 0.4)');
  g.addColorStop(1, 'rgba(60, 18, 18, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(cx - 20, cy - 20, 40, 40);
  // Ember flecks
  ctx.fillStyle = 'rgba(255, 130, 60, 0.6)';
  for (let i = 0; i < 3; i++) {
    const ox = ((seed >> (i * 5)) & 15) - 8;
    const oy = ((seed >> (i * 5 + 3)) & 15) - 8;
    ctx.fillRect(cx + ox, cy + oy, 1.5, 1.5);
  }
}

function drawLavaPatch(ctx, cx, cy, seed) {
  // Bright glowing lava crack with flickering core
  const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, 18);
  g.addColorStop(0, 'rgba(255, 180, 60, 0.75)');
  g.addColorStop(0.4, 'rgba(220, 80, 30, 0.5)');
  g.addColorStop(1, 'rgba(120, 20, 10, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(cx - 22, cy - 22, 44, 44);
  // Bright core crack
  ctx.fillStyle = '#ffe48a';
  ctx.fillRect(cx - 1, cy - 5, 2, 10);
  ctx.fillRect(cx - 5, cy - 1, 10, 2);
  // Ember flecks
  ctx.fillStyle = '#ff9a40';
  for (let i = 0; i < 4; i++) {
    const ox = ((seed >> (i * 3)) & 15) - 8;
    const oy = ((seed >> (i * 3 + 2)) & 15) - 8;
    ctx.fillRect(cx + ox, cy + oy, 2, 2);
  }
}

const WEAR_BY_BIOME = {
  crypt: drawMossPatch,
  vault: drawBloodPatch,
  abyss: drawScorchPatch,
  inferno: drawLavaPatch,
};

export const BIOMES = {
  crypt: {
    name: 'The Crypt',
    // Cool blue-gray — a forgotten ossuary
    floorBase:    '#2a2d36',
    floorLit:     '#323641',
    floorDark:    '#1f2229',
    floorCrack:   '#0f1319',
    wallTopLit:   '#6b7280',
    wallTopMid:   '#4a5160',
    wallBody:     '#242932',
    wallFrieze:   '#32394a',
    wallRim:      '#0d1018',
    pillarTop:    '#6a7282',
    pillarMid:    '#394050',
    pillarBase:   '#161a22',
    torchFlame:   'rgba(140, 200, 255, ',     // cool moonlight torches
    torchCore:    '#a5d4ff',
    torchEmber:   '#d8eaff',
    washColor:    'rgba(20, 32, 60, 0.08)',    // slight cool tint
    vignetteBase: 'rgba(4, 8, 16, ',
    // Color grade — stronger biome identity via multiply-blend tint.
    // Blue-lavender shifts the crypt toward "cold starlit stone".
    gradeMultiply: 'rgba(160, 180, 220, 1)',
    gradeAlpha: 0.18,
    gradeScreen: 'rgba(80, 110, 180, 1)',
    gradeScreenAlpha: 0.08,
  },
  vault: {
    name: 'The Vault',
    // Warm brown-amber — dungeon proper (original palette)
    floorBase:    '#33292f',
    floorLit:     '#3a2f35',
    floorDark:    '#2b2228',
    floorCrack:   '#1a131a',
    wallTopLit:   '#7a6770',
    wallTopMid:   '#594a55',
    wallBody:     '#2c242b',
    wallFrieze:   '#3c3138',
    wallRim:      '#100b15',
    pillarTop:    '#7e6d73',
    pillarMid:    '#463a42',
    pillarBase:   '#1d181f',
    torchFlame:   'rgba(255, 180, 100, ',
    torchCore:    '#ffb46e',
    torchEmber:   '#ffe5a0',
    washColor:    'rgba(80, 50, 30, 0.06)',
    vignetteBase: 'rgba(8, 5, 10, ',
    // Warm amber grade — torch-lit dungeon feel.
    gradeMultiply: 'rgba(220, 190, 160, 1)',
    gradeAlpha: 0.14,
    gradeScreen: 'rgba(200, 130, 70, 1)',
    gradeScreenAlpha: 0.06,
  },
  abyss: {
    name: 'The Abyss',
    // Dark red-purple — infernal depths
    floorBase:    '#2e1d28',
    floorLit:     '#3a2430',
    floorDark:    '#241420',
    floorCrack:   '#160812',
    wallTopLit:   '#7a4e5f',
    wallTopMid:   '#563344',
    wallBody:     '#2a1a26',
    wallFrieze:   '#3c2235',
    wallRim:      '#120618',
    pillarTop:    '#7c485e',
    pillarMid:    '#432638',
    pillarBase:   '#1c0e1a',
    torchFlame:   'rgba(255, 110, 80, ',
    torchCore:    '#ff7048',
    torchEmber:   '#ffbaa0',
    washColor:    'rgba(100, 18, 30, 0.14)',
    vignetteBase: 'rgba(14, 4, 8, ',
    // Purple-magenta grade — haunted cathedral / eldritch dread.
    gradeMultiply: 'rgba(200, 150, 180, 1)',
    gradeAlpha: 0.20,
    gradeScreen: 'rgba(160, 60, 120, 1)',
    gradeScreenAlpha: 0.07,
  },
  inferno: {
    name: 'The Inferno',
    // Ember red-black — the world-wound itself
    floorBase:    '#2a1410',
    floorLit:     '#3a1812',
    floorDark:    '#1d0a08',
    floorCrack:   '#0a0303',
    wallTopLit:   '#8a3a28',
    wallTopMid:   '#5a241a',
    wallBody:     '#2a100c',
    wallFrieze:   '#3d1812',
    wallRim:      '#0a0202',
    pillarTop:    '#8e3826',
    pillarMid:    '#4e1e15',
    pillarBase:   '#1a0806',
    torchFlame:   'rgba(255, 160, 60, ',
    torchCore:    '#ffd850',
    torchEmber:   '#ffedb0',
    washColor:    'rgba(160, 30, 20, 0.20)',
    vignetteBase: 'rgba(18, 4, 2, ',
    // Hot ember-red grade — the world-wound itself, everything burns.
    gradeMultiply: 'rgba(255, 180, 130, 1)',
    gradeAlpha: 0.22,
    gradeScreen: 'rgba(255, 90, 40, 1)',
    gradeScreenAlpha: 0.10,
  },
};

// Active palette — mutable reference. Drawing reads from PAL directly.
let PAL = { ...BIOMES.vault };

// Shared palette fields that don't vary by biome
Object.assign(PAL, {
  doorFrame:    '#2b1e14',
  doorWoodLit:  '#8a5a33',
  doorWoodMid:  '#6c4424',
  doorWoodDark: '#3c2413',
  doorIronLit:  '#6e6a6a',
  doorIronDark: '#2c2a2c',
  pedestalLit:  '#7c8a90',
  pedestalMid:  '#4a4d56',
  pedestalDark: '#1f1a22',
  glow:         'rgba(126, 220, 176, 0.35)',
  rubbleLit:    '#55484e',
  rubbleMid:    '#3a2f37',
  rubbleDark:   '#201922',
  torchSconce:  '#2a1f1a',
  torchMetal:   '#5a4a40',
  altarDark:    '#1a0a12',
  altarMid:     '#2e1018',
  altarLit:     '#5e1f28',
  altarCrystal: '#ff4a64',
});

export function setBiome(id) {
  const biome = BIOMES[id] || BIOMES.vault;
  for (const k in biome) {
    if (k === 'name') continue;
    PAL[k] = biome[k];
  }
  PAL._biomeId = id;
  // Sync ambient dust + weather to biome
  setDustBiome(id);
  setWeatherBiome(id);
}
export function currentBiome() { return PAL._biomeId || 'vault'; }
export function currentBiomePal() { return PAL; }

// Torch positions — wall-mounted sconces that emit animated light. Filled by
// buildRoomFromData based on the room size; we also expose `roomTorches` so
// main.js can render flickering light halos in the lighting pass.
export const roomTorches = [];

// Secret wall — a single cracked wall tile in some combat rooms. Hitting it
// 3 times breaks it open, revealing a bonus relic pedestal + gold behind.
export const roomSecrets = { crackX: -1, crackY: -1, hits: 0, broken: false, rewardGiven: false };

// Next-room hint — set by main.js so the north door can render a preview icon.
export const roomNextKind = { kind: null };

// Spike trap cells — each one alternates through retracted/warning/active.
// Fields: {x, y, phase}  where phase offsets the cycle so they stagger.
export const roomSpikes = [];
// Fire pool hazards (Broodmother arena) — erupt on a cycle.
export const roomFirePools = [];
// Trove-room urns — hero can destroy them for loot. Fields: {x, y, broken, variant, breakT}
export const roomUrns = [];
// Treasure-chest-room chests. Fields: {x, y, variant: 'treasure'|'mimic',
// state: 'closed'|'opening'|'opened', frame: 0..15, frameTime: 0}.
// All chests look IDENTICAL when closed (gambling tension) — the
// variant only reveals via the opening animation playing fire vs cold.
export const roomChests = [];
// Decorative pillars (visual only, no collision). Used to frame
// special rooms like chestrooms with a 'sacred chamber' feel.
export const roomDecorPillars = [];

// ─── ROOM MARKS — within-room reactive floor effects ──────────────────
// Marks are blood pools (and future scorch marks, dust scuffs, etc.)
// pushed by gameplay events: when an enemy dies, push a blood pool;
// when an explosion lands, push a scorch mark. Marks persist for the
// duration of the room visit and are cleared when the room reloads.
//
// NOT to be confused with `ruin.stains` (ruin.js): those are
// CROSS-RUN persistent overlays drawn as a separate aging layer.
// Room marks are PER-VISIT, not per-history. They sell "this fight
// just happened HERE" — the Noita lesson at our scale.
//
// Drawing order: marks render in drawRoomDynamicLayers AFTER the
// floor cache and BEFORE corpses/props/enemies, so they sit on the
// floor like real splatter, with corpses + enemies on top of them.
export const roomMarks = [];

export function clearRoomMarks() {
  roomMarks.length = 0;
}

// Push a new mark. If there's already a mark of the same kind within
// MERGE_DIST px, bump its intensity + radius instead of pushing a new
// one — reads as "the same spot got bloodier" rather than five
// separate tiny pools. opts: { color, radius }.
export function pushRoomMark(x, y, kind, opts = {}) {
  const MERGE_DIST = 24;
  const md2 = MERGE_DIST * MERGE_DIST;
  for (const m of roomMarks) {
    if (m.kind !== kind) continue;
    const dx = m.x - x, dy = m.y - y;
    if (dx * dx + dy * dy < md2) {
      m.intensity = Math.min(3, m.intensity + 1);
      m.radius = Math.min(32, m.radius + 4);
      return;
    }
  }
  roomMarks.push({
    x, y,
    kind,
    color: opts.color || '#8a1a26',
    radius: Math.min(32, opts.radius || 12),
    intensity: 1,
    bornAt: (typeof performance !== 'undefined') ? performance.now() / 1000 : 0,
  });
  // Cap total marks per room to prevent unbounded accumulation in long
  // grindy rooms. Drop the oldest when over cap.
  const MAX_MARKS = 40;
  if (roomMarks.length > MAX_MARKS) {
    roomMarks.splice(0, roomMarks.length - MAX_MARKS);
  }
}

// Draw all marks. Called from drawRoomDynamicLayers. Marks fade in
// over 0.4s when first spawned. Blood pools render as a soft halo
// gradient + a smaller bright core so they read as wet splatters
// rather than flat blobs.
export function drawRoomMarks(ctx) {
  if (!roomMarks.length) return;
  const now = (typeof performance !== 'undefined') ? performance.now() / 1000 : 0;
  for (const m of roomMarks) {
    const age = now - m.bornAt;
    const fadeIn = Math.min(1, age / 0.4);
    if (fadeIn <= 0) continue;
    if (m.kind === 'blood') {
      const r = m.radius;
      const rgb = _markColorRgb(m.color);
      // Outer soft halo
      const halo = ctx.createRadialGradient(m.x, m.y + 4, 0, m.x, m.y + 4, r);
      halo.addColorStop(0,    `rgba(${rgb}, ${(0.55 * fadeIn).toFixed(3)})`);
      halo.addColorStop(0.6,  `rgba(${rgb}, ${(0.30 * fadeIn).toFixed(3)})`);
      halo.addColorStop(1,    `rgba(${rgb}, 0)`);
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.ellipse(m.x, m.y + 4, r, r * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
      // Inner saturated core (smaller, more opaque)
      ctx.fillStyle = `rgba(${rgb}, ${(0.65 * fadeIn).toFixed(3)})`;
      ctx.beginPath();
      ctx.ellipse(m.x, m.y + 4, r * 0.55, r * 0.30, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function _markColorRgb(hex) {
  if (typeof hex !== 'string') return '138, 26, 38';
  const m = hex.replace('#', '').match(/^([0-9a-fA-F]{6})$/);
  if (!m) return '138, 26, 38';
  const n = parseInt(m[1], 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}
const SPIKE_CYCLE = 2.2;          // total seconds per cycle
const SPIKE_RETRACT = 1.2;          // retracted duration (at phase start)
const SPIKE_WARNING = 0.4;          // warning / rising
const SPIKE_ACTIVE  = 0.6;          // damaging

export function spikeState(spike, gameTime) {
  const t = ((gameTime + spike.phase) % SPIKE_CYCLE + SPIKE_CYCLE) % SPIKE_CYCLE;
  if (t < SPIKE_RETRACT) return { kind: 'retracted', progress: t / SPIKE_RETRACT };
  if (t < SPIKE_RETRACT + SPIKE_WARNING) return { kind: 'warning', progress: (t - SPIKE_RETRACT) / SPIKE_WARNING };
  return { kind: 'active', progress: (t - SPIKE_RETRACT - SPIKE_WARNING) / SPIKE_ACTIVE };
}

// Current active room state (mutable — swapped on transition).
export const room = {
  w: ROOM_W, h: ROOM_H,
  tiles: null,
  decor: [],
  kind: 'start',
  shape: 'rect',
  spawns: [],
  cleared: false,
  doors: { north: true, south: true },
  pedestalUsed: false,
  entryFrom: 'south',
};

// Door / pedestal positions now read from the active `room.w / room.h` so a
// 26×18 boss arena and a 16×11 sanctuary both put their north door at the
// correct mid-top tile. Falling back to ROOM_W/H if `room` hasn't been
// initialized yet (the very first call before buildRoomFromData runs).
export function northDoorPos() { return { x: Math.floor((room.w || ROOM_W) / 2), y: 0 }; }
export function southDoorPos() { return { x: Math.floor((room.w || ROOM_W) / 2), y: (room.h || ROOM_H) - 1 }; }
export function pedestalPos()  { return { x: Math.floor((room.w || ROOM_W) / 2), y: Math.floor((room.h || ROOM_H) / 2) }; }

function isPerimeter(x, y, w, h) {
  return x === 0 || y === 0 || x === w - 1 || y === h - 1;
}

// Pillar layout templates. Some patterns include interior walls (more blocking)
// to create arenas with forced flanking, lanes, or chokepoints.
export function getPillarCells(templateIdx) {
  return (PILLAR_TEMPLATES[templateIdx | 0] || []).slice();
}

const PILLAR_TEMPLATES = [
  // 0: 4 corners pulled in
  [[5, 4], [14, 4], [5, 9], [14, 9]],
  // 1: two central pillars
  [[9, 4], [10, 9]],
  // 2: diagonal line
  [[4, 3], [8, 6], [12, 9], [15, 11]],
  // 3: open (no obstacles)
  [],
  // 4: T-shape
  [[9, 3], [9, 4], [7, 3], [11, 3]],
  // 5: vertical wall in center (force flanking top OR bottom)
  [[9, 3], [9, 4], [9, 5], [10, 8], [10, 9], [10, 10]],
  // 6: cross in center (four lanes around it)
  [[9, 6], [10, 6], [9, 7], [10, 7], [7, 6], [12, 7]],
  // 7: zigzag corridor
  [[4, 3], [5, 3], [6, 3], [13, 6], [14, 6], [15, 6], [4, 9], [5, 9], [6, 9]],
  // 8: pincer (two rows of pillars with gap between)
  [[3, 5], [6, 5], [9, 5], [12, 5], [15, 5], [3, 8], [6, 8], [9, 8], [12, 8], [15, 8]],
  // 9: quadrant dividers (4 mini-arenas)
  [[9, 3], [9, 4], [9, 9], [9, 10], [5, 6], [5, 7], [14, 6], [14, 7]],
  // 10: sanctum circle — pillars ring around the center in a rough octagon
  [[7, 3], [12, 3], [4, 6], [15, 6], [4, 8], [15, 8], [7, 11], [12, 11]],
  // 11: gauntlet — two horizontal rows forcing hero into a central lane
  [[2, 4], [4, 4], [6, 4], [13, 4], [15, 4], [17, 4],
   [2, 9], [4, 9], [6, 9], [13, 9], [15, 9], [17, 9]],
  // 12: spiral approach — arcing from bottom-left to top-right
  [[3, 10], [5, 9], [7, 8], [9, 7], [11, 6], [13, 5], [15, 4]],
  // 13: amphitheater — tall U-shape opening upward
  [[3, 5], [3, 7], [3, 9], [16, 5], [16, 7], [16, 9], [5, 11], [9, 11], [14, 11]],
  // 14: twin altars — two clusters creating dual arenas
  [[4, 4], [5, 4], [4, 5], [14, 4], [15, 4], [15, 5], [9, 8], [10, 8], [9, 9], [10, 9]],
];

export function buildRoomFromData(data) {
  // Wipe within-room reactive marks (blood pools, future scorch marks).
  // These are per-visit only, NOT cross-run persistent — that's
  // ruin.stains' job in ruin.js.
  clearRoomMarks();

  // ── AUTHORED SHELL SLICE ──────────────────────────────────────────────
  // Some room kinds (combat / elite / challenge / sanctuary / reward /
  // chestroom) get a 50-60% chance of being routed through one of three
  // hand-tuned shells (combat_arena / crucible / chamber). The shell
  // overrides pillar positions, door columns, and focal anchor — not
  // dimensions if the source is bigger, and never spawns/decor (those
  // continue to flow through their own systems).
  //
  // applyAuthoredShell mutates `data` in place + runs BFS pathing
  // validation; if validation fails (which would only happen if the
  // shell's pillar layout somehow soft-blocked the room — guarded by
  // the unit-tested layouts in roomShells.js), the function reverts
  // every mutation and returns false. In that case we silently fall
  // through to the existing procedural pipeline. Pre-existing rooms
  // (hamlet, boss, miniboss, trove, shop, altar, event, start) never
  // route through shells in this slice and behave exactly as before.
  const shellId = pickAuthoredShell(data);
  if (shellId) applyAuthoredShell(data, shellId);

  // Per-room dimensions — falls back to ROOM_W/ROOM_H when not specified
  // (preserves back-compat with old saved data + legacy rooms like hamlet).
  const w = data.w || ROOM_W;
  const h = data.h || ROOM_H;
  room.w = w;
  room.h = h;
  room.kind = data.kind;
  // Effective kind drives identity systems (visual profile, focal,
  // shell selection, prop family). Differs from room.kind for elite
  // rooms (room.kind === 'combat' but effectiveKind === 'elite').
  // Stamped on the room for debug/inspection (window.__dbg) and so any
  // downstream renderer that needs identity-aware behavior can read
  // a single canonical field instead of re-deriving it. See
  // getEffectiveRoomKind in roomComposition.js for the rationale.
  room.eliteRoom = !!data.eliteRoom;
  room.effectiveKind = getEffectiveRoomKind(data);
  room.spawns = data.spawns ? data.spawns.slice() : [];
  room.cleared = !!data.cleared;
  room.doors = Object.assign({ north: true, south: true }, data.doors || {});
  room.pedestalUsed = false;
  room.entryFrom = data.entryFrom || 'south';
  // Persistent run-history stain + aging level (read by drawRoom for overlays)
  room.ruinStain = data.ruinStain || null;
  room.ruinAging = data.ruinAging | 0;
  // Authored-shell anchor (consumed by assignRoomFocal so the shell's
  // hand-tuned focal position takes priority over procedural placement).
  // Cleared if no shell applied this room.
  room.authoredFocal = data.authoredFocal || null;
  room.shellId       = data.shellId || null;

  // Pillar source: authored shell positions (absolute coords) take
  // priority over the procedural pillar template (scaled coords). When
  // a shell is applied via applyAuthoredShell, it writes
  // data.authoredPillars; otherwise we fall through to the existing
  // PILLAR_TEMPLATES lookup so unrouted room kinds behave unchanged.
  const usingAuthoredShell = !!(data.authoredPillars && data.authoredPillars.length > 0);
  const pillars = usingAuthoredShell
    ? data.authoredPillars.map(p => [p.x, p.y])
    : (PILLAR_TEMPLATES[data.pillarTemplate | 0] || []);
  const tiles = [];
  for (let y = 0; y < h; y++) {
    const r = [];
    for (let x = 0; x < w; x++) {
      r.push(isPerimeter(x, y, w, h) ? 'wall' : 'floor');
    }
    tiles.push(r);
  }
  // Hamlet skips pillars entirely — the room is the painted backdrop, a
  // walkable hub with no combat. Perimeter walls stay so the hero can't
  // walk off the painted plate.
  if (data.kind !== 'hamlet') {
    // Pillar templates are authored at MEDIUM scale (20×14). For larger
    // rooms, scale pillar coords proportionally so the layout still reads
    // as designed. For smaller rooms, clamp to the new bounds.
    // AUTHORED SHELLS skip the scale (their coords are already absolute
    // for the shell's own w/h, which becomes the room's w/h).
    const sx = usingAuthoredShell ? 1 : (w / ROOM_W);
    const sy = usingAuthoredShell ? 1 : (h / ROOM_H);
    for (const [px, py] of pillars) {
      const scaledX = usingAuthoredShell ? px : Math.round(px * sx);
      const scaledY = usingAuthoredShell ? py : Math.round(py * sy);
      if (scaledX > 0 && scaledY > 0 && scaledX < w - 1 && scaledY < h - 1) {
        tiles[scaledY][scaledX] = 'pillar';
      }
    }
    // ── SHAPE CARVES — turn the rectangle into L / T / plus / etc. by
    // walling off corner regions. Runs AFTER pillar placement so any
    // pillars that landed in a carved area are simply overwritten with
    // wall (visually consistent — they were going to be inside the
    // walled corner anyway).
    room.shape = data.shape || 'rect';
    applyShapeCarves(tiles, w, h, room.shape);
  } else {
    room.shape = 'rect';
  }

  // ── Door tile placement ────────────────────────────────────────────────
  // Multi-door support: a graph node with N outgoing edges drops N door
  // tiles in the north wall (handled by setupRoomDoors in doorPortals.js
  // *after* this function runs). To make those tiles walkable, the wall
  // generator marks the planned door positions as 'door' tiles up-front.
  //
  // data.doorPlan tells us which positions to mark. If absent, fall back
  // to the legacy single-center door so non-graph rooms (hamlet, hub)
  // keep working.
  const sd = southDoorPos();
  if (room.doors.south) tiles[sd.y][sd.x] = 'door';
  if (room.doors.north) {
    const plan = data.doorPlan && data.doorPlan.north;
    if (plan && plan.length > 0) {
      for (const tx of plan) {
        if (tx > 0 && tx < w - 1) tiles[0][tx] = 'door';
      }
    } else {
      const nd = northDoorPos();
      tiles[nd.y][nd.x] = 'door';
    }
  }

  if (data.kind === 'reward') {
    const p = pedestalPos();
    tiles[p.y][p.x] = 'pedestal';
  }

  // Altar rooms have a central obelisk (purely visual — pedestals are placed via pedestals.js)
  if (data.kind === 'altar') {
    const p = pedestalPos();
    tiles[p.y][p.x] = 'altar';
  }

  room.tiles = tiles;

  // Procedural tiny cracks — subtle floor wear. Hamlet skips these; it
  // has its own painted ground layer and dungeon cracks/rubble look out
  // of place on the cobblestone plaza.
  room.decor = [];
  if (data.kind !== 'hamlet') {
    const crackCount = 3 + (hash(data.pillarTemplate | 0, 7) % 3);
    for (let i = 0; i < crackCount; i++) {
      const x = 2 + (hash(i + 1, 13) % (w - 4));
      const y = 2 + (hash(i + 2, 17) % (h - 4));
      if (tiles[y][x] === 'floor') room.decor.push({ x, y, kind: 'crack' });
    }
    // Rubble in 1-2 corners for "lived-in" feel
    const corners = [[1, 1], [w - 2, 1], [1, h - 2], [w - 2, h - 2]];
    const rubbleCount = 1 + (hash(data.pillarTemplate | 0, 11) % 2);
    for (let i = 0; i < rubbleCount; i++) {
      const c = corners[hash(i, 23) % corners.length];
      const [cx, cy] = c;
      if (tiles[cy][cx] === 'floor' && !room.decor.some(d => d.x === cx && d.y === cy)) {
        room.decor.push({ x: cx, y: cy, kind: 'rubble' });
      }
    }
  }
  // SET-PIECE DECOR — 100% chance of a distinctive prop on every
  // applicable room, plus a SECOND prop on medium/large rooms.
  //
  // Audit T2.3: previous 40% gate meant 60% of combat rooms had ZERO
  // set-piece décor — the player's eye had no compositional anchor and
  // rooms read as "empty box with monsters." Bumping to 100% per room
  // (and adding a second different-type prop on bigger rooms) gives
  // every fight a focal element. Sides are preferred so center stays
  // clear for combat geometry; two props use opposite sides so they
  // don't bunch.
  if (data.kind === 'combat' || data.kind === 'challenge' || data.kind === 'reward' || data.kind === 'trove') {
    const propTypes = ['bones', 'banner', 'statue', 'rug', 'chest'];
    const wantTwo = (w >= 20 && h >= 13);     // medium / wide / large
    // First prop — random side.
    const propKindA = propTypes[hash(data.pillarTemplate | 0, 31) % propTypes.length];
    const sideA = (hash(data.pillarTemplate | 0, 33) & 1) === 0;     // 0=left, 1=right
    const placed = [];
    for (let tries = 0; tries < 8; tries++) {
      const px = sideA
        ? 2 + (hash(tries + 51, 47) % 4)
        : w - 3 - (hash(tries + 53, 49) % 4);
      const py = 3 + (hash(tries + 57, 53) % Math.max(1, h - 6));
      if (tiles[py]?.[px] === 'floor' && !room.decor.some(d => d.x === px && d.y === py)) {
        room.decor.push({ x: px, y: py, kind: propKindA });
        placed.push({ x: px, y: py });
        break;
      }
    }
    // Second prop on bigger rooms — opposite side, different type.
    if (wantTwo && placed.length > 0) {
      // Pick a different prop type (skip the one we just placed).
      const remaining = propTypes.filter(t => t !== propKindA);
      const propKindB = remaining[hash(data.pillarTemplate | 0, 37) % remaining.length];
      const sideB = !sideA;
      for (let tries = 0; tries < 8; tries++) {
        const px = sideB
          ? 2 + (hash(tries + 61, 59) % 4)
          : w - 3 - (hash(tries + 67, 61) % 4);
        const py = 3 + (hash(tries + 71, 67) % Math.max(1, h - 6));
        if (tiles[py]?.[px] === 'floor' && !room.decor.some(d => d.x === px && d.y === py)) {
          room.decor.push({ x: px, y: py, kind: propKindB });
          break;
        }
      }
    }
  }

  // Wall torches. The hamlet is an outdoor scene with its own lighting
  // (painted sky + firepits + building glows) — it must NOT get the dungeon
  // wall sconces or their vertical god-ray cones, which otherwise read as
  // phantom spotlight beams across the open-sky hub.
  //
  // Audit T2.5: combat rooms used ONE fixed 2-torch layout regardless of
  // shape or theme. Three named patterns now rotate by room hash:
  //   'aisle'        — cols 5, 14 (sparse central aisle, the legacy
  //                    default; reads as a long-corridor look)
  //   'flanked'      — cols 4, 6, 13, 15 (paired sconces near where
  //                    doors usually sit; ceremonial / military feel)
  //   'distributed'  — cols 4, 10, 16 (even spread for evenly-lit
  //                    rooms; reads as "well-kept" vs ruined)
  // Door-clearance check (skip cols within ±2 of any door) still runs,
  // so even the denser patterns stay clear of doorways.
  roomTorches.length = 0;
  if (data.kind !== 'hamlet') {
    const TORCH_PATTERNS = {
      aisle:       [5, 14],
      flanked:     [4, 6, 13, 15],
      distributed: [4, 10, 16],
    };
    const patternNames = ['aisle', 'flanked', 'distributed'];
    const patternKey = patternNames[hash(data.pillarTemplate | 0, 71) % patternNames.length];
    const torchCols = (data.kind === 'boss')
      ? [3, 8, 11, 16]                          // boss arenas keep their 4-torch frame
      : TORCH_PATTERNS[patternKey];
    // Collect ALL north-wall door columns. data.doorPlan.north is an
    // array of door tile x-positions in graph rooms (legacy single
    // center door uses northDoorPos()). Previously we only skipped the
    // legacy center door column — torches still landed right next to
    // doors when the doorPlan placed multiple doors at non-center
    // columns. Now we skip torch columns within ±2 of ANY door so
    // there's clear breathing room around each doorway.
    const doorCols = (data.doorPlan && data.doorPlan.north && data.doorPlan.north.length > 0)
      ? data.doorPlan.north
      : [northDoorPos().x];
    for (const col of torchCols) {
      const tooCloseToDoor = doorCols.some(dc => Math.abs(col - dc) <= 2);
      if (tooCloseToDoor) continue;
      roomTorches.push({
        x: col * TILE + TILE/2,
        // y aligned with the NEW torch sprite's visible flame center.
        // Sprite is rendered at cy = TILE*0.7 = 33.6, scale 0.45 (50.4px
        // tall), with the flame painted at y=27 within the 112px native
        // frame. Rendered flame center ≈ 20.5 in screen space → light
        // halo + god-ray now anchor where the visible fire actually is.
        // Old value was TILE*0.6 = 28.8 (8px south of new flame).
        y: 21,
        seed: hash(col, (data.kind || 'combat').length),     // defensive: data.kind can be undefined in early-tick edge cases
      });
    }
  }

  // Spike trap patterns — in combat + boss rooms.
  roomSpikes.length = 0;
  roomFirePools.length = 0;
  // Trove urns + combat-room décor props (both use the urn system)
  roomUrns.length = 0;
  if (data.urns) {
    for (const u of data.urns) {
      roomUrns.push({ x: u.x, y: u.y, broken: !!u.broken, variant: u.variant || 0, breakT: 0, isProp: !!u.isProp });
    }
  }
  // Treasure-chest-room chests
  roomChests.length = 0;
  if (data.chests) {
    for (const c of data.chests) {
      roomChests.push({
        x: c.x, y: c.y,
        variant: c.variant,
        state: c.state || 'closed',
        frame: c.frame | 0,
        frameTime: c.frameTime || 0,
      });
    }
  }
  // Decorative pillars (visual only)
  roomDecorPillars.length = 0;
  if (data.decorPillars) {
    for (const p of data.decorPillars) {
      roomDecorPillars.push({ x: p.x, y: p.y });
    }
  }
  if (data.kind === 'combat') {
    // Archetype may explicitly suppress spikes (data.spikePattern === null)
    // for a "clean fight" feel (sanctum, crucible, maze). undefined falls
    // back to a hash-derived random pattern.
    if (data.spikePattern !== null) {
      const patternIdx = (data.spikePattern != null)
        ? data.spikePattern
        : hash(data.pillarTemplate | 0, 41) % 4;
      const pattern = SPIKE_PATTERNS[patternIdx % SPIKE_PATTERNS.length];
      for (const [sx, sy, phase] of pattern) {
        if (tiles[sy]?.[sx] === 'floor') {
          tiles[sy][sx] = 'spike';
          roomSpikes.push({ x: sx, y: sy, phase });
        }
      }
    }
    // CRUCIBLE archetype: fire pools at the cross arms. Honors plus shape.
    if (data.firePools === 'arms') {
      const cx = Math.floor(w / 2);
      const cy = Math.floor(h / 2);
      const pools = [
        { tx: cx,         ty: 3 },        // top arm
        { tx: cx,         ty: h - 4 },    // bottom arm
        { tx: 3,          ty: cy },       // left arm
        { tx: w - 4,      ty: cy },       // right arm
      ];
      pools.forEach((p, i) => {
        if (tiles[p.ty]?.[p.tx] === 'floor') {
          roomFirePools.push({
            x: p.tx * TILE + TILE / 2,
            y: p.ty * TILE + TILE / 2,
            phase: i * 0.5,
          });
        }
      });
    }
  } else if (data.kind === 'boss') {
    // Boss arenas — hazards vary by which boss is in this room
    const bossType = (data.spawns.find(s => s.boss) || {}).type || 'orc';
    if (bossType === 'orc') {
      // Grudnok's throne — a diamond of 4 spikes around the center point.
      // Hero must orbit away from Grudnok's heavy slams without backing
      // into a spike. Teaches the "position matters" rhythm early.
      const bossPattern = [
        [10, 5, 0.0], [10, 11, 1.0], [5, 8, 0.5], [15, 8, 1.5],
      ];
      for (const [sx, sy, phase] of bossPattern) {
        if (tiles[sy]?.[sx] === 'floor') {
          tiles[sy][sx] = 'spike';
          roomSpikes.push({ x: sx, y: sy, phase });
        }
      }
    } else if (bossType === 'bone_captain') {
      // Iron Revenant arena — life-drain boss with dashes + projectiles.
      // Level review P1: original arena had 8 spike columns and no
      // line-of-sight breakers, so the player ate every projectile in
      // the open. Now: 4 LOS-break pillars at quarter/three-quarter
      // positions form an inner cross, plus 4 spike pairs on the outer
      // edges so dashes still threaten boundary play. Pillar positions
      // reference room dimensions so they land symmetrically on the
      // 26×18 large arena (instead of clustering at 20×14 coords).
      const cx = (w / 2) | 0, cy = (h / 2) | 0;
      const pillarSpots = [
        [cx - 6, cy - 3], [cx + 6, cy - 3],
        [cx - 6, cy + 3], [cx + 6, cy + 3],
      ];
      for (const [px, py] of pillarSpots) {
        if (tiles[py]?.[px] === 'floor') tiles[py][px] = 'wall';
      }
      const bossPattern = [
        [3, 4, 0.3], [w - 4, 4, 1.1],
        [3, h - 5, 0.7], [w - 4, h - 5, 1.5],
      ];
      for (const [sx, sy, phase] of bossPattern) {
        if (tiles[sy]?.[sx] === 'floor') {
          tiles[sy][sx] = 'spike';
          roomSpikes.push({ x: sx, y: sy, phase });
        }
      }
    } else if (bossType === 'broodmother') {
      // Fire pools at the four quadrant centers — recomputed from actual
      // room dimensions (26×18 large) instead of the old hardcoded
      // 20×14 medium-room coords that clustered everything top-left.
      const qx1 = Math.floor(w * 0.25), qx2 = Math.floor(w * 0.75);
      const qy1 = Math.floor(h * 0.30), qy2 = Math.floor(h * 0.70);
      roomFirePools.push(
        { x: qx1 * TILE + TILE/2, y: qy1 * TILE + TILE/2, phase: 0.0 },
        { x: qx2 * TILE + TILE/2, y: qy1 * TILE + TILE/2, phase: 1.0 },
        { x: qx1 * TILE + TILE/2, y: qy2 * TILE + TILE/2, phase: 1.5 },
        { x: qx2 * TILE + TILE/2, y: qy2 * TILE + TILE/2, phase: 0.5 },
      );
    } else if (bossType === 'ember_tyrant') {
      // Ember Tyrant arena — 6 fire pools + spike rows. Same dimension-
      // relative recompute as broodmother so the layout reads right
      // on the 26×18 boss room instead of clustering top-left.
      const c1x = Math.floor(w * 0.18), c2x = Math.floor(w * 0.50), c3x = Math.floor(w * 0.82);
      const ry1 = Math.floor(h * 0.25), ry2 = Math.floor(h * 0.70);
      roomFirePools.push(
        { x: c1x * TILE + TILE/2, y: ry1 * TILE + TILE/2, phase: 0.0 },
        { x: c2x * TILE + TILE/2, y: ry1 * TILE + TILE/2, phase: 0.8 },
        { x: c3x * TILE + TILE/2, y: ry1 * TILE + TILE/2, phase: 1.6 },
        { x: c1x * TILE + TILE/2, y: ry2 * TILE + TILE/2, phase: 1.2 },
        { x: c2x * TILE + TILE/2, y: ry2 * TILE + TILE/2, phase: 0.4 },
        { x: c3x * TILE + TILE/2, y: ry2 * TILE + TILE/2, phase: 2.0 },
      );
      const bossPattern = [
        [Math.floor(w * 0.30), Math.floor(h * 0.50), 0.0],
        [Math.floor(w * 0.65), Math.floor(h * 0.50), 1.1],
      ];
      for (const [sx, sy, phase] of bossPattern) {
        if (tiles[sy]?.[sx] === 'floor') {
          tiles[sy][sx] = 'spike';
          roomSpikes.push({ x: sx, y: sy, phase });
        }
      }
    }
  }

  // Secret cracked wall — 30% chance in combat rooms (not challenge, not boss, not altar)
  roomSecrets.crackX = -1; roomSecrets.crackY = -1;
  roomSecrets.hits = 0; roomSecrets.broken = false; roomSecrets.rewardGiven = false;
  if (data.kind === 'combat' && Math.random() < 0.3) {
    // Pick a wall cell on one of the side walls (not corners, not the door row)
    const sides = [
      { x: 0, y: 3 + (hash(data.pillarTemplate | 0, 19) % Math.max(1, h - 6)) },       // left wall
      { x: w - 1, y: 3 + (hash(data.pillarTemplate | 0, 23) % Math.max(1, h - 6)) }, // right wall
    ];
    const spot = sides[hash(data.pillarTemplate | 0, 29) & 1];
    if (tiles[spot.y]?.[spot.x] === 'wall') {
      tiles[spot.y][spot.x] = 'crackedwall';
      roomSecrets.crackX = spot.x;
      roomSecrets.crackY = spot.y;
    }
  }
  // ── COMPOSITION LAYER ─────────────────────────────────────────────────
  // 1. Apply the room-kind visual profile (floor tint + vignette scale
  //    + focal recipe + propFamily metadata). Caches the profile on
  //    room.kindProfile so the renderer doesn't re-resolve per frame.
  // 2. Pick a focal point for eligible room kinds (start/hamlet/trove/
  //    chestroom/shop return null — those rooms have other natural
  //    focal points: doorways, urn piles, chest arrays, pedestals).
  // 3. Build floor zones (threshold/combat/focal-frame/alcove/wear)
  //    based on door positions + focal anchor + room dimensions.
  // 4. Apply prop dressing per room kind: filter decor types unfit
  //    for the family (no rugs in elite arenas, no scattered urns
  //    in sanctuaries, etc.), thin out decorative urns, and add
  //    family-specific extras (shop merchant display urns).
  //
  // All run BEFORE the tile cache invalidation so the next static
  // render picks them up. Hamlet rooms get null focal + empty zones —
  // drawRoomDirect's hamlet branch returns before drawFloorTile, so
  // the empty zone array is harmless.
  applyRoomKindDressing(room);
  room.focal = (data.kind === 'hamlet') ? null : assignRoomFocal(room);
  room.floorZones = buildFloorZones(room);
  // Pass roomUrns by reference so placeRoomKindProps can splice
  // decorative urns in/out without breaking the export contract
  // (collision + hit-test code reads from this same array).
  placeRoomKindProps(room, { roomUrns });

  // Tile cache — fresh room means fresh static layers. Mark dirty so
  // the next render rebuilds.
  invalidateTileCache();
}

// Spike trap patterns. Each entry: [tileX, tileY, phaseOffsetSeconds].
// Phase offsets stagger the cycles so players must time their crossings.
const SPIKE_PATTERNS = [
  // Horizontal line across middle — alternating phase
  [
    [5, 7, 0], [7, 7, 1.1], [9, 7, 0], [11, 7, 1.1], [13, 7, 0], [15, 7, 1.1],
  ],
  // Diagonal crossing
  [
    [4, 4, 0], [6, 5, 0.6], [8, 6, 1.2], [10, 7, 0.2], [12, 8, 0.8], [14, 9, 1.4],
  ],
  // Two clusters at offset phases
  [
    [5, 4, 0], [6, 4, 0], [5, 5, 1.1], [6, 5, 1.1],
    [14, 9, 0.55], [15, 9, 0.55], [14, 10, 1.65], [15, 10, 1.65],
  ],
  // Corridor you must time — 3 spikes in a line, same phase (wait for retract)
  [
    [9, 5, 0], [10, 5, 0], [11, 5, 0],
    [9, 9, 1.1], [10, 9, 1.1], [11, 9, 1.1],
  ],
];

// Collision — walls + pillars + cracked walls block; doors gated by their
// per-door state (closed/closing block; opening/open allow). South-side
// doors that have no door object (legacy fallback) treat as always open.
// Lazy reference to the hamlet's walkability function. Set by hamletFloor.js
// at module load via setHamletWalkableFn. Avoids a static circular import
// (hamletFloor.js consumes nothing from room.js, but room.js needs to call
// into it for hamlet-specific collision).
let _hamletWalkableFn = null;
export function setHamletWalkableFn(fn) { _hamletWalkableFn = fn; }

export function isWallAtWorld(wx, wy) {
  // Hamlet uses pixel-sampled walkability from the Scene Overview backdrop.
  // Wall = NOT walkable. Letting isWallAtWorld return the inverse means
  // hero's per-axis movement check (hero.js) cleanly stops at walls instead
  // of getting tile-snap-pushed-back each frame in resolveHamletCollision.
  if (room.kind === 'hamlet') {
    if (_hamletWalkableFn) return !_hamletWalkableFn(wx, wy);
    return false;     // before hamletFloor loads its fn, allow movement
  }
  if (!room.tiles) return false;
  const tx = Math.floor(wx / TILE);
  const ty = Math.floor(wy / TILE);
  if (tx < 0 || ty < 0 || tx >= room.w || ty >= room.h) return true;
  const t = room.tiles[ty][tx];
  if (t === 'wall' || t === 'pillar') return true;
  if (t === 'crackedwall') return !roomSecrets.broken;
  if (t === 'door') {
    // Defer to per-door state. The doorPortals module owns the open/closed
    // animation for each door tile. Lazy-load to avoid a static-import
    // cycle (room.js ↔ doorPortals.js both pull from each other).
    const door = _getDoorAt && _getDoorAt(tx, ty);
    if (door) {
      // closed + closing block movement; opening + open allow it.
      if (door.state === 'closed' || door.state === 'closing') return true;
      return false;
    }
    // Legacy fallback for rooms without a door object (e.g. hamlet hub,
    // start room before setupRoomDoors fired). Use the old single-door
    // semantics: south door always passable, north only when cleared.
    const isSouth = ty === room.h - 1;
    return !isSouth && !room.cleared;
  }
  return false;
}

// Lazy door lookup hook — wired by main.js so the room module doesn't
// import doorPortals.js directly (avoids module init cycles when tests
// or storybooks load room.js in isolation).
let _getDoorAt = null;
export function setDoorLookup(fn) { _getDoorAt = fn; }

// Returns true if the hero's attack swing overlaps the cracked wall — registers a hit.
export function hitCrackedWall(wx, wy, aimX, aimY, reach) {
  if (roomSecrets.broken) return false;
  if (roomSecrets.crackX < 0) return false;
  const tx = roomSecrets.crackX, ty = roomSecrets.crackY;
  const wallCX = tx * TILE + TILE/2;
  const wallCY = ty * TILE + TILE/2;
  const dx = wallCX - wx, dy = wallCY - wy;
  const dist = Math.hypot(dx, dy);
  if (dist > reach + 20) return false;
  // Rough angle gate
  const ang = Math.atan2(dy, dx);
  const aim = Math.atan2(aimY, aimX);
  let diff = ang - aim;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  if (Math.abs(diff) > Math.PI * 0.45) return false;
  return true;
}

// Called when the hero lands a swing on the cracked wall. After 3 hits, the
// wall breaks and the secret is revealed.
export function damageCrackedWall() {
  if (roomSecrets.broken) return false;
  roomSecrets.hits++;
  if (roomSecrets.hits >= 3) {
    roomSecrets.broken = true;
    // Replace tile with floor so hero can walk through / through the aesthetic gap
    room.tiles[roomSecrets.crackY][roomSecrets.crackX] = 'floor';
    // Tile changed — invalidate cache so the next draw rebuilds with floor here.
    invalidateTileCache();
    return 'broken';
  }
  return 'damaged';
}

export function onDoorWorld(wx, wy) {
  if (!room.tiles) return null;
  const tx = Math.floor(wx / TILE);
  const ty = Math.floor(wy / TILE);
  if (tx < 0 || ty < 0 || tx >= room.w || ty >= room.h) return null;
  if (room.tiles[ty][tx] !== 'door') return null;
  if (ty === 0) return room.cleared ? { dir: 'north' } : null;
  if (ty === room.h - 1) return { dir: 'south' };
  return null;
}

export function onPedestalWorld(wx, wy) {
  if (!room.tiles) return false;
  const tx = Math.floor(wx / TILE);
  const ty = Math.floor(wy / TILE);
  return room.tiles[ty]?.[tx] === 'pedestal';
}

export function consumePedestal() {
  if (!room.tiles) return false;
  if (room.pedestalUsed) return false;
  const p = pedestalPos();
  if (room.tiles[p.y][p.x] === 'pedestal') {
    room.tiles[p.y][p.x] = 'floor';
    room.pedestalUsed = true;
    // Note: no tile-cache invalidation needed — pedestals draw in
    // drawRoomDynamicLayers (pass 5, not cached). The next frame's
    // dynamic loop reads 'floor' for this tile and skips the pedestal.
    return true;
  }
  return false;
}

function hash(a, b) {
  let h = (a * 73856093) ^ (b * 19349663);
  h = (h ^ (h >>> 13)) * 1274126177;
  return (h ^ (h >>> 16)) >>> 0;
}

// ============================================================================
// RENDERING — fully procedural (no tileset)
// ============================================================================

// (Removed) drawOrganicFloorDetail — Phase 1 vertical slice replaced
// the 22 hash-positioned dirt/dust/crack patches + central traffic
// wear band with the FZ.WEAR zone (path tiles tinted darker via
// applyZoneTone) plus a single concentrated stain at the focal anchor
// (drawZoneWear in roomComposition.js). The earlier system added
// random visual noise that read as "low quality"; the zone-driven
// system reads as authored.

function drawFloorTile(ctx, tx, ty) {
  const x = tx * TILE, y = ty * TILE;
  const h = hash(tx, ty);
  // ── ZONE-AWARE TONE (Phase 1 vertical slice) ─────────────────────────
  // Replaces the prior "12% random dark / 5% random light + 15% chance
  // of an embossed tile-line/tile-quad/tile-diag pattern" with deliberate
  // zone-driven tinting. The room has been pre-tagged in buildFloorZones:
  //   - COMBAT      = clean baseline
  //   - THRESHOLD   = warmer + lighter (swept entry near doors)
  //   - FOCAL_FRAME = warm hint, suggests focal radiance
  //   - ALCOVE      = perimeter shadow (deeper)
  //   - WEAR        = visible scuff path (deliberate, not random)
  //
  // Authored zones replace random noise. The dungeon stops looking
  // "randomly dirtied" and starts looking composed.
  const zone = (room.floorZones && room.floorZones[ty] && room.floorZones[ty][tx] !== undefined)
    ? room.floorZones[ty][tx]
    : FZ.COMBAT;
  const base = applyZoneTone(PAL.floorBase, zone);
  ctx.fillStyle = base;
  ctx.fillRect(x, y, TILE, TILE);

  // Stone grain — kept for texture against an otherwise flat tile.
  // Reduced to 0-1 specks (was 0-2) and only on COMBAT/THRESHOLD zones
  // since FOCAL_FRAME / ALCOVE / WEAR have their own visual signature.
  if (zone === FZ.COMBAT || zone === FZ.THRESHOLD) {
    const n = (h % 4 === 0) ? 1 : 0;
    if (n > 0) {
      ctx.fillStyle = 'rgba(200,180,180,0.035)';
      const sx = x + 4 + (hash(tx, ty * 7 + 1) % (TILE - 8));
      const sy = y + 4 + (hash(tx * 3 + 2, ty) % (TILE - 8));
      ctx.fillRect(sx, sy, 1, 1);
    }
  }

  // ── FOCAL_FRAME tile pattern — only the focal cross gets a subtle
  // chisel groove, framing the focal piece architecturally. Single
  // pattern (no random rotation between tile-line/tile-quad/tile-diag),
  // keeping the focal area visually coherent.
  if (zone === FZ.FOCAL_FRAME) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.10)';
    ctx.fillRect(x + TILE / 2 - 0.5, y + 4, 1, TILE - 8);
    ctx.fillRect(x + 4, y + TILE / 2 - 0.5, TILE - 8, 1);
    ctx.fillStyle = 'rgba(255, 220, 180, 0.04)';
    ctx.fillRect(x + 4, y + TILE / 2 - 1, TILE - 8, 1);
  }
}

// Cracked wall — looks like a damaged wall with a visible crack pattern
// that gets more pronounced as the hero hits it.
function drawCrackedWall(ctx, tx, ty) {
  // Base wall
  drawWallTile(ctx, tx, ty);
  const x = tx * TILE, y = ty * TILE;
  const cx = x + TILE/2, cy = y + TILE/2;
  const hits = roomSecrets.hits;
  ctx.save();
  // Phase 1 audit fix #2 — discoverability. Cracked walls had visual cues
  // (gold cracks + warm glow) but too subtle to read across a room. Players
  // were finding secrets by accident or not at all. Strengthened pre-hit
  // visibility by:
  //   1. Subtle DARK weathered-stone wash so the tile reads as damaged
  //      structural fault before any gold hint registers (diegetic — the
  //      stone is broken, not "X marks the spot").
  //   2. Vertical dark hairline (the structural seam) — drawn at any hit
  //      count so the silhouette breaks up regardless of damage state.
  //   3. Bumped gold crack alpha from 0.3 → 0.50 so the warm hint is
  //      visible from outside swinging range.
  // Net effect: the player sees a damaged wall with golden glints in it
  // before they're close enough to touch — the discovery cue happens at
  // SIGHT distance, not SWING distance.
  // Weathered stone wash — dark rectangle subtly ages the tile.
  ctx.fillStyle = 'rgba(10, 8, 14, 0.22)';
  ctx.fillRect(x, y, TILE, TILE);
  // Vertical structural seam — thin dark hairline that reads as a fault
  // line in the masonry. Drawn on a slight angle for masonry-ness.
  ctx.strokeStyle = 'rgba(8, 6, 10, 0.55)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(cx - 1, y + 4);
  ctx.lineTo(cx + 2, y + TILE * 0.45);
  ctx.lineTo(cx - 3, y + TILE - 5);
  ctx.stroke();
  // Gold crack — primary "there's something here" hint. Bumped alpha
  // from 0.3 → 0.5 base so it reads from across the room. Still scales
  // with hits for the "I'm breaking through" feedback.
  ctx.strokeStyle = 'rgba(255, 220, 120, ' + (0.50 + hits * 0.18) + ')';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx - 10, cy - 8);
  ctx.lineTo(cx - 2, cy - 4);
  ctx.lineTo(cx + 4, cy + 8);
  ctx.lineTo(cx - 2, cy + 16);
  ctx.stroke();
  if (hits >= 1) {
    ctx.strokeStyle = 'rgba(255, 230, 140, ' + (0.4 + hits * 0.25) + ')';
    ctx.beginPath();
    ctx.moveTo(cx + 2, cy - 16);
    ctx.lineTo(cx + 8, cy - 2);
    ctx.lineTo(cx + 14, cy + 6);
    ctx.stroke();
  }
  if (hits >= 2) {
    ctx.strokeStyle = 'rgba(255, 240, 160, 0.85)';
    ctx.beginPath();
    ctx.moveTo(cx - 14, cy + 2);
    ctx.lineTo(cx - 4, cy + 10);
    ctx.lineTo(cx + 6, cy + 14);
    ctx.stroke();
  }
  // Warm glow hinting at the reward — slightly punchier base so the
  // promise reads at sight distance. Still gentle compared to the
  // weathered-stone wash so it doesn't dominate.
  const glow = ctx.createRadialGradient(cx, cy, 4, cx, cy, TILE * 0.9);
  glow.addColorStop(0, 'rgba(255, 200, 100, ' + (0.22 + hits * 0.10).toFixed(3) + ')');
  glow.addColorStop(1, 'rgba(255, 200, 100, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(x - 10, y - 10, TILE + 20, TILE + 20);
  ctx.restore();
}

function drawWallTile(ctx, tx, ty) {
  const x = tx * TILE, y = ty * TILE;
  // Wall body base
  ctx.fillStyle = PAL.wallBody;
  ctx.fillRect(x, y, TILE, TILE);
  // Top highlight — catches "overhead light"
  const topG = ctx.createLinearGradient(x, y, x, y + 18);
  topG.addColorStop(0, PAL.wallTopLit);
  topG.addColorStop(0.6, PAL.wallTopMid);
  topG.addColorStop(1, PAL.wallBody);
  ctx.fillStyle = topG;
  ctx.fillRect(x, y, TILE, 18);
  // Bottom rim on the wall tile itself
  const botG = ctx.createLinearGradient(x, y + TILE - 10, x, y + TILE);
  botG.addColorStop(0, 'rgba(0,0,0,0)');
  botG.addColorStop(1, PAL.wallRim);
  ctx.fillStyle = botG;
  ctx.fillRect(x, y + TILE - 10, TILE, 10);

  // Brick masonry seams — proper running bond (horizontal seams at even y,
  // vertical seams staggered by row). Cleaner than before.
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  // One horizontal mortar line mid-tile
  ctx.fillRect(x, y + 24, TILE, 1);
  // Two vertical seams per half, alternating by row for brick offset
  const stagger = (ty % 2) * (TILE / 2);
  ctx.fillRect(x + stagger - 1, y + 18, 1, 6);
  ctx.fillRect(x + ((stagger + TILE/2) % TILE) - 1, y + 24, 1, 14);
  ctx.fillRect(x + stagger - 1, y + 38, 1, TILE - 38);

  // Biome décor — deterministic per-tile extras on interior wall sections
  // Skip corners and door tiles (rough check: only top row of walls).
  if (ty === 0 && tx > 1 && tx < room.w - 2) {
    const seed = hash(tx * 13, (PAL._biomeId || 'v').charCodeAt(0) + (room.kind || 's').charCodeAt(0));
    const biome = PAL._biomeId || 'vault';
    // Roll a décor slot ~18% chance per tile — keeps room from feeling cluttered
    if ((seed % 100) < 18) {
      if (biome === 'crypt') {
        // Small skull hanging
        const sx = x + TILE / 2;
        const sy = y + 26;
        ctx.fillStyle = 'rgba(230, 220, 200, 0.82)';
        ctx.fillRect(sx - 4, sy, 8, 6);            // cranium
        ctx.fillRect(sx - 3, sy + 6, 6, 3);        // jaw
        // Eye sockets
        ctx.fillStyle = 'rgba(10, 10, 14, 0.9)';
        ctx.fillRect(sx - 3, sy + 2, 2, 2);
        ctx.fillRect(sx + 1, sy + 2, 2, 2);
        // Chain above
        ctx.fillStyle = 'rgba(120, 120, 130, 0.6)';
        ctx.fillRect(sx, y + 18, 1, 8);
      } else if (biome === 'vault') {
        // Tapestry banner — red cloth with gold trim
        const sx = x + TILE / 2 - 5;
        const sy = y + 20;
        ctx.fillStyle = '#5a1828';
        ctx.fillRect(sx, sy, 10, 18);
        ctx.fillStyle = '#7a2838';
        ctx.fillRect(sx + 1, sy + 1, 8, 4);
        // Gold trim + crest
        ctx.fillStyle = '#c9a86a';
        ctx.fillRect(sx, sy, 10, 1);
        ctx.fillRect(sx + 4, sy + 6, 2, 3);
        ctx.fillStyle = '#5a1828';
        ctx.fillRect(sx + 2, sy + 18, 2, 2);
        ctx.fillRect(sx + 6, sy + 18, 2, 2);
      } else if (biome === 'abyss') {
        // Chains + iron spike
        ctx.fillStyle = 'rgba(90, 80, 90, 0.7)';
        const sx = x + TILE / 2;
        for (let k = 0; k < 5; k++) {
          ctx.fillRect(sx, y + 16 + k * 3, 2, 2);
        }
        // Spike bracket
        ctx.fillStyle = 'rgba(40, 30, 40, 0.9)';
        ctx.beginPath();
        ctx.moveTo(sx - 3, y + 32);
        ctx.lineTo(sx + 3, y + 32);
        ctx.lineTo(sx, y + 40);
        ctx.closePath();
        ctx.fill();
      } else if (biome === 'inferno') {
        // Cracks glowing hot with embers, animated
        const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 400 + seed);
        ctx.fillStyle = `rgba(255, 120, 40, ${(0.4 + 0.35 * pulse).toFixed(3)})`;
        // Jagged crack
        ctx.fillRect(x + 14, y + 22, 1, 10);
        ctx.fillRect(x + 15, y + 26, 2, 1);
        ctx.fillRect(x + 17, y + 28, 1, 6);
        ctx.fillRect(x + 18, y + 32, 1, 4);
        // Bright core
        ctx.fillStyle = `rgba(255, 240, 180, ${(0.6 * pulse).toFixed(3)})`;
        ctx.fillRect(x + 15, y + 24, 1, 4);
      }
    }
  }
}

// "Frieze cap" rendered ABOVE the top wall row — the lit-crown band that
// caps the wall masonry. Sits between the new upper body section and the
// regular wall tile. Drawn into negative y at y=-16 to y=0.
function drawTopWallFrieze(ctx, tx) {
  const x = tx * TILE, y = -16;
  // Lit crown
  const g = ctx.createLinearGradient(x, y, x, y + 16);
  g.addColorStop(0, '#8b7982');
  g.addColorStop(0.5, PAL.wallTopLit);
  g.addColorStop(1, PAL.wallTopMid);
  ctx.fillStyle = g;
  ctx.fillRect(x, y, TILE, 16);
  // A thin decorative band
  ctx.fillStyle = PAL.wallFrieze;
  ctx.fillRect(x, y + 12, TILE, 2);
  // Small bracket notch every 2 cells
  if (tx % 2 === 0) {
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(x + TILE - 3, y + 4, 2, 6);
    ctx.fillRect(x + 1, y + 4, 2, 6);
  }
}

// Upper wall body — NEW second-row wall section drawn above the frieze cap.
// Audit T2.1: previous wall stack was 1 tile body (48 px) + a 16-px frieze
// stripe = 64 px of wall verticality, which read as a thin stripe in
// gameplay. Reference top-down dungeons (Hades, BoI, Dead Cells) sit at
// 1.5-2 tile walls. Adds a 16-px upper body section above the frieze
// using the wall's base body palette, with a midline mortar seam so the
// section reads as masonry, not just a slab. Total wall stack is now
// 80 px (16 upper + 16 frieze + 48 body) — clearly two tiles plus a
// cap, without changing collision or door-row geometry. Drawn at y=-32
// to y=-16, only on north-row wall tiles (door columns naturally skip
// because their tile type is 'door' not 'wall').
function drawTopWallBody(ctx, tx) {
  const x = tx * TILE, y = -32;
  // Body gradient — top slightly brighter (catches "sky" light) so the
  // section visually anchors above the frieze cap rather than reading
  // as a separate floating block.
  const g = ctx.createLinearGradient(x, y, x, y + 16);
  g.addColorStop(0, PAL.wallTopMid);
  g.addColorStop(0.5, PAL.wallBody);
  // PAL.wallRim is the canonical "deep shadow at wall foot" color —
  // earlier draft used PAL.wallShadow which doesn't exist on any
  // biome palette and triggered a CanvasGradient.addColorStop runtime
  // error. The error broke the boundary on the very first dungeon
  // room (the crypt floor card → the room → the crash). Caught on
  // first playtest.
  g.addColorStop(1, PAL.wallRim);
  ctx.fillStyle = g;
  ctx.fillRect(x, y, TILE, 16);
  // Mortar seam at midline — thin dark stripe so the section reads as
  // stone block masonry, not a flat slab.
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  ctx.fillRect(x, y + 8, TILE, 1);
  // Vertical block divisions every other cell (offset on alternating
  // tile cols for a brick-stagger feel without needing per-tile state).
  const offsetX = (tx % 2 === 0) ? 0 : Math.floor(TILE / 2);
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fillRect(x + offsetX, y, 1, 16);
}

// Shadow band cast by a wall onto the floor BELOW it — drawn on the floor tile,
// not on the wall. Gives the walls a "standing up" feel.
//
// Tier 2 atmosphere sweep (audit T2.2): the previous gradient-only
// shadow let the wall melt into the floor on biomes where wall body
// and floor base have similar lightness (crypt: floor #2a2d36 vs
// wall #242932 — only 6 lightness pts apart). Added a CRISP DARK
// RIM (the "baseboard") at the very top of the shadow band — a
// 2 px hard line at near-full opacity gives the seam architectural
// definition regardless of how close the surface palettes are. The
// soft gradient still does the cast-shadow falloff below it.
function drawWallShadowBelow(ctx, tx, ty) {
  const x = tx * TILE, y = ty * TILE;
  // Soft cast-shadow gradient (existing — wall "standing up" feel).
  const grad = ctx.createLinearGradient(x, y, x, y + 18);
  grad.addColorStop(0, 'rgba(0,0,0,0.65)');
  grad.addColorStop(0.5, 'rgba(0,0,0,0.28)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, TILE, 18);
  // Baseboard rim — crisp dark line right at the wall foot. This is
  // the architectural definition that the gradient alone couldn't
  // provide. 2 px tall, alpha 0.78 — reads as an edge, not a shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.78)';
  ctx.fillRect(x, y, TILE, 2);
}

// Side contact shadows — floor tiles adjacent to walls/pillars on the
// east/west edge get a soft ambient occlusion stripe. Pulled into a
// separate pass so the existing south-side cast shadow (above) keeps
// its stronger gradient (walls are taller than wide visually, so south
// shadows read most), while E/W get a subtler 8 px ambient shade.
// Comparison-vs-Hades audit Tier 1C: walls had no edge-contact shadow
// on the LEFT/RIGHT sides — only on the south. Adding all four sides
// makes walls feel embedded in the floor instead of pasted on top.
function drawSideContactShadow(ctx, tx, ty, side) {
  const x = tx * TILE, y = ty * TILE;
  if (side === 'east') {
    // Floor tile is east of a wall — shadow on its LEFT (west) edge.
    const grad = ctx.createLinearGradient(x, y, x + 8, y);
    grad.addColorStop(0, 'rgba(0,0,0,0.42)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, 8, TILE);
  } else if (side === 'west') {
    // Floor tile is west of a wall — shadow on its RIGHT (east) edge.
    const grad = ctx.createLinearGradient(x + TILE - 8, y, x + TILE, y);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.42)');
    ctx.fillStyle = grad;
    ctx.fillRect(x + TILE - 8, y, 8, TILE);
  } else if (side === 'north') {
    // Floor tile is north of a wall — bottom-edge ambient occlusion.
    // Walls south of floor are uncommon (interior pillars, T_top
    // shapes) but when they happen, the floor needs a contact rim.
    const grad = ctx.createLinearGradient(x, y + TILE - 6, x, y + TILE);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.36)');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y + TILE - 6, TILE, 6);
  }
}

function drawPillar(ctx, tx, ty) {
  const x = tx * TILE, y = ty * TILE;
  const cx = x + TILE / 2;
  const cy = y + TILE * 0.94;
  // Ground shadow — larger, darker for heft
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.beginPath();
  ctx.ellipse(cx, cy, TILE * 0.42, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  // Directional cast shadow — stretches away from the nearest torch.
  // Torches live on the north wall, so most shadows stretch SOUTH/SE/SW depending
  // on torch column. Gives each pillar a per-position directional streak.
  if (roomTorches.length > 0) {
    // Find nearest torch to this pillar
    let nearest = roomTorches[0];
    let bestD = Infinity;
    for (const t of roomTorches) {
      const dx = cx - t.x, dy = cy - t.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD) { bestD = d2; nearest = t; }
    }
    // Light vector points FROM torch TO pillar; shadow extends in that same direction
    const lx = cx - nearest.x;
    const ly = cy - nearest.y;
    const mag = Math.hypot(lx, ly) || 1;
    const dirX = lx / mag;
    const dirY = ly / mag;
    // Shadow length scales with distance from torch — nearer pillar = shorter shadow
    const sLen = 36 + Math.min(48, mag / 5);
    const endX = cx + dirX * sLen;
    const endY = cy + dirY * sLen * 0.7;       // squish vertical for iso floor
    // Fading gradient shadow polygon
    const g = ctx.createLinearGradient(cx, cy, endX, endY);
    g.addColorStop(0, 'rgba(0, 0, 0, 0.55)');
    g.addColorStop(0.5, 'rgba(0, 0, 0, 0.25)');
    g.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = g;
    // Polygon shadow: wide at pillar base, narrow at tip
    const perpX = -dirY, perpY = dirX;
    const wNear = 18, wFar = 6;
    ctx.beginPath();
    ctx.moveTo(cx + perpX * wNear, cy + perpY * wNear * 0.7);
    ctx.lineTo(endX + perpX * wFar, endY + perpY * wFar * 0.7);
    ctx.lineTo(endX - perpX * wFar, endY - perpY * wFar * 0.7);
    ctx.lineTo(cx - perpX * wNear, cy - perpY * wNear * 0.7);
    ctx.closePath();
    ctx.fill();
  }

  const pw = TILE * 0.52;
  const pH = TILE * 0.96;
  const px = x + (TILE - pw) / 2;
  const py = y + (TILE - pH) / 2;

  // Base plinth (wider than shaft)
  const plintW = pw + 14;
  const plintH = 10;
  const plintX = px - 7;
  const plintY = py + pH - plintH;
  // Plinth body
  const plintG = ctx.createLinearGradient(plintX, plintY, plintX, plintY + plintH);
  plintG.addColorStop(0, PAL.pillarMid);
  plintG.addColorStop(1, PAL.pillarBase);
  ctx.fillStyle = plintG;
  ctx.fillRect(plintX, plintY, plintW, plintH);
  // Plinth top edge highlight
  ctx.fillStyle = PAL.pillarTop;
  ctx.fillRect(plintX, plintY, plintW, 2);
  // Plinth shadow line
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(plintX, plintY + plintH - 2, plintW, 2);

  // Shaft body — vertical gradient, left-lit
  const shaftY = py + 8;
  const shaftH = pH - plintH - 10;
  const bodyG = ctx.createLinearGradient(px, 0, px + pw, 0);
  bodyG.addColorStop(0, PAL.pillarTop);
  bodyG.addColorStop(0.5, PAL.pillarMid);
  bodyG.addColorStop(1, PAL.pillarBase);
  ctx.fillStyle = bodyG;
  ctx.fillRect(px, shaftY, pw, shaftH);
  // Vertical body shadow line on right
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(px + pw - 3, shaftY, 2, shaftH);
  // Central carved groove (decorative flutes)
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fillRect(px + pw * 0.3, shaftY + 4, 1, shaftH - 8);
  ctx.fillRect(px + pw * 0.65, shaftY + 4, 1, shaftH - 8);

  // Capital (top) — 3-tier stacked cap
  const capW = pw + 10;
  const capX = px - 5;
  const capY = py;
  // Cap tier 1 — widest
  ctx.fillStyle = PAL.pillarTop;
  ctx.fillRect(capX, capY, capW, 4);
  // Cap tier 2 — chamfered stripe
  ctx.fillStyle = PAL.pillarMid;
  ctx.fillRect(capX + 1, capY + 4, capW - 2, 2);
  // Cap tier 3 — thicker
  ctx.fillStyle = PAL.pillarTop;
  ctx.fillRect(capX + 2, capY + 6, capW - 4, 3);
  // Bottom cap shadow
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(capX + 2, capY + 8, capW - 4, 1);

  // Rune mark in middle of shaft — subtle glyph
  const runeColor = PAL._biomeId === 'crypt' ? 'rgba(140, 200, 255, 0.35)'
                  : PAL._biomeId === 'abyss' ? 'rgba(255, 120, 80, 0.35)'
                  : PAL._biomeId === 'inferno' ? 'rgba(255, 200, 100, 0.45)'
                  : 'rgba(200, 170, 100, 0.35)';
  ctx.fillStyle = runeColor;
  const runeY = shaftY + shaftH * 0.55;
  const rx = px + pw / 2;
  ctx.fillRect(rx - 3, runeY, 1, 4);
  ctx.fillRect(rx + 2, runeY, 1, 4);
  ctx.fillRect(rx - 3, runeY + 1, 6, 1);

  // Biome-specific embellishment — unique decorative pass per floor
  const seed = (tx * 37 + ty * 91) & 0xff;
  const biome = PAL._biomeId || 'vault';
  if (biome === 'crypt') {
    // Crypt — moss creeping up from the base
    ctx.fillStyle = 'rgba(80, 140, 90, 0.35)';
    const mossH = 8 + (seed & 5);
    ctx.fillRect(px, shaftY + shaftH - mossH, pw, mossH);
    // Scattered moss flecks
    ctx.fillStyle = 'rgba(110, 170, 120, 0.4)';
    for (let k = 0; k < 3; k++) {
      const sy = shaftY + (((seed + k * 23) % shaftH) | 0);
      const sx = px + ((seed + k * 17) % pw | 0);
      ctx.fillRect(sx, sy, 2, 1);
    }
    // Bone-white inscription lines near top
    ctx.fillStyle = 'rgba(230, 220, 200, 0.18)';
    ctx.fillRect(px + 4, shaftY + 4, pw - 8, 1);
    ctx.fillRect(px + 4, shaftY + 10, pw - 8, 1);
  } else if (biome === 'vault') {
    // Vault — gold filigree band and brass rivets
    ctx.fillStyle = 'rgba(201, 168, 106, 0.55)';
    ctx.fillRect(px + 2, shaftY + shaftH * 0.35, pw - 4, 2);
    // Rivets
    ctx.fillStyle = 'rgba(240, 200, 130, 0.6)';
    ctx.fillRect(px + 3, shaftY + shaftH * 0.35 - 1, 2, 1);
    ctx.fillRect(px + pw - 5, shaftY + shaftH * 0.35 - 1, 2, 1);
    ctx.fillRect(px + 3, shaftY + shaftH * 0.35 + 2, 2, 1);
    ctx.fillRect(px + pw - 5, shaftY + shaftH * 0.35 + 2, 2, 1);
  } else if (biome === 'abyss') {
    // Abyss — obsidian cracks glowing purple, pulsing
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 600 + seed);
    ctx.fillStyle = `rgba(200, 90, 220, ${(0.22 + 0.2 * pulse).toFixed(3)})`;
    // Vertical crack
    ctx.fillRect(px + pw * 0.5, shaftY + 6, 1, shaftH * 0.35);
    ctx.fillRect(px + pw * 0.5 - 1, shaftY + shaftH * 0.45, 3, 1);
    ctx.fillRect(px + pw * 0.3, shaftY + shaftH * 0.5, 1, shaftH * 0.25);
  } else if (biome === 'inferno') {
    // Inferno — glowing fire veins, animated
    const pulse = 0.6 + 0.4 * Math.sin(performance.now() / 300 + seed * 0.1);
    ctx.fillStyle = `rgba(255, 140, 50, ${(0.35 + 0.3 * pulse).toFixed(3)})`;
    // Diagonal molten vein
    for (let k = 0; k < shaftH - 10; k += 3) {
      const veinX = px + pw * 0.4 + Math.sin(k * 0.3 + seed * 0.04) * 3;
      ctx.fillRect(veinX, shaftY + 5 + k, 1, 2);
    }
    // Bright core spots
    ctx.fillStyle = `rgba(255, 220, 140, ${(0.7 * pulse).toFixed(3)})`;
    ctx.fillRect(px + pw * 0.4, shaftY + shaftH * 0.3, 2, 2);
    ctx.fillRect(px + pw * 0.5, shaftY + shaftH * 0.65, 1, 2);
  }
}

// Hint pictograph drawn above the north door — tells the player what's ahead.
function drawDoorPreview(ctx, cx, cy, kind) {
  if (!kind || kind === 'start') return;
  const t = (performance.now() / 1000);
  // Tinted rim per kind
  const ringColor = {
    combat:    '#e0b0b0',
    altar:     '#ff6a85',
    challenge: '#ffb265',
    reward:    '#86e3a8',
    boss:      '#ff7055',
    trove:     '#f4d9a0',
  }[kind] || '#c0b0d0';
  ctx.save();
  // Pulsing halo — stronger for boss/reward
  const pulse = 0.5 + 0.5 * Math.sin(t * (kind === 'boss' ? 3.0 : 1.9));
  const haloA = (kind === 'boss' ? 0.35 : kind === 'reward' ? 0.28 : 0.18) * pulse;
  const haloR = 24 + pulse * 4;
  const hex = ringColor.replace('#', '');
  const n = parseInt(hex.length === 3 ? hex.split('').map(c=>c+c).join('') : hex, 16);
  const r = (n>>16)&255, g = (n>>8)&255, b = n&255;
  const halo = ctx.createRadialGradient(cx, cy, 8, cx, cy, haloR);
  halo.addColorStop(0, `rgba(${r},${g},${b},${haloA.toFixed(3)})`);
  halo.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = halo;
  ctx.fillRect(cx - haloR, cy - haloR, haloR * 2, haloR * 2);
  // Backing disc
  ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
  ctx.beginPath();
  ctx.arc(cx, cy, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = ringColor;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // Pictograph glyph
  ctx.fillStyle = ringColor;
  if (kind === 'combat') {
    // Crossed swords
    ctx.strokeStyle = ringColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 5, cy + 5); ctx.lineTo(cx + 5, cy - 5);
    ctx.moveTo(cx + 5, cy + 5); ctx.lineTo(cx - 5, cy - 5);
    ctx.stroke();
  } else if (kind === 'boss') {
    // Skull outline
    ctx.beginPath();
    ctx.arc(cx, cy - 1, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1a0a12';
    ctx.fillRect(cx - 3, cy - 2, 2, 3);
    ctx.fillRect(cx + 1, cy - 2, 2, 3);
    ctx.fillRect(cx - 2, cy + 3, 4, 2);
  } else if (kind === 'altar') {
    // Up-pointing triangle (obelisk silhouette)
    ctx.beginPath();
    ctx.moveTo(cx, cy - 7);
    ctx.lineTo(cx + 5, cy + 5);
    ctx.lineTo(cx - 5, cy + 5);
    ctx.closePath();
    ctx.fill();
  } else if (kind === 'challenge') {
    // Exclamation bang
    ctx.fillRect(cx - 1, cy - 7, 2, 9);
    ctx.fillRect(cx - 1, cy + 4, 2, 2);
  } else if (kind === 'reward') {
    // Heart for sanctuary
    ctx.beginPath();
    ctx.arc(cx - 3, cy - 1, 3, 0, Math.PI * 2);
    ctx.arc(cx + 3, cy - 1, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx - 6, cy);
    ctx.lineTo(cx, cy + 6);
    ctx.lineTo(cx + 6, cy);
    ctx.closePath();
    ctx.fill();
  } else if (kind === 'trove') {
    // Coin glyph — stacked coins
    ctx.beginPath();
    ctx.arc(cx, cy - 1, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2a1a20';
    ctx.fillRect(cx - 1, cy - 3, 2, 4);
    ctx.fillRect(cx - 2, cy - 2, 1, 2);
  }
  ctx.restore();
}

// Renders a door tile. `openAmount` ∈ [0,1] interpolates the sprite
// atlas frame (snapped to 3 poses: closed / ajar / open). North-wall
// doors use the south-rotation atlas (door face points toward the
// player who is south of the wall); south-wall doors use the
// north-rotation atlas (no runtime flip). Once a south-wall door has
// fully closed, drawDoor swaps to drawWallTile — the entry door
// becomes a wall, communicating "you can't go back." Amber torch glow
// is layered over the sprite, anchored at the room-interior side.
// Door light tint table — drives the colored glow each door spills
// into the room. Top-down priority, same intent as the keystone-seal
// priority in doorPortals.js: build identity (theme) and special
// rewards override generic kind, generic kind overrides default.
//
// Each entry: { core, mid, boost } where:
//   core   — RGB triplet for the gradient inner stop (alpha 0.45 * a)
//   mid    — RGB triplet for the mid stop (alpha 0.26 * a)
//   boost  — multiplier on alpha (1.0 = default amber, >1.0 makes the
//            door visibly brighter for build-defining choices so the
//            player's eye snaps to fusion / boss / themed gates from
//            across the room)
const _DOOR_AMBER = {
  coreR: 255, coreG: 165, coreB: 80,
  midR:  160, midG:  70,  midB:  30,
  boost: 1.0,
};
// Boost values bumped 2025-01 — the prior 1.15–1.50 range was too
// subtle to read from across a 1280-wide canvas. Pushed to 1.7–2.4
// so themed/special doors visibly bloom while substrate combat keeps
// its 1.0 baseline. The medallion above the door carries the iconic
// signal; this light just makes the COLOR snap-readable from afar.
const _DOOR_TINT_BY_THEME = {
  storm:  { coreR: 130, coreG: 200, coreB: 255, midR: 60,  midG: 110, midB: 200, boost: 1.9 },
  flame:  { coreR: 255, coreG: 130, coreB: 60,  midR: 200, midG: 70,  midB: 30,  boost: 1.9 },
  blood:  { coreR: 220, coreG: 70,  coreB: 90,  midR: 120, midG: 30,  midB: 50,  boost: 1.9 },
  vow:    { coreR: 240, coreG: 230, coreB: 180, midR: 180, midG: 160, midB: 110, boost: 1.8 },
  shadow: { coreR: 180, coreG: 140, coreB: 240, midR: 100, midG: 70,  midB: 160, boost: 1.9 },
};
const _DOOR_TINT_BY_SEAL = {
  fusion:    { coreR: 255, coreG: 150, coreB: 90,  midR: 200, midG: 80,  midB: 40,  boost: 2.3 },
  legendary: { coreR: 255, coreG: 180, coreB: 240, midR: 180, midG: 100, midB: 200, boost: 2.1 },
  mythic:    { coreR: 255, coreG: 240, coreB: 200, midR: 220, midG: 180, midB: 130, boost: 2.4 },
};
const _DOOR_TINT_BY_KIND = {
  boss:      { coreR: 220, coreG: 50,  coreB: 60,  midR: 130, midG: 20,  midB: 30,  boost: 2.2 },
  miniboss:  { coreR: 200, coreG: 80,  coreB: 80,  midR: 130, midG: 40,  midB: 50,  boost: 1.8 },
  altar:     { coreR: 200, coreG: 60,  coreB: 80,  midR: 110, midG: 25,  midB: 40,  boost: 1.85 },
  shop:      { coreR: 255, coreG: 200, coreB: 100, midR: 200, midG: 130, midB: 50,  boost: 1.85 },
  sanctuary: { coreR: 130, coreG: 230, coreB: 170, midR: 60,  midG: 150, midB: 110, boost: 1.8 },
  reward:    { coreR: 130, coreG: 230, coreB: 170, midR: 60,  midG: 150, midB: 110, boost: 1.8 },
  event:     { coreR: 200, coreG: 140, coreB: 240, midR: 120, midG: 80,  midB: 180, boost: 1.85 },
  challenge: { coreR: 255, coreG: 170, coreB: 90,  midR: 180, midG: 110, midB: 50,  boost: 1.7 },
  elite:     { coreR: 220, coreG: 90,  coreB: 90,  midR: 130, midG: 50,  midB: 50,  boost: 1.8 },
};

// Resolve a door's spill-light tint via priority: special seal beats
// theme beats kind beats default amber. Substrate doors (combat /
// chestroom / trove with no theme/seal) fall through to amber so
// they keep the warm baseline appearance.
function _doorLightTint(door) {
  if (!door) return _DOOR_AMBER;
  // Special-seal reward doors first — fusion/legendary/mythic.
  const reward = (door.rewardLabel || '').toLowerCase();
  if (reward === 'fusion' && _DOOR_TINT_BY_SEAL.fusion) return _DOOR_TINT_BY_SEAL.fusion;
  if (reward === 'legendary' && _DOOR_TINT_BY_SEAL.legendary) return _DOOR_TINT_BY_SEAL.legendary;
  if (reward === 'mythic' && _DOOR_TINT_BY_SEAL.mythic) return _DOOR_TINT_BY_SEAL.mythic;
  // Themed rooms second — build-axis identity.
  if (door.roomTheme && _DOOR_TINT_BY_THEME[door.roomTheme]) {
    return _DOOR_TINT_BY_THEME[door.roomTheme];
  }
  // Kind-based tints third.
  const kind = door.targetKind || door.kind;
  if (kind && _DOOR_TINT_BY_KIND[kind]) return _DOOR_TINT_BY_KIND[kind];
  // Default amber for substrate combat / chest / trove / start.
  return _DOOR_AMBER;
}

function drawDoor(ctx, tx, ty, openAmount) {
  const x = tx * TILE, y = ty * TILE;
  const a = Math.max(0, Math.min(1, openAmount));
  const isSouthWall = ty === room.h - 1;

  // Stone wall band behind everything — fills the wall tile so any
  // sprite/transparent-margin never leaves a hole.
  ctx.fillStyle = PAL.wallBody;
  ctx.fillRect(x, y, TILE, TILE);

  // SOUTH-WALL CLOSED DOOR → render as plain wall.
  // Design: south doors are entry doors that close behind the player.
  // Once closed, "you can't go back" is the game-design beat — there's
  // no functional or visual reason to show a door panel. Showing one
  // (especially the previous vertical-flip-of-south-rotation) read as
  // an awkward "upside-down 3/4 angle" door. Now: door is visible
  // during the entry-dwell + closing animation, then becomes wall.
  // Threshold 0.005 (was 0.04) so the swap happens when the door is
  // already effectively invisible — eliminates the visible "door
  // silhouette suddenly becomes brick wall" pop at the end of the
  // 0.55s close animation.
  if (isSouthWall && a < 0.005) {
    drawWallTile(ctx, tx, ty);
    return;
  }

  // Pick rotation atlas by wall side. South rotation = door face down
  // (used for NORTH-wall doors — player is south of the door, sees it
  // facing them). North rotation = door face up (used for SOUTH-wall
  // doors — player is north of the door, sees it facing them). No
  // runtime vertical flip — looks natural at every angle.
  const sprite = isSouthWall ? images.dungeon_door_n : images.dungeon_door_s;

  // Loader miss fallback: minimal stone frame + void so nothing
  // visibly breaks if the asset didn't load.
  if (!sprite || sprite.width < 448) {
    ctx.fillStyle = PAL.doorFrame;
    ctx.fillRect(x + 2, y + 2, TILE - 4, TILE - 4);
    ctx.fillStyle = '#0a0608';
    ctx.fillRect(x + 6, y + 4, TILE - 12, TILE - 8);
    return;
  }

  const FW = 112, FH = 112;
  // Snap to nearest of 3 frames (closed / ajar / open). Cross-fade
  // reads worse than snap on pixel art at this size.
  const frameIdx = Math.min(2, Math.round(a * 2));
  const sx = frameIdx * FW;

  // Render at 73px → fills the wall row + slight overflow into floor.
  const RENDER = 73;
  const cx = x + TILE / 2;
  const cy = y + TILE / 2;
  const dx = Math.round(cx - RENDER / 2);
  const dy = Math.round(cy - RENDER / 2);

  ctx.drawImage(sprite, sx, 0, FW, FH, dx, dy, RENDER, RENDER);

  // ─── Door light spill — directional, Hades-style ─────────────────────
  // Real doorway light spills DOWNWARD onto the floor as a cone, not
  // sideways into adjacent wall stones. The previous single-radial
  // approach made an isotropic colored disc that read as a sticker
  // glued to the door, not as light from inside the room.
  //
  // Two layers now, both directional:
  //   1. Interior glow — tight radial ON the door's open area only.
  //      Tells the player "warm light visible through the doorway."
  //   2. Floor spill — vertical-gradient trapezoid extending DOWN
  //      from the door bottom onto the floor in front. This is the
  //      "carpet of light" Hades uses to make doorways read as
  //      portals leading to a lit room beyond.
  //
  // Substrate combat doors get warm amber by default. Themed and
  // special doors override the tint via _doorLightTint, with a
  // boost multiplier on alpha so build-defining choices visibly
  // bloom.
  const tint = _doorLightTint(_getDoorAt && _getDoorAt(tx, ty));
  const openCurve = 0.3 + a * 0.7;     // 0.3 closed → 1.0 open
  const baseAlpha = 0.45 * openCurve * tint.boost;
  const midAlpha  = 0.26 * openCurve * tint.boost;
  // ── Layer 1: interior glow — tight radial ON the door body only ──
  // Anchored at the door's center, kept narrow so it doesn't bleed
  // into the wall stones. Reads as "the next room is lit and visible
  // through the open doorway."
  const interior = ctx.createRadialGradient(
    cx, y + TILE * 0.45, 1,
    cx, y + TILE * 0.45, TILE * 0.42,
  );
  interior.addColorStop(0,    `rgba(${tint.coreR}, ${tint.coreG}, ${tint.coreB}, ${baseAlpha.toFixed(3)})`);
  interior.addColorStop(0.55, `rgba(${tint.midR}, ${tint.midG}, ${tint.midB}, ${(midAlpha * 0.85).toFixed(3)})`);
  interior.addColorStop(1,    'rgba(0, 0, 0, 0)');
  ctx.fillStyle = interior;
  // Constrain fill to the door's vertical band so adjacent wall
  // stones don't pick up significant tint.
  ctx.fillRect(x - 4, y, TILE + 8, TILE);

  // ── Layer 2: floor spill — directional cone onto the floor ───────
  // Vertical linear gradient — bright at the door bottom, fading to
  // transparent over ~28 px going down. Trapezoidal width: as wide
  // as the door at top, slightly wider at the bottom (perspective
  // expansion, like a real light cone). Skipped for south-wall doors
  // (their "spill" would go up into the wall, which doesn't make
  // sense — south doors are entry doors, not light sources).
  if (!isSouthWall && a > 0.05) {
    const spillH = 30;
    const topY = y + TILE - 2;
    const topInset = 8;        // narrower at top (door-width)
    const botInset = -2;       // wider at bottom (light cone expansion)
    const spillGrad = ctx.createLinearGradient(cx, topY, cx, topY + spillH);
    spillGrad.addColorStop(0,    `rgba(${tint.coreR}, ${tint.coreG}, ${tint.coreB}, ${(baseAlpha * 0.85).toFixed(3)})`);
    spillGrad.addColorStop(0.4,  `rgba(${tint.midR}, ${tint.midG}, ${tint.midB}, ${(midAlpha * 0.55).toFixed(3)})`);
    spillGrad.addColorStop(1,    'rgba(0, 0, 0, 0)');
    ctx.fillStyle = spillGrad;
    ctx.beginPath();
    ctx.moveTo(x + topInset,           topY);
    ctx.lineTo(x + TILE - topInset,    topY);
    ctx.lineTo(x + TILE - botInset,    topY + spillH);
    ctx.lineTo(x + botInset,           topY + spillH);
    ctx.closePath();
    ctx.fill();
  }

  // Next-room preview pulse — legacy fallback for rooms with no door
  // object. Kept since some legacy spawn paths still rely on it.
  if (a > 0.6 && ty === 0 && roomNextKind.kind && _getDoorAt && !_getDoorAt(tx, ty)) {
    drawDoorPreview(ctx, x + TILE/2, y - 14, roomNextKind.kind);
  }
}

// ─── DOOR LINTEL OCCLUSION PASS ──────────────────────────────────────────────
// Re-draws just the TOP HALF of each door's sprite (the lintel + arch
// keystone). Called from main.js AFTER the hero/enemy drawList renders,
// so when the player stands in a door tile their head reads as BEHIND
// the lintel — "I'm in the doorway" rather than "I'm a sprite painted
// on top of a door image."
//
// Two skips:
//   - 'wall' tiles: not doors, no lintel needed
//   - South-wall doors at openAmount<0.04: drawDoor renders these as
//     plain wall (player can't go back), so there's no door sprite to
//     occlude with — and re-blitting a lintel here would show a stone
//     arch on top of a wall, breaking the "this is a wall" illusion.
//
// Atlas selection: north-wall doors use door_s, south-wall doors use
// door_n (matches drawDoor — no vertical flip artifact).
export function drawDoorLintels(ctx) {
  if (!room.tiles) return;
  const FW = 112, FH = 112;
  const RENDER = 73;
  const topFracDst = 0.55;
  const dstH = Math.round(RENDER * topFracDst);
  const srcH = Math.round(FH * topFracDst);

  for (let ty = 0; ty < room.h; ty++) {
    const row = room.tiles[ty];
    if (!row) continue;
    for (let tx = 0; tx < room.w; tx++) {
      if (row[tx] !== 'door') continue;
      const door = _getDoorAt && _getDoorAt(tx, ty);
      let a;
      if (door) a = Math.max(0, Math.min(1, door.anim));
      else a = (ty === room.h - 1 && room.cleared) ? 1 : 0;
      const isSouthWall = ty === room.h - 1;
      // Skip occlusion for closed south-wall doors — drawDoor rendered
      // them as plain wall, so there's no door sprite below the hero
      // for a lintel to occlude. Re-blitting a stone arch over a wall
      // tile would look like a phantom arch glued on the floor. Same
      // 0.005 threshold drawDoor uses so the two passes flip in sync.
      if (isSouthWall && a < 0.005) continue;
      const sprite = isSouthWall ? images.dungeon_door_n : images.dungeon_door_s;
      if (!sprite || sprite.width < 448) continue;
      const frameIdx = Math.min(2, Math.round(a * 2));
      const sx = frameIdx * FW;
      const x = tx * TILE, y = ty * TILE;
      const cx = x + TILE / 2;
      const cy = y + TILE / 2;
      const dx = Math.round(cx - RENDER / 2);
      const dy = Math.round(cy - RENDER / 2);
      // No vertical flip needed now — both atlases already point the
      // door face the right direction. The TOP of each atlas IS the
      // lintel/arch keystone for that rotation, so a top-source slice
      // captures the right pixels for both walls.
      ctx.drawImage(sprite, sx, 0, FW, srcH, dx, dy, RENDER, dstH);
    }
  }
}

// Spike trap — draws 4 pyramidal spikes rising/retracting based on state.
function drawSpike(ctx, tx, ty, state) {
  const x = tx * TILE, y = ty * TILE;
  const cx = x + TILE/2;
  const cy = y + TILE/2;
  // Spike rises based on state
  let riseT = 0;      // 0 = fully retracted, 1 = fully extended
  if (state.kind === 'warning') riseT = 0.25 + state.progress * 0.35;
  else if (state.kind === 'active') riseT = 0.9 + (1 - state.progress) * 0.1;

  // ── Base pit — INSET MECHANICAL FLOOR PLATE ────────────────────
  // Reads as "this floor tile is rigged" rather than a flat dark square.
  // Sequence: outer recessed shadow → inner stone slab → cross slot
  // (where the spikes emerge) → 4 corner studs (rivets). Same overall
  // dark mass as before but with enough bevel + detail to communicate
  // a TRAP rather than "dark patch on floor".
  // 1) Outer recess — slight ambient occlusion ring around the plate
  ctx.fillStyle = 'rgba(0,0,0,0.42)';
  ctx.fillRect(x + 4, y + 4, TILE - 8, TILE - 8);
  // 2) Inner stone slab — slightly lighter than the recess so the
  // plate reads as inset into the floor
  ctx.fillStyle = 'rgba(28, 22, 28, 0.95)';
  ctx.fillRect(x + 7, y + 7, TILE - 14, TILE - 14);
  // 3) Top bevel highlight (catches overhead light)
  ctx.fillStyle = 'rgba(80, 70, 78, 0.55)';
  ctx.fillRect(x + 7, y + 7, TILE - 14, 1);
  ctx.fillStyle = 'rgba(80, 70, 78, 0.30)';
  ctx.fillRect(x + 7, y + 7, 1, TILE - 14);
  // 4) Bottom-right shadow rim (depth on the opposite edges)
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.fillRect(x + 7, y + TILE - 8, TILE - 14, 1);
  ctx.fillRect(x + TILE - 8, y + 7, 1, TILE - 14);
  // 5) Cross-slot grooves — the seam where the spikes emerge.
  // Two perpendicular dark lines through the center, calling out
  // "moving parts inside this plate".
  ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
  ctx.fillRect(x + 10, cy - 0.5, TILE - 20, 1);    // horizontal slot
  ctx.fillRect(cx - 0.5, y + 10, 1, TILE - 20);    // vertical slot
  // 6) 4 corner rivets — small metal studs at the plate corners.
  // Bigger + more contrasted than the previous 3×3 dots so they read
  // as iron hardware, not noise.
  const studPositions = [[12, 12], [TILE - 14, 12], [12, TILE - 14], [TILE - 14, TILE - 14]];
  for (const [sxOff, syOff] of studPositions) {
    // Stud body
    ctx.fillStyle = 'rgba(60, 50, 55, 0.95)';
    ctx.fillRect(x + sxOff - 1, y + syOff - 1, 4, 4);
    // Stud highlight
    ctx.fillStyle = 'rgba(110, 100, 110, 0.85)';
    ctx.fillRect(x + sxOff - 1, y + syOff - 1, 4, 1);
    ctx.fillRect(x + sxOff - 1, y + syOff - 1, 1, 3);
  }

  if (riseT <= 0.02) {
    // Fully retracted — base plate above is the entire visual.
    // The cross-slot + studs make the plate read as a trap mechanism
    // even when the spikes themselves are hidden.
    return;
  }
  // Warning state tremble
  const shake = state.kind === 'warning' ? (Math.sin(state.progress * 40) * 0.8) : 0;
  // Draw 4 pyramid spikes
  const positions = [[13, 13], [33, 13], [13, 33], [33, 33]];
  const spikeH = 20 * riseT;
  for (const [sx, sy] of positions) {
    const px = x + sx + shake;
    const py = y + sy;
    // Shadow base
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.ellipse(px + 2, py + 2, 4, 1.5, 0, 0, Math.PI * 2);
    ctx.fill();
    // Spike body (dark)
    ctx.fillStyle = '#2a2026';
    ctx.beginPath();
    ctx.moveTo(px - 3, py + 2);
    ctx.lineTo(px + 3, py + 2);
    ctx.lineTo(px, py + 2 - spikeH);
    ctx.closePath();
    ctx.fill();
    // Lit edge (catches torchlight from the left)
    ctx.fillStyle = state.kind === 'active' ? '#a85a55' : '#6e5a5f';
    ctx.beginPath();
    ctx.moveTo(px - 3, py + 2);
    ctx.lineTo(px, py + 2 - spikeH);
    ctx.lineTo(px - 1, py + 2 - spikeH * 0.3);
    ctx.closePath();
    ctx.fill();
    // Tip highlight when active
    if (state.kind === 'active') {
      ctx.fillStyle = 'rgba(255, 80, 60, 0.85)';
      ctx.fillRect(px - 1, py + 2 - spikeH, 2, 2);
    }
  }
  // Warning halo — red glow on floor when about to fire
  if (state.kind === 'warning') {
    const g = ctx.createRadialGradient(cx, y + TILE/2, 4, cx, y + TILE/2, TILE * 0.6);
    g.addColorStop(0, 'rgba(220, 60, 40, ' + (0.35 * state.progress).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(220, 60, 40, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - TILE/4, y - TILE/4, TILE * 1.5, TILE * 1.5);
  }
}

function drawAltar(ctx, tx, ty) {
  const x = tx * TILE, y = ty * TILE;
  const cx = x + TILE/2, cy = y + TILE/2;
  // Ground glow — dark red
  const g = ctx.createRadialGradient(cx, cy + 4, 8, cx, cy + 4, TILE * 1.4);
  g.addColorStop(0, 'rgba(255, 60, 80, 0.32)');
  g.addColorStop(0.5, 'rgba(180, 30, 50, 0.15)');
  g.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(x - TILE, y - TILE, TILE * 3, TILE * 3);
  // Obelisk body — tall dark stone tapering
  const obH = 54;
  const pts = [
    [cx - 10, cy + 14],
    [cx + 10, cy + 14],
    [cx + 7,  cy + 14 - obH],
    [cx - 7,  cy + 14 - obH],
  ];
  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.beginPath();
  ctx.ellipse(cx, cy + 16, 18, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  // Body — vertical gradient
  const bg = ctx.createLinearGradient(cx, cy + 14 - obH, cx, cy + 14);
  bg.addColorStop(0, PAL.altarLit);
  bg.addColorStop(0.5, PAL.altarMid);
  bg.addColorStop(1, PAL.altarDark);
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  ctx.lineTo(pts[1][0], pts[1][1]);
  ctx.lineTo(pts[2][0], pts[2][1]);
  ctx.lineTo(pts[3][0], pts[3][1]);
  ctx.closePath();
  ctx.fill();
  // Left-side highlight
  ctx.fillStyle = 'rgba(255, 200, 180, 0.08)';
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  ctx.lineTo(pts[0][0] + 3, pts[0][1]);
  ctx.lineTo(pts[3][0] + 2, pts[3][1]);
  ctx.lineTo(pts[3][0], pts[3][1]);
  ctx.closePath();
  ctx.fill();
  // Crystal on top — pulsing red gem
  const pulse = 0.65 + 0.35 * Math.sin((Date.now() / 400));
  const crystalY = cy + 14 - obH - 4;
  ctx.fillStyle = 'rgba(255, 80, 100, ' + (0.4 * pulse).toFixed(3) + ')';
  ctx.beginPath();
  ctx.arc(cx, crystalY, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PAL.altarCrystal;
  ctx.fillRect(cx - 3, crystalY - 5, 6, 10);
  ctx.fillStyle = '#ffddea';
  ctx.fillRect(cx - 1, crystalY - 4, 2, 4);
}

function drawPedestal(ctx, tx, ty) {
  const x = tx * TILE, y = ty * TILE;
  const cx = x + TILE/2, cy = y + TILE/2;
  // Green healing glow ring on floor
  const g = ctx.createRadialGradient(cx, cy + 4, 6, cx, cy + 4, TILE);
  g.addColorStop(0, PAL.glow);
  g.addColorStop(0.4, 'rgba(126, 220, 176, 0.18)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x - TILE/2, y - TILE/2, TILE * 2, TILE * 2);
  // Ground shadow
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.beginPath();
  ctx.ellipse(cx, cy + 16, 22, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  // Base plinth — wide
  ctx.fillStyle = PAL.pedestalDark;
  ctx.fillRect(cx - 20, cy + 10, 40, 6);
  ctx.fillStyle = PAL.pedestalMid;
  ctx.fillRect(cx - 18, cy + 4, 36, 8);
  // Shaft — mid layer
  ctx.fillStyle = PAL.pedestalMid;
  ctx.fillRect(cx - 14, cy - 2, 28, 8);
  // Shaft shading
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fillRect(cx + 8, cy - 2, 6, 8);
  // Top cap — widest
  ctx.fillStyle = PAL.pedestalLit;
  ctx.fillRect(cx - 17, cy - 7, 34, 5);
  // Top cap inner chamfer
  ctx.fillStyle = PAL.pedestalMid;
  ctx.fillRect(cx - 15, cy - 4, 30, 2);
  // Top surface highlight
  ctx.fillStyle = 'rgba(255, 240, 220, 0.18)';
  ctx.fillRect(cx - 16, cy - 7, 32, 1);
  // Carved rune on shaft face
  ctx.fillStyle = 'rgba(180, 220, 200, 0.45)';
  ctx.fillRect(cx - 4, cy + 1, 1, 3);
  ctx.fillRect(cx + 3, cy + 1, 1, 3);
  ctx.fillRect(cx - 4, cy + 2, 8, 1);
}

function drawCrack(ctx, tx, ty) {
  // A more organic crack with multiple branches + slight glow for readability
  const x = tx * TILE, y = ty * TILE;
  const h = hash(tx, ty);
  const sx = x + 6 + (h % 16);
  const sy = y + 12 + ((h >>> 4) % 14);
  // Subtle dark halo under the crack so it reads on mid-tone floor
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  const mx1 = sx + 10, my1 = sy - 2 + ((h >>> 8) % 4);
  const mx2 = sx + 22, my2 = sy + 4 + ((h >>> 12) % 4);
  const ex  = sx + 32, ey  = sy + 1 + ((h >>> 16) % 3);
  ctx.bezierCurveTo(mx1, my1, mx2, my2, ex, ey);
  ctx.stroke();
  // Actual crack line — crisp
  ctx.strokeStyle = PAL.floorCrack;
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.bezierCurveTo(mx1, my1, mx2, my2, ex, ey);
  ctx.stroke();
  // 2 branching cracks
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(mx1, my1);
  ctx.lineTo(mx1 + 5, my1 + 7);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(mx2, my2);
  ctx.lineTo(mx2 - 3, my2 + 5);
  ctx.stroke();
}

function drawRubble(ctx, tx, ty) {
  // Corner rubble — a larger, more readable pile of broken stone chunks.
  const x = tx * TILE, y = ty * TILE;
  const h = hash(tx, ty);
  const cx = x + TILE/2, cy = y + TILE * 0.65;
  // Ground shadow — wider
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.beginPath();
  ctx.ellipse(cx, cy + 10, 28, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  // 5 stone chunks — bigger, more varied
  for (let i = 0; i < 5; i++) {
    const ox = ((hash(i + 7, tx * 5 + 3) % 32) - 16);
    const oy = ((hash(i + 11, ty * 7 + 5) % 14) - 7);
    const sz = 11 + (hash(i + 1, tx + ty) % 8);
    const px = cx + ox, py = cy + oy;
    // Dark base — creates depth
    ctx.fillStyle = PAL.rubbleDark;
    ctx.fillRect(px - sz/2, py - sz/2 + 2, sz, sz - 1);
    // Mid body
    ctx.fillStyle = PAL.rubbleMid;
    ctx.fillRect(px - sz/2, py - sz/2, sz, sz - 4);
    // Lit top edge (2px) — catches "overhead light"
    ctx.fillStyle = PAL.rubbleLit;
    ctx.fillRect(px - sz/2, py - sz/2, sz, 2);
    // Tiny pebble fragment
    if (i === 2) {
      ctx.fillStyle = PAL.rubbleDark;
      ctx.fillRect(px + sz/2 + 2, py + sz/2 - 2, 3, 2);
    }
  }
  // A couple of bone fragments sticking out
  ctx.strokeStyle = 'rgba(220, 210, 190, 0.55)';
  ctx.lineWidth = 1.2;
  ctx.lineCap = 'round';
  const bx = cx + ((h % 14) - 7);
  const by = cy - 2;
  ctx.beginPath();
  ctx.moveTo(bx, by);
  ctx.lineTo(bx + 6, by - 4);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(bx + 7, by - 5, 1.5, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(220, 210, 190, 0.7)';
  ctx.stroke();
}

// â”€â”€ SET-PIECE DECOR â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// All decorative (no collision); each biome-agnostic but reads well on
// any floor palette.

function drawBones(ctx, tx, ty) {
  // Skeleton remains — skull + scattered long bones
  const x = tx * TILE, y = ty * TILE;
  const h = hash(tx, ty);
  const cx = x + TILE/2, cy = y + TILE * 0.65;
  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath();
  ctx.ellipse(cx, cy + 8, 22, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  // Skull
  ctx.fillStyle = '#e8e0c8';
  ctx.fillRect(cx - 7, cy - 2, 14, 10);
  ctx.fillRect(cx - 5, cy + 8, 10, 4);
  // Eye sockets + nose
  ctx.fillStyle = '#1a1410';
  ctx.fillRect(cx - 5, cy, 3, 3);
  ctx.fillRect(cx + 2, cy, 3, 3);
  ctx.fillRect(cx - 1, cy + 4, 2, 3);
  // Scattered bones
  ctx.strokeStyle = '#d8ccb0';
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  const angs = [(h % 12) / 12 * Math.PI, ((h >> 3) % 12) / 12 * Math.PI + 1.5];
  for (const a of angs) {
    const sx = cx + Math.cos(a) * 12;
    const sy = cy + Math.sin(a) * 8;
    const ex = cx + Math.cos(a) * 22;
    const ey = cy + Math.sin(a) * 14;
    ctx.beginPath();
    ctx.moveTo(sx, sy); ctx.lineTo(ex, ey);
    ctx.stroke();
    // Knob ends
    ctx.fillStyle = '#e8dcbc';
    ctx.beginPath();
    ctx.arc(ex, ey, 1.8, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawBanner(ctx, tx, ty) {
  // Tall hanging tapestry — attached to an unseen point above, drapes down
  const x = tx * TILE, y = ty * TILE;
  const cx = x + TILE/2, cy = y + 6;
  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(cx - 10, y + TILE - 6, 20, 4);
  // Banner cloth — crimson with gold accents
  const bannerW = 18, bannerH = 38;
  const bx = cx - bannerW / 2, by = cy;
  ctx.fillStyle = '#3a0a14';
  ctx.fillRect(bx, by, bannerW, bannerH);
  ctx.fillStyle = '#5a1828';
  ctx.fillRect(bx + 2, by + 1, bannerW - 4, bannerH - 4);
  // Gold crest stripe
  ctx.fillStyle = '#c9a86a';
  ctx.fillRect(bx, by, bannerW, 2);
  ctx.fillRect(bx, by + bannerH - 2, bannerW, 2);
  // Center emblem — simple diamond
  ctx.fillStyle = '#f4d9a0';
  ctx.beginPath();
  ctx.moveTo(cx, by + 12); ctx.lineTo(cx + 4, by + 18);
  ctx.lineTo(cx, by + 24); ctx.lineTo(cx - 4, by + 18);
  ctx.closePath();
  ctx.fill();
  // Tasseled bottom — small triangles
  ctx.fillStyle = '#3a0a14';
  ctx.beginPath();
  ctx.moveTo(bx, by + bannerH);
  ctx.lineTo(bx + 4, by + bannerH + 4);
  ctx.lineTo(bx + 8, by + bannerH);
  ctx.lineTo(bx + 12, by + bannerH + 4);
  ctx.lineTo(bx + bannerW, by + bannerH);
  ctx.closePath();
  ctx.fill();
}

function drawStatue(ctx, tx, ty) {
  // Broken statue of a kneeling figure — pedestal + torso stub
  const x = tx * TILE, y = ty * TILE;
  const cx = x + TILE/2, cy = y + TILE * 0.7;
  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.beginPath();
  ctx.ellipse(cx, cy + 6, 20, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  // Pedestal base
  ctx.fillStyle = PAL.pillarBase || '#2a2430';
  ctx.fillRect(cx - 12, cy - 4, 24, 10);
  ctx.fillStyle = PAL.pillarMid || '#44404c';
  ctx.fillRect(cx - 11, cy - 4, 22, 3);
  // Broken torso — a tall chunk with rough edges
  ctx.fillStyle = PAL.pillarMid || '#44404c';
  ctx.fillRect(cx - 7, cy - 24, 14, 22);
  ctx.fillStyle = PAL.pillarTop || '#6a6478';
  ctx.fillRect(cx - 7, cy - 24, 14, 3);
  // Break line — jagged top
  ctx.fillStyle = PAL.pillarBase || '#2a2430';
  ctx.fillRect(cx - 6, cy - 28, 4, 4);
  ctx.fillRect(cx, cy - 26, 3, 2);
  ctx.fillRect(cx + 4, cy - 29, 3, 5);
  // Arm stub
  ctx.fillStyle = PAL.pillarMid || '#44404c';
  ctx.fillRect(cx - 10, cy - 14, 3, 6);
}

function drawRug(ctx, tx, ty) {
  // Oriental rug — rectangle with edge pattern
  const x = tx * TILE, y = ty * TILE;
  const cx = x + TILE/2, cy = y + TILE/2;
  // Rug body
  ctx.fillStyle = '#4a1828';
  ctx.fillRect(cx - 20, cy - 14, 40, 28);
  ctx.fillStyle = '#6a2838';
  ctx.fillRect(cx - 19, cy - 13, 38, 26);
  // Pattern stripes
  ctx.fillStyle = '#c9a86a';
  ctx.fillRect(cx - 17, cy - 12, 34, 1);
  ctx.fillRect(cx - 17, cy + 11, 34, 1);
  ctx.fillRect(cx - 17, cy - 12, 1, 24);
  ctx.fillRect(cx + 16, cy - 12, 1, 24);
  // Center diamond motif
  ctx.fillStyle = '#c9a86a';
  ctx.beginPath();
  ctx.moveTo(cx, cy - 8); ctx.lineTo(cx + 10, cy);
  ctx.lineTo(cx, cy + 8); ctx.lineTo(cx - 10, cy);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#4a1828';
  ctx.beginPath();
  ctx.moveTo(cx, cy - 5); ctx.lineTo(cx + 6, cy);
  ctx.lineTo(cx, cy + 5); ctx.lineTo(cx - 6, cy);
  ctx.closePath();
  ctx.fill();
  // Tassels on short ends
  ctx.strokeStyle = '#c9a86a';
  ctx.lineWidth = 1;
  for (let k = 0; k < 5; k++) {
    const tx2 = cx - 20 + k * 10;
    ctx.beginPath();
    ctx.moveTo(tx2, cy - 14); ctx.lineTo(tx2, cy - 17);
    ctx.moveTo(tx2, cy + 14); ctx.lineTo(tx2, cy + 17);
    ctx.stroke();
  }
}

function drawChest(ctx, tx, ty) {
  // Old wooden chest — slightly ajar, golden trim
  const x = tx * TILE, y = ty * TILE;
  const cx = x + TILE/2, cy = y + TILE * 0.7;
  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.beginPath();
  ctx.ellipse(cx, cy + 10, 20, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  // Chest body
  ctx.fillStyle = '#2a1810';
  ctx.fillRect(cx - 16, cy - 8, 32, 18);
  ctx.fillStyle = '#4a2818';
  ctx.fillRect(cx - 15, cy - 7, 30, 16);
  // Gold trim + handle
  ctx.fillStyle = '#c9a86a';
  ctx.fillRect(cx - 15, cy - 2, 30, 2);      // center band
  ctx.fillRect(cx - 15, cy - 7, 2, 16);      // left corner
  ctx.fillRect(cx + 13, cy - 7, 2, 16);      // right corner
  // Lid separation — already ajar
  ctx.fillStyle = '#1a1008';
  ctx.fillRect(cx - 14, cy - 7, 28, 1);
  // Keyhole
  ctx.fillStyle = '#1a1008';
  ctx.fillRect(cx - 1, cy + 2, 2, 3);
  ctx.beginPath();
  ctx.arc(cx, cy + 2, 1.5, 0, Math.PI * 2);
  ctx.fill();
  // Glint
  ctx.fillStyle = 'rgba(255, 230, 170, 0.4)';
  ctx.fillRect(cx - 12, cy - 6, 3, 1);
}

// â”€â”€ RUIN STAINS + AGING â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Blood stain where the hero has died before. Scorch stain where bosses fell.
// Both scale in spread + darkness with intensity (1-3).
function drawRuinStain(ctx, stain) {
  const intensity = Math.max(1, Math.min(3, stain.intensity | 0 || 1));
  const cx = Math.floor(room.w / 2) * TILE + TILE / 2;
  const cy = Math.floor(room.h / 2) * TILE + TILE / 2;
  // Deterministic splatter pattern — seeded by intensity so it looks "real"
  const seed = 1234 + intensity * 89;
  const splatCount = 5 + intensity * 3;
  const maxR = 26 + intensity * 14;
  if (stain.kind === 'blood') {
    ctx.save();
    for (let i = 0; i < splatCount; i++) {
      const ang = (hash(i, seed) % 1000) / 1000 * Math.PI * 2;
      const dist = (hash(i + 1, seed * 3) % 100) / 100 * maxR;
      const px = cx + Math.cos(ang) * dist;
      const py = cy + Math.sin(ang) * dist * 0.7;
      const size = 8 + (hash(i + 2, seed * 7) % 12);
      // Dark outer blood
      ctx.fillStyle = `rgba(60, 10, 18, ${(0.32 + intensity * 0.12).toFixed(3)})`;
      ctx.beginPath();
      ctx.ellipse(px, py, size, size * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
      // Darker center
      ctx.fillStyle = `rgba(90, 18, 24, ${(0.2 + intensity * 0.15).toFixed(3)})`;
      ctx.beginPath();
      ctx.ellipse(px, py, size * 0.55, size * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  } else if (stain.kind === 'scorch') {
    ctx.save();
    // Central charred disc + surrounding flecks
    const scorchR = 40 + intensity * 20;
    const g = ctx.createRadialGradient(cx, cy, 4, cx, cy, scorchR);
    g.addColorStop(0, `rgba(18, 6, 4, ${(0.45 + intensity * 0.15).toFixed(3)})`);
    g.addColorStop(0.6, `rgba(30, 12, 8, ${(0.22 + intensity * 0.1).toFixed(3)})`);
    g.addColorStop(1, 'rgba(30, 12, 8, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - scorchR, cy - scorchR, scorchR * 2, scorchR * 2);
    // Charred flecks
    for (let i = 0; i < splatCount; i++) {
      const ang = (hash(i, seed * 11) % 1000) / 1000 * Math.PI * 2;
      const dist = (hash(i + 3, seed * 5) % 100) / 100 * (scorchR + 10);
      const px = cx + Math.cos(ang) * dist;
      const py = cy + Math.sin(ang) * dist * 0.7;
      ctx.fillStyle = `rgba(8, 4, 2, ${(0.4 + intensity * 0.1).toFixed(3)})`;
      ctx.fillRect(px - 1.5, py - 1.5, 3, 3);
    }
    ctx.restore();
  }
}

// Dungeon cobwebs — aging level 1-4 controls density (5 deaths = level 1, etc).
// Placed in top corners deterministically so they re-appear in same spots.
function drawRuinCobwebs(ctx, agingLvl) {
  const spots = [
    { x: 1 * TILE, y: 1 * TILE, quadrant: 'tl' },
    { x: (room.w - 2) * TILE, y: 1 * TILE, quadrant: 'tr' },
  ];
  if (agingLvl >= 2) {
    spots.push({ x: 1 * TILE, y: (room.h - 2) * TILE, quadrant: 'bl' });
  }
  if (agingLvl >= 3) {
    spots.push({ x: (room.w - 2) * TILE, y: (room.h - 2) * TILE, quadrant: 'br' });
  }
  ctx.save();
  const strands = agingLvl >= 4 ? 6 : agingLvl >= 2 ? 4 : 3;
  const alpha = 0.15 + agingLvl * 0.08;
  ctx.strokeStyle = `rgba(220, 210, 200, ${alpha.toFixed(3)})`;
  ctx.lineWidth = 0.6;
  for (const s of spots) {
    // Draw fan-shaped web from the corner
    const xSign = s.quadrant.endsWith('r') ? -1 : 1;
    const ySign = s.quadrant.startsWith('b') ? -1 : 1;
    for (let i = 0; i < strands; i++) {
      const ang = (i / (strands - 1)) * Math.PI / 2;
      const len = 18 + i * 2;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x + Math.cos(ang) * len * xSign, s.y + Math.sin(ang) * len * ySign);
      ctx.stroke();
    }
    // Connector arcs between strands
    for (let k = 1; k <= 2; k++) {
      const r = 6 + k * 4;
      ctx.beginPath();
      ctx.arc(s.x, s.y, r, 0, Math.PI / 2);
      ctx.stroke();
    }
  }
  ctx.restore();
}

// Wall-mounted torch — sconce + fuel. Flame color swaps per biome (blue crypt,
// amber vault, red abyss) so the whole room feels different before you move.
// Wall torch sconce — animated PixelLab sprite (4 frames × 112×112) at
// scale 0.45 → ~50px rendered. Replaces a tiny procedural sconce that
// existed before; the new sprite is detailed pixel art with proper
// flame flicker. The light halo math (in the lighting pass elsewhere)
// still keys off roomTorches positions, so gameplay illumination is
// unchanged — only the visual got upgraded.
const TORCH_FPS = 6;
const TORCH_FRAMES = 4;
const TORCH_NATIVE = 112;
const TORCH_SCALE = 0.45;
function drawTorchSconce(ctx, tx, ty) {
  const cx = tx * TILE + TILE / 2;
  const cy = ty * TILE + TILE * 0.7;     // sit slightly into room from wall edge
  const img = images.fx_dungeon_torch;
  if (img) {
    const now = (typeof performance !== 'undefined') ? performance.now() / 1000 : 0;
    // Phase offset per-torch via tx + ty + a prime multiplier so torches
    // on different walls/columns don't tick to the next animation frame
    // in lockstep. The light halo math (in main.js) already staggers via
    // a similar tx*7 offset; this keeps sprite + halo flicker visually
    // synced per-torch but offset BETWEEN torches.
    const phaseOffset = tx * 7 + ty * 13;
    const frame = (Math.floor(now * TORCH_FPS) + phaseOffset) % TORCH_FRAMES;
    const drawW = TORCH_NATIVE * TORCH_SCALE;
    const drawH = TORCH_NATIVE * TORCH_SCALE;
    const prevSmoothing = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      img,
      frame * TORCH_NATIVE, 0, TORCH_NATIVE, TORCH_NATIVE,
      Math.round(cx - drawW / 2),
      Math.round(cy - drawH / 2),
      drawW, drawH,
    );
    ctx.imageSmoothingEnabled = prevSmoothing;
    return;
  }
  // Fallback: procedural sconce (used before sprite loads, or in tests)
  ctx.fillStyle = PAL.torchMetal;
  ctx.fillRect(cx - 2, cy, 4, 10);
  ctx.fillRect(cx - 5, cy + 9, 10, 3);
  ctx.fillStyle = PAL.torchSconce;
  ctx.fillRect(cx - 4, cy - 4, 8, 6);
  ctx.fillStyle = PAL.torchCore || '#ffb46e';
  ctx.fillRect(cx - 2, cy - 3, 4, 3);
  ctx.fillStyle = PAL.torchEmber || '#ffe5a0';
  ctx.fillRect(cx - 1, cy - 3, 2, 2);
}

// ─── PREVIOUS-ROOM RESIDUE ──────────────────────────────────────────────
// When the hero walks through a door, we keep a snapshot of the room they
// just left around for ~1.5s, rendered at an offset so it appears on the
// other side of the door from the new current room. This is the "you can
// see the remnants of the old room as you walk through" beat — what makes
// the dungeon feel like a connected building instead of a chain of
// disconnected screens.
//
// The snapshot copies tiles + decor + dimensions. The new room loads as
// the current `room`. drawRoom draws the current room first, then walks
// the prevRoom snapshot through the same passes with a temporary state
// swap so we don't have to thread `room` through every drawing helper.
export let prevRoom = null;

export function snapshotPrevRoom(opts = {}) {
  if (!room.tiles) return;
  prevRoom = {
    tiles: room.tiles.map(r => r.slice()),
    decor: room.decor ? room.decor.slice() : [],
    w: room.w, h: room.h,
    kind: room.kind,
    // The hero exited this room — it was definitely cleared. Mark so the
    // drawDoor fallback renders the north door as visually open.
    cleared: true,
    // Per-door-tile open amount snapshot. Without this, drawing prevRoom
    // would query the CURRENT room's roomDoors (via the live _getDoorAt
    // callback), which has different tile positions, so prevRoom's door
    // tiles fell back to "closed unless south + cleared" — meaning the
    // very door the player just walked through visibly RESETS to closed
    // during the 1.8s fade-out residue. The doorOpenAt map preserves the
    // exit door's open state so it stays visually open through the fade.
    // Shape: { 'tx,ty': openAmount } — used by drawRoom's prevRoom pass.
    doorOpenAt: opts.doorOpenAt || {},
    // Caller fills in offsetX / offsetY so the door tile in prevRoom
    // visually overlaps the south door tile of the new current room.
    offsetX: opts.offsetX || 0,
    offsetY: opts.offsetY || 0,
    alpha: 1.0,
    // 1.8s gives the player time to register "where I came from" without
    // lingering long enough to feel cluttered. Door close-behind animation
    // (~1.1s total: 0.55s dwell + 0.55s close) finishes well before fade-out.
    life: 1.8,
    lifeMax: 1.8,
  };
}

export function tickPrevRoom(dt) {
  if (!prevRoom) return;
  prevRoom.life -= dt;
  prevRoom.alpha = Math.max(0, Math.min(1, prevRoom.life / prevRoom.lifeMax));
  if (prevRoom.life <= 0) prevRoom = null;
}

export function clearPrevRoom() { prevRoom = null; }

// ─── TILE CACHE — perf P0 ────────────────────────────────────────────────────
// Renders the room's static layers (floor + wear + organic detail + wall
// shadows + walls + frieze + decor + ruin stains) ONCE to an offscreen
// canvas and reuses that image every frame as a single drawImage call.
// Without this, ~700-1000 canvas ops per frame are spent redrawing
// geometry that doesn't change. The dynamic layers (doors animating,
// pedestals bobbing, torches flickering) still draw live each frame on
// top of the cache.
//
// Invalidated on:
//   - buildRoomFromData (room load — tiles + decor reset)
//   - damageCrackedWall (a tile flips from 'crackedwall' to 'floor')
//
// The prevRoom snapshot path bypasses the cache (forceFullDraw=true) so
// the fading old-room render doesn't accidentally show the live room.
let _tileCache = null;
let _tileCacheCtx = null;
let _tileCacheW = 0;
let _tileCacheH = 0;
let _tileCacheDirty = true;

export function invalidateTileCache() { _tileCacheDirty = true; }

function _ensureTileCache() {
  if (typeof document === 'undefined') return false;
  const w = room.w * TILE, h = room.h * TILE;
  if (!_tileCache || _tileCacheW !== w || _tileCacheH !== h) {
    _tileCache = document.createElement('canvas');
    _tileCache.width = w;
    _tileCache.height = h;
    _tileCacheCtx = _tileCache.getContext('2d');
    if (_tileCacheCtx) _tileCacheCtx.imageSmoothingEnabled = false;
    _tileCacheW = w;
    _tileCacheH = h;
    _tileCacheDirty = true;
  }
  if (!_tileCacheCtx) return false;
  if (_tileCacheDirty) {
    _tileCacheCtx.clearRect(0, 0, w, h);
    drawRoomStaticLayers(_tileCacheCtx);
    _tileCacheDirty = false;
  }
  return true;
}

export function drawRoom(ctx) {
  if (!room.tiles) return;
  // Draw the current room first
  drawRoomInner(ctx);
  // Then draw the prevRoom snapshot as a fading residue, offset so its
  // door aligns with the current room's south door (handled by caller).
  if (prevRoom && prevRoom.alpha > 0.01 && prevRoom.tiles && prevRoom.tiles.length > 0) {
    ctx.save();
    ctx.globalAlpha = ctx.globalAlpha * prevRoom.alpha;
    ctx.translate(prevRoom.offsetX, prevRoom.offsetY);
    // Temporarily swap singleton state so all the existing drawing helpers
    // (drawWallTile, drawFloorTile, drawDoor, etc.) operate on the snapshot
    // without any threading work. try/finally ensures restoration even if
    // an exception fires inside drawRoomInner — otherwise room.tiles would
    // be left pointing at the snapshot, breaking every subsequent frame.
    const saved = {
      tiles: room.tiles, w: room.w, h: room.h,
      decor: room.decor, kind: room.kind, cleared: room.cleared,
      // _getDoorAt is module-private; swap into a stub that resolves
      // from the prevRoom.doorOpenAt snapshot so the just-used north
      // door reads as still-open through the fade-out, not as a fresh
      // closed door (which it would otherwise, since the live
      // _getDoorAt now queries the NEW room's door list).
      getDoorAt: _getDoorAt,
    };
    try {
      room.tiles = prevRoom.tiles;
      room.w = prevRoom.w; room.h = prevRoom.h;
      room.decor = prevRoom.decor;
      room.kind = prevRoom.kind;
      room.cleared = prevRoom.cleared;
      _getDoorAt = (tx, ty) => {
        const a = prevRoom.doorOpenAt && prevRoom.doorOpenAt[tx + ',' + ty];
        return (a !== undefined) ? { anim: a } : null;
      };
      // forceFullDraw: skip the tile cache so the snapshot renders the
      // OLD room, not the live one whose static layers are cached.
      drawRoomInner(ctx, true);
    } finally {
      room.tiles = saved.tiles;
      room.w = saved.w; room.h = saved.h;
      room.decor = saved.decor;
      room.kind = saved.kind;
      room.cleared = saved.cleared;
      _getDoorAt = saved.getDoorAt;
      ctx.restore();
    }
  }
}

// Caller-facing wrapper. Routes to the cached path for normal rendering
// (huge perf win — single drawImage instead of ~1000 ops/frame), or to
// the direct path when the prevRoom snapshot has temporarily swapped
// `room.*` state and the cache would render the wrong room.
function drawRoomInner(ctx, forceFullDraw = false) {
  if (!room.tiles) return;
  // Hamlet has its own gradient sky path that doesn't use tiles. Falls
  // through to the legacy hamlet branch below — no cache.
  if (room.kind === 'hamlet') {
    drawRoomDirect(ctx, true);  // hamlet branch returns early inside
    return;
  }
  if (forceFullDraw) {
    drawRoomStaticLayers(ctx);
    drawRoomDynamicLayers(ctx);
    return;
  }
  // Cached path — static layers come from the offscreen canvas, dynamic
  // layers (doors, pedestals, torches) overlay on top.
  if (_ensureTileCache()) {
    ctx.drawImage(_tileCache, 0, 0);
  } else {
    drawRoomStaticLayers(ctx);
  }
  drawRoomDynamicLayers(ctx);
}

// Renders the FULL pipeline directly to the given ctx (no cache). Used
// only by the prevRoom-snapshot fade and the hamlet branch. The
// `_unused` parameter slot remains for potential future "render only
// hamlet sky" gating; currently the hamlet branch self-detects via
// room.kind.
function drawRoomDirect(ctx, _unused) {
  if (!room.tiles) return;
  // Hamlet — procedural gradient sky + dim ground fill. Buildings, cobblestone
  // tiles, firepit, shrine, and portal are drawn ON TOP of this by the
  // hamletScene module (drawHamletBackdrop + drawHamletEntities). Replaces
  // the earlier "paint a wide mural" approach — we compose the scene from
  // layers now instead of leaning on a single wide backdrop.
  if (room.kind === 'hamlet') {
    const W = room.w * TILE, H = room.h * TILE;
    // Sky: deep violet at top → warm dusk amber at horizon. Horizon sits at
    // y=280 (~42% down the room), matching where the building band begins.
    const sky = ctx.createLinearGradient(0, 0, 0, 300);
    sky.addColorStop(0.00, '#0d0818');
    sky.addColorStop(0.45, '#281638');
    sky.addColorStop(0.80, '#5a2a40');
    sky.addColorStop(1.00, '#7a3848');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, 300);
    // Ground slab below the horizon — cobblestone tiles will overpaint this
    // strip; we just need a dark base so any tiling gaps don't show the void.
    ctx.fillStyle = '#181218';
    ctx.fillRect(0, 300, W, H - 300);
    // Scattered star pinpoints in the sky for atmosphere. Uses a grid-jitter
    // distribution so stars spread evenly across the full sky band instead
    // of the clumping the raw hash gave. Deterministic per cell.
    const cols = 14, rows = 4;
    const cellW = W / cols;
    const cellH = 220 / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const h = hash(c * 31 + r * 97, 19);
        // 70% of cells have a star; 30% empty — breaks the grid feel.
        if ((h & 15) < 4) continue;
        const jx = ((h >>> 4) % 1000) / 1000 - 0.5;
        const jy = ((h >>> 14) % 1000) / 1000 - 0.5;
        const sx = c * cellW + cellW * 0.5 + jx * cellW * 0.7;
        const sy = r * cellH + cellH * 0.5 + jy * cellH * 0.7 + 10;
        const bright = (h >>> 24) & 3;
        const alpha = bright === 0 ? 0.35 : bright === 1 ? 0.55 : bright === 2 ? 0.75 : 0.95;
        const size = bright >= 2 ? 2 : 1;
        ctx.fillStyle = `rgba(232, 220, 200, ${alpha})`;
        ctx.fillRect(sx | 0, sy | 0, size, size);
      }
    }
    return;
  }

  drawRoomStaticLayers(ctx);
  drawRoomDynamicLayers(ctx);
}

// Static layers — passes 1-4 + ruin stains/cobwebs. Stable for the
// duration of a room (no animation, no per-frame mutation), so safe to
// cache to an offscreen canvas and reuse with one drawImage call.
function drawRoomStaticLayers(ctx) {
  if (!room.tiles || room.kind === 'hamlet') return;
  // Pass 1: every floor cell
  for (let y = 0; y < room.h; y++) {
    for (let x = 0; x < room.w; x++) {
      drawFloorTile(ctx, x, y);
    }
  }

  // Pass 1b: biome-specific floor wear (moss/blood/scorch) — ~8 patches per room
  const wearFn = WEAR_BY_BIOME[PAL._biomeId || 'vault'];
  if (wearFn) {
    for (let i = 0; i < 8; i++) {
      const h = hash(i + 17, (PAL._biomeId || 'vault').length + room.w * room.h);
      const tx = 1 + (h % (room.w - 2));
      const ty = 1 + ((h >>> 5) % (room.h - 2));
      const kind = room.tiles[ty]?.[tx];
      if (kind !== 'floor') continue;
      const cx = tx * TILE + TILE / 2 + ((h >>> 10) % 12) - 6;
      const cy = ty * TILE + TILE / 2 + ((h >>> 14) % 12) - 6;
      wearFn(ctx, cx, cy, h);
    }
  }

  // Pass 1c: AUTHORED zone overlays (polish-lap replacement of per-tile
  // ALCOVE/WEAR fills). The earlier per-tile approach stamped 48-px
  // dark squares scattered along wear paths and at corner alcoves —
  // exactly the "random dark patches" failure the slice was supposed
  // to solve. drawZoneOverlays paints SOFT multi-tile gradients
  // instead: one radial vignette per interior corner (alcove
  // shadow), one chain of overlapping low-alpha blobs along each
  // door→focal Manhattan path (wear scuff). Reads as continuous
  // grime, not as discrete tile defects.
  drawZoneOverlays(ctx, room);

  // Pass 1d: focal-piece stain. Single concentrated radial stain
  // under the focal anchor, color-keyed to focal kind (scorch under
  // crater/brazier, dark grime under obelisk, faint warm wash under
  // altar, cool mist under tomb). Sits on the focal-frame zone.
  drawZoneWear(ctx, room);

  // Pass 1e: ROOM-KIND FLOOR TINT (room identity system). Subtle
  // full-floor RGB cast per kind — warm gold for treasure/shop/
  // sanctuary, ember-scorch for elite/altar/boss, cool violet for
  // event, baseline (no tint) for combat. Painted as ONE rect over
  // the playable interior BEFORE walls so the wall row + frieze
  // don't get re-tinted away from biome palette. The tint is the
  // primary "I know what kind of room this is" signal, paired with
  // the focal piece and vignette intensity below.
  drawFloorKindTint(ctx, room);

  // Pass 2: shadow strips cast from walls onto floor cells below them.
  // Tier 1C — extended to all four sides of every wall/pillar tile so
  // walls feel embedded in the floor rather than pasted on top.
  // Previously only the south-side cast shadow rendered; E/W/N floor
  // tiles adjacent to walls had no contact shadow at all, which is
  // the giveaway that the world is single-plane.
  for (let y = 0; y < room.h; y++) {
    for (let x = 0; x < room.w; x++) {
      const t = room.tiles[y]?.[x];
      // Walls AND pillars cast contact shadows. Pedestals/altars don't —
      // they're props sitting on the floor, not architectural barriers.
      if (t !== 'wall' && t !== 'pillar') continue;
      // South-side cast shadow (existing behavior — strong vertical
      // gradient, reads as "wall height projecting down"). Skip when
      // the cell below is another wall.
      const below = room.tiles[y + 1]?.[x];
      if (below !== 'wall') drawWallShadowBelow(ctx, x, y + 1);
      // East-side contact shadow on the floor tile to the right.
      // Only fires when the cell EAST is a floor — wall-on-wall horizontals
      // skip (no shadow needed between adjacent walls).
      const east = room.tiles[y]?.[x + 1];
      if (east === 'floor') drawSideContactShadow(ctx, x + 1, y, 'east');
      // West-side contact shadow on the floor tile to the left.
      const west = room.tiles[y]?.[x - 1];
      if (west === 'floor') drawSideContactShadow(ctx, x - 1, y, 'west');
      // North-side contact shadow — rare (walls are typically perimeter
      // or pillars, so floor-north-of-wall happens only at T_top shapes
      // and freestanding pillars). Subtle bottom-rim shadow on the
      // floor tile above.
      const north = room.tiles[y - 1]?.[x];
      if (north === 'floor') drawSideContactShadow(ctx, x, y - 1, 'north');
    }
  }

  // Pass 3: walls + top-wall frieze
  for (let y = 0; y < room.h; y++) {
    for (let x = 0; x < room.w; x++) {
      const t = room.tiles[y][x];
      if (t === 'wall') drawWallTile(ctx, x, y);
      else if (t === 'crackedwall') drawCrackedWall(ctx, x, y);
    }
  }
  // Extend north wall upward — TWO sections drawn above the wall row:
  //   1. Upper body (y=-32 to y=-16) — new 2nd row, masonry gradient
  //   2. Frieze cap (y=-16 to y=0)   — existing lit crown
  // Order matters: body THEN cap so the cap's gradient overlaps the body
  // bottom edge cleanly. Door columns skip both because their tile type
  // is 'door' not 'wall'.
  for (let x = 0; x < room.w; x++) {
    if (room.tiles[0]?.[x] === 'wall') {
      drawTopWallBody(ctx, x);
      drawTopWallFrieze(ctx, x);
    }
  }

  // Pass 4: floor cracks + corner rubble + set-piece decor (no collision)
  for (const d of room.decor) {
    if (d.kind === 'crack')  drawCrack(ctx, d.x, d.y);
    else if (d.kind === 'rubble') drawRubble(ctx, d.x, d.y);
    else if (d.kind === 'bones')  drawBones(ctx, d.x, d.y);
    else if (d.kind === 'banner') drawBanner(ctx, d.x, d.y);
    else if (d.kind === 'statue') drawStatue(ctx, d.x, d.y);
    else if (d.kind === 'rug')    drawRug(ctx, d.x, d.y);
    else if (d.kind === 'chest')  drawChest(ctx, d.x, d.y);
  }

  // ─── THE RUIN REMEMBERS ────────────────────────────────────────────────────
  // Render persistent stains from past runs. Blood = where you died.
  // Scorch = where a boss fell. Intensity 1-3 controls darkness/spread.
  if (room.ruinStain) {
    drawRuinStain(ctx, room.ruinStain);
  }
  // Dungeon aging — adds cobwebs in corners that get thicker over time
  if (room.ruinAging > 0) {
    drawRuinCobwebs(ctx, room.ruinAging);
  }
}

// ─── DUNGEON VISUAL DEPTH — Tier 1 (room.js) ─────────────────────────
// Helpers for the comparison-vs-Hades audit Tier 1 sprint:
//   drawTorchLighting   — additive radial glows around each torch
//   drawLavaLighting    — additive glows around lava patches (abyss/inferno)
//   drawRoomVignette    — darken edges, pull eye to center, add staging
// All three render in drawRoomDynamicLayers (per-frame, post-static),
// so they composite on top of the cached tile/wall/decor base WITHOUT
// invalidating the cache. Together they hit the three "feels flat"
// symptoms identified in the dungeon design audit: no lighting,
// no depth, no edge framing.

// Cached parsed RGB triplets — color strings parse-once per biome
// switch, not per-frame. Keyed by hex string. Avoids 60fps×6torches×3
// channels of parseInt churn per frame.
const _hexRgbCache = new Map();
function _hexToRgb(hex) {
  if (!hex || hex[0] !== '#' || hex.length < 7) return [255, 180, 100];
  const cached = _hexRgbCache.get(hex);
  if (cached) return cached;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const triplet = [r, g, b];
  _hexRgbCache.set(hex, triplet);
  return triplet;
}

// Volumetric torch lights — per-torch additive radial gradient. Tinted
// from PAL.torchCore (the same color that drives flame core sprite),
// with per-torch flicker (~7% amplitude, offset by torch seed) so the
// glow breathes alongside the visible flame instead of strobing in
// lockstep. Composite mode 'lighter' ensures the gradient ADDS to the
// underlying tiles instead of replacing them — floor, walls, pillars,
// and decor all pick up the warm wash without clobbering their hue.
function drawTorchLighting(ctx) {
  if (!roomTorches.length) return;
  const torchCore = PAL.torchCore || '#ffb46e';
  const [r, g, b] = _hexToRgb(torchCore);
  const now = (typeof performance !== 'undefined') ? performance.now() / 1000 : 0;
  const W = room.w * TILE;
  const H = room.h * TILE;
  ctx.save();
  // Clip the lighting pass to the room's playable rect. Without this,
  // the torch radial gradients spill UP into the dark void above the
  // wall row (torches sit at y=21, light radius 200 → gradient extends
  // to y=-179, well outside the room) and create a bright halo where
  // there's no surface to light. Clip cleanly contains light to the
  // playable area.
  //
  // The TOP edge is set to -16 (slightly above y=0) so the visible
  // torch sprite's flame anim — which the player sees rendered above
  // the wall body — still picks up its own glow. The wall row itself
  // (y=0 to y=48) sits inside the clip, so wall faces below torches
  // get their warm wash properly.
  ctx.beginPath();
  ctx.rect(0, -16, W, H + 16);
  ctx.clip();
  ctx.globalCompositeOperation = 'lighter';
  for (const t of roomTorches) {
    // Each torch's flicker phase is offset by its placement seed so a
    // row of torches doesn't pulse in unison. 5 Hz sin gives a fire-
    // alive feel without strobing.
    const flicker = 0.93 + 0.07 * Math.sin(now * 5 + t.seed * 0.13);
    // Larger radius (200 vs prior 170) + softer alpha falloff so the
    // contrast between lit zones and unlit zones is gentler. Prior
    // tuning produced a hard "spotlight" feel — areas between torches
    // looked unlit. The new curve overlaps adjacent torches' fields so
    // the room feels evenly bathed with intensity peaks at each torch.
    const radius = 200 * flicker;
    const cx = t.x;
    const cy = t.y;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    // Softened intensity profile:
    //   center  (0):   0.32 (was 0.45 — too hot at peak)
    //   mid     (0.35): 0.18 (was 0.20)
    //   outer   (0.70): 0.07 (was 0.06)
    //   edge    (1):    0
    // Net: a less aggressive spotlight, more diffuse warm wash. With
    // the larger radius, adjacent torches' falloff ranges overlap so
    // the floor between them isn't "dead zone" between hot spots.
    grad.addColorStop(0,    `rgba(${r}, ${g}, ${b}, ${(0.32 * flicker).toFixed(3)})`);
    grad.addColorStop(0.35, `rgba(${r}, ${g}, ${b}, ${(0.18 * flicker).toFixed(3)})`);
    grad.addColorStop(0.70, `rgba(${r}, ${g}, ${b}, ${(0.07 * flicker).toFixed(3)})`);
    grad.addColorStop(1,    `rgba(${r}, ${g}, ${b}, 0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
  }
  ctx.restore();
}

// Ambient lava glow — abyss + inferno biomes. The procedural lava-patch
// floor wear (drawLavaPatch) is drawn in the cached static layer, but
// it doesn't EMIT light. This pass walks the same patch positions
// (cheap enough — ~8 patches, plus active fire pools) and adds a soft
// orange glow to the surrounding floor, giving those biomes a second
// light layer beyond torches. Crypt and vault skip this entirely.
function drawLavaLighting(ctx) {
  const biomeId = PAL._biomeId || 'vault';
  // Inferno gets the strongest glow (the world-wound itself). Abyss
  // gets a smaller scorch-ember tint via the same path.
  const isInferno = biomeId === 'inferno';
  const isAbyss = biomeId === 'abyss';
  if (!isInferno && !isAbyss) return;
  // Re-roll the same patch positions the cached static layer used so
  // the glow lines up with the visible lava cracks (drawRoomStaticLayers
  // pass 1b uses the same hash + 8 iterations + same offsets).
  const seedBase = biomeId.length + room.w * room.h;
  const now = (typeof performance !== 'undefined') ? performance.now() / 1000 : 0;
  // Slow 0.8 Hz overall pulse so the glow breathes with the lava core
  // pulse already in drawLavaPatch.
  const pulse = 0.82 + 0.18 * Math.sin(now * 0.8);
  const W = room.w * TILE;
  const H = room.h * TILE;
  ctx.save();
  // Same room-bounds clip as torch lighting — lava is on the floor so
  // there's no upward-bleed concern, but a clip keeps the additive
  // gradient from leaking past the perimeter walls into the void
  // beyond. Belt-and-suspenders alongside the torch clip.
  ctx.beginPath();
  ctx.rect(0, 0, W, H);
  ctx.clip();
  ctx.globalCompositeOperation = 'lighter';
  // Inferno biome — bright orange, larger radius. Abyss — smaller red-
  // ember radius (it has scorch patches, not lava, so weaker).
  const r = isInferno ? 255 : 200;
  const g = isInferno ? 130 : 70;
  const b = isInferno ? 50 : 30;
  const radius = isInferno ? 90 : 56;
  const baseAlpha = isInferno ? 0.32 : 0.18;
  for (let i = 0; i < 8; i++) {
    const h = hash(i + 17, seedBase);
    const tx = 1 + (h % (room.w - 2));
    const ty = 1 + ((h >>> 5) % (room.h - 2));
    if (room.tiles[ty]?.[tx] !== 'floor') continue;
    const cx = tx * TILE + TILE / 2 + ((h >>> 10) % 12) - 6;
    const cy = ty * TILE + TILE / 2 + ((h >>> 14) % 12) - 6;
    const a = baseAlpha * pulse;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    grad.addColorStop(0,    `rgba(${r}, ${g}, ${b}, ${a.toFixed(3)})`);
    grad.addColorStop(0.45, `rgba(${r}, ${g}, ${b}, ${(a * 0.4).toFixed(3)})`);
    grad.addColorStop(1,    `rgba(${r}, ${g}, ${b}, 0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
  }
  // Fire pools also emit light. Even dormant pools (the scorched-floor
  // phase between erupting cycles) get a subtle glow — they're hot
  // ground, after all, not just decals. The cycle phase isn't checked
  // here since gameTime isn't readily available; the static glow reads
  // fine and ties the inferno biome's hazards into the lighting layer.
  // Note: roomFirePools elements store world-space x/y already (not
  // tile coords), unlike the patch loop above.
  for (const fp of roomFirePools) {
    const cx = fp.x;
    const cy = fp.y;
    const fpRadius = 76 * pulse;
    const a = 0.42 * pulse;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, fpRadius);
    grad.addColorStop(0,    `rgba(255, 160, 60, ${a.toFixed(3)})`);
    grad.addColorStop(0.45, `rgba(255, 100, 40, ${(a * 0.5).toFixed(3)})`);
    grad.addColorStop(1,    `rgba(255, 80, 30, 0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(cx - fpRadius, cy - fpRadius, fpRadius * 2, fpRadius * 2);
  }
  ctx.restore();
}

// Edge vignette — slight darkening at the room's outer edges. Reads
// as "the camera is staging this space" rather than "you can see the
// whole tile grid uniformly." Pulls focus toward the center of play.
// Uses normal alpha (no composite mode) with biome-tinted dark color
// so the vignette respects each biome's overall mood (cool blues for
// crypt, warm browns for vault, etc.).
function drawRoomVignette(ctx) {
  const W = room.w * TILE;
  const H = room.h * TILE;
  // Biome dark tint — sourced from vignetteBase or default to near-black.
  // PAL.vignetteBase is a partial rgba string ("rgba(8, 5, 10, ") that
  // expects an alpha suffix. We append our own alpha here.
  const darkBase = PAL.vignetteBase || 'rgba(0, 0, 0, ';
  ctx.save();
  // Inner-radius starts ~62% of half-diagonal so the center 60% of the
  // room stays fully clear; outer reaches the corners. Alpha ramps from
  // 0 at inner edge to 0.30 at outer (slightly stronger in inferno for
  // the world-wound feel).
  //
  // Room-identity layer: vignetteScale from room.kindProfile multiplies
  // the peak alpha. Treasure/shop/sanctuary use <1 (softer edges, more
  // even lighting — invites the eye to browse); elite/boss/challenge
  // use >1 (stronger edges, more pressure). Clamped 0.3..1.5 so the
  // pass never fully erases the framing or pushes the room into
  // black-corner territory.
  const isInferno = PAL._biomeId === 'inferno';
  const baseA = isInferno ? 0.34 : 0.22;
  const profileScale = (room.kindProfile && Number.isFinite(room.kindProfile.vignetteScale))
    ? room.kindProfile.vignetteScale
    : 1.0;
  const scale = Math.max(0.3, Math.min(1.5, profileScale));
  const maxA = baseA * scale;
  const cx = W / 2;
  const cy = H / 2;
  const innerR = Math.min(W, H) * 0.42;
  const outerR = Math.hypot(W, H) * 0.62;
  const grad = ctx.createRadialGradient(cx, cy, innerR, cx, cy, outerR);
  grad.addColorStop(0, darkBase + '0)');
  grad.addColorStop(0.55, darkBase + (maxA * 0.45).toFixed(3) + ')');
  grad.addColorStop(1, darkBase + maxA.toFixed(3) + ')');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

// Dynamic layers — pillars, doors (animated open amount), pedestals
// (bob/glow), altars (pulse), torches (flicker). Anything that mutates
// frame-to-frame goes here so the cached static base never needs
// invalidation for normal play.
function drawRoomDynamicLayers(ctx) {
  if (!room.tiles || room.kind === 'hamlet') return;
  const _now = (typeof performance !== 'undefined') ? performance.now() / 1000 : 0;
  // Pass 4a: FOCAL PIECE (Phase 2 vertical slice). Drawn BEFORE marks/
  // pillars/doors/decor so combat sparks, blood pools, and prop overlap
  // composes ON TOP of the focal — the focal piece sits in the floor
  // plane visually. Skipped when room.focal is null (start, trove,
  // chestroom, shop — those rooms have other natural attractions).
  if (room.focal) drawFocalPiece(ctx, room.focal, _now);
  // Pass 4b: within-room reactive floor marks (blood pools where
  // enemies died, future scorch/dust marks). Renders ON TOP of the
  // static floor cache but UNDER pillars/pedestals/doors/decor and
  // under corpses/enemies — so a slime that died HERE leaves a pool,
  // and the corpse fades out on top of the pool, leaving the pool
  // behind to mark the spot.
  drawRoomMarks(ctx);
  // Pass 4c: DOOR ARCHITECTURE (Phase 3 vertical slice). Stone arch
  // + jamb stones + threshold light pool above each NORTH door. Drawn
  // BEFORE the door tile fills (pass 5) so the door sprite renders on
  // top of the arch fill cleanly, but UNDER the pillar/pedestal pass
  // so doorway light pool blends with floor properly.
  drawDoorArchitecture(ctx, room, _now);
  // Pass 5: interactive + decorative props on top
  for (let y = 0; y < room.h; y++) {
    for (let x = 0; x < room.w; x++) {
      const t = room.tiles[y][x];
      if (t === 'pillar') drawPillar(ctx, x, y);
      else if (t === 'door') {
        // Pull the per-door open amount from the doorPortals module via
        // the lazy lookup. Falls back to "south door of a cleared room"
        // when no door object exists (start room before doorPortals
        // populates, hamlet, etc.).
        const door = _getDoorAt && _getDoorAt(x, y);
        let amount;
        if (door) {
          amount = Math.max(0, Math.min(1, door.anim));
        } else {
          amount = (y === room.h - 1 && room.cleared) ? 1 : 0;
        }
        drawDoor(ctx, x, y, amount);
      }
      else if (t === 'pedestal') drawPedestal(ctx, x, y);
      else if (t === 'altar') drawAltar(ctx, x, y);
    }
  }

  // Pass 6: wall torches (drawn after walls so the sconce sits on the wall face)
  for (const t of roomTorches) {
    drawTorchSconce(ctx, Math.floor(t.x / TILE), 0);
  }
  // Pass 7: VOLUMETRIC TORCH LIGHTING — comparison-vs-Hades audit P0.
  // Previously torches were animated sprites with no actual illumination
  // output, so rooms felt evenly lit from nowhere. Drawing additive
  // radial gradients at each torch position transforms the space from
  // "uniformly painted" to "lit by these specific sources." Draws AFTER
  // walls/pillars/decor (so the floor + structures pick up the warm
  // tint) but UNDER entities (which are drawn in main.js after this
  // return). Per-biome tint sourced from PAL.torchCore so each floor's
  // light has its own character — crypt blue moonlight, vault amber,
  // abyss ember-red, inferno gold.
  drawTorchLighting(ctx);
  // Pass 8: ambient lava glow — abyss/inferno biomes get a second
  // light source from any active lava patches and fire pools, giving
  // those biomes a second visual layer of illumination beyond just
  // torches. Skipped for crypt/vault.
  drawLavaLighting(ctx);
  // Pass 9: edge vignette — slight room-edge darkening pulls the eye
  // toward play-area center and adds a depth-staging frame around the
  // visible space. Subtle (alpha ~0.22), rendered with normal alpha
  // composite so it darkens without recoloring.
  drawRoomVignette(ctx);
}

// Public: draw all spikes at the current game time. Called from main.js so
// main.js controls what counts as "game time" (pauses during hit-stop, etc.).
export function drawSpikes(ctx, gameTime) {
  for (const s of roomSpikes) {
    drawSpike(ctx, s.x, s.y, spikeState(s, gameTime));
  }
}

// Trove urn rendering — 3 variants with subtle color differences, break animation
export function drawUrns(ctx, dt) {
  // Time reference for glint twinkle — keyed off performance.now so every urn
  // pulses slightly offset from every other, reading as "found treasure"
  // rather than a single synchronized flicker.
  const now = (typeof performance !== 'undefined') ? performance.now() / 1000 : 0;
  for (const u of roomUrns) {
    const cx = u.x * TILE + TILE / 2;
    const cy = u.y * TILE + TILE / 2;
    if (u.broken) {
      // Broken state — decaying base debris only for a brief moment
      if (u.breakT > 0) {
        u.breakT -= dt;
        const a = Math.max(0, u.breakT / 0.5);
        ctx.save();
        ctx.globalAlpha = a * 0.5;
        ctx.fillStyle = '#3a2a1c';
        ctx.fillRect(cx - 7, cy + 3, 14, 4);
        ctx.fillRect(cx - 10, cy + 5, 5, 3);
        ctx.fillRect(cx + 5, cy + 5, 5, 3);
        ctx.restore();
      }
      continue;
    }
    // (Removed) Warm radial halo around every urn. Combat-room urns
    // (u.isProp = true) always rendered an `rgba(255, 180, 90, 0.10)`
    // halo at radius 14, and trove urns rendered the same color at
    // 0.22 alpha and radius 22. With 5-6 urns per combat room, that
    // produced 5-6 always-on warm-orange dots scattered across the
    // playable area — visually indistinguishable from the ambient
    // mote noise the player has flagged in playtest. The urn body
    // sprite (warm bronze on dark floor) reads without it. Trove
    // rooms get a smaller halo back below since trove urns ARE the
    // room's main attraction and need to draw the eye.
    if (!u.isProp) {
      // Trove-only halo — kept smaller + dimmer than the original
      // (alpha 0.22 → 0.14, radius 22 → 16) so trove rooms still
      // feel like the loot scene without urn glows reading as
      // ambient particles.
      const haloR = 16;
      const halo = ctx.createRadialGradient(cx, cy + 4, 0, cx, cy + 4, haloR);
      halo.addColorStop(0, 'rgba(255, 180, 90, 0.14)');
      halo.addColorStop(1, 'rgba(255, 180, 90, 0)');
      ctx.fillStyle = halo;
      ctx.fillRect(cx - haloR, cy - haloR + 4, haloR * 2, haloR * 2);
    }
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 12, 10, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    // Body — ornamental urn shape
    const bodyCol = u.variant === 0 ? '#7a5438' : u.variant === 1 ? '#5a4830' : '#6a4a60';
    const rimCol = u.variant === 0 ? '#c9a86a' : u.variant === 1 ? '#a08060' : '#c09cb0';
    const darkCol = u.variant === 0 ? '#3a2410' : u.variant === 1 ? '#2a1a08' : '#2a1830';
    // Base
    ctx.fillStyle = darkCol;
    ctx.fillRect(cx - 10, cy - 2, 20, 16);
    // Main body
    ctx.fillStyle = bodyCol;
    ctx.fillRect(cx - 9, cy - 2, 18, 14);
    // Rim
    ctx.fillStyle = rimCol;
    ctx.fillRect(cx - 8, cy - 6, 16, 4);
    ctx.fillStyle = darkCol;
    ctx.fillRect(cx - 7, cy - 5, 14, 2);
    // Highlight
    ctx.fillStyle = 'rgba(255, 220, 170, 0.15)';
    ctx.fillRect(cx - 7, cy - 1, 3, 8);
    // Decorative band
    ctx.fillStyle = rimCol;
    ctx.fillRect(cx - 9, cy + 5, 18, 2);
    // Gold glint — only on TROVE urns (the loot-scene attraction).
    // Combat-prop urns dropped their glints in the same pass that
    // killed their warm halos: with 5-6 prop urns scattered around
    // the room each periodically firing a 2-3 px bright twinkle, the
    // playable area read as constantly twinkling, indistinguishable
    // from ambient particles. The urn body sprite is enough to mark
    // a destructible prop. Trove urns keep the glint because the
    // entire room is the loot moment.
    if (!u.isProp) {
      const seed = u.x * 37 + u.y * 53;
      const phase = (now * 0.9 + seed * 0.11) % (Math.PI * 2);
      const glintA = Math.max(0, Math.sin(phase)) ** 4;  // sharp peaks, mostly off
      if (glintA > 0.02) {
        ctx.save();
        ctx.globalAlpha = glintA;
        ctx.fillStyle = '#fff2c8';
        ctx.fillRect(cx - 6 + (seed % 10), cy - 5, 2, 2);
        ctx.fillStyle = 'rgba(255, 240, 200, 0.7)';
        ctx.fillRect(cx - 6 + (seed % 10) - 1, cy - 5, 4, 1);
        ctx.restore();
      }
    }
  }
}

// Point-radius urn collision — used by hero blast bolts (which have a
// world position + radius, not a swing cone). Mirrors tryHitUrn's
// return shape so callers can share post-break logic. Marks the
// matched urn broken on hit.
export function tryHitUrnAtPoint(wx, wy, radius) {
  for (const u of roomUrns) {
    if (u.broken) continue;
    const ux = u.x * TILE + TILE / 2;
    const uy = u.y * TILE + TILE / 2;
    const dx = ux - wx, dy = uy - wy;
    if (dx * dx + dy * dy > radius * radius) continue;
    u.broken = true;
    u.breakT = 0.5;
    return { hit: true, wx: ux, wy: uy, variant: u.variant, isProp: !!u.isProp };
  }
  return { hit: false };
}

// Hero attack hits an urn if in range. Returns {hit, wx, wy, variant} for loot spawning.
export function tryHitUrn(hx, hy, aimX, aimY, reach) {
  for (const u of roomUrns) {
    if (u.broken) continue;
    const ux = u.x * TILE + TILE / 2;
    const uy = u.y * TILE + TILE / 2;
    const dx = ux - hx, dy = uy - hy;
    const dist = Math.hypot(dx, dy);
    if (dist > reach + 12) continue;
    // Crude aim cone — 180° forward
    const dot = (dx / (dist || 1)) * aimX + (dy / (dist || 1)) * aimY;
    if (dot < -0.1) continue;
    u.broken = true;
    u.breakT = 0.5;
    return { hit: true, wx: ux, wy: uy, variant: u.variant, isProp: !!u.isProp };
  }
  return { hit: false };
}

// Decorative pillar rendering (purely visual, no collision). Drawn at
// roomDecorPillars positions in special rooms like chestroom for a
// 'sacred chamber' framing. Sprite is 48×48 native, scaled 1.4× → 67px
// rendered (matches other dungeon prop scale).
const PILLAR_NATIVE = 48;
const PILLAR_SCALE = 1.4;
// Per-pillar render — extracted from drawDecorPillars so the occlusion
// re-blit pass (drawTallPropOcclusion) can call the same logic without
// duplicating the drawImage. Caller is responsible for the
// imageSmoothingEnabled toggle.
function drawPillarAt(ctx, p, img) {
  const drawW = PILLAR_NATIVE * PILLAR_SCALE;
  const drawH = PILLAR_NATIVE * PILLAR_SCALE;
  const cx = p.x * TILE + TILE / 2;
  const cy = p.y * TILE + TILE / 2;
  // Drop shadow under pillar base
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.beginPath();
  ctx.ellipse(cx, cy + drawH / 2 - 6, drawW / 3, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.drawImage(
    img,
    0, 0, PILLAR_NATIVE, PILLAR_NATIVE,
    Math.round(cx - drawW / 2),
    Math.round(cy - drawH / 2 + 4),     // +4 so base sits ON tile
    drawW, drawH,
  );
}

export function drawDecorPillars(ctx) {
  const img = images.fx_dungeon_pillar;
  if (!img) return;
  const prevSmoothing = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  for (const p of roomDecorPillars) {
    drawPillarAt(ctx, p, img);
  }
  ctx.imageSmoothingEnabled = prevSmoothing;
}

// Tall-prop occlusion re-blit (audit T2.6). Pillars + chests are tall
// enough that an actor positioned NORTH of them (smaller world-Y) should
// read as standing BEHIND the prop. The default render order draws the
// prop first then hero/enemies on top — wrong when the actor is north.
//
// Door lintels solved this for door tiles via an unconditional re-blit.
// Here we do it CONDITIONALLY: re-draw a prop only when at least one
// actor (hero or any live enemy) is north of the prop's foot AND within
// its visible column. Reads as "things behind the pillar get occluded
// by it" without the cost of redrawing every prop every frame.
//
// Not a full y-sort — props won't intermix with enemies in a complex
// layered stack — but covers the most visible "hero behind pillar"
// case. A future pass can extend the y-sort drawList to include props
// directly; this is the lower-risk first step.
export function drawTallPropOcclusion(ctx, hero, enemies) {
  if (!room.tiles) return;
  const pillarImg = images.fx_dungeon_pillar;
  const PILLAR_W_HALF = (PILLAR_NATIVE * PILLAR_SCALE) / 2;
  // Actor is "north of prop" when actor.y < propFootY - margin.
  // Margin (4 px) avoids flicker right at the boundary.
  const NORTH_MARGIN = 4;
  // Column overlap tolerance — actors slightly outside the prop's
  // sprite width can still need occlusion (their head leaks into the
  // prop's column). Half-tile of grace.
  const COLUMN_GRACE = 12;

  // Helper — true if any live actor is north of (footY) AND within
  // (centerX ± halfW + grace).
  const anyActorNorth = (centerX, footY, halfW) => {
    if (hero.state !== 'dead' && hero.y < footY - NORTH_MARGIN
        && Math.abs(hero.x - centerX) < halfW + COLUMN_GRACE) {
      return true;
    }
    for (const e of enemies) {
      if (e.dead) continue;
      if (e.y < footY - NORTH_MARGIN
          && Math.abs(e.x - centerX) < halfW + COLUMN_GRACE) {
        return true;
      }
    }
    return false;
  };

  // Pillars
  if (pillarImg) {
    const pillarDrawH = PILLAR_NATIVE * PILLAR_SCALE;
    const prevSmoothing = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    for (const p of roomDecorPillars) {
      const cx = p.x * TILE + TILE / 2;
      const cy = p.y * TILE + TILE / 2;
      const footY = cy + pillarDrawH / 2 + 4;     // matches drawPillarAt's bottom edge
      if (anyActorNorth(cx, footY, PILLAR_W_HALF)) {
        drawPillarAt(ctx, p, pillarImg);
      }
    }
    ctx.imageSmoothingEnabled = prevSmoothing;
  }

  // Chests — only RE-DRAW when an actor is north and the chest exists
  // visibly (closed or opened). The chest's animation state is owned
  // by drawChests' main pass; the occlusion call here just re-paints
  // the current frame on top, doesn't advance time.
  const CHEST_W_HALF = (CHEST_W * CHEST_SCALE) / 2;
  const chestDrawH = CHEST_H * CHEST_SCALE;
  const prevSmoothing = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  for (const c of roomChests) {
    const cx = c.x * TILE + TILE / 2;
    const cy = c.y * TILE + TILE / 2;
    const footY = cy + chestDrawH / 2 + 4;
    if (!anyActorNorth(cx, footY, CHEST_W_HALF)) continue;
    if (c.state === 'closed') {
      // Procedural closed chest — draw on top of the actor for occlusion.
      ctx.imageSmoothingEnabled = prevSmoothing;     // procedural draw uses default
      drawClosedChestSprite(ctx, cx, cy);
      ctx.imageSmoothingEnabled = false;
      continue;
    }
    const asset = c.variant === 'treasure' ? images.fx_chestcold : images.fx_chestfire;
    const frame = c.frame | 0;
    if (!asset) continue;
    const sx = frame * CHEST_W;
    ctx.drawImage(
      asset,
      sx, 0, CHEST_W, CHEST_H,
      Math.round(cx - CHEST_W_HALF),
      Math.round(cy - chestDrawH / 2 + 4),
      CHEST_W * CHEST_SCALE, chestDrawH,
    );
  }
  ctx.imageSmoothingEnabled = prevSmoothing;
}

// Treasure-chest rendering — both variants share an identical 'closed' look
// (gambling tension); their reveal happens through the opening animation.
//
// Closed → procedural pixel-art chest (drawClosedChestSprite below). Earlier
// versions used frame 0 of fx_chestcold under the assumption that "frame 0
// is a clean closed box" — but that was wrong: every frame of the asset
// sheet shows the chest in some OPEN state (lid up, gold visible). Result:
// the player walked into a treasure room and saw three already-open chests,
// which kills the entire point of the room. The procedural draw below
// matches the spritesheet's wood + gold-trim aesthetic so the opening
// animation feels continuous when the player presses E.
//
// Opening → animate frames 0→15 of the variant's own sheet (chestcold for
// treasure, chestfire for mimic). At ~12 fps a 16-frame loop is ~1.3 s — fast
// enough to feel like a discrete reveal moment, slow enough to register the
// fire/coin visual.
//
// Opened → render frame 15 (last frame) of the variant. Persistent.
const CHEST_FPS = 12;
const CHEST_FRAMES = 16;
const CHEST_W = 48;
const CHEST_H = 48;
const CHEST_SCALE = 1.4;     // ~67px rendered, matches hamlet prop scale

// Procedural closed chest — chunky pixel-art rectangles. Anchored so the
// bottom edge aligns with the open-spritesheet's bottom edge (cy + drawH/2 + 4)
// — the moment the player presses E and the state flips to 'opening', the
// sprite swap happens at the same baseline so the lid appears to lift from
// where the closed lid was.
function drawClosedChestSprite(ctx, cx, cy) {
  // Footprint matches the spritesheet's apparent body: 56px wide.
  // Total visible chest is body (24px tall) + domed lid (18px tall) = 42px,
  // bottom edge at the same y as the open sprite's bottom edge.
  const drawH = CHEST_H * CHEST_SCALE;     // 67
  const baseY = Math.round(cy + drawH / 2 + 4) - 4;     // bottom of chest body
  const W = 56;
  const bodyH = 24;
  const lidH = 18;
  const left = Math.round(cx - W / 2);
  const right = left + W;
  const bodyTop = baseY - bodyH;
  const lidTop = bodyTop - lidH;

  // Drop shadow — same ellipse the open-chest path uses, kept identical so
  // the chest doesn't visually "jump" when state flips to opening.
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath();
  ctx.ellipse(cx, baseY - 2, W / 3, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  // ── Body (the bottom rectangle) ─────────────────────────────────────
  // Outline (1px dark border)
  ctx.fillStyle = '#1a0e08';
  ctx.fillRect(left - 1, bodyTop - 1, W + 2, bodyH + 2);
  // Mid-tone wood fill
  ctx.fillStyle = '#3d2818';
  ctx.fillRect(left, bodyTop, W, bodyH);
  // Top edge highlight (lighter wood band)
  ctx.fillStyle = '#5a3a22';
  ctx.fillRect(left + 2, bodyTop + 2, W - 4, 3);

  // ── Lid (the rounded top half) ──────────────────────────────────────
  // Lid outline — domed silhouette
  ctx.fillStyle = '#1a0e08';
  ctx.beginPath();
  ctx.moveTo(left - 1, bodyTop + 1);
  ctx.lineTo(left - 1, lidTop + lidH * 0.55);
  ctx.quadraticCurveTo(cx, lidTop - 2, right + 1, lidTop + lidH * 0.55);
  ctx.lineTo(right + 1, bodyTop + 1);
  ctx.closePath();
  ctx.fill();
  // Lid main wood fill
  ctx.fillStyle = '#3d2818';
  ctx.beginPath();
  ctx.moveTo(left, bodyTop);
  ctx.lineTo(left, lidTop + lidH * 0.55);
  ctx.quadraticCurveTo(cx, lidTop - 1, right, lidTop + lidH * 0.55);
  ctx.lineTo(right, bodyTop);
  ctx.closePath();
  ctx.fill();
  // Lid top highlight (small lighter strip across the dome's apex)
  ctx.fillStyle = '#5a3a22';
  ctx.beginPath();
  ctx.moveTo(cx - 12, lidTop + 3);
  ctx.quadraticCurveTo(cx, lidTop + 1, cx + 12, lidTop + 3);
  ctx.quadraticCurveTo(cx, lidTop + 2, cx - 12, lidTop + 3);
  ctx.fill();

  // ── Gold trim ───────────────────────────────────────────────────────
  ctx.fillStyle = '#c9a86a';
  // Bottom horizontal band (above the floor line)
  ctx.fillRect(left + 2, baseY - 4, W - 4, 3);
  // Lid/body seam — runs across where the lid meets the body
  ctx.fillRect(left, bodyTop - 2, W, 3);
  // Vertical corner braces
  ctx.fillRect(left + 1, bodyTop, 3, bodyH);
  ctx.fillRect(right - 4, bodyTop, 3, bodyH);
  // Center vertical reinforcement straps (two narrow bands flanking the lock)
  ctx.fillRect(cx - 14, bodyTop, 2, bodyH);
  ctx.fillRect(cx + 12, bodyTop, 2, bodyH);

  // ── Lock plate + keyhole ────────────────────────────────────────────
  const lockW = 12;
  const lockH = 10;
  const lockY = bodyTop - 3;     // straddles the lid/body seam
  // Lock plate dark background
  ctx.fillStyle = '#1a0e08';
  ctx.fillRect(cx - lockW / 2 - 1, lockY - 1, lockW + 2, lockH + 2);
  // Lock plate gold face
  ctx.fillStyle = '#d8b878';
  ctx.fillRect(cx - lockW / 2, lockY, lockW, lockH);
  // Lock plate inner shadow on the bottom edge
  ctx.fillStyle = '#9a7a44';
  ctx.fillRect(cx - lockW / 2, lockY + lockH - 2, lockW, 2);
  // Keyhole — circle + slot
  ctx.fillStyle = '#1a0e08';
  ctx.beginPath();
  ctx.arc(cx, lockY + 4, 1.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(cx - 1, lockY + 4, 2, 4);

  // ── Glint / shine on the lid (top-left highlight) ──────────────────
  ctx.fillStyle = 'rgba(255, 230, 170, 0.55)';
  ctx.fillRect(left + 6, lidTop + 5, 6, 1);
  ctx.fillRect(left + 7, lidTop + 6, 4, 1);
  // Subtle gold-corner glint on the front-top corners (reads as "polished metal")
  ctx.fillStyle = 'rgba(255, 230, 170, 0.4)';
  ctx.fillRect(left + 1, bodyTop, 3, 1);
  ctx.fillRect(right - 4, bodyTop, 3, 1);
}

export function drawChests(ctx, dt) {
  for (const c of roomChests) {
    const cx = c.x * TILE + TILE / 2;
    const cy = c.y * TILE + TILE / 2;
    if (c.state === 'closed') {
      // Procedural closed chest. No spritesheet asset needed.
      drawClosedChestSprite(ctx, cx, cy);
      continue;
    }
    // 'opening' or 'opened' — variant-specific animation from spritesheet
    const asset = c.variant === 'treasure' ? images.fx_chestcold : images.fx_chestfire;
    if (c.state === 'opening') {
      c.frameTime += dt;
      const advance = (c.frameTime * CHEST_FPS) | 0;
      c.frame = Math.min(CHEST_FRAMES - 1, advance);
      if (c.frame >= CHEST_FRAMES - 1) {
        c.state = 'opened';
      }
    }
    const frame = c.frame;
    if (!asset) continue;     // not loaded yet
    const drawW = CHEST_W * CHEST_SCALE;
    const drawH = CHEST_H * CHEST_SCALE;
    const sx = frame * CHEST_W;
    // Drop shadow under chest base
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + drawH / 2 - 6, drawW / 3, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    // Sprite
    const prevSmoothing = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      asset,
      sx, 0, CHEST_W, CHEST_H,
      Math.round(cx - drawW / 2),
      Math.round(cy - drawH / 2 + 4),     // +4 so chest base sits ON the tile, not floating above
      drawW, drawH,
    );
    ctx.imageSmoothingEnabled = prevSmoothing;
  }
}

// Fire pool hazard — 3-phase cycle: dormant → warning → erupting → dormant.
const FIRE_DORMANT = 1.6;
const FIRE_WARNING = 0.5;
const FIRE_ERUPT = 0.9;
const FIRE_CYCLE = FIRE_DORMANT + FIRE_WARNING + FIRE_ERUPT;

export function firePoolState(pool, gameTime) {
  const t = ((gameTime + pool.phase) % FIRE_CYCLE + FIRE_CYCLE) % FIRE_CYCLE;
  if (t < FIRE_DORMANT) return { kind: 'dormant', progress: t / FIRE_DORMANT };
  if (t < FIRE_DORMANT + FIRE_WARNING) return { kind: 'warning', progress: (t - FIRE_DORMANT) / FIRE_WARNING };
  return { kind: 'erupting', progress: (t - FIRE_DORMANT - FIRE_WARNING) / FIRE_ERUPT };
}

// Check damage — returns 1 if hero should be hurt at (wx, wy)
export function firePoolDamageAt(wx, wy, gameTime) {
  for (const p of roomFirePools) {
    const s = firePoolState(p, gameTime);
    if (s.kind !== 'erupting') continue;
    const dx = wx - p.x, dy = wy - p.y;
    if (dx*dx + dy*dy < 36 * 36) return 2;      // bigger dmg than spikes
  }
  return 0;
}

export function drawFirePools(ctx, gameTime) {
  for (const p of roomFirePools) {
    const s = firePoolState(p, gameTime);
    const x = p.x, y = p.y;
    if (s.kind === 'dormant') {
      // Scorched ground mark
      ctx.fillStyle = 'rgba(30, 10, 10, 0.6)';
      ctx.beginPath();
      ctx.arc(x, y, 28, 0, Math.PI * 2);
      ctx.fill();
      // Cracks in embers
      ctx.fillStyle = 'rgba(120, 30, 20, 0.5)';
      ctx.beginPath();
      ctx.arc(x, y, 20, 0, Math.PI * 2);
      ctx.fill();
    } else if (s.kind === 'warning') {
      // Expanding warning ring + ember glow
      const glow = ctx.createRadialGradient(x, y, 4, x, y, 42 * s.progress + 18);
      glow.addColorStop(0, 'rgba(255, 140, 40, ' + (0.6 * s.progress).toFixed(3) + ')');
      glow.addColorStop(1, 'rgba(220, 60, 20, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(x - 60, y - 60, 120, 120);
      // Flickering glyph
      ctx.fillStyle = 'rgba(255, 200, 80, ' + (0.4 + 0.5 * s.progress).toFixed(3) + ')';
      ctx.fillRect(x - 2, y - 12 * s.progress, 4, 12 * s.progress);
      ctx.strokeStyle = 'rgba(255, 80, 40, ' + s.progress.toFixed(3) + ')';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 36 * s.progress, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      // Erupting — big flame column
      const shimmer = 0.85 + 0.15 * Math.sin(gameTime * 50 + p.phase * 10);
      const h = 40 * (1 - Math.abs(s.progress - 0.5) * 1.3);
      // Outer glow
      const glow = ctx.createRadialGradient(x, y, 8, x, y, 60);
      glow.addColorStop(0, 'rgba(255, 180, 80, ' + (0.9 * shimmer).toFixed(3) + ')');
      glow.addColorStop(0.5, 'rgba(255, 90, 40, ' + (0.5 * shimmer).toFixed(3) + ')');
      glow.addColorStop(1, 'rgba(180, 20, 10, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(x - 70, y - 70 - h, 140, 140 + h);
      // Inner flame column — layered triangles
      ctx.fillStyle = 'rgba(255, 80, 40, 0.85)';
      ctx.beginPath();
      ctx.moveTo(x - 16, y + 4);
      ctx.lineTo(x + 16, y + 4);
      ctx.lineTo(x + 6, y - h);
      ctx.lineTo(x - 6, y - h);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 180, 80, 0.9)';
      ctx.beginPath();
      ctx.moveTo(x - 10, y + 2);
      ctx.lineTo(x + 10, y + 2);
      ctx.lineTo(x + 3, y - h * 0.8);
      ctx.lineTo(x - 3, y - h * 0.8);
      ctx.closePath();
      ctx.fill();
      // Tip highlight
      ctx.fillStyle = 'rgba(255, 240, 180, 0.95)';
      ctx.fillRect(x - 2, y - h * 0.9, 4, 6);
    }
  }
}

export function spawnExtraFirePool(wx, wy, phase = 0) {
  roomFirePools.push({ x: wx, y: wy, phase });
}

// Phase 3 audit fix #2 — boss phase-2 escalation helper. Spawns a new
// active spike at the given tile coords (NOT world coords like the fire-
// pool helper — spikes are tile-aligned for the existing spikeDamageAt
// lookup). Marks the underlying tile as 'spike' so the renderer picks
// it up. Caller is responsible for running this only on a tile that
// was previously 'floor' (the conditional check below skips wall/door
// tiles defensively in case the boss's enrage-trigger position drifts).
export function spawnExtraSpike(tx, ty, phase = 0) {
  if (!room.tiles || !room.tiles[ty]) return;
  if (room.tiles[ty][tx] !== 'floor') return;
  room.tiles[ty][tx] = 'spike';
  roomSpikes.push({ x: tx, y: ty, phase });
}

// Check if a world position is on an ACTIVE spike. Returns damage or 0.
export function spikeDamageAt(wx, wy, gameTime) {
  const tx = Math.floor(wx / TILE);
  const ty = Math.floor(wy / TILE);
  for (const s of roomSpikes) {
    if (s.x === tx && s.y === ty) {
      const st = spikeState(s, gameTime);
      if (st.kind === 'active') return 1;
    }
  }
  return 0;
}

export function heroSpawnInRoom() {
  const mid = Math.floor((room.w || ROOM_W) / 2);
  // Spawn row is one tile in from the entering door
  const preferredY = room.entryFrom === 'north' ? ((room.h || ROOM_H) - 2) : 2;
  // Walk outward from center along the spawn row to find a clear tile
  const check = (x) => room.tiles?.[preferredY]?.[x] === 'floor';
  if (check(mid)) return { x: mid * TILE + TILE / 2, y: preferredY * TILE + TILE / 2 };
  for (let off = 1; off < mid; off++) {
    if (check(mid - off)) return { x: (mid - off) * TILE + TILE / 2, y: preferredY * TILE + TILE / 2 };
    if (check(mid + off)) return { x: (mid + off) * TILE + TILE / 2, y: preferredY * TILE + TILE / 2 };
  }
  // Absolute fallback — any floor cell
  return { x: mid * TILE + TILE / 2, y: preferredY * TILE + TILE / 2 };
}
