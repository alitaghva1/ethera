// ============================================================================
// FIRST-RUN INTRO CINEMATIC — "they left you for dead"
//
// Ported from the original Ethera (ethera/src/gameloop.js + config.js + sfx.js).
// Plays ONCE on the player's first-ever AWAKEN, layered over their first
// dungeon room. The world loads behind a black overlay; three text beats
// fade through narrating the player's predicament; an accelerating heartbeat
// pulse + cardiac glow visualizes returning consciousness; the world reveals
// at 26-28s and gameplay begins. Dismissable with any input after 4s.
//
// Total runtime: 28 seconds. Skipping jumps to the reveal phase (26s) so
// the player still sees the world fade in cleanly even when bypassed.
//
// Triggered by main.js when the AWAKEN button fires AND
// !hasSeen('hamlet','wake'). After dismissal, normal gameplay resumes —
// when the player dies for the first time, enterHamletCanvas() will play
// the Keeper wake cinematic via its own existing first-time gate.
// ============================================================================

import { synthHeartbeat } from './synth.js';
import { prefersReducedMotion } from './a11y.js';
import { settings } from './settings';

// Total cinematic duration. After this, the intro is fully dismissed and
// normal gameplay (hero update, enemy AI, HUD) resumes.
const INTRO_DURATION = 28.0;

// Reveal phase begins at 26s — black overlay fades to clear, gameplay
// starts to read through the dimming overlay.
const REVEAL_START = 26.0;

// Skip-allowed window — cinematic locks input for the first 4s so the
// opening text + first heartbeat aren't accidentally skipped, then any
// input dismisses (jumping to the reveal phase).
const SKIP_AFTER = 4.0;
const SKIP_BEFORE = 24.0;

// Music kicks in at 24s as the heartbeat fades — the gameplay-music
// handoff. Intro is dead silent before this. (Music suppression itself
// is handled by main.js: it stops the ambient pad + biome track on
// startIntro and resumes them when the cinematic ends. The heartbeat
// is the ONLY audio playing during the cinematic.)
const MUSIC_AT = 24.0;

// Heartbeat gain — multiplier on each scheduled beat's `vol` field. The
// original ethera tuning peaked at vol ~0.9 inside a louder soundscape;
// here the cinematic is otherwise silent (no music underneath), so the
// beats can run hotter without crowding anything else. 1.7x lifts the
// final crescendo into "felt in the chest" territory while keeping the
// opening beats at "barely alive" intimacy.
const HEARTBEAT_GAIN = 1.7;

// Heartbeat sequence — accelerating cadence + rising volume + escalating
// pulse intensity (0.15 -> 1.0). Carries the player from "barely alive"
// to "alive enough to fight." Lifted verbatim from ethera/src/config.js
// since the timing is exactly right and was tuned by ear.
const INTRO_BEATS = [
  { time: 8.0,  vol: 0.35, pulse: 0.15 },
  { time: 9.5,  vol: 0.38, pulse: 0.18 },
  { time: 10.8, vol: 0.40, pulse: 0.22 },
  { time: 12.0, vol: 0.42, pulse: 0.28 },
  { time: 13.2, vol: 0.42, pulse: 0.35 },
  { time: 14.3, vol: 0.45, pulse: 0.42 },
  { time: 15.3, vol: 0.50, pulse: 0.50 },
  { time: 16.2, vol: 0.55, pulse: 0.60 },
  { time: 17.0, vol: 0.60, pulse: 0.70 },
  { time: 17.7, vol: 0.70, pulse: 0.80 },
  { time: 18.3, vol: 0.80, pulse: 0.90 },
  { time: 18.8, vol: 0.90, pulse: 1.00 },
];

// Module state — reset on startIntro().
let _active = false;
let _timer = 0;
let _pulse = 0;
let _beatIndex = 0;
let _musicStarted = false;

export function startIntro() {
  _active = true;
  _timer = 0;
  _pulse = 0;
  _beatIndex = 0;
  _musicStarted = false;
}

export function isIntroActive() { return _active; }

// Skip to the reveal phase. Used by the input handler when the player
// presses any key/clicks during the skip-allowed window. We don't snap to
// the end — we jump to REVEAL_START so the player still sees the 2s
// world reveal fade in cleanly. Feels intentional, not abrupt.
export function skipIntro() {
  if (!_active) return;
  if (_timer < SKIP_AFTER) return;     // cinematic locked for the first 4s
  if (_timer >= REVEAL_START) return;  // already in reveal — no-op
  _timer = REVEAL_START;
  _pulse = 0.05;                        // tiny lingering pulse, fades out
}

// Per-tick update. Drives the heartbeat-pulse decay, fires the next
// scheduled heartbeat SFX, and dismisses the cinematic when the timer
// passes INTRO_DURATION. Caller is expected to feed dt in seconds and
// to gate hero/enemy updates on isIntroActive() so the player can't
// fight through the intro.
export function updateIntro(dt) {
  if (!_active) return;
  _timer += dt;
  const t = _timer;

  // Baseline breathing pulse 0-8s — the player is barely alive, slow
  // labored breath. After 8s the actual heartbeat takes over.
  if (t < 8.0) {
    const breathBase = 0.04 + Math.sin(t * 0.9) * 0.03; // 0.01-0.07
    if (breathBase > _pulse) _pulse = breathBase;
  }

  // Fire any scheduled heartbeat SFX. The pulse spike sets _pulse to the
  // beat's intensity; exponential decay below produces the falloff.
  while (_beatIndex < INTRO_BEATS.length && t >= INTRO_BEATS[_beatIndex].time) {
    const beat = INTRO_BEATS[_beatIndex];
    try { synthHeartbeat(beat.vol * HEARTBEAT_GAIN); } catch (_e) {}
    _pulse = beat.pulse;
    _beatIndex++;
  }

  // Exponential decay — fast initial drop, slow organic tail. Clamp dt
  // to avoid NaN spikes on a huge frame (tab-switch, modal open, etc.).
  if (_pulse > 0.01) {
    const decayFactor = Math.pow(0.06, Math.min(dt, 0.1));
    _pulse *= isFinite(decayFactor) ? decayFactor : 0;
  }

  // Music handoff at 24s — leave room for the gameplay music system to
  // pick up. main.js owns the actual playTrack call; we just signal once.
  if (t >= MUSIC_AT && !_musicStarted) {
    _musicStarted = true;
    // Caller can listen for the musicCue event if they want to time
    // exactly with the cinematic; otherwise the natural music-loop
    // pickup at end-of-intro is fine.
  }

  // End-of-cinematic — dismiss. Caller's tick loop will see
  // isIntroActive() false next frame and resume hero updates.
  if (t >= INTRO_DURATION) {
    _active = false;
  }
}

// Per-frame render — black overlay + cardiac glow + 3 text lines + skip
// hint. Drawn AFTER the world but BEFORE the HUD so the world reveals
// behind the overlay during 26-28s while the HUD stays suppressed.
export function drawIntro(ctx, w, h) {
  if (!_active) return;
  const t = _timer;
  ctx.save();

  // Black overlay — opaque through everything until the reveal phase
  // (26-28s) where it fades to clear. After that the world is fully
  // visible and we're just running out the clock on the cinematic
  // (still _active until INTRO_DURATION).
  let overlayAlpha = 1.0;
  if (t > REVEAL_START) overlayAlpha = Math.max(0, 1 - (t - REVEAL_START) / 2.0);
  if (overlayAlpha > 0.01) {
    ctx.globalAlpha = overlayAlpha;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
  }

  // Accessibility (a11y review P1) — strobing radial glow synced to the
  // 12 escalating heartbeats is a photosensitive/migraine trigger. When
  // the user has prefers-reduced-motion set OR the in-game reduceFlashes
  // toggle, suppress the cardiac glow entirely. Heartbeat audio still
  // plays so the cinematic still has its emotional cadence; just no
  // strobe. Text beats render normally.
  const flashSafe = prefersReducedMotion() || settings.reduceFlashes;

  // Cardiac pulse — radial amber glow at center, crimson mid, dark red
  // outer. Driven by _pulse (0-1). At rest (between beats) it's 0; on
  // beat spike it's the beat's pulse value, decaying exponentially. The
  // visual reads as "warmth flowing back into the body" with each beat.
  if (_pulse > 0.005 && !flashSafe) {
    ctx.globalCompositeOperation = 'lighter';
    const cx = w / 2, cy = h / 2;
    // Center glow scales 15%->60% of screen with pulse intensity.
    const glowRadius = h * (0.15 + _pulse * 0.45);
    ctx.globalAlpha = _pulse * 0.7;
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowRadius);
    glow.addColorStop(0, 'rgba(220, 120, 50, 1)');
    glow.addColorStop(0.3, 'rgba(180, 50, 20, 0.6)');
    glow.addColorStop(0.7, 'rgba(100, 20, 8, 0.2)');
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);
    // Edge vignette — warm border that pulses with the heartbeat.
    ctx.globalAlpha = _pulse * 0.35;
    const vig = ctx.createRadialGradient(cx, cy, h * 0.25, cx, cy, h * 0.8);
    vig.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vig.addColorStop(0.6, 'rgba(80, 15, 5, 0.3)');
    vig.addColorStop(1, 'rgba(140, 30, 10, 1)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';
  }

  // Skip hint — fades in 4-24s, dimmed muted-grey so it doesn't compete
  // with the cinematic text. Goes away during the heartbeat crescendo
  // (>24s) when the player is meant to feel the climax, not be invited
  // to skip past it.
  if (t > SKIP_AFTER && t < SKIP_BEFORE) {
    const skipAlpha = Math.min(0.2, (t - SKIP_AFTER) * 0.06);
    ctx.globalAlpha = skipAlpha;
    ctx.font = '11px monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = '#888';
    ctx.fillText('press any key to skip', w - 24, h - 18);
  }

  // ── TEXT LINES ──────────────────────────────────────────────────────
  ctx.globalAlpha = 1;
  const cx = w / 2;
  const baseY = h * 0.42;

  // LINE 0 — "You awaken on cold stone." (1-5s, hazy 16px)
  // A thought forming through fog. Dim, blurred, small.
  let a0 = 0;
  if (t >= 1.0 && t < 3.0)  a0 = (t - 1.0) / 2.0;
  if (t >= 3.0 && t < 4.0)  a0 = 1;
  if (t >= 4.0 && t < 5.0)  a0 = 1 - (t - 4.0);
  if (a0 > 0.01) {
    ctx.globalAlpha = Math.min(1, a0) * 0.7;
    ctx.font = '16px Georgia';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur = 10;
    ctx.fillStyle = '#998a70';
    ctx.fillText('You awaken on cold stone.', cx, baseY);
  }

  // LINE 1 — "They left you for dead." (5.5-9.5s, sharper 20px)
  // Reality hitting. Sharper, brighter, holds 1.5s for weight. The first
  // heartbeat fires at 8.0 — UNDER this line — so the player feels their
  // own pulse wake up while they're reading the diagnosis.
  let a1 = 0;
  if (t >= 5.5 && t < 7.0)  a1 = (t - 5.5) / 1.5;
  if (t >= 7.0 && t < 8.5)  a1 = 1;
  if (t >= 8.5 && t < 9.5)  a1 = 1 - (t - 8.5);
  if (a1 > 0.01) {
    ctx.globalAlpha = Math.min(1, a1) * 0.9;
    ctx.font = '20px Georgia';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 4;
    ctx.fillStyle = '#bbaa88';
    ctx.fillText('They left you for dead.', cx, baseY);
  }

  // LINE 2 — "They were wrong." (19.5-23.4s, italic 28px gold halo)
  // The defiance reveal — fires right after the heartbeat crescendo
  // (last beat at 18.8s). Multi-layer halo glow + scale-down anchor
  // make it feel like an exhalation, not a fade-in.
  let a2 = 0;
  if (t >= 19.5 && t < 19.9) a2 = (t - 19.5) / 0.4;
  if (t >= 19.9 && t < 22.4) a2 = 1;
  if (t >= 22.4 && t < 23.4) a2 = 1 - (t - 22.4);
  if (a2 > 0.01) {
    a2 = Math.min(1, a2);
    const scaleT = Math.min(1, (t - 19.5) / 3.0);
    const scale = 1.08 - 0.08 * scaleT;
    const glowBuild = Math.min(1, (t - 19.5) / 2.0);
    ctx.save();
    ctx.translate(cx, h * 0.44);
    ctx.scale(scale, scale);
    ctx.textAlign = 'center';
    ctx.font = 'italic 28px Georgia';
    // Outer halo
    ctx.shadowColor = `rgba(200, 155, 70, ${glowBuild * 0.18 * a2})`;
    ctx.shadowBlur = 55;
    ctx.globalAlpha = a2 * 0.3;
    ctx.fillStyle = `rgba(230, 205, 155, ${a2 * 0.3})`;
    ctx.fillText('They were wrong.', 0, 0);
    // Mid glow
    ctx.shadowColor = `rgba(225, 180, 90, ${glowBuild * 0.45 * a2})`;
    ctx.shadowBlur = 25;
    ctx.globalAlpha = a2 * 0.6;
    ctx.fillStyle = `rgba(230, 205, 155, ${a2 * 0.6})`;
    ctx.fillText('They were wrong.', 0, 0);
    // Core text
    ctx.shadowColor = `rgba(240, 200, 120, ${glowBuild * 0.8 * a2})`;
    ctx.shadowBlur = 8;
    ctx.globalAlpha = a2;
    ctx.fillStyle = '#e6cd9b';
    ctx.fillText('They were wrong.', 0, 0);
    ctx.restore();
  }

  ctx.restore();
}
