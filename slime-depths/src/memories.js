// ============================================================================
// MEMORY WEAVE — declared run identities without new classes.
//
// At run start, the player may choose a Memory: a paired constraint + gift
// that reshapes the build direction. Same hero, radically different run.
// Memories unlock by doing specific things in prior runs, so choosing one
// is both a loadout decision AND a record of what you've already done.
//
// Compare to Hades Keepsakes (support slot, mid-fight) and Isaac
// Transformations (triggered by collecting item families). Memories are
// DECLARED identities at the start of the run, history-gated.
//
// Each memory has:
//   id           : stable key
//   name         : "Memory of X"
//   tint         : hex color for UI
//   flavor       : italic lore line (shown on card)
//   gift         : what you get (string for UI)
//   constraint   : what you give up (string for UI)
//   apply        : (hero, ctx) => void — mutates the hero at run start
//   unlockCheck  : (records, stats) => bool — called after each run
//   unlockHint   : string shown while locked ("Clear floor 2 to remember…")
//
// Persistence: selected memory id + set of unlocked memory ids.
// ============================================================================

import { hero } from './hero.js';
import { RELIC_DEFS, applyRelic } from './relics.js';

const SELECTED_KEY = 'ethera:memory_selected:v1';
const UNLOCKED_KEY = 'ethera:memories_unlocked:v1';

export const unlockedMemories = new Set();
export let selectedMemoryId = null;   // null = no memory this run

// Safe JSON wrapper — applied to the UNLOCKED set; selectedMemoryId stays
// raw-string (no JSON) but still wrapped in its own try/catch since storage
// access can throw in restricted contexts.
import { safeLoadJSON, safeSaveJSON } from './storage.js?v=save1';

export function loadMemories() {
  try {
    const sel = localStorage.getItem(SELECTED_KEY);
    if (sel) selectedMemoryId = sel;
  } catch (e) {}
  const arr = safeLoadJSON(UNLOCKED_KEY, null, Array.isArray);
  if (arr) for (const id of arr) unlockedMemories.add(id);
  // First Descent is always available — the starter memory.
  unlockedMemories.add('first_descent');
}
function saveSelected() {
  try { localStorage.setItem(SELECTED_KEY, selectedMemoryId || ''); } catch (e) {}
}
function saveUnlocked() {
  safeSaveJSON(UNLOCKED_KEY, [...unlockedMemories]);
}
export function setSelectedMemory(id) {
  selectedMemoryId = id || null;
  saveSelected();
}

// ============================================================================
// The memory pool. Keep constraints/gifts sharp and non-overlapping so each
// memory feels like its own lens on the run. Unlock conditions favor
// observable events that don't require new tracking machinery — we lean
// on existing `records` and `stats` fields.
// ============================================================================

// Helper — pick N random relic IDs from those matching a tier filter
function _pickNRelics(n, tierFilter) {
  const ids = Object.keys(RELIC_DEFS).filter(id => {
    const tier = RELIC_DEFS[id].tier || 'common';
    return tierFilter ? tierFilter(tier) : true;
  });
  // Shuffle + take n
  for (let i = ids.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids.slice(0, Math.min(n, ids.length));
}

export const MEMORIES = {
  first_descent: {
    id: 'first_descent',
    name: 'Memory of the First Descent',
    tint: '#c9a86a',
    flavor: 'You did not know, then, what you were becoming.',
    gift: 'Begin with 1 random common relic',
    constraint: 'No other bonuses',
    apply: () => {
      const picks = _pickNRelics(1, t => t === 'common');
      for (const id of picks) applyRelic(id);
    },
    unlockCheck: () => true,     // always unlocked (starter)
    unlockHint: 'always remembered',
  },

  stillness: {
    id: 'stillness',
    name: 'Memory of Stillness',
    tint: '#a0c8d8',
    flavor: 'She learned to let the blade come to her. Only the once.',
    gift: '+3 max HP · +15% damage',
    constraint: 'Dodge disabled',
    apply: (h) => {
      h.maxHp += 3;
      h.hp = h.maxHp;
      h.damageMul *= 1.15;
      h.memoryStillness = true;     // checked in dodge handler
    },
    unlockCheck: (records) => records.maxFloor >= 2,
    unlockHint: 'Reach floor 2 to remember…',
  },

  thunder: {
    id: 'thunder',
    name: 'Memory of Thunder',
    tint: '#a0e8ff',
    flavor: 'The storm chose a throat to speak through.',
    gift: 'Begin with Chain Lightning',
    constraint: 'Attack speed −25%',
    apply: (h) => {
      applyRelic('chain_lightning');
      h.attackCooldownMul *= 1.25;
    },
    unlockCheck: (records) => records.enemiesKilledAllTime >= 150,
    unlockHint: 'Slay 150 enemies to remember…',
  },

  ash: {
    id: 'ash',
    name: 'Memory of Ash',
    tint: '#c8a898',
    flavor: 'What remains when the fire finishes eating.',
    gift: 'Begin with 2 random legendary relics',
    constraint: 'Max HP capped at 4',
    apply: (h) => {
      const picks = _pickNRelics(2, t => t === 'legendary');
      for (const id of picks) applyRelic(id);
      h.maxHp = Math.min(h.maxHp, 4);
      h.hp = h.maxHp;
      h.memoryAsh = true;        // prevents maxHp from rising later
    },
    unlockCheck: (records) => records.bossKillsAllTime >= 3,
    unlockHint: 'Slay 3 bosses to remember…',
  },

  debtor: {
    id: 'debtor',
    name: 'Memory of the Debtor',
    tint: '#ffd68a',
    flavor: 'You were owed something, once. The ruin never paid.',
    gift: 'Begin with 100 gold · wanderer trades cost half',
    constraint: 'Essence rewards halved',
    apply: (h) => {
      h.startingGold = (h.startingGold || 0) + 100;
      h.memoryDebtor = true;        // wanderer reads this, essence pickup halves
    },
    unlockCheck: (records) => records.mostGold >= 300,
    unlockHint: 'Earn 300 gold in one run to remember…',
  },

  stone: {
    id: 'stone',
    name: 'Memory of Stone',
    tint: '#8a9098',
    flavor: 'A thing that does not bleed cannot be hurried.',
    gift: 'Damage taken −35%',
    constraint: 'Move speed −25% · dodge distance −25%',
    apply: (h) => {
      h.damageTakenMul *= 0.65;
      h.speedMul *= 0.75;
      h.dodgeDistMul *= 0.75;
    },
    unlockCheck: (records) => records.maxFloor >= 3,
    unlockHint: 'Reach floor 3 to remember…',
  },

  echo: {
    id: 'echo',
    name: 'Memory of the Echo',
    tint: '#b0c8ff',
    flavor: 'Every swing is two. One here. One somewhere the world forgot.',
    gift: 'All attacks echo (0.15s delayed, 50% damage)',
    constraint: 'Direct damage −25%',
    apply: (h) => {
      h.echoingStrike = true;
      h.damageMul *= 0.75;
    },
    unlockCheck: (records, _stats, ctx) => ctx && ctx.seenRelicIds && ctx.seenRelicIds.has('echoing_strike'),
    unlockHint: 'Find Echoing Strike to remember…',
  },

  breath: {
    id: 'breath',
    name: 'Memory of the Breath',
    tint: '#ff9ab4',
    flavor: 'One breath before the end. Held. Held. Released.',
    gift: 'Regenerate 1 HP every 4s',
    constraint: 'Begin at 1 HP · max HP −2',
    apply: (h) => {
      h.maxHp = Math.max(1, h.maxHp - 2);
      h.hp = 1;
      h.regenRate += 0.25;
      h.regenCD = 1 / h.regenRate;
    },
    unlockCheck: (records) => records.runsCompleted >= 1,
    unlockHint: 'Complete one descent to remember…',
  },

  hollow: {
    id: 'hollow',
    name: 'Memory of the Hollow',
    tint: '#b49aff',
    flavor: 'There was a shape where you used to be.',
    gift: '+30% damage · +15% crit',
    constraint: 'Lifesteal does not heal you',
    apply: (h) => {
      h.damageMul *= 1.30;
      h.critChance += 0.15;
      h.memoryHollow = true;       // lifesteal wiring checks this
    },
    unlockCheck: (records) => records.runsStarted >= 5,
    unlockHint: 'Begin five descents to remember…',
  },

  bell: {
    id: 'bell',
    name: 'Memory of the Bell',
    tint: '#e6c8ff',
    flavor: 'She struck the great bell, and the world answered for a heartbeat.',
    gift: '+8% damage per relic owned (incl. starter)',
    constraint: 'Begin with 0 HP regen · Vitality disabled',
    apply: (h) => {
      h.memoryBell = true;
      // Retroactively apply the per-relic bonus for any relics already
      // equipped (meta unlocks, tarot, daily) before this memory activated.
      // applyRelic() will handle the bonus for all subsequent pickups.
      if (h.relicCount > 0) {
        h.damageMul *= Math.pow(1.08, h.relicCount);
      }
      h.regenRate = 0;
      h.regenCD = 9999;
    },
    unlockCheck: (records) => records.mostRelics >= 6,
    unlockHint: 'Own 6 relics in one run to remember…',
  },

  nine: {
    id: 'nine',
    name: 'Memory of Nine',
    tint: '#d85a5a',
    flavor: 'Nine doors, nine keys, nine names the ruin has called you.',
    gift: 'Boss HP −25%',
    constraint: 'Normal enemy HP +40%',
    apply: (h) => {
      h.memoryNine = true;        // read by enemy spawn wiring
    },
    unlockCheck: (records) => records.bossKillsAllTime >= 9,
    unlockHint: 'Slay 9 bosses to remember…',
  },

  hungry_blade: {
    id: 'hungry_blade',
    name: 'Memory of the Hungry Blade',
    tint: '#ff5078',
    flavor: 'It drank, and the blade wanted more.',
    gift: '+20% lifesteal · +15% attack speed',
    constraint: 'Max HP capped at 5',
    apply: (h) => {
      h.lifesteal += 0.20;
      h.attackCooldownMul *= 0.85;
      h.maxHp = Math.min(h.maxHp, 5);
      h.hp = h.maxHp;
      h.memoryHungryBlade = true;
    },
    unlockCheck: (records, _stats, ctx) => ctx && ctx.seenRelicIds && ctx.seenRelicIds.has('vampiric_aura'),
    unlockHint: 'Find Vampiric Aura to remember…',
  },

  // ==========================================================================
  // MIGRATED FROM TAROT (meta consolidation pass, review #3)
  //
  // Tarot's most mechanically-distinct cards moved here so there is ONE
  // identity system (Memory) rather than two that overlap. The tarot module
  // remains dormant in the codebase; these memories are the new home for
  // the effects. The hanged_man's HP drain and the hermit's wanderer spawn
  // share their gate code with the existing tarot paths in main.js.
  // ==========================================================================
  hermit: {
    id: 'hermit',
    name: 'Memory of the Hermit',
    tint: '#c9a86a',
    flavor: 'A lantern in every hollow.',
    gift: 'The Wanderer appears in every sanctuary',
    constraint: 'No other bonuses',
    apply: (h) => {
      h.memoryHermit = true;
    },
    unlockCheck: (records) => records.runsCompleted >= 2,
    unlockHint: 'Complete 2 descents to remember…',
  },

  hanged_man: {
    id: 'hanged_man',
    name: 'Memory of the Hanged Man',
    tint: '#b894e8',
    flavor: 'Inverted, you see clearly.',
    gift: '+30% damage',
    constraint: 'Lose 1 HP on every room entry',
    apply: (h) => {
      h.damageMul *= 1.30;
      h.memoryHanged = true;
    },
    unlockCheck: (records) => records.runsStarted >= 8,
    unlockHint: 'Begin 8 descents to remember…',
  },
};

export const ALL_MEMORY_IDS = Object.keys(MEMORIES);

// Check all memories against the records/stats/ctx; newly-unlocked ones are
// returned so the caller can surface a banner/toast. Idempotent — already-
// unlocked memories are not reported again.
export function checkMemoryUnlocks(records, stats, ctx) {
  const newly = [];
  for (const id of ALL_MEMORY_IDS) {
    if (unlockedMemories.has(id)) continue;
    const def = MEMORIES[id];
    try {
      if (def.unlockCheck(records, stats, ctx)) {
        unlockedMemories.add(id);
        newly.push(def);
      }
    } catch (e) { /* never let a bad unlock check break the run */ }
  }
  if (newly.length) saveUnlocked();
  return newly;
}

// Apply the currently-selected memory to the hero (called at run start, AFTER
// base hero reset + meta bonuses, so the memory's modifiers stack on top).
export function applySelectedMemory(ctx) {
  if (!selectedMemoryId) return null;
  const def = MEMORIES[selectedMemoryId];
  if (!def) return null;
  if (!unlockedMemories.has(selectedMemoryId)) return null;   // safety
  try { def.apply(hero, ctx); } catch (e) { console.warn('memory apply failed', e); }
  return def;
}

export function getSelectedMemory() {
  if (!selectedMemoryId) return null;
  return MEMORIES[selectedMemoryId] || null;
}

export function totalMemories() { return ALL_MEMORY_IDS.length; }
export function unlockedCount() { return unlockedMemories.size; }
