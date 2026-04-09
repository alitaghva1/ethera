// ============================================================
//  SHARED DODGE MOVEMENT HELPER
// ============================================================
// Used by wizard phase-jump, skeleton roll, and slime bounce to
// move during an active dodge with collision + wall sliding.
// Returns true if movement was blocked (hit a wall).
function dodgeMove(dirRow, dirCol, speed, dt) {
    const moveRow = dirRow * speed * dt;
    const moveCol = dirCol * speed * dt;
    const newRow = player.row + moveRow;
    const newCol = player.col + moveCol;
    if (canMoveTo(newRow, newCol)) {
        player.row = newRow;
        player.col = newCol;
        return false;
    }
    // Per-axis sliding (BUG-009 fix: renamed to avoid shadowing global `blocked` array)
    let wasBlocked = true;
    if (canMoveTo(newRow, player.col)) {
        player.row = newRow;
        wasBlocked = false;
    }
    if (canMoveTo(player.row, newCol)) {
        player.col = newCol;
        wasBlocked = false;
    }
    return wasBlocked;
}

// ============================================================
//  8-DIRECTION RESOLVER
// ============================================================
// Converts tile-space velocity into one of 8 compass directions
// matching the PVGames spritesheet layout.
//
// NAMING NOTE: parameters are called vx/vy for historical reasons
// but represent tile-space ROW/COL velocity (not screen X/Y).
//   vx = row velocity, vy = col velocity
//   +row,+col = screen South    -row,-col = screen North
//   +row,-col = screen West     -row,+col = screen East

function resolveDir8(vx, vy) {
    // Convert tile velocity to screen-space direction
    const screenX = (vy - vx);   // col - row → horizontal
    const screenY = (vy + vx);   // col + row → vertical (down = positive)
    const angle = Math.atan2(screenY, screenX); // radians, 0=right

    // Map angle to 8 sectors (each 45°)
    // atan2 returns [-π, π].  Shift so 0 aligns with East, going clockwise:
    //   E=0, SE=π/4, S=π/2, SW=3π/4, W=±π, NW=-3π/4, N=-π/2, NE=-π/4
    const sector = Math.round(angle / (Math.PI / 4));
    // sector: -4=W, -3=NW, -2=N, -1=NE, 0=E, 1=SE, 2=S, 3=SW, 4=W
    const DIR8_FROM_SECTOR = {
        '-4': 'W', '-3': 'NW', '-2': 'N', '-1': 'NE',
         '0': 'E',  '1': 'SE',  '2': 'S',  '3': 'SW', '4': 'W'
    };
    return DIR8_FROM_SECTOR[String(sector)] || 'S';
}

// Convert dir8 string to old-style facing (-1 or 1) for compatibility
function dir8ToFacing(dir) {
    // Anything with East component → face right (1), West → left (-1)
    if (dir === 'E' || dir === 'NE' || dir === 'SE') return 1;
    if (dir === 'W' || dir === 'NW' || dir === 'SW') return -1;
    return 1; // S and N default to right
}

// ============================================================
//  PLAYER UPDATE (physics-based free movement + phase jump)
// ============================================================
// Cached equipment bonuses — recalculated each frame in updatePlayer
let equipBonus = {};

function updatePlayer(dt) {
    // Freeze player when dead
    if (gameDead) return;
    // Freeze player during victory
    if (wave.phase === 'victory') return;

    // Frost Wyrm freeze — player cannot move or act
    if (player.frozenTimer > 0) {
        const wasFrozen = player._wasFrozen;
        player.frozenTimer -= dt;
        player.state = 'idle';
        if (!wasFrozen) {
            player.animFrame = 0; // only reset frame on freeze start
            player._wasFrozen = true;
        }
        if (player.frozenTimer <= 0) player._wasFrozen = false;
        // Frozen visual particles
        if (Math.random() < 0.15) {
            spawnParticle(player.row, player.col,
                (Math.random() - 0.5) * 1.5, -1 - Math.random(), 0.4, '#88ccff', 0.6);
        }
        return; // skip all player input/movement
    }

    // Recalculate equipment bonuses
    equipBonus = getEquipBonuses();

    // --- Tick cooldowns ---
    if (player.dodgeCoolTimer > 0) player.dodgeCoolTimer -= dt;
    if (player.dodgeFlashTimer > 0) player.dodgeFlashTimer -= dt;
    if (player.attackCooldown > 0) player.attackCooldown -= dt;

    // --- Screen-relative input ---
    let inputRow = 0, inputCol = 0;
    if (keys['w'] || keys['arrowup'])    { inputRow--; inputCol--; }
    if (keys['s'] || keys['arrowdown'])  { inputRow++; inputCol++; }
    if (keys['a'] || keys['arrowleft'])  { inputRow++; inputCol--; }
    if (keys['d'] || keys['arrowright']) { inputRow--; inputCol++; }

    const inputLen = Math.sqrt(inputRow * inputRow + inputCol * inputCol);
    if (inputLen > 0) { inputRow /= inputLen; inputCol /= inputLen; }

    // --- Phase Jump trigger (Space) — lich uses Shadow Step instead (handled in balance.js) ---
    // Buffer dodge input when on cooldown
    if (keys[' '] && FormSystem.currentForm !== 'lich') {
        if (player.dodging || player.dodgeCoolTimer > 0) {
            bufferInput('dodge');
        }
    }
    const dodgeTrigger = (keys[' '] || consumeBuffer('dodge'));
    if (dodgeTrigger && !player.dodging && player.dodgeCoolTimer <= 0 && FormSystem.currentForm !== 'lich') {
        player.dodging = true;
        player.dodgeTimer = DODGE_DURATION;
        player.dodgeCoolTimer = Math.max(0.3, DODGE_COOLDOWN - (equipBonus.dodgeCdReduc || 0));
        player.dodgeFlashTimer = 0.12; // brief arcane flash
        sfxDodge();
        // VFX: arcane glow ring burst at start position
        const _djPos = tileToScreen(player.row, player.col);
        const _djpx = _djPos.x + cameraX, _djpy = _djPos.y + cameraY;
        for (let _di = 0; _di < 8; _di++) {
            const angle = (_di / 8) * Math.PI * 2;
            const speed = 40 + Math.random() * 20;
            _emitParticle(_djpx, _djpy, Math.cos(angle) * speed, Math.sin(angle) * speed - 8,
                0.3 + Math.random() * 0.15, 3 + Math.random() * 3, '#66aaff', 0.6, 'phaseJump', 'lighter');
        }

        // Direction: use current input, or facing direction if idle
        if (inputLen > 0) {
            player.dodgeDirRow = inputRow;
            player.dodgeDirCol = inputCol;
        } else {
            // Phase in facing direction (screen-right or screen-left)
            if (player.facing === 1) {
                // screen-right → row--, col++
                player.dodgeDirRow = -0.707;
                player.dodgeDirCol = 0.707;
            } else {
                // screen-left → row++, col--
                player.dodgeDirRow = 0.707;
                player.dodgeDirCol = -0.707;
            }
        }

        // Spawn ghost afterimages along the path (interpolated preview)
        // These are positioned partway along the intended dodge trajectory as a visual preview.
        // The * 0.5 factor shows where the player will be during the dodge phase.
        for (let i = 0; i < DODGE_GHOST_COUNT; i++) {
            const t = i / DODGE_GHOST_COUNT;
            ghosts.push({
                row: player.row + player.dodgeDirRow * DODGE_DISTANCE * t * 0.5,
                col: player.col + player.dodgeDirCol * DODGE_DISTANCE * t * 0.5,
                facing: player.facing,
                dir8: player.dir8,
                animFrame: player.animFrame,
                state: player.state,
                form: FormSystem.currentForm,
                alpha: 0.6 - t * 0.3,
                life: DODGE_GHOST_LIFE * (1 - t * 0.3),
            });
        }

        // Consume the key so it doesn't retrigger
        keys[' '] = false;
    }

    // --- Phase Jump movement (override normal movement) ---
    if (player.dodging) {
        player.dodgeTimer -= dt;
        const dodgeSpeed = DODGE_DISTANCE / DODGE_DURATION;

        // Shared dodge movement with wall sliding
        const hitWall = dodgeMove(player.dodgeDirRow, player.dodgeDirCol, dodgeSpeed, dt);
        if (hitWall) player.dodgeTimer = 0; // End dodge early on wall hit

        // Spawn trailing ghosts during the dash
        if (Math.random() < 0.6) {
            ghosts.push({
                row: player.row,
                col: player.col,
                facing: player.facing,
                dir8: player.dir8,
                animFrame: player.animFrame,
                state: 'walk',
                form: FormSystem.currentForm,
                alpha: 0.45,
                life: DODGE_GHOST_LIFE * 0.7,
            });
        }

        if (player.dodgeTimer <= 0) {
            player.dodging = false;
            player.vx = player.dodgeDirRow * MOVE_MAX_SPEED * 0.3; // residual momentum
            player.vy = player.dodgeDirCol * MOVE_MAX_SPEED * 0.3;
        }

        // Keep walk animation going during dodge
        player.state = 'walk';
        player.animFrame = (player.animFrame + 14 * dt) % 8; // fast animation
        return; // skip normal movement while dodging
    }

    // --- Slow debuff tick ---
    if (player.slowTimer > 0) player.slowTimer -= dt;

    // --- Normal movement (lerp-based velocity) ---
    const slowMult = player.slowTimer > 0 ? 0.5 : 1.0;
    const effMoveSpeed = MOVE_MAX_SPEED * (1 + (equipBonus.moveSpeedMult || 0)) * getTalismanBonus().speedMult * slowMult;
    const targetVr = inputRow * effMoveSpeed;
    const targetVc = inputCol * effMoveSpeed;
    const resp = Math.min(1, 25 * dt);
    player.vx += (targetVr - player.vx) * resp;
    player.vy += (targetVc - player.vy) * resp;

    if (Math.abs(player.vx) < 0.01 && inputRow === 0) player.vx = 0;
    if (Math.abs(player.vy) < 0.01 && inputCol === 0) player.vy = 0;

    // --- Collision with clean wall sliding ---
    // Per-axis wall sliding: if full movement is blocked, try moving on each axis separately.
    // Velocity is zeroed on blocked axes (intentional sticky-wall feel gives better game feel).
    const newRow = player.row + player.vx * dt;
    const newCol = player.col + player.vy * dt;

    if (canMoveTo(newRow, newCol)) {
        player.row = newRow;
        player.col = newCol;
    } else {
        if (player.vx !== 0 && canMoveTo(newRow, player.col)) {
            player.row = newRow;
        } else {
            player.vx = 0;
        }
        if (player.vy !== 0 && canMoveTo(player.row, newCol)) {
            player.col = newCol;
        } else {
            player.vy = 0;
        }
    }

    // --- Facing (8-direction + legacy) ---
    const speed = Math.sqrt(player.vx * player.vx + player.vy * player.vy);
    if (speed > 0.3) {
        player.dir8 = resolveDir8(player.vx, player.vy);
        player.facing = dir8ToFacing(player.dir8);
    }

    // --- Mana regeneration (capped by locked mana from summons) ---
    const lockedMana = summons.reduce((sum, s) => sum + s.manaLocked, 0);
    const effMaxMana = (MAX_MANA + (equipBonus.maxManaBonus || 0)) - lockedMana;
    const effManaRegen = MANA_REGEN * (1 + (equipBonus.manaRegenMult || 0) + getUpgrade('manasurge') * 0.25);
    if (player.manaRegenTimer > 0) {
        player.manaRegenTimer -= dt;
    } else if (player.mana < effMaxMana) {
        player.mana = Math.min(effMaxMana, player.mana + effManaRegen * dt);
    }

    // --- Summon tower placement (right click toggles placement mode) ---
    if (mouse.rightDown && !player.dodging && !player.attacking && !placement.active) {
        mouse.rightDown = false;
        const effSummonMax = SUMMON_MAX_COUNT + getUpgrade('tower_extra');
        if (summons.length < effSummonMax && player.mana >= SUMMON_MANA_COST) {
            placement.active = true;
        } else if (summons.length >= effSummonMax) {
            // Tower count maxed out
            pickupTexts.push({
                text: 'Tower limit reached',
                color: '#cc8844',
                row: player.row, col: player.col,
                offsetY: 0,
                life: 1.5,
            });
        } else {
            // Not enough mana
            pickupTexts.push({
                text: 'Not enough mana',
                color: '#cc4444',
                row: player.row, col: player.col,
                offsetY: 0,
                life: 1.5,
            });
        }
    }

    // --- Wand attack trigger (left click) ---
    const arcaneEfficiency = (FormSystem.currentForm === 'wizard') ? getUpgrade('arcane_efficiency') * 0.15 : 0;
    const effManaCost = Math.max(3, Math.round((ATK_MANA_COST - (equipBonus.manaCostReduc || 0)) * (1 - arcaneEfficiency)));
    const effAtkCooldown = (ATK_COOLDOWN / (1 + (equipBonus.atkSpeedMult || 0))) * Math.pow(0.85, getUpgrade('firerate'));
    if (!player.attacking && !player.dodging && mouse.down && player.attackCooldown <= 0 && player.mana >= effManaCost) {
        const aimDir = getAimDirection();
        player.attacking = true;
        player.attackTimer = ATK_DURATION;
        player.attackFrame = 0;
        player.attackCooldown = effAtkCooldown;
        player.attackFired = false;
        // 8-dir facing toward attack aim
        const atkAngle = Math.atan2(aimDir.screenY, aimDir.screenX);
        const atkSector = Math.round(atkAngle / (Math.PI / 4));
        const ATK_DIR8 = {'-4':'W','-3':'NW','-2':'N','-1':'NE','0':'E','1':'SE','2':'S','3':'SW','4':'W'};
        player.dir8 = ATK_DIR8[String(atkSector)] || player.dir8 || 'S';
        player.facing = dir8ToFacing(player.dir8);
    }

    // --- Attack animation update ---
    if (player.attacking) {
        player.attackTimer -= dt;
        const elapsed = ATK_DURATION - player.attackTimer;

        // Frame count: wizard uses 6-frame Tiny RPG attack, lich uses strip width
        const _atkFC = (FormSystem.currentForm === 'lich' && images['lich_p_attack'])
            ? Math.floor(images['lich_p_attack'].width / 160)
            : 6;
        player.attackFrame = Math.min(_atkFC - 1, Math.floor((elapsed / ATK_DURATION) * _atkFC));

        if (!player.attackFired && elapsed >= ATK_FIRE_AT) {
            player.attackFired = true;
            player.mana -= effManaCost;
            player.manaRegenTimer = MANA_REGEN_DELAY;
            spawnProjectile();
            sfxFireballShoot();
            // Spell Echo: chance to fire a free second projectile (wizard only)
            if (FormSystem.currentForm === 'wizard' && getUpgrade('spell_echo') > 0) {
                if (Math.random() < 0.20 * getUpgrade('spell_echo')) {
                    spawnProjectile();
                    sfxFireballShoot();
                }
            }
        }

        if (player.attackTimer <= 0) {
            player.attacking = false;
        }

        player.state = 'attack';
        player.animFrame = player.attackFrame;
        return;
    }

    // --- Animation state ---
    player.state = speed > 0.2 ? 'walk' : 'idle';

    // --- Facing toward mouse when idle (subtle) ---
    if (speed <= 0.3) {
        const aimDir = getAimDirection();
        if (Math.abs(aimDir.screenX) > 30 || Math.abs(aimDir.screenY) > 30) {
            // Use screen-space aim direction for 8-dir idle facing
            const aimAngle = Math.atan2(aimDir.screenY, aimDir.screenX);
            const sector = Math.round(aimAngle / (Math.PI / 4));
            const DIR8_MAP = { '-4':'W','-3':'NW','-2':'N','-1':'NE','0':'E','1':'SE','2':'S','3':'SW','4':'W' };
            player.dir8 = DIR8_MAP[String(sector)] || player.dir8 || 'S';
            player.facing = dir8ToFacing(player.dir8);
        }
    }

    // --- Animation frame ---
    // Tiny RPG sprites: walk=8 frames, idle=6 frames, attack=6 frames
    const frameCount = player.state === 'walk' ? 8 : 6;
    const animSpeed = player.state === 'walk'
        ? Math.max(4, Math.min(12, 12 * (speed / MOVE_MAX_SPEED)))
        : 6;
    player.animFrame = (player.animFrame + animSpeed * dt) % frameCount;
}

// --- Aim direction helper ---
function getAimDirection() {
    // Convert mouse screen position to direction from wizard
    const pos = tileToScreen(player.row, player.col);
    const wizScreenX = pos.x + cameraX;
    const wizScreenY = pos.y + cameraY - WIZARD_FRAME_H * WIZARD_SCALE * 0.4;
    const dx = mouse.x - wizScreenX;
    const dy = mouse.y - wizScreenY;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    return { screenX: dx, screenY: dy, nx: dx / len, ny: dy / len };
}

// --- Convert screen direction to tile-space direction ---
function screenDirToTile(nx, ny) {
    // Inverse of tileToScreen: screenX = (col-row)*HALF_DW, screenY = (col+row)*HALF_DH
    // So: col-row = screenX/HALF_DW, col+row = screenY/HALF_DH
    // row = (screenY/HALF_DH - screenX/HALF_DW) / 2
    // col = (screenY/HALF_DH + screenX/HALF_DW) / 2
    const dr = (ny / HALF_DH - nx / HALF_DW) / 2;
    const dc = (ny / HALF_DH + nx / HALF_DW) / 2;
    const len = Math.sqrt(dr * dr + dc * dc) || 1;
    return { dr: dr / len, dc: dc / len };
}

// --- Spawn projectile ---
function spawnProjectile() {
    const aim = getAimDirection();
    const tileDir = screenDirToTile(aim.nx, aim.ny);

    // Compute angle from velocity for fireball rotation
    const screenVx = tileDir.dc - tileDir.dr; // screen X direction
    const screenVy = (tileDir.dc + tileDir.dr) * 0.5; // screen Y direction
    const baseAngle = Math.atan2(screenVy, screenVx);

    const shotCount = 1 + getUpgrade('multishot');
    const spreadAngle = shotCount > 1 ? 0.15 : 0; // radians spread per extra shot

    for (let i = 0; i < shotCount; i++) {
        let angle = baseAngle;
        if (shotCount > 1) {
            const offset = (i - (shotCount - 1) / 2) * spreadAngle;
            angle = baseAngle + offset;
        }
        // Convert screen-space angle back to tile-space velocity
        const screenNx = Math.cos(angle);
        const screenNy = Math.sin(angle);
        const td = screenDirToTile(screenNx, screenNy);

        const sizeBonus = getUpgrade('bigshot');
        const projSize = ATK_PROJ_SIZE + sizeBonus * 3;

        const _wp = getPooledProj();
        _wp.row = player.row; _wp.col = player.col;
        _wp.vr = td.dr * ATK_SPEED; _wp.vc = td.dc * ATK_SPEED;
        _wp.life = ATK_PROJ_LIFE;
        _wp.hit = false;
        _wp.size = projSize;
        _wp.animTime = 0;
        _wp.angle = angle;
        _wp.pierceLeft = getUpgrade('pierce');
        _wp.bounceLeft = getUpgrade('bounce');
        _wp.canExplode = getUpgrade('explode') > 0;
        _wp.explodeScale = getUpgrade('explode');
        _wp.hitEnemies = new Set();
        projectiles.push(_wp);
        FormSystem.formData.wizard.spellsCast++;
    }
}

// Register wizard form handler (now that updatePlayer is defined)
// Reset wizard form state (called on form switch)
function resetWizardState() {
    player.attackCooldown = 0;
    player.dodgeCoolTimer = 0;
    player.dodgeFlashTimer = 0;
    player.dodging = false;
    player.attacking = false;
    placement.active = false;
    placement.channeling = false;
    placement.channelTimer = 0;
    mouse.down = false;
    mouse.rightDown = false;
}

formHandlers.wizard.update = function(dt) {
    updatePlayer(dt);
    // Check wizard→lich evolution
    const fd = FormSystem.formData.wizard;
    const req = EVOLUTION_REQUIREMENTS.wizard_to_lich;
    if (fd.totalKills >= req.kills &&
        FormSystem.talisman.level >= req.talismanLevel &&
        fd.towersPlaced >= req.towersPlaced &&
        fd.lowManaKills >= req.lowManaKills) {
        triggerEvolution('lich');
    }
};

// Wire wizard ability handlers for form-system consistency.
// These are also triggered inline by updatePlayer(), but having them as handlers
// means the form system is complete and form-switching code can invoke them.
formHandlers.wizard.onPrimaryAttack = function() {
    // Wizard attack is driven by mouse.down + cooldown in updatePlayer();
    // this handler exists for system completeness (e.g. AI-controlled wizard).
    if (player.attackCooldown <= 0 && player.mana >= (COMBAT.manaCost * (1 - getUpgrade('arcane_efficiency') * 0.15))) {
        mouse.down = true; // updatePlayer will pick this up next frame
    }
};
formHandlers.wizard.onSecondaryAbility = function() {
    // Trigger tower placement mode
    const effSummonMax = SUMMON_MAX_COUNT + getUpgrade('tower_extra');
    if (!placement.active && summons.length < effSummonMax && player.mana >= SUMMON_MANA_COST) {
        placement.active = true;
    }
};
formHandlers.wizard.onDodge = function() {
    // Phase jump — delegated to the space-key path in updatePlayer
    if (!player.dodging && player.dodgeCoolTimer <= 0) {
        keys[' '] = true; // updatePlayer will consume this
    }
};
formHandlers.wizard.onInteract = function() {
    // Wizard interact = open chests (handled by input system fallback)
    // No form-specific interact action for wizard
};

