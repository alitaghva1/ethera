// ============================================================================
// CURSES MODAL — toggle run-difficulty modifiers. Each curse adds an
// essence reward multiplier in exchange for a permanent run penalty.
//
// Round-7 Sprint B refactor — extracted from main.js (DOM lines 1181-
// 1215; renderCursesGrid + updateCurseEssMul lines 3027-3085) as the
// second modal in the menu/hamlet/modal extraction sprint. Same seam
// as volumesModal.js: DOM + render private to this module, onClose
// callback injected by main.js, el re-exported so hideAllOverlays
// + the modal-active visibility check can read it directly.
// ============================================================================
import { synthClick } from '../synth.js';
import { ALL_CURSE_IDS, CURSES, isCursed, toggleCurse, curseEssenceMul, curseCount } from '../curses.js';

export const cursesEl = document.createElement('div');
cursesEl.style.cssText = 'position:absolute;inset:0;display:none;align-items:center;justify-content:safe center;flex-direction:column;background:radial-gradient(ellipse at center,#1a0a10 0%,#0a0610 65%,#050308 100%);color:#ddd;pointer-events:auto;font-family:Georgia,serif;padding:24px;box-sizing:border-box;overflow-y:auto;';
cursesEl.innerHTML = `
  <!-- Ornamental frame -->
  <div style="display:flex;align-items:center;gap:18px;margin-bottom:8px;opacity:0.75;animation:winFadeIn 0.6s ease-out;">
    <div style="width:110px;height:1px;background:linear-gradient(90deg,transparent,#a04040,transparent);"></div>
    <div style="color:#a04040;font-size:12px;letter-spacing:5px;font-style:italic;">— accept suffering, be rewarded —</div>
    <div style="width:110px;height:1px;background:linear-gradient(90deg,transparent,#a04040,transparent);"></div>
  </div>
  <h1 style="font-size:48px;margin:0 0 4px;letter-spacing:8px;color:#d85a5a;font-family:Georgia,serif;font-weight:400;text-shadow:0 0 18px rgba(216,90,90,0.45);animation:winFadeIn 0.7s ease-out 0.1s both;">CURSES</h1>
  <p style="margin:0 0 22px;opacity:0.55;letter-spacing:4px;font-size:13px;font-style:italic;animation:winFadeIn 0.6s ease-out 0.2s both;">the ruin remembers every bargain</p>
  <div id="curseEssMul" style="font-size:14px;color:#a0e8ff;letter-spacing:3px;margin-bottom:22px;animation:winFadeIn 0.6s ease-out 0.3s both;min-height:18px;"></div>
  <div id="cursesRow" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px;margin-bottom:22px;max-width:760px;width:100%;animation:winCardSlide 0.55s ease-out 0.4s both;"></div>
  <button id="cursesCloseBtn" style="background:transparent;color:#a97070;border:1px solid #5a3030;padding:10px 32px;font-size:12px;cursor:pointer;letter-spacing:4px;font-family:Georgia,serif;font-style:italic;transition:all 0.18s ease;animation:winFadeIn 0.5s ease-out 0.6s both;">← RETURN</button>
`;
document.getElementById('hud').appendChild(cursesEl);

// onClose is injected by main.js — implements the dual-path close
// logic (Gravekeeper-NPC opened: just hide so hamlet shows through;
// menu-opened: route to showMainMenu). Module-scoped so the
// click handler can read the latest setter at click time.
let _onClose = null;
export function setCursesOnClose(fn) { _onClose = fn; }

document.getElementById('cursesCloseBtn').addEventListener('click', () => {
  try { synthClick(0.9, 0.25); } catch (_e) {}
  cursesEl.style.display = 'none';
  if (_onClose) _onClose();
});

export function showCursesModal() {
  // Caller (main.js wrapper) is responsible for hideAllOverlays before
  // this fires; the modal itself just shows + renders the grid.
  cursesEl.style.display = 'flex';
  renderCursesGrid();
}

function renderCursesGrid() {
  const row = document.getElementById('cursesRow');
  row.innerHTML = '';
  for (const id of ALL_CURSE_IDS) {
    const c = CURSES[id];
    const on = isCursed(id);
    const card = document.createElement('div');
    card.style.cssText = `
      background:linear-gradient(180deg,rgba(36,16,20,0.92),rgba(18,8,12,0.92));
      border:2px solid ${on ? c.tint : 'rgba(90, 60, 60, 0.55)'};
      padding:14px 12px;
      display:flex;flex-direction:column;align-items:center;gap:7px;
      cursor:pointer;
      transition:transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
      font-family:Georgia,serif;
      ${on ? `box-shadow: 0 0 18px ${c.tint}55, inset 0 0 12px ${c.tint}22;` : 'box-shadow: inset 0 0 10px rgba(0,0,0,0.4);'}
    `;
    card.innerHTML = `
      <div style="font-size:16px;font-weight:bold;color:${c.tint};letter-spacing:2px;text-align:center;text-shadow:0 0 6px ${c.tint}44;">${c.name}</div>
      ${c.flavor ? `<div style="font-size:10px;color:rgba(200,190,210,0.75);text-align:center;line-height:1.4;font-style:italic;min-height:38px;padding:0 2px;">${c.flavor}</div>` : ''}
      <div style="height:1px;width:70%;background:linear-gradient(90deg,transparent,${c.tint}aa,transparent);margin:1px 0;"></div>
      <div style="font-size:11px;color:${on ? c.tint : '#bbb'};text-align:center;line-height:1.4;min-height:30px;font-weight:bold;">${c.desc}</div>
      <div style="font-size:13px;color:${on ? '#a0e8ff' : 'rgba(160,232,255,0.4)'};letter-spacing:2px;font-weight:bold;">+${Math.round((c.essenceMul - 1) * 100)}% ✨ ESSENCE</div>
      <div style="font-size:10px;letter-spacing:4px;color:${on ? c.tint : 'rgba(140,140,140,0.45)'};font-style:italic;font-weight:bold;">${on ? '☠ ACTIVE ☠' : 'dormant'}</div>
    `;
    card.addEventListener('click', () => {
      toggleCurse(id);
      renderCursesGrid();
      updateCurseEssMul();
    });
    card.addEventListener('mouseenter', () => {
      card.style.transform = 'translateY(-3px)';
      card.style.boxShadow = on
        ? `0 0 24px ${c.tint}80, inset 0 0 14px ${c.tint}33`
        : `0 0 14px ${c.tint}33, inset 0 0 10px rgba(0,0,0,0.4)`;
    });
    card.addEventListener('mouseleave', () => {
      card.style.transform = 'none';
      card.style.boxShadow = on
        ? `0 0 18px ${c.tint}55, inset 0 0 12px ${c.tint}22`
        : 'inset 0 0 10px rgba(0,0,0,0.4)';
    });
    row.appendChild(card);
  }
  updateCurseEssMul();
}

function updateCurseEssMul() {
  const mul = curseEssenceMul();
  const count = curseCount();
  const essEl = document.getElementById('curseEssMul');
  if (count === 0) {
    essEl.textContent = 'no curses active';
    essEl.style.color = 'rgba(160,232,255,0.4)';
  } else {
    essEl.textContent = count + ' curse' + (count > 1 ? 's' : '') + ' active · ✨ ' + mul.toFixed(2) + 'x essence reward';
    essEl.style.color = '#a0e8ff';
  }
}
