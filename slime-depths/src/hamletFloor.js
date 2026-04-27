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
  const maskImg = images.hamlet_scene_v3_mask;
  const visualImg = images.hamlet_scene_v3;
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
  // Firepit — base ring at (435, 450), beside archivist's dirt patch.
  // Sprite 48×48 scaled 1.12× → ~54px rendered, ~40×36 around base.
  { x1: 415, y1: 432, x2: 455, y2: 468 },
  // Anvil — full anvil + tree stump at (925, 316). Covers the
  // visible mass of the prop so hero bumps off from any direction.
  { x1: 899, y1: 297, x2: 954, y2: 347 },
  // Cooking pot — full pot body + tripod at (987, 413). Covers the
  // full visible kettle from rim to tripod feet.
  { x1: 960, y1: 391, x2: 1015, y2: 446 },
  // Lectern EXCLUSION removed (lectern FX entry removed).
  // Scrying basin LEFT at (650, 226). Tall pedestal — narrow base.
  { x1: 635, y1: 236, x2: 665, y2: 266 },
  // Scrying basin RIGHT (twin) at (726, 226).
  { x1: 711, y1: 236, x2: 741, y2: 266 },
  // Bookcase + studydesk EXCLUSIONS removed (FX entries removed).
  // Flameskull EXCLUSION removed (FX entry parked for dungeon use).
  // Well EXCLUSION removed (FX entry removed).
  // Save gem at (620, 610) — south entrance area, west side of path.
  { x1: 609, y1: 602, x2: 631, y2: 619 },
  // Notice board at (688, 360) — wider footprint than gem ~50×30.
  { x1: 663, y1: 345, x2: 713, y2: 375 },
  // Chest EXCLUSIONS removed (FX entries removed — chests are dungeon
  // props now, see makeTreasureChestRoom in floor.js).
  // Graves + lantern post EXCLUSIONS removed (FX entries removed).
];

// Manual ALWAYS-WALKABLE overrides — rectangles where the luminance-based
// mask classifies dark painted features as blocked but they SHOULD be
// walkable. Two regions in v3 right now:
//   1. Portal pad at (687, 381) — the painted dark ring/disc on the
//      cobble plaza is dark-on-dark, so the mask flagged it as wall.
//      The hero needs to step onto it to trigger E·DESCEND.
//   2. Wanderer's camp dirt patch (~860, 540) — this is the brown/dirt
//      area where the cooking pot FX + wanderer NPC live. Detection
//      shows luminance 22-60 across x=820-1010, y=460-620 (it's the
//      darkest contiguous patch in the south-east plaza). Without
//      this override, the hero gets blocked from approaching the
//      wanderer or interacting with the pot. (User called this
//      "where the fire was" — referring to the visible scorched-dirt
//      area, not the legacy FIREPIT_POS constant.)
//
// These are checked BEFORE the mask sample; if the hero is inside any
// rect, we return walkable regardless of luminance. EXCLUSIONS still
// take precedence (checked first) so this can't accidentally re-open
// a deliberate block like the new firepit ring.
const ALWAYS_WALKABLE = [
  { x1: 632, y1: 326, x2: 742, y2: 436 },     // portal pad (110×110 around 687,381)
  { x1: 820, y1: 460, x2: 1010, y2: 620 },    // wanderer's camp dirt patch (190×160)
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
  const img = images.hamlet_scene_v3;
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
