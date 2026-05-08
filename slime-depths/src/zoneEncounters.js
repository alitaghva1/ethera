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
      // 2026-05-08 — re-validated post user's tighter ruins collision pass
      // (8 polygons + 1 walkable rect, 269 blocked cells). spawn0 NW
      // (4,4) was now BLOCKED by the refined polygon at the NW
      // courtyard corner. Picked (3,6) instead — first walkable row in
      // the NW area, in main 620-cell component, BFS-reachable to boss.
      // All other spawns survived the new collision pass.
      { x:  3, y:  6 },     // NW                 (was: 4,4 — BLOCKED post-tighter-collision)
      { x: 36, y:  5 },     // NE                 (was: 35,4)
      { x:  4, y: 20 },     // SW                 (still valid)
      { x: 16, y: 23 },     // S-mid-west         (still valid)
      { x: 16, y:  0 },     // N midline          (still valid)
      { x: 18, y: 23 },     // S midline          (still valid)
    ],
    waves: [
      // 2026-05-08 — RUINS PACK COHERENCE PASS. Replaced the generic
      // slime/skel/crypt_spider/wizard grab-bag with mobs that visually
      // match the ERW Ancient Ruins biome:
      //   orc_warrior     ERW Grass Land 2.0 — common ruins-zone melee
      //   orc_mage_enemy  ERW Grass Land 2.0 — caster variant
      //   moose           ERW Ancient Ruins  — heavy melee, antler-charge
      // Boss is stone_golem (ERW Ancient Ruins). Hero is orc_mage (ERW
      // Grass Land 2.0). Whole zone now from one art family.
      //
      // Wave 1 — 4 ruins orcs entering from west + north (light-skirmish
      // pacing preserved; just pack-coherent silhouettes now).
      { types: ['orc_warrior', 'orc_warrior', 'orc_warrior', 'orc_warrior'],
        from: [0, 0, 1, 1] },
      // Wave 2 — heavier. Two moose press from south, plus an orc
      // warrior from the south-mid spawn for sustained close-range
      // pressure during the moose windups.
      { types: ['moose', 'moose', 'orc_warrior'],
        from: [2, 3, 5] },
      // Wave 3 — pre-boss caster wave. One moose anchors close, two
      // orc shamans fire from range — forces positioning before the
      // golem fight.
      { types: ['moose', 'orc_mage_enemy', 'orc_mage_enemy'],
        from: [0, 4, 1] },
    ],
    bossLocation: { x: 19, y: 12 },    // central courtyard
    // 2026-05-08 — replaced 'orc' (a beefed-up regular orc) with the new
    // stone_golem boss def. The Stone Colossus fits the ruins theme
    // natively (moss-cracked statues, ancient guardian) where Grudnok
    // never quite did. Visual identity is now zone-specific. Grudnok
    // still exists as elite_orc — used for F1 mini-boss rotations on
    // later floors when the player has progressed past Zone 1.
    bossType: 'stone_golem',
    // Phase 3 stabilization (audit B2) — hero entry point separate from
    // boss location so the boss doesn't materialize on top of the player.
    // Walkable + reachable from boss via BFS (verified). West entry.
    heroSpawn: { x: 4, y: 12 },
  },

  // Floor 2 — Cemetery. Stairs + upper graveyard + lower stone-path area.
  cemetery: {
    cameraZoom: 0.85,
    // Phase 8 stabilization — re-validated post gidToTile fix. The fix
    // exposed many more blocked cells (was 271 → now 407 blocked, main
    // component shrank 388 → 240 cells). Several spawn coords that
    // worked under the old loose-collision were now blocked or on
    // newly-disconnected islands. All re-picked from main-component
    // boundary cells via BFS verification.
    spawnPoints: [
      { x:  1, y:  4 },     // NW                 (was: 1,3 — still valid; nudged 1 cell)
      { x: 27, y: 16 },     // far-east lower     (was: 27,0 — BLOCKED post-fix)
      { x: 22, y: 19 },     // South-mid          (was: same — still valid)
      { x: 27, y: 14 },     // far-east mid       (was: 31,17 — BLOCKED post-fix)
      { x: 17, y:  3 },     // N midline          (was: same — still valid)
    ],
    waves: [
      // 2026-05-08 — wave 1 introduces the cemetery_bat (cemetery's
      // signature flyer). Bat darts in fast/low-HP; pairs with slime as
      // floor enemy / aerial harasser duo so the cemetery has a clear
      // identity beyond "cemetery is just crypt with bats."
      { types: ['cemetery_bat', 'cemetery_bat', 'slime', 'crypt_spider'],
        from: [2, 3, 0, 1] },
      { types: ['skel', 'skel', 'skel'],
        from: [4, 0, 1] },
      // Phase 4 (audit Z3) — wave 3 wizard tagged elite (frost affix
      // visible halo + slowed-hit). Cemetery is the first zone where
      // wizards appear; making this one elite gives the player a
      // mini-preview of frost combat before the GRAVE WARDEN boss.
      // Plus 2 bats for sustained aerial pressure.
      { types: ['skel', 'wizard', 'cemetery_bat', 'cemetery_bat'],
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
    // Phase 8 — east-mid entry, re-picked post gidToTile fix. The old
    // (31,9) is now on a disconnected island. (27,13) is in main
    // component, ~14 BFS steps from boss.
    heroSpawn: { x: 27, y: 13 },
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
    // 2026-05-08 — replaced 'broodmother' (a generic werebear-shaped
    // boss whose flavor "she who laid the first ruin" never fit the
    // mountain biome) with mountain_boss, the depths-of-the-mountain
    // pack's signature wide-arc cleaver. Now the mountain zone has
    // proper biome-native boss art instead of a recycled F3 werebear.
    bossType: 'mountain_boss',
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
      // 2026-05-08 — wave 1 swaps in imp_demon (volcano's signature fast
      // melee). 3 imps + 1 orc + 1 skel keeps it fast-paced and clearly
      // volcano-flavored from the open.
      { types: ['imp_demon', 'imp_demon', 'imp_demon', 'orc', 'skel'],
        from: [0, 1, 4] },
      // Wave 2 — rocky_dude pair as the heavy-brute counterweight to
      // the imp swarms. Pairs naturally: imps press while rocky lines
      // up heavy cleaves, forcing the player to disengage + reposition.
      { types: ['rocky_dude', 'rocky_dude', 'imp_demon', 'wizard', 'wizard'],
        from: [2, 3, 5] },
      // Wave 3 — full volcano comp: brutes + imps + casters.
      { types: ['rocky_dude', 'imp_demon', 'imp_demon', 'wizard', 'wizard', 'skel'],
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
