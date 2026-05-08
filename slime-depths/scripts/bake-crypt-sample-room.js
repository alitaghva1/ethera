// Bake the artist's Sample Map.tmx into a properly Tiled-aware
// shippable game room.
//
// THREE OUTPUTS:
//   public/assets/rooms/crypt_sample.png         — STATIC composite
//                                                   (terrain + walls + non-animated props only)
//   public/assets/rooms/crypt_sample_anims.png   — animation atlas
//                                                   (every frame of every animated tile,
//                                                    laid out in a grid)
//   public/assets/rooms/crypt_sample.json        — runtime metadata:
//                                                   - room dims + tile size
//                                                   - per-cell collision rects (sub-tile
//                                                     shapes from each tile's objectgroup)
//                                                   - animated props list:
//                                                     [{x, y, w, h, frames: [{atlasIdx, duration}]}]
//                                                   - animation atlas geometry
//                                                   - hero spawn cell (centroid of largest
//                                                     connected walkable region)
//
// The static PNG SKIPS animated tiles so they don't double-render at
// runtime. The engine draws the static PNG once then iterates animated
// props each frame, drawing the current animation frame on top.
//
// Per-tile collision: each <tile> in a wall .tsx may have an
// <objectgroup> with one or more <object> rects. Those rects define
// the SOLID part of the tile — anything else is passable. We bake a
// per-cell list of rect offsets so runtime collision becomes
// "point-in-any-rect at the cells the hero overlaps."
//
// Re-run this script if the source .tmx or any .tsx changes.

import sharp from 'sharp';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

// CLI args:
//   --src <path>    source .tmx (default Sample Map.tmx)
//   --out <prefix>  output prefix (default crypt_sample)
//   --crop x y w h  crop region in tiles (default: whole map)
function parseCli(argv) {
  const out = { src: 'public/assets/packs/crypt/tmx/Sample Map.tmx', name: 'crypt_sample', crop: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--src') out.src = argv[++i];
    else if (argv[i] === '--out') out.name = argv[++i];
    else if (argv[i] === '--crop') {
      out.crop = {
        x: parseInt(argv[++i], 10),
        y: parseInt(argv[++i], 10),
        w: parseInt(argv[++i], 10),
        h: parseInt(argv[++i], 10),
      };
    }
  }
  return out;
}
const cli = parseCli(process.argv);
const TMX_PATH = cli.src;
const OUT_PNG = `public/assets/rooms/${cli.name}.png`;
const OUT_ANIMS_PNG = `public/assets/rooms/${cli.name}_anims.png`;
const OUT_JSON = `public/assets/rooms/${cli.name}.json`;
const CROP = cli.crop;     // null = no crop

console.log(`[bake] source: ${TMX_PATH}${CROP ? ` (crop ${CROP.x},${CROP.y} ${CROP.w}×${CROP.h})` : ''}`);
console.log(`[bake] outputs: ${OUT_PNG}, ${OUT_ANIMS_PNG}, ${OUT_JSON}`);

// ─── Minimal XML parsing ─────────────────────────────────────────────
function parseAttrs(s) {
  const out = {};
  for (const m of s.matchAll(/(\w+)="([^"]*)"/g)) out[m[1]] = m[2];
  return out;
}
function findTag(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}\\s+([^>]*?)>`));
  return m ? parseAttrs(m[1]) : null;
}

// ─── Parse a .tsx tileset (with animations + per-tile collision) ────
async function parseTsx(path) {
  const xml = await readFile(path, 'utf-8');
  const tsAttrs = findTag(xml, 'tileset');
  const ts = {
    name: tsAttrs.name,
    tileWidth: +tsAttrs.tilewidth,
    tileHeight: +tsAttrs.tileheight,
    tileCount: +tsAttrs.tilecount,
    columns: +tsAttrs.columns,
    image: null,
    tiles: new Map(),       // tileId → { source?, width?, height?, animation?, collision? }
    sourceDir: dirname(path),
  };
  // Top-level <image> only (image-collection tilesets put <image> inside <tile>).
  const firstTileIdx = xml.indexOf('<tile ');
  const headerXml = firstTileIdx >= 0 ? xml.slice(0, firstTileIdx) : xml;
  const imgAttrs = findTag(headerXml, 'image');
  if (imgAttrs && imgAttrs.source) {
    ts.image = {
      source: imgAttrs.source,
      width: +imgAttrs.width,
      height: +imgAttrs.height,
    };
  }
  // Per-tile data
  for (const m of xml.matchAll(/<tile\s+([^>]*?)>([\s\S]*?)<\/tile>/g)) {
    const id = parseInt(parseAttrs(m[1]).id, 10);
    const inner = m[2];
    const entry = { id };
    // Image collection: <image> inside the tile
    const innerImg = inner.match(/<image\s+([^>]+?)\/>/);
    if (innerImg) {
      const ia = parseAttrs(innerImg[1]);
      entry.source = ia.source;
      entry.width = +ia.width;
      entry.height = +ia.height;
    }
    // Animation
    const animMatch = inner.match(/<animation>([\s\S]*?)<\/animation>/);
    if (animMatch) {
      const frames = [];
      for (const fm of animMatch[1].matchAll(/<frame\s+([^>]*?)\/>/g)) {
        const fa = parseAttrs(fm[1]);
        frames.push({ tileid: parseInt(fa.tileid, 10), duration: +fa.duration });
      }
      entry.animation = frames;
    }
    // Collision (objectgroup with object rects)
    const objgroupMatch = inner.match(/<objectgroup[\s\S]*?<\/objectgroup>/);
    if (objgroupMatch) {
      const rects = [];
      for (const om of objgroupMatch[0].matchAll(/<object\s+([^/>]+?)\/>/g)) {
        const oa = parseAttrs(om[1]);
        rects.push({
          x: parseFloat(oa.x || '0'),
          y: parseFloat(oa.y || '0'),
          w: parseFloat(oa.width || '0'),
          h: parseFloat(oa.height || '0'),
        });
      }
      if (rects.length) entry.collision = rects;
    }
    if (Object.keys(entry).length > 1) ts.tiles.set(id, entry);
  }
  return ts;
}

// ─── Parse the .tmx ──────────────────────────────────────────────────
const xml = await readFile(TMX_PATH, 'utf-8');
const mapAttrs = findTag(xml, 'map');
const SRC_W = +mapAttrs.width;
const SRC_H = +mapAttrs.height;
const TW = +mapAttrs.tilewidth;
const TH = +mapAttrs.tileheight;

// Apply crop or fall through to whole-map.
const X0 = CROP ? CROP.x : 0;
const Y0 = CROP ? CROP.y : 0;
const W = CROP ? CROP.w : SRC_W;       // OUTPUT width in tiles (cropped or full)
const H = CROP ? CROP.h : SRC_H;       // OUTPUT height in tiles
function inCrop(tx, ty) {
  return tx >= X0 && tx < X0 + W && ty >= Y0 && ty < Y0 + H;
}

// Tilesets
const tilesetRefs = [];
for (const m of xml.matchAll(/<tileset\s+([^>]*?)\/>/g)) {
  const a = parseAttrs(m[1]);
  tilesetRefs.push({ firstGid: +a.firstgid, source: a.source });
}
const tmxDir = dirname(TMX_PATH);
// Soft-fail on missing tilesets: pack authors sometimes leave stale
// references to absolute paths from their Unity dev tree (e.g. volcano's
// duplicate tileset-main.tsx). Skip the missing one + warn — no error.
const tilesetSettled = await Promise.all(tilesetRefs.map(async (ref) => {
  try {
    const tsx = await parseTsx(resolve(tmxDir, ref.source));
    return { ...ref, tsx };
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      console.warn(`[bake] WARN missing tileset (skipped): ${ref.source}`);
      return null;
    }
    throw err;
  }
}));
const tilesets = tilesetSettled.filter(Boolean);
console.log(`[bake] tilesets: ${tilesets.map((t) => t.tsx.name).join(', ')}`);

// Layers in document order (mixed tile + objectgroup)
const events = [];
for (const m of xml.matchAll(/<layer\s+([^>]*?)>([\s\S]*?)<\/layer>/g)) {
  const a = parseAttrs(m[1]);
  const dataMatch = m[2].match(/<data\s+encoding="csv">\s*([\s\S]*?)\s*<\/data>/);
  if (!dataMatch) continue;
  const data = dataMatch[1].split(/[\s,]+/).filter(Boolean).map((s) => parseInt(s, 10) >>> 0);
  events.push({
    idx: m.index, kind: 'tile', name: a.name, width: +a.width, height: +a.height, data,
  });
}
for (const m of xml.matchAll(/<objectgroup\s+([^>]*?)>([\s\S]*?)<\/objectgroup>/g)) {
  const a = parseAttrs(m[1]);
  const objects = [];
  // Capture both self-closing tile-objects (`<object gid="..." .../>`) AND
  // rect-objects with children (`<object ...><properties>...</properties></object>`).
  // The artist's prop layers use the first form; gameplay_* layers use the
  // second form (rectangles with custom properties + a `type` attribute).
  for (const om of m[2].matchAll(/<object\s+([^>]+?)\/>/g)) {
    const oa = parseAttrs(om[1]);
    if (oa.gid) {
      objects.push({
        gid: parseInt(oa.gid, 10) >>> 0,
        x: parseFloat(oa.x || '0'), y: parseFloat(oa.y || '0'),
        width: parseFloat(oa.width || '32'), height: parseFloat(oa.height || '32'),
        type: oa.type || '',
        name: oa.name || '',
        properties: {},
      });
    } else {
      // Self-closing rect-object with no gid (rare — most rects have <properties>).
      objects.push({
        gid: 0,
        x: parseFloat(oa.x || '0'), y: parseFloat(oa.y || '0'),
        width: parseFloat(oa.width || '0'), height: parseFloat(oa.height || '0'),
        type: oa.type || '',
        name: oa.name || '',
        properties: {},
      });
    }
  }
  // Multi-line <object>...</object> form — used by gameplay_* rects.
  for (const om of m[2].matchAll(/<object\s+([^>]+?)>([\s\S]*?)<\/object>/g)) {
    const oa = parseAttrs(om[1]);
    const props = {};
    for (const pm of om[2].matchAll(/<property\s+name="([^"]+)"\s+value="([^"]*)"\s*\/>/g)) {
      props[pm[1]] = pm[2];
    }
    objects.push({
      gid: oa.gid ? parseInt(oa.gid, 10) >>> 0 : 0,
      x: parseFloat(oa.x || '0'), y: parseFloat(oa.y || '0'),
      width: parseFloat(oa.width || '0'), height: parseFloat(oa.height || '0'),
      type: oa.type || '',
      name: oa.name || '',
      properties: props,
    });
  }
  events.push({ idx: m.index, kind: 'objects', name: a.name, objects });
}
events.sort((a, b) => a.idx - b.idx);
const layers = events.map((e) => { delete e.idx; return e; });
console.log(`[bake] layers: ${layers.map((l) => `${l.kind}:${l.name}`).join(', ')}`);

// ─── GID resolution ──────────────────────────────────────────────────
function decodeGid(gid) {
  return {
    id: gid & 0x1fffffff,
    flipH: !!(gid & 0x80000000),
    flipV: !!(gid & 0x40000000),
    flipD: !!(gid & 0x20000000),
  };
}
function gidToTile(gid) {
  if (!gid) return null;
  const d = decodeGid(gid);
  if (!d.id) return null;
  let best = null;
  for (const ts of tilesets) {
    if (ts.firstGid <= d.id && (!best || ts.firstGid > best.firstGid)) best = ts;
  }
  if (!best) return null;
  const localId = d.id - best.firstGid;
  // Bounds-check: was added in Phase 1 P3 to catch GIDs pointing at
  // a tileset that failed to load (volcano's broken Unity path
  // reference). The original test trusted the .tsx's declared
  // `tilecount` attribute — but pack authors sometimes set this
  // wrong. Atlas-Props-Sprites.tsx in the ruins pack declares
  // tilecount=641 but contains tile IDs up to 2258. Trusting the
  // declared count silently dropped 237/240 ruins prop placements
  // → ruins shipped with essentially no collision (only 7 of 960
  // cells blocked instead of ~500). Audit playtest report.
  //
  // Better signal: did the tileset actually load tile entries that
  // cover this localId? `ts.tiles` is the parsed `<tile>` map; for
  // image-collection tilesets it has every tile; for grid atlases
  // it's only entries with collision/animation, but the localId
  // for those is still bounded by columns × rows of the source
  // image — which we can derive from `ts.image` dimensions.
  const tsx = best.tsx;
  if (tsx.image && tsx.image.width && tsx.image.height) {
    // Grid-atlas tileset: real bound = (cols * rows) of the source image.
    const cols = tsx.columns || Math.floor(tsx.image.width / tsx.tileWidth);
    const rows = Math.floor(tsx.image.height / tsx.tileHeight);
    if (cols > 0 && rows > 0 && localId >= cols * rows) return null;
  } else if (tsx.tiles && tsx.tiles.size > 0) {
    // Image-collection tileset: only the explicitly-defined tile IDs
    // are valid. Reject gids whose localId has no corresponding entry.
    if (!tsx.tiles.has(localId)) return null;
  } else if (tsx.tileCount && localId >= tsx.tileCount) {
    // No image, no tiles map — fall back to the declared tilecount.
    return null;
  }
  return { tileset: best, localId, ...d };
}

// ─── Image cache ─────────────────────────────────────────────────────
const imgCache = new Map();
async function loadImg(path) {
  if (imgCache.has(path)) return imgCache.get(path);
  const buf = await readFile(path);
  imgCache.set(path, buf);
  return buf;
}

// Slice a tile from a grid atlas, applying flip flags.
async function sliceGridTile(ts, localId, flipH, flipV, flipD) {
  const cols = ts.columns;
  const col = localId % cols;
  const row = (localId / cols) | 0;
  const sx = col * ts.tileWidth;
  const sy = row * ts.tileHeight;
  const buf = await loadImg(resolve(ts.sourceDir, ts.image.source));
  let pipe = sharp(buf).extract({ left: sx, top: sy, width: ts.tileWidth, height: ts.tileHeight });
  if (flipH) pipe = pipe.flop();
  if (flipV) pipe = pipe.flip();
  if (flipD) pipe = pipe.rotate(90).flop();
  return pipe.png().toBuffer();
}

// Load a per-tile image (image collection), applying flips.
async function loadCollectionTile(ts, localId, flipH, flipV, flipD) {
  const tile = ts.tiles.get(localId);
  if (!tile || !tile.source) return null;
  let pipe = sharp(resolve(ts.sourceDir, tile.source));
  if (flipH) pipe = pipe.flop();
  if (flipV) pipe = pipe.flip();
  if (flipD) pipe = pipe.rotate(90).flop();
  return pipe.png().toBuffer();
}

// Is this resolved tile animated? (returns the animation frame list or null)
function getAnimation(resolved) {
  const tile = resolved.tileset.tsx.tiles.get(resolved.localId);
  return tile && tile.animation ? tile.animation : null;
}

// ─── Helpers shared by PASS 1 (need to be hoisted above loops) ──────

// Detect "blocking" object-layer props by source filename.
// Pack-by-pack patterns observed:
//   Crypt:    coffin - vertical - 1.png, statue 3.png, throne 2.png
//   Cemetery: crypt - 1.png (mausoleum building), tombstone-N.png,
//             crypt details - statue 1.png
//   Village:  (TBD) — house-N.png, wall-section-N.png
//
// The regex matches structural-prop name patterns. Match anchors to
// dash-or-space-or-start to avoid false positives like "tableware"
// matching "table". Additions safe because we OR across all known
// blocking categories.
// Match against EITHER:
//   1. The per-tile source filename (image-collection tilesets)
//   2. The whole-tileset image filename (grid-atlas tilesets)
// Patterns observed across Crypt + Cemetery packs:
//   `Abandoned Structures Elements_50.png` — full mausoleum building
//   `fences.png` (grid atlas) — fence segments
//   `crypt - N.png`, `tombstone - N.png`, `tree - darker - N.png`
const BLOCKING_PROP_RE = /(?:^|[\s\-/_])(coffin|sarcophagus|statue|bench|throne|altar|crate|barrel|cross|chair|table|crypt|mausoleum|tomb|tombstone|gravestone|grave[\s-]marker|wagon|cart|chest|pillar|column|obelisk|fountain|well|tree|trunk|tree[\s-]?stump|skull[\s-]?in[\s-]?a[\s-]?spike|abandoned[\s-]?structures?|fence|fences|stone[\s-]?fence|building|structure|hut|shack)/i;

function isBlockingProp(resolved) {
  const ts = resolved.tileset.tsx;
  const tile = ts.tiles.get(resolved.localId);
  // Image-collection tile — check per-tile source.
  if (tile && tile.source) return BLOCKING_PROP_RE.test(tile.source);
  // Grid-atlas tile — check the whole-tileset image filename.
  // Handles cases like fences.png placed through Tiled's atlas picker.
  if (ts.image && ts.image.source) return BLOCKING_PROP_RE.test(ts.image.source);
  return false;
}

// ── Detect gameplay_* layers — Zone 1 walkability contract ─────────
// If the artist (or our generator) added explicit gameplay_* objectgroups,
// they are AUTHORITATIVE for collision/spawn/transitions/stairs. The
// heuristic prop-bbox + walls-layer inference is skipped when
// gameplayCollisionAuthoritative is true.
//
// Layer naming contract:
//   gameplay_collision   → rectangles that BLOCK movement
//   gameplay_walkable    → rectangles defining playable bounds
//                          (anything OUTSIDE these blocks if non-empty)
//   gameplay_stairs      → rectangles with type=stairs + properties
//                          (fromElevation, toElevation, direction)
//   gameplay_spawns      → rectangles with type=player_spawn / spawnId
//   gameplay_transitions → rectangles with type=transition + properties
//                          (targetMap, targetSpawn)
const gameplayCollisionLayer  = layers.find((l) => l.kind === 'objects' && l.name === 'gameplay_collision');
const gameplayWalkableLayer   = layers.find((l) => l.kind === 'objects' && l.name === 'gameplay_walkable');
const gameplayStairsLayer     = layers.find((l) => l.kind === 'objects' && l.name === 'gameplay_stairs');
const gameplaySpawnsLayer     = layers.find((l) => l.kind === 'objects' && l.name === 'gameplay_spawns');
const gameplayTransitionsLayer = layers.find((l) => l.kind === 'objects' && l.name === 'gameplay_transitions');
const gameplayCollisionAuthoritative = !!(gameplayCollisionLayer && gameplayCollisionLayer.objects.length > 0);

if (gameplayCollisionAuthoritative) {
  console.log(`[bake] ✓ gameplay_collision layer present (${gameplayCollisionLayer.objects.length} rects). Heuristic prop/wall inference SKIPPED for this map.`);
} else {
  console.warn(`[bake] WARN: no gameplay_collision layer. Falling back to heuristic prop/wall inference. Author one in Tiled to make collision authoritative.`);
}

// ─── PASS 1: collect animated props + per-cell collision shapes ──────

const animatedProps = [];     // { x, y, w, h, animKey: <unique id> }
const animationsByKey = new Map();   // animKey → frames meta + stable atlas index list
const collisionByCell = new Map();   // "tx,ty" → [rects in cell-local px]

function cellKey(tx, ty) { return `${tx},${ty}`; }

function recordCellCollision(tx, ty, rects) {
  if (!rects || !rects.length) return;
  const k = cellKey(tx, ty);
  let arr = collisionByCell.get(k);
  if (!arr) { arr = []; collisionByCell.set(k, arr); }
  for (const r of rects) arr.push({ x: r.x, y: r.y, w: r.w, h: r.h });
}

function makeAnimKey(tilesetIdx, localId, flipH, flipV) {
  return `${tilesetIdx}_${localId}_${flipH ? 'h' : ''}${flipV ? 'v' : ''}`;
}

// Helpers — translate source-map coords to OUTPUT coords (subtract crop offset).
const OX = (tx) => tx - X0;
const OY = (ty) => ty - Y0;

for (const layer of layers) {
  if (layer.kind === 'tile') {
    for (let y = Y0; y < Y0 + H; y++) {
      for (let x = X0; x < X0 + W; x++) {
        if (y < 0 || y >= layer.height || x < 0 || x >= layer.width) continue;
        const gid = layer.data[y * layer.width + x];
        if (!gid) continue;
        const r = gidToTile(gid);
        if (!r) continue;

        // Per-tile collision (output cell coords) — SKIPPED when
        // gameplay_collision is authoritative. The .tsx-defined sub-tile
        // rects are still author intent, but Zone 1's contract says
        // gameplay_collision is the SOLE source of truth so the player
        // can reason about collision without reading every tileset.
        const tileMeta = r.tileset.tsx.tiles.get(r.localId);
        if (!gameplayCollisionAuthoritative && tileMeta && tileMeta.collision) {
          const tw = r.tileset.tsx.tileWidth;
          const th = r.tileset.tsx.tileHeight;
          const transformed = tileMeta.collision.map((rect) => {
            let { x: rx, y: ry, w: rw, h: rh } = rect;
            if (r.flipH) rx = tw - rx - rw;
            if (r.flipV) ry = th - ry - rh;
            return { x: rx, y: ry, w: rw, h: rh };
          });
          recordCellCollision(OX(x), OY(y), transformed);
        }

        // Animation (output pixel coords)
        const anim = getAnimation(r);
        if (anim) {
          const tsIdx = tilesets.indexOf(r.tileset);
          const key = makeAnimKey(tsIdx, r.localId, r.flipH, r.flipV);
          animatedProps.push({
            x: OX(x) * TW,
            y: OY(y) * TH,
            w: r.tileset.tsx.tileWidth,
            h: r.tileset.tsx.tileHeight,
            animKey: key,
            flipH: r.flipH,
            flipV: r.flipV,
          });
          if (!animationsByKey.has(key)) {
            animationsByKey.set(key, { tilesetIdx: tsIdx, frames: anim });
          }
        }
      }
    }
  } else if (layer.kind === 'objects') {
    for (const obj of layer.objects) {
      const r = gidToTile(obj.gid);
      if (!r) continue;
      const srcDx = Math.round(obj.x);
      const srcDy = Math.round(obj.y - obj.height);
      const dw = Math.round(obj.width);
      const dh = Math.round(obj.height);
      // Filter: object must intersect crop region.
      const cellX0 = X0 * TW, cellY0 = Y0 * TH;
      const cellX1 = (X0 + W) * TW, cellY1 = (Y0 + H) * TH;
      if (srcDx + dw <= cellX0 || srcDx >= cellX1) continue;
      if (srcDy + dh <= cellY0 || srcDy >= cellY1) continue;
      // Shift to output coords.
      const dx = srcDx - cellX0;
      const dy = srcDy - cellY0;

      const anim = getAnimation(r);
      if (anim) {
        const tsIdx = tilesets.indexOf(r.tileset);
        const key = makeAnimKey(tsIdx, r.localId, r.flipH, r.flipV);
        animatedProps.push({
          x: dx, y: dy, w: dw, h: dh,
          animKey: key, flipH: r.flipH, flipV: r.flipV,
        });
        if (!animationsByKey.has(key)) {
          animationsByKey.set(key, { tilesetIdx: tsIdx, frames: anim });
        }
      }

      // Heuristic prop-bbox collision — SKIPPED if gameplay_collision is
      // authoritative. The artist's gameplay_collision rects are the
      // source of truth; props don't auto-block by filename match.
      if (!gameplayCollisionAuthoritative && isBlockingProp(r)) {
        const x0 = dx, y0 = dy, x1 = dx + dw, y1 = dy + dh;
        const cx0 = Math.floor(x0 / TW);
        const cy0 = Math.floor(y0 / TH);
        const cx1 = Math.floor((x1 - 1) / TW);
        const cy1 = Math.floor((y1 - 1) / TH);
        for (let cy = cy0; cy <= cy1; cy++) {
          for (let cx = cx0; cx <= cx1; cx++) {
            if (cx < 0 || cx >= W || cy < 0 || cy >= H) continue;
            const cellPx0 = cx * TW, cellPy0 = cy * TH;
            const lx = Math.max(0, x0 - cellPx0);
            const ly = Math.max(0, y0 - cellPy0);
            const lx1 = Math.min(TW, x1 - cellPx0);
            const ly1 = Math.min(TH, y1 - cellPy0);
            if (lx < lx1 && ly < ly1) {
              recordCellCollision(cx, cy, [{ x: lx, y: ly, w: lx1 - lx, h: ly1 - ly }]);
            }
          }
        }
      }
    }
  }
}
console.log(`[bake] animated props: ${animatedProps.length} placements, ${animationsByKey.size} unique animations`);
console.log(`[bake] collision cells (per-tile shapes): ${collisionByCell.size}`);

// ── Stamp gameplay_collision rects directly into collisionByCell ─────
// When gameplay_collision is authoritative, these rects are the ONLY
// source of cell-level collision (PASS A's prop-bbox stamping was
// already skipped above). Each rect spans 1+ cells; we stamp full
// cell coverage (no sub-tile geometry) so the runtime tile classifier
// reads them as full walls. Coordinates assume the source TMX origin
// is (0,0) — for cropped maps we'd need to subtract X0/Y0 but Zone 1
// doesn't crop so this works directly.
if (gameplayCollisionAuthoritative) {
  let stamped = 0;
  for (const obj of gameplayCollisionLayer.objects) {
    const x0 = Math.round(obj.x);
    const y0 = Math.round(obj.y);
    const x1 = Math.round(obj.x + obj.width);
    const y1 = Math.round(obj.y + obj.height);
    const cx0 = Math.floor(x0 / TW);
    const cy0 = Math.floor(y0 / TH);
    const cx1 = Math.floor((x1 - 1) / TW);
    const cy1 = Math.floor((y1 - 1) / TH);
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        if (cx < 0 || cx >= W || cy < 0 || cy >= H) continue;
        // Stamp full-cell rect — gameplay_collision is by design
        // tile-aligned, no sub-tile geometry expected.
        recordCellCollision(cx, cy, [{ x: 0, y: 0, w: TW, h: TH }]);
        stamped++;
      }
    }
  }
  console.log(`[bake] gameplay_collision stamped ${stamped} cells from ${gameplayCollisionLayer.objects.length} rects`);
}

// ─── PASS 2: render the STATIC composite (skipping animated tiles) ───
console.log('[bake] rendering static composite...');
const composites = [];

async function getStaticTileBuffer(r) {
  const ts = r.tileset.tsx;
  if (ts.image) {
    return sliceGridTile(ts, r.localId, r.flipH, r.flipV, r.flipD);
  }
  return loadCollectionTile(ts, r.localId, r.flipH, r.flipV, r.flipD);
}

for (const layer of layers) {
  if (layer.kind === 'tile') {
    for (let y = Y0; y < Y0 + H; y++) {
      for (let x = X0; x < X0 + W; x++) {
        if (y < 0 || y >= layer.height || x < 0 || x >= layer.width) continue;
        const gid = layer.data[y * layer.width + x];
        if (!gid) continue;
        const r = gidToTile(gid);
        if (!r) continue;
        if (getAnimation(r)) continue;
        const tile = await getStaticTileBuffer(r);
        if (tile) composites.push({ input: tile, top: OY(y) * TH, left: OX(x) * TW });
      }
    }
  } else if (layer.kind === 'objects') {
    for (const obj of layer.objects) {
      const r = gidToTile(obj.gid);
      if (!r) continue;
      if (getAnimation(r)) continue;
      const ts = r.tileset.tsx;
      const srcDx = Math.round(obj.x);
      const srcDy = Math.round(obj.y - obj.height);
      const targetW = Math.round(obj.width);
      const targetH = Math.round(obj.height);
      const cellX0 = X0 * TW, cellY0 = Y0 * TH;
      const cellX1 = (X0 + W) * TW, cellY1 = (Y0 + H) * TH;
      if (srcDx + targetW <= cellX0 || srcDx >= cellX1) continue;
      if (srcDy + targetH <= cellY0 || srcDy >= cellY1) continue;
      const dx = srcDx - cellX0;
      const dy = srcDy - cellY0;
      let tile = await getStaticTileBuffer(r);
      if (!tile) continue;
      const refW = ts.image ? ts.tileWidth : (ts.tiles.get(r.localId)?.width || ts.tileWidth);
      const refH = ts.image ? ts.tileHeight : (ts.tiles.get(r.localId)?.height || ts.tileHeight);
      if (targetW !== refW || targetH !== refH) {
        tile = await sharp(tile).resize(targetW, targetH, { kernel: 'nearest' }).png().toBuffer();
      }
      composites.push({ input: tile, top: dy, left: dx });
    }
  }
}
console.log(`[bake] static composites: ${composites.length}`);

await mkdir(dirname(OUT_PNG), { recursive: true });
let canvas = await sharp({
  create: { width: W * TW, height: H * TH, channels: 4, background: { r: 12, g: 8, b: 6, alpha: 1 } },
}).png().toBuffer();
const CHUNK = 200;
for (let i = 0; i < composites.length; i += CHUNK) {
  canvas = await sharp(canvas).composite(composites.slice(i, i + CHUNK)).png().toBuffer();
}
await writeFile(OUT_PNG, canvas);
console.log(`[bake] ${OUT_PNG}  (${W * TW}×${H * TH})`);

// ─── PASS 3: render the ANIMATION ATLAS ──────────────────────────────
// One row per unique animation; each frame is a cell in that row.
// Engine looks up frames as (animIdx * tileH, frameIdx * tileW).
console.log('[bake] rendering animation atlas...');

// All animations must share the SAME cell size in the atlas. Find max.
let maxW = 0, maxH = 0;
const animKeys = [...animationsByKey.keys()];
const animMeta = [];     // ordered list of { key, frames: [{ duration, atlasCol }] }

// Pre-resolve all frame buffers + max dims.
const frameBuffers = new Map();   // key = `${animKey}_${frameIdx}` → buffer
for (const key of animKeys) {
  const a = animationsByKey.get(key);
  const ts = tilesets[a.tilesetIdx].tsx;
  const frames = [];
  for (let i = 0; i < a.frames.length; i++) {
    const f = a.frames[i];
    let buf;
    if (ts.image) {
      buf = await sliceGridTile(ts, f.tileid, false, false, false);
      maxW = Math.max(maxW, ts.tileWidth);
      maxH = Math.max(maxH, ts.tileHeight);
    } else {
      buf = await loadCollectionTile(ts, f.tileid, false, false, false);
      const t = ts.tiles.get(f.tileid);
      maxW = Math.max(maxW, t ? t.width : ts.tileWidth);
      maxH = Math.max(maxH, t ? t.height : ts.tileHeight);
    }
    if (!buf) continue;
    frameBuffers.set(`${key}_${i}`, buf);
    frames.push({ duration: f.duration, frameIdx: i });
  }
  animMeta.push({ key, frames });
}

// Pad cell size up to power-of-2-ish for cleaner atlas dims (optional).
console.log(`[bake] anim cell: ${maxW}×${maxH}, ${animKeys.length} animations`);

// Lay out atlas: row per animation, column per frame. If there are NO
// animations in this room, fall through to a 1×1 placeholder atlas so
// the runtime engine has something to load (it just never gets used).
let maxFramesPerAnim = 0;
for (const a of animMeta) maxFramesPerAnim = Math.max(maxFramesPerAnim, a.frames.length);
const atlasW = Math.max(1, maxFramesPerAnim * maxW);
const atlasH = Math.max(1, animMeta.length * maxH);

const atlasComposites = [];
animMeta.forEach((a, animIdx) => {
  for (const f of a.frames) {
    const buf = frameBuffers.get(`${a.key}_${f.frameIdx}`);
    if (!buf) continue;
    atlasComposites.push({
      input: buf,
      top: animIdx * maxH,
      left: f.frameIdx * maxW,
    });
  }
});

let atlasCanvas = await sharp({
  create: { width: atlasW, height: atlasH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
}).png().toBuffer();
for (let i = 0; i < atlasComposites.length; i += CHUNK) {
  atlasCanvas = await sharp(atlasCanvas).composite(atlasComposites.slice(i, i + CHUNK)).png().toBuffer();
}
await writeFile(OUT_ANIMS_PNG, atlasCanvas);
console.log(`[bake] ${OUT_ANIMS_PNG}  (${atlasW}×${atlasH})`);

// ─── Build runtime metadata JSON ─────────────────────────────────────
// Animations stored as ordered list — index = atlas row.
const animations = animMeta.map((a, animIdx) => ({
  row: animIdx,
  frames: a.frames.map((f) => ({ col: f.frameIdx, duration: f.duration })),
}));
const animKeyToIdx = new Map();
animMeta.forEach((a, i) => animKeyToIdx.set(a.key, i));

// Build wall-cell collision map.
//
// Pack layer-name conventions (intent inferred from inspecting both
// Crypt and Cemetery Sample Map structures — the artist uses layer
// NAMES as the collision contract):
//
//   BLOCK (player can't walk):
//     wall-*, wall-1-2-3              — structural walls
//     balluster-*                     — railings/balustrades
//     pillar*                         — pillars
//     fences, fence-*, stone-fences*  — perimeter fencing
//     hole*, holes-*                  — open pits / dug graves
//
//   WALK (skipped from collision):
//     terrain*                        — base ground (incl. terrain1-floor2)
//     wall-details, wall-details2     — decorative overhead trim
//
// For each blocker-layer cell, prefer per-tile <objectgroup> shapes
// from the .tsx if present (sub-tile arch passages). Fall back to
// full-cell wall if no shape is defined.
const blockerLayers = layers.filter((l) =>
  l.kind === 'tile' && (
    // Match "wall", "walls", "wall-1", "wall 1", "mountain wall", "side wall".
    // (?:^|[\s-]) start-of-name OR after space/hyphen, then walls? as a word.
    /(?:^|[\s-])walls?(?:$|[\s-])/i.test(l.name)
    || /^balluster/i.test(l.name)           // balluster railings
    || /^pillar/i.test(l.name)              // pillars
    || /^(stone[-\s]?)?fence/i.test(l.name) // fences (cemetery, etc.)
    || /^holes?[-\s]?/i.test(l.name)        // holes, hole-1, holes-1-2-3
    || /^lava\b/i.test(l.name)              // volcano: lava, lava passage, lava river
  )
).filter((l) => !/details/i.test(l.name));   // EXCLUDE wall-details/2 trim

// Elevated-tier layers — surfaces drawn on top of buildings + stair
// platforms. CONDITIONAL block: a wall under an elevated tile is a
// retaining-wall facade (walkable platform top). With no wall under,
// it's a stair / outdoor platform — walkable. Lets the player walk
// up stairs onto raised platforms without walking on rooftops.
//   floor[2-9]    cemetery    (terrain1-floor2)
//   platform[*]   ruins       (platform, platform-details)
//   plat[s][*]    mountain    (plats, plats-details)
//   plat[N]       volcano     (plat, plat2)
const elevatedTierLayers = layers.filter((l) =>
  l.kind === 'tile' && (
    /floor[2-9]/i.test(l.name)
    || /^plat(?:form|s)?(?:$|[\s\-\d])/i.test(l.name)
  )
);
console.log(`[bake] elevated-tier layers (conditional block): ${elevatedTierLayers.map((l) => l.name).join(', ') || '(none)'}`);
console.log(`[bake] structural blocker layers: ${blockerLayers.map((l) => l.name).join(', ')}`);

// (BLOCKING_PROP_RE + isBlockingProp hoisted earlier — see PASS 1
// helpers section above.)

const collisionGrid = [];
for (let oy = 0; oy < H; oy++) {
  const row = [];
  for (let ox = 0; ox < W; ox++) {
    // collisionByCell was already populated using OUTPUT coords above.
    const rects = collisionByCell.get(cellKey(ox, oy));
    if (rects && rects.length) {
      row.push({ rects });
      continue;
    }
    // Map output cell back to source cell to query blocker layers.
    const sx = ox + X0, sy = oy + Y0;

    // PASS A: any blocker layer has a placed tile at this cell?
    //
    // Two artist conventions to respect here:
    //
    //   1. TERRAIN-IN-WALL-LAYER = walkable. The artist drops terrain
    //      tiles into wall layers to draw stairs / decorative ground
    //      ON TOP of regular ground. Detect via tileset name match
    //      `/terrain/i` and skip.
    //
    //   2. RETAINING-WALL FACADE under upper platforms = walkable.
    //      When a cell has BOTH wall-* AND floor2 tiles, the wall
    //      tile is the retaining wall drawn for the lower-tier viewer
    //      — the floor2 tile IS the upper-platform's walking surface.
    //      Without this, the platform-top reads as "roof" and blocks.
    //      Buildings stay blocked because they're placed as full-bbox
    //      object props with BLOCKING_PROP_RE matching the source name.
    let hasBlockerLayerTile = false;
    let hasFloor2Here = false;
    // PASS B blocker-layer inference is also gated on gameplay_collision.
    // Skip the entire walls-layer scan when authoritative gameplay
    // data is present.
    if (gameplayCollisionAuthoritative) {
      // Cell collision was already populated above by stamping
      // gameplay_collision rects. Just respect the existing entries.
      // Fall through to the row.push() below.
    } else {
    // Scan elevated-tier layers FIRST so we know if floor2 is set.
    for (const layer of elevatedTierLayers) {
      if (sx < 0 || sx >= layer.width || sy < 0 || sy >= layer.height) continue;
      const gid = layer.data[sy * layer.width + sx] & 0x1fffffff;
      if (gid !== 0) {
        const r = gidToTile(layer.data[sy * layer.width + sx]);
        if (r && !getAnimation(r)) { hasFloor2Here = true; break; }
      }
    }
    for (const layer of blockerLayers) {
      if (sx < 0 || sx >= layer.width || sy < 0 || sy >= layer.height) continue;
      const gid = layer.data[sy * layer.width + sx] & 0x1fffffff;
      if (gid === 0) continue;
      const r = gidToTile(layer.data[sy * layer.width + sx]);
      if (!r || getAnimation(r)) continue;
      const tsName = (r.tileset.tsx.name || '').toLowerCase();
      const isTerrainSource = /terrain/i.test(tsName);
      if (isTerrainSource) continue;
      // Convention #2 — wall under floor2 is a retaining wall facade.
      // Skip blocking, the upper-platform surface (floor2) is walkable.
      if (hasFloor2Here) continue;
      hasBlockerLayerTile = true;
      break;
    }
    }   // end of `else { /* heuristic blocker-layer inference */ }`

    // ELEVATED TIER (terrain1-floor2): always WALKABLE.
    //
    // Earlier we tried to detect "roof of a building" via the rule
    // (wall + elevated = roof). That broke upper graveyard platforms
    // where the artist places retaining walls UNDER the platform tier
    // — those wall tiles are the lower-tier-facing facade, not actual
    // walls under a roof. Mistaking them for roofs blocked the entire
    // upper platform.
    //
    // Better: trust the artist's OBJECT-LAYER placements for buildings.
    // The "Abandoned Structures Elements" prop (or "crypt - N", or any
    // matching BLOCKING_PROP_RE entry) is placed as a full-bbox object
    // covering the whole building footprint. PASS 1 already stamped
    // collision rects across that bbox. So a roof cell that's part of
    // a real building is already blocked by the prop's bbox, and a
    // raised-platform cell with no building object placed on it stays
    // walkable. This matches artist intent across both Crypt and
    // Cemetery packs.
    //
    // Result: structural walls block, props block their bbox, terrain
    // (wall layer + terrain tileset) walks, elevated tier walks.
    if (hasBlockerLayerTile) {
      row.push({ rects: [{ x: 0, y: 0, w: TW, h: TH }] });
    } else {
      row.push(null);
    }
  }
  collisionGrid.push(row);
}

// Largest connected walkable component (for spawn point + JSON metadata).
//
// Phase 5 unification (audit W4) — STRICT rule. Previously the bake
// counted sub-tile-rect cells as walkable (since there's open space in
// them at the rect-test level), but the runtime's `loadBakedZone` tile
// classifier treats ANY rects as a wall:
//
//   tileRow[x] = (cell && cell.rects && cell.rects.length) ? 'wall' : 'floor';
//
// The mismatch caused JSON componentCount + largestComponentSize to
// disagree with what the player actually experiences. Now both sides
// agree: any cell with rects is treated as blocked for graph connectivity.
// The cell-local rects in the JSON are still authoritative for runtime
// point-in-rect collision; this rule only affects connected-component
// analysis + the spawn centroid pick + the metadata reported in JSON.
function isCellWalkable(x, y) {
  const cell = collisionGrid[y][x];
  if (!cell) return true;
  // STRICT: any rects = blocked at the tile level.
  if (cell.rects && cell.rects.length > 0) return false;
  return true;
}
const componentId = Array.from({ length: H }, () => new Array(W).fill(-1));
const components = [];
let nextId = 0;
for (let y0 = 0; y0 < H; y0++) {
  for (let x0 = 0; x0 < W; x0++) {
    if (!isCellWalkable(x0, y0) || componentId[y0][x0] !== -1) continue;
    const queue = [[x0, y0]];
    componentId[y0][x0] = nextId;
    const cells = [];
    while (queue.length) {
      const [x, y] = queue.shift();
      cells.push([x, y]);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        if (componentId[ny][nx] !== -1) continue;
        if (!isCellWalkable(nx, ny)) continue;
        componentId[ny][nx] = nextId;
        queue.push([nx, ny]);
      }
    }
    components.push({ id: nextId, size: cells.length, cells });
    nextId++;
  }
}
components.sort((a, b) => b.size - a.size);
console.log(`[bake] connected walkable components: ${components.length}`);
console.log(`[bake] sizes: ${components.slice(0, 5).map((c) => c.size).join(', ')}${components.length > 5 ? ', ...' : ''}`);

// Phase 5 (audit W4) — sanity warning. If the largest component covers
// less than 30% of the map, the level likely has unreachable islands or
// over-aggressive collision. Pattern lifted from roomShells.js where the
// same BFS pre-validation was used to reject bad procedural shells.
const totalWalkable = components.reduce((acc, c) => acc + c.size, 0);
const W_TOTAL = W * H;
const mainRatio = totalWalkable > 0 ? components[0].size / W_TOTAL : 0;
if (components.length > 5) {
  console.warn(`[bake] WARN: ${components.length} disconnected components — likely island fragments. Consider closing gaps in the .tmx.`);
}
if (mainRatio < 0.30) {
  console.warn(`[bake] WARN: largest component is only ${(mainRatio * 100).toFixed(1)}% of the map. Sparse playable area or over-blocked walls.`);
}

const biggest = components[0];
let cxSum = 0, cySum = 0;
for (const [x, y] of biggest.cells) { cxSum += x; cySum += y; }
const sxR = Math.round(cxSum / biggest.size);
const syR = Math.round(cySum / biggest.size);
let spawn = (componentId[syR] && componentId[syR][sxR] === biggest.id)
  ? { x: sxR, y: syR }
  : { x: biggest.cells[0][0], y: biggest.cells[0][1] };

// ── Override spawn from gameplay_spawns if present ──────────────────
// The artist-authored `spawn_player` object wins over the heuristic
// centroid pick. Coords in TMX are top-left of the bbox; convert to
// the cell containing the bbox's center.
let spawnObj = null;
if (gameplaySpawnsLayer) {
  spawnObj = gameplaySpawnsLayer.objects.find(
    (o) => o.type === 'player_spawn' || o.properties?.type === 'player_spawn',
  );
}
if (spawnObj) {
  const cxPx = spawnObj.x + (spawnObj.width || TW) / 2;
  const cyPx = spawnObj.y + (spawnObj.height || TH) / 2;
  spawn = { x: Math.floor(cxPx / TW), y: Math.floor(cyPx / TH) };
  console.log(`[bake] spawn from gameplay_spawns spawn_player → (${spawn.x}, ${spawn.y})`);
} else if (gameplayCollisionAuthoritative) {
  console.warn(`[bake] WARN: gameplay_collision present but no spawn_player in gameplay_spawns. Using centroid fallback (${spawn.x}, ${spawn.y}).`);
} else {
  console.log(`[bake] spawn cell (centroid): (${spawn.x}, ${spawn.y})`);
}

// ── Extract gameplay metadata for runtime ──────────────────────────
const gameplay = {};
if (gameplayCollisionLayer) {
  gameplay.collisionRects = gameplayCollisionLayer.objects.map((o) => ({
    x: o.x, y: o.y, w: o.width, h: o.height,
  }));
}
if (gameplayWalkableLayer && gameplayWalkableLayer.objects.length > 0) {
  gameplay.walkableRects = gameplayWalkableLayer.objects.map((o) => ({
    x: o.x, y: o.y, w: o.width, h: o.height,
  }));
}
if (gameplayStairsLayer && gameplayStairsLayer.objects.length > 0) {
  gameplay.stairs = gameplayStairsLayer.objects.map((o) => ({
    x: o.x, y: o.y, w: o.width, h: o.height,
    fromElevation: parseInt(o.properties?.fromElevation, 10) || 0,
    toElevation:   parseInt(o.properties?.toElevation, 10) || 1,
    direction:     o.properties?.direction || 'north',
  }));
}
if (gameplayTransitionsLayer && gameplayTransitionsLayer.objects.length > 0) {
  gameplay.transitions = gameplayTransitionsLayer.objects.map((o) => ({
    x: o.x, y: o.y, w: o.width, h: o.height,
    targetMap:   o.properties?.targetMap || '',
    targetSpawn: o.properties?.targetSpawn || 'start',
    name:        o.name || 'exit',
  }));
}
const gameplayAuthoritative = gameplayCollisionAuthoritative;
console.log(`[bake] gameplay layers: collision=${gameplay.collisionRects?.length || 0} walkable=${gameplay.walkableRects?.length || 0} stairs=${gameplay.stairs?.length || 0} transitions=${gameplay.transitions?.length || 0}`);

// Resolve animated props' animKey → row index in animations[].
const animatedPropsOut = animatedProps.map((p) => ({
  x: p.x, y: p.y, w: p.w, h: p.h,
  animRow: animKeyToIdx.get(p.animKey),
  flipH: p.flipH, flipV: p.flipV,
}));

const meta = {
  source: TMX_PATH,
  width: W,
  height: H,
  tileSize: TW,
  imageWidth: W * TW,
  imageHeight: H * TH,
  collisionGrid,             // per-cell rects (in tile-local px coords)
  animationAtlas: {
    src: OUT_ANIMS_PNG.replace(/^public\//, ''),
    cellWidth: maxW,
    cellHeight: maxH,
  },
  animations,                // [{ row, frames: [{col, duration}] }]
  animatedProps: animatedPropsOut,
  spawn,
  componentCount: components.length,
  largestComponentSize: biggest.size,
  // Zone 1 walkability contract — when these arrays are present, the
  // runtime should treat them as authoritative (collision/walkable/
  // stairs/transitions/spawn). When absent, the runtime falls back
  // to the heuristic collisionGrid (which itself was derived from
  // layer-name + prop-filename guessing).
  gameplay,
  gameplayAuthoritative,
};

await writeFile(OUT_JSON, JSON.stringify(meta));
const jsonSize = (await readFile(OUT_JSON)).length;
console.log(`[bake] ${OUT_JSON}  (${(jsonSize / 1024).toFixed(1)} KB)`);

console.log('\n✓ baked. ready for engine wiring.');
