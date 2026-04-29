// ============================================================================
// MOBILE CONTROLS — virtual joystick + action buttons
//
// Wires the DOM overlay (#mobileControls in index.html) into the existing
// input model. Multi-touch via pointerId tracking so a player can hold
// the joystick with their left thumb while tapping the attack/dodge/dash
// buttons with their right thumb simultaneously.
//
// Output channels:
//   - virtualMove.x/y — set by joystick deflection in [-1, 1]
//   - injectMouseDown/Up — fired by the attack button (hold to charge,
//     release for swing); same path as desktop LMB.
//   - injectKeyDown('Space') — fired by dodge button.
//   - injectKeyDown('KeyQ')  — fired by dash button.
//
// Only initialized when body.mobile-controls is present (set by
// mobileMode.js). Calling initMobileControls() is idempotent — safe to
// call multiple times across hot reloads.
// ============================================================================

import {
  virtualMove,
  injectMouseDown, injectMouseUp,
  injectKeyDown, injectKeyUp,
} from './input.js';

let _initialized = false;

// Joystick — output deflection in normalized [-1, 1] per axis at the
// MAX_RADIUS pixel distance. Pointer captured on touch-down; released
// on up/cancel. The base sprite spawns at the touch-down point (floating
// joystick model) so the user doesn't have to find a fixed origin.
const MAX_RADIUS = 60;       // pixels at which deflection saturates to 1.0
const DEAD_ZONE  = 8;        // ignore deflection below this many pixels
let _joyPointerId = null;
let _joyOriginX = 0;
let _joyOriginY = 0;

export function initMobileControls() {
  if (_initialized) return;
  if (typeof document === 'undefined') return;
  const root = document.getElementById('mobileControls');
  if (!root) return;          // DOM not ready (shouldn't happen post-boot)
  _initialized = true;

  _wireJoystick();
  _wireActionButton('mobileAttack', 'mouse');
  _wireActionButton('mobileDodge',  'key', 'Space');
  // Dash button doubles as the hamlet "interact" button: injects KeyQ
  // (dash-strike in dungeon, suppressed in hamlet) AND KeyE (interact
  // with NPC / portal in hamlet, no-op in dungeon). Both fire together
  // on press; whichever the current room responds to wins. Avoids
  // needing a separate interact button on the right rail.
  _wireActionButton('mobileDash',   'multikey', ['KeyQ', 'KeyE']);
}

// ─── Joystick ────────────────────────────────────────────────────────────────

function _wireJoystick() {
  const zone = document.getElementById('mobileLeft');
  const base = document.getElementById('joystickBase');
  const stick = document.getElementById('joystickStick');
  if (!zone || !base || !stick) return;

  zone.addEventListener('pointerdown', (e) => {
    if (_joyPointerId !== null) return;     // already tracking another finger
    _joyPointerId = e.pointerId;
    const r = zone.getBoundingClientRect();
    _joyOriginX = e.clientX - r.left;
    _joyOriginY = e.clientY - r.top;
    base.style.left = _joyOriginX + 'px';
    base.style.top = _joyOriginY + 'px';
    base.classList.add('active');
    virtualMove.active = true;
    // Keep getting moves even if the finger leaves the zone.
    try { zone.setPointerCapture(e.pointerId); } catch (_) {}
    e.preventDefault();
  });

  zone.addEventListener('pointermove', (e) => {
    if (e.pointerId !== _joyPointerId) return;
    const r = zone.getBoundingClientRect();
    const px = e.clientX - r.left;
    const py = e.clientY - r.top;
    let dx = px - _joyOriginX;
    let dy = py - _joyOriginY;
    const dist = Math.hypot(dx, dy);
    // Clamp visual stick travel to MAX_RADIUS so it can't fly off the base.
    const visDist = Math.min(dist, MAX_RADIUS);
    if (dist > 0) {
      stick.style.transform =
        `translate(${(dx / dist) * visDist}px, ${(dy / dist) * visDist}px)`;
    }
    // Output normalized deflection — dead zone -> 0, MAX_RADIUS -> 1.
    if (dist < DEAD_ZONE) {
      virtualMove.x = 0;
      virtualMove.y = 0;
    } else {
      const norm = Math.min(1, (dist - DEAD_ZONE) / (MAX_RADIUS - DEAD_ZONE));
      virtualMove.x = (dx / dist) * norm;
      virtualMove.y = (dy / dist) * norm;
    }
    e.preventDefault();
  });

  const endJoy = (e) => {
    if (e.pointerId !== _joyPointerId) return;
    _joyPointerId = null;
    virtualMove.x = 0;
    virtualMove.y = 0;
    virtualMove.active = false;
    stick.style.transform = 'translate(0, 0)';
    base.classList.remove('active');
  };
  zone.addEventListener('pointerup', endJoy);
  zone.addEventListener('pointercancel', endJoy);
  // If the captured pointer leaves the document entirely (e.g. dragged
  // off the viewport edge), the OS may stop firing events — listen on
  // window too for safety.
  window.addEventListener('pointerup', endJoy);
  window.addEventListener('pointercancel', endJoy);
}

// ─── Action buttons ──────────────────────────────────────────────────────────
// Each button captures its OWN pointerId so left-thumb joystick and
// right-thumb taps don't fight each other. press/release pair injects
// into the existing input model (mouse-down for attack, key-down for
// dodge/dash) so the rest of the game doesn't need to know about mobile.

function _wireActionButton(elId, mode, keyCode) {
  const el = document.getElementById(elId);
  if (!el) return;
  let pid = null;     // pointerId of the touch currently pressing this button

  const fire = (down) => {
    if (mode === 'mouse') {
      if (down) injectMouseDown(); else injectMouseUp();
    } else if (mode === 'key') {
      if (down) injectKeyDown(keyCode); else injectKeyUp(keyCode);
    } else if (mode === 'multikey') {
      // keyCode is an array — fire all in lockstep so the room handler
      // that's listening for any one of them wins.
      for (const k of keyCode) {
        if (down) injectKeyDown(k); else injectKeyUp(k);
      }
    }
  };

  const press = (e) => {
    if (pid !== null) return;
    pid = e.pointerId;
    el.classList.add('pressed');
    fire(true);
    try { el.setPointerCapture(e.pointerId); } catch (_) {}
    e.preventDefault();
    e.stopPropagation();
  };
  const release = (e) => {
    if (e.pointerId !== pid) return;
    pid = null;
    el.classList.remove('pressed');
    fire(false);
  };

  el.addEventListener('pointerdown', press);
  el.addEventListener('pointerup', release);
  el.addEventListener('pointercancel', release);
  // If the finger slides off the button without lifting, treat as release.
  el.addEventListener('pointerleave', release);
}
