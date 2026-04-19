// ============================================================
//  KEY ITEMS — special non-equipment items (keys, journal, etc.)
// ============================================================
const keyItems = [];  // array of { id, name, desc, color }

const KEY_ITEM_DEFS = {
    chest_key: {
        name: 'Rusted Key',
        desc: 'An old iron key, cold to the touch. It might open something nearby.',
        color: '#e8c860',
    },
    dungeon_key: {
        name: 'Dungeon Key',
        desc: 'A heavy key etched with arcane symbols. It unlocks the way forward.',
        color: '#cc88ff',
    },
    journal: {
        name: 'Worn Journal',
        desc: 'A leather-bound journal. Your handwriting fills the pages, though you remember none of it.',
        color: '#c4a878',
        pages: [
            {
                title: 'Note 1 — Before the Boglands',
                text: 'Elara left three days ago. No note, no warning.\nWe were so close to the source — she must have found it first.\nThe talisman she gave me pulses at night. It knows something I don\'t.',
            },
            {
                title: 'Note 2',
                text: 'Made it through the Boglands. Barely.\nEvery trail ends the same — no sign of her.\nThe rot here seeps into everything.',
            },
            {
                title: 'Note 3',
                text: 'Still no trace. Either I\'m too late, or she never came this way.\nThe veinflushed are worse each day — more of them, less of me.\nIf I stop moving, I don\'t think I get back up.',
            },
        ],
    },
    zone2_chest_key: {
        name: 'Tarnished Tower Key',
        desc: 'A large key bearing the sigil of the tower. It feels warm to the touch.',
        color: '#e8c860',
    },
    zone2_key: {
        name: 'Tower Key',
        desc: 'An ornate key of bronze and silver. It resonates with ancient magic.',
        color: '#ffaa44',
    },
    zone3_exit_key: {
        name: 'Spire\'s Descent Key',
        desc: 'A glowing key wreathed in otherworldly light. The talisman burns — something below is calling you deeper, not upward.',
        color: '#ff66ff',
    },
    zone4_key: {
        name: 'Infernal Passage Key',
        desc: 'A key forged in brimstone, still radiating heat. It opens the way to colder depths.',
        color: '#ff6633',
    },
    zone5_key: {
        name: 'Abyssal Seal Key',
        desc: 'A frozen key that burns to hold. The final seal awaits.',
        color: '#66ccff',
    },
    elara_letter: {
        name: 'Torn Letter',
        desc: 'A letter written in elegant, desperate handwriting. Addressed to no one — or perhaps to you.',
        color: '#e8b8d0',
        pages: [
            {
                title: 'A Letter, Unsent',
                text: 'If you\'re reading this, you survived.\nI\'m sorry. I know you won\'t understand.\nWhat I have to do, I have to do alone.\nThe Pale demands a vessel — one mind to hold the corruption at bay.\nIf we both go down, there\'s no one left.',
            },
            {
                title: '— Elara',
                text: 'Don\'t follow me. Please.\nThe talisman will keep you safe. It\'s the last of my power I could spare.\nForget me if you can.\nLive, if you remember how.',
            },
        ],
    },
    charred_fragment: {
        name: 'Charred Journal Fragment',
        desc: 'A half-burned page from someone else\'s journal. The edges crumble at your touch.',
        color: '#aa7744',
        pages: [
            {
                title: 'Unknown Author',
                text: 'The Pale Covenant is real. I\'ve seen the throne.\nShe sits there — eyes open, unblinking.\nHolding it all together through sheer will.\nThe corruption would swallow everything without her.',
            },
            {
                title: '(the rest is illegible)',
                text: 'I tried to reach her but the Pale\'s guardians...\nThey are not enemies. They are antibodies.\nThe Pale protects its vessel.\nAnyone who threatens the balance, it destroys.',
            },
        ],
    },
    // Quest chain items
    infernal_ore: {
        name: 'Infernal Ore',
        desc: 'A dark, pulsing chunk of ore still warm from the burning depths. Garrett could forge something powerful with this.',
        color: '#ff6633',
    },
    frost_essence: {
        name: 'Frost Essence',
        desc: 'A pale blue crystalline vial of distilled cold. Senna would know what to do with this.',
        color: '#88ccff',
    },
    ancient_tome: {
        name: 'Ancient Tome',
        desc: 'A heavy tome bound in something older than leather. The pages hum with forgotten knowledge. The Hermit seeks this.',
        color: '#cc88ff',
    },
};

function hasKeyItem(id) {
    return keyItems.some(k => k.id === id);
}

function grantKeyItem(id) {
    if (hasKeyItem(id)) return;
    const def = KEY_ITEM_DEFS[id];
    if (!def) return;
    keyItems.push({ id, ...def });

    pickupTexts.push({
        text: def.name,
        color: def.color,
        row: player.row, col: player.col,
        offsetY: 0,
        life: 2.5,
    });

    // Update objective based on key items
    if (id === 'journal') {
        currentObjective = 'Find a way deeper';
        setTimeout(() => {
            openJournalReader('journal');
        }, 800);
    } else if (id === 'dungeon_key') {
        currentObjective = 'Use the key to proceed';
    } else if (id === 'zone2_key') {
        currentObjective = 'Ascend the Ruined Tower';
    } else if (id === 'zone3_exit_key') {
        currentObjective = 'Escape this place';
    } else if (id === 'elara_letter') {
        currentObjective = 'Who is Elara?';
        setTimeout(() => {
            openJournalReader('elara_letter');
        }, 800);
    } else if (id === 'charred_fragment') {
        currentObjective = 'The Pale Covenant...';
        setTimeout(() => {
            openJournalReader('charred_fragment');
        }, 800);
    } else if (id === 'zone4_key') {
        currentObjective = 'Descend to the Frozen Abyss';
    } else if (id === 'zone5_key') {
        currentObjective = 'Face the Throne of Ruin';
    }

    // Quest item pickups — set quest flags and objectives
    if (id === 'infernal_ore') {
        if (typeof questState !== 'undefined') {
            questState.flags.has_infernal_ore = true;
            // Ore quality degrades based on how many waves cleared in Zone 4
            const waveCount = (typeof wave !== 'undefined') ? wave.current : 0;
            if (waveCount <= 2) {
                questState.flags.ore_quality = 3; // white-hot
                pickupTexts.push({ text: 'White-hot ore! Rush it back!', color: '#ffd700', row: player.row, col: player.col, offsetY: -15, life: 3 });
            } else if (waveCount <= 4) {
                questState.flags.ore_quality = 2; // still glowing
                pickupTexts.push({ text: 'The ore still glows...', color: '#ffaa44', row: player.row, col: player.col, offsetY: -15, life: 3 });
            } else {
                questState.flags.ore_quality = 1; // dimming
                pickupTexts.push({ text: 'The ore has dimmed...', color: '#aa7744', row: player.row, col: player.col, offsetY: -15, life: 3 });
            }
        }
        currentObjective = 'Return the ore to Garrett';
    } else if (id === 'frost_essence') {
        if (typeof questState !== 'undefined') questState.flags.has_frost_essence = true;
        currentObjective = 'Bring the essence to Senna';
    } else if (id === 'ancient_tome') {
        if (typeof questState !== 'undefined') questState.flags.has_ancient_tome = true;
        currentObjective = 'Return the tome to the Hermit';
    }
}

// ---- Journal Reader ----
function openJournalReader(itemId) {
    const def = KEY_ITEM_DEFS[itemId];
    if (!def || !def.pages || def.pages.length === 0) return;
    journalOpen = true;
    journalItemId = itemId;
    journalPage = 0;
    journalFadeIn = 0;
}

function closeJournalReader() {
    journalOpen = false;
    journalItemId = null;
}

function drawJournalReader() {
    if (!journalOpen || !journalItemId) return;
    const def = KEY_ITEM_DEFS[journalItemId];
    if (!def || !def.pages) { closeJournalReader(); return; }
    const pages = def.pages;
    // Clamp journalPage to valid bounds (BUG-028)
    journalPage = Math.max(0, Math.min(journalPage, pages.length - 1));
    const page = pages[journalPage] || pages[0];

    journalFadeIn = Math.min(1, journalFadeIn + 0.04);
    const fa = journalFadeIn;

    ctx.save();

    // Dim overlay
    ctx.globalAlpha = fa * 0.7;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvasW, canvasH);

    const cx = canvasW / 2;
    const cy = canvasH / 2;
    const pw = 380, ph = 340;
    const px = cx - pw / 2, py = cy - ph / 2;

    // Parchment background — warm aged paper look
    ctx.globalAlpha = fa * 0.95;
    const parchGrad = ctx.createLinearGradient(px, py, px, py + ph);
    parchGrad.addColorStop(0, '#1e1a14');
    parchGrad.addColorStop(0.1, '#1a1610');
    parchGrad.addColorStop(0.9, '#16130e');
    parchGrad.addColorStop(1, '#12100c');
    ctx.fillStyle = parchGrad;
    ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 6); ctx.fill();

    // Subtle horizontal texture lines
    ctx.globalAlpha = fa * 0.03;
    ctx.strokeStyle = '#c4a878';
    ctx.lineWidth = 0.5;
    for (let i = 0; i < ph; i += 5) {
        ctx.beginPath();
        ctx.moveTo(px + 12, py + i);
        ctx.lineTo(px + pw - 12, py + i);
        ctx.stroke();
    }

    // Border — gold frame
    ctx.globalAlpha = fa * 0.3;
    ctx.strokeStyle = '#a89060';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 6); ctx.stroke();

    // Inner border
    ctx.globalAlpha = fa * 0.1;
    ctx.strokeStyle = '#c4a878';
    ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.roundRect(px + 6, py + 6, pw - 12, ph - 12, 4); ctx.stroke();

    // Journal title
    ctx.globalAlpha = fa * 0.5;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'small-caps 10px Georgia';
    ctx.fillStyle = '#8a7a5a';
    ctx.fillText(def.name, cx, py + 22);

    // Decorative divider
    ctx.globalAlpha = fa * 0.15;
    ctx.strokeStyle = '#a89060';
    ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(cx - 60, py + 34); ctx.lineTo(cx + 60, py + 34); ctx.stroke();

    // Page title — "Note 1" etc.
    ctx.globalAlpha = fa * 0.65;
    ctx.font = 'italic 12px Georgia';
    ctx.fillStyle = '#c4a878';
    ctx.fillText(page.title, cx, py + 52);

    // Page text — handwriting style, line by line
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const lines = page.text.split('\n');
    let ly = py + 72;
    for (const rawLine of lines) {
        // Word wrap within parchment width
        ctx.font = '11px Georgia';
        ctx.globalAlpha = fa * 0.75;
        ctx.fillStyle = '#b8a888';
        const maxW = pw - 60;
        const words = rawLine.split(' ');
        let curLine = '';
        for (const word of words) {
            const test = curLine + (curLine ? ' ' : '') + word;
            if (ctx.measureText(test).width > maxW) {
                ctx.fillText(curLine, px + 30, ly);
                ly += 18;
                curLine = word;
            } else {
                curLine = test;
            }
        }
        if (curLine) { ctx.fillText(curLine, px + 30, ly); ly += 18; }
        ly += 6; // paragraph gap
    }

    // Torn/damaged note at bottom
    ctx.globalAlpha = fa * 0.2;
    ctx.font = 'italic 9px Georgia';
    ctx.fillStyle = '#8a7a5a';
    ctx.textAlign = 'center';
    if (journalPage === pages.length - 1) {
        ctx.fillText('The remaining pages are torn or illegible.', cx, py + ph - 70);
    }

    // Page navigation
    const navY = py + ph - 40;
    ctx.textBaseline = 'middle';
    ctx.font = '10px monospace';

    // Previous page
    if (journalPage > 0) {
        ctx.globalAlpha = fa * 0.5;
        ctx.fillStyle = '#c4a878';
        ctx.textAlign = 'left';
        ctx.fillText('< prev', px + 20, navY);
    }

    // Page indicator
    ctx.globalAlpha = fa * 0.3;
    ctx.fillStyle = '#8a7a5a';
    ctx.textAlign = 'center';
    ctx.font = '9px monospace';
    ctx.fillText((journalPage + 1) + ' / ' + pages.length, cx, navY);

    // Next page
    if (journalPage < pages.length - 1) {
        ctx.globalAlpha = fa * 0.5;
        ctx.fillStyle = '#c4a878';
        ctx.textAlign = 'right';
        ctx.font = '10px monospace';
        ctx.fillText('next >', px + pw - 20, navY);
    }

    // Close hint
    ctx.globalAlpha = fa * 0.2;
    ctx.textAlign = 'center';
    ctx.font = '8px monospace';
    ctx.fillStyle = '#8a7a5a';
    ctx.fillText('[ESC] to close', cx, py + ph - 14);

    ctx.restore();
}

// World key drops — special glowing drops that grant key items on pickup
const worldKeyDrops = [];

function dropKeyItemInWorld(row, col, itemId) {
    const def = KEY_ITEM_DEFS[itemId];
    if (!def) return;
    worldKeyDrops.push({
        row, col, itemId,
        name: def.name,
        color: def.color,
        bobTime: Math.random() * 10,
        spawnTime: 0.5,
    });
}

function tryPickupKeyDrops() {
    // Check talisman pickup first
    checkTalismanPickup();
    // Check relic drops (non-blocking, multi-choice pickups)
    if (typeof checkRelicPickup === 'function') checkRelicPickup();
    // Check other key drops
    for (let i = worldKeyDrops.length - 1; i >= 0; i--) {
        const d = worldKeyDrops[i];
        if (d.spawnTime > 0) continue;
        if (d.id === 'talisman' || d.id === 'relic') continue; // handled above
        if (!d.itemId) continue; // skip drops without an itemId (defensive)
        const dr = d.row - player.row;
        const dc = d.col - player.col;
        if (Math.sqrt(dr * dr + dc * dc) < PICKUP_RANGE) {
            grantKeyItem(d.itemId);
            sfxChestOpen();
            worldKeyDrops.splice(i, 1);
        }
    }
}

function updateWorldKeyDrops(dt) {
    for (const d of worldKeyDrops) {
        d.bobTime += dt * DROP_FLOAT_SPEED;
        if (d.spawnTime > 0) d.spawnTime -= dt;
    }
}

// Equip an item from backpack
function equipItem(backpackIdx) {
    const item = inventory.backpack[backpackIdx];
    if (!item) return;
    const slot = item.slot;
    const current = inventory.equipped[slot];
    // Swap: unequip current to backpack, equip new
    inventory.backpack.splice(backpackIdx, 1);
    if (current) inventory.backpack.push(current);
    inventory.equipped[slot] = item;
    if (typeof getEquipBonuses === 'function') equipBonus = getEquipBonuses();
    equipBonusDirty = false; // just recalculated
    if (typeof sfxEquip === 'function') sfxEquip();
}

// Unequip to backpack
function unequipItem(slot) {
    const item = inventory.equipped[slot];
    if (!item) return;
    if (inventory.backpack.length >= inventory.maxBackpack) {
        // Show notification when unequip fails (BUG-039)
        pickupTexts.push({
            text: 'Backpack Full!',
            color: '#ff6b6b',
            row: player.row, col: player.col,
            offsetY: 0,
            life: 1.2,
        });
        return;
    }
    inventory.equipped[slot] = null;
    inventory.backpack.push(item);
    if (typeof getEquipBonuses === 'function') equipBonus = getEquipBonuses();
    equipBonusDirty = false; // just recalculated
    if (typeof sfxUnequip === 'function') sfxUnequip();
}

// Drop item from backpack to world
function dropFromBackpack(backpackIdx) {
    const item = inventory.backpack[backpackIdx];
    if (!item) return;
    inventory.backpack.splice(backpackIdx, 1);
    dropItemInWorld(player.row + (Math.random() - 0.5) * 0.5, player.col + (Math.random() - 0.5) * 0.5, item);
}

// Calculate total stat bonuses from equipped gear (wizard/lich only)
function getEquipBonuses() {
    const form = FormSystem.currentForm;
    if (form !== 'wizard' && form !== 'lich') {
        return typeof getAugmentBonuses === 'function' ? getAugmentBonuses() : {};
    }
    const totals = {};
    for (const slot of EQUIP_SLOTS) {
        const item = inventory.equipped[slot];
        if (!item) continue;
        for (const [stat, val] of Object.entries(item.stats)) {
            totals[stat] = (totals[stat] || 0) + val;
        }
    }
    // Cap stacking
    if (totals.dmgReduc) totals.dmgReduc = Math.min(0.6, totals.dmgReduc);
    if (totals.atkSpeedMult) totals.atkSpeedMult = Math.min(1.0, totals.atkSpeedMult);
    if (totals.moveSpeedMult) totals.moveSpeedMult = Math.min(0.5, totals.moveSpeedMult);
    if (totals.manaRegenMult) totals.manaRegenMult = Math.min(1.5, totals.manaRegenMult);
    if (totals.dodgeCdReduc) totals.dodgeCdReduc = Math.min(0.8, totals.dodgeCdReduc);

    // Collect passive effects from legendary items
    totals.effects = [];
    for (const slot of EQUIP_SLOTS) {
        const item = inventory.equipped[slot];
        if (item && item.effect) totals.effects.push(item.effect);
    }
    // Elara's Locket: +2 flat damage per zone cleared (always meaningful)
    for (const eff of totals.effects) {
        if (eff.id === 'elara_locket' && typeof currentZone === 'number') {
            totals.dmgBonus = (totals.dmgBonus || 0) + Math.max(0, currentZone - 1) * 2;
        }
    }

    // Merge equipment set bonuses
    const setBonuses = typeof getActiveSetBonuses === 'function' ? getActiveSetBonuses() : {};
    for (const [k, v] of Object.entries(setBonuses)) {
        if (typeof v === 'number') totals[k] = (totals[k] || 0) + v;
    }

    return totals;
}

// Augment stat bonuses — mirrors getEquipBonuses for Slime/Skeleton forms
function getAugmentBonuses() {
    if (typeof augmentInventory === 'undefined') return {};
    const totals = {};
    for (const aug of augmentInventory.equipped) {
        if (!aug) continue;
        for (const [stat, val] of Object.entries(aug.stats)) {
            if (typeof val === 'number') totals[stat] = (totals[stat] || 0) + val;
        }
    }
    // Same caps as equipment
    if (totals.dmgReduc) totals.dmgReduc = Math.min(0.6, totals.dmgReduc);
    if (totals.atkSpeedMult) totals.atkSpeedMult = Math.min(1.0, totals.atkSpeedMult);
    if (totals.moveSpeedMult) totals.moveSpeedMult = Math.min(0.5, totals.moveSpeedMult);
    // Collect passive effects
    totals.effects = [];
    for (const aug of augmentInventory.equipped) {
        if (aug && aug.effect) totals.effects.push(aug.effect);
    }
    return totals;
}

// On enemy death — roll for loot (equipment for wizard/lich, augments for slime/skeleton)
function rollEnemyLoot(enemy) {
    const dropChance = DROP_CHANCE_BASE;
    if (Math.random() < dropChance) {
        const formCfg = typeof FormSystem !== 'undefined' ? FormSystem.getFormConfig() : null;
        if (formCfg && !formCfg.hasEquipment && typeof generateAugment === 'function') {
            const aug = generateAugment(wave.current, FormSystem.currentForm);
            if (aug) dropAugmentInWorld(enemy.row, enemy.col, aug);
        } else {
            const item = generateItem(wave.current);
            dropItemInWorld(enemy.row, enemy.col, item);
        }
    }
}

// ============================================================
//  CRACKED WALLS / SECRET ROOMS
// ============================================================
function breakCrackedWall(wallR, wallC) {
    if (typeof crackedWalls === 'undefined') return false;
    for (let i = 0; i < crackedWalls.length; i++) {
        const cw = crackedWalls[i];
        if (cw.row === wallR && cw.col === wallC && !cw.opened) {
            cw.opened = true;
            // Open the wall tile
            blocked[wallR][wallC] = false;
            blockType[wallR][wallC] = null;
            objectMap[wallR][wallC] = null;
            floorMap[wallR][wallC] = 'stoneTile';
            // Carve the 3x3 secret room
            for (const t of cw.secretTiles) {
                floorMap[t.r][t.c] = 'stoneTile';
                blocked[t.r][t.c] = false;
                blockType[t.r][t.c] = null;
                objectMap[t.r][t.c] = null;
            }
            // Add walls around the secret room perimeter
            const sr = cw.secretCenter.r, sc = cw.secretCenter.c;
            for (let r = sr - 2; r <= sr + 2; r++) {
                for (let c = sc - 2; c <= sc + 2; c++) {
                    if (r < 0 || r >= floorMap.length || c < 0 || c >= floorMap.length) continue;
                    if (Math.abs(r - sr) <= 1 && Math.abs(c - sc) <= 1) continue; // inner room
                    if (r === wallR && c === wallC) continue; // entrance
                    if (!floorMap[r][c] && !blocked[r][c]) {
                        blocked[r][c] = true;
                        blockType[r][c] = 'wall';
                    }
                }
            }
            // Place a rare+ chest in the secret room
            placeObj(sr, sc, 'chestClosed', false);
            // Register as a loot chest with boosted rarity
            const chestKey = sr + ',' + sc;
            if (typeof CHEST_DEFS !== 'undefined') {
                CHEST_DEFS[chestKey] = { type: 'loot', label: 'Secret Cache', rarity: 'rare' };
            }
            // Update fog of war to reveal
            if (typeof updateFogOfWar === 'function') updateFogOfWar();
            // Dramatic feedback
            addScreenShake(8, 0.4);
            addSlowMo(0.2, 0.3);
            if (typeof spawnParticleBurst === 'function') spawnParticleBurst(wallR, wallC, 20, '#ccaa66');
            if (typeof sfxExplosion === 'function') sfxExplosion();
            if (typeof Notify !== 'undefined') {
                Notify.toast('A hidden chamber reveals itself...', { duration: 3.5, color: '#e8c840', borderColor: '#8a7030' });
            }
            return true;
        }
    }
    return false;
}

// ============================================================
//  CHALLENGE ALTARS — optional risk/reward encounters
// ============================================================
const altarState = {
    row: -1, col: -1,
    phase: 'none',       // 'none', 'ready', 'active', 'success', 'failed', 'spent'
    timer: 0,            // countdown during active challenge
    killTarget: 0,       // enemies to kill
    killCount: 0,        // enemies killed during challenge
    reward: null,        // reward type
};

function placeAltarInZone(zoneNum) {
    altarState.phase = 'none';
    altarState.row = -1;
    altarState.col = -1;
    if (zoneNum <= 1 || zoneNum === 0 || zoneNum === 7) return; // no altars in early zones or town
    // Find a random walkable floor tile not near spawn or doors
    const ms = floorMap.length;
    let attempts = 50;
    while (attempts-- > 0) {
        const r = Math.floor(4 + Math.random() * (ms - 8));
        const c = Math.floor(4 + Math.random() * (ms - 8));
        if (!floorMap[r] || !floorMap[r][c] || blocked[r][c]) continue;
        if (objectMap[r] && objectMap[r][c]) continue;
        // Not too close to player spawn
        const dist = Math.sqrt((r - player.row) ** 2 + (c - player.col) ** 2);
        if (dist < 5) continue;
        altarState.row = r;
        altarState.col = c;
        altarState.phase = 'ready';
        placeObj(r, c, 'challengeAltar', false); // non-blocking so player can walk near
        break;
    }
}

const ALTAR_INTERACT_RANGE = 2.2;

function getNearbyAltar() {
    if (altarState.phase !== 'ready') return null;
    const dr = altarState.row + 0.5 - player.row;
    const dc = altarState.col + 0.5 - player.col;
    if (Math.sqrt(dr * dr + dc * dc) < ALTAR_INTERACT_RANGE) {
        return { row: altarState.row, col: altarState.col };
    }
    return null;
}

function activateAltar() {
    if (altarState.phase !== 'ready') return false;
    altarState.phase = 'active';
    altarState.timer = 30; // 30 seconds to complete
    altarState.killTarget = 3 + Math.floor(currentZone / 2); // 3-6 elites depending on zone
    altarState.killCount = 0;
    // Spawn elites at the altar
    const types = ['armoredskel', 'skelarch', 'skeleton'];
    for (let i = 0; i < altarState.killTarget; i++) {
        const type = types[Math.floor(Math.random() * types.length)];
        const angle = (i / altarState.killTarget) * Math.PI * 2;
        const sr = altarState.row + Math.cos(angle) * 2.5;
        const sc = altarState.col + Math.sin(angle) * 2.5;
        if (typeof spawnEnemy === 'function') {
            const e = spawnEnemy(type, sr, sc, (currentZone || 1) * 1.5);
            if (e) { e.elite = 'swift'; e._altarChallenge = true; }
        }
    }
    addScreenShake(6, 0.3);
    if (typeof Notify !== 'undefined') {
        Notify.toast('ALTAR CHALLENGE: Kill ' + altarState.killTarget + ' elites in 30s!', { duration: 4, color: '#e8c840', borderColor: '#aa8800' });
    }
    if (typeof sfxWaveStart === 'function') sfxWaveStart();
    return true;
}

function updateAltarChallenge(dt) {
    if (altarState.phase !== 'active') return;
    altarState.timer -= dt;
    // Count altar kills
    altarState.killCount = 0;
    for (const e of enemies) {
        if (e._altarChallenge && e.state === 'death') altarState.killCount++;
    }
    // Success
    if (altarState.killCount >= altarState.killTarget) {
        altarState.phase = 'success';
        objectMap[altarState.row][altarState.col] = 'altarSpent';
        // Grant reward: bonus gold + reroll token
        const bonusGold = 50 + currentZone * 25;
        if (typeof playerGold !== 'undefined') playerGold += bonusGold;
        if (typeof questState !== 'undefined') questState.rerollTokens = (questState.rerollTokens || 0) + 1;
        if (typeof Notify !== 'undefined') {
            Notify.toast('ALTAR COMPLETE! +' + bonusGold + ' gold, +1 reroll token', { duration: 4, color: '#ffd700', borderColor: '#aa8800' });
        }
        addScreenShake(4, 0.2);
        if (typeof spawnParticleBurst === 'function') spawnParticleBurst(altarState.row, altarState.col, 30, '#ffd700');
        altarState.phase = 'spent';
    }
    // Failure
    if (altarState.timer <= 0 && altarState.phase === 'active') {
        altarState.phase = 'spent';
        objectMap[altarState.row][altarState.col] = 'altarSpent';
        if (typeof Notify !== 'undefined') {
            Notify.toast('Altar challenge failed...', { duration: 3, color: '#cc6644' });
        }
    }
}

function drawAltarPrompt() {
    if (altarState.phase === 'active') {
        // Show timer HUD during active challenge
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 16px Georgia';
        const timeLeft = Math.ceil(altarState.timer);
        ctx.fillStyle = timeLeft <= 10 ? '#ff4444' : '#e8c840';
        ctx.globalAlpha = timeLeft <= 5 ? 0.5 + Math.sin(performance.now() / 200) * 0.4 : 0.7;
        ctx.shadowColor = 'rgba(0,0,0,0.7)'; ctx.shadowBlur = 4;
        ctx.fillText('ALTAR: ' + altarState.killCount + '/' + altarState.killTarget + '  [' + timeLeft + 's]', canvasW / 2, 55);
        ctx.restore();
        return;
    }
    const altar = getNearbyAltar();
    if (!altar) return;
    // Draw interaction prompt at altar position
    const pos = tileToScreen(altar.row + 0.5, altar.col + 0.5);
    const sx = pos.x + cameraX, sy = pos.y + cameraY;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = 0.5 + Math.sin(performance.now() / 600) * 0.2;
    // E badge
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.beginPath(); ctx.roundRect(sx - 10, sy - 38, 20, 18, 3); ctx.fill();
    ctx.font = 'bold 11px monospace';
    ctx.fillStyle = '#e8c840';
    ctx.fillText('E', sx, sy - 29);
    // Label
    ctx.font = 'italic 10px Georgia';
    ctx.fillStyle = '#e8c840';
    ctx.globalAlpha = 0.6;
    ctx.fillText('Challenge Altar', sx, sy - 15);
    ctx.restore();
}

// Draw altar object in world (glowing pillar)
function drawAltarObject() {
    if (altarState.row < 0) return;
    const pos = tileToScreen(altarState.row + 0.5, altarState.col + 0.5);
    const sx = pos.x + cameraX, sy = pos.y + cameraY;
    if (sx < -100 || sx > canvasW + 100 || sy < -100 || sy > canvasH + 100) return;
    const t = performance.now() / 1000;
    const isReady = altarState.phase === 'ready';
    const isActive = altarState.phase === 'active';
    ctx.save();
    // Base pillar
    ctx.fillStyle = isReady ? '#554422' : isActive ? '#665533' : '#333';
    ctx.globalAlpha = 0.8;
    ctx.fillRect(sx - 4, sy - 20, 8, 20);
    // Top gem
    if (isReady || isActive) {
        ctx.globalCompositeOperation = 'screen';
        const pulse = 0.5 + Math.sin(t * (isActive ? 4 : 2)) * 0.3;
        ctx.globalAlpha = pulse;
        const gemColor = isActive ? '#ff6644' : '#e8c840';
        const g = ctx.createRadialGradient(sx, sy - 22, 0, sx, sy - 22, 12);
        g.addColorStop(0, gemColor);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(sx - 12, sy - 34, 24, 24);
    }
    ctx.restore();
}

// ============================================================
//  INTERACTABLE CHESTS
// ============================================================
// Chest registry — defines what each chest contains and requires
// Zone-aware chest definitions (rebuilt per zone)
let CHEST_DEFS = {};
function updateChestDefsForZone(zone) {
    if (zone === 0) {
        // Town chests — match placeObj positions in generateTown()
        CHEST_DEFS = {
            '5,5':   { type: 'loot', label: 'Open' },  // Guard Barracks
            '7,24':  { type: 'loot', label: 'Open' },  // Scholar's Hut
            '21,5':  { type: 'loot', label: 'Open' },  // Forge Ruin
            '21,22': { type: 'loot', label: 'Open' },  // Apothecary Ruin
            '17,9':  { type: 'loot', label: 'Open' },  // Mira's vigil
            '16,20': { type: 'loot', label: 'Open' },  // Market
        };
    } else if (zone === 1) {
        CHEST_DEFS = {
            '3,16': {
                // Secret Alcove — free loot chest
                requiresKey: null,
                type: 'loot',
                label: 'Open',
            },
            '19,21': {
                // Great Hall — locked chest, requires Rusted Key
                requiresKey: 'chest_key',
                type: 'story',     // grants key items instead of gear
                keyItems: ['journal', 'dungeon_key'],
                label: 'Open',
                lockedLabel: 'Locked',
            },
            '5,25': {
                // Flooded Crypt — Act 2 loot chest
                requiresKey: null,
                type: 'loot',
                label: 'Open',
            },
        };
    } else if (zone === 2) {
        CHEST_DEFS = {
            '8,12': {
                // Zone 2: Ruined Armory — contains Elara's letter + loot
                requiresKey: null,
                type: 'story',
                keyItems: ['elara_letter'],
                label: 'Open',
            },
            '22,22': {
                // Zone 2: Throne Antechamber — locked chest requires Tarnished Tower Key
                requiresKey: 'zone2_chest_key',
                type: 'story',     // grants key items instead of gear
                keyItems: ['zone2_key'],
                label: 'Open',
                lockedLabel: 'Locked',
            },
        };
    } else if (zone === 3) {
        CHEST_DEFS = {
            // Zone 3: Ancient Tome for the Hermit's quest (tucked in a Spire alcove)
            '8,22': {
                requiresKey: null,
                type: 'story',
                keyItems: ['ancient_tome'],
                label: 'Open',
            },
        };
    } else if (zone === 4) {
        CHEST_DEFS = {
            '20,14': {
                // Zone 4: The Crucible — charred journal fragment
                requiresKey: null,
                type: 'story',
                keyItems: ['charred_fragment'],
                label: 'Open',
            },
            '10,8': {
                // Zone 4: Infernal Ore for Garrett's quest (hidden in a lava-side forge)
                requiresKey: null,
                type: 'story',
                keyItems: ['infernal_ore'],
                label: 'Open',
            },
        };
    } else if (zone === 5) {
        CHEST_DEFS = {
            // Zone 5: Frost Essence for Senna's quest (frozen into the ice)
            '14,18': {
                requiresKey: null,
                type: 'story',
                keyItems: ['frost_essence'],
                label: 'Open',
            },
        };
    } else if (zone === 6) {
        CHEST_DEFS = {
            // Zone 6: No chests — Pale Queen dialogue is the story delivery
        };
    } else if (zone >= 100 && typeof PROCEDURAL_CHEST_DEFS !== 'undefined' && PROCEDURAL_CHEST_DEFS[zone]) {
        CHEST_DEFS = PROCEDURAL_CHEST_DEFS[zone];
    }
}

const openedChests = new Set();
const CHEST_INTERACT_RANGE = 2.2;

function getChestDef(row, col) {
    return CHEST_DEFS[`${row},${col}`] || { requiresKey: null, type: 'loot', label: 'Open' };
}

function isChestLocked(row, col) {
    const def = getChestDef(row, col);
    return def.requiresKey && !hasKeyItem(def.requiresKey);
}

function getNearbyChest() {
    const pr = Math.floor(player.row);
    const pc = Math.floor(player.col);
    const range = Math.ceil(typeof CHEST_INTERACT_RANGE !== 'undefined' ? CHEST_INTERACT_RANGE : 1.8);
    const ms = floorMap.length;
    let bestDist = Infinity, bestChest = null;
    for (let r = Math.max(0, pr - range); r <= Math.min(ms - 1, pr + range); r++) {
        for (let c = Math.max(0, pc - range); c <= Math.min(ms - 1, pc + range); c++) {
            if (objectMap[r] && objectMap[r][c] === 'chestClosed') {
                const dr = r + 0.5 - player.row;
                const dc = c + 0.5 - player.col;
                const dist = Math.sqrt(dr * dr + dc * dc);
                if (dist < (typeof CHEST_INTERACT_RANGE !== 'undefined' ? CHEST_INTERACT_RANGE : 1.8) && dist < bestDist) {
                    bestDist = dist;
                    bestChest = { row: r, col: c };
                }
            }
        }
    }
    return bestChest;
}

function openChest(chest) {
    const key = `${chest.row},${chest.col}`;
    if (openedChests.has(key)) return;

    // Validate chest position bounds (BUG-040)
    if (!objectMap[chest.row] || !objectMap[chest.row][chest.col]) return;

    const def = getChestDef(chest.row, chest.col);

    // Check if locked
    if (def.requiresKey && !hasKeyItem(def.requiresKey)) {
        // Show "locked" feedback
        pickupTexts.push({
            text: 'Locked — you need a key',
            color: '#cc6644',
            row: chest.row, col: chest.col,
            offsetY: 0,
            life: 2.0,
        });
        return;
    }

    openedChests.add(key);
    objectMap[chest.row][chest.col] = 'chestOpen';
    sfxChestOpen();
    addHitPause(0.03);
    addScreenShake(2.5, 0.15);

    if (def.type === 'story') {
        // Grant key items from this chest
        for (const itemId of def.keyItems) {
            grantKeyItem(itemId);
        }
        pickupTexts.push({
            text: 'Ancient Chest Opened',
            color: '#cc88ff',
            row: chest.row, col: chest.col,
            offsetY: 0,
            life: 2.5,
        });
    } else {
        // Standard loot chest — drop a guaranteed item
        const item = generateItem(Math.min(wave.current + 1, RARITY_WEIGHTS_BY_WAVE.length - 1));
        dropItemInWorld(chest.row, chest.col, item);
        pickupTexts.push({
            text: 'Chest Opened!',
            color: '#ffd866',
            row: chest.row, col: chest.col,
            offsetY: 0,
            life: 2.0,
        });
    }
}

function drawChestPrompt() {
    if (gameDead || inventoryOpen || gamePaused) return;
    const chest = getNearbyChest();
    if (!chest) return;

    // One-time hint on first chest encounter
    if (typeof Notify !== 'undefined') {
        Notify.hint('tutorial_chest', 'Press E to open chests for loot.', 4, { color: '#e8d4a0', borderColor: '#aa9060' });
    }

    const def = getChestDef(chest.row, chest.col);
    const locked = isChestLocked(chest.row, chest.col);
    const _isSlimeForm = (FormSystem.currentForm === 'slime');

    const pos = tileToScreen(chest.row, chest.col);
    let sx = pos.x + cameraX;
    let sy = pos.y + cameraY - 60;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const pulse = 0.6 + Math.sin(performance.now() / 500) * 0.2;

    // Register bounds for overlap prevention (badge + label area)
    if (typeof _registerWorldLabel === 'function') _registerWorldLabel(sx, sy + 4, 80, 40);

    // Key badge
    ctx.globalAlpha = pulse * 0.7;
    ctx.fillStyle = (locked || _isSlimeForm) ? '#1a0808' : '#1a1408';
    ctx.strokeStyle = (locked || _isSlimeForm) ? '#884444' : '#aa9060';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(sx - 14, sy - 10, 28, 20, 4);
    ctx.fill();
    ctx.stroke();

    ctx.globalAlpha = pulse * 0.9;
    ctx.font = 'bold 11px monospace';
    ctx.fillStyle = (locked || _isSlimeForm) ? '#cc6644' : '#e8d4a0';
    ctx.fillText('E', sx, sy);

    // Label
    ctx.globalAlpha = pulse * ((locked || _isSlimeForm) ? 0.6 : 0.5);
    ctx.font = 'italic 10px Georgia';
    ctx.fillStyle = (locked || _isSlimeForm) ? '#aa5544' : '#c4a878';
    const _chestLabel = _isSlimeForm ? 'Cannot open'
        : (locked ? (def.lockedLabel || 'Locked') : (def.label || 'Open'));
    ctx.fillText(_chestLabel, sx, sy + 18);

    ctx.restore();
}

// ============================================================
//  ZONE LOADING SYSTEM
// ============================================================
function loadZone(zoneNumber) {
    currentZone = zoneNumber;

    // Reset secret room state for new zone
    if (typeof crackedWalls !== 'undefined') { try { crackedWalls.length = 0; } catch(e) {} }

    // Clear glow cache on zone load
    clearGlowCache();

    // Apply zone-specific tile dimensions
    applyZoneTileConfig(zoneNumber);

    // Determine MAP_SIZE for this zone (procedural zones use dynamic config)
    const zoneCfg = ZONE_CONFIGS[zoneNumber] || (zoneNumber >= 100 && typeof getProceduralZoneConfig === 'function' ? getProceduralZoneConfig(zoneNumber) : null);
    const newMapSize = zoneCfg ? zoneCfg.mapSize : 24;

    // Reinitialize map arrays with correct size
    floorMap.length = 0;
    objectMap.length = 0;
    blocked.length = 0;
    blockType.length = 0;
    objRadius.length = 0;
    resetFogOfWar(newMapSize);

    for (let i = 0; i < newMapSize; i++) {
        floorMap.push(Array(newMapSize).fill(null));
        objectMap.push(Array(newMapSize).fill(null));
        blocked.push(Array(newMapSize).fill(true));
        blockType.push(Array(newMapSize).fill(null));
        objRadius.push(Array(newMapSize).fill(0));
    }

    // Clear game state — ALL entity/projectile/effect arrays must be purged
    enemies.length = 0;
    projectiles.length = 0;
    if (typeof enemyProjectiles !== 'undefined') enemyProjectiles.length = 0;
    if (typeof towerBolts !== 'undefined') towerBolts.length = 0;
    if (typeof summons !== 'undefined') summons.length = 0;
    if (typeof ghosts !== 'undefined') ghosts.length = 0;
    if (typeof burnZones !== 'undefined') burnZones.length = 0;
    if (typeof groundHazards !== 'undefined') groundHazards.length = 0;
    if (typeof veilUndyingCooldown !== 'undefined') veilUndyingCooldown = 0;
    if (typeof slimeState !== 'undefined') {
        slimeState.splitClones.length = 0;
        slimeState.acidPuddles.length = 0;
    }
    // Reset skeleton combo on zone transition
    if (typeof skeletonState !== 'undefined') {
        skeletonState.comboCount = 0;
        skeletonState.comboTimer = 0;
    }
    // Reset frozen echoes on zone transition
    if (typeof resetFrozenEchoes === 'function') resetFrozenEchoes();
    if (typeof resetInscriptions === 'function') resetInscriptions();
    // Reset camera shake and fog timer on zone transition
    if (typeof resetCameraShake === 'function') resetCameraShake();
    if (typeof updateGameplay !== 'undefined') updateGameplay._fogTimer = 0;
    if (typeof equipBonusDirty !== 'undefined') equipBonusDirty = true; // Elara's Locket depends on currentZone
    // Reset visual effect state on zone transition
    if (typeof _impactRipples !== 'undefined') _impactRipples.length = 0;
    if (typeof _combatDecals !== 'undefined') _combatDecals.length = 0;
    if (typeof _weatherParticles !== 'undefined') _weatherParticles.length = 0;
    if (typeof _weatherRipples !== 'undefined') _weatherRipples.length = 0;
    if (typeof _phantomHP !== 'undefined') _phantomHP = -1;
    if (typeof _displayHP !== 'undefined') _displayHP = -1;
    // Clean up any boss bone wall tiles that might have persisted
    if (typeof enemies !== 'undefined') {
        for (const e of enemies) {
            if (e._boneWallActive && e._boneWallTiles) {
                for (const t of e._boneWallTiles) {
                    if (t.r >= 0 && t.r < MAP_SIZE && t.c >= 0 && t.c < MAP_SIZE) {
                        blocked[t.r][t.c] = false;
                        blockType[t.r][t.c] = null;
                    }
                }
            }
        }
    }
    // Reset lich corpse locations on zone transition
    if (typeof lichState !== 'undefined') {
        lichState.corpseLocations.length = 0;
    }
    worldDrops.length = 0;
    worldKeyDrops.length = 0;
    openedChests.clear();
    pickupTexts.length = 0;
    // Clear zone-duration potion buffs
    if (typeof clearPotionBuffsForZone === 'function') clearPotionBuffsForZone();
    // Keep only ambient particles (no type), clear combat particles
    for (let i = particles.length - 1; i >= 0; i--) {
        if (particles[i] && particles[i].type) particles.splice(i, 1);
    }
    gameDead = false;
    // Clear NPC service menus that may have been open during zone transition
    if (typeof smithyMenuOpen !== 'undefined') smithyMenuOpen = false;
    if (typeof shopMenuOpen !== 'undefined') shopMenuOpen = false;

    // Update objective based on zone
    if (zoneNumber === 7) {
        currentObjective = 'Find a way out';
    } else if (zoneNumber === 0) {
        currentObjective = 'Rest and prepare';
    } else if (zoneNumber === 1) {
        currentObjective = 'Explore the Undercroft';
    } else if (zoneNumber === 2) {
        currentObjective = 'Ascend the Ruined Tower';
    } else if (zoneNumber === 3) {
        currentObjective = 'Defeat the guardian';
    } else if (zoneNumber === 4) {
        currentObjective = 'Descend — something calls from below';
    } else if (zoneNumber === 5) {
        currentObjective = 'Follow Elara\'s trail through the cold';
    } else if (zoneNumber === 6) {
        currentObjective = 'Reach the Throne. Find her.';
    }

    // Place a challenge altar in combat zones (Zone 2+)
    if (typeof placeAltarInZone === 'function') placeAltarInZone(zoneNumber);

    // Generate the appropriate zone
    if (zoneNumber === 7) {
        generateAntechamber();
        player.row = 6;
        player.col = 6;
        player.vx = 0;
        player.vy = 0;
    } else if (zoneNumber === 0) {
        generateTown();
        // Spawn at south entrance of Hamlet (arriving from antechamber or returning from dungeon)
        player.row = 21;
        player.col = 15;
        player.vx = 0;
        player.vy = 0;
        // Restore HP/mana to full on town entry — safe haven heals you
        // Use form-specific max HP calculators (includes equip/talisman/quest bonuses)
        const _healForm = typeof FormSystem !== 'undefined' ? FormSystem.currentForm : 'slime';
        if (_healForm === 'slime' && typeof _slimeMaxHP === 'function') {
            player.hp = _slimeMaxHP();
        } else if (_healForm === 'skeleton' && typeof _skeletonMaxHP === 'function') {
            player.hp = _skeletonMaxHP();
        } else {
            // Wizard or fallback — base + equip + talisman + quest bonuses
            const _cfg = typeof FormSystem !== 'undefined' ? FormSystem.getFormConfig() : null;
            const _base = _cfg ? _cfg.maxHp : 100;
            const _eqHP = (typeof equipBonus !== 'undefined' && equipBonus.maxHpBonus) ? equipBonus.maxHpBonus : 0;
            const _talHP = (typeof getTalismanBonus === 'function') ? getTalismanBonus().hpBonus : 0;
            const _qHP = (typeof questState !== 'undefined' && questState.permBonuses) ? (questState.permBonuses.maxHpBonus || 0) : 0;
            player.hp = Math.round(_base + _eqHP + _talHP + _qHP);
        }
        // Restore mana too
        const _manaCfg = typeof FormSystem !== 'undefined' ? FormSystem.getFormConfig() : null;
        if (_manaCfg && _manaCfg.maxMana) player.mana = _manaCfg.maxMana;
    } else if (zoneNumber === 1) {
        // Hybrid zone template system — falls back to legacy if template unavailable
        if (typeof ZONE_TEMPLATE_1 !== 'undefined' && typeof generateZoneFromTemplate === 'function') {
            const _asc = typeof ascensionLevel !== 'undefined' ? ascensionLevel : 0;
            const _result = generateZoneFromTemplate(ZONE_TEMPLATE_1, _asc);
            player.row = _result.spawnRow || 4;
            player.col = _result.spawnCol || 3;
        } else {
            generateDungeon();
            player.row = 4;
            player.col = 3;
        }
        player.vx = 0;
        player.vy = 0;
    } else if (zoneNumber === 2) {
        generateZone2();
        player.row = 4;
        player.col = 23;
        player.vx = 0;
        player.vy = 0;
    } else if (zoneNumber === 3) {
        // Zone 3: The Spire Throne Room — boss arena
        generateZone3();
        player.row = 3;
        player.col = 5;
        player.vx = 0;
        player.vy = 0;
    } else if (zoneNumber === 4) {
        // Zone 4: The Inferno — Hell dungeon
        generateHellZone();
        player.row = 3;
        player.col = 13;
        player.vx = 0;
        player.vy = 0;
    } else if (zoneNumber === 5) {
        // Zone 5: The Frozen Abyss
        generateZone5();
        player.row = 3;
        player.col = 14;
        player.vx = 0;
        player.vy = 0;
    } else if (zoneNumber === 6) {
        // Zone 6: Throne of Ruin — final zone
        generateZone6();
        player.row = 3;
        player.col = 15;
        player.vx = 0;
        player.vy = 0;
    } else if (zoneNumber >= 100 && typeof generateProceduralZone === 'function') {
        // Procedural zones — used as bridge floors between story zones and in endless mode
        const depth = zoneNumber - 99;
        if (depth > deepestDepthReached) deepestDepthReached = depth;
        // Use theme override from progression system if available, otherwise derive from depth
        const theme = (typeof _nextProceduralTheme !== 'undefined' && _nextProceduralTheme) ? _nextProceduralTheme : themeForDepth(depth);
        _nextProceduralTheme = null; // consume
        const result = generateProceduralZone({
            mapSize: Math.min(36, 28 + depth * 2),
            depth,
            theme,
            seed: Date.now() ^ (Math.random() * 0xFFFFFF | 0),
            enableSeal: depth >= 2,
            hazardDensity: Math.min(0.10, 0.02 + depth * 0.01),
            secretChance: 0.3,
        });
        player.row = result.spawnRow;
        player.col = result.spawnCol;
        player.vx = 0;
        player.vy = 0;
    }

    // Validate spawn position is walkable; if blocked, search nearby tiles (BUG-010)
    const spawnR = Math.floor(player.row), spawnC = Math.floor(player.col);
    if (blocked && blocked[spawnR] && blocked[spawnR][spawnC]) {
        let found = false;
        for (let dr = -2; dr <= 2; dr++) {
            for (let dc = -2; dc <= 2; dc++) {
                const nr = spawnR + dr, nc = spawnC + dc;
                if (nr >= 0 && nr < MAP_SIZE && nc >= 0 && nc < MAP_SIZE && !blocked[nr][nc]) {
                    player.row = nr + 0.5;
                    player.col = nc + 0.5;
                    found = true;
                    break;
                }
            }
            if (found) break;
        }
    }

    // Initialize environmental hazards for story zones 2-6
    if (zoneNumber >= 2 && zoneNumber <= 6) {
        initHazardMap(MAP_SIZE);
        if (typeof initStoryZoneHazards === 'function') initStoryZoneHazards(zoneNumber);
    } else if (zoneNumber < 100) {
        initHazardMap(MAP_SIZE);
    }

    // Generate procedural background for ALL zones.
    // Each zone has its own palette and coverage settings in ZONE_BG_PALETTES.
    if (typeof initSpaceBackground === 'function' && ZONE_BG_PALETTES[zoneNumber]) {
        initSpaceBackground(zoneNumber);
    } else {
        spaceBgCanvas = null;  // clear any cached nebula from previous zone
        spaceBgZone = -1;
    }
    // Initialize background manager for this zone (dedicated layer system)
    if (typeof BackgroundManager !== 'undefined') {
        BackgroundManager.init(zoneNumber);
    }

    // Update door and chest definitions for this zone
    updateDoorDefsForZone(zoneNumber);
    updateChestDefsForZone(zoneNumber);
    loadZoneNPCs(zoneNumber);  // Load NPCs for this zone
    buildRoomBounds();  // Update room lighting/ambience for new zone
    buildEnvironmentLights();  // Rebuild zone light sources
    // Reveal fog of war from new spawn position
    if (typeof updateFogOfWar === 'function') updateFogOfWar();

    // Start zone-specific ambient soundscape
    if (typeof startAmbient === 'function') startAmbient(zoneNumber);

    // Reset wave system (skip for non-combat zones like town)
    const _zoneCfg = ZONE_CONFIGS[zoneNumber] || (zoneNumber >= 100 && typeof getProceduralZoneConfig === 'function' ? getProceduralZoneConfig(zoneNumber) : null);
    if (_zoneCfg && _zoneCfg.hasWaves) {
        startWaveSystem();
    } else {
        // Safe zone — kill wave system and clear any leftover enemies
        wave.phase = 'done';
        wave.bannerText = '';
        wave.bannerAlpha = 0;
        enemies.length = 0;
    }

    // Reset zone transition
    zoneTransition = null;

    // Restore full light for new zone
    lightRadius = MAX_LIGHT;

    // Update music — hamlet ambient for Zone 0, menu for other zones
    playMusic(zoneNumber === 0 ? 'hamlet' : zoneNumber === 7 ? 'antechamber' : 'menu', 2.0);

    // Reset camera
    smoothCamX = 0;
    smoothCamY = 0;
    cameraX = 0;
    cameraY = 0;


    // Auto-save on zone transition — protects against crashes and accidental closes
    if (typeof saveGame === 'function' && typeof getAutoSaveSlot === 'function' && zoneNumber !== 7) {
        try { saveGame(getAutoSaveSlot()); } catch(e) { /* silent */ }
    }

    // Zone name display handled by showZoneBanner() in gameloop.js (called from zone transition)
    // Notify.showZoneBanner removed — was creating a duplicate banner

    // --- Zone entry hints (single brief line, non-intrusive) ---
    if (typeof Notify !== 'undefined') {
        if (zoneNumber === 0) {
            Notify.hint('hamlet_ruins', 'The settlement lies in ruins. Earn gold to rebuild.', 4, { color: '#c4a878' });
        }
    }

    // Switch to playing phase
    gamePhase = 'playing';
}

// ============================================================
//  INTERACTABLE DOORS / STAIRS (zone exits)
// ============================================================
// Zone-specific door definitions (rebuilt per zone)
// ============================================================
//  ZONE PROGRESSION TABLE — unified story + procedural flow
// ============================================================
const ZONE_PROGRESSION = [
    { zone: 1 },   // 0: The Undercroft
    { zone: 2 },   // 1: Ruined Tower
    { zone: 3 },   // 2: The Spire
    { zone: 4 },   // 3: The Inferno
    { zone: 5 },   // 4: Frozen Abyss
    { zone: 6 },   // 5: Throne of Ruin
];
let progressionIndex = 0;
let endlessUnlocked = false;
let endlessDepth = 5; // starting depth for post-game endless mode
let deepestDepthReached = 0; // highest procedural depth the player has survived

// ============================================================
//  ABYSS MODIFIER SYSTEM — escalating challenge for endless mode
// ============================================================
const ABYSS_MODIFIERS = [
    { id: 'swarm', name: 'Swarm', desc: '+50% enemy count, -30% enemy HP', enemyCountMult: 1.5, enemyHpMult: 0.7 },
    { id: 'iron_horde', name: 'Iron Horde', desc: 'All enemies are elite', forceElite: true },
    { id: 'darkness', name: 'Darkness', desc: 'Light radius halved', lightMult: 0.5 },
    { id: 'drought', name: 'Drought', desc: 'Mana regen -50%', manaRegenMult: 0.5 },
    { id: 'frail', name: 'Frailty', desc: 'Max HP -25%', hpMult: 0.75 },
    { id: 'haste', name: 'Haste', desc: 'All enemies +40% speed', enemySpeedMult: 1.4 },
    { id: 'famine', name: 'Famine', desc: 'No HP from kills', noHpDrops: true },
    { id: 'gauntlet', name: 'Gauntlet', desc: 'No rest between waves', noRestPeriod: true },
    { id: 'volatile', name: 'Volatile', desc: 'Enemies explode on death', enemyExplodeOnDeath: true, color: '#ff6644' },
    { id: 'thorned_horde', name: 'Thorned Horde', desc: 'All enemies reflect 10% damage', enemyReflect: 0.10, color: '#44cc88' },
    { id: 'giant', name: 'Giant', desc: 'Enemies +30% size, +50% HP', enemyScaleMult: 1.3, enemyHpMult: 1.5, color: '#cc8844' },
    { id: 'starved', name: 'Starved', desc: 'Gold drops -70%', goldMult: 0.3, color: '#888888' },
];
let activeModifiers = [];
let _lastAddedModifier = null;
const ABYSS_MODIFIER_CAP = 6; // raised from 4 to support deeper runs

// Modifier choice state — pauses gameplay for player to pick
var abyssChoiceState = {
    pending: false,
    options: [],     // 3 random modifiers to choose from
    doubleChoice: false, // depth 25+: pick 2
    picksRemaining: 0,
};

// Depth tier flags for current procedural zone (set by resolveNextZone, consumed by wave system)
var abyssDepthFlags = {
    bossGauntlet: false,
    hazardSurge: false,
    mythicScaling: false,
    depth: 0,
};

function rollAbyssModifierChoices() {
    const available = ABYSS_MODIFIERS.filter(m => !activeModifiers.some(a => a.id === m.id));
    if (available.length === 0 || activeModifiers.length >= ABYSS_MODIFIER_CAP) return;
    // Shuffle and pick 3
    const shuffled = available.sort(() => Math.random() - 0.5);
    abyssChoiceState.options = shuffled.slice(0, Math.min(3, shuffled.length));
    abyssChoiceState.pending = true;
    abyssChoiceState.picksRemaining = abyssChoiceState.doubleChoice ? 2 : 1;
}

function applyAbyssModifierChoice(idx) {
    if (idx < 0 || idx >= abyssChoiceState.options.length) return;
    const pick = abyssChoiceState.options[idx];
    activeModifiers.push(pick);
    _lastAddedModifier = pick;
    abyssChoiceState.options.splice(idx, 1);
    abyssChoiceState.picksRemaining--;
    if (abyssChoiceState.picksRemaining <= 0 || abyssChoiceState.options.length === 0) {
        abyssChoiceState.pending = false;
        abyssChoiceState.options = [];
    }
    if (typeof Notify !== 'undefined') {
        Notify.toast('Abyss Modifier: ' + pick.name + ' — ' + pick.desc, { duration: 4, color: '#cc4488', borderColor: '#882244' });
    }
}

function rollAbyssModifier() {
    const available = ABYSS_MODIFIERS.filter(m => !activeModifiers.some(a => a.id === m.id));
    if (available.length === 0 || activeModifiers.length >= ABYSS_MODIFIER_CAP) return null;
    const pick = available[Math.floor(Math.random() * available.length)];
    activeModifiers.push(pick);
    _lastAddedModifier = pick;
    return pick;
}
function hasAbyssMod(prop) { return activeModifiers.some(m => m[prop]); }
function getAbyssModMult(prop, base) {
    let val = base;
    for (const m of activeModifiers) { if (m[prop] != null) val *= m[prop]; }
    return val;
}
function applyAbyssHpMod(maxHp) {
    if (typeof currentZone !== 'undefined' && currentZone >= 100 && activeModifiers.length > 0) return Math.round(getAbyssModMult('hpMult', 1) * maxHp);
    return maxHp;
}

const ABYSS_RANKS = [
    { depth: 5, name: 'Initiate', tint: null },
    { depth: 10, name: 'Delver', tint: '#4488cc' },
    { depth: 20, name: 'Abyssal', tint: '#8844cc' },
    { depth: 35, name: 'Void Walker', tint: '#cc4488' },
    { depth: 50, name: 'Eternal', tint: '#ffcc00' },
];
function getAbyssRank() {
    let rank = null;
    for (const r of ABYSS_RANKS) { if (deepestDepthReached >= r.depth) rank = r; }
    return rank;
}

// Abyss milestone rewards — permanent buffs at certain endless depths
// Store base values so milestones can be cleanly re-applied on save load
const _BASE_MAX_HP = typeof PLAYER_STATS !== 'undefined' ? PLAYER_STATS.maxHp : 100;
const _BASE_FIREBALL_DMG = typeof COMBAT !== 'undefined' ? COMBAT.fireballDmg : 20;
const ABYSS_MILESTONES = [
    { depth: 5, reward: { type: 'hp', value: 10, desc: '+10 Max HP' } },
    { depth: 10, reward: { type: 'damage', value: 5, desc: '+5 Damage' } },
    { depth: 15, reward: { type: 'hp', value: 15, desc: '+15 Max HP' } },
    { depth: 20, reward: { type: 'damage', value: 8, desc: '+8 Damage' } },
    { depth: 25, reward: { type: 'hp', value: 20, desc: '+20 Max HP' } },
];
let claimedMilestones = [];

function checkAbyssMilestone(depth) {
    for (const m of ABYSS_MILESTONES) {
        if (m.depth === depth && !claimedMilestones.includes(depth)) {
            claimedMilestones.push(depth);
            // Apply reward
            if (m.reward.type === 'hp') {
                PLAYER_STATS.maxHp += m.reward.value;
                player.hp = Math.min(player.hp + m.reward.value, PLAYER_STATS.maxHp + (typeof equipBonus !== 'undefined' ? (equipBonus.maxHpBonus || 0) : 0));
            } else if (m.reward.type === 'damage') {
                COMBAT.fireballDmg += m.reward.value;
            }
            // Show notification
            if (typeof Notify !== 'undefined') {
                Notify.toast('Abyss Milestone! ' + m.reward.desc, { duration: 4, color: '#ffd700', borderColor: '#aa8800' });
            }
            return;
        }
    }
}

function resolveNextZone() {
    progressionIndex++;
    // Past the story? Enter endless mode
    if (progressionIndex >= ZONE_PROGRESSION.length) {
        if (!endlessUnlocked) endlessUnlocked = true;
        const themes = ['dungeon', 'ruins', 'hell', 'frozen'];
        const d = endlessDepth++;

        // Depth tier events — modifier choice every 5 depths
        if (d >= 6 && d % 5 === 0) {
            abyssChoiceState.doubleChoice = (d >= 25); // depth 25+: pick 2
            rollAbyssModifierChoices();
        }

        // Depth tier: boss gauntlet at 10, 20, 30... (stored as zone flag)
        const isBossGauntlet = (d >= 10 && d % 10 === 0);
        // Depth tier: environmental hazard surge at 15, 25, 35...
        const isHazardSurge = (d >= 15 && d % 10 === 5);
        // Depth tier: mythic scaling at 30+
        const isMythic = (d >= 30);

        checkAbyssMilestone(d);

        // Track in player profile
        if (typeof playerProfile !== 'undefined') {
            if (!playerProfile.bestAbyssDepth) playerProfile.bestAbyssDepth = {};
            const form = FormSystem.currentForm;
            if (!playerProfile.bestAbyssDepth[form] || d > playerProfile.bestAbyssDepth[form]) {
                playerProfile.bestAbyssDepth[form] = d;
            }
        }

        // Store depth tier flags globally for wave system
        abyssDepthFlags.bossGauntlet = isBossGauntlet;
        abyssDepthFlags.hazardSurge = isHazardSurge;
        abyssDepthFlags.mythicScaling = isMythic;
        abyssDepthFlags.depth = d;

        return {
            procedural: true,
            theme: themes[(d - 5) % themes.length],
            depth: d,
        };
    }
    return ZONE_PROGRESSION[progressionIndex];
}

function getZoneNumberForProgression(entry) {
    if (entry.procedural) return 100 + entry.depth;
    return entry.zone;
}

let DOOR_DEFS = {};
function updateDoorDefsForZone(zone) {
    if (zone === 1) {
        const townDoor = { requiresKey: 'town_pass', label: 'Step Outside', lockedLabel: 'The way is sealed...', destination: 'town' };
        DOOR_DEFS = {
            // Town exit — Cell north wall archway only (reduced from 6 tiles to prevent accidental triggers)
            '1,4': townDoor, '1,5': townDoor,
            // Exit stairs — centre-south of Great Hall → next in progression
            '20,17': {
                requiresKey: 'dungeon_key',
                label: 'Descend Deeper',
                lockedLabel: 'Locked',
                destination: 'next',
            },
        };
    } else if (zone === 7) {
        DOOR_DEFS = {
            // North archway → Hamlet (Zone 0)
            '2,5': { requiresKey: null, label: 'Enter the Hamlet', destination: 'town' },
            '2,6': { requiresKey: null, label: 'Enter the Hamlet', destination: 'town' },
            '2,7': { requiresKey: null, label: 'Enter the Hamlet', destination: 'town' },
            // South stairs → Dungeon (Zone 1)
            '10,5': { requiresKey: null, label: 'Enter the Dungeon', destination: 'zone1' },
            '10,6': { requiresKey: null, label: 'Enter the Dungeon', destination: 'zone1' },
            '10,7': { requiresKey: null, label: 'Enter the Dungeon', destination: 'zone1' },
        };
    } else if (zone === 0) {
        DOOR_DEFS = {
            // South dungeon stairway — The Descent (row 27)
            '27,14': { requiresKey: null, label: 'Descend to the Dungeon', destination: 'zone1' },
            '27,15': { requiresKey: null, label: 'Descend to the Dungeon', destination: 'zone1' },
            '27,16': { requiresKey: null, label: 'Descend to the Dungeon', destination: 'zone1' },
            // North gate — zone 2 access
            '1,14': { requiresKey: null, label: 'Ascend', destination: 'zone2' },
            '1,15': { requiresKey: null, label: 'Ascend', destination: 'zone2' },
            '1,16': { requiresKey: null, label: 'Ascend', destination: 'zone2' },
        };
        // Abyss Portal — requires Hermit's Hut rebuilt + procedural depth reached
        if (deepestDepthReached > 0 && typeof hamletRebuild !== 'undefined' && hamletRebuild.hermitHut) {
            DOOR_DEFS['7,26'] = {
                requiresKey: null,
                label: 'Enter the Abyss (Depth ' + deepestDepthReached + ')',
                destination: 'deepest',
            };
        }
    } else if (zone === 2) {
        DOOR_DEFS = {
            '33,15': {
                requiresKey: 'zone2_key',
                label: 'Descend Deeper',
                lockedLabel: 'Locked',
                destination: 'next',
            },
        };
    } else if (zone === 3) {
        DOOR_DEFS = {
            '19,16': {
                requiresKey: 'zone3_exit_key',
                label: 'Descend into the depths...',
                lockedLabel: 'Locked',
                destination: 'next',
            },
        };
    } else if (zone === 4) {
        DOOR_DEFS = {
            // Entry stairs (for going back — optional, matches zone 3 exit at 19,16)
            '1,16': { requiresKey: null, label: 'Return to the Spire', destination: 'zone3' },
            // Boss exit (south wall center) — locked until hell boss dies
            '26,13': { requiresKey: 'zone4_key', label: 'Descend Deeper...', lockedLabel: 'Sealed by dark power', destination: 'next' },
            '26,14': { requiresKey: 'zone4_key', label: 'Descend Deeper...', lockedLabel: 'Sealed by dark power', destination: 'next' },
        };
    } else if (zone === 5) {
        DOOR_DEFS = {
            // Entry — return to The Inferno (matches zone 4 exit at 26,13-14)
            '1,13': { requiresKey: null, label: 'Return to the Inferno', destination: 'zone4' },
            '1,14': { requiresKey: null, label: 'Return to the Inferno', destination: 'zone4' },
            // Boss exit — south end, descend to final zone
            '28,14': { requiresKey: 'zone5_key', label: 'Enter the Throne of Ruin', lockedLabel: 'An ancient seal holds...', destination: 'next' },
            '28,15': { requiresKey: 'zone5_key', label: 'Enter the Throne of Ruin', lockedLabel: 'An ancient seal holds...', destination: 'next' },
        };
    } else if (zone === 6) {
        DOOR_DEFS = {
            // Entry — return to Frozen Abyss (matches zone 5 exit at 28,14-15)
            '1,14': { requiresKey: null, label: 'Return to the Abyss', destination: 'zone5' },
            '1,15': { requiresKey: null, label: 'Return to the Abyss', destination: 'zone5' },
            // Endless descent — appears after final boss defeat. The dungeon continues forever.
            '35,29': { requiresKey: null, label: 'Descend into the unknown...', destination: 'next' },
        };
    } else if (zone >= 100 && typeof PROCEDURAL_DOOR_DEFS !== 'undefined' && PROCEDURAL_DOOR_DEFS[zone]) {
        DOOR_DEFS = PROCEDURAL_DOOR_DEFS[zone];
    }
}
const DOOR_INTERACT_RANGE = 2.2;
let zoneTransition = null; // null or { timer, phase, destination }
let _townReturnSpawn = false; // true when returning from dungeon → spawn at Hamlet entrance, not lobby

function getNearbyDoor() {
    for (const [key, def] of Object.entries(DOOR_DEFS)) {
        const [r, c] = key.split(',').map(Number);
        const dr = player.row - r;
        const dc = player.col - c;
        if (Math.sqrt(dr * dr + dc * dc) < DOOR_INTERACT_RANGE) {
            return { row: r, col: c, def };
        }
    }
    return null;
}

function isDoorLocked(row, col) {
    const def = DOOR_DEFS[`${row},${col}`];
    return def && def.requiresKey && !hasKeyItem(def.requiresKey);
}

// Evolution gating: higher zones require evolved forms
const ZONE_FORM_REQUIREMENTS = {
    'zone2': { forms: ['skeleton', 'wizard', 'lich'], message: 'You are too weak... Evolve first.' },
    'zone3': { forms: ['wizard', 'lich'], message: 'Dark magic bars the way... You must master the arcane.' },
    'zone4': { forms: ['wizard', 'lich'], message: 'The Inferno demands arcane mastery...' },
    'zone5': { forms: ['lich'], message: 'The Abyss rejects the living...' },
    'zone6': { forms: ['lich'], message: 'Only the mightiest undead may face the Throne...' },
};

function tryUseDoor(door) {
    if (door.def.requiresKey && !hasKeyItem(door.def.requiresKey)) {
        pickupTexts.push({
            text: 'Locked — you need a key',
            color: '#cc6644',
            row: door.row, col: door.col,
            offsetY: 0,
            life: 2.0,
        });
        return;
    }

    // Check evolution gating for zone transitions
    // For 'next' destinations, peek at what the actual target zone would be
    let formGateKey = door.def.destination;
    if (formGateKey === 'next' || formGateKey === 'deepest') {
        // Resolve the actual next story zone to check form requirements against
        if (formGateKey === 'next') {
            const peekIdx = progressionIndex + 1;
            // Walk forward through progression to find the next story zone
            for (let i = peekIdx; i < ZONE_PROGRESSION.length; i++) {
                if (ZONE_PROGRESSION[i].zone) { formGateKey = 'zone' + ZONE_PROGRESSION[i].zone; break; }
            }
        } else {
            // 'deepest' — no form gating (player earned access by reaching that depth already)
            formGateKey = null;
        }
    }
    const formReq = formGateKey ? ZONE_FORM_REQUIREMENTS[formGateKey] : null;
    if (formReq && !formReq.forms.includes(FormSystem.currentForm)) {
        pickupTexts.push({
            text: formReq.message,
            color: '#bb44ff',
            row: door.row, col: door.col,
            offsetY: 0,
            life: 2.5,
        });
        return;
    }

    // Begin zone transition fade
    zoneTransitionFading = true;
    zoneTransitionTarget = door.def.destination;
    zoneTransitionAlpha = 0;
    // Fade out music
    playMusic('menu', 3.0);
}

function updateZoneTransition(dt) {
    if (!zoneTransition) return false;
    const zt = zoneTransition;

    if (zt.phase === 'fadeOut') {
        zt.timer += dt;
        if (zt.timer >= zt.totalFade) {
            zt.phase = 'message';
            zt.timer = 0;
            // Actually load the zone when fade completes
            let nextZone = 1;
            if (zt.destination === 'town') { nextZone = 0; _townReturnSpawn = true; }
            else if (zt.destination === 'zone1') nextZone = 1;
            else if (zt.destination === 'zone2') nextZone = 2;
            else if (zt.destination === 'zone3') nextZone = 3;
            else if (zt.destination === 'zone4') nextZone = 4;
            else if (zt.destination === 'zone5') nextZone = 5;
            else if (zt.destination === 'zone6') nextZone = 6;
            loadZone(nextZone);
        }
    } else if (zt.phase === 'message') {
        zt.timer += dt;
        if (zt.timer >= 5.0) {
            zt.phase = 'hold';
        }
    }
    // 'hold' phase: zone is loaded, player can interact
    return true; // signal that transition is active
}

function drawZoneTransition() {
    if (!zoneTransition) return;
    const zt = zoneTransition;

    ctx.save();
    const cx = canvasW / 2;
    const cy = canvasH / 2;

    if (zt.phase === 'fadeOut') {
        // Black fade overlay
        ctx.globalAlpha = Math.min(1, zt.timer / zt.totalFade);
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvasW, canvasH);
    } else if (zt.phase === 'message') {
        // Show message on full black screen
        // Calculate fade-out at the end of the message phase
        const fadeOutStart = 3.5;
        const fadeOutFade = 0.5;
        let screenAlpha = 1;
        if (zt.timer > fadeOutStart) {
            screenAlpha = Math.max(0, 1 - (zt.timer - fadeOutStart) / fadeOutFade);
        }

        ctx.globalAlpha = screenAlpha;
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvasW, canvasH);

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Title text fades in
        const textAlpha = Math.min(1, zt.timer / 1.5) * screenAlpha;
        ctx.globalAlpha = textAlpha;
        ctx.font = '36px Georgia';
        ctx.fillStyle = '#d4b878';
        ctx.shadowColor = 'rgba(200, 160, 80, 0.4)';
        ctx.shadowBlur = 20;
        // Ascending language instead of descending
        let transitionText = 'You ascend higher...';
        let subtitleText = 'The air grows thinner.';
        if (zt.destination === 'town') {
            transitionText = 'Light floods through the archway...';
            subtitleText = 'The world opens before you.';
        } else if (zt.destination === 'zone1') {
            transitionText = 'You descend into darkness...';
            subtitleText = 'The dungeon awaits below.';
        } else if (zt.destination === 'zone2') {
            transitionText = 'You ascend higher...';
            subtitleText = 'The tower beckons above.';
        } else if (zt.destination === 'zone3') {
            transitionText = 'You ascend further...';
            subtitleText = 'The spire looms ahead.';
        } else if (zt.destination === 'zone4') {
            transitionText = 'The spire opens to daylight...';
            subtitleText = 'Freedom lies beyond.';
        }
        ctx.fillText(transitionText, cx, cy - 30);
        ctx.shadowBlur = 0;

        // Subtitle fades in later
        const subAlpha = Math.max(0, Math.min(1, (zt.timer - 1.5) / 1.5)) * screenAlpha;
        ctx.globalAlpha = subAlpha;
        ctx.font = 'italic 16px Georgia';
        ctx.fillStyle = '#8a7a5a';
        ctx.fillText(subtitleText, cx, cy + 15);
    } else if (zt.phase === 'hold') {
        // Zone loaded, but still showing fade-in effect
        const fadeInDuration = 2.0;
        const fadeInAlpha = Math.max(0, 1 - zt.timer / fadeInDuration);
        ctx.globalAlpha = fadeInAlpha;
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvasW, canvasH);

        // After fade-in completes, clear the transition
        if (zt.timer > fadeInDuration) {
            zoneTransition = null;
        }
    }

    ctx.restore();
}

// ============================================================
//  HAMLET REBUILD SYSTEM
// ============================================================
function getNearbyRebuildPoint() {
    if (typeof hamletRebuild === 'undefined' || typeof REBUILD_POINTS === 'undefined') return null;
    if (currentZone !== 0) return null;
    for (const [key, point] of Object.entries(REBUILD_POINTS)) {
        const level = typeof getRebuiltLevel === 'function' ? getRebuiltLevel(key) : (hamletRebuild[key] ? 3 : 0);
        if (level >= 3) continue; // fully upgraded
        const dr = player.row - point.row;
        const dc = player.col - point.col;
        if (Math.sqrt(dr * dr + dc * dc) < 1.5) { // reduced from 2.5 — must stand ON rebuild point, not near it
            return { key, level, ...point };
        }
    }
    return null;
}

function tryHamletRebuild() {
    const rp = getNearbyRebuildPoint();
    if (!rp) return false;
    const nextTier = rp.level + 1;
    const costs = typeof REBUILD_TIER_COSTS !== 'undefined' ? REBUILD_TIER_COSTS[rp.key] : null;
    const labels = typeof REBUILD_TIER_LABELS !== 'undefined' ? REBUILD_TIER_LABELS[rp.key] : null;
    const descs = typeof REBUILD_TIER_DESCS !== 'undefined' ? REBUILD_TIER_DESCS[rp.key] : null;
    const cost = costs ? costs[nextTier - 1] : (REBUILD_COSTS[rp.key] || 250);
    const label = labels ? labels[nextTier - 1] : (REBUILD_LABELS[rp.key] || 'Upgrade');
    if (playerGold < cost) {
        pickupTexts.push({ text: 'Not enough gold (' + cost + 'g needed)', color: '#cc4444',
            row: rp.row, col: rp.col, offsetY: -20, life: 2.0 });
        return true;
    }
    playerGold -= cost;
    hamletRebuild[rp.key] = nextTier;
    if (typeof addScreenShake === 'function') addScreenShake(6 + nextTier * 2, 0.4);
    if (typeof spawnParticleBurst === 'function') spawnParticleBurst(rp.row, rp.col, 25 + nextTier * 10, '#ffd700');
    if (typeof addSlowMo === 'function') addSlowMo(0.15, 0.3);
    if (typeof sfxLevelUp === 'function') sfxLevelUp();
    pickupTexts.push({ text: label + ' \u2014 Tier ' + nextTier + '!', color: '#ffd700',
        row: rp.row, col: rp.col, offsetY: -30, life: 3.0 });
    if (descs) {
        pickupTexts.push({ text: descs[nextTier - 1], color: '#ccaa66',
            row: rp.row, col: rp.col, offsetY: -15, life: 3.0 });
    }
    // Apply tier-specific passive bonuses
    if (rp.key === 'guardPost' && typeof questState !== 'undefined') {
        const dmgBonus = nextTier === 2 ? 2 : nextTier === 3 ? 2 : 0; // +2 at tier 2, +2 more at tier 3
        if (dmgBonus > 0) {
            questState.permBonuses.dmgBonus = (questState.permBonuses.dmgBonus || 0) + dmgBonus;
            pickupTexts.push({ text: '+' + dmgBonus + ' Permanent Damage', color: '#dd8844',
                row: player.row, col: player.col, offsetY: -10, life: 2.5 });
        }
    }
    if (rp.key === 'forge' && nextTier === 3 && typeof questState !== 'undefined') {
        questState.permBonuses.dmgBonus = (questState.permBonuses.dmgBonus || 0) + 2;
        pickupTexts.push({ text: '+2 Permanent Damage (Master Forge)', color: '#dd8844',
            row: player.row, col: player.col, offsetY: -10, life: 2.5 });
    }
    // Reload zone to show rebuilt building — preserve player position
    const _rebuildRow = player.row, _rebuildCol = player.col;
    try {
        loadZone(0);
        updateDoorDefsForZone(0);
        updateChestDefsForZone(0);
        if (typeof buildRoomBounds === 'function') buildRoomBounds();
        if (typeof buildEnvironmentLights === 'function') buildEnvironmentLights();
        loadZoneNPCs(0);
        if (typeof updateFogOfWar === 'function') updateFogOfWar();
    } catch(e) { console.error('Rebuild zone reload failed:', e); }
    // Restore player position (loadZone resets to south entrance)
    player.row = _rebuildRow;
    player.col = _rebuildCol;
    player.vx = 0; player.vy = 0;
    // Snap camera to prevent jump
    const _rbPos = tileToScreen(player.row, player.col);
    smoothCamX = canvasW / 2 - _rbPos.x;
    smoothCamY = canvasH / 2 - _rbPos.y;
    cameraX = Math.round(smoothCamX);
    cameraY = Math.round(smoothCamY);
    return true;
}

function drawRebuildPrompt() {
    if (currentZone !== 0 || typeof hamletRebuild === 'undefined') return;
    if (gameDead || inventoryOpen || gamePaused || zoneTransitionFading) return;
    const rp = getNearbyRebuildPoint();
    if (!rp) return;
    const nextTier = (rp.level || 0) + 1;
    const costs = typeof REBUILD_TIER_COSTS !== 'undefined' ? REBUILD_TIER_COSTS[rp.key] : null;
    const labels = typeof REBUILD_TIER_LABELS !== 'undefined' ? REBUILD_TIER_LABELS[rp.key] : null;
    const cost = costs ? costs[nextTier - 1] : (REBUILD_COSTS[rp.key] || 250);
    const label = (labels ? labels[nextTier - 1] : REBUILD_LABELS[rp.key]) + ' (Tier ' + nextTier + ')';
    const canAfford = playerGold >= cost;
    const pos = tileToScreen(rp.row, rp.col);
    const sx = pos.x + cameraX, sy = pos.y + cameraY - 80;
    const pulse = 0.6 + Math.sin(performance.now() / 500) * 0.2;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 13px Georgia'; // Set font BEFORE measuring text width

    // Badge background — prominent and readable
    const _promptText = '[E]  ' + label + ' (' + cost + 'g)';
    const _rbw = Math.max(180, ctx.measureText(_promptText).width + 40);
    // Register bounds for overlap prevention
    if (typeof _registerWorldLabel === 'function') _registerWorldLabel(sx, sy, _rbw, 32);
    ctx.globalAlpha = pulse * 0.85;
    ctx.fillStyle = '#0e0c06';
    ctx.shadowColor = canAfford ? 'rgba(200, 160, 40, 0.4)' : 'rgba(180, 60, 40, 0.3)';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.roundRect(sx - _rbw / 2, sy - 16, _rbw, 32, 6);
    ctx.fill();
    ctx.strokeStyle = canAfford ? '#d4a840' : '#aa4444';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Key + label text
    ctx.globalAlpha = pulse;
    ctx.fillStyle = canAfford ? '#ffd855' : '#dd6644';
    ctx.fillText(_promptText, sx, sy);

    ctx.restore();
}

function drawDoorPrompt() {
    if (gameDead || inventoryOpen || gamePaused || zoneTransitionFading) return;
    if (FormSystem.currentForm === 'slime' && currentZone !== 0) return; // slime can't open doors (except in town)
    const door = getNearbyDoor();
    if (!door) return;

    const locked = isDoorLocked(door.row, door.col);
    const pos = tileToScreen(door.row, door.col);
    let sx = pos.x + cameraX;
    let sy = pos.y + cameraY - 70;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const pulse = 0.6 + Math.sin(performance.now() / 500) * 0.2;

    // Unified action badge — bold, readable
    const _doorLabel = locked ? (door.def.lockedLabel || 'Locked') : (door.def.label || 'Enter');
    const _doorText = '[E]  ' + _doorLabel;
    ctx.font = 'bold 13px Georgia';
    const _dw = Math.max(120, ctx.measureText(_doorText).width + 36);
    // Register bounds for overlap prevention
    if (typeof _registerWorldLabel === 'function') _registerWorldLabel(sx, sy, _dw, 32);
    ctx.globalAlpha = pulse * 0.85;
    ctx.fillStyle = '#0e0c06';
    ctx.shadowColor = locked ? 'rgba(180, 60, 40, 0.3)' : 'rgba(80, 130, 200, 0.4)';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.roundRect(sx - _dw / 2, sy - 16, _dw, 32, 6);
    ctx.fill();
    ctx.strokeStyle = locked ? '#aa5544' : '#6699bb';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.globalAlpha = pulse;
    ctx.fillStyle = locked ? '#dd6644' : '#c8ddf0';
    ctx.fillText(_doorText, sx, sy);

    ctx.restore();
}

