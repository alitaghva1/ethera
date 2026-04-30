// ============================================================================
// POST-FX PIPELINE — bloom + chromatic aberration
//
// Extracted from main.js as part of review #4 (main.js split). Pure,
// self-contained rendering effects with no knowledge of game state. main.js
// still owns the render-loop order and exposes `window.__triggerChromAberr`
// so hero.js can trigger the RGB split on damage without importing this module.
// ============================================================================

// ----- Bloom: classic 3-pass pipeline, half-resolution for perf -----
// Pass 1: extract bright pixels via contrast boost
// Pass 2: Gaussian blur the brights
// Pass 3: composite back onto main canvas via 'lighter' (additive blend)
// Cost is small (~250K pixels per pass) and dominates the "filmic" feel.
const _bloomA = document.createElement('canvas');
const _bloomACtx = _bloomA.getContext('2d');
const _bloomB = document.createElement('canvas');
const _bloomBCtx = _bloomB.getContext('2d');
_bloomACtx.imageSmoothingEnabled = true;
_bloomBCtx.imageSmoothingEnabled = true;

// ----- Chromatic aberration: brief RGB channel split on hero damage -----
// RE-ENABLED (April 2026) as PUNCTUATION, not ambient. Previous iteration
// fired on every hero hit and smeared the pixel art into noise; it's now
// reserved for specific moments (low-HP damage, perfect dodges, death).
// Intensity also halved — peak offset 3.5px (was 7) and alpha 0.28 (was 0.50)
// so it accents rather than dominates.
const _chromCanvas = document.createElement('canvas');
const _chromCtx = _chromCanvas.getContext('2d');
let _chromTime = 0;
let _chromDur = 0;
let _chromStrength = 1;

export function triggerChromAberr(dur = 0.35, strength = 1) {
  // Stack: take the stronger of current vs new rather than restart, so a
  // stronger "death" trigger isn't overwritten by a weaker "perfect dodge"
  // that happens to fire in the same frame.
  if (dur * strength > _chromTime * _chromStrength) {
    _chromTime = dur;
    _chromDur = dur;
    _chromStrength = strength;
  }
}

export function applyChromAberr(mainCtx, mainCanvas) {
  if (_perfMode) return;       // perf-mode: skip RGB-split filter
  if (_chromTime <= 0) return;
  const t = Math.max(0, _chromTime / _chromDur);    // 1 → 0 over lifetime
  const intensity = t * t;                            // quartic ease-out
  const offset = 3.5 * intensity * _chromStrength;   // peak halved from 7 so
                                                       // pixel art stays legible
  if (offset < 0.5) return;
  if (_chromCanvas.width !== mainCanvas.width) {
    _chromCanvas.width = mainCanvas.width;
    _chromCanvas.height = mainCanvas.height;
  }
  _chromCtx.clearRect(0, 0, _chromCanvas.width, _chromCanvas.height);
  _chromCtx.drawImage(mainCanvas, 0, 0);
  mainCtx.save();
  mainCtx.globalCompositeOperation = 'lighter';
  mainCtx.globalAlpha = intensity * 0.28;     // lowered from 0.50 so the
                                                // effect reads as accent, not noise
  // Red channel offset left (filter isolates red-ish tones via sepia→hue-rotate)
  mainCtx.filter = 'sepia(1) hue-rotate(-45deg) saturate(5) brightness(0.55)';
  mainCtx.drawImage(_chromCanvas, -offset, 0);
  // Cyan channel offset right
  mainCtx.filter = 'sepia(1) hue-rotate(150deg) saturate(5) brightness(0.55)';
  mainCtx.drawImage(_chromCanvas, offset, 0);
  mainCtx.filter = 'none';
  mainCtx.restore();
}

export function updateChromAberr(dt) {
  if (_chromTime > 0) _chromTime -= dt;
  if (_chromTime <= 0) _chromTime = 0;
}

// Module-level perf-mode flag — set once at boot from settings.perfMode
// resolution. When true, applyBloom + applyChromAberr early-return so
// the entire postfx pipeline is skipped on lower-end devices.
let _perfMode = false;
export function setPostfxPerfMode(v) { _perfMode = !!v; }

export function applyBloom(targetCtx, sourceCanvas, intensity = 0.55) {
  if (_perfMode) return;       // perf-mode: skip the 4-stage filter chain
  const W = sourceCanvas.width, H = sourceCanvas.height;
  const BW = W >> 1, BH = H >> 1;   // half-resolution for perf
  if (_bloomA.width !== BW) {
    _bloomA.width = BW; _bloomA.height = BH;
    _bloomB.width = BW; _bloomB.height = BH;
  }
  // Pass 1: threshold — crush midtones, preserve brights
  _bloomACtx.clearRect(0, 0, BW, BH);
  _bloomACtx.filter = 'brightness(1.2) contrast(2.4) saturate(1.15)';
  _bloomACtx.drawImage(sourceCanvas, 0, 0, BW, BH);
  _bloomACtx.filter = 'none';
  // Pass 2: blur the extracted brights (writing to B so filter applies cleanly)
  _bloomBCtx.clearRect(0, 0, BW, BH);
  _bloomBCtx.filter = 'blur(8px)';
  _bloomBCtx.drawImage(_bloomA, 0, 0);
  _bloomBCtx.filter = 'none';
  // Pass 3: additive composite back onto main canvas
  targetCtx.save();
  targetCtx.globalCompositeOperation = 'lighter';
  targetCtx.globalAlpha = intensity;
  targetCtx.imageSmoothingEnabled = true;   // upscale the half-res bloom smoothly
  targetCtx.drawImage(_bloomB, 0, 0, BW, BH, 0, 0, W, H);
  targetCtx.imageSmoothingEnabled = false;
  targetCtx.restore();
}
