// ============================================================
//  LICH FORM — Complete mechanics
// ============================================================

const lichState = {
    soulEnergy: 0,
    maxSoulEnergy: 100,
    soulRegen: 3.0,       // passive soul regen per second (nerfed from 5.0 — Lich was 2.8x stronger than other forms)
    undeadMinions: [],    // raised undead allies
    maxMinions: 2,
    shadowStepCooldown: 0,
    lifeTapCooldown: 0,
    hoverOffset: 0,       // floating animation
    hoverTime: 0,
    deathAuraTimer: 0,
    spectralCloakTimer: 0,
    _phylacteryUsed: false,
    corpseLocations: [],  // track where enemies died for soul harvest
    // Harvest Chain — consecutive harvests within a window multiply gains
    harvestChain: 0,
    harvestChainTimer: 0,
    harvestChainDecay: 5.0,
    maxHarvestChain: 8,
};

// Reset all lich form state (called on form switch to clean up minions, corpses, etc.)
function resetLichState() {
    lichState.soulEnergy = 0;
    lichState.undeadMinions.length = 0;
    lichState.shadowStepCooldown = 0;
    lichState.lifeTapCooldown = 0;
    lichState.hoverOffset = 0;
    lichState.hoverTime = 0;
    lichState.deathAuraTimer = 0;
    lichState.spectralCloakTimer = 0;
    lichState._phylacteryUsed = false;
    lichState.corpseLocations.length = 0;
    lichState.harvestChain = 0;
    lichState.harvestChainTimer = 0;
}

function updateLich(dt) {
    if (gameDead) return;
    if (typeof wave !== 'undefined' && wave.phase === 'victory') return;

    // Harvest Chain decay — drop 1 stack per second after decay window expires
    lichState.harvestChainTimer += dt;
    if (lichState.harvestChainTimer > lichState.harvestChainDecay && lichState.harvestChain > 0) {
        lichState.harvestChain = Math.max(0, Math.floor(lichState.harvestChain) - 1);
        lichState.harvestChainTimer = lichState.harvestChainDecay - 0.5; // re-check in 0.5s
    }

    const config = FORM_CONFIGS.lich;

    // Recalculate equipment bonuses only when dirty (same as wizard in movement.js)
    if (equipBonusDirty && typeof getEquipBonuses === 'function') {
        equipBonus = getEquipBonuses();
        equipBonusDirty = false;
    }

    // === MOVEMENT (lerp-based, matches wizard responsiveness) ===
    let inputRow = 0, inputCol = 0;
    if (keys['w'] || keys['arrowup'])    { inputRow--; inputCol--; }
    if (keys['s'] || keys['arrowdown'])  { inputRow++; inputCol++; }
    if (keys['a'] || keys['arrowleft'])  { inputRow++; inputCol--; }
    if (keys['d'] || keys['arrowright']) { inputRow--; inputCol++; }
    const inputLen = Math.sqrt(inputRow * inputRow + inputCol * inputCol);
    if (inputLen > 0) { inputRow /= inputLen; inputCol /= inputLen; }

    if (inputLen > 0) {
        player.state = 'walk';
    } else {
        player.state = 'idle';
    }

    // Lerp velocity toward target (snappy, responsive movement)
    const lichMaxSpd = config.moveMaxSpeed * getTalismanBonus().speedMult;
    const targetVr = inputRow * lichMaxSpd;
    const targetVc = inputCol * lichMaxSpd;
    const resp = Math.min(1, 25 * dt);
    player.vx += (targetVr - player.vx) * resp;
    player.vy += (targetVc - player.vy) * resp;
    if (Math.abs(player.vx) < 0.01 && inputRow === 0) player.vx = 0;
    if (Math.abs(player.vy) < 0.01 && inputCol === 0) player.vy = 0;

    // Move with collision + wall sliding
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

    // 8-direction facing
    const lichSpd = Math.sqrt(player.vx * player.vx + player.vy * player.vy);
    if (lichSpd > 0.2) {
        player.dir8 = resolveDir8(player.vx, player.vy);
        player.facing = dir8ToFacing(player.dir8);
    }

    // Hover animation
    lichState.hoverTime += dt;
    lichState.hoverOffset = Math.sin(lichState.hoverTime * 2.5) * 6;

    // === SOUL BOLT ATTACK (LMB) ===
    if (player.attackCooldown > 0) player.attackCooldown -= dt;
    const hasDarkPact = getUpgrade('dark_pact') > 0;
    const baseSoulCost = 3;  // ALL lich bolts cost soul energy — creates resource tension
    const darkPactCost = hasDarkPact ? 5 : baseSoulCost; // Dark Pact costs more but deals +50%
    // Lich must manage soul energy: kills generate it, attacks spend it
    const canAttack = lichState.soulEnergy >= darkPactCost;
    if (mouse.down && player.attackCooldown <= 0 && canAttack &&
        gamePhase === 'playing' && !menuOpen && !gamePaused) {
        player.attackCooldown = config.atkCooldown;
        player.attacking = true;
        player.attackTimer = config.atkDuration;
        lichState.soulEnergy -= darkPactCost;
        lichState.soulEnergy = Math.max(0, lichState.soulEnergy);

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
        proj.size = config.projSize;
        proj.damage = config.primaryDmg * (hasDarkPact ? 1.5 : 1.0);
        proj.pierce = 2; // soul bolts innately pierce
        proj.explode = getUpgrade('necrotic_blast') > 0;
        proj.bounce = 0;
        proj.isDark = true; // dark magic rendering
        // trail ring buffer initialized by getPooledProj()
        projectiles.push(proj);
        if (sfxCtx) sfxLichSoulBolt(); // dedicated lich soul bolt SFX
    }

    if (player.attacking) {
        player.attackTimer -= dt;
        if (player.attackTimer <= 0) player.attacking = false;
    }

    // === SOUL ENERGY from kills ===
    // Track enemy deaths for soul energy and corpse locations
    for (const e of enemies) {
        if (e.state === 'death' && !e._soulHarvested) {
            e._soulHarvested = true;
            const soulGain = (ENEMY_XP[e.type] || 5) * 0.5 * (1 + getUpgrade('soul_siphon') * 0.3);
            lichState.soulEnergy = Math.min(lichState.maxSoulEnergy, lichState.soulEnergy + soulGain);
            FormSystem.formData.lich.totalKills++;
            // Track corpse for soul harvest
            lichState.corpseLocations.push({
                row: e.row, col: e.col, life: 15, soulValue: soulGain * 2,
            });
        }
    }

    // Decay old corpse locations
    for (let i = lichState.corpseLocations.length - 1; i >= 0; i--) {
        lichState.corpseLocations[i].life -= dt;
        if (lichState.corpseLocations[i].life <= 0) lichState.corpseLocations.splice(i, 1);
    }

    // === SHADOW STEP COOLDOWN ===
    if (lichState.shadowStepCooldown > 0) lichState.shadowStepCooldown -= dt;
    if (player.dodgeCoolTimer > 0) player.dodgeCoolTimer -= dt;

    // Consume buffered dodge when cooldown expires
    if (lichState.shadowStepCooldown <= 0 && player.dodgeCoolTimer <= 0 && consumeBuffer('dodge')) {
        formHandlers.lich.onDodge();
    }

    // === LIFE TAP COOLDOWN ===
    if (lichState.lifeTapCooldown > 0) lichState.lifeTapCooldown -= dt;

    // === PASSIVE SOUL REGEN (scales with equipment mana regen bonuses) ===
    const soulRegenRate = lichState.soulRegen;
    const soulRegenMult = 1 + (equipBonus.manaRegenMult || 0);
    lichState.soulEnergy = Math.min(lichState.maxSoulEnergy, lichState.soulEnergy + soulRegenRate * soulRegenMult * dt);

    // === SOUL OVERFLOW: excess soul energy above 80% → HP regen ===
    if (getUpgrade('soul_overflow') > 0 && lichState.soulEnergy >= lichState.maxSoulEnergy * 0.8) {
        const overflowRegen = 2 * getUpgrade('soul_overflow') * dt; // 2 HP/s per stack
        const _lichQHp = (typeof questState !== 'undefined') ? (questState.permBonuses.maxHpBonus || 0) : 0;
        const _lichEffMaxHp = config.maxHp + (typeof getTalismanBonus === 'function' ? getTalismanBonus().hpBonus : 0) + (typeof equipBonus !== 'undefined' ? (equipBonus.maxHpBonus || 0) : 0) + _lichQHp;
        player.hp = Math.min(_lichEffMaxHp, player.hp + overflowRegen);
    }

    // === SPECTRAL CLOAK (invisibility after shadow step) ===
    if (lichState.spectralCloakTimer > 0) lichState.spectralCloakTimer -= dt;

    // === DEATH AURA upgrade ===
    if (getUpgrade('death_aura') > 0) {
        lichState.deathAuraTimer -= dt;
        if (lichState.deathAuraTimer <= 0) {
            lichState.deathAuraTimer = 0.5;
            const auraDmg = 3 * getUpgrade('death_aura') * (1 + lichState.soulEnergy * 0.01);
            for (const e of enemies) {
                if (e.state === 'death') continue;
                const dist = Math.sqrt((e.row - player.row) ** 2 + (e.col - player.col) ** 2);
                if (dist < 2.5) {
                    e.hp -= auraDmg;
                    if (e.hp <= 0) e.state = 'death';
                    // Death Shroud synergy: aura also slows enemies (shadow element for root reaction)
                    if (typeof hasSynergy === 'function' && hasSynergy('death_shroud')) {
                        e.slowTimer = Math.max(e.slowTimer || 0, 0.6);
                        if (typeof applyStatusEffect === 'function') applyStatusEffect(e, 'slow', 0.6, 'shadow');
                    }
                }
            }
        }
    }

    // === UNDEAD MINIONS update ===
    const maxMin = lichState.maxMinions + getUpgrade('army_dead');
    for (let i = lichState.undeadMinions.length - 1; i >= 0; i--) {
        const m = lichState.undeadMinions[i];
        m.life -= dt;
        if (m.life <= 0) {
            // Plague Bearer upgrade: minions explode on death
            if (getUpgrade('plague_bearer') > 0) {
                const plagueDmg = 15 * getUpgrade('plague_bearer');
                for (const e of enemies) {
                    if (e.state === 'death') continue;
                    const eDist = Math.sqrt((e.row - m.row) ** 2 + (e.col - m.col) ** 2);
                    if (eDist < 2.0) {
                        e.hp -= plagueDmg;
                        if (e.hp <= 0) e.state = 'death';
                    }
                }
                addScreenShake(3, 0.12);
            }
            lichState.undeadMinions.splice(i, 1); continue;
        }
        // AI: improved minion behavior
        // 1. Prioritize the enemy closest to the player (bodyguard behavior)
        // 2. If no enemies nearby, orbit around the player
        let target = null, bestScore = -Infinity;
        for (const e of enemies) {
            if (e.state === 'death') continue;
            const dToMinion = Math.sqrt((e.row - m.row) ** 2 + (e.col - m.col) ** 2);
            const dToPlayer = Math.sqrt((e.row - player.row) ** 2 + (e.col - player.col) ** 2);
            // Score: prefer enemies close to player (threats), then close to minion
            const score = 20 - dToPlayer * 3 - dToMinion;
            // Bonus for enemies targeting player (within aggro range)
            const threatBonus = dToPlayer < 3 ? 10 : 0;
            if (score + threatBonus > bestScore) {
                bestScore = score + threatBonus;
                target = e;
            }
        }
        const targetDist = target ? Math.sqrt((target.row - m.row) ** 2 + (target.col - m.col) ** 2) : Infinity;

        if (target && targetDist > 0.7) {
            // Chase target — intercept between player and threat
            const dx = target.row - m.row;
            const dy = target.col - m.col;
            const d = Math.sqrt(dx * dx + dy * dy) || 1;
            const minionSpeed = 3.5; // slightly faster than before
            const mNewRow = m.row + (dx / d) * minionSpeed * dt;
            const mNewCol = m.col + (dy / d) * minionSpeed * dt;
            // Collision check with wall sliding (BUG-001 fix)
            if (canMoveTo(mNewRow, mNewCol)) {
                m.row = mNewRow;
                m.col = mNewCol;
            } else {
                if (canMoveTo(mNewRow, m.col)) m.row = mNewRow;
                if (canMoveTo(m.row, mNewCol)) m.col = mNewCol;
            }
        } else if (target && targetDist <= 0.7) {
            // Attack
            m.atkTimer -= dt;
            if (m.atkTimer <= 0) {
                m.atkTimer = 0.6; // slightly faster attack rate
                const minionDmg = 12 + getUpgrade('army_dead') * 4; // scale with upgrade
                target.hp -= minionDmg;
                if (target.hp <= 0) target.state = 'death';
                // Small hit particles
                spawnParticle(target.row, target.col, (Math.random()-0.5)*2, -1, 0.2, '#bb66ff', 0.6);
            }
        } else {
            // No enemies — orbit around the player at ~1.5 tile distance
            const orbitAngle = (performance.now() / 1000 * 1.5) + i * (Math.PI * 2 / maxMin);
            const orbitR = 1.5;
            const goalRow = player.row + Math.cos(orbitAngle) * orbitR;
            const goalCol = player.col + Math.sin(orbitAngle) * orbitR;
            const gx = goalRow - m.row;
            const gy = goalCol - m.col;
            const gd = Math.sqrt(gx * gx + gy * gy) || 1;
            if (gd > 0.3) {
                const oNewRow = m.row + (gx / gd) * 2.5 * dt;
                const oNewCol = m.col + (gy / gd) * 2.5 * dt;
                // Collision check for orbit movement (BUG-001 fix)
                if (canMoveTo(oNewRow, oNewCol)) {
                    m.row = oNewRow;
                    m.col = oNewCol;
                } else {
                    if (canMoveTo(oNewRow, m.col)) m.row = oNewRow;
                    if (canMoveTo(m.row, oNewCol)) m.col = oNewCol;
                }
            }
        }
    }

    // === PHYLACTERY upgrade ===
    if (getUpgrade('phylactery') > 0 && player.hp <= 0 && !lichState._phylacteryUsed) {
        lichState._phylacteryUsed = true;
        player.hp = config.maxHp * 0.3;
        lichState.soulEnergy = lichState.maxSoulEnergy * 0.5;
        addScreenShake(8, 0.6);
        addSlowMo(0.4, 0.2);
        pickupTexts.push({
            row: player.row, col: player.col,
            text: 'PHYLACTERY ACTIVATED!', color: '#bb44ff',
            life: 2.5, offsetY: 0,
        });
    }

    // === ANIMATION ===
    player.animFrame += dt * (player.state === 'walk' ? 6 : 3);

    // === INVULNERABILITY ===
    if (playerInvTimer > 0) playerInvTimer -= dt;
}

// Helper: resolve PV 8-directional lich sprite
function _getLichPVSprite(animType) {
    const dir = player.dir8 || 'S';
    const pvKey = `pv_lich_${animType}_${dir}`;
    const img = images[pvKey];
    if (!img) return null;
    return { img, fw: PV_LICH_FW, fh: PV_LICH_FH, frameCount: (PV_LICH_ANIMS[animType] || PV_LICH_ANIMS.idle).frames };
}

function drawLich() {
    const pos = tileToScreen(player.row, player.col);
    const sx = pos.x + cameraX;
    const sy = pos.y + cameraY - lichState.hoverOffset; // floating
    const dir = player.dir8 || 'S';

    // --- Resolve PV 8-directional sprite (preferred) or legacy fallback ---
    const animType = (player.state === 'walk') ? 'walk' : 'idle';
    const pvData = _getLichPVSprite(animType);

    let img, fw, fh, frameCount, flipH, lichScale;
    if (pvData) {
        img = pvData.img;
        fw = pvData.fw;
        fh = pvData.fh;
        frameCount = pvData.frameCount;
        flipH = false; // PV sprites have direction baked in
        lichScale = PV_LICH_SCALE;
    } else {
        // Legacy fallback
        let spriteKey;
        if (player.attacking) spriteKey = 'lich_p_attack';
        else if (player.state === 'walk') spriteKey = 'lich_p_walk';
        else spriteKey = 'lich_p_idle';
        if (playerInvTimer > PLAYER_STATS.invTime * 0.5) spriteKey = 'lich_p_hurt';
        img = images[spriteKey];
        if (!img) return;
        fw = 160; fh = 128;
        frameCount = Math.floor(img.width / fw);
        flipH = (dir === 'E' || dir === 'NE' || dir === 'SE');
        lichScale = 1.50;
    }

    const frame = Math.floor(player.animFrame) % Math.max(1, frameCount);

    ctx.save();

    const t = performance.now() / 1000;

    // Dark crimson-purple aura (matches necromancer's red orb)
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.12 + Math.sin(t * 2.5) * 0.06;
    const darkAuraGrad = ctx.createRadialGradient(sx, sy - 10, 0, sx, sy - 10, 60);
    darkAuraGrad.addColorStop(0, 'rgba(160, 30, 60, 0.25)');
    darkAuraGrad.addColorStop(0.5, 'rgba(100, 20, 80, 0.10)');
    darkAuraGrad.addColorStop(1, 'rgba(40, 10, 50, 0)');
    ctx.fillStyle = darkAuraGrad;
    ctx.beginPath();
    ctx.arc(sx, sy - 10, 60, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';

    // Ground shadow
    const groundY = pos.y + cameraY + 4;
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = '#1a0011';
    ctx.beginPath();
    ctx.ellipse(pos.x + cameraX, groundY, 22, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    // Death aura ring
    if (getUpgrade('death_aura') > 0) {
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = 0.08 + Math.sin(t * 3) * 0.04;
        const auraGrad = ctx.createRadialGradient(sx, sy + 20, 0, sx, sy + 20, 80);
        auraGrad.addColorStop(0, 'rgba(120, 40, 180, 0.3)');
        auraGrad.addColorStop(0.7, 'rgba(80, 20, 140, 0.1)');
        auraGrad.addColorStop(1, 'rgba(40, 10, 80, 0)');
        ctx.fillStyle = auraGrad;
        ctx.beginPath();
        ctx.ellipse(sx, sy + 20, 80, 35, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
    }

    // Spectral cloak
    if (lichState.spectralCloakTimer > 0) {
        ctx.globalAlpha = 0.15;
    } else {
        ctx.globalAlpha = 1.0;
        if (playerInvTimer > 0 && Math.sin(playerInvTimer * 20) > 0) ctx.globalAlpha = 0.4;
    }

    const drawW = fw * lichScale;
    const drawH = fh * lichScale;
    // PV sprites: content in top 70% of frame, use 0.72 anchor (same as wizard/skeleton)
    // Legacy sprites: different frame layout, use 0.89
    const drawY = sy - drawH * (pvData ? 0.72 : 0.89);

    // Draw necromancer sprite (flip horizontally for E/NE/SE directions)
    if (flipH) {
        ctx.save();
        ctx.translate(sx, drawY);
        ctx.scale(-1, 1);
        ctx.drawImage(img, frame * fw, 0, fw, fh, -drawW / 2, 0, drawW, drawH);
        ctx.restore();
    } else {
        ctx.drawImage(img, frame * fw, 0, fw, fh, sx - drawW / 2, drawY, drawW, drawH);
    }

    // Red orb glow (matches necromancer staff)
    ctx.globalCompositeOperation = 'screen';
    const orbOffX = flipH ? 12 : -12;
    const orbY = drawY + drawH * 0.22;
    ctx.globalAlpha = 0.3 + Math.sin(t * 3) * 0.1;
    const orbGlow = ctx.createRadialGradient(sx + orbOffX, orbY, 0, sx + orbOffX, orbY, 14);
    orbGlow.addColorStop(0, 'rgba(220, 40, 40, 0.5)');
    orbGlow.addColorStop(0.5, 'rgba(160, 20, 60, 0.2)');
    orbGlow.addColorStop(1, 'rgba(80, 10, 30, 0)');
    ctx.fillStyle = orbGlow;
    ctx.beginPath();
    ctx.arc(sx + orbOffX, orbY, 14, 0, Math.PI * 2);
    ctx.fill();

    // Dark motes drifting upward (subtle, ominous)
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 5; i++) {
        const pa = t * 0.8 + i * 1.256;
        const pr = 18 + Math.sin(t * 0.5 + i * 2) * 8;
        const px = sx + Math.cos(pa) * pr;
        const py = sy - 20 + Math.sin(pa * 0.6) * pr * 0.4 - (t * 8 + i * 20) % 40;
        const particleAlpha = 0.4 + Math.sin(t * 2 + i) * 0.2;
        ctx.globalAlpha = particleAlpha * 0.35;
        ctx.fillStyle = '#aa2244';
        ctx.beginPath();
        ctx.arc(px, py, 1.2 + Math.sin(t * 2 + i) * 0.5, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';

    // Talisman (now cracked open, larger glow)
    if (FormSystem.talisman.found) {
        ctx.globalCompositeOperation = 'screen';
        const orbitR = 22;
        const tx = sx + Math.cos(t * 1.8) * orbitR;
        const ty = sy - 40 + Math.sin(t * 1.8) * orbitR * 0.4;
        ctx.globalAlpha = 0.7 + Math.sin(t * 3) * 0.2;
        const tGlow = ctx.createRadialGradient(tx, ty, 0, tx, ty, 12);
        tGlow.addColorStop(0, 'rgba(180, 60, 255, 0.7)');
        tGlow.addColorStop(0.5, 'rgba(140, 40, 200, 0.3)');
        tGlow.addColorStop(1, 'rgba(80, 20, 140, 0)');
        ctx.fillStyle = tGlow;
        ctx.beginPath();
        ctx.arc(tx, ty, 14, 0, Math.PI * 2);
        ctx.fill();
        // Cracked talisman diamond (purple now)
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = '#bb66ff';
        ctx.beginPath();
        ctx.moveTo(tx, ty - 6);
        ctx.lineTo(tx + 4, ty);
        ctx.lineTo(tx, ty + 6);
        ctx.lineTo(tx - 4, ty);
        ctx.closePath();
        ctx.fill();
        // Crack line
        ctx.strokeStyle = '#220044';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(tx - 2, ty - 4);
        ctx.lineTo(tx + 1, ty + 3);
        ctx.stroke();
    }

    ctx.restore();

    // Draw undead minions
    for (const m of lichState.undeadMinions) {
        const mp = tileToScreen(m.row, m.col);
        const mx = mp.x + cameraX;
        const my = mp.y + cameraY;
        const mImg = images['skel_p_walk'] || images['enemy_skel_walk'];
        if (!mImg) continue;
        ctx.save();
        ctx.globalAlpha = 0.5;
        // Dark tint
        const mf = Math.floor(performance.now() / 200) % Math.floor(mImg.width / 100);
        const mScale = WIZARD_SCALE * 0.85;
        ctx.drawImage(mImg, mf * 100, 0, 100, 100,
            mx - 50 * mScale, my - 65 * mScale, 100 * mScale, 100 * mScale);
        // Purple glow under minion
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = 0.15;
        const mGlow = ctx.createRadialGradient(mx, my, 0, mx, my, 20);
        mGlow.addColorStop(0, 'rgba(140, 60, 200, 0.4)');
        mGlow.addColorStop(1, 'rgba(80, 20, 140, 0)');
        ctx.fillStyle = mGlow;
        ctx.beginPath();
        ctx.arc(mx, my, 20, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    // Draw corpse locations (subtle dark wisps)
    for (const c of lichState.corpseLocations) {
        const cp = tileToScreen(c.row, c.col);
        const cx2 = cp.x + cameraX;
        const cy2 = cp.y + cameraY;
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = 0.1 * (c.life / 15);
        const cGlow = ctx.createRadialGradient(cx2, cy2, 0, cx2, cy2, 15);
        cGlow.addColorStop(0, 'rgba(120, 40, 200, 0.3)');
        cGlow.addColorStop(1, 'rgba(60, 20, 100, 0)');
        ctx.fillStyle = cGlow;
        ctx.beginPath();
        ctx.arc(cx2, cy2, 15, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

function drawLichHUD() {
    if (gamePhase !== 'playing') return;

    const barW = 180, barH = 12, gap = 5;
    const minionRowH = 16;          // dedicated minion row height
    const x = 28;
    const yHP = canvasH - 100;      // shifted up to make room
    const ySoul = yHP + barH + gap;
    const yMinion = ySoul + barH + gap;          // dedicated minion row
    const yXP = yMinion + minionRowH + gap;

    ctx.save();

    // Dark backing panel (dark purple theme)
    const panelX = x - 14, panelY = yHP - 18;
    const panelW = barW + 36;
    const panelH = (yXP + barH) - yHP + 26;
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = '#000';
    ctx.fillRect(panelX - 2, panelY - 2, panelW + 4, panelH + 4);
    ctx.globalAlpha = 0.88;
    const hudBg = ctx.createLinearGradient(panelX, panelY, panelX, panelY + panelH);
    hudBg.addColorStop(0, '#14101a');
    hudBg.addColorStop(1, '#08060a');
    ctx.fillStyle = hudBg;
    ctx.beginPath(); ctx.roundRect(panelX, panelY, panelW, panelH, 4); ctx.fill();
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = '#6644aa';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(panelX, panelY, panelW, panelH, 4); ctx.stroke();

    // HP Bar (dark red/purple)
    const _qHpLich = (typeof questState !== 'undefined') ? (questState.permBonuses.maxHpBonus || 0) : 0;
    const lichMaxHp = FORM_CONFIGS.lich.maxHp + getTalismanBonus().hpBonus + (equipBonus.maxHpBonus || 0) + _qHpLich;
    const hpFrac = (lichMaxHp > 0) ? Math.max(0, player.hp / lichMaxHp) : 0;
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#0a0408';
    ctx.beginPath(); ctx.roundRect(x, yHP, barW, barH, 3); ctx.fill();
    if (hpFrac > 0) {
        ctx.globalAlpha = 0.9;
        const hpGrad = ctx.createLinearGradient(x, yHP, x, yHP + barH);
        hpGrad.addColorStop(0, '#aa3388');
        hpGrad.addColorStop(0.5, '#882266');
        hpGrad.addColorStop(1, '#661155');
        ctx.fillStyle = hpGrad;
        ctx.beginPath(); ctx.roundRect(x, yHP, Math.max(2, barW * hpFrac), barH, 3); ctx.fill();
    }
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = '#eeccee';
    ctx.font = '11px monospace';
    ctx.textBaseline = 'middle';
    ctx.fillText(`HP ${Math.ceil(player.hp)}/${Math.round(lichMaxHp)}`, x + 4, yHP + barH / 2 + 1);

    // Soul Energy Bar (purple, drains)
    const soulFrac = (lichState.maxSoulEnergy > 0) ? lichState.soulEnergy / lichState.maxSoulEnergy : 0;
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#04040a';
    ctx.beginPath(); ctx.roundRect(x, ySoul, barW, barH, 3); ctx.fill();
    if (soulFrac > 0) {
        ctx.globalAlpha = 0.9;
        const soulGrad = ctx.createLinearGradient(x, ySoul, x, ySoul + barH);
        soulGrad.addColorStop(0, '#9944ee');
        soulGrad.addColorStop(0.5, '#7722cc');
        soulGrad.addColorStop(1, '#5511aa');
        ctx.fillStyle = soulGrad;
        ctx.beginPath(); ctx.roundRect(x, ySoul, Math.max(2, barW * soulFrac), barH, 3); ctx.fill();
        // Pulse effect when low
        if (soulFrac < 0.25) {
            const pulse = Math.sin(performance.now() / 200) * 0.15;
            ctx.globalAlpha = pulse;
            ctx.fillStyle = '#cc66ff';
            ctx.beginPath(); ctx.roundRect(x, ySoul, Math.max(2, barW * soulFrac), barH, 3); ctx.fill();
        }
    }
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = '#ddaaff';
    ctx.font = '11px monospace';
    ctx.fillText(`SOUL ${Math.ceil(lichState.soulEnergy)}/${lichState.maxSoulEnergy}`, x + 4, ySoul + barH / 2 + 1);

    // === Minion Row (dedicated section) ===
    const minionCount = lichState.undeadMinions.length;
    const maxMin = lichState.maxMinions + getUpgrade('army_dead');

    // Subtle separator line above minion row
    ctx.globalAlpha = 0.15;
    ctx.strokeStyle = '#7755bb';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, yMinion - 1);
    ctx.lineTo(x + barW, yMinion - 1);
    ctx.stroke();

    // Minion label
    ctx.globalAlpha = 0.7;
    ctx.font = '11px monospace';
    ctx.fillStyle = '#bb99dd';
    ctx.textBaseline = 'middle';
    ctx.fillText('MINIONS', x + 2, yMinion + minionRowH / 2);

    // Minion skull icons — one per slot, filled = active, hollow = empty
    const iconStart = x + 58;
    const iconGap = 14;
    for (let i = 0; i < maxMin; i++) {
        const ix = iconStart + i * iconGap;
        const iy = yMinion + minionRowH / 2;
        if (i < minionCount) {
            // Filled skull — active minion
            ctx.globalAlpha = 0.85;
            ctx.fillStyle = '#cc88ff';
            ctx.beginPath();
            ctx.arc(ix, iy - 2, 4, 0, Math.PI * 2);
            ctx.fill();
            // Jaw
            ctx.fillRect(ix - 2.5, iy + 1, 5, 2);
            // Eyes
            ctx.fillStyle = '#2a0044';
            ctx.fillRect(ix - 2, iy - 3.5, 1.5, 1.5);
            ctx.fillRect(ix + 0.5, iy - 3.5, 1.5, 1.5);
        } else {
            // Empty slot — dim outline
            ctx.globalAlpha = 0.25;
            ctx.strokeStyle = '#9966cc';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(ix, iy - 2, 4, 0, Math.PI * 2);
            ctx.stroke();
            ctx.strokeRect(ix - 2.5, iy + 1, 5, 2);
        }
    }

    // Count text to the right of icons
    ctx.globalAlpha = 0.6;
    ctx.font = '8px monospace';
    ctx.fillStyle = '#9977cc';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${minionCount}/${maxMin}`, iconStart + maxMin * iconGap + 4, yMinion + minionRowH / 2);

    // XP Bar
    const xpFrac = xpState.xpToNext > 0 ? xpState.xp / xpState.xpToNext : 0;
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = '#0a0804';
    ctx.beginPath(); ctx.roundRect(x, yXP, barW, barH, 3); ctx.fill();
    if (xpFrac > 0) {
        ctx.globalAlpha = 0.7;
        const xpGrad = ctx.createLinearGradient(x, yXP, x, yXP + barH);
        xpGrad.addColorStop(0, '#bb80dd');
        xpGrad.addColorStop(0.5, '#9960bb');
        xpGrad.addColorStop(1, '#774499');
        ctx.fillStyle = xpGrad;
        ctx.beginPath(); ctx.roundRect(x, yXP, Math.max(2, barW * xpFrac), barH, 3); ctx.fill();
    }
    ctx.globalAlpha = 0.65;
    ctx.fillStyle = '#ccaaee';
    ctx.font = '11px monospace';
    ctx.textBaseline = 'middle';
    ctx.fillText(`Lv${xpState.level}  ${xpState.xp}/${xpState.xpToNext}`, x + 4, yXP + barH / 2 + 1);

    // Active upgrade icons
    drawActiveUpgradeIcons(x, yXP, barH);

    // Talisman (cracked, purple)
    if (FormSystem.talisman.found) {
        const tX = canvasW - 60, tY = 30;
        const t = performance.now() / 1000;
        ctx.globalAlpha = 0.7 + Math.sin(t * 2) * 0.15;
        ctx.fillStyle = '#bb66ff';
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
        ctx.fillStyle = '#aa88cc';
        ctx.fillText(`Lv${FormSystem.talisman.level}`, tX, tY + 20);
        ctx.textAlign = 'left';
    }

    // Form indicator
    ctx.globalAlpha = 0.3;
    ctx.font = '11px monospace';
    ctx.fillStyle = '#9966cc';
    ctx.fillText('LICH', x, yHP - 8);

    ctx.restore();
}

// Register lich handlers
formHandlers.lich.update = function(dt) { updateLich(dt); };
formHandlers.lich.draw = function() { drawLich(); };
formHandlers.lich.drawHUD = function() { drawLichHUD(); drawObjective(); };
// Occlusion ghost — bare sprite only, no shadow/VFX
formHandlers.lich.drawGhost = function(sx, sy) {
    // BUGFIX (v1.17.4): same fix as skeleton — main drawLich prefers the PV
    // 8-directional sheet, so this ghost pass must too. Otherwise the ghost
    // draws the legacy sheet at 40% alpha on top of the PV main sprite and
    // we see two mismatched lich bodies overlaid.
    const animType = (player.state === 'walk') ? 'walk' : 'idle';
    const pvData = (typeof _getLichPVSprite === 'function') ? _getLichPVSprite(animType) : null;

    let img, fw, fh, frameCount, flipH, lichScale;
    if (pvData) {
        img = pvData.img;
        fw = pvData.fw;
        fh = pvData.fh;
        frameCount = pvData.frameCount;
        flipH = false; // PV sheet bakes in direction
        lichScale = (typeof PV_LICH_SCALE !== 'undefined') ? PV_LICH_SCALE : 1.5;
    } else {
        // Fallback: legacy sprites (matches drawLich's fallback path).
        const dir = player.dir8 || 'S';
        let spriteKey = player.attacking ? 'lich_p_attack' : (player.state === 'walk' ? 'lich_p_walk' : 'lich_p_idle');
        if (playerInvTimer > PLAYER_STATS.invTime * 0.5) spriteKey = 'lich_p_hurt';
        img = images[spriteKey];
        if (!img) return;
        fw = 160; fh = 128;
        frameCount = Math.floor(img.width / fw);
        flipH = (dir === 'E' || dir === 'NE' || dir === 'SE');
        lichScale = 1.50;
    }
    const frame = Math.floor(player.animFrame) % Math.max(1, frameCount);
    const dw = fw * lichScale, dh = fh * lichScale;
    const hover = (typeof lichState !== 'undefined') ? lichState.hoverOffset || 0 : 0;
    const drawY = (sy - hover) - dh * 0.89;
    if (flipH) {
        ctx.save(); ctx.translate(sx, drawY); ctx.scale(-1, 1);
        ctx.drawImage(img, frame * fw, 0, fw, fh, -dw / 2, 0, dw, dh);
        ctx.restore();
    } else {
        ctx.drawImage(img, frame * fw, 0, fw, fh, sx - dw / 2, drawY, dw, dh);
    }
};

// Soul Bolt is handled in updateLich (LMB)

// Raise Undead (RMB)
formHandlers.lich.onSecondaryAbility = function() {
    if (lichState.soulEnergy < 15) return;
    const maxMin = lichState.maxMinions + getUpgrade('army_dead');
    if (lichState.undeadMinions.length >= maxMin) return;
    // Find nearest corpse
    let bestCorpse = null, bestDist = 3;
    for (let i = 0; i < lichState.corpseLocations.length; i++) {
        const c = lichState.corpseLocations[i];
        const dist = Math.sqrt((c.row - player.row) ** 2 + (c.col - player.col) ** 2);
        if (dist < bestDist) { bestDist = dist; bestCorpse = i; }
    }
    if (bestCorpse !== null) {
        const c = lichState.corpseLocations[bestCorpse];
        lichState.soulEnergy -= 15;
        lichState.soulEnergy = Math.max(0, lichState.soulEnergy);
        lichState.undeadMinions.push({
            row: c.row, col: c.col,
            life: 12, atkTimer: 0.5,
        });
        lichState.corpseLocations.splice(bestCorpse, 1);
        FormSystem.formData.lich.undeadRaised++;
        addScreenShake(2, 0.15);
    }
};

// Shadow Step (Space) — also fires from input buffer
formHandlers.lich.onDodge = function() {
    if (gamePhase !== 'playing') return;
    if (player.dodgeCoolTimer > 0 || lichState.shadowStepCooldown > 0) {
        bufferInput('dodge');
        return;
    }
    lichState.shadowStepCooldown = DODGE_COOLDOWN * 0.7;
    player.dodgeCoolTimer = DODGE_COOLDOWN * 0.7;
    player.parryTimer = PARRY_WINDOW; // parry active briefly after shadow step

    // Teleport in movement direction (WASD), fall back to facing direction
    const maxRange = 4;

    // Build direction from current key input (isometric WASD)
    let inputRow = 0, inputCol = 0;
    if (keys['w'] || keys['arrowup'])    { inputRow -= 1; inputCol -= 1; }
    if (keys['s'] || keys['arrowdown'])  { inputRow += 1; inputCol += 1; }
    if (keys['a'] || keys['arrowleft'])  { inputRow += 1; inputCol -= 1; }
    if (keys['d'] || keys['arrowright']) { inputRow -= 1; inputCol += 1; }
    let inputLen = Math.sqrt(inputRow * inputRow + inputCol * inputCol);

    let dirR, dirC;
    if (inputLen > 0.01) {
        // Use WASD direction
        dirR = inputRow / inputLen;
        dirC = inputCol / inputLen;
    } else {
        // No keys held — use current facing direction from dir8
        const dir = player.dir8 || 'S';
        const dirMap = {
            'N':  [-1, -1], 'NE': [-1, 0], 'E':  [-1, 1], 'SE': [0, 1],
            'S':  [1, 1],   'SW': [1, 0],  'W':  [1, -1],  'NW': [0, -1],
        };
        const d = dirMap[dir] || [1, 1];
        const dLen = Math.sqrt(d[0] * d[0] + d[1] * d[1]);
        dirR = d[0] / dLen;
        dirC = d[1] / dLen;
    }

    // Raycast: find farthest walkable tile along the direction
    let bestRow = player.row, bestCol = player.col;
    const steps = 16;
    for (let i = steps; i >= 1; i--) {
        const t = i / steps;
        const testRow = player.row + dirR * maxRange * t;
        const testCol = player.col + dirC * maxRange * t;
        if (canMoveTo(testRow, testCol)) {
            bestRow = testRow;
            bestCol = testCol;
            break;
        }
    }

    // Only teleport if we found a point beyond the player's current position
    if (bestRow !== player.row || bestCol !== player.col) {
        // VFX: shadow burst at departure point
        const _depPos = tileToScreen(player.row, player.col);
        const _dpx = _depPos.x + cameraX, _dpy = _depPos.y + cameraY;
        for (let _si = 0; _si < 8; _si++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 20 + Math.random() * 30;
            _emitParticle(_dpx, _dpy, Math.cos(angle) * speed, Math.sin(angle) * speed - 10,
                0.4 + Math.random() * 0.3, 4 + Math.random() * 4, '#6622aa', 0.6, 'shadowStep', 'lighter');
        }
        player.row = bestRow;
        player.col = bestCol;
        // VFX: dark arrival burst at destination
        const _arrPos = tileToScreen(player.row, player.col);
        const _apx = _arrPos.x + cameraX, _apy = _arrPos.y + cameraY;
        for (let _ai = 0; _ai < 8; _ai++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 15 + Math.random() * 25;
            _emitParticle(_apx, _apy, Math.cos(angle) * speed, Math.sin(angle) * speed - 8,
                0.35 + Math.random() * 0.25, 3 + Math.random() * 5, '#9944cc', 0.5, 'shadowStep', 'lighter');
        }
    }
    sfxShadowStep();

    // Spectral cloak
    if (getUpgrade('spectral_cloak') > 0) {
        lichState.spectralCloakTimer = 1.0 + getUpgrade('spectral_cloak') * 0.5;
    }

    // Brief invulnerability
    playerInvTimer = 0.3;
    addScreenShake(3, 0.2);
};

// Soul Harvest (E key)
formHandlers.lich.onInteract = function() {
    // Harvest soul from nearby corpses
    let harvested = 0;
    for (let i = lichState.corpseLocations.length - 1; i >= 0; i--) {
        const c = lichState.corpseLocations[i];
        const dist = Math.sqrt((c.row - player.row) ** 2 + (c.col - player.col) ** 2);
        if (dist < 2.0) {
            harvested += c.soulValue;

            // Corpse Explosion upgrade: detonate corpses for AoE damage
            if (getUpgrade('corpse_explosion') > 0) {
                const explosionDmg = 20 * getUpgrade('corpse_explosion');
                for (const e of enemies) {
                    if (e.state === 'death') continue;
                    const eDist = Math.sqrt((e.row - c.row) ** 2 + (e.col - c.col) ** 2);
                    if (eDist < 2.5) {
                        e.hp -= explosionDmg;
                        if (e.hp <= 0) e.state = 'death';
                    }
                }
                addScreenShake(5, 0.15);
                if (sfxCtx) sfxExplosion();
            }

            lichState.corpseLocations.splice(i, 1);
            FormSystem.formData.lich.soulsHarvested++;
        }
    }
    if (harvested > 0) {
        // Harvest Chain: boost soul gain by chain multiplier
        const chainMult = 1 + lichState.harvestChain * 0.15;
        harvested *= chainMult;
        lichState.soulEnergy = Math.min(lichState.maxSoulEnergy, lichState.soulEnergy + harvested);
        // Build harvest chain
        lichState.harvestChain = Math.min(lichState.maxHarvestChain, lichState.harvestChain + 1);
        lichState.harvestChainTimer = 0;
        pickupTexts.push({
            row: player.row, col: player.col,
            text: `+${Math.ceil(harvested)} Soul Energy` + (lichState.harvestChain > 1 ? ` (x${chainMult.toFixed(1)})` : ''), color: '#bb66ff',
            life: 1.5, offsetY: 0,
        });
        addScreenShake(1.5, 0.1);
    }

    // Life Tap — BASELINE ability (always available, no upgrade needed)
    // Converts HP to soul energy when no corpses are nearby
    if (harvested === 0 && player.hp > 20 && lichState.lifeTapCooldown <= 0) {
        const hpCost = 15;
        const soulGain = 20 + getUpgrade('dark_pact') * 10; // Dark Pact upgrade boosts conversion
        player.hp -= hpCost;
        lichState.soulEnergy = Math.min(lichState.maxSoulEnergy, lichState.soulEnergy + soulGain);
        lichState.lifeTapCooldown = 3.0;
        pickupTexts.push({
            row: player.row, col: player.col,
            text: `Life Tap: -${hpCost} HP → +${soulGain} Soul`, color: '#ff6688',
            life: 1.5, offsetY: 0,
        });
    }
};

