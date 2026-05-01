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

import { pedestals, pickPedestalByIndex, applyChoicePick, rerollChoicePedestal } from './pedestals.js';
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

// Request the modal — used to be auto-fired at pedestal spawn but is
// now invoked from the E-press handler in main.js when the hero stands
// on a choice pedestal. The Hades pattern: walk up to the offering,
// commit explicitly. _pendingDelay still respected so the modal waits
// for any in-flight cinematic to clear, but at 0.05 s instead of 0.45
// because the player has already pressed a deliberate action key.
export function requestModal() {
  _pendingTrigger = true;
  _pendingDelay = 0.05;
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
    _cardCount: _getCards().length,
  };
}

// ─── Open trigger ─────────────────────────────────────────────────────────

function _openIfReady() {
  if (_open) return;
  if (!_pendingTrigger) return;
  if (_pendingDelay > 0) return;
  const cards = _getCards();
  if (cards.length === 0) return;
  _open = true;
  _fading = 'in';
  _fadeT = 0;
  _highlightIdx = 0;
  _hoverCardIdx = -1;
  _wasFullyOpen = false;
  _pendingTrigger = false;
  _pendingDelay = 0;
}

// Flatten pedestals[] into a list of selectable cards. Each card carries
// (relic, tier, costs, source pedestal idx, source offer idx) so the
// modal can render + dispatch picks without needing to know whether the
// source is a choice pedestal (1 ped → N cards) or a legacy shop ped
// (1 ped → 1 card). Skips picked pedestals.
function _getCards() {
  const cards = [];
  for (let i = 0; i < pedestals.length; i++) {
    const p = pedestals[i];
    if (p.picked) continue;
    if (p.kind === 'choice' && Array.isArray(p.offers)) {
      for (let j = 0; j < p.offers.length; j++) {
        cards.push({
          relic: p.offers[j],
          tier: p.offerTiers?.[j] || 'common',
          hpCost: p.altar ? (p.offerHpCosts?.[j] || 0) : 0,
          goldCost: 0,
          shop: false,
          isAltar: !!p.altar,
          pIdx: i,
          oIdx: j,
        });
      }
    } else {
      // Legacy single-relic pedestal (shop / boss bonus / etc.)
      cards.push({
        relic: p.relic,
        tier: p.tier || 'common',
        hpCost: p.hpCost || 0,
        goldCost: p.goldCost || 0,
        shop: !!p.shop,
        isAltar: (p.hpCost || 0) > 0 && !p.kind,
        pIdx: i,
        oIdx: 0,
      });
    }
  }
  return cards;
}

// ─── Theme inference ─────────────────────────────────────────────────────
// Returns the theme to display in the modal header. Prefers the room
// theme tag stamped on a choice pedestal (the floor-gen-assigned
// theme), falling back to a per-card scan when all offered relics
// share a theme. Mixed offers return null.

function _inferTheme(cards) {
  if (cards.length === 0) return null;
  // First look at the source pedestal's theme tag — if any choice
  // pedestal has a theme set, use it (single-source-of-truth).
  for (const c of cards) {
    const ped = pedestals[c.pIdx];
    if (ped && ped.theme && THEMES[ped.theme]) {
      return { name: ped.theme, ...THEMES[ped.theme] };
    }
  }
  // Fallback: if every card's relic shares the same theme, return
  // that. Catches mixed-floor combos that happen to align.
  const themes = cards.map(c => RELIC_THEMES[c.relic?.id]).filter(Boolean);
  if (themes.length === 0 || themes.length !== cards.length) return null;
  const first = themes[0];
  if (!themes.every(t => t === first)) return null;
  return { name: first, ...THEMES[first] };
}

// ─── Update / input ───────────────────────────────────────────────────────

export function updateModal(dt) {
  // Tick deferred trigger
  if (_pendingDelay > 0) _pendingDelay -= dt;
  if (_pendingTrigger && !_open) {
    _openIfReady();
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
  // Sync highlight clamp — if a card got picked / removed, clamp the
  // highlight to the remaining card count. Close the modal when no
  // cards remain (user picked the last offer).
  const cards = _getCards();
  if (cards.length === 0) {
    if (_open) closeModal();
  } else if (_highlightIdx >= cards.length) {
    _highlightIdx = cards.length - 1;
  }
}

// Keyboard nav. Returns true if the input was handled (so caller can
// suppress fall-through to world input). Called from main.js's keydown
// handler.
export function handleModalKey(code) {
  if (!isFullyOpen()) return false;
  const cards = _getCards();
  if (cards.length === 0) return false;
  if (code === 'ArrowLeft' || code === 'KeyA') {
    _highlightIdx = (_highlightIdx - 1 + cards.length) % cards.length;
    return true;
  }
  if (code === 'ArrowRight' || code === 'KeyD') {
    _highlightIdx = (_highlightIdx + 1) % cards.length;
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
  if (code === 'KeyR') {
    // Reroll the choice pedestal's offers in-place. Doesn't consume
    // the pedestal — the player's still committed to spending whatever
    // it costs to interact with the room. Existing main.js R-handler
    // also handles legacy shop reroll; this one specifically handles
    // choice pedestals (single-pedestal-with-offers shape).
    if (cards.length > 0) {
      const pIdx = cards[_highlightIdx]?.pIdx ?? 0;
      const ped = pedestals[pIdx];
      if (ped && ped.kind === 'choice' && !ped.altar) {
        const ok = rerollChoicePedestal(pIdx, opts => opts);
        // If reroll fails (insufficient gold, etc.) we let it fall
        // through to the legacy R-handler in main.js so the same key
        // can still trigger the existing reroll-cost feedback.
        if (ok) return true;
      }
    }
    return false;
  }
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
  const cards = _getCards();
  if (_highlightIdx < 0 || _highlightIdx >= cards.length) return;
  const card = cards[_highlightIdx];
  const ped = pedestals[card.pIdx];
  if (!ped || ped.picked) return;
  let result;
  if (ped.kind === 'choice') {
    // Choice pedestal — apply the specific offer. applyChoicePick
    // marks the pedestal picked (consuming it) + applies the relic +
    // debits HP if altar.
    result = applyChoicePick(card.pIdx, card.oIdx);
  } else {
    // Legacy shop pedestal — single-relic, individual purchase.
    result = pickPedestalByIndex(card.pIdx);
  }
  // 'denied_hp' / 'denied_gold' — keep modal open, the in-game label
  // feedback in pedestals.js / main.js explains why.
  if (result === 'denied_hp' || result === 'denied_gold') return;
  if (!result) return;
  // Shop pedestals stay open so the player can buy multiple items.
  if (card.shop) return;
  closeModal();
}

// ─── Hit-test + layout helpers ────────────────────────────────────────────

const MODAL_W = 720;
const MODAL_PAD_X = 28;
const MODAL_PAD_Y = 24;
const HEAD_H = 96;
const FOOT_H = 36;
const CARD_GAP = 12;

function _layout(w, h) {
  const cards = _getCards();
  const n = Math.max(1, cards.length);
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
  const cards = _getCards();
  if (cards.length === 0 && !_fading) return;
  const alpha = Math.max(0, Math.min(1, _fadeT));
  const lay = _layout(w, h);
  // Compute the modal-level theme up-front so it can drive the halo,
  // body wash, header copy, and card outer borders consistently.
  const theme = _inferTheme(cards);
  const themeRgb = theme ? _hexToRgb(theme.color) : '201, 168, 106';
  const haloRgb = theme ? themeRgb : '201, 168, 106';
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

  // Outer halo — picks up theme color so the whole frame reads
  // "FLAME / STORM / etc." rather than generic gold.
  const halo = ctx.createRadialGradient(mx + lay.modalW / 2, my + lay.modalH / 2,
                                         lay.modalW * 0.15,
                                         mx + lay.modalW / 2, my + lay.modalH / 2,
                                         lay.modalW * 0.7);
  halo.addColorStop(0, `rgba(${haloRgb}, 0.20)`);
  halo.addColorStop(1, `rgba(${haloRgb}, 0)`);
  ctx.fillStyle = halo;
  ctx.fillRect(mx - 40, my - 28, lay.modalW + 80, lay.modalH + 56);

  // Body — vertical gradient
  const bg = ctx.createLinearGradient(0, my, 0, my + lay.modalH);
  bg.addColorStop(0, 'rgba(28, 18, 28, 0.96)');
  bg.addColorStop(1, 'rgba(10, 6, 14, 0.97)');
  ctx.fillStyle = bg;
  ctx.fillRect(mx, my, lay.modalW, lay.modalH);

  // Theme wash — additive radial inside the modal body so the SET
  // reads as one unit. Subtle (~7% peak alpha) so card content stays
  // legible. Skipped for un-themed (mixed) modals where gold accent
  // would just be noise.
  if (theme) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const wash = ctx.createRadialGradient(
      mx + lay.modalW / 2, my + lay.modalH * 0.32, 40,
      mx + lay.modalW / 2, my + lay.modalH * 0.32, lay.modalW * 0.55,
    );
    wash.addColorStop(0, `rgba(${themeRgb}, 0.07)`);
    wash.addColorStop(1, `rgba(${themeRgb}, 0)`);
    ctx.fillStyle = wash;
    ctx.fillRect(mx, my, lay.modalW, lay.modalH);
    ctx.restore();
  }

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
  // Layout (theme-led): centered glyph (32 dia) → eyebrow → title →
  // theme-color underline → subtitle. The glyph is the same family as
  // the pedestal sigil so the player's eye tracks "same offering" from
  // pedestal to modal. For un-themed (mixed) modals the glyph slot is
  // a small generic ruin diamond and copy reverts to gold.
  const roomKind = opts.roomKind || 'reward';
  const headerY = my + MODAL_PAD_Y;
  const cx = mx + lay.modalW / 2;
  const eyebrowText = _eyebrowCopy(theme, roomKind);
  const titleText = _titleCopy(theme, roomKind);

  // Glyph row — large theme sigil with breath halo. Center top of header.
  const glyphCy = headerY + 18;
  const glyphR = 16;
  if (theme) {
    // Backdrop halo so the glyph reads on the modal body
    const t = (typeof performance !== 'undefined' ? performance.now() / 1000 : Date.now() / 1000);
    const breath = 0.7 + 0.3 * Math.sin(t * 1.4);
    const haloR = glyphR + 10;
    const g = ctx.createRadialGradient(cx, glyphCy, 2, cx, glyphCy, haloR);
    g.addColorStop(0, `rgba(${themeRgb}, ${(0.32 * breath).toFixed(3)})`);
    g.addColorStop(1, `rgba(${themeRgb}, 0)`);
    ctx.fillStyle = g;
    ctx.fillRect(cx - haloR, glyphCy - haloR, haloR * 2, haloR * 2);
    _drawHeaderGlyph(ctx, cx, glyphCy, glyphR, theme);
  } else {
    // Mixed pedestal — generic gold ruin diamond, no halo.
    ctx.save();
    ctx.fillStyle = '#c9a86a';
    ctx.beginPath();
    ctx.moveTo(cx, glyphCy - glyphR * 0.65);
    ctx.lineTo(cx + glyphR * 0.5, glyphCy);
    ctx.lineTo(cx, glyphCy + glyphR * 0.65);
    ctx.lineTo(cx - glyphR * 0.5, glyphCy);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(201, 168, 106, 0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, glyphCy, glyphR + 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Eyebrow — theme-color italic small caps just below glyph.
  ctx.fillStyle = theme ? theme.color : '#c9a86a';
  ctx.font = 'italic bold 10px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(eyebrowText, cx, headerY + 38);

  // Title — gold, big serif. Theme color is in the eyebrow + glyph;
  // keeping the title gold preserves contrast against any theme color.
  ctx.fillStyle = '#f4d9a0';
  ctx.font = 'bold 22px Georgia, serif';
  ctx.fillText(titleText, cx, headerY + 54);

  // Theme-color underline beneath the title — thin hairline that
  // unifies the title with the glyph + cards. Skipped for mixed modals.
  if (theme) {
    const titleW = ctx.measureText(titleText).width;
    const lineY = headerY + 80;
    const lineW = Math.min(titleW + 28, lay.modalW - MODAL_PAD_X * 2);
    const grad = ctx.createLinearGradient(cx - lineW / 2, lineY, cx + lineW / 2, lineY);
    grad.addColorStop(0, `rgba(${themeRgb}, 0)`);
    grad.addColorStop(0.5, `rgba(${themeRgb}, 0.85)`);
    grad.addColorStop(1, `rgba(${themeRgb}, 0)`);
    ctx.strokeStyle = grad;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - lineW / 2, lineY);
    ctx.lineTo(cx + lineW / 2, lineY);
    ctx.stroke();
  }

  // Subtitle — neutral italic faded. Position fixed to the bottom of
  // the header band so it sits just above the cards.
  ctx.fillStyle = 'rgba(184, 168, 144, 0.85)';
  ctx.font = 'italic 11px Georgia, serif';
  ctx.fillText(_subtitleForKind(roomKind), cx, headerY + 84);

  // ── CARDS ──────────────────────────────────────────────────────────
  const cardsTop = my + MODAL_PAD_Y + HEAD_H;
  for (let i = 0; i < lay.n; i++) {
    const card = cards[i];
    if (!card) continue;
    const cx2 = mx + MODAL_PAD_X + i * (lay.cardW + CARD_GAP);
    const cy = cardsTop;
    const isHi = (i === _highlightIdx) || (i === _hoverCardIdx);
    _drawCard(ctx, cx2, cy, lay.cardW, lay.cardH, card, isHi, theme);
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
  const canReroll = (gold.total >= rerollCost) && lay.n >= 2 && !_anyAltarOnlyCards(cards);
  if (lay.n >= 2 && !_anyAltarOnlyCards(cards)) {
    ctx.fillStyle = canReroll ? '#ffd68a' : 'rgba(180, 140, 100, 0.45)';
    ctx.font = 'italic bold 11px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText(`↻  R  reroll · ${rerollCost}g`, mx + lay.modalW / 2, footBotY);
  }

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.restore();
}

function _drawCard(ctx, x, y, w, h, p, highlighted, modalTheme) {
  const r = p.relic;
  const isAltar = (p.hpCost || 0) > 0;
  const isShop = !!p.shop;
  const tier = (p.tier || 'common');
  const tint = r?.tint || (tier === 'mythic' ? '#fff2e0'
                          : tier === 'legendary' ? '#c8a0ff'
                          : tier === 'rare' ? '#f4d9a0'
                          : '#b8c8d8');
  const tintRgb = _hexToRgb(tint);
  // Outer-border color: when the modal is themed, every card picks up
  // the modal-level theme color for its frame so the 3 cards read as
  // one set. Tier ribbon at top + tier label still carry the tier
  // signal — outer color is the SET signal. Mixed modals fall back
  // to per-card tier color.
  const outerCol = modalTheme ? modalTheme.color : tint;
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

  // Outer-border — theme color when modal is themed (unifies the 3
  // cards as a SET), tier color otherwise (mixed modals).
  ctx.strokeStyle = outerCol;
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

// Header glyph — same family as the chip glyph but rendered at the
// modal-header scale (no chip backdrop, slightly bolder strokes,
// drawn as a single bright color directly). Used in drawModal to
// stamp the theme identity at the top of the modal so the player's
// eye links the pedestal sigil → modal sigil → set of 3 cards.
function _drawHeaderGlyph(ctx, cx, cy, r, theme) {
  ctx.save();
  ctx.fillStyle = theme.color;
  ctx.strokeStyle = theme.color;
  ctx.lineWidth = 1.6;
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

// ─── Copy ─────────────────────────────────────────────────────────────────

// Theme-aware copy. Eyebrow names the offering's source (theme or
// generic ruin). Title names the gift kind, flavored by theme when
// the room is themed.
function _eyebrowCopy(theme, kind) {
  if (kind === 'shop') return '— THE WANDERER WAITS —';
  if (kind === 'sanctuary') return '— THE RUIN RESTS —';
  if (theme) return `— THE ${theme.name.toUpperCase()} OFFERS —`;
  if (kind === 'altar') return '— THE RUIN DEMANDS —';
  return '— THE RUIN OFFERS —';
}
function _titleCopy(theme, kind) {
  if (kind === 'shop') return "WANDERER'S WARES";
  if (kind === 'sanctuary') return 'A SANCTUARY';
  if (kind === 'altar') {
    if (!theme) return 'A BARGAIN';
    switch (theme.id) {
      case 'storm':  return 'A STORM PACT';
      case 'flame':  return 'A FLAME PACT';
      case 'blood':  return 'A BLOOD PACT';
      case 'vow':    return 'A VOW PACT';
      case 'shadow': return 'A SHADOW PACT';
      default:       return 'A PACT';
    }
  }
  // reward (default)
  if (!theme) return 'AN OFFERING';
  switch (theme.id) {
    case 'storm':  return 'A GIFT OF STORMS';
    case 'flame':  return 'A GIFT OF FLAMES';
    case 'blood':  return 'A GIFT OF BLOOD';
    case 'vow':    return 'A GIFT OF VOWS';
    case 'shadow': return 'A GIFT OF SHADOWS';
    default:       return 'AN OFFERING';
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
function _anyAltarOnlyCards(cards) {
  return cards.length > 0 && cards.every(c => (c.hpCost || 0) > 0);
}

// Tiny hex-to-"r,g,b" converter — same shape as notifications.js's helper.
function _hexToRgb(hex) {
  if (typeof hex !== 'string') return '201, 168, 106';
  const m = hex.replace('#', '').match(/^([0-9a-fA-F]{6})$/);
  if (!m) return '201, 168, 106';
  const n = parseInt(m[1], 16);
  return `${(n >> 16) & 0xff}, ${(n >> 8) & 0xff}, ${n & 0xff}`;
}
