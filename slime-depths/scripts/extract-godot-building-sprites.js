// ============================================================================
// EXTRACT-GODOT-BUILDING-SPRITES — bakes the three hamlet building sprites
// for the Godot slice. Goal: replace the flat-color Panel placeholders
// (smithy / wayward inn / oracle's tower) with top-down 3/4-view pixel
// art that sits cleanly on the cobblestone-and-grass hamlet floor.
//
// Three buildings, all transparent background, sized to the existing
// Panel footprints in hamlet.tscn + extra height for the angled roof:
//
//   smithy.png   192 × 160 — 1-story stone block with brick chimney,
//                            slate roof, glowing forge window, dark
//                            door, anvil hint through the doorway.
//   tavern.png   224 × 176 — 2-story timber-frame "Wayward Inn".
//                            Stone lower floor, cream daub + dark
//                            beams upstairs, thatched roof with sag,
//                            hanging signboard, warm-glow windows.
//   tower.png     96 × 192 — Narrow tall stone column with conical
//                            dark-purple roof, single slit window
//                            near the top emitting a faint purple glow.
//
// Top-down 3/4 view convention used here:
//   • Facade dominates (front-face fills most of the height).
//   • Roof tilts forward so the viewer sees a slice of it at the top.
//   • Drop shadow sits at the base of each building (8–12 px wide,
//     ~40% alpha) so it grounds on the cobble below.
//
// Palette source: reuses the hamlet STONE / MORTAR / DIRT family from
// extract-godot-hamlet-floor.js plus warm wood tones + cream daub +
// thatch + a small purple-glow set for the tower.
// ============================================================================

import sharp from 'sharp';

const hex = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];

// ── Stone palette (mirrors the hamlet floor for visual cohesion) ─────
const STONE_BASE = hex('#7a6a52'); // warm sandy cobble base
const STONE_LIT  = hex('#8a7a62'); // sunlit stone face
const STONE_DARK = hex('#5a4a32'); // shadowed stone face
const STONE_RIM  = hex('#2c1c10'); // mortar / outline
const MORTAR     = hex('#4a3a2a'); // soft mortar
const STONE_HI   = hex('#a89272'); // very bright top-edge highlight (sunlit top of wall)
const STONE_SHD  = hex('#3a2a1a'); // very dark stone shadow (under eaves)

// ── Wood palette ─────────────────────────────────────────────────────
// Warm browns for doors, beams, signboard.
const WOOD_DARK  = hex('#3a2418');
const WOOD_BASE  = hex('#5a3820');
const WOOD_LIT   = hex('#7a5230');
const WOOD_RICH  = hex('#8a5a30'); // door planks

// ── Roof palettes ────────────────────────────────────────────────────
// Smithy = slate grey, Tavern = thatched yellow, Tower = deep purple.
const SLATE_BASE = hex('#3a3a44');
const SLATE_LIT  = hex('#54545e');
const SLATE_DARK = hex('#22222a');

const THATCH_BASE = hex('#a88040'); // golden-brown thatch
const THATCH_LIT  = hex('#c89a58');
const THATCH_DARK = hex('#6a4a20');
const THATCH_TUFT = hex('#d8a868'); // fluffy edge tuft

const TOWER_ROOF_BASE = hex('#3a1a4a');
const TOWER_ROOF_LIT  = hex('#5a2a6a');
const TOWER_ROOF_DARK = hex('#1a0820');

// ── Daub + plaster (tavern upper floor) ──────────────────────────────
const DAUB_BASE = hex('#d8c89c'); // cream daub between beams
const DAUB_LIT  = hex('#e8d8ac');
const DAUB_DARK = hex('#a89858');

// ── Glow palette (windows, signs, slits) ─────────────────────────────
// Warm yellow for doors/windows of normal buildings, dim purple for tower.
const GLOW_WARM  = hex('#f0c878');
const GLOW_BRIGHT = hex('#fff0c0');
const GLOW_PURPLE = hex('#a060f0');
const GLOW_PURPLE_LIT = hex('#d0a0ff');

// ── Smoke + shadow ───────────────────────────────────────────────────
const SMOKE_BASE = hex('#b8a890'); // wispy grey-cream smoke
const SHADOW     = hex('#080604'); // ground shadow (very dark)

// Deterministic hash — matches the existing generators so any noisy
// pass we want (thatch, stone variation, smoke wisps) is reproducible
// across re-bakes.
function hash(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177 | 0;
  return (h ^ (h >>> 16)) >>> 0;
}

// One painting helper set per building — width/height vary so we curry
// them by closure rather than re-allocating module-level globals.
function makePainter(W, H) {
  const buf = Buffer.alloc(W * H * 4); // RGBA, alpha 0 default = transparent

  function setPx(x, y, [r, g, b], a = 255) {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 4;
    buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = a;
  }
  function getPx(x, y) {
    if (x < 0 || y < 0 || x >= W || y >= H) return null;
    const i = (y * W + x) * 4;
    return [buf[i], buf[i + 1], buf[i + 2], buf[i + 3]];
  }
  // Alpha-aware blend; if underlying is transparent we emit a
  // semi-transparent pixel directly (clean rim against alpha-0).
  function blendPx(x, y, [r, g, b], alpha) {
    const cur = getPx(x, y);
    if (!cur) return;
    if (cur[3] === 0) {
      setPx(x, y, [r, g, b], Math.round(alpha * 255));
    } else {
      setPx(x, y, [
        Math.round(cur[0] * (1 - alpha) + r * alpha),
        Math.round(cur[1] * (1 - alpha) + g * alpha),
        Math.round(cur[2] * (1 - alpha) + b * alpha),
      ], 255);
    }
  }

  function fillRect(x0, y0, w, h, color) {
    for (let y = y0; y < y0 + h; y++)
      for (let x = x0; x < x0 + w; x++)
        setPx(x, y, color);
  }

  // Filled solid ellipse (used for cones, smoke).
  function fillEllipse(cx, cy, rx, ry, color) {
    for (let dy = -ry; dy <= ry; dy++) {
      for (let dx = -rx; dx <= rx; dx++) {
        const d = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry);
        if (d > 1) continue;
        setPx(cx + dx, cy + dy, color);
      }
    }
  }

  // Feathered ellipse — used for ground drop shadow under each building.
  function blendEllipseSoft(cx, cy, rx, ry, color, maxAlpha) {
    for (let dy = -ry; dy <= ry; dy++) {
      for (let dx = -rx; dx <= rx; dx++) {
        const d = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry);
        if (d > 1) continue;
        const a = maxAlpha * Math.max(0, 1 - Math.pow(d, 0.7));
        blendPx(cx + dx, cy + dy, color, a);
      }
    }
  }

  // ── Stone-wall paint helper ────────────────────────────────────────
  // Fills (x0,y0) → (x0+w, y0+h) with hash-driven stone shades plus
  // mortar grid + course rows. Reads as stacked-block masonry.
  function paintStoneWall(x0, y0, w, h, courseHeight = 8, blockWidth = 12) {
    for (let row = 0; row < Math.ceil(h / courseHeight); row++) {
      const rowOffset = (row & 1) ? blockWidth / 2 : 0; // running bond
      const ry = y0 + row * courseHeight;
      for (let col = 0; col * blockWidth < w + blockWidth; col++) {
        const bx = x0 + col * blockWidth - rowOffset;
        const bh = Math.min(courseHeight, h - row * courseHeight);
        if (bh <= 0) break;
        // Hash this brick for shade variation
        const bh32 = hash(bx + 5000, ry + 5000);
        const r = bh32 % 100;
        let face = STONE_BASE;
        if      (r < 25) face = STONE_DARK;
        else if (r < 50) face = STONE_LIT;
        // Paint block face
        for (let py = 0; py < bh; py++) {
          for (let px = 0; px < blockWidth; px++) {
            const ax = bx + px;
            const ay = ry + py;
            if (ax < x0 || ax >= x0 + w) continue;
            if (ay < y0 || ay >= y0 + h) continue;
            // Inner shadow strip on bottom row of brick (relief)
            if (py === bh - 1) setPx(ax, ay, MORTAR);
            else                setPx(ax, ay, face);
          }
        }
        // Vertical mortar gap at right edge of brick
        for (let py = 0; py < bh; py++) {
          const ax = bx + blockWidth - 1;
          const ay = ry + py;
          if (ax >= x0 && ax < x0 + w && ay >= y0 && ay < y0 + h) {
            setPx(ax, ay, MORTAR);
          }
        }
      }
    }
    // Outer rim (1 px) — soft dark outline so the building edge reads.
    // Top row brighter (sunlit), other edges darker.
    for (let x = x0; x < x0 + w; x++) {
      setPx(x, y0, STONE_HI);
      setPx(x, y0 + h - 1, STONE_RIM);
    }
    for (let y = y0; y < y0 + h; y++) {
      setPx(x0,         y, STONE_RIM);
      setPx(x0 + w - 1, y, STONE_RIM);
    }
  }

  // After the silhouette is painted, feather edges that border
  // transparency with a 50%-alpha 1-px rim (per spec — no hard borders
  // that fight the floor's mortar grid).
  function featherEdges() {
    const snap = Buffer.from(buf);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        if (snap[i + 3] !== 0) continue;
        const neighbors = [[x, y - 1], [x, y + 1], [x - 1, y], [x + 1, y]];
        for (const [nx, ny] of neighbors) {
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const ni = (ny * W + nx) * 4;
          if (snap[ni + 3] === 255) {
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

  return { buf, setPx, getPx, blendPx, fillRect, fillEllipse, blendEllipseSoft, paintStoneWall, featherEdges };
}

// ════════════════════════════════════════════════════════════════════
//   SMITHY — 192 × 160, one-story stone with slate roof + chimney
// ════════════════════════════════════════════════════════════════════
function paintSmithy() {
  const W = 192, H = 160;
  const P = makePainter(W, H);
  const { setPx, getPx, fillRect, fillEllipse, blendEllipseSoft, paintStoneWall, featherEdges } = P;

  // Layout (top → bottom in 160 px):
  //   y   0..  4  — roof peak shadow (very dark) blending into sky
  //   y   4.. 40  — slate roof slope (front-tilted, sees angled top)
  //   y  40.. 44  — roof eave shadow under overhang
  //   y  44..150  — stone facade
  //   y 150..160  — ground shadow

  // ── Ground drop shadow (paint first; the facade overpaints center) ──
  // 12 px tall feathered ellipse below the facade base.
  blendEllipseSoft(W / 2, 155, W / 2 - 8, 6, SHADOW, 0.45);

  // ── Slate roof — pitched front, slight overhang past facade ───────
  // Trapezoidal: top edge narrower, bottom edge wider than the facade.
  // Top y=4, bottom y=40. Top half-width = 60, bottom half-width = 92.
  for (let y = 4; y <= 40; y++) {
    const t = (y - 4) / 36;
    const halfW = Math.round(60 + (92 - 60) * t);
    const cx = W / 2;
    for (let x = cx - halfW; x <= cx + halfW; x++) {
      // Vertical slate strips — 8 px wide bands w/ alternating shade
      const stripIdx = Math.floor((x + 100) / 8);
      const stripHash = hash(stripIdx, 0) % 100;
      let color = SLATE_BASE;
      if      (stripHash < 30) color = SLATE_DARK;
      else if (stripHash < 50) color = SLATE_LIT;
      // Darker rim along bottom of slate row (every 6 rows = course line)
      if ((y % 6) === 0) color = SLATE_DARK;
      // Bright top-edge highlight (catching imagined sunlight)
      if (y < 8) color = SLATE_LIT;
      setPx(x, y, color);
    }
  }
  // Slate roof outline (dark rim along bottom edge / overhang shadow)
  for (let x = 4; x <= W - 5; x++) {
    setPx(x, 40, STONE_RIM);
    setPx(x, 41, STONE_SHD);
    setPx(x, 42, STONE_SHD);
  }

  // ── Brick chimney — left-side roof, emits smoke ───────────────────
  // Chimney column at x=40..56, from y=0 (above roof peak) to y=28.
  fillRect(40, 0, 16, 28, STONE_DARK);
  // Brick texture pattern on chimney
  for (let by = 0; by < 4; by++) {
    for (let bx = 0; bx < 2; bx++) {
      const x0 = 40 + bx * 8 + (by & 1 ? 4 : 0);
      const y0 = by * 7;
      // Inner shade
      const c = (hash(bx, by) % 100 < 50) ? STONE_BASE : STONE_LIT;
      for (let py = 0; py < 6; py++) {
        for (let px = 0; px < 7; px++) {
          if (x0 + px >= 40 && x0 + px < 56 && y0 + py < 28) {
            setPx(x0 + px, y0 + py, c);
          }
        }
      }
    }
  }
  // Chimney mortar grid
  for (let y = 0; y < 28; y += 7) {
    for (let x = 40; x < 56; x++) setPx(x, y, MORTAR);
  }
  for (let x = 40; x <= 56; x += 8) {
    for (let y = 0; y < 28; y++) setPx(x, y, MORTAR);
  }
  // Chimney rim
  for (let y = 0; y < 28; y++) { setPx(39, y, STONE_RIM); setPx(56, y, STONE_RIM); }
  for (let x = 39; x <= 56; x++) setPx(x, 0, STONE_HI); // sunlit top
  // Chimney cap — slightly wider than column
  fillRect(38, 0, 20, 2, STONE_DARK);

  // ── Smoke wisp — 3 px wide diagonal blob rising from chimney ──────
  // Drifts up + right (wind from left).
  for (let i = 0; i < 14; i++) {
    const py = -2 + i * 0; // we draw above y=0 — but the buf is clamped
    // Instead lay smoke INSIDE frame, starting at chimney cap.
    const cx = 47 + Math.floor(i / 3);
    const cy = 4 + Math.floor(i / 1.5);
    // hash-jittered offset for fluff
    const h = hash(i, 999);
    const ox = (h % 3) - 1;
    const oy = ((h >>> 4) % 2);
    fillEllipse(cx + ox, cy + oy - 8, 2 + (i < 6 ? 1 : 0), 1, SMOKE_BASE);
  }

  // ── Stone facade — y 42..150 (108 px tall × 184 px wide) ──────────
  paintStoneWall(4, 42, W - 8, 108, /*courseHeight*/8, /*blockWidth*/14);

  // ── Door — centered, 18 wide × 32 tall ─────────────────────────────
  const doorX = W / 2 - 9;
  const doorY = H - 42;
  fillRect(doorX - 1, doorY - 1, 20, 34, WOOD_DARK); // door frame
  fillRect(doorX, doorY, 18, 32, WOOD_RICH);
  // Vertical planks (3 of them)
  for (let p = 0; p < 3; p++) {
    const px = doorX + p * 6;
    for (let y = doorY; y < doorY + 32; y++) {
      setPx(px, y, WOOD_DARK);
    }
  }
  // Plank highlights (subtle)
  for (let p = 0; p < 3; p++) {
    const px = doorX + 2 + p * 6;
    for (let y = doorY + 2; y < doorY + 30; y += 4) {
      setPx(px, y, WOOD_LIT);
    }
  }
  // Door arch — slight rounded top
  setPx(doorX,     doorY, WOOD_DARK);
  setPx(doorX + 17, doorY, WOOD_DARK);
  // Anvil silhouette through the doorway — dark blob at bottom-center
  // of the doorway (suggests an anvil cooling in the dark interior).
  fillRect(doorX + 5, doorY + 22, 8, 6, hex('#1a1410'));
  setPx(doorX + 6, doorY + 21, hex('#1a1410'));
  setPx(doorX + 11, doorY + 21, hex('#1a1410'));
  // Faint warm glow ABOVE anvil silhouette (forge heat)
  for (let x = doorX + 4; x < doorX + 14; x++) {
    setPx(x, doorY + 20, GLOW_WARM);
  }
  setPx(doorX + 9, doorY + 19, GLOW_BRIGHT);

  // ── Window — small square, right of door ───────────────────────────
  const winX = W - 50;
  const winY = H - 70;
  fillRect(winX - 1, winY - 1, 14, 14, WOOD_DARK); // frame
  fillRect(winX, winY, 12, 12, GLOW_WARM);
  // Cross-pane
  for (let i = 0; i < 12; i++) {
    setPx(winX + 5,  winY + i, WOOD_DARK);
    setPx(winX + 6,  winY + i, WOOD_DARK);
    setPx(winX + i,  winY + 5, WOOD_DARK);
    setPx(winX + i,  winY + 6, WOOD_DARK);
  }
  // Inner bright glint
  setPx(winX + 3, winY + 3, GLOW_BRIGHT);
  setPx(winX + 9, winY + 9, GLOW_BRIGHT);

  featherEdges();
  return P.buf;
}

// ════════════════════════════════════════════════════════════════════
//   TAVERN — 224 × 176, 2-story timber-frame "Wayward Inn"
// ════════════════════════════════════════════════════════════════════
function paintTavern() {
  const W = 224, H = 176;
  const P = makePainter(W, H);
  const { setPx, getPx, fillRect, fillEllipse, blendEllipseSoft, paintStoneWall, featherEdges } = P;

  // Layout (top → bottom in 176):
  //   y   0..  6  — sky above thatch peak
  //   y   6.. 60  — thatched roof (saggy, with peak)
  //   y  60.. 64  — eave shadow under thatch
  //   y  64..114  — upper floor: timber-frame (cream daub + beams)
  //   y 114..116  — floor divider (dark beam)
  //   y 116..168  — lower floor: stone facade
  //   y 168..176  — ground shadow

  // Ground shadow
  blendEllipseSoft(W / 2, 172, W / 2 - 8, 5, SHADOW, 0.45);

  // ── Thatched roof — sagging trapezoid with peak ──────────────────
  // Top edge: narrow (40 wide). Bottom edge: wide (216 wide). Roof has
  // slight sag along the ridge — left side dips below right.
  for (let y = 8; y <= 58; y++) {
    const t = (y - 8) / 50;
    const halfW = Math.round(28 + (108 - 28) * t);
    const cx = W / 2;
    for (let x = cx - halfW; x <= cx + halfW; x++) {
      // Per-pixel hash-driven thatch grain — vertical streaks
      const h = hash(x, Math.floor(y / 2));
      const r = h % 100;
      let color = THATCH_BASE;
      if      (r < 25) color = THATCH_DARK;
      else if (r < 55) color = THATCH_LIT;
      // Course-line darkening every 8 rows
      if ((y % 8) === 0) color = THATCH_DARK;
      // Top peak brighter (catching light)
      if (y < 12) color = THATCH_LIT;
      setPx(x, y, color);
    }
  }
  // Saggy ridge — slight dip in the silhouette on the left side
  for (let x = W / 2 - 30; x < W / 2 - 10; x++) {
    setPx(x, 9, THATCH_DARK);
    setPx(x, 10, THATCH_DARK);
  }
  // Bottom edge of thatch — fluffy tufts hanging down
  for (let x = 8; x < W - 8; x += 4) {
    const h = hash(x, 8888);
    const tuftLen = 2 + (h % 3);
    for (let dy = 0; dy < tuftLen; dy++) {
      setPx(x,     58 + dy, THATCH_TUFT);
      setPx(x + 1, 58 + dy, THATCH_DARK);
    }
  }
  // Eave shadow — darker band under thatch overhang
  for (let x = 8; x < W - 8; x++) {
    setPx(x, 62, STONE_SHD);
    setPx(x, 63, STONE_SHD);
  }

  // ── Upper floor — timber-frame: cream daub between dark wood beams ──
  // Full-width upper floor: y 64..114 (50 px tall × 208 wide).
  const u_x0 = 8, u_y0 = 64, u_w = W - 16, u_h = 50;
  // Daub fill
  for (let y = u_y0; y < u_y0 + u_h; y++) {
    for (let x = u_x0; x < u_x0 + u_w; x++) {
      // Hash-driven daub variation — three shades for plaster mottle
      const h = hash(x, y);
      const r = h % 100;
      let color = DAUB_BASE;
      if      (r < 20) color = DAUB_DARK;
      else if (r < 50) color = DAUB_LIT;
      setPx(x, y, color);
    }
  }
  // Vertical beams — 6 of them, evenly spaced
  for (let i = 0; i <= 5; i++) {
    const bx = u_x0 + Math.round(i * (u_w / 5));
    for (let y = u_y0; y < u_y0 + u_h; y++) {
      setPx(bx,     y, WOOD_DARK);
      setPx(bx + 1, y, WOOD_BASE);
    }
  }
  // Horizontal sill / lintel beams
  for (let x = u_x0; x < u_x0 + u_w; x++) {
    setPx(x, u_y0,         WOOD_DARK);
    setPx(x, u_y0 + 1,     WOOD_BASE);
    setPx(x, u_y0 + u_h - 2, WOOD_BASE);
    setPx(x, u_y0 + u_h - 1, WOOD_DARK);
  }
  // Diagonal cross-brace in two of the panels (W-frame timber-frame look)
  for (let i = 0; i < 30; i++) {
    setPx(u_x0 + 14 + i, u_y0 + 14 + Math.floor(i * 0.8), WOOD_DARK);
    setPx(u_x0 + 14 + 30 - i, u_y0 + 14 + Math.floor((30 - i) * 0.8), WOOD_DARK);
  }
  for (let i = 0; i < 30; i++) {
    const bx = u_x0 + u_w - 50;
    setPx(bx + i, u_y0 + 14 + Math.floor(i * 0.8), WOOD_DARK);
    setPx(bx + 30 - i, u_y0 + 14 + Math.floor((30 - i) * 0.8), WOOD_DARK);
  }

  // ── Two windows on upper floor — warm glow ─────────────────────────
  function paintWindow(x, y, w, h) {
    // Frame
    for (let dy = -1; dy < h + 1; dy++) {
      for (let dx = -1; dx < w + 1; dx++) {
        if (dx === -1 || dx === w || dy === -1 || dy === h) {
          setPx(x + dx, y + dy, WOOD_DARK);
        }
      }
    }
    // Glow fill
    fillRect(x, y, w, h, GLOW_WARM);
    // Crosspane
    for (let i = 0; i < h; i++) setPx(x + Math.floor(w / 2), y + i, WOOD_DARK);
    for (let i = 0; i < w; i++) setPx(x + i, y + Math.floor(h / 2), WOOD_DARK);
    // Bright glint
    setPx(x + 2, y + 2, GLOW_BRIGHT);
    setPx(x + w - 3, y + h - 3, GLOW_BRIGHT);
  }
  paintWindow(u_x0 + 60, u_y0 + 20, 18, 16);
  paintWindow(u_x0 + 140, u_y0 + 20, 18, 16);

  // ── Floor divider beam between upper & lower ──────────────────────
  for (let x = 4; x < W - 4; x++) {
    setPx(x, 114, WOOD_DARK);
    setPx(x, 115, WOOD_BASE);
  }

  // ── Lower floor — stone facade ────────────────────────────────────
  paintStoneWall(8, 116, W - 16, 52, /*courseHeight*/8, /*blockWidth*/14);

  // ── Double-door entrance — centered, wide ─────────────────────────
  const doorX = W / 2 - 13;
  const doorY = H - 44;
  fillRect(doorX - 1, doorY - 1, 28, 30, WOOD_DARK); // frame
  fillRect(doorX, doorY, 26, 28, WOOD_RICH);
  // Center divider between doors
  for (let y = doorY; y < doorY + 28; y++) setPx(doorX + 12, y, WOOD_DARK);
  // Plank lines
  for (let p = 0; p < 4; p++) {
    const px = doorX + 2 + p * 4;
    for (let y = doorY + 2; y < doorY + 26; y += 3) {
      setPx(px, y, WOOD_LIT);
    }
  }
  // Faint glow leaking under door (warm light from interior)
  for (let x = doorX + 2; x < doorX + 24; x++) {
    setPx(x, doorY + 28, GLOW_WARM);
  }

  // ── Lower-floor side windows ──────────────────────────────────────
  paintWindow(24, 130, 16, 14);
  paintWindow(W - 40, 130, 16, 14);

  // ── Hanging signboard "INN" — right of door, mounted on bracket ────
  // Bracket arm
  fillRect(W - 64, 120, 2, 10, WOOD_DARK);
  for (let x = W - 64; x < W - 56; x++) setPx(x, 122, WOOD_BASE);
  // Sign (small rect hung from bracket)
  const signX = W - 70, signY = 128;
  fillRect(signX - 1, signY - 1, 14, 12, WOOD_DARK);
  fillRect(signX, signY, 12, 10, WOOD_LIT);
  // Letters "INN" — three vertical strokes (we don't have real font rendering)
  setPx(signX + 2, signY + 3, WOOD_DARK);
  setPx(signX + 2, signY + 4, WOOD_DARK);
  setPx(signX + 2, signY + 5, WOOD_DARK);
  setPx(signX + 2, signY + 6, WOOD_DARK);
  // N — diagonal
  setPx(signX + 5, signY + 3, WOOD_DARK);
  setPx(signX + 5, signY + 4, WOOD_DARK);
  setPx(signX + 5, signY + 5, WOOD_DARK);
  setPx(signX + 6, signY + 4, WOOD_DARK);
  setPx(signX + 7, signY + 5, WOOD_DARK);
  setPx(signX + 7, signY + 6, WOOD_DARK);
  // Second N
  setPx(signX + 9,  signY + 3, WOOD_DARK);
  setPx(signX + 9,  signY + 4, WOOD_DARK);
  setPx(signX + 9,  signY + 5, WOOD_DARK);
  setPx(signX + 9,  signY + 6, WOOD_DARK);
  setPx(signX + 10, signY + 4, WOOD_DARK);

  featherEdges();
  return P.buf;
}

// ════════════════════════════════════════════════════════════════════
//   TOWER — 96 × 192, narrow stone column with conical purple roof
// ════════════════════════════════════════════════════════════════════
function paintTower() {
  const W = 96, H = 192;
  const P = makePainter(W, H);
  const { setPx, getPx, fillRect, fillEllipse, blendEllipseSoft, paintStoneWall, featherEdges } = P;

  // Layout (top → bottom in 192):
  //   y   0..  6  — sky above conical peak
  //   y   6.. 56  — conical purple roof (tapered, sees top peak)
  //   y  56.. 60  — eave shadow + roof base ring
  //   y  60..182  — stone column (the body of the tower)
  //   y 182..192  — ground shadow

  blendEllipseSoft(W / 2, 187, 36, 4, SHADOW, 0.45);

  // ── Conical roof — tapered tall triangle ──────────────────────────
  // Top tip at (cx, 6), base at y=56, half-width 36.
  const cx = W / 2;
  const roofTopY = 6, roofBottomY = 56;
  for (let y = roofTopY; y <= roofBottomY; y++) {
    const t = (y - roofTopY) / (roofBottomY - roofTopY);
    const halfW = Math.round(2 + t * 34);
    for (let x = cx - halfW; x <= cx + halfW; x++) {
      // Vertical-banded purple shades — left side darker (light from upper-right)
      const dx = x - cx;
      let color = TOWER_ROOF_BASE;
      if      (dx < -halfW * 0.5) color = TOWER_ROOF_DARK;
      else if (dx > halfW * 0.4)  color = TOWER_ROOF_LIT;
      // Shingle course lines every 6 rows
      if ((y % 6) === 0) color = TOWER_ROOF_DARK;
      // Tip highlight
      if (y < 10) color = TOWER_ROOF_LIT;
      setPx(x, y, color);
    }
  }
  // Roof base — flared ring just above the column (slightly wider)
  for (let x = 6; x < W - 6; x++) {
    setPx(x, 56, TOWER_ROOF_DARK);
    setPx(x, 57, TOWER_ROOF_BASE);
    setPx(x, 58, STONE_SHD); // shadow band under eave
  }
  // Outer-rim outline of the roof cone — soft dark edge so it reads
  for (let y = roofTopY + 1; y <= roofBottomY - 1; y++) {
    const t = (y - roofTopY) / (roofBottomY - roofTopY);
    const halfW = Math.round(2 + t * 34);
    setPx(cx - halfW - 1, y, TOWER_ROOF_DARK);
    setPx(cx + halfW + 1, y, TOWER_ROOF_DARK);
  }

  // ── Stone column — y 58..182 (124 tall × 84 wide) ─────────────────
  paintStoneWall(6, 58, W - 12, 124, /*courseHeight*/8, /*blockWidth*/11);

  // ── Slit window — narrow vertical near the top, with purple glow ──
  const slitX = cx - 2, slitY = 80;
  // Frame
  fillRect(slitX - 1, slitY - 1, 5, 16, STONE_RIM);
  // Glow fill
  fillRect(slitX, slitY, 3, 14, GLOW_PURPLE);
  // Inner bright pixels (suggest a candle/seer-light)
  setPx(slitX + 1, slitY + 3, GLOW_PURPLE_LIT);
  setPx(slitX + 1, slitY + 7, GLOW_PURPLE_LIT);
  setPx(slitX + 1, slitY + 11, GLOW_PURPLE_LIT);

  // ── Faint purple bloom around the slit (subtle) ───────────────────
  // 4-px halo at low alpha — softens against stone.
  for (let dy = -4; dy <= 18; dy++) {
    for (let dx = -5; dx <= 7; dx++) {
      const d = Math.sqrt((dx - 1) * (dx - 1) + ((dy - 7) * 0.5) * ((dy - 7) * 0.5));
      if (d > 6 || d < 2) continue;
      const a = Math.max(0, 0.18 - (d - 2) / 30);
      const px = slitX + dx, py = slitY + dy;
      const cur = P.getPx(px, py);
      if (cur && cur[3] !== 0) P.blendPx(px, py, GLOW_PURPLE_LIT, a);
    }
  }

  // ── Tower entrance — small door at base ──────────────────────────
  const doorX = cx - 7, doorY = H - 38;
  fillRect(doorX - 1, doorY - 1, 16, 28, WOOD_DARK);
  fillRect(doorX, doorY, 14, 26, WOOD_RICH);
  // Plank stripes
  for (let p = 0; p < 3; p++) {
    const px = doorX + p * 5;
    for (let y = doorY; y < doorY + 26; y++) setPx(px, y, WOOD_DARK);
  }
  // Rounded arch — single dark pixel each corner
  setPx(doorX,     doorY, WOOD_DARK);
  setPx(doorX + 13, doorY, WOOD_DARK);

  featherEdges();
  return P.buf;
}

// ── Serialize each building to PNG ────────────────────────────────────
async function writePng(buf, w, h, outPath) {
  await sharp(buf, { raw: { width: w, height: h, channels: 4 } })
    .png()
    .toFile(outPath);
}

await writePng(paintSmithy(), 192, 160, '../slime-depths-godot/assets/buildings/smithy.png');
console.log(`[done] smithy.png   (192×160, slate roof + brick chimney + glowing forge)`);

await writePng(paintTavern(), 224, 176, '../slime-depths-godot/assets/buildings/tavern.png');
console.log(`[done] tavern.png   (224×176, thatched roof + timber frame + hanging INN sign)`);

await writePng(paintTower(), 96, 192, '../slime-depths-godot/assets/buildings/tower.png');
console.log(`[done] tower.png    (96×192, conical purple roof + slit window + faint glow)`);
