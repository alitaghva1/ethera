// ============================================================
//  PROCEDURAL DUNGEON GENERATION — BSP Tree + Room Templates
//  Generates randomized dungeon layouts for Endless Dungeon mode.
//  Writes directly into existing map globals (floorMap, objectMap, etc.)
// ============================================================

// ── CONSTANTS ──
const DGEN_MIN_LEAF = 7;
const DGEN_MAX_LEAF = 18;
const DGEN_CORRIDOR_WIDTH = 2;
const DGEN_HAZARD_COOLDOWN = 0.5; // seconds between damage ticks

// ── ZONE THEMES ──
const ZONE_THEMES = {
    dungeon: {
        id: 'dungeon',
        floors: ['stoneTile', 'stone', 'stone', 'stoneTile'],
        floorAccents: ['stoneUneven', 'stoneMissing', 'stoneInset'],
        wallTile: 'wall',
        wallVariants: ['wallAged', 'wallBroken', 'wallHole'],
        cornerTile: 'wallCorner',
        archTile: 'wallArchway',
        props: [
            { obj: 'barrel', w: 3, blocks: true },
            { obj: 'barrels', w: 2, blocks: true },
            { obj: 'woodenCrate', w: 2, blocks: true },
            { obj: 'woodenPile', w: 1, blocks: true },
            { obj: 'tableRound', w: 1, blocks: true },
            { obj: 'woodenSupports', w: 1, blocks: false },
        ],
        lightType: 'torch',
        lightColor: [255, 180, 80],
        hazardTypes: ['spikes', 'acid'],
        rubbleObj: 'woodenPile',
    },
    hell: {
        id: 'hell',
        floors: ['h_floor1', 'h_floor2', 'h_floor1', 'h_floor3'],
        floorAccents: ['h_floor2', 'h_floor3', 'h_floorUp1'],
        wallTile: 'h_wallL1',
        wallVariants: ['h_wallL2', 'h_wallL3'],
        cornerTile: 'h_wallL1',
        archTile: 'h_arch1',
        props: [
            { obj: 'h_altar1', w: 2, blocks: true },
            { obj: 'h_bones1', w: 3, blocks: false },
            { obj: 'h_skull1', w: 2, blocks: false },
            { obj: 'h_candelabra1', w: 2, blocks: true },
            { obj: 'h_cage1', w: 1, blocks: true },
            { obj: 'h_grave1', w: 1, blocks: true },
        ],
        lightType: 'fire_pit',
        lightColor: [255, 100, 30],
        hazardTypes: ['lava'],
        rubbleObj: 'h_rubble1',
    },
    frozen: {
        id: 'frozen',
        floors: ['stoneTile', 'stone', 'stoneInset', 'stoneTile'],
        floorAccents: ['stoneUneven', 'stoneMissing'],
        wallTile: 'wall',
        wallVariants: ['wallAged', 'wallBroken'],
        cornerTile: 'wallCorner',
        archTile: 'wallArchway',
        props: [
            { obj: 'barrel', w: 2, blocks: true },
            { obj: 'woodenPile', w: 2, blocks: true },
            { obj: 'woodenCrate', w: 1, blocks: true },
        ],
        lightType: 'ice_crystal',
        lightColor: [100, 180, 255],
        hazardTypes: ['ice'],
        rubbleObj: 'woodenPile',
    },
    ruins: {
        id: 'ruins',
        floors: ['stoneMissing', 'stoneUneven', 'stone', 'planks'],
        floorAccents: ['planksBroken', 'planksHole', 'dirtTiles'],
        wallTile: 'wallBroken',
        wallVariants: ['wallHole', 'wallAged', 'wallHalf'],
        cornerTile: 'wallCorner',
        archTile: 'wallArchway',
        props: [
            { obj: 'woodenPile', w: 3, blocks: true },
            { obj: 'woodenCrate', w: 2, blocks: true },
            { obj: 'barrel', w: 2, blocks: true },
            { obj: 'tableChairsBroken', w: 1, blocks: true },
        ],
        lightType: 'candle',
        lightColor: [220, 180, 100],
        hazardTypes: ['spikes', 'collapse'],
        rubbleObj: 'woodenPile',
    },
    nature: {
        id: 'nature',
        floors: ['dirt', 'dirtTiles', 'dirt', 'dirtTiles'],
        floorAccents: ['stoneMissing', 'stoneUneven'],
        wallTile: 'wall',
        wallVariants: ['wallAged', 'wallBroken'],
        cornerTile: 'wallCorner',
        archTile: 'wallArchway',
        props: [
            { obj: 'barrel', w: 2, blocks: true },
            { obj: 'woodenPile', w: 3, blocks: true },
            { obj: 'woodenCrate', w: 2, blocks: true },
        ],
        lightType: 'torch',
        lightColor: [200, 220, 140],
        hazardTypes: ['acid'],
        rubbleObj: 'woodenPile',
    },
};

// Theme selection by depth
function themeForDepth(depth) {
    if (depth <= 2) return ZONE_THEMES.dungeon;
    if (depth <= 4) return ZONE_THEMES.ruins;
    if (depth <= 6) return ZONE_THEMES.hell;
    if (depth <= 8) return ZONE_THEMES.frozen;
    // Cycle for depths 9+
    const cycle = ['hell', 'frozen', 'ruins', 'dungeon'];
    return ZONE_THEMES[cycle[(depth - 9) % cycle.length]];
}

// ============================================================
//  BSP TREE
// ============================================================
function createBSPNode(x, y, w, h) {
    return { x, y, w, h, room: null, left: null, right: null, splitHorizontal: false, corridor: null };
}

function bspPartition(x, y, w, h, depth, maxDepth) {
    const node = createBSPNode(x, y, w, h);
    if (depth >= maxDepth || (w < DGEN_MIN_LEAF * 2 && h < DGEN_MIN_LEAF * 2)) {
        return node; // leaf
    }

    // Choose split axis — prefer longer, 30% random override
    let horizontal;
    if (w > h * 1.3) horizontal = false; // split vertically (wider)
    else if (h > w * 1.3) horizontal = true; // split horizontally (taller)
    else horizontal = mapRandom() < 0.5;

    // Ensure minimum child size
    const dim = horizontal ? h : w;
    if (dim < DGEN_MIN_LEAF * 2) return node; // can't split further

    // Split at 40-60% of dimension
    const minSplit = Math.floor(dim * 0.4);
    const maxSplit = Math.floor(dim * 0.6);
    const splitAt = mapRandomInt(Math.max(DGEN_MIN_LEAF, minSplit), Math.min(dim - DGEN_MIN_LEAF, maxSplit));

    node.splitHorizontal = horizontal;
    if (horizontal) {
        node.left = bspPartition(x, y, w, splitAt, depth + 1, maxDepth);
        node.right = bspPartition(x, y + splitAt, w, h - splitAt, depth + 1, maxDepth);
    } else {
        node.left = bspPartition(x, y, splitAt, h, depth + 1, maxDepth);
        node.right = bspPartition(x + splitAt, y, w - splitAt, h, depth + 1, maxDepth);
    }
    return node;
}

function getBSPLeaves(node) {
    if (!node) return [];
    if (!node.left && !node.right) return [node];
    return [...getBSPLeaves(node.left), ...getBSPLeaves(node.right)];
}

// ============================================================
//  ROOM TEMPLATES
// ============================================================
const ROOM_TEMPLATES = {
    rect: {
        id: 'rect', minW: 5, minH: 5,
        carve(leaf, theme) {
            const rw = mapRandomInt(Math.max(4, leaf.w - 4), leaf.w - 2);
            const rh = mapRandomInt(Math.max(4, leaf.h - 4), leaf.h - 2);
            const ox = leaf.x + mapRandomInt(1, leaf.w - rw - 1);
            const oy = leaf.y + mapRandomInt(1, leaf.h - rh - 1);
            return carveRect(ox, oy, rw, rh, theme, 'rect');
        }
    },
    arena: {
        id: 'arena', minW: 8, minH: 8,
        carve(leaf, theme) {
            const rw = mapRandomInt(Math.max(7, leaf.w - 3), leaf.w - 2);
            const rh = mapRandomInt(Math.max(7, leaf.h - 3), leaf.h - 2);
            const ox = leaf.x + mapRandomInt(1, Math.max(1, leaf.w - rw - 1));
            const oy = leaf.y + mapRandomInt(1, Math.max(1, leaf.h - rh - 1));
            // Arena rooms use border floor pattern for visual weight
            return carveRect(ox, oy, rw, rh, theme, 'arena');
            // Columns handled by placeStructuralColumns() in populateRoomProps
        }
    },
    corridor: {
        id: 'corridor', minW: 3, minH: 6,
        carve(leaf, theme) {
            let rw, rh;
            if (leaf.w > leaf.h) { rw = leaf.w - 2; rh = mapRandomInt(3, Math.min(4, leaf.h - 2)); }
            else { rh = leaf.h - 2; rw = mapRandomInt(3, Math.min(4, leaf.w - 2)); }
            const ox = leaf.x + mapRandomInt(1, Math.max(1, leaf.w - rw - 1));
            const oy = leaf.y + mapRandomInt(1, Math.max(1, leaf.h - rh - 1));
            return carveRect(ox, oy, rw, rh, theme, 'corridor');
        }
    },
    lshape: {
        id: 'lshape', minW: 6, minH: 6,
        carve(leaf, theme) {
            const rw = Math.max(5, leaf.w - 2);
            const rh = Math.max(5, leaf.h - 2);
            const ox = leaf.x + 1;
            const oy = leaf.y + 1;
            // Carve main rect
            const room = carveRect(ox, oy, rw, rh, theme, 'lshape');
            // Cut one corner to form L
            const cutW = mapRandomInt(2, Math.floor(rw / 2));
            const cutH = mapRandomInt(2, Math.floor(rh / 2));
            const corner = mapRandomInt(0, 3);
            let cr1, cc1, cr2, cc2;
            if (corner === 0) { cr1 = oy; cc1 = ox; cr2 = oy + cutH - 1; cc2 = ox + cutW - 1; }
            else if (corner === 1) { cr1 = oy; cc1 = ox + rw - cutW; cr2 = oy + cutH - 1; cc2 = ox + rw - 1; }
            else if (corner === 2) { cr1 = oy + rh - cutH; cc1 = ox; cr2 = oy + rh - 1; cc2 = ox + cutW - 1; }
            else { cr1 = oy + rh - cutH; cc1 = ox + rw - cutW; cr2 = oy + rh - 1; cc2 = ox + rw - 1; }
            // Re-block the cut corner
            for (let r = cr1; r <= cr2; r++) {
                for (let c = cc1; c <= cc2; c++) {
                    floorMap[r][c] = theme.wallTile;
                    blocked[r][c] = true;
                    blockType[r][c] = 'wall';
                    // Remove from room tiles
                    room.floorTiles = room.floorTiles.filter(t => t.r !== r || t.c !== c);
                }
            }
            return room;
        }
    },
    vault: {
        id: 'vault', minW: 4, minH: 4,
        carve(leaf, theme) {
            const rw = mapRandomInt(4, Math.min(5, leaf.w - 2));
            const rh = mapRandomInt(4, Math.min(5, leaf.h - 2));
            const ox = leaf.x + mapRandomInt(1, Math.max(1, leaf.w - rw - 1));
            const oy = leaf.y + mapRandomInt(1, Math.max(1, leaf.h - rh - 1));
            return carveRect(ox, oy, rw, rh, theme, 'vault');
        }
    },
    cross: {
        id: 'cross', minW: 7, minH: 7,
        carve(leaf, theme) {
            const cx = leaf.x + Math.floor(leaf.w / 2);
            const cy = leaf.y + Math.floor(leaf.h / 2);
            const armW = mapRandomInt(2, Math.min(3, Math.floor(leaf.w / 2) - 1));
            const armH = mapRandomInt(2, Math.min(3, Math.floor(leaf.h / 2) - 1));
            // Horizontal bar
            const hRoom = carveRect(leaf.x + 1, cy - armH, leaf.w - 2, armH * 2 + 1, theme, 'cross');
            // Vertical bar — merge into same room
            for (let r = leaf.y + 1; r < leaf.y + leaf.h - 1; r++) {
                for (let c = cx - armW; c <= cx + armW; c++) {
                    if (r >= 0 && r < floorMap.length && c >= 0 && c < floorMap.length) {
                        const tile = theme.floors[mapRandomInt(0, theme.floors.length - 1)];
                        floorMap[r][c] = tile;
                        blocked[r][c] = false;
                        blockType[r][c] = null;
                        if (!hRoom.floorTiles.some(t => t.r === r && t.c === c)) {
                            hRoom.floorTiles.push({ r, c, tile });
                        }
                    }
                }
            }
            // Re-wall perimeter
            wallAroundFloor(hRoom.floorTiles, theme);
            return hRoom;
        }
    },
    circular: {
        id: 'circular', minW: 7, minH: 7,
        carve(leaf, theme) {
            const rw = Math.max(6, leaf.w - 2);
            const rh = Math.max(6, leaf.h - 2);
            const ox = leaf.x + 1;
            const oy = leaf.y + 1;
            const room = carveRect(ox, oy, rw, rh, theme, 'circular');
            // Clip corners to form octagon
            const clip = Math.max(1, Math.floor(Math.min(rw, rh) / 4));
            const corners = [
                [oy, ox, oy + clip - 1, ox + clip - 1],
                [oy, ox + rw - clip, oy + clip - 1, ox + rw - 1],
                [oy + rh - clip, ox, oy + rh - 1, ox + clip - 1],
                [oy + rh - clip, ox + rw - clip, oy + rh - 1, ox + rw - 1],
            ];
            for (const [r1, c1, r2, c2] of corners) {
                for (let r = r1; r <= r2; r++) {
                    for (let c = c1; c <= c2; c++) {
                        if (r >= 0 && r < floorMap.length && c >= 0 && c < floorMap.length) {
                            floorMap[r][c] = theme.wallTile;
                            blocked[r][c] = true;
                            blockType[r][c] = 'wall';
                            room.floorTiles = room.floorTiles.filter(t => t.r !== r || t.c !== c);
                        }
                    }
                }
            }
            return room;
        }
    },
};

// Helper: carve a rectangular room with structured floor patterns
let _dgenRoomId = 0;
function carveRect(x, y, w, h, theme, templateId) {
    const r1 = y, c1 = x, r2 = y + h - 1, c2 = x + w - 1;
    const tiles = [];
    const ms = floorMap.length;

    // Choose a floor pattern for this room
    const patternType = mapRandomInt(0, 3); // 0=border, 1=checkerboard, 2=pathway, 3=plain

    for (let r = r1; r <= r2; r++) {
        for (let c = c1; c <= c2; c++) {
            if (r < 0 || r >= ms || c < 0 || c >= ms) continue;
            let tile;
            const isEdge = (r === r1 || r === r2 || c === c1 || c === c2);
            const isNearEdge = (r <= r1 + 1 || r >= r2 - 1 || c <= c1 + 1 || c >= c2 - 1);

            if (patternType === 0 && isEdge && w >= 5 && h >= 5) {
                // Border pattern: edge tiles use accent, interior uses primary
                tile = theme.floorAccents[0] || theme.floors[0];
            } else if (patternType === 1 && ((r + c) % 2 === 0) && !isEdge && w >= 6 && h >= 6) {
                // Checkerboard: alternating primary/secondary in interior
                tile = theme.floors.length > 1 ? theme.floors[1] : theme.floors[0];
            } else if (patternType === 2 && !isNearEdge && (r === Math.floor((r1 + r2) / 2) || c === Math.floor((c1 + c2) / 2))) {
                // Pathway cross: center row and column use inset tile
                tile = theme.floorAccents.length > 2 ? theme.floorAccents[2] : theme.floorAccents[0];
            } else {
                // Primary floor with very sparse accents (only 4% instead of 12%)
                tile = mapRandom() < 0.04
                    ? theme.floorAccents[mapRandomInt(0, theme.floorAccents.length - 1)]
                    : theme.floors[0]; // Use primary tile consistently, not random
            }
            floorMap[r][c] = tile;
            blocked[r][c] = false;
            blockType[r][c] = null;
            tiles.push({ r, c, tile });
        }
    }

    // Walls around perimeter (one tile outward)
    const wr1 = Math.max(0, r1 - 1), wc1 = Math.max(0, c1 - 1);
    const wr2 = Math.min(ms - 1, r2 + 1), wc2 = Math.min(ms - 1, c2 + 1);
    for (let c = wc1; c <= wc2; c++) {
        wallIfEmpty(wr1, c, theme); wallIfEmpty(wr2, c, theme);
    }
    for (let r = wr1 + 1; r < wr2; r++) {
        wallIfEmpty(r, wc1, theme); wallIfEmpty(r, wc2, theme);
    }

    // Place wall corners
    wallCorner(wr1, wc1, theme); wallCorner(wr1, wc2, theme);
    wallCorner(wr2, wc1, theme); wallCorner(wr2, wc2, theme);

    return {
        id: _dgenRoomId++,
        templateId,
        bounds: { r1, c1, r2, c2 },
        floorTiles: tiles,
        center: { r: Math.floor((r1 + r2) / 2), c: Math.floor((c1 + c2) / 2) },
        objects: [],
        spawnPoints: [],
        isSecret: false,
        isBossRoom: false,
        act: 1,
    };
}

function wallCorner(r, c, theme) {
    if (r < 0 || r >= floorMap.length || c < 0 || c >= floorMap.length) return;
    if (floorMap[r][c] && !blocked[r][c]) return;
    floorMap[r][c] = theme.cornerTile;
    blocked[r][c] = true;
    blockType[r][c] = 'wall';
}

function wallIfEmpty(r, c, theme) {
    if (r < 0 || r >= floorMap.length || c < 0 || c >= floorMap.length) return;
    if (floorMap[r][c] && !blocked[r][c]) return; // don't overwrite walkable floor
    const wallVar = mapRandom() < 0.08 ? theme.wallVariants[mapRandomInt(0, theme.wallVariants.length - 1)] : theme.wallTile;
    floorMap[r][c] = wallVar;
    blocked[r][c] = true;
    blockType[r][c] = 'wall';
}

function wallAroundFloor(floorTiles, theme) {
    const ms = floorMap.length;
    const floorSet = new Set(floorTiles.map(t => t.r * ms + t.c));
    for (const t of floorTiles) {
        for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]]) {
            const nr = t.r + dr, nc = t.c + dc;
            if (nr >= 0 && nr < ms && nc >= 0 && nc < ms && !floorSet.has(nr * ms + nc)) {
                wallIfEmpty(nr, nc, theme);
            }
        }
    }
}

function tryPlaceProp(r, c, obj, blocks) {
    if (r < 0 || r >= floorMap.length || c < 0 || c >= floorMap.length) return false;
    if (blocked[r][c] || objectMap[r][c]) return false;
    placeObj(r, c, obj, blocks);
    return true;
}

// Select a template that fits the leaf size
function selectTemplate(leafW, leafH) {
    const candidates = [];
    for (const key in ROOM_TEMPLATES) {
        const t = ROOM_TEMPLATES[key];
        if (leafW >= t.minW && leafH >= t.minH) candidates.push(t);
        // Also check flipped for non-square templates
        if (key === 'corridor' && leafH >= t.minW && leafW >= t.minH) candidates.push(t);
    }
    if (candidates.length === 0) return ROOM_TEMPLATES.rect; // fallback
    return candidates[mapRandomInt(0, candidates.length - 1)];
}

// ============================================================
//  CORRIDOR CONNECTION
// ============================================================
function connectBSPChildren(node, theme) {
    if (!node || !node.left || !node.right) return;
    // Recurse first
    connectBSPChildren(node.left, theme);
    connectBSPChildren(node.right, theme);

    // Find rooms in each subtree
    const leftRooms = getBSPLeaves(node.left).filter(l => l.room).map(l => l.room);
    const rightRooms = getBSPLeaves(node.right).filter(l => l.room).map(l => l.room);
    if (leftRooms.length === 0 || rightRooms.length === 0) return;

    // Find closest room pair
    let bestDist = Infinity, bestL = null, bestR = null;
    for (const lr of leftRooms) {
        for (const rr of rightRooms) {
            const dr = lr.center.r - rr.center.r;
            const dc = lr.center.c - rr.center.c;
            const d = dr * dr + dc * dc;
            if (d < bestDist) { bestDist = d; bestL = lr; bestR = rr; }
        }
    }
    if (!bestL || !bestR) return;

    // Carve L-shaped corridor between room centers
    carveCorridor(bestL.center.r, bestL.center.c, bestR.center.r, bestR.center.c, theme);
}

function carveCorridor(r1, c1, r2, c2, theme) {
    const ms = floorMap.length;
    const w = DGEN_CORRIDOR_WIDTH;
    const halfW = Math.floor(w / 2);

    // Choose L-shape direction: horizontal first or vertical first
    const horizFirst = mapRandom() < 0.5;
    const midR = horizFirst ? r1 : r2;
    const midC = horizFirst ? c2 : c1;

    // Horizontal segment
    const cMin = Math.min(c1, midC), cMax = Math.max(c1, midC);
    const rH = horizFirst ? r1 : r2;
    for (let c = cMin; c <= cMax; c++) {
        for (let dr = -halfW; dr <= halfW; dr++) {
            const rr = rH + dr;
            if (rr >= 0 && rr < ms && c >= 0 && c < ms) {
                if (blocked[rr][c]) {
                    const tile = theme.floors[mapRandomInt(0, theme.floors.length - 1)];
                    floorMap[rr][c] = tile;
                    blocked[rr][c] = false;
                    blockType[rr][c] = null;
                }
            }
        }
    }

    // Vertical segment
    const rMin = Math.min(r1, r2), rMax = Math.max(r1, r2);
    const cV = horizFirst ? c2 : c1;
    for (let r = rMin; r <= rMax; r++) {
        for (let dc = -halfW; dc <= halfW; dc++) {
            const cc = cV + dc;
            if (r >= 0 && r < ms && cc >= 0 && cc < ms) {
                if (blocked[r][cc]) {
                    const tile = theme.floors[mapRandomInt(0, theme.floors.length - 1)];
                    floorMap[r][cc] = tile;
                    blocked[r][cc] = false;
                    blockType[r][cc] = null;
                }
            }
        }
    }

    // Wall the corridor edges
    for (let c = cMin - 1; c <= cMax + 1; c++) {
        wallIfEmpty(rH - halfW - 1, c, theme);
        wallIfEmpty(rH + halfW + 1, c, theme);
    }
    for (let r = rMin - 1; r <= rMax + 1; r++) {
        wallIfEmpty(r, cV - halfW - 1, theme);
        wallIfEmpty(r, cV + halfW + 1, theme);
    }
    // Seal diagonal corners at the L-junction to prevent void gaps
    for (const dr of [-(halfW + 1), halfW + 1]) {
        for (const dc of [-(halfW + 1), halfW + 1]) {
            wallIfEmpty(rH + dr, cV + dc, theme);
        }
    }
}

// BFS connectivity check — returns true if all rooms are reachable from start
function validateConnectivity(rooms, startR, startC) {
    const ms = floorMap.length;
    const vis = Array.from({ length: ms }, () => Array(ms).fill(false));
    const q = [[startR, startC]];
    if (startR < 0 || startR >= ms || startC < 0 || startC >= ms) return { connected: false, unreachable: rooms };
    vis[startR][startC] = true;
    while (q.length) {
        const [r, c] = q.shift();
        for (const [dr, dc] of [[0,1],[0,-1],[1,0],[-1,0]]) {
            const nr = r + dr, nc = c + dc;
            if (nr >= 0 && nr < ms && nc >= 0 && nc < ms && !vis[nr][nc] && !blocked[nr][nc]) {
                vis[nr][nc] = true;
                q.push([nr, nc]);
            }
        }
    }
    const unreachable = rooms.filter(room => !vis[room.center.r][room.center.c]);
    return { connected: unreachable.length === 0, unreachable };
}

// ============================================================
//  PROP PLACEMENT — purposeful, not random scatter
// ============================================================

// Separate column props from decoration props — columns are architectural
function getColumnObj(theme) {
    if (theme.id === 'hell') return 'h_col1';
    return 'stoneColumn';
}

// Place columns in symmetrical architectural patterns
function placeStructuralColumns(room, theme) {
    const b = room.bounds;
    const rw = b.r2 - b.r1 + 1;
    const cw = b.c2 - b.c1 + 1;
    if (rw < 6 || cw < 6) return; // too small for columns
    if (room.templateId === 'corridor' || room.templateId === 'vault') return;

    const colObj = getColumnObj(theme);
    const midR = Math.floor((b.r1 + b.r2) / 2);
    const midC = Math.floor((b.c1 + b.c2) / 2);

    // Choose column pattern based on room size
    if (rw >= 10 && cw >= 10) {
        // Large room: paired column rows creating a processional aisle
        const inset = 2;
        const colR1 = b.r1 + inset, colR2 = b.r2 - inset;
        const colC1 = b.c1 + inset, colC2 = b.c2 - inset;
        // Two rows of columns flanking the center
        for (let r = colR1; r <= colR2; r += 3) {
            tryPlaceProp(r, colC1, colObj, true);
            tryPlaceProp(r, colC2, colObj, true);
        }
    } else if (rw >= 7 && cw >= 7) {
        // Medium room: 4 corner columns
        const off = 2;
        tryPlaceProp(b.r1 + off, b.c1 + off, colObj, true);
        tryPlaceProp(b.r1 + off, b.c2 - off, colObj, true);
        tryPlaceProp(b.r2 - off, b.c1 + off, colObj, true);
        tryPlaceProp(b.r2 - off, b.c2 - off, colObj, true);
    } else {
        // Small room: 2 flanking columns
        tryPlaceProp(midR, b.c1 + 1, colObj, true);
        tryPlaceProp(midR, b.c2 - 1, colObj, true);
    }
}

// Place decoration props in corners and along walls — never in the center
function populateRoomProps(room, theme) {
    const b = room.bounds;
    const rw = b.r2 - b.r1 + 1;
    const cw = b.c2 - b.c1 + 1;
    if (rw < 5 || cw < 5) return;

    // Step 1: Structural columns (symmetrical, architectural)
    if (mapRandom() < 0.6) placeStructuralColumns(room, theme);

    // Step 2: Corner clusters — group 1-2 props in each corner
    // Filter props to exclude columns (those are placed structurally above)
    const decoProps = theme.props.filter(p => p.obj !== 'stoneColumn' && p.obj !== 'h_col1'
        && p.obj !== 'h_col2' && p.obj !== 'h_col3');
    if (decoProps.length === 0) return;

    const corners = [
        { r: b.r1 + 1, c: b.c1 + 1 },
        { r: b.r1 + 1, c: b.c2 - 1 },
        { r: b.r2 - 1, c: b.c1 + 1 },
        { r: b.r2 - 1, c: b.c2 - 1 },
    ];

    // Place 1-2 props in 2-3 corners (not all, to avoid symmetry fatigue)
    const usedCorners = mapRandomInt(2, Math.min(3, corners.length));
    mapShuffle(corners);
    for (let i = 0; i < usedCorners; i++) {
        const cr = corners[i];
        const prop = decoProps[mapRandomInt(0, decoProps.length - 1)];
        tryPlaceProp(cr.r, cr.c, prop.obj, prop.blocks);
        // Occasionally add a second prop adjacent to the corner
        if (mapRandom() < 0.4) {
            const adj = decoProps[mapRandomInt(0, decoProps.length - 1)];
            const dr = mapRandom() < 0.5 ? 1 : 0;
            const dc = dr === 0 ? 1 : 0;
            tryPlaceProp(cr.r + dr, cr.c + dc, adj.obj, adj.blocks);
        }
    }

    // Step 3: Sparse wall-side props (1-2 along longer walls, never center)
    if (rw >= 8 || cw >= 8) {
        const wallProps = mapRandomInt(1, 2);
        for (let i = 0; i < wallProps; i++) {
            const prop = decoProps[mapRandomInt(0, decoProps.length - 1)];
            // Pick a wall-adjacent spot that's not near a corner or center
            const side = mapRandomInt(0, 3);
            let pr, pc;
            if (side === 0) { pr = b.r1 + 1; pc = mapRandomInt(b.c1 + 3, b.c2 - 3); }
            else if (side === 1) { pr = b.r2 - 1; pc = mapRandomInt(b.c1 + 3, b.c2 - 3); }
            else if (side === 2) { pr = mapRandomInt(b.r1 + 3, b.r2 - 3); pc = b.c1 + 1; }
            else { pr = mapRandomInt(b.r1 + 3, b.r2 - 3); pc = b.c2 - 1; }
            tryPlaceProp(pr, pc, prop.obj, prop.blocks);
        }
    }
}

// ============================================================
//  CONTENT POPULATION — chests, doors, spawn zones
// ============================================================
// Registries for procedural zone interactables
const PROCEDURAL_CHEST_DEFS = {};
const PROCEDURAL_DOOR_DEFS = {};

function populateContent(rooms, spawnRoom, exitRoom, depth, theme, zoneNum) {
    // Clear registries
    PROCEDURAL_CHEST_DEFS[zoneNum] = {};
    PROCEDURAL_DOOR_DEFS[zoneNum] = {};

    // Chests: 1 per 3 rooms, min 2
    const chestCount = Math.max(2, Math.floor(rooms.length / 3));
    const chestRooms = rooms.filter(r => r !== spawnRoom && r !== exitRoom);
    mapShuffle(chestRooms);
    for (let i = 0; i < Math.min(chestCount, chestRooms.length); i++) {
        const room = chestRooms[i];
        const corners = room.floorTiles.filter(t => !objectMap[t.r][t.c] && !blocked[t.r][t.c]);
        if (corners.length === 0) continue;
        const spot = corners[mapRandomInt(0, corners.length - 1)];
        placeObj(spot.r, spot.c, 'chestClosed', true);
        // Register chest definition so the interaction system recognizes it
        PROCEDURAL_CHEST_DEFS[zoneNum][spot.r + ',' + spot.c] = { type: 'loot', label: 'Open' };
    }

    // Exit stairs in exit room center
    if (exitRoom) {
        const er = exitRoom.center.r;
        const ec = exitRoom.center.c;
        if (objectMap[er][ec]) { objectMap[er][ec] = null; blocked[er][ec] = false; }
        placeObj(er, ec, theme.id === 'hell' ? 'h_stairs1' : 'stairsSpiral', true);
        // Register door definition — destination uses progression system
        PROCEDURAL_DOOR_DEFS[zoneNum][er + ',' + ec] = {
            requiresKey: null,
            label: 'Descend Deeper',
            destination: 'next', // resolved by ZONE_PROGRESSION table
        };
    }

    // Calculate spawn points per room
    for (const room of rooms) {
        room.spawnPoints = room.floorTiles.filter(t =>
            !blocked[t.r][t.c] && !objectMap[t.r][t.c]
        );
    }
}

// ============================================================
//  ENVIRONMENTAL HAZARDS
// ============================================================
let hazardMap = [];
const hazardDamageTimers = {}; // key: 'r,c' → cooldown timer

function initHazardMap(size) {
    hazardMap = Array.from({ length: size }, () => Array(size).fill(null));
    // Clear leftover damage timers from previous zones
    for (const k in hazardDamageTimers) delete hazardDamageTimers[k];
}

function placeHazards(rooms, theme, density, spawnRoom) {
    if (!theme.hazardTypes || theme.hazardTypes.length === 0) return;
    const type = theme.hazardTypes[mapRandomInt(0, theme.hazardTypes.length - 1)];
    // Spawn protection: no hazards within 3 tiles of player start
    const spawnR = spawnRoom ? spawnRoom.center.r : -99;
    const spawnC = spawnRoom ? spawnRoom.center.c : -99;

    for (const room of rooms) {
        if (room === spawnRoom) continue; // never place hazards in spawn room
        if (room.isSecret || room.floorTiles.length < 20) continue;
        const hazardCount = Math.floor(room.floorTiles.length * density);
        if (hazardCount <= 0) continue;

        // Place in clusters
        const interior = room.floorTiles.filter(t => {
            if (objectMap[t.r][t.c] || blocked[t.r][t.c]) return false;
            // Must be at least 2 tiles from room edge
            const b = room.bounds;
            return t.r > b.r1 + 1 && t.r < b.r2 - 1 && t.c > b.c1 + 1 && t.c < b.c2 - 1;
        });
        if (interior.length < 4) continue;

        // Pick a cluster center
        const center = interior[mapRandomInt(0, interior.length - 1)];
        const clusterSize = type === 'spikes' ? 1 : mapRandomInt(2, 3);

        // BFS from center to place cluster
        const placed = [];
        const cq = [{ r: center.r, c: center.c }];
        const cvis = new Set();
        cvis.add(center.r + ',' + center.c);
        while (cq.length && placed.length < clusterSize) {
            const p = cq.shift();
            if (!blocked[p.r][p.c] && !objectMap[p.r][p.c] && !hazardMap[p.r][p.c]) {
                hazardMap[p.r][p.c] = { type, damage: getHazardDamage(type), triggered: false };
                placed.push(p);
            }
            for (const [dr, dc] of [[0,1],[0,-1],[1,0],[-1,0]]) {
                const nr = p.r + dr, nc = p.c + dc;
                const key = nr + ',' + nc;
                if (!cvis.has(key) && nr >= 0 && nr < floorMap.length && nc >= 0 && nc < floorMap.length) {
                    cvis.add(key);
                    cq.push({ r: nr, c: nc });
                }
            }
        }
    }
}

function getHazardDamage(type) {
    if (type === 'lava') return 8;
    if (type === 'acid') return 5;
    if (type === 'spikes') return 15;
    if (type === 'collapse') return 20;
    return 0; // ice does no damage, just slows
}

function updateHazards(dt) {
    if (!hazardMap || hazardMap.length === 0) return;
    const pr = Math.floor(player.row);
    const pc = Math.floor(player.col);
    // Scan tiles near player
    for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
            const r = pr + dr, c = pc + dc;
            if (r < 0 || r >= hazardMap.length || c < 0 || c >= hazardMap.length) continue;
            const h = hazardMap[r][c];
            if (!h) continue;
            // Check if player overlaps this tile
            const dist = Math.sqrt((player.row - r - 0.5) ** 2 + (player.col - c - 0.5) ** 2);
            if (dist > 0.6) continue;
            // Damage cooldown
            const key = r + ',' + c;
            if (hazardDamageTimers[key] > 0) {
                hazardDamageTimers[key] -= dt;
                continue;
            }
            if (h.type === 'ice') {
                // Slow effect handled in movement — no damage
                continue;
            }
            if (h.type === 'collapse' && h.triggered) continue;
            // Deal damage
            if (playerInvTimer <= 0 && !player.dodging && !gameDead) {
                player.hp -= h.damage;
                playerInvTimer = 0.3;
                addScreenShake(3, 0.15);
                if (typeof sfxPlayerHurt === 'function') sfxPlayerHurt();
                if (player.hp <= 0) {
                    player.hp = 0;
                    deathCause = h.type === 'lava' ? 'Lava' : h.type === 'acid' ? 'Acid' : h.type === 'spikes' ? 'Spike Trap' : 'Collapsing Floor';
                }
                hazardDamageTimers[key] = DGEN_HAZARD_COOLDOWN;
                if (h.type === 'collapse') {
                    h.triggered = true;
                    // Block the tile after delay
                    setTimeout(() => {
                        if (r < blocked.length && c < blocked.length) {
                            blocked[r][c] = true;
                            blockType[r][c] = 'wall';
                            floorMap[r][c] = null;
                        }
                    }, 500);
                }
                // Spawn particles
                if (typeof spawnParticle === 'function') {
                    const color = h.type === 'lava' ? '#ff4400' : h.type === 'acid' ? '#44ff44' : h.type === 'spikes' ? '#aaaaaa' : '#886644';
                    for (let i = 0; i < 4; i++) {
                        spawnParticle(r + 0.5, c + 0.5, (Math.random() - 0.5) * 2, -Math.random() * 3, 0.4, color, 3);
                    }
                }
            }
        }
    }
}

function drawHazardOverlays() {
    if (!hazardMap || hazardMap.length === 0) return;
    const ms = hazardMap.length;
    // Only draw hazards visible on screen
    for (let r = 0; r < ms; r++) {
        for (let c = 0; c < ms; c++) {
            const h = hazardMap[r][c];
            if (!h) continue;
            if (fogRevealed[r] && fogRevealed[r][c] <= 0) continue;
            const pos = tileToScreen(r + 0.5, c + 0.5);
            const sx = pos.x + cameraX;
            const sy = pos.y + cameraY;
            // Culling
            if (sx < -80 || sx > canvasW + 80 || sy < -80 || sy > canvasH + 80) continue;

            ctx.save();
            const t = performance.now() / 1000;
            if (h.type === 'lava') {
                ctx.globalAlpha = 0.35 + Math.sin(t * 3 + r) * 0.1;
                const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, HALF_DW * 0.8);
                g.addColorStop(0, 'rgba(255, 80, 0, 0.5)');
                g.addColorStop(1, 'rgba(200, 40, 0, 0)');
                ctx.fillStyle = g;
                ctx.beginPath();
                ctx.ellipse(sx, sy, HALF_DW * 0.8, HALF_DH * 0.8, 0, 0, Math.PI * 2);
                ctx.fill();
            } else if (h.type === 'acid') {
                ctx.globalAlpha = 0.3 + Math.sin(t * 2.5 + c) * 0.08;
                const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, HALF_DW * 0.7);
                g.addColorStop(0, 'rgba(60, 255, 60, 0.4)');
                g.addColorStop(1, 'rgba(30, 180, 30, 0)');
                ctx.fillStyle = g;
                ctx.beginPath();
                ctx.ellipse(sx, sy, HALF_DW * 0.7, HALF_DH * 0.7, 0, 0, Math.PI * 2);
                ctx.fill();
            } else if (h.type === 'spikes') {
                ctx.globalAlpha = 0.5;
                ctx.strokeStyle = '#888';
                ctx.lineWidth = 1.5;
                // Draw small spike lines
                for (let i = 0; i < 3; i++) {
                    const ox = (i - 1) * 6;
                    ctx.beginPath();
                    ctx.moveTo(sx + ox, sy + 3);
                    ctx.lineTo(sx + ox, sy - 6);
                    ctx.stroke();
                }
            } else if (h.type === 'ice') {
                ctx.globalAlpha = 0.2 + Math.sin(t * 2 + r + c) * 0.05;
                ctx.fillStyle = 'rgba(150, 220, 255, 0.3)';
                ctx.beginPath();
                ctx.moveTo(sx, sy - HALF_DH * 0.8);
                ctx.lineTo(sx + HALF_DW * 0.8, sy);
                ctx.lineTo(sx, sy + HALF_DH * 0.8);
                ctx.lineTo(sx - HALF_DW * 0.8, sy);
                ctx.closePath();
                ctx.fill();
            } else if (h.type === 'collapse' && !h.triggered) {
                ctx.globalAlpha = 0.25;
                ctx.strokeStyle = '#665544';
                ctx.lineWidth = 1;
                ctx.setLineDash([3, 3]);
                ctx.beginPath();
                ctx.moveTo(sx - 10, sy - 4);
                ctx.lineTo(sx + 8, sy + 2);
                ctx.moveTo(sx - 6, sy + 3);
                ctx.lineTo(sx + 10, sy - 2);
                ctx.stroke();
                ctx.setLineDash([]);
            }
            ctx.restore();
        }
    }
}

// Per-tile hazard draw (called from isometric render loop for each visible tile)
function drawHazardOverlayTile(r, c) {
    const h = hazardMap[r] && hazardMap[r][c];
    if (!h) return;
    if (h.type === 'collapse' && h.triggered) return;
    const pos = tileToScreen(r + 0.5, c + 0.5);
    const sx = pos.x + cameraX;
    const sy = pos.y + cameraY;
    const t = performance.now() / 1000;

    ctx.save();
    if (h.type === 'lava') {
        ctx.globalAlpha = 0.3 + Math.sin(t * 3 + r) * 0.08;
        const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, HALF_DW * 0.7);
        g.addColorStop(0, 'rgba(255, 80, 0, 0.45)');
        g.addColorStop(1, 'rgba(200, 40, 0, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(sx, sy, HALF_DW * 0.7, HALF_DH * 0.7, 0, 0, Math.PI * 2);
        ctx.fill();
    } else if (h.type === 'acid') {
        ctx.globalAlpha = 0.25 + Math.sin(t * 2.5 + c) * 0.06;
        const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, HALF_DW * 0.6);
        g.addColorStop(0, 'rgba(60, 255, 60, 0.35)');
        g.addColorStop(1, 'rgba(30, 180, 30, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(sx, sy, HALF_DW * 0.6, HALF_DH * 0.6, 0, 0, Math.PI * 2);
        ctx.fill();
    } else if (h.type === 'spikes') {
        ctx.globalAlpha = 0.45;
        ctx.strokeStyle = '#999';
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 3; i++) {
            const ox = (i - 1) * 5;
            ctx.beginPath();
            ctx.moveTo(sx + ox, sy + 2);
            ctx.lineTo(sx + ox, sy - 5);
            ctx.stroke();
        }
    } else if (h.type === 'ice') {
        ctx.globalAlpha = 0.18 + Math.sin(t * 2 + r + c) * 0.04;
        ctx.fillStyle = 'rgba(150, 220, 255, 0.25)';
        ctx.beginPath();
        ctx.moveTo(sx, sy - HALF_DH * 0.7);
        ctx.lineTo(sx + HALF_DW * 0.7, sy);
        ctx.lineTo(sx, sy + HALF_DH * 0.7);
        ctx.lineTo(sx - HALF_DW * 0.7, sy);
        ctx.closePath();
        ctx.fill();
    } else if (h.type === 'collapse') {
        ctx.globalAlpha = 0.2;
        ctx.strokeStyle = '#665544';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(sx - 8, sy - 3);
        ctx.lineTo(sx + 7, sy + 2);
        ctx.moveTo(sx - 5, sy + 3);
        ctx.lineTo(sx + 8, sy - 2);
        ctx.stroke();
        ctx.setLineDash([]);
    }
    ctx.restore();
}

// ============================================================
//  SECRET ROOMS
// ============================================================
const secretWalls = [];

function placeSecretRooms(rooms, theme, chance) {
    secretWalls.length = 0;
    if (mapRandom() > chance) return;

    const ms = floorMap.length;
    // Find walls with empty space behind them
    for (const room of rooms) {
        if (room.isSecret) continue;
        const b = room.bounds;
        // Check each wall side for empty space
        const candidates = [];
        // North wall
        if (b.r1 - 5 >= 1) {
            const spaceOk = checkEmptySpace(b.r1 - 5, b.c1, 4, Math.min(5, b.c2 - b.c1));
            if (spaceOk) candidates.push({ dir: 'N', sr: b.r1 - 5, sc: b.c1, wallR: b.r1 - 1, wallC: Math.floor((b.c1 + b.c2) / 2) });
        }
        // South wall
        if (b.r2 + 6 < ms) {
            const spaceOk = checkEmptySpace(b.r2 + 2, b.c1, 4, Math.min(5, b.c2 - b.c1));
            if (spaceOk) candidates.push({ dir: 'S', sr: b.r2 + 2, sc: b.c1, wallR: b.r2 + 1, wallC: Math.floor((b.c1 + b.c2) / 2) });
        }
        if (candidates.length === 0) continue;

        const pick = candidates[mapRandomInt(0, candidates.length - 1)];
        // Carve secret room
        const secretRoom = carveRect(pick.sc, pick.sr, 4, 4, theme, 'vault');
        secretRoom.isSecret = true;
        rooms.push(secretRoom);

        // Place cracked wall hint
        floorMap[pick.wallR][pick.wallC] = 'wallBroken';
        blocked[pick.wallR][pick.wallC] = true;
        blockType[pick.wallR][pick.wallC] = 'wall';
        secretWalls.push({ r: pick.wallR, c: pick.wallC, revealed: false, theme });

        // Place chest in secret room
        const chestR = pick.sr + 1, chestC = pick.sc + 1;
        if (!objectMap[chestR][chestC] && !blocked[chestR][chestC]) {
            placeObj(chestR, chestC, 'chestClosed', true);
        }

        break; // max 1 secret room
    }
}

function checkEmptySpace(r, c, h, w) {
    const ms = floorMap.length;
    for (let dr = 0; dr < h; dr++) {
        for (let dc = 0; dc < w; dc++) {
            const nr = r + dr, nc = c + dc;
            if (nr < 0 || nr >= ms || nc < 0 || nc >= ms) return false;
            if (floorMap[nr][nc] !== null) return false; // occupied
        }
    }
    return true;
}

function checkSecretWalls() {
    if (secretWalls.length === 0) return;
    // Check if player is attacking adjacent to a secret wall
    if (!player.attacking) return;
    const pr = Math.floor(player.row);
    const pc = Math.floor(player.col);
    for (const sw of secretWalls) {
        if (sw.revealed) continue;
        const dr = Math.abs(pr - sw.r);
        const dc = Math.abs(pc - sw.c);
        if (dr <= 1 && dc <= 1) {
            sw.revealed = true;
            openTile(sw.r, sw.c, sw.theme.floors[0]);
            if (typeof Notify !== 'undefined') {
                Notify.hint('secret_found', 'A hidden passage revealed!', 3, { color: '#ffd866', borderColor: '#8a7030' });
            }
            addScreenShake(4, 0.3);
            // Dust particles
            if (typeof spawnParticle === 'function') {
                for (let i = 0; i < 8; i++) {
                    spawnParticle(sw.r + 0.5, sw.c + 0.5, (Math.random() - 0.5) * 3, -Math.random() * 2, 0.6, '#aa9977', 2);
                }
            }
        }
    }
}

// ============================================================
//  SEAL BOUNDARY (Act 1 → Act 2)
// ============================================================
function placeSealBoundary(rooms, spawnRoom, exitRoom, zoneNum, theme) {
    if (rooms.length < 5) return; // not enough rooms for seal
    // Find rooms along the path from spawn to exit
    // Use simple distance: split at roughly the median distance from spawn
    const spawnDist = rooms.map(r => {
        const dr = r.center.r - spawnRoom.center.r;
        const dc = r.center.c - spawnRoom.center.c;
        return { room: r, dist: Math.sqrt(dr * dr + dc * dc) };
    });
    spawnDist.sort((a, b) => a.dist - b.dist);
    const midIdx = Math.floor(spawnDist.length * 0.45);

    // The seal goes between the room at midIdx and midIdx+1
    const act1Last = spawnDist[midIdx].room;
    const act2First = spawnDist[midIdx + 1] ? spawnDist[midIdx + 1].room : null;
    if (!act2First) return;

    // Mark acts
    for (let i = 0; i <= midIdx; i++) spawnDist[i].room.act = 1;
    for (let i = midIdx + 1; i < spawnDist.length; i++) spawnDist[i].room.act = 2;

    // Find the corridor tiles between act1Last and act2First
    // Seal the midpoint between them
    const sealR = Math.floor((act1Last.center.r + act2First.center.r) / 2);
    const sealC = Math.floor((act1Last.center.c + act2First.center.c) / 2);

    // Build seal wall (3 tiles wide)
    const sealTiles = [];
    for (let d = -1; d <= 1; d++) {
        const sr = sealR + d;
        if (sr >= 0 && sr < floorMap.length && sealC >= 0 && sealC < floorMap.length) {
            if (!blocked[sr][sealC]) {
                floorMap[sr][sealC] = theme.wallTile;
                blocked[sr][sealC] = true;
                blockType[sr][sealC] = 'wall';
                sealTiles.push({ r: sr, c: sealC });
            }
        }
    }
    if (sealTiles.length === 0) return;

    zoneSealData[zoneNum] = {
        sealTiles,
        rubbleTiles: [{ r: sealTiles[0].r, c: sealTiles[0].c, obj: theme.rubbleObj }],
        chestTile: { r: act2First.center.r, c: act2First.center.c },
    };
}

// ============================================================
//  WAVE GENERATION FOR PROCEDURAL ZONES
// ============================================================
const PROCEDURAL_WAVES = {};

const DGEN_ENEMY_ROSTER = [
    { depth: 1, types: ['slime', 'slime', 'skeleton'], boss: null },
    { depth: 2, types: ['slime', 'skeleton', 'skeleton'], boss: 'slimeking' },
    { depth: 3, types: ['skeleton', 'skelarch', 'skeleton'], boss: 'bonecolossus' },
    { depth: 4, types: ['skeleton', 'skelarch', 'armoredskel'], boss: 'bonecolossus' },
    { depth: 5, types: ['skelarch', 'armoredskel', 'skeleton'], boss: 'infernalknight' },
    { depth: 6, types: ['armoredskel', 'skelarch', 'armoredskel'], boss: 'infernalknight' },
    { depth: 7, types: ['armoredskel', 'werewolf', 'skelarch'], boss: 'frostwyrm' },
    { depth: 8, types: ['werewolf', 'armoredskel', 'skelarch'], boss: 'frostwyrm' },
];

function generateWaves(rooms, depth, zoneNum, spawnRoom) {
    const waveCount = Math.min(8, 4 + Math.floor(depth / 2));
    const rosterIdx = Math.min(depth, DGEN_ENEMY_ROSTER.length) - 1;
    const roster = DGEN_ENEMY_ROSTER[rosterIdx] || DGEN_ENEMY_ROSTER[DGEN_ENEMY_ROSTER.length - 1];
    const baseMult = 1.0 + (depth - 1) * 0.35;
    const waves = [];

    // Combat rooms — exclude spawn room and secret rooms so wave 0 doesn't hit player on entry
    const combatRooms = rooms.filter(r => r !== spawnRoom && !r.isSecret && r.spawnPoints && r.spawnPoints.length > 0);

    for (let i = 0; i < waveCount; i++) {
        const enemyCount = 3 + Math.floor(i * 1.5) + Math.floor(depth * 0.5);
        const enemies = [];
        for (let e = 0; e < enemyCount; e++) {
            enemies.push({ type: roster.types[e % roster.types.length], count: 1 });
        }
        // Consolidate by type
        const grouped = {};
        for (const eg of enemies) {
            grouped[eg.type] = (grouped[eg.type] || 0) + eg.count;
        }
        const waveEnemies = Object.entries(grouped).map(([type, count]) => ({ type, count }));

        // Pick a spawn room for this wave
        const room = combatRooms[i % combatRooms.length];
        const b = room ? room.bounds : null;

        waves.push({
            enemies: waveEnemies,
            statMult: baseMult + i * 0.15,
            spawnZone: b ? { rMin: b.r1, rMax: b.r2, cMin: b.c1, cMax: b.c2 } : null,
            title: `Wave ${i + 1}`,
            subtitle: i === waveCount - 1 && roster.boss ? 'The guardian stirs...' : '',
            isBossWave: i === waveCount - 1 && roster.boss,
            bossType: i === waveCount - 1 ? roster.boss : null,
        });
    }

    PROCEDURAL_WAVES[zoneNum] = waves;
    return waves;
}

// ============================================================
//  LIGHTING FOR PROCEDURAL ZONES
// ============================================================
const PROCEDURAL_LIGHTS = {};

function generateLights(rooms, theme, zoneNum) {
    const lights = [];
    for (const room of rooms) {
        if (room.isSecret) continue;
        const area = room.floorTiles.length;
        const lightCount = Math.max(1, Math.floor(area / 25));
        // Place lights near walls
        const wallAdj = room.floorTiles.filter(t => {
            for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
                const nr = t.r + dr, nc = t.c + dc;
                if (nr >= 0 && nr < floorMap.length && nc >= 0 && nc < floorMap.length && blocked[nr][nc]) return true;
            }
            return false;
        });
        mapShuffle(wallAdj);
        for (let i = 0; i < Math.min(lightCount, wallAdj.length); i++) {
            lights.push({
                row: wallAdj[i].r, col: wallAdj[i].c,
                type: theme.lightType,
                color: theme.lightColor,
                radius: 35 + mapRandomInt(0, 15),
                intensity: 0.6 + mapRandom() * 0.3,
            });
        }
    }
    PROCEDURAL_LIGHTS[zoneNum] = lights;
    // Write directly into the renderer's ENV_LIGHTS so buildEnvironmentLights() finds them
    if (typeof ENV_LIGHTS !== 'undefined') ENV_LIGHTS[zoneNum] = lights;
    return lights;
}

// ============================================================
//  MAIN ENTRY POINT
// ============================================================
let proceduralSpawnRow = 4;
let proceduralSpawnCol = 4;
let proceduralDepth = 1;
let isProceduralZone = false;

function generateProceduralZone(params) {
    const {
        mapSize = 32,
        depth = 1,
        theme = ZONE_THEMES.dungeon,
        seed = Date.now(),
        enableSeal = true,
        hazardDensity = 0.03,
        secretChance = 0.3,
    } = params;

    const zoneNum = 99 + depth;
    proceduralDepth = depth;
    isProceduralZone = true;
    _dgenRoomId = 0;

    // Seed PRNG
    seedMapRNG(seed);

    // Initialize hazard map
    initHazardMap(mapSize);
    secretWalls.length = 0;

    // Phase 1: BSP partition
    const targetRooms = Math.min(14, 6 + depth);
    const maxBSPDepth = Math.ceil(Math.log2(targetRooms)) + 1;
    const root = bspPartition(1, 1, mapSize - 2, mapSize - 2, 0, maxBSPDepth);

    // Phase 2: Carve rooms
    const leaves = getBSPLeaves(root);
    const rooms = [];
    for (const leaf of leaves) {
        if (leaf.w < 4 || leaf.h < 4) continue;
        const template = selectTemplate(leaf.w, leaf.h);
        const room = template.carve(leaf, theme);
        leaf.room = room;
        rooms.push(room);
    }

    if (rooms.length === 0) {
        // Emergency: carve one room in the center
        const room = carveRect(Math.floor(mapSize / 4), Math.floor(mapSize / 4),
            Math.floor(mapSize / 2), Math.floor(mapSize / 2), theme, 'rect');
        rooms.push(room);
    }

    // Phase 3: Connect corridors
    connectBSPChildren(root, theme);

    // Phase 4: Entrance + exit
    // Sort by distance from top-left
    rooms.sort((a, b) => (a.center.r + a.center.c) - (b.center.r + b.center.c));
    const spawnRoom = rooms[0];
    const exitRoom = rooms[rooms.length - 1];
    exitRoom.isBossRoom = depth >= 2;

    // Set spawn position
    proceduralSpawnRow = spawnRoom.center.r + 0.5;
    proceduralSpawnCol = spawnRoom.center.c + 0.5;

    // Phase 5: Validate connectivity
    const check = validateConnectivity(rooms, spawnRoom.center.r, spawnRoom.center.c);
    if (!check.connected) {
        // Emergency corridors to unreachable rooms
        for (const ur of check.unreachable) {
            // Find nearest reachable room
            let bestDist = Infinity, bestRoom = spawnRoom;
            for (const r of rooms) {
                if (check.unreachable.includes(r)) continue;
                const d = (r.center.r - ur.center.r) ** 2 + (r.center.c - ur.center.c) ** 2;
                if (d < bestDist) { bestDist = d; bestRoom = r; }
            }
            carveCorridor(bestRoom.center.r, bestRoom.center.c, ur.center.r, ur.center.c, theme);
        }
    }

    // Phase 6: Seal boundary
    if (enableSeal && rooms.length >= 5) {
        placeSealBoundary(rooms, spawnRoom, exitRoom, zoneNum, theme);
    }

    // Phase 7: Props
    for (const room of rooms) {
        populateRoomProps(room, theme);
    }

    // Phase 8: Content (chests, doors, spawn zones)
    populateContent(rooms, spawnRoom, exitRoom, depth, theme, zoneNum);

    // Phase 9: Hazards (exclude spawn area)
    placeHazards(rooms, theme, hazardDensity + depth * 0.005, spawnRoom);

    // Phase 10: Secret rooms
    placeSecretRooms(rooms, theme, secretChance);

    // Phase 11: Lighting
    generateLights(rooms, theme, zoneNum);

    // Phase 12: Waves (exclude spawn room from combat)
    generateWaves(rooms, depth, zoneNum, spawnRoom);

    // Phase 13: Wall seam cleanup — seal any null tile adjacent to floor
    const ms = floorMap.length;
    for (let r = 0; r < ms; r++) {
        for (let c = 0; c < ms; c++) {
            if (!floorMap[r][c] || blocked[r][c]) continue; // only check floor tiles
            for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]]) {
                const nr = r + dr, nc = c + dc;
                if (nr >= 0 && nr < ms && nc >= 0 && nc < ms && floorMap[nr][nc] === null) {
                    wallIfEmpty(nr, nc, theme);
                }
            }
        }
    }

    return {
        spawnRow: proceduralSpawnRow,
        spawnCol: proceduralSpawnCol,
        rooms,
        zoneNum,
    };
}
