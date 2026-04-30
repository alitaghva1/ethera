// ============================================================================
// PAUSE MODAL — overlays the in-run game when the player presses ESC (or
// the tab loses focus and the auto-pause-on-blur guard fires). Shows the
// CONTROLS reference, current SETTINGS sliders, the live RELIC build
// (grouped by tier + active fusions on top), plus three buttons:
// RESUME, JOURNAL OF THE RUIN, END RUN.
//
// Round-7 Sprint B refactor — ninth modal extraction. Most complex of
// the sprint by a fair margin: pause has three callbacks (resume, quit,
// journal), owns its OWN settings-slider triplet (separate DOM IDs from
// the menu's settings modal so both panels can stay in DOM at once), and
// re-renders the equipped-relic strip + sliders every time it opens.
//
// What stays in main.js: the `paused` boolean and `setPaused(p)`
// function — too many game-loop branches read `paused` for moving them
// to be worth it. The wrapper calls `setPauseVisible(p)` here to keep
// DOM in sync with that flag.
// ============================================================================
import { equipped as equippedRelics, RELIC_DEFS } from '../relics.js';
import { activeFusions, discoveredCount, totalFusions } from '../fusions.js';
import { hueRotateForTint } from '../fx.js';
import { settings, setSfxVolume, setMusicVolumeSetting, setShakeScaleSetting } from '../settings';
import { SLOTS, getSlotCounts, getSlotTier, SLOT_THRESHOLDS } from '../slots.js';

export const pauseEl = document.createElement('div');
// Polish round 2 — modal fade-in via CSS keyframe (defined in
// index.html as `@keyframes modalFadeIn`). Without this, the pause
// modal snapped on with no transition; Hades / Diablo pattern is
// always a brief fade so the screen has time to read. The animation
// re-fires every time display flips from 'none' to 'flex'.
pauseEl.style.cssText = 'position:absolute;inset:0;display:none;align-items:center;justify-content:safe center;flex-direction:column;background:radial-gradient(ellipse at center,#140a18 0%,#0a0610 65%,#050308 100%);color:#ddd;pointer-events:auto;font-family:Georgia,"Cormorant Garamond",serif;padding:24px;box-sizing:border-box;overflow-y:auto;animation:modalFadeIn 0.22s ease-out;';
pauseEl.innerHTML = `
  <!-- Deep vignette frame — same discipline as main menu. -->
  <div style="position:absolute;inset:0;background:radial-gradient(ellipse at center, transparent 28%, rgba(4,2,6,0.55) 78%, rgba(0,0,0,0.85) 100%);pointer-events:none;"></div>

  <!-- Page-frame corner flourishes (4 L-shapes) — mark this as a page. -->
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

  <!-- Content column, z above ambient. The "menuContent" class is shared
       with the main menu so the same @media (max-width) scale rules
       (0.72 / 0.52 / 0.38 at 900/600/450 breakpoints) keep the pause
       overlay readable on narrow viewports. -->
  <div class="menuContent" style="position:relative;display:flex;flex-direction:column;align-items:center;z-index:1;">
    <!-- Ornamental frame above the title — gold, not purple. -->
    <div style="display:flex;align-items:center;gap:22px;margin-bottom:10px;opacity:0.7;animation:winFadeIn 0.6s ease-out;">
      <div style="width:90px;height:1px;background:linear-gradient(90deg,transparent,#c9a86a,transparent);"></div>
      <div style="color:#c9a86a;font-size:11px;letter-spacing:6px;font-style:italic;">the descent halts</div>
      <div style="width:90px;height:1px;background:linear-gradient(90deg,transparent,#c9a86a,transparent);"></div>
    </div>
    <h1 style="font-size:56px;margin:0;letter-spacing:10px;color:#f4d9a0;text-shadow:0 0 18px rgba(244,217,160,0.45);font-weight:400;line-height:1;animation:winFadeIn 0.7s ease-out 0.1s both;">PAUSED</h1>
    <!-- Subtitle with diamond flanks — same grammar as main menu. -->
    <div style="display:flex;align-items:center;gap:12px;margin:10px 0 26px;opacity:0.55;animation:winFadeIn 0.6s ease-out 0.2s both;">
      <span style="width:3px;height:3px;background:#c9a86a;transform:rotate(45deg);"></span>
      <span style="color:#d8cfae;font-size:11px;letter-spacing:6px;font-style:italic;">press ESC to resume</span>
      <span style="width:3px;height:3px;background:#c9a86a;transform:rotate(45deg);"></span>
    </div>

    <!-- Relic strip (decor, shown during run) -->
    <div id="pauseRelics" style="display:flex;gap:8px;align-items:center;margin-bottom:20px;flex-wrap:wrap;justify-content:center;max-width:640px;animation:winFadeIn 0.6s ease-out 0.3s both;"></div>

    <!-- Two plaques: CONTROLS + SETTINGS — borderless, inset-stroke plate treatment. -->
    <div style="display:flex;gap:20px;align-items:flex-start;margin-bottom:26px;animation:winCardSlide 0.55s ease-out 0.4s both;">
      <div style="display:grid;grid-template-columns:auto auto;gap:7px 24px;background:linear-gradient(180deg,rgba(30,22,16,0.8),rgba(14,10,8,0.85));padding:16px 26px;font-size:13px;color:#d8cfae;font-family:Georgia,serif;box-shadow:inset 0 0 0 1px rgba(201,168,106,0.28), inset 0 0 14px rgba(0,0,0,0.45);">
        <div style="grid-column:1/-1;color:#c9a86a;letter-spacing:5px;font-size:9px;margin-bottom:8px;font-weight:bold;text-align:center;opacity:0.85;">◆ CONTROLS ◆</div>
        <div style="opacity:0.55;">Move</div><div>WASD</div>
        <div style="opacity:0.55;">Attack</div><div>LMB (hold: charge)</div>
        <div style="opacity:0.55;">Aim</div><div>Mouse</div>
        <div style="opacity:0.55;">Dodge</div><div>Space</div>
        <div style="opacity:0.55;">Dash Strike</div><div>Q</div>
        <div style="opacity:0.55;">Pause</div><div>Esc</div>
      </div>
      <div style="display:grid;grid-template-columns:auto 140px auto;gap:11px 14px;background:linear-gradient(180deg,rgba(30,22,16,0.8),rgba(14,10,8,0.85));padding:16px 26px;font-size:13px;color:#d8cfae;align-items:center;font-family:Georgia,serif;box-shadow:inset 0 0 0 1px rgba(201,168,106,0.28), inset 0 0 14px rgba(0,0,0,0.45);">
        <div style="grid-column:1/-1;color:#c9a86a;letter-spacing:5px;font-size:9px;margin-bottom:8px;font-weight:bold;text-align:center;opacity:0.85;">◆ SETTINGS ◆</div>
        <div style="opacity:0.65;">SFX</div><input id="setSfx" type="range" min="0" max="100" step="1" style="accent-color:#c9a86a;" /><div id="setSfxVal" style="opacity:0.55;font-size:11px;width:32px;text-align:right;"></div>
        <div style="opacity:0.65;">Music</div><input id="setMusic" type="range" min="0" max="100" step="1" style="accent-color:#c9a86a;" /><div id="setMusicVal" style="opacity:0.55;font-size:11px;width:32px;text-align:right;"></div>
        <div style="opacity:0.65;">Shake</div><input id="setShake" type="range" min="0" max="150" step="1" style="accent-color:#c9a86a;" /><div id="setShakeVal" style="opacity:0.55;font-size:11px;width:32px;text-align:right;"></div>
      </div>
    </div>

    <!-- Resume button — same gold CTA treatment as main menu's BEGIN DESCENT. -->
    <button id="pauseResumeBtn" style="background:linear-gradient(180deg,#3a2a20,#1a0f08);color:#f4d9a0;border:0;padding:14px 56px;font-size:15px;cursor:pointer;letter-spacing:6px;margin-bottom:14px;font-family:Georgia,serif;font-weight:bold;transition:all 0.22s ease;box-shadow:inset 0 0 0 1px #c9a86a, 0 0 20px rgba(201,168,106,0.22), inset 0 0 12px rgba(244,217,160,0.06);animation:winFadeIn 0.55s ease-out 0.6s both;">RESUME</button>
    <!-- Secondary text links — no boxes, just gold/crimson text. -->
    <button id="pauseJournalBtn" style="background:transparent;color:#c9a86a;border:0;padding:6px 16px;font-size:11px;cursor:pointer;letter-spacing:4px;margin-bottom:6px;font-family:Georgia,serif;font-style:italic;transition:all 0.22s ease;opacity:0.75;animation:winFadeIn 0.55s ease-out 0.7s both;">JOURNAL OF THE RUIN</button>
    <button id="pauseQuitBtn" style="background:transparent;color:#8a4848;border:0;padding:6px 16px;font-size:11px;cursor:pointer;letter-spacing:4px;font-family:Georgia,serif;font-style:italic;transition:all 0.22s ease;opacity:0.75;animation:winFadeIn 0.55s ease-out 0.8s both;">☠ END RUN</button>
  </div>
`;
document.getElementById('hud').appendChild(pauseEl);

// Three callbacks injected by main.js — the modal can't reach back into
// run state on its own.
//   onResume  — clear the `paused` flag (main.js owns it)
//   onQuit    — set hero.hp = 0 + state = 'dead' to trigger end-of-run
//   onJournal — show the journal modal (main.js does pauseEl.style.display
//               = 'none' inside the journal's own onClose chain)
let _onResume = null;
let _onQuit = null;
let _onJournal = null;
export function setPauseOnResume(fn) { _onResume = fn; }
export function setPauseOnQuit(fn) { _onQuit = fn; }
export function setPauseOnJournal(fn) { _onJournal = fn; }

document.getElementById('pauseResumeBtn').addEventListener('click', () => {
  if (_onResume) _onResume();
});
document.getElementById('pauseQuitBtn').addEventListener('click', () => {
  pauseEl.style.display = 'none';
  if (_onQuit) _onQuit();
});
document.getElementById('pauseJournalBtn').addEventListener('click', () => {
  if (_onJournal) _onJournal();
});

// Settings sliders — live-update + persist. Wired to the same setters
// as the main-menu Settings modal; values stay in sync via settings.ts.
document.getElementById('setSfx').addEventListener('input', (e) => {
  setSfxVolume(parseInt(e.target.value, 10) / 100);
  document.getElementById('setSfxVal').textContent = e.target.value + '%';
});
document.getElementById('setMusic').addEventListener('input', (e) => {
  setMusicVolumeSetting(parseInt(e.target.value, 10) / 100);
  document.getElementById('setMusicVal').textContent = e.target.value + '%';
});
document.getElementById('setShake').addEventListener('input', (e) => {
  setShakeScaleSetting(parseInt(e.target.value, 10) / 100);
  document.getElementById('setShakeVal').textContent = e.target.value + '%';
});

// setPauseVisible: the public API main.js's setPaused(p) calls. When
// true, repopulate the relic strip + sync sliders to current settings;
// when false, just hide.
export function setPauseVisible(visible) {
  pauseEl.style.display = visible ? 'flex' : 'none';
  if (visible) {
    populatePauseRelics();
    syncSettingsSliders();
  }
}

function syncSettingsSliders() {
  const sfx = document.getElementById('setSfx');
  const music = document.getElementById('setMusic');
  const shake = document.getElementById('setShake');
  if (!sfx) return;
  sfx.value = Math.round(settings.sfxVolume * 100);
  music.value = Math.round(settings.musicVolume * 100);
  shake.value = Math.round(settings.shakeScale * 100);
  document.getElementById('setSfxVal').textContent = sfx.value + '%';
  document.getElementById('setMusicVal').textContent = music.value + '%';
  document.getElementById('setShakeVal').textContent = shake.value + '%';
}

function populatePauseRelics() {
  const row = document.getElementById('pauseRelics');
  row.innerHTML = '';
  if (equippedRelics.length === 0) {
    row.innerHTML = '<div style="opacity:0.5;font-size:13px;letter-spacing:2px;padding:20px 0;">NO RELICS YET — defeat enemies and claim pedestals</div>';
    return;
  }
  // FUSIONS — shown first as standout section when any are active
  if (activeFusions.length > 0) {
    const fHeader = document.createElement('div');
    fHeader.style.cssText = 'width:100%;font-size:10px;letter-spacing:3px;color:#a0e8ff;text-align:center;margin-bottom:6px;';
    // Header reads: "⚡ ACTIVE: 2  ·  DISCOVERED: 12/30" — splits the
    // current-run active count from the cumulative codex progress so
    // both numbers are clearly separate (the prior "2/30 DISCOVERED"
    // read as "2 of 30 fusions are active", which was misleading).
    fHeader.textContent = `⚡ ACTIVE: ${activeFusions.length}  ·  DISCOVERED: ${discoveredCount()} / ${totalFusions()}`;
    row.appendChild(fHeader);
    const fGroup = document.createElement('div');
    fGroup.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;justify-content:center;width:100%;margin-bottom:14px;';
    for (const f of activeFusions) {
      const tile = document.createElement('div');
      tile.title = f.desc;
      const comps = f.components.map(id => RELIC_DEFS[id]?.name || id).join(' + ');
      tile.style.cssText = `display:flex;flex-direction:column;align-items:center;gap:4px;background:linear-gradient(180deg,rgba(20,30,40,0.9),rgba(10,14,22,0.9));border:2px solid ${f.tint};padding:8px 10px;font-size:11px;color:${f.tint};width:190px;box-shadow:0 0 10px ${f.tint}44;`;
      tile.innerHTML = `
        <div style="font-size:9px;letter-spacing:2px;opacity:0.7;">⚡ FUSION</div>
        <div style="font-weight:bold;font-size:14px;color:#fff8e8;letter-spacing:1px;text-shadow:0 0 8px ${f.tint};">${f.name}</div>
        <div style="font-size:9px;color:#a0b4c8;font-style:italic;">${comps}</div>
        <div style="font-size:10px;color:#d0d8e4;text-align:center;margin-top:2px;line-height:1.3;">${f.desc}</div>
      `;
      fGroup.appendChild(tile);
    }
    row.appendChild(fGroup);
  }
  // ── Group relics by ABILITY SLOT (wizard-kit Sprint 3D) ────────
  // Was grouped by tier (Legendary / Rare / Common) which read as
  // "rarity hierarchy" — the right axis is build identity. Slot
  // grouping lets the player see "I have 4 sword, 2 blast, 1 shield"
  // and immediately understand their build axis. Resonance progress
  // is shown next to each slot label so the player tracks
  // ascendance from the pause screen too.
  //
  // Multi-slot relics ['sword', 'blast'] are placed in BOTH groups
  // (the relic shows up twice, once per affected slot — clear visual
  // of "this picks scales both weapons"). 'any'-tagged relics get
  // their own UNIVERSAL bucket at the end.
  const slotGroups = { sword: [], blast: [], shield: [], any: [] };
  for (const r of equippedRelics) {
    const tags = r.affects && r.affects.length ? r.affects : ['any'];
    let placed = false;
    for (const t of tags) {
      if (slotGroups[t]) {
        slotGroups[t].push(r);
        placed = true;
      }
    }
    if (!placed) slotGroups.any.push(r);
  }
  const slotCounts = getSlotCounts(equippedRelics);
  // Slot order: sword → blast → shield → any. Empty slots skip.
  const slotOrder = [
    { id: 'sword',  meta: SLOTS.sword,  glyph: '⚔', label: 'SWORD' },
    { id: 'blast',  meta: SLOTS.blast,  glyph: '⚡', label: 'BLAST' },
    { id: 'shield', meta: SLOTS.shield, glyph: '◈', label: 'SHIELD' },
    { id: 'any',    meta: { color: '#a0a8b8' }, glyph: '✦', label: 'UNIVERSAL' },
  ];
  // Title bar
  const header = document.createElement('div');
  header.style.cssText = 'width:100%;font-size:10px;letter-spacing:3px;opacity:0.5;text-align:center;margin-bottom:4px;';
  header.textContent = `CURRENT BUILD · ${equippedRelics.length} RELIC${equippedRelics.length === 1 ? '' : 'S'}`;
  row.appendChild(header);
  for (const slot of slotOrder) {
    const slotRelics = slotGroups[slot.id];
    if (!slotRelics || slotRelics.length === 0) continue;
    const slotColor = slot.meta.color;
    const group = document.createElement('div');
    group.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;justify-content:center;width:100%;margin-bottom:8px;';
    // Slot label with resonance/ascendance progress (sword/blast/shield only)
    const labelEl = document.createElement('div');
    labelEl.style.cssText = `width:100%;font-size:10px;letter-spacing:3px;color:${slotColor};opacity:0.95;text-align:center;font-weight:bold;`;
    if (slot.id === 'any') {
      labelEl.textContent = `${slot.glyph}  ${slot.label}  (${slotRelics.length})`;
    } else {
      const count = slotCounts[slot.id] | 0;
      const tier = getSlotTier(count);
      const tierGlyph = tier >= 2 ? '★★' : tier >= 1 ? '★' : '';
      const tierTxt = tier >= 2 ? '· ASCENDANCE' : tier >= 1 ? '· RESONANCE' : '';
      labelEl.textContent = `${slot.glyph}  ${slot.label}  ${count}/${SLOT_THRESHOLDS.ascendance}  ${tierGlyph}${tierTxt}`;
    }
    group.appendChild(labelEl);
    for (const r of slotRelics) {
      const tile = document.createElement('div');
      tile.title = r.desc;
      tile.style.cssText = `display:flex;flex-direction:column;align-items:center;gap:4px;background:rgba(20,14,25,0.85);border:1px solid ${r.tint};padding:6px 8px 6px;font-size:11px;color:${r.tint};width:160px;max-width:160px;`;
      // Tier badge inline so the player still sees rarity at a glance
      // even though we're grouping by slot now.
      const tierBadge = r.tier === 'mythic' ? '★ M'
                      : r.tier === 'legendary' ? '★ L'
                      : r.tier === 'rare' ? '◆ R'
                      : '·';
      tile.innerHTML = `
        <div style="display:flex;align-items:center;gap:6px;width:100%;">
          <img src="assets/icons/${r.icon}.png" style="width:22px;height:22px;image-rendering:pixelated;filter:hue-rotate(${hueRotateForTint(r.tint)}deg) saturate(1.15);" />
          <span style="font-weight:bold;font-size:11px;flex:1;">${r.name}</span>
          <span style="font-size:9px;opacity:0.6;">${tierBadge}</span>
        </div>
        <div style="font-size:9px;color:#bbb;line-height:1.3;text-align:center;opacity:0.85;">${r.desc}</div>
      `;
      group.appendChild(tile);
    }
    row.appendChild(group);
  }
}
