// ============================================================================
// ZONE ENCOUNTERS — per-zone wave + boss + spawn-point config.
//
// Stand-and-Hold model: each zone is one arena. After load, wave 1 spawns
// from a subset of the zone's edge spawn points. Each wave clear triggers
// the next; after wave 3 clears, the boss arrives at the zone's signature
// location. Boss death spawns a portal to the next zone.
//
// Coordinates are in TILE units (the bake's 32-px source). The runner
// converts to display pixels by multiplying by TILE (48). Pick spawn
// points at the EDGES of the walkable component so enemies enter from
// off-screen-ish; pick boss locations at the map's signature feature
// (throne dais / lava platform / central plaza / etc.).
//
// Wave composition:
//   types     — array of enemy type names (in spawnEnemy's vocabulary)
//   from      — array of spawn-point indices into spawnPoints (round-robin)
//   eliteIdx  — optional indices in `types` that are elite-affixed
//
// To tune: edit the wave arrays. Adding a 4th wave is one row. Hooking
// into the floor-difficulty mul (FLOOR_ENEMY_MULS[zoneLevel]) is automatic
// once we wire the runner to it (Phase 2 work).
// ============================================================================

// Zone-name → 1..5 sequence index. Used by FLOOR_ENEMY_MULS for difficulty.
export const ZONE_ORDER = ['ruins', 'cemetery', 'crypt', 'mountain', 'volcano'];

// Phase 5 — per-zone HP + damage multipliers applied to every spawned
// enemy (waves + boss). Soft ramp ruins → volcano: by zone 5, enemies
// are ~2.2× HP and ~1.6× damage. Pairs with the perk system so a player
// stacking damage+HP perks across all 5 zones keeps pace with the curve.
//
// Hero typically reaches L8-12 over 5 zones (~12 perks). Each Sharp Edge
// stack = +12% dmg → 5 stacks = ×1.76. So the curve is balanced around
// "if you take damage perks, you outscale the difficulty bump."
export const ZONE_DIFFICULTY = Object.freeze({
  ruins:    { hpMul: 1.0,  damageMul: 1.0 },
  cemetery: { hpMul: 1.25, damageMul: 1.1 },
  crypt:    { hpMul: 1.55, damageMul: 1.25 },
  mountain: { hpMul: 1.85, damageMul: 1.4 },
  volcano:  { hpMul: 2.2,  damageMul: 1.6 },
});

export const ZONE_ENCOUNTERS = Object.freeze({
  // Floor 1 — Ancient Ruins. Open courtyard with raised platforms.
  // Spawns from the four corners of the walkable area.
  ruins: {
    cameraZoom: 0.75,                  // pull camera back so most of the
                                        // 1.5×1.6-viewport map is visible
    spawnPoints: [
      { x:  4, y:  4 },     // NW corner
      { x: 35, y:  4 },     // NE
      { x:  4, y: 20 },     // SW
      { x: 35, y: 20 },     // SE
      { x: 19, y:  2 },     // N midline
      { x: 19, y: 22 },     // S midline
    ],
    waves: [
      // Wave 1 — light skirmish. Slimes from one side.
      { types: ['slime', 'slime', 'slime', 'slime'],
        from: [0, 0, 1, 1] },
      // Wave 2 — mixed. Skels + spider from two corners.
      { types: ['skel', 'skel', 'crypt_spider'],
        from: [2, 3, 5] },
      // Wave 3 — pre-boss. Wizard + skel pair from three sides.
      { types: ['skel', 'skel', 'wizard'],
        from: [0, 4, 1] },
    ],
    bossLocation: { x: 19, y: 12 },    // central courtyard
    bossType: 'orc',                    // Grudnok
  },

  // Floor 2 — Cemetery. Stairs + upper graveyard + lower stone-path area.
  cemetery: {
    cameraZoom: 0.85,
    spawnPoints: [
      { x:  3, y:  3 },     // NW (upper graveyard)
      { x: 31, y:  3 },     // NE (upper graveyard)
      { x:  3, y: 17 },     // SW (lower path)
      { x: 31, y: 17 },     // SE (lower path)
      { x: 17, y:  3 },     // N midline (upper)
    ],
    waves: [
      { types: ['slime', 'slime', 'crypt_spider', 'crypt_spider'],
        from: [2, 3, 0, 1] },
      { types: ['skel', 'skel', 'skel'],
        from: [4, 0, 1] },
      { types: ['skel', 'wizard', 'crypt_spider', 'crypt_spider'],
        from: [2, 3, 4, 0] },
    ],
    bossLocation: { x: 17, y: 9 },     // upper graveyard center
    bossType: 'bone_captain',          // shared model with crypt boss; differentiated below
    bossLabel: 'THE GRAVE WARDEN',     // distinct in-fiction name from crypt's Iron Revenant
    bossOpts: {                          // FROST affix → slows hero on melee hit (cemetery dread)
      affix: 'frost',
      hpMul: 1.4,                        // slightly tankier than the crypt floor-3 boss
      damageMul: 0.9,                    // ... but hits softer (compensating for slow)
    },
  },

  // Floor 3 — Crypt. Pillared corridor + carpet runner + dais.
  crypt: {
    cameraZoom: 0.85,
    spawnPoints: [
      { x:  3, y:  3 },
      { x: 31, y:  3 },
      { x:  3, y: 22 },
      { x: 31, y: 22 },
      { x: 17, y:  3 },     // N midline
      { x: 17, y: 22 },     // S midline
    ],
    waves: [
      { types: ['skel', 'skel', 'skel', 'crypt_spider'],
        from: [0, 1, 4] },
      { types: ['skel', 'wizard', 'crypt_spider', 'crypt_spider'],
        from: [2, 3, 5] },
      { types: ['skel', 'skel', 'wizard', 'wizard'],
        from: [0, 1, 2, 3] },
    ],
    bossLocation: { x: 17, y: 14 },    // dais / carpet runner end
    bossType: 'bone_captain',          // Iron Revenant
  },

  // Floor 4 — Depths of the Mountain. Tall (3.6 viewport) cavern with
  // throne dais. Camera follows hero with normal zoom.
  mountain: {
    cameraZoom: 1.0,
    spawnPoints: [
      { x:  6, y:  6 },     // top NW
      { x: 38, y:  6 },     // top NE
      { x:  6, y: 27 },     // mid W
      { x: 38, y: 27 },     // mid E
      { x:  6, y: 48 },     // bottom NW
      { x: 38, y: 48 },     // bottom NE
    ],
    waves: [
      { types: ['skel', 'skel', 'orc', 'crypt_spider'],
        from: [0, 1, 4] },
      { types: ['orc', 'orc', 'wizard', 'crypt_spider'],
        from: [2, 3, 5] },
      { types: ['orc', 'orc', 'wizard', 'wizard', 'skel'],
        from: [0, 1, 2, 3, 4] },
    ],
    bossLocation: { x: 22, y: 27 },    // throne / mid-arena
    bossType: 'broodmother',
  },

  // Floor 5 — Volcano. Huge (3.4×4.0 viewport) lava-fissured map with
  // floating basalt platforms. Camera follows hero. Boss arrives at the
  // central platform (which is the most dramatic spawn area).
  volcano: {
    cameraZoom: 1.0,
    spawnPoints: [
      { x: 12, y: 12 },
      { x: 78, y: 12 },
      { x: 12, y: 48 },
      { x: 78, y: 48 },
      { x: 44, y:  8 },
      { x: 44, y: 52 },
    ],
    waves: [
      { types: ['orc', 'orc', 'wizard', 'skel', 'skel'],
        from: [0, 1, 4] },
      { types: ['orc', 'orc', 'orc', 'wizard', 'wizard'],
        from: [2, 3, 5] },
      { types: ['orc', 'orc', 'wizard', 'wizard', 'skel', 'skel'],
        from: [0, 1, 2, 3, 4] },
    ],
    bossLocation: { x: 44, y: 29 },    // central lava platform
    bossType: 'ember_tyrant',
  },
});

/** Lookup by zone name. Returns null if unknown. */
export function getZoneEncounters(zoneName) {
  return ZONE_ENCOUNTERS[zoneName] || null;
}

/** 1-based index for difficulty multipliers. ruins=1, volcano=5. */
export function getZoneLevel(zoneName) {
  const i = ZONE_ORDER.indexOf(zoneName);
  return i < 0 ? 1 : i + 1;
}

/** Next zone in the linear progression, or null if final. */
export function getNextZone(zoneName) {
  const i = ZONE_ORDER.indexOf(zoneName);
  if (i < 0 || i >= ZONE_ORDER.length - 1) return null;
  return ZONE_ORDER[i + 1];
}
