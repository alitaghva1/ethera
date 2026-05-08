// Asset loader — images + audio buffers
import { loadAtlas } from './atlas.js';

export const images = {};
export const audio = {};
const failed = [];

// Loading progress callback (set by loadAll)
let onProgress = null;
let loadedCount = 0;
let totalCount = 0;
function bump(src) {
  loadedCount++;
  if (onProgress) onProgress(loadedCount, totalCount, src);
}

function loadImage(key, src) {
  return new Promise((resolve) => {
    const img = new Image();
    const done = (ok) => { if (ok) images[key] = img; else { failed.push(src); console.warn('image failed:', src); } bump(src); resolve(); };
    img.onload = () => done(true);
    img.onerror = () => done(false);
    img.src = src;
  });
}

// Chroma-key helper — converts pure-magenta (#FF00FF ± tolerance) pixels to
// transparent alpha with a soft edge feather for anti-aliased fringe pixels.
// Nano Banana outputs JPG (no alpha), so magenta-background art gets keyed at
// load time into an offscreen canvas that any ctx.drawImage call can consume.
// Also exposes a data URL (`<key>_url`) for DOM <img> tags that can't take
// a canvas directly (hamlet shrine, death-summary sigil).
function keyMagentaToAlpha(img) {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth || img.width;
  c.height = img.naturalHeight || img.height;
  const cx = c.getContext('2d');
  cx.drawImage(img, 0, 0);
  const data = cx.getImageData(0, 0, c.width, c.height);
  const p = data.data;
  // Hue-based magenta detection: any pixel where (red + blue)/2 strongly
  // exceeds green is "magenta-ish" regardless of overall brightness. Handles
  // JPEG compression artifacts, anti-aliased fringes, and the pink halo left
  // by a naive RGB-threshold key. Score 0..100+ where ~50+ starts fading
  // and ~90+ is full transparency.
  for (let i = 0; i < p.length; i += 4) {
    const r = p[i], g = p[i + 1], b = p[i + 2];
    const magScore = (r + b) / 2 - g;
    if (magScore > 90) {
      p[i + 3] = 0;
    } else if (magScore > 40) {
      // Feather zone — linear ramp from fully-opaque (40) to fully-transparent (90).
      const t = (magScore - 40) / 50;
      p[i + 3] = Math.max(0, Math.floor(p[i + 3] * (1 - t)));
    }
  }
  cx.putImageData(data, 0, 0);
  return c;
}

// opts.cropBottomFrac (0..1) — trim N% off the bottom of each cell. Used for
// sprite sheets where Nano Banana ignored the "no labels" negative and painted
// text captions beneath each figure (we slice them out). opts.cropTopFrac
// does the same from the top.
function sliceCanvasGrid(srcCanvas, cols, rows, opts = {}) {
  const srcCellW = Math.floor(srcCanvas.width / cols);
  const srcCellH = Math.floor(srcCanvas.height / rows);
  const topFrac = opts.cropTopFrac || 0;
  const botFrac = opts.cropBottomFrac || 0;
  const cellW = srcCellW;
  const cellH = Math.floor(srcCellH * (1 - topFrac - botFrac));
  const cells = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = document.createElement('canvas');
      cell.width = cellW;
      cell.height = cellH;
      cell.getContext('2d').drawImage(
        srcCanvas,
        c * srcCellW,
        r * srcCellH + Math.floor(srcCellH * topFrac),
        cellW,
        cellH,
        0, 0, cellW, cellH,
      );
      cells.push(cell);
    }
  }
  return cells;
}

// Loads a magenta-keyed image. Stored at `images[key]` as a canvas (drawImage
// accepts both Image and HTMLCanvasElement). Also populates `images[key_url]`
// with a data URL for DOM consumption.
function loadKeyedImage(key, src) {
  return new Promise((resolve) => {
    const img = new Image();
    const done = (ok) => {
      if (ok) {
        const keyed = keyMagentaToAlpha(img);
        images[key] = keyed;
        try { images[key + '_url'] = keyed.toDataURL('image/png'); } catch (e) {}
      } else {
        failed.push(src);
        console.warn('keyed image failed:', src);
      }
      bump(src);
      resolve();
    };
    img.onload = () => done(true);
    img.onerror = () => done(false);
    img.src = src;
  });
}

// Loads a magenta-keyed sprite sheet and slices it into an N×M grid. Each
// cell is stored at `images[<baseKey>_<i>]` (row-major, 0-indexed) as a
// canvas, with an accompanying data URL at `<baseKey>_<i>_url`. opts.cropTopFrac
// and opts.cropBottomFrac trim rows off each cell (used to crop out Nano Banana
// text labels that slipped through a negative prompt).
function loadKeyedGrid(baseKey, src, cols, rows, opts = {}) {
  return new Promise((resolve) => {
    const img = new Image();
    const done = (ok) => {
      if (ok) {
        const keyed = keyMagentaToAlpha(img);
        const cells = sliceCanvasGrid(keyed, cols, rows, opts);
        for (let i = 0; i < cells.length; i++) {
          images[`${baseKey}_${i}`] = cells[i];
          try { images[`${baseKey}_${i}_url`] = cells[i].toDataURL('image/png'); } catch (e) {}
        }
      } else {
        failed.push(src);
        console.warn('keyed grid failed:', src);
      }
      bump(src);
      resolve();
    };
    img.onload = () => done(true);
    img.onerror = () => done(false);
    img.src = src;
  });
}

// Audio loading is tricky: `canplaythrough` may never fire in some browsers
// before user interaction (autoplay policy) or for streaming .ogg. We resolve
// on the FIRST of: canplay, loadedmetadata, or a 2.5s timeout. We only need
// the URL stored — actual playback uses <Audio> pool on demand in sfx.js.
function loadAudio(key, src) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      if (ok) audio[key] = src;
      else { failed.push(src); console.warn('audio failed:', src); }
      bump(src);
      resolve();
    };
    const a = new Audio();
    a.addEventListener('canplay',        () => finish(true),  { once: true });
    a.addEventListener('loadedmetadata', () => finish(true),  { once: true });
    a.addEventListener('error',          () => finish(false), { once: true });
    // Fallback — trust that HEAD will eventually work even if events don't fire.
    setTimeout(() => { if (!done) { audio[key] = src; bump(src); done = true; resolve(); } }, 2500);
    a.preload = 'metadata';
    a.src = src;
  });
}

// Room metadata loader — fetches a JSON sidecar (collision grid + room
// dims) for a baked room PNG. Stored on the shared `images` map under
// the given key — yes, JSON-on-the-image-map is a slight lie of types,
// but room rendering already reads images[key] for the PNG so a sibling
// images[`${key}_meta`] is the cheapest plumb. Object has shape:
//   { width, height, tileSize, imageWidth, imageHeight, collision: bool[][] }
function loadRoomMeta(key, src) {
  return fetch(src)
    .then((r) => {
      if (!r.ok) throw new Error(`room meta load failed: ${src} (${r.status})`);
      return r.json();
    })
    .then((data) => {
      images[key] = data;
      bump(src);
    })
    .catch((e) => {
      failed.push(src);
      console.warn('room meta failed:', src, e.message);
      bump(src);
    });
}

export async function loadAll(progressCb) {
  onProgress = progressCb || null;
  loadedCount = 0;
  const promises = [
    // Phase 3 unification — paths/keys aligned with content. The hero IS
    // a mage; previously the slot was named `knight_*` (legacy from the
    // pre-mage-import era) but the PNGs themselves are mage sprites. The
    // name lie was confusing tooling. Renamed both files + cache keys
    // here. Enemy `knight_*` entries below are an UNRELATED enemy.
    loadImage('mage_idle',  'assets/characters/mage_idle.png'),
    loadImage('mage_walk',  'assets/characters/mage_walk.png'),
    loadImage('mage_attack','assets/characters/mage_attack.png'),
    loadImage('mage_hurt',  'assets/characters/mage_hurt.png'),
    loadImage('mage_death', 'assets/characters/mage_death.png'),
    loadImage('slime_idle',   'assets/enemies/slime_idle.png'),
    loadImage('slime_walk',   'assets/enemies/slime_walk.png'),
    loadImage('slime_attack', 'assets/enemies/slime_attack.png'),
    // 'cast' = projectile-attack windup sheet for the acid-spitter
    // slime variant. Used when an enemy's behavior is 'caster' (or
    // similar) and it needs a visually-distinct charging animation
    // separate from the melee 'attack' lunge.
    loadImage('slime_cast',   'assets/enemies/slime_cast.png'),
    loadImage('slime_death',  'assets/enemies/slime_death.png'),
    loadImage('skel_idle',    'assets/enemies/skel_idle.png'),
    loadImage('skel_walk',    'assets/enemies/skel_walk.png'),
    loadImage('skel_attack',  'assets/enemies/skel_attack.png'),
    loadImage('skel_hurt',    'assets/enemies/skel_hurt.png'),
    loadImage('skel_death',   'assets/enemies/skel_death.png'),
    // Crypt spider (Phase 2 Epic RPG World import) — 64×64 cells, all
    // 5 states. Sized as fodder enemy: faster + lower HP than skeleton.
    loadImage('crypt_spider_idle',   'assets/enemies/crypt_spider_idle.png'),
    loadImage('crypt_spider_walk',   'assets/enemies/crypt_spider_walk.png'),
    loadImage('crypt_spider_attack', 'assets/enemies/crypt_spider_attack.png'),
    loadImage('crypt_spider_hurt',   'assets/enemies/crypt_spider_hurt.png'),
    loadImage('crypt_spider_death',  'assets/enemies/crypt_spider_death.png'),
    loadImage('orc_idle',     'assets/enemies/orc_idle.png'),
    loadImage('orc_walk',     'assets/enemies/orc_walk.png'),
    loadImage('orc_attack',   'assets/enemies/orc_attack.png'),
    loadImage('orc_death',    'assets/enemies/orc_death.png'),
    loadImage('archer_idle',  'assets/enemies/archer_idle.png'),
    loadImage('archer_walk',  'assets/enemies/archer_walk.png'),
    loadImage('archer_attack','assets/enemies/archer_attack.png'),
    loadImage('archer_death', 'assets/enemies/archer_death.png'),
    loadImage('bonecap_idle',  'assets/enemies/bonecap_idle.png'),
    loadImage('bonecap_walk',  'assets/enemies/bonecap_walk.png'),
    loadImage('bonecap_attack','assets/enemies/bonecap_attack.png'),
    loadImage('bonecap_death', 'assets/enemies/bonecap_death.png'),
    loadImage('brood_idle',    'assets/enemies/brood_idle.png'),
    loadImage('brood_walk',    'assets/enemies/brood_walk.png'),
    loadImage('brood_attack',  'assets/enemies/brood_attack.png'),
    loadImage('brood_death',   'assets/enemies/brood_death.png'),
    loadImage('lancer_idle',   'assets/enemies/lancer_idle.png'),
    loadImage('lancer_walk',   'assets/enemies/lancer_walk.png'),
    loadImage('lancer_attack', 'assets/enemies/lancer_attack.png'),
    loadImage('lancer_death',  'assets/enemies/lancer_death.png'),
    loadImage('priest_idle',   'assets/enemies/priest_idle.png'),
    loadImage('priest_walk',   'assets/enemies/priest_walk.png'),
    loadImage('priest_attack', 'assets/enemies/priest_attack.png'),
    loadImage('priest_death',  'assets/enemies/priest_death.png'),
    loadImage('wiz_idle',      'assets/enemies/wiz_idle.png'),
    loadImage('wiz_walk',      'assets/enemies/wiz_walk.png'),
    loadImage('wiz_attack',    'assets/enemies/wiz_attack.png'),
    loadImage('wiz_death',     'assets/enemies/wiz_death.png'),
    loadImage('ember_idle',    'assets/enemies/ember_idle.png'),
    loadImage('ember_walk',    'assets/enemies/ember_walk.png'),
    loadImage('ember_attack',  'assets/enemies/ember_attack.png'),
    loadImage('ember_death',   'assets/enemies/ember_death.png'),
    // New enemy sprites ingested via tools/ingest_enemy_pack.py:
    //   warden    — Undead Executioner pack (mini-boss tier, slow heavy)
    //   dreadmage — EVil Wizard 2 pack (tier-3 caster)
    //   haunt     — Flying Demon pack (aerial harasser)
    loadImage('warden_idle',    'assets/enemies/warden_idle.png'),
    loadImage('warden_walk',    'assets/enemies/warden_walk.png'),
    loadImage('warden_attack',  'assets/enemies/warden_attack.png'),
    loadImage('warden_death',   'assets/enemies/warden_death.png'),
    loadImage('dreadmage_idle',    'assets/enemies/dreadmage_idle.png'),
    loadImage('dreadmage_walk',    'assets/enemies/dreadmage_walk.png'),
    loadImage('dreadmage_attack',  'assets/enemies/dreadmage_attack.png'),
    loadImage('dreadmage_death',   'assets/enemies/dreadmage_death.png'),
    loadImage('haunt_idle',    'assets/enemies/haunt_idle.png'),
    loadImage('haunt_walk',    'assets/enemies/haunt_walk.png'),
    loadImage('haunt_attack',  'assets/enemies/haunt_attack.png'),
    loadImage('haunt_death',   'assets/enemies/haunt_death.png'),
    // Tiny RPG kit ingest (cleanup pass — wires 6 previously-unused
    // characters from the kit into the roster):
    //   werewolf            — fast bestial skirmisher (F3 abyss)
    //   werebear            — heavy bestial brute (F3+F4)
    //   skel_archer         — bone-themed ranged (replaces archer in F1 crypt)
    //   knight              — armored melee (replaces vanguard's orc-retint)
    //   armored_skeleton    — heavy bone melee (F2 vault garrison)
    //   greatsword_skeleton — heavy bone cleaver (F2/F3 elite slot)
    loadImage('werewolf_idle',           'assets/enemies/werewolf_idle.png'),
    loadImage('werewolf_walk',           'assets/enemies/werewolf_walk.png'),
    loadImage('werewolf_attack',         'assets/enemies/werewolf_attack.png'),
    loadImage('werewolf_death',          'assets/enemies/werewolf_death.png'),
    loadImage('werebear_idle',           'assets/enemies/werebear_idle.png'),
    loadImage('werebear_walk',           'assets/enemies/werebear_walk.png'),
    loadImage('werebear_attack',         'assets/enemies/werebear_attack.png'),
    loadImage('werebear_death',          'assets/enemies/werebear_death.png'),
    loadImage('skel_archer_idle',        'assets/enemies/skel_archer_idle.png'),
    loadImage('skel_archer_walk',        'assets/enemies/skel_archer_walk.png'),
    loadImage('skel_archer_attack',      'assets/enemies/skel_archer_attack.png'),
    loadImage('skel_archer_death',       'assets/enemies/skel_archer_death.png'),
    loadImage('knight_enemy_idle',       'assets/enemies/knight_idle.png'),
    loadImage('knight_enemy_walk',       'assets/enemies/knight_walk.png'),
    loadImage('knight_enemy_attack',     'assets/enemies/knight_attack.png'),
    loadImage('knight_enemy_death',      'assets/enemies/knight_death.png'),
    loadImage('armored_skel_idle',       'assets/enemies/armored_skeleton_idle.png'),
    loadImage('armored_skel_walk',       'assets/enemies/armored_skeleton_walk.png'),
    loadImage('armored_skel_attack',     'assets/enemies/armored_skeleton_attack.png'),
    loadImage('armored_skel_death',      'assets/enemies/armored_skeleton_death.png'),
    loadImage('greatsword_skel_idle',    'assets/enemies/greatsword_skeleton_idle.png'),
    loadImage('greatsword_skel_walk',    'assets/enemies/greatsword_skeleton_walk.png'),
    loadImage('greatsword_skel_attack',  'assets/enemies/greatsword_skeleton_attack.png'),
    loadImage('greatsword_skel_death',   'assets/enemies/greatsword_skeleton_death.png'),
    // Tiny RPG kit — second batch (full-roster pass). Pacing-aware
    // introductions: F2 gets soldier; F3 gets swordsman / armored_axeman
    // / armored_orc; F4 gets knight_templar + orc_rider; elite_orc
    // becomes the F1 boss sprite (Grudnok visual differentiation).
    loadImage('soldier_idle',           'assets/enemies/soldier_idle.png'),
    loadImage('soldier_walk',           'assets/enemies/soldier_walk.png'),
    loadImage('soldier_attack',         'assets/enemies/soldier_attack.png'),
    loadImage('soldier_death',          'assets/enemies/soldier_death.png'),
    loadImage('swordsman_idle',         'assets/enemies/swordsman_idle.png'),
    loadImage('swordsman_walk',         'assets/enemies/swordsman_walk.png'),
    loadImage('swordsman_attack',       'assets/enemies/swordsman_attack.png'),
    loadImage('swordsman_death',        'assets/enemies/swordsman_death.png'),
    loadImage('armored_axeman_idle',    'assets/enemies/armored_axeman_idle.png'),
    loadImage('armored_axeman_walk',    'assets/enemies/armored_axeman_walk.png'),
    loadImage('armored_axeman_attack',  'assets/enemies/armored_axeman_attack.png'),
    loadImage('armored_axeman_death',   'assets/enemies/armored_axeman_death.png'),
    loadImage('armored_orc_idle',       'assets/enemies/armored_orc_idle.png'),
    loadImage('armored_orc_walk',       'assets/enemies/armored_orc_walk.png'),
    loadImage('armored_orc_attack',     'assets/enemies/armored_orc_attack.png'),
    loadImage('armored_orc_death',      'assets/enemies/armored_orc_death.png'),
    // Grudnok (elite_orc) — 8-direction GRID sheets (rows = N/NE/E/SE/S/SW/W/NW,
    // cols = animation frames). Renderer reads the directional row when the
    // def has grid8: true. Extra sheets (hurt/heavy/cast) drive the new attack
    // patterns + stagger animation; see src/enemies.js elite_orc def.
    loadImage('elite_orc_idle',         'assets/enemies/elite_orc_idle.png'),
    loadImage('elite_orc_walk',         'assets/enemies/elite_orc_walk.png'),
    loadImage('elite_orc_attack',       'assets/enemies/elite_orc_attack.png'),
    loadImage('elite_orc_death',        'assets/enemies/elite_orc_death.png'),
    loadImage('elite_orc_hurt',         'assets/enemies/elite_orc_hurt.png'),
    loadImage('elite_orc_heavy',        'assets/enemies/elite_orc_heavy.png'),
    loadImage('elite_orc_cast',         'assets/enemies/elite_orc_cast.png'),
    loadImage('knight_templar_idle',    'assets/enemies/knight_templar_idle.png'),
    loadImage('knight_templar_walk',    'assets/enemies/knight_templar_walk.png'),
    loadImage('knight_templar_attack',  'assets/enemies/knight_templar_attack.png'),
    loadImage('knight_templar_death',   'assets/enemies/knight_templar_death.png'),
    loadImage('orc_rider_idle',         'assets/enemies/orc_rider_idle.png'),
    loadImage('orc_rider_walk',         'assets/enemies/orc_rider_walk.png'),
    loadImage('orc_rider_attack',       'assets/enemies/orc_rider_attack.png'),
    loadImage('orc_rider_death',        'assets/enemies/orc_rider_death.png'),
    // ── EPIC RPG WORLD PACK CHARACTERS (2026-05-08) ───────────────────────
    // Imported via scripts/import-pack-character.js. Five characters with
    // 5 states each (idle/walk/attack/hurt/death). cellSizes vary per def
    // (64 for the bat flyer, 96 for medium humanoids, 128 for bosses) —
    // the per-def cellSize override in TYPES routes the renderer through
    // the right size. See enemies.js for the wiring.
    loadImage('stone_golem_idle',       'assets/enemies/stone_golem_idle.png'),
    loadImage('stone_golem_walk',       'assets/enemies/stone_golem_walk.png'),
    loadImage('stone_golem_attack',     'assets/enemies/stone_golem_attack.png'),
    loadImage('stone_golem_hurt',       'assets/enemies/stone_golem_hurt.png'),
    loadImage('stone_golem_death',      'assets/enemies/stone_golem_death.png'),
    loadImage('mountain_boss_idle',     'assets/enemies/mountain_boss_idle.png'),
    loadImage('mountain_boss_walk',     'assets/enemies/mountain_boss_walk.png'),
    loadImage('mountain_boss_attack',   'assets/enemies/mountain_boss_attack.png'),
    loadImage('mountain_boss_hurt',     'assets/enemies/mountain_boss_hurt.png'),
    loadImage('mountain_boss_death',    'assets/enemies/mountain_boss_death.png'),
    loadImage('cemetery_bat_idle',      'assets/enemies/cemetery_bat_idle.png'),
    loadImage('cemetery_bat_walk',      'assets/enemies/cemetery_bat_walk.png'),
    loadImage('cemetery_bat_attack',    'assets/enemies/cemetery_bat_attack.png'),
    loadImage('cemetery_bat_hurt',      'assets/enemies/cemetery_bat_hurt.png'),
    loadImage('cemetery_bat_death',     'assets/enemies/cemetery_bat_death.png'),
    loadImage('imp_demon_idle',         'assets/enemies/imp_demon_idle.png'),
    loadImage('imp_demon_walk',         'assets/enemies/imp_demon_walk.png'),
    loadImage('imp_demon_attack',       'assets/enemies/imp_demon_attack.png'),
    loadImage('imp_demon_hurt',         'assets/enemies/imp_demon_hurt.png'),
    loadImage('imp_demon_death',        'assets/enemies/imp_demon_death.png'),
    loadImage('rocky_dude_idle',        'assets/enemies/rocky_dude_idle.png'),
    loadImage('rocky_dude_walk',        'assets/enemies/rocky_dude_walk.png'),
    loadImage('rocky_dude_attack',      'assets/enemies/rocky_dude_attack.png'),
    loadImage('rocky_dude_hurt',        'assets/enemies/rocky_dude_hurt.png'),
    loadImage('rocky_dude_death',       'assets/enemies/rocky_dude_death.png'),
    // Phase 3 unification — REMOVED legacy procedural tile sheets:
    //   • dungeon_tiles (1 PNG)
    //   • floor_crypt_0..15 (16 PNGs)
    //   • wall_crypt_body_0..3 + wall_crypt_corner_{tl,tr,bl,br} (8 PNGs)
    // These were boot-loaded but had NO `images.*` consumer anywhere in
    // the codebase — pure orphans. The canonical render path is the baked
    // zone composite (room.bakedImage), which doesn't need tile-by-tile
    // sheets. Removed 25 boot HTTP requests + ~200 KB of payload.
    // Asset files also deleted from public/assets/tiles/.

    // ── EPIC RPG WORLD CRYPT PACK (Phase 1 — 2026-05-07) ────────────────
    // Master terrain atlas — 50×58 grid of 32px tiles (1600×1856 PNG).
    // The Pack's `Tilesets/Tileset-Terrain.tsx` enumerates which IDs are
    // ground vs. transition vs. wall sections; the Sample Map.tmx shows
    // the canonical "stone ground" pool the artist uses repeatedly:
    // GIDs 518-520, 469, 569 (subtract 1 for 0-indexed local IDs).
    // Wall variant atlases (16×15 grids of 32px = 512×480 PNGs) ship
    // alongside as wall-1/2/3 — used by the Phase 1b Wang autotile.
    loadAtlas('crypt_terrain', 'assets/packs/crypt/tilesets/Tileset-Terrain.png', {
      tileSize: 32, cols: 50, rows: 58,
    }),
    loadAtlas('crypt_wall_1', 'assets/packs/crypt/tilesets/wall-1.png', {
      tileSize: 32, cols: 16, rows: 15,
    }),
    loadAtlas('crypt_wall_2', 'assets/packs/crypt/tilesets/wall-2.png', {
      tileSize: 32, cols: 16, rows: 15,
    }),
    loadAtlas('crypt_wall_3', 'assets/packs/crypt/tilesets/wall-3.png', {
      tileSize: 32, cols: 16, rows: 15,
    }),

    // ── BAKED ROOMS (Phase Path-A — 2026-05-07) ──────────────────────
    // Pre-rendered hand-composed crypt room from the artist's
    // Sample Map.tmx. The PNG is the full multi-room composition
    // (1120×800 native, 32px tiles). Engine renders it as a single
    // drawImage call when room.bakedImage is set, bypassing per-tile
    // floor/wall rendering. Collision data is loaded as JSON sibling.
    loadImage('room_crypt_sample',       'assets/rooms/crypt_sample.png'),
    loadImage('room_crypt_sample_anims', 'assets/rooms/crypt_sample_anims.png'),
    loadRoomMeta('room_crypt_sample_meta', 'assets/rooms/crypt_sample.json'),
    // Cropped chamber from Crypt example map.tmx — a clean,
    // self-contained sarcophagus chamber. Smaller (~14×12 cells) and
    // designed as one playable space, vs the multi-chamber Sample Map.
    loadImage('room_crypt_chamber_01',       'assets/rooms/crypt_chamber_01.png'),
    loadImage('room_crypt_chamber_01_anims', 'assets/rooms/crypt_chamber_01_anims.png'),
    loadRoomMeta('room_crypt_chamber_01_meta', 'assets/rooms/crypt_chamber_01.json'),
    // Main hall — bottom half of the Sample Map, cropped to the
    // 231-cell single connected component. Pillared corridor + dais
    // + sarcophagi + animated torch + carpet runner. The artist's
    // richest playable composition.
    loadImage('room_crypt_main_hall',       'assets/rooms/crypt_main_hall.png'),
    loadImage('room_crypt_main_hall_anims', 'assets/rooms/crypt_main_hall_anims.png'),
    loadRoomMeta('room_crypt_main_hall_meta', 'assets/rooms/crypt_main_hall.json'),
    // Cemetery Sample Map — outdoor graveyard, 35×20 cells, 573-cell
    // single connected component. Terrain variety (grass + dirt +
    // leaves + stone path), tombs/crypts, fences, fall foliage,
    // stairs. The cleanest pack-quality playable composition we have.
    loadImage('room_cemetery_sample',       'assets/rooms/cemetery_sample.png'),
    loadImage('room_cemetery_sample_anims', 'assets/rooms/cemetery_sample_anims.png'),
    loadRoomMeta('room_cemetery_sample_meta', 'assets/rooms/cemetery_sample.json'),
    // User-edited Sample Map 2 — same Cemetery base with select objects
    // removed for cleaner walkability. The user opens this in Tiled,
    // removes problem objects, saves, we re-bake.
    loadImage('room_cemetery_sample_2',       'assets/rooms/cemetery_sample_2.png'),
    loadImage('room_cemetery_sample_2_anims', 'assets/rooms/cemetery_sample_2_anims.png'),
    loadRoomMeta('room_cemetery_sample_2_meta', 'assets/rooms/cemetery_sample_2.json'),
    // ── 5-zone progression (2026-05-07) ──────────────────────────────
    // Floor 1 — Ancient Ruins. Outdoor, sun-baked stone, columns, raised
    // platforms with stairs, vegetation, waterfall props. 40×24 cells.
    loadImage('room_ruins_sample',       'assets/rooms/ruins_sample.png'),
    loadImage('room_ruins_sample_anims', 'assets/rooms/ruins_sample_anims.png'),
    loadRoomMeta('room_ruins_sample_meta', 'assets/rooms/ruins_sample.json'),
    // Floor 4 — Depths of the Mountain. Cavernous, throne dais, raised
    // mining plats, mountain-wall structures. 45×54 cells.
    loadImage('room_mountain_sample',       'assets/rooms/mountain_sample.png'),
    loadImage('room_mountain_sample_anims', 'assets/rooms/mountain_sample_anims.png'),
    loadRoomMeta('room_mountain_sample_meta', 'assets/rooms/mountain_sample.json'),
    // Floor 5 — Volcano. Magma climax, lava channels (block), floating
    // basalt platforms, chains, lavafalls. 90×60 cells, 8 connected
    // components by design (lava splits the islands).
    loadImage('room_volcano_sample',       'assets/rooms/volcano_sample.png'),
    loadImage('room_volcano_sample_anims', 'assets/rooms/volcano_sample_anims.png'),
    loadRoomMeta('room_volcano_sample_meta', 'assets/rooms/volcano_sample.json'),

    // (wall_crypt_* removed in Phase 3 unification — see floor_crypt_* note above)

    // Legacy shared-icon PNGs — kept as fallbacks if a dedicated per-relic
    // image ever fails to load. Not referenced by any relic now that all 34
    // have their own dedicated art (see below).
    loadImage('relic_damage',       'assets/icons/relic_damage.png'),
    loadImage('relic_attack_speed', 'assets/icons/relic_attack_speed.png'),
    loadImage('relic_reach',        'assets/icons/relic_reach.png'),
    loadImage('relic_dodge',        'assets/icons/relic_dodge.png'),
    loadImage('relic_speed',        'assets/icons/relic_speed.png'),
    loadImage('relic_max_hp',       'assets/icons/relic_max_hp.png'),
    loadImage('relic_lifesteal',    'assets/icons/relic_lifesteal.png'),
    loadImage('relic_phoenix',      'assets/icons/relic_phoenix.png'),

    // DEDICATED RELIC ICONS — one hand-drawn PNG per relic (Nano Banana, Apr 2026).
    // Replaces the old hue-rotate+glyph overlay system (kept as fallback).
    loadImage('relic_serrated_edge',    'assets/icons/relic_serrated_edge.png'),
    loadImage('relic_swift_arm',        'assets/icons/relic_swift_arm.png'),
    loadImage('relic_long_reach',       'assets/icons/relic_long_reach.png'),
    loadImage('relic_nimble_step',      'assets/icons/relic_nimble_step.png'),
    loadImage('relic_iron_greaves',     'assets/icons/relic_iron_greaves.png'),
    loadImage('relic_ironhide',         'assets/icons/relic_ironhide.png'),
    loadImage('relic_bloodstone',       'assets/icons/relic_bloodstone.png'),
    loadImage('relic_phoenix_tear',     'assets/icons/relic_phoenix_tear.png'),
    loadImage('relic_iron_resolve',     'assets/icons/relic_iron_resolve.png'),
    loadImage('relic_keen_edge',        'assets/icons/relic_keen_edge.png'),
    loadImage('relic_vitality',         'assets/icons/relic_vitality.png'),
    loadImage('relic_heavy_blow',       'assets/icons/relic_heavy_blow.png'),
    loadImage('relic_dash_master',      'assets/icons/relic_dash_master.png'),
    loadImage('relic_executioner',      'assets/icons/relic_executioner.png'),
    loadImage('relic_warlord',          'assets/icons/relic_warlord.png'),
    loadImage('relic_reaver',           'assets/icons/relic_reaver.png'),
    loadImage('relic_chain_lightning',  'assets/icons/relic_chain_lightning.png'),
    loadImage('relic_explosive_kill',   'assets/icons/relic_explosive_kill.png'),
    loadImage('relic_soul_burst',       'assets/icons/relic_soul_burst.png'),
    loadImage('relic_thunder_step',     'assets/icons/relic_thunder_step.png'),
    loadImage('relic_vampiric_aura',    'assets/icons/relic_vampiric_aura.png'),
    loadImage('relic_echoing_strike',   'assets/icons/relic_echoing_strike.png'),
    loadImage('relic_eye_of_ether',     'assets/icons/relic_eye_of_ether.png'),
    loadImage('relic_cataclysm',        'assets/icons/relic_cataclysm.png'),
    loadImage('relic_wanderers_cloak',  'assets/icons/relic_wanderers_cloak.png'),
    loadImage('relic_ethereal_binding', 'assets/icons/relic_ethereal_binding.png'),
    loadImage('relic_phoenix_cloak',    'assets/icons/relic_phoenix_cloak.png'),
    loadImage('relic_avatar_of_flame',  'assets/icons/relic_avatar_of_flame.png'),
    loadImage('relic_pyromancer',       'assets/icons/relic_pyromancer.png'),
    loadImage('relic_soulreaver',       'assets/icons/relic_soulreaver.png'),
    loadImage('relic_counterstrike',    'assets/icons/relic_counterstrike.png'),
    loadImage('relic_aegis_pulse',      'assets/icons/relic_aegis_pulse.png'),
    loadImage('relic_bloodrite',        'assets/icons/relic_bloodrite.png'),
    loadImage('relic_gale_step',        'assets/icons/relic_gale_step.png'),
    // Previously orphaned — PNG existed on disk but loader was missing the
    // entry, so hourglass_of_respite rendered as a black box in the pickup
    // tooltip. Lantern is for future use (hermit mini-boss / wanderer).
    loadImage('relic_hourglass',        'assets/icons/relic_hourglass.png'),
    loadImage('relic_lantern',          'assets/icons/relic_lantern.png'),

    // FUSION ICONS — dedicated art per fusion recipe (Nano Banana, Apr 2026)
    loadImage('fusion_tesla_storm',     'assets/icons/fusion_tesla_storm.png'),
    loadImage('fusion_blood_moon',      'assets/icons/fusion_blood_moon.png'),
    loadImage('fusion_rebirth_pyre',    'assets/icons/fusion_rebirth_pyre.png'),
    loadImage('fusion_conflagration',   'assets/icons/fusion_conflagration.png'),
    loadImage('fusion_phantom_blade',   'assets/icons/fusion_phantom_blade.png'),
    loadImage('fusion_storm_dance',     'assets/icons/fusion_storm_dance.png'),
    loadImage('fusion_riposte',         'assets/icons/fusion_riposte.png'),
    loadImage('fusion_mountains_heart', 'assets/icons/fusion_mountains_heart.png'),
    loadImage('fusion_obsidian_edge',   'assets/icons/fusion_obsidian_edge.png'),
    loadImage('fusion_tempest',         'assets/icons/fusion_tempest.png'),
    loadImage('fusion_final_verdict',   'assets/icons/fusion_final_verdict.png'),
    loadImage('fusion_stalwart',        'assets/icons/fusion_stalwart.png'),
    loadImage('fusion_sparrows_dance',  'assets/icons/fusion_sparrows_dance.png'),
    loadImage('fusion_witness',         'assets/icons/fusion_witness.png'),
    // Rehomed from the spare-icon pool (April 2026 orphan cleanup)
    loadImage('fusion_spare_ring',      'assets/icons/fusion_spare_ring.png'),
    loadImage('fusion_spare_star',      'assets/icons/fusion_spare_star.png'),

    // ZONE BACKDROPS — one painted backdrop per floor, used for the floor-
    // intro title card + as the floor-map modal background. 1376x768 each,
    // fits the 1280x720 canvas with slight overscan for edge motion.
    loadImage('zone_undercroft',        'assets/backdrops/zone_undercroft.jpg'),
    loadImage('zone_ruined_tower',      'assets/backdrops/zone_ruined_tower.jpg'),
    loadImage('zone_spire',             'assets/backdrops/zone_spire.jpg'),
    loadImage('zone_throne_of_ruin',    'assets/backdrops/zone_throne_of_ruin.jpg'),

    // BOSS INTRO BACKDROPS — one full-frame painted scene per boss (Nano
    // Banana). Each image IS the complete boss-intro cinematic; the render
    // draws it full-bleed plus a veil and gold typography on the lower
    // third. No portrait compositing — these are authored with the boss
    // embedded in the scene. Replaced the previous portrait + zone-backdrop
    // composite that was collapsing to black on displays with aggressive
    // color management.
    loadImage('boss_intro_grudnok',       'assets/backdrops/boss_intro_grudnok.jpg'),
    loadImage('boss_intro_iron_revenant', 'assets/backdrops/boss_intro_iron_revenant.jpg'),
    loadImage('boss_intro_broodmother',   'assets/backdrops/boss_intro_broodmother.jpg'),
    loadImage('boss_intro_ember_tyrant',  'assets/backdrops/boss_intro_ember_tyrant.jpg'),
    loadImage('boss_intro_echo_of_self',  'assets/backdrops/boss_intro_echo_of_self.jpg'),
    loadImage('boss_intro_hermit',        'assets/backdrops/boss_intro_hermit.jpg'),

    // APRIL 2026 ICON EXPANSION — 19 painted icons (Nano Banana) covering
    // the 5 relics/fusions that previously borrowed icons (now have dedicated
    // art) plus 14 NEW concept icons reserved for future mechanic design
    // (relic + fusion bank).
    //
    // Now-dedicated (replaces borrowed icons):
    loadImage('relic_bulwark',          'assets/icons/relic_bulwark.png'),
    loadImage('relic_second_wind',      'assets/icons/relic_second_wind.png'),
    loadImage('fusion_kingslayer',      'assets/icons/fusion_kingslayer.png'),
    loadImage('fusion_aegis_wall',      'assets/icons/fusion_aegis_wall.png'),
    loadImage('fusion_weaving_step',    'assets/icons/fusion_weaving_step.png'),
    // Reserved for future relic concepts (art bank — mechanics TBD):
    loadImage('relic_mirror_shard',     'assets/icons/relic_mirror_shard.png'),
    loadImage('relic_spore_bloom',      'assets/icons/relic_spore_bloom.png'),
    loadImage('relic_oathshield',       'assets/icons/relic_oathshield.png'),
    loadImage('relic_arcane_quiver',    'assets/icons/relic_arcane_quiver.png'),
    loadImage('relic_marrow_pact',      'assets/icons/relic_marrow_pact.png'),
    loadImage('relic_gilded_hoard',     'assets/icons/relic_gilded_hoard.png'),
    loadImage('relic_hymn_of_embers',   'assets/icons/relic_hymn_of_embers.png'),
    loadImage('relic_temporal_eye',     'assets/icons/relic_temporal_eye.png'),
    loadImage('relic_whisper_veil',     'assets/icons/relic_whisper_veil.png'),
    loadImage('relic_stormcaller',      'assets/icons/relic_stormcaller.png'),
    // Reserved for future fusion concepts:
    loadImage('fusion_shatterpoint',    'assets/icons/fusion_shatterpoint.png'),
    loadImage('fusion_wildfire_choir',  'assets/icons/fusion_wildfire_choir.png'),
    loadImage('fusion_martyr_bloom',    'assets/icons/fusion_martyr_bloom.png'),
    loadImage('fusion_stormveil',       'assets/icons/fusion_stormveil.png'),

    // BOSS PORTRAITS — shown in Chronicles > Bestiary when boss is defeated
    loadImage('portrait_grudnok',       'assets/enemies/portrait_grudnok.png'),
    loadImage('portrait_iron_revenant', 'assets/enemies/portrait_iron_revenant.png'),
    loadImage('portrait_broodmother',   'assets/enemies/portrait_broodmother.png'),
    loadImage('portrait_ember_tyrant',  'assets/enemies/portrait_ember_tyrant.png'),
    loadImage('portrait_echo_of_self',  'assets/enemies/portrait_echo_of_self.png'),
    loadImage('portrait_hermit',        'assets/enemies/portrait_hermit.png'),

    // HAMLET NPC PORTRAITS — painted in the same register as boss portraits
    // (Nano Banana). When files are missing, hamlet falls back to a silhouette
    // so the feature degrades gracefully.
    loadImage('npc_keeper',             'assets/hamlet/npc_keeper.png'),
    loadImage('npc_smith',              'assets/hamlet/npc_smith.png'),
    loadImage('npc_archivist',          'assets/hamlet/npc_archivist.png'),
    loadImage('npc_gravekeeper',        'assets/hamlet/npc_gravekeeper.png'),
    loadImage('npc_oracle',             'assets/hamlet/npc_oracle.png'),
    loadImage('npc_wanderer_hamlet',    'assets/hamlet/npc_wanderer_hamlet.png'),

    // THE WATCHER — magenta-keyed art. Sigil is a single painted eye carved
    // in stone (used in-game + in the run-summary ledger). Shrine grid is
    // 4×2 = 8 progression states the hamlet shrine reads from based on how
    // many milestones the player has heard.
    loadKeyedImage('watcher_sigil',     'assets/hamlet/watcher_sigil.jpg'),
    loadKeyedGrid('shrine_watcher',     'assets/hamlet/shrine_watcher_grid.jpg', 4, 2),

    // HAMLET — legacy DOM-overlay scene assets. Kept around because the
    // old DOM hamlet path still references them. The active canvas hamlet
    // uses scene_v2.jpg (registered further below). These can be removed
    // once we confirm the DOM hamlet path is fully retired.
    // 960×672 hamlet room (kept as a regular loadImage — no chroma-key
    // needed, it's a full-frame painting). Descent portal is a single
    // painted stairwell the player walks into to begin a run. NPC world
    // grid is a 4×2 sprite sheet of chibi pixel NPCs (6 canonical + 2
    // hallucinated extras at indices 3 and 7 — we skip those).
    // cropBottomFrac: 0.22 trims out the text label band Nano Banana
    // added despite the negative prompt.
    loadImage('hamlet_backdrop',        'assets/hamlet/hamlet_backdrop.jpg'),
    loadKeyedImage('descent_portal',    'assets/hamlet/descent_portal.jpg'),
    loadKeyedGrid('hamlet_npc',         'assets/hamlet/hamlet_npc_world_grid.jpg', 4, 2, { cropBottomFrac: 0.22 }),

    // HAMLET ENV PACK — painted pixel-art buildings, cobblestone tile grid,
    // firepit variants, and a pixel-art Watcher shrine. 4×2 = 8 cells:
    //   0 forge        | 1 dome         | 2 tower A      | 3 tower B
    //   4 cobble tile  | 5 firepit A    | 6 firepit B    | 7 shrine (pixel)
    loadKeyedGrid('hamlet_env',         'assets/hamlet/hamlet_env_pack.jpg', 4, 2),

    // HAMLET NPCs PIXEL — proper pixel-art NPCs matching the knight's
    // aesthetic. 3×2 = 6 cells, row-major:
    //   0 keeper    | 1 smith        | 2 archivist
    //   3 grave    | 4 oracle        | 5 wanderer
    loadKeyedGrid('hamlet_npcp',        'assets/hamlet/hamlet_npc_pixel.jpg', 3, 2),

    // ── CAINOS PIXEL ART TOP DOWN — unified hamlet asset pack ─────────────
    // 32px-tile sheets used by hamletFloor.js for the tilemap-rendered
    // hamlet floor. Loaded as plain images; the floor renderer uses
    // drawImage with sub-rect coords to slice tiles out of the sheets.
    // (The 'with shadow' variants are pre-baked drop shadows — useful
    // when we add props/plants in a future pass.)
    loadImage('cainos_grass',           'assets/hamlet/cainos/TX Tileset Grass.png'),
    loadImage('cainos_stone_ground',    'assets/hamlet/cainos/TX Tileset Stone Ground.png'),
    loadImage('cainos_wall',            'assets/hamlet/cainos/TX Tileset Wall.png'),
    loadImage('cainos_struct',          'assets/hamlet/cainos/TX Struct.png'),
    loadImage('cainos_props',           'assets/hamlet/cainos/TX Props.png'),
    loadImage('cainos_props_shadow',    'assets/hamlet/cainos/TX Props with Shadow.png'),
    loadImage('cainos_plant',           'assets/hamlet/cainos/TX Plant.png'),
    loadImage('cainos_plant_shadow',    'assets/hamlet/cainos/TX Plant with Shadow.png'),

    // ── HAMLET BACKDROP — AI-generated paired scene + walkability mask ────
    // v4 (current): 2752×1536 native, world-rendered at 1376×768. No-wall
    //               octagonal layout — single perimeter ring with no
    //               fragmented inner walls. Cleaner walkability (chromatic
    //               classifier handles grass/dirt/wall directly).
    // (v2 + v3 legacy backdrops removed in cleanup pass — assets deleted
    //  from disk; if you need them back, the previous git history has
    //  scene_v2.jpg / scene_v3.jpg under their respective commits.)
    loadImage('hamlet_scene_v4',        'assets/hamlet/scene_v4.jpg'),
    loadImage('hamlet_scene_v4_mask',   'assets/hamlet/scene_v4_mask.jpg'),

    // ── HAMLET NPCs v2 — PixelLab-generated to match the mage's style ─────
    // Each is a single south-facing idle PNG at ~224-244px, generated via
    // PixelLab Character Creator using mage_style_ref.png as style anchor.
    // hamletScene.drawNpc prefers these over the older hamlet_npcp_* grid.
    loadImage('npc_v2_keeper',          'assets/hamlet/npc_v2_keeper.png'),
    loadImage('npc_v2_smith',           'assets/hamlet/npc_v2_smith.png'),
    loadImage('npc_v2_archivist',       'assets/hamlet/npc_v2_archivist.png'),
    loadImage('npc_v2_gravekeeper',     'assets/hamlet/npc_v2_gravekeeper.png'),
    loadImage('npc_v2_oracle',          'assets/hamlet/npc_v2_oracle.png'),
    loadImage('npc_v2_wanderer',        'assets/hamlet/npc_v2_wanderer.png'),

    // ── HAMLET FX — animated sprite sheets ────────────────────────────────
    // PixelLab Animated Object exports stitched horizontally by
    // scripts/pixellab/import-fx.js. Frame count + dims declared in the
    // HAMLET_FX registry in hamletScene.js. Drawn via drawHamletFx as
    // an overlay pass on top of the painted backdrop.
    loadImage('fx_firepit',             'assets/hamlet/fx_firepit.png'),
    loadImage('fx_portal',              'assets/hamlet/fx_portal.png'),
    loadImage('fx_cookingpot',          'assets/hamlet/fx_cookingpot.png'),
    loadImage('fx_anvil',               'assets/hamlet/fx_anvil.png'),
    loadImage('fx_scryingbasin',        'assets/hamlet/fx_scryingbasin.png'),
    loadImage('fx_portal_shadow',       'assets/hamlet/fx_portal_shadow.png'),
    loadImage('fx_flameskull',          'assets/hamlet/fx_flameskull.png'),
    loadImage('fx_chestfire',           'assets/hamlet/fx_chestfire.png'),
    loadImage('fx_chestcold',           'assets/hamlet/fx_chestcold.png'),
    // (Removed in cleanup pass: fx_lectern, fx_graves, fx_lanternpost,
    //  fx_bookcase, fx_studydesk, fx_pit_cover, fx_well, fx_savegem,
    //  fx_noticeboard. These were parked — loaded but no longer referenced
    //  by HAMLET_FX. Re-add a loadImage line + an FX entry to bring back.)

    // ── THEME SYMBOLS — pedestals + door labels + relic-choice modal ──
    // PixelLab-generated 64×64 sprites that replace the procedural
    // shapes in `_drawThemeGlyphAt`. The in-game tint/halo wrapper
    // stays in code; only the static silhouette gets replaced.
    loadImage('theme_storm',            'assets/themes/theme_storm.png'),
    loadImage('theme_flame',            'assets/themes/theme_flame.png'),
    loadImage('theme_blood',            'assets/themes/theme_blood.png'),
    loadImage('theme_vow',              'assets/themes/theme_vow.png'),
    loadImage('theme_shadow',           'assets/themes/theme_shadow.png'),
    // 'neutral' = untyped/mixed-theme pedestals. Faceted amber gem
    // sprite signals "generic offering, any relic from the pool."
    loadImage('theme_neutral',          'assets/themes/theme_neutral.png'),

    // ── DOOR MEDALLION ICONS — what's beyond each door ──────────────
    // PixelLab-generated 64×64 sprites that replace the procedural
    // silhouettes in doorPortals.js's iconKind switch.
    //
    // Reduced from 14 keys to 8 — the door's RIM COLOR + HALO PULSE +
    // AFFIX SUB-LABEL already distinguish things the icon was also
    // trying to convey, so 4 icons collapse via aliasing in
    // doorPortals.js's _spriteKeyMap:
    //   fusion / legendary  → door_mythic  (star — rim carries tier)
    //   challenge           → door_boss    (skull — rim/halo carry intensity)
    //   miniboss / elite    → door_boss    (skull — affix label distinguishes)
    //   trove               → door_chest   (chest — bronze rim says "loot")
    //
    // Sprite-first lookup with procedural fallback — missing PNGs just
    // log a console warning and the door keeps its current rendering.
    loadImage('door_combat',            'assets/door_icons/door_combat.png'),
    loadImage('door_mythic',            'assets/door_icons/door_mythic.png'),
    loadImage('door_boss',              'assets/door_icons/door_boss.png'),
    loadImage('door_altar',             'assets/door_icons/door_altar.png'),
    loadImage('door_shop',              'assets/door_icons/door_shop.png'),
    loadImage('door_sanctuary',         'assets/door_icons/door_sanctuary.png'),
    loadImage('door_event',             'assets/door_icons/door_event.png'),
    loadImage('door_chest',             'assets/door_icons/door_chest.png'),

    // ── PICKUP DROPS — coin/heart/soul/key ground items ─────────────
    // Google-Studio-generated 32×32 sprites sliced from sheet_drops.jpg
    // by scripts/pixellab/import-gs-sheets.js. Currently only `coin` is
    // wired (gold.js drawGold uses it as a sprite-first lookup with a
    // procedural fallback for the per-pixel rect coin). heart/soul/key
    // are loaded so future pickup systems can use images.pickup_<id>
    // without further loader changes.
    loadImage('pickup_coin',            'assets/pickups/coin.png'),
    loadImage('pickup_heart',           'assets/pickups/heart.png'),
    loadImage('pickup_soul',            'assets/pickups/soul.png'),
    loadImage('pickup_key',             'assets/pickups/key.png'),

    // ── FLOOR DECALS — atmospheric scatter for dungeon floor tiles ──
    // Google-Studio-generated 32×32 sprites sliced from
    // sheet_floor_decals.jpg by scripts/pixellab/import-gs-sheets.js.
    // Replaces the lone procedural "crack" decor with 16 variants the
    // room generator scatters. The crack-spawn loop in room.js maps
    // a hash to one of these decal_<id> keys; missing PNGs fall through
    // to the procedural drawCrack as a safety net.
    loadImage('decal_bone',             'assets/decor/decal_bone.png'),
    loadImage('decal_skull',            'assets/decor/decal_skull.png'),
    loadImage('decal_crack',            'assets/decor/decal_crack.png'),
    loadImage('decal_blood',            'assets/decor/decal_blood.png'),
    loadImage('decal_mushroom',         'assets/decor/decal_mushroom.png'),
    loadImage('decal_leaves',           'assets/decor/decal_leaves.png'),
    loadImage('decal_claws',            'assets/decor/decal_claws.png'),
    loadImage('decal_shards',           'assets/decor/decal_shards.png'),
    loadImage('decal_arrow',            'assets/decor/decal_arrow.png'),
    loadImage('decal_web',              'assets/decor/decal_web.png'),
    loadImage('decal_rune',             'assets/decor/decal_rune.png'),
    loadImage('decal_candle',           'assets/decor/decal_candle.png'),
    loadImage('decal_scroll',           'assets/decor/decal_scroll.png'),
    loadImage('decal_pebbles',          'assets/decor/decal_pebbles.png'),
    loadImage('decal_scratches',        'assets/decor/decal_scratches.png'),
    loadImage('decal_dirt',             'assets/decor/decal_dirt.png'),

    // ── WALL SURFACE OVERLAYS — atmospheric stickers on north wall ──
    // Google-Studio-generated 48×48 sprites sliced from
    // sheet_wall_overlays.jpg by scripts/pixellab/import-gs-sheets.js.
    // Drawn ON TOP of north wall tiles (cosmetic only — never on doors)
    // by drawWallOverlays() in room.js. Per-kind palette filtering
    // matches the floor-decal system so combat rooms get blood/scorch/
    // claws/handprint while sanctuaries get ivy/moss/fresco. Cell 8
    // (crumbling brick) was intentionally skipped — see slicer config.
    loadImage('wall_overlay_cobweb',    'assets/decor/wall_overlay_cobweb.png'),
    loadImage('wall_overlay_crack_v',   'assets/decor/wall_overlay_crack_v.png'),
    loadImage('wall_overlay_crack_d',   'assets/decor/wall_overlay_crack_d.png'),
    loadImage('wall_overlay_blood',     'assets/decor/wall_overlay_blood.png'),
    loadImage('wall_overlay_scorch',    'assets/decor/wall_overlay_scorch.png'),
    loadImage('wall_overlay_claws',     'assets/decor/wall_overlay_claws.png'),
    loadImage('wall_overlay_arrows',    'assets/decor/wall_overlay_arrows.png'),
    loadImage('wall_overlay_ivy',       'assets/decor/wall_overlay_ivy.png'),
    loadImage('wall_overlay_damp',      'assets/decor/wall_overlay_damp.png'),
    loadImage('wall_overlay_mushroom',  'assets/decor/wall_overlay_mushroom.png'),
    loadImage('wall_overlay_moss',      'assets/decor/wall_overlay_moss.png'),
    loadImage('wall_overlay_rune',      'assets/decor/wall_overlay_rune.png'),
    loadImage('wall_overlay_fresco',    'assets/decor/wall_overlay_fresco.png'),
    loadImage('wall_overlay_chains',    'assets/decor/wall_overlay_chains.png'),
    loadImage('wall_overlay_handprint', 'assets/decor/wall_overlay_handprint.png'),

    // ── DUNGEON FX — animated/static props for dungeon rooms ─────────
    // Stored under hamlet/ for now (single asset folder); future
    // refactor could split into hamlet/ and dungeon/ subfolders.
    loadImage('fx_dungeon_torch',       'assets/hamlet/fx_dungeon_torch.png'),
    // PixelLab animated brazier sheets — KEPT (these read fine as
    // focal pieces; no playtest complaints). 7 horizontal frames ×
    // 64×64 native, base bottom-aligned. fx_dungeon_brazier is the
    // squat iron tripod (ambient room focal); fx_dungeon_pillar_brazier
    // is the tall stone column with flaming bowl (corridor focal).
    loadImage('fx_dungeon_brazier',         'assets/hamlet/fx_dungeon_brazier.png'),
    loadImage('fx_dungeon_pillar_brazier',  'assets/hamlet/fx_dungeon_pillar_brazier.png'),
    // Dungeon doors — two 4-frame open/close atlases per rotation.
    // 'door_s' = south rotation (door face points south toward player
    // who is south of the wall — used for NORTH-wall doors).
    // 'door_n' = north rotation (door face points north — used for
    // SOUTH-wall doors so the player walking out of a room sees the
    // door face them naturally, no vertical-flip artifact).
    // Each atlas is 448×112 (4 frames × 112×112 native).
    loadImage('dungeon_door_s',         'assets/dungeon/door_s.png'),
    loadImage('dungeon_door_n',         'assets/dungeon/door_n.png'),

    loadAudio('sword_swing',  'assets/sfx/sword_swing.ogg'),
    loadAudio('slime_hit',    'assets/sfx/slime_hit.ogg'),
    loadAudio('slime_death',  'assets/sfx/slime_death.ogg'),
    loadAudio('hero_hurt',    'assets/sfx/hero_hurt.ogg'),
    loadAudio('footstep_0',   'assets/sfx/footstep_0.ogg'),
    loadAudio('footstep_1',   'assets/sfx/footstep_1.ogg'),
    loadAudio('click',        'assets/sfx/click.ogg'),
  ];
  totalCount = promises.length;
  await Promise.all(promises);
  if (failed.length) console.warn(failed.length + ' asset(s) failed to load:', failed);
  else console.log('[slime-depths] all ' + totalCount + ' assets loaded');
}
