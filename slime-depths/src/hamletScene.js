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
import { NPCS } from './hamlet.js';
import { drawHamletFloor, isHamletWalkable, HAMLET_H } from './hamletFloor.js';

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

// Hero spawn — south entry path, ~80px inside the compound from the south
// wall gap. Bitmap-validated to land on cobble. See scripts/hamlet_audit.py
// (analysis script) and scripts/hamlet_audit.json (validated coords).
export const HAMLET_HERO_SPAWN = { x: 688, y: 687 };

// Zone anchors — pixel-detected positions on the 1376×768 Scene v2 backdrop.
// Located by scanning the visual for fire-orange + portal-blue color signatures
// (see __dbg + the fire/portal cluster detection in the hamletFloor module).
// Earlier values were guessed at y=580; the actual painted features are at
// y=361 (firepit) and y=367 (portal) — they're in the upper plaza zone, not
// the lower zone I'd assumed.
const PORTAL_POS   = { x: 685, y: 367 };   // glowing rune circle
const SHRINE_POS   = { x: 702, y: 207 };   // top altar candles
const FIREPIT_POS  = { x: 778, y: 356 };   // stone firepit + flame

// NPC world positions — one per district, every position verified to
// land in a walkable, terrain-correct tile. spriteIdx maps to the
// pixel-art hamlet_npcp sheet (3×2):
//   0 keeper | 1 smith  | 2 archivist
//   3 grave  | 4 oracle | 5 wanderer
export const HAMLET_ENTITIES = [
  { kind: 'portal',                                 x: PORTAL_POS.x,  y: PORTAL_POS.y,  interactR: 80 },
  { kind: 'shrine',                                 x: SHRINE_POS.x,  y: SHRINE_POS.y,  interactR: 0  },
  { kind: 'firepit',                                x: FIREPIT_POS.x, y: FIREPIT_POS.y, interactR: 0  },
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
  // drawScale lets us compensate for source-artwork variance — some NPC
  // sprites fill less of their cell than others, so we scale them up
  // visually without re-authoring the art. 1.0 = default 56px tall.
  { kind: 'npc', id: 'keeper',      spriteIdx: 0,   x: 778, y: 412, interactR: 50, drawScale: 1.4 },
  { kind: 'npc', id: 'smith',       spriteIdx: 1,   x: 992, y: 308, interactR: 50 },
  { kind: 'npc', id: 'archivist',   spriteIdx: 2,   x: 380, y: 464, interactR: 50 },
  { kind: 'npc', id: 'gravekeeper', spriteIdx: 3,   x: 519, y: 288, interactR: 50 },
  { kind: 'npc', id: 'oracle',      spriteIdx: 4,   x: 702, y: 276, interactR: 50, drawScale: 1.4 },
  { kind: 'npc', id: 'wanderer',    spriteIdx: 5,   x: 809, y: 484, interactR: 50 },
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
export const HAMLET_OBSTACLES = [
  // Scene Overview backdrop — props are baked into the image, not real
  // sprites. No collision circles needed; bounding-rect walkability in
  // hamletFloor.js handles edge clamping. Add circles back here if the
  // hero needs to be blocked from a specific painted feature (statue,
  // tree clump, etc.) that's smaller than a wall.
];

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
  // Soft warm halo for the descent point. Pulse is intentionally CALM
  // (range 0.7-1.0, slow freq) so it reads as ambient atmosphere
  // rather than active animation. The previous 0.1-1.0 pulse with
  // additive blend made surrounding tiles visibly brighten/dim every
  // cycle, which read as the whole map "breathing."
  const pulse = 0.85 + 0.15 * Math.sin(now * 0.6);
  const haloR = 56;
  const halo = ctx.createRadialGradient(e.x, e.y + 4, 4, e.x, e.y + 4, haloR);
  halo.addColorStop(0, `rgba(255, 180, 90, ${(0.30 * pulse).toFixed(3)})`);
  halo.addColorStop(1, 'rgba(255, 180, 90, 0)');
  ctx.fillStyle = halo;
  ctx.fillRect(e.x - haloR, e.y + 4 - haloR, haloR * 2, haloR * 2);
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
  // Prefer the new pixel-art NPC sprite (hamlet_npcp_*) — it matches the
  // knight's pixel density. Fall back to the old chibi stand-in sheet
  // (hamlet_npc_*) only if the pixel sheet didn't load.
  const spr = images[`hamlet_npcp_${e.spriteIdx}`] || images[`hamlet_npc_${e.spriteIdx}`];
  if (!spr) return;
  // Gentle breathing bob so the NPC doesn't feel frozen. Phase offset by x
  // so multiple NPCs don't breathe in sync.
  const bob = Math.sin(now * 1.5 + e.x * 0.01) * 1.2;
  // NPC draw height — base 56px, scaled by per-NPC drawScale to compensate
  // for source-artwork variance (some NPC sprites fill less of their cell
  // than others, so they look smaller without scaling).
  const drawH = 56 * (e.drawScale || 1);
  const drawW = spr.width * (drawH / spr.height);
  // Ground shadow — kept SUBTLE (smaller + low alpha) so NPCs don't look
  // like they're floating on a black disc. Previous radius 22 / alpha 0.55
  // made the elliptical shadow read as bigger than the NPC's feet
  // silhouette, especially against the new pixel-art floor where every
  // detail competes for attention.
  drawGroundShadow(ctx, e.x, e.y + bob - 1, 11, 0.22);

  // Warm proximity glow when the hero is close — signals interactivity
  // and makes the scene feel responsive to your presence.
  const dx = hero.x - e.x, dy = hero.y - e.y;
  const d = Math.hypot(dx, dy);
  // Proximity glow extends 60% beyond the interactR — players see the NPC
  // light up before they're close enough to trigger the "E · TALK" prompt,
  // signaling "this is interactive" without being noisy at long range.
  const NPC_GLOW_RANGE_MULT = 1.6;
  if (d < e.interactR * NPC_GLOW_RANGE_MULT) {
    const proximity = Math.max(0, 1 - d / (e.interactR * NPC_GLOW_RANGE_MULT));
    const tint = NPCS[e.id]?.tint || '#f4d9a0';
    const hex = tint.replace('#', '');
    const n = parseInt(hex.length === 3 ? hex.split('').map(c => c + c).join('') : hex, 16);
    const R = (n >> 16) & 255, G = (n >> 8) & 255, B = n & 255;
    const glow = ctx.createRadialGradient(e.x, e.y, 4, e.x, e.y, 44);
    glow.addColorStop(0, `rgba(${R},${G},${B},${(0.28 * proximity).toFixed(3)})`);
    glow.addColorStop(1, `rgba(${R},${G},${B},0)`);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = glow;
    ctx.fillRect(e.x - 44, e.y - 44, 88, 88);
    ctx.restore();
  }

  ctx.drawImage(spr, Math.round(e.x - drawW / 2), Math.round(e.y - drawH + bob), drawW, drawH);
}

// Interact prompt — floating pill above the nearest interactable. Drawn in
// WORLD space (inside the camera transform) so it moves naturally with the
// scene and scales with zoom pulses.
export function drawHamletInteractPrompt(ctx) {
  if (!_nearest) return;
  let label;
  if (_nearest.kind === 'npc') {
    const name = NPCS[_nearest.id]?.name || 'Traveler';
    label = 'E  \u00b7  ' + name.toUpperCase();
  } else if (_nearest.kind === 'portal') {
    label = 'E  \u00b7  DESCEND';
  } else {
    return;
  }

  const now = performance.now() / 1000;
  const floatOff = Math.sin(now * 2.2) * 3;
  const promptY = _nearest.y - (_nearest.kind === 'portal' ? 110 : 82) + floatOff;

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
  ctx.restore();
}

// Called by main.js on E-key press while in the hamlet. Returns a small
// object describing what to do, or null if nothing is in interact range.
export function consumeHamletInteract() {
  if (!_nearest) return null;
  if (_nearest.kind === 'portal') return { action: 'portal' };
  if (_nearest.kind === 'npc') return { action: 'dialogue', npcId: _nearest.id };
  return null;
}
