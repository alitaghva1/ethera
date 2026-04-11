// ============================================================
//  SLIME FORM — Complete mechanics
// ============================================================

// --- Pre-rendered tinted slime sprites (avoids per-frame ctx.filter) ---
const slimeTintedSprites = {};

function buildSlimeTintedSprites() {
    // Cache PVGames directional slime sprites (green, no tinting needed).
    // Also cache legacy Tiny RPG sprites as fallback.
    for (const anim of ['idle', 'walk']) {
        for (const dir of DIR8_NAMES) {
            const key = `pv_slime_${anim}_${dir}`;
            const src = images[key];
            if (!src || src.width === 0) continue;
            const offCanvas = document.createElement('canvas');
            offCanvas.width = src.width;
            offCanvas.height = src.height;
            const offCtx = offCanvas.getContext('2d');
            offCtx.drawImage(src, 0, 0);
            slimeTintedSprites[key] = offCanvas;
        }
    }
    // Legacy fallback sprites
    const spriteKeys = ['slime_p_idle', 'slime_p_walk', 'slime_p_attack', 'slime_p_hurt'];
    for (const key of spriteKeys) {
        const src = images[key];
        if (!src || src.width === 0) continue;
        const offCanvas = document.createElement('canvas');
        offCanvas.width = src.width;
        offCanvas.height = src.height;
        const offCtx = offCanvas.getContext('2d');
        offCtx.drawImage(src, 0, 0);
        slimeTintedSprites[key] = offCanvas;
    }
}

// --- Slime PV sprite helper: resolve sprite, frame dims, and frame count ---
function _getSlimePVSprite(animType) {
    const dir = player.dir8 || 'S';
    const pvKey = `pv_slime_${animType}_${dir}`;
    let img = slimeTintedSprites[pvKey] || images[pvKey];
    // Fallback: try idle for this direction
    if (!img && animType !== 'idle') {
        const fallKey = `pv_slime_idle_${dir}`;
        img = slimeTintedSprites[fallKey] || images[fallKey];
    }
    if (!img) return null;
    const fw = PV_SLIME_FW;  // 150
    const fh = PV_SLIME_FH;  // 150
    const info = PV_SLIME_ANIMS[animType] || PV_SLIME_ANIMS.idle;
    const frameCount = info.frames; // 10
    return { img, fw, fh, frameCount };
}

// Slime-specific state
const slimeState = {
    size: 1,          // 1-5, affects HP/damage/hitbox/speed
    maxSize: 5,
    bounceHeight: 0,   // current bounce visual offset
    bounceVel: 0,      // bounce velocity
    squash: 1.0,       // squash-stretch factor (1=normal)
    acidPuddles: [],    // active acid puddles on ground
    splitClones: [],    // AI-controlled split clones
    bounceJumping: false,
    bounceJumpTimer: 0,
    bounceJumpHeight: 0,
    landingDamageDealt: false,
    membraneShield: 0,   // Membrane upgrade — absorbs damage before HP
};

// Reset slime form state (called on form switch)
function resetSlimeState() {
    slimeState.size = 1;
    slimeState.bounceHeight = 0;
    slimeState.bounceVel = 0;
    slimeState.squash = 1.0;
    slimeState.acidPuddles.length = 0;
    slimeState.splitClones.length = 0;
    slimeState.bounceJumping = false;
    slimeState.bounceJumpTimer = 0;
    slimeState.bounceJumpHeight = 0;
    slimeState.landingDamageDealt = false;
    slimeState.membraneShield = 0;
    slimeState._membraneTimer = 0;
    slimeState._osmosisTick = 0;
    slimeState._oozeTimer = 0;
}

// Size scaling multipliers
function getSlimeSizeMult() {
    const s = slimeState.size;
    return {
        hp: 1 + (s - 1) * 0.35,      // 1.0x to 2.4x
        damage: 1 + (s - 1) * 0.25,   // 1.0x to 2.0x (steeper reward for growing)
        speed: 1 - (s - 1) * 0.06,   // 1.0x to 0.76x (gentler penalty)
        hitbox: 1 + (s - 1) * 0.15,  // 1.0x to 1.6x
        scale: 0.9 + (s - 1) * 0.25, // 0.9x to 1.9x visual
    };
}

// Shared absorb helper — used by both auto-absorb (walk over) and manual E-key absorb
function slimeAbsorbEnemy(target, particleCount) {
    const idx = enemies.indexOf(target);
    if (idx !== -1) enemies.splice(idx, 1);
    const sizeGain = 0.5 + getUpgrade('iron_stomach') * 0.25;
    slimeState.size = Math.min(slimeState.maxSize, slimeState.size + sizeGain);
    player.hp = Math.min(FORM_CONFIGS.slime.maxHp * getSlimeSizeMult().hp, player.hp + 20);
    FormSystem.formData.slime.absorbed++;
    // Evolution progress toast for absorb milestone
    if (typeof Notify !== 'undefined' && typeof EVOLUTION_REQUIREMENTS !== 'undefined') {
        const _absReq = EVOLUTION_REQUIREMENTS.slime_to_skeleton.absorbed;
        if (FormSystem.formData.slime.absorbed === Math.floor(_absReq / 2)) {
            Notify.toast(`${Math.floor(_absReq / 2)}/${_absReq} absorbs toward evolution!`, { color: '#88ff88', duration: 3 });
        } else if (FormSystem.formData.slime.absorbed === _absReq) {
            Notify.toast('Absorb requirement met!', { color: '#ffdd44', duration: 3 });
        }
    }
    // Absorbing IS killing — grant XP (which also increments totalKills) + wave total
    grantXP(target.type, target.statMult || 1.0);
    wave.totalKilled++;
    if (slimeState.size > FormSystem.formData.slime.maxSizeReached) {
        FormSystem.formData.slime.maxSizeReached = slimeState.size;
    }
    // Absorb body feedback — slime swells and jiggles
    slimeState.squash = 1.2; // swell outward on absorb
    slimeState.bounceVel = Math.max(slimeState.bounceVel, 1.0);
    addScreenShake(2, 0.15);
    // SFX — wet absorb slurp
    if (sfxCtx) sfxSlimeAbsorb();
    // Absorb particles (BUG-006 fix: use pooled system)
    const absPos = tileToScreen(target.row, target.col);
    for (let j = 0; j < (particleCount || 5); j++) {
        const a = Math.random() * Math.PI * 2;
        const spd = 20 + Math.random() * 35;
        _emitParticle(
            absPos.x + cameraX, absPos.y + cameraY,
            Math.cos(a) * spd, Math.sin(a) * spd,
            0.3 + Math.random() * 0.3, 2 + Math.random() * 3,
            '#33cc55', 0.8, 'effect'
        );
    }
    pickupTexts.push({
        row: player.row, col: player.col,
        text: `+${sizeGain.toFixed(1)} Size`, color: '#bbdd40',
        life: 1.0, offsetY: 0,
    });
}

// Volatile Mass burst — called from damagePlayer when slime takes a big hit
function _slimeVolatileMassBurst(rawDamage) {
    const volatileLvl = getUpgrade('volatile_mass');
    if (volatileLvl <= 0 || slimeState.size <= 1.5) return;
    const sizeLost = 0.5 + volatileLvl * 0.25; // lose 0.75 / 1.0 size
    const oldSize = slimeState.size;
    slimeState.size = Math.max(1, slimeState.size - sizeLost);
    const actualLost = oldSize - slimeState.size;
    if (actualLost <= 0) return;
    // Acid explosion proportional to size lost
    const burstDmg = (15 + actualLost * 20) * (1 + getUpgrade('acid_potency') * 0.2);
    const burstRadius = 1.8 + volatileLvl * 0.4;
    for (const e of enemies) {
        if (e.state === 'death') continue;
        const dist = Math.sqrt((e.row - player.row) ** 2 + (e.col - player.col) ** 2);
        if (dist < burstRadius) {
            e.hp -= burstDmg;
            if (e.hp <= 0) e.state = 'death';
        }
    }
    // Leave big acid puddle
    slimeState.acidPuddles.push({
        row: player.row, col: player.col,
        radius: burstRadius * 0.8,
        damage: 5 * (1 + getUpgrade('acid_potency') * 0.2),
        life: 3.5, dmgTimer: 0,
    });
    // Visual burst — big green explosion
    const bPos = tileToScreen(player.row, player.col);
    for (let j = 0; j < 12; j++) {
        const a = Math.random() * Math.PI * 2;
        const spd = 50 + Math.random() * 60;
        _emitParticle(
            bPos.x + cameraX, bPos.y + cameraY,
            Math.cos(a) * spd, Math.sin(a) * spd,
            0.35 + Math.random() * 0.3, 3 + Math.random() * 3,
            '#55dd33', 0.9, 'effect'
        );
    }
    addScreenShake(4, 0.2);
    pickupTexts.push({
        row: player.row, col: player.col,
        text: `Volatile! -${actualLost.toFixed(1)} Size`, color: '#ffaa33',
        life: 1.0, offsetY: -20,
    });
    slimeState.squash = 1.3; // swell outward from explosion
    slimeState.bounceVel = 2.0;
}

function updateSlime(dt) {
    const config = FORM_CONFIGS.slime;
    const sizeMult = getSlimeSizeMult();

    // === MOVEMENT (bouncy physics — screen-relative isometric input) ===
    let inputRow = 0, inputCol = 0;
    if (keys['w'] || keys['arrowup'])    { inputRow--; inputCol--; }
    if (keys['s'] || keys['arrowdown'])  { inputRow++; inputCol++; }
    if (keys['a'] || keys['arrowleft'])  { inputRow++; inputCol--; }
    if (keys['d'] || keys['arrowright']) { inputRow--; inputCol++; }
    const inputLen = Math.sqrt(inputRow * inputRow + inputCol * inputCol);
    if (inputLen > 0) { inputRow /= inputLen; inputCol /= inputLen; }

    const maxSpd = config.moveMaxSpeed * sizeMult.speed * getTalismanBonus().speedMult;

    // --- Elastic velocity (lerp toward target — gives gooey, soft acceleration) ---
    const targetVr = inputRow * maxSpd;
    const targetVc = inputCol * maxSpd;
    // Accel is faster than decel for responsive-but-squishy feel
    const hasInput = (inputRow !== 0 || inputCol !== 0);
    const resp = hasInput
        ? Math.min(1, 14 * dt)    // snappy pickup
        : Math.min(1, 8 * dt);    // slow, gooey stop (slime oozes to a halt)
    player.vx += (targetVr - player.vx) * resp;
    player.vy += (targetVc - player.vy) * resp;

    // Dead zone — snap to zero when nearly stopped
    const speed = Math.sqrt(player.vx * player.vx + player.vy * player.vy);
    if (!hasInput && speed < 0.15) { player.vx = 0; player.vy = 0; }

    if (hasInput) {
        player.state = 'walk';
        if (speed > 0.2) {
            player.dir8 = resolveDir8(player.vx, player.vy);
            player.facing = dir8ToFacing(player.dir8);
        }
        // Micro-bounce on direction change (slime jiggles when reversing)
        if (!slimeState._prevInputRow) slimeState._prevInputRow = 0;
        if (!slimeState._prevInputCol) slimeState._prevInputCol = 0;
        const dotInput = inputRow * slimeState._prevInputRow + inputCol * slimeState._prevInputCol;
        if (dotInput < -0.3 && speed > 1.0) {
            // Direction reversal — trigger a jiggle
            slimeState.bounceVel = Math.max(slimeState.bounceVel, 1.2);
            slimeState.squash = 0.88; // compressed on reversal
        }
        slimeState._prevInputRow = inputRow;
        slimeState._prevInputCol = inputCol;
    } else {
        if (speed < 0.3) player.state = 'idle';
    }

    // Clamp speed
    if (speed > maxSpd) {
        player.vx *= maxSpd / speed;
        player.vy *= maxSpd / speed;
    }

    // Move with collision (sub-step to prevent tunneling at high speed)
    const totalDr = player.vx * dt;
    const totalDc = player.vy * dt;
    const moveDist = Math.sqrt(totalDr * totalDr + totalDc * totalDc);
    const subSteps = Math.max(1, Math.ceil(moveDist / 0.4));
    const stepDr = totalDr / subSteps;
    const stepDc = totalDc / subSteps;
    for (let step = 0; step < subSteps; step++) {
        const nr = player.row + stepDr;
        const nc = player.col + stepDc;
        if (canMoveTo(nr, player.col)) player.row = nr;
        else {
            player.vx *= -0.25; // bouncy wall reflection
            slimeState.squash = 0.85; // wall-hit squish
            slimeState.bounceVel = Math.max(slimeState.bounceVel, 0.8);
            break;
        }
        if (canMoveTo(player.row, nc)) player.col = nc;
        else {
            player.vy *= -0.25;
            slimeState.squash = 0.85;
            slimeState.bounceVel = Math.max(slimeState.bounceVel, 0.8);
            break;
        }
    }

    // Facing
    if (player.vx !== 0 || player.vy !== 0) {
        player.lastHorizDir = player.vy > 0.1 ? 1 : player.vy < -0.1 ? -1 : player.lastHorizDir;
    }

    // === SPACE KEY — Bounce Jump (with input buffering) ===
    if (keys[' ']) {
        keys[' '] = false; // consume key
        if (formHandlers.slime.onDodge) {
            formHandlers.slime.onDodge();
        }
    }
    // Consume buffered dodge when cooldown expires
    if (!slimeState.bounceJumping && player.dodgeCoolTimer <= 0 && consumeBuffer('dodge')) {
        if (formHandlers.slime.onDodge) formHandlers.slime.onDodge();
    }

    // === BOUNCE VISUAL — dampened spring with visible bob ===
    const curSpd = Math.sqrt(player.vx * player.vx + player.vy * player.vy);
    const gravity = curSpd > 0.5 ? -16 : -10;
    slimeState.bounceVel += gravity * dt;
    slimeState.bounceHeight += slimeState.bounceVel;
    if (slimeState.bounceHeight <= 0) {
        slimeState.bounceHeight = 0;
        // Dampen — higher rebound while moving
        const rebound = Math.abs(slimeState.bounceVel) * 0.45;
        slimeState.bounceVel = rebound > 0.2 ? rebound : 0;
        // Walking bob — continuous soft bounce while moving
        if (curSpd > 0.5 && slimeState.bounceVel < 0.6) {
            slimeState.bounceVel = 0.6 + curSpd * 0.25;
        }
    }
    slimeState.bounceHeight = Math.min(5.0, slimeState.bounceHeight);

    // === SQUASH/STRETCH — expressive, spring-driven with recovery ===
    // Target squash based on current state
    let targetSquash = 1.0;
    if (slimeState.bounceHeight > 0.3) {
        // Airborne: stretch vertically (tall and thin)
        targetSquash = 1.0 + slimeState.bounceHeight * 0.04;
    } else if (curSpd > 1.0) {
        // Moving fast: slight forward stretch
        targetSquash = 1.0 + curSpd * 0.015;
    } else {
        // Idle: breathing wobble (visible, not imperceptible)
        const breathe = Math.sin(performance.now() / 600) * 0.06;
        const breathe2 = Math.sin(performance.now() / 370) * 0.025; // secondary wobble
        targetSquash = 1.0 + breathe + breathe2;
    }
    // Spring recovery toward target — fast snap-back from extreme squash
    const squashDiff = targetSquash - slimeState.squash;
    const squashSpring = Math.min(1, 12 * dt); // fast recovery
    slimeState.squash += squashDiff * squashSpring;
    slimeState.squash = Math.max(0.75, Math.min(1.25, slimeState.squash));

    // === BOUNCE JUMP (Space — dodge equivalent) ===
    if (slimeState.bounceJumping) {
        slimeState.bounceJumpTimer -= dt;
        const jumpT = 1 - (slimeState.bounceJumpTimer / 0.5);
        slimeState.bounceJumpHeight = Math.sin(jumpT * Math.PI) * (20 + slimeState.size * 5);
        // Move in jump direction (with wall collision + sub-stepping)
        const jumpSpd = 6 * dt;
        const jumpTotalDr = player.dodgeDirRow * jumpSpd;
        const jumpTotalDc = player.dodgeDirCol * jumpSpd;
        const jumpDist = Math.sqrt(jumpTotalDr * jumpTotalDr + jumpTotalDc * jumpTotalDc);
        const jumpSubSteps = Math.max(1, Math.ceil(jumpDist / 0.4));
        const jStepDr = jumpTotalDr / jumpSubSteps;
        const jStepDc = jumpTotalDc / jumpSubSteps;
        for (let js = 0; js < jumpSubSteps; js++) {
            const jnr = player.row + jStepDr;
            const jnc = player.col + jStepDc;
            // BUG-003 fix: check both axes independently instead of breaking on first collision
            let hitWall = false;
            if (canMoveTo(jnr, player.col)) player.row = jnr;
            else { player.dodgeDirRow *= -0.3; hitWall = true; }
            if (canMoveTo(player.row, jnc)) player.col = jnc;
            else { player.dodgeDirCol *= -0.3; hitWall = true; }
            if (hitWall) break; // stop substeps after wall contact, but both axes were checked
        }

        if (slimeState.bounceJumpTimer <= 0) {
            slimeState.bounceJumping = false;
            slimeState.bounceJumpHeight = 0;
            // Landing damage
            if (!slimeState.landingDamageDealt) {
                slimeState.landingDamageDealt = true;
                const landDmg = (8 + slimeState.size * 6) * (1 + getUpgrade('elastic_body') * 0.3);
                const landRadius = 1.2 + slimeState.size * 0.3;
                for (const e of enemies) {
                    if (e.state === 'death') continue;
                    const dist = Math.sqrt((e.row - player.row) ** 2 + (e.col - player.col) ** 2);
                    if (dist < landRadius) {
                        e.hp -= landDmg;
                        addScreenShake(3, 0.2);
                        if (e.hp <= 0) e.state = 'death';
                    }
                }
                // === STICKY LANDING upgrade — slow field on landing ===
                const stickyLvl = getUpgrade('sticky_landing');
                if (stickyLvl > 0) {
                    const slowDuration = 1.5 + stickyLvl * 0.5;
                    const slowRadius = landRadius + 0.3;
                    for (const se of enemies) {
                        if (se.state === 'death') continue;
                        const sDist = Math.sqrt((se.row - player.row) ** 2 + (se.col - player.col) ** 2);
                        if (sDist < slowRadius) {
                            se._stickySlowTimer = slowDuration;
                            se._stickySlowMult = 0.4; // 60% slow
                        }
                    }
                    // Visual — green goo puddle at landing site
                    slimeState.acidPuddles.push({
                        row: player.row, col: player.col,
                        radius: slowRadius,
                        damage: 2 * (1 + getUpgrade('acid_potency') * 0.15),
                        life: slowDuration, dmgTimer: 0,
                    });
                }

                // Landing squash effect — big flat pancake squish
                slimeState.squash = 0.65; // hard squash (wide + flat)
                slimeState.bounceVel = 1.5; // rebound bounce after landing
                addScreenShake(2 + slimeState.size, 0.3);
                // SFX — wet splat landing
                if (sfxCtx) sfxSlimeLand();
            }
        }
    }

    // === DODGE COOLDOWN (reused from wizard system) ===
    if (player.dodgeCoolTimer > 0) player.dodgeCoolTimer -= dt;

    // === ATTACK — Acid Spit (LMB) ===
    if (player.attackCooldown > 0) player.attackCooldown -= dt;
    if (!player.attacking && mouse.down && !slimeState.bounceJumping && player.attackCooldown <= 0 &&
        gamePhase === 'playing' && !menuOpen && !gamePaused) {
        player.attackCooldown = config.atkCooldown;
        player.attacking = true;
        player.attackTimer = config.atkDuration;
        player.attackFrame = 0;

        // === ATTACK SQUISH — slime compresses then snaps forward ===
        slimeState.squash = 0.78; // hard compress on spit
        slimeState.bounceVel = Math.max(slimeState.bounceVel, 1.0); // little recoil bounce

        // Spawn acid spit projectile
        const tgt = screenToTile(mouse.x, mouse.y);
        const dx = tgt.row - player.row;
        const dy = tgt.col - player.col;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const proj = getPooledProj();
        proj.row = player.row;
        proj.col = player.col;
        proj.vr = (dx / dist) * config.atkSpeed;
        proj.vc = (dy / dist) * config.atkSpeed;
        proj.life = config.projLife;
        proj.size = config.projSize + slimeState.size * 2;
        proj.damage = config.primaryDmg * getSlimeSizeMult().damage * (1 + getUpgrade('acid_potency') * 0.25);
        proj.pierce = 0;
        proj.explode = false;
        proj.bounce = 0;
        proj.isAcid = true; // flag for green rendering
        // trail ring buffer initialized by getPooledProj()
        projectiles.push(proj);
        // SFX — slime acid spit (wet splat sound)
        if (sfxCtx) sfxSlimeAcidSpit();
    }

    // Attack animation timer
    if (player.attacking) {
        player.attackTimer -= dt;
        if (player.attackTimer <= 0) {
            player.attacking = false;
        }
    }

    // === REGEN GEL upgrade ===
    const regenLevel = getUpgrade('regen_gel');
    if (regenLevel > 0) {
        const regenRate = 2 * regenLevel * slimeState.size;
        player.hp = Math.min(config.maxHp * getSlimeSizeMult().hp, player.hp + regenRate * dt);
    }

    // === ACID PUDDLES update ===
    for (let i = slimeState.acidPuddles.length - 1; i >= 0; i--) {
        const p = slimeState.acidPuddles[i];
        p.life -= dt;
        if (p.life <= 0) { slimeState.acidPuddles.splice(i, 1); continue; }
        // Damage enemies standing in puddle
        p.dmgTimer -= dt;
        if (p.dmgTimer <= 0) {
            p.dmgTimer = 0.5;
            for (const e of enemies) {
                if (e.state === 'death') continue;
                const dist = Math.sqrt((e.row - p.row) ** 2 + (e.col - p.col) ** 2);
                if (dist < p.radius + (e.def.hitboxR || 0.25)) {
                    e.hp -= p.damage;
                    if (e.hp <= 0) e.state = 'death';
                }
            }
        }
    }

    // === SPLIT CLONES update ===
    for (let i = slimeState.splitClones.length - 1; i >= 0; i--) {
        const clone = slimeState.splitClones[i];
        clone.life -= dt;
        if (clone.life <= 0) {
            slimeState.splitClones.splice(i, 1);
            // Explode on expiry — acid burst damages nearby enemies (scales with rapid_mitosis)
            const _mitoLvl = getUpgrade('rapid_mitosis');
            const burstDmg = (10 + slimeState.size * 4) * (1 + _mitoLvl * 0.3);
            const burstRadius = 1.5 + _mitoLvl * 0.15;
            let burstTotalDmg = 0;
            for (const e of enemies) {
                if (e.state === 'death') continue;
                const dist = Math.sqrt((e.row - clone.row) ** 2 + (e.col - clone.col) ** 2);
                if (dist < burstRadius) {
                    e.hp -= burstDmg;
                    burstTotalDmg += burstDmg;
                    if (e.hp <= 0) e.state = 'death';
                }
            }
            // === SYMPATHETIC LINK — heal from clone burst damage ===
            const _sympBurstLvl = getUpgrade('sympathetic_link');
            if (_sympBurstLvl > 0 && burstTotalDmg > 0) {
                const burstHeal = burstTotalDmg * 0.05 * _sympBurstLvl;
                player.hp = Math.min(FORM_CONFIGS.slime.maxHp * getSlimeSizeMult().hp, player.hp + burstHeal);
            }
            // Refund size when clone pops (reabsorbed) — matches split cost to prevent farming
            const _sizeRefund = 0.5; // exact refund of split cost (no net gain)
            slimeState.size = Math.min(slimeState.maxSize, slimeState.size + _sizeRefund);
            pickupTexts.push({
                row: clone.row, col: clone.col,
                text: `Split!`, color: '#bbdd40',
                life: 1.0, offsetY: -10,
            });
            // Spawn acid puddle where clone popped
            slimeState.acidPuddles.push({
                row: clone.row, col: clone.col,
                radius: 0.8, damage: 5 * (1 + getUpgrade('acid_potency') * 0.25), life: 3.0, dmgTimer: 0,
            });
            // Visual burst (BUG-006 fix: use pooled system)
            const popPos = tileToScreen(clone.row, clone.col);
            for (let j = 0; j < 8; j++) {
                const a = Math.random() * Math.PI * 2;
                const spd = 40 + Math.random() * 50;
                _emitParticle(
                    popPos.x + cameraX, popPos.y + cameraY,
                    Math.cos(a) * spd, Math.sin(a) * spd,
                    0.3 + Math.random() * 0.3, 2 + Math.random() * 3,
                    '#33cc55', 0.8, 'effect'
                );
            }
            pickupTexts.push({
                row: clone.row, col: clone.col,
                text: 'POP!', color: '#55cc66',
                life: 0.8, offsetY: 0,
            });
            continue;
        }
        // Clone AI: aggressively chase nearest enemy, attack with acid spit
        let nearest = null, nearDist = Infinity;
        for (const e of enemies) {
            if (e.state === 'death') continue;
            const d = Math.sqrt((e.row - clone.row) ** 2 + (e.col - clone.col) ** 2);
            if (d < nearDist) { nearDist = d; nearest = e; }
        }
        if (nearest) {
            const dx = nearest.row - clone.row;
            const dy = nearest.col - clone.col;
            const d = Math.sqrt(dx * dx + dy * dy) || 1;
            // Track clone facing direction for PV sprite rendering
            if (typeof resolveDir8 === 'function') {
                clone._dir8 = resolveDir8(dx / d, dy / d);
            }
            // Move toward enemy — with wall collision + anti-stuck
            if (nearDist > 0.7) {
                const cloneSpd = 4.0 * dt;
                const newCR = clone.row + (dx / d) * cloneSpd;
                const newCC = clone.col + (dy / d) * cloneSpd;
                let cloneMoved = false;
                if (canMoveTo(newCR, newCC)) {
                    clone.row = newCR;
                    clone.col = newCC;
                    cloneMoved = true;
                } else {
                    // Wall sliding: try each axis independently
                    if (canMoveTo(newCR, clone.col)) { clone.row = newCR; cloneMoved = true; }
                    if (canMoveTo(clone.row, newCC)) { clone.col = newCC; cloneMoved = true; }
                }
                // Anti-stuck: nudge perpendicular if completely blocked
                if (!cloneMoved) {
                    if (!clone._stuckTimer) clone._stuckTimer = 0;
                    clone._stuckTimer += dt;
                    if (clone._stuckTimer > 0.3) {
                        const nudge = 2.0 * dt;
                        const sign = (Math.floor(clone._stuckTimer * 4) % 2 === 0) ? 1 : -1;
                        const pR = clone.row + (-dy / d) * nudge * sign;
                        const pC = clone.col + (dx / d) * nudge * sign;
                        if (canMoveTo(pR, pC)) { clone.row = pR; clone.col = pC; }
                    }
                } else {
                    clone._stuckTimer = 0;
                }
            }
            // Damage scaling for clones (inherits upgrades + talisman)
            const _cloneDmgMult = getSlimeSizeMult().damage * (1 + getUpgrade('acid_potency') * 0.15);
            // Melee attack when close
            clone.atkTimer -= dt;
            if (nearDist <= 1.0 && clone.atkTimer <= 0) {
                clone.atkTimer = 0.6;
                const cloneDmg = (12 + slimeState.size * 3) * _cloneDmgMult;
                nearest.hp -= cloneDmg;
                if (nearest.hp <= 0) nearest.state = 'death';
                // === SYMPATHETIC LINK — heal player from clone melee damage ===
                const sympLvl = getUpgrade('sympathetic_link');
                if (sympLvl > 0) {
                    const healAmt = cloneDmg * 0.05 * sympLvl;
                    player.hp = Math.min(config.maxHp * getSlimeSizeMult().hp, player.hp + healAmt);
                }
            }
            // Ranged acid spit when further away
            if (!clone._spitTimer) clone._spitTimer = 1.0;
            clone._spitTimer -= dt;
            if (nearDist > 1.0 && nearDist < 6.0 && clone._spitTimer <= 0) {
                clone._spitTimer = 1.5; // spit every 1.5s
                const proj = getPooledProj();
                proj.row = clone.row;
                proj.col = clone.col;
                proj.vr = (dx / d) * 8;
                proj.vc = (dy / d) * 8;
                proj.life = 1.0;
                proj.size = 4;
                proj.damage = (8 + slimeState.size * 2) * _cloneDmgMult;
                proj.pierce = 0;
                proj.explode = false;
                proj.bounce = 0;
                proj.isAcid = true;
                // trail ring buffer initialized by getPooledProj()
                projectiles.push(proj);
            }
        } else {
            // No enemies — orbit near the player
            const dx = player.row - clone.row;
            const dy = player.col - clone.col;
            const d = Math.sqrt(dx * dx + dy * dy) || 1;
            if (d > 2.0) {
                const orbitR = clone.row + (dx / d) * 3.0 * dt;
                const orbitC = clone.col + (dy / d) * 3.0 * dt;
                if (canMoveTo(orbitR, clone.col)) clone.row = orbitR;
                if (canMoveTo(clone.row, orbitC)) clone.col = orbitC;
            }
        }
    }

    // === OOZE TRAIL upgrade ===
    if (getUpgrade('ooze_trail') > 0 && slimeState.size >= 3 && speed > 0.5) {
        // Drop acid puddle every 0.8 seconds while moving
        if (!slimeState._oozeTimer) slimeState._oozeTimer = 0;
        slimeState._oozeTimer += dt;
        if (slimeState._oozeTimer > 0.8) {
            slimeState._oozeTimer = 0;
            slimeState.acidPuddles.push({
                row: player.row, col: player.col,
                radius: 0.6 + getUpgrade('ooze_trail') * 0.3,
                damage: (3 + getUpgrade('ooze_trail') * 2) * (1 + getUpgrade('acid_potency') * 0.15),
                life: 3.0, dmgTimer: 0,
            });
        }
    }

    // === OSMOSIS upgrade — passive HP drain from nearby enemies ===
    const osmosisLvl = getUpgrade('osmosis');
    if (osmosisLvl > 0) {
        if (!slimeState._osmosisTick) slimeState._osmosisTick = 0;
        slimeState._osmosisTick += dt;
        if (slimeState._osmosisTick >= 0.5) { // tick every 0.5s
            slimeState._osmosisTick = 0;
            const osmosisRadius = 1.5 + slimeState.size * 0.3;
            const osmosisDmg = (2 + slimeState.size * 1) * osmosisLvl;
            for (const e of enemies) {
                if (e.state === 'death') continue;
                const dist = Math.sqrt((e.row - player.row) ** 2 + (e.col - player.col) ** 2);
                if (dist < osmosisRadius) {
                    e.hp -= osmosisDmg;
                    if (e.hp <= 0) e.state = 'death';
                    // Subtle green particle pulled toward player
                    const ePos = tileToScreen(e.row, e.col);
                    const pPos = tileToScreen(player.row, player.col);
                    _emitParticle(
                        ePos.x + cameraX, ePos.y + cameraY,
                        (pPos.x - ePos.x) * 1.5, (pPos.y - ePos.y) * 1.5,
                        0.3, 2, '#44dd66', 0.5, 'effect'
                    );
                }
            }
        }
    }

    // === MEMBRANE upgrade — periodic shield based on max HP ===
    const membraneLvl = getUpgrade('membrane');
    if (membraneLvl > 0) {
        if (!slimeState._membraneTimer) slimeState._membraneTimer = 0;
        slimeState._membraneTimer += dt;
        const membraneCooldown = Math.max(3, 8 - membraneLvl); // 7s / 6s / 5s
        if (slimeState._membraneTimer >= membraneCooldown) {
            slimeState._membraneTimer = 0;
            const maxHp = config.maxHp * getSlimeSizeMult().hp;
            slimeState.membraneShield = Math.round(maxHp * 0.10);
            // Visual feedback — shimmer
            pickupTexts.push({
                row: player.row, col: player.col,
                text: `+${slimeState.membraneShield} Shield`, color: '#66ccff',
                life: 0.8, offsetY: -15,
            });
        }
    }

    // === AUTO-ABSORB CORPSES (slime oozes over dead enemies naturally) ===
    if (!slimeState._absorbCooldown) slimeState._absorbCooldown = 0;
    if (slimeState._absorbCooldown > 0) slimeState._absorbCooldown -= dt;
    if (slimeState._absorbCooldown <= 0) {
        for (let i = enemies.length - 1; i >= 0; i--) {
            const e = enemies[i];
            if (e.state !== 'death' || e.deathTimer <= 0) continue;
            const dist = Math.sqrt((e.row - player.row) ** 2 + (e.col - player.col) ** 2);
            if (dist < 1.0) { // very close — slime is on top of the corpse
                slimeAbsorbEnemy(e, 4);
                slimeState._absorbCooldown = 0.3; // brief cooldown between absorbs
                break; // one absorb per frame
            }
        }
    }

    // === ABSORB HINT — one-time tutorial when a low-HP enemy is nearby ===
    if (typeof Notify !== 'undefined' && !Notify.shownHints.has('tutorial_absorb')) {
        for (let i = 0; i < enemies.length; i++) {
            const e = enemies[i];
            if (e.state === 'death') continue;
            if (e.hp > e.maxHp * 0.3) continue;
            const dist = Math.sqrt((e.row - player.row) ** 2 + (e.col - player.col) ** 2);
            if (dist < 3.0) {
                Notify.hint('tutorial_absorb', 'Press E near weakened enemies to absorb them!', 5, { color: '#88ff88', borderColor: '#448844' });
                break;
            }
        }
    }

    // === ANIMATION (smoother timing — slower cycle, speed-aware) ===
    const moveSpeed = Math.sqrt(player.vx * player.vx + player.vy * player.vy);
    const slimeAnimSpeed = player.state === 'walk'
        ? Math.max(3, Math.min(6, 6 * (moveSpeed / (config.moveMaxSpeed * sizeMult.speed))))
        : 2.5;
    player.animFrame += dt * slimeAnimSpeed;
    // Wrap animFrame to prevent unbounded growth
    const _slimeImg = slimeTintedSprites[player.attacking ? 'slime_p_attack' :
        (player.state === 'walk' ? 'slime_p_walk' : 'slime_p_idle')]
        || images[player.attacking ? 'slime_p_attack' :
        (player.state === 'walk' ? 'slime_p_walk' : 'slime_p_idle')];
    if (_slimeImg) {
        const _slimeFC = Math.floor(_slimeImg.width / 100);
        if (_slimeFC > 0) player.animFrame = player.animFrame % _slimeFC;
    }

    // === EVOLUTION CHECK ===
    checkSlimeEvolution();

    // === INVULNERABILITY TIMER (shared with wizard) ===
    if (typeof playerInvTimer !== 'undefined' && playerInvTimer > 0) {
        playerInvTimer -= dt;
    }
}

function drawSlime() {
    const pos = tileToScreen(player.row, player.col);
    const sx = pos.x + cameraX;
    const sy = pos.y + cameraY;
    const sizeMult = getSlimeSizeMult();

    // ── Scale: 1.8 base makes the ~30px sprite body render at ~54px — readable ──
    const SLIME_BASE_SCALE = 1.8;
    const slimeScale = SLIME_BASE_SCALE * sizeMult.scale;

    // During cinematic/awakening: slime coalesces from a puddle
    if ((gamePhase === 'cinematic' || gamePhase === 'awakening') && wizardRiseProgress < 1) {
        ctx.save();
        const coalesce = Math.max(0, wizardRiseProgress);
        const pudScale = 0.3 + coalesce * 0.7;
        const pudAlpha = 0.15 + coalesce * 0.85;
        ctx.globalAlpha = pudAlpha;

        const glowR = 20 + (1 - coalesce) * 15;
        const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, glowR);
        grad.addColorStop(0, `rgba(60, 180, 80, ${0.3 * (1 - coalesce)})`);
        grad.addColorStop(1, 'rgba(20, 80, 30, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.ellipse(sx, sy + 4, glowR, glowR * 0.4, 0, 0, Math.PI * 2);
        ctx.fill();

        const img = slimeTintedSprites['slime_p_idle'] || images['slime_p_idle'];
        if (img) {
            const fc = Math.floor(img.width / 100);
            const frame = Math.floor(player.animFrame) % Math.max(1, fc);
            const dw = 100 * slimeScale * pudScale;
            const dh = 100 * slimeScale * pudScale;
            ctx.translate(sx, sy);
            ctx.scale(1, 0.3 + coalesce * 0.7);
            ctx.drawImage(img, frame * 100, 0, 100, 100, -dw / 2, -dh * 0.8, dw, dh);
        }
        ctx.restore();
        return;
    }

    // ── Resolve sprite (Tiny RPG slime_p_* set) ──
    const fw = 100, fh = 100;
    let spriteKey;
    if (player.attacking) spriteKey = 'slime_p_attack';
    else if (player.state === 'walk') spriteKey = 'slime_p_walk';
    else spriteKey = 'slime_p_idle';
    if (typeof playerInvTimer !== 'undefined' && playerInvTimer > PLAYER_STATS.invTime * 0.5)
        spriteKey = 'slime_p_hurt';
    const img = slimeTintedSprites[spriteKey] || images[spriteKey];
    if (!img) return;
    const frameCount = Math.floor(img.width / fw);
    const frame = Math.floor(player.animFrame) % Math.max(1, frameCount);

    ctx.save();

    // ── Bounce / jump offsets (unchanged physics) ──
    const jumpOffset = slimeState.bounceJumping ? slimeState.bounceJumpHeight : 0;
    const bounceOffset = slimeState.bounceHeight;
    const totalAir = bounceOffset + jumpOffset;

    // ── Squash/stretch ──
    const sq = slimeState.squash;
    const drawW = Math.round(fw * slimeScale * (2 - sq));
    const drawH = Math.round(fh * slimeScale * sq);
    // Snap all screen positions to whole pixels — prevents subpixel jitter
    const pxSx = Math.round(sx);
    const pxSy = Math.round(sy);
    const drawY = Math.round(pxSy - drawH * 0.72 - bounceOffset - jumpOffset);

    // ── Ground contact shadow (simple ellipse, no sprite duplication) ──
    const shadowScale = Math.max(0.5, 1.0 - totalAir * 0.015);
    const shadowAlpha = Math.max(0.08, 0.30 - totalAir * 0.004);
    ctx.globalAlpha = shadowAlpha;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(pxSx, pxSy + 4, 18 * sizeMult.scale * shadowScale, 7 * sizeMult.scale * shadowScale, 0, 0, Math.PI * 2);
    ctx.fill();

    // ── Draw sprite ONCE — no shadow, no outline, no duplicate layers ──
    ctx.globalAlpha = 1.0;
    // Invulnerability blink (covers both damage flash and hurt state)
    if (typeof playerInvTimer !== 'undefined' && playerInvTimer > 0) {
        if (Math.sin(playerInvTimer * 20) > 0) ctx.globalAlpha = 0.35;
    }

    if (player.facing < 0) {
        ctx.save();
        ctx.translate(pxSx, drawY);
        ctx.scale(-1, 1);
        ctx.drawImage(img, frame * fw, 0, fw, fh, Math.round(-drawW / 2), 0, drawW, drawH);
        ctx.restore();
    } else {
        ctx.drawImage(img, frame * fw, 0, fw, fh, Math.round(pxSx - drawW / 2), drawY, drawW, drawH);
    }

    // ── Ooze drip particles (small green flecks, normal blend) ──
    const _slimeT = performance.now() / 1000;
    for (let _si = 0; _si < 4; _si++) {
        const _sa = _slimeT * (1.0 + _si * 0.2) + _si * 1.57;
        const _sr = (8 + Math.sin(_slimeT * 0.6 + _si * 2) * 4) * sizeMult.scale;
        const _spx = sx + Math.cos(_sa) * _sr;
        const _spy = sy - 14 * slimeScale - bounceOffset + Math.sin(_sa * 0.7) * _sr * 0.4;
        ctx.globalAlpha = 0.25 + Math.sin(_slimeT * 1.8 + _si) * 0.1;
        ctx.fillStyle = _si % 2 === 0 ? '#2a8833' : '#227728';
        ctx.beginPath();
        ctx.arc(_spx, _spy, 1.2 + Math.sin(_slimeT * 2.5 + _si) * 0.4, 0, Math.PI * 2);
        ctx.fill();
    }
    // Dripping droplet
    const dripPhase = (_slimeT * 0.7) % 1.0;
    if (dripPhase < 0.5) {
        const dripY = sy - 4 * slimeScale + dripPhase * 16 * sizeMult.scale;
        const dripX = sx + Math.sin(_slimeT * 3.1) * 5 * sizeMult.scale;
        ctx.globalAlpha = 0.3 * (1.0 - dripPhase / 0.5);
        ctx.fillStyle = '#2a8833';
        ctx.beginPath();
        ctx.arc(dripX, dripY, 1.0, 0, Math.PI * 2);
        ctx.fill();
    }

    // ── Talisman orbiting glow (if found) ──
    if (FormSystem.talisman.found) {
        ctx.save();
        const t = performance.now() / 1000;
        const orbitR = 18 * sizeMult.scale;
        const tx = sx + Math.cos(t * 2) * orbitR;
        const ty = sy - 30 * slimeScale - bounceOffset + Math.sin(t * 2) * orbitR * 0.4;
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = 0.6 + Math.sin(t * 4) * 0.2;
        const tGlow = ctx.createRadialGradient(tx, ty, 0, tx, ty, 8);
        tGlow.addColorStop(0, 'rgba(220, 180, 60, 0.8)');
        tGlow.addColorStop(0.5, 'rgba(180, 120, 30, 0.3)');
        tGlow.addColorStop(1, 'rgba(100, 60, 10, 0)');
        ctx.fillStyle = tGlow;
        ctx.fillRect(tx - 10, ty - 10, 20, 20);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = '#e8c840';
        ctx.beginPath();
        ctx.moveTo(tx, ty - 5);
        ctx.lineTo(tx + 3, ty);
        ctx.lineTo(tx, ty + 5);
        ctx.lineTo(tx - 3, ty);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }

    ctx.restore();

    // ── Acid puddles (unchanged) ──
    for (const p of slimeState.acidPuddles) {
        const pp = tileToScreen(p.row, p.col);
        const px = pp.x + cameraX;
        const py = pp.y + cameraY;
        const lifeFrac = Math.min(p.life / 3.0, 1.0);
        const rX = p.radius * 42;
        const rY = p.radius * 19;

        ctx.save();
        ctx.globalAlpha = 0.55 * lifeFrac;
        const pudGrad = ctx.createRadialGradient(px, py, 0, px, py, rX);
        pudGrad.addColorStop(0, 'rgba(80, 220, 40, 0.7)');
        pudGrad.addColorStop(0.4, 'rgba(50, 180, 30, 0.5)');
        pudGrad.addColorStop(0.75, 'rgba(30, 130, 20, 0.25)');
        pudGrad.addColorStop(1, 'rgba(20, 80, 10, 0)');
        ctx.fillStyle = pudGrad;
        ctx.beginPath();
        ctx.ellipse(px, py + 2, rX, rY, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.25 * lifeFrac;
        const glowGrad = ctx.createRadialGradient(px, py, 0, px, py, rX * 0.6);
        glowGrad.addColorStop(0, 'rgba(120, 255, 60, 0.6)');
        glowGrad.addColorStop(0.5, 'rgba(60, 200, 30, 0.2)');
        glowGrad.addColorStop(1, 'rgba(30, 120, 15, 0)');
        ctx.fillStyle = glowGrad;
        ctx.beginPath();
        ctx.ellipse(px, py + 2, rX * 0.6, rY * 0.6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    // ── Split clones ──
    for (const clone of slimeState.splitClones) {
        const cp = tileToScreen(clone.row, clone.col);
        const cx2 = cp.x + cameraX;
        const cy2 = cp.y + cameraY;
        const cImg = slimeTintedSprites['slime_p_walk'] || slimeTintedSprites['slime_p_idle']
            || images['slime_p_walk'] || images['slime_p_idle'];
        if (!cImg) continue;
        const cf = Math.floor(performance.now() / 150) % Math.max(1, Math.floor(cImg.width / 100));
        const cScale = SLIME_BASE_SCALE * 0.6;
        const cW = 100 * cScale;
        const cH = 100 * cScale;
        const cloneDrawY = cy2 - cH * 0.72;
        const cX = cx2 - cW / 2;

        // Clone sprite — single draw, slightly transparent to distinguish from player
        ctx.save();
        ctx.globalAlpha = 0.7;
        ctx.drawImage(cImg, cf * 100, 0, 100, 100, cX, cloneDrawY, cW, cH);

        // Life remaining indicator
        const lifeFrac = clone.life / (20 + getUpgrade('rapid_mitosis') * 5);
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = lifeFrac > 0.3 ? '#44cc66' : '#22ff44';
        ctx.lineWidth = lifeFrac > 0.3 ? 1.5 : 2.5;
        ctx.beginPath();
        ctx.ellipse(cx2, cy2 + 4, 10 * cScale / SLIME_BASE_SCALE, 4 * cScale / SLIME_BASE_SCALE, 0, 0, Math.PI * 2 * lifeFrac);
        ctx.stroke();
        ctx.restore();
    }
}

function drawSlimeHUD() {
    if (gamePhase !== 'playing') return;

    const barW = 180, barH = 12, gap = 5;
    const x = 28;
    const yHP = canvasH - 84;
    const ySize = yHP + barH + gap;
    const yXP = ySize + barH + gap;

    ctx.save();

    // Dark backing panel
    const panelX = x - 14, panelY = yHP - 18;
    const panelW = barW + 36;
    const panelH = (yXP + barH) - yHP + 26;
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = '#000';
    ctx.fillRect(panelX - 2, panelY - 2, panelW + 4, panelH + 4);
    ctx.globalAlpha = 0.88;
    const hudBg = ctx.createLinearGradient(panelX, panelY, panelX, panelY + panelH);
    hudBg.addColorStop(0, '#1a1010');
    hudBg.addColorStop(1, '#0a0606');
    ctx.fillStyle = hudBg;
    ctx.beginPath();
    ctx.roundRect(panelX, panelY, panelW, panelH, 4);
    ctx.fill();
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = '#803030';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(panelX, panelY, panelW, panelH, 4);
    ctx.stroke();

    // HP Bar (red for player slime)
    const _qHpSlime = (typeof questState !== 'undefined') ? (questState.permBonuses.maxHpBonus || 0) : 0;
    const maxHP = FORM_CONFIGS.slime.maxHp * getSlimeSizeMult().hp + _qHpSlime;
    player.hp = Math.min(player.hp, maxHP); // clamp HP to max
    const hpFrac = Math.max(0, Math.min(1, player.hp / maxHP));
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#0a0404';
    ctx.beginPath(); ctx.roundRect(x, yHP, barW, barH, 3); ctx.fill();
    if (hpFrac > 0) {
        ctx.globalAlpha = 0.9;
        const hpGrad = ctx.createLinearGradient(x, yHP, x, yHP + barH);
        hpGrad.addColorStop(0, '#ee4444');
        hpGrad.addColorStop(0.5, '#cc2222');
        hpGrad.addColorStop(1, '#aa1818');
        ctx.fillStyle = hpGrad;
        ctx.beginPath(); ctx.roundRect(x, yHP, Math.max(2, barW * hpFrac), barH, 3); ctx.fill();
    }
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = '#ffcccc';
    ctx.font = '9px monospace';
    ctx.textBaseline = 'middle';
    ctx.fillText(`HP ${Math.ceil(player.hp)}/${Math.ceil(maxHP)}`, x + 4, yHP + barH / 2 + 1);

    // Size Bar (yellow-green)
    const sizeFrac = slimeState.size / slimeState.maxSize;
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#0a0804';
    ctx.beginPath(); ctx.roundRect(x, ySize, barW, barH, 3); ctx.fill();
    if (sizeFrac > 0) {
        ctx.globalAlpha = 0.85;
        const sizeGrad = ctx.createLinearGradient(x, ySize, x, ySize + barH);
        sizeGrad.addColorStop(0, '#bbdd40');
        sizeGrad.addColorStop(0.5, '#99bb30');
        sizeGrad.addColorStop(1, '#779920');
        ctx.fillStyle = sizeGrad;
        ctx.beginPath(); ctx.roundRect(x, ySize, Math.max(2, barW * sizeFrac), barH, 3); ctx.fill();
    }
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = '#ddddaa';
    ctx.font = '9px monospace';
    ctx.fillText(`SIZE ${slimeState.size.toFixed(1)}/${slimeState.maxSize}`, x + 4, ySize + barH / 2 + 1);

    // XP Bar
    const xpFrac = xpState.xpToNext > 0 ? xpState.xp / xpState.xpToNext : 0;
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = '#0a0804';
    ctx.beginPath(); ctx.roundRect(x, yXP, barW, barH, 3); ctx.fill();
    if (xpFrac > 0) {
        ctx.globalAlpha = 0.7;
        const xpGrad = ctx.createLinearGradient(x, yXP, x, yXP + barH);
        xpGrad.addColorStop(0, '#ddb040');
        xpGrad.addColorStop(0.5, '#c49030');
        xpGrad.addColorStop(1, '#a07020');
        ctx.fillStyle = xpGrad;
        ctx.beginPath(); ctx.roundRect(x, yXP, Math.max(2, barW * xpFrac), barH, 3); ctx.fill();
    }
    ctx.globalAlpha = 0.65;
    ctx.fillStyle = '#ddcc88';
    ctx.font = '9px monospace';
    ctx.fillText(`Lv${xpState.level}  ${xpState.xp}/${xpState.xpToNext}`, x + 4, yXP + barH / 2 + 1);

    // Active upgrade icons
    drawActiveUpgradeIcons(x, yXP, barH);

    // Talisman indicator (top right)
    if (FormSystem.talisman.found) {
        const tX = canvasW - 60;
        const tY = 30;
        const t = performance.now() / 1000;
        ctx.globalAlpha = 0.7 + Math.sin(t * 2) * 0.15;
        ctx.fillStyle = '#e8c840';
        ctx.beginPath();
        ctx.moveTo(tX, tY - 10);
        ctx.lineTo(tX + 7, tY);
        ctx.lineTo(tX, tY + 10);
        ctx.lineTo(tX - 7, tY);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 0.4;
        ctx.font = '8px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#c4a878';
        ctx.fillText(`Lv${FormSystem.talisman.level}`, tX, tY + 20);
        ctx.textAlign = 'left';
    }

    // Form indicator
    ctx.globalAlpha = 0.3;
    ctx.font = '9px monospace';
    ctx.fillStyle = '#bb6666';
    ctx.fillText('SLIME', x, yHP - 8);

    ctx.restore();
}

// Register slime handlers
formHandlers.slime.update = function(dt) { updateSlime(dt); };
formHandlers.slime.draw = function() { drawSlime(); };
formHandlers.slime.drawHUD = function() { drawSlimeHUD(); drawObjective(); };
// Occlusion ghost — bare sprite only, no shadow/VFX
// Occlusion ghost disabled for slime — slime is low/ground-hugging and doesn't
// get occluded by tall tiles. The above-darkness ghost created a visible color
// split (bright un-darkened copy over the darkened main sprite) during movement.
// The ground marker ring (Layer 6) handles player visibility instead.
formHandlers.slime.drawGhost = function(sx, sy) { /* intentionally empty */ };

// === SLIME ABSORB (E key) ===
formHandlers.slime.onInteract = function() {
    // Priority 1: Absorb a nearby corpse (dying enemy)
    let target = null, bestDist = 2.0;
    for (const e of enemies) {
        if (e.state === 'death' && e.deathTimer > 0) {
            const dist = Math.sqrt((e.row - player.row) ** 2 + (e.col - player.col) ** 2);
            if (dist < bestDist) { bestDist = dist; target = e; }
        }
    }
    // Priority 2: Execute a low-HP enemy nearby
    if (!target) {
        bestDist = 2.0;
        for (const e of enemies) {
            if (e.state === 'death') continue;
            if (e.hp > e.maxHp * 0.3) continue; // absorb enemies below 30% HP
            const dist = Math.sqrt((e.row - player.row) ** 2 + (e.col - player.col) ** 2);
            if (dist < bestDist) { bestDist = dist; target = e; }
        }
    }
    if (target) {
        slimeAbsorbEnemy(target, 6);
    } else {
        // No absorb target — check if near a chest and show feedback
        const nearbyChest = getNearbyChest();
        if (nearbyChest) {
            pickupTexts.push({
                text: 'You lack the form to open this...',
                color: '#aa7744',
                row: nearbyChest.row, col: nearbyChest.col,
                offsetY: 0,
                life: 2.0,
            });
        }
    }
};

// === SLIME SECONDARY — Split (RMB) ===
formHandlers.slime.onSecondaryAbility = function() {
    if (slimeState.size < 2) return; // too small to split
    const maxClones = 1 + getUpgrade('hive_mind');
    if (slimeState.splitClones.length >= maxClones) return;
    const cloneLife = 20 + getUpgrade('rapid_mitosis') * 5;
    // Launch clone in the direction the player is aiming
    const tgt = screenToTile(mouse.x, mouse.y);
    const dx = tgt.row - player.row;
    const dy = tgt.col - player.col;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const launchDist = 0.8;
    slimeState.splitClones.push({
        row: player.row + (dx / d) * launchDist,
        col: player.col + (dy / d) * launchDist,
        life: cloneLife, atkTimer: 0.3, _spitTimer: 1.0,
    });
    slimeState.size = Math.max(1, slimeState.size - 0.5); // split cost
    // size cost already applied above
    addScreenShake(2, 0.15);
    // Split particles (BUG-006 fix: use pooled system)
    const splitPos = tileToScreen(player.row, player.col);
    for (let i = 0; i < 5; i++) {
        const a = Math.random() * Math.PI * 2;
        const spd = 25 + Math.random() * 35;
        _emitParticle(
            splitPos.x + cameraX, splitPos.y + cameraY,
            Math.cos(a) * spd, Math.sin(a) * spd,
            0.3 + Math.random() * 0.2, 2 + Math.random() * 2,
            '#44cc55', 0.8, 'effect'
        );
    }
};

// === SLIME DODGE — Bounce Jump (Space) ===
formHandlers.slime.onDodge = function() {
    if (slimeState.bounceJumping) return;
    if (player.dodgeCoolTimer > 0) {
        bufferInput('dodge');
        return;
    }
    slimeState.bounceJumping = true;
    slimeState.bounceJumpTimer = 0.5;
    slimeState.bounceJumpHeight = 0;
    slimeState.landingDamageDealt = false;
    player.dodgeCoolTimer = DODGE_COOLDOWN * 0.8; // slightly shorter cooldown for slime

    // === LAUNCH SQUISH — compress hard then stretch tall ===
    slimeState.squash = 0.72; // pre-jump crouch compression
    slimeState.bounceVel = 2.5; // big upward kick

    // SFX — wet bounce launch
    if (sfxCtx) sfxSlimeBounce();
    // VFX: green slime splatter ring on bounce
    const _bjPos = tileToScreen(player.row, player.col);
    const _bjpx = _bjPos.x + cameraX, _bjpy = _bjPos.y + cameraY;
    for (let _bi = 0; _bi < 6; _bi++) {
        const angle = (_bi / 6) * Math.PI * 2 + Math.random() * 0.4;
        const speed = 25 + Math.random() * 20;
        _emitParticle(_bjpx, _bjpy + 4, Math.cos(angle) * speed, Math.sin(angle) * speed * 0.5,
            0.3 + Math.random() * 0.2, 3 + Math.random() * 2, '#44cc44', 0.5, 'slimeSplat');
    }

    // Direction — movement keys take priority (screen-relative isometric), otherwise jump toward cursor
    let dr = 0, dc = 0;
    if (keys['w'] || keys['arrowup'])    { dr--; dc--; }
    if (keys['s'] || keys['arrowdown'])  { dr++; dc++; }
    if (keys['a'] || keys['arrowleft'])  { dr++; dc--; }
    if (keys['d'] || keys['arrowright']) { dr--; dc++; }
    if (dr === 0 && dc === 0) {
        // Jump toward mouse cursor when no direction keys held
        const tgt = screenToTile(mouse.x, mouse.y);
        dr = tgt.row - player.row;
        dc = tgt.col - player.col;
        if (Math.abs(dr) < 0.1 && Math.abs(dc) < 0.1) {
            dc = player.facing; // fallback if cursor is right on player
        }
    }
    const mag = Math.sqrt(dr * dr + dc * dc) || 1;
    player.dodgeDirRow = dr / mag;
    player.dodgeDirCol = dc / mag;
};

