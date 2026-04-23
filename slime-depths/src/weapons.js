// Weapons — distinct playstyles that share the Knight sprite. The sprite-swap
// would require new art; stats + slash VFX make them feel different at play.
export const WEAPONS = {
  sword: {
    id: 'sword',
    name: 'Sword',
    desc: 'Balanced reach and speed',
    flavor: 'The weapon of a hundred hands. None of them yours.',
    tint: '#e8d8b4',
    icon: 'relic_damage',
    damage: 32,                    // was 40 — enemies take 2-3 hits instead of 1-2
    reach: 72,
    arc: Math.PI * 0.75,
    cooldown: 0.42,                 // was 0.36 — more committed swings
    swingDur: 0.28,
    knockbackMul: 1.0,
    slashColor: 'rgba(255, 255, 255, ',
    slashWidth: 8,
    slashTrailCount: 3,
    swingRate: 1.1,
    heroFilter: null,
    shakeMul: 1.0,
    hitStopMul: 1.0,
  },
  dagger: {
    id: 'dagger',
    name: 'Twin Fang',
    desc: 'Fast, narrow arc — lower damage, quick combos',
    flavor: 'The blade does not ask. It decides, then asks forgiveness.',
    tint: '#a0e0ff',
    icon: 'relic_attack_speed',
    // BALANCE PASS (sim: dagger p50 DPS 153 vs sword 169 — strictly
    // worse with no mechanical compensation). Base dmg 18 → 22 closes
    // the raw-DPS gap; the dagger finisher bonus in hero.js keeps its
    // flowing-combo identity so it doesn't just become "sword lite."
    damage: 22,
    reach: 58,
    arc: Math.PI * 0.38,
    cooldown: 0.26,                 // was 0.22 — still faster than sword but more committed
    swingDur: 0.18,
    knockbackMul: 0.6,
    slashColor: 'rgba(180, 220, 255, ',
    slashWidth: 5,
    slashTrailCount: 2,
    swingRate: 1.45,
    heroFilter: 'hue-rotate(190deg) saturate(0.9) brightness(0.95)',
    shakeMul: 0.6,                  // light, snappy
    hitStopMul: 0.55,               // brief hit-stop keeps combos flowing
  },
  hammer: {
    id: 'hammer',
    name: 'Dreadmaul',
    desc: 'Heavy crushing swing — slow, wide, huge damage',
    flavor: 'A relic of the wars that ended the old world. It waits to end another.',
    tint: '#ffb265',
    icon: 'relic_max_hp',
    damage: 72,                     // was 88 — still huge but not one-shot
    reach: 92,
    arc: Math.PI * 1.0,
    cooldown: 0.68,                 // was 0.60 — heavier commit
    swingDur: 0.38,
    knockbackMul: 2.2,
    slashColor: 'rgba(255, 180, 100, ',
    slashWidth: 12,
    slashTrailCount: 4,
    swingRate: 0.75,
    heroFilter: 'hue-rotate(-20deg) saturate(1.2) brightness(1.05)',
    shakeMul: 1.55,                 // heavy impact
    hitStopMul: 1.5,                // long hit-stop makes every blow FEEL
  },
};

export const ALL_WEAPON_IDS = Object.keys(WEAPONS);

// Default available weapon — sword. Others unlock via meta.
export const BASE_WEAPONS = ['sword'];

// Weapon unlocks are persistent via meta.js. Pricing designed so you'd
// probably unlock dagger first (cheaper) then hammer.
export const WEAPON_UNLOCKS = {
  dagger: { cost: 50, metaId: 'weapon_dagger' },
  hammer: { cost: 75, metaId: 'weapon_hammer' },
};
