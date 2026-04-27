// Projectiles — enemy-launched (arrows, orbs) and hero-launched (bolts).
// Fire-and-forget, pooled. Collision target depends on `friendly`:
//   - false/undefined: hits hero (default — enemy projectiles)
//   - true:            hits enemies (hero bolts from the wand)
import { isWallAtWorld } from './room.js';
import { damageHero, hero } from './hero.js';
import { enemies } from './enemies.js';
import { shakeCamera } from './camera.js';
import { sparkle, hitSpark, deathBurst } from './particles.js';
import { synthPing, synthThud } from './synth.js';
import { triggerHitStop, spawnDamageNumber } from './fx.js';
import { spawnLightningArc } from './synergies.js';

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

// Hero arcane bolt — fired by the wand weapon class. `friendly: true`
// flips the collision target so this bolt looks for ENEMIES (not the
// hero) along its path. Travel speed + lifetime are tuned per-shot via
// the wand's WEAPONS def so balance changes can live in weapons.js
// instead of being scattered through projectiles.js.
//
// CHARGED variant (opts.charged === true): deeper damage, pierces up
// to opts.pierce enemies before despawning, gold-tinted. Reuses the
// existing hero.chargeTime accumulator from melee weapons so charge-
// attack relics + the existing charge-ring UI work for wand without
// new infrastructure.
//
//   x, y      — origin (hero center, slightly forward of body)
//   dirX,dirY — normalized aim direction (unit-length from caller)
//   damage    — pre-multiplied damage (caller applies hero.damageMul)
//   speed     — bolt travel speed in px/s (default 600 / 720 charged)
//   life      — seconds before despawn (default 1.0 / 1.2 charged)
//   opts      — { charged?: bool, pierce?: number, color?: string }
export function spawnHeroBolt(x, y, dirX, dirY, damage = 16, speed = 600, life = 1.0, opts = {}) {
  const p = pool.pop() || {};
  p.kind = 'bolt';
  p.friendly = true;
  p.charged = !!opts.charged;
  p.x = x; p.y = y;
  p.vx = dirX * speed;
  p.vy = dirY * speed;
  p.angle = Math.atan2(dirY, dirX);
  p.life = life;
  p.damage = damage;
  p.radius = p.charged ? 10 : 7;     // bigger hitbox on charged
  p.affix = null;
  // Pierce count: how many enemies a single bolt can hit before
  // despawning. Default tap-fire = 0 (despawn on first hit). Charged
  // = caller passes opts.pierce (typically 3). Hit-tracking via
  // p.hit Set so a single enemy doesn't get multi-hit by one bolt.
  p.pierce = opts.pierce | 0;
  p.hit = null;     // lazily allocated when pierce > 0
  // Color: opts.color overrides for special bolts (synergies, theme
  // procs); default tap = arcane violet, default charged = warm gold.
  p.color = opts.color || (p.charged ? '#ffd980' : '#d4b8ff');
  // Trail of recent positions for the comet-tail render.
  p.trail = [];
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
    } else if (p.kind === 'bolt') {
      // Hero arcane bolt — keep a short trail of past positions for the
      // comet-tail render in drawProjectiles, plus occasional sparkles
      // along the path so the bolt reads as "spell" rather than "arrow".
      p.trail = p.trail || [];
      p.trail.push({ x: p.x, y: p.y });
      if (p.trail.length > 7) p.trail.shift();
      if (Math.random() < dt * 24) sparkle(p.x, p.y, p.color || '#d4b8ff');
    } else if (p.homing) {
      // Orbs leave a denser magical wisp trail
      if (Math.random() < dt * 20) sparkle(p.x, p.y, p.color || '#c0a0ff');
    }
    if (isWallAtWorld(p.x, p.y)) {
      // IMPACT VFX — projectile hits a wall. Arrows shatter with dust
      // sparks along the wall normal; orbs dissipate with a purple
      // burst + soft thud; hero bolts pop in a small violet flare.
      const speed = Math.hypot(p.vx, p.vy) || 1;
      const nx = -p.vx / speed, ny = -p.vy / speed;
      if (p.kind === 'arrow') {
        hitSpark(p.x, p.y, nx, ny, '#c9a36a');
        synthPing(1600, 0.35, 0.12);
      } else if (p.kind === 'bolt') {
        hitSpark(p.x, p.y, nx, ny, p.color || '#d4b8ff');
        for (let k = 0; k < 4; k++) {
          sparkle(p.x + (Math.random() - 0.5) * 12, p.y + (Math.random() - 0.5) * 12, p.color || '#d4b8ff');
        }
        synthPing(1100, 0.28, 0.10);
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
    // Collision: friendly bolts hit enemies; unfriendly projectiles
    // hit the hero.
    //
    // Pierce: if p.pierce > 0, the bolt damages an enemy but keeps
    // traveling (subtract one pierce; track hit enemies in p.hit so
    // a single enemy isn't multi-hit by one bolt). When pierce hits
    // 0, the bolt despawns on its next enemy hit.
    if (p.friendly) {
      let hitEnemy = null;
      for (const e of enemies) {
        if (e.dead) continue;
        if (p.hit && p.hit.has(e)) continue;
        const dx = p.x - e.x, dy = p.y - e.y;
        const r = (p.radius + (e.radius || 18));
        if (dx * dx + dy * dy < r * r) {
          hitEnemy = e;
          break;
        }
      }
      if (hitEnemy) {
        const speed = Math.hypot(p.vx, p.vy) || 1;
        const impactNx = -p.vx / speed, impactNy = -p.vy / speed;
        // Apply damage. takeDamage signature mirrors what the dash-strike
        // path uses (damage, knockX, knockY) — the bolt's velocity gives
        // a consistent push direction so hits read as "shot from over
        // there" instead of random knockback.
        hitEnemy.takeDamage(p.damage, p.vx / speed, p.vy / speed);
        // Spark color matches the bolt tint so hits read as "this
        // weapon's bolt landed" not "generic hit".
        const sparkColor = p.charged ? '#ffe8a0' : '#e8c8ff';
        hitSpark(hitEnemy.x, hitEnemy.y - 18, impactNx, impactNy, sparkColor);
        spawnDamageNumber(hitEnemy.x, hitEnemy.y - 36, p.damage, {
          dir: { x: p.vx / speed, y: p.vy / speed },
          elementTag: hitEnemy._lastElementTag,
          // Charged shots are the wand's "big swing" — get the CRIT
          // badge treatment so the player feels the empowered hit.
          crit: !!p.charged,
        });
        triggerHitStop(p.charged ? 0.07 : 0.04);
        synthPing(p.charged ? 720 : 960, p.charged ? 0.45 : 0.32, p.charged ? 0.14 : 0.10);

        // ── WAND RELIC HOOKS — fire on first hit per bolt only ──
        // Track p._didChain / p._didSplit so a piercing bolt doesn't
        // re-trigger the proc on every chained enemy (would feel busted).

        // Storm Conduit — arc lightning from the hit enemy to the
        // nearest other enemy within 140px. Half the bolt's damage,
        // single chain so it doesn't run away from the player's intent.
        if (hero.boltChain && !p._didChain) {
          p._didChain = true;
          let nearest = null;
          let nearestD2 = 140 * 140;
          for (const e2 of enemies) {
            if (e2.dead || e2 === hitEnemy) continue;
            const ex = e2.x - hitEnemy.x, ey = e2.y - hitEnemy.y;
            const d2 = ex * ex + ey * ey;
            if (d2 < nearestD2) { nearest = e2; nearestD2 = d2; }
          }
          if (nearest) {
            const chainDmg = Math.max(1, Math.round(p.damage * 0.5));
            spawnLightningArc(hitEnemy.x, hitEnemy.y - 18, nearest.x, nearest.y - 18);
            nearest.takeDamage(chainDmg, 0, -1);
            spawnDamageNumber(nearest.x, nearest.y - 36, chainDmg, {
              elementTag: nearest._lastElementTag,
            });
          }
        }

        // Splintered Light — on first hit, spawn 2 sub-bolts at ±25°
        // from the original direction. Sub-bolts deal 70% damage and
        // can't split again (they spawn with split=false). The bolt
        // itself still resolves its hit + pierce normally.
        if (hero.boltSplit && !p._didSplit && !p._isSubBolt) {
          p._didSplit = true;
          const baseAngle = Math.atan2(p.vy, p.vx);
          const subSpeed = Math.hypot(p.vx, p.vy);
          const subDmg = Math.max(1, Math.round(p.damage * 0.7));
          for (const offset of [-0.44, 0.44]) {     // ±25° in radians
            const a = baseAngle + offset;
            const sub = spawnHeroBolt(
              hitEnemy.x, hitEnemy.y - 8,
              Math.cos(a), Math.sin(a),
              subDmg, subSpeed, 0.6,
              { color: p.color },
            );
            sub._isSubBolt = true;     // prevent recursive split
          }
        }

        // Pierce branch: keep traveling if pierce charges remain.
        if (p.pierce > 0) {
          if (!p.hit) p.hit = new Set();
          p.hit.add(hitEnemy);
          p.pierce -= 1;
          // Bolt continues — fall through to next iteration without
          // splice/pool. The next collision check on a future tick
          // will re-enter this block.
          continue;
        }
        projectiles.splice(i, 1);
        pool.push(p);
        continue;
      }
    } else if (hero.state !== 'dead') {
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
    } else if (p.kind === 'bolt') {
      // Hero arcane bolt — comet-tail of past positions + bright core
      // + outer glow. Charged bolts use a warm-gold palette + bigger
      // glow + thicker trail so the player reads "this is the empowered
      // shot" at a glance. Tap-fire bolts stay arcane-violet.
      const c = p.color || '#d4b8ff';
      const isCharged = !!p.charged;
      const trailRGB = isCharged ? '255, 220, 140' : '212, 184, 255';
      const trailAlphaScale = isCharged ? 0.75 : 0.55;
      const trailRadiusBase = isCharged ? 3 : 2;
      const trailRadiusGrow = isCharged ? 0.5 : 0.3;
      // Trail
      if (p.trail) {
        for (let j = 0; j < p.trail.length; j++) {
          const pt = p.trail[j];
          const a = (j / p.trail.length) * trailAlphaScale;
          ctx.fillStyle = `rgba(${trailRGB}, ${a.toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, trailRadiusBase + j * trailRadiusGrow, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      // Outer glow (charged is bigger + warmer — reads as "big shot")
      const glowR = isCharged ? 22 : 14;
      const glow = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, glowR);
      if (isCharged) {
        glow.addColorStop(0, 'rgba(255, 240, 200, 0.95)');
        glow.addColorStop(0.5, 'rgba(255, 200, 100, 0.45)');
        glow.addColorStop(1, 'rgba(220, 160, 60, 0)');
      } else {
        glow.addColorStop(0, 'rgba(220, 200, 255, 0.85)');
        glow.addColorStop(0.5, 'rgba(160, 120, 240, 0.35)');
        glow.addColorStop(1, 'rgba(100, 70, 200, 0)');
      }
      ctx.fillStyle = glow;
      ctx.fillRect(p.x - glowR, p.y - glowR, glowR * 2, glowR * 2);
      // Core
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(p.x, p.y, isCharged ? 5 : 3, 0, Math.PI * 2);
      ctx.fill();
      // Bright pip — slightly bigger on charged for extra punch
      ctx.fillStyle = '#ffffff';
      const pipSz = isCharged ? 3 : 2;
      ctx.fillRect(p.x - pipSz / 2, p.y - pipSz / 2, pipSz, pipSz);
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
