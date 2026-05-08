// ============================================================================
// ZONE 1 — generate map_001_ancient_ruins.tmx
//
// Reads the artist's untouched Sample scene.tmx + the most recent baked
// ruins_sample.json, and produces a new TMX with explicit gameplay_*
// objectgroups appended:
//
//   • gameplay_collision   — auto-derived rectangles from the current
//                             baked collision (horizontal strips, then
//                             vertical merge for adjacent same-x-range
//                             rows). Starter set the user refines in
//                             Tiled.
//   • gameplay_walkable    — empty (optional; user can add a single
//                             rect to constrain playable bounds)
//   • gameplay_stairs      — empty (user adds stair triggers in Tiled)
//   • gameplay_spawns      — one starter spawn_player at (4, 12) tile
//   • gameplay_transitions — one starter transition at boss tile
//
// The visual layers (terrain*, platform*, walls, waterfall, props-*)
// are copied byte-for-byte from the source. Re-running the bake on
// this new file produces the same beautiful PNG composite.
//
// Usage:  node scripts/zone1-generate-gameplay-tmx.js
// Output: public/assets/packs/ruins/TiledMap Editor/map_001_ancient_ruins.tmx
// ============================================================================

import { readFile, writeFile } from 'node:fs/promises';

const SRC_TMX = 'public/assets/packs/ruins/TiledMap Editor/Sample scene.tmx';
const SRC_JSON = 'public/assets/rooms/ruins_sample.json';
const OUT_TMX = 'public/assets/packs/ruins/TiledMap Editor/map_001_ancient_ruins.tmx';

const SPAWN_TILE = { x: 4, y: 12 };       // hand-picked walkable cell, west entry
const TRANSITION_TILE = { x: 19, y: 12 }; // boss arena center

const srcXml = await readFile(SRC_TMX, 'utf-8');
const meta = JSON.parse(await readFile(SRC_JSON, 'utf-8'));
const W = meta.width, H = meta.height, TS = meta.tileSize;

// ── Step 1: build a strict per-cell blocked grid from the bake ──────────
const blocked = [];
for (let y = 0; y < H; y++) {
  const row = [];
  for (let x = 0; x < W; x++) {
    const cell = meta.collisionGrid[y][x];
    // STRICT: any rects = blocked at the cell level. Matches the
    // runtime's tile classifier in main.js loadBakedZone.
    row.push(!!(cell && cell.rects && cell.rects.length));
  }
  blocked.push(row);
}

// ── Step 2: strip-merge horizontally, then vertically ──────────────────
// First pass: per row, find runs of contiguous blocked cells. Each run
// becomes a candidate rect. Second pass: merge adjacent rows that have
// the SAME x-range run into a single tall rect.
const horizontalStrips = [];   // [{ y, x0, x1 }]  — x1 is inclusive
for (let y = 0; y < H; y++) {
  let x = 0;
  while (x < W) {
    if (!blocked[y][x]) { x++; continue; }
    const x0 = x;
    while (x < W && blocked[y][x]) x++;
    horizontalStrips.push({ y, x0, x1: x - 1 });
  }
}

// Group strips by their (x0, x1) signature, then merge runs of consecutive y.
const byKey = new Map();
for (const s of horizontalStrips) {
  const k = `${s.x0},${s.x1}`;
  if (!byKey.has(k)) byKey.set(k, []);
  byKey.get(k).push(s.y);
}
const mergedRects = [];
for (const [k, ys] of byKey) {
  const [x0, x1] = k.split(',').map(Number);
  ys.sort((a, b) => a - b);
  let runStart = ys[0], runPrev = ys[0];
  for (let i = 1; i <= ys.length; i++) {
    const y = ys[i];
    if (y === runPrev + 1) { runPrev = y; continue; }
    mergedRects.push({ x0, y0: runStart, x1, y1: runPrev });
    runStart = y;
    runPrev = y;
  }
}
console.log(`[gen] strict-blocked cells: ${horizontalStrips.reduce((acc, s) => acc + (s.x1 - s.x0 + 1), 0)}`);
console.log(`[gen] horizontal strips: ${horizontalStrips.length}`);
console.log(`[gen] merged collision rects: ${mergedRects.length}`);

// ── Step 3: build the gameplay_* objectgroup XML ───────────────────────
let nextObjId = 4000;        // start well above the source's nextobjectid (386)
function objectgroupXml(name, objs) {
  const inner = objs.map((o) => o.indent('  ')).join('\n');
  return `<objectgroup id="${nextLayerId++}" name="${name}">
${inner}
 </objectgroup>`;
}
let nextLayerId = 100;       // start well above source nextlayerid (12)

// Build collision rect objects.
const collisionXmls = mergedRects.map((r) => {
  const x = r.x0 * TS;
  const y = r.y0 * TS;
  const w = (r.x1 - r.x0 + 1) * TS;
  const h = (r.y1 - r.y0 + 1) * TS;
  return `  <object id="${nextObjId++}" type="collision" x="${x}" y="${y}" width="${w}" height="${h}">
   <properties>
    <property name="type" value="collision"/>
   </properties>
  </object>`;
});

// Build spawn_player object.
const spawnXml = `  <object id="${nextObjId++}" name="spawn_player" type="spawn_player" x="${SPAWN_TILE.x * TS}" y="${SPAWN_TILE.y * TS}" width="${TS}" height="${TS}">
   <properties>
    <property name="type" value="player_spawn"/>
    <property name="spawnId" value="start"/>
   </properties>
  </object>`;

// Build transition object.
const transitionXml = `  <object id="${nextObjId++}" name="exit" type="transition" x="${TRANSITION_TILE.x * TS}" y="${TRANSITION_TILE.y * TS}" width="${TS}" height="${TS}">
   <properties>
    <property name="type" value="transition"/>
    <property name="targetMap" value="map_002_placeholder"/>
    <property name="targetSpawn" value="start"/>
   </properties>
  </object>`;

// Assemble the new objectgroup blocks.
const collisionGroup = `\n <objectgroup id="${nextLayerId++}" name="gameplay_collision">
${collisionXmls.join('\n')}
 </objectgroup>`;

const walkableGroup = `\n <objectgroup id="${nextLayerId++}" name="gameplay_walkable">
 </objectgroup>`;

const stairsGroup = `\n <objectgroup id="${nextLayerId++}" name="gameplay_stairs">
 </objectgroup>`;

const spawnsGroup = `\n <objectgroup id="${nextLayerId++}" name="gameplay_spawns">
${spawnXml}
 </objectgroup>`;

const transitionsGroup = `\n <objectgroup id="${nextLayerId++}" name="gameplay_transitions">
${transitionXml}
 </objectgroup>`;

const gameplayBlocks = collisionGroup + walkableGroup + stairsGroup + spawnsGroup + transitionsGroup;

// ── Step 4: insert before the closing </map> tag ──────────────────────
// Also bump nextobjectid + nextlayerid in the <map> attributes so Tiled
// doesn't get confused when the user adds new objects.
let outXml = srcXml.replace(
  /<map\s+([^>]+?)>/,
  (m, attrs) => {
    let a = attrs;
    a = a.replace(/nextlayerid="\d+"/, `nextlayerid="${nextLayerId}"`);
    a = a.replace(/nextobjectid="\d+"/, `nextobjectid="${nextObjId}"`);
    return `<map ${a}>`;
  },
);

outXml = outXml.replace(/<\/map>\s*$/, gameplayBlocks + '\n</map>\n');

await writeFile(OUT_TMX, outXml);
console.log(`[gen] wrote ${OUT_TMX}`);
console.log(`[gen] gameplay_collision: ${mergedRects.length} rects`);
console.log(`[gen] gameplay_spawns: 1 (spawn_player at ${SPAWN_TILE.x},${SPAWN_TILE.y})`);
console.log(`[gen] gameplay_transitions: 1 (exit at ${TRANSITION_TILE.x},${TRANSITION_TILE.y})`);
console.log(`[gen] gameplay_walkable, gameplay_stairs: empty (refine in Tiled)`);
