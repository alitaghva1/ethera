// Onboarding tips — show each tip at most once per player (persisted to localStorage).
// Tips are triggered by gameplay events; rendering goes through the unified
// top-right notification rail (notifications.js) so they share an anchor
// zone with relic pickups, fusion announcements, and codex unlocks.
import { safeLoadJSON, safeSaveJSON } from './storage.js';
import { synthPing } from './synth.js';
import { pushNotification } from './notifications.js';

const KEY = 'ethera:seen_tips:v1';

const seen = new Set();

export function loadTips() {
  const arr = safeLoadJSON(KEY, null, Array.isArray);
  if (arr) for (const id of arr) seen.add(id);
}

function saveTips() {
  safeSaveJSON(KEY, [...seen]);
}

// Predefined tips for recognition & prevention of typos.
// Voice rules: restrained, specific, second-person implied. Under ~90 chars
// each. One mechanic per tip — don't cram two lessons together.
export const TIPS = {
  // ----- Controls & core combat (shown on first use) -----
  first_combat:    { text: 'WASD move · LMB primary · Space SHIELD · Q dash · RMB swap weapons' },
  first_starting_hp: { text: 'Three hearts is your starting pool. Sanctuaries mend; relics expand. Be careful early.' },
  // Was first_dodge — kept the ID so save data + tip-seen flags persist.
  // The mechanic is now SHIELD: Space raises a front-cone block, and the
  // first 0.10s is a perfect-block that grants a counter window.
  first_dodge:     { text: 'Press SPACE to raise your SHIELD — face an enemy attack to PERFECT-BLOCK' },
  first_dash:      { text: 'Press Q to dash-strike through enemies (sword only · 2x damage · 5s CD)' },
  first_charge:    { text: 'Hold LMB for a charged heavy swing — releases a big AoE blow' },
  // Now applies to BLAST charged bolts (formerly wand-only). The relic
  // hero.boltCritOnCharge fires for any blast bolt regardless of slot.
  first_wand_charge: { text: 'Hold LMB while wielding BLAST for a charged bolt — pierces enemies, crits' },
  // ----- Hit feedback (review #5 onboarding pass) -----
  first_crit:      { text: 'Chain attacks rapidly to build combo — at CHAIN 5+ you deal bonus damage' },
  first_counter:   { text: 'Perfect-block → next hit is a COUNTER — guaranteed crit and heavier knockback' },
  first_execute:   { text: 'Enemies below 40% HP take +50% damage — finish the wounded first' },
  first_finisher:  { text: 'Every 3rd swing is a FINISHER — each weapon pays off differently' },
  // ----- Enemies & affixes -----
  first_vanguard:  { text: 'Shielded enemies block frontal attacks — flank them to break through' },
  first_elite:     { text: 'Elite affixes — F(rost) · E(mber) · V(enom) · W(arded). Hold TAB to inspect any elite.' },
  // ----- Build / discovery -----
  first_fusion:    { text: 'FUSION FORGED — two relics combine into a named effect. Find more by stacking compatible picks' },
  first_resonance: { text: 'RESONANCE — owning 3 relics of one theme grants a passive bonus. 5 reaches ASCENDANCE' },
  // Wand class retired — sword variants (sword/dagger/hammer) and the
  // BLAST slot are both paths now. Most relics affect both weapons.
  first_weaponOnly:{ text: 'Some relics scale a specific ability — your SWORD, BLAST, SHIELD, or all three' },
  // ----- Rooms -----
  first_descent_dungeon: { text: 'A door waits north. Walk through to descend. Press M anytime to see the floor map.' },
  first_blood_gate: { text: 'A BLOOD GATE — offer HP to break the seal. The room beyond holds something legendary.' },
  first_shop: { text: 'A SHOP — three relics. Buy what you can afford; the rest stay until you go.' },
  first_pedestal:  { text: 'Pedestals come in groups — claim one with E (the others vanish). Press R to reroll the offer (gold cost scales with floor).' },
  first_altar:     { text: 'Altar room — relics here cost HP, not gold. The ruin prefers deliberate pacts' },
  first_trove:     { text: 'Trove room — the urns are worth your time. Gold, hearts, and larger coin hide inside' },
  first_chestroom: { text: 'Treasure chest room — most chests are real. SOME are MIMICS. You learn by opening' },
  first_boss:      { text: 'Boss — watch the telegraph color. A wider red arc signals a heavier attack' },
  first_low_hp:    { text: 'At or below 30% HP: your screen pulses red — sanctuaries mend what they can' },
  // ----- Modes -----
  first_daily:     { text: 'Daily challenges share today\'s curse + relic with all players — build your streak' },
  // ----- Hub + encounters -----
  first_hamlet:    { text: 'The hamlet grows between descents — services persist. Visit when you return' },
  first_descent_hint: { text: 'Walk to the portal to descend. Press E near any NPC to speak with them.' },
  first_wanderer:  { text: 'A wanderer — gold for a trade, only this sanctuary. They do not wait long' },
};

// Public API. Routes the tip text through the unified notification rail.
// Returns true if the tip is freshly fired (first time seen this profile);
// false if it's a repeat or unknown id.
export function showTip(id) {
  if (!TIPS[id] || seen.has(id)) return false;
  seen.add(id);
  saveTips();
  // Subtle synth ping — audio cue draws the eye to the new banner sliding
  // in. Tuned to match the parchment-tome aesthetic: 1100 Hz, 0.18s, low vol.
  try { synthPing(1100, 0.18, 0.20); } catch (_e) {}
  pushNotification({ kind: 'tip', body: TIPS[id].text });
  return true;
}

// Back-compat shims — main.js still calls updateTips(realDt) and
// drawTip(ctx, w) in its tick + render pipeline. Real lifecycle now lives
// in notifications.js, so these are no-ops. Keeping them avoids a
// cross-file refactor; the next cleanup pass can drop the call sites.
export function updateTips(_dt) { /* no-op — see notifications.js */ }
export function drawTip(_ctx, _w) { /* no-op — see notifications.js */ }
