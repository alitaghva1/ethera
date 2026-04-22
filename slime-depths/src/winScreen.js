// ============================================================================
// WIN / BETWEEN-FLOOR SCREEN TEMPLATE — static HTML only
//
// Extracted from main.js as part of review #4 (main.js split, pass 3).
// Shown between floors as "a moment of respite" with an optional shop row,
// and on final victory. main.js owns the data-filling (gold, shop cards,
// title swap on final floor) and event wiring; this module is just markup.
//
// IDs preserved verbatim: winTitle, winSubtitle, shopGold, shopGoldAmount,
// shopHeader, shopRow, winRestartBtn.
// ============================================================================

// Same corner-ornament shape as deathScreen.js. Kept duplicated for now;
// can be pulled into a shared module once a 3rd screen needs it.
function cornerOrnament(position) {
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

export const WIN_SCREEN_HTML = `
  <!-- Deep vignette + page-frame corners (same discipline across overlays) -->
  <div style="position:absolute;inset:0;background:radial-gradient(ellipse at center, transparent 28%, rgba(4,2,6,0.55) 78%, rgba(0,0,0,0.85) 100%);pointer-events:none;"></div>
  ${cornerOrnament('tl')}
  ${cornerOrnament('tr')}
  ${cornerOrnament('bl')}
  ${cornerOrnament('br')}

  <div style="position:relative;display:flex;flex-direction:column;align-items:center;z-index:1;">
    <!-- Ornamental frame above the title — gold, same grammar as other overlays. -->
    <div style="display:flex;align-items:center;gap:22px;margin-bottom:10px;opacity:0.75;animation:winFadeIn 0.6s ease-out;">
      <div style="width:100px;height:1px;background:linear-gradient(90deg,transparent,#c9a86a,transparent);"></div>
      <div style="color:#c9a86a;font-size:11px;letter-spacing:6px;font-style:italic;">a moment of respite</div>
      <div style="width:100px;height:1px;background:linear-gradient(90deg,transparent,#c9a86a,transparent);"></div>
    </div>
    <!-- Title is now GOLD (victory = triumph = gold in our palette). Previously green. -->
    <h1 id="winTitle" style="font-size:56px;margin:0;letter-spacing:10px;color:#f4d9a0;text-shadow:0 0 22px rgba(244,217,160,0.55);font-weight:400;line-height:1;animation:winFadeIn 0.7s ease-out 0.1s both;">FLOOR CLEARED</h1>
    <!-- Subtitle with diamond flanks. -->
    <div style="display:flex;align-items:center;gap:12px;margin:10px 0 26px;opacity:0.7;animation:winFadeIn 0.7s ease-out 0.2s both;">
      <span style="width:3px;height:3px;background:#c9a86a;transform:rotate(45deg);"></span>
      <p id="winSubtitle" style="margin:0;letter-spacing:5px;font-size:12px;font-style:italic;color:#d8cfae;">descend deeper?</p>
      <span style="width:3px;height:3px;background:#c9a86a;transform:rotate(45deg);"></span>
    </div>
    <!-- Gold counter — hidden until shop is visible. -->
    <div id="shopGold" style="display:none;margin-bottom:18px;font-size:22px;color:#f4d9a0;letter-spacing:4px;text-shadow:0 0 10px rgba(244,217,160,0.45);animation:winFadeIn 0.6s ease-out 0.35s both;">
      <span id="shopGoldAmount">0</span> <span style="font-size:10px;opacity:0.55;letter-spacing:5px;color:#c9a86a;font-weight:bold;">\u2666 GOLD \u2666</span>
    </div>
    <!-- Shop header — gold ornament. -->
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:14px;opacity:0.65;animation:winFadeIn 0.7s ease-out 0.45s both;">
      <div style="width:60px;height:1px;background:linear-gradient(90deg,transparent,#c9a86a);"></div>
      <div id="shopHeader" style="color:#c9a86a;font-size:10px;letter-spacing:5px;font-weight:bold;display:none;">\u2666 WARES OF THE DEPTHS \u2666</div>
      <div style="width:60px;height:1px;background:linear-gradient(90deg,#c9a86a,transparent);"></div>
    </div>
    <div id="shopRow" style="display:none;gap:16px;margin-bottom:28px;"></div>
    <!-- CTA — unified gold treatment with inset stroke. -->
    <button id="winRestartBtn" style="background:linear-gradient(180deg,#3a2a20,#1a0f08);color:#f4d9a0;border:0;padding:16px 72px;font-size:16px;cursor:pointer;letter-spacing:7px;font-weight:bold;font-family:Georgia,serif;box-shadow:inset 0 0 0 1px #c9a86a, 0 0 26px rgba(201,168,106,0.3), inset 0 0 14px rgba(244,217,160,0.08);transition:all 0.22s ease;animation:winFadeIn 0.6s ease-out 1.1s both;">DESCEND</button>
  </div>
`;
