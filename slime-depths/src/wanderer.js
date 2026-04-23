// NPC Wanderer — appears in sanctuary rooms occasionally. Offers trades:
//   1) Full HP restore for gold
//   2) Reroll relic offers in next combat for gold
//   3) Sell a random rare relic for gold (if unowned)

import { hero } from './hero.js';
import { gold } from './gold.js';
import { images } from './loader.js?v=enemies3';
import { applyRelic, rollRelicOffer, relicTier } from './relics.js';
import { playSfx } from './sfx.js';
import { deathBurst, sparkle } from './particles.js?v=8';
import { stats } from './stats.js';
import { showTip } from './tips.js';

export const wanderer = {
  active: false,
  x: 0, y: 0,
  offer: null,              // the specific trade deal this run
  consumed: false,
  bob: 0,
};

// Spawn wanderer in current sanctuary room — roll on loadRoom.
// wh is a forced-spawn flag (Hermit tarot card passes true to override the roll).
export function maybeSpawnWanderer(roomKind, wh, floorLevel) {
  wanderer.active = false;
  wanderer.consumed = false;
  if (roomKind !== 'reward') return;
  if (!wh && Math.random() > 0.7) return;        // 70% default, or forced by opts

  wanderer.x = 7 * 48 + 24;              // left side of sanctuary, mirrors pedestal
  wanderer.y = 5 * 48 + 24;
  wanderer.active = true;
  wanderer.bob = 0;
  // Onboarding tip — fires once when the wanderer first appears in a run.
  showTip('first_wanderer');

  // Pick a trade for this encounter based on floor + roll
  const r = Math.random();
  if (r < 0.4) {
    // Full heal for gold scaled by floor
    const cost = 15 + floorLevel * 12;
    wanderer.offer = {
      kind: 'heal',
      cost,
      label: 'FULL HEAL',
      desc: 'Restore to full HP',
      tint: '#86e3a8',
    };
  } else if (r < 0.75) {
    // Buy a random relic (rare tier on floor 2+, legendary on floor 3+)
    const tier = floorLevel >= 3 ? 'legendary' : floorLevel >= 2 ? 'rare' : 'common';
    const cost = tier === 'legendary' ? 140 : tier === 'rare' ? 80 : 45;
    const offered = rollRelicOffer(1, floorLevel);
    if (offered.length === 0) { wanderer.active = false; return; }
    wanderer.offer = {
      kind: 'relic',
      cost,
      relic: offered[0],
      label: offered[0].name,
      desc: offered[0].desc,
      tint: offered[0].tint,
    };
  } else {
    // Gamble: small chance of free legendary, otherwise lose 50 gold
    const cost = 50;
    wanderer.offer = {
      kind: 'gamble',
      cost,
      label: 'ROLL THE DICE',
      desc: '25% chance to gain a random relic. Otherwise, lose 50 gold.',
      tint: '#c49aff',
    };
  }
}

export function clearWanderer() {
  wanderer.active = false;
  wanderer.consumed = false;
}

export function updateWanderer(dt) {
  if (!wanderer.active) return;
  wanderer.bob += dt * 2;
  // Continuous ambient sparkles around wanderer — feels supernatural
  if (!wanderer.consumed && Math.random() < dt * 4) {
    sparkle(wanderer.x + (Math.random() - 0.5) * 26, wanderer.y - 8 + (Math.random() - 0.5) * 22, '#f4d9a0');
  }
  // Interaction trigger: if hero close enough and clicks or moves onto tile
  const dx = hero.x - wanderer.x, dy = hero.y - wanderer.y;
  const d = Math.hypot(dx, dy);
  if (d < 28 && !wanderer.consumed && gold.total >= wanderer.offer.cost) {
    executeWandererTrade();
  }
}

function executeWandererTrade() {
  const o = wanderer.offer;
  if (!o || wanderer.consumed) return;
  if (gold.total < o.cost) return;
  gold.total -= o.cost;
  wanderer.consumed = true;
  stats.wandererTrades = (stats.wandererTrades | 0) + 1;
  // Effect burst
  deathBurst(wanderer.x, wanderer.y - 20, o.tint || '#c9a86a');
  playSfx('click', { rate: 1.3, volume: 0.8 });

  if (o.kind === 'heal') {
    hero.hp = hero.maxHp;
  } else if (o.kind === 'relic') {
    applyRelic(o.relic.id);
  } else if (o.kind === 'gamble') {
    if (Math.random() < 0.25) {
      const offered = rollRelicOffer(1, 3);
      if (offered.length) applyRelic(offered[0].id);
    }
    // Otherwise lost 50g with nothing
  }
}

export function drawWanderer(ctx) {
  if (!wanderer.active || wanderer.consumed) return;
  const bob = Math.sin(wanderer.bob) * 3;
  const x = wanderer.x, y = wanderer.y + bob;
  // Ground shadow
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath();
  ctx.ellipse(wanderer.x, wanderer.y + 16, 22, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  // Golden halo behind the wanderer
  const glow = ctx.createRadialGradient(x, y - 20, 6, x, y - 20, 48);
  glow.addColorStop(0, 'rgba(201, 168, 106, 0.35)');
  glow.addColorStop(1, 'rgba(201, 168, 106, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(x - 48, y - 68, 96, 96);
  // Use priest sprite if loaded (already in loader), else placeholder
  const img = images.priest_idle;
  if (img) {
    const size = 96;
    const frames = Math.max(1, Math.floor(img.width / 100));
    const f = Math.floor(wanderer.bob * 1.3) % frames;
    ctx.drawImage(img, f * 100, 0, 100, 100, x - size/2, y - size * 0.78, size, size);
  } else {
    // Fallback: cloaked figure silhouette
    ctx.fillStyle = '#2a1a20';
    ctx.fillRect(x - 14, y - 48, 28, 56);
    ctx.fillStyle = '#c9a86a';
    ctx.fillRect(x - 10, y - 42, 20, 6);
  }
}

export function drawWandererTooltip(ctx, w, h) {
  if (!wanderer.active || wanderer.consumed) return;
  const dx = hero.x - wanderer.x, dy = hero.y - wanderer.y;
  const d = Math.hypot(dx, dy);
  if (d > 120) return;
  const o = wanderer.offer;
  const canAfford = gold.total >= o.cost;
  ctx.save();
  const boxW = 320, boxH = 82;
  const bx = (w - boxW) / 2;
  const by = h - 200;
  ctx.fillStyle = 'rgba(14, 8, 12, 0.88)';
  ctx.fillRect(bx, by, boxW, boxH);
  ctx.strokeStyle = canAfford ? '#f4d9a0' : 'rgba(100, 60, 60, 0.6)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(bx + 0.5, by + 0.5, boxW - 1, boxH - 1);
  // Inner stripe
  ctx.strokeStyle = 'rgba(201, 168, 106, 0.3)';
  ctx.lineWidth = 1;
  ctx.strokeRect(bx + 4.5, by + 4.5, boxW - 9, boxH - 9);
  // Title "The Wanderer"
  ctx.fillStyle = '#c9a86a';
  ctx.font = 'bold 11px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText('— THE WANDERER —', bx + boxW / 2, by + 18);
  // Offer
  ctx.fillStyle = o.tint || '#f4d9a0';
  ctx.font = 'bold 16px Georgia, serif';
  ctx.fillText(o.label, bx + boxW / 2, by + 38);
  ctx.fillStyle = '#bbb';
  ctx.font = 'italic 11px Georgia, serif';
  ctx.fillText(o.desc, bx + boxW / 2, by + 54);
  // Cost
  ctx.fillStyle = canAfford ? '#ffd68a' : '#d85a5a';
  ctx.font = 'bold 13px Georgia, serif';
  ctx.fillText('🪙 ' + o.cost + (canAfford ? '  · walk to pay' : '  · need more gold'), bx + boxW / 2, by + 72);
  ctx.textAlign = 'left';
  ctx.restore();
}
