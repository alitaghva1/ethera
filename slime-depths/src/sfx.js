// Lightweight SFX player — HTML5 Audio with simple voice pooling
import { audio } from './loader.js?v=enemies3';

const pools = {};
const POOL_SIZE = 4;
let masterVol = 0.45;

function getVoice(key) {
  if (!audio[key]) return null;
  if (!pools[key]) {
    pools[key] = [];
    for (let i = 0; i < POOL_SIZE; i++) {
      const a = new Audio(audio[key]);
      a.preload = 'auto';
      pools[key].push(a);
    }
  }
  // Pick first ended voice, else steal oldest
  const pool = pools[key];
  for (const a of pool) {
    if (a.paused || a.ended) return a;
  }
  return pool[0];
}

export function playSfx(key, { volume = 1, rate = 1, rateJitter = 0 } = {}) {
  const a = getVoice(key);
  if (!a) return;
  a.currentTime = 0;
  a.volume = Math.max(0, Math.min(1, masterVol * volume));
  a.playbackRate = Math.max(0.25, rate + (Math.random() * 2 - 1) * rateJitter);
  a.play().catch(() => {/* autoplay block — resolves on first click */});
}

export function setMasterVolume(v) { masterVol = Math.max(0, Math.min(1, v)); }
