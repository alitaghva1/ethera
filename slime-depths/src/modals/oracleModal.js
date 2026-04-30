// ============================================================================
// THE ORACLE — two paired modals that share a visual family. Both are
// NPC-only (the Oracle in the hamlet); neither has a main-menu route,
// dual-path close, nor a main.js callback. Hiding returns the player
// to the hamlet canvas where they left off.
//
//   showOracleForecast() — static lore-accurate map of the four floors
//     (biome, families, boss-line). Free service. Has a "DRAW A FORTUNE"
//     button that hands off to the fortune modal below.
//
//   showOracleFortune()  — eight Major Arcana cards face-down; pick one
//     to carry into the next descent. Cancel returns to the forecast.
//     Accept stamps window.__oracleCard + bumps hamletState.fortunesDrawn
//     and returns to the forecast (which now surfaces the carried-card
//     notice).
//
// Round-7 Sprint B refactor — eleventh modal extraction. Bundled into
// one module because the two screens cross-reference each other (the
// fortune modal returns to the forecast on both Cancel and Accept).
// ============================================================================
import { synthClick } from '../synth.js';
import { TAROT } from '../tarot.js';
import { recordServiceUse, hamletState, saveHamletState, tryAdvanceArc } from '../hamlet.js';

// ============================================================================
// ORACLE FORECAST — static four-floor map.
// ============================================================================
export const oracleEl = document.createElement('div');
oracleEl.style.cssText =
  'position:absolute;inset:0;display:none;align-items:center;justify-content:safe center;flex-direction:column;background:radial-gradient(ellipse at center,#181022 0%,#0a0814 65%,#050308 100%);color:#ddd;pointer-events:auto;font-family:Georgia,"Cormorant Garamond",serif;padding:40px 24px;box-sizing:border-box;overflow-y:auto;';
oracleEl.innerHTML = `
  <div style="position:absolute;inset:0;background:radial-gradient(ellipse at center, transparent 28%, rgba(4,2,6,0.55) 78%, rgba(0,0,0,0.85) 100%);pointer-events:none;"></div>
  <div style="position:absolute;top:22px;left:22px;width:48px;height:48px;pointer-events:none;">
    <div style="position:absolute;top:0;left:0;width:48px;height:1px;background:linear-gradient(90deg,#b49aff,transparent);"></div>
    <div style="position:absolute;top:0;left:0;width:1px;height:48px;background:linear-gradient(180deg,#b49aff,transparent);"></div>
    <div style="position:absolute;top:-2px;left:-2px;width:4px;height:4px;background:#b49aff;transform:rotate(45deg);"></div>
  </div>
  <div style="position:absolute;top:22px;right:22px;width:48px;height:48px;pointer-events:none;">
    <div style="position:absolute;top:0;right:0;width:48px;height:1px;background:linear-gradient(270deg,#b49aff,transparent);"></div>
    <div style="position:absolute;top:0;right:0;width:1px;height:48px;background:linear-gradient(180deg,#b49aff,transparent);"></div>
    <div style="position:absolute;top:-2px;right:-2px;width:4px;height:4px;background:#b49aff;transform:rotate(45deg);"></div>
  </div>
  <div style="position:absolute;bottom:22px;left:22px;width:48px;height:48px;pointer-events:none;">
    <div style="position:absolute;bottom:0;left:0;width:48px;height:1px;background:linear-gradient(90deg,#b49aff,transparent);"></div>
    <div style="position:absolute;bottom:0;left:0;width:1px;height:48px;background:linear-gradient(0deg,#b49aff,transparent);"></div>
    <div style="position:absolute;bottom:-2px;left:-2px;width:4px;height:4px;background:#b49aff;transform:rotate(45deg);"></div>
  </div>
  <div style="position:absolute;bottom:22px;right:22px;width:48px;height:48px;pointer-events:none;">
    <div style="position:absolute;bottom:0;right:0;width:48px;height:1px;background:linear-gradient(270deg,#b49aff,transparent);"></div>
    <div style="position:absolute;bottom:0;right:0;width:1px;height:48px;background:linear-gradient(0deg,#b49aff,transparent);"></div>
    <div style="position:absolute;bottom:-2px;right:-2px;width:4px;height:4px;background:#b49aff;transform:rotate(45deg);"></div>
  </div>

  <div style="position:relative;display:flex;flex-direction:column;align-items:center;z-index:1;max-width:820px;width:100%;">
    <div style="display:flex;align-items:center;gap:22px;margin-bottom:10px;opacity:0.75;">
      <div style="width:110px;height:1px;background:linear-gradient(90deg,transparent,#b49aff,transparent);"></div>
      <div style="color:#b49aff;font-size:11px;letter-spacing:6px;font-style:italic;">the forward-dark, remembered</div>
      <div style="width:110px;height:1px;background:linear-gradient(90deg,transparent,#b49aff,transparent);"></div>
    </div>
    <h1 style="font-size:44px;margin:0;letter-spacing:10px;color:#d8c4ff;text-shadow:0 0 18px rgba(180,154,255,0.45);font-weight:400;line-height:1;">THE PATH</h1>
    <p style="margin:14px 0 26px;opacity:0.6;letter-spacing:1.5px;font-size:11px;font-style:italic;max-width:560px;text-align:center;line-height:1.55;">Four floors. Four shapes of hunger. I cannot tell you how they end — only what they are.</p>
    <div id="oracleFloors" style="display:flex;flex-direction:column;gap:14px;width:100%;"></div>
    <div id="oracleFortuneNotice" style="margin-top:10px;min-height:14px;font-size:10.5px;letter-spacing:2px;color:#86e3a8;font-style:italic;opacity:0;transition:opacity 0.3s ease;"></div>
    <div style="display:flex;gap:18px;margin-top:14px;align-items:center;">
      <button id="oracleCloseBtn" style="background:transparent;color:#8a4848;border:0;padding:8px 20px;font-size:11px;cursor:pointer;letter-spacing:5px;font-family:Georgia,serif;font-style:italic;font-weight:bold;transition:all 0.22s ease;opacity:0.75;">← LOOK AWAY</button>
      <button id="oracleDrawBtn" style="background:linear-gradient(180deg,#2a1840,#14081a);color:#d8c4ff;border:0;padding:10px 28px;font-size:11px;cursor:pointer;letter-spacing:4px;font-family:Georgia,serif;font-weight:bold;box-shadow:inset 0 0 0 1px #b49aff, 0 0 20px rgba(180,154,255,0.2);transition:all 0.22s ease;">◆ DRAW A FORTUNE ◆</button>
    </div>
  </div>
`;
document.getElementById('hud').appendChild(oracleEl);
document.getElementById('oracleCloseBtn').addEventListener('click', () => {
  try {
    synthClick(0.9, 0.25);
  } catch (_e) {}
  oracleEl.style.display = 'none';
  // Oracle is NPC-only (no main-menu access). Hamlet canvas is still
  // rendering underneath; hiding the modal returns the player exactly
  // where they left off next to the Oracle. No re-entry needed.
});
document.getElementById('oracleDrawBtn').addEventListener('click', () => {
  oracleEl.style.display = 'none';
  showOracleFortune();
});

// The forecast is static lore-accurate data. Could be made dynamic later
// (e.g., different omens per day, tarot-aware), but the "remember forward"
// framing makes the unchanging nature feel intentional.
const ORACLE_FORECAST = [
  {
    name: 'The Undercroft',
    roman: 'I',
    enemies: 'slimes, skeletons',
    bossLine: 'A captain in rusted armor, long unburied, waits in its heart.',
    tint: '#86e3a8',
  },
  {
    name: 'The Ruined Tower',
    roman: 'II',
    enemies: 'orcs, archers, bone captains',
    bossLine: 'The iron king who refused to stop. Blue fire, broken crown.',
    tint: '#a0d8ff',
  },
  {
    name: 'The Spire',
    roman: 'III',
    enemies: 'bonecaps, brood, lancers',
    bossLine: 'She waits in her webs. She has waited a very long time.',
    tint: '#d85a5a',
  },
  {
    name: 'The Throne of Ruin',
    roman: 'IV',
    enemies: 'priests, wizards, the Hermit',
    bossLine: 'A throne that forgot it was empty. Red fire answers to its silence.',
    tint: '#ff8040',
  },
];

export function showOracleForecast() {
  // Caller (main.js wrapper) is responsible for hideAllOverlays before
  // this fires; the modal itself just shows + renders the floors.
  const listEl = document.getElementById('oracleFloors');
  listEl.innerHTML = '';
  for (const f of ORACLE_FORECAST) {
    const row = document.createElement('div');
    row.style.cssText = `
      background: linear-gradient(180deg, rgba(24,18,28,0.88), rgba(12,8,14,0.92));
      padding: 14px 20px;
      box-shadow: inset 0 0 0 1px ${f.tint}55, inset 0 0 14px rgba(0,0,0,0.4);
      font-family: Georgia, serif;
      display: grid;
      grid-template-columns: 50px 1fr;
      gap: 20px;
      align-items: center;
    `;
    row.innerHTML = `
      <div style="color:${f.tint};font-size:26px;font-weight:400;letter-spacing:4px;text-align:center;text-shadow:0 0 8px ${f.tint}66;">${f.roman}</div>
      <div>
        <div style="color:${f.tint};font-size:15px;letter-spacing:4px;font-weight:bold;margin-bottom:4px;text-shadow:0 0 6px ${f.tint}44;">${f.name.toUpperCase()}</div>
        <div style="color:#d8cfae;font-size:11px;letter-spacing:1.5px;opacity:0.8;margin-bottom:3px;">you will meet: <span style="color:${f.tint};font-style:italic;">${f.enemies}</span></div>
        <div style="color:#d8cfae;font-size:11px;letter-spacing:1px;opacity:0.7;font-style:italic;line-height:1.5;">${f.bossLine}</div>
      </div>
    `;
    listEl.appendChild(row);
  }
  // Carried-fortune hint — if the player has already drawn, surface the fact.
  const notice = document.getElementById('oracleFortuneNotice');
  if (notice) {
    if (window.__oracleCard) {
      const c = TAROT[window.__oracleCard];
      notice.textContent = `◆ ${c ? c.name : 'A FORTUNE'} is carried into your next descent ◆`;
      notice.style.opacity = '0.85';
    } else {
      notice.textContent = '';
      notice.style.opacity = '0';
    }
  }
  oracleEl.style.display = 'flex';
  // Record service use and advance the Oracle's arc (free service — her
  // value is narrative, not essence-sunk)
  recordServiceUse('oracle');
}

// ============================================================================
// ORACLE'S FORTUNES — eight Major Arcana cards face-down; player picks
// one to carry. On run start, main.js pushes window.__oracleCard into
// drawnCards so every existing tarot-hook fires automatically.
// ============================================================================
export const oracleFortuneEl = document.createElement('div');
oracleFortuneEl.style.cssText =
  'position:absolute;inset:0;display:none;align-items:center;justify-content:safe center;flex-direction:column;background:radial-gradient(ellipse at center,#1a0f28 0%,#0c0614 65%,#050308 100%);color:#ddd;pointer-events:auto;font-family:Georgia,"Cormorant Garamond",serif;padding:40px 24px;box-sizing:border-box;z-index:30;overflow-y:auto;';
oracleFortuneEl.innerHTML = `
  <div style="position:absolute;inset:0;background:radial-gradient(ellipse at center, transparent 28%, rgba(4,2,6,0.55) 78%, rgba(0,0,0,0.85) 100%);pointer-events:none;"></div>
  <div style="position:relative;display:flex;flex-direction:column;align-items:center;z-index:1;max-width:960px;width:100%;">
    <div style="display:flex;align-items:center;gap:22px;margin-bottom:10px;opacity:0.75;">
      <div style="width:110px;height:1px;background:linear-gradient(90deg,transparent,#b49aff,transparent);"></div>
      <div style="color:#b49aff;font-size:11px;letter-spacing:6px;font-style:italic;">a fortune, for the descent</div>
      <div style="width:110px;height:1px;background:linear-gradient(90deg,transparent,#b49aff,transparent);"></div>
    </div>
    <h1 id="oracleFortuneTitle" style="font-size:40px;margin:0;letter-spacing:10px;color:#d8c4ff;text-shadow:0 0 18px rgba(180,154,255,0.45);font-weight:400;line-height:1;">DRAW ONE</h1>
    <p id="oracleFortuneSubtitle" style="margin:14px 0 26px;opacity:0.65;letter-spacing:1.5px;font-size:11px;font-style:italic;max-width:560px;text-align:center;line-height:1.55;">Choose a card. It will shape your next descent — you may discard it only by dying.</p>
    <div id="oracleFortuneCards" style="display:flex;gap:14px;flex-wrap:wrap;justify-content:center;max-width:900px;"></div>
    <div id="oracleFortuneReveal" style="display:none;flex-direction:column;align-items:center;margin-top:14px;max-width:520px;text-align:center;"></div>
    <div style="display:flex;gap:18px;margin-top:22px;align-items:center;">
      <button id="oracleFortuneCancelBtn" style="background:transparent;color:#8a4848;border:0;padding:8px 20px;font-size:11px;cursor:pointer;letter-spacing:5px;font-family:Georgia,serif;font-style:italic;font-weight:bold;transition:all 0.22s ease;opacity:0.75;">← NOT TODAY</button>
      <button id="oracleFortuneAcceptBtn" style="display:none;background:linear-gradient(180deg,#2a1840,#14081a);color:#d8c4ff;border:0;padding:10px 28px;font-size:11px;cursor:pointer;letter-spacing:4px;font-family:Georgia,serif;font-weight:bold;box-shadow:inset 0 0 0 1px #b49aff, 0 0 20px rgba(180,154,255,0.25);transition:all 0.22s ease;">CARRY IT FORWARD →</button>
    </div>
  </div>
`;
document.getElementById('hud').appendChild(oracleFortuneEl);

let _oracleFortunePick = null;

function renderOracleFortuneCards() {
  const listEl = document.getElementById('oracleFortuneCards');
  listEl.innerHTML = '';
  // Deterministic shuffle per visit — every time the modal opens, cards
  // appear in a fresh order so the player's eye doesn't just click the
  // same slot repeatedly.
  const order = [...Object.keys(TAROT)];
  for (let i = order.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [order[i], order[j]] = [order[j], order[i]];
  }
  for (const id of order) {
    const cardEl = document.createElement('button');
    cardEl.className = 'oracleFortuneCard';
    cardEl.dataset.cardId = id;
    cardEl.style.cssText = `
      width: 96px; height: 150px;
      background: linear-gradient(180deg, #241833, #0e0818);
      box-shadow: inset 0 0 0 1px #b49aff, 0 0 18px rgba(180,154,255,0.12), inset 0 0 14px rgba(0,0,0,0.5);
      border: 0; padding: 0; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      font-family: Georgia, serif; color: #b49aff;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
      position: relative;
    `;
    // Card-back ornament — gold diamond + fine hairlines
    cardEl.innerHTML = `
      <div style="position:absolute;inset:8px;border:1px solid rgba(180,154,255,0.25);"></div>
      <div style="position:absolute;inset:14px;display:flex;align-items:center;justify-content:center;">
        <div style="width:14px;height:14px;background:#b49aff;transform:rotate(45deg);opacity:0.5;box-shadow:0 0 8px #b49aff77;"></div>
      </div>
      <div style="position:absolute;top:8px;left:8px;right:8px;height:1px;background:linear-gradient(90deg,transparent,#b49aff44,transparent);"></div>
      <div style="position:absolute;bottom:8px;left:8px;right:8px;height:1px;background:linear-gradient(90deg,transparent,#b49aff44,transparent);"></div>
    `;
    cardEl.onmouseenter = () => {
      cardEl.style.transform = 'translateY(-6px)';
      cardEl.style.boxShadow =
        'inset 0 0 0 1px #d8c4ff, 0 0 28px rgba(216,196,255,0.35), inset 0 0 14px rgba(0,0,0,0.5)';
    };
    cardEl.onmouseleave = () => {
      cardEl.style.transform = '';
      cardEl.style.boxShadow =
        'inset 0 0 0 1px #b49aff, 0 0 18px rgba(180,154,255,0.12), inset 0 0 14px rgba(0,0,0,0.5)';
    };
    cardEl.onclick = () => revealOracleFortuneCard(id, cardEl);
    listEl.appendChild(cardEl);
  }
}

function revealOracleFortuneCard(id, cardEl) {
  _oracleFortunePick = id;
  const card = TAROT[id];
  if (!card) return;
  // Dim every card, highlight the picked one — reads "this is what you drew"
  const allCards = document.querySelectorAll('.oracleFortuneCard');
  for (const el of allCards) {
    el.style.pointerEvents = 'none';
    if (el !== cardEl) {
      el.style.opacity = '0.25';
      el.style.transform = '';
    } else {
      el.style.transform = 'translateY(-14px) scale(1.08)';
      el.style.boxShadow = `inset 0 0 0 2px ${card.tint}, 0 0 34px ${card.tint}66, inset 0 0 18px rgba(0,0,0,0.4)`;
      // Flip to face-up: replace inner with typographic card face
      el.innerHTML = `
        <div style="position:absolute;inset:8px;border:1px solid ${card.tint}88;"></div>
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;padding:10px;">
          <div style="color:${card.tint};font-size:12px;letter-spacing:3px;opacity:0.7;margin-bottom:6px;">${card.roman}</div>
          <div style="width:32px;height:1px;background:${card.tint};opacity:0.4;margin-bottom:8px;"></div>
          <div style="color:${card.tint};font-size:11px;letter-spacing:2px;font-weight:bold;text-align:center;line-height:1.2;text-shadow:0 0 8px ${card.tint}77;">${card.name}</div>
        </div>
      `;
    }
  }
  // Show reveal block with desc + flavor
  const rev = document.getElementById('oracleFortuneReveal');
  rev.style.display = 'flex';
  rev.innerHTML = `
    <div style="color:${card.tint};font-size:14px;letter-spacing:3px;font-weight:bold;margin-bottom:6px;text-shadow:0 0 10px ${card.tint}66;">${card.name}</div>
    <div style="color:#c8c0d8;font-size:11px;letter-spacing:1.5px;font-style:italic;opacity:0.75;margin-bottom:10px;">"${card.flavor}"</div>
    <div style="color:${card.tint};font-size:12px;letter-spacing:1.5px;line-height:1.5;">${card.desc}</div>
  `;
  // Swap subtitle + swap button
  document.getElementById('oracleFortuneSubtitle').textContent =
    'This is the card you will carry. Take it, or leave — once you carry one, the Oracle will wait for the next run.';
  document.getElementById('oracleFortuneAcceptBtn').style.display = 'inline-block';
  document.getElementById('oracleFortuneCancelBtn').textContent = '← DISCARD';
}

export function showOracleFortune() {
  // Internal-only show (called by the forecast's DRAW button + cancel/
  // accept handlers in this module). No hideAllOverlays needed because
  // the forecast already hid itself before handing off.
  _oracleFortunePick = null;
  document.getElementById('oracleFortuneReveal').style.display = 'none';
  document.getElementById('oracleFortuneReveal').innerHTML = '';
  document.getElementById('oracleFortuneSubtitle').textContent =
    'Choose a card. It will shape your next descent — you may discard it only by dying.';
  document.getElementById('oracleFortuneAcceptBtn').style.display = 'none';
  document.getElementById('oracleFortuneCancelBtn').textContent = '← NOT TODAY';
  renderOracleFortuneCards();
  oracleFortuneEl.style.display = 'flex';
  recordServiceUse('oracle');
}

document.getElementById('oracleFortuneCancelBtn').addEventListener('click', () => {
  oracleFortuneEl.style.display = 'none';
  showOracleForecast(); // return to the forecast (visually same modal family)
});
document.getElementById('oracleFortuneAcceptBtn').addEventListener('click', () => {
  if (_oracleFortunePick) {
    window.__oracleCard = _oracleFortunePick;
    // Bump the hamlet's persistent fortune counter so the Oracle's
    // milestone arc stage can unlock at 3+ draws.
    hamletState.fortunesDrawn = (hamletState.fortunesDrawn | 0) + 1;
    saveHamletState();
    tryAdvanceArc('oracle');
  }
  oracleFortuneEl.style.display = 'none';
  showOracleForecast(); // surface the carried-fortune notice
});
