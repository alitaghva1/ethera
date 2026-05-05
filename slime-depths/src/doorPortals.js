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
// Phase 3 audit fix #1 — elite affix display table. The renderer reads
// eliteAffixId off the door object (propagated from t.eliteAffixId,
// pre-rolled at floorGraph build time) and renders the human-readable
// label as a sub-line on the door card. The colors mirror the in-game
// auraColor for each affix in enemies.js ELITE_AFFIXES so the player
// learns the cross-system color coding (door → enemy aura → badge).
const AFFIX_LABELS = {
  frost:  { label: 'FROST',  color: '#72c6ff' },
  ember:  { label: 'EMBER',  color: '#ff7a2a' },
  venom:  { label: 'VENOM',  color: '#6ae08a' },
  warded: { label: 'WARDED', color: '#ffd855' },
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
// Phase R-1 — reward sigils for the floating door card. Each reward type
// gets a unique iconographic glyph that's the player's primary read at
// the door, with the kind label as a secondary line beneath. Distinct
// from the kind glyphs (⚔/☠/✦) which sit in the corner badge of the
// card; these are the BIG icons the player sees from across the room.
const REWARD_SIGILS = {
  gold:      '◈',     // gem / coin (warm yellow)
  'rare+':   '✦',     // 4-point star
  legendary: '✸',     // 8-point sunburst — distinct from rare's 4-point
  heal:      '✚',     // cross (matches sanctuary)
  // 'fusion' uses procedural rendering (two interlocked rings) — see
  // _drawFusionSigil below. The Unicode '⊗' fallback we used to render
  // looked like a "block / deselect" mark, not a fusion. Setting an
  // empty key here so the renderer falls into the procedural path.
  fusion:    '__procedural__',
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
const CARD_OFFSET_Y = 38;
// Simplified card for normal doors (Hades-inspired pass): icon-first
// with the sigil dominant and the label as a small caption beneath.
// Bumped height (38 → 44) to accommodate the larger sigil without
// crowding the label. Width unchanged so the card footprint feels
// the same on the door.
const SIMPLE_CARD_W = 64;
const SIMPLE_CARD_H = 44;

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
      _drawSimpleDoorCard(ctx, d, cx, cardCY, now);
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

// ─── Simple door card — Hades-style icon-first design ──────────────────
// One dominant icon + one optional small label. Tinted pill backdrop,
// no corner brackets, no chevron, no eyebrow. The icon IS the
// information; the kind/reward is implied by which sigil is shown.
//
// Label suppression rule: combat rooms with no reward bias show the
// icon ONLY (the ⚔ glyph is self-evident — adding "COMBAT" beneath it
// is redundant). Reward-biased rooms (gold/legendary/fusion) and
// special kinds (rest/altar/shop/boss) keep their label since the
// icon alone might not be unambiguous.
//
// Affix sub-line for elite doors is preserved — it's genuinely
// additive info, not redundant with anything else.
function _drawSimpleDoorCard(ctx, d, cx, cardCY, now) {
  // Pick the dominant signal — reward bias if present, else kind glyph
  const hasReward = !!d.rewardLabel;
  const kindIsCombat = !d.targetKind || d.targetKind === 'combat';
  let sigil, label, color;
  if (hasReward) {
    const rewardKey = (d.rewardLabel || '').toLowerCase();
    sigil = REWARD_SIGILS[rewardKey] || d.glyph || '?';
    label = d.rewardLabel;
    color = d.rewardColor || d.color || '#cccccc';
  } else {
    sigil = d.glyph || '?';
    // Suppress label for default combat (icon is self-evident).
    // Special kinds (rest/altar/shop/boss) keep their label.
    label = kindIsCombat ? null : (d.label || null);
    color = d.color || '#cccccc';
  }

  // Affix sub-line for elite doors (kept regardless of reward)
  let subLine = null, subLineColor = null;
  if (d.eliteAffixId) {
    const af = AFFIX_LABELS[d.eliteAffixId];
    if (af) {
      subLine = af.label;
      subLineColor = af.color;
    }
  }

  // Calmer pulse than sealed doors — ambient throb, not urgent
  const pulse = 0.90 + 0.10 * Math.sin(now * 1.4);

  ctx.save();
  const cardX = cx - SIMPLE_CARD_W / 2;
  const cardY = cardCY - SIMPLE_CARD_H / 2;
  // Single tinted pill — no double-layer fill, no corner brackets
  ctx.fillStyle = 'rgba(14, 10, 16, 0.86)';
  roundRect(ctx, cardX, cardY, SIMPLE_CARD_W, SIMPLE_CARD_H, 8);
  ctx.fill();
  ctx.strokeStyle = hexA(color, 0.65 * pulse);
  ctx.lineWidth = 1;
  roundRect(ctx, cardX + 0.5, cardY + 0.5, SIMPLE_CARD_W - 1, SIMPLE_CARD_H - 1, 8);
  ctx.stroke();

  // Sigil placement — Hades-pattern icon-first: the sigil is the
  // dominant visual element, the label is a small caption beneath.
  // Previously sigil was 22px serif and label 10px Georgia bold — close
  // enough in weight that they read as equal-importance UI. Bumped
  // sigil to 30px (procedural fusion radius 9 → 13) and dropped label
  // to 8px so the icon dominates and the word reads as a tag.
  //
  // Sigil Y lifted further when label is present (the bigger glyph
  // needs more room above the caption). Card height bumped to 44
  // accommodates the larger composition.
  const hasLowerText = !!label || !!subLine;
  const sigilY = cardCY + (hasLowerText ? -7 : 0);
  ctx.fillStyle = hexA(color, pulse);
  ctx.shadowColor = hexA(color, pulse * 0.6);
  ctx.shadowBlur = 10;
  if (sigil === '__procedural__' && d.rewardLabel === 'FUSION') {
    _drawFusionSigil(ctx, cx, sigilY, 13, hexA(color, pulse));
  } else {
    ctx.font = 'bold 30px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(sigil, cx, sigilY);
  }
  ctx.shadowBlur = 0;

  // Label below sigil — small caption, lower opacity so it reads as
  // metadata rather than competing with the icon.
  if (label) {
    ctx.fillStyle = hexA(color, 0.92);
    ctx.font = 'bold 8px Georgia, "Cormorant Garamond", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, cx, cardCY + (subLine ? 9 : 12));
  }

  // Affix sub-line for elite doors (FROST / EMBER / VENOM / WARDED)
  if (subLine) {
    ctx.font = 'bold 7px Georgia, serif';
    ctx.fillStyle = subLineColor || '#ffd855';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(subLine, cx, cardCY + (label ? 17 : 12));
  }

  // Theme glyph — small chip in upper-right corner if room is themed
  if (d.roomTheme && THEMES[d.roomTheme]) {
    const theme = THEMES[d.roomTheme];
    const tg = 12;
    const tgx = cardX + SIMPLE_CARD_W - tg - 3;
    const tgy = cardY + 3;
    _drawDoorThemeGlyph(ctx, tgx, tgy, tg, theme, pulse);
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

// Fusion sigil — two interlocked rings (Venn-diagram style), drawn
// procedurally because the unicode "⊗" we used to render reads as a
// "deny / block" mark, not a "two things merging" mark. Tint is the
// reward border color; size is the ring radius. The overlapping
// region gets a brighter highlight so the eye reads "fused", not
// "two separate things".
function _drawFusionSigil(ctx, cx, cy, r, color) {
  ctx.save();
  const offsetX = r * 0.55;
  // Outer rings — left and right circles
  ctx.lineWidth = 2.4;
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.arc(cx - offsetX, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx + offsetX, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  // Overlap highlight — a small filled lens at the intersection so
  // the "merged" point reads as the bright focus of the sigil.
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.28, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Theme glyph — small canvas-rendered icon in the door card's corner.
// Same procedural-primitive family as the affix HP-bar glyphs and the
// modal's relic-card theme chip. Caller passes (x,y) top-left of the
// chip, side length, theme object from THEMES, and the door's pulse
// modulator. Glyph + border tinted to theme.color; backdrop dark for
// contrast against the door card's existing tint fill.
function _drawDoorThemeGlyph(ctx, x, y, size, theme, pulse = 1) {
  ctx.save();
  // Backdrop chip — dark + theme-tinted border
  ctx.fillStyle = 'rgba(8, 6, 12, 0.85)';
  ctx.fillRect(x, y, size, size);
  ctx.strokeStyle = hexA(theme.color, 0.85 * pulse);
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
  // Glyph — same canvas paths as the modal _drawThemeChip
  const cx = x + size / 2;
  const cy = y + size / 2;
  const r = (size - 5) / 2;
  ctx.fillStyle = hexA(theme.color, pulse);
  ctx.strokeStyle = hexA(theme.color, pulse);
  ctx.lineWidth = 1.0;
  switch (theme.id) {
    case 'storm': {
      ctx.beginPath();
      ctx.moveTo(cx + r * 0.35, cy - r);
      ctx.lineTo(cx - r * 0.20, cy - r * 0.05);
      ctx.lineTo(cx + r * 0.10, cy - r * 0.05);
      ctx.lineTo(cx - r * 0.35, cy + r);
      ctx.lineTo(cx + r * 0.20, cy + r * 0.05);
      ctx.lineTo(cx - r * 0.10, cy + r * 0.05);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'flame': {
      ctx.beginPath();
      ctx.moveTo(cx, cy - r);
      ctx.bezierCurveTo(cx + r * 0.85, cy - r * 0.2, cx + r * 0.55, cy + r * 0.7, cx, cy + r * 0.85);
      ctx.bezierCurveTo(cx - r * 0.55, cy + r * 0.7, cx - r * 0.85, cy - r * 0.2, cx, cy - r);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'blood': {
      ctx.beginPath();
      ctx.moveTo(cx, cy + r);
      ctx.bezierCurveTo(cx + r * 0.85, cy + r * 0.2, cx + r * 0.55, cy - r * 0.7, cx, cy - r * 0.85);
      ctx.bezierCurveTo(cx - r * 0.55, cy - r * 0.7, cx - r * 0.85, cy + r * 0.2, cx, cy + r);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'vow': {
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.9, cy - r * 0.7);
      ctx.lineTo(cx + r * 0.9, cy - r * 0.7);
      ctx.lineTo(cx + r * 0.9, cy + r * 0.1);
      ctx.lineTo(cx, cy + r);
      ctx.lineTo(cx - r * 0.9, cy + r * 0.1);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'shadow': {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(cx + r * 0.45, cy - r * 0.15, r * 0.85, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      break;
    }
    default: {
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}
