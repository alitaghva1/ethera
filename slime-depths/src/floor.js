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

// Elite chance per floor (0..1) — floor 1 now has a small elite chance
// so even early runs contain moments of real threat.
const ELITE_CHANCE_BY_LEVEL = [0, 0.08, 0.25, 0.40, 0.55];

// Per-floor damage/HP multipliers applied to every enemy on that floor.
// Bumped across the board — player starts at 8 HP and needs meta upgrades.
export const FLOOR_ENEMY_MULS = {
  1: { dmg: 1.15, hp: 1.10 },      // was 1.0/1.0 — starts firmer
  2: { dmg: 1.40, hp: 1.30 },      // was 1.25/1.20
  3: { dmg: 1.70, hp: 1.55 },      // was 1.5/1.40
  4: { dmg: 2.00, hp: 1.80 },      // was 1.75/1.60
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

function makeCombatRoom(level, slot, eliteChance) {
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

function makeAltarRoom() {
  // Two relic pedestals at HP cost, empty center otherwise
  return {
    kind: 'altar',
    pillarTemplate: 3,                       // open
    spawns: [],
    doors: { north: true, south: true },
    cleared: true,                            // altar never blocks progression
  };
}

function makeChallengeRoom(level, eliteChance) {
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

function makeTroveRoom() {
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

function makeEventRoom(level, eliteChance) {
  const kind = Math.random();
  if (kind < 0.35) return makeAltarRoom();
  if (kind < 0.60) return makeTroveRoom();        // 25% chance: trove
  return makeChallengeRoom(level, eliteChance);
}

function makeBossSpawns(level, pillarTemplate = -1) {
  const bossType = { 1: 'orc', 2: 'bone_captain', 3: 'broodmother' }[level] || 'orc';
  const adds = { 1: ['archer', 'archer'], 2: ['archer', 'slime'], 3: ['skel', 'skel', 'archer'] }[level] || [];
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
  const eliteChance = ELITE_CHANCE_BY_LEVEL[lvl] || 0;

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
