// ============================================================================
// AUTHORED ROOM SHELLS — proof-of-concept architecture layer
//
// Three hand-tuned room outlines that override the procedural pillar +
// door positions for selected room kinds. Earlier passes added visual
// identity (floor tint, vignette scale, focal kind, prop family) but
// the underlying ARCHITECTURE was still random — the same 15 pillar
// templates rolled by hash, the same rect→L/T/plus carves, the same
// generic door alignment. Two combat rooms were "the same rectangle
// with different paint."
//
// This file makes architecture itself a per-kind decision, but as a
// SLICE not a rewrite:
//   - Only 3 shells (Combat Arena, Crucible, Chamber)
//   - Selective routing per kind (50-60% chance per eligible room)
//   - BFS pathing validation BEFORE commit; fallback to procedural if
//     the shell would soft-block the player
//   - Shell pillars + door columns + focal anchor override; everything
//     else (spawns, urns, decor, theme, biome) flows through unchanged
//
// Shell coordinates are ABSOLUTE tile positions inside the shell's own
// w×h grid. The applier mutates `data.w`, `data.h`, and writes
// `data.authoredPillars` / `data.authoredDoorCols` / `data.authoredFocal`.
// `room.js` reads these in buildRoomFromData and skips the procedural
// pillar-template + door-default + focal-placement code paths when
// they're present.
// ============================================================================

// ── SHELL DEFINITIONS ────────────────────────────────────────────────────────
//
// Each shell is one object with:
//   w, h          : tile dimensions (the room is built at exactly these)
//   pillars       : array of {x, y} — absolute interior pillar positions
//   doorCols      : { north, south } — columns where doors will sit in
//                   the wall rows. Doors are always on perimeter rows
//                   (y=0, y=h-1).
//   focal         : { x, y } — absolute tile for the room's focal anchor.
//                   The focal KIND still comes from roomKindVisualProfile
//                   so each shell can host any compatible focal piece.
//   forbidTiles   : array of {x, y} — tiles where prop dressing should
//                   NOT place urns/decor (focal area + pillar tiles).
//                   Currently informational; the dressing layer reads
//                   it via `room.forbidTiles` after applyAuthoredShell.
//   layoutLabel   : human-readable layout class for code-readers.
//
// Three shells, each tuned for a clear identity:

export const SHELLS = {

  // ── 1. STANDARD COMBAT ARENA ────────────────────────────────────────
  // Medium 20×14. Asymmetric: 2 pillars on the left forming a half-wall
  // pocket (cover for ranged play), 1 pillar on the right offset down
  // (forces flanking around it). Focal pulled off-center toward the
  // right pillar so the eye lands right of geometric center — the room
  // doesn't read as "rect with stuff in middle" anymore. Doors aligned
  // at column 10 N+S so the natural walking line bisects the central
  // open lane.
  combat_arena: {
    w: 20, h: 14,
    pillars: [
      { x: 5,  y: 4 },     // upper-left blocker — frames a sniper pocket
      { x: 5,  y: 9 },     // lower-left blocker — same column, paired
      { x: 14, y: 6 },     // single right blocker — staggered, asymmetric
    ],
    doorCols: { north: 10, south: 10 },
    focal:    { x: 13, y: 8 },     // off-center R-of-center
    forbidTiles: [
      { x: 5, y: 4 }, { x: 5, y: 9 }, { x: 14, y: 6 },
      { x: 13, y: 8 },               // focal tile
    ],
    layoutLabel: 'asymmetric-combat-arena',
  },

  // ── 2. ELITE / CHALLENGE CRUCIBLE ───────────────────────────────────
  // 20×14. Symmetric ritual square — 4 pillars at the corners of an
  // 11×7 inner box centered on the room's geometric middle, framing the
  // central focal as the obvious target. The symmetry communicates
  // "deliberate arena," not "stockroom"; the inner box reads as a ring
  // the player will fight inside. Doors centered on column 10.
  crucible: {
    w: 20, h: 14,
    pillars: [
      { x: 4,  y: 4 },     // NW corner of the inner ring
      { x: 15, y: 4 },     // NE
      { x: 4,  y: 10 },    // SW
      { x: 15, y: 10 },    // SE
    ],
    doorCols: { north: 10, south: 10 },
    focal:    { x: 10, y: 7 },     // dead center — the ritual point
    forbidTiles: [
      { x: 4, y: 4 }, { x: 15, y: 4 }, { x: 4, y: 10 }, { x: 15, y: 10 },
      { x: 10, y: 7 },
    ],
    layoutLabel: 'symmetric-ritual-arena',
  },

  // ── 3. TREASURE / SANCTUARY CHAMBER ─────────────────────────────────
  // Smaller 16×11. Symmetric. Two framing pillars in the upper third
  // (the "altar wings") draw the eye to the central focal — the
  // composition is essentially a stage. No combat blockers; this is a
  // calm room. Doors centered on column 8 so the player walks straight
  // toward the reward.
  chamber: {
    w: 16, h: 11,
    pillars: [
      { x: 4,  y: 3 },     // left altar-wing pillar
      { x: 11, y: 3 },     // right altar-wing pillar
    ],
    doorCols: { north: 8, south: 8 },
    focal:    { x: 8, y: 5 },     // centered, pulled forward of geometric mid
    forbidTiles: [
      { x: 4, y: 3 }, { x: 11, y: 3 },
      { x: 8, y: 5 },
    ],
    layoutLabel: 'symmetric-altar-chamber',
  },

};

// ── SELECTION ────────────────────────────────────────────────────────────────
// Per the brief: only SOMETIMES route through the shell, so the existing
// procedural rooms still appear for variety. The roll is hash-derived
// from data fields so the same room id always picks the same shell (or
// fallback) — a reload doesn't shuffle the layout.
//
// Probability per kind:
//   combat              → 0% (DISABLED — see note below)
//   challenge / elite   → 60% crucible
//   sanctuary / reward  → 60% chamber
//   chestroom           → 60% chamber  (similar ceremonial feel)
// Anything else: null (use existing generator)
//
// Combat shells are disabled until there are at least 3 strong combat
// shell variants. Playtest of the single combat_arena shell at 50%
// routing produced visible repetition: combat is the most-common room
// kind (5-8 per floor), and one authored layout repeated 2-4× per
// floor reads as a fingerprint instead of a designed feel. Crucible +
// chamber don't have this problem because their kinds are rare
// (1-2 per floor) and their symmetry IS the identity.
//
// Definition stays in SHELLS so the apply/validate paths still work
// end-to-end; only the routing chance is zeroed out so the picker
// never selects it.
const SHELL_BY_KIND = {
  combat:    { id: 'combat_arena', chance: 0.00 },
  challenge: { id: 'crucible',     chance: 0.60 },
  elite:     { id: 'crucible',     chance: 0.60 },
  sanctuary: { id: 'chamber',      chance: 0.60 },
  reward:    { id: 'chamber',      chance: 0.60 },
  chestroom: { id: 'chamber',      chance: 0.60 },
};

// Hash helper — same as roomComposition.js but local so this file
// stays standalone (no circular import risk). Stable per-data inputs.
function _hash(a, b) {
  let h = (a * 73856093) ^ (b * 19349663);
  h = (h ^ (h >>> 13)) * 1274126177;
  return (h ^ (h >>> 16)) >>> 0;
}

// Mirror of roomComposition.js's getEffectiveRoomKind, inlined here so
// this file stays import-free. Elite rooms generate from the combat
// archetype (data.kind === 'combat') but flag eliteRoom=true; honoring
// that flag here is what lets crucible shells actually fire on real
// elite rooms. Pre-fix: SHELL_BY_KIND['combat'] returned chance 0.00,
// so 0% of elite rooms ever got a shell. Post-fix: SHELL_BY_KIND['elite']
// returns chance 0.60 — crucibles fire on ~60% of elite rooms as designed.
function _effectiveKind(data) {
  if (!data) return null;
  if (data.eliteRoom) return 'elite';
  if (data.actualKind) return data.actualKind;
  return data.kind;
}

export function pickAuthoredShell(data) {
  if (!data) return null;
  const rule = SHELL_BY_KIND[_effectiveKind(data)];
  if (!rule) return null;

  const shell = SHELLS[rule.id];
  if (!shell) return null;

  // Only apply when data dimensions are COMPATIBLE with the shell.
  // Bigger rooms (boss, miniboss arenas, long-hall combat) skip the
  // shell so we don't shrink them unexpectedly. The rule of thumb:
  // shell dims must be ≤ source dims (so spawns aren't out of bounds)
  // AND ≥ 0.7× source dims (so the shell doesn't feel too cramped
  // relative to what the floor planner intended).
  const srcW = data.w | 0, srcH = data.h | 0;
  if (srcW <= 0 || srcH <= 0) return null;
  if (shell.w > srcW || shell.h > srcH) return null;

  // SAFETY: skip rooms with multi-door north walls (doorPlan.north has
  // 2+ columns). The graph forced those door positions for connectivity
  // reasons — rerouting them through a single shell-authored column
  // would break the next room's matching south door alignment. Single
  // outgoing edges (the common case) are fine.
  if (data.doorPlan && Array.isArray(data.doorPlan.north) && data.doorPlan.north.length > 1) {
    return null;
  }
  // Optional: reject if shell is way smaller than source. For now allow
  // any compatible shell — the chamber being smaller than a wide
  // combat-3 source is intentional ("treasure rooms are smaller").

  // Hash-driven probability roll. data.pillarTemplate is a stable
  // floor-graph-generation field; we mix it with kind length so two
  // rooms with the same pillarTemplate but different kinds get
  // independent rolls. Use effective kind so elite rooms don't share
  // a roll with combat rooms of the same pillarTemplate.
  const ek = _effectiveKind(data) || '';
  const seed = (data.pillarTemplate | 0) ^ (ek.length * 17 + (srcW * 31 + srcH * 13));
  const roll = _hash(seed, 41) % 1000;
  if (roll >= rule.chance * 1000) return null;

  return rule.id;
}

// ── APPLY ────────────────────────────────────────────────────────────────────
// Mutates `data` in place, then runs validation. If validation fails
// (some pathway is blocked), reverts data and returns false so
// buildRoomFromData can fall through to the existing procedural code
// path.
//
// What's mutated:
//   data.w, data.h           — shrunk to shell dims if shell is smaller
//   data.shape               — forced to 'rect' (shells assume rect)
//   data.authoredPillars     — array of {x, y} read by buildRoomFromData
//   data.authoredDoorCols    — { north, south } read by buildRoomFromData
//   data.authoredFocal       — { x, y } read by assignRoomFocal
//   data.shellId             — string, for debug + future identity
//   data.spawns              — pruned: any spawn that would land on a
//                              new pillar tile is dropped (rare, but
//                              prevents a frozen enemy stuck on a wall)
//
// Returns true on success; false if validation rejects the layout.
export function applyAuthoredShell(data, shellId) {
  const shell = SHELLS[shellId];
  if (!shell) return false;

  // Snapshot anything we might revert.
  const snapshot = {
    w: data.w, h: data.h,
    shape: data.shape,
    spawns: data.spawns ? data.spawns.slice() : null,
  };

  // Apply shell.
  data.w = shell.w;
  data.h = shell.h;
  data.shape = 'rect';     // shells assume non-carved rect
  data.authoredPillars = shell.pillars.map(p => ({ x: p.x, y: p.y }));
  data.authoredDoorCols = { north: shell.doorCols.north, south: shell.doorCols.south };
  data.authoredFocal = { x: shell.focal.x, y: shell.focal.y };
  data.authoredForbidTiles = shell.forbidTiles.map(t => ({ x: t.x, y: t.y }));
  data.shellId = shellId;

  // Prune spawns that:
  //   (a) fall on a pillar tile (would freeze the enemy), or
  //   (b) sit on the focal tile (would block the focal piece visually
  //       — it's only cosmetic, but readability matters).
  if (data.spawns) {
    const pillarSet = new Set(data.authoredPillars.map(p => `${p.x},${p.y}`));
    const focalKey  = `${shell.focal.x},${shell.focal.y}`;
    data.spawns = data.spawns.filter(s => {
      const k = `${s.x},${s.y}`;
      return !pillarSet.has(k) && k !== focalKey;
    });
  }

  // VALIDATE PATHING. If any door or focal would be unreachable from
  // the south door, the shell would softlock the room — revert and
  // return false so the caller falls back to procedural generation.
  if (!validateShellPathing(data)) {
    // Revert
    data.w = snapshot.w;
    data.h = snapshot.h;
    data.shape = snapshot.shape;
    delete data.authoredPillars;
    delete data.authoredDoorCols;
    delete data.authoredFocal;
    delete data.authoredForbidTiles;
    delete data.shellId;
    if (snapshot.spawns) data.spawns = snapshot.spawns;
    return false;
  }

  return true;
}

// ── VALIDATION ───────────────────────────────────────────────────────────────
// BFS from the south door. Verifies:
//   - North door tile is reachable
//   - Focal anchor tile is reachable
//   - Total reachable interior is ≥ 50% of free tiles (catches
//     pathological pillar layouts that wall off half the room)
//
// "Walkable" = NOT perimeter wall, NOT pillar. Doors are walkable.
// Floor cells obviously walkable.
export function validateShellPathing(data) {
  if (!data || !data.authoredPillars || !data.authoredDoorCols || !data.authoredFocal) {
    return false;
  }
  const w = data.w | 0, h = data.h | 0;
  const pillars = new Set(data.authoredPillars.map(p => `${p.x},${p.y}`));
  const northX = data.authoredDoorCols.north;
  const southX = data.authoredDoorCols.south;

  function walkable(x, y) {
    if (x < 0 || x >= w || y < 0 || y >= h) return false;
    // Door cells in the wall rows are walkable
    if (y === 0)        return x === northX;
    if (y === h - 1)    return x === southX;
    // Side perimeter walls
    if (x === 0 || x === w - 1) return false;
    // Pillars block
    if (pillars.has(`${x},${y}`)) return false;
    return true;
  }

  // BFS from south door tile.
  if (!walkable(southX, h - 1)) return false;
  const visited = new Set([`${southX},${h - 1}`]);
  const queue = [[southX, h - 1]];
  while (queue.length) {
    const [cx, cy] = queue.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      const k = `${nx},${ny}`;
      if (visited.has(k)) continue;
      if (!walkable(nx, ny)) continue;
      visited.add(k);
      queue.push([nx, ny]);
    }
  }

  // North door reachable?
  if (!visited.has(`${northX},0`)) return false;

  // Focal reachable?
  const focal = data.authoredFocal;
  if (!visited.has(`${focal.x},${focal.y}`)) return false;

  // Reachable area ≥ 50% of total free interior tiles?
  let totalFree = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      if (walkable(x, y)) totalFree++;
    }
  }
  // Visited includes 2 door tiles which are in perimeter rows; subtract
  // them from the comparison so we're comparing interior reach to
  // interior free tiles.
  const interiorReached = visited.size - 2;
  if (interiorReached < totalFree * 0.5) return false;

  return true;
}
