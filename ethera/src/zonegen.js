// ============================================================
//  ZONE GENERATION ENGINE — Template-Based Hybrid Generator
//  Executes zone templates (from zonetemplates.js) to produce
//  maps that are identical to hand-authored zones at Ascension 0,
//  but expand with BSP-generated fill rooms at higher Ascension.
//
//  All functions are GLOBAL — no modules.
//  Reads/writes existing globals: floorMap, blocked, blockType,
//  objectMap, objRadius, fogRevealed, zoneSealData, DOOR_DEFS,
//  ENV_LIGHTS, z1AlcoveSealTiles, ZONE_EXPANSIONS
//  Uses existing helpers: fillFloor, addWalls, placeObj, openTile,
//  seedMapRNG, initHazardMap, bspPartition, getBSPLeaves,
//  ROOM_TEMPLATES, connectBSPChildren, carveCorridor,
//  populateRoomProps, placeHazards, validateConnectivity,
//  ZONE_THEMES, mapRandom, mapRandomInt, mapShuffle
// ============================================================

// ── Main entry point ──
// Generates a zone from a template + ascension level.
// At ascension 0, output is functionally identical to the
// hand-authored generateDungeon() / generateZoneN() functions.
function generateZoneFromTemplate(template, ascension) {
    ascension = ascension || 0;

    const theme = ZONE_THEMES[template.theme] || ZONE_THEMES.dungeon;
    const mapSize = template.mapSize || MAP_SIZE;

    // ── Step 1: Seed RNG ──
    seedMapRNG(Date.now());

    // ── Step 2: Initialize hazard map ──
    initHazardMap(mapSize);

    // ── Step 3: Carve all landmarks ──
    const landmarkRooms = [];
    const landmarkMap = {};  // id -> room record

    for (const lm of template.landmarks) {
        // Execute the landmark's carve function — this writes directly
        // into floorMap/blocked/objectMap just like generateDungeon() does
        lm.carve();

        // Build a room record compatible with the BSP room format
        const b = lm.bounds;
        const floorTiles = [];
        for (let r = b.r1; r <= b.r2; r++) {
            for (let c = b.c1; c <= b.c2; c++) {
                if (!blocked[r][c] && floorMap[r][c]) {
                    floorTiles.push({ r, c, tile: floorMap[r][c] });
                }
            }
        }
        const room = {
            id: lm.id,
            templateId: 'landmark',
            bounds: b,
            floorTiles: floorTiles,
            center: {
                r: Math.floor((b.r1 + b.r2) / 2),
                c: Math.floor((b.c1 + b.c2) / 2),
            },
            objects: [],
            spawnPoints: [],
            isSecret: false,
            isBossRoom: lm.id === 'kings_hollow',
            act: lm.act || 1,
            landmarkId: lm.id,
        };
        landmarkRooms.push(room);
        landmarkMap[lm.id] = room;
    }

    // ── Step 4: Carve fixed corridors ──
    // At Ascension 0 these are always carved. At higher ascension
    // they serve as fallback if fill regions produce 0 rooms.
    if (template.corridors) {
        for (const corr of template.corridors) {
            corr.carve();
        }
    }

    // ── Step 5: Process fill regions ──
    const fillRooms = [];

    for (const region of (template.fillRegions || [])) {
        const roomCount = _calcFillRoomCount(region, ascension);

        if (roomCount <= 0) {
            // No fill rooms — the fixed corridor already provides connectivity.
            // If no matching fixed corridor exists, carve a simple corridor
            // between the connected landmarks.
            const hasCorridor = template.corridors &&
                template.corridors.some(function (c) { return c.id === region.id; });
            if (!hasCorridor) {
                _carveLandmarkCorridor(region, landmarkMap, theme);
            }
            continue;
        }

        // Run BSP within the region bounds
        const b = region.bounds;
        const regionW = b.c2 - b.c1 + 1;
        const regionH = b.r2 - b.r1 + 1;

        if (regionW < DGEN_MIN_LEAF || regionH < DGEN_MIN_LEAF) {
            // Region too small for BSP — just carve a corridor
            _carveLandmarkCorridor(region, landmarkMap, theme);
            continue;
        }

        const maxDepth = Math.ceil(Math.log2(roomCount + 1)) + 1;
        const root = bspPartition(b.c1, b.r1, regionW, regionH, 0, maxDepth);
        const leaves = getBSPLeaves(root);

        let carved = 0;
        for (const leaf of leaves) {
            if (carved >= roomCount) break;
            if (leaf.w < 4 || leaf.h < 4) continue;

            // Filter to allowed templates
            var tmpl = _selectAllowedTemplate(leaf.w, leaf.h, region.allowedTemplates);
            var room = tmpl.carve(leaf, theme);
            room.act = region.act || 1;
            leaf.room = room;
            fillRooms.push(room);
            carved++;
        }

        // Connect BSP children
        connectBSPChildren(root, theme);
    }

    // ── Step 6: Connect landmarks to fill regions ──
    if (fillRooms.length > 0) {
        _connectLandmarksToFillRegions(template, landmarkMap, fillRooms, theme);
    }

    // ── Step 7: Validate connectivity ──
    const allRooms = landmarkRooms.concat(fillRooms);
    var spawnLandmark = template.landmarks[0]; // first landmark = spawn
    var spawnR = spawnLandmark.spawnPoint
        ? spawnLandmark.spawnPoint.r
        : Math.floor((spawnLandmark.bounds.r1 + spawnLandmark.bounds.r2) / 2);
    var spawnC = spawnLandmark.spawnPoint
        ? spawnLandmark.spawnPoint.c
        : Math.floor((spawnLandmark.bounds.c1 + spawnLandmark.bounds.c2) / 2);

    // Only validate Act 1 connectivity (Act 2 is behind the seal)
    var act1Rooms = allRooms.filter(function (rm) { return rm.act === 1; });
    var result = validateConnectivity(act1Rooms, spawnR, spawnC);
    if (!result.connected) {
        // Emergency: carve corridors to unreachable rooms
        for (var i = 0; i < result.unreachable.length; i++) {
            var ur = result.unreachable[i];
            carveCorridor(spawnR, spawnC, ur.center.r, ur.center.c, theme);
        }
    }

    // ── Step 8: Setup seal ──
    if (template.seal) {
        zoneSealData[template.id] = {
            sealTiles: template.seal.sealTiles.slice(),
            rubbleTiles: template.seal.rubbleTiles ? template.seal.rubbleTiles.slice() : [],
            chestTile: template.seal.chestTile
                ? { r: template.seal.chestTile.r, c: template.seal.chestTile.c }
                : null,
        };
    }

    // Alcove mini-seal (Zone 1 specific)
    if (template.alcoveSeal) {
        z1AlcoveSealTiles = template.alcoveSeal.map(function (t) {
            return { r: t.r, c: t.c };
        });
    }

    // Expansion config
    if (template.expansion) {
        ZONE_EXPANSIONS[template.id] = {
            triggerAfterWaveIndex: template.expansion.triggerAfterWaveIndex,
            bannerText: template.expansion.bannerText,
            bannerSub: template.expansion.bannerSub,
            cameraTarget: template.expansion.cameraTarget,
            shakeIntensity: template.expansion.shakeIntensity,
            shakeDuration: template.expansion.shakeDuration,
            breatherChest: template.expansion.breatherChest,
        };
    }

    // ── Step 9: Populate fill room props ──
    for (var fi = 0; fi < fillRooms.length; fi++) {
        populateRoomProps(fillRooms[fi], theme);
    }

    // ── Step 10: Place chests ──
    _placeChests(template, allRooms, fillRooms, ascension);

    // ── Step 11: Apply ascension modifiers ──
    if (ascension > 0) {
        // Extra hazards in non-spawn rooms
        var hazardDensity = template.content && template.content.hazardDensity
            ? template.content.hazardDensity(ascension)
            : 0.02 + ascension * 0.01;
        var nonSpawnRooms = allRooms.filter(function (rm) { return rm.landmarkId !== 'cell'; });
        if (nonSpawnRooms.length > 0) {
            placeHazards(nonSpawnRooms, theme, hazardDensity, landmarkMap['cell']);
        }
    }

    // ── Step 12: Resolve waves ──
    var resolvedWaves = _resolveWaves(template, allRooms, ascension);

    // ── Step 13: Register doors ──
    _registerDoors(template);

    // ── Step 14: Generate lighting ──
    _generateLighting(template, allRooms, fillRooms, theme);

    // Calculate spawn points per room
    for (var ri = 0; ri < allRooms.length; ri++) {
        var rm = allRooms[ri];
        rm.spawnPoints = rm.floorTiles.filter(function (t) {
            return !blocked[t.r][t.c] && !objectMap[t.r][t.c];
        });
    }

    return {
        rooms: allRooms,
        landmarkRooms: landmarkRooms,
        fillRooms: fillRooms,
        waves: resolvedWaves,
        spawnRow: spawnR,
        spawnCol: spawnC,
        mapSize: mapSize,
    };
}


// ============================================================
//  HELPER: Calculate fill room count for a region
// ============================================================
function _calcFillRoomCount(region, ascension) {
    // At ascension 0, minRooms (usually 0) rooms are generated.
    // Each ascension level adds 1 room up to maxRooms.
    var min = region.minRooms || 0;
    var max = region.maxRooms || 0;
    return min + Math.min(ascension, max - min);
}


// ============================================================
//  HELPER: Carve a simple corridor between two landmarks
//  Used when a fill region produces 0 rooms.
// ============================================================
function _carveLandmarkCorridor(region, landmarkMap, theme) {
    var fromRoom = landmarkMap[region.connectsFrom];
    var toRoom = landmarkMap[region.connectsTo];
    if (!fromRoom || !toRoom) return;

    carveCorridor(
        fromRoom.center.r, fromRoom.center.c,
        toRoom.center.r, toRoom.center.c,
        theme
    );
}


// ============================================================
//  HELPER: Select a room template from allowed list
// ============================================================
function _selectAllowedTemplate(leafW, leafH, allowedIds) {
    if (!allowedIds || allowedIds.length === 0) {
        // Fall back to standard selection
        return _selectAnyTemplate(leafW, leafH);
    }

    var candidates = [];
    for (var i = 0; i < allowedIds.length; i++) {
        var tid = allowedIds[i];
        var tmpl = ROOM_TEMPLATES[tid];
        if (!tmpl) continue;
        if (leafW >= tmpl.minW && leafH >= tmpl.minH) candidates.push(tmpl);
        if (tid === 'corridor' && leafH >= tmpl.minW && leafW >= tmpl.minH) candidates.push(tmpl);
    }
    if (candidates.length === 0) return ROOM_TEMPLATES.rect;
    return candidates[mapRandomInt(0, candidates.length - 1)];
}

function _selectAnyTemplate(leafW, leafH) {
    var candidates = [];
    for (var key in ROOM_TEMPLATES) {
        var t = ROOM_TEMPLATES[key];
        if (leafW >= t.minW && leafH >= t.minH) candidates.push(t);
        if (key === 'corridor' && leafH >= t.minW && leafW >= t.minH) candidates.push(t);
    }
    if (candidates.length === 0) return ROOM_TEMPLATES.rect;
    return candidates[mapRandomInt(0, candidates.length - 1)];
}


// ============================================================
//  HELPER: Connect landmarks to BSP fill rooms
//  For each fill region, connect its source/destination landmarks
//  to the nearest fill room in that region.
// ============================================================
function _connectLandmarksToFillRegions(template, landmarkMap, fillRooms, theme) {
    for (var ri = 0; ri < (template.fillRegions || []).length; ri++) {
        var region = template.fillRegions[ri];
        var b = region.bounds;

        // Find fill rooms that fall within this region's bounds
        var regionFillRooms = fillRooms.filter(function (rm) {
            return rm.center.r >= b.r1 && rm.center.r <= b.r2 &&
                   rm.center.c >= b.c1 && rm.center.c <= b.c2;
        });
        if (regionFillRooms.length === 0) continue;

        // Connect source landmark to nearest fill room
        var fromLm = landmarkMap[region.connectsFrom];
        if (fromLm) {
            var nearestFrom = _findNearestRoom(fromLm, regionFillRooms);
            if (nearestFrom) {
                carveCorridor(fromLm.center.r, fromLm.center.c,
                              nearestFrom.center.r, nearestFrom.center.c, theme);
            }
        }

        // Connect destination landmark to nearest fill room
        var toLm = landmarkMap[region.connectsTo];
        if (toLm) {
            var nearestTo = _findNearestRoom(toLm, regionFillRooms);
            if (nearestTo) {
                carveCorridor(toLm.center.r, toLm.center.c,
                              nearestTo.center.r, nearestTo.center.c, theme);
            }
        }
    }
}

function _findNearestRoom(origin, rooms) {
    var bestDist = Infinity;
    var best = null;
    for (var i = 0; i < rooms.length; i++) {
        var rm = rooms[i];
        var dr = origin.center.r - rm.center.r;
        var dc = origin.center.c - rm.center.c;
        var d = dr * dr + dc * dc;
        if (d < bestDist) { bestDist = d; best = rm; }
    }
    return best;
}


// ============================================================
//  HELPER: Resolve waves — base at Asc 0, random variant at Asc 1+
//  Also applies stat scaling for ascension.
// ============================================================
function _resolveWaves(template, allRooms, ascension) {
    if (!template.waves) return [];

    var resolved = [];
    for (var i = 0; i < template.waves.length; i++) {
        var slot = template.waves[i];
        var wave;

        if (ascension <= 0 || !slot.variants || slot.variants.length === 0) {
            // Use base composition
            wave = _cloneWave(slot.base);
        } else {
            // Pick a random variant
            var vi = mapRandomInt(0, slot.variants.length - 1);
            wave = _cloneWave(slot.variants[vi]);
        }

        // Apply ascension stat scaling: +10% per ascension level
        if (ascension > 0) {
            wave.statMult = wave.statMult * (1.0 + ascension * 0.1);
            // Scale enemy counts: +1 per enemy type per 2 ascension levels
            var countBonus = Math.floor(ascension / 2);
            if (countBonus > 0) {
                for (var ei = 0; ei < wave.enemies.length; ei++) {
                    wave.enemies[ei].count += countBonus;
                }
            }
        }

        resolved.push(wave);
    }

    return resolved;
}

function _cloneWave(src) {
    return {
        enemies: src.enemies.map(function (e) { return { type: e.type, count: e.count }; }),
        statMult: src.statMult,
        title: src.title,
        spawnZone: src.spawnZone ? {
            rMin: src.spawnZone.rMin,
            rMax: src.spawnZone.rMax,
            cMin: src.spawnZone.cMin,
            cMax: src.spawnZone.cMax,
        } : null,
        isExpansionTrigger: src.isExpansionTrigger || false,
        isBossWave: src.isBossWave || false,
    };
}


// ============================================================
//  HELPER: Place chests — fixed chests always, random in fill rooms
// ============================================================
function _placeChests(template, allRooms, fillRooms, ascension) {
    // Fixed chests are already placed by landmark carve functions —
    // they call placeObj('chestClosed') directly. Nothing to do here
    // for fixed chests.

    // Extra chests in fill rooms (only if there are fill rooms)
    if (fillRooms.length === 0) return;

    var content = template.content || {};
    var ratio = content.fillChestRatio || 3;
    var minChests = content.fillChestMin || 1;
    var chestCount = Math.max(minChests, Math.floor(fillRooms.length / ratio));

    // Additional chest per 2 ascension levels
    chestCount += Math.floor(ascension / 2);

    // Shuffle fill rooms and place chests
    var candidates = fillRooms.slice();
    mapShuffle(candidates);

    for (var i = 0; i < Math.min(chestCount, candidates.length); i++) {
        var room = candidates[i];
        // Find an open tile near a wall (corner preference)
        var openTiles = room.floorTiles.filter(function (t) {
            return !objectMap[t.r][t.c] && !blocked[t.r][t.c];
        });
        if (openTiles.length === 0) continue;

        var spot = openTiles[mapRandomInt(0, openTiles.length - 1)];
        placeObj(spot.r, spot.c, 'chestClosed', true);
    }
}


// ============================================================
//  HELPER: Register doors into DOOR_DEFS
// ============================================================
function _registerDoors(template) {
    if (!template.doors) return;

    // The door system reads DOOR_DEFS via updateDoorDefsForZone().
    // We store the template's door definitions so they can be
    // picked up by that function. The actual DOOR_DEFS assignment
    // happens in updateDoorDefsForZone() in interactables.js,
    // but we ensure the template data is accessible.
    //
    // For now, the existing updateDoorDefsForZone() handles
    // Zone 1 doors directly. This function is a hook for future
    // template-driven door registration.
    //
    // Store on the template for external access if needed:
    template._resolvedDoors = template.doors;
}


// ============================================================
//  HELPER: Generate lighting — fixed lights + generated for fills
// ============================================================
function _generateLighting(template, allRooms, fillRooms, theme) {
    // Start with the fixed lights from the template
    var lights = [];
    if (template.lights) {
        for (var i = 0; i < template.lights.length; i++) {
            lights.push(template.lights[i]);
        }
    }

    // Generate lights for fill rooms (same logic as dungeongen.js generateLights)
    for (var fi = 0; fi < fillRooms.length; fi++) {
        var room = fillRooms[fi];
        var area = room.floorTiles.length;
        var lightCount = Math.max(1, Math.floor(area / 25));

        // Place lights near walls
        var wallAdj = room.floorTiles.filter(function (t) {
            for (var di = 0; di < 4; di++) {
                var dr = [[-1, 0], [1, 0], [0, -1], [0, 1]][di];
                var nr = t.r + dr[0], nc = t.c + dr[1];
                if (nr >= 0 && nr < floorMap.length && nc >= 0 && nc < floorMap.length && blocked[nr][nc]) return true;
            }
            return false;
        });
        mapShuffle(wallAdj);

        for (var li = 0; li < Math.min(lightCount, wallAdj.length); li++) {
            lights.push({
                row: wallAdj[li].r,
                col: wallAdj[li].c,
                type: theme.lightType,
                color: theme.lightColor.slice(),
                radius: 35 + mapRandomInt(0, 15),
                intensity: 0.6 + mapRandom() * 0.3,
            });
        }
    }

    // Write into ENV_LIGHTS for the renderer
    if (typeof ENV_LIGHTS !== 'undefined') {
        ENV_LIGHTS[template.id] = lights;
    }

    return lights;
}
