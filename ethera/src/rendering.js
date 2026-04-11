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
    // Filter is safely enclosed within ctx.save()/ctx.restore() below, no leak risk

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

// ============================================================
//  ENVIRONMENTAL LIGHT SOURCES
//  Adds visual anchor points (torches, braziers, crystals, etc.)
//  to make zones feel authored rather than flat. Drawn in two passes:
//  1) Floor glow props (before darkness) — warm/cool circles on floor
//  2) Punchthrough (after darkness) — screen-blend to actually brighten
// ============================================================

const ENV_LIGHTS = {};

function buildEnvironmentLights() {
    for (const k in ENV_LIGHTS) delete ENV_LIGHTS[k];

    // ── ZONE 1: The Undercroft ──
    ENV_LIGHTS[1] = [
        // Cell — dim candles near player start
        { row: 2, col: 3, type: 'candle', color: [220, 180, 100], radius: 35, intensity: 0.5 },
        { row: 5, col: 2, type: 'candle', color: [220, 180, 100], radius: 30, intensity: 0.4 },
        // Corridor 1 entrance — wall torch
        { row: 7, col: 4, type: 'torch', color: [255, 180, 80], radius: 50, intensity: 0.7 },
        // Guard Hall — braziers at corners, fire pit center
        { row: 10, col: 2, type: 'brazier', color: [255, 160, 60], radius: 60, intensity: 0.8 },
        { row: 10, col: 7, type: 'brazier', color: [255, 160, 60], radius: 60, intensity: 0.8 },
        { row: 16, col: 2, type: 'torch', color: [255, 180, 80], radius: 45, intensity: 0.65 },
        { row: 16, col: 7, type: 'torch', color: [255, 180, 80], radius: 45, intensity: 0.65 },
        { row: 13, col: 5, type: 'fire_pit', color: [255, 140, 40], radius: 55, intensity: 0.75 },
        // Corridor 2
        { row: 12, col: 10, type: 'torch', color: [255, 180, 80], radius: 40, intensity: 0.6 },
        // Great Hall — torches along aisles, central brazier
        { row: 9, col: 13, type: 'torch', color: [255, 180, 80], radius: 50, intensity: 0.7 },
        { row: 9, col: 20, type: 'torch', color: [255, 180, 80], radius: 50, intensity: 0.7 },
        { row: 14, col: 17, type: 'brazier', color: [255, 150, 50], radius: 70, intensity: 0.85 },
        { row: 19, col: 13, type: 'torch', color: [255, 180, 80], radius: 50, intensity: 0.7 },
        { row: 19, col: 20, type: 'torch', color: [255, 180, 80], radius: 50, intensity: 0.7 },
        // Alcove — green crystal
        { row: 4, col: 17, type: 'crystal', color: [100, 220, 140], radius: 50, intensity: 0.6 },
        // Act 2: Bone Gallery
        { row: 9, col: 24, type: 'torch', color: [255, 170, 70], radius: 50, intensity: 0.7 },
        { row: 9, col: 31, type: 'torch', color: [255, 170, 70], radius: 50, intensity: 0.7 },
        { row: 14, col: 27, type: 'brazier', color: [255, 140, 40], radius: 65, intensity: 0.8 },
        // Flooded Crypt — cool blue crystal
        { row: 4, col: 24, type: 'crystal', color: [120, 180, 220], radius: 45, intensity: 0.55 },
        { row: 4, col: 26, type: 'candle', color: [200, 180, 140], radius: 30, intensity: 0.4 },
        // King's Hollow — boss room
        { row: 21, col: 24, type: 'brazier', color: [255, 120, 40], radius: 70, intensity: 0.9 },
        { row: 21, col: 31, type: 'brazier', color: [255, 120, 40], radius: 70, intensity: 0.9 },
        { row: 28, col: 27, type: 'fire_pit', color: [255, 100, 30], radius: 80, intensity: 0.95 },
    ];

    // ── ZONE 2: Ruined Tower ──
    ENV_LIGHTS[2] = [
        { row: 3, col: 3, type: 'torch', color: [255, 180, 80], radius: 45, intensity: 0.65 },
        { row: 3, col: 7, type: 'torch', color: [255, 180, 80], radius: 45, intensity: 0.65 },
        { row: 5, col: 11, type: 'candle', color: [220, 180, 100], radius: 30, intensity: 0.5 },
        { row: 2, col: 15, type: 'torch', color: [255, 170, 70], radius: 50, intensity: 0.7 },
        { row: 2, col: 23, type: 'torch', color: [255, 170, 70], radius: 50, intensity: 0.7 },
        { row: 5, col: 19, type: 'brazier', color: [255, 150, 50], radius: 65, intensity: 0.8 },
        { row: 7, col: 15, type: 'torch', color: [255, 170, 70], radius: 50, intensity: 0.7 },
        { row: 10, col: 15, type: 'candle', color: [220, 180, 100], radius: 35, intensity: 0.5 },
        { row: 9, col: 19, type: 'torch', color: [255, 180, 80], radius: 50, intensity: 0.7 },
        { row: 9, col: 27, type: 'torch', color: [255, 180, 80], radius: 50, intensity: 0.7 },
        { row: 13, col: 23, type: 'brazier', color: [255, 140, 40], radius: 60, intensity: 0.8 },
        { row: 15, col: 19, type: 'torch', color: [255, 180, 80], radius: 45, intensity: 0.65 },
        { row: 18, col: 21, type: 'brazier', color: [255, 120, 40], radius: 70, intensity: 0.9 },
        { row: 18, col: 27, type: 'brazier', color: [255, 120, 40], radius: 70, intensity: 0.9 },
        { row: 22, col: 24, type: 'fire_pit', color: [255, 100, 30], radius: 75, intensity: 0.95 },
    ];

    // ── ZONE 3: The Spire ──
    ENV_LIGHTS[3] = [
        { row: 2, col: 2, type: 'torch', color: [255, 180, 80], radius: 50, intensity: 0.7 },
        { row: 2, col: 8, type: 'torch', color: [255, 180, 80], radius: 50, intensity: 0.7 },
        { row: 5, col: 5, type: 'brazier', color: [255, 160, 60], radius: 60, intensity: 0.8 },
        { row: 5, col: 12, type: 'candle', color: [220, 180, 100], radius: 35, intensity: 0.5 },
        { row: 9, col: 11, type: 'brazier', color: [255, 140, 40], radius: 65, intensity: 0.85 },
        { row: 9, col: 21, type: 'brazier', color: [255, 140, 40], radius: 65, intensity: 0.85 },
        { row: 13, col: 16, type: 'fire_pit', color: [255, 120, 30], radius: 80, intensity: 0.95 },
        { row: 17, col: 11, type: 'torch', color: [255, 180, 80], radius: 50, intensity: 0.7 },
        { row: 17, col: 21, type: 'torch', color: [255, 180, 80], radius: 50, intensity: 0.7 },
    ];

    // ── ZONE 4: The Inferno ──
    ENV_LIGHTS[4] = [
        { row: 3, col: 10, type: 'lava_crack', color: [255, 80, 20], radius: 55, intensity: 0.8 },
        { row: 3, col: 17, type: 'lava_crack', color: [255, 80, 20], radius: 55, intensity: 0.8 },
        { row: 6, col: 13, type: 'fire_pit', color: [255, 100, 20], radius: 70, intensity: 0.9 },
        { row: 9, col: 7, type: 'lava_crack', color: [255, 60, 10], radius: 45, intensity: 0.7 },
        { row: 9, col: 20, type: 'lava_crack', color: [255, 60, 10], radius: 45, intensity: 0.7 },
        { row: 12, col: 5, type: 'fire_pit', color: [255, 100, 20], radius: 75, intensity: 0.9 },
        { row: 12, col: 22, type: 'fire_pit', color: [255, 100, 20], radius: 75, intensity: 0.9 },
        { row: 18, col: 13, type: 'lava_crack', color: [255, 80, 20], radius: 80, intensity: 0.95 },
        { row: 24, col: 5, type: 'fire_pit', color: [255, 90, 15], radius: 65, intensity: 0.85 },
        { row: 24, col: 22, type: 'fire_pit', color: [255, 90, 15], radius: 65, intensity: 0.85 },
    ];

    // ── ZONE 5: The Frozen Abyss ──
    ENV_LIGHTS[5] = [
        { row: 3, col: 12, type: 'ice_crystal', color: [100, 180, 255], radius: 55, intensity: 0.7 },
        { row: 3, col: 17, type: 'ice_crystal', color: [100, 180, 255], radius: 55, intensity: 0.7 },
        { row: 8, col: 8, type: 'ice_crystal', color: [80, 160, 240], radius: 45, intensity: 0.6 },
        { row: 8, col: 21, type: 'ice_crystal', color: [80, 160, 240], radius: 45, intensity: 0.6 },
        { row: 12, col: 5, type: 'ice_crystal', color: [100, 180, 255], radius: 65, intensity: 0.8 },
        { row: 12, col: 24, type: 'ice_crystal', color: [100, 180, 255], radius: 65, intensity: 0.8 },
        { row: 17, col: 14, type: 'ice_crystal', color: [120, 200, 255], radius: 75, intensity: 0.85 },
        { row: 20, col: 5, type: 'ice_crystal', color: [80, 160, 240], radius: 55, intensity: 0.7 },
        { row: 20, col: 24, type: 'ice_crystal', color: [80, 160, 240], radius: 55, intensity: 0.7 },
        { row: 25, col: 14, type: 'ice_crystal', color: [140, 200, 255], radius: 80, intensity: 0.9 },
    ];

    // ── ZONE 6: Throne of Ruin ──
    ENV_LIGHTS[6] = [
        { row: 3, col: 13, type: 'void_flame', color: [180, 80, 255], radius: 55, intensity: 0.7 },
        { row: 3, col: 18, type: 'void_flame', color: [180, 80, 255], radius: 55, intensity: 0.7 },
        { row: 10, col: 7, type: 'void_flame', color: [160, 60, 240], radius: 50, intensity: 0.65 },
        { row: 10, col: 24, type: 'void_flame', color: [160, 60, 240], radius: 50, intensity: 0.65 },
        { row: 14, col: 4, type: 'void_flame', color: [180, 80, 255], radius: 65, intensity: 0.85 },
        { row: 14, col: 27, type: 'void_flame', color: [180, 80, 255], radius: 65, intensity: 0.85 },
        { row: 20, col: 15, type: 'void_flame', color: [200, 100, 255], radius: 80, intensity: 0.95 },
        { row: 26, col: 4, type: 'void_flame', color: [160, 60, 240], radius: 60, intensity: 0.75 },
        { row: 26, col: 27, type: 'void_flame', color: [160, 60, 240], radius: 60, intensity: 0.75 },
    ];

    // ── ZONE 0: The Hamlet (outdoor) ──
    ENV_LIGHTS[0] = [
        { row: 10, col: 10, type: 'torch', color: [255, 210, 120], radius: 55, intensity: 0.6 },
        { row: 10, col: 20, type: 'torch', color: [255, 210, 120], radius: 55, intensity: 0.6 },
        { row: 20, col: 10, type: 'torch', color: [255, 210, 120], radius: 55, intensity: 0.6 },
        { row: 20, col: 20, type: 'torch', color: [255, 210, 120], radius: 55, intensity: 0.6 },
        { row: 15, col: 15, type: 'brazier', color: [255, 190, 100], radius: 65, intensity: 0.7 },
    ];
}

const _envLightCache = {};

function _getEnvLightGlow(light) {
    const key = `env_${light.type}_${light.radius}_${light.color.join(',')}`;
    if (_envLightCache[key]) return _envLightCache[key];

    const r = light.radius;
    const size = r * 2;
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const lctx = c.getContext('2d');
    const [cr, cg, cb] = light.color;
    const grad = lctx.createRadialGradient(r, r, 0, r, r, r);

    if (light.type === 'torch' || light.type === 'brazier' || light.type === 'fire_pit') {
        grad.addColorStop(0, `rgba(${cr}, ${cg}, ${cb}, 0.6)`);
        grad.addColorStop(0.3, `rgba(${cr}, ${Math.max(0,cg-40)}, ${Math.max(0,cb-30)}, 0.3)`);
        grad.addColorStop(0.7, `rgba(${Math.max(0,cr-80)}, ${Math.max(0,cg-60)}, ${Math.max(0,cb-40)}, 0.08)`);
        grad.addColorStop(1, `rgba(${Math.max(0,cr-120)}, ${Math.max(0,cg-80)}, 0, 0)`);
    } else if (light.type === 'candle') {
        grad.addColorStop(0, `rgba(${cr}, ${cg}, ${cb}, 0.45)`);
        grad.addColorStop(0.4, `rgba(${cr}, ${cg}, ${cb}, 0.15)`);
        grad.addColorStop(1, `rgba(${Math.max(0,cr-80)}, ${Math.max(0,cg-60)}, 0, 0)`);
    } else if (light.type === 'crystal' || light.type === 'ice_crystal') {
        grad.addColorStop(0, `rgba(${cr}, ${cg}, ${cb}, 0.5)`);
        grad.addColorStop(0.25, `rgba(${cr}, ${cg}, ${cb}, 0.25)`);
        grad.addColorStop(0.6, `rgba(${Math.max(0,cr-30)}, ${Math.max(0,cg-20)}, ${cb}, 0.08)`);
        grad.addColorStop(1, `rgba(0, ${Math.max(0,cg-60)}, ${Math.max(0,cb-40)}, 0)`);
    } else if (light.type === 'lava_crack') {
        grad.addColorStop(0, `rgba(${cr}, ${cg}, ${cb}, 0.55)`);
        grad.addColorStop(0.2, `rgba(${cr}, ${Math.max(0,cg-30)}, 0, 0.35)`);
        grad.addColorStop(0.5, `rgba(${Math.max(0,cr-60)}, 0, 0, 0.12)`);
        grad.addColorStop(1, 'rgba(40, 0, 0, 0)');
    } else if (light.type === 'void_flame') {
        grad.addColorStop(0, `rgba(${cr}, ${cg}, ${cb}, 0.55)`);
        grad.addColorStop(0.25, `rgba(${Math.max(0,cr-30)}, ${Math.max(0,cg-20)}, ${cb}, 0.28)`);
        grad.addColorStop(0.6, `rgba(${Math.max(0,cr-80)}, 0, ${Math.max(0,cb-40)}, 0.08)`);
        grad.addColorStop(1, 'rgba(20, 0, 30, 0)');
    } else {
        grad.addColorStop(0, `rgba(${cr}, ${cg}, ${cb}, 0.5)`);
        grad.addColorStop(0.5, `rgba(${cr}, ${cg}, ${cb}, 0.15)`);
        grad.addColorStop(1, `rgba(${cr}, ${cg}, ${cb}, 0)`);
    }

    lctx.fillStyle = grad;
    lctx.fillRect(0, 0, size, size);
    _envLightCache[key] = c;
    return c;
}

function _envLightFlicker(light, now) {
    const seed = light.row * 31 + light.col * 47;
    if (light.type === 'torch' || light.type === 'brazier' || light.type === 'fire_pit' || light.type === 'lava_crack') {
        return 0.88 + Math.sin(now / 200 + seed) * 0.06
             + Math.sin(now / 130 + seed * 2.3) * 0.04
             + Math.sin(now / 370 + seed * 0.7) * 0.02;
    }
    if (light.type === 'crystal' || light.type === 'ice_crystal' || light.type === 'void_flame') {
        return 0.92 + Math.sin(now / 600 + seed) * 0.05
             + Math.sin(now / 400 + seed * 1.7) * 0.03;
    }
    if (light.type === 'candle') {
        return 0.82 + Math.sin(now / 150 + seed) * 0.10
             + Math.sin(now / 90 + seed * 3.1) * 0.08;
    }
    return 1.0;
}

// ── Procedural light prop drawing ──
// Draws a small physical object (torch bracket, brazier bowl, crystal, etc.)
// at each light position so glows have a visible source.
function _drawLightProp(sx, sy, light, flicker, now) {
    const [cr, cg, cb] = light.color;
    const seed = light.row * 31 + light.col * 47;

    if (light.type === 'torch') {
        // Iron wall bracket + animated flame
        // Bracket (dark iron L-shape)
        ctx.save();
        ctx.fillStyle = '#3a3028';
        ctx.fillRect(sx - 1, sy - 18, 3, 14);      // vertical post
        ctx.fillRect(sx - 1, sy - 18, 8, 3);        // horizontal arm
        ctx.fillStyle = '#2a221a';
        ctx.fillRect(sx + 4, sy - 18, 4, 3);        // arm cap
        // Cup/holder
        ctx.fillStyle = '#4a3828';
        ctx.beginPath();
        ctx.ellipse(sx + 6, sy - 16, 4, 2, 0, 0, Math.PI);
        ctx.fill();
        ctx.restore();
        // Animated flame
        ctx.save();
        const fh = 6 + Math.sin(now / 100 + seed) * 2;
        const fw = 3 + Math.sin(now / 80 + seed * 1.3) * 0.8;
        const flameX = sx + 6;
        const flameY = sy - 18;
        // Outer flame (orange)
        ctx.globalAlpha = 0.85 * flicker;
        ctx.fillStyle = `rgb(${cr}, ${Math.max(0,cg-40)}, ${Math.max(0,cb-60)})`;
        ctx.beginPath();
        ctx.ellipse(flameX, flameY - fh / 2, fw, fh / 2, 0, 0, Math.PI * 2);
        ctx.fill();
        // Inner flame (bright core)
        ctx.fillStyle = `rgb(${Math.min(255, cr + 30)}, ${Math.min(255, cg + 20)}, ${Math.min(255, cb + 10)})`;
        ctx.beginPath();
        ctx.ellipse(flameX, flameY - fh * 0.3, fw * 0.5, fh * 0.35, 0, 0, Math.PI * 2);
        ctx.fill();
        // Hot white tip
        ctx.fillStyle = '#fffae0';
        ctx.globalAlpha = 0.7 * flicker;
        ctx.beginPath();
        ctx.arc(flameX, flameY - fh * 0.2, 1.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

    } else if (light.type === 'brazier') {
        // Stone brazier bowl on short pedestal + fire
        ctx.save();
        // Pedestal base
        ctx.fillStyle = '#4a4038';
        ctx.beginPath();
        ctx.ellipse(sx, sy - 2, 7, 3, 0, 0, Math.PI * 2);
        ctx.fill();
        // Bowl stem
        ctx.fillStyle = '#5a5048';
        ctx.fillRect(sx - 3, sy - 10, 6, 8);
        // Bowl rim (ellipse)
        ctx.fillStyle = '#6a5a48';
        ctx.beginPath();
        ctx.ellipse(sx, sy - 11, 8, 3.5, 0, 0, Math.PI * 2);
        ctx.fill();
        // Inner bowl shadow
        ctx.fillStyle = '#2a2018';
        ctx.beginPath();
        ctx.ellipse(sx, sy - 10, 6, 2.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        // Fire inside bowl
        ctx.save();
        const bfh = 8 + Math.sin(now / 90 + seed) * 2.5;
        ctx.globalAlpha = 0.9 * flicker;
        ctx.fillStyle = `rgb(${cr}, ${Math.max(0,cg-30)}, ${Math.max(0,cb-50)})`;
        ctx.beginPath();
        ctx.ellipse(sx, sy - 12 - bfh / 2, 5, bfh / 2, 0, 0, Math.PI * 2);
        ctx.fill();
        // Bright core
        ctx.fillStyle = `rgb(${Math.min(255,cr+30)}, ${Math.min(255,cg+30)}, ${Math.min(255,cb+20)})`;
        ctx.beginPath();
        ctx.ellipse(sx, sy - 12 - bfh * 0.3, 3, bfh * 0.3, 0, 0, Math.PI * 2);
        ctx.fill();
        // Sparks (occasional)
        if (Math.sin(now / 300 + seed) > 0.6) {
            ctx.fillStyle = '#ffe880';
            ctx.globalAlpha = 0.6;
            const spkY = sy - 14 - bfh + Math.sin(now / 50 + seed) * 3;
            ctx.beginPath();
            ctx.arc(sx + Math.sin(now / 70 + seed * 2) * 3, spkY, 1, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();

    } else if (light.type === 'fire_pit') {
        // Ring of stones with fire
        ctx.save();
        // Stone ring
        ctx.strokeStyle = '#5a5048';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.ellipse(sx, sy, 9, 4.5, 0, 0, Math.PI * 2);
        ctx.stroke();
        // Individual stones (darker dots on the ring)
        ctx.fillStyle = '#4a4038';
        for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            ctx.beginPath();
            ctx.arc(sx + Math.cos(a) * 9, sy + Math.sin(a) * 4.5, 2, 0, Math.PI * 2);
            ctx.fill();
        }
        // Inner ash bed
        ctx.fillStyle = '#2a2018';
        ctx.beginPath();
        ctx.ellipse(sx, sy, 6, 3, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        // Fire
        ctx.save();
        const pfh = 10 + Math.sin(now / 80 + seed) * 3;
        ctx.globalAlpha = 0.9 * flicker;
        ctx.fillStyle = `rgb(${cr}, ${Math.max(0,cg-30)}, ${Math.max(0,cb-40)})`;
        ctx.beginPath();
        ctx.ellipse(sx, sy - pfh / 2, 5, pfh / 2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgb(${Math.min(255,cr+20)}, ${Math.min(255,cg+30)}, ${Math.min(255,cb+20)})`;
        ctx.beginPath();
        ctx.ellipse(sx, sy - pfh * 0.3, 3, pfh * 0.3, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

    } else if (light.type === 'candle') {
        // Small candle with wax drip + tiny flame
        ctx.save();
        // Candle base/holder
        ctx.fillStyle = '#5a5048';
        ctx.beginPath();
        ctx.ellipse(sx, sy - 1, 3, 1.5, 0, 0, Math.PI * 2);
        ctx.fill();
        // Wax body
        ctx.fillStyle = '#d4c8a0';
        ctx.fillRect(sx - 1.5, sy - 10, 3, 9);
        // Wax drip
        ctx.fillStyle = '#c8bc90';
        ctx.fillRect(sx + 1, sy - 7, 1.5, 3);
        ctx.restore();
        // Tiny flame
        ctx.save();
        const cfh = 4 + Math.sin(now / 80 + seed) * 1.5;
        ctx.globalAlpha = 0.85 * flicker;
        ctx.fillStyle = `rgb(${cr}, ${cg}, ${Math.max(0,cb-40)})`;
        ctx.beginPath();
        ctx.ellipse(sx, sy - 10 - cfh / 2, 2, cfh / 2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fffae0';
        ctx.globalAlpha = 0.7 * flicker;
        ctx.beginPath();
        ctx.arc(sx, sy - 10 - cfh * 0.3, 0.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

    } else if (light.type === 'crystal') {
        // Pointed crystal cluster growing from floor
        ctx.save();
        // Base rubble
        ctx.fillStyle = '#4a4a40';
        ctx.beginPath();
        ctx.ellipse(sx, sy, 6, 2.5, 0, 0, Math.PI * 2);
        ctx.fill();
        // Main crystal shard
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = `rgba(${cr}, ${cg}, ${cb}, 0.7)`;
        ctx.beginPath();
        ctx.moveTo(sx - 3, sy);
        ctx.lineTo(sx - 1, sy - 16);
        ctx.lineTo(sx + 2, sy);
        ctx.closePath();
        ctx.fill();
        // Side shard
        ctx.fillStyle = `rgba(${Math.max(0,cr-20)}, ${Math.max(0,cg-10)}, ${cb}, 0.6)`;
        ctx.beginPath();
        ctx.moveTo(sx + 2, sy);
        ctx.lineTo(sx + 4, sy - 10);
        ctx.lineTo(sx + 6, sy);
        ctx.closePath();
        ctx.fill();
        // Small shard
        ctx.beginPath();
        ctx.moveTo(sx - 5, sy);
        ctx.lineTo(sx - 4, sy - 7);
        ctx.lineTo(sx - 3, sy);
        ctx.closePath();
        ctx.fill();
        // Inner glow line (bright highlight)
        ctx.strokeStyle = `rgba(${Math.min(255,cr+60)}, ${Math.min(255,cg+40)}, ${Math.min(255,cb+20)}, ${0.6 * flicker})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(sx - 1, sy - 2);
        ctx.lineTo(sx, sy - 14);
        ctx.stroke();
        ctx.restore();

    } else if (light.type === 'ice_crystal') {
        // Blue ice crystal formation
        ctx.save();
        ctx.fillStyle = '#3a4a5a';
        ctx.beginPath();
        ctx.ellipse(sx, sy, 6, 2.5, 0, 0, Math.PI * 2);
        ctx.fill();
        // Main ice shard
        ctx.globalAlpha = 0.8;
        ctx.fillStyle = `rgba(${cr}, ${cg}, ${cb}, 0.6)`;
        ctx.beginPath();
        ctx.moveTo(sx - 3, sy);
        ctx.lineTo(sx - 1, sy - 18);
        ctx.lineTo(sx + 2, sy);
        ctx.closePath();
        ctx.fill();
        // Side shard
        ctx.fillStyle = `rgba(${cr}, ${Math.max(0,cg-20)}, ${cb}, 0.5)`;
        ctx.beginPath();
        ctx.moveTo(sx + 2, sy - 1);
        ctx.lineTo(sx + 5, sy - 12);
        ctx.lineTo(sx + 7, sy);
        ctx.closePath();
        ctx.fill();
        // Frost highlight
        ctx.strokeStyle = `rgba(200, 230, 255, ${0.7 * flicker})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(sx - 1, sy - 3);
        ctx.lineTo(sx, sy - 16);
        ctx.stroke();
        ctx.restore();

    } else if (light.type === 'lava_crack') {
        // Glowing cracks in the floor
        ctx.save();
        ctx.globalAlpha = 0.9 * flicker;
        ctx.strokeStyle = `rgba(${cr}, ${cg}, ${cb}, 0.9)`;
        ctx.lineWidth = 1.5;
        // Main crack
        ctx.beginPath();
        ctx.moveTo(sx - 8, sy - 2);
        ctx.lineTo(sx - 2, sy + 1);
        ctx.lineTo(sx + 3, sy - 1);
        ctx.lineTo(sx + 9, sy + 2);
        ctx.stroke();
        // Branch crack
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(sx - 2, sy + 1);
        ctx.lineTo(sx - 4, sy + 5);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(sx + 3, sy - 1);
        ctx.lineTo(sx + 5, sy - 4);
        ctx.stroke();
        // Bright inner glow along cracks
        ctx.strokeStyle = `rgba(${Math.min(255,cr+40)}, ${Math.min(255,cg+60)}, ${Math.min(255,cb+40)}, ${0.6 * flicker})`;
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(sx - 6, sy - 1);
        ctx.lineTo(sx, sy);
        ctx.lineTo(sx + 7, sy + 1);
        ctx.stroke();
        ctx.restore();

    } else if (light.type === 'void_flame') {
        // Small stone pedestal with floating purple wisp
        ctx.save();
        // Pedestal
        ctx.fillStyle = '#3a2a3a';
        ctx.beginPath();
        ctx.ellipse(sx, sy - 1, 5, 2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#4a3a4a';
        ctx.fillRect(sx - 3, sy - 8, 6, 7);
        ctx.fillStyle = '#5a4a5a';
        ctx.beginPath();
        ctx.ellipse(sx, sy - 8, 4, 1.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        // Floating void wisp
        ctx.save();
        const vBob = Math.sin(now / 400 + seed) * 3;
        const vSize = 4 + Math.sin(now / 250 + seed * 1.3) * 1;
        ctx.globalAlpha = 0.8 * flicker;
        ctx.globalCompositeOperation = 'screen';
        const vGrad = ctx.createRadialGradient(sx, sy - 13 + vBob, 0, sx, sy - 13 + vBob, vSize * 2);
        vGrad.addColorStop(0, `rgba(${cr}, ${cg}, ${cb}, 0.8)`);
        vGrad.addColorStop(0.5, `rgba(${Math.max(0,cr-40)}, ${Math.max(0,cg-30)}, ${cb}, 0.3)`);
        vGrad.addColorStop(1, `rgba(${Math.max(0,cr-80)}, 0, ${Math.max(0,cb-40)}, 0)`);
        ctx.fillStyle = vGrad;
        ctx.beginPath();
        ctx.arc(sx, sy - 13 + vBob, vSize * 2, 0, Math.PI * 2);
        ctx.fill();
        // White-hot center
        ctx.fillStyle = `rgba(${Math.min(255,cr+60)}, ${Math.min(255,cg+80)}, ${Math.min(255,cb+30)}, 0.7)`;
        ctx.beginPath();
        ctx.arc(sx, sy - 13 + vBob, vSize * 0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

// Pass 1: Floor glow + physical props — drawn before darkness
function drawEnvironmentLightProps() {
    const lights = ENV_LIGHTS[currentZone];
    if (!lights) return;
    const now = performance.now();

    for (const light of lights) {
        const pos = tileToScreen(light.row, light.col);
        const sx = pos.x + cameraX;
        const sy = pos.y + cameraY;
        if (sx < -light.radius * 2 || sx > canvasW + light.radius * 2) continue;
        if (sy < -light.radius * 2 || sy > canvasH + light.radius * 2) continue;
        const fr = Math.floor(light.row), fc = Math.floor(light.col);
        if (fr >= 0 && fr < fogRevealed.length && fc >= 0 && fc < fogRevealed.length) {
            if (!fogRevealed[fr][fc]) continue;
        }
        const flicker = _envLightFlicker(light, now);

        // Floor glow (subtle warm/cool circle beneath prop)
        ctx.save();
        ctx.globalAlpha = light.intensity * flicker * 0.35;
        ctx.drawImage(_getEnvLightGlow(light), sx - light.radius, sy - light.radius + 4);
        ctx.restore();

        // Draw physical prop sprite
        _drawLightProp(sx, sy, light, flicker, now);

        // Ambient ember particles from fire-type lights
        if (typeof _emitParticle === 'function') {
            const fireTypes = new Set(['torch', 'brazier', 'fire_pit', 'lava_crack']);
            if (fireTypes.has(light.type) && Math.random() < 0.012) {
                // ~0.7 embers/sec per light at 60fps
                _emitParticle(
                    sx + (Math.random() - 0.5) * 8,
                    sy - 20 - Math.random() * 10,
                    (Math.random() - 0.5) * 0.8,  // drift
                    -1.2 - Math.random() * 0.8,     // float up
                    0.8 + Math.random() * 0.4,      // life
                    1 + Math.random(),               // size
                    '#ffaa44',                        // ember orange
                    0.5,
                    'ember',
                    'screen'
                );
            }
        }
    }
}

// Pass 2: Punchthrough — drawn AFTER darkness (screen blend)
function drawEnvironmentLightPunchthrough() {
    const lights = ENV_LIGHTS[currentZone];
    if (!lights) return;
    const now = performance.now();

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (const light of lights) {
        const pos = tileToScreen(light.row, light.col);
        const sx = pos.x + cameraX;
        const sy = pos.y + cameraY;
        if (sx < -light.radius * 2 || sx > canvasW + light.radius * 2) continue;
        if (sy < -light.radius * 2 || sy > canvasH + light.radius * 2) continue;
        const fr = Math.floor(light.row), fc = Math.floor(light.col);
        if (fr >= 0 && fr < fogRevealed.length && fc >= 0 && fc < fogRevealed.length) {
            if (!fogRevealed[fr][fc]) continue;
        }
        ctx.globalAlpha = light.intensity * _envLightFlicker(light, now) * 0.28;
        ctx.drawImage(_getEnvLightGlow(light), sx - light.radius, sy - light.radius + 4);
    }
    ctx.restore();
}

// Register wizard form draw handler
formHandlers.wizard.draw = function() { drawWizard(); };

// ============================================================
//  WIZARD OCCLUSION GHOST — draws just the sprite (no VFX)
//  Used by drawPlayerOcclusionGhost() for the above-darkness overlay.
// ============================================================
formHandlers.wizard.drawGhost = function(sx, sy) {
    const dir = player.dir8 || 'S';
    let sheet, frameCount;
    if (player.attacking) { sheet = images.wiz_attack2; frameCount = 6; }
    else if (player.state === 'walk') { sheet = images.wiz_walk; frameCount = 8; }
    else { sheet = images.wiz_idle; frameCount = 6; }
    if (!sheet) return;
    const fw = WIZARD_FRAME_W, fh = WIZARD_FRAME_H;
    const scale = WIZARD_SCALE;
    const dw = fw * scale, dh = fh * scale;
    const frame = Math.floor(player.animFrame) % Math.max(1, frameCount);
    let bob = 0;
    if (player.state === 'walk' && !player.dodging) bob = Math.sin(player.animFrame * Math.PI) * 2.0;
    const drawY = sy - dh * 0.72 - bob;
    const flipH = (dir === 'E' || dir === 'NE' || dir === 'SE');
    if (flipH) {
        ctx.save();
        ctx.translate(sx, drawY);
        ctx.scale(-1, 1);
        ctx.drawImage(sheet, frame * fw, 0, fw, fh, -dw / 2, 0, dw, dh);
        ctx.restore();
    } else {
        ctx.drawImage(sheet, frame * fw, 0, fw, fh, sx - dw / 2, drawY, dw, dh);
    }
};

// ============================================================
//  DARKNESS / LIGHTING SYSTEM
//  Handles dungeon torch light, hell zone crimson/ice/violet,
//  and outdoor town twilight. Drawn as multiply-blend fullscreen
//  passes after the depth-sorted world pass.
//  Moved here from skeleton.js — this is a core rendering function.
// ============================================================
function drawDarkness() {
    // ===== HELL ZONE: crimson inferno lighting =====
    const zoneCfg = ZONE_CONFIGS[currentZone];
    if (zoneCfg && zoneCfg.isHell) {
        let px, py;
        if (gamePhase === 'cinematic') {
            px = canvasW / 2; py = canvasH / 2 - 20;
        } else {
            const pos = tileToScreen(player.row, player.col);
            px = pos.x + cameraX; py = pos.y + cameraY - 20;
        }
        const flickerScale = gamePhase === 'cinematic' ? 0.3 : 1.0;
        const flicker = (Math.sin(lightFlicker * 3.7) * 8 +
                        Math.sin(lightFlicker * 5.3) * 4 +
                        Math.sin(lightFlicker * 1.1) * 12) * flickerScale;
        const radius = Math.max(5, lightRadius + flicker);

        // Zone-specific hell lighting colors
        // Nebula is now drawn AFTER darkness with screen blend + void clip,
        // so outer stops can be properly dark for the torch effect.
        let gradStops, pulseColor, filmColor;
        if (zoneCfg.isFrozen) {
            // Zone 5: Frozen Abyss — icy blue/purple
            gradStops = [
                [0,    'rgba(140, 180, 240, 1)'],
                [0.25, 'rgba(60, 100, 200, 1)'],
                [0.55, 'rgba(30, 50, 130, 1)'],
                [0.8,  'rgba(18, 28, 70, 1)'],
                [1,    'rgba(10, 15, 45, 1)'],
            ];
            pulseColor = [80, 120, 200];
            filmColor = 'rgba(15, 20, 60, 0.3)';
        } else if (zoneCfg.isFinalZone) {
            // Zone 6: Throne of Ruin — dark purple/violet
            gradStops = [
                [0,    'rgba(200, 140, 240, 1)'],
                [0.25, 'rgba(140, 60, 180, 1)'],
                [0.55, 'rgba(70, 25, 110, 1)'],
                [0.8,  'rgba(35, 12, 55, 1)'],
                [1,    'rgba(20, 6, 32, 1)'],
            ];
            pulseColor = [140, 40, 180];
            filmColor = 'rgba(40, 15, 50, 0.3)';
        } else {
            // Zone 4: The Inferno — crimson/orange
            gradStops = [
                [0,    'rgba(255, 200, 140, 1)'],
                [0.20, 'rgba(240, 120, 60, 1)'],
                [0.45, 'rgba(180, 60, 25, 1)'],
                [0.70, 'rgba(200, 80, 35, 1)'],
                [1,    'rgba(230, 110, 55, 1)'],
            ];
            pulseColor = [180, 40, 20];
            filmColor = 'rgba(60, 20, 15, 0.12)';
        }

        // Pass 1: radial glow
        ctx.save();
        ctx.globalCompositeOperation = 'multiply';
        const grad = ctx.createRadialGradient(px, py, 0, px, py, radius);
        for (const [stop, color] of gradStops) grad.addColorStop(stop, color);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, canvasW, canvasH);
        ctx.restore();

        // Pass 2: pulsing ambient glow
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        const pulse = 0.03 + Math.sin(lightFlicker * 0.8) * 0.015;
        ctx.fillStyle = `rgba(${pulseColor[0]}, ${pulseColor[1]}, ${pulseColor[2]}, ${pulse})`;
        ctx.fillRect(0, 0, canvasW, canvasH);
        ctx.restore();

        // Pass 3: darkness film
        ctx.save();
        ctx.globalCompositeOperation = 'multiply';
        ctx.fillStyle = filmColor;
        ctx.fillRect(0, 0, canvasW, canvasH);
        ctx.restore();
        return;
    }

    // Outdoor zones get bright ambient light instead of torch darkness
    if (zoneCfg && zoneCfg.lighting === 'outdoor') {
        // DARK FANTASY TOWN — cool twilight, overcast, gloomy
        ctx.save();

        // Layer 1: cold desaturated ambient (multiply) — overcast stone
        ctx.globalCompositeOperation = 'multiply';
        ctx.fillStyle = 'rgba(140, 130, 120, 0.92)';
        ctx.fillRect(0, 0, canvasW, canvasH);

        // Layer 2: directional shadow gradient (top-left slightly lighter = faint moon)
        const shadowGrad = ctx.createLinearGradient(0, 0, canvasW, canvasH);
        shadowGrad.addColorStop(0, 'rgba(160, 155, 145, 0.75)');
        shadowGrad.addColorStop(0.5, 'rgba(120, 115, 105, 0.82)');
        shadowGrad.addColorStop(1, 'rgba(80, 75, 70, 0.88)');
        ctx.fillStyle = shadowGrad;
        ctx.fillRect(0, 0, canvasW, canvasH);

        // Layer 3: fog gradient — thicker at edges, transparent near player
        ctx.globalAlpha = 0.25;
        const fogGrad = ctx.createRadialGradient(
            canvasW / 2, canvasH / 2, canvasH * 0.15,
            canvasW / 2, canvasH / 2, canvasH * 0.7
        );
        fogGrad.addColorStop(0, 'rgba(80, 80, 95, 0)');
        fogGrad.addColorStop(0.5, 'rgba(80, 80, 95, 0.2)');
        fogGrad.addColorStop(1, 'rgba(60, 60, 75, 0.5)');
        ctx.fillStyle = fogGrad;
        ctx.fillRect(0, 0, canvasW, canvasH);
        ctx.globalAlpha = 1;

        // Layer 4: faint cool blue screen cast — pushes shadows toward blue
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = 0.025;
        ctx.fillStyle = 'rgba(80, 100, 140, 1)';
        ctx.fillRect(0, 0, canvasW, canvasH);

        ctx.restore();
        return;
    }

    let px, py;
    if (gamePhase === 'cinematic') {
        px = canvasW / 2;
        py = canvasH / 2 - 20;
    } else {
        const pos = tileToScreen(player.row, player.col);
        px = pos.x + cameraX;
        py = pos.y + cameraY - 20;
    }

    const flickerScale = gamePhase === 'cinematic' ? 0.3 : 1.0;
    const flicker = (Math.sin(lightFlicker * 3.7) * 8 +
                    Math.sin(lightFlicker * 5.3) * 4 +
                    Math.sin(lightFlicker * 1.1) * 12) * flickerScale;
    const radius = Math.max(5, lightRadius + flicker);

    // Pass 1: radial torch light (same proven structure as original)
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    const grad = ctx.createRadialGradient(px, py, 0, px, py, radius);
    grad.addColorStop(0, 'rgba(210, 185, 135, 1)');
    grad.addColorStop(0.3, 'rgba(160, 120, 75, 1)');
    grad.addColorStop(0.65, 'rgba(50, 32, 14, 1)');
    grad.addColorStop(1, 'rgba(8, 4, 2, 1)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvasW, canvasH);
    ctx.restore();

    // Pass 2: overall darkness film — dims everything including the lit center
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = 'rgba(48, 35, 25, 0.58)';
    ctx.fillRect(0, 0, canvasW, canvasH);
    ctx.restore();
}

// ============================================================
//  PLAYER OCCLUSION GHOST
//  Draws the player sprite at reduced alpha ABOVE darkness so
//  the character silhouette is always visible through tall tiles.
//  Delegates to each form's drawGhost(sx, sy) handler to avoid
//  duplicating sprite logic for every form.
// ============================================================
function drawPlayerOcclusionGhost() {
    if (gamePhase !== 'playing' || gameDead) return;

    const pos = tileToScreen(player.row, player.col);
    const sx = pos.x + cameraX;
    const sy = pos.y + cameraY;

    ctx.save();
    ctx.globalAlpha = 0.4;

    const handler = FormSystem.getHandler();
    if (handler && handler.drawGhost) {
        handler.drawGhost(sx, sy);
    }
    // If no drawGhost handler, fall through silently — the main draw already rendered.

    ctx.restore();
}

