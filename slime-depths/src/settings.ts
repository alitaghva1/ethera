// Settings — user-configurable values persisted in localStorage.
// Loaded on boot and applied to sfx/music/camera modules.
//
// FIRST TYPESCRIPT MIGRATION — picked as the pilot because it's small
// (~60 lines), pure data + setters, no rendering or frame-loop coupling.
// Callers across the codebase still write `import { ... } from './settings.js'`
// — Vite's resolver (and tsconfig's moduleResolution: "bundler") maps
// that to the .ts file automatically, so no downstream changes needed.
//
// This file runs under tsconfig's `strict: true`. JS files in the tree
// continue to compile without type-checking via `allowJs + checkJs: false`.

import { setMasterVolume } from './sfx.js';
import { setMusicVolume } from './music.js';
import { setShakeScale } from './camera.js';
import { safeLoadJSON, safeSaveJSON } from './storage.js';

export interface Settings {
  sfxVolume: number; // 0..1
  musicVolume: number; // 0..1
  shakeScale: number; // 0..1.5 (multiplier applied to shakeCamera amplitude)
}

const KEY = 'ethera:settings:v1';

export const settings: Settings = {
  sfxVolume: 0.45,
  musicVolume: 0.3,
  shakeScale: 1.0,
};

function _isSettingsShape(v: unknown): boolean {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

export function loadSettings(): void {
  const parsed = safeLoadJSON(KEY, null, _isSettingsShape);
  if (parsed) {
    if (typeof parsed.sfxVolume === 'number') settings.sfxVolume = parsed.sfxVolume;
    if (typeof parsed.musicVolume === 'number') settings.musicVolume = parsed.musicVolume;
    if (typeof parsed.shakeScale === 'number') settings.shakeScale = parsed.shakeScale;
  }
  applySettings();
}

export function saveSettings(): void {
  safeSaveJSON(KEY, settings);
}

export function applySettings(): void {
  setMasterVolume(settings.sfxVolume);
  setMusicVolume(settings.musicVolume);
  setShakeScale(settings.shakeScale);
}

export function setSfxVolume(v: number): void {
  settings.sfxVolume = Math.max(0, Math.min(1, v));
  setMasterVolume(settings.sfxVolume);
  saveSettings();
}

export function setMusicVolumeSetting(v: number): void {
  settings.musicVolume = Math.max(0, Math.min(1, v));
  setMusicVolume(settings.musicVolume);
  saveSettings();
}

export function setShakeScaleSetting(v: number): void {
  settings.shakeScale = Math.max(0, Math.min(1.5, v));
  setShakeScale(settings.shakeScale);
  saveSettings();
}
