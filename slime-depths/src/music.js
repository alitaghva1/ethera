// Music system — crossfading looped tracks.
// Browsers block autoplay until user gesture; we start after the first click/key.
const tracks = {};
let current = null;
let target = null;
let started = false;
let masterVol = 0.35;

function mk(name, src) {
  try {
    const a = new Audio(src);
    a.loop = true;
    a.volume = 0;
    a.preload = 'auto';
    tracks[name] = a;
  } catch (e) {
    // HTMLAudio construction can throw in restricted contexts (private mode,
    // blocked by CSP). Game plays silently; tracks[name] stays undefined and
    // playTrack() early-returns safely.
    console.warn('music: could not create track', name, e);
  }
}

export function initMusic() {
  mk('ambient', 'assets/music/ambient.ogg');
  mk('boss',    'assets/music/boss.ogg');
  mk('crypt',   'assets/music/crypt.ogg');
  mk('vault',   'assets/music/vault.ogg');
  mk('abyss',   'assets/music/abyss.ogg');
  mk('inferno', 'assets/music/inferno.ogg');

  // Release-prep pass: the kick used to flip `started = true` unconditionally,
  // so if the very first play() was denied (Safari strict autoplay) the
  // flag would stay stuck true and nothing would retry. Now we only flip
  // the flag on successful play, and keep the listeners around until it
  // actually plays.
  const kick = () => {
    if (started) return;
    const name = target || 'ambient';
    const t = tracks[name];
    if (!t) return;
    t.currentTime = 0;
    t.volume = 0;
    const p = t.play();
    Promise.resolve(p).then(() => {
      started = true;
      current = name;
      window.removeEventListener('pointerdown', kick);
      window.removeEventListener('keydown', kick);
    }).catch(() => {
      // Play was denied — leave `started=false` so the next user gesture
      // retries. No user-visible error; game just stays silent for now.
    });
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
