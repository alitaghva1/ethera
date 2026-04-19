// ============================================================
//  DESTRUCTIBLES — breakable scenery for tactical variety
// ============================================================
//
//  Per-wave props (urns, crates, barrels) that spawn around the
//  combat area. Player projectiles and melee can smash them for
//  gold, HP orbs, or nothing. Non-blocking — pure "smash for loot"
//  flavor (Hades-style).
//
//  Hooks:
//    - spawnWaveDestructibles(zoneTheme)   — called at wave start ('fighting')
//    - checkProjectileDestructibleHit(p)   — called in projectile loop before enemy check
//    - damageDestructible(d, dmg)          — handle damage + break
//    - applyMeleeDestructibleHits(r,c,r2)  — player melee sweep
//    - updateDestructibles(dt)             — tick animations, cleanup dead
//    - drawDestructibles()                 — render pass
//    - clearDestructibles()                — cleanup on zone change
//
// ============================================================

// --- Definitions ---
const DESTRUCTIBLE_DEFS = {
    urn:     { name: 'Urn',     hp: 8,  hitboxR: 0.45, color: '#c49060', glyph: '⚱', goldRange: [4, 9], healChance: 0.08, healAmount: 8 },
    crate:   { name: 'Crate',   hp: 14, hitboxR: 0.5,  color: '#8a6030', glyph: '□', goldRange: [6, 14], healChance: 0.04, healAmount: 10 },
    barrel:  { name: 'Barrel',  hp: 18, hitboxR: 0.5,  color: '#6a4520', glyph: '◯', goldRange: [8, 18], healChance: 0.20, healAmount: 12 },
    skull:   { name: 'Skull',   hp: 6,  hitboxR: 0.4,  color: '#d8d0b8', glyph: '☠', goldRange: [3, 7],  healChance: 0.0,  healAmount: 0 },
    crystal: { name: 'Crystal', hp: 20, hitboxR: 0.45, color: '#88ccff', glyph: '◆', goldRange: [10, 22], healChance: 0.02, healAmount: 15 },
};

// Pool of types usable in each zone — gives each biome its own prop flavor
const DESTRUCTIBLE_ZONE_POOLS = {
    1: ['urn', 'crate', 'skull'],                     // Undercroft: dungeon junk
    2: ['crate', 'barrel', 'skull'],                  // Tower: storage
    3: ['urn', 'skull', 'crystal'],                   // Spire: bones + arcane
    4: ['barrel', 'skull', 'urn'],                    // Inferno: burning debris
    5: ['crate', 'crystal', 'skull'],                 // Frozen: frozen vessels
    6: ['skull', 'crystal', 'urn'],                   // Throne: macabre
};

// --- Runtime state ---
const destructibles = [];

// Spawn 3-6 destructibles around the player (within ~8 tile radius, on walkable floor).
function spawnWaveDestructibles() {
    if (typeof player === 'undefined' || typeof blocked === 'undefined' || typeof floorMap === 'undefined') return;
    if (typeof currentZone === 'undefined') return;

    // Skip for procedural abyss zones (100+) until we tune props — play it safe
    const zoneKey = currentZone < 100 && DESTRUCTIBLE_ZONE_POOLS[currentZone]
        ? currentZone
        : 1;
    const pool = DESTRUCTIBLE_ZONE_POOLS[zoneKey] || ['urn', 'crate'];

    const count = 3 + Math.floor(Math.random() * 4); // 3-6
    const ms = floorMap.length;
    let placed = 0;
    let attempts = 0;
    while (placed < count && attempts < 40) {
        attempts++;
        // Pick a tile 3-8 tiles from the player in any direction
        const dist = 3 + Math.random() * 5;
        const ang = Math.random() * Math.PI * 2;
        const tr = Math.floor(player.row + Math.cos(ang) * dist);
        const tc = Math.floor(player.col + Math.sin(ang) * dist);
        if (tr < 2 || tc < 2 || tr >= ms - 2 || tc >= ms - 2) continue;
        if (!floorMap[tr] || !floorMap[tr][tc]) continue;
        if (blocked[tr] && blocked[tr][tc]) continue;
        // Don't place on top of existing destructibles
        if (destructibles.some(d => Math.round(d.row) === tr && Math.round(d.col) === tc)) continue;
        // Don't place on top of other ground hazards
        if (typeof groundHazards !== 'undefined' && groundHazards.some(h => Math.floor(h.row) === tr && Math.floor(h.col) === tc)) continue;

        const type = pool[Math.floor(Math.random() * pool.length)];
        const def = DESTRUCTIBLE_DEFS[type];
        destructibles.push({
            type,
            row: tr + 0.5,
            col: tc + 0.5,
            hp: def.hp,
            maxHp: def.hp,
            hitFlash: 0,
            bobTime: Math.random() * 10,
            shakeTimer: 0,
        });
        placed++;
    }
}

function clearDestructibles() {
    destructibles.length = 0;
}

// Called from the projectile hit loop in enemies.js — returns true if the
// projectile was consumed by a destructible (caller may `continue` to next
// projectile). Piercing projectiles keep going.
function checkProjectileDestructibleHit(p) {
    for (let i = destructibles.length - 1; i >= 0; i--) {
        const d = destructibles[i];
        if (d.hp <= 0) continue;
        if (p.hitDestructibles && p.hitDestructibles.has(d)) continue;
        const def = DESTRUCTIBLE_DEFS[d.type];
        const dr = p.row - d.row;
        const dc = p.col - d.col;
        if (dr * dr + dc * dc < def.hitboxR * def.hitboxR) {
            const dmg = p.damage || (typeof FIREBALL_DAMAGE !== 'undefined' ? FIREBALL_DAMAGE : 10);
            damageDestructible(d, dmg);
            if (!p.hitDestructibles) p.hitDestructibles = new Set();
            p.hitDestructibles.add(d);
            if (!p.piercing) { p.hit = true; return true; }
        }
    }
    return false;
}

// Apply melee hits within a circular sweep (player attack). Called from
// applyMeleeHits in enemies.js or similar. Returns count broken.
function applyMeleeDestructibleHits(cx, cy, radius, damage) {
    let broken = 0;
    for (let i = destructibles.length - 1; i >= 0; i--) {
        const d = destructibles[i];
        if (d.hp <= 0) continue;
        const dr = cx - d.row;
        const dc = cy - d.col;
        if (dr * dr + dc * dc < radius * radius) {
            const wasAlive = d.hp > 0;
            damageDestructible(d, damage || 10);
            if (wasAlive && d.hp <= 0) broken++;
        }
    }
    return broken;
}

function damageDestructible(d, dmg) {
    if (!d || d.hp <= 0) return;
    d.hp -= dmg;
    d.hitFlash = 0.18;
    d.shakeTimer = 0.12;
    // Hit particles — wood chips / clay shards
    const def = DESTRUCTIBLE_DEFS[d.type];
    if (typeof spawnParticle === 'function') {
        for (let i = 0; i < 3; i++) {
            const ang = Math.random() * Math.PI * 2;
            spawnParticle(d.row, d.col, Math.cos(ang) * 1.5, -1 - Math.random() * 1.5, 0.3, def.color, 0.7);
        }
    }
    if (typeof sfxProjectileHit === 'function') {
        // Use a lighter SFX — don't want to sound like enemy hits
        if (typeof sfxChestOpen === 'function' && d.hp <= 0) sfxChestOpen();
    }
    if (d.hp <= 0) breakDestructible(d);
}

function breakDestructible(d) {
    const def = DESTRUCTIBLE_DEFS[d.type];
    // Big particle burst + screen shake on break
    if (typeof spawnParticle === 'function') {
        for (let i = 0; i < 10; i++) {
            const ang = Math.random() * Math.PI * 2;
            const spd = 1 + Math.random() * 2;
            spawnParticle(d.row, d.col, Math.cos(ang) * spd, -1 - Math.random() * 2, 0.5, def.color, 0.9);
        }
    }
    if (typeof addScreenShake === 'function') addScreenShake(2, 0.1);

    // Gold drop
    const gMin = def.goldRange[0], gMax = def.goldRange[1];
    const gold = Math.round(gMin + Math.random() * (gMax - gMin));
    if (typeof playerGold !== 'undefined') playerGold += gold;
    if (typeof runGoldEarned !== 'undefined') runGoldEarned += gold;
    if (typeof pickupTexts !== 'undefined') {
        pickupTexts.push({ text: '+' + gold + 'g', color: '#ffd700', row: d.row, col: d.col, offsetY: -8, life: 1.2 });
    }
    if (typeof sfxGoldPickup === 'function') sfxGoldPickup();

    // Small chance: HP heal
    if (Math.random() < def.healChance && def.healAmount > 0 && typeof player !== 'undefined' && typeof getPlayerMaxHP === 'function') {
        const maxHp = getPlayerMaxHP();
        const heal = Math.min(maxHp - player.hp, def.healAmount);
        if (heal > 0) {
            player.hp += heal;
            if (typeof pickupTexts !== 'undefined') {
                pickupTexts.push({ text: '+' + heal + ' HP', color: '#44dd66', row: d.row, col: d.col, offsetY: -22, life: 1.5 });
            }
            if (typeof spawnHealBurst === 'function' && typeof tileToScreen === 'function') {
                const pos = tileToScreen(d.row, d.col);
                spawnHealBurst(pos.x + cameraX, pos.y + cameraY);
            }
        }
    }
}

function updateDestructibles(dt) {
    for (let i = destructibles.length - 1; i >= 0; i--) {
        const d = destructibles[i];
        d.bobTime += dt;
        if (d.hitFlash > 0) d.hitFlash = Math.max(0, d.hitFlash - dt);
        if (d.shakeTimer > 0) d.shakeTimer = Math.max(0, d.shakeTimer - dt);
        if (d.hp <= 0) destructibles.splice(i, 1);
    }
}

function drawDestructibles() {
    if (typeof tileToScreen !== 'function') return;
    for (const d of destructibles) {
        if (d.hp <= 0) continue;
        _drawSingleDestructible(d);
    }
}

// Depth-sorted render hook — called per-destructible from the sprite pool in gameloop.
function _drawSingleDestructible(d) {
    if (!d || d.hp <= 0) return;
    if (typeof tileToScreen !== 'function') return;
    const def = DESTRUCTIBLE_DEFS[d.type];
    const pos = tileToScreen(d.row, d.col);
    let sx = pos.x + cameraX;
    let sy = pos.y + cameraY;
    if (d.shakeTimer > 0) {
        sx += (Math.random() - 0.5) * 4;
        sy += (Math.random() - 0.5) * 2;
    }
    const bob = Math.sin(d.bobTime * 1.5) * 1.2;

    ctx.save();

    // Ground shadow
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(sx, sy + 6, 11, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    const bodyR = 14;
    const iy = sy - 8 + bob;

    // Drop shadow / outline
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = 'rgba(15,10,5,0.85)';
    ctx.beginPath();
    ctx.arc(sx, iy, bodyR + 1, 0, Math.PI * 2);
    ctx.fill();

    // Body fill
    const bodyGrad = ctx.createRadialGradient(sx - 4, iy - 4, 2, sx, iy, bodyR);
    bodyGrad.addColorStop(0, _lightenColor(def.color, 0.35));
    bodyGrad.addColorStop(0.7, def.color);
    bodyGrad.addColorStop(1, _darkenColor(def.color, 0.4));
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.arc(sx, iy, bodyR, 0, Math.PI * 2);
    ctx.fill();

    // Hit flash
    if (d.hitFlash > 0) {
        ctx.globalAlpha = d.hitFlash / 0.18 * 0.8;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(sx, iy, bodyR, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.95;
    }

    // Glyph
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.lineWidth = 2;
    ctx.font = 'bold 16px Georgia';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeText(def.glyph, sx, iy + 1);
    ctx.fillText(def.glyph, sx, iy + 1);

    // Damage HP bar
    if (d.hp < d.maxHp && d.hp > 0) {
        const barW = 22;
        const barH = 3;
        const bx = sx - barW / 2;
        const by = sy + 14;
        const hpFrac = d.hp / d.maxHp;
        ctx.globalAlpha = 0.75;
        ctx.fillStyle = '#0a0404';
        ctx.fillRect(bx, by, barW, barH);
        ctx.fillStyle = '#dd7744';
        ctx.fillRect(bx, by, Math.max(1, barW * hpFrac), barH);
    }

    ctx.restore();
}

function _lightenColor(hex, amt) {
    const h = hex.replace('#', '');
    const n = parseInt(h, 16);
    const r = Math.min(255, ((n >> 16) & 0xff) + Math.round(amt * 255));
    const g = Math.min(255, ((n >> 8) & 0xff) + Math.round(amt * 255));
    const b = Math.min(255, (n & 0xff) + Math.round(amt * 255));
    return 'rgb(' + r + ',' + g + ',' + b + ')';
}
function _darkenColor(hex, amt) {
    const h = hex.replace('#', '');
    const n = parseInt(h, 16);
    const r = Math.max(0, ((n >> 16) & 0xff) - Math.round(amt * 255));
    const g = Math.max(0, ((n >> 8) & 0xff) - Math.round(amt * 255));
    const b = Math.max(0, (n & 0xff) - Math.round(amt * 255));
    return 'rgb(' + r + ',' + g + ',' + b + ')';
}
