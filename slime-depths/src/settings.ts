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
  // Accessibility toggles — added in the a11y review pass. Each one
  // overrides or supplements the OS-level prefers-reduced-motion path
  // for players whose OS pref isn't set or who want finer control.
  reduceMotion: boolean;       // mirrors prefers-reduced-motion when true
  reduceFlashes: boolean;      // caps screen-flash + mythic vignette + intro strobe
  colorBlindMode: boolean;     // adds shape glyphs to tier-coded UI
  // Charge mode — 'hold' is default (sustained LMB ≥0.35s releases the
  // charge). 'short' lowers the threshold to 0.15s so players with
  // limited grip strength can still trigger charged attacks.
  chargeMode: 'hold' | 'short';
  // Mobile control overlay — 'auto' (default) detects via matchMedia
  // pointer:coarse + hover:none; 'on' forces virtual controls (touchscreen
  // laptop owners who want them); 'off' forces WASD/mouse (tablet users
  // with a keyboard who don't want the overlay).
  mobileControls: 'auto' | 'on' | 'off';
}

const KEY = 'ethera:settings:v1';

export const settings: Settings = {
  sfxVolume: 0.45,
  musicVolume: 0.3,
  shakeScale: 1.0,
  reduceMotion: false,
  reduceFlashes: false,
  colorBlindMode: false,
  chargeMode: 'hold',
  mobileControls: 'auto',
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
    if (typeof parsed.reduceMotion === 'boolean') settings.reduceMotion = parsed.reduceMotion;
    if (typeof parsed.reduceFlashes === 'boolean') settings.reduceFlashes = parsed.reduceFlashes;
    if (typeof parsed.colorBlindMode === 'boolean') settings.colorBlindMode = parsed.colorBlindMode;
    if (parsed.chargeMode === 'short') settings.chargeMode = 'short';
    if (parsed.mobileControls === 'on' || parsed.mobileControls === 'off') {
      settings.mobileControls = parsed.mobileControls;
    }
  }
  applySettings();
}

// Setters for the new a11y toggles. Each saves on change so the
// player's preference persists across reloads.
export function setReduceMotion(v: boolean): void {
  settings.reduceMotion = !!v;
  saveSettings();
}
export function setReduceFlashes(v: boolean): void {
  settings.reduceFlashes = !!v;
  saveSettings();
}
export function setColorBlindMode(v: boolean): void {
  settings.colorBlindMode = !!v;
  saveSettings();
}
export function setChargeMode(v: 'hold' | 'short'): void {
  settings.chargeMode = v === 'short' ? 'short' : 'hold';
  saveSettings();
}

export function setMobileControls(v: 'auto' | 'on' | 'off'): void {
  settings.mobileControls = v === 'on' ? 'on' : v === 'off' ? 'off' : 'auto';
  saveSettings();
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
