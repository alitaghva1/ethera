//  GAME LOOP
// ============================================================
let lastTime = 0;
let _frameDt = 0.016; // cached dt for render() access (updated each frame)

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
    setPixelCursor(loadScreenHover >= 0 ? 'pointer' : 'default');
}

function updateMenuFadePhase(dt) {
    menuTime += dt;
    updateMenuEmbers(dt);
    menuFadeAlpha = Math.max(0, menuFadeAlpha - dt * 3);
    setPixelCursor('default');
    if (menuFadeAlpha <= 0) {
        gamePhase = menuFadeTarget;
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
            loadSaveSlots(); // refresh slots
        } else if (menuFadeTarget === 'intro') {
            runIntro();
        }
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
        pickupTexts.push({
            text: 'Find a way out...',
            color: COLORS.TEXT_HINT,
            row: player.row, col: player.col,
            offsetY: 0,
            life: 3.0,
        });
        setTimeout(() => { startWaveSystem(); }, 1500);
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

    // Vision text
    const cx = canvasW / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const lines = [
        { text: 'The talisman burns.', time: 1.5, y: canvasH * 0.38 },
        { text: 'A vision — a throne, deep below.', time: 2.2, y: canvasH * 0.46 },
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
        currentObjective = 'The talisman pulls you downward...';
    }
}

// Zone transition target → zone number lookup
const ZONE_TARGET_MAP = {
    town: 0, zone1: 1, zone2: 2, zone3: 3,
    zone4: 4, zone5: 5, zone6: 6,
};
// Temp vars for passing procedural config through zone transitions
let _nextProceduralTheme = null;
let _nextProceduralDepth = 1;

// ── AMBIENT ATMOSPHERE PARTICLES ──
let _ambientTimer = 0;
const _AMBIENT_MAX = 8;
const _AMBIENT_CONFIGS = {
    dungeon: { color: '#888877', size: 0.8, alpha: 0.06, vy: -0.2, life: 3.0 },  // faint dust motes
    hell:    { color: '#cc5522', size: 1, alpha: 0.08, vy: -0.6, life: 2.0 },    // subtle ash
    frozen:  { color: '#99bbdd', size: 0.8, alpha: 0.07, vy: 0.3, life: 2.5 },   // faint ice
    throne:  { color: '#664499', size: 0.8, alpha: 0.05, vy: -0.15, life: 3.0 }, // barely-there void
    town:    { color: '#aa9977', size: 0.8, alpha: 0.04, vy: -0.15, life: 3.5 }, // very subtle dust
};
function spawnAmbientParticles(dt) {
    if (gamePhase !== 'playing' || typeof _emitParticle !== 'function') return;
    _ambientTimer += dt;
    if (_ambientTimer < 0.8) return; // spawn every 0.8s (subtle, not constant)
    _ambientTimer = 0;

    // Determine atmosphere type from current zone
    let cfg;
    const z = currentZone;
    if (z === 0) cfg = _AMBIENT_CONFIGS.town;
    else if (z >= 1 && z <= 3) cfg = _AMBIENT_CONFIGS.dungeon;
    else if (z === 4) cfg = _AMBIENT_CONFIGS.hell;
    else if (z === 5) cfg = _AMBIENT_CONFIGS.frozen;
    else if (z === 6) cfg = _AMBIENT_CONFIGS.throne;
    else if (z >= 100) {
        // Procedural — match theme
        const depth = z - 99;
        if (depth <= 2) cfg = _AMBIENT_CONFIGS.dungeon;
        else if (depth <= 4) cfg = _AMBIENT_CONFIGS.hell;
        else cfg = _AMBIENT_CONFIGS.frozen;
    }
    if (!cfg) return;

    // Count existing ambient particles to cap
    const ambientCount = particles.filter(p => p.type === 'ambient').length;
    if (ambientCount >= _AMBIENT_MAX) return;

    // Spawn 1 particle near the player
    for (let i = 0; i < 1; i++) {
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
    }
}

function updateGameplay(dt) {
    tickInputBuffers(dt);
    if (multiKillTimer > 0) {
        multiKillTimer -= dt;
        if (multiKillTimer <= 0) multiKillCount = 0; // reset streak
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
        checkProjectileEnemyHits();
        updateEnemyProjectiles(dt);
        updateTowers(dt);
        updateTowerBolts(dt);
        updateOrbitFireballs(dt);
        updatePlacement(dt);
        updateWorldDrops(dt);
        tryPickupDrops();
        updateWorldKeyDrops(dt);
        tryPickupKeyDrops();
    }
    updateParticles(dt);
    updateEffectParticles(dt);
    updatePickupTexts(dt);
    if (typeof Notify !== 'undefined' && Notify.updateTutorials) Notify.updateTutorials(dt);
    if (typeof updateFrozenEchoes === 'function') updateFrozenEchoes(dt);
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
    updateCamera(dt);

    // Update fog of war — throttled to ~4 times per second
    if (typeof updateFogOfWar === 'function') {
        if (!updateGameplay._fogTimer) updateGameplay._fogTimer = 0;
        updateGameplay._fogTimer += dt;
        if (updateGameplay._fogTimer > 0.25) {
            updateGameplay._fogTimer = 0;
            updateFogOfWar();
        }
    }

    // Zone transition fade overlay
    if (zoneTransitionFading) {
        if (zoneTransitionAlpha < 1) {
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
                } else if (typeof zoneTransitionTarget === 'number') {
                    nextZone = zoneTransitionTarget;
                } else {
                    nextZone = ZONE_TARGET_MAP[zoneTransitionTarget] != null ? ZONE_TARGET_MAP[zoneTransitionTarget] : 1;
                }
                loadZone(nextZone);
                showZoneBanner(nextZone);
                zoneTransitionAlpha = 1;
                zoneTransitionFading = 'fadeIn';
            }
        } else if (zoneTransitionFading === 'fadeIn') {
            zoneTransitionAlpha -= dt * 2.5;
            if (zoneTransitionAlpha <= 0) {
                zoneTransitionAlpha = 0;
                zoneTransitionFading = false;
            }
        }
    }
}

function gameLoop(timestamp) {
    try {
        let dt = Math.min((timestamp - lastTime) / 1000, 0.1);
        lastTime = timestamp;
        _frameDt = dt; // cache for render()
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

    // ----- Cinematic "left for dead" sequence -----
    if (gamePhase === 'cinematic') {
        updateCinematicPhase(dt);
        render();
        drawCinematicText();
        requestAnimationFrame(gameLoop);
        return;
    }

    // ----- Awakening phase (legacy fallback) -----
    if (gamePhase === 'awakening') {
        introTimer += dt;
        lightRadius = Math.min(MAX_LIGHT, 60 + (MAX_LIGHT - 60) * (introTimer / 3));
        if (introTimer > 3) {
            gamePhase = 'playing';
            lightRadius = MAX_LIGHT;
            setPixelCursor('none');
            // Show controls hint
            if (typeof Notify !== 'undefined') Notify.showControlsOnce();
            // Show objective hint as floating text
            pickupTexts.push({
                text: 'Find a way out...',
                color: COLORS.TEXT_HINT,
                row: player.row, col: player.col,
                offsetY: 0,
                life: 3.0,
            });
            startWaveSystem();
        }
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

    // Level-up screen — pauses gameplay
    if (xpState.levelUpPending && gamePhase === 'playing') {
        xpState.levelUpFadeIn = Math.min(1, xpState.levelUpFadeIn + dt * 4);
        setPixelCursor('default');
        render();
        drawLevelUpScreen();
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
        console.error('Game loop error:', err);
        gameLoopErrors++;

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
    ctx.setTransform(dpr * displayScale, 0, 0, dpr * displayScale, 0, 0);

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
    const btnGrad = ctx.createLinearGradient(btn.x, btn.y, btn.x, btn.y + btn.h);
    btnGrad.addColorStop(0, `rgba(30, 22, 14, ${0.65 + hoverGlow})`);
    btnGrad.addColorStop(1, `rgba(12, 8, 4, ${0.75 + hoverGlow})`);
    ctx.fillStyle = btnGrad;
    ctx.beginPath();
    ctx.roundRect(btn.x, btn.y, btn.w, btn.h, 4);
    ctx.fill();

    // Border
    const borderAlpha = isHovered ? 0.6 : 0.2;
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
    ctx.fillStyle = isHovered ? '#e8d8b0' : '#a09070';
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

    // Pulsing "click anywhere to begin"
    const pulse = 0.35 + Math.sin(t * 2.5) * 0.15;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = preMenuAlpha * pulse;
    ctx.font = 'italic 15px Georgia';
    ctx.fillStyle = '#aa9970';
    ctx.fillText('click anywhere to begin', cx, canvasH / 2);
    ctx.restore();
}

function drawMenuScreen(dt) {
    const cx = canvasW / 2;
    const cy = canvasH / 2;
    const t = menuTime;

    // ----- Background -----
    // Deep dark gradient
    const bgGrad = ctx.createRadialGradient(cx, cy * 0.7, 0, cx, cy * 0.7, canvasW * 0.7);
    bgGrad.addColorStop(0, '#0d0906');
    bgGrad.addColorStop(0.5, '#080504');
    bgGrad.addColorStop(1, '#030202');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, canvasW, canvasH);

    // Subtle warm vignette at bottom
    const vigGrad = ctx.createLinearGradient(0, canvasH * 0.6, 0, canvasH);
    vigGrad.addColorStop(0, 'rgba(40, 20, 5, 0)');
    vigGrad.addColorStop(1, `rgba(30, 12, 3, ${0.15 + Math.sin(t * 0.8) * 0.05})`);
    ctx.fillStyle = vigGrad;
    ctx.fillRect(0, canvasH * 0.6, canvasW, canvasH * 0.4);

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

    // Title glow
    ctx.globalCompositeOperation = 'screen';
    const titleGlow = ctx.createRadialGradient(cx, cy - 60, 0, cx, cy - 60, 260);
    titleGlow.addColorStop(0, `rgba(180, 130, 50, ${0.12 + Math.sin(t * 1.5) * 0.04})`);
    titleGlow.addColorStop(0.5, `rgba(120, 80, 20, ${0.04})`);
    titleGlow.addColorStop(1, 'rgba(60, 30, 5, 0)');
    ctx.fillStyle = titleGlow;
    ctx.fillRect(cx - 300, cy - 200, 600, 300);

    ctx.globalCompositeOperation = 'source-over';

    // Title text
    ctx.font = '62px Georgia';
    ctx.shadowColor = 'rgba(200, 140, 40, 0.4)';
    ctx.shadowBlur = 30;
    ctx.fillStyle = '#d4b878';
    ctx.fillText('ETHERA', cx, cy - 60);
    ctx.shadowBlur = 0;

    // Subtitle
    ctx.font = 'italic 16px Georgia';
    ctx.fillStyle = '#8a7a5a';
    ctx.globalAlpha = menuFadeAlpha * (0.5 + Math.sin(t * 2) * 0.15);
    ctx.fillText('The Awakening', cx, cy - 20);

    ctx.globalAlpha = menuFadeAlpha;

    // Decorative lines above and below title
    drawDecorLine(cx, cy - 98, 180, menuFadeAlpha * 0.4);
    drawDecorLine(cx, cy + 5, 140, menuFadeAlpha * 0.3);

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
// Map item slot + rarity to the best Raven icon variant
function getItemSpriteForSlot(slot, rarity) {
    const suffix = rarity === 'epic' ? '_e' : rarity === 'rare' ? '_r' : rarity === 'uncommon' ? '_u' : '';
    const key = 'item_' + slot + suffix;
    return images[key] || images['item_' + slot] || null;
}

function drawWorldDrops() {
    for (const d of worldDrops) {
        const pos = tileToScreen(d.row, d.col);
        const sx = pos.x + cameraX;
        const sy = pos.y + cameraY;
        const bob = Math.sin(d.bobTime * 2.5) * 4;
        const fadeIn = d.spawnTime > 0 ? 1 - (d.spawnTime / 0.5) : 1;
        const rarDef = RARITY[d.item.rarity];
        const t = performance.now() / 1000;
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

function drawWorldKeyDrops() {
    for (const d of worldKeyDrops) {
        const pos = tileToScreen(d.row, d.col);
        const sx = pos.x + cameraX;
        const sy = pos.y + cameraY;
        const bob = Math.sin(d.bobTime * 2) * 5;
        const fadeIn = d.spawnTime > 0 ? 1 - (d.spawnTime / 0.5) : 1;
        const t = performance.now() / 1000;

        ctx.save();
        ctx.globalAlpha = fadeIn;

        // Large golden ground glow — key items are special
        ctx.globalCompositeOperation = 'screen';
        const pulse = 0.6 + Math.sin(t * 3) * 0.2;
        const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, 30);
        glow.addColorStop(0, `rgba(255, 210, 80, ${0.5 * pulse})`);
        glow.addColorStop(0.5, `rgba(200, 150, 30, ${0.15 * pulse})`);
        glow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(sx - 30, sy - 30, 60, 60);

        // Floating key shape
        ctx.globalCompositeOperation = 'source-over';
        const iy = sy - 18 + bob;
        ctx.globalAlpha = fadeIn * 0.95;

        // Key body — simple iconic shape
        ctx.fillStyle = d.color;
        ctx.strokeStyle = '#fff8e0';
        ctx.lineWidth = 1;

        // Circle head
        ctx.beginPath();
        ctx.arc(sx, iy - 4, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = fadeIn * 0.4;
        ctx.stroke();

        // Shaft
        ctx.globalAlpha = fadeIn * 0.95;
        ctx.fillRect(sx - 1.5, iy + 1, 3, 10);

        // Teeth
        ctx.fillRect(sx + 1, iy + 7, 3, 2);
        ctx.fillRect(sx + 1, iy + 4, 2, 2);

        // Sparkle
        ctx.globalAlpha = fadeIn * (0.3 + Math.sin(t * 5) * 0.3);
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(sx - 2, iy - 6, 1.5, 0, Math.PI * 2);
        ctx.fill();

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

    // Try sprite-based rendering first (Raven Fantasy Icons — each rarity has unique art)
    const spriteImg = getItemSpriteForSlot(slot, rarityKey);
    if (spriteImg) {
        ctx.imageSmoothingEnabled = false;
        const sprW = size * 0.8;
        ctx.drawImage(spriteImg, cx - sprW / 2, cy - sprW / 2, sprW, sprW);
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
    const subText = RARITY[item.rarity].label + ' ' + SLOT_LABELS[item.slot];
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
    // NOTE: Standalone inventory UI disabled — inventory managed through Grimoire Equipment tab
    // Full code retained below for potential future reactivation per form
    return;
    if (!inventoryOpen) return;

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
        // Slide-in offset — text starts 20px high and settles down
        const slideOffset = Math.max(0, 20 * (1 - Math.min(1, (t - 1.0) / 0.5)));

        ctx.globalAlpha = textAlpha;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Death headline with slide-in (form-specific)
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
        ctx.shadowColor = 'rgba(180, 20, 10, 0.6)';
        ctx.shadowBlur = 30;
        ctx.fillStyle = '#cc3322';
        ctx.fillText(_deathMsg, cx, cy - 40 - slideOffset);
        ctx.shadowBlur = 0;

        // Decorative lines flanking the title
        if (typeof drawDecorLine === 'function') {
            drawDecorLine(cx, cy - 72 - slideOffset, 160, textAlpha * 0.4);
            drawDecorLine(cx, cy - 10 - slideOffset, 120, textAlpha * 0.3);
        }

        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 2;

        // Stats with symbolic icons
        const statsY = cy + 14;
        ctx.font = '13px Georgia';
        ctx.fillStyle = '#9a7a6a';
        const zoneCfg = ZONE_CONFIGS[currentZone] || (currentZone >= 100 && typeof getProceduralZoneConfig === 'function' ? getProceduralZoneConfig(currentZone) : null);
        const zoneName = zoneCfg ? zoneCfg.name : 'Unknown';
        const formName = FormSystem.currentForm ? FormSystem.currentForm.charAt(0).toUpperCase() + FormSystem.currentForm.slice(1) : 'Unknown';

        const statLines = [
            `\u2694 Wave ${wave.current + 1}  \u00B7  ${wave.totalKilled} slain`,
            `\u26F0 ${zoneName}  \u00B7  ${formName} form`,
        ];
        for (let i = 0; i < statLines.length; i++) {
            ctx.strokeText(statLines[i], cx, statsY + i * 20);
            ctx.fillText(statLines[i], cx, statsY + i * 20);
        }

        // Death cause
        if (deathCause) {
            ctx.font = '12px Georgia';
            ctx.fillStyle = '#bb7766';
            ctx.strokeText(`Slain by ${deathCause}`, cx, statsY + 44);
            ctx.fillText(`Slain by ${deathCause}`, cx, statsY + 44);
        }

        // Tip in styled box
        if (!drawDeathScreen._tip) {
            const _sharedTips = [
                "Try dodging more frequently.",
                "Watch enemy attack patterns.",
                "Use your form's special abilities.",
            ];
            const _formTips = {
                slime: [
                    "Absorb weakened enemies to grow larger and stronger.",
                    "A bigger slime has more HP — stay aggressive.",
                    "Bounce to dodge attacks and close gaps quickly.",
                ],
                skeleton: [
                    "Use shield bash to block heavy hits.",
                    "Build combos for bonus damage.",
                    "Roll through enemy attacks for counterattack openings.",
                ],
                wizard: [
                    "Equip better gear from the Grimoire.",
                    "Summon towers to control the battlefield.",
                    "Manage your mana — don't spam fireballs.",
                ],
                lich: [
                    "Raise undead minions to draw enemy fire.",
                    "Harvest souls from kills to fuel your power.",
                    "Shadow step behind enemies for safe positioning.",
                ],
            };
            const _allTips = _sharedTips.concat(_formTips[FormSystem.currentForm] || []);
            drawDeathScreen._tip = _allTips[Math.floor(Math.random() * _allTips.length)];
        }
        const tipY = statsY + 70;
        const tipW = 260, tipH = 28;
        // Tip box background
        ctx.globalAlpha = textAlpha * 0.35;
        ctx.fillStyle = '#1a1510';
        ctx.beginPath();
        ctx.roundRect(cx - tipW / 2, tipY - tipH / 2, tipW, tipH, 3);
        ctx.fill();
        ctx.strokeStyle = '#5a4a3a';
        ctx.lineWidth = 0.5;
        ctx.stroke();
        // Tip text
        ctx.globalAlpha = textAlpha * 0.6;
        ctx.font = '10px Georgia';
        ctx.fillStyle = '#a09080';
        ctx.fillText(`\u2731 ${drawDeathScreen._tip}`, cx, tipY);
        ctx.globalAlpha = textAlpha;
    }

    if (t > 2.5) {
        const btnAlpha = Math.min(1, (t - 2.5) / 0.8);
        ctx.globalAlpha = btnAlpha;

        const btnW = 180, btnH = 40;
        const btnGap = 12;
        const btnX = cx - btnW - btnGap / 2, btnY = cy + 100;
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
    }

    ctx.restore();
}

// Pause menu button rects (for click handling)
let pauseBtnResume = null, pauseBtnSave = null, pauseBtnQuit = null;

function drawPauseOverlay() {
    const cx = canvasW / 2;
    const cy = canvasH / 2;

    ctx.save();

    // Dim overlay with radial vignette
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvasW, canvasH);
    const vig = ctx.createRadialGradient(cx, cy, 80, cx, cy, Math.max(canvasW, canvasH) * 0.6);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.4)');
    ctx.globalAlpha = 1;
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, canvasW, canvasH);

    // Title glow
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.08;
    const titleGlow = ctx.createRadialGradient(cx, cy - 50, 0, cx, cy - 50, 180);
    titleGlow.addColorStop(0, 'rgba(180, 140, 60, 0.4)');
    titleGlow.addColorStop(1, 'rgba(60, 40, 10, 0)');
    ctx.fillStyle = titleGlow;
    ctx.fillRect(cx - 200, cy - 160, 400, 220);
    ctx.globalCompositeOperation = 'source-over';

    // "PAUSED" title
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = 0.85;
    ctx.font = '36px Georgia';
    ctx.shadowColor = 'rgba(180, 140, 50, 0.35)';
    ctx.shadowBlur = 20;
    ctx.fillStyle = '#d4b878';
    ctx.fillText('PAUSED', cx, cy - 55);
    ctx.shadowBlur = 0;

    // Decorative lines
    drawDecorLine(cx, cy - 87, 120, 0.3);
    drawDecorLine(cx, cy - 27, 90, 0.2);

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
    // Reset player
    player.row = 4; player.col = 3;
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
    // Reset wave
    wave.current = 0;
    wave.phase = 'pre';
    wave.timer = 0;
    wave.bannerAlpha = 0;
    wave.enemiesAlive = 0;
    wave.totalKilled = 0;
    // Reset screen effects
    screenShakeTimer = 0;
    screenShakeIntensity = 0;
    hitPauseTimer = 0;
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
    xpState.levelUpFadeIn = 0;
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
    cinematicTimer = 0;
    cinematicTextAlpha = [0, 0, 0, 0];
    cinematicFlashAlpha = 0;
    // Reset light to full
    lightRadius = MAX_LIGHT;
    // Reload zone 1 properly (regenerate dungeon, doors, chests, NPCs)
    seedMapRNG(Date.now() ^ (Math.random() * 0xFFFFFF | 0)); // new seed each restart
    currentZone = 1;
    loadZone(1);
    showZoneBanner(1);
    // Show controls overlay on first game start
    if (typeof Notify !== 'undefined') Notify.showControlsOnce();
    updateDoorDefsForZone(1);
    updateChestDefsForZone(1);
    buildRoomBounds();
    buildEnvironmentLights();
    loadZoneNPCs(1);
    // Re-snap camera after zone rebuild
    const restartPos = tileToScreen(player.row, player.col);
    smoothCamX = canvasW / 2 - restartPos.x;
    smoothCamY = canvasH / 2 - restartPos.y;
    cameraX = Math.round(smoothCamX);
    cameraY = Math.round(smoothCamY);
    // Restart waves and music
    duckMusic(false);
    startWaveSystem();
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


    ctx.setTransform(dpr * displayScale, 0, 0, dpr * displayScale, 0, 0);

    // Safety: reset alpha every frame so no VFX leak carries over
    ctx.globalAlpha = 1.0;

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

    if (gamePhase !== 'playing' && gamePhase !== 'awakening' && gamePhase !== 'cinematic') return;

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

    // Depth-sorted rendering with proper sprite interleaving
    for (let depth = 0; depth < mapSize * 2; depth++) {
        for (let row = Math.max(0, depth - mapSize + 1); row <= Math.min(depth, mapSize - 1); row++) {
            const col = depth - row;
            if (col < 0 || col >= mapSize) continue;

            // Fog of war — skip tiles the player hasn't explored yet
            // fogRevealed is numeric: 0 = hidden, 1 = full, 0.2-0.8 = dim edge
            const _fogVal = (fogRevealed[row] && fogRevealed[row][col]) || 0;
            const _fogVis = _fogVal > 0;
            const _fogDim = _fogVal < 1 && _fogVal > 0; // edge tile that needs darkening
            const ft = floorMap[row][col];
            if (ft && images[ft] && _fogVis) {
                // Apply fog edge dimming — darken wall peek tiles
                if (_fogDim) {
                    ctx.save();
                    ctx.globalAlpha = _fogVal;
                }
                if (ft.startsWith('h_')) {
                    drawHellTile(images[ft], row, col);
                } else if (currentZone !== 0 && ft.startsWith('n_')) {
                    drawNatureTile(images[ft], row, col);
                } else {
                    drawTile(images[ft], row, col);
                }
                drawTileEdgeShadows(row, col);
                drawRoughFloorHint(row, col);
                // Procedural hazard overlays (lava, acid, spikes, ice)
                if (typeof hazardMap !== 'undefined' && hazardMap.length > 0 && hazardMap[row] && hazardMap[row][col]) {
                    drawHazardOverlayTile(row, col);
                }
                if (_fogDim) ctx.restore();
            }

            // Draw any sprites that should appear BEFORE this object tile
            const ot = _fogVis ? objectMap[row][col] : null;
            if (ot) {
                let tileScore = (row + col) * mapSize + row;
                // Z-fix: tall nature objects (trees, rocks, logs) in non-town zones
                // visually extend above normal tile height, covering nearby sprites.
                if (currentZone !== 0 && ot.startsWith('n_') && !ot.startsWith('n_grass')) {
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
                const pulse = 0.15 + Math.sin(performance.now() / 800 + row * 2) * 0.08;
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
                    const pulse1 = 0.22 + Math.sin(performance.now() / 1200) * 0.06;
                    ctx.globalAlpha = pulse1;
                    const radius1 = 140;
                    const colorStops1 = [['rgba(255, 230, 160, 0.5)', 0], ['rgba(255, 200, 100, 0.15)', 0.4], ['rgba(200, 150, 50, 0)', 1]];
                    const cacheKey1 = getGlowCacheKey(colorStops1, radius1, 'archway_wide');
                    const glowCanvas1 = getGlowCanvas(cacheKey1, radius1, colorStops1);
                    ctx.drawImage(glowCanvas1, sx - radius1, sy - 30 - radius1);
                    // Layer 2: intense white-gold center (cached)
                    ctx.globalAlpha = 0.35 + Math.sin(performance.now() / 800) * 0.1;
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
                    const pulse = 0.18 + Math.sin(performance.now() / 700 + col * 2) * 0.08;
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
                // Fade tall tiles that occlude the player (walls, columns, gates)
                let _occludeFade = 1;
                if (gamePhase === 'playing' && !gameDead) {
                    const _tDepth = row + col;
                    const _pDepth = player.row + player.col;
                    if (_tDepth > _pDepth && _tDepth <= _pDepth + 2) {
                        const _dr = Math.abs(row - player.row);
                        const _dc = Math.abs(col - player.col);
                        if (_dr <= 2 && _dc <= 2 && (ot.includes('wall') || ot.includes('Wall') ||
                            ot.includes('column') || ot.includes('Column') ||
                            ot.includes('gate') || ot.includes('Gate') ||
                            ot.includes('Arch') || ot.includes('arch'))) {
                            _occludeFade = 0.45;
                        }
                    }
                }
                // Combine occlusion fade with fog edge dimming
                const _objAlpha = (_fogDim ? _fogVal : 1) * _occludeFade;
                if (_objAlpha < 1) { ctx.save(); ctx.globalAlpha = _objAlpha; }
                // Dispatch to correct draw function based on tile prefix
                if (ot.startsWith('h_')) {
                    drawHellTile(images[ot], row, col);
                } else if (currentZone !== 0 && ot.startsWith('n_')) {
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

    // ── LAYER 3: Floor decals + environment light props ──
    drawBloodStain();
    drawEnvironmentLightProps();

    // ── LAYER 4: Darkness / Lighting ──
    drawDarkness();

    // ── LAYER 4b: Environment light punchthrough (screen blend after darkness) ──
    drawEnvironmentLightPunchthrough();

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
        const mPulse = 0.3 + Math.sin(performance.now() / 500) * 0.1;
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
    drawDustParticles();
    drawAllTowerGlows();
    drawOrbitFireballs();
    drawWorldDrops();
    drawWorldKeyDrops();
    drawProjectiles();
    drawTowerBolts();
    drawFireTrails();
    drawEnemyProjectiles();
    drawParticles();
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

    // ── LAYER 8: Screen effects ──

    // Phase jump flash — brief arcane burst on screen
    if (player.dodgeFlashTimer > 0) {
        const flashAlpha = player.dodgeFlashTimer / 0.12; // 0→1
        let fx, fy;
        const pos = tileToScreen(player.row, player.col);
        fx = pos.x + cameraX;
        fy = pos.y + cameraY - 30;

        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        const flashGrad = ctx.createRadialGradient(fx, fy, 0, fx, fy, 120);
        flashGrad.addColorStop(0, `rgba(140, 120, 255, ${0.5 * flashAlpha})`);
        flashGrad.addColorStop(0.4, `rgba(100, 80, 220, ${0.25 * flashAlpha})`);
        flashGrad.addColorStop(1, 'rgba(60, 40, 160, 0)');
        ctx.fillStyle = flashGrad;
        ctx.fillRect(fx - 150, fy - 150, 300, 300);
        ctx.restore();
    }

    // ── COMBAT JUICE: Damage vignette (replaces old flat red flash) ──
    // Decay the vignette timer
    if (dmgVignetteTimer > 0) {
        dmgVignetteTimer -= _frameDt;
        // Exponential decay for snappy attack, slow tail
        dmgVignetteIntensity *= Math.pow(0.08, _frameDt); // fast falloff
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
        const hpRatio = player.hp / (PLAYER_STATS.maxHp + (equipBonus.maxHpBonus || 0) + getTalismanBonus().hpBonus);
        if (hpRatio < 0.25) {
            const urgency = 1 - (hpRatio / 0.25); // 0→1 as HP drops from 25%→0%
            const pulse = 0.12 + Math.sin(performance.now() * 0.005) * 0.06; // ~0.8Hz
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
        }
    }

    // Vignette — lighter for outdoor town, dramatic for dungeon
    ctx.save();
    if (currentZone === 0) {
        // Dark fantasy town: dramatic vignette, nearly as heavy as dungeon
        const vg = ctx.createRadialGradient(
            canvasW / 2, canvasH / 2, canvasH * 0.3,
            canvasW / 2, canvasH / 2, canvasH * 0.85
        );
        vg.addColorStop(0, 'rgba(0,0,0,0)');
        vg.addColorStop(1, 'rgba(0,0,0,0.35)');
        ctx.fillStyle = vg;
        ctx.fillRect(0, 0, canvasW, canvasH);
    } else {
        const vg = ctx.createRadialGradient(
            canvasW / 2, canvasH / 2, canvasH * 0.3,
            canvasW / 2, canvasH / 2, canvasH * 0.8
        );
        vg.addColorStop(0, 'rgba(0,0,0,0)');
        vg.addColorStop(1, 'rgba(0,0,0,0.4)');
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
    if (gamePhase !== 'cinematic') {
        // HP & Mana bars (form-specific)
        const hudHandler = FormSystem.getHandler();
        if (hudHandler && hudHandler.drawHUD) hudHandler.drawHUD();
        else drawHPMana();

        // Unified notification system (controls, mana-lock, zone name)
        if (typeof Notify !== 'undefined') Notify.draw(ctx, canvasW, canvasH);

        // Pickup floating texts
        drawPickupTexts();

        // Frozen echoes (Zone 5 environmental story text)
        if (typeof drawFrozenEcho === 'function') drawFrozenEcho();

        // Interaction prompts
        drawChestPrompt();
        drawDoorPrompt();

        // Wave system UI
        drawWaveBanner();
        drawWaveHUD();
        drawBossHealthBar();

        // Placement preview (above HUD, below crosshair)
        drawPlacementPreview();

        // Crosshair (always on top, unless inventory open)
        if (!inventoryOpen) drawCrosshair();

        // Inventory UI (topmost layer)
        drawInventoryUI();

        // Background debug overlay (toggle: BackgroundManager.debugEnabled = true)
        if (typeof BackgroundManager !== 'undefined') {
            BackgroundManager.drawDebug(ctx, canvasW, canvasH, cameraX, cameraY);
        }

        // ── LAYER 10: Zone name banner ──
        drawZoneBanner();

        // ── LAYER 11: Zone transition overlay ──
        if (zoneTransitionAlpha > 0) {
            ctx.save();
            ctx.globalAlpha = zoneTransitionAlpha;
            ctx.fillStyle = '#000';
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
    const slotW = 320, slotH = 70, slotGap = 12;
    const startY = cy - 80;

    for (let i = 0; i < 3; i++) {
        const sx = cx - slotW / 2;
        const sy = startY + i * (slotH + slotGap);
        const s = saveSlots[i];
        const hovered = mouse.x >= sx && mouse.x <= sx + slotW &&
                        mouse.y >= sy && mouse.y <= sy + slotH;
        if (hovered && s) loadScreenHover = i;

        // Slot background
        ctx.globalAlpha = fa * (hovered && s ? 0.5 : 0.3);
        ctx.fillStyle = s ? '#14100c' : '#0a0806';
        ctx.beginPath(); ctx.roundRect(sx, sy, slotW, slotH, 5); ctx.fill();

        // Border
        ctx.globalAlpha = fa * (hovered && s ? 0.5 : 0.15);
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

            // Level + Form + Zone + Talisman
            ctx.globalAlpha = fa * 0.5;
            ctx.font = '10px Georgia';
            ctx.fillStyle = '#a89060';
            const _slotForm = s.currentForm ? s.currentForm.charAt(0).toUpperCase() + s.currentForm.slice(1) : 'Wizard';
            const _slotTalisman = (s.talisman && s.talisman.level > 1) ? '  ·  Talisman Lv.' + s.talisman.level : '';
            ctx.fillText('Lv.' + (s.level || 1) + '  ·  ' + _slotForm + '  ·  ' + (ZONE_NAMES_SHORT[s.currentZone] || 'Zone ' + s.currentZone) + _slotTalisman, sx + 12, sy + 56);

            // Date on right
            ctx.textAlign = 'right';
            ctx.globalAlpha = fa * 0.3;
            ctx.font = '9px monospace';
            ctx.fillStyle = '#8a7a5a';
            ctx.fillText(formatSaveDate(s.timestamp), sx + slotW - 12, sy + 56);
        } else {
            // Empty
            ctx.globalAlpha = fa * 0.15;
            ctx.font = 'italic 12px Georgia';
            ctx.fillStyle = '#665544';
            ctx.textAlign = 'center';
            ctx.fillText('— Empty —', cx, sy + slotH / 2);
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
    overlay.style.display = 'none';

    // Reset cinematic state
    cinematicTimer = 0;
    cinematicPhase = 0;
    wizardRotation = Math.PI / 2; // wizard lying on side
    wizardRiseProgress = 0;
    cinematicTextAlpha = [0, 0, 0, 0];
    bloodStainAlpha = 0;
    dustParticles = [];
    cinematicFlashAlpha = 0;
    lightRadius = 80; // dim but visible — enough to see dungeon shapes

    // Reset cinematic SFX one-shot flags so they fire again on replay
    cinematicSFX_heartbeat = false;
    cinematicSFX_stir = false;
    cinematicSFX_stand = false;
    cinematicSFX_ducked = false;
    cinematicSFX_unducked = false;
    cinematicShakeTriggered = false;

    // Camera starts offset from player — looking at a nearby part of the dungeon
    cinematicCamRow = 7;
    cinematicCamCol = 7;
    const camPos = tileToScreen(cinematicCamRow, cinematicCamCol);
    smoothCamX = canvasW / 2 - camPos.x;
    smoothCamY = canvasH / 2 - camPos.y;
    cameraX = Math.round(smoothCamX);
    cameraY = Math.round(smoothCamY);

    setPixelCursor('none');
    gamePhase = 'cinematic';

    // Crossfade from menu music to cinematic music
    playMusic('cinematic', 2.5);
}

// ----- 3D MODE FLAG -----
// 3D renderer disabled — using pure 2D canvas rendering

// ----- INIT -----
async function init() {
    resizeCanvas();
    nameInputEl = document.getElementById('nameInput');
    loadSaveSlots();
    if (typeof loadSettings === 'function') loadSettings();

    // Apply zone 1 tile config first so MAP_SIZE is correct for dungeon generation
    applyZoneTileConfig(1);

    // Clear arrays first (they're already initialized at declaration with default MAP_SIZE)
    resetFogOfWar(MAP_SIZE);
    floorMap.length = 0;
    objectMap.length = 0;
    blocked.length = 0;
    blockType.length = 0;
    objRadius.length = 0;
    // Re-initialize map arrays with correct MAP_SIZE for Zone 1
    for (let i = 0; i < MAP_SIZE; i++) {
        floorMap.push(Array(MAP_SIZE).fill(null));
        objectMap.push(Array(MAP_SIZE).fill(null));
        blocked.push(Array(MAP_SIZE).fill(true));
        blockType.push(Array(MAP_SIZE).fill(null));
        objRadius.push(Array(MAP_SIZE).fill(0));
    }
    // Seed map PRNG for this playthrough (unique per session)
    seedMapRNG(Date.now() ^ (Math.random() * 0xFFFFFF | 0));
    generateDungeon();
    updateDoorDefsForZone(1);
    updateChestDefsForZone(1);
    loadZoneNPCs(1);
    buildRoomBounds();
    buildEnvironmentLights();
    // Initial fog of war reveal from player spawn position
    updateFogOfWar();
    // Generate procedural background for zone 1 (textured earth behind tiles)
    if (typeof initSpaceBackground === 'function') {
        initSpaceBackground(1);
    }
    // Initialize background manager for starting zone
    if (typeof BackgroundManager !== 'undefined') {
        BackgroundManager.init(1);
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
