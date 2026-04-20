// ============================================================
//  WAVE PORTAL — Hades-style "proceed" door between waves
// ============================================================
//
//  During the cleared phase, a glowing portal appears a few tiles
//  from the player. Its icon previews the next wave:
//    - skull     → boss wave
//    - bow       → ranged-heavy wave
//    - sword     → melee-heavy wave (default)
//
//  Walking into the portal (<1.2 tiles) skips the remainder of the
//  cleared timer and starts the next wave immediately. If the player
//  ignores it, the normal timer still auto-triggers beginNextWave.
//
//  Hooks:
//    - enemies.js wave-cleared path (normal + boss) → spawnWavePortal
//    - enemies.js beginNextWave / zone exit         → clearWavePortal
//    - gameloop.js per-frame tick                   → updateWavePortal
//    - gameloop.js render (above world, below UI)   → drawWavePortal
//
// ============================================================

const wavePortal = {
    active: false,
    row: 0,
    col: 0,
    spawnTime: 0,       // fade-in timer (0.5s from spawn)
    lifeTimer: 0,       // total life (for pulsing)
    iconType: 'sword',  // 'skull' | 'bow' | 'sword'
    nextWaveNum: 0,
    nextWaveTotal: 0,
    needsRelic: false,  // gate: portal dim until relic drops are picked up
    _triggered: false,
};

function spawnWavePortal(nextWaveIdx, needsRelic) {
    if (typeof player === 'undefined') return;

    // Determine icon based on next wave composition
    let icon = 'sword';
    let totalWaves = 0;
    let waveDef = null;
    try {
        const arrMap = {
            1: typeof WAVES !== 'undefined' ? WAVES : null,
            2: typeof ZONE2_WAVES !== 'undefined' ? ZONE2_WAVES : null,
            3: typeof ZONE3_WAVES !== 'undefined' ? ZONE3_WAVES : null,
            4: typeof ZONE4_WAVES !== 'undefined' ? ZONE4_WAVES : null,
            5: typeof ZONE5_WAVES !== 'undefined' ? ZONE5_WAVES : null,
            6: typeof ZONE6_WAVES !== 'undefined' ? ZONE6_WAVES : null,
        };
        const arr = arrMap[currentZone];
        if (arr && arr.length > 0) totalWaves = arr.length;
        if (arr && nextWaveIdx >= 0 && nextWaveIdx < arr.length) waveDef = arr[nextWaveIdx];
    } catch (e) { /* fall through */ }

    // Composition details surfaced below the main icon so players can plan builds
    // between waves (e.g. "see a Swarm tag? pick Power; see ranged? pick Bulwark").
    let modifierHint = '';      // first modifier tag name, uppercased
    let modifierColor = null;
    let heavyHint = false;       // wave has a heavy/tank/boss-minion archetype

    if (waveDef) {
        if (waveDef.isBossWave) {
            icon = 'skull';
        } else if (waveDef.enemies && waveDef.enemies.length > 0) {
            const rangedTypes = new Set(['skelarch', 'bone_mage', 'frost_archer']);
            const heavyTypes = new Set(['armored', 'bone_colossus', 'shadow_knight', 'werewolf']);
            let total = 0, ranged = 0, heavy = 0;
            for (const grp of waveDef.enemies) {
                total += grp.count || 0;
                if (rangedTypes.has(grp.type)) ranged += grp.count || 0;
                if (heavyTypes.has(grp.type)) heavy += grp.count || 0;
            }
            if (total > 0 && ranged / total >= 0.4) icon = 'bow';
            heavyHint = (heavy >= 2 || (total > 0 && heavy / total >= 0.35));
        }
        if (waveDef.modifiers && waveDef.modifiers.length > 0 && typeof WAVE_MOD_DEFS !== 'undefined') {
            const firstMod = WAVE_MOD_DEFS[waveDef.modifiers[0]];
            if (firstMod) { modifierHint = firstMod.name; modifierColor = firstMod.color; }
        }
    }

    // Pick a clear tile 3-4 away from the player. Try 8 offsets, take first that's walkable.
    const offsets = [
        [0, 3], [0, -3], [3, 0], [-3, 0],
        [2, 2], [2, -2], [-2, 2], [-2, -2],
        [0, 4], [4, 0], [-4, 0], [0, -4],
    ];
    let placed = false;
    for (const [dr, dc] of offsets) {
        const tr = Math.round(player.row + dr);
        const tc = Math.round(player.col + dc);
        if (tr < 1 || tc < 1 || tr >= MAP_SIZE - 1 || tc >= MAP_SIZE - 1) continue;
        if (blocked && blocked[tr] && blocked[tr][tc]) continue;
        wavePortal.row = tr + 0.5;
        wavePortal.col = tc + 0.5;
        placed = true;
        break;
    }
    if (!placed) {
        // Fall back to player position (visually close but pickup range will auto-trigger)
        wavePortal.row = player.row + 2.5;
        wavePortal.col = player.col;
    }

    wavePortal.active = true;
    wavePortal.spawnTime = 0.5;
    wavePortal.lifeTimer = 0;
    wavePortal.iconType = icon;
    wavePortal.nextWaveNum = nextWaveIdx + 1;
    wavePortal.nextWaveTotal = totalWaves || nextWaveIdx + 1;
    wavePortal.needsRelic = !!needsRelic;
    wavePortal._triggered = false;
    wavePortal.modifierHint = modifierHint;
    wavePortal.modifierColor = modifierColor;
    wavePortal.heavyHint = heavyHint;
}

function clearWavePortal() {
    wavePortal.active = false;
    wavePortal._triggered = false;
}

function updateWavePortal(dt) {
    if (!wavePortal.active) return;
    wavePortal.lifeTimer += dt;
    if (wavePortal.spawnTime > 0) wavePortal.spawnTime -= dt;
    if (wavePortal._triggered) return;
    if (typeof player === 'undefined') return;
    // Re-check needsRelic status: once all relic drops are picked up, activate.
    if (wavePortal.needsRelic && typeof worldKeyDrops !== 'undefined') {
        const stillHasRelic = worldKeyDrops.some(d => d.id === 'relic');
        if (!stillHasRelic) wavePortal.needsRelic = false;
    }
    // Dormant while relic is still on the ground — forces player to claim their reward.
    if (wavePortal.needsRelic) return;
    // Player proximity: step through portal to skip cleared phase
    const dr = wavePortal.row - player.row;
    const dc = wavePortal.col - player.col;
    if (Math.sqrt(dr * dr + dc * dc) < 1.2) {
        wavePortal._triggered = true;
        // Telegraph effect
        if (typeof addScreenShake === 'function') addScreenShake(3, 0.2);
        if (typeof triggerScreenFlash === 'function') triggerScreenFlash(0.25, '#cc88ff');
        if (typeof sfxPortal === 'function') sfxPortal();
        else if (typeof sfxChestOpen === 'function') sfxChestOpen();
        // Ending the cleared timer triggers beginNextWave on next frame via existing path
        if (typeof wave !== 'undefined' && wave.phase === 'cleared') {
            wave.timer = 0;
        }
    }
}

function drawWavePortal() {
    if (!wavePortal.active) return;
    if (typeof tileToScreen !== 'function') return;
    const pos = tileToScreen(wavePortal.row, wavePortal.col);
    const sx = pos.x + cameraX;
    const sy = pos.y + cameraY;
    const t = wavePortal.lifeTimer;
    const fadeIn = wavePortal.spawnTime > 0 ? 1 - (wavePortal.spawnTime / 0.5) : 1;

    // Icon-derived color
    const iconColor = wavePortal.iconType === 'skull' ? '#ff4466'
                    : wavePortal.iconType === 'bow'   ? '#88ddff'
                    :                                   '#ccaa88';

    ctx.save();
    // Dormant state (waiting for relic pickup) — portal dims to 40% and stops pulsing hard.
    const dormantMult = wavePortal.needsRelic ? 0.4 : 1.0;
    ctx.globalAlpha = fadeIn * dormantMult;

    // Ground disc — large pulsing glow
    ctx.globalCompositeOperation = 'screen';
    const pulse = 0.6 + Math.sin(t * 3) * 0.25;
    const discR = 54;
    const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, discR);
    grad.addColorStop(0, 'rgba(204, 136, 255, ' + (0.55 * pulse) + ')');
    grad.addColorStop(0.45, 'rgba(120, 80, 220, ' + (0.30 * pulse) + ')');
    grad.addColorStop(1, 'rgba(80, 40, 180, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(sx, sy + 2, discR, discR * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();

    // Portal ring — spinning outer + static inner for depth
    ctx.globalCompositeOperation = 'source-over';
    const ringR = 26;
    ctx.globalAlpha = fadeIn * 0.9;
    ctx.strokeStyle = '#cc88ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(sx, sy - 10, ringR, ringR * 0.45, 0, 0, Math.PI * 2);
    ctx.stroke();
    // Inner glow ring (pulsing)
    const innerPulse = 0.5 + Math.sin(t * 4.5) * 0.3;
    ctx.globalAlpha = fadeIn * innerPulse * 0.8;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(sx, sy - 10, ringR - 4, (ringR - 4) * 0.45, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Icon in the center
    ctx.globalAlpha = fadeIn * 0.95;
    ctx.fillStyle = iconColor;
    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.lineWidth = 3;
    ctx.font = 'bold 20px Georgia';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const iconGlyph = wavePortal.iconType === 'skull' ? '☠'
                    : wavePortal.iconType === 'bow'   ? '➤'
                    :                                   '⚔';
    ctx.strokeText(iconGlyph, sx, sy - 10);
    ctx.fillText(iconGlyph, sx, sy - 10);

    // Heavy-enemy hint: small shield marker under the main icon so players know
    // to expect tanky enemies before they walk through (better build planning).
    if (wavePortal.heavyHint) {
        ctx.globalAlpha = fadeIn * 0.85;
        ctx.fillStyle = '#b0c0d4';
        ctx.strokeStyle = 'rgba(0,0,0,0.8)';
        ctx.lineWidth = 2.5;
        ctx.font = 'bold 11px Georgia';
        ctx.strokeText('⛨', sx + 16, sy + 2);
        ctx.fillText('⛨', sx + 16, sy + 2);
    }

    // "Wave X / Y — step in" label (shown when player is near)
    if (typeof player !== 'undefined') {
        const dr = wavePortal.row - player.row;
        const dc = wavePortal.col - player.col;
        const nearDist = Math.sqrt(dr * dr + dc * dc);
        if (nearDist < 5) {
            const labelAlpha = Math.max(0, Math.min(1, (5 - nearDist) / 3)) * fadeIn;
            ctx.globalAlpha = labelAlpha;
            const label1 = wavePortal.iconType === 'skull' ? 'BOSS INCOMING'
                         : ('Wave ' + wavePortal.nextWaveNum + ' / ' + wavePortal.nextWaveTotal);
            const label2 = 'Step through to begin';
            ctx.font = 'bold 12px Georgia';
            ctx.fillStyle = iconColor;
            ctx.strokeStyle = 'rgba(0,0,0,0.9)';
            ctx.lineWidth = 3;
            ctx.strokeText(label1, sx, sy + 24);
            ctx.fillText(label1, sx, sy + 24);
            ctx.globalAlpha = labelAlpha * 0.85;
            ctx.font = '10px Georgia';
            ctx.fillStyle = '#e0d4b0';
            ctx.strokeText(label2, sx, sy + 38);
            ctx.fillText(label2, sx, sy + 38);

            // Modifier tag: shown when player is close. Tells them the vibe of the
            // fight before committing (darkness / funnel / stampede).
            if (wavePortal.modifierHint) {
                ctx.globalAlpha = labelAlpha;
                ctx.font = 'bold 10px Georgia';
                ctx.fillStyle = wavePortal.modifierColor || '#c48840';
                ctx.strokeStyle = 'rgba(0,0,0,0.9)';
                ctx.lineWidth = 3;
                const tagText = '◇ ' + wavePortal.modifierHint.toUpperCase();
                ctx.strokeText(tagText, sx, sy + 52);
                ctx.fillText(tagText, sx, sy + 52);
            }
        }
    }

    // Rising sparks from the portal center
    if (Math.random() < 0.4 && typeof spawnParticle === 'function') {
        const sparkAng = Math.random() * Math.PI * 2;
        const sparkR = 0.3 + Math.random() * 0.3;
        spawnParticle(
            wavePortal.row + Math.cos(sparkAng) * sparkR,
            wavePortal.col + Math.sin(sparkAng) * sparkR,
            (Math.random() - 0.5) * 1.5, -2 - Math.random() * 1.5,
            0.6, '#cc88ff', 0.7
        );
    }

    ctx.restore();
}
