// ============================================================
//  MAP SYSTEM
// ============================================================
const floorMap = Array.from({ length: MAP_SIZE }, () => Array(MAP_SIZE).fill(null));
const objectMap = Array.from({ length: MAP_SIZE }, () => Array(MAP_SIZE).fill(null));
const blocked = Array.from({ length: MAP_SIZE }, () => Array(MAP_SIZE).fill(true));
// Per-tile collision type: 'wall' = full tile block, 'object' = sub-tile circle
const blockType = Array.from({ length: MAP_SIZE }, () => Array(MAP_SIZE).fill(null));
// Object collision radii (center-of-tile circle collision)
const objRadius = Array.from({ length: MAP_SIZE }, () => Array(MAP_SIZE).fill(0));

// Floor tiles that look rough/damaged but are walkable — get a subtle dust mote effect
const ROUGH_FLOORS = new Set([
    'stoneMissing', 'stoneUneven', 'planksBroken', 'planksHole', 'dirtTiles',
    'h_floor2', 'h_floor3', 'h_floorUp2', 'h_floorUp3',
    'h_floor2_2', 'h_floor2_3',
]);

// Town floor tiles that get ambient ground detail (cracks, pebbles, scuffs)
const TOWN_DETAIL_FLOORS = new Set([
    'stoneTile', 'stone', 'stoneInset', 'stoneUneven',
    'dirt', 'dirtTiles', 'planks', 'planksBroken'
]);

// Sub-tile radii per object type (how much of the tile the object actually fills)
const OBJ_RADII = {
    barrel: 0.28, barrels: 0.38, barrelsStacked: 0.38,
    chestClosed: 0.32, chestOpen: 0.32,
    tableRound: 0.35, tableRoundChairs: 0.42, tableChairsBroken: 0.40,
    tableShort: 0.32, chair: 0.22,
    woodenCrate: 0.30, woodenCrates: 0.38, woodenPile: 0.35,
    woodenSupports: 0.20, woodenSupportBeams: 0.20,
    stoneColumn: 0.22, stoneColumnWood: 0.22,
    stairs: 0.40, stairsSpiral: 0.38, stairsAged: 0.38,
    // (Town now uses dungeon tiles — no separate n_/t_ radii needed)
    // Hell (Infernus) props
    h_altar1: 0.42, h_altar2: 0.42, h_altar3: 0.42,
    h_altarSm1: 0.32, h_altarSm2: 0.32,
    h_bones1: 0.28, h_bones2: 0.28, h_bones3: 0.28, h_bones4: 0.28,
    h_skull1: 0.15, h_skull2: 0.15, h_skull3: 0.15, h_skull4: 0.15, h_skull5: 0.15,
    h_gore1: 0.35, h_gore2: 0.35,
    h_candelabra1: 0.22, h_candelabra2: 0.22, h_candelabra3: 0.22,
    h_burnerCol1: 0.25, h_burnerCol2: 0.25,
    h_cage1: 0.35, h_cage2: 0.35,
    h_throne1: 0.45, h_throne2: 0.45,
    h_pentagram: 0.40,
    h_column: 0.22, h_col1: 0.22, h_col2: 0.22, h_col3: 0.22,
    h_col4: 0.22, h_col5: 0.22, h_col6: 0.22,
    h_pillar1: 0.22, h_pillar2: 0.22,
    h_box1: 0.28, h_box2: 0.28,
    h_shelf1: 0.30, h_shelf2: 0.30,
    h_grave1: 0.30, h_grave2: 0.30, h_grave3: 0.32, h_grave4: 0.32,
    h_lectern1: 0.28, h_lectern2: 0.28,
    h_book1: 0.15, h_book2: 0.15,
    h_stairs1: 0.38, h_stairs2: 0.38, h_stairs3: 0.38,
    h_wallCandle1: 0.18, h_wallCandle2: 0.18,
    h_wallLantern1: 0.18, h_wallLantern2: 0.18,
    // New hell props for redesigned zones
    h_brokenGiant1: 0.45, h_brokenGiant2: 0.45,
    h_brokenHand1: 0.40, h_brokenHand2: 0.40,
    h_brokenHead1: 0.42, h_brokenHead2: 0.42,
    h_cliff1: 0.45, h_cliff2: 0.40, h_cliff3: 0.38,
    h_spire1: 0.35, h_spire2: 0.35,
    h_hsColumns1: 0.45,
    h_dragonBones1: 0.45, h_dragonBones2: 0.45,
    h_hangCorpse1: 0.25, h_hangCorpse2: 0.25, h_hangCorpse3: 0.25, h_hangCorpse4: 0.25,
    h_decor1: 0.35, h_decor2: 0.38, h_decor3: 0.38,
    h_cageCart1: 0.42, h_cageCart2: 0.42,
    h_pile1: 0.38, h_pile2: 0.38,
    h_bust1: 0.22, h_bust2: 0.22,
    h_stand1: 0.22, h_stand2: 0.22,
    h_reliquary1: 0.25,
    h_pentaWall1: 0.30, h_pentaWall2: 0.30,
    h_adorn1: 0.20, h_adorn2: 0.20,
    h_ramp1: 0.38, h_ramp2: 0.38,
    h_floorDecal: 0.0,
    h_rubble1: 0.20, h_rubble2: 0.20, h_rubble3: 0.20, h_rubble4: 0.20, h_rubble5: 0.20,
    h_rock1: 0.15, h_rock2: 0.15, h_rock3: 0.15,
    h_arch1: 0.0, h_arch2: 0.0, h_arch3: 0.0, h_arch4: 0.0,
    h_wallFrontL1: 0.0, h_wallSword1: 0.0, h_wallSpear1: 0.0, h_wallShield1: 0.0,
    h_wallSpear2: 0.0, h_wallSword2: 0.0,
};

function fillFloor(r1, c1, r2, c2, tile) {
    for (let r = r1; r <= r2; r++)
        for (let c = c1; c <= c2; c++) {
            floorMap[r][c] = tile;
            blocked[r][c] = false;
            blockType[r][c] = null;
        }
}

function addWalls(r1, c1, r2, c2, tile) {
    for (let c = c1; c <= c2; c++) {
        floorMap[r1][c] = tile; blocked[r1][c] = true; blockType[r1][c] = 'wall';
        floorMap[r2][c] = tile; blocked[r2][c] = true; blockType[r2][c] = 'wall';
    }
    for (let r = r1 + 1; r < r2; r++) {
        floorMap[r][c1] = tile; blocked[r][c1] = true; blockType[r][c1] = 'wall';
        floorMap[r][c2] = tile; blocked[r][c2] = true; blockType[r][c2] = 'wall';
    }
}

function placeObj(r, c, obj, blocks = true) {
    objectMap[r][c] = obj;
    if (blocks) {
        blocked[r][c] = true;
        blockType[r][c] = 'object';
        objRadius[r][c] = OBJ_RADII[obj] || 0.35;
    }
}

function openTile(r, c, tile) {
    floorMap[r][c] = tile; blocked[r][c] = false; blockType[r][c] = null;
}

function generateDungeon() {
    // ================================================================
    //  ZONE 1 — THE UNDERCROFT
    //  Layout: Cell → wide corridor → Guard Hall → broad passage
    //          → Great Hall (main arena) ← Alcove (north wing)
    //  Design goals: wide passages for AI pathing, open combat
    //  arenas, atmospheric prop placement along walls only.
    // ================================================================

    // ===== ROOM 1: THE CELL (rows 2-5, cols 2-6) =====
    // A cramped holding cell — the wizard awakens here.
    fillFloor(2, 2, 5, 6, 'dirt');
    floorMap[2][2] = 'dirtTiles';  floorMap[2][5] = 'dirtTiles';
    floorMap[3][3] = 'planksBroken'; floorMap[3][4] = 'planksHole';
    floorMap[4][2] = 'dirtTiles';  floorMap[4][4] = 'planksBroken';
    floorMap[4][6] = 'dirtTiles';  floorMap[5][3] = 'dirtTiles';
    floorMap[5][5] = 'planks';

    // Walls: aged and crumbling
    addWalls(1, 1, 6, 7, 'wallAged');
    floorMap[1][1] = 'wallCorner'; floorMap[1][7] = 'wallCorner';
    floorMap[6][1] = 'wallCorner'; floorMap[6][7] = 'wallCorner';
    floorMap[1][3] = 'wallBroken';
    // North wall archway — town exit (2 tiles wide)
    openTile(1, 4, 'wallArchway');
    openTile(1, 5, 'wallArchway');

    // South exit — open doorway 4 tiles wide
    openTile(6, 3, 'wallDoorOpen');
    openTile(6, 4, 'dirt');
    openTile(6, 5, 'dirt');
    openTile(6, 6, 'dirt');

    // Props: edges only so AI never gets stuck
    placeObj(2, 2, 'woodenPile');
    placeObj(2, 6, 'barrel');
    placeObj(5, 6, 'woodenCrate');

    // ===== CORRIDOR 1 (rows 7-9, cols 3-6) — 4 tiles wide =====
    fillFloor(7, 3, 9, 6, 'stone');
    floorMap[7][4] = 'stoneUneven'; floorMap[8][5] = 'stoneMissing';

    for (let r = 7; r <= 9; r++) {
        floorMap[r][2] = 'wall'; blocked[r][2] = true; blockType[r][2] = 'wall';
        floorMap[r][7] = 'wall'; blocked[r][7] = true; blockType[r][7] = 'wall';
    }

    // ===== ROOM 2: GUARD HALL (rows 10-16, cols 1-8) =====
    // Wide military outpost — primary early-game combat arena
    fillFloor(10, 1, 16, 8, 'stoneTile');
    floorMap[10][2] = 'stone';     floorMap[10][5] = 'stoneMissing';
    floorMap[11][3] = 'stoneUneven'; floorMap[11][7] = 'stone';
    floorMap[12][4] = 'stoneInset'; floorMap[12][6] = 'stoneMissing';
    floorMap[13][2] = 'stone';     floorMap[13][5] = 'stoneUneven';
    floorMap[14][3] = 'stoneMissing'; floorMap[14][7] = 'stone';
    floorMap[15][4] = 'stoneInset'; floorMap[15][6] = 'stone';
    floorMap[16][2] = 'stoneUneven'; floorMap[16][8] = 'stone';

    addWalls(9, 0, 17, 9, 'wall');
    floorMap[9][0] = 'wallCorner';  floorMap[9][9] = 'wallCorner';
    floorMap[17][0] = 'wallCorner'; floorMap[17][9] = 'wallCorner';
    floorMap[9][4] = 'wallWindowBars'; floorMap[9][6] = 'wallWindowBars';
    floorMap[17][3] = 'wallAged';   floorMap[17][5] = 'wallBroken';
    floorMap[17][7] = 'wallAged';

    // North entrance from corridor (4 tiles wide)
    openTile(9, 3, 'stone'); openTile(9, 4, 'stone');
    openTile(9, 5, 'stone'); openTile(9, 6, 'stone');

    // East passage to Great Hall (4 tiles tall, at cols 9)
    openTile(11, 9, 'stone'); openTile(12, 9, 'stone');
    openTile(13, 9, 'stone'); openTile(14, 9, 'stone');

    // Props: pushed to walls/corners — centre stays open for combat
    placeObj(10, 1, 'tableChairsBroken');
    placeObj(10, 8, 'barrels');
    placeObj(16, 1, 'woodenCrates');
    placeObj(16, 8, 'barrelsStacked');
    placeObj(13, 1, 'woodenCrate');

    // ===== CORRIDOR 2 (rows 11-14, cols 10-11) — 4 tiles tall × 2 wide =====
    fillFloor(11, 10, 14, 11, 'stone');
    floorMap[11][10] = 'stoneUneven'; floorMap[13][11] = 'stoneMissing';

    // Walls above and below the passage
    floorMap[10][10] = 'wall'; blocked[10][10] = true; blockType[10][10] = 'wall';
    floorMap[10][11] = 'wall'; blocked[10][11] = true; blockType[10][11] = 'wall';
    floorMap[15][10] = 'wall'; blocked[15][10] = true; blockType[15][10] = 'wall';
    floorMap[15][11] = 'wall'; blocked[15][11] = true; blockType[15][11] = 'wall';

    // ===== ROOM 3: THE GREAT HALL (rows 8-20, cols 12-21) =====
    // Grand chamber — main combat arena
    fillFloor(8, 12, 20, 21, 'stoneTile');

    // Rich floor variation
    floorMap[8][13] = 'stone';      floorMap[8][16] = 'stoneInset';
    floorMap[8][19] = 'stone';      floorMap[9][14] = 'stoneUneven';
    floorMap[9][17] = 'stone';      floorMap[9][20] = 'stoneMissing';
    floorMap[10][12] = 'stone';     floorMap[10][15] = 'stoneInset';
    floorMap[10][19] = 'stone';     floorMap[11][13] = 'stoneUneven';
    floorMap[12][16] = 'stoneInset'; floorMap[12][20] = 'stone';
    floorMap[14][13] = 'stoneMissing'; floorMap[14][18] = 'stoneUneven';
    floorMap[15][15] = 'stoneInset'; floorMap[15][20] = 'stone';
    floorMap[16][14] = 'stone';     floorMap[17][17] = 'stoneInset';
    floorMap[17][21] = 'stoneUneven'; floorMap[18][13] = 'stoneMissing';
    floorMap[18][18] = 'stone';     floorMap[19][16] = 'stoneInset';
    floorMap[19][20] = 'stoneUneven'; floorMap[20][14] = 'stone';
    floorMap[20][19] = 'stone';

    // Walls
    addWalls(7, 11, 21, 22, 'wall');
    floorMap[7][11] = 'wallCorner';  floorMap[7][22] = 'wallCorner';
    floorMap[21][11] = 'wallCorner'; floorMap[21][22] = 'wallCorner';
    floorMap[7][13] = 'wallAged';   floorMap[7][15] = 'wallWindowBars';
    floorMap[7][18] = 'wallWindowBars'; floorMap[7][20] = 'wallBroken';
    floorMap[21][13] = 'wallBroken'; floorMap[21][15] = 'wallAged';
    floorMap[21][18] = 'wallArchway'; floorMap[21][20] = 'wallAged';

    // West entrance from corridor 2 (4 tiles — rows 11-14)
    openTile(11, 11, 'stone'); openTile(12, 11, 'stone');
    openTile(13, 11, 'stone'); openTile(14, 11, 'stone');

    // Columns pushed to edges — open centre for combat
    placeObj(9, 14, 'stoneColumn');
    placeObj(9, 19, 'stoneColumn');
    placeObj(18, 14, 'stoneColumn');
    placeObj(18, 19, 'stoneColumn');

    // Key objects: chest (locked) and stairs (door to zone 2)
    placeObj(19, 21, 'chestClosed');     // locked chest — needs chest_key
    // Stairs to zone 2 — walkable so door interaction works on-tile
    openTile(19, 13, 'stairs');
    objectMap[19][13] = 'stairsSpiral';  // visual only, not blocking

    // Atmospheric props along walls
    placeObj(8, 21, 'barrelsStacked');
    placeObj(8, 12, 'woodenCrate');
    placeObj(20, 21, 'barrel');
    placeObj(20, 12, 'woodenCrates');
    placeObj(17, 21, 'woodenSupportBeams');
    placeObj(14, 20, 'tableRoundChairs');

    // ===== ROOM 4: SECRET ALCOVE (rows 2-6, cols 15-20) =====
    // Hidden storage above the Great Hall
    fillFloor(2, 15, 6, 20, 'stoneInset');
    floorMap[2][15] = 'stone';     floorMap[2][19] = 'stoneMissing';
    floorMap[4][17] = 'stoneUneven'; floorMap[5][16] = 'stone';
    floorMap[6][20] = 'stoneInset'; floorMap[3][20] = 'stoneMissing';

    addWalls(1, 14, 7, 21, 'wallAged');
    floorMap[1][14] = 'wallCorner'; floorMap[1][21] = 'wallCorner';
    floorMap[7][14] = 'wallCorner'; floorMap[7][21] = 'wallCorner';
    floorMap[1][17] = 'wallBroken'; floorMap[1][19] = 'wallHole';

    // South connection to Great Hall — 3 tiles wide (cols 16-18)
    openTile(7, 16, 'stone'); openTile(7, 17, 'stone'); openTile(7, 18, 'stone');

    // Props
    placeObj(3, 16, 'chestClosed');  // free loot chest
    placeObj(5, 19, 'barrelsStacked');
    placeObj(4, 20, 'woodenCrates');
    placeObj(6, 16, 'stairsAged');
    placeObj(2, 20, 'barrel');
    placeObj(2, 15, 'woodenPile');
}

// ===== ZONE 2: RUINED TOWER =====
// Bigger dungeon with 5 major rooms and more complex layout (MAP_SIZE = 30)
function generateZone2() {
    // Verify that map arrays have been reinitialized to MAP_SIZE=30
    if (floorMap.length !== MAP_SIZE || floorMap[0].length !== MAP_SIZE) {
        console.error('Zone 2: map arrays not reinitialized! Expected MAP_SIZE=' + MAP_SIZE + ' but got ' + floorMap.length);
        return;
    }
    // Note: This uses a larger MAP_SIZE of 30, so we need to reinitialize the map arrays
    // This is done in loadZone()

    // ===== ROOM 1: ENTRANCE VESTIBULE =====
    // Where the player arrives from Zone 1
    fillFloor(2, 2, 6, 8, 'stoneTile');
    floorMap[2][2] = 'stone';
    floorMap[3][4] = 'stoneUneven';
    floorMap[4][6] = 'stoneMissing';
    floorMap[5][3] = 'stoneInset';
    floorMap[6][7] = 'stone';

    // Walls: impressive entry hall
    addWalls(1, 1, 7, 9, 'wall');
    floorMap[1][1] = 'wallCorner';
    floorMap[1][9] = 'wallCorner';
    floorMap[7][1] = 'wallCorner';
    floorMap[7][9] = 'wallCorner';
    floorMap[1][5] = 'wallArchway';

    // Columns at entrance
    placeObj(2, 3, 'stoneColumn');
    placeObj(2, 7, 'stoneColumn');

    // East exit from Vestibule into Corridor 1 (3 tiles tall)
    openTile(4, 9, 'stone');
    openTile(5, 9, 'stone');
    openTile(6, 9, 'stone');

    // ===== CORRIDOR 1: MAIN PASSAGE =====
    fillFloor(4, 10, 6, 12, 'stone');
    for (let r = 4; r <= 6; r++) {
        floorMap[r][13] = 'wall'; blocked[r][13] = true;
    }

    // ===== ROOM 2: RUINED ARMORY =====
    // Military supplies and weapon racks — now abandoned
    fillFloor(1, 14, 8, 24, 'stone');

    // Floor variety
    floorMap[2][16] = 'stoneUneven';
    floorMap[3][18] = 'stoneMissing';
    floorMap[4][14] = 'stoneInset';
    floorMap[5][20] = 'stone';
    floorMap[6][17] = 'stoneMissing';
    floorMap[7][21] = 'stoneUneven';

    // Walls with damaged sections
    addWalls(0, 13, 9, 25, 'wallAged');
    floorMap[0][13] = 'wallCorner';
    floorMap[0][25] = 'wallCorner';
    floorMap[9][13] = 'wallCorner';
    floorMap[9][25] = 'wallCorner';
    floorMap[0][18] = 'wallBroken';
    floorMap[0][22] = 'wallHole';
    floorMap[9][16] = 'wallAged';
    floorMap[9][20] = 'wallBroken';

    // Connect main passage to armory
    openTile(4, 13, 'stone');
    openTile(5, 13, 'stone');
    openTile(6, 13, 'stone');

    // Props: broken weapon racks and supply crates
    placeObj(2, 15, 'woodenCrates');
    placeObj(2, 20, 'barrelsStacked');
    placeObj(4, 17, 'tableShort');
    placeObj(5, 24, 'woodenPile');
    placeObj(6, 18, 'barrel');
    placeObj(7, 14, 'stoneColumnWood');
    placeObj(3, 22, 'tableChairsBroken');

    // Free loot chest
    placeObj(8, 12, 'chestClosed');

    // ===== CORRIDOR 2: NORTH PASSAGE =====
    fillFloor(0, 10, 1, 12, 'stone');
    blocked[0][10] = true; blocked[0][11] = true; blocked[0][12] = true;

    // ===== ROOM 3: COLLAPSED LIBRARY =====
    // Books and knowledge destroyed, now a chamber of sorrow
    fillFloor(0, 15, 4, 25, 'stoneInset');

    // Floor variety
    floorMap[0][16] = 'stone';
    floorMap[0][20] = 'stoneMissing';
    floorMap[1][18] = 'stoneUneven';
    floorMap[2][22] = 'stone';
    floorMap[3][17] = 'stoneMissing';
    floorMap[4][24] = 'stoneInset';

    // Walls connecting to armory and beyond
    // Top wall (already part of armory wall)
    floorMap[0][14] = 'wallArchway';

    // Props: scattered books, broken shelves
    placeObj(1, 16, 'woodenSupports', true);
    placeObj(2, 19, 'barrel');
    placeObj(3, 21, 'woodenCrates');

    // ===== CORRIDOR 3: EASTERN PASSAGE =====
    fillFloor(7, 14, 15, 16, 'stone');
    for (let r = 7; r <= 15; r++) {
        floorMap[r][13] = 'wall'; blocked[r][13] = true; blockType[r][13] = 'wall';
        floorMap[r][17] = 'wall'; blocked[r][17] = true; blockType[r][17] = 'wall';
    }
    // Open west wall of Corridor 3 to connect the western strip (cols 10-12)
    openTile(10, 13, 'stone');
    openTile(11, 13, 'stone');
    openTile(12, 13, 'stone');
    floorMap[7][14] = 'stoneUneven';
    floorMap[10][15] = 'stoneMissing';
    floorMap[13][14] = 'stone';

    // ===== ROOM 4: GUARD BARRACKS =====
    // Dormitories for tower sentries — now haunted
    fillFloor(8, 18, 16, 28, 'stoneTile');

    // Floor variety
    floorMap[9][20] = 'stoneUneven';
    floorMap[11][22] = 'stoneMissing';
    floorMap[13][19] = 'stone';
    floorMap[14][25] = 'stoneInset';
    floorMap[15][21] = 'stone';

    // Walls with battle scars
    addWalls(7, 17, 17, 29, 'wall');
    floorMap[7][17] = 'wallCorner';
    floorMap[7][29] = 'wallCorner';
    floorMap[17][17] = 'wallCorner';
    floorMap[17][29] = 'wallCorner';
    floorMap[7][23] = 'wallBroken';
    floorMap[17][20] = 'wallAged';
    floorMap[17][26] = 'wallBroken';

    // Connect eastern passage (Corridor 3) to barracks
    // Open the Barracks north wall AND the Corridor 3 east wall
    openTile(10, 17, 'stone');
    openTile(11, 17, 'stone');
    openTile(12, 17, 'stone');

    // Props: bunk beds (chairs), supply barrels
    placeObj(9, 19, 'chair');
    placeObj(9, 23, 'chair');
    placeObj(11, 20, 'tableRoundChairs');
    placeObj(12, 27, 'barrelsStacked');
    placeObj(14, 18, 'barrel');
    placeObj(15, 25, 'woodenCrate');
    placeObj(10, 28, 'stoneColumn');
    placeObj(14, 28, 'stoneColumn');

    // ===== CORRIDOR 4: SOUTHERN PASSAGE (cols 10-12) =====
    // Vertical strip connecting Corridor 3 level down toward south
    fillFloor(10, 10, 16, 12, 'stone');

    // ===== ROOM 5: THRONE ANTECHAMBER (FINAL CHAMBER) =====
    // The pinnacle — grand, imposing, dangerous
    fillFloor(17, 20, 25, 28, 'stoneTile');

    // Floor variety for grand chamber
    floorMap[18][21] = 'stoneUneven';
    floorMap[20][22] = 'stoneMissing';
    floorMap[21][26] = 'stone';
    floorMap[23][23] = 'stoneInset';
    floorMap[24][27] = 'stone';

    // Walls: ornate and ominous
    addWalls(16, 19, 26, 29, 'wall');
    floorMap[16][19] = 'wallCorner';
    floorMap[16][29] = 'wallCorner';
    floorMap[26][19] = 'wallCorner';
    floorMap[26][29] = 'wallCorner';
    floorMap[16][23] = 'wallArchway';
    floorMap[26][24] = 'wallAged';
    floorMap[16][25] = 'wallBroken';

    // Connect barracks to throne chamber
    // Open shared wall at row 17 (barracks south / throne north)
    openTile(17, 21, 'stone');
    openTile(17, 22, 'stone');
    openTile(17, 23, 'stone');
    // Also open row 16 where Throne north wall overwrites Barracks floor
    openTile(16, 21, 'stoneTile');
    openTile(16, 22, 'stoneTile');
    openTile(16, 23, 'stoneTile');

    // Majestic columns and props
    placeObj(19, 22, 'stoneColumn');
    placeObj(19, 26, 'stoneColumn');
    placeObj(23, 20, 'stoneColumnWood');
    placeObj(23, 28, 'stoneColumnWood');

    // The locked chest with zone 2's key
    placeObj(22, 22, 'chestClosed');

    // Stairs to Zone 3 — corridor from Throne Antechamber down to exit
    // Carve a short south passage from Room 5 to the stairs
    fillFloor(26, 20, 27, 22, 'stone');
    // Open south wall of Throne Antechamber
    openTile(26, 20, 'stone');
    openTile(26, 21, 'stone');
    openTile(26, 22, 'stone');
    // Place stairs as a walkable floor tile (door interaction uses proximity)
    openTile(27, 21, 'stairs');
    objectMap[27][21] = 'stairsSpiral';
}

// ============================================================
//  ZONE 3 — THE SPIRE (Boss Arena, 24×24)
//  Focused boss encounter: Werewolf + armored escort.
//  Layout: Grand Entrance → Corridor → Throne Room (boss arena)
//  Room bounds must match enemies.js:
//    GrandEntrance: r1:1 r2:6 c1:1 c2:9
//    Corridor1:     r1:4 r2:6 c1:10 c2:14
//    ThroneRoom:    r1:8 r2:18 c1:10 c2:22
//  Door def: exit at (19,16) to zone4
//  Player spawns at (3,5)
// ============================================================
function generateZone3() {
    // ===== ROOM 1: GRAND ENTRANCE (rows 2-5, cols 2-8) =====
    // Vaulted entry hall — the wizard ascends into the spire's peak
    fillFloor(2, 2, 5, 8, 'stoneTile');
    floorMap[2][3] = 'stoneInset';   floorMap[2][7] = 'stoneInset';
    floorMap[3][4] = 'stone';        floorMap[3][6] = 'stoneUneven';
    floorMap[4][2] = 'stoneUneven';  floorMap[4][5] = 'stoneInset';
    floorMap[4][8] = 'stone';
    floorMap[5][3] = 'stone';        floorMap[5][7] = 'stoneMissing';

    // Walls
    addWalls(1, 1, 6, 9, 'wallAged');
    floorMap[1][1] = 'wallCorner';   floorMap[1][9] = 'wallCorner';
    floorMap[6][1] = 'wallCorner';   floorMap[6][9] = 'wallCorner';
    floorMap[1][3] = 'wallWindowBars'; floorMap[1][7] = 'wallWindowBars';
    floorMap[1][5] = 'wallBroken';
    floorMap[3][1] = 'wallBroken';   floorMap[4][9] = 'wallAged';

    // Entry from Zone 2 (north wall center, 2 tiles)
    openTile(1, 4, 'wallArchway');
    openTile(1, 5, 'wallArchway');

    // East exit to corridor (2 tiles)
    openTile(4, 9, 'stone');
    openTile(5, 9, 'stone');

    // Props: columns and atmospheric
    placeObj(2, 2, 'stoneColumn');
    placeObj(2, 8, 'stoneColumn');
    placeObj(5, 2, 'barrel');
    placeObj(5, 8, 'woodenCrate');

    // ===== CORRIDOR 1 (rows 4-6, cols 10-13) =====
    // Short passage leading east into the Throne Room
    fillFloor(4, 10, 6, 13, 'stone');
    floorMap[4][11] = 'stoneUneven'; floorMap[5][12] = 'stoneMissing';
    floorMap[6][10] = 'stoneInset';

    // Walls above and below
    for (let c = 10; c <= 13; c++) {
        floorMap[3][c] = 'wall'; blocked[3][c] = true; blockType[3][c] = 'wall';
        floorMap[7][c] = 'wall'; blocked[7][c] = true; blockType[7][c] = 'wall';
    }
    floorMap[3][10] = 'wallAged'; floorMap[7][13] = 'wallBroken';

    // ===== ROOM 2: THRONE ROOM — Boss Arena (rows 9-17, cols 11-21) =====
    // 9×11 room — the werewolf's domain. Open center for combat.
    fillFloor(9, 11, 17, 21, 'stoneTile');
    // Rich floor variation — grand but decayed
    floorMap[9][12] = 'stoneInset';   floorMap[9][16] = 'stone';
    floorMap[9][20] = 'stoneInset';
    floorMap[10][13] = 'stone';       floorMap[10][18] = 'stoneUneven';
    floorMap[11][11] = 'stoneUneven'; floorMap[11][15] = 'stoneInset';
    floorMap[11][19] = 'stone';
    floorMap[12][14] = 'stoneMissing'; floorMap[12][17] = 'stone';
    floorMap[13][12] = 'stone';       floorMap[13][16] = 'stoneInset';
    floorMap[13][20] = 'stoneUneven';
    floorMap[14][13] = 'stoneInset';  floorMap[14][18] = 'stone';
    floorMap[15][11] = 'stone';       floorMap[15][15] = 'stoneMissing';
    floorMap[15][19] = 'stoneInset';
    floorMap[16][14] = 'stone';       floorMap[16][17] = 'stoneUneven';
    floorMap[17][12] = 'stoneUneven'; floorMap[17][16] = 'stone';
    floorMap[17][20] = 'stoneInset';

    // Walls with grandeur — windows, columns
    addWalls(8, 10, 18, 22, 'wall');
    floorMap[8][10] = 'wallCorner';  floorMap[8][22] = 'wallCorner';
    floorMap[18][10] = 'wallCorner'; floorMap[18][22] = 'wallCorner';
    // North wall: window bars and archway
    floorMap[8][13] = 'wallWindowBars'; floorMap[8][16] = 'wallColumn';
    floorMap[8][19] = 'wallWindowBars';
    // South wall: aged and broken
    floorMap[18][13] = 'wallAged';   floorMap[18][17] = 'wallBroken';
    floorMap[18][20] = 'wallAged';
    // Side walls: windowed
    floorMap[11][10] = 'wallWindowBars'; floorMap[15][10] = 'wallWindowBars';
    floorMap[11][22] = 'wallWindowBars'; floorMap[15][22] = 'wallWindowBars';

    // West entrance from corridor (3 tiles, rows 9-11 at col 10)
    openTile(9, 10, 'stone');
    openTile(10, 10, 'stone');
    openTile(11, 10, 'stone');

    // Connection: corridor meets throne room
    // Extend floor from corridor into the gap
    fillFloor(7, 10, 8, 13, 'stone');
    floorMap[7][11] = 'stoneUneven';
    // Walls around the connection gap
    for (let c = 10; c <= 13; c++) {
        if (floorMap[8][c] === 'wall' || floorMap[8][c] === 'wallCorner') {
            // Already a wall — open the ones we need
        }
    }
    // Open the north wall of throne room where corridor meets
    openTile(8, 11, 'stone');
    openTile(8, 12, 'stone');
    openTile(8, 13, 'stone');

    // 4 stone columns creating cover diamond
    placeObj(10, 13, 'stoneColumn');
    placeObj(10, 19, 'stoneColumn');
    placeObj(16, 13, 'stoneColumn');
    placeObj(16, 19, 'stoneColumn');

    // Center columns for extra cover
    placeObj(13, 15, 'stoneColumnWood');
    placeObj(13, 17, 'stoneColumnWood');

    // Props along walls — atmospheric but minimal
    placeObj(9, 21, 'barrelsStacked');
    placeObj(17, 21, 'woodenCrates');
    placeObj(9, 11, 'woodenSupportBeams');
    placeObj(17, 11, 'barrel');

    // Exit stairs: south wall at (18,16) — door def expects (19,16)
    // Place stairs just inside the south wall
    openTile(18, 16, 'stairs');

    // Extend a small alcove below for the door tile at row 19
    floorMap[19][16] = 'stoneTile';
    blocked[19][16] = false;
    blockType[19][16] = null;
    // Walls around the exit alcove
    floorMap[19][15] = 'wall'; blocked[19][15] = true; blockType[19][15] = 'wall';
    floorMap[19][17] = 'wall'; blocked[19][17] = true; blockType[19][17] = 'wall';
    floorMap[20][16] = 'wall'; blocked[20][16] = true; blockType[20][16] = 'wall';
}

// ============================================================
//  ZONE 0 — TOWN (outdoor safe zone, 30×30)
//  Uses Medieval Town + Nature asset packs
// ============================================================
function generateTown() {
    // ================================================================
    //  ZONE 0 — THE HAMLET  (uses dungeon tileset for visual unity)
    //
    //  DARK FANTASY DESIGN RULES:
    //  1. Uses DUNGEON TILES exclusively — same art as underground zones.
    //  2. Open-air layout distinguishes it: wide plazas, broken walls,
    //     half-walls, and sky overhead (outdoor lighting).
    //  3. Buildings are OPEN FACADES — back-walls (north + west) only.
    //  4. The hamlet is SHRINKING — north abandoned, south desperate.
    //  5. More varied floor textures, props, and broken surfaces than
    //     the dungeons to give a weathered, surface-settlement feel.
    //  6. VIBRANT & ALIVE: Market activity, diverse props, treasure chests,
    //     training yards, graveyards, and thematic detail throughout.
    // ================================================================

    // --- helper: place wall as object (keeps ground tile visible beneath) ---
    function wall(r, c, tile) {
        objectMap[r][c] = tile || 'wall';
        blocked[r][c] = true;
        blockType[r][c] = 'wall';
    }

    // ===== 1. BASE GROUND: weathered stone and dirt =====
    for (let r = 0; r < 30; r++) {
        for (let c = 0; c < 30; c++) {
            const v = (r * 7 + c * 13 + r * c) % 12;
            // Outdoor surface: mostly dirt with scattered stone remnants
            floorMap[r][c] = v < 3  ? 'dirt'
                           : v < 5  ? 'dirtTiles'
                           : v < 7  ? 'stoneUneven'
                           :          'stoneMissing';
            blocked[r][c] = false;
            blockType[r][c] = null;
        }
    }

    // ===== 2. BORDER — blocked edges with wall ruins =====
    for (let c = 0; c < 30; c++) {
        floorMap[0][c] = 'wallAged'; blocked[0][c] = true; blockType[0][c] = 'wall';
        floorMap[29][c] = 'wallAged'; blocked[29][c] = true; blockType[29][c] = 'wall';
    }
    for (let r = 0; r < 30; r++) {
        floorMap[r][0] = 'wallAged'; blocked[r][0] = true; blockType[r][0] = 'wall';
        floorMap[r][29] = 'wallAged'; blocked[r][29] = true; blockType[r][29] = 'wall';
    }
    // Broken sections in the perimeter wall
    for (let c = 4; c < 28; c += 5) {
        floorMap[0][c] = 'wallBroken';
        floorMap[29][c] = 'wallBroken';
    }
    for (let r = 4; r < 28; r += 5) {
        floorMap[r][0] = 'wallBroken';
        floorMap[r][29] = 'wallBroken';
    }
    // Corner towers
    floorMap[0][0] = 'wallCorner'; floorMap[0][29] = 'wallCorner';
    floorMap[29][0] = 'wallCorner'; floorMap[29][29] = 'wallCorner';

    // ===== 3. ROADS — expanded cobblestone network =====
    // Main N-S road (cols 14-16): neat stone tile
    for (let r = 2; r < 28; r++) {
        for (let c = 14; c <= 16; c++) {
            floorMap[r][c] = (r + c) % 5 === 0 ? 'stoneInset' : 'stoneTile';
        }
    }
    // East branch to market (row 18-19, cols 16→26) — EXPANDED
    for (let c = 16; c <= 26; c++) {
        floorMap[18][c] = 'stoneTile';
        floorMap[19][c] = (c % 3 === 0) ? 'stoneInset' : 'stoneTile';
    }
    // West branch to residential & alchemist (row 16-17, cols 3→14) — EXPANDED
    for (let c = 3; c <= 14; c++) {
        floorMap[16][c] = 'stoneTile';
        floorMap[17][c] = (c % 3 === 0) ? 'stoneInset' : 'stoneTile';
    }
    // Short NW branch from main road to guard manor (col 8, rows 11-12)
    for (let r = 11; r <= 12; r++) {
        for (let c = 8; c <= 11; c++) {
            floorMap[r][c] = (r + c) % 4 === 0 ? 'stoneInset' : 'stoneTile';
        }
    }

    // ===== 4. DUNGEON ENTRY (south, rows 24-28) =====
    fillFloor(25, 13, 27, 17, 'stone');
    placeObj(26, 12, 'stoneColumn');  // flanking columns
    placeObj(26, 18, 'stoneColumn');
    placeObj(27, 11, 'barrel');
    placeObj(27, 19, 'barrel');
    placeObj(25, 12, 'barrels');       // ADDED: more barrels for atmosphere
    placeObj(25, 18, 'barrelsStacked');
    // Archway back to dungeon
    openTile(29, 14, 'wallArchway'); blocked[29][14] = false;
    openTile(29, 15, 'wallArchway'); blocked[29][15] = false;
    openTile(28, 14, 'stairs'); blocked[28][14] = false;
    openTile(28, 15, 'stairs'); blocked[28][15] = false;

    // ===== 5. TOWN SQUARE (center, ENLARGED: rows 12-20, cols 10-20) =====
    fillFloor(12, 10, 20, 20, 'stoneTile');
    // Richer inset pattern for visual interest
    floorMap[13][12] = 'stoneInset'; floorMap[13][18] = 'stoneInset';
    floorMap[15][11] = 'stoneInset'; floorMap[15][19] = 'stoneInset';
    floorMap[17][13] = 'stoneInset'; floorMap[17][17] = 'stoneInset';
    floorMap[19][12] = 'stoneInset'; floorMap[19][18] = 'stoneInset';
    // Worn edges of the enlarged square
    for (let c = 9; c <= 21; c++) { floorMap[11][c] = 'stoneUneven'; floorMap[21][c] = 'stoneUneven'; }
    for (let r = 12; r <= 20; r++) { floorMap[r][9] = 'stoneUneven'; floorMap[r][21] = 'stoneUneven'; }

    // BROKEN FOUNTAIN MEMORIAL (center) — major focal point
    placeObj(15, 15, 'stoneColumn');
    placeObj(16, 15, 'stoneColumnWood');
    placeObj(15, 16, 'stoneColumn', false);  // decorative rubble around fountain
    placeObj(16, 14, 'stoneColumn', false);
    placeObj(14, 15, 'woodenPile', false);
    placeObj(17, 15, 'woodenPile', false);

    // MARKET STALLS scattered in square (tables + crates/barrels nearby)
    // NE corner stalls
    placeObj(13, 18, 'tableShort');
    placeObj(12, 19, 'woodenCrates');
    placeObj(13, 19, 'barrel', false);
    // NW corner stalls
    placeObj(13, 11, 'tableRound');
    placeObj(12, 10, 'woodenCrates');
    placeObj(13, 10, 'barrel', false);
    // SE corner stalls
    placeObj(19, 19, 'tableShort');
    placeObj(20, 18, 'barrelsStacked');
    // SW corner stalls
    placeObj(19, 11, 'tableRound');
    placeObj(20, 10, 'woodenCrate', false);

    // ===== 6. THE FORGE — enhanced interior (NE of square) =====
    // Footprint: rows 11-16, cols 22-27
    fillFloor(13, 23, 15, 26, 'planks');  // larger interior
    floorMap[14][24] = 'planksBroken';
    floorMap[14][25] = 'planksBroken';
    // North back wall
    wall(12, 22, 'wallCorner');
    wall(12, 23, 'wall');
    wall(12, 24, 'wallWindowBars');
    wall(12, 25, 'wall');
    wall(12, 26, 'wall');
    wall(12, 27, 'wallCorner');
    // West back wall
    wall(13, 22, 'wall');
    wall(14, 22, 'wallWindowBars');
    wall(15, 22, 'wallAged');
    wall(16, 22, 'wall');
    // Pavement in front (south + east approach)
    fillFloor(16, 23, 16, 27, 'stone');
    fillFloor(13, 27, 16, 27, 'stone');
    // ENHANCED INTERIOR: anvil-shaped setup with tools
    placeObj(13, 24, 'stoneColumn');     // anvil proxy
    placeObj(14, 25, 'stoneColumnWood'); // anvil detail
    placeObj(13, 26, 'woodenSupports');  // weapon rack
    placeObj(15, 26, 'woodenSupports');  // weapon rack
    placeObj(15, 23, 'barrels');         // storage
    placeObj(16, 26, 'woodenCrates');    // more storage
    // Column and rubble at entrance
    placeObj(16, 28, 'stoneColumnWood');
    placeObj(17, 22, 'woodenPile', false);
    placeObj(11, 27, 'woodenPile', false);

    // ===== 7. RAGGED RAVEN INN — expanded interior (SE) =====
    // Footprint: rows 19-25, cols 22-28
    fillFloor(21, 23, 23, 27, 'planks');  // larger interior
    floorMap[22][25] = 'planksBroken';
    floorMap[23][24] = 'planksBroken';
    // North back wall
    wall(20, 22, 'wallCorner');
    wall(20, 23, 'wallAged');
    wall(20, 24, 'wallWindowBars');
    wall(20, 25, 'wall');
    wall(20, 26, 'wallAged');
    wall(20, 27, 'wall');
    wall(20, 28, 'wallCorner');
    // West back wall
    wall(21, 22, 'wall');
    wall(22, 22, 'wallWindowBars');
    wall(23, 22, 'wallAged');
    wall(24, 22, 'wall');
    // EXPANDED INTERIOR: tavern atmosphere
    placeObj(21, 25, 'tableRoundChairs');
    placeObj(22, 24, 'tableRound');
    placeObj(21, 27, 'chair');
    placeObj(22, 27, 'chair');
    placeObj(23, 26, 'barrels');
    placeObj(23, 24, 'barrel');
    placeObj(24, 26, 'barrelsStacked');
    // OUTDOOR SEATING (south side of inn)
    placeObj(25, 24, 'chair');
    placeObj(25, 25, 'tableShort');
    placeObj(25, 26, 'chair');
    // Worn approach & market area
    fillFloor(25, 23, 25, 28, 'stone');
    fillFloor(26, 23, 26, 28, 'dirtTiles');
    placeObj(20, 21, 'woodenPile');
    placeObj(26, 28, 'barrel', false);
    // Dirt & trampled ground around market
    fillFloor(24, 28, 25, 28, 'dirt');

    // ===== 8. MARKET ROW — vibrant stall strip (east road rows 18-19) =====
    // Stalls along the market branch: alternating tables, crates, barrels
    placeObj(18, 20, 'tableShort');
    placeObj(18, 22, 'woodenCrates');
    placeObj(18, 24, 'barrel');
    placeObj(19, 21, 'tableShort');
    placeObj(19, 23, 'barrelsStacked');
    placeObj(19, 25, 'woodenCrate');
    // Additional stalls further out
    placeObj(17, 22, 'tableRound');
    placeObj(20, 22, 'barrel', false);
    placeObj(17, 24, 'woodenCrates');
    placeObj(20, 24, 'barrel', false);

    // ===== 9. RUINED CHAPEL — expanded with graveyard (W) =====
    // Footprint: rows 13-17, cols 4-9
    fillFloor(14, 5, 16, 8, 'stoneInset');  // larger interior
    floorMap[15][6] = 'stoneMissing';
    // North back wall (partially broken)
    wall(13, 4, 'wallCorner');
    wall(13, 5, 'wallBroken');
    wall(13, 6, 'wallArchway');
    wall(13, 7, 'wallBroken');
    wall(13, 8, 'wall');
    wall(13, 9, 'wallCorner');
    // West back wall (crumbling)
    wall(14, 4, 'wallAged');
    wall(15, 4, 'wallBroken');
    wall(16, 4, 'wallAged');
    // Interior columns
    placeObj(15, 5, 'stoneColumn');
    placeObj(15, 8, 'stoneColumn');
    placeObj(14, 6, 'woodenPile', false);
    placeObj(16, 7, 'woodenPile', false);

    // EXPANDED GRAVEYARD (east of chapel: rows 14-17, cols 10-13)
    for (let r = 14; r <= 17; r++) {
        for (let c = 10; c <= 13; c++) {
            floorMap[r][c] = 'dirt';
        }
    }
    // Grave markers (stone columns as headstones) — EXPANDED SET
    placeObj(14, 11, 'stoneColumn');
    placeObj(15, 10, 'stoneColumn');
    placeObj(16, 11, 'stoneColumn');
    placeObj(17, 12, 'stoneColumn');
    placeObj(15, 13, 'stoneColumn');
    placeObj(16, 12, 'woodenPile', false);  // broken markers
    placeObj(14, 13, 'woodenPile', false);
    placeObj(17, 10, 'woodenPile', false);
    // Rubble at chapel entrance
    placeObj(17, 6, 'woodenSupports');
    placeObj(14, 9, 'barrel', false);
    // Additional decay
    placeObj(17, 8, 'woodenPile');

    // ===== 10. GUARD CAPTAIN'S MANOR — with training yard (NW) =====
    // Manor footprint: rows 11-15, cols 3-7
    fillFloor(12, 4, 14, 6, 'stone');
    floorMap[13][5] = 'stoneInset';
    // North back wall (stone, authoritative)
    wall(11, 3, 'wallCorner');
    wall(11, 4, 'wallStructure');
    wall(11, 5, 'wallWindowBars');
    wall(11, 6, 'wallStructure');
    wall(11, 7, 'wallCorner');
    // West back wall
    wall(12, 3, 'wall');
    wall(13, 3, 'wallWindowBars');
    wall(14, 3, 'wall');
    // Manor interior
    placeObj(12, 5, 'stoneColumn');
    placeObj(14, 6, 'tableRound');
    placeObj(13, 4, 'stoneColumn', false);

    // TRAINING YARD (south of manor: rows 15-17, cols 4-7)
    // Practice dummies and barriers
    placeObj(15, 4, 'woodenSupports');
    placeObj(15, 6, 'woodenSupports');
    placeObj(16, 5, 'woodenSupportBeams');
    placeObj(16, 7, 'woodenSupports');
    placeObj(17, 4, 'stoneColumnWood');
    placeObj(17, 6, 'stoneColumnWood');
    // Worn training ground
    fillFloor(15, 3, 17, 8, 'stoneUneven');
    // Rubble around
    placeObj(15, 3, 'woodenPile', false);
    placeObj(15, 8, 'woodenPile', false);
    placeObj(11, 2, 'woodenPile');

    // ===== 11. ALCHEMIST'S COTTAGE — with garden plots (SW) =====
    // Cottage: rows 21-24, cols 4-8
    fillFloor(22, 5, 23, 7, 'planks');
    floorMap[22][6] = 'planksHole';
    // North back wall (aged)
    wall(21, 4, 'wallCorner');
    wall(21, 5, 'wallAged');
    wall(21, 6, 'wallWindowBars');
    wall(21, 7, 'wallAged');
    wall(21, 8, 'wallCorner');
    // West back wall
    wall(22, 4, 'wallAged');
    wall(23, 4, 'wallBroken');
    // Cottage interior
    placeObj(22, 6, 'barrel');           // potion storage
    placeObj(23, 5, 'woodenCrate');      // ingredient storage
    placeObj(23, 7, 'barrelsStacked');   // more ingredients
    placeObj(22, 8, 'barrel', false);

    // GARDEN PLOTS (east of cottage: rows 22-24, cols 9-11)
    for (let r = 22; r <= 24; r++) {
        for (let c = 9; c <= 11; c++) {
            floorMap[r][c] = 'dirtTiles';  // cultivated garden
        }
    }
    // Garden details: scattered around plots
    placeObj(22, 10, 'woodenSupports');  // garden stake
    placeObj(23, 9, 'woodenSupports');   // garden stake
    placeObj(24, 11, 'woodenSupports');  // garden stake
    placeObj(24, 9, 'stoneColumn', false); // decorative
    placeObj(23, 11, 'barrel', false);   // water barrel
    // Overgrowth around cottage (weeds)
    placeObj(24, 5, 'woodenPile', false);
    placeObj(24, 7, 'woodenPile', false);
    placeObj(21, 9, 'woodenPile');
    placeObj(24, 8, 'stoneColumnWood');

    // ===== 12. HERMIT'S TOWER — sealed tower in wasteland (north center) =====
    // Footprint: rows 4-8, cols 13-17
    fillFloor(5, 14, 7, 16, 'stoneInset');
    floorMap[6][15] = 'stoneMissing';
    // Back walls (north + west + east for tower enclosure)
    wall(4, 13, 'wallCorner');
    wall(4, 14, 'wall');
    wall(4, 15, 'wallWindowBars');
    wall(4, 16, 'wall');
    wall(4, 17, 'wallCorner');
    wall(5, 13, 'wall');
    wall(6, 13, 'wallWindowBars');
    wall(7, 13, 'wall');
    wall(5, 17, 'wall');
    wall(6, 17, 'wallWindowBars');
    wall(7, 17, 'wall');
    // South entrance with stairs
    wall(8, 13, 'wallHalf');
    openTile(8, 15, 'stairsAged');
    wall(8, 17, 'wallHalf');
    // Interior (sealed, sparse)
    placeObj(5, 14, 'stoneColumn');
    placeObj(5, 16, 'stoneColumn');
    placeObj(6, 15, 'woodenPile', false);

    // ===== 13. ABANDONED NORTH (rows 1-10) — denser wasteland =====
    // The north is lost — crumbled, decayed, heavily ruined
    for (let r = 1; r <= 10; r++) {
        for (let c = 2; c <= 27; c++) {
            if (!blocked[r][c] && !objectMap[r][c]) {
                const v = (r * 11 + c * 7) % 8;
                floorMap[r][c] = v < 2 ? 'dirt'
                               : v < 4 ? 'dirtTiles'
                               : v < 6 ? 'stoneMissing'
                               :         'stoneUneven';
            }
        }
    }
    // DENSER RUBBLE — more broken supports and walls to feel threatening
    // West side
    placeObj(2, 3, 'woodenPile');
    placeObj(3, 5, 'woodenSupportBeams');
    placeObj(5, 2, 'woodenPile');
    placeObj(6, 4, 'woodenSupports');
    placeObj(8, 3, 'barrelsStacked');
    placeObj(4, 6, 'woodenCrates');
    placeObj(7, 7, 'woodenPile');
    // Center
    placeObj(3, 11, 'woodenPile');
    placeObj(5, 15, 'woodenPile');
    placeObj(9, 14, 'barrelsStacked');
    placeObj(8, 18, 'woodenSupports');
    placeObj(6, 20, 'woodenCrates');
    // East side
    placeObj(2, 25, 'woodenPile');
    placeObj(3, 23, 'woodenSupportBeams');
    placeObj(5, 26, 'woodenSupports');
    placeObj(7, 24, 'barrelsStacked');
    placeObj(9, 26, 'woodenCrate');
    placeObj(6, 27, 'woodenPile');
    placeObj(8, 25, 'woodenCrates');
    // Additional walls and decay scattered
    placeObj(3, 16, 'wallBroken', false);
    placeObj(7, 10, 'wallAged', false);

    // EXPANDED GRAVEYARD (rows 2-6, cols 6-9) — mass plague graves
    for (let r = 2; r <= 6; r++) {
        for (let c = 6; c <= 9; c++) {
            floorMap[r][c] = 'dirt';
        }
    }
    // More grave markers (stone columns as headstones) — DENSER
    placeObj(2, 7, 'stoneColumn');
    placeObj(3, 6, 'stoneColumn');
    placeObj(3, 8, 'stoneColumn');
    placeObj(4, 9, 'stoneColumn');
    placeObj(5, 7, 'stoneColumn');
    placeObj(6, 6, 'stoneColumn');
    placeObj(2, 9, 'woodenPile', false);
    placeObj(4, 7, 'woodenPile', false);
    placeObj(6, 8, 'woodenPile', false);

    // ===== 14. DEFENSIVE BARRICADE — prominent gate (rows 10-11) =====
    // Separates abandoned north from surviving town
    // Much more prominent with denser walls and clear gate
    // West section
    wall(10, 7, 'wallBroken');
    wall(10, 8, 'wallHalf');
    wall(10, 9, 'wallBroken');
    placeObj(11, 7, 'barrelsStacked');
    // CENTER GATE OPENING (cols 10-18 passable for main road)
    // East section
    wall(10, 19, 'wallBroken');
    wall(10, 20, 'wallHalf');
    wall(10, 21, 'wallBroken');
    placeObj(11, 21, 'barrelsStacked');
    // Additional reinforcements
    placeObj(11, 10, 'woodenSupports');
    placeObj(11, 18, 'woodenSupports');
    placeObj(10, 12, 'barrel');
    placeObj(10, 16, 'barrel');
    placeObj(11, 14, 'woodenCrate');
    // Debris near buildings
    placeObj(12, 6, 'woodenPile');
    placeObj(12, 23, 'woodenPile');
    placeObj(9, 3, 'barrel', false);
    placeObj(9, 26, 'barrel', false);

    // ===== 15. ROAD COLUMNS — enhanced placement (replacing lightposts) =====
    placeObj(8, 15, 'stoneColumnWood');     // north road approach
    placeObj(10, 15, 'stoneColumnWood', false);  // at barricade
    placeObj(21, 15, 'stoneColumnWood');   // south of square
    placeObj(24, 15, 'stoneColumnWood');   // near dungeon entry

    // ===== 16. SCATTERED DETAIL PROPS — life everywhere =====
    // Crates and barrels along roads and building edges
    // Main road variations
    placeObj(5, 15, 'barrel', false);
    placeObj(8, 14, 'woodenCrate', false);
    placeObj(13, 14, 'barrel', false);
    placeObj(22, 15, 'barrel', false);
    // Chapel area
    placeObj(13, 9, 'barrel', false);
    placeObj(14, 4, 'barrel', false);
    // Guard manor area
    placeObj(11, 8, 'barrel', false);
    placeObj(12, 3, 'woodenCrate', false);
    // Alchemist area
    placeObj(22, 3, 'barrel', false);
    placeObj(25, 4, 'woodenCrates', false);

    // ===== 17. TREASURE CHESTS (4-6 strategic loot locations) =====
    placeObj(15, 20, 'chestClosed');       // town square NE
    placeObj(19, 10, 'chestClosed');       // town square SW
    placeObj(13, 5, 'chestClosed');        // chapel interior
    placeObj(26, 26, 'chestClosed');       // inn interior
    placeObj(14, 27, 'chestClosed');       // forge interior
    placeObj(16, 6, 'chestClosed');        // graveyard (eerie loot)

    // ===== 18. BUILDING GROUND DETAIL =====
    // Stone aprons and dirt transitions around structures

    // The Forge (rows 11-17, cols 22-28)
    fillFloor(11, 28, 16, 28, 'stone');
    fillFloor(17, 23, 17, 28, 'stone');
    placeObj(17, 28, 'woodenPile', false);
    placeObj(18, 22, 'barrel', false);

    // Ragged Raven Inn (rows 19-27, cols 22-29)
    fillFloor(27, 23, 27, 29, 'dirtTiles');
    placeObj(27, 29, 'barrel', false);
    placeObj(28, 25, 'woodenPile', false);

    // Ruined Chapel + Graveyard (rows 13-18, cols 4-14)
    fillFloor(18, 5, 18, 13, 'dirtTiles');
    fillFloor(13, 14, 18, 14, 'dirtTiles');
    placeObj(18, 4, 'woodenPile', false);

    // Guard Manor (rows 11-17, cols 3-8)
    fillFloor(15, 2, 17, 8, 'stone');
    fillFloor(11, 8, 14, 8, 'stone');
    placeObj(18, 3, 'barrel', false);

    // Alchemist's Cottage + Garden (rows 21-25, cols 4-12)
    fillFloor(25, 4, 25, 12, 'dirtTiles');
    placeObj(25, 3, 'barrel', false);

    // Hermit's Tower (rows 4-9, cols 13-17)
    fillFloor(9, 14, 9, 16, 'dirtTiles');
    placeObj(2, 14, 'barrel', false);

    // ===== 19. DUNGEON CORRUPTION BLEED (south rows 25-28) =====
    for (let r = 26; r <= 28; r++) {
        for (let c = 12; c <= 18; c++) {
            if (!blocked[r][c]) {
                const v = (r * 5 + c * 3) % 5;
                floorMap[r][c] = v < 2 ? 'dirt' : 'stoneMissing';
            }
        }
    }
    // Dirt patches spreading from the archway
    floorMap[27][13] = 'dirt';
    floorMap[27][17] = 'dirt';
    floorMap[25][14] = 'dirtTiles';
    floorMap[25][16] = 'dirtTiles';
    floorMap[26][11] = 'dirt';
    floorMap[26][19] = 'dirt';
    // Rubble objects near the entry
    placeObj(27, 12, 'barrelsStacked');
    placeObj(27, 18, 'woodenCrate');

    // ===== 20. ENTRANCES =====
    // North gate (future zone)
    openTile(0, 14, 'wallArchway'); blocked[0][14] = false;
    openTile(0, 15, 'wallArchway'); blocked[0][15] = false;

    // ===== 21. GROUND TRANSITION PASS =====
    // Soften hard edges: where stoneTile meets dirt, insert stoneUneven
    const paveTypes = new Set(['stoneTile', 'stone', 'stoneInset', 'planks']);
    const dirtTypes = new Set(['dirt', 'dirtTiles']);
    const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
    for (let r = 1; r < 29; r++) {
        for (let c = 1; c < 29; c++) {
            const ft = floorMap[r][c];
            if (!dirtTypes.has(ft)) continue;
            if (blocked[r][c]) continue;
            // Check if any neighbor is paved
            let nearPave = false;
            for (const [dr, dc] of dirs) {
                const nf = floorMap[r + dr]?.[c + dc];
                if (paveTypes.has(nf)) nearPave = true;
            }
            if (nearPave) {
                floorMap[r][c] = 'stoneUneven';
            }
        }
    }
}

// ============================================================
//  ZONE 4 — THE INFERNO (Hell Dungeon)
//  Uses PVGames Infernus tileset
//  Layout: The Maw (entry) → wide descent → The Crucible (massive arena)
//  Design: one enormous combat space with strategic cover pillars,
//          dramatic hellscape environmental pieces, and a throne
//          at the far end. Open kiting, no cramped corridors.
// ============================================================


function hellObj(r, c, obj, blocks = true) {
    objectMap[r][c] = obj;
    if (blocks) {
        blocked[r][c] = true;
        blockType[r][c] = 'object';
        objRadius[r][c] = OBJ_RADII[obj] || 0.35;
    }
}

function hellOpen(r, c, tile) {
    floorMap[r][c] = tile || 'h_arch1';
    blocked[r][c] = false;
    blockType[r][c] = null;
}


function generateHellZone() {
    // ================================================================
    //  ZONE 4 — THE INFERNO
    //  Uses DUNGEON tileset for floors/walls (proven, crisp at our scale)
    //  and small/medium Infernus props for hell atmosphere.
    //  Red lighting + ember particles + hell props = the "hell" feel.
    //
    //  Layout: The Maw (entry) → wide descent → The Crucible (massive arena)
    //  The Crucible is 15×24 tiles — 3x bigger than Zone 1's Great Hall.
    //  Stone columns provide strategic cover. Open center for kiting.
    //  NO oversized environmental pieces (broken giants, dragon bones etc.)
    //  — those are 500-800px images that overlap 8+ tiles and look chaotic.
    // ================================================================

    // ===== THE MAW — entry (rows 2-7, cols 9-18) =====
    // 6×10 chamber. Player descends from The Spire.
    fillFloor(2, 9, 7, 18, 'stoneTile');
    floorMap[2][10] = 'stoneInset';   floorMap[2][17] = 'stoneInset';
    floorMap[3][12] = 'stone';        floorMap[3][15] = 'stoneUneven';
    floorMap[4][9] = 'stoneUneven';   floorMap[4][14] = 'stoneMissing';
    floorMap[4][18] = 'stone';
    floorMap[5][11] = 'stoneMissing'; floorMap[5][16] = 'stoneInset';
    floorMap[6][10] = 'stone';        floorMap[6][13] = 'stoneUneven';
    floorMap[6][18] = 'stoneMissing';
    floorMap[7][12] = 'stoneInset';   floorMap[7][15] = 'stone';

    // Walls
    addWalls(1, 8, 8, 19, 'wallAged');
    floorMap[1][8] = 'wallCorner';   floorMap[1][19] = 'wallCorner';
    floorMap[8][8] = 'wallCorner';   floorMap[8][19] = 'wallCorner';
    floorMap[1][12] = 'wallBroken';  floorMap[1][15] = 'wallHole';
    floorMap[4][8] = 'wallBroken';   floorMap[5][19] = 'wallBroken';

    // Entry stairs from The Spire (north wall center, 2 tiles)
    openTile(1, 13, 'wallArchway');
    openTile(1, 14, 'wallArchway');

    // South exit: 4-tile wide opening into descent
    openTile(8, 12, 'stone'); openTile(8, 13, 'stone');
    openTile(8, 14, 'stone'); openTile(8, 15, 'stone');

    // Props — hell atmosphere: cages, corpses, burner columns
    hellObj(2, 9, 'h_burnerCol1');    hellObj(2, 18, 'h_burnerCol2');
    hellObj(4, 9, 'h_cage1');         hellObj(4, 18, 'h_cage2');
    hellObj(7, 9, 'h_candelabra1');   hellObj(7, 18, 'h_candelabra3');
    // Non-blocking floor details
    hellObj(3, 13, 'h_skull1', false);
    hellObj(5, 11, 'h_bones1', false);
    hellObj(6, 16, 'h_bones3', false);

    // ===== THE DESCENT — wide passage (rows 8-10, cols 6-21) =====
    // 3×16 tiles — broad approach into the Crucible
    fillFloor(8, 6, 10, 21, 'stone');
    floorMap[8][8] = 'stoneUneven';   floorMap[8][19] = 'stoneMissing';
    floorMap[9][10] = 'stoneInset';   floorMap[9][16] = 'stoneUneven';
    floorMap[10][7] = 'stoneMissing'; floorMap[10][14] = 'stoneInset';
    floorMap[10][20] = 'stoneUneven';

    // Side walls
    for (let r = 8; r <= 10; r++) {
        floorMap[r][5] = 'wall'; blocked[r][5] = true; blockType[r][5] = 'wall';
        floorMap[r][22] = 'wall'; blocked[r][22] = true; blockType[r][22] = 'wall';
    }

    // Hell props along descent walls
    hellObj(9, 6, 'h_skull3', false);
    hellObj(9, 21, 'h_bones4', false);

    // ===== THE CRUCIBLE — massive arena (rows 11-25, cols 1-26) =====
    // 15×26 tiles = 390 tiles. 3x bigger than Zone 1 Great Hall.
    fillFloor(11, 1, 25, 26, 'stoneTile');

    // Extensive hand-placed floor variation — worn, cracked, bloodstained stone
    // North section
    floorMap[11][3] = 'stone';        floorMap[11][7] = 'stoneInset';
    floorMap[11][12] = 'stoneUneven'; floorMap[11][17] = 'stone';
    floorMap[11][22] = 'stoneMissing'; floorMap[12][5] = 'stoneUneven';
    floorMap[12][10] = 'stone';       floorMap[12][15] = 'stoneInset';
    floorMap[12][20] = 'stoneUneven'; floorMap[12][24] = 'stone';
    floorMap[13][2] = 'stoneMissing'; floorMap[13][8] = 'stoneInset';
    floorMap[13][13] = 'stone';       floorMap[13][18] = 'stoneMissing';
    floorMap[13][23] = 'stoneInset';
    // Center band
    floorMap[14][4] = 'stone';        floorMap[14][11] = 'stoneUneven';
    floorMap[14][16] = 'stoneInset';  floorMap[14][21] = 'stone';
    floorMap[15][6] = 'stoneInset';   floorMap[15][9] = 'stone';
    floorMap[15][14] = 'stoneUneven'; floorMap[15][19] = 'stone';
    floorMap[15][24] = 'stoneMissing';
    floorMap[16][3] = 'stone';        floorMap[16][8] = 'stoneMissing';
    floorMap[16][13] = 'stoneInset';  floorMap[16][18] = 'stone';
    floorMap[16][23] = 'stoneUneven';
    floorMap[17][5] = 'stoneUneven';  floorMap[17][10] = 'stone';
    floorMap[17][15] = 'stoneMissing'; floorMap[17][20] = 'stoneInset';
    floorMap[17][25] = 'stone';
    floorMap[18][2] = 'stoneInset';   floorMap[18][7] = 'stone';
    floorMap[18][12] = 'stoneUneven'; floorMap[18][17] = 'stone';
    floorMap[18][22] = 'stoneMissing';
    // South section — more damage near the throne
    floorMap[19][4] = 'stoneMissing'; floorMap[19][9] = 'stoneUneven';
    floorMap[19][14] = 'stone';       floorMap[19][19] = 'stoneMissing';
    floorMap[19][24] = 'stoneUneven';
    floorMap[20][3] = 'stone';        floorMap[20][8] = 'stoneInset';
    floorMap[20][13] = 'stoneMissing'; floorMap[20][18] = 'stoneUneven';
    floorMap[20][23] = 'stone';
    floorMap[21][6] = 'stoneUneven';  floorMap[21][11] = 'stoneMissing';
    floorMap[21][16] = 'stone';       floorMap[21][21] = 'stoneInset';
    floorMap[22][2] = 'stoneMissing'; floorMap[22][7] = 'stone';
    floorMap[22][14] = 'stoneUneven'; floorMap[22][20] = 'stoneMissing';
    floorMap[22][25] = 'stone';
    floorMap[23][5] = 'stoneInset';   floorMap[23][10] = 'stone';
    floorMap[23][17] = 'stoneUneven'; floorMap[23][22] = 'stoneInset';
    floorMap[24][3] = 'stone';        floorMap[24][8] = 'stoneMissing';
    floorMap[24][15] = 'stoneInset';  floorMap[24][21] = 'stone';
    floorMap[25][4] = 'stoneUneven';  floorMap[25][12] = 'stone';
    floorMap[25][18] = 'stoneMissing'; floorMap[25][24] = 'stoneInset';

    // ---- WALLS: perimeter of the Crucible ----
    addWalls(10, 0, 26, 27, 'wall');
    // Corners
    floorMap[10][0] = 'wallCorner';  floorMap[10][27] = 'wallCorner';
    floorMap[26][0] = 'wallCorner';  floorMap[26][27] = 'wallCorner';
    // North wall variety
    floorMap[10][5] = 'wallBroken';  floorMap[10][9] = 'wallAged';
    floorMap[10][14] = 'wallHole';   floorMap[10][18] = 'wallBroken';
    floorMap[10][22] = 'wallAged';
    // South wall variety
    floorMap[26][5] = 'wallBroken';  floorMap[26][9] = 'wallAged';
    floorMap[26][14] = 'wallHole';   floorMap[26][18] = 'wallBroken';
    floorMap[26][22] = 'wallAged';
    // West wall variety
    floorMap[14][0] = 'wallBroken';  floorMap[18][0] = 'wallAged';
    floorMap[22][0] = 'wallBroken';
    // East wall variety
    floorMap[14][27] = 'wallAged';   floorMap[18][27] = 'wallBroken';
    floorMap[22][27] = 'wallAged';

    // ---- North entrance (4-tile wide, cols 12-15) ----
    openTile(10, 12, 'stone'); openTile(10, 13, 'stone');
    openTile(10, 14, 'stone'); openTile(10, 15, 'stone');

    // ---- STRATEGIC COVER — stone columns for dodging ----
    // 4 column pairs creating a diamond pattern around the arena center
    // Northwest
    placeObj(13, 5, 'stoneColumn');   placeObj(13, 6, 'stoneColumnWood');
    // Northeast
    placeObj(13, 21, 'stoneColumn');  placeObj(13, 22, 'stoneColumnWood');
    // Southwest
    placeObj(21, 5, 'stoneColumn');   placeObj(21, 6, 'stoneColumnWood');
    // Southeast
    placeObj(21, 21, 'stoneColumn');  placeObj(21, 22, 'stoneColumnWood');
    // 2 inner columns flanking the center
    placeObj(17, 9, 'stoneColumn');
    placeObj(17, 18, 'stoneColumn');

    // ---- HELL PROPS: small/medium Infernus pieces for atmosphere ----

    // Altars — ritual focus near center
    hellObj(16, 12, 'h_altar1');
    hellObj(16, 15, 'h_altar2');
    // Pentagram on the floor between altars (non-blocking)
    hellObj(16, 13, 'h_pentagram', false);
    hellObj(16, 14, 'h_floorDecal', false);

    // West wall props — cages, corpses, burner columns
    hellObj(11, 1, 'h_burnerCol1');
    hellObj(12, 1, 'h_cage1');
    hellObj(15, 1, 'h_candelabra1');
    hellObj(17, 1, 'h_cage2');
    hellObj(19, 1, 'h_burnerCol2');
    hellObj(23, 1, 'h_candelabra2');

    // East wall props — mirrors the west wall
    hellObj(11, 26, 'h_burnerCol2');
    hellObj(12, 26, 'h_cage2');
    hellObj(15, 26, 'h_candelabra3');
    hellObj(17, 26, 'h_cage1');
    hellObj(19, 26, 'h_burnerCol1');
    hellObj(23, 26, 'h_candelabra1');

    // South end — throne area
    hellObj(24, 13, 'h_altar3');     // large altar as throne substitute
    hellObj(24, 10, 'h_candelabra1');
    hellObj(24, 17, 'h_candelabra3');
    hellObj(25, 11, 'h_stand1');
    hellObj(25, 16, 'h_stand2');

    // Wall-mounted decorations (non-blocking)
    hellObj(11, 4, 'h_wallSword1', false);
    hellObj(11, 8, 'h_wallShield1', false);
    hellObj(11, 19, 'h_wallSpear1', false);
    hellObj(11, 23, 'h_wallSword2', false);
    hellObj(25, 5, 'h_wallSword1', false);
    hellObj(25, 9, 'h_pentaWall1', false);
    hellObj(25, 18, 'h_pentaWall2', false);
    hellObj(25, 22, 'h_wallSpear2', false);

    // Scattered floor atmosphere (non-blocking)
    hellObj(12, 4, 'h_skull1', false);
    hellObj(12, 23, 'h_skull2', false);
    hellObj(14, 10, 'h_bones1', false);
    hellObj(14, 17, 'h_bones2', false);
    hellObj(15, 3, 'h_gore1', false);
    hellObj(15, 24, 'h_gore2', false);
    hellObj(18, 4, 'h_bones3', false);
    hellObj(18, 23, 'h_bones4', false);
    hellObj(19, 11, 'h_skull3', false);
    hellObj(19, 16, 'h_skull4', false);
    hellObj(20, 3, 'h_rubble1', false);
    hellObj(20, 24, 'h_rubble1', false);
    hellObj(22, 9, 'h_skull5', false);
    hellObj(22, 18, 'h_skull1', false);
    hellObj(23, 3, 'h_gore1', false);
    hellObj(23, 24, 'h_gore2', false);
    hellObj(25, 3, 'h_grave1', false);
    hellObj(25, 24, 'h_grave2', false);

    // ---- Boss exit: stairs at south wall center (locked) ----
    openTile(26, 13, 'stairs');
    openTile(26, 14, 'stairs');
}


// ============================================================
//  ZONE 5 — THE FROZEN ABYSS
//  Deeper hell layer with an icy, corrupted theme.
//  Uses dungeon tiles + hell props (same approach as Zone 4).
//  Frozen lighting (blue/purple) differentiates from Zone 4's crimson.
//
//  Layout: Frost Gate (entry) → Ice Bridge (wide passage) →
//          Frozen Arena (massive) → Abyssal Pit (boss alcove)
//  MAP_SIZE = 30
// ============================================================
function generateZone5() {

    // ===== FROST GATE — entry chamber (rows 2-6, cols 11-18) =====
    // 5×8 chamber. Descent from The Inferno.
    fillFloor(2, 11, 6, 18, 'stoneTile');
    floorMap[2][12] = 'stoneInset';   floorMap[2][17] = 'stoneInset';
    floorMap[3][14] = 'stone';        floorMap[3][16] = 'stoneUneven';
    floorMap[4][11] = 'stoneUneven';  floorMap[4][15] = 'stoneMissing';
    floorMap[4][18] = 'stone';
    floorMap[5][13] = 'stoneMissing'; floorMap[5][16] = 'stoneInset';
    floorMap[6][12] = 'stone';        floorMap[6][17] = 'stoneUneven';

    // Walls around Frost Gate
    addWalls(1, 10, 7, 19, 'wallAged');
    floorMap[1][10] = 'wallCorner';   floorMap[1][19] = 'wallCorner';
    floorMap[7][10] = 'wallCorner';   floorMap[7][19] = 'wallCorner';
    floorMap[1][13] = 'wallBroken';   floorMap[1][16] = 'wallHole';
    floorMap[4][10] = 'wallBroken';   floorMap[5][19] = 'wallBroken';

    // Entry stairs from The Inferno (north wall, 2 tiles)
    openTile(1, 14, 'wallArchway');
    openTile(1, 15, 'wallArchway');

    // South exit: 4-tile wide opening
    openTile(7, 13, 'stone'); openTile(7, 14, 'stone');
    openTile(7, 15, 'stone'); openTile(7, 16, 'stone');

    // Props — icy/frozen hell feel
    hellObj(2, 11, 'h_burnerCol1');   hellObj(2, 18, 'h_burnerCol2');
    hellObj(5, 11, 'h_candelabra1');  hellObj(5, 18, 'h_candelabra3');
    hellObj(3, 14, 'h_skull1', false);
    hellObj(4, 12, 'h_bones1', false);
    hellObj(6, 16, 'h_bones3', false);

    // ===== ICE BRIDGE — wide passage (rows 7-9, cols 6-23) =====
    // 3×18 tiles — broad frozen corridor
    fillFloor(7, 6, 9, 23, 'stone');
    floorMap[7][8] = 'stoneUneven';   floorMap[7][20] = 'stoneMissing';
    floorMap[8][10] = 'stoneInset';   floorMap[8][17] = 'stoneUneven';
    floorMap[9][7] = 'stoneMissing';  floorMap[9][14] = 'stoneInset';
    floorMap[9][21] = 'stoneUneven';

    // Side walls
    for (let r = 7; r <= 9; r++) {
        floorMap[r][5] = 'wall'; blocked[r][5] = true; blockType[r][5] = 'wall';
        floorMap[r][24] = 'wall'; blocked[r][24] = true; blockType[r][24] = 'wall';
    }

    // Bridge props — scattered bones and debris
    hellObj(8, 7, 'h_skull3', false);
    hellObj(8, 22, 'h_bones4', false);
    hellObj(8, 14, 'h_rubble1', false);

    // ===== FROZEN ARENA — massive room (rows 10-21, cols 3-26) =====
    // 12×24 tiles = 288 tiles. Large combat space.
    fillFloor(10, 3, 21, 26, 'stoneTile');

    // Extensive floor variation — cracked, icy stone
    floorMap[10][5] = 'stone';        floorMap[10][9] = 'stoneInset';
    floorMap[10][14] = 'stoneUneven'; floorMap[10][19] = 'stone';
    floorMap[10][24] = 'stoneMissing';
    floorMap[11][7] = 'stoneUneven';  floorMap[11][12] = 'stone';
    floorMap[11][17] = 'stoneInset';  floorMap[11][22] = 'stoneUneven';
    floorMap[12][4] = 'stoneMissing'; floorMap[12][10] = 'stoneInset';
    floorMap[12][15] = 'stone';       floorMap[12][20] = 'stoneMissing';
    floorMap[12][25] = 'stoneInset';
    floorMap[13][6] = 'stone';        floorMap[13][13] = 'stoneUneven';
    floorMap[13][18] = 'stoneInset';  floorMap[13][23] = 'stone';
    floorMap[14][4] = 'stoneInset';   floorMap[14][11] = 'stone';
    floorMap[14][16] = 'stoneMissing'; floorMap[14][21] = 'stoneUneven';
    floorMap[15][8] = 'stoneUneven';  floorMap[15][14] = 'stoneInset';
    floorMap[15][19] = 'stone';       floorMap[15][25] = 'stoneMissing';
    floorMap[16][5] = 'stone';        floorMap[16][10] = 'stoneMissing';
    floorMap[16][15] = 'stoneUneven'; floorMap[16][20] = 'stone';
    floorMap[17][7] = 'stoneInset';   floorMap[17][12] = 'stone';
    floorMap[17][17] = 'stoneMissing'; floorMap[17][22] = 'stoneInset';
    floorMap[18][4] = 'stoneMissing'; floorMap[18][9] = 'stoneUneven';
    floorMap[18][14] = 'stone';       floorMap[18][19] = 'stoneMissing';
    floorMap[18][24] = 'stoneUneven';
    floorMap[19][6] = 'stone';        floorMap[19][11] = 'stoneInset';
    floorMap[19][16] = 'stoneUneven'; floorMap[19][21] = 'stone';
    floorMap[20][4] = 'stoneUneven';  floorMap[20][13] = 'stoneMissing';
    floorMap[20][18] = 'stoneInset';  floorMap[20][25] = 'stone';
    floorMap[21][7] = 'stoneMissing'; floorMap[21][12] = 'stone';
    floorMap[21][17] = 'stoneUneven'; floorMap[21][22] = 'stoneMissing';

    // Perimeter walls
    addWalls(9, 2, 22, 27, 'wall');
    floorMap[9][2] = 'wallCorner';   floorMap[9][27] = 'wallCorner';
    floorMap[22][2] = 'wallCorner';  floorMap[22][27] = 'wallCorner';
    // Wall variety
    floorMap[9][7] = 'wallBroken';   floorMap[9][12] = 'wallAged';
    floorMap[9][17] = 'wallHole';    floorMap[9][22] = 'wallBroken';
    floorMap[22][7] = 'wallAged';    floorMap[22][12] = 'wallBroken';
    floorMap[22][17] = 'wallHole';   floorMap[22][22] = 'wallAged';
    floorMap[14][2] = 'wallBroken';  floorMap[18][2] = 'wallAged';
    floorMap[14][27] = 'wallAged';   floorMap[18][27] = 'wallBroken';

    // North entrance (4-tile wide)
    openTile(9, 13, 'stone'); openTile(9, 14, 'stone');
    openTile(9, 15, 'stone'); openTile(9, 16, 'stone');

    // South exit to Abyssal Pit (4-tile wide)
    openTile(22, 13, 'stone'); openTile(22, 14, 'stone');
    openTile(22, 15, 'stone'); openTile(22, 16, 'stone');

    // Strategic cover columns — diamond pattern
    placeObj(12, 6, 'stoneColumn');    placeObj(12, 7, 'stoneColumnWood');
    placeObj(12, 22, 'stoneColumn');   placeObj(12, 23, 'stoneColumnWood');
    placeObj(19, 6, 'stoneColumn');    placeObj(19, 7, 'stoneColumnWood');
    placeObj(19, 22, 'stoneColumn');   placeObj(19, 23, 'stoneColumnWood');
    // Center columns
    placeObj(15, 10, 'stoneColumn');
    placeObj(15, 19, 'stoneColumn');
    placeObj(16, 14, 'stoneColumn');

    // Hell props along walls
    hellObj(10, 3, 'h_burnerCol1');    hellObj(10, 26, 'h_burnerCol2');
    hellObj(13, 3, 'h_cage1');         hellObj(13, 26, 'h_cage2');
    hellObj(16, 3, 'h_candelabra1');   hellObj(16, 26, 'h_candelabra3');
    hellObj(19, 3, 'h_cage2');         hellObj(19, 26, 'h_cage1');
    hellObj(21, 3, 'h_burnerCol2');    hellObj(21, 26, 'h_burnerCol1');

    // Altars and ritual elements at arena center
    hellObj(15, 13, 'h_altar1');
    hellObj(15, 16, 'h_altar2');
    hellObj(16, 15, 'h_pentagram', false);

    // Scattered floor atmosphere
    hellObj(11, 5, 'h_skull1', false);    hellObj(11, 24, 'h_skull2', false);
    hellObj(13, 10, 'h_bones1', false);   hellObj(13, 19, 'h_bones2', false);
    hellObj(14, 5, 'h_gore1', false);     hellObj(14, 24, 'h_gore2', false);
    hellObj(17, 8, 'h_bones3', false);    hellObj(17, 21, 'h_bones4', false);
    hellObj(18, 5, 'h_skull3', false);    hellObj(18, 24, 'h_skull4', false);
    hellObj(20, 9, 'h_rubble1', false);   hellObj(20, 20, 'h_rubble1', false);
    hellObj(21, 5, 'h_grave1', false);    hellObj(21, 24, 'h_grave2', false);

    // Wall decorations
    hellObj(10, 6, 'h_wallSword1', false);   hellObj(10, 10, 'h_wallShield1', false);
    hellObj(10, 19, 'h_wallSpear1', false);  hellObj(10, 23, 'h_wallSword2', false);
    hellObj(21, 6, 'h_pentaWall1', false);   hellObj(21, 23, 'h_pentaWall2', false);

    // ===== ABYSSAL PIT — boss alcove (rows 22-27, cols 8-21) =====
    // 6×14 chamber — tighter space for the boss fight finale
    fillFloor(22, 8, 27, 21, 'stoneTile');
    floorMap[22][10] = 'stoneUneven';  floorMap[22][19] = 'stoneMissing';
    floorMap[23][9] = 'stone';         floorMap[23][15] = 'stoneInset';
    floorMap[23][20] = 'stoneUneven';
    floorMap[24][11] = 'stoneMissing'; floorMap[24][14] = 'stone';
    floorMap[24][18] = 'stoneInset';
    floorMap[25][10] = 'stoneInset';   floorMap[25][16] = 'stoneUneven';
    floorMap[25][20] = 'stoneMissing';
    floorMap[26][12] = 'stone';        floorMap[26][17] = 'stoneUneven';
    floorMap[27][9] = 'stoneMissing';  floorMap[27][14] = 'stoneInset';
    floorMap[27][19] = 'stone';

    // Walls around Abyssal Pit
    addWalls(22, 7, 28, 22, 'wall');
    floorMap[22][7] = 'wallCorner';   floorMap[22][22] = 'wallCorner';
    floorMap[28][7] = 'wallCorner';   floorMap[28][22] = 'wallCorner';
    floorMap[25][7] = 'wallBroken';   floorMap[25][22] = 'wallAged';
    floorMap[28][12] = 'wallHole';    floorMap[28][17] = 'wallBroken';

    // Re-open Arena → Pit connection (addWalls overwrote the earlier opening)
    openTile(22, 13, 'stone'); openTile(22, 14, 'stone');
    openTile(22, 15, 'stone'); openTile(22, 16, 'stone');

    // Props — throne/altar at south end
    hellObj(27, 14, 'h_altar3');
    hellObj(27, 11, 'h_candelabra1');   hellObj(27, 18, 'h_candelabra3');
    hellObj(26, 9, 'h_stand1');         hellObj(26, 20, 'h_stand2');
    hellObj(23, 8, 'h_burnerCol1');     hellObj(23, 21, 'h_burnerCol2');
    hellObj(25, 12, 'h_skull1', false); hellObj(25, 17, 'h_skull2', false);
    hellObj(26, 14, 'h_bones1', false);

    // Boss exit stairs (south wall center)
    openTile(28, 14, 'stairs');
    openTile(28, 15, 'stairs');
}


// ============================================================
//  ZONE 6 — THRONE OF RUIN
//  The final zone. A massive ruined throne room — the ultimate
//  gauntlet before the game's end.
//  Uses dungeon tiles + hell props. Purple/dark lighting.
//
//  Layout: Ruin Gate (entry) → Bone Hall (wide corridor) →
//          Throne Arena (enormous final arena)
//  MAP_SIZE = 32
// ============================================================
function generateZone6() {

    // ===== RUIN GATE — entry chamber (rows 2-7, cols 12-19) =====
    // 6×8 foreboding antechamber
    fillFloor(2, 12, 7, 19, 'stoneTile');
    floorMap[2][13] = 'stoneInset';   floorMap[2][18] = 'stoneInset';
    floorMap[3][15] = 'stone';        floorMap[3][17] = 'stoneUneven';
    floorMap[4][12] = 'stoneUneven';  floorMap[4][16] = 'stoneMissing';
    floorMap[5][14] = 'stoneMissing'; floorMap[5][18] = 'stone';
    floorMap[6][13] = 'stone';        floorMap[6][17] = 'stoneInset';
    floorMap[7][15] = 'stoneUneven';  floorMap[7][19] = 'stoneMissing';

    // Walls
    addWalls(1, 11, 8, 20, 'wallAged');
    floorMap[1][11] = 'wallCorner';   floorMap[1][20] = 'wallCorner';
    floorMap[8][11] = 'wallCorner';   floorMap[8][20] = 'wallCorner';
    floorMap[1][14] = 'wallBroken';   floorMap[1][17] = 'wallHole';
    floorMap[4][11] = 'wallBroken';   floorMap[5][20] = 'wallBroken';

    // Entry stairs (north wall, 2 tiles)
    openTile(1, 15, 'wallArchway');
    openTile(1, 16, 'wallArchway');

    // South exit: 4-tile wide
    openTile(8, 14, 'stone'); openTile(8, 15, 'stone');
    openTile(8, 16, 'stone'); openTile(8, 17, 'stone');

    // Props
    hellObj(2, 12, 'h_burnerCol1');   hellObj(2, 19, 'h_burnerCol2');
    hellObj(5, 12, 'h_cage1');        hellObj(5, 19, 'h_cage2');
    hellObj(7, 12, 'h_candelabra1');  hellObj(7, 19, 'h_candelabra3');
    hellObj(3, 15, 'h_skull1', false);
    hellObj(6, 14, 'h_bones1', false);

    // ===== BONE HALL — wide passage (rows 8-11, cols 5-26) =====
    // 4×22 tiles — broad, ominous hall littered with remains
    fillFloor(8, 5, 11, 26, 'stone');
    floorMap[8][8] = 'stoneUneven';    floorMap[8][15] = 'stoneInset';
    floorMap[8][22] = 'stoneMissing';
    floorMap[9][6] = 'stone';          floorMap[9][12] = 'stoneMissing';
    floorMap[9][18] = 'stoneInset';    floorMap[9][24] = 'stoneUneven';
    floorMap[10][7] = 'stoneInset';    floorMap[10][14] = 'stoneUneven';
    floorMap[10][20] = 'stone';        floorMap[10][25] = 'stoneMissing';
    floorMap[11][9] = 'stoneMissing';  floorMap[11][16] = 'stone';
    floorMap[11][22] = 'stoneInset';

    // Side walls
    for (let r = 8; r <= 11; r++) {
        floorMap[r][4] = 'wall'; blocked[r][4] = true; blockType[r][4] = 'wall';
        floorMap[r][27] = 'wall'; blocked[r][27] = true; blockType[r][27] = 'wall';
    }

    // Hall props
    hellObj(9, 6, 'h_skull3', false);   hellObj(9, 25, 'h_skull4', false);
    hellObj(10, 10, 'h_bones2', false); hellObj(10, 21, 'h_bones3', false);
    hellObj(9, 14, 'h_rubble1', false); hellObj(10, 18, 'h_rubble1', false);

    // ===== THRONE ARENA — enormous final room (rows 12-27, cols 2-29) =====
    // 16×28 tiles = 448 tiles. The biggest arena in the game.
    fillFloor(12, 2, 27, 29, 'stoneTile');

    // Massive hand-placed floor variation
    // North section
    floorMap[12][4] = 'stone';        floorMap[12][9] = 'stoneInset';
    floorMap[12][14] = 'stoneUneven'; floorMap[12][19] = 'stone';
    floorMap[12][24] = 'stoneMissing'; floorMap[12][28] = 'stoneInset';
    floorMap[13][6] = 'stoneUneven';  floorMap[13][11] = 'stone';
    floorMap[13][16] = 'stoneInset';  floorMap[13][21] = 'stoneUneven';
    floorMap[13][26] = 'stone';
    floorMap[14][3] = 'stoneMissing'; floorMap[14][8] = 'stoneInset';
    floorMap[14][13] = 'stone';       floorMap[14][18] = 'stoneMissing';
    floorMap[14][23] = 'stoneInset';  floorMap[14][28] = 'stoneUneven';
    // Center band
    floorMap[15][5] = 'stone';        floorMap[15][10] = 'stoneUneven';
    floorMap[15][15] = 'stoneInset';  floorMap[15][20] = 'stone';
    floorMap[15][25] = 'stoneMissing';
    floorMap[16][3] = 'stoneInset';   floorMap[16][8] = 'stoneMissing';
    floorMap[16][13] = 'stoneUneven'; floorMap[16][18] = 'stone';
    floorMap[16][23] = 'stoneInset';  floorMap[16][28] = 'stone';
    floorMap[17][6] = 'stoneUneven';  floorMap[17][11] = 'stone';
    floorMap[17][16] = 'stoneMissing'; floorMap[17][21] = 'stoneInset';
    floorMap[17][26] = 'stoneUneven';
    floorMap[18][4] = 'stone';        floorMap[18][9] = 'stoneInset';
    floorMap[18][14] = 'stoneUneven'; floorMap[18][19] = 'stone';
    floorMap[18][24] = 'stoneMissing';
    floorMap[19][7] = 'stoneMissing'; floorMap[19][12] = 'stone';
    floorMap[19][17] = 'stoneInset';  floorMap[19][22] = 'stoneUneven';
    floorMap[19][27] = 'stone';
    // South section — more damaged near the throne
    floorMap[20][3] = 'stoneUneven';  floorMap[20][8] = 'stoneMissing';
    floorMap[20][13] = 'stoneInset';  floorMap[20][18] = 'stoneUneven';
    floorMap[20][23] = 'stone';       floorMap[20][28] = 'stoneMissing';
    floorMap[21][5] = 'stone';        floorMap[21][10] = 'stoneUneven';
    floorMap[21][15] = 'stoneMissing'; floorMap[21][20] = 'stone';
    floorMap[21][25] = 'stoneInset';
    floorMap[22][4] = 'stoneInset';   floorMap[22][9] = 'stone';
    floorMap[22][14] = 'stoneUneven'; floorMap[22][19] = 'stoneMissing';
    floorMap[22][24] = 'stone';       floorMap[22][29] = 'stoneUneven';
    floorMap[23][6] = 'stoneMissing'; floorMap[23][11] = 'stoneInset';
    floorMap[23][16] = 'stone';       floorMap[23][21] = 'stoneUneven';
    floorMap[23][26] = 'stoneMissing';
    floorMap[24][3] = 'stone';        floorMap[24][8] = 'stoneUneven';
    floorMap[24][13] = 'stoneMissing'; floorMap[24][18] = 'stoneInset';
    floorMap[24][23] = 'stoneUneven'; floorMap[24][28] = 'stone';
    floorMap[25][5] = 'stoneInset';   floorMap[25][10] = 'stone';
    floorMap[25][15] = 'stoneUneven'; floorMap[25][20] = 'stoneMissing';
    floorMap[25][25] = 'stone';
    floorMap[26][4] = 'stoneUneven';  floorMap[26][9] = 'stoneMissing';
    floorMap[26][14] = 'stone';       floorMap[26][19] = 'stoneInset';
    floorMap[26][24] = 'stoneUneven';
    floorMap[27][6] = 'stone';        floorMap[27][11] = 'stoneInset';
    floorMap[27][16] = 'stoneMissing'; floorMap[27][21] = 'stone';
    floorMap[27][26] = 'stoneInset';

    // Perimeter walls
    addWalls(11, 1, 28, 30, 'wall');
    floorMap[11][1] = 'wallCorner';  floorMap[11][30] = 'wallCorner';
    floorMap[28][1] = 'wallCorner';  floorMap[28][30] = 'wallCorner';
    // Wall variety — north
    floorMap[11][6] = 'wallBroken';  floorMap[11][11] = 'wallAged';
    floorMap[11][16] = 'wallHole';   floorMap[11][21] = 'wallBroken';
    floorMap[11][26] = 'wallAged';
    // Wall variety — south
    floorMap[28][6] = 'wallAged';    floorMap[28][11] = 'wallBroken';
    floorMap[28][16] = 'wallHole';   floorMap[28][21] = 'wallAged';
    floorMap[28][26] = 'wallBroken';
    // Wall variety — west/east
    floorMap[15][1] = 'wallBroken';  floorMap[19][1] = 'wallAged';
    floorMap[23][1] = 'wallBroken';
    floorMap[15][30] = 'wallAged';   floorMap[19][30] = 'wallBroken';
    floorMap[23][30] = 'wallAged';

    // North entrance (4-tile wide)
    openTile(11, 14, 'stone'); openTile(11, 15, 'stone');
    openTile(11, 16, 'stone'); openTile(11, 17, 'stone');

    // ---- STRATEGIC COVER — columns for the massive arena ----
    // Outer ring — 6 column pairs
    placeObj(14, 5, 'stoneColumn');    placeObj(14, 6, 'stoneColumnWood');   // NW
    placeObj(14, 25, 'stoneColumn');   placeObj(14, 26, 'stoneColumnWood');  // NE
    placeObj(19, 3, 'stoneColumn');    placeObj(19, 4, 'stoneColumnWood');   // W
    placeObj(19, 27, 'stoneColumn');   placeObj(19, 28, 'stoneColumnWood'); // E
    placeObj(24, 5, 'stoneColumn');    placeObj(24, 6, 'stoneColumnWood');   // SW
    placeObj(24, 25, 'stoneColumn');   placeObj(24, 26, 'stoneColumnWood');  // SE
    // Inner ring — 4 single columns
    placeObj(16, 11, 'stoneColumn');
    placeObj(16, 20, 'stoneColumn');
    placeObj(22, 11, 'stoneColumn');
    placeObj(22, 20, 'stoneColumn');

    // ---- HELL PROPS — atmosphere ----
    // West wall props
    hellObj(12, 2, 'h_burnerCol1');    hellObj(14, 2, 'h_cage1');
    hellObj(17, 2, 'h_candelabra1');   hellObj(20, 2, 'h_cage2');
    hellObj(23, 2, 'h_burnerCol2');    hellObj(26, 2, 'h_candelabra2');
    // East wall props
    hellObj(12, 29, 'h_burnerCol2');   hellObj(14, 29, 'h_cage2');
    hellObj(17, 29, 'h_candelabra3');  hellObj(20, 29, 'h_cage1');
    hellObj(23, 29, 'h_burnerCol1');   hellObj(26, 29, 'h_candelabra1');

    // Center ritual area — the Throne
    hellObj(25, 15, 'h_throne1');
    hellObj(25, 16, 'h_throne2');
    hellObj(26, 13, 'h_altar1');       hellObj(26, 18, 'h_altar2');
    hellObj(27, 12, 'h_candelabra1');  hellObj(27, 19, 'h_candelabra3');
    hellObj(27, 10, 'h_stand1');       hellObj(27, 21, 'h_stand2');
    hellObj(26, 15, 'h_pentagram', false);
    hellObj(26, 16, 'h_floorDecal', false);

    // Altars mid-arena flanking the center
    hellObj(18, 13, 'h_altarSm1');     hellObj(18, 18, 'h_altarSm2');

    // Wall decorations
    hellObj(12, 5, 'h_wallSword1', false);   hellObj(12, 9, 'h_wallShield1', false);
    hellObj(12, 22, 'h_wallSpear1', false);  hellObj(12, 26, 'h_wallSword2', false);
    hellObj(27, 5, 'h_pentaWall1', false);   hellObj(27, 9, 'h_wallSpear2', false);
    hellObj(27, 22, 'h_pentaWall2', false);  hellObj(27, 26, 'h_wallSword1', false);

    // Scattered floor atmosphere
    hellObj(13, 4, 'h_skull1', false);    hellObj(13, 27, 'h_skull2', false);
    hellObj(15, 8, 'h_bones1', false);    hellObj(15, 23, 'h_bones2', false);
    hellObj(16, 3, 'h_gore1', false);     hellObj(16, 28, 'h_gore2', false);
    hellObj(18, 6, 'h_bones3', false);    hellObj(18, 25, 'h_bones4', false);
    hellObj(20, 5, 'h_skull3', false);    hellObj(20, 26, 'h_skull4', false);
    hellObj(21, 8, 'h_rubble1', false);   hellObj(21, 23, 'h_rubble1', false);
    hellObj(23, 4, 'h_gore1', false);     hellObj(23, 27, 'h_gore2', false);
    hellObj(24, 9, 'h_skull5', false);    hellObj(24, 22, 'h_skull1', false);
    hellObj(26, 4, 'h_grave1', false);    hellObj(26, 27, 'h_grave2', false);

    // No boss exit door — this is the final zone.
    // Victory condition: clear all waves.
}

