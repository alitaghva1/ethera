// ============================================================================
// DEATH / VICTORY SCREEN TEMPLATE — static HTML only
//
// Extracted from main.js as part of review #4 (main.js split, pass 2).
// This module owns ONLY the markup; main.js keeps the setup, event wiring
// (restart button → startRun), and the data-filling functions that
// populate #endStats / #endRelics / #endEssence / etc. at run-end.
//
// IDs preserved verbatim so main.js's getElementById() calls keep working
// unchanged. Animation names (winFadeIn, winCardSlide) live in index.html's
// <style> block.
// ============================================================================

// Corner ornament helper — reduces the 4 near-identical corner blocks to one
// function call each. Preserves the exact visual of the original inline HTML.
function cornerOrnament(position) {
  // position: 'tl' | 'tr' | 'bl' | 'br'
  const isTop = position[0] === 't';
  const isLeft = position[1] === 'l';
  const vSide = isTop ? 'top' : 'bottom';
  const hSide = isLeft ? 'left' : 'right';
  const hGrad = isLeft ? '90deg' : '270deg';
  const vGrad = isTop ? '180deg' : '0deg';
  return `
  <div style="position:absolute;${vSide}:22px;${hSide}:22px;width:48px;height:48px;pointer-events:none;animation:winFadeIn 0.7s ease-out both;">
    <div style="position:absolute;${vSide}:0;${hSide}:0;width:48px;height:1px;background:linear-gradient(${hGrad},#c9a86a,transparent);"></div>
    <div style="position:absolute;${vSide}:0;${hSide}:0;width:1px;height:48px;background:linear-gradient(${vGrad},#c9a86a,transparent);"></div>
    <div style="position:absolute;${vSide}:-2px;${hSide}:-2px;width:4px;height:4px;background:#c9a86a;transform:rotate(45deg);"></div>
  </div>`;
}

export const DEATH_SCREEN_HTML = `
  <!-- Deep vignette + page-frame corners (shared discipline). These stay
       OUTSIDE the responsive scale wrapper so the corner flourishes hug
       the actual viewport edge regardless of viewport size. -->
  <div style="position:absolute;inset:0;background:radial-gradient(ellipse at center, transparent 28%, rgba(4,2,6,0.55) 78%, rgba(0,0,0,0.85) 100%);pointer-events:none;"></div>
  ${cornerOrnament('tl')}
  ${cornerOrnament('tr')}
  ${cornerOrnament('bl')}
  ${cornerOrnament('br')}

  <!-- Responsive scale wrapper — uses the same .menuContent class as the
       main menu so the @media transform:scale rules at 900/600/450
       breakpoints apply uniformly to the death screen content too.
       Without this, on a narrow viewport the YOU DIED title (56px) +
       the stats grid + relics row + near-miss strip overflow the
       CSS-shrunk canvas. The wrapper itself is a flex column so the
       children keep the same vertical layout #deathScreen would give
       them as direct children. -->
  <div class="menuContent" style="display:flex;flex-direction:column;align-items:center;position:relative;z-index:1;">

  <!-- Ornamental frame above the title — color set per result (death/victory)
       by showEndOfRun. Crimson-on-death, gold-on-victory. -->
  <div id="endOrnament" style="display:flex;align-items:center;gap:22px;margin-bottom:10px;opacity:0.8;animation:winFadeIn 0.7s ease-out;position:relative;z-index:1;">
    <div id="endOrnamentLineL" style="width:100px;height:1px;background:linear-gradient(90deg,transparent,#b05858,transparent);"></div>
    <div id="endOrnamentText" style="color:#d88080;font-size:11px;letter-spacing:6px;font-style:italic;">your story ends here</div>
    <div id="endOrnamentLineR" style="width:100px;height:1px;background:linear-gradient(90deg,transparent,#b05858,transparent);"></div>
  </div>
  <h1 id="endTitle" style="font-size:46px;margin:0;letter-spacing:8px;color:#d8556a;text-shadow:0 0 22px rgba(216,85,106,0.6);font-weight:400;line-height:1;animation:winFadeIn 0.7s ease-out 0.15s both;position:relative;z-index:1;">YOU DIED</h1>
  <!-- Subtitle with diamond flanks — same grammar as other overlays.
       Margin tightened (was 10/20) to fit more of the modal in the 720
       design-space height without scrolling at typical content levels. -->
  <div id="endSubtitleWrap" style="display:flex;align-items:center;gap:12px;margin:6px 0 12px;opacity:0.7;animation:winFadeIn 0.7s ease-out 0.3s both;position:relative;z-index:1;">
    <span id="endSubtitleDotL" style="width:3px;height:3px;background:#b05858;transform:rotate(45deg);"></span>
    <p id="endSubtitle" style="margin:0;letter-spacing:5px;font-size:12px;font-style:italic;color:#c8a8a8;">the ooze takes you back</p>
    <span id="endSubtitleDotR" style="width:3px;height:3px;background:#b05858;transform:rotate(45deg);"></span>
  </div>

  <!-- CHRONICLE header — gold, ornamental -->
  <div style="display:flex;align-items:center;gap:14px;margin-bottom:6px;opacity:0.65;animation:winFadeIn 0.6s ease-out 0.42s both;position:relative;z-index:1;">
    <div style="width:44px;height:1px;background:linear-gradient(90deg,transparent,#c9a86a);"></div>
    <div style="color:#c9a86a;font-size:10px;letter-spacing:5px;font-weight:bold;">\u2666 CHRONICLE \u2666</div>
    <div style="width:44px;height:1px;background:linear-gradient(90deg,#c9a86a,transparent);"></div>
  </div>
  <!-- Stats plaque — GOLD palette. THREE STAT-PAIRS PER ROW (6 cells x 4
       rows for 12 possible stats), down from 2 stat-pairs x 12 rows. Saves
       ~150px design height — enough to fit the long-run case (full damage
       tally + bosses + max combo) within the 720 design space. Each pair
       takes ~150 + value 60 = 210 design px wide; 3 pairs = 630 wide,
       comfortably inside the 1280 modal. Padding/margin tightened too. -->
  <div id="endStats" style="display:grid;grid-template-columns:150px 60px 150px 60px 150px 60px;gap:4px 14px;background:linear-gradient(180deg,rgba(30,22,16,0.85),rgba(14,10,8,0.88));box-shadow:inset 0 0 0 1px rgba(201,168,106,0.3), inset 0 0 18px rgba(0,0,0,0.5), 0 0 24px rgba(201,168,106,0.12);padding:12px 22px;margin-bottom:10px;font-size:12px;color:#d8cfae;font-family:Georgia,serif;animation:winCardSlide 0.55s ease-out 0.5s both;position:relative;z-index:1;"></div>

  <!-- Relic trophy strip -->
  <div id="endRelics" style="display:flex;gap:6px;margin-bottom:10px;align-items:center;animation:winFadeIn 0.6s ease-out 0.75s both;position:relative;z-index:1;"></div>
  <!-- The Watcher's ledger — populated when the entity has ever spoken. Quiet.
       Matches the in-run visual grammar: cream italic serif + the eye sigil. -->
  <div id="endWatcher" style="display:none;font-family:Georgia,serif;color:#ece0c4;font-style:italic;font-size:13px;letter-spacing:0.3px;margin-bottom:10px;text-align:center;animation:winFadeIn 0.7s ease-out 0.85s both;position:relative;z-index:1;max-width:560px;line-height:1.4;"></div>
  <!-- Essence earned + progress bar (cyan, sanctuary theme) -->
  <div id="endEssence" style="font-size:16px;color:#a0e8ff;letter-spacing:3px;text-shadow:0 0 12px rgba(160,232,255,0.55);margin-bottom:12px;text-align:center;animation:winFadeIn 0.7s ease-out 0.9s both;position:relative;z-index:1;"></div>

  <!-- Sanctuary header — cyan (essence theme — one of the three allowed colors) -->
  <div style="display:flex;align-items:center;gap:14px;margin-bottom:8px;opacity:0.65;animation:winFadeIn 0.6s ease-out 1.05s both;position:relative;z-index:1;">
    <div style="width:60px;height:1px;background:linear-gradient(90deg,transparent,#a0e8ff);"></div>
    <div id="metaHeader" style="color:#a0e8ff;font-size:10px;letter-spacing:5px;font-weight:bold;text-shadow:0 0 8px rgba(160,232,255,0.35);">\u2727 SANCTUARY OF THE ABYSS \u2727</div>
    <div style="width:60px;height:1px;background:linear-gradient(90deg,#a0e8ff,transparent);"></div>
  </div>
  <!-- Sanctuary unlock list. The renderMetaShop function in main.js now
       builds a 2-column COMPACT LIST (one row per unlock with icon, name,
       desc, cost, click-to-buy) instead of the prior card grid. The grid
       layout properties below are placeholders — renderMetaShop overwrites
       them on each render via direct style assignment. Saves ~110 design
       px vs the 2-row card grid, leaving the death modal more breathing
       room around the stats / watcher / essence sections. -->
  <div id="metaShopRow" style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px 12px;max-width:780px;width:100%;margin-bottom:14px;animation:winCardSlide 0.55s ease-out 1.15s both;position:relative;z-index:1;"></div>

  <!-- Button row — "← MAIN MENU" escape hatch next to the primary NEW RUN.
       The menu is where the player goes to switch save slot, pick a memory,
       visit the hamlet, check chronicles, etc. — and dying shouldn't trap
       them here without that route. -->
  <div style="display:flex;align-items:center;gap:28px;margin-bottom:8px;animation:winFadeIn 0.6s ease-out 1.35s both;position:relative;z-index:1;">
    <button id="deathMenuBtn" style="background:transparent;color:#8a7a5a;border:0;padding:8px 18px;font-size:11px;cursor:pointer;letter-spacing:4px;font-family:Georgia,serif;font-style:italic;font-weight:bold;transition:opacity 0.22s ease;opacity:0.7;">\u2190 MAIN MENU</button>
    <button id="restartBtn" style="background:linear-gradient(180deg,#3a2a20,#1a0f08);color:#f4d9a0;border:0;padding:14px 56px;font-size:15px;cursor:pointer;letter-spacing:6px;font-family:Georgia,serif;font-weight:bold;transition:all 0.22s ease;box-shadow:inset 0 0 0 1px #c9a86a, 0 0 22px rgba(201,168,106,0.25), inset 0 0 12px rgba(244,217,160,0.06);position:relative;z-index:1;">NEW RUN</button>
  </div>

  </div><!-- /menuContent -->
`;
