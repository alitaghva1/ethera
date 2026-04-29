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
// Visual grammar (post-polish pass): top-7% band of screen — out of the
// combat eye-zone, into the upper-letterbox area where subtitles live.
// Free-floating italic Georgia text at 14px (was 20) with a smaller
// sigil to the left (was 11px ring → 7px). Reads as "subtitle / inner
// monologue" rather than a center-screen banner.
//
// Reveal: short sigil fade-in (0.3s) + character-by-character type-on
// reveal of the text (~0.5s) so it reads as the watcher SPEAKING, not
// a banner appearing all at once. A soft synthPing chime fires on
// speak() — non-intrusive eye-draw like a distant bell. Hold 3.0s,
// fade-out 1.0s. Total dwell 4.3s (was 6.5s).
//
// Defers behind floorCard/bossIntro/phaseIntro/pickup-flash so the
// utterance never speaks over a higher-priority ceremony.
// ============================================================================

import { safeLoadJSON, safeSaveJSON } from './storage.js';
import { images } from './loader.js';
import { synthPing } from './synth.js';
import { wrapText } from './textLayout.js';

const STORAGE_KEY = 'watcher_v1';

const DEFAULT_STATE = () => ({
  runs: 0,
  deaths: 0,
  highestFloor: 0,
  lastRunAt: 0,                 // ms timestamp (Date.now()) of last watcherOnRunStart
  lastSpokenLine: '',           // last utterance this Watcher has spoken (for summary ledger)
  seen: {
    firstDescent: false,
    firstDeath: false,
    firstFloor2: false,
    firstFloor3: false,
    firstFloor4: false,
    firstBossKill: false,
    firstFinalBossEnter: false,
    firstVictory: false,
    firstPostVictoryDescent: false,  // first run AFTER first victory
    firstAscension: false,            // first run started with an ascension tier
    deathToll10: false,
    deathToll25: false,
    deathToll50: false,
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
      lastRunAt: Number(saved.lastRunAt) || 0,
      lastSpokenLine: typeof saved.lastSpokenLine === 'string' ? saved.lastSpokenLine : '',
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
// pendingQueue is a small FIFO (cap 3) so milestones fired in rapid succession
// (e.g. boss clear + floor enter + first-floor-N on the same tick) don't
// silently drop each other. The earliest queued line always wins.
const PENDING_CAP = 3;
let pendingQueue = [];       // array of strings waiting for ceremonies to clear
let currentLine = null;      // the line currently being drawn
let currentStart = 0;        // performance.now()/1000 when current line began fade-in
// lastPausedStamp — performance.now() stamp when the player paused. Used to
// shift currentStart forward on unpause so the fade timer doesn't advance
// while the pause overlay is up.
let lastPausedStamp = 0;

// Timing (post-polish pass — total dwell cut 6.5s → 4.3s):
//   FADE_IN — sigil fades in (text uses TYPE_ON instead of fade)
//   TYPE_ON — characters reveal one-by-one; reads as "spoken" not "shown"
//   HOLD    — full text held; player has time to read 1-2 wrapped lines
//   FADE_OUT— sigil + text fade together
const FADE_IN_SEC = 0.3;
const TYPE_ON_SEC = 0.5;     // text reveals char-by-char over this duration
const HOLD_SEC = 3.0;
const FADE_OUT_SEC = 1.0;
const TOTAL_SEC = FADE_IN_SEC + HOLD_SEC + FADE_OUT_SEC;
// Note: TYPE_ON overlaps with FADE_IN + early HOLD, so it's not added
// to TOTAL_SEC — see render code in drawWatcher.

function speak(text) {
  if (!text) return;
  // FIFO — preserve the EARLIEST queued milestone on burst. If the queue is
  // already at cap, drop the newest (not the oldest) — losing a later line
  // to keep an earlier milestone is the correct trade for a scarcity-first
  // design.
  if (pendingQueue.length >= PENDING_CAP) return;
  pendingQueue.push(text);
  // Record for the run-summary ledger even if the line never reaches the
  // screen (e.g. player alt-tabs immediately). The ledger is about what the
  // Watcher spoke, not what the player saw.
  if (state) {
    state.lastSpokenLine = text;
    saveState();
  }
}

// Soft "distant bell" chime that announces a Watcher utterance. Tuned to
// be eye-drawing without alarming — 760 Hz is a low brassy tone, low
// volume so it sits behind ambient pad without clipping over it. Fired
// at the moment a queued line PROMOTES to currentLine (i.e. when it
// actually starts displaying), not on speak() — so deferred lines
// don't ring while a ceremony is still on screen.
function playWatcherChime() {
  try { synthPing(760, 0.32, 0.55); } catch (_e) {}
}

// ---- Trigger API -----------------------------------------------------------
// Every hook loads/saves state. First-time milestones win over per-run
// variants when both would fire on the same event.

export function watcherOnRunStart() {
  loadState();
  resetRun();
  state.runs += 1;
  // RETURN AFTER LONG ABSENCE — wins over firstDescent-on-repeat (it bypasses
  // when firstDescent already fired). Stamps lastRunAt for next time.
  const nowMs = Date.now();
  const gap = state.lastRunAt ? (nowMs - state.lastRunAt) : 0;
  state.lastRunAt = nowMs;
  if (!state.seen.firstDescent) {
    state.seen.firstDescent = true;
    speak('Another one descends. I have watched many.');
  } else if (gap > 72 * 3600 * 1000) {
    // Rare, atmospheric — only fires on a 72h+ absence, and only once per
    // returning session (guarded by lastRunAt being bumped above).
    speak('You were gone. I waited. That is what I do.');
  } else if (state.seen.firstVictory && !state.seen.firstPostVictoryDescent) {
    // First time coming back after completing the descent. Implies the
    // victory wasn't really an ending.
    state.seen.firstPostVictoryDescent = true;
    speak('Again? Then you did not finish what you started.');
  }
  saveState();
}

// RESUME — a player continuing from a snapshot. Resets per-run volatile state
// (so death-line gating works correctly) but does NOT bump the runs counter
// or fire firstDescent — this isn't a fresh descent, just a reconnection.
export function watcherOnRunResume() {
  loadState();
  resetRun();
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
    speak('You fall. Others have fallen farther. Rise.');
    return;
  }
  // DEATH-TOLL LADDER — one-shot milestones that reflect total deaths across
  // the account. Each fires at most once, ever. The ladder layers a sense
  // of "it has been counting" on top of whichever per-run line also fires.
  if (state.deaths >= 50 && !state.seen.deathToll50) {
    state.seen.deathToll50 = true;
    speak('Fifty. You have given more of yourself than most knights possess.');
  } else if (state.deaths >= 25 && !state.seen.deathToll25) {
    state.seen.deathToll25 = true;
    speak('Twenty-five. I no longer feel I am watching a stranger.');
  } else if (state.deaths >= 10 && !state.seen.deathToll10) {
    state.seen.deathToll10 = true;
    speak('Ten times. The ruin has learned your shape.');
  }
  // Per-run death-depth line — resolves AFTER the ladder so both can fire
  // in the same death (ladder first in visual order via the queue).
  if (runState && !runState.deathLineFired) {
    runState.deathLineFired = true;
    if (nearFinalBoss) {
      speak('You touched the ember. It remembers your hand.');
    } else if (floorLevel >= 3) {
      speak('You were closer. That is not nothing.');
    } else {
      speak('The dark takes you shallow.');
    }
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
    speak('You passed the first door. Few see the second.');
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

// First time starting a run with any ascension tier active. Tier >= 1 means
// the player has intentionally raised the difficulty ceiling.
export function watcherOnAscensionStart(tier) {
  loadState();
  if ((tier | 0) >= 1 && !state.seen.firstAscension) {
    state.seen.firstAscension = true;
    saveState();
    speak('You ask the ruin to remember you harder. It will.');
  }
}

// ---- Debug / test API ------------------------------------------------------

export function watcherResetForTesting() {
  state = DEFAULT_STATE();
  saveState();
  resetRun();
  pendingQueue = [];
  currentLine = null;
  lastPausedStamp = 0;
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
    lastRunAt: state.lastRunAt,
    lastSpokenLine: state.lastSpokenLine,
    seen: { ...state.seen },
    pendingCount: pendingQueue.length,
    hasCurrent: !!currentLine,
  };
}

// Run-summary ledger — returns the most recent utterance this Watcher has
// spoken, for quoting on death / victory screens. Returns empty string if
// the Watcher has never spoken (so the death screen can omit the block).
export function watcherLastLine() {
  loadState();
  return state.lastSpokenLine || '';
}

// For the ledger, the Watcher's count of descents — framed as its record
// of YOU, not a raw counter. Use on run summary: "The Watcher marks your
// Nth descent."
export function watcherDescentCount() {
  loadState();
  return state.runs | 0;
}

// ---- Render ----------------------------------------------------------------

// wrapText moved to src/textLayout.js — see import at top of file.

/**
 * Render the Watcher utterance, if any, in screen space.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w  canvas width
 * @param {number} h  canvas height
 * @param {object} flags  ceremony flags { floorCardTime, bossIntroTime, phaseIntroTime, pickupFlashActive, paused }
 */
export function drawWatcher(ctx, w, h, flags = {}) {
  // Pause-aware timing: track wall-clock time spent paused and add it to
  // currentStart so the fade-in/hold/fade-out clock doesn't advance while
  // the player is in the pause menu or alt-tabbed with the pause overlay up.
  const nowMs = performance.now();
  if (flags.paused) {
    if (lastPausedStamp === 0) lastPausedStamp = nowMs;
    return;   // do not render + do not advance timer
  } else if (lastPausedStamp !== 0) {
    // Just unpaused — shift currentStart forward by the paused duration so
    // the fade clock resumes where it left off.
    const pausedFor = (nowMs - lastPausedStamp) / 1000;
    if (currentLine) currentStart += pausedFor;
    lastPausedStamp = 0;
  }

  // Promote pending to current only when no other ceremony is onscreen.
  // This is what makes the Watcher feel RESPECTFUL of the game's other
  // moments — it waits for the floor card to fade before it speaks.
  const ceremonyActive =
    (flags.floorCardTime || 0) > 0 ||
    (flags.bossIntroTime || 0) > 0 ||
    (flags.phaseIntroTime || 0) > 0 ||
    !!flags.pickupFlashActive;

  if (!currentLine && pendingQueue.length > 0 && !ceremonyActive) {
    currentLine = pendingQueue.shift();
    currentStart = performance.now() / 1000;
    // Audio cue fires when the line actually starts displaying — not in
    // speak() — so deferred utterances ring at the right moment (when
    // the player can actually see them) rather than during a ceremony
    // they're hidden behind.
    playWatcherChime();
  }
  if (!currentLine) return;

  const now = performance.now() / 1000;
  const t = now - currentStart;
  if (t > TOTAL_SEC) {
    currentLine = null;
    return;
  }

  // Container alpha: short fade-in (0.3s) for the sigil + text, hold,
  // fade-out (1.0s). The text additionally has a TYPE_ON reveal that
  // overlays this fade-in for the spoken-not-shown read.
  let alpha;
  if (t < FADE_IN_SEC) alpha = t / FADE_IN_SEC;
  else if (t < FADE_IN_SEC + HOLD_SEC) alpha = 1;
  else alpha = 1 - (t - FADE_IN_SEC - HOLD_SEC) / FADE_OUT_SEC;
  alpha = Math.max(0, Math.min(1, alpha));

  // Smaller, higher, more "subtitle" — italic body text in the upper
  // letterbox band rather than a center-banner above the action.
  const fontSize = 14;
  const maxW = Math.min(620, w - 200);
  const cx = w / 2;
  const cy = Math.round(h * 0.07);   // top 7% — out of combat eye-zone

  ctx.save();
  ctx.font = `italic ${fontSize}px Georgia, serif`;
  const lines = wrapText(ctx, currentLine, maxW);
  const lineH = fontSize * 1.4;
  const totalH = lines.length * lineH;

  // Type-on reveal — characters appear one by one over TYPE_ON_SEC.
  // Reveal progresses through the FULL string (across wrap), using
  // simple character-count math. Once revealed, the full line stays
  // for the remainder of HOLD + FADE_OUT.
  const totalChars = currentLine.length;
  const typeOnT = Math.max(0, Math.min(1, t / TYPE_ON_SEC));
  // Slight ease-out so the last few chars don't dribble; reveal feels
  // like a paced spoken cadence instead of a constant typewriter.
  const easedT = 1 - Math.pow(1 - typeOnT, 1.6);
  const charsToShow = Math.floor(totalChars * easedT);
  const revealLine = currentLine.slice(0, charsToShow);
  // Re-wrap the partial string so wrapping points stay consistent
  // with the full string's geometry (width-based wrap is monotonic).
  const revealLines = wrapText(ctx, revealLine, maxW);

  // Sigil — smaller eye carving + lighter halo. Reads as "presence",
  // not "broadcast". Pulses subtly so it feels alive rather than static.
  const sigilX = Math.round(cx - maxW / 2 - 22);
  const sigilY = Math.round(cy);
  const sigilR = 7;
  const breath = 0.80 + 0.20 * Math.sin(now * 1.6);
  const sigilAlpha = alpha * breath;

  // Breathing halo — smaller + dimmer than before. The sigil should
  // suggest a watching eye, not announce itself.
  const halo = ctx.createRadialGradient(sigilX, sigilY, 1, sigilX, sigilY, sigilR * 2.6);
  halo.addColorStop(0, `rgba(236, 224, 196, ${(alpha * 0.14).toFixed(3)})`);
  halo.addColorStop(1, 'rgba(236, 224, 196, 0)');
  ctx.fillStyle = halo;
  ctx.fillRect(sigilX - sigilR * 2.6, sigilY - sigilR * 2.6, sigilR * 5.2, sigilR * 5.2);

  // Prefer the painted sigil asset if loaded; fall back to procedural
  // rings when the image hasn't loaded yet.
  const sigilImg = images.watcher_sigil;
  if (sigilImg) {
    const artSize = Math.round(sigilR * 3.6 * (0.9 + 0.1 * Math.sin(now * 1.6)));
    ctx.save();
    ctx.globalAlpha = alpha * 0.85;
    ctx.drawImage(sigilImg, sigilX - artSize / 2, sigilY - artSize / 2, artSize, artSize);
    ctx.restore();
  } else {
    ctx.strokeStyle = `rgba(236, 224, 196, ${(sigilAlpha * 0.80).toFixed(3)})`;
    ctx.lineWidth = 1.0;
    ctx.beginPath();
    ctx.arc(sigilX, sigilY, sigilR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = `rgba(236, 224, 196, ${(sigilAlpha * 0.90).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(sigilX, sigilY, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }

  // Text — italic serif, cream, gentler shadow than before. Renders the
  // partially-revealed `revealLines` so the player sees the watcher
  // SPEAK each character as it appears.
  ctx.fillStyle = `rgba(236, 224, 196, ${alpha.toFixed(3)})`;
  ctx.font = `italic ${fontSize}px Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetY = 1;
  const startY = cy - totalH / 2 + lineH / 2;
  for (let i = 0; i < revealLines.length; i++) {
    ctx.fillText(revealLines[i], cx, startY + i * lineH);
  }
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  ctx.restore();
}
