//  SUMMONING TOWER SYSTEM
// ============================================================

// Tower target priority mode: 'nearest', 'strongest', 'weakest'
let towerTargetMode = 'nearest';
let towerModeDisplayTimer = 0;

function summonTowerAt(row, col) {
    const manaSacrificed = SUMMON_MANA_COST; // costs fixed amount, not all mana
    player.mana -= manaSacrificed;
    player.manaRegenTimer = MANA_REGEN_DELAY;

    // Duration = mana sacrificed in seconds (1 MP = 1 second)
    const duration = manaSacrificed;

    summons.push({
        row, col,
        manaLocked: manaSacrificed,
        duration: duration,
        maxDuration: duration,
        fireTimer: 0.5,        // short delay before first shot
        targetEnemy: null,
        animTime: 0,
        spawnAnim: 0.8,        // summoning portal animation timer
    });

    // Show mana-lock hint on first tower summon
    if (typeof Notify !== 'undefined') Notify.hint('mana_lock', 'Towers lock your mana while active.\nLocked mana returns when tower expires.', 4, { color: '#aabbff', borderColor: '#6633aa' });

    sfxTowerSummon();
}

function updatePlacement(dt) {
    // --- Channeling phase ---
    if (placement.channeling) {
        placement.channelTimer += (dt || 1/60); // use real dt, fallback to 1/60 (BUG-027 fix)
        // Interrupt if player takes damage (checked via invincibility timer starting)
        // Use fallback invTime if PLAYER_INV_TIME not available (defined in enemies.js)
        const invTime = (typeof PLAYER_INV_TIME !== 'undefined') ? PLAYER_INV_TIME : 0.8;
        if (playerInvTimer > 0 && playerInvTimer > invTime - 0.05) {
            placement.channeling = false;
            placement.channelTimer = 0;
        }
        // Complete channeling
        if (placement.channelTimer >= placement.channelDuration) {
            summonTowerAt(placement.channelRow, placement.channelCol);
            placement.channeling = false;
            placement.channelTimer = 0;
        }
        return;
    }

    if (!placement.active) return;

    // Convert mouse screen position to tile coordinates
    const tile = screenToTile(mouse.x, mouse.y);
    placement.row = tile.row;
    placement.col = tile.col;

    // Check validity: must be on a walkable tile and within reasonable range of player
    const tileR = Math.floor(tile.row);
    const tileC = Math.floor(tile.col);
    const inBounds = tileR >= 0 && tileR < floorMap.length && tileC >= 0 && tileC < floorMap.length;
    const walkable = inBounds && !blocked[tileR][tileC];

    const dr = tile.row - player.row;
    const dc = tile.col - player.col;
    const dist = Math.sqrt(dr * dr + dc * dc);
    const inRange = dist <= 6; // max placement range

    placement.valid = walkable && inRange && player.mana >= SUMMON_MANA_COST;
}

function updateTowers(dt) {
    for (let i = summons.length - 1; i >= 0; i--) {
        const t = summons[i];

        // Tick timers
        t.duration -= dt;
        t.animTime += dt;
        if (t.spawnAnim > 0) t.spawnAnim -= dt;

        // Expired — release locked mana
        if (t.duration <= 0) {
            summons.splice(i, 1);
            continue;
        }

        // Don't fire during spawn animation
        if (t.spawnAnim > 0) continue;

        // --- Targeting ---
        t.fireTimer -= dt;
        t.targetEnemy = null;

        const towerRange = TOWER_RANGE + (equipBonus.towerRangeAdd || 0);

        if (towerTargetMode === 'strongest') {
            // Target enemy with highest HP in range
            let maxHp = 0;
            for (const e of enemies) {
                if (e.state === 'death') continue;
                const dr = e.row - t.row;
                const dc = e.col - t.col;
                const dist = Math.sqrt(dr * dr + dc * dc);
                if (dist < towerRange && e.hp > maxHp) {
                    maxHp = e.hp;
                    t.targetEnemy = e;
                }
            }
        } else if (towerTargetMode === 'weakest') {
            // Target enemy with lowest HP in range
            let minHp = Infinity;
            for (const e of enemies) {
                if (e.state === 'death') continue;
                const dr = e.row - t.row;
                const dc = e.col - t.col;
                const dist = Math.sqrt(dr * dr + dc * dc);
                if (dist < towerRange && e.hp < minHp) {
                    minHp = e.hp;
                    t.targetEnemy = e;
                }
            }
        } else {
            // 'nearest' (default) — Find closest enemy in range
            let closestDist = towerRange;
            for (const e of enemies) {
                if (e.state === 'death') continue;
                const dr = e.row - t.row;
                const dc = e.col - t.col;
                const dist = Math.sqrt(dr * dr + dc * dc);
                if (dist < closestDist) {
                    closestDist = dist;
                    t.targetEnemy = e;
                }
            }
        }

        // --- Fire ---
        if (t.targetEnemy && t.fireTimer <= 0) {
            t.fireTimer = TOWER_FIRE_RATE;
            fireTowerBolt(t, t.targetEnemy);
        }
    }
}

function fireTowerBolt(tower, target) {
    const dr = target.row - tower.row;
    const dc = target.col - tower.col;
    const len = Math.sqrt(dr * dr + dc * dc) || 1;

    const screenVx = (dc / len) - (dr / len);
    const screenVy = ((dc / len) + (dr / len)) * 0.5;
    const angle = Math.atan2(screenVy, screenVx);

    towerBolts.push({
        row: tower.row, col: tower.col,
        vr: (dr / len) * TOWER_BOLT_SPEED,
        vc: (dc / len) * TOWER_BOLT_SPEED,
        life: 2.0,
        angle,
        hit: false,
        trail: [],
    });
    sfxTowerShoot(tower.row, tower.col);
}

function updateTowerBolts(dt) {
    for (let i = towerBolts.length - 1; i >= 0; i--) {
        const b = towerBolts[i];
        b.life -= dt;

        if (b.hit) {
            b.life -= dt * 4;
            if (b.life <= 0) { recycleBolt(towerBolts.splice(i, 1)[0]); }
            continue;
        }

        // Track trail
        b.trail.push({ row: b.row, col: b.col, age: 0 });
        if (b.trail.length > 8) b.trail.shift();
        for (const t of b.trail) t.age += dt;

        const nr = b.row + b.vr * dt;
        const nc = b.col + b.vc * dt;

        // Wall collision
        if (!canMoveTo(nr, nc)) {
            b.hit = true; b.life = 0.2;
            continue;
        }

        b.row = nr; b.col = nc;

        // Enemy collision
        for (const e of enemies) {
            if (e.state === 'death') continue;
            const dr = b.row - e.row;
            const dc = b.col - e.col;
            if (Math.sqrt(dr * dr + dc * dc) < e.def.hitboxR + 0.25) {
                // Infernal Knight shield phase — immune to all damage
                if (e.bossShieldPhaseActive) {
                    spawnParticle(e.row, e.col, (Math.random()-0.5)*3, (Math.random()-0.5)*3, 0.2, '#ff8844', 0.6);
                    b.hit = true; b.life = 0.2;
                    break;
                }
                const baseDmg = TOWER_DAMAGE + (equipBonus.towerDmgBonus || 0);
                e.hp -= baseDmg;
                b.hit = true; b.life = 0.2;

                const kbResist = e.def.knockbackResist || 1.0;
                e.knockVr = (b.vr / TOWER_BOLT_SPEED) * 1.5 * kbResist;
                e.knockVc = (b.vc / TOWER_BOLT_SPEED) * 1.5 * kbResist;

                // Tower Slow: apply slow effect
                if (getUpgrade('tower_slow') > 0) {
                    e.slowTimer = 2;
                }

                if (e.hp <= 0) {
                    e.hp = 0; e.state = 'death';
                    e.deathTimer = 0.7; e.animFrame = 0;
                    sfxEnemyDeath(e.row, e.col);
                    rollEnemyLoot(e);
                } else {
                    e.state = 'hurt';
                    e.hurtTimer = 0.25; e.animFrame = 0;
                    sfxEnemyHurt(e.row, e.col);
                }

                // Tower Chain: find nearby enemy and chain to it
                if (getUpgrade('tower_chain') > 0) {
                    let closestEnemy = null;
                    let closestDist = 3;
                    for (const e2 of enemies) {
                        if (e2.state === 'death' || e2 === e) continue;
                        const dr2 = b.row - e2.row;
                        const dc2 = b.col - e2.col;
                        const dist = Math.sqrt(dr2 * dr2 + dc2 * dc2);
                        if (dist < closestDist) {
                            closestEnemy = e2;
                            closestDist = dist;
                        }
                    }
                    if (closestEnemy) {
                        sfxChainLightning();
                        const chainDmg = Math.round(baseDmg * 0.5 * getUpgrade('tower_chain'));
                        closestEnemy.hp -= chainDmg;
                        closestEnemy.state = 'hurt'; closestEnemy.hurtTimer = 0.2; closestEnemy.animFrame = 0;
                        if (closestEnemy.hp <= 0) {
                            closestEnemy.hp = 0; closestEnemy.state = 'death';
                            closestEnemy.deathTimer = 0.7; closestEnemy.animFrame = 0;
                            sfxEnemyDeath(closestEnemy.row, closestEnemy.col);
                            rollEnemyLoot(closestEnemy);
                        } else {
                            sfxEnemyHurt(closestEnemy.row, closestEnemy.col);
                        }
                    }
                }

                break;
            }
        }

        if (b.life <= 0) { recycleBolt(towerBolts.splice(i, 1)[0]); }
    }
}

// ----- DRAW TOWER (fully procedural dark arcane obelisk) -----
// drawTower: renders ONLY the solid stone obelisk body (depth-sorted, under darkness)
function drawTower(t) {
    const pos = tileToScreen(t.row, t.col);
    const sx = pos.x + cameraX;
    const sy = pos.y + cameraY;
    const timeFrac = t.duration / t.maxDuration;
    const dying = timeFrac < 0.25;

    const popScale = t.spawnAnim > 0 ? Math.max(0, 1 - (t.spawnAnim / 0.8)) : 1;
    const pop3 = popScale * popScale * (3 - 2 * popScale);

    // --- Dark aura pool on ground ---
    ctx.save();
    const auraR = 32 + Math.sin(t.animTime * 2.5) * 3;
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = 0.4 * pop3 * timeFrac;
    ctx.fillStyle = '#1a0a2a';
    ctx.beginPath();
    ctx.ellipse(sx, sy + 5, auraR, auraR * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // --- Dark stone obelisk (procedural) ---
    if (pop3 > 0) {
        const oH = 42 * pop3;
        const oW = 14 * pop3;
        const oTop = 8 * pop3;
        const baseY = sy + 2;
        const topY = baseY - oH;

        ctx.save();
        ctx.globalAlpha = (0.85 + timeFrac * 0.15) * (dying ? (0.5 + Math.sin(t.animTime * 12) * 0.3) : 1);

        const stoneGrad = ctx.createLinearGradient(sx, topY, sx, baseY);
        stoneGrad.addColorStop(0, '#2a1a3a');
        stoneGrad.addColorStop(0.3, '#1e1228');
        stoneGrad.addColorStop(0.7, '#150d1e');
        stoneGrad.addColorStop(1, '#0e0814');
        ctx.fillStyle = stoneGrad;

        ctx.beginPath();
        ctx.moveTo(sx - oTop, topY);
        ctx.lineTo(sx + oTop, topY);
        ctx.lineTo(sx + oW, baseY);
        ctx.lineTo(sx - oW, baseY);
        ctx.closePath();
        ctx.fill();

        // Left face darker for isometric depth
        ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
        ctx.beginPath();
        ctx.moveTo(sx - oTop, topY);
        ctx.lineTo(sx, topY + 2);
        ctx.lineTo(sx, baseY + 2);
        ctx.lineTo(sx - oW, baseY);
        ctx.closePath();
        ctx.fill();

        // Edge highlight
        ctx.strokeStyle = 'rgba(140, 100, 200, 0.15)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(sx + oTop, topY);
        ctx.lineTo(sx + oW, baseY);
        ctx.stroke();

        // Carved arcane lines
        ctx.strokeStyle = `rgba(130, 80, 220, ${0.25 * timeFrac})`;
        ctx.lineWidth = 0.8;
        const lineSpacing = oH / 5;
        for (let l = 1; l < 5; l++) {
            const ly = baseY - l * lineSpacing;
            const frac = l / 5;
            const lw = oW - (oW - oTop) * frac;
            ctx.beginPath();
            ctx.moveTo(sx - lw * 0.6, ly);
            ctx.lineTo(sx + lw * 0.6, ly);
            ctx.stroke();
        }

        ctx.restore();
    }
}

// drawTowerGlow: renders ALL glowing/magical effects AFTER darkness for full vibrancy
function drawTowerGlow(t) {
    const pos = tileToScreen(t.row, t.col);
    const sx = pos.x + cameraX;
    const sy = pos.y + cameraY;
    const timeFrac = t.duration / t.maxDuration;
    const dying = timeFrac < 0.25;

    const popScale = t.spawnAnim > 0 ? Math.max(0, 1 - (t.spawnAnim / 0.8)) : 1;
    const pop3 = popScale * popScale * (3 - 2 * popScale);

    // --- Spawn portal animation ---
    if (t.spawnAnim > 0) {
        const sf = t.spawnAnim / 0.8;
        ctx.save();
        ctx.globalCompositeOperation = GFX.screenBlend ? 'screen' : 'source-over';

        for (let ring = 0; ring < 2; ring++) {
            const ringR = (1 - sf) * (35 + ring * 18) + 5;
            const ringA = sf * (0.7 - ring * 0.25);
            ctx.strokeStyle = `rgba(140, 80, 255, ${ringA})`;
            ctx.lineWidth = (2.5 - ring) * sf;
            ctx.beginPath();
            ctx.ellipse(sx, sy + 4, ringR, ringR * 0.45, 0, 0, Math.PI * 2);
            ctx.stroke();
        }

        const colH = (1 - sf) * 90;
        const colGrad = ctx.createLinearGradient(sx, sy - colH, sx, sy);
        colGrad.addColorStop(0, 'rgba(180, 120, 255, 0)');
        colGrad.addColorStop(0.3, `rgba(160, 90, 255, ${sf * 0.4})`);
        colGrad.addColorStop(0.7, `rgba(120, 50, 220, ${sf * 0.6})`);
        colGrad.addColorStop(1, `rgba(80, 30, 180, ${sf * 0.3})`);
        ctx.fillStyle = colGrad;
        ctx.fillRect(sx - 12, sy - colH, 24, colH);

        for (let s = 0; s < 8; s++) {
            const sparkY = sy - (1 - sf) * colH * ((s + t.animTime * 3) % 1);
            const sparkX = sx + Math.sin(s * 2.3 + t.animTime * 6) * 10;
            ctx.globalAlpha = sf * 0.8;
            ctx.fillStyle = s % 2 === 0 ? '#cc88ff' : '#8844dd';
            ctx.beginPath();
            ctx.arc(sparkX, sparkY, 1.5, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }

    // --- Arcane ground glow ---
    ctx.save();
    ctx.globalCompositeOperation = GFX.screenBlend ? 'screen' : 'source-over';
    const pulseR = 28 + Math.sin(t.animTime * 3) * 4;
    const gndGrad = ctx.createRadialGradient(sx, sy + 4, 2, sx, sy + 4, pulseR);
    gndGrad.addColorStop(0, `rgba(120, 50, 230, ${0.30 * pop3 * timeFrac})`);
    gndGrad.addColorStop(0.5, `rgba(80, 30, 180, ${0.12 * pop3 * timeFrac})`);
    gndGrad.addColorStop(1, 'rgba(30, 10, 80, 0)');
    ctx.fillStyle = gndGrad;
    ctx.beginPath();
    ctx.ellipse(sx, sy + 4, pulseR, pulseR * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();

    // Rotating rune dots (toned down to not compete with wizard)
    ctx.globalAlpha = 0.45 * pop3 * timeFrac;
    const runeR = 22;
    for (let r = 0; r < 8; r++) {
        const ang = (r / 8) * Math.PI * 2 + t.animTime * 0.6;
        const rx = sx + Math.cos(ang) * runeR;
        const ry = sy + 4 + Math.sin(ang) * runeR * 0.45;
        const bright = 0.5 + Math.sin(t.animTime * 4 + r) * 0.5;
        ctx.fillStyle = `rgba(190, 140, 255, ${bright})`;
        ctx.beginPath();
        ctx.arc(rx, ry, 2, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();

    // --- Swirling energy vortex around obelisk ---
    if (pop3 > 0 && GFX.towerGlowParticles) {
        const oH = 42 * pop3;
        const baseY = sy + 2;

        ctx.save();
        ctx.globalCompositeOperation = GFX.screenBlend ? 'screen' : 'source-over';
        for (let p = 0; p < 12; p++) {
            const pAng = (p / 12) * Math.PI * 2 + t.animTime * 1.8;
            const pDist = 10 + Math.sin(t.animTime * 3 + p * 1.5) * 5;
            const pY = baseY - (oH * 0.2) - ((p + t.animTime * 2) % 12) / 12 * oH * 0.9;
            const px = sx + Math.cos(pAng) * pDist;
            const pAlpha = (1 - Math.abs(pY - (baseY - oH * 0.5)) / (oH * 0.5)) * 0.8 * pop3 * timeFrac;
            if (pAlpha <= 0) continue;
            ctx.globalAlpha = pAlpha;
            ctx.fillStyle = p % 3 === 0 ? '#cc99ff' : (p % 3 === 1 ? '#9966ee' : '#7744cc');
            ctx.beginPath();
            ctx.arc(px, pY, 1.5, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    // --- Floating arcane crystal above obelisk ---
    if (pop3 >= 0.95) {
        const crystalBaseY = sy - 48;
        const bob = Math.sin(t.animTime * 2.2) * 5;
        const crystalY = crystalBaseY + bob;
        const crystalPulse = 0.6 + Math.sin(t.animTime * 4.5) * 0.4;

        // Large outer glow — boosted for vivid visibility
        ctx.save();
        ctx.globalCompositeOperation = GFX.screenBlend ? 'screen' : 'source-over';
        const outerGlow = ctx.createRadialGradient(sx, crystalY, 0, sx, crystalY, 36);
        outerGlow.addColorStop(0, `rgba(200, 140, 255, ${0.45 * crystalPulse * timeFrac})`);
        outerGlow.addColorStop(0.3, `rgba(140, 80, 240, ${0.22 * timeFrac})`);
        outerGlow.addColorStop(0.7, `rgba(80, 40, 180, ${0.08 * timeFrac})`);
        outerGlow.addColorStop(1, 'rgba(40, 15, 100, 0)');
        ctx.fillStyle = outerGlow;
        ctx.fillRect(sx - 36, crystalY - 36, 72, 72);

        // Crystal shape — bright diamond
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 0.95 * timeFrac;

        // Outer crystal body
        ctx.fillStyle = `rgba(150, 80, 240, ${0.8 + crystalPulse * 0.2})`;
        ctx.beginPath();
        ctx.moveTo(sx, crystalY - 13);
        ctx.lineTo(sx + 8, crystalY);
        ctx.lineTo(sx, crystalY + 13);
        ctx.lineTo(sx - 8, crystalY);
        ctx.closePath();
        ctx.fill();

        // Inner bright facet
        ctx.fillStyle = `rgba(220, 180, 255, ${crystalPulse})`;
        ctx.beginPath();
        ctx.moveTo(sx, crystalY - 8);
        ctx.lineTo(sx + 5, crystalY);
        ctx.lineTo(sx, crystalY + 8);
        ctx.lineTo(sx - 5, crystalY);
        ctx.closePath();
        ctx.fill();

        // White-hot core
        ctx.fillStyle = `rgba(255, 240, 255, ${0.9 * crystalPulse})`;
        ctx.beginPath();
        ctx.arc(sx, crystalY, 3, 0, Math.PI * 2);
        ctx.fill();

        // Light beam connecting crystal to obelisk top
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = 0.35 * timeFrac;
        ctx.strokeStyle = '#bb88ff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(sx, crystalY + 13);
        ctx.lineTo(sx, sy - 40 * pop3);
        ctx.stroke();

        ctx.restore();

        // --- Targeting beam to current enemy ---
        if (t.targetEnemy && t.targetEnemy.state !== 'death') {
            const ePos = tileToScreen(t.targetEnemy.row, t.targetEnemy.col);
            const ex = ePos.x + cameraX;
            const ey = ePos.y + cameraY;

            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            ctx.globalAlpha = 0.18 + Math.sin(t.animTime * 6) * 0.08;
            ctx.strokeStyle = '#bb88ff';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([4, 5]);
            ctx.beginPath();
            ctx.moveTo(sx, crystalY);
            ctx.lineTo(ex, ey);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.restore();
        }
    }

    // --- Duration warning ---
    if (dying) {
        const warn = Math.sin(t.animTime * 14) > 0 ? 0.5 : 0.15;
        ctx.save();
        ctx.globalAlpha = warn;
        ctx.strokeStyle = '#ff5533';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(sx, sy + 4, 18, 8, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }
}

// Draws all tower glow effects (called after darkness layer)
function drawAllTowerGlows() {
    for (const t of summons) {
        drawTowerGlow(t);
    }
}

// ----- DRAW PLACEMENT PREVIEW -----
function drawPlacementPreview() {
    // --- Draw channeling ritual circle ---
    if (placement.channeling) {
        const progress = Math.min(1, placement.channelTimer / placement.channelDuration);
        const pos = tileToScreen(placement.channelRow, placement.channelCol);
        const sx = pos.x + cameraX;
        const sy = pos.y + cameraY;

        ctx.save();
        // Expanding magic circle on ground
        const maxRadius = 35;
        const radius = maxRadius * progress;

        // Outer circle
        ctx.globalAlpha = 0.6 * (1 - progress * 0.3);
        ctx.strokeStyle = '#bb77ff';
        ctx.lineWidth = 2;
        ctx.shadowColor = '#9944ff';
        ctx.shadowBlur = 15;
        ctx.beginPath();
        ctx.arc(sx, sy, radius, 0, Math.PI * 2);
        ctx.stroke();

        // Inner rune ring (rotating)
        const runeRadius = radius * 0.65;
        const runeCount = 6;
        const runeAngle = placement.channelTimer * 4;
        ctx.globalAlpha = 0.8 * progress;
        ctx.fillStyle = '#cc88ff';
        ctx.font = '10px Georgia';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const runes = ['✦', '◆', '✧', '◇', '⬥', '✶'];
        for (let i = 0; i < runeCount; i++) {
            const a = runeAngle + (i / runeCount) * Math.PI * 2;
            const rx = sx + Math.cos(a) * runeRadius;
            const ry = sy + Math.sin(a) * runeRadius * 0.5; // squash for isometric
            ctx.fillText(runes[i], rx, ry);
        }

        // Central glow buildup
        const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, radius * 0.5);
        glow.addColorStop(0, `rgba(153, 68, 255, ${0.4 * progress})`);
        glow.addColorStop(1, 'rgba(153, 68, 255, 0)');
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(sx, sy, radius * 0.5, 0, Math.PI * 2);
        ctx.fill();

        // Progress ring
        ctx.globalAlpha = 0.9;
        ctx.strokeStyle = '#ddaaff';
        ctx.lineWidth = 3;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(sx, sy - 45, 12, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
        ctx.stroke();

        ctx.restore();
        return; // don't draw placement indicator while channeling
    }

    if (!placement.active) return;

    const pos = tileToScreen(placement.row, placement.col);
    const sx = pos.x + cameraX;
    const sy = pos.y + cameraY;
    const t = performance.now() / 1000; // time for animations

    ctx.save();

    // --- Range circle around player ---
    const pPos = tileToScreen(player.row, player.col);
    const pcx = pPos.x + cameraX;
    const pcy = pPos.y + cameraY;
    // Range in screen units (approximate — 6 tiles)
    const rangePixX = 6 * HALF_DW * 1.2;
    const rangePixY = 6 * HALF_DH * 1.2;
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = placement.valid ? '#9966ff' : '#663333';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.ellipse(pcx, pcy, rangePixX, rangePixY, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // --- Tower range circle at cursor ---
    const tRangeX = TOWER_RANGE * HALF_DW * 1.1;
    const tRangeY = TOWER_RANGE * HALF_DH * 1.1;
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = placement.valid ? '#7744cc' : '#442222';
    ctx.beginPath();
    ctx.ellipse(sx, sy, tRangeX, tRangeY, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 0.25;
    ctx.strokeStyle = placement.valid ? '#9966ff' : '#884444';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.ellipse(sx, sy, tRangeX, tRangeY, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // --- Ghost tower preview ---
    if (placement.valid) {
        // Arcane ground glow
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = 0.2 + Math.sin(t * 4) * 0.08;
        const gGrad = ctx.createRadialGradient(sx, sy + 4, 0, sx, sy + 4, 26);
        gGrad.addColorStop(0, 'rgba(120, 70, 220, 0.4)');
        gGrad.addColorStop(1, 'rgba(60, 30, 120, 0)');
        ctx.fillStyle = gGrad;
        ctx.beginPath();
        ctx.ellipse(sx, sy + 4, 26, 12, 0, 0, Math.PI * 2);
        ctx.fill();

        // Ghost obelisk silhouette
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 0.35 + Math.sin(t * 3) * 0.1;
        const oH = 42, oW = 14, oTop = 8;
        const baseY = sy + 2;
        const topY = baseY - oH;

        ctx.fillStyle = 'rgba(100, 60, 180, 0.5)';
        ctx.beginPath();
        ctx.moveTo(sx - oTop, topY);
        ctx.lineTo(sx + oTop, topY);
        ctx.lineTo(sx + oW, baseY);
        ctx.lineTo(sx - oW, baseY);
        ctx.closePath();
        ctx.fill();

        // Ghost crystal
        const crystalY = sy - 48 + Math.sin(t * 2.5) * 3;
        ctx.fillStyle = `rgba(180, 130, 255, ${0.4 + Math.sin(t * 5) * 0.15})`;
        ctx.beginPath();
        ctx.moveTo(sx, crystalY - 9);
        ctx.lineTo(sx + 6, crystalY);
        ctx.lineTo(sx, crystalY + 9);
        ctx.lineTo(sx - 6, crystalY);
        ctx.closePath();
        ctx.fill();

        // "Click to place" text
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = '#ccbbee';
        ctx.font = '9px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('CLICK TO SUMMON', sx, sy + 24);
        ctx.fillText(`${SUMMON_MANA_COST} MP · ${SUMMON_MANA_COST}s`, sx, sy + 34);
    } else {
        // Invalid placement indicator
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 0.3;
        ctx.strokeStyle = '#882222';
        ctx.lineWidth = 2;
        const crossR = 10;
        ctx.beginPath();
        ctx.moveTo(sx - crossR, sy - crossR * 0.5);
        ctx.lineTo(sx + crossR, sy + crossR * 0.5);
        ctx.moveTo(sx + crossR, sy - crossR * 0.5);
        ctx.lineTo(sx - crossR, sy + crossR * 0.5);
        ctx.stroke();
    }

    ctx.restore();
}

// ----- DRAW TOWER BOLTS -----
function drawTowerBolts() {
    for (const b of towerBolts) {
        const pos = tileToScreen(b.row, b.col);
        const px = pos.x + cameraX;
        const py = pos.y + cameraY;

        if (!b.hit) {
            // Ground shadow for tower bolt
            ctx.save();
            ctx.globalAlpha = 0.12;
            ctx.fillStyle = '#000';
            ctx.beginPath();
            ctx.ellipse(px, py + 6, 6, 2.5, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        if (b.hit) {
            // Small arcane impact
            const frac = Math.max(0, b.life / 0.2);
            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            const r = (1 - frac) * 20 + 4;
            const g = ctx.createRadialGradient(px, py, 0, px, py, r);
            g.addColorStop(0, `rgba(200, 160, 255, ${0.7 * frac})`);
            g.addColorStop(0.5, `rgba(120, 60, 220, ${0.3 * frac})`);
            g.addColorStop(1, 'rgba(60, 20, 140, 0)');
            ctx.fillStyle = g;
            ctx.fillRect(px - r, py - r, r * 2, r * 2);
            ctx.restore();
            continue;
        }

        // Arcane bolt glow
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        const bloom = ctx.createRadialGradient(px, py, 0, px, py, 14);
        bloom.addColorStop(0, 'rgba(180, 130, 255, 0.7)');
        bloom.addColorStop(0.4, 'rgba(120, 70, 220, 0.3)');
        bloom.addColorStop(1, 'rgba(60, 20, 140, 0)');
        ctx.fillStyle = bloom;
        ctx.fillRect(px - 14, py - 14, 28, 28);

        // Core
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = '#e0ccff';
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.arc(px, py, 3, 0, Math.PI * 2);
        ctx.fill();

        // Arcane trail
        if (b.trail) {
            for (let ti = 0; ti < b.trail.length; ti++) {
                const t = b.trail[ti];
                const tp = tileToScreen(t.row, t.col);
                const tx = tp.x + cameraX;
                const ty = tp.y + cameraY;
                const frac = ti / b.trail.length;
                const ageFade = Math.max(0, 1 - t.age * 4);
                ctx.globalCompositeOperation = 'screen';
                ctx.globalAlpha = frac * 0.4 * ageFade;
                ctx.fillStyle = `rgba(160, 120, 255, ${frac * 0.5})`;
                ctx.beginPath();
                ctx.arc(tx, ty, 3 * frac, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.restore();
    }
}

function drawRoomAmbientTint() {
    // Dungeon: disabled — drawDarkness() provides all needed atmosphere.
    // Town: struggling torchlight with flickering glow and darkness halos
    if (currentZone !== 0) return;

    const mapSize = MAP_SIZE;
    const now = performance.now();

    for (let r = 0; r < mapSize; r++) {
        for (let c = 0; c < mapSize; c++) {
            const ot = objectMap[r] && objectMap[r][c];
            if (ot !== 't_lightpost' && ot !== 'stoneColumnWood') continue;

            const pos = tileToScreen(r, c);
            const sx = pos.x + cameraX;
            const sy = pos.y + cameraY - 25;

            if (sx < -160 || sx > canvasW + 160 || sy < -160 || sy > canvasH + 160) continue;

            // Double-frequency flicker — fast flutter + slow pulse = struggling torch
            const flicker1 = 0.5 + Math.sin(now / 250 + r * 2.3) * 0.3;
            const flicker2 = 0.6 + Math.sin(now / 1100 + c * 4.1) * 0.2;
            const flicker = flicker1 * flicker2;

            ctx.save();

            // Pass 1: darkness halo around the torch (overlay darken via source-over)
            // Using source-over with alpha instead of multiply to avoid visible rectangles
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = 1;
            const halo = ctx.createRadialGradient(sx, sy, 50, sx, sy, 120);
            halo.addColorStop(0, 'rgba(0, 0, 0, 0.12)');
            halo.addColorStop(0.6, 'rgba(0, 0, 0, 0.06)');
            halo.addColorStop(1, 'rgba(0, 0, 0, 0)');  // fully transparent at edge = no rect
            ctx.fillStyle = halo;
            ctx.fillRect(sx - 125, sy - 125, 250, 250);

            // Pass 2: warm torchlight glow (screen/additive) — the actual light
            ctx.globalCompositeOperation = 'screen';
            ctx.globalAlpha = 0.18 * flicker;
            const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, 75);
            glow.addColorStop(0, 'rgba(255, 190, 90, 0.35)');
            glow.addColorStop(0.3, 'rgba(220, 140, 50, 0.15)');
            glow.addColorStop(0.7, 'rgba(180, 90, 20, 0.05)');
            glow.addColorStop(1, 'rgba(120, 50, 10, 0)');
            ctx.fillStyle = glow;
            ctx.fillRect(sx - 80, sy - 80, 160, 160);

            // Pass 3: tiny hot core at torch tip
            ctx.globalAlpha = 0.25 * flicker;
            const core = ctx.createRadialGradient(sx, sy - 8, 0, sx, sy - 8, 15);
            core.addColorStop(0, 'rgba(255, 240, 180, 0.6)');
            core.addColorStop(1, 'rgba(255, 180, 80, 0)');
            ctx.fillStyle = core;
            ctx.fillRect(sx - 18, sy - 26, 36, 36);

            ctx.restore();
        }
    }
}

function drawFogOfWar() {
    const lightRange = lightRadius;
    const wizPos = tileToScreen(player.row, player.col);
    const lightX = wizPos.x + cameraX;
    const lightY = wizPos.y + cameraY;

    // Radial gradient for light falloff
    const grad = ctx.createRadialGradient(lightX, lightY, 0, lightX, lightY, lightRange);
    grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    grad.addColorStop(0.7, 'rgba(0, 0, 0, 0.3)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0.8)');

    ctx.globalAlpha = 0.6;
    ctx.fillStyle = grad;
    ctx.fillRect(lightX - lightRange, lightY - lightRange, lightRange * 2, lightRange * 2);
}

// drawParticles — now delegates to the unified particle system in particles.js
// This wrapper exists so existing call sites (gameloop.js) don't need changing.
function drawParticles() {
    drawEffectParticles();
}

