// ============================================================
//  WIZARD FORM — Handler wiring
// ============================================================

const wizardState = {
    // Spell Weaving — alternate fireball/tower to build arcane resonance
    arcaneResonance: 0,
    resonanceTimer: 0,
    resonanceDecay: 3.5,
    maxResonance: 8,
    lastAction: null,  // 'fireball' or 'tower'
};

// Reset wizard form state (called on form switch)
function resetWizardState() {
    player.attackCooldown = 0;
    player.dodgeCoolTimer = 0;
    player.dodgeFlashTimer = 0;
    player.dodging = false;
    player.attacking = false;
    placement.active = false;
    placement.channeling = false;
    placement.channelTimer = 0;
    mouse.down = false;
    mouse.rightDown = false;
    wizardState.arcaneResonance = 0;
    wizardState.resonanceTimer = 0;
    wizardState.lastAction = null;
}

// --- Handler registration ---

formHandlers.wizard.update = function(dt) {
    updatePlayer(dt);
    // Spell Weaving: tick resonance decay
    wizardState.resonanceTimer += dt;
    if (wizardState.resonanceTimer > wizardState.resonanceDecay && wizardState.arcaneResonance > 0) {
        wizardState.arcaneResonance = Math.max(0, Math.floor(wizardState.arcaneResonance) - 1);
        wizardState.resonanceTimer = wizardState.resonanceDecay - 0.5; // re-check in 0.5s
    }
    // Check wizard->lich evolution
    const fd = FormSystem.formData.wizard;
    const req = EVOLUTION_REQUIREMENTS.wizard_to_lich;
    if (fd.totalKills >= req.kills &&
        FormSystem.talisman.level >= req.talismanLevel &&
        fd.towersPlaced >= req.towersPlaced &&
        fd.lowManaKills >= req.lowManaKills) {
        triggerEvolution('lich');
    }
};

formHandlers.wizard.draw = function() { drawWizard(); };

formHandlers.wizard.drawHUD = function() { drawHPMana(); drawObjective(); };

// Occlusion ghost — bare sprite only, no VFX
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

formHandlers.wizard.onPrimaryAttack = function() {
    if (player.attackCooldown <= 0 && player.mana >= (COMBAT.manaCost * (1 - getUpgrade('arcane_efficiency') * 0.15))) {
        mouse.down = true;
        // Spell Weaving: alternating fireball/tower builds resonance
        if (wizardState.lastAction === 'tower') {
            wizardState.arcaneResonance = Math.min(wizardState.maxResonance, wizardState.arcaneResonance + 1);
            wizardState.resonanceTimer = 0;
        }
        wizardState.lastAction = 'fireball';
    }
};
formHandlers.wizard.onSecondaryAbility = function() {
    const effSummonMax = SUMMON_MAX_COUNT + getUpgrade('tower_extra');
    if (!placement.active && summons.length < effSummonMax && player.mana >= SUMMON_MANA_COST) {
        placement.active = true;
        // Spell Weaving: alternating tower/fireball builds resonance
        if (wizardState.lastAction === 'fireball') {
            wizardState.arcaneResonance = Math.min(wizardState.maxResonance, wizardState.arcaneResonance + 1);
            wizardState.resonanceTimer = 0;
        }
        wizardState.lastAction = 'tower';
    }
};
formHandlers.wizard.onDodge = function() {
    if (!player.dodging && player.dodgeCoolTimer <= 0) {
        keys[' '] = true;
    }
};
formHandlers.wizard.onInteract = function() {};
