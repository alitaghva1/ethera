// ============================================================================
// MEMORY WEAVE — modal for selecting the Memory that will shape the next run.
// Unlocked memories show as full cards; locked ones are silhouetted with a
// cryptic hint. Picking one persists the choice; picking "(none)" clears it.
//
// Round-7 Sprint B refactor — fifth modal extraction. Has TWO injection
// points unlike prior modals:
//
//   1. setMemoryOnClose — the close callback (dual path: from main menu
//      goes to showMainMenu; from the Archivist NPC just hides the
//      modal so the hamlet canvas underneath shows through, gated on
//      the _serviceCloseToHamlet flag in main.js).
//
//   2. setMemoryOnPick — fires after the player chooses (or clears) a
//      memory. main.js wires this to updateMenuMemoryLabel so the
//      bottom-left menu MEMORY chip refreshes its label/tint without
//      the modal needing a direct ref to that DOM element.
// ============================================================================
import { synthClick } from '../synth.js';
import { ALL_MEMORY_IDS, MEMORIES, unlockedMemories, selectedMemoryId, setSelectedMemory, unlockedCount as memoriesUnlockedCount, totalMemories } from '../memories.js';
import { records } from '../records';

export const memoryEl = document.createElement('div');
memoryEl.style.cssText = 'position:absolute;inset:0;display:none;align-items:center;justify-content:safe center;flex-direction:column;background:radial-gradient(ellipse at center,#140a18 0%,#0a0610 65%,#050308 100%);color:#ddd;pointer-events:auto;font-family:Georgia,"Cormorant Garamond",serif;padding:40px 24px;box-sizing:border-box;overflow-y:auto;';
memoryEl.innerHTML = `
  <!-- Page-frame corners + deep vignette — shared manuscript grammar -->
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

  <div style="position:relative;display:flex;flex-direction:column;align-items:center;z-index:1;width:100%;max-width:960px;">
    <div style="display:flex;align-items:center;gap:22px;margin-bottom:10px;opacity:0.75;">
      <div style="width:100px;height:1px;background:linear-gradient(90deg,transparent,#c9a86a,transparent);"></div>
      <div style="color:#c9a86a;font-size:11px;letter-spacing:6px;font-style:italic;">what you have forgotten to forget</div>
      <div style="width:100px;height:1px;background:linear-gradient(90deg,transparent,#c9a86a,transparent);"></div>
    </div>
    <h1 style="font-size:48px;margin:0;letter-spacing:10px;color:#f4d9a0;text-shadow:0 0 18px rgba(244,217,160,0.45);font-weight:400;line-height:1;">MEMORY</h1>
    <div style="display:flex;align-items:center;gap:12px;margin:10px 0 18px;opacity:0.65;">
      <span style="width:3px;height:3px;background:#c9a86a;transform:rotate(45deg);"></span>
      <p id="memoryProgress" style="margin:0;letter-spacing:5px;font-size:12px;font-style:italic;color:#d8cfae;"></p>
      <span style="width:3px;height:3px;background:#c9a86a;transform:rotate(45deg);"></span>
    </div>
    <p style="margin:0 0 22px;opacity:0.6;letter-spacing:2px;font-size:12px;font-style:italic;max-width:620px;text-align:center;line-height:1.55;">A memory is a shape you carry into the dark. A pact with a version of yourself that can no longer speak but can still bargain. Choose one, and descend as that.</p>
    <div id="memoryGrid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px;margin-bottom:22px;max-height:500px;max-width:880px;width:100%;overflow-y:auto;padding:4px;"></div>
    <button id="memoryClearBtn" style="background:transparent;color:#8a7a6a;border:1px solid #4a3a2a;padding:8px 24px;font-size:11px;cursor:pointer;letter-spacing:4px;font-family:Georgia,serif;font-style:italic;margin-bottom:14px;transition:all 0.2s ease;">— forget them all —</button>
    <button id="memoryCloseBtn" style="background:transparent;color:#8a4848;border:0;padding:8px 20px;font-size:11px;cursor:pointer;letter-spacing:5px;font-family:Georgia,serif;font-style:italic;font-weight:bold;transition:all 0.22s ease;opacity:0.75;">← RETURN</button>
  </div>
`;
document.getElementById('hud').appendChild(memoryEl);

// Two injection points — see header comment for rationale.
let _onClose = null;
let _onPick = null;
export function setMemoryOnClose(fn) { _onClose = fn; }
export function setMemoryOnPick(fn) { _onPick = fn; }

document.getElementById('memoryCloseBtn').addEventListener('click', () => {
  try { synthClick(0.9, 0.25); } catch (_e) {}
  memoryEl.style.display = 'none';
  if (_onClose) _onClose();
});
document.getElementById('memoryClearBtn').addEventListener('click', () => {
  setSelectedMemory(null);
  renderMemoryGrid();
  if (_onPick) _onPick();
});

export function showMemoryModal() {
  // Caller (main.js wrapper) is responsible for hideAllOverlays before
  // this fires; the modal itself just shows + renders.
  memoryEl.style.display = 'flex';
  renderMemoryGrid();
}

function renderMemoryGrid() {
  const grid = document.getElementById('memoryGrid');
  const progress = document.getElementById('memoryProgress');
  grid.innerHTML = '';
  // ASCENSION V — when Memory is neutralized for this run, communicate
  // loudly BEFORE the player wastes a pick choosing one. The progress line
  // doubles as the alert channel; regular text when clean, crimson when the
  // memory slot is silenced.
  const am = (typeof window !== 'undefined' && window.__ascensionModifiers) ? window.__ascensionModifiers() : {};
  if (am && am.memoryDisabled) {
    progress.innerHTML = `<span style="color:#d8556a;text-shadow:0 0 10px rgba(216,85,106,0.45);">⚠ MEMORY SLOT NEUTRALIZED — Ascension V</span>
      <span style="display:block;font-size:9px;color:#a89b82;font-style:italic;margin-top:2px;opacity:0.8;">the selection you make will have no effect this descent</span>`;
  } else {
    progress.textContent = `${memoriesUnlockedCount()} of ${totalMemories()} remembered`;
  }
  for (const id of ALL_MEMORY_IDS) {
    const def = MEMORIES[id];
    const unlocked = unlockedMemories.has(id);
    const selected = selectedMemoryId === id;
    const card = document.createElement('button');
    const accent = def.tint || '#c9a86a';
    card.style.cssText = `
      background: linear-gradient(180deg, rgba(24,18,14,0.92), rgba(12,8,6,0.95));
      border: 0;
      padding: 16px 18px;
      cursor: ${unlocked ? 'pointer' : 'default'};
      font-family: Georgia, serif;
      text-align: left;
      opacity: ${unlocked ? 1 : 0.45};
      box-shadow: ${selected
        ? `inset 0 0 0 2px ${accent}, 0 0 22px ${accent}66, inset 0 0 14px rgba(0,0,0,0.5)`
        : `inset 0 0 0 1px ${unlocked ? accent+'55' : 'rgba(201,168,106,0.15)'}, inset 0 0 14px rgba(0,0,0,0.5)`};
      transition: all 0.2s ease;
      color: #d8cfae;
    `;
    if (unlocked) {
      card.onmouseenter = () => { card.style.transform = 'translateY(-2px)'; card.style.boxShadow = `inset 0 0 0 1px ${accent}, 0 0 20px ${accent}55, inset 0 0 14px rgba(0,0,0,0.5)`; };
      card.onmouseleave = () => { card.style.transform = ''; renderMemoryGrid(); };
    }
    const name = unlocked ? def.name : '— forgotten —';
    const flavor = unlocked ? def.flavor : def.unlockHint;
    const gift = unlocked ? `<div style="color:${accent};font-size:10px;letter-spacing:3px;font-weight:bold;margin-top:10px;">GIFT</div><div style="font-size:11px;line-height:1.45;margin-top:3px;">${def.gift}</div>` : '';
    const constraint = unlocked ? `<div style="color:#a06060;font-size:10px;letter-spacing:3px;font-weight:bold;margin-top:8px;">BOND</div><div style="font-size:11px;line-height:1.45;margin-top:3px;opacity:0.85;">${def.constraint}</div>` : '';
    const sel = selected ? `<div style="color:${accent};font-size:10px;letter-spacing:4px;font-weight:bold;margin-top:12px;text-shadow:0 0 8px ${accent}88;">❦ CHOSEN</div>` : '';
    // Progress bar for locked memories with numeric unlock conditions — shows
    // how close the player is instead of a flat "reach floor 2" hint.
    let progressHtml = '';
    if (!unlocked && typeof def.unlockProgress === 'function') {
      try {
        const prog = def.unlockProgress(records);
        if (prog && prog.target > 0) {
          const pct = Math.max(0, Math.min(1, prog.current / prog.target));
          const pctStr = (pct * 100).toFixed(0);
          const done = pct >= 1 ? '#86e3a8' : '#c9a86a';
          progressHtml = `
            <div style="margin-top:10px;">
              <div style="font-size:10px;letter-spacing:1px;color:#a89b82;font-family:Georgia,serif;">${prog.current} / ${prog.target} ${prog.unit || ''}</div>
              <div style="margin-top:4px;height:3px;background:rgba(201,168,106,0.18);overflow:hidden;">
                <div style="height:100%;width:${pctStr}%;background:${done};box-shadow:0 0 6px ${done}88;"></div>
              </div>
            </div>
          `;
        }
      } catch (e) {}
    }
    card.innerHTML = `
      <div style="color:${unlocked ? accent : '#6a5c48'};font-size:13px;letter-spacing:2.5px;font-weight:bold;margin-bottom:6px;${unlocked ? `text-shadow:0 0 8px ${accent}55;` : ''}">${name}</div>
      <div style="font-size:11px;font-style:italic;opacity:0.7;line-height:1.5;min-height:36px;">${flavor}</div>
      ${gift}
      ${constraint}
      ${progressHtml}
      ${sel}
    `;
    if (unlocked) {
      card.onclick = () => {
        setSelectedMemory(selected ? null : id);
        renderMemoryGrid();
        if (_onPick) _onPick();
      };
    }
    grid.appendChild(card);
  }
}
