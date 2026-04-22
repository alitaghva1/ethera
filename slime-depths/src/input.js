// Input — keyboard + unified pointer state (mouse / touch / pen).
// The `mouse` export name is kept for backward compatibility with every
// consumer that reads it, but the implementation is pointer-event based
// so the game works on phones and tablets too.
export const keys = {};
export const mouse = { x: 0, y: 0, down: false, pressed: false };
const justPressed = new Set();

export function initInput(canvas) {
  window.addEventListener('keydown', (e) => {
    if (!keys[e.code]) justPressed.add(e.code);
    keys[e.code] = true;
    // Prevent arrow/WASD/space scrolling
    if (['Space','KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) e.preventDefault();
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
    if (e.pointerType === 'mouse' && e.button !== 0) return; // LMB only for mouse
    updatePointerPosition(e);
    mouse.down = true;
    mouse.pressed = true;
    // Keep receiving pointermove even if the finger/cursor leaves the canvas.
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
  });
  // Pointer up/cancel listen on window so releases outside the canvas still register.
  const endPress = (e) => {
    if (!e.isPrimary) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    mouse.down = false;
  };
  window.addEventListener('pointerup', endPress);
  window.addEventListener('pointercancel', endPress);
  // Suppress the iOS long-press context menu on the canvas — it breaks hold-to-charge.
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
}

// Call once per frame AFTER update to consume per-frame edges
export function endFrameInput() {
  justPressed.clear();
  mouse.pressed = false;
}

export function keyJustPressed(code) {
  return justPressed.has(code);
}
