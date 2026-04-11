// ============================================================
//  SAVE / LOAD SYSTEM
// ============================================================
// Dependencies: config.js (SAVE_KEY_PREFIX, saveSlots), all game state globals
// When running in Electron, saves go to the user's AppData folder as JSON files.
// When running in a browser, saves use localStorage as before.

const SAVE_FORMAT_VERSION = 3;  // bump when save schema changes

// Helper: detect if we're running inside Electron with file save support
const _useFileSaves = typeof window !== 'undefined' && window.ethera && window.ethera.isElectron;

function loadSaveSlots() {
    for (let i = 0; i < 3; i++) {
        try {
            if (_useFileSaves) {
                saveSlots[i] = window.ethera.loadSlot(i);
            } else {
                const raw = localStorage.getItem(SAVE_KEY_PREFIX + i);
                saveSlots[i] = raw ? JSON.parse(raw) : null;
            }
        } catch (e) {
            console.warn('Failed to load save slot ' + i + ':', e);
            saveSlots[i] = null;
        }
    }
}

function saveGame(slotIdx) {
    const data = {
        version: SAVE_FORMAT_VERSION,
        timestamp: Date.now(),
        playerName: playerName,
        currentZone: currentZone,
        playerRow: player.row,
        playerCol: player.col,
        level: xpState.level,
        xp: xpState.xp,
        xpToNext: xpState.xpToNext,
        hp: player.hp,
        mana: player.mana,
        inventory: {
            equipped: { ...inventory.equipped },
            backpack: [...inventory.backpack],
        },
        upgrades: { ...upgrades },
        keyItems: keyItems.map(k => k.id),
        waveNum: wave.current,
        // Evolution system
        currentForm: FormSystem.currentForm,
        previousForm: FormSystem.previousForm,
        evolutionCount: FormSystem.evolutionCount,
        talisman: { ...FormSystem.talisman },
        formData: JSON.parse(JSON.stringify(FormSystem.formData)),
        openedChests: [...openedChests],
        // Unified progression
        progressionIndex: progressionIndex,
        endlessUnlocked: endlessUnlocked,
        endlessDepth: endlessDepth,
        isProceduralZone: isProceduralZone,
        proceduralDepth: proceduralDepth,
    };
    try {
        if (_useFileSaves) {
            window.ethera.saveSlot(slotIdx, data);
        } else {
            localStorage.setItem(SAVE_KEY_PREFIX + slotIdx, JSON.stringify(data));
        }
        saveSlots[slotIdx] = data;
        if (typeof Notify !== 'undefined') Notify.toast('Game saved', { duration: 1.5, color: '#88cc88' });
    } catch (e) {
        console.error('Save failed (slot ' + slotIdx + '):', e);
        if (typeof Notify !== 'undefined') Notify.toast('Save failed!', { duration: 3, color: '#ff6644' });
    }
}

// Migrate saves from older versions to current format
function _migrateSave(data) {
    if (!data.version || data.version < 1) {
        // v0 → v1: Add missing fields with safe defaults
        data.version = 1;
        if (data.currentForm === undefined) data.currentForm = 'wizard';
        if (data.previousForm === undefined) data.previousForm = null;
        if (data.evolutionCount === undefined) data.evolutionCount = 0;
        if (!data.talisman) data.talisman = { level: 1, xp: 0, xpToNext: 100, perks: [], found: false };
        if (!data.formData) data.formData = {};
        if (!data.openedChests) data.openedChests = [];
    }
    if (data.version < 2) {
        // v1 → v2: Normalize field names (zone → currentZone, form → currentForm)
        if (data.zone !== undefined && data.currentZone === undefined) {
            data.currentZone = data.zone;
            delete data.zone;
        }
        if (data.form !== undefined && data.currentForm === undefined) {
            data.currentForm = data.form;
            delete data.form;
        }
        data.version = 2;
    }
    if (data.version < 3) {
        // v2 → v3: Add bossDefeated to slime formData, recalculate xpToNext with new curve
        if (data.formData && data.formData.slime && data.formData.slime.bossDefeated === undefined) {
            data.formData.slime.bossDefeated = false;
        }
        // XP curve changed — recalculate xpToNext for current level
        if (data.level) {
            data.xpToNext = xpForLevel(data.level);
        }
        data.version = 3;
    }
    return data;
}

// Validate that critical fields exist and are sane
function _validateSave(data) {
    if (!data || typeof data !== 'object') return 'Save data is null or not an object';
    if (data.currentZone === undefined && data.zone === undefined) return 'Missing zone';
    if (data.playerRow != null && (data.playerRow < 0 || data.playerRow > 64)) return 'Player row out of bounds';
    if (data.playerCol != null && (data.playerCol < 0 || data.playerCol > 64)) return 'Player col out of bounds';
    return null; // valid
}

function loadGame(slotIdx) {
    let data = saveSlots[slotIdx];
    if (!data) return false;

    // Migration: upgrade old save formats
    data = _migrateSave(data);
    saveSlots[slotIdx] = data; // store migrated version

    // Validate critical save fields
    const error = _validateSave(data);
    if (error) {
        console.error('Save data invalid:', error);
        if (typeof Notify !== 'undefined') Notify.toast('Save data corrupted: ' + error, { duration: 3, color: '#ff6644' });
        return false;
    }

    playerName = data.playerName || 'Wizard';
    currentZone = data.currentZone != null ? data.currentZone : 1;

    // Rebuild the zone
    loadZone(currentZone);
    updateDoorDefsForZone(currentZone);
    updateChestDefsForZone(currentZone);
    buildRoomBounds();
    buildEnvironmentLights();

    // Restore player state
    if (data.playerRow != null) player.row = data.playerRow;
    if (data.playerCol != null) player.col = data.playerCol;
    player.vx = 0;
    player.vy = 0;
    player.hp = data.hp || 100;
    player.mana = data.mana || 100;
    player.state = 'idle';
    player.attacking = false;
    player.dodging = false;
    player.attackCooldown = 0;
    player.dodgeCoolTimer = 0;

    // Restore level
    xpState.level = data.level || 1;
    xpState.xp = data.xp || 0;
    xpState.xpToNext = data.xpToNext || xpForLevel(xpState.level);
    xpState.levelUpPending = false;
    xpState.levelUpChoices = [];

    // Restore upgrades
    for (const key of Object.keys(upgrades)) delete upgrades[key];
    if (data.upgrades) {
        for (const [k, v] of Object.entries(data.upgrades)) upgrades[k] = v;
    }

    // Restore inventory
    inventory.equipped = data.inventory?.equipped || { wand: null, robe: null, amulet: null, ring: null };
    inventory.backpack = data.inventory?.backpack || [];

    // Recalculate equipment bonuses immediately (BUG-017)
    if (typeof getEquipBonuses === 'function') {
        equipBonus = getEquipBonuses();
    }

    // Restore key items
    keyItems.length = 0;
    if (data.keyItems) {
        for (const id of data.keyItems) {
            const def = KEY_ITEM_DEFS[id];
            if (def) keyItems.push({ id, ...def });
        }
    }

    // Restore evolution system
    if (data.currentForm) FormSystem.currentForm = data.currentForm;
    if (data.previousForm !== undefined) FormSystem.previousForm = data.previousForm;
    if (data.evolutionCount !== undefined) FormSystem.evolutionCount = data.evolutionCount;
    if (data.talisman) Object.assign(FormSystem.talisman, data.talisman);
    if (data.formData) {
        for (const [form, fdata] of Object.entries(data.formData)) {
            if (FormSystem.formData[form]) Object.assign(FormSystem.formData[form], fdata);
        }
    }

    // Restore opened chests (mark them as opened on the object map)
    openedChests.clear();
    if (data.openedChests && Array.isArray(data.openedChests)) {
        for (const key of data.openedChests) {
            openedChests.add(key);
            const [r, c] = key.split(',').map(Number);
            if (objectMap[r] && objectMap[r][c] === 'chestClosed') {
                objectMap[r][c] = 'chestOpen';
            }
        }
    }

    // Restore unified progression state
    if (data.progressionIndex != null) progressionIndex = data.progressionIndex;
    if (data.endlessUnlocked != null) endlessUnlocked = data.endlessUnlocked;
    if (data.endlessDepth != null) endlessDepth = data.endlessDepth;
    if (data.isProceduralZone != null) isProceduralZone = data.isProceduralZone;
    if (data.proceduralDepth != null) proceduralDepth = data.proceduralDepth;

    // Set wave to zoneClear so player can explore and use doors/chests
    wave.current = data.waveNum || 0;
    wave.phase = 'zoneClear';
    wave.timer = 0;
    wave.bannerAlpha = 0;
    wave.enemiesAlive = 0;

    // Reset effects
    gameDead = false;
    gamePaused = false;
    menuOpen = false;
    screenShakeTimer = 0;
    hitPauseTimer = 0;

    // Camera snap
    const startPos = tileToScreen(player.row, player.col);
    smoothCamX = canvasW / 2 - startPos.x;
    smoothCamY = canvasH / 2 - startPos.y;
    cameraX = Math.round(smoothCamX);
    cameraY = Math.round(smoothCamY);

    // Reset light to full for loaded game
    lightRadius = MAX_LIGHT;
    setPixelCursor('none');
    gamePhase = 'playing';
    playMusic('cinematic', 1.5);
    return true;
}

function getAutoSaveSlot() {
    // Find the slot with the oldest save, or first empty slot
    let bestSlot = 0;
    let oldestTime = Infinity;
    for (let i = 0; i < 3; i++) {
        if (!saveSlots[i]) return i; // empty slot
        if (saveSlots[i].timestamp < oldestTime) {
            oldestTime = saveSlots[i].timestamp;
            bestSlot = i;
        }
    }
    return bestSlot;
}

function formatSaveDate(ts) {
    const d = new Date(ts);
    const mon = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return mon[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear() + '  ' +
           String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
}

// Derive zone display names from ZONE_CONFIGS (single source of truth)
const ZONE_NAMES_SHORT = {};
for (const [id, cfg] of Object.entries(ZONE_CONFIGS)) {
    ZONE_NAMES_SHORT[id] = cfg.name;
}
