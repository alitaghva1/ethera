// Per-run statistics. Counters for the end-of-run summary + essence calc.
export const stats = {
  runStartTime: 0,
  enemiesDefeated: 0,
  elitesDefeated: 0,
  bossesKilled: 0,
  damageDealt: 0,
  damageTaken: 0,
  goldCollected: 0,
  roomsCleared: 0,
  floorReached: 1,
  relicsObtained: 0,
  perfectDodges: 0,
  // Aux tracking for achievements / summary
  _maxCombo: 0,
  _legendaryEquipped: false,
  _runComplete: false,
  _cursedFloorClear: 0,
  // New: track biggest single hit + sanctuary visits for flavor
  biggestHit: 0,
  sanctuariesVisited: 0,
  wandererTrades: 0,
};

export function resetStats() {
  stats.runStartTime = Date.now();
  stats.enemiesDefeated = 0;
  stats.elitesDefeated = 0;
  stats.bossesKilled = 0;
  stats.damageDealt = 0;
  stats.damageTaken = 0;
  stats.goldCollected = 0;
  stats.roomsCleared = 0;
  stats.floorReached = 1;
  stats.relicsObtained = 0;
  stats.perfectDodges = 0;
  stats._maxCombo = 0;
  stats._legendaryEquipped = false;
  stats._runComplete = false;
  stats._cursedFloorClear = 0;
  stats.biggestHit = 0;
  stats.sanctuariesVisited = 0;
  stats.wandererTrades = 0;
}

export function runDurationSeconds() {
  return Math.max(0, Math.floor((Date.now() - stats.runStartTime) / 1000));
}

// Essence earned for a run based on depth reached, bosses slain, skill shown.
export function calculateEssence() {
  let essence = 0;
  essence += stats.floorReached * 4;          // 4 per floor reached
  essence += stats.bossesKilled * 8;           // 8 per boss killed
  essence += stats.roomsCleared * 1;           // 1 per room cleared
  essence += stats.relicsObtained * 3;         // 3 per relic
  essence += stats.perfectDodges * 1;          // 1 per perfect dodge (skill bonus)
  essence += Math.floor(stats._maxCombo / 10); // combo mastery: 1 per 10-combo
  // MEMORY OF THE DEBTOR — the pact: double starting gold in exchange for
  // half the essence you would have earned. Applied last so it halves the
  // total, including the other memory/curse multipliers stacked on top.
  if (typeof window !== 'undefined' && window.__activeMemory && window.__activeMemory.id === 'debtor') {
    essence = Math.floor(essence / 2);
  }
  return essence;
}
