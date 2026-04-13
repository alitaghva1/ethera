// ============================================================
//  CAMERA (smooth lerp follow)
// ============================================================
function updateCamera(dt) {
    const LERP = 6;
    const LOOK_AHEAD = 18; // pixels of camera lead in movement direction

    const target = tileToScreen(player.row, player.col);
    // Camera leads slightly in the direction you're moving
    const speed = Math.sqrt(player.vx * player.vx + player.vy * player.vy);
    let leadX = 0, leadY = 0;
    if (speed > 0.5) {
        // tileToScreen applies a linear transformation, so it correctly converts velocity vectors.
        // For isometric projection, the velocity transformation is: (vx,vy) -> ((vy-vx)*HALF_DW, (vy+vx)*HALF_DH)
        const screenVel = tileToScreen(player.vx, player.vy);
        const velLen = Math.sqrt(screenVel.x * screenVel.x + screenVel.y * screenVel.y);
        if (velLen > 0) {
            leadX = (screenVel.x / velLen) * LOOK_AHEAD;
            leadY = (screenVel.y / velLen) * LOOK_AHEAD;
        }
    }

    const tx = canvasW / 2 - target.x - leadX;
    const ty = canvasH / 2 - target.y - leadY;
    smoothCamX += (tx - smoothCamX) * LERP * dt;
    smoothCamY += (ty - smoothCamY) * LERP * dt;
    cameraX = Math.round(smoothCamX);
    cameraY = Math.round(smoothCamY);

    // Camera breathing — subtle idle bob that makes the world feel alive
    // Only active when player is idle (not moving, not shaking)
    if (screenShakeTimer <= 0) {
        const breathT = typeof performance !== 'undefined' ? performance.now() / 1000 : 0;
        cameraY += Math.sin(breathT * 2.1) * 0.4; // ~0.4px vertical, ~3s cycle
    }

    // Clamp camera to prevent showing void beyond map edges
    if (typeof MAP_SIZE !== 'undefined' && typeof DIAMOND_W !== 'undefined') {
        const mapW = MAP_SIZE * DIAMOND_W;
        const mapH = MAP_SIZE * DIAMOND_H;
        cameraX = Math.max(-(mapW * 0.6), Math.min(canvasW * 0.5, cameraX));
        cameraY = Math.max(-(mapH * 0.8), Math.min(canvasH * 0.3, cameraY));
    }

    // Screen shake effect — decays intensity over time
    // Supports directional bias via _shakeDirX/_shakeDirY (set by addDirectionalShake)
    if (screenShakeTimer > 0) {
        screenShakeTimer -= dt;
        screenShakeIntensity *= Math.max(0, 1 - dt * 8); // smooth decay
        const shake = screenShakeIntensity;
        // Blend directional bias with random jitter (bias decays quickly)
        const dirBias = typeof _shakeDirBias !== 'undefined' ? Math.max(0, _shakeDirBias) : 0;
        const dirX = typeof _shakeDirX !== 'undefined' ? _shakeDirX : 0;
        const dirY = typeof _shakeDirY !== 'undefined' ? _shakeDirY : 0;
        const randX = (Math.random() - 0.5) * 2;
        const randY = (Math.random() - 0.5) * 2;
        cameraX += Math.round((randX * (1 - dirBias) + dirX * dirBias) * shake);
        cameraY += Math.round((randY * (1 - dirBias) + dirY * dirBias) * shake);
        if (dirBias > 0) _shakeDirBias -= dt * 12; // directional bias fades fast
        if (screenShakeTimer <= 0) { screenShakeIntensity = 0; _shakeDirBias = 0; }
    }
}

// Directional shake state
var _shakeDirX = 0, _shakeDirY = 0, _shakeDirBias = 0;

function addDirectionalShake(fromRow, fromCol, intensity, duration) {
    // Shake biased AWAY from the damage source
    const dx = player.col - fromCol;
    const dy = player.row - fromRow;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    _shakeDirX = dx / len;
    _shakeDirY = dy / len;
    _shakeDirBias = 0.7; // starts 70% directional, decays to random
    addScreenShake(intensity, duration);
}

// ============================================================
