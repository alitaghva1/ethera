// ============================================================================
// SMITH'S FORGE — reforge modal. The Smith accepts essence in exchange for
// "forging" a specific relic into your next descent. Pick any previously-
// discovered relic; pay by tier. A single banked heirloom persists on
// meta.heirloom until consumed at run start.
//
// Round-7 Sprint B refactor — fourth modal extraction. Simplest seam yet:
// Smith is reachable ONLY from the Smith NPC in the hamlet (no main-menu
// route), so close just hides the modal — no onClose callback injection
// needed at all. The hamlet canvas is still rendering underneath, so
// hiding returns the player exactly where they left off next to the Smith.
// ============================================================================
import { synthClick, synthChord } from '../synth.js';
import { meta, saveMeta, bankHeirloom } from '../meta.js';
import { RELIC_DEFS, ALL_RELIC_IDS, seenRelicIds } from '../relics.js';
import { images as imageCache } from '../loader.js';
import { recordServiceUse } from '../hamlet.js';

// Reforge cost by relic tier — scales with impact. Common relics are a
// cheap warm-up; legendaries are a serious essence investment.
const REFORGE_COST = { common: 40, rare: 80, legendary: 140 };

export const smithEl = document.createElement('div');
smithEl.style.cssText = 'position:absolute;inset:0;display:none;align-items:center;justify-content:safe center;flex-direction:column;background:radial-gradient(ellipse at center,#1a1008 0%,#0a0608 65%,#050308 100%);color:#ddd;pointer-events:auto;font-family:Georgia,"Cormorant Garamond",serif;padding:40px 24px;box-sizing:border-box;overflow-y:auto;';
smithEl.innerHTML = `
  <!-- Corners + vignette — shared manuscript grammar -->
  <div style="position:absolute;inset:0;background:radial-gradient(ellipse at center, transparent 28%, rgba(4,2,6,0.55) 78%, rgba(0,0,0,0.85) 100%);pointer-events:none;"></div>
  <div style="position:absolute;top:22px;left:22px;width:48px;height:48px;pointer-events:none;">
    <div style="position:absolute;top:0;left:0;width:48px;height:1px;background:linear-gradient(90deg,#ff8a60,transparent);"></div>
    <div style="position:absolute;top:0;left:0;width:1px;height:48px;background:linear-gradient(180deg,#ff8a60,transparent);"></div>
    <div style="position:absolute;top:-2px;left:-2px;width:4px;height:4px;background:#ff8a60;transform:rotate(45deg);"></div>
  </div>
  <div style="position:absolute;top:22px;right:22px;width:48px;height:48px;pointer-events:none;">
    <div style="position:absolute;top:0;right:0;width:48px;height:1px;background:linear-gradient(270deg,#ff8a60,transparent);"></div>
    <div style="position:absolute;top:0;right:0;width:1px;height:48px;background:linear-gradient(180deg,#ff8a60,transparent);"></div>
    <div style="position:absolute;top:-2px;right:-2px;width:4px;height:4px;background:#ff8a60;transform:rotate(45deg);"></div>
  </div>
  <div style="position:absolute;bottom:22px;left:22px;width:48px;height:48px;pointer-events:none;">
    <div style="position:absolute;bottom:0;left:0;width:48px;height:1px;background:linear-gradient(90deg,#ff8a60,transparent);"></div>
    <div style="position:absolute;bottom:0;left:0;width:1px;height:48px;background:linear-gradient(0deg,#ff8a60,transparent);"></div>
    <div style="position:absolute;bottom:-2px;left:-2px;width:4px;height:4px;background:#ff8a60;transform:rotate(45deg);"></div>
  </div>
  <div style="position:absolute;bottom:22px;right:22px;width:48px;height:48px;pointer-events:none;">
    <div style="position:absolute;bottom:0;right:0;width:48px;height:1px;background:linear-gradient(270deg,#ff8a60,transparent);"></div>
    <div style="position:absolute;bottom:0;right:0;width:1px;height:48px;background:linear-gradient(0deg,#ff8a60,transparent);"></div>
    <div style="position:absolute;bottom:-2px;right:-2px;width:4px;height:4px;background:#ff8a60;transform:rotate(45deg);"></div>
  </div>

  <div style="position:relative;display:flex;flex-direction:column;align-items:center;z-index:1;max-width:980px;width:100%;">
    <div style="display:flex;align-items:center;gap:22px;margin-bottom:10px;opacity:0.75;">
      <div style="width:110px;height:1px;background:linear-gradient(90deg,transparent,#ff8a60,transparent);"></div>
      <div style="color:#ff8a60;font-size:11px;letter-spacing:6px;font-style:italic;">fold your weight into steel</div>
      <div style="width:110px;height:1px;background:linear-gradient(90deg,transparent,#ff8a60,transparent);"></div>
    </div>
    <h1 style="font-size:44px;margin:0;letter-spacing:10px;color:#ffbb8a;text-shadow:0 0 18px rgba(255,140,80,0.45);font-weight:400;line-height:1;">THE FORGE</h1>

    <!-- Status bar: current essence + any banked heirloom -->
    <div style="display:flex;align-items:center;gap:24px;margin-top:16px;margin-bottom:14px;font-family:Georgia,serif;font-size:12px;letter-spacing:2px;">
      <div><span style="opacity:0.6;">ESSENCE:</span> <span id="smithEssenceVal" style="color:#a0e8ff;font-weight:bold;">0</span></div>
      <span style="width:3px;height:3px;background:#c9a86a;transform:rotate(45deg);opacity:0.5;"></span>
      <div id="smithHeirloomStatus" style="color:#ffbb8a;font-style:italic;"></div>
    </div>

    <p style="margin:0 0 22px;opacity:0.6;letter-spacing:1.5px;font-size:11px;font-style:italic;max-width:620px;text-align:center;line-height:1.55;">Bring me weight you have carried. I will fold it into something that travels with you into the next descent.</p>

    <div id="smithGrid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px;margin-bottom:22px;max-height:520px;max-width:920px;width:100%;overflow-y:auto;padding:6px;"></div>
    <button id="smithCloseBtn" style="background:transparent;color:#a97070;border:0;padding:8px 20px;font-size:11px;cursor:pointer;letter-spacing:5px;font-family:Georgia,serif;font-style:italic;font-weight:bold;transition:all 0.22s ease;opacity:0.75;">← STEP AWAY FROM THE FORGE</button>
  </div>
`;
document.getElementById('hud').appendChild(smithEl);
document.getElementById('smithCloseBtn').addEventListener('click', () => {
  try { synthClick(0.9, 0.25); } catch (_e) {}
  smithEl.style.display = 'none';
  // Smith is NPC-only (no main-menu access). Hamlet canvas is still
  // rendering underneath; hiding the modal returns the player exactly
  // where they left off next to the Smith. No re-entry needed.
});

export function showSmithModal() {
  // Caller (main.js wrapper) is responsible for hideAllOverlays before
  // this fires; the modal itself just shows + renders.
  smithEl.style.display = 'flex';
  renderSmithGrid();
}

function renderSmithGrid() {
  const grid = document.getElementById('smithGrid');
  const essEl = document.getElementById('smithEssenceVal');
  const statusEl = document.getElementById('smithHeirloomStatus');
  grid.innerHTML = '';
  if (essEl) essEl.textContent = meta.essence | 0;
  if (statusEl) {
    if (meta.heirloom) {
      const def = RELIC_DEFS[meta.heirloom];
      const name = def ? def.name : meta.heirloom;
      statusEl.innerHTML = `❦ HEIRLOOM BANKED: <span style="color:#f4d9a0;font-weight:bold;">${name}</span>`;
    } else {
      statusEl.innerHTML = '<span style="opacity:0.5;">no heirloom banked</span>';
    }
  }

  // Render all discovered relics as clickable cards; undiscovered show
  // silhouette-style locked placeholders.
  for (const id of ALL_RELIC_IDS) {
    const def = RELIC_DEFS[id];
    const seen = seenRelicIds.has(id);
    const tier = def.tier || 'common';
    const cost = REFORGE_COST[tier];
    const accent = def.tint || '#c9a86a';
    const tierColor = tier === 'legendary' ? '#e6c8ff' : tier === 'rare' ? '#ffd68a' : '#d8cfae';
    const canAfford = meta.essence >= cost;
    const isBanked = meta.heirloom === id;

    const card = document.createElement('button');
    const boxShadow = isBanked
      ? `inset 0 0 0 2px #f4d9a0, 0 0 18px rgba(244,217,160,0.55), inset 0 0 14px rgba(0,0,0,0.4)`
      : seen
        ? (canAfford
            ? `inset 0 0 0 1px ${accent}88, inset 0 0 12px rgba(0,0,0,0.4)`
            : `inset 0 0 0 1px rgba(80,60,44,0.6), inset 0 0 12px rgba(0,0,0,0.45)`)
        : `inset 0 0 0 1px rgba(60,44,32,0.4), inset 0 0 12px rgba(0,0,0,0.5)`;
    card.style.cssText = `
      background: linear-gradient(180deg, rgba(24,18,14,0.9), rgba(12,8,6,0.95));
      border: 0;
      padding: 12px 10px;
      cursor: ${(seen && (canAfford || isBanked)) ? 'pointer' : 'default'};
      font-family: Georgia, serif;
      text-align: center;
      opacity: ${seen ? (canAfford || isBanked ? 1 : 0.55) : 0.35};
      box-shadow: ${boxShadow};
      transition: all 0.2s ease;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
    `;
    if (seen && (canAfford || isBanked)) {
      card.onmouseenter = () => { card.style.transform = 'translateY(-2px)'; card.style.boxShadow = `inset 0 0 0 1px ${accent}, 0 0 16px ${accent}55, inset 0 0 12px rgba(0,0,0,0.4)`; };
      card.onmouseleave = () => { card.style.transform = ''; renderSmithGrid(); };
    }

    // Icon (use the loaded relic PNG)
    const img = imageCache[def.icon];
    const iconHtml = seen && img
      ? `<img src="${img.src}" style="width:56px;height:56px;image-rendering:pixelated;image-rendering:crisp-edges;filter:drop-shadow(0 0 8px ${accent}55);"/>`
      : `<div style="width:56px;height:56px;display:flex;align-items:center;justify-content:center;color:rgba(80,60,44,0.7);font-size:28px;font-weight:bold;">?</div>`;
    const name = seen ? def.name : '???';
    const tierLabel = seen ? tier.toUpperCase() : 'LOCKED';
    const costLabel = isBanked
      ? 'CURRENT'
      : seen
        ? `${cost} ✨`
        : 'find in a run';

    card.innerHTML = `
      ${iconHtml}
      <div style="color:${seen ? accent : '#4a3c28'};font-size:11px;letter-spacing:1.5px;font-weight:bold;${seen ? `text-shadow:0 0 6px ${accent}44;` : ''}">${name}</div>
      <div style="color:${seen ? tierColor : '#4a3c28'};font-size:8px;letter-spacing:3px;opacity:0.75;">${tierLabel}</div>
      <div style="color:${isBanked ? '#f4d9a0' : canAfford ? '#a0e8ff' : '#6a5c48'};font-size:10px;letter-spacing:2px;font-weight:bold;margin-top:2px;">${costLabel}</div>
    `;
    if (seen && canAfford && !isBanked) {
      card.onclick = () => {
        // Confirm for legendary purchases (high cost)
        if (tier === 'legendary') {
          const ok = confirm(`Forge ${def.name} as your heirloom?\n\nCost: ${cost} essence.`);
          if (!ok) return;
        }
        if (bankHeirloom(id, cost)) {
          // Advance the Smith's arc on a successful reforge
          recordServiceUse('smith');
          renderSmithGrid();
          try { synthChord(440, 0.6, 0.7); } catch (e) {}
        }
      };
    } else if (seen && isBanked) {
      card.onclick = () => {
        // Already banked — click to cancel and refund
        const ok = confirm(`Cancel this heirloom and refund ${cost} essence?`);
        if (!ok) return;
        meta.essence += cost;
        meta.heirloom = null;
        saveMeta();
        renderSmithGrid();
      };
    }
    grid.appendChild(card);
  }
}
