// Music system — crossfading looped tracks.
// Browsers block autoplay until user gesture; we start after the first click/key.
const tracks = {};
let current = null;
let target = null;
let started = false;
let masterVol = 0.35;

function mk(name, src) {
  const a = new Audio(src);
  a.loop = true;
  a.volume = 0;
  a.preload = 'auto';
  tracks[name] = a;
}

export function initMusic() {
  mk('ambient', 'assets/music/ambient.ogg');
  mk('boss',    'assets/music/boss.ogg');
  mk('crypt',   'assets/music/crypt.ogg');
  mk('vault',   'assets/music/vault.ogg');
  mk('abyss',   'assets/music/abyss.ogg');
  mk('inferno', 'assets/music/inferno.ogg');

  // Resume / start on first user gesture
  const kick = () => {
    if (started) return;
    started = true;
    playTrack(target || 'ambient');
    window.removeEventListener('pointerdown', kick);
    window.removeEventListener('keydown', kick);
  };
  window.addEventListener('pointerdown', kick);
  window.addEventListener('keydown', kick);
}

export function setMusicVolume(v) {
  masterVol = Math.max(0, Math.min(1, v));
}

export function playTrack(name) {
  target = name;
  if (!started) return;                 // will start on first gesture
  if (current === name) return;
  // Stop the currently-playing other track immediately (cheap crossfade-out)
  for (const n in tracks) {
    if (n !== name) { tracks[n].volume = 0; tracks[n].pause(); }
  }
  const t = tracks[name];
  if (!t) return;
  t.volume = 0;
  t.currentTime = 0;
  t.play().catch(() => {/* may fail pre-gesture; retried on next kick */});
  current = name;
}

// Combat intensity — caller sets 0..1 via setIntensity() based on enemy presence.
// Gets smoothed and multiplied into a +30% volume swell during combat.
let _intensity = 0;        // current target
let _intensitySmoothed = 0;
export function setIntensity(v) { _intensity = Math.max(0, Math.min(1, v)); }

export function updateMusic(dt) {
  if (!started || !current) return;
  const t = tracks[current];
  if (!t) return;
  // Smooth intensity toward target
  const ease = 1 - Math.exp(-dt * 1.4);
  _intensitySmoothed += (_intensity - _intensitySmoothed) * ease;
  const swell = 1 + _intensitySmoothed * 0.35;
  const target = Math.min(1, masterVol * swell);
  // Fade toward target volume
  if (t.volume < target) {
    t.volume = Math.min(target, t.volume + dt * 0.8);
  } else if (t.volume > target) {
    t.volume = Math.max(target, t.volume - dt * 0.8);
  }
}
