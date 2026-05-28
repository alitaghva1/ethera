// ============================================================================
// MOBILE MODE — three-layer detection for "should virtual controls show?"
//
// Layer 1: matchMedia('(pointer: coarse)') AND matchMedia('(hover: none)')
//   Both must be true. Together they identify "primary input is finger,
//   no hover capability" — phone or detached tablet. Catches the common
//   cases without false-positiving touchscreen laptops (which have a
//   coarse pointer but ALSO have a fine pointer + hover via the trackpad).
//
// Layer 2: Settings override — settings.mobileControls is 'auto' | 'on' | 'off'.
//   'on' forces virtual controls (touchscreen laptop user who WANTS them);
//   'off' forces them off (tablet user with keyboard who wants WASD);
//   'auto' falls through to layer 1 + layer 3.
//
// Layer 3: First-touch fallback — if a touch event fires before any
//   mouse-move, lock in mobile mode regardless of what matchMedia said.
//   Catches obscure browser/device combos that misreport pointer/hover.
//
// Application: a body.mobile-controls CSS class. Virtual control DOM
// elements are display:none by default and become visible when the body
// has that class. Zero JS in the render path; toggling the class is the
// single source of truth.
// ============================================================================

import { settings } from './settings';

// Cache the resolved mode so repeated calls are cheap. Invalidated by
// applyMobileMode() — the only function that mutates the body class.
let _resolved = null;
let _firstTouchSeen = false;

/**
 * Compute the current mobile-mode state. Reads settings + matchMedia +
 * the first-touch flag. Does NOT mutate any DOM. Pure observer.
 */
export function detectMobileMode() {
  const override = settings && settings.mobileControls;
  if (override === 'on') return true;
  if (override === 'off') return false;
  // 'auto' — coarse pointer AND no hover, OR first-touch fallback fired.
  if (_firstTouchSeen) return true;
  try {
    return (
      window.matchMedia('(pointer: coarse)').matches &&
      window.matchMedia('(hover: none)').matches
    );
  } catch (_e) {
    return false;
  }
}

/**
 * Toggle the body.mobile-controls CSS class to match detectMobileMode().
 * Safe to call repeatedly; the class.toggle no-ops when state matches.
 * Call once on boot, and again whenever the user changes the setting or
 * the first-touch fallback flips.
 */
export function applyMobileMode() {
  const enabled = detectMobileMode();
  _resolved = enabled;
  if (typeof document !== 'undefined' && document.body) {
    document.body.classList.toggle('mobile-controls', enabled);
  }
  return enabled;
}

/**
 * Read-only accessor — returns the cached mode without recomputing.
 * Use from hot paths (per-frame render, hot input handlers).
 */
export function isMobileMode() {
  return _resolved !== null ? _resolved : detectMobileMode();
}

/**
 * Install the first-touch fallback. Listens once for the first input
 * event after page load. If a touch fires before any mousemove, set
 * the firstTouchSeen flag and re-apply. Both listeners auto-clean
 * after firing so this is one-shot only.
 *
 * Call once at boot, after loadSettings().
 */
export function installFirstTouchFallback() {
  let mouseSeenFirst = false;
  const onMouse = () => {
    mouseSeenFirst = true;
    cleanup();
  };
  const onPointer = (e) => {
    if (e.pointerType === 'touch' && !mouseSeenFirst && !_firstTouchSeen) {
      _firstTouchSeen = true;
      // Re-apply with the new flag in play. If we were already in mobile
      // mode (matchMedia agreed), this is a no-op; if we weren't, the
      // body class flips on now and the virtual controls become visible.
      applyMobileMode();
    }
    cleanup();
  };
  const cleanup = () => {
    window.removeEventListener('mousemove', onMouse);
    window.removeEventListener('pointerdown', onPointer);
  };
  window.addEventListener('mousemove', onMouse, { once: true });
  window.addEventListener('pointerdown', onPointer);
}
