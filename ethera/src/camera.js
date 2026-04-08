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

    // Screen shake effect — decays intensity over time
    if (screenShakeTimer > 0) {
        screenShakeTimer -= dt;
        screenShakeIntensity *= Math.max(0, 1 - dt * 8); // smooth decay
        const shake = screenShakeIntensity;
        cameraX += Math.round((Math.random() - 0.5) * shake * 2);
        cameraY += Math.round((Math.random() - 0.5) * shake * 2);
        if (screenShakeTimer <= 0) screenShakeIntensity = 0;
    }
}

// ============================================================
