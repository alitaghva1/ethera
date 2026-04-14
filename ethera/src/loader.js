// ----- ASSET LOADER -----
const failedAssets = [];

function loadImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => {
            console.warn('Failed: ' + src);
            failedAssets.push(src);
            resolve(null);
        };
        img.src = src;
    });
}

function getFailedAssets() {
    return failedAssets;
}

// Make failed assets tracking globally available
window.failedAssets = failedAssets;

async function loadAssets() {
    const promises = [];
    for (const [key, file] of Object.entries(TILE_FILES)) {
        promises.push(loadImage(DUNGEON_PATH + file).then(img => { if (img) images[key] = img; }));
    }
    for (const [key, file] of Object.entries(WIZARD_FILES)) {
        promises.push(loadImage(WIZARD_PATH + file).then(img => { if (img) images['wiz_' + key] = img; }));
    }
    // Load fireball projectile sprite
    promises.push(loadImage(WIZARD_PATH + FIREBALL_FILE).then(img => { if (img) images.fireball = img; }));
    // Load tower sprite
    promises.push(loadImage(TOWER_PATH + TOWER_FILE).then(img => { if (img) images.tower = img; }));
    // Load enemy sprites
    for (const [key, file] of Object.entries(ENEMY_FILES)) {
        promises.push(loadImage(CHAR_PATH + file).then(img => { if (img) images['enemy_' + key] = img; }));
    }
    // Load player form sprites (slime, skeleton)
    for (const [key, file] of Object.entries(SLIME_PLAYER_FILES)) {
        promises.push(loadImage(CHAR_PATH + file).then(img => { if (img) images[key] = img; }));
    }
    for (const [key, file] of Object.entries(SKEL_PLAYER_FILES)) {
        promises.push(loadImage(CHAR_PATH + file).then(img => { if (img) images[key] = img; }));
    }
    // Load lich player sprites (separate path — not from Tiny RPG pack)
    for (const [key, file] of Object.entries(LICH_PLAYER_FILES)) {
        promises.push(loadImage(LICH_CHAR_PATH + file).then(img => { if (img) images[key] = img; }));
    }
    // Load town tiles (ground plates, walls, roofs, props)
    for (const [key, file] of Object.entries(TOWN_TILE_FILES)) {
        promises.push(loadImage(TOWN_PATH + file).then(img => { if (img) images[key] = img; }));
    }
    // Load nature tiles (grass, trees, rocks, bushes)
    for (const [key, file] of Object.entries(NATURE_TILE_FILES)) {
        promises.push(loadImage(NATURE_PATH + file).then(img => { if (img) images[key] = img; }));
    }
    // Load dedicated NPC sprites (GandalfHardcore 64×64 pack — distinct from enemies)
    var NPC_SPRITE_PATH = 'assets/npcs/';
    var NPC_SPRITE_FILES = {
        npc_blacksmith_idle:    'npc_blacksmith_idle.png',    // Garrett the Smith
        npc_nun_idle:           'npc_nun_idle.png',           // Old Mira (elder herbalist)
        npc_crusader_idle:      'npc_crusader_idle.png',      // Captain Aldric (guard)
        npc_mage_idle:          'npc_mage_idle.png',          // The Hermit (mystic sage)
        npc_plaguedoctor_idle:  'npc_plaguedoctor_idle.png',  // Senna the Alchemist
        npc_woundedknight_idle: 'npc_woundedknight_idle.png', // Fading Pilgrim (ghost)
    };
    for (var _nk in NPC_SPRITE_FILES) {
        (function(key, file) {
            promises.push(loadImage(NPC_SPRITE_PATH + file).then(function(img) { if (img) images[key] = img; }));
        })(_nk, NPC_SPRITE_FILES[_nk]);
    }

    // Load NPC dialogue portraits (32×32px Veil of Darkness dark fantasy pixel art)
    const PORTRAIT_FILES = {
        // NPC-specific mappings
        portrait_garrett: 'Merchant.png',           // grizzled forge worker
        portrait_mira: 'Cleric.png',                // warm-faced woman with wimple — matches nun sprite
        portrait_aldric: 'Hooded_Knight.png',        // stern guard captain
        portrait_hermit: 'Wizard.png',               // hooded mystic sage
        portrait_senna: 'Dark_Elf_Girl.png',         // sharp-eyed alchemist researcher
        portrait_pilgrim: 'Vampire.png',             // ghostly hollowed spirit
        portrait_elara: 'Skeleton_2.png',            // pale queen, gaunt, holding on
        // General use / bestiary
        portrait_skeleton: 'Skeleton.png',
        portrait_skeleton_warrior: 'Skeleton_Warrior.png',
        portrait_warrior: 'Warrior.png',
        portrait_knight: 'Knight.png',
        portrait_cleric: 'Cleric.png',
        portrait_old_king: 'old_king.png',
        portrait_young_king: 'young_king.png',
        portrait_barbarian: 'Barbarian.png',
        portrait_thief: 'Thief.png',
        portrait_werewolf: 'Werewolf.png',
        portrait_dragon: 'Dragon.png',
        portrait_goblin: 'Goblin_1.png',
    };
    for (const [key, file] of Object.entries(PORTRAIT_FILES)) {
        promises.push(loadImage('assets/portraits/' + file).then(img => { if (img) images[key] = img; }));
    }
    // Load Kenney Miniature Overworld tiles (256×512px — uses drawTile, same as dungeon)
    for (const [key, file] of Object.entries(OVERWORLD_TILE_FILES)) {
        promises.push(loadImage('assets/overworld/' + file).then(img => { if (img) images[key] = img; }));
    }
    // Load Kenney Miniature Farm tiles
    for (const [key, file] of Object.entries(FARM_TILE_FILES)) {
        promises.push(loadImage('assets/farm/' + file).then(img => { if (img) images[key] = img; }));
    }
    // Load Kenney Miniature Library tiles
    for (const [key, file] of Object.entries(LIBRARY_TILE_FILES)) {
        promises.push(loadImage('assets/library/' + file).then(img => { if (img) images[key] = img; }));
    }
    // Load Hell (Infernus) tiles
    for (const [key, info] of Object.entries(HELL_TILE_FILES)) {
        promises.push(loadImage(info.path + info.file).then(img => { if (img) images[key] = img; }));
    }
    // Load UI border assets
    promises.push(loadImage(UI_BORDER_PATH + 'Panel/panel-003.png').then(img => { if (img) images.ui_panel = img; }));
    promises.push(loadImage(UI_BORDER_PATH + 'Transparent center/panel-transparent-center-003.png').then(img => { if (img) images.ui_frame = img; }));
    promises.push(loadImage(UI_BORDER_PATH + 'Divider/divider-003.png').then(img => { if (img) images.ui_divider = img; }));

    // Load Gold UI bar sprites
    const GOLD_UI_PATH = 'assets/status-ui/2 - Gold/Content/';
    promises.push(loadImage(GOLD_UI_PATH + 'Progress Bars/1.png').then(img => { if (img) images.bar_hp = img; }));
    promises.push(loadImage(GOLD_UI_PATH + 'Progress Bars/7.png').then(img => { if (img) images.bar_mana = img; }));
    promises.push(loadImage(GOLD_UI_PATH + 'Progress Bars/5.png').then(img => { if (img) images.bar_xp = img; }));
    promises.push(loadImage(GOLD_UI_PATH + 'Holders/1.png').then(img => { if (img) images.holder_gold = img; }));
    promises.push(loadImage(GOLD_UI_PATH + 'Holders/10.png').then(img => { if (img) images.holder_dark = img; }));
    promises.push(loadImage(GOLD_UI_PATH + 'Side Tabs/1.png').then(img => { if (img) images.side_tab = img; }));
    promises.push(loadImage(GOLD_UI_PATH + 'Side Tabs/2.png').then(img => { if (img) images.side_tab_active = img; }));
    promises.push(loadImage(GOLD_UI_PATH + 'Buttons/1.png').then(img => { if (img) images.gold_button = img; }));
    // Load additional panel variants for Grimoire
    promises.push(loadImage(UI_BORDER_PATH + 'Panel/panel-005.png').then(img => { if (img) images.ui_panel_alt = img; }));
    promises.push(loadImage(UI_BORDER_PATH + 'Border/panel-border-003.png').then(img => { if (img) images.ui_border = img; }));
    promises.push(loadImage(UI_BORDER_PATH + 'Divider/divider-000.png').then(img => { if (img) images.ui_divider_fancy = img; }));

    // Load UI sprite icons
    for (const [key, file] of Object.entries(UI_SPRITES)) {
        promises.push(loadImage(UI_SPRITE_PATH + file).then(img => { if (img) images['ui_sprite_' + key] = img; }));
    }
    // Load item / equipment sprite icons (Raven Fantasy Icons pack)
    const RAVEN_ICON_PATH = 'assets/raven-icons/Separated Files/64x64/';
    promises.push(loadImage(RAVEN_ICON_PATH + 'fc300.png').then(img => { if (img) images.item_wand = img; }));    // purple-topped wand
    promises.push(loadImage(RAVEN_ICON_PATH + 'fc2101.png').then(img => { if (img) images.item_robe = img; }));   // red hooded wizard robe
    promises.push(loadImage(RAVEN_ICON_PATH + 'fc601.png').then(img => { if (img) images.item_amulet = img; }));  // orange necklace pendant
    promises.push(loadImage(RAVEN_ICON_PATH + 'fc2131.png').then(img => { if (img) images.item_ring = img; }));   // blue sapphire gem ring
    // Load cursor assets
    promises.push(loadImage(CURSOR_PATH + 'tile_0000.png').then(img => { if (img) images.cursor_pointer = img; }));
    promises.push(loadImage(CURSOR_PATH + 'tile_0091.png').then(img => { if (img) images.cursor_crosshair = img; }));

    // ── Load PVGames 2.5D directional sprites ──
    // Wizard (8 dirs × 5 anims = 40 strip images)
    for (const [anim, info] of Object.entries(PV_WIZARD_ANIMS)) {
        for (const dir of DIR8_NAMES) {
            const key = `pv_wizard_${anim}_${dir}`;
            const file = `Wizard/${anim}-${dir}.png`;
            promises.push(loadImage(PV_PATH + file).then(img => { if (img) images[key] = img; }));
        }
    }
    // Lich (same structure, different folder)
    for (const [anim, info] of Object.entries(PV_LICH_ANIMS)) {
        for (const dir of DIR8_NAMES) {
            const key = `pv_lich_${anim}_${dir}`;
            const file = `Lich/${anim}-${dir}.png`;
            promises.push(loadImage(PV_PATH + file).then(img => { if (img) images[key] = img; }));
        }
    }
    // Slime (8 dirs × 2 anims = 16 strip images)
    for (const [anim, info] of Object.entries(PV_SLIME_ANIMS)) {
        for (const dir of DIR8_NAMES) {
            const key = `pv_slime_${anim}_${dir}`;
            const file = `Slime/${anim}-${dir}.png`;
            promises.push(loadImage(PV_PATH + file).then(img => { if (img) images[key] = img; }));
        }
    }
    // Slime shadow reference
    promises.push(loadImage(PV_PATH + 'Slime/shadow.png').then(img => { if (img) images.pv_slime_shadow = img; }));

    await Promise.all(promises);
}

