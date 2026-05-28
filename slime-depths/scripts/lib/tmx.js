// Minimal Tiled Map Editor (.tmx + .tsx) parser.
//
// The Epic RPG World packs ship example maps as .tmx XML files plus
// tileset metadata as .tsx XML files. Parsing these gives us:
//   - Composed reference rooms (the artist's intended composition)
//   - Tileset metadata (tile size, columns, image source)
//   - Tile-variation rules for autotile (probability weights per cell)
//   - Tile-collision objects (per-tile shape data, useful for our
//     wall/floor distinction)
//
// We only support the subset of Tiled features the Epic RPG World
// packs use:
//   - Orthogonal maps (no isometric/hex)
//   - CSV tile-data encoding (NOT base64-zlib — the artist's .tmx
//     files use CSV which is human-readable and trivial to parse)
//   - External tilesets via <tileset source="..."/> references
//
// We do NOT support:
//   - Object layers (we use props as PNGs not Tiled objects)
//   - Image layers
//   - Wang sets (we'll do our own autotile picker)
//   - Compressed tile data
//
// This parser is meant to be called at boot time in loader.js, not
// every frame. Output is pure data — no canvas / DOM dependencies.

/**
 * Parse a .tmx map file.
 *
 * @param {string} src  Asset path (e.g. 'assets/packs/crypt/tmx/Crypt example map.tmx')
 * @returns {Promise<TmxMap>}
 *   {
 *     width, height,    // map size in tiles
 *     tileWidth, tileHeight,  // tile size in pixels
 *     tilesets: [{firstGid, source}],  // referenced .tsx files
 *     layers: [{name, width, height, data: number[]}],  // tile IDs, 0 = empty
 *   }
 */
export async function parseTmx(src) {
  const xml = await fetchXml(src);
  const mapEl = xml.documentElement;

  const map = {
    width: int(mapEl.getAttribute('width')),
    height: int(mapEl.getAttribute('height')),
    tileWidth: int(mapEl.getAttribute('tilewidth')),
    tileHeight: int(mapEl.getAttribute('tileheight')),
    tilesets: [],
    layers: [],
  };

  // Tilesets — external references via `source="..."` attribute.
  // Tiled also supports inline tilesets but we won't need that.
  for (const ts of mapEl.querySelectorAll('tileset')) {
    map.tilesets.push({
      firstGid: int(ts.getAttribute('firstgid')),
      source: ts.getAttribute('source'),
    });
  }

  // Layers — only `<layer>` (tile layers); skip `<objectgroup>` and
  // `<imagelayer>`. CSV encoding only.
  for (const layer of mapEl.querySelectorAll('layer')) {
    const dataEl = layer.querySelector('data');
    const encoding = dataEl?.getAttribute('encoding');
    if (encoding && encoding !== 'csv') {
      // eslint-disable-next-line no-console
      console.warn(`parseTmx(${src}): layer "${layer.getAttribute('name')}" uses ${encoding} encoding, only CSV is supported. Skipping.`);
      continue;
    }
    const csv = dataEl?.textContent || '';
    const data = csv
      .split(/[\s,]+/)
      .filter(Boolean)
      .map((s) => parseInt(s, 10) | 0);     // Tiled stores 0 for empty cells
    map.layers.push({
      name: layer.getAttribute('name'),
      width: int(layer.getAttribute('width')),
      height: int(layer.getAttribute('height')),
      data,
    });
  }

  return map;
}

/**
 * Parse a .tsx tileset file.
 *
 * @param {string} src  Asset path (e.g. 'assets/packs/crypt/tmx/tilesets/Tileset-Terrain.tsx')
 * @returns {Promise<TmxTileset>}
 *   {
 *     name,
 *     tileWidth, tileHeight,    // tile size in pixels
 *     tileCount,
 *     columns,
 *     image: { source, width, height },  // path is relative to the .tsx file
 *     tiles: Map<localId, { collision?, probability? }>,  // sparse — only tiles with overrides
 *   }
 */
export async function parseTsx(src) {
  const xml = await fetchXml(src);
  const tsEl = xml.documentElement;

  const ts = {
    name: tsEl.getAttribute('name'),
    tileWidth: int(tsEl.getAttribute('tilewidth')),
    tileHeight: int(tsEl.getAttribute('tileheight')),
    tileCount: int(tsEl.getAttribute('tilecount')),
    columns: int(tsEl.getAttribute('columns')),
    image: null,
    tiles: new Map(),
  };

  const imgEl = tsEl.querySelector('image');
  if (imgEl) {
    ts.image = {
      source: imgEl.getAttribute('source'),
      width: int(imgEl.getAttribute('width')),
      height: int(imgEl.getAttribute('height')),
    };
  }

  // Per-tile data — collision shapes (objectgroup), variation
  // probability, custom properties. Stored sparse in `tiles` Map
  // keyed by tile local ID.
  for (const tile of tsEl.querySelectorAll('tile')) {
    const id = int(tile.getAttribute('id'));
    const entry = {};
    const probAttr = tile.getAttribute('probability');
    if (probAttr) entry.probability = parseFloat(probAttr);
    // Collision objects (Tiled lets the artist drag rects/polygons
    // onto a tile to define its solid area). We extract the AABB
    // bounds — the engine can use these for per-tile collision later.
    const objgroup = tile.querySelector('objectgroup');
    if (objgroup) {
      const objs = [];
      for (const obj of objgroup.querySelectorAll('object')) {
        objs.push({
          x: parseFloat(obj.getAttribute('x') || '0'),
          y: parseFloat(obj.getAttribute('y') || '0'),
          width: parseFloat(obj.getAttribute('width') || '0'),
          height: parseFloat(obj.getAttribute('height') || '0'),
        });
      }
      if (objs.length) entry.collision = objs;
    }
    if (Object.keys(entry).length) ts.tiles.set(id, entry);
  }

  return ts;
}

/**
 * Decode a Tiled GID (global tile ID) — strips flip bits (h-flip,
 * v-flip, diag-flip) and returns the bare local tile ID.
 *
 * Tiled encodes flip flags in the high bits of the GID:
 *   0x80000000 = horizontal flip
 *   0x40000000 = vertical flip
 *   0x20000000 = anti-diagonal flip
 *
 * Most pack maps don't use flipping (the artists ship oriented
 * variants instead), but if you parse a map that does, this helper
 * gives you the clean tile ID to look up in the tileset.
 *
 * @param {number} gid
 * @returns {{ id: number, flipH: boolean, flipV: boolean, flipD: boolean }}
 */
export function decodeGid(gid) {
  return {
    id: gid & 0x1fffffff,
    flipH: !!(gid & 0x80000000),
    flipV: !!(gid & 0x40000000),
    flipD: !!(gid & 0x20000000),
  };
}

// ---- internals ----

async function fetchXml(src) {
  const resp = await fetch(src);
  if (!resp.ok) throw new Error(`tmx: failed to fetch ${src} (${resp.status})`);
  const text = await resp.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'application/xml');
  // DOMParser returns a doc with <parsererror> root if XML is malformed.
  if (doc.querySelector('parsererror')) {
    throw new Error(`tmx: malformed XML in ${src}`);
  }
  return doc;
}

function int(s) {
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : 0;
}
