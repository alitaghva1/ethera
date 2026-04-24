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
// Walkable band WIDENED (post-Nano-layout pass) so the hamlet is a real
// place the hero moves through — approaching the tower, walking up into
// the shrine district, visiting the ruined edges — rather than a narrow
// strip in front of a backdrop. Obstacle circles below keep the hero out
// of building footprints so this larger area stays coherent.
export const HAMLET_WALK_Y_MIN = 340;
export const HAMLET_WALK_Y_MAX = 648;

// Hero spawn — bottom-center, on the entrance trail just south of the
// central plaza. Every path in the hub converges at the plaza; the
// entrance puts the hero one walk-step from the plaza's south edge.
export const HAMLET_HERO_SPAWN = { x: 480, y: 640 };

// Zone anchors — named positions for every meaningful location in the
// hamlet. Layout mirrors the design reference: plaza at the heart,
// tower north, forge southwest, archive east, shrine northwest, ruined
// edges in the back corners, rebuild scaffolding between plaza + archive.
const PORTAL_POS   = { x: 480, y: 400 };  // descent tower centre
const SHRINE_POS   = { x: 150, y: 440 };  // watcher shrine, west-mid
const FIREPIT_POS  = { x: 480, y: 540 };  // plaza campfire, heart
// (Forge/archive/shrine/ruin anchors live inline in drawHamletBackdrop as
// Z_* locals — they're only consumed by zone paints, not entities.)

// NPC world positions — one per district, not a service-counter row.
// spriteIdx maps to the pixel-art hamlet_npcp sheet (3×2):
//   0 keeper | 1 smith  | 2 archivist
//   3 grave  | 4 oracle | 5 wanderer
export const HAMLET_ENTITIES = [
  { kind: 'portal',                                 x: PORTAL_POS.x,  y: PORTAL_POS.y,  interactR: 80 },
  { kind: 'shrine',                                 x: SHRINE_POS.x,  y: SHRINE_POS.y,  interactR: 0  },
  { kind: 'firepit',                                x: FIREPIT_POS.x, y: FIREPIT_POS.y, interactR: 0  },
  // KEEPER — at the plaza, east-of-fire. Shop counter in the hub heart.
  { kind: 'npc', id: 'keeper',      spriteIdx: 0,   x: 560, y: 560, interactR: 50 },
  // SMITH — at the forge anvil.
  { kind: 'npc', id: 'smith',       spriteIdx: 1,   x: 240, y: 590, interactR: 50 },
  // ARCHIVIST — beside the archive's reading pedestal.
  { kind: 'npc', id: 'archivist',   spriteIdx: 2,   x: 765, y: 585, interactR: 50 },
  // GRAVEKEEPER — in the WEST RUIN graveyard. Curses belong among the graves.
  { kind: 'npc', id: 'gravekeeper', spriteIdx: 3,   x: 155, y: 395, interactR: 50 },
  // ORACLE — at the plaza, west-of-fire. Mystic seer by the hearth.
  { kind: 'npc', id: 'oracle',      spriteIdx: 4,   x: 400, y: 560, interactR: 50 },
  // WANDERER — in the EAST RUIN by the collapsed gate. Literal outsider.
  { kind: 'npc', id: 'wanderer',    spriteIdx: 5,   x: 860, y: 415, interactR: 50 },
];

// Solid obstacles the hero can't walk through. Circle-only for simplicity;
// every building and the two firepits get a footprint so the hero stays
// in the walkable corridors the paths imply. Called from main.js after
// the Y-clamp so the hero can't push into a sprite.
export const HAMLET_OBSTACLES = [
  // Descent tower (central, raised disc)
  { x: 480, y: 430, r: 62 },
  // Forge hut — wide footprint
  { x: 185, y: 490, r: 56 },
  { x: 225, y: 490, r: 56 },
  // Archive dome
  { x: 810, y: 490, r: 62 },
  // Background tower (far-left silhouette)
  { x: 80,  y: 380, r: 28 },
  // Main campfire — feet don't walk into the flame
  { x: 480, y: 540, r: 24 },
  // Builders' warming fire (rebuild zone)
  { x: 745, y: 630, r: 22 },
  // Watcher shrine — small footprint
  { x: 150, y: 435, r: 22 },
  // Scaffolding + cut-stone stack + half-wall (rebuild cluster blocks path)
  { x: 680, y: 610, r: 24 },
  { x: 720, y: 608, r: 20 },
  // Collapsed gate (east ruin) — leaning stone
  { x: 895, y: 375, r: 26 },
];

// Push the hero out of any obstacle they're currently inside. Cheap
// per-tick O(N) sweep — N is tiny. Called after the hamlet Y-clamp.
export function resolveHamletCollision(hero) {
  for (const o of HAMLET_OBSTACLES) {
    const dx = hero.x - o.x;
    const dy = hero.y - o.y;
    const d2 = dx * dx + dy * dy;
    const rh = 10;   // hero body radius
    const rr = o.r + rh;
    if (d2 < rr * rr) {
      const d = Math.sqrt(d2) || 0.001;
      const push = (rr - d) / d;
      hero.x += dx * push;
      hero.y += dy * push;
      // zero velocity component into the obstacle
      hero.vx = 0; hero.vy = 0;
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

  // ══════════════════════════════════════════════════════════════════════
  // GROUND COMPOSITION — ZONE-BASED LEVEL DESIGN
  //
  // Instead of scattering random overlays across the whole ground, the
  // floor is composed from NAMED ZONES that reflect the story of the
  // place. Zones are painted back-to-front:
  //   1. Base cobble tiles (existing tiling, kept subtler)
  //   2. Horizon feather (cobble→sky blend)
  //   3. Nature reclaim — moss-tinted edges
  //   4. Tower damage zone — dark desaturated ring around the ruin
  //   5. Building pads — warm/cool tints at each building approach
  //   6. Paths — warm additive bands between anchors
  //   7. Central plaza — brightest zone around the campfire
  //   8. Intentional decor clusters (rubble, moss, cracks) at authored
  //      positions keyed to story, not uniform random
  //
  // 70/20/10 rule: 70% base stone read, 20% zone tint, 10% heavy damage
  // in intentional clusters.
  // ══════════════════════════════════════════════════════════════════════

  // ── GROUND · BASE COBBLE TILES ───────────────────────────────────────
  // Same 64px tiling as before with jitter + flips to disguise the
  // source grid. Keeps the underlying stone texture but is no longer
  // "the whole ground" — it's just the neutral base.
  const subtiles = ensureCobbleSubtiles();
  if (subtiles && subtiles.length === 9) {
    const tileW = 64, tileH = 64;
    const drawW = tileW + 4, drawH = tileH + 4;
    const groundTop = 300;
    let row = 0;
    for (let y = groundTop; y < 672; y += tileH, row++) {
      const xOffset = ((row * 17) % 13) - 6;
      for (let x = BG_X_MIN - tileW; x < BG_X_MAX + tileW; x += tileW) {
        const xi = ((x + xOffset) / tileW) | 0;
        const h = cellHash(xi, (y / tileH) | 0, 1000);
        const i = h % 9;
        const yOffset = ((h >>> 8) % 7) - 3;
        const flipX = ((h >>> 4) & 1) === 0;
        ctx.save();
        if (flipX) {
          ctx.translate(x + xOffset + drawW, y + yOffset);
          ctx.scale(-1, 1);
          ctx.drawImage(subtiles[i], 0, 0, drawW, drawH);
        } else {
          ctx.drawImage(subtiles[i], x + xOffset, y + yOffset, drawW, drawH);
        }
        ctx.restore();
      }
    }
  }

  // ── GROUND · HORIZON FEATHER ─────────────────────────────────────────
  // Cobble blends into the warm sky amber instead of a hard edge.
  {
    const hz = ctx.createLinearGradient(0, 290, 0, 350);
    hz.addColorStop(0, 'rgba(30, 18, 32, 0.85)');
    hz.addColorStop(1, 'rgba(30, 18, 32, 0)');
    ctx.fillStyle = hz;
    ctx.fillRect(BG_X_MIN, 290, BG_W, 62);
  }

  // ── ZONE ANCHORS ─────────────────────────────────────────────────────
  // Coordinates mirror the Nano design reference. Plaza is the heart;
  // tower sits on a raised stone disc north of it; three districts
  // (forge SW, shrine NW, archive E) ring the plaza; rebuild scaffolding
  // sits on the plaza-to-archive spoke; ruin zones fill the back corners.
  const Z_PLAZA   = { x: 480, y: 540 };  // campfire — the heart
  const Z_SPAWN   = { x: 480, y: 644 };  // entrance trail
  const Z_TOWER   = { x: 480, y: 400 };  // descent tower, raised disc
  const Z_FORGE   = { x: 200, y: 575 };  // forge anvil / doorway
  const Z_ARCHIVE = { x: 800, y: 555 };  // archive pedestal
  const Z_SHRINE  = { x: 150, y: 440 };  // watcher shrine
  const Z_WEST_RUIN = { x: 115, y: 360 };
  const Z_EAST_RUIN = { x: 870, y: 380 };

  // ── ZONE · GROUND LEVEL-TONE ─────────────────────────────────────────
  // Very subtle desaturation on the base cobble so the district pads
  // below look cleaner without turning the surrounding ground into
  // black void. Alpha kept very low — pads + paths are opaque paints,
  // they don't need the base significantly dimmed to stand out.
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = 'rgba(200, 190, 178, 1)';
  ctx.globalAlpha = 0.35;
  ctx.fillRect(BG_X_MIN, 300, BG_W, 372);
  ctx.restore();

  // ── ZONE · OVERSCAN STRIPS (outside playable room) ───────────────────
  // The extended -360..0 / 960..1320 strips fill the void on wide
  // viewports. Make them visibly DARKER than the settlement — "past the
  // walls" — so the playable room feels enclosed.
  {
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    const lg = ctx.createLinearGradient(BG_X_MIN, 400, 0, 400);
    lg.addColorStop(0, 'rgba(40, 40, 55, 1)');
    lg.addColorStop(1, 'rgba(130, 135, 140, 1)');
    ctx.fillStyle = lg;
    ctx.fillRect(BG_X_MIN, 300, -BG_X_MIN, 372);
    const rg = ctx.createLinearGradient(960, 400, BG_X_MAX, 400);
    rg.addColorStop(0, 'rgba(130, 135, 140, 1)');
    rg.addColorStop(1, 'rgba(40, 40, 55, 1)');
    ctx.fillStyle = rg;
    ctx.fillRect(960, 300, BG_X_MAX - 960, 372);
    ctx.restore();
  }

  // ── ZONE · WEST & EAST RUIN PATCHES ──────────────────────────────────
  // Authored material patches in the back corners. West = mossy graveyard
  // overgrowth; east = tan dirt + collapsed gatehouse. Bigger + more
  // saturated than the prior pass so the "ruined edge" reads clearly.
  paintRuinPatch(ctx, Z_WEST_RUIN.x, Z_WEST_RUIN.y, 165, 'west');
  paintRuinPatch(ctx, Z_EAST_RUIN.x, Z_EAST_RUIN.y, 175, 'east');

  // ── ZONE · PERIMETER RUINS ───────────────────────────────────────────
  // Broken wall segments running along the BACK of the playable room
  // (y~330) with visible gaps between them. Tells the player "this
  // settlement used to be bigger" and gives the hub a defined edge
  // instead of the back fading into the sky.
  drawBrokenWallSegment(ctx, 220, 348, 60);
  drawBrokenWallSegment(ctx, 330, 338, 70);
  drawBrokenWallSegment(ctx, 575, 348, 65);
  drawBrokenWallSegment(ctx, 695, 340, 75);
  drawBrokenWallSegment(ctx, 795, 352, 60);

  // ── ZONE · ENTRANCE DIRT TRAIL ───────────────────────────────────────
  // Dirt approach from offscreen south widening into the plaza's south
  // edge. Reads as "the player's path back home" — not cobble, because
  // outside the hamlet the ground hasn't been paved.
  paintDirtPad(ctx, 480, 655, 55, 22);
  paintDirtPad(ctx, 480, 640, 45, 16);

  // ── ZONE · REBUILD DIRT PAD ──────────────────────────────────────────
  // Construction site has bare earth underfoot — not cobble. The pad
  // anchors the scaffolding/stone-stack/half-wall cluster as a working
  // area, not props randomly dropped on stone.
  paintDirtPad(ctx, 685, 618, 90, 42);

  // ── ZONE · BUILDING PADS (organic ovals) ─────────────────────────────
  // Each district pad is an OVAL (not a rectangle) so it reads as a
  // "cleared courtyard" rather than "laid platform". Each has its own
  // material palette: forge warm gold, archive cool grey, shrine violet.
  paintOvalPad(ctx, Z_FORGE.x, 568, 98, 61, {
    body: '#8c7448', inner: '#a48658', edge: 'rgba(58, 44, 26, 1)', hi: '#c4a878',
  });
  paintOvalPad(ctx, Z_ARCHIVE.x, 560, 92, 64, {
    body: '#626672', inner: '#787c88', edge: 'rgba(34, 36, 44, 1)', hi: '#98a0ac',
  });
  paintOvalPad(ctx, Z_SHRINE.x, Z_SHRINE.y, 64, 50, {
    body: '#564866', inner: '#70607e', edge: 'rgba(32, 24, 40, 1)', hi: '#8878a0',
    tint: 'rgba(160, 120, 200, 0.30)',
  });

  // ── ZONE · PATHS ─────────────────────────────────────────────────────
  // Paths painted AFTER pads but BEFORE plaza & tower, so paths feed into
  // pads and are overlaid by the plaza/tower centers. Primary spine is
  // widest; spokes narrower; back connector is the narrowest/dimmest.
  paintPath(ctx, Z_SPAWN,   Z_PLAZA,   72, 'primary');
  paintPath(ctx, Z_PLAZA,   Z_TOWER,   70, 'primary');
  paintPath(ctx, Z_PLAZA,   Z_FORGE,   58, 'spoke');
  paintPath(ctx, Z_PLAZA,   Z_ARCHIVE, 58, 'spoke');
  paintPath(ctx, Z_PLAZA,   Z_SHRINE,  54, 'spoke');
  paintPath(ctx, Z_SHRINE,  { x: 330, y: 395 }, 42, 'back');
  paintPath(ctx, { x: 330, y: 395 }, Z_TOWER,   42, 'back');
  paintPath(ctx, Z_TOWER,   { x: 640, y: 395 }, 42, 'back');
  paintPath(ctx, { x: 640, y: 395 }, Z_EAST_RUIN, 42, 'back');

  // ── ZONE · TOWER BASE DISC ───────────────────────────────────────────
  // Dark scorched stone disc; sits ABOVE the plaza with a 30-40px gap
  // of path between them (visual separation).
  paintTowerBase(ctx, Z_TOWER.x, Z_TOWER.y + 40, 72);

  // ── ZONE · CENTRAL PLAZA ─────────────────────────────────────────────
  // Radial-wedge flagstone plaza with concentric bands. r=130.
  paintPlazaRing(ctx, Z_PLAZA.x, Z_PLAZA.y, 130);

  // ── CLUSTER DECOR · EDGE MOSS (nature reclaim) ───────────────────────
  // Moss tufts along the ruin patches + around building back walls.
  // Denser on the west side (graveyard overgrowth) than the east side.
  drawMossCluster(ctx, 80,  390, 18);
  drawMossCluster(ctx, 50,  440, 14);
  drawMossCluster(ctx, 140, 480, 10);
  drawMossCluster(ctx, 40,  540, 10);
  // East side — fewer tufts because east reads as "dirt + collapsed"
  drawMossCluster(ctx, 915, 460, 8);
  drawMossCluster(ctx, 895, 600, 10);
  // Behind-tower subtle reclaim
  drawMossCluster(ctx, 400, 345, 7);
  drawMossCluster(ctx, 560, 345, 7);

  // ── CLUSTER DECOR · TOWER RUBBLE ─────────────────────────────────────
  // Stone chunks ringing the tower base. These sit ON the tower disc.
  drawTowerRubble(ctx, Z_TOWER.x, Z_TOWER.y + 40);

  // ── CLUSTER DECOR · CRACKS ───────────────────────────────────────────
  // Cracks only on the tower disc edge and the east-ruin collapse zone.
  drawCrackCluster(ctx, 450, 490, 3);
  drawCrackCluster(ctx, 510, 500, 3);
  drawCrackCluster(ctx, 870, 420, 4);
  drawCrackCluster(ctx, 900, 480, 3);

  // ── HORIZON FEATHER (top layer) ──────────────────────────────────────
  {
    const hz2 = ctx.createLinearGradient(0, 290, 0, 340);
    hz2.addColorStop(0, 'rgba(30, 18, 32, 0.55)');
    hz2.addColorStop(1, 'rgba(30, 18, 32, 0)');
    ctx.fillStyle = hz2;
    ctx.fillRect(BG_X_MIN, 290, BG_W, 50);
  }

  // ── PROPS · DISTRICT ANCHORS ─────────────────────────────────────────
  // Every prop tells the district's function:
  //   plaza: benches + lantern post (people sit here at dusk)
  //   forge: anvil + woodpile + barrels (smith works outside)
  //   archive: reading pedestal + cool lantern (scholarship)
  //   shrine: standing stone + offering bowl (mystical)
  //   tower: fallen bell on rubble
  //   rebuild: scaffolding + cut-stone stack + half-wall
  //   west ruin: grave markers (curses home)
  //   east ruin: collapsed gate frame (wanderer's "arrival")

  // PLAZA props — benches ring the fire, lantern post east.
  // Plaza r=124 at (480, 540): inner walkable ring spans ~y 470–610.
  drawBench(ctx, 442, 488);    // north-west bench
  drawBench(ctx, 518, 488);    // north-east bench
  drawBench(ctx, 418, 596);    // south-west bench
  drawBench(ctx, 542, 596);    // south-east bench
  drawLanternPost(ctx, 582, 510, 'warm');  // plaza lantern (east, above bench)
  // FORGE props
  drawAnvil(ctx, 260, 600);
  drawWoodpile(ctx, 130, 620);
  drawBarrel(ctx, 110, 585);
  // ARCHIVE props
  drawReadingPedestal(ctx, 740, 580);
  drawLanternPost(ctx, 860, 580, 'cool');  // archive lantern
  drawCrateStack(ctx, 870, 610);
  // SHRINE props
  drawStandingStone(ctx, Z_SHRINE.x, Z_SHRINE.y - 6);
  drawOfferingBowl(ctx, Z_SHRINE.x + 16, Z_SHRINE.y + 18);
  // TOWER props
  drawFallenBell(ctx, 535, 445);
  // REBUILD props (scaffolding + cut-stone stack + half-built wall)
  drawHalfWall(ctx, 680, 615);
  drawStoneStack(ctx, 640, 625);
  drawScaffolding(ctx, 720, 608);
  // WEST RUIN props — tombstones, one toppled
  drawGraveMarker(ctx, 70, 395, 0);
  drawGraveMarker(ctx, 125, 360, -0.15);
  drawGraveMarker(ctx, 170, 420, 0.4);   // toppled
  // EAST RUIN props — collapsed archway + scattered beams
  drawCollapsedGate(ctx, 895, 380);
  drawBrokenBeam(ctx, 845, 430);

  // ── BUILDINGS · BACK TO FRONT ────────────────────────────────────────
  // Scales chosen so the hero (96px tall) reads roughly 1/2 building
  // height — proper top-down-hub proportions instead of giant ruins.

  // LAYER A — FAR distant tower (background silhouette)
  const towerBg = images.hamlet_env_3;
  if (towerBg) {
    const bw = 85, bh = 120;
    ctx.save();
    ctx.globalAlpha = 0.45;
    ctx.drawImage(towerBg, Math.round(80 - bw / 2), Math.round(385 - bh), bw, bh);
    ctx.restore();
  }

  // LAYER B — DOME (right), with cool teal interior glow.
  const dome = images.hamlet_env_1;
  if (dome) {
    const bw = 165, bh = 180;
    const dx = Z_ARCHIVE.x + 10, dy = 515;
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

  // LAYER C — FORGE (left), with hot orange window flicker.
  const forge = images.hamlet_env_0;
  if (forge) {
    const bw = 210, bh = 235;
    const fx = Z_FORGE.x, fy = 520;
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

  // (Foreground ambient boulders removed — the zone-based ruin patches +
  // authored district props now carry that framing duty without dropping
  // large dark blobs in the walkable corridor.)

  // ── SECONDARY FIREPIT — rebuild site warming fire ────────────────────
  // Repurposed as the "builders' warming fire" next to the scaffolding.
  // Tells the player the rebuild zone is actively being worked on, not
  // abandoned. Small, functional.
  const firepit2 = images.hamlet_env_6;
  if (firepit2) {
    const bw = 56, bh = 56;
    const fx = 745, fy = 635;
    const pulse = 0.7 + 0.3 * Math.sin(performance.now() / 350);
    const halo = ctx.createRadialGradient(fx, fy - 10, 4, fx, fy - 10, 64);
    halo.addColorStop(0, `rgba(255, 160, 80, ${(0.34 * pulse).toFixed(3)})`);
    halo.addColorStop(1, 'rgba(255, 160, 80, 0)');
    ctx.fillStyle = halo;
    ctx.fillRect(fx - 64, fy - 10 - 64, 128, 128);
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

// ---- Zone-paint helpers ---------------------------------------------------
// Small building blocks used by drawHamletBackdrop to compose the ground
// from NAMED ZONES instead of scattering random overlays. Each helper does
// one job cleanly so the zone list reads top-to-bottom like a level designer's
// layer stack.

// Paint a paved stone walkway between two anchors. Draws a solid
// rotated rectangle with dark edge lines + soft alpha taper at both
// ends so the path reads as a proper stone corridor (not a glowing
// stripe). Tier chooses brightness: primary spine is cleanest,
// spokes slightly dimmer, back connector darker.
function paintPath(ctx, from, to, width, tier = 'primary') {
  const dx = to.x - from.x, dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len < 1) return;
  const angle = Math.atan2(dy, dx);
  ctx.save();
  ctx.translate(from.x, from.y);
  ctx.rotate(angle);

  // Tier palette
  const body = tier === 'primary' ? '#7a6244' : tier === 'spoke' ? '#6f583c' : '#5a4632';
  const hi   = tier === 'primary' ? 'rgba(170, 130, 80, 0.35)'
             : tier === 'spoke'   ? 'rgba(155, 115, 70, 0.28)'
                                  : 'rgba(130, 95, 55, 0.20)';
  const edge = 'rgba(22, 16, 14, 0.65)';

  // End-tapered body — linear alpha ramp fades at first/last 10%.
  const bodyGrad = ctx.createLinearGradient(0, 0, len, 0);
  bodyGrad.addColorStop(0,    'rgba(0, 0, 0, 0)');
  bodyGrad.addColorStop(0.1,  body);
  bodyGrad.addColorStop(0.9,  body);
  bodyGrad.addColorStop(1,    'rgba(0, 0, 0, 0)');
  ctx.fillStyle = bodyGrad;
  ctx.fillRect(0, -width / 2, len, width);

  // Warm inner sheen running down the middle
  const sheen = ctx.createLinearGradient(0, -width / 2, 0, width / 2);
  sheen.addColorStop(0,   'rgba(0, 0, 0, 0)');
  sheen.addColorStop(0.5, hi);
  sheen.addColorStop(1,   'rgba(0, 0, 0, 0)');
  const sheenAlpha = ctx.createLinearGradient(0, 0, len, 0);
  sheenAlpha.addColorStop(0,    'rgba(0, 0, 0, 0)');
  sheenAlpha.addColorStop(0.15, sheen ? 'rgba(0, 0, 0, 1)' : 'rgba(0, 0, 0, 0)');
  // simpler: just paint the sheen without end-fade (edge tapering dominates)
  ctx.fillStyle = sheen;
  ctx.fillRect(0, -width / 2, len, width);

  // Dark edge lines (top + bottom of the path)
  const edgeGrad = ctx.createLinearGradient(0, 0, len, 0);
  edgeGrad.addColorStop(0,    'rgba(0, 0, 0, 0)');
  edgeGrad.addColorStop(0.1,  edge);
  edgeGrad.addColorStop(0.9,  edge);
  edgeGrad.addColorStop(1,    'rgba(0, 0, 0, 0)');
  ctx.fillStyle = edgeGrad;
  ctx.fillRect(0, -width / 2,     len, 1.5);
  ctx.fillRect(0,  width / 2 - 2, len, 1.5);

  // Subtle perpendicular brick seams every ~34px
  ctx.strokeStyle = 'rgba(24, 16, 12, 0.35)';
  ctx.lineWidth = 1;
  for (let x = 26; x < len - 20; x += 34) {
    const alpha = Math.sin((x / len) * Math.PI);
    if (alpha < 0.15) continue;
    ctx.globalAlpha = 0.35 * alpha;
    ctx.beginPath();
    ctx.moveTo(x, -width / 2 + 2);
    ctx.lineTo(x,  width / 2 - 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

// Central plaza — radial-wedge flagstone paving with three concentric
// bands + proper pie-slice divider lines (not just concentric rings).
// Reads as real pavement, not a tinted disc. Paths visually terminate
// at its outer boundary.
function paintPlazaRing(ctx, cx, cy, r) {
  // Drop shadow
  ctx.save();
  ctx.fillStyle = 'rgba(4, 2, 6, 0.5)';
  ctx.beginPath();
  ctx.arc(cx, cy + 5, r + 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Outer dark boundary — 6px weathered rim
  ctx.fillStyle = '#342a20';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  // OUTER BAND — darker amber flagstone (12 wedges)
  ctx.fillStyle = '#7a5c38';
  ctx.beginPath();
  ctx.arc(cx, cy, r - 6, 0, Math.PI * 2);
  ctx.fill();
  // MID BAND — warmer amber
  ctx.fillStyle = '#95754c';
  ctx.beginPath();
  ctx.arc(cx, cy, r - 42, 0, Math.PI * 2);
  ctx.fill();
  // INNER HEARTH — warmest
  ctx.fillStyle = '#ac8756';
  ctx.beginPath();
  ctx.arc(cx, cy, r - 78, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  // OUTER BAND · 12 radial wedge dividers (pie slices)
  ctx.strokeStyle = 'rgba(30, 20, 12, 0.70)';
  ctx.lineWidth = 1.6;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + 0.13;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * (r - 42), cy + Math.sin(a) * (r - 42));
    ctx.lineTo(cx + Math.cos(a) * (r - 1),  cy + Math.sin(a) * (r - 1));
    ctx.stroke();
  }
  // MID BAND · 8 radial dividers
  ctx.lineWidth = 1.3;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * (r - 78), cy + Math.sin(a) * (r - 78));
    ctx.lineTo(cx + Math.cos(a) * (r - 42), cy + Math.sin(a) * (r - 42));
    ctx.stroke();
  }
  // Band boundary circles
  ctx.strokeStyle = 'rgba(26, 18, 12, 0.55)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, r - 42, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, r - 78, 0, Math.PI * 2);
  ctx.stroke();
  // Short perpendicular flagstone seams on the outer band (midpoints)
  ctx.strokeStyle = 'rgba(30, 20, 12, 0.45)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + 0.13 + (Math.PI / 12);
    const r1 = r - 22, r2 = r - 25;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
    ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
    ctx.stroke();
  }
  ctx.restore();

  // Firelight halo
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const glow = ctx.createRadialGradient(cx, cy, 10, cx, cy, r);
  glow.addColorStop(0,   'rgba(255, 190, 110, 0.42)');
  glow.addColorStop(0.5, 'rgba(255, 150, 80, 0.15)');
  glow.addColorStop(1,   'rgba(255, 140, 80, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  ctx.restore();
}

// Organic oval building pad — used for the forge and archive (no more
// hard rectangles). Reads as "cleared courtyard", not "laid platform".
// Has a drop shadow, body, lighter interior, dark edge ring, and
// optional tint for districts with a colored palette.
function paintOvalPad(ctx, cx, cy, rx, ry, { body, inner, edge, hi, tint, tintAlpha = 0.28 }) {
  // Drop shadow
  ctx.fillStyle = 'rgba(4, 2, 6, 0.4)';
  ctx.beginPath();
  ctx.ellipse(cx, cy + ry - 2, rx + 5, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  // Body fill
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  // Inner lighter stone area
  ctx.fillStyle = inner;
  ctx.beginPath();
  ctx.ellipse(cx, cy - 2, rx - 10, ry - 8, 0, 0, Math.PI * 2);
  ctx.fill();
  // Horizontal flagstone seams clipped to the ellipse
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx - 1, ry - 1, 0, 0, Math.PI * 2);
  ctx.clip();
  ctx.strokeStyle = edge;
  ctx.globalAlpha = 0.6;
  ctx.lineWidth = 1;
  for (let y = cy - ry + 12; y < cy + ry - 4; y += 13) {
    ctx.beginPath();
    ctx.moveTo(cx - rx, y);
    ctx.lineTo(cx + rx, y);
    ctx.stroke();
  }
  // Vertical brick seams (offset per row)
  let r = 0;
  for (let y = cy - ry + 12; y < cy + ry - 4; y += 13, r++) {
    const offset = (r & 1) ? 14 : 0;
    for (let x = cx - rx + offset; x < cx + rx; x += 28) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + 13);
      ctx.stroke();
    }
  }
  ctx.restore();
  // Edge dark ring
  ctx.strokeStyle = edge;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.stroke();
  // Top highlight arc
  ctx.strokeStyle = hi;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(cx, cy - 1, rx - 2, ry - 2, 0, Math.PI * 1.05, Math.PI * 1.95);
  ctx.stroke();
  // Optional tint overlay
  if (tint) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(cx, cy, 6, cx, cy, rx);
    g.addColorStop(0, tint);
    g.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.globalAlpha = tintAlpha;
    ctx.fillStyle = g;
    ctx.fillRect(cx - rx, cy - ry, rx * 2, ry * 2);
    ctx.restore();
  }
}

// Bare dirt pad — used under the rebuild scaffolding and the south
// entrance trail. Opaque earth tone with subtle divot speckles so
// the area reads as "bare earth, not paved".
function paintDirtPad(ctx, cx, cy, rx, ry) {
  ctx.fillStyle = 'rgba(4, 2, 6, 0.38)';
  ctx.beginPath();
  ctx.ellipse(cx, cy + ry - 2, rx + 3, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  // Base dirt
  ctx.fillStyle = '#6a4e34';
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  // Lighter top
  ctx.fillStyle = '#7a5e44';
  ctx.beginPath();
  ctx.ellipse(cx, cy - 3, rx - 6, ry - 4, 0, 0, Math.PI * 2);
  ctx.fill();
  // Dirt divot speckles — scale count to area
  const speckles = Math.max(6, Math.round(rx * ry / 80));
  for (let i = 0; i < speckles; i++) {
    const h = cellHash(cx + i * 13, cy + i * 7, 100000);
    const dxs = ((h % 200) - 100) / 100 * rx * 0.85;
    const dys = (((h >>> 8) % 200) - 100) / 100 * ry * 0.8;
    ctx.fillStyle = 'rgba(38, 26, 16, 0.55)';
    ctx.fillRect((cx + dxs) | 0, (cy + dys) | 0, 2, 2);
  }
  // Edge darker ring
  ctx.strokeStyle = 'rgba(28, 18, 12, 0.5)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.stroke();
}

// Broken wall segment — a chunk of collapsed stone wall. Used along the
// back perimeter to tell the "this hamlet used to be bigger" story.
// Each segment has a jagged top + scattered rubble blocks at the base.
function drawBrokenWallSegment(ctx, cx, cy, w) {
  // Rubble base shadow
  ctx.fillStyle = 'rgba(4, 2, 6, 0.5)';
  ctx.fillRect(cx - w / 2 - 6, cy + 6, w + 12, 5);
  // Wall body
  const h = 22;
  ctx.fillStyle = '#3a342e';
  ctx.fillRect(cx - w / 2, cy - h + 4, w, h);
  // Chipped top — pseudo-random heights per chunk
  const chunks = 5;
  const cw = w / chunks;
  for (let i = 0; i < chunks; i++) {
    const hh = (cellHash(cx + i * 19, cy, 1000) % 6);
    const top = cy - h + 4 - hh;
    ctx.fillStyle = '#3a342e';
    ctx.fillRect(cx - w / 2 + i * cw, top, cw, hh);
    // Top highlight
    ctx.fillStyle = '#5a5248';
    ctx.fillRect(cx - w / 2 + i * cw, top, cw, 1);
  }
  // Vertical stone seams
  ctx.fillStyle = 'rgba(14, 10, 10, 0.6)';
  for (let i = 1; i < chunks; i++) {
    ctx.fillRect(cx - w / 2 + i * cw, cy - h + 4, 1, h - 4);
  }
  // Horizontal course line
  ctx.fillRect(cx - w / 2, cy - 6, w, 1);
  // Scattered rubble blocks at the base (left + right)
  ctx.fillStyle = '#4a4238';
  ctx.fillRect(cx - w / 2 - 10, cy + 2, 10, 7);
  ctx.fillRect(cx + w / 2, cy + 4, 12, 6);
  ctx.fillStyle = '#6a6258';
  ctx.fillRect(cx - w / 2 - 10, cy + 2, 10, 1);
  ctx.fillRect(cx + w / 2, cy + 4, 12, 1);
  // Small dark soil at base (the wall has been here a while)
  ctx.fillStyle = 'rgba(30, 22, 16, 0.4)';
  ctx.fillRect(cx - w / 2 - 14, cy + 9, w + 28, 2);
}

// Tower base — small dark scorched stone disc the tower sits on.
// Cracks + scorch marks emphasize the ruin; the disc visually
// elevates the tower above the plaza level.
function paintTowerBase(ctx, cx, cy, r) {
  // Shadow under disc
  ctx.save();
  ctx.fillStyle = 'rgba(4, 2, 6, 0.55)';
  ctx.beginPath();
  ctx.arc(cx, cy + 5, r + 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // Outer darker stone
  ctx.fillStyle = '#342a2a';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  // Inner slightly lighter
  ctx.fillStyle = '#453838';
  ctx.beginPath();
  ctx.arc(cx, cy, r - 10, 0, Math.PI * 2);
  ctx.fill();
  // Scorched centre
  ctx.fillStyle = '#1c1416';
  ctx.beginPath();
  ctx.arc(cx, cy, r - 28, 0, Math.PI * 2);
  ctx.fill();
  // Edge ring line
  ctx.strokeStyle = 'rgba(14, 10, 12, 0.7)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, r - 1, 0, Math.PI * 2);
  ctx.stroke();
  // Radial cracks from centre
  ctx.save();
  ctx.strokeStyle = 'rgba(10, 6, 8, 0.85)';
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.4;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * (r - 12), cy + Math.sin(a) * (r - 12));
    ctx.stroke();
  }
  ctx.restore();
}

// (paintRectPad + paintCirclePad removed — all pads now use paintOvalPad
// for organic "cleared courtyard" read instead of geometric platforms.)

// Ruin patch — authored area at the back corners telling a specific
// "kind of broken": 'west' = graveyard overgrowth (moss + dark green);
// 'east' = collapsed dirt (tan + rubble). Each patch darkens the
// cobble underneath via multiply so the ruin reads as "this area is
// genuinely different from the rebuilt zones".
function paintRuinPatch(ctx, cx, cy, r, kind) {
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  const g = ctx.createRadialGradient(cx, cy, 20, cx, cy, r);
  if (kind === 'west') {
    g.addColorStop(0,   'rgba(58, 72, 42, 1)');   // deep moss
    g.addColorStop(0.55,'rgba(110, 115, 90, 1)');
    g.addColorStop(1,   'rgba(255, 255, 255, 1)');
  } else {
    g.addColorStop(0,   'rgba(120, 90, 60, 1)');  // tan dirt
    g.addColorStop(0.55,'rgba(170, 155, 130, 1)');
    g.addColorStop(1,   'rgba(255, 255, 255, 1)');
  }
  ctx.fillStyle = g;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  ctx.restore();
}

// Hand-placed stone rubble ring around the tower base. The tower IS
// collapsing, so pieces have to go somewhere; each chunk has a drop
// shadow so it reads as sitting on the cobble instead of floating.
function drawTowerRubble(ctx, cx, cy) {
  // Ring of stone chunks at specific angles + distances from the tower
  // base. Authored, not random — the cluster needs to frame the tower
  // and not block the path into it.
  const rubble = [
    { dx: -64, dy: -12, w: 11, h: 6 },
    { dx: -44, dy:   8, w:  8, h: 5 },
    { dx: -28, dy:  22, w:  9, h: 5 },
    { dx:  24, dy: -18, w: 10, h: 6 },
    { dx:  52, dy:  -2, w: 12, h: 6 },
    { dx:  38, dy:  24, w:  9, h: 5 },
    { dx: -76, dy:  28, w: 14, h: 7 },
    { dx:  72, dy:  28, w: 13, h: 7 },
    { dx: -12, dy:  36, w:  7, h: 4 },
    { dx:  14, dy:  40, w:  8, h: 5 },
  ];
  for (const r of rubble) {
    const x = cx + r.dx, y = cy + r.dy;
    // Drop shadow
    ctx.fillStyle = 'rgba(4, 2, 6, 0.45)';
    ctx.beginPath();
    ctx.ellipse(x + 1, y + r.h * 0.6, r.w * 0.85, r.h * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
    // Stone body
    ctx.fillStyle = '#5a4d4e';
    ctx.beginPath();
    ctx.ellipse(x, y, r.w, r.h, 0, 0, Math.PI * 2);
    ctx.fill();
    // Top highlight
    ctx.fillStyle = '#7d6e70';
    ctx.beginPath();
    ctx.ellipse(x - r.w * 0.15, y - r.h * 0.35, r.w * 0.6, r.h * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Clustered moss tufts — `count` speckles inside a small radius around
// (cx, cy). Stable per cluster via cellHash so the arrangement doesn't
// reshuffle each frame. Used at authored zone edges only; no uniform-
// random scatter across the whole floor.
function drawMossCluster(ctx, cx, cy, count) {
  for (let i = 0; i < count; i++) {
    const h = cellHash(cx + i * 13, cy + i * 17, 1000000);
    const dx = ((h % 100) - 50) * 0.32;
    const dy = (((h >>> 8) % 100) - 50) * 0.22;
    const sz = 2 + ((h >>> 12) & 1);
    const shade = (h >>> 14) & 3;
    const col = shade === 0 ? 'rgba(75, 95, 50, 0.75)'
              : shade === 1 ? 'rgba(95, 115, 60, 0.70)'
              : shade === 2 ? 'rgba(110, 130, 70, 0.62)'
              :               'rgba(60, 80, 42, 0.72)';
    ctx.fillStyle = col;
    ctx.fillRect((cx + dx) | 0, (cy + dy) | 0, sz, sz);
  }
}

// Clustered hairline cracks — `count` dark streaks in a small area around
// (cx, cy), with a mid-point jog so they don't read as perfect lines.
// Used only in damage zones (tower base + scene corners), never in paths
// or plaza.
function drawCrackCluster(ctx, cx, cy, count) {
  ctx.save();
  ctx.strokeStyle = 'rgba(18, 12, 14, 0.72)';
  ctx.lineWidth = 1;
  for (let i = 0; i < count; i++) {
    const h = cellHash(cx + i * 41, cy + i * 53, 1000000);
    const dx = ((h % 100) - 50) * 0.42;
    const dy = (((h >>> 8) % 100) - 50) * 0.28;
    const angle = (((h >>> 16) % 180) * Math.PI) / 180;
    const len = 22 + ((h >>> 4) % 18);
    const ex = Math.cos(angle) * len, ey = Math.sin(angle) * len;
    ctx.beginPath();
    ctx.moveTo(cx + dx - ex / 2, cy + dy - ey / 2);
    ctx.lineTo(cx + dx + ex * 0.1, cy + dy + ey * 0.1 + ((h >>> 24) % 3) - 1);
    ctx.lineTo(cx + dx + ex / 2, cy + dy + ey / 2);
    ctx.stroke();
  }
  ctx.restore();
}

// ---- District prop helpers ------------------------------------------------
// Small procedural pixel-art props placed at authored positions by
// drawHamletBackdrop. Each prop tells its district's function; scale +
// palette chosen to fit the pixel-art building sprites we already ship.

function drawBench(ctx, cx, cy) {
  // Shadow
  ctx.fillStyle = 'rgba(4, 2, 6, 0.45)';
  ctx.fillRect(cx - 13, cy + 4, 26, 3);
  // Stone legs
  ctx.fillStyle = '#3a3236';
  ctx.fillRect(cx - 12, cy + 1, 4, 5);
  ctx.fillRect(cx + 8, cy + 1, 4, 5);
  // Wood plank
  ctx.fillStyle = '#5a3e28';
  ctx.fillRect(cx - 14, cy - 3, 28, 5);
  // Plank top highlight + grain
  ctx.fillStyle = '#7a5434';
  ctx.fillRect(cx - 14, cy - 3, 28, 1);
  ctx.fillStyle = '#3a2818';
  ctx.fillRect(cx - 14, cy + 1, 28, 1);
}

function drawLanternPost(ctx, cx, cy, kind = 'warm') {
  const warm = kind === 'warm';
  const poleH = 44;
  // Shadow
  ctx.fillStyle = 'rgba(4, 2, 6, 0.5)';
  ctx.beginPath();
  ctx.ellipse(cx, cy + 4, 9, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  // Base stone
  ctx.fillStyle = '#3a3236';
  ctx.fillRect(cx - 5, cy - 2, 10, 6);
  ctx.fillStyle = '#5a4a4c';
  ctx.fillRect(cx - 5, cy - 2, 10, 1);
  // Pole
  ctx.fillStyle = '#241c1c';
  ctx.fillRect(cx - 1, cy - poleH, 2, poleH);
  // Cross arm
  ctx.fillRect(cx - 8, cy - poleH + 2, 8, 1);
  // Lantern frame
  ctx.fillStyle = '#181216';
  ctx.fillRect(cx - 12, cy - poleH - 2, 6, 9);
  // Lantern light
  const pulse = 0.85 + 0.15 * Math.sin(performance.now() / 700);
  const core = warm ? '#ffc878' : '#8ed8ff';
  const haloCol = warm ? 'rgba(255, 180, 100,' : 'rgba(130, 200, 240,';
  ctx.fillStyle = core;
  ctx.fillRect(cx - 11, cy - poleH - 1, 4, 7);
  // Ground light pool
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(cx - 9, cy, 4, cx - 9, cy, 80);
  g.addColorStop(0, `${haloCol} ${(0.35 * pulse).toFixed(3)})`);
  g.addColorStop(0.5, `${haloCol} ${(0.12 * pulse).toFixed(3)})`);
  g.addColorStop(1, `${haloCol} 0)`);
  ctx.fillStyle = g;
  ctx.fillRect(cx - 89, cy - 80, 160, 160);
  ctx.restore();
}

function drawAnvil(ctx, cx, cy) {
  ctx.fillStyle = 'rgba(4, 2, 6, 0.55)';
  ctx.fillRect(cx - 13, cy + 5, 26, 4);
  // Stone base
  ctx.fillStyle = '#3a3432';
  ctx.fillRect(cx - 10, cy - 1, 20, 9);
  ctx.fillStyle = '#5a4e4a';
  ctx.fillRect(cx - 10, cy - 1, 20, 1);
  // Iron body
  ctx.fillStyle = '#1a1a1e';
  ctx.fillRect(cx - 11, cy - 9, 22, 8);
  // Iron highlight
  ctx.fillStyle = '#3e3a3c';
  ctx.fillRect(cx - 11, cy - 9, 22, 1);
  // Horn
  ctx.fillStyle = '#1a1a1e';
  ctx.fillRect(cx - 16, cy - 7, 5, 4);
  // Top face
  ctx.fillStyle = '#4a464c';
  ctx.fillRect(cx - 10, cy - 9, 20, 1);
}

function drawWoodpile(ctx, cx, cy) {
  ctx.fillStyle = 'rgba(4, 2, 6, 0.45)';
  ctx.fillRect(cx - 13, cy + 4, 26, 4);
  // Bottom row logs
  ctx.fillStyle = '#5a3820';
  for (let i = 0; i < 5; i++) {
    ctx.fillRect(cx - 13 + i * 5, cy - 3, 4, 8);
  }
  // Top row
  ctx.fillStyle = '#6a4a30';
  for (let i = 0; i < 4; i++) {
    ctx.fillRect(cx - 11 + i * 5, cy - 9, 4, 6);
  }
  // Ring highlights on log ends
  ctx.fillStyle = '#3a2010';
  for (let i = 0; i < 5; i++) {
    ctx.fillRect(cx - 12 + i * 5, cy - 2, 2, 1);
  }
}

function drawBarrel(ctx, cx, cy) {
  ctx.fillStyle = 'rgba(4, 2, 6, 0.45)';
  ctx.beginPath();
  ctx.ellipse(cx, cy + 10, 9, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  // Body
  ctx.fillStyle = '#5a3a22';
  ctx.fillRect(cx - 8, cy - 10, 16, 20);
  // Barrel rings
  ctx.fillStyle = '#2a1808';
  ctx.fillRect(cx - 8, cy - 8, 16, 1);
  ctx.fillRect(cx - 8, cy, 16, 1);
  ctx.fillRect(cx - 8, cy + 8, 16, 1);
  // Highlight
  ctx.fillStyle = '#7a5232';
  ctx.fillRect(cx - 7, cy - 9, 2, 18);
}

function drawReadingPedestal(ctx, cx, cy) {
  ctx.fillStyle = 'rgba(4, 2, 6, 0.5)';
  ctx.fillRect(cx - 10, cy + 5, 20, 4);
  // Stone base
  ctx.fillStyle = '#5a5662';
  ctx.fillRect(cx - 9, cy + 2, 18, 6);
  ctx.fillStyle = '#7a768a';
  ctx.fillRect(cx - 9, cy + 2, 18, 1);
  // Column
  ctx.fillStyle = '#4e4a58';
  ctx.fillRect(cx - 5, cy - 8, 10, 10);
  // Top slab
  ctx.fillStyle = '#6a6678';
  ctx.fillRect(cx - 9, cy - 12, 18, 5);
  ctx.fillStyle = '#8a869a';
  ctx.fillRect(cx - 9, cy - 12, 18, 1);
  // Scroll on top
  ctx.fillStyle = '#d8c898';
  ctx.fillRect(cx - 6, cy - 16, 12, 5);
  ctx.fillStyle = '#a08a5c';
  ctx.fillRect(cx - 6, cy - 12, 12, 1);
}

function drawCrateStack(ctx, cx, cy) {
  ctx.fillStyle = 'rgba(4, 2, 6, 0.45)';
  ctx.fillRect(cx - 12, cy + 4, 24, 4);
  // Lower crate
  ctx.fillStyle = '#6a4828';
  ctx.fillRect(cx - 11, cy - 6, 22, 12);
  ctx.fillStyle = '#3a2816';
  ctx.fillRect(cx - 11, cy - 6, 22, 1);
  ctx.fillRect(cx - 11, cy + 5, 22, 1);
  ctx.fillRect(cx, cy - 6, 1, 12);
  // Upper small crate (offset)
  ctx.fillStyle = '#7a5838';
  ctx.fillRect(cx - 6, cy - 14, 14, 9);
  ctx.fillStyle = '#4a3626';
  ctx.fillRect(cx - 6, cy - 14, 14, 1);
}

function drawStandingStone(ctx, cx, cy) {
  // Shadow
  ctx.fillStyle = 'rgba(4, 2, 6, 0.5)';
  ctx.beginPath();
  ctx.ellipse(cx, cy + 6, 14, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  // Stone body — tall rectangle in top-down perspective
  ctx.fillStyle = '#3a3244';
  ctx.fillRect(cx - 11, cy - 30, 22, 38);
  // Top highlight
  ctx.fillStyle = '#5a4e60';
  ctx.fillRect(cx - 11, cy - 30, 22, 4);
  // Side shadow
  ctx.fillStyle = '#2a2234';
  ctx.fillRect(cx + 8, cy - 30, 3, 38);
  // Rune engraving
  ctx.fillStyle = '#a080d0';
  ctx.fillRect(cx - 2, cy - 22, 4, 2);
  ctx.fillRect(cx - 4, cy - 18, 8, 2);
  ctx.fillRect(cx - 2, cy - 14, 4, 2);
  // Rune glow pulse
  const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 900);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = `rgba(180, 140, 220, ${(0.35 * pulse).toFixed(3)})`;
  ctx.fillRect(cx - 6, cy - 24, 12, 14);
  ctx.restore();
}

function drawOfferingBowl(ctx, cx, cy) {
  ctx.fillStyle = 'rgba(4, 2, 6, 0.45)';
  ctx.beginPath();
  ctx.ellipse(cx, cy + 3, 9, 2, 0, 0, Math.PI * 2);
  ctx.fill();
  // Bowl outer
  ctx.fillStyle = '#5a4430';
  ctx.beginPath();
  ctx.ellipse(cx, cy, 9, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  // Bowl dark interior
  ctx.fillStyle = '#1a1008';
  ctx.beginPath();
  ctx.ellipse(cx, cy - 1, 7, 2.5, 0, 0, Math.PI * 2);
  ctx.fill();
  // Rim highlight
  ctx.fillStyle = '#9a6848';
  ctx.beginPath();
  ctx.ellipse(cx, cy - 1, 7, 1.5, 0, 0, Math.PI);
  ctx.fill();
  // Tiny offering — coin or ember
  ctx.fillStyle = 'rgba(230, 180, 100, 0.85)';
  ctx.fillRect(cx - 1, cy - 2, 2, 2);
}

function drawFallenBell(ctx, cx, cy) {
  // Shadow
  ctx.fillStyle = 'rgba(4, 2, 6, 0.55)';
  ctx.beginPath();
  ctx.ellipse(cx + 2, cy + 6, 20, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  // Bell on its side — dark bronze
  ctx.fillStyle = '#4a3a18';
  ctx.beginPath();
  ctx.ellipse(cx, cy, 18, 11, 0, 0, Math.PI * 2);
  ctx.fill();
  // Lighter upper surface
  ctx.fillStyle = '#8a6a2c';
  ctx.beginPath();
  ctx.ellipse(cx - 2, cy - 3, 15, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  // Dark opening
  ctx.fillStyle = '#1a1408';
  ctx.beginPath();
  ctx.ellipse(cx + 13, cy, 4, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  // Rim band
  ctx.fillStyle = '#6a5220';
  ctx.beginPath();
  ctx.ellipse(cx + 10, cy, 3, 8, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawScaffolding(ctx, cx, cy) {
  ctx.fillStyle = 'rgba(4, 2, 6, 0.45)';
  ctx.fillRect(cx - 22, cy + 4, 44, 4);
  // Uprights
  ctx.fillStyle = '#6a4830';
  ctx.fillRect(cx - 20, cy - 26, 2, 32);
  ctx.fillRect(cx + 18, cy - 26, 2, 32);
  ctx.fillRect(cx - 1, cy - 26, 2, 32);
  // Horizontal boards
  ctx.fillRect(cx - 20, cy - 22, 40, 2);
  ctx.fillRect(cx - 20, cy - 10, 40, 2);
  ctx.fillRect(cx - 20, cy + 2,  40, 2);
  // Diagonal brace
  ctx.save();
  ctx.strokeStyle = '#6a4830';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - 18, cy - 22);
  ctx.lineTo(cx - 2, cy + 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx + 2, cy - 22);
  ctx.lineTo(cx + 18, cy + 2);
  ctx.stroke();
  ctx.restore();
}

function drawStoneStack(ctx, cx, cy) {
  ctx.fillStyle = 'rgba(4, 2, 6, 0.45)';
  ctx.fillRect(cx - 18, cy + 4, 36, 4);
  // Bottom row — two cut stones
  ctx.fillStyle = '#8a7a68';
  ctx.fillRect(cx - 16, cy - 2, 14, 8);
  ctx.fillRect(cx - 1, cy - 2, 15, 8);
  // Top row — one stone (offset)
  ctx.fillStyle = '#9a8a78';
  ctx.fillRect(cx - 9, cy - 8, 14, 6);
  // Highlights
  ctx.fillStyle = '#b0a088';
  ctx.fillRect(cx - 16, cy - 2, 14, 1);
  ctx.fillRect(cx - 1, cy - 2, 15, 1);
  ctx.fillRect(cx - 9, cy - 8, 14, 1);
  // Dark seams
  ctx.fillStyle = '#4a3a30';
  ctx.fillRect(cx - 2, cy - 2, 1, 8);
}

function drawHalfWall(ctx, cx, cy) {
  ctx.fillStyle = 'rgba(4, 2, 6, 0.5)';
  ctx.fillRect(cx - 34, cy + 4, 68, 5);
  // Stone blocks — rising half-wall pattern
  const blocks = [
    [-32, 0, 14, 8],
    [-16, 0, 14, 8],
    [0, 0, 14, 8],
    [16, 0, 14, 8],
    [-26, -8, 14, 8],
    [-10, -8, 14, 8],
    [6, -8, 14, 8],
    [-20, -16, 14, 8],
    [-4, -16, 14, 8],
    [-14, -24, 14, 6],
  ];
  for (const [dx, dy, w, h] of blocks) {
    ctx.fillStyle = '#8a7a68';
    ctx.fillRect(cx + dx, cy + dy - 2, w, h);
    ctx.fillStyle = '#a89880';
    ctx.fillRect(cx + dx, cy + dy - 2, w, 1);
    ctx.fillStyle = '#5a4a40';
    ctx.fillRect(cx + dx, cy + dy + h - 3, w, 1);
  }
}

function drawGraveMarker(ctx, cx, cy, rotation = 0) {
  ctx.fillStyle = 'rgba(4, 2, 6, 0.5)';
  ctx.fillRect(cx - 7, cy + 3, 14, 3);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rotation);
  // Tombstone body
  ctx.fillStyle = '#3a3438';
  ctx.fillRect(-6, -18, 12, 22);
  // Rounded top (approximate)
  ctx.fillRect(-5, -20, 10, 2);
  // Top highlight
  ctx.fillStyle = '#5a5458';
  ctx.fillRect(-5, -20, 10, 1);
  // Side shadow
  ctx.fillStyle = '#241e22';
  ctx.fillRect(4, -18, 2, 22);
  // Engraving — small cross / mark
  ctx.fillStyle = '#1a1618';
  ctx.fillRect(-1, -14, 2, 6);
  ctx.fillRect(-3, -12, 6, 2);
  ctx.restore();
}

function drawCollapsedGate(ctx, cx, cy) {
  ctx.fillStyle = 'rgba(4, 2, 6, 0.55)';
  ctx.fillRect(cx - 32, cy + 4, 64, 6);
  // Left upright — still standing
  ctx.fillStyle = '#4a4238';
  ctx.fillRect(cx - 28, cy - 22, 9, 26);
  ctx.fillStyle = '#6a6258';
  ctx.fillRect(cx - 28, cy - 22, 9, 2);
  // Right upright — leaning
  ctx.save();
  ctx.translate(cx + 20, cy - 10);
  ctx.rotate(0.35);
  ctx.fillStyle = '#4a4238';
  ctx.fillRect(-4, -14, 8, 26);
  ctx.fillStyle = '#6a6258';
  ctx.fillRect(-4, -14, 8, 2);
  ctx.restore();
  // Fallen archway pieces on the ground
  ctx.fillStyle = '#3a3428';
  ctx.fillRect(cx - 14, cy - 2, 12, 7);
  ctx.fillRect(cx + 2, cy + 2, 14, 6);
  ctx.fillRect(cx - 6, cy + 6, 10, 4);
  ctx.fillStyle = '#5a544a';
  ctx.fillRect(cx - 14, cy - 2, 12, 1);
  ctx.fillRect(cx + 2, cy + 2, 14, 1);
}

function drawBrokenBeam(ctx, cx, cy) {
  ctx.fillStyle = 'rgba(4, 2, 6, 0.5)';
  ctx.fillRect(cx - 18, cy + 4, 36, 3);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(0.35);
  ctx.fillStyle = '#4a3220';
  ctx.fillRect(-18, -3, 36, 6);
  ctx.fillStyle = '#6a4a30';
  ctx.fillRect(-18, -3, 36, 1);
  ctx.fillStyle = '#2a1810';
  ctx.fillRect(-18, 2, 36, 1);
  ctx.restore();
}

// (drawBoulder / drawUrn removed — foreground corner props are handled by
// the zone-based ruin patches + authored district props now.)

// Draw mid-air effects that must sit AFTER the portal tower entity — e.g.
// the prayer-flag line stretches across the tower's upper half, and if we
// drew it in the backdrop it'd get covered by the tower sprite. Called
// from main.js after drawHamletEntities (inside the camera transform).
export function drawHamletOverlay(ctx) {
  const now = performance.now() / 1000;

  // Prayer-flag garland strung ACROSS the plaza (from the plaza lantern
  // post over to a notional post near the forge). Celebrates the hub's
  // inhabited heart — not the ominous descent tower like the old version.
  const flagColors = ['#e06060', '#f4c858', '#7fc898', '#5e90c8', '#c060a0', '#f4c858', '#e06060'];
  const flagCount = 9;
  const startX = 585, endX = 340;   // from plaza lantern to forge-side
  const startY = 488, endY = 498;   // above plaza, below sky
  // Rope
  ctx.strokeStyle = 'rgba(22, 16, 14, 0.85)';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  for (let i = 0; i <= flagCount; i++) {
    const u = i / flagCount;
    const x = startX + (endX - startX) * u;
    const sag = Math.sin(u * Math.PI) * 14;
    const y = startY + (endY - startY) * u + sag;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  // Flags
  for (let i = 0; i < flagCount; i++) {
    const u = (i + 0.5) / flagCount;
    const x = startX + (endX - startX) * u;
    const sag = Math.sin(u * Math.PI) * 14;
    const y = startY + (endY - startY) * u + sag;
    const sway = Math.sin(now * 1.3 + i * 0.6) * 1.4;
    const fx = ((x - 5) | 0) + sway;
    const fy = (y | 0) + 1;
    ctx.fillStyle = flagColors[i % flagColors.length];
    ctx.fillRect(fx, fy, 10, 14);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
    ctx.fillRect(fx, fy + 11, 10, 3);
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
  // NPC draw height 56 — distinctly SMALLER than the 96px hero sprite so
  // the knight reads as the protagonist of the scene, not a dwarf among
  // giants. Prior 80px made NPCs taller than the hero's visible silhouette.
  const drawH = 56;
  const drawW = spr.width * (drawH / spr.height);
  // Ground shadow anchored at the NPC's actual feet. The sprite's feet sit
  // at e.y + bob (sprite bottom), so shadow center goes there; larger and
  // darker than before (radius 22, alpha 0.55) so each NPC has clear
  // visual weight on the cobblestone instead of seeming to hover above it.
  drawGroundShadow(ctx, e.x, e.y + bob, 22, 0.55);

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
