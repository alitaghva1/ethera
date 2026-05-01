// ============================================================================
// HAMLET SCENE — canvas version of the between-run hub
//
// The hamlet is rendered from a single 1376×768 AI-generated backdrop
// (`scene_v2.jpg`) plus a paired collision mask (`scene_v2_mask.jpg`,
// white = blocked, black = walkable). The hero physically walks through
// it; NPCs are world-positioned sprites; the descent portal is a painted
// rune circle that triggers a run when the hero stands on it and presses E.
// Dialogue reuses the existing DOM dialogueEl overlay.
// ============================================================================
import { hero } from './hero.js';
import { images } from './loader.js';
import { NPCS, hamletState, hasUnseenTopics, hasUnreadDialogue, hamletGrowthStage } from './hamlet.js';
import { drawHamletFloor, isHamletWalkable, HAMLET_H } from './hamletFloor.js';
import { showTip } from './tips.js';
import { records } from './records';
import { daily, getTodayChallenge, hasCompletedToday } from './daily.js';

// A locked NPC is one whose arc-stage hasn't been initialized yet
// (refreshNpcPresence hasn't ticked their unlockCheck to true). They
// still render in-world for compositional reasons, but get a shrouded
// visual treatment + a different interact prompt + an unlockHint card
// when the player presses E. Single helper so the three rendering paths
// stay in lockstep.
function isNpcUnlocked(id) {
  return hamletState.npcArcStage[id] !== undefined;
}

// Camera zoom for the hamlet — single source of truth. Imported by main.js
// in enterHamletCanvas + the hamlet branch of the game loop. Bumped from
// 1.5 to 1.75 to give hero/NPCs proper visual scale against the painted
// scene's tile detail.
export const HAMLET_ZOOM = 1.75;

// Y-clamp bounds — tighter than world height (768) to keep the hero inside
// the camera's visible Y range at HAMLET_ZOOM. Real walkability is the
// mask-sampled isHamletWalkable() in hamletFloor.js; these are a safety
// net against ever ending up off-camera.
export const HAMLET_WALK_Y_MIN = 60;
export const HAMLET_WALK_Y_MAX = 720;

// Hero spawn — south entry path on the long cobble corridor leading from
// the gate to the central plaza. Pixel-detected for v4 layout (no-wall
// hamlet, octagonal perimeter, cobble star plaza).
export const HAMLET_HERO_SPAWN = { x: 688, y: 700 };

// Zone anchors — pixel-detected positions on the 2752×1536 v3 backdrop
// (rendered at 1376×768 world). Detected via color-signature scan (see
// scripts/hamlet_audit.py for the technique). v3 has no actual props
// painted in — these positions point at the GROUND PLACEMENT MARKERS
// where each feature will be rendered as a sprite overlay.
// v4 layout pixel-detected anchors (no-wall hamlet):
//   plaza center    (689, 378)   round cobble star
//   shrine slab     (687, 201)   N pedestal
//   smithy pad      (966, 216)   NE square stone foundation w/ anvil silhouette
//   reading nook    (431, 449)   W dirt+stone patch
//   camp dirt       (944, 452)   E rough dirt+bedroll+fire-ring
//   portal pad      (964, 654)   SE grass clearing w/ ritual ring
//   graveyard       (569, 211)   NW grass+markers cluster
const PORTAL_POS   = { x: 965, y: 634 };   // SE portal pad (v4) — y up 20 from 654, x at 965 after right-4 producer nudge from 961
const SHRINE_POS   = { x: 687, y: 201 };   // N shrine slab (v4)
const FIREPIT_POS  = { x: 435, y: 450 };   // W reading-nook brazier — beside the archivist on his dirt patch (v4 cleanup)

// NPC world positions — one per district, every position verified to
// land in a walkable, terrain-correct tile. spriteIdx maps to the
// pixel-art hamlet_npcp sheet (3×2):
//   0 keeper | 1 smith  | 2 archivist
//   3 grave  | 4 oracle | 5 wanderer
export const HAMLET_ENTITIES = [
  { kind: 'portal',                                 x: PORTAL_POS.x,  y: PORTAL_POS.y,  interactR: 80 },
  { kind: 'shrine',                                 x: SHRINE_POS.x,  y: SHRINE_POS.y,  interactR: 0  },
  { kind: 'firepit',                                x: FIREPIT_POS.x, y: FIREPIT_POS.y, interactR: 0  },
  // (Notice board entity removed — the painted plaza reads cleaner
  // without an extra prop blocking the central cobble star. The
  // noticeboard interact-handler plumbing in consumeHamletInteract
  // + drawHamletInteractPrompt is left in place so the prop can be
  // re-added later by restoring this entry + the fx entry below.)
  // Positions on Scene v2 backdrop (1376×768) — each NPC stationed at
  // the obvious thematic anchor in the painted scene.
  //   keeper      — central plaza, west of portal/firepit (hub merchant)
  //   smith       — top-right forge, beside the anvil + brazier
  //   archivist   — mid-left archive nook, beside bookcase + scrolls
  //   gravekeeper — top-left graveyard, among headstones + crosses
  //   oracle      — top-center, beside the shrine altar / standing stone
  //   wanderer    — south-east tent + bedroll camp
  // Positions auto-validated by scripts/hamlet_audit.py — each NPC stands
  // ~40px south of their thematic feature on a walkable cell, padded for
  // the 14px hero collision radius. Re-run the script if the backdrop is
  // ever swapped to recompute positions.
  //   keeper      — south of central plaza firepit (hub merchant)
  //   smith       — south of the smith forge brazier + anvil
  //   archivist   — south of the bookcase + scrolls nook
  //   gravekeeper — south of the graveyard headstones
  //   oracle      — south of the altar shrine candles
  //   wanderer    — south of the canvas tent + bedroll camp
  // drawScale NORMALIZED per-NPC to a target visible height of ~44-46px
  // (matching the hero's HERO_DRAW_HAMLET=48 × ~93% fill). Source content
  // fill ratios were measured directly from hamlet_npc_pixel.jpg via
  // canvas pixel sampling — see scripts/hamlet_audit.py for the technique.
  // Math: drawScale = 45 / (56 × fillRatio).
  //   id           fillRatio   computed scale
  //   keeper       0.70        1.10 (smallest source, biggest scale-up)
  //   smith        0.82        0.95
  //   archivist    0.81        0.95
  //   gravekeeper  0.87        0.90
  //   oracle       0.84        0.95
  //   wanderer     0.89        0.90 (largest source, smallest scale)
  // Result: all NPCs at ~44-46px visible, within ±1px of hero. Re-measure
  // and recompute if the NPC sheet is ever swapped.
  // Positions match the v3 backdrop's pixel-detected feature anchors:
  //   keeper      — central plaza near portal (hub merchant)
  //   smith       — south of smithy foundation pad NE
  //   archivist   — south of archive ruined-wall nook W
  //   gravekeeper — south of graveyard plot cluster NW
  //   oracle      — south of altar slab N (NPC sprite is hidden behind future altar prop)
  //   wanderer    — south of wanderer dirt patch on right side
  // v4 NPC positions — each NPC stations at their thematic ground
  // texture zone, slightly offset south so the sprite (bottom-aligned)
  // visually 'stands on' the pad/dirt rather than floating above it.
  { kind: 'npc', id: 'keeper',      spriteIdx: 0,   x: 820, y: 600, interactR: 50, drawScale: 1.10 },
  { kind: 'npc', id: 'smith',       spriteIdx: 1,   x: 940, y: 290, interactR: 50, drawScale: 0.95 },
  { kind: 'npc', id: 'archivist',   spriteIdx: 2,   x: 480, y: 470, interactR: 50, drawScale: 0.95 },
  // v4 NPC positions continued — gravekeeper at NW grave cluster (569,211),
  // oracle south of N shrine slab (687,201), wanderer at E camp dirt (944,452).
  { kind: 'npc', id: 'gravekeeper', spriteIdx: 3,   x: 580, y: 240, interactR: 50, drawScale: 0.90 },
  { kind: 'npc', id: 'oracle',      spriteIdx: 4,   x: 690, y: 250, interactR: 50, drawScale: 0.95 },
  { kind: 'npc', id: 'wanderer',    spriteIdx: 5,   x: 965, y: 480, interactR: 50, drawScale: 0.90 },
];

// Solid obstacles the hero can't walk through. Circle-only for simplicity;
// every building and the two firepits get a footprint so the hero stays
// in the walkable corridors the paths imply. Called from main.js after
// the Y-clamp so the hero can't push into a sprite.
// Stripped to only the obstacles that have a CURRENTLY-RENDERED sprite.
// All the old hand-drawn buildings (forge, dome, scaffolding, gates,
// background tower) were removed in the rebuild — keeping their obstacle
// circles would invisibly block hero pathing across the empty hamlet.
//
// Currently active:
//   - Fountain at the plaza center (the round prop in hamletFloor.js)
//   - Lantern posts (south entrance flankers)
// NPCs and the portal/firepit/shrine entities are NOT in this list —
// the hero is meant to walk THROUGH NPCs (overlapping is fine for a hub
// area) and onto the portal/firepit tile (that's how interactions fire).
// NPC body collision — derived from HAMLET_ENTITIES so the two arrays
// can never drift. r=18 gives a soft bump-off feel (the resolver in
// resolveHamletCollision pushes the hero back along the radial
// direction when overlapping). Previously this was a hand-maintained
// parallel array that drifted from HAMLET_ENTITIES at least 3 times
// during recent placement iterations.
export const HAMLET_OBSTACLES = HAMLET_ENTITIES
  .filter(e => e.kind === 'npc')
  .map(e => ({ x: e.x, y: e.y, r: 18 }));

// Push the hero out of any prop obstacle they're inside, AND clamp them
// to the walkable area (the irregular silhouette defined by ZONES +
// GRASS_CORRIDORS in hamletFloor.js). Cheap per-tick correction — both
// passes are O(N) where N is tiny.
//
// The walkable check samples 4 points around the hero's body (radius
// HR=10) so a single point dipping into void doesn't slip through. If
// any of the 4 sample points is in void, push the hero by their average
// dx/dy back toward the nearest walkable tile center.
export function resolveHamletCollision(hero) {
  // Pass 1: prop obstacles
  for (const o of HAMLET_OBSTACLES) {
    const dx = hero.x - o.x;
    const dy = hero.y - o.y;
    const d2 = dx * dx + dy * dy;
    const rh = 10;
    const rr = o.r + rh;
    if (d2 < rr * rr) {
      const d = Math.sqrt(d2) || 0.001;
      const push = (rr - d) / d;
      hero.x += dx * push;
      hero.y += dy * push;
    }
  }
  // Pass 2: emergency rescue — if hero is somehow stuck inside a non-walkable
  // cell (teleported in, spawned inside wall, etc.), nudge them to the nearest
  // walkable cell. Per-frame wall blocking is handled by isWallAtWorld which
  // routes to isHamletWalkable for the hamlet (see room.js setHamletWalkableFn);
  // hero's per-axis movement check rejects the step BEFORE it commits, so
  // normal walking never lands the hero in void. This Pass 2 is just a safety
  // net for edge cases.
  if (!isHamletWalkable(hero.x, hero.y)) {
    // Spiral search for the nearest walkable cell.
    for (let r = 8; r <= 100; r += 8) {
      let found = false;
      for (const [dx, dy] of [[-r,0],[r,0],[0,-r],[0,r],[-r,-r],[r,r],[-r,r],[r,-r]]) {
        if (isHamletWalkable(hero.x + dx, hero.y + dy)) {
          hero.x += dx; hero.y += dy;
          found = true; break;
        }
      }
      if (found) break;
    }
  }
}

let _nearest = null;    // cached nearest interactable, updated each tick

function isNpcPresent(_id) {
  // Canvas hamlet: always render all six NPCs. The old DOM overlay gated
  // NPC visibility on record-based unlocks (Smith = beat floor 2, etc.) —
  // useful for the DOM version where "1 of 6 souls returned" told a slow
  // arrival story. For the walkable canvas version we want the full scene
  // populated immediately so the composition reads right; unlock-based
  // dialogue gating still applies at interact time (openDialogue handles
  // the arc stages).
  return true;
}

function entityAlive(e) {
  if (e.kind === 'npc') return isNpcPresent(e.id);
  return true;
}

export function updateHamletScene() {
  // Find nearest interactable entity within its interactR of the hero.
  let nearest = null;
  let bestD2 = Infinity;
  for (const e of HAMLET_ENTITIES) {
    if (!entityAlive(e)) continue;
    if (e.interactR <= 0) continue;
    const dx = hero.x - e.x, dy = hero.y - e.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < e.interactR * e.interactR && d2 < bestD2) {
      bestD2 = d2;
      nearest = e;
    }
  }
  // First-time descent hint — fire ONCE the very first time the player
  // walks into portal range. Tip system has its own seen-set guard so
  // this is a no-op on subsequent visits. Without this hook, the
  // `first_descent_hint` tip was defined in tips.js but never wired.
  if (nearest && nearest.kind === 'portal') {
    showTip('first_descent_hint');
  }
  _nearest = nearest;
}

export function getNearestHamletEntity() { return _nearest; }

// ---- LAYER 2: Buildings + ground ------------------------------------------
// Drawn AFTER room.js's drawRoom (which paints gradient sky) but BEFORE
// entities + characters. Order inside this function: cobblestone tiles
// (ground layer) first, then buildings (mid layer) on top so building bases
// sit in front of the cobblestone line.

// (ensureCobbleSubtiles removed — hamlet ground is now solid painted
// earth, not a tiled stone texture. Stone only appears where something
// has been CONSTRUCTED: plaza, paths, pads.)

// Overscan bounds — the hamlet paints beyond the world bounds into the
// canvas void strips on either side. Covers viewports up to ~1680px wide
// without gaps. Used by the dust-mote ambient particle system.
const BG_X_MIN = -360;
const BG_X_MAX = 1320;
const BG_W = BG_X_MAX - BG_X_MIN;

export function drawHamletBackdrop(ctx) {
  const now = performance.now() / 1000;

  // ── VOID BACKGROUND ──────────────────────────────────────────────────
  // The hamlet now has an irregular silhouette (zones + corridors).
  // Tiles outside the silhouette render as void — we fill the entire
  // backdrop with solid near-black FIRST so void areas don't show the
  // procedural sky/clouds/aurora that used to live here. The hamlet
  // floor tiles overlay this on the walkable cells.
  ctx.fillStyle = '#08060a';
  ctx.fillRect(BG_X_MIN, 0, BG_W, HAMLET_H);   // covers full new 768px-tall map

  // ══════════════════════════════════════════════════════════════════════
  // GROUND COMPOSITION — CAINOS PIXEL-ART TILEMAP
  //
  // Replaces ~200 lines of procedural cobble + dirt + zone painting with
  // a single tilemap render call. Tile data lives in src/hamletFloor.js
  // (a 30x21 grid of 32px Cainos tiles laid out procedurally — central
  // stone plaza, cobble path radials to each NPC anchor, grass with
  // sparse decoration filling the rest).
  // ══════════════════════════════════════════════════════════════════════
  drawHamletFloor(ctx);
  // (No old props rendered here — every prop, wall, tree, and structural
  // feature is baked into the scene_v2.jpg backdrop. NPC sprites + the
  // descent portal halo are drawn separately by drawHamletEntities.)

  // ── GROWTH-STAGE TINT ────────────────────────────────────────────────
  // Round-7 hamlet visible-growth — the painted backdrop is static but
  // the world it depicts grows as the player's run-count climbs and
  // more NPCs arrive. A subtle tinted overlay over the floor reflects
  // that progression: the empty hamlet (only Keeper present) reads
  // slightly cooler/dimmer; the restored hamlet (all NPCs arrived)
  // reads warmer + slightly brighter, like dawn through a doorway.
  //
  // Alphas are deliberately tiny (0.04 - 0.08) so the painting carries
  // the visual identity; this is atmosphere drift, not a re-tint.
  // Stage 1 (the most common state for new players) leaves the scene
  // alone — neutral baseline — so the player has a clean reference
  // before the cool dim and warm glow phases bracket it.
  //
  //   stage 0: ruin           — 1 NPC  (just the Keeper)
  //   stage 1: kindled        — 2 NPCs
  //   stage 2: thriving       — 3-4 NPCs
  //   stage 3: restored       — 5+ NPCs
  const stage = hamletGrowthStage();
  // Tier 1 art-direction sweep: the rebuild fiction is the hamlet's
  // central narrative beat ("the wound the world remembers, slowly
  // restored"), but the previous 0.04-0.07 alphas were homeopathic
  // — invisible at glance against the painted green field. Bumped
  // to 0.10-0.16 so the warm/cool tonal shift between stages
  // actually reads as the player's progress accumulates. Stage 1
  // remains the neutral baseline.
  if (stage === 0) {
    ctx.fillStyle = 'rgba(60, 78, 100, 0.16)';      // cool dim — "the place is cold"
    ctx.fillRect(BG_X_MIN, 0, BG_W, HAMLET_H);
  } else if (stage === 2) {
    ctx.fillStyle = 'rgba(255, 230, 180, 0.10)';    // first hint of warmth
    ctx.fillRect(BG_X_MIN, 0, BG_W, HAMLET_H);
  } else if (stage >= 3) {
    ctx.fillStyle = 'rgba(255, 218, 150, 0.14)';    // restored — warm hour
    ctx.fillRect(BG_X_MIN, 0, BG_W, HAMLET_H);
  }

  // ── AIR DUST MOTES ───────────────────────────────────────────────────
  // Two depth layers: 36 slow-and-bright motes (foreground) + 24 fast-
  // and-dim motes (background). Drifts diagonally across the painted
  // range so wide-canvas strips also populate.
  for (let i = 0; i < 36; i++) {
    const baseX = (i * 91) % BG_W;
    const baseY = 120 + ((i * 37) % 470);
    const driftX = BG_X_MIN + ((baseX + now * 8 + i * 3) % BG_W);
    const wobbleY = baseY + Math.sin(now * 0.5 + i * 0.7) * 4;
    // Damped alpha pulse (was 0.10-0.60, now 0.25-0.45) so motes
    // don't visibly flicker — contributes to the calmer ambient feel
    // alongside the halo pulse reductions in Session O.
    const alpha = 0.35 + 0.10 * Math.sin(now * 0.8 + i);
    ctx.fillStyle = `rgba(232, 210, 180, ${alpha.toFixed(3)})`;
    ctx.fillRect(driftX | 0, wobbleY | 0, 1, 1);
  }
  for (let i = 0; i < 24; i++) {
    const baseX = (i * 137) % BG_W;
    const baseY = 80 + ((i * 53) % 540);
    const driftX = BG_X_MIN + ((baseX + now * 18 + i * 5) % BG_W);
    const wobbleY = baseY + Math.sin(now * 0.9 + i * 1.1) * 2;
    const alpha = 0.18 + 0.05 * Math.sin(now * 1.4 + i);
    ctx.fillStyle = `rgba(200, 185, 160, ${alpha.toFixed(3)})`;
    ctx.fillRect(driftX | 0, wobbleY | 0, 1, 1);
  }

  // ── CHIMNEY SMOKE COLUMNS (Tier 1 hamlet amplification) ──────────────
  // The hamlet has flat slab "pads" at the smithy and shrine where
  // buildings would stand if they were painted. Until authored
  // architecture lands, smoke columns rising from those pads sell
  // "there is a structure here" without needing a building sprite.
  // Two columns:
  //   - smithy (906, 246): warm grey-orange — active forge fire
  //   - shrine (687, 220): cool grey — ceremonial smoke (gated on
  //     stage 2+, only once the oracle has arrived)
  // Each column is 8 motes phased on `now`, rising 90 px over a 6 s
  // cycle, fading to zero. Pure stateless math — no array maintenance,
  // no per-frame allocation, drops cleanly when the hamlet doesn't
  // render. Alpha calmed so the smoke reads as ambient haze, not a
  // foreground prop.
  const drawSmokeColumn = (baseX, baseY, tint) => {
    const CYCLE = 6.0;
    const RISE = 90;
    for (let i = 0; i < 8; i++) {
      const phase = ((now * 0.45 + i * (CYCLE / 8)) % CYCLE) / CYCLE;
      const sway = Math.sin(now * 0.4 + i * 1.3) * 6 + Math.sin(now * 0.9 + i) * 2;
      const sx = baseX + sway;
      const sy = baseY - phase * RISE;
      // Quadratic fade — quick at the source, slow as it rises.
      const a = (1 - phase) * (1 - phase) * 0.22;
      if (a < 0.02) continue;
      const sz = 2 + (i % 3) * 0.6 + phase * 1.2;       // grows as it rises
      ctx.fillStyle = `rgba(${tint}, ${a.toFixed(3)})`;
      ctx.fillRect(Math.round(sx - sz / 2), Math.round(sy - sz / 2), Math.round(sz), Math.round(sz));
    }
  };
  // Smithy fire — always lit (forge is the first NPC arc to unlock,
  // and the smithy pad is painted in the scene regardless).
  drawSmokeColumn(906, 232, '180, 130, 100');
  // Shrine ceremonial smoke — only once the oracle is present (stage 2+).
  if (hamletGrowthStage() >= 2) {
    drawSmokeColumn(687, 206, '180, 190, 210');
  }
}

// ---- Zone-paint helpers ---------------------------------------------------
// Small building blocks used by drawHamletBackdrop to compose the ground
// from NAMED ZONES instead of scattering random overlays. Each helper does
// one job cleanly so the zone list reads top-to-bottom like a level designer's
// layer stack.


// (paintRectPad + paintCirclePad removed — all pads now use paintOvalPad
// for organic "cleared courtyard" read instead of geometric platforms.)

// ---- District prop helpers ------------------------------------------------
// Small procedural pixel-art props placed at authored positions by
// drawHamletBackdrop. Each prop tells its district's function; scale +
// palette chosen to fit the pixel-art building sprites we already ship.

// (drawBoulder / drawUrn removed — foreground corner props are handled by
// the zone-based ruin patches + authored district props now.)

// Draw mid-air effects that must sit AFTER the portal tower entity — e.g.
// the prayer-flag line stretches across the tower's upper half, and if we
// drew it in the backdrop it'd get covered by the tower sprite. Called
// from main.js after drawHamletEntities (inside the camera transform).
export function drawHamletOverlay(_ctx) {
  // ── HAMLET REBUILD: prayer-flag garland stripped (the rainbow bunting
  // strung across the plaza was tied to the old painted lantern post
  // and forge — neither exists anymore). When we add the Cainos lantern
  // posts as actual props, we can re-string flags between them with the
  // sprite sheet's flag tiles.
}

// ─── HAMLET FX ─────────────────────────────────────────────────────────────
// Animated sprite-sheet overlays that draw on top of the painted backdrop
// to bring static painted features to life: firepit flame flicker, portal
// rune pulse, etc. Each entry is one FX:
//   id            — short label
//   asset         — loader.js image key (sheet of horizontal frames)
//   x, y          — world position, CENTER-aligned (not bottom-anchored
//                   like NPCs — flames/auras have no "feet")
//   frameW/frameH — single frame dimensions
//   frameCount    — number of frames in the sheet
//   fps           — playback speed (12 fps reads as fire flicker; slower
//                   for ambient pulses, faster for sparks)
//   scale         — render scale (1.0 = native sheet size)
//   yOffset       — optional vertical nudge for fine alignment with the
//                   painted feature underneath
const HAMLET_FX = [
  {
    // Firepit FX — reading-nook brazier beside the archivist (W zone).
    // Position (415, 470) sits on the dirt patch just west of the
    // archivist NPC at (470, 470), illuminating his open book and
    // anchoring the W zone as a "scholar's hearth". Halo (radius 64)
    // bleeds onto the archivist for the lit-from-the-side reading look.
    // 48×48 sprite at 1.12× scale.
    id: 'firepit', asset: 'fx_firepit',
    x: 435, y: 450,
    frameW: 48, frameH: 48,
    frameCount: 16, fps: 12,
    scale: 1.12, yOffset: 0,
  },
  // pit_cover REMOVED for v4 — there's no painted pit at the central
  // plaza in the no-wall layout. Asset + loader entry kept on disk.
  // Portal shadow REMOVED in the new-portal pass. The previous portal
  // was a flat ritual ring + violet breathing void underneath. The
  // new portal sprite (stone cellar archway with descending stairs and
  // a cold blue glow rising from below) is its OWN visual — flagstones
  // built into the sprite, blue glow internal. A purple breathing void
  // around it would clash both in palette (violet vs cold-blue) and
  // in concept (no painted ritual ring to embellish anymore).
  // Asset (fx_portal_shadow) stays in loader.js for future rooms.
  {
    // Portal (simplified holistic config). 4 frames × 112×112 native,
    // scaled 0.9× → ~101px rendered. v4 position (964, 654) sits on the
    // SE portal pad — the painted ritual ring on the grass clearing.
    //
    // Animation philosophy: SIMPLE. Constant alpha=1.0 always (no
    // proximity tiers, no restAlphaMul, no fadeSeconds). Continuous
    // 2fps loop = 4 frames × 2fps = 2s cycle, slow gentle rune drift.
    //
    // Why simplified: prior config used proximity-driven alpha to
    // create a 'portal noticed you' effect, but the alpha modulation
    // caused 'portal-on-portal' artifacts — when alpha dropped to ~0.35
    // at far range, the painted pit underneath bled through the FX
    // center, reading as TWO stacked portal visuals. Removing the
    // alpha modulation entirely fixes it: FX is always fully opaque,
    // painted pit is always fully covered. The lost theatrics weren't
    // worth the visual artifact. Pulse rhythm is constant regardless
    // of hero distance — clean and predictable.
    // New cellar-archway portal (v2 asset — Apr 28 regen). 96×96 native
    // with a 9-frame open/swirl/close cycle (closed → ajar → stairs →
    // magical purple swirl active → unwind → closed). The asset was
    // re-prompted to RENDER ONLY THE ARCHWAY (no flagstone base),
    // fixing the v1 palette clash where a square grey stone floor
    // baked into the sprite fought the painted plaza beneath.
    //   scale: 0.74 — second producer reduction (-15% from 0.87).
    //   Rendered size now ~71px (96 × 0.74), down from ~83px after
    //   the v1 -20% pass; sits cleanly on the painted SE pad without
    //   crowding the wanderer's nearby cookpot or the path approach.
    //   y: 634 — held over from v1 tuning. The new sprite has its
    //   archway mass roughly centered (no base offset), so this
    //   places the threshold at the painted pad. Tune later if needed.
    //   fps: 5 — 9 frames @ 5fps = 1.8s cycle. Slow enough to read
    //   the door open + swirl, fast enough to feel alive.
    id: 'portal', asset: 'fx_portal',
    x: 965, y: 634,
    frameW: 96, frameH: 96,
    frameCount: 9, fps: 5,
    scale: 0.74, yOffset: 0,
    holdSeconds: 10,
  },
  {
    // Cooking pot — sits at the wanderer's camp (E zone, painted dirt
    // patch with bedroll + fire ring). v4 layout has the camp dirt at
    // (944, 452); we offset the pot west to ~(910, 430) so it sits on
    // the dirt next to the painted fire ring at FIREPIT_POS (980, 470)
    // without occluding it. Wanderer NPC at (920, 480) stands south
    // of the pot. 9 frames at 4fps = slow lazy simmer.
    id: 'cookingpot', asset: 'fx_cookingpot',
    x: 930, y: 430,
    frameW: 112, frameH: 112,
    frameCount: 9, fps: 4,
    scale: 0.6, yOffset: 0,
  },
  {
    // Anvil — sits on the NE smithy stone pad. Nudged south +40px
    // from the v4 default to read as "smith's working area" rather
    // than tucked at the north edge of the pad. Smith NPC at
    // (1000, 300) stands south of the anvil.
    //
    // 9 frames at 6fps continuous loop. Scale 0.6× → ~67px rendered.
    id: 'anvil', asset: 'fx_anvil',
    x: 906, y: 246,
    frameW: 112, frameH: 112,
    frameCount: 9, fps: 6,
    scale: 0.6, yOffset: 0,
  },
  {
    // Scrying basin (LEFT) — flanks the N shrine slab at SHRINE_POS
    // (687, 201). Twin basins at x=650 + x=725 frame the altar so they
    // read as a ceremonial pair guarding the threshold. Oracle NPC at
    // (690, 250) stands south of the slab.
    // 4 frames at 3fps = 1.3s loop, slow swirl on the basin's surface.
    id: 'scryingbasin', asset: 'fx_scryingbasin',
    x: 650, y: 220,
    frameW: 112, frameH: 112,
    frameCount: 4, fps: 3,
    scale: 0.6, yOffset: 0,
  },
  {
    // Scrying basin (RIGHT, twin) — mirror of the left basin across
    // the altar slab center (~x=687). Same animation, same scale.
    // Different id so the FX state Map tracks them independently.
    id: 'scryingbasin2', asset: 'fx_scryingbasin',
    x: 725, y: 220,
    frameW: 112, frameH: 112,
    frameCount: 4, fps: 3,
    scale: 0.6, yOffset: 0,
  },
  // Repurposed as DUNGEON props (used by floor.js room generators):
  //   fx_chestcold      — TREASURE chest (cold mist = riches gleam)
  //   fx_chestfire      — MIMIC chest    (fire = trap warning)
  //   fx_flameskull     — parked, future dungeon ambient prop
  //   fx_dungeon_torch  — animated wall torch in dungeon rooms
  //   fx_dungeon_pillar — decorative pillars in chestrooms
];

// Resolve proximity tiers → effective {peakAlpha, fps, holdSec} based on
// hero distance to the FX center. If fx has no proximity tiers, return
// the static fx.fps + fx.holdSeconds with peakAlpha 1 (backwards-compat
// path for firepit/cookingpot which have no proximity behavior).
function resolveProximity(fx) {
  if (!fx.proximity || fx.proximity.length === 0) {
    return { peakAlpha: 1, fps: fx.fps, holdSec: fx.holdSeconds || 0 };
  }
  const dx = hero.x - fx.x;
  const dy = hero.y - fx.y;
  const dist = Math.hypot(dx, dy);
  const tiers = fx.proximity;     // ordered far → near
  if (dist >= tiers[0].dist) {
    return { peakAlpha: tiers[0].alpha, fps: tiers[0].fps, holdSec: tiers[0].holdSeconds };
  }
  const last = tiers.length - 1;
  if (dist <= tiers[last].dist) {
    return { peakAlpha: tiers[last].alpha, fps: tiers[last].fps, holdSec: tiers[last].holdSeconds };
  }
  for (let i = 0; i < last; i++) {
    const far = tiers[i], near = tiers[i + 1];
    if (dist <= far.dist && dist >= near.dist) {
      const t = (far.dist - dist) / (far.dist - near.dist);
      return {
        peakAlpha: far.alpha + t * (near.alpha - far.alpha),
        fps: far.fps + t * (near.fps - far.fps),
        holdSec: far.holdSeconds + t * (near.holdSeconds - far.holdSeconds),
      };
    }
  }
  return { peakAlpha: tiers[last].alpha, fps: tiers[last].fps, holdSec: tiers[last].holdSeconds };
}

// Per-FX persistent animation state. Keyed by fx.id. Built lazily on
// first access. Each entry tracks where we are in the current cycle:
//   inActive    — true during the playing phase, false during the hold
//   framePhase  — float ∈ [0, frameCount). Position in the active anim.
//                 Advances by dt*fps each frame while active.
//   restElapsed — seconds spent in current rest phase. Advances by dt.
//   lastTime    — wall-clock timestamp of last update (for dt calc).
//
// Why state-based instead of stateless `now % cycleSec`? Because fps
// and holdSec change continuously with hero distance (proximity tiers).
// Stateless math would cause the computed frame to jump as inputs shift.
// State-based math means proximity changes the ADVANCEMENT RATE, never
// the current frame number — animation always plays smoothly through.
const fxStates = new Map();
function getFxState(fx) {
  let s = fxStates.get(fx.id);
  if (!s) {
    s = { inActive: true, framePhase: 0, restElapsed: 0, lastTime: -1 };
    fxStates.set(fx.id, s);
  }
  return s;
}

// Advance the per-FX state by the wall-clock delta since the last
// update. fps and holdSec are the CURRENT (proximity-resolved) values
// — they may differ from frame to frame, which is fine: framePhase
// just advances at the new rate next tick.
function tickFxState(state, fx, fps, holdSec, now) {
  if (state.lastTime < 0) {
    state.lastTime = now;
    return;
  }
  // Clamp dt so a paused/inactive tab resuming doesn't fast-forward
  // through dozens of cycles in one frame.
  const dt = Math.min(now - state.lastTime, 0.1);
  state.lastTime = now;

  if (state.inActive) {
    state.framePhase += dt * fps;
    if (state.framePhase >= fx.frameCount) {
      state.inActive = false;
      state.framePhase = fx.frameCount;     // pin at end (used by fade-out)
      state.restElapsed = 0;
    }
  } else {
    state.restElapsed += dt;
    // If holdSec shrinks (e.g. hero approached the portal during rest)
    // and we're already past the new threshold, exit rest immediately.
    // Reads as "the portal woke up because you walked over."
    if (state.restElapsed >= holdSec) {
      state.inActive = true;
      state.framePhase = 0;
      state.restElapsed = 0;
    }
  }
}

// Draw all hamlet FX overlays. Called between drawHamletBackdrop and
// drawHamletEntities so animated flames sit on top of the painted scene
// but BENEATH NPCs (so an NPC standing in front of the firepit correctly
// occludes the flame).
export function drawHamletFx(ctx) {
  const now = performance.now() / 1000;
  const prevSmoothing = ctx.imageSmoothingEnabled;
  const prevAlpha = ctx.globalAlpha;
  ctx.imageSmoothingEnabled = false;
  for (const fx of HAMLET_FX) {
    const img = images[fx.asset];
    if (!img) continue;

    // Resolve effective rhythm + intensity (proximity-aware if configured)
    const p = resolveProximity(fx);
    const fps = p.fps;
    const holdSec = p.holdSec;
    const peakAlpha = p.peakAlpha;

    // Advance persistent animation state
    const state = getFxState(fx);
    tickFxState(state, fx, fps, holdSec, now);

    // Frame to render: derived from framePhase (which is continuous
    // across fps changes, so no jumps even as proximity shifts the rate)
    const frame = state.inActive
      ? Math.min(Math.floor(state.framePhase), fx.frameCount - 1)
      : 0;

    // activeFactor: 0 in mid-rest, 1 at full active. Smooth fade at
    // the active/rest boundaries (over fadeSec) avoids hard cuts.
    // Convert framePhase (frames) to time-in-active (seconds) via fps.
    const fadeSec = fx.fadeSeconds || 0;
    let activeFactor;
    if (!state.inActive) {
      activeFactor = 0;
    } else if (fadeSec > 0) {
      const timeInActive = state.framePhase / fps;
      const activeSec = fx.frameCount / fps;
      const into = timeInActive;
      const outOf = activeSec - timeInActive;
      if (into < fadeSec) activeFactor = into / fadeSec;
      else if (outOf < fadeSec) activeFactor = outOf / fadeSec;
      else activeFactor = 1;
    } else {
      activeFactor = 1;
    }

    // Final alpha lerps from rest baseline to peak as activeFactor 0→1.
    const restMul = fx.restAlphaMul != null ? fx.restAlphaMul : 1;
    const alpha = peakAlpha * (restMul + (1 - restMul) * activeFactor);
    if (alpha <= 0.01) continue;     // skip rendering when effectively invisible

    const sx = frame * fx.frameW;
    const scale = fx.scale || 1;
    const drawW = fx.frameW * scale;
    const drawH = fx.frameH * scale;
    const yOffset = fx.yOffset || 0;
    ctx.globalAlpha = prevAlpha * alpha;
    ctx.drawImage(
      img,
      sx, 0, fx.frameW, fx.frameH,
      Math.round(fx.x - drawW / 2),
      Math.round(fx.y - drawH / 2 + yOffset),
      drawW, drawH,
    );
  }
  ctx.globalAlpha = prevAlpha;
  ctx.imageSmoothingEnabled = prevSmoothing;
}

// Draw all hamlet entities in world space. Sorted by Y so NPCs that sit
// further down paint over NPCs higher up (standard top-down ordering).
// Called from the in-camera render block in main.js, after drawRoom.
export function drawHamletEntities(ctx) {
  const sorted = HAMLET_ENTITIES.filter(entityAlive).slice().sort((a, b) => a.y - b.y);
  const now = performance.now() / 1000;

  for (const e of sorted) {
    if (e.kind === 'portal') {
      drawPortal(ctx, e, now);
    } else if (e.kind === 'shrine') {
      drawShrine(ctx, e, now);
    } else if (e.kind === 'firepit') {
      drawFirepit(ctx, e, now);
    } else if (e.kind === 'npc') {
      drawNpc(ctx, e, now);
    }
  }

  // Round-7 hamlet visible-growth — Smith brazier. The Smith arrives at
  // floor-2 clear (records.maxFloor >= 2). His forge anchor in the
  // painted scene_v2.jpg shows a cold, dark hearth before he arrives;
  // when he's present, this small flame halo lights up next to him,
  // selling "the forge is hot now." Smaller + dimmer than the central
  // plaza firepit so the eye still reads the firepit as the main warm
  // anchor; this is a secondary warm point that joins the composition.
  // Position offset (-12, +6) from Smith's coords places the halo on
  // his anvil side, just behind his shoulder in the painted scene.
  if (isNpcUnlocked('smith')) {
    const smith = HAMLET_ENTITIES.find(e => e.kind === 'npc' && e.id === 'smith');
    if (smith) {
      const bx = smith.x - 12;
      const by = smith.y + 6;
      const pulse = 0.78 + 0.18 * Math.sin(now * 0.7 + 1.3);
      const haloR = 38;
      const halo = ctx.createRadialGradient(bx, by - 6, 3, bx, by - 6, haloR);
      halo.addColorStop(0, `rgba(255, 165, 90, ${(0.30 * pulse).toFixed(3)})`);
      halo.addColorStop(0.5, `rgba(255, 120, 60, ${(0.14 * pulse).toFixed(3)})`);
      halo.addColorStop(1, 'rgba(255, 90, 50, 0)');
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = halo;
      ctx.fillRect(bx - haloR, by - 6 - haloR, haloR * 2, haloR * 2);
      ctx.restore();
    }
  }

  // ── NPC IDLE ATMOSPHERES (Tier 2 hamlet storytelling, audit T2.7) ──
  // The audit specifically called out: "smith doesn't swing the hammer
  // (the anvil sprite has its own 9-frame animation, but the smith
  // himself is static)." NPCs are single-frame PNGs so we can't animate
  // them frame-by-frame, but we can paint procedural FX at their
  // positions that read as "the smith is hammering / the keeper has a
  // lantern / the gravekeeper tends the dead." Pure stateless math —
  // no allocations, drops cleanly when not rendering.
  //
  // 1. Smith — hammer-strike sparks at the anvil. Synced to the anvil
  //    FX cycle (9 frames @ 6 fps = 1.5 s loop). Sparks burst in the
  //    first 0.2 s of each phase = "the strike", then fade.
  if (isNpcUnlocked('smith')) {
    // Anvil position is (906, 246) — see HAMLET_FX entry for anvil.
    const ax = 906, ay = 246;
    const STRIKE_CYCLE = 1.5;
    const strikePhase = (now % STRIKE_CYCLE) / STRIKE_CYCLE;     // 0 → 1
    if (strikePhase < 0.18) {
      // Spawn 5 sparks, deterministic positions per phase tick so they
      // don't shimmer. Each spark flies up + outward from the anvil.
      const fade = 1 - (strikePhase / 0.18);                       // 1 → 0
      for (let i = 0; i < 5; i++) {
        const angle = -Math.PI * 0.5 + (i - 2) * 0.18 + Math.sin(now * 11 + i) * 0.04;
        const dist = 6 + i * 3 + (1 - fade) * 16;
        const sx = ax + Math.cos(angle) * dist;
        const sy = ay - 4 + Math.sin(angle) * dist;
        const a = (0.55 + i * 0.05) * fade;
        const sz = 1 + (i % 2);
        // Hot orange → cream as fade progresses (real ember physics)
        const r = 255;
        const g = Math.round(170 + (1 - fade) * 60);
        const b = Math.round(80 + (1 - fade) * 60);
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${a.toFixed(3)})`;
        ctx.fillRect(Math.round(sx - sz / 2), Math.round(sy - sz / 2), sz, sz);
      }
    }
  }
  // 2. Keeper — small warm lantern glow at his feet. Always lit (keeper
  //    is the only always-present NPC), reads as "the keeper has a
  //    lantern, this is the welcoming hub." Smaller + cooler than the
  //    smith brazier so the smithy still dominates as the warm anchor.
  {
    const keeper = HAMLET_ENTITIES.find(e => e.kind === 'npc' && e.id === 'keeper');
    if (keeper) {
      const kx = keeper.x;
      const ky = keeper.y + 8;
      const pulse = 0.84 + 0.10 * Math.sin(now * 0.55);
      const haloR = 28;
      const halo = ctx.createRadialGradient(kx, ky, 2, kx, ky, haloR);
      halo.addColorStop(0, `rgba(255, 200, 140, ${(0.20 * pulse).toFixed(3)})`);
      halo.addColorStop(0.5, `rgba(220, 160, 100, ${(0.10 * pulse).toFixed(3)})`);
      halo.addColorStop(1, 'rgba(180, 120, 80, 0)');
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = halo;
      ctx.fillRect(kx - haloR, ky - haloR, haloR * 2, haloR * 2);
      ctx.restore();
    }
  }
  // STAGE-3 CAPSTONE — string lanterns around the plaza (audit T2.8).
  // Once the hamlet is restored (stage 3+, all NPCs arrived), the
  // rebuild fiction earns a celebratory beat: a ring of small warm
  // pulses around the plaza at the position where strung lanterns
  // would hang between rebuilt buildings. Pure dots — no sprite
  // needed. Tinted warm gold + a slight pulse offset per lantern so
  // the line shimmers like it's swaying. Drops cleanly at lower
  // stages — purely additive to the existing scene.
  if (hamletGrowthStage() >= 3) {
    const cx = 689, cy = 378;          // plaza center (matches scene_v4)
    const RING_R = 168;
    const N = 8;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2 + Math.PI / 8;     // phase offset so dots sit between paths
      const lx = cx + Math.cos(a) * RING_R;
      const ly = cy - 24 + Math.sin(a) * RING_R * 0.55;   // squish vertical for top-down
      const flick = 0.78 + 0.18 * Math.sin(now * 1.4 + i * 0.7);
      const haloR = 18;
      const halo = ctx.createRadialGradient(lx, ly, 1, lx, ly, haloR);
      halo.addColorStop(0, `rgba(255, 200, 130, ${(0.34 * flick).toFixed(3)})`);
      halo.addColorStop(0.5, `rgba(220, 160, 90, ${(0.16 * flick).toFixed(3)})`);
      halo.addColorStop(1, 'rgba(180, 120, 70, 0)');
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = halo;
      ctx.fillRect(lx - haloR, ly - haloR, haloR * 2, haloR * 2);
      ctx.restore();
      // Bright pixel core
      ctx.fillStyle = `rgba(255, 230, 180, ${(0.88 * flick).toFixed(3)})`;
      ctx.fillRect(Math.round(lx - 1), Math.round(ly - 1), 2, 2);
    }
  }

  // 3. Gravekeeper — slow cool soul motes drifting upward beside her,
  //    gated on her arrival (stage 2+). Reads as "she tends the dead;
  //    the dead linger near her." 3 motes phased on now over 5 s,
  //    rising 32 px, fading to zero. Cool violet to contrast with the
  //    warm halos elsewhere.
  if (isNpcUnlocked('gravekeeper')) {
    const grave = HAMLET_ENTITIES.find(e => e.kind === 'npc' && e.id === 'gravekeeper');
    if (grave) {
      const MOTE_CYCLE = 5.0;
      for (let i = 0; i < 3; i++) {
        const phase = ((now * 0.36 + i * (MOTE_CYCLE / 3)) % MOTE_CYCLE) / MOTE_CYCLE;
        const sway = Math.sin(now * 0.4 + i * 1.7) * 5;
        const mx = grave.x + 14 + sway + (i - 1) * 6;
        const my = grave.y - 4 - phase * 32;
        const a = (1 - phase) * (1 - phase) * 0.45;
        if (a < 0.03) continue;
        const sz = 1.5 + (i % 2) * 0.5;
        ctx.fillStyle = `rgba(180, 160, 220, ${a.toFixed(3)})`;
        ctx.fillRect(Math.round(mx - sz / 2), Math.round(my - sz / 2), sz, sz);
      }
    }
  }

  // ── AMBIENT LIFE PASS — "place, not stations" ─────────────────────────
  // Audit P3: hamlet was a backdrop with NPC sprites pinned to it. None
  // of the existing FX sold "this place is INHABITED" — only "specific
  // NPCs are doing specific things." This pass adds the small ambient
  // beats that distinguish a place-where-someone-lives from a diorama:
  // smoke from active fires, crows on the graveyard, etc. Each effect
  // is pure stateless math — no allocations, drops cleanly when the
  // gating condition fails.

  // 4. Chimney smoke — thin gray columns rising from active fires.
  //    Only fires count: archivist's brazier (always lit, west zone),
  //    smith's brazier (lit when smith arrives, NE), keeper's lantern
  //    (always lit, central plaza). Each emits 4 phased particles
  //    drifting up + outward, fading to nothing over a 3 s lifecycle.
  //    The columns sell "a fire has been tended for hours"; without
  //    them, the firepit/lantern halos read as static decorative props.
  const _smokeSources = [
    // [x, y, color tint, alpha mul, drift rate, gated]
    [435, 440, '60, 50, 55', 1.0, 1.0, true],            // archivist firepit (always present)
    [820, 595, '70, 60, 60', 0.55, 0.7, true],           // keeper lantern (small, gentle)
  ];
  if (isNpcUnlocked('smith')) {
    _smokeSources.push([894, 240, '80, 60, 50', 1.1, 1.1, true]);  // smith brazier
  }
  for (const [sx, sy, rgb, alphaMul, rateMul] of _smokeSources) {
    const SMOKE_CYCLE = 3.2;
    const PARTS_PER_SOURCE = 4;
    for (let i = 0; i < PARTS_PER_SOURCE; i++) {
      const phase = (((now * rateMul) + i * (SMOKE_CYCLE / PARTS_PER_SOURCE)) % SMOKE_CYCLE) / SMOKE_CYCLE;
      const driftSway = Math.sin(now * 0.6 + i * 2.1) * 6;
      const mx = sx + driftSway * phase;
      const my = sy - 6 - phase * 38;
      // Opacity: ramps in over first 15% of life, fades the rest.
      const fadeIn = Math.min(1, phase / 0.15);
      const fadeOut = 1 - phase;
      const a = fadeIn * fadeOut * fadeOut * 0.32 * alphaMul;
      if (a < 0.02) continue;
      // Particle expands as it rises (smoke physics).
      const sz = 2 + phase * 4.5;
      ctx.fillStyle = `rgba(${rgb}, ${a.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(Math.round(mx), Math.round(my), sz, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 5. Crows over the graveyard — when gravekeeper is unlocked, a single
  //    crow silhouette traces an arc above the NW graveyard zone every
  //    ~22 s. Pure procedural path — no spawn list, no allocations.
  //    Sells "the dead draw scavengers" and gives the graveyard zone
  //    its own silent narrative.
  if (isNpcUnlocked('gravekeeper')) {
    const CROW_CYCLE = 22.0;
    const phase = (now % CROW_CYCLE) / CROW_CYCLE;
    // Crow only visible during the 0.0–0.55 portion of the cycle (it
    // arcs in, crosses, and exits, then "rests off-screen" for the rest).
    if (phase < 0.55) {
      const t = phase / 0.55;       // 0 → 1 across the visible flight
      // Path: enter from far left, arc over graveyard cluster (cx≈580,
      // cy≈210), exit to upper-right beyond the visible scene.
      const cx = 200 + t * 700;
      const cy = 130 + Math.sin(t * Math.PI) * -60;     // arc UP across the graveyard
      // Wing flap — quick sine, alternates the silhouette's wing height.
      const wing = Math.sin(now * 9.2) * 0.5 + 0.5;
      const wingH = 1 + wing * 3;
      ctx.save();
      ctx.globalAlpha = 0.62 * Math.min(1, t * 4) * Math.min(1, (1 - t) * 4);
      ctx.fillStyle = '#0a0410';
      // Body
      ctx.fillRect(Math.round(cx - 3), Math.round(cy - 1), 6, 3);
      // Wings (flapping triangles)
      ctx.beginPath();
      ctx.moveTo(cx - 3, cy);
      ctx.lineTo(cx - 11, cy - wingH);
      ctx.lineTo(cx - 7, cy + 1);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx + 3, cy);
      ctx.lineTo(cx + 11, cy - wingH);
      ctx.lineTo(cx + 7, cy + 1);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }
}

// Small elliptical ground shadow under an entity — anchors it to the painted
// cobblestone so it doesn't feel like it's levitating. Drawn BEFORE the
// entity sprite so the sprite sits on top of the shadow.
//
// Soft radial gradient (not solid fill) — blends into the painted scene's
// own baked shadows without reading as a UI overlay. Same falloff used for
// both hero (hero.js) and NPCs so all entities share a consistent footprint.
function drawGroundShadow(ctx, x, y, radiusX, alpha = 0.22) {
  const radiusY = radiusX * 0.36;
  const sg = ctx.createRadialGradient(x, y, 1, x, y, radiusX);
  sg.addColorStop(0, `rgba(4, 2, 6, ${alpha})`);
  sg.addColorStop(0.6, `rgba(4, 2, 6, ${(alpha * 0.5).toFixed(3)})`);
  sg.addColorStop(1, 'rgba(4, 2, 6, 0)');
  ctx.save();
  ctx.fillStyle = sg;
  ctx.beginPath();
  ctx.ellipse(x, y, radiusX, radiusY, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawPortal(ctx, e, now) {
  // Soft cold halo for the descent point — recolored cold blue to match
  // the new portal sprite's "blue glow rising from below" identity (the
  // cellar entrance with stairs going down into pitch-black depths
  // illuminated by a faint blue glow). Pulse stays CALM (range 0.7-1.0,
  // slow freq) so it reads as ambient atmosphere rather than animation.
  //
  // ROUND-6 ENDGAME RETUNE — once the player has cleared at least one
  // ascent (records.runsCompleted >= 1, the canonical "beat the game"
  // signal), the portal halo shifts cold blue → smouldering ember red.
  // The wound looks back through the door now. It's a one-line visual
  // change but it's the only persistent "the hamlet knows you killed
  // the Ember Tyrant" beat in the world — gives ascent #2's player a
  // visible artifact of their first victory every time they walk to
  // the gate. Faint enough not to clash with the cold portal sprite
  // itself; layered enough to read as "something has changed here".
  const cleared = (records.runsCompleted | 0) >= 1;
  const pulse = 0.85 + 0.15 * Math.sin(now * 0.6);
  // Hierarchical dominance bump (Tier 1 art-direction sweep): the
  // descent portal is the single most important interactable in the
  // hamlet, but at radius 56 + alpha 0.32 it read at the same visible
  // scale as an NPC. Bumped to 96 + 0.48 so the player's eye lands
  // here on entry. Keeps the same calm pulse rhythm — louder, not
  // busier. A thin ring at the EDGE of the halo gives the radius
  // a clean read (otherwise the gradient just fades into ground).
  const haloR = 96;
  const halo = ctx.createRadialGradient(e.x, e.y + 4, 6, e.x, e.y + 4, haloR);
  if (cleared) {
    halo.addColorStop(0, `rgba(230, 130, 70, ${(0.48 * pulse).toFixed(3)})`);
    halo.addColorStop(0.45, `rgba(200, 90, 55, ${(0.24 * pulse).toFixed(3)})`);
    halo.addColorStop(1, 'rgba(160, 60, 50, 0)');
  } else {
    halo.addColorStop(0, `rgba(140, 190, 240, ${(0.48 * pulse).toFixed(3)})`);
    halo.addColorStop(0.45, `rgba(110, 160, 225, ${(0.22 * pulse).toFixed(3)})`);
    halo.addColorStop(1, 'rgba(90, 140, 210, 0)');
  }
  ctx.fillStyle = halo;
  ctx.fillRect(e.x - haloR, e.y + 4 - haloR, haloR * 2, haloR * 2);
  // Edge ring — thin stroke at the halo radius. Without this, the
  // halo just fades into the painted ground; the ring gives the
  // player a clear "this is the descent zone" boundary at 96 px.
  ctx.save();
  ctx.strokeStyle = cleared
    ? `rgba(230, 130, 70, ${(0.30 * pulse).toFixed(3)})`
    : `rgba(140, 190, 240, ${(0.30 * pulse).toFixed(3)})`;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 9]);
  ctx.beginPath();
  ctx.arc(e.x, e.y + 4, haloR - 4, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // Round-7 hamlet visible-growth — post-ascent ember motes drifting
  // up from the portal pad. Builds on the Round-6 halo color shift
  // (cold blue → ember red after first ascent): now embers literally
  // rise from the gate, reinforcing "the wound looks back through
  // this door". Pure stateless math — 6 motes phased on `now`, no
  // array maintenance, no per-frame allocation. Skipped pre-ascent;
  // the cold portal stays calm.
  if (cleared) {
    const MOTE_LIFE = 4.0;            // seconds per mote cycle
    for (let i = 0; i < 6; i++) {
      // Each mote cycles independently — staggered start phases so
      // the rise reads as continuous, not synchronized.
      const phase = ((now * 0.42 + i * (MOTE_LIFE / 6)) % MOTE_LIFE) / MOTE_LIFE;
      const sway = Math.sin(now * 0.35 + i * 1.7) * 14;
      const mx = e.x + sway + ((i % 2) * 2 - 1) * 6;
      // Rises 44px over the cycle, fading as it rises.
      const my = e.y - 4 - phase * 44;
      const a = (1 - phase) * 0.55 * pulse;       // halo's pulse keeps the embers in sync
      if (a < 0.04) continue;
      const sz = 1.6 + (i % 3) * 0.4;
      // Warm-to-bright gradient through the mote's lifetime: hot
      // orange at spawn, cooling to cream as it rises (matches real
      // ember physics — bright at the source, paler at the top).
      const r = 255;
      const g = Math.round(140 + phase * 60);
      const b = Math.round(60 + phase * 50);
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${a.toFixed(3)})`;
      ctx.fillRect(Math.round(mx - sz / 2), Math.round(my - sz / 2), sz, sz);
    }
  }
}

function drawFirepit(ctx, e, now) {
  // Warm radial halo. Pulse calmed to 0.7-1.0 range at slow freq so
  // the plaza area no longer reads as "breathing" with each cycle.
  // The old 0.2-1.0 pulse with additive blend was the major source
  // of the whole-map breathing effect — fix Session O.
  const pulse = 0.85 + 0.15 * Math.sin(now * 0.5);
  const haloR = 64;
  const halo = ctx.createRadialGradient(e.x, e.y - 8, 4, e.x, e.y - 8, haloR);
  halo.addColorStop(0, `rgba(255, 175, 95, ${(0.22 * pulse).toFixed(3)})`);
  halo.addColorStop(0.45, `rgba(255, 130, 70, ${(0.11 * pulse).toFixed(3)})`);
  halo.addColorStop(1, 'rgba(255, 100, 60, 0)');
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = halo;
  ctx.fillRect(e.x - haloR, e.y - 8 - haloR, haloR * 2, haloR * 2);
  ctx.restore();
}

function drawShrine(ctx, e) {
  // Cool blue radial. Pulse calmed (0.7-1.0 range, slow freq) for the
  // same reason as firepit — the previous 0.1-1.0 range with additive
  // blend was making the shrine area visibly breathe.
  const now = performance.now() / 1000;
  const pulse = 0.85 + 0.15 * Math.sin(now * 0.4);
  const haloR = 52;
  const halo = ctx.createRadialGradient(e.x, e.y - 8, 4, e.x, e.y - 8, haloR);
  halo.addColorStop(0, `rgba(140, 180, 230, ${(0.20 * pulse).toFixed(3)})`);
  halo.addColorStop(0.5, `rgba(110, 140, 210, ${(0.10 * pulse).toFixed(3)})`);
  halo.addColorStop(1, 'rgba(100, 130, 200, 0)');
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = halo;
  ctx.fillRect(e.x - haloR, e.y - 8 - haloR, haloR * 2, haloR * 2);
  ctx.restore();
}

function drawNpc(ctx, e, now) {
  // Prefer the v2 PixelLab-generated sprite (npc_v2_<id>) — these match
  // the mage's style (hooded silhouettes, dark fantasy palette, sharp
  // pixel edges). Fall back to the older grid sprites if v2 didn't load.
  const spr = images[`npc_v2_${e.id}`]
    || images[`hamlet_npcp_${e.spriteIdx}`]
    || images[`hamlet_npc_${e.spriteIdx}`];
  if (!spr) return;
  // Shroud treatment — NPCs whose unlock condition hasn't been met yet
  // render at lower opacity with no warm proximity tint, signaling
  // "present but not yet arrived". The player can still walk up + press E
  // to read their unlockHint as a card. Keeper is always unlocked, so
  // this only affects the other five.
  const unlocked = isNpcUnlocked(e.id);
  // Whether we're drawing the v2 sprite (changes default size + scale).
  const isV2 = !!images[`npc_v2_${e.id}`];
  // Breathing bob so the NPC doesn't feel frozen. Phase offset by x so
  // multiple NPCs don't breathe in sync. Audit H8: previous ±1.2 px was
  // invisible at HAMLET_ZOOM=1.75 — NPCs read as cardboard standees.
  // Bumped to ±2.6 px (= ±4.5 px on screen at the hamlet zoom). Adds
  // a slight horizontal sway component too — sin at a different freq +
  // tiny amplitude — so the NPC reads as alive rather than mechanically
  // pumping up and down. Per-NPC phase offset preserved so the line of
  // figures doesn't sync.
  const bob = Math.sin(now * 1.5 + e.x * 0.01) * 2.6;
  const sway = Math.sin(now * 0.9 + e.x * 0.013) * 0.8;
  // NPC draw height:
  //   v2 sprites — trimmed at import (no transparent padding), so they
  //   are 100% content. Drawn at 52px visible height — slightly taller
  //   than hero's ~45px visible at HERO_DRAW_HAMLET=48 × ~93% fill, which
  //   gives hub NPCs a touch more imposing presence than the hero passing
  //   through. Bottom-anchored draw lands feet correctly at e.y.
  //   Old grid sprites — fall back to 56px × per-NPC drawScale to
  //   compensate for source-artwork variance (kept for backwards compat).
  const drawH = isV2 ? 52 : 56 * (e.drawScale || 1);
  const drawW = spr.width * (drawH / spr.height);
  // Ground shadow — radius scales with sprite width so wider characters
  // (smith with hammer-over-shoulder, wanderer with backpack) get
  // proportionally wider shadows that anchor them visually. Shadow is
  // STATIONARY (no `bob` offset) so the breathing motion lifts the
  // character off the shadow each cycle — this is what sells "grounded"
  // movement vs "shadow-and-character-locked-together" floating feel.
  const shadowR = Math.max(10, drawW * 0.42);
  drawGroundShadow(ctx, e.x, e.y - 1, shadowR, 0.28);

  // Warm proximity glow when the hero is close — signals interactivity
  // and makes the scene feel responsive to your presence.
  const dx = hero.x - e.x, dy = hero.y - e.y;
  const d = Math.hypot(dx, dy);
  // Proximity glow extends 60% beyond the interactR — players see the NPC
  // light up before they're close enough to trigger the "E · TALK" prompt,
  // signaling "this is interactive" without being noisy at long range.
  // Locked NPCs use a cool muted halo instead of the NPC's warm tint so
  // they read as "withdrawn" rather than "ready to chat".
  const NPC_GLOW_RANGE_MULT = 1.6;
  if (d < e.interactR * NPC_GLOW_RANGE_MULT) {
    const proximity = Math.max(0, 1 - d / (e.interactR * NPC_GLOW_RANGE_MULT));
    let R, G, B, alpha;
    if (unlocked) {
      const tint = NPCS[e.id]?.tint || '#f4d9a0';
      const hex = tint.replace('#', '');
      const n = parseInt(hex.length === 3 ? hex.split('').map(c => c + c).join('') : hex, 16);
      R = (n >> 16) & 255; G = (n >> 8) & 255; B = n & 255;
      alpha = 0.28;
    } else {
      // Muted slate-blue for shrouded figures — reads as "veiled" against
      // the warm hamlet palette without going so dark it feels broken.
      R = 120; G = 130; B = 160;
      alpha = 0.18;
    }
    const glow = ctx.createRadialGradient(e.x, e.y, 4, e.x, e.y, 44);
    glow.addColorStop(0, `rgba(${R},${G},${B},${(alpha * proximity).toFixed(3)})`);
    glow.addColorStop(1, `rgba(${R},${G},${B},0)`);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = glow;
    ctx.fillRect(e.x - 44, e.y - 44, 88, 88);
    ctx.restore();
  }

  // Shroud the sprite itself — locked NPCs draw at 55% alpha so their
  // silhouette is still readable for compositional balance, but they
  // visibly "haven't arrived yet". Saves/restores around drawImage so
  // the alpha doesn't leak to the unread-content dot below.
  if (!unlocked) {
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.drawImage(spr, Math.round(e.x - drawW / 2 + sway), Math.round(e.y - drawH + bob), drawW, drawH);
    ctx.restore();
  } else {
    ctx.drawImage(spr, Math.round(e.x - drawW / 2 + sway), Math.round(e.y - drawH + bob), drawW, drawH);
  }

  // Locked-NPC question mark — small dim "?" floating above the sprite,
  // reusing the unread-dot positioning logic. Tells the player at a
  // glance "there is someone here, but they are waiting for something".
  // Suppressed when in interact range so the prompt below takes over.
  if (!unlocked && d > e.interactR) {
    const pulse = 0.55 + 0.25 * Math.sin(now * 1.6 + e.x * 0.013);
    const qX = Math.round(e.x);
    const qY = Math.round(e.y - drawH - 10 + bob * 0.6);
    ctx.save();
    ctx.font = 'bold 14px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Soft halo behind the glyph for legibility against the painted scene.
    const halo = ctx.createRadialGradient(qX, qY, 1, qX, qY, 14);
    halo.addColorStop(0, `rgba(180, 190, 220, ${(0.32 * pulse).toFixed(3)})`);
    halo.addColorStop(1, 'rgba(180, 190, 220, 0)');
    ctx.fillStyle = halo;
    ctx.fillRect(qX - 14, qY - 14, 28, 28);
    ctx.fillStyle = `rgba(210, 215, 235, ${(0.78 * pulse).toFixed(3)})`;
    ctx.fillText('?', qX, qY);
    ctx.restore();
    return;   // skip the unread-content dot path for locked NPCs
  }

  // ── Unread-content indicator ─────────────────────────────────────────
  // Floats a small "•" above the NPC's head when they have an unseen
  // topic OR an unread arc-stage. Both helpers are exported by hamlet.js
  // but were never wired into the world view — players had to walk up
  // and open the modal to discover something was new. This surfaces it
  // at-a-glance from across the plaza.
  //
  // Unread-content dot. Two distinct colors so the player can tell at
  // a glance WHICH kind of new content is waiting:
  //   CYAN  = unseen TOPIC (new chip in the modal — discrete, novel)
  //   GOLD  = unread arc-stage paragraph (the NPC has advanced)
  // Cyan takes priority when both apply, since topics are what the
  // player will actively click on. Without the split, a player walked
  // up expecting new chips, found them all grey, and lost trust in
  // the cue. Suppressed when within interact range — the player is
  // already engaging.
  const hasTopic = (typeof hasUnseenTopics === 'function' && hasUnseenTopics(e.id));
  const hasArc = (typeof hasUnreadDialogue === 'function' && hasUnreadDialogue(e.id));
  if ((hasTopic || hasArc) && d > e.interactR) {
    const pulse = 0.7 + 0.3 * Math.sin(now * 3.5 + e.x * 0.01);
    const dotX = Math.round(e.x);
    const dotY = Math.round(e.y - drawH - 14 + bob * 0.6);
    // Pick palette by precedence: topic > arc.
    const haloColor = hasTopic ? '160, 232, 255' : '244, 217, 160';   // cyan vs gold
    const coreColor = hasTopic ? '220, 245, 255' : '255, 240, 200';
    // Soft halo behind the dot for visibility against the painted scene
    const halo = ctx.createRadialGradient(dotX, dotY, 1, dotX, dotY, 12);
    halo.addColorStop(0, `rgba(${haloColor}, ${(0.55 * pulse).toFixed(3)})`);
    halo.addColorStop(1, `rgba(${haloColor}, 0)`);
    ctx.fillStyle = halo;
    ctx.fillRect(dotX - 12, dotY - 12, 24, 24);
    // Crisp pixel dot core — 3px square at integer coords stays sharp
    // through the camera zoom without bilinear smear.
    ctx.fillStyle = `rgba(${coreColor}, ${(0.85 * pulse).toFixed(3)})`;
    ctx.fillRect(dotX - 1, dotY - 1, 3, 3);
  }
}

// Interact prompt — floating pill above the nearest interactable. Drawn in
// WORLD space (inside the camera transform) so it moves naturally with the
// scene and scales with zoom pulses.
export function drawHamletInteractPrompt(ctx) {
  if (!_nearest) return;
  let label;
  // Subtext: a small italic line shown UNDER the pill. Used for locked
  // NPCs to surface the unlock-hint passively (the writing is great \u2014
  // it deserves to read at a glance, not be gated behind a button-press
  // that pushes a notification card). Phase 3 fix #5 extended this to
  // the portal too \u2014 the subtext-color triplet defaults to slate-blue
  // (locked-figure language) but the portal overrides to an embered
  // amber that reads as "what's down there is hot."
  let subtext = null;
  let subtextRgb = '180, 190, 220';     // slate-blue default for locked NPCs
  // Phase 4.6 (deferred) — secondary subtext for the daily-rite teaser
  // at the portal. Two-line format: portal subtext = lore line, dailyText
  // = today's challenge / streak. Only set when player is at the portal,
  // not currently on a daily run, and the day's rite hasn't been
  // completed yet. The daily lives in its own line + color so it
  // visually sits as a "second beat" beneath the lore subtitle.
  let dailyText = null;
  if (_nearest.kind === 'npc') {
    // Locked NPCs render as "A SHROUDED FIGURE" \u2014 preserves the surprise
    // of the named arrival cinematic when they finally unlock, while
    // still letting the player E-press to read the unlock condition.
    if (!isNpcUnlocked(_nearest.id)) {
      label = 'E  \u00b7  A SHROUDED FIGURE';
      // Pull the diegetic unlock hint into a passive subline. This is
      // the same string that pushNotification() shows on E-press in
      // openDialogue() \u2014 surfacing it ambiently means a player can
      // tour the hamlet, see all five locked figures, and learn what
      // each is waiting on without firing five notifications.
      const hint = NPCS[_nearest.id]?.unlockHint;
      if (hint) subtext = hint;
    } else {
      const name = NPCS[_nearest.id]?.name || 'Traveler';
      label = 'E  \u00b7  ' + name.toUpperCase();
    }
  } else if (_nearest.kind === 'portal') {
    label = 'E  \u00b7  DESCEND';
    // Phase 3 audit fix #5 \u2014 give the portal a one-line subtitle so the
    // player has a NARRATIVE anchor for the place they're walking into.
    // Pre-descent the line is a foreboding general descriptor; once the
    // player has reached deeper floors, the subtitle escalates to name
    // the next biome they remember; once they've completed a run, it
    // reads as quiet acknowledgment that the ruin endures and so do
    // they. Reads diegetic, not gamey ("press E to start floor 1").
    const _maxFloor = records?.maxFloor | 0;
    const _runsCompleted = records?.runsCompleted | 0;
    if (_runsCompleted >= 1) {
      subtext = 'the ruin endures.   so do you.';
    } else if (_maxFloor >= 4) {
      subtext = 'the inferno waits.   the tyrant has not forgotten.';
    } else if (_maxFloor >= 3) {
      subtext = 'the abyss listens.   bring no kindness.';
    } else if (_maxFloor >= 2) {
      subtext = 'the vault holds its silences still.';
    } else if (_maxFloor >= 1) {
      subtext = 'the crypt waits cold below.';
    } else {
      subtext = 'below:   the unmade ruins of the city that was.';
    }
    // Warm amber for the portal subtitle — matches the post-ascent ember
    // motes on the portal sprite (hamletScene.js:779-801) so the sub-
    // line reads as the same "fire below" color language. Stays subtle
    // (mid-saturation, mid-brightness) so it doesn't overpower the gold
    // primary label.
    subtextRgb = '210, 160, 110';
    // Phase 4.6 (deferred) — daily-rite teaser. Surfaces today's challenge
    // (curse + relic) AND the player's current streak so the hub
    // acknowledges the daily as a meta-loop, not just a menu mode. Three
    // states with priority:
    //   1. activeForRun → "the rite is upon you" (already inside a daily)
    //   2. completedToday → "✓ today's rite mastered · X-day streak"
    //   3. otherwise → "today's rite: <curse> + <relic>  ·  X-day streak"
    // Only the third state should nudge the player toward the menu, so
    // it appends a quiet "menu → daily" cue at the end. The other two
    // are status reads, not calls-to-action.
    try {
      if (daily && daily.activeForRun) {
        dailyText = 'the rite is upon you.';
      } else if (typeof hasCompletedToday === 'function' && hasCompletedToday()) {
        const streakStr = (daily && daily.streak > 0) ? `   ·   ${daily.streak}-day streak` : '';
        dailyText = `✓ today's rite mastered${streakStr}`;
      } else {
        const c = getTodayChallenge();
        if (c) {
          const streakStr = (daily && daily.streak > 0) ? `   ·   ${daily.streak}-day streak` : '';
          const curse = (c.curseName || '').toLowerCase();
          const relic = (c.relicName || '').toLowerCase();
          dailyText = `today's rite: ${curse} + ${relic}${streakStr}`;
        }
      }
    } catch (_e) { /* daily not loaded yet — show no teaser */ }
  } else if (_nearest.kind === 'noticeboard') {
    label = 'E  \u00b7  READ';
  } else {
    return;
  }

  const now = performance.now() / 1000;
  const floatOff = Math.sin(now * 2.2) * 3;
  const promptY = _nearest.y - (_nearest.kind === 'portal' ? 110 : _nearest.kind === 'noticeboard' ? 60 : 82) + floatOff;

  ctx.save();
  ctx.font = 'bold 11px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const m = ctx.measureText(label);
  const padX = 10;
  const w = m.width + padX * 2;
  const h = 20;
  const x = _nearest.x - w / 2;
  const y = promptY - h / 2;

  ctx.fillStyle = 'rgba(14, 10, 16, 0.88)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(201, 168, 106, 0.8)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.fillStyle = '#f4d9a0';
  ctx.fillText(label, _nearest.x, promptY);

  // Subtext line \u2014 only renders when set (currently locked NPCs only).
  // Italic 9.5px Georgia, soft slate halo for legibility against the
  // painted backdrop. No pill \u2014 the line is meant to read as quiet
  // hand-written counsel under the louder label.
  if (subtext) {
    ctx.font = 'italic 9.5px Georgia, serif';
    const subY = promptY + h / 2 + 9;
    const sm = ctx.measureText(subtext);
    const subPad = 8;
    const subW = sm.width + subPad * 2;
    const pulse = 0.65 + 0.20 * Math.sin(now * 1.3);
    // Faint dark backdrop strip \u2014 keeps the words legible against busy
    // regions of the painted scene without weighting the prompt the way
    // a full pill would.
    ctx.fillStyle = 'rgba(10, 10, 16, 0.55)';
    ctx.fillRect(_nearest.x - subW / 2, subY - 7, subW, 14);
    ctx.fillStyle = `rgba(${subtextRgb}, ${(0.78 * pulse).toFixed(3)})`;
    ctx.fillText(subtext, _nearest.x, subY);
  }
  // Phase 4.6 (deferred) \u2014 daily-rite second line under the lore subtitle.
  // Cyan tint distinguishes it from the lore line above (warm amber):
  // lore is "what's down there in general," daily is "what's down there
  // SPECIFICALLY today." Same backdrop strip pattern keeps it legible
  // against the painted backdrop. Pulse slower (1.0 vs 1.3) so the two
  // lines breathe at slightly different rhythms \u2014 reads as separate
  // information, not one stuttering line.
  if (dailyText) {
    ctx.font = 'italic 9px Georgia, serif';
    // Stack 12px below the lore subtext when both exist; otherwise
    // sit at the same height the lore would have used.
    const subY = promptY + h / 2 + (subtext ? 21 : 9);
    const sm = ctx.measureText(dailyText);
    const subPad = 8;
    const subW = sm.width + subPad * 2;
    const pulse = 0.70 + 0.15 * Math.sin(now * 1.0);
    ctx.fillStyle = 'rgba(10, 10, 16, 0.55)';
    ctx.fillRect(_nearest.x - subW / 2, subY - 6, subW, 13);
    // Cyan-cream \u2014 matches the essence-trade colour family used elsewhere
    // for "meta-loop" UI (death screen essence header, daily-mode menu
    // hint). Player learns "this colour means meta-progression."
    ctx.fillStyle = `rgba(160, 220, 230, ${(0.82 * pulse).toFixed(3)})`;
    ctx.fillText(dailyText, _nearest.x, subY);
  }
  ctx.restore();
}

// Called by main.js on E-key press while in the hamlet. Returns a small
// object describing what to do, or null if nothing is in interact range.
export function consumeHamletInteract() {
  if (!_nearest) return null;
  if (_nearest.kind === 'portal') return { action: 'portal' };
  if (_nearest.kind === 'npc') return { action: 'dialogue', npcId: _nearest.id };
  if (_nearest.kind === 'noticeboard') return { action: 'noticeboard' };
  return null;
}
