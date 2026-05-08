// Diagnostic: replicate the bake's PASS A object-handling for ruins
// and report how many blocking objects produce collision rects on
// how many cells. Focused diagnostic for "ruins has only 7 blocked
// cells when there are visibly trees + pillars everywhere."
//
// Mimics the regex + tileset loading from bake-crypt-sample-room.js.

import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const TMX = 'public/assets/packs/ruins/TiledMap Editor/Sample scene.tmx';
const xml = await readFile(TMX, 'utf-8');

const BLOCKING_PROP_RE = /(?:^|[\s\-/_])(coffin|sarcophagus|statue|bench|throne|altar|crate|barrel|cross|chair|table|crypt|mausoleum|tomb|tombstone|gravestone|grave[\s-]marker|wagon|cart|chest|pillar|column|obelisk|fountain|well|tree|trunk|tree[\s-]?stump|skull[\s-]?in[\s-]?a[\s-]?spike|abandoned[\s-]?structures?|fence|fences|stone[\s-]?fence|building|structure|hut|shack)/i;

function parseAttrs(s) {
  const out = {};
  for (const m of s.matchAll(/(\w+)="([^"]*)"/g)) out[m[1]] = m[2];
  return out;
}

const tmxDir = dirname(TMX);
const tilesets = [];
for (const m of xml.matchAll(/<tileset\s+([^>]+?)\/>/g)) {
  const a = parseAttrs(m[1]);
  tilesets.push({ firstGid: +a.firstgid, source: a.source });
}

// Load tilesets the same way bake's parseTsx does
const tilesetMaps = [];
for (const ts of tilesets) {
  const tsxPath = resolve(tmxDir, ts.source);
  let tsxXml;
  try { tsxXml = await readFile(tsxPath, 'utf-8'); }
  catch (e) { continue; }
  const sourceMap = {};   // localId → image source
  for (const m of tsxXml.matchAll(/<tile\s+([^>]*?)>([\s\S]*?)<\/tile>/g)) {
    const a = parseAttrs(m[1]);
    const id = +a.id;
    const innerImg = m[2].match(/<image\s+([^>]+?)\/>/);
    if (innerImg) {
      const ia = parseAttrs(innerImg[1]);
      sourceMap[id] = ia.source;
    }
  }
  const headerXml = tsxXml.split('<tile ')[0];
  const headerImg = headerXml.match(/<image\s+([^>]+?)\/>/);
  const tsName = (parseAttrs((tsxXml.match(/<tileset\s+([^>]+?)>/)||[])[1]||'').name) || ts.source;
  tilesetMaps.push({ ...ts, sourceMap, headerSource: headerImg ? parseAttrs(headerImg[1]).source : null, name: tsName });
}

function gidToTile(gid) {
  const id = gid & 0x1fffffff;
  if (!id) return null;
  let best = null;
  for (const ts of tilesetMaps) {
    if (ts.firstGid <= id && (!best || ts.firstGid > best.firstGid)) best = ts;
  }
  if (!best) return null;
  const localId = id - best.firstGid;
  const src = best.sourceMap[localId] || best.headerSource || null;
  return { tileset: best, localId, source: src };
}

function isBlockingProp(r) {
  if (r.source) return BLOCKING_PROP_RE.test(r.source);
  return false;
}

const TW = 32, TH = 32;
const blockedCells = new Set();
let totalObjects = 0, blockingMatches = 0;
for (const ogm of xml.matchAll(/<objectgroup\s+([^>]+?)>([\s\S]*?)<\/objectgroup>/g)) {
  for (const om of ogm[2].matchAll(/<object\s+([^>]+?)\/>/g)) {
    const o = parseAttrs(om[1]);
    if (!o.gid) continue;
    totalObjects++;
    const r = gidToTile(parseInt(o.gid, 10) >>> 0);
    if (!r) { console.warn('  no resolution for gid', o.gid); continue; }
    if (!isBlockingProp(r)) continue;
    blockingMatches++;
    // Replicate PASS A bbox collision stamping
    const srcDx = Math.round(parseFloat(o.x));
    const srcDy = Math.round(parseFloat(o.y) - parseFloat(o.height));
    const dw = Math.round(parseFloat(o.width));
    const dh = Math.round(parseFloat(o.height));
    const x0 = srcDx, y0 = srcDy;
    const x1 = srcDx + dw, y1 = srcDy + dh;
    const cx0 = Math.floor(x0 / TW), cy0 = Math.floor(y0 / TH);
    const cx1 = Math.floor((x1 - 1) / TW), cy1 = Math.floor((y1 - 1) / TH);
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        blockedCells.add(`${cx},${cy}`);
      }
    }
  }
}
console.log(`Total objects: ${totalObjects}`);
console.log(`Blocking matches: ${blockingMatches}`);
console.log(`Cells covered by blocking-prop bboxes: ${blockedCells.size}`);
