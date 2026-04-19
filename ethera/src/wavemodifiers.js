// ============================================================
//  WAVE MODIFIERS — closed vocabulary of per-wave tags
// ============================================================
//
//  A wave can be tagged with a small set of modifier strings.
//  Each modifier is ONE clear change to the fight. Closed vocabulary
//  by design — if a new tag is proposed, justify it before adding.
//
//  Reference: Hades heat conditions, Gungeon's shrine affixes,
//  Risk of Rain 2's teleporter events. Each tag = one verb.
//
//  Hooks:
//    - applyWaveModifiers(wave)   — at fighting-phase start
//    - updateWaveModifiers(dt)    — per-frame while wave active
//    - clearWaveModifiers()       — at wave cleared / run reset
//    - drawWaveModifierOverlay()  — optional HUD indicator
//
// ============================================================

const WAVE_MOD_DEFS = {
    // Visibility crushed. Player must fight at close range + trust audio.
    // Implementation: lightRadius × 0.45 while active.
    darkness: {
        name: 'Darkness',
        icon: '☾',
        color: '#6688cc',
        desc: 'Visibility halved',
    },
    // Destructibles line up across the arena — creates cover / tactical positioning.
    // Implementation: spawn 6-8 barrels in a line perpendicular to spawn direction.
    funnel: {
        name: 'Funnel',
        icon: '⫽',
        color: '#c48840',
        desc: 'Choke point',
    },
    // More enemies, less HP. Power fantasy wave.
    // Implementation: 2× spawn count (applied in wave data pre-multiply), enemies take 3× damage.
    stampede: {
        name: 'Stampede',
        icon: '⇶',
        color: '#cc4466',
        desc: 'Glass horde',
    },
};

// --- Runtime state ---
const waveModState = {
    active: [],               // array of modifier ids currently running
    darknessLightMult: 1,     // read by rendering.js for light radius
    _funnelSpawned: false,    // per-wave flag so we don't double-spawn
};

function clearWaveModifiers() {
    waveModState.active.length = 0;
    waveModState.darknessLightMult = 1;
    waveModState._funnelSpawned = false;
}

// Called after spawnWaveEnemies when wave.phase === 'fighting'.
function applyWaveModifiers(wave) {
    clearWaveModifiers();
    const mods = (wave && wave.modifiers) || [];
    if (!mods || mods.length === 0) return;

    for (const id of mods) {
        if (!WAVE_MOD_DEFS[id]) continue;
        waveModState.active.push(id);

        if (id === 'darkness') {
            // 0.60 is intentionally less aggressive than "halved" — light combines
            // multiplicatively with abyss / boss-arena dims, and "half of half" makes
            // the screen unreadable. Plus the HUD can bleed into the dark edges.
            waveModState.darknessLightMult = 0.60;
            if (typeof triggerScreenFlash === 'function') triggerScreenFlash(0.25, '#223344');
        }

        if (id === 'stampede') {
            // Glass horde — enemies take ~3× damage by being reduced to 33% HP.
            // Designer bumps spawn count in wave data for the "more of them" feel.
            if (typeof enemies !== 'undefined') {
                for (const e of enemies) {
                    if (e.def && e.def.isBoss) continue;
                    if (e.hp > 0) {
                        e.hp = Math.max(1, Math.round(e.hp * 0.33));
                        e.maxHp = e.hp;
                    }
                }
            }
        }

        if (id === 'funnel' && !waveModState._funnelSpawned) {
            waveModState._funnelSpawned = true;
            _spawnFunnelDestructibles();
        }
    }
}

// Called per frame from gameloop update.
function updateWaveModifiers(dt) {
    if (waveModState.active.length === 0) return;
    // Darkness: occasional subtle flicker for atmosphere
    if (waveModState.active.indexOf('darkness') >= 0) {
        if (Math.random() < 0.02 && typeof addScreenShake === 'function') {
            addScreenShake(1, 0.08);
        }
    }
}

// Render a small row under the objective showing active modifier tags.
function drawWaveModifierOverlay() {
    if (waveModState.active.length === 0) return;
    if (typeof ctx === 'undefined') return;

    const startX = 18;
    const y = 64;
    ctx.save();
    for (let i = 0; i < waveModState.active.length; i++) {
        const def = WAVE_MOD_DEFS[waveModState.active[i]];
        if (!def) continue;
        const text = def.icon + ' ' + def.name.toUpperCase();
        ctx.font = 'bold 12px Georgia';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.globalAlpha = 0.9;
        ctx.strokeStyle = 'rgba(0,0,0,0.85)';
        ctx.lineWidth = 3;
        ctx.strokeText(text, startX, y + i * 18);
        ctx.fillStyle = def.color;
        ctx.fillText(text, startX, y + i * 18);
    }
    ctx.restore();
}

// --- Helpers ---

// Spawn a line of destructibles bisecting the arena perpendicular to the
// player→enemy direction. Creates a "choke point" feel.
function _spawnFunnelDestructibles() {
    if (typeof player === 'undefined' || typeof enemies === 'undefined') return;
    if (typeof destructibles === 'undefined' || typeof DESTRUCTIBLE_DEFS === 'undefined') return;
    if (typeof floorMap === 'undefined' || typeof blocked === 'undefined') return;

    // Aim point = average enemy position, fallback to far direction
    let aimR = player.row + 5, aimC = player.col;
    if (enemies.length > 0) {
        let tr = 0, tc = 0, n = 0;
        for (const e of enemies) {
            if (e.state === 'death') continue;
            tr += e.row; tc += e.col; n++;
        }
        if (n > 0) { aimR = tr / n; aimC = tc / n; }
    }
    // Line midpoint: halfway between player and enemies
    const midR = (player.row + aimR) / 2;
    const midC = (player.col + aimC) / 2;
    // Perpendicular direction
    const dr = aimR - player.row;
    const dc = aimC - player.col;
    const mag = Math.sqrt(dr * dr + dc * dc) || 1;
    const pdr = -dc / mag;  // perpendicular (rotate 90°)
    const pdc = dr / mag;

    const count = 7;
    const spacing = 1.2;
    const ms = floorMap.length;
    for (let i = 0; i < count; i++) {
        const offset = (i - (count - 1) / 2) * spacing;
        const tr = Math.floor(midR + pdr * offset);
        const tc = Math.floor(midC + pdc * offset);
        if (tr < 2 || tc < 2 || tr >= ms - 2 || tc >= ms - 2) continue;
        if (!floorMap[tr] || !floorMap[tr][tc]) continue;
        if (blocked[tr] && blocked[tr][tc]) continue;
        if (destructibles.some(d => Math.round(d.row) === tr && Math.round(d.col) === tc)) continue;
        const def = DESTRUCTIBLE_DEFS.barrel;
        destructibles.push({
            type: 'barrel',
            row: tr + 0.5,
            col: tc + 0.5,
            hp: def.hp,
            maxHp: def.hp,
            hitFlash: 0,
            bobTime: Math.random() * 10,
            shakeTimer: 0,
        });
    }
}
