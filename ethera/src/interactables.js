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
    // Check other key drops
    for (let i = worldKeyDrops.length - 1; i >= 0; i--) {
        const d = worldKeyDrops[i];
        if (d.spawnTime > 0) continue;
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
    if (form !== 'wizard' && form !== 'lich') return {}; // no equipment for slime/skeleton
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
    return totals;
}

// On enemy death — roll for loot
function rollEnemyLoot(enemy) {
    const dropChance = DROP_CHANCE_BASE;
    if (Math.random() < dropChance) {
        const item = generateItem(wave.current);
        dropItemInWorld(enemy.row, enemy.col, item);
    }
}

// ============================================================
//  INTERACTABLE CHESTS
// ============================================================
// Chest registry — defines what each chest contains and requires
// Zone-aware chest definitions (rebuilt per zone)
let CHEST_DEFS = {};
function updateChestDefsForZone(zone) {
    if (zone === 0) {
        // Town chests — scattered around The Hamlet as rewards for exploration
        CHEST_DEFS = {
            '15,20': { type: 'loot', label: 'Open' },  // Town square NE
            '19,10': { type: 'loot', label: 'Open' },  // Town square SW
            '13,5':  { type: 'loot', label: 'Open' },  // Chapel interior
            '26,26': { type: 'loot', label: 'Open' },  // Inn interior
            '14,27': { type: 'loot', label: 'Open' },  // Forge interior
            '16,6':  { type: 'loot', label: 'Open' },  // Graveyard (eerie)
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
            // No chests in zone 3 (focus on boss encounter)
            // Boss drops the key to exit
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
        };
    } else if (zone === 5) {
        CHEST_DEFS = {
            // Zone 5: No chests — frozen echoes serve as environmental storytelling
        };
    } else if (zone === 6) {
        CHEST_DEFS = {
            // Zone 6: No chests — Pale Queen dialogue is the story delivery
        };
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
    const mapSize = floorMap.length;
    for (let r = 0; r < mapSize; r++) {
        for (let c = 0; c < mapSize; c++) {
            if (objectMap[r][c] !== 'chestClosed') continue;
            if (openedChests.has(`${r},${c}`)) continue;
            const dr = player.row - r;
            const dc = player.col - c;
            if (Math.sqrt(dr * dr + dc * dc) < CHEST_INTERACT_RANGE) {
                return { row: r, col: c };
            }
        }
    }
    return null;
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

    // Clear glow cache on zone load
    clearGlowCache();

    // Apply zone-specific tile dimensions
    applyZoneTileConfig(zoneNumber);

    // Determine MAP_SIZE for this zone
    const zoneCfg = ZONE_CONFIGS[zoneNumber];
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

    // Clear game state
    enemies.length = 0;
    projectiles.length = 0;
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
    // Reset lich corpse locations on zone transition
    if (typeof lichState !== 'undefined') {
        lichState.corpseLocations.length = 0;
    }
    worldDrops.length = 0;
    worldKeyDrops.length = 0;
    openedChests.clear();
    pickupTexts.length = 0;
    // Keep only ambient particles (no type), clear combat particles
    for (let i = particles.length - 1; i >= 0; i--) {
        if (particles[i] && particles[i].type) particles.splice(i, 1);
    }
    gameDead = false;

    // Update objective based on zone
    if (zoneNumber === 0) {
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

    // Generate the appropriate zone
    if (zoneNumber === 0) {
        generateTown();
        player.row = 27;
        player.col = 15;
        player.vx = 0;
        player.vy = 0;
    } else if (zoneNumber === 1) {
        generateDungeon();
        player.row = 4;
        player.col = 3;
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
    const _zoneCfg = ZONE_CONFIGS[zoneNumber];
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

    // Update music to menu (calmer between zones)
    playMusic('menu', 2.0);

    // Reset camera
    smoothCamX = 0;
    smoothCamY = 0;
    cameraX = 0;
    cameraY = 0;


    // Trigger zone name display
    const zoneCfgName = ZONE_CONFIGS[zoneNumber] || {};
    if (typeof Notify !== 'undefined') Notify.showZoneBanner(zoneCfgName.name || 'Unknown Zone');

    // Switch to playing phase
    gamePhase = 'playing';
}

// ============================================================
//  INTERACTABLE DOORS / STAIRS (zone exits)
// ============================================================
// Zone-specific door definitions (rebuilt per zone)
let DOOR_DEFS = {};
function updateDoorDefsForZone(zone) {
    if (zone === 1) {
        const townDoor = { requiresKey: 'town_pass', label: 'Step Outside', lockedLabel: 'The way is sealed...', destination: 'town' };
        DOOR_DEFS = {
            // Town exit — Cell north wall archway only (reduced from 6 tiles to prevent accidental triggers)
            '1,4': townDoor, '1,5': townDoor,
            // Zone 2 stairs — centre-south of Great Hall
            '20,17': {
                requiresKey: 'dungeon_key',
                label: 'Ascend',
                lockedLabel: 'Locked',
                destination: 'zone2',
            },
        };
    } else if (zone === 0) {
        DOOR_DEFS = {
            '28,14': { requiresKey: null, label: 'Descend to Dungeon', destination: 'zone1' },
            '28,15': { requiresKey: null, label: 'Descend to Dungeon', destination: 'zone1' },
            '1,14': { requiresKey: null, label: 'Ascend', destination: 'zone2' },
            '1,15': { requiresKey: null, label: 'Ascend', destination: 'zone2' },
        };
    } else if (zone === 2) {
        DOOR_DEFS = {
            '33,15': {
                requiresKey: 'zone2_key',
                label: 'Ascend',
                lockedLabel: 'Locked',
                destination: 'zone3',
            },
        };
    } else if (zone === 3) {
        DOOR_DEFS = {
            '19,16': {
                requiresKey: 'zone3_exit_key',  // Boss drops this key on death
                label: 'Descend into the depths...',
                lockedLabel: 'Locked',
                destination: 'zone4',
            },
        };
    } else if (zone === 4) {
        DOOR_DEFS = {
            // Entry stairs (for going back — optional, matches zone 3 exit at 19,16)
            '1,16': { requiresKey: null, label: 'Return to the Spire', destination: 'zone3' },
            // Boss exit (south wall center) — locked until hell boss dies
            '26,13': { requiresKey: 'zone4_key', label: 'Descend Deeper...', lockedLabel: 'Sealed by dark power', destination: 'zone5' },
            '26,14': { requiresKey: 'zone4_key', label: 'Descend Deeper...', lockedLabel: 'Sealed by dark power', destination: 'zone5' },
        };
    } else if (zone === 5) {
        DOOR_DEFS = {
            // Entry — return to The Inferno (matches zone 4 exit at 26,13-14)
            '1,13': { requiresKey: null, label: 'Return to the Inferno', destination: 'zone4' },
            '1,14': { requiresKey: null, label: 'Return to the Inferno', destination: 'zone4' },
            // Boss exit — south end, descend to final zone
            '28,14': { requiresKey: 'zone5_key', label: 'Enter the Throne of Ruin', lockedLabel: 'An ancient seal holds...', destination: 'zone6' },
            '28,15': { requiresKey: 'zone5_key', label: 'Enter the Throne of Ruin', lockedLabel: 'An ancient seal holds...', destination: 'zone6' },
        };
    } else if (zone === 6) {
        DOOR_DEFS = {
            // Entry — return to Frozen Abyss (matches zone 5 exit at 28,14-15)
            '1,14': { requiresKey: null, label: 'Return to the Abyss', destination: 'zone5' },
            '1,15': { requiresKey: null, label: 'Return to the Abyss', destination: 'zone5' },
            // No exit — final zone. Victory comes from defeating the final boss.
        };
    }
}
const DOOR_INTERACT_RANGE = 2.2;
let zoneTransition = null; // null or { timer, phase, destination }

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
    'zone4': { forms: ['lich'], message: 'Only the undying may enter the Inferno...' },
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
    const formReq = ZONE_FORM_REQUIREMENTS[door.def.destination];
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

    // Begin zone transition fade (new system only)
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
            if (zt.destination === 'town') nextZone = 0;
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

function drawDoorPrompt() {
    if (gameDead || inventoryOpen || gamePaused || zoneTransitionFading) return;
    if (FormSystem.currentForm === 'slime') return; // slime can't open doors
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

    // Key badge
    ctx.globalAlpha = pulse * 0.7;
    ctx.fillStyle = locked ? '#1a0808' : '#08101a';
    ctx.strokeStyle = locked ? '#884444' : '#6688aa';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(sx - 14, sy - 10, 28, 20, 4);
    ctx.fill();
    ctx.stroke();

    ctx.globalAlpha = pulse * 0.9;
    ctx.font = 'bold 11px monospace';
    ctx.fillStyle = locked ? '#cc6644' : '#a0c8e0';
    ctx.fillText('E', sx, sy);

    // Label
    ctx.globalAlpha = pulse * (locked ? 0.6 : 0.5);
    ctx.font = 'italic 10px Georgia';
    ctx.fillStyle = locked ? '#aa5544' : '#8ab0cc';
    ctx.fillText(locked ? (door.def.lockedLabel || 'Locked') : (door.def.label || 'Enter'), sx, sy + 18);

    ctx.restore();
}

