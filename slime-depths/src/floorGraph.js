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
  FLOOR_ENEMY_MULS,
  makeCombatRoom, makeEventRoom, makeAltarRoom, makeTroveRoom, makeChallengeRoom,
  makeBossSpawns,
} from './floor.js';
import { ROOM_W, ROOM_H } from './room.js';

// Elite chance per floor (mirrored from floor.js for now — can import later
// if we decide to expose it). Floor 1 small, ramps up.
const ELITE_CHANCE_BY_LEVEL = [0, 0.08, 0.25, 0.40, 0.55];

// Layer recipe — ordered from start+1 up to boss-1. Each entry picks `count`
// nodes from its `options` pool, with repeats allowed so a layer can have
// e.g. [combat, combat, elite]. `noCombatSlot` is the pacing slot name
// fed into makeCombatRoom (combat1/combat2/combat3) to match difficulty.
const LAYER_RECIPE = [
  { layer: 1, options: ['combat', 'combat'],             count: 2, combatSlot: 'combat1' },
  { layer: 2, options: ['event', 'event', 'combat'],     count: 3, combatSlot: 'combat2' },
  { layer: 3, options: ['combat', 'elite'],              count: 2, combatSlot: 'combat2' },
  { layer: 4, options: ['sanctuary'],                    count: 1, combatSlot: null       },
  { layer: 5, options: ['combat', 'elite'],              count: 2, combatSlot: 'combat3' },
];
const BOSS_LAYER = LAYER_RECIPE.length + 1;   // 6 in the current recipe

let _nextNodeId = 0;
function makeNode(kind, layer) {
  return {
    id: _nextNodeId++,
    kind,
    layer,
    edges: [],
    roomData: null,
    visited: false,
    current: false,
  };
}

function pickIdx(arr) { return (Math.random() * arr.length) | 0; }

// ----- Room data builders per graph kind -----
// These are thin adapters that call the existing floor.js helpers so content
// logic (enemy composition, curses, affixes, etc.) stays centralized.

function buildRoomForKind(kind, level, combatSlot) {
  const eliteChance = ELITE_CHANCE_BY_LEVEL[level] || 0;
  switch (kind) {
    case 'start':
      return {
        kind: 'start', pillarTemplate: 3, spawns: [], cleared: true,
        doors: { north: true, south: false },
      };
    case 'combat':
      return makeCombatRoom(level, combatSlot || 'combat1', eliteChance);
    case 'elite': {
      // "Elite" is a combat room that forces elites via a bumped chance.
      // Reuses makeCombatRoom but overrides post-gen so every spawn rolls elite.
      const room = makeCombatRoom(level, combatSlot || 'combat2', Math.max(eliteChance, 0.65));
      // Mark for UI differentiation; keep kind 'combat' so combat logic works.
      room.eliteRoom = true;
      return room;
    }
    case 'event':
      return makeEventRoom(level, eliteChance);
    case 'sanctuary':
      // Same as the current linear-floor 'reward' room.
      return { kind: 'reward', pillarTemplate: 3, spawns: [], cleared: true,
               doors: { north: true, south: true } };
    case 'boss': {
      const bossPillarTemplate = (Math.random() * 15) | 0;
      return {
        kind: 'boss', pillarTemplate: bossPillarTemplate,
        spawns: makeBossSpawns(level, bossPillarTemplate),
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
 */
export function generateFloorGraph(level = 1) {
  const lvl = Math.max(1, Math.min(MAX_FLOORS, level | 0));
  _nextNodeId = 0;

  // Layer 0: start (exactly one node).
  const start = makeNode('start', 0);
  start.roomData = buildRoomForKind('start', lvl, null);
  const nodes = [start];

  // Build body layers.
  const layerToNodes = [[start]];
  for (const recipe of LAYER_RECIPE) {
    const layerNodes = [];
    for (let i = 0; i < recipe.count; i++) {
      const kind = recipe.options[pickIdx(recipe.options)];
      const n = makeNode(kind, recipe.layer);
      n.roomData = buildRoomForKind(kind, lvl, recipe.combatSlot);
      nodes.push(n);
      layerNodes.push(n);
    }
    connectLayers(layerToNodes[layerToNodes.length - 1], layerNodes);
    layerToNodes.push(layerNodes);
  }

  // Final: boss layer. All pre-boss nodes connect here so every path ends at boss.
  const boss = makeNode('boss', BOSS_LAYER);
  boss.roomData = buildRoomForKind('boss', lvl, null);
  nodes.push(boss);
  for (const pre of layerToNodes[layerToNodes.length - 1]) pre.edges.push(boss.id);

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
