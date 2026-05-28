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
  first_starting_hp: { text: 'One heart. Every unblocked hit ends the run. Time SHIELD to perfect-block — relics + Vitality Charm grow your pool.' },
  // Was first_dodge — kept the ID so save data + tip-seen flags persist.
  // The mechanic is now SHIELD: Space raises a front-cone block, and the
  // first 0.10s is a perfect-block that grants a counter window.
  // Tightened phrasing: dropped redundant "raise" verb (was "raise your
  // SHIELD ... time the raise") and renamed perfect-block to its visual
  // bracket "the white ring" — players have just seen the perfect-block
  // window indicator and can map text→visual cleanly.
  first_dodge:     { text: 'Press SPACE for SHIELD — time it as an attack lands for a PERFECT-BLOCK + counter' },
  first_dash:      { text: 'Press Q to dash-strike through enemies (sword only · 2x damage · 5s CD)' },
  // Wizard-kit Sprint 2B: Q changes meaning by active weapon. Sword Q =
  // dash strike (commit + damage); Blast Q = blink (escape + reposition).
  // Without this tip, a player who swaps to blast and presses Q expecting
  // dash damage gets a teleport-with-no-hit and may think Q is broken.
  first_blink:     { text: 'Q while BLAST is active → BLINK — short teleport, no damage, 3.5s CD' },
  // Wizard-kit Sprint 2A: weapon swap is fundamental to the build but
  // discoverable only via first_combat's terse mention. This tip fires
  // on the FIRST successful swap so the player knows the input registered
  // and can rely on it (vs assuming the swap failed).
  first_swap:      { text: 'Weapon SWAPPED — sword and blast share the same hand. RMB / 1 / 2 / wheel any time' },
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
  first_descent_dungeon: { text: 'A door waits north. Walk through to descend. Press M anytime for the floor map.' },
  first_blood_gate: { text: 'A BLOOD GATE — offer HP to break the seal. The room beyond holds something legendary.' },
  first_shop: { text: 'A SHOP — three relics. Buy what you can afford; the rest stay until you go.' },
  // Reroll prompt is rendered ON the pedestal in-context (pedestals.js)
  // so the tip only needs to teach the claim mechanic — splitting two
  // lessons across one tip violated the "one mechanic per tip" voice rule.
  first_pedestal:  { text: 'Pedestals come in groups — claim one with E. The others vanish.' },
  first_altar:     { text: 'Altar room — relics here cost HP, not gold. The ruin prefers deliberate pacts' },
  first_trove:     { text: 'Trove room — the urns are worth your time. Gold, hearts, and larger coin hide inside' },
  first_chestroom: { text: 'Treasure chest room — most chests are real. SOME are MIMICS. You learn by opening' },
  first_boss:      { text: 'Boss — watch the telegraph color. A wider red arc signals a heavier attack' },
  // Tip text rewritten alongside the HUD pulse-fix that made the pulse
  // also fire at literal 1 HP (1 HP design starts at hpFrac 1.0, which
  // never crossed the old 30% threshold). The text now describes the
  // SIGNAL ("screen pulses red, heart halos crimson") rather than the
  // gate, so it reads correctly for both 1/1 and 1/4 cases.
  first_low_hp:    { text: 'Critical HP — your screen pulses red and the heart halos crimson. Sanctuaries mend what they can.' },
  // ----- Modes -----
  first_daily:     { text: 'Daily challenges share today\'s curse + relic with all players — build your streak' },
  // ----- Hub + encounters -----
  first_hamlet:    { text: 'The hamlet grows between descents — services persist. Visit when you return' },
  // Fired the FIRST time a player tries a combat input (LMB / RMB / Q /
  // 1 / 2 / wheel) inside the hamlet. Without this beat, suppressed
  // inputs feel like the controller broke. The line is diegetic — the
  // hamlet is at peace, the blade settles — rather than a UI scold.
  first_hamlet_peace: { text: 'Your blade rests here — the hamlet keeps no quarrel with itself' },
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
