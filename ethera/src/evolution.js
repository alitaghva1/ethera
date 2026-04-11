// ============================================================
//  EVOLUTION SYSTEM
// ============================================================

// --- Evolution Surge: temporary power boost after each evolution ---
// Makes each new form feel immediately stronger than the old one.
const evolutionSurge = {
    active: false,
    timer: 0,
    duration: 30,       // full surge lasts 30 seconds
    fadeDuration: 10,   // fades over the last 10 seconds
    dmgMult: 1.25,      // +25% damage during surge
    speedMult: 1.15,    // +15% move speed during surge
};

// Returns current surge multipliers (1.0 when inactive)
function getEvolutionSurgeBonus() {
    if (!evolutionSurge.active) return { dmgMult: 1, speedMult: 1 };
    const remaining = evolutionSurge.duration - evolutionSurge.timer;
    // Fade during last 10 seconds
    let intensity = 1;
    if (remaining < evolutionSurge.fadeDuration) {
        intensity = remaining / evolutionSurge.fadeDuration;
    }
    return {
        dmgMult: 1 + (evolutionSurge.dmgMult - 1) * intensity,
        speedMult: 1 + (evolutionSurge.speedMult - 1) * intensity,
    };
}

function updateEvolutionSurge(dt) {
    if (!evolutionSurge.active) return;
    evolutionSurge.timer += dt;
    if (evolutionSurge.timer >= evolutionSurge.duration) {
        evolutionSurge.active = false;
        evolutionSurge.timer = 0;
    }
}

const EVOLUTION_REQUIREMENTS = {
    slime_to_skeleton: {
        absorbed: 8,        // absorb 8 enemies → teaches resource gathering
        maxSizeReached: 4,  // reach size 4 → teaches growth mechanic
        kills: 20,          // kill 20 enemies → combat proficiency (absorb counts as kills)
        talismanFound: true,
        bossDefeated: true, // must defeat the Slime King → proves mastery of slime form
    },
    skeleton_to_wizard: {
        kills: 35,
        shieldDamageBlocked: 50,  // block 50 damage with shield → teaches positioning/defense (for tower play)
        comboReached: 5,          // reach a 5-hit combo → teaches aggressive playstyle awareness
        talismanLevel: 2,
    },
    wizard_to_lich: {
        kills: 50,
        talismanLevel: 3,
        towersPlaced: 3,          // place 3 towers → ensures you've used the summon mechanic
        lowManaKills: 10,         // kill 10 enemies while below 30% mana → teaches resource pressure (lich life)
    },
};

// Track evolution milestone hints (show once when 1 milestone remains)
let _evoHintShown = { slime: false, skeleton: false, wizard: false };

function checkSlimeEvolution() {
    const fd = FormSystem.formData.slime;
    const req = EVOLUTION_REQUIREMENTS.slime_to_skeleton;
    const met = (fd.absorbed >= req.absorbed ? 1 : 0) +
                (fd.maxSizeReached >= req.maxSizeReached ? 1 : 0) +
                (fd.totalKills >= req.kills ? 1 : 0) +
                (FormSystem.talisman.found ? 1 : 0) +
                (fd.bossDefeated ? 1 : 0);
    // Show hint when close to evolution (1 milestone remaining)
    if (met >= 4 && !_evoHintShown.slime && typeof Notify !== 'undefined') {
        _evoHintShown.slime = true;
        Notify.hint('evo_near_slime', 'Evolution is near... Check the Grimoire (TAB) for progress.', { color: '#e8c840' });
    }
    if (met >= 5) {
        triggerEvolution('skeleton');
    }
}

let evolutionState = {
    active: false,
    targetForm: null,
    timer: 0,
    phase: 0,       // 0=flash, 1=text, 2=transform, 3=done
    textAlpha: 0,
    flashAlpha: 0,
};

// Evolution Hint Screen — appears after evolution completes
let evolutionHintState = {
    active: false,
    form: null,
    timer: 0,
    dismissed: false,
    alpha: 0,
};

function triggerEvolution(targetForm) {
    if (evolutionState.active) return;
    evolutionState.active = true;
    evolutionState.targetForm = targetForm;
    evolutionState.timer = 0;
    evolutionState.phase = 0;
    evolutionState.textAlpha = 0;
    evolutionState.flashAlpha = 0;
    gamePhase = 'evolution'; // new game phase
    addScreenShake(8, 1.0);
    addSlowMo(0.5, 0.3);
    // Play evolution SFX
    if (typeof sfxEvolution === 'function') sfxEvolution();
}

function updateEvolution(dt) {
    if (!evolutionState.active) return;
    evolutionState.timer += dt;
    const t = evolutionState.timer;

    if (t < 1.0) {
        // Phase 0: bright flash
        evolutionState.flashAlpha = Math.min(1, t / 0.3);
        evolutionState.phase = 0;
    } else if (t < 3.5) {
        // Phase 1: narrative text
        evolutionState.flashAlpha = Math.max(0, evolutionState.flashAlpha - dt * 2);
        evolutionState.textAlpha = Math.min(1, (t - 1.0) / 0.5);
        evolutionState.phase = 1;
    } else if (t < 4.5) {
        // Phase 2: transform flash
        evolutionState.textAlpha = Math.max(0, evolutionState.textAlpha - dt * 3);
        evolutionState.flashAlpha = Math.min(0.8, (t - 3.5) / 0.3);
        evolutionState.phase = 2;
        // Perform the actual form switch at the peak
        if (t > 3.8 && FormSystem.currentForm !== evolutionState.targetForm) {
            FormSystem.switchForm(evolutionState.targetForm);
            // Reset player stats for new form
            const newConfig = FormSystem.getFormConfig();
            player.hp = newConfig.maxHp;
            player.mana = newConfig.maxMana || 0;
            player.attackCooldown = 0;
            player.dodgeCoolTimer = 0;
            player.attacking = false;
            // Talisman levels up on evolution
            FormSystem.talisman.level++;
            FormSystem.talisman.xp = 0;
            // Grant talisman perk for the new level
            if (typeof TALISMAN_PERKS !== 'undefined') {
                const newPerk = TALISMAN_PERKS.find(p => p.level === FormSystem.talisman.level);
                if (newPerk) {
                    FormSystem.talisman.perks.push(newPerk);
                    if (typeof Notify !== 'undefined') {
                        Notify.toast('Talisman Perk: ' + newPerk.name, { duration: 5, color: '#ffd700', borderColor: '#aa8800' });
                    }
                }
            }
            // Unequip items for non-equipment forms
            // Check the target form's config — if it can't use equipment,
            // return all equipped items to the backpack
            const targetConfig = FORM_CONFIGS[evolutionState.targetForm];
            if (targetConfig && !targetConfig.hasEquipment) {
                const slots = ['wand', 'robe', 'amulet', 'ring'];
                for (const slot of slots) {
                    if (inventory.equipped[slot]) {
                        inventory.backpack.push(inventory.equipped[slot]);
                        inventory.equipped[slot] = null;
                    }
                }
            }
            // --- Clean up state from previous form ---
            // Reset ALL forms to prevent stale state (acid puddles, split clones, minions, etc.)
            if (typeof resetSlimeState === 'function') resetSlimeState();
            if (typeof resetSkeletonState === 'function') resetSkeletonState();
            if (typeof resetLichState === 'function') resetLichState();
            if (typeof resetWizardState === 'function') resetWizardState();

            // --- Evolution Surge: activate temporary power boost ---
            evolutionSurge.active = true;
            evolutionSurge.timer = 0;
            // Dramatic screen shake at transform
            addScreenShake(14, 0.8);
            // Particle burst — form-colored
            if (typeof spawnParticleBurst === 'function') {
                const _evoColors = { skeleton: '#ffffff', wizard: '#5588ff', lich: '#aa44ff' };
                const _evoColor = _evoColors[evolutionState.targetForm] || '#e8c840';
                spawnParticleBurst(player.row, player.col, 40, _evoColor);
            }

            // --- Form-specific starting bonuses ---
            // Give each new form a head start so it feels immediately powerful
            if (evolutionState.targetForm === 'skeleton') {
                if (typeof skeletonState !== 'undefined') {
                    skeletonState.stamina = skeletonState.maxStamina || 100;
                    skeletonState.boneAmmo = skeletonState.maxBoneAmmo || 6;
                    skeletonState.comboCount = 2;  // start with a combo head-start
                }
            }
            if (evolutionState.targetForm === 'wizard') {
                // Wizard already starts at full mana from the stat reset above.
                // The surge buff handles the power spike feeling.
            }
            if (evolutionState.targetForm === 'lich') {
                if (typeof lichState !== 'undefined') {
                    lichState.soulEnergy = 50;
                    // Reset shadow step cooldown so player can immediately teleport
                    lichState.shadowStepCooldown = 0;
                }
            }
        }
    } else if (t < 6.0) {
        // Phase 3: fade out
        evolutionState.flashAlpha = Math.max(0, evolutionState.flashAlpha - dt * 1.5);
        evolutionState.phase = 3;
    } else {
        // Done — show ability hint screen before resuming gameplay
        evolutionState.active = false;
        evolutionHintState.active = true;
        evolutionHintState.form = evolutionState.targetForm;
        evolutionHintState.timer = 0;
        evolutionHintState.dismissed = false;
        evolutionHintState.alpha = 0;
        // Don't set gamePhase to 'playing' yet — hint screen will do it when dismissed
        addScreenShake(4, 0.5);
        // Post-evolution tutorial hints (fire after hint screen auto-dismisses)
        if (typeof Notify !== 'undefined' && Notify.tutorialSequence) {
            if (evolutionState.targetForm === 'skeleton') {
                Notify.tutorialSequence('skeleton_intro', [
                    { text: 'Skeleton Form: LMB to throw bones, RMB for shield bash.', delay: 8 },
                    { text: 'SPACE to roll dodge. Build combos with attacks!', delay: 5 },
                ]);
            } else if (evolutionState.targetForm === 'wizard') {
                Notify.tutorialSequence('wizard_intro', [
                    { text: 'Wizard Form: LMB for fireball, RMB to summon a tower.', delay: 8 },
                    { text: 'SPACE to phase jump through enemies!', delay: 5 },
                ]);
            } else if (evolutionState.targetForm === 'lich') {
                Notify.tutorialSequence('lich_intro', [
                    { text: 'Lich Form: LMB for soul bolt, RMB to raise undead.', delay: 8 },
                    { text: 'SPACE to shadow step. E to harvest souls from the fallen.', delay: 5 },
                ]);
            }
        }
        // Autosave at evolution milestone
        try { saveGame(getAutoSaveSlot()); } catch(e) { /* silent */ }
    }
}

function drawEvolution() {
    if (!evolutionState.active) return;
    const cx = canvasW / 2, cy = canvasH / 2;

    // Flash overlay
    if (evolutionState.flashAlpha > 0) {
        ctx.save();
        ctx.globalAlpha = evolutionState.flashAlpha * 0.7;
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvasW, canvasH);
        ctx.restore();
    }

    // Dark overlay for text
    if (evolutionState.phase === 1) {
        ctx.save();
        ctx.globalAlpha = 0.6;
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvasW, canvasH);

        // Evolution text with scale pulse
        ctx.globalAlpha = evolutionState.textAlpha;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const _evoTextT = evolutionState.timer - 1.0;
        const _evoScale = 30 + Math.min(18, _evoTextT * 24); // 30px -> 48px
        const _evoPulse = 1.0 + Math.sin(_evoTextT * 4) * 0.03; // subtle throb
        ctx.font = Math.round(_evoScale * _evoPulse) + 'px Georgia';
        // Form-colored glow
        const _evoGlowColors = { skeleton: 'rgba(220, 220, 255, 0.6)', wizard: 'rgba(80, 130, 255, 0.6)', lich: 'rgba(170, 60, 255, 0.6)' };
        const _evoTextColors = { skeleton: '#ddddff', wizard: '#88aaff', lich: '#cc88ff' };
        ctx.shadowColor = _evoGlowColors[evolutionState.targetForm] || 'rgba(200, 160, 40, 0.6)';
        ctx.shadowBlur = 30;
        ctx.fillStyle = _evoTextColors[evolutionState.targetForm] || '#e8c840';
        ctx.fillText('EVOLUTION', cx, cy - 40);
        ctx.shadowBlur = 0;

        // Subtitle based on target form
        const subtitles = {
            skeleton: 'The bones remember...',
            wizard: 'The arcane flows through you...',
            lich: 'Death is only the beginning...',
        };
        ctx.font = 'italic 18px Georgia';
        ctx.fillStyle = '#a89060';
        ctx.globalAlpha = evolutionState.textAlpha * 0.7;
        ctx.fillText(subtitles[evolutionState.targetForm] || 'You are changing...', cx, cy + 10);

        // Form name
        const formConfig = FORM_CONFIGS[evolutionState.targetForm];
        if (formConfig) {
            ctx.font = '16px monospace';
            ctx.fillStyle = '#c4a878';
            ctx.globalAlpha = evolutionState.textAlpha * 0.5;
            ctx.fillText(`Becoming: ${formConfig.displayName}`, cx, cy + 50);
        }

        ctx.restore();
    }

    // Second flash during transform (form-colored)
    if (evolutionState.phase === 2 && evolutionState.flashAlpha > 0) {
        ctx.save();
        ctx.globalAlpha = evolutionState.flashAlpha;
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, canvasH * 0.5);
        const _flashColors = {
            skeleton: ['rgba(220, 220, 255, 0.8)', 'rgba(180, 180, 220, 0.3)'],
            wizard:   ['rgba(80, 130, 255, 0.8)', 'rgba(40, 80, 200, 0.3)'],
            lich:     ['rgba(170, 60, 255, 0.8)', 'rgba(120, 30, 180, 0.3)'],
        };
        const _fc = _flashColors[evolutionState.targetForm] || ['rgba(232, 200, 64, 0.8)', 'rgba(200, 160, 40, 0.3)'];
        grad.addColorStop(0, _fc[0]);
        grad.addColorStop(0.5, _fc[1]);
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, canvasW, canvasH);
        ctx.restore();
    }
}

// Talisman drop — spawned after zone 1 wave 2 is cleared (for slime form)
function spawnTalismanDrop() {
    if (FormSystem.talisman.found) return;
    // Drop at player position
    worldKeyDrops.push({
        row: player.row + (Math.random() - 0.5),
        col: player.col + (Math.random() - 0.5),
        id: 'talisman',
        name: 'Ancient Talisman',
        color: '#e8c840',
        bobTime: 0,
        spawnTime: 0.5,
    });
    // Dramatic floating text hint when talisman spawns
    pickupTexts.push({
        row: player.row, col: player.col,
        text: 'A strange energy crystallizes...',
        color: '#cc88ff',
        life: 4, offsetY: 0,
    });
}

// Talisman pickup handler (called from tryPickupKeyDrops)
function checkTalismanPickup() {
    for (let i = worldKeyDrops.length - 1; i >= 0; i--) {
        const d = worldKeyDrops[i];
        if (d.id === 'talisman') {
            const dist = Math.sqrt((d.row - player.row) ** 2 + (d.col - player.col) ** 2);
            if (dist < 1.0) {
                FormSystem.talisman.found = true;
                worldKeyDrops.splice(i, 1);
                addScreenShake(5, 0.5);
                addSlowMo(0.5, 0.4);
                // Show pickup text
                pickupTexts.push({
                    row: player.row, col: player.col,
                    text: 'Ancient Talisman Found!',
                    color: '#e8c840',
                    life: 2.5, offsetY: 0,
                });
                // Tutorial hint — nudge player to check Grimoire
                if (typeof Notify !== 'undefined') {
                    Notify.hint('tutorial_talisman', 'Open the Grimoire (TAB) to see your evolution progress.', 6, { color: '#c4a878', borderColor: '#8a7030' });
                }
                return;
            }
        }
    }
}

// ============================================================
//  EVOLUTION HINT SCREEN — shows new form abilities after evolution
// ============================================================
function updateEvolutionHint(dt) {
    if (!evolutionHintState.active) return;

    evolutionHintState.timer += dt;
    const showDuration = 6.0;
    const fadeInTime = 0.4;
    const fadeOutTime = 1.0;

    // Fade in
    if (evolutionHintState.timer < fadeInTime) {
        evolutionHintState.alpha = evolutionHintState.timer / fadeInTime;
    } else if (evolutionHintState.timer < showDuration) {
        evolutionHintState.alpha = 1.0;
    } else {
        // Fade out over last second
        const fadeElapsed = evolutionHintState.timer - showDuration;
        evolutionHintState.alpha = Math.max(0, 1.0 - (fadeElapsed / fadeOutTime));
    }

    // Auto-dismiss after show duration
    if (evolutionHintState.timer >= showDuration + fadeOutTime) {
        evolutionHintState.active = false;
        evolutionHintState.dismissed = true;
        gamePhase = 'playing';
    }
}

function drawEvolutionHint() {
    if (!evolutionHintState.active || evolutionHintState.alpha <= 0) return;

    const alpha = evolutionHintState.alpha;
    const form = evolutionHintState.form;
    const cx = canvasW / 2;
    const cy = canvasH / 2;

    ctx.save();

    // Dark semi-transparent overlay
    ctx.globalAlpha = alpha * 0.7;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvasW, canvasH);

    // Ability hint box — centered, slightly above center
    const boxW = 340;
    const boxH = 280;
    const boxX = cx - boxW / 2;
    const boxY = cy - boxH / 2 - 40;

    // Box background (dark)
    ctx.globalAlpha = alpha * 0.95;
    ctx.fillStyle = '#0d0a06';
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxW, boxH, 8);
    ctx.fill();

    // Box border (golden)
    ctx.globalAlpha = alpha * 0.6;
    ctx.strokeStyle = '#8a7030';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxW, boxH, 8);
    ctx.stroke();

    // Title: "You are now a [Form Name]!"
    ctx.globalAlpha = alpha * 0.95;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.font = 'bold 24px Georgia';
    ctx.fillStyle = '#e8c840';
    const formConfig = FORM_CONFIGS[form];
    const formName = formConfig ? formConfig.displayName : 'Unknown Form';
    ctx.fillText('You are now', cx, boxY + 20);

    ctx.font = 'bold 28px Georgia';
    ctx.fillStyle = '#f0d060';
    ctx.shadowColor = 'rgba(200, 160, 40, 0.5)';
    ctx.shadowBlur = 10;
    ctx.fillText(formName, cx, boxY + 50);
    ctx.shadowBlur = 0;

    // Form-specific ability hints
    const abilityHints = {
        slime: [
            { key: 'LMB', ability: 'Acid Spit', desc: 'Ranged acid projectile attack' },
            { key: 'RMB', ability: 'Split Clone', desc: 'Create a damaging clone of yourself' },
            { key: 'SPACE', ability: 'Bounce Jump', desc: 'High-velocity jump with landing damage' },
            { key: 'E', ability: 'Absorb', desc: 'Consume enemies to grow larger' },
        ],
        skeleton: [
            { key: 'LMB', ability: 'Bone Throw', desc: 'Throw bones with precision' },
            { key: 'RMB', ability: 'Shield Bash', desc: 'Block damage and counterattack' },
            { key: 'SPACE', ability: 'Roll Dodge', desc: 'Quick evasion with i-frames' },
            { key: 'E', ability: 'Reassemble', desc: 'Interact with bones and objects' },
        ],
        wizard: [
            { key: 'LMB', ability: 'Fireball', desc: 'Explosive spell attack' },
            { key: 'RMB', ability: 'Summon Tower', desc: 'Place a defensive tower' },
            { key: 'SPACE', ability: 'Phase Jump', desc: 'Teleport dodge through enemies' },
            { key: 'E', ability: 'Interact', desc: 'Open chests and use objects' },
        ],
        lich: [
            { key: 'LMB', ability: 'Soul Bolt', desc: 'Siphon life-force attack' },
            { key: 'RMB', ability: 'Raise Undead', desc: 'Summon undead minions' },
            { key: 'SPACE', ability: 'Shadow Step', desc: 'Blink dodge that harvests souls' },
            { key: 'E', ability: 'Soul Harvest', desc: 'Gather power from the fallen' },
        ],
    };

    const hints = abilityHints[form] || abilityHints.wizard;

    // Draw ability lines
    ctx.globalAlpha = alpha * 0.9;
    ctx.font = '11px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    let yPos = boxY + 95;
    const lineHeight = 42;

    for (let i = 0; i < hints.length; i++) {
        const h = hints[i];

        // Key label (bright)
        ctx.fillStyle = '#ffd700';
        ctx.font = 'bold 11px monospace';
        ctx.globalAlpha = alpha * 0.95;
        ctx.fillText(h.key, boxX + 20, yPos);

        // Ability name (golden)
        ctx.fillStyle = '#e8c840';
        ctx.font = '12px Georgia';
        ctx.globalAlpha = alpha * 0.9;
        ctx.fillText(h.ability, boxX + 70, yPos);

        // Description (muted)
        ctx.fillStyle = '#9a8a6a';
        ctx.font = '9px Georgia';
        ctx.globalAlpha = alpha * 0.7;
        ctx.fillText(h.desc, boxX + 70, yPos + 14);

        yPos += lineHeight;
    }

    // Footer: "Press any key to continue" or auto-dismiss message
    const totalDuration = 6.0 + 1.0;
    const remainingTime = totalDuration - evolutionHintState.timer;
    let footerText = 'Press any key to continue';
    if (remainingTime > 0 && remainingTime < 2.0) {
        footerText = `Resuming in ${Math.ceil(remainingTime)}...`;
    }

    ctx.globalAlpha = alpha * 0.7;
    ctx.font = '9px Georgia';
    ctx.fillStyle = '#a89060';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(footerText, cx, boxY + boxH - 10);

    ctx.restore();
}

function dismissEvolutionHint() {
    if (!evolutionHintState.active) return;
    evolutionHintState.active = false;
    evolutionHintState.dismissed = true;
    gamePhase = 'playing';
}

