// HUD — health hearts, room progress, relic icons
import { hero } from './hero.js';
import { enemies } from './enemies.js';
import { images } from './loader.js';
import { mouse } from './input.js';
import { activeFusions } from './fusions.js';
import { drawnCards, isTarotRun } from './tarot.js';
import { gold } from './gold.js';
import { drawRelicIcon } from './fx.js';
import { THEMES, getThemeCounts, getThemeTier, getThemeThresholds } from './themes.js';
import { SLOTS, getSlotCounts, getSlotTier, SLOT_THRESHOLDS } from './slots.js';
import { wrapText } from './textLayout.js';
import { isPedestalTooltipActive } from './pedestals.js';
import { isMobileMode } from './mobileMode.js';

function toRoman(n) {
  return n === 1 ? 'I' : n === 2 ? 'II' : n === 3 ? 'III' : n === 4 ? 'IV' : n === 5 ? 'V' : String(n);
}

// ─── HUD chip glyphs + pip rows ─────────────────────────────────────────
// Tiny iconography for the SLOTS / THEMES progress chips. Same family as
// the procedural glyphs in relicChoiceModal.js (modal header) and
// pedestals.js (pedestal sigil) — keeps the visual language consistent
// from pedestal → modal → HUD chip.

function _drawHudGlyph(ctx, cx, cy, r, kindId, color) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.2;
  switch (kindId) {
    // ─── Themes ─────────────────────────────────────────────────────
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
      // Pentagonal shield (point-down)
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
      // Crescent — circle minus an offset circle
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
    // ─── Slots ──────────────────────────────────────────────────────
    case 'sword': {
      // Upright sword — long blade + crossguard + small pommel
      ctx.fillRect(cx - r * 0.12, cy - r,        r * 0.24, r * 1.55);    // blade
      ctx.fillRect(cx - r * 0.55, cy + r * 0.45, r * 1.10, r * 0.18);    // crossguard
      ctx.fillRect(cx - r * 0.10, cy + r * 0.62, r * 0.20, r * 0.30);    // grip
      ctx.beginPath();
      ctx.arc(cx, cy + r * 0.95, r * 0.18, 0, Math.PI * 2);              // pommel
      ctx.fill();
      break;
    }
    case 'blast': {
      // 4-point starburst (two crossed thin diamonds)
      ctx.beginPath();
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx + r * 0.18, cy);
      ctx.lineTo(cx, cy + r);
      ctx.lineTo(cx - r * 0.18, cy);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx - r, cy);
      ctx.lineTo(cx, cy + r * 0.18);
      ctx.lineTo(cx + r, cy);
      ctx.lineTo(cx, cy - r * 0.18);
      ctx.closePath();
      ctx.fill();
      // Center bright dot
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.22, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'shield': {
      // Heater / hex shield — flat top + tapered bottom (different
      // silhouette from the VOW pentagonal shield to avoid clash).
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.85, cy - r * 0.85);
      ctx.lineTo(cx + r * 0.85, cy - r * 0.85);
      ctx.lineTo(cx + r * 0.65, cy + r * 0.5);
      ctx.lineTo(cx, cy + r);
      ctx.lineTo(cx - r * 0.65, cy + r * 0.5);
      ctx.closePath();
      ctx.fill();
      // Center boss dot for detail
      ctx.fillStyle = 'rgba(0, 0, 0, 0.30)';
      ctx.beginPath();
      ctx.arc(cx, cy - r * 0.05, r * 0.20, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    default: {
      // Fallback dot
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

// Draws a row of `max` pips, the first `count` filled with `color`. Empty
// pips are dim outlined dots. At ascendance (count >= max) the filled pips
// brighten + render a halo; resonance gets a subtler accent.
function _drawHudPipRow(ctx, x, y, count, max, color, tier) {
  const pipR = 2.5;
  const gap = 3.5;
  const ascendant = tier >= 2;
  const resonant = tier >= 1;
  for (let i = 0; i < max; i++) {
    const px = x + i * (pipR * 2 + gap) + pipR;
    const py = y;
    if (i < count) {
      // Filled — theme/slot color
      if (ascendant) {
        // Halo behind each filled pip at ascendance
        const hex = color.replace('#', '');
        const n = parseInt(hex.length === 3 ? hex.split('').map(c => c + c).join('') : hex, 16);
        const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
        const halo = ctx.createRadialGradient(px, py, 1, px, py, pipR * 2.5);
        halo.addColorStop(0, `rgba(${r},${g},${b},0.55)`);
        halo.addColorStop(1, `rgba(${r},${g},${b},0)`);
        ctx.fillStyle = halo;
        ctx.fillRect(px - pipR * 2.5, py - pipR * 2.5, pipR * 5, pipR * 5);
      }
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(px, py, pipR, 0, Math.PI * 2);
      ctx.fill();
      if (resonant) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.arc(px, py, pipR + 0.4, 0, Math.PI * 2);
        ctx.stroke();
      }
    } else {
      // Empty — tiny center dot only. The previous outlined-circle
      // design produced a visually loud row of empty rings, especially
      // on an inactive chip with 5 zeros. The lone center dot reads
      // as "slot exists, not yet filled" without screaming for
      // attention.
      ctx.fillStyle = 'rgba(160, 165, 180, 0.42)';
      ctx.beginPath();
      ctx.arc(px, py, 0.9, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// Heart animation state (mutable, updated by updateHudAnims + trigger helpers)
let heartShakeTime = 0;
let heartSparkleTime = 0;
let lastSeenHp = -1;
let lastSeenMaxHp = -1;

// Reset the HP-tracking baseline. Called from main.js on each new run +
// resume so the leftover lastSeenHp from a prior run doesn't trigger a
// phantom heart-sparkle on the first frame of fresh state.
export function resetHudAnims() {
  heartShakeTime = 0;
  heartSparkleTime = 0;
  lastSeenHp = -1;
  lastSeenMaxHp = -1;
}

export function updateHudAnims(dt) {
  if (heartShakeTime > 0) heartShakeTime -= dt;
  if (heartSparkleTime > 0) heartSparkleTime -= dt;
  // Detect HP changes: damage → shake, heal → sparkle.
  //
  // Suppress the heal-sparkle when maxHp ALSO grew this frame — that
  // signals a maxHp increase from a relic pickup (Ironhide, Vitality,
  // etc.) which auto-fills hp to maxHp. Without this guard, every
  // maxHp-pickup would falsely trigger a heart-sparkle as a "heal"
  // even though the player didn't gain proportional health.
  if (lastSeenHp >= 0 && hero.hp !== lastSeenHp) {
    const maxHpGrew = lastSeenMaxHp >= 0 && hero.maxHp > lastSeenMaxHp;
    if (hero.hp < lastSeenHp) heartShakeTime = 0.3;
    else if (hero.hp > lastSeenHp && !maxHpGrew) heartSparkleTime = 0.6;
  }
  lastSeenHp = hero.hp;
  lastSeenMaxHp = hero.maxHp;
}

const ROOM_LABEL = {
  start:     'ENTRANCE',
  combat:    'COMBAT',
  reward:    'SANCTUARY',
  boss:      'BOSS',
  altar:     'ALTAR OF EXCHANGE',
  challenge: 'CHALLENGE',
  trove:     'TROVE',
  chestroom: 'TREASURE CHESTS',
};

export function drawHud(ctx, w, h, progress = {}) {
  // HAMLET CANVAS — the entire combat HUD is irrelevant in the walkable hub.
  // Hearts, ability pips, floor label, relic strip, fusions, themes, boss
  // HP bar, kill streak — all suppressed. The hamlet's own UI (essence,
  // npc count) still lives in the DOM overlay for now and doesn't interact
  // with this canvas HUD path.
  if (progress.inHamlet) return;
  // Low-HP red pulse — triggers at ≤30% HP, intensity scales with HP%.
  // Vignette stays at the EDGES — the center 60% of screen remains totally clear
  // so threats and combat read fine even when you're near death.
  // Suppressed during any cinematic intro (progress.introActive) — the intro
  // has its own framing and the red pulse would double-dim the portrait to
  // near-black on boss-intro entry, which was the persistent playtest bug.
  const hpFrac = hero.hp / Math.max(1, hero.maxHp);
  if (!progress.introActive && hero.hp > 0 && hero.state !== 'dead' && hpFrac <= 0.30) {
    const beatRate = 150 + (hpFrac / 0.30) * 200;
    const pulse = 0.35 + 0.35 * Math.sin(performance.now() / beatRate);
    // Alpha capped lower; play-area visibility prioritized over drama
    const baseA = hero.hp === 1 ? 0.55 : hpFrac <= 0.10 ? 0.45 : hpFrac <= 0.20 ? 0.3 : 0.18;
    const pulseAlpha = pulse * baseA;
    ctx.save();
    // Ring is pushed outward so center stays clear. Inner radius kept wide.
    const centerR = h * 0.42;     // was 0.22-0.30 — enemy telegraphs were getting masked
    const outerR = h * 0.80;
    const vg = ctx.createRadialGradient(w/2, h/2, centerR, w/2, h/2, outerR);
    vg.addColorStop(0, 'rgba(255, 40, 40, 0)');
    vg.addColorStop(0.55, 'rgba(255, 40, 40, ' + (pulseAlpha * 0.12).toFixed(3) + ')');
    vg.addColorStop(1, 'rgba(255, 40, 40, ' + (pulseAlpha * 0.42).toFixed(3) + ')');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
    // Heartbeat flash still fires at critical HP but much more subtle
    if (hpFrac < 0.15) {
      const peakFlash = Math.max(0, Math.sin(performance.now() / beatRate) - 0.9) * 10;
      if (peakFlash > 0) {
        ctx.fillStyle = 'rgba(255, 40, 40, ' + (peakFlash * 0.04).toFixed(3) + ')';
        ctx.fillRect(0, 0, w, h);
      }
    }
    ctx.restore();
  }

  // KILL STREAK — number of consecutive kills within 1.5s window, shown near hero
  // Only shows at 2+ for streaks worth celebrating
  if (typeof window !== 'undefined' && window.__gameMetrics.killStreakShowUntil) {
    const now = performance.now() / 1000;
    const remaining = window.__gameMetrics.killStreakShowUntil - now;
    const streak = window.__gameMetrics.killStreak || 1;
    if (remaining > 0 && streak >= 2) {
      // Fade out in the final 0.3s
      const a = Math.min(1, remaining / 0.3);
      // Place in bottom-left area, clear of the relic strip
      const ksX = 120, ksY = h - 130;
      ctx.save();
      ctx.globalAlpha = a;
      const tier = streak >= 10 ? 'legendary' : streak >= 5 ? 'rare' : 'common';
      const color = tier === 'legendary' ? '#ff4a4a' : tier === 'rare' ? '#ff9a40' : '#ffd27a';
      const label = tier === 'legendary' ? 'UNSTOPPABLE' : tier === 'rare' ? 'KILLING SPREE' : 'KILL STREAK';
      // Shadow + stroke
      ctx.shadowColor = color;
      ctx.shadowBlur = 12;
      ctx.font = 'bold italic 11px Georgia, serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = color;
      ctx.fillText(label, ksX, ksY);
      ctx.font = 'bold italic 22px Georgia, serif';
      ctx.fillText('× ' + streak, ksX, ksY + 16);
      ctx.shadowBlur = 0;
      ctx.restore();
    }
  }

  // (Removed) Damage-source arrow — used to draw a brief red chevron on the
  // screen edge pointing to whatever just hit the hero, intended for
  // off-screen threats. In practice it fired on EVERY hit including from
  // visible enemies, where it was just visual noise. The screen-edge red
  // pulse + heart shake already convey "you got hit"; the existing red
  // pulse + screen wash on damage covers the "from where" cue when it
  // matters via biome / room context. Removed per user feedback.

  // â”€â”€ LEFT-TOP HUD PANEL â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Contains: hearts (compact), dodge pip, dash-strike pip.
  // Layout is deterministic based on maxHp, so pips always sit below hearts
  // with a clear gap and never overlap.
  const pad = 18;
  // Heart size — base 17px on desktop. On mobile the canvas auto-scales
  // (--ui-scale ≈ 0.30 on a 390px-wide phone), so 17px renders as
  // ~14 actual pixels — unreadable. Bump to 26px in mobile mode for
  // a ~22-actual-pixel render. Same trade as the relic strip below.
  const _hudMobile = isMobileMode();
  const sz = _hudMobile ? 26 : 17;
  const gap = 4;
  const perRow = 14;
  const heartRowH = sz + gap;
  const shake = heartShakeTime > 0 ? (Math.random() * 2 - 1) * heartShakeTime * 6 : 0;
  const heartRows = Math.max(1, Math.ceil(hero.maxHp / perRow));
  for (let i = 0; i < hero.maxHp; i++) {
    const col = i % perRow;
    const row = Math.floor(i / perRow);
    const x = pad + col * heartRowH + shake;
    const y = pad + row * heartRowH;
    const filled = i < hero.hp;
    const isLast = filled && i === Math.ceil(hero.hp) - 1;
    const isCritical = hero.hp <= 2 && isLast;
    let scale = 1;
    if (heartSparkleTime > 0 && filled && isLast) {
      const t = heartSparkleTime / 0.6;
      scale = 1 + Math.sin(t * Math.PI) * 0.4;
    }
    if (isCritical) {
      scale = Math.max(scale, 1 + Math.sin(performance.now() / 180) * 0.15);
    }
    if (scale !== 1) {
      ctx.save();
      ctx.translate(x + sz/2, y + sz/2);
      ctx.scale(scale, scale);
      drawHeart(ctx, -sz/2, -sz/2, sz, filled, isCritical);
      if (heartSparkleTime > 0 && filled) {
        ctx.fillStyle = 'rgba(180, 255, 200, ' + (heartSparkleTime / 0.6).toFixed(3) + ')';
        ctx.fillRect(-sz/2 - 5, -sz/2 - 5, 2, 2);
        ctx.fillRect( sz/2 + 3, -sz/2 - 3, 2, 2);
      }
      ctx.restore();
    } else {
      drawHeart(ctx, x, y, sz, filled, isCritical);
    }
  }

  // Explicit HP counter next to hearts — helps at high HP when hearts wrap.
  // Serif italic to match the rest of the left HUD.
  ctx.save();
  ctx.fillStyle = hero.hp <= 2 ? '#ff8a8a' : 'rgba(220, 200, 210, 0.75)';
  ctx.font = 'italic bold 12px Georgia, serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const hpTextX = pad + (Math.min(hero.maxHp, perRow)) * heartRowH + 6;
  const hpTextY = pad + 2;
  ctx.fillText(`${Math.max(0, Math.round(hero.hp))} / ${hero.maxHp}`, hpTextX, hpTextY);
  ctx.restore();

  // ── WEAPON SLOT HEADER — wizard-kit Sprint 2A/2B/3C ─────────────
  // Two-slot weapon system displayed as a single compact row above
  // the pip stack. Active weapon is bold + tinted; the other is dim.
  // RMB / 1 / 2 / mouse-wheel all swap; the subtitle hints at RMB.
  //
  // Sprint 3C polish — when Resonance Stone is armed (the OFF-weapon
  // landed a recent kill, the player has the relic, and the window
  // hasn't expired), the OFF-weapon's name glows pulsing gold to
  // telegraph "swap to me for a free crit." Without this, the relic
  // proc fires invisibly and players miss the moment.
  ctx.save();
  const weaponHeaderY = pad + heartRows * heartRowH + 8;
  const isSwordActive = hero.activeWeapon === 'sword';
  // Resonance Stone armed indicator — true when:
  //   1. relic is owned
  //   2. there's a kill weapon stamped (hero.resonanceKillWeapon)
  //   3. the kill weapon is the OFF slot (different from active)
  //   4. the 3s window hasn't expired
  const _whNow = (typeof performance !== 'undefined') ? performance.now() / 1000 : 0;
  const rsArmed = !!hero.resonanceStone
    && !!hero.resonanceKillWeapon
    && hero.resonanceKillWeapon !== hero.activeWeapon
    && hero.resonanceKillUntil > _whNow;
  const rsPulse = rsArmed ? (0.6 + 0.4 * Math.sin(_whNow * 6)) : 1;
  ctx.font = 'italic bold 10px Georgia, serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  // [1] SWORD slot — armed-indicator if RS targets sword (i.e. blast killed)
  const swordArmed = rsArmed && hero.resonanceKillWeapon === 'blast';
  ctx.fillStyle = isSwordActive
    ? 'rgba(255, 220, 160, 0.95)'
    : swordArmed
      ? `rgba(255, 230, 160, ${(0.5 + 0.5 * rsPulse).toFixed(3)})`
      : 'rgba(140, 130, 110, 0.45)';
  ctx.fillText(isSwordActive ? '◆ 1·SWORD' : (swordArmed ? '★ 1·SWORD' : '1·sword'), pad, weaponHeaderY);
  // separator
  ctx.fillStyle = 'rgba(140, 130, 110, 0.35)';
  ctx.fillText('|', pad + 88, weaponHeaderY);
  // [2] BLAST slot — armed-indicator if RS targets blast (i.e. sword killed)
  const blastArmed = rsArmed && hero.resonanceKillWeapon === 'sword';
  ctx.fillStyle = isSwordActive
    ? blastArmed
      ? `rgba(180, 240, 255, ${(0.5 + 0.5 * rsPulse).toFixed(3)})`
      : 'rgba(140, 130, 110, 0.45)'
    : 'rgba(180, 220, 255, 0.95)';
  ctx.fillText(isSwordActive ? (blastArmed ? '★ 2·BLAST' : '2·blast') : '◆ 2·BLAST', pad + 100, weaponHeaderY);
  // RMB-swap hint to the right of the slot row
  ctx.fillStyle = 'rgba(140, 130, 110, 0.55)';
  ctx.font = 'italic 9px Georgia, serif';
  ctx.fillText('RMB · swap', pad + 178, weaponHeaderY + 1);
  ctx.restore();

  // Ability pips row — placed below the weapon header with a small gap.
  // Was below heart-row directly; bumped down 14px to make room for
  // the weapon-slot header (wizard-kit Sprint 2A).
  const abilitiesY = pad + heartRows * heartRowH + 26;
  const pipW = 66;
  const pipH = 7;
  const pipGap = 6;
  const labelInlineX = pad + pipW + 8;
  ctx.save();

  // ── SHIELD pip — wizard-kit Sprint 1 ────────────────────────────
  // Was the DODGE pip; same field names (dodgeCooldown / dodgeCooldownMul)
  // because relics + save data still use the legacy names. The label
  // reads SHIELD now, and the pip glows brighter while shielding so the
  // player gets visible state-read confirmation that the cast is active.
  const dodgeCDMax = 0.6 * (hero.dodgeCooldownMul || 1);
  const dodgeCD = hero.dodgeCooldown || 0;
  const dodgeReady = dodgeCD <= 0;
  const inShield = hero.state === 'shield';
  const dodgeRowY = abilitiesY;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
  ctx.fillRect(pad, dodgeRowY, pipW, pipH);
  if (inShield) {
    ctx.fillStyle = 'rgba(220, 240, 255, 0.95)';
    ctx.fillRect(pad + 1, dodgeRowY + 1, pipW - 2, pipH - 2);
  } else if (dodgeReady) {
    const glowPulse = 0.7 + 0.3 * Math.sin(performance.now() / 320);
    ctx.fillStyle = `rgba(130, 210, 255, ${glowPulse.toFixed(3)})`;
    ctx.fillRect(pad + 1, dodgeRowY + 1, pipW - 2, pipH - 2);
  } else {
    const frac = 1 - (dodgeCD / dodgeCDMax);
    ctx.fillStyle = 'rgba(100, 160, 210, 0.85)';
    ctx.fillRect(pad + 1, dodgeRowY + 1, (pipW - 2) * frac, pipH - 2);
  }
  ctx.strokeStyle = 'rgba(160, 200, 230, 0.55)';
  ctx.lineWidth = 1;
  ctx.strokeRect(pad + 0.5, dodgeRowY + 0.5, pipW - 1, pipH - 1);
  ctx.fillStyle = (dodgeReady || inShield) ? 'rgba(200, 230, 255, 0.9)' : 'rgba(160, 190, 220, 0.5)';
  ctx.font = 'italic bold 10px Georgia, serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('SPACE · SHIELD', labelInlineX, dodgeRowY + pipH / 2);

  // ── Q ABILITY pip — wizard-kit Sprint 2B ──────────────────────
  // Single pip whose label + CD scale by active weapon:
  //   Sword equipped → Q · DASH STRIKE  (5s CD, gold tint)
  //   Blast equipped → Q · BLINK        (3.5s CD, cyan tint)
  //
  // The RMB pip from Sprint 2A is gone — RMB is now bound to
  // weapon-swap (with 1/2/wheel as alternate inputs). The active
  // weapon's primary attack is implicit on LMB and doesn't need
  // its own CD pip (sword swing CD is too short for a meter to
  // be useful; blast bolt cadence is the same).
  const isSword = hero.activeWeapon === 'sword';
  const dashCDMax = isSword ? 5.0 : (hero.blinkMaxCD || 3.5);
  const dashCD = isSword ? (hero.dashStrikeCD || 0) : (hero.blinkCD || 0);
  const dashReady = dashCD <= 0;
  const dashRowY = dodgeRowY + pipH + pipGap;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
  ctx.fillRect(pad, dashRowY, pipW, pipH);
  const qReadyTint = isSword ? 'rgba(255, 210, 120, ' : 'rgba(160, 220, 255, ';
  const qFillTint  = isSword ? 'rgba(180, 140, 80, 0.85)' : 'rgba(120, 170, 220, 0.85)';
  if (dashReady) {
    const glowPulse = 0.7 + 0.3 * Math.sin(performance.now() / 280);
    ctx.fillStyle = qReadyTint + glowPulse.toFixed(3) + ')';
    ctx.fillRect(pad + 1, dashRowY + 1, pipW - 2, pipH - 2);
  } else {
    const frac = 1 - (dashCD / dashCDMax);
    ctx.fillStyle = qFillTint;
    ctx.fillRect(pad + 1, dashRowY + 1, (pipW - 2) * frac, pipH - 2);
  }
  ctx.strokeStyle = isSword ? 'rgba(240, 200, 140, 0.55)' : 'rgba(180, 220, 240, 0.55)';
  ctx.lineWidth = 1;
  ctx.strokeRect(pad + 0.5, dashRowY + 0.5, pipW - 1, pipH - 1);
  ctx.fillStyle = dashReady
    ? (isSword ? 'rgba(255, 225, 170, 0.9)' : 'rgba(200, 230, 255, 0.9)')
    : (isSword ? 'rgba(200, 170, 130, 0.5)' : 'rgba(170, 200, 230, 0.5)');
  ctx.font = 'italic bold 10px Georgia, serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(isSword ? 'Q · DASH STRIKE' : 'Q · BLINK', labelInlineX, dashRowY + pipH / 2);
  ctx.restore();
  // Expose the bottom of the dash row so the gold counter (further down in
  // this draw pass) can anchor beneath it with a proper margin.
  const abilitiesEndY = dashRowY + pipH;

  // Top-right panel — minimal "where am I" indicator only. The full
  // connected-dungeon minimap was removed from gameplay HUD per user
  // feedback: it pulled focus away from combat and broke immersion.
  // The map now only appears as a journey-reveal on death / run-end
  // (see deathScreen.js / winScreen.js), framed as a retrospective
  // "look at what you survived" moment.
  const label = ROOM_LABEL[progress.roomKind] || '';
  const floorText = progress.floorLevel ? ('FLOOR ' + toRoman(progress.floorLevel) + ' / ' + toRoman(progress.maxFloors || 4)) : '';
  const boxW = 200, boxH = 60;
  const bx = w - boxW - 14;
  const by = 14;
  // Slim backdrop
  ctx.fillStyle = 'rgba(14, 8, 16, 0.72)';
  ctx.fillRect(bx, by, boxW, boxH);
  ctx.strokeStyle = 'rgba(201, 168, 106, 0.35)';
  ctx.lineWidth = 1;
  ctx.strokeRect(bx + 0.5, by + 0.5, boxW - 1, boxH - 1);
  // Gold separator
  ctx.strokeStyle = 'rgba(244, 217, 160, 0.4)';
  ctx.beginPath();
  ctx.moveTo(bx + 12, by + 26);
  ctx.lineTo(bx + boxW - 12, by + 26);
  ctx.stroke();
  // FLOOR header
  ctx.fillStyle = '#f4d9a0';
  ctx.font = 'bold 14px Georgia, serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.fillText(floorText, bx + boxW - 12, by + 8);
  // Room kind label
  ctx.font = '13px Georgia, serif';
  ctx.fillStyle =
    progress.roomKind === 'boss'      ? '#ff9085' :
    progress.roomKind === 'reward'    ? '#86e3a8' :
    progress.roomKind === 'altar'     ? '#ff6a85' :
    progress.roomKind === 'challenge' ? '#ffb265' :
    progress.roomKind === 'chestroom' ? '#d8a8ff' :     // violet — gambling tension
    'rgba(210, 190, 220, 0.85)';
  ctx.fillText(label, bx + boxW - 12, by + 32);
  // Enemies left (combat only) — slim panel: tucked under the label
  if (progress.roomKind === 'combat' || progress.roomKind === 'boss' || progress.roomKind === 'challenge') {
    ctx.fillStyle = 'rgba(220, 180, 180, 0.7)';
    ctx.font = 'italic 11px Georgia, serif';
    ctx.fillText(enemies.length + ' enemies remain', bx + boxW - 12, by + 46);
  }
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  // ── Room theme chip (top-right, below the FLOOR panel) ──
  // When the active room carries a theme (set on rooms by floorGraph
  // for 60% of reward-class rooms + 30% of combat/challenge rooms),
  // render a small theme-tinted chip just under the floor panel so the
  // player has a persistent in-room reminder of what reward awaits.
  // The door already shows the same glyph at choice time; the chip
  // bridges the gap between door and pedestal.
  if (progress.roomTheme && THEMES[progress.roomTheme] && !progress.introActive) {
    const rt = THEMES[progress.roomTheme];
    const rtChipW = 130, rtChipH = 26;
    const rtX = w - rtChipW - 14;
    const rtY = by + boxH + 8;
    const rtNow = performance.now() / 1000;
    const rtPulse = 0.78 + 0.22 * Math.sin(rtNow * 1.5);
    // Halo behind chip
    const rtHex = rt.color.replace('#', '');
    const _rtN = parseInt(rtHex.length === 3 ? rtHex.split('').map(c => c + c).join('') : rtHex, 16);
    const rtR = (_rtN >> 16) & 255, rtG = (_rtN >> 8) & 255, rtB = _rtN & 255;
    const rtHalo = ctx.createRadialGradient(rtX + rtChipW / 2, rtY + rtChipH / 2, 4,
                                             rtX + rtChipW / 2, rtY + rtChipH / 2, rtChipW * 0.55);
    rtHalo.addColorStop(0, `rgba(${rtR},${rtG},${rtB},${(0.30 * rtPulse).toFixed(3)})`);
    rtHalo.addColorStop(1, `rgba(${rtR},${rtG},${rtB},0)`);
    ctx.fillStyle = rtHalo;
    ctx.fillRect(rtX - 10, rtY - 10, rtChipW + 20, rtChipH + 20);
    // Chip body
    ctx.fillStyle = 'rgba(14, 8, 16, 0.85)';
    ctx.fillRect(rtX, rtY, rtChipW, rtChipH);
    ctx.strokeStyle = rt.color;
    ctx.lineWidth = 1.4;
    ctx.strokeRect(rtX + 0.5, rtY + 0.5, rtChipW - 1, rtChipH - 1);
    // Glyph
    _drawHudGlyph(ctx, rtX + 14, rtY + rtChipH / 2, 8, rt.id, rt.color);
    // Label
    ctx.fillStyle = rt.tint || rt.color;
    ctx.font = 'bold 11px Georgia, serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(rt.name.toUpperCase() + ' ROOM', rtX + 26, rtY + rtChipH / 2);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  // Boss HP bar — shown during boss rooms, bottom-center
  if (progress.roomKind === 'boss') {
    const boss = enemies.find(e => e.boss);
    if (boss && !boss.dead) {
      const barW = Math.min(720, w * 0.6);
      const barH = 22;
      const bx = (w - barW) / 2;
      const by = h - 72;
      const t = (performance.now() / 1000) * Math.PI * 2;
      // Pulsing aura — stronger when enraged
      if (boss._enraged) {
        const pulse = 0.4 + 0.2 * Math.sin(t * 2.6);
        ctx.fillStyle = `rgba(255, 80, 40, ${pulse.toFixed(3)})`;
        ctx.fillRect(bx - 8, by - 8, barW + 16, barH + 16);
      }
      // Name label w/ subtle breathe
      const breathe = 1 + Math.sin(t * 0.9) * 0.02;
      ctx.save();
      ctx.translate(w / 2, by - 10);
      ctx.scale(breathe, breathe);
      ctx.font = 'bold 18px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      const name = boss.def.displayName || 'BOSS';
      const nameColor = boss._enraged ? '#ff5030' : '#fff2e0';
      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.85)';
      ctx.fillText(name, 2, 2);
      if (boss._enraged) {
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = 'rgba(40,0,0,0.9)';
        ctx.strokeText(name, 0, 0);
      }
      ctx.fillStyle = nameColor;
      ctx.fillText(name, 0, 0);
      ctx.restore();
      // Bar backdrop
      ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
      ctx.fillRect(bx - 2, by - 2, barW + 4, barH + 4);
      ctx.fillStyle = 'rgba(30, 15, 20, 1)';
      ctx.fillRect(bx, by, barW, barH);
      // HP fill — red→orange if enraged
      const hpPct = Math.max(0, boss.hp / boss.maxHp);
      const fillColor = boss._enraged
        ? 'rgba(255, 80, 50, 1)'
        : hpPct > 0.5 ? 'rgba(255, 70, 90, 1)'
        : hpPct > 0.25 ? 'rgba(255, 140, 60, 1)'
        : 'rgba(255, 200, 80, 1)';
      ctx.fillStyle = fillColor;
      ctx.fillRect(bx + 1, by + 1, (barW - 2) * hpPct, barH - 2);
      // Gradient overlay — more metallic feel
      const grad = ctx.createLinearGradient(0, by, 0, by + barH);
      grad.addColorStop(0, 'rgba(255,255,255,0.28)');
      grad.addColorStop(0.5, 'rgba(255,255,255,0)');
      grad.addColorStop(1, 'rgba(0,0,0,0.32)');
      ctx.fillStyle = grad;
      ctx.fillRect(bx + 1, by + 1, (barW - 2) * hpPct, barH - 2);
      // Segment ticks — visual notches for HP thresholds (quarters)
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.lineWidth = 1;
      for (let q = 1; q < 4; q++) {
        const qx = bx + (barW * q / 4);
        ctx.beginPath(); ctx.moveTo(qx, by + 3); ctx.lineTo(qx, by + barH - 3); ctx.stroke();
      }
      // Gold outline
      ctx.strokeStyle = boss._enraged ? 'rgba(255, 120, 80, 0.9)' : 'rgba(255, 200, 130, 0.85)';
      ctx.lineWidth = 2;
      ctx.strokeRect(bx - 0.5, by - 0.5, barW + 1, barH + 1);
      // HP number (right-side, small)
      ctx.font = 'bold 12px Georgia, serif';
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(Math.ceil(boss.hp) + ' / ' + boss.maxHp, bx + barW - 6, by + barH / 2);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    }
  }

  // Gold counter — left HUD, anchored BELOW the ability pips with 16px margin.
  // Small ornamental hairline above it separates the "status" group (hearts,
  // dodge, dash) from the "resource" group. Unified Georgia serif discipline.
  if (progress.gold !== undefined) {
    const streak = gold.streak | 0;
    const gx = pad;
    // 16px margin below the last ability pip — no more overlap with labels.
    const gy = abilitiesEndY + 16;
    ctx.save();
    // Tiny gold hairline divider between status and resources — 40px wide,
    // anchored to the left HUD's left edge. Reads as "new section".
    ctx.globalAlpha = 0.3;
    const sepG = ctx.createLinearGradient(gx, 0, gx + 50, 0);
    sepG.addColorStop(0, '#c9a86a');
    sepG.addColorStop(1, 'rgba(201,168,106,0)');
    ctx.fillStyle = sepG;
    ctx.fillRect(gx, gy - 8, 50, 1);
    ctx.globalAlpha = 1;
    // Coin pip (same 3-rect style as in-world coins)
    ctx.fillStyle = '#8a6024';
    ctx.fillRect(gx, gy, 8, 8);
    ctx.fillStyle = '#d4a63a';
    ctx.fillRect(gx + 1, gy + 1, 6, 6);
    ctx.fillStyle = '#f4cc55';
    ctx.fillRect(gx + 2, gy + 2, 4, 2);
    // Amount — gold serif
    ctx.fillStyle = '#f4d9a0';
    ctx.font = 'bold 14px Georgia, serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(progress.gold, gx + 14, gy + 4);
    // Streak indicator — only shown at 3+. Compact ×N to the right.
    if (streak >= 3) {
      const bx = gx + 14 + ctx.measureText(String(progress.gold)).width + 8;
      const tier = streak >= 15 ? 'RICHES' : streak >= 10 ? 'CASCADE' : streak >= 5 ? 'FLOW' : 'CHAIN';
      const tierColor = streak >= 15 ? '#ffb04a' : streak >= 10 ? '#ffd06a' : streak >= 5 ? '#ffe495' : '#ffd68a';
      const pulse = 0.75 + 0.25 * Math.sin(Date.now() / 150);
      ctx.globalAlpha = pulse;
      ctx.fillStyle = tierColor;
      ctx.shadowColor = tierColor;
      ctx.shadowBlur = 8;
      ctx.font = 'bold 12px Georgia, serif';
      ctx.fillText('\u00d7' + streak, bx, gy + 4);
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
      ctx.font = 'italic bold 8px Georgia, serif';
      ctx.fillStyle = tierColor;
      ctx.globalAlpha = 0.65;
      ctx.fillText(tier, bx, gy + 14);
      ctx.globalAlpha = 1;
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }

  // Tarot active cards — small chips on top-right above minimap
  if (isTarotRun()) {
    const tcW = 52, tcH = 18;
    const tcGap = 4;
    const tcY = 116;              // below minimap (~y=104)
    const tcStartX = w - 14 - drawnCards.length * (tcW + tcGap) + tcGap;
    ctx.save();
    ctx.font = 'bold 8px Georgia, serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    for (let i = 0; i < drawnCards.length; i++) {
      const c = drawnCards[i];
      const cx = tcStartX + i * (tcW + tcGap);
      ctx.fillStyle = 'rgba(14, 8, 14, 0.92)';
      ctx.fillRect(cx, tcY, tcW, tcH);
      ctx.strokeStyle = c.tint;
      ctx.lineWidth = 1;
      ctx.strokeRect(cx + 0.5, tcY + 0.5, tcW - 1, tcH - 1);
      ctx.fillStyle = c.tint;
      ctx.fillText(c.roman + ' ' + c.name, cx + tcW / 2, tcY + tcH / 2);
    }
    ctx.restore();
  }

  // ── SLOTS row — wizard-kit Sprint 3B ──────────────────────────
  // Per-ability-slot resonance progress (sword / blast / shield).
  // Sits above the themes row as the PRIMARY build axis. Each chip
  // shows count/5 with star glyphs at Resonance (3) + Ascendance (5).
  //
  // Wizard-kit Sprint 3D playtest fix: only show slots the player has
  // at least one relic in. Empty slots used to render as ghost chips
  // (dim glyph + name) but the row of 3 was still consuming HUD real
  // estate before the player did anything. Now the row scales to
  // ownership — 0 owned slots → row hidden, 1 owned slot → 1 chip
  // wide. Discoverability moves to the modal / Chronicles relicpedia
  // (the slots system is named explicitly there).
  if (progress.relics && progress.relics.length > 0) {
    const slotCounts = getSlotCounts(progress.relics);
    const slotList = Object.values(SLOTS).filter(s => (slotCounts[s.id] | 0) > 0);
    if (slotList.length === 0) {
      // No owned slots yet — skip the entire row (header included) so
      // the HUD doesn't reserve dead space.
    } else {
    // Mobile font bump — hearts already do this (line 156). Without
    // matching scale on the chip labels, mobile players see hearts
    // at ~22 actual px but slot/theme chip text at ~9 actual px,
    // making "SWORD 4/5 ★" basically unreadable. Same trade.
    const _slotMobile = isMobileMode();
    const slotLabelFont = _slotMobile ? 'bold 14px Georgia, serif' : 'bold 11px Georgia, serif';
    const slotHeaderFont = _slotMobile ? 'bold 13px Georgia, serif' : 'bold 10px Georgia, serif';
    // Chip wider than the legacy 64/78 — accommodates glyph + name + 5-pip row.
    // Wizard-kit Sprint 3D HUD pass: we replaced the dense "SWORD 0/5 ★" text
    // grid with glyph + pips for at-a-glance readability; the extra width
    // gives the row room to breathe.
    const sChipW = _slotMobile ? 96 : 78;
    const sChipH = _slotMobile ? 32 : 26;
    const sChipGap = 5;
    const slotsY = h - sChipH - 152;       // 42px above the themes row
    const slotsLabelY = slotsY - 14;
    ctx.save();
    ctx.fillStyle = 'rgba(220, 200, 160, 0.65)';
    ctx.font = slotHeaderFont;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('◆ SLOTS', 18, slotsLabelY);
    const sNow = performance.now() / 1000;
    for (let i = 0; i < slotList.length; i++) {
      const s = slotList[i];
      const count = slotCounts[s.id] | 0;
      const tier = getSlotTier(count);
      const cx = 18 + i * (sChipW + sChipGap);
      const cy = slotsY;
      // ── Ghost-chip mode for empty slots ────────────────────────────
      // tier 0 + count 0 chips skip the backdrop, border, halo, and pip
      // row entirely — they recede into the HUD background and only
      // reserve their layout slot via a dim glyph + dim name. Without
      // this, a fresh-run HUD shows 8 fully-bordered chips with 25
      // outlined empty pips, which the player reads as "noisy debug
      // grid". Once a slot has any progress, the chip lights up.
      const isGhost = tier === 0 && count === 0;
      // Backdrop — only for chips with content
      if (!isGhost) {
        const bgA = tier >= 2 ? 0.92 : tier >= 1 ? 0.82 : 0.65;
        ctx.fillStyle = `rgba(12, 10, 18, ${bgA})`;
        ctx.fillRect(cx, cy, sChipW, sChipH);
      }
      // Almost-tier preview pulse — same telegraph pattern as themes.
      const almostRes = tier === 0 && count === SLOT_THRESHOLDS.resonance - 1;
      const almostAsc = tier === 1 && count === SLOT_THRESHOLDS.ascendance - 1;
      if (tier >= 1 || almostRes) {
        const baseRate = tier >= 2 ? 2.2 : tier >= 1 ? 1.6 : 1.4;
        const rate = almostAsc ? 2.6 : almostRes ? 1.8 : baseRate;
        const baseAmp = tier >= 2 ? 0.32 : tier >= 1 ? 0.22 : 0.16;
        const ampMod = almostAsc || almostRes ? 0.06 : 0;
        const pulse = (1 - baseAmp) + (baseAmp + ampMod) * Math.sin(sNow * rate + i * 0.4);
        const halo = ctx.createRadialGradient(cx + sChipW / 2, cy + sChipH / 2, 4, cx + sChipW / 2, cy + sChipH / 2, sChipW * 0.7);
        const hex = s.color.replace('#', '');
        const n = parseInt(hex.length === 3 ? hex.split('').map(c => c + c).join('') : hex, 16);
        const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
        const alphaMul = tier >= 2 ? 0.55 : tier >= 1 ? 0.34 : 0.20;
        const alpha = alphaMul * pulse;
        halo.addColorStop(0, `rgba(${r},${g},${b},${alpha.toFixed(3)})`);
        halo.addColorStop(1, `rgba(${r},${g},${b},0)`);
        ctx.fillStyle = halo;
        ctx.fillRect(cx - 8, cy - 8, sChipW + 16, sChipH + 16);
      }
      // Border — only on chips with content. Ghost chips have no
      // frame so they don't form a visible row of empty boxes.
      if (!isGhost) {
        ctx.strokeStyle = tier >= 2 ? '#ffffff' : tier >= 1 ? s.color : 'rgba(120, 130, 150, 0.55)';
        ctx.lineWidth = tier >= 2 ? 1.8 : tier >= 1 ? 1.4 : 1;
        ctx.strokeRect(cx + 0.5, cy + 0.5, sChipW - 1, sChipH - 1);
      }
      // ── Glyph + name + pips ──
      // Layout: glyph on left, small caps name above pips on right.
      // Ghost chips render glyph + name only (very dim, no pip row);
      // active chips get the full treatment.
      const sGlyphR = _slotMobile ? 9 : 7;
      const sGlyphCx = cx + (_slotMobile ? 14 : 11);
      const sGlyphCy = cy + sChipH / 2;
      const sGhostAlpha = isGhost ? 'rgba(170, 175, 190, 0.45)' : 'rgba(170, 180, 195, 0.85)';
      const sGlyphCol = tier >= 1 ? s.color : sGhostAlpha;
      _drawHudGlyph(ctx, sGlyphCx, sGlyphCy, sGlyphR, s.id, sGlyphCol);
      const sTextX = sGlyphCx + sGlyphR + 4;
      ctx.fillStyle = tier >= 1
        ? s.color
        : isGhost ? 'rgba(170, 180, 195, 0.40)' : 'rgba(170, 180, 195, 0.8)';
      ctx.font = slotLabelFont;
      ctx.textAlign = 'left';
      // Ghost chips center the name vertically since they have no pip row.
      if (isGhost) {
        ctx.textBaseline = 'middle';
        ctx.fillText(s.name.toUpperCase(), sTextX, sGlyphCy);
      } else {
        ctx.textBaseline = 'top';
        ctx.fillText(s.name.toUpperCase(), sTextX, cy + (_slotMobile ? 4 : 3));
        const sPipColor = tier >= 1 ? s.color : 'rgba(180, 190, 205, 0.85)';
        _drawHudPipRow(ctx, sTextX, cy + (_slotMobile ? 22 : 18),
                       count, SLOT_THRESHOLDS.ascendance, sPipColor, tier);
      }
      // Ascendance star — top-right corner badge
      if (tier >= 2) {
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 10px Georgia, serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';
        ctx.fillText('★', cx + sChipW - 3, cy + 1);
      }
      // Hover tooltip — name + blurb + tier-progress text.
      if (mouse.x >= cx && mouse.x <= cx + sChipW && mouse.y >= cy && mouse.y <= cy + sChipH
          && !isPedestalTooltipActive()) {
        const tipW = 280, tipH = 80;
        const tipX = Math.max(10, Math.min(w - tipW - 10, cx + sChipW / 2 - tipW / 2));
        const tipY = cy - tipH - 6;
        ctx.fillStyle = 'rgba(14, 20, 30, 0.95)';
        ctx.fillRect(tipX, tipY, tipW, tipH);
        ctx.strokeStyle = s.color;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(tipX + 0.5, tipY + 0.5, tipW - 1, tipH - 1);
        ctx.fillStyle = s.color;
        ctx.font = 'bold 12px Georgia, serif';
        ctx.fillText(`${s.name} slot  (${count}/${SLOT_THRESHOLDS.ascendance})`, tipX + 10, tipY + 8);
        ctx.fillStyle = '#d8e4f0';
        ctx.font = 'italic 10px Georgia, serif';
        ctx.fillText(s.blurb, tipX + 10, tipY + 26);
        ctx.fillStyle = tier >= 1 ? '#fff2e0' : 'rgba(200, 200, 210, 0.6)';
        ctx.font = 'bold 11px Georgia, serif';
        const tLbl = tier >= 2
          ? '★★ ASCENDANCE active'
          : tier >= 1
            ? `★ RESONANCE · ${SLOT_THRESHOLDS.ascendance - count} more → Ascendance`
            : count > 0
              ? `${SLOT_THRESHOLDS.resonance - count} more → Resonance`
              : 'No relics in this slot';
        ctx.fillText(tLbl, tipX + 10, tipY + 56);
      }
    }
    ctx.restore();
    }   // end else (slotList.length > 0)
  }

  // THEMES row — shows set-bonus progress across the active themes.
  // Chip lights up when a theme has ≥1 owned relic; glow at resonance
  // (3), double-glow at ascendance (5).
  //
  // Wizard-kit Sprint 3D playtest fix: filter to ONLY themes the
  // player has relics in. Previously rendered all 5 even when empty
  // (with ghost styling) for system-discoverability — but on
  // playtest, those 5 ghost chips read as "wasted UI space" given
  // most early runs only touch 1-2 themes. Discoverability is now
  // handled by the choice modal (which names the theme on every
  // pedestal modal) and the relicpedia, both of which the player
  // sees long before they care about resonance progression.
  if (progress.relics && progress.relics.length > 0) {
    const themeCounts = getThemeCounts(progress.relics);
    const visibleThemes = Object.values(THEMES).filter(t => (themeCounts[t.id] | 0) > 0);
    if (visibleThemes.length === 0) {
      // No themed relics yet — skip the row entirely.
    } else {
    if (visibleThemes.length > 0) {
      // Mobile font bump — same trade as slot chips (and hearts at line
      // 156). Without this the chip text renders at sub-readable size
      // on phone-scale viewports.
      const _themeMobile = isMobileMode();
      const themeNameFont  = _themeMobile ? 'bold 13px Georgia, serif' : 'bold 10px Georgia, serif';
      const themeHeaderFont = _themeMobile ? 'bold 13px Georgia, serif' : 'bold 10px Georgia, serif';
      // Wider than the legacy 52/64 — same reason as slot chips: room
      // for glyph + pip row instead of the old "STORM 0/4 ★" text grid.
      const chipW = _themeMobile ? 80 : 66;
      const chipH = _themeMobile ? 28 : 22;
      const chipGap = 4;
      const themesY = h - chipH - 110;
      const themesLabelY = themesY - 14;
      ctx.save();
      ctx.fillStyle = 'rgba(180, 200, 220, 0.55)';
      ctx.font = themeHeaderFont;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('◆ THEMES', 18, themesLabelY);
      const now = performance.now() / 1000;
      for (let i = 0; i < visibleThemes.length; i++) {
        const t = visibleThemes[i];
        const count = themeCounts[t.id];
        const tier = getThemeTier(t.id, count);
        // Per-theme thresholds — storm uses 3/4 (smaller pool), others
        // use 3/5. See themes.js THEME_THRESHOLDS comment for rationale.
        const thresh = getThemeThresholds(t.id);
        const cx = 18 + i * (chipW + chipGap);
        const cy = themesY;
        // ── Ghost-chip mode for empty themes ──────────────────────────
        // tier 0 + count 0 chips skip the backdrop / border / halo /
        // pip row. Same rationale as the SLOTS row above: keep dormant
        // chips dim so active themes pop. The chip space is reserved
        // (so the strip layout doesn't shift when a theme activates),
        // but only shows a faint glyph + name.
        const isGhost = tier === 0 && count === 0;
        // Backdrop — only on chips with content
        if (!isGhost) {
          const bgA = tier >= 2 ? 0.9 : tier >= 1 ? 0.8 : 0.65;
          ctx.fillStyle = `rgba(12, 10, 18, ${bgA})`;
          ctx.fillRect(cx, cy, chipW, chipH);
        }
        // Round-7-audit POLISH — "almost-there" telegraph. One pickup
        // from the next tier (count 2 -> Resonance, count 4 ->
        // Ascendance for the default 3/5 themes) the chip was
        // visually IDENTICAL to count 0 / 3 respectively — players
        // didn't see the strategic moment building. Now a soft
        // pre-tier pulse halo appears ONE pickup before each
        // threshold (theme-aware so storm's 3-from-asc lights up at
        // count=3 instead of count=4).
        const almostResonance = tier === 0 && count === thresh.resonance - 1;
        const almostAscendance = tier === 1 && count === thresh.ascendance - 1;
        // Tier glow halo behind chip — ascendance pulses strongest;
        // resonance medium; "almost-tier" gets a faint preview halo.
        if (tier >= 1 || almostResonance) {
          // Pulse rate accelerates one pickup from next tier — gives
          // the chip a visible "anticipation heartbeat" without
          // over-juicing the steady-state Resonance glow.
          const baseRate = tier >= 2 ? 2.2 : tier >= 1 ? 1.6 : 1.4;
          const rate = almostAscendance ? 2.6 : almostResonance ? 1.8 : baseRate;
          const baseAmp = tier >= 2 ? 0.30 : tier >= 1 ? 0.20 : 0.15;
          const ampMod = almostAscendance || almostResonance ? 0.05 : 0;
          const pulse = (1 - baseAmp) + (baseAmp + ampMod) * Math.sin(now * rate + i * 0.5);
          const halo = ctx.createRadialGradient(cx + chipW/2, cy + chipH/2, 4, cx + chipW/2, cy + chipH/2, chipW * 0.7);
          const hex = t.color.replace('#', '');
          const n = parseInt(hex.length === 3 ? hex.split('').map(c => c + c).join('') : hex, 16);
          const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
          // Almost-tier halo is dimmer than full Resonance to preserve
          // the visual hierarchy: 0.18 alpha (almost) < 0.30 (resonance)
          // < 0.50 (ascendance). The player learns the gradient: faint
          // glow = one away, steady glow = arrived, double glow = max.
          const alphaMul = tier >= 2 ? 0.5
                         : tier >= 1 ? 0.30
                         : 0.18;
          const alpha = alphaMul * pulse;
          halo.addColorStop(0, `rgba(${r},${g},${b},${alpha.toFixed(3)})`);
          halo.addColorStop(1, `rgba(${r},${g},${b},0)`);
          ctx.fillStyle = halo;
          ctx.fillRect(cx - 8, cy - 8, chipW + 16, chipH + 16);
        }
        // Border — only on chips with content. Ghost chips have no
        // frame so they don't form a visible row of empty boxes.
        if (!isGhost) {
          ctx.strokeStyle = tier >= 2 ? t.tint : tier >= 1 ? t.color : 'rgba(120, 130, 150, 0.45)';
          ctx.lineWidth = tier >= 2 ? 1.8 : tier >= 1 ? 1.3 : 1;
          ctx.strokeRect(cx + 0.5, cy + 0.5, chipW - 1, chipH - 1);
        }
        // \u2500\u2500 Glyph + name + pips \u2500\u2500
        // Same redesign pattern as the SLOTS row above: replace the dense
        // "STORM 0/4 \u2605" text grid with glyph + name + pip row. Glyph
        // anchors identity (matches the pedestal sigil), pips show
        // progress visually without forcing the player to read numbers.
        // Ghost themes render glyph + name only (very dim, no pip row);
        // active themes get the full glyph + name + pips treatment.
        const tGlyphR = _themeMobile ? 8 : 6;
        const tGlyphCx = cx + (_themeMobile ? 13 : 10);
        const tGlyphCy = cy + chipH / 2;
        const tGhostAlpha = isGhost ? 'rgba(160, 170, 185, 0.40)' : 'rgba(160, 170, 185, 0.85)';
        const tGlyphCol = tier >= 1 ? t.tint : tGhostAlpha;
        _drawHudGlyph(ctx, tGlyphCx, tGlyphCy, tGlyphR, t.id, tGlyphCol);
        const tTextX = tGlyphCx + tGlyphR + 4;
        ctx.fillStyle = tier >= 1
          ? t.tint
          : isGhost ? 'rgba(160, 170, 185, 0.40)' : 'rgba(160, 170, 185, 0.75)';
        ctx.font = themeNameFont;
        ctx.textAlign = 'left';
        if (isGhost) {
          ctx.textBaseline = 'middle';
          ctx.fillText(t.name.toUpperCase(), tTextX, tGlyphCy);
        } else {
          ctx.textBaseline = 'top';
          ctx.fillText(t.name.toUpperCase(), tTextX, cy + (_themeMobile ? 4 : 3));
          const tPipColor = tier >= 1 ? t.tint : 'rgba(180, 190, 205, 0.85)';
          _drawHudPipRow(ctx, tTextX, cy + (_themeMobile ? 20 : 15),
                         count, thresh.ascendance, tPipColor, tier);
        }
        // Ascendance star \u2014 top-right corner badge
        if (tier >= 2) {
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 9px Georgia, serif';
          ctx.textAlign = 'right';
          ctx.textBaseline = 'top';
          ctx.fillText('\u2605', cx + chipW - 3, cy + 1);
        }
        // Hover tooltip — name + blurb + current buff text. Suppressed
        // when a pedestal tooltip would also be on screen so the player
        // doesn't see two tooltips stacked (audit dedup quick-win).
        // Pedestal tooltip is the "active decision" UI and wins.
        if (mouse.x >= cx && mouse.x <= cx + chipW && mouse.y >= cy && mouse.y <= cy + chipH
            && !isPedestalTooltipActive()) {
          const tipW = 260, tipH = 74;
          const tipX = Math.max(10, Math.min(w - tipW - 10, cx + chipW/2 - tipW/2));
          const tipY = cy - tipH - 6;
          ctx.fillStyle = 'rgba(14, 20, 30, 0.95)';
          ctx.fillRect(tipX, tipY, tipW, tipH);
          ctx.strokeStyle = t.tint;
          ctx.lineWidth = 1.5;
          ctx.strokeRect(tipX + 0.5, tipY + 0.5, tipW - 1, tipH - 1);
          ctx.fillStyle = t.tint;
          ctx.font = 'bold 12px Georgia, serif';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'top';
          ctx.fillText(t.name + '  (' + count + '/' + thresh.ascendance + ')', tipX + 10, tipY + 8);
          ctx.fillStyle = '#d8e4f0';
          ctx.font = 'italic 10px Georgia, serif';
          ctx.fillText(t.blurb, tipX + 10, tipY + 25);
          ctx.fillStyle = tier >= 1 ? '#fff2e0' : 'rgba(200, 200, 210, 0.6)';
          ctx.font = 'bold 11px Georgia, serif';
          const tierLabel = tier >= 2 ? '★★ ASCENDANCE active' : tier >= 1 ? '★ RESONANCE active' : `${thresh.resonance - count} more → Resonance`;
          ctx.fillText(tierLabel, tipX + 10, tipY + 54);
        }
      }
      ctx.restore();
    }
    }   // end else (visibleThemes.length > 0)
  }

  // Active FUSIONS row — sits above the relic strip, rendered as diamond chips
  // with fusion name + crackling halo. Marks the run as unique.
  if (activeFusions && activeFusions.length > 0) {
    const fSize = 26;
    const fGap = 6;
    const fY = h - fSize - 62;       // above relic strip
    const fLabelY = fY - 14;
    ctx.save();
    // Small header
    ctx.fillStyle = 'rgba(180, 220, 240, 0.6)';
    ctx.font = 'bold 10px Georgia, serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('⚡ FUSIONS', 18, fLabelY);
    const now = performance.now() / 1000;
    for (let i = 0; i < activeFusions.length; i++) {
      const f = activeFusions[i];
      const fx = 18 + i * (fSize + fGap);
      // Pulsing halo
      const pulse = 0.5 + 0.5 * Math.sin(now * 2.2 + i * 0.8);
      const haloA = 0.3 + pulse * 0.25;
      const tint = f.tint || '#a0e8ff';
      const hex = tint.replace('#', '');
      const nH = parseInt(hex.length === 3 ? hex.split('').map(c => c + c).join('') : hex, 16);
      const tr = (nH >> 16) & 255, tg = (nH >> 8) & 255, tb = nH & 255;
      const halo = ctx.createRadialGradient(fx + fSize/2, fY + fSize/2, 4, fx + fSize/2, fY + fSize/2, fSize * 0.9);
      halo.addColorStop(0, `rgba(${tr},${tg},${tb},${haloA.toFixed(3)})`);
      halo.addColorStop(1, `rgba(${tr},${tg},${tb},0)`);
      ctx.fillStyle = halo;
      ctx.fillRect(fx - 10, fY - 10, fSize + 20, fSize + 20);
      // Diamond chip shape (rotated square)
      ctx.save();
      ctx.translate(fx + fSize/2, fY + fSize/2);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = 'rgba(10, 14, 20, 0.92)';
      ctx.fillRect(-fSize/2.5, -fSize/2.5, fSize/1.25, fSize/1.25);
      ctx.strokeStyle = tint;
      ctx.lineWidth = 1.8;
      ctx.strokeRect(-fSize/2.5 + 0.5, -fSize/2.5 + 0.5, fSize/1.25 - 1, fSize/1.25 - 1);
      ctx.restore();
      // Component icons (mini, stacked)
      const ic = images[f.icon];
      if (ic) {
        ctx.drawImage(ic, fx + 4, fY + 4, fSize - 8, fSize - 8);
      }
      // Hover: show fusion name + desc tooltip
      if (mouse.x >= fx && mouse.x <= fx + fSize && mouse.y >= fY && mouse.y <= fY + fSize) {
        const tipW = 280, tipH = 66;
        const tipX = Math.max(10, Math.min(w - tipW - 10, fx + fSize/2 - tipW/2));
        const tipY = fY - tipH - 8;
        ctx.fillStyle = 'rgba(14, 20, 30, 0.95)';
        ctx.fillRect(tipX, tipY, tipW, tipH);
        ctx.strokeStyle = tint;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(tipX + 0.5, tipY + 0.5, tipW - 1, tipH - 1);
        ctx.fillStyle = tint;
        ctx.font = 'bold 10px Georgia, serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText('⚡ FUSION', tipX + 10, tipY + 8);
        ctx.fillStyle = '#fff8e8';
        ctx.font = 'bold 14px Georgia, serif';
        ctx.fillText(f.name, tipX + 10, tipY + 20);
        ctx.fillStyle = '#d8e4f0';
        ctx.font = 'italic 11px Georgia, serif';
        const lines = wrapText(ctx, f.desc, tipW - 20);
        for (let k = 0; k < lines.length; k++) {
          ctx.fillText(lines[k], tipX + 10, tipY + 40 + k * 13);
        }
      }
    }
    ctx.restore();
  }

  // Equipped relics — bottom-left icon strip with gold frame + hover tooltips
  let hoveredRelic = null;
  let hoveredRelicPos = null;
  if (progress.relics && progress.relics.length > 0) {
    // Mobile: icon goes 30px → 44px so it actually reads at low UI scale.
    // PER_ROW reduced 16 → 11 to keep the wider icons inside the same
    // bottom-left footprint without overflowing into the fusion row.
    const icSize = _hudMobile ? 44 : 30;
    const gap = 4;
    // Wrap into rows to keep the strip from overflowing the canvas at
    // endgame relic counts (a 30-relic build was running off the right
    // edge into the FUSIONS row). PER_ROW chosen so 16 icons + gaps +
    // frame padding stay well clear of the boss HP bar at right.
    // Layout direction: index 0 top-left, index N bottom-right — older
    // relics stack upward, newest pickup always at the same baseline
    // the player's eye returns to.
    const PER_ROW = _hudMobile ? 11 : 16;
    const totalRows = Math.max(1, Math.ceil(progress.relics.length / PER_ROW));
    const rowH = icSize + 4;
    const yBase = h - icSize - 18;                       // baseline (bottom-most row)
    const yTop = yBase - (totalRows - 1) * rowH;         // top-most row
    const itemsInTopRow = progress.relics.length - (totalRows - 1) * PER_ROW;
    const widestRow = totalRows > 1 ? PER_ROW : itemsInTopRow;
    const frameW = widestRow * (icSize + gap) + 8;
    ctx.fillStyle = 'rgba(14, 8, 16, 0.7)';
    ctx.fillRect(12, yTop - 4, frameW, totalRows * rowH + 4);
    ctx.strokeStyle = 'rgba(201, 168, 106, 0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(12.5, yTop - 3.5, frameW - 1, totalRows * rowH + 3);
    const now = performance.now() / 1000;
    for (let i = 0; i < progress.relics.length; i++) {
      const r = progress.relics[i];
      const row = Math.floor(i / PER_ROW);
      const col = i - row * PER_ROW;
      const x = 16 + col * (icSize + gap);
      const y0 = yTop + row * rowH;
      // Rarity glow — pulsing halo for rare/legendary/mythic relics
      if (r.tier === 'mythic' || r.tier === 'legendary' || r.tier === 'rare') {
        const pulseRate = r.tier === 'mythic' ? 3.5 : r.tier === 'legendary' ? 2.8 : 1.9;
        const pulse = 0.5 + 0.5 * Math.sin(now * pulseRate + i * 0.5);
        const glowA = (r.tier === 'mythic' ? 0.6 : r.tier === 'legendary' ? 0.4 : 0.22) * pulse;
        const glowR = r.tier === 'mythic' ? 20 : r.tier === 'legendary' ? 14 : 9;
        const grad = ctx.createRadialGradient(x + icSize/2, y0 + icSize/2, 4, x + icSize/2, y0 + icSize/2, glowR);
        grad.addColorStop(0, hudHexToRgba(r.tint || '#ffffff', glowA));
        grad.addColorStop(1, hudHexToRgba(r.tint || '#ffffff', 0));
        ctx.fillStyle = grad;
        ctx.fillRect(x - 12, y0 - 12, icSize + 24, icSize + 24);
      }
      // Backdrop with the relic's tint
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(x, y0, icSize, icSize);
      ctx.strokeStyle = r.tint || '#ffffff';
      ctx.lineWidth = r.tier === 'mythic' ? 2.2 : r.tier === 'legendary' ? 1.8 : 1.2;
      ctx.strokeRect(x + 0.5, y0 + 0.5, icSize - 1, icSize - 1);
      // Mythic gets a second outer frame in white — double-frame signature
      if (r.tier === 'mythic') {
        const mythPulse = 0.6 + 0.4 * Math.sin(now * 3 + i * 0.3);
        ctx.strokeStyle = `rgba(255, 242, 224, ${mythPulse.toFixed(3)})`;
        ctx.lineWidth = 1;
        ctx.strokeRect(x - 2.5, y0 - 2.5, icSize + 5, icSize + 5);
      }
      const ic = images[r.icon];
      // Dedicated per-relic art — bypass glyph/hue overlay (pass null,null).
      if (ic) drawRelicIcon(ctx, ic, null, null, r.id,
                            x + 3, y0 + 3, icSize - 6);
      // Legendary gets corner dots; mythic gets all 4 corners
      if (r.tier === 'legendary' || r.tier === 'mythic') {
        ctx.fillStyle = r.tint || '#f4d9a0';
        ctx.fillRect(x + icSize - 5, y0 + 1, 3, 3);
        ctx.fillRect(x + 2, y0 + icSize - 4, 3, 3);
        if (r.tier === 'mythic') {
          ctx.fillRect(x + 1, y0 + 1, 3, 3);
          ctx.fillRect(x + icSize - 4, y0 + icSize - 4, 3, 3);
        }
      }
      // Hover detection — mouse over this icon?
      if (mouse.x >= x && mouse.x <= x + icSize && mouse.y >= y0 && mouse.y <= y0 + icSize) {
        hoveredRelic = r;
        hoveredRelicPos = { x: x + icSize / 2, y: y0 };
      }
    }
  }

  // Tooltip for hovered relic (drawn last so it's above other UI)
  if (hoveredRelic && hoveredRelicPos) {
    const r = hoveredRelic;
    const tipW = 280;
    const padding = 10;
    // Measure desc + flavor separately to compute tooltip height
    ctx.font = 'italic 11px Georgia, serif';
    const flavorLines = r.flavor ? wrapText(ctx, r.flavor, tipW - padding * 2) : [];
    ctx.font = 'bold 11px Georgia, serif';
    const descLines = wrapText(ctx, r.desc || '', tipW - padding * 2);
    const flavorH = flavorLines.length ? (flavorLines.length * 14 + 8) : 0;
    const tipH = 34 + flavorH + descLines.length * 14 + padding + 4;
    let tipX = hoveredRelicPos.x - tipW / 2;
    if (tipX < 10) tipX = 10;
    if (tipX + tipW > w - 10) tipX = w - tipW - 10;
    const tipY = hoveredRelicPos.y - tipH - 8;
    // Backdrop with vertical gradient for depth
    const bg = ctx.createLinearGradient(0, tipY, 0, tipY + tipH);
    bg.addColorStop(0, 'rgba(28, 18, 26, 0.96)');
    bg.addColorStop(1, 'rgba(14, 8, 16, 0.96)');
    ctx.fillStyle = bg;
    ctx.fillRect(tipX, tipY, tipW, tipH);
    ctx.strokeStyle = r.tint || '#c9a86a';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(tipX + 0.5, tipY + 0.5, tipW - 1, tipH - 1);
    // Inner thin border
    ctx.strokeStyle = 'rgba(201, 168, 106, 0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(tipX + 4.5, tipY + 4.5, tipW - 9, tipH - 9);
    // Tier label
    const tierLabel = r.tier === 'mythic' ? '\u2605\u2605 MYTHIC \u2605\u2605' : r.tier === 'legendary' ? '\u2605 LEGENDARY' : r.tier === 'rare' ? '\u25C6 RARE' : '\u00b7 COMMON';
    ctx.fillStyle = r.tier === 'mythic' ? '#fff2e0' : r.tier === 'legendary' ? '#ffc8ff' : r.tier === 'rare' ? '#f4d9a0' : '#b4c8d8';
    ctx.font = 'bold 10px Georgia, serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(tierLabel, tipX + padding, tipY + padding);
    // Relic name
    ctx.fillStyle = r.tint || '#f4d9a0';
    ctx.font = 'bold 14px Georgia, serif';
    ctx.fillText(r.name, tipX + padding, tipY + padding + 12);
    let cursorY = tipY + padding + 32;
    // Flavor (italic, faded) first — lore before mechanic
    if (flavorLines.length) {
      ctx.fillStyle = 'rgba(200, 190, 210, 0.7)';
      ctx.font = 'italic 11px Georgia, serif';
      for (let k = 0; k < flavorLines.length; k++) {
        ctx.fillText(flavorLines[k], tipX + padding, cursorY + k * 14);
      }
      cursorY += flavorLines.length * 14 + 6;
      // Thin divider between flavor and mechanic
      ctx.strokeStyle = 'rgba(201, 168, 106, 0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(tipX + padding, cursorY - 3);
      ctx.lineTo(tipX + tipW - padding, cursorY - 3);
      ctx.stroke();
    }
    // Desc (bold, tinted) — the mechanic
    ctx.fillStyle = r.tint || '#f4d9a0';
    ctx.font = 'bold 11px Georgia, serif';
    for (let k = 0; k < descLines.length; k++) {
      ctx.fillText(descLines[k], tipX + padding, cursorY + k * 14);
    }
    // Pointer chevron at bottom toward the relic icon
    ctx.fillStyle = 'rgba(14, 8, 18, 0.95)';
    ctx.strokeStyle = r.tint || '#c9a86a';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    const ptrX = Math.max(tipX + 12, Math.min(tipX + tipW - 12, hoveredRelicPos.x));
    ctx.moveTo(ptrX - 6, tipY + tipH);
    ctx.lineTo(ptrX + 6, tipY + tipH);
    ctx.lineTo(ptrX, tipY + tipH + 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // ==========================================================================
  // ACTIVE-MEMORY HUD — Phase 4 polish pass.
  // The memory system was already a deep run-identity layer (14 unlockable
  // memories, each a constraint+gift pact that reshapes a run) — but during
  // play the active memory was completely invisible. Players who declared
  // "Memory of Stillness" at run start had no on-screen reminder of WHY
  // their shield was disabled. The chip is small, sits between the floor
  // panel and ascension panel, and tooltips on hover with the memory's
  // gift + constraint text.
  // ==========================================================================
  drawMemoryHUD(ctx, w, h);
  // ==========================================================================
  // ASCENSION FEEDBACK HUD — Session A polish pass.
  // Shows the active ascension tier + any rules currently pressing on the run
  // (floor timer, legendary-disabled, memory-disabled, hidden map nodes, etc.)
  // so the player always knows why their run is harder.
  // ==========================================================================
  drawAscensionHUD(ctx, w, h);
}

// Compact active-memory chip — just beneath the top-right floor/minimap box.
// Only visible when a memory is selected for this run. Hover tooltip shows
// the gift + constraint text so the player can re-read their pact mid-run.
function drawMemoryHUD(ctx, w, _h) {
  const mem = (typeof window !== 'undefined') ? window.__activeMemory : null;
  if (!mem) return;
  // Position: between the floor panel (ends y=74) and the ascension chip
  // (starts y=110, see drawAscensionHUD). Memory chip sits at y=80, h=24,
  // ends y=104 with 6px gap before ascension. When ascension is absent,
  // the chip just floats with the floor panel above.
  const boxW = 200, boxH = 24;
  const bx = w - boxW - 14;
  const by = 14 + 60 + 6;             // 80px from top
  const tint = mem.tint || '#c9a86a';
  // Plate
  ctx.fillStyle = 'rgba(14, 8, 16, 0.82)';
  ctx.fillRect(bx, by, boxW, boxH);
  ctx.strokeStyle = tint + '88';
  ctx.lineWidth = 1;
  ctx.strokeRect(bx + 0.5, by + 0.5, boxW - 1, boxH - 1);
  // Left ornamental diamond — same visual language as the ascension chip
  // so the two stack as siblings.
  ctx.fillStyle = tint;
  ctx.save();
  ctx.translate(bx + 10, by + boxH / 2);
  ctx.rotate(Math.PI / 4);
  ctx.fillRect(-3, -3, 6, 6);
  ctx.restore();
  // Memory name — italic to read as a "declared identity" rather than a
  // stat readout. Shortened "Memory of X" → just "X" so the chip stays
  // narrow enough to fit the 200px width.
  const shortName = (mem.name || '').replace(/^Memory of (?:the )?/i, '').toUpperCase();
  ctx.fillStyle = '#f4d9a0';
  ctx.font = 'italic bold 11px Georgia, serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(shortName || 'MEMORY', bx + 22, by + boxH / 2);
  // Hover tooltip — gift + constraint text. Suppressed when a pedestal
  // tooltip would be on screen (active-decision UI wins).
  if (mouse.x >= bx && mouse.x <= bx + boxW && mouse.y >= by && mouse.y <= by + boxH
      && !isPedestalTooltipActive()) {
    const tipW = 320, tipH = 92;
    const tipX = Math.max(10, Math.min(w - tipW - 10, bx + boxW / 2 - tipW / 2));
    const tipY = by + boxH + 6;
    ctx.fillStyle = 'rgba(14, 20, 30, 0.95)';
    ctx.fillRect(tipX, tipY, tipW, tipH);
    ctx.strokeStyle = tint;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(tipX + 0.5, tipY + 0.5, tipW - 1, tipH - 1);
    ctx.fillStyle = tint;
    ctx.font = 'bold 12px Georgia, serif';
    ctx.fillText(mem.name || 'Memory', tipX + 10, tipY + 8);
    if (mem.flavor) {
      ctx.fillStyle = '#d8c6f0';
      ctx.font = 'italic 10px Georgia, serif';
      ctx.fillText(mem.flavor, tipX + 10, tipY + 26);
    }
    ctx.fillStyle = '#a8e0a8';     // green-positive for the gift
    ctx.font = 'bold 10.5px Georgia, serif';
    ctx.fillText('+ ' + (mem.gift || '—'), tipX + 10, tipY + 48);
    ctx.fillStyle = '#e0a8a8';     // red-negative for the constraint
    ctx.fillText('− ' + (mem.constraint || '—'), tipX + 10, tipY + 66);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }
}

// Render a compact ascension chip just beneath the top-right floor/minimap box.
// Only visible when the player has selected tier > 0.
function drawAscensionHUD(ctx, w, h) {
  const am = (typeof window !== 'undefined' && window.__ascensionModifiers)
    ? window.__ascensionModifiers() : {};
  // If no ascension is in effect AND no timer tracking, skip entirely.
  const hasAscension = am && Object.keys(am).length > 0;
  if (!hasAscension) return;

  // Derive tier label — we don't have direct access to the tier number here,
  // so infer from the modifier set. (Ascension.js's modifiers are cumulative,
  // so counting known keys gives us the tier.)
  const tierFlags = [
    am.enemyHpMul > 1,                   // A1+
    am.eliteFloor1,                      // A2+
    am.sanctuaryHealMul !== undefined,   // A3+
    am.bossEnrageAt !== undefined,       // A4+
    am.memoryDisabled,                   // A5+
    am.legendaryDisabled,                // A6+
    am.hiddenMapNode,                    // A7+
    am.floorTimeLimitSec !== undefined,  // A8+
    am.nonBossEssenceMul !== undefined,  // A9+
    am.finalBossEssenceMul !== undefined,// A10
  ];
  const tier = tierFlags.lastIndexOf(true) + 1;  // 0 if none
  if (tier <= 0) return;

  const roman = ['I','II','III','IV','V','VI','VII','VIII','IX','X'][tier - 1] || String(tier);

  // Position: just below the top-right floor/minimap box (which sits at y=14, h=90).
  const boxW = 156, boxH = 24;
  const bx = w - boxW - 14;
  const by = 14 + 90 + 6;                // 110px from top
  // Plate
  ctx.fillStyle = 'rgba(14, 8, 16, 0.82)';
  ctx.fillRect(bx, by, boxW, boxH);
  ctx.strokeStyle = tier >= 7 ? 'rgba(216, 90, 106, 0.7)' : 'rgba(201, 168, 106, 0.55)';
  ctx.lineWidth = 1;
  ctx.strokeRect(bx + 0.5, by + 0.5, boxW - 1, boxH - 1);
  // Left ornamental diamond
  ctx.fillStyle = tier >= 7 ? '#d85a6a' : '#c9a86a';
  ctx.save();
  ctx.translate(bx + 10, by + boxH / 2);
  ctx.rotate(Math.PI / 4);
  ctx.fillRect(-3, -3, 6, 6);
  ctx.restore();
  // Label: "ASCENSION V"
  ctx.fillStyle = tier >= 7 ? '#f4c4c8' : '#f4d9a0';
  ctx.font = 'bold 11px Georgia, serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('ASCENSION ' + roman, bx + 22, by + boxH / 2);

  // ---------------- FLOOR TIMER (A8) ----------------
  // If the tier imposes a per-floor time limit, draw the countdown right below.
  if (am.floorTimeLimitSec && typeof window.__floorStartTime === 'number') {
    const elapsed = Math.max(0, (performance.now() - window.__floorStartTime) / 1000);
    const limit = am.floorTimeLimitSec;
    const remaining = Math.max(0, limit - elapsed);
    const overrun = elapsed > limit;
    const tbx = bx;
    const tby = by + boxH + 4;
    const tbw = boxW;
    const tbh = 22;
    ctx.fillStyle = 'rgba(14, 8, 16, 0.82)';
    ctx.fillRect(tbx, tby, tbw, tbh);
    // Border + bar color depend on urgency
    const urgencyColor = overrun ? '#ff5a5a' : remaining < 30 ? '#ffaa55' : '#a89b82';
    ctx.strokeStyle = urgencyColor;
    ctx.lineWidth = 1;
    ctx.strokeRect(tbx + 0.5, tby + 0.5, tbw - 1, tbh - 1);
    // Fill bar representing time used
    const pct = Math.min(1, elapsed / limit);
    const barW = (tbw - 6) * pct;
    ctx.fillStyle = overrun ? 'rgba(255, 60, 60, 0.28)' : 'rgba(255, 170, 85, 0.14)';
    ctx.fillRect(tbx + 3, tby + 3, barW, tbh - 6);
    // Text: "4:32 / 6:00"  or  "OVERRUN +0:23"
    const fmt = (s) => {
      const m = Math.floor(s / 60);
      const sc = Math.floor(s % 60).toString().padStart(2, '0');
      return m + ':' + sc;
    };
    const text = overrun
      ? ('OVERRUN +' + fmt(elapsed - limit))
      : (fmt(elapsed) + ' / ' + fmt(limit));
    ctx.fillStyle = urgencyColor;
    ctx.font = 'bold 10px Georgia, serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, tbx + tbw - 8, tby + tbh / 2);
    // Icon (clock-like diamond)
    ctx.fillStyle = urgencyColor;
    ctx.save();
    ctx.translate(tbx + 10, tby + tbh / 2);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-3, -3, 6, 6);
    ctx.restore();
  }

  // ---------------- ACTIVE RULES STRIP (A6+ abbreviated) ----------------
  // A compact second line below that lists any silently-punishing rules the
  // player should remember: legendary off, memory off, hidden nodes, boss-
  // only essence. Keeps it one-line to avoid HUD clutter.
  const activeRules = [];
  if (am.legendaryDisabled)       activeRules.push('no legendaries');
  if (am.memoryDisabled)          activeRules.push('memory null');
  if (am.hiddenMapNode)           activeRules.push('hidden paths');
  if (am.nonBossEssenceMul === 0) activeRules.push('boss-only essence');
  else if (am.nonBossEssenceMul < 1 && am.nonBossEssenceMul !== undefined) activeRules.push('essence ×0.4');
  if (activeRules.length > 0) {
    const timerOffset = am.floorTimeLimitSec ? 32 : 6;
    const rx = bx;
    const ry = by + boxH + timerOffset;
    ctx.fillStyle = 'rgba(168, 155, 130, 0.85)';
    ctx.font = 'italic 9px Georgia, serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText(activeRules.join(' · '), rx + boxW - 2, ry);
  }
}

// wrapText now lives in src/textLayout.js — see the import at the top of
// this file. Removed the local copy as part of the dedupe pass.

function hudHexToRgba(hex, a) {
  if (!hex) return 'rgba(255,255,255,' + a + ')';
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  const n = parseInt(hex, 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
}

// Pixel heart pattern — 10x10 grid, scaled up for crisp chunky look
const HEART_PATTERN = [
  '..XX..XX..',
  '.XOOXXOOX.',
  'XOOOOOOOOX',
  'XOOOOOOOOX',
  'XOOOOOOOOX',
  '.XOOOOOOX.',
  '..XOOOOOX.',
  '...XOOOX..',
  '....XOX...',
  '.....X....',
];
// Colors:
//   X = outline (dark)
//   O = body (red for filled, muted purple for empty)
//   . = transparent

function drawHeart(ctx, x, y, s, filled, isLowHP = false) {
  // Pulse color on low HP
  const baseColor = filled
    ? (isLowHP ? `hsl(${355 + Math.sin(performance.now() / 150) * 5}, 75%, ${55 + Math.sin(performance.now() / 180) * 10}%)` : '#d8556a')
    : 'rgba(50, 32, 48, 0.8)';
  const outline = filled ? '#1a0818' : 'rgba(20, 14, 24, 0.9)';
  const highlight = filled ? 'rgba(255, 200, 210, 0.7)' : 'rgba(100, 80, 100, 0.4)';
  const pixel = s / 10;
  for (let py = 0; py < 10; py++) {
    for (let px = 0; px < 10; px++) {
      const ch = HEART_PATTERN[py][px];
      if (ch === '.') continue;
      if (ch === 'X') ctx.fillStyle = outline;
      else             ctx.fillStyle = baseColor;
      ctx.fillRect(x + px * pixel, y + py * pixel, pixel + 0.5, pixel + 0.5);
    }
  }
  // Highlight glint on top-left for filled hearts
  if (filled) {
    ctx.fillStyle = highlight;
    ctx.fillRect(x + 2 * pixel, y + 2 * pixel, pixel, pixel);
    ctx.fillRect(x + 3 * pixel, y + 1 * pixel, pixel, pixel);
  }
}

// ============================================================================
// DUNGEON MINIMAP — 2D layout of the connected room graph
//
// Renders the floor's DAG as a top-down floor plan: rooms are tiles laid
// out by (layer, indexInLayer) with door-connection lines drawn between
// connected nodes. The current room highlights with a pulsing ring;
// visited rooms fill in; rooms one step away from the current node show
// as outlines (you've seen the door, not the room); far rooms hide.
//
// This is the Hades / Binding-of-Isaac feel — every room you walk through
// expands the map, so the player builds up a mental model of the dungeon
// as a real layout instead of clicking nodes on a tree.
// ============================================================================
const KIND_FILL = {
  start:     '#5a4028',
  combat:    '#8a4848',
  altar:     '#9a3a70',
  challenge: '#b07038',
  reward:    '#3a8060',
  sanctuary: '#3a8060',
  boss:      '#b03838',
  event:     '#6050a0',
  trove:     '#b08040',
  elite:     '#c04040',
};

// Exported for the death screen / win screen — those reveal the full
// dungeon map as a "look at the journey you survived" beat.
export function drawDungeonMinimap(ctx, bx, by, boxW, boxH, graph, currentNodeId) {
  const padTop = 36;        // below the FLOOR header
  const padBottom = 14;
  const padX = 16;
  const mapX = bx + padX;
  const mapY = by + padTop;
  const mapW = boxW - padX * 2;
  const mapH = boxH - padTop - padBottom;

  // Group nodes by layer to compute layout
  const layers = {};
  for (const n of graph.nodes) {
    (layers[n.layer] = layers[n.layer] || []).push(n);
  }
  const maxLayer = graph.maxLayer || 0;
  const layerCount = maxLayer + 1;
  // VERTICAL: layer 0 (start) at BOTTOM, max (boss) at TOP — matches
  // dungeon-descent intuition (you go DOWN the dungeon physically, so the
  // boss is "deepest" but visually rendered at top because we're looking
  // at it from outside-in).
  const layerGap = layerCount > 1 ? mapH / (layerCount - 1) : 0;

  // Compute screen positions for each node
  const pos = new Map();
  for (const layerStr of Object.keys(layers)) {
    const layer = parseInt(layerStr, 10);
    const nodesInLayer = layers[layer];
    const count = nodesInLayer.length;
    const yPx = mapY + mapH - layer * layerGap;          // 0 = bottom
    const spread = Math.min(mapW * 0.85, mapW - 12);
    const startX = mapX + mapW / 2 - spread / 2;
    const stepX = count > 1 ? spread / (count - 1) : 0;
    nodesInLayer.forEach((n, i) => {
      const xPx = count === 1 ? mapX + mapW / 2 : startX + i * stepX;
      pos.set(n.id, { x: xPx, y: yPx });
    });
  }

  // Determine which nodes the player has SEEN — visited or one step
  // away from a visited node (they've seen its door).
  const seen = new Set();
  for (const n of graph.nodes) {
    if (n.visited || n.id === currentNodeId) {
      seen.add(n.id);
      // Show neighbors of visited/current too
      if (n.edges) for (const eid of n.edges) seen.add(eid);
    }
  }

  // ── Pass 1: connection lines ──────────────────────────────────────────
  // Draw lines between connected nodes. Lines from visited→visited are
  // bright (the path you took); visited→unvisited dim (door you saw).
  for (const n of graph.nodes) {
    if (!n.edges || !pos.has(n.id)) continue;
    const a = pos.get(n.id);
    const aSeen = seen.has(n.id);
    for (const eid of n.edges) {
      if (!pos.has(eid)) continue;
      const b = pos.get(eid);
      const bSeen = seen.has(eid);
      if (!aSeen && !bSeen) continue;
      const taken = (n.visited || n.id === currentNodeId)
        && (graph.nodes.find(x => x.id === eid)?.visited || eid === currentNodeId);
      ctx.strokeStyle = taken
        ? 'rgba(244, 217, 160, 0.85)'
        : 'rgba(160, 140, 110, 0.35)';
      ctx.lineWidth = taken ? 1.6 : 1.0;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }

  // ── Pass 2: room tiles ─────────────────────────────────────────────────
  const cellSize = 14;
  const half = cellSize / 2;
  for (const n of graph.nodes) {
    if (!seen.has(n.id) && !n.visited && n.id !== currentNodeId) continue;
    const p = pos.get(n.id);
    if (!p) continue;
    const fill = KIND_FILL[n.kind] || '#505060';
    const isCurrent = n.id === currentNodeId;
    const isVisited = !!n.visited;

    // Outer outline (always drawn)
    ctx.fillStyle = 'rgba(20, 14, 18, 0.95)';
    ctx.fillRect(p.x - half - 1, p.y - half - 1, cellSize + 2, cellSize + 2);

    if (isCurrent) {
      // Filled with kind color + pulsing gold ring
      ctx.fillStyle = fill;
      ctx.fillRect(p.x - half, p.y - half, cellSize, cellSize);
      const pulse = 0.7 + 0.3 * Math.sin(performance.now() / 240);
      ctx.strokeStyle = 'rgba(244, 217, 160, ' + pulse.toFixed(3) + ')';
      ctx.lineWidth = 2;
      ctx.strokeRect(p.x - half - 2.5, p.y - half - 2.5, cellSize + 5, cellSize + 5);
    } else if (isVisited) {
      // Filled at lower opacity
      ctx.fillStyle = fill;
      ctx.globalAlpha = 0.7;
      ctx.fillRect(p.x - half, p.y - half, cellSize, cellSize);
      ctx.globalAlpha = 1;
    } else {
      // Unseen-but-adjacent — outline only
      ctx.strokeStyle = 'rgba(160, 140, 110, 0.65)';
      ctx.lineWidth = 1;
      ctx.strokeRect(p.x - half + 0.5, p.y - half + 0.5, cellSize - 1, cellSize - 1);
    }

    // Tiny kind glyph centered in tile (only if visited or current)
    if (isVisited || isCurrent) {
      drawTinyKindGlyph(ctx, p.x, p.y, n.kind, isCurrent ? '#fff2e0' : 'rgba(255, 230, 200, 0.65)');
    } else {
      // Question mark placeholder for unseen neighbors
      ctx.fillStyle = 'rgba(180, 160, 130, 0.55)';
      ctx.font = 'bold 9px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('?', p.x, p.y + 0.5);
    }
  }
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

// Tiny pixel glyphs — readable at 14px tile size
function drawTinyKindGlyph(ctx, cx, cy, kind, color) {
  ctx.fillStyle = color;
  if (kind === 'combat') {
    ctx.fillRect(cx - 3, cy - 0.5, 6, 1);          // crossed blades
    ctx.fillRect(cx - 0.5, cy - 3, 1, 6);
  } else if (kind === 'elite') {
    // Elite — diamond with center dot
    ctx.fillRect(cx - 0.5, cy - 3, 1, 6);
    ctx.fillRect(cx - 3, cy - 0.5, 6, 1);
    ctx.fillRect(cx - 1.5, cy - 1.5, 3, 3);
  } else if (kind === 'boss') {
    // Crown — 3-bar
    ctx.fillRect(cx - 3, cy + 1, 6, 1);
    ctx.fillRect(cx - 3, cy - 2, 1, 3);
    ctx.fillRect(cx, cy - 3, 1, 4);
    ctx.fillRect(cx + 2, cy - 2, 1, 3);
  } else if (kind === 'reward' || kind === 'sanctuary') {
    // Plus — sanctuary cross
    ctx.fillRect(cx - 0.5, cy - 2.5, 1, 5);
    ctx.fillRect(cx - 2.5, cy - 0.5, 5, 1);
  } else if (kind === 'altar') {
    ctx.fillRect(cx - 2, cy - 0.5, 4, 1);
    ctx.fillRect(cx - 0.5, cy - 2, 1, 4);
  } else if (kind === 'challenge' || kind === 'event') {
    // Sparkle — diamond
    ctx.fillRect(cx - 0.5, cy - 3, 1, 6);
    ctx.fillRect(cx - 3, cy - 0.5, 6, 1);
  } else if (kind === 'trove') {
    ctx.fillRect(cx - 2, cy - 2, 4, 4);
  } else if (kind === 'start') {
    // Diamond outline-ish
    ctx.fillRect(cx - 0.5, cy - 2, 1, 4);
    ctx.fillRect(cx - 2, cy - 0.5, 4, 1);
  }
}

