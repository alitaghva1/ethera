// ============================================================
//  GLOBALS
// ============================================================
let currentObjective = '';  // Context-sensitive objective display

// ============================================================
//  ZONE TRANSITION
// ============================================================
let zoneTransitionAlpha = 0;
let zoneTransitionFading = false;
let zoneTransitionTarget = -1;

// ============================================================
//  ZONE NAME BANNER — dramatic title on zone entry
// ============================================================
let zoneBannerTimer = 0;       // counts down from ZONE_BANNER_DURATION
let zoneBannerName = '';        // zone display name
let zoneBannerSubtitle = '';    // subtitle (e.g. "Act I")
const ZONE_BANNER_DURATION = 4.0; // total display time in seconds
const ZONE_BANNER_FADE_IN = 0.8;
const ZONE_BANNER_FADE_OUT = 1.2;

function showZoneBanner(zoneNumber) {
    const cfg = ZONE_CONFIGS[zoneNumber] || (zoneNumber >= 100 && typeof getProceduralZoneConfig === 'function' ? getProceduralZoneConfig(zoneNumber) : null);
    if (!cfg) return;
    zoneBannerName = cfg.name || '';
    // Subtitle based on zone type
    if (cfg.isProcedural) zoneBannerSubtitle = 'Endless Dungeon';
    else if (cfg.isTown) zoneBannerSubtitle = 'Safe Haven';
    else if (cfg.isFinalZone) zoneBannerSubtitle = 'The End Awaits';
    else if (cfg.isFrozen) zoneBannerSubtitle = 'Depths of Despair';
    else if (cfg.isHell) zoneBannerSubtitle = 'Descent into Flame';
    else zoneBannerSubtitle = 'Act I';
    zoneBannerTimer = ZONE_BANNER_DURATION;
}

function updateZoneBanner(dt) {
    if (zoneBannerTimer > 0) zoneBannerTimer = Math.max(0, zoneBannerTimer - dt);
}

function drawZoneBanner() {
    if (zoneBannerTimer <= 0 || !zoneBannerName) return;

    const elapsed = ZONE_BANNER_DURATION - zoneBannerTimer;
    // Compute alpha: fade in, hold, fade out
    let alpha;
    if (elapsed < ZONE_BANNER_FADE_IN) {
        alpha = elapsed / ZONE_BANNER_FADE_IN;
    } else if (zoneBannerTimer < ZONE_BANNER_FADE_OUT) {
        alpha = zoneBannerTimer / ZONE_BANNER_FADE_OUT;
    } else {
        alpha = 1;
    }

    const cx = canvasW / 2;
    const cy = canvasH * 0.3;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Zone name — large golden text with shadow
    ctx.font = '52px Georgia';
    ctx.shadowColor = 'rgba(180, 140, 40, 0.6)';
    ctx.shadowBlur = 30;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#e8c868';
    ctx.fillText(zoneBannerName, cx, cy);
    ctx.shadowBlur = 0;

    // Decorative line above
    ctx.globalAlpha = alpha * 0.5;
    ctx.strokeStyle = '#c4a050';
    ctx.lineWidth = 1;
    const lineW = ctx.measureText(zoneBannerName).width * 0.6;
    ctx.beginPath();
    ctx.moveTo(cx - lineW, cy - 38);
    ctx.lineTo(cx + lineW, cy - 38);
    ctx.stroke();

    // Decorative line below
    ctx.beginPath();
    ctx.moveTo(cx - lineW, cy + 32);
    ctx.lineTo(cx + lineW, cy + 32);
    ctx.stroke();

    // Subtitle — smaller italic
    ctx.font = 'italic 20px Georgia';
    ctx.globalAlpha = alpha * 0.7;
    ctx.fillStyle = '#c4a878';
    ctx.fillText(zoneBannerSubtitle, cx, cy + 52);

    ctx.restore();
}

// ============================================================
function drawPanel9Slice(img, x, y, w, h, border, scale) {
    if (!img) return;
    const s = border;           // source border size
    const d = border * scale;   // dest border size
    const sw = img.width;       // source width
    const sh = img.height;      // source height
    const si = sw - s * 2;      // source inner width
    const sih = sh - s * 2;    // source inner height
    const di = w - d * 2;       // dest inner width
    const dih = h - d * 2;     // dest inner height

    ctx.imageSmoothingEnabled = false;

    // Corners
    ctx.drawImage(img, 0, 0, s, s, x, y, d, d);                           // TL
    ctx.drawImage(img, sw - s, 0, s, s, x + w - d, y, d, d);              // TR
    ctx.drawImage(img, 0, sh - s, s, s, x, y + h - d, d, d);              // BL
    ctx.drawImage(img, sw - s, sh - s, s, s, x + w - d, y + h - d, d, d); // BR

    // Edges
    ctx.drawImage(img, s, 0, si, s, x + d, y, di, d);                     // Top
    ctx.drawImage(img, s, sh - s, si, s, x + d, y + h - d, di, d);        // Bottom
    ctx.drawImage(img, 0, s, s, sih, x, y + d, d, dih);                   // Left
    ctx.drawImage(img, sw - s, s, s, sih, x + w - d, y + d, d, dih);      // Right

    // Center
    ctx.drawImage(img, s, s, si, sih, x + d, y + d, di, dih);

    ctx.imageSmoothingEnabled = true;
}


// ============================================================
//  OBJECTIVE DISPLAY
// ============================================================
function drawObjective() {
    if (gamePhase !== 'playing' || !currentObjective) return;

    ctx.save();

    const objX = 20;
    const objY = 20;

    ctx.globalAlpha = 0.85;
    ctx.font = 'bold 14px Georgia';
    ctx.fillStyle = '#d4c49a';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.shadowColor = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur = 6;
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 3;
    ctx.strokeText(currentObjective, objX, objY);
    ctx.fillText(currentObjective, objX, objY);
    ctx.shadowBlur = 0;

    // Depth indicator for Endless Dungeon mode
    if (typeof isProceduralZone !== 'undefined' && isProceduralZone && typeof proceduralDepth !== 'undefined') {
        ctx.globalAlpha = 0.6;
        ctx.font = '11px monospace';
        ctx.fillStyle = '#aa9060';
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 2;
        const depthText = 'DEPTH ' + proceduralDepth;
        ctx.strokeText(depthText, objX, objY + 20);
        ctx.fillText(depthText, objX, objY + 20);
    }

    ctx.restore();
}

// ============================================================
//  HP & MANA BARS
// ============================================================
function drawHPMana() {
    if (gamePhase !== 'playing') return;

    const barW = 180;
    const barH = 12;
    const gap = 5;
    const x = 28;
    const yHP = canvasH - 84;
    const yMana = yHP + barH + gap;
    const yXP = yMana + barH + gap;

    ctx.save();

    // --- Dark HUD backing panel (procedural) ---
    {
        const panelX = x - 14;
        const panelY = yHP - 18;
        const panelW = barW + 36;
        const panelH = (yXP + barH) - yHP + 26;

        // Shadow underneath
        ctx.globalAlpha = 0.4;
        ctx.fillStyle = '#000';
        ctx.fillRect(panelX - 2, panelY - 2, panelW + 4, panelH + 4);

        // Dark gradient fill
        ctx.globalAlpha = 0.88;
        const hudBg = ctx.createLinearGradient(panelX, panelY, panelX, panelY + panelH);
        hudBg.addColorStop(0, '#1a1510');
        hudBg.addColorStop(1, '#0e0a06');
        ctx.fillStyle = hudBg;
        ctx.beginPath();
        ctx.roundRect(panelX, panelY, panelW, panelH, 4);
        ctx.fill();

        // Gold border
        ctx.globalAlpha = 0.35;
        ctx.strokeStyle = '#8a7030';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(panelX, panelY, panelW, panelH, 4);
        ctx.stroke();
        ctx.globalAlpha = 1.0;
    }

    // --- HP Bar ---
    const totalMaxHP = MAX_HP + (equipBonus.maxHpBonus || 0) + getTalismanBonus().hpBonus;
    const hpFrac = Math.max(0, player.hp / totalMaxHP);

    // Dark track
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#0a0404';
    ctx.beginPath();
    ctx.roundRect(x, yHP, barW, barH, 3);
    ctx.fill();

    // HP gradient fill
    if (hpFrac > 0) {
        ctx.globalAlpha = 0.9;
        const hpGrad = ctx.createLinearGradient(x, yHP, x, yHP + barH);
        hpGrad.addColorStop(0, '#ee5544');
        hpGrad.addColorStop(0.5, '#cc2222');
        hpGrad.addColorStop(1, '#aa1818');
        ctx.fillStyle = hpGrad;
        ctx.beginPath();
        ctx.roundRect(x, yHP, Math.max(2, barW * hpFrac), barH, 3);
        ctx.fill();
        // Highlight stripe
        ctx.globalAlpha = 0.2;
        ctx.fillStyle = '#fff';
        ctx.fillRect(x + 1, yHP + 1, Math.max(1, barW * hpFrac - 2), 2);
    }

    // HP border
    ctx.globalAlpha = 0.3;
    ctx.strokeStyle = '#8a7040';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.roundRect(x, yHP, barW, barH, 3);
    ctx.stroke();

    // HP label
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = '#ffcccc';
    ctx.font = '9px monospace';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 2.5;
    ctx.strokeText(`HP ${Math.ceil(player.hp)}/${totalMaxHP}`, x + 4, yHP + barH / 2 + 1);
    ctx.fillText(`HP ${Math.ceil(player.hp)}/${totalMaxHP}`, x + 4, yHP + barH / 2 + 1);

    // --- Mana Bar ---
    const lockedMana = summons.reduce((sum, s) => sum + s.manaLocked, 0);
    const totalMaxMana = MAX_MANA + (equipBonus.maxManaBonus || 0);
    const manaFrac = Math.max(0, player.mana / totalMaxMana);
    const lockedFrac = lockedMana / totalMaxMana;

    // Dark track
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#04040a';
    ctx.beginPath();
    ctx.roundRect(x, yMana, barW, barH, 3);
    ctx.fill();

    // Locked mana region
    if (lockedFrac > 0) {
        ctx.globalAlpha = 0.6;
        const lockX = x + barW * (1 - lockedFrac);
        ctx.fillStyle = '#2a1540';
        ctx.beginPath();
        ctx.roundRect(lockX, yMana, barW * lockedFrac, barH, 3);
        ctx.fill();
        const lockPulse = 0.15 + Math.sin(performance.now() / 400) * 0.1;
        ctx.globalAlpha = lockPulse;
        ctx.fillStyle = '#6633aa';
        ctx.beginPath();
        ctx.roundRect(lockX, yMana, barW * lockedFrac, barH, 3);
        ctx.fill();
    }

    // Mana gradient fill
    if (manaFrac > 0) {
        ctx.globalAlpha = 0.9;
        const manaGrad = ctx.createLinearGradient(x, yMana, x, yMana + barH);
        manaGrad.addColorStop(0, '#4488ee');
        manaGrad.addColorStop(0.5, '#2244cc');
        manaGrad.addColorStop(1, '#1a33aa');
        ctx.fillStyle = manaGrad;
        ctx.beginPath();
        ctx.roundRect(x, yMana, Math.max(2, barW * manaFrac), barH, 3);
        ctx.fill();
        // Highlight stripe
        ctx.globalAlpha = 0.2;
        ctx.fillStyle = '#fff';
        ctx.fillRect(x + 1, yMana + 1, Math.max(1, barW * manaFrac - 2), 2);
    }

    // Mana border
    ctx.globalAlpha = 0.3;
    ctx.strokeStyle = '#8a7040';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.roundRect(x, yMana, barW, barH, 3);
    ctx.stroke();

    // Mana label
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = '#aabbff';
    ctx.font = '9px monospace';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 2.5;
    ctx.strokeText(`MP ${Math.ceil(player.mana)}/${totalMaxMana}`, x + 4, yMana + barH / 2 + 1);
    ctx.fillText(`MP ${Math.ceil(player.mana)}/${totalMaxMana}`, x + 4, yMana + barH / 2 + 1);

    // --- XP Bar ---
    const xpFrac = xpState.xpToNext > 0 ? xpState.xp / xpState.xpToNext : 0;

    // Dark track
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = '#0a0804';
    ctx.beginPath();
    ctx.roundRect(x, yXP, barW, barH, 3);
    ctx.fill();

    // XP gradient fill
    if (xpFrac > 0) {
        ctx.globalAlpha = 0.7;
        const xpGrad = ctx.createLinearGradient(x, yXP, x, yXP + barH);
        xpGrad.addColorStop(0, '#ddb040');
        xpGrad.addColorStop(0.5, '#c49030');
        xpGrad.addColorStop(1, '#a07020');
        ctx.fillStyle = xpGrad;
        ctx.beginPath();
        ctx.roundRect(x, yXP, Math.max(2, barW * xpFrac), barH, 3);
        ctx.fill();
        // Highlight stripe
        ctx.globalAlpha = 0.15;
        ctx.fillStyle = '#fff';
        ctx.fillRect(x + 1, yXP + 1, Math.max(1, barW * xpFrac - 2), 2);
    }

    // XP border
    ctx.globalAlpha = 0.25;
    ctx.strokeStyle = '#8a7040';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.roundRect(x, yXP, barW, barH, 3);
    ctx.stroke();

    // XP label
    ctx.globalAlpha = 0.65;
    ctx.fillStyle = '#ddcc88';
    ctx.font = '9px monospace';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 2.5;
    ctx.strokeText(`Lv${xpState.level}  ${xpState.xp}/${xpState.xpToNext}`, x + 4, yXP + barH / 2 + 1);
    ctx.fillText(`Lv${xpState.level}  ${xpState.xp}/${xpState.xpToNext}`, x + 4, yXP + barH / 2 + 1);

    // --- Evolution Surge Indicator ---
    if (typeof evolutionSurge !== 'undefined' && evolutionSurge.active) {
        const remaining = evolutionSurge.duration - evolutionSurge.timer;
        const surgeIntensity = remaining < evolutionSurge.fadeDuration
            ? remaining / evolutionSurge.fadeDuration : 1;
        const pulse = 0.6 + Math.sin(performance.now() / 200) * 0.3 * surgeIntensity;
        ctx.globalAlpha = pulse;
        ctx.fillStyle = '#ffdd44';
        ctx.font = 'bold 10px monospace';
        ctx.textBaseline = 'top';
        ctx.strokeStyle = 'rgba(0,0,0,0.7)';
        ctx.lineWidth = 2.5;
        const surgeText = `EVOLUTION SURGE ${Math.ceil(remaining)}s`;
        ctx.strokeText(surgeText, x, yXP + barH + 6);
        ctx.fillText(surgeText, x, yXP + barH + 6);
    }

    // --- Active Upgrade Icons ---
    drawActiveUpgradeIcons(x, yXP, barH);

    ctx.restore();

    // Draw tower mode indicator if towers are active
    if (summons.length > 0) {
        drawTowerModeIndicator();
    }
}

// ============================================================
//  TOWER MODE INDICATOR
// ============================================================
function drawTowerModeIndicator() {
    if (gamePhase !== 'playing' || towerModeDisplayTimer <= 0) return;

    // Calculate fade based on time remaining
    const fadeStartTime = 0.3;
    let alpha = 1.0;
    if (towerModeDisplayTimer < fadeStartTime) {
        alpha = towerModeDisplayTimer / fadeStartTime;
    }

    const modeText = towerTargetMode === 'nearest' ? 'Nearest' :
                     towerTargetMode === 'strongest' ? 'Strongest' : 'Weakest';
    const displayText = `Tower: ${modeText}`;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = '9px monospace';
    ctx.fillStyle = '#80aaee';
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 2;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    // Position: below the active upgrade icons or to the right of mana bar
    const x = 28;
    const y = canvasH - 45;

    ctx.strokeText(displayText, x, y);
    ctx.fillText(displayText, x, y);
    ctx.restore();
}

// Register wizard form HUD handler
formHandlers.wizard.drawHUD = function() { drawHPMana(); drawObjective(); };

// ============================================================
//  SHARED: Active Upgrade Icons (drawn below XP bar for all forms)
// ============================================================
function drawActiveUpgradeIcons(x, yXP, barH) {
    const CAT_COLORS = { wand: '#e8a040', passive: '#60cc80', tower: '#80aaee' };
    const hudHandler = FormSystem.getHandler();
    const hudPool = (hudHandler && hudHandler.getUpgradePool) ? hudHandler.getUpgradePool() : (typeof UPGRADE_POOL !== 'undefined' ? UPGRADE_POOL : []);
    const activeUps = hudPool.filter(u => (upgrades[u.id] || 0) > 0);
    if (activeUps.length > 0) {
        const iconSize = 7;
        const badgeR = 11;
        const gap = badgeR * 2 + 4;
        const startX = x + badgeR + 2;
        const iconY = yXP + barH + badgeR + 6;

        for (let i = 0; i < activeUps.length; i++) {
            const u = activeUps[i];
            const count = upgrades[u.id];
            const bx = startX + i * gap;
            const catColor = CAT_COLORS[u.category] || '#ccbb88';

            // Badge background circle
            ctx.globalAlpha = 0.35;
            ctx.fillStyle = '#0a0806';
            ctx.beginPath();
            ctx.arc(bx, iconY, badgeR, 0, Math.PI * 2);
            ctx.fill();

            // Border ring — color by category
            ctx.globalAlpha = 0.5;
            ctx.strokeStyle = catColor;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(bx, iconY, badgeR, 0, Math.PI * 2);
            ctx.stroke();

            // Draw the icon
            ctx.globalAlpha = 0.75;
            drawUpgradeIcon(bx, iconY, u.icon, catColor, iconSize);

            // Stack count (bottom-right)
            if (count > 1) {
                ctx.globalAlpha = 0.9;
                ctx.font = 'bold 8px monospace';
                ctx.fillStyle = '#fff';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(count, bx + badgeR * 0.6, iconY + badgeR * 0.55);
                ctx.textAlign = 'left';
                ctx.textBaseline = 'alphabetic';
            }
        }
    }
}

// ============================================================
//  CROSSHAIR
// ============================================================
function drawCrosshair() {
    if (gamePhase !== 'playing' || inventoryOpen || menuOpen || journalOpen || npcDialogueOpen) return;

    const mx = mouse.x;
    const my = mouse.y;
    const r = 8;
    const gap = 3;  // 3px gap from center

    ctx.save();

    // Form-specific crosshair colors
    const form = FormSystem.currentForm;
    const crossColors = {
        slime:    { ring: '#44dd66', cross: '#55ee77', dot: '#77ff99', progress: '#33cc55' },
        skeleton: { ring: '#aabbcc', cross: '#ccddee', dot: '#eeeeff', progress: '#88aacc' },
        wizard:   { ring: '#c4a878', cross: '#e8d4a0', dot: '#fff0cc', progress: '#ddaa44' },
        lich:     { ring: '#8844aa', cross: '#aa66cc', dot: '#cc88ee', progress: '#9955bb' }
    };
    const cc = crossColors[form] || crossColors.wizard;

    // Attack cooldown ring — fills as cooldown resets (form-aware)
    const formConfig = FORM_CONFIGS[form] || {};
    const baseCooldown = formConfig.atkCooldown || ATK_COOLDOWN;
    // Only wizard has equipment bonuses; skeleton and lich have hasEquipment: false by design
    const effAtkCooldown = form === 'wizard'
        ? (baseCooldown / (1 + (equipBonus.atkSpeedMult || 0))) * Math.pow(0.85, getUpgrade('firerate'))
        : baseCooldown;
    const cdFrac = player.attackCooldown > 0 ? 1 - (player.attackCooldown / effAtkCooldown) : 1;
    if (cdFrac < 1) {
        // Background ring (dim)
        ctx.globalAlpha = 0.15;
        ctx.strokeStyle = cc.ring;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(mx, my, r + 3, 0, Math.PI * 2);
        ctx.stroke();
        // Progress arc
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = cc.progress;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(mx, my, r + 3, -Math.PI / 2, -Math.PI / 2 + cdFrac * Math.PI * 2);
        ctx.stroke();
    }

    // Crosshair: white with 60% opacity, 1px thin lines, 3px gap from center
    ctx.globalAlpha = 0.6;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.lineCap = 'round';

    // Four short lines radiating from center with gap
    ctx.beginPath();
    ctx.moveTo(mx - r, my);
    ctx.lineTo(mx - gap, my);
    ctx.moveTo(mx + gap, my);
    ctx.lineTo(mx + r, my);
    ctx.moveTo(mx, my - r);
    ctx.lineTo(mx, my - gap);
    ctx.moveTo(mx, my + gap);
    ctx.lineTo(mx, my + r);
    ctx.stroke();

    // Subtle center dot (1px)
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(mx, my, 1, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
}

function updateParticles(dt) {
    for (const p of particles) {
        p.x += Math.cos(p.angle) * p.speed * dt;
        p.y += Math.sin(p.angle) * p.speed * dt + Math.sin(lightFlicker + p.drift) * 0.3;
        p.angle += (Math.random() - 0.5) * p.drift * dt;
        if (Math.abs(p.x) > 260) p.x *= -0.9;
        if (Math.abs(p.y) > 260) p.y *= -0.9;
    }

    // Hard cap to prevent frame drops during intense combat
    if (particles.length > 200) {
        particles.splice(0, particles.length - 200);
    }
}

// ============================================================
//  FROZEN ECHO SYSTEM — Zone 5 environmental story text
// ============================================================
const FROZEN_ECHOES = [
    { row: 8,  col: 14, text: '"It hurts less if I stop remembering..."', triggered: false },
    { row: 12, col: 10, text: '"The cold is mine now."', triggered: false },
    { row: 16, col: 18, text: '"How long has it been?"', triggered: false },
    { row: 20, col: 14, text: '"I can still feel the talisman. Even here."', triggered: false },
    { row: 24, col: 12, text: '"If you come after me... forgive me."', triggered: false },
];
const ECHO_TRIGGER_RANGE = 2.5;
let frozenEchoActive = null; // { text, alpha, timer }

function resetFrozenEchoes() {
    // Called during zone transitions to reset echo state.
    // This ensures frozenEchoActive doesn't persist when leaving zone 5.
    for (const e of FROZEN_ECHOES) e.triggered = false;
    frozenEchoActive = null;
}

function updateFrozenEchoes(dt) {
    if (currentZone !== 5) return;

    // Check proximity triggers
    for (const echo of FROZEN_ECHOES) {
        if (echo.triggered) continue;
        const dr = echo.row - player.row;
        const dc = echo.col - player.col;
        if (Math.sqrt(dr * dr + dc * dc) < ECHO_TRIGGER_RANGE) {
            echo.triggered = true;
            frozenEchoActive = { text: echo.text, alpha: 0, timer: 5.0 };
            if (typeof sfxChestOpen === 'function') sfxChestOpen(); // subtle sound cue
        }
    }

    // Update active echo display
    if (frozenEchoActive) {
        frozenEchoActive.timer -= dt;
        if (frozenEchoActive.timer > 4.0) {
            // Fade in
            frozenEchoActive.alpha = Math.min(1, frozenEchoActive.alpha + dt * 2.5);
        } else if (frozenEchoActive.timer < 1.5) {
            // Fade out
            frozenEchoActive.alpha = Math.max(0, frozenEchoActive.alpha - dt * 0.7);
        }
        if (frozenEchoActive.timer <= 0) {
            frozenEchoActive = null;
        }
    }
}

function drawFrozenEcho() {
    if (!frozenEchoActive || frozenEchoActive.alpha <= 0) return;

    ctx.save();
    const cx = canvasW / 2;
    const cy = canvasH * 0.35;

    // Frosty text — centered, italic, slightly trembling
    const tremble = Math.sin(performance.now() / 200) * 0.5;
    ctx.globalAlpha = frozenEchoActive.alpha * 0.75;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'italic 16px Georgia';
    ctx.fillStyle = '#aaddff';
    ctx.shadowColor = 'rgba(100, 180, 255, 0.4)';
    ctx.shadowBlur = 12;
    ctx.fillText(frozenEchoActive.text, cx + tremble, cy);
    ctx.shadowBlur = 0;
    ctx.restore();
}

// ============================================================
//  PICKUP TEXT SYSTEM
// ============================================================
function updatePickupTexts(dt) {
    for (let i = pickupTexts.length - 1; i >= 0; i--) {
        const t = pickupTexts[i];
        t.life -= dt;
        t.offsetY -= 35 * dt;
        if (t.life <= 0) pickupTexts.splice(i, 1);
    }
}

function drawPickupTexts() {
    for (const t of pickupTexts) {
        const pos = tileToScreen(t.row, t.col);
        let sx = pos.x + cameraX;
        let sy = pos.y + cameraY + t.offsetY;
        const alpha = Math.min(1, t.life / 0.5);
        ctx.save();
        ctx.globalAlpha = alpha * 0.9;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // ── COMBAT JUICE: Crit damage numbers are bigger and bolder ──
        if (t.isCrit) {
            const critPop = t.life > 0.9 ? 1 + (t.life - 0.9) * 2.5 : 1; // pop on spawn
            const fontSize = Math.round(15 * critPop);
            ctx.font = `bold ${fontSize}px Georgia`;
            ctx.shadowColor = 'rgba(180, 120, 0, 0.6)';
            ctx.shadowBlur = 8;
        } else {
            ctx.font = '11px Georgia';
            ctx.shadowColor = 'rgba(0,0,0,0.8)';
            ctx.shadowBlur = 4;
        }

        ctx.fillStyle = t.color;
        ctx.fillText(t.text, sx, sy);
        ctx.shadowBlur = 0;
        ctx.restore();
    }
}


