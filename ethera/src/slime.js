// ============================================================
//  SLIME FORM — Complete mechanics
// ============================================================

// --- Pre-rendered tinted slime sprites (avoids per-frame ctx.filter) ---
const slimeTintedSprites = {};

function buildSlimeTintedSprites() {
    const spriteKeys = ['slime_p_idle', 'slime_p_walk', 'slime_p_attack', 'slime_p_hurt'];
    for (const key of spriteKeys) {
        const src = images[key];
        if (!src || src.width === 0) continue;
        const offCanvas = document.createElement('canvas');
        offCanvas.width = src.width;
        offCanvas.height = src.height;
        const offCtx = offCanvas.getContext('2d');
        offCtx.filter = 'hue-rotate(-100deg) saturate(1.3)';
        offCtx.drawImage(src, 0, 0);
        offCtx.filter = 'none';
        slimeTintedSprites[key] = offCanvas;
    }
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
};

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
    player.hp = Math.min(FORM_CONFIGS.slime.maxHp * getSlimeSizeMult().hp, player.hp + 10);
    FormSystem.formData.slime.absorbed++;
    if (slimeState.size > FormSystem.formData.slime.maxSizeReached) {
        FormSystem.formData.slime.maxSizeReached = slimeState.size;
    }
    addScreenShake(2, 0.15);
    // Absorb particles
    const absPos = tileToScreen(target.row, target.col);
    for (let j = 0; j < (particleCount || 5); j++) {
        particles.push({
            x: absPos.x + cameraX, y: absPos.y + cameraY,
            angle: Math.random() * Math.PI * 2, speed: 20 + Math.random() * 35,
            life: 0.3 + Math.random() * 0.3, maxLife: 0.6,
            size: 2 + Math.random() * 3, color: '#cc3333', drift: Math.random() * 3,
        });
    }
    pickupTexts.push({
        row: player.row, col: player.col,
        text: `+${sizeGain.toFixed(1)} Size`, color: '#bbdd40',
        life: 1.0, offsetY: 0,
    });
}

function updateSlime(dt) {
    const config = FORM_CONFIGS.slime;
    const sizeMult = getSlimeSizeMult();

    // === MOVEMENT (bouncy physics) ===
    let inputRow = 0, inputCol = 0;
    if (keys['w'] || keys['arrowup'])    inputRow -= 1;
    if (keys['s'] || keys['arrowdown'])  inputRow += 1;
    if (keys['a'] || keys['arrowleft'])  inputCol -= 1;
    if (keys['d'] || keys['arrowright']) inputCol += 1;
    if (inputRow && inputCol) {
        const diag = 1 / Math.sqrt(2);
        inputRow *= diag; inputCol *= diag;
    }

    const accel = config.moveAccel;
    const maxSpd = config.moveMaxSpeed * sizeMult.speed * getTalismanBonus().speedMult;
    const decel = config.moveDecel;

    if (inputRow || inputCol) {
        player.vx += inputRow * accel * dt;
        player.vy += inputCol * accel * dt;
        player.state = 'walk';
        // 8-direction facing
        const slimeSpd = Math.sqrt(player.vx * player.vx + player.vy * player.vy);
        if (slimeSpd > 0.2) {
            player.dir8 = resolveDir8(player.vx, player.vy);
            player.facing = dir8ToFacing(player.dir8);
        } else if (inputCol !== 0) {
            player.facing = inputCol > 0 ? 1 : -1;
        }
    } else {
        // Only switch to idle when actually stopped (prevents flicker during deceleration)
        const curSpeed = Math.sqrt(player.vx * player.vx + player.vy * player.vy);
        if (curSpeed < 0.3) {
            player.state = 'idle';
        }
    }

    // Apply deceleration
    const speed = Math.sqrt(player.vx * player.vx + player.vy * player.vy);
    if (speed > 0) {
        const dec = decel * dt;
        const newSpeed = Math.max(0, speed - dec);
        if (speed > 0.01) {
            player.vx *= newSpeed / speed;
            player.vy *= newSpeed / speed;
        } else {
            player.vx = 0; player.vy = 0;
        }
    }

    // Clamp speed
    const spd2 = Math.sqrt(player.vx * player.vx + player.vy * player.vy);
    if (spd2 > maxSpd) {
        player.vx *= maxSpd / spd2;
        player.vy *= maxSpd / spd2;
    }

    // Move with collision (sub-step to prevent tunneling at high speed)
    const hitboxR = config.hitboxRadius * sizeMult.hitbox;
    const moveStepMax = 0.4; // max tile-distance per sub-step
    const totalDr = player.vx * dt;
    const totalDc = player.vy * dt;
    const moveDist = Math.sqrt(totalDr * totalDr + totalDc * totalDc);
    const subSteps = Math.max(1, Math.ceil(moveDist / moveStepMax));
    const stepDr = totalDr / subSteps;
    const stepDc = totalDc / subSteps;
    for (let step = 0; step < subSteps; step++) {
        const nr = player.row + stepDr;
        const nc = player.col + stepDc;
        if (canMoveTo(nr, player.col)) player.row = nr;
        else { player.vx *= -0.3; break; } // bouncy wall reflection
        if (canMoveTo(player.row, nc)) player.col = nc;
        else { player.vy *= -0.3; break; }
    }

    // Facing
    if (player.vx !== 0 || player.vy !== 0) {
        player.lastHorizDir = player.vy > 0.1 ? 1 : player.vy < -0.1 ? -1 : player.lastHorizDir;
    }

    // === SPACE KEY — Bounce Jump ===
    if (keys[' ']) {
        keys[' '] = false; // consume key
        if (formHandlers.slime.onDodge) {
            formHandlers.slime.onDodge();
        }
    }

    // === BOUNCE VISUAL — dampened spring that settles + gentle breathing ===
    const gravity = speed > 0.5 ? -10 : -6;
    slimeState.bounceVel += gravity * dt;
    slimeState.bounceHeight += slimeState.bounceVel;
    if (slimeState.bounceHeight <= 0) {
        slimeState.bounceHeight = 0;
        // Dampen properly — only re-bounce if moving fast enough, otherwise settle
        const rebound = Math.abs(slimeState.bounceVel) * 0.35;
        slimeState.bounceVel = rebound > 0.15 ? rebound : 0;
        // Give a small kick when moving to keep a subtle bob while walking
        if (speed > 0.5 && slimeState.bounceVel < 0.3) {
            slimeState.bounceVel = 0.3 + speed * 0.1;
        }
    }
    slimeState.bounceHeight = Math.min(2.5, slimeState.bounceHeight);

    // Squash/stretch — subtle, driven by bounce height + breathing
    if (slimeState.bounceHeight < 0.2) {
        // Settled on ground — gentle breathing wobble
        const breathe = Math.sin(performance.now() / 800) * 0.025;
        slimeState.squash = 1.0 + breathe;
    } else {
        // In mid-bob — slight stretch when rising, squash when landing
        slimeState.squash = 0.96 + slimeState.bounceHeight * 0.012;
    }
    slimeState.squash = Math.max(0.92, Math.min(1.08, slimeState.squash));

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
            if (canMoveTo(jnr, player.col)) player.row = jnr;
            else { player.dodgeDirRow *= -0.3; break; }
            if (canMoveTo(player.row, jnc)) player.col = jnc;
            else { player.dodgeDirCol *= -0.3; break; }
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
                // Landing squash effect
                slimeState.squash = 1.4;
                addScreenShake(2 + slimeState.size, 0.3);
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
        proj.trail = [];
        projectiles.push(proj);
        // SFX
        if (sfxCtx) sfxFireballShoot(); // reuse fireball SFX for now
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
                if (dist < p.radius) {
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
            for (const e of enemies) {
                if (e.state === 'death') continue;
                const dist = Math.sqrt((e.row - clone.row) ** 2 + (e.col - clone.col) ** 2);
                if (dist < burstRadius) {
                    e.hp -= burstDmg;
                    if (e.hp <= 0) e.state = 'death';
                }
            }
            // Refund size when clone pops (reabsorbed)
            const _sizeRefund = 0.8; // full refund of split cost
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
            // Visual burst
            const popPos = tileToScreen(clone.row, clone.col);
            for (let j = 0; j < 8; j++) {
                particles.push({
                    x: popPos.x + cameraX, y: popPos.y + cameraY,
                    angle: Math.random() * Math.PI * 2, speed: 40 + Math.random() * 50,
                    life: 0.3 + Math.random() * 0.3, maxLife: 0.6,
                    size: 2 + Math.random() * 3, color: '#cc3333', drift: Math.random() * 2,
                });
            }
            pickupTexts.push({
                row: clone.row, col: clone.col,
                text: 'POP!', color: '#cc5555',
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
                proj.trail = [];
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

    // === ANIMATION (smoother timing — slower cycle, speed-aware) ===
    const moveSpeed = Math.sqrt(player.vx * player.vx + player.vy * player.vy);
    const slimeAnimSpeed = player.state === 'walk'
        ? Math.max(3, Math.min(6, 6 * (moveSpeed / (config.moveMaxSpeed * sizeMult.speed))))
        : 2.5;
    player.animFrame += dt * slimeAnimSpeed;
    // Wrap animFrame to prevent unbounded growth (legacy sprites)
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
    const scale = WIZARD_SCALE * sizeMult.scale;

    // During cinematic/awakening: slime coalesces from a puddle
    if ((gamePhase === 'cinematic' || gamePhase === 'awakening') && wizardRiseProgress < 1) {
        ctx.save();
        const coalesce = Math.max(0, wizardRiseProgress); // 0 = flat puddle, 1 = full slime
        const pudScale = 0.3 + coalesce * 0.7;
        const pudAlpha = 0.15 + coalesce * 0.85;
        ctx.globalAlpha = pudAlpha;

        // Pulsing glow puddle
        const glowR = 20 + (1 - coalesce) * 15;
        const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, glowR);
        grad.addColorStop(0, `rgba(200, 80, 80, ${0.3 * (1 - coalesce)})`);
        grad.addColorStop(1, 'rgba(100, 40, 40, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.ellipse(sx, sy + 4, glowR, glowR * 0.4, 0, 0, Math.PI * 2);
        ctx.fill();

        // Draw slime sprite scaled up from flat
        const img = slimeTintedSprites['slime_p_idle'] || images['slime_p_idle'];
        if (img) {
            const frameCount = Math.floor(img.width / 100);
            const frame = Math.floor(player.animFrame) % Math.max(1, frameCount);
            const fw = 100, fh = 100;
            const dw = fw * scale * pudScale;
            const dh = fh * scale * pudScale;
            ctx.translate(sx, sy);
            ctx.scale(1, 0.3 + coalesce * 0.7); // flatten vertically when not coalesced
            ctx.drawImage(img, frame * fw, 0, fw, fh, -dw / 2, -dh * 0.8, dw, dh);
        }
        ctx.restore();
        return;
    }

    // ── Always use red-tinted legacy slime sprites ──
    let img, fw, fh, frameCount, frame;
    let spriteKey;
    if (player.attacking) spriteKey = 'slime_p_attack';
    else if (player.state === 'walk') spriteKey = 'slime_p_walk';
    else spriteKey = 'slime_p_idle';
    if (typeof playerInvTimer !== 'undefined' && playerInvTimer > PLAYER_STATS.invTime * 0.5)
        spriteKey = 'slime_p_hurt';
    img = slimeTintedSprites[spriteKey] || images[spriteKey];
    if (!img) return;
    fw = 100; fh = 100;
    frameCount = Math.floor(img.width / fw);
    frame = Math.floor(player.animFrame) % Math.max(1, frameCount);

    const slimeScale = scale;

    ctx.save();

    // Bounce jump height offset
    const jumpOffset = slimeState.bounceJumping ? slimeState.bounceJumpHeight : 0;
    const bounceOffset = slimeState.bounceHeight;
    const baseH = fh * slimeScale;
    const drawY = sy - baseH * 0.72 - bounceOffset - jumpOffset;

    // Ground shadow
    ctx.globalAlpha = 0.25 - jumpOffset * 0.002;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(sx, sy + 4, 14 * sizeMult.scale, 5 * sizeMult.scale, 0, 0, Math.PI * 2);
    ctx.fill();

    // ── Toxic underglow (red-tinted foot aura) ──
    ctx.globalCompositeOperation = 'screen';
    const _slimeGlowPulse = 0.12 + Math.sin(player.animFrame * 2.2) * 0.05;
    ctx.globalAlpha = _slimeGlowPulse * sizeMult.scale;
    const _slimeGlowR = 22 * sizeMult.scale;
    const _slimeGlowGrad = ctx.createRadialGradient(sx, sy, 0, sx, sy, _slimeGlowR);
    _slimeGlowGrad.addColorStop(0, 'rgba(200, 80, 80, 0.45)');
    _slimeGlowGrad.addColorStop(0.5, 'rgba(160, 50, 50, 0.15)');
    _slimeGlowGrad.addColorStop(1, 'rgba(100, 30, 30, 0)');
    ctx.fillStyle = _slimeGlowGrad;
    ctx.beginPath();
    ctx.ellipse(sx, sy + 2, _slimeGlowR, _slimeGlowR * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';

    // Squash/stretch transform
    const sq = slimeState.squash;
    ctx.globalAlpha = 1.0;

    // Invulnerability flash
    if (typeof playerInvTimer !== 'undefined' && playerInvTimer > 0) {
        if (Math.sin(playerInvTimer * 20) > 0) ctx.globalAlpha = 0.4;
    }

    // Sprite dimensions with squash/stretch
    const drawW = fw * slimeScale * (2 - sq);
    const drawH = fh * slimeScale * sq;

    if (player.facing < 0) {
        ctx.translate(sx, drawY);
        ctx.scale(-1, 1);
        ctx.drawImage(img, frame * fw, 0, fw, fh, -drawW / 2, 0, drawW, drawH);
    } else {
        ctx.drawImage(img, frame * fw, 0, fw, fh, sx - drawW / 2, drawY, drawW, drawH);
    }

    // ── Toxic luminous outline (red silhouette glow) ──
    if (!slimeState.bounceJumping) {
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 0.25;
        ctx.shadowColor = 'rgba(200, 60, 50, 0.7)';
        ctx.shadowBlur = 4;
        const _slimeOutline = [[-1,0],[1,0],[0,-1],[0,1]];
        for (const [ox, oy] of _slimeOutline) {
            ctx.drawImage(img, frame * fw, 0, fw, fh, sx - drawW / 2 + ox, drawY + oy, drawW, drawH);
        }
        ctx.shadowBlur = 0;
    }

    // ── Ooze drip particles (subtle red dots orbiting the slime) ──
    const _slimeT = performance.now() / 1000;
    ctx.globalCompositeOperation = 'screen';
    for (let _si = 0; _si < 4; _si++) {
        const _sa = _slimeT * 1.5 + _si * 1.57;
        const _sr = (10 + Math.sin(_slimeT * 0.8 + _si * 2) * 6) * sizeMult.scale;
        const _spx = sx + Math.cos(_sa) * _sr;
        const _spy = sy - 12 * slimeScale + Math.sin(_sa * 0.7) * _sr * 0.5;
        ctx.globalAlpha = 0.35 + Math.sin(_slimeT * 2 + _si) * 0.15;
        ctx.fillStyle = '#cc4433';
        ctx.beginPath();
        ctx.arc(_spx, _spy, 1.2 + Math.sin(_slimeT * 2.5 + _si) * 0.5, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';

    // Talisman orbiting glow (if found) — isolated save/restore to prevent state leaks
    if (FormSystem.talisman.found) {
        ctx.save();
        const t = performance.now() / 1000;
        const orbitR = 18 * sizeMult.scale;
        const tx = sx + Math.cos(t * 2) * orbitR;
        const ty = sy - 30 * scale - bounceOffset + Math.sin(t * 2) * orbitR * 0.4;
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = 0.6 + Math.sin(t * 4) * 0.2;
        const tGlow = ctx.createRadialGradient(tx, ty, 0, tx, ty, 8);
        tGlow.addColorStop(0, `rgba(220, 180, 60, 0.8)`);
        tGlow.addColorStop(0.5, `rgba(180, 120, 30, 0.3)`);
        tGlow.addColorStop(1, 'rgba(100, 60, 10, 0)');
        ctx.fillStyle = tGlow;
        ctx.fillRect(tx - 10, ty - 10, 20, 20);
        // Talisman diamond shape
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

    // Draw acid puddles
    for (const p of slimeState.acidPuddles) {
        const pp = tileToScreen(p.row, p.col);
        const px = pp.x + cameraX;
        const py = pp.y + cameraY;
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = 0.3 * (p.life / 3.0);
        const pudGrad = ctx.createRadialGradient(px, py, 0, px, py, p.radius * 40);
        pudGrad.addColorStop(0, 'rgba(200, 60, 60, 0.5)');
        pudGrad.addColorStop(0.7, 'rgba(150, 30, 30, 0.2)');
        pudGrad.addColorStop(1, 'rgba(80, 15, 15, 0)');
        ctx.fillStyle = pudGrad;
        ctx.beginPath();
        ctx.ellipse(px, py + 2, p.radius * 40, p.radius * 18, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    // Draw split clones (with bright pulsing outline for visibility)
    for (const clone of slimeState.splitClones) {
        const cp = tileToScreen(clone.row, clone.col);
        const cx2 = cp.x + cameraX;
        const cy2 = cp.y + cameraY;
        const cImg = slimeTintedSprites['slime_p_walk'] || slimeTintedSprites['slime_p_idle']
            || images['slime_p_walk'] || images['slime_p_idle'];
        if (!cImg) continue;
        const cf = Math.floor(performance.now() / 150) % Math.max(1, Math.floor(cImg.width / 100));
        const cScale = WIZARD_SCALE * 0.7;
        const cloneDrawY = cy2 - 100 * cScale * 0.72;
        const cW = 100 * cScale;
        const cH = 100 * cScale;
        const cX = cx2 - 50 * cScale;

        // Bright glow outline (pulsing)
        ctx.save();
        const glowPulse = 0.4 + Math.sin(performance.now() / 300 + clone.life) * 0.15;
        ctx.globalAlpha = glowPulse;
        ctx.shadowColor = '#ff5555';
        ctx.shadowBlur = 10;
        ctx.drawImage(cImg, cf * 100, 0, 100, 100, cX - 1, cloneDrawY - 1, cW + 2, cH + 2);
        ctx.shadowBlur = 0;
        ctx.restore();

        // Clone sprite
        ctx.save();
        ctx.globalAlpha = 0.75;
        ctx.drawImage(cImg, cf * 100, 0, 100, 100, cX, cloneDrawY, cW, cH);

        // Life remaining indicator (fading ring under clone)
        const lifeFrac = clone.life / (20 + getUpgrade('rapid_mitosis') * 5);
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = lifeFrac > 0.3 ? '#cc4444' : '#ff2222';
        ctx.lineWidth = lifeFrac > 0.3 ? 1.5 : 2.5;
        ctx.beginPath();
        ctx.ellipse(cx2, cy2 + 4, 10 * cScale / WIZARD_SCALE, 4 * cScale / WIZARD_SCALE, 0, 0, Math.PI * 2 * lifeFrac);
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
    const maxHP = FORM_CONFIGS.slime.maxHp * getSlimeSizeMult().hp;
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
    slimeState.size = Math.max(1, slimeState.size - 0.8); // slightly lower cost
    // size cost already applied above
    addScreenShake(2, 0.15);
    // Split particles
    const splitPos = tileToScreen(player.row, player.col);
    for (let i = 0; i < 5; i++) {
        particles.push({
            x: splitPos.x + cameraX, y: splitPos.y + cameraY,
            angle: Math.random() * Math.PI * 2, speed: 25 + Math.random() * 35,
            life: 0.3 + Math.random() * 0.2, maxLife: 0.5,
            size: 2 + Math.random() * 2, color: '#cc4444', drift: Math.random() * 2,
        });
    }
};

// === SLIME DODGE — Bounce Jump (Space) ===
formHandlers.slime.onDodge = function() {
    if (slimeState.bounceJumping) return;
    if (player.dodgeCoolTimer > 0) return;
    slimeState.bounceJumping = true;
    slimeState.bounceJumpTimer = 0.5;
    slimeState.bounceJumpHeight = 0;
    slimeState.landingDamageDealt = false;
    player.dodgeCoolTimer = DODGE_COOLDOWN * 0.8; // slightly shorter cooldown for slime

    // Direction — movement keys take priority, otherwise jump toward cursor
    let dr = 0, dc = 0;
    if (keys['w'] || keys['arrowup'])    dr -= 1;
    if (keys['s'] || keys['arrowdown'])  dr += 1;
    if (keys['a'] || keys['arrowleft'])  dc -= 1;
    if (keys['d'] || keys['arrowright']) dc += 1;
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

