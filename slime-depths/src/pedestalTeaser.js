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

// ── New weapon-signature relic teasers ───────────────────────────────────
// Loop ghost-effects matching each relic's identity. All world-space, all
// pedestal-anchored, all fade with the existing proximity alpha.

TEASERS.mountain_strike = (ctx, p, t) => {
  // Expanding earth shockwave ring every 1.2s. Orange-tinted dust to
  // match the relic's hammer-strike-the-ground fantasy.
  const cycle = (t % 1.2) / 1.2;
  const r = 4 + cycle * 36;
  const a = (1 - cycle) * 0.7;
  ctx.strokeStyle = `rgba(255, 174, 108, ${a.toFixed(3)})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.stroke();
  // Inner thinner ring, slightly behind, doubles the read
  ctx.strokeStyle = `rgba(220, 140, 80, ${(a * 0.4).toFixed(3)})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r * 0.7, 0, Math.PI * 2);
  ctx.stroke();
};

TEASERS.twin_pulse = (ctx, p, t) => {
  // Two ghost-hit dots: the main hit at the pedestal and an echo at a
  // fixed offset, alternating which one pulses brighter to read as
  // "every 2nd hit echoes."
  const cycle = (t % 0.7) / 0.7;
  const phase = Math.floor((t / 0.7)) % 2;
  const mainAlpha = phase === 0 ? 0.85 - cycle * 0.4 : 0.35;
  const echoAlpha = phase === 1 ? 0.85 - cycle * 0.4 : 0.35;
  // Main hit
  ctx.fillStyle = `rgba(160, 232, 255, ${mainAlpha.toFixed(3)})`;
  ctx.beginPath();
  ctx.arc(p.x, p.y - 6, 4, 0, Math.PI * 2);
  ctx.fill();
  // Echo
  ctx.fillStyle = `rgba(160, 232, 255, ${echoAlpha.toFixed(3)})`;
  ctx.beginPath();
  ctx.arc(p.x + 26, p.y - 4, 3, 0, Math.PI * 2);
  ctx.fill();
  // Connecting wisp on the echo beat
  if (phase === 1 && cycle < 0.5) {
    ctx.strokeStyle = `rgba(200, 240, 255, ${(0.4 - cycle * 0.7).toFixed(3)})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(p.x + 4, p.y - 6);
    ctx.lineTo(p.x + 22, p.y - 4);
    ctx.stroke();
  }
};

TEASERS.splintered_light = (ctx, p, t) => {
  // A bolt rises from the pedestal then splits into 3 diverging beams,
  // matching the wand-relic's "shatters into 3 fragments" fantasy.
  const cycle = (t % 1.3) / 1.3;
  const sx = p.x, sy = p.y - 6;
  // Charging stem (0..0.5)
  if (cycle < 0.5) {
    const cA = 0.25 + 0.5 * (cycle / 0.5);
    ctx.strokeStyle = `rgba(220, 200, 255, ${cA.toFixed(3)})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx, sy - 18 * (cycle / 0.5));
    ctx.stroke();
  } else {
    // Split fan (0.5..1.0)
    const splitT = (cycle - 0.5) / 0.5;
    const a = (1 - splitT) * 0.85;
    const len = 26;
    const angles = [-0.55, 0, 0.55];
    for (const ang of angles) {
      const ex = sx + Math.sin(ang) * len * splitT;
      const ey = sy - 18 - Math.cos(ang) * len * splitT;
      ctx.strokeStyle = `rgba(220, 200, 255, ${a.toFixed(3)})`;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(sx, sy - 18);
      ctx.lineTo(ex, ey);
      ctx.stroke();
    }
  }
};

TEASERS.storm_conduit = (ctx, p, t) => {
  // Single arc from pedestal to a ghost target — chain_lightning's
  // simpler cousin: bolt hits, jumps once. Bolt-only color (storm).
  const pulse = 0.5 + 0.4 * Math.sin(t * 6);
  const sx = p.x, sy = p.y - 14;
  const ex = p.x + 30, ey = p.y - 2;
  ctx.strokeStyle = `rgba(160, 232, 255, ${(0.35 + 0.4 * pulse).toFixed(3)})`;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  const segs = 4;
  for (let i = 1; i < segs; i++) {
    const f = i / segs;
    const jx = Math.sin(t * 11 + i * 1.7) * 3;
    const jy = Math.cos(t * 9  + i * 2.4) * 2;
    ctx.lineTo(sx + (ex - sx) * f + jx, sy + (ey - sy) * f + jy);
  }
  ctx.lineTo(ex, ey);
  ctx.stroke();
  // Target dot
  ctx.fillStyle = `rgba(180, 240, 255, ${(0.4 + 0.4 * pulse).toFixed(3)})`;
  ctx.beginPath();
  ctx.arc(ex, ey, 2.5, 0, Math.PI * 2);
  ctx.fill();
};

TEASERS.world_ender = (ctx, p, t) => {
  // A faint ghost-shield at the pedestal that cracks and shatters every
  // 1.6s — matches the relic's "finisher shatters shields" identity.
  const cycle = (t % 1.6) / 1.6;
  const sx = p.x + 18, sy = p.y - 8;
  if (cycle < 0.7) {
    // Shield outline, slowly pulsing
    const a = 0.35 + 0.15 * Math.sin(t * 4);
    ctx.strokeStyle = `rgba(180, 200, 240, ${a.toFixed(3)})`;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(sx, sy, 9, 0, Math.PI * 2);
    ctx.stroke();
    // Inner cross — typical shield iconography
    ctx.strokeStyle = `rgba(180, 200, 240, ${(a * 0.6).toFixed(3)})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(sx, sy - 7); ctx.lineTo(sx, sy + 7);
    ctx.moveTo(sx - 6, sy); ctx.lineTo(sx + 6, sy);
    ctx.stroke();
  } else {
    // Shatter (0.7..1.0) — radial sapphire shards
    const shatterT = (cycle - 0.7) / 0.3;
    const a = (1 - shatterT) * 0.85;
    for (let k = 0; k < 8; k++) {
      const ang = (k / 8) * Math.PI * 2;
      const r1 = 4 + shatterT * 4;
      const r2 = 12 + shatterT * 14;
      ctx.strokeStyle = `rgba(200, 216, 255, ${a.toFixed(3)})`;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(sx + Math.cos(ang) * r1, sy + Math.sin(ang) * r1);
      ctx.lineTo(sx + Math.cos(ang) * r2, sy + Math.sin(ang) * r2);
      ctx.stroke();
    }
  }
};

TEASERS.patient_lens = (ctx, p, t) => {
  // Charging glint that builds for 1s then "crit-pops" — mirrors the
  // wand charge mechanic that the relic enhances.
  const cycle = (t % 1.4) / 1.4;
  const sx = p.x, sy = p.y - 10;
  if (cycle < 0.85) {
    // Build phase: ring tightens + brightens
    const f = cycle / 0.85;
    const r = 14 - f * 8;
    const a = 0.25 + 0.5 * f;
    ctx.strokeStyle = `rgba(220, 200, 140, ${a.toFixed(3)})`;
    ctx.lineWidth = 1 + f * 1.5;
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    // Pop phase: bright flash + outward burst
    const f = (cycle - 0.85) / 0.15;
    const a = (1 - f) * 0.95;
    ctx.fillStyle = `rgba(255, 240, 180, ${a.toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(sx, sy, 8 + f * 14, 0, Math.PI * 2);
    ctx.fill();
    // 4 cardinal rays
    ctx.strokeStyle = `rgba(255, 230, 160, ${a.toFixed(3)})`;
    ctx.lineWidth = 1.4;
    const rayLen = 10 + f * 18;
    for (let k = 0; k < 4; k++) {
      const ang = (k / 4) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(sx + Math.cos(ang) * 6, sy + Math.sin(ang) * 6);
      ctx.lineTo(sx + Math.cos(ang) * rayLen, sy + Math.sin(ang) * rayLen);
      ctx.stroke();
    }
  }
};

TEASERS.vow_eternal = (ctx, p, t) => {
  // Slow "first-strike" sweeping arc — gold blade arc traces once every
  // 1.5s, then a brief gold halo flashes at the pedestal. Reads as
  // "the opening blow."
  const cycle = (t % 1.5) / 1.5;
  const cx = p.x, cy = p.y - 6;
  if (cycle < 0.55) {
    // Arc sweep (0..0.55)
    const f = cycle / 0.55;
    const startA = -Math.PI * 0.7;
    const endA   =  Math.PI * 0.2;
    const sweepA = startA + (endA - startA) * f;
    ctx.strokeStyle = `rgba(255, 214, 128, 0.7)`;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(cx, cy, 16, startA, sweepA);
    ctx.stroke();
  } else {
    // Halo flash (0.55..1.0)
    const f = (cycle - 0.55) / 0.45;
    const a = (1 - f) * 0.55;
    ctx.fillStyle = `rgba(255, 214, 128, ${a.toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(cx, cy, 18 + f * 8, 0, Math.PI * 2);
    ctx.fill();
  }
};

TEASERS.razor_pace = (ctx, p, t) => {
  // 5-tally rhythm: 4 small ticks then 1 big crescendo. Reads as
  // "every 5th hit pops" without text.
  const cycle = (t % 1.5) / 1.5;
  const slot = Math.floor(cycle * 5);  // 0..4
  const slotF = (cycle * 5) % 1;       // 0..1 within slot
  const baseX = p.x - 16, baseY = p.y - 6;
  for (let i = 0; i < 5; i++) {
    const x = baseX + i * 8;
    let a = 0.3;
    let r = 2.5;
    if (i < slot)      a = 0.65;
    if (i === slot)    { a = 0.65 + 0.3 * slotF; r = 2.5 + slotF * 0.6; }
    if (i === 4 && slot === 4) { a = 0.95; r = 4.5; }
    ctx.fillStyle = `rgba(176, 224, 255, ${a.toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(x, baseY, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // 5th-tick crescendo flash
  if (slot === 4 && slotF > 0.3) {
    const f = (slotF - 0.3) / 0.7;
    const a = (1 - f) * 0.7;
    ctx.fillStyle = `rgba(255, 255, 255, ${a.toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(baseX + 32, baseY, 6 + f * 6, 0, Math.PI * 2);
    ctx.fill();
  }
};
