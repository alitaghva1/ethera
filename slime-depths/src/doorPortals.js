// ============================================================================
// DUNGEON DOORS — wall-integrated functional doors (Hades / Isaac feel).
//
// REWRITTEN from the earlier "floating sigil arches" pass per user feedback:
// the user wanted REAL doors that physically open and close — not decorative
// portals. Doors live IN the walls, animate open when unlocked, slam closed
// behind the hero on entry. This is what gives a roguelite the sense of
// "I'm exploring a real building" instead of "I'm picking nodes on a tree."
//
// State flow per door:
//   closed  → opening  → open      (north door unlocks on room clear)
//   open    → closing  → closed    (south door closes behind hero on entry)
//
// Multi-door north walls — a graph node with N outgoing edges spawns N
// door tiles spread across the north wall. Each carries its own target
// node + kind (combat/elite/event/etc.) for the sigil + transition.
//
// Public API:
//   setupRoomDoors(graph, currentNodeId)
//     Call when entering a new room. Wipes prior door state, populates
//     `roomDoors` from the current node's outgoing edges + the south entry.
//
//   updateDoors(dt) → targetNodeId | null
//     Per-frame tick. Returns a node id once the hero walks through an
//     OPEN north door (not just standing in the tile — actually crossed it).
//
//   onRoomCleared()
//     Triggers the north doors to start their opening animation.
//
//   isDoorBlocking(tx, ty) → boolean
//     For room.js's isWallAtWorld — returns true when the door at tile
//     (tx, ty) is currently closed or closing.
//
//   getDoorOpenAmount(tx, ty) → 0..1
//     For room.js's drawDoor — visual interpolation between closed and open.
//
//   getDoorMeta(tx, ty) → { kind, label } | null
//     Used to draw the sigil/label above north doors.
//
//   drawDoorLabels(ctx)
//     Renders the floating kind icon above each north door.
//
//   clearDoors()
//     Wipes all door state. Called on transition.
// ============================================================================

import { TILE, room } from './room.js';
import { hero } from './hero.js';
import { sparkle } from './particles.js';
import { playSfx } from './sfx.js';

// Animation timings (seconds)
const OPEN_DURATION  = 0.55;            // closed → open
const CLOSE_DURATION = 0.55;            // open → closed
// South door (entry) stays open this long after hero spawns before slamming
// closed. Long enough to register "you came from there", short enough not to
// invite walking back through.
const ENTRY_OPEN_DWELL = 0.55;

const KIND_GLYPHS = {
  combat:    '⚔', elite: '☠', event: '✦',
  sanctuary: '✚', reward: '✚', boss: '♛',
};
const KIND_LABELS = {
  combat:    'COMBAT',    elite: 'ELITE',  event: 'MYSTERY',
  sanctuary: 'REST',      reward: 'REST',  boss: 'THE BOSS',
};
const KIND_COLORS = {
  combat:    '#c8b894',   elite: '#e07070', event: '#c8a0ff',
  sanctuary: '#86e3a8',   reward: '#86e3a8', boss: '#ff9a55',
};
// Round-7 reward-chip palette — second tint per door, used for the
// reward suffix ("· GOLD ·" etc.). Sits BELOW the kind label so the
// player reads room type first, reward type second. Each color
// matches the reward's gameplay flavor:
//   gold      — warm gold, the coin pile
//   rare+     — soft gold-cream, matches the rare-tier pedestal ring
//   legendary — pink-lavender, matches the legendary-tier ring
//   heal      — sanctuary green, mirrors REST tint
//   fusion    — ember orange, matches the fusion banner
const REWARD_COLORS = {
  gold:      '#f4d9a0',
  'rare+':   '#ffd680',
  legendary: '#ffc8ff',
  heal:      '#86e3a8',
  fusion:    '#ffb265',
};
// Render-side labels for the reward chip. floorGraph.js maintains its
// own REWARD_LABELS for the game-internal API (rewardLabel(reward)) but
// duplicating the map here keeps doorPortals.js self-contained — the
// labels are display-only strings, not gameplay data.
const REWARD_LABELS = {
  gold:      'GOLD',
  'rare+':   'RARE+',
  legendary: 'LEGENDARY',
  heal:      'HEAL',
  fusion:    'FUSION',
};

// Active doors for the current room. Cleared between rooms.
// Each entry: { tx, ty, side: 'north'|'south', state, anim,
//               targetNodeId, kind, label, color, glyph,
//               sparkleAcc: number }
// (`heroPassedAt` was previously documented here but never written or
// read — hero-crossing detection uses the module-level _commitInFlight
// flag instead. Removed from the doc so the shape matches reality.)
export const roomDoors = [];

// One-shot guard to track that the hero stepped THROUGH (crossed the
// door tile from inside-room to wall row). Without this, simply standing
// on the door triggers the transition; we want the actual crossing.
let _commitInFlight = false;

// ────────────────────────────────────────────────────────────────────────────
// Setup — called from main.js on every loadRoom AFTER buildRoomFromData has
// populated tiles[]. Reads graph.outgoing edges + the room dims to place
// north doors evenly across the wall.
// ────────────────────────────────────────────────────────────────────────────
export function setupRoomDoors(graph, currentNodeId, opts = {}) {
  roomDoors.length = 0;
  _commitInFlight = false;
  const w = room.w;
  const h = room.h;

  // ── North exits — derived from the current graph node's outgoing edges.
  // For boss rooms (no outgoing) and dead-ends, no north doors are placed.
  if (graph && currentNodeId != null) {
    const node = graph.nodes.find(n => n.id === currentNodeId);
    if (node && node.edges && node.edges.length > 0) {
      const targets = node.edges
        .map(eid => graph.nodes.find(n => n.id === eid))
        .filter(Boolean);
      // Prefer the door X positions that the room build pass actually
      // carved tiles for (data.doorPlan.north). Falls back to the local
      // picker only when the caller didn't supply explicit positions —
      // otherwise the door OBJECT positions could disagree with the
      // door TILE positions (which would happen in shaped rooms where
      // computeDoorXs accounts for carve regions but pickDoorTilePositions
      // doesn't).
      const positions = (opts.doorXs && opts.doorXs.length === targets.length)
        ? opts.doorXs.slice()
        : pickDoorTilePositions(w, targets.length);
      for (let i = 0; i < targets.length; i++) {
        const t = targets[i];
        // Reward suffix — Round-7 Phase-1 of the rooms-redesign plan.
        // The reward chip tells the player WHAT they'll find before
        // walking through the door, turning every fork from "which
        // room kind?" into "which reward do I need right now?". Null
        // for boss + start; standard combat rooms can also be null
        // (the 20% no-bonus default — those just show "COMBAT").
        const rewardLabel = t.roomReward
          ? (REWARD_LABELS[t.roomReward] || t.roomReward.toUpperCase())
          : null;
        const rewardColor = t.roomReward ? (REWARD_COLORS[t.roomReward] || '#cccccc') : null;
        roomDoors.push({
          tx: positions[i],
          ty: 0,
          side: 'north',
          // North doors stay CLOSED until room is cleared. If the room
          // arrives already cleared (start room, sanctuary, trove), open
          // immediately so the hero can leave.
          state: room.cleared ? 'open' : 'closed',
          anim: room.cleared ? 1 : 0,
          targetNodeId: t.id,
          kind: t.kind,
          label: KIND_LABELS[t.kind] || (t.kind || '?').toUpperCase(),
          color: KIND_COLORS[t.kind] || '#cccccc',
          glyph: KIND_GLYPHS[t.kind] || '?',
          rewardLabel,
          rewardColor,
          sparkleAcc: 0,
        });
      }
    }
  }

  // ── South entry door — only present if the room actually has a south
  // exit (boss room has none; start room has none). Begins OPEN (visual:
  // hero can see where they came from), then closes after ENTRY_OPEN_DWELL.
  if (opts.hasSouthEntry !== false && room.doors && room.doors.south) {
    roomDoors.push({
      tx: Math.floor(w / 2),
      ty: h - 1,
      side: 'south',
      state: 'open',
      anim: 1,
      // Schedule the close after a short dwell — set in updateDoors.
      _entryDwell: ENTRY_OPEN_DWELL,
      sparkleAcc: 0,
    });
  }
}

// Pick N evenly-spaced tile X positions in the wall, leaving 2-tile padding
// from corners so doors never spawn against the perimeter wall corners.
function pickDoorTilePositions(roomW, n) {
  if (n === 1) return [Math.floor(roomW / 2)];
  const min = 3;                          // min tile X
  const max = roomW - 4;                  // max tile X
  const span = max - min;
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    out.push(Math.round(min + span * t));
  }
  // Dedupe (tiny rooms could collapse adjacent doors); ensure ≥ 3 tile gap
  for (let i = 1; i < out.length; i++) {
    if (out[i] - out[i - 1] < 3) out[i] = out[i - 1] + 3;
  }
  return out;
}

// ────────────────────────────────────────────────────────────────────────────
// Tick — animation + entry door dwell + hero-crossing detection.
// Returns { targetNodeId, doorTileX } once the hero walks through an open
// north door, else null. The doorTileX is used by the transition flow to
// align the prevRoom residue's door with the new room's south door.
// ────────────────────────────────────────────────────────────────────────────
export function updateDoors(dt) {
  let crossed = null;
  for (const d of roomDoors) {
    // Animation tick
    if (d.state === 'opening') {
      d.anim = Math.min(1, d.anim + dt / OPEN_DURATION);
      if (d.anim >= 1) d.state = 'open';
    } else if (d.state === 'closing') {
      d.anim = Math.max(0, d.anim - dt / CLOSE_DURATION);
      if (d.anim <= 0) d.state = 'closed';
    }

    // South door entry-dwell timer
    if (d.side === 'south' && d._entryDwell != null && d._entryDwell > 0) {
      d._entryDwell -= dt;
      if (d._entryDwell <= 0) {
        d._entryDwell = null;
        d.state = 'closing';
        playSfx('click', { rate: 0.6, volume: 0.45 });
      }
    }

    // Ambient particle drift through open north doors
    if (d.side === 'north' && d.state === 'open') {
      d.sparkleAcc += dt;
      if (d.sparkleAcc > 0.18) {
        d.sparkleAcc = 0;
        const cx = d.tx * TILE + TILE / 2 + (Math.random() - 0.5) * 18;
        const cy = d.ty * TILE + TILE / 2 + (Math.random() - 0.5) * 6;
        sparkle(cx, cy, d.color);
      }
    }

    // Hero-crossing detection — only for north doors that are FULLY open.
    // Crossed = hero center has moved into the door tile column AND is at
    // or above the door tile's center y. Once detected, return the target;
    // the caller is responsible for firing the transition.
    if (d.side === 'north' && d.state === 'open' && !_commitInFlight) {
      const heroTx = Math.floor(hero.x / TILE);
      const heroTy = Math.floor(hero.y / TILE);
      // Hero must be on the door tile or one tile below it (entering)
      if (heroTx === d.tx && (heroTy === d.ty || heroTy === d.ty + 1)) {
        crossed = { targetNodeId: d.targetNodeId, doorTileX: d.tx };
        _commitInFlight = true;
      }
    }
  }
  return crossed;
}

// Called by main.js the moment room.cleared flips true. Animates north
// doors from closed → opening. Uses a small stagger so multi-door walls
// have a satisfying ripple instead of all unlocking on the same frame.
export function onRoomCleared() {
  let stagger = 0;
  for (const d of roomDoors) {
    if (d.side !== 'north') continue;
    if (d.state === 'closed') {
      d.state = 'opening';
      d.anim = -stagger * 0.15;        // negative anim delays the open start
      stagger++;
    }
  }
  if (roomDoors.some(d => d.side === 'north')) {
    playSfx('click', { rate: 0.35, volume: 0.5 });
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Lookups for room.js — collision + rendering pull through these so the
// "single bool" door system doesn't need to know about animation state.
// ────────────────────────────────────────────────────────────────────────────
export function getDoorAt(tx, ty) {
  for (const d of roomDoors) {
    if (d.tx === tx && d.ty === ty) return d;
  }
  return null;
}

// True iff the door at (tx, ty) currently blocks movement.
// closed + closing block; opening + open allow passage.
export function isDoorBlocking(tx, ty) {
  const d = getDoorAt(tx, ty);
  if (!d) return false;
  if (d.state === 'open' || d.state === 'opening') return false;
  return true;
}

// Returns 0..1 for visual interpolation between closed (0) and open (1).
// Negative anim values (used for stagger) clamp to 0.
export function getDoorOpenAmount(tx, ty) {
  const d = getDoorAt(tx, ty);
  if (!d) return 0;
  return Math.max(0, Math.min(1, d.anim));
}

// Returns the door's metadata (kind, label, color, glyph) for label drawing.
export function getDoorMeta(tx, ty) {
  return getDoorAt(tx, ty);
}

// ────────────────────────────────────────────────────────────────────────────
// Render — sigil + label above each north door. Called inside the camera
// transform from main.js, after drawRoom (so labels float over the wall).
// ────────────────────────────────────────────────────────────────────────────
export function drawDoorLabels(ctx) {
  for (const d of roomDoors) {
    if (d.side !== 'north') continue;
    const cx = d.tx * TILE + TILE / 2;
    const cy = d.ty * TILE - 6;
    const openness = Math.max(0, Math.min(1, d.anim));

    // Sigil — color brightens as door opens
    const alpha = 0.55 + openness * 0.45;
    ctx.save();
    ctx.shadowColor = hexA(d.color, alpha);
    ctx.shadowBlur = 12;
    ctx.fillStyle = hexA(d.color, alpha);
    ctx.font = 'bold 22px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(d.glyph, cx, cy - 4);
    ctx.restore();

    // Label — gentle fade-in once door is partly open
    const labelAlpha = openness * 0.95;
    if (labelAlpha > 0.1) {
      ctx.save();
      ctx.font = '10px Georgia, "Cormorant Garamond", serif';
      ctx.fillStyle = hexA(d.color, labelAlpha);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
      ctx.shadowBlur = 4;
      ctx.fillText(d.label, cx, cy - 26);
      // Reward chip — Round-7 Phase 1. Reads as a second line below
      // the kind label, in the reward's own tint, so the player can
      // quick-scan "COMBAT · GOLD" at a glance. Null reward means the
      // room is a "default" combat with no special bias — render only
      // the kind label in that case (no empty chip line).
      if (d.rewardLabel) {
        ctx.font = 'italic 9px Georgia, "Cormorant Garamond", serif';
        ctx.fillStyle = hexA(d.rewardColor || d.color, labelAlpha * 0.92);
        ctx.fillText('· ' + d.rewardLabel + ' ·', cx, cy - 14);
      }
      ctx.restore();
    }
  }
}

// Wipe state — called at the start of every loadRoom before re-setup.
export function clearDoors() {
  roomDoors.length = 0;
  _commitInFlight = false;
}

// Release ONLY the crossing-detection lock without clearing roomDoors.
// Called by main.js when a hero-crossing event was reported by updateDoors
// but the caller could not dispatch a transition (e.g. graph state went
// stale, target node missing). Without this, _commitInFlight stays true
// forever and updateDoors stops reporting crossings — softlock with the
// hero standing on an open door.
export function releaseCrossingLock() {
  _commitInFlight = false;
}

// ── helper ──────────────────────────────────────────────────────────────────
function hexA(hex, a) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 'rgba(' + r + ',' + g + ',' + b + ',' + a.toFixed(3) + ')';
}
