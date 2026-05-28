// ============================================================================
// XP SYSTEM — Vampire-Survivors-style XP gems + level-ups.
//
// Enemies drop XP gems on death (sized by enemy tier). Gems within
// VACUUM_RADIUS pull toward the hero with accelerating speed; on touch,
// XP is added. Crossing a level threshold fires the onLevelUp callback
// (caller opens the level-up modal).
//
// Hero state added (initialized lazily on first use):
//   hero.level     — current level (starts at 1)
//   hero.xp        — XP toward next level (resets to 0 on level-up)
//   hero.pickupMul — XP pickup radius multiplier (default 1.0)
//
// XP curve: thresholds[n-1] is the XP needed to GO FROM level n TO n+1.
// Designed so a 5-zone run (~50-75 enemy kills) lands the player around
// level 10-12.
// ============================================================================

import { hero } from './hero.js';

// XP per gem tier. Tiers chosen by enemy type (see _xpForType below).
export const GEM_TIERS = {
  small:  { xp: 1, color: '#7ad8ff', size: 2.2 },
  medium: { xp: 3, color: '#a890ff', size: 3.0 },
  large:  { xp: 8, color: '#ffc070', size: 3.6 },
};

// Per-level XP requirement. Slow ramp early so first 2-3 levels feel
// fast, harder ramp late so floor 4-5 levels feel earned.
//   L1→2: 5,  L2→3: 10,  L3→4: 18,  L4→5: 28,  L5→6: 42,  L6→7: 60,
//   L7→8: 82, L8→9: 110, L9→10: 145, then +50 per level after.
const XP_THRESHOLDS = [5, 10, 18, 28, 42, 60, 82, 110, 145];
function _xpToNext(level) {
  if (level - 1 < XP_THRESHOLDS.length) return XP_THRESHOLDS[level - 1];
  return 145 + (level - XP_THRESHOLDS.length) * 50;
}

const VACUUM_RADIUS_BASE = 90;            // px — auto-pull threshold
const VACUUM_PICKUP_RADIUS = 14;          // px — close enough = collected
const VACUUM_SPEED_NEAR = 480;            // px/s — peak pull speed at touch range
const VACUUM_SPEED_FAR  = 80;             // px/s — pull speed at radius edge

const _gems = [];                          // active gems in world
let _onLevelUp = null;                     // caller-set callback

/** Initialize hero XP fields if not present. Idempotent. */
function _ensureHeroXp() {
  if (typeof hero.level !== 'number') hero.level = 1;
  if (typeof hero.xp !== 'number') hero.xp = 0;
  if (typeof hero.pickupMul !== 'number') hero.pickupMul = 1.0;
  if (typeof hero.xpMul !== 'number') hero.xpMul = 1.0;
}

/** Reset on run start / death. */
export function resetXp() {
  _gems.length = 0;
  hero.level = 1;
  hero.xp = 0;
  hero.pickupMul = 1.0;
  hero.xpMul = 1.0;
}

/** Register the level-up callback. Caller pauses + shows modal. */
export function setOnLevelUp(fn) { _onLevelUp = fn; }

/** Drop a gem at world (x, y). Tier auto-picked from enemy `type`. */
export function dropXpGemFromEnemy(enemy) {
  if (!enemy || enemy.type === undefined) return;
  const tier = _xpForType(enemy);
  _gems.push({
    x: enemy.x,
    y: enemy.y - 4,                       // visually slightly above ground
    vx: (Math.random() - 0.5) * 60,       // small initial pop
    vy: -80 - Math.random() * 40,
    age: 0,
    settled: false,                       // pop arc completes after 0.4s
    tier,
  });
}

/** Manual drop — used by boss-death cascade and debug. */
export function dropXpGem(x, y, tierKey = 'medium') {
  _gems.push({
    x, y,
    vx: (Math.random() - 0.5) * 60,
    vy: -80 - Math.random() * 40,
    age: 0,
    settled: false,
    tier: GEM_TIERS[tierKey] || GEM_TIERS.medium,
  });
}

/**
 * Pick gem tier based on enemy type. Mapping is rough; can be tuned per
 * design pass (or moved to a per-type config table later).
 */
function _xpForType(enemy) {
  const t = enemy.type;
  // Bosses → 1 large gem. Boss-burst is handled separately by dropBossXpBurst.
  if (t === 'orc' || t === 'bone_captain' || t === 'broodmother' || t === 'ember_tyrant') {
    return GEM_TIERS.large;
  }
  // Elites / champions
  if (enemy.elite || t === 'vanguard' || t === 'wizard') return GEM_TIERS.medium;
  // Default trash mob
  return GEM_TIERS.small;
}

/**
 * Boss-kill XP burst — drops a fan of large gems at the boss's location.
 * Caller picks how many gems (e.g., 8 for floor 1 boss, 12 for final).
 */
export function dropBossXpBurst(x, y, count = 10) {
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    _gems.push({
      x, y,
      vx: Math.cos(a) * (120 + Math.random() * 40),
      vy: Math.sin(a) * (120 + Math.random() * 40) - 80,
      age: 0,
      settled: false,
      tier: GEM_TIERS.large,
    });
  }
}

export function updateXp(dt, heroX, heroY) {
  _ensureHeroXp();
  const vacuumR = VACUUM_RADIUS_BASE * (hero.pickupMul || 1);
  const vacuumR2 = vacuumR * vacuumR;
  const pickupR2 = VACUUM_PICKUP_RADIUS * VACUUM_PICKUP_RADIUS;

  for (let i = _gems.length - 1; i >= 0; i--) {
    const g = _gems[i];
    g.age += dt;

    if (!g.settled) {
      // Pop arc — gravity-pulled bounce for ~0.4s.
      g.vy += 360 * dt;
      g.x += g.vx * dt;
      g.y += g.vy * dt;
      g.vx *= Math.pow(0.001, dt);
      if (g.age >= 0.4) {
        g.settled = true;
        g.vx = 0;
        g.vy = 0;
      }
      continue;
    }

    // Settled: vacuum check.
    const dx = heroX - g.x;
    const dy = heroY - g.y;
    const d2 = dx * dx + dy * dy;
    if (d2 <= pickupR2) {
      _grantXp(g.tier.xp);
      _gems.splice(i, 1);
      continue;
    }
    if (d2 <= vacuumR2) {
      const d = Math.sqrt(d2) || 1;
      // Speed ramps from FAR (at radius edge) to NEAR (at touch range).
      const t = 1 - d / vacuumR;             // 0 at edge, 1 at touch
      const speed = VACUUM_SPEED_FAR + (VACUUM_SPEED_NEAR - VACUUM_SPEED_FAR) * (t * t);
      g.x += (dx / d) * speed * dt;
      g.y += (dy / d) * speed * dt;
    }
  }
}

function _grantXp(amount) {
  _ensureHeroXp();
  const xp = amount * (hero.xpMul || 1);
  hero.xp += xp;
  // Multiple level-ups in one tick (rare, e.g. boss burst at low level).
  while (hero.xp >= _xpToNext(hero.level)) {
    hero.xp -= _xpToNext(hero.level);
    hero.level += 1;
    if (_onLevelUp) {
      try { _onLevelUp(hero.level); } catch (e) { console.warn('xp onLevelUp threw', e); }
    }
  }
}

export function drawXpGems(ctx) {
  if (_gems.length === 0) return;
  ctx.save();
  for (const g of _gems) {
    // Soft additive halo
    const halo = ctx.createRadialGradient(g.x, g.y, 0, g.x, g.y, g.tier.size * 4);
    halo.addColorStop(0, g.tier.color + '');
    halo.addColorStop(0.5, g.tier.color + '88');
    halo.addColorStop(1, g.tier.color + '00');
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(g.x, g.y, g.tier.size * 4, 0, Math.PI * 2);
    ctx.fill();
    // Bright core
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = g.tier.color;
    ctx.beginPath();
    ctx.arc(g.x, g.y, g.tier.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Top-of-HUD XP bar. Call in screen space, after the world transform.
 *
 * Phase 5 layout — bar is left-of-center and ends BEFORE the legacy
 * floor panel (top-right, w≈220 from main.js drawHud). Specifically:
 *   left edge:  padX = 16
 *   right edge: viewW - 240 (leave 240 px clearance for floor panel)
 *   max width:  500 (don't span huge ultrawide canvases)
 * The level label sits centered above the bar. The full zone HUD
 * (zone name + wave dots) sits below.
 */
export function drawXpBar(ctx, viewW) {
  _ensureHeroXp();
  const next = _xpToNext(hero.level);
  const t = Math.max(0, Math.min(1, hero.xp / next));
  const padX = 16;
  const rightReserve = 240;            // floor panel clearance
  const y = 6;
  const maxW = 500;
  const availW = Math.max(120, viewW - padX - rightReserve);
  const w = Math.min(maxW, availW);
  const h = 8;

  ctx.save();
  // Track
  ctx.fillStyle = 'rgba(20, 14, 28, 0.85)';
  ctx.fillRect(padX, y, w, h);
  // Fill
  const fillW = Math.round(w * t);
  const grad = ctx.createLinearGradient(padX, 0, padX + w, 0);
  grad.addColorStop(0, '#7ad8ff');
  grad.addColorStop(0.5, '#a890ff');
  grad.addColorStop(1, '#ffc070');
  ctx.fillStyle = grad;
  ctx.fillRect(padX, y, fillW, h);
  // Border
  ctx.strokeStyle = 'rgba(255, 230, 180, 0.4)';
  ctx.lineWidth = 1;
  ctx.strokeRect(padX + 0.5, y + 0.5, w - 1, h - 1);
  // Level label — drawn at the right end of the bar so the zoneHud's
  // zone name + wave dots (centered on viewport) doesn't collide.
  ctx.fillStyle = '#f4d9a0';
  ctx.font = 'bold 10px Georgia,serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText(`L${hero.level}`, padX + w - 4, y + h / 2);
  ctx.restore();
}

export function getXpDebug() {
  _ensureHeroXp();
  return { level: hero.level, xp: hero.xp, next: _xpToNext(hero.level), gems: _gems.length };
}

export function clearXpGems() { _gems.length = 0; }
