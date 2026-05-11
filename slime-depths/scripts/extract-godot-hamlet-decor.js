// ============================================================================
// EXTRACT-GODOT-HAMLET-DECOR — bakes a small "decor pack" of props that will
// be scattered across the Godot hamlet hub (fences, lamp posts, signposts,
// barrels, a well, bushes, a cart, and a soft building-base shadow ellipse).
//
// Style rules (intentionally DIFFERENT from extract-godot-building-sprites.js
// which uses noisy hash-stone walls):
//   • CLEAR silhouettes — solid color shapes, NOT hash-noise filled
//   • 2–3 colors per prop max (base + highlight + shadow)
//   • 1-px rim highlight on the top edge (suggests imagined torch light)
//   • 1-px dark line at the base (where the prop meets the ground)
//   • Hard pixel edges — no anti-aliasing, no feathering on the silhouette
//
// Palette is anchored to extract-godot-hamlet-floor.js (STONE_BASE,
// STONE_DARK, DIRT_EDGE, GRASS_DARK, etc.) so the props sit cleanly on the
// already-baked floor without clashing.
// ============================================================================

import sharp from 'sharp';

const hex = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];

// ── Stone palette (mirrors hamlet floor / buildings for cohesion) ──────
const STONE_BASE = hex('#7a6a52'); // warm sandy cobble
const STONE_DARK = hex('#5a4a32'); // shadowed stone face
const STONE_RIM  = hex('#2c1c10'); // mortar / outline / base-meets-ground

// ── Wood palette (rich brown family) ───────────────────────────────────
const WOOD_DARK  = hex('#3a1a08'); // darkest plank line / frame
const WOOD_BASE  = hex('#5a3a20'); // post / sign post / barrel / cart
const WOOD_LIT   = hex('#7a5a32'); // signboard / cart top / sunlit grain
const WOOD_RIM   = hex('#9a7a4a'); // rim highlight (top edge catches light)

// ── Lamppost specific (iron lantern body + flame) ──────────────────────
const IRON_DARK  = hex('#1a1a1a'); // lantern frame / hard outline
const IRON_BASE  = hex('#2a2a2a'); // lantern body
const IRON_LIT   = hex('#4a4a4a'); // catches lamp glow on top
const FLAME_HOT  = hex('#f4d090'); // bright yellow flame core
const FLAME_MID  = hex('#e08038'); // orange flame body
const FLAME_HALO = hex('#f8e8a0'); // 1-px outer fringe near flame (no glow bloom)

// ── Bush (green family — keeps the "leaves" silhouette punchy) ─────────
const BUSH_DARK  = hex('#1a3010'); // base shadow under bush
const BUSH_BASE  = hex('#2c4a20'); // main leaf body
const BUSH_LIT   = hex('#4a6a3c'); // lighter leaf-cluster spots
const BUSH_RIM   = hex('#5a7a3c'); // 1-px rim highlight on top of bush

// ── Iron banding (for barrel) ──────────────────────────────────────────
const IRON_BAND  = hex('#3a3a3a'); // barrel iron hoops
const BARREL_TOP = hex('#5a3a18'); // top circle — wood grain visible

// ── Wheel palette (cart wheels) ────────────────────────────────────────
const WHEEL_RIM  = hex('#3a1a08'); // dark wooden rim
const WHEEL_SPK  = hex('#6a6a6a'); // grey iron spokes
const WHEEL_HUB  = hex('#3a3a3a'); // hub center

// ── Shadow ─────────────────────────────────────────────────────────────
const SHADOW     = hex('#000000'); // pure black for alpha-shadowed ellipse

// One painter per prop — width/height vary, so we close over them.
function makePainter(W, H) {
  const buf = Buffer.alloc(W * H * 4); // RGBA, alpha=0 default (transparent)

  function setPx(x, y, [r, g, b], a = 255) {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 4;
    buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = a;
  }
  // Used by the shadow ellipse — writes raw RGBA at integer coords so we
  // can produce a clean radial fade without compositing.
  function setPxAlpha(x, y, [r, g, b], a) {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    if (a <= 0) return;
    const i = (y * W + x) * 4;
    buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = Math.max(0, Math.min(255, Math.round(a)));
  }

  function fillRect(x0, y0, w, h, color) {
    for (let y = y0; y < y0 + h; y++)
      for (let x = x0; x < x0 + w; x++)
        setPx(x, y, color);
  }

  // Hard-edged filled circle / disc — no AA. Used for bush, well base,
  // cart wheel hubs.
  function drawCircle(cx, cy, r, color, alpha = 255) {
    const r2 = r * r;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy <= r2) {
          setPx(cx + dx, cy + dy, color, alpha);
        }
      }
    }
  }

  // Hard-edged ring (outer radius rOut, inner radius rIn) — used for the
  // well's stone rim and the cart wheels.
  function drawRing(cx, cy, rOut, rIn, color) {
    const ro2 = rOut * rOut;
    const ri2 = rIn * rIn;
    for (let dy = -rOut; dy <= rOut; dy++) {
      for (let dx = -rOut; dx <= rOut; dx++) {
        const d2 = dx * dx + dy * dy;
        if (d2 <= ro2 && d2 > ri2) {
          setPx(cx + dx, cy + dy, color);
        }
      }
    }
  }

  return { buf, setPx, setPxAlpha, fillRect, drawCircle, drawRing };
}

// ════════════════════════════════════════════════════════════════════
//   FENCE_H — 32 × 24, horizontal wooden fence segment
// ════════════════════════════════════════════════════════════════════
// Two short posts at the sides connected by a single horizontal rail.
function paintFenceH() {
  const W = 32, H = 24;
  const P = makePainter(W, H);
  const { setPx, fillRect } = P;

  // ── Two posts (2 px wide × 16 px tall, at left/right edges) ─────────
  // Posts run from y=4 to y=20 (16 tall). Right edge of canvas is x=30,31.
  fillRect(2, 4, 2, 16, WOOD_BASE);   // left post
  fillRect(28, 4, 2, 16, WOOD_BASE);  // right post

  // ── Wood grain: 1-px vertical highlight on the LEFT side of each post ─
  for (let y = 5; y < 19; y++) {
    setPx(2, y, WOOD_LIT);
    setPx(28, y, WOOD_LIT);
  }

  // ── Horizontal rail at y=14..15 (2 px tall) spanning post-to-post ────
  fillRect(2, 14, 28, 2, WOOD_BASE);
  // Rail top-edge highlight
  for (let x = 2; x < 30; x++) setPx(x, 14, WOOD_LIT);

  // ── 1-px rim highlight on top edge of each post ─────────────────────
  setPx(2, 4, WOOD_RIM);
  setPx(3, 4, WOOD_RIM);
  setPx(28, 4, WOOD_RIM);
  setPx(29, 4, WOOD_RIM);

  // ── 1-px dark line at the base of each post (meets the ground) ──────
  setPx(2, 20, WOOD_DARK);
  setPx(3, 20, WOOD_DARK);
  setPx(28, 20, WOOD_DARK);
  setPx(29, 20, WOOD_DARK);

  return P.buf;
}

// ════════════════════════════════════════════════════════════════════
//   FENCE_V — 24 × 32, vertical wooden fence segment (90° rotated H)
// ════════════════════════════════════════════════════════════════════
function paintFenceV() {
  const W = 24, H = 32;
  const P = makePainter(W, H);
  const { setPx, fillRect } = P;

  // Two posts at top/bottom (2 px tall, 16 px wide). Posts run x=4..20.
  fillRect(4, 2, 16, 2, WOOD_BASE);    // top post
  fillRect(4, 28, 16, 2, WOOD_BASE);   // bottom post

  // Wood grain: 1-px horizontal highlight on TOP edge of each post
  for (let x = 5; x < 19; x++) {
    setPx(x, 2, WOOD_LIT);
    setPx(x, 28, WOOD_LIT);
  }

  // Vertical rail at x=14..15 (2 px wide) spanning post-to-post
  fillRect(14, 2, 2, 28, WOOD_BASE);
  for (let y = 2; y < 30; y++) setPx(14, y, WOOD_LIT);

  // Rim highlight on top edge of top post + left edge of vertical rail
  setPx(4, 2, WOOD_RIM);
  setPx(5, 2, WOOD_RIM);
  setPx(18, 2, WOOD_RIM);
  setPx(19, 2, WOOD_RIM);

  // Dark line at the base (bottom post's bottom row)
  for (let x = 4; x < 20; x++) setPx(x, 29, WOOD_DARK);

  return P.buf;
}

// ════════════════════════════════════════════════════════════════════
//   LAMPPOST — 24 × 64, stone column with iron lantern + flame
// ════════════════════════════════════════════════════════════════════
function paintLamppost() {
  const W = 24, H = 64;
  const P = makePainter(W, H);
  const { setPx, fillRect } = P;

  // Layout (top → bottom):
  //   y  0..12  iron lantern body (16 wide, centered at x=8..23)
  //     within: flame (3 wide × 4 tall yellow, with 2 px orange below)
  //   y 12..52  stone column (4 wide, centered)
  //   y 52..56  stone base (24 wide × 4 tall)
  //   y 60..63  faint ground shadow under base
  const cx = W / 2;

  // ── Stone base (24 × 4, full canvas width) at y=52..56 ──────────────
  fillRect(0, 52, 24, 4, STONE_BASE);
  // 1-px dark line at the very bottom of the base (meets the ground)
  for (let x = 0; x < W; x++) setPx(x, 55, STONE_RIM);
  // Base top-edge highlight
  for (let x = 0; x < W; x++) setPx(x, 52, STONE_DARK);
  // Soft base sides (rim shadow)
  for (let y = 53; y < 55; y++) {
    setPx(0, y, STONE_DARK);
    setPx(23, y, STONE_DARK);
  }

  // ── Stone column (4 wide × 40 tall, centered) at x=10..14, y=12..52 ──
  fillRect(10, 12, 4, 40, STONE_BASE);
  // Left edge shadow + right edge stays base (light from upper-right)
  for (let y = 12; y < 52; y++) setPx(10, y, STONE_DARK);

  // ── Iron lantern body (16 wide × 12 tall) at x=4..20, y=0..12 ───────
  fillRect(4, 0, 16, 12, IRON_BASE);
  // 1-px rim highlight along the top edge (torch-lit)
  for (let x = 4; x < 20; x++) setPx(x, 0, IRON_LIT);
  // Lantern frame outline — hard dark border
  for (let y = 0; y < 12; y++) { setPx(4, y, IRON_DARK); setPx(19, y, IRON_DARK); }
  for (let x = 4; x < 20; x++) setPx(x, 11, IRON_DARK);

  // ── Flame INSIDE the lantern (3 × 4 yellow core, 2 px tall orange) ───
  // Yellow flame core at center-top of lantern body, x=11..13, y=2..5
  fillRect(11, 2, 3, 4, FLAME_HOT);
  // Orange flame body — 2 px tall directly below the yellow core
  fillRect(11, 6, 3, 2, FLAME_MID);
  // 1-px halo top: a single bright pixel above flame core for the
  // "tip of flame" silhouette (replaces glow bloom).
  setPx(12, 1, FLAME_HALO);

  // ── Ground shadow at the base of the post (very subtle, fully opaque
  //    so we maintain hard-pixel discipline). 1 row across full width. ──
  for (let x = 2; x < W - 2; x++) setPx(x, 56, STONE_RIM);

  return P.buf;
}

// ════════════════════════════════════════════════════════════════════
//   SIGNPOST — 32 × 48, wooden post with painted plank sign
// ════════════════════════════════════════════════════════════════════
function paintSignpost() {
  const W = 32, H = 48;
  const P = makePainter(W, H);
  const { setPx, fillRect } = P;

  // Layout:
  //   y  0..14   signboard (28 wide × 14 tall, centered)
  //   y  4..44   wooden post (4 wide, centered)
  //   y 44..47   1-px dark base line + small ground shadow
  const cx = W / 2;

  // ── Wooden post (4 wide × 40 tall, centered, x=14..18, y=4..44) ─────
  fillRect(14, 4, 4, 40, WOOD_BASE);
  // Left edge shadow
  for (let y = 4; y < 44; y++) setPx(14, y, WOOD_DARK);
  // Right edge sunlit highlight
  for (let y = 4; y < 44; y++) setPx(17, y, WOOD_LIT);

  // ── Signboard (28 wide × 14 tall, centered, x=2..30, y=0..14) ───────
  fillRect(2, 0, 28, 14, WOOD_LIT);
  // 1-px dark frame around the board
  for (let x = 2; x < 30; x++) { setPx(x, 0, WOOD_DARK); setPx(x, 13, WOOD_DARK); }
  for (let y = 0; y < 14; y++) { setPx(2, y, WOOD_DARK); setPx(29, y, WOOD_DARK); }
  // 1-px rim highlight on the top edge of the board (torch-lit)
  for (let x = 3; x < 29; x++) setPx(x, 1, WOOD_RIM);

  // ── Abstract "letters" suggesting writing — 4 dark pixel clusters ───
  // Three short marks across the middle of the board (y=6..8) that read
  // as text without being real glyphs.
  // Letter 1 (vertical bar at x=7)
  setPx(7, 5, WOOD_DARK); setPx(7, 6, WOOD_DARK); setPx(7, 7, WOOD_DARK); setPx(7, 8, WOOD_DARK);
  // Letter 2 (V-shape at x=11..13)
  setPx(11, 5, WOOD_DARK); setPx(12, 7, WOOD_DARK); setPx(13, 5, WOOD_DARK);
  setPx(11, 6, WOOD_DARK); setPx(13, 6, WOOD_DARK);
  // Letter 3 (small block at x=17..19)
  setPx(17, 5, WOOD_DARK); setPx(18, 5, WOOD_DARK); setPx(19, 5, WOOD_DARK);
  setPx(17, 6, WOOD_DARK); setPx(19, 6, WOOD_DARK);
  setPx(17, 7, WOOD_DARK); setPx(18, 7, WOOD_DARK); setPx(19, 7, WOOD_DARK);
  // Letter 4 (L-shape at x=22..24)
  setPx(22, 5, WOOD_DARK); setPx(22, 6, WOOD_DARK); setPx(22, 7, WOOD_DARK); setPx(22, 8, WOOD_DARK);
  setPx(23, 8, WOOD_DARK); setPx(24, 8, WOOD_DARK);

  // ── 1-px dark base line at the foot of the post ─────────────────────
  for (let x = 13; x < 19; x++) setPx(x, 44, WOOD_DARK);
  // Faint ground-shadow row
  for (let x = 12; x < 20; x++) setPx(x, 45, STONE_RIM);

  return P.buf;
}

// ════════════════════════════════════════════════════════════════════
//   BARREL — 28 × 36, wooden barrel with iron bands + visible staves
// ════════════════════════════════════════════════════════════════════
function paintBarrel() {
  const W = 28, H = 36;
  const P = makePainter(W, H);
  const { setPx, fillRect } = P;

  // Layout:
  //   y  0.. 4   top circle (wood grain visible)
  //   y  3..32   barrel body (staves + iron bands)
  //   y 32..35   1-px dark base shadow
  //
  // Body width: 26, centered at x=1..27, body y=3..32 (30 tall body).

  // ── Barrel body — solid brown background ────────────────────────────
  fillRect(1, 3, 26, 29, WOOD_BASE);
  // 1-px rim highlight on the top edge of the body (torch-lit shoulder)
  for (let x = 2; x < 26; x++) setPx(x, 3, WOOD_LIT);

  // ── Vertical staves — 3 dark lines suggesting plank seams ──────────
  for (let y = 3; y < 32; y++) {
    setPx(7, y, WOOD_DARK);
    setPx(14, y, WOOD_DARK);
    setPx(20, y, WOOD_DARK);
  }

  // ── Two iron bands (horizontal hoops) at y=10..11 and y=24..25 ──────
  // 3 px tall bands so they read as iron, not paint.
  fillRect(1, 10, 26, 2, IRON_BAND);
  fillRect(1, 24, 26, 2, IRON_BAND);
  // 1-px lighter top edge on each band (sunlit hoop)
  for (let x = 2; x < 26; x++) {
    setPx(x, 10, IRON_LIT);
    setPx(x, 24, IRON_LIT);
  }

  // ── Top circle (wood grain visible) ─────────────────────────────────
  // Slightly inset oval at y=0..4. The barrel's "top" is BARREL_TOP shade.
  fillRect(3, 0, 22, 4, BARREL_TOP);
  // Top edge: rim highlight
  for (let x = 4; x < 24; x++) setPx(x, 0, WOOD_LIT);
  // Side darken for the curve of the lid
  for (let y = 0; y < 4; y++) { setPx(3, y, WOOD_DARK); setPx(24, y, WOOD_DARK); }
  // 1-px wood-grain rings on the top
  for (let x = 8; x < 21; x++) setPx(x, 2, WOOD_DARK);

  // ── 1-px dark base shadow ───────────────────────────────────────────
  for (let x = 1; x < 27; x++) setPx(x, 32, WOOD_DARK);
  for (let x = 2; x < 26; x++) setPx(x, 33, STONE_RIM);

  return P.buf;
}

// ════════════════════════════════════════════════════════════════════
//   WELL — 64 × 56, stone well with wooden frame + hanging bucket
// ════════════════════════════════════════════════════════════════════
function paintWell() {
  const W = 64, H = 56;
  const P = makePainter(W, H);
  const { setPx, fillRect, drawCircle, drawRing } = P;

  // Layout:
  //   y  0..14   horizontal beam between the two posts
  //   y  2..28   two wooden posts (4 wide × 24 tall, at x=12 and x=48)
  //   y 16..22   bucket hanging from beam (string up to beam)
  //   y 32..52   circular stone base (40 wide × 16 tall, centered)
  const cx = W / 2;

  // ── Two wooden posts (4 wide × 24 tall) ─────────────────────────────
  fillRect(12, 4, 4, 24, WOOD_BASE);  // left post
  fillRect(48, 4, 4, 24, WOOD_BASE);  // right post
  // Left edge dark / right edge light on each post
  for (let y = 4; y < 28; y++) {
    setPx(12, y, WOOD_DARK); setPx(15, y, WOOD_LIT);
    setPx(48, y, WOOD_DARK); setPx(51, y, WOOD_LIT);
  }
  // Rim highlight on top of each post
  for (let x = 12; x < 16; x++) setPx(x, 4, WOOD_RIM);
  for (let x = 48; x < 52; x++) setPx(x, 4, WOOD_RIM);

  // ── Horizontal beam connecting posts (32 wide × 4 tall at y=4..8) ───
  // Beam spans x=16..48 (between the inner edges of the posts).
  fillRect(16, 4, 32, 4, WOOD_DARK);
  // 1-px rim highlight on top of beam
  for (let x = 16; x < 48; x++) setPx(x, 4, WOOD_RIM);

  // ── Bucket hanging from beam (8 wide × 6 tall) ──────────────────────
  // Centered horizontally, hangs at y=16..22. String goes from bucket
  // top up to beam (y=8 through y=15) as a single dark pixel column.
  const bucketX = cx - 4;
  // String
  for (let y = 8; y < 16; y++) setPx(cx, y, WOOD_DARK);
  // Bucket body
  fillRect(bucketX, 16, 8, 6, WOOD_BASE);
  // Bucket dark frame
  for (let x = bucketX; x < bucketX + 8; x++) {
    setPx(x, 16, WOOD_DARK);
    setPx(x, 21, WOOD_DARK);
  }
  for (let y = 16; y < 22; y++) {
    setPx(bucketX, y, WOOD_DARK);
    setPx(bucketX + 7, y, WOOD_DARK);
  }
  // 1-px rim highlight on top edge of bucket (catches torch light)
  for (let x = bucketX + 1; x < bucketX + 7; x++) setPx(x, 17, WOOD_LIT);

  // ── Circular stone base — concentric rings ──────────────────────────
  // Outer ring: rOut=20, inner: rIn=16. Shadow inner: rOut=16, rIn=12.
  // Center hole (well shaft): drawCircle r=10 in STONE_RIM.
  // We use ellipses by squashing y by 0.4 to give a top-down look.
  // Simpler approach: hand-paint scanlines for each row.
  const baseCy = 42; // vertical center of the stone disc
  const RX = 20, RY = 8; // ellipse half-axes
  // Outer rim (1 px highlight)
  for (let dy = -RY - 1; dy <= RY + 1; dy++) {
    for (let dx = -RX - 1; dx <= RX + 1; dx++) {
      const d = (dx * dx) / ((RX + 1) * (RX + 1)) + (dy * dy) / ((RY + 1) * (RY + 1));
      if (d > 1) continue;
      // Outer rim shell — only paint OUTSIDE the inner full disc
      const dInner = (dx * dx) / (RX * RX) + (dy * dy) / (RY * RY);
      if (dInner > 1) {
        setPx(cx + dx, baseCy + dy, STONE_RIM);
      }
    }
  }
  // Filled stone disc — base shade
  for (let dy = -RY; dy <= RY; dy++) {
    for (let dx = -RX; dx <= RX; dx++) {
      const d = (dx * dx) / (RX * RX) + (dy * dy) / (RY * RY);
      if (d > 1) continue;
      setPx(cx + dx, baseCy + dy, STONE_BASE);
    }
  }
  // Inner shadow ring — slightly smaller ellipse to give 3D rim
  const IRX = 14, IRY = 5;
  for (let dy = -IRY; dy <= IRY; dy++) {
    for (let dx = -IRX; dx <= IRX; dx++) {
      const d = (dx * dx) / (IRX * IRX) + (dy * dy) / (IRY * IRY);
      if (d > 1) continue;
      // Only paint the rim band (not the center)
      const dCenter = (dx * dx) / ((IRX - 2) * (IRX - 2)) + (dy * dy) / ((IRY - 1) * (IRY - 1));
      if (dCenter > 1) {
        setPx(cx + dx, baseCy + dy, STONE_DARK);
      }
    }
  }
  // Well shaft (dark center hole — where the water/darkness is)
  const SX = 12, SY = 3;
  for (let dy = -SY; dy <= SY; dy++) {
    for (let dx = -SX; dx <= SX; dx++) {
      const d = (dx * dx) / (SX * SX) + (dy * dy) / (SY * SY);
      if (d > 1) continue;
      setPx(cx + dx, baseCy + dy, STONE_RIM);
    }
  }
  // 1-px rim highlight on the very top edge of the stone disc
  for (let dx = -RX + 4; dx <= RX - 4; dx++) {
    const yTop = baseCy - RY;
    setPx(cx + dx, yTop, STONE_DARK); // slight dark cap (depth)
  }

  // ── 1-px dark base shadow under the well ────────────────────────────
  for (let dx = -RX; dx <= RX; dx++) {
    setPx(cx + dx, baseCy + RY + 1, STONE_RIM);
  }

  return P.buf;
}

// ════════════════════════════════════════════════════════════════════
//   BUSH — 40 × 32, irregular dark-green bush with leaf clusters
// ════════════════════════════════════════════════════════════════════
function paintBush() {
  const W = 40, H = 32;
  const P = makePainter(W, H);
  const { setPx, drawCircle } = P;

  // The bush is built from 5 overlapping circles in dark green to give
  // an irregular silhouette, then a few brighter clusters dotted on top.
  // The shadow row beneath is a 1-px BUSH_DARK band along the bottom.

  // ── Underlying dark shadow blob (3 px below the bush body) ──────────
  drawCircle(20, 27, 14, BUSH_DARK);
  drawCircle(11, 26, 8, BUSH_DARK);
  drawCircle(30, 26, 8, BUSH_DARK);

  // ── Main bush body — 5 overlapping discs in BUSH_BASE ───────────────
  drawCircle(20, 18, 12, BUSH_BASE);   // center
  drawCircle(10, 20, 8, BUSH_BASE);    // left lobe
  drawCircle(30, 20, 8, BUSH_BASE);    // right lobe
  drawCircle(15, 14, 7, BUSH_BASE);    // top-left bump
  drawCircle(26, 14, 7, BUSH_BASE);    // top-right bump

  // ── 4-5 lighter green spots suggesting leaf clusters (BUSH_LIT) ─────
  drawCircle(13, 15, 3, BUSH_LIT);
  drawCircle(22, 11, 3, BUSH_LIT);
  drawCircle(28, 16, 3, BUSH_LIT);
  drawCircle(17, 21, 2, BUSH_LIT);
  drawCircle(31, 22, 2, BUSH_LIT);

  // ── 1-px rim highlight on the very top of the bush (BUSH_RIM) ───────
  // We scan from y=8 down and paint the first BUSH_BASE pixel of each
  // column with BUSH_RIM. Hard-edged, no AA.
  for (let x = 4; x < W - 4; x++) {
    for (let y = 6; y < H; y++) {
      const i = (y * W + x) * 4;
      // Use the buffer to check the current pixel's color
      if (P.buf[i + 3] === 255 && P.buf[i] === BUSH_BASE[0] && P.buf[i + 1] === BUSH_BASE[1] && P.buf[i + 2] === BUSH_BASE[2]) {
        setPx(x, y, BUSH_RIM);
        break;
      }
      // Stop scanning if we hit a lit cluster pixel (already brighter than rim).
      if (P.buf[i + 3] === 255 && P.buf[i] === BUSH_LIT[0]) break;
    }
  }

  // ── 1-px dark base line (where bush meets ground) ───────────────────
  // Scan from the bottom up — first non-transparent pixel per column
  // becomes BUSH_DARK (deepest shadow).
  for (let x = 0; x < W; x++) {
    for (let y = H - 1; y >= 0; y--) {
      const i = (y * W + x) * 4;
      if (P.buf[i + 3] !== 0) {
        setPx(x, y, BUSH_DARK);
        break;
      }
    }
  }

  return P.buf;
}

// ════════════════════════════════════════════════════════════════════
//   CART — 56 × 40, wooden cart with bed, two wheels, forward shafts
// ════════════════════════════════════════════════════════════════════
function paintCart() {
  const W = 56, H = 40;
  const P = makePainter(W, H);
  const { setPx, fillRect, drawCircle, drawRing } = P;

  // Layout (cart facing left — shafts pointing left):
  //   y  4.. 8   side rail (top edge of cart bed)
  //   y  8..24   wooden cart bed (40 wide × 16 tall) at x=8..48
  //   y 12..14   shafts (2 px tall × 8 wide) extending left from bed
  //   y 22..34   two wheels (12×12) at left/right of bed
  //
  // Hubs and rims are drawn with drawCircle/drawRing for clean curves.

  // ── Cart bed (40 wide × 16 tall) at x=8..48, y=8..24 ────────────────
  fillRect(8, 8, 40, 16, WOOD_BASE);
  // 1-px rim highlight on TOP edge of cart bed (torch-lit board)
  for (let x = 8; x < 48; x++) setPx(x, 8, WOOD_RIM);
  // Top side rail (3 px tall) — slightly raised lip
  fillRect(8, 5, 40, 3, WOOD_LIT);
  // Plank seams along the bed (3 vertical dark lines)
  for (let y = 8; y < 24; y++) {
    setPx(18, y, WOOD_DARK);
    setPx(28, y, WOOD_DARK);
    setPx(38, y, WOOD_DARK);
  }
  // Dark rim around the bed
  for (let x = 8; x < 48; x++) { setPx(x, 5, WOOD_DARK); setPx(x, 23, WOOD_DARK); }
  for (let y = 5; y < 24; y++) { setPx(8, y, WOOD_DARK); setPx(47, y, WOOD_DARK); }

  // ── Two shafts pointing forward (LEFT) — 2 px tall × 8 wide ─────────
  // From bed left edge (x=8) extending to x=0, at y=12 and y=14.
  for (let x = 0; x < 8; x++) {
    setPx(x, 12, WOOD_BASE);
    setPx(x, 13, WOOD_LIT);
    setPx(x, 14, WOOD_DARK);
  }

  // ── Wheels — 12 × 12 circles at the two sides of the bed ────────────
  // Left wheel center at (14, 28), right wheel center at (42, 28).
  // Rim radius=6, hub radius=2.
  function paintWheel(cx, cy) {
    // Outer dark rim (hard outline)
    drawCircle(cx, cy, 6, WHEEL_RIM);
    // Inner wheel body (lighter brown)
    drawCircle(cx, cy, 5, WOOD_BASE);
    // Iron spokes — 4 spokes (vertical + horizontal)
    for (let i = -4; i <= 4; i++) {
      setPx(cx + i, cy, WHEEL_SPK);
      setPx(cx, cy + i, WHEEL_SPK);
    }
    // Diagonal spokes — softer (2 pixels offset)
    for (let i = -3; i <= 3; i++) {
      setPx(cx + i, cy + i, WHEEL_SPK);
      setPx(cx + i, cy - i, WHEEL_SPK);
    }
    // Hub (dark center)
    drawCircle(cx, cy, 2, WHEEL_HUB);
    setPx(cx, cy, WHEEL_RIM);
    // 1-px rim highlight on top of the wheel
    setPx(cx - 1, cy - 6, WOOD_LIT);
    setPx(cx, cy - 6, WOOD_LIT);
    setPx(cx + 1, cy - 6, WOOD_LIT);
  }
  paintWheel(14, 28);
  paintWheel(42, 28);

  // ── 1-px dark base shadow under the cart ─────────────────────────────
  for (let x = 8; x < 48; x++) setPx(x, 35, WOOD_DARK);

  return P.buf;
}

// ════════════════════════════════════════════════════════════════════
//   SHADOW_ELLIPSE — 192 × 64, radial alpha gradient drop shadow
// ════════════════════════════════════════════════════════════════════
// Used UNDER the larger building sprites (smithy/tavern/tower) so they
// feel anchored to the cobble. This is the only prop that uses real
// alpha-gradient (not hard-pixel) because the goal is a soft drop
// shadow — and the prop's silhouette IS the gradient.
function paintShadowEllipse() {
  const W = 192, H = 64;
  const P = makePainter(W, H);
  const { setPxAlpha } = P;

  const cx = W / 2;       // 96
  const cy = H / 2;       // 32
  const rx = W / 2 - 2;   // 94 — leave 2 px transparent margin
  const ry = H / 2 - 2;   // 30
  const maxAlpha = 0.55 * 255; // 0..255 alpha-space

  for (let dy = -ry; dy <= ry; dy++) {
    for (let dx = -rx; dx <= rx; dx++) {
      // Normalized squared radial distance
      const d2 = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry);
      if (d2 > 1) continue;
      // Radial alpha fade — d=0 is fully opaque (at maxAlpha), d=1 is 0.
      // Slight pow curve so the shadow has a defined center rather than
      // looking like a perfectly even falloff.
      const t = Math.max(0, 1 - Math.pow(d2, 0.7));
      const a = t * maxAlpha;
      setPxAlpha(cx + dx, cy + dy, SHADOW, a);
    }
  }

  return P.buf;
}

// ── Serialize each prop to PNG ────────────────────────────────────────
async function writePng(buf, w, h, outPath) {
  await sharp(buf, { raw: { width: w, height: h, channels: 4 } })
    .png()
    .toFile(outPath);
}

const OUT = '../slime-depths-godot/assets/decor';

await writePng(paintFenceH(),       32, 24, `${OUT}/fence_h.png`);
console.log(`[done] fence_h.png         (32×24, horizontal wooden fence segment)`);

await writePng(paintFenceV(),       24, 32, `${OUT}/fence_v.png`);
console.log(`[done] fence_v.png         (24×32, vertical wooden fence segment)`);

await writePng(paintLamppost(),     24, 64, `${OUT}/lamppost.png`);
console.log(`[done] lamppost.png        (24×64, stone column + iron lantern + flame)`);

await writePng(paintSignpost(),     32, 48, `${OUT}/signpost.png`);
console.log(`[done] signpost.png        (32×48, wooden post + painted signboard)`);

await writePng(paintBarrel(),       28, 36, `${OUT}/barrel.png`);
console.log(`[done] barrel.png          (28×36, wooden staves + 2 iron bands)`);

await writePng(paintWell(),         64, 56, `${OUT}/well.png`);
console.log(`[done] well.png            (64×56, stone disc + frame + hanging bucket)`);

await writePng(paintBush(),         40, 32, `${OUT}/bush.png`);
console.log(`[done] bush.png            (40×32, dark green leaf clusters)`);

await writePng(paintCart(),         56, 40, `${OUT}/cart.png`);
console.log(`[done] cart.png            (56×40, wooden bed + 2 wheels + shafts)`);

await writePng(paintShadowEllipse(), 192, 64, `${OUT}/shadow_ellipse.png`);
console.log(`[done] shadow_ellipse.png  (192×64, radial alpha gradient drop shadow)`);
