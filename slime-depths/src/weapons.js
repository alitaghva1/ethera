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
  // ── WAND — first ranged weapon class ────────────────────────────────
  // Trades melee reach + per-hit damage for safety + range. The mage
  // class fantasy fits naturally; bolts carry the hero's intent across
  // the room while the sword/dagger/hammer commit to a single arc.
  //
  // Flagged `ranged: true` so hero.js's attack handler branches to a
  // friendly-projectile spawn (see projectiles.js spawnHeroBolt) instead
  // of the arc-swing hitbox path. Most arc-shaped fields (reach, arc,
  // slashWidth, slashTrailCount) are unused for ranged weapons but kept
  // populated so consumers that read them don't NaN — they just don't
  // render anything when ranged is true.
  //
  // Balance vs sword (32 dmg @ 0.42 cd ≈ 76 dps): wand sits at ~44 dps
  // (16 dmg @ 0.36 cd) — about 58% of sword DPS. The remaining 42% is
  // paid by the player choosing to engage from outside enemy reach.
  wand: {
    id: 'wand',
    name: 'Arcane Wand',
    desc: 'Ranged bolts — trade reach for safety',
    flavor: 'The teacher kept this. The teaching ended without her.',
    tint: '#c0a0ff',
    icon: 'relic_attack_speed',
    ranged: true,
    damage: 16,
    cooldown: 0.36,
    swingDur: 0.20,
    // Ranged-specific tuning. Bolt travels at 600 px/s for 1.0s — max
    // effective range ~600px, which is wider than most combat rooms
    // (640px wide × 480px tall) so you can clip enemies from the
    // opposite end of the room.
    boltSpeed: 600,
    boltLife: 1.0,
    boltRadius: 7,
    // Arc-shaped fields kept populated but unused for ranged weapons:
    reach: 0,
    arc: 0,
    knockbackMul: 0.4,
    slashColor: 'rgba(192, 160, 255, ',
    slashWidth: 0,
    slashTrailCount: 0,
    swingRate: 1.0,
    heroFilter: 'hue-rotate(60deg) saturate(1.05) brightness(1.05)',
    shakeMul: 0.35,                 // light cast snap, not heavy impact
    hitStopMul: 0.30,               // brief stop on hit so combos still flow
  },
};

export const ALL_WEAPON_IDS = Object.keys(WEAPONS);

// Default available weapon — sword. Others unlock via meta.
export const BASE_WEAPONS = ['sword'];

// Weapon unlocks are persistent via meta.js. Pricing designed so you'd
// probably unlock dagger first (cheaper) then hammer, with the wand
// sitting in between as the "different axis entirely" option.
export const WEAPON_UNLOCKS = {
  dagger: { cost: 50, metaId: 'weapon_dagger' },
  wand:   { cost: 65, metaId: 'weapon_wand' },
  hammer: { cost: 75, metaId: 'weapon_hammer' },
};
