// Input — keyboard + mouse state
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

  canvas.addEventListener('mousemove', (e) => {
    const r = canvas.getBoundingClientRect();
    const sx = canvas.width  / r.width;
    const sy = canvas.height / r.height;
    mouse.x = (e.clientX - r.left) * sx;
    mouse.y = (e.clientY - r.top)  * sy;
  });
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) { mouse.down = true; mouse.pressed = true; }
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) mouse.down = false;
  });
}

// Call once per frame AFTER update to consume per-frame edges
export function endFrameInput() {
  justPressed.clear();
  mouse.pressed = false;
}

export function keyJustPressed(code) {
  return justPressed.has(code);
}
