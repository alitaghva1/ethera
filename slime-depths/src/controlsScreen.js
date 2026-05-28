// ============================================================================
// CONTROLS / HOW-TO-PLAY SCREEN
//
// Context-triggered tips are great for teaching one thing at a time, but a
// player who wants the FULL picture (all keybinds, all combat nuances)
// needs a single-reference cheat sheet. This is that screen.
//
// Same visual grammar as creditsScreen.js — lazy-created modal, cornerOrnament
// + gold title + crimson back button.
// ============================================================================

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

// Keybind rows — left: key glyph, right: action.
// Kept terse — fits on one line each.
// Wizard-kit Sprint 2A/2B/3C — controls reflect the new weapon-swap kit:
//   LMB fires the active weapon's primary (sword swing or blast bolt)
//   RMB swaps active weapon between sword + blast slots
//   SPACE raises the directional shield (front cone, perfect-block window)
//   Q is dash strike when sword equipped, blink when blast equipped
const KEYBINDS = [
  { key: 'WASD',     action: 'Move' },
  { key: 'MOUSE',    action: 'Aim' },
  { key: 'LMB',      action: 'Active weapon — sword swing OR blast bolt' },
  { key: 'LMB (hold)', action: 'Sword: charged heavy swing · Blast: charged bolt (pierce)' },
  { key: 'RMB',      action: 'Swap active weapon (Sword ↔ Blast) — also 1 / 2 / mouse-wheel' },
  { key: 'SPACE',    action: 'SHIELD — front-cone block. First 0.10s = PERFECT BLOCK + counter window' },
  { key: 'Q',        action: 'Sword: Dash Strike (2x dmg, 5s) · Blast: Blink (no dmg, 3.5s)' },
  { key: 'ESC',      action: 'Pause / menu' },
  { key: 'TAP',      action: 'Mobile: ⚔ attack · ⛨ shield · ⇄ swap weapon · ⇶ Q-ability' },
];

// Mechanic cards — the non-obvious stuff you can only learn by playing.
// Each is one compact fact.
const MECHANICS = [
  {
    title: 'SWING CHAIN',
    body: 'Every 3rd attack in a fast sequence is a FINISHER — sword +50%, dagger +25%, hammer +60% and a shockwave.',
  },
  {
    title: 'COMBO',
    body: 'Landing hits in quick succession builds CHAIN. At 5/10/20/40 the damage bonus escalates (+5% to +35%).',
  },
  {
    title: 'PERFECT BLOCK',
    body: 'Raising the shield as an attack lands grants a guaranteed COUNTER — +50% damage. Hits MUST come from the front 180° cone.',
  },
  {
    title: 'WEAPON SWAP',
    body: 'RMB / 1 / 2 / mouse-wheel swap between Sword and Blast. Free, instant — relics like Resonance Stone reward swap-rhythm play.',
  },
  {
    title: 'EXECUTE',
    body: 'Enemies below 40% HP take an extra +50% damage. Finish the wounded first.',
  },
  {
    title: 'ELITE AFFIXES',
    body: 'Letters above elite foes: F(rost) slows  ·  E(mber) burns  ·  V(enom) poisons  ·  W(arded) resists until broken by a stagger.',
  },
  {
    title: 'LOW HP',
    body: 'At 30% HP the screen pulses red. Sanctuary rooms (every floor) heal you back up. Relics with revive save once.',
  },
];

function keybindRow(kb) {
  return `
  <div style="display:grid;grid-template-columns:110px 1fr;gap:12px;align-items:center;padding:4px 12px;border-bottom:1px solid rgba(201,168,106,0.12);">
    <div style="color:#f4d9a0;font-family:Georgia,serif;font-size:11px;letter-spacing:2.5px;font-weight:bold;text-align:right;">${kb.key}</div>
    <div style="color:#d8cfae;font-family:Georgia,serif;font-size:11px;letter-spacing:0.8px;">${kb.action}</div>
  </div>`;
}

function mechanicCard(m) {
  return `
  <div style="background:linear-gradient(180deg,rgba(30,22,16,0.75),rgba(14,10,8,0.8));box-shadow:inset 0 0 0 1px rgba(201,168,106,0.24),inset 0 0 14px rgba(0,0,0,0.4);padding:7px 12px;font-family:Georgia,serif;">
    <div style="color:#c9a86a;font-size:9px;letter-spacing:3px;font-weight:bold;margin-bottom:3px;">${m.title}</div>
    <div style="color:#d8cfae;font-size:10px;letter-spacing:0.4px;line-height:1.45;">${m.body}</div>
  </div>`;
}

// Layout fits in 720 design height without scrolling:
//   title block ~92px + controls ~210px + mechanics (3-col x 2-row) ~150px
//   + return button ~30px + paddings/gaps ~40px = ~520px. Comfortably under
//   the design height even with breathing room.
export const CONTROLS_SCREEN_HTML = `
  <div style="position:absolute;inset:0;background:radial-gradient(ellipse at center, transparent 28%, rgba(4,2,6,0.55) 78%, rgba(0,0,0,0.85) 100%);pointer-events:none;"></div>
  ${cornerOrnament('tl')}
  ${cornerOrnament('tr')}
  ${cornerOrnament('bl')}
  ${cornerOrnament('br')}

  <div style="position:relative;z-index:1;max-width:780px;width:100%;display:flex;flex-direction:column;align-items:center;">
    <div style="display:flex;align-items:center;gap:18px;margin-bottom:6px;opacity:0.75;animation:winFadeIn 0.6s ease-out;">
      <div style="width:90px;height:1px;background:linear-gradient(90deg,transparent,#c9a86a,transparent);"></div>
      <div style="color:#c9a86a;font-size:10px;letter-spacing:5px;font-style:italic;">a brief primer</div>
      <div style="width:90px;height:1px;background:linear-gradient(90deg,transparent,#c9a86a,transparent);"></div>
    </div>
    <h1 style="font-size:32px;margin:0 0 4px;letter-spacing:9px;color:#f4d9a0;text-shadow:0 0 22px rgba(244,217,160,0.45);font-weight:400;animation:winFadeIn 0.7s ease-out 0.1s both;font-family:Georgia,serif;">HOW TO PLAY</h1>
    <div style="color:#a89b82;font-size:10px;letter-spacing:4px;font-style:italic;margin-bottom:14px;font-family:Georgia,serif;">\u2666 ETHERA remembers your blade \u2666</div>

    <!-- Single column at top level \u2014 but each section's INNER layout is
         a tight grid so all six mechanic cards fit in two rows of three
         and the eight keybind rows fit at compressed line-height. No
         scrollbar; everything visible at once on a 720 design height. -->
    <div style="display:flex;flex-direction:column;gap:12px;width:100%;animation:winCardSlide 0.55s ease-out 0.25s both;">
      <!-- Keybinds -->
      <div>
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
          <div style="width:40px;height:1px;background:linear-gradient(90deg,transparent,#c9a86a);"></div>
          <div style="color:#c9a86a;font-size:9px;letter-spacing:4px;font-weight:bold;">\u2666 CONTROLS \u2666</div>
          <div style="width:40px;height:1px;background:linear-gradient(90deg,#c9a86a,transparent);flex:1;"></div>
        </div>
        <div style="background:linear-gradient(180deg,rgba(30,22,16,0.72),rgba(14,10,8,0.78));box-shadow:inset 0 0 0 1px rgba(201,168,106,0.22),inset 0 0 14px rgba(0,0,0,0.4);padding:5px 0;">
          ${KEYBINDS.map(keybindRow).join('')}
        </div>
      </div>

      <!-- Mechanics \u2014 3 columns x 2 rows for the 6 cards. Fixed col count
           keeps the layout stable; auto-fit tended to wrap to 4+1+1 at
           tight container widths which read as broken rather than tidy. -->
      <div>
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
          <div style="width:40px;height:1px;background:linear-gradient(90deg,transparent,#c9a86a);"></div>
          <div style="color:#c9a86a;font-size:9px;letter-spacing:4px;font-weight:bold;">\u2666 WHAT TO KNOW \u2666</div>
          <div style="width:40px;height:1px;background:linear-gradient(90deg,#c9a86a,transparent);flex:1;"></div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;">
          ${MECHANICS.map(mechanicCard).join('')}
        </div>
      </div>
    </div>

    <button id="controlsCloseBtn" style="background:transparent;border:0;margin-top:14px;padding:6px 16px;cursor:pointer;color:#c8a8a8;font-family:Georgia,serif;font-size:11px;letter-spacing:4px;font-style:italic;transition:all 0.22s ease;animation:winFadeIn 0.6s ease-out 0.55s both;">\u2190 return</button>
  </div>
`;
