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
            row: 15, col: 6,
            zone: 0,
            spriteKey: 'enemy_armoredskel_idle',
            frameCount: 6,
            frameW: 100, frameH: 100,
            scale: 1.6,
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
            row: 10, col: 14,
            zone: 0,
            spriteKey: 'enemy_skel_idle',
            frameCount: 6,
            frameW: 100, frameH: 100,
            scale: 1.5,
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
            row: 6, col: 6,
            zone: 0,
            spriteKey: 'enemy_armoredskel_idle',
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
            row: 6, col: 24,
            zone: 0,
            spriteKey: 'enemy_palequeen_idle',
            frameCount: 8,
            frameW: 100, frameH: 100,
            scale: 1.5,
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
            row: 15, col: 24,
            zone: 0,
            spriteKey: 'enemy_skel_idle',
            frameCount: 6,
            frameW: 100, frameH: 100,
            scale: 1.5,
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

function getFormReactiveDialogue(npc) {
    const form = (typeof FormSystem !== 'undefined' && FormSystem.currentForm) ? FormSystem.currentForm : 'wizard';
    let lines = [...npc.dialogue];

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
    if (npcDialogueOpen) {
        // Advance dialogue (use form-reactive dialogue which may have extra opening line)
        currentNPC.dialogueIndex++;
        // Persist highest dialogue index reached
        _npcDialogueProgress[currentNPC.id] = Math.max(
            _npcDialogueProgress[currentNPC.id] || 0, currentNPC.dialogueIndex
        );
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

    // Garrett opens forge for ALL forms (equipment enchantment for wizard/lich, form upgrades for slime/skeleton)
    if (npc.id === 'garrett') {
        openSmithyMenu(npc);
        return;
    }
    // Senna opens potion shop (all forms can buy potions)
    if (npc.id === 'senna') {
        openShopMenu(npc);
        return;
    }

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
    return npcDialogueOpen || smithyMenuOpen || shopMenuOpen;
}

// ============================================================
//  GARRETT'S SMITHY — Equipment Enchantment Menu
// ============================================================
function openSmithyMenu(npc) {
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
}

const QUEST_REGISTRY = [
    {
        id: 'garrett_forge',
        name: "The Smith's Request",
        giver: 'garrett',
        steps: [
            { text: 'Speak to Garrett about his work', condition: 'garrett_quest_started' },
            { text: 'Find Infernal Ore in Zone 4', condition: 'has_infernal_ore' },
            { text: 'Return the ore to Garrett', condition: 'garrett_ore_delivered' },
        ],
        reward: { type: 'stat', stat: 'dmgBonus', value: 5, desc: '+5 Permanent Damage' },
    },
    {
        id: 'senna_brew',
        name: 'Exotic Ingredients',
        giver: 'senna',
        steps: [
            { text: 'Speak to Senna about her experiments', condition: 'senna_quest_started' },
            { text: 'Collect Frost Essence from Zone 5', condition: 'has_frost_essence' },
            { text: 'Bring the essence to Senna', condition: 'senna_essence_delivered' },
        ],
        reward: { type: 'stat', stat: 'maxHpBonus', value: 15, desc: '+15 Permanent Max HP' },
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
    } else if (r.type === 'upgrade_reroll') {
        questState.rerollTokens += r.value;
    }

    if (typeof Notify !== 'undefined') {
        Notify.toast('Quest Complete: ' + quest.name, { duration: 4, color: '#e8c840' });
        Notify.toast('Reward: ' + r.desc, { duration: 4, color: '#88cc88' });
    }
}

function removeKeyItem(id) {
    const idx = keyItems.findIndex(k => k.id === id);
    if (idx !== -1) keyItems.splice(idx, 1);
}
