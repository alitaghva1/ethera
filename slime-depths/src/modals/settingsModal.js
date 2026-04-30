// ============================================================================
// SETTINGS MODAL — main-menu access to SFX / Music / Screen-shake sliders.
// Same three sliders also live in the pause overlay; both write through
// the same setSfxVolume / setMusicVolumeSetting / setShakeScaleSetting
// setters in settings.ts, so values stay in sync regardless of which
// surface the player tweaked them on.
//
// Round-7 Sprint B refactor — seventh modal extraction. Single seam:
// Settings is reachable ONLY from the main menu (no NPC route, no
// in-run path), so onClose just restores the menu. settingsModal owns
// all three slider inputs + the back button + the show() sync logic.
// ============================================================================
import { synthClick } from '../synth.js';
import { settings, setSfxVolume, setMusicVolumeSetting, setShakeScaleSetting } from '../settings';

export const settingsEl = document.createElement('div');
settingsEl.style.cssText = 'position:absolute;inset:0;display:none;align-items:center;justify-content:safe center;flex-direction:column;background:radial-gradient(ellipse at center,#140a18 0%,#0a0610 65%,#050308 100%);color:#ddd;pointer-events:auto;font-family:Georgia,"Cormorant Garamond",serif;padding:24px;box-sizing:border-box;overflow-y:auto;';
settingsEl.innerHTML = `
  <!-- Page frame + vignette -->
  <div style="position:absolute;inset:0;background:radial-gradient(ellipse at center, transparent 28%, rgba(4,2,6,0.55) 78%, rgba(0,0,0,0.85) 100%);pointer-events:none;"></div>
  <div style="position:absolute;top:22px;left:22px;width:48px;height:48px;pointer-events:none;">
    <div style="position:absolute;top:0;left:0;width:48px;height:1px;background:linear-gradient(90deg,#c9a86a,transparent);"></div>
    <div style="position:absolute;top:0;left:0;width:1px;height:48px;background:linear-gradient(180deg,#c9a86a,transparent);"></div>
    <div style="position:absolute;top:-2px;left:-2px;width:4px;height:4px;background:#c9a86a;transform:rotate(45deg);"></div>
  </div>
  <div style="position:absolute;top:22px;right:22px;width:48px;height:48px;pointer-events:none;">
    <div style="position:absolute;top:0;right:0;width:48px;height:1px;background:linear-gradient(270deg,#c9a86a,transparent);"></div>
    <div style="position:absolute;top:0;right:0;width:1px;height:48px;background:linear-gradient(180deg,#c9a86a,transparent);"></div>
    <div style="position:absolute;top:-2px;right:-2px;width:4px;height:4px;background:#c9a86a;transform:rotate(45deg);"></div>
  </div>
  <div style="position:absolute;bottom:22px;left:22px;width:48px;height:48px;pointer-events:none;">
    <div style="position:absolute;bottom:0;left:0;width:48px;height:1px;background:linear-gradient(90deg,#c9a86a,transparent);"></div>
    <div style="position:absolute;bottom:0;left:0;width:1px;height:48px;background:linear-gradient(0deg,#c9a86a,transparent);"></div>
    <div style="position:absolute;bottom:-2px;left:-2px;width:4px;height:4px;background:#c9a86a;transform:rotate(45deg);"></div>
  </div>
  <div style="position:absolute;bottom:22px;right:22px;width:48px;height:48px;pointer-events:none;">
    <div style="position:absolute;bottom:0;right:0;width:48px;height:1px;background:linear-gradient(270deg,#c9a86a,transparent);"></div>
    <div style="position:absolute;bottom:0;right:0;width:1px;height:48px;background:linear-gradient(0deg,#c9a86a,transparent);"></div>
    <div style="position:absolute;bottom:-2px;right:-2px;width:4px;height:4px;background:#c9a86a;transform:rotate(45deg);"></div>
  </div>

  <div class="menuContent" style="position:relative;display:flex;flex-direction:column;align-items:center;z-index:1;">
    <div style="display:flex;align-items:center;gap:22px;margin-bottom:10px;opacity:0.75;">
      <div style="width:100px;height:1px;background:linear-gradient(90deg,transparent,#c9a86a,transparent);"></div>
      <div style="color:#c9a86a;font-size:11px;letter-spacing:6px;font-style:italic;">tune the descent</div>
      <div style="width:100px;height:1px;background:linear-gradient(90deg,transparent,#c9a86a,transparent);"></div>
    </div>
    <h1 style="font-size:44px;margin:0;letter-spacing:10px;color:#f4d9a0;text-shadow:0 0 14px rgba(244,217,160,0.4);font-weight:400;line-height:1;">SETTINGS</h1>
    <div style="display:flex;align-items:center;gap:12px;margin:10px 0 32px;opacity:0.6;">
      <span style="width:3px;height:3px;background:#c9a86a;transform:rotate(45deg);"></span>
      <p style="margin:0;letter-spacing:5px;font-size:11px;font-style:italic;color:#d8cfae;">adjust to taste</p>
      <span style="width:3px;height:3px;background:#c9a86a;transform:rotate(45deg);"></span>
    </div>
    <div style="display:grid;grid-template-columns:auto 220px auto;gap:16px 20px;background:linear-gradient(180deg,rgba(30,22,16,0.85),rgba(14,10,8,0.9));box-shadow:inset 0 0 0 1px rgba(201,168,106,0.28), inset 0 0 14px rgba(0,0,0,0.5);padding:22px 30px;font-size:13px;color:#d8cfae;align-items:center;font-family:Georgia,serif;">
      <div style="opacity:0.7;letter-spacing:2px;">SFX Volume</div><input id="menuSetSfx" type="range" min="0" max="100" step="1" style="accent-color:#c9a86a;" /><div id="menuSetSfxVal" style="opacity:0.6;font-size:11px;width:36px;text-align:right;color:#c9a86a;"></div>
      <div style="opacity:0.7;letter-spacing:2px;">Music Volume</div><input id="menuSetMusic" type="range" min="0" max="100" step="1" style="accent-color:#c9a86a;" /><div id="menuSetMusicVal" style="opacity:0.6;font-size:11px;width:36px;text-align:right;color:#c9a86a;"></div>
      <div style="opacity:0.7;letter-spacing:2px;">Screen Shake</div><input id="menuSetShake" type="range" min="0" max="150" step="1" style="accent-color:#c9a86a;" /><div id="menuSetShakeVal" style="opacity:0.6;font-size:11px;width:36px;text-align:right;color:#c9a86a;"></div>
    </div>
    <div style="font-size:10px;opacity:0.5;margin-top:18px;max-width:440px;text-align:center;font-style:italic;letter-spacing:2px;line-height:1.5;color:#c9a86a;">shake also scales the camera zoom-pulse · set to 0 to disable all screen motion</div>
    <button id="menuSettingsBackBtn" style="background:transparent;color:#8a4848;border:0;padding:8px 20px;font-size:11px;cursor:pointer;letter-spacing:5px;margin-top:32px;font-family:Georgia,serif;font-style:italic;font-weight:bold;transition:all 0.22s ease;opacity:0.75;">← BACK</button>
  </div>
`;
document.getElementById('hud').appendChild(settingsEl);

// onClose injected by main.js — restores the main menu (settings is a
// menu-only modal, no NPC entry to dual-route).
let _onClose = null;
export function setSettingsOnClose(fn) { _onClose = fn; }

document.getElementById('menuSettingsBackBtn').addEventListener('click', () => {
  try { synthClick(0.9, 0.25); } catch (_e) {}
  settingsEl.style.display = 'none';
  if (_onClose) _onClose();
});

// Wire sliders to the same settings system as pause menu
document.getElementById('menuSetSfx').addEventListener('input', (e) => {
  setSfxVolume(parseInt(e.target.value, 10) / 100);
  document.getElementById('menuSetSfxVal').textContent = e.target.value + '%';
});
document.getElementById('menuSetMusic').addEventListener('input', (e) => {
  setMusicVolumeSetting(parseInt(e.target.value, 10) / 100);
  document.getElementById('menuSetMusicVal').textContent = e.target.value + '%';
});
document.getElementById('menuSetShake').addEventListener('input', (e) => {
  setShakeScaleSetting(parseInt(e.target.value, 10) / 100);
  document.getElementById('menuSetShakeVal').textContent = e.target.value + '%';
});

export function showSettingsModal() {
  // Caller (main.js wrapper) is responsible for hideAllOverlays before
  // this fires; the modal itself just shows + syncs slider positions.
  settingsEl.style.display = 'flex';
  document.getElementById('menuSetSfx').value = Math.round(settings.sfxVolume * 100);
  document.getElementById('menuSetMusic').value = Math.round(settings.musicVolume * 100);
  document.getElementById('menuSetShake').value = Math.round(settings.shakeScale * 100);
  document.getElementById('menuSetSfxVal').textContent = Math.round(settings.sfxVolume * 100) + '%';
  document.getElementById('menuSetMusicVal').textContent = Math.round(settings.musicVolume * 100) + '%';
  document.getElementById('menuSetShakeVal').textContent = Math.round(settings.shakeScale * 100) + '%';
}
