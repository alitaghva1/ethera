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
    desc: 'Clear Floor I',
    check: (s) => s.floorReached >= 2 || s.bossesKilled >= 1,
  },
  the_vault_breaker: {
    id: 'the_vault_breaker',
    name: 'The Vault Breaker',
    desc: 'Clear Floor II',
    check: (s) => s.floorReached >= 3 || s.bossesKilled >= 2,
  },
  depths_reached: {
    id: 'depths_reached',
    name: 'Depths Reached',
    desc: 'Survive to the Abyss',
    check: (s) => s.floorReached >= 3,
  },
  eternal_descent: {
    id: 'eternal_descent',
    name: 'Eternal Descent',
    desc: 'Reach The Inferno',
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
    desc: 'Pull off 10 Perfect Dodges in one run',
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
