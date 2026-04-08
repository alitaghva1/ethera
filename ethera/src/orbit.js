// ============================================================
//  ORBIT FIREBALLS (Arcane Orbit upgrade)
// ============================================================
function updateOrbitFireballs(dt) {
    const count = getUpgrade('orbit');
    if (count <= 0) return;
    if (gamePaused || gameDead) return;
    orbitAngle += dt * 3.0; // rotation speed
    // Check collision with enemies
    for (let i = 0; i < count; i++) {
        const a = orbitAngle + (i / count) * Math.PI * 2;
        const orbRow = player.row + Math.cos(a) * 1.8;
        const orbCol = player.col + Math.sin(a) * 1.8;
        for (const e of enemies) {
            if (e.state === 'death' || e.orbitHitCooldown > 0) continue;
            const dr = orbRow - e.row;
            const dc = orbCol - e.col;
            if (Math.sqrt(dr*dr + dc*dc) < e.def.hitboxR + 0.3) {
                e.hp -= 12;
                e.orbitHitCooldown = 0.5; // prevent rapid re-hits
                sfxOrbitHit();
                e.state = 'hurt'; e.hurtTimer = 0.15; e.animFrame = 0;
                if (e.hp <= 0) {
                    e.hp = 0; e.state = 'death'; e.deathTimer = 0.7; e.animFrame = 0;
                    sfxEnemyDeath();
                    rollEnemyLoot(e);
                }
            }
        }
    }
}

function drawOrbitFireballs() {
    const count = getUpgrade('orbit');
    if (count <= 0) return;
    for (let i = 0; i < count; i++) {
        const a = orbitAngle + (i / count) * Math.PI * 2;
        const orbRow = player.row + Math.cos(a) * 1.8;
        const orbCol = player.col + Math.sin(a) * 1.8;
        const pos = tileToScreen(orbRow, orbCol);
        const sx = pos.x + cameraX;
        const sy = pos.y + cameraY;

        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        // Glow
        const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, 14);
        g.addColorStop(0, 'rgba(255, 180, 40, 0.7)');
        g.addColorStop(0.5, 'rgba(255, 80, 10, 0.3)');
        g.addColorStop(1, 'rgba(100, 20, 0, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(sx - 14, sy - 14, 28, 28);
        // Core
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = '#ffe080';
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.arc(sx, sy, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

