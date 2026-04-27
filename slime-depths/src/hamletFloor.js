// ============================================================================
// HAMLET FLOOR — paired-image renderer (visual + walkability mask).
//
// Renders the AI-generated scene_v2.jpg as the entire hamlet floor and
// derives walkability from scene_v2_mask.jpg (B&W mask, same dimensions:
// white pixels = blocked, black = walkable). Two paired images give us
// pixel-perfect collision with zero hand-tuning — replaces ~80 lines of
// luminance-threshold sampling + manual exclusion rectangles from v1.
// ============================================================================

import { images } from './loader.js';
import { setHamletWalkableFn } from './room.js';

// World dimensions match the source images natively (1376×768).
export const CAINOS_TILE = 32;     // legacy export — used by other modules
export const HAMLET_W = 1376;
export const HAMLET_H = 768;
// Legacy exports — kept in case any external consumer still reads them.
// (Legacy HAMLET_COLS / HAMLET_ROWS exports were removed — no consumer.
// World now thinks in pixels, not 32px tiles, since the backdrop is a
// single-image render and walkability comes from a pixel-sampled mask.)

// ─── WALKABILITY — SAMPLED FROM B&W MASK IMAGE ────────────────────────────
// The mask is a paired companion to the visual scene: same dimensions, but
// every pixel is either pure black (walkable) or pure white (blocked).
// We build a coarse boolean bitmap once on first use (after the image has
// loaded) by sampling at SAMPLE_STEP intervals. SAMPLE_STEP = 4 gives a
// 344×192 grid — fine enough for smooth wall edges, cheap to build (66k
// samples = single-frame cost).
const SAMPLE_STEP = 4;
const BLOCK_THRESHOLD = 128;     // mask pixel > 128 = white = blocked

let walkBits = null;
let walkBitsCols = 0;
let walkBitsRows = 0;

// Trees in the painted scene are very dark green/black silhouettes
// (luminance ~20-40). The AI mask occasionally renders them as black
// (= walkable in our convention) — a known recurring issue. Sampling
// the VISUAL scene alongside the mask lets us catch trees automatically:
// any cell whose visual pixel is darker than this threshold is treated
// as blocked, even if the mask says walkable.
const TREE_DARK_THRESHOLD = 45;

function buildWalkabilityBitmap() {
  const maskImg = images.hamlet_scene_v4_mask;
  const visualImg = images.hamlet_scene_v4;
  if (!maskImg || !maskImg.complete || !maskImg.naturalWidth) return false;
  if (!visualImg || !visualImg.complete || !visualImg.naturalWidth) return false;
  // Render both images to canvases to read pixel data.
  const mcv = document.createElement('canvas');
  mcv.width = maskImg.naturalWidth; mcv.height = maskImg.naturalHeight;
  mcv.getContext('2d').drawImage(maskImg, 0, 0);
  const vcv = document.createElement('canvas');
  vcv.width = visualImg.naturalWidth; vcv.height = visualImg.naturalHeight;
  vcv.getContext('2d').drawImage(visualImg, 0, 0);
  let maskData, visData;
  try {
    maskData = mcv.getContext('2d').getImageData(0, 0, mcv.width, mcv.height).data;
    visData = vcv.getContext('2d').getImageData(0, 0, vcv.width, vcv.height).data;
  } catch (e) {
    console.warn('[hamlet] image sample failed:', e);
    return false;
  }
  walkBitsCols = Math.ceil(HAMLET_W / SAMPLE_STEP);
  walkBitsRows = Math.ceil(HAMLET_H / SAMPLE_STEP);
  walkBits = new Uint8Array(walkBitsCols * walkBitsRows);
  const msx = mcv.width / HAMLET_W, msy = mcv.height / HAMLET_H;
  const vsx = vcv.width / HAMLET_W, vsy = vcv.height / HAMLET_H;
  // Pass 1: average pixels within each sample block from BOTH the mask
  // (collision data) and the visual scene (tree darkness check). A cell
  // is walkable only if mask says walkable AND visual is brighter than
  // the tree-dark threshold. JPEG noise is smoothed by averaging.
  for (let r = 0; r < walkBitsRows; r++) {
    for (let c = 0; c < walkBitsCols; c++) {
      // Mask sample block
      let mSum = 0, mN = 0;
      const mx0 = Math.floor(c * SAMPLE_STEP * msx);
      const my0 = Math.floor(r * SAMPLE_STEP * msy);
      const mx1 = Math.min(mcv.width, Math.ceil((c + 1) * SAMPLE_STEP * msx));
      const my1 = Math.min(mcv.height, Math.ceil((r + 1) * SAMPLE_STEP * msy));
      for (let py = my0; py < my1; py++) {
        for (let px = mx0; px < mx1; px++) {
          const i = (py * mcv.width + px) * 4;
          mSum += maskData[i] + maskData[i + 1] + maskData[i + 2];
          mN += 3;
        }
      }
      const maskAvg = mN > 0 ? mSum / mN : 0;
      const maskWalkable = maskAvg <= BLOCK_THRESHOLD;
      // Visual sample block — looking for tree darkness
      let vSum = 0, vN = 0;
      const vx0 = Math.floor(c * SAMPLE_STEP * vsx);
      const vy0 = Math.floor(r * SAMPLE_STEP * vsy);
      const vx1 = Math.min(vcv.width, Math.ceil((c + 1) * SAMPLE_STEP * vsx));
      const vy1 = Math.min(vcv.height, Math.ceil((r + 1) * SAMPLE_STEP * vsy));
      for (let py = vy0; py < vy1; py++) {
        for (let px = vx0; px < vx1; px++) {
          const i = (py * vcv.width + px) * 4;
          vSum += visData[i] + visData[i + 1] + visData[i + 2];
          vN += 3;
        }
      }
      const visAvg = vN > 0 ? vSum / vN : 255;
      const isTree = visAvg < TREE_DARK_THRESHOLD;
      walkBits[r * walkBitsCols + c] = (maskWalkable && !isTree) ? 1 : 0;
    }
  }
  // Pass 2: 3x3 majority filter. For each cell, take the majority of its
  // 3x3 neighborhood. Smooths single-cell speckles (a lone walkable pixel
  // inside a wall, or vice versa) so the playable space is contiguous.
  // Run twice for stronger smoothing — each pass cleans up speckles up to
  // size N and exposes the next layer.
  const tmp = new Uint8Array(walkBits.length);
  for (let pass = 0; pass < 2; pass++) {
    for (let r = 0; r < walkBitsRows; r++) {
      for (let c = 0; c < walkBitsCols; c++) {
        let walk = 0, blocked = 0;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const nr = r + dr, nc = c + dc;
            if (nr < 0 || nc < 0 || nr >= walkBitsRows || nc >= walkBitsCols) {
              blocked++; continue;     // out-of-bounds counts as blocked
            }
            if (walkBits[nr * walkBitsCols + nc]) walk++;
            else blocked++;
          }
        }
        tmp[r * walkBitsCols + c] = walk > blocked ? 1 : 0;
      }
    }
    walkBits.set(tmp);
  }
  return true;
}

// Manual exclusions — rectangles where the hero must be blocked from
// walking, regardless of what the luminance mask says. Two cases:
//   1. Trees inside the compound where the AI mask drew the tree as
//      black (walkable) — handled programmatically via TREE_DARK_THRESHOLD,
//      no rects needed
//   2. Animated FX overlays (firepit, anvil, cookingpot) — these are
//      drawn on top of the painted backdrop, but the painted backdrop
//      under them is just walkable cobble/grass, so without manual
//      exclusions the hero would walk THROUGH the firepit, anvil, etc.
//
// Each rect is checked AFTER the mask; if hero is inside any exclusion
// we treat it as blocked regardless of the mask's verdict. Rects are
// tight to the FX BASE (the part on the ground) — not the full sprite
// bbox — so the hero bumps off the visible mass, not the empty air
// above it.
const EXCLUSIONS = [
  // Firepit — base ring at (980, 470) in the E camp dirt zone. Sprite
  // 48×48 scaled 1.12× → ~54px rendered, ~40×36 around base.
  { x1: 960, y1: 452, x2: 1000, y2: 488 },
  // Anvil — full anvil mass at (966, 216) on the NE smithy stone pad.
  // Slightly tighter footprint than v3 since the painted anvil
  // silhouette underneath gives the bump a clear visual referent.
  { x1: 940, y1: 197, x2: 992, y2: 247 },
  // Cooking pot — full pot body + tripod at (910, 430) on the camp
  // dirt patch. Covers the visible kettle from rim to tripod feet.
  { x1: 883, y1: 408, x2: 938, y2: 463 },
  // Scrying basin LEFT at (650, 220) — flanks the N shrine slab.
  // Tall pedestal — narrow base.
  { x1: 635, y1: 230, x2: 665, y2: 260 },
  // Scrying basin RIGHT (twin) at (725, 220).
  { x1: 710, y1: 230, x2: 740, y2: 260 },
  // Notice board at (688, 320) — north of plaza center on the path
  // to the shrine. ~50×30 footprint covers the post + sign body.
  { x1: 663, y1: 305, x2: 713, y2: 335 },
];

// Manual ALWAYS-WALKABLE overrides — rectangles where the chromatic
// classifier classifies dark painted features as blocked but they
// SHOULD be walkable. v4 layout uses a chromatic walkability classifier
// (green-dominant = grass walkable, brown-dominant = dirt walkable,
// dark non-green/non-brown = wall blocked) so most formerly problematic
// dark zones are already correctly classified.
//
// Active overrides for v4:
//   1. Portal pad at PORTAL_POS (964, 654) — the painted ritual ring
//      on the SE grass clearing has dark stone borders that the mask
//      may flag as blocked. Override ensures the hero can stand on
//      the ring to trigger E·DESCEND.
//   2. Shrine slab at SHRINE_POS (687, 201) — the painted altar stone
//      is light grey but its border ring may be dark; override
//      ensures hero can approach it for shrine interactions.
//
// These are checked BEFORE the mask sample; if the hero is inside any
// rect, we return walkable regardless of mask. EXCLUSIONS still
// take precedence (checked first) so this can't accidentally re-open
// a deliberate prop block like the firepit ring.
const ALWAYS_WALKABLE = [
  { x1: 920, y1: 614, x2: 1008, y2: 694 },    // portal pad (88×80 around 964,654)
  { x1: 660, y1: 175, x2: 715, y2: 230 },     // shrine approach (55×55 around 687,201)
];

export function isHamletWalkable(worldX, worldY) {
  if (worldX < 0 || worldX >= HAMLET_W) return false;
  if (worldY < 0 || worldY >= HAMLET_H) return false;
  if (!walkBits) {
    if (!buildWalkabilityBitmap()) return true;     // mask not ready: allow movement
  }
  // EXCLUSIONS take precedence — deliberate blocks (e.g. firepit ring)
  // override both ALWAYS_WALKABLE and the mask.
  for (const e of EXCLUSIONS) {
    if (worldX >= e.x1 && worldX <= e.x2 && worldY >= e.y1 && worldY <= e.y2) return false;
  }
  // ALWAYS_WALKABLE overrides the mask — for spots where dark painted
  // features got mis-classified as walls.
  for (const w of ALWAYS_WALKABLE) {
    if (worldX >= w.x1 && worldX <= w.x2 && worldY >= w.y1 && worldY <= w.y2) return true;
  }
  // Otherwise fall back to the mask.
  const c = Math.floor(worldX / SAMPLE_STEP);
  const r = Math.floor(worldY / SAMPLE_STEP);
  if (c < 0 || r < 0 || c >= walkBitsCols || r >= walkBitsRows) return false;
  if (walkBits[r * walkBitsCols + c] === 0) return false;
  return true;
}

// Register with room.js so isWallAtWorld can route hamlet wall-checks here.
// Done at module load; the function works lazily (mask sampled on first call
// after the mask image has loaded).
setHamletWalkableFn(isHamletWalkable);

// ─── RENDER ───────────────────────────────────────────────────────────────
// One drawImage call. The visual scene is a 1376×768 painting with all walls,
// trees, props, and zone features baked in. Mask is invisible — only used
// for collision.
export function drawHamletFloor(ctx) {
  const img = images.hamlet_scene_v4;
  if (!img) return;
  const prevSmoothing = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, HAMLET_W, HAMLET_H);
  ctx.imageSmoothingEnabled = prevSmoothing;
}

// Debug helper — exposes the walkability bitmap state for inspection.
export function debugWalkable() {
  if (!walkBits) return { built: false };
  let walkable = 0;
  for (const b of walkBits) if (b) walkable++;
  return {
    built: true,
    cols: walkBitsCols, rows: walkBitsRows,
    walkable, total: walkBits.length,
    pct: Math.round((walkable / walkBits.length) * 100),
    sampleStep: SAMPLE_STEP, threshold: BLOCK_THRESHOLD,
  };
}
