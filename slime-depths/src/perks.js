// ============================================================================
// PERKS — run-only stackable upgrades chosen from the level-up modal.
//
// Distinct from RELICS (the existing big-deal pickups from chests / bosses).
// Perks are deliberately SMALL: each one nudges a single hero stat by 8-15%
// or grants a tiny conditional. Stack many over a run = noticeable build.
//
// Schema:
//   id          — stable string for save / dedup
//   name        — display name
//   desc        — one-line tooltip
//   tier        — common (lvl 1+) | rare (lvl 4+) | epic (lvl 8+)
//   icon        — 1-char glyph for the card (placeholder for art)
//   color       — accent color for the card
//   maxStacks   — how many times this perk can roll
//   apply(hero) — mutates hero stats; called once per stack
//   stacks      — runtime field (current stack count; not in def)
//
// To add a perk: append a row. Tier filtering on roll keeps early levels
// from being flooded with epic options.
// ============================================================================

import { hero } from './hero.js';

export const PERKS = [
  // ── COMMON (available level 1+) ─────────────────────────────────────
  {
    id: 'sharp_edge',
    name: 'SHARP EDGE',
    desc: '+12% damage',
    tier: 'common',
    icon: '⚔',
    color: '#e85a5a',
    maxStacks: 5,
    minLevel: 1,
    apply: (h) => { h.damageMul = (h.damageMul || 1) * 1.12; },
  },
  {
    id: 'hardy',
    name: 'HARDY',
    desc: '+15 max HP, fully heal',
    tier: 'common',
    icon: '♥',
    color: '#7adc8a',
    maxStacks: 5,
    minLevel: 1,
    apply: (h) => {
      h.maxHp = (h.maxHp || 8) + 15;
      h.hp = h.maxHp;
    },
  },
  {
    id: 'quick_step',
    name: 'QUICK STEP',
    desc: '+10% movement speed',
    tier: 'common',
    icon: '➤',
    color: '#7adcff',
    maxStacks: 3,
    minLevel: 1,
    apply: (h) => { h.speedMul = (h.speedMul || 1) * 1.10; },
  },
  {
    id: 'flurry',
    name: 'FLURRY',
    desc: '+12% attack speed',
    tier: 'common',
    icon: '✦',
    color: '#ffd680',
    maxStacks: 4,
    minLevel: 1,
    apply: (h) => { h.attackCooldownMul = (h.attackCooldownMul || 1) * 0.89; },
  },
  {
    id: 'critical_aim',
    name: 'CRITICAL AIM',
    desc: '+5% crit chance',
    tier: 'common',
    icon: '◆',
    color: '#ff90c0',
    maxStacks: 4,
    minLevel: 1,
    apply: (h) => { h.critChance = (h.critChance || 0) + 0.05; },
  },
  {
    id: 'magnetism',
    name: 'MAGNETISM',
    desc: '+50% XP & gold pickup radius',
    tier: 'common',
    icon: '◯',
    color: '#a890ff',
    maxStacks: 3,
    minLevel: 1,
    apply: (h) => {
      h.pickupMul = (h.pickupMul || 1) * 1.5;
      h.goldMagnetMul = (h.goldMagnetMul || 1) * 1.5;
    },
  },
  {
    id: 'greed',
    name: 'GREED',
    desc: '+25% gold gained',
    tier: 'common',
    icon: '⬢',
    color: '#ffcc40',
    maxStacks: 3,
    minLevel: 1,
    apply: (h) => { h.goldMul = (h.goldMul || 1) * 1.25; },
  },
  {
    id: 'fast_learner',
    name: 'FAST LEARNER',
    desc: '+15% XP gained',
    tier: 'common',
    icon: '※',
    color: '#80e8a0',
    maxStacks: 3,
    minLevel: 2,
    apply: (h) => { h.xpMul = (h.xpMul || 1) * 1.15; },
  },

  // ── RARE (level 4+) ──────────────────────────────────────────────────
  {
    id: 'crushing_blow',
    name: 'CRUSHING BLOW',
    desc: '+25% crit damage',
    tier: 'rare',
    icon: '✜',
    color: '#ff7a40',
    maxStacks: 3,
    minLevel: 4,
    apply: (h) => { h.critMul = (h.critMul || 2) + 0.25; },
  },
  {
    id: 'restoration',
    name: 'RESTORATION',
    desc: 'regen 1 HP per second',
    tier: 'rare',
    icon: '+',
    color: '#90ffa0',
    maxStacks: 3,
    minLevel: 4,
    apply: (h) => { h.regenRate = (h.regenRate || 0) + 1; },
  },
  {
    id: 'vampire',
    name: 'VAMPIRE',
    desc: '+5% lifesteal',
    tier: 'rare',
    icon: '♦',
    color: '#cc4060',
    maxStacks: 3,
    minLevel: 4,
    apply: (h) => { h.lifesteal = (h.lifesteal || 0) + 0.05; },
  },
  {
    id: 'bulwark',
    name: 'BULWARK',
    desc: '+10% damage reduction',
    tier: 'rare',
    icon: '◈',
    color: '#80a0e0',
    maxStacks: 3,
    minLevel: 4,
    apply: (h) => {
      h.damageTakenMul = (h.damageTakenMul || 1) * 0.90;
    },
  },

  // ── EPIC (level 8+) ──────────────────────────────────────────────────
  {
    id: 'adrenaline',
    name: 'ADRENALINE',
    desc: '+30% damage when below 50% HP',
    tier: 'epic',
    icon: '⚡',
    color: '#e8a040',
    maxStacks: 1,
    minLevel: 8,
    apply: (h) => { h.adrenalineActive = true; },
  },
  {
    id: 'second_breath',
    name: 'SECOND BREATH',
    desc: 'heal 12 HP on level-up',
    tier: 'epic',
    icon: '✿',
    color: '#a8ff90',
    maxStacks: 1,
    minLevel: 6,
    apply: (h) => { h.healOnLevel = (h.healOnLevel || 0) + 12; },
  },
];

// ── Run state ────────────────────────────────────────────────────────────

const _stackCounts = new Map();    // perk.id → current stack count

export function resetPerks() {
  _stackCounts.clear();
}

export function getPerkStacks(id) {
  return _stackCounts.get(id) || 0;
}

/** Rolls 3 distinct perks the player is eligible for. */
export function rollPerkChoices(level, count = 3) {
  const eligible = PERKS.filter((p) => {
    if ((p.minLevel || 1) > level) return false;
    if (getPerkStacks(p.id) >= p.maxStacks) return false;
    return true;
  });
  // Tier weighting — rare gets a boost as level rises; epic at level 8+.
  const weighted = eligible.map((p) => {
    let w = 100;
    if (p.tier === 'rare') w = level >= 4 ? 60 : 0;
    if (p.tier === 'epic') w = level >= 8 ? 35 : 0;
    return { p, w };
  }).filter(({ w }) => w > 0);

  const out = [];
  const used = new Set();
  for (let n = 0; n < count && weighted.length > 0; n++) {
    let total = 0;
    for (const it of weighted) if (!used.has(it.p.id)) total += it.w;
    if (total <= 0) break;
    let r = Math.random() * total;
    for (const it of weighted) {
      if (used.has(it.p.id)) continue;
      r -= it.w;
      if (r <= 0) {
        out.push(it.p);
        used.add(it.p.id);
        break;
      }
    }
  }
  return out;
}

/** Apply a chosen perk: increment stack + run apply(). */
export function pickPerk(perk) {
  if (!perk) return;
  perk.apply(hero);
  _stackCounts.set(perk.id, (_stackCounts.get(perk.id) || 0) + 1);
  // Heal-on-level-up perk fires once per level-up after the perk is picked.
  if (typeof hero.healOnLevel === 'number' && hero.healOnLevel > 0) {
    hero.hp = Math.min(hero.maxHp || hero.hp, (hero.hp || 0) + hero.healOnLevel);
  }
}

export function getActivePerksDebug() {
  const out = [];
  for (const [id, count] of _stackCounts) {
    out.push({ id, stacks: count });
  }
  return out;
}

/**
 * Phase 7 polish (audit U5) — draw a horizontal strip of small chips
 * showing every perk the player has stacked + its stack count. Without
 * this, the HUD had no on-screen reminder of what the player picked
 * across N level-ups; perks vanished into hero stats with no recap.
 *
 * Renders left-aligned at the top of screen, just below the XP bar.
 * Each chip: 22 px square, tier-colored 1-px border, perk icon glyph
 * centered, stack count "×N" in the bottom-right corner. Inactive
 * (zero-stack) perks are skipped.
 *
 * Call in screen space, AFTER the world transform is restored. Skip
 * call when zone runner is idle.
 */
export function drawPerkChipStrip(ctx, viewX, viewY) {
  if (_stackCounts.size === 0) return;
  const CHIP_W = 22;
  const CHIP_GAP = 4;
  const ICON_SIZE = 12;
  let cx = viewX;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // PERKS is the canonical order; iterate in insertion order so chips
  // appear left-to-right in the order the player picked them.
  for (const [id, count] of _stackCounts) {
    const def = PERKS.find((p) => p.id === id);
    if (!def) continue;
    // Background — dark plate with tier-colored border.
    ctx.fillStyle = 'rgba(20, 14, 28, 0.85)';
    ctx.fillRect(cx, viewY, CHIP_W, CHIP_W);
    ctx.strokeStyle = def.color || '#f4d9a0';
    ctx.lineWidth = 1;
    ctx.strokeRect(cx + 0.5, viewY + 0.5, CHIP_W - 1, CHIP_W - 1);
    // Tier accent at top edge (1 px stripe).
    ctx.fillStyle = def.color || '#f4d9a0';
    ctx.fillRect(cx, viewY, CHIP_W, 1);
    // Icon glyph centered.
    ctx.fillStyle = def.color || '#f4d9a0';
    ctx.font = `bold ${ICON_SIZE}px Georgia,serif`;
    ctx.fillText(def.icon || '·', cx + CHIP_W / 2, viewY + CHIP_W / 2);
    // Stack count in bottom-right (skip ×1 — only show stacks ≥2).
    if (count > 1) {
      ctx.fillStyle = '#f4e8c8';
      ctx.font = 'bold 9px Georgia,serif';
      ctx.textAlign = 'right';
      ctx.fillText(`×${count}`, cx + CHIP_W - 2, viewY + CHIP_W - 4);
      ctx.textAlign = 'center';
    }
    cx += CHIP_W + CHIP_GAP;
  }
  ctx.restore();
}
