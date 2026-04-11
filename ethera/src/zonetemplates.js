// ============================================================
//  ZONE TEMPLATES — Hybrid Generation Data
//  Each template defines landmarks (fixed rooms), fill regions
//  (BSP areas for higher ascension), waves, seal data, etc.
//  Consumed by generateZoneFromTemplate() in zonegen.js.
// ============================================================

const ZONE_TEMPLATE_1 = {

    id: 1,
    name: 'The Undercroft',
    mapSize: 34,
    theme: 'dungeon',

    // ── LANDMARKS ──
    // Fixed rooms extracted from generateDungeon(). At Ascension 0
    // these are the ONLY rooms placed — output must be identical to
    // the current hand-authored Zone 1.
    landmarks: [

        // =============================================================
        //  CELL — L-shaped prison (spawn room)
        //  Main chamber (rows 2-5, cols 2-6) + collapsed eastern
        //  tunnel alcove (rows 3-5, cols 7-10).
        // =============================================================
        {
            id: 'cell',
            act: 1,
            bounds: { r1: 1, c1: 1, r2: 6, c2: 11 },
            spawnPoint: { r: 4, c: 3 },
            exits: [
                { r: 6, c: 3, dir: 'south' },
                { r: 6, c: 4, dir: 'south' },
                { r: 6, c: 5, dir: 'south' },
                { r: 6, c: 6, dir: 'south' },
            ],
            carve() {
                // --- Main chamber (rows 2-5, cols 2-6) ---
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

                // --- Collapsed eastern tunnel (rows 3-5, cols 7-10) ---
                fillFloor(3, 7, 5, 10, 'dirtTiles');
                for (let c = 8; c <= 11; c++) {
                    floorMap[2][c] = 'wallAged'; blocked[2][c] = true; blockType[2][c] = 'wall';
                    floorMap[6][c] = 'wallAged'; blocked[6][c] = true; blockType[6][c] = 'wall';
                }
                for (let r = 3; r <= 5; r++) {
                    floorMap[r][11] = 'wallAged'; blocked[r][11] = true; blockType[r][11] = 'wall';
                }
                floorMap[2][11] = 'wallCorner'; floorMap[6][11] = 'wallCorner';
                floorMap[2][10] = 'wallBroken';
                floorMap[3][9] = 'planksHole'; floorMap[4][8] = 'planksBroken';
                floorMap[5][10] = 'planksHole'; floorMap[4][10] = 'dirtTiles';
                placeObj(3, 10, 'woodenPile');
                placeObj(5, 9, 'woodenCrate');
                placeObj(4, 9, 'chestClosed');
                placeObj(3, 8, 'woodenSupportBeams');
            },
        },

        // =============================================================
        //  GUARD HALL — T-shaped patrol room (first combat)
        //  Main hall (rows 10-16, cols 1-8) + southern armory
        //  alcove (rows 17-19, cols 3-6).
        // =============================================================
        {
            id: 'guard_hall',
            act: 1,
            bounds: { r1: 9, c1: 0, r2: 20, c2: 9 },
            exits: [
                { r: 9, c: 3, dir: 'north' },
                { r: 9, c: 4, dir: 'north' },
                { r: 9, c: 5, dir: 'north' },
                { r: 9, c: 6, dir: 'north' },
                { r: 11, c: 9, dir: 'east' },
                { r: 12, c: 9, dir: 'east' },
                { r: 13, c: 9, dir: 'east' },
                { r: 14, c: 9, dir: 'east' },
            ],
            carve() {
                // --- Main hall (rows 10-16, cols 1-8) ---
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
                floorMap[17][8] = 'wallAged';

                openTile(9, 3, 'stone'); openTile(9, 4, 'stone');
                openTile(9, 5, 'stone'); openTile(9, 6, 'stone');
                openTile(11, 9, 'stone'); openTile(12, 9, 'stone');
                openTile(13, 9, 'stone'); openTile(14, 9, 'stone');

                placeObj(10, 1, 'tableChairsBroken');
                placeObj(10, 8, 'barrels');
                placeObj(16, 1, 'woodenCrates');
                placeObj(16, 8, 'barrelsStacked');
                placeObj(13, 1, 'woodenCrate');
                placeObj(12, 4, 'stoneColumn');
                placeObj(12, 7, 'stoneColumn');

                // --- Southern armory alcove (rows 17-19, cols 3-6) ---
                fillFloor(17, 3, 19, 6, 'stoneTile');
                addWalls(17, 2, 20, 7, 'wall');
                openTile(17, 3, 'stoneTile'); openTile(17, 4, 'stoneTile');
                openTile(17, 5, 'stoneTile'); openTile(17, 6, 'stoneTile');
                floorMap[20][2] = 'wallCorner'; floorMap[20][7] = 'wallCorner';
                floorMap[20][4] = 'wallBroken';
                floorMap[18][4] = 'stoneMissing'; floorMap[19][5] = 'stoneUneven';
                placeObj(18, 3, 'woodenCrates');
                placeObj(19, 6, 'barrelsStacked');
                placeObj(19, 3, 'barrel');
                placeObj(18, 5, 'woodenPile', false);
            },
        },

        // =============================================================
        //  GREAT HALL — cathedral with aisles (main arena)
        //  Main nave (rows 8-20, cols 12-21) with paired columns.
        //  East wall at col 22 is SEALED.
        // =============================================================
        {
            id: 'great_hall',
            act: 1,
            bounds: { r1: 7, c1: 11, r2: 21, c2: 22 },
            exits: [
                { r: 11, c: 11, dir: 'west' },
                { r: 12, c: 11, dir: 'west' },
                { r: 13, c: 11, dir: 'west' },
                { r: 14, c: 11, dir: 'west' },
                // North wall (to secret alcove) — sealed until wave 2
                // East wall (to Act 2) — sealed until wave 3
            ],
            carve() {
                fillFloor(8, 12, 20, 21, 'stoneTile');

                // Central processional aisle
                for (let r = 9; r <= 19; r++) {
                    if (r % 2 === 0) floorMap[r][16] = 'stoneInset';
                    if (r % 2 === 1) floorMap[r][17] = 'stoneInset';
                }
                // Damaged/varied floor areas
                floorMap[8][13] = 'stone';      floorMap[8][19] = 'stoneMissing';
                floorMap[9][14] = 'stoneUneven'; floorMap[9][20] = 'stone';
                floorMap[10][12] = 'stone';     floorMap[10][15] = 'stoneInset';
                floorMap[11][13] = 'stoneUneven'; floorMap[12][20] = 'stone';
                floorMap[14][13] = 'stoneMissing'; floorMap[14][18] = 'stoneUneven';
                floorMap[15][20] = 'stone';     floorMap[16][14] = 'stone';
                floorMap[17][21] = 'stoneUneven'; floorMap[18][13] = 'stoneMissing';
                floorMap[19][16] = 'stoneInset'; floorMap[20][14] = 'stone';
                floorMap[20][19] = 'stoneMissing';

                // Walls — east wall at col 22 is the SEALED WALL
                addWalls(7, 11, 21, 22, 'wall');
                floorMap[7][11] = 'wallCorner';  floorMap[7][22] = 'wallCorner';
                floorMap[21][11] = 'wallCorner'; floorMap[21][22] = 'wallCorner';
                floorMap[7][13] = 'wallAged';   floorMap[7][15] = 'wallWindowBars';
                floorMap[7][18] = 'wallWindowBars'; floorMap[7][20] = 'wallBroken';
                floorMap[21][13] = 'wallBroken'; floorMap[21][15] = 'wallAged';
                floorMap[21][18] = 'wallArchway'; floorMap[21][20] = 'wallAged';

                // West wall opening (corridor entrance)
                openTile(11, 11, 'stone'); openTile(12, 11, 'stone');
                openTile(13, 11, 'stone'); openTile(14, 11, 'stone');

                // Four column pairs creating cathedral aisles
                placeObj(9, 14, 'stoneColumn');
                placeObj(9, 19, 'stoneColumn');
                placeObj(12, 14, 'stoneColumnWood');
                placeObj(12, 19, 'stoneColumn');
                placeObj(15, 14, 'stoneColumn');
                placeObj(15, 19, 'stoneColumn');
                placeObj(18, 14, 'stoneColumn');
                placeObj(18, 19, 'stoneColumn');

                // Interactables
                placeObj(19, 21, 'chestClosed');
                openTile(20, 17, 'stairs');
                objectMap[20][17] = 'stairsSpiral';

                // Props
                placeObj(8, 21, 'barrelsStacked');
                placeObj(8, 12, 'woodenCrate');
                placeObj(10, 20, 'tableRoundChairs');
                placeObj(14, 17, 'tableChairsBroken');
                placeObj(20, 21, 'barrel');
                placeObj(20, 12, 'woodenCrate');
                placeObj(17, 21, 'woodenSupportBeams');
                placeObj(10, 21, 'stoneColumnWood');
            },
        },

        // =============================================================
        //  SECRET ALCOVE — hidden treasure room above Great Hall
        //  (rows 2-6, cols 15-20). Sealed behind mini-seal until wave 2.
        // =============================================================
        {
            id: 'secret_alcove',
            act: 1,
            bounds: { r1: 1, c1: 14, r2: 7, c2: 21 },
            exits: [
                // South opening to Great Hall — sealed initially
                { r: 7, c: 16, dir: 'south', sealed: true },
                { r: 7, c: 17, dir: 'south', sealed: true },
                { r: 7, c: 18, dir: 'south', sealed: true },
            ],
            carve() {
                fillFloor(2, 15, 6, 20, 'stoneInset');
                floorMap[2][15] = 'stone';     floorMap[2][19] = 'stoneMissing';
                floorMap[4][17] = 'stoneUneven'; floorMap[5][16] = 'stone';
                floorMap[6][20] = 'stoneInset'; floorMap[3][20] = 'stoneMissing';

                addWalls(1, 14, 7, 21, 'wallAged');
                floorMap[1][14] = 'wallCorner'; floorMap[1][21] = 'wallCorner';
                floorMap[7][14] = 'wallCorner'; floorMap[7][21] = 'wallCorner';
                floorMap[1][17] = 'wallBroken'; floorMap[1][19] = 'wallHole';

                // North wall opening — SEALED until wave 2 (handled by z1AlcoveSeal)
                // Stays as walls until enemies.js triggers the mini-seal break

                placeObj(3, 16, 'chestClosed');
                placeObj(5, 19, 'barrelsStacked');
                placeObj(4, 20, 'woodenCrates');
                placeObj(6, 16, 'stairsAged', false);
                placeObj(2, 20, 'barrel');
                placeObj(2, 15, 'woodenPile');
                placeObj(4, 18, 'stoneColumnWood');
            },
        },

        // =============================================================
        //  BONE GALLERY — Act 2 transition + combat room
        //  (rows 8-16, cols 23-32). Heavy damage, structural collapse.
        // =============================================================
        {
            id: 'bone_gallery',
            act: 2,
            bounds: { r1: 7, c1: 22, r2: 17, c2: 33 },
            exits: [
                // West entrance from Great Hall (seal wall at col 22)
                // South exit to King's Hollow corridor
                { r: 17, c: 26, dir: 'south' },
                { r: 17, c: 27, dir: 'south' },
                { r: 17, c: 28, dir: 'south' },
                { r: 17, c: 29, dir: 'south' },
            ],
            carve() {
                fillFloor(8, 23, 16, 32, 'stoneTile');
                // Heavy damage patches
                floorMap[8][24] = 'stoneMissing';  floorMap[8][28] = 'planksHole';
                floorMap[9][26] = 'stoneInset';    floorMap[9][30] = 'planksBroken';
                floorMap[10][24] = 'planksHole';   floorMap[10][29] = 'stoneMissing';
                floorMap[11][27] = 'stoneMissing'; floorMap[11][31] = 'planksBroken';
                floorMap[12][25] = 'stoneInset';   floorMap[12][28] = 'planksHole';
                floorMap[13][23] = 'stoneMissing'; floorMap[13][30] = 'planksBroken';
                floorMap[14][26] = 'planksHole';   floorMap[14][32] = 'stoneMissing';
                floorMap[15][24] = 'stoneInset';   floorMap[15][29] = 'planksBroken';
                floorMap[16][27] = 'planksHole';   floorMap[16][31] = 'stoneMissing';

                addWalls(7, 22, 17, 33, 'wallAged');
                floorMap[7][22] = 'wallCorner';  floorMap[7][33] = 'wallCorner';
                floorMap[17][22] = 'wallCorner'; floorMap[17][33] = 'wallCorner';
                floorMap[7][25] = 'wallBroken';  floorMap[7][28] = 'wallHole';
                floorMap[7][31] = 'wallWindowBars';
                floorMap[17][26] = 'wallAged';   floorMap[17][30] = 'wallBroken';

                // Columns — staggered cover lanes
                placeObj(9, 25, 'stoneColumn');
                placeObj(9, 30, 'stoneColumn');
                placeObj(11, 27, 'stoneColumnWood');
                placeObj(13, 25, 'stoneColumnWood');
                placeObj(13, 30, 'stoneColumn');
                placeObj(15, 28, 'stoneColumn');

                // Structural collapse theme
                placeObj(8, 23, 'woodenSupportBeams');
                placeObj(10, 23, 'woodenSupportBeams');
                placeObj(14, 32, 'woodenSupportBeams');
                placeObj(11, 32, 'woodenPile', false);
                placeObj(14, 24, 'woodenPile', false);
                placeObj(9, 28, 'woodenPile', false);
                placeObj(16, 27, 'woodenPile', false);
                placeObj(10, 27, 'tableChairsBroken');
                placeObj(8, 32, 'barrelsStacked');
                placeObj(16, 23, 'woodenCrates');

                // South exit framing
                placeObj(16, 26, 'stoneColumn');
                placeObj(16, 29, 'stoneColumn');
            },
        },

        // =============================================================
        //  FLOODED CRYPT — east side-branch off Bone Gallery
        //  (rows 2-7, cols 28-33). Optional loot room.
        // =============================================================
        {
            id: 'flooded_crypt',
            act: 2,
            bounds: { r1: 1, c1: 27, r2: 7, c2: 33 },
            exits: [
                // Passage south to Bone Gallery (row 7, cols 30-31)
                { r: 7, c: 30, dir: 'south' },
                { r: 7, c: 31, dir: 'south' },
            ],
            carve() {
                fillFloor(2, 28, 7, 33, 'dirtTiles');
                floorMap[2][29] = 'planksHole';   floorMap[2][32] = 'planksBroken';
                floorMap[3][28] = 'stoneMissing'; floorMap[3][31] = 'dirtTiles';
                floorMap[4][30] = 'planksHole';   floorMap[4][33] = 'planksBroken';
                floorMap[5][29] = 'planksBroken'; floorMap[5][32] = 'planks';
                floorMap[6][28] = 'dirtTiles';    floorMap[6][31] = 'planksHole';
                floorMap[7][30] = 'planksBroken'; floorMap[7][33] = 'dirtTiles';

                // Crypt walls (manual to avoid overwriting Gallery floor at row 8)
                for (let c = 27; c <= 33; c++) { floorMap[1][c] = 'wallAged'; blocked[1][c] = true; blockType[1][c] = 'wall'; }
                floorMap[1][27] = 'wallCorner'; floorMap[1][33] = 'wallCorner';
                floorMap[1][30] = 'wallBroken'; floorMap[1][32] = 'wallHole';
                for (let r = 2; r <= 7; r++) { floorMap[r][27] = 'wallAged'; blocked[r][27] = true; blockType[r][27] = 'wall'; }
                for (let r = 2; r <= 6; r++) { floorMap[r][33] = 'wallAged'; blocked[r][33] = true; blockType[r][33] = 'wall'; }
                // Re-block row 7 tiles except passage at cols 30-31
                for (let c = 28; c <= 33; c++) {
                    if (c === 30 || c === 31) continue;
                    floorMap[7][c] = 'wallAged'; blocked[7][c] = true; blockType[7][c] = 'wall';
                }

                placeObj(3, 30, 'stoneColumnWood');
                placeObj(5, 32, 'stoneColumn');
                placeObj(6, 29, 'stoneColumn');
                placeObj(2, 33, 'barrelsStacked');
                placeObj(7, 28, 'woodenCrates');
                placeObj(4, 28, 'woodenPile');
                placeObj(2, 28, 'barrel');
                placeObj(5, 30, 'chestClosed');

                // Passage floor correction
                floorMap[7][30] = 'stone'; floorMap[7][31] = 'stone';
            },
        },

        // =============================================================
        //  KING'S HOLLOW — tightened octagonal boss arena
        //  (rows 20-29, cols 24-31). ~60 walkable tiles.
        // =============================================================
        {
            id: 'kings_hollow',
            act: 2,
            bounds: { r1: 19, c1: 23, r2: 29, c2: 32 },
            exits: [
                // North entrance from Bone Gallery corridor
                { r: 19, c: 26, dir: 'north' },
                { r: 19, c: 27, dir: 'north' },
                { r: 19, c: 28, dir: 'north' },
                { r: 19, c: 29, dir: 'north' },
            ],
            carve() {
                fillFloor(20, 24, 29, 31, 'stoneTile');

                floorMap[21][26] = 'stone';       floorMap[21][30] = 'stoneInset';
                floorMap[22][25] = 'stoneUneven'; floorMap[22][29] = 'stone';
                floorMap[23][27] = 'stoneInset';  floorMap[23][31] = 'stoneMissing';
                floorMap[24][25] = 'stone';       floorMap[24][29] = 'stoneUneven';
                floorMap[25][26] = 'stoneMissing'; floorMap[25][30] = 'stoneInset';
                floorMap[26][25] = 'stone';       floorMap[26][28] = 'stoneUneven';
                floorMap[27][27] = 'stoneInset';  floorMap[27][30] = 'stone';
                floorMap[28][26] = 'stoneUneven'; floorMap[28][29] = 'stoneMissing';

                addWalls(19, 23, 29, 32, 'wall');
                floorMap[19][23] = 'wallCorner'; floorMap[19][32] = 'wallCorner';
                floorMap[29][23] = 'wallCorner'; floorMap[29][32] = 'wallCorner';
                floorMap[19][26] = 'wallBroken'; floorMap[19][29] = 'wallAged';
                floorMap[29][26] = 'wallAged';   floorMap[29][29] = 'wallBroken';

                // Cut corners for octagonal shape
                floorMap[20][24] = 'wall'; blocked[20][24] = true; blockType[20][24] = 'wall';
                floorMap[20][25] = 'wall'; blocked[20][25] = true; blockType[20][25] = 'wall';
                floorMap[20][30] = 'wall'; blocked[20][30] = true; blockType[20][30] = 'wall';
                floorMap[20][31] = 'wall'; blocked[20][31] = true; blockType[20][31] = 'wall';
                floorMap[29][24] = 'wall'; blocked[29][24] = true; blockType[29][24] = 'wall';
                floorMap[28][24] = 'wall'; blocked[28][24] = true; blockType[28][24] = 'wall';
                floorMap[29][31] = 'wall'; blocked[29][31] = true; blockType[29][31] = 'wall';
                floorMap[28][31] = 'wall'; blocked[28][31] = true; blockType[28][31] = 'wall';

                // Corridor: Bone Gallery south -> King's Hollow north
                fillFloor(17, 26, 19, 29, 'stone');
                floorMap[17][27] = 'stoneUneven'; floorMap[18][28] = 'stoneMissing';
                openTile(17, 26, 'stone'); openTile(17, 27, 'stone');
                openTile(17, 28, 'stone'); openTile(17, 29, 'stone');
                openTile(18, 26, 'stone'); openTile(18, 27, 'stone');
                openTile(18, 28, 'stone'); openTile(18, 29, 'stone');
                openTile(19, 26, 'stone'); openTile(19, 27, 'stone');
                openTile(19, 28, 'stone'); openTile(19, 29, 'stone');
                floorMap[17][25] = 'wall'; blocked[17][25] = true; blockType[17][25] = 'wall';
                floorMap[18][25] = 'wall'; blocked[18][25] = true; blockType[18][25] = 'wall';
                floorMap[17][30] = 'wall'; blocked[17][30] = true; blockType[17][30] = 'wall';
                floorMap[18][30] = 'wall'; blocked[18][30] = true; blockType[18][30] = 'wall';

                // Arena columns
                placeObj(21, 26, 'stoneColumn');
                placeObj(21, 30, 'stoneColumn');
                placeObj(27, 26, 'stoneColumn');
                placeObj(27, 29, 'stoneColumn');
                placeObj(24, 27, 'stoneColumn');
                placeObj(25, 29, 'stoneColumnWood');

                // Ritual circle at center
                placeObj(25, 28, 'stoneColumn', false);
                placeObj(24, 28, 'woodenPile', false);
                placeObj(26, 28, 'woodenPile', false);
                placeObj(25, 27, 'woodenPile', false);

                // Arena props
                placeObj(20, 27, 'woodenSupportBeams');
                placeObj(20, 29, 'barrel');
                placeObj(22, 24, 'woodenCrates');
                placeObj(27, 24, 'woodenCrate');
                placeObj(22, 31, 'woodenPile');
                placeObj(27, 31, 'barrels');
                placeObj(28, 27, 'barrelsStacked');
            },
        },
    ],

    // ── CORRIDORS ──
    // Fixed corridors connecting landmarks. Carved when there are
    // no fill-region rooms (Ascension 0) or as fallback paths.
    corridors: [
        {
            id: 'descent',
            connectsFrom: 'cell',
            connectsTo: 'guard_hall',
            carve() {
                // The Descent (rows 7-9, cols 3-6)
                fillFloor(7, 3, 9, 6, 'stone');
                floorMap[7][4] = 'stoneUneven'; floorMap[8][5] = 'stoneMissing';
                floorMap[7][6] = 'stoneInset';  floorMap[9][3] = 'planksHole';
                floorMap[8][3] = 'stoneMissing';
                for (let r = 7; r <= 9; r++) {
                    floorMap[r][2] = 'wall'; blocked[r][2] = true; blockType[r][2] = 'wall';
                    floorMap[r][7] = 'wall'; blocked[r][7] = true; blockType[r][7] = 'wall';
                }
                placeObj(7, 6, 'woodenSupportBeams');
                placeObj(8, 3, 'barrel');
                placeObj(9, 5, 'woodenPile', false);
            },
        },
        {
            id: 'passage',
            connectsFrom: 'guard_hall',
            connectsTo: 'great_hall',
            carve() {
                // The Passage (rows 11-14, cols 10-12)
                fillFloor(11, 10, 14, 12, 'stone');
                floorMap[11][10] = 'stoneUneven'; floorMap[13][11] = 'stoneMissing';
                floorMap[12][12] = 'stoneInset';  floorMap[14][10] = 'stoneUneven';
                floorMap[10][10] = 'wall'; blocked[10][10] = true; blockType[10][10] = 'wall';
                floorMap[10][11] = 'wall'; blocked[10][11] = true; blockType[10][11] = 'wall';
                floorMap[10][12] = 'wall'; blocked[10][12] = true; blockType[10][12] = 'wall';
                floorMap[15][10] = 'wall'; blocked[15][10] = true; blockType[15][10] = 'wall';
                floorMap[15][11] = 'wall'; blocked[15][11] = true; blockType[15][11] = 'wall';
                floorMap[15][12] = 'wall'; blocked[15][12] = true; blockType[15][12] = 'wall';
                placeObj(11, 10, 'stoneColumnWood');
                placeObj(13, 12, 'woodenPile', false);
            },
        },
    ],

    // ── FILL REGIONS ──
    // Areas where BSP can generate additional rooms at higher Ascension.
    // At Ascension 0, minRooms is 0 so only fixed corridors are carved.
    fillRegions: [
        {
            id: 'descent',
            act: 1,
            bounds: { r1: 6, c1: 2, r2: 9, c2: 10 },
            connectsFrom: 'cell',
            connectsTo: 'guard_hall',
            minRooms: 0,
            maxRooms: 2,
            allowedTemplates: ['rect', 'corridor'],
        },
        {
            id: 'passage',
            act: 1,
            bounds: { r1: 10, c1: 9, r2: 15, c2: 12 },
            connectsFrom: 'guard_hall',
            connectsTo: 'great_hall',
            minRooms: 0,
            maxRooms: 1,
            allowedTemplates: ['rect', 'corridor'],
        },
        {
            id: 'act2_galleries',
            act: 2,
            bounds: { r1: 1, c1: 22, r2: 18, c2: 33 },
            connectsFrom: 'great_hall',
            connectsTo: 'kings_hollow',
            minRooms: 0,
            maxRooms: 3,
            allowedTemplates: ['rect', 'corridor', 'lshape', 'arena'],
        },
    ],

    // ── WAVES ──
    // Each slot has a `base` composition and optional `variants`
    // for higher Ascension. At Asc 0, base is used. At Asc 1+,
    // one variant is chosen randomly (or base as fallback).
    waves: [
        {
            base: {
                enemies: [{ type: 'slime', count: 7 }],
                statMult: 1.0,
                title: 'The Dungeon Stirs',
                spawnZone: { rMin: 10, rMax: 19, cMin: 1, cMax: 8 },
            },
            variants: [
                {
                    enemies: [{ type: 'slime', count: 5 }, { type: 'skeleton', count: 3 }],
                    statMult: 1.05,
                    title: 'The Dungeon Stirs',
                    spawnZone: { rMin: 10, rMax: 19, cMin: 1, cMax: 8 },
                },
            ],
        },
        {
            base: {
                enemies: [{ type: 'slime', count: 5 }, { type: 'skeleton', count: 4 }],
                statMult: 1.15,
                title: 'The Dead Rise',
                spawnZone: { rMin: 8, rMax: 20, cMin: 12, cMax: 21 },
            },
            variants: [
                {
                    enemies: [{ type: 'slime', count: 3 }, { type: 'skeleton', count: 5 }, { type: 'skelarch', count: 2 }],
                    statMult: 1.2,
                    title: 'The Dead Rise',
                    spawnZone: { rMin: 8, rMax: 20, cMin: 12, cMax: 21 },
                },
            ],
        },
        {
            base: {
                enemies: [{ type: 'slime', count: 6 }, { type: 'skeleton', count: 5 }, { type: 'skelarch', count: 3 }],
                statMult: 1.35,
                title: 'Arrow and Bone',
                isExpansionTrigger: true,
                spawnZone: { rMin: 8, rMax: 20, cMin: 12, cMax: 21 },
            },
            variants: [
                {
                    enemies: [{ type: 'slime', count: 4 }, { type: 'skeleton', count: 6 }, { type: 'skelarch', count: 4 }],
                    statMult: 1.4,
                    title: 'Arrow and Bone',
                    isExpansionTrigger: true,
                    spawnZone: { rMin: 8, rMax: 20, cMin: 12, cMax: 21 },
                },
            ],
        },
        {
            base: {
                enemies: [{ type: 'skeleton', count: 8 }, { type: 'skelarch', count: 4 }],
                statMult: 1.5,
                title: 'The Crypt Opens',
                spawnZone: { rMin: 8, rMax: 16, cMin: 23, cMax: 32 },
            },
            variants: [
                {
                    enemies: [{ type: 'skeleton', count: 6 }, { type: 'skelarch', count: 5 }, { type: 'bone_mage', count: 1 }],
                    statMult: 1.55,
                    title: 'The Crypt Opens',
                    spawnZone: { rMin: 8, rMax: 16, cMin: 23, cMax: 32 },
                },
            ],
        },
        {
            base: {
                enemies: [{ type: 'slime', count: 3 }, { type: 'skeleton', count: 5 }, { type: 'skelarch', count: 4 }, { type: 'bone_mage', count: 1 }],
                statMult: 1.65,
                title: 'The Deep Stirs',
                spawnZone: { rMin: 2, rMax: 16, cMin: 23, cMax: 33 },
            },
            variants: [
                {
                    enemies: [{ type: 'skeleton', count: 6 }, { type: 'skelarch', count: 5 }, { type: 'bone_mage', count: 2 }],
                    statMult: 1.7,
                    title: 'The Deep Stirs',
                    spawnZone: { rMin: 2, rMax: 16, cMin: 23, cMax: 33 },
                },
            ],
        },
        {
            base: {
                enemies: [{ type: 'skeleton', count: 7 }, { type: 'skelarch', count: 5 }, { type: 'slime', count: 5 }, { type: 'bone_mage', count: 2 }],
                statMult: 1.8,
                title: 'The Undercroft\'s Last Stand',
                spawnZone: { rMin: 2, rMax: 16, cMin: 23, cMax: 33 },
            },
            variants: [
                {
                    enemies: [{ type: 'skeleton', count: 8 }, { type: 'skelarch', count: 6 }, { type: 'slime', count: 4 }, { type: 'bone_mage', count: 3 }],
                    statMult: 1.9,
                    title: 'The Undercroft\'s Last Stand',
                    spawnZone: { rMin: 2, rMax: 16, cMin: 23, cMax: 33 },
                },
            ],
        },
        {
            base: {
                enemies: [{ type: 'slime_king', count: 1 }, { type: 'slime', count: 4 }, { type: 'skeleton', count: 3 }],
                statMult: 1.9,
                title: 'The Slime King Emerges',
                isBossWave: true,
                spawnZone: { rMin: 20, rMax: 29, cMin: 24, cMax: 31 },
            },
            variants: [
                {
                    enemies: [{ type: 'slime_king', count: 1 }, { type: 'slime', count: 6 }, { type: 'skeleton', count: 4 }, { type: 'skelarch', count: 2 }],
                    statMult: 2.0,
                    title: 'The Slime King Emerges',
                    isBossWave: true,
                    spawnZone: { rMin: 20, rMax: 29, cMin: 24, cMax: 31 },
                },
            ],
        },
    ],

    // ── SEAL ──
    // The Act 2 seal configuration — east wall of Great Hall at col 22
    seal: {
        sealTiles: (function () {
            const tiles = [];
            for (let r = 8; r <= 20; r++) tiles.push({ r: r, c: 22 });
            return tiles;
        })(),
        rubbleTiles: [
            { r: 8, c: 22, obj: 'woodenPile' },
            { r: 12, c: 22, obj: 'woodenPile' },
            { r: 16, c: 22, obj: 'woodenPile' },
        ],
        chestTile: { r: 12, c: 24 },
    },

    // ── ALCOVE MINI-SEAL ──
    // Great Hall north wall — opened after wave 1 clears
    alcoveSeal: [
        { r: 7, c: 16 },
        { r: 7, c: 17 },
        { r: 7, c: 18 },
    ],

    // ── EXPANSION CONFIG ──
    expansion: {
        triggerAfterWaveIndex: 2,
        bannerText: 'The walls CRUMBLE...',
        bannerSub: 'Something stirs in the depths beyond.',
        cameraTarget: { r: 12, c: 28 },
        shakeIntensity: 10,
        shakeDuration: 1.8,
        breatherChest: true,
    },

    // ── CONTENT ──
    content: {
        // Fixed chests placed by landmark carve functions
        fixedChests: [
            { r: 4, c: 9, landmark: 'cell' },         // tunnel dead-end
            { r: 19, c: 21, landmark: 'great_hall' },  // locked chest
            { r: 3, c: 16, landmark: 'secret_alcove' },
            { r: 5, c: 30, landmark: 'flooded_crypt' },
        ],
        // Extra chests in fill rooms: 1 per 3 rooms, min 1
        fillChestRatio: 3,
        fillChestMin: 1,
        // Prop density for fill rooms (passed to populateRoomProps)
        propDensity: 1.0,
        // Hazard density scaling by ascension
        hazardDensity: function (ascension) {
            return 0.02 + ascension * 0.01;
        },
    },

    // ── DOORS ──
    doors: {
        '1,4': { requiresKey: 'town_pass', label: 'Step Outside', lockedLabel: 'The way is sealed...', destination: 'town' },
        '1,5': { requiresKey: 'town_pass', label: 'Step Outside', lockedLabel: 'The way is sealed...', destination: 'town' },
        '20,17': { requiresKey: 'dungeon_key', label: 'Descend Deeper', lockedLabel: 'Locked', destination: 'next' },
    },

    // ── LIGHTS ──
    // Fixed lighting positions for Zone 1 landmarks
    lights: [
        // Cell
        { row: 2, col: 3, type: 'candle', color: [220, 180, 100], radius: 35, intensity: 0.5 },
        { row: 5, col: 2, type: 'candle', color: [220, 180, 100], radius: 30, intensity: 0.4 },
        // Corridor 1
        { row: 7, col: 4, type: 'torch', color: [255, 180, 80], radius: 50, intensity: 0.7 },
        // Guard Hall
        { row: 10, col: 2, type: 'brazier', color: [255, 160, 60], radius: 60, intensity: 0.8 },
        { row: 10, col: 7, type: 'brazier', color: [255, 160, 60], radius: 60, intensity: 0.8 },
        { row: 16, col: 2, type: 'torch', color: [255, 180, 80], radius: 45, intensity: 0.65 },
        { row: 16, col: 7, type: 'torch', color: [255, 180, 80], radius: 45, intensity: 0.65 },
        { row: 13, col: 5, type: 'fire_pit', color: [255, 140, 40], radius: 55, intensity: 0.75 },
        // Corridor 2
        { row: 12, col: 10, type: 'torch', color: [255, 180, 80], radius: 40, intensity: 0.6 },
        // Great Hall
        { row: 9, col: 13, type: 'torch', color: [255, 180, 80], radius: 50, intensity: 0.7 },
        { row: 9, col: 20, type: 'torch', color: [255, 180, 80], radius: 50, intensity: 0.7 },
        { row: 14, col: 17, type: 'brazier', color: [255, 150, 50], radius: 70, intensity: 0.85 },
        { row: 19, col: 13, type: 'torch', color: [255, 180, 80], radius: 50, intensity: 0.7 },
        { row: 19, col: 20, type: 'torch', color: [255, 180, 80], radius: 50, intensity: 0.7 },
        // Secret Alcove
        { row: 4, col: 17, type: 'crystal', color: [100, 220, 140], radius: 50, intensity: 0.6 },
        // Bone Gallery
        { row: 9, col: 24, type: 'torch', color: [255, 170, 70], radius: 50, intensity: 0.7 },
        { row: 9, col: 31, type: 'torch', color: [255, 170, 70], radius: 50, intensity: 0.7 },
        { row: 14, col: 27, type: 'brazier', color: [255, 140, 40], radius: 65, intensity: 0.8 },
        // Flooded Crypt
        { row: 4, col: 24, type: 'crystal', color: [120, 180, 220], radius: 45, intensity: 0.55 },
        { row: 4, col: 26, type: 'candle', color: [200, 180, 140], radius: 30, intensity: 0.4 },
        // King's Hollow
        { row: 21, col: 24, type: 'brazier', color: [255, 120, 40], radius: 70, intensity: 0.9 },
        { row: 21, col: 31, type: 'brazier', color: [255, 120, 40], radius: 70, intensity: 0.9 },
        { row: 28, col: 27, type: 'fire_pit', color: [255, 100, 30], radius: 80, intensity: 0.95 },
    ],
};
