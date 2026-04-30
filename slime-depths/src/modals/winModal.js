// ============================================================================
// FLOOR-CLEAR / VICTORY + SHOP MODAL — between-floor transition screen.
// Shows the cleared-floor banner, opens a 4-card shop (3 relics + 1 heal
// service), and offers the DESCEND button to step into the next floor.
// On the final floor's clear, main.js routes to playEpilogue +
// showEndOfRun instead — the win modal isn't shown for victory.
//
// Round-7 Sprint B refactor — twelfth modal extraction. Single seam:
// onRestart callback (main.js decides startRun vs beginNextFloor based
// on currentFloorLevel >= MAX_FLOORS). Exports winEl for the dozen
// visibility-check + reset-on-startRun call sites scattered across
// main.js, plus setupShop (called when entering between-floor flow)
// and hideShop (preemptive cleanup on the final-floor branch).
// ============================================================================
import { WIN_SCREEN_HTML } from '../winScreen.js';
import { synthPing, synthChord } from '../synth.js';
import { gold } from '../gold.js';
import { applyRelic, rollRelicOffer } from '../relics.js';
import { hero } from '../hero.js';
import { hueRotateForTint } from '../fx.js';

export const winEl = document.createElement('div');
// Between-floor / victory screen — `safe center` keeps content centered
// when it fits, and anchors-to-start (no clip-both-ends) when it doesn't.
// overflow-y:auto handles tall shop rows. Same pattern as deathEl.
winEl.style.cssText =
  'position:absolute;inset:0;display:none;align-items:center;justify-content:safe center;flex-direction:column;background:radial-gradient(ellipse at center,#140a18 0%,#0a0610 65%,#050308 100%);color:#ddd;pointer-events:auto;font-family:Georgia,"Cormorant Garamond",serif;padding:24px;box-sizing:border-box;overflow-y:auto;';
winEl.innerHTML = WIN_SCREEN_HTML;
document.getElementById('hud').appendChild(winEl);

// onRestart injected by main.js — caller decides whether to startRun()
// (post-final-floor restart edge case) or beginNextFloor() based on
// the currentFloorLevel module-scoped variable.
let _onRestart = null;
export function setWinOnRestart(fn) {
  _onRestart = fn;
}

document.getElementById('winRestartBtn').addEventListener('click', () => {
  if (_onRestart) _onRestart();
});

// Populate shop with 3 relic offers + 1 heal. Prices scale by floor level.
// Cards reveal with staggered animation. Caller passes the current
// floorLevel since main.js owns that state.
export function setupShop(floorLevel) {
  const shopRow = document.getElementById('shopRow');
  const shopGold = document.getElementById('shopGold');
  const shopHeader = document.getElementById('shopHeader');
  shopRow.innerHTML = '';
  shopRow.style.display = 'flex';
  shopGold.style.display = 'block';
  if (shopHeader) shopHeader.style.display = 'block';

  const priceFloor = 40 + floorLevel * 10;
  const offers = rollRelicOffer(3, floorLevel);
  let idx = 0;
  for (const offer of offers) {
    const price = priceFloor + Math.floor(Math.random() * 30);
    const tier = offer.tier || 'common';
    shopRow.appendChild(
      makeShopCard({
        tint: offer.tint,
        iconKey: offer.icon,
        name: offer.name,
        desc: offer.desc,
        flavor: offer.flavor,
        price,
        tier,
        staggerIndex: idx++,
        onBuy: () => {
          applyRelic(offer.id);
        },
      })
    );
  }
  // Heal card — distinct green accent
  shopRow.appendChild(
    makeShopCard({
      tint: '#86e3a8',
      iconKey: 'relic_max_hp',
      name: 'Healing Spring',
      desc: 'Restore full HP',
      flavor: 'Water remembers the wounded. Drink, and be forgiven.',
      price: 30 + floorLevel * 10,
      tier: 'service',
      staggerIndex: idx++,
      onBuy: () => {
        hero.hp = hero.maxHp;
      },
    })
  );

  refreshShopGoldState();
}

function makeShopCard({ tint, iconKey, name, desc, flavor, price, tier, staggerIndex, onBuy }) {
  const card = document.createElement('div');
  // Tier-colored frame with gradient depth, drop shadow, and staggered slide-in
  const isLegendary = tier === 'legendary';
  const isRare = tier === 'rare';
  const isService = tier === 'service';
  const frameGlow = isLegendary
    ? '0 0 28px rgba(255,200,255,0.55)'
    : isRare
      ? '0 0 22px rgba(244,217,160,0.45)'
      : isService
        ? '0 0 18px rgba(134,227,168,0.4)'
        : `0 0 14px ${tint}55`;
  const tierLabel = isLegendary
    ? '★ LEGENDARY'
    : isRare
      ? '◆ RARE'
      : isService
        ? '† SERVICE'
        : '· COMMON';
  const staggerDelay = 0.5 + (staggerIndex || 0) * 0.12;
  card.style.cssText = `
    position:relative;
    width:210px;
    background:linear-gradient(180deg,rgba(40,28,48,0.95),rgba(18,10,22,0.95));
    border:2px solid ${tint};
    padding:16px 14px;
    display:flex;flex-direction:column;align-items:center;gap:7px;
    box-shadow:${frameGlow},0 4px 16px rgba(0,0,0,0.4);
    font-family:Georgia,serif;
    transition:transform 0.2s ease, box-shadow 0.2s ease;
    animation:winCardSlide 0.5s ease-out ${staggerDelay}s both;
  `;
  card.innerHTML = `
    <div style="font-size:9px;letter-spacing:3px;color:${tint};opacity:0.8;font-weight:bold;">${tierLabel}</div>
    <div style="padding:6px;background:radial-gradient(circle,${tint}33,transparent 70%);">
      <img src="assets/icons/${iconKey}.png" style="width:44px;height:44px;image-rendering:pixelated;filter:hue-rotate(${hueRotateForTint(tint)}deg) saturate(1.15) drop-shadow(0 0 6px ${tint}88);" />
    </div>
    <div style="font-weight:bold;font-size:15px;color:${tint};letter-spacing:1px;text-align:center;text-shadow:0 0 6px ${tint}44;">${name}</div>
    ${flavor ? `<div style="font-size:10px;color:rgba(200,190,210,0.75);text-align:center;line-height:1.35;font-style:italic;min-height:26px;padding:0 2px;">${flavor}</div>` : ''}
    <div style="height:1px;width:70%;background:linear-gradient(90deg,transparent,${tint}aa,transparent);margin:2px 0;"></div>
    <div style="font-size:11px;color:${tint};text-align:center;min-height:26px;line-height:1.35;font-weight:bold;">${desc}</div>
    <div style="height:1px;width:100%;background:linear-gradient(90deg,transparent,${tint}88,transparent);margin:2px 0;"></div>
    <div style="font-size:18px;color:#ffd68a;text-shadow:0 0 8px rgba(255,214,138,0.4);">🪙 ${price}</div>
    <button class="buyBtn" style="background:linear-gradient(180deg,${tint},${darkenHex(tint, 0.65)});color:#1a1220;border:0;padding:8px 22px;cursor:pointer;font-weight:bold;letter-spacing:2px;font-size:12px;font-family:Georgia,serif;transition:transform 0.15s ease, box-shadow 0.15s ease;">CLAIM</button>
  `;
  const btn = card.querySelector('.buyBtn');
  btn.dataset.price = price;
  btn.addEventListener('click', () => {
    if (btn.disabled) return;
    if (gold.total < price) return;
    gold.total -= price;
    onBuy();
    btn.textContent = '✓ CLAIMED';
    btn.disabled = true;
    btn.style.opacity = '0.55';
    btn.style.cursor = 'default';
    card.style.opacity = '0.7';
    // Purchase sparkle feedback
    try {
      card.style.boxShadow = `0 0 32px ${tint}, 0 0 64px ${tint}88`;
      setTimeout(() => {
        card.style.boxShadow = '0 4px 16px rgba(0,0,0,0.4)';
      }, 500);
      synthPing(1100, 0.9, 0.3);
      synthChord(523, 0.7, 0.6);
    } catch (_e) {}
    refreshShopGoldState();
  });
  return card;
}

// Small helper — darken a hex color for gradient button shadow
function darkenHex(hex, factor = 0.6) {
  if (!hex || !hex.startsWith('#')) return '#1a1220';
  const h =
    hex.length === 4
      ? hex
          .slice(1)
          .split('')
          .map((c) => c + c)
          .join('')
      : hex.slice(1);
  const n = parseInt(h, 16);
  const r = Math.floor(((n >> 16) & 255) * factor);
  const g = Math.floor(((n >> 8) & 255) * factor);
  const b = Math.floor((n & 255) * factor);
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

function refreshShopGoldState() {
  document.getElementById('shopGoldAmount').textContent = gold.total;
  for (const btn of document.querySelectorAll('#shopRow .buyBtn')) {
    if (btn.disabled) continue;
    const p = +btn.dataset.price;
    if (gold.total < p) {
      btn.style.opacity = '0.35';
      btn.style.cursor = 'not-allowed';
      btn.style.filter = 'grayscale(0.7)';
    } else {
      btn.style.opacity = '1';
      btn.style.cursor = 'pointer';
      btn.style.filter = 'none';
    }
  }
}

// Preemptive cleanup — called by the final-floor branch in openFloorUi
// before showEndOfRun. The shop row + gold readout get hidden so any
// later viewer of winEl (debug reopen, edge-case re-show) doesn't see
// a stale shop layout.
export function hideShop() {
  document.getElementById('shopRow').style.display = 'none';
  document.getElementById('shopGold').style.display = 'none';
}
