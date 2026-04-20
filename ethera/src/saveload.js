// ============================================================
//  SAVE / LOAD SYSTEM
// ============================================================
// Dependencies: config.js (SAVE_KEY_PREFIX, saveSlots), all game state globals
// When running in Electron, saves go to the user's AppData folder as JSON files.
// When running in a browser, saves use localStorage as before.

const SAVE_FORMAT_VERSION = 10; // v10: legacy echoes, upgrade fusions, synergy tags, momentum, status effects, parry

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
        formHistory: FormSystem.formHistory ? [...FormSystem.formHistory] : [],
        legacyEchoes: FormSystem.legacyEchoes ? [...FormSystem.legacyEchoes] : [],
        fusedUpgrades: typeof fusedUpgrades !== 'undefined' ? { ...fusedUpgrades } : {},
        openedChests: [...openedChests],
        // Unified progression
        progressionIndex: progressionIndex,
        endlessUnlocked: endlessUnlocked,
        endlessDepth: endlessDepth,
        isProceduralZone: isProceduralZone,
        proceduralDepth: proceduralDepth,
        deepestDepthReached: deepestDepthReached,
        claimedMilestones: typeof claimedMilestones !== 'undefined' ? [...claimedMilestones] : [],
        activeModifierIds: (typeof activeModifiers !== 'undefined') ? activeModifiers.map(m => m.id) : [],
        questFlags: typeof questState !== 'undefined' ? { ...questState.flags } : {},
        questCompleted: typeof questState !== 'undefined' ? [...questState.completed] : [],
        questRerollTokens: typeof questState !== 'undefined' ? questState.rerollTokens : 0,
        questPermBonuses: typeof questState !== 'undefined' ? { ...questState.permBonuses } : { dmgBonus: 0, maxHpBonus: 0 },
        // Upgrade synergies
        activeSynergies: typeof activeSynergies !== 'undefined' ? { ...activeSynergies } : {},
        // Augment inventory (slime mutations / skeleton bone runes)
        augmentInventory: typeof augmentInventory !== 'undefined' ? {
            equipped: [...augmentInventory.equipped],
            backpack: [...augmentInventory.backpack],
        } : { equipped: [null, null, null], backpack: [] },
        // Player profile (persists across runs)
        playerProfile: typeof playerProfile !== 'undefined' ? JSON.parse(JSON.stringify(playerProfile)) : {},
        // Ascension system
        ascensionLevel: typeof ascensionLevel !== 'undefined' ? ascensionLevel : 0,
        ascensionUnlocked: typeof ascensionUnlocked !== 'undefined' ? ascensionUnlocked : 0,
        gameCleared: typeof gameCleared !== 'undefined' ? gameCleared : false,
        // Gold + Potions
        playerGold: typeof playerGold !== 'undefined' ? playerGold : 0,
        playerPotions: typeof playerPotions !== 'undefined' ? { ...playerPotions } : { health_vial: 0, mana_elixir: 0, fortitude_salt: 0 },
        forgeUpgrades: typeof forgeUpgrades !== 'undefined' ? { ...forgeUpgrades } : {},
        npcDialogueProgress: typeof _npcDialogueProgress !== 'undefined' ? { ..._npcDialogueProgress } : {},
        hamletRebuild: typeof hamletRebuild !== 'undefined' ? { ...hamletRebuild } : {},
        activePotionBuffs: typeof activePotionBuffs !== 'undefined' ? { ...activePotionBuffs } : {},
        currentObjective: typeof currentObjective !== 'undefined' ? currentObjective : '',
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
    if (data.version < 4) {
        // v3 → v4: Ensure talisman.perks is an array (talisman perk system)
        if (data.talisman && !Array.isArray(data.talisman.perks)) {
            data.talisman.perks = [];
        }
        data.version = 4;
    }
    if (data.version < 5) {
        if (!data.claimedMilestones) data.claimedMilestones = [];
        if (!data.questFlags) data.questFlags = {};
        if (!data.questCompleted) data.questCompleted = [];
        if (data.questRerollTokens === undefined) data.questRerollTokens = 0;
        if (!data.questPermBonuses) data.questPermBonuses = { dmgBonus: 0, maxHpBonus: 0 };
        data.version = 5;
    }
    if (data.version < 6) {
        if (!data.activeModifierIds) data.activeModifierIds = [];
        if (!data.questFlags) data.questFlags = {};
        if (!data.questCompleted) data.questCompleted = [];
        if (data.questRerollTokens === undefined) data.questRerollTokens = 0;
        if (!data.questPermBonuses) data.questPermBonuses = { dmgBonus: 0, maxHpBonus: 0 };
        data.version = 6;
    }
    if (data.version < 7) {
        if (data.ascensionLevel === undefined) data.ascensionLevel = 0;
        if (data.ascensionUnlocked === undefined) data.ascensionUnlocked = 0;
        if (data.gameCleared === undefined) data.gameCleared = false;
        // Migrate progression index (bridge zones removed: old 0,1,2,3,4,5,6,7,8,9 → new 0,0,1,1,2,2,3,3,4,5)
        if (data.progressionIndex !== undefined) {
            const _oldToNew = { 0:0, 1:0, 2:1, 3:1, 4:2, 5:2, 6:3, 7:3, 8:4, 9:5 };
            data.progressionIndex = _oldToNew[data.progressionIndex] !== undefined ? _oldToNew[data.progressionIndex] : data.progressionIndex;
        }
        data.version = 7;
    }
    if (data.version < 8) {
        // v7 → v8: Add hamlet rebuild system (all buildings start unbuilt)
        if (!data.hamletRebuild) {
            data.hamletRebuild = { forge: false, shop: false, guardPost: false, hermitHut: false, monument: false };
        }
        data.version = 8;
    }
    if (data.version < 9) {
        // v8 → v9: Augments, synergies, playerProfile, formHistory, echo perks
        if (!data.augmentInventory) data.augmentInventory = { equipped: [null, null, null], backpack: [] };
        if (!data.activeSynergies) data.activeSynergies = {};
        if (!data.playerProfile) data.playerProfile = {};
        if (!data.formHistory) data.formHistory = [];
        // Convert boolean hamlet rebuild to integer tiers (true→3, false→0)
        if (data.hamletRebuild) {
            for (var _hk in data.hamletRebuild) {
                if (data.hamletRebuild[_hk] === true) data.hamletRebuild[_hk] = 3;
                else if (data.hamletRebuild[_hk] === false) data.hamletRebuild[_hk] = 0;
            }
        }
        data.version = 9;
    }
    if (data.version < 10) {
        // v9 → v10: Legacy Echoes, Upgrade Fusions, Synergy Tags, Momentum, Status Effects
        if (!data.legacyEchoes) data.legacyEchoes = [];
        if (!data.fusedUpgrades) data.fusedUpgrades = {};
        data.version = 10;
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

    // Normalize rarity on load — legacy saves can carry a rarity string that no
    // longer exists in RARITY (e.g. 'normal', 'mythic'), which would crash any
    // code doing RARITY[item.rarity].color. Coerce to 'common' as a safe default.
    if (typeof RARITY !== 'undefined') {
        const _normalizeRarity = (it) => { if (it && !RARITY[it.rarity]) it.rarity = 'common'; };
        if (inventory.equipped) for (const slot in inventory.equipped) _normalizeRarity(inventory.equipped[slot]);
        if (Array.isArray(inventory.backpack)) inventory.backpack.forEach(_normalizeRarity);
    }

    // Recalculate equipment bonuses immediately (BUG-017)
    if (typeof getEquipBonuses === 'function') {
        equipBonus = getEquipBonuses();
        equipBonusDirty = false;
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
    FormSystem.formHistory = data.formHistory || [];
    FormSystem.legacyEchoes = data.legacyEchoes || [];
    if (typeof fusedUpgrades !== 'undefined' && data.fusedUpgrades) {
        for (const key of Object.keys(fusedUpgrades)) delete fusedUpgrades[key];
        Object.assign(fusedUpgrades, data.fusedUpgrades);
    }
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
    if (data.deepestDepthReached != null) deepestDepthReached = data.deepestDepthReached;

    // Restore abyss milestones and re-apply their permanent rewards
    if (typeof claimedMilestones !== 'undefined') {
        // Reset base stats before re-applying milestones (prevents stacking on multiple loads)
        if (typeof _BASE_MAX_HP !== 'undefined') PLAYER_STATS.maxHp = _BASE_MAX_HP;
        if (typeof _BASE_FIREBALL_DMG !== 'undefined') COMBAT.fireballDmg = _BASE_FIREBALL_DMG;
        claimedMilestones.length = 0;
        if (data.claimedMilestones && Array.isArray(data.claimedMilestones)) {
            for (const depth of data.claimedMilestones) {
                claimedMilestones.push(depth);
                // Re-apply milestone rewards
                if (typeof ABYSS_MILESTONES !== 'undefined') {
                    const m = ABYSS_MILESTONES.find(ms => ms.depth === depth);
                    if (m) {
                        if (m.reward.type === 'hp') PLAYER_STATS.maxHp += m.reward.value;
                        else if (m.reward.type === 'damage') COMBAT.fireballDmg += m.reward.value;
                    }
                }
            }
        }
    }

    // Restore abyss modifiers
    if (typeof activeModifiers !== 'undefined' && typeof ABYSS_MODIFIERS !== 'undefined') {
        activeModifiers.length = 0;
        if (data.activeModifierIds && Array.isArray(data.activeModifierIds)) {
            for (const id of data.activeModifierIds) {
                const mod = ABYSS_MODIFIERS.find(m => m.id === id);
                if (mod) activeModifiers.push(mod);
            }
        }
    }

    // Restore quest chain state
    if (typeof questState !== 'undefined') {
        questState.flags = data.questFlags || {};
        questState.completed = data.questCompleted || [];
        questState.rerollTokens = data.questRerollTokens || 0;
        questState.permBonuses = data.questPermBonuses || { dmgBonus: 0, maxHpBonus: 0 };
    }

    // Restore upgrade synergies
    if (typeof activeSynergies !== 'undefined' && data.activeSynergies) {
        for (const k of Object.keys(activeSynergies)) delete activeSynergies[k];
        Object.assign(activeSynergies, data.activeSynergies);
    }
    // Retroactively check synergies in case upgrade state qualifies for new ones
    if (typeof checkSynergies === 'function') checkSynergies();

    // Restore augment inventory
    if (typeof augmentInventory !== 'undefined') {
        if (data.augmentInventory) {
            augmentInventory.equipped = data.augmentInventory.equipped || [null, null, null];
            augmentInventory.backpack = data.augmentInventory.backpack || [];
        } else {
            augmentInventory.equipped = [null, null, null];
            augmentInventory.backpack = [];
        }
    }

    // Restore player profile (persists across runs — merge, don't replace)
    if (typeof playerProfile !== 'undefined' && data.playerProfile) {
        const saved = data.playerProfile;
        // Keep the HIGHER of current or saved values (profile should only grow)
        playerProfile.totalDeaths = Math.max(playerProfile.totalDeaths, saved.totalDeaths || 0);
        playerProfile.totalKills = Math.max(playerProfile.totalKills, saved.totalKills || 0);
        playerProfile.totalRuns = Math.max(playerProfile.totalRuns, saved.totalRuns || 0);
        playerProfile.bestZone = Math.max(playerProfile.bestZone, saved.bestZone || 0);
        playerProfile.bestWave = Math.max(playerProfile.bestWave, saved.bestWave || 0);
        playerProfile.bestKills = Math.max(playerProfile.bestKills, saved.bestKills || 0);
        playerProfile.bestLevel = Math.max(playerProfile.bestLevel, saved.bestLevel || 0);
        // Merge bestiary (keep higher kill counts)
        if (saved.bestiary) {
            for (const type in saved.bestiary) {
                if (!playerProfile.bestiary[type]) playerProfile.bestiary[type] = { killed: 0, killedBy: 0, name: '' };
                playerProfile.bestiary[type].killed = Math.max(playerProfile.bestiary[type].killed, saved.bestiary[type].killed || 0);
                playerProfile.bestiary[type].killedBy = Math.max(playerProfile.bestiary[type].killedBy, saved.bestiary[type].killedBy || 0);
                if (saved.bestiary[type].name) playerProfile.bestiary[type].name = saved.bestiary[type].name;
            }
        }
        if (saved.bestiary && saved.bestiary._eliteKills) {
            playerProfile.bestiary._eliteKills = Math.max(playerProfile.bestiary._eliteKills || 0, saved.bestiary._eliteKills);
        }
        // Merge milestones (once unlocked, stay unlocked)
        if (saved.milestones) {
            for (const id in saved.milestones) { if (saved.milestones[id]) playerProfile.milestones[id] = true; }
        }
        // Merge run history (take the longer list)
        if (saved.runHistory && saved.runHistory.length > (playerProfile.runHistory || []).length) {
            playerProfile.runHistory = saved.runHistory;
        }
        // Merge NPC relationship counts (keep highest)
        if (saved.npcRelationship) {
            if (!playerProfile.npcRelationship) playerProfile.npcRelationship = {};
            for (const npc in saved.npcRelationship) {
                playerProfile.npcRelationship[npc] = Math.max(playerProfile.npcRelationship[npc] || 0, saved.npcRelationship[npc] || 0);
            }
        }
        // Merge NPC bonuses claimed (once claimed, stay claimed)
        if (saved.npcBonusesClaimed) {
            if (!playerProfile.npcBonusesClaimed) playerProfile.npcBonusesClaimed = {};
            for (const id in saved.npcBonusesClaimed) {
                if (saved.npcBonusesClaimed[id]) playerProfile.npcBonusesClaimed[id] = true;
            }
        }
        // Merge best abyss depth per form
        if (saved.bestAbyssDepth) {
            if (!playerProfile.bestAbyssDepth) playerProfile.bestAbyssDepth = {};
            for (const form in saved.bestAbyssDepth) {
                playerProfile.bestAbyssDepth[form] = Math.max(playerProfile.bestAbyssDepth[form] || 0, saved.bestAbyssDepth[form] || 0);
            }
        }
    }

    // Restore ascension state
    if (typeof ascensionLevel !== 'undefined') ascensionLevel = data.ascensionLevel || 0;
    if (typeof ascensionUnlocked !== 'undefined') ascensionUnlocked = data.ascensionUnlocked || 0;
    if (typeof gameCleared !== 'undefined') gameCleared = data.gameCleared || false;

    // Restore gold + potions
    if (typeof playerGold !== 'undefined') playerGold = data.playerGold || 0;
    if (typeof playerPotions !== 'undefined' && data.playerPotions) {
        Object.assign(playerPotions, data.playerPotions);
    }
    if (typeof forgeUpgrades !== 'undefined' && data.forgeUpgrades) {
        Object.assign(forgeUpgrades, data.forgeUpgrades);
    }

    // Restore NPC dialogue progress
    if (typeof _npcDialogueProgress !== 'undefined' && data.npcDialogueProgress) {
        for (const [id, idx] of Object.entries(data.npcDialogueProgress)) {
            _npcDialogueProgress[id] = idx;
        }
    }

    // Restore hamlet rebuild state
    if (typeof hamletRebuild !== 'undefined' && data.hamletRebuild) {
        Object.assign(hamletRebuild, data.hamletRebuild);
    }

    // Restore potion buffs
    if (data.activePotionBuffs && typeof activePotionBuffs !== 'undefined') {
        Object.assign(activePotionBuffs, data.activePotionBuffs);
    }

    // Restore current objective
    if (data.currentObjective != null && typeof currentObjective !== 'undefined') {
        currentObjective = data.currentObjective;
    }

    // Set wave to zoneClear so player can explore and use doors/chests.
    //
    // BUGFIX (v1.17.3): previous code only reset `current/phase/timer/
    // bannerAlpha/enemiesAlive`, leaving `waveKills`, `totalKilled`, and
    // `modifier` with values from the save moment. If the save was taken
    // mid-run, the next wave would show stale kill counts in the UI and
    // the previous wave's modifier (goldMult, etc.) would still be active.
    wave.current = data.waveNum || 0;
    wave.phase = 'zoneClear';
    wave.timer = 0;
    wave.bannerAlpha = 0;
    wave.enemiesAlive = 0;
    wave.waveKills = 0;
    wave.totalKilled = 0;
    wave.modifier = null;
    wave.modifierTimer = 0;

    // Reset effects
    gameDead = false;
    gamePaused = false;
    menuOpen = false;
    menuFadeInTimer = 0;
    screenShakeTimer = 0;
    hitPauseTimer = 0;
    slowMoTimer = 0;
    slowMoScale = 1.0;

    // Reset form-specific runtime state (not saved, must reinitialize)
    if (typeof skeletonState !== 'undefined') {
        skeletonState._undyingUsed = false;
        skeletonState.comboCount = 0;
        skeletonState.comboTimer = 0;
        skeletonState.rolling = false;
        skeletonState.rollTimer = 0;
        skeletonState.boneFragments = [];
    }
    if (typeof slimeState !== 'undefined') {
        slimeState.splitClones.length = 0;
        slimeState.acidPuddles.length = 0;
        slimeState._absorbCooldown = 0;
    }
    if (typeof lichState !== 'undefined') {
        lichState.undeadMinions = [];
        lichState.lifeTapCooldown = 0;
        lichState.shadowStepCooldown = 0;
        lichState.deathAuraTimer = 0;
        // _phylacteryUsed intentionally NOT reset here — once per run, not per zone
    }
    // NOTE: zone-duration potion buffs are intentionally preserved across save/load.
    // clearPotionBuffsForZone() is NOT called here -- it only fires on zone transitions.
    // Reset notification state for fresh start
    if (typeof Notify !== 'undefined') Notify.reset();

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

function deleteSave(slotIdx) {
    if (slotIdx < 0 || slotIdx >= 3) return;
    try {
        if (_useFileSaves && window.ethera.deleteSlot) {
            window.ethera.deleteSlot(slotIdx);
        } else {
            localStorage.removeItem(SAVE_KEY_PREFIX + slotIdx);
        }
        saveSlots[slotIdx] = null;
    } catch (e) {
        console.warn('Failed to delete save slot ' + slotIdx + ':', e);
    }
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
