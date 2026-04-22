// Daily challenge — deterministic curse + starting relic rolled from today's date.
// Completing the day's run banks a streak. Missing a day resets.

import { ALL_CURSE_IDS, CURSES } from './curses.js';
import { ALL_RELIC_IDS, RELIC_DEFS } from './relics.js';

const KEY = 'ethera:daily:v1';

export const daily = {
  lastDate: null,           // YYYY-MM-DD string of last completed daily
  streak: 0,                 // consecutive days completed
  activeForRun: false,       // true while a daily run is in progress
};

export function loadDaily() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    const p = JSON.parse(raw);
    if (p.lastDate) daily.lastDate = p.lastDate;
    if (typeof p.streak === 'number') daily.streak = p.streak;
  } catch (e) {}
  // If the last completed date was more than 1 day ago, break the streak
  const today = todayKey();
  if (daily.lastDate && daily.lastDate !== today && daily.lastDate !== yesterdayKey()) {
    daily.streak = 0;
  }
}

export function saveDaily() {
  try { localStorage.setItem(KEY, JSON.stringify({ lastDate: daily.lastDate, streak: daily.streak })); } catch (e) {}
}

export function todayKey() {
  const d = new Date();
  return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
}

function yesterdayKey() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
}

function pad2(n) { return (n < 10 ? '0' : '') + n; }

// Hash today's date string to a deterministic integer — reused to pick curse + relic
function seedFromDate(key) {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return h >>> 0;
}

// Get today's daily challenge: { curseId, relicId }
export function getTodayChallenge() {
  const key = todayKey();
  const seed = seedFromDate(key);
  const curseId = ALL_CURSE_IDS[seed % ALL_CURSE_IDS.length];
  // Pick a strong common/rare relic (skip legendaries — save those for natural drops)
  const pool = ALL_RELIC_IDS.filter(id => {
    const t = RELIC_DEFS[id].tier || 'common';
    return t !== 'legendary';
  });
  const relicId = pool[(seed >>> 8) % pool.length];
  return {
    date: key,
    curseId, curseName: CURSES[curseId]?.name || curseId,
    relicId, relicName: RELIC_DEFS[relicId]?.name || relicId,
  };
}

// Call when a daily run ends in victory (or reaches floor MAX boss kill)
export function markDailyCompleted() {
  const today = todayKey();
  if (daily.lastDate === today) return;            // already banked today
  // Streak extends if last completion was yesterday, else resets to 1
  if (daily.lastDate === yesterdayKey()) daily.streak++;
  else daily.streak = 1;
  daily.lastDate = today;
  saveDaily();
}

export function hasCompletedToday() {
  return daily.lastDate === todayKey();
}
