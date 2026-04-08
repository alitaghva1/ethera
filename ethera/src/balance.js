// ============================================================
//  TUNABLE GAME PARAMETERS — adjust balance from one place
// ============================================================
//
//  This file contains ONLY gameplay balance values and enemy tuning constants.
//  Static configuration (paths, tile sizes) → config.js
//  Runtime state (placement, pools, input) → further down, clearly separated.
//
const COMBAT = {
    atkDuration: 0.40,   atkCooldown: 0.45,   atkFireAt: 0.20,
    atkSpeed: 11,        projLife: 1.8,        projSize: 8,
    manaCost: 8,         fireballDmg: 20,      knockback: 2.5,
    explodeRadius: 2.5,  explodeDmgPct: 0.4,
};
const PLAYER_STATS = {
    maxHp: 100,    maxMana: 100,
    manaRegen: 12, manaRegenDelay: 0.8,
    invTime: 0.8,
};
const TOWER = {
    summonCost: 30,  maxCount: 1,
    range: 5.5,      fireRate: 0.8,
    damage: 35,      boltSpeed: 9,
};
const DIFFICULTY = { scale: 1.0 }; // global difficulty multiplier

// ── Convenience accessors (use the grouped objects above for new code) ──
const ATK_DURATION    = COMBAT.atkDuration;
const ATK_COOLDOWN    = COMBAT.atkCooldown;
const ATK_FIRE_AT     = COMBAT.atkFireAt;
const ATK_SPEED       = COMBAT.atkSpeed;
const ATK_PROJ_LIFE   = COMBAT.projLife;
const ATK_PROJ_SIZE   = COMBAT.projSize;
const ATK_MANA_COST   = COMBAT.manaCost;
const MAX_HP          = PLAYER_STATS.maxHp;
const MAX_MANA        = PLAYER_STATS.maxMana;
const MANA_REGEN      = PLAYER_STATS.manaRegen;
const MANA_REGEN_DELAY = PLAYER_STATS.manaRegenDelay;
const SUMMON_MANA_COST = TOWER.summonCost;
const SUMMON_MAX_COUNT = TOWER.maxCount;
const TOWER_RANGE      = TOWER.range;
const TOWER_FIRE_RATE  = TOWER.fireRate;
const TOWER_DAMAGE     = TOWER.damage;
const TOWER_BOLT_SPEED = TOWER.boltSpeed;

// ============================================================
//  ENEMY GAMEPLAY CONSTANTS — consolidate balance tuning
// ============================================================

// --- Spawn & Wave Scaling ---
const ENEMY_SPAWN_MIN_DISTANCE = 4;         // Enemies spawn at least this far from player
const ENEMY_STAGGER_COOLDOWN = 0.4;         // Base stagger cooldown per enemy type
const ENEMY_STAGGER_VARIANCE = 0.3;         // Random variance on stagger cooldown

// --- Elite Modifier System (Zone 3+) ---
const ELITE_BASE_CHANCE = 0.05;             // 5% base elite spawn chance (zone 3)
const ELITE_MAX_CHANCE = 0.25;              // Cap at 25% elite chance
const ELITE_CHANCE_PER_ZONE = 0.05;         // +5% per zone above zone 3
const ELITE_SWIFT_SPEED_MULT = 1.5;         // Swift elite: speed multiplier
const ELITE_SWIFT_SCALE_MULT = 0.9;         // Swift elite: slightly smaller
const ELITE_VAMPIRIC_DAMAGE_MULT = 0.85;    // Vampiric elite: reduced damage
const ELITE_VAMPIRIC_HEAL_MULT = 0.3;       // Vampiric elite: heal % of damage dealt
const ELITE_VOLATILE_HP_MULT = 0.7;         // Volatile elite: reduced max HP
const ELITE_SPLITTING_HP_MULT = 0.6;        // Splitting elite: reduced max HP

// --- Enemy Contact & Projectile Damage ---
const ENEMY_CONTACT_DAMAGE_MULT = 0.5;      // Contact damage is 50% of melee damage
const ENEMY_PROJECTILE_BURST_MULT = 0.7;    // Burst projectiles do 70% normal damage
const BOSS_PROJECTILE_PHASE_MULT_ENRAGED = 1.3;  // Phase 1+: projectiles do 30% more damage
const BOSS_CAGE_DAMAGE_MULT = 0.4;          // Bone cage trap: 40% of boss damage
const BOSS_SHATTER_PHASE_MULT = 1.3;        // Frost Wyrm shatter in phase 1: 30% bonus damage
const BOSS_VOID_PULSE_PHASE_MULT = 1.3;     // Ruined King void pulse phase 1+: 30% bonus damage

// --- Distance Thresholds & Ranges (tiles) ---
const ENEMY_RETREAT_CHECK_DISTANCE = 3.0;   // Werewolf howl retreat threshold
const BOSS_SLAM_CHECK_DISTANCE = 4.0;       // Slime King slam activation distance
const BOSS_FREEZE_TRAP_DISTANCE = 8.0;      // Frost Wyrm freeze trap range
const BOSS_SHATTER_RANGE = 4.0;             // Frost Wyrm shatter trigger range (phase 2+)
const BOSS_TELEPORT_MIN_DISTANCE = 2.0;     // Ruined King: min distance for teleport

// --- Elite Modifier Probabilities ---
const ELITE_VOLATILE_EXPLODE_CHANCE = 0.5;  // Chance to explode on death
const ELITE_SPLITTING_SPAWN_CHANCE = 0.4;   // Chance to summon add type (skelarch vs skeleton)
const BOSS_HOWL_TRIGGER_CHANCE = 0.02;      // Werewolf: chance to howl per update at low HP
const BOSS_PHASE_2_SPAWN_CHANCE = 0.6;      // Boss phase 2: spawn chance on certain attacks
const BOSS_CAGE_SECONDARY_SPAWN_CHANCE = 0.4; // Secondary enemy type spawn from cage

// --- Boss Phase Thresholds ---
const BOSS_ENRAGE_HP_THRESHOLD = 0.5;       // Boss enters phase 1 at 50% HP
const BOSS_DESPERATE_HP_THRESHOLD = 0.25;   // Boss enters phase 2 at 25% HP (Ruined King only)

// --- Healing & Leech Multipliers ---
const VAMPIRIC_ELITE_HEAL_PER_HIT = 0.3;    // Vampiric elite heals this % of damage dealt
const MARROW_LEECH_HEAL_MULT = 0.15;        // Marrow Leech: heal % of projectile damage

// ============================================================
//  RUNTIME STATE — mutable game objects (not balance tuning)
// ============================================================

// Placement mode state
const placement = {
    active: false,    // true when in placement mode
    row: 0, col: 0,  // tile position under cursor
    valid: false,     // can the tower be placed here?
    channeling: false,
    channelTimer: 0,
    channelDuration: 0.6,
    channelRow: 0,
    channelCol: 0,
};

// Active summons (towers)
const summons = [];
// Tower bolts (separate from player projectiles)
const towerBolts = [];

// Ghost trail afterimages
const ghosts = [];

// Projectile system with object pooling
const projectiles = [];
const _projPool = []; // recycled projectile objects
const _boltPool = []; // recycled tower bolt objects
function getPooledProj() {
    const p = _projPool.pop() || {};
    // Reset ALL flags to prevent contamination from previous projectile type
    p.hit = false; p.life = 0; p.row = 0; p.col = 0; p.vr = 0; p.vc = 0;
    p.size = 6; p.damage = 0; p.pierce = 0; p.pierceLeft = 0;
    p.explode = false; p.canExplode = false; p.explodeScale = 0;
    p.bounce = 0; p.bounceLeft = 0;
    p.isAcid = false; p.isBone = false; p.isDark = false;
    p.isBoomerang = false; p.marrowLeech = false;
    p.boomerangTimer = 0;
    p.hitEnemies = null; p.trail = []; p.animTime = 0; p.angle = 0;
    p.vx = 0; p.vy = 0; // used by bone projectile rotation
    return p;
}
function getPooledBolt() { return _boltPool.pop() || {}; }
function recycleProj(p) { if (_projPool.length < 80) _projPool.push(p); }
function recycleBolt(b) { if (_boltPool.length < 40) _boltPool.push(b); }

// ----- INPUT -----
const keys = {};
const mouse = { x: 0, y: 0, down: false, rightDown: false };

// Guard flag to prevent listener duplication on game restart
let inputListenersRegistered = false;

// Named input handler functions for proper cleanup
function handleKeyDown(e) {
    keys[e.key.toLowerCase()] = true;
    // Prevent default for game keys — but NOT during name entry (let the input handle typing)
    if (gamePhase !== 'nameEntry' &&
        ['arrowup','arrowdown','arrowleft','arrowright',' '].includes(e.key.toLowerCase())) {
        e.preventDefault();
    }
    // Name entry: prevent Tab from stealing focus from input
    if (gamePhase === 'nameEntry' && e.key === 'Tab') {
        e.preventDefault();
        return;
    }
    // Name entry: Enter confirms name
    if (gamePhase === 'nameEntry' && e.key === 'Enter') {
        const val = nameInputEl ? nameInputEl.value.trim() : '';
        playerName = val.length > 0 ? val : 'Wanderer';
        if (nameInputEl) { nameInputEl.blur(); nameInputEl.value = ''; }
        gamePhase = 'menuFade';
        menuFadeTarget = 'intro';
        menuFadeAlpha = 1;
        return;
    }
    // Name entry: Escape goes back to menu
    if (gamePhase === 'nameEntry' && e.key === 'Escape') {
        if (nameInputEl) { nameInputEl.blur(); nameInputEl.value = ''; }
        gamePhase = 'menuFade';
        menuFadeTarget = 'menu';
        nameEntryAlpha = 0;
        return;
    }
    // Load screen: Escape goes back
    if (gamePhase === 'loadScreen' && e.key === 'Escape') {
        gamePhase = 'menuFade';
        menuFadeTarget = 'menu';
        loadScreenAlpha = 0;
        return;
    }
    // Journal reader navigation
    if (journalOpen) {
        if (e.key === 'Escape' || e.key === 'Enter') { closeJournalReader(); return; }
        const def = KEY_ITEM_DEFS[journalItemId];
        const maxPage = def && def.pages ? def.pages.length - 1 : 0;
        if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
            if (journalPage < maxPage) journalPage++;
            return;
        }
        if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
            if (journalPage > 0) journalPage--;
            return;
        }
        return; // consume all keys while journal is open
    }
    // NPC dialogue navigation
    if (npcDialogueOpen) {
        if (e.key === 'Escape' || e.key.toLowerCase() === 'e') {
            handleNPCInteraction();
            return;
        }
        return; // consume all keys while NPC dialogue is open
    }
    // Evolution hint screen — dismiss on any key
    if (typeof evolutionHintState !== 'undefined' && evolutionHintState.active && typeof dismissEvolutionHint === 'function') {
        dismissEvolutionHint();
        return; // consume all keys during hint screen
    }
    // Escape closes game menu
    if (e.key === 'Escape') {
        if (menuOpen) { menuOpen = false; menuFadeInTimer = 0; }
        else if (inventoryOpen) { inventoryOpen = false; invHover = null; invTooltipItem = null; }
        else if (placement.active) { placement.active = false; }
    }
    // TAB or J toggles game menu
    if ((e.key === 'Tab' || e.key.toLowerCase() === 'j') && gamePhase === 'playing' && !gameDead) {
        e.preventDefault();
        menuOpen = !menuOpen;
        if (!menuOpen) menuFadeInTimer = 0;
        // Reset to STATUS if current tab is hidden for this form
        if (menuOpen) {
            const _mCfg = FORM_CONFIGS[FormSystem.currentForm] || {};
            const _mHiddenTabs = [];
            if (!_mCfg.hasEquipment) _mHiddenTabs.push('equipment');
            if (_mCfg.hasKeyItems === false) _mHiddenTabs.push('keyitems', 'quests', 'map');
            if (_mHiddenTabs.includes(menuTab)) menuTab = 'status';
        }
    }
    // I key opens Grimoire directly to Equipment tab (wizard/lich only)
    if (e.key.toLowerCase() === 'i' && gamePhase === 'playing' && !gameDead) {
        const form = FormSystem.currentForm;
        if (form === 'wizard' || form === 'lich') {
            e.preventDefault();
            if (menuOpen && menuTab === 'equipment') {
                menuOpen = false; menuFadeInTimer = 0;
            } else {
                menuOpen = true; menuTab = 'equipment';
            }
        }
        // Slime/Skeleton: no equipment access (no hands!)
    }
    // E key interacts with nearby objects (chests, doors, NPCs) OR form-specific interact
    if (e.key.toLowerCase() === 'e' && gamePhase === 'playing' && !gameDead && !menuOpen && !zoneTransitionFading) {
        const _eHandler = FormSystem.getHandler();
        const _eForm = FormSystem.currentForm;
        // Priority 1: Doors — ALL forms can use doors (including slime)
        const door = getNearbyDoor();
        if (door) {
            tryUseDoor(door);
        }
        // Priority 2: NPCs — talk to townsfolk (town zone only, returns false if no NPC nearby)
        else if (currentZone === 0 && handleNPCInteraction()) {
            // NPC interaction consumed the input
        }
        // Priority 3: Form-specific interact (slime absorb, skeleton consume, lich harvest)
        else if (_eHandler && _eHandler.onInteract) {
            _eHandler.onInteract();
        }
        // Priority 4: Chests (forms with canOpenChests)
        else {
            const _eCfg = FORM_CONFIGS[_eForm] || {};
            if (_eCfg.canOpenChests) {
                const chest = getNearbyChest();
                if (chest) { openChest(chest); }
            }
        }
    }
    // Space key — dodge/ability for skeleton & lich (slime and wizard handle internally)
    if (e.key === ' ' && gamePhase === 'playing' && !gameDead && !menuOpen && !zoneTransitionFading) {
        const form = FormSystem.currentForm;
        if (form !== 'slime' && form !== 'wizard') {
            const handler = FormSystem.getHandler();
            if (handler && handler.onDodge) handler.onDodge();
        }
    }
    // P key pauses game
    if (e.key.toLowerCase() === 'p' && gamePhase === 'playing' && !gameDead) {
        gamePaused = !gamePaused;
        if (gamePaused) pauseMusic();
        else resumeMusic();
    }
    // T key cycles tower target mode: nearest -> strongest -> weakest -> nearest
    if (e.key.toLowerCase() === 't' && gamePhase === 'playing' && !gameDead && summons.length > 0) {
        e.preventDefault();
        if (towerTargetMode === 'nearest') {
            towerTargetMode = 'strongest';
        } else if (towerTargetMode === 'strongest') {
            towerTargetMode = 'weakest';
        } else {
            towerTargetMode = 'nearest';
        }
        towerModeDisplayTimer = 2.0;  // Show indicator for 2 seconds
    }
    // H key toggles controls reference
    if (e.key === 'h' || e.key === 'H') {
        if (typeof Notify !== 'undefined') Notify.toggleControls();
    }
}

function handleKeyUp(e) {
    keys[e.key.toLowerCase()] = false;
}

function handleMouseMove(e) {
    // Convert physical screen coords to virtual game coords
    const scale = typeof displayScale !== 'undefined' ? displayScale : 1;
    mouse.x = e.clientX / scale;
    mouse.y = e.clientY / scale;
    // Update ending choice hover state
    if (typeof handleEndingChoiceHover === 'function') handleEndingChoiceHover(mouse.x, mouse.y);
}

function handleMouseDown(e) {
    // Always update mouse position from click event (in case mousemove hasn't fired)
    const scale = typeof displayScale !== 'undefined' ? displayScale : 1;
    const clickX = e.clientX / scale;
    const clickY = e.clientY / scale;
    mouse.x = clickX;
    mouse.y = clickY;

    // ----- Journal reader clicks -----
    if (journalOpen && e.button === 0) {
        const cx = canvasW / 2;
        const cy = canvasH / 2;
        const pw = 380, ph = 340;
        const jpx = cx - pw / 2, jpy = cy - ph / 2;
        // Click inside parchment?
        if (clickX >= jpx && clickX <= jpx + pw && clickY >= jpy && clickY <= jpy + ph) {
            const def = KEY_ITEM_DEFS[journalItemId];
            const maxPage = def && def.pages ? def.pages.length - 1 : 0;
            // Left third = prev, right third = next, middle = do nothing
            if (clickX < jpx + pw * 0.33 && journalPage > 0) journalPage--;
            else if (clickX > jpx + pw * 0.67 && journalPage < maxPage) journalPage++;
        } else {
            closeJournalReader(); // click outside closes
        }
        return;
    }

    // ----- Game menu tab clicks (must match drawGameMenu layout exactly) -----
    if (menuOpen && e.button === 0) {
        const cx = canvasW / 2;
        const cy = canvasH / 2;
        const pw = 540, ph = 540;
        const px = cx - pw / 2, py = cy - ph / 2;
        const tabY = py + 60;
        const tabH = 30;
        const tabGap = 4;
        const totalTabW = pw - 48;
        const _cForm = FormSystem.currentForm;
        const _cCfg = FORM_CONFIGS[_cForm] || {};
        const _cHasEquip = !!_cCfg.hasEquipment;
        const _cHasKeyItems = _cCfg.hasKeyItems !== false;
        const tabs = [
            'status',
            ...(_cHasEquip ? ['equipment'] : []),
            ...(_cHasKeyItems ? ['keyitems', 'quests', 'map'] : []),
        ];
        const tabW = (totalTabW - tabGap * (tabs.length - 1)) / tabs.length;

        for (let i = 0; i < tabs.length; i++) {
            const tx = px + 24 + i * (tabW + tabGap);
            if (clickX >= tx && clickX <= tx + tabW &&
                clickY >= tabY && clickY <= tabY + tabH) {
                menuTab = tabs[i];
                return;
            }
        }

        // Equipment tab: handle equip/unequip/drop clicks
        if (menuTab === 'equipment') {
            const contentY = tabY + tabH + 14;
            const contentX = px + 24;
            const contentW = pw - 48;
            const contentH = py + ph - contentY - 32;

            // Check equip slots — click to unequip
            for (let i = 0; i < EQUIP_SLOTS.length; i++) {
                const rect = getGrimEquipRect(i, contentX, contentY, contentW);
                if (clickX >= rect.x && clickX <= rect.x + rect.w &&
                    clickY >= rect.y && clickY <= rect.y + rect.h) {
                    unequipItem(EQUIP_SLOTS[i]);
                    return;
                }
            }

            // Check backpack slots — click to equip
            for (let i = 0; i < inventory.maxBackpack; i++) {
                const rect = getGrimBpRect(i, contentX, contentY, contentW);
                if (clickX >= rect.x && clickX <= rect.x + rect.w &&
                    clickY >= rect.y && clickY <= rect.y + rect.h) {
                    if (inventory.backpack[i]) {
                        equipItem(i);
                        return;
                    }
                }
            }

            // Check drop button
            const dropRect = getGrimDropRect(contentX, contentY, contentW, contentH);
            if (clickX >= dropRect.x && clickX <= dropRect.x + dropRect.w &&
                clickY >= dropRect.y && clickY <= dropRect.y + dropRect.h) {
                if (inventory.backpack.length > 0) {
                    dropFromBackpack(inventory.backpack.length - 1);
                }
                return;
            }
        }

        // Key Items tab: click readable items to open journal reader
        if (menuTab === 'keyitems') {
            for (const rect of _keyItemClickRects) {
                if (clickX >= rect.x && clickX <= rect.x + rect.w &&
                    clickY >= rect.y && clickY <= rect.y + rect.h) {
                    menuOpen = false;
                    menuFadeInTimer = 0;
                    openJournalReader(rect.itemId);
                    return;
                }
            }
        }

        return; // consume click while menu is open
    }

    // ----- Ending choice click -----
    if (gamePhase === 'endingChoice' && e.button === 0) {
        if (typeof handleEndingChoiceClick === 'function') {
            handleEndingChoiceClick(mouse.x, mouse.y);
        }
        return;
    }

    // ----- Pre-menu: click anywhere to initialize audio and reveal menu -----
    if (gamePhase === 'preMenu' && e.button === 0) {
        initMusic();
        initSFX();
        playMusic('menu', 2.0);
        menuFadeAlpha = 0; // will fade in during menu phase
        gamePhase = 'menu';
        return;
    }
    // ----- Menu click handling -----
    if (gamePhase === 'menu' && e.button === 0) {
        const btns = getMenuButtons();
        if (pointInButton(mouse.x, mouse.y, btns.start)) {
            // Fade out, then go to name entry
            gamePhase = 'menuFade';
            menuFadeTarget = 'nameEntry';
            return;
        }
        if (pointInButton(mouse.x, mouse.y, btns.loadGame) && !btns.loadGame.disabled) {
            gamePhase = 'menuFade';
            menuFadeTarget = 'loadScreen';
            return;
        }
        if (pointInButton(mouse.x, mouse.y, btns.controls)) {
            gamePhase = 'menuFade';
            menuFadeTarget = 'menuControls';
            return;
        }
        return;
    }
    // Name entry — Enter key is handled in keydown, but clicking anywhere focuses the input
    if (gamePhase === 'nameEntry' && e.button === 0) {
        if (nameInputEl) nameInputEl.focus();
        return;
    }
    // Load screen clicks
    if (gamePhase === 'loadScreen' && e.button === 0) {
        // Check save slot clicks
        const cx = canvasW / 2;
        const cy = canvasH / 2;
        const slotW = 320, slotH = 70, slotGap = 12;
        const startY = cy - 80;
        for (let i = 0; i < 3; i++) {
            const sx = cx - slotW / 2;
            const sy = startY + i * (slotH + slotGap);
            if (clickX >= sx && clickX <= sx + slotW && clickY >= sy && clickY <= sy + slotH) {
                if (saveSlots[i]) {
                    loadGame(i);
                    return;
                }
            }
        }
        // Back button
        const backY = startY + 3 * (slotH + slotGap) + 10;
        const backW = 140, backH = 36;
        const backX = cx - backW / 2;
        if (clickX >= backX && clickX <= backX + backW && clickY >= backY && clickY <= backY + backH) {
            gamePhase = 'menuFade';
            menuFadeTarget = 'menu';
            loadScreenAlpha = 0;
            return;
        }
        return;
    }
    if (gamePhase === 'menuControls' && e.button === 0) {
        const backBtn = getControlsBackButton();
        if (pointInButton(mouse.x, mouse.y, backBtn)) {
            gamePhase = 'menuControlsFade';
            menuFadeTarget = 'menu';
            return;
        }
        return;
    }
    // Death screen click handling
    if (gameDead && deathBtnRect && e.button === 0) {
        if (pointInButton(mouse.x, mouse.y, deathBtnRect)) {
            restartGame();
            return;
        }
        return;
    }

    // Level-up screen click handling (not during death)
    if (xpState.levelUpPending && !gameDead && e.button === 0) {
        const choice = getLevelUpChoice(mouse.x, mouse.y);
        if (choice >= 0 && choice < xpState.levelUpChoices.length) {
            applyUpgrade(xpState.levelUpChoices[choice].id);
        }
        return;
    }

    // Ignore clicks during transitions or non-playing phases
    if (gamePhase !== 'playing') return;

    // Standalone inventory disabled — handled in Grimoire Equipment tab
    // if (inventoryOpen && e.button === 0) {
    //     handleInventoryClick(mouse.x, mouse.y);
    //     return;
    // }

    if (placement.active) {
        if (e.button === 0 && placement.valid) {
            // Start channeling instead of instant placement
            placement.channeling = true;
            placement.channelTimer = 0;
            placement.channelDuration = 0.6;
            placement.channelRow = placement.row;
            placement.channelCol = placement.col;
            placement.active = false;
        } else if (e.button === 0 && !placement.valid) {
            // Invalid placement attempt — provide feedback
            const tile = screenToTile(clickX, clickY);
            const tileR = Math.floor(tile.row);
            const tileC = Math.floor(tile.col);
            const inBounds = tileR >= 0 && tileR < floorMap.length && tileC >= 0 && tileC < floorMap.length;
            const walkable = inBounds && !blocked[tileR][tileC];
            const dr = tile.row - player.row;
            const dc = tile.col - player.col;
            const dist = Math.sqrt(dr * dr + dc * dc);

            let msg = 'Cannot place here';
            if (!walkable) msg = 'Blocked';
            else if (dist > 6) msg = 'Too far';
            else if (player.mana < SUMMON_MANA_COST) msg = 'Not enough mana';

            pickupTexts.push({
                text: msg,
                color: '#cc6644',
                row: player.row, col: player.col,
                offsetY: 0,
                life: 1.5,
            });
        } else if (e.button === 2) {
            placement.active = false;
        }
        return;
    }
    if (e.button === 0) mouse.down = true;
    if (e.button === 2) {
        // Form-specific secondary ability (slime split, skeleton shield, etc.)
        const handler = FormSystem.getHandler();
        if (handler && handler.onSecondaryAbility && FormSystem.currentForm !== 'wizard'
            && gamePhase === 'playing' && !gameDead && !menuOpen && !gamePaused) {
            handler.onSecondaryAbility();
        } else {
            mouse.rightDown = true; // wizard uses rightDown for placement mode
        }
    }
}

function handleMouseUp(e) {
    if (placement.active) return; // swallow releases during placement
    if (e.button === 0) mouse.down = false;
    if (e.button === 2) mouse.rightDown = false;
}

function handleContextMenu(e) {
    e.preventDefault();
}

// Register input listeners only once to prevent duplication on game restart
if (!inputListenersRegistered) {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('contextmenu', handleContextMenu);
    inputListenersRegistered = true;
}

