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

// String → 32-bit hash (djb2 variant). Stable across runs, no Math.random,
// safe to mix into the shell-selection seed. Empty string returns the
// constant 5381 — caller is responsible for guarding so undefined fields
// don't accidentally salt the seed of rooms that don't have them.
function _strHash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = (((h << 5) + h) ^ s.charCodeAt(i)) >>> 0;
  }
  return h >>> 0;
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

  // Hash-driven probability roll. The seed mixes every stable
  // identifier we have on roomData so the realized shell rate over a
  // population of rooms approximates the configured `rule.chance`
  // (currently 0.60 for crucible / chamber).
  //
  // History: an earlier pass used only `pillarTemplate ^ (kindLen + dim)`
  // — for elites that gave just ~10 distinct seeds (6 pillarTemplates ×
  // 3 dim variants), each seed deterministically picks "always shell"
  // or "never shell". Realized rate landed at ~28% instead of the
  // nominal 60%.
  //
  // Fix: mix in archetype (5+ values), eliteAffixId (4 values), and
  // spikePattern (4-5 values) — all already populated on elite rooms
  // by makeCombatRoom + floorGraph. That bumps the elite seed space
  // from ~10 to several hundred buckets, so the population-realized
  // rate converges close to 0.60.
  //
  // CRITICAL: only XOR these fields when they are actually set. For
  // non-elite rooms (sanctuary / chestroom / etc.) archetype + affix
  // + spikePattern are typically undefined; XORing the constant
  // _strHash('') = 5381 into their seed would shift them onto a
  // different shell-decision bucket and could break Criterion 6's
  // "calm rooms unaffected" guarantee. Guarding with truthy checks
  // keeps non-elite seeds byte-identical to the previous version.
  const ek = _effectiveKind(data) || '';
  let seed = (data.pillarTemplate | 0) ^ (ek.length * 17 + (srcW * 31 + srcH * 13));
  if (data.archetype)    seed ^= _strHash(data.archetype);
  if (data.eliteAffixId) seed ^= _strHash(data.eliteAffixId) * 7;
  if (data.spikePattern) seed ^= (data.spikePattern * 23);
  // 2026-05-06 — prefer layoutSeed (per-room random stamped by floorGraph)
  // for full per-room diversity. Closes the 52% → ~60% crucible gap noted
  // in the prior verification. CRITICAL: layoutSeed is up to 2^31; the
  // _hash function multiplies its input by 73856093, and JavaScript
  // Number's 53-bit integer precision overflows when (2^31 * 73856093 ≈
  // 2^58). Fold the seed via xor-shift to 16 bits before mixing so the
  // hash arithmetic stays in the safe integer range. nodeId fallback for
  // saved data without layoutSeed.
  if (Number.isFinite(data.layoutSeed)) {
    const ls = data.layoutSeed | 0;
    seed ^= (((ls >>> 16) ^ ls) & 0xffff);
  } else if (Number.isFinite(data.nodeId)) {
    const nid = data.nodeId | 0;
    seed ^= (((nid >>> 16) ^ nid) & 0xffff);
  }
  const roll = _hash(seed >>> 0, 41) % 1000;
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

  // Spawn handling — RELOCATE first, prune as last resort.
  //
  // Reasons a spawn may now be invalid after the shell shrinks the
  // room geometry:
  //   (a) lands on a new authored pillar tile (would freeze the enemy)
  //   (b) lands on the focal tile (would block the focal silhouette)
  //   (c) lands out of bounds — when the source room was bigger than
  //       the shell (e.g. 26x18 source → 20x14 crucible), spawns at
  //       x≥20 or y≥14 are now in oblivion. Pre-fix this case was
  //       silently kept by the old prune-by-filter and presumably
  //       crashed or invisible-spawned the enemy.
  //   (d) lands on perimeter / door / threshold / focal-frame tiles
  //
  // Earlier passes simply filtered (a) + (b) and lost ~10% of elite
  // spawns. The relocator BFS-searches outward from each invalid
  // spawn for the nearest valid combat tile and moves the spawn
  // there. If no valid tile is reachable within radius, fall back
  // to pruning so a stuck enemy doesn't ship.
  if (data.spawns && data.spawns.length > 0) {
    relocateInvalidSpawnsForShell(data);
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

// ── SPAWN RELOCATION ────────────────────────────────────────────────────────
// When a shell is applied, spawns generated for the SOURCE room dims may
// now be out of bounds (smaller shell) or land on new pillars / focal
// tiles. The old approach was to prune them; the player then fought
// fewer enemies than the floor planner intended. Relocator: BFS for the
// nearest valid combat tile and move the spawn there, preserving enemy
// count where geometry allows.
//
// "Valid" means:
//   - In bounds (1 ≤ x ≤ w-2, 1 ≤ y ≤ h-2 — interior only, no door rows)
//   - Not on a pillar (data.authoredPillars)
//   - Not on the focal tile (data.authoredFocal)
//   - Not on a door tile (data.authoredDoorCols north/south)
//   - Not on the door threshold (1 tile inside each door — keeps the
//     door's light pool clear and prevents enemies blocking entry)
//   - Not on the player spawn buffer (radius 2 around south door
//     interior — player enters there, enemies right on top is unfair)
//   - Not on a tile already occupied by another spawn
//
// All criteria are derived from `data` fields the shell already wrote,
// so this works for any shell layout (crucible / chamber / future).
//
// Deterministic: BFS visits neighbors in fixed order, so reloading the
// same room produces the same relocation. No Math.random involved.

// Returns {x, y} of the nearest valid spawn tile to (originalX, originalY)
// reachable via BFS up to maxRadius steps. Returns null if no such tile
// exists within radius (caller should fall back to pruning).
export function findNearestValidSpawnTile(data, originalX, originalY, occupied, maxRadius = 10) {
  const w = data.w | 0, h = data.h | 0;
  if (w <= 2 || h <= 2) return null;

  const pillarSet = new Set((data.authoredPillars || []).map(p => `${p.x},${p.y}`));
  const focal = data.authoredFocal;
  const focalKey = focal ? `${focal.x},${focal.y}` : null;
  const northX = data.authoredDoorCols?.north;
  const southX = data.authoredDoorCols?.south;

  // Player spawn buffer — player enters at south door, walks 1-2 tiles
  // north on entry. Reserve a 2-tile-radius circle around (southX, h-2)
  // so enemies don't immediately overlap the player.
  const playerX = (southX != null) ? southX : Math.floor(w / 2);
  const playerY = h - 2;

  function isValid(x, y) {
    // Interior only — perimeter rows + columns are off-limits.
    if (x < 1 || x > w - 2 || y < 1 || y > h - 2) return false;
    const k = `${x},${y}`;
    if (pillarSet.has(k)) return false;
    if (focalKey === k) return false;
    if (occupied && occupied.has(k)) return false;
    // Door threshold — 1 tile inside each door.
    if (y === 1 && x === northX) return false;
    if (y === h - 2 && x === southX) return false;
    // Player spawn buffer.
    const dpx = x - playerX, dpy = y - playerY;
    if (dpx * dpx + dpy * dpy < 4) return false;
    return true;
  }

  // BFS from origin. The origin itself may or may not be valid — the
  // caller has already determined this spawn needs relocation, so we
  // skip the origin and only return at distance ≥ 1.
  const seen = new Set();
  seen.add(`${originalX},${originalY}`);
  const queue = [{ x: originalX, y: originalY, d: 0 }];
  while (queue.length > 0) {
    const cur = queue.shift();
    if (cur.d > 0 && isValid(cur.x, cur.y)) {
      return { x: cur.x, y: cur.y };
    }
    if (cur.d >= maxRadius) continue;
    // 4-neighborhood, fixed order (E, W, S, N) for determinism.
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const [dx, dy] of dirs) {
      const nx = cur.x + dx, ny = cur.y + dy;
      const nk = `${nx},${ny}`;
      if (seen.has(nk)) continue;
      seen.add(nk);
      queue.push({ x: nx, y: ny, d: cur.d + 1 });
    }
  }
  return null;
}

// Iterates data.spawns and relocates any that are now invalid post-shell.
// Mutates data.spawns in place. Returns counts for telemetry.
//
// "Invalid" detection mirrors findNearestValidSpawnTile's isValid checks.
// We separate the two because we want to relocate ONLY spawns that were
// actually invalid, while letting valid spawns count as "occupied" so
// the relocator doesn't move two enemies onto the same tile.
//
// If a spawn cannot be relocated (no valid tile within maxRadius), it
// is pruned as a fallback — better to lose one enemy than have a frozen
// stuck-on-a-pillar enemy ship.
export function relocateInvalidSpawnsForShell(data) {
  if (!data || !Array.isArray(data.spawns) || data.spawns.length === 0) {
    return { relocated: 0, pruned: 0, kept: 0 };
  }
  const w = data.w | 0, h = data.h | 0;
  const pillarSet = new Set((data.authoredPillars || []).map(p => `${p.x},${p.y}`));
  const focal = data.authoredFocal;
  const focalKey = focal ? `${focal.x},${focal.y}` : null;
  const northX = data.authoredDoorCols?.north;
  const southX = data.authoredDoorCols?.south;
  const playerX = (southX != null) ? southX : Math.floor(w / 2);
  const playerY = h - 2;

  function spawnIsInvalid(s) {
    const x = s.x | 0, y = s.y | 0;
    if (x < 1 || x > w - 2 || y < 1 || y > h - 2) return true;     // OOB after shrink
    const k = `${x},${y}`;
    if (pillarSet.has(k)) return true;
    if (focalKey === k) return true;
    if (y === 1 && x === northX) return true;
    if (y === h - 2 && x === southX) return true;
    // Player spawn buffer
    const dpx = x - playerX, dpy = y - playerY;
    if (dpx * dpx + dpy * dpy < 4) return true;
    return false;
  }

  // First pass: walk spawns in original order, classify invalid, build
  // an "occupied" set from VALID spawns so relocator can avoid stacking
  // two spawns on the same tile.
  const occupied = new Set();
  const invalidIdx = [];
  for (let i = 0; i < data.spawns.length; i++) {
    const s = data.spawns[i];
    if (spawnIsInvalid(s)) {
      invalidIdx.push(i);
    } else {
      occupied.add(`${s.x | 0},${s.y | 0}`);
    }
  }

  // Second pass: try to relocate each invalid spawn. On success, mutate
  // its x/y in place + add to occupied. On failure, mark for prune.
  const pruneIdx = [];
  let relocated = 0;
  for (const i of invalidIdx) {
    const s = data.spawns[i];
    const found = findNearestValidSpawnTile(data, s.x | 0, s.y | 0, occupied);
    if (found) {
      s.x = found.x;
      s.y = found.y;
      occupied.add(`${found.x},${found.y}`);
      relocated++;
    } else {
      pruneIdx.push(i);
    }
  }

  // Third pass: actually drop the spawns that couldn't be relocated.
  // Iterate in reverse so splice indices stay valid.
  if (pruneIdx.length > 0) {
    pruneIdx.sort((a, b) => b - a);
    for (const i of pruneIdx) data.spawns.splice(i, 1);
  }

  return {
    relocated,
    pruned: pruneIdx.length,
    kept: data.spawns.length,
  };
}
