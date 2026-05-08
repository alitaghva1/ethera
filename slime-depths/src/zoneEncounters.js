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
    // Phase 3 stabilization (audit B3+B5) — every spawn point verified
    // walkable + reachable from boss via BFS. Previously 4/6 of the
    // configured spawns landed inside walls (sub-tile-rect cells).
    spawnPoints: [
      { x:  4, y:  4 },     // NW corner          (was: same)
      { x: 36, y:  5 },     // NE                 (was: 35,4 — BLOCKED)
      { x:  4, y: 20 },     // SW                 (was: same)
      { x: 16, y: 23 },     // South-west         (was: 35,20 — SE corner had no main-component cells)
      { x: 16, y:  0 },     // N midline          (was: 19,2 — BLOCKED)
      { x: 18, y: 23 },     // S midline          (was: 19,22 — BLOCKED)
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
    // Phase 3 stabilization (audit B2) — hero entry point separate from
    // boss location so the boss doesn't materialize on top of the player.
    // Walkable + reachable from boss via BFS (verified). West entry.
    heroSpawn: { x: 4, y: 12 },
  },

  // Floor 2 — Cemetery. Stairs + upper graveyard + lower stone-path area.
  cemetery: {
    cameraZoom: 0.85,
    // Phase 3 stabilization (audit B3+B5) — corrected spawn coords. Old
    // [2] (3,17) was on the 26-cell unreachable SW island; replaced
    // with a south-mid cell in the main 388-cell component. Old
    // [0]/[1] NW/NE corners were both blocked.
    spawnPoints: [
      { x:  1, y:  3 },     // NW upper           (was: 3,3 — BLOCKED)
      { x: 27, y:  0 },     // NE upper           (was: 31,3 — BLOCKED)
      { x: 22, y: 19 },     // South-mid          (was: 3,17 — UNREACHABLE ISLAND)
      { x: 31, y: 17 },     // SE                 (was: same — already valid)
      { x: 17, y:  3 },     // N midline          (was: same — already valid)
    ],
    waves: [
      { types: ['slime', 'slime', 'crypt_spider', 'crypt_spider'],
        from: [2, 3, 0, 1] },
      { types: ['skel', 'skel', 'skel'],
        from: [4, 0, 1] },
      // Phase 4 (audit Z3) — wave 3 wizard tagged elite (frost affix
      // visible halo + slowed-hit). Cemetery is the first zone where
      // wizards appear; making this one elite gives the player a
      // mini-preview of frost combat before the GRAVE WARDEN boss.
      { types: ['skel', 'wizard', 'crypt_spider', 'crypt_spider'],
        from: [2, 3, 4, 0],
        eliteIdx: [1] },
    ],
    bossLocation: { x: 17, y: 9 },     // upper graveyard center
    bossType: 'bone_captain',          // shared model with crypt boss; differentiated below
    bossLabel: 'THE GRAVE WARDEN',     // distinct in-fiction name from crypt's Iron Revenant
    bossOpts: {                          // FROST affix → slows hero on melee hit (cemetery dread)
      affix: 'frost',
      hpMul: 1.4,                        // slightly tankier than the crypt floor-3 boss
      damageMul: 0.9,                    // ... but hits softer (compensating for slow)
    },
    // Phase 3 (B2) — east entry, walkable + reachable from boss via BFS.
    heroSpawn: { x: 31, y: 9 },
  },

  // Floor 3 — Crypt. Pillared corridor + carpet runner + dais.
  crypt: {
    cameraZoom: 0.85,
    // Phase 3 (B3) — corrected coords. Old [0] and [4] were blocked.
    spawnPoints: [
      { x:  5, y:  3 },     // NW                 (was: 3,3 — BLOCKED)
      { x: 31, y:  3 },     // NE
      { x:  3, y: 22 },     // SW
      { x: 31, y: 22 },     // SE
      { x: 18, y:  2 },     // N midline          (was: 17,3 — BLOCKED)
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
    // Phase 3 (B2) — south end of the corridor. Player advances UP toward dais.
    heroSpawn: { x: 17, y: 22 },
  },

  // Floor 4 — Depths of the Mountain. Tall (3.6 viewport) cavern with
  // throne dais. Camera follows hero with normal zoom.
  mountain: {
    // Phase 4 (audit W5) — pulled from 1.0 to 0.85. Mountain is 45×54
    // (3.6× viewport tall). At 0.85, visible ≈ 31×17 tiles → hero at
    // bottom (22,48) sees y=39..56 immediately, then sees the boss-row
    // (y=27) spawns as they push up to ~y=35. Tighter than volcano
    // because the map is smaller; player still pushes up through 3
    // arena rows.
    cameraZoom: 0.85,
    // Phase 3 (B3) — corrected coords. Old [2] and [3] were blocked
    // (the throne-dais row at y=27 has heavy collision).
    spawnPoints: [
      { x:  6, y:  6 },     // top NW
      { x: 38, y:  6 },     // top NE
      { x:  5, y: 26 },     // mid W              (was: 6,27 — BLOCKED)
      { x: 37, y: 26 },     // mid E              (was: 38,27 — BLOCKED)
      { x:  6, y: 48 },     // bottom NW
      { x: 38, y: 48 },     // bottom NE
    ],
    waves: [
      { types: ['skel', 'skel', 'orc', 'crypt_spider'],
        from: [0, 1, 4] },
      { types: ['orc', 'orc', 'wizard', 'crypt_spider'],
        from: [2, 3, 5] },
      // Phase 4 (audit Z3) — wave 3 has TWO elite wizards. Mountain is
      // the penultimate zone; the encounter density should feel
      // dangerous before the broodmother emerges. Elite wizards =
      // tougher cast variants with affix glow + bigger orbs.
      { types: ['orc', 'orc', 'wizard', 'wizard', 'skel'],
        from: [0, 1, 2, 3, 4],
        eliteIdx: [2, 3] },
    ],
    bossLocation: { x: 22, y: 27 },    // throne / mid-arena
    bossType: 'broodmother',
    // Phase 3 (B2) — bottom of the tall map. Player descends through 21 rows.
    heroSpawn: { x: 22, y: 48 },
  },

  // Floor 5 — Volcano. Huge (3.4×4.0 viewport) lava-fissured map with
  // floating basalt platforms. Boss arrives at the central platform.
  volcano: {
    // Phase 4 (audit W5) — camera was 1.0 (showing ~7% of the 90×60 map),
    // making spawn at distance 23-61 invisible until enemies closed for
    // ~10s. Pulled to 0.65 — visible ~41×23 tiles ≈ half the map width.
    cameraZoom: 0.65,
    // Phase 4 (audit W5) — spawns moved INWARD to 14-25 cells from boss
    // (was 21-42 cells). Enemies now visible to the hero at spawn time
    // OR within ~3s of the boss-arena fight starting. All BFS-verified
    // walkable + reachable from the boss tile.
    spawnPoints: [
      { x: 30, y: 18 },     // NW inner          (was: 12,12 — 33 BFS steps)
      { x: 58, y: 18 },     // NE inner          (was: 78,12)
      { x: 30, y: 40 },     // SW inner          (was: 12,48)
      { x: 58, y: 40 },     // SE inner          (was: 78,48)
      { x: 44, y: 15 },     // N close           (was: 44,8)
      { x: 44, y: 43 },     // S close           (was: 44,52)
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
    // Phase 3 (B2) — top of the central column. Player descends ~17 cells.
    heroSpawn: { x: 44, y: 12 },
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
