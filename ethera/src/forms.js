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
        slime:    { unlocked: true, absorbed: 0, maxSizeReached: 0, totalKills: 0, bossDefeated: false },
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
    // NOTE: Wizard form uses the FormSystem config values below but its update/draw/ability
    // handlers are still defined in gameloop.js (legacy). They should eventually be extracted
    // into a dedicated wizard.js module to match slime.js / skeleton.js / lich.js.
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
        manaCost: 6,
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
        hasEquipment: true,
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

// Form handler registry — each form registers its update/draw/ability functions.
// Wizard handlers are wired up at the end of gameloop.js after its functions are defined.
// Slime/Skeleton/Lich handlers are wired up in their respective modules.
const formHandlers = {
    wizard: {
        update: null,            // → updatePlayer (movement.js)
        draw: null,              // → drawWizard (rendering.js)
        drawGhost: null,         // → occlusion ghost (rendering.js)
        drawHUD: null,           // → drawHPMana (ui.js)
        onPrimaryAttack: null,   // → attack code (gameloop.js)
        onSecondaryAbility: null, // → summon tower
        onDodge: null,           // → phase jump
        onInteract: null,        // → E key
        getUpgradePool: () => WIZARD_UPGRADE_POOL,
    },
};

// Wizard upgrade pool — split: pyromancer vs arcane tactician, with tower synergies
// Tier: 'normal' (level 1+), 'rare' (level 5+), 'legendary' (level 10+)
const WIZARD_UPGRADE_POOL = [
    // === Pyromancer path ===
    { id: 'multishot', name: 'Split Bolt', desc: 'Fire +1 additional fireball per shot', icon: 'split', maxStack: 4, category: 'wand', tier: 'normal' },
    { id: 'pierce', name: 'Piercing Flame', desc: 'Fireballs pierce through +1 enemy', icon: 'pierce', maxStack: 5, category: 'wand', tier: 'normal' },
    { id: 'explode', name: 'Detonation', desc: 'Fireballs explode on impact, dealing 40% dmg in area', icon: 'explode', maxStack: 3, category: 'wand', tier: 'rare' },
    { id: 'firerate', name: 'Rapid Cast', desc: 'Attack 15% faster', icon: 'speed', maxStack: 5, category: 'wand', tier: 'normal' },
    { id: 'bigshot', name: 'Emberstorm', desc: 'Fireballs are 25% larger and deal +5 damage', icon: 'big', maxStack: 3, category: 'wand', tier: 'normal' },
    { id: 'bounce', name: 'Ricochet', desc: 'Fireballs bounce off walls once', icon: 'bounce', maxStack: 3, category: 'wand', tier: 'normal' },
    // === Arcane Mastery path ===
    { id: 'orbit', name: 'Arcane Orbit', desc: '+1 fireball orbits around you, damaging enemies', icon: 'orbit', maxStack: 4, category: 'passive', tier: 'rare' },
    { id: 'thorns', name: 'Thorns of Flame', desc: 'Enemies that hit you take 15 fire damage', icon: 'thorns', maxStack: 3, category: 'passive', tier: 'normal' },
    { id: 'regen', name: 'Siphon Life', desc: 'Regen 2 HP per kill', icon: 'regen', maxStack: 3, category: 'passive', tier: 'normal' },
    { id: 'manasurge', name: 'Mana Surge', desc: '+25% mana regeneration', icon: 'mana', maxStack: 4, category: 'passive', tier: 'normal' },
    { id: 'dodge_reset', name: 'Phase Flux', desc: 'Kills have 15% chance to reset dodge cooldown', icon: 'phase', maxStack: 3, category: 'passive', tier: 'normal' },
    // === Tower Synergies (wizard-exclusive) ===
    { id: 'tower_extra', name: 'Twin Summon', desc: '+1 maximum active tower', icon: 'tower', maxStack: 2, category: 'tower', tier: 'rare' },
    { id: 'tower_chain', name: 'Chain Lightning', desc: 'Tower bolts chain to 1 nearby enemy for 50% damage', icon: 'chain', maxStack: 3, category: 'tower', tier: 'rare' },
    { id: 'tower_slow', name: 'Frost Obelisk', desc: 'Tower shots slow enemies by 30% for 2s', icon: 'slow', maxStack: 2, category: 'tower', tier: 'normal' },
    // === Wizard-exclusive upgrades ===
    { id: 'arcane_efficiency', name: 'Arcane Efficiency', desc: 'Fireball mana cost reduced by 15%', icon: 'mana', maxStack: 4, category: 'passive', tier: 'normal' },
    { id: 'spell_echo', name: 'Spell Echo', desc: '20% chance to fire a second fireball at no mana cost', icon: 'split', maxStack: 3, category: 'wand', tier: 'rare' },
    { id: 'tower_mastery', name: 'Tower Mastery', desc: 'Towers deal +20% damage and last 25% longer', icon: 'tower', maxStack: 3, category: 'tower', tier: 'rare' },
    { id: 'mana_shield', name: 'Mana Shield', desc: 'While above 50% mana, take 15% less damage', icon: 'phase', maxStack: 2, category: 'passive', tier: 'normal' },
    // === Legendary (level 10+) ===
    { id: 'inferno_mode', name: 'Inferno Mode', desc: 'All fireballs become explosive + piercing. -20% max HP.', icon: 'explode', maxStack: 1, category: 'wand', tier: 'legendary' },
    { id: 'arcane_singularity', name: 'Arcane Singularity', desc: 'Tower attacks pull enemies inward. Tower range +50%.', icon: 'tower', maxStack: 1, category: 'tower', tier: 'legendary' },
];

// Slime upgrade pool
// Tier: 'normal' (level 1+), 'rare' (level 5+), 'legendary' (level 10+)
const SLIME_UPGRADE_POOL = [
    // === Acid Control path ===
    { id: 'acid_potency', name: 'Acid Potency', desc: 'Acid spit deals +25% damage and leaves larger puddles', icon: 'explode', maxStack: 4, category: 'wand', tier: 'normal' },
    { id: 'acid_rain', name: 'Acid Rain', desc: 'Spit arcs upward and rains acid in an area', icon: 'explode', maxStack: 2, category: 'wand', tier: 'rare' },
    { id: 'corrosive_linger', name: 'Corrosive Linger', desc: 'Acid hits leave a DOT that ticks 3 times (+1 per stack)', icon: 'thorns', maxStack: 3, category: 'wand', tier: 'normal' },
    { id: 'ricochet_spit', name: 'Ricochet Spit', desc: 'Acid projectiles bounce to 1 nearby enemy on hit', icon: 'bounce', maxStack: 2, category: 'wand', tier: 'rare' },
    { id: 'ooze_trail', name: 'Ooze Trail', desc: 'Leave a damaging acid trail when moving at size 3+', icon: 'thorns', maxStack: 2, category: 'passive', tier: 'normal' },
    // === Clone Army path ===
    { id: 'rapid_mitosis', name: 'Rapid Mitosis', desc: 'Split clones last longer and explode harder', icon: 'split', maxStack: 3, category: 'passive', tier: 'normal' },
    { id: 'hive_mind', name: 'Hive Mind', desc: 'Can maintain 2 split clones simultaneously', icon: 'orbit', maxStack: 1, category: 'passive', tier: 'rare' },
    { id: 'sympathetic_link', name: 'Sympathetic Link', desc: 'Heal for 5% of clone damage dealt per stack', icon: 'regen', maxStack: 2, category: 'passive', tier: 'normal' },
    // === Big Slime Brawler path ===
    { id: 'iron_stomach', name: 'Iron Stomach', desc: 'Absorb faster and gain +1 size per absorb', icon: 'big', maxStack: 3, category: 'passive', tier: 'normal' },
    { id: 'elastic_body', name: 'Elastic Body', desc: 'Bounce higher and deal +30% landing damage', icon: 'bounce', maxStack: 3, category: 'passive', tier: 'normal' },
    { id: 'regen_gel', name: 'Regenerative Gel', desc: 'Passive HP regen that scales with size', icon: 'regen', maxStack: 3, category: 'passive', tier: 'normal' },
    { id: 'osmosis', name: 'Osmosis', desc: 'Passively drain HP from nearby enemies, scaling with size', icon: 'mana', maxStack: 3, category: 'passive', tier: 'rare' },
    { id: 'volatile_mass', name: 'Volatile Mass', desc: 'Big hits make you shed size in an acid explosion', icon: 'explode', maxStack: 2, category: 'passive', tier: 'rare' },
    { id: 'sticky_landing', name: 'Sticky Landing', desc: 'Bounce landing creates a slow field for 2s', icon: 'slow', maxStack: 2, category: 'passive', tier: 'normal' },
    { id: 'membrane', name: 'Membrane', desc: 'Gain a shield equal to 10% max HP every 8s (-1s per stack)', icon: 'phase', maxStack: 3, category: 'passive', tier: 'normal' },
    // === Legendary (level 10+) ===
    { id: 'mitotic_bloom', name: 'Mitotic Bloom', desc: 'Clones also split on death, cascading into mini-clones.', icon: 'split', maxStack: 1, category: 'passive', tier: 'legendary' },
    { id: 'acid_tsunami', name: 'Acid Tsunami', desc: 'Acid spit becomes a wide wave that pierces all enemies.', icon: 'explode', maxStack: 1, category: 'wand', tier: 'legendary' },
];

// Skeleton upgrade pool — split: bone sniper vs tank brawler, with combo synergies
// Tier: 'normal' (level 1+), 'rare' (level 5+), 'legendary' (level 10+)
const SKELETON_UPGRADE_POOL = [
    // === Bone Sniper path ===
    { id: 'bone_barrage', name: 'Bone Barrage', desc: 'Throw 2 bones simultaneously', icon: 'split', maxStack: 3, category: 'wand', tier: 'normal' },
    { id: 'bone_boomerang', name: 'Bone Boomerang', desc: 'Thrown bones return to you', icon: 'bounce', maxStack: 1, category: 'wand', tier: 'rare' },
    { id: 'marrow_leech', name: 'Marrow Leech', desc: 'Bone hits steal a small amount of HP', icon: 'thorns', maxStack: 3, category: 'wand', tier: 'normal' },
    { id: 'shrapnel_shield', name: 'Shrapnel Shield', desc: 'Shield bash sends bone fragments outward', icon: 'explode', maxStack: 2, category: 'wand', tier: 'rare' },
    // === Tank Brawler path ===
    { id: 'calcium_fort', name: 'Calcium Fortification', desc: '+15% max HP and shield durability', icon: 'big', maxStack: 4, category: 'passive', tier: 'normal' },
    { id: 'undying_resolve', name: 'Undying Resolve', desc: 'Survive a lethal hit once per zone (1 HP)', icon: 'regen', maxStack: 1, category: 'passive', tier: 'rare' },
    { id: 'war_cry', name: 'War Cry', desc: 'Periodic AoE fear that stuns nearby enemies briefly', icon: 'chain', maxStack: 2, category: 'passive', tier: 'normal' },
    // === Combo system upgrades ===
    { id: 'relentless', name: 'Relentless', desc: 'Combo timer extended +0.5s per stack', icon: 'speed', maxStack: 3, category: 'passive', tier: 'normal' },
    { id: 'skull_bash', name: 'Skull Bash', desc: 'Dodge roll through enemies deals damage + builds combo', icon: 'phase', maxStack: 2, category: 'passive', tier: 'normal' },
    { id: 'bone_storm', name: 'Bone Storm', desc: 'At 10+ combo, auto-fire bones in a circle every 2s', icon: 'orbit', maxStack: 2, category: 'wand', tier: 'rare' },
    { id: 'quick_recovery', name: 'Quick Recovery', desc: 'Stamina regenerates 30% faster', icon: 'speed', maxStack: 3, category: 'passive', tier: 'normal' },
    // === Legendary (level 10+) ===
    { id: 'bone_fortress', name: 'Bone Fortress', desc: 'Shield blocks 100% damage for 0.5s on perfect timing.', icon: 'big', maxStack: 1, category: 'passive', tier: 'legendary' },
    { id: 'rattling_charge', name: 'Rattling Charge', desc: 'Dodge becomes a charge that stuns enemies in path for 1s.', icon: 'phase', maxStack: 1, category: 'passive', tier: 'legendary' },
];

// Register form handlers for slime and skeleton
formHandlers.slime = {
    update: null,    // set after slime update is defined
    draw: null,      // set after slime draw is defined
    drawGhost: null, // set after slime draw is defined
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
    drawGhost: null, // set after skeleton draw is defined
    drawHUD: null,
    onPrimaryAttack: null,
    onSecondaryAbility: null,
    onDodge: null,
    onInteract: null,
    getUpgradePool: () => SKELETON_UPGRADE_POOL,
};

// Lich upgrade pool — split: necromancer build vs soul caster build
// Tier: 'normal' (level 1+), 'rare' (level 5+), 'legendary' (level 10+)
const LICH_UPGRADE_POOL = [
    // === Soul Caster path ===
    { id: 'soul_siphon', name: 'Soul Siphon', desc: 'Kills generate +30% more soul energy', icon: 'mana', maxStack: 4, category: 'passive', tier: 'normal' },
    { id: 'necrotic_blast', name: 'Necrotic Blast', desc: 'Soul bolts explode on final hit for 40% AoE', icon: 'explode', maxStack: 2, category: 'wand', tier: 'rare' },
    { id: 'dark_pact', name: 'Dark Pact', desc: 'Soul bolts cost 5 energy but deal +50% damage', icon: 'thorns', maxStack: 1, category: 'wand', tier: 'rare' },
    { id: 'ethereal_form', name: 'Ethereal Form', desc: 'Above 80 soul: take 25% less damage', icon: 'phase', maxStack: 2, category: 'passive', tier: 'rare' },
    // === Necromancer path ===
    { id: 'army_dead', name: 'Army of the Dead', desc: 'Raise up to +1 undead minion simultaneously', icon: 'split', maxStack: 3, category: 'passive', tier: 'normal' },
    { id: 'plague_bearer', name: 'Plague Bearer', desc: 'Undead explode on death, dealing AoE damage', icon: 'explode', maxStack: 2, category: 'passive', tier: 'normal' },
    { id: 'corpse_explosion', name: 'Corpse Explosion', desc: 'Detonate corpses for massive AoE on harvest', icon: 'explode', maxStack: 2, category: 'wand', tier: 'normal' },
    // === Universal ===
    { id: 'spectral_cloak', name: 'Spectral Cloak', desc: 'Brief invisibility after shadow step', icon: 'phase', maxStack: 2, category: 'passive', tier: 'normal' },
    { id: 'death_aura', name: 'Death Aura', desc: 'Passive damage to nearby enemies (scales with soul energy)', icon: 'orbit', maxStack: 3, category: 'passive', tier: 'normal' },
    { id: 'phylactery', name: 'Phylactery', desc: 'On death, revive at 30% HP once per zone', icon: 'regen', maxStack: 1, category: 'passive', tier: 'rare' },
    { id: 'soul_overflow', name: 'Soul Overflow', desc: 'Excess soul energy above 80 converts to HP regen', icon: 'regen', maxStack: 3, category: 'passive', tier: 'normal' },
    // === Legendary (level 10+) ===
    { id: 'undead_legion', name: 'Undead Legion', desc: '+3 max minions, but they decay over 15s.', icon: 'split', maxStack: 1, category: 'passive', tier: 'legendary' },
    { id: 'soul_nova', name: 'Soul Nova', desc: 'At max soul energy, release a nova dealing 200% damage to all nearby.', icon: 'orbit', maxStack: 1, category: 'wand', tier: 'legendary' },
];

formHandlers.lich = {
    update: null,
    draw: null,
    drawGhost: null, // set after lich draw is defined
    drawHUD: null,
    onPrimaryAttack: null,
    onSecondaryAbility: null,
    onDodge: null,
    onInteract: null,
    getUpgradePool: () => LICH_UPGRADE_POOL,
};

// Talisman perk definitions — one unlocked per evolution (levels 2-4)
const TALISMAN_PERKS = [
    { id: 'bone_memory', name: 'Bone Memory', desc: '+10% XP gain', level: 2, effect: { xpMult: 1.10 } },
    { id: 'arcane_resonance', name: 'Arcane Resonance', desc: 'Mana regen +20%', level: 3, effect: { manaRegenMult: 1.20 } },
    { id: 'death_embrace', name: "Death's Embrace", desc: '+20 max HP, +15% damage', level: 4, effect: { hpBonus: 20, dmgMult: 1.15 } },
];

// Aggregate bonuses from all unlocked talisman perks
FormSystem.getTalismanBonuses = function() {
    const bonuses = { xpMult: 1, manaRegenMult: 1, dmgMult: 1, hpBonus: 0 };
    for (const perk of this.talisman.perks) {
        if (perk.effect.xpMult) bonuses.xpMult *= perk.effect.xpMult;
        if (perk.effect.manaRegenMult) bonuses.manaRegenMult *= perk.effect.manaRegenMult;
        if (perk.effect.dmgMult) bonuses.dmgMult *= perk.effect.dmgMult;
        if (perk.effect.hpBonus) bonuses.hpBonus += perk.effect.hpBonus;
    }
    return bonuses;
};

// Helper: get current form config value with fallback
function getFormStat(key) {
    const config = FormSystem.getFormConfig();
    return config ? config[key] : null;
}

// Talisman passive bonuses — scale with talisman level (increases on evolution, not during gameplay)
// Talisman XP does not change during normal play; bonuses only update when the player evolves
// and talisman.level is incremented. This is intentional per design.
// Perk bonuses from TALISMAN_PERKS are folded in so all existing call sites benefit automatically.
function getTalismanBonus() {
    if (!FormSystem.talisman.found) return { dmgMult: 1, speedMult: 1, xpMult: 1, manaRegenMult: 1, hpBonus: 0 };
    const lvl = FormSystem.talisman.level;
    const surge = (typeof getEvolutionSurgeBonus === 'function') ? getEvolutionSurgeBonus() : { dmgMult: 1, speedMult: 1 };
    const perks = FormSystem.getTalismanBonuses();
    return {
        dmgMult: (1 + (lvl - 1) * 0.08) * surge.dmgMult * perks.dmgMult,
        speedMult: (1 + (lvl - 1) * 0.04) * surge.speedMult,
        xpMult: (1 + (lvl - 1) * 0.10) * perks.xpMult,
        manaRegenMult: perks.manaRegenMult,
        hpBonus: (lvl - 1) * 5 + perks.hpBonus,
        surgeActive: surge.dmgMult > 1,
    };
}
