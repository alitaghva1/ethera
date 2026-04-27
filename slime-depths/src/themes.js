// Set-bonus themes — every relic is tagged with one theme. Owning 3 of a
// theme grants RESONANCE (tier 1); 5 grants ASCENDANCE (tier 2). Creates a
// BoI-style "I'm building into something" feel that's legible in the HUD
// + visible as a colored aura under the hero at ascendance.
//
// Buffs are delivered as bonus fields on the hero (hero.themeAtkSpdBonus,
// etc.) so they never stack or double-apply — recomputeThemeTiers() just
// reads current equipped relics and rewrites the bonus fields. Existing
// code paths read these bonuses as additive deltas on top of their normal
// relic math.
import { hero } from './hero.js';

// ---- Theme registry ------------------------------------------------------
//
// color: hex used for HUD chip, aura, and counter highlights.
// short: 3-char HUD glyph. kept text-only for font parity, no emoji.
// tint : slightly more saturated hex for the "lit" state of the chip.
export const THEMES = {
  storm: {
    id: 'storm', name: 'Storm',
    color: '#a0e8ff', tint: '#e0f6ff', short: 'STO',
    blurb: 'Lightning and momentum — shocks, speed, bolts.',
  },
  flame: {
    id: 'flame', name: 'Flame',
    color: '#ff9a50', tint: '#ffd6a0', short: 'FLA',
    blurb: 'Fire and burst — ignite, explode, kindle.',
  },
  blood: {
    id: 'blood', name: 'Blood',
    color: '#e06878', tint: '#ffb0b8', short: 'BLO',
    blurb: 'Lifesteal and killing — the more you kill, the stronger you become.',
  },
  vow: {
    id: 'vow', name: 'Vow',
    color: '#b0c0d8', tint: '#e0ecff', short: 'VOW',
    blurb: 'Discipline and steel — reduced damage, hardened body, resolute strikes.',
  },
  shadow: {
    id: 'shadow', name: 'Shadow',
    color: '#b890ff', tint: '#e8d8ff', short: 'SHA',
    blurb: 'Arcane and precise — crits, dodges, echoes that flank the enemy.',
  },
};

// Relic → theme. One theme per relic. Relics not listed here have no theme
// (e.g. gilded_hoard is pure utility).
export const RELIC_THEMES = {
  // STORM (8) — lightning, speed, shock, dash
  chain_lightning:      'storm',
  stormcaller:          'storm',
  thunder_step:         'storm',
  aegis_pulse:          'storm',
  swift_arm:            'storm',
  gale_step:            'storm',
  dash_master:          'storm',
  storm_conduit:        'storm',  // wand: bolt chains lightning to nearest

  // FLAME (8) — fire, explosion, burn, cascade
  pyromancer:           'flame',
  explosive_kill:       'flame',
  avatar_of_flame:      'flame',
  hymn_of_embers:       'flame',
  phoenix_cloak:        'flame',
  phoenix_tear:         'flame',
  cataclysm:            'flame',
  spore_bloom:          'flame',

  // BLOOD (11) — lifesteal, kill trigger, low-HP, regen
  bloodstone:           'blood',
  reaver:               'blood',
  vampiric_aura:        'blood',
  bloodrite:            'blood',
  marrow_pact:          'blood',
  soulreaver:           'blood',
  ethereal_binding:     'blood',
  executioner:          'blood',
  hourglass_of_respite: 'blood',
  vitality:             'blood',
  soul_burst:           'blood',

  // VOW (18) — defense, block, stance, stoic strikes, hammer earth + sword discipline
  iron_resolve:         'vow',
  ironhide:             'vow',
  oathshield:           'vow',
  bulwark:              'vow',
  second_wind:          'vow',
  iron_greaves:         'vow',
  mirror_shard:         'vow',
  counterstrike:        'vow',
  serrated_edge:        'vow',
  heavy_blow:           'vow',
  long_reach:           'vow',
  warlord:              'vow',
  honest_edge:          'vow',    // sword: finisher always crits — disciplined strikes
  ringing_steel:        'vow',    // sword: chain stacks — disciplined sustain
  vow_eternal:          'vow',    // sword: opening crit — literal vow
  mountain_strike:      'vow',    // hammer: earth shockwave — earthen discipline
  earthen_hold:         'vow',    // hammer: stagger — "stand still, the earth tells them"
  world_ender:          'vow',    // hammer: finisher shatters shields — disciplined finisher

  // SHADOW (13) — crit, arcane, dodge, echo, dagger precision + wand arcane
  keen_edge:            'shadow',
  eye_of_ether:         'shadow',
  echoing_strike:       'shadow',
  arcane_quiver:        'shadow',
  whisper_veil:         'shadow',
  wanderers_cloak:      'shadow',
  nimble_step:          'shadow',
  temporal_eye:         'shadow',
  twin_pulse:           'shadow',  // dagger: echo strike — precision arcane
  flicker_step:         'shadow',  // dagger: doubled dodge window
  razor_pace:           'shadow',  // dagger: 5th-hit crescendo — precision rhythm
  splintered_light:     'shadow',  // wand: bolt splits — arcane fan
  patient_lens:         'shadow',  // wand: charged crit — precision arcane

  // Unthemed: gilded_hoard — pure utility, intentionally excluded.
};

// Tier thresholds — 3 → resonance, 5 → ascendance.
export const TIER_THRESHOLDS = { resonance: 3, ascendance: 5 };

// Returns { storm, flame, blood, vow, shadow } count map.
export function getThemeCounts(equipped) {
  const counts = { storm: 0, flame: 0, blood: 0, vow: 0, shadow: 0 };
  for (const r of equipped) {
    const t = RELIC_THEMES[r.id];
    if (t && counts[t] !== undefined) counts[t]++;
  }
  return counts;
}

// Returns 0 (none), 1 (resonance), or 2 (ascendance) for a count.
export function getThemeTier(count) {
  if (count >= TIER_THRESHOLDS.ascendance) return 2;
  if (count >= TIER_THRESHOLDS.resonance) return 1;
  return 0;
}

// Returns { storm, flame, blood, vow, shadow } tier map.
export function getThemeTiers(equipped) {
  const counts = getThemeCounts(equipped);
  return {
    storm:  getThemeTier(counts.storm),
    flame:  getThemeTier(counts.flame),
    blood:  getThemeTier(counts.blood),
    vow:    getThemeTier(counts.vow),
    shadow: getThemeTier(counts.shadow),
  };
}

// Recompute theme bonus deltas on the hero. Must be called after every
// applyRelic + at run start (hero reset). Read ONLY, additive — never
// mutates core relic state.
//
// Bonus fields written (all default 0 if no tier active):
//   hero.themeAtkSpdBonus      — multiplier reduction, e.g. 0.10 = 10% faster
//   hero.themeDmgBonus         — multiplier addend, e.g. 0.15 = +15% dmg
//   hero.themeLifestealBonus   — flat lifesteal add, e.g. 0.05 = +5%
//   hero.themeDmgTakenReduction — mult reduction, e.g. 0.15 = -15% dmg taken
//   hero.themeCritBonus        — flat crit chance add, e.g. 0.10 = +10%
//   hero.themeCritMulBonus     — crit multiplier addend (shadow T2 only)
//
// hero.activeThemes: { storm, flame, blood, vow, shadow } tier map (also
// stored for rendering convenience).
export function recomputeThemeTiers(equipped) {
  const tiers = getThemeTiers(equipped);
  hero.activeThemes = tiers;

  // STORM — attack speed
  hero.themeAtkSpdBonus = tiers.storm >= 2 ? 0.25 : tiers.storm >= 1 ? 0.10 : 0;

  // FLAME — base damage
  hero.themeDmgBonus = tiers.flame >= 2 ? 0.20 : tiers.flame >= 1 ? 0.10 : 0;

  // BLOOD — lifesteal
  hero.themeLifestealBonus = tiers.blood >= 2 ? 0.07 : tiers.blood >= 1 ? 0.03 : 0;

  // VOW — damage taken reduction
  hero.themeDmgTakenReduction = tiers.vow >= 2 ? 0.20 : tiers.vow >= 1 ? 0.10 : 0;

  // SHADOW — crit chance + crit multiplier (T2 only)
  hero.themeCritBonus = tiers.shadow >= 2 ? 0.12 : tiers.shadow >= 1 ? 0.05 : 0;
  hero.themeCritMulBonus = tiers.shadow >= 2 ? 0.5 : 0;
}

// Visible ascendance aura — translucent colored ring under the hero for
// each theme at tier 2. Multiple themes stack as concentric tinted rings.
// Drawn in world space (inside camera transform). Tier-1 themes get a
// subtler single-color glow; tier-2 themes add an outer pulse.
export function drawThemeAura(ctx) {
  const tiers = hero.activeThemes;
  if (!tiers) return;
  const tier2Themes = [];
  const tier1Themes = [];
  for (const id of Object.keys(tiers)) {
    if (tiers[id] >= 2) tier2Themes.push(THEMES[id]);
    else if (tiers[id] >= 1) tier1Themes.push(THEMES[id]);
  }
  if (tier2Themes.length === 0 && tier1Themes.length === 0) return;
  const cx = hero.x;
  const cy = hero.y + 12;  // just below feet
  const t = performance.now() / 1000;

  // Tier-1 resonance — inner soft glow. Stack concentrically but keep it subtle.
  for (let i = 0; i < tier1Themes.length; i++) {
    const theme = tier1Themes[i];
    const pulse = 0.7 + 0.3 * Math.sin(t * 1.8 + i * 0.9);
    const r = 20 + i * 3;
    const g = ctx.createRadialGradient(cx, cy, 4, cx, cy, r);
    const hex = theme.color.replace('#', '');
    const n = parseInt(hex.length === 3 ? hex.split('').map(c => c + c).join('') : hex, 16);
    const R = (n >> 16) & 255, G = (n >> 8) & 255, B = n & 255;
    g.addColorStop(0, `rgba(${R},${G},${B},${(0.18 * pulse).toFixed(3)})`);
    g.addColorStop(1, `rgba(${R},${G},${B},0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Tier-2 ascendance — pulsing outer ring + ground circle per theme. Stacks
  // in concentric rings so multi-theme ascendance reads as a layered build.
  for (let i = 0; i < tier2Themes.length; i++) {
    const theme = tier2Themes[i];
    const baseR = 30 + i * 6;
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.5 + i * 1.2);
    const hex = theme.color.replace('#', '');
    const n = parseInt(hex.length === 3 ? hex.split('').map(c => c + c).join('') : hex, 16);
    const R = (n >> 16) & 255, G = (n >> 8) & 255, B = n & 255;
    // Soft ground fill
    const g = ctx.createRadialGradient(cx, cy, baseR * 0.3, cx, cy, baseR);
    g.addColorStop(0, `rgba(${R},${G},${B},${(0.22 * pulse).toFixed(3)})`);
    g.addColorStop(1, `rgba(${R},${G},${B},0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, baseR, 0, Math.PI * 2);
    ctx.fill();
    // Slow-rotating sigil ring — dashed outline rotating at half the pulse rate
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(t * 0.4 + i * 0.7);
    ctx.strokeStyle = `rgba(${R},${G},${B},${(0.35 + 0.2 * pulse).toFixed(3)})`;
    ctx.lineWidth = 1.2;
    ctx.setLineDash([5, 8]);
    ctx.beginPath();
    ctx.arc(0, 0, baseR * 0.85, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }
}

