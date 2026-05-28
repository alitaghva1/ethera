// LEGACY (Phase 2 quarantine — see CANONICAL.md):
//   The DAG branching graph is the OLD progression model. The canonical
//   game is a linear 5-zone progression (ruins → cemetery → crypt →
//   mountain → volcano) driven by `src/zoneEncounters.js`. This file is
//   only consumed when `__startRun()` (legacy menu CTA) is invoked. Will
//   be deleted in Phase 4 alongside `floor.js` + `mapScreen.js`. Do NOT
//   extend.
//
// ============================================================================
// FLOOR GRAPH — branching map generator for the systems-roguelite pivot
//
// Replaces the linear 7-room spine with a DAG where the player chooses the
// path through each floor. Reuses the existing combat / event / boss
// content generators in floor.js so no content work is lost — only the
// sequencing gains agency.
//
// Shape (per floor):
//   layer 0                           start
//   layer 1    [combat | combat]      first choice
//   layer 2    [event  | event  | combat]  pacing branch
//   layer 3    [combat | elite]       risk/reward
//   layer 4    [sanctuary]            forced rest before the boss
//   layer 5    [combat | elite]       pre-boss tension
//   layer 6                           boss
//
// Three forked decisions per floor, one guaranteed sanctuary, one boss.
// Every non-start node has at least one incoming edge (reachable from
// start) and every node has an outgoing path to the boss.
//
// Data model:
//   graph = { nodes, startId, bossId }
//   node  = { id, kind, layer, edges:[ids], roomData, visited, current }
//
// roomData is the same shape as the array elements from floor.js's
// generateFloor() output, so downstream room/render code keeps working
// unchanged — only the room-to-room traversal logic differs.
// ============================================================================

import {
  MAX_FLOORS,
  makeCombatRoom, makeEventRoom, makeRewardRoom,
  makeBossSpawns,
} from './floor.js';
import { ROOM_SIZES } from './room.js';

// Elite chance per floor (mirrored from floor.js for now — can import later
// if we decide to expose it). Floor 1 small, ramps up.
const ELITE_CHANCE_BY_LEVEL = [0, 0.08, 0.25, 0.40, 0.55];

// Elite affix IDs — mirrored from enemies.js ELITE_AFFIXES. Hardcoded here
// to avoid a circular import (floorGraph already imports floor.js, which
// imports room.js; enemies.js touches hero/relics/synergies). Pre-rolled
// at graph build time so the door/map render can show "ELITE · FROST"
// before the player enters the room. The same id is then passed through
// to spawnEnemy as opts.affix so the displayed affix matches reality.
const ELITE_AFFIX_IDS = ['frost', 'ember', 'venom', 'warded'];
function pickEliteAffix() {
  return ELITE_AFFIX_IDS[(Math.random() * ELITE_AFFIX_IDS.length) | 0];
}

// Layer recipe — ordered from start+1 up to boss-1. Each entry picks `count`
// nodes from its `options` pool, with repeats allowed so a layer can have
// e.g. [combat, combat, elite]. `combatSlot` is the pacing slot name
// fed into makeCombatRoom (combat1/combat2/combat3) to match difficulty.
//
// forkKinds — if set, REPLACES random picks with this exact array when the
// floor level is >= forkMinLevel. Used to guarantee a meaningful first fork.
//
// Floor 1 used to ramp [combat, combat] / event / [combat, combat] /
// sanctuary / [combat, combat] — no elite fork until floor 2, and with
// random elite chance only 8%, a brand-new player could finish floor 1
// without seeing a single elite affix. Layer 5 now offers [combat,
// elite] on floor 1 too, so first-floor players get a controlled
// introduction to the affix system before the floor-2 difficulty bump.
const LAYER_RECIPE = [
  { layer: 1, options: ['combat', 'combat'],             count: 2, combatSlot: 'combat1',
    forkKinds: ['combat', 'elite'], forkMinLevel: 2 },
  { layer: 2, options: ['event', 'event', 'combat'],     count: 3, combatSlot: 'combat2' },
  { layer: 3, options: ['combat', 'elite'],              count: 2, combatSlot: 'combat2' },
  { layer: 4, options: ['sanctuary'],                    count: 1, combatSlot: null       },
  { layer: 5, options: ['combat', 'elite'],              count: 2, combatSlot: 'combat3' },
];
const BOSS_LAYER = LAYER_RECIPE.length + 1;   // 6 in the current recipe

// Path tag — derives from node kind. Used by the map render to distinguish
// "safe road" from "hard road" so forks feel strategic, not aesthetic.
//   safe     — sanctuary / reward (no danger, no drop)
//   standard — combat / event (default path)
//   perilous — elite / boss (harder, better reward)
export function pathForKind(kind) {
  if (kind === 'sanctuary' || kind === 'reward') return 'safe';
  if (kind === 'elite' || kind === 'boss') return 'perilous';
  return 'standard';
}

// Round-7 ROOM REWARD assignment — Hades-inspired Phase 1+2 of the
// rooms-redesign plan. Each non-start, non-boss node carries a
// `roomReward` tag that:
//   1. Tells the player WHAT they'll get before walking through the
//      door (rendered as a chip on the door label, see doorPortals.js).
//   2. Biases the actual loot/effect that fires in the room (see
//      main.js loadRoom for spawn-time application).
//
// Distribution rules — keyed on path so safe / standard / perilous
// each have a coherent identity:
//   safe       -> heal           (sanctuary always heals on clear)
//   standard   -> 50/30/20 gold / fusion / none
//   perilous   -> 60/30/10 rare+ / legendary / gold
//   boss       -> 'boss-pool'    (dedicated themed-loot path; not a
//                                 chip on the door, just metadata)
//
// Reward types are SUFFIXES — combat with gold reward is still combat,
// just with a 1.5x gold drop multiplier. Altars with legendary reward
// still cost HP, just guaranteed legendary tier.
const REWARD_GLYPHS = {
  gold:      '◈',
  'rare+':   '✦',
  legendary: '★',
  heal:      '✚',
  fusion:    '⊗',
};
const REWARD_LABELS = {
  gold:      'GOLD',
  'rare+':   'RARE+',
  legendary: 'LEGENDARY',
  heal:      'HEAL',
  fusion:    'FUSION',
};
// Variety guard — runs once per layer after siblings are built. Two
// jobs:
//
//   1. DEDUPE — siblings can't share the same theme or reward bias.
//      Two GOLD doors or two SHADOW doors at the same fork is the
//      "your choices feel identical" failure mode.
//
//   2. FORCE-VISIBLE — at least ONE sibling must have visible identity
//      (theme, reward, or non-combat kind). The architectural-render
//      system in doorPortals.js intentionally renders nothing on pure-
//      substrate combat doors; if BOTH siblings at a fork are pure-
//      substrate, the player sees two visually-identical bare doors
//      and the generation feels broken. Force at least one to be
//      themed so the fork is a real choice.
//
// Both passes mutate node.roomReward / node.roomTheme in place AND
// re-propagate to roomData (which is what the runtime renderer reads).
function dedupeLayerSiblings(layerNodes) {
  if (layerNodes.length < 2) return;
  // ── Pass 1: dedupe rewards + themes across siblings ──────────────
  const seenReward = new Set();
  const seenTheme = new Set();
  for (const n of layerNodes) {
    if (n.roomReward && seenReward.has(n.roomReward)) {
      let fresh = null;
      for (let attempt = 0; attempt < 4; attempt++) {
        const candidate = rollRoomReward(n.kind, n.path);
        if (!seenReward.has(candidate)) { fresh = candidate; break; }
      }
      n.roomReward = fresh;
      if (n.roomData) n.roomData.roomReward = fresh;
    }
    if (n.roomReward) seenReward.add(n.roomReward);
    if (n.roomTheme && seenTheme.has(n.roomTheme)) {
      let fresh = null;
      for (let attempt = 0; attempt < 4; attempt++) {
        const candidate = rollRoomTheme(n.kind);
        if (!candidate || !seenTheme.has(candidate)) { fresh = candidate; break; }
      }
      n.roomTheme = fresh;
      if (n.roomData) n.roomData.roomTheme = fresh;
    }
    if (n.roomTheme) seenTheme.add(n.roomTheme);
  }
  // ── Pass 2: force at least one sibling to carry visible identity ──
  // A "visible" signal is anything the architectural door renderer
  // will paint marks for: a theme, a build-power reward (FUSION /
  // LEGENDARY / MYTHIC), or a special kind (anything other than
  // combat / chestroom / trove). GOLD / RARE+ / HEAL are substrate-
  // tier rewards and don't count as visible identity.
  const VISIBLE_REWARDS = new Set(['fusion', 'legendary', 'mythic']);
  const PLAIN_KINDS = new Set(['combat', 'chestroom', 'trove']);
  const anyVisible = layerNodes.some(n =>
    n.roomTheme ||
    VISIBLE_REWARDS.has(n.roomReward) ||
    !PLAIN_KINDS.has(n.kind)
  );
  if (!anyVisible) {
    // Pick a random sibling to receive a forced theme. Avoid themes
    // already claimed by other siblings (rare since this fires when
    // none have themes, but defensive). No re-propagation tracking
    // needed — assigning fresh theme is sufficient.
    const targetIdx = (Math.random() * layerNodes.length) | 0;
    const target = layerNodes[targetIdx];
    const POOL = ['storm', 'flame', 'blood', 'vow', 'shadow'];
    let pick = POOL[(Math.random() * POOL.length) | 0];
    let attempts = 0;
    while (seenTheme.has(pick) && attempts++ < 5) {
      pick = POOL[(Math.random() * POOL.length) | 0];
    }
    target.roomTheme = pick;
    if (target.roomData) target.roomData.roomTheme = pick;
  }
}

function rollRoomReward(kind, path) {
  if (kind === 'start' || kind === 'boss') return null;
  // Sanctuary already says "REST" on the door label and the room itself
  // heals the player on touch — a redundant "HEAL" chip just adds noise.
  // Future content session can introduce sanctuary variants (centaur
  // heart, fountain) that DO need distinguishing chips; until then the
  // kind label carries the meaning solo.
  if (kind === 'sanctuary' || kind === 'reward') return null;
  // Altar nodes (handled inside event rooms) get legendary if perilous,
  // otherwise no reward chip — the altar tier itself is the reward.
  if (path === 'perilous') {
    const r = Math.random();
    if (r < 0.60) return 'rare+';
    if (r < 0.90) return 'legendary';
    return 'gold';
  }
  if (path === 'standard') {
    const r = Math.random();
    if (r < 0.50) return 'gold';
    if (r < 0.80) return 'fusion';
    return null;     // 20% standard-no-bonus combat (the "default" room)
  }
  return null;
}
export function rewardGlyph(reward) { return reward ? (REWARD_GLYPHS[reward] || '?') : null; }
export function rewardLabel(reward) { return reward ? (REWARD_LABELS[reward] || reward.toUpperCase()) : null; }

// Theme assignment — pedestal-bearing rooms get a theme tag with
// some probability. Themed rooms tell the player at door-preview time
// what build axis the room favors (Hades-style "Athena chamber"
// signaling). Mixed-theme rooms stay null. The relic-roll bias in
// rollRelicOffer({ theme }) routes the actual offers toward the
// theme. Combat / boss / start / trove / chestroom skip — those
// don't have a "you chose this room for the offer" beat.
const PEDESTAL_THEMES = ['storm', 'flame', 'blood', 'vow', 'shadow'];
function rollRoomTheme(kind) {
  // Reward-class rooms (sanctuary/reward/altar/shop/elite) — 60% themed.
  // Players actively chose these for the offer; high theme density makes
  // the build axis legible at a glance.
  //
  // Combat / challenge rooms — 30% themed. Combat is the bulk of rooms;
  // themed combat is the special case ("ah, this fight rewards a SHADOW
  // relic"), not the default. The post-clear pedestal spawn at main.js
  // already passes roomTheme through, so themed combat rooms drop themed
  // pedestals automatically. Door cards already render the theme glyph
  // for any door whose target node carries a roomTheme, so the player
  // sees the theme before walking in.
  //
  // Skipped kinds: start, boss, mini, trove, chestroom, hamlet — those
  // either don't drop pedestals or have their own reward rules.
  let p;
  if (kind === 'sanctuary' || kind === 'reward' || kind === 'altar'
      || kind === 'shop' || kind === 'elite') {
    p = 0.60;
  } else if (kind === 'combat' || kind === 'challenge') {
    p = 0.30;
  } else {
    return null;
  }
  if (Math.random() >= p) return null;
  return PEDESTAL_THEMES[(Math.random() * PEDESTAL_THEMES.length) | 0];
}

let _nextNodeId = 0;
function makeNode(kind, layer) {
  const path = pathForKind(kind);
  return {
    id: _nextNodeId++,
    kind,
    layer,
    path,                       // 'safe' | 'standard' | 'perilous'
    roomReward: rollRoomReward(kind, path),   // 'gold'|'rare+'|'legendary'|'heal'|'fusion'|null
    // 60% themed pedestal rooms — biases the relic roll toward the
    // theme + surfaces a glyph on the door so the player can choose
    // their build axis from the map. null for mixed / combat / boss.
    roomTheme: rollRoomTheme(kind),

    // Round-7 Phase 5 — Blood Door seal. When `sealed: true`, the door
    // leading INTO this node renders as a "BLOOD GATE" and stays closed
    // until the player breaks the seal with E (pays sealCost HP).
    // sealedFor / sealCost set during graph generation by sealNodes()
    // pass below; default false. Seal only fires on perilous-path
    // nodes since sealing the safe-path heal would be cruel.
    sealed: false,
    sealCost: 0,
    edges: [],
    roomData: null,
    visited: false,
    current: false,
  };
}

// Round-7 Phase 5 — sprinkle Blood Door seals across perilous-path nodes.
// Per-floor target: ~1-2 sealed doors. Cost scales by floor (F1=1 HP,
// F2=1, F3=2, F4=2). Sealed nodes also get their roomReward promoted to
// legendary (over-riding the original 'rare+'/'gold' roll) so the cost
// pays out — a sealed door MUST lead to something obviously valuable
// or the mechanic feels punitive.
function sealNodes(nodes, level) {
  const candidates = nodes.filter(n => n.path === 'perilous' && n.kind !== 'boss');
  if (candidates.length === 0) return;
  // Floor 1 always seals exactly 1 (teaches the mechanic on the most
  // common run). Higher floors get 1-2 with 50% chance for a second.
  const target = level === 1 ? 1 : (Math.random() < 0.5 ? 2 : 1);
  const sealCost = level >= 3 ? 2 : 1;
  // Shuffle candidates so the same node doesn't always seal.
  const pool = candidates.slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  for (let i = 0; i < Math.min(target, pool.length); i++) {
    const n = pool[i];
    n.sealed = true;
    n.sealCost = sealCost;
    n.roomReward = 'legendary';   // promoted reward — sealed = legendary
  }
}

function pickIdx(arr) { return (Math.random() * arr.length) | 0; }

// ----- Room data builders per graph kind -----
// These are thin adapters that call the existing floor.js helpers so content
// logic (enemy composition, curses, affixes, etc.) stays centralized.

function buildRoomForKind(kind, level, combatSlot) {
  const eliteChance = ELITE_CHANCE_BY_LEVEL[level] || 0;
  switch (kind) {
    case 'start': {
      const s = ROOM_SIZES.medium;
      return {
        kind: 'start', w: s.w, h: s.h, pillarTemplate: 3, spawns: [], cleared: true,
        doors: { north: true, south: false },
      };
    }
    case 'combat':
      return makeCombatRoom(level, combatSlot || 'combat1', eliteChance);
    case 'elite': {
      // Elite rooms carry the 'elite' slot through to pickArchetype
      // which biases toward arena/gauntlet/sanctum/crucible — the
      // perilous set. This gives elite rooms a distinct spatial
      // signature instead of reusing the standard combat archetype
      // pool. Tier scaling still uses the underlying combatSlot so
      // enemy difficulty matches the floor depth.
      const room = makeCombatRoom(level, 'elite', Math.max(eliteChance, 0.65), combatSlot || 'combat2');
      room.eliteRoom = true;
      // Phase 3 audit fix #1 — pre-roll the affix at graph build time
      // so the door label and map node can display it before the
      // player enters. Stamp on every elite spawn so spawnEnemy can
      // honor the same affix; without the stamp, spawnEnemy rolls a
      // fresh random affix and the door's promise drifts from reality.
      const affixId = pickEliteAffix();
      room.eliteAffixId = affixId;
      if (Array.isArray(room.spawns)) {
        for (const s of room.spawns) {
          if (s && s.elite) s.affixId = affixId;
        }
      }
      return room;
    }
    case 'event':
      return makeEventRoom(level, eliteChance);
    case 'sanctuary': {
      // Reward room — delegates to makeRewardRoom so the sanctuary
      // node and the linear-fallback reward share identical layout.
      return makeRewardRoom(ROOM_SIZES.small);
    }
    case 'boss': {
      const bossPillarTemplate = (Math.random() * 15) | 0;
      const s = ROOM_SIZES.large;
      return {
        kind: 'boss', w: s.w, h: s.h, pillarTemplate: bossPillarTemplate,
        spawns: makeBossSpawns(level, bossPillarTemplate, s.w, s.h),
        doors: { north: false, south: true },
      };
    }
    default:
      throw new Error('floorGraph: unknown kind ' + kind);
  }
}

// Wire each node in `prev` layer to 1-2 nodes in `next` layer, then repair
// any node in `next` that has no incoming edge so the graph stays connected.
function connectLayers(prev, next) {
  for (const p of prev) {
    const forkChance = 0.45;                       // 45% of nodes branch to 2
    const wantTargets = 1 + (Math.random() < forkChance ? 1 : 0);
    const targets = [];
    for (let tries = 0; tries < 8 && targets.length < wantTargets && targets.length < next.length; tries++) {
      const cand = next[pickIdx(next)];
      if (!targets.includes(cand)) targets.push(cand);
    }
    for (const t of targets) p.edges.push(t.id);
  }
  // Orphan repair — if any `next` node has no incoming edge, anchor one.
  for (const n of next) {
    const hasIncoming = prev.some(p => p.edges.includes(n.id));
    if (!hasIncoming) {
      const anchor = prev[pickIdx(prev)];
      if (!anchor.edges.includes(n.id)) anchor.edges.push(n.id);
    }
  }
}

/**
 * Generate a branching-DAG floor for the given floor level (1..MAX_FLOORS).
 * Returns { nodes, startId, bossId }.
 *
 * opts.extraSanctuary — when true, adds an EXTRA sanctuary node alongside
 * the normal combat/elite picks in layer 5 (the pre-boss tension layer).
 * Wired to THE STAR tarot card ("every floor has an extra sanctuary").
 */
export function generateFloorGraph(level = 1, opts = {}) {
  const extraSanctuary = !!opts.extraSanctuary;
  const lvl = Math.max(1, Math.min(MAX_FLOORS, level | 0));
  _nextNodeId = 0;

  // Layer 0: start (exactly one node).
  const start = makeNode('start', 0);
  start.roomData = buildRoomForKind('start', lvl, null);
  // Round-7 — propagate the node's roomReward onto roomData so downstream
  // loadRoom code (main.js, pedestals.js) can read `data.roomReward`
  // without needing the graph reference. roomData IS the per-room source
  // of truth at run-time; the node lives on the graph but roomData is
  // what gets pushed into the floor[] array.
  if (start.roomData) {
    start.roomData.roomReward = start.roomReward;
    start.roomData.roomTheme = start.roomTheme;
    // 2026-05-06 — per-room hash entropy. nodeId alone is monotonic
    // within a graph but COLLAPSES across runs for fixed-position kinds
    // (every sanctuary is layer-4 at id-8, every boss is id-11). To get
    // diverse rolls across runs and across rooms within a kind, stamp a
    // random 32-bit layoutSeed too. Fired once at graph-build time and
    // persisted on roomData, so reload reproduces the same layout. Both
    // values are consumed by the shell-pick + south-lantern + future
    // deterministic-roll systems that need per-instance variance.
    start.roomData.nodeId = start.id;
    start.roomData.layoutSeed = (Math.random() * 0x7fffffff) | 0;
  }
  start.actualKind = 'start';
  const nodes = [start];

  // Build body layers.
  const layerToNodes = [[start]];
  for (const recipe of LAYER_RECIPE) {
    const layerNodes = [];
    // Honor forkKinds override when present and floor level is past the
    // learner's-floor gate. Layer 1 becomes [combat, elite] at floors 2+,
    // turning the former [combat, combat] aesthetic fork into a real choice.
    const useFork = recipe.forkKinds && lvl >= (recipe.forkMinLevel || 1);
    for (let i = 0; i < recipe.count; i++) {
      const kind = useFork
        ? recipe.forkKinds[i % recipe.forkKinds.length]
        : recipe.options[pickIdx(recipe.options)];
      const n = makeNode(kind, recipe.layer);
      n.roomData = buildRoomForKind(kind, lvl, recipe.combatSlot);
      // Round-7 reward propagation onto roomData — see Layer 0 comment.
      if (n.roomData) {
        n.roomData.roomReward = n.roomReward;
        n.roomData.roomTheme = n.roomTheme;
        // 2026-05-06 — per-room nodeId + layoutSeed stamp (see Layer 0 comment).
        n.roomData.nodeId = n.id;
        n.roomData.layoutSeed = (Math.random() * 0x7fffffff) | 0;
      }
      // Round-7 — surface the actual room kind on the node when the
      // graph kind is the catch-all 'event'. makeEventRoom rolls into
      // altar / trove / chestroom / challenge / miniboss internally
      // and the actual kind hides behind a generic "MYSTERY" door
      // label — defeating the Hades-style "see your reward type" play.
      // Persisting the resolved kind on n.actualKind lets door rendering
      // + map sub-labels read the real type without changing the
      // graph-traversal kind (which stays 'event' so the layer recipe
      // logic doesn't get confused).
      if (kind === 'event' && n.roomData?.kind) {
        n.actualKind = n.roomData.kind;
      } else {
        n.actualKind = kind;
      }
      // Phase 3 audit fix #1 — surface the pre-rolled elite affix on the
      // node so door + map renders can read it without reaching into
      // roomData. Only set when the room actually has one (elite kind
      // OR event-room that resolved to a miniboss with an affix).
      if (n.roomData && n.roomData.eliteAffixId) {
        n.eliteAffixId = n.roomData.eliteAffixId;
      }
      nodes.push(n);
      layerNodes.push(n);
    }
    // THE STAR — inject an extra sanctuary node alongside layer 5's combat/elite
    // picks. Player can choose: 3rd combat option for momentum, or a safe heal.
    if (extraSanctuary && recipe.layer === 5) {
      const sanc = makeNode('sanctuary', recipe.layer);
      sanc.roomData = buildRoomForKind('sanctuary', lvl, null);
      if (sanc.roomData) {
        sanc.roomData.roomReward = sanc.roomReward;
        sanc.roomData.roomTheme = sanc.roomTheme;
        sanc.roomData.nodeId = sanc.id;
        sanc.roomData.layoutSeed = (Math.random() * 0x7fffffff) | 0;
      }
      sanc.actualKind = 'sanctuary';
      nodes.push(sanc);
      layerNodes.push(sanc);
    }
    // Variety guard — runs AFTER all nodes (including STAR sanctuary)
    // are pushed for this layer so siblings are evaluated together.
    // Dedupes both reward and theme biases so the player's fork
    // choices feel meaningfully distinct instead of two-of-a-kind.
    dedupeLayerSiblings(layerNodes);
    connectLayers(layerToNodes[layerToNodes.length - 1], layerNodes);
    layerToNodes.push(layerNodes);
  }

  // Final: boss layer. All pre-boss nodes connect here so every path ends at boss.
  const boss = makeNode('boss', BOSS_LAYER);
  boss.roomData = buildRoomForKind('boss', lvl, null);
  if (boss.roomData) {
    boss.roomData.roomReward = boss.roomReward;
    boss.roomData.roomTheme = boss.roomTheme;     // null for bosses
    boss.roomData.nodeId = boss.id;
    boss.roomData.layoutSeed = (Math.random() * 0x7fffffff) | 0;
  }
  boss.actualKind = 'boss';
  nodes.push(boss);
  for (const pre of layerToNodes[layerToNodes.length - 1]) pre.edges.push(boss.id);

  // Round-7 Phase 5 — apply Blood Door seals AFTER all nodes exist +
  // before propagating roomReward into roomData (so the seal's reward-
  // promotion sticks). Re-sync roomData.roomReward for sealed nodes
  // since sealNodes() mutates n.roomReward in place.
  sealNodes(nodes, lvl);
  for (const n of nodes) {
    if (n.sealed && n.roomData) {
      n.roomData.roomReward = n.roomReward;
    }
  }

  start.current = true;
  return { nodes, startId: start.id, bossId: boss.id, maxLayer: BOSS_LAYER };
}

/**
 * Reachability check — true if there's a path from startId to bossId in the
 * graph. Used as a self-test at boot; a malformed graph should never ship.
 */
export function isReachable(graph) {
  const visited = new Set([graph.startId]);
  const stack = [graph.startId];
  while (stack.length) {
    const cur = stack.pop();
    if (cur === graph.bossId) return true;
    const node = graph.nodes.find(n => n.id === cur);
    if (!node) continue;
    for (const e of node.edges) {
      if (!visited.has(e)) { visited.add(e); stack.push(e); }
    }
  }
  return false;
}

/**
 * Get the node object by id — O(n) but n is small (~11 nodes).
 */
export function getNode(graph, id) {
  return graph.nodes.find(n => n.id === id) || null;
}

/**
 * Nodes in `layer`. Useful for UI layout.
 */
export function nodesInLayer(graph, layer) {
  return graph.nodes.filter(n => n.layer === layer);
}
