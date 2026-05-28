// ============================================================================
// TAROT DESCENT — dramatic 3-card reveal shown after the player picks a
// tarot run from the menu. Displays the drawn hand with a staggered
// animation + bell sting, then offers BEGIN DESCENT or BACK.
//
// Round-7 Sprint B refactor — sixth modal extraction. Two callbacks:
// - onBegin: caller hides the modal AND launches the run (startRun)
// - onBack:  caller clears the drawn cards + restores the main menu
//
// The modal itself owns the synth sting + drawn-card render. Caller
// (main.js wrapper) is responsible for hideAllOverlays before showing.
// ============================================================================
import { synthClick, synthChord } from '../synth.js';
import { drawnCards, seenCount, totalCards } from '../tarot.js';

export const tarotRevealEl = document.createElement('div');
tarotRevealEl.style.cssText = 'position:absolute;inset:0;display:none;align-items:center;justify-content:safe center;flex-direction:column;background:radial-gradient(ellipse at center,#140a18 0%,#0a0610 65%,#050308 100%);color:#ddd;pointer-events:auto;font-family:Georgia,"Cormorant Garamond",serif;padding:24px;box-sizing:border-box;z-index:30;overflow:hidden;';
tarotRevealEl.innerHTML = `
  <!-- Deep vignette + page-frame corners. -->
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

  <div style="position:relative;display:flex;flex-direction:column;align-items:center;z-index:1;">
    <div style="display:flex;align-items:center;gap:22px;margin-bottom:10px;opacity:0.75;">
      <div style="width:100px;height:1px;background:linear-gradient(90deg,transparent,#c9a86a,transparent);"></div>
      <div style="color:#c9a86a;font-size:11px;letter-spacing:6px;font-style:italic;">the cards are drawn</div>
      <div style="width:100px;height:1px;background:linear-gradient(90deg,transparent,#c9a86a,transparent);"></div>
    </div>
    <h1 style="font-size:48px;margin:0;letter-spacing:10px;color:#f4d9a0;text-shadow:0 0 18px rgba(244,217,160,0.5);font-weight:400;line-height:1;">TAROT DESCENT</h1>
    <div style="display:flex;align-items:center;gap:12px;margin:10px 0 34px;opacity:0.65;">
      <span style="width:3px;height:3px;background:#c9a86a;transform:rotate(45deg);"></span>
      <p id="tarotSubtitle" style="margin:0;letter-spacing:5px;font-size:12px;font-style:italic;color:#d8cfae;">three cards drawn · three fates set</p>
      <span style="width:3px;height:3px;background:#c9a86a;transform:rotate(45deg);"></span>
    </div>
    <div id="tarotCardsRow" style="display:flex;flex-wrap:wrap;justify-content:center;gap:24px;margin-bottom:32px;max-width:600px;"></div>
    <button id="tarotBeginBtn" style="background:linear-gradient(180deg,#3a2a20,#1a0f08);color:#f4d9a0;border:0;padding:15px 64px;font-size:15px;cursor:pointer;letter-spacing:7px;font-weight:bold;font-family:Georgia,serif;box-shadow:inset 0 0 0 1px #c9a86a, 0 0 26px rgba(201,168,106,0.3), inset 0 0 14px rgba(244,217,160,0.08);transition:all 0.22s ease;">BEGIN DESCENT</button>
    <button id="tarotBackBtn" style="background:transparent;color:#8a4848;border:0;padding:8px 20px;font-size:11px;cursor:pointer;letter-spacing:5px;margin-top:14px;font-family:Georgia,serif;font-style:italic;font-weight:bold;transition:all 0.22s ease;opacity:0.75;">← BACK</button>
  </div>
`;
document.getElementById('hud').appendChild(tarotRevealEl);

// onBegin: caller hides modal and launches the run (startRun in main.js).
// onBack:  caller clears the drawn tarot hand + restores the menu.
let _onBegin = null;
let _onBack = null;
export function setTarotOnBegin(fn) { _onBegin = fn; }
export function setTarotOnBack(fn) { _onBack = fn; }

document.getElementById('tarotBeginBtn').addEventListener('click', () => {
  tarotRevealEl.style.display = 'none';
  if (_onBegin) _onBegin();
});
document.getElementById('tarotBackBtn').addEventListener('click', () => {
  try { synthClick(0.9, 0.25); } catch (_e) {}
  tarotRevealEl.style.display = 'none';
  if (_onBack) _onBack();
});

export function showTarotRevealModal() {
  // Caller (main.js wrapper) is responsible for hideAllOverlays before
  // this fires; the modal itself just shows + renders the drawn hand.
  tarotRevealEl.style.display = 'flex';
  const row = document.getElementById('tarotCardsRow');
  row.innerHTML = '';
  for (let i = 0; i < drawnCards.length; i++) {
    const c = drawnCards[i];
    const card = document.createElement('div');
    // Card styling — vintage tarot feel
    card.style.cssText = `width:180px;background:linear-gradient(180deg,#2a1418,#140a0d);border:2px solid ${c.tint};padding:18px 14px;text-align:center;display:flex;flex-direction:column;gap:6px;box-shadow:0 0 20px ${c.tint}44;transform:translateY(20px) rotate(-3deg);opacity:0;animation:cardReveal 0.6s ease-out ${i * 0.25}s forwards;`;
    card.innerHTML = `
      <div style="font-size:10px;letter-spacing:3px;color:${c.tint};opacity:0.8;">${c.roman}</div>
      <div style="font-size:18px;font-weight:bold;letter-spacing:3px;color:${c.tint};text-shadow:0 0 8px ${c.tint};">${c.name}</div>
      <div style="font-size:10px;font-style:italic;color:#aaa;padding:6px 0;letter-spacing:1px;">${c.flavor}</div>
      <div style="border-top:1px solid ${c.tint}55;margin:2px 0;padding-top:6px;font-size:11px;color:#d8d4ea;line-height:1.4;min-height:42px;">${c.desc}</div>
      <div style="font-size:9px;letter-spacing:2px;color:${c.positive ? '#86e3a8' : '#d85a5a'};opacity:0.7;margin-top:2px;">${c.positive ? '◆ BOON' : '◆ BURDEN'}</div>
    `;
    row.appendChild(card);
  }
  // Subtitle updates with how many cards seen
  document.getElementById('tarotSubtitle').innerHTML = `three cards drawn. three fates set.<br/><span style="font-size:10px;opacity:0.55;letter-spacing:2px;margin-top:4px;display:inline-block;">${seenCount()} / ${totalCards()} cards glimpsed in the deck</span>`;
  // Audio sting
  synthChord(440, 1.0, 1.4);
  setTimeout(() => synthChord(659, 0.8, 1.2), 250);
  setTimeout(() => synthChord(880, 0.6, 1.0), 500);
}
