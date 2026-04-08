// ============================================================
//  FORM SYSTEM — Evolution RPG abstraction layer
//  Supports: slime, skeleton, wizard, lich
// ============================================================
const FormSystem = {
    currentForm: 'slime',  // active player form — starts as slime
    previousForm: null,     // form before last evolution
    evolutionCount: 0,      // how many times player has evolved

    // Talisman — persistent cross-form artifact
    talisman: {
        level: 1,
        xp: 0,
        xpToNext: 100,
        perks: [],          // unlocked passive bonuses
        found: false,       // whether player has found the talisman yet
    },

    // Per-form persistent data (frozen on evolution, never lost)
    formData: {
        slime:    { unlocked: true, absorbed: 0, maxSizeReached: 0, totalKills: 0 },
        skeleton: { unlocked: false, bonesCollected: 0, shieldBashes: 0, shieldDamageBlocked: 0, maxComboReached: 0, totalKills: 0 },
        wizard:   { unlocked: false, spellsCast: 0, towersPlaced: 0, lowManaKills: 0, totalKills: 0 },
        lich:     { unlocked: false, soulsHarvested: 0, undeadRaised: 0, totalKills: 0 },
    },

    // Evolution milestone tracking
    evolutionProgress: {
        currentMilestones: {},
        nextForm: null,
    },

    // Get the current form's config
    getFormConfig() {
        return FORM_CONFIGS[this.currentForm];
    },

    // Switch to a new form (called during evolution)
    switchForm(newForm) {
        if (!FORM_CONFIGS[newForm]) return;
        this.previousForm = this.currentForm;
        this.currentForm = newForm;
        this.formData[newForm].unlocked = true;
        this.evolutionCount++;
    },

    // Get the handler functions for the current form
    getHandler() {
        if (!formHandlers[this.currentForm]) {
            console.warn('No handler for form:', this.currentForm);
        }
        return formHandlers[this.currentForm];
    },
};

// Form configuration objects — stats, abilities, and metadata per form
const FORM_CONFIGS = {
    // TODO: Wizard form config — currently uses legacy code in gameloop.js; this is placeholder data
    wizard: {
        name: 'Wizard',
        displayName: 'Broken Wizard',
        // Movement physics
        moveAccel: 22,
        moveDecel: 18,
        moveMaxSpeed: 4.2,
        hitboxRadius: 0.18,
        // Base stats
        maxHp: 100,
        maxMana: 100,
        manaRegen: 12,
        manaRegenDelay: 0.8,
        invTime: 0.8,
        // Combat
        atkDuration: 0.40,
        atkCooldown: 0.45,
        atkFireAt: 0.20,
        atkSpeed: 11,
        projLife: 1.8,
        projSize: 8,
        manaCost: 8,
        primaryDmg: 20,
        knockback: 2.5,
        // Abilities
        hasDodge: true,
        hasSummon: true,
        hasEquipment: true,
        canOpenChests: true,
        hasKeyItems: true,
        // Upgrade pool reference
        upgradePoolId: 'wizard',
        // Resource type
        resourceType: 'mana',
        resourceName: 'Mana',
        // Sprite config
        spritePrefix: 'wizard',
        frameWidth: 100,
        frameHeight: 100,
    },
    slime: {
        name: 'Slime',
        displayName: 'Dungeon Slime',
        // Movement physics — bouncy, high accel, lower max speed
        moveAccel: 28,
        moveDecel: 12,
        moveMaxSpeed: 3.2,
        hitboxRadius: 0.22,
        // Base stats — grows with size
        maxHp: 60,
        maxMana: 0,  // slimes don't use mana
        manaRegen: 0,
        manaRegenDelay: 0,
        invTime: 0.6,
        // Combat — acid spit
        atkDuration: 0.35,
        atkCooldown: 0.55,
        atkFireAt: 0.15,
        atkSpeed: 10,
        projLife: 1.4,
        projSize: 6,
        manaCost: 0,
        primaryDmg: 12,
        knockback: 1.5,
        // Abilities
        hasDodge: true,     // bounce jump
        hasSummon: false,
        hasEquipment: false,
        canOpenChests: false,  // no hands — can't manipulate objects
        hasKeyItems: false,    // too primitive for key items / quests / map
        // Upgrade pool reference
        upgradePoolId: 'slime',
        // Resource type
        resourceType: 'size',
        resourceName: 'Size',
        // Sprite config
        spritePrefix: 'slime_p',
        frameWidth: 100,
        frameHeight: 100,
    },
    skeleton: {
        name: 'Skeleton',
        displayName: 'Risen Skeleton',
        moveAccel: 24,
        moveDecel: 16,
        moveMaxSpeed: 4.5,
        hitboxRadius: 0.18,
        maxHp: 80,
        maxMana: 0,
        manaRegen: 0,
        manaRegenDelay: 0,
        invTime: 0.7,
        atkDuration: 0.30,
        atkCooldown: 0.40,
        atkFireAt: 0.12,
        atkSpeed: 12,
        projLife: 1.5,
        projSize: 5,
        manaCost: 0,
        primaryDmg: 16,
        knockback: 2.0,
        hasDodge: true,
        hasSummon: false,
        hasEquipment: false,
        canOpenChests: false,
        hasKeyItems: true,
        upgradePoolId: 'skeleton',
        resourceType: 'stamina',
        resourceName: 'Stamina',
        spritePrefix: 'skel_p',
        frameWidth: 100,
        frameHeight: 100,
    },
    lich: {
        name: 'Lich',
        displayName: 'Lich Necromancer',
        moveAccel: 20,
        moveDecel: 14,
        moveMaxSpeed: 4.8,
        hitboxRadius: 0.18,
        maxHp: 120,
        maxMana: 0,
        manaRegen: 0,
        manaRegenDelay: 0,
        invTime: 0.6,
        atkDuration: 0.30,
        atkCooldown: 0.35,
        atkFireAt: 0.10,
        atkSpeed: 14,
        projLife: 2.2,
        projSize: 7,
        manaCost: 0,
        primaryDmg: 28,
        knockback: 2.0,
        hasDodge: true,
        hasSummon: false,
        hasEquipment: false,
        canOpenChests: true,
        hasKeyItems: true,
        upgradePoolId: 'lich',
        resourceType: 'soulEnergy',
        resourceName: 'Soul Energy',
        spritePrefix: 'lich',
        frameWidth: 100,
        frameHeight: 100,
    },
};

// Form handler registry — each form registers its update/draw/ability functions
// For now, only wizard is registered; others will be added in later phases
const formHandlers = {
    // TODO: Wizard form handler — currently uses legacy code in gameloop.js
    wizard: {
        // These point to existing functions — the wizard handler IS the current code
        update: null,       // set after updatePlayer is defined
        draw: null,         // set after drawWizard is defined
        drawHUD: null,      // set after drawHPMana is defined
        onPrimaryAttack: null,   // set after attack code is defined
        onSecondaryAbility: null, // summon tower
        onDodge: null,           // phase jump
        onInteract: null,        // E key
        getUpgradePool: () => UPGRADE_POOL,
    },
};

// Slime upgrade pool
const SLIME_UPGRADE_POOL = [
    { id: 'acid_potency', name: 'Acid Potency', desc: 'Acid spit deals +25% damage and leaves larger puddles', icon: 'explode', maxStack: 4, category: 'wand' },
    { id: 'elastic_body', name: 'Elastic Body', desc: 'Bounce higher and deal +30% landing damage', icon: 'bounce', maxStack: 3, category: 'passive' },
    { id: 'rapid_mitosis', name: 'Rapid Mitosis', desc: 'Split clones last longer and explode harder', icon: 'split', maxStack: 3, category: 'passive' },
    { id: 'iron_stomach', name: 'Iron Stomach', desc: 'Absorb faster and gain +1 size per absorb', icon: 'big', maxStack: 3, category: 'passive' },
    { id: 'ooze_trail', name: 'Ooze Trail', desc: 'Leave a damaging acid trail when moving at size 3+', icon: 'thorns', maxStack: 2, category: 'passive' },
    { id: 'regen_gel', name: 'Regenerative Gel', desc: 'Passive HP regen that scales with size', icon: 'regen', maxStack: 3, category: 'passive' },
    { id: 'acid_rain', name: 'Acid Rain', desc: 'Spit arcs upward and rains acid in an area', icon: 'explode', maxStack: 2, category: 'wand' },
    { id: 'hive_mind', name: 'Hive Mind', desc: 'Can maintain 2 split clones simultaneously', icon: 'orbit', maxStack: 1, category: 'passive' },
];

// Skeleton upgrade pool (11 upgrades — split: bone sniper vs tank brawler, with combo synergies)
const SKELETON_UPGRADE_POOL = [
    // === Bone Sniper path ===
    { id: 'bone_barrage', name: 'Bone Barrage', desc: 'Throw 2 bones simultaneously', icon: 'split', maxStack: 3, category: 'wand' },
    { id: 'bone_boomerang', name: 'Bone Boomerang', desc: 'Thrown bones return to you', icon: 'bounce', maxStack: 1, category: 'wand' },
    { id: 'marrow_leech', name: 'Marrow Leech', desc: 'Bone hits steal a small amount of HP', icon: 'thorns', maxStack: 3, category: 'wand' },
    { id: 'shrapnel_shield', name: 'Shrapnel Shield', desc: 'Shield bash sends bone fragments outward', icon: 'explode', maxStack: 2, category: 'wand' },
    // === Tank Brawler path ===
    { id: 'calcium_fort', name: 'Calcium Fortification', desc: '+15% max HP and shield durability', icon: 'big', maxStack: 4, category: 'passive' },
    { id: 'undying_resolve', name: 'Undying Resolve', desc: 'Survive a lethal hit once per zone (1 HP)', icon: 'regen', maxStack: 1, category: 'passive' },
    { id: 'war_cry', name: 'War Cry', desc: 'Periodic AoE fear that stuns nearby enemies briefly', icon: 'chain', maxStack: 2, category: 'passive' },
    // === Combo system upgrades ===
    { id: 'relentless', name: 'Relentless', desc: 'Combo timer extended +0.5s per stack', icon: 'speed', maxStack: 3, category: 'passive' },
    { id: 'skull_bash', name: 'Skull Bash', desc: 'Dodge roll through enemies deals damage + builds combo', icon: 'phase', maxStack: 2, category: 'passive' },
    { id: 'bone_storm', name: 'Bone Storm', desc: 'At 10+ combo, auto-fire bones in a circle every 2s', icon: 'orbit', maxStack: 2, category: 'wand' },
    { id: 'quick_recovery', name: 'Quick Recovery', desc: 'Stamina regenerates 30% faster', icon: 'speed', maxStack: 3, category: 'passive' },
];

// Register form handlers for slime and skeleton
formHandlers.slime = {
    update: null,    // set after slime update is defined
    draw: null,      // set after slime draw is defined
    drawHUD: null,   // set after slime HUD is defined
    onPrimaryAttack: null,
    onSecondaryAbility: null,
    onDodge: null,
    onInteract: null,
    getUpgradePool: () => SLIME_UPGRADE_POOL,
};
formHandlers.skeleton = {
    update: null,
    draw: null,
    drawHUD: null,
    onPrimaryAttack: null,
    onSecondaryAbility: null,
    onDodge: null,
    onInteract: null,
    getUpgradePool: () => SKELETON_UPGRADE_POOL,
};

// Lich upgrade pool (11 upgrades — split: necromancer build vs soul caster build)
const LICH_UPGRADE_POOL = [
    // === Soul Caster path ===
    { id: 'soul_siphon', name: 'Soul Siphon', desc: 'Kills generate +30% more soul energy', icon: 'mana', maxStack: 4, category: 'passive' },
    { id: 'necrotic_blast', name: 'Necrotic Blast', desc: 'Soul bolts explode on final hit for 40% AoE', icon: 'explode', maxStack: 2, category: 'wand' },
    { id: 'dark_pact', name: 'Dark Pact', desc: 'Soul bolts cost 5 energy but deal +50% damage', icon: 'thorns', maxStack: 1, category: 'wand' },
    { id: 'ethereal_form', name: 'Ethereal Form', desc: 'Above 80 soul: take 25% less damage', icon: 'phase', maxStack: 2, category: 'passive' },
    // === Necromancer path ===
    { id: 'army_dead', name: 'Army of the Dead', desc: 'Raise up to +1 undead minion simultaneously', icon: 'split', maxStack: 3, category: 'passive' },
    { id: 'plague_bearer', name: 'Plague Bearer', desc: 'Undead explode on death, dealing AoE damage', icon: 'explode', maxStack: 2, category: 'passive' },
    { id: 'corpse_explosion', name: 'Corpse Explosion', desc: 'Detonate corpses for massive AoE on harvest', icon: 'explode', maxStack: 2, category: 'wand' },
    // === Universal ===
    { id: 'spectral_cloak', name: 'Spectral Cloak', desc: 'Brief invisibility after shadow step', icon: 'phase', maxStack: 2, category: 'passive' },
    { id: 'death_aura', name: 'Death Aura', desc: 'Passive damage to nearby enemies (scales with soul energy)', icon: 'orbit', maxStack: 3, category: 'passive' },
    { id: 'phylactery', name: 'Phylactery', desc: 'On death, revive at 30% HP once per zone', icon: 'regen', maxStack: 1, category: 'passive' },
    { id: 'soul_overflow', name: 'Soul Overflow', desc: 'Excess soul energy above 80 converts to HP regen', icon: 'regen', maxStack: 3, category: 'passive' },
];

formHandlers.lich = {
    update: null,
    draw: null,
    drawHUD: null,
    onPrimaryAttack: null,
    onSecondaryAbility: null,
    onDodge: null,
    onInteract: null,
    getUpgradePool: () => LICH_UPGRADE_POOL,
};

// Helper: get current form config value with fallback
function getFormStat(key) {
    const config = FormSystem.getFormConfig();
    return config ? config[key] : null;
}

// Talisman passive bonuses — scale with talisman level (increases on evolution)
function getTalismanBonus() {
    if (!FormSystem.talisman.found) return { dmgMult: 1, speedMult: 1, xpMult: 1, hpBonus: 0 };
    const lvl = FormSystem.talisman.level;
    return {
        dmgMult: 1 + (lvl - 1) * 0.08,    // +8% damage per level
        speedMult: 1 + (lvl - 1) * 0.04,   // +4% move speed per level
        xpMult: 1 + (lvl - 1) * 0.10,      // +10% XP per level
        hpBonus: (lvl - 1) * 5,             // +5 max HP per level
    };
}
