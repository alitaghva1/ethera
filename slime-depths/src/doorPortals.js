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
// THEMES re-imported in the door-signal-priority pass — themes are
// now Tier 1 build-identity signals (ahead of FUSION/LEGENDARY/etc).
// The per-door theme glyph renders directly above the door using the
// procedural paths lifted from themes.js, replacing the prior corner-
// chip approach that lived inside the (now-deleted) card frame.
import { THEMES } from './themes.js';

// Animation timings (seconds)
const OPEN_DURATION  = 0.55;            // closed → open
const CLOSE_DURATION = 0.55;            // open → closed
// South door (entry) stays open this long after hero spawns before slamming
// closed. Long enough to register "you came from there", short enough not to
// invite walking back through.
const ENTRY_OPEN_DWELL = 0.55;

// Round-7 — extended kind tables to cover the resolved sub-kinds that
// makeEventRoom returns (altar / trove / chestroom / challenge / miniboss).
// Previously all these hid behind a single "MYSTERY" label, defeating the
// Hades-style "see your reward type" play. Each now has a distinct glyph,
// label, and color so the door reads its room identity at a glance.
const KIND_GLYPHS = {
  combat:    '⚔', elite:     '☠',  event:     '✦',
  sanctuary: '✚', reward:    '✚',  boss:      '♛',
  // Phase 3 audit fix #4 — chestroom glyph synced to mapScreen.js
  // (was ⊟ "squared minus", now ⊞ "squared plus" matching the map).
  // The squared-plus reads as a chest with a centered hinge/lock; the
  // minus had no chest-like silhouette. Map and door now show the
  // same glyph for the same room kind.
  altar:     '⛧', trove:     '◈',  chestroom: '⊞', challenge: '⚐',
  miniboss:  '♜', start:     '◇',  shop:      '⚖',
};
const KIND_LABELS = {
  combat:    'COMBAT',    elite:     'ELITE',     event:     'MYSTERY',
  sanctuary: 'REST',      reward:    'REST',      boss:      'THE BOSS',
  altar:     'ALTAR',     trove:     'TROVE',     chestroom: 'CHEST',
  challenge: 'CHALLENGE', miniboss:  'MINI-BOSS', start:     'START',
  shop:      'SHOP',
};
const KIND_COLORS = {
  combat:    '#c8b894',   elite:     '#e07070',   event:     '#c8a0ff',
  sanctuary: '#86e3a8',   reward:    '#86e3a8',   boss:      '#ff9a55',
  altar:     '#ff6a85',   trove:     '#f4d9a0',   chestroom: '#ffd680',
  challenge: '#ffb265',   miniboss:  '#e07070',   start:     '#c9a86a',
  shop:      '#86e3a8',   // sanctuary green tint — calm, transactional
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
// AFFIX_LABELS retired — the architectural-rendering pass uses the
// eliteAffixId directly as a switch key (frost / ember / venom /
// warded) and paints distinct environmental accents per affix
// (icicles, ember cracks, drips, shield sigils) instead of a text
// label. The label table is no longer referenced.
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
// Phase R-1 — reward sigils for the floating door card. Each reward type
// gets a unique iconographic glyph that's the player's primary read at
// the door, with the kind label as a secondary line beneath. Distinct
// from the kind glyphs (⚔/☠/✦) which sit in the corner badge of the
// card; these are the BIG icons the player sees from across the room.
// SIGIL_FONT_SIZE / REWARD_SIGILS retired — door identity is no longer
// a font-rendered glyph above the wall. The new layered architectural
// system in _drawDoorIdentity uses procedural shapes (theme washes,
// kind details, keystone seals, affix accents) painted directly onto
// the door tile, so per-unicode-char size normalization is moot.

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
        // Round-7 — actualKind exposes the resolved sub-kind for event
        // nodes (altar / trove / chestroom / challenge / miniboss) so
        // the door label reads "ALTAR" / "TROVE" instead of generic
        // "MYSTERY". Falls back to the graph kind for non-event nodes
        // and for any future kind that hasn't been wired through.
        const displayKind = t.actualKind || t.kind;
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
        // Round-7 Phase 5 — Blood Door seals. Sealed targets render
        // their door as a BLOOD GATE (red glyph + crimson tint + the
        // "PAY N HP" sub-label). The door stays closed even after
        // room.cleared until the player presses E to break the seal
        // (pays sealCost HP, see tryBreakSealNear).
        const sealed = !!t.sealed;
        const sealCost = sealed ? (t.sealCost || 1) : 0;
        roomDoors.push({
          tx: positions[i],
          ty: 0,
          side: 'north',
          // North doors stay CLOSED until room is cleared. If the room
          // arrives already cleared (start room, sanctuary, trove), open
          // immediately so the hero can leave. Sealed doors override:
          // they stay 'sealed' until the player pays the cost.
          state: sealed ? 'sealed' : (room.cleared ? 'open' : 'closed'),
          anim: !sealed && room.cleared ? 1 : 0,
          targetNodeId: t.id,
          kind: t.kind,
          // Sealed doors override the kind label with BLOOD GATE so the
          // player reads the THREAT before the destination type. (After
          // breaking the seal, the door reverts to its target kind so
          // the player can see what they unlocked.)
          label: sealed ? 'BLOOD GATE' : (KIND_LABELS[displayKind] || displayKind.toUpperCase()),
          // Crimson tint for sealed doors — visually distinct from the
          // existing elite-room red so the player learns the BLOOD GATE
          // signature is "red AND extra ornate".
          color: sealed ? '#d04050' : (KIND_COLORS[displayKind] || '#cccccc'),
          glyph: sealed ? '⛧' : (KIND_GLYPHS[displayKind] || '?'),
          rewardLabel: sealed ? `OFFER ${sealCost} HP` : rewardLabel,
          rewardColor: sealed ? '#ff8088' : rewardColor,
          // Phase 3 audit fix #1 — propagate the pre-rolled elite affix
          // so drawDoorLabels can render "ELITE · FROST" instead of
          // generic "ELITE". The affix was rolled at floorGraph build
          // time and stamped on every elite spawn so display matches
          // reality at room load.
          eliteAffixId: t.eliteAffixId || null,
          // Persist these so tryBreakSealNear can read sealCost and the
          // post-break path can swap label/glyph back to the target's
          // real kind/reward.
          sealed,
          sealCost,
          targetKind: displayKind,
          targetLabel: KIND_LABELS[displayKind] || displayKind.toUpperCase(),
          targetColor: KIND_COLORS[displayKind] || '#cccccc',
          targetGlyph: KIND_GLYPHS[displayKind] || '?',
          targetRewardLabel: rewardLabel,
          targetRewardColor: rewardColor,
          // Theme — pre-rolled at floor generation per Phase 2 of the
          // door-identity pass. When set, the door card renders a small
          // theme-colored glyph chip in the upper-right corner so the
          // player knows BEFORE walking through that this room offers
          // (e.g.) BLOOD-themed relics. null on combat/boss/start
          // and on the 40% mixed pedestal rooms.
          roomTheme: t.roomTheme || null,
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
//
// Round-7 Phase 5 — sealed doors stay 'sealed' through this transition;
// they only become passable after the player explicitly breaks the
// seal via tryBreakSealNear. The state-machine guard at the top of the
// loop (`if (d.state === 'closed')`) skips them naturally.
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

// Round-7-audit fix — inverse of onRoomCleared. Closes any currently-
// open or opening north doors and resets them to 'closed' so the
// existing `if (room.cleared && !_roomClearedNotified)` block in
// main.js naturally re-opens them once the new combat resolves.
//
// Required for the mimic-escape bug: chest rooms ship `cleared: true`
// so onRoomCleared fires on entry and opens the doors. When a mimic
// spawns it flips `room.cleared = false`, but without this inverse
// the doors STAY OPEN and the player can walk straight out of the
// fight. Sealed doors are intentionally left alone — once a player
// has paid HP to break a seal, that commitment shouldn't be undone
// by a transient combat re-engagement.
export function onRoomLocked() {
  for (const d of roomDoors) {
    if (d.side !== 'north') continue;
    if (d.state === 'sealed') continue;     // committed payment, leave alone
    if (d.state === 'open' || d.state === 'opening') {
      d.state = 'closing';
    }
  }
  if (roomDoors.some(d => d.side === 'north' && d.state === 'closing')) {
    playSfx('click', { rate: 0.85, volume: 0.45 });
  }
}

// Round-7 Phase 5 — Blood Door interaction.
//
// Returns the nearest unsealed BLOOD GATE within `interactR` of the
// hero's world position, or null if none. Used to:
//   1. Render the "E · PAY N HP · BREAK SEAL" hover prompt.
//   2. Resolve the E-press handler in main.js (calls breakSealAt with
//      the door's tile coords once the player commits).
//
// 56px range matches the hamlet-NPC interactR — the player should see
// the prompt as they walk up to the wall, before they're inside the
// door tile. Closest-door tie-break so a multi-door wall doesn't fight
// over which prompt to show.
export function getNearbySealedDoor(heroWx, heroWy, interactR = 56) {
  let best = null;
  let bestD = Infinity;
  for (const d of roomDoors) {
    if (d.state !== 'sealed') continue;
    const cx = d.tx * TILE + TILE / 2;
    const cy = d.ty * TILE + TILE;       // door bottom edge — closer to hero pathing
    const dx = heroWx - cx, dy = heroWy - cy;
    const dist = Math.hypot(dx, dy);
    if (dist < interactR && dist < bestD) {
      best = d;
      bestD = dist;
    }
  }
  return best;
}

// Break the seal on a sealed door. Caller (main.js E-handler) owns the
// HP-cost gate — this function trusts that the caller has paid the
// price and is just flipping the door's state machine. Returns true if
// the door transitioned from sealed → opening, false if the door
// wasn't sealed (defensive double-press guard).
export function breakSeal(door) {
  if (!door || door.state !== 'sealed') return false;
  // Unmask the cosmetics — the door reverts to its target kind so the
  // player can SEE what they unlocked (e.g. "ELITE · LEGENDARY") rather
  // than walking through a still-red gate. Cosmetics were stashed in
  // door.targetX during setupRoomDoors so the swap is just field
  // reassignment.
  door.label = door.targetLabel;
  door.color = door.targetColor;
  door.glyph = door.targetGlyph;
  door.rewardLabel = door.targetRewardLabel;
  door.rewardColor = door.targetRewardColor;
  door.state = 'opening';
  door.anim = 0;
  // Fan-out audio + camera tells — this is a meaningful run beat. A
  // bass-heavy thud announces the seal cracking; a higher chord layers
  // the "ah, the door opens" lift on top.
  playSfx('click', { rate: 0.32, volume: 0.7 });
  return true;
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
// Phase R-1 — icon-first door card render. Replaces the previous
// stacked-text approach (a small wall-tile glyph + a label line + an
// italic reward chip + bullet decorators) with a single floating card
// per door, positioned ABOVE the door arch in clear sky-space rather
// than competing with the door's own architectural detail.
//
// Design (per the player-feedback review):
//
//   ┌──────────────┐
//   │      ◈       │   ← reward sigil (28px, dominant, glowing)
//   │     GOLD     │   ← reward caption (11px bold, single line)
//   └──────────────┘
//          │
//          v             ← small chevron pointing to the door arch
//        🚪 (door)
//
// Key principles:
//   1. ONE bold thing per door, not three small things.
//   2. Reward (the player's actual decision driver) is dominant; kind
//      label is secondary, fade-in only when hero approaches.
//   3. Saturated unique fills per reward — the card's BACKGROUND tells
//      the story at a screen-glance, not just the text.
//   4. Always visible (was openness-gated; combat-time players couldn't
//      plan their next move because the labels hid until the door
//      opened). Plan-while-fighting is a Hades staple.
//   5. Sealed doors keep their distinct crimson treatment + the
//      "PAY N HP" sub-line. Approach reveal swaps in "E · BREAK SEAL"
//      replacing the floating prompt.
//
// Card geometry: 84w × 46h, centered horizontally over the door tile,
// floating ~38px above the wall plane. Tighter than the design draft
// (52px) because the camera Y-clamp can put the door near the top of
// the visible frame when the hero stands at the south end of the room
// — too much elevation above the wall pushes the card off-screen.
// 38px keeps the card visible across all camera positions while still
// reading as "above the arch" rather than "on the wall."
// Sealed doors keep the larger frame because BLOOD GATE styling is
// supposed to dominate visually — a sealed door is a high-stakes
// commitment beat. Non-sealed doors use the simpler tighter card.
const CARD_W = 84;          // sealed only
const CARD_H = 46;          // sealed only
// Vertical offset from the door top to the sealed-card center. Used
// only by the sealed BLOOD GATE flow now; non-sealed doors render
// architectural marks ON the door itself, no offset above the wall.
const CARD_OFFSET_Y = 38;

// drawDoorLabels — entry point called from main.js after drawRoom.
// Sealed doors keep their dramatic floating card (BLOOD GATE remains
// a HP-cost commit moment). Non-sealed doors get the new layered
// architectural identity rendering — theme wash, kind details,
// keystone seal, affix accents — painted ONTO the door tile, not
// floating above it. Substrate doors (combat / gold / chest / trove
// / rare+) intentionally render NO marks at all; they ARE the
// substrate, not a labeled UI element.
export function drawDoorLabels(ctx) {
  const now = performance.now() / 1000;
  for (const d of roomDoors) {
    if (d.side !== 'north') continue;
    const cx = d.tx * TILE + TILE / 2;
    const doorTop = d.ty * TILE;
    const cardCY = doorTop - CARD_OFFSET_Y;
    const isSealed = d.state === 'sealed';

    if (isSealed) {
      _drawSealedDoorCard(ctx, d, cx, cardCY, now);
    } else {
      _drawDoorIdentity(ctx, d, now);
    }

    // Phase 5 sealed door E-prompt — kept separate from the card so
    // the interactive prompt (action verb) doesn't compete with the
    // informational card (state). Renders the "E · BREAK SEAL" pill
    // BELOW the card when hero is in 56px range.
    if (isSealed) {
      const dx = hero.x - cx;
      const dy = hero.y - (d.ty * TILE + TILE);
      const dist = Math.hypot(dx, dy);
      if (dist < 56) {
        // Card bottom edge for sealed doors: cardCY + CARD_H/2 (sealed
        // uses the larger dimensions). Position the prompt 22 px below.
        const sealedCardBottom = cardCY + CARD_H / 2;
        const promptY = sealedCardBottom + 22 + Math.sin(now * 2.2) * 2;
        const label = `E  ·  BREAK SEAL`;
        ctx.save();
        ctx.font = 'bold 11px Georgia, serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const m = ctx.measureText(label);
        const padX = 12;
        const w = m.width + padX * 2;
        const h = 22;
        const px = cx - w / 2;
        const py = promptY - h / 2;
        ctx.fillStyle = 'rgba(14, 10, 16, 0.88)';
        ctx.fillRect(px, py, w, h);
        ctx.strokeStyle = '#d04050';
        ctx.lineWidth = 1;
        ctx.strokeRect(px + 0.5, py + 0.5, w - 1, h - 1);
        ctx.fillStyle = '#ff8088';
        ctx.fillText(label, cx, promptY);
        ctx.restore();
      }
    }
  }
}

// ─── Sealed door card — kept dramatic, BLOOD GATE styling ─────────────
// Sealed doors are a high-stakes commitment beat. Their card preserves
// the larger dimensions, two-layer fill, and three-tier sigil/caption/
// sub-line layout from before the simplification. Crimson border, fast
// urgent pulse — designed to read DIFFERENT from regular doors.
function _drawSealedDoorCard(ctx, d, cx, cardCY, now) {
  const sigil = '⛧';
  const caption = 'BLOOD';
  const borderColor = '#d04050';
  const captionColor = '#ff8088';
  const fillColor = 'rgba(80, 16, 24, 0.92)';
  const subLine = `OFFER ${d.sealCost || 1} HP`;
  const subLineColor = '#ff8088';
  const pulse = 0.80 + 0.20 * Math.sin(now * 2.4);

  ctx.save();
  const cardX = cx - CARD_W / 2;
  const cardY = cardCY - CARD_H / 2;
  // Two-layer fill — dark base + tinted top — preserves text legibility
  ctx.fillStyle = 'rgba(14, 10, 16, 0.88)';
  roundRect(ctx, cardX, cardY, CARD_W, CARD_H, 6);
  ctx.fill();
  ctx.fillStyle = fillColor;
  roundRect(ctx, cardX, cardY, CARD_W, CARD_H, 6);
  ctx.fill();
  ctx.strokeStyle = hexA(borderColor, 0.88 * pulse);
  ctx.lineWidth = 1.5;
  roundRect(ctx, cardX + 0.5, cardY + 0.5, CARD_W - 1, CARD_H - 1, 6);
  ctx.stroke();

  // Sigil — pushed up to make room for caption + sub-line below
  ctx.fillStyle = hexA(borderColor, pulse);
  ctx.shadowColor = hexA(borderColor, pulse * 0.8);
  ctx.shadowBlur = 14;
  ctx.font = 'bold 24px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(sigil, cx, cardCY - 10);
  ctx.shadowBlur = 0;

  // Caption — bold serif, mid-height
  ctx.fillStyle = captionColor;
  ctx.font = 'bold 11px Georgia, "Cormorant Garamond", serif';
  ctx.fillText(caption, cx, cardCY + 6);

  // Sub-line — "OFFER N HP", small italic at bottom
  ctx.font = 'bold 8px Georgia, serif';
  ctx.fillStyle = subLineColor;
  ctx.fillText(subLine, cx, cardCY + 17);

  ctx.restore();
}

// ─── Door Visual Profile — architectural identity layers ─────────────
// What does this door TELL the player? Four axes of identity, each
// rendered as a separate ARCHITECTURAL layer painted directly onto
// the door tile — NO floating UI, NO labels in the dark sky above
// the wall, NO substrate dim glyphs. The icon IS the door.
//
// Layers (rendered bottom-up):
//   1. themeWash        — color tint over door body (storm/flame/etc)
//   2. kindArchVariant  — encounter-type details (boss = ominous lintel,
//                          altar = blood drips, shop = lantern glow,
//                          sanctuary = soft healing light, etc.)
//   3. specialSeal      — reward-tier marking on the keystone
//                          (fusion = interlocked rings, legendary = star,
//                          mythic = sun)
//   4. affixAccent      — elite-affix edges (frost icicles, ember cracks,
//                          venom drips, warded shield sigils)
//
// `intensity` (0..1) drives overall layer strength. Substrate doors
// (combat / gold / chestroom / trove / rare+ default) clamp to 0 and
// render NOTHING — bare door, no marks. They're the substrate, not
// a labeled UI element. That's intentional — a bare wooden door next
// to a marked door reads as "this is the default path", not as a
// render bug, because both halves of the comparison are architectural.
// _buildDoorVisualProfile — every door always gets a medallion. The
// hierarchy is in colors and rim treatment, NOT presence/absence.
// Combat doors get crossed swords. Themed get the theme glyph. Boss
// gets a skull. Etc. This eliminates the "two empty doors look broken"
// failure mode while keeping the visual hierarchy (special doors have
// brighter rims, halos, and pulse animations).
//
// Priority (top wins):
//   1. SEALED → handled separately (BLOOD GATE card)
//   2. BOSS → skull on dark stone, crimson rim, halo + pulse
//   3. FUSION → interlocked rings on stone, ember rim, halo + pulse
//   4. MYTHIC → 6-point sun, white-gold rim, halo + pulse
//   5. LEGENDARY → 4-point star, lavender rim, halo + pulse
//   6. THEME → theme glyph (bolt/drop/etc), theme-colored rim, halo
//   7. ALTAR/SHOP/SANCTUARY/EVENT/MINIBOSS/CHALLENGE/ELITE/CHEST/TROVE
//      → kind-specific glyph, kind-tinted rim
//   8. COMBAT (default) → crossed swords on stone, neutral rim
function _buildDoorVisualProfile(d) {
  const reward = d.rewardLabel || null;
  const kind = d.targetKind || 'combat';
  // Default substrate — combat with crossed swords. Muted bronze/stone
  // colors so it whispers; brighter tiers below override.
  const profile = {
    iconKind: 'combat',
    rimColor: '#7a6a5a',
    iconColor: '#c8b894',
    haloColor: null,
    pulse: false,
    affixId: (kind === 'elite' && d.eliteAffixId) ? d.eliteAffixId : null,
  };
  // Top-priority overrides — boss + special seals + theme push the
  // medallion to its loudest state.
  if (kind === 'boss') {
    profile.iconKind = 'boss';
    profile.rimColor = '#dc5a5a'; profile.iconColor = '#ffd0c8';
    profile.haloColor = 'rgba(220, 70, 80, 0.55)'; profile.pulse = true;
  } else if (reward === 'FUSION') {
    profile.iconKind = 'fusion';
    profile.rimColor = '#ff9050'; profile.iconColor = '#ffc480';
    profile.haloColor = 'rgba(255, 140, 80, 0.50)'; profile.pulse = true;
  } else if (reward === 'MYTHIC') {
    profile.iconKind = 'star6';
    profile.rimColor = '#fff2c0'; profile.iconColor = '#ffffff';
    profile.haloColor = 'rgba(255, 240, 200, 0.60)'; profile.pulse = true;
  } else if (reward === 'LEGENDARY') {
    profile.iconKind = 'star4';
    profile.rimColor = '#ffb0e0'; profile.iconColor = '#ffd0f0';
    profile.haloColor = 'rgba(255, 180, 240, 0.45)'; profile.pulse = true;
  } else if (d.roomTheme && THEMES[d.roomTheme]) {
    const theme = THEMES[d.roomTheme];
    profile.iconKind = 'theme:' + d.roomTheme;
    profile.rimColor = theme.color;
    profile.iconColor = theme.tint || theme.color;
    // Theme halo — subtle, doesn't pulse (themes are identity, not urgency)
    const [r, g, b] = _doorHexToRgb(theme.color);
    profile.haloColor = `rgba(${r}, ${g}, ${b}, 0.40)`;
  } else if (kind === 'altar') {
    profile.iconKind = 'altar';
    profile.rimColor = '#d04050'; profile.iconColor = '#ff8088';
    profile.haloColor = 'rgba(208, 64, 80, 0.40)';
  } else if (kind === 'shop') {
    profile.iconKind = 'shop';
    profile.rimColor = '#e8c080'; profile.iconColor = '#ffd098';
    profile.haloColor = 'rgba(232, 192, 128, 0.40)';
  } else if (kind === 'sanctuary' || kind === 'reward') {
    profile.iconKind = 'sanctuary';
    profile.rimColor = '#86e3a8'; profile.iconColor = '#a8f0c0';
    profile.haloColor = 'rgba(134, 227, 168, 0.40)';
  } else if (kind === 'event') {
    profile.iconKind = 'event';
    profile.rimColor = '#b890ff'; profile.iconColor = '#d0b0ff';
    profile.haloColor = 'rgba(184, 144, 255, 0.40)';
  } else if (kind === 'miniboss') {
    profile.iconKind = 'miniboss';
    profile.rimColor = '#c06060'; profile.iconColor = '#ffb0a0';
    profile.haloColor = 'rgba(192, 96, 96, 0.40)';
  } else if (kind === 'challenge') {
    profile.iconKind = 'challenge';
    profile.rimColor = '#ffb265'; profile.iconColor = '#ffd098';
    profile.haloColor = 'rgba(255, 178, 100, 0.35)';
  } else if (kind === 'elite') {
    profile.iconKind = 'elite';
    profile.rimColor = '#e07070'; profile.iconColor = '#ffd0c8';
    profile.haloColor = 'rgba(224, 112, 112, 0.40)';
  } else if (kind === 'chestroom') {
    profile.iconKind = 'chest';
    profile.rimColor = '#c9a86a'; profile.iconColor = '#ffd680';
  } else if (kind === 'trove') {
    profile.iconKind = 'trove';
    profile.rimColor = '#f4d9a0'; profile.iconColor = '#ffe9b0';
  }
  // Otherwise default substrate (combat) — already set
  return profile;
}

// _drawDoorIdentity — single render call: just paint the medallion.
// Sealed doors go through a separate dramatic-card flow.
function _drawDoorIdentity(ctx, d, now) {
  const profile = _buildDoorVisualProfile(d);
  _drawDoorMedallion(ctx, d, profile, now);
}

// Hex → RGB triplet, cached. ~10 colors maximum cached (5 themes + the
// reward/kind tints that get used in halo composition).
const _doorHexCache = new Map();
function _doorHexToRgb(hex) {
  if (!hex) return [200, 200, 200];
  const cached = _doorHexCache.get(hex);
  if (cached) return cached;
  const h = hex.replace('#', '');
  const norm = h.length === 3 ? h[0]+h[0]+h[1]+h[1]+h[2]+h[2] : h;
  const triplet = [parseInt(norm.slice(0, 2), 16), parseInt(norm.slice(2, 4), 16), parseInt(norm.slice(4, 6), 16)];
  _doorHexCache.set(hex, triplet);
  return triplet;
}

// Affix display table — inline since it's only used for the medallion
// sub-line. Same colors as the in-game elite aura.
const _AFFIX_DISPLAY = {
  frost:  { label: 'FROST',  color: '#72c6ff' },
  ember:  { label: 'EMBER',  color: '#ff7a2a' },
  venom:  { label: 'VENOM',  color: '#6ae08a' },
  warded: { label: 'WARDED', color: '#ffd855' },
};

// Hex darkener — for the rim 3D shading. Multiplies each channel by
// `factor` (0..1). Returns a hex string. Cached alongside _doorHexCache
// so repeated calls don't re-parse the same input.
const _doorDarkenCache = new Map();
function _darkenHex(hex, factor) {
  const key = hex + '|' + factor;
  const cached = _doorDarkenCache.get(key);
  if (cached) return cached;
  const [r, g, b] = _doorHexToRgb(hex);
  const dr = Math.max(0, Math.min(255, Math.round(r * factor)));
  const dg = Math.max(0, Math.min(255, Math.round(g * factor)));
  const db = Math.max(0, Math.min(255, Math.round(b * factor)));
  const result = '#' + ((dr << 16) | (dg << 8) | db).toString(16).padStart(6, '0');
  _doorDarkenCache.set(key, result);
  return result;
}

// Star path helper for legendary (4-point) and mythic (6-point) icons.
function _drawStarPath(ctx, cx, cy, r, points) {
  const innerR = r * 0.4;
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const angle = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    const radius = i % 2 === 0 ? r : innerR;
    const px = cx + Math.cos(angle) * radius;
    const py = cy + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

// Door medallion — circular framed disc above the door, ~32 px diameter.
// The frame is what makes the medallion feel architectural rather than
// floating UI: a ceremonial seal mounted in stone above the threshold,
// like the heraldic plaques over real medieval doorways. Hades pattern.
//
// Layers:
//   1. Outer halo (special tiers only) — soft radial in profile.haloColor
//   2. Tinted rim disc — full circle in profile.rimColor (the "frame")
//   3. Dark stone inner disc — gradient from #2a1f28 (top) to #0f0a14
//   4. Icon — drawn in profile.iconColor, kind-specific shape
//   5. Affix sub-line (elite only) — small text below the medallion
function _drawDoorMedallion(ctx, d, profile, now) {
  const x = d.tx * TILE;
  const y = d.ty * TILE;
  const cx = x + TILE / 2;
  // Position bumped 28 → 34 so the medallion sits cleanly above the
  // top-wall body extension (drawTopWallBody renders y=-32 to y=0
  // above the wall row). At cy=-34, the medallion bottom is at -18,
  // 2 px below the wall body edge — anchors the disc visually to the
  // wall edge while leaving the bulk of the medallion in clear sky.
  const cy = y - 34;
  const baseR = 17;

  // Pulse — special tiers (boss/fusion/legendary/mythic) breathe at
  // 1.6 Hz with ±6% scale for the magical-waypoint feel. Theme + kind
  // tier doesn't pulse (those are identity, not urgency).
  const scale = profile.pulse ? (1 + 0.06 * Math.sin(now * 1.6 + d.tx * 0.3)) : 1;
  const r = baseR * scale;
  const innerR = r - 2.5;

  ctx.save();

  // ── Layer 1: outer halo ─────────────────────────────────────────────
  if (profile.haloColor) {
    const haloR = r + 12;
    const halo = ctx.createRadialGradient(cx, cy, r * 0.85, cx, cy, haloR);
    halo.addColorStop(0, profile.haloColor);
    // Strip the alpha out of the halo color for the outer stop. Robust
    // to any rgba(R, G, B, A) format including spaces and decimal
    // alpha values; the trailing alpha-and-paren is replaced with 0.
    halo.addColorStop(1, profile.haloColor.replace(/,\s*[\d.]+\)$/, ', 0)'));
    ctx.fillStyle = halo;
    ctx.fillRect(cx - haloR, cy - haloR, haloR * 2, haloR * 2);
  }

  // ── Layer 2: tinted rim disc (the "frame") ─────────────────────────
  // Two-tone rim: full color on top half, slightly darkened bottom
  // half for "lit from above" 3D feel. Accomplished via a vertical
  // gradient instead of a flat fill.
  const rimGrad = ctx.createLinearGradient(cx, cy - r, cx, cy + r);
  rimGrad.addColorStop(0,    profile.rimColor);
  rimGrad.addColorStop(0.55, profile.rimColor);
  rimGrad.addColorStop(1,    _darkenHex(profile.rimColor, 0.55));
  ctx.fillStyle = rimGrad;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();

  // ── Layer 3: dark stone inner disc ─────────────────────────────────
  // Radial gradient anchored at upper-third for "stone pressed into
  // frame, lit from above" depth. Slightly darker bottom edge gives
  // the inner disc real depth instead of flat fill.
  const innerGrad = ctx.createRadialGradient(cx, cy - innerR * 0.35, 1, cx, cy, innerR);
  innerGrad.addColorStop(0, '#3a2a36');
  innerGrad.addColorStop(0.7, '#1a1018');
  innerGrad.addColorStop(1, '#0a0610');
  ctx.fillStyle = innerGrad;
  ctx.beginPath(); ctx.arc(cx, cy, innerR, 0, Math.PI * 2); ctx.fill();

  // ── Layer 3b: top-edge highlight ───────────────────────────────────
  // A thin bright arc on the top-inside of the disc — sells "metal
  // disc, lit from above". Same color as rim but with a soft alpha.
  ctx.save();
  ctx.strokeStyle = profile.rimColor;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  // Arc from upper-left to upper-right (top quarter of the disc edge)
  ctx.arc(cx, cy, innerR + 0.3, Math.PI * 1.20, Math.PI * 1.80);
  ctx.stroke();
  ctx.restore();

  // ── Layer 4: icon (kind-specific shape) ────────────────────────────
  const iconR = innerR * 0.65;
  ctx.fillStyle = profile.iconColor;
  ctx.strokeStyle = profile.iconColor;

  switch (profile.iconKind) {
    case 'combat': {
      // Proper crossed-swords silhouette — each sword has a thin blade
      // (drawn via rotated rect) plus a small crossguard near the hilt.
      // Blades cross at the center, hilts in opposite corners. Reads as
      // weapons rather than the previous bare-X.
      const bladeLen = iconR * 1.6;
      const bladeW = 1.6;
      const guardW = iconR * 0.45;
      const guardH = 1.4;
      // Sword 1 — top-left to bottom-right diagonal
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-bladeW / 2, -bladeLen / 2, bladeW, bladeLen);
      // Tip (small triangle at top)
      ctx.beginPath();
      ctx.moveTo(0, -bladeLen / 2 - 1.5);
      ctx.lineTo(-bladeW * 0.9, -bladeLen / 2 + 1);
      ctx.lineTo(bladeW * 0.9, -bladeLen / 2 + 1);
      ctx.closePath();
      ctx.fill();
      // Crossguard near hilt (bottom)
      ctx.fillRect(-guardW / 2, bladeLen * 0.28, guardW, guardH);
      // Pommel (round) at the very bottom
      ctx.beginPath(); ctx.arc(0, bladeLen * 0.42, 1.6, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      // Sword 2 — top-right to bottom-left diagonal (mirror)
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-Math.PI / 4);
      ctx.fillRect(-bladeW / 2, -bladeLen / 2, bladeW, bladeLen);
      ctx.beginPath();
      ctx.moveTo(0, -bladeLen / 2 - 1.5);
      ctx.lineTo(-bladeW * 0.9, -bladeLen / 2 + 1);
      ctx.lineTo(bladeW * 0.9, -bladeLen / 2 + 1);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(-guardW / 2, bladeLen * 0.28, guardW, guardH);
      ctx.beginPath(); ctx.arc(0, bladeLen * 0.42, 1.6, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      break;
    }
    case 'fusion': {
      // Interlocked rings + center spark
      const off = iconR * 0.45;
      ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.arc(cx - off, cy, iconR * 0.6, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx + off, cy, iconR * 0.6, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#fff2d0';
      ctx.beginPath(); ctx.arc(cx, cy, 1.5, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'star4':
    case 'star6': {
      const points = profile.iconKind === 'star6' ? 6 : 4;
      _drawStarPath(ctx, cx, cy, iconR * 0.85, points);
      ctx.fill();
      break;
    }
    case 'theme:storm': {
      ctx.beginPath();
      ctx.moveTo(cx + iconR * 0.55, cy - iconR);
      ctx.lineTo(cx - iconR * 0.45, cy - iconR * 0.10);
      ctx.lineTo(cx + iconR * 0.05, cy - iconR * 0.10);
      ctx.lineTo(cx - iconR * 0.55, cy + iconR);
      ctx.lineTo(cx + iconR * 0.45, cy + iconR * 0.10);
      ctx.lineTo(cx - iconR * 0.05, cy + iconR * 0.10);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'theme:flame': {
      ctx.beginPath();
      ctx.moveTo(cx, cy - iconR);
      ctx.bezierCurveTo(cx + iconR*0.85, cy - iconR*0.2, cx + iconR*0.55, cy + iconR*0.7, cx, cy + iconR*0.85);
      ctx.bezierCurveTo(cx - iconR*0.55, cy + iconR*0.7, cx - iconR*0.85, cy - iconR*0.2, cx, cy - iconR);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'theme:blood': {
      ctx.beginPath();
      ctx.moveTo(cx, cy + iconR);
      ctx.bezierCurveTo(cx + iconR*0.85, cy + iconR*0.2, cx + iconR*0.55, cy - iconR*0.7, cx, cy - iconR*0.85);
      ctx.bezierCurveTo(cx - iconR*0.55, cy - iconR*0.7, cx - iconR*0.85, cy + iconR*0.2, cx, cy + iconR);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'theme:vow': {
      ctx.beginPath();
      ctx.moveTo(cx - iconR * 0.9, cy - iconR * 0.7);
      ctx.lineTo(cx + iconR * 0.9, cy - iconR * 0.7);
      ctx.lineTo(cx + iconR * 0.9, cy + iconR * 0.1);
      ctx.lineTo(cx, cy + iconR);
      ctx.lineTo(cx - iconR * 0.9, cy + iconR * 0.1);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'theme:shadow': {
      ctx.beginPath(); ctx.arc(cx, cy, iconR * 0.85, 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath(); ctx.arc(cx + iconR * 0.45, cy - iconR * 0.15, iconR * 0.7, 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      break;
    }
    case 'boss':
    case 'miniboss':
    case 'elite': {
      // Skull silhouette — cranium + jaw + eye sockets
      const skullR = iconR * 0.85;
      ctx.beginPath();
      ctx.arc(cx, cy - skullR * 0.2, skullR * 0.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(cx - skullR * 0.35, cy + skullR * 0.3, skullR * 0.7, skullR * 0.35);
      ctx.fillStyle = '#0a0608';
      ctx.beginPath(); ctx.arc(cx - skullR * 0.32, cy - skullR * 0.2, skullR * 0.18, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + skullR * 0.32, cy - skullR * 0.2, skullR * 0.18, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'altar': {
      // Pentagram — inverted-5-point star outline
      ctx.lineWidth = 1.5;
      const pts = [];
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
        pts.push([cx + Math.cos(a) * iconR * 0.85, cy + Math.sin(a) * iconR * 0.85]);
      }
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      ctx.lineTo(pts[2][0], pts[2][1]);
      ctx.lineTo(pts[4][0], pts[4][1]);
      ctx.lineTo(pts[1][0], pts[1][1]);
      ctx.lineTo(pts[3][0], pts[3][1]);
      ctx.closePath();
      ctx.stroke();
      break;
    }
    case 'shop': {
      // Coin — outer disc + dark inner ring + tiny notches top/bottom
      ctx.beginPath(); ctx.arc(cx, cy, iconR * 0.7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#2a1f10';
      ctx.beginPath(); ctx.arc(cx, cy, iconR * 0.4, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'sanctuary': {
      // Plus / cross
      const t = iconR * 0.25;
      ctx.fillRect(cx - t/2, cy - iconR * 0.85, t, iconR * 1.7);
      ctx.fillRect(cx - iconR * 0.85, cy - t/2, iconR * 1.7, t);
      break;
    }
    case 'event': {
      // 8-point sparkle — mystery rune
      ctx.beginPath();
      ctx.moveTo(cx, cy - iconR * 0.85);
      ctx.lineTo(cx + iconR * 0.25, cy - iconR * 0.25);
      ctx.lineTo(cx + iconR * 0.85, cy);
      ctx.lineTo(cx + iconR * 0.25, cy + iconR * 0.25);
      ctx.lineTo(cx, cy + iconR * 0.85);
      ctx.lineTo(cx - iconR * 0.25, cy + iconR * 0.25);
      ctx.lineTo(cx - iconR * 0.85, cy);
      ctx.lineTo(cx - iconR * 0.25, cy - iconR * 0.25);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'challenge': {
      // Flag silhouette — pole + triangle banner
      ctx.fillRect(cx - iconR * 0.05, cy - iconR * 0.85, iconR * 0.1, iconR * 1.7);
      ctx.beginPath();
      ctx.moveTo(cx + iconR * 0.05, cy - iconR * 0.85);
      ctx.lineTo(cx + iconR * 0.7, cy - iconR * 0.5);
      ctx.lineTo(cx + iconR * 0.05, cy - iconR * 0.15);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'chest': {
      // Chest silhouette
      ctx.fillRect(cx - iconR * 0.7, cy - iconR * 0.4, iconR * 1.4, iconR * 0.85);
      ctx.fillStyle = '#1a1208';
      ctx.fillRect(cx - 1, cy + iconR * 0.05, 2, iconR * 0.3);
      break;
    }
    case 'trove': {
      // Gem / diamond
      ctx.beginPath();
      ctx.moveTo(cx, cy - iconR * 0.85);
      ctx.lineTo(cx + iconR * 0.7, cy);
      ctx.lineTo(cx, cy + iconR * 0.85);
      ctx.lineTo(cx - iconR * 0.7, cy);
      ctx.closePath();
      ctx.fill();
      break;
    }
  }

  // ── Layer 5: affix sub-line (elite affixes only) ───────────────────
  if (profile.affixId && _AFFIX_DISPLAY[profile.affixId]) {
    const af = _AFFIX_DISPLAY[profile.affixId];
    ctx.fillStyle = af.color;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
    ctx.shadowBlur = 3;
    ctx.font = 'bold 8px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(af.label, cx, cy + r + 8);
    ctx.shadowBlur = 0;
  }

  ctx.restore();
}


// Helper — draw a rounded rectangle path. Uses ctx.roundRect when
// available (modern browsers), falls back to manual arc-drawn corners.
// Path is left on the context for the caller to fill or stroke.
function roundRect(ctx, x, y, w, h, r) {
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
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
// Round-7 audit: 3-digit hex inputs ('#fff') silently produced wrong
// rgba — slice(1,3) read 'ff', slice(3,5) read '', etc. All current
// callers pass 6-digit hex but a future tint added via theme palette
// could regress. Now expands shorthand to 6-digit before slicing.
function hexA(hex, a) {
  let h = (hex || '#000').replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return 'rgba(' + r + ',' + g + ',' + b + ',' + a.toFixed(3) + ')';
}

// _drawFusionSigil retired — _drawKeystoneSeal now renders the fusion
// rings inline as part of its layered etched-and-glowing pass. The
// older "Venn rings on a card" sigil isn't called from anywhere now
// that the floating-glyph rendering path is gone.
