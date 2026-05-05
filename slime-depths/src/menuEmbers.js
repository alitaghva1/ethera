// ============================================================================
// MENU EMBER PARTICLES — warm gold specks drifting up from screen bottom,
// as if rising from the torches and the glow below the stair.
//
// Runs on its own rAF loop, independent of the main game tick. Only draws
// when the caller-supplied `getActiveCanvas` returns a canvas — null skips
// the frame. This lets the same particle pool serve the main menu, the
// hamlet, or future screens that want an ember bed without each one needing
// its own system.
//
// Horizontal wrap is implicit in the expiry rule (x<-0.05 or x>1.05); there
// is no explicit sway beyond the sinusoid per particle.
// ============================================================================

const _embers = [];

function _seedEmber() {
  _embers.push({
    x: Math.random(), // 0..1 fraction of width
    y: 0.82 + Math.random() * 0.18, // start near bottom
    vy: 0.0006 + Math.random() * 0.0009, // upward drift speed (frac/frame)
    vx: (Math.random() - 0.5) * 0.0004, // slight lateral sway
    phase: Math.random() * Math.PI * 2, // for sway oscillation
    phaseSpeed: 0.015 + Math.random() * 0.025,
    size: 0.7 + Math.random() * 1.6, // px radius
    life: 0,
    maxLife: 380 + Math.random() * 280, // frames
    hue: 28 + Math.random() * 18, // amber-orange range
    sat: 75 + Math.random() * 20,
    lum: 58 + Math.random() * 18,
  });
}

/**
 * Start the ember rAF loop. Call once at boot.
 *
 * @param {() => HTMLCanvasElement | null} getActiveCanvas
 *   Called each frame. Return the canvas to draw to, or null to skip the
 *   frame (e.g. both menu and hamlet are hidden — we're mid-gameplay).
 */
export function startMenuEmbers(getActiveCanvas) {
  // Seed some so the first frame isn't empty.
  for (let i = 0; i < 28; i++) {
    _seedEmber();
    const e = _embers[_embers.length - 1];
    e.y = Math.random();
    e.life = Math.random() * 280;
  }
  // Track the last canvas we drew to so we can clear it the moment the
  // active target changes (or goes null). Without this, the hamlet
  // overlay canvas (mix-blend-mode: screen, z-index 5) keeps the LAST
  // FRAME of warm hamlet embers stuck on top of the dungeon view after
  // the player walks through the portal — exactly the "warm dots come
  // back after death" leak playtest flagged. Fresh-from-menu runs are
  // unaffected because they never paint to the hamlet overlay canvas.
  let _lastTargetCvs = null;

  function tick() {
    const cvs = getActiveCanvas();
    if (cvs !== _lastTargetCvs && _lastTargetCvs) {
      // Active target switched (hamlet → dungeon, or hamlet/menu → null).
      // Clear the canvas we WERE drawing to so its last frame doesn't
      // persist as a stale overlay through mix-blend-mode.
      try {
        const w = _lastTargetCvs.width, h = _lastTargetCvs.height;
        if (w > 0 && h > 0) {
          _lastTargetCvs.getContext('2d').clearRect(0, 0, w, h);
        }
      } catch (_e) {}
    }
    _lastTargetCvs = cvs;
    if (!cvs) {
      requestAnimationFrame(tick);
      return;
    }
    // Match canvas resolution to display size for crisp dots.
    const w = cvs.clientWidth;
    const h = cvs.clientHeight;
    if (cvs.width !== w || cvs.height !== h) {
      cvs.width = w;
      cvs.height = h;
    }
    const ctx = cvs.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    // Keep population around 70.
    while (_embers.length < 70) _seedEmber();
    for (let i = _embers.length - 1; i >= 0; i--) {
      const e = _embers[i];
      e.life++;
      e.phase += e.phaseSpeed;
      e.y -= e.vy;
      e.x += e.vx + Math.sin(e.phase) * 0.0005;
      if (e.y < -0.05 || e.life > e.maxLife || e.x < -0.05 || e.x > 1.05) {
        _embers.splice(i, 1);
        continue;
      }
      // Fade in over first 60 frames, fade out over last 120.
      const fadeIn = Math.min(1, e.life / 60);
      const fadeOut = Math.min(1, (e.maxLife - e.life) / 120);
      const alpha = Math.min(fadeIn, fadeOut) * (0.55 + 0.45 * Math.sin(e.phase * 1.3));
      const px = e.x * w;
      const py = e.y * h;
      const r = e.size;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const grad = ctx.createRadialGradient(px, py, 0, px, py, r * 6);
      grad.addColorStop(0, `hsla(${e.hue},${e.sat}%,${e.lum}%,${alpha})`);
      grad.addColorStop(0.4, `hsla(${e.hue - 4},${e.sat}%,${e.lum - 12}%,${alpha * 0.4})`);
      grad.addColorStop(1, `hsla(${e.hue - 8},${e.sat}%,${e.lum - 24}%,0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(px, py, r * 6, 0, Math.PI * 2);
      ctx.fill();
      // Core pixel.
      ctx.fillStyle = `hsla(${e.hue + 6},${e.sat}%,${Math.min(94, e.lum + 22)}%,${alpha})`;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
}
