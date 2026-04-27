// Floor — a sequence of 7 rooms. Structure:
//   0: start         (no combat, entrance)
//   1: combat1       (easy, tier-appropriate)
//   2: event         (random: altar OR challenge)
//   3: combat2       (medium, scales up mid-floor)
//   4: sanctuary     (heal pedestal)
//   5: combat3       (hardest room on the floor before boss)
//   6: boss          (unique per floor: orc / bone_captain / broodmother)
//
// `level` (1..3) scales enemy composition, elite chance, damage, and HP.
import { ROOM_W, ROOM_H, ROOM_SIZES, getPillarCells, isCarvedTile } from './room.js';
import { isCursed } from './curses.js';
import { pickArchetype, applyArchetype } from './archetypes.js';

// HADES-STYLE ROOM SHAPES — pick a size template per room kind so the run
// reads as a sequence of distinct spaces, not a chain of identical
// rectangles. Size choice is deterministic by kind + slight randomization so
// repeat runs feel slightly different. Returns { w, h }.
//
// Why per-kind: each room type has a gameplay flavor that benefits from a
// different scale. Sanctuaries should feel intimate (small). Boss arenas
// should feel epic (large). Combat rooms vary so you never know if you're
// stepping into a wide hall or a tight square. This is what gives Hades
// its room-to-room sense of variety even when individual rooms are simple.
function pickRoomSize(kind, slot) {
  // Sanctuaries / rewards — intimate chapel feel
  if (kind === 'sanctuary' || kind === 'reward' || kind === 'altar') {
    return ROOM_SIZES.small;
  }
  // Boss arena — always large for impact
  if (kind === 'boss') return ROOM_SIZES.large;
  // Mini-boss + late-floor combat — wider so you have room to read telegraphs
  if (slot === 'miniboss' || slot === 'combat3') {
    return Math.random() < 0.5 ? ROOM_SIZES.wide : ROOM_SIZES.large;
  }
  // Trove / event challenge — tall room for verticality
  if (kind === 'trove' || kind === 'challenge') {
    return Math.random() < 0.5 ? ROOM_SIZES.medium : ROOM_SIZES.tall;
  }
  // Standard combat — mostly medium, occasionally wide for variety
  if (kind === 'combat') {
    const r = Math.random();
    if (r < 0.55) return ROOM_SIZES.medium;
    if (r < 0.80) return ROOM_SIZES.wide;
    return ROOM_SIZES.tall;
  }
  // Start / hamlet / fallback
  return ROOM_SIZES.medium;
}

// Pick a non-rectangular room shape for the given kind + size. Returns
// one of the keys from ROOM_SHAPES. Weighting goals:
//   - Plain rectangles still feel familiar (~50% of combat rooms stay rect)
//   - Heavier shapes (plus, T) only roll in rooms big enough to keep the
//     remaining floor area playable
//   - Sanctuary / reward rooms stay rect — the chapel feel benefits from
//     a clean simple footprint
//   - Boss arenas stay rect — the spike/fire patterns are hand-tuned for
//     a rectangular floor and would clip into corner carves
function pickRoomShape(kind, size) {
  if (kind === 'sanctuary' || kind === 'reward' || kind === 'altar' || kind === 'boss' || kind === 'start') {
    return 'rect';
  }
  // Trove rooms feel best as rectangles (loot strewn across an open floor)
  if (kind === 'trove') return 'rect';
  // For combat / event / challenge rooms, weight by available floor area
  const floorArea = size.w * size.h;
  const r = Math.random();
  // Below ~190 tiles (small/medium-tall), restrict to lighter shapes
  if (floorArea < 200) {
    if (r < 0.55) return 'rect';
    if (r < 0.75) return ['L_NE', 'L_NW', 'L_SE', 'L_SW'][(Math.random() * 4) | 0];
    return ['T_top', 'T_bottom', 'T_left', 'T_right'][(Math.random() * 4) | 0];
  }
  // Larger rooms get the full menu including plus
  if (r < 0.45) return 'rect';
  if (r < 0.70) return ['L_NE', 'L_NW', 'L_SE', 'L_SW'][(Math.random() * 4) | 0];
  if (r < 0.90) return ['T_top', 'T_bottom', 'T_left', 'T_right'][(Math.random() * 4) | 0];
  return 'plus';
}

export const MAX_FLOORS = 4;

// Elite chance per floor (0..1) — floor 1 bumped to 0.18 so even the first
// descent has real threat. Previously 0.08 meant most floor-1 rooms were
// trash-mob slaps with no stakes; player felt invincible until floor 2.
const ELITE_CHANCE_BY_LEVEL = [0, 0.18, 0.30, 0.45, 0.60];

// Per-floor damage/HP multipliers applied to every enemy on that floor.
// Floor 1 dmg bumped to 1.35× paired with the hero 8→6 maxHp cut so basic
// hits matter again. HP multiplier unchanged to keep time-to-kill tight.
export const FLOOR_ENEMY_MULS = {
  1: { dmg: 1.35, hp: 1.10 },      // was 1.15/1.10
  2: { dmg: 1.55, hp: 1.30 },      // was 1.40/1.30
  3: { dmg: 1.80, hp: 1.55 },      // was 1.70/1.55
  4: { dmg: 2.10, hp: 1.80 },      // was 2.00/1.80
};

// Within-floor combat difficulty ramp — combat3 is harder than combat1
const COMBAT_SLOT_MULS = {
  combat1: { dmg: 1.0, hp: 1.05, count: 1 },    // was 1.0/1.0/0 — first room now has one extra foe
  combat2: { dmg: 1.1, hp: 1.15, count: 1 },
  combat3: { dmg: 1.2, hp: 1.30, count: 2 },    // was 1.2/1.25/1 — final room is clearly tougher
};

function randInt(min, max) { return (min + Math.random() * (max - min + 1)) | 0; }
function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }

const COMP = {
  tier1: [
    ['slime', 'slime', 'slime'],
    ['slime', 'slime', 'bomber'],
    ['slime', 'skel', 'archer'],
    ['lancer', 'slime', 'slime'],              // lancer introduces itself on floor 1
  ],
  tier2: [
    ['skel', 'skel', 'archer'],
    ['orc', 'archer', 'slime'],
    ['bomber', 'bomber', 'skel'],
    ['archer', 'archer', 'slime', 'slime'],
    ['orc', 'slime', 'bomber'],
    ['lancer', 'archer', 'slime'],
    ['priest', 'skel', 'skel', 'archer'],
    ['wizard', 'skel', 'slime'],                // wizard introduced in tier2
    ['vanguard', 'archer', 'archer'],          // vanguard + 2 archers — flank while dodging arrows
    ['vanguard', 'skel', 'slime'],              // vanguard with light support
    // Content pass B3 — new enemies enter the pool at tier2:
    ['haunt', 'skel', 'archer'],                // airborne harasser + ground pressure
    ['haunt', 'haunt', 'slime'],                // two aerials force ranged response
  ],
  tier3: [
    ['orc', 'orc', 'archer'],
    ['archer', 'archer', 'bomber', 'bomber'],
    ['skel', 'skel', 'orc', 'bomber'],
    ['bomber', 'bomber', 'bomber'],
    ['orc', 'archer', 'archer', 'slime'],
    ['priest', 'orc', 'archer', 'lancer'],
    ['priest', 'priest', 'skel', 'skel', 'archer'],
    ['lancer', 'lancer', 'archer', 'bomber'],
    ['wizard', 'wizard', 'priest', 'skel'],     // double wizard — orbs everywhere
    ['wizard', 'lancer', 'orc', 'archer'],
    ['vanguard', 'vanguard', 'archer', 'archer'],  // double shield wall
    ['vanguard', 'wizard', 'skel', 'archer'],       // vanguard protects caster
    ['vanguard', 'priest', 'lancer', 'bomber'],
    ['reflector', 'archer', 'skel', 'bomber'],      // flank the mirror-mage
    ['reflector', 'reflector', 'orc'],               // twin mirrors
    ['reflector', 'vanguard', 'archer', 'archer'],  // tank + caster — hardest comp
    // Content pass B3 — the harder new enemies enter here:
    ['warden', 'archer', 'skel'],                    // warden anchors a slow push
    ['warden', 'priest', 'archer'],                  // healer keeps the warden up
    ['dreadmage', 'vanguard', 'archer'],             // caster behind tank
    ['dreadmage', 'haunt', 'skel'],                  // two ranged threats + air
    ['dreadmage', 'dreadmage', 'priest'],            // triple-caster nightmare
    ['warden', 'haunt', 'haunt'],                    // ground + air combo
  ],
  boss: [
    ['orc', 'archer', 'archer'],
    ['orc', 'bomber', 'skel'],
    ['orc', 'skel', 'skel', 'archer'],
    ['orc', 'priest', 'archer', 'archer'],     // priest-supported boss adds
  ],
};

// Which tier a combat slot rolls from, based on floor level + slot
function tierForSlot(level, slot) {
  if (level === 1) return slot === 'combat3' ? 'tier2' : 'tier1';
  if (level === 2) return slot === 'combat1' ? 'tier2' : 'tier3';
  return 'tier3';                        // floor 3: always tier3
}

function spawnCells(count, pillarTemplate = -1, w = ROOM_W, h = ROOM_H, shape = 'rect') {
  const cells = [];
  const mid = Math.floor(w / 2);
  // Pillar templates are authored at MEDIUM (20×14) — scale to actual room dims.
  const sx = w / ROOM_W, sy = h / ROOM_H;
  const pillars = pillarTemplate >= 0
    ? getPillarCells(pillarTemplate).map(([px, py]) => [Math.round(px * sx), Math.round(py * sy)])
    : [];
  const isPillar = (x, y) => pillars.some(([px, py]) => px === x && py === y);
  for (let i = 0; i < count * 12 && cells.length < count; i++) {
    const x = randInt(2, w - 3);
    const y = randInt(3, h - 4);
    if (Math.abs(x - mid) < 2 && Math.abs(y - Math.floor(h / 2)) < 2) continue;
    if (cells.some(c => Math.abs(c.x - x) + Math.abs(c.y - y) < 3)) continue;
    if (isPillar(x, y)) continue;
    // Also avoid directly-adjacent pillar cells so enemies aren't wedged
    if (pillars.some(([px, py]) => Math.abs(px - x) <= 1 && Math.abs(py - y) <= 1)) continue;
    // Skip cells inside shape carves (those become walls in build pass)
    if (shape !== 'rect' && isCarvedTile(x, y, w, h, shape)) continue;
    cells.push({ x, y });
  }
  return cells;
}

// Exported so floorGraph.js can reuse the exact same combat composition
// logic when building branching DAGs. Same pacing, different run shape.
export function makeCombatRoom(level, slot, eliteChance) {
  const tier = tierForSlot(level, slot);
  const comp = pick(COMP[tier]).slice();
  const slotMul = COMBAT_SLOT_MULS[slot] || COMBAT_SLOT_MULS.combat1;
  // Add extra enemies based on slot difficulty
  if (slotMul.count > 0) {
    const extraTypes = tier === 'tier1' ? ['slime', 'skel'] : tier === 'tier2' ? ['skel', 'orc'] : ['orc', 'archer'];
    for (let i = 0; i < slotMul.count; i++) comp.push(pick(extraTypes));
  }
  // CURSE: The Swarm — +2 extra enemies
  if (isCursed('the_swarm')) {
    const extraTypes = tier === 'tier1' ? ['slime', 'slime'] : tier === 'tier2' ? ['skel', 'archer'] : ['archer', 'lancer'];
    for (let i = 0; i < 2; i++) comp.push(pick(extraTypes));
  }
  // CURSE: Ether's Curse — +25% elite chance
  const effEliteChance = isCursed('ethers_curse') ? eliteChance + 0.25 : eliteChance;

  // ── ROOM ARCHETYPE — bundle (size, shape, pillarTemplate, spikePattern,
  // tactical spawn positions) into one named recipe. Falls back to the
  // independent-roll path if no archetype is eligible (shouldn't happen
  // for combat/challenge, but defensive).
  const archetype = pickArchetype('combat', slot, level);
  let size, shape, pillarTemplate, archetypeSpawns, spikePatternFromArchetype, archetypeFirePools;
  if (archetype) {
    const applied = applyArchetype(archetype, comp);
    size = applied.size;
    shape = applied.shape;
    pillarTemplate = applied.pillarTemplate;
    archetypeSpawns = applied.spawns;
    spikePatternFromArchetype = applied.spikePattern;
    archetypeFirePools = applied.firePools;
  } else {
    size = pickRoomSize('combat', slot);
    shape = pickRoomShape('combat', size);
    pillarTemplate = randInt(0, 14);
    const cells = spawnCells(comp.length, pillarTemplate, size.w, size.h, shape);
    archetypeSpawns = comp.slice(0, cells.length).map((type, i) => ({
      type, x: cells[i].x, y: cells[i].y,
    }));
    spikePatternFromArchetype = undefined;     // build pass falls back to random
    archetypeFirePools = null;
  }

  const spawns = archetypeSpawns.map((s) => ({
    type: s.type, x: s.x, y: s.y,
    elite: s.type !== 'bomber' && Math.random() < effEliteChance,
    hpMul: slotMul.hp,
    damageMul: slotMul.dmg,
  }));
  // SANCTUM archetype: promote the center enemy to elite for the duel feel
  if (archetype && archetype.name === 'sanctum' && spawns[0]) {
    spawns[0].elite = true;
    spawns[0].hpMul = (spawns[0].hpMul || 1) * 1.5;
  }
  // ARENA archetype: promote the heavy melee at center to mini-boss tier
  if (archetype && archetype.name === 'arena' && spawns[0]) {
    spawns[0].elite = true;
    spawns[0].hpMul = (spawns[0].hpMul || 1) * 1.6;
  }
  // Wave pattern — combat3 slots have a 35% chance to spawn a second wave
  // after the first is cleared. Adds a rhythmic combat beat. Doesn't apply to
  // floor 1 combat1 (too brutal for beginners). Wave reuses the spawn rule
  // for tactical consistency.
  let wave2 = null;
  if (slot === 'combat3' && Math.random() < 0.35) {
    const waveComp = [];
    const waveTypes = tier === 'tier1' ? ['slime', 'skel', 'bomber']
                    : tier === 'tier2' ? ['skel', 'orc', 'archer', 'bomber']
                    : ['orc', 'archer', 'bomber', 'lancer'];
    const n = 3 + randInt(0, 2);
    for (let i = 0; i < n; i++) waveComp.push(pick(waveTypes));
    let waveSpawns;
    if (archetype) {
      const wave = applyArchetype(archetype, waveComp);
      waveSpawns = wave.spawns;
    } else {
      const waveCells = spawnCells(waveComp.length, pillarTemplate, size.w, size.h, shape);
      waveSpawns = waveComp.slice(0, waveCells.length).map((type, i) => ({
        type, x: waveCells[i].x, y: waveCells[i].y,
      }));
    }
    wave2 = waveSpawns.map((s) => ({
      type: s.type, x: s.x, y: s.y,
      elite: s.type !== 'bomber' && Math.random() < effEliteChance,
      hpMul: slotMul.hp,
      damageMul: slotMul.dmg,
    }));
  }
  // Destructible props — 2-4 urns tucked in combat room corners for ambient variety
  const propUrns = [];
  const propCount = 2 + randInt(0, 3);
  for (let i = 0; i < propCount * 6 && propUrns.length < propCount; i++) {
    const x = randInt(2, size.w - 3);
    const y = randInt(3, size.h - 4);
    // Avoid center + enemy spawn positions
    if (Math.abs(x - Math.floor(size.w/2)) < 3 && Math.abs(y - Math.floor(size.h/2)) < 2) continue;
    if (spawns.some(s => Math.abs(s.x - x) + Math.abs(s.y - y) < 2)) continue;
    if (propUrns.some(u => Math.abs(u.x - x) + Math.abs(u.y - y) < 2)) continue;
    // Also skip props in carved corners (they would render inside walls)
    if (shape !== 'rect' && isCarvedTile(x, y, size.w, size.h, shape)) continue;
    propUrns.push({ x, y, broken: false, variant: randInt(0, 2), isProp: true });
  }
  return {
    kind: 'combat',
    slotLabel: slot,
    archetype: archetype ? archetype.name : null,    // for debug + future hook
    w: size.w, h: size.h,
    shape,
    pillarTemplate,
    // If the archetype specifies a spike pattern (or null = no spikes),
    // honor it. undefined falls back to the build-pass random.
    spikePattern: spikePatternFromArchetype,
    firePools: archetypeFirePools,                    // 'arms' or null
    spawns,
    wave2,                                              // null if not a wave room
    urns: propUrns,                                    // reuses trove-urn rendering/hit logic
    doors: { north: true, south: true },
  };
}

export function makeAltarRoom() {
  // Two relic pedestals at HP cost, empty center otherwise
  const size = pickRoomSize('altar');
  return {
    kind: 'altar',
    w: size.w, h: size.h,
    pillarTemplate: 3,                       // open
    spawns: [],
    doors: { north: true, south: true },
    cleared: true,                            // altar never blocks progression
  };
}

export function makeChallengeRoom(level, eliteChance) {
  const tier = level === 1 ? 'tier2' : 'tier3';
  const comp = pick(COMP[tier]).slice();
  const extraTypes = ['skel', 'archer'];
  comp.push(pick(extraTypes), pick(extraTypes));
  // CURSE: The Swarm — +2 more
  if (isCursed('the_swarm')) {
    comp.push(pick(extraTypes), pick(extraTypes));
  }
  const size = pickRoomSize('challenge');
  const shape = pickRoomShape('challenge', size);
  const pillarTemplate = randInt(0, 14);
  const cells = spawnCells(comp.length, pillarTemplate, size.w, size.h, shape);
  const spawns = comp.slice(0, cells.length).map((type, i) => ({
    type, x: cells[i].x, y: cells[i].y,
    elite: type !== 'bomber',
    hpMul: 1.15,
    damageMul: 1.15,
  }));
  return {
    kind: 'challenge',
    w: size.w, h: size.h,
    shape,
    pillarTemplate,
    spawns,
    doors: { north: true, south: true },
  };
}

// Treasure Chest Room — gambling-tension event variant. Multiple
// identical-looking chests; some are TREASURE (gold or relic) and some
// are MIMICS (damage + enemy spawn on open). Player can't tell which
// until they commit by opening one.
//
// Per-floor scaling (deeper floors = more chests, more mimics, better
// rewards in the treasures):
//
//   floor 1 — 3 chests, 2T/1M, gold only           (intro)
//   floor 2 — 3 chests, 2T/1M, gold only           (settle in)
//   floor 3 — 4 chests, 2T/2M, treasures 30% relic (real gamble)
//   floor 4 — 5 chests, 2T/3M, treasures 50% relic (endgame)
//
// Always 2+ treasures so a 'whole room is mimic' scenario is impossible
// — the room is meaningful gamble, not pure punishment. Chest variant
// is randomly distributed across positions (shuffle the array before
// assignment).
export function makeTreasureChestRoom(level) {
  const size = pickRoomSize('trove');     // similar feel: small grid prop room
  // Floor-scaled count + treasure ratio (always ≥2 treasures)
  let total, treasures;
  if (level <= 2) { total = 3; treasures = 2; }
  else if (level === 3) { total = 4; treasures = 2; }
  else { total = 5; treasures = 2; }
  // Generate non-overlapping chest positions, avoiding doorways
  const chests = [];
  const mid = Math.floor(size.w / 2);
  for (let i = 0; i < total * 16 && chests.length < total; i++) {
    const x = randInt(2, size.w - 3);
    const y = randInt(3, size.h - 4);
    // Keep north + south doorways clear for hero pathing
    if (Math.abs(x - mid) < 2 && y < 3) continue;
    if (Math.abs(x - mid) < 2 && y > size.h - 5) continue;
    // Spacing: at least 4 manhattan from any other chest (gives breathing
    // room so chests don't visually overlap and player can target each
    // one individually)
    if (chests.some(c => Math.abs(c.x - x) + Math.abs(c.y - y) < 4)) continue;
    chests.push({ x, y });
  }
  // Assign variants. Shuffle positions, then assign first N as treasure
  // and rest as mimic — randomizes WHICH cells are which without
  // changing the count guarantee.
  for (let i = chests.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [chests[i], chests[j]] = [chests[j], chests[i]];
  }
  for (let i = 0; i < chests.length; i++) {
    chests[i].variant = i < treasures ? 'treasure' : 'mimic';
    chests[i].state = 'closed';      // 'closed' | 'opening' | 'opened'
    chests[i].frame = 0;             // current animation frame index
    chests[i].frameTime = 0;         // accumulator for frame advance
  }
  // Decorative pillars flanking the room (visual only, no collision).
  // Two pillars near the top corners give the room a 'sacred chamber'
  // feel — frames the chest area as ceremonial. y=3 keeps them inside
  // the playable area for both ROOM_SIZES.medium (20×14) and .tall
  // (18×18), the two sizes pickRoomSize('trove') can return — rows
  // 0-2 are wall+threshold (compare with the urn placement which uses
  // y=randInt(3, size.h-4), avoiding the same band).
  const decorPillars = [
    { x: 2, y: 3 },
    { x: size.w - 3, y: 3 },
  ];
  return {
    kind: 'chestroom',
    w: size.w, h: size.h,
    pillarTemplate: 3,
    spawns: [],         // mimic enemies spawn on chest-open, not room-load
    urns: [],
    chests,
    decorPillars,
    level,              // stash floor level for reward scaling
    doors: { north: true, south: true },
    cleared: true,      // no enemies at start; flips to false if mimic spawns
  };
}

export function makeTroveRoom() {
  // Generate 10-14 urn positions avoiding center + doors
  const size = pickRoomSize('trove');
  const count = 10 + randInt(0, 4);
  const urns = [];
  const mid = Math.floor(size.w / 2);
  for (let i = 0; i < count * 8 && urns.length < count; i++) {
    const x = randInt(2, size.w - 3);
    const y = randInt(3, size.h - 4);
    if (Math.abs(x - mid) < 2 && y < 3) continue;   // keep doorway clear
    if (urns.some(u => Math.abs(u.x - x) + Math.abs(u.y - y) < 2)) continue;
    urns.push({ x, y, broken: false, variant: randInt(0, 2) });
  }
  return {
    kind: 'trove',
    w: size.w, h: size.h,
    pillarTemplate: 3,
    spawns: [],
    urns,
    doors: { north: true, south: true },
    cleared: true,                    // no enemies, never blocks progression
  };
}

// CONTENT PASS B2 — MINI-BOSS event variant. A solo elite encounter with
// no adds; rewards a guaranteed relic pedestal on clear (wiring in main.js
// via room.slotLabel check). Keeps event rooms from feeling like the same
// three categories after three runs.
function makeMiniBossRoom(level) {
  const size = pickRoomSize('combat', 'miniboss');
  const shape = pickRoomShape('combat', size);
  const pillarTemplate = randInt(0, 14);
  // Mini-boss type scales with floor — pick a unique-mechanic enemy from
  // the adjacent tier so it's genuinely threatening but not boss-scale.
  // Warden is our dedicated mini-boss asset; put it at floor 2 where its
  // heavy-telegraph pacing matches player skill. Other floors rotate
  // unique-mechanic enemies.
  const miniType = level === 1 ? 'vanguard'
                 : level === 2 ? 'warden'
                 : level === 3 ? 'reflector'
                 : level === 4 ? 'hermit'       // floor 4's signature mini-boss
                 : 'dreadmage';
  return {
    kind: 'combat',
    slotLabel: 'miniboss',
    w: size.w, h: size.h,
    shape,
    pillarTemplate,
    spawns: [{
      type: miniType,
      x: Math.floor(size.w / 2),
      y: Math.floor(size.h / 2),
      elite: true,
      hpMul: 1.8,
      damageMul: 1.2,
    }],
    urns: [],
    doors: { north: true, south: true },
  };
}

export function makeEventRoom(level, eliteChance) {
  const kind = Math.random();
  // 15% mini-boss, 22% altar, 13% trove, 30% chestroom, 20% challenge.
  // Bumped chestroom 20% -> 30% per producer review: with ~1 event slot
  // per floor (×4 floors = ~4 events per run), 20% meant a player might
  // not see a chest room in 4-5 runs. 30% gives them a real shot at
  // hitting one each run + means the gambling mechanic gets practiced.
  if (kind < 0.15) return makeMiniBossRoom(level);
  if (kind < 0.37) return makeAltarRoom();
  if (kind < 0.50) return makeTroveRoom();
  if (kind < 0.80) return makeTreasureChestRoom(level);
  return makeChallengeRoom(level, eliteChance);
}

// ============================================================================
// BOSS LOOT POOLS — thematic relic pools that each boss drops from on clear.
// Applied as a single guaranteed pedestal that spawns after the cascade
// finale; the shop/epilogue waits for the player to pick it up (or 15s
// timeout) before opening.
//
// Each boss has 4–5 relics chosen to match its theme. Players learn to
// "farm" a specific floor for specific builds — e.g. Grudnok for the
// brawler kit, Ember Tyrant for fire/endgame. Diablo's Baal/Mephisto
// pattern in a tight 4-floor package.
// ============================================================================
export const BOSS_LOOT_POOL = {
  // Grudnok — orc warchief. Brute force, knockback, heavy weapons.
  orc: ['heavy_blow', 'serrated_edge', 'warlord', 'ironhide', 'executioner'],
  // Iron Revenant — undead reaper. Life drain, death-based mechanics.
  bone_captain: ['bloodstone', 'reaver', 'bloodrite', 'phoenix_tear', 'vampiric_aura'],
  // Broodmother — chaos and summoning. Explosions, chains, bursts.
  broodmother: ['explosive_kill', 'soul_burst', 'chain_lightning', 'pyromancer', 'thunder_step'],
  // Ember Tyrant — endgame fire lord. Legendary-heavy pool with small
  // mythic chance for the ultimate power-fantasy final-boss drop.
  ember_tyrant: ['avatar_of_flame', 'phoenix_cloak', 'wanderers_cloak', 'ethereal_binding', 'aegis_pulse'],
};

// On Ember Tyrant (final boss) clear, 20% chance to roll from the mythic
// pool instead of the themed legendary pool — the true "Windforce moment".
export const EMBER_TYRANT_MYTHIC_POOL = ['cataclysm', 'eye_of_ether'];
export const EMBER_TYRANT_MYTHIC_CHANCE = 0.20;

export function makeBossSpawns(level, pillarTemplate = -1, bossW = ROOM_W, bossH = ROOM_H) {
  // Floor 4's THRONE OF RUIN gets its own boss — The Ember Tyrant — instead
  // of falling back to orc. Arena hazards (6 fire pools + 2 spikes) are
  // already wired in room.js:471 for this bossType.
  const bossType = { 1: 'orc', 2: 'bone_captain', 3: 'broodmother', 4: 'ember_tyrant' }[level] || 'orc';
  const adds = { 1: ['archer', 'archer'], 2: ['archer', 'slime'], 3: ['skel', 'skel', 'archer'], 4: ['bomber', 'dreadmage'] }[level] || [];
  const cells = spawnCells(adds.length, pillarTemplate, bossW, bossH);
  const spawns = [
    { type: bossType, x: Math.floor(bossW/2), y: 3, elite: true, boss: true },
  ];
  adds.forEach((t, i) => {
    spawns.push({
      type: t,
      x: cells[i]?.x ?? (4 + i * 4),
      y: cells[i]?.y ?? 7,
      elite: level >= 3 && t !== 'bomber',
    });
  });
  return spawns;
}

export function generateFloor(level = 1) {
  const lvl = Math.max(1, Math.min(MAX_FLOORS, level | 0));
  let eliteChance = ELITE_CHANCE_BY_LEVEL[lvl] || 0;
  // ASCENSION II — "The Early Dark": bump floor-1 elite chance to the
  // floor-2 baseline so first-floor combat gets teeth from the start.
  if (lvl === 1 && typeof window !== 'undefined' && window.__ascensionModifiers) {
    const am = window.__ascensionModifiers();
    if (am && am.eliteFloor1) eliteChance = Math.max(eliteChance, ELITE_CHANCE_BY_LEVEL[2]);
  }

  // Boss pillar template rolled first so spawn positions avoid it
  const bossPillarTemplate = randInt(0, 14);
  const startSize = pickRoomSize('start');
  const rewardSize = pickRoomSize('reward');
  const bossSize = pickRoomSize('boss');
  const rooms = [
    { kind: 'start',  w: startSize.w,  h: startSize.h,  pillarTemplate: 3, spawns: [], cleared: true, doors: { north: true, south: false } },
    makeCombatRoom(lvl, 'combat1', eliteChance),
    makeEventRoom(lvl, eliteChance),
    makeCombatRoom(lvl, 'combat2', eliteChance),
    { kind: 'reward', w: rewardSize.w, h: rewardSize.h, pillarTemplate: 3, spawns: [], cleared: true, doors: { north: true, south: true } },
    makeCombatRoom(lvl, 'combat3', eliteChance),
    { kind: 'boss',   w: bossSize.w,   h: bossSize.h,   pillarTemplate: bossPillarTemplate, spawns: makeBossSpawns(lvl, bossPillarTemplate, bossSize.w, bossSize.h), doors: { north: false, south: true } },
  ];
  return rooms;
}
