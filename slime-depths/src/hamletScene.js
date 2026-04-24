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

// Overscan bounds — the hamlet paints beyond the 960×672 room into the
// canvas void strips on either side. Covers viewports up to ~1680px wide
// without gaps. Everything is extended to [X_MIN, X_MAX] horizontally.
const BG_X_MIN = -360;
const BG_X_MAX = 1320;
const BG_W = BG_X_MAX - BG_X_MIN;

export function drawHamletBackdrop(ctx) {
  const now = performance.now() / 1000;

  // ── BG-0 · EXTENDED SKY FILL ─────────────────────────────────────────
  // room.js painted a 960-wide sky; we extend it across the full viewport
  // with the same palette so the camera doesn't show dead void strips on
  // wide canvases. Horizon stays at y=300.
  {
    const sky = ctx.createLinearGradient(0, 0, 0, 300);
    sky.addColorStop(0.00, '#0d0818');
    sky.addColorStop(0.45, '#281638');
    sky.addColorStop(0.80, '#5a2a40');
    sky.addColorStop(1.00, '#7a3848');
    ctx.fillStyle = sky;
    ctx.fillRect(BG_X_MIN, 0, BG_W, 300);
    // Dark ground base under the extended strip so gaps between cobble
    // tiles (if any) don't punch through to the void. Matches room.js.
    ctx.fillStyle = '#181218';
    ctx.fillRect(BG_X_MIN, 300, BG_W, 672 - 300);
  }

  // ── BG-1 · AURORA RIBBON ─────────────────────────────────────────────
  // Slow-waving cool ribbon across the top of the sky. Two sine layers
  // give it parallax depth. Subtle enough to read as atmosphere rather
  // than UI. Tinted teal↔violet so it varies over time.
  {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let layer = 0; layer < 2; layer++) {
      const yBase = 50 + layer * 30;
      const freq = 0.004 + layer * 0.002;
      const amp = 18 + layer * 10;
      const alpha = layer === 0 ? 0.18 : 0.11;
      const tintShift = Math.sin(now * 0.15 + layer) * 0.5 + 0.5;
      const r = (120 * (1 - tintShift) + 180 * tintShift) | 0;
      const g = (210 * (1 - tintShift) + 150 * tintShift) | 0;
      const b = (220 * (1 - tintShift) + 230 * tintShift) | 0;
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
      ctx.beginPath();
      ctx.moveTo(BG_X_MIN, yBase);
      for (let x = BG_X_MIN; x <= BG_X_MAX; x += 20) {
        const y = yBase + Math.sin(x * freq + now * 0.25 + layer * 1.3) * amp
                       + Math.sin(x * freq * 2.1 + now * 0.4) * amp * 0.3;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(BG_X_MAX, yBase + 60);
      ctx.lineTo(BG_X_MIN, yBase + 60);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  // ── BG-2 · DRIFTING CLOUD WISPS ──────────────────────────────────────
  // 5 deterministic dark cloud silhouettes drifting slowly across the
  // sky. Each is a soft elliptical radial gradient; they cycle with the
  // full BG_W range so there are no visual pops at edges.
  {
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    for (let i = 0; i < 5; i++) {
      const speed = 12 + i * 3;
      const phase = i * 0.37;
      const cx = ((now * speed + phase * BG_W) % BG_W) + BG_X_MIN;
      const cy = 90 + ((i * 37) % 60);
      const rx = 140 + (i % 2) * 60;
      const ry = 24 + (i % 2) * 8;
      const g = ctx.createRadialGradient(cx, cy, 4, cx, cy, rx);
      g.addColorStop(0, 'rgba(30, 18, 40, 0.9)');
      g.addColorStop(1, 'rgba(30, 18, 40, 0)');
      ctx.fillStyle = g;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(1, ry / rx);
      ctx.translate(-cx, -cy);
      ctx.fillRect(cx - rx, cy - ry, rx * 2, ry * 2);
      ctx.restore();
    }
    ctx.restore();
  }

  // ── BG-3 · DISTANT MOUNTAIN RANGE ────────────────────────────────────
  // Layered silhouettes at the horizon — far layer dark+small, mid layer
  // slightly warmer+taller. Anchors the scene in a larger world instead
  // of looking like everything ends at screen edge.
  {
    // Far ridge
    ctx.fillStyle = 'rgba(28, 18, 38, 0.90)';
    ctx.beginPath();
    ctx.moveTo(BG_X_MIN, 305);
    for (let x = BG_X_MIN; x <= BG_X_MAX; x += 40) {
      const h = (Math.sin(x * 0.006) * 0.5 + Math.sin(x * 0.014 + 1.2) * 0.3
               + Math.sin(x * 0.031 + 2.7) * 0.2);
      ctx.lineTo(x, 285 - h * 24);
    }
    ctx.lineTo(BG_X_MAX, 305);
    ctx.closePath();
    ctx.fill();
    // Near ridge (taller, darker)
    ctx.fillStyle = 'rgba(16, 10, 22, 0.95)';
    ctx.beginPath();
    ctx.moveTo(BG_X_MIN, 305);
    for (let x = BG_X_MIN; x <= BG_X_MAX; x += 30) {
      const h = (Math.sin(x * 0.005 + 3.1) * 0.5 + Math.sin(x * 0.011 + 5.2) * 0.3
               + Math.sin(x * 0.028 + 1.7) * 0.2);
      ctx.lineTo(x, 300 - h * 14);
    }
    ctx.lineTo(BG_X_MAX, 305);
    ctx.closePath();
    ctx.fill();
  }

  // ── BG-4 · HORIZON FOG BAND ──────────────────────────────────────────
  const fogT = performance.now() / 4000;
  const fogDrift = (fogT % 1) * 80 - 40;
  const fog = ctx.createLinearGradient(0, 260, 0, 430);
  fog.addColorStop(0, 'rgba(90, 50, 70, 0.0)');
  fog.addColorStop(0.35, 'rgba(130, 90, 110, 0.45)');
  fog.addColorStop(0.75, 'rgba(70, 50, 80, 0.20)');
  fog.addColorStop(1, 'rgba(70, 50, 80, 0.0)');
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = fog;
  ctx.fillRect(BG_X_MIN + fogDrift, 260, BG_W, 170);
  ctx.restore();

  // ── BG-5 · SKY FIREFLIES ─────────────────────────────────────────────
  // 10 glowing motes drift slowly through the sky band. Each has a
  // halo that pulses so they twinkle gently. Placed in the sky ONLY
  // (y < 280) so they read as "this place is enchanted" not "dust".
  {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 10; i++) {
      const speed = 14 + i * 2.3;
      const phase = i * 0.29;
      const x = ((now * speed + phase * BG_W) % BG_W) + BG_X_MIN;
      const yBase = 140 + ((i * 31) % 120);
      const y = yBase + Math.sin(now * 0.6 + i * 0.9) * 12;
      const pulse = 0.55 + 0.45 * Math.sin(now * 2.1 + i * 1.7);
      // halo
      const halo = ctx.createRadialGradient(x, y, 0, x, y, 10);
      halo.addColorStop(0, `rgba(255, 220, 140, ${(0.55 * pulse).toFixed(3)})`);
      halo.addColorStop(1, 'rgba(255, 220, 140, 0)');
      ctx.fillStyle = halo;
      ctx.fillRect(x - 10, y - 10, 20, 20);
      // core
      ctx.fillStyle = `rgba(255, 240, 180, ${(0.9 * pulse).toFixed(3)})`;
      ctx.fillRect((x | 0) - 1, (y | 0) - 1, 2, 2);
    }
    ctx.restore();
  }

  // ── GROUND · COBBLESTONE TILES ──────────────────────────────────────
  // Tiles are 64px. Brick-course offset: every other row is shifted by
  // half a tile width so the columnar grid never lines up for more than
  // two rows. Combined with 9 random sub-tile variants this breaks the
  // "repeating block" pattern that was visible at the prior scale.
  const subtiles = ensureCobbleSubtiles();
  if (subtiles && subtiles.length === 9) {
    const tileW = 64, tileH = 64;
    const groundTop = 300;
    let row = 0;
    for (let y = groundTop; y < 672; y += tileH, row++) {
      const offset = (row & 1) ? tileW / 2 : 0;
      for (let x = BG_X_MIN - tileW; x < BG_X_MAX + tileW; x += tileW) {
        const xi = ((x + offset) / tileW) | 0;
        const i = cellHash(xi, (y / tileH) | 0, 9);
        ctx.drawImage(subtiles[i], x + offset, y, tileW, tileH);
      }
    }
    // Small dirt-smudge overlays — 22 subtle patches that sit across tile
    // boundaries to disrupt the brick-course grid without dominating the
    // ground like the previous big-blob pass did. Each is a narrow
    // elongated ellipse with very low opacity, rotated to an arbitrary
    // angle so the boundary-crossing is obvious but individually soft.
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    for (let s = 0; s < 22; s++) {
      const h = cellHash(s * 17 + 91, s * 23 + 5, 1000000);
      const cx = BG_X_MIN + (h % BG_W);
      const cy = 330 + ((h >>> 10) % 320);
      const angle = ((h >>> 20) % 360) * Math.PI / 180;
      const rx = 20 + ((h >>> 4) % 18);
      const ry = 4 + ((h >>> 8) % 4);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(angle);
      const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
      grad.addColorStop(0, 'rgba(200, 185, 150, 0.90)');
      grad.addColorStop(1, 'rgba(160, 140, 110, 1.0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();

    // Crack lines — 14 hairline dark streaks at random angles that cross
    // tile boundaries. Reads as weathered stone with settled cracks,
    // visually severs the grid without adding colour.
    ctx.save();
    ctx.strokeStyle = 'rgba(30, 22, 22, 0.55)';
    ctx.lineWidth = 1;
    for (let s = 0; s < 14; s++) {
      const h = cellHash(s * 41 + 7, s * 53 + 11, 1000000);
      const cx = BG_X_MIN + (h % BG_W);
      const cy = 320 + ((h >>> 10) % 330);
      const angle = ((h >>> 20) % 180) * Math.PI / 180;
      const len = 30 + ((h >>> 4) % 40);
      const dx = Math.cos(angle) * len, dy = Math.sin(angle) * len;
      ctx.beginPath();
      ctx.moveTo(cx - dx / 2, cy - dy / 2);
      // Slight jog at the midpoint so the crack isn't a perfect line.
      ctx.lineTo(cx + dx * 0.15, cy + dy * 0.15 + ((h >>> 14) % 3) - 1);
      ctx.lineTo(cx + dx / 2, cy + dy / 2);
      ctx.stroke();
    }
    ctx.restore();
    // Feathered horizon line — cobble blends into the warm sky amber.
    const hz = ctx.createLinearGradient(0, 290, 0, 350);
    hz.addColorStop(0, 'rgba(30, 18, 32, 0.85)');
    hz.addColorStop(1, 'rgba(30, 18, 32, 0)');
    ctx.fillStyle = hz;
    ctx.fillRect(BG_X_MIN, 290, BG_W, 62);

    // Warm-stone PATHS radiating from the portal. Simple radial gradients
    // brighten the walkways without needing new tiles.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const pathPairs = [
      [480, 470, 220, 540, 240], // portal → forge
      [480, 470, 790, 540, 240], // portal → dome
      [480, 560, 150, 600, 180], // portal-base → shrine
      [480, 560, 870, 640, 180], // portal-base → secondary firepit
    ];
    for (const [x1, y1, x2, y2, rr] of pathPairs) {
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
      const g = ctx.createRadialGradient(mx, my, 10, mx, my, rr);
      g.addColorStop(0, 'rgba(210, 165, 105, 0.22)');
      g.addColorStop(0.6, 'rgba(160, 115, 70, 0.09)');
      g.addColorStop(1, 'rgba(120, 70, 40, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(Math.min(x1, x2) - rr, Math.min(y1, y2) - rr, Math.abs(x2 - x1) + rr * 2, Math.abs(y2 - y1) + rr * 2);
    }
    ctx.restore();

    // Moss / fallen-leaf tufts — across the FULL painted ground so the
    // extended void-cover strips also look populated. 50 tufts.
    for (let k = 0; k < 50; k++) {
      const h = cellHash(k * 7 + 3, k * 11 + 17, 1000000);
      const tx = BG_X_MIN + (h % BG_W);
      const ty = 330 + ((h >>> 10) % 330);
      const sz = 2 + ((h >>> 20) & 1);
      const isMoss = ((h >>> 22) & 1) === 0;
      const col = isMoss ? 'rgba(90, 110, 60, 0.55)' : 'rgba(150, 90, 40, 0.45)';
      ctx.fillStyle = col;
      ctx.fillRect(tx | 0, ty | 0, sz, sz);
    }
  }

  // ── BUILDINGS · BACK TO FRONT ────────────────────────────────────────
  // Scales chosen so the hero (96px tall) reads roughly 1/2 building
  // height — proper top-down-hub proportions instead of giant ruins.

  // LAYER A — FAR distant tower (background silhouette)
  const towerBg = images.hamlet_env_3;
  if (towerBg) {
    const bw = 85, bh = 120;
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.drawImage(towerBg, Math.round(100 - bw / 2), Math.round(455 - bh), bw, bh);
    ctx.restore();
  }

  // LAYER B — DOME (right-mid), with cool teal interior glow.
  const dome = images.hamlet_env_1;
  if (dome) {
    const bw = 160, bh = 175;
    const dx = 810, dy = 490;
    ctx.drawImage(dome, Math.round(dx - bw / 2), Math.round(dy - bh), bw, bh);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const pulse = 0.85 + 0.15 * Math.sin(performance.now() / 700);
    const g = ctx.createRadialGradient(dx, dy - 35, 6, dx, dy - 35, 110);
    g.addColorStop(0, `rgba(120, 200, 210, ${(0.38 * pulse).toFixed(3)})`);
    g.addColorStop(0.6, `rgba(80, 150, 180, ${(0.12 * pulse).toFixed(3)})`);
    g.addColorStop(1, 'rgba(40, 80, 110, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(dx - 120, dy - 150, 240, 200);
    ctx.restore();
  }

  // LAYER C — FORGE (left-foreground), with hot orange window flicker.
  const forge = images.hamlet_env_0;
  if (forge) {
    const bw = 200, bh = 225;
    const fx = 200, fy = 510;
    ctx.drawImage(forge, Math.round(fx - bw / 2), Math.round(fy - bh), bw, bh);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const flick = 0.78 + 0.22 * (Math.sin(now * 9.1) * 0.6 + Math.sin(now * 13.7) * 0.4);
    const g = ctx.createRadialGradient(fx, fy - 45, 6, fx, fy - 45, 130);
    g.addColorStop(0, `rgba(255, 180, 90, ${(0.58 * flick).toFixed(3)})`);
    g.addColorStop(0.5, `rgba(240, 120, 60, ${(0.24 * flick).toFixed(3)})`);
    g.addColorStop(1, 'rgba(200, 60, 30, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(fx - 130, fy - 175, 260, 240);
    ctx.restore();
  }

  // (Prayer flags are drawn by drawHamletOverlay AFTER the tower entity,
  // so they sit in front of the tower's upper sprite rather than behind it.)

  // ── FOREGROUND AMBIENT PROPS ─────────────────────────────────────────
  // Subtle stone boulders at the lower corners of the scene, shaded from
  // below by the firepit light. Replaces the prior square-block columns
  // that read as unfinished placeholders.
  drawBoulder(ctx, 58, 628, 28, 18);
  drawBoulder(ctx, 92, 654, 22, 14);
  drawBoulder(ctx, 912, 644, 26, 17);
  drawBoulder(ctx, 948, 660, 18, 11);
  // Small urn at lower-right — stone texture approximated by two tones.
  drawUrn(ctx, 900, 608);

  // ── SECONDARY FIREPIT (atmospheric, far-right) ───────────────────────
  const firepit2 = images.hamlet_env_6;
  if (firepit2) {
    const bw = 64, bh = 64;
    const fx = 880, fy = 660;
    const pulse = 0.7 + 0.3 * Math.sin(performance.now() / 350);
    const halo = ctx.createRadialGradient(fx, fy - 10, 4, fx, fy - 10, 70);
    halo.addColorStop(0, `rgba(255, 160, 80, ${(0.35 * pulse).toFixed(3)})`);
    halo.addColorStop(1, 'rgba(255, 160, 80, 0)');
    ctx.fillStyle = halo;
    ctx.fillRect(fx - 70, fy - 10 - 70, 140, 140);
    ctx.drawImage(firepit2, Math.round(fx - bw / 2), Math.round(fy - bh + 6), bw, bh);
  }

  // ── AIR DUST MOTES ───────────────────────────────────────────────────
  // Drawn LAST so they drift in front of buildings. Extended across the
  // full painted range so wide-canvas strips are also populated.
  for (let i = 0; i < 22; i++) {
    const baseX = (i * 91) % BG_W;
    const baseY = 180 + ((i * 37) % 330);
    const driftX = BG_X_MIN + ((baseX + now * 8 + i * 3) % BG_W);
    const wobbleY = baseY + Math.sin(now * 0.5 + i * 0.7) * 4;
    const alpha = 0.35 + 0.25 * Math.sin(now * 0.8 + i);
    ctx.fillStyle = `rgba(232, 210, 180, ${alpha.toFixed(3)})`;
    ctx.fillRect(driftX | 0, wobbleY | 0, 1, 1);
  }
}

// ---- Ambient prop helpers --------------------------------------------------
// Small pixel-art-styled boulders + urn drawn procedurally. Cheaper than
// commissioning sprites and matches the procedurally-tinted hamlet look.
function drawBoulder(ctx, cx, cy, rx, ry) {
  // Shadow
  ctx.fillStyle = 'rgba(4, 2, 6, 0.45)';
  ctx.beginPath();
  ctx.ellipse(cx + 2, cy + ry * 0.4, rx + 2, ry * 0.35, 0, 0, Math.PI * 2);
  ctx.fill();
  // Body
  ctx.fillStyle = '#3b3034';
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  // Top highlight
  ctx.fillStyle = '#5a4a4c';
  ctx.beginPath();
  ctx.ellipse(cx - rx * 0.15, cy - ry * 0.35, rx * 0.7, ry * 0.35, 0, 0, Math.PI * 2);
  ctx.fill();
  // Moss accent
  ctx.fillStyle = 'rgba(90, 120, 70, 0.55)';
  ctx.fillRect((cx - rx * 0.3) | 0, (cy + ry * 0.25) | 0, 3, 2);
}

function drawUrn(ctx, cx, cy) {
  // Shadow
  ctx.fillStyle = 'rgba(4, 2, 6, 0.45)';
  ctx.beginPath();
  ctx.ellipse(cx, cy + 14, 10, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  // Body (wider middle)
  ctx.fillStyle = '#6a4030';
  ctx.beginPath();
  ctx.ellipse(cx, cy + 4, 9, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  // Neck
  ctx.fillStyle = '#583424';
  ctx.fillRect(cx - 5, cy - 10, 10, 6);
  // Rim highlight
  ctx.fillStyle = '#8a5a3c';
  ctx.fillRect(cx - 6, cy - 11, 12, 2);
}

// Draw mid-air effects that must sit AFTER the portal tower entity — e.g.
// the prayer-flag line stretches across the tower's upper half, and if we
// drew it in the backdrop it'd get covered by the tower sprite. Called
// from main.js after drawHamletEntities (inside the camera transform).
export function drawHamletOverlay(ctx) {
  const now = performance.now() / 1000;

  const flagColors = ['#e06060', '#f4c858', '#7fc898', '#5e90c8', '#c060a0', '#f4c858', '#e06060'];
  const flagCount = 11;
  const startX = 380, endX = 690;
  const startY = 236, endY = 252;
  // Rope
  ctx.strokeStyle = 'rgba(20, 14, 14, 0.9)';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  for (let i = 0; i <= flagCount; i++) {
    const u = i / flagCount;
    const x = startX + (endX - startX) * u;
    const sag = Math.sin(u * Math.PI) * 18;
    const y = startY + (endY - startY) * u + sag;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  // Flags
  for (let i = 0; i < flagCount; i++) {
    const u = (i + 0.5) / flagCount;
    const x = startX + (endX - startX) * u;
    const sag = Math.sin(u * Math.PI) * 18;
    const y = startY + (endY - startY) * u + sag;
    const sway = Math.sin(now * 1.4 + i * 0.6) * 1.8;
    const fx = ((x - 5) | 0) + sway;
    const fy = (y | 0) + 1;
    ctx.fillStyle = flagColors[i % flagColors.length];
    ctx.fillRect(fx, fy, 11, 16);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
    ctx.fillRect(fx, fy + 13, 11, 3);
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
    const drawH = 220;
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
  const haloR = 110;
  const halo = ctx.createRadialGradient(e.x, e.y - 12, 4, e.x, e.y - 12, haloR);
  halo.addColorStop(0, `rgba(255, 170, 90, ${(0.48 * pulse).toFixed(3)})`);
  halo.addColorStop(0.55, `rgba(255, 130, 70, ${(0.18 * pulse).toFixed(3)})`);
  halo.addColorStop(1, 'rgba(255, 100, 60, 0)');
  ctx.fillStyle = halo;
  ctx.fillRect(e.x - haloR, e.y - 12 - haloR, haloR * 2, haloR * 2);

  // STONE RING — flat elliptical base that reads as "this is a built
  // firepit, not a patch of fire". Dark ring with a lit lip on the side
  // facing the viewer so it catches the flame glow.
  ctx.save();
  ctx.fillStyle = 'rgba(42, 32, 36, 0.96)';
  ctx.beginPath();
  ctx.ellipse(e.x, e.y + 8, 44, 14, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(80, 58, 52, 0.95)';
  ctx.beginPath();
  ctx.ellipse(e.x, e.y + 8, 38, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  // Lit front lip
  ctx.fillStyle = `rgba(255, 170, 90, ${(0.55 * pulse).toFixed(3)})`;
  ctx.beginPath();
  ctx.ellipse(e.x, e.y + 14, 36, 4, 0, 0, Math.PI);
  ctx.fill();
  ctx.restore();

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
