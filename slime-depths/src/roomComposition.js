// ============================================================================
// ROOM COMPOSITION — vertical slice (Phase 1-3)
//
// Adds three new layers on top of the existing room generator without
// touching its core flow:
//
//   1. FLOOR ZONES — every floor tile gets a zone tag (threshold/combat/
//      focal-frame/alcove/wear). The renderer reads the tag to pick a
//      tone; gone are the random hash-driven dark squares + 22 procedural
//      detail patches that made rooms look "dirtied at random."
//
//   2. FOCAL POINTS — every eligible room kind gets ONE setpiece anchor
//      (obelisk / brazier / crater / altar / tomb / plinth). Procedural
//      pixel-art setpieces with subtle glow + contact shadow. Replaces
//      "rect with stuff at the edges" with "composed space around a
//      focal piece."
//
//   3. DOOR ARCHITECTURE — each north door gets stone arch framing,
//      jamb stones, and a threshold light pool. Doors stop reading
//      as "hole in wall," start reading as "passage."
//
// Vertical slice constraints (per design brief):
//   - No new shell library yet — zones are computed from existing room
//     dimensions + door positions
//   - No archetype rewrite — assignRoomFocal reads data.kind only
//   - No spawn changes — focal point is rendered, not gameplay-blocking
//   - All procedural — no asset additions required
// ============================================================================

import { TILE } from './room.js';

// ── FLOOR ZONES ─────────────────────────────────────────────────────────────
// Integer tags so floorZones can be a packed 2D number array.
// Order matters for drawZoneWear's path-priority logic.
export const FZ = Object.freeze({
  COMBAT:      0,    // default — clean, readable play space
  THRESHOLD:   1,    // ~3-tile patch around each interior door tile
  FOCAL_FRAME: 2,    // 5-tile cross around the focal anchor
  ALCOVE:      3,    // perimeter pockets near corners
  WEAR:        4,    // sparse paths door→focal + focal stain
});

// Tone offsets per zone (applied as +/- on R/G/B over the base floor color
// from drawFloorTile's PAL.floorBase). Subtle by design — the zones should
// SUGGEST authored space without screaming, since the floor is read while
// fighting and shouldn't pull attention away from enemies/projectiles.
const ZONE_TONE = {
  [FZ.COMBAT]:      { r:  0,  g:  0,  b:  0 },     // baseline
  [FZ.THRESHOLD]:   { r: +6,  g: +5,  b: +3 },     // slightly warmer + lighter — "swept clean"
  [FZ.FOCAL_FRAME]: { r: +4,  g: +2,  b:  0 },     // warm hint, suggests focal radiance
  [FZ.ALCOVE]:      { r: -10, g: -10, b: -8 },     // deeper shadow at perimeter pockets
  [FZ.WEAR]:        { r: -14, g: -14, b: -12 },    // visible dark scuff — DELIBERATE
};

export function applyZoneTone(baseColor, zone) {
  // baseColor is a hex like '#3a2a36'. Returns a hex with the zone's offset
  // applied. Clamped 0..255. Used in drawFloorTile.
  const tone = ZONE_TONE[zone] || ZONE_TONE[FZ.COMBAT];
  if (tone.r === 0 && tone.g === 0 && tone.b === 0) return baseColor;
  const hex = baseColor.replace('#', '');
  const r = Math.max(0, Math.min(255, parseInt(hex.slice(0, 2), 16) + tone.r));
  const g = Math.max(0, Math.min(255, parseInt(hex.slice(2, 4), 16) + tone.g));
  const b = Math.max(0, Math.min(255, parseInt(hex.slice(4, 6), 16) + tone.b));
  return `rgb(${r},${g},${b})`;
}

// ── FOCAL ASSIGNMENT ─────────────────────────────────────────────────────────
// Returns { x, y, kind } in TILE coordinates, or null when the room kind
// shouldn't have one (start, hamlet, trove, chestroom, shop — those rooms
// have other natural focal points: their own contents).

const FOCAL_RULES = {
  // kind            → focal recipe { kinds, placement }
  start:      null,
  hamlet:     null,
  trove:      null,    // urns ARE the focus
  chestroom:  null,    // chests ARE the focus
  shop:       null,    // pedestals ARE the focus
  altar:      { kinds: ['altar'],            placement: 'center' },
  sanctuary:  { kinds: ['altar'],            placement: 'center' },
  reward:     { kinds: ['altar'],            placement: 'center' },
  combat:     { kinds: ['obelisk', 'brazier'], placement: 'off-center' },
  challenge:  { kinds: ['brazier'],          placement: 'forward' },
  elite:      { kinds: ['crater', 'brazier'], placement: 'forward' },
  event:      { kinds: ['brazier'],          placement: 'center' },
  miniboss:   { kinds: ['tomb'],             placement: 'center' },
  boss:       { kinds: ['tomb'],             placement: 'forward' },
};

// Hash helper — deterministic per room so reloading doesn't shuffle the
// chosen focal kind.
function _hash(a, b) {
  let h = (a * 73856093) ^ (b * 19349663);
  h = (h ^ (h >>> 13)) * 1274126177;
  return (h ^ (h >>> 16)) >>> 0;
}

export function assignRoomFocal(room) {
  const rule = FOCAL_RULES[room.kind];
  if (!rule) return null;
  const w = room.w | 0, h = room.h | 0;
  // Seed: room dims + kind length so it varies between rooms but is
  // stable per room.
  const seed = _hash(w * 31 + h, (room.kind || '').length * 17 + (room._detailSeed | 0));
  const kind = rule.kinds[seed % rule.kinds.length];
  const cx = Math.floor(w / 2);
  const cy = Math.floor(h / 2);
  let x = cx, y = cy;
  switch (rule.placement) {
    case 'off-center': {
      // Combat: shift 1-2 tiles off-center along one axis so the player
      // doesn't expect the room's geometric center to be empty. Direction
      // is hash-deterministic per room.
      const dirX = (seed >> 8) & 1 ? -1 : 1;
      const dirY = (seed >> 9) & 1 ? -1 : 1;
      x = cx + dirX * 2;
      y = cy + (((seed >> 10) & 1) ? dirY : 0);
      break;
    }
    case 'forward':
      // Elite/challenge/boss — pulled toward the back wall (north) so
      // the player walks INTO the room and meets it head-on.
      y = cy - 1;
      break;
    case 'center':
    default:
      x = cx; y = cy;
      break;
  }
  // Clamp to interior (perimeter is wall)
  x = Math.max(2, Math.min(w - 3, x));
  y = Math.max(2, Math.min(h - 3, y));
  // Ensure focal tile is floor (some shapes carve corners; if the chosen
  // anchor falls in a carved area, fall back to center).
  const tile = room.tiles?.[y]?.[x];
  if (tile && tile !== 'floor') {
    x = cx; y = cy;
  }
  return { kind, x, y };
}

// ── FLOOR ZONE BUILDER ──────────────────────────────────────────────────────
// Generates a 2D array of zone tags from the current room's geometry.
// Strategy:
//   1. Default every floor tile to COMBAT
//   2. Stamp THRESHOLD around interior side of each door
//   3. Stamp FOCAL_FRAME as a 5-tile cross around the focal anchor
//   4. Stamp ALCOVE in 2x2 patches near each interior corner
//   5. Stamp WEAR along straight-line paths from each door to the focal,
//      plus a small concentrated stain on the focal tile itself
//
// Run after room.tiles + room.focal are set. Wall/pillar/door cells stay
// untagged (we won't query them — only floor tiles get zone-tinted).
export function buildFloorZones(room) {
  const w = room.w | 0, h = room.h | 0;
  const zones = [];
  for (let y = 0; y < h; y++) {
    const r = new Array(w).fill(FZ.COMBAT);
    zones.push(r);
  }

  const isInteriorFloor = (x, y) => {
    if (x < 1 || x > w - 2 || y < 1 || y > h - 2) return false;
    const t = room.tiles?.[y]?.[x];
    return t === 'floor';
  };

  // 1. THRESHOLD — find door tiles, stamp 3-tile patch on the interior side.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (room.tiles?.[y]?.[x] !== 'door') continue;
      // Interior direction: north door (y=0) → step south (+y); south door (y=h-1) → step north (-y).
      const dy = (y === 0) ? 1 : -1;
      // 3-wide × 3-deep threshold patch, fading out with distance via
      // priority — closer tiles win over later overrides since we apply
      // FOCAL_FRAME and WEAR after.
      for (let oy = 0; oy < 3; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const tx = x + ox;
          const ty = y + dy * (1 + oy);
          if (isInteriorFloor(tx, ty)) {
            // Only stamp if still default — preserve any earlier non-default tag.
            if (zones[ty][tx] === FZ.COMBAT) {
              zones[ty][tx] = FZ.THRESHOLD;
            }
          }
        }
      }
    }
  }

  // 2. ALCOVE — 2x2 patches in each corner of the interior, only where
  //    floor tiles exist (carved corners simply produce empty alcoves).
  //    Reads as "the dim pockets where furniture would sit."
  const alcoveCorners = [
    { x: 1,     y: 1 },           // NW
    { x: w - 3, y: 1 },           // NE
    { x: 1,     y: h - 3 },       // SW
    { x: w - 3, y: h - 3 },       // SE
  ];
  for (const c of alcoveCorners) {
    for (let oy = 0; oy < 2; oy++) {
      for (let ox = 0; ox < 2; ox++) {
        const tx = c.x + ox, ty = c.y + oy;
        if (isInteriorFloor(tx, ty) && zones[ty][tx] === FZ.COMBAT) {
          zones[ty][tx] = FZ.ALCOVE;
        }
      }
    }
  }

  // 3. FOCAL_FRAME — 5-tile cross (plus shape) around the focal anchor.
  //    Runs AFTER threshold/alcove so it overrides where they overlap
  //    (the focal is the most important reading anchor).
  if (room.focal) {
    const fx = room.focal.x, fy = room.focal.y;
    const crossOffsets = [[0,0], [1,0], [-1,0], [0,1], [0,-1]];
    for (const [ox, oy] of crossOffsets) {
      const tx = fx + ox, ty = fy + oy;
      if (isInteriorFloor(tx, ty)) {
        zones[ty][tx] = FZ.FOCAL_FRAME;
      }
    }
  }

  // 4. WEAR — sparse paths from each door to the focal + a small stain
  //    on the focal itself. ONLY if focal exists; otherwise wear is just
  //    door-threshold tail.
  if (room.focal) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (room.tiles?.[y]?.[x] !== 'door') continue;
        const dy = (y === 0) ? 1 : -1;
        // Start one tile inside the threshold patch
        let tx = x, ty = y + dy * 4;
        const targetX = room.focal.x, targetY = room.focal.y;
        // Walk in a straight line, then turn — Manhattan path. Sparse
        // (every 2nd tile) so it doesn't read as a solid stripe.
        let step = 0;
        while (Math.abs(tx - targetX) + Math.abs(ty - targetY) > 1) {
          if (step % 2 === 0 && isInteriorFloor(tx, ty)) {
            // Don't override THRESHOLD or FOCAL_FRAME — those are higher priority
            if (zones[ty][tx] === FZ.COMBAT || zones[ty][tx] === FZ.ALCOVE) {
              zones[ty][tx] = FZ.WEAR;
            }
          }
          // Step toward target. Y-first then X for "walked in then turned" feel.
          if (ty !== targetY) ty += Math.sign(targetY - ty);
          else if (tx !== targetX) tx += Math.sign(targetX - tx);
          else break;
          step++;
          if (step > w + h) break;     // safety
        }
      }
    }
  }

  return zones;
}

// ── ZONE WEAR (STATIC PASS) ─────────────────────────────────────────────────
// Adds a single concentrated stain UNDER the focal piece, color-keyed to
// focal kind. Replaces drawOrganicFloorDetail's 22 random patches.
// Drawn in the static cache pass so it persists; the focal piece itself
// renders dynamic on top.
export function drawZoneWear(ctx, room) {
  if (!room.focal) return;
  const fx = room.focal.x * TILE + TILE / 2;
  const fy = room.focal.y * TILE + TILE / 2;
  // Stain color + radius per focal kind. Subtle (alpha 0.15-0.25) so it
  // suggests "this thing has been here a while" without screaming.
  let stain;
  switch (room.focal.kind) {
    case 'crater':
      stain = { color: 'rgba(40, 12, 8, 0.30)', innerColor: 'rgba(80, 28, 12, 0.18)', r: 32 };
      break;
    case 'brazier':
      stain = { color: 'rgba(30, 16, 8, 0.22)', innerColor: 'rgba(60, 28, 12, 0.10)', r: 26 };
      break;
    case 'tomb':
      stain = { color: 'rgba(20, 12, 16, 0.22)', innerColor: 'rgba(40, 24, 32, 0.10)', r: 30 };
      break;
    case 'altar':
      stain = { color: 'rgba(255, 220, 160, 0.06)', innerColor: 'rgba(255, 220, 160, 0.04)', r: 28 };
      break;
    case 'plinth':
    case 'obelisk':
    default:
      stain = { color: 'rgba(0, 0, 0, 0.18)', innerColor: 'rgba(0, 0, 0, 0.10)', r: 24 };
      break;
  }
  const grad = ctx.createRadialGradient(fx, fy + 4, 1, fx, fy + 4, stain.r);
  grad.addColorStop(0, stain.innerColor);
  grad.addColorStop(0.5, stain.color);
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(fx - stain.r, fy + 4 - stain.r, stain.r * 2, stain.r * 2);
}

// ── FOCAL PIECE RENDERING (DYNAMIC PASS) ────────────────────────────────────
// Each setpiece is procedural pixel-art. Sized to read at top-down 1.0×
// camera zoom without dominating the player sprite. Heights kept ≤ 30 px
// so the player walking past doesn't get visually occluded.
// All draw the contact shadow first (under the piece), then body, then
// glow/animated detail.
//
// Anchor convention: cx,cy is the CENTER of the focal tile. Pieces draw
// with bottom edge near cy + 12 (slightly south of tile center) so they
// visually "sit on" the floor like the urn/pillar conventions.

export function drawFocal(ctx, focal, now) {
  if (!focal || !focal.kind) return;
  const cx = focal.x * TILE + TILE / 2;
  const cy = focal.y * TILE + TILE / 2;
  switch (focal.kind) {
    case 'obelisk': _drawObelisk(ctx, cx, cy, now); break;
    case 'brazier': _drawBrazier(ctx, cx, cy, now); break;
    case 'crater':  _drawCrater(ctx, cx, cy, now); break;
    case 'altar':   _drawFocalAltar(ctx, cx, cy, now); break;
    case 'tomb':    _drawTomb(ctx, cx, cy, now); break;
    case 'plinth':  _drawPlinth(ctx, cx, cy, now); break;
  }
}

// Helper — soft contact shadow ellipse beneath the piece.
function _shadow(ctx, cx, cy, w, h, alpha = 0.45) {
  ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
  ctx.beginPath();
  ctx.ellipse(cx, cy + 10, w, h, 0, 0, Math.PI * 2);
  ctx.fill();
}

// OBELISK — narrow tall stone column with a faint rune. Combat-room flavor.
// Total visible: 16w × 28h. Stays short enough to not block enemy reads.
function _drawObelisk(ctx, cx, cy, now) {
  _shadow(ctx, cx, cy, 12, 4, 0.50);
  // Base — wider trapezoidal foot
  ctx.fillStyle = '#1a1218';
  ctx.fillRect(cx - 11, cy + 6, 22, 6);
  ctx.fillStyle = '#2a2028';
  ctx.fillRect(cx - 10, cy + 7, 20, 4);
  // Body — tapered column
  ctx.fillStyle = '#1a1218';
  ctx.fillRect(cx - 7, cy - 14, 14, 22);
  ctx.fillStyle = '#3a2e34';
  ctx.fillRect(cx - 6, cy - 13, 12, 20);
  // Light edge highlight (left side, simulates upper-left light)
  ctx.fillStyle = '#5a4a52';
  ctx.fillRect(cx - 6, cy - 13, 2, 20);
  // Capstone — slightly wider top
  ctx.fillStyle = '#1a1218';
  ctx.fillRect(cx - 8, cy - 16, 16, 3);
  ctx.fillStyle = '#4a3a42';
  ctx.fillRect(cx - 7, cy - 15, 14, 1);
  // Rune — single bright glyph mid-column. Faint cyan glow when fresh,
  // dim when old. Static — no animation in vertical slice.
  ctx.fillStyle = '#a0d8e8';
  ctx.fillRect(cx - 1, cy - 6, 2, 2);
  ctx.fillRect(cx - 2, cy - 5, 1, 1);
  ctx.fillRect(cx + 1, cy - 5, 1, 1);
  ctx.fillRect(cx - 1, cy - 4, 2, 1);
  // Soft cyan glow halo around rune
  const glow = ctx.createRadialGradient(cx, cy - 5, 1, cx, cy - 5, 10);
  const pulse = 0.55 + 0.10 * Math.sin(now * 1.4);
  glow.addColorStop(0, `rgba(160, 216, 232, ${(0.30 * pulse).toFixed(3)})`);
  glow.addColorStop(1, 'rgba(160, 216, 232, 0)');
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = glow;
  ctx.fillRect(cx - 10, cy - 15, 20, 20);
  ctx.restore();
}

// BRAZIER — stone bowl with flickering flame. Warm, inviting.
// Total visible: 24w × 22h.
function _drawBrazier(ctx, cx, cy, now) {
  _shadow(ctx, cx, cy, 14, 4, 0.45);
  // Pedestal stem
  ctx.fillStyle = '#1a1218';
  ctx.fillRect(cx - 4, cy + 0, 8, 10);
  ctx.fillStyle = '#3a2a30';
  ctx.fillRect(cx - 3, cy + 1, 6, 8);
  // Bowl rim (wider than stem)
  ctx.fillStyle = '#1a1218';
  ctx.fillRect(cx - 12, cy - 4, 24, 5);
  ctx.fillStyle = '#4a3a40';
  ctx.fillRect(cx - 11, cy - 3, 22, 3);
  ctx.fillStyle = '#2a2028';
  ctx.fillRect(cx - 10, cy - 2, 20, 1);
  // Bowl interior — dark
  ctx.fillStyle = '#0a0608';
  ctx.fillRect(cx - 9, cy - 3, 18, 2);
  // Flame — flickering procedural shape, 3 layers
  const flick = 0.85 + 0.15 * Math.sin(now * 7.3);
  const flameH = 12 * flick;
  // Outer flame (red-orange)
  ctx.fillStyle = `rgba(220, 80, 30, ${(0.85 * flick).toFixed(3)})`;
  ctx.beginPath();
  ctx.moveTo(cx - 5, cy - 4);
  ctx.lineTo(cx + 5, cy - 4);
  ctx.lineTo(cx + 3, cy - flameH);
  ctx.lineTo(cx - 3, cy - flameH);
  ctx.closePath();
  ctx.fill();
  // Mid flame (orange)
  ctx.fillStyle = `rgba(255, 150, 60, ${(0.90 * flick).toFixed(3)})`;
  ctx.beginPath();
  ctx.moveTo(cx - 3, cy - 4);
  ctx.lineTo(cx + 3, cy - 4);
  ctx.lineTo(cx + 1.5, cy - flameH * 0.85);
  ctx.lineTo(cx - 1.5, cy - flameH * 0.85);
  ctx.closePath();
  ctx.fill();
  // Inner core (bright yellow)
  ctx.fillStyle = `rgba(255, 240, 180, ${(0.95 * flick).toFixed(3)})`;
  ctx.fillRect(cx - 1, cy - flameH * 0.7, 2, 4);
  // Warm halo
  const halo = ctx.createRadialGradient(cx, cy - 5, 2, cx, cy - 5, 28);
  halo.addColorStop(0, `rgba(255, 180, 100, ${(0.35 * flick).toFixed(3)})`);
  halo.addColorStop(0.5, `rgba(220, 120, 60, ${(0.18 * flick).toFixed(3)})`);
  halo.addColorStop(1, 'rgba(180, 60, 30, 0)');
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = halo;
  ctx.fillRect(cx - 28, cy - 33, 56, 56);
  ctx.restore();
}

// CRATER — recessed pit with glowing cracks. Reads as "danger / hazard."
// Mostly flat — height ≤ 8 px. Used for elite rooms.
function _drawCrater(ctx, cx, cy, now) {
  // No upward shadow — crater is below floor level. Instead darken the
  // surrounding tiles via a vignette-style gradient.
  const dark = ctx.createRadialGradient(cx, cy, 4, cx, cy, 24);
  dark.addColorStop(0, 'rgba(0, 0, 0, 0.85)');
  dark.addColorStop(0.6, 'rgba(0, 0, 0, 0.50)');
  dark.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.ellipse(cx, cy, 20, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  // Inner pit — even darker
  ctx.fillStyle = '#0a0408';
  ctx.beginPath();
  ctx.ellipse(cx, cy, 16, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  // Glowing cracks radiating outward — 4 cracks at 90° offsets, slight angle jitter
  const flick = 0.75 + 0.25 * Math.sin(now * 4.5);
  ctx.strokeStyle = `rgba(255, 120, 60, ${(0.80 * flick).toFixed(3)})`;
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 4; i++) {
    const ang = (i / 4) * Math.PI * 2 + 0.3;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(ang) * 4, cy + Math.sin(ang) * 2);
    ctx.lineTo(cx + Math.cos(ang) * 14, cy + Math.sin(ang) * 7);
    ctx.stroke();
  }
  // Bright center
  ctx.fillStyle = `rgba(255, 200, 120, ${(0.55 * flick).toFixed(3)})`;
  ctx.fillRect(cx - 1, cy - 1, 2, 2);
  // Heat halo
  const halo = ctx.createRadialGradient(cx, cy, 1, cx, cy, 30);
  halo.addColorStop(0, `rgba(255, 120, 50, ${(0.25 * flick).toFixed(3)})`);
  halo.addColorStop(0.5, `rgba(200, 60, 30, ${(0.10 * flick).toFixed(3)})`);
  halo.addColorStop(1, 'rgba(160, 30, 20, 0)');
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = halo;
  ctx.fillRect(cx - 30, cy - 30, 60, 60);
  ctx.restore();
}

// FOCAL ALTAR — stepped slab with bowl. Sanctuary/reward focal piece.
// Different from the existing 'altar' tile (HP-cost room) — this is a
// purely visual setpiece. 32w × 18h.
function _drawFocalAltar(ctx, cx, cy, now) {
  _shadow(ctx, cx, cy, 18, 5, 0.40);
  // Base (wider step)
  ctx.fillStyle = '#1a1418';
  ctx.fillRect(cx - 16, cy + 2, 32, 8);
  ctx.fillStyle = '#3a3034';
  ctx.fillRect(cx - 15, cy + 3, 30, 6);
  ctx.fillStyle = '#5a4a4e';
  ctx.fillRect(cx - 15, cy + 3, 30, 1);
  // Top slab (narrower step)
  ctx.fillStyle = '#1a1418';
  ctx.fillRect(cx - 11, cy - 3, 22, 6);
  ctx.fillStyle = '#4a3e42';
  ctx.fillRect(cx - 10, cy - 2, 20, 4);
  ctx.fillStyle = '#6a5a5e';
  ctx.fillRect(cx - 10, cy - 2, 20, 1);
  // Bowl indent — small darker oval centered on top slab
  ctx.fillStyle = '#1a1018';
  ctx.beginPath();
  ctx.ellipse(cx, cy + 1, 5, 1.5, 0, 0, Math.PI * 2);
  ctx.fill();
  // Warm glow from bowl
  const pulse = 0.70 + 0.20 * Math.sin(now * 1.7);
  const glow = ctx.createRadialGradient(cx, cy - 1, 1, cx, cy - 1, 18);
  glow.addColorStop(0, `rgba(255, 220, 160, ${(0.45 * pulse).toFixed(3)})`);
  glow.addColorStop(0.5, `rgba(255, 180, 100, ${(0.18 * pulse).toFixed(3)})`);
  glow.addColorStop(1, 'rgba(220, 130, 60, 0)');
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = glow;
  ctx.fillRect(cx - 18, cy - 19, 36, 36);
  ctx.restore();
  // Tiny bright core in bowl
  ctx.fillStyle = `rgba(255, 240, 200, ${(0.85 * pulse).toFixed(3)})`;
  ctx.fillRect(cx - 1, cy, 2, 1);
}

// TOMB — sarcophagus. Mini-boss / boss focal.
// 36w × 22h. Wider, flatter — won't dominate the player.
function _drawTomb(ctx, cx, cy, now) {
  _shadow(ctx, cx, cy, 20, 5, 0.55);
  // Base plinth
  ctx.fillStyle = '#0a0810';
  ctx.fillRect(cx - 18, cy + 4, 36, 6);
  ctx.fillStyle = '#1a1820';
  ctx.fillRect(cx - 17, cy + 5, 34, 4);
  // Sarcophagus body
  ctx.fillStyle = '#0a0810';
  ctx.fillRect(cx - 16, cy - 8, 32, 13);
  ctx.fillStyle = '#2a2832';
  ctx.fillRect(cx - 15, cy - 7, 30, 11);
  // Lid — slightly raised band along top
  ctx.fillStyle = '#3a3842';
  ctx.fillRect(cx - 15, cy - 7, 30, 4);
  ctx.fillStyle = '#4a4852';
  ctx.fillRect(cx - 15, cy - 7, 30, 1);
  // Carved cross / ornament centered on lid
  ctx.fillStyle = '#5a5862';
  ctx.fillRect(cx - 1, cy - 6, 2, 8);     // vertical
  ctx.fillRect(cx - 4, cy - 4, 8, 2);     // horizontal
  // Edge details — corner stones
  ctx.fillStyle = '#1a1820';
  ctx.fillRect(cx - 16, cy - 8, 3, 3);
  ctx.fillRect(cx + 13, cy - 8, 3, 3);
  ctx.fillRect(cx - 16, cy + 2, 3, 3);
  ctx.fillRect(cx + 13, cy + 2, 3, 3);
  // Faint mist halo — purple/cool
  const pulse = 0.50 + 0.15 * Math.sin(now * 0.9);
  const halo = ctx.createRadialGradient(cx, cy - 2, 1, cx, cy - 2, 26);
  halo.addColorStop(0, `rgba(140, 120, 180, ${(0.18 * pulse).toFixed(3)})`);
  halo.addColorStop(1, 'rgba(80, 60, 120, 0)');
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = halo;
  ctx.fillRect(cx - 26, cy - 28, 52, 52);
  ctx.restore();
}

// PLINTH — slim pedestal. (Reserved — not used by current FOCAL_RULES
// since chestroom/shop already have their own attractions, but
// available if called.)
function _drawPlinth(ctx, cx, cy, _now) {
  _shadow(ctx, cx, cy, 10, 3, 0.40);
  // Base
  ctx.fillStyle = '#1a1218';
  ctx.fillRect(cx - 9, cy + 4, 18, 6);
  ctx.fillStyle = '#3a2e34';
  ctx.fillRect(cx - 8, cy + 5, 16, 4);
  // Body
  ctx.fillStyle = '#1a1218';
  ctx.fillRect(cx - 6, cy - 12, 12, 16);
  ctx.fillStyle = '#3a2e34';
  ctx.fillRect(cx - 5, cy - 11, 10, 14);
  // Top
  ctx.fillStyle = '#1a1218';
  ctx.fillRect(cx - 8, cy - 14, 16, 3);
  ctx.fillStyle = '#5a4a50';
  ctx.fillRect(cx - 7, cy - 13, 14, 1);
  // Gold rim
  ctx.fillStyle = 'rgba(201, 168, 106, 0.8)';
  ctx.fillRect(cx - 7, cy - 12, 14, 1);
}

// ── DOOR ARCHITECTURE ───────────────────────────────────────────────────────
// Stone arch + jamb stones + threshold light pool above each NORTH door.
// Drawn in the dynamic pass so light can pulse subtly. Subtle by design —
// the door is information-rich already (kind icon, label, sealed state),
// so the architecture is structural framing, not flashy.
//
// South doors are typically the entry — player walks through them bottom-up
// — and sit at y=h-1, often clipped by camera. We don't frame them.
export function drawDoorArchitecture(ctx, room, now) {
  if (!room.tiles) return;
  for (let x = 0; x < room.w; x++) {
    if (room.tiles[0]?.[x] !== 'door') continue;
    _drawDoorArch(ctx, x, 0, now);
  }
}

function _drawDoorArch(ctx, tx, ty, now) {
  const cx = tx * TILE + TILE / 2;
  // Door tile spans y=0 to y=TILE. The top wall body extends y=-32 to y=0
  // (drawTopWallBody) + frieze at y=-16 to y=0. The arch sits IN FRONT OF
  // the wall body, framing the door opening. Drawn at y=-12 to y=4 so
  // it overlaps the door tile top edge.
  const archTop = -10;
  const archHeight = 12;

  // ── Outer arch outline (1 px darker stone)
  ctx.fillStyle = '#0a0608';
  ctx.beginPath();
  ctx.moveTo(cx - 22, ty * TILE + archTop + archHeight);
  ctx.lineTo(cx - 22, ty * TILE + archTop + 4);
  ctx.quadraticCurveTo(cx - 22, ty * TILE + archTop - 4, cx, ty * TILE + archTop - 4);
  ctx.quadraticCurveTo(cx + 22, ty * TILE + archTop - 4, cx + 22, ty * TILE + archTop + 4);
  ctx.lineTo(cx + 22, ty * TILE + archTop + archHeight);
  ctx.lineTo(cx + 19, ty * TILE + archTop + archHeight);
  // Inner arch hollow — cut back through
  ctx.lineTo(cx + 19, ty * TILE + archTop + 4);
  ctx.quadraticCurveTo(cx + 19, ty * TILE + archTop - 1, cx, ty * TILE + archTop - 1);
  ctx.quadraticCurveTo(cx - 19, ty * TILE + archTop - 1, cx - 19, ty * TILE + archTop + 4);
  ctx.lineTo(cx - 19, ty * TILE + archTop + archHeight);
  ctx.closePath();
  ctx.fill();

  // ── Arch fill (mid stone)
  ctx.fillStyle = '#3a3034';
  ctx.beginPath();
  ctx.moveTo(cx - 21, ty * TILE + archTop + archHeight);
  ctx.lineTo(cx - 21, ty * TILE + archTop + 4);
  ctx.quadraticCurveTo(cx - 21, ty * TILE + archTop - 3, cx, ty * TILE + archTop - 3);
  ctx.quadraticCurveTo(cx + 21, ty * TILE + archTop - 3, cx + 21, ty * TILE + archTop + 4);
  ctx.lineTo(cx + 21, ty * TILE + archTop + archHeight);
  ctx.lineTo(cx + 20, ty * TILE + archTop + archHeight);
  ctx.lineTo(cx + 20, ty * TILE + archTop + 4);
  ctx.quadraticCurveTo(cx + 20, ty * TILE + archTop, cx, ty * TILE + archTop);
  ctx.quadraticCurveTo(cx - 20, ty * TILE + archTop, cx - 20, ty * TILE + archTop + 4);
  ctx.lineTo(cx - 20, ty * TILE + archTop + archHeight);
  ctx.closePath();
  ctx.fill();

  // ── Keystone — slightly lighter stone block at apex
  ctx.fillStyle = '#5a4a52';
  ctx.fillRect(cx - 3, ty * TILE + archTop - 4, 6, 4);
  ctx.fillStyle = '#7a6a72';
  ctx.fillRect(cx - 3, ty * TILE + archTop - 4, 6, 1);

  // ── Jamb stones — flanking blocks at the door base, set INTO the wall
  // a bit so they read as integrated stonework, not pasted on.
  ctx.fillStyle = '#0a0608';
  ctx.fillRect(cx - 24, ty * TILE + archTop + 8, 4, 12);
  ctx.fillRect(cx + 20, ty * TILE + archTop + 8, 4, 12);
  ctx.fillStyle = '#3a3034';
  ctx.fillRect(cx - 23, ty * TILE + archTop + 9, 2, 10);
  ctx.fillRect(cx + 21, ty * TILE + archTop + 9, 2, 10);

  // ── Threshold light pool — soft warm light bleeding from doorway
  // onto the floor tile directly below. Subtle so it doesn't fight the
  // existing torch/door light spill.
  const pulse = 0.85 + 0.10 * Math.sin(now * 2.1 + tx * 0.7);
  const pool = ctx.createRadialGradient(cx, ty * TILE + TILE * 1.1, 4, cx, ty * TILE + TILE * 1.1, 32);
  pool.addColorStop(0, `rgba(220, 180, 130, ${(0.18 * pulse).toFixed(3)})`);
  pool.addColorStop(0.5, `rgba(200, 140, 90, ${(0.08 * pulse).toFixed(3)})`);
  pool.addColorStop(1, 'rgba(160, 100, 60, 0)');
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = pool;
  ctx.fillRect(cx - 32, ty * TILE + TILE * 0.6, 64, TILE);
  ctx.restore();
}
