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

// Hero respawn position when entering the hamlet — centered vertically so
// the camera (which follows the hero) shows the full backdrop without
// bottom void. NPCs stand below the hero, portal sits above — the hero
// naturally chooses north (run) vs south (talk) on entry.
export const HAMLET_HERO_SPAWN = { x: 480, y: 336 };

// Portal position — top-middle of the room, the endpoint of "walk up to leave."
const PORTAL_POS = { x: 480, y: 150 };
// Watcher shrine — far-left, mid-height.
const SHRINE_POS = { x: 90, y: 380 };

// NPC world positions, derived from the existing hamlet.js x,y percentages
// (which are % of the DOM backdrop at 960×672). spriteIdx maps to the
// hamlet_npc 4×2 sheet — skip idx 3 and 7 (Nano Banana hallucinated extras).
export const HAMLET_ENTITIES = [
  { kind: 'portal',                                 x: PORTAL_POS.x, y: PORTAL_POS.y, interactR: 72 },
  { kind: 'shrine',                                 x: SHRINE_POS.x, y: SHRINE_POS.y, interactR: 0  },   // non-interactive
  { kind: 'npc', id: 'gravekeeper', spriteIdx: 4,   x: 140, y: 500, interactR: 60 },
  { kind: 'npc', id: 'smith',       spriteIdx: 1,   x: 260, y: 500, interactR: 60 },
  { kind: 'npc', id: 'oracle',      spriteIdx: 5,   x: 380, y: 500, interactR: 60 },
  { kind: 'npc', id: 'keeper',      spriteIdx: 0,   x: 540, y: 500, interactR: 60 },
  { kind: 'npc', id: 'archivist',   spriteIdx: 2,   x: 680, y: 500, interactR: 60 },
  { kind: 'npc', id: 'wanderer',    spriteIdx: 6,   x: 820, y: 500, interactR: 60 },
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

function drawPortal(ctx, e, now) {
  const spr = images.descent_portal;
  // Pulsing halo behind the portal — inviting, draws the eye, signals "this
  // is the way forward."
  const pulse = 0.55 + 0.45 * Math.sin(now * 1.3);
  const haloR = 180;
  const halo = ctx.createRadialGradient(e.x, e.y - 30, 8, e.x, e.y - 30, haloR);
  halo.addColorStop(0, `rgba(255, 180, 90, ${(0.4 * pulse).toFixed(3)})`);
  halo.addColorStop(1, 'rgba(255, 180, 90, 0)');
  ctx.fillStyle = halo;
  ctx.fillRect(e.x - haloR, e.y - 30 - haloR, haloR * 2, haloR * 2);

  if (spr) {
    const drawH = 160;
    const drawW = spr.width * (drawH / spr.height);
    ctx.drawImage(spr, e.x - drawW / 2, e.y - drawH, drawW, drawH);
  } else {
    // Fallback placeholder — a dark archway outline
    ctx.strokeStyle = 'rgba(255, 180, 80, 0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(e.x, e.y - 40, 60, Math.PI, 0);
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
  const drawH = 130;
  const drawW = spr.width * (drawH / spr.height);
  ctx.drawImage(spr, e.x - drawW / 2, e.y - drawH, drawW, drawH);
}

function drawNpc(ctx, e, now) {
  const spr = images[`hamlet_npc_${e.spriteIdx}`];
  if (!spr) return;
  // Gentle breathing bob so the NPC doesn't feel frozen. Phase offset by x
  // so multiple NPCs don't breathe in sync.
  const bob = Math.sin(now * 1.5 + e.x * 0.01) * 2;
  const drawH = 110;
  const drawW = spr.width * (drawH / spr.height);
  ctx.drawImage(spr, Math.round(e.x - drawW / 2), Math.round(e.y - drawH + bob), drawW, drawH);

  // Warm glow beneath the NPC when the hero is close — signals interactivity
  // and makes the scene feel responsive to your presence.
  const dx = hero.x - e.x, dy = hero.y - e.y;
  const d = Math.hypot(dx, dy);
  if (d < e.interactR * 1.6) {
    const proximity = Math.max(0, 1 - d / (e.interactR * 1.6));
    const tint = NPCS[e.id]?.tint || '#f4d9a0';
    const hex = tint.replace('#', '');
    const n = parseInt(hex.length === 3 ? hex.split('').map(c => c + c).join('') : hex, 16);
    const R = (n >> 16) & 255, G = (n >> 8) & 255, B = n & 255;
    const glow = ctx.createRadialGradient(e.x, e.y, 4, e.x, e.y, 70);
    glow.addColorStop(0, `rgba(${R},${G},${B},${(0.32 * proximity).toFixed(3)})`);
    glow.addColorStop(1, `rgba(${R},${G},${B},0)`);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = glow;
    ctx.fillRect(e.x - 70, e.y - 70, 140, 140);
    ctx.restore();
  }
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
  const promptY = _nearest.y - (_nearest.kind === 'portal' ? 180 : 130) + floatOff;

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
