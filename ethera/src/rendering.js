// ============================================================
//  RENDERING
// ============================================================
const TILE_CULL_PADDING = 80;

function drawTile(img, row, col) {
    if (!img) return;
    const pos = tileToScreen(row, col);
    // +1px overlap in town zone eliminates sub-pixel hairline seams
    const pad = (currentZone === 0) ? 1 : 0;
    const dw = TILE_W + pad * 2;
    const dh = TILE_H + pad * 2;
    const sx = pos.x - dw / 2 + cameraX;
    const sy = pos.y - dh + HALF_DH + cameraY + pad;

    if (sx > canvasW + TILE_CULL_PADDING || sx + dw < -TILE_CULL_PADDING) return;
    if (sy > canvasH + TILE_CULL_PADDING || sy + dh < -TILE_CULL_PADDING) return;

    ctx.drawImage(img, sx, sy, dw, dh);
}

// Draw a nature tile (220×379 image, 180×115 diamond) scaled so its diamond
// footprint aligns with the current grid.  Used for both floor and object tiles.
function drawNatureTile(img, row, col) {
    if (!img) return;
    const pos = tileToScreen(row, col);
    // +2px overlap eliminates sub-pixel hairline seams between tiles
    const drawW = NATURE_DRAW_W + 2;
    const drawH = NATURE_DRAW_H + 2;
    const sx = pos.x - drawW / 2 + cameraX;
    const sy = pos.y - drawH + HALF_DH + cameraY + 1;

    if (sx > canvasW + TILE_CULL_PADDING || sx + drawW < -TILE_CULL_PADDING) return;
    if (sy > canvasH + TILE_CULL_PADDING || sy + drawH < -TILE_CULL_PADDING) return;

    ctx.drawImage(img, sx, sy, drawW, drawH);
}

// Draw a Hell (Infernus) tile — variable-size images scaled so their 64px
// isometric diamond aligns with the game grid.  Width snaps to DIAMOND_W;
// height scales proportionally so aspect ratio is preserved.
// Anchored from diamond bottom-center like drawTile().
function drawHellTile(img, row, col) {
    if (!img) return;
    const pos = tileToScreen(row, col);
    // Scale factor: map 64px source diamond → current grid diamond width
    const scale = DIAMOND_W / HELL_DIAMOND_W;
    const dw = Math.round(img.width * scale);
    const dh = Math.round(img.height * scale);
    const sx = pos.x - dw / 2 + cameraX;
    const sy = pos.y - dh + HALF_DH + cameraY;

    if (sx > canvasW + TILE_CULL_PADDING || sx + dw < -TILE_CULL_PADDING) return;
    if (sy > canvasH + TILE_CULL_PADDING || sy + dh < -TILE_CULL_PADDING) return;

    ctx.drawImage(img, sx, sy, dw, dh);
}

// Draw subtle shadow edges on walkable tiles that border blocked tiles
// This gives visual feedback about where the collision boundary is
function drawTileEdgeShadows(row, col) {
    if (!GFX.tileEdgeShadows) return;
    if (blocked[row][col]) return; // only draw on walkable tiles

    const pos = tileToScreen(row, col);
    const cx = pos.x + cameraX;           // center of diamond
    const cy = pos.y + cameraY;           // center of diamond

    // Skip if off screen
    if (cx > canvasW + HALF_DW || cx < -HALF_DW) return;
    if (cy > canvasH + HALF_DH || cy < -HALF_DH) return;

    // Check 4 isometric neighbors
    // In iso: row-1 = top-left, row+1 = bottom-right, col-1 = top-right, col+1 = bottom-left
    const neighbors = [
        { dr: -1, dc: 0,  ex1x: cx, ex1y: cy - HALF_DH, ex2x: cx - HALF_DW, ex2y: cy }, // top-left edge
        { dr: 0,  dc: -1, ex1x: cx, ex1y: cy - HALF_DH, ex2x: cx + HALF_DW, ex2y: cy }, // top-right edge
        { dr: 1,  dc: 0,  ex1x: cx + HALF_DW, ex1y: cy, ex2x: cx, ex2y: cy + HALF_DH }, // bottom-right edge
        { dr: 0,  dc: 1,  ex1x: cx - HALF_DW, ex1y: cy, ex2x: cx, ex2y: cy + HALF_DH }, // bottom-left edge
    ];

    ctx.save();
    for (const n of neighbors) {
        const nr = row + n.dr;
        const nc = col + n.dc;
        if (nr < 0 || nr >= floorMap.length || nc < 0 || nc >= floorMap.length) continue;
        if (!blocked[nr][nc]) continue;

        // Draw a subtle shadow line along this edge of the diamond
        const isWall = blockType[nr][nc] === 'wall';
        const alpha = isWall ? 0.35 : 0.2;

        ctx.strokeStyle = `rgba(0, 0, 0, ${alpha})`;
        ctx.lineWidth = isWall ? 2 : 1.5;
        ctx.beginPath();
        ctx.moveTo(Math.round(n.ex1x), Math.round(n.ex1y));
        ctx.lineTo(Math.round(n.ex2x), Math.round(n.ex2y));
        ctx.stroke();

        // Inner shadow gradient (soft fade inward from the edge)
        if (isWall) {
            const midX = (n.ex1x + n.ex2x) / 2;
            const midY = (n.ex1y + n.ex2y) / 2;
            // Gradient fades from edge toward center
            const grad = ctx.createRadialGradient(midX, midY, 0, midX, midY, HALF_DW * 0.5);
            grad.addColorStop(0, 'rgba(0, 0, 0, 0.15)');
            grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = grad;
            // Small triangle from the edge inward
            ctx.beginPath();
            ctx.moveTo(n.ex1x, n.ex1y);
            ctx.lineTo(n.ex2x, n.ex2y);
            ctx.lineTo(cx, cy);
            ctx.closePath();
            ctx.fill();
        }
    }
    ctx.restore();
}

// Draw subtle dust/debris particles on rough walkable tiles to signal "damaged but passable"
function drawRoughFloorHint(row, col) {
    if (!GFX.roughFloorHints) return;
    const ft = floorMap[row][col];
    if (!ft) return;

    // Town zone: ambient ground detail (cracks, pebbles, scuffs)
    if (currentZone === 0 && TOWN_DETAIL_FLOORS.has(ft)) {
        const pos = tileToScreen(row, col);
        const cx = pos.x + cameraX;
        const cy = pos.y + cameraY;
        if (cx > canvasW + HALF_DW || cx < -HALF_DW) return;
        if (cy > canvasH + HALF_DH || cy < -HALF_DH) return;

        ctx.save();
        const seed = row * 41 + col * 59;
        const isDirt = ft === 'dirt' || ft === 'dirtTiles';
        const isWood = ft === 'planks' || ft === 'planksBroken';
        const isStone = ft === 'stoneTile' || ft === 'stone' || ft === 'stoneInset' || ft === 'stoneUneven';

        // Only render on ~40% of tiles for subtle, not-overdone feel
        if ((seed % 5) > 1) { ctx.restore(); return; }

        if (isDirt) {
            // Small pebble dots
            for (let i = 0; i < 2; i++) {
                const s = seed + i * 19;
                const ox = ((s * 11) % 20 - 10) * (HALF_DW / 20);
                const oy = ((s * 9) % 8 - 4) * (HALF_DH / 8);
                ctx.globalAlpha = 0.18;
                ctx.fillStyle = '#8b7355';
                ctx.beginPath();
                ctx.arc(cx + ox, cy + oy, 1, 0, Math.PI * 2);
                ctx.fill();
            }
        } else if (isStone) {
            // Subtle crack or scuff mark
            const s = seed + 7;
            const ox = ((s * 13) % 16 - 8) * (HALF_DW / 16);
            const oy = ((s * 7) % 6 - 3) * (HALF_DH / 6);
            ctx.globalAlpha = 0.08;
            ctx.strokeStyle = '#6a6055';
            ctx.lineWidth = 0.6;
            ctx.beginPath();
            ctx.moveTo(cx + ox - 3, cy + oy);
            ctx.lineTo(cx + ox + 3, cy + oy + 1);
            ctx.stroke();
        } else if (isWood) {
            // Wood grain hint
            const s = seed + 11;
            const ox = ((s * 13) % 12 - 6) * (HALF_DW / 12);
            const oy = ((s * 7) % 6 - 3) * (HALF_DH / 6);
            ctx.globalAlpha = 0.06;
            ctx.strokeStyle = '#5a4530';
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(cx + ox - 4, cy + oy);
            ctx.lineTo(cx + ox + 4, cy + oy);
            ctx.stroke();
        }
        ctx.restore();
        return;
    }

    // Dungeon: original rough floor hint
    if (!ROUGH_FLOORS.has(ft)) return;
    if (blocked[row][col]) return;

    const pos = tileToScreen(row, col);
    const cx = pos.x + cameraX;
    const cy = pos.y + cameraY;

    if (cx > canvasW + HALF_DW || cx < -HALF_DW) return;
    if (cy > canvasH + HALF_DH || cy < -HALF_DH) return;

    // Seeded pseudo-random dots based on tile position (stable, no flicker)
    ctx.save();
    const seed = row * 37 + col * 53;
    for (let i = 0; i < 3; i++) {
        const s = seed + i * 17;
        const ox = ((s * 13) % 30 - 15) * (HALF_DW / 30);
        const oy = ((s * 7) % 14 - 7) * (HALF_DH / 14);
        const sz = 1 + ((s * 3) % 2);
        ctx.globalAlpha = 0.15 + ((s * 11) % 10) / 80;
        ctx.fillStyle = '#aa9977';
        ctx.beginPath();
        ctx.arc(cx + ox, cy + oy, sz, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}

function drawWizard() {
    const dir = player.dir8 || 'S';
    const fw = WIZARD_FRAME_W;   // 100
    const fh = WIZARD_FRAME_H;   // 100
    const scale = WIZARD_SCALE;  // 1.3

    // Select single-direction Tiny RPG sprite strip
    let sheet, frameCount;
    if (player.attacking) {
        sheet = images.wiz_attack2; frameCount = 6;
    } else if (player.state === 'walk') {
        sheet = images.wiz_walk; frameCount = 8;
    } else {
        sheet = images.wiz_idle; frameCount = 6;
    }
    if (playerInvTimer > PLAYER_STATS.invTime * 0.5 && images.wiz_hurt) {
        sheet = images.wiz_hurt; frameCount = 4;
    }
    if (!sheet) return;

    const frame = Math.floor(player.animFrame) % frameCount;
    const pos = tileToScreen(player.row, player.col);
    const sx = pos.x + cameraX;
    const sy = pos.y + cameraY;
    const dw = fw * scale;
    const dh = fh * scale;

    // Flip for east-facing directions (single-direction sprites face west/south)
    const flipH = (dir === 'E' || dir === 'NE' || dir === 'SE');

    // Sprite bob while walking
    let bob = 0;
    if (player.state === 'walk' && !player.dodging) {
        bob = Math.sin(player.animFrame * Math.PI) * 2.0;
    }
    const drawY = sy - dh * 0.72 - bob;

    // Cinematic awakening: use legacy lying-down rotation
    const isLyingDown = (gamePhase === 'cinematic' || gamePhase === 'awakening') && wizardRotation > 0.01;
    if (isLyingDown) {
        drawWizardLegacy();
        return;
    }

    // Ground shadow
    ctx.save();
    ctx.globalAlpha = player.dodging ? 0.08 : 0.25;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(sx, sy + 4, 20, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Arcane foot glow
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const wizFootPulse = 0.10 + Math.sin(player.animFrame * 2.8) * 0.04;
    ctx.globalAlpha = wizFootPulse;
    const wizAuraRad = 24;
    const wizAuraGrad = ctx.createRadialGradient(sx, sy, 0, sx, sy, wizAuraRad);
    wizAuraGrad.addColorStop(0, 'rgba(120, 160, 240, 0.4)');
    wizAuraGrad.addColorStop(0.5, 'rgba(80, 110, 200, 0.12)');
    wizAuraGrad.addColorStop(1, 'rgba(40, 60, 140, 0)');
    ctx.fillStyle = wizAuraGrad;
    ctx.beginPath();
    ctx.ellipse(sx, sy + 2, wizAuraRad, wizAuraRad * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();

    // Phase jump: translucent + arcane glow
    if (player.dodging) {
        ctx.globalAlpha = 0.4 + Math.sin(player.dodgeTimer * 40) * 0.2;
        try { ctx.filter = 'hue-rotate(180deg) saturate(2) brightness(1.6)'; } catch(e) {}
    }
    // Damage invincibility blink
    else if (playerInvTimer > 0) {
        ctx.globalAlpha = Math.sin(playerInvTimer * 25) > 0 ? 1.0 : 0.25;
    }

    // Draw with horizontal flip for E/NE/SE directions
    if (flipH) {
        ctx.translate(sx, drawY);
        ctx.scale(-1, 1);
        ctx.drawImage(sheet, frame * fw, 0, fw, fh, -dw / 2, 0, dw, dh);
    } else {
        ctx.drawImage(sheet, frame * fw, 0, fw, fh, sx - dw / 2, drawY, dw, dh);
    }
    ctx.restore();

    // Luminous outline
    if (!player.dodging) {
        ctx.save();
        const outlineOffsets = [[-1,0],[1,0],[0,-1],[0,1]];
        ctx.globalAlpha = 0.3;
        ctx.shadowColor = 'rgba(130, 170, 255, 0.8)';
        ctx.shadowBlur = 3;
        for (const [ox, oy] of outlineOffsets) {
            if (flipH) {
                ctx.save();
                ctx.translate(sx + ox, drawY + oy);
                ctx.scale(-1, 1);
                ctx.drawImage(sheet, frame * fw, 0, fw, fh, -dw / 2, 0, dw, dh);
                ctx.restore();
            } else {
                ctx.drawImage(sheet, frame * fw, 0, fw, fh, sx - dw / 2 + ox, drawY + oy, dw, dh);
            }
        }
        ctx.restore();
    }

    // Staff tip glow
    if (!player.dodging) {
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        const staffPulse = 0.25 + Math.sin(player.animFrame * 3.5) * 0.15;
        ctx.globalAlpha = staffPulse;
        const staffX = sx + (flipH ? 14 : -14);
        const staffY = drawY + dh * 0.3;
        const staffGrad = ctx.createRadialGradient(staffX, staffY, 0, staffX, staffY, 8);
        staffGrad.addColorStop(0, 'rgba(180, 200, 255, 0.7)');
        staffGrad.addColorStop(0.4, 'rgba(100, 140, 240, 0.3)');
        staffGrad.addColorStop(1, 'rgba(60, 80, 200, 0)');
        ctx.fillStyle = staffGrad;
        ctx.fillRect(staffX - 8, staffY - 8, 16, 16);
        ctx.restore();
    }

    // Dodge particles
    if (player.dodging) {
        ctx.save();
        for (let i = 0; i < 4; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = Math.random() * 22 + 5;
            const px = sx + Math.cos(angle) * dist;
            const py = drawY + dh * 0.5 + Math.sin(angle) * dist * 0.6;
            const size = Math.random() * 2.5 + 1;
            ctx.globalAlpha = Math.random() * 0.7 + 0.3;
            ctx.fillStyle = Math.random() > 0.5 ? '#8888ff' : '#cc88ff';
            ctx.beginPath();
            ctx.arc(px, py, size, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }
}

// LEGACY: kept for awakening cinematic sequence
// Called during gamePhase === 'awakening' or 'cinematic' when wizardRotation > 0.01
function drawWizardLegacy() {
    let sheet, frameCount;
    if (player.state === 'attack') { sheet = images.wiz_attack2; frameCount = 6; }
    else if (player.state === 'walk') { sheet = images.wiz_walk; frameCount = 8; }
    else { sheet = images.wiz_idle; frameCount = 6; }
    if (!sheet) return;
    const frame = Math.floor(player.animFrame) % frameCount;
    const pos = tileToScreen(player.row, player.col);
    const sx = pos.x + cameraX;
    const sy = pos.y + cameraY;
    const dw = WIZARD_FRAME_W * WIZARD_SCALE;
    const dh = WIZARD_FRAME_H * WIZARD_SCALE;
    let bob = 0;
    if (player.state === 'walk' && !player.dodging) bob = Math.sin(player.animFrame * Math.PI) * 2.5;
    const drawY = sy - dh * 0.72 - bob;
    ctx.save();
    if ((gamePhase === 'cinematic' || gamePhase === 'awakening') && wizardRotation > 0.01) {
        const rot = wizardRotation;
        ctx.translate(sx, drawY + dh * 0.5);
        ctx.rotate(rot);
        ctx.globalAlpha = 0.4 + (1 - rot / (Math.PI / 2)) * 0.6;
        ctx.drawImage(sheet, frame * WIZARD_FRAME_W, 0, WIZARD_FRAME_W, WIZARD_FRAME_H, -dw/2, -dh*0.5, dw, dh);
        ctx.restore();
        return;
    }
    if (player.facing === -1) {
        ctx.translate(sx, 0); ctx.scale(-1, 1);
        ctx.drawImage(sheet, frame * WIZARD_FRAME_W, 0, WIZARD_FRAME_W, WIZARD_FRAME_H, -dw/2, drawY, dw, dh);
    } else {
        ctx.drawImage(sheet, frame * WIZARD_FRAME_W, 0, WIZARD_FRAME_W, WIZARD_FRAME_H, sx - dw/2, drawY, dw, dh);
    }
    ctx.restore();
}

// ----- BLOOD STAIN (drawn on floor beneath wizard's starting position) -----
function drawBloodStain() {
    if (bloodStainAlpha <= 0) return;
    const pos = tileToScreen(4, 3); // player start position
    const sx = pos.x + cameraX;
    const sy = pos.y + cameraY;
    ctx.save();
    ctx.globalAlpha = bloodStainAlpha * 0.6;
    // Main stain — dark crimson smear
    const grad = ctx.createRadialGradient(sx - 4, sy + 2, 0, sx - 4, sy + 2, 22);
    grad.addColorStop(0, 'rgba(80, 10, 5, 1)');
    grad.addColorStop(0.4, 'rgba(60, 8, 4, 0.8)');
    grad.addColorStop(0.7, 'rgba(40, 5, 3, 0.4)');
    grad.addColorStop(1, 'rgba(30, 3, 2, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(sx - 4, sy + 2, 24, 10, -0.2, 0, Math.PI * 2);
    ctx.fill();
    // Smaller splatter
    const grad2 = ctx.createRadialGradient(sx + 10, sy - 3, 0, sx + 10, sy - 3, 10);
    grad2.addColorStop(0, 'rgba(70, 8, 4, 0.7)');
    grad2.addColorStop(1, 'rgba(40, 4, 2, 0)');
    ctx.fillStyle = grad2;
    ctx.beginPath();
    ctx.ellipse(sx + 10, sy - 3, 11, 5, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

// Register wizard form draw handler
formHandlers.wizard.draw = function() { drawWizard(); };

