// Personal bests — tracks highest values across runs, persisted to localStorage.
// Used by the end-of-run screen to highlight "NEW BEST" milestones.
import { safeLoadJSON, safeSaveJSON } from './storage.js';
import type { Stats } from './stats';

const KEY = 'ethera:records:v1';

export interface Records {
  maxFloor: number;
  maxCombo: number;
  biggestHit: number;
  mostRelics: number;
  mostGold: number;
  mostEnemies: number;
  mostBosses: number;
  fastestClear: number | null; // seconds; null = no clear yet
  runsStarted: number;
  runsCompleted: number;
  bossKillsAllTime: number;
  enemiesKilledAllTime: number;
}

// IDs emitted by updateRecords() to indicate which bests were beaten. The
// end-of-run UI maps these to "NEW BEST" tags next to their respective
// stat lines.
export type RecordId =
  | 'maxFloor'
  | 'maxCombo'
  | 'biggestHit'
  | 'mostRelics'
  | 'mostGold'
  | 'mostEnemies'
  | 'mostBosses'
  | 'fastestClear';

// Default records — all zero; first run will set them.
const defaultRecords: Records = {
  maxFloor: 0,
  maxCombo: 0,
  biggestHit: 0,
  mostRelics: 0,
  mostGold: 0,
  mostEnemies: 0,
  mostBosses: 0,
  fastestClear: null,
  runsStarted: 0,
  runsCompleted: 0,
  bossKillsAllTime: 0,
  enemiesKilledAllTime: 0,
};

export const records: Records = { ...defaultRecords };

// Shape validator — ensures the loaded blob is a plain object we can merge.
// Rejects arrays, strings, numbers, null — all of which would pass JSON.parse
// but break Object.assign in silent, progress-eating ways.
function _isRecordsShape(v: unknown): boolean {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

export function loadRecords(): void {
  const parsed = safeLoadJSON(KEY, null, _isRecordsShape);
  if (parsed) Object.assign(records, parsed);
}

export function saveRecords(): void {
  safeSaveJSON(KEY, records);
}

// Compare a stats snapshot against records. Returns a set of record IDs
// that were beaten this run, so the caller can tag them in the UI.
export function updateRecords(stats: Stats, isVictory: boolean, runSeconds: number): RecordId[] {
  const beaten: RecordId[] = [];
  if (stats.floorReached > records.maxFloor) {
    records.maxFloor = stats.floorReached;
    beaten.push('maxFloor');
  }
  if ((stats._maxCombo | 0) > records.maxCombo) {
    records.maxCombo = stats._maxCombo | 0;
    beaten.push('maxCombo');
  }
  if ((stats.biggestHit | 0) > records.biggestHit) {
    records.biggestHit = stats.biggestHit | 0;
    beaten.push('biggestHit');
  }
  if (stats.relicsObtained > records.mostRelics) {
    records.mostRelics = stats.relicsObtained;
    beaten.push('mostRelics');
  }
  if (stats.goldCollected > records.mostGold) {
    records.mostGold = stats.goldCollected;
    beaten.push('mostGold');
  }
  if (stats.enemiesDefeated > records.mostEnemies) {
    records.mostEnemies = stats.enemiesDefeated;
    beaten.push('mostEnemies');
  }
  if (stats.bossesKilled > records.mostBosses) {
    records.mostBosses = stats.bossesKilled;
    beaten.push('mostBosses');
  }
  if (isVictory && (records.fastestClear === null || runSeconds < records.fastestClear)) {
    records.fastestClear = runSeconds;
    beaten.push('fastestClear');
  }
  // Lifetime totals
  records.bossKillsAllTime += stats.bossesKilled;
  records.enemiesKilledAllTime += stats.enemiesDefeated;
  if (isVictory) records.runsCompleted++;
  saveRecords();
  return beaten;
}

export function incrementRunsStarted(): void {
  records.runsStarted++;
  saveRecords();
}
