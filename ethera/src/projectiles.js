// ============================================================
//  PROJECTILE SYSTEM
// ============================================================
function updateProjectiles(dt) {
    for (let i = projectiles.length - 1; i >= 0; i--) {
        const p = projectiles[i];
        p.life -= dt;

        if (p.hit) {
            // Impact explosion — just decay
            p.life -= dt * 3; // faster death after impact
            if (p.life <= 0) { recycleProj(projectiles.splice(i, 1)[0]); }
            continue;
        }

        // Move projectile
        const newRow = p.row + p.vr * dt;
        const newCol = p.col + p.vc * dt;

        // Save trail points (ring buffer — no allocations)
        trailPush(p.trail, p.row, p.col);

        // Boomerang logic
        if (p.isBoomerang) {
            p.boomerangTimer += dt;
            if (p.boomerangTimer > 0.4 && !p.returning) {
                p.returning = true;
                // Reverse toward player
                const dr = player.row - newRow;
                const dc = player.col - newCol;
                const dist = Math.sqrt(dr * dr + dc * dc) || 1;
                const speed = Math.sqrt(p.vr * p.vr + p.vc * p.vc);
                p.vr = (dr / dist) * speed;
                p.vc = (dc / dist) * speed;
                p.life = 3.0; // extend life to make it back
                p.pierceLeft = Math.min((p.pierce || 0), BOOMERANG_RETURN_PIERCE_CAP); // capped return pierce
            }
        }

        // Check wall collision
        if (!canMoveTo(newRow, newCol)) {
            // Check if we hit a cracked wall — break it open
            const _wallR = Math.floor(newRow), _wallC = Math.floor(newCol);
            if (typeof objectMap !== 'undefined' && objectMap[_wallR] && objectMap[_wallR][_wallC] === 'crackedWall') {
                if (typeof breakCrackedWall === 'function') breakCrackedWall(_wallR, _wallC);
            }
            // Handle bounce
            if (p.bounceLeft > 0) {
                p.bounceLeft--;
                // Reflect velocity: try bouncing off either row or col axis
                const rowOk = canMoveTo(newRow, p.col);
                const colOk = canMoveTo(p.row, newCol);
                if (rowOk && colOk) {
                    // Both available, bounce off the axis we hit
                    const rowDist = Math.abs(newRow - p.row);
                    const colDist = Math.abs(newCol - p.col);
                    if (rowDist > colDist) {
                        p.vr = -p.vr;
                        p.row = newRow;
                    } else {
                        p.vc = -p.vc;
                        p.col = newCol;
                    }
                } else if (rowOk) {
                    p.vr = -p.vr;
                    p.row = newRow;
                } else if (colOk) {
                    p.vc = -p.vc;
                    p.col = newCol;
                } else {
                    // Stuck, die
                    p.hit = true;
                    p.life = 0.3;
                }
            } else {
                p.hit = true;
                p.life = 0.3; // linger for impact effect
                // Wall impact sparks
                if (typeof spawnHitSpark === 'function') {
                    const wallPos = tileToScreen(p.row, p.col);
                    spawnHitSpark(wallPos.x + cameraX, wallPos.y + cameraY);
                }
            }
            continue;
        }

        p.row = newRow;
        p.col = newCol;

        // Tick fireball animation
        p.animTime += dt;

        // Age trail points (ring buffer)
        for (let ti = 0; ti < p.trail.count; ti++) {
            p.trail.buf[(((p.trail.head - p.trail.count + TRAIL_MAX) % TRAIL_MAX) + ti) % TRAIL_MAX].age += dt;
        }

        // Remove if expired or out of map
        const mapBound = floorMap.length;
        if (p.life <= 0 || p.row < -1 || p.row > mapBound + 1 || p.col < -1 || p.col > mapBound + 1) {
            recycleProj(projectiles.splice(i, 1)[0]);
        }
    }
}

function drawProjectiles() {
    for (const p of projectiles) {
        const pos = tileToScreen(p.row, p.col);
        const px = pos.x + cameraX;
        const py = pos.y + cameraY;

        if (p.hit) {
            drawImpact(px, py, p);
            continue;
        }

        // Ground shadow for projectile
        ctx.save();
        ctx.globalAlpha = 0.15;
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.ellipse(px, py + 8, 8, 3, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // === ACID PROJECTILE (slime — green acid spit) ===
        if (p.isAcid) {
            // Acid pool glow on ground
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            const acidR = 40;
            const acidGlow = ctx.createRadialGradient(px, py + 6, 0, px, py + 6, acidR);
            acidGlow.addColorStop(0, 'rgba(80, 220, 40, 0.35)');
            acidGlow.addColorStop(0.5, 'rgba(50, 160, 30, 0.15)');
            acidGlow.addColorStop(1, 'rgba(30, 80, 15, 0)');
            ctx.fillStyle = acidGlow;
            ctx.beginPath();
            ctx.ellipse(px, py + 6, acidR, acidR * 0.45, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            // Sprite-based acid blob (AI-generated frames)
            // life counts down from projLife — map to frame 0→5 as projectile ages
            const _acidMaxLife = (typeof FORM_CONFIGS !== 'undefined' && FORM_CONFIGS.slime) ? FORM_CONFIGS.slime.projLife : 1.4;
            const acidProgress = 1 - Math.max(0, Math.min(1, p.life / _acidMaxLife));
            const acidFrame = Math.min(5, Math.floor(acidProgress * 6));
            const acidSprite = images['proj_acid_' + acidFrame];
            if (acidSprite) {
                ctx.save();
                ctx.imageSmoothingEnabled = false;
                const acidSz = p.size * 4;
                ctx.drawImage(acidSprite, px - acidSz / 2, py - acidSz / 2, acidSz, acidSz);
                ctx.restore();
            } else {
                // Procedural fallback
                ctx.save();
                ctx.globalAlpha = 0.85;
                ctx.fillStyle = 'rgba(70, 210, 40, 0.9)';
                ctx.beginPath();
                ctx.arc(px, py, p.size, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = 0.5;
                ctx.fillStyle = '#ccffcc';
                ctx.beginPath();
                ctx.arc(px - p.size * 0.3, py - p.size * 0.3, p.size * 0.4, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }
            continue;
        }

        // === BONE PROJECTILE (skeleton — player form) ===
        if (p.isBone) {
            // Brighter ground glow — green-tinted to match skeleton form theme
            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            const boneR = 32;
            const boneGlow = ctx.createRadialGradient(px, py + 6, 0, px, py + 6, boneR);
            boneGlow.addColorStop(0, 'rgba(200, 240, 160, 0.4)');
            boneGlow.addColorStop(0.4, 'rgba(160, 200, 120, 0.18)');
            boneGlow.addColorStop(1, 'rgba(80, 120, 50, 0)');
            ctx.fillStyle = boneGlow;
            ctx.beginPath();
            ctx.ellipse(px, py + 6, boneR, boneR * 0.45, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            // Bone shard — sprite-based (AI-generated spinning bone with soul energy)
            const boneFrame = Math.floor(((performance.now() / 1000) * 8 + p.row * 3) % 6);
            const boneSprite = images['proj_bone_' + boneFrame];
            if (boneSprite) {
                ctx.save();
                ctx.imageSmoothingEnabled = false;
                const boneSz = p.size * 5;
                ctx.drawImage(boneSprite, px - boneSz / 2, py - boneSz / 2, boneSz, boneSz);
                ctx.restore();
            } else {
                // Procedural fallback
                ctx.save();
                ctx.globalAlpha = 0.92;
                const bScreenX = (p.vc - p.vr);
                const bScreenY = (p.vc + p.vr) * 0.5;
                const bAngle = Math.atan2(bScreenY, bScreenX);
                ctx.translate(px, py);
                ctx.rotate(bAngle);
                ctx.fillStyle = '#f0ecd4';
                ctx.beginPath();
                ctx.moveTo(-p.size * 1.2, 0);
                ctx.lineTo(-p.size * 0.4, -p.size * 0.5);
                ctx.lineTo(p.size * 1.2, 0);
                ctx.lineTo(-p.size * 0.4, p.size * 0.5);
                ctx.closePath();
                ctx.fill();
                ctx.strokeStyle = 'rgba(255, 255, 220, 0.8)';
                ctx.lineWidth = 1.0;
                ctx.stroke();
                ctx.restore();
            }
            continue;
        }

        // === DARK PROJECTILE (lich) ===
        if (p.isDark) {
            // Soul energy pool glow on ground
            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            const darkR = 35;
            const darkGlow = ctx.createRadialGradient(px, py + 6, 0, px, py + 6, darkR);
            darkGlow.addColorStop(0, 'rgba(180, 60, 255, 0.35)');
            darkGlow.addColorStop(0.5, 'rgba(120, 40, 200, 0.15)');
            darkGlow.addColorStop(1, 'rgba(60, 20, 100, 0)');
            ctx.fillStyle = darkGlow;
            ctx.beginPath();
            ctx.ellipse(px, py + 6, darkR, darkR * 0.45, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            // Soul bolt — sprite-based (AI-generated purple soul energy)
            const soulFrame = Math.floor(((performance.now() / 1000) * 8 + p.col * 2) % 6);
            const soulSprite = images['proj_soul_' + soulFrame];
            if (soulSprite) {
                ctx.save();
                ctx.imageSmoothingEnabled = false;
                const soulSz = p.size * 5;
                ctx.drawImage(soulSprite, px - soulSz / 2, py - soulSz / 2, soulSz, soulSz);
                ctx.restore();
            } else {
                // Procedural fallback
                ctx.save();
                ctx.globalCompositeOperation = 'screen';
                ctx.globalAlpha = 0.8;
                ctx.fillStyle = 'rgba(150, 60, 220, 0.9)';
                ctx.beginPath();
                ctx.arc(px, py, p.size, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = 0.6;
                ctx.fillStyle = 'rgba(80, 20, 140, 0.8)';
                ctx.beginPath();
                ctx.arc(px, py, p.size * 0.6, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }
            continue;
        }

        // --- Ground fire light pool ---
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        const groundR = 45;
        const flicker = 0.9 + Math.sin(p.animTime * 18) * 0.1;
        const groundGrad = ctx.createRadialGradient(px, py + 6, 0, px, py + 6, groundR);
        groundGrad.addColorStop(0, `rgba(255, 160, 40, ${0.35 * flicker})`);
        groundGrad.addColorStop(0.4, `rgba(255, 80, 20, ${0.15 * flicker})`);
        groundGrad.addColorStop(1, 'rgba(120, 30, 0, 0)');
        ctx.fillStyle = groundGrad;
        ctx.beginPath();
        ctx.ellipse(px, py + 6, groundR, groundR * 0.45, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // --- Fire trail with color/scale interpolation (ring buffer) ---
        ctx.save();
        trailForEach(p.trail, function(t, i, total) {
            const tp = tileToScreen(t.row, t.col);
            const tx = tp.x + cameraX;
            const ty = tp.y + cameraY;
            const frac = i / total; // 0=oldest, 1=newest
            const ageFade = Math.max(0, 1 - t.age * 3); // fade by actual age

            // Outer glow: orange→red as it ages
            ctx.globalCompositeOperation = 'screen';
            const r = Math.round(255 - (1-frac) * 80);
            const g = Math.round(120 * frac + 30);
            const b = Math.round(20 * frac);
            ctx.globalAlpha = frac * 0.4 * ageFade;
            ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
            ctx.beginPath();
            ctx.arc(tx, ty, p.size * frac * 1.6, 0, Math.PI * 2);
            ctx.fill();

            // Inner yellow-white hot center — shrinks with age
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = frac * 0.75 * ageFade;
            ctx.fillStyle = `rgba(255, 230, 120, ${frac * 0.7})`;
            ctx.beginPath();
            ctx.arc(tx, ty, p.size * frac * 0.5 * (0.5 + ageFade * 0.5), 0, Math.PI * 2);
            ctx.fill();
        });
        ctx.restore();

        // --- Outer fire bloom ---
        ctx.save();
        const bloom = ctx.createRadialGradient(px, py, 0, px, py, p.size * 4.5);
        bloom.addColorStop(0, `rgba(255, 200, 60, ${0.7 * flicker})`);
        bloom.addColorStop(0.2, `rgba(255, 120, 30, ${0.4 * flicker})`);
        bloom.addColorStop(0.5, `rgba(200, 50, 10, ${0.15 * flicker})`);
        bloom.addColorStop(1, 'rgba(100, 20, 0, 0)');
        ctx.globalCompositeOperation = 'screen';
        ctx.fillStyle = bloom;
        ctx.fillRect(px - p.size * 4.5, py - p.size * 4.5, p.size * 9, p.size * 9);
        ctx.restore();

        // --- Fireball sprite ---
        const fbFrame = Math.floor(p.animTime * 10) % 6;
        const fbAI = images['proj_fireball_' + fbFrame];
        if (fbAI) {
            ctx.save();
            ctx.imageSmoothingEnabled = false;
            const fbSz = p.size * 5;
            ctx.translate(px, py);
            ctx.rotate(p.angle);
            ctx.drawImage(fbAI, -fbSz / 2, -fbSz / 2, fbSz, fbSz);
            ctx.restore();
            // AI sprite has core + embers baked in — skip procedural overlays
        } else {
            const fbImg = images.fireball;
            if (fbImg) {
                const frame = Math.floor(p.animTime * 14) % FIREBALL_FRAMES;
                const fbScale = 0.55;
                const dw = FIREBALL_FRAME_W * fbScale;
                const dh = FIREBALL_FRAME_H * fbScale;
                ctx.save();
                ctx.translate(px, py);
                ctx.rotate(p.angle);
                ctx.globalCompositeOperation = 'screen';
                ctx.drawImage(fbImg,
                    frame * FIREBALL_FRAME_W, 0, FIREBALL_FRAME_W, FIREBALL_FRAME_H,
                    -dw / 2, -dh / 2, dw, dh);
                ctx.globalAlpha = 0.5;
                ctx.drawImage(fbImg,
                    frame * FIREBALL_FRAME_W, 0, FIREBALL_FRAME_W, FIREBALL_FRAME_H,
                    -dw / 2, -dh / 2, dw, dh);
                ctx.restore();
            }

            // --- White-yellow hot core (procedural only) ---
            ctx.save();
            ctx.globalCompositeOperation = 'source-over';
            ctx.fillStyle = '#fff8e0';
            ctx.globalAlpha = 0.85;
            ctx.beginPath();
            ctx.arc(px, py, p.size * 0.35, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            // --- Orbiting embers (procedural only) ---
            ctx.save();
            for (let s = 0; s < 5; s++) {
                const ang = (s / 5) * Math.PI * 2 + p.animTime * 10;
                const dist = p.size * 1.0 + Math.sin(p.animTime * 16 + s) * 3;
                ctx.globalAlpha = 0.6 + Math.sin(p.animTime * 12 + s * 2) * 0.4;
                ctx.fillStyle = s % 2 === 0 ? '#ffaa30' : '#ff6600';
                ctx.beginPath();
                ctx.arc(px + Math.cos(ang) * dist, py + Math.sin(ang) * dist, 1.5, 0, Math.PI * 2);
                ctx.fill();
            }
        ctx.restore();
    }
}

function drawImpact(px, py, p) {
    const frac = Math.max(0, p.life / 0.3);
    ctx.save();
    ctx.globalCompositeOperation = 'screen';

    // Ground fire flash
    const groundR = 60;
    const gndGrad = ctx.createRadialGradient(px, py + 4, 0, px, py + 4, groundR * frac);
    gndGrad.addColorStop(0, `rgba(255, 200, 60, ${0.5 * frac})`);
    gndGrad.addColorStop(0.4, `rgba(255, 100, 20, ${0.3 * frac})`);
    gndGrad.addColorStop(1, 'rgba(120, 30, 0, 0)');
    ctx.fillStyle = gndGrad;
    ctx.beginPath();
    ctx.ellipse(px, py + 4, groundR * frac, groundR * frac * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();

    // Fire burst
    const r = (1 - frac) * 45 + 10;
    const grad = ctx.createRadialGradient(px, py, 0, px, py, r);
    grad.addColorStop(0, `rgba(255, 240, 180, ${0.85 * frac})`);
    grad.addColorStop(0.25, `rgba(255, 160, 40, ${0.6 * frac})`);
    grad.addColorStop(0.5, `rgba(220, 60, 10, ${0.3 * frac})`);
    grad.addColorStop(1, 'rgba(100, 20, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(px - r, py - r, r * 2, r * 2);

    // Expanding fire ring
    ctx.strokeStyle = `rgba(255, 140, 30, ${0.5 * frac})`;
    ctx.lineWidth = 2.5 * frac;
    ctx.beginPath();
    ctx.arc(px, py, r * 0.7, 0, Math.PI * 2);
    ctx.stroke();

    // Ember scatter
    for (let i = 0; i < 10; i++) {
        const ang = (i / 10) * Math.PI * 2 + (p.life || 0) * 8;
        const dist = (1 - frac) * 30 + 5;
        ctx.globalAlpha = frac * 0.8;
        ctx.fillStyle = i % 3 === 0 ? '#ffe080' : (i % 3 === 1 ? '#ff8030' : '#ff4400');
        ctx.beginPath();
        ctx.arc(px + Math.cos(ang) * dist, py + Math.sin(ang) * dist, 2.2 * frac, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.restore();
}

