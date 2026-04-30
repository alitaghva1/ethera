// Per-run statistics. Counters for the end-of-run summary + essence calc.
//
// Migrated to TypeScript to formalize the Stats shape — eight modules
// mutate this singleton directly (enemies, gold, hero, relics, wanderer,
// main, etc.) and any of them adding/renaming a field without matching
// the reset function is the kind of silent drift that TS catches.

// Window-augmentation for the `__activeMemory` runtime global set by
// memories.js. Keeping the declaration local to this file since stats
// is the only typed consumer so far; consolidate into a `globals.d.ts`
// when a second .ts file needs it.
declare global {
  interface Window {
    __activeMemory?: { id: string };
  }
}

export interface Stats {
  runStartTime: number;
  enemiesDefeated: number;
  elitesDefeated: number;
  bossesKilled: number;
  damageDealt: number;
  damageTaken: number;
  goldCollected: number;
  roomsCleared: number;
  floorReached: number;
  relicsObtained: number;
  perfectDodges: number;

  // Aux tracking — underscore prefix marks internal / not-for-UI display.
  _maxCombo: number;
  _legendaryEquipped: boolean;
  _runComplete: boolean;
  _cursedFloorClear: number;

  // Achievement-gate aux tracking. Audit found these were written
  // by main.js + read by achievements.js but NOT declared in this
  // interface — checkJs:false on the .js consumers meant the type
  // checker silently allowed it. Any rename of these fields would
  // have broken 5 achievements without surfacing in CI. Now declared
  // so future renames trigger a real type error.
  _maxLegendariesHeld: number;     // peak count of legendary relics held in this run
  _mythicEquipped: boolean;         // any mythic relic ever equipped this run
  _bothMythicsHeld: boolean;        // cataclysm + eye_of_ether both held simultaneously
  _maxFusions: number;              // peak count of active fusions in this run
  _ascensionAtWin: number;          // ascension tier at the moment of victory

  // Added later for achievements + summary flavor.
  biggestHit: number;
  sanctuariesVisited: number;
  wandererTrades: number;
}

export const stats: Stats = {
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
  _maxCombo: 0,
  _legendaryEquipped: false,
  _runComplete: false,
  _cursedFloorClear: 0,
  _maxLegendariesHeld: 0,
  _mythicEquipped: false,
  _bothMythicsHeld: false,
  _maxFusions: 0,
  _ascensionAtWin: 0,
  biggestHit: 0,
  sanctuariesVisited: 0,
  wandererTrades: 0,
};

export function resetStats(): void {
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
  stats._maxLegendariesHeld = 0;
  stats._mythicEquipped = false;
  stats._bothMythicsHeld = false;
  stats._maxFusions = 0;
  stats._ascensionAtWin = 0;
  stats.biggestHit = 0;
  stats.sanctuariesVisited = 0;
  stats.wandererTrades = 0;
}

export function runDurationSeconds(): number {
  return Math.max(0, Math.floor((Date.now() - stats.runStartTime) / 1000));
}

// Essence earned for a run based on depth reached, bosses slain, skill shown.
export function calculateEssence(): number {
  let essence = 0;
  essence += stats.floorReached * 4; // 4 per floor reached
  essence += stats.bossesKilled * 8; // 8 per boss killed
  essence += stats.roomsCleared * 1; // 1 per room cleared
  essence += stats.relicsObtained * 3; // 3 per relic
  essence += stats.perfectDodges * 1; // 1 per perfect dodge (skill bonus)
  essence += Math.floor(stats._maxCombo / 10); // combo mastery: 1 per 10-combo
  // MEMORY OF THE DEBTOR — the pact: double starting gold in exchange for
  // half the essence you would have earned. Applied last so it halves the
  // total, including the other memory/curse multipliers stacked on top.
  if (typeof window !== 'undefined' && window.__activeMemory?.id === 'debtor') {
    essence = Math.floor(essence / 2);
  }
  return essence;
}
