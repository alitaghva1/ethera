// ============================================================================
// THEMED ROOM MOTES — ambient theme-color particles drifting through the
// room while the hero is in a theme-tagged room. Subtle: ~6 active motes
// at any time, slow upward drift, soft additive bloom. Reads as "ambient
// magic suggesting the offering ahead" rather than active VFX.
//
// Spawns from random points along the bottom 60% of the screen; rises +
// fades over 4-7 s. Refreshed each frame to maintain target count. No
// pool — array stays small enough that natural alloc churn is fine at
// 6-mote target.
//
// Same role as menuEmbers.js for the menu/hamlet, but theme-tinted and
// scoped to dungeon rooms with a roomTheme set. Drawn in screen space
// (over the world but under the HUD), so no camera math needed.
// ============================================================================

import { THEMES } from './themes.js';

const _motes = [];
const TARGET_COUNT = 6;
let _activeTheme = null;          // current theme id, or null when not in themed room

// Set the active room theme. Pass null to clear (e.g. when entering a
// non-themed room). Switching themes wipes existing motes so the player
// doesn't see lingering FLAME motes drift into a SHADOW room.
export function setThemedRoomActive(themeId) {
  if (themeId === _activeTheme) return;
  _activeTheme = themeId || null;
  if (!_activeTheme) _motes.length = 0;
  else {
    // Wipe any old-theme motes so the transition is clean.
    for (let i = _motes.length - 1; i >= 0; i--) {
      if (_motes[i].themeId !== _activeTheme) _motes.splice(i, 1);
    }
  }
}

// Force-clear — used on run-end / loadRoom transitions / floor change.
export function clearThemedRoom() {
  _activeTheme = null;
  _motes.length = 0;
}

export function getActiveRoomTheme() {
  return _activeTheme;
}

function _spawn(themeId, w, h) {
  _motes.push({
    x: Math.random() * w,
    y: h * (0.5 + Math.random() * 0.5),
    vx: (Math.random() - 0.5) * 8,         // px/s lateral drift
    vy: -10 - Math.random() * 14,          // px/s upward drift
    phase: Math.random() * Math.PI * 2,
    phaseSpeed: 1 + Math.random() * 1.5,
    size: 1.5 + Math.random() * 2.0,
    life: 0,
    maxLife: 4 + Math.random() * 3,
    themeId,
  });
}

export function updateThemedRoomMotes(dt, w, h) {
  if (!_activeTheme) {
    if (_motes.length) _motes.length = 0;
    return;
  }
  // Maintain target count
  while (_motes.length < TARGET_COUNT) _spawn(_activeTheme, w, h);
  // Tick existing
  for (let i = _motes.length - 1; i >= 0; i--) {
    const m = _motes[i];
    m.life += dt;
    m.x += m.vx * dt + Math.sin(m.phase + m.life * m.phaseSpeed) * 0.3;
    m.y += m.vy * dt;
    if (m.life >= m.maxLife || m.y < -10) _motes.splice(i, 1);
  }
}

// alphaMul: multiplier applied to every mote's final alpha. Used by the
// combat-aware atmospheric dim — themed motes are screen-space (can't
// be masked to the void around the room), so during active combat the
// caller fades the entire layer to ~30% so the motes don't compete
// with enemy projectiles + telegraphs for the player's eye. Default 1
// preserves prior behavior.
export function drawThemedRoomMotes(ctx, alphaMul = 1) {
  if (!_motes.length) return;
  const layerMul = Math.max(0, Math.min(1, alphaMul));
  if (layerMul <= 0.005) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const m of _motes) {
    const theme = THEMES[m.themeId];
    if (!theme) continue;
    // Fade in for 0.6s then fade out over the last 1.2s
    const fadeIn = Math.min(1, m.life / 0.6);
    const fadeOut = Math.min(1, (m.maxLife - m.life) / 1.2);
    const a = Math.max(0, Math.min(fadeIn, fadeOut)) * layerMul;
    if (a <= 0) continue;
    const flicker = 0.7 + 0.3 * Math.sin(m.phase + m.life * m.phaseSpeed * 2);
    const r = m.size;
    const hex = theme.color.replace('#', '');
    const n = parseInt(hex.length === 3 ? hex.split('').map(c => c + c).join('') : hex, 16);
    const tr = (n >> 16) & 255, tg = (n >> 8) & 255, tb = n & 255;
    // Outer halo
    const halo = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, r * 4);
    halo.addColorStop(0, `rgba(${tr},${tg},${tb},${(0.45 * a * flicker).toFixed(3)})`);
    halo.addColorStop(1, `rgba(${tr},${tg},${tb},0)`);
    ctx.fillStyle = halo;
    ctx.fillRect(m.x - r * 4, m.y - r * 4, r * 8, r * 8);
    // Bright core
    ctx.fillStyle = `rgba(255, 255, 255, ${(0.6 * a * flicker).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(m.x, m.y, r * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
