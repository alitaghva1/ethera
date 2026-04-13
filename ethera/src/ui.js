// ============================================================
//  GLOBALS
// ============================================================
var currentObjective = '';  // Context-sensitive objective display (var for cross-file access)
var objectiveShowTimer = 0; // fades after 5 seconds, resets on change
var _lastObjective = '';    // track changes

// ============================================================
//  WORLD LABEL OVERLAP PREVENTION
//  Interaction prompts register their screen bounds each frame.
//  Pickup texts and lower-priority labels shift to avoid them.
// ============================================================
var _frameWorldLabels = [];  // {x, y, w, h} — cleared each frame before HUD draw

function _resetWorldLabels() { _frameWorldLabels.length = 0; }

function _registerWorldLabel(cx, cy, w, h) {
    _frameWorldLabels.push({ x: cx - w / 2, y: cy - h / 2, w: w, h: h });
}

function _overlapsAnyLabel(cx, cy, w, h) {
    const lx = cx - w / 2, ly = cy - h / 2;
    for (const lb of _frameWorldLabels) {
        if (lx < lb.x + lb.w && lx + w > lb.x &&
            ly < lb.y + lb.h && ly + h > lb.y) return lb;
    }
    return null;
}

// ============================================================
//  MINIMAP SYSTEM
//  Offscreen canvas rendered from fogRevealed data.
//  Rebuilt when fog changes (dirty flag). Player/enemy dots drawn each frame.
// ============================================================
let minimapVisible = true;
let _minimapDirty = true;
let _minimapCanvas = null;
let _minimapCtx = null;
const MINIMAP_PX = 3;        // pixels per tile
const MINIMAP_PAD = 14;      // padding from screen edge
const MINIMAP_ALPHA = 0.75;  // overall minimap opacity

function markMinimapDirty() { _minimapDirty = true; }

function _rebuildMinimapStatic() {
    const sz = typeof MAP_SIZE !== 'undefined' ? MAP_SIZE : 24;
    const dim = sz * MINIMAP_PX;
    if (!_minimapCanvas || _minimapCanvas.width !== dim) {
        _minimapCanvas = document.createElement('canvas');
        _minimapCanvas.width = dim;
        _minimapCanvas.height = dim;
        _minimapCtx = _minimapCanvas.getContext('2d');
    }
    const mc = _minimapCtx;
    mc.clearRect(0, 0, dim, dim);

    for (let r = 0; r < sz; r++) {
        for (let c = 0; c < sz; c++) {
            const fog = (fogRevealed && fogRevealed[r] && fogRevealed[r][c]) ? fogRevealed[r][c] : 0;
            if (fog <= 0) continue;
            const px = c * MINIMAP_PX, py = r * MINIMAP_PX;
            const hasFloor = floorMap && floorMap[r] && floorMap[r][c];
            const isBlocked = blocked && blocked[r] && blocked[r][c];

            if (hasFloor && !isBlocked) {
                mc.fillStyle = fog >= 1 ? '#3a2a1e' : '#1e1610';
            } else if (hasFloor) {
                mc.fillStyle = fog >= 1 ? '#2a201a' : '#15100c';
            } else {
                continue; // void tile
            }
            mc.globalAlpha = Math.min(1, fog + 0.2);
            mc.fillRect(px, py, MINIMAP_PX, MINIMAP_PX);
        }
    }
    // Draw door markers
    if (typeof DOOR_DEFS !== 'undefined' && DOOR_DEFS) {
        for (const key in DOOR_DEFS) {
            const parts = key.split(',');
            const dr = parseInt(parts[0]), dc = parseInt(parts[1]);
            if (isNaN(dr) || isNaN(dc)) continue;
            const fog = (fogRevealed && fogRevealed[dr] && fogRevealed[dr][dc]) ? fogRevealed[dr][dc] : 0;
            if (fog <= 0) continue;
            mc.globalAlpha = 0.8;
            mc.fillStyle = '#5588cc';
            mc.fillRect(dc * MINIMAP_PX, dr * MINIMAP_PX, MINIMAP_PX, MINIMAP_PX);
        }
    }
    mc.globalAlpha = 1;
    _minimapDirty = false;
}

function drawMinimap() {
    if (!minimapVisible || gamePhase !== 'playing' || gameDead) return;
    if (typeof MAP_SIZE === 'undefined' || typeof fogRevealed === 'undefined') return;
    // Skip in town-like antechamber (zone 7) if map is tiny
    if (currentZone === 7) return;

    if (_minimapDirty || !_minimapCanvas) _rebuildMinimapStatic();

    const sz = MAP_SIZE;
    const dim = sz * MINIMAP_PX;
    const mx = MINIMAP_PAD;
    const my = MINIMAP_PAD;

    ctx.save();
    ctx.globalAlpha = MINIMAP_ALPHA;

    // Background
    ctx.fillStyle = 'rgba(8, 6, 4, 0.7)';
    ctx.fillRect(mx - 2, my - 2, dim + 4, dim + 4);
    ctx.strokeStyle = 'rgba(138, 112, 48, 0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(mx - 2, my - 2, dim + 4, dim + 4);

    // Static map layer
    ctx.drawImage(_minimapCanvas, mx, my);

    // Dynamic: player dot (form-colored, pulsing)
    const pulse = 0.7 + Math.sin(performance.now() / 300) * 0.3;
    ctx.globalAlpha = MINIMAP_ALPHA * pulse;
    const formColors = { slime: '#44dd66', skeleton: '#ddddcc', wizard: '#6688ff', lich: '#aa55ff' };
    ctx.fillStyle = formColors[FormSystem.currentForm] || '#ffffff';
    const pr = Math.floor(player.row), pc = Math.floor(player.col);
    ctx.fillRect(mx + pc * MINIMAP_PX - 1, my + pr * MINIMAP_PX - 1, MINIMAP_PX + 2, MINIMAP_PX + 2);

    // Dynamic: enemy dots (red, only within light radius range)
    ctx.globalAlpha = MINIMAP_ALPHA * 0.7;
    ctx.fillStyle = '#cc3333';
    if (typeof enemies !== 'undefined') {
        for (const e of enemies) {
            if (e.state === 'death') continue;
            const er = Math.floor(e.row), ec = Math.floor(e.col);
            // Only show enemies near the player (within ~10 tiles)
            const dr = er - pr, dc = ec - pc;
            if (dr * dr + dc * dc > 100) continue;
            const fog = (fogRevealed[er] && fogRevealed[er][ec]) ? fogRevealed[er][ec] : 0;
            if (fog < 1) continue;
            ctx.fillRect(mx + ec * MINIMAP_PX, my + er * MINIMAP_PX, MINIMAP_PX, MINIMAP_PX);
        }
    }

    ctx.restore();
}

// ============================================================
//  ZONE TRANSITION
// ============================================================
let zoneTransitionAlpha = 0;
let zoneTransitionFading = false;
let zoneTransitionTarget = -1;

// ============================================================
//  ZONE NAME BANNER — dramatic title on zone entry
// ============================================================
var zoneBannerTimer = 0;       // counts down from ZONE_BANNER_DURATION (var for cross-file access)
let zoneBannerName = '';        // zone display name
let zoneBannerSubtitle = '';    // subtitle (e.g. "Act I")
let zoneBannerModLine = '';     // active modifiers line (e.g. "[Swarm] [Darkness]")
let zoneBannerNewMod = '';      // newly added modifier (e.g. "New: Haste")
const ZONE_BANNER_DURATION = 4.0; // total display time in seconds
const ZONE_BANNER_FADE_IN = 0.8;
const ZONE_BANNER_FADE_OUT = 1.2;

// Procedural bridge floor flavor text
const PROC_BRIDGE_SUBTITLES = {
    dungeon: 'The tunnels wind deeper...',
    ruins: 'Ancient halls crumble around you...',
    hell: 'Heat rises from below...',
    frozen: 'The air grows cold...',
};

function showZoneBanner(zoneNumber) {
    const cfg = ZONE_CONFIGS[zoneNumber] || (zoneNumber >= 100 && typeof getProceduralZoneConfig === 'function' ? getProceduralZoneConfig(zoneNumber) : null);
    if (!cfg) return;
    zoneBannerName = cfg.name || '';

    // Reset modifier banner text
    zoneBannerModLine = '';
    zoneBannerNewMod = '';

    if (cfg.isProcedural && typeof endlessUnlocked !== 'undefined' && endlessUnlocked) {
        // Post-game endless mode — show depth and modifiers
        const depthNum = zoneNumber >= 100 ? (zoneNumber - 99) : '';
        zoneBannerName = 'Endless Depth ' + depthNum;
        zoneBannerSubtitle = 'The abyss has no end...';

        // Build modifier display lines
        if (typeof activeModifiers !== 'undefined' && activeModifiers.length > 0) {
            zoneBannerModLine = activeModifiers.map(m => '[' + m.name + ']').join('  ');
        }
        if (typeof _lastAddedModifier !== 'undefined' && _lastAddedModifier) {
            zoneBannerNewMod = 'New: ' + _lastAddedModifier.name;
        }
    } else if (cfg.isProcedural && typeof _nextProceduralTheme !== 'undefined') {
        // Bridge floor between story zones — use theme-specific text
        const themeId = (typeof proceduralDepth !== 'undefined') ? themeForDepth(proceduralDepth).id : 'dungeon';
        zoneBannerSubtitle = PROC_BRIDGE_SUBTITLES[themeId] || 'Descending...';
    } else if (cfg.isProcedural) {
        zoneBannerSubtitle = 'Descending...';
    } else if (cfg.isTown) zoneBannerSubtitle = 'Safe Haven';
    else if (cfg.isFinalZone) zoneBannerSubtitle = 'The End Awaits';
    else if (cfg.isFrozen) zoneBannerSubtitle = 'Depths of Despair';
    else if (cfg.isHell) zoneBannerSubtitle = 'Descent into Flame';
    else zoneBannerSubtitle = 'Act I';
    zoneBannerTimer = ZONE_BANNER_DURATION;
}

function updateZoneBanner(dt) {
    if (zoneBannerTimer > 0) {
        zoneBannerTimer = Math.max(0, zoneBannerTimer - dt);
        // Clear the "new modifier" marker once banner finishes
        if (zoneBannerTimer <= 0 && typeof _lastAddedModifier !== 'undefined') {
            _lastAddedModifier = null;
        }
    }
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

    // Abyss modifier lines (endless mode only)
    if (zoneBannerModLine) {
        ctx.font = '13px monospace';
        ctx.globalAlpha = alpha * 0.55;
        ctx.fillStyle = '#aa9060';
        ctx.fillText(zoneBannerModLine, cx, cy + 82);
    }
    if (zoneBannerNewMod) {
        ctx.font = 'bold 14px Georgia';
        ctx.globalAlpha = alpha * 0.8;
        ctx.fillStyle = '#ee8844';
        ctx.fillText(zoneBannerNewMod, cx, cy + (zoneBannerModLine ? 105 : 82));
    }

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

    // Reset timer when objective changes
    if (currentObjective !== _lastObjective) {
        _lastObjective = currentObjective;
        objectiveShowTimer = 0;
    }
    objectiveShowTimer += (typeof _frameDt !== 'undefined' ? _frameDt : 1/60);

    // Fade: full for 5s, then fade to 0.15 over 2s
    let objAlpha = 0.85;
    if (objectiveShowTimer > 5) {
        objAlpha = Math.max(0.15, 0.85 - (objectiveShowTimer - 5) * 0.35);
    }

    ctx.save();

    const objX = 20;
    // Position below minimap if visible, otherwise at top
    const minimapBottom = (typeof minimapVisible !== 'undefined' && minimapVisible && typeof MAP_SIZE !== 'undefined' && currentZone !== 7)
        ? MINIMAP_PAD + MAP_SIZE * MINIMAP_PX + 8 : 0;
    const objY = Math.max(20, minimapBottom);

    ctx.globalAlpha = objAlpha;
    ctx.font = '13px Georgia';
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
//  HP & MANA BARS — with smooth lerp transitions
// ============================================================
// ============================================================
//  QUEST TRACKER — persistent bottom-right HUD
// ============================================================
let _questTrackerVisible = true;

function drawQuestTracker() {
    if (!_questTrackerVisible || gamePhase !== 'playing' || gameDead) return;
    if (typeof QUEST_REGISTRY === 'undefined' || typeof questState === 'undefined') return;
    if (typeof menuOpen !== 'undefined' && menuOpen) return;

    // Find active quest: first started but not completed
    let activeQuest = null, activeStep = -1;
    for (const quest of QUEST_REGISTRY) {
        if (isQuestComplete(quest.id)) continue;
        const step = getQuestCurrentStep(quest.id);
        if (step >= 0) { activeQuest = quest; activeStep = step; break; }
    }
    if (!activeQuest) return;

    const stepText = activeQuest.steps[activeStep].text;
    const rx = canvasW - 20;
    const ry = canvasH - 110; // above HP panel area to avoid bottom-right crowding

    ctx.save();
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';

    // Quest name
    ctx.globalAlpha = 0.6;
    ctx.font = 'bold 10px Georgia';
    ctx.fillStyle = '#e8c040';
    ctx.shadowColor = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur = 4;
    ctx.fillText(activeQuest.name, rx, ry);

    // Current step
    ctx.globalAlpha = 0.45;
    ctx.font = 'italic 9px Georgia';
    ctx.fillStyle = '#c4a878';
    ctx.fillText(stepText, rx, ry + 14);

    // Step progress dots
    ctx.globalAlpha = 0.4;
    const dotY = ry + 22;
    for (let i = 0; i < activeQuest.steps.length; i++) {
        const dotX = rx - (activeQuest.steps.length - 1 - i) * 8;
        ctx.fillStyle = i < activeStep ? '#e8c040' : (i === activeStep ? '#aa8830' : '#443320');
        ctx.beginPath();
        ctx.arc(dotX, dotY, 2, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.shadowBlur = 0;
    ctx.restore();
}

let _displayHP = -1;
let _displayMana = -1;
let _displayXP = -1;
let _hpFlashTimer = 0;
let _prevHP = -1;
let _phantomHP = -1; // ghost bar that drains slowly after damage
function drawHPMana() {
    if (gamePhase !== 'playing') return;
    // Smooth lerp toward actual values (8x per second convergence)
    const lerpSpeed = 8;
    const frameDt = (typeof _frameDt !== 'undefined') ? _frameDt : 1/60;
    if (_displayHP < 0) _displayHP = player.hp;
    if (_displayMana < 0) _displayMana = player.mana;
    if (_displayXP < 0) _displayXP = xpState.xp;
    if (_prevHP < 0) _prevHP = player.hp;
    if (_phantomHP < 0) _phantomHP = player.hp;
    // Detect damage — trigger flash
    if (player.hp < _prevHP - 0.5) _hpFlashTimer = 0.15;
    _prevHP = player.hp;
    if (_hpFlashTimer > 0) _hpFlashTimer -= frameDt;
    _displayHP += (player.hp - _displayHP) * Math.min(1, lerpSpeed * frameDt);
    _displayMana += (player.mana - _displayMana) * Math.min(1, lerpSpeed * frameDt);
    _displayXP += (xpState.xp - _displayXP) * Math.min(1, lerpSpeed * frameDt);

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

    // --- HP Bar (uses smoothed display value) ---
    // Abyss modifier: Frailty — reduce max HP in endless mode
    const _abyssHpMult = (typeof getAbyssModMult === 'function' && typeof currentZone !== 'undefined' && currentZone >= 100)
        ? getAbyssModMult('hpMult', 1) : 1;
    const _questHpBonus = (typeof questState !== 'undefined') ? (questState.permBonuses.maxHpBonus || 0) : 0;
    const totalMaxHP = Math.round((MAX_HP + (equipBonus.maxHpBonus || 0) + getTalismanBonus().hpBonus + _questHpBonus) * _abyssHpMult);
    const hpFrac = Math.max(0, _displayHP / totalMaxHP);

    // Phantom HP drain — stays at old value, drains slowly after damage
    if (_phantomHP < player.hp) _phantomHP = player.hp;
    _phantomHP = Math.max(player.hp, _phantomHP - totalMaxHP * frameDt * 1.5);
    const phantomFrac = Math.max(0, _phantomHP / totalMaxHP);

    // Dark track
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#0a0404';
    ctx.beginPath();
    ctx.roundRect(x, yHP, barW, barH, 3);
    ctx.fill();

    // Phantom bar — pale yellow ghost showing recent damage (drawn behind real HP)
    if (phantomFrac > hpFrac + 0.01) {
        ctx.globalAlpha = 0.45;
        ctx.fillStyle = '#ddcc88';
        ctx.beginPath();
        ctx.roundRect(x, yHP, Math.max(2, barW * phantomFrac), barH, 3);
        ctx.fill();
    }

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
        // Damage flash overlay — white flash when hit
        if (_hpFlashTimer > 0) {
            ctx.globalAlpha = (_hpFlashTimer / 0.15) * 0.45;
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.roundRect(x, yHP, Math.max(2, barW * hpFrac), barH, 3);
            ctx.fill();
        }
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

    // --- Status Effect Icons (below XP bar) ---
    {
        const statusIcons = [];
        const now = performance.now() / 1000;
        // Invincibility frames
        if (typeof playerInvTimer !== 'undefined' && playerInvTimer > 0.15) {
            statusIcons.push({ label: 'INV', color: '#ffffff', frac: Math.min(1, playerInvTimer / 0.8) });
        }
        // Slow debuff
        if (player.slowTimer && player.slowTimer > 0) {
            statusIcons.push({ label: 'SLOW', color: '#6699cc', frac: Math.min(1, player.slowTimer / 2) });
        }
        // Frozen debuff
        if (player.frozenTimer && player.frozenTimer > 0) {
            statusIcons.push({ label: 'FRZ', color: '#88ccff', frac: Math.min(1, player.frozenTimer / 1.5) });
        }
        // Evolution surge buff
        if (typeof evolutionSurge !== 'undefined' && evolutionSurge.active) {
            const rem = evolutionSurge.duration - evolutionSurge.timer;
            statusIcons.push({ label: 'PWR', color: '#ffdd44', frac: rem / evolutionSurge.duration });
        }

        if (statusIcons.length > 0) {
            const iconSize = 14;
            const iconGap = 3;
            const iconY = yXP + barH + 4;
            for (let si = 0; si < statusIcons.length; si++) {
                const ic = statusIcons[si];
                const iconX = x + si * (iconSize + iconGap);

                // Background square
                ctx.globalAlpha = 0.5;
                ctx.fillStyle = '#0a0806';
                ctx.fillRect(iconX, iconY, iconSize, iconSize);

                // Timer arc (clockwise sweep showing remaining fraction)
                ctx.globalAlpha = 0.6;
                ctx.strokeStyle = ic.color;
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                const arcCx = iconX + iconSize / 2, arcCy = iconY + iconSize / 2;
                ctx.arc(arcCx, arcCy, iconSize / 2 - 1, -Math.PI / 2, -Math.PI / 2 + ic.frac * Math.PI * 2);
                ctx.stroke();

                // Label
                ctx.globalAlpha = 0.7;
                ctx.font = 'bold 6px monospace';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = ic.color;
                ctx.fillText(ic.label, arcCx, arcCy + 1);
            }
            ctx.textAlign = 'left';
        }
    }

    // --- Active Upgrade Icons ---
    drawActiveUpgradeIcons(x, yXP, barH);

    // Gold display is drawn in gameloop.js (top-right, below evolution dots)

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

// ============================================================
//  POTION HUD — shows owned potions near HP/Mana bars
// ============================================================
function drawPotionHUD() {
    if (gamePhase !== 'playing') return;
    if (typeof playerPotions === 'undefined' || typeof POTIONS === 'undefined') return;
    // Only show if player has any potions
    const total = (playerPotions.health_vial || 0) + (playerPotions.mana_elixir || 0) + (playerPotions.fortitude_salt || 0);
    if (total <= 0) return;

    ctx.save();
    const x = 28;
    const y = canvasH - 28;  // below XP bar area

    const potionIds = ['health_vial', 'mana_elixir', 'fortitude_salt'];
    const potionShort = ['Vial', 'Elixir', 'Salt'];
    const potionColors = ['#ee5544', '#4488ee', '#ddaa44'];
    let offsetX = 0;

    for (let i = 0; i < potionIds.length; i++) {
        const count = playerPotions[potionIds[i]] || 0;
        if (count <= 0) continue;

        const label = '[' + (i + 1) + '] ' + potionShort[i] + ' x' + count;
        ctx.globalAlpha = 0.6;
        ctx.font = '9px monospace';
        ctx.fillStyle = potionColors[i];
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.lineWidth = 2;
        ctx.strokeText(label, x + offsetX, y);
        ctx.fillText(label, x + offsetX, y);
        offsetX += ctx.measureText(label).width + 14;
    }

    // Show active fortitude buff indicator
    if (typeof activePotionBuffs !== 'undefined' && activePotionBuffs.dmgReduc) {
        ctx.globalAlpha = 0.5 + Math.sin(performance.now() / 400) * 0.15;
        ctx.font = 'bold 8px monospace';
        ctx.fillStyle = '#ffcc44';
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.lineWidth = 2;
        const buffText = 'FORTITUDE ACTIVE';
        ctx.strokeText(buffText, x + offsetX, y);
        ctx.fillText(buffText, x + offsetX, y);
    }

    ctx.restore();
}

// Wizard form drawHUD handler is registered in wizard.js

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

    // Dark outline for contrast on bright backgrounds
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(mx - r, my); ctx.lineTo(mx - gap, my);
    ctx.moveTo(mx + gap, my); ctx.lineTo(mx + r, my);
    ctx.moveTo(mx, my - r); ctx.lineTo(mx, my - gap);
    ctx.moveTo(mx, my + gap); ctx.lineTo(mx, my + r);
    ctx.stroke();

    // Crosshair: white with stronger opacity, 1.5px lines
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(mx - r, my); ctx.lineTo(mx - gap, my);
    ctx.moveTo(mx + gap, my); ctx.lineTo(mx + r, my);
    ctx.moveTo(mx, my - r); ctx.lineTo(mx, my - gap);
    ctx.moveTo(mx, my + gap); ctx.lineTo(mx, my + r);
    ctx.stroke();

    // Center dot with dark outline
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.arc(mx, my, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(mx, my, 1.2, 0, Math.PI * 2);
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
// ============================================================
//  WALL INSCRIPTIONS — environmental lore text in zones 1-3
//  Proximity-triggered, drawn in world-space above the inscription tile.
// ============================================================
const WALL_INSCRIPTIONS = {
    1: [
        { row: 4, col: 5, text: '"We sealed it below. Pray it holds."', triggered: false },
        { row: 9, col: 8, text: '"The guards stopped reporting at dawn."', triggered: false },
        { row: 14, col: 12, text: '"Something stirs in the hollow."', triggered: false },
        { row: 18, col: 6, text: '"Count the bones. There should be twelve."', triggered: false },
    ],
    2: [
        { row: 4, col: 18, text: '"The tower was never meant to stand this long."', triggered: false },
        { row: 8, col: 22, text: '"Elara climbed past here. She did not look back."', triggered: false },
        { row: 14, col: 16, text: '"The moss grows thickest where they fell."', triggered: false },
    ],
    3: [
        { row: 5, col: 7, text: '"The howling started three nights ago."', triggered: false },
        { row: 10, col: 16, text: '"It wears a man\'s shape. It is not a man."', triggered: false },
        { row: 14, col: 12, text: '"The Pale Covenant asks only one thing: everything."', triggered: false },
    ],
};
const INSCRIPTION_RANGE = 2.0;
let _inscriptionActive = null; // { text, alpha, timer, worldRow, worldCol }

function resetInscriptions() {
    for (const z in WALL_INSCRIPTIONS)
        for (const ins of WALL_INSCRIPTIONS[z]) ins.triggered = false;
    _inscriptionActive = null;
}

function updateInscriptions(dt) {
    const inscriptions = WALL_INSCRIPTIONS[currentZone];
    if (!inscriptions) return;

    for (const ins of inscriptions) {
        if (ins.triggered) continue;
        const dr = ins.row - player.row;
        const dc = ins.col - player.col;
        if (Math.sqrt(dr * dr + dc * dc) < INSCRIPTION_RANGE) {
            ins.triggered = true;
            _inscriptionActive = { text: ins.text, alpha: 0, timer: 5.0, worldRow: ins.row, worldCol: ins.col };
        }
    }

    if (_inscriptionActive) {
        _inscriptionActive.timer -= dt;
        if (_inscriptionActive.timer > 4.0) {
            _inscriptionActive.alpha = Math.min(1, _inscriptionActive.alpha + dt * 2.5);
        } else if (_inscriptionActive.timer < 1.5) {
            _inscriptionActive.alpha = Math.max(0, _inscriptionActive.alpha - dt * 0.7);
        }
        if (_inscriptionActive.timer <= 0) _inscriptionActive = null;
    }
}

function drawInscriptions() {
    if (!_inscriptionActive || _inscriptionActive.alpha <= 0) return;
    const ins = _inscriptionActive;

    // Draw in world-space above the inscription tile
    const pos = tileToScreen(ins.worldRow, ins.worldCol);
    const sx = pos.x + cameraX;
    const sy = pos.y + cameraY - 50;

    ctx.save();
    const tremble = Math.sin(performance.now() / 300) * 0.4;
    ctx.globalAlpha = ins.alpha * 0.6;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'italic 11px Georgia';
    ctx.fillStyle = '#c4a878';
    ctx.shadowColor = 'rgba(180, 140, 60, 0.3)';
    ctx.shadowBlur = 8;
    ctx.fillText(ins.text, sx + tremble, sy);
    ctx.shadowBlur = 0;
    ctx.restore();
}

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
        // Gravity arc for damage numbers (vy starts negative = up, gravity pulls down)
        if (t.vy !== undefined) {
            t.offsetY += t.vy * dt;
            t.vy += 220 * dt; // gravity
            if (t.offsetX !== undefined) t.offsetX *= 0.97; // friction on horizontal scatter
        } else {
            t.offsetY -= 35 * dt; // fallback: linear float for non-damage text
        }
        if (t.life <= 0) pickupTexts.splice(i, 1);
    }
}

function drawPickupTexts() {
    for (const t of pickupTexts) {
        const pos = tileToScreen(t.row, t.col);
        let sx = pos.x + cameraX + (t.offsetX || 0);
        let sy = pos.y + cameraY + t.offsetY;

        // Shift pickup text if it overlaps a registered interaction prompt
        if (typeof _overlapsAnyLabel === 'function') {
            const textW = 60, textH = 16;
            const overlap = _overlapsAnyLabel(sx, sy, textW, textH);
            if (overlap) {
                // Push below the prompt badge
                sy = overlap.y + overlap.h + 8;
            }
        }

        const alpha = Math.min(1, t.life / 0.5);
        ctx.save();
        ctx.globalAlpha = alpha * 0.9;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // ── COMBAT JUICE: Scale damage numbers by magnitude ──
        if (t.isCrit) {
            // Scale-pop: 1.0 → 1.5 → 1.0 over first 0.15s of life
            const popT = Math.max(0, t.life - (1.2 - 0.15)) / 0.15; // 0→1 during first 150ms
            const critPop = popT > 0 ? 1 + Math.sin(popT * Math.PI) * 0.5 : 1;
            const fontSize = Math.round(20 * critPop);
            ctx.font = `bold ${fontSize}px Georgia`;
            ctx.shadowColor = 'rgba(200, 140, 0, 0.7)';
            ctx.shadowBlur = 10;
        } else if (t.text && t.text.startsWith('-')) {
            // Scale font by damage magnitude: -5 = 12px, -30 = 15px, -50+ = 16px
            const dmgVal = parseInt(t.text.replace('-', '')) || 0;
            const scaledSize = Math.min(16, 12 + Math.sqrt(dmgVal) * 0.5);
            ctx.font = `bold ${Math.round(scaledSize)}px Georgia`;
            ctx.shadowColor = 'rgba(0,0,0,0.8)';
            ctx.shadowBlur = 5;
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

// ============================================================
//  ABYSS MODIFIER HUD — active modifier pills (top-right)
// ============================================================
const _ABYSS_MOD_COLORS = {
    swarm:      '#cc8833',
    iron_horde: '#cc3333',
    darkness:   '#6644aa',
    drought:    '#3366aa',
    frail:      '#aa4455',
    haste:      '#33aa66',
    famine:     '#887744',
    gauntlet:   '#aa6622',
};

function drawAbyssModifiers() {
    if (gamePhase !== 'playing') return;
    if (typeof activeModifiers === 'undefined' || activeModifiers.length === 0) return;
    if (typeof currentZone === 'undefined' || currentZone < 100) return;
    if (typeof endlessUnlocked === 'undefined' || !endlessUnlocked) return;

    ctx.save();
    const padR = 12;
    const padT = 12;
    const pillH = 18;
    const pillGap = 4;
    const pillPadX = 8;

    ctx.font = 'bold 9px monospace';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'right';

    for (let i = 0; i < activeModifiers.length; i++) {
        const mod = activeModifiers[i];
        const color = _ABYSS_MOD_COLORS[mod.id] || '#888888';
        const textW = ctx.measureText(mod.name).width;
        const pillW = textW + pillPadX * 2;
        const px = canvasW - padR - pillW;
        const py = padT + i * (pillH + pillGap);

        // Pill background
        ctx.globalAlpha = 0.6;
        ctx.fillStyle = '#0a0806';
        ctx.beginPath();
        ctx.roundRect(px, py, pillW, pillH, 3);
        ctx.fill();

        // Pill border
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(px, py, pillW, pillH, 3);
        ctx.stroke();

        // Pill text
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = color;
        ctx.fillText(mod.name, canvasW - padR - pillPadX, py + pillH / 2 + 1);
    }

    ctx.restore();
}

// ============================================================
//  ABYSS RANK BADGE — small corner badge during endless mode
// ============================================================
function drawAbyssRankBadge() {
    if (gamePhase !== 'playing') return;
    if (typeof getAbyssRank !== 'function') return;
    if (typeof currentZone === 'undefined' || currentZone < 100) return;
    if (typeof endlessUnlocked === 'undefined' || !endlessUnlocked) return;

    const rank = getAbyssRank();
    if (!rank) return;

    ctx.save();

    // Position below the modifier pills
    const modCount = (typeof activeModifiers !== 'undefined') ? activeModifiers.length : 0;
    const padR = 12;
    const startY = 12 + modCount * 22 + 8;

    ctx.font = 'bold 10px Georgia';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';

    const text = rank.name;
    const textW = ctx.measureText(text).width;
    const badgeW = textW + 16;
    const badgeH = 20;
    const bx = canvasW - padR - badgeW;
    const by = startY;

    // Badge background
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#0a0806';
    ctx.beginPath();
    ctx.roundRect(bx, by, badgeW, badgeH, 3);
    ctx.fill();

    // Badge border with rank tint
    ctx.globalAlpha = 0.6;
    ctx.strokeStyle = rank.tint || '#888888';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(bx, by, badgeW, badgeH, 3);
    ctx.stroke();

    // Rank text
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = rank.tint || '#ccccaa';
    ctx.fillText(text, canvasW - padR - 8, by + 5);

    ctx.restore();
}

