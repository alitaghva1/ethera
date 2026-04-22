// Camera — smooth follow + screen shake + zoom pulse
export const camera = {
  x: 0, y: 0,
  targetX: 0, targetY: 0,
  shakeAmp: 0, shakeDur: 0,
  offsetX: 0, offsetY: 0,
  viewW: 1280, viewH: 720,
  lerp: 6,
  // Zoom pulse — for visceral big-hit feedback. Base zoom is 1.0; pulse adds a
  // brief kick (zoomPulseAmt) that decays over zoomPulseTime.
  zoom: 1.0,
  zoomPulseAmt: 0,
  zoomPulseTime: 0,
  zoomPulseDur: 0,
};

export function setCameraSize(w, h) { camera.viewW = w; camera.viewH = h; }

export function followCamera(tx, ty) {
  camera.targetX = tx;
  camera.targetY = ty;
}

let shakeScale = 1.0;
export function setShakeScale(v) { shakeScale = Math.max(0, Math.min(1.5, v)); }
export function getShakeScale() { return shakeScale; }

export function shakeCamera(amp, dur) {
  const a = amp * shakeScale;
  camera.shakeAmp = Math.max(camera.shakeAmp, a);
  camera.shakeDur = Math.max(camera.shakeDur, dur);
}

// Pulse the camera zoom briefly. amt > 0 zooms in (punch-in), < 0 zooms out.
// dur is total seconds; amount decays quartic so the kick is front-loaded.
export function pulseZoom(amt, dur = 0.25) {
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
    const a = camera.shakeAmp * Math.max(0, camera.shakeDur / 0.25);
    camera.offsetX = (Math.random() * 2 - 1) * a;
    camera.offsetY = (Math.random() * 2 - 1) * a;
    if (camera.shakeDur <= 0) {
      camera.shakeDur = 0; camera.shakeAmp = 0;
      camera.offsetX = 0; camera.offsetY = 0;
    }
  } else {
    camera.offsetX = 0; camera.offsetY = 0;
  }
  // Ambient idle breathe — very subtle continuous zoom modulation while no pulse
  // is active. Gives the camera a living quality; adds tension in combat lulls.
  // Only applied when shakeScale > 0 (accessibility: users who turned off shake
  // probably don't want camera drift either).
  const breathe = shakeScale > 0 ? Math.sin(performance.now() / 2400) * 0.006 : 0;
  // Zoom pulse decay — quartic ease-out so pulse snaps in, eases out
  if (camera.zoomPulseTime > 0) {
    camera.zoomPulseTime -= dt;
    if (camera.zoomPulseTime <= 0) {
      camera.zoom = 1.0 + breathe;
      camera.zoomPulseTime = 0;
      camera.zoomPulseAmt = 0;
    } else {
      const t = camera.zoomPulseTime / camera.zoomPulseDur;     // 1 → 0
      const ease = t * t;                                        // front-loaded decay
      camera.zoom = 1.0 + camera.zoomPulseAmt * ease + breathe;
    }
  } else {
    camera.zoom = 1.0 + breathe;
  }
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
