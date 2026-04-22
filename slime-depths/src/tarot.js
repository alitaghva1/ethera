// TAROT DESCENT — Major Arcana run modifiers. Before a tarot run begins,
// the player draws 3 random cards. Each card modifies the run in a major way.
// Cards stack, creating unique run identities.
//
// MVP: 5 cards. The full Major Arcana (22) is the eventual target.

import { safeLoadJSON, safeSaveJSON } from './storage.js?v=save1';

const KEY = 'ethera:tarot_seen:v1';

export const seenTarot = new Set();

export function loadSeenTarot() {
  const arr = safeLoadJSON(KEY, null, Array.isArray);
  if (arr) for (const id of arr) seenTarot.add(id);
}

function saveSeenTarot() {
  safeSaveJSON(KEY, [...seenTarot]);
}

// Card registry — each card has a numeric rank, name, flavor, and mechanical tag(s).
// Effects are applied by main.js via checking tarotActive flags.
export const TAROT = {
  the_sun: {
    id: 'the_sun',
    roman: 'XIX',
    name: 'THE SUN',
    flavor: 'a gift, freely given',
    desc: 'Start the run with a random rare relic',
    tint: '#ffd280',
    positive: true,
  },
  the_fool: {
    id: 'the_fool',
    roman: '0',
    name: 'THE FOOL',
    flavor: 'nothing to lose and nowhere to fall',
    desc: 'Begin with no weapon. The first combat room will grant one.',
    tint: '#a0e8ff',
    positive: false,
  },
  the_hermit: {
    id: 'the_hermit',
    roman: 'IX',
    name: 'THE HERMIT',
    flavor: 'a lantern in every hollow',
    desc: 'The Wanderer appears in every sanctuary',
    tint: '#c9a86a',
    positive: true,
  },
  death: {
    id: 'death',
    roman: 'XIII',
    name: 'DEATH',
    flavor: 'nothing is given; all is paid for',
    desc: 'All relic pedestals become altars (cost HP)',
    tint: '#d85a5a',
    positive: false,
  },
  the_hanged_man: {
    id: 'the_hanged_man',
    roman: 'XII',
    name: 'THE HANGED MAN',
    flavor: 'inverted, you see clearly',
    desc: '+30% damage, but lose 1 HP on every room entry',
    tint: '#b894e8',
    positive: false,
  },
  the_empress: {
    id: 'the_empress',
    roman: 'III',
    name: 'THE EMPRESS',
    flavor: 'gold pours where her light falls',
    desc: 'Enemies drop 2× gold, but hit 25% harder',
    tint: '#ffa0c8',
    positive: false,
  },
  the_star: {
    id: 'the_star',
    roman: 'XVII',
    name: 'THE STAR',
    flavor: 'a promise kept through every dark',
    desc: 'Every floor has an extra sanctuary',
    tint: '#a0e8ff',
    positive: true,
  },
  the_magician: {
    id: 'the_magician',
    roman: 'I',
    name: 'THE MAGICIAN',
    flavor: 'what two wield together, none wield alone',
    desc: 'Relic offers are 2× more likely to complete a fusion',
    tint: '#c8a0ff',
    positive: true,
  },
};

export const ALL_TAROT_IDS = Object.keys(TAROT);

// Active cards for the current run (empty when not a tarot run)
export const drawnCards = [];

export function clearTarot() {
  drawnCards.length = 0;
}

// Draw n unique random cards from the full deck
export function drawTarotHand(n = 3) {
  drawnCards.length = 0;
  const pool = [...ALL_TAROT_IDS];
  // Fisher-Yates shuffle
  for (let i = pool.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  for (let i = 0; i < Math.min(n, pool.length); i++) {
    const card = TAROT[pool[i]];
    drawnCards.push(card);
    if (!seenTarot.has(card.id)) {
      seenTarot.add(card.id);
      saveSeenTarot();
    }
  }
  return drawnCards;
}

// Query helpers — used across main.js/hero.js for effect hooks
export function hasCard(id) { return drawnCards.some(c => c.id === id); }
export function isTarotRun() { return drawnCards.length > 0; }
export function tarotCardCount() { return drawnCards.length; }
export function totalCards() { return ALL_TAROT_IDS.length; }
export function seenCount() { return seenTarot.size; }
