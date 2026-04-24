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
import { NPCS, hamletState } from './hamlet.js';
import { watcherSnapshot } from './watcher.js';

// DIORAMA COMPOSITION — the painted backdrop already has three implicit
// bands: sky (top ~30%), buildings (middle ~40%), and cobblestone ground
// (bottom ~30%). Characters walk exclusively in the painted ground band
// so the scene reads as a stage where NPCs stand on real floor rather
// than float over a mural. Camera is locked (see main.js enterHamletCanvas)
// so the hero can't walk up into the sky.
//
// Walkable Y-band: ~500 (top of painted cobblestone) → ~630 (bottom edge
// of room interior). All interactable entities live in that band.
export const HAMLET_WALK_Y_MIN = 500;
export const HAMLET_WALK_Y_MAX = 630;

// Hero spawn — front-center of the cobblestone zone, facing inward. This
// puts the player AT camera-center-bottom with NPCs standing behind them.
export const HAMLET_HERO_SPAWN = { x: 480, y: 615 };

// Portal — back-center of the cobblestone, just in front of the painted
// ruined tower. Reads as a real stairwell dug into the town square, not
// a floating archway in the sky.
const PORTAL_POS = { x: 480, y: 510 };
// Watcher shrine — far-left of cobblestone, tucked past the forge doorway.
const SHRINE_POS = { x: 60, y: 590 };

// NPC world positions — all standing on the painted cobblestone at y=575,
// spread horizontally so they don't clip each other. The existing hamlet.js
// % positions are ignored here; those were DOM-backdrop coordinates and
// the painted cobblestone sits at a different implicit ground line.
// spriteIdx maps to the hamlet_npc 4×2 sheet — we skip idx 3 and 7 (Nano
// Banana hallucinated extras).
const NPC_GROUND_Y = 575;
export const HAMLET_ENTITIES = [
  { kind: 'portal',                                 x: PORTAL_POS.x, y: PORTAL_POS.y, interactR: 64 },
  { kind: 'shrine',                                 x: SHRINE_POS.x, y: SHRINE_POS.y, interactR: 0  },
  { kind: 'npc', id: 'gravekeeper', spriteIdx: 4,   x: 180, y: NPC_GROUND_Y, interactR: 52 },
  { kind: 'npc', id: 'smith',       spriteIdx: 1,   x: 290, y: NPC_GROUND_Y, interactR: 52 },
  { kind: 'npc', id: 'oracle',      spriteIdx: 5,   x: 400, y: NPC_GROUND_Y, interactR: 52 },
  { kind: 'npc', id: 'keeper',      spriteIdx: 0,   x: 560, y: NPC_GROUND_Y, interactR: 52 },
  { kind: 'npc', id: 'archivist',   spriteIdx: 2,   x: 670, y: NPC_GROUND_Y, interactR: 52 },
  { kind: 'npc', id: 'wanderer',    spriteIdx: 6,   x: 780, y: NPC_GROUND_Y, interactR: 52 },
];

let _nearest = null;    // cached nearest interactable, updated each tick

function isNpcPresent(id) {
  // Present NPCs have an arcStage entry (assigned when their unlock fires).
  // For MVP, presence is simply "has been met at least once" as recorded in
  // hamletState. Locked NPCs (unlockCheck false) will have no entry and be
  // skipped in the world render / proximity search.
  return hamletState.npcArcStage[id] !== undefined;
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
  const spr = images.descent_portal;
  // Soft halo from the portal spilling onto the cobblestone around it. Kept
  // subtle so it doesn't bloom into the painted sky.
  const pulse = 0.55 + 0.45 * Math.sin(now * 1.3);
  const haloR = 110;
  const halo = ctx.createRadialGradient(e.x, e.y - 10, 6, e.x, e.y - 10, haloR);
  halo.addColorStop(0, `rgba(255, 180, 90, ${(0.28 * pulse).toFixed(3)})`);
  halo.addColorStop(1, 'rgba(255, 180, 90, 0)');
  ctx.fillStyle = halo;
  ctx.fillRect(e.x - haloR, e.y - 10 - haloR, haloR * 2, haloR * 2);

  // Ground shadow anchoring the stairwell to the cobblestone.
  drawGroundShadow(ctx, e.x, e.y + 2, 40);

  if (spr) {
    const drawH = 96;
    const drawW = spr.width * (drawH / spr.height);
    ctx.drawImage(spr, Math.round(e.x - drawW / 2), Math.round(e.y - drawH + 6), drawW, drawH);
  } else {
    ctx.strokeStyle = 'rgba(255, 180, 80, 0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(e.x, e.y - 30, 36, Math.PI, 0);
    ctx.stroke();
  }
}

function drawShrine(ctx, e) {
  // Reuse the watcher's 8-state grid — state chosen by milestone count.
  const snap = watcherSnapshot();
  const seenCount = Object.values(snap.seen || {}).filter(Boolean).length;
  let stateIdx = 0;
  if      (seenCount >= 8) stateIdx = 7;
  else if (seenCount >= 7) stateIdx = 6;
  else if (seenCount >= 6) stateIdx = 5;
  else if (seenCount >= 5) stateIdx = 4;
  else if (seenCount >= 4) stateIdx = 3;
  else if (seenCount >= 3) stateIdx = 2;
  else if (seenCount >= 1) stateIdx = 1;
  const spr = images[`shrine_watcher_${stateIdx}`];
  if (!spr) return;
  drawGroundShadow(ctx, e.x, e.y + 2, 28);
  const drawH = 78;
  const drawW = spr.width * (drawH / spr.height);
  ctx.drawImage(spr, Math.round(e.x - drawW / 2), Math.round(e.y - drawH + 4), drawW, drawH);
}

function drawNpc(ctx, e, now) {
  const spr = images[`hamlet_npc_${e.spriteIdx}`];
  if (!spr) return;
  // Gentle breathing bob so the NPC doesn't feel frozen. Phase offset by x
  // so multiple NPCs don't breathe in sync.
  const bob = Math.sin(now * 1.5 + e.x * 0.01) * 1.5;
  // Scaled down to ~65px tall so the NPC sits at hero-ish visual scale
  // rather than towering over the knight. (Knight renders at 96px square
  // but the actual knight sprite content is ~40px inside that.)
  const drawH = 65;
  const drawW = spr.width * (drawH / spr.height);
  // Ground shadow just below the NPC's feet — anchors them to cobblestone.
  drawGroundShadow(ctx, e.x, e.y + 2, 18, 0.32);

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
