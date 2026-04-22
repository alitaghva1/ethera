// Persistent meta-progression — essence currency + permanent unlocks.
// Saves to localStorage so runs build on each other.

const STORAGE_KEY = 'slimeDepths:meta:v1';

export const meta = {
  essence: 0,
  unlocked: {},
  // Smith's heirloom — a single relic ID banked by paying essence at the
  // Smith's forge. Consumed on the next run's start (auto-equipped, then
  // cleared). Null when nothing is banked.
  heirloom: null,
};

export const UNLOCKS = {
  vitality_charm: {
    id: 'vitality_charm',
    name: 'Vitality Charm',
    desc: '+3 max HP at run start',
    flavor: 'A lock of hair from one who refused to die.',
    cost: 25,
    tint: '#ff9ab4',
    icon: 'relic_max_hp',
  },
  steeled_resolve: {
    id: 'steeled_resolve',
    name: 'Steeled Resolve',
    desc: 'Take 15% less damage from all sources',
    flavor: 'What cannot be broken was never made of flesh.',
    cost: 55,
    tint: '#a0d8ff',
    icon: 'relic_max_hp',
  },
  sharpened_edge: {
    id: 'sharpened_edge',
    name: 'Sharpened Edge',
    desc: '+10% damage at run start',
    flavor: 'The grindstone sings. The blade remembers.',
    cost: 40,
    tint: '#ff8a60',
    icon: 'relic_damage',
  },
  swift_boots: {
    id: 'swift_boots',
    name: 'Swift Boots',
    desc: 'Dodge cooldown reduced by 20%',
    flavor: 'The dead cannot catch what will not stand still.',
    cost: 35,
    tint: '#a0e8c8',
    icon: 'relic_dodge',
  },
  purse_of_depths: {
    id: 'purse_of_depths',
    name: 'Purse of Depths',
    desc: 'Start each run with 50 gold',
    flavor: 'You left this behind, last time. The ruin kept it safe.',
    cost: 30,
    tint: '#ffd68a',
    icon: 'relic_lifesteal',
  },
  blessed_greaves: {
    id: 'blessed_greaves',
    name: 'Blessed Greaves',
    desc: 'Begin with Iron Greaves relic',
    flavor: 'A gift from a stranger who did not live to give it.',
    cost: 45,
    tint: '#9bd8ff',
    icon: 'relic_speed',
  },
  ancient_pact: {
    id: 'ancient_pact',
    name: 'Ancient Pact',
    desc: 'Begin with a random relic',
    flavor: 'The ruin offers. You do not ask what it wants in return.',
    cost: 70,
    tint: '#b49aff',
    icon: 'relic_phoenix',
  },
  weapon_dagger: {
    id: 'weapon_dagger',
    name: 'Twin Fang',
    desc: 'Unlock dagger — fast, narrow swings',
    flavor: 'Two blades. One heart. Neither forgives.',
    cost: 50,
    tint: '#a0e0ff',
    icon: 'relic_attack_speed',
  },
  weapon_hammer: {
    id: 'weapon_hammer',
    name: 'Dreadmaul',
    desc: 'Unlock hammer — slow, wide, brutal',
    flavor: 'It does not sever. It ends.',
    cost: 75,
    tint: '#ffb265',
    icon: 'relic_max_hp',
  },
};

export function loadMeta() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    meta.essence = data.essence | 0;
    meta.unlocked = data.unlocked || {};
    meta.heirloom = data.heirloom || null;
  } catch (e) {
    console.warn('meta load failed', e);
  }
}

export function saveMeta() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      essence: meta.essence,
      unlocked: meta.unlocked,
      heirloom: meta.heirloom,
    }));
  } catch (e) {
    console.warn('meta save failed', e);
  }
}

// Smith's reforge: bank a relic by id, deducting essence. Returns true on
// success. Overwrites any previously-banked heirloom.
export function bankHeirloom(relicId, cost) {
  if (meta.essence < cost) return false;
  meta.essence -= cost;
  meta.heirloom = relicId;
  saveMeta();
  return true;
}

// Called by main.js on run start — returns the banked heirloom id (if any)
// and clears it. The caller is responsible for applying the relic.
export function consumeHeirloom() {
  const id = meta.heirloom;
  meta.heirloom = null;
  saveMeta();
  return id;
}

export function addEssence(amount) {
  meta.essence += (amount | 0);
  saveMeta();
}

export function purchaseUnlock(id) {
  const def = UNLOCKS[id];
  if (!def) return false;
  if (meta.unlocked[id]) return false;
  if (meta.essence < def.cost) return false;
  meta.essence -= def.cost;
  meta.unlocked[id] = true;
  saveMeta();
  return true;
}

export function hasUnlock(id) {
  return !!meta.unlocked[id];
}
