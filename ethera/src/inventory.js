// ============================================================
//  INVENTORY & EQUIPMENT SYSTEM
// ============================================================

// Equipment slot types
const SLOT_WAND = 'wand';
const SLOT_ROBE = 'robe';
const SLOT_AMULET = 'amulet';
const SLOT_RING = 'ring';
const EQUIP_SLOTS = [SLOT_WAND, SLOT_ROBE, SLOT_AMULET, SLOT_RING];

const SLOT_LABELS = {
    wand: 'Wand', robe: 'Robe', amulet: 'Amulet', ring: 'Ring',
};
const SLOT_ICONS = {
    wand: '\u2726',    // ✦
    robe: '\u2660',    // ♠ (shield-like)
    amulet: '\u25C6',  // ◆
    ring: '\u25CB',    // ○
};

// Rarity tiers
const RARITY = {
    common:    { color: '#a0a0a0', glow: 'rgba(160,160,160,0.3)', label: 'Common',    mult: 1.0 },
    uncommon:  { color: '#5dcc5d', glow: 'rgba(80,200,80,0.3)',   label: 'Uncommon',  mult: 1.4 },
    rare:      { color: '#5588ee', glow: 'rgba(80,130,240,0.3)',  label: 'Rare',      mult: 1.9 },
    epic:      { color: '#bb55ee', glow: 'rgba(180,80,240,0.3)',  label: 'Epic',      mult: 2.6 },
    legendary: { color: '#ffaa00', glow: 'rgba(255,170,0,0.3)',   label: 'Legendary', mult: 3.5 },
};

// Stat definitions — each has a display name and format function
const STAT_DEFS = {
    dmgBonus:      { label: 'Fireball Damage',  fmt: v => `+${v}` },
    atkSpeedMult:  { label: 'Attack Speed',      fmt: v => `+${Math.round(v * 100)}%` },
    manaCostReduc: { label: 'Mana Cost',         fmt: v => `-${v}` },
    maxHpBonus:    { label: 'Max HP',             fmt: v => `+${v}` },
    dmgReduc:      { label: 'Damage Reduction',   fmt: v => `-${Math.round(v * 100)}%` },
    manaRegenMult: { label: 'Mana Regen',         fmt: v => `+${Math.round(v * 100)}%` },
    moveSpeedMult: { label: 'Move Speed',         fmt: v => `+${Math.round(v * 100)}%` },
    dodgeCdReduc:  { label: 'Phase Jump CD',      fmt: v => `-${(v).toFixed(1)}s` },
    towerDmgBonus: { label: 'Tower Damage',       fmt: v => `+${v}` },
    towerRangeAdd: { label: 'Tower Range',        fmt: v => `+${v.toFixed(1)}` },
    maxManaBonus:  { label: 'Max Mana',            fmt: v => `+${v}` },
};

// Item templates per slot — each defines possible stat pools and name parts
const ITEM_POOL = {
    wand: [
        { name: 'Smoldering Wand',      stats: { dmgBonus: [3, 6, 10, 16] } },
        { name: 'Flickering Scepter',    stats: { dmgBonus: [2, 4, 7, 12], atkSpeedMult: [0.05, 0.08, 0.12, 0.18] } },
        { name: 'Channeler\'s Rod',      stats: { manaCostReduc: [1, 2, 3, 4], dmgBonus: [1, 3, 5, 8] } },
        { name: 'Ashen Staff',           stats: { dmgBonus: [4, 8, 13, 20], manaCostReduc: [0, 0, 1, 2] } },
        { name: 'Ember Catalyst',        stats: { atkSpeedMult: [0.06, 0.10, 0.16, 0.22], dmgBonus: [1, 2, 4, 6] } },
    ],
    robe: [
        { name: 'Tattered Vestments',    stats: { maxHpBonus: [10, 18, 28, 40] } },
        { name: 'Warded Cloak',          stats: { maxHpBonus: [5, 10, 16, 24], dmgReduc: [0.03, 0.06, 0.10, 0.15] } },
        { name: 'Flowing Silks',         stats: { manaRegenMult: [0.08, 0.15, 0.22, 0.32], maxHpBonus: [3, 6, 10, 16] } },
        { name: 'Dungeon Mail',          stats: { maxHpBonus: [12, 22, 34, 48], dmgReduc: [0.02, 0.04, 0.07, 0.11] } },
        { name: 'Arcane Mantle',         stats: { maxManaBonus: [8, 15, 24, 35], manaRegenMult: [0.05, 0.10, 0.16, 0.24] } },
    ],
    amulet: [
        { name: 'Dull Pendant',          stats: { moveSpeedMult: [0.04, 0.08, 0.12, 0.18] } },
        { name: 'Charred Talisman',      stats: { dmgBonus: [2, 4, 6, 10], towerDmgBonus: [2, 4, 7, 11] } },
        { name: 'Whispering Locket',     stats: { manaRegenMult: [0.06, 0.12, 0.18, 0.26], dodgeCdReduc: [0.05, 0.10, 0.15, 0.22] } },
        { name: 'Obelisk Shard',         stats: { towerDmgBonus: [3, 6, 10, 16], towerRangeAdd: [0.3, 0.5, 0.8, 1.2] } },
        { name: 'Seer\'s Eye',           stats: { maxManaBonus: [5, 10, 16, 24], dmgBonus: [1, 3, 5, 8] } },
    ],
    ring: [
        { name: 'Cracked Band',          stats: { maxHpBonus: [4, 8, 14, 22] } },
        { name: 'Signet of Haste',       stats: { atkSpeedMult: [0.04, 0.07, 0.11, 0.16], moveSpeedMult: [0.02, 0.04, 0.06, 0.10] } },
        { name: 'Ember Ring',            stats: { dmgBonus: [1, 3, 5, 8], manaCostReduc: [1, 1, 2, 3] } },
        { name: 'Band of Warding',       stats: { dmgReduc: [0.02, 0.04, 0.07, 0.11], maxHpBonus: [3, 6, 10, 16] } },
        { name: 'Phase Loop',            stats: { dodgeCdReduc: [0.06, 0.10, 0.16, 0.24], moveSpeedMult: [0.02, 0.04, 0.06, 0.09] } },
    ],
};

// Legendary item templates — fixed unique items with passive effects
const LEGENDARY_POOL = {
    wand: {
        name: 'Ember of Creation',
        stats: { dmgBonus: 15, atkSpeedMult: 0.10 },
        effect: { id: 'burn_ground', chance: 0.20, dmg: 3, duration: 2 },
        effectDesc: 'Fireballs have 20% chance to leave burning ground (3 DPS, 2s)',
    },
    robe: {
        name: 'Veil of the Undying',
        stats: { maxHpBonus: 35, dmgReduc: 0.12 },
        effect: { id: 'veil_undying', hpRestore: 0.15, cooldown: 60 },
        effectDesc: 'Survive lethal damage once per zone (restore 15% HP, 60s cooldown)',
    },
    amulet: {
        name: "Elara's Locket",
        stats: { dmgBonus: 8, manaRegenMult: 0.18 },
        effect: { id: 'elara_locket', dmgPerZone: 0.02 },
        effectDesc: '+2% damage per zone cleared this run',
    },
    ring: {
        name: 'Band of Echoes',
        stats: { atkSpeedMult: 0.08, dmgBonus: 5 },
        effect: { id: 'band_echoes', chance: 0.20 },
        effectDesc: '20% chance to duplicate any projectile fired',
    },
};

// Equipment set bonuses — wearing multiple items from a set grants extra stats
const EQUIP_SETS = {
    infernal: {
        items: ['Ashen Staff', 'Dungeon Mail', 'Charred Talisman', 'Ember Ring'],
        bonus2: { dmgBonus: 8, desc: '+8 Fire Damage' },
        bonus4: { dmgBonus: 16, atkSpeedMult: 0.15, desc: '+16 Damage, +15% Attack Speed' },
    },
    arcane: {
        items: ["Channeler's Rod", 'Arcane Mantle', "Seer's Eye", 'Phase Loop'],
        bonus2: { maxManaBonus: 20, desc: '+20 Max Mana' },
        bonus4: { manaRegenMult: 0.3, manaCostReduc: 0.15, desc: '+30% Mana Regen, -15% Mana Cost' },
    },
    warden: {
        items: ['Smoldering Wand', 'Warded Cloak', 'Obelisk Shard', 'Band of Warding'],
        bonus2: { maxHpBonus: 25, desc: '+25 Max HP' },
        bonus4: { dmgReduc: 0.15, maxHpBonus: 40, desc: '+40 HP, +15% Damage Reduction' },
    },
};

function getActiveSetBonuses() {
    const equipped = [];
    for (const slot of EQUIP_SLOTS) {
        const item = inventory.equipped[slot];
        if (item) equipped.push(item.name);
    }
    const bonuses = {};
    for (const [setId, set] of Object.entries(EQUIP_SETS)) {
        const count = set.items.filter(name => equipped.includes(name)).length;
        if (count >= 4 && set.bonus4) Object.assign(bonuses, set.bonus4);
        else if (count >= 2 && set.bonus2) Object.assign(bonuses, set.bonus2);
    }
    return bonuses;
}

// Rarity name prefixes
const RARITY_PREFIX = {
    common: '',
    uncommon: 'Fine ',
    rare: 'Superior ',
    epic: 'Mythic ',
    legendary: '',
};

// Drop rate config — base chance per enemy kill, rarity weights by wave
const DROP_CHANCE_BASE = 0.06; // 6% chance — slightly generous to make legendary feel exciting
const RARITY_WEIGHTS_BY_WAVE = [
    // Wave 1
    { common: 80, uncommon: 18, rare: 2, epic: 0, legendary: 0 },
    // Wave 2
    { common: 60, uncommon: 30, rare: 9, epic: 1, legendary: 0 },
    // Wave 3
    { common: 40, uncommon: 35, rare: 20, epic: 5, legendary: 0 },
    // Wave 4
    { common: 25, uncommon: 35, rare: 28, epic: 12, legendary: 0 },
    // Wave 5+
    { common: 20, uncommon: 30, rare: 30, epic: 18, legendary: 2 },
];

// Generate a random item
function generateItem(waveIdx) {
    const weights = RARITY_WEIGHTS_BY_WAVE[Math.min(waveIdx, RARITY_WEIGHTS_BY_WAVE.length - 1)];
    const totalW = weights.common + weights.uncommon + weights.rare + weights.epic + (weights.legendary || 0);
    let roll = Math.random() * totalW;
    let rarity = 'common';
    if (roll < (weights.legendary || 0)) rarity = 'legendary';
    else if ((roll -= (weights.legendary || 0)) < weights.epic) rarity = 'epic';
    else if ((roll -= weights.epic) < weights.rare) rarity = 'rare';
    else if ((roll -= weights.rare) < weights.uncommon) rarity = 'uncommon';

    // Skip legendary for non-equipment forms (slime/skeleton can't equip)
    if (rarity === 'legendary') {
        const _formCfg = typeof FormSystem !== 'undefined' ? FormSystem.getFormConfig() : null;
        if (_formCfg && !_formCfg.hasEquipment) rarity = 'epic'; // downgrade to epic
    }

    // Legendary items use fixed unique templates
    if (rarity === 'legendary') {
        const slot = EQUIP_SLOTS[Math.floor(Math.random() * EQUIP_SLOTS.length)];
        const tmpl = LEGENDARY_POOL[slot];
        // Small variance on stats (±5% — legendaries are more consistent)
        const stats = {};
        for (const [stat, val] of Object.entries(tmpl.stats)) {
            const variance = 1 + (Math.random() - 0.5) * 0.1;
            if (typeof val === 'number' && val < 1) {
                stats[stat] = Math.round(val * variance * 100) / 100;
            } else {
                stats[stat] = Math.round(val * variance);
            }
        }
        return {
            id: Date.now() + Math.random(),
            name: tmpl.name,
            slot,
            rarity: 'legendary',
            stats,
            effect: tmpl.effect,
            effectDesc: tmpl.effectDesc,
        };
    }

    const rarityIdx = ['common', 'uncommon', 'rare', 'epic'].indexOf(rarity);

    // Pick a random slot and template
    const slot = EQUIP_SLOTS[Math.floor(Math.random() * EQUIP_SLOTS.length)];
    const templates = ITEM_POOL[slot];
    const tmpl = templates[Math.floor(Math.random() * templates.length)];

    // Build item stats from template at this rarity tier
    const stats = {};
    for (const [stat, tiers] of Object.entries(tmpl.stats)) {
        const base = tiers[rarityIdx];
        // Small random variance ±10%
        const variance = 1 + (Math.random() - 0.5) * 0.2;
        if (typeof base === 'number' && base < 1) {
            stats[stat] = Math.round(base * variance * 100) / 100; // keep 2 decimals for %
        } else {
            stats[stat] = Math.round(base * variance);
        }
    }

    return {
        id: Date.now() + Math.random(),
        name: RARITY_PREFIX[rarity] + tmpl.name,
        slot,
        rarity,
        stats,
    };
}

// Inventory state
const inventory = {
    equipped: { wand: null, robe: null, amulet: null, ring: null },
    backpack: [],  // unequipped items
    maxBackpack: 12,
};

let inventoryOpen = false;
let invSelectedSlot = null;  // which backpack index or equip slot is selected
let invHover = null;         // what the mouse is hovering: {type:'equip'|'backpack'|'drop', idx:number|string}
let invTooltipItem = null;   // item to show tooltip for

// World drops — items sitting on the ground waiting to be picked up
const worldDrops = [];
const PICKUP_RANGE = 1.5; // tiles
const DROP_FLOAT_SPEED = 1.2;

function dropItemInWorld(row, col, item) {
    worldDrops.push({
        row, col, item,
        bobTime: Math.random() * 10,
        spawnTime: 0.5, // fade-in timer
        despawnTimer: 45, // seconds before despawn
    });
}

function tryPickupDrops() {
    for (let i = worldDrops.length - 1; i >= 0; i--) {
        const d = worldDrops[i];
        if (d.spawnTime > 0) continue; // still fading in
        const dr = d.row - player.row;
        const dc = d.col - player.col;
        if (Math.sqrt(dr * dr + dc * dc) < PICKUP_RANGE) {
            if (inventory.backpack.length < inventory.maxBackpack) {
                const pickPos = tileToScreen(d.row, d.col);
                const _cbPickup = (typeof gameSettings !== 'undefined' && gameSettings.colorblindMode === 'symbols' && typeof RARITY_SYMBOLS !== 'undefined' && RARITY_SYMBOLS[d.item.rarity])
                    ? RARITY_SYMBOLS[d.item.rarity].symbol + ' ' : '';
                pickupTexts.push({
                    text: _cbPickup + d.item.name,
                    color: RARITY[d.item.rarity].color,
                    row: d.row, col: d.col,
                    offsetY: 0,
                    life: 1.5,
                });
                inventory.backpack.push(d.item);
                worldDrops.splice(i, 1);
                // Play rare sparkle for rare+ items, normal chime for common/uncommon
                const _isRarePlus = d.item.rarity === 'rare' || d.item.rarity === 'epic' || d.item.rarity === 'legendary';
                if (_isRarePlus && typeof sfxRarePickup === 'function') sfxRarePickup();
                else if (typeof sfxItemPickup === 'function') sfxItemPickup();
            } else {
                // Inventory full — show feedback message
                pickupTexts.push({
                    text: 'Inventory Full!',
                    color: '#ff6b6b',  // red/orange
                    row: player.row, col: player.col,
                    offsetY: 0,
                    life: 1.2,
                });
            }
        }
    }
}

function updateWorldDrops(dt) {
    for (let i = worldDrops.length - 1; i >= 0; i--) {
        const d = worldDrops[i];
        d.bobTime += dt * DROP_FLOAT_SPEED;
        if (d.spawnTime > 0) d.spawnTime -= dt;
        d.despawnTimer = Math.max(0, d.despawnTimer - dt);
        if (d.despawnTimer <= 0) {
            worldDrops.splice(i, 1);
            continue;
        }
        // Auto-loot magnetic pull — after 1s on ground, drift toward player
        if (d.spawnTime <= 0 && d.despawnTimer < 44) {
            const dr = player.row - d.row;
            const dc = player.col - d.col;
            const dist = Math.sqrt(dr * dr + dc * dc);
            if (dist < 2.5 && dist > 0.1 && inventory.backpack.length < inventory.maxBackpack) {
                const pullSpeed = (dist < 1.0 ? 8.0 : 4.0) * dt; // accelerate when close
                d.row += (dr / dist) * pullSpeed;
                d.col += (dc / dist) * pullSpeed;
            }
        }
    }
}

// ============================================================
//  FORM-SPECIFIC FORGE UPGRADES — permanent stat boosts for gold
// ============================================================
const FORGE_UPGRADES = {
    slime: [
        { id: 'slime_hp', name: 'Harden Membrane', desc: '+8 Max HP', stat: 'maxHp', value: 8, baseCost: 50, costScale: 1.5, max: 5 },
        { id: 'slime_dmg', name: 'Acidify Core', desc: '+2 Acid Damage', stat: 'dmgBonus', value: 2, baseCost: 75, costScale: 1.5, max: 5 },
        { id: 'slime_size', name: 'Elastic Gel', desc: '+0.2 Starting Size', stat: 'startSize', value: 0.2, baseCost: 100, costScale: 1.5, max: 4 },
    ],
    skeleton: [
        { id: 'skel_dmg', name: 'Reinforce Bones', desc: '+3 Melee Damage', stat: 'dmgBonus', value: 3, baseCost: 50, costScale: 1.5, max: 5 },
        { id: 'skel_hp', name: 'Iron Marrow', desc: '+10 Max HP', stat: 'maxHp', value: 10, baseCost: 75, costScale: 1.5, max: 5 },
        { id: 'skel_shield', name: 'Tempered Shield', desc: '+5 Shield Block', stat: 'shieldBlock', value: 5, baseCost: 100, costScale: 1.5, max: 4 },
    ],
};

// Tracks purchased forge upgrade levels per form
let forgeUpgrades = {
    slime_hp: 0, slime_dmg: 0, slime_size: 0,
    skel_dmg: 0, skel_hp: 0, skel_shield: 0,
};

function getForgeUpgradeCost(upgrade) {
    const level = forgeUpgrades[upgrade.id] || 0;
    return Math.round(upgrade.baseCost * Math.pow(upgrade.costScale, level));
}

function buyForgeUpgrade(upgrade) {
    const level = forgeUpgrades[upgrade.id] || 0;
    if (level >= upgrade.max) return { success: false, reason: 'Max level reached' };
    const cost = getForgeUpgradeCost(upgrade);
    if (typeof playerGold === 'undefined' || playerGold < cost) return { success: false, reason: 'Not enough gold (' + cost + 'g)' };
    playerGold -= cost;
    forgeUpgrades[upgrade.id] = level + 1;
    return { success: true, cost: cost, newLevel: level + 1 };
}

// Get total forge bonus for a stat across all purchased upgrades
function getForgeBonus(stat) {
    let total = 0;
    for (const [formId, upgrades] of Object.entries(FORGE_UPGRADES)) {
        for (const u of upgrades) {
            if (u.stat === stat) total += (forgeUpgrades[u.id] || 0) * u.value;
        }
    }
    return total;
}

// ============================================================
//  ENCHANTMENT SYSTEM — Garrett's Forge (equipment forms only)
// ============================================================
const ENCHANT_MAX = { common: 1, uncommon: 2, rare: 3, epic: 4, legendary: 5 };
const ENCHANT_COST = { common: 50, uncommon: 100, rare: 200, epic: 350, legendary: 500 };

function getEnchantCost(item) {
    const currentLvl = item.enchantLevel || 0;
    const baseCost = ENCHANT_COST[item.rarity] || 50;
    return baseCost * (currentLvl + 1);
}

function getEnchantMax(item) {
    return ENCHANT_MAX[item.rarity] || 1;
}

function enchantItem(item) {
    const maxLvl = getEnchantMax(item);
    const currentLvl = item.enchantLevel || 0;
    if (currentLvl >= maxLvl) return { success: false, reason: 'Max enchantment reached' };
    const cost = getEnchantCost(item);
    if (typeof playerGold === 'undefined' || playerGold < cost) return { success: false, reason: 'Not enough gold (' + cost + 'g needed)' };
    playerGold -= cost;
    item.enchantLevel = currentLvl + 1;
    // Boost all numeric stats by 15% per enchant (compounding from current values)
    const boosted = {};
    for (const [stat, val] of Object.entries(item.stats)) {
        if (typeof val === 'number') {
            const oldVal = val;
            if (val < 1 && val > 0) {
                item.stats[stat] = Math.round(val * 1.15 * 100) / 100;
            } else {
                item.stats[stat] = Math.round(val * 1.15);
            }
            boosted[stat] = { from: oldVal, to: item.stats[stat] };
        }
    }
    // Recalculate equipment bonuses immediately
    if (typeof getEquipBonuses === 'function') {
        equipBonus = getEquipBonuses();
    }
    return { success: true, cost: cost, newLevel: item.enchantLevel, boosted: boosted };
}

// ============================================================
//  POTION SYSTEM — Senna's Alchemy
// ============================================================
const POTIONS = {
    health_vial:    { name: 'Health Vial',    cost: 50,  max: 3, desc: 'Restores 30 HP',                   effect: { type: 'heal',        value: 30 } },
    mana_elixir:    { name: 'Mana Elixir',    cost: 50,  max: 2, desc: 'Restores 40 Mana',                 effect: { type: 'mana',        value: 40 } },
    fortitude_salt: { name: 'Fortitude Salt',  cost: 75,  max: 1, desc: '+15% dmg reduction for 1 zone',    effect: { type: 'buff_dmgReduc', value: 0.15, duration: 'zone' } },
};
let playerPotions = { health_vial: 0, mana_elixir: 0, fortitude_salt: 0 };

// Active potion buffs
let activePotionBuffs = {};  // { dmgReduc: { value: 0.15, duration: 'zone' } }

function buyPotion(potionId) {
    const pot = POTIONS[potionId];
    if (!pot) return { success: false, reason: 'Unknown potion' };
    if (playerPotions[potionId] >= pot.max) return { success: false, reason: 'Already at max (' + pot.max + ')' };
    if (typeof playerGold === 'undefined' || playerGold < pot.cost) return { success: false, reason: 'Not enough gold (' + pot.cost + 'g needed)' };
    playerGold -= pot.cost;
    playerPotions[potionId]++;
    return { success: true };
}

function usePotion(potionId) {
    if (playerPotions[potionId] <= 0) return false;
    const pot = POTIONS[potionId];
    if (!pot) return false;
    playerPotions[potionId]--;
    const eff = pot.effect;
    if (eff.type === 'heal') {
        const maxHp = typeof MAX_HP !== 'undefined' ? MAX_HP + (equipBonus.maxHpBonus || 0) : 100;
        const oldHp = player.hp;
        player.hp = Math.min(maxHp, player.hp + eff.value);
        const healed = Math.round(player.hp - oldHp);
        if (healed > 0) {
            pickupTexts.push({ text: '+' + healed + ' HP', color: COLORS.HEAL_GREEN, row: player.row, col: player.col, offsetY: 0, life: 1.5 });
        }
    } else if (eff.type === 'mana') {
        const maxMana = typeof MAX_MANA !== 'undefined' ? MAX_MANA + (equipBonus.maxManaBonus || 0) : 100;
        const oldMana = player.mana;
        player.mana = Math.min(maxMana, player.mana + eff.value);
        const restored = Math.round(player.mana - oldMana);
        if (restored > 0) {
            pickupTexts.push({ text: '+' + restored + ' Mana', color: COLORS.MANA_BLUE, row: player.row, col: player.col, offsetY: 0, life: 1.5 });
        }
    } else if (eff.type === 'buff_dmgReduc') {
        activePotionBuffs.dmgReduc = { value: eff.value, duration: eff.duration };
        pickupTexts.push({ text: 'Fortitude!', color: '#ffcc44', row: player.row, col: player.col, offsetY: 0, life: 2.0 });
    }
    if (typeof sfxPotionUse === 'function') sfxPotionUse();
    else if (typeof sfxItemPickup === 'function') sfxItemPickup();
    return true;
}

function resetPotions() {
    playerPotions = { health_vial: 0, mana_elixir: 0, fortitude_salt: 0 };
    activePotionBuffs = {};
}

function clearPotionBuffsForZone() {
    for (const key of Object.keys(activePotionBuffs)) {
        if (activePotionBuffs[key].duration === 'zone') {
            delete activePotionBuffs[key];
        }
    }
}

function getPotionDmgReduc() {
    return activePotionBuffs.dmgReduc ? activePotionBuffs.dmgReduc.value : 0;
}

// ============================================================
//  AUGMENT SYSTEM — Form-specific loot for Slime and Skeleton
//  Mutations (slime) and Bone Runes (skeleton) drop from combat,
//  equip in 3 generic slots, and feed stats through equipBonus.
// ============================================================
const augmentInventory = {
    equipped: [null, null, null],
    backpack: [],
    maxBackpack: 8,
};

const AUGMENT_LABELS = {
    slime: { tab: 'MUTATIONS', slotPrefix: 'Mutation', icon: '\u2B22' },
    skeleton: { tab: 'BONE RUNES', slotPrefix: 'Rune', icon: '\u2B21' },
};

// --- Slime Mutation Pool ---
const SLIME_AUGMENT_POOL = {
    common: [
        { name: 'Corrosive Membrane', stats: { dmgBonus: [2, 4, 7, 12] }, desc: 'Acidic secretions boost damage' },
        { name: 'Gelatinous Mass', stats: { maxHpBonus: [8, 14, 22, 32] }, desc: 'Denser body absorbs more hits' },
        { name: 'Elastic Core', stats: { moveSpeedMult: [0.04, 0.07, 0.11, 0.16] }, desc: 'Internal tension for faster movement' },
        { name: 'Regenerative Gel', stats: { maxHpBonus: [4, 7, 11, 16] },
          effect: { id: 'regen_gel_aug', healOnAbsorb: 3 }, desc: 'Absorbing corpses heals HP' },
    ],
    rare: [
        { name: 'Toxic Blood', stats: { dmgBonus: [3, 5] },
          effect: { id: 'toxic_blood', poisonDPS: 5, poisonDur: 2.0 }, desc: 'Melee attackers take poison damage' },
        { name: 'Mitotic Vigor', stats: { maxHpBonus: [5, 8] },
          effect: { id: 'mitotic_vigor', cloneDurMult: 1.4, cloneDmgMult: 1.25 }, desc: 'Clones last longer and hit harder' },
        { name: 'Osmotic Shell', stats: { moveSpeedMult: [0.03, 0.06] },
          effect: { id: 'osmotic_shell', absorbRangeMult: 2.0, absorbSpeedBuff: 0.15 }, desc: 'Double absorb range, brief speed on absorb' },
    ],
    epic: [
        { name: 'Volatile Cytoplasm', stats: { dmgBonus: [5, 8] },
          effect: { id: 'volatile_cytoplasm', puddleExplodePct: 0.5 }, desc: 'Acid puddles explode on expiry' },
        { name: 'Adhesive Membrane', stats: { dmgReduc: [0.05, 0.08] },
          effect: { id: 'adhesive_membrane', slowPct: 0.30, slowDur: 1.5 }, desc: 'Melee attackers are slowed' },
    ],
    legendary: [
        { name: 'Primordial Ooze', stats: { dmgBonus: 6, maxHpBonus: 10 },
          effect: { id: 'primordial_ooze', absorbDmgBuff: 0.20, absorbDmgDur: 8.0, absorbHealPct: 0.15 },
          effectDesc: 'Absorbing grants +20% damage for 8s and heals 15% max HP' },
    ],
};

// --- Skeleton Bone Rune Pool ---
const SKELETON_AUGMENT_POOL = {
    common: [
        { name: 'Rune of Fury', stats: { atkSpeedMult: [0.05, 0.08, 0.12, 0.18] }, desc: 'Faster bone throwing speed' },
        { name: 'Rune of Fortitude', stats: { maxHpBonus: [6, 12, 20, 30] }, desc: 'Ancient ward bolsters health' },
        { name: 'Rune of Precision', stats: { dmgBonus: [2, 4, 7, 11] }, desc: 'Sharpened bone strikes' },
        { name: 'Rune of Swiftness', stats: { moveSpeedMult: [0.04, 0.07, 0.11, 0.16] }, desc: 'Lighter bones, faster movement' },
    ],
    rare: [
        { name: 'Rune of the Wall', stats: { dmgReduc: [0.04, 0.07] },
          effect: { id: 'rune_wall', shieldBlockMult: 1.5, bashPushMult: 2.0 }, desc: 'Shield blocks 50% more, bash pushes 2x' },
        { name: 'Rune of Echo', stats: { dmgBonus: [2, 4] },
          effect: { id: 'rune_echo', extraBoneChance: 0.15 }, desc: '15% chance to throw an extra bone' },
        { name: 'Rune of Marrow', stats: { maxHpBonus: [4, 8] },
          effect: { id: 'rune_marrow', boneRegenMult: 1.5, bonePickupHeal: 3 }, desc: 'Faster bone regen, pickups heal' },
    ],
    epic: [
        { name: 'Rune of Frenzy', stats: { atkSpeedMult: [0.06, 0.10] },
          effect: { id: 'rune_frenzy', maxComboAdd: 3, comboDecayMult: 0.80 }, desc: '+3 max combo, slower decay' },
        { name: 'Rune of Shrapnel', stats: { dmgBonus: [4, 7] },
          effect: { id: 'rune_shrapnel', fragmentCount: 3 }, desc: 'Kill shots spray bone fragments' },
    ],
    legendary: [
        { name: 'Rune of the Deathless', stats: { maxHpBonus: 15, dmgReduc: 0.05 },
          effect: { id: 'rune_deathless' },
          effectDesc: 'Undying Resolve recharges between waves' },
    ],
};

const AUGMENT_RARITY_PREFIX = { common: '', uncommon: 'Fine ', rare: 'Greater ', epic: 'Superior ' };

// Generate a random augment for a form
function generateAugment(waveIdx, form) {
    const pool = form === 'slime' ? SLIME_AUGMENT_POOL : SKELETON_AUGMENT_POOL;
    if (!pool) return null;

    const weights = RARITY_WEIGHTS_BY_WAVE[Math.min(waveIdx, RARITY_WEIGHTS_BY_WAVE.length - 1)];
    const totalW = weights.common + weights.uncommon + weights.rare + weights.epic + (weights.legendary || 0);
    let roll = Math.random() * totalW;
    let rarity = 'common';
    if (roll < (weights.legendary || 0)) rarity = 'legendary';
    else if ((roll -= (weights.legendary || 0)) < weights.epic) rarity = 'epic';
    else if ((roll -= weights.epic) < weights.rare) rarity = 'rare';
    else if ((roll -= weights.rare) < weights.uncommon) rarity = 'uncommon';

    // Legendary augments use fixed templates
    if (rarity === 'legendary' && pool.legendary && pool.legendary.length > 0) {
        const tmpl = pool.legendary[Math.floor(Math.random() * pool.legendary.length)];
        const stats = {};
        for (const [stat, val] of Object.entries(tmpl.stats)) {
            if (typeof val === 'number') {
                const v = 1 + (Math.random() - 0.5) * 0.1;
                stats[stat] = val < 1 ? Math.round(val * v * 100) / 100 : Math.round(val * v);
            }
        }
        return {
            id: Date.now() + Math.random(), name: tmpl.name, form, rarity: 'legendary',
            augment: true, stats, effect: tmpl.effect || null,
            effectDesc: tmpl.effectDesc || '', desc: tmpl.desc || '',
        };
    }

    // Map uncommon → common pool, epic → rare pool for tier index
    const tierIdx = rarity === 'uncommon' ? 0 : rarity === 'epic' ? 1 : 0;
    const poolKey = (rarity === 'rare' || rarity === 'epic') ? 'rare' : 'common';
    const templates = pool[poolKey];
    if (!templates || templates.length === 0) return null;
    const tmpl = templates[Math.floor(Math.random() * templates.length)];

    // Build stats from template at rarity tier
    const rarityIdx = ['common', 'uncommon', 'rare', 'epic'].indexOf(rarity);
    const stats = {};
    for (const [stat, tiers] of Object.entries(tmpl.stats)) {
        if (Array.isArray(tiers)) {
            const base = tiers[Math.min(rarityIdx, tiers.length - 1)];
            const v = 1 + (Math.random() - 0.5) * 0.2;
            stats[stat] = base < 1 ? Math.round(base * v * 100) / 100 : Math.round(base * v);
        }
    }

    return {
        id: Date.now() + Math.random(),
        name: (AUGMENT_RARITY_PREFIX[rarity] || '') + tmpl.name,
        form, rarity, augment: true, stats,
        effect: tmpl.effect || null,
        effectDesc: tmpl.effectDesc || '',
        desc: tmpl.desc || '',
    };
}

// --- Augment world drops (mirrors worldDrops for equipment) ---
const worldAugmentDrops = [];

function dropAugmentInWorld(row, col, augment) {
    if (!augment) return;
    worldAugmentDrops.push({
        row, col, augment,
        bobTime: Math.random() * 10,
        spawnTime: 0.5,
        despawnTimer: 45,
    });
}

function updateWorldAugmentDrops(dt) {
    for (let i = worldAugmentDrops.length - 1; i >= 0; i--) {
        const d = worldAugmentDrops[i];
        d.bobTime += dt;
        if (d.spawnTime > 0) d.spawnTime -= dt;
        d.despawnTimer -= dt;
        if (d.despawnTimer <= 0) { worldAugmentDrops.splice(i, 1); continue; }
        // Magnetic pull toward player
        if (d.spawnTime <= 0) {
            const dr = player.row - d.row, dc = player.col - d.col;
            const dist = Math.sqrt(dr * dr + dc * dc);
            if (dist < PICKUP_RANGE) {
                // Pickup
                if (augmentInventory.backpack.length < augmentInventory.maxBackpack) {
                    augmentInventory.backpack.push(d.augment);
                    const rc = RARITY[d.augment.rarity] || RARITY.common;
                    pickupTexts.push({ text: d.augment.name, color: rc.color, row: d.row, col: d.col, offsetY: -8, life: 2.0 });
                    if (typeof sfxItemPickup === 'function') sfxItemPickup();
                } else {
                    pickupTexts.push({ text: 'Augments Full!', color: '#ff6b6b', row: d.row, col: d.col, offsetY: 0, life: 1.2 });
                }
                worldAugmentDrops.splice(i, 1);
                continue;
            }
            if (dist < 2.5) {
                const pull = 4 * dt;
                d.row += (dr / dist) * pull;
                d.col += (dc / dist) * pull;
            }
        }
    }
}

// --- Augment equip/unequip ---
function equipAugment(backpackIdx) {
    const aug = augmentInventory.backpack[backpackIdx];
    if (!aug) return;
    // Find first empty slot
    let targetSlot = -1;
    for (let i = 0; i < 3; i++) {
        if (!augmentInventory.equipped[i]) { targetSlot = i; break; }
    }
    augmentInventory.backpack.splice(backpackIdx, 1);
    if (targetSlot >= 0) {
        augmentInventory.equipped[targetSlot] = aug;
    } else {
        // All slots full — swap with slot 2 (last)
        const old = augmentInventory.equipped[2];
        augmentInventory.equipped[2] = aug;
        if (old) augmentInventory.backpack.push(old);
    }
    if (typeof getEquipBonuses === 'function') equipBonus = getEquipBonuses();
    if (typeof sfxEquip === 'function') sfxEquip();
}

function unequipAugment(slotIdx) {
    const aug = augmentInventory.equipped[slotIdx];
    if (!aug) return;
    if (augmentInventory.backpack.length >= augmentInventory.maxBackpack) {
        pickupTexts.push({ text: 'Pack Full!', color: '#ff6b6b', row: player.row, col: player.col, offsetY: 0, life: 1.2 });
        return;
    }
    augmentInventory.equipped[slotIdx] = null;
    augmentInventory.backpack.push(aug);
    if (typeof getEquipBonuses === 'function') equipBonus = getEquipBonuses();
    if (typeof sfxUnequip === 'function') sfxUnequip();
}

function dropAugmentFromBackpack(idx) {
    if (idx < 0 || idx >= augmentInventory.backpack.length) return;
    const aug = augmentInventory.backpack.splice(idx, 1)[0];
    if (aug) dropAugmentInWorld(player.row, player.col, aug);
}

