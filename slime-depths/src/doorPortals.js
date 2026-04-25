// ============================================================================
// DOOR PORTALS — Hades-style room-to-room navigation.
//
// Replaces the clickable floor-map overlay with in-world portals at each
// cleared room's exit. After combat clears, 1-3 stone arches appear along
// the north wall (one per outgoing edge of the current graph node). Each
// arch shows a sigil + label naming what's beyond. The hero walks onto an
// arch — not clicks a node — to commit to the next room. Map overlay
// stays accessible via the M key for a full-DAG bird's-eye view, but the
// PRIMARY navigation is now diegetic and immersive.
//
// Why diegetic: floor maps yank the player out of the world. Hades, Dead
// Cells, and Slay-the-Spire-but-walking solve this by keeping the choice
// embedded IN the room. The player never breaks flow to make the choice.
//
// Public API:
//   spawnDoorsForNode(graph, nodeId)  — build portals[] from outgoing edges
//   clearDoors()                       — wipe between rooms / on transition
//   updateDoors(dt) -> targetNodeId | null  — tick anim + check entry
//   drawDoors(ctx)                     — render in world space (call inside
//                                         the camera transform)
// ============================================================================

import { TILE, room } from './room.js';
import { hero } from './hero.js';
import { sparkle } from './particles.js';

// Single canonical glyph + label + accent color per node kind. Aligned with
// mapScreen.js so the visual language is consistent if the player ever
// peeks at the full map.
const KIND_GLYPHS = {
  combat:    '⚔', // ⚔
  elite:     '☠', // ☠
  event:     '✦', // ✦
  sanctuary: '✚', // ✚
  reward:    '✚', // ✚ (linear-floor naming for sanctuary)
  boss:      '♛', // ♛
};
const KIND_LABELS = {
  combat:    'COMBAT',
  elite:     'ELITE',
  event:     'MYSTERY',
  sanctuary: 'REST',
  reward:    'REST',
  boss:      'THE BOSS',
};
const KIND_COLORS = {
  combat:    '#c8b894',
  elite:     '#e07070',
  event:     '#c8a0ff',
  sanctuary: '#86e3a8',
  reward:    '#86e3a8',
  boss:      '#ff9a55',
};

// Active portals — one per next-node choice. Array gets emptied between rooms.
export const doorPortals = [];

// Hero must stand inside a portal's trigger radius for this many seconds
// before the transition fires. Prevents accidental commits when the hero
// just walks past one. 0.45s is short enough to feel responsive but long
// enough that brushing past doesn't fire.
const COMMIT_DWELL = 0.45;
const TRIGGER_RADIUS = 42;        // px — slightly larger than hero radius (14)

// ============================================================================
// Spawn — called when the room is cleared and the hero is about to choose.
// Reads the current node's outgoing edges, places one arch per target evenly
// across the north wall (avoiding the literal door tile so it doesn't
// overlap weirdly with the wall art).
// ============================================================================
export function spawnDoorsForNode(graph, currentNodeId) {
  doorPortals.length = 0;
  if (!graph || currentNodeId == null) return;
  const node = graph.nodes.find(n => n.id === currentNodeId);
  if (!node || !node.edges || node.edges.length === 0) return;
  const targets = node.edges
    .map(eid => graph.nodes.find(n => n.id === eid))
    .filter(Boolean);
  if (targets.length === 0) return;

  // Position along the north wall — wall is at y=0 (the wall row is the very
  // first tile). Doors sit a touch BELOW the wall (in the open floor) so the
  // hero can actually walk to them without clipping into the wall row.
  const yPx = TILE * 1.6;
  const w = room.w || 20;
  const widthPx = w * TILE;

  // Spread across ~70% of the room width, evenly spaced.
  const spread = widthPx * 0.7;
  const startX = widthPx * 0.5 - spread / 2;
  const slots = targets.length;
  const spacing = slots > 1 ? spread / (slots - 1) : 0;

  for (let i = 0; i < slots; i++) {
    const t = targets[i];
    doorPortals.push({
      x: slots > 1 ? (startX + i * spacing) : widthPx * 0.5,
      y: yPx,
      targetNodeId: t.id,
      kind: t.kind,
      glyph: KIND_GLYPHS[t.kind] || '?',
      label: KIND_LABELS[t.kind] || (t.kind || '?').toUpperCase(),
      color: KIND_COLORS[t.kind] || '#cccccc',
      // Per-portal animation state
      dwellTime: 0,                    // seconds hero has stood inside
      pulse: Math.random() * Math.PI * 2,
      sparkleAcc: 0,
    });
  }
}

// Drop all active portals — called on transition start so they don't carry
// over visually into the next room.
export function clearDoors() {
  doorPortals.length = 0;
}

// Per-frame update. Returns the targetNodeId once a portal commits, else null.
// Call once in the main tick AFTER hero movement.
export function updateDoors(dt) {
  if (doorPortals.length === 0) return null;
  let entered = null;
  for (const d of doorPortals) {
    d.pulse += dt * 2.4;
    // Ambient sparkles drifting upward through the arch — about 4/sec per portal
    d.sparkleAcc += dt;
    if (d.sparkleAcc > 0.25) {
      d.sparkleAcc = 0;
      const sx = d.x + (Math.random() - 0.5) * 28;
      const sy = d.y + 12 + (Math.random() - 0.5) * 6;
      sparkle(sx, sy, d.color);
    }
    const dx = hero.x - d.x;
    const dy = hero.y - d.y;
    const distSq = dx * dx + dy * dy;
    if (distSq < TRIGGER_RADIUS * TRIGGER_RADIUS) {
      d.dwellTime += dt;
      if (d.dwellTime >= COMMIT_DWELL && entered === null) {
        entered = d.targetNodeId;
      }
    } else {
      // Decay quickly so leaving the portal resets the commit
      d.dwellTime = Math.max(0, d.dwellTime - dt * 3);
    }
  }
  return entered;
}

// Render call — must be inside the camera transform so portals scroll with
// the world. Drawn after walls, before entities, so hero can stand in front.
export function drawDoors(ctx) {
  if (doorPortals.length === 0) return;
  for (const d of doorPortals) {
    drawOnePortal(ctx, d);
  }
}

function drawOnePortal(ctx, d) {
  const pulse = (Math.sin(d.pulse) + 1) * 0.5;       // 0..1
  const dwell = d.dwellTime / COMMIT_DWELL;            // 0..1 (commit progress)
  const baseAlpha = 0.55 + pulse * 0.35;

  ctx.save();
  ctx.translate(d.x, d.y);

  // ─── Outer aura — fades into the floor, signals "interactive" ──────────
  const auraR = 64 + pulse * 6;
  const aura = ctx.createRadialGradient(0, 0, 4, 0, 0, auraR);
  aura.addColorStop(0, hexA(d.color, baseAlpha * 0.8));
  aura.addColorStop(0.5, hexA(d.color, baseAlpha * 0.25));
  aura.addColorStop(1, hexA(d.color, 0));
  ctx.fillStyle = aura;
  ctx.fillRect(-auraR, -auraR, auraR * 2, auraR * 2);

  // ─── Stone arch frame (carved out of the wall) ─────────────────────────
  // Dark frame for the portal opening
  ctx.fillStyle = 'rgba(20, 14, 18, 0.92)';
  ctx.beginPath();
  // Arch shape: vertical sides + rounded top
  ctx.moveTo(-26, 36);
  ctx.lineTo(-26, -8);
  ctx.quadraticCurveTo(-26, -38, 0, -38);
  ctx.quadraticCurveTo(26, -38, 26, -8);
  ctx.lineTo(26, 36);
  ctx.closePath();
  ctx.fill();

  // Stone outline
  ctx.strokeStyle = 'rgba(180, 160, 130, 0.75)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // ─── Inner light — the "portal" itself (the next room's color) ─────────
  const inner = ctx.createRadialGradient(0, 4, 6, 0, 4, 32);
  inner.addColorStop(0, hexA(d.color, baseAlpha));
  inner.addColorStop(0.6, hexA(d.color, baseAlpha * 0.45));
  inner.addColorStop(1, hexA(d.color, 0.05));
  ctx.fillStyle = inner;
  // Clip to arch
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(-23, 34);
  ctx.lineTo(-23, -6);
  ctx.quadraticCurveTo(-23, -34, 0, -34);
  ctx.quadraticCurveTo(23, -34, 23, -6);
  ctx.lineTo(23, 34);
  ctx.closePath();
  ctx.clip();
  ctx.fillRect(-26, -38, 52, 76);
  ctx.restore();

  // ─── Glyph (the kind icon) ─────────────────────────────────────────────
  ctx.fillStyle = '#1a1410';
  ctx.font = 'bold 26px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // shadow ring behind glyph for legibility
  ctx.shadowColor = hexA(d.color, baseAlpha);
  ctx.shadowBlur = 14;
  ctx.fillStyle = d.color;
  ctx.fillText(d.glyph, 0, -4);
  ctx.shadowBlur = 0;

  // ─── Label below the arch (manuscript serif feel) ──────────────────────
  ctx.font = '11px Georgia, "Cormorant Garamond", serif';
  ctx.fillStyle = hexA(d.color, 0.95);
  ctx.textBaseline = 'top';
  // text shadow for readability against floor
  ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
  ctx.shadowBlur = 4;
  ctx.fillText(d.label, 0, 44);
  ctx.shadowBlur = 0;

  // ─── Commit ring — fills as hero stands inside, at COMMIT_DWELL → 1.0 ──
  if (dwell > 0) {
    ctx.strokeStyle = hexA(d.color, 0.85);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 4, 38, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * dwell);
    ctx.stroke();
    // Inner ring (subtle)
    ctx.strokeStyle = hexA(d.color, dwell * 0.4);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 4, 32, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

// ─── helper ─────────────────────────────────────────────────────────────────
function hexA(hex, a) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 'rgba(' + r + ',' + g + ',' + b + ',' + a.toFixed(3) + ')';
}
