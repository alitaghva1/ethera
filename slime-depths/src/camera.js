// Camera — smooth follow + screen shake + zoom pulse
export const camera = {
  x: 0, y: 0,
  targetX: 0, targetY: 0,
  shakeAmp: 0, shakeDur: 0, shakeMaxDur: 0,
  offsetX: 0, offsetY: 0,
  viewW: 1280, viewH: 720,
  lerp: 6,
  // Zoom pulse — for visceral big-hit feedback. Base zoom is 1.0; pulse adds a
  // brief kick (zoomPulseAmt) that decays over zoomPulseTime.
  zoom: 1.0,
  zoomPulseAmt: 0,
  zoomPulseTime: 0,
  zoomPulseDur: 0,
  // Ambient zoom breathe — the subtle ±0.6% sin oscillation in updateCamera.
  // Adds a "living" feel during combat lulls. Disabled in static scenes
  // (hamlet) where the breathe causes visible tile-edge shimmer with
  // pixel-art at non-integer scales (imageSmoothingEnabled = false +
  // 0.994-1.006 zoom = pixels snap differently each frame).
  breatheEnabled: true,
};

// ── PLATFORM BASELINE ZOOM ────────────────────────────────────────────────
// Desktop renders the full 1280x720 design canvas at the player's monitor
// resolution. The hero is ~60 design-pixels tall = ~1/12 of canvas height,
// which is fine on a 1080p monitor (60 actual pixels) but POSTAGE-STAMP
// sized on a 5-inch landscape phone (canvas height ~350 actual pixels →
// hero ~29 actual pixels tall). The mobile baseline zoom multiplies into
// camera.zoom so combat is readable at hand-held distances without changing
// the desktop experience or the per-room zoom-pulse.
//
// 1.40 was chosen by visual test: at this scale the hero reads at ~40
// actual pixels on a 350-pixel landscape canvas, doors stay visible, and
// most rooms still have ~1.5 tiles of margin around the hero. Higher
// values (1.60+) start clipping doors when the player walks toward the
// far wall; lower values (1.20) feel insufficient.
//
// Exposed as a constant so it's tunable in one place. Consumed from
// updateCamera below — only multiplied in when isMobileMode() returns
// true, so desktop math is bit-identical to before this change.
export const DESKTOP_BASELINE_ZOOM = 1.0;
export const MOBILE_BASELINE_ZOOM  = 1.40;
let _baselineZoom = DESKTOP_BASELINE_ZOOM;

/**
 * Set the platform baseline zoom multiplier. Call from main.js after
 * applyMobileMode() so the camera matches the chosen control profile.
 * Idempotent: setting the same value is a no-op.
 */
export function setBaselineZoom(z) {
  if (typeof z === 'number' && Number.isFinite(z) && z > 0) {
    _baselineZoom = z;
  }
}
export function getBaselineZoom() { return _baselineZoom; }

export function setCameraSize(w, h) { camera.viewW = w; camera.viewH = h; }

export function followCamera(tx, ty) {
  camera.targetX = tx;
  camera.targetY = ty;
}

let shakeScale = 1.0;
export function setShakeScale(v) { shakeScale = Math.max(0, Math.min(1.5, v)); }
export function getShakeScale() { return shakeScale; }

// Small-shake threshold — calls below this amp are treated as "tiny
// punctuation" (base hits are 4.5; crits 7; counters 10; boss-events
// 14-22). When a shake is already in flight, suppress incoming SMALL
// shakes so spammed base hits during fast attack chains don't keep
// re-igniting tremor on top of the decaying big shake. Heavy shakes
// (crit/counter/boss) always fire through. Audit found combat felt
// like a constant low-grade tremor with Ringing Steel + base hits at
// 2-3 per second; this is the budget cap.
const SMALL_SHAKE_AMP = 5.0;

export function shakeCamera(amp, dur) {
  const a = amp * shakeScale;
  // Budget cap: while a shake is in flight, ignore small (base-hit)
  // shakes. This is the difference between "every sword swing pumps
  // the camera" (constant tremor) and "first hit shakes, the rest
  // ride that decay" (punctuation reads as punctuation). Heavy hits
  // are unaffected.
  if (a < SMALL_SHAKE_AMP && camera.shakeDur > 0) return;
  // If a stronger shake is already in flight, don't downgrade to a
  // weaker call. shakeAmp + shakeDur take the max independently so
  // a short-strong call can't truncate a long-decaying one.
  const wasStronger = camera.shakeAmp > a;
  camera.shakeAmp = Math.max(camera.shakeAmp, a);
  camera.shakeDur = Math.max(camera.shakeDur, dur);
  // Track the ORIGINAL duration so the decay envelope spans the
  // full window. Prior code divided shakeDur by a hardcoded 0.25,
  // which over-amplified any shake with dur > 0.25 (most of them —
  // e.g. shakeCamera(22, 0.55) peaked at 48.4 vs the requested 22).
  // Take the max so a long shake's envelope isn't shortened by a
  // shorter follow-up call.
  if (!wasStronger || camera.shakeMaxDur < dur) {
    camera.shakeMaxDur = Math.max(camera.shakeMaxDur, dur);
  }
}

// Pulse the camera zoom briefly. amt > 0 zooms in (punch-in), < 0 zooms out.
// dur is total seconds; amount decays quartic so the kick is front-loaded.
const SMALL_PULSE_AMT = 0.05;
export function pulseZoom(amt, dur = 0.25) {
  // Budget cap (mirrors shakeCamera): if a pulse is in flight at all,
  // ignore incoming SMALL pulses. Three crits in 250 ms each used to
  // fire pulseZoom(0.025) which compounded into a strobe punch-in.
  // Heavy pulses (boss kills, mythic pickups, fusion forge) fire
  // through unchanged.
  if (Math.abs(amt) < SMALL_PULSE_AMT && camera.zoomPulseTime > 0) return;
  // Don't override a larger ongoing pulse
  if (Math.abs(amt) > Math.abs(camera.zoomPulseAmt * (camera.zoomPulseTime / Math.max(0.001, camera.zoomPulseDur)))) {
    camera.zoomPulseAmt = amt * shakeScale;      // tie to shake scale for accessibility
    camera.zoomPulseTime = dur;
    camera.zoomPulseDur = dur;
  }
}

export function updateCamera(dt) {
  const k = 1 - Math.exp(-camera.lerp * dt);
  camera.x += (camera.targetX - camera.x) * k;
  camera.y += (camera.targetY - camera.y) * k;
  if (camera.shakeDur > 0) {
    camera.shakeDur -= dt;
    // Linear decay across the full requested duration: amp peaks at
    // shakeAmp on the first frame and decays to 0 by the end. Prior
    // implementation divided by a hardcoded 0.25 — for any shake with
    // dur > 0.25 it OVER-amplified during the early phase (a 22-amp,
    // 0.55s shake peaked at 48). The clamp keeps the math safe even
    // if shakeMaxDur is missing on legacy state.
    const denom = camera.shakeMaxDur > 0 ? camera.shakeMaxDur : 0.25;
    const decayFrac = Math.max(0, Math.min(1, camera.shakeDur / denom));
    const a = camera.shakeAmp * decayFrac;
    camera.offsetX = (Math.random() * 2 - 1) * a;
    camera.offsetY = (Math.random() * 2 - 1) * a;
    if (camera.shakeDur <= 0) {
      camera.shakeDur = 0; camera.shakeAmp = 0; camera.shakeMaxDur = 0;
      camera.offsetX = 0; camera.offsetY = 0;
    }
  } else {
    camera.offsetX = 0; camera.offsetY = 0;
  }
  // Ambient idle breathe — very subtle continuous zoom modulation while no pulse
  // is active. Gives the camera a living quality; adds tension in combat lulls.
  // Only applied when shakeScale > 0 AND camera.breatheEnabled (set false in
  // hamlet so static pixel-art tiles don't shimmer at the ±0.6% scale).
  const breathe = (shakeScale > 0 && camera.breatheEnabled)
    ? Math.sin(performance.now() / 2400) * 0.006
    : 0;
  // Zoom pulse decay — quartic ease-out so pulse snaps in, eases out.
  // Final zoom = baseline (platform-dependent: 1.0 desktop / 1.40 mobile)
  // times the existing pulse + breathe modulation. Multiplying preserves
  // the pulse's RELATIVE strength (a 0.10 punch-in feels the same %
  // change on both platforms) while letting mobile see closer to the hero.
  const pulseMod = camera.zoomPulseTime > 0
    ? (camera.zoomPulseAmt * Math.pow(camera.zoomPulseTime / camera.zoomPulseDur, 2))
    : 0;
  if (camera.zoomPulseTime > 0) {
    camera.zoomPulseTime -= dt;
    if (camera.zoomPulseTime <= 0) {
      camera.zoomPulseTime = 0;
      camera.zoomPulseAmt = 0;
    }
  }
  camera.zoom = _baselineZoom * (1.0 + pulseMod + breathe);
}

// Transform world coords to screen coords (accounts for zoom)
export function worldToScreen(x, y) {
  const z = camera.zoom || 1;
  return {
    x: (x - camera.x + camera.offsetX) * z + camera.viewW / 2,
    y: (y - camera.y + camera.offsetY) * z + camera.viewH / 2,
  };
}

export function screenToWorld(sx, sy) {
  const z = camera.zoom || 1;
  return {
    x: (sx - camera.viewW / 2) / z + camera.x - camera.offsetX,
    y: (sy - camera.viewH / 2) / z + camera.y - camera.offsetY,
  };
}
