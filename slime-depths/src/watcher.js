// ============================================================================
// THE WATCHER — a bound presence that comments on your descent.
//
// Design intent: rare, weighty, narrative-baiting. Silence is the default.
// The Watcher only speaks at MILESTONE moments — first time reaching a floor,
// first death, first boss kill, first final-boss approach, first victory.
// Lines are DIRECTIONAL ("you were closer this time") not OBSERVATIONAL
// ("you took the safe path") — the entity implies knowledge of a destination
// the player hasn't yet seen. A handful of per-run variants color deaths by
// depth so each run can earn at most one or two utterances, but many runs
// will earn zero.
//
// Persistence: per-account via storage.js. First-time milestones are marked
// in `state.seen.*` and never fire again. Per-run variants live only in
// `runState` and reset with every watcherOnRunStart().
//
// Tone: grim warden — think Darkest Dungeon Ancestor, not Hades banter. No
// name appears in the UI. Identity is just the sigil (a watching eye) + the
// italic serif voice. The name "The Watcher" only lives in this file and
// future hamlet dialogue; the player builds the association over time.
//
// Visual grammar: top-18% band of screen, free-floating italic Georgia text
// with a small sigil to the left. No box, no corners, no tier-color border.
// Slow fade-in (0.8s), hold (4.5s), slow fade-out (1.2s). If an intro
// (floorCard/bossIntro/phaseIntro) or pickup banner is onscreen, the
// utterance defers until the ceremony ends.
// ============================================================================

import { safeLoadJSON, safeSaveJSON } from './storage.js';

const STORAGE_KEY = 'watcher_v1';

const DEFAULT_STATE = () => ({
  runs: 0,
  deaths: 0,
  highestFloor: 0,
  seen: {
    firstDescent: false,
    firstDeath: false,
    firstFloor2: false,
    firstFloor3: false,
    firstFloor4: false,
    firstBossKill: false,
    firstFinalBossEnter: false,
    firstVictory: false,
  },
});

let state = null;

function loadState() {
  if (state) return state;
  const saved = safeLoadJSON(STORAGE_KEY, null);
  const base = DEFAULT_STATE();
  if (saved && typeof saved === 'object') {
    state = {
      runs: saved.runs | 0,
      deaths: saved.deaths | 0,
      highestFloor: saved.highestFloor | 0,
      seen: { ...base.seen, ...(saved.seen || {}) },
    };
  } else {
    state = base;
  }
  return state;
}

function saveState() {
  if (!state) return;
  safeSaveJSON(STORAGE_KEY, state);
}

// ---- Per-run volatile state ------------------------------------------------
let runState = null;
function resetRun() {
  runState = {
    deathLineFired: false,
  };
}

// ---- Render state ----------------------------------------------------------
let pendingLine = null;      // queued utterance waiting for ceremonies to clear
let currentLine = null;      // the line currently being drawn
let currentStart = 0;        // performance.now()/1000 when current line began fade-in

const FADE_IN_SEC = 0.8;
const HOLD_SEC = 4.5;
const FADE_OUT_SEC = 1.2;
const TOTAL_SEC = FADE_IN_SEC + HOLD_SEC + FADE_OUT_SEC;

function speak(text) {
  // Queue. The render function promotes to `currentLine` when no intro or
  // pickup banner is onscreen, so the Watcher doesn't talk over ceremonies.
  pendingLine = text;
}

// ---- Trigger API -----------------------------------------------------------
// Every hook loads/saves state. First-time milestones win over per-run
// variants when both would fire on the same event.

export function watcherOnRunStart() {
  loadState();
  resetRun();
  state.runs += 1;
  if (!state.seen.firstDescent) {
    state.seen.firstDescent = true;
    speak('Another one descends. I have watched many.');
  }
  saveState();
}

// floorLevel: 1..MAX_FLOORS, the level the player has just died on.
// nearFinalBoss: true if the player died inside the floor-MAX_FLOORS boss room
// with the boss under ~30% HP.
export function watcherOnDeath(floorLevel, nearFinalBoss = false) {
  loadState();
  state.deaths += 1;
  if (!state.seen.firstDeath) {
    state.seen.firstDeath = true;
    saveState();
    speak('You fall. Rise, then. The road is long.');
    return;
  }
  if (!runState || runState.deathLineFired) { saveState(); return; }
  runState.deathLineFired = true;
  if (nearFinalBoss) {
    speak('You were so near. Try again.');
  } else if (floorLevel >= 3) {
    speak('You were closer. That is not nothing.');
  } else {
    speak('The dark takes you shallow.');
  }
  saveState();
}

export function watcherOnFloorEnter(floorLevel) {
  loadState();
  if (floorLevel > state.highestFloor) {
    state.highestFloor = floorLevel;
    saveState();
  }
  if (floorLevel === 2 && !state.seen.firstFloor2) {
    state.seen.firstFloor2 = true;
    saveState();
    speak('You came this far. That is something.');
  } else if (floorLevel === 3 && !state.seen.firstFloor3) {
    state.seen.firstFloor3 = true;
    saveState();
    speak('You surprise me, Knight. Continue.');
  } else if (floorLevel === 4 && !state.seen.firstFloor4) {
    state.seen.firstFloor4 = true;
    saveState();
    speak('The last floor. Few reach it. Fewer return.');
  }
}

export function watcherOnBossClear(floorLevel) {
  loadState();
  if (floorLevel >= 4 && !state.seen.firstVictory) {
    // First final-boss clear wins over first-boss-kill — it's the bigger moment.
    state.seen.firstVictory = true;
    state.seen.firstBossKill = true;  // mark both so neither fires again
    saveState();
    speak('\u2026 so it can be done. Well met, Knight.');
    return;
  }
  if (!state.seen.firstBossKill) {
    state.seen.firstBossKill = true;
    saveState();
    speak('One falls. Good. Turn your eyes downward.');
  }
}

export function watcherOnFinalBossEnter() {
  loadState();
  if (!state.seen.firstFinalBossEnter) {
    state.seen.firstFinalBossEnter = true;
    saveState();
    speak('Ember and king. You have come to the throne.');
  }
}

// ---- Debug / test API ------------------------------------------------------

export function watcherResetForTesting() {
  state = DEFAULT_STATE();
  saveState();
  resetRun();
  pendingLine = null;
  currentLine = null;
}

// Fires an arbitrary line immediately, bypassing state + triggers. For
// __testWatcher('line') — renders the banner for debugging.
export function watcherTestSpeak(text) {
  speak(text || 'A test. The sigil hears you.');
}

export function watcherSnapshot() {
  loadState();
  return {
    runs: state.runs,
    deaths: state.deaths,
    highestFloor: state.highestFloor,
    seen: { ...state.seen },
    hasPending: !!pendingLine,
    hasCurrent: !!currentLine,
  };
}

// ---- Render ----------------------------------------------------------------

// wrapText — simple word-boundary wrap. Kept local so the watcher module has
// no dependency on pedestals.js's helper.
function wrapText(ctx, text, maxWidth) {
  const words = String(text).split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? cur + ' ' + w : w;
    if (cur && ctx.measureText(test).width > maxWidth) {
      lines.push(cur);
      cur = w;
    } else {
      cur = test;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

/**
 * Render the Watcher utterance, if any, in screen space.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w  canvas width
 * @param {number} h  canvas height
 * @param {object} flags  ceremony flags { floorCardTime, bossIntroTime, phaseIntroTime, pickupFlashActive }
 */
export function drawWatcher(ctx, w, h, flags = {}) {
  // Promote pending to current only when no other ceremony is onscreen.
  // This is what makes the Watcher feel RESPECTFUL of the game's other
  // moments — it waits for the floor card to fade before it speaks.
  const ceremonyActive =
    (flags.floorCardTime || 0) > 0 ||
    (flags.bossIntroTime || 0) > 0 ||
    (flags.phaseIntroTime || 0) > 0 ||
    !!flags.pickupFlashActive;

  if (!currentLine && pendingLine && !ceremonyActive) {
    currentLine = pendingLine;
    pendingLine = null;
    currentStart = performance.now() / 1000;
  }
  if (!currentLine) return;

  const now = performance.now() / 1000;
  const t = now - currentStart;
  if (t > TOTAL_SEC) {
    currentLine = null;
    return;
  }

  let alpha;
  if (t < FADE_IN_SEC) alpha = t / FADE_IN_SEC;
  else if (t < FADE_IN_SEC + HOLD_SEC) alpha = 1;
  else alpha = 1 - (t - FADE_IN_SEC - HOLD_SEC) / FADE_OUT_SEC;
  alpha = Math.max(0, Math.min(1, alpha));

  const fontSize = 20;
  const maxW = Math.min(560, w - 160);
  const cx = w / 2;
  const cy = Math.round(h * 0.18);   // top 18% — above combat action, clear of HUD

  ctx.save();
  ctx.font = `italic ${fontSize}px Georgia, serif`;
  const lines = wrapText(ctx, currentLine, maxW);
  const lineH = fontSize * 1.35;
  const totalH = lines.length * lineH;

  // Sigil — a watching eye, positioned to the left of the text block.
  // Outer thin ring, inner dot, subtle breathing halo. Pulses at ~0.8 Hz.
  const sigilX = Math.round(cx - maxW / 2 - 28);
  const sigilY = Math.round(cy);
  const sigilR = 11;
  const breath = 0.75 + 0.25 * Math.sin(now * 1.6);
  const sigilAlpha = alpha * breath;

  // Breathing halo
  const halo = ctx.createRadialGradient(sigilX, sigilY, 2, sigilX, sigilY, sigilR * 3.2);
  halo.addColorStop(0, `rgba(236, 224, 196, ${(alpha * 0.22).toFixed(3)})`);
  halo.addColorStop(1, 'rgba(236, 224, 196, 0)');
  ctx.fillStyle = halo;
  ctx.fillRect(sigilX - sigilR * 3.2, sigilY - sigilR * 3.2, sigilR * 6.4, sigilR * 6.4);

  // Outer ring
  ctx.strokeStyle = `rgba(236, 224, 196, ${(sigilAlpha * 0.85).toFixed(3)})`;
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.arc(sigilX, sigilY, sigilR, 0, Math.PI * 2);
  ctx.stroke();

  // Inner concentric — subtle double-ring for depth
  ctx.strokeStyle = `rgba(236, 224, 196, ${(sigilAlpha * 0.35).toFixed(3)})`;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.arc(sigilX, sigilY, sigilR * 0.55, 0, Math.PI * 2);
  ctx.stroke();

  // Pupil
  ctx.fillStyle = `rgba(236, 224, 196, ${(sigilAlpha * 0.95).toFixed(3)})`;
  ctx.beginPath();
  ctx.arc(sigilX, sigilY, 2.2, 0, Math.PI * 2);
  ctx.fill();

  // Text — italic serif, cream, warm drop shadow
  ctx.fillStyle = `rgba(236, 224, 196, ${alpha.toFixed(3)})`;
  ctx.font = `italic ${fontSize}px Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 2;
  const startY = cy - totalH / 2 + lineH / 2;
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], cx, startY + i * lineH);
  }
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  ctx.restore();
}
