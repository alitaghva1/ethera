// Web-Audio synthesized SFX — no sample files needed. Each call creates
// short-lived nodes (oscillator + gain + filter) that auto-disconnect on
// stop. Respects the sfx volume setting via the settings module.

import { settings } from './settings';

let audioCtx = null;

function getCtx() {
  if (audioCtx) return audioCtx;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  } catch (e) { return null; }
  return audioCtx;
}

// Unlock Web Audio on first user gesture (browsers require it).
// Release-prep pass: properly await resume() and don't flip `unlocked=true`
// until the context actually resumed — iOS Safari is stricter about this
// than Chromium and can leave ctx.state === 'suspended' if we race ahead.
let unlocked = false;
function unlockOnGesture() {
  if (unlocked) return;
  const ctx = getCtx();
  if (!ctx) return;
  try {
    if (ctx.state === 'running') {
      unlocked = true;
      return;
    }
    const p = ctx.resume();
    Promise.resolve(p).then(() => {
      if (ctx.state === 'running') unlocked = true;
    }).catch(() => {
      // Next gesture will re-attempt — unlocked stays false.
    });
  } catch (_) {
    // Some browsers throw synchronously; next gesture retries.
  }
}
// Use pointerdown (unified with touch) in addition to click.
window.addEventListener('pointerdown', unlockOnGesture, { once: false });
window.addEventListener('click', unlockOnGesture, { once: false });
window.addEventListener('keydown', unlockOnGesture, { once: false });

function masterVol() { return (settings?.sfxVolume ?? 0.45); }

// ---- Synth primitives ----

// Quick decay envelope on a gain node
function envelope(gain, ctx, attack, decay, peak) {
  const t = ctx.currentTime;
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(peak, t + attack);
  gain.gain.exponentialRampToValueAtTime(0.001, t + attack + decay);
}

// Swoosh — filtered noise burst for weapon swings + whooshy UI moments
export function synthSwoosh(pitch = 1.0, volume = 1.0, duration = 0.12) {
  const ctx = getCtx();
  if (!ctx) return;
  // Create noise buffer
  const bufferSize = Math.floor(ctx.sampleRate * duration);
  const buf = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  // Bandpass filter sweeps down from 3kHz → 800Hz for a whoosh effect
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = 1.2;
  const now = ctx.currentTime;
  filter.frequency.setValueAtTime(3200 * pitch, now);
  filter.frequency.exponentialRampToValueAtTime(700 * pitch, now + duration);
  // Gain envelope
  const gain = ctx.createGain();
  const peak = 0.25 * volume * masterVol();
  envelope(gain, ctx, 0.005, duration - 0.005, peak);
  src.connect(filter).connect(gain).connect(ctx.destination);
  src.start(now);
  src.stop(now + duration + 0.02);
}

// Pickup ping — bright ascending sine chirp (gold, heal, relic acquisition)
export function synthPing(freq = 900, volume = 1.0, duration = 0.25) {
  const ctx = getCtx();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  const now = ctx.currentTime;
  osc.frequency.setValueAtTime(freq, now);
  osc.frequency.exponentialRampToValueAtTime(freq * 2, now + duration * 0.5);
  osc.frequency.exponentialRampToValueAtTime(freq * 1.6, now + duration);
  const gain = ctx.createGain();
  const peak = 0.15 * volume * masterVol();
  envelope(gain, ctx, 0.01, duration - 0.01, peak);
  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + duration + 0.02);
}

// Deep thud — low-frequency sine punch (charged strike, boss stomp)
export function synthThud(freq = 80, volume = 1.0, duration = 0.2) {
  const ctx = getCtx();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  const now = ctx.currentTime;
  osc.frequency.setValueAtTime(freq * 2, now);
  osc.frequency.exponentialRampToValueAtTime(freq * 0.5, now + duration);
  const gain = ctx.createGain();
  const peak = 0.45 * volume * masterVol();
  envelope(gain, ctx, 0.002, duration - 0.002, peak);
  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + duration + 0.02);
}

// UI click — crisp square pop for menu interactions
export function synthClick(pitch = 1.0, volume = 1.0) {
  const ctx = getCtx();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  osc.type = 'square';
  const now = ctx.currentTime;
  osc.frequency.setValueAtTime(1400 * pitch, now);
  osc.frequency.exponentialRampToValueAtTime(900 * pitch, now + 0.04);
  const gain = ctx.createGain();
  const peak = 0.08 * volume * masterVol();
  envelope(gain, ctx, 0.001, 0.05, peak);
  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.08);
}

// Chord sting — 3-note stacked sine (achievement, victory, relic pickup)
export function synthChord(rootFreq = 440, volume = 1.0, duration = 0.6) {
  const ctx = getCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  // Major chord (root, major third, perfect fifth)
  const ratios = [1, 1.259, 1.498, 2.0];
  for (let i = 0; i < ratios.length; i++) {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(rootFreq * ratios[i], now + i * 0.02);
    const gain = ctx.createGain();
    const peak = (0.10 / (i + 1)) * volume * masterVol();
    envelope(gain, ctx, 0.015 + i * 0.02, duration - 0.015, peak);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now + i * 0.02);
    osc.stop(now + duration + 0.05);
  }
}

// Descending gloom — heavy failure note (death, trap trigger)
export function synthGloom(freq = 220, volume = 1.0, duration = 0.9) {
  const ctx = getCtx();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  const now = ctx.currentTime;
  osc.frequency.setValueAtTime(freq, now);
  osc.frequency.exponentialRampToValueAtTime(freq * 0.35, now + duration);
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(600, now);
  filter.frequency.exponentialRampToValueAtTime(180, now + duration);
  const gain = ctx.createGain();
  const peak = 0.22 * volume * masterVol();
  envelope(gain, ctx, 0.02, duration - 0.02, peak);
  osc.connect(filter).connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + duration + 0.05);
}

// ============================================================================
// AMBIENT PAD — procedural background drone for menu + hamlet.
// Three sine oscillators tuned to a low minor chord, a lowpass-filtered
// noise layer for "wind," and (hamlet variant) occasional soft crackle
// pops evoking a distant fire. Fades in/out gracefully. Reads the music
// volume setting so the user can silence it from settings.
// ============================================================================
let _ambientNodes = null;     // { oscillators, gains, noise, filter, fade, crackleTimer }
let _ambientVariant = null;

function _stopAmbientNodes(fadeSec = 1.0) {
  if (!_ambientNodes) return;
  const ctx = getCtx();
  if (!ctx) { _ambientNodes = null; return; }
  const now = ctx.currentTime;
  const { oscillators, fade } = _ambientNodes;
  // Ramp master down, then stop oscillators shortly after.
  if (fade) fade.gain.cancelScheduledValues(now);
  if (fade) fade.gain.setValueAtTime(fade.gain.value, now);
  if (fade) fade.gain.linearRampToValueAtTime(0.0001, now + fadeSec);
  setTimeout(() => {
    try {
      for (const o of oscillators) { try { o.stop(); } catch(e) {} }
    } catch (e) {}
  }, (fadeSec * 1000) + 50);
  if (_ambientNodes.crackleTimer) clearInterval(_ambientNodes.crackleTimer);
  _ambientNodes = null;
  _ambientVariant = null;
}

/**
 * Start (or switch to) the ambient pad. Variants:
 *   'menu'    — sparse, windier, slightly darker
 *   'hamlet'  — warmer drone, occasional soft fire crackles
 *   'cleared' — Round-7 polish: brief D-minor warmth filling the
 *               post-combat silence in cleared dungeon rooms.
 *               Tighter fade-in + lower volume than menu/hamlet so
 *               it lands quickly even if the player rushes the door.
 * Calling with the same variant is a no-op; calling with a different
 * variant crossfades to the new one.
 */
export function startAmbientPad(variant = 'menu') {
  if (_ambientVariant === variant && _ambientNodes) return;
  const ctx = getCtx();
  if (!ctx) return;
  // Transition: stop the old with a quick fade, then start the new.
  _stopAmbientNodes(0.6);
  // Small delay so the old fade completes before new starts; start now is fine too
  const now = ctx.currentTime;

  // Master fade gain — pad crossfades in. 'cleared' uses a tighter
  // 0.9s fade so it actually registers in the brief window between
  // combat ending and the player walking through the next door.
  const fadeIn = variant === 'cleared' ? 0.9 : 2.5;
  const fade = ctx.createGain();
  fade.gain.setValueAtTime(0, now);
  fade.gain.linearRampToValueAtTime(1, now + fadeIn);

  // Volume per variant (multiplied by settings.musicVolume at final
  // stage). 'cleared' is intentionally barely-there atmosphere; the
  // room just ended in combat, the pad shouldn't compete with the
  // relic-pickup banner or kill-streak HUD that's still resolving.
  const padVol = variant === 'hamlet' ? 0.11 : variant === 'cleared' ? 0.07 : 0.09;
  const noiseVol = variant === 'hamlet' ? 0.04 : variant === 'cleared' ? 0.025 : 0.05;

  // Root note (Hz) — hamlet uses A minor (110Hz, warm), menu uses
  // G minor (98Hz, slightly colder), cleared uses D minor (146.83Hz,
  // brighter mid-register) so the three variants are tonally distinct:
  // the player's ear distinguishes "between runs" from "between
  // rooms" from "menu" without conscious attention.
  const root = variant === 'hamlet' ? 110 : variant === 'cleared' ? 146.83 : 98;
  // Chord: root, minor third (6/5), perfect fifth (3/2), octave — slightly
  // detuned copies for a thicker shimmering pad.
  const ratios = [1, 1.2, 1.5, 2.0];
  const oscillators = [];
  const gains = [];
  for (let i = 0; i < ratios.length; i++) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(root * ratios[i] * (1 + (i * 0.0011)), now);  // slight detune per voice
    const g = ctx.createGain();
    const peak = padVol * (1 / (i + 1)) * (settings?.musicVolume ?? 0.35);
    g.gain.setValueAtTime(peak, now);
    // Slow LFO on gain (breath) — different rate per voice so they beat
    const lfoRate = 0.11 + i * 0.017;
    // Start/stop oscillator + lfo
    osc.connect(g).connect(fade);
    osc.start(now);
    oscillators.push(osc);
    gains.push(g);
    // LFO — a separate oscillator modulating the gain node
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = lfoRate;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = peak * 0.35;
    lfo.connect(lfoGain).connect(g.gain);
    lfo.start(now);
    oscillators.push(lfo);
  }

  // Wind — lowpass-filtered brown-ish noise with a slow LFO on filter freq
  const bufSize = ctx.sampleRate * 2;
  const noiseBuf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  let lastSample = 0;
  for (let i = 0; i < bufSize; i++) {
    // Brown noise: integrate white noise
    const white = Math.random() * 2 - 1;
    lastSample = (lastSample + 0.02 * white) * 0.996;
    d[i] = lastSample * 5;
  }
  const noiseSrc = ctx.createBufferSource();
  noiseSrc.buffer = noiseBuf;
  noiseSrc.loop = true;
  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = 'lowpass';
  // Filter cutoff per variant — hamlet warmest, cleared mid-warm,
  // menu brightest. Cleared uses 320 Hz so the wind reads less
  // distant than hamlet's hearth but still warmer than the menu.
  noiseFilter.frequency.value = variant === 'hamlet' ? 280
                              : variant === 'cleared' ? 320
                              : 360;
  noiseFilter.Q.value = 0.7;
  const noiseGain = ctx.createGain();
  noiseGain.gain.value = noiseVol * (settings?.musicVolume ?? 0.35);
  // LFO on filter freq for gentle whoosh
  const nlfo = ctx.createOscillator();
  nlfo.type = 'sine';
  nlfo.frequency.value = 0.08;
  const nlfoGain = ctx.createGain();
  nlfoGain.gain.value = 120;
  nlfo.connect(nlfoGain).connect(noiseFilter.frequency);
  nlfo.start(now);
  noiseSrc.connect(noiseFilter).connect(noiseGain).connect(fade);
  noiseSrc.start(now);
  oscillators.push(noiseSrc);
  oscillators.push(nlfo);

  fade.connect(ctx.destination);

  // Hamlet variant: schedule occasional soft fire crackles — short filtered
  // noise pops at random intervals, low volume. Evokes a far-away hearth
  // without being distracting.
  let crackleTimer = null;
  if (variant === 'hamlet') {
    const scheduleCrackle = () => {
      const c = getCtx();
      if (!c) return;
      const n = c.currentTime;
      const dur = 0.05 + Math.random() * 0.08;
      const sz = Math.floor(c.sampleRate * dur);
      const b = c.createBuffer(1, sz, c.sampleRate);
      const dd = b.getChannelData(0);
      for (let i = 0; i < sz; i++) dd[i] = (Math.random() * 2 - 1) * (1 - i / sz);
      const src = c.createBufferSource();
      src.buffer = b;
      const f = c.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 1200 + Math.random() * 800;
      f.Q.value = 2.5;
      const g = c.createGain();
      g.gain.setValueAtTime(0.05 * (settings?.musicVolume ?? 0.35), n);
      g.gain.exponentialRampToValueAtTime(0.001, n + dur);
      src.connect(f).connect(g).connect(c.destination);
      src.start(n);
      src.stop(n + dur + 0.02);
    };
    crackleTimer = setInterval(() => {
      // 60% chance per tick — uneven rhythm
      if (Math.random() < 0.6) scheduleCrackle();
    }, 900 + Math.random() * 800);
  }

  _ambientNodes = { oscillators, gains, noiseGain, fade, crackleTimer };
  _ambientVariant = variant;
}

export function stopAmbientPad() {
  _stopAmbientNodes(1.2);
}

// Rising fanfare — 4-note ascending triangle sweep (room cleared, achievement)
export function synthFanfare(volume = 1.0) {
  const ctx = getCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  const notes = [523, 659, 784, 1046]; // C, E, G, C' — C major triad resolve
  for (let i = 0; i < notes.length; i++) {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(notes[i], now + i * 0.08);
    const gain = ctx.createGain();
    const peak = 0.15 * volume * masterVol();
    envelope(gain, ctx, 0.01, 0.18, peak);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now + i * 0.08);
    osc.stop(now + i * 0.08 + 0.22);
  }
}

// Cinematic heartbeat — deep chest thump used by the first-run intro
// (intro.js). Composed of a primary LUB beat (sine 70Hz body + triangle
// 110Hz/200Hz mid-knock + sub 40Hz rumble for headphones) plus a softer
// DUB beat 320ms later. Ported from ethera/src/sfx.js — the LUB-DUB
// harmonic stack was tuned by ear in the original game and feels
// substantially more cardiac than a single thud.
export function synthHeartbeat(volume = 0.5) {
  const ctx = getCtx();
  if (!ctx) return;
  const v = volume;
  const playOne = (type, freqStart, freqEnd, dur, vol, attack, decay) => {
    const osc = ctx.createOscillator();
    osc.type = type;
    const now = ctx.currentTime;
    osc.frequency.setValueAtTime(freqStart, now);
    osc.frequency.exponentialRampToValueAtTime(freqEnd, now + dur);
    const gain = ctx.createGain();
    const peak = vol * masterVol();
    envelope(gain, ctx, attack, decay, peak);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  };
  // LUB — primary beat (heard at the moment the heartbeat fires)
  playOne('sine',     70,  35,  0.45, v * 1.0,  0.01,  0.4);   // deep bass body
  playOne('triangle', 110, 55,  0.20, v * 0.45, 0.01,  0.15);  // low-mid knock
  playOne('triangle', 200, 120, 0.12, v * 0.35, 0.005, 0.08);  // mid thump (laptop speakers)
  playOne('sine',     40,  25,  0.50, v * 0.25, 0.01,  0.45);  // sub rumble (headphones)
  // DUB — secondary beat 320ms later, softer (the natural "ka" after "tha")
  setTimeout(() => {
    if (!getCtx()) return;
    playOne('sine',     75,  40,  0.35, v * 0.7,  0.005, 0.3);
    playOne('triangle', 115, 60,  0.15, v * 0.35, 0.005, 0.12);
    playOne('triangle', 190, 110, 0.10, v * 0.25, 0.005, 0.06);
  }, 320);
}
