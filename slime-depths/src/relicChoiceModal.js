// ============================================================================
// RELIC CHOICE MODAL — Hades-style full-screen pedestal choice overlay
//
// Replaces the per-pedestal hover tooltip for the actual decision moment.
// When the player enters a sanctuary / reward / altar / shop room with
// uncollected pedestals, this modal fades in showing all 1-3 cards
// side-by-side with a themed header. The player picks with mouse click
// or arrow keys + E/Enter, rerolls with R, or backs out with Esc.
//
// Lifecycle:
//   requestModal()       — main.js calls when pedestals just spawned
//   updateModal(dt, …)   — advance fade + handle inputs
//   drawModal(ctx, w, h) — render the overlay
//   closeModal()         — fade out (player picked or pressed Esc)
//   isModalOpen()        — true while visible OR fading; gates world input
//   isFullyOpen()        — true only at full opacity (for capture)
//
// Why canvas (not DOM): keeps the overlay in the same layer as the rest
// of the game's render pipeline, including the pause-veil + cinematic
// gates. Matches the pickup banner / death overlay family.
// ============================================================================

import { pedestals, pickPedestalByIndex } from './pedestals.js';
import { gold } from './gold.js';
import { hero } from './hero.js';
import { images } from './loader.js';
import { drawRelicIcon } from './fx.js';
import { wrapText } from './textLayout.js';
import { RELIC_THEMES, THEMES } from './themes.js';

// ─── State ────────────────────────────────────────────────────────────────
let _open = false;
let _fadeT = 0;                  // 0..1 fade-in / 0..1 fade-out
const FADE_IN = 0.22;            // seconds
const FADE_OUT = 0.18;
let _fading = null;              // 'in' | 'out' | null
let _highlightIdx = 0;
let _wasFullyOpen = false;       // sticky once fully opened
let _hoverCardIdx = -1;          // mouse hover card

// Pending trigger — set when pedestals spawn; consumed when conditions
// are right (no other ceremony onscreen, post-floor-card delay).
let _pendingTrigger = false;
let _pendingDelay = 0;

// Last room-kind we showed for; reset when we close so re-entry can
// re-trigger after walking out + back in.
let _lastShownForRoomKind = null;

// ─── Public API ──────────────────────────────────────────────────────────

// Request the modal — call from pedestal-spawn sites. Actual open is
// deferred until conditions are met (no cinematic, no pause).
export function requestModal() {
  _pendingTrigger = true;
  _pendingDelay = 0.45;     // give the floor-card / room-intro a moment to clear
}

// Force-clear pending and any open state. Called on room change so the
// modal doesn't leak across rooms.
export function clearModal() {
  _open = false;
  _fading = null;
  _fadeT = 0;
  _pendingTrigger = false;
  _pendingDelay = 0;
  _highlightIdx = 0;
  _wasFullyOpen = false;
  _hoverCardIdx = -1;
  _lastShownForRoomKind = null;
}

export function closeModal() {
  if (!_open) return;
  _fading = 'out';
}

export function isModalOpen() {
  return _open || _fading === 'out';
}

export function isFullyOpen() {
  return _open && _fading == null;
}

// Dev-only — for debugging from the preview console / __dbg.
// Reflects current internal state so a console caller can see why
// the modal hasn't opened (pendingDelay still ticking? lastShownForKind
// blocking re-open?).
export function _debugState() {
  return {
    _open, _fading, _fadeT, _pendingTrigger, _pendingDelay,
    _highlightIdx, _lastShownForRoomKind,
    _seenIds: [..._seenPedestalIds],
  };
}

// ─── Open trigger ─────────────────────────────────────────────────────────

function _openIfReady(roomKind) {
  if (_open) return;
  if (!_pendingTrigger) return;
  if (_pendingDelay > 0) return;
  // Open whenever there are unpicked pedestals — the existence of
  // pedestals IS the trigger. Earlier draft restricted by room kind
  // (reward/sanctuary/altar/shop) but combat rooms that just cleared
  // keep kind='combat' even after pedestals spawn from the post-clear
  // reward path; the kind whitelist silently rejected those opens.
  // The only thing we don't want is opening for stale pedestal data
  // from a previous room — clearModal() on loadRoom handles that.
  const unpicked = pedestals.filter(p => !p.picked);
  if (unpicked.length === 0) return;
  // Don't re-fire if we already showed for this kind in this room session
  // unless the pedestals changed identity (reroll case).
  // Simple guard: clearModal on room change zeroes _lastShownForRoomKind.
  if (_lastShownForRoomKind === roomKind && _hasSeenAllPedestalIds(unpicked)) return;
  _lastShownForRoomKind = roomKind;
  _seenPedestalIds = new Set(unpicked.map(p => p.relic?.id || p.x + ',' + p.y));
  _open = true;
  _fading = 'in';
  _fadeT = 0;
  _highlightIdx = 0;
  _hoverCardIdx = -1;
  _wasFullyOpen = false;
  _pendingTrigger = false;
  _pendingDelay = 0;
}

let _seenPedestalIds = new Set();
function _hasSeenAllPedestalIds(unpicked) {
  for (const p of unpicked) {
    const id = p.relic?.id || p.x + ',' + p.y;
    if (!_seenPedestalIds.has(id)) return false;
  }
  return true;
}

// ─── Theme inference ─────────────────────────────────────────────────────
// If all unpicked pedestals share a theme, return its name + tint.
// Mixed offers return null.

function _inferTheme(unpicked) {
  const themes = unpicked
    .map(p => RELIC_THEMES[p.relic?.id])
    .filter(Boolean);
  if (themes.length === 0) return null;
  if (themes.length !== unpicked.length) return null;     // some untagged
  const first = themes[0];
  if (!themes.every(t => t === first)) return null;
  return { name: first, ...THEMES[first] };
}

// ─── Update / input ───────────────────────────────────────────────────────

export function updateModal(dt, ctx) {
  // Tick deferred trigger
  if (_pendingDelay > 0) _pendingDelay -= dt;
  if (_pendingTrigger && !_open && ctx?.roomKind) {
    _openIfReady(ctx.roomKind);
  }
  // Advance fade
  if (_fading === 'in') {
    _fadeT += dt / FADE_IN;
    if (_fadeT >= 1) {
      _fadeT = 1;
      _fading = null;
      _wasFullyOpen = true;
    }
  } else if (_fading === 'out') {
    _fadeT -= dt / FADE_OUT;
    if (_fadeT <= 0) {
      _fadeT = 0;
      _open = false;
      _fading = null;
    }
  }
  // Sync highlight clamp — if a pedestal got picked / removed, clamp
  // the highlight to the remaining unpicked count.
  const unpicked = pedestals.filter(p => !p.picked);
  if (unpicked.length === 0) {
    if (_open) closeModal();
  } else if (_highlightIdx >= unpicked.length) {
    _highlightIdx = unpicked.length - 1;
  }
}

// Keyboard nav. Returns true if the input was handled (so caller can
// suppress fall-through to world input). Called from main.js's keydown
// handler.
export function handleModalKey(code) {
  if (!isFullyOpen()) return false;
  const unpicked = pedestals.filter(p => !p.picked);
  if (unpicked.length === 0) return false;
  if (code === 'ArrowLeft' || code === 'KeyA') {
    _highlightIdx = (_highlightIdx - 1 + unpicked.length) % unpicked.length;
    return true;
  }
  if (code === 'ArrowRight' || code === 'KeyD') {
    _highlightIdx = (_highlightIdx + 1) % unpicked.length;
    return true;
  }
  if (code === 'KeyE' || code === 'Enter' || code === 'Space') {
    _commitPick();
    return true;
  }
  if (code === 'Escape') {
    closeModal();
    return true;
  }
  // R reroll falls through to the existing main.js handler.
  return false;
}

// Mouse hover + click — call from main.js mousemove + click events with
// canvas-space coords. handleModalClick returns true if the click hit
// a card (= input handled, suppress world).
export function handleModalMouseMove(mx, my, w, h) {
  if (!isFullyOpen()) return;
  _hoverCardIdx = _hitTestCard(mx, my, w, h);
}

export function handleModalClick(mx, my, w, h) {
  if (!isFullyOpen()) return false;
  const idx = _hitTestCard(mx, my, w, h);
  if (idx < 0) return false;
  _highlightIdx = idx;
  _commitPick();
  return true;
}

// ─── Pick ─────────────────────────────────────────────────────────────────

function _commitPick() {
  const unpicked = pedestals.filter(p => !p.picked);
  if (_highlightIdx < 0 || _highlightIdx >= unpicked.length) return;
  const target = unpicked[_highlightIdx];
  const fullIdx = pedestals.indexOf(target);
  if (fullIdx < 0) return;
  const result = pickPedestalByIndex(fullIdx);
  // 'denied_hp' / 'denied_gold' — keep modal open, the existing label
  // feedback in pedestals.js / main.js will tell the player why.
  if (result === 'denied_hp' || result === 'denied_gold') return;
  if (!result) return;
  // Successful pick. Shop pedestals stay open (multi-buy); others close.
  if (target.shop) {
    // Fall through — modal stays open, the picked pedestal vanishes
    // from `unpicked`, highlight clamps.
    return;
  }
  closeModal();
}

// ─── Hit-test + layout helpers ────────────────────────────────────────────

const MODAL_W = 720;
const MODAL_PAD_X = 28;
const MODAL_PAD_Y = 24;
const HEAD_H = 70;
const FOOT_H = 36;
const CARD_GAP = 12;

function _layout(w, h) {
  const unpicked = pedestals.filter(p => !p.picked);
  const n = Math.max(1, unpicked.length);
  const modalW = Math.min(MODAL_W, w - 32);
  const cardsAreaW = modalW - MODAL_PAD_X * 2;
  const cardW = (cardsAreaW - CARD_GAP * (n - 1)) / n;
  const cardH = 240;
  const modalH = MODAL_PAD_Y + HEAD_H + cardH + 14 + FOOT_H + MODAL_PAD_Y;
  const mx = Math.round((w - modalW) / 2);
  const my = Math.round((h - modalH) / 2);
  return { modalW, modalH, mx, my, cardW, cardH, n };
}

function _hitTestCard(mx, my, w, h) {
  const lay = _layout(w, h);
  if (mx < lay.mx || mx > lay.mx + lay.modalW) return -1;
  const cardsTop = lay.my + MODAL_PAD_Y + HEAD_H;
  if (my < cardsTop || my > cardsTop + lay.cardH) return -1;
  const localX = mx - (lay.mx + MODAL_PAD_X);
  const cardSlotW = lay.cardW + CARD_GAP;
  const idx = Math.floor(localX / cardSlotW);
  // Reject the gap region between cards
  const xInCard = localX - idx * cardSlotW;
  if (xInCard > lay.cardW) return -1;
  if (idx < 0 || idx >= lay.n) return -1;
  return idx;
}

// ─── Render ───────────────────────────────────────────────────────────────

export function drawModal(ctx, w, h, opts = {}) {
  if (!_open && _fading !== 'out') return;
  const unpicked = pedestals.filter(p => !p.picked);
  if (unpicked.length === 0 && !_fading) return;
  const alpha = Math.max(0, Math.min(1, _fadeT));
  const lay = _layout(w, h);
  ctx.save();

  // Veil — dims the world. Eye-radial brighter at center so cards
  // breathe; corners darker.
  const veil = ctx.createRadialGradient(w / 2, h / 2, 80, w / 2, h / 2, Math.max(w, h) * 0.7);
  veil.addColorStop(0, `rgba(8, 6, 10, ${(0.45 * alpha).toFixed(3)})`);
  veil.addColorStop(1, `rgba(4, 4, 8, ${(0.85 * alpha).toFixed(3)})`);
  ctx.fillStyle = veil;
  ctx.fillRect(0, 0, w, h);

  // Modal panel
  ctx.globalAlpha = alpha;
  // Slide-in: drop 8 px during fade-in
  const slideY = (1 - alpha) * 8;
  const mx = lay.mx;
  const my = lay.my - slideY;

  // Outer halo
  const halo = ctx.createRadialGradient(mx + lay.modalW / 2, my + lay.modalH / 2,
                                         lay.modalW * 0.15,
                                         mx + lay.modalW / 2, my + lay.modalH / 2,
                                         lay.modalW * 0.7);
  halo.addColorStop(0, 'rgba(201, 168, 106, 0.18)');
  halo.addColorStop(1, 'rgba(201, 168, 106, 0)');
  ctx.fillStyle = halo;
  ctx.fillRect(mx - 40, my - 28, lay.modalW + 80, lay.modalH + 56);

  // Body — vertical gradient
  const bg = ctx.createLinearGradient(0, my, 0, my + lay.modalH);
  bg.addColorStop(0, 'rgba(28, 18, 28, 0.96)');
  bg.addColorStop(1, 'rgba(10, 6, 14, 0.97)');
  ctx.fillStyle = bg;
  ctx.fillRect(mx, my, lay.modalW, lay.modalH);

  // Outer gold border
  ctx.strokeStyle = '#c9a86a';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(mx + 0.5, my + 0.5, lay.modalW - 1, lay.modalH - 1);
  // Inner hairline
  ctx.strokeStyle = 'rgba(201, 168, 106, 0.30)';
  ctx.lineWidth = 1;
  ctx.strokeRect(mx + 5.5, my + 5.5, lay.modalW - 11, lay.modalH - 11);

  // Corner brackets — same grammar as other tome UI
  ctx.strokeStyle = '#c9a86a';
  ctx.lineWidth = 1.5;
  const cb = 14;
  // top-left
  ctx.beginPath();
  ctx.moveTo(mx + 5, my + 5 + cb); ctx.lineTo(mx + 5, my + 5); ctx.lineTo(mx + 5 + cb, my + 5);
  ctx.stroke();
  // top-right
  ctx.beginPath();
  ctx.moveTo(mx + lay.modalW - 5 - cb, my + 5); ctx.lineTo(mx + lay.modalW - 5, my + 5); ctx.lineTo(mx + lay.modalW - 5, my + 5 + cb);
  ctx.stroke();
  // bottom-left
  ctx.beginPath();
  ctx.moveTo(mx + 5, my + lay.modalH - 5 - cb); ctx.lineTo(mx + 5, my + lay.modalH - 5); ctx.lineTo(mx + 5 + cb, my + lay.modalH - 5);
  ctx.stroke();
  // bottom-right
  ctx.beginPath();
  ctx.moveTo(mx + lay.modalW - 5 - cb, my + lay.modalH - 5); ctx.lineTo(mx + lay.modalW - 5, my + lay.modalH - 5); ctx.lineTo(mx + lay.modalW - 5, my + lay.modalH - 5 - cb);
  ctx.stroke();

  // ── HEADER ─────────────────────────────────────────────────────────
  const headerY = my + MODAL_PAD_Y;
  const cx = mx + lay.modalW / 2;
  // Eyebrow label
  ctx.fillStyle = '#c9a86a';
  ctx.font = 'italic bold 10px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('— THE RUIN OFFERS —', cx, headerY);

  // Big title + theme pill
  const roomKind = opts.roomKind || 'reward';
  const titleText = _titleForKind(roomKind);
  const theme = _inferTheme(unpicked);
  ctx.fillStyle = '#f4d9a0';
  ctx.font = 'bold 22px Georgia, serif';
  const titleW = ctx.measureText(titleText).width;
  let titleX = cx;
  if (theme) {
    // Reserve room for theme pill on the right
    const pillTxt = theme.name.toUpperCase();
    ctx.font = 'italic bold 11px Georgia, serif';
    const pillW = ctx.measureText(pillTxt).width + 18;
    titleX = cx - pillW / 2 - 4;
  }
  ctx.font = 'bold 22px Georgia, serif';
  ctx.fillText(titleText, titleX, headerY + 18);
  if (theme) {
    // Theme pill — small, tinted to theme color
    ctx.font = 'italic bold 11px Georgia, serif';
    const pillTxt = theme.name.toUpperCase();
    const pillW = ctx.measureText(pillTxt).width + 18;
    const pillH = 18;
    const pillX = titleX + titleW / 2 + 8;
    const pillY = headerY + 22;
    const tintRgb = _hexToRgb(theme.color || '#c9a86a');
    ctx.fillStyle = `rgba(${tintRgb}, 0.20)`;
    ctx.fillRect(pillX, pillY, pillW, pillH);
    ctx.strokeStyle = `rgba(${tintRgb}, 0.7)`;
    ctx.lineWidth = 1;
    ctx.strokeRect(pillX + 0.5, pillY + 0.5, pillW - 1, pillH - 1);
    ctx.fillStyle = theme.color || '#c9a86a';
    ctx.fillText(pillTxt, pillX + pillW / 2, pillY + 4);
  }

  // Subtitle
  ctx.fillStyle = 'rgba(184, 168, 144, 0.85)';
  ctx.font = 'italic 11px Georgia, serif';
  ctx.fillText(_subtitleForKind(roomKind), cx, headerY + 50);

  // ── CARDS ──────────────────────────────────────────────────────────
  const cardsTop = my + MODAL_PAD_Y + HEAD_H;
  for (let i = 0; i < lay.n; i++) {
    const p = unpicked[i];
    if (!p) continue;
    const cx2 = mx + MODAL_PAD_X + i * (lay.cardW + CARD_GAP);
    const cy = cardsTop;
    const isHi = (i === _highlightIdx) || (i === _hoverCardIdx);
    _drawCard(ctx, cx2, cy, lay.cardW, lay.cardH, p, isHi);
  }

  // ── FOOTER ─────────────────────────────────────────────────────────
  // Two-row layout. Top row: pick controls (left) + Esc back-out (right).
  // Bottom row: reroll affordance, only when reroll is meaningful.
  // Replaces the old single-row "click · ← → E take · R reroll · 45g · Esc"
  // ribbon that read as one cramped line.
  const footTopY = my + lay.modalH - MODAL_PAD_Y - FOOT_H + 4;
  const footBotY = footTopY + 16;
  // Hairline above footer
  ctx.strokeStyle = 'rgba(201, 168, 106, 0.18)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(mx + MODAL_PAD_X, footTopY - 6);
  ctx.lineTo(mx + lay.modalW - MODAL_PAD_X, footTopY - 6);
  ctx.stroke();
  ctx.font = 'italic 11px Georgia, serif';
  ctx.textBaseline = 'top';
  // Top row LEFT: pick controls
  ctx.fillStyle = 'rgba(201, 168, 106, 0.7)';
  ctx.textAlign = 'left';
  ctx.fillText('click  or  ← →  + E  to take', mx + MODAL_PAD_X, footTopY);
  // Top row RIGHT: Esc
  ctx.textAlign = 'right';
  ctx.fillText('Esc  back out', mx + lay.modalW - MODAL_PAD_X, footTopY);
  // Bottom row CENTER: reroll affordance
  const rerollCost = opts.rerollCost || 45;
  const canReroll = (gold.total >= rerollCost) && lay.n >= 2 && !_anyAltarOnly(unpicked);
  if (lay.n >= 2 && !_anyAltarOnly(unpicked)) {
    ctx.fillStyle = canReroll ? '#ffd68a' : 'rgba(180, 140, 100, 0.45)';
    ctx.font = 'italic bold 11px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText(`↻  R  reroll · ${rerollCost}g`, mx + lay.modalW / 2, footBotY);
  }

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.restore();
}

function _drawCard(ctx, x, y, w, h, p, highlighted) {
  const r = p.relic;
  const isAltar = (p.hpCost || 0) > 0;
  const isShop = !!p.shop;
  const tier = (p.tier || 'common');
  const tint = r?.tint || (tier === 'mythic' ? '#fff2e0'
                          : tier === 'legendary' ? '#c8a0ff'
                          : tier === 'rare' ? '#f4d9a0'
                          : '#b8c8d8');
  const tintRgb = _hexToRgb(tint);
  const tierLabel = tier.toUpperCase();
  const tierGlyph = tier === 'mythic' ? '✦' : tier === 'legendary' ? '★' : tier === 'rare' ? '◆' : '◇';
  const themeId = RELIC_THEMES[r?.id];
  const theme = themeId ? THEMES[themeId] : null;

  // Stronger highlight scale — selected card lifts slightly so the eye
  // tracks the choice (Hades-style). Wrapped in save/translate so all
  // card content scales with it.
  const scale = highlighted ? 1.04 : 1;
  ctx.save();
  if (scale !== 1) {
    ctx.translate(x + w / 2, y + h / 2);
    ctx.scale(scale, scale);
    ctx.translate(-(x + w / 2), -(y + h / 2));
  }

  // Card body
  const bg = ctx.createLinearGradient(0, y, 0, y + h);
  bg.addColorStop(0, 'rgba(22, 14, 24, 0.92)');
  bg.addColorStop(1, 'rgba(10, 6, 14, 0.96)');
  ctx.fillStyle = bg;
  ctx.fillRect(x, y, w, h);

  // Outer glow when highlighted — fuller alpha so the selection
  // reads at a glance.
  if (highlighted) {
    const glow = ctx.createRadialGradient(x + w / 2, y + h / 2, w * 0.18,
                                           x + w / 2, y + h / 2, w * 0.75);
    glow.addColorStop(0, `rgba(${tintRgb}, 0.35)`);
    glow.addColorStop(1, `rgba(${tintRgb}, 0)`);
    ctx.fillStyle = glow;
    ctx.fillRect(x - 24, y - 24, w + 48, h + 48);
  }

  // Tier ribbon — 6-px colored band across the top edge. Reads as
  // "this card is COMMON" instantly without needing to parse text.
  ctx.fillStyle = tint;
  ctx.fillRect(x, y, w, 6);

  // Tier-tint border (the rest of the frame)
  ctx.strokeStyle = tint;
  ctx.lineWidth = highlighted ? 2 : 1.4;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

  // Tier label — small italic caps just below the ribbon
  ctx.fillStyle = tint;
  ctx.font = 'italic bold 10px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(`${tierGlyph}  ${tierLabel}`, x + w / 2, y + 12);

  // Icon — circular framed art, top-aligned in the icon zone
  const iconY = y + 30;
  const iconSize = 70;
  const iconX = x + (w - iconSize) / 2;
  const iconCx = iconX + iconSize / 2;
  const iconCy = iconY + iconSize / 2;
  const iconR = iconSize / 2;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.beginPath();
  ctx.arc(iconCx, iconCy, iconR, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = tint;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(iconCx, iconCy, iconR - 0.5, 0, Math.PI * 2);
  ctx.stroke();
  const iconImg = images[r?.icon];
  if (iconImg) {
    drawRelicIcon(ctx, iconImg, null, null, r.id, iconX + 4, iconY + 4, iconSize - 8);
  }

  // Theme glyph chip — bottom-right of the icon ring. Tiny themed
  // symbol on a dark chip with theme-color border, matches the
  // affix-glyph pattern from the HP-bar render. Marks "this relic
  // belongs to BLOOD / STORM / etc." at-a-glance. Skipped when the
  // relic has no theme tag.
  if (theme) {
    const cs = 18;
    const cx2 = iconCx + iconR - 4;
    const cy2 = iconCy + iconR - 4;
    _drawThemeChip(ctx, cx2 - cs / 2, cy2 - cs / 2, cs, theme);
  }

  // ── FIXED-HEIGHT TEXT SECTIONS ─────────────────────────────────────
  // Section heights are fixed regardless of content variation so cards
  // are visually uniform. Truncate flavor / desc with " ..." if they
  // overflow the line cap.
  const NAME_Y = y + 110;
  const FLAVOR_Y = y + 132;
  const FLAVOR_LINES = 2;
  const DESC_Y = y + 162;
  const DESC_LINES = 3;
  const COST_Y = y + h - 16;
  const lineH = 14;
  const textColW = w - 20;

  // Name — bold tint-color, centered, single line (truncate if huge)
  ctx.fillStyle = tint;
  ctx.font = 'bold 15px Georgia, serif';
  ctx.fillText(_truncate(ctx, r?.name || 'RELIC', textColW), x + w / 2, NAME_Y);

  // Flavor — italic faded, fixed 2-line area with ellipsis truncate
  ctx.fillStyle = 'rgba(200, 190, 210, 0.72)';
  ctx.font = 'italic 10.5px Georgia, serif';
  const flavorAll = r?.flavor ? wrapText(ctx, r.flavor, textColW) : [];
  const flavorLines = _truncateLines(flavorAll, FLAVOR_LINES);
  for (let k = 0; k < flavorLines.length; k++) {
    ctx.fillText(flavorLines[k], x + w / 2, FLAVOR_Y + k * lineH);
  }

  // Desc — bold tint-color, fixed 3-line area
  ctx.fillStyle = tint;
  ctx.font = 'bold 11.5px Georgia, serif';
  const descAll = wrapText(ctx, r?.desc || '', textColW);
  const descLines = _truncateLines(descAll, DESC_LINES);
  for (let k = 0; k < descLines.length; k++) {
    ctx.fillText(descLines[k], x + w / 2, DESC_Y + k * lineH);
  }

  // Cost row at bottom — gold for shop, HP for altar.
  if (isShop || isAltar) {
    ctx.strokeStyle = 'rgba(201, 168, 106, 0.20)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 10, y + h - 28);
    ctx.lineTo(x + w - 10, y + h - 28);
    ctx.stroke();
    if (isShop) {
      const aff = gold.total >= (p.goldCost || 0);
      ctx.fillStyle = aff ? '#ffd68a' : '#d85a5a';
      ctx.font = 'bold 12px Georgia, serif';
      ctx.fillText(`🪙  ${p.goldCost}g`, x + w / 2, COST_Y);
    } else if (isAltar) {
      const aff = hero.hp > p.hpCost;
      ctx.fillStyle = aff ? '#ff7a8e' : '#d85a5a';
      ctx.font = 'bold 12px Georgia, serif';
      ctx.fillText(`— ${p.hpCost} HP —`, x + w / 2, COST_Y);
    }
  }

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.restore();
}

// Single-line ellipsis truncation. Used for the relic name when a
// future hyper-long-name relic ships.
function _truncate(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  const ell = ' …';
  let lo = 0, hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (ctx.measureText(text.slice(0, mid) + ell).width <= maxW) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, lo) + ell;
}

// Multi-line ellipsis truncation. If wrapped lines exceed `maxLines`,
// the last visible line gets " …" appended (replacing trailing whole
// words until it fits).
function _truncateLines(lines, maxLines) {
  if (lines.length <= maxLines) return lines;
  const visible = lines.slice(0, maxLines);
  visible[maxLines - 1] = visible[maxLines - 1].replace(/\s*\S+$/, '') + ' …';
  return visible;
}

// Theme chip — tiny dark pill with a theme-color border + procedural
// glyph centered. Same family as the affix-badge glyphs in enemies.js
// (canvas primitives, no painted assets needed). Glyph picks per
// theme:
//   storm   — lightning bolt (zigzag)
//   flame   — flame teardrop (point up)
//   blood   — drop (point down, blood red)
//   vow     — pentagonal shield
//   shadow  — crescent
function _drawThemeChip(ctx, bx, by, bs, theme) {
  ctx.save();
  // Dark backdrop
  ctx.fillStyle = 'rgba(12, 8, 14, 0.85)';
  ctx.fillRect(bx, by, bs, bs);
  // Theme-color border
  ctx.strokeStyle = theme.color;
  ctx.lineWidth = 1;
  ctx.strokeRect(bx + 0.5, by + 0.5, bs - 1, bs - 1);
  // Glyph
  const cx = bx + bs / 2;
  const cy = by + bs / 2;
  const r = (bs - 6) / 2;
  ctx.fillStyle = theme.color;
  ctx.strokeStyle = theme.color;
  ctx.lineWidth = 1.2;
  switch (theme.id) {
    case 'storm': {
      // Lightning bolt: zigzag from top to bottom
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
      // Flame teardrop pointing up
      ctx.beginPath();
      ctx.moveTo(cx, cy - r);
      ctx.bezierCurveTo(cx + r * 0.85, cy - r * 0.2, cx + r * 0.55, cy + r * 0.7, cx, cy + r * 0.85);
      ctx.bezierCurveTo(cx - r * 0.55, cy + r * 0.7, cx - r * 0.85, cy - r * 0.2, cx, cy - r);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'blood': {
      // Drop pointing down
      ctx.beginPath();
      ctx.moveTo(cx, cy + r);
      ctx.bezierCurveTo(cx + r * 0.85, cy + r * 0.2, cx + r * 0.55, cy - r * 0.7, cx, cy - r * 0.85);
      ctx.bezierCurveTo(cx - r * 0.55, cy - r * 0.7, cx - r * 0.85, cy + r * 0.2, cx, cy + r);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'vow': {
      // Pentagonal shield
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
      // Crescent — full circle minus an offset circle
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      // Cut-out — composite-globalDestination
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(cx + r * 0.45, cy - r * 0.15, r * 0.85, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      break;
    }
    default: {
      // Unknown — small dot fallback
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

// ─── Copy ─────────────────────────────────────────────────────────────────

function _titleForKind(kind) {
  switch (kind) {
    case 'altar':     return 'AN ALTAR';
    case 'shop':      return 'WANDERER\'S WARES';
    case 'sanctuary': return 'A SANCTUARY';
    case 'reward':
    default:          return 'A REWARD';
  }
}
function _subtitleForKind(kind) {
  switch (kind) {
    case 'altar':     return 'the cost is hp. the ruin remembers what you spend.';
    case 'shop':      return 'the wanderer trades in gold. take what you can carry.';
    case 'sanctuary': return 'choose one. the others fade with the light.';
    case 'reward':
    default:          return 'choose one. the others fade with the light.';
  }
}
function _anyAltarOnly(arr) {
  return arr.length > 0 && arr.every(p => (p.hpCost || 0) > 0);
}

// Tiny hex-to-"r,g,b" converter — same shape as notifications.js's helper.
function _hexToRgb(hex) {
  if (typeof hex !== 'string') return '201, 168, 106';
  const m = hex.replace('#', '').match(/^([0-9a-fA-F]{6})$/);
  if (!m) return '201, 168, 106';
  const n = parseInt(m[1], 16);
  return `${(n >> 16) & 0xff}, ${(n >> 8) & 0xff}, ${n & 0xff}`;
}
