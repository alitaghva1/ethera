// ============================================================================
// CHRONICLES MODAL — codex of the run. Four tabs in one frame:
//   Deeds      — achievements (★/☆ + name + desc, locked-state dimmed)
//   Bestiary   — every enemy type, boss portraits where the player has
//                killed the boss, silhouetted thumbs for unseen species
//   Relicpedia — every relic on a dense 10-col tile grid, locked tiles
//                silhouetted; hover tooltip shows name+flavor+desc
//   Fusions    — every fusion with composed thumb + recipe; locked
//                fusions show a hover tooltip "combine X + Y"
//
// Round-7 Sprint B refactor — tenth modal extraction. Single onClose
// seam (menu-only modal, no NPC entry). Tab state + chronCard +
// chronTile helpers + ENEMY_PORTRAIT_PATH constant all live in this
// module — chronCard/chronTile have no callers outside the chronicles
// render. ENEMY_PORTRAIT_PATH is re-exported for one debug-hook caller
// in main.js (__testBossIntro returns the portrait key in its result).
// ============================================================================
import { synthClick } from '../synth.js';
import { ACHIEVEMENTS, ACH_IDS, totalUnlocked, isUnlocked } from '../achievements.js';
import { TYPES as ENEMY_TYPES, seenEnemyTypes } from '../enemies.js';
import { ruin } from '../ruin.js';
import { RELIC_DEFS, ALL_RELIC_IDS, seenRelicIds } from '../relics.js';
import { FUSIONS, discoveredFusions } from '../fusions.js';
import { images as imageCache } from '../loader.js';
import { composeRelicThumbDataURL, composeEnemyThumbDataURL } from '../fx.js';

// Boss portrait paths — used by the Bestiary tab to show hand-drawn portraits
// instead of pixel-sprite thumbnails for defeated bosses. If a key is present
// here, that enemy is treated as a boss for bestiary purposes (its "seen"
// state comes from ruin.bossKills, not seenEnemyTypes).
//
// Re-exported because main.js's __testBossIntro debug hook returns the
// portrait path in its result blob.
export const ENEMY_PORTRAIT_PATH = {
  orc: 'assets/enemies/portrait_grudnok.png',
  bone_captain: 'assets/enemies/portrait_iron_revenant.png',
  broodmother: 'assets/enemies/portrait_broodmother.png',
  ember_tyrant: 'assets/enemies/portrait_ember_tyrant.png',
  echo: 'assets/enemies/portrait_echo_of_self.png',
  hermit: 'assets/enemies/portrait_hermit.png', // floor-4 mini-boss
};

export const achEl = document.createElement('div');
achEl.style.cssText =
  'position:absolute;inset:0;display:none;align-items:center;justify-content:safe center;flex-direction:column;background:radial-gradient(ellipse at center,#140a18 0%,#0a0610 65%,#050308 100%);color:#ddd;pointer-events:auto;font-family:Georgia,"Cormorant Garamond",serif;padding:40px 24px;box-sizing:border-box;overflow-y:auto;';
achEl.innerHTML = `
  <!-- Deep vignette + page-frame corners (shared discipline). -->
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
    <!-- Title block compressed: h1 48->32, ornament 100->80, gaps tightened
         so the content grid below has more breathing room within 720
         design height. -->
    <div style="display:flex;align-items:center;gap:18px;margin-bottom:4px;opacity:0.75;">
      <div style="width:80px;height:1px;background:linear-gradient(90deg,transparent,#c9a86a,transparent);"></div>
      <div style="color:#c9a86a;font-size:10px;letter-spacing:5px;font-style:italic;">deeds remembered</div>
      <div style="width:80px;height:1px;background:linear-gradient(90deg,transparent,#c9a86a,transparent);"></div>
    </div>
    <h1 style="font-size:32px;margin:0;letter-spacing:9px;color:#f4d9a0;text-shadow:0 0 18px rgba(244,217,160,0.45);font-weight:400;line-height:1;">CHRONICLES</h1>
    <div style="display:flex;align-items:center;gap:10px;margin:6px 0 8px;opacity:0.65;">
      <span style="width:3px;height:3px;background:#c9a86a;transform:rotate(45deg);"></span>
      <p id="achProgress" style="margin:0;letter-spacing:4px;font-size:11px;font-style:italic;color:#d8cfae;"></p>
      <span style="width:3px;height:3px;background:#c9a86a;transform:rotate(45deg);"></span>
    </div>
    <!-- Tab row — four codex sections. Active tab is gold filled, others muted. -->
    <div style="display:flex;gap:4px;margin-bottom:10px;">
      <button class="chronTab" data-tab="achievements" style="background:transparent;border:0;padding:5px 14px;cursor:pointer;color:#c9a86a;font-family:Georgia,serif;font-size:10px;letter-spacing:3px;font-weight:bold;transition:all 0.2s ease;text-transform:uppercase;">Deeds</button>
      <span style="opacity:0.3;color:#c9a86a;font-size:10px;align-self:center;">◆</span>
      <button class="chronTab" data-tab="bestiary" style="background:transparent;border:0;padding:5px 14px;cursor:pointer;color:#6a5c48;font-family:Georgia,serif;font-size:10px;letter-spacing:3px;font-weight:bold;transition:all 0.2s ease;text-transform:uppercase;">Bestiary</button>
      <span style="opacity:0.3;color:#c9a86a;font-size:10px;align-self:center;">◆</span>
      <button class="chronTab" data-tab="relics" style="background:transparent;border:0;padding:5px 14px;cursor:pointer;color:#6a5c48;font-family:Georgia,serif;font-size:10px;letter-spacing:3px;font-weight:bold;transition:all 0.2s ease;text-transform:uppercase;">Relicpedia</button>
      <span style="opacity:0.3;color:#c9a86a;font-size:10px;align-self:center;">◆</span>
      <button class="chronTab" data-tab="fusions" style="background:transparent;border:0;padding:5px 14px;cursor:pointer;color:#6a5c48;font-family:Georgia,serif;font-size:10px;letter-spacing:3px;font-weight:bold;transition:all 0.2s ease;text-transform:uppercase;">Fusions</button>
    </div>
    <!-- Shared content grid — repopulated per tab. -->
    <div id="achRow" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px;margin-bottom:14px;max-width:920px;width:100%;padding:4px;"></div>
    <button id="achCloseBtn" style="background:transparent;color:#8a4848;border:0;padding:8px 20px;font-size:11px;cursor:pointer;letter-spacing:5px;font-family:Georgia,serif;font-style:italic;font-weight:bold;transition:all 0.22s ease;opacity:0.75;">← RETURN</button>
  </div>
`;
document.getElementById('hud').appendChild(achEl);

// onClose injected by main.js — restores the main menu. Chronicles is
// menu-only (no NPC entry, no in-run path).
let _onClose = null;
export function setAchievementsOnClose(fn) {
  _onClose = fn;
}

document.getElementById('achCloseBtn').addEventListener('click', () => {
  try {
    synthClick(0.9, 0.25);
  } catch (_e) {}
  achEl.style.display = 'none';
  if (_onClose) _onClose();
});

// Current tab state. Persists within a session so the player can close
// and re-open without losing their spot.
let chronTab = 'achievements';

// Wire tab clicks once the modal element is in the DOM.
document.querySelectorAll('#achEl .chronTab, .chronTab').forEach((btn) => {
  btn.addEventListener('click', () => {
    chronTab = btn.dataset.tab;
    renderChroniclesTab();
  });
});

export function showAchievementsModal() {
  // Caller (main.js wrapper) is responsible for hideAllOverlays before
  // this fires; the modal itself just shows + renders the active tab.
  achEl.style.display = 'flex';
  renderChroniclesTab();
}

// Card builder — unified grammar for every tab. `locked` dims + italicizes;
// `seen` gold-glows + shows full text. Optional `thumb` (data URL) shows the
// composed icon/sprite at top-left with a tint-colored halo. `silhouette:true`
// darkens the thumbnail for "undiscovered" visual cue.
function chronCard({ title, body, locked, accentColor, icon, thumb, silhouette, tooltip }) {
  const card = document.createElement('div');
  const border = locked
    ? 'rgba(80,60,40,0.3)'
    : accentColor
      ? accentColor + '88'
      : 'rgba(201,168,106,0.55)';
  const glow = locked
    ? ''
    : `, 0 0 14px ${accentColor ? accentColor + '33' : 'rgba(201,168,106,0.12)'}`;
  // Tightened from 12/14 padding + 52px thumb + 14/11 fonts to 7/9 padding +
  // 40px thumb + 12/10 fonts so the chronicles grid fits more cards per
  // viewport. With 5 cols of 180-px cards × 6 rows, all 28 fusions/relics
  // become visible without scrolling instead of 4 cols × 7 rows + scroll.
  card.style.cssText = `
    background:linear-gradient(180deg,rgba(30,22,16,0.85),rgba(14,10,8,0.88));
    padding:7px 9px;
    display:flex;${thumb ? 'flex-direction:row;align-items:flex-start;gap:8px;' : 'flex-direction:column;gap:3px;'}
    font-family:Georgia,serif;
    box-shadow:inset 0 0 0 1px ${border}, inset 0 0 12px rgba(0,0,0,0.5)${glow};
    ${locked ? 'opacity:0.55;' : ''}
  `;
  // Optional native tooltip — used by undiscovered fusions/relics so the
  // recipe / hint text moves OUT of the card body and into a hover popup.
  // Keeps the card visually compact while preserving the lookup info.
  if (tooltip) card.title = tooltip;
  const titleColor = locked ? '#7a7060' : accentColor || '#f4d9a0';
  const titleShadow = locked
    ? 'none'
    : `0 0 6px ${accentColor ? accentColor + '55' : 'rgba(244,217,160,0.3)'}`;
  const bodyColor = locked ? 'rgba(140,130,110,0.7)' : 'rgba(200,190,170,0.85)';
  // Optional thumbnail column
  const thumbBg = locked
    ? 'radial-gradient(circle,rgba(80,60,40,0.25),transparent 70%)'
    : `radial-gradient(circle,${accentColor || '#c9a86a'}33,transparent 70%)`;
  const thumbFilter = silhouette ? 'brightness(0) contrast(0.4)' : 'none';
  const thumbHtml = thumb
    ? `
    <div style="flex-shrink:0;width:40px;height:40px;display:flex;align-items:center;justify-content:center;background:${thumbBg};">
      <img src="${thumb}" style="width:36px;height:36px;image-rendering:pixelated;filter:${thumbFilter};" alt="" />
    </div>
  `
    : '';
  const textBlock = `
    <div style="flex:1;display:flex;flex-direction:column;gap:2px;min-width:0;">
      <div style="font-size:12px;font-weight:bold;color:${titleColor};letter-spacing:0.8px;text-shadow:${titleShadow};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${icon || ''}${title}</div>
      ${body ? `<div style="font-size:10px;color:${bodyColor};line-height:1.3;font-style:italic;">${body}</div>` : ''}
    </div>
  `;
  card.innerHTML = thumbHtml + textBlock;
  return card;
}

// Compact icon tile — used by the Relics tab where we have ~50 items
// to display. The card-style chronCard layout doesn't scale that
// densely; even at 4 cols x ~50px height the grid runs ~13 rows tall
// and breaks past the 720 design height. The tile shows ONLY the icon
// (silhouetted when locked) with the name as a small label below;
// flavor + desc surface on hover via the title attribute. Click could
// later expand into a detail panel; for now hover serves the lookup
// affordance.
function chronTile({ title, locked, accentColor, thumb, silhouette, tooltip }) {
  const tile = document.createElement('div');
  const border = locked
    ? 'rgba(80,60,40,0.3)'
    : accentColor
      ? accentColor + '88'
      : 'rgba(201,168,106,0.55)';
  const glow = locked
    ? ''
    : `, 0 0 12px ${accentColor ? accentColor + '33' : 'rgba(201,168,106,0.12)'}`;
  // Pure ICON tile — no inline name. With 50+ relics in a 10-col grid,
  // each tile is ~52 design px — too small for a readable name without
  // wrapping/clipping. Hover tooltip carries the full name + flavor +
  // desc instead. The icon's silhouette + tier-color border + (when
  // discovered) tier-tinted glow are enough to identify the relic at
  // a glance for players who already know the roster.
  tile.style.cssText = `
    width:52px;height:52px;
    background:linear-gradient(180deg,rgba(30,22,16,0.85),rgba(14,10,8,0.88));
    display:flex;align-items:center;justify-content:center;
    font-family:Georgia,serif;
    box-shadow:inset 0 0 0 1px ${border}, inset 0 0 8px rgba(0,0,0,0.5)${glow};
    box-sizing:border-box;
    ${locked ? 'opacity:0.55;' : ''}
    cursor:default;
    transition:transform 0.15s ease, box-shadow 0.15s ease;
  `;
  if (tooltip) tile.title = tooltip;
  const thumbBg = locked
    ? 'radial-gradient(circle,rgba(80,60,40,0.25),transparent 70%)'
    : `radial-gradient(circle,${accentColor || '#c9a86a'}33,transparent 70%)`;
  const thumbFilter = silhouette ? 'brightness(0) contrast(0.4)' : 'none';
  tile.innerHTML = thumb
    ? `
    <div style="width:40px;height:40px;display:flex;align-items:center;justify-content:center;background:${thumbBg};">
      <img src="${thumb}" style="width:36px;height:36px;image-rendering:pixelated;filter:${thumbFilter};" alt="" />
    </div>
  `
    : `<div style="width:40px;height:40px;background:${thumbBg};"></div>`;
  if (!locked) {
    tile.addEventListener('mouseenter', () => {
      tile.style.transform = 'translateY(-1px)';
      tile.style.boxShadow = `inset 0 0 0 1px ${accentColor || '#c9a86a'}, 0 0 16px ${accentColor ? accentColor + '55' : 'rgba(201,168,106,0.3)'}`;
    });
    tile.addEventListener('mouseleave', () => {
      tile.style.transform = 'translateY(0)';
      tile.style.boxShadow = `inset 0 0 0 1px ${border}, inset 0 0 8px rgba(0,0,0,0.5)${glow}`;
    });
  }
  return tile;
}

function renderChroniclesTab() {
  // Sync tab highlight — active is filled gold, others are muted
  const tabs = document.querySelectorAll('.chronTab');
  tabs.forEach((t) => {
    const active = t.dataset.tab === chronTab;
    t.style.background = active
      ? 'linear-gradient(180deg,rgba(58,42,32,0.9),rgba(30,20,12,0.9))'
      : 'transparent';
    t.style.color = active ? '#f4d9a0' : '#6a5c48';
    t.style.boxShadow = active
      ? 'inset 0 0 0 1px #c9a86a, 0 0 10px rgba(201,168,106,0.3)'
      : 'none';
    t.style.textShadow = active ? '0 0 6px rgba(244,217,160,0.4)' : 'none';
  });
  const row = document.getElementById('achRow');
  const progress = document.getElementById('achProgress');
  row.innerHTML = '';
  // Per-tab grid layout — relics use a denser ICON GRID (8 cols of
  // ~75px square tiles) since there are 50+ items; the other tabs
  // keep the wider card layout (auto-fill minmax 220px) since they
  // have fewer items and benefit from inline body text.
  if (chronTab === 'relics') {
    // 10 cols of 52px tiles + 9 × 4px gaps = 556px wide. Fits 50-60
    // relics in 6 rows × 52 = 312 design px tall — comfortable margin
    // under the 720 design height after title + tabs + button.
    row.style.gridTemplateColumns = 'repeat(10, 52px)';
    row.style.gap = '4px';
    row.style.maxWidth = '600px';
    row.style.justifyContent = 'center';
  } else {
    row.style.gridTemplateColumns = 'repeat(auto-fill, minmax(220px, 1fr))';
    row.style.gap = '8px';
    row.style.maxWidth = '920px';
    row.style.justifyContent = 'normal';
  }

  if (chronTab === 'achievements') {
    for (const id of ACH_IDS) {
      const a = ACHIEVEMENTS[id];
      const unlocked = isUnlocked(id);
      row.appendChild(
        chronCard({
          title: a.name,
          body: a.desc,
          locked: !unlocked,
          icon: unlocked ? '★ ' : '☆ ',
        })
      );
    }
    progress.textContent = `${totalUnlocked()} of ${ACH_IDS.length} deeds earned`;
  } else if (chronTab === 'bestiary') {
    // Enemies — show ALL types with thumbnails. Regular enemies use idle
    // sprite frame 0 (composed with tint filter). BOSSES use the hand-
    // drawn portrait PNG if the player has defeated them.
    // Bosses aren't in seenEnemyTypes (they're excluded from auto-register
    // in enemies.js) — we use ruin.bossKills instead to decide "seen".
    const typeIds = Object.keys(ENEMY_TYPES);
    const bossKilled = new Set((ruin.bossKills || []).map((k) => k.bossType));
    let seenN = 0;
    for (const id of typeIds) {
      const def = ENEMY_TYPES[id];
      const portraitUrl = ENEMY_PORTRAIT_PATH[id];
      const isBoss = !!portraitUrl;
      const seen = isBoss ? bossKilled.has(id) : seenEnemyTypes.has(id);
      if (seen) seenN++;
      const name = seen ? def.displayName || id.toUpperCase() : '???';
      // Locked: NO body, hint moves to hover tooltip — same compression
      // pass as relics + fusions tabs. "???" title + silhouetted thumb
      // already convey "undiscovered" without consuming card height.
      const body = seen ? def.flavor || '' : '';
      const tooltipE = seen
        ? null
        : 'undiscovered — meet this adversary in the ruin to learn its nature';
      let thumb = null;
      if (isBoss && portraitUrl) {
        // Boss: use the hand-drawn portrait directly (already a PNG)
        thumb = portraitUrl;
      } else {
        // Regular enemy: compose from idle sprite frame 0
        const spriteKey = (def.prefix || '') + 'idle';
        const spriteImg = imageCache[spriteKey];
        if (spriteImg) thumb = composeEnemyThumbDataURL(def, spriteImg, 48);
      }
      row.appendChild(
        chronCard({
          title: name,
          body: body,
          locked: !seen,
          accentColor: seen ? def.color || '#c9a86a' : null,
          icon: '',
          thumb,
          silhouette: !seen,
          tooltip: tooltipE,
        })
      );
    }
    progress.textContent = `${seenN} of ${typeIds.length} adversaries catalogued`;
  } else if (chronTab === 'relics') {
    // Relics — show all with composed thumbnails (tint + glyph). Locked ones
    // show a silhouette so the shape hints at type without revealing details.
    let seenN = 0;
    for (const id of ALL_RELIC_IDS) {
      const def = RELIC_DEFS[id];
      const seen = seenRelicIds.has(id);
      if (seen) seenN++;
      const name = seen ? def.name : '???';
      // ICON GRID layout — body text moves to hover tooltip below.
      // Locked-state hint moved to hover tooltip — kept the prompt info
      // but stopped the verbose "undiscovered..." line bloating cards.
      // Tooltip — for seen relics combines name + flavor + desc; for
      // locked, generic prompt. Native title attribute = browser
      // tooltip on hover, no extra UI cost.
      const tooltipR = seen
        ? `${def.name}${def.flavor ? '\n' + def.flavor : ''}${def.desc ? '\n\n' + def.desc : ''}`
        : 'undiscovered — a relic you have yet to claim';
      // Dedicated per-relic art — bypass glyph/hue overlay (pass null,null).
      const baseImg = imageCache[def.icon];
      const thumb = baseImg ? composeRelicThumbDataURL(baseImg, null, null, id, 48) : null;
      row.appendChild(
        chronTile({
          title: name,
          locked: !seen,
          accentColor: seen ? def.tint || '#c9a86a' : null,
          thumb,
          silhouette: !seen,
          tooltip: tooltipR,
        })
      );
    }
    progress.textContent = `${seenN} of ${ALL_RELIC_IDS.length} relics recovered`;
  } else if (chronTab === 'fusions') {
    // Fusions — show all with the COMPONENTS' icons as a small paired thumb.
    const ids = Object.keys(FUSIONS);
    let seenN = 0;
    for (const id of ids) {
      const f = FUSIONS[id];
      const seen = discoveredFusions.has(id);
      if (seen) seenN++;
      const compNames = f.components
        .map((cid) => {
          const d = RELIC_DEFS[cid];
          return d ? d.name : cid;
        })
        .join(' + ');
      const name = seen ? f.name : '???';
      // Discovered: rich body (flavor + effect + recipe). Locked: NO
      // body — the verbose "undiscovered — combine X + Y to form this
      // fusion" used 3-4 lines per card and bloated the grid. The
      // recipe moves to a hover tooltip; the title "???" + silhouetted
      // thumb already say "undiscovered" without the prose.
      const body = seen
        ? `<div style="font-style:italic;margin-bottom:3px;color:rgba(200,190,170,0.75);">${f.flavor || ''}</div><div style="font-style:normal;color:${f.tint || '#c9a86a'};font-weight:bold;margin-bottom:3px;">${f.desc}</div><div style="font-style:normal;color:rgba(160,148,130,0.7);font-size:10px;letter-spacing:1px;">${compNames}</div>`
        : '';
      const tooltipF = seen ? null : `combine ${compNames}`;
      // Fusion thumb — the fusion now has its own dedicated icon (Nano Banana
      // hand-drawn). Fall back to component-composed icon only if the PNG
      // didn't load for some reason.
      const fusionImg = imageCache[f.icon];
      let thumb = null;
      if (fusionImg) {
        thumb = fusionImg.src; // direct path to the PNG
      } else {
        const firstComp = RELIC_DEFS[f.components[0]];
        const baseImg = firstComp ? imageCache[firstComp.icon] : null;
        if (baseImg) thumb = composeRelicThumbDataURL(baseImg, 'star', f.tint, 'fusion_' + id, 48);
      }
      row.appendChild(
        chronCard({
          title: name,
          body: body,
          locked: !seen,
          accentColor: seen ? f.tint || '#c9a86a' : null,
          icon: '',
          thumb,
          silhouette: !seen,
          tooltip: tooltipF,
        })
      );
    }
    progress.textContent = `${seenN} of ${ids.length} fusions discovered`;
  }
}
