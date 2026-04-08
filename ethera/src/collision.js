// ============================================================
//  COLLISION SYSTEM
// ============================================================
const COL_EPS = 0.005;

function canMoveTo(newRow, newCol) {
    // Check tiles the player hitbox overlaps (2-tile radius scan)
    const scanR0 = Math.floor(newRow - HITBOX_RADIUS - 0.5);
    const scanR1 = Math.floor(newRow + HITBOX_RADIUS + 0.5);
    const scanC0 = Math.floor(newCol - HITBOX_RADIUS - 0.5);
    const scanC1 = Math.floor(newCol + HITBOX_RADIUS + 0.5);

    for (let r = scanR0; r <= scanR1; r++) {
        for (let c = scanC0; c <= scanC1; c++) {
            if (r < 0 || r >= floorMap.length || c < 0 || c >= floorMap.length) {
                // Out of bounds tiles are always blocked
                // Check if player hitbox actually overlaps this OOB tile
                const pr0 = newRow - HITBOX_RADIUS + COL_EPS;
                const pr1 = newRow + HITBOX_RADIUS - COL_EPS;
                const pc0 = newCol - HITBOX_RADIUS + COL_EPS;
                const pc1 = newCol + HITBOX_RADIUS - COL_EPS;
                if (pr1 >= r && pr0 < r + 1 && pc1 >= c && pc0 < c + 1) {
                    return false;
                }
                continue;
            }
            if (!blocked[r][c]) continue;

            if (blockType[r][c] === 'object') {
                // Circle-vs-circle collision for objects
                // Object sits at center of tile (r + 0.5, c + 0.5)
                const objCenterR = r + 0.5;
                const objCenterC = c + 0.5;
                const dr = newRow - objCenterR;
                const dc = newCol - objCenterC;
                const dist = Math.sqrt(dr * dr + dc * dc);
                const minDist = HITBOX_RADIUS + objRadius[r][c];
                if (dist < minDist) return false;
            } else {
                // Wall: full-tile AABB collision (original behavior)
                const r0 = newRow - HITBOX_RADIUS + COL_EPS;
                const r1 = newRow + HITBOX_RADIUS - COL_EPS;
                const c0 = newCol - HITBOX_RADIUS + COL_EPS;
                const c1 = newCol + HITBOX_RADIUS - COL_EPS;
                // Does player AABB overlap this tile?
                if (r1 >= r && r0 < r + 1 && c1 >= c && c0 < c + 1) {
                    return false;
                }
            }
        }
    }
    return true;
}

// Helper: distance from player to nearest wall (for proximity effects)
function wallProximity(pRow, pCol) {
    let minDist = 99;
    const scan = 2;
    const pr = Math.floor(pRow);
    const pc = Math.floor(pCol);
    for (let r = pr - scan; r <= pr + scan; r++) {
        for (let c = pc - scan; c <= pc + scan; c++) {
            if (r < 0 || r >= floorMap.length || c < 0 || c >= floorMap.length) continue;
            if (!blocked[r][c]) continue;
            // Distance to nearest edge of tile
            const nearR = Math.max(r, Math.min(pRow, r + 1));
            const nearC = Math.max(c, Math.min(pCol, c + 1));
            const dr = pRow - nearR;
            const dc = pCol - nearC;
            const d = Math.sqrt(dr * dr + dc * dc);
            if (d < minDist) minDist = d;
        }
    }
    return minDist;
}

