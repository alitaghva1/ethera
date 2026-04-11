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
                pickupTexts.push({
                    text: d.item.name,
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
                else sfxItemPickup();
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
                const pullSpeed = 3.0 * dt;
                d.row += (dr / dist) * pullSpeed;
                d.col += (dc / dist) * pullSpeed;
            }
        }
    }
}

