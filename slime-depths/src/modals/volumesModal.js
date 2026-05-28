// ============================================================================
// VOLUMES MODAL — save-slot manager. Three slots (Volumes I / II / III),
// each with its own independent progress. Switching reloads the page.
//
// Round-7 Sprint B refactor — extracted from main.js (lines 2445-2576) as
// part of the menu/hamlet/modal layer split. The architecture audit
// flagged main.js at 8,337 LOC with ~2,600 LOC of pure DOM-overlay glue
// independent of the game loop. This is one modal in that pile.
//
// Seam design:
//   - DOM construction + grid rendering live entirely here
//   - The onClose callback is INJECTED by main.js so the modal doesn't
//     need to import showMainMenu (which would create a circular dep
//     against main.js -> modals -> main.js)
//   - hideAllOverlays in main.js still references `volumesEl` directly
//     via this module's named export, so the existing teardown path
//     keeps working unchanged
// ============================================================================
import { synthClick } from '../synth.js';
import { listProfiles, profileLabel, setActiveProfile, deleteProfile } from '../profile.js';

export const volumesEl = document.createElement('div');
volumesEl.style.cssText = 'position:absolute;inset:0;display:none;align-items:center;justify-content:safe center;flex-direction:column;background:radial-gradient(ellipse at center,#140a18 0%,#0a0610 65%,#050308 100%);color:#ddd;pointer-events:auto;font-family:Georgia,"Cormorant Garamond",serif;padding:40px 24px;box-sizing:border-box;overflow-y:auto;';
volumesEl.innerHTML = `
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

  <div style="position:relative;display:flex;flex-direction:column;align-items:center;z-index:1;max-width:840px;width:100%;">
    <div style="display:flex;align-items:center;gap:22px;margin-bottom:10px;opacity:0.75;">
      <div style="width:100px;height:1px;background:linear-gradient(90deg,transparent,#c9a86a,transparent);"></div>
      <div style="color:#c9a86a;font-size:11px;letter-spacing:6px;font-style:italic;">three journals of the ruin</div>
      <div style="width:100px;height:1px;background:linear-gradient(90deg,transparent,#c9a86a,transparent);"></div>
    </div>
    <h1 style="font-size:48px;margin:0;letter-spacing:10px;color:#f4d9a0;text-shadow:0 0 18px rgba(244,217,160,0.45);font-weight:400;line-height:1;">JOURNALS</h1>
    <p style="margin:14px 0 26px;opacity:0.6;letter-spacing:2px;font-size:12px;font-style:italic;max-width:560px;text-align:center;line-height:1.55;">Each journal keeps its own record of the ruin. Switching closes one and opens another. Deleting erases that journal forever.</p>
    <div id="volumesGrid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:18px;margin-bottom:28px;max-width:780px;width:100%;"></div>
    <button id="volumesCloseBtn" style="background:transparent;color:#8a4848;border:0;padding:8px 20px;font-size:11px;cursor:pointer;letter-spacing:5px;font-family:Georgia,serif;font-style:italic;font-weight:bold;transition:all 0.22s ease;opacity:0.75;">← RETURN</button>
  </div>
`;
document.getElementById('hud').appendChild(volumesEl);

// onClose is injected by main.js (typically `showMainMenu`). Stored
// here so the close button can call into main.js without a circular
// import. setVolumesOnClose must be called once at boot before the
// modal is shown.
let _onClose = null;
export function setVolumesOnClose(fn) { _onClose = fn; }

document.getElementById('volumesCloseBtn').addEventListener('click', () => {
  try { synthClick(0.9, 0.25); } catch (_e) {}
  volumesEl.style.display = 'none';
  if (_onClose) _onClose();
});

export function showVolumesModal() {
  // Caller (main.js wrapper) is responsible for hideAllOverlays before
  // this fires; the modal itself just shows + renders.
  volumesEl.style.display = 'flex';
  renderVolumesGrid();
}

function renderVolumesGrid() {
  const grid = document.getElementById('volumesGrid');
  grid.innerHTML = '';
  const all = listProfiles();
  for (const p of all) {
    const card = document.createElement('div');
    const label = profileLabel(p.id);
    const accent = p.isActive ? '#f4d9a0' : (p.exists ? '#c9a86a' : '#5a4c38');
    const shadowActive = p.isActive
      ? `inset 0 0 0 2px ${accent}, 0 0 22px ${accent}66, inset 0 0 14px rgba(0,0,0,0.5)`
      : `inset 0 0 0 1px ${accent}88, inset 0 0 14px rgba(0,0,0,0.5)`;
    card.style.cssText = `
      background: linear-gradient(180deg, rgba(24,18,14,0.92), rgba(12,8,6,0.95));
      padding: 20px 18px 14px;
      font-family: Georgia, serif;
      text-align: center;
      box-shadow: ${shadowActive};
      transition: all 0.2s ease;
      position: relative;
      display: flex;
      flex-direction: column;
      gap: 10px;
    `;
    const bodyHtml = p.exists
      ? `<div style="color:#d8cfae;font-size:11px;letter-spacing:2px;line-height:1.75;margin:4px 0 10px;">
           <div><span style="opacity:0.55;">runs:</span> <span style="color:#f4d9a0;">${p.runsStarted}</span></div>
           <div><span style="opacity:0.55;">deepest:</span> <span style="color:#f4d9a0;">floor ${p.maxFloor} / 4</span></div>
           <div><span style="opacity:0.55;">essence:</span> <span style="color:#a0e8ff;">${p.essence}</span></div>
         </div>`
      : `<div style="color:#6a5c48;font-size:11px;letter-spacing:3px;font-style:italic;margin:14px 0;min-height:60px;display:flex;align-items:center;justify-content:center;">— an empty page —</div>`;

    const actionBtn = p.isActive
      ? `<button data-action="active" style="background:rgba(244,217,160,0.12);color:#f4d9a0;border:0;padding:9px 14px;font-size:10px;cursor:default;letter-spacing:4px;font-family:Georgia,serif;font-weight:bold;box-shadow:inset 0 0 0 1px ${accent};">❦ CURRENT</button>`
      : p.exists
        ? `<button data-action="open" data-pid="${p.id}" style="background:linear-gradient(180deg,#3a2a20,#1a0f08);color:#f4d9a0;border:0;padding:9px 14px;font-size:10px;cursor:pointer;letter-spacing:4px;font-family:Georgia,serif;font-weight:bold;box-shadow:inset 0 0 0 1px #c9a86a;transition:all 0.2s ease;">OPEN JOURNAL</button>`
        : `<button data-action="begin" data-pid="${p.id}" style="background:linear-gradient(180deg,#2a2218,#120a06);color:#c9a86a;border:0;padding:9px 14px;font-size:10px;cursor:pointer;letter-spacing:4px;font-family:Georgia,serif;font-weight:bold;box-shadow:inset 0 0 0 1px #5a4c38;transition:all 0.2s ease;">BEGIN ANEW</button>`;

    const deleteBtn = p.exists && !p.isActive
      ? `<button data-action="delete" data-pid="${p.id}" style="background:transparent;color:#8a4848;border:0;padding:5px;font-size:9px;cursor:pointer;letter-spacing:3px;font-family:Georgia,serif;font-style:italic;opacity:0.6;transition:all 0.2s ease;">erase this journal</button>`
      : p.exists && p.isActive
        ? `<button data-action="delete" data-pid="${p.id}" style="background:transparent;color:#8a4848;border:0;padding:5px;font-size:9px;cursor:pointer;letter-spacing:3px;font-family:Georgia,serif;font-style:italic;opacity:0.5;transition:all 0.2s ease;">erase this journal</button>`
        : '';

    card.innerHTML = `
      <div style="color:${accent};font-size:14px;letter-spacing:5px;font-weight:bold;${p.isActive ? `text-shadow:0 0 10px ${accent}88;` : ''}">JOURNAL ${label}</div>
      ${bodyHtml}
      ${actionBtn}
      ${deleteBtn}
    `;

    // Hover effect on openable cards
    if (!p.isActive && p.exists) {
      card.onmouseenter = () => { card.style.transform = 'translateY(-2px)'; card.style.boxShadow = `inset 0 0 0 1px ${accent}, 0 0 18px ${accent}55, inset 0 0 14px rgba(0,0,0,0.5)`; };
      card.onmouseleave = () => { card.style.transform = ''; card.style.boxShadow = shadowActive; };
    } else if (!p.exists) {
      card.onmouseenter = () => { card.style.transform = 'translateY(-2px)'; card.style.boxShadow = `inset 0 0 0 1px #c9a86a, 0 0 14px rgba(201,168,106,0.35), inset 0 0 14px rgba(0,0,0,0.5)`; };
      card.onmouseleave = () => { card.style.transform = ''; card.style.boxShadow = shadowActive; };
    }

    // Delegated click handler per card
    card.addEventListener('click', (e) => {
      const target = e.target.closest('button');
      if (!target) return;
      const action = target.dataset.action;
      const pid = target.dataset.pid;
      if (action === 'open' || action === 'begin') {
        setActiveProfile(pid);   // triggers location.reload()
      } else if (action === 'delete') {
        // Double-confirm — this is destructive.
        const label2 = profileLabel(pid);
        const ok = confirm(`Erase Journal ${label2} forever?\n\nAll progress (essence, records, unlocks, hamlet NPCs, discovered relics) will be permanently deleted.`);
        if (ok) deleteProfile(pid);   // triggers reload if active
        renderVolumesGrid();
      }
    });
    grid.appendChild(card);
  }
}
