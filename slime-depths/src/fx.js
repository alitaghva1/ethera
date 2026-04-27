// Combat-feel FX — damage numbers, sword slashes, and a global hit-stop timer.
// All pooled / freelisted; runs beside the particle system in main.js.

// ============================================================================
// RELIC ICON RENDERING — draw a relic's base sprite with a hue-shift tint +
// small distinguishing glyph overlaid on top. Makes 34 relics visually
// distinct despite sharing 8 base PNGs.
// Call: drawRelicIcon(ctx, img, glyph, tintColor, x, y, size)
// ============================================================================

// Convert hex tint to hue-rotate degrees relative to the base "orange urn"
// palette of the damage sprite. Rough approximation; good enough to make
// each relic read as a different color.
export function hueRotateForTint(hex) {
  if (!hex || !hex.startsWith('#')) return 0;
  // Extract rgb
  const h = hex.length === 4 ? hex.slice(1).split('').map(c => c + c).join('') : hex.slice(1);
  const n = parseInt(h, 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  // Compute hue (HSL)
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (max === min) return 0;    // grey — no shift
  let hue;
  const d = max - min;
  switch (max) {
    case r: hue = ((g - b) / d + (g < b ? 6 : 0)); break;
    case g: hue = (b - r) / d + 2; break;
    case b: hue = (r - g) / d + 4; break;
  }
  hue *= 60;
  // Base sprite is orange-ish (~25°); rotate toward the target hue.
  return Math.round(hue - 25);
}

// Cached per-relic composed icon so we don't re-render every frame.
const _iconCache = new Map();     // key: relicId_size → HTMLCanvasElement

// Compose a relic icon into an offscreen canvas (tint hue-rotate + glyph
// overlay). Shared by the in-world renderer and the DOM-based codex cards
// (via toDataURL). Cached per (relicId, size).
export function composeRelicIcon(baseImg, glyph, tintColor, relicId, size) {
  if (!baseImg) return null;
  const cacheKey = `${relicId}_${size}`;
  let iconCanvas = _iconCache.get(cacheKey);
  if (iconCanvas) return iconCanvas;
  iconCanvas = document.createElement('canvas');
  iconCanvas.width = size; iconCanvas.height = size;
  const icx = iconCanvas.getContext('2d');
  icx.imageSmoothingEnabled = false;
  const deg = hueRotateForTint(tintColor);
  if (deg !== 0) icx.filter = `hue-rotate(${deg}deg) saturate(1.15)`;
  icx.drawImage(baseImg, 0, 0, size, size);
  icx.filter = 'none';
  if (glyph) {
    const gSize = Math.max(10, size * 0.45);
    const gx = size - gSize - size * 0.05;
    const gy = size - gSize - size * 0.05;
    icx.fillStyle = 'rgba(8, 4, 12, 0.7)';
    icx.beginPath();
    icx.arc(gx + gSize / 2, gy + gSize / 2, gSize / 2, 0, Math.PI * 2);
    icx.fill();
    drawRelicGlyphInto(icx, glyph, gx + gSize / 2, gy + gSize / 2, gSize * 0.6, tintColor || '#f4d9a0');
  }
  _iconCache.set(cacheKey, iconCanvas);
  return iconCanvas;
}

export function drawRelicIcon(ctx, baseImg, glyph, tintColor, relicId, dx, dy, size) {
  const c = composeRelicIcon(baseImg, glyph, tintColor, relicId, size);
  if (c) ctx.drawImage(c, dx, dy, size, size);
}

// Compose an enemy thumbnail — crop frame 0 from an idle sprite strip, apply
// the type's tintFilter (if any), and return as data URL for use in `<img src>`.
// Cached per (typeId, size).
const _enemyThumbCache = new Map();
export function composeEnemyThumbDataURL(typeDef, spriteImage, size) {
  if (!typeDef || !spriteImage) return null;
  const key = `${typeDef.prefix || '?'}_${typeDef.tintFilter || ''}_${size}`;
  if (_enemyThumbCache.has(key)) return _enemyThumbCache.get(key);
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const cx = c.getContext('2d');
  cx.imageSmoothingEnabled = false;
  if (typeDef.tintFilter) cx.filter = typeDef.tintFilter;
  // Sprite strips are 100px per frame; crop frame 0 and scale to size
  cx.drawImage(spriteImage, 0, 0, 100, 100, 0, 0, size, size);
  cx.filter = 'none';
  const url = c.toDataURL('image/png');
  _enemyThumbCache.set(key, url);
  return url;
}

// Compose a relic thumbnail as a data URL — wraps composeRelicIcon for DOM use.
const _relicThumbDataCache = new Map();
export function composeRelicThumbDataURL(baseImg, glyph, tintColor, relicId, size) {
  const key = `${relicId}_${size}`;
  if (_relicThumbDataCache.has(key)) return _relicThumbDataCache.get(key);
  const c = composeRelicIcon(baseImg, glyph, tintColor, relicId, size);
  if (!c) return null;
  const url = c.toDataURL('image/png');
  _relicThumbDataCache.set(key, url);
  return url;
}

// Canvas-drawn pixel-art glyphs. Each is a compact monochrome shape centered
// on (cx, cy) with a given radius r. Used inside drawRelicIcon.
function drawRelicGlyphInto(ctx, glyph, cx, cy, r, color) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, r * 0.18);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  switch (glyph) {
    case 'sword': {
      // Diagonal blade with hilt
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.7, cy + r * 0.7);
      ctx.lineTo(cx + r * 0.5, cy - r * 0.5);
      ctx.stroke();
      // Cross-guard
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.4, cy - r * 0.1);
      ctx.lineTo(cx - r * 0.0, cy - r * 0.5);
      ctx.stroke();
      break;
    }
    case 'bolt': {
      // Lightning zigzag
      ctx.beginPath();
      ctx.moveTo(cx + r * 0.3, cy - r * 0.8);
      ctx.lineTo(cx - r * 0.2, cy - r * 0.1);
      ctx.lineTo(cx + r * 0.1, cy - r * 0.05);
      ctx.lineTo(cx - r * 0.3, cy + r * 0.8);
      ctx.lineTo(cx + r * 0.3, cy - r * 0.1);
      ctx.lineTo(cx - r * 0.05, cy - r * 0.2);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'flame': {
      // Teardrop flame
      ctx.beginPath();
      ctx.moveTo(cx, cy - r * 0.9);
      ctx.quadraticCurveTo(cx + r * 0.7, cy - r * 0.2, cx + r * 0.4, cy + r * 0.5);
      ctx.quadraticCurveTo(cx, cy + r * 0.9, cx - r * 0.4, cy + r * 0.5);
      ctx.quadraticCurveTo(cx - r * 0.7, cy - r * 0.2, cx, cy - r * 0.9);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'shield': {
      // Kite shield with central ridge
      ctx.beginPath();
      ctx.moveTo(cx, cy - r * 0.9);
      ctx.lineTo(cx + r * 0.7, cy - r * 0.5);
      ctx.lineTo(cx + r * 0.5, cy + r * 0.5);
      ctx.lineTo(cx, cy + r * 0.9);
      ctx.lineTo(cx - r * 0.5, cy + r * 0.5);
      ctx.lineTo(cx - r * 0.7, cy - r * 0.5);
      ctx.closePath();
      ctx.stroke();
      // Central ridge line
      ctx.beginPath();
      ctx.moveTo(cx, cy - r * 0.7);
      ctx.lineTo(cx, cy + r * 0.7);
      ctx.stroke();
      break;
    }
    case 'heart': {
      // Classic heart — two semicircles + triangle
      ctx.beginPath();
      ctx.moveTo(cx, cy + r * 0.85);
      ctx.bezierCurveTo(cx - r * 1.1, cy + r * 0.1, cx - r * 0.7, cy - r * 0.7, cx, cy - r * 0.3);
      ctx.bezierCurveTo(cx + r * 0.7, cy - r * 0.7, cx + r * 1.1, cy + r * 0.1, cx, cy + r * 0.85);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'eye': {
      // Almond eye with pupil
      ctx.beginPath();
      ctx.ellipse(cx, cy, r * 0.95, r * 0.55, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.28, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'wind': {
      // Three curved horizontal lines suggesting air movement
      ctx.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        const offY = (i - 1) * r * 0.45;
        const w = i === 1 ? r * 1.3 : r * 0.9;
        ctx.beginPath();
        ctx.moveTo(cx - w / 2, cy + offY);
        ctx.quadraticCurveTo(cx, cy + offY - r * 0.15, cx + w / 2, cy + offY);
        ctx.stroke();
      }
      break;
    }
    case 'step': {
      // Two footprints — one forward, one back, offset like walking
      ctx.beginPath();
      ctx.ellipse(cx - r * 0.4, cy + r * 0.25, r * 0.22, r * 0.38, -0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx - r * 0.55, cy - r * 0.05, r * 0.15, 0, Math.PI * 2);   // toe dot
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cx + r * 0.3, cy - r * 0.35, r * 0.2, r * 0.34, 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx + r * 0.45, cy - r * 0.6, r * 0.13, 0, Math.PI * 2);    // toe dot
      ctx.fill();
      break;
    }
    case 'greaves': {
      // Armored boot — shin plate + sole with knee cap
      ctx.lineWidth = Math.max(1, r * 0.16);
      // Shin plate (trapezoid)
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.35, cy - r * 0.75);
      ctx.lineTo(cx + r * 0.35, cy - r * 0.75);
      ctx.lineTo(cx + r * 0.25, cy + r * 0.35);
      ctx.lineTo(cx - r * 0.25, cy + r * 0.35);
      ctx.closePath();
      ctx.fill();
      // Sole (wider foot plate)
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.45, cy + r * 0.35);
      ctx.lineTo(cx + r * 0.55, cy + r * 0.35);
      ctx.lineTo(cx + r * 0.55, cy + r * 0.7);
      ctx.lineTo(cx - r * 0.45, cy + r * 0.7);
      ctx.closePath();
      ctx.fill();
      // Knee cap dot
      ctx.beginPath();
      ctx.arc(cx, cy - r * 0.5, r * 0.14, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'dash': {
      // Arrow with trailing speed streaks
      ctx.lineCap = 'round';
      // Main arrow shaft
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.2, cy);
      ctx.lineTo(cx + r * 0.7, cy);
      ctx.stroke();
      // Arrowhead
      ctx.beginPath();
      ctx.moveTo(cx + r * 0.7, cy);
      ctx.lineTo(cx + r * 0.3, cy - r * 0.35);
      ctx.moveTo(cx + r * 0.7, cy);
      ctx.lineTo(cx + r * 0.3, cy + r * 0.35);
      ctx.stroke();
      // Two speed streaks behind
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.85, cy - r * 0.35);
      ctx.lineTo(cx - r * 0.35, cy - r * 0.35);
      ctx.moveTo(cx - r * 0.85, cy + r * 0.35);
      ctx.lineTo(cx - r * 0.35, cy + r * 0.35);
      ctx.stroke();
      break;
    }
    case 'cloak': {
      // Hooded figure silhouette — head orb + triangular cloak drape
      ctx.beginPath();
      ctx.arc(cx, cy - r * 0.45, r * 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx, cy - r * 0.2);
      ctx.lineTo(cx + r * 0.8, cy + r * 0.85);
      ctx.lineTo(cx - r * 0.8, cy + r * 0.85);
      ctx.closePath();
      ctx.fill();
      // Hood opening (darker notch)
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(cx, cy - r * 0.4, r * 0.18, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      break;
    }
    case 'gale': {
      // Tornado swirl — two arcs spiraling from wide at top to tight at bottom
      ctx.lineWidth = Math.max(1, r * 0.22);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.75, cy - r * 0.65);
      ctx.quadraticCurveTo(cx + r * 0.6, cy - r * 0.35, cx - r * 0.4, cy - r * 0.05);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.55, cy - r * 0.05);
      ctx.quadraticCurveTo(cx + r * 0.4, cy + r * 0.2, cx - r * 0.2, cy + r * 0.5);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.3, cy + r * 0.5);
      ctx.quadraticCurveTo(cx + r * 0.2, cy + r * 0.65, cx, cy + r * 0.85);
      ctx.stroke();
      break;
    }
    case 'breath': {
      // Wind line cradling a small heart — signals recovery/second-wind
      ctx.lineCap = 'round';
      ctx.lineWidth = Math.max(1, r * 0.16);
      // Two curved wind lines above + below
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.8, cy - r * 0.55);
      ctx.quadraticCurveTo(cx, cy - r * 0.75, cx + r * 0.8, cy - r * 0.55);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.8, cy + r * 0.55);
      ctx.quadraticCurveTo(cx, cy + r * 0.75, cx + r * 0.8, cy + r * 0.55);
      ctx.stroke();
      // Tiny heart in the center
      ctx.beginPath();
      ctx.moveTo(cx, cy + r * 0.35);
      ctx.bezierCurveTo(cx - r * 0.55, cy - r * 0.05, cx - r * 0.35, cy - r * 0.4, cx, cy - r * 0.1);
      ctx.bezierCurveTo(cx + r * 0.35, cy - r * 0.4, cx + r * 0.55, cy - r * 0.05, cx, cy + r * 0.35);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'skull': {
      // Rounded skull with eye sockets
      ctx.beginPath();
      ctx.arc(cx, cy - r * 0.15, r * 0.75, 0, Math.PI * 2);
      ctx.fill();
      // jaw
      ctx.fillRect(cx - r * 0.5, cy + r * 0.35, r, r * 0.45);
      // eyes (dark)
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(cx - r * 0.3, cy - r * 0.15, r * 0.22, 0, Math.PI * 2);
      ctx.arc(cx + r * 0.3, cy - r * 0.15, r * 0.22, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      break;
    }
    case 'phoenix': {
      // Ankh — cross with loop — read as revive
      ctx.beginPath();
      ctx.arc(cx, cy - r * 0.35, r * 0.42, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx, cy + r * 0.05);
      ctx.lineTo(cx, cy + r * 0.9);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.5, cy + r * 0.35);
      ctx.lineTo(cx + r * 0.5, cy + r * 0.35);
      ctx.stroke();
      break;
    }
    case 'star': {
      // Four-point star (diamond cross)
      ctx.beginPath();
      ctx.moveTo(cx, cy - r * 0.95);
      ctx.lineTo(cx + r * 0.3, cy - r * 0.3);
      ctx.lineTo(cx + r * 0.95, cy);
      ctx.lineTo(cx + r * 0.3, cy + r * 0.3);
      ctx.lineTo(cx, cy + r * 0.95);
      ctx.lineTo(cx - r * 0.3, cy + r * 0.3);
      ctx.lineTo(cx - r * 0.95, cy);
      ctx.lineTo(cx - r * 0.3, cy - r * 0.3);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'rune': {
      // Geometric rune — circle with inscribed triangle
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.85, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx, cy - r * 0.55);
      ctx.lineTo(cx + r * 0.5, cy + r * 0.3);
      ctx.lineTo(cx - r * 0.5, cy + r * 0.3);
      ctx.closePath();
      ctx.stroke();
      break;
    }
  }
  ctx.restore();
}

// ---------- Hit marker (X crosshair on last-hit enemy) ----------
// Tracks the most recent enemy hit so we can draw a quick crosshair pop,
// making off-screen or chaotic combat hits feel snappier.
const _hitMarkers = [];          // { x, y, time, life }
export function spawnHitMarker(x, y, crit = false) {
  _hitMarkers.push({ x, y, time: 0, life: 0.25, crit });
  if (_hitMarkers.length > 12) _hitMarkers.shift();
}
export function updateHitMarkers(dt) {
  for (let i = _hitMarkers.length - 1; i >= 0; i--) {
    _hitMarkers[i].time += dt;
    if (_hitMarkers[i].time >= _hitMarkers[i].life) _hitMarkers.splice(i, 1);
  }
}
export function drawHitMarkers(ctx) {
  for (const m of _hitMarkers) {
    const t = m.time / m.life;
    const a = 1 - t;
    const size = m.crit ? 14 + t * 8 : 10 + t * 6;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.strokeStyle = m.crit ? '#ffeb99' : '#ffffff';
    ctx.lineWidth = m.crit ? 2.5 : 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(m.x - size, m.y - size);
    ctx.lineTo(m.x - size * 0.5, m.y - size * 0.5);
    ctx.moveTo(m.x + size, m.y - size);
    ctx.lineTo(m.x + size * 0.5, m.y - size * 0.5);
    ctx.moveTo(m.x - size, m.y + size);
    ctx.lineTo(m.x - size * 0.5, m.y + size * 0.5);
    ctx.moveTo(m.x + size, m.y + size);
    ctx.lineTo(m.x + size * 0.5, m.y + size * 0.5);
    ctx.stroke();
    ctx.restore();
  }
}

// ---------- Hit stop (global freeze frame on impact) ----------
let _hitStop = 0;
// Accessibility scale — 1.0 by default, reduced by main.js boot when the user
// has prefers-reduced-motion set. Freeze-frames are part of the impact feel
// but can trigger vestibular discomfort when they compound with shake.
let _hitStopScale = 1.0;
export function setHitStopScale(v) { _hitStopScale = Math.max(0, Math.min(1.5, v)); }
export function triggerHitStop(seconds = 0.05) {
  _hitStop = Math.max(_hitStop, seconds * _hitStopScale);
}
export function consumeHitStop(dt) {
  if (_hitStop > 0) {
    _hitStop -= dt;
    return true;
  }
  return false;
}

// ---------- Perfect dodge (time dilation reward for skill play) ----------
let _perfectDodge = 0;          // seconds remaining
const PERFECT_DODGE_DUR = 0.55;
let _perfectFlash = 0;
// Counter-attack window — next attack after perfect dodge gets guaranteed crit + bonus dmg.
// Stays armed for 1.6s after the perfect dodge ends, giving skilled play a combat reward.
let _counterWindow = 0;
const COUNTER_WINDOW = 2.0;

// Optional windowMul scales the COUNTER_WINDOW for relics that extend
// the perfect-dodge window (e.g. dagger's Flicker Step doubles it). The
// perfect-dodge slowmo + flash always run at the base duration —
// they're presentation, not gameplay reward — so windowMul only
// affects the counter-attack arming time.
export function triggerPerfectDodge(windowMul = 1) {
  _perfectDodge = PERFECT_DODGE_DUR;
  _perfectFlash = 0.3;
  _counterWindow = COUNTER_WINDOW * windowMul;
}

export function hasCounterAttack() { return _counterWindow > 0; }
export function consumeCounterAttack() {
  const had = _counterWindow > 0;
  _counterWindow = 0;
  return had;
}
export function counterWindowRemaining() { return _counterWindow; }

// Time-dilation factor applied to gameplay dt. 0.25 during perfect dodge,
// ramping back up over the last 150ms so it doesn't snap.
export function getTimeScale() {
  if (_perfectDodge <= 0) return 1;
  const r = _perfectDodge / PERFECT_DODGE_DUR;
  if (r > 0.4) return 0.25;
  return 0.25 + (1 - 0.25) * (1 - r / 0.4);
}

export function updatePerfectDodge(realDt) {
  // Uses REAL dt (not scaled) so the effect unwinds on wall-clock time
  if (_perfectDodge > 0) _perfectDodge -= realDt;
  if (_perfectFlash > 0) _perfectFlash -= realDt * 3;
  if (_counterWindow > 0) _counterWindow -= realDt;
}

export function isPerfectDodge() { return _perfectDodge > 0; }

// Screen overlay — blue flash fading out + "PERFECT" text when triggered
export function drawPerfectDodgeOverlay(ctx, w, h) {
  if (_perfectDodge <= 0) return;
  const fr = _perfectFlash;
  if (fr > 0) {
    ctx.fillStyle = 'rgba(130, 200, 255, ' + (0.35 * fr).toFixed(3) + ')';
    ctx.fillRect(0, 0, w, h);
  }
  // Edge-chromatic vignette: dark blue ring around the edges
  const r = _perfectDodge / PERFECT_DODGE_DUR;
  const edgeA = 0.45 * r;
  const vg = ctx.createRadialGradient(w/2, h/2, h * 0.25, w/2, h/2, h * 0.7);
  vg.addColorStop(0, 'rgba(60, 160, 255, 0)');
  vg.addColorStop(1, 'rgba(30, 100, 220, ' + edgeA.toFixed(3) + ')');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);
  // "PERFECT" text — fades out
  if (r > 0.55) {
    ctx.save();
    const a = Math.min(1, (r - 0.55) / 0.3 + 0.3);
    ctx.globalAlpha = a;
    ctx.font = 'bold 44px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#1a2a3a';
    ctx.fillText('PERFECT', w / 2 + 2, h / 2 + 2);
    ctx.fillStyle = '#e8f4ff';
    ctx.fillText('PERFECT', w / 2, h / 2);
    ctx.font = 'italic 14px Georgia, serif';
    ctx.fillStyle = 'rgba(220,240,255,0.85)';
    ctx.fillText('— strike now —', w / 2, h / 2 + 30);
    ctx.restore();
  }
}

// Draw a golden crescent/chevron near the hero that pulses while counter-window is armed
export function drawCounterIndicator(ctx, heroX, heroY) {
  if (_counterWindow <= 0) return;
  const t = _counterWindow / COUNTER_WINDOW;
  const pulse = 0.65 + 0.35 * Math.sin(performance.now() / 80);
  ctx.save();
  // Golden ring above hero
  const r = 24;
  ctx.strokeStyle = `rgba(255, 220, 130, ${(0.7 * t * pulse).toFixed(3)})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(heroX, heroY - 40, r, Math.PI * 1.1, Math.PI * 1.9);
  ctx.stroke();
  // Inner chevron
  ctx.strokeStyle = `rgba(255, 240, 180, ${(0.9 * t * pulse).toFixed(3)})`;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(heroX - 7, heroY - 54);
  ctx.lineTo(heroX, heroY - 60);
  ctx.lineTo(heroX + 7, heroY - 54);
  ctx.stroke();
  ctx.restore();
}

// ---------- Floating damage numbers ----------
const dmgPool = [];
const dmgLive = [];
// Side-channel: optional badge that precedes a damage number ("CRIT!", "EXECUTE!", "COUNTER!")
// Rendered at a fixed offset above the number's start, with a drop-shadow + scale-pop.
export function spawnDamageNumber(x, y, amount, opts = {}) {
  const p = dmgPool.pop() || {};
  p.x = x; p.y = y;
  // Directional arc if dir provided, else random. Counter hits fly opposite of hit vector for drama.
  const dir = opts.dir;
  if (dir) {
    p.vx = -dir.x * 40 + (Math.random() - 0.5) * 14;
    p.vy = -dir.y * 60 - 120 - Math.random() * 30;
  } else {
    p.vx = (Math.random() * 2 - 1) * 30;
    p.vy = -120 - Math.random() * 40;
  }
  p.life = opts.counter || opts.exec ? 1.1 : (opts.charged || opts.finisher) ? 0.95 : 0.85;
  p.maxLife = p.life;
  p.text = String(amount | 0);
  // HUD LEGIBILITY PASS (review #2): size/color/badge priority picks the
  // SINGLE most informative tag to show, in player-intent order:
  //   counter > exec > charge > finisher > crit
  // Counter & exec stay on top because they're rare/situational. Charge
  // and finisher outrank crit so the player sees WHY the hit was big
  // (their action, not RNG).
  const sizeBoost = opts.counter ? 6 : opts.exec ? 5 : opts.charged ? 4 : opts.finisher ? 3 : opts.crit ? 2 : 0;
  p.size = (amount >= 50 ? 20 : amount >= 30 ? 17 : 14) + sizeBoost;
  p.color = opts.counter ? '#ffeb99'
          : opts.exec ? '#ff7a55'
          : opts.charged ? '#ffea80'
          : opts.finisher ? '#c8a8ff'
          : opts.crit ? '#ffd27a'
          : amount >= 50 ? '#ff9a66'
          : amount >= 30 ? '#ffd4bf'
          : '#ffffff';
  p.outline = 'rgba(20,10,20,0.9)';
  p.badge = opts.counter ? 'COUNTER!'
          : opts.exec ? 'EXECUTE!'
          : opts.charged ? 'CHARGE!'
          : opts.finisher ? 'FINISH!'
          : opts.crit ? 'CRIT!'
          : '';
  p.badgeColor = opts.counter ? '#fff2b8'
               : opts.exec ? '#ff5540'
               : opts.charged ? '#ffea80'
               : opts.finisher ? '#c8a8ff'
               : '#ffd27a';
  // Element tag — shown as secondary badge (WEAK in cyan / RESIST in grey)
  p.elementTag = opts.elementTag || '';
  p.elementColor = opts.elementTag === 'WEAK' ? '#7fffd4' : opts.elementTag === 'RESIST' ? '#808090' : '';
  dmgLive.push(p);
  // Crit/exec/counter trigger a subtle screen-wash flash.
  // VFX SUBTRACTION PASS: per-hit flash alpha halved — these fire multiple
  // times per second in intense combat and were stacking with bloom+shake
  // into illegibility. Durations unchanged so the moments still register.
  if (opts.counter) triggerScreenFlash('rgba(255, 230, 150, 0.14)', 0.28);
  else if (opts.exec) triggerScreenFlash('rgba(255, 90, 70, 0.11)', 0.22);
  else if (opts.crit) triggerScreenFlash('rgba(255, 210, 120, 0.06)', 0.15);
}

// Screen flash — brief colored overlay for big hits
let _screenFlashColor = null;
let _screenFlashTime = 0;
let _screenFlashDur = 0;
export function triggerScreenFlash(color, dur = 0.2) {
  // Accumulate: take the longer, stronger effect rather than reset
  if (dur > _screenFlashTime) {
    _screenFlashColor = color;
    _screenFlashTime = dur;
    _screenFlashDur = dur;
  }
}
export function drawScreenFlash(ctx, w, h) {
  if (_screenFlashTime <= 0 || !_screenFlashColor) return;
  const a = _screenFlashTime / _screenFlashDur;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = _screenFlashColor;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}
export function updateScreenFlash(realDt) {
  if (_screenFlashTime > 0) _screenFlashTime -= realDt;
}

export function updateFx(dt) {
  for (let i = dmgLive.length - 1; i >= 0; i--) {
    const p = dmgLive[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 160 * dt;        // slight gravity
    p.vx *= Math.pow(0.2, dt);
    p.life -= dt;
    if (p.life <= 0) { dmgLive.splice(i, 1); dmgPool.push(p); }
  }
  for (let i = slashLive.length - 1; i >= 0; i--) {
    const s = slashLive[i];
    s.t += dt;
    if (s.t >= s.dur) { slashLive.splice(i, 1); slashPool.push(s); }
  }
}

export function drawDamageNumbers(ctx) {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const p of dmgLive) {
    const t = p.life / p.maxLife;
    ctx.globalAlpha = Math.min(1, t * 1.6);
    // Pop scale for crits/execs/counters in first 100ms
    const pop = p.badge ? 1 + Math.max(0, 1 - (p.maxLife - p.life) * 10) * 0.4 : 1;
    ctx.font = 'bold ' + (p.size * pop) + 'px Georgia, "Cormorant Garamond", serif';
    // Thick dark outline for readability against any floor color
    ctx.lineWidth = 4;
    ctx.strokeStyle = p.outline;
    ctx.lineJoin = 'round';
    ctx.strokeText(p.text, p.x, p.y);
    // Inner fill
    ctx.fillStyle = p.color;
    ctx.fillText(p.text, p.x, p.y);
    // Tiny highlight on top-left for depth
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fillText(p.text, p.x - 1, p.y - 1);
    // Badge text above the number
    if (p.badge) {
      const badgePop = 1 + Math.max(0, 1 - (p.maxLife - p.life) * 7) * 0.6;
      ctx.font = 'bold ' + (11 * badgePop) + 'px Georgia, serif';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(10, 5, 10, 0.95)';
      ctx.strokeText(p.badge, p.x, p.y - p.size * pop - 2);
      ctx.fillStyle = p.badgeColor;
      ctx.fillText(p.badge, p.x, p.y - p.size * pop - 2);
    }
    // Element weakness/resist tag — to the right of the number
    if (p.elementTag) {
      ctx.font = 'bold 9px Georgia, serif';
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = 'rgba(10, 5, 10, 0.95)';
      const tx = p.x + p.size * pop * 0.7;
      ctx.strokeText(p.elementTag, tx, p.y + 2);
      ctx.fillStyle = p.elementColor;
      ctx.fillText(p.elementTag, tx, p.y + 2);
    }
  }
  ctx.restore();
}

export function clearFx() {
  dmgLive.length = 0;
  slashLive.length = 0;
  _perfectDodge = 0;
  _perfectFlash = 0;
  _counterWindow = 0;
  _screenFlashTime = 0;
  _hitMarkers.length = 0;
  _hitStop = 0;
}

// ---------- Sword slash arc ----------
// A curved arc that sweeps across the hero's swing during the attack window.
const slashPool = [];
const slashLive = [];

export function spawnSlash(x, y, aimX, aimY, reach, opts = {}) {
  const s = slashPool.pop() || {};
  s.x = x; s.y = y;
  s.aim = Math.atan2(aimY, aimX);
  s.reach = reach;
  s.t = 0;
  s.dur = opts.dur ?? 0.18;
  s.color = opts.color || 'rgba(255, 255, 255, ';
  s.width = opts.width ?? 8;
  s.trailCount = opts.trailCount ?? 3;
  s.arc = opts.arc ?? Math.PI * 0.75;
  slashLive.push(s);
}

export function drawSlashes(ctx) {
  for (const s of slashLive) {
    const t = s.t / s.dur;
    const arc = s.arc;
    const trails = s.trailCount;
    // PASS 1 — wide glow under the slash (additive bloom)
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let k = 0; k < Math.min(2, trails); k++) {
      const kt = Math.max(0, t - k * 0.07);
      if (kt <= 0) continue;
      const sweepK = -arc / 2 + arc * kt;
      const glowA = (1 - k * 0.4) * (1 - t) * 0.35;
      const glowW = s.width * 3 * (1 - t * 0.3);
      ctx.translate(s.x, s.y);
      ctx.rotate(s.aim + sweepK);
      ctx.strokeStyle = s.color + glowA.toFixed(3) + ')';
      ctx.lineWidth = glowW;
      ctx.lineCap = 'round';
      ctx.beginPath();
      const r = s.reach * (0.6 + 0.25 * (1 - kt));
      ctx.moveTo(r * 0.55, -3);
      ctx.quadraticCurveTo(r * 0.85, 0, r * 0.55, 3);
      ctx.stroke();
      ctx.rotate(-(s.aim + sweepK));
      ctx.translate(-s.x, -s.y);
    }
    ctx.restore();
    // PASS 2 — primary slash trails (crisp blade)
    for (let k = 0; k < trails; k++) {
      const kt = Math.max(0, t - k * 0.07);
      if (kt <= 0) continue;
      const sweepK = -arc / 2 + arc * kt;
      const alpha = (1 - k * (0.9 / trails)) * (1 - t) * 0.9;
      const width = (s.width - k * (s.width / (trails + 1))) * (1 - t * 0.4);
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.aim + sweepK);
      ctx.strokeStyle = s.color + alpha.toFixed(3) + ')';
      ctx.lineWidth = width;
      ctx.lineCap = 'round';
      ctx.beginPath();
      const r = s.reach * (0.6 + 0.25 * (1 - kt));
      ctx.moveTo(r * 0.55, -3);
      ctx.quadraticCurveTo(r * 0.85, 0, r * 0.55, 3);
      ctx.stroke();
      ctx.restore();
    }
  }
}
