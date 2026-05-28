// ============================================================================
// DEATH / VICTORY SCREEN TEMPLATE — static HTML only
//
// Slim version after the "death = a moment, hamlet = the place" rebuild.
// The screen used to host 8 simultaneous jobs (run stats, trophy strip,
// watcher ledger, essence progress, full meta-shop, memory cards, plus
// 3 buttons). Now it's just the death moment — title, subtitle,
// compact stats, essence tally, optional memory-tag, button row.
// The shop / progress bar / watcher ledger live in the hamlet
// (Sanctuary Shrine — N slab, E to interact).
//
// IDs preserved verbatim so main.js's getElementById() calls keep
// working unchanged. Animation names live in index.html's <style>.
// ============================================================================

// Corner ornament helper — preserved from the prior version. Reduces the
// 4 near-identical corner blocks to one function call each.
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

export const DEATH_SCREEN_HTML = `
  <!-- Deep vignette + page-frame corners. Outside the .menuContent
       wrapper so corner flourishes hug the viewport edge at any scale. -->
  <div style="position:absolute;inset:0;background:radial-gradient(ellipse at center, transparent 28%, rgba(4,2,6,0.55) 78%, rgba(0,0,0,0.85) 100%);pointer-events:none;"></div>
  ${cornerOrnament('tl')}
  ${cornerOrnament('tr')}
  ${cornerOrnament('bl')}
  ${cornerOrnament('br')}

  <!-- Slim death screen layout. Six elements top-to-bottom:
         1. Ornament line + flavor word
         2. YOU DIED title
         3. Defining-moment subtitle (felled by X — your beat)
         4. Compact stats (2 lines of inline text, no grid)
         5. Essence tally (one line, no progress bar)
         6. Memory remembered tag (only when a memory unlocked this run)
         7. Button row (MAIN MENU / CONTINUE / QUICK RESTART)
       Total design-space height ~290 px (was ~620 px with the bloated
       version). Fits comfortably in the 720 design-space at any scale.
       Element ids match originals so main.js getElementById sites work. -->
  <div class="menuContent" style="display:flex;flex-direction:column;align-items:center;position:relative;z-index:1;">

  <!-- Ornament line — crimson on death, gold on victory (set by showEndOfRun). -->
  <div id="endOrnament" style="display:flex;align-items:center;gap:22px;margin-bottom:10px;opacity:0.8;animation:winFadeIn 0.7s ease-out;position:relative;z-index:1;">
    <div id="endOrnamentLineL" style="width:100px;height:1px;background:linear-gradient(90deg,transparent,#b05858,transparent);"></div>
    <div id="endOrnamentText" style="color:#d88080;font-size:11px;letter-spacing:6px;font-style:italic;">your story ends here</div>
    <div id="endOrnamentLineR" style="width:100px;height:1px;background:linear-gradient(90deg,transparent,#b05858,transparent);"></div>
  </div>

  <!-- Title — bigger now (54 vs 46) since the screen has room to breathe. -->
  <h1 id="endTitle" style="font-size:54px;margin:0;letter-spacing:10px;color:#d8556a;text-shadow:0 0 26px rgba(216,85,106,0.7);font-weight:400;line-height:1;animation:winFadeIn 0.7s ease-out 0.15s both;position:relative;z-index:1;">YOU DIED</h1>

  <!-- Defining-moment subtitle — composeDefiningMoment in main.js builds
       a two-tone HTML line (crimson cause + cream beat). Diamond flanks. -->
  <div id="endSubtitleWrap" style="display:flex;align-items:center;justify-content:center;gap:12px;margin:8px 0 24px;opacity:0.85;animation:winFadeIn 0.7s ease-out 0.35s both;position:relative;z-index:1;max-width:90%;">
    <span id="endSubtitleDotL" style="width:3px;height:3px;background:#b05858;transform:rotate(45deg);flex-shrink:0;"></span>
    <p id="endSubtitle" style="margin:0;letter-spacing:3px;font-size:13px;font-style:italic;color:#c8a8a8;max-width:680px;text-align:center;line-height:1.5;">the ooze takes you back</p>
    <span id="endSubtitleDotR" style="width:3px;height:3px;background:#b05858;transform:rotate(45deg);flex-shrink:0;"></span>
  </div>

  <!-- Compact stats — main.js fills as TWO LINES of inline text:
       Line 1: "FLOOR II  ·  RUN 4:32"   (signature stats, always shown)
       Line 2: "16 enemies slain  ·  2 relics found  ·  MAX COMBO 14"
              (only the non-zero counts; max combo only at 5+) -->
  <div id="endStats" style="display:flex;flex-direction:column;align-items:center;gap:6px;font-family:Georgia,serif;color:#d8cfae;font-size:13px;letter-spacing:1.5px;margin-bottom:18px;animation:winFadeIn 0.6s ease-out 0.55s both;position:relative;z-index:1;text-align:center;line-height:1.4;"></div>

  <!-- Essence — single cream + cyan line. The progress bar + unlock
       grid live in the hamlet shrine modal now (E on the N slab). -->
  <div id="endEssence" style="font-size:15px;color:#a0e8ff;letter-spacing:3px;text-shadow:0 0 12px rgba(160,232,255,0.45);margin-bottom:14px;text-align:center;animation:winFadeIn 0.6s ease-out 0.75s both;position:relative;z-index:1;"></div>

  <!-- Memory remembered tag — display:none unless a memory rolled this
       run. Single italic cream line, no card frame. -->
  <div id="endMemoryTag" style="display:none;font-family:Georgia,serif;font-size:12px;letter-spacing:3px;font-style:italic;color:#d8cfae;margin-bottom:14px;text-align:center;animation:winFadeIn 0.6s ease-out 0.95s both;position:relative;z-index:1;"></div>

  <!-- Button row — MAIN MENU (left, secondary text) + CONTINUE (center,
       primary action) + QUICK RESTART (right, secondary text + R hotkey).
       NEW RUN renamed to CONTINUE since the primary action now ALWAYS
       routes through the hamlet on death — that's a continuation of
       the world, not a fresh restart. The button id stays #restartBtn
       for backward compat with main.js click handlers. -->
  <div style="display:flex;align-items:center;gap:32px;animation:winFadeIn 0.6s ease-out 1.15s both;position:relative;z-index:1;">
    <button id="deathMenuBtn" style="background:transparent;color:#8a7a5a;border:0;padding:8px 18px;font-size:11px;cursor:pointer;letter-spacing:4px;font-family:Georgia,serif;font-style:italic;font-weight:bold;transition:opacity 0.22s ease;opacity:0.7;">← MAIN MENU</button>
    <button id="restartBtn" style="background:linear-gradient(180deg,#3a2a20,#1a0f08);color:#f4d9a0;border:0;padding:14px 56px;font-size:15px;cursor:pointer;letter-spacing:6px;font-family:Georgia,serif;font-weight:bold;transition:all 0.22s ease;box-shadow:inset 0 0 0 1px #c9a86a, 0 0 22px rgba(201,168,106,0.25), inset 0 0 12px rgba(244,217,160,0.06);position:relative;z-index:1;">CONTINUE</button>
    <button id="deathQuickRestartBtn" style="background:transparent;color:#8a7a5a;border:0;padding:8px 18px;font-size:11px;cursor:pointer;letter-spacing:4px;font-family:Georgia,serif;font-style:italic;font-weight:bold;transition:opacity 0.22s ease;opacity:0.7;">QUICK RESTART <span style="font-size:9px;opacity:0.7;letter-spacing:1px;border:1px solid currentColor;padding:1px 4px;margin-left:2px;border-radius:3px;font-style:normal;">R</span></button>
  </div>

  </div><!-- /menuContent -->
`;
