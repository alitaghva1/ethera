// Diagnostic: trace isBlockingProp results for every object in ruins TMX.
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
const tilesetMaps = [];
for (const ts of tilesets) {
  const tsxPath = resolve(tmxDir, ts.source);
  let tsxXml;
  try { tsxXml = await readFile(tsxPath, 'utf-8'); }
  catch (e) { console.warn('  tileset missing:', ts.source); continue; }
  const sourceMap = {};
  for (const m of tsxXml.matchAll(/<tile\s+id="(\d+)"[^>]*?>([\s\S]*?)<\/tile>/g)) {
    const id = +m[1];
    const innerImg = m[2].match(/<image\s+[^>]*?source="([^"]+)"/);
    if (innerImg) sourceMap[id] = innerImg[1];
  }
  const headerXml = tsxXml.split('<tile ')[0];
  const headerImg = headerXml.match(/<image\s+[^>]*?source="([^"]+)"/);
  if (headerImg) sourceMap._gridImage = headerImg[1];
  tilesetMaps.push({ ...ts, sourceMap });
}

function gidToSource(gid) {
  const id = gid & 0x1fffffff;
  if (!id) return null;
  let best = null;
  for (const ts of tilesetMaps) {
    if (ts.firstGid <= id && (!best || ts.firstGid > best.firstGid)) best = ts;
  }
  if (!best) return null;
  const localId = id - best.firstGid;
  return best.sourceMap[localId] || best.sourceMap._gridImage || null;
}

const seen = new Map();
let total = 0, blocked = 0;
for (const ogm of xml.matchAll(/<objectgroup\s+([^>]+?)>([\s\S]*?)<\/objectgroup>/g)) {
  const og = parseAttrs(ogm[1]);
  for (const om of ogm[2].matchAll(/<object\s+([^>]+?)\/>/g)) {
    const o = parseAttrs(om[1]);
    if (!o.gid) continue;
    total++;
    const src = gidToSource(parseInt(o.gid, 10) >>> 0);
    if (!src) continue;
    const isBlock = BLOCKING_PROP_RE.test(src);
    if (isBlock) blocked++;
    if (!seen.has(src)) seen.set(src, { count: 0, blocks: isBlock });
    seen.get(src).count++;
  }
}

console.log(`Total objects: ${total}, blocked: ${blocked}\n`);
console.log('=== UNIQUE SOURCES (sorted by frequency) ===');
const sorted = [...seen.entries()].sort((a, b) => b[1].count - a[1].count);
for (const [src, d] of sorted.slice(0, 40)) {
  console.log(`  ${d.blocks ? '🟥' : '⬜'} ${d.count.toString().padStart(3)} × ${src.slice(-40)}`);
}
