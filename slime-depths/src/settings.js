// Settings — user-configurable values persisted in localStorage.
// Loaded on boot and applied to sfx/music/camera modules.

import { setMasterVolume } from './sfx.js';
import { setMusicVolume } from './music.js';
import { setShakeScale } from './camera.js?v=2';

const KEY = 'ethera:settings:v1';

export const settings = {
  sfxVolume: 0.45,          // 0-1
  musicVolume: 0.3,         // 0-1
  shakeScale: 1.0,          // 0-1.5 (multiplier applied to shakeCamera amplitude)
};

import { safeLoadJSON, safeSaveJSON } from './storage.js?v=save1';

function _isSettingsShape(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

export function loadSettings() {
  const parsed = safeLoadJSON(KEY, null, _isSettingsShape);
  if (parsed) {
    if (typeof parsed.sfxVolume === 'number') settings.sfxVolume = parsed.sfxVolume;
    if (typeof parsed.musicVolume === 'number') settings.musicVolume = parsed.musicVolume;
    if (typeof parsed.shakeScale === 'number') settings.shakeScale = parsed.shakeScale;
  }
  applySettings();
}

export function saveSettings() {
  safeSaveJSON(KEY, settings);
}

export function applySettings() {
  setMasterVolume(settings.sfxVolume);
  setMusicVolume(settings.musicVolume);
  setShakeScale(settings.shakeScale);
}

export function setSfxVolume(v) {
  settings.sfxVolume = Math.max(0, Math.min(1, v));
  setMasterVolume(settings.sfxVolume);
  saveSettings();
}

export function setMusicVolumeSetting(v) {
  settings.musicVolume = Math.max(0, Math.min(1, v));
  setMusicVolume(settings.musicVolume);
  saveSettings();
}

export function setShakeScaleSetting(v) {
  settings.shakeScale = Math.max(0, Math.min(1.5, v));
  setShakeScale(settings.shakeScale);
  saveSettings();
}
