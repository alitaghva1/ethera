// Achievements — milestones tracked across runs. Unlocks show as popups.
// Persists via localStorage.
import { safeLoadJSON, safeSaveJSON } from './storage.js';

const STORAGE_KEY = 'ethera:achievements:v1';

export const ACHIEVEMENTS = {
  first_blood: {
    id: 'first_blood',
    name: 'First Blood',
    desc: 'Defeat your first enemy',
    check: (s) => s.enemiesDefeated >= 1,
  },
  floor_one_down: {
    id: 'floor_one_down',
    name: 'Into the Dark',
    desc: 'Clear the Undercroft',
    check: (s) => s.floorReached >= 2 || s.bossesKilled >= 1,
  },
  the_vault_breaker: {
    id: 'the_vault_breaker',
    name: 'The Tower Falls',
    desc: 'Clear the Ruined Tower',
    check: (s) => s.floorReached >= 3 || s.bossesKilled >= 2,
  },
  depths_reached: {
    id: 'depths_reached',
    name: 'Depths Reached',
    desc: 'Survive to the Spire',
    check: (s) => s.floorReached >= 3,
  },
  eternal_descent: {
    id: 'eternal_descent',
    name: 'Eternal Descent',
    desc: 'Reach the Throne of Ruin',
    check: (s) => s.floorReached >= 4,
  },
  ethera_cleansed: {
    id: 'ethera_cleansed',
    name: 'Ethera Cleansed',
    desc: 'Complete a run',
    check: (s) => s._runComplete === true,
  },
  hundred_slain: {
    id: 'hundred_slain',
    name: 'Hundred Slain',
    desc: 'Defeat 100 enemies in one run',
    check: (s) => s.enemiesDefeated >= 100,
  },
  boss_slayer: {
    id: 'boss_slayer',
    name: 'Boss Slayer',
    desc: 'Defeat 3 bosses in one run',
    check: (s) => s.bossesKilled >= 3,
  },
  elite_hunter: {
    id: 'elite_hunter',
    name: 'Elite Hunter',
    desc: 'Defeat 20 elites in one run',
    check: (s) => s.elitesDefeated >= 20,
  },
  untouchable: {
    id: 'untouchable',
    name: 'Untouchable',
    desc: 'Pull off 10 Perfect Blocks in one run',
    check: (s) => s.perfectDodges >= 10,
  },
  scholar_of_relics: {
    id: 'scholar_of_relics',
    name: 'Scholar of Relics',
    desc: 'Acquire 10 relics in one run',
    check: (s) => s.relicsObtained >= 10,
  },
  golden_wanderer: {
    id: 'golden_wanderer',
    name: 'Golden Wanderer',
    desc: 'Collect 500 gold in one run',
    check: (s) => s.goldCollected >= 500,
  },
  sanctuary_adept: {
    id: 'sanctuary_adept',
    name: 'Sanctuary Adept',
    desc: 'Buy 5 items from the meta sanctuary',
    check: (_s, meta) => meta && Object.keys(meta.unlocked || {}).length >= 4,
  },
  cursed_conqueror: {
    id: 'cursed_conqueror',
    name: 'Cursed Conqueror',
    desc: 'Clear a floor with 3+ active curses',
    check: (s) => s._cursedFloorClear >= 3,
  },
  legendary_wielder: {
    id: 'legendary_wielder',
    name: 'Legendary Wielder',
    desc: 'Equip a legendary relic',
    check: (s) => s._legendaryEquipped === true,
  },
  carnage_achieved: {
    id: 'carnage_achieved',
    name: 'Carnage',
    desc: 'Reach a 40-hit combo',
    check: (s) => s._maxCombo >= 40,
  },

  // ============================================================================
  // HIDDEN ACHIEVEMENTS — not shown in any menu until discovered. Popup reveals
  // with a "??? UNLOCKED" phase, then flashes the real name. Cryptic `hint`
  // text stands in for the description during the mystery phase. Designed to
  // reward habit rather than explicit pursuit.
  // ============================================================================
  twin_legends: {
    id: 'twin_legends',
    name: 'Two Fires, Together',
    desc: 'Hold 2 legendary (or mythic) relics at once',
    hint: 'two fires burn together',
    hidden: true,
    check: (s) => s._maxLegendariesHeld >= 2,
  },
  mythborn: {
    id: 'mythborn',
    name: 'Mythborn',
    desc: 'Wield a mythic relic',
    hint: 'a legend has awakened, and you bear it',
    hidden: true,
    check: (s) => s._mythicEquipped === true,
  },
  fate_woven: {
    id: 'fate_woven',
    name: 'Fate Woven',
    desc: 'Hold 3 active fusions at once',
    hint: 'the relics have begun to harmonize',
    hidden: true,
    check: (s) => s._maxFusions >= 3,
  },
  perfect_dodger: {
    // ID kept (achievement persists in player save data); display copy
    // updated for the shield-replaces-dodge architecture. Trigger
    // condition `s.perfectDodges >= 25` still works because the stats
    // counter retained its legacy field name.
    id: 'perfect_dodger',
    name: 'Perfect Blocker',
    desc: 'Pull off 25 Perfect Blocks in one run',
    hint: 'the strikes that never reached you',
    hidden: true,
    check: (s) => s.perfectDodges >= 25,
  },
  ceaseless: {
    id: 'ceaseless',
    name: 'Ceaseless',
    desc: 'Reach an 80-hit combo',
    hint: 'your blade, their falling',
    hidden: true,
    check: (s) => s._maxCombo >= 80,
  },
  five_hundred_slain: {
    id: 'five_hundred_slain',
    name: 'Five Hundred Slain',
    desc: 'Defeat 500 enemies in one run',
    hint: 'the ruin counts them all',
    hidden: true,
    check: (s) => s.enemiesDefeated >= 500,
  },
  crown_of_relics: {
    id: 'crown_of_relics',
    name: 'Crown of Relics',
    desc: 'Acquire 15 relics in one run',
    hint: 'burdens, worn as crowns',
    hidden: true,
    check: (s) => s.relicsObtained >= 15,
  },
  coin_hoarder: {
    id: 'coin_hoarder',
    name: 'Coin Hoarder',
    desc: 'Collect 800 gold in one run',
    hint: 'riches, gathered in the dark',
    hidden: true,
    check: (s) => s.goldCollected >= 800,
  },
  the_signature: {
    id: 'the_signature',
    name: 'The Dungeon Named You',
    desc: 'Hold both Cataclysm and Eye of Ether at the same time',
    hint: 'the dungeon has named you',
    hidden: true,
    check: (s) => s._bothMythicsHeld === true,
  },
  unbroken_climber: {
    id: 'unbroken_climber',
    name: 'Unbroken',
    desc: 'Complete a run at Ascension VII or higher',
    hint: 'the world bends to one who does not break',
    hidden: true,
    check: (s) => s._runComplete === true && (s._ascensionAtWin || 0) >= 7,
  },
};

export const ACH_IDS = Object.keys(ACHIEVEMENTS);

export const unlockedAchievements = new Set();

// Queue of recently-unlocked achievements for popup display
export const pendingPopups = [];

export function loadAchievements() {
  const arr = safeLoadJSON(STORAGE_KEY, null, Array.isArray);
  if (arr) for (const id of arr) if (ACHIEVEMENTS[id]) unlockedAchievements.add(id);
}

export function saveAchievements() {
  safeSaveJSON(STORAGE_KEY, [...unlockedAchievements]);
}

export function unlockAch(id) {
  if (!ACHIEVEMENTS[id] || unlockedAchievements.has(id)) return false;
  unlockedAchievements.add(id);
  saveAchievements();
  pendingPopups.push({ id, t: 0, life: 4.5 });
  return true;
}

// Evaluate against current stats + meta — call after significant events.
export function evaluateAchievements(stats, meta) {
  for (const id of ACH_IDS) {
    if (unlockedAchievements.has(id)) continue;
    try {
      if (ACHIEVEMENTS[id].check(stats, meta)) unlockAch(id);
    } catch (e) {}
  }
}

export function totalUnlocked() { return unlockedAchievements.size; }
export function isUnlocked(id) { return unlockedAchievements.has(id); }
