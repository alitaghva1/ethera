// ============================================================
//  SKELETON FORM — Complete mechanics
// ============================================================

const skeletonState = {
    stamina: 100,
    maxStamina: 100,
    staminaRegen: 15,     // per second
    staminaRegenDelay: 0.5,
    staminaDelayTimer: 0,
    boneAmmo: 6,
    maxBoneAmmo: 6,
    boneRegenTimer: 0,
    boneRegenRate: 1.0,   // seconds per bone
    shieldUp: false,
    shieldTimer: 0,
    shieldDuration: 1.8,
    shieldHP: 50,
    shieldMaxHP: 50,
    rolling: false,
    rollTimer: 0,
    rollDirRow: 0,
    rollDirCol: 0,
    boneFragments: [],    // bone pickups on ground from dead skeleton enemies
    warCryTimer: 0,
    warCryCooldown: 8,
    // Combo system — consecutive hits build momentum
    comboCount: 0,        // current combo counter
    comboTimer: 0,        // time since last hit (combo drops after 2s)
    comboDecay: 2.0,      // seconds before combo resets
    maxCombo: 15,         // cap for combo counter
};

// Reset combat-specific state (called on death or form switch)
function resetSkeletonCombat() {
    skeletonState.comboCount = 0;
    skeletonState.comboTimer = 0;
    skeletonState.rolling = false;
    skeletonState.rollTimer = 0;
    skeletonState.shieldUp = false;
    skeletonState.shieldTimer = 0;
    skeletonState.shieldHP = skeletonState.shieldMaxHP;
    skeletonState.warCryTimer = 0;
}

// Reset all skeleton form state (called on form switch)
function resetSkeletonState() {
    skeletonState.stamina = 100;
    skeletonState.staminaDelayTimer = 0;
    skeletonState.boneAmmo = skeletonState.maxBoneAmmo;
    skeletonState.boneRegenTimer = 0;
    resetSkeletonCombat();
    skeletonState.boneFragments.length = 0;
}

function updateSkeleton(dt) {
    const config = FORM_CONFIGS.skeleton;

    // === MOVEMENT ===
    let inputRow = 0, inputCol = 0;
    if (keys['w'] || keys['arrowup'])    { inputRow--; inputCol--; }
    if (keys['s'] || keys['arrowdown'])  { inputRow++; inputCol++; }
    if (keys['a'] || keys['arrowleft'])  { inputRow++; inputCol--; }
    if (keys['d'] || keys['arrowright']) { inputRow--; inputCol++; }
    const inputLen = Math.sqrt(inputRow * inputRow + inputCol * inputCol);
    if (inputLen > 0) {
        inputRow /= inputLen;
        inputCol /= inputLen;
    }

    // Rolling overrides movement
    if (skeletonState.rolling) {
        skeletonState.rollTimer -= dt;
        // Shared dodge movement with wall sliding
        const rollBlocked = dodgeMove(skeletonState.rollDirRow, skeletonState.rollDirCol, 10, dt);
        if (rollBlocked) skeletonState.rollTimer = 0; // End roll early on wall hit
        // Skull Bash upgrade: roll through enemies deals damage + builds combo
        if (getUpgrade('skull_bash') > 0) {
            for (const e of enemies) {
                if (e.state === 'death' || e._skullBashed) continue;
                const dist = Math.sqrt((e.row - player.row) ** 2 + (e.col - player.col) ** 2);
                if (dist < 0.8) {
                    e.hp -= 10 * getUpgrade('skull_bash');
                    e._skullBashed = true; // only hit once per roll
                    skeletonState.comboCount = Math.min(skeletonState.maxCombo, skeletonState.comboCount + 2);
                    skeletonState.comboTimer = 0;
                    if (e.hp <= 0) e.state = 'death';
                }
            }
        }
        if (skeletonState.rollTimer <= 0) {
            skeletonState.rolling = false;
            // Clear skull bash flags
            for (const e of enemies) e._skullBashed = false;
        }
    } else {
        if (inputRow || inputCol) {
            player.state = 'walk';
            if (inputCol !== 0) player.facing = inputCol > 0 ? 1 : -1;
        } else {
            player.state = 'idle';
        }

        // Lerp velocity toward target (snappy, responsive movement)
        const skelMaxSpd = config.moveMaxSpeed * getTalismanBonus().speedMult;
        const targetVr = inputRow * skelMaxSpd;
        const targetVc = inputCol * skelMaxSpd;
        const resp = Math.min(1, 25 * dt);
        player.vx += (targetVr - player.vx) * resp;
        player.vy += (targetVc - player.vy) * resp;
        if (Math.abs(player.vx) < 0.01 && inputRow === 0) player.vx = 0;
        if (Math.abs(player.vy) < 0.01 && inputCol === 0) player.vy = 0;

        // Move with collision and wall sliding
        const newRow = player.row + player.vx * dt;
        const newCol = player.col + player.vy * dt;
        if (canMoveTo(newRow, newCol)) {
            player.row = newRow;
            player.col = newCol;
        } else {
            if (canMoveTo(newRow, player.col)) player.row = newRow;
            else player.vx = 0;
            if (canMoveTo(player.row, newCol)) player.col = newCol;
            else player.vy = 0;
        }
    }

    // Facing (8-dir for consistency, used by ghosts)
    const skelSpd = Math.sqrt(player.vx * player.vx + player.vy * player.vy);
    if (skelSpd > 0.2) {
        player.dir8 = resolveDir8(player.vx, player.vy);
        player.facing = dir8ToFacing(player.dir8);
        player.lastHorizDir = player.facing;
    } else {
        if (player.vy > 0.1) player.lastHorizDir = 1;
        else if (player.vy < -0.1) player.lastHorizDir = -1;
        player.facing = player.lastHorizDir;
    }

    // === STAMINA ===
    if (skeletonState.staminaDelayTimer > 0) {
        skeletonState.staminaDelayTimer -= dt;
    } else {
        const regenMult = 1 + getUpgrade('quick_recovery') * 0.3;
        skeletonState.stamina = Math.min(skeletonState.maxStamina,
            skeletonState.stamina + skeletonState.staminaRegen * regenMult * dt);
    }

    // === COMBO SYSTEM ===
    // Combo decays if no hits land within the window
    if (skeletonState.comboCount > 0) {
        skeletonState.comboTimer += dt;
        const decayTime = skeletonState.comboDecay + getUpgrade('relentless') * 0.5; // Relentless extends window
        if (skeletonState.comboTimer >= decayTime) {
            skeletonState.comboCount = 0;
            skeletonState.comboTimer = 0;
        }
    }
    // Combo bonuses: +5% attack speed per stack, +10% bone regen per stack
    const comboAtkSpeedMult = Math.min(2.0, 1 + skeletonState.comboCount * 0.05);
    const comboBoneRegenMult = 1 + skeletonState.comboCount * 0.10;

    // === BONE AMMO REGEN (boosted by combo) ===
    if (skeletonState.boneAmmo < skeletonState.maxBoneAmmo) {
        skeletonState.boneRegenTimer += dt * comboBoneRegenMult;
        if (skeletonState.boneRegenTimer >= skeletonState.boneRegenRate) {
            skeletonState.boneRegenTimer = 0;
            skeletonState.boneAmmo = Math.min(skeletonState.maxBoneAmmo, skeletonState.boneAmmo + 1);
        }
    }

    // === BONE THROW ATTACK (LMB) ===
    if (player.attackCooldown > 0) player.attackCooldown -= dt * comboAtkSpeedMult; // combo speeds up cooldown
    if (mouse.down && !skeletonState.rolling && !skeletonState.shieldUp &&
        player.attackCooldown <= 0 && skeletonState.boneAmmo > 0 &&
        gamePhase === 'playing' && !menuOpen && !gamePaused) {
        player.attackCooldown = config.atkCooldown;
        player.attacking = true;
        player.attackTimer = config.atkDuration;

        const boneCount = 1 + getUpgrade('bone_barrage');
        const spread = boneCount > 1 ? 0.15 : 0;

        for (let b = 0; b < boneCount && skeletonState.boneAmmo > 0; b++) {
            skeletonState.boneAmmo--;
            const tgt = screenToTile(mouse.x, mouse.y);
            let dx = tgt.row - player.row;
            let dy = tgt.col - player.col;
            // Add spread for multiple bones
            if (boneCount > 1) {
                const angle = Math.atan2(dy, dx) + (b - (boneCount - 1) / 2) * spread;
                dx = Math.cos(angle);
                dy = Math.sin(angle);
            }
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const proj = getPooledProj();
            proj.row = player.row;
            proj.col = player.col;
            proj.vr = (dx / dist) * config.atkSpeed;
            proj.vc = (dy / dist) * config.atkSpeed;
            proj.life = config.projLife;
            proj.size = config.projSize;
            proj.damage = config.primaryDmg;
            proj.pierce = 0;
            proj.explode = false;
            proj.bounce = 1; proj.bounceLeft = 1; // bones ricochet off walls once
            proj.isBone = true;
            proj.isBoomerang = getUpgrade('bone_boomerang') > 0;
            proj.boomerangTimer = 0;
            proj.marrowLeech = getUpgrade('marrow_leech') > 0;
            // trail ring buffer initialized by getPooledProj()
            projectiles.push(proj);
        }
        if (sfxCtx) sfxFireballShoot(); // reuse fireball SFX
    }

    // Attack animation
    if (player.attacking) {
        player.attackTimer -= dt;
        if (player.attackTimer <= 0) player.attacking = false;
    }

    // === SHIELD TIMER ===
    if (skeletonState.shieldUp) {
        skeletonState.shieldTimer -= dt;
        if (skeletonState.shieldTimer <= 0) {
            skeletonState.shieldUp = false;
        }
    }

    // === DODGE COOLDOWN ===
    if (player.dodgeCoolTimer > 0) player.dodgeCoolTimer -= dt;

    // Consume buffered dodge when cooldown expires
    if (player.dodgeCoolTimer <= 0 && !skeletonState.rolling && consumeBuffer('dodge')) {
        formHandlers.skeleton.onDodge();
    }

    // === BONE FRAGMENT PICKUPS (from dead skeleton enemies) ===
    for (let i = skeletonState.boneFragments.length - 1; i >= 0; i--) {
        const f = skeletonState.boneFragments[i];
        f.life -= dt;
        if (f.life <= 0) { skeletonState.boneFragments.splice(i, 1); continue; }
        // Auto-pickup if near
        const dist = Math.sqrt((f.row - player.row) ** 2 + (f.col - player.col) ** 2);
        if (dist < 1.0) {
            skeletonState.boneFragments.splice(i, 1);
            FormSystem.formData.skeleton.bonesCollected++;
            player.hp = Math.min(config.maxHp * (1 + getUpgrade('calcium_fort') * 0.15),
                player.hp + 8);
            pickupTexts.push({
                row: player.row, col: player.col,
                text: '+8 HP (Bone)', color: '#ddddaa',
                life: 1.5, offsetY: 0,
            });
        }
    }

    // Drop bone fragments from skeleton-type enemy deaths
    for (const e of enemies) {
        if (e.state === 'death' && !e._boneDropped &&
            (e.type === 'skeleton' || e.type === 'skelarch' || e.type === 'armoredskel')) {
            e._boneDropped = true;
            if (Math.random() < 0.5) {
                skeletonState.boneFragments.push({
                    row: e.row, col: e.col,
                    life: 12, bobTime: Math.random() * 10,
                });
            }
        }
    }

    // === WAR CRY upgrade ===
    if (getUpgrade('war_cry') > 0) {
        skeletonState.warCryTimer -= dt;
        if (skeletonState.warCryTimer <= 0) {
            skeletonState.warCryTimer = skeletonState.warCryCooldown / (1 + getUpgrade('war_cry') * 0.3);
            // Stun nearby enemies briefly
            for (const e of enemies) {
                if (e.state === 'death') continue;
                const dist = Math.sqrt((e.row - player.row) ** 2 + (e.col - player.col) ** 2);
                if (dist < 3) {
                    e.stunTimer = (e.stunTimer || 0) + 1.0;
                }
            }
            addScreenShake(2, 0.2);
        }
    }

    // === BONE STORM upgrade: at 10+ combo, auto-fire bones in a circle ===
    if (getUpgrade('bone_storm') > 0 && skeletonState.comboCount >= 10) {
        if (!skeletonState._boneStormTimer) skeletonState._boneStormTimer = 0;
        skeletonState._boneStormTimer -= dt;
        if (skeletonState._boneStormTimer <= 0) {
            skeletonState._boneStormTimer = 2.0 / getUpgrade('bone_storm'); // faster with stacks
            const stormCount = 6 + getUpgrade('bone_storm') * 2;
            for (let i = 0; i < stormCount; i++) {
                const angle = (i / stormCount) * Math.PI * 2;
                const proj = getPooledProj();
                proj.row = player.row;
                proj.col = player.col;
                proj.vr = Math.cos(angle) * 7;
                proj.vc = Math.sin(angle) * 7;
                proj.life = 0.8;
                proj.size = 3;
                proj.damage = 6 + skeletonState.comboCount;
                proj.pierce = 0;
                proj.explode = false;
                proj.bounce = 0;
                proj.isBone = true;
                // trail ring buffer initialized by getPooledProj()
                projectiles.push(proj);
            }
            addScreenShake(2, 0.1);
        }
    }

    // === UNDYING RESOLVE upgrade ===
    if (getUpgrade('undying_resolve') > 0 && player.hp <= 0 && !skeletonState._undyingUsed) {
        skeletonState._undyingUsed = true;
        player.hp = 1;
        addScreenShake(6, 0.5);
        addSlowMo(0.3, 0.2);
        pickupTexts.push({
            row: player.row, col: player.col,
            text: 'UNDYING RESOLVE!', color: '#ffdd44',
            life: 2.0, offsetY: 0,
        });
    }

    // === ANIMATION (speed-aware) ===
    const skelSpeed = Math.sqrt(player.vx * player.vx + player.vy * player.vy);
    const skelAnimSpd = player.state === 'walk'
        ? Math.max(5, Math.min(12, 12 * (skelSpeed / config.moveMaxSpeed)))
        : 4;
    player.animFrame += dt * skelAnimSpd;

    // === EVOLUTION CHECK ===
    checkSkeletonEvolution();

    // === INVULNERABILITY ===
    if (playerInvTimer > 0) playerInvTimer -= dt;
}

function checkSkeletonEvolution() {
    const fd = FormSystem.formData.skeleton;
    const req = EVOLUTION_REQUIREMENTS.skeleton_to_wizard;
    // Track max combo reached
    if (skeletonState.comboCount > fd.maxComboReached) {
        fd.maxComboReached = skeletonState.comboCount;
    }
    if (fd.totalKills >= req.kills &&
        fd.shieldDamageBlocked >= req.shieldDamageBlocked &&
        fd.maxComboReached >= req.comboReached &&
        FormSystem.talisman.found &&
        FormSystem.talisman.level >= req.talismanLevel) {
        triggerEvolution('wizard');
    }
}

function drawSkeleton() {
    const pos = tileToScreen(player.row, player.col);
    const sx = pos.x + cameraX;
    const sy = pos.y + cameraY;
    const scale = 1.5;  // bigger scale — armored skeleton has small pixel content
    const fw = 100, fh = 100;
    const drawW = fw * scale;
    const drawH = fh * scale;
    const drawY = sy - fh * scale * 0.72;
    const dir = player.dir8 || 'S';
    const flipH = (dir === 'E' || dir === 'NE' || dir === 'SE');

    // --- Select sprite based on state ---
    let spriteKey, frameCount;
    if (skeletonState.shieldUp) {
        // Use spinning attack2 sheet for shield bash (looks like a whirlwind block)
        spriteKey = 'skel_p_attack2'; frameCount = 9;
    } else if (player.attacking) {
        spriteKey = 'skel_p_attack'; frameCount = 8;
    } else if (skeletonState.rolling) {
        spriteKey = 'skel_p_walk'; frameCount = 8;  // use walk for roll (crouched motion)
    } else if (player.state === 'walk') {
        spriteKey = 'skel_p_walk'; frameCount = 8;
    } else {
        spriteKey = 'skel_p_idle'; frameCount = 6;
    }
    if (playerInvTimer > PLAYER_STATS.invTime * 0.5 && !skeletonState.rolling) {
        spriteKey = 'skel_p_hurt'; frameCount = 4;
    }

    const img = images[spriteKey];
    if (!img) return;

    // Clamp frame count to actual sheet width
    const actualFC = Math.floor(img.width / fw);
    if (frameCount > actualFC) frameCount = actualFC;
    const frame = Math.floor(player.animFrame) % Math.max(1, frameCount);

    // --- Ground shadow ---
    ctx.save();
    ctx.globalAlpha = skeletonState.rolling ? 0.10 : 0.25;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(sx, sy + 4, 16, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // --- Eerie green soul glow at feet ---
    if (!skeletonState.rolling) {
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        const soulPulse = 0.08 + Math.sin(performance.now() / 400) * 0.04;
        ctx.globalAlpha = soulPulse;
        const soulGrad = ctx.createRadialGradient(sx, sy, 0, sx, sy, 20);
        soulGrad.addColorStop(0, 'rgba(80, 200, 120, 0.5)');
        soulGrad.addColorStop(0.5, 'rgba(40, 160, 80, 0.15)');
        soulGrad.addColorStop(1, 'rgba(20, 80, 40, 0)');
        ctx.fillStyle = soulGrad;
        ctx.beginPath();
        ctx.ellipse(sx, sy + 2, 20, 8, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    // --- ROLL: fast low dash with afterimage trail ---
    if (skeletonState.rolling) {
        const rollProgress = 1 - (skeletonState.rollTimer / 0.35);

        // Draw 3 afterimage ghosts trailing behind
        const rollDirX = skeletonState.rollDirCol;
        const rollDirY = skeletonState.rollDirRow;
        for (let g = 3; g >= 1; g--) {
            const ghostAlpha = (1 - rollProgress) * 0.2 * (4 - g) / 3;
            if (ghostAlpha < 0.02) continue;
            const offsetDist = g * 12;
            // Trail behind movement direction (convert row/col to screen)
            const gPos = tileToScreen(
                player.row - rollDirY * offsetDist * 0.03,
                player.col - rollDirX * offsetDist * 0.03
            );
            const gx = gPos.x + cameraX;
            const gy = gPos.y + cameraY;
            const gDrawY = gy - fh * scale * 0.72;
            ctx.save();
            ctx.globalAlpha = ghostAlpha;
            try { ctx.filter = 'brightness(1.5) saturate(0.3)'; } catch(e) {}
            if (flipH) {
                ctx.translate(gx, gDrawY);
                ctx.scale(-1, 1);
                ctx.drawImage(img, frame * fw, 0, fw, fh, -drawW / 2, 0, drawW, drawH);
            } else {
                ctx.drawImage(img, frame * fw, 0, fw, fh, gx - drawW / 2, gDrawY, drawW, drawH);
            }
            ctx.restore();
        }

        // Draw main sprite (squashed low for roll feel)
        ctx.save();
        ctx.globalAlpha = 0.85;
        const squashY = drawY + drawH * 0.15; // push down slightly
        const squashH = drawH * 0.7;  // compress vertically
        const squashW = drawW * 1.2;  // stretch horizontally
        if (flipH) {
            ctx.translate(sx, squashY);
            ctx.scale(-1, 1);
            ctx.drawImage(img, frame * fw, 0, fw, fh, -squashW / 2, 0, squashW, squashH);
        } else {
            ctx.drawImage(img, frame * fw, 0, fw, fh, sx - squashW / 2, squashY, squashW, squashH);
        }
        ctx.restore();

        // Dust puffs at feet
        ctx.save();
        for (let i = 0; i < 4; i++) {
            const pAge = (rollProgress + i * 0.12) % 1;
            ctx.globalAlpha = (1 - pAge) * 0.3;
            ctx.fillStyle = '#998866';
            const px = sx + (Math.random() - 0.5) * 20 - rollDirX * pAge * 15;
            const py = sy + (Math.random() - 0.5) * 6;
            ctx.beginPath();
            ctx.arc(px, py, 1.5 + pAge * 3, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();

    // --- SHIELD BASH: spinning attack2 animation + barrier glow ---
    } else if (skeletonState.shieldUp) {
        // Draw the spinning attack2 sprite
        ctx.save();
        ctx.globalAlpha = 1.0;
        if (playerInvTimer > 0 && Math.sin(playerInvTimer * 20) > 0) ctx.globalAlpha = 0.4;
        if (flipH) {
            ctx.translate(sx, drawY);
            ctx.scale(-1, 1);
            ctx.drawImage(img, frame * fw, 0, fw, fh, -drawW / 2, 0, drawW, drawH);
        } else {
            ctx.drawImage(img, frame * fw, 0, fw, fh, sx - drawW / 2, drawY, drawW, drawH);
        }
        ctx.restore();

        // Bone shield barrier — rotating segments
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        const t = performance.now() / 1000;
        const shieldFade = Math.min(1, skeletonState.shieldTimer / 0.3); // fade in
        const shieldEndFade = Math.min(1, skeletonState.shieldTimer / 0.5); // fade out near end
        const shieldAlpha = Math.min(shieldFade, shieldEndFade);
        // Rotating bone shield segments
        for (let i = 0; i < 6; i++) {
            const angle = t * 3 + (i / 6) * Math.PI * 2;
            const bx = sx + Math.cos(angle) * 22;
            const by = sy - 20 + Math.sin(angle) * 10;
            ctx.globalAlpha = shieldAlpha * (0.3 + Math.sin(t * 5 + i) * 0.1);
            ctx.fillStyle = '#ddd8bb';
            ctx.beginPath();
            ctx.ellipse(bx, by, 3, 1.5, angle, 0, Math.PI * 2);
            ctx.fill();
        }
        // Central glow
        ctx.globalAlpha = shieldAlpha * 0.25;
        const shieldGrad = ctx.createRadialGradient(sx, sy - 20, 5, sx, sy - 20, 28);
        shieldGrad.addColorStop(0, 'rgba(200, 220, 180, 0.4)');
        shieldGrad.addColorStop(1, 'rgba(80, 120, 60, 0)');
        ctx.fillStyle = shieldGrad;
        ctx.beginPath();
        ctx.arc(sx, sy - 20, 28, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

    // --- NORMAL: idle / walk / attack ---
    } else {
        ctx.save();
        ctx.globalAlpha = 1.0;
        if (playerInvTimer > 0 && Math.sin(playerInvTimer * 20) > 0) ctx.globalAlpha = 0.4;

        // Sprite bob while walking
        let bob = 0;
        if (player.state === 'walk') bob = Math.sin(player.animFrame * Math.PI) * 1.5;
        const bobDrawY = drawY - bob;

        if (flipH) {
            ctx.translate(sx, bobDrawY);
            ctx.scale(-1, 1);
            ctx.drawImage(img, frame * fw, 0, fw, fh, -drawW / 2, 0, drawW, drawH);
        } else {
            ctx.drawImage(img, frame * fw, 0, fw, fh, sx - drawW / 2, bobDrawY, drawW, drawH);
        }
        ctx.restore();

        // Subtle green eye glow
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = 0.15 + Math.sin(performance.now() / 300) * 0.05;
        const eyeX = sx + (flipH ? 3 : -3);
        const eyeY = drawY + drawH * 0.28;
        const eyeGrad = ctx.createRadialGradient(eyeX, eyeY, 0, eyeX, eyeY, 5);
        eyeGrad.addColorStop(0, 'rgba(100, 255, 120, 0.6)');
        eyeGrad.addColorStop(1, 'rgba(40, 120, 50, 0)');
        ctx.fillStyle = eyeGrad;
        ctx.fillRect(eyeX - 5, eyeY - 5, 10, 10);
        ctx.restore();
    }

    // --- Talisman orbiting glow ---
    if (FormSystem.talisman.found) {
        ctx.save();
        const t = performance.now() / 1000;
        const orbitR = 16;
        const tx = sx + Math.cos(t * 2.5) * orbitR;
        const ty = sy - 35 + Math.sin(t * 2.5) * orbitR * 0.4;
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = 0.5 + Math.sin(t * 4) * 0.15;
        const tGlow = ctx.createRadialGradient(tx, ty, 0, tx, ty, 7);
        tGlow.addColorStop(0, 'rgba(220, 180, 60, 0.7)');
        tGlow.addColorStop(1, 'rgba(100, 60, 10, 0)');
        ctx.fillStyle = tGlow;
        ctx.fillRect(tx - 9, ty - 9, 18, 18);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = '#e8c840';
        ctx.beginPath();
        ctx.moveTo(tx, ty - 4);
        ctx.lineTo(tx + 3, ty);
        ctx.lineTo(tx, ty + 4);
        ctx.lineTo(tx - 3, ty);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }

    // Draw bone fragment pickups
    for (const f of skeletonState.boneFragments) {
        const fp = tileToScreen(f.row, f.col);
        const fx = fp.x + cameraX;
        const fy = fp.y + cameraY;
        const bob = Math.sin(f.bobTime + performance.now() / 500) * 3;
        ctx.save();
        ctx.globalAlpha = Math.min(1, f.life / 2) * 0.8;
        ctx.fillStyle = '#ddd8cc';
        // Small bone shape
        ctx.beginPath();
        ctx.ellipse(fx, fy - 8 + bob, 4, 2, 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff8e8';
        ctx.beginPath();
        ctx.arc(fx - 3, fy - 8 + bob, 2, 0, Math.PI * 2);
        ctx.arc(fx + 3, fy - 8 + bob, 2, 0, Math.PI * 2);
        ctx.fill();
        // Subtle glow
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = 0.15;
        const bGlow = ctx.createRadialGradient(fx, fy - 8, 0, fx, fy - 8, 15);
        bGlow.addColorStop(0, 'rgba(220, 210, 180, 0.4)');
        bGlow.addColorStop(1, 'rgba(100, 90, 60, 0)');
        ctx.fillStyle = bGlow;
        ctx.fillRect(fx - 15, fy - 23 + bob, 30, 30);
        ctx.restore();
    }
}

function drawSkeletonHUD() {
    if (gamePhase !== 'playing') return;

    const barW = 180, barH = 12, gap = 5;
    const x = 28;
    const yHP = canvasH - 84;
    const yStam = yHP + barH + gap;
    const yXP = yStam + barH + gap;

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
    hudBg.addColorStop(0, '#1a1814');
    hudBg.addColorStop(1, '#0a0806');
    ctx.fillStyle = hudBg;
    ctx.beginPath(); ctx.roundRect(panelX, panelY, panelW, panelH, 4); ctx.fill();
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = '#8a8060';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(panelX, panelY, panelW, panelH, 4); ctx.stroke();

    // HP Bar (bone white)
    const maxHP = FORM_CONFIGS.skeleton.maxHp * (1 + getUpgrade('calcium_fort') * 0.15);
    const hpFrac = Math.max(0, player.hp / maxHP);
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#0a0808';
    ctx.beginPath(); ctx.roundRect(x, yHP, barW, barH, 3); ctx.fill();
    if (hpFrac > 0) {
        ctx.globalAlpha = 0.9;
        const hpGrad = ctx.createLinearGradient(x, yHP, x, yHP + barH);
        hpGrad.addColorStop(0, '#ddccaa');
        hpGrad.addColorStop(0.5, '#bbaa88');
        hpGrad.addColorStop(1, '#998866');
        ctx.fillStyle = hpGrad;
        ctx.beginPath(); ctx.roundRect(x, yHP, Math.max(2, barW * hpFrac), barH, 3); ctx.fill();
    }
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = '#ffeedd';
    ctx.font = '9px monospace';
    ctx.textBaseline = 'middle';
    ctx.fillText(`HP ${Math.ceil(player.hp)}/${Math.ceil(maxHP)}`, x + 4, yHP + barH / 2 + 1);

    // Stamina Bar (yellow-orange)
    const stamFrac = skeletonState.stamina / skeletonState.maxStamina;
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#0a0804';
    ctx.beginPath(); ctx.roundRect(x, yStam, barW, barH, 3); ctx.fill();
    if (stamFrac > 0) {
        ctx.globalAlpha = 0.85;
        const stamGrad = ctx.createLinearGradient(x, yStam, x, yStam + barH);
        stamGrad.addColorStop(0, '#eecc44');
        stamGrad.addColorStop(0.5, '#ccaa30');
        stamGrad.addColorStop(1, '#aa8820');
        ctx.fillStyle = stamGrad;
        ctx.beginPath(); ctx.roundRect(x, yStam, Math.max(2, barW * stamFrac), barH, 3); ctx.fill();
    }
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = '#ffeeaa';
    ctx.font = '9px monospace';
    ctx.fillText(`STA ${Math.ceil(skeletonState.stamina)}/${skeletonState.maxStamina}`, x + 4, yStam + barH / 2 + 1);

    // Shield HP indicator (shown when shield is active or damaged)
    if (skeletonState.shieldUp || skeletonState.shieldHP < skeletonState.shieldMaxHP) {
        const shieldFrac = Math.max(0, skeletonState.shieldHP / skeletonState.shieldMaxHP);
        const shieldBarW = 60;
        const shieldBarH = 6;
        const shieldX = x + barW - shieldBarW;
        const shieldY = yHP - 10;
        // Track
        ctx.globalAlpha = 0.4;
        ctx.fillStyle = '#0a0808';
        ctx.beginPath(); ctx.roundRect(shieldX, shieldY, shieldBarW, shieldBarH, 2); ctx.fill();
        // Fill
        if (shieldFrac > 0) {
            ctx.globalAlpha = skeletonState.shieldUp ? 0.9 : 0.5;
            const shieldGrad = ctx.createLinearGradient(shieldX, shieldY, shieldX, shieldY + shieldBarH);
            shieldGrad.addColorStop(0, '#88bbdd');
            shieldGrad.addColorStop(1, '#5588aa');
            ctx.fillStyle = shieldGrad;
            ctx.beginPath(); ctx.roundRect(shieldX, shieldY, Math.max(2, shieldBarW * shieldFrac), shieldBarH, 2); ctx.fill();
        }
        // Label
        ctx.globalAlpha = 0.6;
        ctx.font = '7px monospace';
        ctx.fillStyle = '#aaccdd';
        ctx.fillText(`SHIELD ${Math.ceil(skeletonState.shieldHP)}`, shieldX + 2, shieldY + shieldBarH / 2 + 2);
    }

    // Bone ammo indicators (small circles)
    const ammoY = yStam - 2;
    const ammoStartX = x + barW + 8;
    for (let i = 0; i < skeletonState.maxBoneAmmo; i++) {
        ctx.globalAlpha = i < skeletonState.boneAmmo ? 0.8 : 0.15;
        ctx.fillStyle = i < skeletonState.boneAmmo ? '#ddd8cc' : '#443830';
        ctx.beginPath();
        ctx.arc(ammoStartX + i * 8, ammoY, 3, 0, Math.PI * 2);
        ctx.fill();
    }

    // Combo counter (right side of HUD, only shown when active)
    if (skeletonState.comboCount > 0) {
        const comboX = x + barW + 8;
        const comboY = yHP + 2;
        const decayTime = skeletonState.comboDecay + getUpgrade('relentless') * 0.5;
        const comboFade = Math.max(0.4, 1 - skeletonState.comboTimer / decayTime);
        ctx.globalAlpha = comboFade * 0.9;
        ctx.fillStyle = skeletonState.comboCount >= 10 ? '#ff8844' : '#ddaa66';
        ctx.font = 'bold 14px monospace';
        ctx.textBaseline = 'top';
        ctx.fillText(`${skeletonState.comboCount}x`, comboX, comboY);
        ctx.globalAlpha = comboFade * 0.6;
        ctx.font = '7px monospace';
        ctx.fillText('COMBO', comboX, comboY + 15);
    }

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

    // Talisman indicator
    if (FormSystem.talisman.found) {
        const tX = canvasW - 60, tY = 30;
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
    ctx.fillStyle = '#bbaa88';
    ctx.fillText('SKELETON', x, yHP - 8);

    ctx.restore();
}

// Register skeleton handlers
formHandlers.skeleton.update = function(dt) { updateSkeleton(dt); };
formHandlers.skeleton.draw = function() { drawSkeleton(); };
formHandlers.skeleton.drawHUD = function() { drawSkeletonHUD(); drawObjective(); };
// Occlusion ghost — bare sprite only, no shadow/VFX
formHandlers.skeleton.drawGhost = function(sx, sy) {
    const fw = 100, fh = 100, skelScale = 1.5;
    let spriteKey;
    if (player.attacking) spriteKey = 'skel_p_attack';
    else if (player.state === 'walk') spriteKey = 'skel_p_walk';
    else spriteKey = 'skel_p_idle';
    if (playerInvTimer > PLAYER_STATS.invTime * 0.5) spriteKey = 'skel_p_hurt';
    const img = images[spriteKey];
    if (!img) return;
    const frameCount = Math.min(Math.floor(img.width / fw), 8);
    const frame = Math.floor(player.animFrame) % Math.max(1, frameCount);
    const dw = fw * skelScale, dh = fh * skelScale;
    const drawY = sy - fh * skelScale * 0.72;
    const dir = player.dir8 || 'S';
    const flipH = (dir === 'E' || dir === 'NE' || dir === 'SE');
    if (flipH) {
        ctx.save(); ctx.translate(sx, drawY); ctx.scale(-1, 1);
        ctx.drawImage(img, frame * fw, 0, fw, fh, -dw / 2, 0, dw, dh);
        ctx.restore();
    } else {
        ctx.drawImage(img, frame * fw, 0, fw, fh, sx - dw / 2, drawY, dw, dh);
    }
};

// Shield Bash (RMB)
formHandlers.skeleton.onSecondaryAbility = function() {
    if (skeletonState.shieldUp) return;
    if (skeletonState.stamina < 25) return;
    skeletonState.stamina -= 25;
    skeletonState.staminaDelayTimer = skeletonState.staminaRegenDelay;
    skeletonState.shieldUp = true;
    skeletonState.shieldTimer = skeletonState.shieldDuration;
    skeletonState.shieldHP = skeletonState.shieldMaxHP; // refresh shield HP
    FormSystem.formData.skeleton.shieldBashes++;
    // Visual feedback
    pickupTexts.push({
        text: 'BONE SHIELD',
        color: '#ddd8bb',
        row: player.row, col: player.col,
        offsetY: 0, life: 1.0,
    });
    // Push nearby enemies back
    for (const e of enemies) {
        if (e.state === 'death') continue;
        const dx = e.row - player.row;
        const dy = e.col - player.col;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 1.5 && dist > 0) {
            e.row += (dx / dist) * 2;
            e.col += (dy / dist) * 2;
            e.hp -= 5;
            if (e.hp <= 0) e.state = 'death';
        }
    }
    // Shrapnel Shield upgrade
    if (getUpgrade('shrapnel_shield') > 0) {
        const shrapCount = 3 + getUpgrade('shrapnel_shield') * 2;
        for (let i = 0; i < shrapCount; i++) {
            const angle = (i / shrapCount) * Math.PI * 2;
            const proj = getPooledProj();
            proj.row = player.row;
            proj.col = player.col;
            proj.vr = Math.cos(angle) * 8;
            proj.vc = Math.sin(angle) * 8;
            proj.life = 0.6;
            proj.size = 4;
            proj.damage = 8;
            proj.pierce = 0;
            proj.explode = false;
            proj.bounce = 0;
            proj.isBone = true;
            // trail ring buffer initialized by getPooledProj()
            projectiles.push(proj);
        }
    }
    addScreenShake(2, 0.15);
};

// Roll Dodge (Space) — also fires from input buffer
formHandlers.skeleton.onDodge = function() {
    if (skeletonState.rolling || skeletonState.shieldUp) return;
    if (player.dodgeCoolTimer > 0) {
        bufferInput('dodge');
        return;
    }
    skeletonState.rolling = true;
    skeletonState.rollTimer = 0.35;
    player.dodgeCoolTimer = DODGE_COOLDOWN * 0.5; // fast cooldown for agile skeleton

    let dr = 0, dc = 0;
    if (keys['w'] || keys['arrowup'])    { dr--; dc--; }
    if (keys['s'] || keys['arrowdown'])  { dr++; dc++; }
    if (keys['a'] || keys['arrowleft'])  { dr++; dc--; }
    if (keys['d'] || keys['arrowright']) { dr--; dc++; }
    if (dr === 0 && dc === 0) { dr = 0; dc = player.facing; }
    const mag = Math.sqrt(dr * dr + dc * dc) || 1;
    skeletonState.rollDirRow = dr / mag;
    skeletonState.rollDirCol = dc / mag;

    // Brief invulnerability
    playerInvTimer = 0.25;
};

// Reassemble (E key — consume bone fragments AND corpses)
formHandlers.skeleton.onInteract = function() {
    let healed = 0;
    let bonesGained = 0;

    // 1. Absorb nearby bone fragments
    for (let i = skeletonState.boneFragments.length - 1; i >= 0; i--) {
        const f = skeletonState.boneFragments[i];
        const dist = Math.sqrt((f.row - player.row) ** 2 + (f.col - player.col) ** 2);
        if (dist < 2.5) {
            skeletonState.boneFragments.splice(i, 1);
            FormSystem.formData.skeleton.bonesCollected++;
            healed += 12;
        }
    }

    // 2. Consume a nearby corpse — rip bones from the dead for HP and ammo
    let corpseTarget = null, bestDist = 2.0;
    for (const e of enemies) {
        if (e.state === 'death' && e.deathTimer > 0) {
            const dist = Math.sqrt((e.row - player.row) ** 2 + (e.col - player.col) ** 2);
            if (dist < bestDist) { bestDist = dist; corpseTarget = e; }
        }
    }
    if (corpseTarget) {
        const idx = enemies.indexOf(corpseTarget);
        if (idx !== -1) enemies.splice(idx, 1);
        healed += 15;
        bonesGained = 3; // rip bones from the corpse
        skeletonState.boneAmmo = Math.min(skeletonState.maxBoneAmmo, skeletonState.boneAmmo + bonesGained);
        // Bone-rip particle effect
        const corpPos = tileToScreen(corpseTarget.row, corpseTarget.col);
        for (let i = 0; i < 5; i++) {
            particles.push({
                x: corpPos.x + cameraX, y: corpPos.y + cameraY,
                angle: Math.random() * Math.PI * 2, speed: 25 + Math.random() * 35,
                life: 0.4 + Math.random() * 0.3, maxLife: 0.7,
                size: 2 + Math.random() * 2, color: '#ddccaa', drift: Math.random() * 3,
            });
        }
    }

    if (healed > 0 || bonesGained > 0) {
        const maxHP = FORM_CONFIGS.skeleton.maxHp * (1 + getUpgrade('calcium_fort') * 0.15) + getTalismanBonus().hpBonus;
        player.hp = Math.min(maxHP, player.hp + healed);
        let txt = `+${healed} HP`;
        if (bonesGained > 0) txt += ` +${bonesGained} Bones`;
        pickupTexts.push({
            row: player.row, col: player.col,
            text: txt, color: '#ddddcc',
            life: 1.5, offsetY: 0,
        });
        addScreenShake(1.5, 0.1);
    }
};

// ----- DUST PARTICLE SYSTEM (awakening burst) -----
function spawnDustBurst(cx, cy, count) {
    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 40 + 15;
        dustParticles.push({
            x: cx + (Math.random() - 0.5) * 10,
            y: cy + (Math.random() - 0.5) * 6,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed * 0.5 - Math.random() * 20,
            size: Math.random() * 2.5 + 1,
            life: Math.random() * 1.2 + 0.6,
            maxLife: 0,
            alpha: Math.random() * 0.4 + 0.3,
            color: Math.random() > 0.5 ? '#a0907060' : '#80706050',
        });
        dustParticles[dustParticles.length - 1].maxLife = dustParticles[dustParticles.length - 1].life;
    }
}

function updateDustParticles(dt) {
    // --- Spawn ambient particles during gameplay ---
    const baseCap = currentZone === 0 ? 45 : (currentZone >= 4 && currentZone <= 6) ? 50 : 25;
    const particleCap = Math.round(baseCap * GFX.particleMul);
    if (gamePhase === 'playing' && dustParticles.length < particleCap) {

        // ===== DARK FANTASY TOWN PARTICLES (zone 0) =====
        if (currentZone === 0) {
            const pos = tileToScreen(player.row, player.col);
            const px = pos.x + cameraX;
            const py = pos.y + cameraY;

            // Mist wisps — slow, creeping, cool-colored fog particles
            if (Math.random() < 0.14) {
                const angle = Math.random() * Math.PI * 2;
                const dist = 40 + Math.random() * 250;
                dustParticles.push({
                    x: px + Math.cos(angle) * dist,
                    y: py + Math.sin(angle) * dist * 0.5,
                    vx: (Math.random() - 0.5) * 2 + 0.5,   // slow creep
                    vy: (Math.random() - 0.5) * 0.8,        // almost stationary vertically
                    life: 8 + Math.random() * 8,
                    maxLife: 8 + Math.random() * 8,
                    size: 3 + Math.random() * 5,
                    alpha: 0.04 + Math.random() * 0.04,
                    townType: 'mist',
                });
            }
            // Ember sparks from torchlight — tiny warm motes rising from lightposts
            if (Math.random() < 0.07) {
                const sparkX = px + (Math.random() - 0.5) * 300;
                const sparkY = py + (Math.random() - 0.5) * 200 - 20;
                dustParticles.push({
                    x: sparkX, y: sparkY,
                    vx: (Math.random() - 0.5) * 6,
                    vy: -Math.random() * 12 - 4,     // rise upward
                    life: 1.5 + Math.random() * 2.5,
                    maxLife: 1.5 + Math.random() * 2.5,
                    size: 0.5 + Math.random() * 1,
                    alpha: 0.2 + Math.random() * 0.15,
                    townType: 'ember',
                });
            }
            // Ash / falling dust — grey, settling, decay
            if (Math.random() < 0.04) {
                const angle = Math.random() * Math.PI * 2;
                const dist = 60 + Math.random() * 200;
                dustParticles.push({
                    x: px + Math.cos(angle) * dist,
                    y: py + Math.sin(angle) * dist * 0.4 - 40,
                    vx: (Math.random() - 0.5) * 3,
                    vy: 0.5 + Math.random() * 1.5,   // settle downward
                    life: 4 + Math.random() * 5,
                    maxLife: 4 + Math.random() * 5,
                    size: 0.8 + Math.random() * 1.2,
                    alpha: 0.06 + Math.random() * 0.06,
                    townType: 'ash',
                });
            }
        } else if (currentZone >= 4 && currentZone <= 6) {
            // ===== HELL PARTICLES (zones 4-6) — fire embers, rising ash, heat haze =====
            const pos = tileToScreen(player.row, player.col);
            const px = pos.x + cameraX;
            const py = pos.y + cameraY;

            // Rising fire embers — bright orange/red, float upward
            if (Math.random() < 0.18) {
                const angle = Math.random() * Math.PI * 2;
                const dist = 30 + Math.random() * 280;
                dustParticles.push({
                    x: px + Math.cos(angle) * dist,
                    y: py + Math.sin(angle) * dist * 0.5 + 40,
                    vx: (Math.random() - 0.5) * 10,
                    vy: -Math.random() * 18 - 6,
                    life: 2 + Math.random() * 3,
                    maxLife: 2 + Math.random() * 3,
                    size: 0.6 + Math.random() * 1.4,
                    alpha: 0.25 + Math.random() * 0.2,
                    townType: 'ember',
                });
            }
            // Drifting ash — grey/red, slow settling
            if (Math.random() < 0.06) {
                const angle = Math.random() * Math.PI * 2;
                const dist = 60 + Math.random() * 220;
                dustParticles.push({
                    x: px + Math.cos(angle) * dist,
                    y: py + Math.sin(angle) * dist * 0.4 - 30,
                    vx: (Math.random() - 0.5) * 4,
                    vy: 0.3 + Math.random() * 1.2,
                    life: 5 + Math.random() * 6,
                    maxLife: 5 + Math.random() * 6,
                    size: 1 + Math.random() * 1.5,
                    alpha: 0.06 + Math.random() * 0.05,
                    townType: 'hellAsh',
                });
            }
            // Heat shimmer — large faint distortion blobs
            if (Math.random() < 0.03) {
                dustParticles.push({
                    x: px + (Math.random() - 0.5) * 400,
                    y: py + (Math.random() - 0.5) * 200 + 20,
                    vx: (Math.random() - 0.5) * 2,
                    vy: -Math.random() * 3 - 1,
                    life: 3 + Math.random() * 4,
                    maxLife: 3 + Math.random() * 4,
                    size: 4 + Math.random() * 6,
                    alpha: 0.02 + Math.random() * 0.02,
                    townType: 'hellHaze',
                });
            }
        } else {
            // ===== DUNGEON PARTICLES (zones 1-3) =====
            // Sparse dust motes in lit area around player
            if (Math.random() < 0.08) { // ~5 per second
                const angle = Math.random() * Math.PI * 2;
                const dist = 50 + Math.random() * 200;
                const pos = tileToScreen(player.row, player.col);
                const px = pos.x + cameraX + Math.cos(angle) * dist;
                const py = pos.y + cameraY + Math.sin(angle) * dist * 0.5;
                dustParticles.push({
                    x: px, y: py,
                    vx: (Math.random() - 0.5) * 8,
                    vy: -Math.random() * 6 - 2,
                    life: 3 + Math.random() * 4,
                    maxLife: 3 + Math.random() * 4,
                    size: 0.8 + Math.random() * 1.2,
                    alpha: 0.15 + Math.random() * 0.15,
                });
            }
            // Ember sparks near enemies (combat atmosphere)
            if (enemies.length > 0 && Math.random() < 0.04) {
                const e = enemies[Math.floor(Math.random() * enemies.length)];
                if (e.state !== 'death') {
                    const epos = tileToScreen(e.row, e.col);
                    dustParticles.push({
                        x: epos.x + cameraX + (Math.random() - 0.5) * 30,
                        y: epos.y + cameraY - Math.random() * 20,
                        vx: (Math.random() - 0.5) * 15,
                        vy: -Math.random() * 20 - 8,
                        life: 0.8 + Math.random() * 1.5,
                        maxLife: 0.8 + Math.random() * 1.5,
                        size: 0.5 + Math.random() * 0.8,
                        alpha: 0.3 + Math.random() * 0.2,
                        isEmber: true,
                    });
                }
            }
        }
    }

    for (let i = dustParticles.length - 1; i >= 0; i--) {
        const d = dustParticles[i];
        d.life -= dt;
        if (d.life <= 0) { dustParticles.splice(i, 1); continue; }
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        // Town mist creeps slowly, no gravity
        if (d.townType === 'mist') {
            d.x += Math.sin(d.life * 0.3) * 2 * dt; // gentle wave
        } else if (d.townType === 'ember') {
            d.vy -= 5 * dt;       // embers float up, decelerating
            d.vx += (Math.random() - 0.5) * 8 * dt; // flutter
        } else if (d.townType === 'hellAsh') {
            d.x += Math.sin(d.life * 0.4) * 2 * dt;   // slow drift
        } else if (d.townType === 'hellHaze') {
            d.x += Math.sin(d.life * 0.2) * 3 * dt;   // shimmer wave
            d.vy -= 0.5 * dt;                           // slowly rise
        } else if (d.townType === 'ash') {
            d.x += Math.sin(d.life * 0.5) * 1.5 * dt; // gentle sway
        } else {
            d.vy += 30 * dt; // gravity (dungeon only)
        }
        d.vx *= 0.97;     // air resistance
    }

    // Hard cap to prevent frame drops during intense combat
    if (dustParticles.length > 80) {
        dustParticles.splice(0, dustParticles.length - 80);
    }
}

function drawDustParticles() {
    if (dustParticles.length === 0) return;
    ctx.save();
    for (const d of dustParticles) {
        const lifeFrac = d.life / d.maxLife;
        ctx.globalAlpha = d.alpha * lifeFrac;

        if (d.townType === 'mist') {
            // Cool grey-blue fog wisps — multiply to darken
            ctx.globalCompositeOperation = 'multiply';
            ctx.globalAlpha = d.alpha * lifeFrac;
            ctx.fillStyle = `rgba(100, 100, 115, 1)`;
            ctx.beginPath();
            ctx.arc(d.x + cameraX, d.y + cameraY, d.size * (0.7 + lifeFrac * 0.3), 0, Math.PI * 2);
            ctx.fill();
            ctx.globalCompositeOperation = 'source-over';
            continue;
        } else if (d.townType === 'ember') {
            // Warm orange ember spark — screen/additive
            ctx.globalCompositeOperation = 'screen';
            ctx.fillStyle = `rgba(255, ${150 + Math.random() * 60}, 50, ${d.alpha * lifeFrac})`;
            ctx.beginPath();
            ctx.arc(d.x + cameraX, d.y + cameraY, d.size * (0.4 + lifeFrac * 0.6), 0, Math.PI * 2);
            ctx.fill();
            ctx.globalCompositeOperation = 'source-over';
            continue;
        } else if (d.townType === 'hellAsh') {
            // Red-grey settling ash
            ctx.fillStyle = `rgba(140, 80, 60, ${d.alpha * lifeFrac})`;
            ctx.beginPath();
            ctx.arc(d.x + cameraX, d.y + cameraY, d.size * (0.6 + lifeFrac * 0.4), 0, Math.PI * 2);
            ctx.fill();
            continue;
        } else if (d.townType === 'hellHaze') {
            // Faint red heat shimmer — screen blend
            ctx.globalCompositeOperation = 'screen';
            ctx.fillStyle = `rgba(120, 30, 10, ${d.alpha * lifeFrac})`;
            ctx.beginPath();
            ctx.arc(d.x + cameraX, d.y + cameraY, d.size * (0.5 + lifeFrac * 0.5), 0, Math.PI * 2);
            ctx.fill();
            ctx.globalCompositeOperation = 'source-over';
            continue;
        } else if (d.townType === 'ash') {
            // Grey settling ash
            ctx.fillStyle = `rgba(90, 85, 80, ${d.alpha * lifeFrac})`;
        } else if (d.isEmber) {
            ctx.fillStyle = `rgba(255, ${120 + Math.random() * 80}, 40, ${d.alpha * lifeFrac})`;
        } else {
            ctx.fillStyle = `rgba(160, 140, 110, ${d.alpha * lifeFrac})`;
        }

        ctx.beginPath();
        ctx.arc(d.x + cameraX, d.y + cameraY, d.size * (0.5 + lifeFrac * 0.5), 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}

// ----- CINEMATIC NARRATIVE TEXT (canvas-rendered) -----
const CINEMATIC_LINES = [
    'You awaken on cold stone.',
    'Darkness presses in from every side.',
    'They left you for dead.',
    'They were wrong.'
];
const CINEMATIC_LINE_TIMINGS = [0.3, 1.2, 2.4, 8.0]; // when each line starts fading in (tightened)
//  Phase 1: lines 0-1 fade at 3.8, leaving "left you for dead" alone
//  Phase 2: "left you for dead" fades at 5.0, screen goes dark
//  Phase 3: ~1s empty beat, then "They were wrong" at 8.0
const CINEMATIC_01_FADE_OUT = 3.8;     // lines 0-1 begin fading
const CINEMATIC_2_FADE_OUT = 5.0;      // "left you for dead" begins fading (alone moment: 4.0-5.0)
const CINEMATIC_TEXT_FADE_OUT = 9.5;    // "They were wrong" begins fading
const CINEMATIC_PAN_DURATION = 8.0;     // camera reaches wizard (was 12.5 — tighter)
const CINEMATIC_RISE_START = 9.5;       // wizard begins stirring (synced with text fade)
const CINEMATIC_RISE_DURATION = 2.2;    // how long the rise takes (slightly snappier)
const CINEMATIC_LIGHT_SWELL_START = 10.5; // light begins expanding
const CINEMATIC_TOTAL = 13.0;          // total cinematic length (was 16.5)
let cinematicFlashAlpha = 0;         // screen flash on transition
// --- Cinematic SFX flags (prevent repeat triggers) ---
let cinematicSFX_heartbeat = false;
let cinematicSFX_stir = false;
let cinematicSFX_stand = false;
let cinematicSFX_ducked = false;
let cinematicSFX_unducked = false;
// --- Cinematic screen shake tracking ---
let cinematicShakeTriggered = false;

function drawCinematicText() {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const cx = canvasW / 2;
    const baseY = canvasH * 0.35;
    const t = cinematicTimer;

    // --- Lines 0-2: stacked narrative, muted tones ---
    for (let i = 0; i < 3; i++) {
        if (cinematicTextAlpha[i] <= 0.01) continue;
        const a = cinematicTextAlpha[i];
        const fadeAge = Math.max(0, t - CINEMATIC_LINE_TIMINGS[i]);
        const drift = Math.min(6, fadeAge * 2);

        if (i === 2) {
            ctx.font = '19px Georgia, serif';
            ctx.fillStyle = `rgba(195, 170, 135, ${a})`;
            ctx.shadowColor = `rgba(195, 170, 135, ${a * 0.4})`;
            ctx.shadowBlur = 14;
        } else {
            ctx.font = '18px Georgia, serif';
            ctx.fillStyle = `rgba(170, 155, 130, ${a * 0.9})`;
            ctx.shadowColor = `rgba(170, 155, 130, ${a * 0.3})`;
            ctx.shadowBlur = 12;
        }
        const lineY = baseY + i * 34 - drift;
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
        ctx.shadowBlur = 6;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;
        ctx.fillText(CINEMATIC_LINES[i], cx, lineY);
        ctx.restore();
        if (i === 2) {
            ctx.save();
            ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
            ctx.shadowBlur = 6;
            ctx.shadowOffsetX = 2;
            ctx.shadowOffsetY = 2;
            ctx.fillText(CINEMATIC_LINES[i], cx, lineY);
            ctx.restore();
        }
    }

    // --- "They were wrong." — alone, centered, defiant ---
    if (cinematicTextAlpha[3] > 0.01) {
        const a = cinematicTextAlpha[3];
        const fadeAge = Math.max(0, t - CINEMATIC_LINE_TIMINGS[3]);

        // Positioned at true screen center — isolated, not stacked
        const lineY = canvasH * 0.44;

        // Smooth scale: starts slightly large (1.08x), settles to 1.0x — feels like it lands
        const scaleT = Math.min(1, fadeAge / 2.0);
        const scaleEase = 1 - Math.pow(1 - scaleT, 2.5);
        const scale = 1.08 - 0.08 * scaleEase;
        const size = Math.round(28 * scale);

        ctx.font = `italic ${size}px Georgia, serif`;

        // Glow bloom builds with alpha — starts invisible, grows warm
        const glowRamp = Math.min(1, fadeAge / 1.5);
        const glow = a * glowRamp;

        // Pass 1: outer halo (wide, faint)
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
        ctx.shadowBlur = 6;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;
        ctx.shadowColor = `rgba(200, 155, 70, ${glow * 0.18})`;
        ctx.shadowBlur = 55;
        ctx.fillStyle = `rgba(230, 205, 155, ${a * 0.3})`;
        ctx.fillText(CINEMATIC_LINES[3], cx, lineY);
        ctx.restore();

        // Pass 2: mid glow
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
        ctx.shadowBlur = 6;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;
        ctx.shadowColor = `rgba(225, 180, 90, ${glow * 0.45})`;
        ctx.shadowBlur = 25;
        ctx.fillStyle = `rgba(235, 212, 165, ${a * 0.6})`;
        ctx.fillText(CINEMATIC_LINES[3], cx, lineY);
        ctx.restore();

        // Pass 3: crisp text on top
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
        ctx.shadowBlur = 6;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;
        ctx.shadowColor = `rgba(240, 200, 110, ${glow * 0.7})`;
        ctx.shadowBlur = 12;
        ctx.fillStyle = `rgba(240, 220, 175, ${a})`;
        ctx.fillText(CINEMATIC_LINES[3], cx, lineY);
        ctx.restore();

        // Thin underline accent that fades in with the text
        if (a > 0.15) {
            const lineW = ctx.measureText(CINEMATIC_LINES[3]).width;
            const underT = Math.min(1, Math.max(0, (fadeAge - 0.8) / 1.0));
            const underEase = 1 - Math.pow(1 - underT, 3);
            const halfW = (lineW * 0.5) * underEase;
            if (halfW > 2) {
                ctx.globalAlpha = a * 0.25 * underEase;
                ctx.strokeStyle = '#cc9944';
                ctx.lineWidth = 0.8;
                ctx.beginPath();
                ctx.moveTo(cx - halfW, lineY + size * 0.55);
                ctx.lineTo(cx + halfW, lineY + size * 0.55);
                ctx.stroke();
                ctx.globalAlpha = 1;
            }
        }
    }

    // Screen flash overlay (on transition to gameplay)
    if (cinematicFlashAlpha > 0) {
        ctx.globalAlpha = cinematicFlashAlpha;
        ctx.fillStyle = 'rgba(220, 190, 130, 1)';
        ctx.globalCompositeOperation = 'screen';
        ctx.fillRect(0, 0, canvasW, canvasH);
    }

    ctx.restore();
}

// drawDarkness() moved to rendering.js — it's a core rendering function, not skeleton-specific

