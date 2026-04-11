// ============================================================
//  ETHERA - Isometric Dungeon RPG
// ============================================================
//
//  Architecture note: This game uses plain <script> tags with shared globals.
//  All top-level const/let/function declarations are intentionally global.
//  When adding new globals, prefix with the module name to avoid collisions
//  (e.g. wave_*, sfx_*, ui_*). A future migration to ES modules is planned.
//
// ============================================================

// Game version — used for save format and cache busting
const ETHERA_VERSION = '0.4.6';

// ----- DEBUG: Set to a zone number (e.g. 4) to skip menu and start there -----
const DEBUG_START_ZONE = null;   // null = normal start, 2 = skeleton, 3 = spire, 4 = hell zone, 5 = frozen abyss, 6 = throne

// ============================================================
//  UI CONSTANTS — extracted from inline magic numbers
// ============================================================
const UI = {
    // Menu buttons
    MENU_BTN_W: 220,
    MENU_BTN_H: 44,
    MENU_BTN_SPACING: 55,       // vertical gap between buttons
    CONTROLS_BTN_W: 180,
    CONTROLS_BTN_H: 40,
    // Save slot layout
    SAVE_SLOT_W: 320,
    SAVE_SLOT_H: 70,
    SAVE_SLOT_GAP: 12,
    // Timing
    MAX_FRAME_DT: 0.1,         // max dt per frame (clamp)
    PREMENU_FADE_SPEED: 1.2,
    MENU_FADE_IN_SPEED: 2.5,
    MENU_FADE_OUT_SPEED: 3.0,
    // Reference resolution
    REF_WIDTH: 1920,
    // Vision flash
    VISION_FLASH_DURATION: 6.0,
    // Ending cinematic
    ENDING_CINEMATIC_DURATION: 14.0,
};

// ============================================================
//  COLOR PALETTE — centralized color constants
// ============================================================
const COLORS = {
    // Enemy tints (also used for death burst VFX)
    SLIME_TINT: '#88dd44',
    SKELETON_TINT: '#ffaa88',
    ARCHER_TINT: '#ff8888',
    ARMORED_TINT: '#aaaacc',
    WEREWOLF_TINT: '#cc4444',
    SLIME_KING_TINT: '#66cc22',
    BONE_COLOSSUS_TINT: '#bbaa88',
    INFERNAL_KNIGHT_TINT: '#ff4422',
    FROST_WYRM_TINT: '#44aaff',
    RUINED_KING_TINT: '#9944dd',
    // Elite modifier tints
    ELITE_SHIELDED_TINT: '#4488ff',
    ELITE_THORNED_TINT: '#ff4444',
    ELITE_FRENZY_TINT: '#ff2200',
    ELITE_NECRO_TINT: '#44ff44',
    // New enemy tints
    FIRE_SLIME_TINT: '#ff6622',
    FROST_ARCHER_TINT: '#88ccff',
    SHADOW_KNIGHT_TINT: '#442266',
    BONE_MAGE_TINT: '#ccaa44',
    PIT_LURKER_TINT: '#664422',
    // UI
    BORDER_GOLD: '#d4b478',
    BORDER_DARK: '#2a1a0e',
    TEXT_WARM: '#e8d8b0',
    TEXT_DIM: '#a09070',
    TEXT_HINT: '#aabbff',
    DAMAGE_RED: '#ff6644',
    DAMAGE_CRIT: '#ffd700',     // gold — critical hit numbers
    HEAL_GREEN: '#88cc88',
    MANA_BLUE: '#88ccff',
    // Vision / cinematic
    VISION_PURPLE: 'rgba(160, 80, 255, 0.6)',
    VISION_DARK: '#0a0510',
    VISION_TEXT: '#cc99ff',
    // Menu
    MENU_BG_CENTER: '#0d0906',
    MENU_BG_MID: '#080504',
    MENU_BG_EDGE: '#030202',
};

// ----- CONFIGURATION -----
let TILE_SCALE = 0.45;
let TILE_IMG_W = 256;
let TILE_IMG_H = 512;
let TILE_W = Math.round(TILE_IMG_W * TILE_SCALE);
let TILE_H = Math.round(TILE_IMG_H * TILE_SCALE);
let DIAMOND_W = Math.round(256 * TILE_SCALE);
let DIAMOND_H = Math.round(128 * TILE_SCALE);
let HALF_DW = DIAMOND_W / 2;
let HALF_DH = DIAMOND_H / 2;

const WIZARD_FRAME_W = 100;
const WIZARD_FRAME_H = 100;
const WIZARD_SCALE = 1.3;
let MAP_SIZE = 24;

// ── PVGames 2.5D Sprite System ──────────────────────────────────────
const PV_WIZARD_FW = 160;
const PV_WIZARD_FH = 200;
const PV_WIZARD_SCALE = 0.55;   // 160*0.55 ≈ 88px wide — close to old 100*1.3=130 but taller/leaner
const PV_SLIME_FW = 150;
const PV_SLIME_FH = 150;
const PV_SLIME_SCALE = 0.65;
const PV_LICH_FW = 160;         // necromancer creativekind sheet
const PV_LICH_FH = 128;
const PV_LICH_SCALE = 1.50;     // small pixel-art character needs high scale to match wizard

// 8-direction labels matching PVGames sheet row order
const DIR8_NAMES = ['S', 'SW', 'W', 'NW', 'N', 'NE', 'E', 'SE'];

// PVGames sprite registry — loaded as images.pv_{form}_{anim}_{dir}
const PV_PATH = 'assets/characters/PVGames/';
const PV_WIZARD_ANIMS = {
    idle:   { frames: 8 },
    walk:   { frames: 8 },
    attack: { frames: 10 },
    death:  { frames: 10 },
    hurt:   { frames: 4 },
};
const PV_LICH_ANIMS = {  // necromancer creativekind sprite
    idle:   { frames: 8 },
    walk:   { frames: 8 },
    attack: { frames: 13 },
    death:  { frames: 9 },
    hurt:   { frames: 5 },
};
const PV_SLIME_ANIMS = {
    idle:   { frames: 10 },
    walk:   { frames: 10 },
};

// ============================================================
//  ZONE CONFIGURATION REGISTRY
// ============================================================
// Shared tile defaults — all zones use these unless overridden
const ZONE_TILE_DEFAULTS = {
    tileImgW: 256, tileImgH: 512, diamondW: 256, diamondH: 128,
    tileScale: 0.45, lighting: 'torch', hasWaves: true, isTown: false,
};

const ZONE_CONFIGS = {
    1: { ...ZONE_TILE_DEFAULTS, name: 'The Undercroft', mapSize: 34 },
    2: { ...ZONE_TILE_DEFAULTS, name: 'Ruined Tower', mapSize: 34 },
    3: { ...ZONE_TILE_DEFAULTS, name: 'The Spire', mapSize: 30 },
    0: { ...ZONE_TILE_DEFAULTS, name: 'The Hamlet', mapSize: 30, lighting: 'outdoor', hasWaves: false, isTown: true },
    4: { ...ZONE_TILE_DEFAULTS, name: 'The Inferno', mapSize: 32, isHell: true },
    5: { ...ZONE_TILE_DEFAULTS, name: 'The Frozen Abyss', mapSize: 34, isHell: true, isFrozen: true },
    6: { ...ZONE_TILE_DEFAULTS, name: 'Throne of Ruin', mapSize: 36, isHell: true, isFinalZone: true },
};

// Dynamic config for procedural zones (100+)
function getProceduralZoneConfig(zoneNum) {
    const depth = zoneNum - 99;
    const ms = Math.min(36, 28 + depth * 2);
    const isHellDepth = depth >= 5;
    return {
        ...ZONE_TILE_DEFAULTS,
        name: 'Depth ' + depth,
        mapSize: ms,
        hasWaves: true,
        isHell: isHellDepth,
        isFrozen: depth >= 7 && depth <= 8,
        isProcedural: true,
    };
}

function applyZoneTileConfig(zoneNumber) {
    const cfg = ZONE_CONFIGS[zoneNumber] || (zoneNumber >= 100 ? getProceduralZoneConfig(zoneNumber) : ZONE_CONFIGS[1]);
    TILE_SCALE = cfg.tileScale;
    TILE_IMG_W = cfg.tileImgW;
    TILE_IMG_H = cfg.tileImgH;
    TILE_W = Math.round(TILE_IMG_W * TILE_SCALE);
    TILE_H = Math.round(TILE_IMG_H * TILE_SCALE);
    DIAMOND_W = Math.round(cfg.diamondW * TILE_SCALE);
    DIAMOND_H = Math.round(cfg.diamondH * TILE_SCALE);
    HALF_DW = DIAMOND_W / 2;
    HALF_DH = DIAMOND_H / 2;
    MAP_SIZE = cfg.mapSize;

    // Precompute nature tile draw dimensions so their 180×115 diamond
    // aligns with the current grid spacing
    const natScale = DIAMOND_W / NATURE_DIAMOND_W;   // e.g. 115/180 ≈ 0.639
    NATURE_DRAW_W = Math.round(NATURE_IMG_W * natScale);
    NATURE_DRAW_H = Math.round(NATURE_IMG_H * natScale);
}

// Zone tracking
let currentZone = 1;

// ============================================================
//  PERFORMANCE QUALITY TOGGLE
// ============================================================
// Two presets: 'high' (default, all effects) and 'low' (reduced VFX for
// slower hardware). Toggle via setQuality('low') / setQuality('high').
// Individual systems read GFX.* multipliers rather than hardcoding counts.
const GFX = {
    quality: 'high',
    // Multiplier for particle spawn counts (1.0 = full, 0.4 = 40%)
    particleMul: 1.0,
    // Whether to render tile edge shadows (radial gradient per edge)
    tileEdgeShadows: true,
    // Whether to render rough floor dust/detail hints
    roughFloorHints: true,
    // Whether to render tower glow vortex particles
    towerGlowParticles: true,
    // Max active particles (hard cap)
    maxParticles: 200,
    // Whether to use screen-blend composite ops (expensive on some GPUs)
    screenBlend: true,
};

function setQuality(level) {
    GFX.quality = level;
    if (level === 'low') {
        GFX.particleMul = 0.4;
        GFX.tileEdgeShadows = false;
        GFX.roughFloorHints = false;
        GFX.towerGlowParticles = false;
        GFX.maxParticles = 80;
        GFX.screenBlend = false;
    } else {
        GFX.particleMul = 1.0;
        GFX.tileEdgeShadows = true;
        GFX.roughFloorHints = true;
        GFX.towerGlowParticles = true;
        GFX.maxParticles = 200;
        GFX.screenBlend = true;
    }
}

// ============================================================
//  GAME SETTINGS — persisted to localStorage
// ============================================================
const gameSettings = {
    musicVolume: 0.6,
    sfxVolume: 0.35,
    quality: 'high',
    screenShake: true,
    fullscreen: false,
    colorblindMode: 'off',  // 'off', 'deuteranopia', 'protanopia', 'symbols'
    textScale: 1.0,         // 0.85, 1.0, 1.15, 1.3
    pauseOnBlur: true,
};

let optionsReturnPhase = 'menu';

function saveSettings() {
    try { localStorage.setItem('ethera_settings', JSON.stringify(gameSettings)); } catch(e) {}
}

function loadSettings() {
    try {
        const s = JSON.parse(localStorage.getItem('ethera_settings'));
        if (s) Object.assign(gameSettings, s);
    } catch(e) {}
    applySettings();
}

function applySettings() {
    if (typeof music !== 'undefined') music.masterVolume = gameSettings.musicVolume;
    if (typeof sfxVolume !== 'undefined') {
        sfxVolume = gameSettings.sfxVolume;
        if (typeof sfxMasterGain !== 'undefined' && sfxMasterGain) {
            sfxMasterGain.gain.value = sfxVolume;
        }
    }
    setQuality(gameSettings.quality);
    if (gameSettings.fullscreen && !document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(function() {});
    } else if (!gameSettings.fullscreen && document.fullscreenElement) {
        document.exitFullscreen().catch(function() {});
    }
}

document.addEventListener('fullscreenchange', function() {
    gameSettings.fullscreen = !!document.fullscreenElement;
    saveSettings();
});

// Pause on blur — stop gameplay when window loses focus
document.addEventListener('visibilitychange', function() {
    if (document.hidden && gameSettings.pauseOnBlur && typeof gamePhase !== 'undefined' && gamePhase === 'playing' && !gameDead) {
        gamePaused = true;
    }
});
window.addEventListener('blur', function() {
    if (gameSettings.pauseOnBlur && typeof gamePhase !== 'undefined' && gamePhase === 'playing' && !gameDead) {
        gamePaused = true;
    }
});

// Rarity symbol indicators for colorblind accessibility
const RARITY_SYMBOLS = {
    common:    { symbol: '\u25C7', name: 'Common' },     // ◇
    uncommon:  { symbol: '\u2726', name: 'Uncommon' },    // ✦
    rare:      { symbol: '\u2605', name: 'Rare' },        // ★
    epic:      { symbol: '\u2727', name: 'Epic' },        // ✧
    legendary: { symbol: '\u2666', name: 'Legendary' },   // ◆
};

// Scaled font helper — respects textScale setting
function scaledFont(basePx, family) {
    const px = Math.round(basePx * (gameSettings.textScale || 1.0));
    return px + 'px ' + (family || 'Georgia');
}

// Auto-scale all canvas font assignments when textScale != 1.0
// Patches the ctx.font setter so every `ctx.font = '12px Georgia'` auto-scales.
function installFontScaling(ctx) {
    const _origFontDesc = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, 'font');
    if (!_origFontDesc || !_origFontDesc.set) return; // safety
    Object.defineProperty(ctx, 'font', {
        get: function() { return _origFontDesc.get.call(this); },
        set: function(val) {
            const scale = gameSettings.textScale || 1.0;
            if (scale !== 1.0) {
                // Parse font string and scale pixel sizes
                val = val.replace(/(\d+(?:\.\d+)?)px/g, function(match, num) {
                    return Math.round(parseFloat(num) * scale) + 'px';
                });
            }
            _origFontDesc.set.call(this, val);
        },
        configurable: true,
    });
}

// ============================================================
//  SEEDED PRNG — for map variation across playthroughs
// ============================================================
// Uses mulberry32 — fast, good distribution, deterministic from seed.
// Call seedMapRNG(seed) at game start, then use mapRandom() instead
// of Math.random() in map generators for reproducible variety.
let _mapSeed = 0;
let _mapRngState = 0;

function seedMapRNG(seed) {
    _mapSeed = seed | 0;
    _mapRngState = _mapSeed;
}

// Returns a float in [0, 1) deterministically from the current seed state
function mapRandom() {
    _mapRngState = (_mapRngState + 0x6D2B79F5) | 0;
    let t = Math.imul(_mapRngState ^ (_mapRngState >>> 15), 1 | _mapRngState);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// Seeded integer in [min, max] inclusive
function mapRandomInt(min, max) {
    return min + Math.floor(mapRandom() * (max - min + 1));
}

// Shuffle an array in-place using the seeded PRNG
function mapShuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(mapRandom() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// Player name
let playerName = 'Wizard';

// Save/Load system — 3 slots stored in localStorage
const SAVE_KEY_PREFIX = 'ethera_save_';
let saveSlots = [null, null, null]; // loaded from localStorage on init

// ----- MOVEMENT PHYSICS -----
// COORDINATE CONVENTION:
//   player.vx = row velocity (tile-space), player.vy = col velocity (tile-space)
//   These are NOT screen-space. Screen mapping is:
//     screenX = (col - row) * HALF_DW
//     screenY = (col + row) * HALF_DH
//   Named vx/vy for historical reasons; treat as vRow/vCol mentally.
//   Enemy velocity uses vr/vc (correct naming). Projectiles use vr/vc too.
const MOVE_ACCEL = 20;       // tiles/sec^2 — snappy response
const MOVE_MAX_SPEED = 4.2;  // tiles/sec
const MOVE_DECEL = 18;       // tiles/sec^2 — tight stop, no ice skating
const HITBOX_RADIUS = 0.18;  // collision radius — small so walls don't feel sticky

// ----- PHASE JUMP (dodge) -----
const DODGE_DISTANCE = 2.8;  // tiles — how far the phase jump carries you
const DODGE_DURATION = 0.18; // seconds — duration of the dash
const DODGE_COOLDOWN = 0.85;  // seconds — time before you can dodge again
const DODGE_GHOST_COUNT = 5; // number of afterimage ghosts
const DODGE_GHOST_LIFE = 0.4; // seconds — how long ghosts linger

// ----- ASSET PATHS -----
const DUNGEON_PATH = 'assets/dungeon/Isometric/';
const WIZARD_PATH = 'assets/characters/' +
    'Tiny RPG Character Asset Pack v1.03 -Full 20 Characters/Characters(100x100)/Wizard/';

// Town / Nature asset paths (real copies under assets/)
const TOWN_PATH = 'assets/town-tiles/PNG/';
const NATURE_PATH = 'assets/nature-tiles/PNG/';

// ----- TOWN TILE REGISTRY (210×244 images, 180×115 diamond) -----
const TOWN_TILE_FILES = {
    // Ground plates
    t_pavement:      'plate_pavement_01_0.png',
    t_road:          'plate_road_01_0.png',
    t_sidewalk:      'plate_sidewalk_01_0.png',
    t_woodFloor:     'plate_wood_01_0.png',
    t_corner:        'plate_corner_01_0.png',
    t_curve:         'plate_curve_01_0.png',
    // Grey stone walls
    t_wall:          'grey_wall_01_0.png',
    t_arch:          'grey_arch_01_0.png',
    t_corner_wall:   'grey_corner_01_0.png',
    t_doorRound:     'grey_door_round_01_0.png',
    t_doorSquare:    'grey_door_square_01_0.png',
    t_windowRound:   'grey_window_round_01_0.png',
    t_windowSquare:  'grey_window_square_01_0.png',
    t_windowNarrow:  'grey_window_narrow_01_0.png',
    t_brokenWall:    'grey_broken_wall_01_0.png',
    t_borderWall:    'grey_border_wall_01_0.png',
    t_shortWall:     'grey_short_wall_01_0.png',
    t_smallWall:     'grey_small_wall_01_0.png',
    t_triangle:      'grey_triangle_01_0.png',
    t_pole:          'grey_pole_01_0.png',
    // Wood walls
    t_woodWall:      'wood_wall_01_0.png',
    t_woodArch:      'wood_arch_01_0.png',
    t_woodCorner:    'wood_corner_01_0.png',
    t_woodDoor:      'wood_door_01_0.png',
    t_woodDoorRound: 'wood_door_round_01_0.png',
    t_woodWindow:    'wood_window_round_01_0.png',
    t_woodSmallWall: 'wood_small_wall_01_0.png',
    t_woodRailing:   'wood_railing_01_0.png',
    t_woodBorderWall:'wood_border_wall_01_0.png',
    t_woodBroken:    'wood_broken_wall_01_0.png',
    t_woodCross:     'wood_wall_cross_01_0.png',
    // Roofs
    t_roofRed:       'roof_straight_red_01_0.png',
    t_roofRedCorner: 'roof_corner_red_01_0.png',
    t_roofRedSlant:  'roof_slant_red_01_0.png',
    t_roofRedPoint:  'roof_point_red_01_0.png',
    t_roofGreen:     'roof_straight_green_01_0.png',
    t_roofGreenCorner:'roof_corner_green_01_0.png',
    t_roofGreenSlant:'roof_slant_green_01_0.png',
    // Decoration / props
    t_tree:          'tree_01_0.png',
    t_lightpost:     'lightpost_01_0.png',
    t_banner:        'banner_01_0.png',
    t_shieldGreen:   'shield_green_01_0.png',
    t_shieldRed:     'shield_red_01_0.png',
    t_ironDoor:      'iron_door_01_0.png',
    t_stairsStone:   'stairs_stone_01_0.png',
    t_stairsWood:    'stairs_wood_01_0.png',
    t_castleWall:    'castle_wall_01_0.png',
};

// ----- NATURE TILE REGISTRY (220×379 images, 180×115 diamond) -----
// Nature tiles are TALLER than town tiles — rendered with drawTownObj()
const NATURE_TILE_FILES = {
    // Ground tiles
    n_grass:         'naturePack_001_0.png',   // flat grass
    n_grassEdge:     'naturePack_003_0.png',   // grass with dirt edge
    n_grassBush:     'naturePack_058_0.png',   // grass with bush corners
    n_grassFlowers:  'naturePack_004_0.png',   // grass with flowers
    n_dirt:          'naturePack_009_0.png',    // dirt path
    n_water:         'naturePack_014_0.png',   // water tile
    n_sand:          'naturePack_012_0.png',   // sand
    // Trees (tall objects)
    n_treeBush:      'naturePack_130_0.png',   // round bush tree
    n_treeOak:       'naturePack_131_0.png',   // tall oak
    n_treePine:      'naturePack_132_0.png',   // pine tree
    n_treeThin:      'naturePack_133_0.png',   // thin tree
    // Rocks
    n_rock:          'naturePack_044_0.png',   // small rock
    n_rockLarge:     'naturePack_043_0.png',   // larger rock
    // Bushes / flowers
    n_bush:          'naturePack_068_0.png',   // small bush
    n_flowers:       'naturePack_066_0.png',   // flower patch
    // Fences / structures
    n_fenceWood:     'naturePack_081_0.png',   // wood fence
    n_log:           'naturePack_097_0.png',   // fallen log
    n_stump:         'naturePack_098_0.png',   // tree stump
};

// Nature tiles have different image dimensions (220×379) but share the same
// 180×115 diamond footprint as town tiles.  We precompute their draw size so
// their diamonds align with the grid.
const NATURE_IMG_W = 220;
const NATURE_IMG_H = 379;
const NATURE_DIAMOND_W = 180;   // same as town diamond
let NATURE_DRAW_W = 0;          // set by applyZoneTileConfig
let NATURE_DRAW_H = 0;

// ----- HELL (INFERNUS) TILE REGISTRY -----
// PVGames Infernus Free tileset — 2.5D isometric, 64px diamond base
const HELL_PATH = 'assets/PVGames_Infernus_Free/Infernus_Tiles/';
const HELL_BUILD1 = HELL_PATH + 'Building_Infernus_1/';
const HELL_BUILD2 = HELL_PATH + 'Building_Infernus_2/';
const HELL_DIAMOND_W = 64; // base diamond width for scaling

const HELL_TILE_FILES = {
    // === FLOORS (Building Set 1) — 64×64 / 64×96 ===
    h_floor1:       { path: HELL_BUILD1, file: 'Floor_Lower_1.png' },
    h_floor2:       { path: HELL_BUILD1, file: 'Floor_Lower_2.png' },
    h_floor3:       { path: HELL_BUILD1, file: 'Floor_Lower_3.png' },
    h_floorUp1:     { path: HELL_BUILD1, file: 'Floor_Upper_1.png' },
    h_floorUp2:     { path: HELL_BUILD1, file: 'Floor_Upper_2.png' },
    h_floorUp3:     { path: HELL_BUILD1, file: 'Floor_Upper_3.png' },
    // Floors (Building Set 2 — darker variant)
    h_floor2_1:     { path: HELL_BUILD2, file: 'Floor_Lower_1.png' },
    h_floor2_2:     { path: HELL_BUILD2, file: 'Floor_Lower_2.png' },
    h_floor2_3:     { path: HELL_BUILD2, file: 'Floor_Lower_3.png' },
    h_floorUp2_1:   { path: HELL_BUILD2, file: 'Floor_Upper_1.png' },
    h_floorUp2_2:   { path: HELL_BUILD2, file: 'Floor_Upper_2.png' },
    // Floor decals (128×128 overlay)
    h_floorDecal:   { path: HELL_PATH, file: 'Infernus_FloorDecal.png' },
    // === WALLS — Large (64×160) ===
    h_wallL1:       { path: HELL_BUILD1, file: 'Wall_Large_1.png' },
    h_wallL2:       { path: HELL_BUILD1, file: 'Wall_Large_2.png' },
    h_wallL3:       { path: HELL_BUILD1, file: 'Wall_Large_3.png' },
    h_wallL4:       { path: HELL_BUILD1, file: 'Wall_Large_4.png' },
    h_wallL5:       { path: HELL_BUILD1, file: 'Wall_Large_5.png' },
    // Walls — Medium (64×128)
    h_wallM1:       { path: HELL_BUILD1, file: 'Wall_Medium_1.png' },
    h_wallM2:       { path: HELL_BUILD1, file: 'Wall_Medium_2.png' },
    h_wallM3:       { path: HELL_BUILD1, file: 'Wall_Medium_3.png' },
    h_wallM4:       { path: HELL_BUILD1, file: 'Wall_Medium_4.png' },
    // Walls — Small (64×96)
    h_wallS1:       { path: HELL_BUILD1, file: 'Wall_Small_1.png' },
    h_wallS2:       { path: HELL_BUILD1, file: 'Wall_Small_2.png' },
    h_wallS3:       { path: HELL_BUILD1, file: 'Wall_Small_3.png' },
    // Wall Front (facing camera)
    h_wallFrontL1:  { path: HELL_BUILD1, file: 'Wall_Front_Large_1.png' },
    h_wallFrontL2:  { path: HELL_BUILD1, file: 'Wall_Front_Large_2.png' },
    h_wallFrontM1:  { path: HELL_BUILD1, file: 'Wall_Front_Medium_1.png' },
    h_wallFrontS1:  { path: HELL_BUILD1, file: 'Wall_Front_Small_1.png' },
    // Wall Side (perpendicular walls)
    h_wallSide1:    { path: HELL_BUILD1, file: 'Wall_Side_1.png' },
    h_wallSide2:    { path: HELL_BUILD1, file: 'Wall_Side_2.png' },
    h_wallSide3:    { path: HELL_BUILD1, file: 'Wall_Side_3.png' },
    // Building Set 2 walls (alternate skin — redder)
    h_wall2L1:      { path: HELL_BUILD2, file: 'Wall_Large_1.png' },
    h_wall2L2:      { path: HELL_BUILD2, file: 'Wall_Large_2.png' },
    h_wall2L3:      { path: HELL_BUILD2, file: 'Wall_Large_3.png' },
    h_wall2M1:      { path: HELL_BUILD2, file: 'Wall_Medium_1.png' },
    h_wall2M2:      { path: HELL_BUILD2, file: 'Wall_Medium_2.png' },
    h_wall2S1:      { path: HELL_BUILD2, file: 'Wall_Small_1.png' },
    // Archways (64×160)
    h_arch1:        { path: HELL_BUILD1, file: 'Archway_1.png' },
    h_arch2:        { path: HELL_BUILD1, file: 'Archway_2.png' },
    h_arch3:        { path: HELL_BUILD1, file: 'Archway_3.png' },
    h_arch4:        { path: HELL_BUILD1, file: 'Archway_4.png' },
    h_arch5:        { path: HELL_BUILD1, file: 'Archway_5.png' },
    // Columns (64×96)
    h_col1:         { path: HELL_BUILD1, file: 'Column_1.png' },
    h_col2:         { path: HELL_BUILD1, file: 'Column_2.png' },
    h_col3:         { path: HELL_BUILD1, file: 'Column_3.png' },
    h_col4:         { path: HELL_BUILD1, file: 'Column_4.png' },
    h_col5:         { path: HELL_BUILD1, file: 'Column_5.png' },
    h_col6:         { path: HELL_BUILD1, file: 'Column_6.png' },
    // Stairs (64×96)
    h_stairs1:      { path: HELL_BUILD1, file: 'Stairs_1.png' },
    h_stairs2:      { path: HELL_BUILD1, file: 'Stairs_2.png' },
    h_stairs3:      { path: HELL_BUILD1, file: 'Stairs_3.png' },
    h_stairs4:      { path: HELL_BUILD1, file: 'Stairs_4.png' },
    // Pillars & Buttresses
    h_pillar1:      { path: HELL_BUILD1, file: 'Pillar_1.png' },
    h_pillar2:      { path: HELL_BUILD1, file: 'Pillar_2.png' },
    h_buttress1:    { path: HELL_BUILD1, file: 'Buttress_1.png' },
    h_buttress2:    { path: HELL_BUILD1, file: 'Buttress_2.png' },
    h_buttress3:    { path: HELL_BUILD1, file: 'Buttress_3.png' },
    // Ramps
    h_ramp1:        { path: HELL_BUILD1, file: 'Ramp_1.png' },
    h_ramp2:        { path: HELL_BUILD1, file: 'Ramp_2.png' },
    // Adornments
    h_adorn1:       { path: HELL_BUILD1, file: 'Adorn_1.png' },
    h_adorn2:       { path: HELL_BUILD1, file: 'Adorn_2.png' },
    // === HELLSCAPE ENVIRONMENTAL — the dramatic centrepieces ===
    // Broken Giant statue (544×512) — colossal
    h_brokenGiant1: { path: HELL_PATH, file: 'Infernus_Hellscape_BrokenGiant_1.png' },
    h_brokenGiant2: { path: HELL_PATH, file: 'Infernus_Hellscape_BrokenGiant_2.png' },
    // Severed stone hands (192×160)
    h_brokenHand1:  { path: HELL_PATH, file: 'Infernus_Hellscape_BrokenHand1_1.png' },
    h_brokenHand2:  { path: HELL_PATH, file: 'Infernus_Hellscape_BrokenHand2_1.png' },
    // Shattered colossal heads (224×288)
    h_brokenHead1:  { path: HELL_PATH, file: 'Infernus_Hellscape_BrokenHead_1.png' },
    h_brokenHead2:  { path: HELL_PATH, file: 'Infernus_Hellscape_BrokenHead2_1.png' },
    // Cliffs (320×384, 160×224)
    h_cliff1:       { path: HELL_PATH, file: 'Infernus_Hellscape_Cliff1_1.png' },
    h_cliff2:       { path: HELL_PATH, file: 'Infernus_Hellscape_Cliff2_1.png' },
    h_cliff3:       { path: HELL_PATH, file: 'Infernus_Hellscape_Cliff3_1.png' },
    // Stone spires (256×352)
    h_spire1:       { path: HELL_PATH, file: 'Infernus_Hellscape_StoneSpire_1.png' },
    h_spire2:       { path: HELL_PATH, file: 'Infernus_Hellscape_StoneSpire_2.png' },
    // Hellscape columns (576×608)
    h_hsColumns1:   { path: HELL_PATH, file: 'Infernus_Hellscape_Columns_1.png' },
    // Rubble & debris (64×64)
    h_rubble1:      { path: HELL_PATH, file: 'Infernus_Hellscape_Rubble1_1.png' },
    h_rubble2:      { path: HELL_PATH, file: 'Infernus_Hellscape_Rubble1_2.png' },
    h_rubble3:      { path: HELL_PATH, file: 'Infernus_Hellscape_Rubble1_3.png' },
    h_rubble4:      { path: HELL_PATH, file: 'Infernus_Hellscape_Rubble2_1.png' },
    h_rubble5:      { path: HELL_PATH, file: 'Infernus_Hellscape_Rubble3_1.png' },
    // Piles (224×224)
    h_pile1:        { path: HELL_PATH, file: 'Infernus_Hellscape_Pile1_1.png' },
    h_pile2:        { path: HELL_PATH, file: 'Infernus_Hellscape_Pile2_1.png' },
    // Rocks (32×32)
    h_rock1:        { path: HELL_PATH, file: 'Infernus_Hellscape_Rock_1.png' },
    h_rock2:        { path: HELL_PATH, file: 'Infernus_Hellscape_Rock_2.png' },
    h_rock3:        { path: HELL_PATH, file: 'Infernus_Hellscape_Rock_3.png' },
    // === DRAGON BONES — massive skeletal set pieces ===
    h_dragonBones1: { path: HELL_PATH, file: 'Infernus_DragonBones1_1.png' },
    h_dragonBones2: { path: HELL_PATH, file: 'Infernus_DragonBones2_1.png' },
    // === HANGING CORPSES — wall-mounted horror ===
    h_hangCorpse1:  { path: HELL_PATH, file: 'Infernus_HangingCorpse1_1.png' },
    h_hangCorpse2:  { path: HELL_PATH, file: 'Infernus_HangingCorpse1_2.png' },
    h_hangCorpse3:  { path: HELL_PATH, file: 'Infernus_HangingCorpse2_1.png' },
    h_hangCorpse4:  { path: HELL_PATH, file: 'Infernus_HangingCorpse2_2.png' },
    // === WALL-MOUNTED WEAPONS & SHIELDS ===
    h_wallSword1:   { path: HELL_PATH, file: 'Infernus_WallSword_1.png' },
    h_wallSword2:   { path: HELL_PATH, file: 'Infernus_WallSword_2.png' },
    h_wallSpear1:   { path: HELL_PATH, file: 'Infernus_WallSpear_1.png' },
    h_wallSpear2:   { path: HELL_PATH, file: 'Infernus_WallSpear_2.png' },
    h_wallShield1:  { path: HELL_PATH, file: 'Infernus_WallShield_1.png' },
    h_wallShield2:  { path: HELL_PATH, file: 'Infernus_WallShield_2.png' },
    // === LARGE DECORATIVE ===
    h_decor1:       { path: HELL_PATH, file: 'Infernus_Decor1_1.png' },
    h_decor2:       { path: HELL_PATH, file: 'Infernus_Decor2_1.png' },
    h_decor3:       { path: HELL_PATH, file: 'Infernus_Decor2_2.png' },
    // === ALTARS & RITUAL ===
    h_altar1:       { path: HELL_PATH, file: 'Infernus_Altar_1.png' },
    h_altar2:       { path: HELL_PATH, file: 'Infernus_Altar_2.png' },
    h_altar3:       { path: HELL_PATH, file: 'Infernus_Altar_3.png' },
    h_altarSm1:     { path: HELL_PATH, file: 'Infernus_Altar1_1.png' },
    h_altarSm2:     { path: HELL_PATH, file: 'Infernus_Altar1_2.png' },
    h_pentagram:    { path: HELL_PATH, file: 'Infernus_PentagramFloor.png' },
    h_pentaWall1:   { path: HELL_PATH, file: 'Infernus_PentagramWall_1.png' },
    h_pentaWall2:   { path: HELL_PATH, file: 'Infernus_PentagramWall_2.png' },
    // === BONES & GORE ===
    h_bones1:       { path: HELL_PATH, file: 'Infernus_Bones1_1.png' },
    h_bones2:       { path: HELL_PATH, file: 'Infernus_Bones1_2.png' },
    h_bones3:       { path: HELL_PATH, file: 'Infernus_Bones1_3.png' },
    h_bones4:       { path: HELL_PATH, file: 'Infernus_Bones1_4.png' },
    h_skull1:       { path: HELL_PATH, file: 'Infernus_Skull1_1.png' },
    h_skull2:       { path: HELL_PATH, file: 'Infernus_Skull2_1.png' },
    h_skull3:       { path: HELL_PATH, file: 'Infernus_Skull3_1.png' },
    h_skull4:       { path: HELL_PATH, file: 'Infernus_Skull4_1.png' },
    h_skull5:       { path: HELL_PATH, file: 'Infernus_Skull5_1.png' },
    h_gore1:        { path: HELL_PATH, file: 'Infernus_GorePile_1.png' },
    h_gore2:        { path: HELL_PATH, file: 'Infernus_GorePile_2.png' },
    // === LIGHTING ===
    h_candelabra1:  { path: HELL_PATH, file: 'Infernus_Candelabra_1.png' },
    h_candelabra2:  { path: HELL_PATH, file: 'Infernus_Candelabra_2.png' },
    h_candelabra3:  { path: HELL_PATH, file: 'Infernus_Candelabra_3.png' },
    h_wallCandle1:  { path: HELL_PATH, file: 'Infernus_WallCandles_1.png' },
    h_wallCandle2:  { path: HELL_PATH, file: 'Infernus_WallCandles_2.png' },
    h_wallLantern1: { path: HELL_PATH, file: 'Infernus_WallLantern_1.png' },
    h_wallLantern2: { path: HELL_PATH, file: 'Infernus_WallLantern_2.png' },
    h_burnerCol1:   { path: HELL_PATH, file: 'Infernus_BurnerColumn_1.png' },
    h_burnerCol2:   { path: HELL_PATH, file: 'Infernus_BurnerColumn_2.png' },
    // === CAGES & PRISONS ===
    h_cage1:        { path: HELL_PATH, file: 'Infernus_Cage_1.png' },
    h_cage2:        { path: HELL_PATH, file: 'Infernus_Cage_2.png' },
    h_cageCart1:    { path: HELL_PATH, file: 'Infernus_CageCart_1.png' },
    h_cageCart2:    { path: HELL_PATH, file: 'Infernus_CageCart_2.png' },
    // === FURNITURE & FIXTURES ===
    h_throne1:      { path: HELL_PATH, file: 'Infernus_Throne_1.png' },
    h_throne2:      { path: HELL_PATH, file: 'Infernus_Throne_2.png' },
    h_stand1:       { path: HELL_PATH, file: 'Infernus_Stand_1.png' },
    h_stand2:       { path: HELL_PATH, file: 'Infernus_Stand_2.png' },
    h_lectern1:     { path: HELL_PATH, file: 'Infernus_Lectern1_1.png' },
    h_lectern2:     { path: HELL_PATH, file: 'Infernus_Lectern1_2.png' },
    h_reliquary1:   { path: HELL_PATH, file: 'Infernus_Reliquary_1.png' },
    h_shelf1:       { path: HELL_PATH, file: 'Infernus_Shelf_1.png' },
    h_shelf2:       { path: HELL_PATH, file: 'Infernus_Shelf_2.png' },
    h_column:       { path: HELL_PATH, file: 'Infernus_Column.png' },
    // === GRAVES ===
    h_grave1:       { path: HELL_PATH, file: 'Infernus_Grave1_1.png' },
    h_grave2:       { path: HELL_PATH, file: 'Infernus_Grave1_2.png' },
    h_grave3:       { path: HELL_PATH, file: 'Infernus_Grave3_1.png' },
    h_grave4:       { path: HELL_PATH, file: 'Infernus_Grave3_2.png' },
    // === MISC SMALL PROPS ===
    h_box1:         { path: HELL_PATH, file: 'Infernus_Box1_1.png' },
    h_box2:         { path: HELL_PATH, file: 'Infernus_Box2_1.png' },
    h_book1:        { path: HELL_PATH, file: 'Infernus_Book1_1.png' },
    h_book2:        { path: HELL_PATH, file: 'Infernus_Book2_1.png' },
    h_bust1:        { path: HELL_PATH, file: 'Infernus_Bust1_1.png' },
    h_bust2:        { path: HELL_PATH, file: 'Infernus_BustNiche_1.png' },
};

// ----- TILE REGISTRY -----
const TILE_FILES = {
    stone: 'stone_S.png', stoneTile: 'stoneTile_S.png',
    stoneUneven: 'stoneUneven_S.png', stoneMissing: 'stoneMissingTiles_S.png',
    stoneInset: 'stoneInset_S.png', dirt: 'dirt_S.png',
    dirtTiles: 'dirtTiles_S.png', planks: 'planks_S.png',
    planksBroken: 'planksBroken_S.png', planksHole: 'planksHole_S.png',
    wall: 'stoneWall_S.png', wallAged: 'stoneWallAged_S.png',
    wallBroken: 'stoneWallBroken_S.png', wallCorner: 'stoneWallCorner_S.png',
    wallHalf: 'stoneWallHalf_S.png', wallHole: 'stoneWallHole_S.png',
    wallDoorBars: 'stoneWallDoorBars_S.png', wallDoorOpen: 'stoneWallDoorOpen_S.png',
    wallDoorClosed: 'stoneWallDoorClosed_S.png', wallGateOpen: 'stoneWallGateOpen_S.png',
    wallGateBars: 'stoneWallGateBars_S.png', wallWindowBars: 'stoneWallWindowBars_S.png',
    wallArchway: 'stoneWallArchway_S.png', wallColumn: 'stoneWallColumn_S.png',
    wallRound: 'stoneWallRound_S.png', wallTop: 'stoneWallTop_S.png',
    wallStructure: 'stoneWallStructure_S.png',
    barrel: 'barrel_S.png', barrels: 'barrels_S.png',
    barrelsStacked: 'barrelsStacked_S.png', chestClosed: 'chestClosed_S.png',
    chestOpen: 'chestOpen_S.png', tableRound: 'tableRound_S.png',
    tableRoundChairs: 'tableRoundChairs_S.png',
    tableChairsBroken: 'tableChairsBroken_S.png',
    tableShort: 'tableShort_S.png', chair: 'chair_S.png',
    woodenCrate: 'woodenCrate_S.png', woodenCrates: 'woodenCrates_S.png',
    woodenPile: 'woodenPile_S.png', woodenSupports: 'woodenSupports_S.png',
    woodenSupportBeams: 'woodenSupportBeams_S.png',
    stoneColumn: 'stoneColumn_S.png', stoneColumnWood: 'stoneColumnWood_S.png',
    stairs: 'stairs_S.png', stairsSpiral: 'stairsSpiral_S.png',
    stairsAged: 'stairsAged_S.png',
};

const WIZARD_FILES = {
    idle: 'Wizard/Wizard-Idle.png', walk: 'Wizard/Wizard-Walk.png',
    attack1: 'Wizard/Wizard-Attack01.png', attack2: 'Wizard/Wizard-Attack02.png',
    hurt: 'Wizard/Wizard-Hurt.png', death: 'Wizard/Wizard-DEATH.png',
};
const FIREBALL_FILE = 'Magic(projectile)/Wizard-Attack02_Effect.png';
const FIREBALL_FRAMES = 7;
const FIREBALL_FRAME_W = 100;
const FIREBALL_FRAME_H = 100;

// ----- TOWER ASSET -----
const TOWER_PATH = 'assets/tower-defense/PNG/';
const TOWER_FILE = 'towerDefense_052_0.png';  // battlement with red crystal
const TOWER_IMG_W = 124;
const TOWER_IMG_H = 123;

// ----- UI BORDER & CURSOR ASSETS -----
const UI_BORDER_PATH = 'assets/ui-borders/PNG/Default/';
const CURSOR_PATH = 'assets/cursors/Tiles/';
const UI_PANEL_BORDER = 6; // border width in source pixels for 9-slice
const UI_PANEL_SIZE = 48;  // source panel dimensions

// ----- Grimoire UI sprites (pixel art icons) -----
const UI_SPRITE_PATH = 'assets/status-ui/0 - Sprites/';
const UI_SPRITES = {
    tab_status: 'Tab icons/Style 1/1.png',    // settings/status icon
    tab_equip: 'Tab icons/Style 1/2.png',     // armor/equipment icon
    tab_bag: 'Tab icons/Style 1/3.png',       // briefcase/bag icon
    tab_scroll: 'Tab icons/Style 1/4.png',    // scroll/quests icon
    tab_map: 'Tab icons/Style 1/6.png',       // grid/map icon
    item_gem: 'items/3.png',                  // gem
    item_key: 'items/4.png',                  // key/wand
    item_book: 'items/5.png',                 // book (journal)
    item_scroll: 'items/6.png',               // scroll
    item_gold: 'items/9.png',                 // gold
    item_herb: 'items/10.png',                // herb
};

// ----- PLAYER FORM SPRITE REGISTRY -----
// Reuses same sprite sheets as enemies but loaded under player-specific keys
const SLIME_PLAYER_FILES = {
    slime_p_idle:   'Slime/Slime/Slime-Idle.png',
    slime_p_walk:   'Slime/Slime/Slime-Walk.png',
    slime_p_attack: 'Slime/Slime/Slime-Attack01.png',
    slime_p_hurt:   'Slime/Slime/Slime-Hurt.png',
    slime_p_death:  'Slime/Slime/Slime-Death.png',
};
const SKEL_PLAYER_FILES = {
    skel_p_idle:    'Skeleton/Skeleton/Skeleton-Idle.png',
    skel_p_walk:    'Skeleton/Skeleton/Skeleton-Walk.png',
    skel_p_attack:  'Skeleton/Skeleton/Skeleton-Attack01.png',
    skel_p_attack2: 'Skeleton/Skeleton/Skeleton-Attack02.png',  // spinning axe (shield bash visual)
    skel_p_block:   'Skeleton/Skeleton/Skeleton-Block.png',
    skel_p_hurt:    'Skeleton/Skeleton/Skeleton-Hurt.png',
    skel_p_death:   'Skeleton/Skeleton/Skeleton-Death.png',
};
const LICH_PLAYER_FILES = {
    lich_p_idle:   'Lich/Lich-Idle.png',
    lich_p_walk:   'Lich/Lich-Walk.png',
    lich_p_attack: 'Lich/Lich-Attack01.png',
    lich_p_hurt:   'Lich/Lich-Hurt.png',
    lich_p_death:  'Lich/Lich-Death.png',
};
const LICH_CHAR_PATH = 'assets/characters/';

// ----- ENEMY SPRITE REGISTRY -----
const CHAR_PATH = 'assets/characters/' +
    'Tiny RPG Character Asset Pack v1.03 -Full 20 Characters/Characters(100x100)/';

const ENEMY_FILES = {
    slime_idle:   'Slime/Slime/Slime-Idle.png',
    slime_walk:   'Slime/Slime/Slime-Walk.png',
    slime_attack: 'Slime/Slime/Slime-Attack01.png',
    slime_hurt:   'Slime/Slime/Slime-Hurt.png',
    slime_death:  'Slime/Slime/Slime-Death.png',

    skel_idle:    'Skeleton/Skeleton/Skeleton-Idle.png',
    skel_walk:    'Skeleton/Skeleton/Skeleton-Walk.png',
    skel_attack:  'Skeleton/Skeleton/Skeleton-Attack01.png',
    skel_hurt:    'Skeleton/Skeleton/Skeleton-Hurt.png',
    skel_death:   'Skeleton/Skeleton/Skeleton-Death.png',

    skelarch_idle:   'Skeleton Archer/Skeleton Archer/Skeleton Archer-Idle.png',
    skelarch_walk:   'Skeleton Archer/Skeleton Archer/Skeleton Archer-Walk.png',
    skelarch_attack: 'Skeleton Archer/Skeleton Archer/Skeleton Archer-Attack.png',
    skelarch_hurt:   'Skeleton Archer/Skeleton Archer/Skeleton Archer-Hurt.png',
    skelarch_death:  'Skeleton Archer/Skeleton Archer/Skeleton Archer-Death.png',
    skelarch_arrow:  'Skeleton Archer/Arrow(projectile)/Arrow03(100x100).png',

    armoredskel_idle:   'Armored Skeleton/Armored Skeleton/Armored Skeleton-Idle.png',
    armoredskel_walk:   'Armored Skeleton/Armored Skeleton/Armored Skeleton-Walk.png',
    armoredskel_attack: 'Armored Skeleton/Armored Skeleton/Armored Skeleton-Attack01.png',
    armoredskel_hurt:   'Armored Skeleton/Armored Skeleton/Armored Skeleton-Hurt.png',
    armoredskel_death:  'Armored Skeleton/Armored Skeleton/Armored Skeleton-Death.png',

    werewolf_idle:   'Werewolf/Werewolf/Werewolf-Idle.png',
    werewolf_walk:   'Werewolf/Werewolf/Werewolf-Walk.png',
    werewolf_attack: 'Werewolf/Werewolf/Werewolf-Attack01.png',
    werewolf_hurt:   'Werewolf/Werewolf/Werewolf-Hurt.png',
    werewolf_death:  'Werewolf/Werewolf/Werewolf-Death.png',
};

// ----- GLOBALS -----
const images = {};
const canvas = document.getElementById('game');
function setPixelCursor(type) {
    canvas.style.cursor = type;
}
let ctx = canvas.getContext('2d');
let cameraX = 0, cameraY = 0;
let smoothCamX = 0, smoothCamY = 0;
let gamePhase = 'loading';
let introTimer = 0;
let lightRadius = 60;
const MAX_LIGHT = 340;
let lightFlicker = 0;

// ----- CINEMATIC AWAKENING -----
let cinematicTimer = 0;
let cinematicPhase = 0;           // 0=pan, 1=find wizard, 2=rising, 3=light swell
let wizardRotation = Math.PI / 2; // starts lying on side (90°)
let wizardRiseProgress = 0;       // 0=lying, 1=standing
let cinematicTextAlpha = [0, 0, 0, 0]; // 4 narrative lines
let bloodStainAlpha = 0;
let dustParticles = [];
let cinematicCamRow = 8;          // camera starts away from player
let cinematicCamCol = 10;
let canvasW = 0, canvasH = 0;

// ----- STORY: VISION FLASH (post-Spire boss) -----
let visionFlashTimer = 0;

// ----- STORY: ENDING CHOICE + CINEMATICS -----
let endingChoiceFadeIn = 0;
let endingChoiceHover = null;    // 'shatter' or 'replace'
let endingChoice = null;          // 'shatter' or 'replace' — chosen ending
let endingCinematicTimer = 0;
