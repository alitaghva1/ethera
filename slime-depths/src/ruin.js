// THE RUIN REMEMBERS — persistent memory of past runs that bleeds into future ones.
//
// Tracks:
//   age          : total deaths the player has suffered (dungeon weathers with age)
//   deaths       : list of past death events with location + build snapshot
//   bossKills    : list of boss defeats with flavor
//   stains       : map of floor+roomIndex → stain type, rendered in future visits
//   journal      : auto-generated text entries (death eulogies, boss kill notes)
//
// Persisted to localStorage. The dungeon physically reflects your history —
// rooms where you died keep blood. Rooms where bosses fell remember the weight.

const KEY = 'ethera:ruin:v1';

// Keep lists bounded so localStorage doesn't bloat
const MAX_DEATHS = 40;
const MAX_BOSS_KILLS = 40;
const MAX_JOURNAL = 50;
const MAX_STAINS = 100;

export const ruin = {
  age: 0,
  deaths: [],       // [{ floor, roomIdx, build, combo, maxHp, timestamp, epitaph }]
  bossKills: [],    // [{ bossType, floor, timestamp, note }]
  stains: {},       // "F<floor>-R<roomIdx>": { kind, intensity, ts }
  journal: [],      // { kind: 'death'|'boss'|'milestone', text, ts }
  runsCompleted: 0,
};

export function loadRuin() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    const p = JSON.parse(raw);
    Object.assign(ruin, p);
    // Backwards compat: ensure arrays exist
    if (!Array.isArray(ruin.deaths)) ruin.deaths = [];
    if (!Array.isArray(ruin.bossKills)) ruin.bossKills = [];
    if (!Array.isArray(ruin.journal)) ruin.journal = [];
    if (!ruin.stains || typeof ruin.stains !== 'object') ruin.stains = {};
  } catch (e) {}
}

function saveRuin() {
  try { localStorage.setItem(KEY, JSON.stringify(ruin)); } catch (e) {}
}

// Evocative death epitaph pool — 2-line poetic summaries
const DEATH_EPITAPHS = [
  'the dark reclaimed what the dark had lent',
  'one more name forgotten',
  'the ruin adds another footprint',
  'they came so far — then no further',
  'dust to dust, and the hall stays hungry',
  'another pilgrim, another stain',
  'they kindled a light; the dark drank it',
  'the stones will remember — briefly',
  'step by step, descent by descent',
  'the deep takes its tithe',
  'fell in the stillness, between two heartbeats',
  'their lantern gutters, still',
  'the wound at the world\u2019s heart draws near',
];
const BOSS_EULOGIES = {
  orc: 'the warchief lies broken — the crypts are yours',
  bone_captain: 'the revenant kneels; his crown rusts in dust',
  broodmother: 'the brood-mother stills — her eggs go cold',
  ember_tyrant: 'the wound at the world\u2019s heart closes, for now',
};

function pickEpitaph() {
  return DEATH_EPITAPHS[Math.floor(Math.random() * DEATH_EPITAPHS.length)];
}

// Record a death — call from main.js when hero enters dead state
export function recordDeath({ floor, roomIdx, build, combo, maxHp, damageDealt }) {
  ruin.age = (ruin.age | 0) + 1;
  const epitaph = pickEpitaph();
  const evt = { floor, roomIdx, build, combo: combo | 0, maxHp: maxHp | 0, damageDealt: damageDealt | 0, timestamp: Date.now(), epitaph };
  ruin.deaths.unshift(evt);
  if (ruin.deaths.length > MAX_DEATHS) ruin.deaths.length = MAX_DEATHS;
  // Blood stain on death room
  const key = `F${floor}-R${roomIdx}`;
  ruin.stains[key] = { kind: 'blood', intensity: Math.min(3, (ruin.stains[key]?.intensity || 0) + 1), ts: Date.now() };
  // Cap stains
  const stainKeys = Object.keys(ruin.stains);
  if (stainKeys.length > MAX_STAINS) {
    // Drop oldest
    stainKeys.sort((a, b) => (ruin.stains[a].ts || 0) - (ruin.stains[b].ts || 0));
    for (let i = 0; i < stainKeys.length - MAX_STAINS; i++) delete ruin.stains[stainKeys[i]];
  }
  // Journal entry — poetic
  const entry = {
    kind: 'death',
    text: `Floor ${romanNumeral(floor)}, Room ${roomIdx + 1}. ${build.length} relic${build.length === 1 ? '' : 's'}, combo of ${combo}. ${epitaph}.`,
    ts: Date.now(),
  };
  ruin.journal.unshift(entry);
  if (ruin.journal.length > MAX_JOURNAL) ruin.journal.length = MAX_JOURNAL;
  saveRuin();
}

// Record a boss kill
export function recordBossKill({ bossType, floor }) {
  const evt = { bossType, floor, timestamp: Date.now(), note: BOSS_EULOGIES[bossType] || '' };
  ruin.bossKills.unshift(evt);
  if (ruin.bossKills.length > MAX_BOSS_KILLS) ruin.bossKills.length = MAX_BOSS_KILLS;
  // Scorch stain on boss arena
  const key = `F${floor}-Rboss`;
  ruin.stains[key] = { kind: 'scorch', intensity: Math.min(3, (ruin.stains[key]?.intensity || 0) + 1), ts: Date.now() };
  // Journal entry — boss-specific
  ruin.journal.unshift({
    kind: 'boss',
    text: `Floor ${romanNumeral(floor)} boss felled. ${evt.note}`,
    ts: Date.now(),
  });
  if (ruin.journal.length > MAX_JOURNAL) ruin.journal.length = MAX_JOURNAL;
  saveRuin();
}

// Record a completed run (final boss)
export function recordRunComplete() {
  ruin.runsCompleted = (ruin.runsCompleted | 0) + 1;
  ruin.journal.unshift({
    kind: 'milestone',
    text: `Run ${ruin.runsCompleted} complete. The Inferno yields — but Ethera is older than any victory.`,
    ts: Date.now(),
  });
  if (ruin.journal.length > MAX_JOURNAL) ruin.journal.length = MAX_JOURNAL;
  saveRuin();
}

// Read stain (if any) for a specific floor+room
export function getRoomStain(floor, roomIdx) {
  return ruin.stains[`F${floor}-R${roomIdx}`] || null;
}
export function getBossRoomStain(floor) {
  return ruin.stains[`F${floor}-Rboss`] || null;
}

// Dungeon aging — influences decor density. Level scales with age/5 capped at 4.
export function agingLevel() {
  return Math.min(4, Math.floor((ruin.age | 0) / 5));
}

function romanNumeral(n) {
  return ['0', 'I', 'II', 'III', 'IV', 'V'][n] || String(n);
}
