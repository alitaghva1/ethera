// ----- PARTICLES -----
// ============================================================
//  COORDINATE HELPERS
// ============================================================
function tileToScreen(row, col) {
    return {
        x: (col - row) * HALF_DW,
        y: (col + row) * HALF_DH
    };
}

function screenToTile(screenX, screenY) {
    // Inverse of tileToScreen, accounting for camera offset
    const wx = screenX - cameraX;
    const wy = screenY - cameraY;
    const col = 0.5 * (wx / HALF_DW + wy / HALF_DH);
    const row = 0.5 * (wy / HALF_DH - wx / HALF_DW);
    return { row, col };
}

