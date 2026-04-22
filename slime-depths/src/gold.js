// Gold coins — drop from enemies, auto-collect when hero is near. Foundation
// for a shop system (not yet spent in-game, but counter persists).
import { hero } from './hero.js';
import { playSfx } from './sfx.js';
import { stats } from './stats.js';
import { sparkle, dashTrail } from './particles.js?v=8';
import { synthPing } from './synth.js';

export const gold = { total: 0, streak: 0, streakT: 0, streakFlashT: 0 };
const coins = [];
const pool = [];
// Coin streak tracker — consecutive pickups within COIN_STREAK_WINDOW seconds
// of each other. Drives the ascending chime and the optional pickup burst.
// Stored on the exported `gold` object so HUD can render a streak indicator.
const COIN_STREAK_WINDOW = 0.45;

export function resetGold() {
  gold.total = 0;
  gold.streak = 0;
  gold.streakT = 0;
  gold.streakFlashT = 0;
  coins.length = 0;
}

export function dropGold(x, y, amount = 1) {
  for (let i = 0; i < amount; i++) {
    const c = pool.pop() || {};
    const angle = Math.random() * Math.PI * 2;
    const speed = 80 + Math.random() * 100;
    c.x = x;
    c.y = y - 6;
    c.vx = Math.cos(angle) * speed;
    c.vy = Math.sin(angle) * speed - 80;
    c.spawnT = 0;
    c.bob = Math.random() * Math.PI * 2;
    c.collected = false;
    c.magnetized = false;
    c.value = 1;
    coins.push(c);
  }
}

export function updateGold(dt) {
  // Tick the streak window — once it elapses, reset the streak.
  if (gold.streak > 0) {
    gold.streakT += dt;
    if (gold.streakT > COIN_STREAK_WINDOW) {
      gold.streak = 0;
      gold.streakT = 0;
    }
  }
  for (let i = coins.length - 1; i >= 0; i--) {
    const c = coins[i];
    c.spawnT += dt;
    c.bob += dt * 5;
    // Throttled sparkle trail while the coin streams toward the hero
    c._trailT = (c._trailT || 0) + dt;

    // Initial toss: gravity + decay
    if (c.spawnT < 0.5) {
      c.vy += 300 * dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.vx *= Math.pow(0.1, dt);
    } else if (!c.magnetized) {
      // Settle with bob
      c.vy = 0;
      c.vx = 0;
    }

    // Magnet toward hero once it has settled
    if (c.spawnT > 0.4) {
      const dx = hero.x - c.x, dy = (hero.y - 10) - c.y;
      const d = Math.hypot(dx, dy);
      // Magnet range grows with floor reached — generous late game
      const magnetR = 140 + (window.__currentFloorLevel || 1) * 20;
      if (d < magnetR) c.magnetized = true;
      if (c.magnetized) {
        const pullSpeed = 260 + Math.min(400, (160 - d) * 4);
        c.x += (dx / (d || 1)) * pullSpeed * dt;
        c.y += (dy / (d || 1)) * pullSpeed * dt;
        // Sparkle trail — a small glint emitted roughly every 60ms while flying
        if (c._trailT > 0.06) {
          c._trailT = 0;
          sparkle(c.x, c.y - 4, '#ffe3a0');
        }
        if (d < 18) {
          gold.total += c.value;
          stats.goldCollected += c.value;
          // Streak logic — bump counter, reset window. Pitch climbs with gold
          // total AND streak so a cascade sounds musically ascending.
          gold.streak = Math.min(20, gold.streak + 1);
          gold.streakT = 0;
          const basePitch = 900 + Math.min(400, gold.total * 2);
          const streakStep = (gold.streak - 1) * 55;
          const pitch = basePitch + streakStep;
          synthPing(pitch, 0.6, 0.15);
          // Ring pulse — reads as "picked up" even in busy scenes
          dashTrail(c.x, c.y - 4, '#ffd68a');
          sparkle(c.x, c.y - 6, '#ffd68a');
          sparkle(c.x, c.y - 6, '#f4cc55');
          // Streak milestones — extra burst at 5/10/15 for escalating celebration
          if (gold.streak === 5 || gold.streak === 10 || gold.streak === 15) {
            dashTrail(c.x, c.y - 4, '#ffe070');
            for (let k = 0; k < 6; k++) sparkle(c.x, c.y - 6, '#fff0a8');
            try { synthPing(pitch + 300, 0.8, 0.22); } catch (e) {}
          }
          coins.splice(i, 1);
          pool.push(c);
        }
      }
    }
  }
}

export function drawGold(ctx) {
  for (const c of coins) {
    const bob = c.spawnT > 0.5 ? Math.sin(c.bob) * 1.5 : 0;
    const y = c.y + bob;
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(c.x, c.y + 6, 5, 2, 0, 0, Math.PI * 2);
    ctx.fill();
    // Coin — rim + face
    ctx.fillStyle = '#8a6024';
    ctx.fillRect(c.x - 4, y - 4, 8, 8);
    ctx.fillStyle = '#d4a63a';
    ctx.fillRect(c.x - 3, y - 3, 6, 6);
    ctx.fillStyle = '#f4cc55';
    ctx.fillRect(c.x - 2, y - 2, 4, 2);
    // Sparkle when magnetized
    if (c.magnetized) {
      ctx.fillStyle = 'rgba(255,240,180,0.6)';
      ctx.fillRect(c.x - 1, y - 6, 2, 1);
      ctx.fillRect(c.x + 4, y, 1, 1);
    }
  }
}
