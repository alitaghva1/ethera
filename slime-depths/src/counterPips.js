// Visible proc counters — tiny themed pip rows that float under the hero's
// feet and fill as each proc relic's internal counter grows. Flashes bright
// on trigger, then resets. Turns invisible "every 3rd hit" math into a
// meter the player can watch.
//
// Current rows (expand by adding defs to PIP_ROWS below):
//   - chain_lightning  → 3 ice-blue pips, trigger on 3rd hit
//   - pyromancer       → 4 (or 2 with Conflagration) orange pips
//   - soul_burst       → 5 violet pips, trigger on 5th kill
//
// Drawn in world space (after drawHero/enemies, before HUD) so pips pan with
// the camera. Flash state lives on hero.* fields, lazily created — no schema
// change to resetHero is required. Flash fields:
//   hero.chainFlashT, hero.pyroFlashT, hero.soulFlashT
import { hero } from './hero.js';

const PIP_W = 4;
const PIP_H = 3;
const PIP_GAP = 2;
const ROW_GAP = 3;
const ROW_Y_OFFSET = 22;   // below hero center — clears the feet

// Fixed flash duration per trigger. 0.3s reads as a quick "pop" without
// lingering long enough to be mistaken for the steady fill state.
const FLASH_DURATION = 0.3;

// ---- Public: triggers set these via markFlashFired() ----------------------
// Called from the same lines that reset the counter in hero.js / enemies.js.
export function markChainFired()  { hero.chainFlashT = FLASH_DURATION; }
export function markPyroFired()   { hero.pyroFlashT  = FLASH_DURATION; }
export function markSoulFired()   { hero.soulFlashT  = FLASH_DURATION; }

// ---- Tick / Draw ----------------------------------------------------------
export function tickCounterPips(dt) {
  if (hero.chainFlashT > 0) hero.chainFlashT = Math.max(0, hero.chainFlashT - dt);
  if (hero.pyroFlashT  > 0) hero.pyroFlashT  = Math.max(0, hero.pyroFlashT  - dt);
  if (hero.soulFlashT  > 0) hero.soulFlashT  = Math.max(0, hero.soulFlashT  - dt);
}

function drawPipRow(ctx, cx, y, filled, total, color, flashT) {
  const rowW = total * PIP_W + (total - 1) * PIP_GAP;
  const x0 = Math.round(cx - rowW / 2);
  const isFlash = flashT > 0;
  // Flash pulses across the full row during FLASH_DURATION, fading out.
  const flashAlpha = isFlash ? Math.min(1, flashT / (FLASH_DURATION * 0.6)) : 0;

  for (let i = 0; i < total; i++) {
    const x = x0 + i * (PIP_W + PIP_GAP);
    // Muted slot (always visible so the player knows the row exists).
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = '#000';
    ctx.fillRect(x, y, PIP_W, PIP_H);
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, PIP_W - 1, PIP_H - 1);

    const lit = isFlash || i < filled;
    if (lit) {
      ctx.globalAlpha = isFlash ? 0.6 + 0.4 * flashAlpha : 0.9;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, PIP_W, PIP_H);
    }
  }
  // Halo glow during flash — a soft 2px bloom under the row.
  if (isFlash) {
    const glowW = total * PIP_W + (total - 1) * PIP_GAP + 8;
    const glowX = x0 - 4;
    const g = ctx.createRadialGradient(cx, y + PIP_H / 2, 2, cx, y + PIP_H / 2, glowW / 2);
    g.addColorStop(0, color + 'cc');
    g.addColorStop(1, color + '00');
    ctx.globalAlpha = 0.55 * flashAlpha;
    ctx.fillStyle = g;
    ctx.fillRect(glowX, y - 4, glowW, PIP_H + 8);
  }
  ctx.globalAlpha = 1;
}

export function drawCounterPips(ctx) {
  const rows = [];
  if (hero.chainLightning) {
    rows.push({ filled: hero.chainCount | 0, total: 3, color: '#a0e8ff', flashT: hero.chainFlashT || 0 });
  }
  if (hero.pyromancer) {
    const total = hero.fusionConflagration ? 2 : 4;
    rows.push({ filled: hero.pyroCount | 0, total, color: '#ffa850', flashT: hero.pyroFlashT || 0 });
  }
  if (hero.soulBurst) {
    // soulKillCount is monotonic, not modulated — derive display from it.
    const filled = (hero.soulKillCount | 0) % 5;
    rows.push({ filled, total: 5, color: '#c8a0ff', flashT: hero.soulFlashT || 0 });
  }
  if (rows.length === 0) return;

  let y = Math.round(hero.y + ROW_Y_OFFSET);
  for (const r of rows) {
    drawPipRow(ctx, hero.x, y, r.filled, r.total, r.color, r.flashT);
    y += PIP_H + ROW_GAP;
  }
}
