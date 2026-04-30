// ============================================================================
// PER-ABILITY-SLOT RESONANCE — wizard-kit Sprint 3B
//
// Each relic carries an `affects: [...]` tag (Sprint 3A audit). Owning N
// relics in a slot grants RESONANCE (T1, n>=3) or ASCENDANCE (T2, n>=5).
// Bonuses target that specific ability mechanically — they're additive on
// top of existing relic effects + theme bonuses, never replacements.
//
// Relationship to themes.js:
//   - Themes (STORM/FLAME/BLOOD/VOW/SHADOW) give UNIVERSAL stat sticks
//     (atk speed, dmg, lifesteal, dmg-taken-mul, crit). Apply regardless
//     of which weapon is active.
//   - Slots (sword/blast/shield) give ABILITY-SPECIFIC bonuses. Apply
//     only when that ability fires.
//
// Both stack additively. A "blast + storm" build gets BOTH the slot's
// bolt-cadence-down + the theme's atk-speed-up.
//
// 'mobility' slot is reserved for Sprint 3C+ (Q dash strike / blink
// already have CD baked in; the slot is too sparse with current relic
// pool to earn its own resonance line yet).
//
// 'any' tags do NOT push any specific slot's count — universal relics
// (HP, regen, economy) buff the player generally and shouldn't make a
// pure-economy build ascend the sword slot.
// ============================================================================
import { hero } from './hero.js';

export const SLOT_THRESHOLDS = { resonance: 3, ascendance: 5 };

// Slot registry — color + display metadata. Used by the HUD chip strip.
export const SLOTS = {
  sword: {
    id: 'sword',
    name: 'Sword',
    color: '#ffd680',
    short: 'SWO',
    blurb: 'Melee swings + close-up commitments.',
  },
  blast: {
    id: 'blast',
    name: 'Blast',
    color: '#a0e8ff',
    short: 'BLA',
    blurb: 'Ranged bolts + chain casts.',
  },
  shield: {
    id: 'shield',
    name: 'Shield',
    color: '#b0c8d8',
    short: 'SHI',
    blurb: 'Defensive cast + perfect-block timing.',
  },
};

// Returns { sword, blast, shield } count map. 'any' relics are excluded —
// they're universal and don't push any specific slot's resonance.
//
// Multi-slot relics (e.g. ['sword', 'blast']) count for ALL their slots —
// a single Serrated Edge contributes to BOTH sword AND blast resonance,
// matching its "buffs both attacks" mechanical reality. This means a 3-relic
// build of all multi-slot picks could hit both sword T1 and blast T1
// simultaneously, which is the intended "balanced kit" reward.
export function getSlotCounts(equipped) {
  const counts = { sword: 0, blast: 0, shield: 0 };
  for (const r of equipped) {
    const tags = r && r.affects;
    if (!tags || !tags.length) continue;
    for (const t of tags) {
      if (t === 'any') continue;
      if (counts[t] !== undefined) counts[t]++;
    }
  }
  return counts;
}

// 0 = none, 1 = resonance (3+), 2 = ascendance (5+)
export function getSlotTier(count) {
  if (count >= SLOT_THRESHOLDS.ascendance) return 2;
  if (count >= SLOT_THRESHOLDS.resonance) return 1;
  return 0;
}

// Returns { sword, blast, shield } tier map.
export function getSlotTiers(equipped) {
  const counts = getSlotCounts(equipped);
  return {
    sword: getSlotTier(counts.sword),
    blast: getSlotTier(counts.blast),
    shield: getSlotTier(counts.shield),
  };
}

// Recompute slot bonuses on the hero. Called from applyRelic + resetRelics
// alongside recomputeThemeTiers. Read-only / additive — never replaces
// core relic state.
//
// Bonus fields written (all default 0/false if no tier active):
//   hero.slotSwordHitStopBonus     — extra hit-stop on sword swings (sec)
//   hero.slotSwordEmpowered        — bool, T2: every 3rd swing AoE-spark + extra knockback
//   hero.slotBoltCDMul             — multiplier on blastBoltCD (0.85 at T1)
//   hero.slotBoltPierceBonus       — pierce bonus on blast bolts (0/1)
//   hero.slotShieldPerfectBonus    — extra perfect-block window (sec)
//   hero.slotShieldConeBonus       — extra front-cone arc (rad, +20° at T2)
//
// hero.slotTiers: { sword, blast, shield } tier map (also stored for HUD).
//
// hero.slotCounts: raw count map — HUD reads this for the chip progress bars.
export function recomputeSlotTiers(equipped) {
  const counts = getSlotCounts(equipped);
  const tiers = {
    sword: getSlotTier(counts.sword),
    blast: getSlotTier(counts.blast),
    shield: getSlotTier(counts.shield),
  };
  hero.slotTiers = tiers;
  hero.slotCounts = counts;

  // SWORD ── melee combo amplifiers
  // T1 (3): +0.05s extended hit-stop on sword swings — adds "weight" feel
  //          without raising raw damage.
  // T2 (5): every 3rd sword swing (the existing finisher beat) gets a free
  //          +50% knockback + spark burst around the impact point. The
  //          hero handler reads slotSwordEmpowered + the existing
  //          swingIndex===2 branch to layer this on top of weapon-specific
  //          finisher visuals.
  hero.slotSwordHitStopBonus = tiers.sword >= 1 ? 0.05 : 0;
  hero.slotSwordEmpowered = tiers.sword >= 2;

  // BLAST ── ranged scaling
  // T1 (3): blast bolt cadence × 0.85 (0.28s → ~0.24s). Same multiplier
  //          shape as theme atk-speed bonuses.
  // T2 (5): each tap-fire bolt pierces 1 extra enemy. Reads as "your
  //          bolts are now meaningful AoE."
  hero.slotBoltCDMul = tiers.blast >= 1 ? 0.85 : 1;
  hero.slotBoltPierceBonus = tiers.blast >= 2 ? 1 : 0;

  // SHIELD ── defensive timing + reach
  // T1 (3): perfect-block window +0.05s (0.10s → 0.15s) — more forgiving
  //          counter timing.
  // T2 (5): front cone widens by +20° (180° → ~220°). Captures hits from
  //          slightly behind the front line, rewarding defensive builds.
  hero.slotShieldPerfectBonus = tiers.shield >= 1 ? 0.05 : 0;
  hero.slotShieldConeBonus = tiers.shield >= 2 ? Math.PI / 9 : 0;
}
