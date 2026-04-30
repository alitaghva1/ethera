// Input — keyboard + unified pointer state (mouse / touch / pen).
// The `mouse` export name is kept for backward compatibility with every
// consumer that reads it, but the implementation is pointer-event based
// so the game works on phones and tablets too.
//
// Wizard-kit Sprint 1 — added `mouse.right{Down,Pressed}` to track RMB
// for the new Hand Blast cast. Mobile binds blast to a dedicated button
// in the virtual controls overlay; desktop uses RMB. Existing LMB
// (mouse.down/pressed) is unchanged so all attack/charge code paths
// keep working.
export const keys = {};
export const mouse = { x: 0, y: 0, down: false, pressed: false, rightDown: false, rightPressed: false };
const justPressed = new Set();

// ─── VIRTUAL INPUT (mobile controls) ────────────────────────────────────────
// The mobile virtual-controls overlay (mobileControls.js) writes movement
// into virtualMove and uses the injectKey/injectMouse helpers below to
// fake keyboard/mouse events from finger taps. Hero.js + main.js read
// from these alongside the regular keys + mouse state — virtual input
// supplements rather than replaces. virtualMove magnitude is in [-1, 1]
// per axis matching the joystick deflection.
export const virtualMove = { x: 0, y: 0, active: false };

// Inject a key-down state. Mirrors the natural keydown handler — adds to
// `keys` map and fires a justPressed edge if the key wasn't already held.
// Used by the dodge / dash buttons on the mobile overlay (Space, KeyQ).
export function injectKeyDown(code) {
  if (!keys[code]) justPressed.add(code);
  keys[code] = true;
}
export function injectKeyUp(code) {
  keys[code] = false;
}

// Inject a mouse-down state at an optional canvas position. The mobile
// attack button calls injectMouseDown (on touch-down) and injectMouseUp
// (on touch-up). hold-to-charge naturally falls out: while the button is
// held, mouse.down stays true, hero.chargeTime accumulates.
export function injectMouseDown() {
  if (!mouse.down) mouse.pressed = true;
  mouse.down = true;
}
export function injectMouseUp() {
  mouse.down = false;
}
// Wizard-kit — RMB injection for the mobile blast button. Same
// edge-detection pattern as injectMouseDown: rightPressed fires once
// per fresh press, rightDown stays true while the button is held.
export function injectRightMouseDown() {
  if (!mouse.rightDown) mouse.rightPressed = true;
  mouse.rightDown = true;
}
export function injectRightMouseUp() {
  mouse.rightDown = false;
}

export function initInput(canvas) {
  window.addEventListener('keydown', (e) => {
    if (!keys[e.code]) justPressed.add(e.code);
    keys[e.code] = true;
    // Prevent arrow/WASD/space scrolling. Also Tab — held to inspect
    // elite affixes (enemies.js drawEliteAffixTooltips); browser-default
    // is to move focus, which would steal the held-key state.
    if (['Space','KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Tab'].includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });

  // Release-prep pass: unified Pointer Events replace the old mouse-only
  // handlers. Pointer events are fired for mouse, touch, AND pen in every
  // modern browser (Chrome 55+, Firefox 59+, Safari 13+, iOS Safari 13+).
  // Same `mouse` state object, so no downstream code has to change.
  const updatePointerPosition = (e) => {
    const r = canvas.getBoundingClientRect();
    // Guard against layout-settle timing where width/height can briefly be 0.
    if (r.width === 0 || r.height === 0) return;
    const sx = canvas.width  / r.width;
    const sy = canvas.height / r.height;
    mouse.x = (e.clientX - r.left) * sx;
    mouse.y = (e.clientY - r.top)  * sy;
  };

  canvas.addEventListener('pointermove', updatePointerPosition);
  canvas.addEventListener('pointerdown', (e) => {
    if (!e.isPrimary) return;                             // ignore secondary touches
    updatePointerPosition(e);
    if (e.pointerType === 'mouse') {
      // Mouse: LMB (button 0) → mouse.down (attack/charge); RMB
      // (button 2) → mouse.rightDown (blast cast). Other buttons
      // (middle, side) are ignored.
      if (e.button === 0) {
        mouse.down = true;
        mouse.pressed = true;
      } else if (e.button === 2) {
        mouse.rightDown = true;
        mouse.rightPressed = true;
      } else {
        return;
      }
    } else {
      // Touch / pen: single-finger contact maps to LMB. Two-finger
      // and stylus side-button gestures aren't surfaced here; blast
      // on mobile uses the dedicated on-screen button instead.
      mouse.down = true;
      mouse.pressed = true;
    }
    // Keep receiving pointermove even if the finger/cursor leaves the canvas.
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
  });
  // Pointer up/cancel listen on window so releases outside the canvas still register.
  const endPress = (e) => {
    if (!e.isPrimary) return;
    if (e.pointerType === 'mouse') {
      if (e.button === 0) mouse.down = false;
      else if (e.button === 2) mouse.rightDown = false;
    } else {
      mouse.down = false;
    }
  };
  window.addEventListener('pointerup', endPress);
  window.addEventListener('pointercancel', endPress);
  // Suppress the iOS long-press context menu AND right-click context
  // menu on the canvas — the long-press path used to break hold-to-
  // charge; with the new blast on RMB, suppressing default also
  // prevents the browser context menu from popping up mid-cast.
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
}

// Call once per frame AFTER update to consume per-frame edges
export function endFrameInput() {
  justPressed.clear();
  mouse.pressed = false;
  mouse.rightPressed = false;
}

export function keyJustPressed(code) {
  return justPressed.has(code);
}
