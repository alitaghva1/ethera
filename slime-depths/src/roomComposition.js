// ============================================================================
// ROOM COMPOSITION — vertical slice (Phase 1-3)
//
// Adds three new layers on top of the existing room generator without
// touching its core flow:
//
//   1. FLOOR ZONES — every floor tile gets a zone tag (threshold/combat/
//      focal-frame/alcove/wear). The renderer reads the tag to pick a
//      tone; gone are the random hash-driven dark squares + 22 procedural
//      detail patches that made rooms look "dirtied at random."
//
//   2. FOCAL POINTS — every eligible room kind gets ONE setpiece anchor
//      (obelisk / brazier / crater / altar / tomb / plinth). Procedural
//      pixel-art setpieces with subtle glow + contact shadow. Replaces
//      "rect with stuff at the edges" with "composed space around a
//      focal piece."
//
//   3. DOOR ARCHITECTURE — each north door gets stone arch framing,
//      jamb stones, and a threshold light pool. Doors stop reading
//      as "hole in wall," start reading as "passage."
//
// Vertical slice constraints (per design brief):
//   - No new shell library yet — zones are computed from existing room
//     dimensions + door positions
//   - No archetype rewrite — assignRoomFocal reads data.kind only
//   - No spawn changes — focal point is rendered, not gameplay-blocking
//   - All procedural — no asset additions required
// ============================================================================

import { TILE } from './room.js';

// ── FLOOR ZONES ─────────────────────────────────────────────────────────────
// Integer tags so floorZones can be a packed 2D number array.
// Order matters for drawZoneWear's path-priority logic.
export const FZ = Object.freeze({
  COMBAT:      0,    // default — clean, readable play space
  THRESHOLD:   1,    // ~3-tile patch around each interior door tile
  FOCAL_FRAME: 2,    // 5-tile cross around the focal anchor
  ALCOVE:      3,    // perimeter pockets near corners
  WEAR:        4,    // sparse paths door→focal + focal stain
});

// Tone offsets per zone (applied as +/- on R/G/B over the base floor color
// in drawFloorTile). KEPT subtle for THRESHOLD only — the warmth around
// the door reads as "swept entry."
//
// ALCOVE and WEAR were originally per-tile fills with offsets of -10 / -14;
// in playtest they read as discrete dark 1-tile squares scattered through
// the playable area — exactly the "random dark patches" problem the
// vertical slice was supposed to solve, just relocated. Polish lap: zero
// out the per-tile offsets for ALCOVE and WEAR; their visual contribution
// now comes from drawZoneOverlays (soft multi-tile gradient sweeps), not
// per-tile fills.
//
// FOCAL_FRAME tone offset also dropped — its visual signal is now the
// chisel-groove pattern in drawFloorTile, not a tone shift, so adjacent
// tiles don't read as a 5-tile colored cross.
const ZONE_TONE = {
  [FZ.COMBAT]:      { r:  0, g:  0, b:  0 },     // baseline
  [FZ.THRESHOLD]:   { r: +5, g: +4, b: +2 },     // slightly warmer/lighter near doors
  [FZ.FOCAL_FRAME]: { r:  0, g:  0, b:  0 },     // signal via chisel groove (drawFloorTile), not tone
  [FZ.ALCOVE]:      { r:  0, g:  0, b:  0 },     // signal via drawZoneOverlays radial vignette
  [FZ.WEAR]:        { r:  0, g:  0, b:  0 },     // signal via drawZoneOverlays soft path sweep
};

export function applyZoneTone(baseColor, zone) {
  // baseColor is a hex like '#3a2a36'. Returns a hex with the zone's offset
  // applied. Clamped 0..255. Used in drawFloorTile.
  const tone = ZONE_TONE[zone] || ZONE_TONE[FZ.COMBAT];
  if (tone.r === 0 && tone.g === 0 && tone.b === 0) return baseColor;
  const hex = baseColor.replace('#', '');
  const r = Math.max(0, Math.min(255, parseInt(hex.slice(0, 2), 16) + tone.r));
  const g = Math.max(0, Math.min(255, parseInt(hex.slice(2, 4), 16) + tone.g));
  const b = Math.max(0, Math.min(255, parseInt(hex.slice(4, 6), 16) + tone.b));
  return `rgb(${r},${g},${b})`;
}

// ── ROOM VISUAL PROFILES (room identity system) ─────────────────────────────
// Each room kind gets a profile that drives its visual + atmospheric
// signature. The goal: the player feels "I know what kind of room this is"
// within a 1-second look, without reading the UI label.
//
// A profile bundles:
//   focal           : recipe { kinds[], placement }  | null when chests/
//                                                      pedestals/urns ARE
//                                                      the room's natural
//                                                      attraction
//   floorTint       : { r, g, b, a }  RGB cast painted as ONE subtle full-
//                                     room overlay over the static floor.
//                                     Drives mood (warm = treasure/safety,
//                                     scorched = elite, cool = mystery).
//   vignetteScale   : multiplier on the existing edge-darkening pass.
//                     <1 = softer edges (treasure / sanctuary / shop —
//                     calmer composition), >1 = stronger edges (elite /
//                     boss — pressurized space).
//   propFamily      : metadata describing what KIND of decor reads right
//                     in this room. The drawing pipeline doesn't strictly
//                     enforce this yet — it's the spec for the next dressing
//                     pass — but documenting it here lets us audit at a
//                     glance whether existing prop placement is on-style.
//   moodLabel       : short human note for code readers.
//
// Design principles:
//   - The tint alpha is small (≤0.08). The cast is a hint, not a wash.
//     Enemies, projectiles, and the hero stay readable.
//   - No new particles, no new glow, no new clutter. Identity is achieved
//     via floor color + edge framing + focal signature.
//   - Combat is the BASELINE (zero tint, vignette ×1). Other kinds depart
//     from baseline in a controlled direction.
const ROOM_VISUAL_PROFILES = {
  // ── BASELINE: combat ─────────────────────────────────────────────────
  // Functional fight space. Clear, readable arena. Off-center focal.
  // No tint, standard vignette. The reference everyone else departs from.
  combat: {
    focal:         { kinds: ['obelisk', 'brazier'], placement: 'off-center' },
    floorTint:     null,
    vignetteScale: 1.00,
    propFamily:    'combat',     // urns + bones/banner/statue/rug/chest decor
    moodLabel:     'dangerous-but-functional',
  },

  // ── PRESSURE: challenge ──────────────────────────────────────────────
  // Forward focal, more wear, dimmer overall. Still combat — just
  // turned up.
  challenge: {
    focal:         { kinds: ['brazier'], placement: 'forward' },
    floorTint:     { r: -2, g: -3, b: -2, a: 0.06 },     // slight cool dim
    vignetteScale: 1.20,
    propFamily:    'combat-heavy',
    moodLabel:     'pressure-test',
  },

  // ── THREAT: elite ────────────────────────────────────────────────────
  // Ritual arena. Crater or brazier centered/forward. Floor reads
  // scorched. Edges close in.
  elite: {
    focal:         { kinds: ['crater', 'brazier'], placement: 'forward' },
    floorTint:     { r: 8, g: -2, b: -4, a: 0.06 },      // ember-warm scorch cast
    vignetteScale: 1.35,
    propFamily:    'sparse-bones',     // no rugs/banners — austere
    moodLabel:     'ritual-arena',
  },

  // ── REWARD (loot ceremony): chestroom ────────────────────────────────
  // Chests are the visual star. Symmetric framing. Cleaner floor,
  // warmer light, soft edges so the eye reads the chest layout.
  chestroom: {
    focal:         null,                                  // chests ARE the focus
    floorTint:     { r: 8, g: 5, b: -2, a: 0.07 },       // warm gold cast
    vignetteScale: 0.55,                                  // even, low-pressure
    propFamily:    'minimal-ceremonial',
    moodLabel:     'anticipation-of-loot',
  },

  // ── REWARD (urn pile): trove ─────────────────────────────────────────
  // Same warm bias as chestroom — urns are the show.
  trove: {
    focal:         null,
    floorTint:     { r: 8, g: 5, b: -2, a: 0.07 },
    vignetteScale: 0.55,
    propFamily:    'urn-cluster',
    moodLabel:     'anticipation-of-loot',
  },

  // ── SAFETY: sanctuary / reward ───────────────────────────────────────
  // Calm, reverent, soft. Altar focal centered. Cooler than treasure
  // (it's about peace, not gold) but still warm at the altar itself
  // (the altar's halo is its signature).
  sanctuary: {
    focal:         { kinds: ['altar'], placement: 'center' },
    floorTint:     { r: 4, g: 2, b: 0, a: 0.05 },        // gentle warm wash
    vignetteScale: 0.65,
    propFamily:    'sparse-ceremonial',
    moodLabel:     'breath-between-fights',
  },
  reward: {     // alias — same identity as sanctuary
    focal:         { kinds: ['altar'], placement: 'center' },
    floorTint:     { r: 4, g: 2, b: 0, a: 0.05 },
    vignetteScale: 0.65,
    propFamily:    'sparse-ceremonial',
    moodLabel:     'breath-between-fights',
  },

  // ── COST: altar (HP-cost relic room) ─────────────────────────────────
  // Same altar focal, but the floor reads scorched — this is the
  // dangerous version of sanctuary. Player should feel "this isn't
  // free" at a glance.
  altar: {
    focal:         { kinds: ['altar'], placement: 'center' },
    floorTint:     { r: 8, g: -2, b: -4, a: 0.06 },      // matches elite scorch
    vignetteScale: 1.20,
    propFamily:    'sparse-ceremonial',
    moodLabel:     'cost-not-gift',
  },

  // ── TRANSACTION: shop ────────────────────────────────────────────────
  // Distinct from chestroom — more "browsing display." Brightest
  // floor, evenest light, lowest vignette. Pedestals are the focus.
  shop: {
    focal:         null,
    floorTint:     { r: 10, g: 6, b: -2, a: 0.07 },      // brightest warm tint
    vignetteScale: 0.45,                                  // most even lighting
    propFamily:    'merchant-display',
    moodLabel:     'transaction-and-curiosity',
  },

  // ── MYSTERY: event ───────────────────────────────────────────────────
  // Visual hint that "something strange happens here." Cool/violet
  // floor cast distinguishes it from combat at a glance. Dedicated
  // GLYPH-CIRCLE focal — a flat-on-floor rune ring with a small standing
  // stone at center, glow pulsing through fissures in the stone.
  // Distinct silhouette from any combat focal (vertical) or treasure
  // focal (chest array) — instantly says "ritual / strange happens here."
  event: {
    focal:         { kinds: ['glyph_circle'], placement: 'center' },
    floorTint:     { r: -3, g: 0, b: 8, a: 0.06 },       // cool violet wash
    vignetteScale: 0.95,
    propFamily:    'minimal-ceremonial',
    moodLabel:     'choice-and-uncertainty',
  },

  // ── BOSS / MINIBOSS / START ──────────────────────────────────────────
  miniboss: {
    focal:         { kinds: ['tomb'], placement: 'center' },
    floorTint:     { r: 4, g: -2, b: -2, a: 0.06 },
    vignetteScale: 1.20,
    propFamily:    'sparse-bones',
    moodLabel:     'duel-arena',
  },
  boss: {
    focal:         { kinds: ['tomb'], placement: 'forward' },
    floorTint:     { r: 6, g: -2, b: -3, a: 0.07 },
    vignetteScale: 1.40,
    propFamily:    'sparse-bones',
    moodLabel:     'final-stand',
  },
  start: {
    focal:         null,
    floorTint:     null,
    vignetteScale: 0.85,
    propFamily:    'minimal',
    moodLabel:     'arrival',
  },
  hamlet: null,    // not a dungeon room
};

// Default profile for any kind not explicitly listed (defensive fallback).
const _DEFAULT_PROFILE = ROOM_VISUAL_PROFILES.combat;

// ── ROOM IDENTITY ACCESSORS ──────────────────────────────────────────────
// Per the design brief — each one reads from the central profile table
// so all per-kind data lives in one place. Callers should generally use
// applyRoomKindDressing(room) instead of poking these individually; the
// accessors are exported for code clarity + targeted use cases.

export function roomKindVisualProfile(kind) {
  return ROOM_VISUAL_PROFILES[kind] || _DEFAULT_PROFILE;
}

export function selectFocalForRoomKind(kind) {
  const profile = roomKindVisualProfile(kind);
  return profile && profile.focal ? profile.focal : null;
}

export function selectFloorTreatmentForRoomKind(kind) {
  const profile = roomKindVisualProfile(kind);
  return profile && profile.floorTint ? profile.floorTint : null;
}

export function selectLightingMoodForRoomKind(kind) {
  const profile = roomKindVisualProfile(kind);
  return {
    vignetteScale: profile && Number.isFinite(profile.vignetteScale)
      ? profile.vignetteScale : 1.0,
  };
}

export function selectPropFamilyForRoomKind(kind) {
  const profile = roomKindVisualProfile(kind);
  return profile && profile.propFamily ? profile.propFamily : 'combat';
}

// Sets room.kindProfile so the renderer can read floor tint + vignette
// scale per-frame without re-resolving the profile each tick. Called
// from buildRoomFromData after room.kind is set.
export function applyRoomKindDressing(room) {
  room.kindProfile = roomKindVisualProfile(room.kind);
  return room.kindProfile;
}

// ── PROP DRESSING RULES (composition by room kind) ──────────────────────────
// The visual profile gives a 1-second color/lighting read; this rule
// table goes the next step: it changes what props live in the room
// and where, so a treasure room ISN'T just "combat with a gold tint"
// and a sanctuary ISN'T just "combat with a soft vignette."
//
// Each rule operates on the runtime arrays already populated by
// buildRoomFromData (roomUrns, room.decor, roomDecorPillars). The
// rule can:
//   - filterDecor: keep only decor.kind values in this allowlist (or
//                  null = keep nothing). Removes unfit prop families
//                  per room (no "rugs" in elite arenas, no "chests"
//                  scattered in sanctuaries, etc.).
//   - urnPropDensity: 0..1 multiplier on isProp=true urns. 0 strips
//                  all decorative urns; 1 keeps them all. NEVER affects
//                  isProp=false urns — those are gameplay (trove
//                  containers, sanctuary altar flair).
//   - addStyle:    optional family-specific addition (currently only
//                  'merchant-display' for shops adds 4 prop urns at
//                  the side walls as merchandise).
//
// Density classification by family (target props after dressing):
//   combat            : medium       — baseline urns + 1-2 décor items
//   combat-heavy      : medium       — urns kept, soft décor stripped
//   sparse-bones      : low-medium   — halved urns, austere arena
//   minimal-ceremonial: very low     — chest array OR setpiece is the show
//   urn-cluster       : medium-high  — urns ARE the focus (trove)
//   sparse-ceremonial : very low     — altar carries the room
//   merchant-display  : medium       — pedestals + 4 display urns
//   minimal           : very low     — clean entrance
const PROP_DRESSING_RULES = {
  // Baseline — combat rooms keep what floor.js placed.
  'combat': null,

  // Challenge: still combat-shaped, but soft furnishings (rugs, banners,
  // statues, chests, rubble) read as "decoration in a fight" — strip them
  // so the room feels harder. Bones + cracks stay because they're
  // atmospheric grit, not furniture.
  'combat-heavy': {
    filterDecor:     ['bones', 'crack'],
    urnPropDensity:  0.85,
    addStyle:        null,
  },

  // Elite / miniboss / boss: ritual arena. No soft décor. Halved urn
  // count. The crater/tomb/brazier focal carries the room; everything
  // else gets out of the way.
  'sparse-bones': {
    filterDecor:     ['bones', 'crack', 'rubble'],
    urnPropDensity:  0.50,
    addStyle:        null,
  },

  // Treasure / chestroom / event: setpiece-first. Strip decorative urns
  // entirely; strip soft décor. The chest array, glyph circle, or
  // story object IS the room.
  'minimal-ceremonial': {
    filterDecor:     ['crack'],     // tiny floor cracks ok for atmosphere
    urnPropDensity:  0,
    addStyle:        null,
  },

  // Trove: urn cluster IS the loot. Keep all urns, strip non-urn
  // décor so the eye reads the urn pile as the show.
  'urn-cluster': {
    filterDecor:     ['crack'],
    urnPropDensity:  1.0,
    addStyle:        null,
  },

  // Sanctuary / reward: altar carries the room. Strip prop urns + most
  // décor; isProp=false sanctuary altar urns survive (they're flair the
  // generator deliberately placed at the heal pedestal flanks).
  'sparse-ceremonial': {
    filterDecor:     ['crack'],
    urnPropDensity:  0,
    addStyle:        null,
  },

  // Shop: merchant display. Strip everything generic, then add 4 prop
  // urns as "wares laid out for browsing" along the side walls.
  'merchant-display': {
    filterDecor:     ['crack'],
    urnPropDensity:  0,
    addStyle:        'merchant-display',
  },

  // Start: clean entrance. Strip everything decorative.
  'minimal': {
    filterDecor:     ['crack'],
    urnPropDensity:  0,
    addStyle:        null,
  },
};

// Mutates the room runtime arrays per the kind's PROP_DRESSING_RULES.
// Called from buildRoomFromData AFTER the floor.js data has been loaded
// into roomUrns / room.decor / roomDecorPillars but BEFORE the static
// tile cache is invalidated, so the next render picks up the dressed
// composition.
//
// Important: this NEVER touches isProp=false urns (those are
// gameplay-bearing — trove loot containers, sanctuary altar flair).
// Decorative chests/banners/etc. in room.decor ARE fair game because
// they don't gate any mechanic.
export function placeRoomKindProps(room, _runtime) {
  if (!room || !room.kindProfile) return;
  const family = room.kindProfile.propFamily;
  const rule = PROP_DRESSING_RULES[family];
  if (rule === undefined) return;     // unknown family — leave alone
  if (rule === null) return;          // 'combat' baseline — no changes

  const w = room.w | 0, h = room.h | 0;
  const seed = (room._detailSeed | 0) ^ ((w * 31 + h) * 13);

  // ── 1. Filter decor by allowlist ─────────────────────────────────────
  if (room.decor && Array.isArray(room.decor)) {
    const allowed = new Set(rule.filterDecor || []);
    room.decor = room.decor.filter(d => allowed.has(d.kind));
  }

  // ── 2. Thin out decorative (isProp=true) urns by density ─────────────
  // Runtime urn array lives on _runtime.roomUrns (passed in by caller
  // since the array is module-private to room.js). We mutate length
  // in place so other room.js helpers (urn collision, urn-hit etc.)
  // continue to read the same array reference.
  if (_runtime && _runtime.roomUrns && rule.urnPropDensity < 1) {
    const urns = _runtime.roomUrns;
    if (rule.urnPropDensity <= 0) {
      // Strip ALL decorative urns — keep only isProp=false urns.
      for (let i = urns.length - 1; i >= 0; i--) {
        if (urns[i].isProp) urns.splice(i, 1);
      }
    } else {
      // Partial keep — hash-deterministic sampling so reloading a
      // room produces the same dressed layout.
      let idx = 0;
      for (let i = urns.length - 1; i >= 0; i--) {
        if (!urns[i].isProp) continue;
        const keep = (_hash(seed + idx * 37, idx * 11) % 1000) < (rule.urnPropDensity * 1000);
        if (!keep) urns.splice(i, 1);
        idx++;
      }
    }
  }

  // ── 3. Add family-specific props ─────────────────────────────────────
  if (rule.addStyle === 'merchant-display' && _runtime && _runtime.roomUrns) {
    // 4 prop urns positioned symmetrically along the L/R walls,
    // upper + lower thirds, like merchandise on display. Skipped if
    // the chosen tile isn't floor (carved-shape rooms).
    const tiles = room.tiles;
    const slots = [
      { x: 2,     y: Math.floor(h * 0.32) },
      { x: 2,     y: Math.floor(h * 0.66) },
      { x: w - 3, y: Math.floor(h * 0.32) },
      { x: w - 3, y: Math.floor(h * 0.66) },
    ];
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      if (tiles?.[s.y]?.[s.x] !== 'floor') continue;
      _runtime.roomUrns.push({
        x: s.x, y: s.y,
        broken: false, breakT: 0,
        // Cycle variants 0..2 so the four display urns don't all
        // look identical — reads as a varied product line.
        variant: i % 3,
        isProp: true,        // sparse loot — these are merchandise, not trove
      });
    }
  }
}

// Hash helper — deterministic per room so reloading doesn't shuffle the
// chosen focal kind.
function _hash(a, b) {
  let h = (a * 73856093) ^ (b * 19349663);
  h = (h ^ (h >>> 13)) * 1274126177;
  return (h ^ (h >>> 16)) >>> 0;
}

export function assignRoomFocal(room) {
  const rule = selectFocalForRoomKind(room.kind);
  if (!rule) return null;
  const w = room.w | 0, h = room.h | 0;
  // Seed: room dims + kind length so it varies between rooms but is
  // stable per room.
  const seed = _hash(w * 31 + h, (room.kind || '').length * 17 + (room._detailSeed | 0));
  const kind = rule.kinds[seed % rule.kinds.length];

  // SHELL OVERRIDE — when the room was routed through an authored shell,
  // the focal POSITION is pre-authored on room.authoredFocal (the focal
  // KIND still comes from the visual profile, so each shell can host any
  // compatible focal piece — combat_arena rooms get obelisk OR brazier
  // depending on the kindHash, etc.).
  if (room.authoredFocal
      && Number.isFinite(room.authoredFocal.x)
      && Number.isFinite(room.authoredFocal.y)) {
    const ax = room.authoredFocal.x | 0;
    const ay = room.authoredFocal.y | 0;
    // Defensive: only honor if the authored tile is actually floor.
    const aTile = room.tiles?.[ay]?.[ax];
    if (aTile === 'floor') {
      return { kind, x: ax, y: ay };
    }
    // If the authored tile is somehow a pillar/wall (shouldn't happen
    // — applyAuthoredShell + validateShellPathing guarantee it's
    // floor, but tile placement could still race), fall through to
    // the procedural placement below.
  }

  const cx = Math.floor(w / 2);
  const cy = Math.floor(h / 2);
  let x = cx, y = cy;
  switch (rule.placement) {
    case 'off-center': {
      // Combat: shift 1-2 tiles off-center along one axis so the player
      // doesn't expect the room's geometric center to be empty. Direction
      // is hash-deterministic per room.
      const dirX = (seed >> 8) & 1 ? -1 : 1;
      const dirY = (seed >> 9) & 1 ? -1 : 1;
      x = cx + dirX * 2;
      y = cy + (((seed >> 10) & 1) ? dirY : 0);
      break;
    }
    case 'forward':
      // Elite/challenge/boss — pulled toward the back wall (north) so
      // the player walks INTO the room and meets it head-on.
      y = cy - 1;
      break;
    case 'center':
    default:
      x = cx; y = cy;
      break;
  }
  // Clamp to interior (perimeter is wall)
  x = Math.max(2, Math.min(w - 3, x));
  y = Math.max(2, Math.min(h - 3, y));
  // Ensure focal tile is floor (some shapes carve corners; if the chosen
  // anchor falls in a carved area, fall back to center).
  const tile = room.tiles?.[y]?.[x];
  if (tile && tile !== 'floor') {
    x = cx; y = cy;
  }
  return { kind, x, y };
}

// ── FLOOR ZONE BUILDER ──────────────────────────────────────────────────────
// Generates a 2D array of zone tags from the current room's geometry.
// Strategy:
//   1. Default every floor tile to COMBAT
//   2. Stamp THRESHOLD around interior side of each door
//   3. Stamp FOCAL_FRAME as a 5-tile cross around the focal anchor
//   4. Stamp ALCOVE in 2x2 patches near each interior corner
//   5. Stamp WEAR along straight-line paths from each door to the focal,
//      plus a small concentrated stain on the focal tile itself
//
// Run after room.tiles + room.focal are set. Wall/pillar/door cells stay
// untagged (we won't query them — only floor tiles get zone-tinted).
export function buildFloorZones(room) {
  const w = room.w | 0, h = room.h | 0;
  const zones = [];
  for (let y = 0; y < h; y++) {
    const r = new Array(w).fill(FZ.COMBAT);
    zones.push(r);
  }

  const isInteriorFloor = (x, y) => {
    if (x < 1 || x > w - 2 || y < 1 || y > h - 2) return false;
    const t = room.tiles?.[y]?.[x];
    return t === 'floor';
  };

  // 1. THRESHOLD — find door tiles, stamp 3-tile patch on the interior side.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (room.tiles?.[y]?.[x] !== 'door') continue;
      // Interior direction: north door (y=0) → step south (+y); south door (y=h-1) → step north (-y).
      const dy = (y === 0) ? 1 : -1;
      // 3-wide × 3-deep threshold patch, fading out with distance via
      // priority — closer tiles win over later overrides since we apply
      // FOCAL_FRAME and WEAR after.
      for (let oy = 0; oy < 3; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const tx = x + ox;
          const ty = y + dy * (1 + oy);
          if (isInteriorFloor(tx, ty)) {
            // Only stamp if still default — preserve any earlier non-default tag.
            if (zones[ty][tx] === FZ.COMBAT) {
              zones[ty][tx] = FZ.THRESHOLD;
            }
          }
        }
      }
    }
  }

  // 2. ALCOVE — 2x2 patches in each corner of the interior, only where
  //    floor tiles exist (carved corners simply produce empty alcoves).
  //    Reads as "the dim pockets where furniture would sit."
  const alcoveCorners = [
    { x: 1,     y: 1 },           // NW
    { x: w - 3, y: 1 },           // NE
    { x: 1,     y: h - 3 },       // SW
    { x: w - 3, y: h - 3 },       // SE
  ];
  for (const c of alcoveCorners) {
    for (let oy = 0; oy < 2; oy++) {
      for (let ox = 0; ox < 2; ox++) {
        const tx = c.x + ox, ty = c.y + oy;
        if (isInteriorFloor(tx, ty) && zones[ty][tx] === FZ.COMBAT) {
          zones[ty][tx] = FZ.ALCOVE;
        }
      }
    }
  }

  // 3. FOCAL_FRAME — 5-tile cross (plus shape) around the focal anchor.
  //    Runs AFTER threshold/alcove so it overrides where they overlap
  //    (the focal is the most important reading anchor).
  if (room.focal) {
    const fx = room.focal.x, fy = room.focal.y;
    const crossOffsets = [[0,0], [1,0], [-1,0], [0,1], [0,-1]];
    for (const [ox, oy] of crossOffsets) {
      const tx = fx + ox, ty = fy + oy;
      if (isInteriorFloor(tx, ty)) {
        zones[ty][tx] = FZ.FOCAL_FRAME;
      }
    }
  }

  // 4. WEAR — sparse paths from each door to the focal + a small stain
  //    on the focal itself. ONLY if focal exists; otherwise wear is just
  //    door-threshold tail.
  if (room.focal) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (room.tiles?.[y]?.[x] !== 'door') continue;
        const dy = (y === 0) ? 1 : -1;
        // Start one tile inside the threshold patch
        let tx = x, ty = y + dy * 4;
        const targetX = room.focal.x, targetY = room.focal.y;
        // Walk in a straight line, then turn — Manhattan path. Sparse
        // (every 2nd tile) so it doesn't read as a solid stripe.
        let step = 0;
        while (Math.abs(tx - targetX) + Math.abs(ty - targetY) > 1) {
          if (step % 2 === 0 && isInteriorFloor(tx, ty)) {
            // Don't override THRESHOLD or FOCAL_FRAME — those are higher priority
            if (zones[ty][tx] === FZ.COMBAT || zones[ty][tx] === FZ.ALCOVE) {
              zones[ty][tx] = FZ.WEAR;
            }
          }
          // Step toward target. Y-first then X for "walked in then turned" feel.
          if (ty !== targetY) ty += Math.sign(targetY - ty);
          else if (tx !== targetX) tx += Math.sign(targetX - tx);
          else break;
          step++;
          if (step > w + h) break;     // safety
        }
      }
    }
  }

  return zones;
}

// ── ZONE OVERLAYS (STATIC PASS) ─────────────────────────────────────────────
// Soft multi-tile gradient sweeps that replace the per-tile color fills
// for ALCOVE and WEAR. The earlier per-tile approach stamped 48-px solid
// dark squares scattered along the wear path + 2x2 corner blocks for
// alcoves, which read as "blocky noise" — same failure mode as the
// original random-patch system.
//
// New approach: paint ONE soft radial vignette per corner (alcove) and
// ONE soft swept-line gradient per door→focal path (wear). Both use
// large-radius gradients with low alpha so they fade smoothly across
// many tiles instead of stamping individual ones.
export function drawZoneOverlays(ctx, room) {
  if (!room.tiles) return;
  const w = room.w, h = room.h;
  ctx.save();

  // ── ALCOVE corner vignettes — soft radial darkening at each interior
  // corner. Anchored at the corner-tile center, fades out smoothly over
  // ~3 tiles. Skipped if the corner tile is wall (carved shape).
  const corners = [
    { tx: 1,     ty: 1 },          // NW
    { tx: w - 2, ty: 1 },          // NE
    { tx: 1,     ty: h - 2 },      // SW
    { tx: w - 2, ty: h - 2 },      // SE
  ];
  for (const c of corners) {
    if (room.tiles[c.ty]?.[c.tx] !== 'floor') continue;
    const cx = c.tx * TILE + TILE / 2;
    const cy = c.ty * TILE + TILE / 2;
    const radius = TILE * 2.4;     // ~115 px = 2.4 tiles, fades smoothly
    const grad = ctx.createRadialGradient(cx, cy, 4, cx, cy, radius);
    grad.addColorStop(0, 'rgba(0, 0, 0, 0.20)');
    grad.addColorStop(0.5, 'rgba(0, 0, 0, 0.08)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
  }

  // ── WEAR — soft path sweep from each door to the focal anchor. Drawn
  // as a series of overlapping radial blobs along the Manhattan path
  // computed in buildFloorZones. Each blob is small (~40 px radius) and
  // low alpha; the overlap creates a continuous scuff trail rather than
  // discrete tile patches.
  if (room.focal) {
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        if (room.tiles[dy]?.[dx] !== 'door') continue;
        const fromY = dy === 0 ? 1 : -1;
        // Walk from door interior tile toward focal, blob every other step
        let tx = dx, ty = dy + fromY * 4;
        const targetX = room.focal.x, targetY = room.focal.y;
        let step = 0;
        while (Math.abs(tx - targetX) + Math.abs(ty - targetY) > 1) {
          if (step % 2 === 0) {
            const cx = tx * TILE + TILE / 2;
            const cy = ty * TILE + TILE / 2;
            // Skip blobs that would land outside the room
            if (cx >= 0 && cy >= 0 && cx < w * TILE && cy < h * TILE) {
              const r = TILE * 0.85;
              const grad = ctx.createRadialGradient(cx, cy, 2, cx, cy, r);
              grad.addColorStop(0, 'rgba(0, 0, 0, 0.10)');
              grad.addColorStop(0.6, 'rgba(0, 0, 0, 0.04)');
              grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
              ctx.fillStyle = grad;
              ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
            }
          }
          if (ty !== targetY) ty += Math.sign(targetY - ty);
          else if (tx !== targetX) tx += Math.sign(targetX - tx);
          else break;
          step++;
          if (step > w + h) break;
        }
      }
    }
  }
  ctx.restore();
}

// ── FLOOR KIND TINT (STATIC PASS) ───────────────────────────────────────────
// Subtle full-floor RGB cast that gives each room kind its instant-read
// identity. Painted as ONE rectangular overlay on top of the floor tile
// pass, BEFORE walls/decor — so walls + props + focal pieces stay
// visually anchored at full saturation while the floor takes the cast.
//
// Cast values come from room.kindProfile.floorTint (see
// ROOM_VISUAL_PROFILES). Alphas are kept ≤0.08 by construction so the
// tint is a hint, not a wash. Skipped for room kinds with floorTint
// === null (combat, start) — those stay at the baseline floor color.
//
// Important: tint covers only the playable floor rect (1..w-1, 1..h-1)
// and drawn in screen-space order BEFORE walls, so the wall row + frieze
// do not pick up the tint and start looking like a different biome.
export function drawFloorKindTint(ctx, room) {
  if (!room || !room.kindProfile || !room.kindProfile.floorTint) return;
  const t = room.kindProfile.floorTint;
  const a = Math.max(0, Math.min(0.12, t.a || 0));
  if (a <= 0.005) return;
  // Tint maths — ZONE_TONE-style RGB offsets become an rgba(R,G,B,a)
  // overlay. Negative offsets flip sign and use the matching dark side
  // (gives a subtle cool/dim cast) by computing a base tone and biasing.
  // Simpler approach: render the offset as a solid color whose channels
  // are biased from mid-grey. Positive r → warm push; negative → cool.
  // We use absolute additive RGB on a near-mid-grey base.
  const base = 90;     // mid-grey reference
  const r = Math.max(0, Math.min(255, base + (t.r | 0)));
  const g = Math.max(0, Math.min(255, base + (t.g | 0)));
  const b = Math.max(0, Math.min(255, base + (t.b | 0)));
  // Only the interior — skip the perimeter wall row/column so walls
  // don't pick up the tint (would fight the static wall body color).
  const left   = TILE;
  const top    = TILE;
  const width  = (room.w - 2) * TILE;
  const height = (room.h - 2) * TILE;
  ctx.save();
  // 'overlay' would give the strongest tint but at the cost of
  // contrast spikes; 'multiply' darkens; 'lighter' brightens. Use
  // plain 'source-over' with low alpha — the most predictable.
  ctx.fillStyle = `rgba(${r},${g},${b},${a.toFixed(3)})`;
  ctx.fillRect(left, top, width, height);
  ctx.restore();
}

// ── ZONE WEAR (STATIC PASS) ─────────────────────────────────────────────────
// Adds a single concentrated stain UNDER the focal piece, color-keyed to
// focal kind. Replaces drawOrganicFloorDetail's 22 random patches.
// Drawn in the static cache pass so it persists; the focal piece itself
// renders dynamic on top.
export function drawZoneWear(ctx, room) {
  if (!room.focal) return;
  const fx = room.focal.x * TILE + TILE / 2;
  const fy = room.focal.y * TILE + TILE / 2;
  // Stain color + radius per focal kind. Subtle (alpha 0.15-0.25) so it
  // suggests "this thing has been here a while" without screaming.
  let stain;
  switch (room.focal.kind) {
    case 'crater':
      stain = { color: 'rgba(40, 12, 8, 0.30)', innerColor: 'rgba(80, 28, 12, 0.18)', r: 32 };
      break;
    case 'brazier':
      stain = { color: 'rgba(30, 16, 8, 0.22)', innerColor: 'rgba(60, 28, 12, 0.10)', r: 26 };
      break;
    case 'tomb':
      stain = { color: 'rgba(20, 12, 16, 0.22)', innerColor: 'rgba(40, 24, 32, 0.10)', r: 30 };
      break;
    case 'altar':
      stain = { color: 'rgba(255, 220, 160, 0.06)', innerColor: 'rgba(255, 220, 160, 0.04)', r: 28 };
      break;
    case 'glyph_circle':
      // Cool violet ring stain — matches the event-room floor cast
      stain = { color: 'rgba(60, 30, 100, 0.22)', innerColor: 'rgba(120, 80, 180, 0.10)', r: 30 };
      break;
    case 'plinth':
    case 'obelisk':
    default:
      stain = { color: 'rgba(0, 0, 0, 0.18)', innerColor: 'rgba(0, 0, 0, 0.10)', r: 24 };
      break;
  }
  const grad = ctx.createRadialGradient(fx, fy + 4, 1, fx, fy + 4, stain.r);
  grad.addColorStop(0, stain.innerColor);
  grad.addColorStop(0.5, stain.color);
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(fx - stain.r, fy + 4 - stain.r, stain.r * 2, stain.r * 2);
}

// ── FOCAL PIECE RENDERING (DYNAMIC PASS) ────────────────────────────────────
// Each setpiece is procedural pixel-art. Sized to read at top-down 1.0×
// camera zoom without dominating the player sprite. Heights kept ≤ 30 px
// so the player walking past doesn't get visually occluded.
// All draw the contact shadow first (under the piece), then body, then
// glow/animated detail.
//
// Anchor convention: cx,cy is the CENTER of the focal tile. Pieces draw
// with bottom edge near cy + 12 (slightly south of tile center) so they
// visually "sit on" the floor like the urn/pillar conventions.

export function drawFocal(ctx, focal, now) {
  if (!focal || !focal.kind) return;
  const cx = focal.x * TILE + TILE / 2;
  const cy = focal.y * TILE + TILE / 2;
  switch (focal.kind) {
    case 'obelisk':      _drawObelisk(ctx, cx, cy, now); break;
    case 'brazier':      _drawBrazier(ctx, cx, cy, now); break;
    case 'crater':       _drawCrater(ctx, cx, cy, now); break;
    case 'altar':        _drawFocalAltar(ctx, cx, cy, now); break;
    case 'tomb':         _drawTomb(ctx, cx, cy, now); break;
    case 'plinth':       _drawPlinth(ctx, cx, cy, now); break;
    case 'glyph_circle': _drawGlyphCircle(ctx, cx, cy, now); break;
  }
}

// Helper — soft contact shadow ellipse beneath the piece.
function _shadow(ctx, cx, cy, w, h, alpha = 0.45) {
  ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
  ctx.beginPath();
  ctx.ellipse(cx, cy + 10, w, h, 0, 0, Math.PI * 2);
  ctx.fill();
}

// OBELISK — narrow tall stone column with a faint rune. Combat-room flavor.
// Total visible: 16w × 28h. Polish lap: lifted body + capstone tones one
// step lighter so the silhouette reads against the dark floor instead of
// blending in (#3a2e34 → #4a3a42, #5a4a52 → #6a5a62 etc.). Rune halo
// radius bumped 10 → 14 and core alpha 0.30 → 0.42 so the focal point
// catches the eye in 1 second.
function _drawObelisk(ctx, cx, cy, now) {
  _shadow(ctx, cx, cy, 12, 4, 0.55);
  // Base — wider trapezoidal foot
  ctx.fillStyle = '#1a1218';
  ctx.fillRect(cx - 11, cy + 6, 22, 6);
  ctx.fillStyle = '#3a2e34';
  ctx.fillRect(cx - 10, cy + 7, 20, 4);
  ctx.fillStyle = '#4a3e44';
  ctx.fillRect(cx - 10, cy + 7, 20, 1);
  // Body — tapered column. Lifted mid-tone so it reads against dark floor.
  ctx.fillStyle = '#1a1218';
  ctx.fillRect(cx - 7, cy - 14, 14, 22);
  ctx.fillStyle = '#4a3a42';
  ctx.fillRect(cx - 6, cy - 13, 12, 20);
  // Light edge highlight (left side, simulates upper-left light)
  ctx.fillStyle = '#6a5a62';
  ctx.fillRect(cx - 6, cy - 13, 2, 20);
  // Capstone — slightly wider top, brighter cap so apex catches the eye
  ctx.fillStyle = '#1a1218';
  ctx.fillRect(cx - 8, cy - 16, 16, 3);
  ctx.fillStyle = '#6a5a62';
  ctx.fillRect(cx - 7, cy - 15, 14, 2);
  ctx.fillStyle = '#8a7a82';
  ctx.fillRect(cx - 7, cy - 15, 14, 1);
  // Rune — single bright glyph mid-column.
  ctx.fillStyle = '#c0e8f4';
  ctx.fillRect(cx - 1, cy - 6, 2, 2);
  ctx.fillRect(cx - 2, cy - 5, 1, 1);
  ctx.fillRect(cx + 1, cy - 5, 1, 1);
  ctx.fillRect(cx - 1, cy - 4, 2, 1);
  // Soft cyan glow halo around rune — bumped radius + alpha so the
  // focal reads from across the room.
  const glow = ctx.createRadialGradient(cx, cy - 5, 1, cx, cy - 5, 14);
  const pulse = 0.65 + 0.15 * Math.sin(now * 1.4);
  glow.addColorStop(0, `rgba(160, 216, 232, ${(0.42 * pulse).toFixed(3)})`);
  glow.addColorStop(0.5, `rgba(160, 216, 232, ${(0.18 * pulse).toFixed(3)})`);
  glow.addColorStop(1, 'rgba(160, 216, 232, 0)');
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = glow;
  ctx.fillRect(cx - 14, cy - 19, 28, 28);
  ctx.restore();
}

// BRAZIER — stone bowl with flickering flame. Warm, inviting.
// Total visible: 24w × 22h.
function _drawBrazier(ctx, cx, cy, now) {
  _shadow(ctx, cx, cy, 14, 4, 0.45);
  // Pedestal stem
  ctx.fillStyle = '#1a1218';
  ctx.fillRect(cx - 4, cy + 0, 8, 10);
  ctx.fillStyle = '#3a2a30';
  ctx.fillRect(cx - 3, cy + 1, 6, 8);
  // Bowl rim (wider than stem)
  ctx.fillStyle = '#1a1218';
  ctx.fillRect(cx - 12, cy - 4, 24, 5);
  ctx.fillStyle = '#4a3a40';
  ctx.fillRect(cx - 11, cy - 3, 22, 3);
  ctx.fillStyle = '#2a2028';
  ctx.fillRect(cx - 10, cy - 2, 20, 1);
  // Bowl interior — dark
  ctx.fillStyle = '#0a0608';
  ctx.fillRect(cx - 9, cy - 3, 18, 2);
  // Flame — flickering procedural shape, 3 layers
  const flick = 0.85 + 0.15 * Math.sin(now * 7.3);
  const flameH = 12 * flick;
  // Outer flame (red-orange)
  ctx.fillStyle = `rgba(220, 80, 30, ${(0.85 * flick).toFixed(3)})`;
  ctx.beginPath();
  ctx.moveTo(cx - 5, cy - 4);
  ctx.lineTo(cx + 5, cy - 4);
  ctx.lineTo(cx + 3, cy - flameH);
  ctx.lineTo(cx - 3, cy - flameH);
  ctx.closePath();
  ctx.fill();
  // Mid flame (orange)
  ctx.fillStyle = `rgba(255, 150, 60, ${(0.90 * flick).toFixed(3)})`;
  ctx.beginPath();
  ctx.moveTo(cx - 3, cy - 4);
  ctx.lineTo(cx + 3, cy - 4);
  ctx.lineTo(cx + 1.5, cy - flameH * 0.85);
  ctx.lineTo(cx - 1.5, cy - flameH * 0.85);
  ctx.closePath();
  ctx.fill();
  // Inner core (bright yellow)
  ctx.fillStyle = `rgba(255, 240, 180, ${(0.95 * flick).toFixed(3)})`;
  ctx.fillRect(cx - 1, cy - flameH * 0.7, 2, 4);
  // Warm halo
  const halo = ctx.createRadialGradient(cx, cy - 5, 2, cx, cy - 5, 28);
  halo.addColorStop(0, `rgba(255, 180, 100, ${(0.35 * flick).toFixed(3)})`);
  halo.addColorStop(0.5, `rgba(220, 120, 60, ${(0.18 * flick).toFixed(3)})`);
  halo.addColorStop(1, 'rgba(180, 60, 30, 0)');
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = halo;
  ctx.fillRect(cx - 28, cy - 33, 56, 56);
  ctx.restore();
}

// CRATER — recessed pit with glowing cracks. Reads as "danger / hazard."
// Mostly flat — height ≤ 8 px. Used for elite rooms.
function _drawCrater(ctx, cx, cy, now) {
  // No upward shadow — crater is below floor level. Instead darken the
  // surrounding tiles via a vignette-style gradient.
  const dark = ctx.createRadialGradient(cx, cy, 4, cx, cy, 24);
  dark.addColorStop(0, 'rgba(0, 0, 0, 0.85)');
  dark.addColorStop(0.6, 'rgba(0, 0, 0, 0.50)');
  dark.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.ellipse(cx, cy, 20, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  // Inner pit — even darker
  ctx.fillStyle = '#0a0408';
  ctx.beginPath();
  ctx.ellipse(cx, cy, 16, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  // Glowing cracks radiating outward — 4 cracks at 90° offsets, slight angle jitter
  const flick = 0.75 + 0.25 * Math.sin(now * 4.5);
  ctx.strokeStyle = `rgba(255, 120, 60, ${(0.80 * flick).toFixed(3)})`;
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 4; i++) {
    const ang = (i / 4) * Math.PI * 2 + 0.3;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(ang) * 4, cy + Math.sin(ang) * 2);
    ctx.lineTo(cx + Math.cos(ang) * 14, cy + Math.sin(ang) * 7);
    ctx.stroke();
  }
  // Bright center
  ctx.fillStyle = `rgba(255, 200, 120, ${(0.55 * flick).toFixed(3)})`;
  ctx.fillRect(cx - 1, cy - 1, 2, 2);
  // Heat halo
  const halo = ctx.createRadialGradient(cx, cy, 1, cx, cy, 30);
  halo.addColorStop(0, `rgba(255, 120, 50, ${(0.25 * flick).toFixed(3)})`);
  halo.addColorStop(0.5, `rgba(200, 60, 30, ${(0.10 * flick).toFixed(3)})`);
  halo.addColorStop(1, 'rgba(160, 30, 20, 0)');
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = halo;
  ctx.fillRect(cx - 30, cy - 30, 60, 60);
  ctx.restore();
}

// FOCAL ALTAR — stepped slab with bowl. Sanctuary/reward focal piece.
// Different from the existing 'altar' tile (HP-cost room) — this is a
// purely visual setpiece. 32w × 18h.
function _drawFocalAltar(ctx, cx, cy, now) {
  _shadow(ctx, cx, cy, 18, 5, 0.40);
  // Base (wider step)
  ctx.fillStyle = '#1a1418';
  ctx.fillRect(cx - 16, cy + 2, 32, 8);
  ctx.fillStyle = '#3a3034';
  ctx.fillRect(cx - 15, cy + 3, 30, 6);
  ctx.fillStyle = '#5a4a4e';
  ctx.fillRect(cx - 15, cy + 3, 30, 1);
  // Top slab (narrower step)
  ctx.fillStyle = '#1a1418';
  ctx.fillRect(cx - 11, cy - 3, 22, 6);
  ctx.fillStyle = '#4a3e42';
  ctx.fillRect(cx - 10, cy - 2, 20, 4);
  ctx.fillStyle = '#6a5a5e';
  ctx.fillRect(cx - 10, cy - 2, 20, 1);
  // Bowl indent — small darker oval centered on top slab
  ctx.fillStyle = '#1a1018';
  ctx.beginPath();
  ctx.ellipse(cx, cy + 1, 5, 1.5, 0, 0, Math.PI * 2);
  ctx.fill();
  // Warm glow from bowl
  const pulse = 0.70 + 0.20 * Math.sin(now * 1.7);
  const glow = ctx.createRadialGradient(cx, cy - 1, 1, cx, cy - 1, 18);
  glow.addColorStop(0, `rgba(255, 220, 160, ${(0.45 * pulse).toFixed(3)})`);
  glow.addColorStop(0.5, `rgba(255, 180, 100, ${(0.18 * pulse).toFixed(3)})`);
  glow.addColorStop(1, 'rgba(220, 130, 60, 0)');
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = glow;
  ctx.fillRect(cx - 18, cy - 19, 36, 36);
  ctx.restore();
  // Tiny bright core in bowl
  ctx.fillStyle = `rgba(255, 240, 200, ${(0.85 * pulse).toFixed(3)})`;
  ctx.fillRect(cx - 1, cy, 2, 1);
}

// TOMB — sarcophagus. Mini-boss / boss focal.
// 36w × 22h. Wider, flatter — won't dominate the player.
function _drawTomb(ctx, cx, cy, now) {
  _shadow(ctx, cx, cy, 20, 5, 0.55);
  // Base plinth
  ctx.fillStyle = '#0a0810';
  ctx.fillRect(cx - 18, cy + 4, 36, 6);
  ctx.fillStyle = '#1a1820';
  ctx.fillRect(cx - 17, cy + 5, 34, 4);
  // Sarcophagus body
  ctx.fillStyle = '#0a0810';
  ctx.fillRect(cx - 16, cy - 8, 32, 13);
  ctx.fillStyle = '#2a2832';
  ctx.fillRect(cx - 15, cy - 7, 30, 11);
  // Lid — slightly raised band along top
  ctx.fillStyle = '#3a3842';
  ctx.fillRect(cx - 15, cy - 7, 30, 4);
  ctx.fillStyle = '#4a4852';
  ctx.fillRect(cx - 15, cy - 7, 30, 1);
  // Carved cross / ornament centered on lid
  ctx.fillStyle = '#5a5862';
  ctx.fillRect(cx - 1, cy - 6, 2, 8);     // vertical
  ctx.fillRect(cx - 4, cy - 4, 8, 2);     // horizontal
  // Edge details — corner stones
  ctx.fillStyle = '#1a1820';
  ctx.fillRect(cx - 16, cy - 8, 3, 3);
  ctx.fillRect(cx + 13, cy - 8, 3, 3);
  ctx.fillRect(cx - 16, cy + 2, 3, 3);
  ctx.fillRect(cx + 13, cy + 2, 3, 3);
  // Faint mist halo — purple/cool
  const pulse = 0.50 + 0.15 * Math.sin(now * 0.9);
  const halo = ctx.createRadialGradient(cx, cy - 2, 1, cx, cy - 2, 26);
  halo.addColorStop(0, `rgba(140, 120, 180, ${(0.18 * pulse).toFixed(3)})`);
  halo.addColorStop(1, 'rgba(80, 60, 120, 0)');
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = halo;
  ctx.fillRect(cx - 26, cy - 28, 52, 52);
  ctx.restore();
}

// GLYPH CIRCLE — flat ground rune ring with a small cracked monolith
// at center. Event-room signature focal. Distinct silhouette from any
// other focal: the ring is FLAT (recessed into the floor — no vertical
// stack), and the center stone is short (~16 px tall) with a glowing
// vertical fissure that pulses violet/cyan. Reads as "ritual / strange
// happens here" before the player can read the door label.
//
// Composition: outer dark stone ring, inner lighter ring, 4 rune marks
// at compass points (cycle hue slowly), central monolith with vertical
// crack, soft violet halo over everything. No fire, no smoke — distinct
// from brazier. Animated via `now`.
function _drawGlyphCircle(ctx, cx, cy, now) {
  // No upward shadow — the ring is INSET into the floor. Use a soft
  // surrounding darken instead so the circle reads as "carved into stone."
  ctx.save();
  // Background recess vignette — slight bowl darkening.
  const recess = ctx.createRadialGradient(cx, cy, 4, cx, cy, 26);
  recess.addColorStop(0, 'rgba(0, 0, 0, 0.45)');
  recess.addColorStop(0.7, 'rgba(0, 0, 0, 0.20)');
  recess.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = recess;
  ctx.beginPath();
  ctx.ellipse(cx, cy, 22, 11, 0, 0, Math.PI * 2);
  ctx.fill();

  // ── Outer stone ring — dark carved channel ──────────────────────
  ctx.strokeStyle = '#1a1018';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.ellipse(cx, cy, 18, 9, 0, 0, Math.PI * 2);
  ctx.stroke();
  // Inner edge highlight — slightly lighter
  ctx.strokeStyle = '#3a2a3c';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(cx, cy, 17, 8.5, 0, 0, Math.PI * 2);
  ctx.stroke();

  // ── 4 rune marks at compass points — pulse violet/cyan in unison ─
  const pulse = 0.55 + 0.30 * Math.sin(now * 1.6);
  const runeColor = `rgba(170, 130, 230, ${(0.55 + 0.30 * pulse).toFixed(3)})`;
  // North rune
  ctx.fillStyle = runeColor;
  ctx.fillRect(cx - 1, cy - 10, 2, 3);
  ctx.fillRect(cx - 2, cy - 9, 4, 1);
  // South rune
  ctx.fillRect(cx - 1, cy + 7, 2, 3);
  ctx.fillRect(cx - 2, cy + 9, 4, 1);
  // East rune
  ctx.fillRect(cx + 16, cy - 1, 3, 2);
  ctx.fillRect(cx + 17, cy - 2, 1, 4);
  // West rune
  ctx.fillRect(cx - 19, cy - 1, 3, 2);
  ctx.fillRect(cx - 18, cy - 2, 1, 4);

  // ── Central monolith — short cracked standing stone ──────────────
  // Compact (~12w × 18h) so it doesn't visually fight the player sprite.
  const monoTop = cy - 14;
  // Stone outline
  ctx.fillStyle = '#0a0810';
  ctx.fillRect(cx - 6, monoTop, 12, 18);
  // Stone body
  ctx.fillStyle = '#2a2034';
  ctx.fillRect(cx - 5, monoTop + 1, 10, 16);
  // Light edge (left side)
  ctx.fillStyle = '#4a3a52';
  ctx.fillRect(cx - 5, monoTop + 1, 1, 16);
  // Top capstone
  ctx.fillStyle = '#3a2a44';
  ctx.fillRect(cx - 5, monoTop, 10, 1);

  // ── Vertical fissure with glowing core ──────────────────────────
  ctx.fillStyle = '#0a0810';
  ctx.fillRect(cx - 1, monoTop + 3, 2, 13);
  // Glowing core — pulses
  const corePulse = 0.65 + 0.35 * Math.sin(now * 2.3);
  ctx.fillStyle = `rgba(180, 140, 240, ${(0.85 * corePulse).toFixed(3)})`;
  ctx.fillRect(cx, monoTop + 4, 1, 11);
  // Hot center pixel near monolith middle
  ctx.fillStyle = `rgba(220, 200, 255, ${(0.95 * corePulse).toFixed(3)})`;
  ctx.fillRect(cx, monoTop + 8, 1, 3);

  // ── Soft violet halo over the whole setpiece ─────────────────────
  const halo = ctx.createRadialGradient(cx, cy - 4, 2, cx, cy - 4, 32);
  halo.addColorStop(0, `rgba(160, 110, 220, ${(0.30 * pulse).toFixed(3)})`);
  halo.addColorStop(0.5, `rgba(120, 80, 180, ${(0.14 * pulse).toFixed(3)})`);
  halo.addColorStop(1, 'rgba(80, 50, 140, 0)');
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = halo;
  ctx.fillRect(cx - 32, cy - 36, 64, 64);
  ctx.restore();
}

// PLINTH — slim pedestal. (Reserved — not used by current FOCAL_RULES
// since chestroom/shop already have their own attractions, but
// available if called.)
function _drawPlinth(ctx, cx, cy, _now) {
  _shadow(ctx, cx, cy, 10, 3, 0.40);
  // Base
  ctx.fillStyle = '#1a1218';
  ctx.fillRect(cx - 9, cy + 4, 18, 6);
  ctx.fillStyle = '#3a2e34';
  ctx.fillRect(cx - 8, cy + 5, 16, 4);
  // Body
  ctx.fillStyle = '#1a1218';
  ctx.fillRect(cx - 6, cy - 12, 12, 16);
  ctx.fillStyle = '#3a2e34';
  ctx.fillRect(cx - 5, cy - 11, 10, 14);
  // Top
  ctx.fillStyle = '#1a1218';
  ctx.fillRect(cx - 8, cy - 14, 16, 3);
  ctx.fillStyle = '#5a4a50';
  ctx.fillRect(cx - 7, cy - 13, 14, 1);
  // Gold rim
  ctx.fillStyle = 'rgba(201, 168, 106, 0.8)';
  ctx.fillRect(cx - 7, cy - 12, 14, 1);
}

// ── DOOR ARCHITECTURE ───────────────────────────────────────────────────────
// Stone arch + jamb stones + threshold light pool above each NORTH door.
// Drawn in the dynamic pass so light can pulse subtly. Subtle by design —
// the door is information-rich already (kind icon, label, sealed state),
// so the architecture is structural framing, not flashy.
//
// South doors are typically the entry — player walks through them bottom-up
// — and sit at y=h-1, often clipped by camera. We don't frame them.
export function drawDoorArchitecture(ctx, room, now) {
  if (!room.tiles) return;
  for (let x = 0; x < room.w; x++) {
    if (room.tiles[0]?.[x] !== 'door') continue;
    _drawDoorArch(ctx, x, 0, now);
  }
}

function _drawDoorArch(ctx, tx, ty, now) {
  const cx = tx * TILE + TILE / 2;
  // Door tile spans y=0 to y=TILE. The top wall body extends y=-32 to y=0
  // (drawTopWallBody) + frieze at y=-16 to y=0. The arch sits IN FRONT OF
  // the wall body, framing the door opening. Drawn at y=-12 to y=4 so
  // it overlaps the door tile top edge.
  const archTop = -10;
  const archHeight = 12;

  // ── Outer arch outline (1 px darker stone)
  ctx.fillStyle = '#0a0608';
  ctx.beginPath();
  ctx.moveTo(cx - 22, ty * TILE + archTop + archHeight);
  ctx.lineTo(cx - 22, ty * TILE + archTop + 4);
  ctx.quadraticCurveTo(cx - 22, ty * TILE + archTop - 4, cx, ty * TILE + archTop - 4);
  ctx.quadraticCurveTo(cx + 22, ty * TILE + archTop - 4, cx + 22, ty * TILE + archTop + 4);
  ctx.lineTo(cx + 22, ty * TILE + archTop + archHeight);
  ctx.lineTo(cx + 19, ty * TILE + archTop + archHeight);
  // Inner arch hollow — cut back through
  ctx.lineTo(cx + 19, ty * TILE + archTop + 4);
  ctx.quadraticCurveTo(cx + 19, ty * TILE + archTop - 1, cx, ty * TILE + archTop - 1);
  ctx.quadraticCurveTo(cx - 19, ty * TILE + archTop - 1, cx - 19, ty * TILE + archTop + 4);
  ctx.lineTo(cx - 19, ty * TILE + archTop + archHeight);
  ctx.closePath();
  ctx.fill();

  // ── Arch fill (mid stone)
  ctx.fillStyle = '#3a3034';
  ctx.beginPath();
  ctx.moveTo(cx - 21, ty * TILE + archTop + archHeight);
  ctx.lineTo(cx - 21, ty * TILE + archTop + 4);
  ctx.quadraticCurveTo(cx - 21, ty * TILE + archTop - 3, cx, ty * TILE + archTop - 3);
  ctx.quadraticCurveTo(cx + 21, ty * TILE + archTop - 3, cx + 21, ty * TILE + archTop + 4);
  ctx.lineTo(cx + 21, ty * TILE + archTop + archHeight);
  ctx.lineTo(cx + 20, ty * TILE + archTop + archHeight);
  ctx.lineTo(cx + 20, ty * TILE + archTop + 4);
  ctx.quadraticCurveTo(cx + 20, ty * TILE + archTop, cx, ty * TILE + archTop);
  ctx.quadraticCurveTo(cx - 20, ty * TILE + archTop, cx - 20, ty * TILE + archTop + 4);
  ctx.lineTo(cx - 20, ty * TILE + archTop + archHeight);
  ctx.closePath();
  ctx.fill();

  // ── Keystone — slightly lighter stone block at apex
  ctx.fillStyle = '#5a4a52';
  ctx.fillRect(cx - 3, ty * TILE + archTop - 4, 6, 4);
  ctx.fillStyle = '#7a6a72';
  ctx.fillRect(cx - 3, ty * TILE + archTop - 4, 6, 1);

  // ── Jamb stones — flanking blocks at the door base, set INTO the wall
  // a bit so they read as integrated stonework, not pasted on.
  ctx.fillStyle = '#0a0608';
  ctx.fillRect(cx - 24, ty * TILE + archTop + 8, 4, 12);
  ctx.fillRect(cx + 20, ty * TILE + archTop + 8, 4, 12);
  ctx.fillStyle = '#3a3034';
  ctx.fillRect(cx - 23, ty * TILE + archTop + 9, 2, 10);
  ctx.fillRect(cx + 21, ty * TILE + archTop + 9, 2, 10);

  // ── Threshold light pool — soft warm light bleeding from doorway
  // onto the floor tile directly below. Subtle so it doesn't fight the
  // existing torch/door light spill.
  const pulse = 0.85 + 0.10 * Math.sin(now * 2.1 + tx * 0.7);
  const pool = ctx.createRadialGradient(cx, ty * TILE + TILE * 1.1, 4, cx, ty * TILE + TILE * 1.1, 32);
  pool.addColorStop(0, `rgba(220, 180, 130, ${(0.18 * pulse).toFixed(3)})`);
  pool.addColorStop(0.5, `rgba(200, 140, 90, ${(0.08 * pulse).toFixed(3)})`);
  pool.addColorStop(1, 'rgba(160, 100, 60, 0)');
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = pool;
  ctx.fillRect(cx - 32, ty * TILE + TILE * 0.6, 64, TILE);
  ctx.restore();
}
