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
import { ROOM_W, ROOM_H, getPillarCells } from './room.js';
import { isCursed } from './curses.js';

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

function spawnCells(count, pillarTemplate = -1) {
  const cells = [];
  const mid = Math.floor(ROOM_W / 2);
  // Avoid pillar positions — pillars are blocking geometry; enemies on top are stuck
  const pillars = pillarTemplate >= 0 ? getPillarCells(pillarTemplate) : [];
  const isPillar = (x, y) => pillars.some(([px, py]) => px === x && py === y);
  for (let i = 0; i < count * 12 && cells.length < count; i++) {
    const x = randInt(2, ROOM_W - 3);
    const y = randInt(3, ROOM_H - 4);
    if (Math.abs(x - mid) < 2 && Math.abs(y - Math.floor(ROOM_H / 2)) < 2) continue;
    if (cells.some(c => Math.abs(c.x - x) + Math.abs(c.y - y) < 3)) continue;
    if (isPillar(x, y)) continue;
    // Also avoid directly-adjacent pillar cells so enemies aren't wedged
    if (pillars.some(([px, py]) => Math.abs(px - x) <= 1 && Math.abs(py - y) <= 1)) continue;
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

  // Pick pillar template up-front so we can avoid spawning enemies ON pillars
  const pillarTemplate = randInt(0, 14);
  const cells = spawnCells(comp.length, pillarTemplate);
  const spawns = comp.slice(0, cells.length).map((type, i) => ({
    type, x: cells[i].x, y: cells[i].y,
    elite: type !== 'bomber' && Math.random() < effEliteChance,
    hpMul: slotMul.hp,
    damageMul: slotMul.dmg,
  }));
  // Wave pattern — combat3 slots have a 35% chance to spawn a second wave
  // after the first is cleared. Adds a rhythmic combat beat. Doesn't apply to
  // floor 1 combat1 (too brutal for beginners).
  let wave2 = null;
  if (slot === 'combat3' && Math.random() < 0.35) {
    const waveComp = [];
    const waveTypes = tier === 'tier1' ? ['slime', 'skel', 'bomber']
                    : tier === 'tier2' ? ['skel', 'orc', 'archer', 'bomber']
                    : ['orc', 'archer', 'bomber', 'lancer'];
    const n = 3 + randInt(0, 2);
    for (let i = 0; i < n; i++) waveComp.push(pick(waveTypes));
    const waveCells = spawnCells(waveComp.length, pillarTemplate);
    wave2 = waveComp.slice(0, waveCells.length).map((type, i) => ({
      type, x: waveCells[i].x, y: waveCells[i].y,
      elite: type !== 'bomber' && Math.random() < effEliteChance,
      hpMul: slotMul.hp,
      damageMul: slotMul.dmg,
    }));
  }
  // Destructible props — 2-4 urns tucked in combat room corners for ambient variety
  const propUrns = [];
  const propCount = 2 + randInt(0, 3);
  for (let i = 0; i < propCount * 6 && propUrns.length < propCount; i++) {
    const x = randInt(2, ROOM_W - 3);
    const y = randInt(3, ROOM_H - 4);
    // Avoid center + enemy spawn positions
    if (Math.abs(x - Math.floor(ROOM_W/2)) < 3 && Math.abs(y - Math.floor(ROOM_H/2)) < 2) continue;
    if (cells.some(c => Math.abs(c.x - x) + Math.abs(c.y - y) < 2)) continue;
    if (propUrns.some(u => Math.abs(u.x - x) + Math.abs(u.y - y) < 2)) continue;
    propUrns.push({ x, y, broken: false, variant: randInt(0, 2), isProp: true });
  }
  return {
    kind: 'combat',
    slotLabel: slot,
    pillarTemplate,                     // already rolled above for spawn validation
    spawns,
    wave2,                                // null if not a wave room
    urns: propUrns,                     // reuses trove-urn rendering/hit logic
    doors: { north: true, south: true },
  };
}

export function makeAltarRoom() {
  // Two relic pedestals at HP cost, empty center otherwise
  return {
    kind: 'altar',
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
  const pillarTemplate = randInt(0, 14);
  const cells = spawnCells(comp.length, pillarTemplate);
  const spawns = comp.slice(0, cells.length).map((type, i) => ({
    type, x: cells[i].x, y: cells[i].y,
    elite: type !== 'bomber',
    hpMul: 1.15,
    damageMul: 1.15,
  }));
  return {
    kind: 'challenge',
    pillarTemplate,
    spawns,
    doors: { north: true, south: true },
  };
}

export function makeTroveRoom() {
  // Generate 10-14 urn positions avoiding center + doors
  const count = 10 + randInt(0, 4);
  const urns = [];
  const mid = Math.floor(ROOM_W / 2);
  for (let i = 0; i < count * 8 && urns.length < count; i++) {
    const x = randInt(2, ROOM_W - 3);
    const y = randInt(3, ROOM_H - 4);
    if (Math.abs(x - mid) < 2 && y < 3) continue;   // keep doorway clear
    if (urns.some(u => Math.abs(u.x - x) + Math.abs(u.y - y) < 2)) continue;
    urns.push({ x, y, broken: false, variant: randInt(0, 2) });
  }
  return {
    kind: 'trove',
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
    pillarTemplate,
    spawns: [{
      type: miniType,
      x: Math.floor(ROOM_W / 2),
      y: Math.floor(ROOM_H / 2),
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
  // ~15% mini-boss, ~30% altar, ~25% trove, ~30% challenge. Rebalanced
  // from the original 35/25/40 to add variety without starving the
  // existing three from roll share.
  if (kind < 0.15) return makeMiniBossRoom(level);
  if (kind < 0.45) return makeAltarRoom();
  if (kind < 0.70) return makeTroveRoom();
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

export function makeBossSpawns(level, pillarTemplate = -1) {
  // Floor 4's THRONE OF RUIN gets its own boss — The Ember Tyrant — instead
  // of falling back to orc. Arena hazards (6 fire pools + 2 spikes) are
  // already wired in room.js:471 for this bossType.
  const bossType = { 1: 'orc', 2: 'bone_captain', 3: 'broodmother', 4: 'ember_tyrant' }[level] || 'orc';
  const adds = { 1: ['archer', 'archer'], 2: ['archer', 'slime'], 3: ['skel', 'skel', 'archer'], 4: ['bomber', 'dreadmage'] }[level] || [];
  const cells = spawnCells(adds.length, pillarTemplate);
  const spawns = [
    { type: bossType, x: Math.floor(ROOM_W/2), y: 3, elite: true, boss: true },
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
  const rooms = [
    { kind: 'start',  pillarTemplate: 3, spawns: [], cleared: true, doors: { north: true, south: false } },
    makeCombatRoom(lvl, 'combat1', eliteChance),
    makeEventRoom(lvl, eliteChance),
    makeCombatRoom(lvl, 'combat2', eliteChance),
    { kind: 'reward', pillarTemplate: 3, spawns: [], cleared: true, doors: { north: true, south: true } },
    makeCombatRoom(lvl, 'combat3', eliteChance),
    { kind: 'boss',   pillarTemplate: bossPillarTemplate, spawns: makeBossSpawns(lvl, bossPillarTemplate), doors: { north: false, south: true } },
  ];
  return rooms;
}
