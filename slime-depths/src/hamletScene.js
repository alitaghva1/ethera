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

// Hero spawn — front-center of the cobblestone zone, below the firepit.
export const HAMLET_HERO_SPAWN = { x: 480, y: 635 };

// Portal interact zone — visually anchored to the central ruined tower
// drawn by drawHamletEntities. Feet at y=440 (tower's base on the cobble
// horizon); interact when hero approaches that base.
const PORTAL_POS = { x: 480, y: 450 };
// Watcher shrine — left cobblestone, pushed in enough to clear the
// tile-variant moss patches that sit at the column edge.
const SHRINE_POS = { x: 130, y: 580 };
// Firepit — center-front, between NPC row and hero spawn. Decorative only.
const FIREPIT_POS = { x: 480, y: 600 };

// NPC world positions — staggered in a HANDCRAFTED diorama rather than a
// flat row. Each NPC is placed at a spot that fits their role: keeper at
// the firepit, smith near the forge, archivist near the dome, gravekeeper
// in the left shadows, oracle in the right corner, wanderer far-right.
// spriteIdx maps to the pixel-art hamlet_npcp sheet (3×2):
//   0 keeper | 1 smith  | 2 archivist
//   3 grave  | 4 oracle | 5 wanderer
export const HAMLET_ENTITIES = [
  { kind: 'portal',                                 x: PORTAL_POS.x, y: PORTAL_POS.y, interactR: 70 },
  { kind: 'shrine',                                 x: SHRINE_POS.x, y: SHRINE_POS.y, interactR: 0  },
  { kind: 'firepit',                                x: FIREPIT_POS.x, y: FIREPIT_POS.y, interactR: 0 },
  // KEEPER by the firepit — classic Hades-hub staging.
  { kind: 'npc', id: 'keeper',      spriteIdx: 0,   x: 540, y: 615, interactR: 50 },
  // SMITH near the forge doorway.
  { kind: 'npc', id: 'smith',       spriteIdx: 1,   x: 280, y: 525, interactR: 50 },
  // ARCHIVIST near the dome's steps on the right.
  { kind: 'npc', id: 'archivist',   spriteIdx: 2,   x: 720, y: 555, interactR: 50 },
  // GRAVEKEEPER in the left foreground shadows.
  { kind: 'npc', id: 'gravekeeper', spriteIdx: 3,   x: 220, y: 620, interactR: 50 },
  // ORACLE in the mid-right zone between portal + dome.
  { kind: 'npc', id: 'oracle',      spriteIdx: 4,   x: 640, y: 600, interactR: 50 },
  // WANDERER far-right corner, closest to the "exit" sight line.
  { kind: 'npc', id: 'wanderer',    spriteIdx: 5,   x: 830, y: 610, interactR: 50 },
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

// ---- LAYER 2: Buildings + ground ------------------------------------------
// Drawn AFTER room.js's drawRoom (which paints gradient sky) but BEFORE
// entities + characters. Order inside this function: cobblestone tiles
// (ground layer) first, then buildings (mid layer) on top so building bases
// sit in front of the cobblestone line.

// Cached cobblestone sub-tiles. The env pack's cobble cell (index 4) is a
// 3×3 mini-grid of tile variants; we slice it once and randomly pick tiles
// across the ground to break the "repeating block" pattern the raw stamp
// produced. Cache is lazy — only populated after images.hamlet_env_4 loads.
let _cobbleSubtiles = null;
function ensureCobbleSubtiles() {
  if (_cobbleSubtiles) return _cobbleSubtiles;
  const src = images.hamlet_env_4;
  if (!src) return null;
  const sw = Math.floor(src.width / 3);
  const sh = Math.floor(src.height / 3);
  const cells = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const cv = document.createElement('canvas');
      cv.width = sw; cv.height = sh;
      cv.getContext('2d').drawImage(src, c * sw, r * sh, sw, sh, 0, 0, sw, sh);
      cells.push(cv);
    }
  }
  _cobbleSubtiles = cells;
  return cells;
}

// Deterministic small hash → integer in [0..mod)
function cellHash(x, y, mod) {
  let h = (x * 73856093) ^ (y * 19349663);
  h = (h ^ (h >>> 13)) * 1274126177;
  return Math.abs(h) % mod;
}

export function drawHamletBackdrop(ctx) {
  // Ground — sub-tiled cobblestone. Each 80×80 world cell picks a random
  // sub-tile from the 3×3 variant pack, seeded by cell position so the
  // layout is stable frame-to-frame but reads as authored variety instead
  // of a repeating block.
  const subtiles = ensureCobbleSubtiles();
  if (subtiles && subtiles.length === 9) {
    const tileW = 96, tileH = 96;
    const groundTop = 288;
    for (let y = groundTop; y < 672; y += tileH) {
      for (let x = 0; x < 960; x += tileW) {
        const i = cellHash((x / tileW) | 0, (y / tileH) | 0, 9);
        ctx.drawImage(subtiles[i], x, y, tileW, tileH);
      }
    }
    // Feathered horizon line — the cobblestone blends into the sky's warm
    // amber band instead of a hard edge.
    const hz = ctx.createLinearGradient(0, 278, 0, 340);
    hz.addColorStop(0, 'rgba(30, 18, 32, 0.85)');
    hz.addColorStop(1, 'rgba(30, 18, 32, 0)');
    ctx.fillStyle = hz;
    ctx.fillRect(0, 278, 960, 62);
  }

  // ── HANDCRAFTED DEPTH COMPOSITION ────────────────────────────────────
  // Layers painted back-to-front. Each building sits on a slightly
  // different horizon y to break the "three buildings in a row" feel and
  // imply distance. Scales are also varied — closer buildings larger.

  // LAYER A — FAR background silhouette. Second ruined tower dimmed + shrunk
  // so it reads as "a distant tower just past the ridge" rather than
  // competing with the foreground. Placed off-center left.
  const towerBg = images.hamlet_env_3;
  if (towerBg) {
    const bw = 110, bh = 155;
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.drawImage(towerBg, Math.round(110 - bw / 2), Math.round(455 - bh), bw, bh);
    ctx.restore();
  }

  // LAYER B — mid-distance building cluster. The DOME sits slightly back
  // and smaller (~90% forge scale), reinforcing right-side depth recession.
  const dome = images.hamlet_env_1;
  if (dome) {
    const bw = 200, bh = 220;
    ctx.drawImage(dome, Math.round(810 - bw / 2), Math.round(490 - bh), bw, bh);
  }

  // LAYER C — foreground-LEFT building. FORGE pulled forward and slightly
  // larger — reads as "near me" at hero scale.
  const forge = images.hamlet_env_0;
  if (forge) {
    const bw = 245, bh = 275;
    ctx.drawImage(forge, Math.round(200 - bw / 2), Math.round(510 - bh), bw, bh);
  }

  // Secondary firepit (foreground-right) — drawn HERE as part of the
  // backdrop so it sits behind NPCs. This is purely atmospheric; the main
  // interactive firepit is in the entities layer (center-front).
  const firepit2 = images.hamlet_env_6;
  if (firepit2) {
    const bw = 80, bh = 80;
    const fx = 880, fy = 660;
    const pulse = 0.7 + 0.3 * Math.sin(performance.now() / 350);
    const halo = ctx.createRadialGradient(fx, fy - 10, 4, fx, fy - 10, 64);
    halo.addColorStop(0, `rgba(255, 160, 80, ${(0.32 * pulse).toFixed(3)})`);
    halo.addColorStop(1, 'rgba(255, 160, 80, 0)');
    ctx.fillStyle = halo;
    ctx.fillRect(fx - 64, fy - 10 - 64, 128, 128);
    ctx.drawImage(firepit2, Math.round(fx - bw / 2), Math.round(fy - bh + 6), bw, bh);
  }
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
  // The "portal" is visually the central ruined tower — walking up to its
  // base + pressing E begins the descent. We prefer the pixel-art tower
  // from the env pack; fall back to the old painted portal if unloaded.
  const tower = images.hamlet_env_2;
  const painted = images.descent_portal;
  const pulse = 0.55 + 0.45 * Math.sin(now * 1.3);

  // Warm halo at the tower's base — signals "this is the way forward."
  const haloR = 140;
  const halo = ctx.createRadialGradient(e.x, e.y + 4, 10, e.x, e.y + 4, haloR);
  halo.addColorStop(0, `rgba(255, 180, 90, ${(0.34 * pulse).toFixed(3)})`);
  halo.addColorStop(1, 'rgba(255, 180, 90, 0)');
  ctx.fillStyle = halo;
  ctx.fillRect(e.x - haloR, e.y + 4 - haloR, haloR * 2, haloR * 2);

  drawGroundShadow(ctx, e.x, e.y + 6, 52);

  if (tower) {
    const drawH = 270;
    const drawW = tower.width * (drawH / tower.height);
    ctx.drawImage(tower, Math.round(e.x - drawW / 2), Math.round(e.y - drawH), drawW, drawH);
  } else if (painted) {
    const drawH = 160;
    const drawW = painted.width * (drawH / painted.height);
    ctx.drawImage(painted, Math.round(e.x - drawW / 2), Math.round(e.y - drawH + 6), drawW, drawH);
  }
}

function drawFirepit(ctx, e, now) {
  const spr = images.hamlet_env_5;
  // Embers pulse — warm radial glow on the cobblestone.
  const pulse = 0.55 + 0.45 * Math.sin(now * 1.8);
  const haloR = 80;
  const halo = ctx.createRadialGradient(e.x, e.y - 12, 4, e.x, e.y - 12, haloR);
  halo.addColorStop(0, `rgba(255, 160, 80, ${(0.42 * pulse).toFixed(3)})`);
  halo.addColorStop(1, 'rgba(255, 160, 80, 0)');
  ctx.fillStyle = halo;
  ctx.fillRect(e.x - haloR, e.y - 12 - haloR, haloR * 2, haloR * 2);

  drawGroundShadow(ctx, e.x, e.y + 4, 34);

  if (spr) {
    const drawH = 96;
    const drawW = spr.width * (drawH / spr.height);
    ctx.drawImage(spr, Math.round(e.x - drawW / 2), Math.round(e.y - drawH + 8), drawW, drawH);
  }

  // Floating embers drifting up from the flame — ambient life. 6 embers
  // cycle through a 4s loop; deterministic per ember index so they don't
  // reseed every frame but still spread the visual.
  for (let i = 0; i < 7; i++) {
    const phase = ((now + i * 0.57) % 4) / 4;    // 0..1 over 4s per ember
    const emberY = e.y - 30 - phase * 90;        // rise 90px over lifetime
    const jx = Math.sin(phase * Math.PI * 3 + i * 1.3) * 12;
    const emberX = e.x + jx;
    const alpha = Math.max(0, 0.8 * (1 - phase));
    const r = phase < 0.4 ? 2 : 1;
    const tint = phase < 0.5 ? '255, 200, 90' : '255, 130, 60';
    ctx.fillStyle = `rgba(${tint}, ${alpha.toFixed(3)})`;
    ctx.fillRect((emberX | 0) - r, (emberY | 0) - r, r * 2, r * 2);
  }
}

function drawShrine(ctx, e) {
  // Prefer the pixel-art shrine from the env pack (matches the rest of the
  // pixel-art hamlet). Progression states (8-state grid) will return when we
  // have pixel-art progression variants; for now it's a single static read.
  const pix = images.hamlet_env_7;
  if (pix) {
    drawGroundShadow(ctx, e.x, e.y + 2, 26);
    const drawH = 96;
    const drawW = pix.width * (drawH / pix.height);
    ctx.drawImage(pix, Math.round(e.x - drawW / 2), Math.round(e.y - drawH + 4), drawW, drawH);
    return;
  }
  // Legacy fallback — painted 8-state grid if the pixel shrine isn't loaded.
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
  // Prefer the new pixel-art NPC sprite (hamlet_npcp_*) — it matches the
  // knight's pixel density. Fall back to the old chibi stand-in sheet
  // (hamlet_npc_*) only if the pixel sheet didn't load.
  const spr = images[`hamlet_npcp_${e.spriteIdx}`] || images[`hamlet_npc_${e.spriteIdx}`];
  if (!spr) return;
  // Gentle breathing bob so the NPC doesn't feel frozen. Phase offset by x
  // so multiple NPCs don't breathe in sync.
  const bob = Math.sin(now * 1.5 + e.x * 0.01) * 1.2;
  // Pixel NPCs render at 80px tall — slightly larger than the old chibi
  // placeholders (65px) because the new sprites have more silhouette detail
  // to read at hero scale. Still smaller than the buildings.
  const drawH = 80;
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
