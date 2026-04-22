// Curses — optional run modifiers. Player toggles them at the main menu.
// Each curse raises difficulty + raises essence reward. Stackable.
//
// Effects are NOT applied inside this module — they're just descriptive. The
// game reads isCursed(id) and applies effects at run-start / in-combat.

export const CURSES = {
  ethers_curse: {
    id: 'ethers_curse',
    name: "Ether's Curse",
    desc: 'Enemies spawn as elite 25% more often',
    flavor: 'You called her name. She sent her chosen to answer.',
    essenceMul: 1.25,
    tint: '#c49aff',
  },
  starving: {
    id: 'starving',
    name: 'Starving',
    desc: 'Sanctuaries do nothing \u2014 altar HP cost x2',
    flavor: 'Every blessing ignored. Every wound kept. The ruin prefers it so.',
    essenceMul: 1.30,
    tint: '#d85a5a',
  },
  glass_blade: {
    id: 'glass_blade',
    name: 'Glass Blade',
    desc: 'You deal +40% damage, but take +60% damage',
    flavor: 'It cuts through anything. Including its wielder, sooner or later.',
    essenceMul: 1.25,
    tint: '#a0e0ff',
  },
  forsaken: {
    id: 'forsaken',
    name: 'Forsaken',
    desc: 'Meta-progression unlocks are disabled this run',
    flavor: 'You arrived with nothing. You will leave with less.',
    essenceMul: 1.30,
    tint: '#8a8aa0',
  },
  the_swarm: {
    id: 'the_swarm',
    name: 'The Swarm',
    desc: 'Combat rooms spawn +2 extra enemies',
    flavor: 'The ruin does not send one at a time. It was never that polite.',
    essenceMul: 1.40,
    tint: '#e8a050',
  },
  blind: {
    id: 'blind',
    name: 'Blind Descent',
    desc: 'Door previews are disabled',
    flavor: 'Every door a question. No answer until you have stepped through.',
    essenceMul: 1.15,
    tint: '#6a8aa0',
  },
};

export const ALL_CURSE_IDS = Object.keys(CURSES);

// Currently-active curses for this run (persists in localStorage across
// sessions so the toggle survives page reloads; cleared on purpose by player).
import { safeLoadJSON, safeSaveJSON } from './storage.js?v=save1';

const STORAGE_KEY = 'ethera:curses:v1';
export const activeCurses = new Set();

export function loadCurses() {
  const arr = safeLoadJSON(STORAGE_KEY, null, Array.isArray);
  if (!arr) return;
  for (const id of arr) if (CURSES[id]) activeCurses.add(id);
}

export function saveCurses() {
  safeSaveJSON(STORAGE_KEY, [...activeCurses]);
}

export function toggleCurse(id) {
  if (!CURSES[id]) return;
  if (activeCurses.has(id)) activeCurses.delete(id);
  else activeCurses.add(id);
  saveCurses();
}

export function isCursed(id) { return activeCurses.has(id); }

export function curseCount() { return activeCurses.size; }

// Combined essence multiplier from all active curses.
// Multiplicative (stacks stronger as you add more).
export function curseEssenceMul() {
  let mul = 1;
  for (const id of activeCurses) mul *= CURSES[id].essenceMul;
  return mul;
}
