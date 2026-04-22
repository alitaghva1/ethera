// Personal bests — tracks highest values across runs, persisted to localStorage.
// Used by the end-of-run screen to highlight "NEW BEST" milestones.

const KEY = 'ethera:records:v1';

// Default records — all zero; first run will set them.
const defaultRecords = {
  maxFloor: 0,
  maxCombo: 0,
  biggestHit: 0,
  mostRelics: 0,
  mostGold: 0,
  mostEnemies: 0,
  mostBosses: 0,
  fastestClear: null, // seconds; null = no clear yet
  runsStarted: 0,
  runsCompleted: 0,
  bossKillsAllTime: 0,
  enemiesKilledAllTime: 0,
};

export const records = { ...defaultRecords };

export function loadRecords() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    Object.assign(records, parsed);
  } catch (e) {}
}

export function saveRecords() {
  try { localStorage.setItem(KEY, JSON.stringify(records)); } catch (e) {}
}

// Compare a stats snapshot against records. Returns a set of record IDs that were beaten.
export function updateRecords(stats, isVictory, runSeconds) {
  const beaten = [];
  if (stats.floorReached > records.maxFloor) { records.maxFloor = stats.floorReached; beaten.push('maxFloor'); }
  if ((stats._maxCombo | 0) > records.maxCombo) { records.maxCombo = stats._maxCombo | 0; beaten.push('maxCombo'); }
  if ((stats.biggestHit | 0) > records.biggestHit) { records.biggestHit = stats.biggestHit | 0; beaten.push('biggestHit'); }
  if (stats.relicsObtained > records.mostRelics) { records.mostRelics = stats.relicsObtained; beaten.push('mostRelics'); }
  if (stats.goldCollected > records.mostGold) { records.mostGold = stats.goldCollected; beaten.push('mostGold'); }
  if (stats.enemiesDefeated > records.mostEnemies) { records.mostEnemies = stats.enemiesDefeated; beaten.push('mostEnemies'); }
  if (stats.bossesKilled > records.mostBosses) { records.mostBosses = stats.bossesKilled; beaten.push('mostBosses'); }
  if (isVictory && (records.fastestClear === null || runSeconds < records.fastestClear)) {
    records.fastestClear = runSeconds; beaten.push('fastestClear');
  }
  // Lifetime totals
  records.bossKillsAllTime += stats.bossesKilled;
  records.enemiesKilledAllTime += stats.enemiesDefeated;
  if (isVictory) records.runsCompleted++;
  saveRecords();
  return beaten;
}

export function incrementRunsStarted() {
  records.runsStarted++;
  saveRecords();
}
