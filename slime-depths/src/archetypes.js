// ============================================================================
// ROOM ARCHETYPES — bundled tactical recipes
//
// Replaces the independent (size, shape, pillarTemplate, spikePattern,
// random spawn positions) rolls with NAMED archetypes that bundle these
// dimensions so each room reads as a designed tactical situation, not a
// random assemblage. A "GAUNTLET" feels like a gauntlet because the
// snipers are at the back AND the spike line is in the middle AND the
// pillar template is open — those choices were made together.
//
// Each archetype declares:
//   sizes        — which size templates fit (picker chooses one)
//   shapes       — which shapes fit
//   pillars      — pillar template indices that suit the layout
//   spikePattern — spike trap pattern index (or null for none)
//   firePools    — fire pool placements (relative coords, or null)
//   spawnRule    — function that places enemies tactically
//   weight       — base weight for archetype selection
//
// pickArchetype(kind, slot, level) returns one weighted-randomly. The
// archetype is then applied via applyArchetype which produces the
// concrete room data (size, shape, pillarTemplate, spikePattern,
// spawns[]) — replacing the old independent rolls.
// ============================================================================

import { ROOM_SIZES, isCarvedTile, getCarveSize, getPillarCells } from './room.js';

// Enemy behavior allowlists — used by spawn rules to decide where to
// place each type. Kept as name lists (instead of importing TYPES) so
// archetypes.js stays free of import cycles with enemies.js.
const RANGED_TYPES = new Set([
  'archer', 'wizard', 'priest', 'reflector', 'haunt', 'dreadmage', 'hermit',
]);
const BOMBER_TYPES = new Set(['bomber']);
const HEAVY_MELEE_TYPES = new Set(['orc', 'vanguard', 'warden', 'echo']);
// Everything else (slime, skel, lancer) defaults to "light melee".

function isRanged(type) { return RANGED_TYPES.has(type); }
function isBomber(type) { return BOMBER_TYPES.has(type); }
function isHeavyMelee(type) { return HEAVY_MELEE_TYPES.has(type); }

// ─── ARCHETYPES ───────────────────────────────────────────────────────────
// Each archetype is one tactical situation. Weights are the raw selection
// probabilities; the picker normalizes within the kind's eligible set.
export const ARCHETYPES = {
  // Snipers at the back, melee in front. Hero must close under fire.
  // Wide room rewards line-of-sight management.
  gauntlet: {
    name: 'gauntlet',
    sizes: ['wide', 'large'],
    shapes: ['rect'],
    pillars: [3, 8, 11],          // open / pincer / gauntlet
    spikePattern: 0,               // horizontal middle line
    spawnRule: 'gauntlet',
    weight: 1.0,
  },
  // Lurkers tucked in the carved alcove. Hero is exposed in the open
  // until they push into the alcove.
  ambush: {
    name: 'ambush',
    sizes: ['medium', 'wide'],
    shapes: ['L_NE', 'L_NW', 'L_SE', 'L_SW'],
    pillars: [0, 4, 14],           // 4 corners / T-shape / twin altars
    spikePattern: 2,               // two clusters
    spawnRule: 'ambush',
    weight: 1.0,
  },
  // Single elite (or mini-boss) at center, no spike traps. Clean duel.
  // Cross shape gives the hero room to circle.
  sanctum: {
    name: 'sanctum',
    sizes: ['medium', 'large'],
    shapes: ['plus'],
    pillars: [10],                 // sanctum circle
    spikePattern: null,            // clean duel — no spikes
    spawnRule: 'sanctum',
    weight: 0.6,
  },
  // Cross-shape with fire pools at the arms. Swarm of weak melee
  // forces orbiting around hazards while clearing.
  crucible: {
    name: 'crucible',
    sizes: ['large'],
    shapes: ['plus'],
    pillars: [6],                  // cross center
    spikePattern: null,
    firePools: 'arms',             // special — placed at the cross arms
    spawnRule: 'swarm',
    weight: 0.5,
  },
  // Dense pillars + many fast low-HP enemies. Line-of-sight game,
  // dodge-rolling required to avoid getting cornered.
  maze: {
    name: 'maze',
    sizes: ['medium', 'wide'],
    shapes: ['rect'],
    pillars: [7, 9, 12],           // zigzag / quadrant / spiral
    spikePattern: null,
    spawnRule: 'scattered',
    weight: 0.8,
  },
  // Mini-boss-style: 1 heavy + 2-3 adds. Open arena, perimeter spikes
  // pull the fight to the center.
  arena: {
    name: 'arena',
    sizes: ['large'],
    shapes: ['rect'],
    pillars: [3, 0],               // open / 4 corners
    spikePattern: 3,               // corridor (mid + back lines)
    spawnRule: 'mini_boss_with_adds',
    weight: 0.6,
  },
  // Vertical wall splits room into top and bottom lanes. Archers in
  // one lane, melee in the other — flank or face both.
  lanes: {
    name: 'lanes',
    sizes: ['wide'],
    shapes: ['rect'],
    pillars: [5, 8],               // central wall / pincer
    spikePattern: 1,               // diagonal crossing
    spawnRule: 'lanes',
    weight: 0.7,
  },
  // T-shape with the carved arm = a "guard post". Ranged tucked there,
  // melee blocking the entry to it.
  outpost: {
    name: 'outpost',
    sizes: ['medium'],
    shapes: ['T_top', 'T_bottom', 'T_left', 'T_right'],
    pillars: [4, 14],
    spikePattern: 2,
    spawnRule: 'outpost',
    weight: 0.7,
  },
};

// ─── PICKER ─────────────────────────────────────────────────────────────────
// Returns one archetype weighted-randomly. Filters by kind/slot/level so
// e.g. ambush + sanctum don't roll for combat1 (too punishing for the
// floor opener).
export function pickArchetype(kind, slot, level) {
  if (kind !== 'combat' && kind !== 'challenge') return null;
  const eligible = [];
  for (const name of Object.keys(ARCHETYPES)) {
    const a = ARCHETYPES[name];
    let w = a.weight;
    // Difficulty-based gating
    if (slot === 'combat1' && (name === 'arena' || name === 'crucible')) w = 0;
    if (slot === 'miniboss' && name !== 'arena' && name !== 'sanctum') w *= 0.3;
    if (level === 1 && (name === 'crucible' || name === 'sanctum')) w *= 0.4;
    if (w > 0) eligible.push({ archetype: a, w });
  }
  if (eligible.length === 0) return null;
  const totalW = eligible.reduce((s, e) => s + e.w, 0);
  let r = Math.random() * totalW;
  for (const e of eligible) {
    r -= e.w;
    if (r <= 0) return e.archetype;
  }
  return eligible[eligible.length - 1].archetype;
}

// ─── APPLY ─────────────────────────────────────────────────────────────────
// Given an archetype + an enemy comp, produces { size, shape, pillarTemplate,
// spikePattern, spawns, firePools }. The spawn rule is the creative core —
// it positions enemies in tactically meaningful spots based on their behavior.
export function applyArchetype(archetype, comp) {
  const size = ROOM_SIZES[pick(archetype.sizes)];
  const shape = pick(archetype.shapes);
  const pillarTemplate = pick(archetype.pillars);
  const spikePattern = archetype.spikePattern;
  const firePools = archetype.firePools || null;
  const spawns = SPAWN_RULES[archetype.spawnRule](
    comp, size.w, size.h, shape, pillarTemplate
  );
  return { size, shape, pillarTemplate, spikePattern, firePools, spawns };
}

// ─── SPAWN RULES ───────────────────────────────────────────────────────────
// Each rule returns an array of { type, x, y } in TILE coords. The caller
// (makeCombatRoom) wraps each with hpMul / damageMul / elite flags.
const SPAWN_RULES = {
  // Ranged at the BACK (north band y=2..4), melee at the FRONT (south band
  // y=h-5..h-3). Hero spawns at the south door, so melee blocks the
  // approach and ranged fires from beyond.
  gauntlet(comp, w, h, shape, pillarTemplate) {
    const ranged = comp.filter(t => isRanged(t));
    const melee = comp.filter(t => !isRanged(t));
    const out = [];
    placeBand(out, ranged, w, h, shape, pillarTemplate, 2, 4);
    placeBand(out, melee, w, h, shape, pillarTemplate, h - 5, h - 3);
    return out;
  },

  // Ranged TUCKED INTO the un-carved corner of an L-shape (the part
  // furthest from the hero). Melee blocks the approach in the open area.
  ambush(comp, w, h, shape, pillarTemplate) {
    const ranged = comp.filter(t => isRanged(t));
    const melee = comp.filter(t => !isRanged(t));
    const out = [];
    // Find the un-carved corner of the L. If shape is L_NE, the playable
    // corner is NW (top-left). Lurkers go there.
    const tucked = oppositeCorner(shape);
    placeNearCorner(out, ranged, w, h, shape, pillarTemplate, tucked);
    placeBand(out, melee, w, h, shape, pillarTemplate, 4, h - 4);
    return out;
  },

  // ONE elite at the center. The comp's first non-bomber enemy is
  // promoted to elite (handled by makeCombatRoom). Other comp entries
  // are placed at the cross arms so the hero can pick them off mid-duel.
  sanctum(comp, w, h, _shape, _pillarTemplate) {
    const out = [];
    // Center elite
    const center = comp.find(t => !isBomber(t)) || comp[0];
    out.push({ type: center, x: Math.floor(w / 2), y: Math.floor(h / 2) });
    const rest = comp.filter((_, i) => comp.indexOf(comp.find(t => !isBomber(t)) || comp[0]) !== i);
    // Place rest at the four cardinal extremes of the cross
    const armPositions = [
      [Math.floor(w / 2), 3],            // top arm
      [Math.floor(w / 2), h - 4],        // bottom arm
      [3, Math.floor(h / 2)],            // left arm
      [w - 4, Math.floor(h / 2)],        // right arm
    ];
    rest.forEach((t, i) => {
      const [x, y] = armPositions[i % armPositions.length];
      out.push({ type: t, x, y });
    });
    return out;
  },

  // SWARM — many weak enemies clustered around the cross center.
  // The fire pools at the arms (added separately) force orbiting.
  swarm(comp, w, h, shape, pillarTemplate) {
    const out = [];
    placeBand(out, comp, w, h, shape, pillarTemplate, 3, h - 3);
    return out;
  },

  // SCATTERED — enemies dispersed across the room, no clustering.
  // Pillar templates create line-of-sight breaks naturally.
  scattered(comp, w, h, shape, pillarTemplate) {
    const out = [];
    placeBand(out, comp, w, h, shape, pillarTemplate, 3, h - 3);
    return out;
  },

  // Mini-boss at center, adds at the room's four corners (inset). The
  // perimeter spikes (added separately) keep the fight pulled inward.
  mini_boss_with_adds(comp, w, h, _shape, _pillarTemplate) {
    const out = [];
    const heavy = comp.find(t => isHeavyMelee(t)) || comp[0];
    out.push({ type: heavy, x: Math.floor(w / 2), y: Math.floor(h / 2) });
    const adds = comp.filter(t => t !== heavy);
    const corners = [
      [4, 4], [w - 5, 4], [4, h - 5], [w - 5, h - 5],
    ];
    adds.forEach((t, i) => {
      const [x, y] = corners[i % corners.length];
      out.push({ type: t, x, y });
    });
    return out;
  },

  // Top lane: ranged. Bottom lane: melee. Vertical pillar wall splits
  // the room — hero must commit to a side or be flanked.
  lanes(comp, w, h, shape, pillarTemplate) {
    const ranged = comp.filter(t => isRanged(t));
    const melee = comp.filter(t => !isRanged(t));
    const out = [];
    // Ranged in TOP half, melee in BOTTOM half
    const halfH = Math.floor(h / 2);
    placeBand(out, ranged, w, h, shape, pillarTemplate, 2, halfH - 1);
    placeBand(out, melee, w, h, shape, pillarTemplate, halfH + 1, h - 3);
    return out;
  },

  // Ranged in the carved arm of the T (the "post"), melee blocking the
  // entry to it. Players have to choose: dive into the post for the
  // sniper, or fight the melee blocking it.
  outpost(comp, w, h, shape, pillarTemplate) {
    const ranged = comp.filter(t => isRanged(t));
    const melee = comp.filter(t => !isRanged(t));
    const out = [];
    // T_top = stem extends from BOTTOM. The "post" is the bottom band.
    // T_bottom = stem extends from TOP — post is top band.
    // T_left = stem extends from RIGHT — post is right band.
    // T_right = stem extends from LEFT — post is left band.
    const post = postBand(shape, w, h);
    placeBand(out, ranged, w, h, shape, pillarTemplate, post.y0, post.y1, post.x0, post.x1);
    // Melee fills the "open" area away from the post
    placeBand(out, melee, w, h, shape, pillarTemplate, 3, h - 4);
    return out;
  },
};

// ─── HELPERS ───────────────────────────────────────────────────────────────

function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }

// Place enemies within a vertical band [y0, y1] (and optionally [x0, x1]),
// avoiding pillars and carved tiles. Mutates `out`.
function placeBand(out, types, w, h, shape, pillarTemplate, y0, y1, x0, x1) {
  if (!types || types.length === 0) return;
  const xMin = (x0 != null) ? x0 : 2;
  const xMax = (x1 != null) ? x1 : w - 3;
  const sx = w / 20, sy = h / 14;
  const pillars = getPillarCells(pillarTemplate)
    .map(([px, py]) => [Math.round(px * sx), Math.round(py * sy)]);
  const isPillar = (x, y) => pillars.some(([px, py]) => Math.abs(px - x) <= 1 && Math.abs(py - y) <= 1);
  for (const t of types) {
    let placed = false;
    for (let tries = 0; tries < 30 && !placed; tries++) {
      const x = randInt(xMin, xMax);
      const y = randInt(Math.max(2, y0), Math.min(h - 3, y1));
      if (isPillar(x, y)) continue;
      if (isCarvedTile(x, y, w, h, shape)) continue;
      if (out.some(c => Math.abs(c.x - x) + Math.abs(c.y - y) < 2)) continue;
      out.push({ type: t, x, y });
      placed = true;
    }
    // Fallback — center band if nothing else fit
    if (!placed) {
      out.push({ type: t, x: Math.floor(w / 2), y: Math.floor(h / 2) });
    }
  }
}

// Place enemies tucked into a specific corner (e.g. for AMBUSH lurkers).
function placeNearCorner(out, types, w, h, shape, pillarTemplate, corner) {
  if (!types || types.length === 0) return;
  const { cw, ch } = getCarveSize(w, h);
  const x0 = corner.includes('W') ? 2 : w - cw - 3;
  const x1 = corner.includes('W') ? cw + 2 : w - 3;
  const y0 = corner.includes('N') ? 2 : h - ch - 3;
  const y1 = corner.includes('N') ? ch + 2 : h - 3;
  placeBand(out, types, w, h, shape, pillarTemplate, y0, y1, x0, x1);
}

// Returns the corner OPPOSITE the carved one in an L-shape. AMBUSH places
// the lurkers there so they're safely tucked away from the hero spawn.
function oppositeCorner(shape) {
  return {
    L_NE: 'NW',
    L_NW: 'NE',
    L_SE: 'SW',
    L_SW: 'SE',
  }[shape] || 'NW';
}

// Returns the band coords for the "post" arm of a T-shape. The arm
// extends OPPOSITE the carved corners (e.g. T_top carves NE+NW, so the
// post extends downward — band is the bottom half).
function postBand(shape, w, h) {
  const halfH = Math.floor(h / 2);
  const halfW = Math.floor(w / 2);
  switch (shape) {
    case 'T_top':    return { y0: halfH + 1, y1: h - 3 };          // post at bottom
    case 'T_bottom': return { y0: 2, y1: halfH - 1 };              // post at top
    case 'T_left':   return { y0: 3, y1: h - 3, x0: halfW + 1, x1: w - 3 };  // post at right
    case 'T_right':  return { y0: 3, y1: h - 3, x0: 2, x1: halfW - 1 };       // post at left
    default:         return { y0: 3, y1: h - 3 };
  }
}

function randInt(min, max) { return (min + Math.random() * (max - min + 1)) | 0; }
