// Pedestal hover teaser — when the hero is within tooltip range of an
// un-picked pedestal, draw a small looping ghost of what that relic DOES
// in-game. Fills the gap between "read the description" and "try it":
// stormcaller drops a phantom bolt, chain_lightning arcs a faint chain,
// hymn_of_embers shows its aura radius.
//
// Rendered inside the camera transform (world space), attached to the
// pedestal's world position. Fades in as the hero approaches so the
// effect doesn't clutter the whole room.
import { hero } from './hero.js';
import { pedestals } from './pedestals.js';

const HOVER_RANGE = 90;   // matches drawPedestalTooltip's range

// Per-relic teaser draw functions. Only relics present in this map get a
// teaser; others fall back to the text tooltip alone. Add new entries as
// you add new relics — the pattern is: (ctx, pedestal, timeSec) → draw.
const TEASERS = Object.create(null);

export function drawPedestalTeasers(ctx) {
  // Find the nearest hover-range, un-picked pedestal — same rule as the
  // text tooltip's target so the two always agree.
  let nearest = null;
  let nearestD = Infinity;
  for (const p of pedestals) {
    if (p.picked) continue;
    const d = Math.hypot(hero.x - p.x, hero.y - p.y);
    if (d < HOVER_RANGE && d < nearestD) { nearest = p; nearestD = d; }
  }
  if (!nearest) return;
  const id = nearest.relic?.id;
  const fn = TEASERS[id];
  if (!fn) return;

  // Proximity fade — 0 at HOVER_RANGE, 1 at the pedestal itself.
  const proximity = 1 - nearestD / HOVER_RANGE;
  const alpha = Math.min(1, proximity * 1.3);
  const t = performance.now() / 1000;

  ctx.save();
  ctx.globalAlpha = alpha;
  fn(ctx, nearest, t);
  ctx.restore();
}

// ---- Teasers --------------------------------------------------------------

TEASERS.stormcaller = (ctx, p, t) => {
  // Every 1.5s a bolt gathers then strikes just beside the pedestal.
  const cycle = (t % 1.5) / 1.5;    // 0..1
  const strikeX = p.x + 24;
  const strikeY = p.y + 4;
  // Charge glow (0..0.85)
  if (cycle < 0.85) {
    const cA = 0.15 + 0.35 * (cycle / 0.85);
    ctx.fillStyle = `rgba(160, 232, 255, ${cA.toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(strikeX, strikeY - 44, 5 + 3 * (cycle / 0.85), 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Strike (0.85..1.0)
    const sA = (1 - cycle) / 0.15;
    // Bolt zigzag from sky
    ctx.strokeStyle = `rgba(220, 240, 255, ${(0.95 * sA).toFixed(3)})`;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(strikeX,     strikeY - 90);
    ctx.lineTo(strikeX - 3, strikeY - 62);
    ctx.lineTo(strikeX + 5, strikeY - 34);
    ctx.lineTo(strikeX - 1, strikeY -  8);
    ctx.lineTo(strikeX,     strikeY);
    ctx.stroke();
    // Ground flash
    ctx.fillStyle = `rgba(200, 232, 255, ${(0.55 * sA).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(strikeX, strikeY, 14 + 8 * (1 - sA), 0, Math.PI * 2);
    ctx.fill();
  }
};

TEASERS.chain_lightning = (ctx, p, t) => {
  // Faint continuous arc between pedestal and two nearby ghost-targets,
  // pulsing — suggests "hits chain to enemies".
  const pulse = 0.4 + 0.35 * Math.sin(t * 5);
  const bolts = [
    { ax: -30, ay: -4 },
    { ax:  34, ay:  2 },
  ];
  ctx.strokeStyle = `rgba(160, 232, 255, ${(0.3 + 0.35 * pulse).toFixed(3)})`;
  ctx.lineWidth = 1.5;
  for (const b of bolts) {
    const sx = p.x, sy = p.y - 14;
    const ex = p.x + b.ax, ey = p.y + b.ay;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    const segs = 4;
    for (let i = 1; i < segs; i++) {
      const f = i / segs;
      const jx = Math.sin(t * 9 + i * 2 + b.ax) * 2.5;
      const jy = Math.cos(t * 8 + i * 3 + b.ay) * 2;
      ctx.lineTo(sx + (ex - sx) * f + jx, sy + (ey - sy) * f + jy);
    }
    ctx.lineTo(ex, ey);
    ctx.stroke();
    // Target dot
    ctx.fillStyle = `rgba(160, 232, 255, ${(0.3 + 0.4 * pulse).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(ex, ey, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
};

TEASERS.hymn_of_embers = (ctx, p, t) => {
  // Translucent aura radius with a slow heartbeat and a faint dashed ring
  // outline — shows both the size and the "you stand inside it" feel.
  const radius = 78;
  const heartbeat = 0.65 + 0.35 * Math.sin(t * 2.4);
  const cx = p.x, cy = p.y - 6;
  const g = ctx.createRadialGradient(cx, cy, radius * 0.15, cx, cy, radius);
  g.addColorStop(0, `rgba(255, 168, 96, ${(0.18 + 0.08 * heartbeat).toFixed(3)})`);
  g.addColorStop(1, 'rgba(255, 168, 96, 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = `rgba(255, 196, 140, ${(0.3 + 0.15 * heartbeat).toFixed(3)})`;
  ctx.lineWidth = 1;
  ctx.setLineDash([5, 7]);
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
};

TEASERS.pyromancer = (ctx, p, t) => {
  // Small fire-blip every ~1.1s, just right of the pedestal.
  const cycle = (t % 1.1) / 1.1;
  if (cycle < 0.7) return;
  const ex = p.x + 18, ey = p.y - 2;
  const growth = (cycle - 0.7) / 0.3;
  const rad = 5 + 22 * growth;
  const a = (1 - growth) * 0.75;
  const g = ctx.createRadialGradient(ex, ey, rad * 0.3, ex, ey, rad);
  g.addColorStop(0,   `rgba(255, 200, 120, ${a.toFixed(3)})`);
  g.addColorStop(0.6, `rgba(240,  90,  40, ${(a * 0.55).toFixed(3)})`);
  g.addColorStop(1,   'rgba(120, 30, 20, 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(ex, ey, rad, 0, Math.PI * 2);
  ctx.fill();
};

TEASERS.soul_burst = (ctx, p, t) => {
  // Expanding violet ring every 0.9s — echoes the real soul-wave.
  const cycle = (t % 0.9) / 0.9;
  const r = 6 + cycle * 30;
  const a = (1 - cycle) * 0.65;
  ctx.strokeStyle = `rgba(200, 160, 255, ${a.toFixed(3)})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(p.x, p.y - 6, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = `rgba(220, 190, 255, ${(a * 0.45).toFixed(3)})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(p.x, p.y - 6, r * 0.65, 0, Math.PI * 2);
  ctx.stroke();
};

TEASERS.explosive_kill = (ctx, p, t) => {
  // Slower pulse than pyro, warmer color, around the pedestal itself.
  const cycle = (t % 1.4) / 1.4;
  if (cycle < 0.6) return;
  const growth = (cycle - 0.6) / 0.4;
  const rad = 8 + 26 * growth;
  const a = (1 - growth) * 0.55;
  const g = ctx.createRadialGradient(p.x, p.y - 4, rad * 0.25, p.x, p.y - 4, rad);
  g.addColorStop(0, `rgba(255, 220, 140, ${a.toFixed(3)})`);
  g.addColorStop(1, 'rgba(180, 80, 40, 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(p.x, p.y - 4, rad, 0, Math.PI * 2);
  ctx.fill();
};
