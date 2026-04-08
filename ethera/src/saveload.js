// ============================================================
//  SAVE / LOAD SYSTEM
// ============================================================
// This module handles all save/load functionality including:
// - Loading save slots from localStorage (browser) or local files (Electron)
// - Saving game state (saveGame)
// - Loading game state (loadGame)
// - Auto-save slot selection (getAutoSaveSlot)
// - Save date formatting (formatSaveDate)
//
// Dependencies: config.js (SAVE_KEY_PREFIX, saveSlots), all game state globals
// Global references: player, FormSystem, inventory, upgrades, keyItems, etc.
//
// When running in Electron, saves go to the user's AppData folder as JSON files.
// When running in a browser, saves use localStorage as before.

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
        } catch (e) { saveSlots[i] = null; }
    }
}

function saveGame(slotIdx) {
    const data = {
        version: 1,
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
    };
    try {
        if (_useFileSaves) {
            window.ethera.saveSlot(slotIdx, data);
        } else {
            localStorage.setItem(SAVE_KEY_PREFIX + slotIdx, JSON.stringify(data));
        }
        saveSlots[slotIdx] = data;
    } catch (e) { console.error('Save failed:', e); }
}

function loadGame(slotIdx) {
    const data = saveSlots[slotIdx];
    if (!data) return false;

    // Version check for save format migration
    if (!data.version || data.version < 1) {
        console.warn('Legacy save format detected, attempting migration...');
    }

    // Validate critical save fields
    if (!data || data.zone === undefined || !data.form) {
        console.error('Save data corrupted or incomplete');
        if (typeof Notify !== 'undefined') Notify.toast('Save data corrupted', { duration: 3, color: '#ff6644' });
        return false;
    }

    playerName = data.playerName || 'Wizard';
    currentZone = data.currentZone != null ? data.currentZone : 1;

    // Rebuild the zone
    loadZone(currentZone);
    updateDoorDefsForZone(currentZone);
    updateChestDefsForZone(currentZone);
    buildRoomBounds();

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

const ZONE_NAMES_SHORT = { 1: 'Undercroft', 2: 'Ruined Tower', 3: 'The Spire' };
