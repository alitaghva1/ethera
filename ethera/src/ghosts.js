// ============================================================
//  GHOST AFTERIMAGES (phase jump trail)
// ============================================================
function updateGhosts(dt) {
    for (let i = ghosts.length - 1; i >= 0; i--) {
        ghosts[i].life -= dt;
        ghosts[i].alpha *= 0.92; // exponential fade
        if (ghosts[i].life <= 0 || ghosts[i].alpha < 0.01) {
            ghosts.splice(i, 1);
        }
    }
}

// Map form → sprite keys & frame dimensions (supports PVGames 8-dir)
function _getGhostSpriteInfo(form, state, dir8) {
    const d = dir8 || 'S';

    // Always use red-tinted legacy slime sprites
    if (form === 'slime') {
        const key = state === 'walk' ? 'slime_p_walk' : 'slime_p_idle';
        return {
            sheet: slimeTintedSprites[key] || images[key],
            frameCount: 6, frameW: 100, frameH: 100, scale: 1.3,
        };
    }
    if (form === 'skeleton') {
        return {
            sheet: images[state === 'walk' ? 'skel_p_walk' : 'skel_p_idle'],
            frameCount: state === 'walk' ? 8 : 6, frameW: 100, frameH: 100, scale: 1.5,
        };
    }
    if (form === 'lich') {
        const lichSheet = images[state === 'walk' ? 'lich_p_walk' : 'lich_p_idle'];
        return {
            sheet: lichSheet,
            frameCount: 8, frameW: 160, frameH: 128, scale: PV_LICH_SCALE,
        };
    }
    // Wizard — single-direction Tiny RPG sprites
    return {
        sheet: state === 'walk' ? images.wiz_walk : images.wiz_idle,
        frameCount: state === 'walk' ? 8 : 6,
        frameW: WIZARD_FRAME_W, frameH: WIZARD_FRAME_H,
        scale: WIZARD_SCALE,
    };
}

function drawGhost(g) {
    const form = g.form || 'wizard';
    const info = _getGhostSpriteInfo(form, g.state, g.dir8 || player.dir8);
    const sheet = info.sheet;
    if (!sheet) return;

    const frame = Math.floor(g.animFrame) % info.frameCount;
    const pos = tileToScreen(g.row, g.col);
    const sx = pos.x + cameraX;
    const sy = pos.y + cameraY;
    const dw = info.frameW * info.scale;
    const dh = info.frameH * info.scale;
    const drawY = sy - dh * 0.75;

    ctx.save();
    ctx.globalAlpha = g.alpha;

    // Form-specific ghost tint
    if (form === 'slime') {
        try { ctx.filter = 'hue-rotate(340deg) saturate(2) brightness(1.6)'; } catch(e) {}
    } else if (form === 'skeleton') {
        try { ctx.filter = 'saturate(0.3) brightness(2.2)'; } catch(e) {}
    } else if (form === 'lich') {
        try { ctx.filter = 'hue-rotate(260deg) saturate(3) brightness(1.6)'; } catch(e) {}
    } else {
        try { ctx.filter = 'hue-rotate(200deg) saturate(2.5) brightness(1.8)'; } catch(e) {}
    }

    if (g.facing === -1) {
        ctx.translate(sx, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(sheet,
            frame * info.frameW, 0, info.frameW, info.frameH,
            -dw / 2, drawY, dw, dh);
    } else {
        ctx.drawImage(sheet,
            frame * info.frameW, 0, info.frameW, info.frameH,
            sx - dw / 2, drawY, dw, dh);
    }
    ctx.restore();
}
