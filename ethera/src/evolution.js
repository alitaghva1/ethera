// ============================================================
//  EVOLUTION SYSTEM
// ============================================================

// --- Evolution Surge: temporary power boost after each evolution ---
// Makes each new form feel immediately stronger than the old one.
//
// Balance note (v1.17 pass): previously 45s total × 30% dmg × 20% speed was
// generous enough that the surge could solo-complete the next zone. The
// empowerment moment IS the reward for evolving, so we keep full values
// but shorten the flat-power window (full → fade cross-over happens sooner)
// and apply an ease-out curve to the fade — fades slower at first so the
// high-power feel lasts longer per-second, then drops off quickly at the end.
const evolutionSurge = {
    active: false,
    timer: 0,
    duration: 35,       // total surge time (down from 45s)
    fadeDuration: 20,   // fades over the last 20s — so only 15s at peak (down from 30s)
    dmgMult: 1.30,      // +30% damage at peak
    speedMult: 1.20,    // +20% move speed at peak
};

// Returns current surge multipliers (1.0 when inactive).
// Ease-out cubic on the fade so the surge stays meaningful until the final
// seconds, then drops quickly — reads as "wow I'm strong... wait it's gone" rather
// than a long boring linear decay where the middle 5s feels like nothing.
function getEvolutionSurgeBonus() {
    if (!evolutionSurge.active) return { dmgMult: 1, speedMult: 1 };
    const remaining = evolutionSurge.duration - evolutionSurge.timer;
    let intensity = 1;
    if (remaining < evolutionSurge.fadeDuration) {
        const t = remaining / evolutionSurge.fadeDuration; // 0..1
        // ease-out-cubic: stays near 1 longer, then falls off
        intensity = 1 - Math.pow(1 - t, 3);
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
        lowManaKills: 5,          // kill 5 enemies while below 30% mana → teaches resource pressure (halved — happens naturally in extended fights)
    },
};

// Track evolution milestone hints (show once when 1 milestone remains)
let _evoHintShown = { slime: false, skeleton: false, wizard: false };

// Returns { met, total } for given form's evolution progress (null if no evolution available)
function getEvolutionProgress(formOverride) {
    const form = formOverride || FormSystem.currentForm;
    const fd = FormSystem.formData[form];
    if (!fd) return null;
    let req, met = 0, total = 0;
    if (form === 'slime') {
        req = EVOLUTION_REQUIREMENTS.slime_to_skeleton;
        total = 5;
        met = (fd.absorbed >= req.absorbed ? 1 : 0) +
              (fd.maxSizeReached >= req.maxSizeReached ? 1 : 0) +
              (fd.totalKills >= req.kills ? 1 : 0) +
              (FormSystem.talisman.found ? 1 : 0) +
              (fd.bossDefeated ? 1 : 0);
    } else if (form === 'skeleton') {
        req = EVOLUTION_REQUIREMENTS.skeleton_to_wizard;
        total = 4;
        met = (fd.totalKills >= req.kills ? 1 : 0) +
              (fd.shieldDamageBlocked >= req.shieldDamageBlocked ? 1 : 0) +
              (fd.maxComboReached >= req.comboReached ? 1 : 0) +
              (FormSystem.talisman.level >= req.talismanLevel ? 1 : 0);
    } else if (form === 'wizard') {
        req = EVOLUTION_REQUIREMENTS.wizard_to_lich;
        total = 4;
        met = (fd.totalKills >= req.kills ? 1 : 0) +
              (FormSystem.talisman.level >= req.talismanLevel ? 1 : 0) +
              (fd.towersPlaced >= req.towersPlaced ? 1 : 0) +
              (fd.lowManaKills >= req.lowManaKills ? 1 : 0);
    } else {
        return null; // lich — no further evolution
    }
    return { met, total };
}

function checkSlimeEvolution() {
    try {
        const fd = FormSystem.formData.slime;
        const req = EVOLUTION_REQUIREMENTS.slime_to_skeleton;
        const met = (fd.absorbed >= req.absorbed ? 1 : 0) +
                    (fd.maxSizeReached >= req.maxSizeReached ? 1 : 0) +
                    (fd.totalKills >= req.kills ? 1 : 0) +
                    (FormSystem.talisman.found ? 1 : 0) +
                    (fd.bossDefeated ? 1 : 0);
        // Hint when first milestone is met — teach the evolution concept early
        if (met >= 1 && typeof Notify !== 'undefined') {
            Notify.hint('evo_first_milestone', 'You feel something stirring... Open the Grimoire (TAB) to see your evolution progress.', 6, { color: '#c4a878', borderColor: '#8a7030' });
        }
        // Show hint when close to evolution (1 milestone remaining)
        if (met >= 4 && !_evoHintShown.slime && typeof Notify !== 'undefined') {
            _evoHintShown.slime = true;
            Notify.hint('evo_near_slime', 'Evolution is near... Check the Grimoire (TAB) for progress.', 5, { color: '#e8c840' });
        }
        if (met >= 5) {
            triggerEvolution('skeleton');
        }
    } catch (err) {
        console.error('checkSlimeEvolution failed:', err, err.stack);
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
            // Reset player stats for new form (include all HP bonuses)
            const newConfig = FormSystem.getFormConfig();
            const _evoEqHP = (typeof equipBonus !== 'undefined' && equipBonus.maxHpBonus) ? equipBonus.maxHpBonus : 0;
            const _evoTalHP = (typeof getTalismanBonus === 'function') ? getTalismanBonus().hpBonus : 0;
            const _evoQHP = (typeof questState !== 'undefined' && questState.permBonuses) ? (questState.permBonuses.maxHpBonus || 0) : 0;
            player.hp = Math.round(newConfig.maxHp + _evoEqHP + _evoTalHP + _evoQHP);
            player.mana = newConfig.maxMana || 0;
            player.attackCooldown = 0;
            player.dodgeCoolTimer = 0;
            player.attacking = false;
            player.dodging = false;
            player.dodgeTimer = 0;
            player.dodgeCoolTimer = 0;
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
                // Recalculate equipment bonuses after unequipping
                if (typeof getEquipBonuses === 'function') equipBonus = getEquipBonuses();
            }
            // Clear form-specific augments (mutations/runes don't carry across evolutions)
            if (typeof augmentInventory !== 'undefined') {
                augmentInventory.equipped = [null, null, null];
                augmentInventory.backpack = [];
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

            // --- Clear form-specific fusions on evolution (they don't transfer) ---
            if (typeof fusedUpgrades !== 'undefined') {
                for (const key of Object.keys(fusedUpgrades)) delete fusedUpgrades[key];
            }

            // --- Legacy Echo: carry top 2 upgrades from previous form at 65% power ---
            if (typeof FormSystem !== 'undefined' && FormSystem.legacyEchoes &&
                FormSystem.legacyEchoes.length < (FormSystem.maxEchoes || 3)) {
                // Find the top 2 highest-stacked upgrades the player has from the previous form
                const prevForm = FormSystem.previousForm || 'slime';
                const prevPools = {
                    slime: typeof SLIME_UPGRADE_POOL !== 'undefined' ? SLIME_UPGRADE_POOL : [],
                    skeleton: typeof SKELETON_UPGRADE_POOL !== 'undefined' ? SKELETON_UPGRADE_POOL : [],
                    wizard: typeof WIZARD_UPGRADE_POOL !== 'undefined' ? WIZARD_UPGRADE_POOL : [],
                    lich: typeof LICH_UPGRADE_POOL !== 'undefined' ? LICH_UPGRADE_POOL : [],
                };
                const prevPool = prevPools[prevForm] || [];
                // Collect all upgrades with stacks, sorted by stacks descending
                const stackedUpgrades = [];
                for (const u of prevPool) {
                    const stacks = upgrades[u.id] || 0;
                    if (stacks > 0) stackedUpgrades.push({ upgrade: u, stacks });
                }
                stackedUpgrades.sort((a, b) => b.stacks - a.stacks);
                // Carry top 2 (or fewer if not enough room in maxEchoes)
                const echoSlots = Math.min(2, (FormSystem.maxEchoes || 3) - FormSystem.legacyEchoes.length);
                for (let ei = 0; ei < Math.min(echoSlots, stackedUpgrades.length); ei++) {
                    const { upgrade: bestUpgrade, stacks: bestStacks } = stackedUpgrades[ei];
                    FormSystem.legacyEchoes.push({
                        upgradeId: bestUpgrade.id,
                        upgradeName: bestUpgrade.name,
                        originalForm: prevForm,
                        stackCount: bestStacks,
                        effectiveMult: 0.65,  // buffed from 0.5 — carry 65% power forward
                    });
                    if (typeof Notify !== 'undefined') {
                        Notify.toast('LEGACY ECHO: ' + bestUpgrade.name + ' carries forward at 65% power',
                            { duration: 5, color: '#ffd700', borderColor: '#aa8800' });
                    }
                }
            }

            // --- Track form evolution history (for particle color echoes) ---
            if (typeof FormSystem !== 'undefined') {
                if (!FormSystem.formHistory) FormSystem.formHistory = [];
                FormSystem.formHistory.push(FormSystem.previousForm || 'slime');
            }

            // --- Form-specific starting bonuses (enhanced for evolution feel) ---
            if (evolutionState.targetForm === 'skeleton') {
                if (typeof skeletonState !== 'undefined') {
                    skeletonState.stamina = skeletonState.maxStamina || 100;
                    skeletonState.boneAmmo = 10;     // boosted from 6 — reward for aggressive slime play
                    skeletonState.comboCount = 3;     // boosted from 2 — momentum carried forward
                }
            }
            if (evolutionState.targetForm === 'wizard') {
                // Start with bonus mana — magical reserves from skeleton discipline
                player.mana = 120;  // 20% over base max
            }
            if (evolutionState.targetForm === 'lich') {
                if (typeof lichState !== 'undefined') {
                    lichState.soulEnergy = 80;        // boosted from 50 — arcane power carried forward
                    lichState.shadowStepCooldown = 0;
                }
            }
        }
    } else if (t < 6.0) {
        // Phase 3: fade out
        evolutionState.flashAlpha = Math.max(0, evolutionState.flashAlpha - dt * 1.5);
        evolutionState.phase = 3;
    } else {
        // Done — show ability hint screen before resuming gameplay.
        evolutionState.active = false;
        evolutionHintState.active = true;
        evolutionHintState.form = evolutionState.targetForm;
        evolutionHintState.timer = 0;
        evolutionHintState.dismissed = false;
        evolutionHintState.alpha = 0;
        // CRITICAL: flip gamePhase back to 'playing' NOW so the gameloop takes
        // the hint-screen branch (which gates on evolutionHintState.active, not
        // gamePhase). Leaving gamePhase at 'evolution' made the gameloop keep
        // routing to the evolution branch with nothing to render → black freeze.
        gamePhase = 'playing';
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
        // ── Full-opaque backdrop — was 0.6 alpha and the dungeon showed
        // through as a "screen within a screen". Evolution is a narrative
        // moment; the game world must be completely hidden.
        ctx.globalAlpha = 1.0;
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvasW, canvasH);

        // ── Form-colored radial atmosphere — subtle, centered, adds depth
        // without washing out the text. Uses the same palette as the form
        // glow so the whole frame reads as one coherent color mood.
        const _evoAtmColors = {
            skeleton: 'rgba(180, 180, 220, 0.18)',
            wizard:   'rgba(70, 110, 220, 0.18)',
            lich:     'rgba(140, 60, 200, 0.18)',
        };
        const _evoAtmColor = _evoAtmColors[evolutionState.targetForm] || 'rgba(200, 160, 40, 0.15)';
        ctx.globalCompositeOperation = 'screen';
        const _evoAtm = ctx.createRadialGradient(cx, cy, 0, cx, cy, canvasH * 0.55);
        _evoAtm.addColorStop(0, _evoAtmColor);
        _evoAtm.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = _evoAtm;
        ctx.fillRect(0, 0, canvasW, canvasH);
        ctx.globalCompositeOperation = 'source-over';

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
                // Show dramatic pickup screen
                triggerTalismanPickup();
                // Tutorial hint — nudge player to check Grimoire (fires after pickup screen)
                setTimeout(function() {
                    if (typeof Notify !== 'undefined') {
                        Notify.hint('tutorial_talisman', 'Open the Grimoire (TAB) to see your evolution progress.', 6, { color: '#c4a878', borderColor: '#8a7030' });
                    }
                }, 6000);
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

// ============================================================
//  TALISMAN PICKUP SCREEN — dramatic reveal when talisman is found
// ============================================================
let talismanPickupState = {
    active: false,
    timer: 0,
    alpha: 0,
    dismissed: false,
};

function triggerTalismanPickup() {
    if (talismanPickupState.active) return;
    // Defensive warn: if the cinematic image isn't loaded at trigger time the
    // drawTalismanPickup() fallback will render a procedural gold-diamond scene.
    // Surface this to devtools once so it's diagnosable instead of silent.
    if (typeof images === 'undefined' || !images.talisman_pickup ||
        !images.talisman_pickup.width || !images.talisman_pickup.height) {
        console.warn('[talisman] talisman_pickup.jpg not available — cinematic falling back to procedural visual. Check assets/talisman_pickup.jpg load status in devtools Network tab, and window.failedAssets for details.');
    }
    talismanPickupState.active = true;
    talismanPickupState.timer = 0;
    talismanPickupState.alpha = 0;
    talismanPickupState.dismissed = false;
    // Keep gamePhase at 'playing' — the gameloop's talismanPickup branch gates
    // on talismanPickupState.active, not gamePhase. Setting gamePhase here would
    // make render() return early (talismanPickup isn't in its allowed list) →
    // the world stops rendering and the modal sits over a solid zone-bg fill,
    // which looked to users like a "white flash then no image".
    // gamePhase = 'talismanPickup';  // ← removed (caused broken render)
}

function updateTalismanPickup(dt) {
    if (!talismanPickupState.active) return;
    talismanPickupState.timer += dt;
    const fadeInTime = 0.5;
    const showDuration = 5.0;
    const fadeOutTime = 0.8;

    if (talismanPickupState.timer < fadeInTime) {
        talismanPickupState.alpha = talismanPickupState.timer / fadeInTime;
    } else if (talismanPickupState.timer < showDuration) {
        talismanPickupState.alpha = 1.0;
    } else {
        const fadeElapsed = talismanPickupState.timer - showDuration;
        talismanPickupState.alpha = Math.max(0, 1.0 - (fadeElapsed / fadeOutTime));
    }

    if (talismanPickupState.timer >= showDuration + fadeOutTime) {
        talismanPickupState.active = false;
        talismanPickupState.dismissed = true;
        gamePhase = 'playing';
    }
}

function drawTalismanPickup() {
    // DON'T early-return on alpha <= 0 — frame 1 of the pickup has alpha=0
    // and the modal needs to draw its OPAQUE backdrop even then, otherwise
    // the canvas shows whatever was there last frame (raw game world → "white
    // flash" bug). Only return if the state isn't active at all.
    if (!talismanPickupState.active) return;

    const alpha = talismanPickupState.alpha;
    const cx = canvasW / 2;
    const cy = canvasH / 2;
    const t = talismanPickupState.timer;

    ctx.save();

    // Step 1: fully opaque black backdrop IMMEDIATELY. NOT faded with `alpha`
    // because during the 0.5s fade-in ramp, a partially-transparent black on
    // top of the still-rendered game world created a "picture in picture"
    // effect (game world visible + cinematic image both showing at once).
    // Backdrop snaps to full opacity the moment the modal is active; only
    // the IMAGE fades in over it.
    ctx.globalAlpha = 1.0;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvasW, canvasH);

    // Step 2: cinematic illustration, "contain" fit so the whole image shows
    // with black bars as needed (no cropping of the slime + talisman). The
    // image fades in via `alpha` while the black backdrop stays solid.
    const pickupImg = images.talisman_pickup;
    // Validate: image must exist AND have non-zero dimensions. A partially-decoded
    // or errored Image() can still slot into images.talisman_pickup in edge cases;
    // checking width/height is a cheap guarantee we have a drawable.
    const hasValidImg = pickupImg && pickupImg.width > 0 && pickupImg.height > 0;
    if (hasValidImg) {
        ctx.globalAlpha = alpha;
        const imgAspect = pickupImg.width / pickupImg.height;
        const canvasAspect = canvasW / canvasH;
        let drawW, drawH;
        if (imgAspect > canvasAspect) {
            // Wider image — fit to canvas width, letterbox top/bottom
            drawW = canvasW * 0.95;
            drawH = drawW / imgAspect;
        } else {
            // Taller image (or same ratio) — fit to canvas height, pillarbox sides
            drawH = canvasH * 0.88;
            drawW = drawH * imgAspect;
        }
        const drawX = cx - drawW / 2;
        const drawY = cy - drawH / 2 - 30; // lift slightly so title text has room
        ctx.drawImage(pickupImg, drawX, drawY, drawW, drawH);

        // Soft vignette fading image edges into the black backdrop
        ctx.globalAlpha = alpha;
        const vig = ctx.createRadialGradient(cx, cy - 30, canvasH * 0.25, cx, cy - 30, canvasW * 0.55);
        vig.addColorStop(0, 'rgba(0, 0, 0, 0)');
        vig.addColorStop(0.8, 'rgba(0, 0, 0, 0.25)');
        vig.addColorStop(1, 'rgba(0, 0, 0, 0.85)');
        ctx.fillStyle = vig;
        ctx.fillRect(0, 0, canvasW, canvasH);
    } else {
        // Procedural fallback — when talisman_pickup.jpg fails to load we used to
        // render JUST text on a black canvas ("tries and fails to make it happen").
        // This draws a dramatic gold-diamond cinematic so the moment still lands.
        // (If you see this in normal play, check the console.warn from
        // triggerTalismanPickup() and fix the underlying asset-load issue.)
        const fbY = cy - 60; // lift slightly so title text has room below
        const diamondR = Math.min(canvasW, canvasH) * 0.18;
        const t2 = t * 0.8;

        // Outer glow — soft wide radial, builds atmosphere around the diamond
        ctx.globalAlpha = alpha;
        const glowR = diamondR * 4;
        const glow = ctx.createRadialGradient(cx, fbY, 0, cx, fbY, glowR);
        glow.addColorStop(0, 'rgba(120, 230, 110, 0.35)');
        glow.addColorStop(0.35, 'rgba(232, 200, 64, 0.18)');
        glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = glow;
        ctx.fillRect(cx - glowR, fbY - glowR, glowR * 2, glowR * 2);

        // Inner halo — pulsing tight gold ring right around the diamond
        const haloPulse = 0.7 + Math.sin(t2 * 3) * 0.15;
        ctx.globalAlpha = alpha * haloPulse;
        const halo = ctx.createRadialGradient(cx, fbY, diamondR * 0.8, cx, fbY, diamondR * 2.2);
        halo.addColorStop(0, 'rgba(255, 230, 120, 0.7)');
        halo.addColorStop(1, 'rgba(200, 180, 60, 0)');
        ctx.fillStyle = halo;
        ctx.fillRect(cx - diamondR * 3, fbY - diamondR * 3, diamondR * 6, diamondR * 6);

        // Orbiting motes — 8 particles tracing an ellipse around the diamond
        ctx.globalAlpha = alpha * 0.9;
        ctx.fillStyle = '#fff8b0';
        for (let i = 0; i < 8; i++) {
            const pa = (i / 8) * Math.PI * 2 + t2 * 0.7;
            const pr = diamondR * (1.6 + Math.sin(t2 * 2 + i) * 0.2);
            const ppx = cx + Math.cos(pa) * pr;
            const ppy = fbY + Math.sin(pa) * pr * 0.7; // elliptical, not round
            const pSize = 3 + Math.sin(t2 * 4 + i) * 1.5;
            ctx.beginPath();
            ctx.arc(ppx, ppy, Math.max(0.5, pSize), 0, Math.PI * 2);
            ctx.fill();
        }

        // Main diamond — elongated vertical gem, classic talisman silhouette
        ctx.globalAlpha = alpha;
        ctx.shadowColor = 'rgba(232, 200, 64, 0.9)';
        ctx.shadowBlur = 40;
        ctx.fillStyle = '#e8c840';
        ctx.beginPath();
        ctx.moveTo(cx, fbY - diamondR);
        ctx.lineTo(cx + diamondR * 0.7, fbY);
        ctx.lineTo(cx, fbY + diamondR);
        ctx.lineTo(cx - diamondR * 0.7, fbY);
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;

        // Diamond inner highlight — lighter facet suggesting refraction
        ctx.globalAlpha = alpha * 0.85;
        ctx.fillStyle = '#fff6c0';
        ctx.beginPath();
        ctx.moveTo(cx, fbY - diamondR * 0.5);
        ctx.lineTo(cx + diamondR * 0.25, fbY);
        ctx.lineTo(cx, fbY + diamondR * 0.3);
        ctx.lineTo(cx - diamondR * 0.25, fbY);
        ctx.closePath();
        ctx.fill();
    }

    // Step 3: title text at the bottom, always readable against black
    ctx.globalAlpha = alpha * 0.95;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const titleScale = 32 + Math.min(10, t * 12);
    const titlePulse = 1.0 + Math.sin(t * 3) * 0.02;
    ctx.font = 'bold ' + Math.round(titleScale * titlePulse) + 'px Georgia';
    ctx.shadowColor = 'rgba(100, 220, 80, 0.7)';
    ctx.shadowBlur = 24;
    ctx.fillStyle = '#e8c840';
    ctx.fillText('Ancient Talisman Found', cx, canvasH - 95);
    ctx.shadowBlur = 0;

    // Subtitle
    ctx.globalAlpha = alpha * 0.8;
    ctx.font = 'italic 15px Georgia';
    ctx.fillStyle = '#b8a070';
    ctx.fillText('A relic of forgotten power... it hums with evolution energy.', cx, canvasH - 60);

    // Footer
    ctx.globalAlpha = alpha * 0.55;
    ctx.font = '11px Georgia';
    ctx.fillStyle = '#8a7a5a';
    ctx.fillText('Press any key to continue', cx, canvasH - 28);

    ctx.restore();
}

// Shared HUD icon renderer — used by slime.js / skeleton.js form HUDs.
// Uses the talisman_drop sprite (clean circular icon with black bg) rendered
// with 'screen' composite so the black background disappears against the HUD.
// Falls back to a procedural gold diamond if the sprite hasn't loaded.
// Clamps position so the icon never spills off the right edge of the canvas.
function _drawTalismanHudIcon(targetX, targetY) {
    if (typeof ctx === 'undefined' || typeof canvasW === 'undefined') return;
    if (!FormSystem.talisman.found) return;

    const iconR = 18; // render radius — icon is 2R wide
    // Clamp so the icon stays fully on-screen even on odd aspect ratios
    const tX = Math.min(canvasW - iconR - 6, Math.max(iconR + 6, targetX));
    const tY = targetY;
    const t = performance.now() / 1000;
    const pulse = 0.85 + Math.sin(t * 2) * 0.12;
    const img = (typeof images !== 'undefined') ? images.talisman_drop : null;

    ctx.save();
    try {
        if (img) {
            // Ground halo: radial green/gold glow behind the icon for depth
            ctx.globalCompositeOperation = 'screen';
            ctx.globalAlpha = pulse * 0.5;
            const halo = ctx.createRadialGradient(tX, tY, 0, tX, tY, iconR * 1.8);
            halo.addColorStop(0, 'rgba(120, 230, 110, 0.55)');
            halo.addColorStop(0.5, 'rgba(200, 180, 60, 0.25)');
            halo.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = halo;
            ctx.fillRect(tX - iconR * 2, tY - iconR * 2, iconR * 4, iconR * 4);

            // Icon: clip to circle so JPG edges are hidden, screen-blend removes
            // the black background without needing alpha channel.
            ctx.globalAlpha = pulse;
            ctx.beginPath();
            ctx.arc(tX, tY, iconR, 0, Math.PI * 2);
            ctx.clip();
            ctx.drawImage(img, tX - iconR, tY - iconR, iconR * 2, iconR * 2);
        } else {
            // Fallback: procedural gold diamond when sprite hasn't loaded yet
            ctx.globalAlpha = pulse;
            ctx.shadowColor = 'rgba(232, 200, 64, 0.5)';
            ctx.shadowBlur = 6;
            ctx.fillStyle = '#e8c840';
            ctx.beginPath();
            ctx.moveTo(tX, tY - 10);
            ctx.lineTo(tX + 8, tY);
            ctx.lineTo(tX, tY + 10);
            ctx.lineTo(tX - 8, tY);
            ctx.closePath();
            ctx.fill();
            ctx.shadowBlur = 0;
        }
    } finally {
        ctx.restore();
    }

    // Level label below icon (outside save/restore so composite mode is source-over)
    ctx.save();
    try {
        ctx.globalAlpha = 0.8;
        ctx.font = 'bold 10px Georgia';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.strokeStyle = 'rgba(0,0,0,0.8)';
        ctx.lineWidth = 2;
        ctx.fillStyle = '#e8c840';
        const label = 'Lv' + FormSystem.talisman.level;
        ctx.strokeText(label, tX, tY + iconR + 2);
        ctx.fillText(label, tX, tY + iconR + 2);
    } finally {
        ctx.restore();
    }
}

function dismissTalismanPickup() {
    if (!talismanPickupState.active) return;
    talismanPickupState.active = false;
    talismanPickupState.dismissed = true;
    gamePhase = 'playing';
}

