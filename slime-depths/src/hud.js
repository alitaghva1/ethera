// HUD — health hearts, room progress, relic icons
import { hero } from './hero.js';
import { enemies } from './enemies.js';
import { images } from './loader.js';
import { mouse } from './input.js';
import { activeFusions } from './fusions.js';
import { drawnCards, isTarotRun } from './tarot.js';
import { gold } from './gold.js';
import { drawRelicIcon } from './fx.js';
import { THEMES, getThemeCounts, getThemeTier, TIER_THRESHOLDS } from './themes.js';

function toRoman(n) {
  return n === 1 ? 'I' : n === 2 ? 'II' : n === 3 ? 'III' : n === 4 ? 'IV' : n === 5 ? 'V' : String(n);
}

// Heart animation state (mutable, updated by updateHudAnims + trigger helpers)
let heartShakeTime = 0;
let heartSparkleTime = 0;
let lastSeenHp = -1;

export function updateHudAnims(dt) {
  if (heartShakeTime > 0) heartShakeTime -= dt;
  if (heartSparkleTime > 0) heartSparkleTime -= dt;
  // Detect HP changes: damage → shake, heal → sparkle
  if (lastSeenHp >= 0 && hero.hp !== lastSeenHp) {
    if (hero.hp < lastSeenHp) heartShakeTime = 0.3;
    else if (hero.hp > lastSeenHp) heartSparkleTime = 0.6;
  }
  lastSeenHp = hero.hp;
}

const ROOM_LABEL = {
  start:     'ENTRANCE',
  combat:    'COMBAT',
  reward:    'SANCTUARY',
  boss:      'BOSS',
  altar:     'ALTAR OF EXCHANGE',
  challenge: 'CHALLENGE',
  trove:     'TROVE',
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

  // DAMAGE-SOURCE ARROW — brief red chevron on screen edge pointing to whatever
  // just hit the hero. Fades over 1s. Critical for off-screen threats.
  // Suppressed during cinematic intros (progress.introActive) so it doesn't
  // sit on top of the boss portrait frame.
  const hitT = (typeof window !== 'undefined' && window.__gameMetrics.lastHitTime) ? (performance.now() - window.__gameMetrics.lastHitTime) / 1000 : Infinity;
  if (!progress.introActive && hitT < 1.0 && window.__gameMetrics.lastHitFromX !== undefined) {
    const dx = window.__gameMetrics.lastHitFromX - hero.x;
    const dy = window.__gameMetrics.lastHitFromY - hero.y;
    const mag = Math.hypot(dx, dy);
    if (mag > 1) {
      const nx = dx / mag, ny = dy / mag;
      // Alpha fades quartic over lifetime
      const fadeT = Math.max(0, 1 - hitT);
      const alpha = fadeT * fadeT;
      // Place on edge — 130px in from edge, at angle toward threat
      const radius = Math.min(w, h) * 0.35;
      const cx = w / 2 + nx * radius;
      const cy = h / 2 + ny * radius;
      const ang = Math.atan2(ny, nx);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(cx, cy);
      ctx.rotate(ang);
      // Red chevron (2 triangles)
      ctx.fillStyle = '#ff4a4a';
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.lineWidth = 2;
      const sz = 18;
      ctx.beginPath();
      ctx.moveTo(-sz, -sz);
      ctx.lineTo(sz, 0);
      ctx.lineTo(-sz, sz);
      ctx.lineTo(-sz * 0.4, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  // â”€â”€ LEFT-TOP HUD PANEL â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Contains: hearts (compact), dodge pip, dash-strike pip.
  // Layout is deterministic based on maxHp, so pips always sit below hearts
  // with a clear gap and never overlap.
  const pad = 18;
  // Smaller hearts (17px) with perRow=14 fits up to 14 HP in one row.
  // At 14+ hp the second row begins; we cap HP visual to 2 rows max.
  const sz = 17;
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

  // Ability pips row — always placed below the LAST heart row with 14px clear gap
  const abilitiesY = pad + heartRows * heartRowH + 14;
  const pipW = 66;
  const pipH = 7;
  const pipGap = 6;
  const labelInlineX = pad + pipW + 8;
  ctx.save();

  // DODGE pip
  const dodgeCDMax = 0.6 * (hero.dodgeCooldownMul || 1);
  const dodgeCD = hero.dodgeCooldown || 0;
  const dodgeReady = dodgeCD <= 0;
  const dodgeRowY = abilitiesY;
  // Backdrop
  ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
  ctx.fillRect(pad, dodgeRowY, pipW, pipH);
  if (dodgeReady) {
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
  ctx.fillStyle = dodgeReady ? 'rgba(200, 230, 255, 0.9)' : 'rgba(160, 190, 220, 0.5)';
  ctx.font = 'italic bold 10px Georgia, serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('SPACE \u00b7 DODGE', labelInlineX, dodgeRowY + pipH / 2);

  // DASH STRIKE (Q) pip — one row below
  const dashCDMax = 5.0;
  const dashCD = hero.dashStrikeCD || 0;
  const dashReady = dashCD <= 0;
  const dashRowY = dodgeRowY + pipH + pipGap;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
  ctx.fillRect(pad, dashRowY, pipW, pipH);
  if (dashReady) {
    const glowPulse = 0.7 + 0.3 * Math.sin(performance.now() / 280);
    ctx.fillStyle = `rgba(255, 210, 120, ${glowPulse.toFixed(3)})`;
    ctx.fillRect(pad + 1, dashRowY + 1, pipW - 2, pipH - 2);
  } else {
    const frac = 1 - (dashCD / dashCDMax);
    ctx.fillStyle = 'rgba(180, 140, 80, 0.85)';
    ctx.fillRect(pad + 1, dashRowY + 1, (pipW - 2) * frac, pipH - 2);
  }
  ctx.strokeStyle = 'rgba(240, 200, 140, 0.55)';
  ctx.lineWidth = 1;
  ctx.strokeRect(pad + 0.5, dashRowY + 0.5, pipW - 1, pipH - 1);
  ctx.fillStyle = dashReady ? 'rgba(255, 225, 170, 0.9)' : 'rgba(200, 170, 130, 0.5)';
  ctx.font = 'italic bold 10px Georgia, serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('Q \u00b7 DASH STRIKE', labelInlineX, dashRowY + pipH / 2);
  ctx.restore();
  // Expose the bottom of the dash row so the gold counter (further down in
  // this draw pass) can anchor beneath it with a proper margin.
  const abilitiesEndY = dashRowY + pipH;

  // Top-right panel — floor + room progress with a refined layout
  const label = ROOM_LABEL[progress.roomKind] || '';
  const roomIdx = progress.roomIndex ?? 0;
  const total = progress.totalRooms ?? 1;
  const floorText = progress.floorLevel ? ('FLOOR ' + toRoman(progress.floorLevel) + ' / ' + toRoman(progress.maxFloors || 4)) : '';
  const boxW = 240, boxH = 90;
  const bx = w - boxW - 14;
  const by = 14;
  // Backdrop with gold border accent
  ctx.fillStyle = 'rgba(14, 8, 16, 0.72)';
  ctx.fillRect(bx, by, boxW, boxH);
  ctx.strokeStyle = 'rgba(201, 168, 106, 0.35)';
  ctx.lineWidth = 1;
  ctx.strokeRect(bx + 0.5, by + 0.5, boxW - 1, boxH - 1);
  // Top gold accent line
  ctx.strokeStyle = 'rgba(244, 217, 160, 0.5)';
  ctx.beginPath();
  ctx.moveTo(bx + 12, by + 26);
  ctx.lineTo(bx + boxW - 12, by + 26);
  ctx.stroke();
  // FLOOR
  ctx.fillStyle = '#f4d9a0';
  ctx.font = 'bold 14px Georgia, serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.fillText(floorText, bx + boxW - 12, by + 8);
  // Minimap — small room cells with kind-specific icons and connector lines
  const miniY = by + 36;
  const cellW = 16;
  const cellH = 11;
  const cellGap = 4;
  const totalW = total * cellW + (total - 1) * cellGap;
  const miniStartX = bx + boxW - 12 - totalW;
  const rooms = progress.floorRooms || [];
  for (let i = 0; i < total; i++) {
    const dx = miniStartX + i * (cellW + cellGap);
    const room = rooms[i];
    const kind = room ? room.kind : 'combat';
    // Connector line to next cell (except last)
    if (i < total - 1) {
      const past = i < roomIdx;
      ctx.strokeStyle = past ? 'rgba(201, 168, 106, 0.7)' : 'rgba(201, 168, 106, 0.22)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(dx + cellW, miniY + cellH / 2);
      ctx.lineTo(dx + cellW + cellGap, miniY + cellH / 2);
      ctx.stroke();
    }
    // Cell color per kind
    const kindColor = {
      start:     '#5a4028',
      combat:    '#a06060',
      altar:     '#b04880',
      challenge: '#c08048',
      reward:    '#4a9070',
      boss:      '#c04848',
      event:     '#7060b0',
      trove:     '#c09050',
    }[kind] || '#505060';
    // Room state: past (filled dim) / current (bright + pulse) / future (outline)
    if (i < roomIdx) {
      ctx.fillStyle = 'rgba(60, 50, 45, 0.85)';
      ctx.fillRect(dx, miniY, cellW, cellH);
      ctx.fillStyle = kindColor;
      ctx.globalAlpha = 0.5;
      ctx.fillRect(dx + 1, miniY + 1, cellW - 2, cellH - 2);
      ctx.globalAlpha = 1;
    } else if (i === roomIdx) {
      const pulse = 0.85 + 0.15 * Math.sin(performance.now() / 280);
      ctx.fillStyle = 'rgba(20, 14, 18, 0.95)';
      ctx.fillRect(dx, miniY, cellW, cellH);
      ctx.fillStyle = kindColor;
      ctx.fillRect(dx + 1, miniY + 1, cellW - 2, cellH - 2);
      // Bright ring
      ctx.strokeStyle = `rgba(244, 217, 160, ${pulse.toFixed(3)})`;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(dx - 1.5, miniY - 1.5, cellW + 3, cellH + 3);
    } else {
      ctx.strokeStyle = 'rgba(160, 140, 110, 0.35)';
      ctx.lineWidth = 1;
      ctx.strokeRect(dx + 0.5, miniY + 0.5, cellW - 1, cellH - 1);
    }
    // Icon glyph per kind (tiny, centered)
    if (i <= roomIdx) {
      ctx.fillStyle = i === roomIdx ? '#fff2e0' : 'rgba(255, 230, 200, 0.45)';
      const cx = dx + cellW / 2, cy = miniY + cellH / 2;
      if (kind === 'combat') {
        // Crossed blades (2px cross)
        ctx.fillRect(cx - 3, cy - 0.5, 6, 1);
        ctx.fillRect(cx - 0.5, cy - 3, 1, 6);
      } else if (kind === 'boss') {
        // Skull — 3-pixel bulge
        ctx.fillRect(cx - 2, cy - 2, 4, 3);
        ctx.fillRect(cx - 1, cy + 1, 2, 1);
      } else if (kind === 'reward') {
        // Heart — 3 pixels
        ctx.fillRect(cx - 2, cy - 1, 2, 2);
        ctx.fillRect(cx, cy - 1, 2, 2);
        ctx.fillRect(cx - 1, cy + 1, 2, 1);
      } else if (kind === 'altar') {
        // Diamond
        ctx.fillRect(cx - 0.5, cy - 2, 1, 4);
        ctx.fillRect(cx - 2, cy - 0.5, 4, 1);
      } else if (kind === 'challenge') {
        // Exclamation
        ctx.fillRect(cx - 0.5, cy - 2, 1, 3);
        ctx.fillRect(cx - 0.5, cy + 1, 1, 1);
      } else if (kind === 'event') {
        ctx.fillRect(cx - 1, cy - 1, 2, 2);
      } else if (kind === 'trove') {
        // Coin — circle-ish with dot in center
        ctx.fillRect(cx - 2, cy - 2, 4, 4);
        ctx.fillRect(cx - 3, cy - 1, 1, 2);
        ctx.fillRect(cx + 2, cy - 1, 1, 2);
      }
    }
  }
  // Room kind label
  ctx.font = '13px Georgia, serif';
  ctx.fillStyle =
    progress.roomKind === 'boss'      ? '#ff9085' :
    progress.roomKind === 'reward'    ? '#86e3a8' :
    progress.roomKind === 'altar'     ? '#ff6a85' :
    progress.roomKind === 'challenge' ? '#ffb265' :
    'rgba(210, 190, 220, 0.85)';
  ctx.fillText(label, bx + boxW - 12, by + 56);
  // Enemies left (combat only)
  if (progress.roomKind === 'combat' || progress.roomKind === 'boss' || progress.roomKind === 'challenge') {
    ctx.fillStyle = 'rgba(220, 180, 180, 0.7)';
    ctx.font = 'italic 11px Georgia, serif';
    ctx.fillText(enemies.length + ' enemies remain', bx + boxW - 12, by + 74);
  }
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

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
      ctx.font = 'bold 11px system-ui, sans-serif';
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

  // THEMES row — shows set-bonus progress across the 5 themes. Chips light
  // up when a theme has ≥1 owned relic; glow at resonance (3), double-glow
  // at ascendance (5). Sits above the fusion row + relic strip.
  if (progress.relics && progress.relics.length > 0) {
    const themeCounts = getThemeCounts(progress.relics);
    const visibleThemes = Object.values(THEMES).filter(t => themeCounts[t.id] > 0);
    if (visibleThemes.length > 0) {
      const chipW = 52, chipH = 22, chipGap = 4;
      const themesY = h - chipH - 110;
      const themesLabelY = themesY - 14;
      ctx.save();
      ctx.fillStyle = 'rgba(180, 200, 220, 0.55)';
      ctx.font = 'bold 9px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('◆ THEMES', 18, themesLabelY);
      const now = performance.now() / 1000;
      for (let i = 0; i < visibleThemes.length; i++) {
        const t = visibleThemes[i];
        const count = themeCounts[t.id];
        const tier = getThemeTier(count);
        const cx = 18 + i * (chipW + chipGap);
        const cy = themesY;
        // Backdrop dims with tier
        const bgA = tier >= 2 ? 0.9 : tier >= 1 ? 0.8 : 0.65;
        ctx.fillStyle = `rgba(12, 10, 18, ${bgA})`;
        ctx.fillRect(cx, cy, chipW, chipH);
        // Tier glow halo behind chip (ascendance pulses stronger)
        if (tier >= 1) {
          const pulse = tier >= 2 ? 0.7 + 0.3 * Math.sin(now * 2.2 + i * 0.6) : 0.6 + 0.2 * Math.sin(now * 1.6 + i * 0.4);
          const halo = ctx.createRadialGradient(cx + chipW/2, cy + chipH/2, 4, cx + chipW/2, cy + chipH/2, chipW * 0.7);
          const hex = t.color.replace('#', '');
          const n = parseInt(hex.length === 3 ? hex.split('').map(c => c + c).join('') : hex, 16);
          const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
          const alpha = (tier >= 2 ? 0.5 : 0.3) * pulse;
          halo.addColorStop(0, `rgba(${r},${g},${b},${alpha.toFixed(3)})`);
          halo.addColorStop(1, `rgba(${r},${g},${b},0)`);
          ctx.fillStyle = halo;
          ctx.fillRect(cx - 8, cy - 8, chipW + 16, chipH + 16);
        }
        // Border — brighter + thicker at higher tiers
        ctx.strokeStyle = tier >= 2 ? t.tint : tier >= 1 ? t.color : 'rgba(120, 130, 150, 0.5)';
        ctx.lineWidth = tier >= 2 ? 1.8 : tier >= 1 ? 1.3 : 1;
        ctx.strokeRect(cx + 0.5, cy + 0.5, chipW - 1, chipH - 1);
        // Theme name
        ctx.fillStyle = tier >= 1 ? t.tint : 'rgba(160, 170, 185, 0.75)';
        ctx.font = 'bold 9px system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(t.name.toUpperCase(), cx + 5, cy + 4);
        // Count + tier glyphs
        ctx.fillStyle = tier >= 1 ? '#ffffff' : 'rgba(200, 210, 220, 0.7)';
        ctx.font = 'bold 10px system-ui, sans-serif';
        const glyph = tier >= 2 ? '\u2605\u2605' : tier >= 1 ? '\u2605' : '';
        const countLabel = `${count}/${TIER_THRESHOLDS.ascendance} ${glyph}`;
        ctx.fillText(countLabel, cx + 5, cy + 12);
        // Hover tooltip — name + blurb + current buff text
        if (mouse.x >= cx && mouse.x <= cx + chipW && mouse.y >= cy && mouse.y <= cy + chipH) {
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
          ctx.fillText(t.name + '  (' + count + '/' + TIER_THRESHOLDS.ascendance + ')', tipX + 10, tipY + 8);
          ctx.fillStyle = '#d8e4f0';
          ctx.font = 'italic 10px Georgia, serif';
          ctx.fillText(t.blurb, tipX + 10, tipY + 25);
          ctx.fillStyle = tier >= 1 ? '#fff2e0' : 'rgba(200, 200, 210, 0.6)';
          ctx.font = 'bold 10px system-ui, sans-serif';
          const tierLabel = tier >= 2 ? '★★ ASCENDANCE active' : tier >= 1 ? '★ RESONANCE active' : `${TIER_THRESHOLDS.resonance - count} more → Resonance`;
          ctx.fillText(tierLabel, tipX + 10, tipY + 54);
        }
      }
      ctx.restore();
    }
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
    ctx.font = 'bold 9px system-ui, sans-serif';
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
        ctx.font = 'bold 9px system-ui, sans-serif';
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
    const icSize = 30;
    const gap = 4;
    const y0 = h - icSize - 18;
    // Frame backdrop
    const frameW = progress.relics.length * (icSize + gap) + 8;
    ctx.fillStyle = 'rgba(14, 8, 16, 0.7)';
    ctx.fillRect(12, y0 - 4, frameW, icSize + 8);
    ctx.strokeStyle = 'rgba(201, 168, 106, 0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(12.5, y0 - 3.5, frameW - 1, icSize + 7);
    const now = performance.now() / 1000;
    for (let i = 0; i < progress.relics.length; i++) {
      const r = progress.relics[i];
      const x = 16 + i * (icSize + gap);
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
    ctx.font = 'bold 9px system-ui, sans-serif';
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
  // ASCENSION FEEDBACK HUD — Session A polish pass.
  // Shows the active ascension tier + any rules currently pressing on the run
  // (floor timer, legendary-disabled, memory-disabled, hidden map nodes, etc.)
  // so the player always knows why their run is harder.
  // ==========================================================================
  drawAscensionHUD(ctx, w, h);
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

// Simple word-wrap helper for tooltip descriptions
function wrapText(ctx, text, maxWidth) {
  const words = String(text).split(' ');
  const lines = [];
  let cur = '';
  for (const word of words) {
    const test = cur ? cur + ' ' + word : word;
    if (ctx.measureText(test).width > maxWidth && cur) {
      lines.push(cur);
      cur = word;
    } else {
      cur = test;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

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
