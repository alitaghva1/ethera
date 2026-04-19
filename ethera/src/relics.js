// ============================================================
//  RELICS — Hades-style between-wave power-ups
// ============================================================
//
//  After each wave, three relics spawn as floating pickups near
//  the player. Walking onto one grants its effect for the rest of
//  the run; the other two fade. Relics stack if picked multiple times.
//
//  Wiring points:
//    - forms.js getPlayerMaxHP()      → adds runRelicState.maxHpBonus
//    - enemies.js calcPlayerDmgBonus()→ multiplies in runRelicState.dmgMult
//    - enemies.js applyEnemyHit()     → critBonus, critDmgBonus, healOnKill
//    - enemies.js gold drop path      → goldMult
//    - movement.js effMoveSpeed       → moveSpeedMult
//    - ui.js drawRelicHUD             → top-right icon row
//    - gameloop.js drawWorldKeyDrops  → render branch for relic drops
//
// ============================================================

// --- Definitions ---
// Each relic has a simple effect object that maps to runRelicState fields.
// "Mult" suffix = stacks multiplicatively (starts at 1), anything else = additive (starts at 0).
const RELIC_DEFS = {
    power:      { name: 'Relic of Power',     desc: '+20% damage',         color: '#ff6644', glyph: '⚔', rarity: 'common', effect: { dmgMult: 1.20 } },
    fortune:    { name: 'Relic of Fortune',   desc: '+15% crit chance',    color: '#ffcc44', glyph: '✦', rarity: 'common', effect: { critBonus: 0.15 } },
    warlord:    { name: 'Relic of Warlord',   desc: '+50% crit damage',    color: '#dd4466', glyph: '☠', rarity: 'common', effect: { critDmgBonus: 0.50 } },
    vitality:   { name: 'Relic of Vitality',  desc: '+30 max HP + heal',   color: '#44dd66', glyph: '♥', rarity: 'common', effect: { maxHpBonus: 30, healOnPickup: 1.0 } },
    swiftness:  { name: 'Relic of Swiftness', desc: '+15% move speed',     color: '#88ddff', glyph: '⚡', rarity: 'common', effect: { moveSpeedMult: 1.15 } },
    ferocity:   { name: 'Relic of Ferocity',  desc: '+18% attack speed',   color: '#ff8844', glyph: '⚒', rarity: 'common', effect: { atkSpeedMult: 1.18 } },
    vampire:    { name: 'Relic of Vampire',   desc: 'Heal 2 HP on kill',   color: '#cc44aa', glyph: '◈', rarity: 'rare',   effect: { healOnKill: 2 } },
    greed:      { name: 'Relic of Greed',     desc: '+50% gold from kills',color: '#e8c840', glyph: '$', rarity: 'common', effect: { goldMult: 1.50 } },
    resonance:  { name: 'Relic of Resonance', desc: '+15% dmg & +8% crit', color: '#cc88ff', glyph: '◉', rarity: 'rare',   effect: { dmgMult: 1.15, critBonus: 0.08 } },
};

const RELIC_RARITY_WEIGHT = { common: 10, rare: 3 };

// --- Runtime state ---
// Mutable global. Reset on new run / death (see resetRunRelics).
const runRelicState = {
    owned: [],          // [{id, count}] — tracked with count for stacking display
    dmgMult: 1,
    critBonus: 0,
    critDmgBonus: 0,
    maxHpBonus: 0,
    moveSpeedMult: 1,
    atkSpeedMult: 1,
    healOnKill: 0,
    goldMult: 1,
};

function resetRunRelics() {
    runRelicState.owned.length = 0;
    runRelicState.dmgMult = 1;
    runRelicState.critBonus = 0;
    runRelicState.critDmgBonus = 0;
    runRelicState.maxHpBonus = 0;
    runRelicState.moveSpeedMult = 1;
    runRelicState.atkSpeedMult = 1;
    runRelicState.healOnKill = 0;
    runRelicState.goldMult = 1;
}

// --- Grant a relic to the player ---
// Applies its effects and shows a notification. Handles stacking (increments count).
function grantRelic(id) {
    const def = RELIC_DEFS[id];
    if (!def) return;

    // Track ownership (stacked count)
    const existing = runRelicState.owned.find(r => r.id === id);
    if (existing) existing.count++;
    else runRelicState.owned.push({ id, count: 1 });

    // Apply effects
    for (const key in def.effect) {
        const v = def.effect[key];
        if (key === 'healOnPickup') {
            // Heal to max on pickup (vitality relic)
            if (typeof player !== 'undefined' && typeof getPlayerMaxHP === 'function') {
                player.hp = Math.min(getPlayerMaxHP(), player.hp + Math.round(getPlayerMaxHP() * v));
            }
            continue;
        }
        if (key.endsWith('Mult')) {
            runRelicState[key] = (runRelicState[key] || 1) * v;
        } else {
            runRelicState[key] = (runRelicState[key] || 0) + v;
        }
    }

    // Feedback
    if (typeof addScreenShake === 'function') addScreenShake(4, 0.3);
    if (typeof sfxPowerup === 'function') sfxPowerup();
    else if (typeof sfxChestOpen === 'function') sfxChestOpen();
    if (typeof triggerScreenFlash === 'function') triggerScreenFlash(0.2, def.color);
    if (typeof Notify !== 'undefined') {
        Notify.toast(def.name + ' — ' + def.desc, {
            duration: 3.5,
            color: def.color,
            borderColor: def.color,
        });
    }
    if (typeof pickupTexts !== 'undefined' && typeof player !== 'undefined') {
        pickupTexts.push({
            row: player.row, col: player.col,
            text: def.name,
            color: def.color,
            life: 2.5, offsetY: -20,
        });
    }
}

// --- Spawn a 3-choice relic drop near a point ---
// Three relics float in a triangle; picking one removes all three (via choiceGroup).
let _relicChoiceCounter = 1;

function spawnRelicChoice(row, col) {
    if (typeof worldKeyDrops === 'undefined') return;
    const picks = pickRandomRelicIds(3);
    if (picks.length === 0) return;

    // Place in a triangle around the target point, offset ~1.6 tiles
    const baseAng = -Math.PI / 2; // first slot directly "up" from player
    const groupId = _relicChoiceCounter++;
    for (let i = 0; i < picks.length; i++) {
        const ang = baseAng + (i - 1) * (Math.PI * 0.5);
        const dist = 1.6;
        worldKeyDrops.push({
            row: row + Math.cos(ang) * dist,
            col: col + Math.sin(ang) * dist,
            id: 'relic',
            relicId: picks[i],
            choiceGroup: groupId,
            bobTime: Math.random() * 10,
            spawnTime: 0.6,
        });
    }
}

// Spawn a single relic drop at a point (for elite kill rewards — no choice, just grab it).
function spawnSingleRelic(row, col) {
    if (typeof worldKeyDrops === 'undefined') return;
    const picks = pickRandomRelicIds(1);
    if (picks.length === 0) return;
    worldKeyDrops.push({
        row, col,
        id: 'relic',
        relicId: picks[0],
        choiceGroup: _relicChoiceCounter++, // unique group — not part of any 3-choice
        bobTime: Math.random() * 10,
        spawnTime: 0.5,
    });
}

// Pick N relic ids weighted by rarity, without duplicates in the same choice.
function pickRandomRelicIds(n) {
    const pool = [];
    for (const id in RELIC_DEFS) {
        const w = RELIC_RARITY_WEIGHT[RELIC_DEFS[id].rarity] || 1;
        for (let i = 0; i < w; i++) pool.push(id);
    }
    const picked = [];
    while (picked.length < n && pool.length > 0) {
        const idx = Math.floor(Math.random() * pool.length);
        const id = pool[idx];
        if (!picked.includes(id)) picked.push(id);
        // Remove ALL entries for this id so we don't duplicate in one choice
        for (let i = pool.length - 1; i >= 0; i--) if (pool[i] === id) pool.splice(i, 1);
    }
    return picked;
}

// --- Pickup handler — called from tryPickupKeyDrops ---
function checkRelicPickup() {
    if (typeof worldKeyDrops === 'undefined' || typeof player === 'undefined') return;
    for (let i = worldKeyDrops.length - 1; i >= 0; i--) {
        const d = worldKeyDrops[i];
        if (d.id !== 'relic') continue;
        if (d.spawnTime > 0) continue;
        const dr = d.row - player.row;
        const dc = d.col - player.col;
        if (Math.sqrt(dr * dr + dc * dc) < 1.1) {
            grantRelic(d.relicId);
            const group = d.choiceGroup;
            // Remove ALL drops in the same choice group (other two fade)
            for (let j = worldKeyDrops.length - 1; j >= 0; j--) {
                if (worldKeyDrops[j].id === 'relic' && worldKeyDrops[j].choiceGroup === group) {
                    worldKeyDrops.splice(j, 1);
                }
            }
            return; // pick only one per frame
        }
    }
}

// --- Render a relic drop on the ground ---
// Called from drawWorldKeyDrops() for entries with id === 'relic'.
function drawRelicDrop(d, sx, sy, bob, fadeIn, t) {
    const def = RELIC_DEFS[d.relicId];
    if (!def) return;
    const rgb = _relicHexToRgb(def.color);
    const iy = sy - 22 + bob;

    // Ground glow
    ctx.globalCompositeOperation = 'screen';
    const pulse = 0.55 + Math.sin(t * 2.8) * 0.25;
    const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, 40);
    glow.addColorStop(0, 'rgba(' + rgb + ',' + (0.5 * pulse) + ')');
    glow.addColorStop(0.5, 'rgba(' + rgb + ',' + (0.18 * pulse) + ')');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(sx - 40, sy - 40, 80, 80);

    // Orb body
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = fadeIn * 0.95;
    const orbR = 11 + Math.sin(t * 2) * 1.5;
    const orbGrad = ctx.createRadialGradient(sx - 3, iy - 3, 2, sx, iy, orbR);
    orbGrad.addColorStop(0, '#ffffff');
    orbGrad.addColorStop(0.35, def.color);
    orbGrad.addColorStop(1, 'rgba(' + rgb + ',0.6)');
    ctx.fillStyle = orbGrad;
    ctx.beginPath();
    ctx.arc(sx, iy, orbR, 0, Math.PI * 2);
    ctx.fill();

    // Crisp ring
    ctx.strokeStyle = def.color;
    ctx.lineWidth = 2;
    ctx.globalAlpha = fadeIn * 0.8;
    ctx.beginPath();
    ctx.arc(sx, iy, orbR + 1.5, 0, Math.PI * 2);
    ctx.stroke();

    // Glyph in center
    ctx.globalAlpha = fadeIn * 0.95;
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px Georgia';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(def.glyph, sx, iy + 1);

    // Label underneath (small, only when player is near)
    if (typeof player !== 'undefined') {
        const dr = d.row - player.row;
        const dc = d.col - player.col;
        const nearDist = Math.sqrt(dr * dr + dc * dc);
        if (nearDist < 3.0) {
            const labelAlpha = Math.max(0, Math.min(1, (3.0 - nearDist) / 1.5)) * fadeIn;
            ctx.globalAlpha = labelAlpha;
            ctx.font = 'bold 11px Georgia';
            ctx.fillStyle = def.color;
            ctx.strokeStyle = 'rgba(0,0,0,0.9)';
            ctx.lineWidth = 3;
            ctx.strokeText(def.name, sx, iy + orbR + 14);
            ctx.fillText(def.name, sx, iy + orbR + 14);
            // Desc line
            ctx.globalAlpha = labelAlpha * 0.85;
            ctx.font = '10px Georgia';
            ctx.fillStyle = '#e0d4b0';
            ctx.strokeText(def.desc, sx, iy + orbR + 28);
            ctx.fillText(def.desc, sx, iy + orbR + 28);
        }
    }
}

// --- HUD: owned relics row (top-right) ---
function drawRelicHUD() {
    if (runRelicState.owned.length === 0) return;
    if (typeof canvasW === 'undefined' || typeof canvasH === 'undefined') return;

    const iconSize = 28;
    const pad = 6;
    const startX = canvasW - 14 - iconSize;
    const y = 80; // below minimap / talisman icon area

    ctx.save();
    // Iterate right-to-left so the first owned relic is rightmost
    for (let i = 0; i < runRelicState.owned.length; i++) {
        const entry = runRelicState.owned[i];
        const def = RELIC_DEFS[entry.id];
        if (!def) continue;
        const x = startX - i * (iconSize + pad);
        const cx = x + iconSize / 2;
        const cy = y + iconSize / 2;

        // Ring
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = 'rgba(10,10,14,0.75)';
        ctx.strokeStyle = def.color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(cx, cy, iconSize / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Glyph
        ctx.globalAlpha = 1;
        ctx.fillStyle = def.color;
        ctx.font = 'bold 16px Georgia';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(def.glyph, cx, cy + 1);

        // Stack count
        if (entry.count > 1) {
            ctx.fillStyle = '#fff';
            ctx.strokeStyle = 'rgba(0,0,0,0.9)';
            ctx.lineWidth = 3;
            ctx.font = 'bold 11px Georgia';
            ctx.textAlign = 'right';
            ctx.textBaseline = 'alphabetic';
            const tx = x + iconSize;
            const ty = y + iconSize;
            ctx.strokeText('×' + entry.count, tx, ty);
            ctx.fillText('×' + entry.count, tx, ty);
        }
    }
    ctx.restore();
}

// --- Helpers ---
function _relicHexToRgb(hex) {
    const h = hex.replace('#', '');
    const n = parseInt(h, 16);
    return ((n >> 16) & 0xff) + ',' + ((n >> 8) & 0xff) + ',' + (n & 0xff);
}
