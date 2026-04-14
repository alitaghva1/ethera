// ============================================================
//  NPC SYSTEM — Non-Player Characters for the Hub Town
// ============================================================

// ----- GLOBALS -----
let npcList = [];
let currentNPC = null;        // the NPC player is interacting with
let npcDialogueOpen = false;  // whether dialogue box is shown
let npcDialogueFadeIn = 0;    // fade-in timer
let npcDialogueIndex = 0;     // which dialogue line to show
// Persistent dialogue progress — tracks max dialogue index reached per NPC
const _npcDialogueProgress = {};

// ----- NPC SERVICE MENUS -----
let smithyMenuOpen = false;   // Garrett's enchantment forge
let shopMenuOpen = false;     // Senna's potion shop
let smithyFadeIn = 0;
let shopFadeIn = 0;
let smithyHover = -1;         // hovered equipment slot index (0-3)
let shopHover = -1;           // hovered potion index (0-2)
let smithyResultText = '';    // feedback text after enchant attempt
let smithyResultTimer = 0;    // fade timer for feedback
let shopResultText = '';
let shopResultTimer = 0;

const NPC_INTERACTION_RANGE = 2.2; // tiles
const NPC_DEPTH_MULTIPLIER = 100;  // fixed constant for depth sort scoring

// ----- NPC DEFINITIONS (by zone) -----
// Each NPC has: id, name, row, col, zone, spriteKey, frameCount, frameW, frameH, dialogue[], scale, tint
const NPC_REGISTRY = {
    0: [ // Zone 0 — The Hamlet
        {
            id: 'garrett',
            name: 'Garrett the Smith',
            portrait: 'portrait_garrett', // dark-bearded craftsman
            row: 16, col: 8, // moved from (15,6) — 2 tiles from forge rebuild point, toward road
            zone: 0,
            spriteKey: 'enemy_armoredskel_idle',
            frameCount: 6,
            frameW: 100, frameH: 100,
            scale: 1.7, // scaled up for visibility
            tint: { r: 255, g: 160, b: 80, a: 0.45 }, // warm orange (forge fire)
            dialogue: [
                'The hammer keeps me focused. Without it, I start to forget things.',
                'You need something forged? Good. Keeps the fire alive. Keeps me alive.',
                'A woman came through once. Asked me to make something strange \u2014 a talisman housing. My hands remembered how.',
                'Bring me Infernal Ore from the burning depths. I don\'t know why I need it. But my hands do.',
            ],
            dialogueIndex: 0,
        },
        {
            id: 'mira',
            name: 'Old Mira',
            portrait: 'portrait_mira', // weathered elder who remembers Elara
            row: 10, col: 12,
            zone: 0,
            spriteKey: 'npc_wizard_idle', // robed figure — distinct from skeleton enemies
            frameCount: 6,
            frameW: 100, frameH: 100,
            scale: 1.6, // scaled up from 1.5 for visibility
            tint: { r: 180, g: 255, b: 180, a: 0.5 }, // soft green (herbalist)
            dialogue: [
                'I keep forgetting things. But I remember her. Elara. She walked through here and the ground felt warm.',
                'We\'re all still here. I don\'t know why. The others don\'t ask.',
                'You look new. Like you just arrived. We don\'t get new ones anymore.',
                'She said she\'d come back. She was lying. But it was a kind lie.',
            ],
            dialogueIndex: 0,
        },
        {
            id: 'aldric',
            name: 'Captain Aldric',
            portrait: 'portrait_aldric', // armored duty-bound captain
            row: 7, col: 8,
            zone: 0,
            spriteKey: 'enemy_werewolf_idle', // beastly guard — unique silhouette vs other NPCs
            frameCount: 6,
            frameW: 100, frameH: 100,
            scale: 1.7,
            tint: { r: 120, g: 160, b: 255, a: 0.5 }, // bright steel blue (captain)
            dialogue: [
                'I guard the north road. Against what, I can\'t remember. But I guard it.',
                'Used to be more of us. Don\'t know where they went. Maybe they just stopped.',
                'A scholar came through once. Walked right past my post. Didn\'t even look afraid.',
                'You\'re going down there? Good. Someone has to.',
            ],
            dialogueIndex: 0,
        },
        {
            id: 'hermit',
            name: 'The Hermit',
            portrait: 'portrait_hermit', // hooded mystic sage
            row: 7, col: 22, // moved from (6,24) — 2 tiles from hut rebuild, toward road
            zone: 0,
            spriteKey: 'enemy_palequeen_idle',
            frameCount: 8,
            frameW: 100, frameH: 100,
            scale: 1.6, // scaled up from 1.5
            tint: { r: 180, g: 120, b: 255, a: 0.4 }, // mystical purple
            dialogue: [
                'You died, you know. Most people don\'t get back up.',
                'The talisman you carry \u2014 she had one just like it. Do you feel it pulling?',
                'There\'s a tome in the Spire. It explains what happened here. What happened to all of us.',
                'The covenant isn\'t a prison. It\'s a choice. Remember that when you reach her.',
            ],
            dialogueIndex: 0,
        },
        {
            id: 'senna',
            name: 'Senna the Alchemist',
            portrait: 'portrait_senna', // sharp-eyed alchemist researcher
            row: 16, col: 22,
            zone: 0,
            spriteKey: 'enemy_bonemage_idle', // robed caster — alchemist/researcher silhouette
            frameCount: 6,
            frameW: 100, frameH: 100,
            scale: 1.6, // scaled up from 1.5 for visibility
            tint: { r: 255, g: 220, b: 80, a: 0.5 }, // bright gold (alchemist)
            dialogue: [
                'I mix things. Potions, elixirs. I keep hoping one of them will make me feel warm again.',
                'Frost Essence from the frozen reaches \u2014 I need it. Not for a potion. For a theory.',
                'Evolution isn\'t dying. It\'s remembering what you really are. Layer by layer.',
                'She made a covenant. Bound herself to the dark so it wouldn\'t spread. Someone has to hold the line.',
            ],
            dialogueIndex: 0,
        },
    ],
    4: [ // Zone 4 — The Inferno
        {
            id: 'ghost_pilgrim',
            name: 'Fading Pilgrim',
            portrait: 'portrait_pilgrim', // hollowed ghost who failed to reach Elara
            row: 10, col: 14,
            zone: 4,
            spriteKey: 'enemy_skel_idle',
            frameCount: 6,
            frameW: 100, frameH: 100,
            scale: 1.3,
            tint: { r: 200, g: 220, b: 255, a: 0.3 },
            isGhost: true,  // custom rendering flag
            dialogue: [
                'You can still turn back. I couldn\'t.',
                'She\'s down there... on the throne. Holding the corruption at bay.',
                'The Pale doesn\'t want to be disturbed. Its guardians will try to stop you.',
                'If you reach her... tell her someone tried.',
            ],
            dialogueIndex: 0,
        },
    ],
    6: [ // Zone 6 — Throne of Ruin
        {
            id: 'pale_queen',
            name: 'Elara — The Pale Queen',
            portrait: 'portrait_elara', // gaunt, holding the covenant together
            row: 26, col: 16,
            zone: 6,
            spriteKey: 'enemy_palequeen_idle',
            frameCount: 8,
            frameW: 100, frameH: 100,
            scale: 1.8,
            tint: null,  // unique sprite, no tint needed
            isPaleQueen: true,  // custom rendering flag
            dialogue: [
                'You... you\'re alive. I thought the talisman would be enough. I thought you\'d stay away.',
                'The Pale Covenant must be held. One mind, one will, holding the corruption in check.',
                'If I let go, the rot consumes everything. Every village, every soul. I\'ve seen it.',
                'You have two choices. Shatter the covenant and free me — the world will need a new answer. Or take my place, and I walk free while you sit here... forever.',
                'Choose. Please. I don\'t have much time left in me.',
            ],
            dialogueIndex: 0,
        },
    ],
};

// ----- ANIMATION STATE -----
let npcAnimFrames = {}; // { npcId: animFrame }

// ----- INITIALIZATION -----
function initNPCs() {
    loadZoneNPCs(currentZone);
}

function loadZoneNPCs(zoneNumber) {
    npcList = [];
    npcAnimFrames = {};
    currentNPC = null;
    npcDialogueOpen = false;
    npcDialogueFadeIn = 0;

    const registry = NPC_REGISTRY[zoneNumber] || [];
    for (const npcDef of registry) {
        npcList.push({ ...npcDef });
        npcAnimFrames[npcDef.id] = 0;
    }
    // Restore dialogue progress from persistence map
    for (const npc of npcList) {
        npc.dialogueIndex = _npcDialogueProgress[npc.id] || 0;
    }

    // Add dedicated light sources at NPC positions (hamlet only)
    if (zoneNumber === 0 && typeof ENV_LIGHTS !== 'undefined') {
        if (!ENV_LIGHTS[0]) ENV_LIGHTS[0] = [];
        for (const npc of npcList) {
            if (npc.tint) {
                ENV_LIGHTS[0].push({
                    row: npc.row, col: npc.col,
                    type: 'candle',
                    color: [npc.tint.r, npc.tint.g, npc.tint.b],
                    radius: 38,
                    intensity: 0.55,
                });
            }
        }
    }
}

// ----- UPDATE -----
function updateNPCs(dt) {
    // Advance animation frames
    for (const npc of npcList) {
        const frameCount = npc.frameCount;
        const animSpeed = 8; // frame advances per second
        npcAnimFrames[npc.id] = (npcAnimFrames[npc.id] + dt * animSpeed) % frameCount;
    }
}

// ----- RENDERING -----
function getNPCSpriteList() {
    const sprites = [];
    for (const npc of npcList) {
        const eDepth = npc.row + npc.col;
        const eScore = eDepth * NPC_DEPTH_MULTIPLIER + npc.row;
        sprites.push({
            score: eScore,
            id: 'npc_' + npc.id,
            draw: () => drawNPC(npc),
        });
    }
    return sprites;
}

function drawNPC(npc) {
    const sheetKey = npc.spriteKey;
    const sheet = images[sheetKey];
    if (!sheet) return;

    const frameCount = npc.frameCount;
    const frame = Math.floor(npcAnimFrames[npc.id] % frameCount);

    const pos = tileToScreen(npc.row, npc.col);
    const sx = pos.x + cameraX;
    const sy = pos.y + cameraY;

    // Off-screen culling — skip NPCs not visible on screen
    if (sx < -120 || sx > canvasW + 120 || sy < -180 || sy > canvasH + 80) return;

    const dw = npc.frameW * npc.scale;
    const dh = npc.frameH * npc.scale;
    const drawY = sy - dh * 0.72;

    // Ghost NPC: vertical bob offset + translucent rendering
    const isGhost = !!npc.isGhost;
    const isPaleQueen = !!npc.isPaleQueen;
    const ghostBob = isGhost ? Math.sin(performance.now() / 800 + npc.row * 3) * 4 : 0;
    // NPCs whose buildings aren't rebuilt appear dimmer/ghostlier
    const _npcBld = typeof NPC_BUILDING_MAP !== 'undefined' ? NPC_BUILDING_MAP[npc.id] : null;
    const _npcRebuilt = !_npcBld || (typeof isRebuilt === 'function' ? isRebuilt(_npcBld) : (typeof hamletRebuild !== 'undefined' && hamletRebuild[_npcBld]));
    const baseAlpha = isGhost ? 0.35 + Math.sin(performance.now() / 1200) * 0.1
        : (_npcRebuilt ? 1.0 : 0.5 + Math.sin(performance.now() / 1000) * 0.05);

    // Shadow (ghosts have no shadow)
    if (!isGhost) {
        ctx.save();
        ctx.globalAlpha = 0.25;
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.ellipse(sx, sy + 4, 14, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    // Pale Queen: dramatic aura effect
    if (isPaleQueen) {
        ctx.save();
        const pulseR = 35 + Math.sin(performance.now() / 500) * 8;
        // Dark inner aura
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = 0.12 + Math.sin(performance.now() / 700) * 0.05;
        const queenAura = ctx.createRadialGradient(sx, sy - 20, 0, sx, sy - 20, pulseR * 2);
        queenAura.addColorStop(0, 'rgba(180, 120, 255, 0.6)');
        queenAura.addColorStop(0.4, 'rgba(120, 60, 200, 0.3)');
        queenAura.addColorStop(1, 'rgba(60, 20, 100, 0)');
        ctx.fillStyle = queenAura;
        ctx.beginPath();
        ctx.ellipse(sx, sy - 20, pulseR * 2, pulseR * 1.5, 0, 0, Math.PI * 2);
        ctx.fill();
        // Ground corruption ring
        ctx.globalAlpha = 0.08 + Math.sin(performance.now() / 900) * 0.04;
        const corruptRing = ctx.createRadialGradient(sx, sy + 2, 8, sx, sy + 2, 40);
        corruptRing.addColorStop(0, 'rgba(100, 40, 160, 0.5)');
        corruptRing.addColorStop(1, 'rgba(40, 10, 60, 0)');
        ctx.fillStyle = corruptRing;
        ctx.beginPath();
        ctx.ellipse(sx, sy + 2, 40, 16, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    // Colored glow ring at NPC's feet — boosted visibility for identification
    if (npc.tint) {
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = (0.25 + Math.sin(performance.now() / 600 + npc.row) * 0.08) * baseAlpha; // boosted from 0.15
        var _glowR = isGhost ? 30 : 26; // larger than before (was 20/25)
        const tGrad = ctx.createRadialGradient(sx, sy + 2 + ghostBob, 0, sx, sy + 2 + ghostBob, _glowR);
        tGrad.addColorStop(0, 'rgba(' + npc.tint.r + ',' + npc.tint.g + ',' + npc.tint.b + ',0.6)');
        tGrad.addColorStop(0.6, 'rgba(' + npc.tint.r + ',' + npc.tint.g + ',' + npc.tint.b + ',0.2)');
        tGrad.addColorStop(1, 'rgba(' + npc.tint.r + ',' + npc.tint.g + ',' + npc.tint.b + ',0)');
        ctx.fillStyle = tGrad;
        ctx.beginPath();
        ctx.ellipse(sx, sy + 2 + ghostBob, _glowR, _glowR * 0.45, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    // Draw sprite — with subtle idle breathing bob + color tint via filter
    const breathBob = Math.sin(performance.now() / 1200 + npc.row * 2) * 0.8;
    const _sprX = sx - dw / 2;
    const _sprY = drawY + ghostBob + breathBob;
    ctx.save();
    ctx.globalAlpha = baseAlpha;
    // Apply CSS filter tint to differentiate NPC sprites by color
    if (npc.tint) {
        // Convert RGB tint to hue-rotate + saturate + brightness
        var _tr = npc.tint.r, _tg = npc.tint.g, _tb = npc.tint.b;
        var _hue = Math.round(Math.atan2(Math.sqrt(3) * (_tg - _tb), 2 * _tr - _tg - _tb) * 180 / Math.PI);
        var _sat = Math.round(100 + (Math.max(_tr, _tg, _tb) - Math.min(_tr, _tg, _tb)) * 0.3);
        var _bri = Math.round(80 + ((_tr + _tg + _tb) / 765) * 40);
        try { ctx.filter = 'hue-rotate(' + _hue + 'deg) saturate(' + _sat + '%) brightness(' + _bri + '%)'; } catch(e) {}
    }
    ctx.drawImage(sheet, frame * npc.frameW, 0, npc.frameW, npc.frameH, _sprX, _sprY, dw, dh);
    ctx.filter = 'none';
    ctx.restore();

    // Floating portrait medallion above NPC — instant face recognition from distance
    var _pMedKey = npc.portrait;
    var _pMedImg = _pMedKey && typeof images !== 'undefined' ? images[_pMedKey] : null;
    if (_pMedImg) {
        var _medSize = 22; // medallion diameter
        var _medY = drawY + ghostBob - 38; // above name label
        var _medBob = Math.sin(performance.now() / 1500 + npc.col) * 1.5; // gentle float
        ctx.save();
        ctx.globalAlpha = baseAlpha * 0.85;
        // Circular clip mask
        ctx.beginPath();
        ctx.arc(sx, _medY + _medBob, _medSize / 2, 0, Math.PI * 2);
        ctx.save();
        ctx.clip();
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(_pMedImg, sx - _medSize / 2, _medY + _medBob - _medSize / 2, _medSize, _medSize);
        ctx.imageSmoothingEnabled = true;
        ctx.restore();
        // Colored border ring
        ctx.strokeStyle = npc.tint ? 'rgb(' + npc.tint.r + ',' + npc.tint.g + ',' + npc.tint.b + ')' : '#aa9977';
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = baseAlpha * 0.7;
        ctx.beginPath();
        ctx.arc(sx, _medY + _medBob, _medSize / 2 + 1, 0, Math.PI * 2);
        ctx.stroke();
        // Dark backing behind ring
        ctx.globalCompositeOperation = 'destination-over';
        ctx.globalAlpha = baseAlpha * 0.5;
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(sx, _medY + _medBob, _medSize / 2 + 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        ctx.restore();
    }

    // Name tag above NPC — with dark background panel for readability
    ctx.save();
    var _nameAlpha = (isPaleQueen ? 0.85 : 0.7) * baseAlpha;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = isPaleQueen ? 'bold 11px Georgia' : 'bold 10px Georgia';
    var _nameText = npc.name;
    var _nameY = drawY + ghostBob - 14;
    var _nameW = ctx.measureText(_nameText).width;
    // Dark background pill for readability against any terrain
    ctx.globalAlpha = _nameAlpha * 0.5;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.roundRect(sx - _nameW / 2 - 6, _nameY - 8, _nameW + 12, 16, 4);
    ctx.fill();
    // Name text with tint accent color
    ctx.globalAlpha = _nameAlpha;
    var _nameColor = isPaleQueen ? '#cc99ff' : (isGhost ? '#aabbdd' : '#e8d4aa');
    if (npc.tint && !isPaleQueen && !isGhost) {
        // Blend name color toward NPC's tint for identity
        _nameColor = 'rgb(' + Math.round(220 + npc.tint.r * 0.1) + ',' + Math.round(200 + npc.tint.g * 0.1) + ',' + Math.round(160 + npc.tint.b * 0.1) + ')';
    }
    ctx.fillStyle = _nameColor;
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 3;
    ctx.fillText(_nameText, sx, _nameY);
    ctx.shadowBlur = 0;

    // Service indicator icon above service NPCs — only after building rebuilt
    if ((npc.id === 'garrett' && _npcRebuilt) || (npc.id === 'senna' && _npcRebuilt)) {
        const svcPulse = 0.5 + Math.sin(performance.now() / 800) * 0.2;
        ctx.globalAlpha = svcPulse * baseAlpha;
        ctx.font = '12px Georgia';
        ctx.fillStyle = npc.id === 'garrett' ? '#dd9944' : '#66cc88';
        ctx.strokeStyle = 'rgba(0,0,0,0.7)';
        ctx.lineWidth = 2;
        const svcIcon = npc.id === 'garrett' ? '\u2692' : '\u25C6';
        ctx.strokeText(svcIcon, sx, drawY + ghostBob - 22);
        ctx.fillText(svcIcon, sx, drawY + ghostBob - 22);
    }

    ctx.restore();

    // Interaction prompt (E key badge) when player is close
    const dist = Math.sqrt((npc.row - player.row) ** 2 + (npc.col - player.col) ** 2);
    if (dist < NPC_INTERACTION_RANGE && !npcDialogueOpen && !smithyMenuOpen && !shopMenuOpen) {
        ctx.save();
        const pulse = 0.6 + Math.sin(performance.now() / 500) * 0.2;
        const promptY = drawY + ghostBob - 24;
        const accentColor = isPaleQueen ? '#9966cc' : '#aa9060';
        const textColor = isPaleQueen ? '#cc99ff' : '#e8d4a0';
        const labelColor = isPaleQueen ? '#aa88cc' : '#c4a878';

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Register bounds for overlap prevention
        if (typeof _registerWorldLabel === 'function') _registerWorldLabel(sx, promptY + 4, 80, 40);

        // Key badge background
        ctx.globalAlpha = pulse * 0.7 * baseAlpha;
        ctx.fillStyle = isPaleQueen ? '#140e1a' : '#1a1408';
        ctx.strokeStyle = accentColor;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(sx - 14, promptY - 10, 28, 20, 4);
        ctx.fill();
        ctx.stroke();

        // Key letter
        ctx.globalAlpha = pulse * 0.9 * baseAlpha;
        ctx.font = 'bold 11px monospace';
        ctx.fillStyle = textColor;
        ctx.fillText('E', sx, promptY);

        // "Talk" label below badge
        ctx.globalAlpha = pulse * 0.5 * baseAlpha;
        ctx.font = 'italic 10px Georgia';
        ctx.fillStyle = labelColor;
        ctx.fillText('Talk', sx, promptY + 18);

        ctx.restore();
    }
}

function drawNPCDialogue() {
    if (!npcDialogueOpen || !currentNPC) return;

    npcDialogueFadeIn = Math.min(1, npcDialogueFadeIn + 0.05);
    const fa = npcDialogueFadeIn;

    ctx.save();

    // Dim overlay
    ctx.globalAlpha = fa * 0.5;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvasW, canvasH);

    // Dialogue box at bottom of screen (responsive positioning)
    const bw = Math.min(600, canvasW - 80);
    const bx = (canvasW - bw) / 2;
    const by = Math.max(80, canvasH - 140);
    const bh = 120;

    // Parchment background — tinted for Pale Queen, with border glow
    const _isPQ = currentNPC.isPaleQueen;
    const _borderColor = _isPQ ? '#7a5aaa' : '#8a7a5a';

    // Outer glow behind the box
    ctx.globalAlpha = fa * 0.12;
    ctx.shadowColor = _isPQ ? 'rgba(120, 80, 180, 0.5)' : 'rgba(180, 140, 60, 0.4)';
    ctx.shadowBlur = 20;
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.roundRect(bx - 2, by - 2, bw + 4, bh + 4, 8); ctx.fill();
    ctx.shadowBlur = 0;

    // Background gradient
    ctx.globalAlpha = fa * 0.95;
    const parchGrad = ctx.createLinearGradient(bx, by, bx, by + bh);
    if (_isPQ) {
        parchGrad.addColorStop(0, '#1e1828');
        parchGrad.addColorStop(0.1, '#1a1422');
        parchGrad.addColorStop(0.9, '#14101c');
        parchGrad.addColorStop(1, '#100c16');
    } else {
        parchGrad.addColorStop(0, '#2a2420');
        parchGrad.addColorStop(0.1, '#24201a');
        parchGrad.addColorStop(0.9, '#1e1a14');
        parchGrad.addColorStop(1, '#18140e');
    }
    ctx.fillStyle = parchGrad;
    ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 6); ctx.fill();

    // Border with subtle glow
    ctx.globalAlpha = fa * 0.4;
    ctx.strokeStyle = _borderColor;
    ctx.lineWidth = 2;
    ctx.shadowColor = _borderColor;
    ctx.shadowBlur = 6;
    ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 6); ctx.stroke();
    ctx.shadowBlur = 0;

    // ── Portrait rendering ──
    const _portraitKey = currentNPC.portrait;
    const _portraitImg = _portraitKey && typeof images !== 'undefined' ? images[_portraitKey] : null;
    const _portraitSize = 64; // render 32px portrait at 2x scale
    const _portraitPad = 8;
    const _hasPortrait = !!_portraitImg;
    const _textOffsetX = _hasPortrait ? _portraitSize + _portraitPad * 2 + 4 : 20; // shift text right when portrait present

    if (_hasPortrait) {
        const _px = bx + _portraitPad;
        const _py = by + (bh - _portraitSize) / 2; // vertically centered in dialogue box

        // Portrait background circle
        ctx.globalAlpha = fa * 0.6;
        ctx.fillStyle = '#0a0806';
        ctx.beginPath();
        ctx.roundRect(_px - 3, _py - 3, _portraitSize + 6, _portraitSize + 6, 6);
        ctx.fill();

        // Portrait border
        ctx.strokeStyle = _isPQ ? '#8866cc' : _borderColor;
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = fa * 0.5;
        ctx.beginPath();
        ctx.roundRect(_px - 3, _py - 3, _portraitSize + 6, _portraitSize + 6, 6);
        ctx.stroke();

        // Portrait image (nearest-neighbor scaling for pixel art)
        ctx.globalAlpha = fa * 0.95;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(_portraitImg, _px, _py, _portraitSize, _portraitSize);
        ctx.imageSmoothingEnabled = true;

        // Ghost NPCs get translucent portrait
        if (currentNPC.isGhost) {
            ctx.globalAlpha = fa * 0.4;
            ctx.fillStyle = '#000';
            ctx.beginPath();
            ctx.roundRect(_px, _py, _portraitSize, _portraitSize, 4);
            ctx.fill();
        }

        // NPC tint glow behind portrait (subtle color accent)
        if (currentNPC.tint) {
            ctx.globalCompositeOperation = 'screen';
            ctx.globalAlpha = fa * 0.08;
            ctx.fillStyle = 'rgb(' + currentNPC.tint.r + ',' + currentNPC.tint.g + ',' + currentNPC.tint.b + ')';
            ctx.beginPath();
            ctx.roundRect(_px - 6, _py - 6, _portraitSize + 12, _portraitSize + 12, 8);
            ctx.fill();
            ctx.globalCompositeOperation = 'source-over';
        }
    }

    // NPC name (offset right when portrait present)
    ctx.globalAlpha = fa * 0.7;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = _isPQ ? 'bold 13px Georgia' : 'bold 12px Georgia';
    ctx.fillStyle = _isPQ ? '#cc99ff' : '#ffcc88';
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 2;
    ctx.strokeText(currentNPC.name, bx + _textOffsetX, by + 12);
    ctx.fillText(currentNPC.name, bx + _textOffsetX, by + 12);

    // Divider line
    ctx.globalAlpha = fa * 0.2;
    ctx.strokeStyle = '#8a7a5a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(bx + _textOffsetX, by + 32);
    ctx.lineTo(bx + bw - 20, by + 32);
    ctx.stroke();

    // Dialogue text with typewriter reveal
    const activeDialogue = getFormReactiveDialogue(currentNPC);
    const fullDialogueLine = activeDialogue[currentNPC.dialogueIndex % activeDialogue.length];
    // Typewriter: reveal characters over time (35 chars/sec)
    if (!currentNPC._typewriterTimer) currentNPC._typewriterTimer = 0;
    currentNPC._typewriterTimer += 1 / 60; // approximate dt
    const charsRevealed = Math.floor(currentNPC._typewriterTimer * 35);
    const dialogueLine = fullDialogueLine.substring(0, Math.min(charsRevealed, fullDialogueLine.length));
    ctx.globalAlpha = fa * 0.8;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = '11px Georgia';
    ctx.fillStyle = '#c4a878';
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1.5;

    // Word wrap dialogue (accounting for portrait width)
    const maxW = bw - _textOffsetX - 30;
    const words = dialogueLine.split(' ');
    let curLine = '';
    let lineY = by + 44;
    const lineHeight = 16;
    const maxLines = 4;
    let lineCount = 0;

    for (const word of words) {
        const test = curLine + (curLine ? ' ' : '') + word;
        if (ctx.measureText(test).width > maxW) {
            if (lineCount < maxLines) {
                ctx.strokeText(curLine, bx + _textOffsetX, lineY);
                ctx.fillText(curLine, bx + _textOffsetX, lineY);
                lineY += lineHeight;
                lineCount++;
            }
            curLine = word;
        } else {
            curLine = test;
        }
    }
    if (curLine && lineCount < maxLines) {
        ctx.strokeText(curLine, bx + _textOffsetX, lineY);
        ctx.fillText(curLine, bx + _textOffsetX, lineY);
    }

    // Quest choice UI (Senna's Frozen Heart)
    if (typeof questState !== 'undefined' && questState.flags.senna_choice_pending && currentNPC.id === 'senna') {
        const choiceY = by - 50;
        const choiceW = (bw - 60) / 2;
        const choiceH = 36;
        const choiceX1 = bx + 20;
        const choiceX2 = bx + 40 + choiceW;

        // Store choice rects for click handling
        questState._choiceRects = {
            a: { x: choiceX1, y: choiceY, w: choiceW, h: choiceH },
            b: { x: choiceX2, y: choiceY, w: choiceW, h: choiceH },
        };

        // Choice A: Keep it whole (+15 HP)
        const hoverA = mouse && mouse.x >= choiceX1 && mouse.x <= choiceX1 + choiceW && mouse.y >= choiceY && mouse.y <= choiceY + choiceH;
        ctx.globalAlpha = fa * 0.85;
        ctx.fillStyle = hoverA ? 'rgba(40,60,40,0.95)' : 'rgba(25,22,18,0.95)';
        ctx.beginPath(); ctx.roundRect(choiceX1, choiceY, choiceW, choiceH, 5); ctx.fill();
        ctx.strokeStyle = hoverA ? '#66cc66' : '#8a7a5a';
        ctx.lineWidth = 1.5; ctx.globalAlpha = fa * 0.6;
        ctx.beginPath(); ctx.roundRect(choiceX1, choiceY, choiceW, choiceH, 5); ctx.stroke();
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = 'bold 10px Georgia'; ctx.fillStyle = '#88cc88'; ctx.globalAlpha = fa * 0.9;
        ctx.fillText('Keep It Whole', choiceX1 + choiceW / 2, choiceY + 12);
        ctx.font = '8px monospace'; ctx.fillStyle = '#aaa'; ctx.globalAlpha = fa * 0.6;
        ctx.fillText('+15 Max HP', choiceX1 + choiceW / 2, choiceY + 26);

        // Choice B: Shatter it (+2 potion capacity)
        const hoverB = mouse && mouse.x >= choiceX2 && mouse.x <= choiceX2 + choiceW && mouse.y >= choiceY && mouse.y <= choiceY + choiceH;
        ctx.globalAlpha = fa * 0.85;
        ctx.fillStyle = hoverB ? 'rgba(40,40,60,0.95)' : 'rgba(25,22,18,0.95)';
        ctx.beginPath(); ctx.roundRect(choiceX2, choiceY, choiceW, choiceH, 5); ctx.fill();
        ctx.strokeStyle = hoverB ? '#6688cc' : '#8a7a5a';
        ctx.lineWidth = 1.5; ctx.globalAlpha = fa * 0.6;
        ctx.beginPath(); ctx.roundRect(choiceX2, choiceY, choiceW, choiceH, 5); ctx.stroke();
        ctx.font = 'bold 10px Georgia'; ctx.fillStyle = '#88aacc'; ctx.globalAlpha = fa * 0.9;
        ctx.fillText('Shatter It', choiceX2 + choiceW / 2, choiceY + 12);
        ctx.font = '8px monospace'; ctx.fillStyle = '#aaa'; ctx.globalAlpha = fa * 0.6;
        ctx.fillText('+2 Potion Slots', choiceX2 + choiceW / 2, choiceY + 26);

        // Replace E hint with choice instruction
        ctx.globalAlpha = fa * 0.5;
        ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.font = '9px Georgia'; ctx.fillStyle = '#e8c840';
        ctx.fillText('Click to choose your reward', bx + bw / 2, by + bh - 8);
    } else {
        // "Press E to continue" hint
        ctx.globalAlpha = fa * 0.4;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        ctx.font = '8px monospace';
        ctx.fillStyle = '#8a7a5a';
        ctx.strokeText('[E] to continue', bx + bw - 20, by + bh - 8);
        ctx.fillText('[E] to continue', bx + bw - 20, by + bh - 8);
    }

    ctx.restore();
}

// ----- FORM-REACTIVE DIALOGUE -----
// NPCs react to the player's current evolution form with a unique opening line.
// These override the first dialogue line when the player is NOT in wizard form.
const NPC_FORM_REACTIONS = {
    garrett: {
        slime:    'The forge doesn\'t care what shape you are. Neither do I.',
        skeleton: 'Hah. Bones. You\'d fit right in around here.',
        lich:     'The temperature dropped ten degrees. What are you?',
    },
    mira: {
        slime:    'Oh my. You\'re like us, aren\'t you? Changed.',
        skeleton: 'Another skeleton. But you move differently. Like you chose this.',
        lich:     'The cold. You\'ve gone deep, haven\'t you?',
    },
    aldric: {
        slime:    'I\'ve seen stranger things on this road. You may pass.',
        skeleton: 'A skeleton with purpose. That\'s more than most of us have.',
        lich:     'You came back from down there. What did you see?',
    },
    hermit: {
        slime:    'The first form. Formless. You have far to go.',
        skeleton: 'Bones remember what flesh forgets. You\'re learning.',
        lich:     'The final veil. You can hear the covenant now, can\'t you?',
    },
    senna: {
        slime:    'Your cells shift like nothing I\'ve studied. Fascinating.',
        skeleton: 'The skeletal form holds through will alone. Remarkable.',
        lich:     'You\'ve crossed the threshold. Don\'t look back.',
    },
};

// Pre-rebuild dialogue — shown when NPC's building is in ruins
const NPC_RUINED_DIALOGUE = {
    garrett: [
        'The forge... it\'s been cold for so long.',
        'If someone could restore it, I could work again. My hands remember how.',
        'It would take gold. But the result would be worth it.',
    ],
    senna: [
        'My instruments are shattered. I can\'t brew anything in these ruins.',
        'Restore my workshop and I\'ll make potions that keep you alive down there.',
        'Gold can rebuild what was lost.',
    ],
    aldric: [
        'This post used to mean something. Now it\'s just rubble and memory.',
        'Rebuild it and I\'ll share what I know about fighting. It might save your life.',
    ],
    hermit: [
        'The old magics need a proper space to resonate. This place is too broken.',
        'Restore this hut and I can open a path to the deeper places.',
    ],
    mira: [
        'We built that monument together, once. Before everything fell apart.',
        'You\'re bringing things back. I can feel it.',
    ],
};

function getFormReactiveDialogue(npc) {
    const form = (typeof FormSystem !== 'undefined' && FormSystem.currentForm) ? FormSystem.currentForm : 'wizard';

    // Pre-rebuild: show ruined dialogue if NPC's building isn't restored
    if (typeof NPC_BUILDING_MAP !== 'undefined' && typeof hamletRebuild !== 'undefined') {
        const bld = NPC_BUILDING_MAP[npc.id];
        // Mira's building is the monument
        const miraKey = npc.id === 'mira' ? 'monument' : bld;
        if (miraKey && (typeof isRebuilt === 'function' ? !isRebuilt(miraKey) : !hamletRebuild[miraKey]) && NPC_RUINED_DIALOGUE[npc.id]) {
            return [...NPC_RUINED_DIALOGUE[npc.id]];
        }
    }

    // Progressive lore — NPCs reveal new dialogue as player reaches deeper zones
    // Use deepest STORY zone reached for lore gating (not currentZone, which is 0 in the Hamlet)
    var _zoneReached = 0;
    if (typeof progressionIndex !== 'undefined' && typeof ZONE_PROGRESSION !== 'undefined') {
        // progressionIndex tracks how far through the story the player has gone
        var _pi = Math.min(progressionIndex, ZONE_PROGRESSION.length - 1);
        _zoneReached = _pi >= 0 && ZONE_PROGRESSION[_pi] ? ZONE_PROGRESSION[_pi].zone : 0;
    }
    // Also check currentZone in case the player is actively in a dungeon zone
    if (typeof currentZone !== 'undefined' && currentZone > _zoneReached && currentZone < 100) {
        _zoneReached = currentZone;
    }
    const _PROGRESSIVE_LORE = {
        garrett: [
            { minZone: 2, line: 'The talisman housing... I remember now. She brought the core herself. Said it had to be made by someone who understood fire.' },
            { minZone: 4, line: "The Infernal Ore... it's the same material as the talisman's core. She planned this. All of it." },
        ],
        mira: [
            { minZone: 2, line: "She used to sit right here. Told me stories about a place below where time doesn't pass. I thought she was making it up." },
            { minZone: 5, line: "She said the covenant was a gift. Not to her \u2014 to everyone else. So they could keep living without knowing what waits below." },
        ],
        hermit: [
            { minZone: 3, line: "The tome you found \u2014 it describes the covenant's origin. The first holder lasted three centuries before their mind fractured." },
            { minZone: 4, line: "When you reach her, she'll ask you to choose. Shatter the covenant and the corruption walks free \u2014 but so does she. Take her place and the world stays safe \u2014 but you sit there. Forever." },
            { minZone: 5, line: "Elara has held it for eleven years. The longest in recorded history. But even she is fading. You can feel it in the talisman \u2014 the pulses are weaker now." },
        ],
        senna: [
            { minZone: 3, line: "Evolution isn't random, you know. The talisman is reshaping you. Preparing you for what's below." },
            { minZone: 5, line: "The Frost Essence... it crystallizes around sources of immense will. She's been holding so hard the very air froze around her." },
        ],
        aldric: [
            { minZone: 3, line: "I remember now. I wasn't guarding against enemies coming IN. I was guarding against something coming OUT." },
        ],
    };
    const _npcLore = _PROGRESSIVE_LORE[npc.id];

    let lines = [...npc.dialogue];

    // Prepend the HIGHEST zone-gated lore line the player has unlocked (one at a time)
    if (_npcLore) {
        var _bestLore = null;
        for (var _li = 0; _li < _npcLore.length; _li++) {
            if (_zoneReached >= _npcLore[_li].minZone) _bestLore = _npcLore[_li];
        }
        if (_bestLore) lines.unshift(_bestLore.line);
    }

    // Inject quest dialogue for quest-giver NPCs
    const questLines = getQuestDialogueLines(npc.id);
    if (questLines) {
        lines = questLines;
    }

    // Only show form-reactive line for non-wizard forms (wizard is the "default" expected form)
    if (form === 'wizard' || !NPC_FORM_REACTIONS[npc.id]) return lines;
    const reaction = NPC_FORM_REACTIONS[npc.id][form];
    if (!reaction) return lines;
    // Prepend the reaction line to the normal dialogue
    return [reaction, ...lines];
}

// ----- Quest-Gated Dialogue -----
// Returns replacement dialogue lines when an NPC has quest content to deliver, or null for default.
function getQuestDialogueLines(npcId) {
    // Garrett — infernal ore quest
    if (npcId === 'garrett') {
        if (isQuestComplete('garrett_forge')) {
            return [
                'That ore you brought... finest I\'ve ever worked with.',
                'Your weapons will hit harder now. Permanently.',
                'If you find more rare materials, bring them my way.',
            ];
        }
        if (questState.flags.garrett_quest_started && typeof hasKeyItem === 'function' && hasKeyItem('infernal_ore')) {
            return [
                'You found it! Infernal Ore — still warm from the depths.',
                'Give me a moment... this will take focus. And heat. Lots of heat.',
                'There. Your strikes carry the weight of the forge now. Use it well.',
            ];
        }
        if (questState.flags.garrett_quest_started) {
            return [
                'Still no ore? The burning depths, I said. Zone 4.',
                'Infernal Ore — dark, pulsing, warm to the touch. You\'ll know it when you see it.',
                'Come back when you\'ve found it. My forge is hungry.',
            ];
        }
        // Not started yet — use normal dialogue with quest hook on line 3
        return null;
    }

    // Senna — frost essence quest
    if (npcId === 'senna') {
        if (isQuestComplete('senna_brew')) {
            return [
                'The Frost Essence changed everything. My formulas are singing.',
                'You\'re tougher now — permanently. That\'s what my brew does.',
                'Bring me more curiosities if you find them. Science never sleeps.',
            ];
        }
        if (questState.flags.senna_quest_started && typeof hasKeyItem === 'function' && hasKeyItem('frost_essence')) {
            return [
                'Is that... Frost Essence?! The crystalline lattice is perfect!',
                'One moment — distilling, separating, recombining... yes!',
                'Drink this. It\'ll fortify your constitution. Permanently. You\'re welcome.',
            ];
        }
        if (questState.flags.senna_quest_started) {
            return [
                'No essence yet? It forms in the frozen reaches. Zone 5.',
                'Frost Essence — pale blue, almost translucent. Beautiful stuff.',
                'My experiments are on hold until you bring it back.',
            ];
        }
        return null;
    }

    // Hermit — ancient tome quest
    if (npcId === 'hermit') {
        if (isQuestComplete('hermit_prophecy')) {
            return [
                'The tome\'s knowledge flows through me now. Ancient, terrible, wondrous.',
                'The tokens I gave you... use them wisely when fate offers you choices.',
                'The old magics remember those who serve them.',
            ];
        }
        if (questState.flags.hermit_quest_started && typeof hasKeyItem === 'function' && hasKeyItem('ancient_tome')) {
            return [
                'You found it... the Ancient Tome. I can feel its weight from here.',
                'This knowledge was lost for centuries. You\'ve done something remarkable.',
                'Take these tokens. When fate offers you a choice... you may ask for another.',
            ];
        }
        if (questState.flags.hermit_quest_started) {
            return [
                'The tome eludes you still? It rests in the Spire. Zone 3.',
                'An Ancient Tome, bound in something older than leather. You\'ll sense it.',
                'The old magics will guide your hand... if you let them.',
            ];
        }
        return null;
    }

    return null;
}

// ----- INTERACTION -----
// Returns true if interaction was consumed (NPC was found or dialogue advanced)
// Flag: set to true when Pale Queen dialogue finishes → triggers ending choice
let paleQueenDialogueComplete = false;

function handleNPCInteraction() {
    // Close service menus on E key press (prevents double-open)
    if (smithyMenuOpen) { closeSmithyMenu(); return true; }
    if (shopMenuOpen) { closeShopMenu(); return true; }
    if (npcDialogueOpen) {
        // Advance dialogue (use form-reactive dialogue which may have extra opening line)
        currentNPC.dialogueIndex++;
        currentNPC._typewriterTimer = 0; // reset typewriter for next line
        // Persist highest dialogue index reached
        _npcDialogueProgress[currentNPC.id] = Math.max(
            _npcDialogueProgress[currentNPC.id] || 0, currentNPC.dialogueIndex
        );
        // NPC relationship tracking — increment on each dialogue advance
        if (typeof playerProfile !== 'undefined' && playerProfile.npcRelationship && currentNPC.id) {
            if (!playerProfile.npcRelationship[currentNPC.id]) playerProfile.npcRelationship[currentNPC.id] = 0;
            playerProfile.npcRelationship[currentNPC.id]++;
            _checkNPCRelationshipBonus(currentNPC.id);
        }
        const activeDialogue = getFormReactiveDialogue(currentNPC);

        // --- Quest flag triggers on specific dialogue lines ---
        handleQuestDialogueTriggers(currentNPC);

        if (currentNPC.dialogueIndex >= activeDialogue.length) {
            // Check if this was the Pale Queen — trigger ending choice
            if (currentNPC.isPaleQueen) {
                paleQueenDialogueComplete = true;
            }
            // Check for quest completion on dialogue end
            handleQuestCompletionOnDialogueEnd(currentNPC);
            closeNPCDialogue();
        }
        return true;
    }

    // Check if player is near an NPC
    for (const npc of npcList) {
        const dist = Math.sqrt((npc.row - player.row) ** 2 + (npc.col - player.col) ** 2);
        if (dist < NPC_INTERACTION_RANGE) {
            openNPCDialogue(npc);
            return true;
        }
    }
    return false; // no NPC nearby — let other interactions handle it
}

function openNPCDialogue(npc) {
    // Check if this NPC should open a service menu instead of dialogue
    const formCfg = typeof FormSystem !== 'undefined' ? FormSystem.getFormConfig() : null;
    const hasEquip = formCfg && formCfg.hasEquipment;

    // Service NPCs (Garrett, Senna) show choice menu: Talk / Service / Leave
    if (npc.id === 'garrett' || npc.id === 'senna') {
        const _npcBld = NPC_BUILDING_MAP[npc.id];
        const _rebuilt = typeof isRebuilt === 'function' ? isRebuilt(_npcBld) : false;
        if (!_rebuilt) {
            // Building not rebuilt — just show dialogue (ruined state)
            currentNPC = npc;
            npc.dialogueIndex = 0;
            npc._typewriterTimer = 0;
            npcDialogueOpen = true;
            npcDialogueFadeIn = 0;
            sfxChestOpen();
            return;
        }
        // Show interaction choice menu
        npcChoiceState.active = true;
        npcChoiceState.npc = npc;
        npcChoiceState.hover = -1;
        npcChoiceState.fadeIn = 0;
        setPixelCursor('default');
        return;
    }

    currentNPC = npc;
    npc.dialogueIndex = 0;
    npc._typewriterTimer = 0;
    npcDialogueOpen = true;
    npcDialogueFadeIn = 0;
    sfxChestOpen();
}

// ── NPC Interaction Choice Menu (Talk / Service / Leave) ──
var npcChoiceState = { active: false, npc: null, hover: -1, fadeIn: 0 };

function drawNPCChoiceMenu() {
    if (!npcChoiceState.active || !npcChoiceState.npc) return;
    npcChoiceState.fadeIn = Math.min(1, npcChoiceState.fadeIn + 0.06);
    var fa = npcChoiceState.fadeIn;
    var npc = npcChoiceState.npc;

    ctx.save();

    // Dim overlay
    ctx.globalAlpha = fa * 0.4;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvasW, canvasH);

    // Menu box (centered on screen)
    var mw = 260, mh = 160;
    var mx = (canvasW - mw) / 2;
    var my = (canvasH - mh) / 2;

    ctx.globalAlpha = fa * 0.92;
    ctx.fillStyle = 'rgba(20,16,12,0.95)';
    ctx.beginPath(); ctx.roundRect(mx, my, mw, mh, 8); ctx.fill();
    ctx.strokeStyle = '#8a7a5a'; ctx.lineWidth = 1.5; ctx.globalAlpha = fa * 0.5;
    ctx.beginPath(); ctx.roundRect(mx, my, mw, mh, 8); ctx.stroke();

    // Portrait + name at top
    var _pKey = npc.portrait;
    var _pImg = _pKey && typeof images !== 'undefined' ? images[_pKey] : null;
    if (_pImg) {
        ctx.globalAlpha = fa * 0.9;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(_pImg, mx + 12, my + 12, 48, 48);
        ctx.imageSmoothingEnabled = true;
    }
    ctx.globalAlpha = fa * 0.8;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.font = 'bold 13px Georgia'; ctx.fillStyle = '#ffcc88';
    ctx.fillText(npc.name, mx + 68, my + 28);
    // Short greeting bark
    ctx.font = 'italic 10px Georgia'; ctx.fillStyle = '#a09070'; ctx.globalAlpha = fa * 0.6;
    var _bark = npc.id === 'garrett' ? 'The forge awaits.' : 'What do you need?';
    ctx.fillText(_bark, mx + 68, my + 44);

    // Choice buttons
    var btnW = mw - 30, btnH = 26, btnX = mx + 15, btnGap = 6;
    var btnY0 = my + 72;
    var _serviceLabel = npc.id === 'garrett' ? 'Open Forge' : 'Browse Potions';
    var _choices = [
        { label: 'Talk', key: 'E', color: '#ccbb88' },
        { label: _serviceLabel, key: 'F', color: '#ddaa44' },
        { label: 'Leave', key: 'ESC', color: '#887766' },
    ];

    // Store rects for click handling
    npcChoiceState._rects = [];
    for (var ci = 0; ci < _choices.length; ci++) {
        var by = btnY0 + ci * (btnH + btnGap);
        var hovered = mouse && mouse.x >= btnX && mouse.x <= btnX + btnW && mouse.y >= by && mouse.y <= by + btnH;
        if (hovered) npcChoiceState.hover = ci;
        npcChoiceState._rects.push({ x: btnX, y: by, w: btnW, h: btnH });

        ctx.globalAlpha = fa * (hovered ? 0.75 : 0.5);
        ctx.fillStyle = hovered ? 'rgba(60,50,35,0.9)' : 'rgba(30,25,18,0.8)';
        ctx.beginPath(); ctx.roundRect(btnX, by, btnW, btnH, 4); ctx.fill();
        ctx.strokeStyle = hovered ? _choices[ci].color : '#554433';
        ctx.lineWidth = 1; ctx.globalAlpha = fa * (hovered ? 0.7 : 0.3);
        ctx.beginPath(); ctx.roundRect(btnX, by, btnW, btnH, 4); ctx.stroke();

        ctx.globalAlpha = fa * 0.85;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = '11px Georgia'; ctx.fillStyle = _choices[ci].color;
        ctx.fillText('[' + _choices[ci].key + ']  ' + _choices[ci].label, btnX + btnW / 2, by + btnH / 2);
    }

    ctx.restore();
}

function handleNPCChoiceInput(key) {
    if (!npcChoiceState.active) return false;
    var npc = npcChoiceState.npc;
    if (key === 'e') {
        // Talk — open dialogue
        npcChoiceState.active = false;
        currentNPC = npc;
        npc.dialogueIndex = 0;
        npc._typewriterTimer = 0;
        npcDialogueOpen = true;
        npcDialogueFadeIn = 0;
        sfxChestOpen();
        setPixelCursor('none');
        return true;
    }
    if (key === 'f') {
        // Service
        npcChoiceState.active = false;
        if (npc.id === 'garrett') openSmithyMenu(npc);
        else if (npc.id === 'senna') openShopMenu(npc);
        return true;
    }
    if (key === 'escape') {
        npcChoiceState.active = false;
        setPixelCursor('none');
        return true;
    }
    return false;
}

function handleNPCChoiceClick(clickX, clickY) {
    if (!npcChoiceState.active || !npcChoiceState._rects) return false;
    for (var ci = 0; ci < npcChoiceState._rects.length; ci++) {
        var r = npcChoiceState._rects[ci];
        if (clickX >= r.x && clickX <= r.x + r.w && clickY >= r.y && clickY <= r.y + r.h) {
            if (ci === 0) return handleNPCChoiceInput('e');
            if (ci === 1) return handleNPCChoiceInput('f');
            if (ci === 2) return handleNPCChoiceInput('escape');
        }
    }
    return false;
}

function closeNPCDialogue() {
    npcDialogueOpen = false;
    currentNPC = null;
    npcDialogueFadeIn = 0;
}

function isNPCDialogueOpen() {
    return npcDialogueOpen || smithyMenuOpen || shopMenuOpen;
}

// ============================================================
//  GARRETT'S SMITHY — Equipment Enchantment Menu
// ============================================================
function openSmithyMenu(npc) {
    if (smithyMenuOpen || shopMenuOpen) return; // prevent double-open
    if (typeof hamletRebuild !== 'undefined' && typeof isRebuilt === 'function' && !isRebuilt('forge')) {
        pickupTexts.push({ text: 'The forge lies in ruins...', color: '#aa6644',
            row: npc.row, col: npc.col, offsetY: -20, life: 2.0 });
        return;
    }
    currentNPC = npc;
    smithyMenuOpen = true;
    smithyFadeIn = 0;
    smithyHover = -1;
    smithyResultText = '';
    smithyResultTimer = 0;
    sfxChestOpen();
}

function closeSmithyMenu() {
    smithyMenuOpen = false;
    currentNPC = null;
    smithyFadeIn = 0;
    smithyHover = -1;
}

function handleSmithyClick(clickX, clickY) {
    if (!smithyMenuOpen) return false;
    const pw = Math.min(520, canvasW - 60);
    const ph = 380;
    const px = (canvasW - pw) / 2;
    const py = (canvasH - ph) / 2;

    // Click outside panel closes it
    if (clickX < px || clickX > px + pw || clickY < py || clickY > py + ph) {
        closeSmithyMenu();
        return true;
    }

    // Check form-specific upgrade clicks (slime/skeleton)
    const _clickForm = typeof FormSystem !== 'undefined' ? FormSystem.currentForm : 'wizard';
    const _clickHasEquip = _clickForm === 'wizard' || _clickForm === 'lich';
    const _clickFormUpgrades = (!_clickHasEquip && typeof FORGE_UPGRADES !== 'undefined') ? FORGE_UPGRADES[_clickForm] : null;

    const rowH = 60;
    const startY = py + 80;

    if (_clickFormUpgrades) {
        for (let i = 0; i < _clickFormUpgrades.length; i++) {
            const ry = startY + i * (rowH + 8);
            if (clickY >= ry && clickY <= ry + rowH && clickX >= px + 16 && clickX <= px + pw - 16) {
                const result = typeof buyForgeUpgrade === 'function' ? buyForgeUpgrade(_clickFormUpgrades[i]) : { success: false, reason: 'System unavailable' };
                if (result.success) {
                    smithyResultText = _clickFormUpgrades[i].name + ' forged to +' + result.newLevel + '! (-' + result.cost + 'g)';
                    smithyResultTimer = 3.0;
                    if (typeof sfxItemPickup === 'function') sfxItemPickup();
                } else {
                    smithyResultText = result.reason;
                    smithyResultTimer = 2.5;
                }
                return true;
            }
        }
        return false;
    }

    // Check equipment enchant clicks (wizard/lich)
    for (let i = 0; i < EQUIP_SLOTS.length; i++) {
        const ry = startY + i * (rowH + 8);
        if (clickY >= ry && clickY <= ry + rowH && clickX >= px + 16 && clickX <= px + pw - 16) {
            const slot = EQUIP_SLOTS[i];
            const item = inventory.equipped[slot];
            if (item) {
                const result = enchantItem(item);
                if (result.success) {
                    smithyResultText = item.name + ' enchanted to +' + result.newLevel + '! (-' + result.cost + 'g)';
                    smithyResultTimer = 3.0;
                    if (typeof sfxItemPickup === 'function') sfxItemPickup();
                } else {
                    smithyResultText = result.reason;
                    smithyResultTimer = 2.5;
                }
            }
            return true;
        }
    }
    return true;
}

function drawSmithyMenu() {
    if (!smithyMenuOpen) return;
    smithyFadeIn = Math.min(1, smithyFadeIn + 0.06);
    if (smithyResultTimer > 0) smithyResultTimer -= 1 / 60;
    const fa = smithyFadeIn;

    ctx.save();

    // Dim overlay
    ctx.globalAlpha = fa * 0.6;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvasW, canvasH);

    // Panel dimensions
    const pw = Math.min(520, canvasW - 60);
    const ph = 380;
    const px = (canvasW - pw) / 2;
    const py = (canvasH - ph) / 2;

    // Panel background — dark forge style
    ctx.globalAlpha = fa * 0.95;
    const panelGrad = ctx.createLinearGradient(px, py, px, py + ph);
    panelGrad.addColorStop(0, '#1a1410');
    panelGrad.addColorStop(0.1, '#161008');
    panelGrad.addColorStop(0.9, '#100c06');
    panelGrad.addColorStop(1, '#0c0804');
    ctx.fillStyle = panelGrad;
    ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 8); ctx.fill();

    // Border
    ctx.globalAlpha = fa * 0.4;
    ctx.strokeStyle = '#c49040';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 8); ctx.stroke();

    // Inner border
    ctx.globalAlpha = fa * 0.12;
    ctx.strokeStyle = '#a88040';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(px + 4, py + 4, pw - 8, ph - 8, 6); ctx.stroke();

    // Title
    ctx.globalAlpha = fa * 0.9;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 18px Georgia';
    ctx.fillStyle = '#e8c060';
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 3;
    ctx.strokeText("Garrett's Forge", px + pw / 2, py + 28);
    ctx.fillText("Garrett's Forge", px + pw / 2, py + 28);

    // Check if current form uses equipment or form-specific upgrades
    const _smithForm = typeof FormSystem !== 'undefined' ? FormSystem.currentForm : 'wizard';
    const _smithHasEquip = _smithForm === 'wizard' || _smithForm === 'lich';
    const _smithFormUpgrades = (!_smithHasEquip && typeof FORGE_UPGRADES !== 'undefined') ? FORGE_UPGRADES[_smithForm] : null;

    // Subtitle
    ctx.globalAlpha = fa * 0.5;
    ctx.font = 'italic 11px Georgia';
    ctx.fillStyle = '#a89060';
    ctx.fillText(_smithHasEquip ? 'Select an item to enchant' : 'Forge permanent upgrades', px + pw / 2, py + 50);

    // Divider
    ctx.globalAlpha = fa * 0.2;
    ctx.strokeStyle = '#8a7040';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px + 30, py + 65);
    ctx.lineTo(px + pw - 30, py + 65);
    ctx.stroke();

    // Gold display
    ctx.globalAlpha = fa * 0.8;
    ctx.textAlign = 'right';
    ctx.font = 'bold 12px Georgia';
    ctx.fillStyle = '#e8c040';
    const goldVal = typeof playerGold !== 'undefined' ? playerGold : 0;
    ctx.fillText('Gold: ' + goldVal + 'g', px + pw - 20, py + 28);

    // Equipment rows OR form-specific upgrades
    const rowH = 60;
    const startY = py + 80;
    smithyHover = -1;

    // --- FORM-SPECIFIC UPGRADES (slime/skeleton) ---
    if (_smithFormUpgrades) {
        for (let i = 0; i < _smithFormUpgrades.length; i++) {
            const u = _smithFormUpgrades[i];
            const level = (typeof forgeUpgrades !== 'undefined') ? (forgeUpgrades[u.id] || 0) : 0;
            const ry = startY + i * (rowH + 8);
            const rx = px + 16;
            const rw = pw - 32;
            const hovered = mouse.x >= rx && mouse.x <= rx + rw && mouse.y >= ry && mouse.y <= ry + rowH;
            if (hovered) smithyHover = i;

            ctx.globalAlpha = fa * (hovered ? 0.35 : 0.18);
            ctx.fillStyle = hovered ? '#2a2010' : '#1a1408';
            ctx.beginPath(); ctx.roundRect(rx, ry, rw, rowH, 4); ctx.fill();
            ctx.globalAlpha = fa * (hovered ? 0.4 : 0.15);
            ctx.strokeStyle = hovered ? '#c49040' : '#6a5a30';
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.roundRect(rx, ry, rw, rowH, 4); ctx.stroke();

            // Upgrade name
            ctx.globalAlpha = fa * 0.9;
            ctx.textAlign = 'left';
            ctx.font = 'bold 13px Georgia';
            ctx.fillStyle = '#e8c060';
            ctx.fillText(u.name + (level > 0 ? ' +' + level : ''), rx + 14, ry + 20);
            // Description
            ctx.globalAlpha = fa * 0.55;
            ctx.font = '10px Georgia';
            ctx.fillStyle = '#b0a080';
            ctx.fillText(u.desc + ' per level (max ' + u.max + ')', rx + 14, ry + 36);
            // Level bar
            ctx.globalAlpha = fa * 0.3;
            const barW = 80, barH2 = 6, barX = rx + 14, barY = ry + 46;
            ctx.fillStyle = '#0a0804';
            ctx.beginPath(); ctx.roundRect(barX, barY, barW, barH2, 2); ctx.fill();
            if (level > 0) {
                ctx.globalAlpha = fa * 0.7;
                ctx.fillStyle = '#c49040';
                ctx.beginPath(); ctx.roundRect(barX, barY, barW * (level / u.max), barH2, 2); ctx.fill();
            }
            // Cost on right
            ctx.textAlign = 'right';
            if (level >= u.max) {
                ctx.globalAlpha = fa * 0.5;
                ctx.font = 'italic 11px Georgia';
                ctx.fillStyle = '#88aa88';
                ctx.fillText('MAXED', rx + rw - 14, ry + 22);
            } else {
                const cost = typeof getForgeUpgradeCost === 'function' ? getForgeUpgradeCost(u) : u.baseCost;
                const canAfford = goldVal >= cost;
                ctx.globalAlpha = fa * 0.7;
                ctx.font = 'bold 11px Georgia';
                ctx.fillStyle = canAfford ? '#ffd700' : '#884444';
                ctx.fillText(cost + 'g', rx + rw - 14, ry + 22);
                ctx.globalAlpha = fa * 0.4;
                ctx.font = '9px Georgia';
                ctx.fillStyle = canAfford ? '#aaa' : '#664444';
                ctx.fillText(canAfford ? 'Click to forge' : 'Need more gold', rx + rw - 14, ry + 38);
            }
        }
    }

    // --- EQUIPMENT ENCHANTMENT (wizard/lich) ---
    if (_smithHasEquip)
    for (let i = 0; i < EQUIP_SLOTS.length; i++) {
        const slot = EQUIP_SLOTS[i];
        const item = inventory.equipped[slot];
        const ry = startY + i * (rowH + 8);
        const rx = px + 16;
        const rw = pw - 32;

        // Hover detection
        const hovered = mouse.x >= rx && mouse.x <= rx + rw && mouse.y >= ry && mouse.y <= ry + rowH;
        if (hovered) smithyHover = i;

        // Row background
        ctx.globalAlpha = fa * (hovered ? 0.35 : 0.18);
        ctx.fillStyle = hovered ? '#2a2010' : '#1a1408';
        ctx.beginPath(); ctx.roundRect(rx, ry, rw, rowH, 4); ctx.fill();

        // Row border
        ctx.globalAlpha = fa * (hovered ? 0.4 : 0.15);
        ctx.strokeStyle = hovered ? '#c49040' : '#6a5a30';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.roundRect(rx, ry, rw, rowH, 4); ctx.stroke();

        if (!item) {
            // Empty slot
            ctx.globalAlpha = fa * 0.3;
            ctx.textAlign = 'left';
            ctx.font = '12px Georgia';
            ctx.fillStyle = '#6a5a40';
            ctx.fillText(SLOT_LABELS[slot] + ' — Empty', rx + 14, ry + rowH / 2 + 1);
            continue;
        }

        // Slot icon
        ctx.globalAlpha = fa * 0.4;
        ctx.textAlign = 'center';
        ctx.font = '18px Georgia';
        ctx.fillStyle = RARITY[item.rarity].color;
        ctx.fillText(SLOT_ICONS[slot], rx + 20, ry + rowH / 2 + 1);

        // Item name with rarity color
        ctx.globalAlpha = fa * 0.9;
        ctx.textAlign = 'left';
        ctx.font = 'bold 12px Georgia';
        ctx.fillStyle = RARITY[item.rarity].color;
        const enchLvl = item.enchantLevel || 0;
        const nameStr = item.name + (enchLvl > 0 ? ' +' + enchLvl : '');
        ctx.fillText(nameStr, rx + 40, ry + 18);

        // Stat summary
        ctx.globalAlpha = fa * 0.55;
        ctx.font = '10px Georgia';
        ctx.fillStyle = '#b0a080';
        const statParts = [];
        for (const [stat, val] of Object.entries(item.stats)) {
            const def = typeof STAT_DEFS !== 'undefined' ? STAT_DEFS[stat] : null;
            if (def) statParts.push(def.label + ' ' + def.fmt(val));
        }
        ctx.fillText(statParts.join('  |  '), rx + 40, ry + 34);

        // Enchant info on right side
        const maxEnch = getEnchantMax(item);
        const atMax = enchLvl >= maxEnch;
        ctx.textAlign = 'right';

        if (atMax) {
            ctx.globalAlpha = fa * 0.5;
            ctx.font = 'italic 11px Georgia';
            ctx.fillStyle = '#88aa88';
            ctx.fillText('MAX +' + enchLvl, rx + rw - 14, ry + 18);
        } else {
            const cost = getEnchantCost(item);
            const canAfford = goldVal >= cost;
            ctx.globalAlpha = fa * 0.7;
            ctx.font = '11px Georgia';
            ctx.fillStyle = canAfford ? '#e8c040' : '#884444';
            ctx.fillText(cost + 'g', rx + rw - 14, ry + 18);
            ctx.globalAlpha = fa * 0.45;
            ctx.font = '9px Georgia';
            ctx.fillStyle = '#a09070';
            ctx.fillText('+' + enchLvl + ' \u2192 +' + (enchLvl + 1), rx + rw - 14, ry + 34);
        }

        // Rarity tag
        ctx.globalAlpha = fa * 0.35;
        ctx.textAlign = 'left';
        ctx.font = '8px monospace';
        ctx.fillStyle = RARITY[item.rarity].color;
        ctx.fillText(RARITY[item.rarity].label.toUpperCase(), rx + 40, ry + rowH - 10);
    }

    // Result text feedback
    if (smithyResultTimer > 0 && smithyResultText) {
        const resultAlpha = Math.min(1, smithyResultTimer);
        ctx.globalAlpha = fa * resultAlpha * 0.9;
        ctx.textAlign = 'center';
        ctx.font = 'bold 12px Georgia';
        const isSuccess = smithyResultText.indexOf('enchanted') !== -1;
        ctx.fillStyle = isSuccess ? '#88cc88' : '#cc6644';
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 2;
        ctx.strokeText(smithyResultText, px + pw / 2, py + ph - 28);
        ctx.fillText(smithyResultText, px + pw / 2, py + ph - 28);
    }

    // Close hint
    ctx.globalAlpha = fa * 0.35;
    ctx.textAlign = 'center';
    ctx.font = '8px monospace';
    ctx.fillStyle = '#8a7a5a';
    ctx.fillText('[ESC/E] Close', px + pw / 2, py + ph - 10);

    ctx.restore();
}

// ============================================================
//  SENNA'S POTION SHOP
// ============================================================
function openShopMenu(npc) {
    if (shopMenuOpen || smithyMenuOpen) return; // prevent double-open
    if (typeof hamletRebuild !== 'undefined' && typeof isRebuilt === 'function' && !isRebuilt('shop')) {
        pickupTexts.push({ text: 'The alchemy lab is destroyed...', color: '#aa6644',
            row: npc.row, col: npc.col, offsetY: -20, life: 2.0 });
        return;
    }
    currentNPC = npc;
    shopMenuOpen = true;
    shopFadeIn = 0;
    shopHover = -1;
    shopResultText = '';
    shopResultTimer = 0;
    sfxChestOpen();
}

function closeShopMenu() {
    shopMenuOpen = false;
    currentNPC = null;
    shopFadeIn = 0;
    shopHover = -1;
}

function handleShopClick(clickX, clickY) {
    if (!shopMenuOpen) return false;
    const pw = Math.min(460, canvasW - 60);
    const ph = 320;
    const px = (canvasW - pw) / 2;
    const py = (canvasH - ph) / 2;

    // Click outside closes
    if (clickX < px || clickX > px + pw || clickY < py || clickY > py + ph) {
        closeShopMenu();
        return true;
    }

    // Check potion row clicks
    const potionIds = Object.keys(POTIONS);
    const rowH = 56;
    const startY = py + 80;
    for (let i = 0; i < potionIds.length; i++) {
        const ry = startY + i * (rowH + 8);
        if (clickY >= ry && clickY <= ry + rowH && clickX >= px + 16 && clickX <= px + pw - 16) {
            const result = buyPotion(potionIds[i]);
            if (result.success) {
                shopResultText = 'Bought ' + POTIONS[potionIds[i]].name + '!';
                shopResultTimer = 2.0;
                if (typeof sfxItemPickup === 'function') sfxItemPickup();
            } else {
                shopResultText = result.reason;
                shopResultTimer = 2.0;
            }
            return true;
        }
    }
    return true;
}

function drawShopMenu() {
    if (!shopMenuOpen) return;
    shopFadeIn = Math.min(1, shopFadeIn + 0.06);
    if (shopResultTimer > 0) shopResultTimer -= 1 / 60;
    const fa = shopFadeIn;

    ctx.save();

    // Dim overlay
    ctx.globalAlpha = fa * 0.6;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvasW, canvasH);

    // Panel
    const pw = Math.min(460, canvasW - 60);
    const ph = 320;
    const px = (canvasW - pw) / 2;
    const py = (canvasH - ph) / 2;

    // Panel background — alchemical green-tinted
    ctx.globalAlpha = fa * 0.95;
    const panelGrad = ctx.createLinearGradient(px, py, px, py + ph);
    panelGrad.addColorStop(0, '#141a10');
    panelGrad.addColorStop(0.1, '#101408');
    panelGrad.addColorStop(0.9, '#0c1006');
    panelGrad.addColorStop(1, '#080c04');
    ctx.fillStyle = panelGrad;
    ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 8); ctx.fill();

    // Border
    ctx.globalAlpha = fa * 0.4;
    ctx.strokeStyle = '#60a050';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 8); ctx.stroke();

    // Inner border
    ctx.globalAlpha = fa * 0.12;
    ctx.strokeStyle = '#508840';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(px + 4, py + 4, pw - 8, ph - 8, 6); ctx.stroke();

    // Title
    ctx.globalAlpha = fa * 0.9;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 18px Georgia';
    ctx.fillStyle = '#a0dd60';
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 3;
    ctx.strokeText("Senna's Alchemy", px + pw / 2, py + 28);
    ctx.fillText("Senna's Alchemy", px + pw / 2, py + 28);

    // Subtitle
    ctx.globalAlpha = fa * 0.5;
    ctx.font = 'italic 11px Georgia';
    ctx.fillStyle = '#80a060';
    ctx.fillText('Potions for the journey ahead', px + pw / 2, py + 50);

    // Divider
    ctx.globalAlpha = fa * 0.2;
    ctx.strokeStyle = '#506830';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px + 30, py + 65);
    ctx.lineTo(px + pw - 30, py + 65);
    ctx.stroke();

    // Gold display
    ctx.globalAlpha = fa * 0.8;
    ctx.textAlign = 'right';
    ctx.font = 'bold 12px Georgia';
    ctx.fillStyle = '#e8c040';
    const goldVal = typeof playerGold !== 'undefined' ? playerGold : 0;
    ctx.fillText('Gold: ' + goldVal + 'g', px + pw - 20, py + 28);

    // Potion rows
    const potionIds = Object.keys(POTIONS);
    const potionIcons = ['\u2665', '\u2726', '\u2666']; // heart, star, diamond
    const potionColors = ['#ee5544', '#4488ee', '#ddaa44'];
    const rowH = 56;
    const startY = py + 80;
    shopHover = -1;

    for (let i = 0; i < potionIds.length; i++) {
        const pid = potionIds[i];
        const pot = POTIONS[pid];
        const owned = playerPotions[pid] || 0;
        const ry = startY + i * (rowH + 8);
        const rx = px + 16;
        const rw = pw - 32;

        const hovered = mouse.x >= rx && mouse.x <= rx + rw && mouse.y >= ry && mouse.y <= ry + rowH;
        if (hovered) shopHover = i;

        // Row background
        ctx.globalAlpha = fa * (hovered ? 0.35 : 0.18);
        ctx.fillStyle = hovered ? '#1a2a10' : '#121a08';
        ctx.beginPath(); ctx.roundRect(rx, ry, rw, rowH, 4); ctx.fill();

        // Row border
        ctx.globalAlpha = fa * (hovered ? 0.4 : 0.15);
        ctx.strokeStyle = hovered ? '#60a050' : '#3a5a28';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.roundRect(rx, ry, rw, rowH, 4); ctx.stroke();

        // Potion icon
        ctx.globalAlpha = fa * 0.7;
        ctx.textAlign = 'center';
        ctx.font = '20px Georgia';
        ctx.fillStyle = potionColors[i];
        ctx.fillText(potionIcons[i], rx + 22, ry + rowH / 2 + 2);

        // Key binding badge
        ctx.globalAlpha = fa * 0.4;
        ctx.font = '8px monospace';
        ctx.fillStyle = '#a0a080';
        ctx.fillText('[' + (i + 1) + ']', rx + 22, ry + rowH - 6);

        // Potion name
        ctx.globalAlpha = fa * 0.9;
        ctx.textAlign = 'left';
        ctx.font = 'bold 12px Georgia';
        ctx.fillStyle = potionColors[i];
        ctx.fillText(pot.name, rx + 44, ry + 18);

        // Description
        ctx.globalAlpha = fa * 0.5;
        ctx.font = '10px Georgia';
        ctx.fillStyle = '#a0a080';
        ctx.fillText(pot.desc, rx + 44, ry + 34);

        // Owned count
        ctx.globalAlpha = fa * 0.6;
        ctx.font = '10px monospace';
        ctx.fillStyle = owned >= pot.max ? '#88aa88' : '#a09070';
        ctx.fillText(owned + '/' + pot.max, rx + 44, ry + rowH - 8);

        // Price on right
        ctx.textAlign = 'right';
        const atMax = owned >= pot.max;
        const canAfford = goldVal >= pot.cost;
        if (atMax) {
            ctx.globalAlpha = fa * 0.45;
            ctx.font = 'italic 11px Georgia';
            ctx.fillStyle = '#88aa88';
            ctx.fillText('FULL', rx + rw - 14, ry + rowH / 2 + 1);
        } else {
            ctx.globalAlpha = fa * 0.8;
            ctx.font = 'bold 12px Georgia';
            ctx.fillStyle = canAfford ? '#e8c040' : '#884444';
            ctx.fillText(pot.cost + 'g', rx + rw - 14, ry + rowH / 2 + 1);
        }
    }

    // Result text
    if (shopResultTimer > 0 && shopResultText) {
        const resultAlpha = Math.min(1, shopResultTimer);
        ctx.globalAlpha = fa * resultAlpha * 0.9;
        ctx.textAlign = 'center';
        ctx.font = 'bold 12px Georgia';
        const isSuccess = shopResultText.indexOf('Bought') !== -1;
        ctx.fillStyle = isSuccess ? '#88cc88' : '#cc6644';
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 2;
        ctx.strokeText(shopResultText, px + pw / 2, py + ph - 28);
        ctx.fillText(shopResultText, px + pw / 2, py + ph - 28);
    }

    // Close hint
    ctx.globalAlpha = fa * 0.35;
    ctx.textAlign = 'center';
    ctx.font = '8px monospace';
    ctx.fillStyle = '#6a7a5a';
    ctx.fillText('[ESC/E] Close', px + pw / 2, py + ph - 10);

    ctx.restore();
}

// ============================================================
//  QUEST CHAIN SYSTEM
// ============================================================

// ----- Quest dialogue triggers -----
// Called each time the player advances a dialogue line; sets flags based on NPC + line index.
function handleQuestDialogueTriggers(npc) {
    const activeDialogue = getFormReactiveDialogue(npc);
    const idx = npc.dialogueIndex; // the line we just advanced TO

    // Garrett: 3rd normal dialogue line (index 2) starts his quest.
    // Account for form-reactive prepend: if form line was added, quest hook is at index 3.
    if (npc.id === 'garrett' && !questState.flags.garrett_quest_started && !isQuestComplete('garrett_forge')) {
        // The quest hook is the 3rd line of his normal dialogue ("Come back when you've found something worth smithing.")
        // We replace it with the quest offer line in the NPC_REGISTRY dialogue array
        const lineText = activeDialogue[idx] || '';
        if (lineText.indexOf('Infernal Ore') !== -1) {
            setQuestFlag('garrett_quest_started');
            if (typeof Notify !== 'undefined') Notify.toast('New Quest: The Smith\'s Request', { duration: 3, color: '#e8c840' });
        }
    }

    // Senna: 2nd normal dialogue line ("The dungeons are rich with strange essences...")
    if (npc.id === 'senna' && !questState.flags.senna_quest_started && !isQuestComplete('senna_brew')) {
        const lineText = activeDialogue[idx] || '';
        if (lineText.indexOf('Frost Essence') !== -1) {
            setQuestFlag('senna_quest_started');
            if (typeof Notify !== 'undefined') Notify.toast('New Quest: Exotic Ingredients', { duration: 3, color: '#e8c840' });
        }
    }

    // Hermit: 2nd normal dialogue line ("Transformation waits for the worthy...")
    if (npc.id === 'hermit' && !questState.flags.hermit_quest_started && !isQuestComplete('hermit_prophecy')) {
        const lineText = activeDialogue[idx] || '';
        if (lineText.indexOf('Ancient Tome') !== -1) {
            setQuestFlag('hermit_quest_started');
            if (typeof Notify !== 'undefined') Notify.toast('New Quest: The Old Magics', { duration: 3, color: '#e8c840' });
        }
    }

    // Captain Aldric: last dialogue line starts bounty quest
    if (npc.id === 'aldric' && !questState.flags.captain_quest_started && !isQuestComplete('captain_bounty')
        && (typeof isRebuilt === 'function' ? isRebuilt('guardPost') : true)) {
        const lineText = activeDialogue[idx] || '';
        if (lineText.indexOf('going down there') !== -1 || idx >= activeDialogue.length - 1) {
            setQuestFlag('captain_quest_started');
            questState.flags.elite_bounty_kills = 0;
            if (typeof Notify !== 'undefined') Notify.toast("New Quest: Captain's Bounty", { duration: 3, color: '#e8c840' });
        }
    }
}

// Called when an NPC dialogue ends; checks if a quest turn-in should happen.
function handleQuestCompletionOnDialogueEnd(npc) {
    // Garrett: deliver infernal ore
    if (npc.id === 'garrett' && questState.flags.garrett_quest_started
        && !isQuestComplete('garrett_forge')
        && typeof hasKeyItem === 'function' && hasKeyItem('infernal_ore')) {
        setQuestFlag('has_infernal_ore');
        setQuestFlag('garrett_ore_delivered');
        removeKeyItem('infernal_ore');
        completeQuest('garrett_forge');
    }

    // Senna: deliver frost essence
    if (npc.id === 'senna' && questState.flags.senna_quest_started
        && !isQuestComplete('senna_brew')
        && typeof hasKeyItem === 'function' && hasKeyItem('frost_essence')) {
        setQuestFlag('has_frost_essence');
        setQuestFlag('senna_essence_delivered');
        removeKeyItem('frost_essence');
        completeQuest('senna_brew');
    }

    // Hermit: deliver ancient tome
    if (npc.id === 'hermit' && questState.flags.hermit_quest_started
        && !isQuestComplete('hermit_prophecy')
        && typeof hasKeyItem === 'function' && hasKeyItem('ancient_tome')) {
        setQuestFlag('has_ancient_tome');
        setQuestFlag('hermit_tome_delivered');
        removeKeyItem('ancient_tome');
        completeQuest('hermit_prophecy');
    }

    // Captain: report bounty completion
    if (npc.id === 'aldric' && questState.flags.captain_quest_started
        && !isQuestComplete('captain_bounty')
        && questState.flags.captain_bounty_kills_done) {
        setQuestFlag('captain_bounty_delivered');
        completeQuest('captain_bounty');
    }

    // Senna: choice quest — set pending choice instead of auto-completing
    if (npc.id === 'senna' && questState.flags.senna_quest_started
        && !isQuestComplete('senna_brew')
        && typeof hasKeyItem === 'function' && hasKeyItem('frost_essence')
        && !questState.flags.senna_choice_pending) {
        questState.flags.senna_choice_pending = true;
    }
}

// ============================================================
//  NPC RELATIONSHIP BONUSES
// ============================================================
const NPC_RELATIONSHIP_THRESHOLDS = {
    garrett: { threshold: 10, bonusId: 'garrett_bond', desc: '+2 permanent damage', apply: function() {
        if (typeof questState !== 'undefined') questState.permBonuses.dmgBonus = (questState.permBonuses.dmgBonus || 0) + 2;
    }},
    senna: { threshold: 10, bonusId: 'senna_bond', desc: '+1 max health potion slot', apply: function() {
        // Increase potion max — tracked as a flag
        if (typeof playerProfile !== 'undefined') playerProfile.npcBonusesClaimed.senna_potion_slot = true;
    }},
    aldric: { threshold: 10, bonusId: 'aldric_bond', desc: '+5 permanent max HP', apply: function() {
        if (typeof questState !== 'undefined') questState.permBonuses.maxHpBonus = (questState.permBonuses.maxHpBonus || 0) + 5;
    }},
    hermit: { threshold: 10, bonusId: 'hermit_bond', desc: '+1 reroll token', apply: function() {
        if (typeof questState !== 'undefined') questState.rerollTokens++;
    }},
};

function _checkNPCRelationshipBonus(npcId) {
    if (typeof playerProfile === 'undefined') return;
    const def = NPC_RELATIONSHIP_THRESHOLDS[npcId];
    if (!def) return;
    const count = playerProfile.npcRelationship[npcId] || 0;
    // Bonus at threshold — only once
    if (count >= def.threshold && !playerProfile.npcBonusesClaimed[def.bonusId]) {
        playerProfile.npcBonusesClaimed[def.bonusId] = true;
        def.apply();
        if (typeof Notify !== 'undefined') {
            Notify.toast('BOND: ' + (npcId.charAt(0).toUpperCase() + npcId.slice(1)) + ' trusts you. ' + def.desc, { duration: 5, color: '#ffd700', borderColor: '#aa8800' });
        }
        if (typeof addScreenShake === 'function') addScreenShake(3, 0.2);
        if (typeof spawnParticleBurst === 'function') spawnParticleBurst(player.row, player.col, 15, '#ffd700');
    }
    // Backstory hint at 5 interactions
    if (count === 5 && typeof Notify !== 'undefined') {
        const backstories = {
            garrett: 'Garrett pauses. "I had an apprentice once. Before the Pale came."',
            senna: 'Senna looks distant. "I studied under a master alchemist. She didn\'t survive."',
            aldric: 'Aldric\'s voice drops. "I remember what I was guarding now."',
            hermit: 'The Hermit smiles sadly. "I wasn\'t always a hermit, you know."',
        };
        if (backstories[npcId]) {
            Notify.toast(backstories[npcId], { duration: 6, color: '#ccaa88', borderColor: '#887744' });
        }
    }
}

const QUEST_REGISTRY = [
    {
        id: 'garrett_forge',
        name: 'The Dying Flame',
        giver: 'garrett',
        steps: [
            { text: 'Speak to Garrett about his work', condition: 'garrett_quest_started' },
            { text: 'Find Infernal Ore quickly — it degrades!', condition: 'has_infernal_ore' },
            { text: 'Return the ore to Garrett', condition: 'garrett_ore_delivered' },
        ],
        reward: { type: 'stat_tiered', stat: 'dmgBonus', desc: 'Permanent Damage',
            tiers: { 3: { value: 7, desc: '+7 Permanent Damage (white-hot ore!)' },
                     2: { value: 5, desc: '+5 Permanent Damage (warm ore)' },
                     1: { value: 3, desc: '+3 Permanent Damage (cooled ore)' } } },
    },
    {
        id: 'senna_brew',
        name: 'The Frozen Heart',
        giver: 'senna',
        steps: [
            { text: 'Speak to Senna about her experiments', condition: 'senna_quest_started' },
            { text: 'Collect Frost Essence from Zone 5', condition: 'has_frost_essence' },
            { text: 'Choose what to do with the essence', condition: 'senna_essence_delivered' },
        ],
        reward: { type: 'choice', choices: {
            a: { stat: 'maxHpBonus', value: 15, desc: '+15 Permanent Max HP', label: 'Keep It Whole' },
            b: { potionCapacity: 2, value: 0, desc: '+2 Max Health Potion Capacity', label: 'Shatter It' },
        }},
    },
    {
        id: 'hermit_prophecy',
        name: 'The Old Magics',
        giver: 'hermit',
        steps: [
            { text: 'Listen to the Hermit\'s prophecy', condition: 'hermit_quest_started' },
            { text: 'Find the Ancient Tome in Zone 3', condition: 'has_ancient_tome' },
            { text: 'Return with the tome', condition: 'hermit_tome_delivered' },
        ],
        reward: { type: 'upgrade_reroll', value: 3, desc: '+3 Upgrade Reroll Tokens' },
    },
    {
        id: 'captain_bounty',
        name: "Captain's Bounty",
        giver: 'aldric',
        steps: [
            { text: 'Speak to the Captain about threats', condition: 'captain_quest_started' },
            { text: 'Slay 5 elite enemies (any zone)', condition: 'captain_bounty_kills_done' },
            { text: 'Report back to the Captain', condition: 'captain_bounty_delivered' },
        ],
        reward: { type: 'gold_and_stat', stat: 'dmgBonus', value: 3, gold: 100, desc: '+3 Permanent Damage + 100 Gold' },
    },
];

const questState = {
    flags: {},        // condition flags: { garrett_quest_started: true, ... }
    completed: [],    // completed quest IDs
    rerollTokens: 0,  // from hermit reward
    permBonuses: { dmgBonus: 0, maxHpBonus: 0 }, // from quest rewards
};

// ----- Quest helpers -----
function isQuestComplete(questId) {
    return questState.completed.indexOf(questId) !== -1;
}

function getQuestCurrentStep(questId) {
    const quest = QUEST_REGISTRY.find(q => q.id === questId);
    if (!quest || isQuestComplete(questId)) return -1;
    for (let i = 0; i < quest.steps.length; i++) {
        if (!questState.flags[quest.steps[i].condition]) return i;
    }
    return -1; // all steps done but not yet completed (shouldn't happen)
}

function setQuestFlag(flag) {
    questState.flags[flag] = true;
}

function completeQuest(questId) {
    if (isQuestComplete(questId)) return;
    const quest = QUEST_REGISTRY.find(q => q.id === questId);
    if (!quest) return;
    questState.completed.push(questId);

    // Apply reward
    const r = quest.reward;
    if (r.type === 'stat') {
        questState.permBonuses[r.stat] = (questState.permBonuses[r.stat] || 0) + r.value;
        if (typeof Notify !== 'undefined') {
            Notify.toast('Quest Complete: ' + quest.name, { duration: 4, color: '#e8c840' });
            Notify.toast('Reward: ' + r.desc, { duration: 4, color: '#88cc88' });
        }
    } else if (r.type === 'stat_tiered') {
        // Tiered reward — quality stored in quest flags
        const quality = questState.flags.ore_quality || 1;
        const tier = r.tiers[quality] || r.tiers[1];
        questState.permBonuses[r.stat] = (questState.permBonuses[r.stat] || 0) + tier.value;
        if (typeof Notify !== 'undefined') {
            Notify.toast('Quest Complete: ' + quest.name, { duration: 4, color: '#e8c840' });
            Notify.toast('Reward: ' + tier.desc, { duration: 4, color: '#88cc88' });
        }
    } else if (r.type === 'upgrade_reroll') {
        questState.rerollTokens += r.value;
        if (typeof Notify !== 'undefined') {
            Notify.toast('Quest Complete: ' + quest.name, { duration: 4, color: '#e8c840' });
            Notify.toast('Reward: ' + r.desc, { duration: 4, color: '#88cc88' });
        }
    } else if (r.type === 'gold_and_stat') {
        questState.permBonuses[r.stat] = (questState.permBonuses[r.stat] || 0) + r.value;
        if (typeof playerGold !== 'undefined') playerGold += (r.gold || 0);
        if (typeof Notify !== 'undefined') {
            Notify.toast('Quest Complete: ' + quest.name, { duration: 4, color: '#e8c840' });
            Notify.toast('Reward: ' + r.desc, { duration: 4, color: '#88cc88' });
        }
    } else if (r.type === 'choice') {
        // Choice quests complete with the chosen branch reward
        const choiceId = questState.flags[quest.id + '_choice'] || 'a';
        const chosen = r.choices[choiceId] || r.choices.a;
        if (chosen.stat) questState.permBonuses[chosen.stat] = (questState.permBonuses[chosen.stat] || 0) + chosen.value;
        if (chosen.potionCapacity && typeof playerPotions !== 'undefined') {
            // Increase potion max capacity
            questState.flags.extra_potion_capacity = (questState.flags.extra_potion_capacity || 0) + chosen.potionCapacity;
        }
        if (typeof Notify !== 'undefined') {
            Notify.toast('Quest Complete: ' + quest.name, { duration: 4, color: '#e8c840' });
            Notify.toast('Reward: ' + chosen.desc, { duration: 4, color: '#88cc88' });
        }
    } else {
        if (typeof Notify !== 'undefined') {
            Notify.toast('Quest Complete: ' + quest.name, { duration: 4, color: '#e8c840' });
        }
    }
}

function removeKeyItem(id) {
    const idx = keyItems.findIndex(k => k.id === id);
    if (idx !== -1) keyItems.splice(idx, 1);
}
