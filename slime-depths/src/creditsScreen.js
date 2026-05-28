// ============================================================================
// CREDITS SCREEN — in-game attribution for bundled third-party assets.
//
// Legal side of release prep: most of the art/audio/icon packs we bundle
// (Tiny RPG characters, Kenney dungeon tiles, Pixel Fantasy 30 Tracks,
// Free Raven Fantasy icons) require attribution in a manner reasonable to
// the medium. For a game, an in-game credits screen is the standard.
//
// Written as a plain HTML constant the same as deathScreen.js / winScreen.js.
// main.js handles the open/close + link wiring. No game logic inside here.
// ============================================================================

// Same corner-ornament shape as the other overlay modules. See note in
// deathScreen.js — will extract once a 4th overlay wants the same grammar.
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

// Credits blocks. Each is a small card with a role, pack title, and short
// license note. Blocks cards kept terse — the full LICENSE file at repo
// root is the authoritative source; this screen is "reasonable attribution
// in the medium" per CC BY's common interpretation.
const CREDIT_BLOCKS = [
  {
    role: 'DESIGN · CODE · PROSE',
    title: 'Armin',
    note: 'Original game design, source code, level data, and written prose.',
  },
  {
    role: 'CHARACTER & ENEMY SPRITES',
    title: 'Tiny RPG Character Asset Pack v1.03b',
    note: 'Knight, slime, skeleton, orc, archer, priest, wizard, vanguard, lancer.',
  },
  {
    role: 'DUNGEON TILES',
    title: 'Kenney Roguelike Dungeon — kenney.nl',
    note: 'Public domain (CC0).',
  },
  {
    role: 'MUSIC',
    title: 'Pixel Fantasy 30 Tracks Music Pack',
    note: 'Ambient, boss, and biome themes.',
  },
  {
    role: 'RELIC + FUSION ICONS',
    title: 'Free Raven Fantasy Icons',
    note: 'Item and fusion iconography.',
  },
  {
    role: 'ADDITIONAL CREATURES (bundled, held for future scenes)',
    title: 'Other Worlds Slime pack',
    note: 'Not currently rendered at prototype scale.',
  },
];

function block({ role, title, note }) {
  return `
  <div style="background:linear-gradient(180deg,rgba(30,22,16,0.78),rgba(14,10,8,0.82));box-shadow:inset 0 0 0 1px rgba(201,168,106,0.28),inset 0 0 14px rgba(0,0,0,0.45);padding:12px 18px;font-family:Georgia,serif;">
    <div style="color:#c9a86a;font-size:9px;letter-spacing:4px;font-weight:bold;margin-bottom:4px;">${role}</div>
    <div style="color:#f4d9a0;font-size:15px;letter-spacing:1px;margin-bottom:4px;">${title}</div>
    <div style="color:#a89b82;font-size:11px;font-style:italic;letter-spacing:1px;">${note}</div>
  </div>`;
}

export const CREDITS_SCREEN_HTML = `
  <div style="position:absolute;inset:0;background:radial-gradient(ellipse at center, transparent 28%, rgba(4,2,6,0.55) 78%, rgba(0,0,0,0.85) 100%);pointer-events:none;"></div>
  ${cornerOrnament('tl')}
  ${cornerOrnament('tr')}
  ${cornerOrnament('bl')}
  ${cornerOrnament('br')}

  <div style="position:relative;z-index:1;max-width:640px;width:100%;display:flex;flex-direction:column;align-items:center;max-height:86%;overflow:hidden;">
    <!-- Ornamental frame above the title — shared grammar with other overlays. -->
    <div style="display:flex;align-items:center;gap:22px;margin-bottom:10px;opacity:0.75;animation:winFadeIn 0.6s ease-out;">
      <div style="width:100px;height:1px;background:linear-gradient(90deg,transparent,#c9a86a,transparent);"></div>
      <div style="color:#c9a86a;font-size:11px;letter-spacing:6px;font-style:italic;">with gratitude to</div>
      <div style="width:100px;height:1px;background:linear-gradient(90deg,transparent,#c9a86a,transparent);"></div>
    </div>
    <h1 style="font-size:38px;margin:0 0 6px;letter-spacing:10px;color:#f4d9a0;text-shadow:0 0 22px rgba(244,217,160,0.45);font-weight:400;animation:winFadeIn 0.7s ease-out 0.1s both;font-family:Georgia,serif;">CREDITS</h1>
    <div style="color:#a89b82;font-size:11px;letter-spacing:4px;font-style:italic;margin-bottom:22px;font-family:Georgia,serif;">\u2666 ETHERA is built on the work of others \u2666</div>

    <!-- Credit blocks — grid scrolls if content exceeds viewport height. -->
    <div style="display:grid;grid-template-columns:1fr;gap:10px;width:100%;overflow-y:auto;padding:2px 4px 22px;animation:winCardSlide 0.55s ease-out 0.3s both;">
      ${CREDIT_BLOCKS.map(block).join('')}
    </div>

    <!-- Back button — crimson text-link, same grammar as other modal backs. -->
    <button id="creditsCloseBtn" style="background:transparent;border:0;margin-top:8px;padding:8px 18px;cursor:pointer;color:#c8a8a8;font-family:Georgia,serif;font-size:12px;letter-spacing:4px;font-style:italic;transition:all 0.22s ease;animation:winFadeIn 0.6s ease-out 0.6s both;">\u2190 return</button>
  </div>
`;
