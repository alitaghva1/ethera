// ============================================================================
// EXTRACT-GODOT-NPC-SPRITES — bakes the three hamlet NPC sprites for the
// Godot slice. Goal: replace ColorRect placeholder bodies (flat-color
// squares) with readable pixel-art characters that hold up against the
// hamlet cobblestone + grass floor.
//
// Three sprites, all 32 × 56 px, transparent background:
//
//   wanderer.png — hooded traveler in a dark blue cloak. Hood casts deep
//   shadow over face; only chin + two eye-dots peek out. Walking stick
//   on the right side.
//
//   smith.png — stocky bald blacksmith Berin, red leather apron over
//   brown trousers, broad beard, a hammer hanging at the hip.
//
//   oracle.png — tall purple-robed seer. Hood deeper than the wanderer's
//   so the face is FULLY shadowed; a small gold star/eye glyph sits on
//   the chest. Robe trim picks out the silhouette.
//
// Each sprite reads at a glance against the hamlet floor because:
//   • Silhouette is distinct (wanderer = lean, smith = stocky-wide,
//     oracle = tall + glyph).
//   • The hood-shadow color differs per NPC so even at small render
//     scales the face cavity reads as a unique signature.
//   • A 4-px ground-shadow ellipse anchors the figure so it doesn't
//     "float" above the cobble — matches the floor pass's portal-shadow
//     gradient feel.
//
// Body proportions (within the 32×56 frame):
//   y  0..2   — head crown / hood peak
//   y  3..12  — head + hood mass
//   y 13..14  — neck / collar transition
//   y 15..40  — torso + arms
//   y 41..50  — legs / trousers / robe lower
//   y 51..54  — feet / robe hem
//   y 54..56  — ground shadow ellipse (alpha-blended onto transparent)
//
// Edges are feathered with a 50%-alpha 1-px rim so the sprite doesn't
// fight the cobble's mortar lines with a hard outline (per spec).
//
// Palette source: brief from spec + extended for shading. All hex
// constants tagged with WHICH NPC they serve so future tuning is easy.
// ============================================================================

import sharp from 'sharp';

const W = 32, H = 56;

const hex = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];

// ── Wanderer palette ─────────────────────────────────────────────────
// Dark blue cloak so the traveler reads as a "shadow-figure" against the
// warm cobble — chromatic contrast does the heavy lifting.
const W_CLOAK      = hex('#3a4860'); // cloak midtone
const W_CLOAK_DARK = hex('#2a3448'); // cloak shadow side (left)
const W_CLOAK_LIT  = hex('#4a5878'); // cloak rim highlight
const W_HOOD_SHADE = hex('#1a1830'); // hood interior shadow (face cavity)
const W_SKIN       = hex('#c9a986'); // chin / jaw highlight
const W_EYE        = hex('#1a1020'); // eye dot
const W_STICK      = hex('#4a3220'); // walking stick wood
const W_STICK_LIT  = hex('#6a4a30'); // stick highlight
const W_TRIM       = hex('#5a6a82'); // cloak trim along bottom hem

// ── Smith (Berin) palette ────────────────────────────────────────────
// Warm reds / browns so he stands apart from the cool wanderer at a glance.
const S_APRON      = hex('#8a3a2a'); // apron midtone
const S_APRON_DARK = hex('#6a2818'); // apron shadow
const S_APRON_LIT  = hex('#a85040'); // apron highlight
const S_TROUSER    = hex('#4a3220'); // trousers
const S_TROUSER_DK = hex('#321e10'); // trouser shadow
const S_SKIN       = hex('#d8b08a'); // exposed skin (head, arms)
const S_SKIN_DK    = hex('#a8805a'); // skin shadow
const S_BEARD      = hex('#5a3a28'); // beard
const S_BEARD_DK   = hex('#3a2418'); // beard shadow
const S_HAMMER     = hex('#3a3a3a'); // hammer head
const S_HAMMER_LIT = hex('#5a5a5a'); // hammer highlight
const S_HAMMER_HFT = hex('#6a4a30'); // hammer haft (wood)

// ── Oracle palette ───────────────────────────────────────────────────
// Cool purple + gold accent — instantly distinct from both wanderer and smith.
const O_ROBE       = hex('#4a2a6a'); // robe midtone
const O_ROBE_DARK  = hex('#321a4a'); // robe shadow
const O_ROBE_LIT   = hex('#6a4a8a'); // robe highlight
const O_HOOD_SHADE = hex('#1a0a30'); // hood interior — deepest of the three
const O_TRIM       = hex('#7a5aa0'); // robe rim trim
const O_GLYPH      = hex('#e8c870'); // gold star/eye glyph on chest
const O_GLYPH_LIT  = hex('#fff0a0'); // glyph inner highlight

// ── Shared shadow palette ────────────────────────────────────────────
const SHADOW       = hex('#100805'); // ground shadow color (very dark, low alpha)

// Deterministic hash — mirrors the existing generators so per-sprite
// noise stays reproducible across re-bakes. (Used here only sparingly,
// for cloth-fold variation.)
function hash(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177 | 0;
  return (h ^ (h >>> 16)) >>> 0;
}

// One buffer per sprite. We allocate fresh, paint, then sharp-serialize.
function makeBuf() {
  return Buffer.alloc(W * H * 4); // RGBA — alpha 0 by default = transparent
}

function setPx(buf, x, y, [r, g, b], a = 255) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 4;
  buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = a;
}
function getPx(buf, x, y) {
  if (x < 0 || y < 0 || x >= W || y >= H) return null;
  const i = (y * W + x) * 4;
  return [buf[i], buf[i + 1], buf[i + 2], buf[i + 3]];
}
// Alpha-aware blend: composite (r,g,b) over whatever's at (x,y) at the
// given alpha. If the underlying pixel is transparent, we WRITE the
// scaled color directly (gives us a soft anti-aliased rim against
// transparency rather than mixing with black).
function blendPx(buf, x, y, [r, g, b], alpha) {
  const cur = getPx(buf, x, y);
  if (!cur) return;
  if (cur[3] === 0) {
    // Painting onto transparent — emit semi-transparent pixel
    setPx(buf, x, y, [r, g, b], Math.round(alpha * 255));
  } else {
    setPx(buf, x, y, [
      Math.round(cur[0] * (1 - alpha) + r * alpha),
      Math.round(cur[1] * (1 - alpha) + g * alpha),
      Math.round(cur[2] * (1 - alpha) + b * alpha),
    ], 255);
  }
}

// Fill a filled ellipse centered on (cx,cy) with radii (rx,ry).
// Used for hoods, ground shadows, the smith's belly, the tower-cap, etc.
function fillEllipse(buf, cx, cy, rx, ry, color) {
  for (let dy = -ry; dy <= ry; dy++) {
    for (let dx = -rx; dx <= rx; dx++) {
      const d = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry);
      if (d > 1) continue;
      setPx(buf, cx + dx, cy + dy, color);
    }
  }
}

// Soft-edged ellipse — alpha falls off near the rim. Used for the
// ground shadow so it feathers into the cobble below.
function blendEllipseSoft(buf, cx, cy, rx, ry, color, maxAlpha) {
  for (let dy = -ry; dy <= ry; dy++) {
    for (let dx = -rx; dx <= rx; dx++) {
      const d = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry);
      if (d > 1) continue;
      const a = maxAlpha * Math.max(0, 1 - Math.pow(d, 0.7));
      blendPx(buf, cx + dx, cy + dy, color, a);
    }
  }
}

// Filled rectangle (top-left anchored). Used for body slabs.
function fillRect(buf, x0, y0, w, h, color) {
  for (let y = y0; y < y0 + h; y++)
    for (let x = x0; x < x0 + w; x++)
      setPx(buf, x, y, color);
}

// After painting the silhouette, feather every edge pixel where the
// sprite borders transparency with a 50% alpha 1-px rim copy. This
// softens the silhouette against the floor without baking a hard
// 1-px outline that would fight the cobble's mortar grid.
function featherEdges(buf) {
  // Snapshot original alphas so we don't cascade.
  const snap = Buffer.from(buf);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (snap[i + 3] !== 0) continue; // only operate on transparent pixels
      // Find an opaque 4-neighbor; if one exists, fade that color in at 50%.
      const neighbors = [
        [x, y - 1], [x, y + 1], [x - 1, y], [x + 1, y],
      ];
      for (const [nx, ny] of neighbors) {
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const ni = (ny * W + nx) * 4;
        if (snap[ni + 3] === 255) {
          // Paint 50%-alpha rim
          buf[i]     = snap[ni];
          buf[i + 1] = snap[ni + 1];
          buf[i + 2] = snap[ni + 2];
          buf[i + 3] = 127;
          break;
        }
      }
    }
  }
}

// ── Ground shadow — shared bottom-of-frame anchor ────────────────────
// 4-px tall feathered ellipse just below the figure's feet line.
// Sits OUTSIDE the body silhouette so feather-edges doesn't confuse it
// with the body proper. Centered at y=53, sized to span ~14 px wide.
function paintGroundShadow(buf, cx) {
  blendEllipseSoft(buf, cx, 53, 9, 3, SHADOW, 0.42);
}

// ════════════════════════════════════════════════════════════════════
//   WANDERER  — hooded traveler, dark blue cloak, walking stick
// ════════════════════════════════════════════════════════════════════
function paintWanderer() {
  const buf = makeBuf();
  const cx = 16; // sprite midline

  // Ground shadow first so the figure paints over its center.
  paintGroundShadow(buf, cx);

  // ── Head + hood mass (y 1..14) ────────────────────────────────────
  // Hood is a slightly-pointed dome with a brim that flares outward.
  // We draw it as: cloak-color dome, then HOOD_SHADE oval inside for
  // the face cavity, then skin chin + eye dots.
  // Hood outer shape — slightly egg-shaped (wider near the bottom).
  fillEllipse(buf, cx, 8, 7, 7, W_CLOAK);
  // Hood peak — taller spike at top so it doesn't look like a helmet.
  fillRect(buf, cx - 1, 1, 2, 3, W_CLOAK);
  setPx(buf, cx, 0, W_CLOAK);
  // Hood shadow (face cavity) — interior oval.
  fillEllipse(buf, cx, 9, 4, 4, W_HOOD_SHADE);
  // Chin / lower jaw poking out of shadow.
  setPx(buf, cx - 1, 12, W_SKIN);
  setPx(buf, cx,     12, W_SKIN);
  setPx(buf, cx + 1, 12, W_SKIN);
  setPx(buf, cx - 1, 13, W_SKIN);
  setPx(buf, cx,     13, W_SKIN);
  setPx(buf, cx + 1, 13, W_SKIN);
  // Eye dots — two small recessed glints.
  setPx(buf, cx - 2, 9, W_EYE);
  setPx(buf, cx + 1, 9, W_EYE);
  // Hood shadow side (left-side rim darker, suggests light from upper-right).
  for (let dy = -6; dy <= 6; dy++) {
    setPx(buf, cx - 7, 8 + dy, getPx(buf, cx - 7, 8 + dy)?.[3] ? W_CLOAK_DARK : W_CLOAK_DARK);
  }
  // Hood rim highlight on upper-right
  setPx(buf, cx + 6, 5, W_CLOAK_LIT);
  setPx(buf, cx + 5, 3, W_CLOAK_LIT);
  setPx(buf, cx + 4, 2, W_CLOAK_LIT);

  // ── Torso + cloak drape (y 15..40) ────────────────────────────────
  // Body as a trapezoid widening slightly down to the hem. Center spine
  // gets a vertical highlight to suggest folded cloth.
  for (let y = 15; y <= 40; y++) {
    const widen = Math.floor((y - 15) / 4); // 0..6
    const x0 = cx - 5 - widen;
    const x1 = cx + 5 + widen;
    for (let x = x0; x <= x1; x++) {
      // Shadow side (left third), midtone (middle third), highlight (right third)
      let color = W_CLOAK;
      if (x - x0 < 2)         color = W_CLOAK_DARK;
      else if (x1 - x < 2)    color = W_CLOAK_LIT;
      // Fold highlight along spine — every 4 rows, single bright pixel
      if (x === cx && (y % 4) === 1) color = W_CLOAK_LIT;
      setPx(buf, x, y, color);
    }
  }

  // ── Cloak hem trim (y 39..40 across full width) ───────────────────
  // Lighter band along the bottom edge — reads as a stitched border.
  for (let x = cx - 11; x <= cx + 11; x++) {
    if (getPx(buf, x, 40)?.[3] === 255) setPx(buf, x, 40, W_TRIM);
  }

  // ── Robe lower / feet (y 41..52) ──────────────────────────────────
  // Two darker columns suggest legs/feet under the cloak hem.
  for (let y = 41; y <= 50; y++) {
    fillRect(buf, cx - 5, y, 4, 1, W_CLOAK_DARK);
    fillRect(buf, cx + 1, y, 4, 1, W_CLOAK_DARK);
  }
  // Tiny feet
  fillRect(buf, cx - 5, 51, 4, 2, W_HOOD_SHADE);
  fillRect(buf, cx + 1, 51, 4, 2, W_HOOD_SHADE);

  // ── Walking stick — diagonal on right side ────────────────────────
  // Runs from (cx+10, y=10) down to (cx+12, y=50). 2-px wide wood with
  // a small knob at top.
  for (let y = 10; y <= 50; y++) {
    const sx = cx + 10 + Math.floor((y - 10) / 20); // slight diagonal
    setPx(buf, sx,     y, W_STICK);
    setPx(buf, sx + 1, y, W_STICK_LIT);
  }
  // Knob at top — small lump
  setPx(buf, cx + 10, 9, W_STICK_LIT);
  setPx(buf, cx + 11, 9, W_STICK);
  setPx(buf, cx + 10, 8, W_STICK_LIT);

  featherEdges(buf);
  return buf;
}

// ════════════════════════════════════════════════════════════════════
//   SMITH (BERIN) — stocky bald blacksmith, red apron, hammer at hip
// ════════════════════════════════════════════════════════════════════
function paintSmith() {
  const buf = makeBuf();
  const cx = 16;

  paintGroundShadow(buf, cx);

  // ── Head — bald, beardy, no hood (y 2..15) ────────────────────────
  // Round head, slightly wider than wanderer's hood for a stocky read.
  fillEllipse(buf, cx, 8, 6, 6, S_SKIN);
  // Skin shadow on left
  for (let dy = -5; dy <= 5; dy++) {
    if (getPx(buf, cx - 5, 8 + dy)?.[3] === 255) setPx(buf, cx - 5, 8 + dy, S_SKIN_DK);
    if (getPx(buf, cx - 6, 8 + dy)?.[3] === 255) setPx(buf, cx - 6, 8 + dy, S_SKIN_DK);
  }
  // Eyes — single dark pixel each
  setPx(buf, cx - 2, 7, hex('#2a1810'));
  setPx(buf, cx + 1, 7, hex('#2a1810'));
  // Brow line — single dark row above eyes for a stern look
  for (let x = cx - 3; x <= cx + 2; x++) setPx(buf, x, 5, S_BEARD_DK);
  // Bald-pate highlight — single bright pixel at top of head
  setPx(buf, cx,     3, hex('#f0c898'));
  setPx(buf, cx - 1, 3, hex('#f0c898'));

  // ── Beard — covers lower face (y 10..14) ─────────────────────────
  // Wide, slightly trapezoidal mass under the head.
  for (let y = 10; y <= 14; y++) {
    const widen = (y - 10);
    for (let x = cx - 4 - Math.floor(widen / 2); x <= cx + 4 + Math.floor(widen / 2); x++) {
      // Beard core + darker shadow stripe on left
      const c = (x - (cx - 4 - Math.floor(widen / 2)) < 2) ? S_BEARD_DK : S_BEARD;
      setPx(buf, x, y, c);
    }
  }
  // Small mustache notch — single highlight pixel
  setPx(buf, cx, 10, S_SKIN_DK);

  // ── Neck / collar (y 14..16) — short stubby ───────────────────────
  fillRect(buf, cx - 2, 14, 5, 2, S_SKIN_DK);

  // ── Torso (apron) — stocky barrel, widening downward (y 16..38) ──
  for (let y = 16; y <= 38; y++) {
    const widen = Math.min(8, Math.floor((y - 16) / 2)); // 0..8
    const x0 = cx - 6 - Math.floor(widen / 2);
    const x1 = cx + 6 + Math.floor(widen / 2);
    for (let x = x0; x <= x1; x++) {
      let color = S_APRON;
      // Shading lobes
      if (x - x0 < 2)       color = S_APRON_DARK;
      else if (x1 - x < 2)  color = S_APRON_LIT;
      // Apron strap shadow — two darker vertical strips near shoulders (y 16..22)
      if (y <= 22 && (x === cx - 4 || x === cx + 4)) color = S_APRON_DARK;
      // Stitching highlight along center seam (every 5 rows)
      if (x === cx && (y % 5) === 1) color = S_APRON_LIT;
      setPx(buf, x, y, color);
    }
  }

  // ── Arms — stubby, exposed forearms hanging at sides (y 20..32) ──
  // Left arm
  fillRect(buf, cx - 10, 20, 3, 10, S_SKIN);
  fillRect(buf, cx - 10, 20, 1, 10, S_SKIN_DK); // shadow side
  // Right arm
  fillRect(buf, cx + 8, 20, 3, 10, S_SKIN);
  fillRect(buf, cx + 10, 20, 1, 10, S_SKIN_DK);
  // Fists (slightly darker, stub)
  fillRect(buf, cx - 10, 30, 3, 2, S_SKIN_DK);
  fillRect(buf, cx + 8,  30, 3, 2, S_SKIN_DK);

  // ── Trousers (y 39..50) ───────────────────────────────────────────
  for (let y = 39; y <= 50; y++) {
    fillRect(buf, cx - 9, y, 8, 1, S_TROUSER);
    fillRect(buf, cx + 2, y, 8, 1, S_TROUSER);
    // Shadow column
    setPx(buf, cx - 9, y, S_TROUSER_DK);
    setPx(buf, cx + 2, y, S_TROUSER_DK);
  }

  // ── Boots (y 51..53) — dark brown stubs ──────────────────────────
  fillRect(buf, cx - 9, 51, 7, 2, S_BEARD_DK);
  fillRect(buf, cx + 2, 51, 7, 2, S_BEARD_DK);

  // ── Hammer at hip — diagonal across right side ────────────────────
  // Haft from (cx+5, 26) down to (cx+11, 38). Head is a 3×4 block at
  // bottom of the haft.
  for (let i = 0; i < 12; i++) {
    const px = cx + 5 + Math.floor(i / 2);
    const py = 26 + i;
    setPx(buf, px,     py, S_HAMMER_HFT);
    setPx(buf, px + 1, py, S_TROUSER_DK);
  }
  // Hammer head — chunky rectangle at hip level
  fillRect(buf, cx + 9, 36, 4, 4, S_HAMMER);
  setPx(buf, cx + 9, 36, S_HAMMER_LIT);
  setPx(buf, cx + 10, 36, S_HAMMER_LIT);
  // Hammer head shadow rim
  setPx(buf, cx + 12, 39, hex('#1a1a1a'));

  featherEdges(buf);
  return buf;
}

// ════════════════════════════════════════════════════════════════════
//   ORACLE — tall purple-robed seer, glyph on chest, fully shadowed face
// ════════════════════════════════════════════════════════════════════
function paintOracle() {
  const buf = makeBuf();
  const cx = 16;

  paintGroundShadow(buf, cx);

  // ── Hood — taller + narrower than wanderer's (y 0..15) ────────────
  // Conical / pointed peak — reads as "ceremonial" vs the wanderer's
  // weathered hood.
  // Peak (3 px tall point at top center)
  setPx(buf, cx,     0, O_ROBE_DARK);
  fillRect(buf, cx - 1, 1, 2, 2, O_ROBE);
  // Main hood mass — egg shape, slightly tall
  fillEllipse(buf, cx, 9, 6, 8, O_ROBE);
  // Face cavity — DEEPER than wanderer (no chin showing — purely shadow)
  fillEllipse(buf, cx, 10, 4, 5, O_HOOD_SHADE);
  // Two faint eye glints (lower alpha than other NPCs — "unseen")
  setPx(buf, cx - 2, 9,  hex('#a878d8'));
  setPx(buf, cx + 1, 9,  hex('#a878d8'));
  // Hood trim — rim of brighter purple along the lower edge of the hood
  for (let dx = -6; dx <= 6; dx++) {
    if (getPx(buf, cx + dx, 16)?.[3] === 255) setPx(buf, cx + dx, 16, O_TRIM);
  }
  // Hood shadow on left side
  for (let dy = 0; dy <= 8; dy++) {
    const px = cx - 6 + dy * 0; // straight left edge
    if (getPx(buf, px, 6 + dy)?.[3] === 255) setPx(buf, px, 6 + dy, O_ROBE_DARK);
  }
  // Hood highlight on upper right
  setPx(buf, cx + 5, 4, O_ROBE_LIT);
  setPx(buf, cx + 4, 2, O_ROBE_LIT);

  // ── Torso — slim, tall robe (y 17..44) ────────────────────────────
  // Slightly tapered: narrow at top, widens slowly toward the hem.
  for (let y = 17; y <= 44; y++) {
    const widen = Math.floor((y - 17) / 3); // 0..9
    const x0 = cx - 5 - widen;
    const x1 = cx + 5 + widen;
    for (let x = x0; x <= x1; x++) {
      let color = O_ROBE;
      if (x - x0 < 2)       color = O_ROBE_DARK;
      else if (x1 - x < 2)  color = O_ROBE_LIT;
      // Vertical seam fold — every 4 rows
      if (x === cx && (y % 4) === 0) color = O_ROBE_LIT;
      setPx(buf, x, y, color);
    }
  }

  // ── Chest glyph — small star/eye in gold (y 21..27, centered) ─────
  // Vertical "eye" shape: an ellipse with a smaller bright center.
  // Larger gold ring
  fillEllipse(buf, cx, 24, 3, 3, O_GLYPH);
  // Inner bright nugget (the "pupil")
  setPx(buf, cx,     24, O_GLYPH_LIT);
  setPx(buf, cx - 1, 24, O_GLYPH_LIT);
  setPx(buf, cx + 1, 24, O_GLYPH_LIT);
  // Four-pointed star spikes (top, bottom, left, right)
  setPx(buf, cx,     20, O_GLYPH);
  setPx(buf, cx,     28, O_GLYPH);
  setPx(buf, cx - 4, 24, O_GLYPH);
  setPx(buf, cx + 4, 24, O_GLYPH);

  // ── Robe lower / hem (y 45..52) ───────────────────────────────────
  // Slightly flared bottom — robe hem trim band.
  for (let y = 45; y <= 50; y++) {
    const widen = 9;
    const x0 = cx - 5 - widen;
    const x1 = cx + 5 + widen;
    for (let x = x0; x <= x1; x++) {
      let color = O_ROBE_DARK;
      if (y === 50) color = O_TRIM; // trim band along bottom
      setPx(buf, x, y, color);
    }
  }
  // Tiny feet / robe drag — two small dark notches under the hem
  fillRect(buf, cx - 4, 51, 3, 2, O_HOOD_SHADE);
  fillRect(buf, cx + 1, 51, 3, 2, O_HOOD_SHADE);

  // ── Sleeves — wider arms hanging at sides (y 22..38) ──────────────
  // Robes have long droopy sleeves — extend the silhouette outward.
  for (let y = 22; y <= 38; y++) {
    const flare = Math.floor((y - 22) / 5); // 0..3
    fillRect(buf, cx - 8 - flare, y, 3, 1, O_ROBE);
    fillRect(buf, cx + 6 + flare, y, 3, 1, O_ROBE);
    // Shadow column on left sleeve
    setPx(buf, cx - 8 - flare, y, O_ROBE_DARK);
    setPx(buf, cx + 8 + flare, y, O_ROBE_DARK);
  }

  featherEdges(buf);
  return buf;
}

// ── Serialize each sprite to PNG ─────────────────────────────────────
// Sharp consumes our raw RGBA buffer + outputs a properly-encoded PNG
// with the alpha channel preserved (transparent background).
async function writePng(buf, outPath) {
  await sharp(buf, { raw: { width: W, height: H, channels: 4 } })
    .png()
    .toFile(outPath);
}

await writePng(paintWanderer(), '../slime-depths-godot/assets/npc/wanderer.png');
console.log(`[done] wanderer.png   (${W}×${H}, hooded blue cloak + walking stick)`);

await writePng(paintSmith(), '../slime-depths-godot/assets/npc/smith.png');
console.log(`[done] smith.png      (${W}×${H}, bald + beard + red apron + hammer)`);

await writePng(paintOracle(), '../slime-depths-godot/assets/npc/oracle.png');
console.log(`[done] oracle.png     (${W}×${H}, purple robe + gold glyph + deep hood)`);
