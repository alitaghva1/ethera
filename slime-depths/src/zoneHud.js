// ============================================================================
// ZONE HUD — top-of-screen banner showing the current wave or boss state.
//
// Renders only when a zone run is active (zoneRunner.zoneName is set).
// Suppressed during the level-up modal (which has its own backdrop).
//
// Layout:
//   [ZONE NAME · WAVE 2 / 3]                           top-center, small
//   "BOSS APPROACHES"                                   when STATE_BOSS_PEND
//   "▣ ▣ ▣ BOSS"                                        when STATE_BOSS_ACTIVE
//
// The wave dots get filled as waves clear (visual progress indicator).
// ============================================================================

import { getZoneRunnerState, ZONE_RUNNER_STATES } from './zoneRunner.js';
import { getZoneEncounters } from './zoneEncounters.js';

const ZONE_LABELS = {
  ruins:    'ANCIENT RUINS',
  cemetery: 'CEMETERY',
  crypt:    'THE CRYPT',
  mountain: 'DEPTHS OF THE MOUNTAIN',
  volcano:  'VOLCANO',
};

const BOSS_LABELS = {
  orc:           'GRUDNOK',
  bone_captain:  'IRON REVENANT',
  broodmother:   'THE BROODMOTHER',
  ember_tyrant:  'EMBER TYRANT',
};

export function drawZoneHud(ctx, viewW) {
  const s = getZoneRunnerState();
  if (!s.zoneName) return;
  const enc = getZoneEncounters(s.zoneName);
  if (!enc) return;

  const cx = viewW / 2;
  const y = 22;             // just below the XP bar (which lives at y=6, h=8 + 12px label)

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  const zoneLabel = ZONE_LABELS[s.zoneName] || s.zoneName.toUpperCase();

  // BOSS states get a different banner.
  if (s.state === ZONE_RUNNER_STATES.BOSS_PEND) {
    // Pulsing "BOSS APPROACHES" — the dramatic 2.2s pause.
    const t = (performance.now() / 1000);
    const pulse = 0.5 + 0.5 * Math.sin(t * 4);
    ctx.fillStyle = `rgba(255, 100, 110, ${0.7 + 0.3 * pulse})`;
    ctx.font = 'bold 18px Georgia,serif';
    ctx.shadowColor = 'rgba(120, 20, 40, 0.7)';
    ctx.shadowBlur = 14;
    ctx.fillText('BOSS APPROACHES', cx, y + 22);
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(220, 200, 160, 0.7)';
    ctx.font = 'bold 10px Georgia,serif';
    ctx.fillText(zoneLabel, cx, y);
    ctx.restore();
    return;
  }

  if (s.state === ZONE_RUNNER_STATES.BOSS_ACTIVE) {
    // Phase 4 — `bossLabel` on the zone config wins over the per-bossType
    // default. Lets two zones share a sprite (e.g. cemetery + crypt both
    // use bone_captain) while showing distinct in-fiction names.
    const bossLabel = enc.bossLabel || BOSS_LABELS[enc.bossType] || enc.bossType.toUpperCase();
    ctx.fillStyle = '#ff8a90';
    ctx.font = 'bold 16px Georgia,serif';
    ctx.shadowColor = 'rgba(120, 20, 40, 0.6)';
    ctx.shadowBlur = 8;
    ctx.fillText(bossLabel, cx, y + 18);
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(220, 200, 160, 0.7)';
    ctx.font = 'bold 10px Georgia,serif';
    ctx.fillText(zoneLabel, cx, y);
    ctx.restore();
    return;
  }

  if (s.state === ZONE_RUNNER_STATES.COMPLETE) {
    ctx.fillStyle = '#ffd070';
    ctx.font = 'bold 14px Georgia,serif';
    ctx.fillText('CLEARED', cx, y + 4);
    ctx.fillStyle = 'rgba(220, 200, 160, 0.55)';
    ctx.font = '11px Georgia,serif';
    ctx.fillText('step into the portal', cx, y + 22);
    ctx.restore();
    return;
  }

  // Default: zone name + wave indicator (3 dots).
  ctx.fillStyle = 'rgba(245, 220, 170, 0.85)';
  ctx.font = 'bold 11px Georgia,serif';
  ctx.fillText(zoneLabel, cx, y);

  // Wave dots — one per wave, filled if cleared, current pulses.
  const waveCount = s.waveCount;
  const dotR = 4;
  const dotGap = 14;
  const totalW = waveCount * dotGap;
  const dotsX = cx - (totalW - dotGap) / 2;
  const dotsY = y + 18;
  const t = performance.now() / 1000;

  for (let i = 0; i < waveCount; i++) {
    const dx = dotsX + i * dotGap;
    let fill;
    if (i < s.waveIdx
        || (i === s.waveIdx && (s.state === ZONE_RUNNER_STATES.WAVE_CLEAR
                                 || s.state === ZONE_RUNNER_STATES.BOSS_PEND))) {
      fill = '#a0e8a0';
    } else if (i === s.waveIdx && s.state === ZONE_RUNNER_STATES.WAVE_ACTIVE) {
      const pulse = 0.65 + 0.35 * Math.sin(t * 3);
      fill = `rgba(255, 200, 130, ${pulse})`;
    } else {
      fill = 'rgba(120, 110, 90, 0.55)';
    }
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(dx, dotsY, dotR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 230, 180, 0.4)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // "WAVE N / 3" subtitle on the right of the dots
  ctx.fillStyle = 'rgba(200, 180, 140, 0.65)';
  ctx.font = 'bold 9px Georgia,serif';
  ctx.fillText(
    `WAVE ${Math.min(waveCount, s.waveIdx + 1)} / ${waveCount}`,
    cx, dotsY + 12,
  );
  ctx.restore();
}
