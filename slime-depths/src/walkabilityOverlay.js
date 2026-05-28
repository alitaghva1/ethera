// ============================================================================
// WALKABILITY OVERLAY — in-engine collision editor for baked rooms.
//
// Why this exists: the bake's regex-driven collision pass nails 90% of
// cells, but the last 10% (props the artist named unexpectedly, walkable
// cells the artist drew on a "wall" layer for visual reasons, etc.) used
// to require regex tweaks per pack. This overlay flips that — the bake
// produces its best guess, the user clicks the wrong cells in-engine,
// and a sidecar JSON of overrides is generated. Next bake honors the
// sidecar.
//
// Usage:
//   __toggleWalkOverlay()   → show/hide the tinted-grid overlay.
//                              Red cells = blocked. Green cells = walkable.
//   click on a cell while overlay is visible → toggle that cell's state.
//   __exportWalkOverrides() → returns a JSON string ready to save as
//                              public/assets/rooms/<zone>_overrides.json.
//
// The overrides format is simple:
//   { "version": 1, "zone": "<zone>", "overrides": { "<x>,<y>": "walk" | "block" } }
//
// The bake script (when run with --apply-overrides) will read this
// sidecar and merge it into the final collision grid before producing
// the canonical .json. That makes the in-engine edits permanent + ship
// to all players.
// ============================================================================

import { TILE } from './room.js';

let _visible = false;
let _activeZone = null;            // current zone name for save/load
let _overrides = new Map();        // "x,y" → "walk" | "block"

const COLOR_BLOCK = 'rgba(220, 60, 70, 0.40)';
const COLOR_WALK  = 'rgba(60, 200, 110, 0.18)';
const COLOR_OVERRIDE_WALK = 'rgba(80, 240, 140, 0.55)';
const COLOR_OVERRIDE_BLOCK = 'rgba(255, 90, 100, 0.65)';
const COLOR_GRID  = 'rgba(255, 255, 255, 0.07)';

export function isOverlayVisible() { return _visible; }

export function toggleWalkOverlay() {
  _visible = !_visible;
  return _visible;
}

/** Set which zone the overrides should be tagged for. */
export function setOverlayZone(zoneName) {
  if (_activeZone === zoneName) return;
  _activeZone = zoneName;
  _overrides.clear();
}

/**
 * Determine if a cell is currently considered blocked. Reads
 * room.bakedCollision (auto-pass) THEN applies overrides on top.
 */
function _isBlockedAtCell(room, cx, cy) {
  const ovr = _overrides.get(`${cx},${cy}`);
  if (ovr === 'walk') return false;
  if (ovr === 'block') return true;
  // Auto-pass from bake's collisionGrid: any cell with rects = blocked.
  // Exception: a cell with a sub-tile rect (smaller than full tile) is
  // partly walkable. We treat that as walkable here for editing simplicity
  // (the actual collision system will still respect the sub-rect at runtime).
  const grid = room.bakedCollision;
  if (!grid || !grid[cy] || !grid[cy][cx]) return false;
  const cell = grid[cy][cx];
  if (!cell.rects || cell.rects.length === 0) return false;
  const tw = room.bakedTileSize || 32;
  for (const r of cell.rects) {
    if (r.w >= tw && r.h >= tw) return true;     // full-tile = blocked
  }
  return false;       // sub-tile = treat as walkable for overlay purposes
}

/**
 * Toggle a cell's override at world coordinates (px). Returns the new state.
 * - If currently auto-blocked → override to walk.
 * - If currently auto-walkable → override to block.
 * - If currently overridden → clear the override (revert to auto).
 */
export function toggleCellAtWorld(room, wx, wy) {
  const cx = Math.floor(wx / TILE);
  const cy = Math.floor(wy / TILE);
  if (cx < 0 || cy < 0 || cx >= room.w || cy >= room.h) return null;
  const key = `${cx},${cy}`;
  if (_overrides.has(key)) {
    _overrides.delete(key);
    return { cx, cy, state: 'cleared' };
  }
  const wasBlocked = _isBlockedAtCell(room, cx, cy);
  _overrides.set(key, wasBlocked ? 'walk' : 'block');
  return { cx, cy, state: wasBlocked ? 'walk' : 'block' };
}

/** Render the tinted grid + override markers. Called from main render(). */
export function drawWalkOverlay(ctx, room, cameraX, cameraY) {
  if (!_visible) return;
  if (!room || !room.bakedImage) return;        // only useful for baked rooms
  const tw = TILE;
  // Draw cells. Skip cells outside the camera frustum for perf.
  const cw = ctx.canvas.width;
  const ch = ctx.canvas.height;
  // World-space camera origin → tile range to draw.
  const x0 = Math.max(0, Math.floor(cameraX / tw) - 1);
  const y0 = Math.max(0, Math.floor(cameraY / tw) - 1);
  const x1 = Math.min(room.w, Math.ceil((cameraX + cw) / tw) + 1);
  const y1 = Math.min(room.h, Math.ceil((cameraY + ch) / tw) + 1);

  ctx.save();
  ctx.lineWidth = 1;
  for (let cy = y0; cy < y1; cy++) {
    for (let cx = x0; cx < x1; cx++) {
      const wx = cx * tw;
      const wy = cy * tw;
      const key = `${cx},${cy}`;
      const ovr = _overrides.get(key);
      const blocked = _isBlockedAtCell(room, cx, cy);
      // Tint
      let fill;
      if (ovr === 'block') fill = COLOR_OVERRIDE_BLOCK;
      else if (ovr === 'walk') fill = COLOR_OVERRIDE_WALK;
      else if (blocked) fill = COLOR_BLOCK;
      else fill = COLOR_WALK;
      ctx.fillStyle = fill;
      ctx.fillRect(wx, wy, tw, tw);
      // Grid line
      ctx.strokeStyle = COLOR_GRID;
      ctx.strokeRect(wx + 0.5, wy + 0.5, tw - 1, tw - 1);
    }
  }
  ctx.restore();

  // Phase B (audit Step 6) — render gameplay-layer markers on top of
  // the cell grid. These come from the bake's `meta.gameplay` block,
  // exposed at runtime as `room.bakedGameplay`. Each layer gets its
  // own canonical color so overlay is self-documenting.
  drawGameplayLayers(ctx, room);
}

// Color palette per the user's debug-overlay spec:
//   collision rects → red
//   walkable area  → green
//   stairs         → blue
//   transitions    → purple
//   spawn point    → yellow
const COLOR_GP_COLLISION   = 'rgba(255, 50, 60, 0.55)';
const COLOR_GP_WALKABLE    = 'rgba(60, 200, 110, 0.20)';
const COLOR_GP_STAIRS      = 'rgba(80, 150, 255, 0.55)';
const COLOR_GP_TRANSITION  = 'rgba(180, 100, 255, 0.55)';
const COLOR_GP_SPAWN       = 'rgba(255, 230, 80, 0.85)';

function drawGameplayLayers(ctx, room) {
  const gp = room.bakedGameplay;
  if (!gp) return;
  const TS = room.bakedTileSize || 32;
  const SCALE = TILE / TS;       // source-px → display-px

  ctx.save();
  ctx.lineWidth = 2;

  // Walkable region — green outline (rendered first so other markers
  // sit on top). Empty array == implicit "everywhere walkable."
  if (gp.walkableRects && gp.walkableRects.length) {
    ctx.fillStyle = COLOR_GP_WALKABLE;
    ctx.strokeStyle = 'rgba(80, 240, 140, 0.85)';
    for (const r of gp.walkableRects) {
      ctx.fillRect(r.x * SCALE, r.y * SCALE, r.w * SCALE, r.h * SCALE);
      ctx.strokeRect(r.x * SCALE + 0.5, r.y * SCALE + 0.5, r.w * SCALE - 1, r.h * SCALE - 1);
    }
  }

  // Collision rects — red outline.
  if (gp.collisionRects && gp.collisionRects.length) {
    ctx.fillStyle = COLOR_GP_COLLISION;
    ctx.strokeStyle = 'rgba(255, 80, 90, 0.95)';
    for (const r of gp.collisionRects) {
      ctx.fillRect(r.x * SCALE, r.y * SCALE, r.w * SCALE, r.h * SCALE);
      ctx.strokeRect(r.x * SCALE + 0.5, r.y * SCALE + 0.5, r.w * SCALE - 1, r.h * SCALE - 1);
    }
  }

  // Stairs — blue with direction arrow + elevation label.
  if (gp.stairs && gp.stairs.length) {
    for (const s of gp.stairs) {
      ctx.fillStyle = COLOR_GP_STAIRS;
      ctx.fillRect(s.x * SCALE, s.y * SCALE, s.w * SCALE, s.h * SCALE);
      ctx.strokeStyle = 'rgba(120, 180, 255, 0.95)';
      ctx.strokeRect(s.x * SCALE + 0.5, s.y * SCALE + 0.5, s.w * SCALE - 1, s.h * SCALE - 1);
      // Elevation label
      ctx.fillStyle = '#cce4ff';
      ctx.font = 'bold 11px Georgia,serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const cx = (s.x + s.w / 2) * SCALE;
      const cy = (s.y + s.h / 2) * SCALE;
      ctx.fillText(`${s.fromElevation}→${s.toElevation}`, cx, cy);
    }
  }

  // Transitions — purple with target name.
  if (gp.transitions && gp.transitions.length) {
    for (const t of gp.transitions) {
      ctx.fillStyle = COLOR_GP_TRANSITION;
      ctx.fillRect(t.x * SCALE, t.y * SCALE, t.w * SCALE, t.h * SCALE);
      ctx.strokeStyle = 'rgba(220, 140, 255, 0.95)';
      ctx.strokeRect(t.x * SCALE + 0.5, t.y * SCALE + 0.5, t.w * SCALE - 1, t.h * SCALE - 1);
      ctx.fillStyle = '#e8d4ff';
      ctx.font = 'bold 10px Georgia,serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const cx = (t.x + t.w / 2) * SCALE;
      const cy = (t.y + t.h / 2) * SCALE;
      ctx.fillText(`→ ${t.targetMap || 'next'}`, cx, cy);
    }
  }

  // Spawn point — yellow diamond.
  if (room.bakedSpawn) {
    const sx = (room.bakedSpawn.x + 0.5) * TILE;
    const sy = (room.bakedSpawn.y + 0.5) * TILE;
    ctx.fillStyle = COLOR_GP_SPAWN;
    ctx.beginPath();
    ctx.moveTo(sx, sy - 14);
    ctx.lineTo(sx + 14, sy);
    ctx.lineTo(sx, sy + 14);
    ctx.lineTo(sx - 14, sy);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(150, 110, 0, 0.9)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#3a2b00';
    ctx.font = 'bold 10px Georgia,serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('S', sx, sy);
  }

  ctx.restore();
}

/** Render the hero foot-collision box + sprite bounds. Called by main
 *  render() in world space. Visible only when overlay is on. */
export function drawHeroCollisionDebug(ctx, hero, halfW, halfH, drawSize) {
  if (!_visible) return;
  ctx.save();
  // Sprite bounds (visible body) — thin gray rectangle.
  ctx.strokeStyle = 'rgba(180, 180, 200, 0.55)';
  ctx.lineWidth = 1;
  const sd = drawSize || 60;
  ctx.strokeRect(hero.x - sd / 2 + 0.5, hero.y - sd + 0.5, sd - 1, sd - 1);
  // Collision foot box — bright cyan.
  ctx.strokeStyle = 'rgba(80, 240, 255, 0.95)';
  ctx.lineWidth = 2;
  ctx.strokeRect(
    hero.x - halfW + 0.5, hero.y - halfH + 0.5,
    halfW * 2 - 1, halfH * 2 - 1,
  );
  // Center crosshair at hero.y (foot anchor).
  ctx.strokeStyle = 'rgba(255, 220, 100, 0.85)';
  ctx.beginPath();
  ctx.moveTo(hero.x - 4, hero.y);
  ctx.lineTo(hero.x + 4, hero.y);
  ctx.moveTo(hero.x, hero.y - 4);
  ctx.lineTo(hero.x, hero.y + 4);
  ctx.stroke();
  ctx.restore();
}

/** Top-of-screen status line with current tile + map name + flags.
 *  Called in screen-space after world-transform restore. */
export function drawWalkOverlayHud(ctx, room, hero, viewW) {
  if (!_visible) return;
  if (!room || !room.bakedImage) return;
  const cx = Math.floor(hero.x / TILE);
  const cy = Math.floor(hero.y / TILE);
  const blocked = _isBlockedAtCell(room, cx, cy);
  const overrideCount = _overrides.size;
  const auth = room.bakedGameplayAuthoritative ? 'AUTHORITATIVE' : 'HEURISTIC';
  const lines = [
    `MAP: ${_activeZone || '?'}    TILE: (${cx},${cy})    ${blocked ? 'BLOCKED' : 'walkable'}`,
    `COLLISION: ${auth}    OVERRIDES: ${overrideCount}`,
  ];
  ctx.save();
  ctx.fillStyle = 'rgba(8, 6, 14, 0.85)';
  ctx.fillRect(viewW - 320, 8, 312, 38);
  ctx.fillStyle = '#cdc4a0';
  ctx.font = 'bold 10px Georgia,serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(lines[0], viewW - 312, 12);
  ctx.fillText(lines[1], viewW - 312, 26);
  ctx.restore();
}

/** Number of overrides currently held. */
export function overrideCount() { return _overrides.size; }

/** Active zone name (or null). */
export function getOverlayZone() { return _activeZone; }

/**
 * Export overrides as a JSON string for saving to disk. The user copies
 * this into a sidecar file:  public/assets/rooms/<zone>_overrides.json
 * Next bake will pick it up if --apply-overrides is passed.
 */
export function exportOverrides() {
  const out = {
    version: 1,
    zone: _activeZone,
    overrides: Object.fromEntries(_overrides),
  };
  return JSON.stringify(out, null, 2);
}

/** Apply (load) a previously-exported overrides object. */
export function importOverrides(obj) {
  if (!obj || obj.version !== 1) return false;
  _overrides.clear();
  for (const [k, v] of Object.entries(obj.overrides || {})) {
    _overrides.set(k, v);
  }
  _activeZone = obj.zone || null;
  return true;
}

/** Clear all in-memory overrides (does not affect on-disk sidecar). */
export function clearOverrides() {
  _overrides.clear();
}

/**
 * Public collision predicate the runtime can use:
 *   isBlockedWithOverrides(room, cx, cy)
 * The actual collision system in room.js (isWallAtWorld) reads bakedCollision
 * directly; if we want overrides to bite at gameplay time too, room.js can
 * import this and consult before falling through to bakedCollision.
 */
export function isBlockedWithOverrides(room, cx, cy) {
  return _isBlockedAtCell(room, cx, cy);
}
