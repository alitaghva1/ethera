//  GAME LOOP
// ============================================================
let lastTime = 0;
let _frameDt = 0.016; // cached dt for render() access (updated each frame)
let _frameNow = 0;    // cached performance.now()/1000 — set once per frame

// ── Hoisted render constants (avoid rebuilding every frame) ──
const _ZONE_TINTS = {
    // Zone 0 (Hamlet): no tint — outdoor lighting handles atmosphere
    1: 'rgba(170, 150, 130, 0.78)',  // Undercroft: warm earthy brown
    2: 'rgba(150, 160, 145, 0.78)',  // Ruined Tower: mossy grey-green
    3: 'rgba(170, 155, 120, 0.76)',  // Spire: sickly amber
    4: 'rgba(180, 140, 130, 0.75)',  // Inferno: warm red push
    5: 'rgba(135, 150, 175, 0.76)',  // Frozen: cold blue shift
    6: 'rgba(155, 135, 170, 0.76)',  // Throne: purple corruption
};
const _fgConfigs = {
    0: { color: 'rgba(140, 130, 110, ', count: 2, speed: 0.10, size: 60 },   // hamlet: warm dust
    1: { color: 'rgba(80, 70, 55, ', count: 2, speed: 0.08, size: 60 },       // dungeon: dusty wisps
    2: { color: 'rgba(70, 80, 60, ', count: 2, speed: 0.10, size: 70 },       // tower: mossy haze
    4: { color: 'rgba(100, 30, 10, ', count: 2, speed: 0.12, size: 70 },      // inferno: heat haze
    5: { color: 'rgba(80, 100, 130, ', count: 3, speed: 0.10, size: 80 },     // frozen: ice fog
    6: { color: 'rgba(60, 30, 80, ', count: 2, speed: 0.08, size: 60 },       // throne: void mist
};

// ── Auto-update notifications (Electron only) ──────────────
if (typeof window !== 'undefined' && window.ethera && window.ethera.isElectron) {
    window.ethera.onUpdateAvailable(function(info) {
        console.log('Update available:', info.version);
        if (typeof Notify !== 'undefined') {
            Notify.toast('Update v' + info.version + ' found — downloading...', {
                id: 'update-available',
                duration: 5,
                color: '#88ccff',
                borderColor: '#4488cc',
                position: 'bottom'
            });
        }
    });
    window.ethera.onUpdateDownloaded(function(info) {
        console.log('Update downloaded:', info.version);
        if (typeof Notify !== 'undefined') {
            Notify.toast('Update v' + info.version + ' ready — restart to apply', {
                id: 'update-downloaded',
                duration: 8,
                color: '#88ffaa',
                borderColor: '#44aa66',
                position: 'bottom'
            });
        }
    });
}

// Sprite sorting pooled array — reused each frame to eliminate GC pressure
const spritePool = [];

// ============================================================
// GLOW CACHE SYSTEM - Cache static radial gradients
// ============================================================
const glowCache = {}; // Maps cacheKey -> offscreen canvas

/**
 * Generate a cache key based on gradient parameters.
 * For static glows, the key is based on color stops and radius only (not position).
 */
function getGlowCacheKey(colorStops, radius, tag = '') {
    // colorStops: array like [['rgba(...)', 0], ['rgba(...)', 0.5], ...]
    // Create a deterministic string key
    let key = `${tag}_r${radius}`;
    for (const [color, pos] of colorStops) {
        key += `_${color}_${pos}`;
    }
    return key;
}

/**
 * Get or create a cached offscreen canvas with pre-rendered glow.
 * Returns a canvas with the gradient already rendered at the center.
 * Use with ctx.drawImage(canvas, x - radius, y - radius) to render positioned glows.
 */
function getGlowCanvas(cacheKey, radius, colorStops) {
    if (glowCache[cacheKey]) {
        return glowCache[cacheKey];
    }

    // Create offscreen canvas at 2x radius to fit the entire glow
    const size = radius * 2;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // Draw radial gradient centered on the canvas
    const grad = ctx.createRadialGradient(radius, radius, 0, radius, radius, radius);
    for (const [color, pos] of colorStops) {
        grad.addColorStop(pos, color);
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    // Evict oldest entry if cache is too large
    if (Object.keys(glowCache).length >= 64) {
        delete glowCache[Object.keys(glowCache)[0]];
    }
    glowCache[cacheKey] = canvas;
    return canvas;
}

/**
 * Clear glow cache (call on zone load or when needed)
 */
function clearGlowCache() {
    for (const key in glowCache) {
        delete glowCache[key];
    }
    // Also invalidate darkness gradient cache (defined in rendering.js)
    _darkGradCache = null;
    _darkGradCacheKey = '';
}
// Error boundary state
let gameLoopErrors = 0;
let gameLoopCrashed = false;
const GAME_LOOP_ERROR_THRESHOLD = 10;

// ============================================================
//  PHASE UPDATE FUNCTIONS — extracted from gameLoop for clarity
// ============================================================

/** Returns true if the phase was handled (caller should return early). */
function updateHitPause(dt) {
    if (hitPauseTimer > 0) {
        hitPauseTimer -= dt;
        render();
        if (gameDead) drawDeathScreen();
        return true;
    }
    return false;
}

function updatePreMenuPhase(dt) {
    menuTime += dt;
    preMenuAlpha = Math.min(1, preMenuAlpha + dt * 1.2);
}

function updateMenuPhase(dt) {
    menuTime += dt;
    updateMenuEmbers(dt);
    if (menuFadeAlpha < 1) menuFadeAlpha = Math.min(1, menuFadeAlpha + dt * 2.5);

    // Update hover state from mouse position
    menuHover = null;
    if (gamePhase === 'menu') {
        const btns = getMenuButtons();
        if (pointInButton(mouse.x, mouse.y, btns.start)) menuHover = 'start';
        else if (pointInButton(mouse.x, mouse.y, btns.loadGame) && !btns.loadGame.disabled) menuHover = 'loadGame';
        else if (pointInButton(mouse.x, mouse.y, btns.controls)) menuHover = 'controls';
        else if (btns.options && pointInButton(mouse.x, mouse.y, btns.options)) menuHover = 'options';
    } else if (gamePhase === 'menuControls') {
        const backBtn = getControlsBackButton();
        if (pointInButton(mouse.x, mouse.y, backBtn)) menuHover = 'back';
    }
    setPixelCursor(menuHover ? 'pointer' : 'default');
}

function updateNameEntryPhase(dt) {
    menuTime += dt;
    setPixelCursor('default');
}

function updateLoadScreenPhase(dt) {
    menuTime += dt;
    updateMenuEmbers(dt);
    setPixelCursor(loadScreenHover >= 0 || loadScreenDeleteHover >= 0 || loadScreenConfirmDelete >= 0 ? 'pointer' : 'default');
}

function updateMenuFadePhase(dt) {
    menuTime += dt;
    updateMenuEmbers(dt);
    menuFadeAlpha = Math.max(0, menuFadeAlpha - dt * 3);
    setPixelCursor('default');
    if (menuFadeAlpha <= 0) {
        // runIntro() sets gamePhase = 'intro' itself — don't override it here.
        if (menuFadeTarget !== 'intro') gamePhase = menuFadeTarget;
        if (menuFadeTarget === 'menuControls') {
            menuFadeAlpha = 0;
        } else if (menuFadeTarget === 'menu') {
            menuFadeAlpha = 0;
        } else if (menuFadeTarget === 'nameEntry') {
            nameEntryAlpha = 0;
            nameEntryBlink = 0;
            if (nameInputEl) { nameInputEl.value = ''; nameInputEl.focus(); }
        } else if (menuFadeTarget === 'loadScreen') {
            loadScreenAlpha = 0;
            loadScreenConfirmDelete = -1;
            loadSaveSlots(); // refresh slots
        } else if (menuFadeTarget === 'intro') {
            runIntro();
        }
    }
}

// ============================================================
//  INTRO PHASE — clean text-on-black → world reveal (6.5s)
// ============================================================
function updateIntroPhase(dt) {
    introTimer += dt;
    const t = introTimer;

    // === UNIFIED CARDIAC PULSE ===
    // One variable drives all visual feedback. Baseline breathing +
    // heartbeat spikes create one seamless escalating rhythm.

    // Baseline breathing (0-8s): slow warm pulse before beats start
    if (t < 8.0) {
        const breathBase = 0.04 + Math.sin(t * 0.9) * 0.03; // 0.01–0.07
        introPulse = Math.max(introPulse, breathBase);
    }

    // Data-driven heartbeat triggers
    if (typeof sfxCinematicHeartbeat === 'function') {
        while (_introBeatIndex < INTRO_BEATS.length && t >= INTRO_BEATS[_introBeatIndex].time) {
            const beat = INTRO_BEATS[_introBeatIndex];
            sfxCinematicHeartbeat(beat.vol);
            introPulse = beat.pulse; // spike — exponential decay handles the falloff
            _introBeatIndex++;
        }
    }

    // Exponential decay — fast initial drop, slow organic tail
    if (introPulse > 0.01) {
        const decayFactor = Math.pow(0.06, Math.min(dt, 0.1)); // clamp dt to prevent NaN on huge frames
        introPulse *= isFinite(decayFactor) ? decayFactor : 0;
    }

    // === MUSIC ===
    if (t >= 24.0 && !introMusicStarted) {
        introMusicStarted = true;
        try { playMusic('cinematic', 4.0); } catch(e) {}
    }

    // === REVEAL PHASE (26.0-28.0s) ===
    if (t > 26.0 && t <= INTRO_DURATION) {
        const revealT = Math.min(1, (t - 26.0) / 2.0);
        const eased = 1 - (1 - revealT) * (1 - revealT);
        lightRadius = 80 + (MAX_LIGHT - 80) * eased;
        if (typeof updateCamera === 'function') updateCamera(dt);
    }

    // End intro (one-shot — gamePhase change prevents re-entry next frame)
    if (t >= INTRO_DURATION && gamePhase !== 'playing') {
        smoothCamX = cameraX;
        smoothCamY = cameraY;
        gamePhase = 'playing';
        lightRadius = MAX_LIGHT;
        setPixelCursor('none');
        if (typeof startAmbient === 'function') startAmbient(currentZone);
        else if (typeof startAmbientAudio === 'function') startAmbientAudio(currentZone);
        if (typeof Notify !== 'undefined') Notify.showControlsOnce();
        pickupTexts.push({
            text: 'Two paths lie before you...',
            color: typeof COLORS !== 'undefined' ? COLORS.TEXT_HINT : '#aabbff',
            row: player.row, col: player.col,
            offsetY: 0, life: 5.0,
        });
        setTimeout(function() {
            if (typeof Notify !== 'undefined' && currentZone === 7) {
                Notify.hint('antechamber_nav', 'Press E near glowing exits to enter.', 4, { color: '#c4a878' });
            }
        }, 3000);
    }
}

function drawIntroOverlay() {
    const t = introTimer;
    ctx.save();

    // Black overlay — opaque through everything, fades during reveal (26-28s)
    let overlayAlpha = 1.0;
    if (t > 26.0) overlayAlpha = Math.max(0, 1 - (t - 26.0) / 2.0);

    if (overlayAlpha > 0.01) {
        ctx.globalAlpha = overlayAlpha;
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvasW, canvasH);
    }

    // === UNIFIED CARDIAC PULSE VISUAL ===
    // One radial glow driven by introPulse. Center = warm amber light,
    // edges = dark vignette. Creates a heartbeat of light in darkness.
    if (introPulse > 0.005) {
        ctx.globalCompositeOperation = 'lighter';

        // Center glow — warm amber/crimson, radius scales with pulse
        const glowRadius = canvasH * (0.15 + introPulse * 0.45); // 15%–60% of screen
        ctx.globalAlpha = introPulse * 0.7;
        const glowGrad = ctx.createRadialGradient(canvasW/2, canvasH/2, 0, canvasW/2, canvasH/2, glowRadius);
        glowGrad.addColorStop(0, 'rgba(220, 120, 50, 1)');   // warm amber center
        glowGrad.addColorStop(0.3, 'rgba(180, 50, 20, 0.6)'); // crimson mid
        glowGrad.addColorStop(0.7, 'rgba(100, 20, 8, 0.2)');  // dark red outer
        glowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = glowGrad;
        ctx.fillRect(0, 0, canvasW, canvasH);

        // Edge vignette — warm border that pulses with the heartbeat
        ctx.globalAlpha = introPulse * 0.35;
        const vigGrad = ctx.createRadialGradient(canvasW/2, canvasH/2, canvasH * 0.25, canvasW/2, canvasH/2, canvasH * 0.8);
        vigGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
        vigGrad.addColorStop(0.6, 'rgba(80, 15, 5, 0.3)');
        vigGrad.addColorStop(1, 'rgba(140, 30, 10, 1)');
        ctx.fillStyle = vigGrad;
        ctx.fillRect(0, 0, canvasW, canvasH);

        ctx.globalCompositeOperation = 'source-over';
    }

    // Skip hint — fades in after 4s
    if (t > 4.0 && t < 24.0) {
        const skipAlpha = Math.min(0.18, (t - 4.0) * 0.06);
        ctx.globalAlpha = skipAlpha;
        ctx.font = '9px monospace';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = '#666';
        ctx.fillText('Press any key to skip', canvasW - 20, canvasH - 16);
    }

    // --- Text rendering ---
    ctx.globalAlpha = 1;
    const cx = canvasW / 2;
    const baseY = canvasH * 0.42;

    // LINE 0: "You awaken on cold stone."
    // Hazy, small — a thought forming through fog
    //   1.0-3.0: fade in (2.0s)
    //   3.0-4.0: hold
    //   4.0-5.0: fade out (1.0s)
    let a0 = 0;
    if (t >= 1.0 && t < 3.0) a0 = Math.min(1, (t - 1.0) / 2.0);
    if (t >= 3.0 && t < 4.0) a0 = 1;
    if (t >= 4.0 && t < 5.0) a0 = 1 - (t - 4.0) / 1.0;
    if (a0 > 0.01) {
        ctx.globalAlpha = a0 * 0.7; // hazy, like a thought
        ctx.font = '16px Georgia';
        ctx.textAlign = 'center';
        ctx.shadowColor = 'rgba(0,0,0,0.4)';
        ctx.shadowBlur = 10; // blurrier — dreamy
        ctx.fillStyle = '#998a70';
        ctx.fillText('You awaken on cold stone.', cx, baseY);
    }

    // LINE 1: "They left you for dead."
    // Appears AFTER line 0 is gone. Sharper, more present — reality hitting.
    // HOLDS LONG — let the weight of this land.
    //   5.5-7.0: fade in (1.5s)
    //   7.0-8.5: HOLD (1.5s — feel it)
    //   8.5-9.5: fade out (1.0s — slow dissolve into void)
    let a1 = 0;
    if (t >= 5.5 && t < 7.0) a1 = Math.min(1, (t - 5.5) / 1.5);
    if (t >= 7.0 && t < 8.5) a1 = 1;
    if (t >= 8.5 && t < 9.5) a1 = 1 - (t - 8.5) / 1.0;
    if (a1 > 0.01) {
        ctx.globalAlpha = a1 * 0.9;
        ctx.font = '20px Georgia';
        ctx.textAlign = 'center';
        ctx.shadowColor = 'rgba(0,0,0,0.6)';
        ctx.shadowBlur = 4; // sharper than line 0
        ctx.fillStyle = '#bbaa88'; // brighter — more present
        ctx.fillText('They left you for dead.', cx, baseY);
    }

    // LINE 2: "They were wrong."
    // Appears right after beat 12 peak (19.5s). Quick defiant reveal.
    // HOLDS for 2.5 seconds. Then fades. Silence. Music. World.
    //   19.5-19.9: reveal (0.4s)
    //   19.9-22.4: HOLD at full (2.5s)
    //   22.4-23.4: slow fade out (1.0s)
    let a2 = 0;
    if (t >= 19.5 && t < 19.9) a2 = Math.min(1, (t - 19.5) / 0.4);
    if (t >= 19.9 && t < 22.4) a2 = 1;
    if (t >= 22.4 && t < 23.4) a2 = 1 - (t - 22.4) / 1.0;
    if (a2 > 0.01) {
        const scaleT = Math.min(1, (t - 19.5) / 3.0);
        const scale = 1.08 - 0.08 * scaleT;
        const glowBuild = Math.min(1, (t - 19.5) / 2.0);

        ctx.save();
        ctx.translate(cx, canvasH * 0.44);
        ctx.scale(scale, scale);
        ctx.textAlign = 'center';
        ctx.font = 'italic 28px Georgia';

        // Outer halo
        ctx.shadowColor = 'rgba(200, 155, 70, ' + (glowBuild * 0.18 * a2) + ')';
        ctx.shadowBlur = 55;
        ctx.globalAlpha = a2 * 0.3;
        ctx.fillStyle = 'rgba(230, 205, 155, ' + (a2 * 0.3) + ')';
        ctx.fillText('They were wrong.', 0, 0);

        // Mid glow
        ctx.shadowColor = 'rgba(225, 180, 90, ' + (glowBuild * 0.45 * a2) + ')';
        ctx.shadowBlur = 25;
        ctx.globalAlpha = a2 * 0.6;
        ctx.fillStyle = 'rgba(230, 205, 155, ' + (a2 * 0.6) + ')';
        ctx.fillText('They were wrong.', 0, 0);

        // Core text
        ctx.shadowColor = 'rgba(240, 200, 120, ' + (glowBuild * 0.8 * a2) + ')';
        ctx.shadowBlur = 8;
        ctx.globalAlpha = a2;
        ctx.fillStyle = '#e6cd9b';
        ctx.fillText('They were wrong.', 0, 0);

        ctx.restore();
    }

    ctx.restore();
}

// ============================================================
//  DOOR GLOWS — persistent colored light pools at zone exits
// ============================================================
// ============================================================
//  EVOLUTION HUD INDICATOR — milestone dots at top-right
// ============================================================
function drawEvolutionIndicator() {
    if (typeof getEvolutionProgress !== 'function') return;
    if (gamePhase !== 'playing' || gameDead) return;
    const prog = getEvolutionProgress();
    if (!prog) return;

    const x = canvasW - 60;
    const y = 58;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.globalAlpha = 0.8;

    // Milestone dots
    const dotR = 3;
    const dotGap = 10;
    const totalW = (prog.total - 1) * dotGap;
    const startX = x - totalW / 2;

    for (let i = 0; i < prog.total; i++) {
        const dx = startX + i * dotGap;
        ctx.beginPath();
        ctx.arc(dx, y, dotR, 0, Math.PI * 2);
        if (i < prog.met) {
            ctx.fillStyle = '#e8c840';
            ctx.fill();
        } else {
            ctx.strokeStyle = '#8a7a5a';
            ctx.lineWidth = 1;
            ctx.stroke();
        }
    }

    // Label
    ctx.font = '9px monospace';
    ctx.fillStyle = prog.met >= prog.total ? '#e8c840' : '#8a7a5a';
    ctx.globalAlpha = 0.7;
    ctx.fillText('EVOLVE', x, y + 12);

    ctx.restore();
}

// Track which door positions we've already drawn a portal for (dedup adjacent tiles)
function drawDoorGlows() {
    if (typeof DOOR_DEFS === 'undefined' || !DOOR_DEFS) return;
    if (gamePhase === 'cinematic' || gamePhase === 'preMenu' || gamePhase === 'menu') return;
    const t = _frameNow;

    // Group doors by destination+row to draw one portal per exit (not per tile)
    const drawn = {};
    for (const [key, def] of Object.entries(DOOR_DEFS)) {
        if (def.used) continue;
        const [r, c] = key.split(',').map(Number);
        const groupKey = def.destination + '_' + r;
        if (drawn[groupKey]) continue; // already drew this portal row
        drawn[groupKey] = true;

        // Find center of this door group (average col of all tiles with same dest+row)
        let colSum = 0, colCount = 0;
        for (const [k2, d2] of Object.entries(DOOR_DEFS)) {
            const [r2, c2] = k2.split(',').map(Number);
            if (r2 === r && d2.destination === def.destination) { colSum += c2; colCount++; }
        }
        const centerCol = colSum / colCount;
        const pos = tileToScreen(r, centerCol);
        const sx = pos.x + cameraX, sy = pos.y + cameraY;
        if (sx < -200 || sx > canvasW + 200 || sy < -200 || sy > canvasH + 200) continue;
        if (typeof fogRevealed !== 'undefined' && fogRevealed[r] && fogRevealed[r][c] < 0.2) continue;

        const dest = def.destination;
        let cr, cg, cb;
        if (dest === 'zone1' || dest === 'next') { cr = 220; cg = 130; cb = 40; }
        else if (dest === 'town') { cr = 200; cg = 190; cb = 130; }
        else if (dest === 'deepest') { cr = 150; cg = 60; cb = 220; }
        else { cr = 100; cg = 150; cb = 230; }

        const portalW = 44;
        const portalH = 58;
        const pulse = 0.6 + Math.sin(t * 2 + r) * 0.15;
        const innerPulse = 0.4 + Math.sin(t * 3 + r + 1) * 0.2;

        ctx.save();

        // Outer glow halo on ground
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = pulse * 0.2;
        const haloGrad = ctx.createRadialGradient(sx, sy, 0, sx, sy, portalW * 1.5);
        haloGrad.addColorStop(0, 'rgba(' + cr + ',' + cg + ',' + cb + ',0.3)');
        haloGrad.addColorStop(1, 'rgba(' + cr + ',' + cg + ',' + cb + ',0)');
        ctx.fillStyle = haloGrad;
        ctx.fillRect(sx - portalW * 2, sy - portalW, portalW * 4, portalW * 2);

        // Portal ring — vertical ellipse (reads as a doorway)
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = pulse * 0.7;
        ctx.strokeStyle = 'rgba(' + cr + ',' + cg + ',' + cb + ',0.8)';
        ctx.lineWidth = 2.5;
        ctx.shadowColor = 'rgba(' + cr + ',' + cg + ',' + cb + ',0.6)';
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.ellipse(sx, sy - portalH * 0.4, portalW, portalH, 0, 0, Math.PI * 2);
        ctx.stroke();

        // Inner ring (slightly smaller, brighter)
        ctx.globalAlpha = innerPulse * 0.5;
        ctx.strokeStyle = 'rgba(' + Math.min(255, cr + 40) + ',' + Math.min(255, cg + 40) + ',' + Math.min(255, cb + 40) + ',0.6)';
        ctx.lineWidth = 1.5;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.ellipse(sx, sy - portalH * 0.4, portalW * 0.7, portalH * 0.7, 0, 0, Math.PI * 2);
        ctx.stroke();

        // Inner fill — dark center with color tint
        ctx.globalAlpha = innerPulse * 0.15;
        ctx.shadowBlur = 0;
        const fillGrad = ctx.createRadialGradient(sx, sy - portalH * 0.4, 0, sx, sy - portalH * 0.4, portalH * 0.6);
        fillGrad.addColorStop(0, 'rgba(' + cr + ',' + cg + ',' + cb + ',0.4)');
        fillGrad.addColorStop(0.7, 'rgba(' + Math.floor(cr/3) + ',' + Math.floor(cg/3) + ',' + Math.floor(cb/3) + ',0.3)');
        fillGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = fillGrad;
        ctx.beginPath();
        ctx.ellipse(sx, sy - portalH * 0.4, portalW * 0.65, portalH * 0.65, 0, 0, Math.PI * 2);
        ctx.fill();

        // Orbiting sparkle particles (3 particles rotating around the ring)
        ctx.globalCompositeOperation = 'screen';
        for (let pi = 0; pi < 3; pi++) {
            const angle = t * 1.8 + (pi / 3) * Math.PI * 2;
            const sparkX = sx + Math.cos(angle) * portalW * 0.85;
            const sparkY = (sy - portalH * 0.4) + Math.sin(angle) * portalH * 0.85;
            const sparkAlpha = 0.4 + Math.sin(t * 5 + pi * 2) * 0.3;
            ctx.globalAlpha = sparkAlpha;
            ctx.fillStyle = 'rgba(' + Math.min(255, cr + 50) + ',' + Math.min(255, cg + 50) + ',' + Math.min(255, cb + 50) + ',1)';
            ctx.beginPath();
            ctx.arc(sparkX, sparkY, 2, 0, Math.PI * 2);
            ctx.fill();
        }

        // Destination label — always visible above portal
        ctx.globalCompositeOperation = 'source-over';
        let portalLabel = '';
        let portalArrow = '';
        if (dest === 'zone1' || dest === 'next') { portalLabel = 'The Dungeon'; portalArrow = '\u2193'; }
        else if (dest === 'town') { portalLabel = 'The Hamlet'; portalArrow = '\u2191'; }
        else if (dest === 'deepest') { portalLabel = 'The Abyss'; portalArrow = '\u2193'; }
        else if (dest === 'zone2') { portalLabel = 'Ascend'; portalArrow = '\u2191'; }
        else { portalLabel = def.label || ''; }

        if (portalLabel) {
            // Fade out label when player is close (door prompt takes over)
            const _pDist = Math.sqrt((r - player.row) ** 2 + (centerCol - player.col) ** 2);
            if (_pDist < 2.5) { ctx.restore(); continue; } // hide when door prompt is visible
            const labelY = sy - portalH - 8;
            const labelAlpha = 0.5 + Math.sin(t * 1.2 + r) * 0.15;
            ctx.globalAlpha = labelAlpha;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = 'italic 11px Georgia';
            ctx.shadowColor = 'rgba(0,0,0,0.8)';
            ctx.shadowBlur = 4;
            ctx.fillStyle = 'rgba(' + cr + ',' + cg + ',' + cb + ',1)';
            ctx.fillText(portalLabel + ' ' + portalArrow, sx, labelY);
            ctx.shadowBlur = 0;
        }

        ctx.restore();
    }
}

function updateCinematicPhase(dt) {
    cinematicTimer += dt;
    const t = cinematicTimer;

    // === NARRATIVE TEXT — three-phase reveal ===
    for (let i = 0; i < 2; i++) {
        if (t > CINEMATIC_01_FADE_OUT) {
            cinematicTextAlpha[i] = Math.max(0, cinematicTextAlpha[i] - dt * 2.0);
        } else if (t >= CINEMATIC_LINE_TIMINGS[i]) {
            cinematicTextAlpha[i] = Math.min(1, cinematicTextAlpha[i] + dt * 1.2);
        }
    }
    if (t > CINEMATIC_2_FADE_OUT) {
        cinematicTextAlpha[2] = Math.max(0, cinematicTextAlpha[2] - dt * 2.5);
    } else if (t >= CINEMATIC_LINE_TIMINGS[2]) {
        cinematicTextAlpha[2] = Math.min(1, cinematicTextAlpha[2] + dt * 1.2);
    }
    if (t > CINEMATIC_TEXT_FADE_OUT) {
        cinematicTextAlpha[3] = Math.max(0, cinematicTextAlpha[3] - dt * 1.2);
    } else if (t >= CINEMATIC_LINE_TIMINGS[3]) {
        cinematicTextAlpha[3] = Math.min(1, cinematicTextAlpha[3] + dt * 0.6);
    }

    // === CINEMATIC SFX CUES ===
    if (t >= 0.1 && !cinematicSFX_heartbeat && sfxCtx) {
        cinematicSFX_heartbeat = true;
        sfxCinematicHeartbeat();
    }
    if (t >= CINEMATIC_2_FADE_OUT && !cinematicSFX_ducked) {
        cinematicSFX_ducked = true;
        duckMusic(true);
    }
    if (t >= CINEMATIC_LINE_TIMINGS[3] - 0.3 && !cinematicSFX_unducked) {
        cinematicSFX_unducked = true;
        duckMusic(false);
    }
    if (t >= CINEMATIC_RISE_START + 0.1 && !cinematicSFX_stir && sfxCtx) {
        cinematicSFX_stir = true;
        sfxCinematicStir();
    }
    if (t >= CINEMATIC_RISE_START + CINEMATIC_RISE_DURATION * 0.7 && !cinematicSFX_stand && sfxCtx) {
        cinematicSFX_stand = true;
        sfxCinematicStand();
    }

    // === CAMERA PAN ===
    const panProgress = Math.min(1, t / CINEMATIC_PAN_DURATION);
    const eased = 1 - Math.pow(1 - panProgress, 3);
    const targetRow = 4, targetCol = 3;
    const camRow = cinematicCamRow + (targetRow - cinematicCamRow) * eased;
    const camCol = cinematicCamCol + (targetCol - cinematicCamCol) * eased;
    const camPos = tileToScreen(camRow, camCol);
    smoothCamX = canvasW / 2 - camPos.x;
    smoothCamY = canvasH / 2 - camPos.y;
    cameraX = Math.round(smoothCamX);
    cameraY = Math.round(smoothCamY);

    // === LIGHT — atmospheric dim during pan ===
    if (t < CINEMATIC_LIGHT_SWELL_START) {
        const baseRadius = 80 + Math.min(35, t * 4);
        const breath = Math.sin(t * 1.2) * 6;
        const flick = Math.sin(t * 7.3) * 2 + Math.sin(t * 11) * 1.5;
        lightRadius = Math.max(50, baseRadius + breath + flick);

        if (t < 0.4) {
            const flickPulse = Math.sin(t * Math.PI / 0.2) * 12;
            lightRadius += Math.max(0, flickPulse);
        }
        if (t > 5.8 && t < CINEMATIC_LINE_TIMINGS[3]) {
            const dipT = (t - 5.8) / (CINEMATIC_LINE_TIMINGS[3] - 5.8);
            const dipEase = Math.sin(dipT * Math.PI * 0.5);
            lightRadius -= dipEase * 32;
        }
        if (t > CINEMATIC_LINE_TIMINGS[3] && t < CINEMATIC_LINE_TIMINGS[3] + 1.5) {
            const bloomT = (t - CINEMATIC_LINE_TIMINGS[3]) / 1.5;
            const bloomEase = 1 - Math.pow(1 - bloomT, 2);
            lightRadius += bloomEase * 35;
        }
        if (t > CINEMATIC_LIGHT_SWELL_START - 0.8) {
            const contrT = (t - (CINEMATIC_LIGHT_SWELL_START - 0.8)) / 0.8;
            lightRadius -= contrT * 25;
            lightRadius = Math.max(50, lightRadius);
        }
    }

    // === BLOOD STAIN ===
    if (t > 7.0) {
        bloodStainAlpha = Math.min(1, (t - 7.0) / 1.5);
    }

    // === PLAYER AWAKENS ===
    if (t >= CINEMATIC_RISE_START) {
        const riseT = Math.min(1, (t - CINEMATIC_RISE_START) / CINEMATIC_RISE_DURATION);
        let riseEased;
        if (riseT < 0.5) {
            const half = riseT / 0.5;
            riseEased = Math.pow(half, 2.5) * 0.35;
        } else {
            const half = (riseT - 0.5) / 0.5;
            riseEased = 0.35 + (1 - Math.pow(1 - half, 2)) * 0.65;
        }
        wizardRotation = (Math.PI / 2) * (1 - riseEased);
        wizardRiseProgress = riseEased;

        if (riseT > 0.02 && riseT < 0.08 && dustParticles.length < 10) {
            const pos = tileToScreen(4, 3);
            spawnDustBurst(pos.x, pos.y, 8);
        }
        if (riseT > 0.45 && riseT < 0.55 && dustParticles.length < 40) {
            const pos = tileToScreen(4, 3);
            spawnDustBurst(pos.x, pos.y, 22);
        }
        if (riseT > 0.4 && riseT < 0.65 && !cinematicShakeTriggered) {
            cinematicShakeTriggered = true;
            addScreenShake(3.5, 0.6);
        }
    }

    // === LIGHT SWELL ===
    if (t >= CINEMATIC_LIGHT_SWELL_START) {
        const swellT = (t - CINEMATIC_LIGHT_SWELL_START) / (CINEMATIC_TOTAL - CINEMATIC_LIGHT_SWELL_START);
        const x = Math.min(1, swellT);
        const swellEased = x < 0.6
            ? (x / 0.6) * (x / 0.6) * (3 - 2 * (x / 0.6)) * 1.18
            : 1.18 - 0.18 * ((x - 0.6) / 0.4);
        lightRadius = 90 + (MAX_LIGHT - 90) * Math.min(1.18, swellEased);
    }

    // === TRANSITION FLASH ===
    if (t >= CINEMATIC_TOTAL - 0.5) {
        const flashT = (t - (CINEMATIC_TOTAL - 0.5)) / 0.5;
        cinematicFlashAlpha = flashT < 0.25
            ? (flashT / 0.25) * 0.30
            : 0.30 * (1 - (flashT - 0.25) / 0.75);
    }

    updateDustParticles(dt);

    // === END → PLAYING ===
    if (t >= CINEMATIC_TOTAL) {
        gamePhase = 'playing';
        lightRadius = MAX_LIGHT;
        wizardRotation = 0;
        wizardRiseProgress = 1;
        cinematicFlashAlpha = 0;
        setPixelCursor('none');
        cinematicActionHintAlpha = 1.0;
        if (typeof Notify !== 'undefined') Notify.showControlsOnce();
        // Show context-appropriate hint based on starting zone
        const _isStartTown = (typeof currentZone !== 'undefined' && currentZone === 0);
        pickupTexts.push({
            text: _isStartTown ? 'Choose your path...' : 'Find a way out...',
            color: COLORS.TEXT_HINT,
            row: player.row, col: player.col,
            offsetY: 0,
            life: _isStartTown ? 5.0 : 3.0,
        });
        // Only start waves in combat zones
        if (!_isStartTown) {
            setTimeout(() => { startWaveSystem(); }, 1500);
        }
    }
}

function updateVisionFlashPhase(dt) {
    visionFlashTimer += dt;
    const vt = visionFlashTimer;

    render();
    ctx.save();

    // Dark overlay
    let overlayAlpha = 0;
    if (vt < 1.0) overlayAlpha = vt / 1.0 * 0.85;
    else if (vt < 4.5) overlayAlpha = 0.85;
    else overlayAlpha = Math.max(0, 0.85 * (1 - (vt - 4.5) / 1.5));

    ctx.globalAlpha = overlayAlpha;
    ctx.fillStyle = COLORS.VISION_DARK;
    ctx.fillRect(0, 0, canvasW, canvasH);

    // Purple pulse from center
    if (vt > 0.5 && vt < 5.0) {
        const pulseA = Math.min(1, (vt - 0.5) / 1.0) * (vt < 4.5 ? 1 : (1 - (vt - 4.5) / 0.5));
        ctx.globalAlpha = pulseA * 0.15;
        const pulse = ctx.createRadialGradient(canvasW/2, canvasH/2, 0, canvasW/2, canvasH/2, 300);
        pulse.addColorStop(0, COLORS.VISION_PURPLE);
        pulse.addColorStop(1, 'rgba(60, 20, 120, 0)');
        ctx.fillStyle = pulse;
        ctx.fillRect(0, 0, canvasW, canvasH);
    }

    // Vision text — different content for Zone 3 vs Zone 5
    const cx = canvasW / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const lines = window._visionFlashZone5 ? [
        { text: 'The talisman BURNS.', time: 1.5, y: canvasH * 0.36 },
        { text: 'You see her face \u2014 gaunt, pale, but her eyes find yours.', time: 2.2, y: canvasH * 0.44 },
        { text: "'You came,' she whispers. Not with relief. With fear.", time: 3.0, y: canvasH * 0.52 },
        { text: "'You shouldn't have come.'", time: 3.8, y: canvasH * 0.62 },
    ] : [
        { text: 'The talisman burns.', time: 1.5, y: canvasH * 0.38 },
        { text: 'A vision \u2014 a throne, deep below.', time: 2.2, y: canvasH * 0.46 },
        { text: 'She sits there. Eyes open. Holding everything together.', time: 3.0, y: canvasH * 0.54 },
        { text: 'Something below is calling.', time: 3.8, y: canvasH * 0.64 },
    ];
    for (const line of lines) {
        if (vt > line.time) {
            const lineAge = vt - line.time;
            const fadeIn = Math.min(1, lineAge / 0.6);
            const fadeOut = vt > 4.5 ? Math.max(0, 1 - (vt - 4.5) / 1.0) : 1;
            ctx.globalAlpha = fadeIn * fadeOut * 0.8;
            ctx.font = 'italic 14px Georgia';
            ctx.fillStyle = COLORS.VISION_TEXT;
            ctx.shadowColor = 'rgba(140, 80, 220, 0.5)';
            ctx.shadowBlur = 8;
            ctx.fillText(line.text, cx, line.y);
            ctx.shadowBlur = 0;
        }
    }
    ctx.restore();

    if (vt >= 6.0) {
        gamePhase = 'playing';
        currentObjective = window._visionFlashZone5 ? 'She is waiting...' : 'The talisman pulls you downward...';
        window._visionFlashZone5 = false; // clear Zone 5 flag after use
    }
}

// Zone transition target → zone number lookup
const ZONE_TARGET_MAP = {
    town: 0, zone1: 1, zone2: 2, zone3: 3,
    zone4: 4, zone5: 5, zone6: 6, antechamber: 7,
};
// Temp vars for passing procedural config through zone transitions
let _nextProceduralTheme = null;
let _nextProceduralDepth = 1;

// ── AMBIENT ATMOSPHERE PARTICLES ──
let _ambientTimer = 0;
let _arrivalVignetteTimer = 0; // dissipating edge vignette on zone entry
let _lowHpBeatTimer = 0;       // heartbeat sound timer for low HP
let _screenFlashTimer = 0;     // brief white screen flash (seal break, events)
let _screenFlashColor = '#ffffff';

function triggerScreenFlash(duration, color) {
    _screenFlashTimer = duration || 0.2;
    _screenFlashColor = color || '#ffffff';
}

// ============================================================
//  COMBAT DECALS — persistent blood/scorch marks on the floor
// ============================================================
const _combatDecals = [];
const _DECAL_MAX = 30;
const _DECAL_LIFE = 18; // seconds before fade starts

function spawnCombatDecal(row, col, color, size) {
    if (_combatDecals.length >= _DECAL_MAX) _combatDecals.shift();
    _combatDecals.push({
        row, col, color: color || '#441111',
        size: size || (3 + Math.random() * 3),
        life: _DECAL_LIFE + Math.random() * 4,
        maxLife: _DECAL_LIFE + 4,
    });
}

function drawCombatDecals() {
    if (_combatDecals.length === 0) return;
    const _decalDt = typeof _frameDt !== 'undefined' ? _frameDt : 1/60;
    ctx.save();
    for (let i = _combatDecals.length - 1; i >= 0; i--) {
        const d = _combatDecals[i];
        d.life -= _decalDt;
        if (d.life <= 0) { _combatDecals.splice(i, 1); continue; }
        const pos = tileToScreen(d.row, d.col);
        const sx = pos.x + cameraX, sy = pos.y + cameraY;
        if (sx < -50 || sx > canvasW + 50 || sy < -50 || sy > canvasH + 50) continue;
        // Fade in last 3 seconds of life
        const alpha = d.life < 3 ? d.life / 3 : 1;
        ctx.globalAlpha = alpha * 0.25;
        ctx.fillStyle = d.color;
        ctx.beginPath();
        ctx.ellipse(sx, sy + 2, d.size, d.size * 0.4, 0, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}
const _AMBIENT_MAX = 12;
const _AMBIENT_CONFIGS = {
    dungeon: { color: '#998866', size: 1.0, alpha: 0.08, vy: -0.2, life: 3.5 },  // warm amber dust motes
    hell:    { color: '#dd6622', size: 1.2, alpha: 0.10, vy: -0.7, life: 2.0 },  // rising ember ash
    frozen:  { color: '#aaccee', size: 1.0, alpha: 0.09, vy: 0.25, life: 3.0 },  // drifting ice crystals
    throne:  { color: '#7744aa', size: 1.0, alpha: 0.07, vy: -0.2, life: 3.0 },  // rising void wisps
    town:    { color: '#8899bb', size: 1.0, alpha: 0.10, vy: -0.1, life: 4.0 },  // ethereal blue-gray motes
};
function spawnAmbientParticles(dt) {
    if (gamePhase !== 'playing' || typeof _emitParticle !== 'function') return;
    _ambientTimer += dt;
    if (_ambientTimer < 0.6) return; // spawn every 0.6s
    _ambientTimer = 0;

    // Determine atmosphere type from current zone
    let cfg;
    const z = currentZone;
    if (z === 0) cfg = _AMBIENT_CONFIGS.town;
    else if (z >= 1 && z <= 3) cfg = _AMBIENT_CONFIGS.dungeon;
    else if (z === 4) cfg = _AMBIENT_CONFIGS.hell;
    else if (z === 5) cfg = _AMBIENT_CONFIGS.frozen;
    else if (z === 6) cfg = _AMBIENT_CONFIGS.throne;
    else if (z === 7) cfg = _AMBIENT_CONFIGS.dungeon; // antechamber uses dungeon dust
    else if (z >= 100) {
        // Procedural — match theme
        const depth = z - 99;
        if (depth <= 2) cfg = _AMBIENT_CONFIGS.dungeon;
        else if (depth <= 4) cfg = _AMBIENT_CONFIGS.hell;
        else cfg = _AMBIENT_CONFIGS.frozen;
    }
    if (!cfg) return;

    // Count existing ambient particles to cap
    let ambientCount = 0;
    for (let i = 0; i < particles.length; i++) { if (particles[i].type === 'ambient') ambientCount++; }
    if (ambientCount >= _AMBIENT_MAX) return;

    // Spawn 1 particle near the player
    const pPos = tileToScreen(player.row, player.col);
    const px = pPos.x + cameraX + (Math.random() - 0.5) * 300;
    const py = pPos.y + cameraY + (Math.random() - 0.5) * 200;
    _emitParticle(px, py,
        (Math.random() - 0.5) * 0.5,
        cfg.vy + (Math.random() - 0.5) * 0.3,
        cfg.life,
        cfg.size,
        cfg.color,
        cfg.alpha,
        'ambient'
    );

    // Town: forge smoke — only when forge is rebuilt
    if (z === 0 && typeof hamletRebuild !== 'undefined' && hamletRebuild.forge && Math.random() < 0.25) {
        const forgePos = tileToScreen(20, 6);
        _emitParticle(forgePos.x + cameraX + (Math.random()-0.5)*25, forgePos.y + cameraY - 10,
            (Math.random()-0.5)*0.2, -0.5 - Math.random()*0.3,
            3.0, 1.2, '#aa8866', 0.08, 'ambient');
        // Occasional bright forge spark
        if (Math.random() < 0.3) {
            _emitParticle(forgePos.x + cameraX + (Math.random()-0.5)*10, forgePos.y + cameraY - 5,
                (Math.random()-0.5)*1.5, -1.5 - Math.random()*0.5,
                0.4, 0.8, '#ffaa33', 0.25, 'ambient');
        }
    }

    // Town: warm glow near shop — only when shop is rebuilt
    if (z === 0 && typeof hamletRebuild !== 'undefined' && hamletRebuild.shop && Math.random() < 0.15) {
        const shopPos = tileToScreen(21, 23);
        _emitParticle(shopPos.x + cameraX + (Math.random()-0.5)*20, shopPos.y + cameraY - 8,
            (Math.random()-0.5)*0.15, -0.3 - Math.random()*0.2,
            2.5, 1.0, '#66cc88', 0.06, 'ambient');
    }

    // Town: guard post lantern flicker — only when guard post is rebuilt
    if (z === 0 && typeof hamletRebuild !== 'undefined' && hamletRebuild.guardPost && Math.random() < 0.12) {
        const guardPos = tileToScreen(6, 6);
        _emitParticle(guardPos.x + cameraX + (Math.random()-0.5)*15, guardPos.y + cameraY - 12,
            (Math.random()-0.5)*0.3, -0.4 - Math.random()*0.2,
            2.0, 0.8, '#ddaa55', 0.10, 'ambient');
    }

    // Town: hermit's hut mystic glow — only when rebuilt
    if (z === 0 && typeof hamletRebuild !== 'undefined' && hamletRebuild.hermitHut && Math.random() < 0.10) {
        const hermitPos = tileToScreen(7, 25);
        _emitParticle(hermitPos.x + cameraX + (Math.random()-0.5)*15, hermitPos.y + cameraY - 10,
            (Math.random()-0.5)*0.2, -0.2 - Math.random()*0.2,
            3.0, 1.2, '#8866cc', 0.07, 'ambient');
    }

    // Town: warm particles near dungeon entrance stairway
    if (z === 0 && Math.random() < 0.25) {
        const dungeonPos = tileToScreen(27, 15);
        const dx = dungeonPos.x + cameraX + (Math.random() - 0.5) * 50;
        const dy = dungeonPos.y + cameraY + (Math.random() - 0.5) * 20;
        _emitParticle(dx, dy,
            (Math.random() - 0.5) * 0.3, -0.4 - Math.random() * 0.3,
            2.5, 0.8, '#cc6633', 0.10, 'ambient'
        );
    }

    // Antechamber: particles at both exits
    if (z === 7) {
        // North exit — warm white-gold (light from the Hamlet above)
        if (Math.random() < 0.3) {
            const nPos = tileToScreen(2, 6);
            _emitParticle(nPos.x + cameraX + (Math.random()-0.5)*40, nPos.y + cameraY,
                (Math.random()-0.5)*0.3, -0.3, 2.5, 0.8, '#ddcc88', 0.12, 'ambient');
        }
        // South exit — warm orange (heat from the dungeon below)
        if (Math.random() < 0.3) {
            const sPos = tileToScreen(10, 6);
            _emitParticle(sPos.x + cameraX + (Math.random()-0.5)*40, sPos.y + cameraY,
                (Math.random()-0.5)*0.3, -0.4, 2.0, 0.8, '#cc6633', 0.10, 'ambient');
        }
    }
}

// ============================================================
//  IMPACT RIPPLE RINGS — expanding shockwave on heavy hits
// ============================================================
const _impactRipples = [];

function spawnImpactRipple(worldX, worldY, color, maxRadius) {
    _impactRipples.push({
        x: worldX, y: worldY,
        radius: 5, maxRadius: maxRadius || 50,
        alpha: 0.6, color: color || '#ffffff',
    });
}

function drawImpactRipples() {
    const _ripDt = typeof _frameDt !== 'undefined' ? _frameDt : 1/60;
    for (let i = _impactRipples.length - 1; i >= 0; i--) {
        const r = _impactRipples[i];
        r.radius += 180 * _ripDt;
        r.alpha -= 2.0 * _ripDt;
        if (r.alpha <= 0) { _impactRipples.splice(i, 1); continue; }
        ctx.save();
        ctx.globalAlpha = r.alpha;
        ctx.strokeStyle = r.color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }
}

// ============================================================
//  CRITTER SYSTEM — ambient creatures that flee from player
//  Rats in dungeons, moths near lights, beetles in hamlet.
// ============================================================
const _critters = [];
const _CRITTER_MAX = 6;
const _CRITTER_FLEE_DIST = 3.0; // tiles
const _CRITTER_COLORS = {
    0: '#665544',  // hamlet: brown rat
    1: '#554433',  // dungeon: dark rat
    2: '#554433',  3: '#554433',
    4: '#cc6622',  // inferno: fire beetle
    5: '#88aacc',  // frozen: ice mite
    6: '#775599',  // throne: void wisp
};

function updateCritters(dt) {
    if (gamePhase !== 'playing') return;
    // Spawn if under cap
    if (_critters.length < _CRITTER_MAX && Math.random() < 0.005) {
        const angle = Math.random() * Math.PI * 2;
        const dist = 5 + Math.random() * 6;
        const cr = player.row + Math.cos(angle) * dist;
        const cc = player.col + Math.sin(angle) * dist;
        const fr = Math.floor(cr), fc = Math.floor(cc);
        if (fr >= 0 && fr < MAP_SIZE && fc >= 0 && fc < MAP_SIZE && !blocked[fr][fc] && floorMap[fr][fc]) {
            _critters.push({
                row: cr, col: cc,
                vr: (Math.random() - 0.5) * 0.5, vc: (Math.random() - 0.5) * 0.5,
                life: 8 + Math.random() * 10,
                fleeing: false,
            });
        }
    }
    for (let i = _critters.length - 1; i >= 0; i--) {
        const c = _critters[i];
        c.life -= dt;
        if (c.life <= 0) { _critters.splice(i, 1); continue; }
        // Flee from player
        const dr = c.row - player.row, dc = c.col - player.col;
        const dist = Math.sqrt(dr * dr + dc * dc);
        if (dist < _CRITTER_FLEE_DIST) {
            c.fleeing = true;
            const fleeSpeed = 4.0;
            c.vr = (dr / dist) * fleeSpeed;
            c.vc = (dc / dist) * fleeSpeed;
        } else if (c.fleeing && dist > _CRITTER_FLEE_DIST * 1.5) {
            c.fleeing = false;
            c.vr = (Math.random() - 0.5) * 0.5;
            c.vc = (Math.random() - 0.5) * 0.5;
        }
        // Move with wall collision check
        const nextR = c.row + c.vr * dt;
        const nextC = c.col + c.vc * dt;
        const nr = Math.floor(nextR), nc = Math.floor(nextC);
        if (nr >= 0 && nr < MAP_SIZE && nc >= 0 && nc < MAP_SIZE && !blocked[nr][nc]) {
            c.row = nextR;
            c.col = nextC;
        } else {
            // Bounce off wall — reverse velocity
            c.vr *= -0.5;
            c.vc *= -0.5;
            c.fleeing = false;
        }
        // Despawn if out of map
        if (c.row < 0 || c.row >= MAP_SIZE || c.col < 0 || c.col >= MAP_SIZE) {
            _critters.splice(i, 1);
        }
    }
}

function drawCritters() {
    if (_critters.length === 0) return;
    const color = _CRITTER_COLORS[currentZone] || '#554433';
    ctx.save();
    for (const c of _critters) {
        const pos = tileToScreen(c.row, c.col);
        const sx = pos.x + cameraX, sy = pos.y + cameraY;
        if (sx < -20 || sx > canvasW + 20 || sy < -20 || sy > canvasH + 20) continue;
        const fr = Math.floor(c.row), fc = Math.floor(c.col);
        if (fogRevealed[fr] && fogRevealed[fr][fc] < 1) continue;
        const alpha = c.life < 2 ? c.life / 2 : 1;
        ctx.globalAlpha = alpha * 0.5;
        ctx.fillStyle = color;
        // Simple 2-pixel body
        ctx.fillRect(sx - 1, sy, 2, 1.5);
        ctx.fillRect(sx - 0.5, sy - 0.5, 1, 1);
    }
    ctx.restore();
}

// ============================================================
//  WEATHER SYSTEM — zone-specific ambient weather effects
//  Rain (hamlet), embers (inferno), snow (frozen), void (throne)
//  Separate from dust particles — higher density, unique rendering.
// ============================================================
const _weatherParticles = [];
const _WEATHER_MAX = 80;
const _weatherRipples = []; // floor ripples for rain
const _RIPPLE_MAX = 15;

function updateWeather(dt) {
    if (gamePhase !== 'playing') return;
    const z = currentZone;

    // Spawn weather particles
    if (_weatherParticles.length < _WEATHER_MAX) {
        const pPos = tileToScreen(player.row, player.col);
        const cx = pPos.x + cameraX, cy = pPos.y + cameraY;

        if (z === 0) {
            // RAIN — angled streaks falling fast
            for (let i = 0; i < 3; i++) {
                _weatherParticles.push({
                    x: cx + (Math.random() - 0.5) * canvasW * 0.8,
                    y: cy - canvasH * 0.5 + Math.random() * canvasH * 0.3,
                    vx: -1.5 - Math.random() * 0.5,
                    vy: 8 + Math.random() * 3,
                    life: 0.8 + Math.random() * 0.4,
                    maxLife: 1.2,
                    type: 'rain',
                    size: 8 + Math.random() * 6,
                });
            }
            // Rain ripple on floor
            if (_weatherRipples.length < _RIPPLE_MAX && Math.random() < 0.15) {
                const rr = player.row + (Math.random() - 0.5) * 8;
                const rc = player.col + (Math.random() - 0.5) * 8;
                const rPos = tileToScreen(rr, rc);
                _weatherRipples.push({
                    x: rPos.x + cameraX, y: rPos.y + cameraY + 4,
                    radius: 0, maxRadius: 4 + Math.random() * 3,
                    life: 0.4 + Math.random() * 0.2,
                    maxLife: 0.6,
                });
            }
        } else if (z >= 1 && z <= 3) {
            // DUNGEON DUST MOTES — slow drifting particles (zones 1-3)
            if (Math.random() < 0.08) {
                const dustColors = ['#a0957a', '#8a806a', '#b0a080']; // warm stone tones
                _weatherParticles.push({
                    x: cx + (Math.random() - 0.5) * canvasW * 0.7,
                    y: cy + (Math.random() - 0.5) * canvasH * 0.6,
                    vx: (Math.random() - 0.5) * 0.15,
                    vy: -0.1 + Math.random() * 0.2,
                    life: 4.0 + Math.random() * 3.0,
                    maxLife: 7.0,
                    type: 'dust',
                    size: 0.8 + Math.random() * 1.2,
                    drift: Math.random() * Math.PI * 2,
                });
            }
            // Zone 3 (Spire) — occasional arcane motes
            if (z === 3 && Math.random() < 0.04) {
                _weatherParticles.push({
                    x: cx + (Math.random() - 0.5) * canvasW * 0.6,
                    y: cy + (Math.random() - 0.5) * canvasH * 0.5,
                    vx: (Math.random() - 0.5) * 0.2,
                    vy: -0.3 - Math.random() * 0.2,
                    life: 3.0 + Math.random() * 2.0,
                    maxLife: 5.0,
                    type: 'arcane_mote',
                    size: 1.0 + Math.random() * 1.0,
                });
            }
        } else if (z === 4) {
            // EMBERS — rising orange/red dots
            if (Math.random() < 0.15) {
                _weatherParticles.push({
                    x: cx + (Math.random() - 0.5) * canvasW * 0.7,
                    y: cy + canvasH * 0.3 + Math.random() * canvasH * 0.2,
                    vx: (Math.random() - 0.5) * 0.8,
                    vy: -1.5 - Math.random() * 1.0,
                    life: 2.0 + Math.random() * 1.5,
                    maxLife: 3.5,
                    type: 'ember_weather',
                    size: 1.0 + Math.random() * 1.5,
                });
            }
        } else if (z === 5) {
            // SNOW — slow-falling white dots with lateral drift
            if (Math.random() < 0.2) {
                _weatherParticles.push({
                    x: cx + (Math.random() - 0.5) * canvasW * 0.8,
                    y: cy - canvasH * 0.4 + Math.random() * canvasH * 0.2,
                    vx: (Math.random() - 0.5) * 0.6,
                    vy: 0.5 + Math.random() * 0.4,
                    life: 4.0 + Math.random() * 2.0,
                    maxLife: 6.0,
                    type: 'snow',
                    size: 1.0 + Math.random() * 1.5,
                    drift: Math.random() * Math.PI * 2, // lateral sinusoidal drift phase
                });
            }
        } else if (z === 6) {
            // VOID — slow purple/black particles rising from ground
            if (Math.random() < 0.12) {
                _weatherParticles.push({
                    x: cx + (Math.random() - 0.5) * canvasW * 0.6,
                    y: cy + canvasH * 0.2 + Math.random() * canvasH * 0.2,
                    vx: (Math.random() - 0.5) * 0.3,
                    vy: -0.4 - Math.random() * 0.3,
                    life: 3.0 + Math.random() * 2.0,
                    maxLife: 5.0,
                    type: 'void',
                    size: 1.5 + Math.random() * 2.0,
                });
            }
        }
    }

    // Update particles (swap-and-pop instead of splice for O(1) removal)
    for (let i = _weatherParticles.length - 1; i >= 0; i--) {
        const p = _weatherParticles[i];
        p.life -= dt;
        if (p.life <= 0) {
            _weatherParticles[i] = _weatherParticles[_weatherParticles.length - 1];
            _weatherParticles.pop();
            continue;
        }
        p.x += p.vx * 60 * dt;
        p.y += p.vy * 60 * dt;
        // Snow / dust lateral drift
        if ((p.type === 'snow' || p.type === 'dust') && p.drift !== undefined) {
            p.x += Math.sin(p.drift + _frameNow * 1000 / 1200) * (p.type === 'dust' ? 0.15 : 0.3);
        }
        // Cull particles that drift far off-screen
        if (p.x < -200 || p.x > canvasW + 200 || p.y < -200 || p.y > canvasH + 200) {
            _weatherParticles[i] = _weatherParticles[_weatherParticles.length - 1];
            _weatherParticles.pop();
            continue;
        }
    }

    // Update ripples (swap-and-pop instead of splice for O(1) removal)
    for (let i = _weatherRipples.length - 1; i >= 0; i--) {
        const r = _weatherRipples[i];
        r.life -= dt;
        if (r.life <= 0) {
            _weatherRipples[i] = _weatherRipples[_weatherRipples.length - 1];
            _weatherRipples.pop();
            continue;
        }
        r.radius = r.maxRadius * (1 - r.life / r.maxLife);
    }
}

function drawWeather() {
    if (gamePhase !== 'playing' || _weatherParticles.length === 0 && _weatherRipples.length === 0) return;
    ctx.save();

    for (const p of _weatherParticles) {
        const alpha = Math.min(1, p.life / (p.maxLife * 0.3)) * Math.min(1, (p.maxLife - p.life) / 0.3);

        if (p.type === 'rain') {
            // Rain = thin angled line
            ctx.globalAlpha = alpha * 0.25;
            ctx.strokeStyle = '#8899bb';
            ctx.lineWidth = 0.8;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p.x + p.vx * 0.4, p.y + p.vy * 0.4);
            ctx.stroke();
        } else if (p.type === 'ember_weather') {
            // Ember = small glowing dot, screen blend
            ctx.globalCompositeOperation = 'screen';
            ctx.globalAlpha = alpha * 0.5;
            ctx.fillStyle = `rgb(255, ${130 + Math.random() * 60 | 0}, 30)`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalCompositeOperation = 'source-over';
        } else if (p.type === 'snow') {
            // Snow = white dot
            ctx.globalAlpha = alpha * 0.4;
            ctx.fillStyle = '#ddeeff';
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
        } else if (p.type === 'dust') {
            // Dust motes = warm brownish dots, subtle
            ctx.globalAlpha = alpha * 0.25;
            ctx.fillStyle = '#b0a080';
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
        } else if (p.type === 'arcane_mote') {
            // Arcane motes = faint blue-green glow, screen blend
            ctx.globalCompositeOperation = 'screen';
            ctx.globalAlpha = alpha * 0.35;
            ctx.fillStyle = '#4488aa';
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalCompositeOperation = 'source-over';
        } else if (p.type === 'void') {
            // Void = purple dot, screen blend
            ctx.globalCompositeOperation = 'screen';
            ctx.globalAlpha = alpha * 0.3;
            ctx.fillStyle = '#6622aa';
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalCompositeOperation = 'source-over';
        }
    }

    // Rain floor ripples
    for (const r of _weatherRipples) {
        const alpha = r.life / r.maxLife;
        ctx.globalAlpha = alpha * 0.15;
        ctx.strokeStyle = '#8899bb';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.ellipse(r.x, r.y, r.radius, r.radius * 0.4, 0, 0, Math.PI * 2);
        ctx.stroke();
    }

    ctx.restore();
}

function updateGameplay(dt) {
    tickInputBuffers(dt);
    if (multiKillTimer > 0) {
        multiKillTimer -= dt;
        if (multiKillTimer <= 0) multiKillCount = 0; // reset streak
    }
    // Kill streak decay — breaks after 3s without a kill
    if (typeof killStreak !== 'undefined' && killStreak.count > 0) {
        killStreak.timer += dt;
        if (killStreak.timer >= killStreak.window) {
            killStreak.count = 0;
            killStreak.multiplier = 1.0;
            killStreak.timer = 0;
        }
    }
    if (typeof killStreak !== 'undefined' && killStreak.displayAlpha > 0 && killStreak.count === 0) {
        killStreak.displayAlpha = Math.max(0, killStreak.displayAlpha - dt * 2);
    }
    // ── COMBAT JUICE: Update multikill floating texts ──
    for (let i = multiKillTexts.length - 1; i >= 0; i--) {
        multiKillTexts[i].life -= dt;
        if (multiKillTexts[i].life <= 0) multiKillTexts.splice(i, 1);
    }
    if (gamePhase === 'playing' && !inventoryOpen) {
        const handler = FormSystem.getHandler();
        if (handler && handler.update) handler.update(dt);
        else updatePlayer(dt); // fallback to wizard
    }
    updateGhosts(dt);
    if (!inventoryOpen) updateProjectiles(dt);
    updateNPCs(dt);
    if (gamePhase === 'playing' && !inventoryOpen) {
        if (typeof updateEvolutionSurge === 'function') updateEvolutionSurge(dt);
        updateWaveSystem(dt);
        updateEnemies(dt);
        if (typeof updateEnemySynergies === 'function') updateEnemySynergies(dt);
        checkProjectileEnemyHits();
        updateEnemyProjectiles(dt);
        updateTowers(dt);
        updateTowerBolts(dt);
        updateOrbitFireballs(dt);
        updatePlacement(dt);
        updateWorldDrops(dt);
        tryPickupDrops();
        if (typeof updateWorldAugmentDrops === 'function') updateWorldAugmentDrops(dt);
        if (typeof updateAltarChallenge === 'function') updateAltarChallenge(dt);
        // Talisman Echo: Arcane Echo — ghost tower fires every 25s
        if (typeof hasTalismanEcho === 'function' && hasTalismanEcho('ghost_tower') && wave.phase === 'fighting') {
            if (!window._arcaneEchoTimer) window._arcaneEchoTimer = 0;
            window._arcaneEchoTimer += dt;
            var _aeData = getTalismanEcho('ghost_tower');
            if (_aeData && window._arcaneEchoTimer >= _aeData.interval) {
                window._arcaneEchoTimer = 0;
                // Fire bolts at nearest enemies from player position
                // Find nearest N alive enemies in one pass (avoids filter+sort allocation)
                var _aeN = _aeData.bolts;
                var _aeTargets = [];    // small array, length <= _aeN
                var _aeDists2 = [];     // parallel squared distances
                var _aeHasAlive = false;
                for (var _aeJ = 0; _aeJ < enemies.length; _aeJ++) {
                    var _aeC = enemies[_aeJ];
                    if (_aeC.state === 'death') continue;
                    _aeHasAlive = true;
                    var _aeD2 = (_aeC.row - player.row) ** 2 + (_aeC.col - player.col) ** 2;
                    if (_aeTargets.length < _aeN) {
                        _aeTargets.push(_aeC);
                        _aeDists2.push(_aeD2);
                    } else {
                        // Replace the farthest in our top-N if this one is closer
                        var _aeMax = 0;
                        for (var _aeK = 1; _aeK < _aeN; _aeK++) {
                            if (_aeDists2[_aeK] > _aeDists2[_aeMax]) _aeMax = _aeK;
                        }
                        if (_aeD2 < _aeDists2[_aeMax]) {
                            _aeTargets[_aeMax] = _aeC;
                            _aeDists2[_aeMax] = _aeD2;
                        }
                    }
                }
                for (var _aeI = 0; _aeI < _aeTargets.length; _aeI++) {
                    var _aeE = _aeTargets[_aeI];
                    var _aeDr = _aeE.row - player.row, _aeDc = _aeE.col - player.col;
                    var _aeDist = Math.sqrt(_aeDr*_aeDr + _aeDc*_aeDc) || 1;
                    if (_aeDist < 8) {
                        var _aeP = recycleProj(player.row, player.col, (_aeDr/_aeDist)*9, (_aeDc/_aeDist)*9);
                        _aeP.damage = 15; _aeP.life = 1.0; _aeP.pierce = 0; _aeP.isBone = false;
                    }
                }
                if (_aeHasAlive) {
                    spawnParticleBurst(player.row, player.col, 8, '#5588ff');
                    addScreenShake(1, 0.03);
                }
            }
        }
        updateWorldKeyDrops(dt);
        tryPickupKeyDrops();
    }
    updateParticles(dt);
    updateEffectParticles(dt);
    updatePickupTexts(dt);
    if (typeof Notify !== 'undefined' && Notify.updateTutorials) Notify.updateTutorials(dt);
    if (typeof updateFrozenEchoes === 'function') updateFrozenEchoes(dt);
    if (typeof updateInscriptions === 'function') updateInscriptions(dt);
    if (_arrivalVignetteTimer > 0) _arrivalVignetteTimer -= dt;
    if (_screenFlashTimer > 0) _screenFlashTimer -= dt;
    // Check if Pale Queen dialogue triggered ending choice
    if (typeof paleQueenDialogueComplete !== 'undefined' && paleQueenDialogueComplete) {
        paleQueenDialogueComplete = false;
        gamePhase = 'endingChoice';
        endingChoiceFadeIn = 0;
        endingChoiceHover = null;
    }
    if (typeof Notify !== 'undefined') Notify.update(dt);
    if (towerModeDisplayTimer > 0) towerModeDisplayTimer -= dt;
    updateZoneBanner(dt);
    // Procedural dungeon systems
    if (typeof updateHazards === 'function') updateHazards(dt);
    if (typeof checkSecretWalls === 'function') checkSecretWalls();
    // Ambient atmosphere particles — make the world feel alive
    spawnAmbientParticles(dt);
    if (typeof updateWeather === 'function') updateWeather(dt);
    if (typeof updateCritters === 'function') updateCritters(dt);
    updateCamera(dt);
    if (typeof updateCameraZoom === 'function') updateCameraZoom(dt);

    // Update fog of war — throttled to ~4 times per second
    if (typeof updateFogOfWar === 'function') {
        if (!updateGameplay._fogTimer) updateGameplay._fogTimer = 0;
        updateGameplay._fogTimer += dt;
        if (updateGameplay._fogTimer > 0.25) {
            updateGameplay._fogTimer = 0;
            updateFogOfWar();
        }
    }

    // Zone transition fade overlay (with narrative story beats between zones)
    if (zoneTransitionFading) {
        if (zoneTransitionFading === 'fadeIn') {
            // Phase 3: hold black briefly, then fade overlay OUT to reveal new zone + banner art.
            // holdTimer gives the zone banner time to start rendering before the world is visible.
            if (!window._zoneFadeHoldTimer) window._zoneFadeHoldTimer = 0;
            window._zoneFadeHoldTimer += dt;
            if (window._zoneFadeHoldTimer < 0.5) {
                // Hold at full black for 0.5s — zone banner art fades in behind this
                zoneTransitionAlpha = 1;
            } else {
                // Slow reveal — 1.2s fade so banner art is established before world shows
                zoneTransitionAlpha -= dt * 0.85;
                if (zoneTransitionAlpha <= 0) {
                    zoneTransitionAlpha = 0;
                    zoneTransitionFading = false;
                    window._zoneFadeHoldTimer = 0;
                }
            }
        } else if (zoneTransitionFading === 'storyBeat') {
            // Phase 2: show narrative text on black screen
            if (!window._storyBeatTimer) window._storyBeatTimer = 0;
            window._storyBeatTimer += dt;
            const _sbAlpha = window._storyBeatTimer < 0.8 ? window._storyBeatTimer / 0.8 :
                             window._storyBeatTimer > 3.2 ? Math.max(0, 1 - (window._storyBeatTimer - 3.2) / 0.8) : 1;
            ctx.save();
            ctx.fillStyle = '#000'; ctx.globalAlpha = 1; ctx.fillRect(0, 0, canvasW, canvasH);
            ctx.globalAlpha = _sbAlpha * 0.85;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.font = 'italic 16px Georgia';
            ctx.fillStyle = '#c4a878';
            ctx.shadowColor = 'rgba(200, 160, 80, 0.3)'; ctx.shadowBlur = 10;
            const _sbLines = (window._storyBeatText || '').split('\n');
            for (var _sbL = 0; _sbL < _sbLines.length; _sbL++) {
                ctx.fillText(_sbLines[_sbL], canvasW / 2, canvasH / 2 - (_sbLines.length - 1) * 12 + _sbL * 24);
            }
            ctx.shadowBlur = 0;
            ctx.restore();
            if (window._storyBeatTimer >= 4.0) {
                // Load the zone directly using stored nextZone (avoids double resolveNextZone call)
                var _sbNextZone = window._storyBeatNextZone || 1;
                zoneTransitionAlpha = 1;
                zoneTransitionFading = 'fadeIn';
                window._zoneFadeHoldTimer = 0;
                window._storyBeatTimer = 0;
                try { loadZone(_sbNextZone); } catch(e) { try { loadZone(0); _sbNextZone = 0; } catch(e2) {} }
                try { showZoneBanner(_sbNextZone); } catch(e) {}
                _arrivalVignetteTimer = 1.5;
                try { if (typeof sfxZoneEnter === 'function') sfxZoneEnter(); } catch(e) {}
                try { if (typeof startAmbient === 'function') startAmbient(_sbNextZone); } catch(e) {}
            }
            return;
        } else if (zoneTransitionAlpha < 1) {
            zoneTransitionAlpha += dt * 3;
            if (zoneTransitionAlpha >= 1) {
                let nextZone;
                if (zoneTransitionTarget === 'next') {
                    // Unified progression — advance to next in ZONE_PROGRESSION
                    const entry = resolveNextZone();
                    nextZone = getZoneNumberForProgression(entry);
                    if (entry.procedural && typeof ZONE_THEMES !== 'undefined') {
                        _nextProceduralTheme = ZONE_THEMES[entry.theme] || null;
                        _nextProceduralDepth = entry.depth || 1;
                    }
                } else if (zoneTransitionTarget === 'deepest') {
                    // Hamlet portal — warp to deepest reached procedural depth
                    const d = deepestDepthReached || 1;
                    nextZone = 100 + d;
                    progressionIndex = ZONE_PROGRESSION.length; // skip past story
                    isProceduralZone = true;
                    proceduralDepth = d;
                    endlessUnlocked = true;
                    endlessDepth = d + 1; // next floor will be one deeper
                } else if (typeof zoneTransitionTarget === 'number') {
                    nextZone = zoneTransitionTarget;
                } else {
                    nextZone = ZONE_TARGET_MAP[zoneTransitionTarget] != null ? ZONE_TARGET_MAP[zoneTransitionTarget] : 1;
                }
                // When returning to town from dungeon, spawn at Hamlet entrance (not lobby)
                if (nextZone === 0 && zoneTransitionTarget === 'town') {
                    _townReturnSpawn = true;
                }
                // Zone transition narrative text — show story beat before loading
                const _ZONE_STORY_BEATS = {
                    '1_2': 'The talisman pulls. Deeper. She went this way.',
                    '2_3': "You found her letter. She didn't want to be followed.\nThat's how you know you have to.",
                    '3_4': 'The vision burned \u2014 a throne, a figure holding everything together.\nThe pull is stronger now.',
                    '4_5': "The pilgrim's words echo: 'Tell her someone tried.'\nYou will do more than try.",
                    '5_6': 'The cold gives way to something worse.\nA presence. Not hostile. Resigned.\nShe knows you are coming.',
                };
                const _prevZone = currentZone;
                const _storyKey = _prevZone + '_' + nextZone;
                if (!window._storyBeatShown) window._storyBeatShown = {};
                if (_ZONE_STORY_BEATS[_storyKey] && !window._storyBeatShown[_storyKey]) {
                        window._storyBeatShown[_storyKey] = true;
                        window._storyBeatText = _ZONE_STORY_BEATS[_storyKey];
                        window._storyBeatTimer = 0;
                        window._storyBeatNextZone = nextZone;
                        zoneTransitionFading = 'storyBeat';
                        // Don't load zone yet — story beat will resume transition after 4s
                        // But we need to break out of this block
                        return;
                }
                // CRITICAL: Set fadeIn state FIRST, before any code that might throw.
                // If loadZone/showZoneBanner/sfx throw, the screen must still fade in.
                zoneTransitionAlpha = 1;
                zoneTransitionFading = 'fadeIn';
                window._zoneFadeHoldTimer = 0;
                try {
                    loadZone(nextZone);
                } catch(e) {
                    console.error('Zone load failed:', e);
                    try { loadZone(0); nextZone = 0; } catch(e2) {}
                }
                try { showZoneBanner(nextZone); } catch(e) {}
                _arrivalVignetteTimer = 1.5;
                try { if (typeof sfxZoneEnter === 'function') sfxZoneEnter(); } catch(e) {}
                try { if (typeof startAmbient === 'function') startAmbient(nextZone); else if (typeof startAmbientAudio === 'function') startAmbientAudio(nextZone); } catch(e) {}
            }
        }
    }
}

function gameLoop(timestamp) {
    try {
        let dt = Math.min((timestamp - lastTime) / 1000, 0.1);
        lastTime = timestamp;
        _frameDt = dt; // cache for render()
        _frameNow = performance.now() / 1000; // cache once per frame
        // Slow-mo effect for big moments
        if (slowMoTimer > 0) {
            slowMoTimer -= dt;
            dt *= slowMoScale;
            if (slowMoTimer <= 0) slowMoScale = 1.0;
        }
        lightFlicker += dt;
        updateMusic(dt);

    // Hit pause — freeze frame on impact
    if (updateHitPause(dt)) { requestAnimationFrame(gameLoop); return; }

    // ----- Pre-menu phase (just "click anywhere to begin") -----
    if (gamePhase === 'preMenu') {
        updatePreMenuPhase(dt);
        render();
        requestAnimationFrame(gameLoop);
        return;
    }

    // ----- Options screen -----
    if (gamePhase === 'options') {
        render();
        drawOptionsScreen();
        requestAnimationFrame(gameLoop);
        return;
    }

    // ----- Menu phase updates -----
    if (gamePhase === 'menu' || gamePhase === 'menuControls') {
        updateMenuPhase(dt);
    }

    // ----- Name entry phase -----
    if (gamePhase === 'nameEntry') {
        updateNameEntryPhase(dt);
    }

    // ----- Load screen phase -----
    if (gamePhase === 'loadScreen') {
        updateLoadScreenPhase(dt);
    }

    // ----- Menu fade-out transitions -----
    if (gamePhase === 'menuFade' || gamePhase === 'menuControlsFade') {
        updateMenuFadePhase(dt);
    }

    // ----- Intro text sequence (new clean intro) -----
    if (gamePhase === 'intro') {
        updateIntroPhase(dt);
        render();
        drawIntroOverlay();
        requestAnimationFrame(gameLoop);
        return;
    }

    // ----- Cinematic "left for dead" sequence -----
    if (gamePhase === 'cinematic') {
        updateCinematicPhase(dt);
        render();
        drawCinematicText();
        requestAnimationFrame(gameLoop);
        return;
    }

    // Cursor management for inventory
    if (gamePhase === 'playing') {
        setPixelCursor(inventoryOpen ? 'default' : 'none');
    }

    // ----- Evolution cinematic -----
    if (gamePhase === 'evolution') {
        updateEvolution(dt);
        render();
        drawEvolution();
        requestAnimationFrame(gameLoop);
        return;
    }

    // ----- Vision flash (after Zone 3 boss) -----
    if (gamePhase === 'visionFlash') {
        updateVisionFlashPhase(dt);
        requestAnimationFrame(gameLoop);
        return;
    }

    // ----- Ending choice screen -----
    if (gamePhase === 'endingChoice') {
        endingChoiceFadeIn = Math.min(1, endingChoiceFadeIn + dt * 1.5);
        setPixelCursor('default');
        render();
        drawEndingChoice();
        requestAnimationFrame(gameLoop);
        return;
    }

    // ----- Ending cinematic -----
    if (gamePhase === 'endingCinematic') {
        endingCinematicTimer += dt;
        render();
        drawEndingCinematic();
        if (endingCinematicTimer >= 14.0) {
            // Transition to credits
            gamePhase = 'credits';
            creditsTimer = 0;
        }
        requestAnimationFrame(gameLoop);
        return;
    }

    // ----- Credits roll -----
    if (gamePhase === 'credits') {
        creditsTimer += dt;
        drawCreditsScreen();
        if (creditsTimer >= CREDITS_DURATION) {
            // Unlock next Ascension level on game clear
            if (typeof gameCleared !== 'undefined') gameCleared = true;
            if (typeof ascensionUnlocked !== 'undefined' && typeof ascensionLevel !== 'undefined') {
                if (ascensionLevel >= ascensionUnlocked) {
                    ascensionUnlocked = Math.min(typeof ASCENSION_MAX !== 'undefined' ? ASCENSION_MAX : 10, ascensionLevel + 1);
                }
            }
            // Save ascension progress
            try { saveGame(0); } catch(e) {}
            gamePhase = 'preMenu';
            preMenuAlpha = 0;
        }
        requestAnimationFrame(gameLoop);
        return;
    }

    // ----- Death state -----
    if (gameDead) {
        deathFadeTimer += dt;
        updateParticles(dt);
        updateEffectParticles(dt);
        render();
        drawDeathScreen();
        requestAnimationFrame(gameLoop);
        return;
    }

    // Journal reader — pauses gameplay
    if (journalOpen && gamePhase === 'playing') {
        setPixelCursor('default');
        render();
        drawJournalReader();
        requestAnimationFrame(gameLoop);
        return;
    }

    // NPC dialogue — pauses gameplay
    if (npcDialogueOpen && gamePhase === 'playing') {
        setPixelCursor('default');
        render();
        drawNPCDialogue();
        if (typeof drawNPCChoiceMenu === 'function') drawNPCChoiceMenu();
        if (typeof smithyMenuOpen !== 'undefined' && smithyMenuOpen && typeof drawSmithyMenu === 'function') drawSmithyMenu();
        if (typeof shopMenuOpen !== 'undefined' && shopMenuOpen && typeof drawShopMenu === 'function') drawShopMenu();
        requestAnimationFrame(gameLoop);
        return;
    }

    // Grimoire menu — pauses gameplay
    if (menuOpen && gamePhase === 'playing') {
        setPixelCursor('default');
        render();
        drawGameMenu();
        requestAnimationFrame(gameLoop);
        return;
    }

    // Abyss modifier choice — pauses gameplay between procedural zones
    if (typeof abyssChoiceState !== 'undefined' && abyssChoiceState.pending && gamePhase === 'playing') {
        setPixelCursor('default');
        render();
        drawAbyssChoiceScreen();
        requestAnimationFrame(gameLoop);
        return;
    }

    // Level-up screen — pauses gameplay
    if (xpState.levelUpPending && gamePhase === 'playing') {
        xpState.levelUpFadeIn = Math.min(1, xpState.levelUpFadeIn + dt * 4);
        setPixelCursor('default');
        render();
        drawLevelUpScreen();
        requestAnimationFrame(gameLoop);
        return;
    }

    // Talisman pickup screen — dramatic reveal when talisman is found
    if (typeof talismanPickupState !== 'undefined' && talismanPickupState.active) {
        if (typeof updateTalismanPickup === 'function') updateTalismanPickup(dt);
        setPixelCursor('default');
        render();
        if (typeof drawTalismanPickup === 'function') drawTalismanPickup();
        requestAnimationFrame(gameLoop);
        return;
    }

    // Evolution hint screen — shows new form's abilities after evolution
    if (typeof evolutionHintState !== 'undefined' && evolutionHintState.active) {
        if (typeof updateEvolutionHint === 'function') updateEvolutionHint(dt);
        setPixelCursor('default');
        render();
        if (typeof drawEvolutionHint === 'function') drawEvolutionHint();
        requestAnimationFrame(gameLoop);
        return;
    }

    // ----- Pause state -----
    if (gamePhase === 'playing' && gamePaused) {
        render();
        drawPauseOverlay();
        requestAnimationFrame(gameLoop);
        return;
    }

    // ----- Gameplay phases -----
    if (gamePhase === 'playing' || gamePhase === 'awakening') {
        updateGameplay(dt);
    }

    // Reset error counter on successful frame
    gameLoopErrors = 0;
    } catch (err) {
        console.error('Game loop error:', err, err.stack);
        gameLoopErrors++;
        // Force fade-in to complete even if gameplay crashes
        if (zoneTransitionAlpha > 0 && zoneTransitionFading === 'fadeIn') {
            zoneTransitionAlpha = Math.max(0, zoneTransitionAlpha - 0.05);
        }

        if (gameLoopErrors >= GAME_LOOP_ERROR_THRESHOLD) {
            gameLoopCrashed = true;
        }
    }

    render();

    // Draw error overlay if crashed
    if (gameLoopCrashed) {
        drawGameLoopErrorOverlay();
    }

    requestAnimationFrame(gameLoop);
}

// Draw error overlay when game loop crashes
function drawGameLoopErrorOverlay() {
    // Semi-transparent dark overlay
    ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Error text
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 48px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    ctx.fillText('Something went wrong', centerX, centerY - 60);

    // Smaller retry text
    ctx.font = '24px Arial, sans-serif';
    ctx.fillText('Press R to retry or click to reload', centerX, centerY + 60);
}

// Error overlay event listeners (added once on load)
if (!window._gameLoopErrorHandlersAdded) {
    window._gameLoopErrorHandlersAdded = true;

    document.addEventListener('keydown', (e) => {
        if (gameLoopCrashed && (e.key === 'r' || e.key === 'R')) {
            e.preventDefault();
            window.location.reload();
        }
    });

    canvas.addEventListener('click', () => {
        if (gameLoopCrashed) {
            window.location.reload();
        }
    });
}

// Reference resolution — all rendering is tuned for REF_WIDTH.
// On bigger monitors we scale everything up so the game looks identical.
let displayScale = 1;   // physicalWidth / UI.REF_WIDTH

function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const physW = window.innerWidth;
    const physH = window.innerHeight;

    // Physical canvas size (sharp on retina/HiDPI)
    canvas.width = physW * dpr;
    canvas.height = physH * dpr;
    canvas.style.width = physW + 'px';
    canvas.style.height = physH + 'px';

    // Scale factor: map virtual 1920-wide space to actual screen
    displayScale = physW / UI.REF_WIDTH;

    // Virtual dimensions — all game code renders in this coordinate space
    canvasW = UI.REF_WIDTH;
    canvasH = physH / displayScale;

    // Combined transform: DPR * display scale
    const _zf = typeof _cameraZoom !== 'undefined' ? _cameraZoom : 1;
    ctx.setTransform(dpr * displayScale, 0, 0, dpr * displayScale, 0, 0);
    if (_zf !== 1) {
        const _zcx = canvasW / 2, _zcy = canvasH / 2;
        ctx.translate(_zcx, _zcy);
        ctx.scale(_zf, _zf);
        ctx.translate(-_zcx, -_zcy);
    }

}
window.addEventListener('resize', resizeCanvas);

// ============================================================
//  MAIN MENU RENDERING
// ============================================================

// Menu button definitions (positioned relative to virtual canvas center)
function getMenuButtons() {
    const cx = canvasW / 2;
    const cy = canvasH / 2;
    const btnW = UI.MENU_BTN_W, btnH = UI.MENU_BTN_H;
    const gap = UI.MENU_BTN_SPACING;
    const hasAnySave = saveSlots.some(s => s !== null);
    return {
        start:    { x: cx - btnW / 2, y: cy + 30,            w: btnW, h: btnH, label: 'PLAY',        id: 'start' },
        loadGame: { x: cx - btnW / 2, y: cy + 30 + gap,      w: btnW, h: btnH, label: 'CONTINUE',    id: 'loadGame', disabled: !hasAnySave },
        controls: { x: cx - btnW / 2, y: cy + 30 + gap * 2,  w: btnW, h: btnH, label: 'CONTROLS',   id: 'controls' },
        options:  { x: cx - btnW / 2, y: cy + 30 + gap * 3,  w: btnW, h: btnH, label: 'OPTIONS',    id: 'options' },
    };
}

function getControlsBackButton() {
    const cx = canvasW / 2;
    const cy = canvasH / 2;
    return { x: cx - 90, y: cy + 155, w: 180, h: 40, label: 'BACK', id: 'back' };
}

function pointInButton(mx, my, btn) {
    return mx >= btn.x && mx <= btn.x + btn.w && my >= btn.y && my <= btn.y + btn.h;
}

function updateMenuEmbers(dt) {
    for (const e of menuEmbers) {
        e.life += dt;
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        e.vx += (Math.random() - 0.5) * 2 * dt;
        e.flicker += dt * (4 + Math.random() * 6);

        if (e.life > e.maxLife || e.y < -20) {
            e.x = Math.random() * canvasW;
            e.y = canvasH + 10 + Math.random() * 40;
            e.vx = (Math.random() - 0.5) * 12;
            e.vy = -Math.random() * 25 - 8;
            e.life = 0;
            e.maxLife = Math.random() * 4 + 3;
            e.size = Math.random() * 2.5 + 0.5;
            e.brightness = Math.random();
        }
    }
}

function drawMenuButton(btn, isHovered, alpha, disabled) {
    if (disabled) { isHovered = false; alpha *= 0.35; }
    const t = menuTime;
    ctx.save();
    ctx.globalAlpha = alpha;

    // Hover scale — slight zoom + glow for active button
    if (isHovered) {
        const cx = btn.x + btn.w / 2;
        const cy = btn.y + btn.h / 2;
        ctx.translate(cx, cy);
        ctx.scale(1.03, 1.03);
        ctx.translate(-cx, -cy);
        // Subtle glow behind button
        ctx.globalAlpha = alpha * 0.15;
        ctx.shadowColor = '#d4a040';
        ctx.shadowBlur = 16;
        ctx.fillStyle = '#d4a040';
        ctx.beginPath();
        ctx.roundRect(btn.x - 4, btn.y - 4, btn.w + 8, btn.h + 8, 8);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = alpha;
    }

    // Button background with subtle inner gradient
    const hoverGlow = isHovered ? 0.25 : 0;
    const hasBgArt = !!images.menu_title_bg;
    const baseOpacity = hasBgArt ? 0.8 : 0.65;  // more opaque over busy art
    const btnGrad = ctx.createLinearGradient(btn.x, btn.y, btn.x, btn.y + btn.h);
    btnGrad.addColorStop(0, `rgba(30, 22, 14, ${baseOpacity + hoverGlow})`);
    btnGrad.addColorStop(1, `rgba(12, 8, 4, ${baseOpacity + 0.1 + hoverGlow})`);
    ctx.fillStyle = btnGrad;
    ctx.beginPath();
    ctx.roundRect(btn.x, btn.y, btn.w, btn.h, 4);
    ctx.fill();

    // Border
    const borderAlpha = isHovered ? 0.6 : (hasBgArt ? 0.35 : 0.2);
    const borderColor = isHovered ? `rgba(212, 180, 120, ${borderAlpha})` : `rgba(140, 120, 80, ${borderAlpha})`;
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = isHovered ? 1.5 : 1;
    ctx.beginPath();
    ctx.roundRect(btn.x, btn.y, btn.w, btn.h, 4);
    ctx.stroke();

    // Hover glow effect
    if (isHovered) {
        ctx.globalCompositeOperation = 'screen';
        const glow = ctx.createRadialGradient(
            btn.x + btn.w / 2, btn.y + btn.h / 2, 0,
            btn.x + btn.w / 2, btn.y + btn.h / 2, btn.w * 0.6
        );
        glow.addColorStop(0, `rgba(180, 140, 60, ${0.08 + Math.sin(t * 4) * 0.03})`);
        glow.addColorStop(1, 'rgba(100, 70, 20, 0)');
        ctx.fillStyle = glow;
        ctx.fillRect(btn.x - 20, btn.y - 20, btn.w + 40, btn.h + 40);
        ctx.globalCompositeOperation = 'source-over';
    }

    // Corner ornaments — small angled lines
    const co = 6;
    ctx.strokeStyle = `rgba(168, 144, 96, ${isHovered ? 0.5 : 0.18})`;
    ctx.lineWidth = 1;
    // top-left
    ctx.beginPath();
    ctx.moveTo(btn.x, btn.y + co); ctx.lineTo(btn.x, btn.y); ctx.lineTo(btn.x + co, btn.y);
    ctx.stroke();
    // top-right
    ctx.beginPath();
    ctx.moveTo(btn.x + btn.w - co, btn.y); ctx.lineTo(btn.x + btn.w, btn.y); ctx.lineTo(btn.x + btn.w, btn.y + co);
    ctx.stroke();
    // bottom-left
    ctx.beginPath();
    ctx.moveTo(btn.x, btn.y + btn.h - co); ctx.lineTo(btn.x, btn.y + btn.h); ctx.lineTo(btn.x + co, btn.y + btn.h);
    ctx.stroke();
    // bottom-right
    ctx.beginPath();
    ctx.moveTo(btn.x + btn.w - co, btn.y + btn.h); ctx.lineTo(btn.x + btn.w, btn.y + btn.h); ctx.lineTo(btn.x + btn.w, btn.y + btn.h - co);
    ctx.stroke();

    // Label
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '14px monospace';
    ctx.fillStyle = isHovered ? '#e8d8b0' : (hasBgArt ? '#b8a880' : '#a09070');
    ctx.letterSpacing = '3px';
    ctx.fillText(btn.label, btn.x + btn.w / 2, btn.y + btn.h / 2 + 1);
    ctx.letterSpacing = '0px';

    ctx.restore();
}

function drawPreMenuScreen() {
    const cx = canvasW / 2;
    const t = menuTime;

    // Deep dark background — same as menu but no embers, no title
    const bgGrad = ctx.createRadialGradient(cx, canvasH * 0.35, 0, cx, canvasH * 0.35, canvasW * 0.7);
    bgGrad.addColorStop(0, '#0d0906');
    bgGrad.addColorStop(0.5, '#080504');
    bgGrad.addColorStop(1, '#030202');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, canvasW, canvasH);

    // Title
    preMenuAlpha = Math.min(1, preMenuAlpha + 0.015);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Game title
    ctx.globalAlpha = preMenuAlpha * 0.9;
    ctx.font = 'small-caps bold 42px Georgia';
    ctx.shadowColor = 'rgba(180, 140, 50, 0.4)';
    ctx.shadowBlur = 20;
    ctx.fillStyle = '#d4b878';
    ctx.fillText('ETHERA', cx, canvasH * 0.4);
    ctx.shadowBlur = 0;
    ctx.globalAlpha = preMenuAlpha * 0.5;
    ctx.font = 'italic 16px Georgia';
    ctx.fillStyle = '#a89060';
    ctx.fillText('The Awakening', cx, canvasH * 0.4 + 35);
    // Click prompt — bright and pulsing
    const pulse = 0.7 + Math.sin(t * 2.5) * 0.3;
    ctx.globalAlpha = preMenuAlpha * pulse;
    ctx.font = '20px Georgia';
    ctx.fillStyle = '#e8d0a0';
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 3;
    ctx.strokeText('Click anywhere to begin', cx, canvasH * 0.6);
    ctx.fillText('Click anywhere to begin', cx, canvasH * 0.6);
    ctx.restore();
}

function drawMenuScreen(dt) {
    const cx = canvasW / 2;
    const cy = canvasH / 2;
    const t = menuTime;

    // ----- Background -----
    const bgImg = images.menu_title_bg;
    if (bgImg) {
        // "Cover" scaling — fill canvas, crop overflow, center
        const imgAspect = bgImg.width / bgImg.height;
        const canAspect = canvasW / canvasH;
        let drawW, drawH, drawX, drawY;
        if (canAspect > imgAspect) {
            // Canvas is wider — fit width, crop height
            drawW = canvasW;
            drawH = canvasW / imgAspect;
            drawX = 0;
            drawY = (canvasH - drawH) / 2;
        } else {
            // Canvas is taller — fit height, crop width
            drawH = canvasH;
            drawW = canvasH * imgAspect;
            drawX = (canvasW - drawW) / 2;
            drawY = 0;
        }
        ctx.drawImage(bgImg, drawX, drawY, drawW, drawH);

        // Subtle darkening vignette at edges so buttons/text read clearly
        const edgeVig = ctx.createRadialGradient(cx, cy * 0.7, canvasW * 0.25, cx, cy * 0.7, canvasW * 0.75);
        edgeVig.addColorStop(0, 'rgba(0, 0, 0, 0)');
        edgeVig.addColorStop(1, 'rgba(0, 0, 0, 0.45)');
        ctx.fillStyle = edgeVig;
        ctx.fillRect(0, 0, canvasW, canvasH);

        // Bottom darkening so buttons are legible
        const bottomVig = ctx.createLinearGradient(0, canvasH * 0.55, 0, canvasH);
        bottomVig.addColorStop(0, 'rgba(0, 0, 0, 0)');
        bottomVig.addColorStop(1, 'rgba(0, 0, 0, 0.6)');
        ctx.fillStyle = bottomVig;
        ctx.fillRect(0, canvasH * 0.55, canvasW, canvasH * 0.45);
    } else {
        // Fallback — original procedural background
        const bgGrad = ctx.createRadialGradient(cx, cy * 0.7, 0, cx, cy * 0.7, canvasW * 0.7);
        bgGrad.addColorStop(0, '#0d0906');
        bgGrad.addColorStop(0.5, '#080504');
        bgGrad.addColorStop(1, '#030202');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, canvasW, canvasH);

        const vigGrad = ctx.createLinearGradient(0, canvasH * 0.6, 0, canvasH);
        vigGrad.addColorStop(0, 'rgba(40, 20, 5, 0)');
        vigGrad.addColorStop(1, `rgba(30, 12, 3, ${0.15 + Math.sin(t * 0.8) * 0.05})`);
        ctx.fillStyle = vigGrad;
        ctx.fillRect(0, canvasH * 0.6, canvasW, canvasH * 0.4);
    }

    // ----- Floating embers -----
    ctx.save();
    for (const e of menuEmbers) {
        const lifeFrac = e.life / e.maxLife;
        const fadeIn = Math.min(1, lifeFrac * 4);
        const fadeOut = Math.max(0, 1 - (lifeFrac - 0.7) / 0.3);
        const a = Math.min(fadeIn, fadeOut) * (0.3 + e.brightness * 0.5);
        const flick = 0.7 + Math.sin(e.flicker) * 0.3;

        // Glow
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = a * flick * 0.4 * menuFadeAlpha;
        const glowR = e.size * 6;
        const glow = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, glowR);
        glow.addColorStop(0, e.brightness > 0.5 ? 'rgba(255, 160, 40, 0.4)' : 'rgba(200, 100, 20, 0.3)');
        glow.addColorStop(1, 'rgba(100, 40, 5, 0)');
        ctx.fillStyle = glow;
        ctx.fillRect(e.x - glowR, e.y - glowR, glowR * 2, glowR * 2);

        // Core
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = a * flick * menuFadeAlpha;
        ctx.fillStyle = e.brightness > 0.6 ? '#ffcc66' : (e.brightness > 0.3 ? '#e89030' : '#aa5520');
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.size * flick, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();

    // ----- Title: ETHERA -----
    ctx.save();
    ctx.globalAlpha = menuFadeAlpha;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Title vertical position — push up into the arch top when bg art is present
    const titleY = images.menu_title_bg ? canvasH * 0.18 : cy - 60;

    const logoImg = images.menu_title_logo;

    if (logoImg) {
        // ── Sprite-based title ──
        // Scale logo to fit ~35% of canvas width, maintaining aspect ratio
        const logoTargetW = canvasW * 0.35;
        const logoScale = logoTargetW / logoImg.width;
        const logoW = logoImg.width * logoScale;
        const logoH = logoImg.height * logoScale;

        // Subtle pulsing green glow behind logo — matches portal energy
        ctx.globalCompositeOperation = 'screen';
        const titleGlow = ctx.createRadialGradient(cx, titleY, 0, cx, titleY, logoW * 0.55);
        titleGlow.addColorStop(0, `rgba(40, 180, 80, ${0.05 + Math.sin(t * 1.5) * 0.025})`);
        titleGlow.addColorStop(0.6, `rgba(20, 100, 40, ${0.02})`);
        titleGlow.addColorStop(1, 'rgba(10, 40, 15, 0)');
        ctx.fillStyle = titleGlow;
        ctx.fillRect(cx - logoW, titleY - logoH, logoW * 2, logoH * 2);
        ctx.globalCompositeOperation = 'source-over';

        // Draw logo sprite centered at titleY
        ctx.globalAlpha = menuFadeAlpha;
        ctx.drawImage(logoImg, cx - logoW / 2, titleY - logoH / 2, logoW, logoH);
    } else {
        // ── Fallback: text-based title ──
        if (images.menu_title_bg) {
            ctx.globalAlpha = menuFadeAlpha * 0.5;
            const stripGrad = ctx.createRadialGradient(cx, titleY, 0, cx, titleY, 280);
            stripGrad.addColorStop(0, 'rgba(0, 0, 0, 0.55)');
            stripGrad.addColorStop(0.7, 'rgba(0, 0, 0, 0.2)');
            stripGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = stripGrad;
            ctx.fillRect(cx - 300, titleY - 60, 600, 120);
            ctx.globalAlpha = menuFadeAlpha;
        }

        ctx.globalCompositeOperation = 'screen';
        const titleGlow = ctx.createRadialGradient(cx, titleY, 0, cx, titleY, 260);
        titleGlow.addColorStop(0, `rgba(180, 130, 50, ${0.12 + Math.sin(t * 1.5) * 0.04})`);
        titleGlow.addColorStop(0.5, `rgba(120, 80, 20, ${0.04})`);
        titleGlow.addColorStop(1, 'rgba(60, 30, 5, 0)');
        ctx.fillStyle = titleGlow;
        ctx.fillRect(cx - 300, titleY - 140, 600, 300);
        ctx.globalCompositeOperation = 'source-over';

        ctx.font = '62px Georgia';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
        ctx.shadowBlur = 12;
        ctx.fillStyle = '#d4b878';
        ctx.fillText('ETHERA', cx, titleY);
        ctx.shadowColor = 'rgba(200, 140, 40, 0.5)';
        ctx.shadowBlur = 30;
        ctx.fillText('ETHERA', cx, titleY);
        ctx.shadowBlur = 0;

        ctx.font = 'italic 16px Georgia';
        ctx.fillStyle = '#b8a078';
        ctx.globalAlpha = menuFadeAlpha * (0.5 + Math.sin(t * 2) * 0.15);
        ctx.fillText('The Awakening', cx, titleY + 45);
    }

    ctx.globalAlpha = menuFadeAlpha;

    ctx.restore();

    // ----- Buttons -----
    const btns = getMenuButtons();
    drawMenuButton(btns.start, menuHover === 'start', menuFadeAlpha);
    drawMenuButton(btns.loadGame, menuHover === 'loadGame', menuFadeAlpha, btns.loadGame.disabled);
    drawMenuButton(btns.controls, menuHover === 'controls', menuFadeAlpha);
    if (btns.options) drawMenuButton(btns.options, menuHover === 'options', menuFadeAlpha);

    // ----- Bottom credit line -----
    ctx.save();
    ctx.textAlign = 'center';

    // "a game by Ali Taghva" — soft italic, just above the version line
    ctx.globalAlpha = menuFadeAlpha * 0.28;
    ctx.font = 'italic 11px Georgia';
    ctx.fillStyle = '#b8a078';
    ctx.fillText('a game by Ali Taghva', cx, canvasH - 46);

    // Version number
    ctx.globalAlpha = menuFadeAlpha * 0.45;
    ctx.font = '11px monospace';
    ctx.fillStyle = '#8a7a5a';
    ctx.fillText('v' + ETHERA_VERSION, cx, canvasH - 26);

    ctx.restore();
}

function drawControlsScreen(dt) {
    const cx = canvasW / 2;
    const cy = canvasH / 2;
    const t = menuTime;

    // Dark background
    const bgGrad = ctx.createRadialGradient(cx, cy * 0.8, 0, cx, cy * 0.8, canvasW * 0.6);
    bgGrad.addColorStop(0, '#0d0906');
    bgGrad.addColorStop(1, '#030202');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, canvasW, canvasH);

    // Embers (dimmer)
    ctx.save();
    for (const e of menuEmbers) {
        const lifeFrac = e.life / e.maxLife;
        const fadeIn = Math.min(1, lifeFrac * 4);
        const fadeOut = Math.max(0, 1 - (lifeFrac - 0.7) / 0.3);
        const a = Math.min(fadeIn, fadeOut) * 0.2 * (0.7 + Math.sin(e.flicker) * 0.3);
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = a * menuFadeAlpha;
        ctx.fillStyle = e.brightness > 0.5 ? '#ffaa33' : '#cc6622';
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.size * 0.8, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = menuFadeAlpha;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Title
    ctx.font = '30px Georgia';
    ctx.fillStyle = '#d4c4a0';
    ctx.shadowColor = 'rgba(180, 140, 60, 0.3)';
    ctx.shadowBlur = 16;
    ctx.fillText('CONTROLS', cx, cy - 130);
    ctx.shadowBlur = 0;

    drawDecorLine(cx, cy - 105, 120, menuFadeAlpha * 0.4);

    // Two-column control bindings — combat left, interface right
    const leftCol = [
        { key: 'W A S D',       desc: 'Move' },
        { key: 'SPACE',         desc: 'Dodge' },
        { key: 'LEFT CLICK',    desc: 'Attack' },
        { key: 'RIGHT CLICK',   desc: 'Ability' },
        { key: 'E',             desc: 'Interact' },
        { key: 'T',             desc: 'Tower Mode' },
    ];
    const rightCol = [
        { key: 'TAB',           desc: 'Grimoire' },
        { key: 'I',             desc: 'Equipment' },
        { key: 'J',             desc: 'Journal' },
        { key: 'H',             desc: 'Controls HUD' },
        { key: 'P',             desc: 'Pause' },
        { key: 'ESC',           desc: 'Close' },
    ];

    const startY = cy - 68;
    const rowH = 34;
    const keyW = 86;

    // Column positions: key badge right edge offset from cx
    const leftKx  = -50;   // left col badge right edge at cx - 50
    const rightKx = 150;   // right col badge right edge at cx + 150

    // Section headers (centered above each column's badge)
    ctx.globalAlpha = menuFadeAlpha * 0.45;
    ctx.font = 'italic 11px Georgia';
    ctx.fillStyle = '#a89060';
    ctx.textAlign = 'center';
    ctx.fillText('Combat', cx + leftKx - keyW / 2 + 30, startY - 16);
    ctx.fillText('Interface', cx + rightKx - keyW / 2 + 30, startY - 16);

    // Draw a column of key-desc rows
    function drawControlColumn(col, kxOffset) {
        for (let i = 0; i < col.length; i++) {
            const y = startY + i * rowH;
            const c = col[i];
            const kx = cx + kxOffset;        // key badge right edge
            const dx = kx + 10;              // description left edge

            // Key badge background
            ctx.globalAlpha = menuFadeAlpha * 0.15;
            ctx.fillStyle = '#a89060';
            ctx.beginPath();
            ctx.roundRect(kx - keyW, y - 11, keyW, 22, 3);
            ctx.fill();

            // Key badge border
            ctx.globalAlpha = menuFadeAlpha * 0.25;
            ctx.strokeStyle = '#a89060';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.roundRect(kx - keyW, y - 11, keyW, 22, 3);
            ctx.stroke();

            // Key text
            ctx.globalAlpha = menuFadeAlpha * 0.85;
            ctx.textAlign = 'right';
            ctx.font = '11px monospace';
            ctx.fillStyle = '#c4a878';
            ctx.fillText(c.key, kx - 8, y + 1);

            // Description
            ctx.textAlign = 'left';
            ctx.font = '13px Georgia';
            ctx.fillStyle = '#b8a888';
            ctx.fillText(c.desc, dx, y + 1);
        }
    }

    drawControlColumn(leftCol, leftKx);
    drawControlColumn(rightCol, rightKx);

    // Separator before back button
    const lastRowY = startY + (Math.max(leftCol.length, rightCol.length) - 1) * rowH;
    drawDecorLine(cx, lastRowY + 32, 100, menuFadeAlpha * 0.25);

    ctx.restore();

    // Back button
    const backBtn = getControlsBackButton();
    drawMenuButton(backBtn, menuHover === 'back', menuFadeAlpha);
}

// ============================================================
//  WORLD DROP RENDERING
// ============================================================
// Map item slot + rarity to the best icon sprite
function getItemSpriteForSlot(slot, rarity) {
    // Try exact match first (e.g., icon_wand_rare)
    const exact = images['icon_' + slot + '_' + rarity];
    if (exact) return exact;
    // Rarity fallback: legendary→epic→rare→uncommon→common
    const fallbackOrder = { legendary: 'epic', epic: 'rare', uncommon: 'common' };
    let fallback = fallbackOrder[rarity];
    while (fallback) {
        const fb = images['icon_' + slot + '_' + fallback];
        if (fb) return fb;
        fallback = fallbackOrder[fallback];
    }
    // Last resort: common variant or old Raven icon
    return images['icon_' + slot + '_common'] || images['item_' + slot] || null;
}

function drawWorldDrops() {
    for (const d of worldDrops) {
        const pos = tileToScreen(d.row, d.col);
        const sx = pos.x + cameraX;
        const sy = pos.y + cameraY;
        const bob = Math.sin(d.bobTime * 2.5) * 4;
        const fadeIn = d.spawnTime > 0 ? 1 - (d.spawnTime / 0.5) : 1;
        const rarDef = RARITY[d.item.rarity];
        const t = _frameNow;
        const isRare = d.item.rarity === 'rare' || d.item.rarity === 'epic';

        ctx.save();
        ctx.globalAlpha = fadeIn;

        // Ground glow — visible beacon for loot (needs to cut through darkness multiply)
        ctx.globalCompositeOperation = 'screen';
        const glowPulse = 0.8 + Math.sin(t * 2.5) * 0.2;
        const glowR = isRare ? 38 : d.item.rarity === 'uncommon' ? 30 : 24;
        const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, glowR);
        glow.addColorStop(0, rarDef.glow);
        glow.addColorStop(0.6, rarDef.glow.replace(/[\d.]+\)$/, '0.15)'));
        glow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = glow;
        ctx.globalAlpha = fadeIn * glowPulse * (isRare ? 1.0 : 0.75);
        ctx.fillRect(sx - glowR, sy - glowR, glowR * 2, glowR * 2);

        // --- Floating item icon ---
        ctx.globalCompositeOperation = 'source-over';
        const iy = sy - 22 + bob;
        const iconPx = isRare ? 36 : 30; // icon draw size in pixels

        // Drop shadow under icon
        ctx.globalAlpha = fadeIn * 0.4;
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.ellipse(sx, sy - 2, 8, 3, 0, 0, Math.PI * 2);
        ctx.fill();

        // Draw sprite icon if available
        const spriteImg = getItemSpriteForSlot(d.item.slot, d.item.rarity);
        if (spriteImg) {
            ctx.globalAlpha = fadeIn * 0.95;
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(spriteImg, sx - iconPx / 2, iy - iconPx / 2, iconPx, iconPx);
            ctx.imageSmoothingEnabled = true;
        } else {
            // Procedural fallback
            drawItemIcon(sx, iy, d.item.slot, d.item.rarity, iconPx, fadeIn * 0.9);
        }

        // Rarity border glow around icon (subtle colored outline)
        if (d.item.rarity !== 'common') {
            ctx.globalAlpha = fadeIn * (0.3 + Math.sin(t * 3) * 0.15);
            ctx.strokeStyle = rarDef.color;
            ctx.lineWidth = isRare ? 1.5 : 1;
            ctx.beginPath();
            ctx.roundRect(sx - iconPx / 2 - 1, iy - iconPx / 2 - 1, iconPx + 2, iconPx + 2, 3);
            ctx.stroke();
        }

        // Sparkle twinkle for uncommon+ items
        if (d.item.rarity !== 'common') {
            const sparkle = Math.sin(d.bobTime * 4 + 1.5);
            if (sparkle > 0.5) {
                ctx.globalAlpha = fadeIn * (sparkle - 0.5) * 1.5;
                ctx.fillStyle = '#fff';
                const spA = d.bobTime * 3;
                const spR = iconPx * 0.4;
                const spX = sx + Math.cos(spA) * spR;
                const spY = iy + Math.sin(spA * 0.7) * spR - 2;
                // 4-pointed star sparkle
                ctx.beginPath();
                const ss = 2;
                ctx.moveTo(spX, spY - ss);
                ctx.lineTo(spX + ss * 0.3, spY);
                ctx.lineTo(spX, spY + ss);
                ctx.lineTo(spX - ss * 0.3, spY);
                ctx.closePath();
                ctx.fill();
                ctx.beginPath();
                ctx.moveTo(spX - ss, spY);
                ctx.lineTo(spX, spY + ss * 0.3);
                ctx.lineTo(spX + ss, spY);
                ctx.lineTo(spX, spY - ss * 0.3);
                ctx.closePath();
                ctx.fill();
            }
        }

        ctx.restore();
    }
}

function drawWorldAugmentDrops() {
    if (typeof worldAugmentDrops === 'undefined') return;
    for (const d of worldAugmentDrops) {
        const pos = tileToScreen(d.row, d.col);
        const sx = pos.x + cameraX, sy = pos.y + cameraY;
        const bob = Math.sin(d.bobTime * 2.5) * 4;
        const fadeIn = d.spawnTime > 0 ? 1 - (d.spawnTime / 0.5) : 1;
        const rarDef = RARITY[d.augment.rarity] || RARITY.common;
        const t = _frameNow;
        const isSlime = d.augment.form === 'slime';
        const orbColor = isSlime ? '#44dd66' : '#ccbb88';
        ctx.save();
        ctx.globalAlpha = fadeIn;
        // Ground glow
        ctx.globalCompositeOperation = 'screen';
        const glowR = 28;
        const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, glowR);
        glow.addColorStop(0, isSlime ? 'rgba(60,220,100,0.5)' : 'rgba(200,180,120,0.5)');
        glow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = glow;
        ctx.globalAlpha = fadeIn * (0.7 + Math.sin(t * 2) * 0.2);
        ctx.fillRect(sx - glowR, sy - glowR, glowR * 2, glowR * 2);
        // Floating orb
        ctx.globalCompositeOperation = 'source-over';
        const iy = sy - 18 + bob;
        ctx.globalAlpha = fadeIn * 0.4;
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.ellipse(sx, sy - 2, 6, 2.5, 0, 0, Math.PI * 2); ctx.fill();
        // Orb core
        ctx.globalAlpha = fadeIn * 0.9;
        const orbGrad = ctx.createRadialGradient(sx - 1, iy - 2, 0, sx, iy, 7);
        orbGrad.addColorStop(0, '#ffffff');
        orbGrad.addColorStop(0.3, orbColor);
        orbGrad.addColorStop(1, rarDef.color);
        ctx.fillStyle = orbGrad;
        ctx.beginPath(); ctx.arc(sx, iy, 6, 0, Math.PI * 2); ctx.fill();
        // Rarity border
        if (d.augment.rarity !== 'common') {
            ctx.globalAlpha = fadeIn * (0.4 + Math.sin(t * 3) * 0.2);
            ctx.strokeStyle = rarDef.color;
            ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.arc(sx, iy, 8, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.restore();
    }
}

function drawWorldKeyDrops() {
    for (const d of worldKeyDrops) {
        const pos = tileToScreen(d.row, d.col);
        const sx = pos.x + cameraX;
        const sy = pos.y + cameraY;
        const bob = Math.sin(d.bobTime * 2) * 5;
        const fadeIn = d.spawnTime > 0 ? 1 - (d.spawnTime / 0.5) : 1;
        const t = _frameNow;

        ctx.save();
        ctx.globalAlpha = fadeIn;

        // --- Talisman drop: use sprite with screen blend (black bg disappears) ---
        const isTalisman = d.id === 'talisman';
        const talismanImg = isTalisman ? images.talisman_drop : null;

        if (talismanImg) {
            // Ground glow — larger and more dramatic for the talisman
            ctx.globalCompositeOperation = 'screen';
            const pulse = 0.6 + Math.sin(t * 2.5) * 0.25;
            const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, 45);
            glow.addColorStop(0, `rgba(100, 220, 80, ${0.4 * pulse})`);
            glow.addColorStop(0.4, `rgba(200, 180, 50, ${0.2 * pulse})`);
            glow.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = glow;
            ctx.fillRect(sx - 45, sy - 45, 90, 90);

            // Draw talisman sprite — clip to circle to eliminate JPG background artifacts
            const spriteSize = 48 + Math.sin(t * 2) * 3; // subtle size pulse
            const iy = sy - 24 + bob;
            ctx.globalCompositeOperation = 'screen';
            ctx.globalAlpha = fadeIn * 0.9;
            ctx.save();
            ctx.beginPath();
            ctx.arc(sx, iy, spriteSize * 0.48, 0, Math.PI * 2);
            ctx.clip();
            ctx.drawImage(talismanImg, sx - spriteSize / 2, iy - spriteSize / 2, spriteSize, spriteSize);
            ctx.restore();

            // Extra sparkle ring
            ctx.globalCompositeOperation = 'screen';
            ctx.globalAlpha = fadeIn * (0.15 + Math.sin(t * 4) * 0.1);
            const ringGlow = ctx.createRadialGradient(sx, iy, spriteSize * 0.3, sx, iy, spriteSize * 0.7);
            ringGlow.addColorStop(0, 'rgba(0,0,0,0)');
            ringGlow.addColorStop(0.5, 'rgba(120, 255, 100, 0.3)');
            ringGlow.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = ringGlow;
            ctx.fillRect(sx - spriteSize, iy - spriteSize, spriteSize * 2, spriteSize * 2);
        } else {
            // Fallback: procedural key shape for non-talisman key drops
            ctx.globalCompositeOperation = 'screen';
            const pulse = 0.6 + Math.sin(t * 3) * 0.2;
            const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, 30);
            glow.addColorStop(0, `rgba(255, 210, 80, ${0.5 * pulse})`);
            glow.addColorStop(0.5, `rgba(200, 150, 30, ${0.15 * pulse})`);
            glow.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = glow;
            ctx.fillRect(sx - 30, sy - 30, 60, 60);

            ctx.globalCompositeOperation = 'source-over';
            const iy = sy - 18 + bob;
            ctx.globalAlpha = fadeIn * 0.95;
            ctx.fillStyle = d.color;
            ctx.strokeStyle = '#fff8e0';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(sx, iy - 4, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = fadeIn * 0.4;
            ctx.stroke();
            ctx.globalAlpha = fadeIn * 0.95;
            ctx.fillRect(sx - 1.5, iy + 1, 3, 10);
            ctx.fillRect(sx + 1, iy + 7, 3, 2);
            ctx.fillRect(sx + 1, iy + 4, 2, 2);
            ctx.globalAlpha = fadeIn * (0.3 + Math.sin(t * 5) * 0.3);
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.arc(sx - 2, iy - 6, 1.5, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }
}

// ============================================================
//  INVENTORY UI RENDERING
// ============================================================

// Layout constants
const INV_PANEL_W = 360;
const INV_EQUIP_SIZE = 56;
const INV_SLOT_SIZE = 50;
const INV_SLOT_GAP = 5;
const INV_BACKPACK_COLS = 4;

function getInvLayout() {
    const px = canvasW / 2 - INV_PANEL_W / 2;
    const py = canvasH / 2 - 250;
    return { px, py, pw: INV_PANEL_W, ph: 500 };
}

function getEquipSlotRect(slotIdx) {
    const { px, py, pw } = getInvLayout();
    const totalW = EQUIP_SLOTS.length * INV_EQUIP_SIZE + (EQUIP_SLOTS.length - 1) * 12;
    const startX = px + (pw - totalW) / 2;
    const startY = py + 52;
    return { x: startX + slotIdx * (INV_EQUIP_SIZE + 12), y: startY, w: INV_EQUIP_SIZE, h: INV_EQUIP_SIZE };
}

function getBackpackSlotRect(idx) {
    const { px, py, pw } = getInvLayout();
    const totalW = INV_BACKPACK_COLS * INV_SLOT_SIZE + (INV_BACKPACK_COLS - 1) * INV_SLOT_GAP;
    const startX = px + (pw - totalW) / 2;
    const startY = py + 158;
    const col = idx % INV_BACKPACK_COLS;
    const row = Math.floor(idx / INV_BACKPACK_COLS);
    return {
        x: startX + col * (INV_SLOT_SIZE + INV_SLOT_GAP),
        y: startY + row * (INV_SLOT_SIZE + INV_SLOT_GAP),
        w: INV_SLOT_SIZE, h: INV_SLOT_SIZE,
    };
}

function getDropBtnRect() {
    const { px, py, pw, ph } = getInvLayout();
    const bw = 110, bh = 28;
    return { x: px + pw / 2 - bw / 2, y: py + ph - 50, w: bw, h: bh };
}

// ----- Procedural item icon drawing -----
function drawItemIcon(cx, cy, slot, rarityKey, size, alpha) {
    const col = RARITY[rarityKey].color;
    ctx.save();
    ctx.globalAlpha = alpha;

    // Try sprite-based rendering first (AI-generated pixel art icons)
    const spriteImg = getItemSpriteForSlot(slot, rarityKey);
    if (spriteImg) {
        ctx.imageSmoothingEnabled = false;
        const sprW = size * 0.9;
        ctx.drawImage(spriteImg, cx - sprW / 2, cy - sprW / 2, sprW, sprW);
        // Rarity tinted glow overlay
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = alpha * 0.15;
        const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, sprW * 0.6);
        glow.addColorStop(0, RARITY[rarityKey].glow);
        glow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(cx - sprW, cy - sprW, sprW * 2, sprW * 2);
        ctx.imageSmoothingEnabled = true;
        ctx.restore();
        return;
    }

    // Procedural fallback for slots without sprites
    if (slot === 'wand') {
        // Diagonal wand stick with star tip
        const s = size * 0.38;
        ctx.strokeStyle = col;
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        // Shaft
        ctx.beginPath();
        ctx.moveTo(cx + s, cy + s);
        ctx.lineTo(cx - s * 0.5, cy - s * 0.5);
        ctx.stroke();
        // Star tip
        ctx.fillStyle = col;
        const tx = cx - s * 0.6, ty = cy - s * 0.6, tr = s * 0.35;
        for (let i = 0; i < 4; i++) {
            const a = (i / 4) * Math.PI * 2 - Math.PI / 4;
            ctx.beginPath();
            ctx.moveTo(tx, ty);
            ctx.lineTo(tx + Math.cos(a) * tr, ty + Math.sin(a) * tr);
            ctx.lineTo(tx + Math.cos(a + 0.3) * tr * 0.4, ty + Math.sin(a + 0.3) * tr * 0.4);
            ctx.fill();
        }
        // Glow at tip
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = alpha * 0.5;
        const g = ctx.createRadialGradient(tx, ty, 0, tx, ty, s * 0.6);
        g.addColorStop(0, RARITY[rarityKey].glow);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(tx - s, ty - s, s * 2, s * 2);

    } else if (slot === 'robe') {
        // Chest armor / robe silhouette
        const s = size * 0.34;
        ctx.fillStyle = col;
        ctx.beginPath();
        // Shoulders to waist
        ctx.moveTo(cx - s, cy - s * 0.7);
        ctx.lineTo(cx - s * 1.1, cy - s * 0.3);
        ctx.lineTo(cx - s * 0.7, cy + s);
        ctx.lineTo(cx - s * 0.2, cy + s * 0.6);
        ctx.lineTo(cx, cy + s * 1.1);
        ctx.lineTo(cx + s * 0.2, cy + s * 0.6);
        ctx.lineTo(cx + s * 0.7, cy + s);
        ctx.lineTo(cx + s * 1.1, cy - s * 0.3);
        ctx.lineTo(cx + s, cy - s * 0.7);
        // Neckline
        ctx.quadraticCurveTo(cx + s * 0.3, cy - s * 0.9, cx, cy - s * 0.5);
        ctx.quadraticCurveTo(cx - s * 0.3, cy - s * 0.9, cx - s, cy - s * 0.7);
        ctx.fill();
        // Center line detail
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx, cy - s * 0.5);
        ctx.lineTo(cx, cy + s * 1.1);
        ctx.stroke();

    } else if (slot === 'amulet') {
        // Pendant on a chain
        const s = size * 0.32;
        // Chain arc
        ctx.strokeStyle = col;
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = alpha * 0.6;
        ctx.beginPath();
        ctx.arc(cx, cy - s * 0.8, s * 0.9, Math.PI * 0.2, Math.PI * 0.8);
        ctx.stroke();
        // Gem
        ctx.globalAlpha = alpha;
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(cx, cy - s * 0.4);
        ctx.lineTo(cx + s * 0.6, cy + s * 0.15);
        ctx.lineTo(cx, cy + s * 0.7);
        ctx.lineTo(cx - s * 0.6, cy + s * 0.15);
        ctx.closePath();
        ctx.fill();
        // Inner facet
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.beginPath();
        ctx.moveTo(cx, cy - s * 0.15);
        ctx.lineTo(cx + s * 0.25, cy + s * 0.1);
        ctx.lineTo(cx, cy + s * 0.4);
        ctx.lineTo(cx - s * 0.25, cy + s * 0.1);
        ctx.closePath();
        ctx.fill();

    } else if (slot === 'ring') {
        // Ring with a small gem
        const s = size * 0.3;
        // Band
        ctx.strokeStyle = col;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.ellipse(cx, cy + s * 0.15, s * 0.7, s * 0.55, 0, 0, Math.PI * 2);
        ctx.stroke();
        // Setting gem on top
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(cx, cy - s * 0.4, s * 0.3, 0, Math.PI * 2);
        ctx.fill();
        // Gem highlight
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.beginPath();
        ctx.arc(cx - s * 0.08, cy - s * 0.48, s * 0.12, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.restore();
}

// Empty slot ghost icon (dimmed version)
function drawEmptySlotIcon(cx, cy, slotType, size) {
    drawItemIcon(cx, cy, slotType, 'common', size, 0.12);
}

function drawItemSlot(x, y, w, h, item, isHovered, isEquipSlot, slotType) {
    ctx.save();

    // Slot background
    ctx.globalAlpha = isHovered ? 0.6 : 0.45;
    ctx.fillStyle = item ? '#0e0a06' : '#0a0806';
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 4);
    ctx.fill();

    // Border
    const borderCol = item ? RARITY[item.rarity].color : '#2a2218';
    ctx.globalAlpha = isHovered ? 0.7 : (item ? 0.4 : 0.2);
    ctx.strokeStyle = borderCol;
    ctx.lineWidth = item ? 1.5 : 1;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 4);
    ctx.stroke();

    // Hover glow
    if (isHovered && item) {
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = 0.12;
        const ig = ctx.createRadialGradient(x + w / 2, y + h / 2, 0, x + w / 2, y + h / 2, w * 0.7);
        ig.addColorStop(0, RARITY[item.rarity].glow);
        ig.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = ig;
        ctx.fillRect(x - 6, y - 6, w + 12, h + 12);
        ctx.globalCompositeOperation = 'source-over';
    }

    if (item) {
        // Procedural item icon
        drawItemIcon(x + w / 2, y + h / 2, item.slot, item.rarity, w, 0.9);
        // Rarity pip in top-right corner
        ctx.globalAlpha = 0.8;
        ctx.fillStyle = RARITY[item.rarity].color;
        ctx.beginPath();
        ctx.arc(x + w - 7, y + 7, 3, 0, Math.PI * 2);
        ctx.fill();
    } else if (isEquipSlot && slotType) {
        drawEmptySlotIcon(x + w / 2, y + h / 2, slotType, w);
    }

    ctx.restore();
}

function drawItemTooltip(item, anchorX, anchorY) {
    if (!item) return;
    ctx.save();

    // Build tooltip content
    const nameText = item.name;
    const _cbPrefix = (gameSettings.colorblindMode === 'symbols' && typeof RARITY_SYMBOLS !== 'undefined' && RARITY_SYMBOLS[item.rarity])
        ? RARITY_SYMBOLS[item.rarity].symbol + ' ' : '';
    const subText = _cbPrefix + RARITY[item.rarity].label + ' ' + SLOT_LABELS[item.slot];
    const statLines = [];
    for (const [stat, val] of Object.entries(item.stats)) {
        const def = STAT_DEFS[stat];
        if (def && val !== 0) statLines.push({ fmt: def.fmt(val), label: def.label });
    }

    const ttW = 210;
    const headerH = 40;
    const statH = statLines.length * 18 + 8;
    const hintH = 24; // room for separator + "click to equip/unequip" hint
    // Extra height for stat comparison if comparing against equipped item
    const compareItem = item.slot ? inventory.equipped[item.slot] : null;
    let compareH = 0;
    if (compareItem && compareItem !== item) {
        const allStats = new Set([...Object.keys(item.stats), ...Object.keys(compareItem.stats)]);
        let diffCount = 0;
        for (const stat of allStats) {
            if ((item.stats[stat] || 0) !== (compareItem.stats[stat] || 0)) diffCount++;
        }
        if (diffCount > 0) compareH = 24 + diffCount * 16 + 6;
    }
    const ttH = headerH + statH + compareH + hintH + 10;

    // Position — prefer right of cursor, keep on screen
    let tx = anchorX + 16;
    let ty = anchorY - 20;
    if (tx + ttW > canvasW - 12) tx = anchorX - ttW - 16;
    if (tx < 8) tx = 8;  // ensure left edge stays on screen
    if (ty < 8) ty = 8;
    if (ty + ttH > canvasH - 8) ty = canvasH - ttH - 8;

    // Background
    ctx.globalAlpha = 0.94;
    ctx.fillStyle = '#0c0908';
    ctx.beginPath();
    ctx.roundRect(tx, ty, ttW, ttH, 5);
    ctx.fill();

    // Rarity-colored left accent bar
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = RARITY[item.rarity].color;
    ctx.fillRect(tx, ty + 4, 3, ttH - 8);

    // Border
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = RARITY[item.rarity].color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(tx, ty, ttW, ttH, 5);
    ctx.stroke();

    // Name
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = '13px Georgia';
    ctx.fillStyle = RARITY[item.rarity].color;
    ctx.fillText(nameText, tx + 12, ty + 8);

    // Sub-label
    ctx.font = '9px monospace';
    ctx.fillStyle = '#7a6a4a';
    ctx.fillText(subText, tx + 12, ty + 26);

    // Separator line
    ctx.globalAlpha = 0.15;
    ctx.strokeStyle = '#a89060';
    ctx.beginPath();
    ctx.moveTo(tx + 10, ty + headerH);
    ctx.lineTo(tx + ttW - 10, ty + headerH);
    ctx.stroke();

    // Build comparison against equipped item in same slot
    const equippedItem = item.slot ? inventory.equipped[item.slot] : null;
    const compareStats = {};
    if (equippedItem && equippedItem !== item) {
        // Calculate stat deltas: positive = upgrade, negative = downgrade
        const allStats = new Set([...Object.keys(item.stats), ...Object.keys(equippedItem.stats)]);
        for (const stat of allStats) {
            const newVal = item.stats[stat] || 0;
            const oldVal = equippedItem.stats[stat] || 0;
            if (newVal !== oldVal) compareStats[stat] = newVal - oldVal;
        }
    }

    // Stats
    ctx.globalAlpha = 1;
    let sy = ty + headerH + 8;
    for (const s of statLines) {
        ctx.font = '11px monospace';
        ctx.fillStyle = '#8dbb6a';
        ctx.fillText(s.fmt, tx + 14, sy);
        ctx.fillStyle = '#a09880';
        ctx.fillText(s.label, tx + 58, sy);
        sy += 18;
    }

    // Stat comparison section (if comparing against equipped item)
    if (equippedItem && equippedItem !== item && Object.keys(compareStats).length > 0) {
        // Separator
        ctx.globalAlpha = 0.15;
        ctx.strokeStyle = '#a89060';
        ctx.beginPath();
        ctx.moveTo(tx + 10, sy + 2);
        ctx.lineTo(tx + ttW - 10, sy + 2);
        ctx.stroke();

        // Determine overall upgrade/downgrade/sidegrade
        let netPositive = 0, netNegative = 0;
        for (const delta of Object.values(compareStats)) {
            if (delta > 0) netPositive++;
            else if (delta < 0) netNegative++;
        }
        const verdictText = netPositive > netNegative ? 'UPGRADE' :
                            netNegative > netPositive ? 'DOWNGRADE' : 'SIDEGRADE';
        const verdictColor = netPositive > netNegative ? '#66dd88' :
                             netNegative > netPositive ? '#dd6666' : '#dddd66';

        ctx.globalAlpha = 0.5;
        ctx.font = '9px monospace';
        ctx.fillStyle = '#7a6a4a';
        ctx.textAlign = 'left';
        ctx.fillText('vs ' + equippedItem.name, tx + 14, sy + 14);
        // Verdict badge
        ctx.globalAlpha = 0.7;
        ctx.font = 'bold 9px monospace';
        ctx.fillStyle = verdictColor;
        ctx.textAlign = 'right';
        ctx.fillText(verdictText, tx + ttW - 14, sy + 14);
        ctx.textAlign = 'left';
        sy += 24;
        ctx.globalAlpha = 1;
        for (const [stat, delta] of Object.entries(compareStats)) {
            const def = STAT_DEFS[stat];
            if (!def) continue;
            const sign = delta > 0 ? '+' : '';
            ctx.font = '10px monospace';
            ctx.fillStyle = delta > 0 ? '#66dd88' : '#dd6666';
            ctx.fillText(`${sign}${def.fmt(delta)}`, tx + 14, sy);
            ctx.fillStyle = '#8a7a5a';
            ctx.fillText(def.label, tx + 58, sy);
            sy += 16;
        }
    }

    // Separator above hint
    ctx.globalAlpha = 0.1;
    ctx.strokeStyle = '#a89060';
    ctx.beginPath();
    ctx.moveTo(tx + 10, ty + ttH - hintH - 2);
    ctx.lineTo(tx + ttW - 10, ty + ttH - hintH - 2);
    ctx.stroke();

    // "Click to equip/unequip" hint
    ctx.globalAlpha = 0.3;
    ctx.font = '9px monospace';
    ctx.fillStyle = '#6a5a3a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('click to equip / unequip', tx + ttW / 2, ty + ttH - hintH / 2);

    ctx.restore();
}

function drawInventoryUI() {
    // Removed — inventory managed through Grimoire Equipment tab
    return;

    const { px, py, pw, ph } = getInvLayout();
    const t = performance.now() / 1000;

    ctx.save();

    // Dim overlay
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvasW, canvasH);

    // Panel background — layered for depth
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = '#0a0806';
    ctx.beginPath();
    ctx.roundRect(px, py, pw, ph, 6);
    ctx.fill();

    // Inner border (double-line effect)
    ctx.globalAlpha = 0.12;
    ctx.strokeStyle = '#a89060';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(px + 4, py + 4, pw - 8, ph - 8, 4);
    ctx.stroke();

    // Outer border
    ctx.globalAlpha = 0.3;
    ctx.strokeStyle = '#a89060';
    ctx.beginPath();
    ctx.roundRect(px, py, pw, ph, 6);
    ctx.stroke();

    // Corner ornaments
    const co = 12;
    ctx.globalAlpha = 0.3;
    ctx.strokeStyle = '#c4a878';
    ctx.lineWidth = 1;
    for (const [cornX, cornY] of [[px, py], [px + pw, py], [px, py + ph], [px + pw, py + ph]]) {
        const dx = cornX === px ? 1 : -1;
        const dy = cornY === py ? 1 : -1;
        ctx.beginPath();
        ctx.moveTo(cornX, cornY + dy * co);
        ctx.lineTo(cornX, cornY);
        ctx.lineTo(cornX + dx * co, cornY);
        ctx.stroke();
    }

    // Title
    ctx.globalAlpha = 0.9;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '18px Georgia';
    ctx.fillStyle = '#d4c4a0';
    ctx.fillText('EQUIPMENT', px + pw / 2, py + 24);

    drawDecorLine(px + pw / 2, py + 40, pw / 2 - 40, 0.2);

    // Reset hover state each frame
    invHover = null;
    invTooltipItem = null;

    // ----- Equipment slots with labels BELOW -----
    for (let i = 0; i < EQUIP_SLOTS.length; i++) {
        const slot = EQUIP_SLOTS[i];
        const rect = getEquipSlotRect(i);
        const item = inventory.equipped[slot];
        const hovered = mouse.x >= rect.x && mouse.x <= rect.x + rect.w &&
                        mouse.y >= rect.y && mouse.y <= rect.y + rect.h;

        if (hovered) {
            invHover = { type: 'equip', idx: slot };
            if (item) invTooltipItem = item;
        }

        drawItemSlot(rect.x, rect.y, rect.w, rect.h, item, hovered, true, slot);

        // Slot label BELOW the slot — no overlap
        ctx.globalAlpha = item ? 0.5 : 0.25;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.font = '8px monospace';
        ctx.fillStyle = item ? RARITY[item.rarity].color : '#8a7a5a';
        ctx.fillText(SLOT_LABELS[slot].toUpperCase(), rect.x + rect.w / 2, rect.y + rect.h + 4);
    }

    // Section separator
    const bpLabelY = py + 128;
    drawDecorLine(px + pw / 2, bpLabelY, pw / 2 - 50, 0.12);

    // Backpack label
    ctx.globalAlpha = 0.35;
    ctx.textAlign = 'center';
    ctx.font = '9px monospace';
    ctx.fillStyle = '#a89060';
    ctx.textBaseline = 'middle';
    ctx.fillText('BACKPACK', px + pw / 2, bpLabelY + 12);

    // ----- Backpack slots -----
    for (let i = 0; i < inventory.maxBackpack; i++) {
        const rect = getBackpackSlotRect(i);
        const item = inventory.backpack[i] || null;
        const hovered = mouse.x >= rect.x && mouse.x <= rect.x + rect.w &&
                        mouse.y >= rect.y && mouse.y <= rect.y + rect.h;

        if (hovered) {
            invHover = { type: 'backpack', idx: i };
            if (item) invTooltipItem = item;
        }

        drawItemSlot(rect.x, rect.y, rect.w, rect.h, item, hovered, false, null);
    }

    // ----- Drop button (centered) -----
    const dropRect = getDropBtnRect();
    const dropHovered = mouse.x >= dropRect.x && mouse.x <= dropRect.x + dropRect.w &&
                        mouse.y >= dropRect.y && mouse.y <= dropRect.y + dropRect.h;
    if (dropHovered) invHover = { type: 'drop', idx: 0 };

    ctx.globalAlpha = dropHovered ? 0.55 : 0.25;
    ctx.fillStyle = '#140808';
    ctx.beginPath();
    ctx.roundRect(dropRect.x, dropRect.y, dropRect.w, dropRect.h, 3);
    ctx.fill();
    ctx.globalAlpha = dropHovered ? 0.6 : 0.2;
    ctx.strokeStyle = dropHovered ? '#aa4444' : '#443333';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(dropRect.x, dropRect.y, dropRect.w, dropRect.h, 3);
    ctx.stroke();

    ctx.globalAlpha = dropHovered ? 0.75 : 0.35;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '9px monospace';
    ctx.fillStyle = dropHovered ? '#cc6666' : '#886666';
    ctx.fillText('DROP ITEM', dropRect.x + dropRect.w / 2, dropRect.y + dropRect.h / 2);

    // Close hint
    ctx.globalAlpha = 0.22;
    ctx.textAlign = 'center';
    ctx.font = '8px monospace';
    ctx.fillStyle = '#8a7a5a';
    ctx.fillText('I  or  ESC  to close', px + pw / 2, py + ph - 16);

    // ----- Tooltip (drawn last, on top) -----
    if (invTooltipItem) {
        drawItemTooltip(invTooltipItem, mouse.x, mouse.y);
    }

    ctx.restore();
}

// Handle inventory click
function handleInventoryClick(mx, my) {
    if (!inventoryOpen) return;

    // Check equip slots — clicking unequips
    for (let i = 0; i < EQUIP_SLOTS.length; i++) {
        const rect = getEquipSlotRect(i);
        if (mx >= rect.x && mx <= rect.x + rect.w && my >= rect.y && my <= rect.y + rect.h) {
            unequipItem(EQUIP_SLOTS[i]);
            return;
        }
    }

    // Check backpack slots — clicking equips
    for (let i = 0; i < inventory.maxBackpack; i++) {
        const rect = getBackpackSlotRect(i);
        if (mx >= rect.x && mx <= rect.x + rect.w && my >= rect.y && my <= rect.y + rect.h) {
            if (inventory.backpack[i]) {
                equipItem(i);
                return;
            }
        }
    }

    // Check drop button
    const dropRect = getDropBtnRect();
    if (mx >= dropRect.x && mx <= dropRect.x + dropRect.w && my >= dropRect.y && my <= dropRect.y + dropRect.h) {
        if (inventory.backpack.length > 0) {
            dropFromBackpack(inventory.backpack.length - 1);
        }
    }
}

// ============================================================
//  DEATH SCREEN & PAUSE OVERLAY
// ============================================================
// ============================================================
//  ABYSS MODIFIER CHOICE SCREEN
//  Shows 3 modifier cards. Player clicks one to accept.
// ============================================================
var _abyssChoiceRects = []; // click rects for each card

function drawAbyssChoiceScreen() {
    if (typeof abyssChoiceState === 'undefined' || !abyssChoiceState.pending) return;
    const cx = canvasW / 2, cy = canvasH / 2;
    ctx.save();

    // Dark overlay
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvasW, canvasH);

    // Title
    ctx.globalAlpha = 0.9;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 28px Georgia';
    ctx.fillStyle = '#cc4488';
    ctx.shadowColor = 'rgba(200,60,120,0.4)';
    ctx.shadowBlur = 20;
    const titleText = abyssChoiceState.doubleChoice ? 'CHOOSE TWO MODIFIERS' : 'CHOOSE A MODIFIER';
    ctx.fillText(titleText, cx, cy - 110);
    ctx.shadowBlur = 0;

    ctx.font = 'italic 12px Georgia';
    ctx.fillStyle = '#aa6688';
    ctx.globalAlpha = 0.6;
    ctx.fillText('The Abyss deepens. Choose your burden.', cx, cy - 80);

    // Cards
    const cardW = 150, cardH = 120, cardGap = 16;
    const opts = abyssChoiceState.options;
    const totalW = opts.length * cardW + (opts.length - 1) * cardGap;
    const startX = cx - totalW / 2;
    _abyssChoiceRects = [];

    for (let i = 0; i < opts.length; i++) {
        const mod = opts[i];
        const cardX = startX + i * (cardW + cardGap);
        const cardY = cy - 40;
        const hovered = mouse && mouse.x >= cardX && mouse.x <= cardX + cardW && mouse.y >= cardY && mouse.y <= cardY + cardH;
        _abyssChoiceRects.push({ x: cardX, y: cardY, w: cardW, h: cardH });

        // Card background
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = hovered ? 'rgba(60,30,40,0.95)' : 'rgba(25,15,20,0.95)';
        ctx.beginPath(); ctx.roundRect(cardX, cardY, cardW, cardH, 8); ctx.fill();

        // Border
        const modColor = mod.color || '#cc4488';
        ctx.strokeStyle = hovered ? modColor : '#664455';
        ctx.lineWidth = hovered ? 2.5 : 1.5;
        ctx.globalAlpha = hovered ? 0.9 : 0.5;
        ctx.beginPath(); ctx.roundRect(cardX, cardY, cardW, cardH, 8); ctx.stroke();

        // Hover glow
        if (hovered) {
            ctx.globalCompositeOperation = 'screen';
            ctx.globalAlpha = 0.15;
            const g = ctx.createRadialGradient(cardX + cardW / 2, cardY + cardH / 2, 0, cardX + cardW / 2, cardY + cardH / 2, cardW * 0.6);
            g.addColorStop(0, modColor);
            g.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = g;
            ctx.fillRect(cardX, cardY, cardW, cardH);
            ctx.globalCompositeOperation = 'source-over';
        }

        // Modifier name
        ctx.textAlign = 'center';
        ctx.font = 'bold 14px Georgia';
        ctx.fillStyle = modColor;
        ctx.globalAlpha = 0.9;
        ctx.fillText(mod.name, cardX + cardW / 2, cardY + 30);

        // Description (word-wrapped)
        ctx.font = '10px Georgia';
        ctx.fillStyle = '#aa9988';
        ctx.globalAlpha = 0.7;
        const words = mod.desc.split(' ');
        let line = '', lineY = cardY + 55;
        for (const word of words) {
            const test = line + (line ? ' ' : '') + word;
            if (ctx.measureText(test).width > cardW - 20) {
                ctx.fillText(line, cardX + cardW / 2, lineY);
                lineY += 14;
                line = word;
            } else {
                line = test;
            }
        }
        if (line) ctx.fillText(line, cardX + cardW / 2, lineY);

        // Click hint
        ctx.font = '8px monospace';
        ctx.fillStyle = '#776666';
        ctx.globalAlpha = hovered ? 0.6 : 0.3;
        ctx.fillText('click to accept', cardX + cardW / 2, cardY + cardH - 10);
    }

    // Picks remaining indicator
    if (abyssChoiceState.picksRemaining > 1) {
        ctx.font = '11px Georgia';
        ctx.fillStyle = '#e8c840';
        ctx.globalAlpha = 0.7;
        ctx.fillText('Picks remaining: ' + abyssChoiceState.picksRemaining, cx, cy + cardH + 10);
    }

    ctx.restore();
}

function drawDeathScreen() {
    const t = deathFadeTimer;
    const fadeIn = Math.min(1, t / 1.5);
    const cx = canvasW / 2;
    const cy = canvasH / 2;

    ctx.save();
    // Dark overlay
    ctx.globalAlpha = fadeIn * 0.7;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvasW, canvasH);

    // Death screen background art (if available)
    const deathBg = images.death_screen_bg;
    if (deathBg) {
        const imgAspect = deathBg.width / deathBg.height;
        const canAspect = canvasW / canvasH;
        let drawW, drawH, drawX, drawY;
        if (canAspect > imgAspect) {
            drawW = canvasW;
            drawH = canvasW / imgAspect;
            drawX = 0;
            drawY = (canvasH - drawH) / 2;
        } else {
            drawH = canvasH;
            drawW = canvasH * imgAspect;
            drawX = (canvasW - drawW) / 2;
            drawY = 0;
        }
        ctx.globalAlpha = fadeIn * 0.85;
        ctx.drawImage(deathBg, drawX, drawY, drawW, drawH);
    }

    // Pulsing red vignette — heartbeat-like throb
    const vigPulse = 0.12 + Math.sin(t * 1.8) * 0.04;
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = fadeIn * vigPulse;
    const rVig = ctx.createRadialGradient(cx, cy, 0, cx, cy, canvasH * 0.7);
    rVig.addColorStop(0, 'rgba(0,0,0,0)');
    rVig.addColorStop(0.5, 'rgba(80,10,5,0.2)');
    rVig.addColorStop(1, 'rgba(140,15,5,0.6)');
    ctx.fillStyle = rVig;
    ctx.fillRect(0, 0, canvasW, canvasH);
    ctx.globalCompositeOperation = 'source-over';

    if (t > 1.0) {
        const textAlpha = Math.min(1, (t - 1.0) / 1.0);
        const slideOffset = Math.max(0, 20 * (1 - Math.min(1, (t - 1.0) / 0.5)));

        // Position headline in the dark zone below the art
        const headlineY = deathBg ? canvasH * 0.68 : cy - 40;

        ctx.globalAlpha = textAlpha;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Death headline — large, dramatic, the only text element
        const _deathName = playerName || 'Wanderer';
        const _formDeathLines = {
            slime:    'dissolves into nothing...',
            skeleton: 'crumbles to dust...',
            wizard:   'light fades...',
            lich:     'soul dissipates...',
        };
        const _deathVerb = _formDeathLines[FormSystem.currentForm] || 'light fades...';
        const _deathMsg = _deathName.toLowerCase().endsWith('s')
            ? `${_deathName}' ${_deathVerb}`
            : `${_deathName}'s ${_deathVerb}`;
        ctx.font = '48px Georgia';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
        ctx.shadowBlur = 16;
        ctx.fillStyle = '#cc3322';
        ctx.fillText(_deathMsg, cx, headlineY - slideOffset);
        ctx.shadowColor = 'rgba(180, 20, 10, 0.5)';
        ctx.shadowBlur = 40;
        ctx.fillText(_deathMsg, cx, headlineY - slideOffset);
        ctx.shadowBlur = 0;

        // Decorative lines
        if (typeof drawDecorLine === 'function') {
            drawDecorLine(cx, headlineY - 36 - slideOffset, 180, textAlpha * 0.4);
            drawDecorLine(cx, headlineY + 32 - slideOffset, 140, textAlpha * 0.3);
        }
    }

    if (t > 2.5) {
        const btnAlpha = Math.min(1, (t - 2.5) / 0.8);
        ctx.globalAlpha = btnAlpha;

        // Buttons centered below the headline
        const btnW = 180, btnH = 40;
        const btnGap = 12;
        const btnY = deathBg ? canvasH * 0.80 : cy + 100;
        const btnX = cx - btnW - btnGap / 2;
        deathBtnRect = { x: btnX, y: btnY, w: btnW, h: btnH };
        const hoveredRestart = mouse.x >= btnX && mouse.x <= btnX + btnW && mouse.y >= btnY && mouse.y <= btnY + btnH;
        drawMenuButton({ x: btnX, y: btnY, w: btnW, h: btnH, label: 'RISE AGAIN' }, hoveredRestart, btnAlpha);

        const menuBtnX = cx + btnGap / 2, menuBtnY = btnY;
        if (!deathMenuBtnRect) deathMenuBtnRect = {};
        deathMenuBtnRect.x = menuBtnX; deathMenuBtnRect.y = menuBtnY;
        deathMenuBtnRect.w = btnW; deathMenuBtnRect.h = btnH;
        const hoveredMenu = mouse.x >= menuBtnX && mouse.x <= menuBtnX + btnW && mouse.y >= menuBtnY && mouse.y <= menuBtnY + btnH;
        drawMenuButton({ x: menuBtnX, y: menuBtnY, w: btnW, h: btnH, label: 'RETURN TO MENU' }, hoveredMenu, btnAlpha);

        setPixelCursor((hoveredRestart || hoveredMenu) ? 'pointer' : 'default');

        // Key hints
        ctx.globalAlpha = btnAlpha * 0.3;
        ctx.font = '8px monospace';
        ctx.fillStyle = '#aa9060';
        ctx.fillText('[R] Retry', btnX + btnW / 2, btnY + btnH + 14);
        ctx.fillText('[M] Menu', menuBtnX + btnW / 2, menuBtnY + btnH + 14);
    }

    ctx.restore();
}

// Pause menu button rects (for click handling)
let pauseBtnResume = null, pauseBtnSave = null, pauseBtnQuit = null;

function drawPauseOverlay() {
    const cx = canvasW / 2;
    const cy = canvasH / 2;

    ctx.save();

    // Heavy dark overlay with vignette
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvasW, canvasH);
    const vig = ctx.createRadialGradient(cx, cy, 60, cx, cy, Math.max(canvasW, canvasH) * 0.55);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.5)');
    ctx.globalAlpha = 1;
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, canvasW, canvasH);

    // Center panel backdrop
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = '#0a0806';
    ctx.beginPath();
    ctx.roundRect(cx - 130, cy - 100, 260, 250, 8);
    ctx.fill();
    ctx.globalAlpha = 0.2;
    ctx.strokeStyle = '#8a7a50';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(cx - 130, cy - 100, 260, 250, 8);
    ctx.stroke();

    // Title glow — warmer, more prominent
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.15;
    const titleGlow = ctx.createRadialGradient(cx, cy - 55, 0, cx, cy - 55, 160);
    titleGlow.addColorStop(0, 'rgba(200, 160, 60, 0.5)');
    titleGlow.addColorStop(1, 'rgba(60, 40, 10, 0)');
    ctx.fillStyle = titleGlow;
    ctx.fillRect(cx - 180, cy - 150, 360, 200);
    ctx.globalCompositeOperation = 'source-over';

    // "PAUSED" title — larger, bolder
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = 0.9;
    ctx.font = '42px Georgia';
    ctx.shadowColor = 'rgba(200, 160, 50, 0.4)';
    ctx.shadowBlur = 24;
    ctx.fillStyle = '#e8c868';
    ctx.fillText('PAUSED', cx, cy - 55);
    ctx.shadowBlur = 0;

    // Decorative lines — wider, more visible
    drawDecorLine(cx, cy - 87, 140, 0.4);
    drawDecorLine(cx, cy - 27, 110, 0.3);

    // --- Pause menu buttons ---
    const btnW = 180, btnH = 36, btnGap = 8;
    const btnX = cx - btnW / 2;
    let btnY = cy - 5;

    // Resume
    pauseBtnResume = { x: btnX, y: btnY, w: btnW, h: btnH };
    const hResume = pointInButton(mouse.x, mouse.y, pauseBtnResume);
    drawMenuButton({ ...pauseBtnResume, label: 'RESUME' }, hResume, 0.9);
    btnY += btnH + btnGap;

    // Save Game
    pauseBtnSave = { x: btnX, y: btnY, w: btnW, h: btnH };
    const hSave = pointInButton(mouse.x, mouse.y, pauseBtnSave);
    drawMenuButton({ ...pauseBtnSave, label: 'SAVE GAME' }, hSave, 0.9);
    btnY += btnH + btnGap;

    // Quit to Menu
    pauseBtnQuit = { x: btnX, y: btnY, w: btnW, h: btnH };
    const hQuit = pointInButton(mouse.x, mouse.y, pauseBtnQuit);
    drawMenuButton({ ...pauseBtnQuit, label: 'QUIT TO MENU' }, hQuit, 0.9);
    btnY += btnH + btnGap + 8;

    // Settings hints below buttons
    ctx.font = '10px monospace';
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#8a7850';
    ctx.strokeText('Q \u2014 graphics: ' + GFX.quality.toUpperCase(), cx, btnY);
    ctx.fillText('Q \u2014 graphics: ' + GFX.quality.toUpperCase(), cx, btnY);

    setPixelCursor((hResume || hSave || hQuit) ? 'pointer' : 'default');

    ctx.restore();
}

function restartGame() {
    // Reset form system FIRST — game starts as slime
    FormSystem.currentForm = 'slime';
    FormSystem.previousForm = null;
    FormSystem.evolutionCount = 0;
    FormSystem.talisman = { level: 1, xp: 0, xpToNext: 100, perks: [], found: false };
    FormSystem.formData.slime = { unlocked: true, absorbed: 0, maxSizeReached: 0, totalKills: 0, bossDefeated: false };
    FormSystem.formData.skeleton = { unlocked: false, bonesCollected: 0, shieldBashes: 0, shieldDamageBlocked: 0, maxComboReached: 0, totalKills: 0 };
    FormSystem.formData.wizard = { unlocked: false, spellsCast: 0, towersPlaced: 0, lowManaKills: 0, totalKills: 0 };
    FormSystem.formData.lich = { unlocked: false, soulsHarvested: 0, undeadRaised: 0, totalKills: 0 };
    FormSystem.evolutionProgress = { currentMilestones: {}, nextForm: null };
    FormSystem.formHistory = [];
    FormSystem.legacyEchoes = [];
    if (typeof fusedUpgrades !== 'undefined') {
        for (const key of Object.keys(fusedUpgrades)) delete fusedUpgrades[key];
    }
    window._storyBeatShown = {};
    // Reset quest state for fresh run (quest progress should not leak between runs)
    if (typeof questState !== 'undefined') {
        questState.flags = {};
        questState.completed = [];
        questState.rerollTokens = 0;
        questState.permBonuses = { dmgBonus: 0, maxHpBonus: 0 };
    }
    // Reset player (position will be overridden by loadZone below)
    player.row = 26; player.col = 15;
    player.vx = 0; player.vy = 0;
    // Set form-specific starting stats (now correctly reads slime config)
    const startConfig = FormSystem.getFormConfig() || FORM_CONFIGS.slime;
    player.hp = startConfig.maxHp; player.mana = startConfig.maxMana || 0;
    player.state = 'idle'; player.animFrame = 0;
    player.attacking = false; player.dodging = false;
    player.attackCooldown = 0; player.dodgeCoolTimer = 0;
    player.manaRegenTimer = 0;
    // Reset combat
    enemies.length = 0;
    projectiles.length = 0;
    enemyProjectiles.length = 0;
    towerBolts.length = 0;
    summons.length = 0;
    worldDrops.length = 0;
    if (typeof worldAugmentDrops !== 'undefined') worldAugmentDrops.length = 0;
    // Reset augment inventory (form-specific loot doesn't carry between runs)
    if (typeof augmentInventory !== 'undefined') {
        augmentInventory.equipped = [null, null, null];
        augmentInventory.backpack = [];
    }
    ghosts.length = 0;
    pickupTexts.length = 0;
    playerInvTimer = 0;
    placement.active = false;
    placement.channeling = false;
    placement.channelTimer = 0;
    // Reset chests that were opened during play back to closed
    for (const key of openedChests) {
        const [r, c] = key.split(',').map(Number);
        if (objectMap[r] && objectMap[r][c] !== undefined) {
            objectMap[r][c] = 'chestClosed';
        }
    }
    openedChests.clear();
    keyItems.length = 0;
    worldKeyDrops.length = 0;
    zoneTransition = null;
    _townReturnSpawn = false;  // new game spawns inside lobby, not Hamlet entrance
    menuOpen = false;
    menuFadeInTimer = 0;
    menuTab = 'status';
    // Reset inventory
    inventory.equipped = { wand: null, robe: null, amulet: null, ring: null };
    inventory.backpack = [];
    inventoryOpen = false;
    // Reset progression
    progressionIndex = 0;
    isProceduralZone = false;
    proceduralDepth = 1;
    endlessDepth = 5;
    deepestDepthReached = 0;
    // Reset abyss modifiers and new feature state
    if (typeof activeModifiers !== 'undefined') activeModifiers.length = 0;
    if (typeof _lastAddedModifier !== 'undefined') _lastAddedModifier = null;
    if (typeof burnZones !== 'undefined') burnZones.length = 0;
    if (typeof veilUndyingCooldown !== 'undefined') veilUndyingCooldown = 0;
    if (typeof groundHazards !== 'undefined') groundHazards.length = 0;
    if (typeof claimedMilestones !== 'undefined') claimedMilestones.length = 0;
    if (typeof playerGold !== 'undefined') playerGold = 0;
    if (typeof runStartTime !== 'undefined') runStartTime = Date.now();
    if (typeof runGoldEarned !== 'undefined') runGoldEarned = 0;
    // Apply milestone start bonuses from player profile
    if (typeof playerProfile !== 'undefined' && typeof MILESTONE_DEFS !== 'undefined') {
        for (var _mi = 0; _mi < MILESTONE_DEFS.length; _mi++) {
            var _ms = MILESTONE_DEFS[_mi];
            if (playerProfile.milestones[_ms.id] && _ms.bonus) {
                if (_ms.bonus.type === 'gold') playerGold += _ms.bonus.value;
                else if (_ms.bonus.type === 'stat' && _ms.bonus.stat === 'dmgBonus') {
                    questState.permBonuses.dmgBonus = (questState.permBonuses.dmgBonus || 0) + _ms.bonus.value;
                } else if (_ms.bonus.type === 'stat' && _ms.bonus.stat === 'maxHpBonus') {
                    player.hp += _ms.bonus.value;
                }
            }
        }
    }
    if (typeof resetPotions === 'function') resetPotions();
    // Apply potion milestone bonuses AFTER resetPotions
    if (typeof playerProfile !== 'undefined' && typeof MILESTONE_DEFS !== 'undefined') {
        for (var _mi2 = 0; _mi2 < MILESTONE_DEFS.length; _mi2++) {
            var _ms2 = MILESTONE_DEFS[_mi2];
            if (playerProfile.milestones[_ms2.id] && _ms2.bonus && _ms2.bonus.type === 'potion') {
                if (typeof playerPotions !== 'undefined') playerPotions[_ms2.bonus.item] = (playerPotions[_ms2.bonus.item] || 0) + _ms2.bonus.value;
            }
        }
    }
    if (typeof forgeUpgrades !== 'undefined') {
        for (const k of Object.keys(forgeUpgrades)) forgeUpgrades[k] = 0;
    }
    if (typeof _evoHintShown !== 'undefined') { _evoHintShown.slime = false; _evoHintShown.skeleton = false; _evoHintShown.wizard = false; }
    // Reset hamlet rebuild state for new game
    if (typeof hamletRebuild !== 'undefined') {
        for (const k of Object.keys(hamletRebuild)) hamletRebuild[k] = 0;
    }
    // Reset wave — use 'done' so waves don't auto-trigger before loadZone/startWaveSystem
    wave.current = 0;
    wave.phase = 'done';
    wave.timer = 0;
    wave.bannerAlpha = 0;
    wave.bannerText = '';
    wave.bannerSub = '';
    wave.enemiesAlive = 0;
    wave.totalKilled = 0;
    // Reset screen effects
    screenShakeTimer = 0;
    screenShakeIntensity = 0;
    hitPauseTimer = 0;
    slowMoTimer = 0;
    slowMoScale = 1.0;
    gameDead = false;
    deathFadeTimer = 0;
    deathCause = '';
    deathBtnRect = null;
    deathMenuBtnRect = null;
    gamePaused = false;
    // Reset camera
    const startPos = tileToScreen(player.row, player.col);
    smoothCamX = canvasW / 2 - startPos.x;
    smoothCamY = canvasH / 2 - startPos.y;
    cameraX = Math.round(smoothCamX);
    cameraY = Math.round(smoothCamY);
    // Reset level-up system
    xpState.xp = 0;
    xpState.level = 1;
    xpState.xpToNext = xpForLevel(1);
    xpState.levelUpPending = false;
    xpState.levelUpChoices = [];
    xpState.levelUpHover = -1;
    xpState.levelUpKeyHover = -1;
    xpState.levelUpFadeIn = 0;
    xpState.levelUpRevealT = 0;
    xpState.levelUpHasLegendary = false;
    // Clear all upgrades
    for (const key of Object.keys(upgrades)) delete upgrades[key];
    orbitAngle = 0;
    // Reset slime state
    slimeState.size = 1;
    slimeState.bounceHeight = 0;
    slimeState.bounceVel = 0;
    slimeState.squash = 1.0;
    slimeState.acidPuddles = [];
    slimeState.splitClones = [];
    slimeState.bounceJumping = false;
    slimeState.bounceJumpTimer = 0;
    slimeState.bounceJumpHeight = 0;
    slimeState.landingDamageDealt = false;
    slimeState._absorbCooldown = 0;
    slimeState._oozeTimer = 0;
    slimeState.absorptionMomentum = 0;
    slimeState.momentumTimer = 0;
    slimeState.membraneShield = 0;
    // Reset skeleton state
    skeletonState.stamina = skeletonState.maxStamina;
    skeletonState.staminaDelayTimer = 0;
    skeletonState.boneAmmo = skeletonState.maxBoneAmmo;
    skeletonState.boneRegenTimer = 0;
    skeletonState.shieldUp = false;
    skeletonState.shieldTimer = 0;
    skeletonState.shieldHP = skeletonState.shieldMaxHP;
    skeletonState.rolling = false;
    skeletonState.rollTimer = 0;
    skeletonState.boneFragments = [];
    skeletonState._undyingUsed = false;
    // Reset lich state
    lichState.soulEnergy = (FormSystem.currentForm === 'lich') ? 25 : 0;
    lichState.lifeTapCooldown = 0;
    lichState.undeadMinions = [];
    lichState.shadowStepCooldown = 0;
    lichState.hoverOffset = 0;
    lichState.hoverTime = 0;
    lichState.deathAuraTimer = 0;
    lichState.corpseLocations = [];
    lichState._phylacteryUsed = false;
    // Reset evolution state
    evolutionState.active = false;
    evolutionState.timer = 0;
    evolutionHintState.active = false;
    evolutionHintState.dismissed = false;
    evolutionHintState.timer = 0;
    evolutionHintState.alpha = 0;
    // Reset cinematic state
    wizardRotation = 0;
    wizardRiseProgress = 1;
    bloodStainAlpha = 0;
    dustParticles = [];
    if (typeof _weatherParticles !== 'undefined') _weatherParticles.length = 0;
    if (typeof _weatherRipples !== 'undefined') _weatherRipples.length = 0;
    if (typeof _combatDecals !== 'undefined') _combatDecals.length = 0;
    if (typeof _critters !== 'undefined') _critters.length = 0;
    if (typeof _impactRipples !== 'undefined') _impactRipples.length = 0;
    _lowHpBeatTimer = 0;
    if (typeof _phantomHP !== 'undefined') _phantomHP = -1;
    _arrivalVignetteTimer = 0; // vignette only triggers on zone transitions, not initial load
    cinematicTimer = 0;
    cinematicTextAlpha = [0, 0, 0, 0];
    cinematicFlashAlpha = 0;
    // Reset light to full
    lightRadius = MAX_LIGHT;
    // Start in the Antechamber (Zone 7) — player awakens here
    seedMapRNG(Date.now() ^ (Math.random() * 0xFFFFFF | 0)); // new seed each restart
    currentZone = 7;
    loadZone(7);
    // Don't show zone banner for starting zone — let runIntro handle the reveal
    updateDoorDefsForZone(7);
    updateChestDefsForZone(7);
    buildRoomBounds();
    buildEnvironmentLights();
    loadZoneNPCs(7);
    // Re-snap camera after zone rebuild
    const restartPos = tileToScreen(player.row, player.col);
    smoothCamX = canvasW / 2 - restartPos.x;
    smoothCamY = canvasH / 2 - restartPos.y;
    cameraX = Math.round(smoothCamX);
    cameraY = Math.round(smoothCamY);
    // Restart waves and music (skip wave system for non-combat zones like Zone 0)
    duckMusic(false);
    const _restartZoneCfg = ZONE_CONFIGS[currentZone] || {};
    if (_restartZoneCfg.hasWaves !== false) {
        startWaveSystem();
    }
    setPixelCursor('none');
    // Reset zone transition state
    zoneTransitionFading = false;
    zoneTransitionAlpha = 0;
    zoneTransitionTarget = -1;
    if (typeof Notify !== 'undefined') Notify.reset();
}

function render() {
    // Re-apply transform each frame (canvas resize resets it)
    const dpr = window.devicePixelRatio || 1;


    const _zf = typeof _cameraZoom !== 'undefined' ? _cameraZoom : 1;
    ctx.setTransform(dpr * displayScale, 0, 0, dpr * displayScale, 0, 0);
    if (_zf !== 1) {
        const _zcx = canvasW / 2, _zcy = canvasH / 2;
        ctx.translate(_zcx, _zcy);
        ctx.scale(_zf, _zf);
        ctx.translate(-_zcx, -_zcy);
    }

    // Safety: reset alpha every frame so no VFX leak carries over
    ctx.globalAlpha = 1.0;
    // Crisp pixel art: disable bilinear interpolation for sprite/tile rendering
    ctx.imageSmoothingEnabled = false;

    // Reset world label overlap tracking for this frame
    if (typeof _resetWorldLabels === 'function') _resetWorldLabels();

    // 2D mode: clear with zone-appropriate background color
    // Use palette bgColor for zones that have one, fallback to dark brown
    const _pal = (typeof ZONE_BG_PALETTES !== 'undefined') ? ZONE_BG_PALETTES[currentZone] : null;
    if (_pal) {
        ctx.fillStyle = `rgb(${_pal.bgColor[0]},${_pal.bgColor[1]},${_pal.bgColor[2]})`;
    } else {
        ctx.fillStyle = '#120e0a';
    }
    ctx.fillRect(0, 0, canvasW, canvasH);

    // Pre-menu: dark screen with pulsing "click anywhere to begin"
    if (gamePhase === 'preMenu') {
        drawPreMenuScreen();
        return;
    }

    // Menu screens render here and return early
    if (gamePhase === 'menu' || gamePhase === 'menuFade') {
        drawMenuScreen(0);
        return;
    }
    if (gamePhase === 'menuControls' || gamePhase === 'menuControlsFade') {
        drawControlsScreen(0);
        return;
    }
    if (gamePhase === 'nameEntry') {
        drawNameEntry();
        return;
    }
    if (gamePhase === 'loadScreen') {
        drawLoadScreen();
        return;
    }

    if (gamePhase !== 'playing' && gamePhase !== 'awakening' && gamePhase !== 'cinematic' && gamePhase !== 'intro') return;

    // Intro: black screen during text phase, then render world during reveal
    if (gamePhase === 'intro') {
        if (introTimer < 26.0) {
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, canvasW, canvasH);
            return; // text overlay drawn by drawIntroOverlay() after render()
        }
        // After 5.5s: fall through to normal world rendering (overlay fades on top)
    }

    // Cinematic: render black background with subtle vignette, NOT the game world
    if (gamePhase === 'cinematic') {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvasW, canvasH);
        // Subtle warm vignette for atmosphere
        ctx.globalAlpha = 0.15;
        const vigGrad = ctx.createRadialGradient(canvasW/2, canvasH/2, 0, canvasW/2, canvasH/2, canvasH * 0.7);
        vigGrad.addColorStop(0, 'rgba(60, 30, 10, 0.3)');
        vigGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = vigGrad;
        ctx.fillRect(0, 0, canvasW, canvasH);
        ctx.globalAlpha = 1;
        return; // skip world rendering
    }

    // ═══════════════════════════════════════════════════════════
    //  RENDER LAYER ORDER (formalized for maintainability):
    //    0. Background (nebula/void texture)
    //    1. Ghost afterimages (dodge trails)
    //    2. Depth-sorted world (floors → edge shadows → hints → sprites ↔ object tiles)
    //    3. Floor decals (blood stain)
    //    4. Darkness / lighting (multiply-blend torch, hell, outdoor)
    //    5. Player occlusion overlay (40% alpha sprite above darkness)
    //    6. Player ground marker + brightness boost
    //    7. World effects (dust, tower glows, orbits, drops, projectiles, particles)
    //    8. Screen effects (dodge flash, damage flash, vignette, cooldown)
    //    9. HUD (HP/mana, notifications, wave UI, crosshair, inventory)
    //   10. Zone transition overlay
    // ═══════════════════════════════════════════════════════════

    // ── LAYER 0: Background ──
    if (typeof BackgroundManager !== 'undefined') {
        BackgroundManager.draw(ctx, canvasW, canvasH, cameraX, cameraY, _frameDt);
    }

    // ── LAYER 1: Ghost afterimages ──
    for (const g of ghosts) {
        drawGhost(g);
    }

    // ── LAYER 2: Depth-sorted world ──
    // Build sorted list of all "sprites" (player + enemies) by depth score
    spritePool.length = 0; // Clear pooled array instead of allocating new one
    const mapSize = floorMap.length;
    const playerDepth = player.row + player.col;
    // Player gets +0.5 depth bias so they draw AFTER object tiles at the same
    // position on the diagonal — prevents tall wall/column sprites from covering
    // the player when they're on the same isometric depth line.
    // All forms use the same +0.5 depth bias.  The slime's draw function anchors
    // the sprite at yAnchor=1.0 so it sits entirely above the tile center point,
    // eliminating the floor-tile overdraw that previously required a higher bias.
    const wizardScore = playerDepth * mapSize + player.row + 0.5;
    let spriteId = 0;
    spritePool.push({ score: wizardScore, id: spriteId++, isPlayer: true, draw: () => {
        const handler = FormSystem.getHandler();
        if (handler && handler.draw) handler.draw();
        else drawWizard();
    }});

    for (const e of enemies) {
        const eDepth = e.row + e.col;
        const eScore = eDepth * mapSize + e.row;
        spritePool.push({ score: eScore, id: spriteId++, draw: () => drawEnemy(e) });
    }

    for (const n of npcList) {
        const nDepth = n.row + n.col;
        const nScore = nDepth * mapSize + n.row;
        spritePool.push({ score: nScore, id: spriteId++, draw: () => drawNPC(n) });
    }

    for (const t of summons) {
        const tDepth = t.row + t.col;
        const tScore = tDepth * mapSize + t.row;
        spritePool.push({ score: tScore, id: spriteId++, draw: () => drawTower(t) });
    }
    spritePool.sort((a, b) => a.score - b.score || a.id - b.id);
    let spriteIdx = 0;

    // === PASS 1: Draw ALL floor tiles first ===
    // Floor tiles are flat ground and must never overlap entities.
    // Drawing them in a separate pass before sprite interleaving prevents
    // floor tiles at depth D+1 from covering sprites at depth D.
    for (let depth = 0; depth < mapSize * 2; depth++) {
        for (let row = Math.max(0, depth - mapSize + 1); row <= Math.min(depth, mapSize - 1); row++) {
            const col = depth - row;
            if (col < 0 || col >= mapSize) continue;
            const _fogVal = (fogRevealed[row] && fogRevealed[row][col]) || 0;
            if (_fogVal <= 0) continue;
            const _fogDim = _fogVal < 1;
            const ft = floorMap[row][col];
            if (ft && images[ft]) {
                if (_fogDim) { ctx.save(); ctx.globalAlpha = _fogVal; }
                if (ft.startsWith('h_')) drawHellTile(images[ft], row, col);
                else if (ft.startsWith('n_')) drawNatureTile(images[ft], row, col);
                else drawTile(images[ft], row, col);
                drawTileEdgeShadows(row, col);
                drawRoughFloorHint(row, col);
                if (typeof hazardMap !== 'undefined' && hazardMap.length > 0 && hazardMap[row] && hazardMap[row][col]) {
                    drawHazardOverlayTile(row, col);
                }
                if (_fogDim) ctx.restore();
            }
        }
    }

    // === PASS 2: Depth-sorted object tiles interleaved with sprites ===
    for (let depth = 0; depth < mapSize * 2; depth++) {
        for (let row = Math.max(0, depth - mapSize + 1); row <= Math.min(depth, mapSize - 1); row++) {
            const col = depth - row;
            if (col < 0 || col >= mapSize) continue;
            const _fogVal = (fogRevealed[row] && fogRevealed[row][col]) || 0;
            const _fogVis = _fogVal > 0;
            const _fogDim = _fogVal < 1 && _fogVal > 0;

            // Draw any sprites that should appear BEFORE this object tile
            const ot = _fogVis ? objectMap[row][col] : null;
            if (ot) {
                let tileScore = (row + col) * mapSize + row;
                // Z-fix: tall nature objects (trees, rocks, logs) in non-town zones
                // visually extend above normal tile height, covering nearby sprites.
                if ((ot.startsWith('n_') && !ot.startsWith('n_grass')) ||
                    ot.startsWith('ow_tree') || ot.startsWith('lib_bookcase')) {
                    tileScore -= mapSize * 2;
                }
                // Use <= so sprites at the same depth as a tile draw BEFORE the tile.
                // Combined with the +0.5 player bias, this prevents wall objects on
                // the same diagonal from covering the player.
                while (spriteIdx < spritePool.length && spritePool[spriteIdx].score <= tileScore) {
                    spritePool[spriteIdx].draw();
                    spriteIdx++;
                }
            }

            // Closed chest glow — golden for openable, red-tinted for locked (cached)
            // Skip glows on fog-dimmed edge tiles
            if (ot === 'chestClosed' && !_fogDim && !openedChests.has(`${row},${col}`)) {
                const pos = tileToScreen(row, col);
                const sx = pos.x + cameraX;
                const sy = pos.y + cameraY;
                const locked = isChestLocked(row, col);
                const pulse = 0.15 + Math.sin(_frameNow * 1000 / 800 + row * 2) * 0.08;
                ctx.save();
                ctx.globalCompositeOperation = 'screen';
                ctx.globalAlpha = pulse;

                // Use cached glow
                const radius = 40;
                const colorStops = locked
                    ? [['rgba(200, 100, 60, 0.35)', 0], ['rgba(150, 60, 30, 0.1)', 0.5], ['rgba(80, 30, 10, 0)', 1]]
                    : [['rgba(255, 200, 80, 0.5)', 0], ['rgba(200, 140, 30, 0.15)', 0.5], ['rgba(100, 60, 10, 0)', 1]];
                const cacheKey = getGlowCacheKey(colorStops, radius, locked ? 'chest_locked' : 'chest_open');
                const glowCanvas = getGlowCanvas(cacheKey, radius, colorStops);
                ctx.drawImage(glowCanvas, sx - radius, sy - 20 - radius);

                ctx.restore();
            }
            // Cracked wall visual tell — subtle crack lines on the wall tile
            if (ot === 'crackedWall' && !_fogDim) {
                const pos = tileToScreen(row, col);
                const sx = pos.x + cameraX, sy = pos.y + cameraY;
                ctx.save();
                ctx.globalAlpha = 0.35 + Math.sin(_frameNow * 1000 / 2000 + row * 3) * 0.1;
                ctx.strokeStyle = '#aa8855';
                ctx.lineWidth = 1.5;
                // Diagonal crack pattern
                ctx.beginPath();
                ctx.moveTo(sx - 6, sy - 14); ctx.lineTo(sx + 2, sy - 6);
                ctx.lineTo(sx - 3, sy - 2); ctx.lineTo(sx + 4, sy + 4);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(sx + 5, sy - 12); ctx.lineTo(sx + 1, sy - 4);
                ctx.stroke();
                ctx.restore();
            }
            // Door/stairs glow
            if (ot && DOOR_DEFS[`${row},${col}`]) {
                const doorDef = DOOR_DEFS[`${row},${col}`];
                const ft = floorMap[row] && floorMap[row][col];
                // Sunlight spill glow on town archway exits
                if (doorDef.destination === 'town' && ft === 'wallArchway') {
                    const pos = tileToScreen(row, col);
                    const sx = pos.x + cameraX;
                    const sy = pos.y + cameraY;
                    ctx.save();
                    ctx.globalCompositeOperation = 'screen';
                    // Layer 1: wide warm glow (cached)
                    const pulse1 = 0.22 + Math.sin(_frameNow * 1000 / 1200) * 0.06;
                    ctx.globalAlpha = pulse1;
                    const radius1 = 140;
                    const colorStops1 = [['rgba(255, 230, 160, 0.5)', 0], ['rgba(255, 200, 100, 0.15)', 0.4], ['rgba(200, 150, 50, 0)', 1]];
                    const cacheKey1 = getGlowCacheKey(colorStops1, radius1, 'archway_wide');
                    const glowCanvas1 = getGlowCanvas(cacheKey1, radius1, colorStops1);
                    ctx.drawImage(glowCanvas1, sx - radius1, sy - 30 - radius1);
                    // Layer 2: intense white-gold center (cached)
                    ctx.globalAlpha = 0.35 + Math.sin(_frameNow * 1000 / 800) * 0.1;
                    const radius2 = 50;
                    const colorStops2 = [['rgba(255, 255, 220, 0.7)', 0], ['rgba(255, 220, 130, 0)', 1]];
                    const cacheKey2 = getGlowCacheKey(colorStops2, radius2, 'archway_center');
                    const glowCanvas2 = getGlowCanvas(cacheKey2, radius2, colorStops2);
                    ctx.drawImage(glowCanvas2, sx - radius2, sy - 40 - radius2);
                    ctx.restore();
                }
                // Key-based glow (cached)
                const hasKey = doorDef.requiresKey && hasKeyItem(doorDef.requiresKey);
                if (hasKey) {
                    const pos = tileToScreen(row, col);
                    const sx = pos.x + cameraX;
                    const sy = pos.y + cameraY;
                    const pulse = 0.18 + Math.sin(_frameNow * 1000 / 700 + col * 2) * 0.08;
                    ctx.save();
                    ctx.globalCompositeOperation = 'screen';
                    ctx.globalAlpha = pulse;
                    
                    const radius = 45;
                    const colorStops = [['rgba(100, 160, 255, 0.4)', 0], ['rgba(60, 100, 180, 0.12)', 0.5], ['rgba(20, 40, 80, 0)', 1]];
                    const cacheKey = getGlowCacheKey(colorStops, radius, 'door_key');
                    const glowCanvas = getGlowCanvas(cacheKey, radius, colorStops);
                    ctx.drawImage(glowCanvas, sx - radius, sy - 20 - radius);

                    ctx.restore();
                }
            }
            if (ot && images[ot]) {
                // Fade ALL tall objects that occlude the player.
                // Isometric tiles extend ~230px upward from their diamond center,
                // so objects at depth+1/+2 visually cover entities at the previous depth.
                // Fading them to 30% opacity when near the player keeps the player visible.
                // This is the standard approach (Diablo, Hades, etc.)
                let _occludeFade = 1;
                if (gamePhase === 'playing' && !gameDead) {
                    const _tDepth = row + col;
                    const _pDepth = player.row + player.col;
                    if (_tDepth > _pDepth && _tDepth <= _pDepth + 2.5) {
                        const _dr = Math.abs(row - player.row);
                        const _dc = Math.abs(col - player.col);
                        // Fade any tall object near the player — exclude chests (interactive)
                        // and crackedWall (has its own visual system)
                        if (_dr <= 2 && _dc <= 2 &&
                            ot !== 'chestClosed' && ot !== 'chestOpen' && ot !== 'crackedWall') {
                            _occludeFade = 0.30;
                        }
                    }
                }
                // Combine occlusion fade with fog edge dimming
                const _objAlpha = (_fogDim ? _fogVal : 1) * _occludeFade;
                if (_objAlpha < 1) { ctx.save(); ctx.globalAlpha = _objAlpha; }
                // Dispatch to correct draw function based on tile prefix
                if (ot.startsWith('h_')) {
                    drawHellTile(images[ot], row, col);
                } else if (ot.startsWith('n_')) {
                    drawNatureTile(images[ot], row, col);
                } else {
                    drawTile(images[ot], row, col);
                }
                if (_objAlpha < 1) ctx.restore();
            }
        }

        // Draw sprites at this depth level that haven't been drawn yet
        const nextDepthScore = (depth + 1) * mapSize;
        while (spriteIdx < spritePool.length && spritePool[spriteIdx].score < nextDepthScore) {
            spritePool[spriteIdx].draw();
            spriteIdx++;
        }
    }
    // Draw any remaining sprites
    while (spriteIdx < spritePool.length) {
        spritePool[spriteIdx].draw();
        spriteIdx++;
    }

    // (Occlusion ghost removed — replaced by comprehensive object fade in the
    //  depth-sorted draw pass above. All tall objects near the player now fade
    //  to 30% opacity, making the player always visible without a ghost layer.)

    // ── LAYER 3: Floor decals + environment light props ──
    drawBloodStain();
    drawCombatDecals();
    drawEnvironmentLightProps();

    // ── LAYER 4: Darkness / Lighting ──
    drawDarkness();

    // ── LAYER 4b: Environment light punchthrough (screen blend after darkness) ──
    drawEnvironmentLightPunchthrough();

    // ── LAYER 4b2: Bloom glow on light sources (soft additive halo) ──
    {
        const _bloomLights = typeof ENV_LIGHTS !== 'undefined' ? ENV_LIGHTS[currentZone] : null;
        if (_bloomLights && _bloomLights.length > 0) {
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            const now = _frameNow * 1000;
            for (const light of _bloomLights) {
                const pos = tileToScreen(light.row, light.col);
                const sx = pos.x + cameraX, sy = pos.y + cameraY;
                if (sx < -150 || sx > canvasW + 150 || sy < -150 || sy > canvasH + 150) continue;
                const fr = Math.floor(light.row), fc = Math.floor(light.col);
                if (fogRevealed.length === 0 || !fogRevealed[0]) continue;
                if (fr >= 0 && fr < fogRevealed.length && fc >= 0 && fc < fogRevealed[0].length && !fogRevealed[fr][fc]) continue;
                // Soft bloom halo — 2x radius of the light, very low alpha
                const bloomR = light.radius * 2.2;
                const flicker = 0.8 + Math.sin(now / 500 + light.row * 3) * 0.2;
                ctx.globalAlpha = light.intensity * 0.08 * flicker;
                const [cr, cg, cb] = light.color;
                const bg = ctx.createRadialGradient(sx, sy - 8, 0, sx, sy - 8, bloomR);
                bg.addColorStop(0, `rgba(${cr}, ${cg}, ${cb}, 0.4)`);
                bg.addColorStop(0.4, `rgba(${cr}, ${cg}, ${cb}, 0.1)`);
                bg.addColorStop(1, `rgba(0, 0, 0, 0)`);
                ctx.fillStyle = bg;
                ctx.fillRect(sx - bloomR, sy - 8 - bloomR, bloomR * 2, bloomR * 2);
            }
            ctx.restore();
        }
    }

    // ── LAYER 4c: Door / exit glows (visible through darkness) ──
    drawDoorGlows();

    // ── LAYER 5: Player occlusion overlay ──
    // Draws sprite at 40% alpha above darkness so the player
    // silhouette is always visible through tall tiles.
    drawPlayerOcclusionGhost();

    // ── LAYER 6: Player ground marker + brightness boost ──
    // Subtle glowing ring at the player's feet, drawn after darkness so it's
    // visible even when the character sprite is occluded by tall tiles.
    if (gamePhase === 'playing' && !gameDead) {
        const mPos = tileToScreen(player.row, player.col);
        const mx = mPos.x + cameraX;
        const my = mPos.y + cameraY;
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        const _mForm = FormSystem.currentForm;
        const markerCol = _mForm === 'slime' ? [200, 80, 70] :
                          _mForm === 'skeleton' ? [180, 170, 150] :
                          _mForm === 'lich' ? [140, 80, 200] :
                          [120, 150, 220];
        // Pulsing ring
        const mPulse = 0.3 + Math.sin(_frameNow * 1000 / 500) * 0.1;
        ctx.globalAlpha = mPulse;
        ctx.strokeStyle = `rgba(${markerCol[0]}, ${markerCol[1]}, ${markerCol[2]}, 0.7)`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(mx, my + 3, 14, 6, 0, 0, Math.PI * 2);
        ctx.stroke();
        // Inner glow fill
        ctx.globalAlpha = mPulse * 0.3;
        const mGrad = ctx.createRadialGradient(mx, my + 3, 0, mx, my + 3, 16);
        mGrad.addColorStop(0, `rgba(${markerCol[0]}, ${markerCol[1]}, ${markerCol[2]}, 0.4)`);
        mGrad.addColorStop(1, `rgba(${markerCol[0]}, ${markerCol[1]}, ${markerCol[2]}, 0)`);
        ctx.fillStyle = mGrad;
        ctx.beginPath();
        ctx.ellipse(mx, my + 3, 16, 7, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    // === PLAYER BRIGHTNESS BOOST — render after darkness so character pops ===
    // Skipped for slime — slimes don't emit magical light; the glow looked wrong
    if (gamePhase === 'playing' && !gameDead && FormSystem.currentForm !== 'slime') {
        const pPos = tileToScreen(player.row, player.col);
        const ppx = pPos.x + cameraX;
        const ppy = pPos.y + cameraY - 25;
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        // Form-specific glow color
        const _pForm = FormSystem.currentForm;
        const glowCol = _pForm === 'skeleton' ? 'rgba(180, 170, 150,' :
                        _pForm === 'lich' ? 'rgba(140, 80, 200,' :
                        'rgba(120, 150, 220,';
        ctx.globalAlpha = 0.35;
        const pGlow = ctx.createRadialGradient(ppx, ppy, 0, ppx, ppy, 40);
        pGlow.addColorStop(0, glowCol + ' 0.5)');
        pGlow.addColorStop(0.5, glowCol + ' 0.15)');
        pGlow.addColorStop(1, glowCol + ' 0)');
        ctx.fillStyle = pGlow;
        ctx.fillRect(ppx - 45, ppy - 45, 90, 90);
        ctx.restore();
    }

    // ── LAYER 7: World effects ──
    if (typeof drawCritters === 'function') drawCritters();
    if (typeof drawImpactRipples === 'function') drawImpactRipples();
    if (typeof drawWeather === 'function') drawWeather();
    drawDustParticles();
    drawAllTowerGlows();
    drawOrbitFireballs();
    drawWorldDrops();
    if (typeof drawWorldAugmentDrops === 'function') drawWorldAugmentDrops();
    drawWorldKeyDrops();
    drawProjectiles();
    drawTowerBolts();
    drawBossTelegraphs();
    drawFireTrails();
    drawEnemyProjectiles();
    drawParticles();
    drawBossTelegraphFlash();
    drawRoomAmbientTint();

    // ── COMBAT JUICE: Multikill text (world-space, above particles) ──
    for (const mk of multiKillTexts) {
        const mkAlpha = Math.min(1, mk.life / 0.4); // fade out in last 0.4s
        const mkPop = mk.life > 1.1 ? 1 + (mk.life - 1.1) * 3 : 1; // brief scale pop on spawn
        const mkFontSize = Math.round(18 * mk.scale * mkPop);
        ctx.save();
        ctx.globalAlpha = mkAlpha * 0.95;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `bold ${mkFontSize}px Georgia`;
        ctx.fillStyle = mk.color;
        ctx.shadowColor = 'rgba(0,0,0,0.9)';
        ctx.shadowBlur = 8;
        // Draw at upper-center screen, drifting up
        const mkY = canvasH * 0.28 - (1.4 - mk.life) * 30;
        ctx.fillText(mk.text, canvasW / 2, mkY);
        ctx.shadowBlur = 0;
        ctx.restore();
    }

    // ── LAYER 7.5: Per-zone color grading tint ──
    // Single multiply pass. Skip during zone transition to avoid stacking with fade overlay.
    if (zoneTransitionAlpha <= 0.01) {
        const tint = _ZONE_TINTS[currentZone];
        if (tint) {
            ctx.save();
            ctx.globalCompositeOperation = 'multiply';
            ctx.fillStyle = tint;
            ctx.fillRect(0, 0, canvasW, canvasH);
            ctx.restore();
        }
    }

    // ── LAYER 7.8: Foreground depth layer — fog wisps passing over the player ──
    // Scrolls at 1.2× camera speed, creating parallax depth perception.
    {
        const fgCfg = _fgConfigs[currentZone];
        if (fgCfg) {
            ctx.save();
            const t = _frameNow;
            // Parallax offset at 1.2× camera (0.2× extra shift relative to world)
            const parallaxX = cameraX * 0.2;
            const parallaxY = cameraY * 0.2;
            for (let i = 0; i < fgCfg.count; i++) {
                const seed = i * 200 + currentZone * 50;
                const wx = ((t * fgCfg.speed * 60 + seed * 3) % (canvasW + fgCfg.size * 4)) - fgCfg.size * 2;
                const wy = canvasH * (0.2 + 0.6 * ((Math.sin(seed + t * 0.3) + 1) / 2));
                const alpha = 0.04 + Math.sin(t * 0.5 + seed) * 0.02;
                ctx.globalAlpha = alpha;
                const grad = ctx.createRadialGradient(wx + parallaxX, wy + parallaxY, 0,
                    wx + parallaxX, wy + parallaxY, fgCfg.size);
                grad.addColorStop(0, fgCfg.color + '0.3)');
                grad.addColorStop(0.5, fgCfg.color + '0.1)');
                grad.addColorStop(1, fgCfg.color + '0)');
                ctx.fillStyle = grad;
                ctx.fillRect(wx + parallaxX - fgCfg.size, wy + parallaxY - fgCfg.size,
                    fgCfg.size * 2, fgCfg.size * 2);
            }
            ctx.restore();
        }
    }

    // ── LAYER 8: Screen effects ──

    // Phase jump flash — bright arcane burst on dodge
    if (player.dodgeFlashTimer > 0) {
        const flashAlpha = Math.min(1, player.dodgeFlashTimer / 0.15); // 0→1
        let fx, fy;
        const pos = tileToScreen(player.row, player.col);
        fx = pos.x + cameraX;
        fy = pos.y + cameraY - 30;

        // Screen-wide white flash (brief, sells the impact)
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = flashAlpha * 0.15;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvasW, canvasH);
        ctx.restore();

        // Focused arcane burst at player
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        const flashGrad = ctx.createRadialGradient(fx, fy, 0, fx, fy, 160);
        flashGrad.addColorStop(0, `rgba(180, 160, 255, ${0.65 * flashAlpha})`);
        flashGrad.addColorStop(0.3, `rgba(120, 100, 240, ${0.3 * flashAlpha})`);
        flashGrad.addColorStop(1, 'rgba(60, 40, 160, 0)');
        ctx.fillStyle = flashGrad;
        ctx.fillRect(fx - 200, fy - 200, 400, 400);
        ctx.restore();
    }

    // ── Screen flash (seal break, big events) ──
    if (_screenFlashTimer > 0) {
        const sfAlpha = Math.min(1, _screenFlashTimer / 0.15); // fast attack, slow tail
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = sfAlpha * 0.55;
        ctx.fillStyle = _screenFlashColor;
        ctx.fillRect(0, 0, canvasW, canvasH);
        ctx.restore();
    }

    // ── HAMLET TWILIGHT TINT — subtle cool/purple atmosphere for the town ──
    if (currentZone === 0 && (gamePhase === 'playing' || gamePhase === 'intro')) {
        ctx.save();
        ctx.globalAlpha = 0.08;
        ctx.fillStyle = '#140f28';
        ctx.fillRect(0, 0, canvasW, canvasH);
        ctx.restore();
    }

    // ── COMBAT JUICE: Damage vignette (replaces old flat red flash) ──
    // Decay the vignette timer
    if (dmgVignetteTimer > 0) {
        dmgVignetteTimer -= _frameDt;
        // Exponential decay for snappy attack, slow tail
        dmgVignetteIntensity *= Math.exp(-15 * _frameDt); // frame-rate independent decay
        if (dmgVignetteTimer <= 0) { dmgVignetteIntensity = 0; dmgVignetteTimer = 0; }
    }
    if (dmgVignetteIntensity > 0.01) {
        ctx.save();
        const vigAlpha = Math.min(0.6, dmgVignetteIntensity);
        const vigGrad = ctx.createRadialGradient(
            canvasW / 2, canvasH / 2, canvasH * 0.2,
            canvasW / 2, canvasH / 2, canvasH * 0.85
        );
        vigGrad.addColorStop(0, 'rgba(180, 10, 0, 0)');
        vigGrad.addColorStop(0.5, `rgba(180, 10, 0, ${vigAlpha * 0.15})`);
        vigGrad.addColorStop(1, `rgba(140, 0, 0, ${vigAlpha})`);
        ctx.fillStyle = vigGrad;
        ctx.fillRect(0, 0, canvasW, canvasH);
        ctx.restore();
    }

    // ── COMBAT JUICE: Low-HP warning vignette (pulsing below 25%) ──
    if (gamePhase === 'playing' && !gameDead && player.hp > 0) {
        const hpRatio = player.hp / (getPlayerMaxHP() || 1);
        if (hpRatio < 0.25) {
            const urgency = 1 - (hpRatio / 0.25); // 0→1 as HP drops from 25%→0%
            const pulse = 0.12 + Math.sin(_frameNow * 1000 * 0.005) * 0.06; // ~0.8Hz
            // Low-HP heartbeat SFX — plays on each pulse peak
            _lowHpBeatTimer -= _frameDt;
            if (_lowHpBeatTimer <= 0 && typeof sfxCinematicHeartbeat === 'function') {
                const beatInterval = 1.2 - urgency * 0.5; // 1.2s → 0.7s as HP drops
                _lowHpBeatTimer = beatInterval;
                sfxCinematicHeartbeat(0.10 + urgency * 0.15);
            }
            const lowHpAlpha = urgency * pulse;
            ctx.save();
            const lowGrad = ctx.createRadialGradient(
                canvasW / 2, canvasH / 2, canvasH * 0.25,
                canvasW / 2, canvasH / 2, canvasH * 0.8
            );
            lowGrad.addColorStop(0, 'rgba(100, 0, 0, 0)');
            lowGrad.addColorStop(0.6, `rgba(120, 0, 0, ${lowHpAlpha * 0.3})`);
            lowGrad.addColorStop(1, `rgba(80, 0, 0, ${lowHpAlpha})`);
            ctx.fillStyle = lowGrad;
            ctx.fillRect(0, 0, canvasW, canvasH);
            ctx.restore();
        } else {
            _lowHpBeatTimer = 0; // Reset when HP recovers above 25%
        }
    }

    // Vignette — lighter for outdoor town, dramatic for dungeon
    ctx.save();
    if (currentZone === 0) {
        // Dark fantasy town: moderate vignette
        const vg = ctx.createRadialGradient(
            canvasW / 2, canvasH / 2, canvasH * 0.35,
            canvasW / 2, canvasH / 2, canvasH * 0.85
        );
        vg.addColorStop(0, 'rgba(0,0,0,0)');
        vg.addColorStop(1, 'rgba(0,0,0,0.28)');
        ctx.fillStyle = vg;
        ctx.fillRect(0, 0, canvasW, canvasH);
    } else {
        const vg = ctx.createRadialGradient(
            canvasW / 2, canvasH / 2, canvasH * 0.35,
            canvasW / 2, canvasH / 2, canvasH * 0.8
        );
        vg.addColorStop(0, 'rgba(0,0,0,0)');
        vg.addColorStop(1, 'rgba(0,0,0,0.32)');
        ctx.fillStyle = vg;
        ctx.fillRect(0, 0, canvasW, canvasH);
    }
    ctx.restore();

    // Phase jump cooldown indicator (subtle arc near bottom center)
    if (player.dodgeCoolTimer > 0 && gamePhase === 'playing') {
        const cdFrac = player.dodgeCoolTimer / DODGE_COOLDOWN;
        const cx = canvasW / 2;
        const cy = canvasH - 40;
        const r = 12;

        ctx.save();
        // Background ring
        ctx.strokeStyle = 'rgba(80, 60, 120, 0.3)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
        // Cooldown arc
        ctx.strokeStyle = `rgba(160, 130, 255, ${0.4 + cdFrac * 0.4})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + (1 - cdFrac) * Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }

    // ── LAYER 9: HUD ──
    ctx.globalAlpha = 1; // safety reset before HUD
    ctx.imageSmoothingEnabled = true; // re-enable smoothing for crisp HUD text
    if (gamePhase !== 'cinematic') {
        // HP & Mana bars (form-specific)
        const hudHandler = FormSystem.getHandler();
        if (hudHandler && hudHandler.drawHUD) hudHandler.drawHUD();
        else drawHPMana();

        // Evolution progress indicator (milestone dots)
        drawEvolutionIndicator();

        // Minimap
        if (typeof drawMinimap === 'function') drawMinimap();

        // Quest tracker
        if (typeof drawQuestTracker === 'function') drawQuestTracker();

        // Gold display — persistent in top-right below evolution dots
        if (typeof playerGold !== 'undefined' && !gameDead) {
            ctx.save();
            ctx.globalAlpha = 0.7;
            ctx.textAlign = 'right';
            ctx.font = 'bold 11px monospace';
            ctx.fillStyle = '#e8c040';
            ctx.shadowColor = 'rgba(0,0,0,0.6)';
            ctx.shadowBlur = 3;
            ctx.fillText(playerGold + 'g', canvasW - 20, 78);
            ctx.shadowBlur = 0;
            ctx.restore();
        }

        // Abyss modifier pills + rank badge (endless mode HUD)
        if (typeof drawAbyssModifiers === 'function') drawAbyssModifiers();
        if (typeof drawAbyssRankBadge === 'function') drawAbyssRankBadge();

        // Unified notification system (controls, mana-lock, zone name)
        if (typeof Notify !== 'undefined') Notify.draw(ctx, canvasW, canvasH);

        // Pickup floating texts
        drawPickupTexts();

        // Frozen echoes (Zone 5 environmental story text)
        if (typeof drawFrozenEcho === 'function') drawFrozenEcho();
        if (typeof drawInscriptions === 'function') drawInscriptions();

        // Interaction prompts
        drawChestPrompt();
        drawDoorPrompt();
        if (typeof drawAltarPrompt === 'function') drawAltarPrompt();
        if (typeof drawAltarObject === 'function') drawAltarObject();
        if (typeof drawRebuildPrompt === 'function') drawRebuildPrompt();

        // Wave system UI
        drawWaveBanner();
        drawWaveHUD();
        if (typeof drawKillStreakHUD === 'function') drawKillStreakHUD();
        if (typeof drawPotionHUD === 'function') drawPotionHUD();
        drawBossHealthBar();

        // Placement preview (above HUD, below crosshair)
        drawPlacementPreview();

        // Crosshair (always on top, unless inventory open)
        if (!inventoryOpen) drawCrosshair();

        // Inventory UI (disabled — managed through Grimoire Equipment tab)
        // drawInventoryUI();

        // Background debug overlay (toggle: BackgroundManager.debugEnabled = true)
        if (typeof BackgroundManager !== 'undefined') {
            BackgroundManager.drawDebug(ctx, canvasW, canvasH, cameraX, cameraY);
        }

        // ── LAYER 10: Zone name banner ──
        drawZoneBanner();

        // ── LAYER 11: Zone transition overlay (themed by destination zone) ──
        if (zoneTransitionAlpha > 0) {
            ctx.save();
            ctx.globalAlpha = zoneTransitionAlpha;
            // Use destination zone palette color for themed fade
            let fadeColor = '#000';
            const targetZ = (typeof zoneTransitionTarget !== 'undefined' && typeof zoneTransitionTarget === 'number' && zoneTransitionTarget >= 0)
                ? zoneTransitionTarget : currentZone;
            const fadePal = (typeof ZONE_BG_PALETTES !== 'undefined') ? ZONE_BG_PALETTES[targetZ] : null;
            if (fadePal) {
                const bg = fadePal.bgColor;
                fadeColor = `rgb(${bg[0]}, ${bg[1]}, ${bg[2]})`;
            }
            ctx.fillStyle = fadeColor;
            ctx.fillRect(0, 0, canvasW, canvasH);
            ctx.restore();
        }

        // ── LAYER 12: Arrival vignette (eyes adjusting to light) ──
        // Only show when zone transition overlay is fully gone (avoid stacking darkening)
        if (typeof _arrivalVignetteTimer !== 'undefined' && _arrivalVignetteTimer > 0 && zoneTransitionAlpha <= 0.01) {
            ctx.save();
            const vigFrac = _arrivalVignetteTimer / 1.5;
            ctx.globalAlpha = vigFrac * 0.25; // reduced from 0.4 to avoid over-darkening
            const vigGrad = ctx.createRadialGradient(
                canvasW / 2, canvasH / 2, canvasH * 0.3 * (1 - vigFrac),
                canvasW / 2, canvasH / 2, canvasH * 0.8
            );
            vigGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
            vigGrad.addColorStop(1, 'rgba(0, 0, 0, 1)');
            ctx.fillStyle = vigGrad;
            ctx.fillRect(0, 0, canvasW, canvasH);
            ctx.restore();
        }
    }
}

// ============================================================
//  SAVE / LOAD SYSTEM — see saveload.js
// ============================================================

// ============================================================
//  NAME ENTRY SCREEN
// ============================================================
function drawNameEntry() {
    const cx = canvasW / 2;
    const cy = canvasH / 2;
    nameEntryAlpha = Math.min(1, nameEntryAlpha + 0.03);
    nameEntryBlink += 0.05;
    const fa = nameEntryAlpha;

    ctx.save();

    // Dark background
    ctx.globalAlpha = fa * 0.85;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvasW, canvasH);

    // Decorative frame panel behind input area
    const panelW = 320, panelH = 140;
    const panelX = cx - panelW / 2, panelY = cy - panelH / 2 - 10;
    ctx.globalAlpha = fa * 0.7;
    const panelGrad = ctx.createLinearGradient(panelX, panelY, panelX, panelY + panelH);
    panelGrad.addColorStop(0, '#1a1510');
    panelGrad.addColorStop(1, '#0e0a06');
    ctx.fillStyle = panelGrad;
    ctx.beginPath(); ctx.roundRect(panelX, panelY, panelW, panelH, 6); ctx.fill();
    ctx.globalAlpha = fa * 0.3;
    ctx.strokeStyle = '#a89060';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(panelX, panelY, panelW, panelH, 6); ctx.stroke();

    // Title — larger and more prominent
    ctx.globalAlpha = fa * 0.85;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'small-caps 18px Georgia';
    ctx.fillStyle = '#c4a878';
    ctx.fillText('What is your name, wanderer?', cx, cy - 50);

    // Decorative lines
    if (typeof drawDecorLine === 'function') {
        drawDecorLine(cx, cy - 68, 100, fa * 0.25);
        drawDecorLine(cx, cy - 32, 80, fa * 0.2);
    }

    // Input box with pulsing golden glow
    const boxW = 260, boxH = 40;
    const bx = cx - boxW / 2, by = cy - boxH / 2;

    // Pulsing glow behind input
    const glowPulse = 0.08 + Math.sin(nameEntryBlink * 1.5) * 0.04;
    ctx.globalAlpha = fa * glowPulse;
    const inputGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, boxW * 0.6);
    inputGlow.addColorStop(0, 'rgba(200, 160, 60, 0.3)');
    inputGlow.addColorStop(1, 'rgba(100, 80, 20, 0)');
    ctx.fillStyle = inputGlow;
    ctx.fillRect(bx - 20, by - 15, boxW + 40, boxH + 30);

    // Input box background
    ctx.globalAlpha = fa * 0.75;
    ctx.fillStyle = '#0e0c08';
    ctx.beginPath(); ctx.roundRect(bx, by, boxW, boxH, 4); ctx.fill();

    ctx.globalAlpha = fa * 0.45;
    ctx.strokeStyle = '#c4a060';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(bx, by, boxW, boxH, 4); ctx.stroke();

    // Name text
    const displayName = nameInputEl ? nameInputEl.value : playerName;
    ctx.globalAlpha = fa * 0.95;
    ctx.font = '18px Georgia';
    ctx.fillStyle = '#d4c4a0';
    ctx.textAlign = 'center';
    ctx.fillText(displayName, cx, cy);

    // Blinking cursor
    if (Math.sin(nameEntryBlink * 3) > 0) {
        const tw = ctx.measureText(displayName).width;
        ctx.globalAlpha = fa * 0.7;
        ctx.fillStyle = '#c4a878';
        ctx.fillRect(cx + tw / 2 + 3, cy - 10, 2, 20);
    }

    // Hint — slightly larger
    ctx.globalAlpha = fa * 0.4;
    ctx.font = '12px Georgia';
    ctx.fillStyle = '#8a7a5a';
    ctx.fillText('Press Enter to begin your journey', cx, cy + 48);

    // Ascension selector (only shown after first game clear)
    if (typeof ascensionUnlocked !== 'undefined' && ascensionUnlocked > 0) {
        const ascY = cy + 80;
        // Label
        ctx.globalAlpha = fa * 0.5;
        ctx.font = 'small-caps 11px Georgia';
        ctx.fillStyle = '#c4a878';
        ctx.fillText('Ascension', cx, ascY - 14);
        // Left arrow
        ctx.globalAlpha = fa * (ascensionLevel > 0 ? 0.6 : 0.2);
        ctx.font = '16px monospace';
        ctx.fillStyle = '#d4b478';
        ctx.fillText('<', cx - 40, ascY + 4);
        // Level number
        ctx.globalAlpha = fa * 0.9;
        const ascColor = ascensionLevel === 0 ? '#aaa' : ascensionLevel <= 3 ? '#88ccff' : ascensionLevel <= 6 ? '#cc88ff' : '#ffcc44';
        ctx.font = 'bold 20px Georgia';
        ctx.fillStyle = ascColor;
        ctx.fillText(ascensionLevel, cx, ascY + 5);
        // Right arrow
        ctx.globalAlpha = fa * (ascensionLevel < ascensionUnlocked ? 0.6 : 0.2);
        ctx.font = '16px monospace';
        ctx.fillStyle = '#d4b478';
        ctx.fillText('>', cx + 40, ascY + 4);
        // Description
        ctx.globalAlpha = fa * 0.3;
        ctx.font = 'italic 9px Georgia';
        ctx.fillStyle = '#a89060';
        const ascDesc = ascensionLevel === 0 ? 'Normal difficulty' :
            'Enemies +' + (ascensionLevel * 15) + '% | Extra enemies | ' + (ascensionLevel >= 2 ? 'New rooms | ' : '') + (ascensionLevel >= 3 ? 'Elites everywhere' : 'Hazards');
        ctx.fillText(ascDesc, cx, ascY + 22);
    }

    // Draw embers from menu
    updateMenuEmbers(0.016);
    for (const e of menuEmbers) {
        const ratio = e.life / e.maxLife;
        if (ratio >= 1) continue;
        const alpha = (1 - ratio) * e.alpha * fa;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = e.color;
        const s = e.size * (1 - ratio * 0.5);
        ctx.beginPath(); ctx.arc(e.x, e.y, s, 0, Math.PI * 2); ctx.fill();
    }

    ctx.restore();
}

// ============================================================
//  LOAD SCREEN
// ============================================================
function drawLoadScreen() {
    const cx = canvasW / 2;
    const cy = canvasH / 2;
    loadScreenAlpha = Math.min(1, loadScreenAlpha + 0.03);
    const fa = loadScreenAlpha;

    ctx.save();

    // Dark background
    ctx.globalAlpha = fa * 0.85;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvasW, canvasH);

    // Title
    ctx.globalAlpha = fa * 0.85;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'small-caps bold 18px Georgia';
    ctx.fillStyle = '#d4c4a0';
    ctx.fillText('Load Game', cx, cy - 140);

    drawDecorLine(cx, cy - 122, 100, fa * 0.3);

    // 3 save slots
    loadScreenHover = -1;
    loadScreenDeleteHover = -1;
    const slotW = 320, slotH = 70, slotGap = 12;
    const delBtnW = 28, delBtnH = 22;
    const startY = cy - 80;

    for (let i = 0; i < 3; i++) {
        const sx = cx - slotW / 2;
        const sy = startY + i * (slotH + slotGap);
        const s = saveSlots[i];
        const isConfirming = loadScreenConfirmDelete === i;

        // --- Delete confirmation overlay for this slot ---
        if (isConfirming) {
            // Darkened slot background
            ctx.globalAlpha = fa * 0.6;
            ctx.fillStyle = '#1a0808';
            ctx.beginPath(); ctx.roundRect(sx, sy, slotW, slotH, 5); ctx.fill();

            // Red border
            ctx.globalAlpha = fa * 0.6;
            ctx.strokeStyle = '#cc4444';
            ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.roundRect(sx, sy, slotW, slotH, 5); ctx.stroke();

            // Confirm text
            ctx.globalAlpha = fa * 0.9;
            ctx.textAlign = 'center';
            ctx.font = '12px Georgia';
            ctx.fillStyle = '#ee8866';
            ctx.fillText('Delete this save?', cx, sy + 20);

            // Yes / No buttons
            const btnY = sy + 38;
            const yesW = 70, noW = 70, btnH2 = 24, btnGap2 = 16;
            const yesX = cx - yesW - btnGap2 / 2;
            const noX = cx + btnGap2 / 2;

            const yesHover = mouse.x >= yesX && mouse.x <= yesX + yesW && mouse.y >= btnY && mouse.y <= btnY + btnH2;
            const noHover = mouse.x >= noX && mouse.x <= noX + noW && mouse.y >= btnY && mouse.y <= btnY + btnH2;

            // Yes button
            ctx.globalAlpha = fa * (yesHover ? 0.7 : 0.35);
            ctx.fillStyle = '#331111';
            ctx.beginPath(); ctx.roundRect(yesX, btnY, yesW, btnH2, 3); ctx.fill();
            ctx.globalAlpha = fa * (yesHover ? 0.7 : 0.3);
            ctx.strokeStyle = '#cc4444';
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.roundRect(yesX, btnY, yesW, btnH2, 3); ctx.stroke();
            ctx.globalAlpha = fa * (yesHover ? 0.95 : 0.6);
            ctx.font = 'small-caps bold 11px Georgia';
            ctx.fillStyle = '#ff6644';
            ctx.fillText('Delete', yesX + yesW / 2, btnY + btnH2 / 2);

            // No button
            ctx.globalAlpha = fa * (noHover ? 0.7 : 0.35);
            ctx.fillStyle = '#111411';
            ctx.beginPath(); ctx.roundRect(noX, btnY, noW, btnH2, 3); ctx.fill();
            ctx.globalAlpha = fa * (noHover ? 0.7 : 0.3);
            ctx.strokeStyle = '#668866';
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.roundRect(noX, btnY, noW, btnH2, 3); ctx.stroke();
            ctx.globalAlpha = fa * (noHover ? 0.95 : 0.6);
            ctx.font = 'small-caps bold 11px Georgia';
            ctx.fillStyle = '#88cc88';
            ctx.fillText('Cancel', noX + noW / 2, btnY + btnH2 / 2);

            continue; // skip normal slot rendering
        }

        // --- Normal slot rendering ---
        const slotHovered = mouse.x >= sx && mouse.x <= sx + slotW &&
                        mouse.y >= sy && mouse.y <= sy + slotH;
        if (slotHovered && s) loadScreenHover = i;

        // Slot background
        ctx.globalAlpha = fa * (slotHovered && s ? 0.5 : 0.3);
        ctx.fillStyle = s ? '#14100c' : '#0a0806';
        ctx.beginPath(); ctx.roundRect(sx, sy, slotW, slotH, 5); ctx.fill();

        // Border
        ctx.globalAlpha = fa * (slotHovered && s ? 0.5 : 0.15);
        ctx.strokeStyle = s ? '#a89060' : '#443822';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.roundRect(sx, sy, slotW, slotH, 5); ctx.stroke();

        // Slot number
        ctx.globalAlpha = fa * 0.25;
        ctx.font = '10px monospace';
        ctx.fillStyle = '#8a7a5a';
        ctx.textAlign = 'left';
        ctx.fillText('SLOT ' + (i + 1), sx + 12, sy + 16);

        if (s) {
            // Character name
            ctx.globalAlpha = fa * 0.9;
            ctx.font = '14px Georgia';
            ctx.fillStyle = '#d4c4a0';
            ctx.fillText(s.playerName || 'Unknown', sx + 12, sy + 38);

            // Level + Form + Zone + Talisman + Abyss Rank
            ctx.globalAlpha = fa * 0.5;
            ctx.font = '10px Georgia';
            ctx.fillStyle = '#a89060';
            const _slotForm = s.currentForm ? s.currentForm.charAt(0).toUpperCase() + s.currentForm.slice(1) : 'Wizard';
            const _slotTalisman = (s.talisman && s.talisman.level > 1) ? '  ·  Talisman Lv.' + s.talisman.level : '';
            let _slotAbyssRank = '';
            if (s.deepestDepthReached > 0 && typeof ABYSS_RANKS !== 'undefined') {
                let _slotRank = null;
                for (const r of ABYSS_RANKS) {
                    if (s.deepestDepthReached >= r.depth) _slotRank = r;
                }
                if (_slotRank) _slotAbyssRank = '  ·  ' + _slotRank.name;
            }
            ctx.fillText('Lv.' + (s.level || 1) + '  ·  ' + _slotForm + '  ·  ' + (ZONE_NAMES_SHORT[s.currentZone] || 'Zone ' + s.currentZone) + _slotTalisman + _slotAbyssRank, sx + 12, sy + 56);

            // Date on right
            ctx.textAlign = 'right';
            ctx.globalAlpha = fa * 0.3;
            ctx.font = '9px monospace';
            ctx.fillStyle = '#8a7a5a';
            ctx.fillText(formatSaveDate(s.timestamp), sx + slotW - 12, sy + 56);

            // Delete button (small X in top-right corner)
            const delX = sx + slotW - delBtnW - 6;
            const delY = sy + 6;
            const delHover = mouse.x >= delX && mouse.x <= delX + delBtnW &&
                             mouse.y >= delY && mouse.y <= delY + delBtnH;
            if (delHover) loadScreenDeleteHover = i;

            ctx.globalAlpha = fa * (delHover ? 0.6 : 0.2);
            ctx.fillStyle = delHover ? '#2a1111' : '#14100c';
            ctx.beginPath(); ctx.roundRect(delX, delY, delBtnW, delBtnH, 3); ctx.fill();
            ctx.globalAlpha = fa * (delHover ? 0.6 : 0.15);
            ctx.strokeStyle = delHover ? '#cc4444' : '#664433';
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.roundRect(delX, delY, delBtnW, delBtnH, 3); ctx.stroke();

            // X icon
            ctx.globalAlpha = fa * (delHover ? 0.9 : 0.3);
            ctx.textAlign = 'center';
            ctx.font = 'bold 12px monospace';
            ctx.fillStyle = delHover ? '#cc4444' : '#886655';
            ctx.fillText('\u2715', delX + delBtnW / 2, delY + delBtnH / 2);
        } else {
            // Empty
            ctx.globalAlpha = fa * 0.15;
            ctx.font = 'italic 12px Georgia';
            ctx.fillStyle = '#665544';
            ctx.textAlign = 'center';
            ctx.fillText('\u2014 Empty \u2014', cx, sy + slotH / 2);
        }
    }

    // Back button
    const backY = startY + 3 * (slotH + slotGap) + 10;
    const backW = 140, backH = 36;
    const backX = cx - backW / 2;
    const backHovered = mouse.x >= backX && mouse.x <= backX + backW &&
                        mouse.y >= backY && mouse.y <= backY + backH;

    ctx.globalAlpha = fa * (backHovered ? 0.5 : 0.25);
    ctx.fillStyle = '#14100c';
    ctx.beginPath(); ctx.roundRect(backX, backY, backW, backH, 4); ctx.fill();
    ctx.globalAlpha = fa * (backHovered ? 0.5 : 0.15);
    ctx.strokeStyle = '#a89060';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(backX, backY, backW, backH, 4); ctx.stroke();

    ctx.globalAlpha = fa * (backHovered ? 0.85 : 0.4);
    ctx.textAlign = 'center';
    ctx.font = 'small-caps 12px Georgia';
    ctx.fillStyle = '#d4c4a0';
    ctx.fillText('Back', cx, backY + backH / 2);

    // Draw embers
    updateMenuEmbers(0.016);
    for (const e of menuEmbers) {
        const ratio = e.life / e.maxLife;
        if (ratio >= 1) continue;
        ctx.globalAlpha = (1 - ratio) * e.alpha * fa;
        ctx.fillStyle = e.color;
        const sz = e.size * (1 - ratio * 0.5);
        ctx.beginPath(); ctx.arc(e.x, e.y, sz, 0, Math.PI * 2); ctx.fill();
    }

    ctx.restore();
}

// ----- INTRO SEQUENCE (now launches cinematic) -----
function runIntro() {
    // Hide any HTML overlay — we render everything on canvas now
    const overlay = document.getElementById('overlay');
    if (overlay) overlay.style.display = 'none';

    try {
        // Initialize game state (loads Zone 0 Hamlet)
        restartGame();
    } catch(e) {
        console.error('restartGame failed:', e);
    }

    // Start intro text sequence — world loads but screen is black with narrative
    gamePhase = 'intro';
    introTimer = 0;
    introPulse = 0;
    _introBeatIndex = 0;
    introMusicStarted = false;
    lightRadius = 80; // dim — expands during reveal
    setPixelCursor('none');
    zoneTransitionAlpha = 0;
    zoneTransitionFading = false;
    // Snap camera to player
    const _introPos = tileToScreen(player.row, player.col);
    smoothCamX = canvasW / 2 - _introPos.x;
    smoothCamY = canvasH / 2 - _introPos.y;
    cameraX = Math.round(smoothCamX);
    cameraY = Math.round(smoothCamY);
    // Fade to silence — intro starts quiet for maximum impact
    // Music cue happens at INTRO_MUSIC_CUE (3.5s) in updateIntroPhase
    try { if (typeof stopMusic === 'function') stopMusic(0.5); } catch(e) {}
}

// ----- 3D MODE FLAG -----
// 3D renderer disabled — using pure 2D canvas rendering

// ----- INIT -----
async function init() {
    resizeCanvas();
    nameInputEl = document.getElementById('nameInput');
    loadSaveSlots();
    if (typeof loadSettings === 'function') loadSettings();
    if (typeof installFontScaling === 'function') installFontScaling(ctx);

    // Initialize minimal map arrays (actual zone generation happens in restartGame/loadZone)
    // Don't generate Zone 1 here — the menu and cinematic render over black backgrounds
    applyZoneTileConfig(0); // use Zone 0 config for initial MAP_SIZE
    resetFogOfWar(MAP_SIZE);
    floorMap.length = 0;
    objectMap.length = 0;
    blocked.length = 0;
    blockType.length = 0;
    objRadius.length = 0;
    for (let i = 0; i < MAP_SIZE; i++) {
        floorMap.push(Array(MAP_SIZE).fill(null));
        objectMap.push(Array(MAP_SIZE).fill(null));
        blocked.push(Array(MAP_SIZE).fill(true));
        blockType.push(Array(MAP_SIZE).fill(null));
        objRadius.push(Array(MAP_SIZE).fill(0));
    }

    // Load 2D assets
    await loadAssets();
    buildSlimeTintedSprites();

    // Validate form handlers — catch missing wiring at startup, not at runtime form switch
    const REQUIRED_HANDLERS = ['update', 'draw', 'drawHUD'];
    for (const form of Object.keys(FORM_CONFIGS)) {
        const h = formHandlers[form];
        if (!h) { console.warn(`[Ethera] Missing form handler registry for: ${form}`); continue; }
        for (const req of REQUIRED_HANDLERS) {
            if (!h[req]) console.warn(`[Ethera] Missing handler: formHandlers.${form}.${req}`);
        }
    }

    document.getElementById('loading-text').style.display = 'none';

    // Hide the narrative overlay, go straight to canvas menu
    const overlay = document.getElementById('overlay');
    overlay.style.display = 'none';

    // DEBUG: skip menu and jump straight to a zone for testing
    if (typeof DEBUG_START_ZONE === 'number' && DEBUG_START_ZONE !== null) {
        // Pick the right form based on zone: 0-1=slime, 2=skeleton, 3=wizard, 4+=lich
        const debugForm = DEBUG_START_ZONE >= 4 ? 'lich'
            : DEBUG_START_ZONE === 3 ? 'wizard'
            : DEBUG_START_ZONE === 2 ? 'skeleton'
            : 'slime';
        FormSystem.currentForm = debugForm;
        FormSystem.formData[debugForm].unlocked = true;
        const debugCfg = FORM_CONFIGS[debugForm];
        player.hp = debugCfg.maxHp;
        player.mana = debugCfg.maxMana || 0;
        xpState.level = DEBUG_START_ZONE >= 4 ? 15 : 8;
        xpState.xp = 0;
        xpState.xpToNext = xpForLevel(xpState.level);
        loadZone(DEBUG_START_ZONE);
        showZoneBanner(DEBUG_START_ZONE);
        gamePhase = 'playing';
        lightRadius = MAX_LIGHT;
        setPixelCursor('none');
        lastTime = performance.now();
        requestAnimationFrame(gameLoop);
        return;
    }

    // Initialize menu — start in preMenu (just "click anywhere" prompt)
    initMenuEmbers();
    menuFadeAlpha = 0;
    preMenuAlpha = 0;
    gamePhase = 'preMenu';
    setPixelCursor('default');

    lastTime = performance.now();
    requestAnimationFrame(gameLoop);
}

// ============================================================
//  STORY: ENDING CHOICE SCREEN
// ============================================================
function drawEndingChoice() {
    const fa = endingChoiceFadeIn;
    ctx.save();

    // Dark overlay
    ctx.globalAlpha = fa * 0.85;
    ctx.fillStyle = '#0a0510';
    ctx.fillRect(0, 0, canvasW, canvasH);

    // Purple ambience
    ctx.globalAlpha = fa * 0.1;
    const amb = ctx.createRadialGradient(canvasW/2, canvasH/2, 0, canvasW/2, canvasH/2, 400);
    amb.addColorStop(0, 'rgba(140, 80, 220, 0.5)');
    amb.addColorStop(1, 'rgba(20, 5, 40, 0)');
    ctx.fillStyle = amb;
    ctx.fillRect(0, 0, canvasW, canvasH);

    const cx = canvasW / 2;

    // Title
    ctx.globalAlpha = fa * 0.9;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'small-caps bold 28px Georgia';
    ctx.fillStyle = '#cc99ff';
    ctx.shadowColor = 'rgba(140, 80, 220, 0.6)';
    ctx.shadowBlur = 15;
    ctx.fillText('The Pale Covenant', cx, canvasH * 0.25);
    ctx.shadowBlur = 0;

    // Subtitle
    ctx.globalAlpha = fa * 0.5;
    ctx.font = 'italic 13px Georgia';
    ctx.fillStyle = '#9977bb';
    ctx.fillText('What will you do?', cx, canvasH * 0.32);

    // Two choice buttons
    const btnW = 320, btnH = 90;
    const btnGap = 40;
    const btnY = canvasH * 0.42;

    // Left button: Shatter the Covenant
    const shatterX = cx - btnW - btnGap / 2;
    const shatterHover = endingChoiceHover === 'shatter';
    _drawEndingButton(shatterX, btnY, btnW, btnH, fa,
        'Shatter the Covenant', 'End the corruption. Free Elara.',
        'She may not survive. The world will be unshielded.',
        '#ff6644', shatterHover);

    // Right button: Take Her Place
    const replaceX = cx + btnGap / 2;
    const replaceHover = endingChoiceHover === 'replace';
    _drawEndingButton(replaceX, btnY, btnW, btnH, fa,
        'Take Her Place', 'You sit on the throne. Elara walks free.',
        'The covenant holds. But you remain... forever.',
        '#6688ff', replaceHover);

    ctx.restore();
}

function _drawEndingButton(x, y, w, h, fa, title, desc, warn, accent, hover) {
    ctx.save();

    // Button background
    ctx.globalAlpha = fa * (hover ? 0.7 : 0.4);
    const bg = ctx.createLinearGradient(x, y, x, y + h);
    bg.addColorStop(0, hover ? '#2a2030' : '#1a1520');
    bg.addColorStop(1, hover ? '#1e1828' : '#100c16');
    ctx.fillStyle = bg;
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 6); ctx.fill();

    // Border
    ctx.globalAlpha = fa * (hover ? 0.6 : 0.25);
    ctx.strokeStyle = accent;
    ctx.lineWidth = hover ? 2 : 1;
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 6); ctx.stroke();

    // Hover glow
    if (hover) {
        ctx.globalAlpha = fa * 0.08;
        ctx.fillStyle = accent;
        ctx.beginPath(); ctx.roundRect(x, y, w, h, 6); ctx.fill();
    }

    // Title
    ctx.globalAlpha = fa * (hover ? 0.95 : 0.75);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'small-caps bold 15px Georgia';
    ctx.fillStyle = accent;
    ctx.fillText(title, x + w/2, y + 22);

    // Description
    ctx.globalAlpha = fa * 0.6;
    ctx.font = '11px Georgia';
    ctx.fillStyle = '#c4b8a0';
    ctx.fillText(desc, x + w/2, y + 48);

    // Warning
    ctx.globalAlpha = fa * 0.35;
    ctx.font = 'italic 10px Georgia';
    ctx.fillStyle = '#aa8877';
    ctx.fillText(warn, x + w/2, y + 70);

    ctx.restore();
}

// ============================================================
//  STORY: ENDING CINEMATIC
// ============================================================
function drawEndingCinematic() {
    const t = endingCinematicTimer;
    const isShatter = endingChoice === 'shatter';

    ctx.save();

    // Full black overlay
    const fadeIn = Math.min(1, t / 2.0);
    ctx.globalAlpha = fadeIn;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvasW, canvasH);

    // Colored pulse
    if (t > 1.5 && t < 10) {
        const pulseColor = isShatter ? 'rgba(255, 100, 60, 0.3)' : 'rgba(80, 100, 255, 0.3)';
        ctx.globalAlpha = 0.08 * Math.sin((t - 1.5) * 0.8);
        const glow = ctx.createRadialGradient(canvasW/2, canvasH/2, 0, canvasW/2, canvasH/2, 350);
        glow.addColorStop(0, pulseColor);
        glow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, canvasW, canvasH);
    }

    const cx = canvasW / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Ending-specific text sequences
    const lines = isShatter ? [
        { text: 'The covenant shatters.', time: 2.0, y: 0.30 },
        { text: 'Light floods the throne room — blinding, purifying.', time: 3.5, y: 0.38 },
        { text: 'Elara collapses. You catch her.', time: 5.0, y: 0.46 },
        { text: 'The corruption has no master now.', time: 6.5, y: 0.54 },
        { text: 'The world will have to find another way.', time: 8.0, y: 0.62 },
        { text: 'But at least you found her.', time: 9.5, y: 0.72 },
    ] : [
        { text: 'You sit upon the throne.', time: 2.0, y: 0.30 },
        { text: 'The cold seeps in — deep, permanent.', time: 3.5, y: 0.38 },
        { text: 'Elara reaches for your hand. You feel it — barely.', time: 5.0, y: 0.46 },
        { text: '"I\'m sorry," she whispers. And then she\'s gone.', time: 6.5, y: 0.54 },
        { text: 'The corruption holds. The world is safe.', time: 8.0, y: 0.62 },
        { text: 'You hold it all together. As she did. As you will.', time: 9.5, y: 0.72 },
    ];

    const textColor = isShatter ? '#ffaa77' : '#99bbff';
    for (const line of lines) {
        if (t > line.time) {
            const age = t - line.time;
            const lFadeIn = Math.min(1, age / 0.8);
            // Final fade-out in last 2 seconds of cinematic
            const lFadeOut = t > 12.0 ? Math.max(0, 1 - (t - 12.0) / 2.0) : 1;
            ctx.globalAlpha = lFadeIn * lFadeOut * 0.8;
            ctx.font = 'italic 15px Georgia';
            ctx.fillStyle = textColor;
            ctx.shadowColor = isShatter ? 'rgba(200, 100, 50, 0.4)' : 'rgba(80, 120, 220, 0.4)';
            ctx.shadowBlur = 10;
            ctx.fillText(line.text, cx, canvasH * line.y);
            ctx.shadowBlur = 0;
        }
    }

    // Final title card
    if (t > 11.0) {
        const titleFade = Math.min(1, (t - 11.0) / 1.5);
        const titleOut = t > 13.0 ? Math.max(0, 1 - (t - 13.0) / 1.0) : 1;
        ctx.globalAlpha = titleFade * titleOut * 0.9;
        ctx.font = 'small-caps bold 36px Georgia';
        ctx.fillStyle = '#d4c4a0';
        ctx.shadowColor = 'rgba(180, 140, 60, 0.5)';
        ctx.shadowBlur = 20;
        ctx.fillText('ETHERA', cx, canvasH * 0.45);
        ctx.shadowBlur = 0;

        ctx.globalAlpha = titleFade * titleOut * 0.5;
        ctx.font = 'italic 14px Georgia';
        ctx.fillStyle = '#a89878';
        const subtitle = isShatter ? 'The covenant is broken. The search is over.' : 'The covenant endures. The sacrifice holds.';
        ctx.fillText(subtitle, cx, canvasH * 0.52);
    }

    ctx.restore();
}

// ============================================================
//  CREDITS SCREEN
// ============================================================
let creditsTimer = 0;
const CREDITS_DURATION = 18; // seconds
const CREDITS_LINES = [
    { text: 'ETHERA: THE AWAKENING', font: 'small-caps bold 28px Georgia', color: '#d4c4a0', gap: 60 },
    { text: 'Created by', font: 'italic 12px Georgia', color: '#8a7a5a', gap: 20 },
    { text: 'Armin', font: '18px Georgia', color: '#c4a878', gap: 50 },
    { text: 'Game Design & Programming', font: 'italic 11px Georgia', color: '#8a7a5a', gap: 18 },
    { text: 'Armin', font: '14px Georgia', color: '#a89060', gap: 40 },
    { text: 'Art Assets', font: 'italic 11px Georgia', color: '#8a7a5a', gap: 18 },
    { text: 'PVGames  ·  creativekind  ·  Tiny RPG Pack', font: '12px Georgia', color: '#a89060', gap: 40 },
    { text: 'Music', font: 'italic 11px Georgia', color: '#8a7a5a', gap: 18 },
    { text: 'Arcane Whispers  ·  Blood and Honor  ·  Chant of the Fallen', font: '12px Georgia', color: '#a89060', gap: 18 },
    { text: 'Dawn of Blades  ·  Riders of the Storm  ·  Legends of the Flame', font: '12px Georgia', color: '#a89060', gap: 40 },
    { text: 'Sound Design', font: 'italic 11px Georgia', color: '#8a7a5a', gap: 18 },
    { text: 'Procedural SFX via Web Audio API', font: '12px Georgia', color: '#a89060', gap: 50 },
    { text: 'Built with vanilla JavaScript & HTML5 Canvas', font: 'italic 11px Georgia', color: '#665544', gap: 30 },
    { text: 'Thank you for playing.', font: 'italic 14px Georgia', color: '#c4a878', gap: 0 },
];

function drawCreditsScreen() {
    const cx = canvasW / 2;
    ctx.save();

    // Black background
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvasW, canvasH);

    // Scrolling credits
    const totalHeight = CREDITS_LINES.reduce((h, l) => h + l.gap, 0) + 200;
    const scrollSpeed = (totalHeight + canvasH) / CREDITS_DURATION;
    const scrollY = canvasH - creditsTimer * scrollSpeed + 80;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    let y = scrollY;
    for (const line of CREDITS_LINES) {
        // Only draw if on screen
        if (y > -40 && y < canvasH + 40) {
            ctx.globalAlpha = Math.min(1, Math.min(y / 80, (canvasH - y) / 80));
            ctx.globalAlpha = Math.max(0, ctx.globalAlpha) * 0.85;
            ctx.font = line.font;
            ctx.fillStyle = line.color;
            ctx.fillText(line.text, cx, y);
        }
        y += line.gap;
    }

    // Skip hint
    if (creditsTimer > 2) {
        ctx.globalAlpha = 0.25;
        ctx.font = '9px monospace';
        ctx.fillStyle = '#555';
        ctx.textAlign = 'right';
        ctx.fillText('click to skip', canvasW - 20, canvasH - 16);
    }

    ctx.restore();
}

// ============================================================
//  OPTIONS SCREEN
// ============================================================
let optionsBackBtn = null;
let optionsSliders = {};
let optionsToggles = {};
let optionsHover = null;

function drawOptionsScreen() {
    const cx = canvasW / 2;
    const cy = canvasH / 2;

    ctx.save();
    if (optionsReturnPhase === 'paused') {
        ctx.globalAlpha = 0.75;
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvasW, canvasH);
    } else {
        const bgGrad = ctx.createRadialGradient(cx, cy * 0.8, 0, cx, cy * 0.8, canvasW * 0.6);
        bgGrad.addColorStop(0, '#0d0906');
        bgGrad.addColorStop(1, '#030202');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, canvasW, canvasH);
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = 0.9;
    ctx.font = '30px Georgia';
    ctx.shadowColor = 'rgba(180, 140, 50, 0.35)';
    ctx.shadowBlur = 16;
    ctx.fillStyle = '#d4b878';
    ctx.fillText('OPTIONS', cx, cy - 130);
    ctx.shadowBlur = 0;

    drawDecorLine(cx, cy - 105, 120, 0.4);

    const labelX = cx - 140;
    const controlX = cx - 30;
    const sliderW = 200, sliderH = 12;
    const toggleW = 70, toggleH = 28;
    const rowH = 48;
    let rowY = cy - 70;

    ctx.textBaseline = 'middle';

    // Music Volume
    ctx.textAlign = 'right'; ctx.font = '14px Georgia'; ctx.globalAlpha = 0.8; ctx.fillStyle = COLORS.TEXT_WARM;
    ctx.fillText('Music Volume', labelX, rowY);
    _drawOptSlider('musicVolume', controlX, rowY - sliderH / 2, sliderW, sliderH, gameSettings.musicVolume);
    ctx.textAlign = 'left'; ctx.font = '12px monospace'; ctx.fillStyle = '#a09070'; ctx.globalAlpha = 0.6;
    ctx.fillText(Math.round(gameSettings.musicVolume * 100) + '%', controlX + sliderW + 10, rowY);
    rowY += rowH;

    // SFX Volume
    ctx.textAlign = 'right'; ctx.font = '14px Georgia'; ctx.globalAlpha = 0.8; ctx.fillStyle = COLORS.TEXT_WARM;
    ctx.fillText('SFX Volume', labelX, rowY);
    _drawOptSlider('sfxVolume', controlX, rowY - sliderH / 2, sliderW, sliderH, gameSettings.sfxVolume);
    ctx.textAlign = 'left'; ctx.font = '12px monospace'; ctx.fillStyle = '#a09070'; ctx.globalAlpha = 0.6;
    ctx.fillText(Math.round(gameSettings.sfxVolume * 100) + '%', controlX + sliderW + 10, rowY);
    rowY += rowH;

    // Brightness
    ctx.textAlign = 'right'; ctx.font = '14px Georgia'; ctx.globalAlpha = 0.8; ctx.fillStyle = COLORS.TEXT_WARM;
    ctx.fillText('Brightness', labelX, rowY);
    _drawOptSlider('brightness', controlX, rowY - sliderH / 2, sliderW, sliderH, (gameSettings.brightness - 0.5) / 1.0);
    ctx.textAlign = 'left'; ctx.font = '12px monospace'; ctx.fillStyle = '#a09070'; ctx.globalAlpha = 0.6;
    ctx.fillText(Math.round(gameSettings.brightness * 100) + '%', controlX + sliderW + 10, rowY);
    rowY += rowH;

    // Graphics Quality
    ctx.textAlign = 'right'; ctx.font = '14px Georgia'; ctx.globalAlpha = 0.8; ctx.fillStyle = COLORS.TEXT_WARM;
    ctx.fillText('Graphics', labelX, rowY);
    _drawOptToggle('quality', controlX, rowY - toggleH / 2, toggleW, toggleH, gameSettings.quality === 'high' ? 'HIGH' : 'LOW');
    rowY += rowH;

    // Screen Shake
    ctx.textAlign = 'right'; ctx.font = '14px Georgia'; ctx.globalAlpha = 0.8; ctx.fillStyle = COLORS.TEXT_WARM;
    ctx.fillText('Screen Shake', labelX, rowY);
    _drawOptToggle('screenShake', controlX, rowY - toggleH / 2, toggleW, toggleH, gameSettings.screenShake ? 'ON' : 'OFF');
    rowY += rowH;

    // Fullscreen
    ctx.textAlign = 'right'; ctx.font = '14px Georgia'; ctx.globalAlpha = 0.8; ctx.fillStyle = COLORS.TEXT_WARM;
    ctx.fillText('Fullscreen', labelX, rowY);
    _drawOptToggle('fullscreen', controlX, rowY - toggleH / 2, toggleW, toggleH, gameSettings.fullscreen ? 'ON' : 'OFF');
    rowY += rowH;

    // Colorblind Mode
    ctx.textAlign = 'right'; ctx.font = '14px Georgia'; ctx.globalAlpha = 0.8; ctx.fillStyle = COLORS.TEXT_WARM;
    ctx.fillText('Colorblind', labelX, rowY);
    const _cbLabels = { off: 'OFF', symbols: 'SYM' };
    _drawOptToggle('colorblindMode', controlX, rowY - toggleH / 2, toggleW, toggleH, _cbLabels[gameSettings.colorblindMode] || 'OFF');
    rowY += rowH;

    // Text Scale
    ctx.textAlign = 'right'; ctx.font = '14px Georgia'; ctx.globalAlpha = 0.8; ctx.fillStyle = COLORS.TEXT_WARM;
    ctx.fillText('Text Size', labelX, rowY);
    const _tsMap = { 0.85: 'S', 1: 'M', 1.15: 'L', 1.3: 'XL' };
    _drawOptToggle('textScale', controlX, rowY - toggleH / 2, toggleW, toggleH, _tsMap[gameSettings.textScale] || 'M');
    rowY += rowH;

    // Pause on Blur
    ctx.textAlign = 'right'; ctx.font = '14px Georgia'; ctx.globalAlpha = 0.8; ctx.fillStyle = COLORS.TEXT_WARM;
    ctx.fillText('Auto-Pause', labelX, rowY);
    _drawOptToggle('pauseOnBlur', controlX, rowY - toggleH / 2, toggleW, toggleH, gameSettings.pauseOnBlur ? 'ON' : 'OFF');
    rowY += rowH + 12;

    drawDecorLine(cx, rowY, 100, 0.25);
    rowY += 20;

    const backW = 140, backH = 36;
    optionsBackBtn = { x: cx - backW / 2, y: rowY, w: backW, h: backH, label: 'BACK' };
    const hBack = pointInButton(mouse.x, mouse.y, optionsBackBtn);
    drawMenuButton(optionsBackBtn, hBack, 0.9);

    ctx.restore();
}

function _drawOptSlider(id, x, y, w, h, value) {
    optionsSliders[id] = { x: x, y: y, w: w, h: h };
    ctx.save();
    ctx.globalAlpha = 0.25; ctx.fillStyle = '#a89060';
    ctx.beginPath(); ctx.roundRect(x, y, w, h, h / 2); ctx.fill();
    ctx.globalAlpha = 0.3; ctx.strokeStyle = COLORS.BORDER_GOLD; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(x, y, w, h, h / 2); ctx.stroke();
    const fillW = Math.max(h, w * value);
    ctx.globalAlpha = 0.7;
    const fg = ctx.createLinearGradient(x, y, x + fillW, y);
    fg.addColorStop(0, '#8a6a30'); fg.addColorStop(1, '#d4a040');
    ctx.fillStyle = fg;
    ctx.beginPath(); ctx.roundRect(x, y, fillW, h, h / 2); ctx.fill();
    const knobX = x + w * value;
    ctx.globalAlpha = 0.9; ctx.fillStyle = '#d4b478';
    ctx.beginPath(); ctx.arc(knobX, y + h / 2, h * 0.9, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#2a1a0e'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.restore();
}

function _drawOptToggle(id, x, y, w, h, label) {
    optionsToggles[id] = { x: x, y: y, w: w, h: h };
    const isOn = label === 'HIGH' || label === 'ON';
    ctx.save();
    ctx.fillStyle = `rgba(30, 22, 14, 0.55)`;
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 4); ctx.fill();
    ctx.strokeStyle = isOn ? 'rgba(212, 180, 120, 0.25)' : 'rgba(140, 120, 80, 0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 4); ctx.stroke();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '12px monospace';
    ctx.globalAlpha = isOn ? 0.9 : 0.5;
    ctx.fillStyle = isOn ? '#d4b878' : '#8a7a5a';
    ctx.fillText(label, x + w / 2, y + h / 2);
    ctx.restore();
}

// ============================================================
//  STORY: ENDING CHOICE INPUT HANDLING
// ============================================================
function handleEndingChoiceClick(mx, my) {
    if (gamePhase !== 'endingChoice') return false;

    const cx = canvasW / 2;
    const btnW = 320, btnH = 90, btnGap = 40;
    const btnY = canvasH * 0.42;

    const shatterX = cx - btnW - btnGap / 2;
    const replaceX = cx + btnGap / 2;

    if (mx >= shatterX && mx <= shatterX + btnW && my >= btnY && my <= btnY + btnH) {
        endingChoice = 'shatter';
        endingCinematicTimer = 0;
        gamePhase = 'endingCinematic';
        if (typeof playMusic === 'function') playMusic('victory', 2.0);
        return true;
    }
    if (mx >= replaceX && mx <= replaceX + btnW && my >= btnY && my <= btnY + btnH) {
        endingChoice = 'replace';
        endingCinematicTimer = 0;
        gamePhase = 'endingCinematic';
        if (typeof playMusic === 'function') playMusic('victory', 2.0);
        return true;
    }
    return false;
}

function handleEndingChoiceHover(mx, my) {
    if (gamePhase !== 'endingChoice') return;

    const cx = canvasW / 2;
    const btnW = 320, btnH = 90, btnGap = 40;
    const btnY = canvasH * 0.42;

    const shatterX = cx - btnW - btnGap / 2;
    const replaceX = cx + btnGap / 2;

    if (mx >= shatterX && mx <= shatterX + btnW && my >= btnY && my <= btnY + btnH) {
        endingChoiceHover = 'shatter';
    } else if (mx >= replaceX && mx <= replaceX + btnW && my >= btnY && my <= btnY + btnH) {
        endingChoiceHover = 'replace';
    } else {
        endingChoiceHover = null;
    }
}

init();
