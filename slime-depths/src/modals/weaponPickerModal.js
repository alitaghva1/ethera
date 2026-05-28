// ============================================================================
// WEAPON PICKER — second screen between main menu and run start. Player
// chooses one of the unlocked weapons (sword always available; mace/dagger/
// spear/etc. unlock through meta progression). Cards animate in with a
// stagger and play a paired ping+chord sting on pick.
//
// Round-7 Sprint B refactor — eighth modal extraction. Two callbacks:
// - onPick(weaponId): caller sets hero.weapon + calls startRun
// - onBack:           caller restores the main menu
//
// el is exported so main.js's hideAllOverlays + game-loop visibility
// check (which short-circuits gameplay updates while the picker is up)
// can read the element directly.
// ============================================================================
import { synthPing, synthChord } from '../synth.js';
import { WEAPONS, ALL_WEAPON_IDS, WEAPON_UNLOCKS } from '../weapons.js';
import { hasUnlock } from '../meta.js';

export const weaponPickerEl = document.createElement('div');
weaponPickerEl.style.cssText = 'position:absolute;inset:0;display:none;align-items:center;justify-content:safe center;flex-direction:column;background:radial-gradient(ellipse at center,#140a18 0%,#0a0610 65%,#050308 100%);color:#ddd;pointer-events:auto;font-family:Georgia,serif;padding:24px;box-sizing:border-box;overflow-y:auto;';
weaponPickerEl.innerHTML = `
  <!-- Deep vignette + page-frame corners (shared discipline). -->
  <div style="position:absolute;inset:0;background:radial-gradient(ellipse at center, transparent 28%, rgba(4,2,6,0.55) 78%, rgba(0,0,0,0.85) 100%);pointer-events:none;"></div>
  <div style="position:absolute;top:22px;left:22px;width:48px;height:48px;pointer-events:none;animation:winFadeIn 0.7s ease-out both;">
    <div style="position:absolute;top:0;left:0;width:48px;height:1px;background:linear-gradient(90deg,#c9a86a,transparent);"></div>
    <div style="position:absolute;top:0;left:0;width:1px;height:48px;background:linear-gradient(180deg,#c9a86a,transparent);"></div>
    <div style="position:absolute;top:-2px;left:-2px;width:4px;height:4px;background:#c9a86a;transform:rotate(45deg);"></div>
  </div>
  <div style="position:absolute;top:22px;right:22px;width:48px;height:48px;pointer-events:none;animation:winFadeIn 0.7s ease-out both;">
    <div style="position:absolute;top:0;right:0;width:48px;height:1px;background:linear-gradient(270deg,#c9a86a,transparent);"></div>
    <div style="position:absolute;top:0;right:0;width:1px;height:48px;background:linear-gradient(180deg,#c9a86a,transparent);"></div>
    <div style="position:absolute;top:-2px;right:-2px;width:4px;height:4px;background:#c9a86a;transform:rotate(45deg);"></div>
  </div>
  <div style="position:absolute;bottom:22px;left:22px;width:48px;height:48px;pointer-events:none;animation:winFadeIn 0.7s ease-out both;">
    <div style="position:absolute;bottom:0;left:0;width:48px;height:1px;background:linear-gradient(90deg,#c9a86a,transparent);"></div>
    <div style="position:absolute;bottom:0;left:0;width:1px;height:48px;background:linear-gradient(0deg,#c9a86a,transparent);"></div>
    <div style="position:absolute;bottom:-2px;left:-2px;width:4px;height:4px;background:#c9a86a;transform:rotate(45deg);"></div>
  </div>
  <div style="position:absolute;bottom:22px;right:22px;width:48px;height:48px;pointer-events:none;animation:winFadeIn 0.7s ease-out both;">
    <div style="position:absolute;bottom:0;right:0;width:48px;height:1px;background:linear-gradient(270deg,#c9a86a,transparent);"></div>
    <div style="position:absolute;bottom:0;right:0;width:1px;height:48px;background:linear-gradient(0deg,#c9a86a,transparent);"></div>
    <div style="position:absolute;bottom:-2px;right:-2px;width:4px;height:4px;background:#c9a86a;transform:rotate(45deg);"></div>
  </div>

  <div class="menuContent" style="position:relative;display:flex;flex-direction:column;align-items:center;z-index:1;">
    <div style="display:flex;align-items:center;gap:22px;margin-bottom:10px;opacity:0.75;animation:winFadeIn 0.6s ease-out;">
      <div style="width:100px;height:1px;background:linear-gradient(90deg,transparent,#c9a86a,transparent);"></div>
      <div style="color:#c9a86a;font-size:11px;letter-spacing:6px;font-style:italic;">the forge waits</div>
      <div style="width:100px;height:1px;background:linear-gradient(90deg,transparent,#c9a86a,transparent);"></div>
    </div>
    <h1 style="font-size:48px;margin:0;letter-spacing:10px;color:#f4d9a0;font-weight:400;line-height:1;text-shadow:0 0 20px rgba(244,217,160,0.5);animation:winFadeIn 0.7s ease-out 0.1s both;">CHOOSE YOUR ARMS</h1>
    <div style="display:flex;align-items:center;gap:12px;margin:10px 0 36px;opacity:0.6;animation:winFadeIn 0.6s ease-out 0.22s both;">
      <span style="width:3px;height:3px;background:#c9a86a;transform:rotate(45deg);"></span>
      <p style="margin:0;letter-spacing:5px;font-size:12px;font-style:italic;color:#d8cfae;">each shapes the descent differently</p>
      <span style="width:3px;height:3px;background:#c9a86a;transform:rotate(45deg);"></span>
    </div>
    <div id="weaponPickerRow" style="display:flex;gap:18px;"></div>
    <button id="weaponBackBtn" style="background:transparent;color:#8a4848;border:0;padding:8px 20px;font-size:11px;cursor:pointer;letter-spacing:5px;margin-top:32px;font-family:Georgia,serif;font-style:italic;font-weight:bold;transition:all 0.22s ease;opacity:0.75;animation:winFadeIn 0.55s ease-out 1.1s both;">← BACK</button>
  </div>
`;
document.getElementById('hud').appendChild(weaponPickerEl);

// onPick(weaponId): caller sets hero.weapon + invokes startRun.
// onBack:           caller restores the main menu.
let _onPick = null;
let _onBack = null;
export function setWeaponOnPick(fn) { _onPick = fn; }
export function setWeaponOnBack(fn) { _onBack = fn; }

document.getElementById('weaponBackBtn').addEventListener('click', () => {
  weaponPickerEl.style.display = 'none';
  if (_onBack) _onBack();
});

// Exported because main.js also calls it from two non-picker code paths:
// the START button's "skip the picker if only one weapon is unlocked"
// short-circuit, and the loadRoom guard that randomly grants a weapon
// when entering a non-start room with hero.weapon === null.
export function availableWeapons() {
  return ALL_WEAPON_IDS.filter(id => {
    if (id === 'sword') return true;
    const u = WEAPON_UNLOCKS[id];
    return u && hasUnlock(u.metaId);
  });
}

export function showWeaponPickerModal() {
  // Caller (main.js wrapper) is responsible for hiding the menu before
  // this fires; the modal itself just shows + renders the cards.
  weaponPickerEl.style.display = 'flex';
  const row = document.getElementById('weaponPickerRow');
  row.innerHTML = '';
  let staggerIdx = 0;
  for (const id of availableWeapons()) {
    const w = WEAPONS[id];
    const card = document.createElement('div');
    const delay = 0.35 + staggerIdx * 0.1;
    staggerIdx++;
    card.style.cssText = `
      width:220px;
      background:linear-gradient(180deg,rgba(40,28,48,0.95),rgba(18,10,22,0.95));
      border:2px solid ${w.tint};
      padding:18px;
      display:flex;flex-direction:column;align-items:center;gap:9px;
      box-shadow:0 0 20px ${w.tint}55, 0 4px 16px rgba(0,0,0,0.5), inset 0 0 14px rgba(0,0,0,0.35);
      cursor:pointer;
      font-family:Georgia,serif;
      transition:transform 0.18s ease, box-shadow 0.18s ease;
      animation:winCardSlide 0.55s ease-out ${delay}s both;
    `;
    card.addEventListener('mouseenter', () => {
      card.style.transform = 'translateY(-6px) scale(1.02)';
      card.style.boxShadow = `0 0 32px ${w.tint}, 0 4px 22px rgba(0,0,0,0.55), inset 0 0 16px rgba(0,0,0,0.3)`;
    });
    card.addEventListener('mouseleave', () => {
      card.style.transform = 'none';
      card.style.boxShadow = `0 0 20px ${w.tint}55, 0 4px 16px rgba(0,0,0,0.5), inset 0 0 14px rgba(0,0,0,0.35)`;
    });
    card.innerHTML = `
      <div style="padding:6px;background:radial-gradient(circle,${w.tint}33,transparent 70%);">
        <img src="assets/icons/${w.icon}.png" style="width:52px;height:52px;image-rendering:pixelated;filter:drop-shadow(0 0 8px ${w.tint}aa);" />
      </div>
      <div style="font-size:19px;font-weight:bold;color:${w.tint};letter-spacing:3px;text-shadow:0 0 6px ${w.tint}66;">${w.name.toUpperCase()}</div>
      ${w.flavor ? `<div style="font-size:11px;color:rgba(200,190,210,0.75);text-align:center;line-height:1.4;min-height:32px;font-style:italic;padding:0 4px;">${w.flavor}</div>` : ''}
      <div style="height:1px;width:70%;background:linear-gradient(90deg,transparent,${w.tint}aa,transparent);margin:2px 0;"></div>
      <div style="font-size:11px;color:#ccc;text-align:center;line-height:1.4;min-height:28px;">${w.desc}</div>
      <div style="height:1px;width:100%;background:linear-gradient(90deg,transparent,${w.tint}66,transparent);margin:2px 0;"></div>
      <div style="display:grid;grid-template-columns:auto auto;gap:3px 18px;font-size:11px;color:#aaa;margin-top:2px;">
        <span style="opacity:0.6;letter-spacing:1px;">DAMAGE</span><span style="text-align:right;color:${w.tint};font-weight:bold;">${w.damage}</span>
        <span style="opacity:0.6;letter-spacing:1px;">REACH</span><span style="text-align:right;color:${w.tint};font-weight:bold;">${w.reach}px</span>
        <span style="opacity:0.6;letter-spacing:1px;">ARC</span><span style="text-align:right;color:${w.tint};font-weight:bold;">${Math.round(w.arc * 180 / Math.PI)}°</span>
        <span style="opacity:0.6;letter-spacing:1px;">COOLDOWN</span><span style="text-align:right;color:${w.tint};font-weight:bold;">${w.cooldown.toFixed(2)}s</span>
      </div>
    `;
    card.addEventListener('click', () => {
      try { synthPing(520, 0.9, 0.5); synthChord(392, 0.7, 0.7); } catch (_e) {}
      if (_onPick) _onPick(id);
    });
    row.appendChild(card);
  }
}
