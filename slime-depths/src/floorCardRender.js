// Floor intro card — the big splash when a new floor begins.
//
// Extracted from main.js during the incremental main-split pass. The block
// is ~95 lines of self-contained render: zone backdrop → dark veil → biome-
// tinted particle swirl → halo → typography (roman numeral + name + flavor).
//
// Pure render. Reads state via the caller (main.js owns the floor-card
// timers + names as module-scoped lets). No side effects beyond ctx calls.

import { images as imageCache } from './loader.js';
import { currentBiomePal } from './room.js';

/**
 * Draw the floor-intro card if the timer is active. Called from render()
 * after the intro-gated HUD pass. Early-returns if there's nothing to show,
 * so the caller doesn't need its own guard.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {HTMLCanvasElement}        canvas
 * @param {{
 *   floorCardTime:     number,   // seconds remaining on the total duration
 *   floorCardTotal:    number,   // total duration (3.2s first time, 1.6s repeat)
 *   floorCardName:     string,   // e.g. "THE UNDERCROFT"
 *   floorCardBackdrop: string,   // imageCache key, or falsy for no backdrop
 *   floorCardRoman:    string,   // e.g. "II"
 *   floorCardFlavor:   string,   // one-line mood setter
 * }} state
 */
export function drawFloorCard(ctx, canvas, state) {
  const { floorCardTime, floorCardName, floorCardBackdrop, floorCardRoman, floorCardFlavor } = state;
  if (!(floorCardTime > 0 && floorCardName)) return;

  // Total duration is parameterized so the cinematic skip-on-repeat in
  // main.js can pass a shorter total (1.6s) for floors the player has
  // already seen this profile. Defaults to 3.2 to preserve the original
  // first-time experience.
  const total = state.floorCardTotal || 3.2;
  const t = 1 - floorCardTime / total; // 0 → 1
  // Alpha curve: ease in quickly, hold, ease out.
  let a;
  if (t < 0.15) a = t / 0.15;
  else if (t > 0.82) a = (1 - t) / 0.18;
  else a = 1;
  a = Math.max(0, Math.min(1, a));

  ctx.save();

  // Zone backdrop — painted scenery behind the veil. The backdrop fills
  // the canvas and the dark veil above it fades to black at the edges,
  // so the painting provides atmosphere without fighting the typography.
  const _fcBackdrop = floorCardBackdrop ? imageCache[floorCardBackdrop] : null;
  if (_fcBackdrop) {
    ctx.globalAlpha = a;
    // Full-bleed. Source is 1376x768, canvas is 1280x720 — slight overscan
    // crops the outer edges, keeping the most-painted center.
    ctx.drawImage(_fcBackdrop, 0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 1;
  }

  // Full-screen dark veil — lighter over the backdrop than it was on the
  // pure-black version so the painting reads through. 0.82 → 0.58 when a
  // backdrop is present.
  const _veilAlpha = _fcBackdrop ? a * 0.58 : a * 0.82;
  ctx.fillStyle = 'rgba(8, 5, 12, ' + _veilAlpha.toFixed(3) + ')';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Biome-tinted swirl of particles behind the card text — 40 orbiting motes.
  const biomeId = currentBiomePal()._biomeId || 'vault';
  const swirlCol =
    biomeId === 'crypt'
      ? [170, 220, 255]
      : biomeId === 'vault'
      ? [255, 220, 180]
      : biomeId === 'abyss'
      ? [200, 120, 240]
      : biomeId === 'inferno'
      ? [255, 140, 70]
      : [220, 200, 180];
  const swirlCx = canvas.width / 2;
  const swirlCy = canvas.height / 2;
  const swirlT = performance.now() / 1000;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 40; i++) {
    // Each particle orbits with a unique angular velocity and radius.
    const seed = i * 0.7;
    const baseAng = seed + swirlT * (0.45 + (i % 3) * 0.15);
    const r = 140 + (i % 5) * 40 + Math.sin(swirlT * 1.3 + seed) * 20;
    const px = swirlCx + Math.cos(baseAng) * r;
    const py = swirlCy + Math.sin(baseAng) * r * 0.55; // ellipse for depth
    const pulse = 0.5 + 0.5 * Math.sin(swirlT * 2.4 + seed * 2.1);
    const pa = a * pulse * 0.45;
    ctx.fillStyle = `rgba(${swirlCol[0]},${swirlCol[1]},${swirlCol[2]},${pa.toFixed(3)})`;
    const sz = 2 + (i % 3);
    ctx.fillRect(px - sz / 2, py - sz / 2, sz, sz);
  }
  // A faint halo ring behind the text as a second layer.
  const haloR = 200 + Math.sin(swirlT * 0.8) * 20;
  const halo = ctx.createRadialGradient(swirlCx, swirlCy, 30, swirlCx, swirlCy, haloR);
  halo.addColorStop(0, `rgba(${swirlCol[0]},${swirlCol[1]},${swirlCol[2]},${(a * 0.08).toFixed(3)})`);
  halo.addColorStop(1, `rgba(${swirlCol[0]},${swirlCol[1]},${swirlCol[2]},0)`);
  ctx.fillStyle = halo;
  ctx.fillRect(swirlCx - haloR, swirlCy - haloR, haloR * 2, haloR * 2);
  ctx.restore();

  ctx.globalAlpha = a;

  // Top ornament.
  ctx.strokeStyle = 'rgba(201, 168, 106, 0.85)';
  ctx.lineWidth = 1.2;
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  ctx.beginPath();
  ctx.moveTo(cx - 220, cy - 96);
  ctx.lineTo(cx - 40, cy - 96);
  ctx.moveTo(cx + 40, cy - 96);
  ctx.lineTo(cx + 220, cy - 96);
  ctx.stroke();

  // Roman numeral.
  ctx.fillStyle = '#c9a86a';
  ctx.font = 'italic 22px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('FLOOR ' + floorCardRoman, cx, cy - 96);

  // Big name with soft glow.
  ctx.shadowColor = 'rgba(245, 210, 140, 0.55)';
  ctx.shadowBlur = 20;
  ctx.fillStyle = '#f4d9a0';
  ctx.font = '52px Georgia, serif';
  ctx.fillText(floorCardName, cx, cy - 24);
  ctx.shadowBlur = 0;

  // Bottom flavor.
  ctx.fillStyle = 'rgba(218, 184, 110, 0.75)';
  ctx.font = 'italic 16px Georgia, serif';
  ctx.fillText('— ' + floorCardFlavor + ' —', cx, cy + 36);

  // Bottom ornament.
  ctx.strokeStyle = 'rgba(201, 168, 106, 0.85)';
  ctx.beginPath();
  ctx.moveTo(cx - 220, cy + 76);
  ctx.lineTo(cx - 40, cy + 76);
  ctx.moveTo(cx + 40, cy + 76);
  ctx.lineTo(cx + 220, cy + 76);
  ctx.stroke();

  ctx.restore();
}
