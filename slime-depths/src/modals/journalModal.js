// ============================================================================
// JOURNAL OF THE RUIN — scrollable auto-generated history modal.
// Shows the player's death/boss-kill/milestone events accumulated by
// the ruin module across runs. Reachable from the pause menu only.
//
// Round-7 Sprint B refactor — third extraction in the menu/modal sprint
// (after volumesModal.js, cursesModal.js). Same seam: DOM + render
// private; el + show + setOnClose exported. Differs from volumes/curses
// in one detail: journal is reached FROM the pause modal and closes
// BACK to it (not to the main menu), so the onClose callback restores
// pause-modal visibility instead of routing to showMainMenu.
// ============================================================================
import { ruin } from '../ruin.js';

export const journalEl = document.createElement('div');
journalEl.style.cssText = 'position:absolute;inset:0;display:none;align-items:center;justify-content:safe center;flex-direction:column;background:radial-gradient(ellipse at center,#140a18 0%,#0a0610 65%,#050308 100%);color:#ddd;pointer-events:auto;font-family:Georgia,"Cormorant Garamond",serif;padding:40px 24px;box-sizing:border-box;z-index:20;overflow-y:auto;';
journalEl.innerHTML = `
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

  <div style="position:relative;display:flex;flex-direction:column;align-items:center;z-index:1;width:100%;">
    <div style="display:flex;align-items:center;gap:22px;margin-bottom:10px;opacity:0.75;">
      <div style="width:100px;height:1px;background:linear-gradient(90deg,transparent,#c9a86a,transparent);"></div>
      <div style="color:#c9a86a;font-size:11px;letter-spacing:6px;font-style:italic;">the ruin remembers</div>
      <div style="width:100px;height:1px;background:linear-gradient(90deg,transparent,#c9a86a,transparent);"></div>
    </div>
    <h1 style="font-size:42px;margin:0;letter-spacing:8px;color:#c9a86a;text-shadow:0 0 14px rgba(201,168,106,0.45);font-weight:400;line-height:1;">JOURNAL OF THE RUIN</h1>
    <div style="display:flex;align-items:center;gap:12px;margin:10px 0 22px;opacity:0.65;max-width:100%;text-align:center;">
      <span style="width:3px;height:3px;background:#c9a86a;transform:rotate(45deg);flex-shrink:0;"></span>
      <p id="journalSubtitle" style="margin:0;letter-spacing:3px;font-size:11px;font-style:italic;color:#d8cfae;"></p>
      <span style="width:3px;height:3px;background:#c9a86a;transform:rotate(45deg);flex-shrink:0;"></span>
    </div>
    <div id="journalEntries" style="width:720px;max-width:100%;max-height:60%;overflow-y:auto;padding:22px 24px;background:linear-gradient(180deg,rgba(30,22,16,0.75),rgba(14,10,8,0.8));box-shadow:inset 0 0 0 1px rgba(201,168,106,0.28), inset 0 0 18px rgba(0,0,0,0.5);font-size:13px;color:#d8cfae;font-family:Georgia,serif;line-height:1.6;"></div>
    <button id="journalBackBtn" style="background:transparent;color:#8a4848;border:0;padding:8px 20px;font-size:11px;cursor:pointer;letter-spacing:5px;margin-top:22px;font-family:Georgia,serif;font-style:italic;font-weight:bold;transition:all 0.22s ease;opacity:0.75;">← CLOSE</button>
  </div>
`;
document.getElementById('hud').appendChild(journalEl);

// onClose injected by main.js — closes back to the pause modal (not
// the main menu). main.js does `pauseEl.style.display = 'flex'` in its
// onClose so we don't need a direct ref to pauseEl from this module.
let _onClose = null;
export function setJournalOnClose(fn) { _onClose = fn; }

document.getElementById('journalBackBtn').addEventListener('click', () => {
  journalEl.style.display = 'none';
  if (_onClose) _onClose();
});

export function showJournalModal() {
  // Caller (main.js wrapper) is responsible for hiding the pause modal
  // before this fires; the journal itself just shows + renders.
  journalEl.style.display = 'flex';
  const subtitle = document.getElementById('journalSubtitle');
  const entries = document.getElementById('journalEntries');
  const age = ruin.age | 0;
  const cleared = ruin.runsCompleted | 0;
  const bossKills = (ruin.bossKills || []).length;
  subtitle.textContent = `the dungeon has aged ${age} death${age === 1 ? '' : 's'} · ${bossKills} boss${bossKills === 1 ? '' : 'es'} felled · ${cleared} full descent${cleared === 1 ? '' : 's'}`;
  entries.innerHTML = '';
  if (!ruin.journal || ruin.journal.length === 0) {
    entries.innerHTML = '<div style="opacity:0.55;font-style:italic;text-align:center;padding:30px 0;">The journal is empty. Die, or defeat a boss, and the ruin will begin to remember.</div>';
    return;
  }
  for (const entry of ruin.journal) {
    const tint = entry.kind === 'death' ? '#d85a5a'
               : entry.kind === 'boss' ? '#f4d9a0'
               : entry.kind === 'milestone' ? '#a0e8ff' : '#d8d4ea';
    const icon = entry.kind === 'death' ? '✓'
               : entry.kind === 'boss' ? '†'
               : entry.kind === 'milestone' ? '✦' : '·';
    const div = document.createElement('div');
    div.style.cssText = `display:flex;gap:10px;padding:8px 0;border-bottom:1px solid rgba(100,90,90,0.15);`;
    div.innerHTML = `
      <div style="color:${tint};font-size:20px;width:22px;text-align:center;">${icon}</div>
      <div style="flex:1;font-size:13px;color:#d8cfc4;font-style:italic;line-height:1.5;">${entry.text}</div>
    `;
    entries.appendChild(div);
  }
}
