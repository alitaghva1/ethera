// Onboarding tips — show each tip at most once per player (persisted to localStorage).
// Tips are triggered by gameplay events; they appear as a small top-center banner
// with subtle slide-in + 5s auto-dismiss.
import { safeLoadJSON, safeSaveJSON } from './storage.js';
import { synthPing } from './synth.js';

const KEY = 'ethera:seen_tips:v1';

const seen = new Set();

export function loadTips() {
  const arr = safeLoadJSON(KEY, null, Array.isArray);
  if (arr) for (const id of arr) seen.add(id);
}

function saveTips() {
  safeSaveJSON(KEY, [...seen]);
}

// Active tip state — one at a time, auto-dismiss
let active = null;       // { text, time, totalLife }

// Predefined tips for recognition & prevention of typos.
// Voice rules: restrained, specific, second-person implied. Under ~90 chars
// each (fits the 580px banner without wrapping). One mechanic per tip —
// don't cram two lessons together.
export const TIPS = {
  // ----- Controls & core combat (shown on first use) -----
  first_combat:    { text: 'Move with WASD · Attack with LMB · Aim with mouse' },
  first_dodge:     { text: 'Press SPACE to dodge — time it with an enemy attack for a PERFECT DODGE' },
  first_dash:      { text: 'Press Q to dash-strike through enemies (2x damage, 5s cooldown)' },
  first_charge:    { text: 'Hold LMB for a charged heavy swing — releases a big AoE blow' },
  first_wand_charge: { text: 'Hold LMB for a charged wand bolt — pierces three enemies and hits harder' },
  // ----- Hit feedback (review #5 onboarding pass) -----
  first_crit:      { text: 'Chain attacks rapidly to build combo — at CHAIN 5+ you deal bonus damage' },
  first_counter:   { text: 'Perfect dodge → next hit is a COUNTER — guaranteed crit and heavier knockback' },
  first_execute:   { text: 'Enemies below 40% HP take +50% damage — finish the wounded first' },
  first_finisher:  { text: 'Every 3rd swing is a FINISHER — each weapon pays off differently' },
  // ----- Enemies & affixes -----
  first_vanguard:  { text: 'Shielded enemies block frontal attacks — flank them to break through' },
  first_elite:     { text: 'Elite affixes — F(rost) slows · E(mber) burns · V(enom) poisons · W(arded) resists' },
  // ----- Build / discovery -----
  first_fusion:    { text: 'FUSION FORGED — two relics combine into a named effect. Find more by stacking compatible picks' },
  first_resonance: { text: 'RESONANCE — owning 3 relics of one theme grants a passive bonus. 5 reaches ASCENDANCE' },
  first_weaponOnly:{ text: 'Some relics only appear for your weapon class — sword, dagger, hammer, or wand' },
  // ----- Rooms -----
  first_pedestal:  { text: 'Walk onto a pedestal to claim the relic' },
  first_altar:     { text: 'Altar room — relics here cost HP, not gold. The ruin prefers deliberate pacts' },
  first_trove:     { text: 'Trove room — the urns are worth your time. Gold, hearts, and larger coin hide inside' },
  first_chestroom: { text: 'Treasure chest room — most chests are real. SOME are MIMICS. You learn by opening' },
  first_boss:      { text: 'Boss — watch the telegraph color. A wider red arc signals a heavier attack' },
  first_low_hp:    { text: 'At or below 30% HP: your screen pulses red — sanctuaries heal between floors' },
  // ----- Modes -----
  first_daily:     { text: 'Daily challenges share today\'s curse + relic with all players — build your streak' },
  // ----- Hub + encounters -----
  first_hamlet:    { text: 'The hamlet grows between descents — services persist. Visit when you return' },
  first_descent_hint: { text: 'Walk to the portal and press E to descend. NPCs will glow when you\'re near.' },
  first_wanderer:  { text: 'A wanderer — gold for a trade, only this sanctuary. They do not wait long' },
};

export function showTip(id) {
  if (!TIPS[id] || seen.has(id)) return false;
  seen.add(id);
  saveTips();
  active = { text: TIPS[id].text, time: 5.5, totalLife: 5.5 };
  // Subtle synth ping — audio cue draws the eye to the new banner
  // sliding in. Without this, the tip can fade in unnoticed if the
  // player isn't already looking at the top of the screen. Tuned to
  // match the parchment-tome aesthetic: 1100 Hz, 0.2s, low volume.
  try { synthPing(1100, 0.18, 0.20); } catch (_e) {}
  return true;
}

export function updateTips(dt) {
  if (!active) return;
  // Defer: when the center banner slot is claimed by another system (codex
  // entry, room label, etc.), pause the tip timer so we don't burn its life
  // while hidden. It'll render naturally after the slot frees.
  if (typeof window !== 'undefined' && window.__centerBannerActive) return;
  active.time -= dt;
  if (active.time <= 0) active = null;
}

// Draws a top-center banner with slide-in + fade. Call from HUD-space (not world).
// Tome-style parchment look: vertical gradient, gold border with end-caps,
// soft outer glow, and a bounce-back slide so the tip lands like it's being
// set down on the page.
export function drawTip(ctx, w) {
  if (!active) return;
  // Hide while another system owns the center banner slot.
  if (typeof window !== 'undefined' && window.__centerBannerActive) return;
  const t = active.time / active.totalLife;
  // Fade in first 0.35, hold, fade out last 0.25
  const p = 1 - t;
  const inA = Math.min(1, p / 0.12);
  const outA = t < 0.2 ? t / 0.2 : 1;
  const a = Math.max(0, Math.min(1, Math.min(inA, outA)));
  // Slide down from above with a small bounce-back overshoot
  const slideProgress = Math.min(1, p / 0.35);
  const bounce = slideProgress < 0.75
    ? (1 - Math.cos(slideProgress * Math.PI * 1.3)) * -26
    : (1 - slideProgress) * 6;     // overshoot and settle
  const slideY = bounce;
  ctx.save();
  ctx.globalAlpha = a;
  const boxW = 580;
  const boxH = 46;
  const bx = (w - boxW) / 2;
  const by = 60 + slideY;
  // Soft outer glow — parchment feel
  const glow = ctx.createRadialGradient(bx + boxW / 2, by + boxH / 2, boxW * 0.2,
                                         bx + boxW / 2, by + boxH / 2, boxW * 0.7);
  glow.addColorStop(0, 'rgba(201, 168, 106, 0.18)');
  glow.addColorStop(1, 'rgba(201, 168, 106, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(bx - 40, by - 30, boxW + 80, boxH + 60);
  // Tome-style vertical gradient
  const bg = ctx.createLinearGradient(0, by, 0, by + boxH);
  bg.addColorStop(0, 'rgba(28, 18, 26, 0.95)');
  bg.addColorStop(1, 'rgba(14, 8, 16, 0.95)');
  ctx.fillStyle = bg;
  ctx.fillRect(bx, by, boxW, boxH);
  // Gold border
  ctx.strokeStyle = 'rgba(201, 168, 106, 0.75)';
  ctx.lineWidth = 1.3;
  ctx.strokeRect(bx + 0.5, by + 0.5, boxW - 1, boxH - 1);
  // Inner stripe
  ctx.strokeStyle = 'rgba(201, 168, 106, 0.32)';
  ctx.lineWidth = 1;
  ctx.strokeRect(bx + 4.5, by + 4.5, boxW - 9, boxH - 9);
  // Ornate corner diamonds — tiny accents at each corner
  ctx.fillStyle = '#c9a86a';
  const corner = [[bx + 5, by + 5], [bx + boxW - 5, by + 5], [bx + 5, by + boxH - 5], [bx + boxW - 5, by + boxH - 5]];
  for (const [cx, cy] of corner) {
    ctx.fillRect(cx - 1, cy, 2, 1);
    ctx.fillRect(cx, cy - 1, 1, 2);
  }
  // TIP label with ornamental bracket
  ctx.fillStyle = '#c9a86a';
  ctx.font = 'italic bold 10px Georgia, serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('\u2014 A WORD OF GUIDANCE \u2014', bx + 16, by + 14);
  // Tip body — italic serif for "journal entry" feel
  ctx.fillStyle = '#f4d9a0';
  ctx.font = 'italic 13px Georgia, serif';
  ctx.fillText(active.text, bx + 16, by + 31);
  ctx.restore();
}
