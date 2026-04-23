// Synergy VFX + state — all the spectacle when effect-relics fire.
// Lives separately so relics.js stays just the registry and triggers.

import { enemies } from './enemies.js';
import { hero, damageHero } from './hero.js';
import { shakeCamera } from './camera.js';
import { playSfx } from './sfx.js';
import { hitSpark, deathBurst } from './particles.js';
import { spawnDamageNumber, triggerHitStop } from './fx.js';

// ======================================================================
// CHAIN LIGHTNING — cyan zigzag arc between two enemies
// ======================================================================
const lightningArcs = [];     // { from:{x,y}, to:{x,y}, life, maxLife }
export function spawnLightningArc(fromX, fromY, toX, toY) {
  lightningArcs.push({ fromX, fromY, toX, toY, life: 0.25, maxLife: 0.25 });
}

// ======================================================================
// EXPLOSIVE KILL — AoE fire burst at enemy death position
// ======================================================================
const explosions = [];
export function spawnExplosion(x, y, radius = 70, damage = 20, damageType = null) {
  explosions.push({ x, y, life: 0.45, maxLife: 0.45, radius, damage, hit: false, damageType });
  shakeCamera(4, 0.12);
  playSfx('slime_death', { rate: 0.7, volume: 0.85 });
}

// ======================================================================
// SOUL BURST — ring of ghostly orbs fired outward from a position
// ======================================================================
const souls = [];
export function spawnSoulBurst(x, y, count = 8, damage = 15) {
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    souls.push({
      x, y,
      vx: Math.cos(a) * 280,
      vy: Math.sin(a) * 280,
      life: 1.4,
      damage,
      radius: 9,
      hitSet: new Set(),
    });
  }
  shakeCamera(6, 0.16);
  playSfx('click', { rate: 0.5, volume: 0.7 });
}

// ======================================================================
// THUNDER TRAIL — lightning path along hero's dodge route
// ======================================================================
const thunderTrails = [];    // { points: [{x,y}], life, damage, hitSet }
let currentThunderTrail = null;
export function beginThunderTrail(damage) {
  currentThunderTrail = { points: [], life: 0.55, maxLife: 0.55, damage, hitSet: new Set() };
  thunderTrails.push(currentThunderTrail);
}
export function addThunderTrailPoint(x, y) {
  if (!currentThunderTrail) return;
  currentThunderTrail.points.push({ x, y });
}
export function endThunderTrail() {
  currentThunderTrail = null;
}

// ======================================================================
// VAMPIRIC PULSE — expanding ring at hero that damages + heals on hit
// ======================================================================
let pulseTimer = 0;
const pulseRings = [];   // visual only; damage resolved on spawn
export function pulseOnTick(dt) {
  if (!hero.vampiricAura) return;
  pulseTimer -= dt;
  if (pulseTimer <= 0) {
    pulseTimer = 0.6;
    const r = 96;
    const dmg = 4 * (hero.damageMul || 1);
    let hits = 0;
    for (const e of enemies) {
      if (e.dead) continue;
      const dx = e.x - hero.x, dy = e.y - hero.y;
      if (dx*dx + dy*dy < r*r) {
        e.takeDamage(dmg, dx * 0.3, dy * 0.3);
        hits++;
      }
    }
    if (hits > 0 && hero.hp < hero.maxHp) hero.hp = Math.min(hero.maxHp, hero.hp + 1);
    pulseRings.push({ x: hero.x, y: hero.y, t: 0, maxLife: 0.5, radius: r });
  }
}

// ======================================================================
// ECHOING STRIKE — queue a delayed second hit on the same target
// ======================================================================
const delayedHits = [];  // { target, delay, damage, aimX, aimY }
export function scheduleEchoHit(target, delay, damage, aimX, aimY) {
  delayedHits.push({ target, delay, damage, aimX, aimY });
}

// ======================================================================
// CATACLYSM — every 10th hit spawns a room-wide radial pulse from hero
// ======================================================================
let cataclysmHits = 0;
const cataclysmPulses = [];
export function cataclysmRegisterHit(damageMul) {
  if (!hero.cataclysm) return;
  cataclysmHits++;
  if (cataclysmHits % 10 === 0) {
    cataclysmPulses.push({ x: hero.x, y: hero.y, t: 0, maxLife: 0.6, radius: 420, damage: 40 * damageMul, hit: false });
    shakeCamera(14, 0.3);
    playSfx('hero_hurt', { rate: 0.5, volume: 0.9 });
    playSfx('slime_death', { rate: 0.6, volume: 0.8 });
  }
}

// ======================================================================
// ETHEREAL BINDING — 1s invulnerability every 3 kills
// ======================================================================
let etherealKills = 0;
const shieldPulses = [];
export function etherealRegisterKill() {
  if (!hero.etherealBinding) return;
  etherealKills++;
  if (etherealKills % 3 === 0) {
    hero.iframes = Math.max(hero.iframes, 1.0);
    shieldPulses.push({ t: 0, maxLife: 1.0 });
    shakeCamera(5, 0.15);
    playSfx('click', { rate: 0.7, volume: 0.85 });
  }
}

// ======================================================================
// WANDERER'S CLOAK — dodge grants 2s doubled attack speed
// ======================================================================
export function wandererOnDodge() {
  if (!hero.wandererCloak) return;
  hero.wandererBuffTime = 2.0;
}

// ======================================================================
// EYE OF ETHER — crits pierce through enemies in a line
// Helper: collide a line from hero to target against enemy array.
// ======================================================================
export function pierceLine(srcX, srcY, targetX, targetY, damage, aimX, aimY) {
  const dx = targetX - srcX, dy = targetY - srcY;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  for (const e of enemies) {
    if (e.dead) continue;
    // Project enemy onto the line
    const ex = e.x - srcX, ey = e.y - srcY;
    const along = ex * ux + ey * uy;
    if (along < 0 || along > len + 40) continue;     // behind hero or beyond target
    const perp = Math.abs(ex * -uy + ey * ux);
    if (perp < 30) {
      // Skip the actual primary target (already damaged by the swing)
      if (Math.abs(e.x - targetX) < 4 && Math.abs(e.y - targetY) < 4) continue;
      e.takeDamage(damage, aimX * 40, aimY * 40);
      hitSpark(e.x, e.y - 14, -aimX, -aimY, '#ffcaff');
      spawnDamageNumber(e.x, e.y - 30, damage, { color: '#ffcaff' });
    }
  }
  // VFX: purple piercing beam
  piercingBeams.push({
    x1: srcX, y1: srcY, x2: targetX + ux * 80, y2: targetY + uy * 80,
    t: 0, maxLife: 0.3,
  });
}
const piercingBeams = [];

// ======================================================================
// COMBO COUNTER — chain of hits in quick succession
// ======================================================================
export const combo = { count: 0, decayTime: 0, lastMilestone: 0 };
const COMBO_WINDOW = 2.2;          // seconds before chain resets
const COMBO_TIERS = [
  { n: 5,  label: 'CHAIN',     color: '#a0e8ff' },
  { n: 10, label: 'FLURRY',    color: '#ff9a55' },
  { n: 20, label: 'RAMPAGE',   color: '#ff5070' },
  { n: 40, label: 'CARNAGE',   color: '#ff2048' },
];
let comboPopTime = 0;
let comboPopLabel = '';
let comboPopColor = '';

export function registerComboHit() {
  combo.count++;
  combo.decayTime = COMBO_WINDOW;
  // Track max for achievement
  try {
    // Use a side-channel via window to avoid circular imports
    if (typeof window !== 'undefined') {
      window.__maxCombo = Math.max(window.__maxCombo || 0, combo.count);
    }
  } catch (e) {}
  for (const t of COMBO_TIERS) {
    if (combo.count === t.n) {
      const tierIdx = COMBO_TIERS.indexOf(t);
      comboPopTime = 1.2 + tierIdx * 0.2;
      comboPopLabel = t.label + '!';
      comboPopColor = t.color;
      // Ramp shake + SFX by tier — CARNAGE hits hard
      shakeCamera(5 + tierIdx * 3, 0.14 + tierIdx * 0.05);
      playSfx('sword_swing', { rate: 1.7 + tierIdx * 0.1, volume: 0.6 + tierIdx * 0.1 });
      if (tierIdx >= 1) playSfx('slime_hit', { rate: 0.55 + tierIdx * 0.1, volume: 0.55 + tierIdx * 0.1 });
      if (tierIdx >= 3) playSfx('slime_death', { rate: 0.45, volume: 0.8 });
      combo.lastMilestone = t.n;
      break;
    }
  }
}

// ======================================================================
// MAIN UPDATE — call once per tick to advance all synergy effects
// ======================================================================
export function updateSynergies(dt) {
  // Lightning arcs
  for (let i = lightningArcs.length - 1; i >= 0; i--) {
    lightningArcs[i].life -= dt;
    if (lightningArcs[i].life <= 0) lightningArcs.splice(i, 1);
  }

  // Explosions — apply damage once at spawn, then fade
  for (let i = explosions.length - 1; i >= 0; i--) {
    const ex = explosions[i];
    if (!ex.hit) {
      ex.hit = true;
      // Damage all enemies in radius (and the hero if Glass Blade isn't an option, skip hero for kill-explosions)
      for (const e of enemies) {
        if (e.dead) continue;
        const dx = e.x - ex.x, dy = e.y - ex.y;
        if (dx*dx + dy*dy < ex.radius * ex.radius) {
          e.takeDamage(ex.damage, dx * 0.2, dy * 0.2, { damageType: ex.damageType });
        }
      }
      // Burst particles
      for (let k = 0; k < 14; k++) deathBurst(ex.x, ex.y, '#ff8040');
    }
    ex.life -= dt;
    if (ex.life <= 0) explosions.splice(i, 1);
  }

  // Soul orbs
  for (let i = souls.length - 1; i >= 0; i--) {
    const s = souls[i];
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.vx *= Math.pow(0.7, dt);    // deceleration
    s.vy *= Math.pow(0.7, dt);
    s.life -= dt;
    // Hit enemies
    for (const e of enemies) {
      if (e.dead || s.hitSet.has(e)) continue;
      const dx = e.x - s.x, dy = e.y - s.y;
      if (dx*dx + dy*dy < (s.radius + e.radius) * (s.radius + e.radius)) {
        s.hitSet.add(e);
        e.takeDamage(s.damage, s.vx * 0.04, s.vy * 0.04);
        hitSpark(e.x, e.y - 14, -s.vx * 0.3, -s.vy * 0.3, '#88c0ff');
      }
    }
    if (s.life <= 0) souls.splice(i, 1);
  }

  // Thunder trails
  for (let i = thunderTrails.length - 1; i >= 0; i--) {
    const t = thunderTrails[i];
    t.life -= dt;
    // Hit enemies along the trail (one pass)
    if (t.hitSet.size === 0 && t.points.length >= 2) {
      for (const e of enemies) {
        if (e.dead || t.hitSet.has(e)) continue;
        // Simple check: enemy near any trail point
        for (const p of t.points) {
          const dx = e.x - p.x, dy = e.y - p.y;
          if (dx*dx + dy*dy < 36 * 36) {
            t.hitSet.add(e);
            e.takeDamage(t.damage, dx * 0.3, dy * 0.3);
            hitSpark(e.x, e.y - 14, 0, -1, '#a0ecff');
            break;
          }
        }
      }
    }
    if (t.life <= 0) thunderTrails.splice(i, 1);
  }

  // Vampiric pulse
  pulseOnTick(dt);
  for (let i = pulseRings.length - 1; i >= 0; i--) {
    pulseRings[i].t += dt;
    if (pulseRings[i].t >= pulseRings[i].maxLife) pulseRings.splice(i, 1);
  }

  // Delayed echo hits
  for (let i = delayedHits.length - 1; i >= 0; i--) {
    const d = delayedHits[i];
    d.delay -= dt;
    if (d.delay <= 0) {
      if (d.target && !d.target.dead) {
        d.target.takeDamage(d.damage, d.aimX * 80, d.aimY * 80);
        hitSpark(d.target.x, d.target.y - 14, -d.aimX, -d.aimY, '#ffddaa');
        spawnDamageNumber(d.target.x, d.target.y - 34, d.damage, { echo: true });
      }
      delayedHits.splice(i, 1);
    }
  }

  // Combo decay
  if (combo.decayTime > 0) {
    combo.decayTime -= dt;
    if (combo.decayTime <= 0) {
      combo.count = 0;
      combo.lastMilestone = 0;
    }
  }
  if (comboPopTime > 0) comboPopTime -= dt;

  // Cataclysm pulses — resolve damage once, then fade
  for (let i = cataclysmPulses.length - 1; i >= 0; i--) {
    const p = cataclysmPulses[i];
    if (!p.hit) {
      p.hit = true;
      for (const e of enemies) {
        if (e.dead) continue;
        const dx = e.x - p.x, dy = e.y - p.y;
        if (dx*dx + dy*dy < p.radius * p.radius) {
          e.takeDamage(p.damage, dx * 0.05, dy * 0.05);
        }
      }
    }
    p.t += dt;
    if (p.t >= p.maxLife) cataclysmPulses.splice(i, 1);
  }

  // Shield pulses (Ethereal Binding visual)
  for (let i = shieldPulses.length - 1; i >= 0; i--) {
    shieldPulses[i].t += dt;
    if (shieldPulses[i].t >= shieldPulses[i].maxLife) shieldPulses.splice(i, 1);
  }

  // Wanderer's Cloak buff countdown
  if (hero.wandererBuffTime && hero.wandererBuffTime > 0) {
    hero.wandererBuffTime -= dt;
    if (hero.wandererBuffTime < 0) hero.wandererBuffTime = 0;
  }

  // Piercing beams
  for (let i = piercingBeams.length - 1; i >= 0; i--) {
    piercingBeams[i].t += dt;
    if (piercingBeams[i].t >= piercingBeams[i].maxLife) piercingBeams.splice(i, 1);
  }
}

export function clearSynergies() {
  lightningArcs.length = 0;
  explosions.length = 0;
  souls.length = 0;
  thunderTrails.length = 0;
  pulseRings.length = 0;
  delayedHits.length = 0;
  cataclysmPulses.length = 0;
  shieldPulses.length = 0;
  piercingBeams.length = 0;
  cataclysmHits = 0;
  etherealKills = 0;
  combo.count = 0;
  combo.decayTime = 0;
  combo.lastMilestone = 0;
  comboPopTime = 0;
  pulseTimer = 0;
}

// ======================================================================
// DRAW
// ======================================================================
function zigzagPath(ctx, x1, y1, x2, y2, jitter = 12) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  const nx = -dy / len, ny = dx / len;     // perpendicular
  const segs = Math.max(3, (len / 26) | 0);
  ctx.moveTo(x1, y1);
  for (let i = 1; i < segs; i++) {
    const t = i / segs;
    const bx = x1 + dx * t;
    const by = y1 + dy * t;
    const off = (Math.random() * 2 - 1) * jitter;
    ctx.lineTo(bx + nx * off, by + ny * off);
  }
  ctx.lineTo(x2, y2);
}

export function drawSynergies(ctx) {
  // Thunder trails (beneath everything else)
  for (const t of thunderTrails) {
    const r = t.life / t.maxLife;
    if (t.points.length < 2) continue;
    ctx.strokeStyle = 'rgba(140, 220, 255, ' + (r * 0.9).toFixed(3) + ')';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(t.points[0].x, t.points[0].y);
    for (let i = 1; i < t.points.length; i++) ctx.lineTo(t.points[i].x, t.points[i].y);
    ctx.stroke();
    // Inner glow
    ctx.strokeStyle = 'rgba(240, 250, 255, ' + r.toFixed(3) + ')';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Vampiric pulse rings
  for (const p of pulseRings) {
    const t = p.t / p.maxLife;
    const rad = p.radius * t;
    ctx.strokeStyle = 'rgba(255, 80, 120, ' + ((1 - t) * 0.6).toFixed(3) + ')';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(p.x, p.y - 12, rad, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255, 150, 180, ' + ((1 - t) * 0.35).toFixed(3) + ')';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(p.x, p.y - 12, rad * 0.7, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Explosion visuals
  for (const ex of explosions) {
    const t = ex.life / ex.maxLife;
    const rad = ex.radius * (1 - t * 0.3);
    const g = ctx.createRadialGradient(ex.x, ex.y, 2, ex.x, ex.y, rad);
    g.addColorStop(0, 'rgba(255, 240, 180, ' + t.toFixed(3) + ')');
    g.addColorStop(0.3, 'rgba(255, 140, 40, ' + (t * 0.8).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(180, 40, 20, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(ex.x - rad, ex.y - rad, rad * 2, rad * 2);
    // Ring
    ctx.strokeStyle = 'rgba(255, 200, 100, ' + t.toFixed(3) + ')';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(ex.x, ex.y, rad * 0.85, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Lightning arcs
  for (const a of lightningArcs) {
    const t = a.life / a.maxLife;
    ctx.strokeStyle = 'rgba(150, 230, 255, ' + t.toFixed(3) + ')';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    zigzagPath(ctx, a.fromX, a.fromY, a.toX, a.toY, 14);
    ctx.stroke();
    // Inner bright core
    ctx.strokeStyle = 'rgba(255, 255, 255, ' + t.toFixed(3) + ')';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    zigzagPath(ctx, a.fromX, a.fromY, a.toX, a.toY, 8);
    ctx.stroke();
  }

  // Cataclysm expanding rings — gold shockwaves from hero
  for (const p of cataclysmPulses) {
    const t = p.t / p.maxLife;
    const rad = p.radius * t;
    // Multiple concentric rings
    for (let k = 0; k < 3; k++) {
      const kt = Math.max(0, t - k * 0.1);
      if (kt <= 0) continue;
      const kr = p.radius * kt;
      const a = (1 - kt) * (1 - k * 0.3);
      ctx.strokeStyle = 'rgba(255, 200, 100, ' + a.toFixed(3) + ')';
      ctx.lineWidth = 6 - k * 1.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, kr, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Bright core ring
    ctx.strokeStyle = 'rgba(255, 255, 200, ' + ((1 - t) * 0.9).toFixed(3) + ')';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(p.x, p.y, rad * 0.96, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Piercing beams (Eye of Ether crit line)
  for (const b of piercingBeams) {
    const t = b.t / b.maxLife;
    const a = 1 - t;
    ctx.save();
    ctx.strokeStyle = 'rgba(232, 180, 255, ' + a.toFixed(3) + ')';
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(b.x1, b.y1);
    ctx.lineTo(b.x2, b.y2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255, 255, 255, ' + a.toFixed(3) + ')';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  // Soul orbs
  for (const s of souls) {
    const t = s.life / 1.4;
    const glow = ctx.createRadialGradient(s.x, s.y, 2, s.x, s.y, 16);
    glow.addColorStop(0, 'rgba(180, 220, 255, ' + t.toFixed(3) + ')');
    glow.addColorStop(0.5, 'rgba(120, 180, 240, ' + (t * 0.6).toFixed(3) + ')');
    glow.addColorStop(1, 'rgba(60, 100, 200, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(s.x - 16, s.y - 16, 32, 32);
    ctx.fillStyle = 'rgba(230, 250, 255, ' + t.toFixed(3) + ')';
    ctx.fillRect(s.x - 2, s.y - 2, 4, 4);
  }
}

// Hero shield bubble (Ethereal Binding active)
export function drawHeroShield(ctx) {
  if (shieldPulses.length === 0) return;
  for (const s of shieldPulses) {
    const t = s.t / s.maxLife;
    const a = (1 - t) * 0.7;
    const r = 34 + t * 8;
    // Outer gold bubble
    ctx.strokeStyle = 'rgba(255, 220, 130, ' + a.toFixed(3) + ')';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(hero.x, hero.y - 20, r, 0, Math.PI * 2);
    ctx.stroke();
    // Inner glow
    const g = ctx.createRadialGradient(hero.x, hero.y - 20, r * 0.5, hero.x, hero.y - 20, r);
    g.addColorStop(0, 'rgba(255, 220, 130, 0)');
    g.addColorStop(1, 'rgba(255, 220, 130, ' + (a * 0.5).toFixed(3) + ')');
    ctx.fillStyle = g;
    ctx.fillRect(hero.x - r, hero.y - 20 - r, r * 2, r * 2);
  }
}

// Wanderer's Cloak — gold afterimage trail while buffed
export function drawWandererTrail(ctx) {
  if (!hero.wandererBuffTime || hero.wandererBuffTime <= 0) return;
  // Pulsing halo
  const pulse = 0.6 + 0.4 * Math.sin(performance.now() / 80);
  const a = Math.min(1, hero.wandererBuffTime / 0.3) * 0.55 * pulse;
  const r = 44;
  const g = ctx.createRadialGradient(hero.x, hero.y - 20, 4, hero.x, hero.y - 20, r);
  g.addColorStop(0, 'rgba(255, 240, 180, ' + (a * 0.6).toFixed(3) + ')');
  g.addColorStop(1, 'rgba(255, 200, 120, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(hero.x - r, hero.y - 20 - r, r * 2, r * 2);
}

// Combo popup — drawn in HUD space (not world)
export function drawComboOverlay(ctx, w, h) {
  if (comboPopTime > 0 && comboPopLabel) {
    const t = comboPopTime / 1.2;
    const a = t > 0.7 ? (1 - t) / 0.3 : Math.min(1, (1 - t) * 3);
    const tierIdx = COMBO_TIERS.findIndex(tt => tt.label + '!' === comboPopLabel);
    const tierScale = 1 + tierIdx * 0.25; // 1.0 / 1.25 / 1.5 / 1.75
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, a));
    const cx = w / 2, cy = h * 0.32 - (1 - t) * 22;

    // FULL-SCREEN COLORED VIGNETTE FLASH on CARNAGE and RAMPAGE
    if (tierIdx >= 2) {
      const flashA = Math.max(0, Math.min(0.24, (1 - t) * 0.5)) * (tierIdx >= 3 ? 1.0 : 0.65);
      const vg = ctx.createRadialGradient(cx, h / 2, Math.min(w, h) * 0.25, cx, h / 2, Math.max(w, h) * 0.7);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, hexToRgba(comboPopColor, flashA));
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, w, h);
    }

    // RADIATING RAYS behind text (ramp with tier)
    const rayCount = 8 + tierIdx * 4;
    const rayLen = (140 + tierIdx * 70) * (1.2 - t * 0.4) * tierScale;
    const rotStart = (1 - t) * 0.8;
    ctx.translate(cx, cy);
    ctx.rotate(rotStart);
    for (let i = 0; i < rayCount; i++) {
      const ang = (i / rayCount) * Math.PI * 2;
      ctx.save();
      ctx.rotate(ang);
      const rg = ctx.createLinearGradient(0, 0, rayLen, 0);
      rg.addColorStop(0, hexToRgba(comboPopColor, 0.55));
      rg.addColorStop(1, hexToRgba(comboPopColor, 0));
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.moveTo(0, -4 - tierIdx);
      ctx.lineTo(rayLen, 0);
      ctx.lineTo(0, 4 + tierIdx);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.rotate(-rotStart);

    // Main text (stroke for outline on higher tiers)
    ctx.font = 'bold ' + ((42 + (1 - t) * 12) * tierScale) + 'px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.fillText(comboPopLabel, 3, 3);
    if (tierIdx >= 2) {
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.9)';
      ctx.strokeText(comboPopLabel, 0, 0);
    }
    ctx.fillStyle = comboPopColor;
    ctx.fillText(comboPopLabel, 0, 0);
    // Small counter below
    ctx.font = 'bold ' + (14 * tierScale) + 'px Georgia, serif';
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillText('x' + combo.count, 0, 36 * tierScale);
    ctx.restore();
  } else if (combo.count >= 3 && combo.decayTime > 0) {
    // Small persistent combo display
    const tierColor = (COMBO_TIERS.slice().reverse().find(t => combo.count >= t.n) || {}).color || '#ddd';
    const mag = combo.count >= 20 ? 1.2 : combo.count >= 10 ? 1.05 : 0.9;
    ctx.save();
    ctx.globalAlpha = Math.min(1, combo.decayTime / 0.4);
    ctx.font = 'bold ' + (22 * mag) + 'px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillText('x' + combo.count, w / 2 + 2, h * 0.85 + 2);
    ctx.fillStyle = tierColor;
    ctx.fillText('x' + combo.count, w / 2, h * 0.85);
    // Decay bar below
    const barW = 100, barH = 3;
    const decayFrac = Math.max(0, Math.min(1, combo.decayTime / COMBO_WINDOW));
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(w / 2 - barW / 2, h * 0.85 + 16, barW, barH);
    ctx.fillStyle = tierColor;
    ctx.fillRect(w / 2 - barW / 2, h * 0.85 + 16, barW * decayFrac, barH);
    ctx.restore();
  }
}

function hexToRgba(hex, a) {
  if (!hex) return 'rgba(255,255,255,' + a + ')';
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  const n = parseInt(hex, 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
}
