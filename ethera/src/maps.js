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
    //  ZONE 1 — THE UNDERCROFT (28×28)
    //  Two-act structure with sealed east wall in Great Hall.
    //  Act 1: Cell → Guard Hall → Great Hall + Secret Alcove
    //  Act 2: Bone Gallery → Flooded Crypt → King's Hollow (boss)
    // ================================================================

    // ===== ROOM 1: THE CELL (rows 2-5, cols 2-6) =====
    fillFloor(2, 2, 5, 6, 'dirt');
    floorMap[2][2] = 'dirtTiles';  floorMap[2][5] = 'dirtTiles';
    floorMap[3][3] = 'planksBroken'; floorMap[3][4] = 'planksHole';
    floorMap[4][2] = 'dirtTiles';  floorMap[4][4] = 'planksBroken';
    floorMap[4][6] = 'dirtTiles';  floorMap[5][3] = 'dirtTiles';
    floorMap[5][5] = 'planks';

    addWalls(1, 1, 6, 7, 'wallAged');
    floorMap[1][1] = 'wallCorner'; floorMap[1][7] = 'wallCorner';
    floorMap[6][1] = 'wallCorner'; floorMap[6][7] = 'wallCorner';
    floorMap[1][3] = 'wallBroken';
    openTile(1, 4, 'wallArchway');
    openTile(1, 5, 'wallArchway');
    openTile(6, 3, 'wallDoorOpen');
    openTile(6, 4, 'dirt');
    openTile(6, 5, 'dirt');
    openTile(6, 6, 'dirt');

    placeObj(2, 2, 'woodenPile');
    placeObj(2, 6, 'barrel');
    placeObj(5, 6, 'woodenCrate');

    // ===== CORRIDOR 1 (rows 7-9, cols 3-6) =====
    fillFloor(7, 3, 9, 6, 'stone');
    floorMap[7][4] = 'stoneUneven'; floorMap[8][5] = 'stoneMissing';
    for (let r = 7; r <= 9; r++) {
        floorMap[r][2] = 'wall'; blocked[r][2] = true; blockType[r][2] = 'wall';
        floorMap[r][7] = 'wall'; blocked[r][7] = true; blockType[r][7] = 'wall';
    }

    // ===== ROOM 2: GUARD HALL (rows 10-16, cols 1-8) =====
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

    openTile(9, 3, 'stone'); openTile(9, 4, 'stone');
    openTile(9, 5, 'stone'); openTile(9, 6, 'stone');
    openTile(11, 9, 'stone'); openTile(12, 9, 'stone');
    openTile(13, 9, 'stone'); openTile(14, 9, 'stone');

    placeObj(10, 1, 'tableChairsBroken');
    placeObj(10, 8, 'barrels');
    placeObj(16, 1, 'woodenCrates');
    placeObj(16, 8, 'barrelsStacked');
    placeObj(13, 1, 'woodenCrate');

    // ===== CORRIDOR 2 (rows 11-14, cols 10-11) =====
    fillFloor(11, 10, 14, 11, 'stone');
    floorMap[11][10] = 'stoneUneven'; floorMap[13][11] = 'stoneMissing';
    floorMap[10][10] = 'wall'; blocked[10][10] = true; blockType[10][10] = 'wall';
    floorMap[10][11] = 'wall'; blocked[10][11] = true; blockType[10][11] = 'wall';
    floorMap[15][10] = 'wall'; blocked[15][10] = true; blockType[15][10] = 'wall';
    floorMap[15][11] = 'wall'; blocked[15][11] = true; blockType[15][11] = 'wall';

    // ===== ROOM 3: THE GREAT HALL (rows 8-20, cols 12-21) =====
    fillFloor(8, 12, 20, 21, 'stoneTile');
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

    // Great Hall walls — east wall at col 22 is the SEALED WALL
    addWalls(7, 11, 21, 22, 'wall');
    floorMap[7][11] = 'wallCorner';  floorMap[7][22] = 'wallCorner';
    floorMap[21][11] = 'wallCorner'; floorMap[21][22] = 'wallCorner';
    floorMap[7][13] = 'wallAged';   floorMap[7][15] = 'wallWindowBars';
    floorMap[7][18] = 'wallWindowBars'; floorMap[7][20] = 'wallBroken';
    floorMap[21][13] = 'wallBroken'; floorMap[21][15] = 'wallAged';
    floorMap[21][18] = 'wallArchway'; floorMap[21][20] = 'wallAged';

    openTile(11, 11, 'stone'); openTile(12, 11, 'stone');
    openTile(13, 11, 'stone'); openTile(14, 11, 'stone');

    placeObj(9, 14, 'stoneColumn');
    placeObj(9, 19, 'stoneColumn');
    placeObj(18, 14, 'stoneColumn');
    placeObj(18, 19, 'stoneColumn');

    placeObj(19, 21, 'chestClosed');
    openTile(20, 17, 'stairs');
    objectMap[20][17] = 'stairsSpiral';

    placeObj(8, 21, 'barrelsStacked');
    placeObj(8, 12, 'woodenCrate');
    placeObj(20, 21, 'barrel');
    placeObj(20, 12, 'woodenCrate');
    placeObj(17, 21, 'woodenSupportBeams');
    placeObj(14, 20, 'tableRoundChairs');

    // ===== SECRET ALCOVE (rows 2-6, cols 15-20) =====
    fillFloor(2, 15, 6, 20, 'stoneInset');
    floorMap[2][15] = 'stone';     floorMap[2][19] = 'stoneMissing';
    floorMap[4][17] = 'stoneUneven'; floorMap[5][16] = 'stone';
    floorMap[6][20] = 'stoneInset'; floorMap[3][20] = 'stoneMissing';

    addWalls(1, 14, 7, 21, 'wallAged');
    floorMap[1][14] = 'wallCorner'; floorMap[1][21] = 'wallCorner';
    floorMap[7][14] = 'wallCorner'; floorMap[7][21] = 'wallCorner';
    floorMap[1][17] = 'wallBroken'; floorMap[1][19] = 'wallHole';

    openTile(7, 16, 'stone'); openTile(7, 17, 'stone'); openTile(7, 18, 'stone');

    placeObj(3, 16, 'chestClosed');
    placeObj(5, 19, 'barrelsStacked');
    placeObj(4, 20, 'woodenCrates');
    placeObj(6, 16, 'stairsAged', false);
    placeObj(2, 20, 'barrel');
    placeObj(2, 15, 'woodenPile');

    // =============================================================
    //  ACT 2 ROOMS — sealed behind east wall of Great Hall (col 22)
    // =============================================================

    // ===== BONE GALLERY (rows 10-16, cols 23-27) =====
    // Narrow corridor with alcoves and skeletal remains
    fillFloor(10, 23, 16, 27, 'stoneUneven');
    floorMap[10][24] = 'stoneMissing'; floorMap[11][26] = 'stone';
    floorMap[12][23] = 'stoneMissing'; floorMap[13][25] = 'stoneUneven';
    floorMap[14][27] = 'stone';        floorMap[15][24] = 'stoneMissing';
    floorMap[16][26] = 'stoneUneven';

    addWalls(9, 22, 17, 27, 'wallAged');
    floorMap[9][22] = 'wallCorner';  floorMap[9][27] = 'wallCorner';
    floorMap[17][22] = 'wallCorner'; floorMap[17][27] = 'wallCorner';
    floorMap[9][25] = 'wallBroken';  floorMap[17][25] = 'wallAged';

    // Non-blocking bone props on floor
    placeObj(11, 24, 'woodenPile', false);
    placeObj(13, 26, 'barrel', false);
    placeObj(15, 23, 'woodenSupportBeams');
    placeObj(10, 27, 'stoneColumn');
    placeObj(16, 23, 'stoneColumn');

    // ===== FLOODED CRYPT (rows 2-11, cols 23-27) =====
    // Large Act 2 arena — water-damaged stone
    fillFloor(2, 23, 9, 27, 'dirtTiles');
    floorMap[2][24] = 'planksHole';  floorMap[3][26] = 'planksBroken';
    floorMap[4][23] = 'stoneMissing'; floorMap[5][25] = 'dirtTiles';
    floorMap[6][27] = 'planksHole';  floorMap[7][24] = 'planksBroken';
    floorMap[8][26] = 'stoneMissing'; floorMap[9][23] = 'dirtTiles';

    addWalls(1, 22, 10, 27, 'wallAged');
    floorMap[1][22] = 'wallCorner'; floorMap[1][27] = 'wallCorner';
    floorMap[10][22] = 'wallCorner'; floorMap[10][27] = 'wallCorner';
    floorMap[1][25] = 'wallBroken'; floorMap[1][24] = 'wallHole';

    // Connect Crypt south to Bone Gallery north (3 tiles)
    openTile(9, 24, 'stone'); openTile(9, 25, 'stone'); openTile(9, 26, 'stone');
    openTile(10, 24, 'stone'); openTile(10, 25, 'stone'); openTile(10, 26, 'stone');

    // Columns for cover — loose grid
    placeObj(4, 25, 'stoneColumn');
    placeObj(7, 23, 'stoneColumnWood');
    placeObj(7, 27, 'stoneColumn');
    placeObj(3, 23, 'stoneColumn');

    // Atmospheric props
    placeObj(2, 27, 'barrelsStacked');
    placeObj(8, 27, 'woodenCrates');
    placeObj(5, 23, 'woodenPile');

    // ===== KING'S HOLLOW (rows 17-22, cols 23-27) =====
    // Boss arena — Slime King fight, tighter space
    fillFloor(17, 23, 22, 27, 'stoneTile');
    floorMap[17][24] = 'stoneInset'; floorMap[18][26] = 'stone';
    floorMap[19][23] = 'stoneUneven'; floorMap[20][25] = 'stoneInset';
    floorMap[21][27] = 'stone';      floorMap[22][24] = 'stoneUneven';

    addWalls(16, 22, 23, 27, 'wall');
    floorMap[16][22] = 'wallCorner'; floorMap[16][27] = 'wallCorner';
    floorMap[23][22] = 'wallCorner'; floorMap[23][27] = 'wallCorner';
    floorMap[23][25] = 'wallAged';   floorMap[16][25] = 'wallBroken';

    // Connect Hollow north to Bone Gallery south (3 tiles)
    openTile(17, 24, 'stone'); openTile(17, 25, 'stone'); openTile(17, 26, 'stone');
    openTile(16, 24, 'stoneTile'); openTile(16, 25, 'stoneTile'); openTile(16, 26, 'stoneTile');

    // Ritual circle (decorative)
    placeObj(20, 25, 'stairsAged', false);  // repurposed as ritual circle visual
    placeObj(18, 23, 'stoneColumn');
    placeObj(18, 27, 'stoneColumn');
    placeObj(22, 23, 'barrel');
    placeObj(22, 27, 'woodenCrate');

    // ===== SEAL DATA — sealed wall tiles at col 22, rows 10-18 =====
    // These wall tiles block entry to Act 2; expandZone() removes them
    const z1SealTiles = [];
    for (let r = 10; r <= 18; r++) {
        z1SealTiles.push({ r: r, c: 22 });
    }
    zoneSealData[1] = {
        sealTiles: z1SealTiles,
        rubbleTiles: [
            { r: 10, c: 22, obj: 'woodenPile' },
            { r: 14, c: 22, obj: 'woodenPile' },
            { r: 18, c: 22, obj: 'woodenPile' },
        ],
        chestTile: { r: 13, c: 23 },
    };
}

// ===== ZONE 2: RUINED TOWER =====
// Bigger dungeon with 5 major rooms and more complex layout (MAP_SIZE = 30)
function generateZone2() {
    // ================================================================
    //  ZONE 2 — RUINED TOWER (34×34)
    //  Two-act structure. Sealed west wall in Barracks opens to
    //  Collapsed Floor + Bell Tower. Boss in Throne Antechamber.
    // ================================================================

    if (floorMap.length !== MAP_SIZE || floorMap[0].length !== MAP_SIZE) {
        console.error('Zone 2: map arrays not reinitialized! Expected MAP_SIZE=' + MAP_SIZE + ' but got ' + floorMap.length);
        return;
    }

    // ===== ROOM 1: VESTIBULE (rows 2-6, cols 20-26) =====
    fillFloor(2, 20, 6, 26, 'stoneTile');
    floorMap[2][21] = 'stone';     floorMap[3][23] = 'stoneUneven';
    floorMap[4][25] = 'stoneMissing'; floorMap[5][22] = 'stoneInset';
    floorMap[6][26] = 'stone';

    addWalls(1, 19, 7, 27, 'wall');
    floorMap[1][19] = 'wallCorner'; floorMap[1][27] = 'wallCorner';
    floorMap[7][19] = 'wallCorner'; floorMap[7][27] = 'wallCorner';
    floorMap[1][23] = 'wallArchway';

    placeObj(2, 21, 'stoneColumn');
    placeObj(2, 25, 'stoneColumn');

    // South exit to Corridor
    openTile(7, 22, 'stone'); openTile(7, 23, 'stone'); openTile(7, 24, 'stone');

    // ===== CORRIDOR (rows 7-9, cols 21-25) =====
    fillFloor(7, 21, 9, 25, 'stone');
    floorMap[8][22] = 'stoneUneven'; floorMap[8][24] = 'stoneMissing';

    // ===== ROOM 2: RUINED ARMORY (rows 10-19, cols 18-30) =====
    fillFloor(10, 18, 19, 30, 'stone');
    floorMap[11][20] = 'stoneUneven'; floorMap[12][23] = 'stoneMissing';
    floorMap[13][26] = 'stoneInset'; floorMap[14][19] = 'stone';
    floorMap[15][28] = 'stoneMissing'; floorMap[16][22] = 'stoneUneven';
    floorMap[17][25] = 'stoneInset'; floorMap[18][29] = 'stone';

    addWalls(9, 17, 20, 31, 'wallAged');
    floorMap[9][17] = 'wallCorner';  floorMap[9][31] = 'wallCorner';
    floorMap[20][17] = 'wallCorner'; floorMap[20][31] = 'wallCorner';
    floorMap[9][23] = 'wallBroken';  floorMap[9][27] = 'wallHole';
    floorMap[20][21] = 'wallAged';   floorMap[20][26] = 'wallBroken';

    // Connect corridor to armory (3 tiles)
    openTile(9, 22, 'stone'); openTile(9, 23, 'stone'); openTile(9, 24, 'stone');

    placeObj(11, 19, 'woodenCrates');
    placeObj(11, 29, 'barrelsStacked');
    placeObj(14, 22, 'tableShort');
    placeObj(16, 30, 'woodenPile');
    placeObj(18, 20, 'barrel');
    placeObj(13, 18, 'stoneColumnWood');
    placeObj(12, 27, 'tableChairsBroken');
    placeObj(19, 18, 'chestClosed');

    // ===== ROOM 3: GUARD BARRACKS (rows 21-30, cols 20-32) =====
    fillFloor(21, 20, 30, 32, 'stoneTile');
    floorMap[22][22] = 'stoneUneven'; floorMap[23][26] = 'stoneMissing';
    floorMap[25][21] = 'stone';      floorMap[26][28] = 'stoneInset';
    floorMap[28][24] = 'stone';      floorMap[29][30] = 'stoneUneven';

    addWalls(20, 19, 31, 33, 'wall');
    floorMap[20][19] = 'wallCorner'; floorMap[20][33] = 'wallCorner';
    floorMap[31][19] = 'wallCorner'; floorMap[31][33] = 'wallCorner';
    floorMap[20][25] = 'wallBroken'; floorMap[31][26] = 'wallAged';
    floorMap[31][30] = 'wallBroken';

    // Connect armory south to barracks north (3 tiles)
    openTile(20, 23, 'stone'); openTile(20, 24, 'stone'); openTile(20, 25, 'stone');

    placeObj(22, 21, 'chair');       placeObj(22, 26, 'chair');
    placeObj(24, 23, 'tableRoundChairs');
    placeObj(25, 31, 'barrelsStacked');
    placeObj(27, 20, 'barrel');
    placeObj(29, 28, 'woodenCrate');
    placeObj(23, 32, 'stoneColumn');
    placeObj(28, 32, 'stoneColumn');

    // ===== SEALED WALL — west wall of Barracks (col 19, rows 23-28) =====
    // Already wall tiles from addWalls; these get removed on expansion.

    // =============================================================
    //  ACT 2 ROOMS — sealed behind west wall of Barracks
    // =============================================================

    // ===== COLLAPSED FLOOR (rows 14-27, cols 2-16) =====
    fillFloor(14, 2, 27, 16, 'stone');
    floorMap[15][4] = 'stoneMissing';  floorMap[16][8] = 'stoneUneven';
    floorMap[17][12] = 'stoneMissing'; floorMap[18][6] = 'stoneInset';
    floorMap[19][10] = 'stoneUneven';  floorMap[20][3] = 'stoneMissing';
    floorMap[21][14] = 'stone';        floorMap[22][7] = 'stoneUneven';
    floorMap[23][11] = 'stoneMissing'; floorMap[24][5] = 'stoneInset';
    floorMap[25][9] = 'stone';         floorMap[26][15] = 'stoneUneven';

    addWalls(13, 1, 28, 17, 'wallAged');
    floorMap[13][1] = 'wallCorner';  floorMap[13][17] = 'wallCorner';
    floorMap[28][1] = 'wallCorner';  floorMap[28][17] = 'wallCorner';
    floorMap[13][6] = 'wallBroken';  floorMap[13][12] = 'wallHole';
    floorMap[28][5] = 'wallAged';    floorMap[28][10] = 'wallBroken';

    // Connect Collapsed Floor east to Barracks west (4 tiles at col 17-19)
    // Passage carved through sealed wall area
    fillFloor(23, 17, 28, 19, 'stone');
    openTile(23, 17, 'stone'); openTile(24, 17, 'stone');
    openTile(25, 17, 'stone'); openTile(26, 17, 'stone');

    // Broken support beams scattered
    placeObj(15, 3, 'woodenSupportBeams');
    placeObj(18, 15, 'woodenSupportBeams');
    placeObj(22, 4, 'woodenSupportBeams');
    placeObj(25, 13, 'woodenSupportBeams');
    // Columns for cover
    placeObj(17, 6, 'stoneColumn');
    placeObj(17, 12, 'stoneColumn');
    placeObj(21, 4, 'stoneColumnWood');
    placeObj(21, 10, 'stoneColumn');
    placeObj(25, 7, 'stoneColumn');
    // Edge props
    placeObj(14, 2, 'woodenCrates');
    placeObj(14, 16, 'barrelsStacked');
    placeObj(27, 2, 'barrel');
    placeObj(27, 16, 'woodenPile');

    // ===== BELL TOWER (rows 4-12, cols 4-12) =====
    fillFloor(4, 4, 12, 12, 'stoneTile');
    floorMap[5][6] = 'stoneInset';   floorMap[6][9] = 'stoneUneven';
    floorMap[7][5] = 'stone';        floorMap[8][11] = 'stoneMissing';
    floorMap[9][7] = 'stoneInset';   floorMap[10][10] = 'stone';
    floorMap[11][6] = 'stoneUneven';

    addWalls(3, 3, 13, 13, 'wall');
    floorMap[3][3] = 'wallCorner';  floorMap[3][13] = 'wallCorner';
    floorMap[13][3] = 'wallCorner'; floorMap[13][13] = 'wallCorner';
    floorMap[3][7] = 'wallWindowBars'; floorMap[3][10] = 'wallWindowBars';
    floorMap[13][8] = 'wallAged';

    // Connect Bell Tower south to Collapsed Floor north (3 tiles)
    openTile(13, 7, 'stone'); openTile(13, 8, 'stone'); openTile(13, 9, 'stone');

    // Large bell (decorative prop in center)
    placeObj(8, 8, 'barrelsStacked');  // repurposed as bell visual
    placeObj(5, 5, 'stoneColumn');
    placeObj(5, 11, 'stoneColumn');
    placeObj(11, 5, 'stoneColumn');
    placeObj(11, 11, 'stoneColumn');
    placeObj(4, 4, 'woodenCrate');
    placeObj(4, 12, 'barrel');

    // ===== THRONE ANTECHAMBER — boss arena (rows 29-33, cols 8-22) =====
    fillFloor(29, 8, 33, 22, 'stoneTile');
    floorMap[29][10] = 'stoneInset';  floorMap[30][14] = 'stone';
    floorMap[30][20] = 'stoneUneven'; floorMap[31][12] = 'stoneMissing';
    floorMap[31][18] = 'stoneInset'; floorMap[32][9] = 'stone';
    floorMap[32][21] = 'stoneUneven'; floorMap[33][15] = 'stoneInset';

    addWalls(28, 7, 33, 23, 'wall');
    floorMap[28][7] = 'wallCorner';  floorMap[28][23] = 'wallCorner';
    floorMap[33][7] = 'wallCorner';  floorMap[33][23] = 'wallCorner';
    floorMap[28][14] = 'wallArchway'; floorMap[33][15] = 'wallAged';

    // Connect Collapsed Floor south to Throne north (3 tiles)
    openTile(28, 11, 'stone'); openTile(28, 12, 'stone'); openTile(28, 13, 'stone');

    // Majestic columns
    placeObj(30, 10, 'stoneColumn');
    placeObj(30, 20, 'stoneColumn');
    placeObj(32, 10, 'stoneColumnWood');
    placeObj(32, 20, 'stoneColumnWood');

    placeObj(31, 15, 'chestClosed');  // zone 2 key chest

    // Exit stairs
    openTile(33, 15, 'stairs');
    objectMap[33][15] = 'stairsSpiral';

    // ===== SEAL DATA — west wall of Barracks (col 19, rows 23-28) =====
    const z2SealTiles = [];
    for (let r = 23; r <= 28; r++) {
        z2SealTiles.push({ r: r, c: 19 });
    }
    zoneSealData[2] = {
        sealTiles: z2SealTiles,
        rubbleTiles: [
            { r: 24, c: 19, obj: 'woodenPile' },
            { r: 27, c: 19, obj: 'woodenPile' },
        ],
        chestTile: { r: 25, c: 17 },
    };
}

// ============================================================
//  ZONE 3 — THE SPIRE (30×30)
//  Complete two-act overhaul. Skeleton → Wizard transition zone.
//  Act 1: Landing → Garrison Hall → Observatory
//  Act 2: Spiral Ascent → The Apex (boss: Werewolf)
// ============================================================
function generateZone3() {
    // ===== ROOM 1: WIND-SCARRED LANDING (rows 2-6, cols 2-8) =====
    fillFloor(2, 2, 6, 8, 'stoneTile');
    floorMap[2][3] = 'stoneInset';   floorMap[2][7] = 'stoneInset';
    floorMap[3][4] = 'stone';        floorMap[3][6] = 'stoneUneven';
    floorMap[4][2] = 'stoneUneven';  floorMap[4][5] = 'stoneInset';
    floorMap[4][8] = 'stone';
    floorMap[5][3] = 'stone';        floorMap[5][7] = 'stoneMissing';

    addWalls(1, 1, 7, 9, 'wallAged');
    floorMap[1][1] = 'wallCorner';   floorMap[1][9] = 'wallCorner';
    floorMap[7][1] = 'wallCorner';   floorMap[7][9] = 'wallCorner';
    floorMap[1][3] = 'wallWindowBars'; floorMap[1][5] = 'wallWindowBars';
    floorMap[1][7] = 'wallWindowBars';
    floorMap[3][1] = 'wallBroken';

    openTile(1, 4, 'wallArchway');
    openTile(1, 5, 'wallArchway');

    placeObj(2, 2, 'stoneColumn');
    placeObj(2, 8, 'stoneColumn');
    placeObj(5, 2, 'barrel');
    placeObj(5, 8, 'woodenCrate');

    // South exit to corridor
    openTile(7, 4, 'stone'); openTile(7, 5, 'stone'); openTile(7, 6, 'stone');

    // ===== CORRIDOR (rows 7-9, cols 4-8) =====
    fillFloor(7, 4, 9, 8, 'stone');
    floorMap[7][5] = 'stoneUneven'; floorMap[8][7] = 'stoneMissing';

    // ===== ROOM 2: GARRISON HALL (rows 10-19, cols 2-13) — 10×12 arena =====
    fillFloor(10, 2, 19, 13, 'stoneTile');
    floorMap[10][4] = 'stone';       floorMap[11][7] = 'stoneUneven';
    floorMap[11][11] = 'stoneInset'; floorMap[12][3] = 'stoneUneven';
    floorMap[12][9] = 'stoneMissing'; floorMap[13][6] = 'stone';
    floorMap[14][12] = 'stoneInset'; floorMap[15][4] = 'stoneMissing';
    floorMap[15][10] = 'stone';      floorMap[16][7] = 'stoneUneven';
    floorMap[17][3] = 'stone';       floorMap[17][11] = 'stoneInset';
    floorMap[18][8] = 'stoneMissing'; floorMap[19][5] = 'stone';

    addWalls(9, 1, 20, 14, 'wall');
    floorMap[9][1] = 'wallCorner';   floorMap[9][14] = 'wallCorner';
    floorMap[20][1] = 'wallCorner';  floorMap[20][14] = 'wallCorner';
    floorMap[9][5] = 'wallWindowBars'; floorMap[9][9] = 'wallWindowBars';
    floorMap[20][4] = 'wallAged';    floorMap[20][8] = 'wallBroken';
    floorMap[20][12] = 'wallAged';
    floorMap[13][1] = 'wallWindowBars'; floorMap[17][1] = 'wallWindowBars';

    // North entrance from corridor (3 tiles)
    openTile(9, 5, 'stone'); openTile(9, 6, 'stone'); openTile(9, 7, 'stone');

    // Columns at edges
    placeObj(11, 3, 'stoneColumn');
    placeObj(11, 12, 'stoneColumn');
    placeObj(18, 3, 'stoneColumn');
    placeObj(18, 12, 'stoneColumn');

    // Props along walls
    placeObj(10, 2, 'tableChairsBroken');
    placeObj(10, 13, 'woodenCrates');
    placeObj(19, 2, 'barrelsStacked');
    placeObj(19, 13, 'barrel');
    placeObj(15, 2, 'woodenCrate');

    // ===== ROOM 3: THE OBSERVATORY (rows 21-26, cols 6-13) =====
    fillFloor(21, 6, 26, 13, 'stoneInset');
    floorMap[21][7] = 'stone';       floorMap[22][10] = 'stoneUneven';
    floorMap[23][8] = 'stoneMissing'; floorMap[24][12] = 'stone';
    floorMap[25][9] = 'stoneInset';  floorMap[26][7] = 'stoneUneven';

    addWalls(20, 5, 27, 14, 'wallAged');
    floorMap[20][5] = 'wallCorner';  floorMap[20][14] = 'wallCorner';
    floorMap[27][5] = 'wallCorner';  floorMap[27][14] = 'wallCorner';
    floorMap[20][8] = 'wallWindowBars'; floorMap[20][11] = 'wallWindowBars';
    floorMap[27][9] = 'wallAged';

    // North entrance from Garrison (3 tiles)
    openTile(20, 8, 'stone'); openTile(20, 9, 'stone'); openTile(20, 10, 'stone');

    placeObj(22, 6, 'stairsAged', false);  // telescope visual
    placeObj(24, 6, 'stoneColumn');
    placeObj(24, 13, 'stoneColumn');
    placeObj(26, 6, 'woodenCrate');
    placeObj(26, 13, 'barrel');

    // ===== SEALED WALL — east wall (col 14, rows 15-20) =====
    // Already wall from Garrison/Observatory addWalls. Stored for expansion.

    // =============================================================
    //  ACT 2 ROOMS — sealed behind east side
    // =============================================================

    // ===== SPIRAL ASCENT (rows 15-22, cols 17-21) — narrow L-shape =====
    // Vertical segment
    fillFloor(15, 17, 22, 21, 'stone');
    floorMap[16][18] = 'stoneUneven'; floorMap[17][20] = 'stoneMissing';
    floorMap[19][18] = 'stone';       floorMap[20][20] = 'stoneUneven';
    floorMap[22][19] = 'stoneMissing';

    addWalls(14, 16, 23, 22, 'wallAged');
    floorMap[14][16] = 'wallCorner'; floorMap[14][22] = 'wallCorner';
    floorMap[23][16] = 'wallCorner'; floorMap[23][22] = 'wallCorner';
    floorMap[14][19] = 'wallBroken';

    // Horizontal connector from sealed area to Spiral Ascent
    fillFloor(15, 14, 20, 16, 'stone');
    openTile(15, 16, 'stone'); openTile(16, 16, 'stone');
    openTile(17, 16, 'stone'); openTile(18, 16, 'stone');
    openTile(19, 16, 'stone'); openTile(20, 16, 'stone');

    placeObj(16, 17, 'stoneColumn');
    placeObj(21, 21, 'barrel');
    placeObj(15, 21, 'woodenCrate');

    // ===== THE APEX — boss arena (rows 2-12, cols 16-26) — 11×11 =====
    fillFloor(2, 16, 12, 26, 'stoneTile');
    floorMap[3][18] = 'stoneInset';  floorMap[3][24] = 'stone';
    floorMap[4][20] = 'stoneUneven'; floorMap[5][16] = 'stone';
    floorMap[5][22] = 'stoneMissing'; floorMap[6][19] = 'stoneInset';
    floorMap[7][25] = 'stone';       floorMap[8][17] = 'stoneUneven';
    floorMap[8][23] = 'stoneInset';  floorMap[9][20] = 'stone';
    floorMap[10][18] = 'stoneMissing'; floorMap[11][24] = 'stoneUneven';
    floorMap[12][21] = 'stoneInset';

    addWalls(1, 15, 13, 27, 'wall');
    floorMap[1][15] = 'wallCorner';  floorMap[1][27] = 'wallCorner';
    floorMap[13][15] = 'wallCorner'; floorMap[13][27] = 'wallCorner';
    // Windows everywhere — sky view
    floorMap[1][18] = 'wallWindowBars'; floorMap[1][21] = 'wallWindowBars';
    floorMap[1][24] = 'wallWindowBars';
    floorMap[13][18] = 'wallWindowBars'; floorMap[13][21] = 'wallWindowBars';
    floorMap[13][24] = 'wallWindowBars';
    floorMap[5][15] = 'wallWindowBars'; floorMap[9][15] = 'wallWindowBars';
    floorMap[5][27] = 'wallWindowBars'; floorMap[9][27] = 'wallWindowBars';

    // Connect Apex south to Spiral Ascent north (3 tiles)
    openTile(13, 19, 'stone'); openTile(13, 20, 'stone'); openTile(13, 21, 'stone');
    // Also open the ascent north wall
    openTile(14, 19, 'stone'); openTile(14, 20, 'stone'); openTile(14, 21, 'stone');

    // Diamond pattern columns
    placeObj(4, 19, 'stoneColumn');
    placeObj(4, 23, 'stoneColumn');
    placeObj(7, 17, 'stoneColumn');
    placeObj(7, 25, 'stoneColumn');
    placeObj(10, 19, 'stoneColumn');
    placeObj(10, 23, 'stoneColumn');

    // Central raised platform hint (different floor tile)
    floorMap[6][21] = 'stoneInset'; floorMap[7][21] = 'stoneInset';
    floorMap[8][21] = 'stoneInset';

    // Edge props
    placeObj(2, 16, 'barrelsStacked');
    placeObj(2, 26, 'woodenCrates');
    placeObj(12, 16, 'barrel');
    placeObj(12, 26, 'woodenCrate');

    // Exit stairs at south wall of Apex
    openTile(13, 22, 'stairs');
    objectMap[13][22] = 'stairsSpiral';

    // ===== SEAL DATA — east wall tiles (col 14, rows 15-20) =====
    const z3SealTiles = [];
    for (let r = 15; r <= 20; r++) {
        z3SealTiles.push({ r: r, c: 14 });
    }
    zoneSealData[3] = {
        sealTiles: z3SealTiles,
        rubbleTiles: [
            { r: 16, c: 14, obj: 'woodenPile' },
            { r: 19, c: 14, obj: 'woodenPile' },
        ],
        chestTile: { r: 17, c: 15 },
    };
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
    //  ZONE 4 — THE INFERNO (32×32)
    //  Two-act: Maw → Crucible (Act 1) | Sacrificial Pits → Knight's Forge (Act 2)
    //  Sealed iron gate on Crucible's east wall.
    // ================================================================

    // ===== THE MAW — entry (rows 2-7, cols 9-18) =====
    fillFloor(2, 9, 7, 18, 'stoneTile');
    floorMap[2][10] = 'stoneInset';   floorMap[2][17] = 'stoneInset';
    floorMap[3][12] = 'stone';        floorMap[3][15] = 'stoneUneven';
    floorMap[4][9] = 'stoneUneven';   floorMap[4][14] = 'stoneMissing';
    floorMap[5][11] = 'stoneMissing'; floorMap[5][16] = 'stoneInset';
    floorMap[6][10] = 'stone';        floorMap[6][13] = 'stoneUneven';
    floorMap[7][12] = 'stoneInset';   floorMap[7][15] = 'stone';

    addWalls(1, 8, 8, 19, 'wallAged');
    floorMap[1][8] = 'wallCorner';   floorMap[1][19] = 'wallCorner';
    floorMap[8][8] = 'wallCorner';   floorMap[8][19] = 'wallCorner';
    floorMap[1][12] = 'wallBroken';  floorMap[1][15] = 'wallHole';

    openTile(1, 13, 'wallArchway');
    openTile(1, 14, 'wallArchway');
    openTile(8, 12, 'stone'); openTile(8, 13, 'stone');
    openTile(8, 14, 'stone'); openTile(8, 15, 'stone');

    hellObj(2, 9, 'h_burnerCol1');    hellObj(2, 18, 'h_burnerCol2');
    hellObj(4, 9, 'h_cage1');         hellObj(4, 18, 'h_cage2');
    hellObj(7, 9, 'h_candelabra1');   hellObj(7, 18, 'h_candelabra3');
    hellObj(3, 13, 'h_skull1', false);
    hellObj(5, 11, 'h_bones1', false);

    // ===== THE DESCENT (rows 8-10, cols 6-19) =====
    fillFloor(8, 6, 10, 19, 'stone');
    floorMap[8][8] = 'stoneUneven';   floorMap[9][12] = 'stoneInset';
    floorMap[10][7] = 'stoneMissing'; floorMap[10][16] = 'stoneUneven';
    for (let r = 8; r <= 10; r++) {
        floorMap[r][5] = 'wall'; blocked[r][5] = true; blockType[r][5] = 'wall';
        floorMap[r][20] = 'wall'; blocked[r][20] = true; blockType[r][20] = 'wall';
    }
    hellObj(9, 6, 'h_skull3', false);
    hellObj(9, 19, 'h_bones4', false);

    // ===== THE CRUCIBLE — Act 1 arena (rows 11-22, cols 3-18) — 12×16 =====
    fillFloor(11, 3, 22, 18, 'stoneTile');
    floorMap[11][5] = 'stone';        floorMap[11][10] = 'stoneInset';
    floorMap[12][7] = 'stoneUneven';  floorMap[12][14] = 'stone';
    floorMap[13][4] = 'stoneMissing'; floorMap[13][11] = 'stoneInset';
    floorMap[14][8] = 'stone';        floorMap[14][16] = 'stoneUneven';
    floorMap[15][5] = 'stoneInset';   floorMap[15][13] = 'stoneMissing';
    floorMap[16][9] = 'stone';        floorMap[16][17] = 'stoneInset';
    floorMap[17][6] = 'stoneUneven';  floorMap[17][12] = 'stone';
    floorMap[18][4] = 'stone';        floorMap[18][15] = 'stoneMissing';
    floorMap[19][8] = 'stoneInset';   floorMap[19][14] = 'stoneUneven';
    floorMap[20][5] = 'stoneMissing'; floorMap[20][11] = 'stone';
    floorMap[21][7] = 'stone';        floorMap[21][16] = 'stoneInset';
    floorMap[22][4] = 'stoneUneven';  floorMap[22][13] = 'stone';

    addWalls(10, 2, 23, 19, 'wall');
    floorMap[10][2] = 'wallCorner';  floorMap[10][19] = 'wallCorner';
    floorMap[23][2] = 'wallCorner';  floorMap[23][19] = 'wallCorner';
    floorMap[10][7] = 'wallBroken';  floorMap[10][13] = 'wallAged';
    floorMap[23][6] = 'wallBroken';  floorMap[23][12] = 'wallAged';

    // North entrance from Descent (4 tiles)
    openTile(10, 10, 'stone'); openTile(10, 11, 'stone');
    openTile(10, 12, 'stone'); openTile(10, 13, 'stone');

    // Columns for cover
    placeObj(13, 5, 'stoneColumn');   placeObj(13, 16, 'stoneColumn');
    placeObj(17, 5, 'stoneColumn');   placeObj(17, 16, 'stoneColumn');
    placeObj(20, 9, 'stoneColumn');   placeObj(20, 12, 'stoneColumn');

    // Hell props
    hellObj(14, 10, 'h_pentagram', false);
    hellObj(16, 9, 'h_altar1');      hellObj(16, 12, 'h_altar2');
    hellObj(11, 3, 'h_burnerCol1');  hellObj(11, 18, 'h_burnerCol2');
    hellObj(14, 3, 'h_cage1');       hellObj(14, 18, 'h_cage2');
    hellObj(19, 3, 'h_candelabra1'); hellObj(19, 18, 'h_candelabra3');
    hellObj(22, 3, 'h_burnerCol2');  hellObj(22, 18, 'h_burnerCol1');
    hellObj(12, 7, 'h_skull1', false); hellObj(15, 15, 'h_bones1', false);
    hellObj(18, 6, 'h_gore1', false);  hellObj(21, 14, 'h_skull3', false);

    // ===== EMBER ALCOVE (rows 24-27, cols 8-14) =====
    fillFloor(24, 8, 27, 14, 'stone');
    floorMap[25][10] = 'stoneUneven'; floorMap[26][12] = 'stoneMissing';
    addWalls(23, 7, 28, 15, 'wallAged');
    floorMap[23][7] = 'wallCorner';  floorMap[23][15] = 'wallCorner';
    floorMap[28][7] = 'wallCorner';  floorMap[28][15] = 'wallCorner';
    openTile(23, 10, 'stone'); openTile(23, 11, 'stone'); openTile(23, 12, 'stone');
    hellObj(25, 8, 'h_candelabra2'); hellObj(27, 14, 'h_stand1');

    // =============================================================
    //  ACT 2 — sealed behind east wall of Crucible (col 19, rows 13-19)
    // =============================================================

    // ===== SACRIFICIAL PITS (rows 9-20, cols 20-31) — 12×12 =====
    fillFloor(9, 20, 20, 31, 'stoneTile');
    floorMap[10][22] = 'stoneUneven'; floorMap[11][26] = 'stoneMissing';
    floorMap[12][24] = 'stoneInset';  floorMap[13][28] = 'stone';
    floorMap[14][21] = 'stoneMissing'; floorMap[15][25] = 'stoneUneven';
    floorMap[16][29] = 'stone';       floorMap[17][23] = 'stoneInset';
    floorMap[18][27] = 'stoneMissing'; floorMap[19][22] = 'stone';

    addWalls(8, 19, 21, 31, 'wall');
    floorMap[8][19] = 'wallCorner';  floorMap[8][31] = 'wallCorner';
    floorMap[21][19] = 'wallCorner'; floorMap[21][31] = 'wallCorner';
    floorMap[8][24] = 'wallBroken';  floorMap[8][28] = 'wallHole';

    // Columns create lanes
    placeObj(11, 23, 'stoneColumn');  placeObj(11, 28, 'stoneColumn');
    placeObj(15, 21, 'stoneColumn');  placeObj(15, 26, 'stoneColumn');
    placeObj(15, 31, 'stoneColumn');
    placeObj(19, 23, 'stoneColumn');  placeObj(19, 28, 'stoneColumn');

    // Hell props
    hellObj(10, 20, 'h_burnerCol1'); hellObj(10, 31, 'h_burnerCol2');
    hellObj(14, 20, 'h_cage1');      hellObj(14, 31, 'h_cage2');
    hellObj(18, 20, 'h_candelabra1'); hellObj(18, 31, 'h_candelabra3');
    hellObj(13, 25, 'h_pentagram', false);
    hellObj(16, 24, 'h_altar1');     hellObj(16, 27, 'h_altar2');
    hellObj(12, 22, 'h_gore1', false); hellObj(17, 30, 'h_skull1', false);

    // ===== KNIGHT'S FORGE — boss arena (rows 23-30, cols 22-31) — 8×10 =====
    fillFloor(23, 22, 30, 31, 'stoneTile');
    floorMap[24][24] = 'stoneInset';  floorMap[25][28] = 'stone';
    floorMap[26][23] = 'stoneUneven'; floorMap[27][27] = 'stoneMissing';
    floorMap[28][25] = 'stoneInset';  floorMap[29][30] = 'stone';

    addWalls(22, 21, 31, 31, 'wall');
    floorMap[22][21] = 'wallCorner'; floorMap[22][31] = 'wallCorner';
    floorMap[31][21] = 'wallCorner'; floorMap[31][31] = 'wallCorner';
    floorMap[31][26] = 'wallAged';

    // Connect Pits south to Forge north (3 tiles)
    openTile(21, 25, 'stone'); openTile(21, 26, 'stone'); openTile(21, 27, 'stone');
    openTile(22, 25, 'stone'); openTile(22, 26, 'stone'); openTile(22, 27, 'stone');

    placeObj(24, 22, 'stoneColumn'); placeObj(24, 31, 'stoneColumn');
    placeObj(29, 22, 'stoneColumn'); placeObj(29, 31, 'stoneColumn');
    hellObj(29, 26, 'h_throne1');    hellObj(29, 27, 'h_throne2');
    hellObj(30, 24, 'h_altar1');     hellObj(30, 29, 'h_altar2');
    hellObj(25, 23, 'h_skull1', false); hellObj(28, 30, 'h_bones2', false);

    // Boss exit stairs
    openTile(31, 26, 'stairs');
    openTile(31, 27, 'stairs');

    // ===== SEAL DATA — east wall of Crucible (col 19, rows 13-19) =====
    const z4SealTiles = [];
    for (let r = 13; r <= 19; r++) {
        z4SealTiles.push({ r: r, c: 19 });
    }
    zoneSealData[4] = {
        sealTiles: z4SealTiles,
        rubbleTiles: [
            { r: 14, c: 19, obj: 'h_rubble1' },
            { r: 17, c: 19, obj: 'h_rubble2' },
        ],
        chestTile: { r: 16, c: 20 },
    };
}


// ============================================================
//  ZONE 5 — THE FROZEN ABYSS (34×34)
//  Two-act: Frost Gate → Frozen Gallery (Act 1) |
//  The Hollow → Wyrm's Nest (Act 2)
// ============================================================
function generateZone5() {

    // ===== FROST GATE — entry (rows 2-6, cols 11-18) =====
    fillFloor(2, 11, 6, 18, 'stoneTile');
    floorMap[2][12] = 'stoneInset';   floorMap[2][17] = 'stoneInset';
    floorMap[3][14] = 'stone';        floorMap[3][16] = 'stoneUneven';
    floorMap[4][11] = 'stoneUneven';  floorMap[4][15] = 'stoneMissing';
    floorMap[5][13] = 'stoneMissing'; floorMap[5][16] = 'stoneInset';
    floorMap[6][12] = 'stone';        floorMap[6][17] = 'stoneUneven';

    addWalls(1, 10, 7, 19, 'wallAged');
    floorMap[1][10] = 'wallCorner';   floorMap[1][19] = 'wallCorner';
    floorMap[7][10] = 'wallCorner';   floorMap[7][19] = 'wallCorner';
    floorMap[1][13] = 'wallBroken';   floorMap[1][16] = 'wallHole';

    openTile(1, 14, 'wallArchway');
    openTile(1, 15, 'wallArchway');
    openTile(7, 13, 'stone'); openTile(7, 14, 'stone');
    openTile(7, 15, 'stone'); openTile(7, 16, 'stone');

    hellObj(2, 11, 'h_candelabra1');  hellObj(2, 18, 'h_candelabra3');
    hellObj(5, 11, 'h_candelabra2');  hellObj(5, 18, 'h_candelabra1');
    hellObj(3, 14, 'h_skull1', false);

    // ===== FROZEN GALLERY — Act 1 arena (rows 8-17, cols 3-18) — 10×16 =====
    fillFloor(8, 3, 17, 18, 'stoneTile');
    floorMap[8][5] = 'stone';         floorMap[8][10] = 'stoneInset';
    floorMap[9][7] = 'stoneUneven';   floorMap[9][14] = 'stone';
    floorMap[10][4] = 'stoneMissing'; floorMap[10][11] = 'stoneInset';
    floorMap[11][8] = 'stone';        floorMap[11][16] = 'stoneUneven';
    floorMap[12][5] = 'stoneInset';   floorMap[12][13] = 'stoneMissing';
    floorMap[13][9] = 'stone';        floorMap[13][17] = 'stoneInset';
    floorMap[14][6] = 'stoneUneven';  floorMap[14][12] = 'stone';
    floorMap[15][4] = 'stone';        floorMap[15][15] = 'stoneMissing';
    floorMap[16][8] = 'stoneInset';   floorMap[16][14] = 'stoneUneven';
    floorMap[17][5] = 'stoneMissing'; floorMap[17][11] = 'stone';

    addWalls(7, 2, 18, 19, 'wall');
    floorMap[7][2] = 'wallCorner';   floorMap[7][19] = 'wallCorner';
    floorMap[18][2] = 'wallCorner';  floorMap[18][19] = 'wallCorner';
    floorMap[7][7] = 'wallBroken';   floorMap[7][13] = 'wallAged';
    floorMap[18][6] = 'wallAged';    floorMap[18][12] = 'wallBroken';
    floorMap[11][2] = 'wallBroken';  floorMap[15][2] = 'wallAged';

    // North entrance from Frost Gate (4 tiles)
    openTile(7, 13, 'stone'); openTile(7, 14, 'stone');
    openTile(7, 15, 'stone'); openTile(7, 16, 'stone');

    // Columns for cover
    placeObj(10, 6, 'stoneColumn');   placeObj(10, 15, 'stoneColumn');
    placeObj(14, 4, 'stoneColumn');   placeObj(14, 17, 'stoneColumn');
    placeObj(17, 8, 'stoneColumn');   placeObj(17, 13, 'stoneColumn');

    // Hell props
    hellObj(8, 3, 'h_candelabra1');   hellObj(8, 18, 'h_candelabra3');
    hellObj(12, 3, 'h_candelabra2');  hellObj(12, 18, 'h_candelabra1');
    hellObj(16, 3, 'h_candelabra3');  hellObj(16, 18, 'h_candelabra2');
    hellObj(9, 5, 'h_skull1', false); hellObj(11, 14, 'h_bones1', false);
    hellObj(13, 7, 'h_bones3', false); hellObj(15, 16, 'h_skull2', false);

    // =============================================================
    //  ACT 2 — sealed behind east wall (col 19, rows 10-15)
    // =============================================================

    // ===== THE HOLLOW — vast cavern (rows 6-19, cols 20-33) — 14×14 =====
    fillFloor(6, 20, 19, 33, 'dirtTiles');
    floorMap[7][22] = 'dirt';          floorMap[8][26] = 'stoneMissing';
    floorMap[9][24] = 'dirtTiles';     floorMap[10][30] = 'dirt';
    floorMap[11][21] = 'stoneMissing'; floorMap[12][28] = 'dirtTiles';
    floorMap[13][23] = 'dirt';         floorMap[14][31] = 'stoneMissing';
    floorMap[15][25] = 'dirtTiles';    floorMap[16][20] = 'dirt';
    floorMap[17][29] = 'stoneMissing'; floorMap[18][24] = 'dirt';

    addWalls(5, 19, 20, 33, 'wallAged');
    floorMap[5][19] = 'wallCorner';  floorMap[5][33] = 'wallCorner';
    floorMap[20][19] = 'wallCorner'; floorMap[20][33] = 'wallCorner';
    floorMap[5][25] = 'wallBroken';  floorMap[5][30] = 'wallHole';
    floorMap[20][24] = 'wallAged';   floorMap[20][29] = 'wallBroken';

    // Irregular column clusters (organic, not grid)
    placeObj(8, 23, 'stoneColumn');
    placeObj(8, 29, 'stoneColumnWood');
    placeObj(11, 25, 'stoneColumn');
    placeObj(11, 31, 'stoneColumn');
    placeObj(14, 22, 'stoneColumnWood');
    placeObj(14, 28, 'stoneColumn');
    placeObj(17, 24, 'stoneColumn');
    placeObj(17, 32, 'stoneColumnWood');

    // Hell props — bones and death
    hellObj(7, 21, 'h_bones1', false);  hellObj(9, 32, 'h_skull1', false);
    hellObj(12, 22, 'h_bones2', false); hellObj(15, 30, 'h_skull3', false);
    hellObj(18, 21, 'h_gore1', false);  hellObj(16, 33, 'h_bones4', false);
    hellObj(6, 20, 'h_candelabra1');    hellObj(6, 33, 'h_candelabra3');
    hellObj(13, 20, 'h_candelabra2');   hellObj(13, 33, 'h_candelabra1');
    hellObj(19, 20, 'h_candelabra3');   hellObj(19, 33, 'h_candelabra2');

    // ===== WYRM'S NEST — boss arena (rows 22-31, cols 23-32) — 10×10 =====
    fillFloor(22, 23, 31, 32, 'stoneTile');
    floorMap[23][25] = 'stoneUneven'; floorMap[24][29] = 'stoneMissing';
    floorMap[25][24] = 'stoneInset';  floorMap[26][28] = 'stone';
    floorMap[27][26] = 'stoneUneven'; floorMap[28][31] = 'stoneMissing';
    floorMap[29][25] = 'stone';       floorMap[30][29] = 'stoneInset';

    addWalls(21, 22, 32, 33, 'wall');
    floorMap[21][22] = 'wallCorner'; floorMap[21][33] = 'wallCorner';
    floorMap[32][22] = 'wallCorner'; floorMap[32][33] = 'wallCorner';
    floorMap[32][27] = 'wallAged';

    // Narrow throat connecting Hollow south to Nest north (3 tiles)
    fillFloor(20, 26, 21, 28, 'stone');
    openTile(20, 26, 'stone'); openTile(20, 27, 'stone'); openTile(20, 28, 'stone');
    openTile(21, 26, 'stone'); openTile(21, 27, 'stone'); openTile(21, 28, 'stone');

    placeObj(24, 24, 'stoneColumn'); placeObj(24, 31, 'stoneColumn');
    placeObj(29, 24, 'stoneColumn'); placeObj(29, 31, 'stoneColumn');

    hellObj(30, 27, 'h_altar3');
    hellObj(31, 25, 'h_candelabra1'); hellObj(31, 30, 'h_candelabra3');
    hellObj(23, 23, 'h_bones1', false); hellObj(26, 32, 'h_skull1', false);
    hellObj(28, 24, 'h_gore1', false);  hellObj(30, 31, 'h_bones2', false);

    // Boss exit stairs
    openTile(32, 27, 'stairs');
    openTile(32, 28, 'stairs');

    // ===== SEAL DATA — east wall of Frozen Gallery (col 19, rows 10-15) =====
    const z5SealTiles = [];
    for (let r = 10; r <= 15; r++) {
        z5SealTiles.push({ r: r, c: 19 });
    }
    zoneSealData[5] = {
        sealTiles: z5SealTiles,
        rubbleTiles: [
            { r: 11, c: 19, obj: 'h_rubble1' },
            { r: 14, c: 19, obj: 'h_rubble2' },
        ],
        chestTile: { r: 12, c: 20 },
    };
}


// ============================================================
//  ZONE 6 — THRONE OF RUIN (36×36)
//  Two-act finale. Hall of Echoes (Act 1) |
//  Catacombs → Throne of Ruin (Act 2, boss: Ruined King)
// ============================================================
function generateZone6() {

    // ===== RUIN GATE — entry (rows 2-7, cols 12-19) =====
    fillFloor(2, 12, 7, 19, 'stoneTile');
    floorMap[2][13] = 'stoneInset';   floorMap[2][18] = 'stoneInset';
    floorMap[3][15] = 'stone';        floorMap[3][17] = 'stoneUneven';
    floorMap[4][12] = 'stoneUneven';  floorMap[4][16] = 'stoneMissing';
    floorMap[5][14] = 'stoneMissing'; floorMap[5][18] = 'stone';
    floorMap[6][13] = 'stone';        floorMap[6][17] = 'stoneInset';
    floorMap[7][15] = 'stoneUneven';

    addWalls(1, 11, 8, 20, 'wallAged');
    floorMap[1][11] = 'wallCorner';   floorMap[1][20] = 'wallCorner';
    floorMap[8][11] = 'wallCorner';   floorMap[8][20] = 'wallCorner';
    floorMap[1][14] = 'wallBroken';   floorMap[1][17] = 'wallHole';

    openTile(1, 15, 'wallArchway');
    openTile(1, 16, 'wallArchway');
    openTile(8, 14, 'stone'); openTile(8, 15, 'stone');
    openTile(8, 16, 'stone'); openTile(8, 17, 'stone');

    hellObj(2, 12, 'h_burnerCol1');   hellObj(2, 19, 'h_burnerCol2');
    hellObj(5, 12, 'h_cage1');        hellObj(5, 19, 'h_cage2');
    hellObj(7, 12, 'h_candelabra1');  hellObj(7, 19, 'h_candelabra3');
    hellObj(3, 15, 'h_skull1', false);

    // ===== HALL OF ECHOES — Act 1 massive arena (rows 9-22, cols 3-22) — 14×20 =====
    fillFloor(9, 3, 22, 22, 'stoneTile');
    floorMap[9][5] = 'stone';         floorMap[9][10] = 'stoneInset';
    floorMap[9][15] = 'stoneUneven';  floorMap[9][20] = 'stone';
    floorMap[10][7] = 'stoneUneven';  floorMap[10][13] = 'stone';
    floorMap[10][18] = 'stoneInset';
    floorMap[11][4] = 'stoneMissing'; floorMap[11][9] = 'stoneInset';
    floorMap[11][14] = 'stone';       floorMap[11][19] = 'stoneMissing';
    floorMap[12][6] = 'stone';        floorMap[12][12] = 'stoneUneven';
    floorMap[12][17] = 'stoneInset';  floorMap[12][21] = 'stone';
    floorMap[13][4] = 'stoneInset';   floorMap[13][10] = 'stoneMissing';
    floorMap[13][16] = 'stone';       floorMap[13][20] = 'stoneUneven';
    floorMap[14][8] = 'stone';        floorMap[14][13] = 'stoneUneven';
    floorMap[14][18] = 'stoneMissing';
    floorMap[15][5] = 'stoneUneven';  floorMap[15][11] = 'stoneInset';
    floorMap[15][15] = 'stone';       floorMap[15][21] = 'stoneMissing';
    floorMap[16][4] = 'stone';        floorMap[16][9] = 'stoneMissing';
    floorMap[16][14] = 'stoneInset';  floorMap[16][19] = 'stone';
    floorMap[17][7] = 'stoneInset';   floorMap[17][12] = 'stone';
    floorMap[17][17] = 'stoneUneven';
    floorMap[18][5] = 'stoneMissing'; floorMap[18][10] = 'stoneUneven';
    floorMap[18][15] = 'stone';       floorMap[18][20] = 'stoneInset';
    floorMap[19][4] = 'stone';        floorMap[19][8] = 'stoneInset';
    floorMap[19][13] = 'stoneMissing'; floorMap[19][18] = 'stone';
    floorMap[20][6] = 'stoneUneven';  floorMap[20][11] = 'stone';
    floorMap[20][16] = 'stoneInset';  floorMap[20][21] = 'stoneMissing';
    floorMap[21][5] = 'stone';        floorMap[21][9] = 'stoneMissing';
    floorMap[21][14] = 'stoneUneven'; floorMap[21][19] = 'stone';
    floorMap[22][4] = 'stoneInset';   floorMap[22][12] = 'stone';
    floorMap[22][18] = 'stoneUneven';

    addWalls(8, 2, 23, 23, 'wall');
    floorMap[8][2] = 'wallCorner';   floorMap[8][23] = 'wallCorner';
    floorMap[23][2] = 'wallCorner';  floorMap[23][23] = 'wallCorner';
    floorMap[8][7] = 'wallBroken';   floorMap[8][12] = 'wallAged';
    floorMap[8][17] = 'wallHole';
    floorMap[23][7] = 'wallAged';    floorMap[23][12] = 'wallBroken';
    floorMap[23][17] = 'wallAged';
    floorMap[14][2] = 'wallBroken';  floorMap[18][2] = 'wallAged';
    floorMap[14][23] = 'wallAged';   floorMap[18][23] = 'wallBroken';

    // North entrance (4 tiles)
    openTile(8, 14, 'stone'); openTile(8, 15, 'stone');
    openTile(8, 16, 'stone'); openTile(8, 17, 'stone');

    // Central column aisle
    placeObj(11, 7, 'stoneColumn');   placeObj(11, 18, 'stoneColumn');
    placeObj(14, 5, 'stoneColumn');   placeObj(14, 20, 'stoneColumn');
    placeObj(17, 7, 'stoneColumn');   placeObj(17, 18, 'stoneColumn');
    placeObj(20, 5, 'stoneColumn');   placeObj(20, 20, 'stoneColumn');
    // Inner columns
    placeObj(13, 11, 'stoneColumn');  placeObj(13, 14, 'stoneColumn');
    placeObj(19, 11, 'stoneColumn');  placeObj(19, 14, 'stoneColumn');

    // Hell props everywhere
    hellObj(9, 3, 'h_burnerCol1');    hellObj(9, 22, 'h_burnerCol2');
    hellObj(12, 3, 'h_cage1');        hellObj(12, 22, 'h_cage2');
    hellObj(15, 3, 'h_candelabra1');  hellObj(15, 22, 'h_candelabra3');
    hellObj(18, 3, 'h_cage2');        hellObj(18, 22, 'h_cage1');
    hellObj(21, 3, 'h_burnerCol2');   hellObj(21, 22, 'h_burnerCol1');
    hellObj(10, 6, 'h_skull1', false);  hellObj(10, 19, 'h_skull2', false);
    hellObj(13, 4, 'h_gore1', false);   hellObj(13, 21, 'h_gore2', false);
    hellObj(16, 6, 'h_bones1', false);  hellObj(16, 19, 'h_bones2', false);
    hellObj(19, 4, 'h_skull3', false);  hellObj(19, 21, 'h_skull4', false);
    hellObj(22, 6, 'h_grave1', false);  hellObj(22, 19, 'h_grave2', false);

    // Wall decorations
    hellObj(9, 6, 'h_wallSword1', false);  hellObj(9, 10, 'h_wallShield1', false);
    hellObj(9, 16, 'h_wallSpear1', false); hellObj(9, 20, 'h_wallSword2', false);

    // =============================================================
    //  ACT 2 — sealed behind south wall (row 23, cols 8-18)
    // =============================================================

    // ===== THE CATACOMBS (rows 24-33, cols 6-21) — 10×16 =====
    fillFloor(24, 6, 33, 21, 'stoneTile');
    floorMap[25][8] = 'stoneUneven';  floorMap[25][15] = 'stoneMissing';
    floorMap[26][10] = 'stone';       floorMap[26][18] = 'stoneInset';
    floorMap[27][7] = 'stoneMissing'; floorMap[27][13] = 'stoneUneven';
    floorMap[28][11] = 'stoneInset';  floorMap[28][19] = 'stone';
    floorMap[29][8] = 'stone';        floorMap[29][16] = 'stoneMissing';
    floorMap[30][12] = 'stoneUneven'; floorMap[30][20] = 'stoneInset';
    floorMap[31][9] = 'stoneMissing'; floorMap[31][15] = 'stone';
    floorMap[32][7] = 'stoneInset';   floorMap[32][18] = 'stoneUneven';

    addWalls(23, 5, 34, 22, 'wallAged');
    floorMap[23][5] = 'wallCorner';  floorMap[23][22] = 'wallCorner';
    floorMap[34][5] = 'wallCorner';  floorMap[34][22] = 'wallCorner';
    floorMap[34][12] = 'wallAged';   floorMap[34][17] = 'wallBroken';

    // Sarcophagi props (h_altar as sarcophagi, h_grave)
    hellObj(26, 8, 'h_altar1');      hellObj(26, 14, 'h_altar2');
    hellObj(29, 7, 'h_altar3');      hellObj(29, 19, 'h_altar1');
    hellObj(32, 10, 'h_altar2');     hellObj(32, 16, 'h_altar3');
    // Bone piles
    hellObj(25, 6, 'h_bones1', false);  hellObj(27, 20, 'h_bones2', false);
    hellObj(28, 9, 'h_skull1', false);  hellObj(30, 17, 'h_skull3', false);
    hellObj(31, 7, 'h_gore1', false);   hellObj(33, 19, 'h_gore2', false);
    // Candelabras along walls
    hellObj(24, 6, 'h_candelabra1');  hellObj(24, 21, 'h_candelabra3');
    hellObj(28, 6, 'h_burnerCol1');   hellObj(28, 21, 'h_burnerCol2');
    hellObj(33, 6, 'h_candelabra2');  hellObj(33, 21, 'h_candelabra1');

    // ===== THRONE OF RUIN — final boss arena (rows 28-35, cols 23-35) — 8×13 =====
    fillFloor(28, 23, 35, 35, 'stoneTile');
    floorMap[29][25] = 'stoneInset';  floorMap[29][31] = 'stone';
    floorMap[30][27] = 'stoneUneven'; floorMap[30][33] = 'stoneMissing';
    floorMap[31][24] = 'stone';       floorMap[31][29] = 'stoneInset';
    floorMap[32][26] = 'stoneMissing'; floorMap[32][32] = 'stoneUneven';
    floorMap[33][28] = 'stone';       floorMap[33][34] = 'stoneInset';
    floorMap[34][25] = 'stoneUneven'; floorMap[34][30] = 'stone';

    addWalls(27, 22, 35, 35, 'wall');
    floorMap[27][22] = 'wallCorner'; floorMap[27][35] = 'wallCorner';
    floorMap[35][22] = 'wallCorner'; floorMap[35][35] = 'wallCorner';
    floorMap[27][28] = 'wallBroken'; floorMap[35][28] = 'wallAged';
    floorMap[35][32] = 'wallBroken';

    // Connect Catacombs east to Throne west (3 tiles)
    openTile(30, 22, 'stone'); openTile(31, 22, 'stone'); openTile(32, 22, 'stone');

    // Grand processional columns — two rows
    placeObj(29, 25, 'stoneColumn');  placeObj(29, 33, 'stoneColumn');
    placeObj(31, 25, 'stoneColumn');  placeObj(31, 33, 'stoneColumn');
    placeObj(33, 25, 'stoneColumn');  placeObj(33, 33, 'stoneColumn');

    // Throne at far end
    hellObj(35, 28, 'h_throne1');    hellObj(35, 29, 'h_throne2');
    hellObj(34, 26, 'h_altar1');     hellObj(34, 31, 'h_altar2');
    hellObj(34, 24, 'h_candelabra1'); hellObj(34, 34, 'h_candelabra3');
    hellObj(35, 25, 'h_stand1');     hellObj(35, 32, 'h_stand2');
    hellObj(33, 28, 'h_pentagram', false);

    // Floor atmosphere
    hellObj(29, 24, 'h_skull1', false);  hellObj(30, 34, 'h_skull2', false);
    hellObj(32, 27, 'h_bones1', false);  hellObj(34, 33, 'h_gore1', false);
    hellObj(28, 23, 'h_burnerCol1');     hellObj(28, 34, 'h_burnerCol2');

    // No boss exit — this is the final zone. Victory on clear.

    // ===== SEAL DATA — south wall of Hall of Echoes (row 23, cols 8-18) =====
    const z6SealTiles = [];
    for (let c = 8; c <= 18; c++) {
        z6SealTiles.push({ r: 23, c: c });
    }
    zoneSealData[6] = {
        sealTiles: z6SealTiles,
        rubbleTiles: [
            { r: 23, c: 10, obj: 'h_rubble1' },
            { r: 23, c: 14, obj: 'h_rubble2' },
            { r: 23, c: 17, obj: 'h_rubble1' },
        ],
        chestTile: null, // finale — no breather chest
    };
}

