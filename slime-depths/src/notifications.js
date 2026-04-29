// ============================================================================
// NOTIFICATIONS RAIL — unified top-right notification stack
//
// Replaces the fragmented top-center banner system (tips, pickup flashes,
// fusion forged, codex first-sighting) with a single FIFO rail anchored
// below the floor panel at top-right. Center remains reserved for
// freeze-the-game CINEMATICS only (floor card, boss intro, phase intro,
// keeper wake, heartbeat intro, first-ever-mythic pickup, death ceremony).
//
// Why:
//   - Two anchor zones for similar information was confusing.
//   - The center banner blocked gameplay (covered ~30% of the play area
//     during 3-5.5s pickup banners).
//   - Top-right is already the "safe to ignore" notification lane (floor
//     panel + achievement toasts already live there); unifying the rest
//     into the same lane makes the screen read consistently.
//
// API:
//   pushNotification({ kind, title, body, tint, tier, life, sfx })
//   updateNotifications(realDt)
//   drawNotifications(ctx, w, h)
//   clearNotifications()           — for run reset / hamlet entry
//
// Suppression rule: while `window.__centerBannerActive` is true (any
// full-screen cinematic), notifications still queue but do NOT advance
// their lifespan or render. They wait politely, then drain after the
// cinematic clears. This matches the discipline the watcher already uses.
//
// Stacking: up to MAX_VISIBLE entries on screen at once, newer pushes
// older entries DOWN. 5th+ entries wait in a backlog until a slot frees.
// ============================================================================

// (wrapText helper inlined at the bottom of this file — keeps the rail
// self-contained and avoids depending on pedestals.js / hud.js privates.)

// ─── Tunables ────────────────────────────────────────────────────────────────
const RAIL_X_MARGIN = 16;          // distance from right edge of canvas
const RAIL_Y_TOP = 120;            // first slot y (below floor panel which is y=14..104)
const RAIL_GAP = 10;               // vertical gap between stacked entries
const ENTRY_W = 360;               // standard entry width
const MAX_VISIBLE = 4;              // hard cap on live entries
const MAX_BACKLOG = 8;             // how many we'll buffer before dropping

// Per-kind defaults — kind name -> { life, tint, header }. Callers can
// override any field per-notification. `header` is the small italic-cap
// label above the title (e.g. "— A WORD OF GUIDANCE —").
const KIND_DEFAULTS = {
  tip:         { life: 5.5, tint: '#c9a86a', header: '— A WORD OF GUIDANCE —' },
  pickup:      { life: 3.0, tint: '#c9a86a', header: '— RELIC CLAIMED —' },
  fusion:      { life: 4.0, tint: '#ffb265', header: '— FUSION FORGED —' },
  codex:       { life: 3.0, tint: '#a0c8ff', header: '— NEW IN THE CODEX —' },
  theme:       { life: 4.0, tint: '#c9a86a', header: '— RESONANCE —' },
  watcher:     { life: 5.0, tint: '#9b6ec8', header: '— THE WATCHER SPEAKS —' },
  achievement: { life: 5.0, tint: '#f4d9a0', header: '— ACHIEVEMENT —' },
};

// Tier overrides for pickup notifications — life + tint scale with rarity.
const PICKUP_TIER = {
  common:    { life: 3.0, tint: '#c9a86a', glyph: '◇' },
  rare:      { life: 4.0, tint: '#f4d9a0', glyph: '◆' },
  legendary: { life: 4.5, tint: '#c8a0ff', glyph: '★' },
  mythic:    { life: 5.5, tint: '#fff2e0', glyph: '✦' },
};

// ─── State ───────────────────────────────────────────────────────────────────
const _active = [];     // visible queue, max MAX_VISIBLE
const _backlog = [];    // waiting queue

// Frame-stable counter; used to break id collisions on rapid bursts.
let _idSeq = 0;

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Push a notification onto the rail. Returns a numeric id, or 0 if dropped
 * (backlog full).
 *
 * Parameters (all optional except kind + title):
 *   kind       — one of KIND_DEFAULTS keys
 *   title      — primary line (bold, ~14px)
 *   body       — secondary line(s), wraps within ENTRY_W (italic, ~12px)
 *   tier       — for kind='pickup': 'common'|'rare'|'legendary'|'mythic'
 *   tint       — explicit border/accent color override
 *   life       — explicit life-seconds override
 *   header     — explicit header label override
 *   icon       — optional emoji/glyph rendered at left
 */
export function pushNotification(opts = {}) {
  const kind = opts.kind || 'tip';
  const defaults = KIND_DEFAULTS[kind] || KIND_DEFAULTS.tip;
  const tierOverride = (kind === 'pickup' && opts.tier) ? PICKUP_TIER[opts.tier] : null;
  const life = opts.life != null ? opts.life : (tierOverride ? tierOverride.life : defaults.life);
  const tint = opts.tint || (tierOverride ? tierOverride.tint : defaults.tint);
  const header = opts.header || defaults.header;
  const note = {
    id: ++_idSeq,
    kind,
    title: opts.title || '',
    body: opts.body || '',
    tier: opts.tier || null,
    tint,
    header,
    life,
    totalLife: life,
    age: 0,                  // seconds since enter (post-promotion)
    promoted: false,         // false while in backlog
    icon: opts.icon || (tierOverride ? tierOverride.glyph : null),
    // Slot index assigned at promote time; drives stack-y position.
    slot: -1,
  };
  // Promote immediately if there's room.
  if (_active.length < MAX_VISIBLE) {
    _promote(note);
  } else if (_backlog.length < MAX_BACKLOG) {
    _backlog.push(note);
  } else {
    // Queue full — drop the OLDEST backlog item, push the new one.
    _backlog.shift();
    _backlog.push(note);
  }
  return note.id;
}

export function updateNotifications(realDt) {
  // Defer entirely while a full-screen cinematic owns the screen.
  // Notifications queue but neither advance their lifespan nor render.
  if (typeof window !== 'undefined' && window.__centerBannerActive) return;
  // Tick lifespans.
  for (let i = _active.length - 1; i >= 0; i--) {
    const n = _active[i];
    n.age += realDt;
    if (n.age >= n.totalLife) {
      _active.splice(i, 1);
    }
  }
  // Re-pack slot indices so stacking stays stable after a middle entry drops.
  for (let i = 0; i < _active.length; i++) _active[i].slot = i;
  // Promote backlog entries into freed slots.
  while (_active.length < MAX_VISIBLE && _backlog.length > 0) {
    _promote(_backlog.shift());
  }
}

export function drawNotifications(ctx, w, h) {
  if (typeof window !== 'undefined' && window.__centerBannerActive) return;
  if (_active.length === 0) return;
  for (const n of _active) _drawOne(ctx, n, w, h);
}

export function clearNotifications() {
  _active.length = 0;
  _backlog.length = 0;
}

// Convenience helpers for callers that don't want to remember the kind set.
export function notifyTip(text) {
  return pushNotification({ kind: 'tip', body: text });
}
export function notifyPickup(def, tier) {
  return pushNotification({
    kind: 'pickup',
    title: def.name || 'RELIC',
    body: def.desc || '',
    tier,
  });
}
export function notifyFusion(name, desc) {
  return pushNotification({ kind: 'fusion', title: name, body: desc });
}
export function notifyCodex(label, body) {
  return pushNotification({ kind: 'codex', title: label, body });
}
export function notifyTheme(label, body) {
  return pushNotification({ kind: 'theme', title: label, body });
}

// Returns the absolute Y coordinate where the next thing stacked below
// the rail should anchor. Used by main.js's achievement-toast renderer
// so achievements dock BELOW any in-flight rail entries instead of
// overlapping them (both lanes anchor top-right at y=120 by default).
// Returns RAIL_Y_TOP when the rail is empty.
export function getNotificationStackBottom(ctx) {
  if (_active.length === 0) return RAIL_Y_TOP;
  const innerW = ENTRY_W - 32;
  let total = 0;
  for (const n of _active) total += _measureBoxH(ctx, n, innerW) + RAIL_GAP;
  return RAIL_Y_TOP + total;
}

// Debug — primarily for verification scripts. Not for gameplay code.
export function _debugCounts() {
  return { active: _active.length, backlog: _backlog.length };
}

// ─── Internals ───────────────────────────────────────────────────────────────

function _promote(note) {
  note.promoted = true;
  note.age = 0;
  note.slot = _active.length;
  _active.push(note);
}

// Single-entry render. Mirrors the existing achievement-toast style
// (tome gradient, gold border, corner diamonds, slide-in bounce) so the
// rail reads as one consistent system across kinds.
function _drawOne(ctx, n, w, h) {
  // Geometry
  const r = n.age / n.totalLife;
  // Fade in 0..0.10, hold, fade out 0.85..1.0
  let opacity;
  if (r < 0.10) opacity = r / 0.10;
  else if (r > 0.85) opacity = (1 - r) / 0.15;
  else opacity = 1;
  opacity = Math.max(0, Math.min(1, opacity));
  // Slide in from right with bounce on entry; slide out right on exit.
  const slideX = r < 0.12 ? (0.12 - r) * 480 : r > 0.88 ? (r - 0.88) * 380 : 0;
  const entryBump = r < 0.18 ? 1 + Math.sin((r / 0.18) * Math.PI) * 0.06 : 1;

  // Pre-measure body — wrap to fit. Two-line cap so the rail height
  // stays predictable; longer descs use the third line via "..." truncate.
  ctx.font = 'italic 12px Georgia, serif';
  const innerW = ENTRY_W - 32;     // padding 16 each side
  const bodyLines = n.body ? _wrapText(ctx, n.body, innerW) : [];
  const maxLines = 3;
  const visibleLines = bodyLines.slice(0, maxLines);
  if (bodyLines.length > maxLines) {
    visibleLines[maxLines - 1] = visibleLines[maxLines - 1].replace(/\s*\S+$/, ' …');
  }
  const bodyH = visibleLines.length * 14;
  // Compose box height: header(12) + title(18 if present) + body + padding
  const titleH = n.title ? 18 : 0;
  const headerH = 12;
  const padTop = 10;
  const padBot = 10;
  const innerGap = (n.title && bodyH) ? 4 : 0;
  const boxH = padTop + headerH + 2 + titleH + innerGap + bodyH + padBot;

  // Stacking — each slot anchors at RAIL_Y_TOP + sum-of-prior-heights.
  // We compute each entry's y as we go via a running offset. To keep
  // _drawOne stateless across calls, we recompute the offset by walking
  // _active up to this entry's slot.
  let yOffset = 0;
  for (let i = 0; i < n.slot; i++) {
    yOffset += _measureBoxH(ctx, _active[i], innerW) + RAIL_GAP;
  }
  const bx = w - ENTRY_W - RAIL_X_MARGIN + slideX;
  const by = RAIL_Y_TOP + yOffset;

  ctx.save();
  ctx.globalAlpha = opacity;
  const pivotX = bx + ENTRY_W / 2, pivotY = by + boxH / 2;
  ctx.translate(pivotX, pivotY);
  ctx.scale(entryBump, entryBump);
  ctx.translate(-pivotX, -pivotY);

  // Soft tinted halo on entry (first 0.4 of life)
  const haloA = (r < 0.4 ? (0.4 - r) / 0.4 : 0.12);
  if (haloA > 0.02) {
    const tintRgb = _hexToRgb(n.tint);
    const halo = ctx.createRadialGradient(pivotX, pivotY, 20, pivotX, pivotY, ENTRY_W * 0.6);
    halo.addColorStop(0, `rgba(${tintRgb}, ${(haloA * 0.45).toFixed(3)})`);
    halo.addColorStop(1, `rgba(${tintRgb}, 0)`);
    ctx.fillStyle = halo;
    ctx.fillRect(bx - 30, by - 16, ENTRY_W + 60, boxH + 32);
  }

  // Frame backdrop — tome gradient.
  const frameG = ctx.createLinearGradient(bx, by, bx, by + boxH);
  frameG.addColorStop(0, 'rgba(28, 18, 22, 0.95)');
  frameG.addColorStop(1, 'rgba(12, 8, 14, 0.96)');
  ctx.fillStyle = frameG;
  ctx.fillRect(bx, by, ENTRY_W, boxH);

  // Borders — tier-tinted outer, gold inset
  ctx.strokeStyle = n.tint;
  ctx.lineWidth = 1.4;
  ctx.strokeRect(bx + 0.5, by + 0.5, ENTRY_W - 1, boxH - 1);
  ctx.strokeStyle = 'rgba(201, 168, 106, 0.30)';
  ctx.lineWidth = 1;
  ctx.strokeRect(bx + 4.5, by + 4.5, ENTRY_W - 9, boxH - 9);

  // Corner diamonds
  ctx.fillStyle = n.tint;
  for (const [cx, cy] of [
    [bx + 5, by + 5], [bx + ENTRY_W - 5, by + 5],
    [bx + 5, by + boxH - 5], [bx + ENTRY_W - 5, by + boxH - 5],
  ]) {
    ctx.fillRect(cx - 1, cy, 2, 1);
    ctx.fillRect(cx, cy - 1, 1, 2);
  }

  // Header line (small italic caps)
  ctx.fillStyle = n.tint;
  ctx.font = 'italic bold 9.5px Georgia, serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  let cursorY = by + padTop;
  ctx.fillText(n.header, bx + 16, cursorY);
  cursorY += headerH + 2;

  // Optional left icon — small glyph in the header strip's right side
  if (n.icon) {
    ctx.fillStyle = n.tint;
    ctx.font = 'bold 14px Georgia, serif';
    ctx.textAlign = 'right';
    ctx.fillText(n.icon, bx + ENTRY_W - 16, by + padTop - 1);
    ctx.textAlign = 'left';
  }

  // Title (bold)
  if (n.title) {
    ctx.fillStyle = '#f4d9a0';
    ctx.font = 'bold 14px Georgia, serif';
    ctx.fillText(n.title, bx + 16, cursorY);
    cursorY += titleH + innerGap;
  }

  // Body (italic serif)
  if (visibleLines.length > 0) {
    ctx.fillStyle = n.kind === 'watcher' ? '#d8c6f0' : '#e8d3a6';
    ctx.font = 'italic 12px Georgia, serif';
    for (const line of visibleLines) {
      ctx.fillText(line, bx + 16, cursorY);
      cursorY += 14;
    }
  }

  ctx.restore();
}

// Measure a notification's pixel height — used by stacking math so each
// entry knows where to sit relative to the entries above it. Caller
// passes an already-set ctx.font is fine; we set + restore as needed.
function _measureBoxH(ctx, n, innerW) {
  const prevFont = ctx.font;
  ctx.font = 'italic 12px Georgia, serif';
  const lines = n.body ? _wrapText(ctx, n.body, innerW).slice(0, 3) : [];
  const bodyH = lines.length * 14;
  ctx.font = prevFont;
  const titleH = n.title ? 18 : 0;
  const headerH = 12;
  const innerGap = (n.title && bodyH) ? 4 : 0;
  return 10 + headerH + 2 + titleH + innerGap + bodyH + 10;
}

// Word-wrap to pixel width using the current ctx.font. Mirrors the
// pedestals.js / hud.js helpers but lives here so this module has no
// internal dependencies. Returns an array of lines.
function _wrapText(ctx, text, maxWidth) {
  const words = String(text).split(' ');
  const lines = [];
  let cur = '';
  for (const word of words) {
    const test = cur ? cur + ' ' + word : word;
    if (ctx.measureText(test).width <= maxWidth) {
      cur = test;
    } else {
      if (cur) lines.push(cur);
      cur = word;
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}

// Tiny hex-to-rgb-tuple — only for the tint halo. Returns "r, g, b"
// strings since that's the format every rgba() call site already uses.
function _hexToRgb(hex) {
  if (typeof hex !== 'string') return '201, 168, 106';
  const m = hex.replace('#', '').match(/^([0-9a-fA-F]{6})$/);
  if (!m) return '201, 168, 106';
  const n = parseInt(m[1], 16);
  return `${(n >> 16) & 0xff}, ${(n >> 8) & 0xff}, ${n & 0xff}`;
}
