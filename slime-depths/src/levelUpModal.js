// ============================================================================
// LEVEL-UP MODAL — pause-and-pick UI shown on each level-up.
//
// On level-up, the runner pauses gameplay (we track our own paused state
// here so we don't leak into the global pause), rolls 3 perk choices,
// and presents 3 cards in screen space. Click a card → apply perk →
// resume play. ESC / Space cancels by picking the first card (so the
// game never stalls waiting for input).
//
// State:
//   _open       — modal visible
//   _choices    — current 3 perk options
//   _hoverIdx   — which card the cursor is over (for visual feedback)
//
// The pause is consulted by main.js via isLevelUpModalOpen() — gameplay
// paused === true, but rendering and input continue so the cards animate.
// ============================================================================

import { rollPerkChoices, pickPerk } from './perks.js';

let _open = false;
let _choices = [];
let _hoverIdx = -1;
let _onClose = null;
let _level = 0;
let _openTime = 0;          // for spawn-in animation

const CARD_W = 180;
const CARD_H = 240;
const CARD_GAP = 18;

export function isLevelUpModalOpen() { return _open; }

/**
 * Open the modal for the given level. onClose fires after the player
 * picks a card. Pauses the world via main.js's pause check.
 */
export function openLevelUpModal(level, onClose) {
  _level = level;
  _choices = rollPerkChoices(level, 3);
  if (_choices.length === 0) {
    // No eligible perks — close immediately.
    if (onClose) onClose();
    return;
  }
  _open = true;
  _hoverIdx = -1;
  _onClose = onClose || null;
  _openTime = performance.now() / 1000;
  // Phase 7 polish (audit F7) — audio sting on open. Without this the
  // level-up modal popped silently; the player's biggest reward beat
  // had less impact than a sanctuary pickup. Two rising notes —
  // C5 (523 Hz) into G5 (783 Hz), each ~0.6s — a tonic-fifth chime
  // that reads as "you grew stronger" rather than menu interrupt.
  try {
    import('./synth.js').then((m) => {
      if (m.synthChord) {
        m.synthChord(523, 0.65, 0.45);
        setTimeout(() => m.synthChord && m.synthChord(783, 0.85, 0.5), 220);
      }
    });
  } catch (_e) { /* audio optional */ }
}

function _closeWithPick(idx) {
  if (!_open) return;
  const choice = _choices[Math.max(0, Math.min(_choices.length - 1, idx))];
  if (choice) pickPerk(choice);
  _open = false;
  _choices = [];
  _hoverIdx = -1;
  const cb = _onClose;
  _onClose = null;
  if (cb) try { cb(choice); } catch (e) { console.warn('levelUp onClose threw', e); }
}

/** Update mouse hover state. Called from main render or input loop. */
export function updateLevelUpModalMouse(mx, my, viewW, viewH) {
  if (!_open) return;
  const totalW = _choices.length * CARD_W + (_choices.length - 1) * CARD_GAP;
  const startX = (viewW - totalW) / 2;
  const cardY = (viewH - CARD_H) / 2 + 30;     // pushed slightly down to leave room for header
  let hover = -1;
  for (let i = 0; i < _choices.length; i++) {
    const cx = startX + i * (CARD_W + CARD_GAP);
    if (mx >= cx && mx <= cx + CARD_W && my >= cardY && my <= cardY + CARD_H) {
      hover = i;
      break;
    }
  }
  _hoverIdx = hover;
}

/** Click event on the canvas — picks the hovered card (if any). */
export function handleLevelUpModalClick(mx, my, viewW, viewH) {
  if (!_open) return false;
  updateLevelUpModalMouse(mx, my, viewW, viewH);
  if (_hoverIdx >= 0) {
    _closeWithPick(_hoverIdx);
    return true;
  }
  return false;
}

/** Keyboard: 1/2/3 picks the matching card; Esc picks the first. */
export function handleLevelUpModalKey(code) {
  if (!_open) return false;
  if (code === 'Digit1' || code === 'Numpad1') { _closeWithPick(0); return true; }
  if (code === 'Digit2' || code === 'Numpad2') { _closeWithPick(1); return true; }
  if (code === 'Digit3' || code === 'Numpad3') { _closeWithPick(2); return true; }
  if (code === 'Escape')                       { _closeWithPick(0); return true; }
  return false;
}

export function drawLevelUpModal(ctx, viewW, viewH) {
  if (!_open) return;
  const t = (performance.now() / 1000) - _openTime;
  const easeIn = Math.min(1, t / 0.32);

  // Backdrop dim
  ctx.save();
  ctx.fillStyle = `rgba(8, 6, 14, ${0.65 * easeIn})`;
  ctx.fillRect(0, 0, viewW, viewH);
  ctx.restore();

  // Header
  ctx.save();
  ctx.fillStyle = `rgba(255, 230, 170, ${easeIn})`;
  ctx.font = 'bold 22px Georgia,serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const headerY = (viewH - CARD_H) / 2 + 30 - 80;
  ctx.fillText(`LEVEL ${_level}`, viewW / 2, headerY);
  ctx.font = '12px Georgia,serif';
  ctx.fillStyle = `rgba(200, 180, 140, ${easeIn * 0.85})`;
  ctx.fillText('CHOOSE YOUR REWARD', viewW / 2, headerY + 26);
  ctx.restore();

  // Cards
  const totalW = _choices.length * CARD_W + (_choices.length - 1) * CARD_GAP;
  const startX = (viewW - totalW) / 2;
  const cardY = (viewH - CARD_H) / 2 + 30;

  for (let i = 0; i < _choices.length; i++) {
    const p = _choices[i];
    const cx = startX + i * (CARD_W + CARD_GAP);
    const isHover = _hoverIdx === i;
    // Phase 7 polish (audit F7) — per-card stagger. Each card starts
    // animating in 0.10s after the previous one. Ease 0.32s. Card 1
    // begins at t=0, card 2 at t=0.10, card 3 at t=0.20. Adds a
    // satisfying left-to-right cascade vs. all 3 cards popping
    // together. Also adds a small Y rise (16px lift during easeIn)
    // for life — cards "rise into place" not just fade in.
    const cardEaseIn = Math.min(1, Math.max(0, (t - i * 0.10) / 0.32));
    const riseY = (1 - cardEaseIn) * 16;
    const liftY = (isHover ? -6 : 0) + riseY;
    const cardBoxY = cardY + liftY;

    ctx.save();
    // Phase 7 — use the per-card stagger (cardEaseIn) for opacity, not
    // the global easeIn — so each card fades in independently for the
    // cascade effect.
    ctx.globalAlpha = cardEaseIn;

    // Card background
    const bg = ctx.createLinearGradient(0, cardBoxY, 0, cardBoxY + CARD_H);
    bg.addColorStop(0, 'rgba(28, 22, 40, 0.96)');
    bg.addColorStop(1, 'rgba(14, 10, 22, 0.96)');
    ctx.fillStyle = bg;
    ctx.fillRect(cx, cardBoxY, CARD_W, CARD_H);

    // Tier accent bar (top edge)
    ctx.fillStyle = p.color || '#f4d9a0';
    ctx.fillRect(cx, cardBoxY, CARD_W, 3);

    // Border (highlighted on hover)
    ctx.lineWidth = isHover ? 2 : 1;
    ctx.strokeStyle = isHover ? p.color : 'rgba(255, 220, 160, 0.35)';
    ctx.strokeRect(cx + 0.5, cardBoxY + 0.5, CARD_W - 1, CARD_H - 1);

    // Glyph circle
    const iconCX = cx + CARD_W / 2;
    const iconCY = cardBoxY + 70;
    ctx.fillStyle = (p.color || '#f4d9a0') + '33';
    ctx.beginPath();
    ctx.arc(iconCX, iconCY, 32, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = p.color || '#f4d9a0';
    ctx.font = 'bold 36px Georgia,serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(p.icon || '·', iconCX, iconCY + 2);

    // Tier label
    ctx.fillStyle = (p.color || '#f4d9a0') + 'cc';
    ctx.font = 'bold 9px Georgia,serif';
    ctx.fillText((p.tier || 'common').toUpperCase(), iconCX, cardBoxY + 124);

    // Name
    ctx.fillStyle = '#f4e8c8';
    ctx.font = 'bold 16px Georgia,serif';
    ctx.fillText(p.name, iconCX, cardBoxY + 152);

    // Description (wrapped if needed)
    ctx.fillStyle = '#cdc4a0';
    ctx.font = '12px Georgia,serif';
    _drawWrappedText(ctx, p.desc, iconCX, cardBoxY + 178, CARD_W - 24, 16);

    // Number key hint
    ctx.fillStyle = 'rgba(200, 180, 140, 0.55)';
    ctx.font = 'bold 10px Georgia,serif';
    ctx.fillText(`[${i + 1}]`, iconCX, cardBoxY + CARD_H - 16);

    ctx.restore();
  }
}

function _drawWrappedText(ctx, text, cx, cy, maxW, lineH) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const trial = cur ? cur + ' ' + w : w;
    if (ctx.measureText(trial).width > maxW && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = trial;
    }
  }
  if (cur) lines.push(cur);
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], cx, cy + i * lineH);
  }
}
