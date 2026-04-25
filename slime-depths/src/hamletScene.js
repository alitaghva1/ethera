// ============================================================================
// HAMLET SCENE — canvas version of the between-run hub (Approach B)
//
// Replaces the DOM-overlay hamlet with a walkable room the Knight physically
// moves through. NPCs are world-positioned chibi sprites. A descent portal
// is a painted object — walking into it + pressing E starts a run. Dialogue
// still reuses the existing DOM dialogueEl overlay (so NPC arc content
// doesn't need to change).
//
// Coordinate system: world space, same as combat rooms. Room is 20×14 tiles
// at 48px = 960×672 world units. NPC x/y values are hand-tuned from the
// existing DOM hamlet percentages (all bottom-third of backdrop).
//
// Feature flag: `window.__canvasHamlet === true` → canvas path; else the
// original DOM hamlet still runs (safe rollout).
// ============================================================================
import { hero } from './hero.js';
import { images } from './loader.js';
import { NPCS } from './hamlet.js';
import { drawHamletFloor, isHamletWalkable, CAINOS_TILE } from './hamletFloor.js';

// DIORAMA COMPOSITION — the painted backdrop already has three implicit
// bands: sky (top ~30%), buildings (middle ~40%), and cobblestone ground
// (bottom ~30%). Characters walk exclusively in the painted ground band
// so the scene reads as a stage where NPCs stand on real floor rather
// than float over a mural. Camera is locked (see main.js enterHamletCanvas)
// so the hero can't walk up into the sky.
//
// Legacy rect Y-clamp constants — preserved as exports for back-compat
// with main.js's old call site, but the *actual* boundary check is now
// the WALKABLE_GRID lookup via isHamletWalkable(). Setting them to
// extreme values so the legacy clamp is effectively a no-op.
export const HAMLET_WALK_Y_MIN = 0;
export const HAMLET_WALK_Y_MAX = 672;

// Hero spawn — south-entrance gateway pad at world (480, 576). This is
// inside the SOUTH_ENTRANCE zone (col 13-17, row 17-19). The plaza sits
// directly above it so the player walks NORTH from spawn into the hamlet
// proper. Tile center for col=15, row=18 = (15*32+16, 18*32+16) = (496, 592)
// but we offset to (480, 576) which keeps the hero clear of the south
// entrance's southernmost row (row 19) where they could clip into the wall.
export const HAMLET_HERO_SPAWN = { x: 480, y: 576 };

// Zone anchors — named positions for every meaningful location in the
// hamlet. Each anchor is verified inside its zone's tile range:
//   PORTAL_POS at col 19 row 13 = central_plaza east side
//   SHRINE_POS at col 15 row 4  = north_shrine center (statue position)
//   FIREPIT_POS at col 12 row 13 = central_plaza west side
const PORTAL_POS   = { x: 608, y: 416 };  // plaza east — descent tile
const SHRINE_POS   = { x: 496, y: 144 };  // shrine center
const FIREPIT_POS  = { x: 384, y: 416 };  // plaza west — warm halo

// NPC world positions — one per district, every position verified to
// land in a walkable, terrain-correct tile. spriteIdx maps to the
// pixel-art hamlet_npcp sheet (3×2):
//   0 keeper | 1 smith  | 2 archivist
//   3 grave  | 4 oracle | 5 wanderer
export const HAMLET_ENTITIES = [
  { kind: 'portal',                                 x: PORTAL_POS.x,  y: PORTAL_POS.y,  interactR: 80 },
  { kind: 'shrine',                                 x: SHRINE_POS.x,  y: SHRINE_POS.y,  interactR: 0  },
  { kind: 'firepit',                                x: FIREPIT_POS.x, y: FIREPIT_POS.y, interactR: 0  },
  // KEEPER — at the plaza, NW of fountain. Shop counter in the hub heart.
  // tile col 13 row 12 = plaza interior. Moved north so keeper doesn't
  // visually stand inside the south bench.
  { kind: 'npc', id: 'keeper',      spriteIdx: 0,   x: 432, y: 384, interactR: 50 },
  // SMITH — at south_entrance, west side. tile col 14 row 17.
  { kind: 'npc', id: 'smith',       spriteIdx: 1,   x: 448, y: 560, interactR: 50 },
  // ARCHIVIST — inside east_workshop near the crates. tile col 23 row 10.
  { kind: 'npc', id: 'archivist',   spriteIdx: 2,   x: 752, y: 320, interactR: 50 },
  // GRAVEKEEPER — among the graves in west_ruin. tile col 5 row 10.
  { kind: 'npc', id: 'gravekeeper', spriteIdx: 3,   x: 176, y: 320, interactR: 50 },
  // ORACLE — at the plaza, NE of fountain. tile col 17 row 12. Moved
  // north for the same reason as keeper (doesn't stand inside bench).
  { kind: 'npc', id: 'oracle',      spriteIdx: 4,   x: 560, y: 384, interactR: 50 },
  // WANDERER — in horizontal corridor east of plaza. tile col 25 row 13.
  // Literal outsider, on the grass between plaza and workshop.
  { kind: 'npc', id: 'wanderer',    spriteIdx: 5,   x: 816, y: 432, interactR: 50 },
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
  // Fountain (4-tile-wide round prop at plaza center)
  { x: 496, y: 448, r: 38 },
  // South-entrance lantern posts (now flanking inside the zone, not in void)
  { x: 432, y: 608, r: 10 },
  { x: 560, y: 608, r: 10 },
  // Plaza corner lanterns (NW + NE)
  { x: 368, y: 384, r: 10 },
  { x: 624, y: 384, r: 10 },
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
  // Pass 2: walkable-grid clamp. Sample 4 points around the hero's
  // collision radius. If any are in void, snap the hero to the nearest
  // walkable tile center along that axis.
  const HR = 10;
  const samples = [
    { x: hero.x + HR, y: hero.y, ax: 'x', dir: -1 },
    { x: hero.x - HR, y: hero.y, ax: 'x', dir: +1 },
    { x: hero.x, y: hero.y + HR, ax: 'y', dir: -1 },
    { x: hero.x, y: hero.y - HR, ax: 'y', dir: +1 },
  ];
  for (const s of samples) {
    if (isHamletWalkable(s.x, s.y)) continue;
    // Push hero back along the axis that's intruding into void.
    if (s.ax === 'x') {
      const tileCenter = Math.floor(s.x / CAINOS_TILE) * CAINOS_TILE + CAINOS_TILE / 2;
      hero.x = tileCenter + s.dir * (CAINOS_TILE / 2 + HR);
    } else {
      const tileCenter = Math.floor(s.y / CAINOS_TILE) * CAINOS_TILE + CAINOS_TILE / 2;
      hero.y = tileCenter + s.dir * (CAINOS_TILE / 2 + HR);
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

// Overscan bounds — the hamlet paints beyond the 960×672 room into the
// canvas void strips on either side. Covers viewports up to ~1680px wide
// without gaps. Everything is extended to [X_MIN, X_MAX] horizontally.
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
  ctx.fillRect(BG_X_MIN, 0, BG_W, 672);

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
  // ── OLD PROPS + BUILDINGS — STRIPPED FOR HAMLET REBUILD ─────────────
  // The old hand-drawn forge / dome / tower / scaffolding / benches /
  // anvil / gravestones / fallen bell etc. clashed visually with the
  // Cainos pixel-art floor. Removed in this iteration. Their replacement
  // (Cainos TX Struct + TX Wall + TX Props sprites) lands in the next
  // pass once the floor + walls + base prop layout are confirmed.
  //
  // Z_TOWER / Z_FORGE / Z_ARCHIVE / Z_SHRINE / Z_PLAZA constants stay
  // available for the NPC code (which still reads them via hamletScene
  // exports if needed) — declared above the old props block.

  // ── AIR DUST MOTES ───────────────────────────────────────────────────
  // Two depth layers: 36 slow-and-bright motes (foreground) + 24 fast-
  // and-dim motes (background). Drifts diagonally across the painted
  // range so wide-canvas strips also populate.
  for (let i = 0; i < 36; i++) {
    const baseX = (i * 91) % BG_W;
    const baseY = 120 + ((i * 37) % 470);
    const driftX = BG_X_MIN + ((baseX + now * 8 + i * 3) % BG_W);
    const wobbleY = baseY + Math.sin(now * 0.5 + i * 0.7) * 4;
    const alpha = 0.35 + 0.25 * Math.sin(now * 0.8 + i);
    ctx.fillStyle = `rgba(232, 210, 180, ${alpha.toFixed(3)})`;
    ctx.fillRect(driftX | 0, wobbleY | 0, 1, 1);
  }
  for (let i = 0; i < 24; i++) {
    const baseX = (i * 137) % BG_W;
    const baseY = 80 + ((i * 53) % 540);
    const driftX = BG_X_MIN + ((baseX + now * 18 + i * 5) % BG_W);
    const wobbleY = baseY + Math.sin(now * 0.9 + i * 1.1) * 2;
    const alpha = 0.18 + 0.12 * Math.sin(now * 1.4 + i);
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
function drawGroundShadow(ctx, x, y, radiusX, alpha = 0.38) {
  ctx.save();
  ctx.fillStyle = `rgba(4, 2, 6, ${alpha})`;
  ctx.beginPath();
  ctx.ellipse(x, y, radiusX, radiusX * 0.32, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawPortal(ctx, e, now) {
  // ── HAMLET REBUILD: old painted-tower / env-pack portal stripped. ──
  // The portal entity still exists for collision + interact (E to descend);
  // the visual is now just a soft warm halo on the floor where the next
  // pass will place a Cainos archway / portal prop.
  const pulse = 0.55 + 0.45 * Math.sin(now * 1.3);
  const haloR = 60;
  const halo = ctx.createRadialGradient(e.x, e.y + 4, 4, e.x, e.y + 4, haloR);
  halo.addColorStop(0, `rgba(255, 180, 90, ${(0.45 * pulse).toFixed(3)})`);
  halo.addColorStop(1, 'rgba(255, 180, 90, 0)');
  ctx.fillStyle = halo;
  ctx.fillRect(e.x - haloR, e.y + 4 - haloR, haloR * 2, haloR * 2);
}

function drawFirepit(ctx, e, now) {
  // Warm radial halo for the plaza's hearth corner. Larger + brighter
  // than before so the plaza has a clear "fire here" focal point even
  // without an actual flame sprite. Pulse slowed (1.0 vs 1.8) so it
  // breathes calmly instead of flickering.
  const pulse = 0.6 + 0.4 * Math.sin(now * 1.0);
  const haloR = 70;
  const halo = ctx.createRadialGradient(e.x, e.y - 8, 4, e.x, e.y - 8, haloR);
  halo.addColorStop(0, `rgba(255, 175, 95, ${(0.36 * pulse).toFixed(3)})`);
  halo.addColorStop(0.45, `rgba(255, 130, 70, ${(0.18 * pulse).toFixed(3)})`);
  halo.addColorStop(1, 'rgba(255, 100, 60, 0)');
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = halo;
  ctx.fillRect(e.x - haloR, e.y - 8 - haloR, haloR * 2, haloR * 2);
  ctx.restore();
}

function drawShrine(ctx, e) {
  // Cool blue radial — sacred / mystical contrast to the firepit's warm
  // halo. The kneeling priestess statue (in hamletFloor.js HAMLET_PROPS)
  // sits at this same world position; this halo makes the shrine read
  // as a place of worship at a glance.
  const now = performance.now() / 1000;
  const pulse = 0.55 + 0.45 * Math.sin(now * 0.7);
  const haloR = 56;
  const halo = ctx.createRadialGradient(e.x, e.y - 8, 4, e.x, e.y - 8, haloR);
  halo.addColorStop(0, `rgba(140, 180, 230, ${(0.30 * pulse).toFixed(3)})`);
  halo.addColorStop(0.5, `rgba(110, 140, 210, ${(0.14 * pulse).toFixed(3)})`);
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
  // NPC draw height 56 — distinctly SMALLER than the 96px hero sprite so
  // the knight reads as the protagonist of the scene, not a dwarf among
  // giants. Prior 80px made NPCs taller than the hero's visible silhouette.
  const drawH = 56;
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
  if (d < e.interactR * 1.6) {
    const proximity = Math.max(0, 1 - d / (e.interactR * 1.6));
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
