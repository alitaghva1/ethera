// ============================================================
//  NPC SYSTEM — Non-Player Characters for the Hub Town
// ============================================================

// ----- GLOBALS -----
let npcList = [];
let currentNPC = null;        // the NPC player is interacting with
let npcDialogueOpen = false;  // whether dialogue box is shown
let npcDialogueFadeIn = 0;    // fade-in timer
let npcDialogueIndex = 0;     // which dialogue line to show

const NPC_INTERACTION_RANGE = 2.2; // tiles
const NPC_DEPTH_MULTIPLIER = 100;  // fixed constant for depth sort scoring

// ----- NPC DEFINITIONS (by zone) -----
// Each NPC has: id, name, row, col, zone, spriteKey, frameCount, frameW, frameH, dialogue[], scale, tint
const NPC_REGISTRY = {
    0: [ // Zone 0 — The Hamlet
        {
            id: 'garrett',
            name: 'Garrett the Smith',
            row: 14, col: 23,
            zone: 0,
            spriteKey: 'enemy_skel_idle',
            frameCount: 6,
            frameW: 100, frameH: 100,
            scale: 1.3,
            tint: { r: 100, g: 180, b: 255, a: 0.3 }, // blue tint
            dialogue: [
                'The forge hasn\'t seen proper work in ages.',
                'If you\'re heading into the Undercroft, you\'ll need better gear.',
                'Come back when you\'ve found something worth smithing.',
                'A woman came through here once. Asked me to forge something strange — a talisman housing.',
            ],
            dialogueIndex: 0,
        },
        {
            id: 'mira',
            name: 'Old Mira',
            row: 22, col: 25,
            zone: 0,
            spriteKey: 'enemy_skel_idle',
            frameCount: 6,
            frameW: 100, frameH: 100,
            scale: 1.3,
            tint: { r: 150, g: 220, b: 100, a: 0.3 }, // green tint
            dialogue: [
                'They say the tower was built long ago... before the corruption.',
                'People don\'t go down there anymore. The ones who did... never came back.',
                'You look different somehow. Like you\'re not quite of this world.',
                'There was a woman here once. Elara, I think. She went north and never returned.',
            ],
            dialogueIndex: 0,
        },
        {
            id: 'aldric',
            name: 'Captain Aldric',
            row: 13, col: 6,
            zone: 0,
            spriteKey: 'enemy_armoredskel_idle',
            frameCount: 6,
            frameW: 100, frameH: 100,
            scale: 1.4,
            tint: { r: 180, g: 180, b: 200, a: 0.25 }, // steel-blue tint
            dialogue: [
                'The northern border grows darker each day.',
                'We\'ve lost contact with the outposts. Something stirs in the deep places.',
                'If you\'re brave enough to venture into the Undercroft, we need intelligence.',
                'A scholar went north alone — said she\'d found the source of the corruption. We never heard back.',
            ],
            dialogueIndex: 0,
        },
        {
            id: 'hermit',
            name: 'The Hermit',
            row: 7, col: 15,
            zone: 0,
            spriteKey: 'enemy_skelarch_idle',
            frameCount: 6,
            frameW: 100, frameH: 100,
            scale: 1.3,
            tint: { r: 200, g: 100, b: 220, a: 0.3 }, // purple tint
            dialogue: [
                'The old magics... they whisper to those who listen.',
                'Transformation waits for the worthy. But the path is dark.',
                'Do you feel it? The pull of something greater?',
                'The talisman you carry... it belonged to someone who walked this path before you. Someone who didn\'t come back.',
            ],
            dialogueIndex: 0,
        },
        {
            id: 'senna',
            name: 'Senna the Alchemist',
            row: 23, col: 6,
            zone: 0,
            spriteKey: 'enemy_slime_idle',
            frameCount: 6,
            frameW: 100, frameH: 100,
            scale: 1.4,
            tint: { r: 255, g: 220, b: 100, a: 0.25 }, // yellow tint
            dialogue: [
                'My experiments require... exotic ingredients.',
                'The dungeons are rich with strange essences. If you find any...',
                'Evolution isn\'t a curse, you know. It\'s becoming whole.',
                'A covenant made with the deep... it changes you. But it doesn\'t destroy you. Not if someone holds the line.',
            ],
            dialogueIndex: 0,
        },
    ],
    4: [ // Zone 4 — The Inferno
        {
            id: 'ghost_pilgrim',
            name: 'Fading Pilgrim',
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
            row: 26, col: 16,
            zone: 6,
            spriteKey: 'enemy_skel_idle',
            frameCount: 6,
            frameW: 100, frameH: 100,
            scale: 1.5,
            tint: { r: 220, g: 180, b: 255, a: 0.4 },
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
    // Reset dialogue indices when loading zone
    for (const npc of npcList) {
        npc.dialogueIndex = 0;
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
    const baseAlpha = isGhost ? 0.35 + Math.sin(performance.now() / 1200) * 0.1 : 1.0;

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

    // Colored glow ring at NPC's feet to distinguish from enemies
    if (npc.tint) {
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = (0.15 + Math.sin(performance.now() / 600 + npc.row) * 0.05) * baseAlpha;
        const tGrad = ctx.createRadialGradient(sx, sy + 2 + ghostBob, 0, sx, sy + 2 + ghostBob, isGhost ? 25 : 20);
        tGrad.addColorStop(0, `rgba(${npc.tint.r}, ${npc.tint.g}, ${npc.tint.b}, 0.5)`);
        tGrad.addColorStop(1, `rgba(${npc.tint.r}, ${npc.tint.g}, ${npc.tint.b}, 0)`);
        ctx.fillStyle = tGrad;
        ctx.beginPath();
        ctx.ellipse(sx, sy + 2 + ghostBob, isGhost ? 25 : 20, isGhost ? 10 : 9, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    // Draw sprite
    ctx.save();
    ctx.globalAlpha = baseAlpha;
    ctx.drawImage(sheet,
        frame * npc.frameW, 0, npc.frameW, npc.frameH,
        sx - dw / 2, drawY + ghostBob, dw, dh);
    ctx.restore();

    // Name tag above NPC
    ctx.save();
    ctx.globalAlpha = (isPaleQueen ? 0.8 : 0.6) * baseAlpha;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.font = isPaleQueen ? 'bold 11px Georgia' : 'bold 10px monospace';
    ctx.fillStyle = isPaleQueen ? '#cc99ff' : (isGhost ? '#aabbdd' : '#d4c4a0');
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 2.5;
    ctx.strokeText(npc.name, sx, drawY + ghostBob - 8);
    ctx.fillText(npc.name, sx, drawY + ghostBob - 8);
    ctx.restore();

    // Interaction prompt (E key badge) when player is close
    const dist = Math.sqrt((npc.row - player.row) ** 2 + (npc.col - player.col) ** 2);
    if (dist < NPC_INTERACTION_RANGE && !npcDialogueOpen) {
        ctx.save();
        const pulse = 0.6 + Math.sin(performance.now() / 500) * 0.2;
        const promptY = drawY + ghostBob - 24;
        const accentColor = isPaleQueen ? '#9966cc' : '#aa9060';
        const textColor = isPaleQueen ? '#cc99ff' : '#e8d4a0';
        const labelColor = isPaleQueen ? '#aa88cc' : '#c4a878';

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

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

    // Parchment background — tinted for Pale Queen
    const _isPQ = currentNPC.isPaleQueen;
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

    // Border
    ctx.globalAlpha = fa * 0.3;
    ctx.strokeStyle = _isPQ ? '#7a5aaa' : '#8a7a5a';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 6); ctx.stroke();

    // NPC name (left side)
    ctx.globalAlpha = fa * 0.7;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = _isPQ ? 'bold 13px Georgia' : 'bold 12px Georgia';
    ctx.fillStyle = _isPQ ? '#cc99ff' : '#ffcc88';
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 2;
    ctx.strokeText(currentNPC.name, bx + 20, by + 12);
    ctx.fillText(currentNPC.name, bx + 20, by + 12);

    // Divider line
    ctx.globalAlpha = fa * 0.2;
    ctx.strokeStyle = '#8a7a5a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(bx + 20, by + 32);
    ctx.lineTo(bx + bw - 20, by + 32);
    ctx.stroke();

    // Dialogue text (form-reactive: may have extra opening line for non-wizard forms)
    const activeDialogue = getFormReactiveDialogue(currentNPC);
    const dialogueLine = activeDialogue[currentNPC.dialogueIndex % activeDialogue.length];
    ctx.globalAlpha = fa * 0.8;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = '11px Georgia';
    ctx.fillStyle = '#c4a878';
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1.5;

    // Word wrap dialogue (using calculated bw)
    const maxW = bw - 60;
    const words = dialogueLine.split(' ');
    let curLine = '';
    let lineY = by + 44;
    const lineHeight = 16;
    const maxLines = 3;
    let lineCount = 0;

    for (const word of words) {
        const test = curLine + (curLine ? ' ' : '') + word;
        if (ctx.measureText(test).width > maxW) {
            if (lineCount < maxLines) {
                ctx.strokeText(curLine, bx + 30, lineY);
                ctx.fillText(curLine, bx + 30, lineY);
                lineY += lineHeight;
                lineCount++;
            }
            curLine = word;
        } else {
            curLine = test;
        }
    }
    if (curLine && lineCount < maxLines) {
        ctx.strokeText(curLine, bx + 30, lineY);
        ctx.fillText(curLine, bx + 30, lineY);
    }

    // "Press E to continue" hint
    ctx.globalAlpha = fa * 0.4;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.font = '8px monospace';
    ctx.fillStyle = '#8a7a5a';
    ctx.strokeText('[E] to continue', bx + bw - 20, by + bh - 8);
    ctx.fillText('[E] to continue', bx + bw - 20, by + bh - 8);

    ctx.restore();
}

// ----- FORM-REACTIVE DIALOGUE -----
// NPCs react to the player's current evolution form with a unique opening line.
// These override the first dialogue line when the player is NOT in wizard form.
const NPC_FORM_REACTIONS = {
    garrett: {
        slime:    'What in the— is that a slime? How are you... never mind. I\'ve seen stranger.',
        skeleton: 'Bones walk these streets now? At least you\'re not hostile... I think.',
        lich:     'By the forge... the air around you reeks of death magic. What have you become?',
    },
    mira: {
        slime:    'Oh my... you\'re one of those creatures. But your eyes — there\'s something human in there.',
        skeleton: 'A walking skeleton in my town. The world truly has gone mad.',
        lich:     'I can feel the cold coming off you. You\'re not the same person who left here, are you?',
    },
    aldric: {
        slime:    'Stand down, men! This... creature means no harm. I think.',
        skeleton: 'A skeleton that doesn\'t attack on sight. You must be the one they told me about.',
        lich:     'The corruption has changed you. But your eyes still hold purpose. That\'s enough for me.',
    },
    hermit: {
        slime:    'Ah... the first form. The formless beginning. You have far to go, little one.',
        skeleton: 'Bones remember what flesh forgets. You\'re closer now. Can you feel it?',
        lich:     'You\'ve walked the full path. The talisman sings in your hands. Be careful — power like this has a price.',
    },
    senna: {
        slime:    'Fascinating! A sentient slime. Your cellular structure must be extraordinary.',
        skeleton: 'Remarkable — the bones hold together through sheer will. Evolution in action.',
        lich:     'The final form... or is it? The covenant changes everything, you know.',
    },
};

function getFormReactiveDialogue(npc) {
    const form = (typeof FormSystem !== 'undefined' && FormSystem.currentForm) ? FormSystem.currentForm : 'wizard';
    // Only show form-reactive line for non-wizard forms (wizard is the "default" expected form)
    if (form === 'wizard' || !NPC_FORM_REACTIONS[npc.id]) return npc.dialogue;
    const reaction = NPC_FORM_REACTIONS[npc.id][form];
    if (!reaction) return npc.dialogue;
    // Prepend the reaction line to the normal dialogue
    return [reaction, ...npc.dialogue];
}

// ----- INTERACTION -----
// Returns true if interaction was consumed (NPC was found or dialogue advanced)
// Flag: set to true when Pale Queen dialogue finishes → triggers ending choice
let paleQueenDialogueComplete = false;

function handleNPCInteraction() {
    if (npcDialogueOpen) {
        // Advance dialogue (use form-reactive dialogue which may have extra opening line)
        currentNPC.dialogueIndex++;
        const activeDialogue = getFormReactiveDialogue(currentNPC);
        if (currentNPC.dialogueIndex >= activeDialogue.length) {
            // Check if this was the Pale Queen — trigger ending choice
            if (currentNPC.isPaleQueen) {
                paleQueenDialogueComplete = true;
            }
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
    currentNPC = npc;
    npc.dialogueIndex = 0;
    npcDialogueOpen = true;
    npcDialogueFadeIn = 0;
    sfxChestOpen(); // use existing sound effect
}

function closeNPCDialogue() {
    npcDialogueOpen = false;
    currentNPC = null;
    npcDialogueFadeIn = 0;
}

function isNPCDialogueOpen() {
    return npcDialogueOpen;
}
