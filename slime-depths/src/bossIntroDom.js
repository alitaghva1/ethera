// ============================================================================
// BOSS INTRO — DOM overlay (replaces the canvas drawImage path)
//
// Why this exists: on certain GPU/driver combos, Chrome's accelerated 2D
// canvas dims drawImage() output even when getImageData returns correct
// bright RGB values. The dev could never repro it; the playtester always
// did. Session after session of "rework the composite" fixes (see git
// history) only confirmed the pixels were correct — the dimming was
// somewhere between canvas backing store and the user's monitor, and
// only on the canvas pathway. <img> tags don't hit that path.
//
// This module swaps the intro to an HTML overlay: <img> for the backdrop,
// styled divs for typography + ornaments, CSS @keyframes for the fade.
// Everything is visible/hidden via a .playing class on the outer div.
// CSS in index.html handles all the styling + the 2.2s animation.
//
// Call `updateBossIntro(bossIntroTime, bossIntroBoss)` once per frame from
// main.js's render(). The module maintains its own "am I showing?" state
// and only touches the DOM when there's a transition to make.
// ============================================================================

const overlay = /** @type {HTMLDivElement} */ (document.getElementById('bossIntroOverlay'));
const backdrop = /** @type {HTMLImageElement} */ (document.getElementById('bossIntroBackdrop'));
const nameEl = /** @type {HTMLDivElement} */ (document.getElementById('bossIntroName'));
const flavorEl = /** @type {HTMLDivElement} */ (document.getElementById('bossIntroFlavor'));
const tagEl = /** @type {HTMLDivElement} */ (document.getElementById('bossIntroTag'));

// Maps the enemy-type id (same as used by the canvas code we're replacing)
// to the JPG filename under public/assets/backdrops/. Keep this in sync
// with the loadImage calls in loader.js.
const BOSS_INTRO_IMG = {
  orc: 'boss_intro_grudnok',
  bone_captain: 'boss_intro_iron_revenant',
  broodmother: 'boss_intro_broodmother',
  ember_tyrant: 'boss_intro_ember_tyrant',
  echo: 'boss_intro_echo_of_self',
  hermit: 'boss_intro_hermit',
};

// Tracks whether the .playing class is currently applied. We only touch the
// class when transitioning, so CSS's animation doesn't get restarted every
// frame. Key insight: adding .playing when it's already present doesn't
// trigger a re-run of the animation (browsers de-dup class additions),
// but clearing + re-adding would — which is the wrong behavior during
// the middle of the intro.
let _showingBossType = null;

/**
 * Sync the overlay state with the game's bossIntro timers. Call once per
 * frame from the main render function. No-ops are cheap (class checks,
 * no DOM writes). Transitions write to the DOM.
 *
 * @param {number} bossIntroTime   Seconds remaining on the intro. 0 = inactive.
 * @param {object|null} bossIntroBoss  The boss object (or null). Has
 *   `.type` (string key into BOSS_INTRO_IMG), `.def.displayName`,
 *   `.def.flavor`, and `._enraged` (boolean for phase-2 "AWAKENED" tag).
 */
export function updateBossIntro(bossIntroTime, bossIntroBoss) {
  const shouldShow = bossIntroTime > 0 && bossIntroBoss;
  const bossType = shouldShow ? bossIntroBoss.type : null;

  if (!shouldShow) {
    if (_showingBossType !== null) {
      _hide();
    }
    return;
  }

  // If we're already showing THIS specific boss, leave the DOM alone —
  // let the CSS animation keep playing. Only act on transitions.
  if (_showingBossType === bossType) return;

  _show(bossIntroBoss, bossType);
}

function _show(bossIntroBoss, bossType) {
  const sceneKey = BOSS_INTRO_IMG[bossType];
  if (!sceneKey) {
    // Unmapped boss type — no backdrop to show. Canvas version drew a
    // flat rgb(22,18,26) panel as a fallback; we skip entirely (looks
    // better than the old fallback on a display that was dimming it).
    return;
  }

  backdrop.src = `assets/backdrops/${sceneKey}.jpg`;
  nameEl.textContent = bossIntroBoss.def?.displayName || 'BOSS';
  flavorEl.textContent = '— ' + (bossIntroBoss.def?.flavor || 'the boss') + ' —';
  tagEl.textContent = bossIntroBoss._enraged ? 'AWAKENED' : 'BOSS';

  // Remove-then-add the class forces the animation to restart cleanly
  // (browsers won't re-run a CSS animation if the class just stays on).
  overlay.classList.remove('playing');
  // Force layout flush so the next class add is a real transition, not
  // a batched no-op. offsetWidth access is the canonical forcing idiom.
  void overlay.offsetWidth;
  overlay.classList.add('playing');

  _showingBossType = bossType;
}

function _hide() {
  overlay.classList.remove('playing');
  _showingBossType = null;
}
