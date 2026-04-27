// Visible proc counters — tiny themed pip rows that float under the hero's
// feet and fill as each proc relic's internal counter grows. Flashes bright
// on trigger, then resets. Turns invisible "every 3rd hit" math into a
// meter the player can watch.
//
// Current rows (expand by adding defs to drawCounterPips below):
//   - chain_lightning  → 3 ice-blue pips, trigger on 3rd hit
//   - pyromancer       → 4 (or 2 with Conflagration) orange pips
//   - soul_burst       → 5 violet pips, trigger on 5th kill
//   - arcane_quiver    → 4 violet pips, trigger on 4th hit splash
//   - ringing_steel    → 5 gold pips, FILLS BUT DOESN'T TRIGGER (stacks
//     are consumed across many hits — flash on chain reset)
//   - twin_pulse       → 2 cyan pips, trigger on every 2nd dagger hit
//   - mountain_strike  → 3 orange pips, trigger on every 3rd hammer hit
//   - razor_pace       → 5 cyan pips, trigger on the 5th dagger hit
//
// Drawn in world space (after drawHero/enemies, before HUD) so pips pan with
// the camera. Flash state lives on hero.* fields, lazily created — no schema
// change to resetHero is required. Flash fields:
//   hero.chainFlashT, hero.pyroFlashT, hero.soulFlashT,
//   hero.quiverFlashT, hero.ringingFlashT, hero.twinFlashT,
//   hero.mountainFlashT, hero.razorFlashT
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
export function markChainFired()    { hero.chainFlashT = FLASH_DURATION; }
export function markPyroFired()     { hero.pyroFlashT  = FLASH_DURATION; }
export function markSoulFired()     { hero.soulFlashT  = FLASH_DURATION; }
export function markQuiverFired()   { hero.quiverFlashT = FLASH_DURATION; }
export function markRingingFired()  { hero.ringingFlashT = FLASH_DURATION; }
export function markTwinFired()     { hero.twinFlashT = FLASH_DURATION; }
export function markMountainFired() { hero.mountainFlashT = FLASH_DURATION; }
export function markRazorFired()    { hero.razorFlashT = FLASH_DURATION; }

// ---- Tick / Draw ----------------------------------------------------------
export function tickCounterPips(dt) {
  if (hero.chainFlashT > 0)    hero.chainFlashT = Math.max(0, hero.chainFlashT - dt);
  if (hero.pyroFlashT  > 0)    hero.pyroFlashT  = Math.max(0, hero.pyroFlashT  - dt);
  if (hero.soulFlashT  > 0)    hero.soulFlashT  = Math.max(0, hero.soulFlashT  - dt);
  if (hero.quiverFlashT > 0)   hero.quiverFlashT = Math.max(0, hero.quiverFlashT - dt);
  if (hero.ringingFlashT > 0)  hero.ringingFlashT = Math.max(0, hero.ringingFlashT - dt);
  if (hero.twinFlashT > 0)     hero.twinFlashT = Math.max(0, hero.twinFlashT - dt);
  if (hero.mountainFlashT > 0) hero.mountainFlashT = Math.max(0, hero.mountainFlashT - dt);
  if (hero.razorFlashT > 0)    hero.razorFlashT = Math.max(0, hero.razorFlashT - dt);
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
  // ARCANE QUIVER — every 4th melee hit splashes. Weapon-agnostic so it
  // shows on any weapon; arcaneQuiverHits is monotonic so we mod down.
  if (hero.arcaneQuiver) {
    const filled = (hero.arcaneQuiverHits | 0) % 4;
    rows.push({ filled, total: 4, color: '#c8a0ff', flashT: hero.quiverFlashT || 0 });
  }
  // RINGING STEEL — sword-only. ringingSteelStacks is already capped at
  // 5 so it shows the actual stack count, not a mod. Stacks decay with
  // the swing chain so the row drains itself; flash only on chain reset.
  if (hero.ringingSteel && hero.weapon === 'sword') {
    rows.push({ filled: hero.ringingSteelStacks | 0, total: 5, color: '#ffd680', flashT: hero.ringingFlashT || 0 });
  }
  // TWIN PULSE — dagger-only. twinPulseTick % 2 (alternating).
  if (hero.twinPulse && hero.weapon === 'dagger') {
    const filled = (hero.twinPulseTick | 0) % 2;
    rows.push({ filled, total: 2, color: '#a0e8ff', flashT: hero.twinFlashT || 0 });
  }
  // MOUNTAIN STRIKE — hammer-only. Counter mod 3.
  if (hero.mountainStrike && hero.weapon === 'hammer') {
    const filled = (hero.mountainStrikeCounter | 0) % 3;
    rows.push({ filled, total: 3, color: '#ffae6c', flashT: hero.mountainFlashT || 0 });
  }
  // RAZOR PACE — dagger-only. razorPaceHits caps at 5 then resets, so
  // shows real progress without modulation.
  if (hero.razorPace && hero.weapon === 'dagger') {
    rows.push({ filled: hero.razorPaceHits | 0, total: 5, color: '#b0e0ff', flashT: hero.razorFlashT || 0 });
  }
  if (rows.length === 0) return;

  let y = Math.round(hero.y + ROW_Y_OFFSET);
  for (const r of rows) {
    drawPipRow(ctx, hero.x, y, r.filled, r.total, r.color, r.flashT);
    y += PIP_H + ROW_GAP;
  }
}
