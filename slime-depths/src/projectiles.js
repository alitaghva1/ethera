// Enemy projectiles (arrows, fireballs, etc.). Fire-and-forget, pooled.
import { isWallAtWorld } from './room.js';
import { damageHero, hero } from './hero.js';
import { shakeCamera } from './camera.js';
import { playSfx } from './sfx.js';
import { sparkle, hitSpark, deathBurst } from './particles.js';
import { synthPing, synthThud } from './synth.js';

export const projectiles = [];
const pool = [];

export function spawnArrow(x, y, targetX, targetY, damage = 1) {
  const dx = targetX - x, dy = targetY - y;
  const m = Math.hypot(dx, dy) || 1;
  const p = pool.pop() || {};
  p.kind = 'arrow';
  p.x = x; p.y = y;
  p.vx = (dx / m) * 340;
  p.vy = (dy / m) * 340;
  p.angle = Math.atan2(dy, dx);
  p.life = 1.6;
  p.damage = damage;
  p.radius = 6;
  p.affix = null;
  projectiles.push(p);
  return p;
}

// Wizard homing orb — slow, curves toward the hero, bigger splash, more dangerous
export function spawnOrb(x, y, targetX, targetY, damage = 2) {
  const dx = targetX - x, dy = targetY - y;
  const m = Math.hypot(dx, dy) || 1;
  const p = pool.pop() || {};
  p.kind = 'orb';
  p.x = x; p.y = y;
  p.vx = (dx / m) * 180;           // slower than arrow
  p.vy = (dy / m) * 180;
  p.life = 3.2;                      // long-lived, can chase for a while
  p.damage = damage;
  p.radius = 10;                    // bigger hitbox
  p.homing = 1.4;                    // turn rate (radians per sec toward target)
  p.maxSpeed = 230;
  p.affix = null;
  p.trail = [];                     // trail of recent positions for FX
  p.t = 0;
  projectiles.push(p);
  return p;
}

export function clearProjectiles() {
  while (projectiles.length) pool.push(projectiles.pop());
}

export function updateProjectiles(dt) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];

    // Homing behavior — orbs curve toward the hero
    if (p.homing) {
      p.t = (p.t || 0) + dt;
      const dx = hero.x - p.x, dy = hero.y - p.y;
      const targAng = Math.atan2(dy, dx);
      const curAng = Math.atan2(p.vy, p.vx);
      let diff = targAng - curAng;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const turn = Math.max(-p.homing * dt, Math.min(p.homing * dt, diff));
      const speed = Math.hypot(p.vx, p.vy);
      const newSpeed = Math.min(p.maxSpeed, speed + 60 * dt);      // accel
      const newAng = curAng + turn;
      p.vx = Math.cos(newAng) * newSpeed;
      p.vy = Math.sin(newAng) * newSpeed;
      // Keep trail
      p.trail = p.trail || [];
      p.trail.push({ x: p.x, y: p.y });
      if (p.trail.length > 10) p.trail.shift();
    }

    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    // PROJECTILE TRAILS — distinguish type visually with trailing particles
    if (p.kind === 'arrow') {
      // Rare dust puffs from arrow tail
      if (Math.random() < dt * 6) sparkle(p.x - p.vx * 0.02, p.y - p.vy * 0.02, '#a89070');
    } else if (p.homing) {
      // Orbs leave a denser magical wisp trail
      if (Math.random() < dt * 20) sparkle(p.x, p.y, p.color || '#c0a0ff');
    }
    if (isWallAtWorld(p.x, p.y)) {
      // IMPACT VFX — projectile hits a wall. Arrows shatter with dust sparks
      // along the wall normal; orbs dissipate with a purple burst + soft thud.
      const speed = Math.hypot(p.vx, p.vy) || 1;
      const nx = -p.vx / speed, ny = -p.vy / speed;
      if (p.kind === 'arrow') {
        hitSpark(p.x, p.y, nx, ny, '#c9a36a');
        synthPing(1600, 0.35, 0.12);
      } else if (p.homing) {
        deathBurst(p.x, p.y, p.color || '#c0a0ff');
        for (let k = 0; k < 6; k++) {
          sparkle(p.x + (Math.random() - 0.5) * 16, p.y + (Math.random() - 0.5) * 16, p.color || '#c0a0ff');
        }
        synthThud(140, 0.25, 0.18);
      }
      projectiles.splice(i, 1);
      pool.push(p);
      continue;
    }
    // Collision: hero
    if (hero.state !== 'dead') {
      const dx = p.x - hero.x, dy = p.y - hero.y;
      if (dx*dx + dy*dy < (p.radius + 14) * (p.radius + 14)) {
        // IMPACT VFX — projectile hits the hero. Spark direction pushes back
        // along the incoming velocity so the burst reads as "pushing into" the
        // hero. Arrows get a tight red-gold pop; orbs get a bigger prismatic
        // explosion + brief screen-shake on top of the damage hit-stop.
        const speed = Math.hypot(p.vx, p.vy) || 1;
        const impactNx = -p.vx / speed, impactNy = -p.vy / speed;
        if (p.kind === 'arrow') {
          hitSpark(p.x, p.y, impactNx, impactNy, '#ff8a6a');
          synthPing(900, 0.45, 0.18);
        } else if (p.homing) {
          deathBurst(p.x, p.y, p.color || '#c0a0ff');
          hitSpark(p.x, p.y, impactNx, impactNy, '#e8c0ff');
          for (let k = 0; k < 4; k++) {
            sparkle(p.x + (Math.random() - 0.5) * 14, p.y + (Math.random() - 0.5) * 14, '#ffffff');
          }
          synthThud(180, 0.35, 0.28);
          shakeCamera(4, 0.15);
        }
        const result = damageHero(p.damage, p.x, p.y);
        if (result === 'hit' && p.affix && p.affix.onHitHero) p.affix.onHitHero();
        projectiles.splice(i, 1);
        pool.push(p);
        continue;
      }
    }
    if (p.life <= 0) {
      projectiles.splice(i, 1);
      pool.push(p);
    }
  }
}

export function drawProjectiles(ctx) {
  for (const p of projectiles) {
    if (p.kind === 'arrow') {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      // Shaft
      ctx.fillStyle = '#c9a36a';
      ctx.fillRect(-14, -1, 20, 2);
      // Head
      ctx.fillStyle = '#e8dbb0';
      ctx.beginPath();
      ctx.moveTo(6, -3);
      ctx.lineTo(12, 0);
      ctx.lineTo(6, 3);
      ctx.closePath();
      ctx.fill();
      // Fletching
      ctx.fillStyle = '#6a4a2a';
      ctx.fillRect(-14, -3, 4, 2);
      ctx.fillRect(-14, 1, 4, 2);
      ctx.restore();
    } else if (p.kind === 'orb') {
      // Purple-blue arcane orb with trailing wisp
      // Trail
      if (p.trail) {
        for (let j = 0; j < p.trail.length; j++) {
          const pt = p.trail[j];
          const a = (j / p.trail.length) * 0.5;
          ctx.fillStyle = 'rgba(180, 140, 255, ' + a.toFixed(3) + ')';
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 3 + j * 0.4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      // Outer glow
      const glow = ctx.createRadialGradient(p.x, p.y, 3, p.x, p.y, 22);
      glow.addColorStop(0, 'rgba(200, 160, 255, 0.9)');
      glow.addColorStop(0.45, 'rgba(140, 100, 230, 0.35)');
      glow.addColorStop(1, 'rgba(80, 50, 180, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(p.x - 22, p.y - 22, 44, 44);
      // Core
      ctx.fillStyle = '#e0c0ff';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fill();
      // Inner bright point
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
    }
  }
}
