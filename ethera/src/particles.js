// ----- PARTICLES -----
// ============================================================
//  COORDINATE HELPERS
// ============================================================
function tileToScreen(row, col) {
    return {
        x: (col - row) * HALF_DW,
        y: (col + row) * HALF_DH
    };
}

function screenToTile(screenX, screenY) {
    // Inverse of tileToScreen, accounting for camera offset
    const wx = screenX - cameraX;
    const wy = screenY - cameraY;
    const col = 0.5 * (wx / HALF_DW + wy / HALF_DH);
    const row = 0.5 * (wy / HALF_DH - wx / HALF_DW);
    return { row, col };
}

// ============================================================
//  UNIFIED PARTICLE SYSTEM — pooled lifecycle manager
// ============================================================
// All particle spawning, updating, and drawing goes through here.
// Individual systems (enemies, slime, skeleton, towers) call
// spawnParticle / spawnDeathBurst / spawnHitSpark / spawnCastEffect
// which are defined here and manage the shared `particles` array.

// Hard cap is read from GFX.maxParticles (set by quality toggle in config.js)
const _particlePool = []; // recycled particle objects
const _PARTICLE_POOL_MAX = 120;

function _getPooledParticle() {
    return _particlePool.pop() || {};
}
function _recycleParticle(p) {
    if (_particlePool.length < _PARTICLE_POOL_MAX) _particlePool.push(p);
}

// Create a particle and add it to the active array.
// Returns the particle object so callers can set extra fields.
function _emitParticle(x, y, vx, vy, life, size, color, alpha, type, compositeOp) {
    // Hard cap — drop oldest non-ambient particles when full
    const cap = GFX.maxParticles;
    if (particles.length >= cap) {
        // Find first non-ambient particle to recycle
        for (let i = 0; i < particles.length; i++) {
            if (particles[i].type) {
                // Swap-and-pop (O(1) instead of O(n))
                _recycleParticle(particles[i]);
                particles[i] = particles[particles.length - 1];
                particles.pop();
                break;
            }
        }
        // If still full, drop the oldest regardless
        if (particles.length >= cap) {
            // Swap oldest with last, then pop (O(1) instead of O(n))
            _recycleParticle(particles[0]);
            particles[0] = particles[particles.length - 1];
            particles.pop();
        }
    }
    const p = _getPooledParticle();
    p.x = x;           p.y = y;
    p.vx = vx;         p.vy = vy;
    p.life = life;      p.maxLife = life;
    p.size = size;      p.color = color || '#ffaa44';
    p.alpha = alpha !== undefined ? alpha : 0.8;
    p.type = type || 'effect';
    p.compositeOp = compositeOp || null;
    // Clear leftover fields from pooled reuse
    p.angle = 0; p.speed = 0; p.drift = 0;
    particles.push(p);
    return p;
}

// ============================================================
//  PUBLIC SPAWN HELPERS (called from enemies, towers, forms)
// ============================================================

// Spawn a single particle at tile coords (converted to screen internally)
function spawnParticle(tileRow, tileCol, vr, vc, life, color, alpha) {
    const pos = tileToScreen(tileRow, tileCol);
    _emitParticle(
        pos.x + cameraX, pos.y + cameraY,
        vr, vc, life,
        2 + Math.random() * 2,
        color, alpha, 'effect'
    );
}

// Death burst — three-tier particle system (research: burst + chunks + soul drift)
function spawnDeathBurst(worldX, worldY, color) {
    const c = color || '#ff6644';
    // Tier 1: Fast radial spark ring (2x count, longer life)
    const count = Math.max(10, Math.round((28 + Math.floor(Math.random() * 8)) * GFX.particleMul));
    for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
        const speed = 3.5 + Math.random() * 3.0;
        _emitParticle(
            worldX, worldY,
            Math.cos(angle) * speed, Math.sin(angle) * speed,
            0.8 + Math.random() * 0.4, 2.5 + Math.random() * 2,
            c, 0.9, 'death', 'screen'
        );
    }
    // Tier 2: Gravity chunks — medium speed, arc downward (new!)
    const chunkCount = Math.max(3, Math.round(6 * GFX.particleMul));
    for (let i = 0; i < chunkCount; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 2.0 + Math.random() * 2.0;
        const p = _emitParticle(
            worldX + (Math.random() - 0.5) * 6,
            worldY + (Math.random() - 0.5) * 4,
            Math.cos(angle) * speed, -1.5 - Math.random() * 2.0,
            0.7 + Math.random() * 0.3, 3.0 + Math.random() * 2,
            c, 0.75, 'death', 'screen'
        );
    }
    // Tier 3: Soul drift — slow, larger particles rising from the corpse
    const soulCount = Math.max(3, Math.round(6 * GFX.particleMul));
    for (let i = 0; i < soulCount; i++) {
        _emitParticle(
            worldX + (Math.random() - 0.5) * 10,
            worldY + (Math.random() - 0.5) * 5,
            (Math.random() - 0.5) * 0.6,
            -0.7 - Math.random() * 0.5,
            1.4 + Math.random() * 0.6,
            4.0 + Math.random() * 2.5,
            c, 0.35, 'soul', 'screen'
        );
    }
}

// Healing sparkle — green particles rising from player on HP pickup
function spawnHealBurst(worldX, worldY) {
    const count = Math.max(5, Math.round(10 * GFX.particleMul));
    for (let i = 0; i < count; i++) {
        _emitParticle(
            worldX + (Math.random() - 0.5) * 14,
            worldY - Math.random() * 8,
            (Math.random() - 0.5) * 1.0,
            -1.4 - Math.random() * 0.8,
            0.8 + Math.random() * 0.4,
            2.0 + Math.random() * 1.5,
            '#44dd66', 0.7, 'heal', 'screen'
        );
    }
}

// Hit spark — bright directional sparks on projectile impact
function spawnHitSpark(worldX, worldY, dirX, dirY) {
    const count = Math.max(4, Math.round((6 + Math.floor(Math.random() * 4)) * GFX.particleMul));
    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 4.0 + Math.random() * 3.0;
        // Bias direction away from projectile travel (if provided)
        const bx = dirX ? -dirX * 1.5 : 0;
        const by = dirY ? -dirY * 1.5 : 0;
        _emitParticle(
            worldX, worldY,
            Math.cos(angle) * speed + bx, Math.sin(angle) * speed + by,
            0.4 + Math.random() * 0.15, 1.5 + Math.random() * 1.0,
            '#ffff99', 0.9, 'hitspark', 'screen'
        );
    }
}

// Cast effect — ring of arcane sparks when casting a spell
function spawnCastEffect(worldX, worldY) {
    const count = Math.max(2, Math.round((4 + Math.floor(Math.random() * 3)) * GFX.particleMul));
    for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.6;
        const speed = 2.0 + Math.random() * 1.8;
        _emitParticle(
            worldX, worldY,
            Math.cos(angle) * speed, Math.sin(angle) * speed,
            0.3, 1.8 + Math.random() * 1.2,
            '#6688ff', 0.75, 'cast'
        );
    }
}

// Evolution burst — large radial burst at tile position (used for evolution transform)
function spawnParticleBurst(tileRow, tileCol, count, color) {
    const pos = tileToScreen(tileRow, tileCol);
    const wx = pos.x + cameraX;
    const wy = pos.y + cameraY;
    const n = Math.max(8, Math.round(count * GFX.particleMul));
    for (let i = 0; i < n; i++) {
        const angle = (Math.PI * 2 * i) / n + (Math.random() - 0.5) * 0.5;
        const speed = 3.5 + Math.random() * 4;
        _emitParticle(
            wx, wy,
            Math.cos(angle) * speed, Math.sin(angle) * speed,
            0.8 + Math.random() * 0.5,
            3 + Math.random() * 3,
            color || '#e8c840', 0.95, 'death', 'screen'
        );
    }
}

// ============================================================
//  UPDATE — tick all effect particles (ambient handled in ui.js)
// ============================================================
function updateEffectParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        // Skip ambient particles (they have no 'type' field — handled by updateParticles in ui.js)
        if (!p.type) continue;

        p.life -= dt;
        if (p.life <= 0) {
            _recycleParticle(p);
            particles[i] = particles[particles.length - 1];
            particles.pop();
            i--; // re-check the swapped element
            continue;
        }

        // Physics: velocity and gravity
        if (p.type === 'death' || p.type === 'hitspark') {
            p.vy += 2.5 * dt;
        } else if (p.type === 'cast') {
            p.vy += 1.5 * dt;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
    }
}

// ============================================================
//  DRAW — render all effect particles
// ============================================================
function drawEffectParticles() {
    ctx.save();
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        // Skip ambient particles (handled elsewhere)
        if (!p.type) continue;

        // Fog-aware culling — hide particles in unexplored areas
        const tilePos = screenToTile(p.x - cameraX, p.y - cameraY);
        const tr = Math.floor(tilePos.row), tc = Math.floor(tilePos.col);
        let fogMul = 1;
        if (tr >= 0 && tr < fogRevealed.length && tc >= 0 && tc < fogRevealed.length) {
            const fv = fogRevealed[tr][tc];
            if (fv <= 0) continue; // completely hidden — skip
            if (fv < 1) fogMul = fv; // dim in peek zone
        }

        // Fade out at end of life
        const ageFrac = Math.max(0, p.life / (p.maxLife || 1));
        ctx.globalAlpha = (p.alpha || 0.5) * ageFrac * fogMul;

        // Use screen blending for death particles for visibility in dark dungeons
        if (p.compositeOp && GFX.screenBlend) {
            ctx.globalCompositeOperation = p.compositeOp;
        }

        ctx.fillStyle = p.color || '#ffaa44';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size || 1, 0, Math.PI * 2);
        ctx.fill();

        // Reset composite operation
        if (p.compositeOp) {
            ctx.globalCompositeOperation = 'source-over';
        }
    }
    ctx.restore();
}
