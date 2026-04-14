//  ENEMY SYSTEM
// ============================================================

// ----- ENEMY TYPE DEFINITIONS -----
const ENEMY_TYPES = {
    slime: {
        prefix: 'slime',
        hp: 30, speed: 2.0, damage: 10, attackRange: 0.7, aggroRange: 8,
        hitboxR: 0.25,
        frames: { idle: 6, walk: 6, attack: 6, hurt: 4, death: 4 },
        animSpeed: 8, attackDur: 0.4, attackCooldown: 0.8,
        scale: 1.4, yOff: 0.75,
        ai: 'lunge',
        lungeRange: 3.5,    // starts lunge when this close
        lungeCooldown: 2.0, // seconds between lunges
        lungeSpeed: 5.0,    // speed during lunge
        lungeDur: 0.25,     // lunge duration
        patrolRange: 0.5,  // barely moves when idle — just bobs in place
        retreatOnHit: 0,
        tintColor: COLORS.SLIME_TINT,
    },
    skeleton: {
        prefix: 'skel',
        hp: 50, speed: 2.3, damage: 14, attackRange: 0.9, aggroRange: 9,
        hitboxR: 0.25,
        frames: { idle: 6, walk: 8, attack: 6, hurt: 4, death: 4 },
        animSpeed: 9, attackDur: 0.45, attackCooldown: 1.1,
        scale: 1.5, yOff: 0.75,
        ai: 'flank',
        flankAngle: 0.8, // radians offset from direct approach
        flankDist: 2.5,  // distance at which they start flanking
        patrolRange: 3.5,  // patrols around spawn point when idle
        retreatOnHit: 0,
        tintColor: COLORS.SKELETON_TINT,
    },
    skelarch: {
        prefix: 'skelarch',
        hp: 35, speed: 1.6, damage: 12, attackRange: 7.5, aggroRange: 10,
        hitboxR: 0.25,
        frames: { idle: 6, walk: 8, attack: 9, hurt: 4, death: 4 },
        animSpeed: 8, attackDur: 0.55, attackCooldown: 1.8,
        scale: 1.5, yOff: 0.75,
        ai: 'ranged', preferredDist: 4.5,
        patrolRange: 2.0,
        retreatOnHit: 0.3,  // 30% chance to back away when hit
        tintColor: COLORS.ARCHER_TINT,
    },
    armoredskel: {
        prefix: 'armoredskel',
        hp: 60, speed: 1.8, damage: 18, attackRange: 0.9, aggroRange: 9,
        hitboxR: 0.3,
        frames: { idle: 6, walk: 8, attack: 6, hurt: 4, death: 4 },
        animSpeed: 8, attackDur: 0.5, attackCooldown: 1.3,
        scale: 1.4, yOff: 0.75,
        ai: 'shield',
        shieldChance: 0.4,    // 40% chance to enter shield stance after being hit
        shieldDuration: 1.5,  // seconds in shield stance
        shieldDmgReduc: 0.6,  // takes 60% less damage while shielding
        patrolRange: 3.5,  // patrols like regular skeleton but tankier
        retreatOnHit: 0,
        tintColor: COLORS.ARMORED_TINT,
    },
    werewolf: {
        prefix: 'werewolf',
        hp: 280, speed: 2.6, damage: 22, attackRange: 1.8, aggroRange: 12,
        hitboxR: 0.35,
        frames: { idle: 6, walk: 8, attack: 6, hurt: 4, death: 4 },
        animSpeed: 9, attackDur: 0.5, attackCooldown: 1.5,
        scale: 2.0, yOff: 0.75,
        ai: 'chase',
        patrolRange: 5.0,
        retreatOnHit: 0,
        isBoss: true,
        knockbackResist: 0.4,
        tintColor: COLORS.WEREWOLF_TINT,
    },
    // --- ZONE 1 BOSS: Slime King ---
    slime_king: {
        prefix: 'slime',  // classic slime sprite for Zone 1 boss
        hp: 200, speed: 1.6, damage: 16, attackRange: 1.2, aggroRange: 12,
        hitboxR: 0.45,
        frames: { idle: 6, walk: 6, attack: 6, hurt: 4, death: 4 },
        animSpeed: 6, attackDur: 0.5, attackCooldown: 1.8,
        scale: 2.8, yOff: 0.75,
        ai: 'lunge',
        lungeRange: 4.0,
        lungeCooldown: 2.5,
        lungeSpeed: 4.5,
        lungeDur: 0.3,
        patrolRange: 3.0,
        retreatOnHit: 0,
        isBoss: true,
        knockbackResist: 0.6,
        tintColor: COLORS.SLIME_KING_TINT,
        // Boss abilities
        slamCooldown: 6.0,    // ground slam AoE cooldown
        slamRadius: 2.5,      // AoE range
        slamDamage: 20,       // base slam damage
        summonCooldown: 10.0, // summons slime adds
        summonCount: 3,       // slimes per summon
    },
    // --- ZONE 4 MID-BOSS: Demon Slime King (Inferno variant) ---
    demon_slime_king: {
        prefix: 'demonslime',  // unique demon slime sprite
        hp: 350, speed: 1.8, damage: 22, attackRange: 1.4, aggroRange: 12,
        hitboxR: 0.45,
        frames: { idle: 6, walk: 12, attack: 15, hurt: 5, death: 22 },
        animSpeed: 7, attackDur: 0.5, attackCooldown: 1.6,
        scale: 2.2, yOff: 0.45,
        ai: 'lunge',
        lungeRange: 4.5,
        lungeCooldown: 2.0,
        lungeSpeed: 5.0,
        lungeDur: 0.3,
        patrolRange: 3.0,
        retreatOnHit: 0,
        isBoss: true,
        knockbackResist: 0.65,
        tintColor: '#ff4422',
        slamCooldown: 5.0,
        slamRadius: 3.0,
        slamDamage: 25,
        summonCooldown: 8.0,
        summonCount: 2,
        firePoolOnDeath: true,  // leaves fire pool like fire_slime
        firePoolDuration: 4.0,
        firePoolDPS: 8,
    },
    // --- ZONE 2 BOSS: Bone Colossus ---
    bone_colossus: {
        prefix: 'bonecolossus',  // unique boss sprite (demon)
        hp: 400, speed: 1.4, damage: 24, attackRange: 1.5, aggroRange: 12,
        hitboxR: 0.5,
        frames: { idle: 3, walk: 6, attack: 4, hurt: 2, death: 6 },
        animSpeed: 7, attackDur: 0.6, attackCooldown: 1.6,
        scale: 2.2, yOff: 0.50,  // adjusted for centered demon sprite
        ai: 'chase',
        patrolRange: 4.0,
        retreatOnHit: 0,
        isBoss: true,
        knockbackResist: 0.7,
        tintColor: COLORS.BONE_COLOSSUS_TINT,
        // Boss abilities
        sweepCooldown: 5.0,    // sweeping attack cooldown
        sweepRadius: 2.0,      // sweep range
        sweepDamage: 18,       // base sweep damage
        boneCageCooldown: 12.0, // bone cage trap
        summonCooldown: 8.0,   // summons skeleton adds
        summonCount: 2,
    },

    // --- ZONE 4 BOSS: Infernal Knight ---
    infernal_knight: {
        prefix: 'fireknight',  // unique boss sprite (fire knight)
        hp: 550, speed: 1.8, damage: 28, attackRange: 1.3, aggroRange: 12,
        hitboxR: 0.45,
        frames: { idle: 8, walk: 8, attack: 11, hurt: 6, death: 13 },
        animSpeed: 8, attackDur: 0.55, attackCooldown: 1.4,
        scale: 2.8, yOff: 0.55,  // adjusted for bottom-center fire knight sprite
        ai: 'chase',
        patrolRange: 4.0,
        retreatOnHit: 0,
        isBoss: true,
        knockbackResist: 0.65,
        tintColor: COLORS.INFERNAL_KNIGHT_TINT,
        // Boss abilities
        flameSweepCooldown: 4.5,   // wide flame sweep
        flameSweepRadius: 2.8,     // larger than Bone Colossus
        flameSweepDamage: 22,      // base, scales with statMult
        fireTrail: true,           // leaves burning ground
        fireTrailDamage: 8,        // damage per tick while standing in fire
        fireTrailDuration: 3.0,    // seconds fire persists
        shieldPhaseCooldown: 18.0, // invulnerable shield phase
        shieldPhaseDuration: 3.0,  // seconds of invulnerability
        summonCooldown: 12.0,      // summons fire-armored adds
        summonCount: 2,
    },

    // --- ZONE 5 BOSS: Frost Wyrm ---
    frost_wyrm: {
        prefix: 'frostwyrm',  // unique boss sprite (dragon)
        hp: 700, speed: 2.0, damage: 26, attackRange: 6.0, aggroRange: 14,
        hitboxR: 0.5,
        frames: { idle: 3, walk: 5, attack: 4, hurt: 2, death: 5 },
        animSpeed: 7, attackDur: 0.6, attackCooldown: 2.0,
        scale: 2.5, yOff: 0.40,  // adjusted for top-aligned dragon sprite
        ai: 'ranged', preferredDist: 5.0,
        patrolRange: 4.0,
        retreatOnHit: 0.2,
        isBoss: true,
        knockbackResist: 0.6,
        tintColor: COLORS.FROST_WYRM_TINT,
        // Boss abilities
        iceBreathCooldown: 5.0,    // cone attack
        iceBreathRadius: 3.5,      // cone length
        iceBreathAngle: 0.8,       // cone half-angle in radians
        iceBreathDamage: 20,       // base, scales with statMult
        freezeTrapCooldown: 8.0,   // roots player
        freezeTrapDuration: 1.2,   // seconds player is frozen
        shatterCooldown: 14.0,     // AoE ice shard burst
        shatterRadius: 4.0,
        shatterDamage: 16,
        shatterProjectiles: 10,    // ice shards fired outward
        summonCooldown: 15.0,
        summonCount: 2,
    },

    // --- ZONE 6 BOSS: The Ruined King ---
    ruined_king: {
        prefix: 'ruinedking',  // unique boss sprite (undead executioner)
        hp: 1000, speed: 2.2, damage: 32, attackRange: 1.5, aggroRange: 16,
        hitboxR: 0.5,
        frames: { idle: 5, walk: 5, attack: 6, hurt: 6, death: 10 },
        animSpeed: 9, attackDur: 0.5, attackCooldown: 1.2,
        scale: 2.5, yOff: 0.55,  // adjusted for top-heavy executioner sprite
        ai: 'chase',
        patrolRange: 5.0,
        retreatOnHit: 0,
        isBoss: true,
        knockbackResist: 0.8,
        tintColor: COLORS.RUINED_KING_TINT,
        // Boss abilities — multi-phase fight
        teleSlashCooldown: 4.0,    // teleport behind player + slash
        teleSlashDamage: 24,       // base, scales with statMult
        teleSlashRange: 8.0,       // max teleport distance
        voidPulseCooldown: 7.0,    // arena-wide expanding ring
        voidPulseRadius: 5.0,
        voidPulseDamage: 18,
        summonCooldown: 20.0,      // Phase 2: summons mini-bosses
        summonCount: 1,
        despCooldown: 3.0,         // Phase 3 (25% HP): rapid dark slashes
        despDamage: 14,
        despRadius: 2.5,
    },

    // --- NEW ENEMY TYPES ---

    // Fire Slime (Zone 4+) — lunges like slime, leaves fire pool on death
    fire_slime: {
        prefix: 'flyingdemon',  // unique sprite (flying demon)
        hp: 45, speed: 3.0, damage: 14, attackRange: 0.7, aggroRange: 8,
        hitboxR: 0.25,
        frames: { idle: 4, walk: 4, attack: 4, hurt: 2, death: 4 },
        animSpeed: 8, attackDur: 0.4, attackCooldown: 0.8,
        scale: 1.4, yOff: 0.75,
        ai: 'lunge',
        lungeRange: 3.5,
        lungeCooldown: 2.0,
        lungeSpeed: 5.0,
        lungeDur: 0.25,
        patrolRange: 0.5,
        retreatOnHit: 0,
        tintColor: COLORS.FIRE_SLIME_TINT,
        // Special: fire pool on death
        firePoolOnDeath: true,
        firePoolDuration: 3.0,
        firePoolDPS: 5,
    },

    // Frost Archer (Zone 5+) — ranged like skelarch, arrows slow the player
    frost_archer: {
        prefix: 'skelarch',
        hp: 40, speed: 2.5, damage: 14, attackRange: 7.5, aggroRange: 10,
        hitboxR: 0.25,
        frames: { idle: 6, walk: 8, attack: 9, hurt: 4, death: 4 },
        animSpeed: 8, attackDur: 0.55, attackCooldown: 1.8,
        scale: 1.5, yOff: 0.75,
        ai: 'ranged', preferredDist: 4.5,
        patrolRange: 2.0,
        retreatOnHit: 0.3,
        tintColor: COLORS.FROST_ARCHER_TINT,
        // Special: arrows apply slow
        frostArrows: true,
        frostSlowDuration: 2.0,
        frostSlowMult: 0.7, // 30% movement slow
    },

    // Shadow Knight (Zone 6) — flanks like skeleton, teleports when hit
    shadow_knight: {
        prefix: 'shadowknight',  // unique sprite (NightBorne warrior)
        hp: 80, speed: 2.8, damage: 22, attackRange: 0.9, aggroRange: 9,
        hitboxR: 0.3,
        frames: { idle: 9, walk: 6, attack: 12, hurt: 5, death: 23 },
        animSpeed: 8, attackDur: 0.5, attackCooldown: 1.3,
        scale: 1.4, yOff: 0.75,
        ai: 'flank',
        flankAngle: 0.8,
        flankDist: 2.5,
        patrolRange: 3.5,
        retreatOnHit: 0,
        tintColor: COLORS.SHADOW_KNIGHT_TINT,
        // Special: 40% teleport on hit, 5s cooldown
        shadowTeleport: true,
        shadowTeleportChance: 0.4,
        shadowTeleportDist: 3.0,
        shadowTeleportCooldown: 5.0,
    },

    // Bone Mage (Zone 3+) — ranged, casts ground AoE with 1.5s delay
    bone_mage: {
        prefix: 'bonemage',  // unique sprite (jinn)
        hp: 35, speed: 2.0, damage: 16, attackRange: 7.0, aggroRange: 10,
        hitboxR: 0.25,
        frames: { idle: 3, walk: 3, attack: 4, hurt: 2, death: 6 },
        animSpeed: 8, attackDur: 0.55, attackCooldown: 2.5,
        scale: 1.5, yOff: 0.75,
        ai: 'ranged', preferredDist: 5.0,
        patrolRange: 2.0,
        retreatOnHit: 0.3,
        tintColor: COLORS.BONE_MAGE_TINT,
        // Special: ground AoE instead of arrows
        groundAoE: true,
        groundAoEDelay: 1.5,
        groundAoERadius: 1.2,
        groundAoEDamage: 20,
    },

    // Pit Lurker (Zone 5+) — ambush AI, invisible until player is close
    pit_lurker: {
        prefix: 'slime',
        hp: 50, speed: 4.5, damage: 18, attackRange: 0.7, aggroRange: 8,
        hitboxR: 0.25,
        frames: { idle: 6, walk: 6, attack: 6, hurt: 4, death: 4 },
        animSpeed: 10, attackDur: 0.4, attackCooldown: 0.8,
        scale: 0.98, yOff: 0.75,  // 0.7 * 1.4 base = 0.98
        ai: 'lunge',
        lungeRange: 3.5,
        lungeCooldown: 1.5,
        lungeSpeed: 6.0,
        lungeDur: 0.25,
        patrolRange: 0.5,
        retreatOnHit: 0,
        tintColor: COLORS.PIT_LURKER_TINT,
        // Special: ambush — invisible until player within 3 tiles
        ambush: true,
        ambushRevealDist: 3.0,
    },
};

// ============================================================
//  BOSS ABILITY HELPERS — shared patterns for boss attacks
// ============================================================
// AoE ring: damage in radius around a point, with particle ring + shake.
// Used by Slime King slam, Frost Wyrm shatter, Ruined King void pulse, etc.
function bossAoE(centerRow, centerCol, radius, damage, particleCount, particleColor, shakeIntensity, source) {
    // Particle ring
    for (let p = 0; p < particleCount; p++) {
        const angle = (p / particleCount) * Math.PI * 2;
        spawnParticle(
            centerRow + Math.cos(angle) * radius,
            centerCol + Math.sin(angle) * radius,
            Math.cos(angle) * 1.5, Math.sin(angle) * 1.5,
            0.5, particleColor, 0.8
        );
    }
    // Damage player if in range
    const pdr = player.row - centerRow;
    const pdc = player.col - centerCol;
    if (Math.sqrt(pdr * pdr + pdc * pdc) < radius) {
        damagePlayer(damage, source || 'boss', centerRow, centerCol);
    }
    addScreenShake(shakeIntensity || 5, 0.25);
}

// Sweep arc: damage in frontal cone toward player
function bossSweep(e, radius, damage, particleCount, particleColor, source) {
    const dr = player.row - e.row;
    const dc = player.col - e.col;
    const sweepCenter = Math.atan2(dc, dr);
    for (let p = 0; p < particleCount; p++) {
        const angle = sweepCenter + (p / particleCount - 0.5) * Math.PI;
        const px = e.row + Math.cos(angle) * radius;
        const py = e.col + Math.sin(angle) * radius;
        spawnParticle(px, py, Math.cos(angle) * 1, Math.sin(angle) * 1, 0.4, particleColor, 0.8);
    }
    const dist = Math.sqrt(dr * dr + dc * dc);
    if (dist < radius) {
        damagePlayer(damage, source || e.type, e.row, e.col);
    }
    addScreenShake(4, 0.2);
}

// Summon adds around a boss
function bossSummonAdds(e, addType, count, radius, addStatScale) {
    const scale = addStatScale || Math.max(1.0, (e.statMult || 1.0) * 0.6);
    for (let s = 0; s < count; s++) {
        const angle = (s / count) * Math.PI * 2 + Math.random() * 0.5;
        const spawnR = e.row + Math.cos(angle) * radius;
        const spawnC = e.col + Math.sin(angle) * radius;
        if (canEnemyMoveTo(spawnR, spawnC, 0.25, null)) {
            const add = spawnEnemy(addType, spawnR, spawnC, scale);
            if (add) add.attackCooldown = 0.5 + Math.random();
        }
    }
    for (let p = 0; p < 8; p++) {
        const angle = Math.random() * Math.PI * 2;
        spawnParticle(e.row, e.col, Math.cos(angle) * 2, Math.sin(angle) * 2, 0.4, e.def.tintColor || '#ff6644', 0.7);
    }
    addScreenShake(3, 0.15);
}

const FIREBALL_DAMAGE = COMBAT.fireballDmg;
const ENEMY_KNOCKBACK = COMBAT.knockback;
// Knockback multipliers by context
const KNOCKBACK_MULT = { normal: 1.0, explode: 1.6, tower: 0.5, chain: 0.3, orbit: 0.7 };
const PLAYER_INV_TIME = 0.8;  // invincibility frames after getting hit
let playerInvTimer = 0;
let multiKillTimer = 0;
let multiKillCount = 0;

// ── Kill Streak System — sustained aggression multiplies XP and gold ──
const killStreak = {
    count: 0,           // consecutive kills within window
    timer: 0,           // time since last kill (resets on kill)
    window: 2.2,        // seconds before streak breaks (tight = pressure)
    multiplier: 1.0,    // current XP/gold multiplier
    displayAlpha: 0,    // HUD fade
};

// ── Boss Telegraph Flash — screen-edge flash when telegraph attack fires ──
let bossTelegraphFlashTimer = 0;
let bossTelegraphFlashColor = '#ff4444';

// ── COMBAT JUICE STATE ──────────────────────────────────────
// Damage vignette — red screen-edge flash when player is hit
let dmgVignetteIntensity = 0;  // 0–1, decays over time
let dmgVignetteTimer = 0;
// Low-HP warning — pulsing red vignette below 25% HP
// (drawn in render, no separate timer needed — uses sin wave)
// Critical hit constants
const CRIT_CHANCE = 0.15;     // 15% per projectile hit
const CRIT_MULTIPLIER = 1.8;  // damage multiplier
// Multikill text display
const multiKillTexts = [];    // { text, color, life, scale }

// ----- DEATH RECAP SYSTEM -----
let deathCause = '';  // What killed the player (enemy type or damage source)
let deathRecapTimer = 0;

// ----- UPGRADE PITY SYSTEM -----
let recentlyOffered = new Set();  // Tracks which upgrades were recently offered
const PITY_POOL_SIZE = 13;  // Clear pool when it reaches this size (allows rotation back in)

// ----- ENEMY ARRAY -----
const enemies = [];
const burnZones = [];
let veilUndyingCooldown = 0;

// ----- ENEMY PROJECTILES (skeleton archer arrows) -----
const enemyProjectiles = [];

// ----- GROUND HAZARDS (fire pools, bone mage AoE warnings) -----
const groundHazards = [];
// Each hazard: { type, row, col, radius, life, maxLife, damage, tickTimer, color, damagesEnemies }
let _envHazardTimer = 0; // timer for periodic environmental hazard spawning

// ----- PARTICLE SYSTEM -----
// Effect particles are managed in particles.js (spawnParticle, spawnDeathBurst, etc.)
// This array is shared — ambient particles (no .type) + effect particles (with .type)
const particles = [];
for (let i = 0; i < 40; i++) {
    particles.push({
        x: Math.random() * 500 - 250,
        y: Math.random() * 500 - 250,
        size: Math.random() * 1.5 + 0.5,
        speed: Math.random() * 12 + 4,
        angle: Math.random() * Math.PI * 2,
        alpha: Math.random() * 0.25 + 0.05,
        drift: Math.random() * 0.5 + 0.1,
    });
}

// ----- ROOM BOUNDS & LIGHTING -----
const ROOM_BOUNDS = [];
const visitedRooms = new Set();
let ambientParticleTimer = 0;

// Define room color tints - will be populated by buildRoomBounds
const ROOM_TINTS = {};

// Build room bounds metadata after dungeon generation
function buildRoomBounds() {
    ROOM_BOUNDS.length = 0;
    // Zone 0 — Town (outdoor)
    if (currentZone === 0) {
        ROOM_BOUNDS.push({ name: 'Town', r1: 0, r2: 29, c1: 0, c2: 29, tint: '#ffffff' });
    }
    // Zone 1 rooms
    else if (currentZone === 1) {
        ROOM_BOUNDS.push({ name: 'Cell', r1: 2, r2: 5, c1: 2, c2: 10, tint: '#1a1a3a' });          // cold blue (L-shape: main + tunnel)
        ROOM_BOUNDS.push({ name: 'Corridor1', r1: 7, r2: 9, c1: 3, c2: 6, tint: '#2a2a2a' });      // neutral
        ROOM_BOUNDS.push({ name: 'GuardHall', r1: 10, r2: 19, c1: 1, c2: 8, tint: '#3a2a1a' });    // warm orange (T-shape: main + armory)
        ROOM_BOUNDS.push({ name: 'Corridor2', r1: 11, r2: 14, c1: 10, c2: 11, tint: '#2a2a2a' });  // neutral
        ROOM_BOUNDS.push({ name: 'GreatHall', r1: 8, r2: 20, c1: 12, c2: 21, tint: '#2a2a2a' });   // neutral (cathedral aisles)
        ROOM_BOUNDS.push({ name: 'Alcove', r1: 2, r2: 6, c1: 15, c2: 20, tint: '#1a3a2a' });       // green
        // Act 2 rooms (accessible after expansion)
        ROOM_BOUNDS.push({ name: 'BoneGallery', r1: 8, r2: 16, c1: 23, c2: 32, tint: '#2a1a1a' }); // dark red
        ROOM_BOUNDS.push({ name: 'FloodedCrypt', r1: 2, r2: 7, c1: 23, c2: 27, tint: '#1a2a2a' }); // teal/damp
        ROOM_BOUNDS.push({ name: 'KingsHollow', r1: 19, r2: 30, c1: 23, c2: 32, tint: '#2a1a3a' }); // purple boss (octagonal)
    } else if (currentZone === 2) {
        // Zone 2 rooms — matched to actual generateZone2() geometry
        ROOM_BOUNDS.push({ name: 'Vestibule', r1: 2, r2: 6, c1: 2, c2: 8, tint: '#2a2a3a' });           // cool
        ROOM_BOUNDS.push({ name: 'Corridor1', r1: 4, r2: 6, c1: 10, c2: 12, tint: '#2a2a2a' });         // neutral
        ROOM_BOUNDS.push({ name: 'RuinedArmory', r1: 1, r2: 8, c1: 14, c2: 24, tint: '#3a1a1a' });     // red-tinted
        ROOM_BOUNDS.push({ name: 'Corridor3', r1: 7, r2: 15, c1: 14, c2: 16, tint: '#2a2a2a' });        // neutral
        ROOM_BOUNDS.push({ name: 'GuardBarracks', r1: 8, r2: 16, c1: 18, c2: 28, tint: '#3a2a1a' });    // warm
        ROOM_BOUNDS.push({ name: 'ThroneAntechamber', r1: 17, r2: 25, c1: 20, c2: 28, tint: '#4a2a1a' }); // darker orange
    } else if (currentZone === 3) {
        // Zone 3 rooms — matched to actual generateZone3() geometry
        ROOM_BOUNDS.push({ name: 'GrandEntrance', r1: 1, r2: 6, c1: 1, c2: 9, tint: '#2a2a3a' });      // cool
        ROOM_BOUNDS.push({ name: 'Corridor1', r1: 4, r2: 6, c1: 10, c2: 14, tint: '#2a2a2a' });         // neutral
        ROOM_BOUNDS.push({ name: 'ThroneRoom', r1: 8, r2: 18, c1: 10, c2: 22, tint: '#3a1a1a' });       // red-tinted
    } else if (currentZone === 4) {
        // Zone 4 rooms — matched to generateHellZone() geometry
        ROOM_BOUNDS.push({ name: 'TheMaw', r1: 1, r2: 8, c1: 8, c2: 19, tint: '#3a1010' });            // deep red
        ROOM_BOUNDS.push({ name: 'TheDescent', r1: 8, r2: 10, c1: 5, c2: 22, tint: '#2a0808' });       // darker
        ROOM_BOUNDS.push({ name: 'TheCrucible', r1: 10, r2: 26, c1: 0, c2: 27, tint: '#4a1515' });     // hellfire
    } else if (currentZone === 5) {
        // Zone 5 — The Frozen Abyss
        ROOM_BOUNDS.push({ name: 'FrostGate', r1: 1, r2: 7, c1: 10, c2: 19, tint: '#101030' });       // cold blue
        ROOM_BOUNDS.push({ name: 'IceBridge', r1: 7, r2: 10, c1: 5, c2: 24, tint: '#0a0a25' });       // deep blue
        ROOM_BOUNDS.push({ name: 'FrozenArena', r1: 10, r2: 22, c1: 2, c2: 27, tint: '#151535' });    // icy purple
        ROOM_BOUNDS.push({ name: 'AbyssalPit', r1: 22, r2: 28, c1: 7, c2: 22, tint: '#0a0a20' });    // deepest blue
    } else if (currentZone === 6) {
        // Zone 6 — Throne of Ruin
        ROOM_BOUNDS.push({ name: 'RuinGate', r1: 1, r2: 8, c1: 11, c2: 20, tint: '#2a1030' });       // dark purple
        ROOM_BOUNDS.push({ name: 'BoneHall', r1: 8, r2: 12, c1: 4, c2: 27, tint: '#201020' });       // purple-black
        ROOM_BOUNDS.push({ name: 'ThroneArena', r1: 12, r2: 28, c1: 1, c2: 30, tint: '#301530' });   // royal purple
    }
}

// ============================================================
//  UNIFIED ENEMY HIT / STAGGER PIPELINE
// ============================================================
// Centralized player damage bonus calculation — safe accessors for all bonus sources
function calcPlayerDmgBonus() {
    const quest = (typeof questState !== 'undefined' && questState.permBonuses) ? (questState.permBonuses.dmgBonus || 0) : 0;
    const equip = (typeof equipBonus !== 'undefined') ? (equipBonus.dmgBonus || 0) : 0;
    const big = (typeof getUpgrade === 'function') ? getUpgrade('bigshot') * 5 : 0;
    const talisman = (typeof getTalismanBonus === 'function') ? getTalismanBonus().dmgMult : 1;
    const synBonus = (typeof hasSynergy === 'function' && hasSynergy('power_surge')) ? 1.10 : 1.0;
    return { flat: equip + big + quest, mult: talisman * synBonus };
}

// All damage to enemies should go through this function.
// It handles: damage application, hurt/death state, stagger cooldown,
// knockback (with resistance), hit particles, SFX, and loot.
//
// Options:
//   knockVr/knockVc — knockback velocity (tile-space)
//   skipHurtState   — true to damage without interrupting AI (DoT, thorns)
//   skipSFX         — true to suppress sound (batch hits)
//   skipParticles   — true to suppress hit spark (batch hits)
function applyEnemyHit(e, damage, opts) {
    if (!e || e.state === 'death') return;
    if (e._ambushHidden) return; // pit lurker hidden — immune to damage
    if (e.bossShieldPhaseActive) {
        if (!(opts && opts.skipParticles)) spawnParticle(e.row, e.col, (Math.random()-0.5)*3, (Math.random()-0.5)*3, 0.2, '#ff8844', 0.6);
        return;
    }
    opts = opts || {};

    // Armored skeleton shield damage reduction
    const shieldReduc = e.isShielding ? (1 - (e.def.shieldDmgReduc || 0)) : 1;
    let finalDmg = Math.round(damage * shieldReduc);

    // ── COMBAT JUICE: Critical hit roll (applies to all damage sources) ──
    const isCrit = !opts.skipCrit && Math.random() < CRIT_CHANCE;
    if (isCrit) finalDmg = Math.round(finalDmg * CRIT_MULTIPLIER);

    // Executioner upgrade (skeleton): bonus damage to low-HP enemies
    if (typeof FormSystem !== 'undefined' && FormSystem.currentForm === 'skeleton' &&
        typeof getUpgrade === 'function' && getUpgrade('executioner') > 0 &&
        e.maxHp > 0 && e.hp / e.maxHp < 0.25) {
        finalDmg = Math.round(finalDmg * (1 + 0.3 * getUpgrade('executioner')));
    }

    e.hp -= finalDmg;

    // Hit flash — brief white overlay on ANY damage (longer on crit)
    e.hitFlashTimer = isCrit ? 0.22 : 0.12;

    // ── Hit pause — scaled by impact. Tuned for visceral punch. ──
    const heavyHitThreshold = (e.def.hp || 30) * 0.15;
    if (isCrit) {
        addHitPause(0.12);
        addScreenShake(6, 0.18);
    } else if (finalDmg >= heavyHitThreshold) {
        addHitPause(0.07);
        addScreenShake(4, 0.12);
    } else {
        addHitPause(0.05);
        addScreenShake(2, 0.06);
    }

    // ── Stagger wobble on heavy hits — visual sprite offset during hit flash ──
    if (finalDmg >= heavyHitThreshold && !e.def.isBoss) {
        e._staggerOffX = (opts.knockVr || (Math.random() - 0.5)) * 3;
        e._staggerOffY = (opts.knockVc || (Math.random() - 0.5)) * 3;
    }

    // ── Impact scaling by enemy max HP ──
    const impactScale = Math.min(2.5, Math.max(0.8, (e.def.hp || 30) / 60));

    // Floating damage number (gold + '!' on crit) — stagger Y offset to prevent overlap
    if (!opts.skipParticles) {
        // Track per-enemy damage number offset to prevent stacking
        if (!e._dmgNumTimer) e._dmgNumTimer = 0;
        if (!e._dmgNumOffset) e._dmgNumOffset = 0;
        const now = performance.now() / 1000;
        if (now - e._dmgNumTimer < 0.4) {
            e._dmgNumOffset -= 12; // stack upward
        } else {
            e._dmgNumOffset = 0; // reset after gap
        }
        e._dmgNumTimer = now;

        pickupTexts.push({
            text: isCrit ? '-' + finalDmg + '!' : '-' + finalDmg,
            color: isCrit ? COLORS.DAMAGE_CRIT : COLORS.DAMAGE_RED,
            row: e.row, col: e.col,
            offsetY: -10 - Math.random() * 8 + e._dmgNumOffset,
            offsetX: (Math.random() - 0.5) * (isCrit ? 40 : 24),  // horizontal scatter
            vy: -(80 + Math.random() * 40) * (isCrit ? 1.4 : 1),  // upward launch velocity
            life: isCrit ? 1.2 : 0.9,
            isCrit: isCrit,
        });
    }

    // Impact ripple on crit hits
    if (isCrit && typeof spawnImpactRipple === 'function') {
        const ripPos = tileToScreen(e.row, e.col);
        spawnImpactRipple(ripPos.x + cameraX, ripPos.y + cameraY, '#ffdd66', 40);
    }

    // Crit spark burst
    if (isCrit && !opts.skipParticles) {
        const critPos = tileToScreen(e.row, e.col);
        const cx = critPos.x + cameraX, cy = critPos.y + cameraY;
        const critCount = Math.max(4, Math.round(8 * GFX.particleMul));
        for (let ci = 0; ci < critCount; ci++) {
            const ca = (Math.PI * 2 * ci) / critCount + (Math.random() - 0.5) * 0.5;
            _emitParticle(cx, cy,
                Math.cos(ca) * (4 + Math.random() * 3),
                Math.sin(ca) * (4 + Math.random() * 3),
                0.25, 2 + Math.random() * 1.5,
                '#ffffcc', 1.0, 'crit', 'screen'
            );
        }
    }

    // Knockback with resistance + directional particles
    if (opts.knockVr !== undefined || opts.knockVc !== undefined) {
        const kbResist = e.def.knockbackResist || 1.0;
        const kvr = (opts.knockVr || 0) * kbResist;
        const kvc = (opts.knockVc || 0) * kbResist;
        e.knockVr = (e.knockVr || 0) + kvr;
        e.knockVc = (e.knockVc || 0) + kvc;
        // Spawn 3 directional particles trailing opposite to knockback
        if (!opts.skipParticles && typeof _emitParticle === 'function') {
            const ePos = tileToScreen(e.row, e.col);
            const ex = ePos.x + cameraX, ey = ePos.y + cameraY;
            for (let pi = 0; pi < 3; pi++) {
                _emitParticle(ex, ey,
                    -kvr * 2 + (Math.random() - 0.5) * 3,
                    -kvc * 2 + (Math.random() - 0.5) * 3,
                    0.25, 2 + Math.random(), '#ffddaa', 0.6);
            }
        }
    }

    const critMul = isCrit ? 2.0 : 1.0;

    // --- Shadow Knight: teleport on hit ---
    if (e.def.shadowTeleport && e.hp > 0 && !opts.skipHurtState) {
        if (!e._shadowTeleportCooldown) e._shadowTeleportCooldown = 0;
        if (e._shadowTeleportCooldown <= 0 && Math.random() < (e.def.shadowTeleportChance || 0.4)) {
            const teleDist = e.def.shadowTeleportDist || 3.0;
            // Try random directions to find walkable tile
            for (let attempt = 0; attempt < 8; attempt++) {
                const teleAngle = Math.random() * Math.PI * 2;
                const teleR = e.row + Math.cos(teleAngle) * teleDist;
                const teleC = e.col + Math.sin(teleAngle) * teleDist;
                if (canEnemyMoveTo(teleR, teleC, e.def.hitboxR, e)) {
                    // Purple flash at old position
                    for (let tp = 0; tp < 6; tp++) {
                        spawnParticle(e.row, e.col,
                            (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3,
                            0.3, '#7733bb', 0.8);
                    }
                    e.row = teleR;
                    e.col = teleC;
                    // Purple flash at new position
                    for (let tp = 0; tp < 6; tp++) {
                        spawnParticle(e.row, e.col,
                            (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3,
                            0.3, '#7733bb', 0.8);
                    }
                    e._shadowTeleportCooldown = e.def.shadowTeleportCooldown || 5.0;
                    // Cancel knockback since we teleported
                    e.knockVr = 0;
                    e.knockVc = 0;
                    break;
                }
            }
        }
    }

    if (e.hp <= 0) {
        e.hp = 0;
        e.state = 'death';
        e.deathTimer = 0.7;
        e.animFrame = 0;
        e._deathSquash = 1.0; // squash-and-stretch timer (1→0)
        if (!opts.skipSFX) sfxEnemyDeath(e.row, e.col);
        rollEnemyLoot(e);
        // Clean up boss phase 2 effects on death
        if (e.def.isBoss && e._boneWallActive && e._boneWallTiles) {
            for (const t of e._boneWallTiles) {
                if (t.r >= 0 && t.r < MAP_SIZE && t.c >= 0 && t.c < MAP_SIZE) {
                    blocked[t.r][t.c] = false;
                    blockType[t.r][t.c] = null;
                }
            }
            e._boneWallActive = false;
            e._boneWallTiles = [];
        }
        // Spawn combat decal (blood pool) at death location
        if (typeof spawnCombatDecal === 'function') {
            spawnCombatDecal(e.row, e.col, e.def.tintColor || '#441111', e.def.isBoss ? 8 : 4);
        }
        if (e.def.isBoss) {
            addHitPause(0.25);
            addSlowMo(0.8, 0.10); addScreenShake(18, 0.6);
            if (typeof addCameraZoom === 'function') addCameraZoom(1.12, 2.0);
        }
        else if (e.elite) { addHitPause(0.10 * impactScale); addScreenShake(7 * impactScale * critMul, 0.20); addSlowMo(0.25, 0.20); }
        else if (isCrit) { addHitPause(0.05); addScreenShake(4, 0.10); } // no slow-mo on crit kills (too frequent at high levels)
        else { addHitPause(0.04); addScreenShake(3 * impactScale * critMul, 0.10); }
    } else if (!opts.skipHurtState) {
        // Stagger: only interrupt if not already staggered recently
        // Bosses have built-in stagger resistance via shorter hurtTimer
        if (e.staggerCooldown <= 0) {
            const hurtDur = e.def.isBoss ? 0.15 : 0.3;
            e.state = 'hurt';
            e.hurtTimer = hurtDur;
            e.staggerCooldown = 0.3;
            e.animFrame = 0;
            if (!opts.skipSFX) {
                sfxEnemyHurt(e.row, e.col);
                if (typeof sfxRealHit === 'function') sfxRealHit(); // layered sample
            }
        }
        // Hit spark particle
        if (!opts.skipParticles) {
            const hitPos = tileToScreen(e.row, e.col);
            spawnHitSpark(hitPos.x + cameraX, hitPos.y + cameraY);
        }
        // Retreat impulse for ranged enemies when hit
        if (e.def.retreatOnHit && Math.random() < e.def.retreatOnHit) {
            const rdr = e.row - player.row;
            const rdc = e.col - player.col;
            const rLen = Math.sqrt(rdr * rdr + rdc * rdc) || 1;
            e.knockVr += (rdr / rLen) * 1.5;
            e.knockVc += (rdc / rLen) * 1.5;
        }
    }
}

// ----- ENHANCED PARTICLE SYSTEMS -----
// spawnDeathBurst, spawnHitSpark, spawnParticle, spawnCastEffect
// are now in particles.js (unified pooled particle manager)

// ============================================================
//  WAVE SYSTEM
// ============================================================

// Valid spawn zones — walkable positions away from the player's start cell
// Room 2 (Guard Post), Room 3 (Great Hall), Room 4 (Alcove), corridors
const SPAWN_ZONES = [
    // Room 2: Guard Hall (rows 10-16, cols 1-8)
    { r: 11, c: 3 }, { r: 11, c: 6 }, { r: 12, c: 4 },
    { r: 13, c: 3 }, { r: 13, c: 6 }, { r: 14, c: 4 },
    { r: 15, c: 3 }, { r: 15, c: 6 }, { r: 12, c: 7 },
    // Room 3: Great Hall (rows 8-20, cols 12-21) — main arena
    { r: 10, c: 15 }, { r: 10, c: 18 }, { r: 11, c: 13 },
    { r: 11, c: 17 }, { r: 12, c: 15 }, { r: 12, c: 19 },
    { r: 13, c: 13 }, { r: 13, c: 17 }, { r: 14, c: 15 },
    { r: 14, c: 18 }, { r: 15, c: 13 }, { r: 15, c: 17 },
    { r: 16, c: 15 }, { r: 16, c: 19 }, { r: 17, c: 14 },
    { r: 17, c: 18 }, { r: 18, c: 16 }, { r: 18, c: 20 },
    { r: 19, c: 15 }, { r: 19, c: 19 }, { r: 20, c: 13 },
    // Room 4: Alcove (rows 2-6, cols 15-20)
    { r: 3, c: 17 }, { r: 4, c: 16 }, { r: 4, c: 19 },
    { r: 5, c: 17 }, { r: 6, c: 18 },
];

// Wave definitions: each wave has a list of enemies and a stat multiplier
const WAVES = [
    {
        enemies: [
            { type: 'slime', count: 7 },
        ],
        statMult: 1.0,
        title: 'The Dungeon Stirs',
        // Spawn in Guard Hall — first combat room
        spawnZone: { rMin: 10, rMax: 19, cMin: 1, cMax: 8 },
    },
    {
        enemies: [
            { type: 'slime', count: 5 },
            { type: 'skeleton', count: 4 },
        ],
        statMult: 1.15,
        title: 'The Dead Rise',
        // Spawn in Great Hall — main arena
        spawnZone: { rMin: 8, rMax: 20, cMin: 12, cMax: 21 },
    },
    {
        enemies: [
            { type: 'slime', count: 6 },
            { type: 'skeleton', count: 5 },
            { type: 'skelarch', count: 3 },
        ],
        statMult: 1.35,
        title: 'Arrow and Bone',
        isExpansionTrigger: true,
        // Spawn in Great Hall
        spawnZone: { rMin: 8, rMax: 20, cMin: 12, cMax: 21 },
    },
    {
        enemies: [
            { type: 'skeleton', count: 8 },
            { type: 'skelarch', count: 4 },
        ],
        statMult: 1.5,
        title: 'The Crypt Opens',
        // Spawn in Bone Gallery (Act 2)
        spawnZone: { rMin: 8, rMax: 16, cMin: 23, cMax: 32 },
    },
    {
        enemies: [
            { type: 'slime', count: 3 },
            { type: 'skeleton', count: 5 },
            { type: 'skelarch', count: 4 },
            { type: 'bone_mage', count: 1 },
        ],
        statMult: 1.65,
        title: 'The Deep Stirs',
        // Spawn across Gallery + Crypt area
        spawnZone: { rMin: 2, rMax: 16, cMin: 23, cMax: 33 },
    },
    {
        enemies: [
            { type: 'skeleton', count: 7 },
            { type: 'skelarch', count: 5 },
            { type: 'slime', count: 5 },
            { type: 'bone_mage', count: 2 },
        ],
        statMult: 1.8,
        title: 'The Undercroft\'s Last Stand',
        // Spawn across Gallery + Crypt area
        spawnZone: { rMin: 2, rMax: 16, cMin: 23, cMax: 33 },
    },
    {
        enemies: [
            { type: 'slime_king', count: 1 },
            { type: 'slime', count: 4 },
            { type: 'skeleton', count: 3 },
        ],
        statMult: 1.9,
        title: 'The Slime King Emerges',
        isBossWave: true,
        // Spawn in King's Hollow
        spawnZone: { rMin: 20, rMax: 29, cMin: 24, cMax: 31 },
    },
];

// ===== ZONE 2 WAVES =====
// Skeleton form debut — smoother ramp lets player learn combo/shield before the real challenge
const ZONE2_WAVES = [
    {
        enemies: [
            { type: 'skeleton', count: 6 },
            { type: 'skelarch', count: 2 },
        ],
        statMult: 1.2,
        title: 'Bones Ascend',
        // Spawn in Ruined Armory — first combat room
        spawnZone: { rMin: 10, rMax: 19, cMin: 18, cMax: 30 },
    },
    {
        enemies: [
            { type: 'slime', count: 3 },
            { type: 'skeleton', count: 6 },
            { type: 'skelarch', count: 4 },
        ],
        statMult: 1.35,
        title: 'The Guard Post',
        // Spawn in Guard Barracks
        spawnZone: { rMin: 21, rMax: 30, cMin: 20, cMax: 32 },
    },
    {
        enemies: [
            { type: 'skeleton', count: 4 },
            { type: 'armoredskel', count: 2 },
            { type: 'skelarch', count: 6 },
        ],
        statMult: 1.5,
        title: 'Iron and Arrows',
        isExpansionTrigger: true,
        // Spawn in Guard Barracks
        spawnZone: { rMin: 21, rMax: 30, cMin: 20, cMax: 32 },
    },
    {
        enemies: [
            { type: 'werewolf', count: 1, hpOverride: 150, dmgOverride: 18, tintOverride: '#bbaa88' },
            { type: 'skeleton', count: 3 },
            { type: 'skelarch', count: 2 },
        ],
        statMult: 1.55,
        title: 'The Bone Sentinel',
        isBossWave: true,
        // Spawn in Guard Barracks — dramatic mini-boss encounter
        spawnZone: { rMin: 21, rMax: 30, cMin: 20, cMax: 32 },
    },
    {
        enemies: [
            { type: 'skeleton', count: 8 },
            { type: 'skelarch', count: 6 },
        ],
        statMult: 1.65,
        title: 'The Tower Crumbles',
        // Spawn in Collapsed Floor (Act 2)
        spawnZone: { rMin: 14, rMax: 27, cMin: 2, cMax: 16 },
    },
    {
        enemies: [
            { type: 'skeleton', count: 6 },
            { type: 'armoredskel', count: 3 },
            { type: 'skelarch', count: 8 },
        ],
        statMult: 1.8,
        title: 'Death From Above',
        // Spawn across Collapsed Floor + Bell Tower
        spawnZone: { rMin: 4, rMax: 27, cMin: 2, cMax: 16 },
    },
    {
        enemies: [
            { type: 'skeleton', count: 8 },
            { type: 'armoredskel', count: 4 },
            { type: 'skelarch', count: 6 },
        ],
        statMult: 1.95,
        title: 'Endless Legions',
        // Spawn in Collapsed Floor
        spawnZone: { rMin: 14, rMax: 27, cMin: 2, cMax: 16 },
    },
    {
        enemies: [
            { type: 'bone_colossus', count: 1 },
            { type: 'armoredskel', count: 3 },
            { type: 'skelarch', count: 4 },
        ],
        statMult: 2.0,
        title: 'The Bone Colossus Rises',
        isBossWave: true,
        // Spawn in Throne Antechamber
        spawnZone: { rMin: 29, rMax: 33, cMin: 8, cMax: 22 },
    },
];

// ===== ZONE 3 WAVES =====
// Spire gauntlet — escalating difficulty toward werewolf boss
const ZONE3_WAVES = [
    {
        enemies: [
            { type: 'skeleton', count: 6 },
            { type: 'skelarch', count: 2 },
        ],
        statMult: 2.5,
        title: 'The Spire\'s Guard',
    },
    {
        enemies: [
            { type: 'skeleton', count: 4 },
            { type: 'skelarch', count: 4 },
            { type: 'armoredskel', count: 2 },
        ],
        statMult: 2.7,
        title: 'Sentinels of Stone',
    },
    {
        enemies: [
            { type: 'skeleton', count: 5 },
            { type: 'skelarch', count: 5 },
            { type: 'armoredskel', count: 2 },
            { type: 'bone_mage', count: 1 },
        ],
        statMult: 2.9,
        title: 'The Garrison Falls',
        isExpansionTrigger: true,
    },
    {
        enemies: [
            { type: 'skeleton', count: 7 },
            { type: 'skelarch', count: 3 },
            { type: 'bone_mage', count: 1 },
        ],
        statMult: 3.0,
        title: 'The Ascent',
    },
    {
        enemies: [
            { type: 'skeleton', count: 5 },
            { type: 'armoredskel', count: 4 },
            { type: 'skelarch', count: 6 },
            { type: 'bone_mage', count: 2 },
        ],
        statMult: 3.2,
        title: 'Summit of Bone',
    },
    {
        enemies: [
            { type: 'skeleton', count: 8 },
            { type: 'skelarch', count: 5 },
            { type: 'armoredskel', count: 4 },
            { type: 'bone_mage', count: 2 },
        ],
        statMult: 3.4,
        title: 'The Heights Rage',
    },
    {
        enemies: [
            { type: 'werewolf', count: 1 },
            { type: 'armoredskel', count: 4 },
            { type: 'skelarch', count: 6 },
        ],
        statMult: 3.5,
        title: 'The Beast Awakens',
        isBossWave: true,
    },
];

// ===== ZONE 4 WAVES (THE INFERNO) =====
// Brutal hellfire gauntlet with escalating intensity
const ZONE4_WAVES = [
    {
        enemies: [
            { type: 'armoredskel', count: 8 },
            { type: 'skelarch', count: 6 },
        ],
        statMult: 3.2,
        title: 'The Inferno Awakens',
    },
    {
        enemies: [
            { type: 'skeleton', count: 8 },
            { type: 'armoredskel', count: 6 },
            { type: 'skelarch', count: 6 },
            { type: 'fire_slime', count: 2 },
        ],
        statMult: 3.4,
        title: 'Burning Legions',
    },
    {
        enemies: [
            { type: 'werewolf', count: 1 },
            { type: 'armoredskel', count: 7 },
            { type: 'skelarch', count: 6 },
            { type: 'fire_slime', count: 3 },
        ],
        statMult: 3.6,
        title: 'The Damned March',
        isExpansionTrigger: true,
    },
    {
        enemies: [
            { type: 'armoredskel', count: 8 },
            { type: 'skelarch', count: 8 },
            { type: 'skeleton', count: 5 },
            { type: 'fire_slime', count: 3 },
            { type: 'bone_mage', count: 1 },
        ],
        statMult: 3.8,
        title: 'Blood and Fire',
    },
    {
        enemies: [
            { type: 'demon_slime_king', count: 1 },
            { type: 'fire_slime', count: 3 },
            { type: 'armoredskel', count: 4 },
        ],
        statMult: 3.9,
        title: 'The Demon Slime King',
        isBossWave: true,
        spawnZone: { rMin: 8, rMax: 20, cMin: 12, cMax: 24 },
    },
    {
        enemies: [
            { type: 'armoredskel', count: 10 },
            { type: 'skelarch', count: 8 },
            { type: 'skeleton', count: 6 },
            { type: 'fire_slime', count: 3 },
            { type: 'bone_mage', count: 1 },
        ],
        statMult: 4.0,
        title: 'Hellfire Gauntlet',
    },
    {
        enemies: [
            { type: 'armoredskel', count: 12 },
            { type: 'skelarch', count: 10 },
            { type: 'fire_slime', count: 2 },
            { type: 'bone_mage', count: 2 },
        ],
        statMult: 4.1,
        title: 'The Forge Calls',
    },
    {
        enemies: [
            { type: 'infernal_knight', count: 1 },
            { type: 'armoredskel', count: 6 },
            { type: 'skelarch', count: 6 },
        ],
        statMult: 4.2,
        title: 'The Infernal Knight Descends',
        isBossWave: true,
    },
];

// ===== ZONE 5 WAVES (THE FROZEN ABYSS) =====
// Frozen gauntlet escalating to Frost Wyrm boss
const ZONE5_WAVES = [
    {
        enemies: [
            { type: 'armoredskel', count: 10 },
            { type: 'skelarch', count: 8 },
        ],
        statMult: 4.2,
        title: 'The Abyss Stirs',
    },
    {
        enemies: [
            { type: 'skeleton', count: 12 },
            { type: 'armoredskel', count: 6 },
            { type: 'skelarch', count: 5 },
            { type: 'frost_archer', count: 2 },
        ],
        statMult: 4.5,
        title: 'Frozen Legions',
    },
    {
        enemies: [
            { type: 'skelarch', count: 10 },
            { type: 'armoredskel', count: 7 },
            { type: 'frost_archer', count: 3 },
        ],
        statMult: 4.7,
        title: 'Arrows of Ice',
        isExpansionTrigger: true,
    },
    {
        enemies: [
            { type: 'skeleton', count: 10 },
            { type: 'armoredskel', count: 8 },
            { type: 'skelarch', count: 6 },
            { type: 'frost_archer', count: 2 },
            { type: 'pit_lurker', count: 1 },
        ],
        statMult: 5.0,
        title: 'The Deep Freeze',
    },
    {
        enemies: [
            { type: 'werewolf', count: 2 },
            { type: 'armoredskel', count: 8 },
            { type: 'skelarch', count: 6 },
            { type: 'frost_archer', count: 2 },
            { type: 'pit_lurker', count: 2 },
        ],
        statMult: 5.2,
        title: 'The Dead March',
    },
    {
        enemies: [
            { type: 'skeleton', count: 14 },
            { type: 'armoredskel', count: 10 },
            { type: 'skelarch', count: 8 },
            { type: 'frost_archer', count: 3 },
            { type: 'pit_lurker', count: 2 },
        ],
        statMult: 5.4,
        title: 'Abyss Unbound',
    },
    {
        enemies: [
            { type: 'frost_wyrm', count: 1 },
            { type: 'armoredskel', count: 8 },
            { type: 'skelarch', count: 8 },
        ],
        statMult: 5.5,
        title: 'The Wyrm Awakens',
        isBossWave: true,
    },
];

// ===== ZONE 6 WAVES (THRONE OF RUIN) =====
// The final gauntlet — crescendo of all enemies, ending in Ruined King
const ZONE6_WAVES = [
    {
        enemies: [
            { type: 'armoredskel', count: 12 },
            { type: 'skelarch', count: 10 },
            { type: 'skeleton', count: 8 },
        ],
        statMult: 6.5,
        title: 'Ruin Awakens',
    },
    {
        enemies: [
            { type: 'slime_king', count: 1 },
            { type: 'bone_colossus', count: 1 },
            { type: 'armoredskel', count: 6 },
            { type: 'skelarch', count: 6 },
        ],
        statMult: 7.0,
        title: 'Echoes of the Fallen',
    },
    {
        enemies: [
            { type: 'werewolf', count: 2 },
            { type: 'infernal_knight', count: 1 },
            { type: 'armoredskel', count: 6 },
            { type: 'shadow_knight', count: 1 },
            { type: 'bone_mage', count: 1 },
        ],
        statMult: 7.5,
        title: 'The Ruined Guard',
        isExpansionTrigger: true,
    },
    {
        enemies: [
            { type: 'skeleton', count: 14 },
            { type: 'armoredskel', count: 12 },
            { type: 'skelarch', count: 12 },
            { type: 'shadow_knight', count: 2 },
            { type: 'bone_mage', count: 1 },
            { type: 'frost_archer', count: 1 },
        ],
        statMult: 8.0,
        title: 'Endless Ruin',
    },
    {
        enemies: [
            { type: 'frost_wyrm', count: 1 },
            { type: 'werewolf', count: 1 },
            { type: 'armoredskel', count: 8 },
            { type: 'skelarch', count: 8 },
            { type: 'shadow_knight', count: 2 },
            { type: 'frost_archer', count: 1 },
        ],
        statMult: 8.5,
        title: 'The Last Stand',
    },
    {
        enemies: [
            { type: 'skeleton', count: 16 },
            { type: 'armoredskel', count: 14 },
            { type: 'skelarch', count: 12 },
            { type: 'shadow_knight', count: 2 },
            { type: 'bone_mage', count: 2 },
            { type: 'frost_archer', count: 1 },
        ],
        statMult: 9.0,
        title: 'The World Breaks',
    },
    {
        enemies: [
            { type: 'ruined_king', count: 1 },
            { type: 'armoredskel', count: 8 },
            { type: 'skelarch', count: 8 },
        ],
        statMult: 10.0,
        title: 'THE THRONE FALLS',
        isBossWave: true,
    },
];

// ===== ZONE EXPANSION SYSTEM =====
// Two-act structure: after Act 1's final wave (isExpansionTrigger), sealed areas open
const ZONE_EXPANSIONS = {
    1: {
        triggerAfterWaveIndex: 2,
        bannerText: 'The walls CRUMBLE...',
        bannerSub: 'Something stirs in the depths beyond.',
        cameraTarget: { r: 12, c: 28 },
        shakeIntensity: 10,
        shakeDuration: 1.8,
        breatherChest: true,
    },
    2: {
        triggerAfterWaveIndex: 2,
        bannerText: 'The tower shudders...',
        bannerSub: 'The western wall gives way.',
        cameraTarget: { r: 14, c: 8 },
        shakeIntensity: 6,
        shakeDuration: 1.2,
        breatherChest: true,
    },
    3: {
        triggerAfterWaveIndex: 2,
        bannerText: 'The spire opens above...',
        bannerSub: 'Something howls in the heights.',
        cameraTarget: { r: 7, c: 20 },
        shakeIntensity: 7,
        shakeDuration: 1.0,
        breatherChest: true,
    },
    4: {
        triggerAfterWaveIndex: 2,
        bannerText: 'The iron gate crumbles...',
        bannerSub: 'Heat and ruin pour forth.',
        cameraTarget: { r: 12, c: 26 },
        shakeIntensity: 8,
        shakeDuration: 1.2,
        breatherChest: true,
    },
    5: {
        triggerAfterWaveIndex: 2,
        bannerText: 'The ice shatters...',
        bannerSub: 'The abyss yawns open.',
        cameraTarget: { r: 12, c: 27 },
        shakeIntensity: 8,
        shakeDuration: 1.2,
        breatherChest: true,
    },
    6: {
        triggerAfterWaveIndex: 2,
        bannerText: 'The tomb screams open...',
        bannerSub: 'The Ruined King stirs.',
        cameraTarget: { r: 28, c: 15 },
        shakeIntensity: 10,
        shakeDuration: 1.5,
        breatherChest: false,
    },
};

// Sealed tile data per zone — populated by map generators, consumed by expandZone()
// Each entry: { sealTiles: [{r,c}], rubbleTiles: [{r,c,obj}], chestTile: {r,c} }
const zoneSealData = {};

function expandZone(zoneNum) {
    const seal = zoneSealData[zoneNum];
    if (!seal) { console.warn('No seal data for zone', zoneNum); return; }

    // Unblock sealed tiles — open them as walkable floor
    for (const t of seal.sealTiles) {
        blocked[t.r][t.c] = false;
        blockType[t.r][t.c] = null;
        objectMap[t.r][t.c] = null;
        objRadius[t.r][t.c] = 0;
        floorMap[t.r][t.c] = t.tile || 'stoneTile';
    }

    // Place rubble/debris props on designated tiles (decorative, non-blocking)
    if (seal.rubbleTiles) {
        for (const t of seal.rubbleTiles) {
            if (t.obj) {
                objectMap[t.r][t.c] = t.obj;
                // rubble is decorative — don't block
            }
        }
    }

    // Spawn breather chest if configured
    const expCfg = ZONE_EXPANSIONS[zoneNum];
    if (expCfg && expCfg.breatherChest && seal.chestTile) {
        objectMap[seal.chestTile.r][seal.chestTile.c] = 'chestClosed';
        blocked[seal.chestTile.r][seal.chestTile.c] = true;
        blockType[seal.chestTile.r][seal.chestTile.c] = 'object';
        objRadius[seal.chestTile.r][seal.chestTile.c] = OBJ_RADII.chestClosed || 0.32;
    }
}

const ZONE_5_FINAL_WAVE = ZONE5_WAVES.length - 1;
const ZONE_6_FINAL_WAVE = ZONE6_WAVES.length - 1;

// Wave state
// NOTE: phase starts as 'done' so waves don't auto-trigger before startWaveSystem() is called.
// Previously 'pre' with timer:0 caused beginNextWave() to fire immediately on the first
// updateWaveSystem() tick — before the delayed startWaveSystem() from the cinematic.
const wave = {
    current: 0,          // 0-indexed, -1 = not started
    phase: 'done',       // done until startWaveSystem() is called; then: pre, countdown, fighting, cleared, zoneClear, victory
    timer: 0,            // multipurpose timer
    bannerAlpha: 0,      // for announcement fade
    bannerText: '',
    bannerSub: '',
    enemiesAlive: 0,     // live count for current wave
    totalKilled: 0,      // total across all waves
    waveKills: 0,        // kills in current wave
    lastDeathRow: 0,     // position of last enemy killed
    lastDeathCol: 0,
    modifier: null,       // current WAVE_MODIFIERS entry or null
    modifierTimer: 0,     // countdown for timed modifier
};

// ── Wave Modifiers — vary objectives and difficulty per wave ──
const WAVE_MODIFIERS = {
    bloodlust: {
        id: 'bloodlust', name: 'Bloodlust',
        desc: 'Enemies are faster — 2x gold',
        color: '#cc4444',
        enemySpeedMult: 1.3, goldMult: 2.0,
    },
    onslaught: {
        id: 'onslaught', name: 'Onslaught',
        desc: 'Double enemies, half HP',
        color: '#ff8844',
        enemyCountMult: 2.0, enemyHpMult: 0.5,
    },
    darkness: {
        id: 'darkness', name: 'Darkness',
        desc: 'Light radius halved',
        color: '#6644aa',
        lightMult: 0.5,
    },
    timed: {
        id: 'timed', name: 'Timed Trial',
        desc: 'Clear in 45s for 3x XP',
        color: '#ffcc44',
        timerDuration: 45, xpBonusMult: 3.0,
    },
};
const _WAVE_MOD_KEYS = Object.keys(WAVE_MODIFIERS);

const ZONE_1_FINAL_WAVE = WAVES.length - 1; // index of the last fixed wave
const ZONE_2_FINAL_WAVE = ZONE2_WAVES.length - 1;
const ZONE_3_FINAL_WAVE = ZONE3_WAVES.length - 1;
const ZONE_4_FINAL_WAVE = ZONE4_WAVES.length - 1;

function startWaveSystem() {
    // Safe zones (town etc.) never start waves
    const cfg = ZONE_CONFIGS[currentZone];
    if (cfg && !cfg.hasWaves) {
        wave.phase = 'done';
        wave.bannerText = '';
        wave.bannerSub = '';
        wave.bannerAlpha = 0;
        enemies.length = 0;
        burnZones.length = 0;
        return;
    }
    wave.current = -1;
    wave.phase = 'pre';
    wave.timer = 6.0; // breathing room — lets zone banner (4s) finish + 2s calm
    wave.bannerText = '';
    wave.bannerSub = '';
    wave.bannerAlpha = 0;
    wave.totalKilled = 0;

    // Contextual combat tutorial — sequential hints during pre-wave calm (one at a time)
    if (typeof Notify !== 'undefined' && currentZone === 1) {
        const form = FormSystem.currentForm || 'slime';
        const atkKey = form === 'slime' ? 'Acid Spit' : form === 'skeleton' ? 'Bone Throw' : form === 'lich' ? 'Soul Bolt' : 'Fireball';
        const dodgeKey = form === 'slime' ? 'Bounce Jump' : form === 'skeleton' ? 'Roll' : form === 'lich' ? 'Shadow Step' : 'Phase Jump';
        // Staggered during the 6-second pre-wave calm — one at a time, short duration
        setTimeout(function() {
            Notify.hint('tutorial_attack', 'Left Click \u2014 ' + atkKey, 3, { color: '#ddc890' });
        }, 500);
        setTimeout(function() {
            Notify.hint('tutorial_dodge', 'SPACE \u2014 ' + dodgeKey, 3, { color: '#ddc890' });
        }, 3500);
        // Controls + grimoire hints fire AFTER first wave clears (not during combat)
        setTimeout(function() {
            Notify.hint('tutorial_controls', 'H \u2014 Controls Reference', 3, { color: '#aabbcc' });
        }, 25000);
        setTimeout(function() {
            Notify.hint('tutorial_grimoire', 'TAB \u2014 Grimoire (stats, gear, quests)', 3, { color: '#aabbcc' });
        }, 30000);
    }
}

// Generate dynamic wave data for waves beyond the fixed definitions
function generateDynamicWave(waveIdx) {
    // Get the correct wave array length for current zone
    const zoneWaveArrays = { 1: WAVES, 2: ZONE2_WAVES, 3: ZONE3_WAVES, 4: ZONE4_WAVES, 5: ZONE5_WAVES, 6: ZONE6_WAVES };
    const zoneWaves = zoneWaveArrays[currentZone] || WAVES;
    const tier = Math.max(1, waveIdx - zoneWaves.length + 1); // 1, 2, 3... for each wave past the defined set
    // Base mult starts from the zone's last wave multiplier for continuity
    const lastFixedMult = zoneWaves[zoneWaves.length - 1].statMult;
    const baseMult = lastFixedMult + tier * 0.3;
    // Shift composition toward archers + armored in later zones
    const useArmored = currentZone >= 3;
    const slimePct = currentZone <= 1 ? Math.max(0.10, 0.35 - tier * 0.05) : 0;
    const archPct = Math.min(0.45, 0.2 + tier * 0.05);
    const armoredPct = useArmored ? Math.min(0.3, 0.1 + tier * 0.03) : 0;
    const skelPct = Math.max(0.1, 1 - slimePct - archPct - armoredPct);
    const totalCount = Math.min(35, 12 + tier * 3);
    const slimeCount = Math.round(totalCount * slimePct);
    const armoredCount = Math.round(totalCount * armoredPct);
    const archCount = Math.round(totalCount * archPct);
    const skelCount = totalCount - slimeCount - armoredCount - archCount;
    const titles = ['The Darkness Deepens', 'Bones Rattle', 'Death Approaches', 'No Mercy', 'Endless Night'];
    const enemyList = [
        { type: 'skeleton', count: skelCount },
        { type: 'skelarch', count: archCount },
    ];
    if (slimeCount > 0) enemyList.push({ type: 'slime', count: slimeCount });
    if (armoredCount > 0) enemyList.push({ type: 'armoredskel', count: armoredCount });

    // Add new enemy types based on zone thresholds
    if (currentZone >= 3) {
        const boneMageCount = Math.min(3, 1 + Math.floor(tier / 3));
        enemyList.push({ type: 'bone_mage', count: boneMageCount });
    }
    if (currentZone >= 4) {
        const fireSlimeCount = Math.min(4, 1 + Math.floor(tier / 2));
        enemyList.push({ type: 'fire_slime', count: fireSlimeCount });
    }
    if (currentZone >= 5) {
        const frostArcherCount = Math.min(4, 1 + Math.floor(tier / 2));
        enemyList.push({ type: 'frost_archer', count: frostArcherCount });
        if (tier >= 2) {
            const pitLurkerCount = Math.min(3, Math.floor(tier / 2));
            enemyList.push({ type: 'pit_lurker', count: pitLurkerCount });
        }
    }
    if (currentZone >= 6) {
        const shadowKnightCount = Math.min(3, 1 + Math.floor(tier / 3));
        enemyList.push({ type: 'shadow_knight', count: shadowKnightCount });
    }

    // Mythic scaling at depth 30+: stat mult increases 2x faster
    const mythicMult = (typeof abyssDepthFlags !== 'undefined' && abyssDepthFlags.mythicScaling) ? 2.0 : 1.0;

    return {
        enemies: enemyList,
        statMult: baseMult * DIFFICULTY.scale * mythicMult,
        title: titles[tier % titles.length],
    };
}

function beginNextWave() {
    wave.current++;
    wave.waveKills = 0; // reset per-wave kill counter
    // Restore full light at wave start (tension effect dims it between waves)
    lightRadius = MAX_LIGHT;
    // Augment: Rune of the Deathless — reset undying resolve between waves
    if (typeof equipBonus !== 'undefined' && equipBonus.effects && typeof skeletonState !== 'undefined') {
        for (const eff of equipBonus.effects) {
            if (eff.id === 'rune_deathless') { skeletonState._undyingUsed = false; break; }
        }
    }
    // Fixed waves exhausted — generate dynamic ones (no more victory screen, endless mode)
    let w;
    const waveArray = currentZone === 1 ? WAVES : currentZone === 2 ? ZONE2_WAVES : currentZone === 4 ? ZONE4_WAVES : currentZone === 5 ? ZONE5_WAVES : currentZone === 6 ? ZONE6_WAVES : (typeof PROCEDURAL_WAVES !== 'undefined' && PROCEDURAL_WAVES[currentZone]) ? PROCEDURAL_WAVES[currentZone] : ZONE3_WAVES;
    if (wave.current < waveArray.length) {
        w = waveArray[wave.current];
    } else {
        w = generateDynamicWave(wave.current);
    }

    wave.phase = 'countdown';
    wave.timer = w.isBossWave ? 5.0 : 4.0; // longer countdown for boss waves

    // Boss wave gets dramatic entrance
    if (w.isBossWave) {
        wave.bannerText = w.title;
        wave.bannerSub = 'A powerful enemy approaches...';
        wave.bannerAlpha = 1;
        addScreenShake(8, 0.6);
        addSlowMo(0.4, 0.25); // dramatic slow-mo before boss spawns
        addHitPause(0.15);    // world freezes briefly
        // Darken the screen for boss approach (vignette)
        if (typeof dmgVignetteIntensity !== 'undefined') {
            dmgVignetteIntensity = 0.5; dmgVignetteTimer = 1.5;
        }
        // Play boss-specific music if available, otherwise use normal wave rotation
        let combatTrack = null;
        if (typeof BOSS_MUSIC !== 'undefined' && w.enemies) {
            for (const eg of w.enemies) {
                if (BOSS_MUSIC[eg.type]) { combatTrack = BOSS_MUSIC[eg.type]; break; }
            }
        }
        if (!combatTrack) {
            const musicArray = currentZone === 1 ? WAVE_MUSIC : currentZone === 2 ? ZONE2_WAVE_MUSIC : currentZone === 3 ? ZONE3_WAVE_MUSIC : currentZone === 4 ? ZONE4_WAVE_MUSIC : currentZone === 5 ? ZONE5_WAVE_MUSIC : currentZone === 6 ? ZONE6_WAVE_MUSIC : WAVE_MUSIC;
            combatTrack = musicArray[Math.min(wave.current, musicArray.length - 1)];
        }
        playMusic(combatTrack, 1.5);
        return;
    }

    // Atmospheric wave announcements — no numbers, keep the player guessing
    const ZONE_STIR_MESSAGES = {
        1: [
            { text: 'The Dungeon Stirs', sub: 'Something awakens in the dark...' },
            { text: 'The Dead Rise', sub: 'They know you are here.' },
            { text: 'Arrow and Bone', sub: 'More are coming.' },
            { text: 'The Crypt Opens', sub: 'Sealed passages give way.' },
            { text: 'The Deep Stirs', sub: 'No mercy from what lies beneath.' },
            { text: 'The Undercroft\'s Last Stand', sub: 'The guardians stir. They protect something below.' },
            { text: 'The Slime King Emerges', sub: 'A powerful enemy approaches...' },
        ],
        2: [
            { text: 'Bones Ascend', sub: 'Ancient guardians stir...' },
            { text: 'The Guard Post', sub: 'The tower descends upon you.' },
            { text: 'Iron and Arrows', sub: 'Reinforcements surge forth.' },
            { text: 'The Tower Crumbles', sub: 'The ruins shift and groan.' },
            { text: 'Death From Above', sub: 'Arrows rain from the heights.' },
            { text: 'Endless Legions', sub: 'They will not stop.' },
            { text: 'The Bone Colossus Rises', sub: 'These bones served the covenant once. Now they serve no one.' },
        ],
        3: [
            { text: 'The Spire\'s Guard', sub: 'Eyes gleam in the heights above...' },
            { text: 'Sentinels of Stone', sub: 'The garrison holds fast.' },
            { text: 'The Garrison Falls', sub: 'The spire trembles.' },
            { text: 'The Ascent', sub: 'Higher. Always higher.' },
            { text: 'Summit of Bone', sub: 'The wind carries death.' },
            { text: 'The Heights Rage', sub: 'No shelter at the peak.' },
            { text: 'The Beast Awakens', sub: 'The spire was her watchtower. She saw everything from here.' },
        ],
        4: [
            { text: 'The Inferno Awakens', sub: 'Heat scorches the very air...' },
            { text: 'Burning Legions', sub: 'The inferno hungers for you.' },
            { text: 'The Damned March', sub: 'Hellfire surges forth.' },
            { text: 'Blood and Fire', sub: 'The pits demand sacrifice.' },
            { text: 'Hellfire Gauntlet', sub: 'There is no escape from the flames.' },
            { text: 'The Forge Calls', sub: 'Only ruin remains.' },
            { text: 'The Infernal Knight Descends', sub: 'The fire was her last barrier. She set the world ablaze to buy time.' },
        ],
        5: [
            { text: 'The Abyss Stirs', sub: 'Something stirs beneath...' },
            { text: 'Frozen Legions', sub: 'The abyss will not release you.' },
            { text: 'Arrows of Ice', sub: 'Cold embrace.' },
            { text: 'The Deep Freeze', sub: 'The dead rise from frost.' },
            { text: 'The Dead March', sub: 'There is no warmth here.' },
            { text: 'Abyss Unbound', sub: 'Shatter.' },
            { text: 'The Wyrm Awakens', sub: "The cold is the covenant's edge. Beyond this, only the throne." },
        ],
        6: [
            { text: 'Ruin Awakens', sub: 'Your end awaits...' },
            { text: 'Echoes of the Fallen', sub: 'The walls close in.' },
            { text: 'The Ruined Guard', sub: 'The Throne demands blood.' },
            { text: 'Endless Ruin', sub: 'The dead outnumber the living.' },
            { text: 'The Last Stand', sub: 'No mercy.' },
            { text: 'The World Breaks', sub: 'This is where it ends.' },
            { text: 'THE THRONE FALLS', sub: 'You feel her now. Tired. Waiting. She knew you would come.' },
        ],
    };
    const STIR_MESSAGES = ZONE_STIR_MESSAGES[currentZone] || ZONE_STIR_MESSAGES[1];
    // Cycle through messages, then reuse for endless waves
    const msg = STIR_MESSAGES[Math.min(wave.current, STIR_MESSAGES.length - 1)];
    wave.bannerText = wave.current >= STIR_MESSAGES.length
        ? generateDynamicWave(wave.current).title
        : msg.text;
    wave.bannerSub = wave.current >= STIR_MESSAGES.length
        ? ''
        : msg.sub;
    wave.bannerAlpha = 1;

    // Play combat music for this wave (cycle through combat tracks based on zone)
    const musicArray = currentZone === 1 ? WAVE_MUSIC : currentZone === 2 ? ZONE2_WAVE_MUSIC : currentZone === 3 ? ZONE3_WAVE_MUSIC : currentZone === 4 ? ZONE4_WAVE_MUSIC : currentZone === 5 ? ZONE5_WAVE_MUSIC : currentZone === 6 ? ZONE6_WAVE_MUSIC : WAVE_MUSIC;
    const combatTrack = musicArray[Math.min(wave.current, musicArray.length - 1)];
    playMusic(combatTrack, 1.5);

    // Roll wave modifier (40% chance on wave 3+, never on boss/expansion waves)
    wave.modifier = null;
    wave.modifierTimer = 0;
    if (w && !w.isBossWave && !w.isExpansionTrigger && wave.current >= 2 && Math.random() < 0.4) {
        wave.modifier = WAVE_MODIFIERS[_WAVE_MOD_KEYS[Math.floor(Math.random() * _WAVE_MOD_KEYS.length)]];
        if (wave.modifier.timerDuration) wave.modifierTimer = wave.modifier.timerDuration;
    }
    // Fixed waves can specify a modifier
    if (w && w.modifier && WAVE_MODIFIERS[w.modifier]) {
        wave.modifier = WAVE_MODIFIERS[w.modifier];
        if (wave.modifier.timerDuration) wave.modifierTimer = wave.modifier.timerDuration;
    }
    // Show modifier in banner subtitle
    if (wave.modifier) {
        wave.bannerSub = '[' + wave.modifier.name + '] ' + wave.modifier.desc;
    }
}

function spawnWaveEnemies() {
    let waveArray;
    if (currentZone === 1) waveArray = WAVES;
    else if (currentZone === 2) waveArray = ZONE2_WAVES;
    else if (currentZone === 3) waveArray = ZONE3_WAVES;
    else if (currentZone === 4) waveArray = ZONE4_WAVES;
    else if (currentZone === 5) waveArray = ZONE5_WAVES;
    else if (currentZone === 6) waveArray = ZONE6_WAVES;
    else if (typeof PROCEDURAL_WAVES !== 'undefined' && PROCEDURAL_WAVES[currentZone]) waveArray = PROCEDURAL_WAVES[currentZone];
    else waveArray = WAVES; // fallback

    const w = wave.current < waveArray.length ? waveArray[wave.current] : generateDynamicWave(wave.current);
    const mult = w.statMult;

    // Build flat list of enemies to spawn
    const toSpawn = [];
    const _modCountMult = (wave.modifier && wave.modifier.enemyCountMult) ? wave.modifier.enemyCountMult : 1;
    for (const group of w.enemies) {
        const count = Math.round(group.count * _modCountMult);
        for (let i = 0; i < count; i++) {
            toSpawn.push(group.type);
        }
    }

    // Build spawn zones via BFS from player — only tiles the player can reach
    // This prevents enemies spawning behind sealed walls in unexpanded areas
    let zones = [];
    const ms = floorMap.length;
    const _spawnVis = Array.from({ length: ms }, () => Array(ms).fill(false));
    const _spawnQ = [[ Math.floor(player.row), Math.floor(player.col) ]];
    _spawnVis[_spawnQ[0][0]][_spawnQ[0][1]] = true;
    let _spawnQHead = 0;
    while (_spawnQHead < _spawnQ.length) {
        const [sr, sc] = _spawnQ[_spawnQHead++];
        if (!objectMap[sr][sc]) zones.push({ r: sr, c: sc });
        for (const [dr, dc] of [[0,1],[0,-1],[1,0],[-1,0]]) {
            const nr = sr + dr, nc = sc + dc;
            if (nr >= 0 && nr < ms && nc >= 0 && nc < ms &&
                !_spawnVis[nr][nc] && floorMap[nr][nc] && !blocked[nr][nc]) {
                _spawnVis[nr][nc] = true;
                _spawnQ.push([nr, nc]);
            }
        }
    }
    zones.sort(() => Math.random() - 0.5);

    // Filter zones by minimum spawn distance — scales with zone difficulty
    const scaledMinDist = ENEMY_SPAWN_MIN_DISTANCE + Math.min(SPAWN_DIST_MAX_BONUS, (currentZone || 0) * SPAWN_DIST_ZONE_SCALE);
    const validZones = zones.filter(z => {
        const dr = z.r - player.row;
        const dc = z.c - player.col;
        return Math.sqrt(dr * dr + dc * dc) > scaledMinDist;
    });

    // --- SpawnZone bias: prefer tiles inside the wave's target room ---
    // If the wave defines a spawnZone bounding box, 80% of spawns go inside it.
    // Remaining 20% spawn outside for flanking pressure. Falls back to global
    // pool if the box doesn't have enough valid tiles.
    let useZones;
    if (w.spawnZone) {
        const sz = w.spawnZone;
        const inside = validZones.filter(z => z.r >= sz.rMin && z.r <= sz.rMax && z.c >= sz.cMin && z.c <= sz.cMax);
        const outside = validZones.filter(z => z.r < sz.rMin || z.r > sz.rMax || z.c < sz.cMin || z.c > sz.cMax);
        if (inside.length >= Math.ceil(toSpawn.length * 0.5)) {
            // Enough room tiles — build biased list: 80% inside, 20% outside
            const biased = [];
            const insideCount = Math.ceil(toSpawn.length * 0.8);
            for (let i = 0; i < insideCount && i < inside.length; i++) biased.push(inside[i]);
            for (let i = 0; i < toSpawn.length - biased.length && i < outside.length; i++) biased.push(outside[i]);
            // Pad with inside tiles if outside didn't have enough
            while (biased.length < toSpawn.length && inside.length > 0) biased.push(inside[biased.length % inside.length]);
            useZones = biased;
        } else {
            // Not enough tiles in target room — fall back to global
            useZones = validZones.length >= toSpawn.length ? validZones : zones;
        }
    } else {
        // No spawnZone defined — use original behavior
        useZones = validZones.length >= toSpawn.length ? validZones : zones;
    }

    // Guard: if no valid spawn zones exist, skip this wave tick
    if (!useZones || useZones.length === 0) {
        console.warn('No valid spawn zones found — skipping spawn');
        wave.enemiesAlive = 0;
        wave.phase = 'fighting';
        return;
    }

    // Stagger attack cooldowns by type so enemies don't all fire at once
    const typeIndex = {}; // track spawn index per type for stagger offset
    for (let i = 0; i < toSpawn.length; i++) {
        const zone = useZones[i % useZones.length];
        const offR = (Math.random() - 0.5) * 0.4;
        const offC = (Math.random() - 0.5) * 0.4;
        const type = toSpawn[i];
        typeIndex[type] = (typeIndex[type] || 0) + 1;
        const e = spawnEnemy(type, zone.r + offR, zone.c + offC, mult);
        // Stagger: each enemy of same type gets a different initial cooldown window
        if (e) e.attackCooldown = ENEMY_STAGGER_COOLDOWN * typeIndex[type] + Math.random() * ENEMY_STAGGER_VARIANCE;
    }

    wave.enemiesAlive = toSpawn.length;
    wave.phase = 'fighting';
    // Start combat audio pulse (rhythmic sub-bass during active waves)
    if (typeof startCombatPulse === 'function') startCombatPulse();

    // Tutorial hints — show once per session at key moments
    // Delayed so they don't stack with wave banners (banner fades over ~3-4s)
    if (typeof Notify !== 'undefined') {
        if (wave.current === 0) {
            const _form = FormSystem.currentForm;
            const _dodgeKey = _form === 'slime' ? 'SPACE to Bounce Jump' : _form === 'skeleton' ? 'SPACE to Roll' : _form === 'lich' ? 'SPACE to Shadow Step' : 'SPACE to Phase Jump';
            setTimeout(function() {
                Notify.hint('tutorial_dodge', _dodgeKey + ' — dodge through danger!', 5, { color: '#88ccff', borderColor: '#446688' });
            }, 4000);
        }
        if (wave.current === 1) {
            setTimeout(function() {
                Notify.hint('tutorial_grimoire', 'Press TAB to open the Grimoire — check your stats and gear.', 5, { color: '#c4a878', borderColor: '#8a7030' });
            }, 4000);
        }
    }
}

function updateWaveSystem(dt) {
    // Safe zones — no wave updates
    if (wave.phase === 'done') return;
    const _wCfg = ZONE_CONFIGS[currentZone];
    if (_wCfg && !_wCfg.hasWaves) { wave.phase = 'done'; enemies.length = 0; return; }

    if (wave.phase === 'pre') {
        wave.timer -= dt;
        if (wave.timer <= 0) {
            beginNextWave();
        }
        return;
    }

    if (wave.phase === 'countdown') {
        wave.timer -= dt;
        wave.bannerAlpha = Math.min(1, wave.bannerAlpha + dt * 3);
        if (wave.timer <= 0) {
            spawnWaveEnemies();
            sfxWaveStart();
            // Banner stays for a moment then fades
            wave.timer = 1.5;
        }
        return;
    }

    if (wave.phase === 'fighting') {
        // Wave modifier tick effects
        if (wave.modifier) {
            if (wave.modifier.lightMult) lightRadius = MAX_LIGHT * wave.modifier.lightMult;
            if (wave.modifier.timerDuration) {
                wave.modifierTimer -= dt;
                // Timer expired before wave cleared — lose the bonus
                if (wave.modifierTimer <= 0) { wave.modifierTimer = 0; }
            }
        }
        // Spawn zone-specific environmental hazards during combat
        if (typeof spawnEnvironmentHazards === 'function') spawnEnvironmentHazards(dt);
        // Abyss hazard surge: more frequent hazard spawning at milestone depths
        if (typeof abyssDepthFlags !== 'undefined' && abyssDepthFlags.hazardSurge && typeof _envHazardTimer !== 'undefined') {
            if (_envHazardTimer > 4) _envHazardTimer = 3 + Math.random() * 3; // 2x spawn rate
        }
        // Fade banner out
        if (wave.timer > 0) {
            wave.timer -= dt;
            wave.bannerAlpha = Math.max(0, wave.timer / 1.5);
        }

        // Count living enemies
        wave.enemiesAlive = enemies.filter(e => e.state !== 'death').length;

        // Wave cleared?
        if (wave.enemiesAlive <= 0 && enemies.length === 0) {
            // Fade out combat audio pulse
            if (typeof stopCombatPulse === 'function') stopCombatPulse();
            // Check if this is the final wave of the current zone
            const finalWaveIdx = currentZone === 1 ? ZONE_1_FINAL_WAVE
                : currentZone === 2 ? ZONE_2_FINAL_WAVE
                : currentZone === 4 ? ZONE_4_FINAL_WAVE
                : currentZone === 5 ? ZONE_5_FINAL_WAVE
                : currentZone === 6 ? ZONE_6_FINAL_WAVE
                : ZONE_3_FINAL_WAVE;
            if (wave.current === finalWaveIdx) {
                wave.phase = 'zoneClear';
                wave.timer = 6.0;
                // Auto-save on zone completion
                saveGame(getAutoSaveSlot());
                if (currentZone === 1) {
                    wave.bannerText = 'The Darkness Recedes';
                    wave.bannerSub = 'Something glimmers where the last creature fell...';
                    dropKeyItemInWorld(wave.lastDeathRow, wave.lastDeathCol, 'chest_key');
                } else if (currentZone === 2) {
                    wave.bannerText = 'The Tower\'s Fury Breaks';
                    wave.bannerSub = 'An ancient artifact gleams amid the carnage...';
                    dropKeyItemInWorld(wave.lastDeathRow, wave.lastDeathCol, 'zone2_chest_key');
                } else if (currentZone === 3) {
                    wave.bannerText = 'The Beast Falls';
                    wave.bannerSub = 'Light streams from the spire\'s peak...';
                    // Werewolf boss drops key directly in updateEnemies
                    // Trigger vision flash after a short delay
                    setTimeout(() => {
                        if (typeof visionFlashTimer !== 'undefined') {
                            visionFlashTimer = 0;
                            gamePhase = 'visionFlash';
                        }
                    }, 4000);
                } else if (currentZone === 4) {
                    wave.bannerText = 'The Inferno Wanes';
                    wave.bannerSub = 'A frozen passage reveals itself...';
                    dropKeyItemInWorld(wave.lastDeathRow, wave.lastDeathCol, 'zone4_key');
                } else if (currentZone === 5) {
                    wave.bannerText = 'The Abyss Shatters';
                    wave.bannerSub = 'An ancient throne beckons below...';
                    dropKeyItemInWorld(wave.lastDeathRow, wave.lastDeathCol, 'zone5_key');
                    // Second vision flash — Elara reaches out
                    setTimeout(function() {
                        if (typeof visionFlashTimer !== 'undefined') {
                            // Store Zone 5 vision text for the vision flash renderer
                            window._visionFlashZone5 = true;
                            visionFlashTimer = 0;
                            gamePhase = 'visionFlash';
                        }
                    }, 4000);
                } else if (currentZone === 6) {
                    wave.bannerText = 'THE PALE STIRS';
                    wave.bannerSub = 'The guardians fall silent... She is waiting.';
                    // Don't set victory — let the player talk to the Pale Queen NPC
                    currentObjective = 'Speak to Elara.';
                }
                wave.bannerAlpha = 1;
                playSting('waveCleared');
                // Fade to calmer music
                playMusic('menu', 3.0);
            } else {
                const _zoneWaves = { 1: WAVES, 2: ZONE2_WAVES, 3: ZONE3_WAVES, 4: ZONE4_WAVES, 5: ZONE5_WAVES, 6: ZONE6_WAVES };
                const currentWaveDef = (_zoneWaves[currentZone] || WAVES)[wave.current];

                // Check if this wave triggers zone expansion
                if (currentWaveDef && currentWaveDef.isExpansionTrigger) {
                    wave.phase = 'expanding';
                    wave.timer = 6.0; // total expansion sequence time
                    const expCfg = ZONE_EXPANSIONS[currentZone];
                    if (expCfg) {
                        // Run the physical map expansion
                        expandZone(currentZone);
                        // Recalculate fog of war so newly accessible tiles are revealed
                        if (typeof updateFogOfWar === 'function') updateFogOfWar();
                        // ── SEAL BREAK CINEMATIC — dramatic multi-layer event ──
                        // Hit pause (150ms freeze frame at moment of impact)
                        addHitPause(0.15);
                        // Slow-mo (800ms at 0.15x — let it breathe)
                        addSlowMo(0.8, 0.15);
                        // Heavy screen shake (longer, more intense)
                        addScreenShake((expCfg.shakeIntensity || 6) * 1.5, (expCfg.shakeDuration || 1.0) * 1.3);
                        // Camera zoom out briefly (show the newly opened area)
                        if (typeof addCameraZoom === 'function') addCameraZoom(0.96, 2.5);
                        // Larger dust/debris burst at expansion point
                        if (expCfg.cameraTarget && typeof spawnParticleBurst === 'function') {
                            spawnParticleBurst(expCfg.cameraTarget.r, expCfg.cameraTarget.c, 40, '#8a7a60');
                            // Secondary ring of brighter particles
                            spawnParticleBurst(expCfg.cameraTarget.r, expCfg.cameraTarget.c, 20, '#c4b090');
                        }
                        // White screen flash — sells the explosive moment
                        if (typeof triggerScreenFlash === 'function') triggerScreenFlash(0.3, '#ffffff');
                        if (typeof sfxExplosion === 'function') sfxExplosion(); // deep rumble SFX
                        // Banner
                        wave.bannerText = expCfg.bannerText || 'The way opens...';
                        wave.bannerSub = expCfg.bannerSub || '';
                        wave.bannerAlpha = 1;
                        playSting('waveCleared');
                    }
                    // Heal player on expansion (same as wave clear heal)
                    const expHealMaxHp = getPlayerMaxHP();
                    const expHealAmt = Math.round(expHealMaxHp * 0.20);
                    player.hp = Math.min(expHealMaxHp, player.hp + expHealAmt);
                    pickupTexts.push({
                        text: `+${expHealAmt} HP`,
                        color: '#44dd66',
                        row: player.row, col: player.col,
                        offsetY: 0, life: 2.0,
                    });
                    if (typeof spawnHealBurst === 'function') {
                        const _hp = tileToScreen(player.row, player.col);
                        spawnHealBurst(_hp.x + cameraX, _hp.y + cameraY);
                    }
                    duckMusic(true);
                    // Talisman drop after wave 2 in zone 1 (for slime form) — moved here since wave 2 is also the expansion trigger
                    if (currentZone === 1 && wave.current === 2 && FormSystem.currentForm === 'slime') {
                        spawnTalismanDrop();
                    }
                } else if (currentWaveDef && currentWaveDef.isBossWave) {
                    wave.phase = 'cleared';
                    wave.timer = 10.0; // longer breather after boss
                    wave.bannerText = 'Boss Defeated';
                    wave.bannerSub = 'The way ahead opens...';
                    wave.bannerAlpha = 1;
                    wave.tensionPhase = 0;
                    playSting('waveCleared');
                    if (typeof Notify !== 'undefined') {
                        Notify.toast(wave.waveKills + ' kills — Boss slain!', { duration: 3, color: '#e8c840', borderColor: '#8a7030' });
                    }
                    // Wave clear HP heal — 15% of max HP
                    const waveHealMaxHp = getPlayerMaxHP();
                    const waveHealAmt = Math.round(waveHealMaxHp * 0.15);
                    player.hp = Math.min(waveHealMaxHp, player.hp + waveHealAmt);
                    pickupTexts.push({
                        text: `+${waveHealAmt} HP`,
                        color: '#44dd66',
                        row: player.row, col: player.col,
                        offsetY: 0, life: 2.0,
                    });
                    if (typeof spawnHealBurst === 'function') {
                        const _hp2 = tileToScreen(player.row, player.col);
                        spawnHealBurst(_hp2.x + cameraX, _hp2.y + cameraY);
                    }
                    // Boss kill bonus gold
                    if (typeof playerGold !== 'undefined') {
                        const bossBonus = 100 + currentZone * 50;
                        playerGold += bossBonus;
                        pickupTexts.push({ text: '+' + bossBonus + ' GOLD', color: '#ffd700', row: player.row, col: player.col, offsetY: -20, life: 2.5 });
                        if (typeof sfxGoldPickup === 'function') sfxGoldPickup();
                    }
                    // Spawn a town return portal near the player after boss kill
                    // Find a free tile near the player to place the portal stairs
                    const _portalR = Math.floor(player.row);
                    const _portalC = Math.floor(player.col);
                    let _pr = -1, _pc = -1;
                    // Try positions 2 tiles away from player, expanding outward
                    const _portalOffsets = [
                        [0,2],[0,-2],[2,0],[-2,0],       // cardinal, 2 away
                        [1,2],[-1,2],[1,-2],[-1,-2],     // diagonals at dist 2
                        [2,1],[2,-1],[-2,1],[-2,-1],
                        [0,3],[0,-3],[3,0],[-3,0],       // 3 away
                    ];
                    for (const [_dr, _dc] of _portalOffsets) {
                        const _tr = _portalR + _dr, _tc = _portalC + _dc;
                        if (_tr >= 0 && _tr < MAP_SIZE && _tc >= 0 && _tc < MAP_SIZE && !blocked[_tr][_tc] && !objectMap[_tr][_tc]) {
                            _pr = _tr; _pc = _tc; break;
                        }
                    }
                    // Place the portal stairs object
                    if (_pr >= 0 && _pr < MAP_SIZE && _pc >= 0 && _pc < MAP_SIZE) {
                        floorMap[_pr][_pc] = 'stairs';
                        objectMap[_pr][_pc] = 'stairsSpiral';
                        // Register as a door with town destination
                        if (typeof DOOR_DEFS !== 'undefined') {
                            DOOR_DEFS[`${_pr},${_pc}`] = {
                                requiresKey: null,
                                label: 'Return to Hamlet',
                                destination: 'town',
                            };
                        }
                        pickupTexts.push({
                            text: 'A way back to the Hamlet appears...',
                            color: '#88ccff',
                            row: _pr, col: _pc,
                            offsetY: -30, life: 4.0,
                        });
                    }
                    duckMusic(true);
                } else {
                    wave.phase = 'cleared';
                    wave.timer = 8.0;
                    wave.bannerText = 'The darkness recedes...';
                    wave.bannerSub = '';
                    wave.bannerAlpha = 1;
                    wave.tensionPhase = 0; // 0=calm, 1=building tension
                    playSting('waveCleared');
                    // Wave modifier rewards
                    if (wave.modifier && wave.modifier.timerDuration && wave.modifierTimer > 0) {
                        // Timed Trial cleared in time — bonus XP
                        const bonusXP = Math.round(wave.waveKills * 5 * wave.modifier.xpBonusMult);
                        xpState.xp += bonusXP;
                        if (typeof Notify !== 'undefined') {
                            Notify.toast('TIMED CLEAR! +' + bonusXP + ' bonus XP', { duration: 3, color: '#ffcc44', borderColor: '#aa8800' });
                        }
                        pickupTexts.push({ text: '+' + bonusXP + ' XP', color: '#ffcc44', row: player.row, col: player.col, offsetY: -25, life: 1.5 });
                    }
                    // Wave clear stats toast
                    if (typeof Notify !== 'undefined') {
                        const modSuffix = (wave.modifier && wave.modifier.goldMult > 1) ? '  [2x Gold]' : '';
                        Notify.toast(wave.waveKills + ' kills' + modSuffix, { duration: 2.5, color: '#c4a878', borderColor: '#8a7030' });
                    }
                    // Wave clear HP heal — 15% of max HP
                    const waveHealMaxHp2 = getPlayerMaxHP();
                    const waveHealAmt = Math.round(waveHealMaxHp2 * 0.15);
                    player.hp = Math.min(waveHealMaxHp2, player.hp + waveHealAmt);
                    pickupTexts.push({
                        text: `+${waveHealAmt} HP`,
                        color: '#44dd66',
                        row: player.row, col: player.col,
                        offsetY: 0, life: 2.0,
                    });
                    // Dip music to ambient during calm phase
                    duckMusic(true);
                    // Talisman drop after wave 2 in zone 1 (for slime form)
                    if (currentZone === 1 && wave.current === 2 && FormSystem.currentForm === 'slime') {
                        spawnTalismanDrop();
                    }

                    // --- Zone 1 Alcove mini-seal: open Secret Alcove after wave 1 ---
                    if (currentZone === 1 && wave.current === 0 && z1AlcoveSealTiles && z1AlcoveSealTiles.length > 0) {
                        for (const t of z1AlcoveSealTiles) {
                            blocked[t.r][t.c] = false;
                            blockType[t.r][t.c] = null;
                            floorMap[t.r][t.c] = 'stone';
                        }
                        z1AlcoveSealTiles = []; // consumed
                        addScreenShake(3, 0.5);
                        if (typeof updateFogOfWar === 'function') updateFogOfWar();
                    }
                }
            }
        }
        return;
    }

    if (wave.phase === 'expanding') {
        wave.timer -= dt;
        // Fade banner
        if (wave.timer < 3.0) {
            wave.bannerAlpha = Math.max(0, wave.timer / 3.0);
        }
        if (wave.timer <= 0) {
            // Expansion complete — transition to normal cleared → next wave flow
            wave.phase = 'pre';
            wave.timer = 5.0; // calm before Act 2 begins
            wave.bannerText = '';
            wave.bannerSub = '';
            wave.bannerAlpha = 0;
        }
        return;
    }

    if (wave.phase === 'cleared') {
        wave.timer -= dt;

        // Phase 1 (first 5s): calm — banner fades, music ducked, light steady
        if (wave.timer > 3.0) {
            lightRadius = MAX_LIGHT; // keep light full during calm phase
            wave.bannerAlpha = Math.max(0, (wave.timer - 6.0) / 2.0);
            wave.tensionPhase = 0;
        }
        // Phase 2 (last 3s): tension building — flicker increases, ambient cues
        else {
            if (wave.tensionPhase === 0) {
                wave.tensionPhase = 1;
                duckMusic(false); // restore music as tension builds
            }
            // Pulse the light down slightly to create unease
            const tensionProgress = 1 - (wave.timer / 3.0);
            lightRadius = Math.max(MAX_LIGHT * 0.7, MAX_LIGHT - tensionProgress * (MAX_LIGHT * 0.3));
        }

        if (wave.timer <= 0) {
            // Restore some HP/mana between waves as a reward
            const eb = getEquipBonuses();
            const maxHP = getPlayerMaxHP();
            const healAmt = Math.max(25, Math.floor(maxHP * 0.20));
            player.hp = Math.min(maxHP, player.hp + healAmt);
            player.mana = MAX_MANA + (eb.maxManaBonus || 0);
            // Visual feedback for between-wave heal (was invisible)
            pickupTexts.push({ text: '+' + healAmt + ' HP', color: '#44dd66', row: player.row, col: player.col, offsetY: -8, life: 1.5 });
            if (typeof spawnHealBurst === 'function') {
                var _hbPos = tileToScreen(player.row, player.col);
                spawnHealBurst(_hbPos.x + cameraX, _hbPos.y + cameraY);
            }
            beginNextWave();
        }
        return;
    }

    if (wave.phase === 'zoneClear') {
        wave.timer -= dt;
        // Banner fades slowly — let it breathe
        if (wave.timer < 3.0) {
            wave.bannerAlpha = Math.max(0, wave.timer / 3.0);
        }
        // Restore full HP/mana — zone reward
        if (wave.timer <= 5.5 && wave.timer > 5.3) {
            const eb = getEquipBonuses();
            player.hp = getPlayerMaxHP();
            player.mana = MAX_MANA + (eb.maxManaBonus || 0);
        }
        // Zone clear stays indefinitely — player explores, opens chest, finds door
        return;
    }

    if (wave.phase === 'victory') {
        wave.bannerAlpha = Math.min(1, wave.bannerAlpha + dt * 2);
        // Victory state — game stays in this mode
        return;
    }
}

// ----- DRAW WAVE BANNER -----
// ----- HELPER: decorative line separator -----
function drawDecorLine(cx, y, halfW, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    // Center line — faded gradient from edges to bright center
    const lg = ctx.createLinearGradient(cx - halfW, y, cx + halfW, y);
    lg.addColorStop(0, 'rgba(168, 144, 96, 0)');
    lg.addColorStop(0.2, 'rgba(168, 144, 96, 0.6)');
    lg.addColorStop(0.5, 'rgba(212, 196, 160, 0.9)');
    lg.addColorStop(0.8, 'rgba(168, 144, 96, 0.6)');
    lg.addColorStop(1, 'rgba(168, 144, 96, 0)');
    ctx.strokeStyle = lg;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - halfW, y);
    ctx.lineTo(cx + halfW, y);
    ctx.stroke();
    // Small diamond at center — clean closed path
    ctx.fillStyle = '#c4a878';
    ctx.beginPath();
    ctx.moveTo(cx, y - 3);
    ctx.lineTo(cx + 3, y);
    ctx.lineTo(cx, y + 3);
    ctx.lineTo(cx - 3, y);
    ctx.closePath();
    ctx.fill();
    // Tiny inner highlight for polish
    ctx.globalAlpha = alpha * 0.5;
    ctx.fillStyle = '#e8dcc0';
    ctx.beginPath();
    ctx.moveTo(cx, y - 1.5);
    ctx.lineTo(cx + 1.5, y);
    ctx.lineTo(cx, y + 1.5);
    ctx.lineTo(cx - 1.5, y);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
}

function drawWaveBanner() {
    if (wave.bannerAlpha <= 0) return;
    if (window.zoneBannerTimer > 0) return; // suppress while zone banner showing

    ctx.save();
    const cx = canvasW / 2;

    if (wave.phase === 'victory') {
        const cy = canvasH / 2;

        // Full dark overlay
        ctx.globalAlpha = wave.bannerAlpha * 0.7;
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvasW, canvasH);

        // Warm golden radial glow
        ctx.globalAlpha = wave.bannerAlpha * 0.35;
        const glow = ctx.createRadialGradient(cx, cy - 10, 0, cx, cy - 10, 350);
        glow.addColorStop(0, 'rgba(255, 210, 80, 0.5)');
        glow.addColorStop(0.4, 'rgba(200, 150, 40, 0.15)');
        glow.addColorStop(1, 'rgba(80, 50, 10, 0)');
        ctx.fillStyle = glow;
        ctx.fillRect(cx - 400, cy - 250, 800, 500);

        ctx.globalAlpha = wave.bannerAlpha;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        drawDecorLine(cx, cy - 55, 160, wave.bannerAlpha * 0.6);

        ctx.font = '44px Georgia';
        ctx.fillStyle = '#ffd866';
        ctx.shadowColor = 'rgba(255, 180, 40, 0.5)';
        ctx.shadowBlur = 24;
        ctx.fillText(wave.bannerText, cx, cy - 20);
        ctx.shadowBlur = 0;

        drawDecorLine(cx, cy + 10, 160, wave.bannerAlpha * 0.6);

        ctx.font = 'italic 18px Georgia';
        ctx.fillStyle = '#d4b87a';
        ctx.globalAlpha = wave.bannerAlpha * 0.8;
        ctx.fillText(wave.bannerSub, cx, cy + 42);

        ctx.font = '12px monospace';
        ctx.fillStyle = '#8a7a5a';
        ctx.globalAlpha = wave.bannerAlpha * (0.3 + Math.sin(performance.now() / 800) * 0.15);
        ctx.letterSpacing = '3px';
        ctx.fillText('THE DUNGEON FALLS SILENT...', cx, cy + 85);

    } else if (wave.phase === 'cleared' && wave.tensionPhase === 1) {
        // Tension building: no text needed, just visual ambiance handled here
    } else if (wave.phase === 'countdown') {
        // ── SLIM TOP RIBBON — wave title + countdown, out of gameplay center ──
        const ry = 36; // top of screen, below minimap area
        const ribbonH = 44;

        // Dark ribbon background — fade from edges
        ctx.globalAlpha = wave.bannerAlpha * 0.55;
        const bandGrad = ctx.createLinearGradient(cx - 300, 0, cx + 300, 0);
        bandGrad.addColorStop(0, 'rgba(0,0,0,0)');
        bandGrad.addColorStop(0.15, 'rgba(0,0,0,0.7)');
        bandGrad.addColorStop(0.85, 'rgba(0,0,0,0.7)');
        bandGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = bandGrad;
        ctx.fillRect(cx - 300, ry - ribbonH / 2, 600, ribbonH);

        ctx.globalAlpha = wave.bannerAlpha;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Wave title — clean, moderate size
        ctx.font = '22px Georgia';
        ctx.fillStyle = '#e8d4aa';
        ctx.shadowColor = 'rgba(200, 160, 80, 0.3)';
        ctx.shadowBlur = 8;
        ctx.fillText(wave.bannerText, cx, ry - 4);
        ctx.shadowBlur = 0;

        // Subtitle (modifier info or atmospheric text) — smaller, below title
        if (wave.bannerSub) {
            ctx.font = 'italic 11px Georgia';
            ctx.fillStyle = (wave.modifier && wave.modifier.color) ? wave.modifier.color : '#a09060';
            ctx.globalAlpha = wave.bannerAlpha * 0.7;
            ctx.fillText(wave.bannerSub, cx, ry + 13);
        }

        // Countdown integrated into ribbon — right side
        const countNum = Math.ceil(wave.timer);
        if (countNum > 0 && countNum <= 5) {
            ctx.font = 'bold 20px Georgia';
            ctx.globalAlpha = wave.bannerAlpha * 0.5;
            ctx.fillStyle = '#ffd070';
            ctx.fillText(countNum, cx + 200, ry - 2);
        }

    } else if (wave.phase === 'fighting' || wave.phase === 'cleared' || wave.phase === 'zoneClear') {
        // ── POST-WAVE: slim ribbon for clear messages ──
        const ry = 36;
        const isCleared = wave.phase === 'cleared' || wave.phase === 'zoneClear';
        const isZoneClear = wave.phase === 'zoneClear';

        ctx.globalAlpha = wave.bannerAlpha * 0.4;
        const bandGrad = ctx.createLinearGradient(cx - 250, 0, cx + 250, 0);
        bandGrad.addColorStop(0, 'rgba(0,0,0,0)');
        bandGrad.addColorStop(0.2, 'rgba(0,0,0,0.5)');
        bandGrad.addColorStop(0.8, 'rgba(0,0,0,0.5)');
        bandGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = bandGrad;
        ctx.fillRect(cx - 250, ry - 16, 500, 32);

        ctx.globalAlpha = wave.bannerAlpha;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        ctx.font = isZoneClear ? '20px Georgia' : '18px Georgia';
        ctx.fillStyle = isZoneClear ? '#e8d88c' : (isCleared ? '#b8c8a8' : '#d8c898');
        ctx.shadowColor = 'rgba(180, 150, 80, 0.3)';
        ctx.shadowBlur = 6;
        ctx.fillText(wave.bannerText, cx, ry);
        ctx.shadowBlur = 0;
    }

    // --- Tension phase visual cues (between waves) ---
    if (wave.phase === 'cleared' && wave.tensionPhase === 1) {
        const tensionAlpha = Math.min(1, (3.0 - wave.timer) / 2.0);
        // Vignette darkening at screen edges
        ctx.globalAlpha = tensionAlpha * 0.15;
        const edgeVig = ctx.createRadialGradient(
            canvasW / 2, canvasH / 2, canvasH * 0.3,
            canvasW / 2, canvasH / 2, canvasH * 0.75
        );
        edgeVig.addColorStop(0, 'rgba(0,0,0,0)');
        edgeVig.addColorStop(1, 'rgba(20,0,0,1)');
        ctx.fillStyle = edgeVig;
        ctx.fillRect(0, 0, canvasW, canvasH);
    }

    ctx.restore();
}

// ----- DRAW WAVE HUD (top-right, minimal atmospheric indicator) -----
// ── Kill Streak HUD — shows multiplier and decay timer ──
function drawKillStreakHUD() {
    if (killStreak.displayAlpha <= 0.01) return;
    if (wave.phase !== 'fighting') return;
    ctx.save();
    ctx.globalAlpha = killStreak.displayAlpha * 0.85;
    const sx = canvasW - 55;
    const sy = 90;
    const streakColor = killStreak.multiplier >= 3 ? '#ffd700' :
                        killStreak.multiplier >= 2 ? '#ff4444' :
                        killStreak.multiplier >= 1.5 ? '#ff8844' : '#887766';
    // Multiplier text
    if (killStreak.multiplier > 1) {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 18px Georgia';
        ctx.shadowColor = 'rgba(0,0,0,0.7)';
        ctx.shadowBlur = 4;
        ctx.fillStyle = streakColor;
        ctx.fillText(killStreak.multiplier.toFixed(1) + 'x', sx, sy);
        // Decay bar — drains as timer approaches window
        const barW = 32;
        const barH = 3;
        const filled = Math.max(0, 1 - (killStreak.timer / killStreak.window));
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(sx - barW / 2, sy + 14, barW, barH);
        ctx.fillStyle = streakColor;
        ctx.fillRect(sx - barW / 2, sy + 14, barW * filled, barH);
        // Kill count
        ctx.font = '9px monospace';
        ctx.globalAlpha = killStreak.displayAlpha * 0.5;
        ctx.fillStyle = '#bbaa99';
        ctx.fillText(killStreak.count + ' streak', sx, sy + 26);
    }
    ctx.restore();
}

function drawWaveHUD() {
    if (wave.phase !== 'fighting' && wave.phase !== 'cleared' && wave.phase !== 'countdown' && wave.phase !== 'zoneClear') return;

    ctx.save();
    const rx = canvasW - 20;
    const ry = 20;

    // Small subtle indicator — no numbers, just a vibe
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 2;

    if (wave.phase === 'fighting') {
        // Pulsing danger dot + "hostile" text
        const pulse = 0.5 + Math.sin(performance.now() / 400) * 0.3;
        ctx.globalAlpha = 0.7 * pulse;
        ctx.fillStyle = '#cc4433';
        ctx.beginPath();
        ctx.arc(rx - 8, ry + 10, 3, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = 0.4;
        ctx.textAlign = 'right';
        ctx.font = '11px monospace';
        ctx.fillStyle = '#aa6655';
        ctx.strokeText('HOSTILE', rx - 18, ry + 13);
        ctx.fillText('HOSTILE', rx - 18, ry + 13);

        // Wave modifier indicator
        if (wave.modifier) {
            ctx.globalAlpha = 0.6;
            ctx.font = 'bold 10px Georgia';
            ctx.fillStyle = wave.modifier.color;
            ctx.fillText(wave.modifier.name.toUpperCase(), rx - 10, ry + 28);
            // Timed modifier countdown
            if (wave.modifier.timerDuration && wave.modifierTimer > 0) {
                ctx.font = 'bold 14px monospace';
                ctx.globalAlpha = wave.modifierTimer < 10 ? 0.5 + Math.sin(performance.now() / 200) * 0.4 : 0.7;
                ctx.fillStyle = wave.modifierTimer < 10 ? '#ff4444' : '#ffcc44';
                ctx.fillText(Math.ceil(wave.modifierTimer) + 's', rx - 10, ry + 44);
            }
        }
    } else if (wave.phase === 'cleared' || wave.phase === 'zoneClear') {
        ctx.globalAlpha = 0.35;
        ctx.textAlign = 'right';
        ctx.font = '11px monospace';
        ctx.fillStyle = wave.phase === 'zoneClear' ? '#c4a878' : '#7a9a6a';
        const statusText = wave.phase === 'zoneClear' ? 'SAFE' : 'CALM';
        ctx.strokeText(statusText, rx - 10, ry + 13);
        ctx.fillText(statusText, rx - 10, ry + 13);
    }

    // Abyss rank display during procedural zones
    if (typeof currentZone !== 'undefined' && currentZone >= 100 && typeof getAbyssRank === 'function') {
        const rank = getAbyssRank();
        const depth = typeof abyssDepthFlags !== 'undefined' ? abyssDepthFlags.depth : (currentZone - 99);
        if (rank) {
            ctx.globalAlpha = 0.45;
            ctx.textAlign = 'right';
            ctx.font = '9px monospace';
            ctx.fillStyle = rank.tint || '#887766';
            ctx.fillText(rank.name.toUpperCase() + '  \u2014  Depth ' + depth, rx - 10, ry + 52);
        }
        // Show active modifier count
        if (typeof activeModifiers !== 'undefined' && activeModifiers.length > 0) {
            ctx.globalAlpha = 0.3;
            ctx.font = '8px monospace';
            ctx.fillStyle = '#cc4488';
            ctx.fillText(activeModifiers.length + ' modifier' + (activeModifiers.length > 1 ? 's' : ''), rx - 10, ry + 64);
        }
    }

    ctx.restore();
}

// ----- BOSS HEALTH BAR (top center) -----
function drawBossHealthBar() {
    // Find any alive boss enemy
    const boss = enemies.find(e => e.def.isBoss && e.state !== 'death');
    if (!boss) return;

    ctx.save();
    const barW = 280;
    const barH = 14;
    const barX = (canvasW - barW) / 2;
    const barY = 34;

    // Boss name
    const bossNames = {
        slime_king: 'Slime King',
        demon_slime_king: 'Demon Slime King',
        bone_colossus: 'Bone Colossus',
        werewolf: 'The Beast',
        infernal_knight: 'Infernal Knight',
        frost_wyrm: 'Frost Wyrm',
        ruined_king: 'The Ruined King',
    };
    const bossName = bossNames[boss.type] || 'Boss';

    // Phase state
    const phase = boss.bossPhase || 0;
    const hpPct = Math.max(0, boss.hp / boss.maxHp);
    const phaseText = phase === 2 ? ' — Desperate' : (phase === 1 ? ' — Enraged' : '');

    // Phase-specific accent colors
    const phaseAccent = phase === 2 ? [180, 60, 255] : (phase === 1 ? [255, 80, 40] : [200, 170, 100]);
    const phaseBorder = phase === 2 ? '#9944cc' : (phase === 1 ? '#cc4422' : '#8a7030');
    const phaseNameColor = phase === 2 ? '#cc88ff' : (phase === 1 ? '#ff8866' : '#e8d4aa');

    // --- Backing panel ---
    const panelX = barX - 12;
    const panelY = barY - 22;
    const panelW = barW + 24;
    const panelH = barH + 32;

    // Drop shadow
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.roundRect(panelX + 1, panelY + 2, panelW, panelH, 5);
    ctx.fill();

    // Dark gradient fill
    ctx.globalAlpha = 0.92;
    const panelGrad = ctx.createLinearGradient(panelX, panelY, panelX, panelY + panelH);
    panelGrad.addColorStop(0, '#1a1510');
    panelGrad.addColorStop(1, '#0a0806');
    ctx.fillStyle = panelGrad;
    ctx.beginPath();
    ctx.roundRect(panelX, panelY, panelW, panelH, 5);
    ctx.fill();

    // Panel border — accented by boss phase
    ctx.globalAlpha = 0.4;
    ctx.strokeStyle = phaseBorder;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(panelX, panelY, panelW, panelH, 5);
    ctx.stroke();

    // --- Boss name + phase text ---
    ctx.globalAlpha = 0.95;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'small-caps bold 11px Georgia';
    ctx.fillStyle = phaseNameColor;
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 2;
    ctx.strokeText(bossName + phaseText, canvasW / 2, barY - 8);
    ctx.fillText(bossName + phaseText, canvasW / 2, barY - 8);

    // --- Health bar dark track ---
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = '#0a0404';
    ctx.beginPath();
    ctx.roundRect(barX, barY, barW, barH, 3);
    ctx.fill();

    // --- Health bar gradient fill ---
    if (hpPct > 0) {
        ctx.globalAlpha = 0.92;
        const fillW = Math.max(2, barW * hpPct);
        const hpGrad = ctx.createLinearGradient(barX, barY, barX, barY + barH);
        if (phase === 2) {
            // Desperate: pulsing purple
            hpGrad.addColorStop(0, '#bb55ee');
            hpGrad.addColorStop(0.5, '#8833cc');
            hpGrad.addColorStop(1, '#6622aa');
        } else if (phase === 1) {
            // Enraged: angry red-orange
            hpGrad.addColorStop(0, '#ee5544');
            hpGrad.addColorStop(0.5, '#cc2222');
            hpGrad.addColorStop(1, '#aa1818');
        } else {
            // Normal: healthy green-gold
            hpGrad.addColorStop(0, '#88cc44');
            hpGrad.addColorStop(0.5, '#669933');
            hpGrad.addColorStop(1, '#557722');
        }
        ctx.fillStyle = hpGrad;
        ctx.beginPath();
        ctx.roundRect(barX, barY, fillW, barH, 3);
        ctx.fill();

        // Highlight stripe (top edge catch light)
        ctx.globalAlpha = 0.2;
        ctx.fillStyle = '#fff';
        ctx.fillRect(barX + 1, barY + 1, Math.max(1, fillW - 2), 2);
    }

    // --- Health bar border ---
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = phaseBorder;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.roundRect(barX, barY, barW, barH, 3);
    ctx.stroke();

    // --- Decorative end caps (small diamonds) ---
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = phaseBorder;
    for (const capX of [barX - 4, barX + barW + 4]) {
        const capY = barY + barH / 2;
        ctx.beginPath();
        ctx.moveTo(capX, capY - 3);
        ctx.lineTo(capX + 3, capY);
        ctx.lineTo(capX, capY + 3);
        ctx.lineTo(capX - 3, capY);
        ctx.closePath();
        ctx.fill();
    }

    // --- HP percentage text (right-aligned, small) ---
    ctx.globalAlpha = 0.5;
    ctx.font = '8px monospace';
    ctx.textAlign = 'right';
    ctx.fillStyle = '#aa9977';
    ctx.fillText(Math.ceil(hpPct * 100) + '%', barX + barW - 3, barY + barH / 2 + 1);

    ctx.restore();
}

// ----- SPAWN SINGLE ENEMY WITH STAT SCALING -----
// All damage keys that scale with statMult on spawn
const _SCALED_DAMAGE_KEYS = [
    'slamDamage', 'sweepDamage', 'flameSweepDamage', 'fireTrailDamage',
    'iceBreathDamage', 'shatterDamage', 'teleSlashDamage', 'voidPulseDamage', 'despDamage',
    'groundAoEDamage', 'firePoolDPS',
];

function spawnEnemy(type, row, col, statMult) {
    const baseDef = ENEMY_TYPES[type];
    if (!baseDef) { console.error('Unknown enemy type:', type); return; }
    // Create a scaled copy of the definition
    const def = {
        ...baseDef,
        hp: Math.round(baseDef.hp * statMult),
        damage: Math.round(baseDef.damage * statMult),
        speed: baseDef.speed * (1 + (statMult - 1) * 0.5), // speed scales gentler
    };
    // Scale all boss ability damage keys with statMult
    for (const key of _SCALED_DAMAGE_KEYS) {
        def[key] = baseDef[key] ? Math.round(baseDef[key] * statMult) : 0;
    }
    // Wave modifier stat adjustments
    if (wave.modifier) {
        if (wave.modifier.enemyHpMult) { def.hp = Math.round(def.hp * wave.modifier.enemyHpMult); }
        if (wave.modifier.enemySpeedMult) { def.speed *= wave.modifier.enemySpeedMult; }
    }
    // Abyss modifiers (endless mode) — apply to all spawned enemies
    if (typeof activeModifiers !== 'undefined' && activeModifiers.length > 0) {
        for (var _am = 0; _am < activeModifiers.length; _am++) {
            var _mod = activeModifiers[_am];
            if (_mod.enemyHpMult) def.hp = Math.round(def.hp * _mod.enemyHpMult);
            if (_mod.enemySpeedMult) def.speed *= _mod.enemySpeedMult;
            if (_mod.enemyScaleMult) def.scale = (def.scale || 1) * _mod.enemyScaleMult;
        }
    }
    // Core enemy state (shared by all enemies)
    const enemy = {
        type, def,
        statMult,   // store for scaling summoned adds + XP
        row, col,
        spawnRow: row, spawnCol: col,
        vr: 0, vc: 0,
        hp: def.hp, maxHp: def.hp,
        state: 'idle',
        animFrame: 0,
        facing: 1,
        attackTimer: 0,
        attackCooldown: Math.random() * 1.5, // stagger initial attacks
        attackFired: false,
        hurtTimer: 0,
        deathTimer: 0,
        knockVr: 0, knockVc: 0,
        spawnFade: 0.5,
        slowTimer: 0,
        orbitHitCooldown: 0,
        staggerCooldown: 0,
        // AI behavior state
        lungeTimer: 0,
        lungeCooldownTimer: 0,
        isLunging: false,
        lungeVr: 0, lungeVc: 0,
        flankSide: Math.random() < 0.5 ? 1 : -1,
        shieldTimer: 0,
        isShielding: false,
        chargeTimer: 0,
        isCharging: false,
        // Elite modifier
        elite: null,
        // Ambush state (pit_lurker)
        _ambushHidden: baseDef.ambush ? true : false,
    };

    // Boss-only timers — only allocated for bosses to reduce per-enemy memory
    if (baseDef.isBoss) {
        enemy.howlCooldown = 0;
        enemy.howlPaused = 0;
        enemy.bossSlamTimer = 0;
        enemy.bossSummonTimer = 0;
        enemy.bossSweepTimer = 0;
        enemy.bossCageTimer = 0;
        enemy.bossFlameSweepTimer = 0;
        enemy.bossFireTrailTimer = 0;
        enemy.bossShieldPhaseTimer = 0;
        enemy.bossShieldPhaseActive = false;
        enemy.bossShieldPhaseDur = 0;
        enemy.bossIceBreathTimer = 0;
        enemy.bossFreezeTrapTimer = 0;
        enemy.bossShatterTimer = 0;
        enemy.bossTeleSlashTimer = 0;
        enemy.bossVoidPulseTimer = 0;
        enemy.bossDespTimer = 0;
        enemy.fireTrails = [];
        enemy.bossPhase = 0;
        // Telegraph system — visual warning before big attacks
        enemy._telegraphing = false;
        enemy._telegraphTimer = 0;
        enemy._telegraphDuration = 0;   // total telegraph time (for progress calc)
        enemy._telegraphType = '';       // 'circle', 'arc', 'cone'
        enemy._telegraphColor = '#ff4444';
        enemy._telegraphRadius = 0;
        enemy._telegraphRow = 0;
        enemy._telegraphCol = 0;
        enemy._telegraphAngle = 0;      // center angle for arc/cone
        enemy._telegraphSpan = 0;       // half-angle for arc/cone
        enemy._telegraphAttack = '';     // which attack to fire when telegraph ends
    }

    enemies.push(enemy);
    const spawned = enemies[enemies.length - 1];

    // --- Elite Modifier System ---
    // Non-boss enemies in zone 2+ have a chance to become elite
    // Iron Horde abyss modifier forces ALL enemies to be elite
    const _forceElite = (typeof hasAbyssMod === 'function' && hasAbyssMod('forceElite'));
    if (!baseDef.isBoss && (currentZone >= 2 || _forceElite)) {
        const eliteChance = _forceElite ? 1.0 : Math.min(ELITE_MAX_CHANCE, ELITE_BASE_CHANCE + (currentZone - 2) * ELITE_CHANCE_PER_ZONE);
        if (Math.random() < eliteChance) {
            const modifiers = ['swift', 'vampiric', 'volatile', 'splitting', 'shielded', 'thorned', 'frenzy', 'necromancer'];
            const mod = modifiers[Math.floor(Math.random() * modifiers.length)];
            spawned.elite = mod;
            // Apply modifier bonuses
            switch (mod) {
                case 'swift':
                    spawned.def.speed *= ELITE_SWIFT_SPEED_MULT;
                    spawned.def.scale *= ELITE_SWIFT_SCALE_MULT;
                    break;
                case 'vampiric':
                    spawned.def.damage = Math.round(spawned.def.damage * ELITE_VAMPIRIC_DAMAGE_MULT);
                    // Heals on hit — handled in combat logic
                    break;
                case 'volatile':
                    spawned.hp = Math.round(spawned.hp * ELITE_VOLATILE_HP_MULT);
                    spawned.maxHp = spawned.hp;
                    break;
                case 'splitting':
                    spawned.hp = Math.round(spawned.hp * ELITE_SPLITTING_HP_MULT);
                    spawned.maxHp = spawned.hp;
                    break;
                case 'shielded':
                    spawned._eliteShieldTimer = ELITE_SHIELDED_DURATION;
                    spawned._eliteShieldCooldown = 0;
                    spawned._eliteShieldFlash = 0;
                    break;
                case 'frenzy':
                    spawned._eliteFrenzied = false;
                    break;
            }
        }
    }

    return spawned;
}

// ----- ENEMY AI UPDATE -----
function updateEnemies(dt) {
    // Tick global boss telegraph flash timer
    if (bossTelegraphFlashTimer > 0) bossTelegraphFlashTimer -= dt;

    for (let i = enemies.length - 1; i >= 0; i--) {
        const e = enemies[i];

        // --- Spawn fade-in ---
        if (e.spawnFade > 0) e.spawnFade -= dt;

        // --- Death state ---
        if (e.state === 'death') {
            // Corpses linger so all forms can interact (slime absorb, skeleton consume, lich harvest)
            if (!e._corpseLingerExtended) {
                e._corpseLingerExtended = true;
                e.deathTimer = 4.0; // 4 seconds — enough time to reach and interact

                // ── COMBAT JUICE: Killing blow flash (hit pause provides the beat) ──
                e._deathFlashTimer = 0.08;

                // ── COMBAT JUICE: Multikill tracking ──
                if (multiKillTimer > 0) {
                    multiKillCount++;
                } else {
                    multiKillCount = 1;
                }
                multiKillTimer = 1.5; // 1.5s rolling window
                if (multiKillCount >= 2) {
                    const mkLabel = multiKillCount === 2 ? 'DOUBLE KILL' :
                                    multiKillCount === 3 ? 'TRIPLE KILL' :
                                    multiKillCount === 4 ? 'QUAD KILL' : 'MASSACRE';
                    const mkColor = multiKillCount === 2 ? '#ff9944' :
                                    multiKillCount === 3 ? '#ff4444' :
                                    multiKillCount === 4 ? '#ff44ff' : '#ffd700';
                    multiKillTexts.push({
                        text: mkLabel, color: mkColor,
                        life: 1.4, scale: 0.8 + multiKillCount * 0.15,
                    });
                    // Escalating feedback — screen shake scales, but NO slow-mo on normal multikills
                    // (slow-mo during massacres makes the game feel stuck instead of powerful)
                    addScreenShake(2 + multiKillCount * 1.5, 0.08 + multiKillCount * 0.02);
                }

                // ── Kill Streak tracking — builds multiplier for sustained aggression ──
                killStreak.count++;
                killStreak.timer = 0;
                if (killStreak.count >= 10) killStreak.multiplier = 3.0;
                else if (killStreak.count >= 6) killStreak.multiplier = 2.0;
                else if (killStreak.count >= 3) killStreak.multiplier = 1.5;
                else killStreak.multiplier = 1.0;
                killStreak.displayAlpha = 1.0;

                // Talisman Echo: Residual Mass — heal on every Nth kill (echo of Slime absorb)
                if (typeof hasTalismanEcho === 'function' && hasTalismanEcho('heal_on_kill')) {
                    if (!wave._echoKillCount) wave._echoKillCount = 0;
                    wave._echoKillCount++;
                    var _echoData = getTalismanEcho('heal_on_kill');
                    if (_echoData && wave._echoKillCount % _echoData.killInterval === 0) {
                        var _echoHeal = (_echoData.healBase || 3) + (_echoData.healPerLevel || 0) * (FormSystem.talisman.level || 1);
                        player.hp = Math.min(getPlayerMaxHP(), player.hp + _echoHeal);
                        spawnParticle(player.row, player.col, 0, -1.5, 0.3, '#44dd66', 0.7);
                        spawnParticle(player.row, player.col, (Math.random()-0.5)*2, -1, 0.25, '#66ff88', 0.5);
                    }
                }

                // Bestiary tracking — record this kill in player profile
                if (typeof playerProfile !== 'undefined') {
                    if (!playerProfile.bestiary[e.type]) playerProfile.bestiary[e.type] = { killed: 0, killedBy: 0, name: e.def.name || e.type };
                    playerProfile.bestiary[e.type].killed++;
                    if (e.elite) playerProfile.bestiary._eliteKills = (playerProfile.bestiary._eliteKills || 0) + 1;
                }

                // Captain's Bounty quest — track elite kills
                if (e.elite && typeof questState !== 'undefined' &&
                    questState.flags.captain_quest_started && !questState.flags.captain_bounty_kills_done) {
                    questState.flags.elite_bounty_kills = (questState.flags.elite_bounty_kills || 0) + 1;
                    if (questState.flags.elite_bounty_kills >= 5) {
                        questState.flags.captain_bounty_kills_done = true;
                        if (typeof Notify !== 'undefined') {
                            Notify.toast('Bounty complete! Report to Captain Aldric.', { duration: 4, color: '#e8c840' });
                        }
                        currentObjective = 'Report to Captain Aldric';
                    } else {
                        if (typeof Notify !== 'undefined') {
                            Notify.toast('Elite slain (' + questState.flags.elite_bounty_kills + '/5)', { duration: 2, color: '#ccaa88' });
                        }
                    }
                }

                // --- BOSS DEATH CINEMATIC ---
                if (e.def.isBoss) {
                    // Stage 1: Immediate freeze frame + shake + slow-mo combo for impact
                    addHitPause(0.3);       // Freeze for 0.3s
                    addScreenShake(10, 0.5);  // Intense 10px shake for 0.5s
                    addSlowMo(0.8, 0.3);      // Slow-mo for 0.8s at 30% speed (dramatic easing out)

                    // Stage 2: Extra death particles — spawn 2-3 more bursts with offsets
                    const deathPos = tileToScreen(e.row, e.col);
                    const baseX = deathPos.x + cameraX;
                    const baseY = deathPos.y + cameraY;

                    // Main burst
                    spawnDeathBurst(baseX, baseY, e.def.tintColor || '#ff6644');

                    // Secondary bursts at offset positions for more spectacle
                    const offsetDist = 40;
                    for (let off = 0; off < 2; off++) {
                        const offsetAngle = (Math.PI * 2 * off) / 2 + Math.random() * 0.3;
                        const offsetX = baseX + Math.cos(offsetAngle) * offsetDist;
                        const offsetY = baseY + Math.sin(offsetAngle) * offsetDist;
                        spawnDeathBurst(offsetX, offsetY, e.def.tintColor || '#ff6644');
                    }

                    // Stage 3: "BOSS DEFEATED" floating text
                    pickupTexts.push({
                        text: 'BOSS DEFEATED',
                        color: '#ffdd44',  // golden yellow
                        row: e.row,
                        col: e.col,
                        offsetY: 0,
                        life: 2.5,  // slightly longer than normal pickup text
                    });
                }
            }
            e.deathTimer -= dt;
            e.animFrame += 6 * dt;
            if (e.deathTimer <= 0) {
                wave.lastDeathRow = e.row;
                wave.lastDeathCol = e.col;
                // Spawn death burst particle effect (regular enemies only; bosses got theirs above)
                if (!e.def.isBoss) {
                    const deathPos = tileToScreen(e.row, e.col);
                    spawnDeathBurst(deathPos.x + cameraX, deathPos.y + cameraY, e.def.tintColor || '#ff6644');
                }

                // --- Elite death effects ---
                if (e.elite === 'volatile') {
                    // Explode on death — damages player if close
                    const explodeR = 2.0;
                    const pdr = player.row - e.row;
                    const pdc = player.col - e.col;
                    if (Math.sqrt(pdr * pdr + pdc * pdc) < explodeR) {
                        damagePlayer(Math.round(e.def.damage * ENEMY_CONTACT_DAMAGE_MULT), e.type, e.row, e.col);
                    }
                    // Big explosion particles
                    for (let p = 0; p < 12; p++) {
                        const angle = (p / 12) * Math.PI * 2;
                        spawnParticle(e.row + Math.cos(angle) * 0.3, e.col + Math.sin(angle) * 0.3,
                            Math.cos(angle) * 4, Math.sin(angle) * 4, 0.5, '#ff6622', 0.9);
                    }
                    addScreenShake(4, 0.2);
                } else if (e.elite === 'splitting' && !e._isSplit) {
                    // Split into 2 weaker copies
                    for (let s = 0; s < 2; s++) {
                        const angle = Math.random() * Math.PI * 2;
                        const sr = e.row + Math.cos(angle) * 0.8;
                        const sc = e.col + Math.sin(angle) * 0.8;
                        if (canEnemyMoveTo(sr, sc, 0.25, null)) {
                            const splitMult = Math.max(0.5, (e.statMult || 1.0) * 0.5);
                            const split = spawnEnemy(e.type, sr, sc, splitMult);
                            if (split) {
                                split._isSplit = true; // prevent infinite splitting
                                split.elite = null;
                                split.def.scale *= 0.75; // smaller
                                split.attackCooldown = 0.5 + Math.random();
                            }
                        }
                    }
                } else if (e.elite === 'necromancer') {
                    // Spawn 1 clone of same type at 50% HP
                    const nAngle = Math.random() * Math.PI * 2;
                    const nr = e.row + Math.cos(nAngle) * 0.8;
                    const nc = e.col + Math.sin(nAngle) * 0.8;
                    if (canEnemyMoveTo(nr, nc, 0.25, null)) {
                        const necroMult = Math.max(0.5, (e.statMult || 1.0) * ELITE_NECRO_CLONE_HP_MULT);
                        const clone = spawnEnemy(e.type, nr, nc, necroMult);
                        if (clone) {
                            clone.elite = null; // prevent chain necromancy
                            clone.attackCooldown = 0.5 + Math.random();
                            // Green necro particles
                            for (let np = 0; np < 6; np++) {
                                const npAngle = (np / 6) * Math.PI * 2;
                                spawnParticle(nr + Math.cos(npAngle) * 0.3, nc + Math.sin(npAngle) * 0.3,
                                    Math.cos(npAngle) * 2, Math.sin(npAngle) * 2, 0.4, COLORS.ELITE_NECRO_TINT, 0.8);
                            }
                        }
                    }
                }

                // --- Fire Slime: spawn fire pool on death ---
                if (e.def.firePoolOnDeath) {
                    groundHazards.push({
                        type: 'fire_pool',
                        row: e.row, col: e.col,
                        radius: 0.8,
                        life: e.def.firePoolDuration || 3.0,
                        maxLife: e.def.firePoolDuration || 3.0,
                        damage: e.def.firePoolDPS || 5,
                        tickTimer: 0,
                        color: COLORS.FIRE_SLIME_TINT || '#ff6622',
                    });
                    // Fire burst particles on pool spawn
                    for (let fp = 0; fp < 8; fp++) {
                        const fpAngle = (fp / 8) * Math.PI * 2;
                        spawnParticle(e.row + Math.cos(fpAngle) * 0.3, e.col + Math.sin(fpAngle) * 0.3,
                            Math.cos(fpAngle) * 2, Math.sin(fpAngle) * 2, 0.4, '#ff6622', 0.8);
                    }
                }

                enemies.splice(i, 1);
                wave.totalKilled++;
                wave.waveKills++;
                grantXP(e.type, e.statMult || 1.0, e.row, e.col);
                // Gold drop
                if (typeof ENEMY_GOLD_DROP !== 'undefined') {
                    const goldDrop = ENEMY_GOLD_DROP[e.type] || 10;
                    const ascMult = 1 + (typeof ascensionLevel !== 'undefined' ? ascensionLevel * 0.25 : 0);
                    const _modGoldMult = (wave.modifier && wave.modifier.goldMult) ? wave.modifier.goldMult : 1;
                    const gold = Math.round(goldDrop * (0.8 + Math.random() * 0.4) * ascMult * killStreak.multiplier * _modGoldMult);
                    playerGold += gold;
                    if (typeof runGoldEarned !== 'undefined') runGoldEarned += gold;
                    pickupTexts.push({ text: '+' + gold + 'g', color: '#ffd700', row: e.row, col: e.col, offsetY: -8, life: 1.0 });
                    // Gold coin particle burst
                    if (typeof spawnParticle === 'function') {
                        for (let _gp = 0; _gp < 3; _gp++) {
                            const _ga = Math.random() * Math.PI * 2;
                            spawnParticle(e.row, e.col, Math.cos(_ga) * 1.5, -2 - Math.random() * 1.5, 0.5 + Math.random() * 0.3, '#ffd700', 0.7);
                        }
                    }
                    if (typeof sfxGoldPickup === 'function') sfxGoldPickup();
                }
                // Multi-kill tracking now handled at kill moment (when entering death state)
                // Boss drops special key (Zone 3 werewolf only)
                if (e.type === 'werewolf' && currentZone === 3) {
                    dropKeyItemInWorld(e.row, e.col, 'zone3_exit_key');
                }
                // Track boss defeat for evolution gating
                if (e.type === 'slime_king' && FormSystem.formData.slime) {
                    FormSystem.formData.slime.bossDefeated = true;
                }
                // Siphon Life: heal on kill
                if (getUpgrade('regen') > 0) {
                    const healAmt = 2 * getUpgrade('regen');
                    player.hp = Math.min(getPlayerMaxHP(), player.hp + healAmt);
                }
                // Phase Flux: chance to reset dodge
                if (getUpgrade('dodge_reset') > 0) {
                    if (Math.random() < 0.15 * getUpgrade('dodge_reset')) {
                        player.dodgeCoolTimer = 0;
                    }
                }
            }
            continue;
        }

        // --- Hurt state ---
        if (e.state === 'hurt') {
            e.hurtTimer -= dt;
            e.animFrame += 8 * dt;
            // Apply knockback with friction-based decay (momentum carries)
            if (Math.abs(e.knockVr) > 0.05 || Math.abs(e.knockVc) > 0.05) {
                const nr = e.row + e.knockVr * dt;
                const nc = e.col + e.knockVc * dt;
                if (canEnemyMoveTo(nr, nc, e.def.hitboxR, e)) {
                    e.row = nr; e.col = nc;
                } else {
                    // Bounce off wall — lose most momentum
                    e.knockVr *= -0.3;
                    e.knockVc *= -0.3;
                }
                // Friction: heavier enemies slow faster
                const friction = e.def.speed > 2 ? 0.86 : 0.90;
                e.knockVr *= friction;
                e.knockVc *= friction;
            } else {
                e.knockVr = 0; e.knockVc = 0;
            }
            if (e.hurtTimer <= 0) {
                e.state = 'idle';
                e.animFrame = 0;
                // Let residual momentum carry into idle (don't zero out if still moving)
                if (Math.abs(e.knockVr) < 0.1 && Math.abs(e.knockVc) < 0.1) {
                    e.knockVr = 0; e.knockVc = 0;
                }
                // Armored Skeleton: chance to raise shield after being hit
                // AI escalation: at high statMult, nearby armored skeletons also raise shields (shield wall)
                if (e.def.ai === 'shield') {
                    let shieldChance = e.def.shieldChance || 0;
                    // Higher shield chance at higher multipliers
                    if ((e.statMult || 1) >= 4) shieldChance = Math.min(0.8, shieldChance + 0.2);
                    if (Math.random() < shieldChance) {
                        e.isShielding = true;
                        e.shieldTimer = e.def.shieldDuration;
                        // Shield wall: nearby armored skeletons also shield
                        if ((e.statMult || 1) >= 5) {
                            for (const ally of enemies) {
                                if (ally === e || ally.def.ai !== 'shield' || ally.isShielding || ally.state === 'death') continue;
                                const adr = ally.row - e.row;
                                const adc = ally.col - e.col;
                                if (Math.sqrt(adr * adr + adc * adc) < 3.0 && Math.random() < 0.5) {
                                    ally.isShielding = true;
                                    ally.shieldTimer = e.def.shieldDuration * 0.7;
                                }
                            }
                        }
                    }
                }
            }
            continue;
        }

        // --- Timer ticks ---
        if (e.attackCooldown > 0) e.attackCooldown -= dt;
        if (e.slowTimer > 0) e.slowTimer -= dt;
        if (e.orbitHitCooldown > 0) e.orbitHitCooldown -= dt;
        if (e.staggerCooldown > 0) e.staggerCooldown -= dt;
        if (e.hitFlashTimer > 0) e.hitFlashTimer -= dt;
        if (e._deathFlashTimer > 0) e._deathFlashTimer -= dt;
        if (e.howlCooldown > 0) e.howlCooldown -= dt;
        if (e._shadowTeleportCooldown > 0) e._shadowTeleportCooldown -= dt;

        // --- Elite shielded: tick shield timer and cooldown ---
        if (e.elite === 'shielded') {
            if (e._eliteShieldTimer > 0) {
                e._eliteShieldTimer -= dt;
            } else if (e._eliteShieldCooldown > 0) {
                e._eliteShieldCooldown -= dt;
            } else {
                // Reactivate shield
                e._eliteShieldTimer = ELITE_SHIELDED_DURATION;
                e._eliteShieldCooldown = ELITE_SHIELDED_COOLDOWN;
            }
            if (e._eliteShieldFlash > 0) e._eliteShieldFlash -= dt;
        }

        // --- Elite frenzy: double attack speed when below 50% HP ---
        if (e.elite === 'frenzy' && !e._eliteFrenzied && e.hp < e.maxHp * ELITE_FRENZY_HP_THRESHOLD) {
            e._eliteFrenzied = true;
            e.def = Object.assign({}, e.def); // shallow copy to avoid mutating shared def
            e.def.attackCooldown = e.def.attackCooldown / ELITE_FRENZY_SPEED_MULT;
            spawnParticle(e.row, e.col, 0, -1.5, 0.4, COLORS.ELITE_FRENZY_TINT, 0.9);
        }

        // === SLIME: Corrosive Linger DOT tick ===
        if (e._corrosiveDot && e._corrosiveDot.ticks > 0) {
            e._corrosiveDot.timer -= dt;
            if (e._corrosiveDot.timer <= 0) {
                e._corrosiveDot.timer = e._corrosiveDot.interval;
                e._corrosiveDot.ticks--;
                e.hp -= e._corrosiveDot.dmgPerTick;
                // Green DOT particle
                const _dotPos = tileToScreen(e.row, e.col);
                _emitParticle(
                    _dotPos.x + cameraX, _dotPos.y + cameraY,
                    (Math.random() - 0.5) * 20, -15 - Math.random() * 10,
                    0.3, 2, '#44cc33', 0.6, 'effect'
                );
                pickupTexts.push({
                    text: '-' + e._corrosiveDot.dmgPerTick,
                    color: '#66dd44',
                    row: e.row, col: e.col,
                    offsetY: -8 - Math.random() * 6,
                    life: 0.5,
                });
                if (e.hp <= 0 && e.state !== 'death') {
                    e.state = 'death';
                    e.deathTimer = 0.7;
                    e.animFrame = 0;
                    if (typeof sfxEnemyDeath === 'function') sfxEnemyDeath(e.row, e.col);
                    if (typeof rollEnemyLoot === 'function') rollEnemyLoot(e);
                    if (typeof spawnDeathBurst === 'function') {
                        const _dp = tileToScreen(e.row, e.col);
                        spawnDeathBurst(_dp.x + cameraX, _dp.y + cameraY, e.def.tint || '#ff6644');
                    }
                }
            }
        }
        // === SLIME: Sticky Landing slow decay ===
        if (e._stickySlowTimer > 0) e._stickySlowTimer -= dt;

        // Distance to player
        const dr = player.row - e.row;
        const dc = player.col - e.col;
        const dist = Math.sqrt(dr * dr + dc * dc);

        // --- Pit Lurker: ambush reveal ---
        if (e._ambushHidden) {
            if (dist <= (e.def.ambushRevealDist || 3.0)) {
                // Reveal! Burst of dirt particles
                e._ambushHidden = false;
                for (let dp = 0; dp < 8; dp++) {
                    const dAngle = (dp / 8) * Math.PI * 2;
                    spawnParticle(e.row + Math.cos(dAngle) * 0.3, e.col + Math.sin(dAngle) * 0.3,
                        Math.cos(dAngle) * 2.5, Math.sin(dAngle) * 2.5 - 1,
                        0.4, '#664422', 0.8);
                }
                addScreenShake(2, 0.1);
            } else {
                // Stay hidden — skip all AI
                e.state = 'idle';
                e.animFrame = 0;
                continue;
            }
        }

        // Facing
        const screenVx = dc - dr; // screen X component
        if (Math.abs(screenVx) > 0.1) e.facing = screenVx > 0 ? 1 : -1;

        // --- Attack state ---
        if (e.state === 'attack') {
            e.attackTimer -= dt;
            const elapsed = e.def.attackDur - e.attackTimer;
            e.animFrame = Math.min(e.def.frames.attack - 1,
                Math.floor((elapsed / e.def.attackDur) * e.def.frames.attack));

            // Fire at midpoint
            if (!e.attackFired && elapsed >= e.def.attackDur * 0.5) {
                e.attackFired = true;
                if (e.def.groundAoE) {
                    // Bone Mage: place ground AoE warning at player position
                    groundHazards.push({
                        type: 'bone_aoe_warning',
                        row: player.row, col: player.col,
                        radius: e.def.groundAoERadius || 1.2,
                        life: (e.def.groundAoEDelay || 1.5) + 0.1,
                        maxLife: e.def.groundAoEDelay || 1.5,
                        damage: e.def.groundAoEDamage || 20,
                        tickTimer: e.def.groundAoEDelay || 1.5,
                        color: COLORS.BONE_MAGE_TINT || '#ccaa44',
                    });
                    // Cast particles at caster
                    for (let cp = 0; cp < 6; cp++) {
                        spawnParticle(e.row, e.col,
                            (Math.random() - 0.5) * 2, -1 - Math.random(),
                            0.3, '#ccaa44', 0.7);
                    }
                } else if (e.def.frostArrows) {
                    // Frost Archer: fire arrow with slow effect
                    fireEnemyArrow(e, { type: 'frost_arrow', slowDuration: e.def.frostSlowDuration || 2.0 });
                } else if (e.def.ai === 'ranged') {
                    fireEnemyArrow(e);
                } else {
                    // Melee: damage player if in range
                    if (dist < e.def.attackRange + 0.3) {
                        sfxEnemyHurt(e.row, e.col); // melee attack impact sound
                        damagePlayer(e.def.damage, e.type, e.row, e.col);
                        // Elite vampiric: heal on hit
                        if (e.elite === 'vampiric') {
                            const healAmt = Math.round(e.def.damage * ELITE_VAMPIRIC_HEAL_MULT);
                            e.hp = Math.min(e.maxHp, e.hp + healAmt);
                            spawnParticle(e.row, e.col, 0, -1.5, 0.3, '#44ff44', 0.7);
                        }
                    }
                }
            }

            if (e.attackTimer <= 0) {
                e.state = 'idle';
                e.animFrame = 0;
                e.attackCooldown = e.def.attackCooldown;
            }
            continue;
        }

        // --- Boss howl pause state ---
        if (e.def.isBoss && e.howlPaused > 0) {
            e.howlPaused -= dt;
            e.state = 'idle';
            e.animFrame = (e.animFrame + e.def.animSpeed * 0.3 * dt) % e.def.frames.idle;
            continue;
        }

        // --- Boss telegraph system — freeze in place, count down, then fire ---
        if (e.def.isBoss && e._telegraphing) {
            e._telegraphTimer -= dt;
            // Freeze in place — slow idle animation
            e.state = 'idle';
            e.animFrame = (e.animFrame + e.def.animSpeed * 0.2 * dt) % e.def.frames.idle;

            if (e._telegraphTimer <= 0) {
                // Telegraph finished — execute the actual attack
                e._telegraphing = false;
                const atk = e._telegraphAttack;

                if (atk === 'slime_slam') {
                    const slamDmg = Math.round(e.def.slamDamage * (e.bossPhase === 1 ? 1.3 : 1.0));
                    bossAoE(e.row, e.col, e.def.slamRadius, slamDmg, 16, '#88ee44', 5, 'slime_king');
                    e.howlPaused = 0.4;
                    e.state = 'attack'; e.animFrame = 0; e.attackTimer = 0.4; e.attackFired = true;
                    // Screen edge flash on attack fire
                    bossTelegraphFlashTimer = 0.15;
                    bossTelegraphFlashColor = '#ff4444';
                } else if (atk === 'flame_sweep') {
                    const sweepR = e.def.flameSweepRadius;
                    const sweepCenter = e._telegraphAngle;
                    for (let p = 0; p < 14; p++) {
                        const angle = sweepCenter + (p / 14 - 0.5) * Math.PI * 1.2;
                        const px = e.row + Math.cos(angle) * sweepR;
                        const py = e.col + Math.sin(angle) * sweepR;
                        spawnParticle(px, py, Math.cos(angle) * 1.5, Math.sin(angle) * 1.5, 0.5, '#ff6622', 0.9);
                    }
                    const pdr = player.row - e.row;
                    const pdc = player.col - e.col;
                    const pDist = Math.sqrt(pdr * pdr + pdc * pdc);
                    if (pDist < sweepR) {
                        const sweepDmg = Math.round(e.def.flameSweepDamage * (e.bossPhase === 1 ? 1.4 : 1.0));
                        damagePlayer(sweepDmg, 'infernal_knight');
                    }
                    addScreenShake(5, 0.25);
                    e.howlPaused = 0.35;
                    e.state = 'attack'; e.animFrame = 0; e.attackTimer = 0.35; e.attackFired = true;
                    bossTelegraphFlashTimer = 0.15;
                    bossTelegraphFlashColor = '#ff6622';
                } else if (atk === 'ice_breath') {
                    const breathDir = e._telegraphAngle;
                    const breathR = e.def.iceBreathRadius;
                    const halfAngle = e.def.iceBreathAngle;
                    for (let p = 0; p < 16; p++) {
                        const angle = breathDir + (Math.random() - 0.5) * halfAngle * 2;
                        const dist2 = Math.random() * breathR;
                        const px = e.row + Math.cos(angle) * dist2;
                        const py = e.col + Math.sin(angle) * dist2;
                        spawnParticle(px, py, Math.cos(angle) * 3, Math.sin(angle) * 3, 0.5, '#88ccff', 0.8);
                    }
                    const pdr = player.row - e.row;
                    const pdc = player.col - e.col;
                    const toPlayerAngle = Math.atan2(pdc, pdr);
                    let angleDiff = Math.abs(toPlayerAngle - breathDir);
                    if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;
                    const pDist = Math.sqrt(pdr * pdr + pdc * pdc);
                    if (pDist < breathR && angleDiff < halfAngle) {
                        const breathDmg = Math.round(e.def.iceBreathDamage * (e.bossPhase === 1 ? 1.3 : 1.0));
                        damagePlayer(breathDmg, 'frost_wyrm');
                        player.slowTimer = (player.slowTimer || 0) + 0.8;
                    }
                    addScreenShake(4, 0.2);
                    e.howlPaused = 0.4;
                    e.state = 'attack'; e.animFrame = 0; e.attackTimer = 0.4; e.attackFired = true;
                    bossTelegraphFlashTimer = 0.15;
                    bossTelegraphFlashColor = '#44aaff';
                } else if (atk === 'bone_sweep') {
                    // Bone Colossus sweeping attack — frontal arc damage
                    const sweepDmg = Math.round(e.def.sweepDamage * (e.bossPhase === 1 ? 1.4 : 1.0));
                    bossSweep(e, e.def.sweepRadius, sweepDmg, 10, '#ccaa66', 'bone_colossus');
                    e.howlPaused = 0.3;
                    e.state = 'attack'; e.animFrame = 0; e.attackTimer = 0.3; e.attackFired = true;
                    bossTelegraphFlashTimer = 0.15;
                    bossTelegraphFlashColor = '#ccaa66';
                } else if (atk === 'freeze_trap') {
                    // Frost Wyrm freeze trap — check if player is still in the target zone
                    const trapRow = e._telegraphRow;
                    const trapCol = e._telegraphCol;
                    const trapDr = player.row - trapRow;
                    const trapDc = player.col - trapCol;
                    if (Math.sqrt(trapDr * trapDr + trapDc * trapDc) < 1.2) {
                        player.frozenTimer = (player.frozenTimer || 0) + e.def.freezeTrapDuration;
                    }
                    // Ice burst at trap location
                    for (let p = 0; p < 8; p++) {
                        spawnParticle(trapRow, trapCol,
                            (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, 0.4, '#44aaff', 0.8);
                    }
                    addScreenShake(3, 0.15);
                    bossTelegraphFlashTimer = 0.15;
                    bossTelegraphFlashColor = '#66bbff';
                } else if (atk === 'tele_slash') {
                    // Ruined King tele-slash — teleport behind the stored target position, then slash
                    const targetRow = e._telegraphRow;
                    const targetCol = e._telegraphCol;
                    // Vanish particles at old position
                    for (let p = 0; p < 10; p++) {
                        spawnParticle(e.row, e.col,
                            (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4, 0.4, '#7722bb', 0.8);
                    }
                    // Teleport to the marked position (where player WAS when telegraph started)
                    const behindAngle = Math.atan2(targetCol - e.col, targetRow - e.row);
                    const teleRow = targetRow + Math.cos(behindAngle + Math.PI) * 1.2;
                    const teleCol = targetCol + Math.sin(behindAngle + Math.PI) * 1.2;
                    if (canEnemyMoveTo(teleRow, teleCol, e.def.hitboxR, e)) {
                        e.row = teleRow;
                        e.col = teleCol;
                    }
                    // Appear particles at new position
                    for (let p = 0; p < 10; p++) {
                        spawnParticle(e.row, e.col,
                            (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, 0.3, '#9944dd', 0.9);
                    }
                    // Slash damage — player had time to dodge away from the marked zone
                    const newDr = player.row - e.row;
                    const newDc = player.col - e.col;
                    const newDist = Math.sqrt(newDr * newDr + newDc * newDc);
                    if (newDist < 2.0) {
                        const slashDmg = Math.round(e.def.teleSlashDamage * (e.bossPhase >= 1 ? 1.3 : 1.0));
                        damagePlayer(slashDmg, 'ruined_king');
                    }
                    addScreenShake(5, 0.2);
                    e.state = 'attack'; e.animFrame = 0; e.attackTimer = 0.3; e.attackFired = true;
                    bossTelegraphFlashTimer = 0.15;
                    bossTelegraphFlashColor = '#9944dd';
                }
            }
            continue; // skip all other actions while telegraphing
        }

        // --- Boss howl attack (AOE at 50% HP) — Werewolf only ---
        if (e.type === 'werewolf' && e.hp < e.maxHp * BOSS_ENRAGE_HP_THRESHOLD && e.howlCooldown <= 0 && Math.random() < BOSS_HOWL_TRIGGER_CHANCE) {
            const howlRadius = 1.5;
            const particleCount = 12;
            for (let p = 0; p < particleCount; p++) {
                const angle = (p / particleCount) * Math.PI * 2;
                const px = e.row + Math.cos(angle) * howlRadius;
                const py = e.col + Math.sin(angle) * howlRadius;
                spawnParticle(px, py, Math.cos(angle) * 2, Math.sin(angle) * 2, 0.5, '#aa5544', 0.7);
            }
            if (dist < ENEMY_RETREAT_CHECK_DISTANCE) {
                damagePlayer(Math.round(e.def.damage * ENEMY_CONTACT_DAMAGE_MULT), 'werewolf');
            }
            addScreenShake(6, 0.3);
            e.howlCooldown = 5.0;
            e.howlPaused = 0.5;
            e.state = 'idle';
            e.animFrame = 0;
            continue;
        }

        // --- Boss enrage phase transition (dramatic transformation) ---
        if (e.def.isBoss && e.bossPhase === 0 && e.hp < e.maxHp * 0.5 && !e._telegraphing) {
            e.bossPhase = 1;
            // Research: phase transition = slow-mo + shake + zoom + particles
            addSlowMo(0.6, 0.15);
            addScreenShake(10, 0.5);
            addHitPause(0.12);
            if (typeof addCameraZoom === 'function') addCameraZoom(1.05, 1.2);
            // Bright enrage burst — 2x particles for dramatic visual
            for (let p = 0; p < 28; p++) {
                const angle = (p / 28) * Math.PI * 2;
                spawnParticle(e.row + Math.cos(angle) * 0.5, e.col + Math.sin(angle) * 0.5,
                    Math.cos(angle) * 4, Math.sin(angle) * 4, 0.9, e.def.tintColor || '#ff4444', 1.0);
            }
            // Boss-specific enrage banner
            if (e.type === 'slime_king') {
                wave.bannerText = 'The Slime King RAGES!';
                wave.bannerSub = 'The ground trembles beneath its mass...';
                addScreenShake(12, 0.8); // extra shake for dramatic effect
                e.def = Object.assign({}, e.def, {
                    slamRadius: 3.5,      // bigger slam (was 2.5)
                    slamDamage: 28,       // harder slam (was 20)
                    summonCooldown: 5.0,  // faster summons (was 10)
                    summonCount: 4,       // more adds (was 3)
                    speed: 2.1,          // faster movement (was 1.6)
                });
                // Burst of green slime particles
                for (let p2 = 0; p2 < 20; p2++) {
                    const a2 = (p2 / 20) * Math.PI * 2;
                    spawnParticle(e.row + Math.cos(a2) * 0.8, e.col + Math.sin(a2) * 0.8,
                        Math.cos(a2) * 4, Math.sin(a2) * 4, 0.8, '#66cc22', 1.0);
                }
                if (typeof sfxEvolution === 'function') sfxEvolution(); // dramatic SFX
            } else if (e.type === 'demon_slime_king') {
                wave.bannerText = 'The Demon Awakens!';
                wave.bannerSub = 'Hellfire surges through its veins...';
                addScreenShake(14, 1.0);
                e.def = Object.assign({}, e.def, {
                    slamRadius: 3.8,
                    slamDamage: 35,
                    summonCooldown: 4.0,
                    speed: 2.4,
                });
            } else if (e.type === 'bone_colossus') {
                wave.bannerText = 'The Colossus Awakens!';
                wave.bannerSub = 'Bones rattle with fury...';
            } else if (e.type === 'infernal_knight') {
                wave.bannerText = 'The Knight Ignites!';
                wave.bannerSub = 'Flames consume everything...';
            } else if (e.type === 'frost_wyrm') {
                wave.bannerText = 'The Wyrm Shatters!';
                wave.bannerSub = 'The cold becomes absolute...';
            } else if (e.type === 'ruined_king') {
                wave.bannerText = 'The King Descends!';
                wave.bannerSub = 'Reality tears at the seams...';
            }
            wave.bannerAlpha = 1;
            wave.timer = 1.5;
        }

        // --- Ruined King Phase 2 (25% HP) — desperate phase ---
        if (e.type === 'ruined_king' && e.bossPhase === 1 && e.hp < e.maxHp * 0.25 && !e._telegraphing) {
            e.bossPhase = 2;
            addSlowMo(0.8, 0.1); addScreenShake(14, 0.8); addHitPause(0.15);
            if (typeof addCameraZoom === 'function') addCameraZoom(1.08, 2.0);
            for (let p = 0; p < 32; p++) {
                const angle = (p / 32) * Math.PI * 2;
                spawnParticle(e.row + Math.cos(angle) * 0.6, e.col + Math.sin(angle) * 0.6,
                    Math.cos(angle) * 5, Math.sin(angle) * 5, 1.0, '#9944dd', 1.0);
            }
            wave.bannerText = 'THE KING UNLEASHES RUIN';
            wave.bannerSub = 'All shall perish...';
            wave.bannerAlpha = 1;
            wave.timer = 1.5;
        }

        // --- Phase 2 for other bosses (25% HP — desperation) ---
        if (e.def.isBoss && e.bossPhase === 1 && e.hp < e.maxHp * 0.25 && e.type !== 'ruined_king' && !e._telegraphing) {
            e.bossPhase = 2;
            addSlowMo(0.7, 0.12); addScreenShake(12, 0.6); addHitPause(0.12);
            if (typeof addCameraZoom === 'function') addCameraZoom(1.06, 1.5);
            for (let p = 0; p < 26; p++) {
                const angle = (p / 26) * Math.PI * 2;
                spawnParticle(e.row + Math.cos(angle) * 0.6, e.col + Math.sin(angle) * 0.6,
                    Math.cos(angle) * 4.5, Math.sin(angle) * 4.5, 0.9, e.def.tintColor || '#ff4444', 1.0);
            }

            if (e.type === 'slime_king' || e.type === 'demon_slime_king') {
                wave.bannerText = 'The King Fractures!';
                wave.bannerSub = 'Its mass splits apart...';
                // Split into 3 mini-slimes that reform after 5s
                e._splitActive = true;
                e._splitTimer = 5.0;
                e._splitAlpha = 0.3; // boss fades while split
                for (let si = 0; si < 3; si++) {
                    const sa = (si / 3) * Math.PI * 2 + Math.random() * 0.5;
                    const sr = e.row + Math.cos(sa) * 2;
                    const sc = e.col + Math.sin(sa) * 2;
                    spawnEnemy('slime', sr, sc, 0.5); // half-strength mini-slimes
                }
            } else if (e.type === 'bone_colossus') {
                wave.bannerText = 'The Colossus Crumbles!';
                wave.bannerSub = 'Bones form a living barrier...';
                // Bone wall — block tiles around the boss temporarily
                e._boneWallActive = true;
                e._boneWallTimer = 6.0;
                e._boneWallTiles = [];
                for (let bw = 0; bw < 4; bw++) {
                    const bwa = (bw / 4) * Math.PI * 2;
                    const bwr = Math.round(e.row + Math.cos(bwa) * 2.5);
                    const bwc = Math.round(e.col + Math.sin(bwa) * 2.5);
                    if (bwr >= 0 && bwr < MAP_SIZE && bwc >= 0 && bwc < MAP_SIZE && !blocked[bwr][bwc]) {
                        blocked[bwr][bwc] = true;
                        blockType[bwr][bwc] = 'wall';
                        e._boneWallTiles.push({ r: bwr, c: bwc });
                    }
                }
            } else if (e.type === 'infernal_knight') {
                wave.bannerText = 'The Knight Burns!';
                wave.bannerSub = 'Fire trails consume the arena...';
                // Permanent fire trail mode — leaves trail every move
                e._permFireTrail = true;
            } else if (e.type === 'frost_wyrm') {
                wave.bannerText = 'The Wyrm Freezes All!';
                wave.bannerSub = 'The ground turns to ice...';
                // Freeze floor tiles in expanding ring
                const fCenter = { r: Math.round(e.row), c: Math.round(e.col) };
                for (let fr = -4; fr <= 4; fr++) {
                    for (let fc = -4; fc <= 4; fc++) {
                        const dist = Math.sqrt(fr * fr + fc * fc);
                        if (dist > 4 || dist < 2) continue;
                        const tr = fCenter.r + fr, tc = fCenter.c + fc;
                        if (tr >= 0 && tr < MAP_SIZE && tc >= 0 && tc < MAP_SIZE && !blocked[tr][tc]) {
                            if (!hazardMap[tr][tc]) {
                                hazardMap[tr][tc] = { type: 'ice', damage: 0, triggered: false };
                            }
                        }
                    }
                }
            }
            wave.bannerAlpha = 1;
            wave.timer = 1.5;
        }

        // --- Boss phase 2 ongoing effects ---
        if (e.def.isBoss && e.bossPhase === 2) {
            // Slime King split — reform after timer
            if ((e.type === 'slime_king' || e.type === 'demon_slime_king') && e._splitActive) {
                e._splitTimer -= dt;
                if (e._splitTimer <= 0) {
                    e._splitActive = false;
                    e._splitAlpha = 1.0;
                }
            }
            // Bone Colossus wall — remove after timer
            if (e.type === 'bone_colossus' && e._boneWallActive) {
                e._boneWallTimer -= dt;
                if (e._boneWallTimer <= 0) {
                    e._boneWallActive = false;
                    for (const t of (e._boneWallTiles || [])) {
                        if (t.r >= 0 && t.r < MAP_SIZE && t.c >= 0 && t.c < MAP_SIZE) {
                            blocked[t.r][t.c] = false;
                            blockType[t.r][t.c] = null;
                        }
                    }
                    e._boneWallTiles = [];
                }
            }
        }

        // --- Tick boss ability timers ---
        if (e.def.isBoss) {
            if (e.bossSlamTimer > 0) e.bossSlamTimer -= dt;
            if (e.bossSummonTimer > 0) e.bossSummonTimer -= dt;
            if (e.bossSweepTimer > 0) e.bossSweepTimer -= dt;
            if (e.bossCageTimer > 0) e.bossCageTimer -= dt;
            // Infernal Knight
            if (e.bossFlameSweepTimer > 0) e.bossFlameSweepTimer -= dt;
            if (e.bossShieldPhaseTimer > 0) e.bossShieldPhaseTimer -= dt;
            if (e.bossFireTrailTimer > 0) e.bossFireTrailTimer -= dt;
            // Frost Wyrm
            if (e.bossIceBreathTimer > 0) e.bossIceBreathTimer -= dt;
            if (e.bossFreezeTrapTimer > 0) e.bossFreezeTrapTimer -= dt;
            if (e.bossShatterTimer > 0) e.bossShatterTimer -= dt;
            // Ruined King
            if (e.bossTeleSlashTimer > 0) e.bossTeleSlashTimer -= dt;
            if (e.bossVoidPulseTimer > 0) e.bossVoidPulseTimer -= dt;
            if (e.bossDespTimer > 0) e.bossDespTimer -= dt;
            // Shield phase countdown
            if (e.bossShieldPhaseActive) {
                e.bossShieldPhaseDur -= dt;
                if (e.bossShieldPhaseDur <= 0) e.bossShieldPhaseActive = false;
            }
            // Fire trail tick — damage player standing in fire
            for (let t = e.fireTrails.length - 1; t >= 0; t--) {
                e.fireTrails[t].life -= dt;
                if (e.fireTrails[t].life <= 0) {
                    e.fireTrails.splice(t, 1);
                    continue;
                }
                const ft = e.fireTrails[t];
                const fdr = player.row - ft.row;
                const fdc = player.col - ft.col;
                if (Math.sqrt(fdr * fdr + fdc * fdc) < 0.8) {
                    ft.tickTimer -= dt;
                    if (ft.tickTimer <= 0) {
                        damagePlayer(e.def.fireTrailDamage || 8, 'infernal_knight');
                        ft.tickTimer = 0.5; // damage every 0.5s
                    }
                }
            }
        }

        // =====================================================
        // SLIME KING ABILITIES
        // =====================================================
        if ((e.type === 'slime_king' || e.type === 'demon_slime_king') && dist < e.def.aggroRange) {
            // Ground Slam — start telegraph, then AoE fires when telegraph ends
            if (e.bossSlamTimer <= 0 && dist < e.def.slamRadius + 1 && !e._telegraphing) {
                e.bossSlamTimer = e.def.slamCooldown * (e.bossPhase === 1 ? 0.7 : 1.0);
                // Start telegraph instead of instant attack
                const telegraphDur = e.bossPhase === 1 ? 0.8 : 1.0;
                e._telegraphing = true;
                e._telegraphTimer = telegraphDur;
                e._telegraphDuration = telegraphDur;
                e._telegraphType = 'circle';
                e._telegraphColor = '#ff4444';
                e._telegraphRadius = e.def.slamRadius;
                e._telegraphRow = e.row;
                e._telegraphCol = e.col;
                e._telegraphAttack = 'slime_slam';
                sfxBossTelegraph(e.row, e.col);
                continue;
            }

            // Summon Slime Adds (using shared bossSummonAdds helper)
            if (e.bossSummonTimer <= 0) {
                e.bossSummonTimer = e.def.summonCooldown * (e.bossPhase === 1 ? 0.6 : 1.0);
                const addCount = e.def.summonCount + (e.bossPhase === 1 ? 1 : 0);
                bossSummonAdds(e, 'slime', addCount, 1.5);
            }
        }

        // =====================================================
        // BONE COLOSSUS ABILITIES
        // =====================================================
        if (e.type === 'bone_colossus' && dist < e.def.aggroRange) {
            // Sweeping Attack — telegraph then damage in a frontal arc
            if (e.bossSweepTimer <= 0 && dist < e.def.sweepRadius + 0.5 && !e._telegraphing) {
                e.bossSweepTimer = e.def.sweepCooldown * (e.bossPhase === 1 ? 0.65 : 1.0);
                const telegraphDur = e.bossPhase === 1 ? 0.6 : 0.8;
                e._telegraphing = true;
                e._telegraphTimer = telegraphDur;
                e._telegraphDuration = telegraphDur;
                e._telegraphType = 'arc';
                e._telegraphColor = '#ccaa66';
                e._telegraphRadius = e.def.sweepRadius;
                e._telegraphRow = e.row;
                e._telegraphCol = e.col;
                e._telegraphAngle = Math.atan2(dc, dr);
                e._telegraphSpan = Math.PI * 0.6;
                e._telegraphAttack = 'bone_sweep';
                sfxBossTelegraph(e.row, e.col);
                continue;
            }

            // Bone Cage — spawns a ring of projectiles that close in on player position
            if (e.bossCageTimer <= 0 && e.bossPhase === 1 && dist < 6) {
                e.bossCageTimer = e.def.boneCageCooldown;
                const cageCount = 8;
                const cageRadius = 3.0;
                for (let p = 0; p < cageCount; p++) {
                    const angle = (p / cageCount) * Math.PI * 2;
                    const startR = player.row + Math.cos(angle) * cageRadius;
                    const startC = player.col + Math.sin(angle) * cageRadius;
                    // Fire inward toward where player was (only if not inside a wall)
                    if (canMoveTo(Math.round(startR), Math.round(startC))) {
                        enemyProjectiles.push({
                            row: startR, col: startC,
                            vr: -Math.cos(angle) * 3.0,
                            vc: -Math.sin(angle) * 3.0,
                            life: 1.2,
                            damage: Math.round(e.def.damage * BOSS_CAGE_DAMAGE_MULT),
                            type: 'bone_cage',
                            size: 4,
                        });
                    }
                }
                // Warning particles at player position
                for (let p = 0; p < cageCount; p++) {
                    const angle = (p / cageCount) * Math.PI * 2;
                    spawnParticle(player.row + Math.cos(angle) * cageRadius,
                        player.col + Math.sin(angle) * cageRadius,
                        0, 0, 0.3, '#ffaa44', 0.6);
                }
                addScreenShake(3, 0.15);
            }

            // Summon Skeleton Adds
            if (e.bossSummonTimer <= 0) {
                e.bossSummonTimer = e.def.summonCooldown * (e.bossPhase === 1 ? 0.7 : 1.0);
                const addCount = e.def.summonCount + (e.bossPhase === 1 ? 1 : 0);
                for (let s = 0; s < addCount; s++) {
                    const angle = (s / addCount) * Math.PI * 2 + Math.random() * 0.5;
                    const spawnR = e.row + Math.cos(angle) * 2.0;
                    const spawnC = e.col + Math.sin(angle) * 2.0;
                    if (canEnemyMoveTo(spawnR, spawnC, 0.25, null)) {
                        const addType = Math.random() < 0.4 ? 'skelarch' : 'skeleton';
                        const addMult = Math.max(1.0, (e.statMult || 1.0) * 0.6); // adds are 60% of boss scaling
                        const add = spawnEnemy(addType, spawnR, spawnC, addMult);
                        if (add) add.attackCooldown = 0.5 + Math.random();
                    }
                }
                for (let p = 0; p < 8; p++) {
                    const angle = Math.random() * Math.PI * 2;
                    spawnParticle(e.row, e.col, Math.cos(angle) * 2, Math.sin(angle) * 2, 0.4, '#bbaa88', 0.7);
                }
                addScreenShake(3, 0.15);
            }
        }

        // =====================================================
        // INFERNAL KNIGHT ABILITIES (Zone 4 Boss)
        // =====================================================
        if (e.type === 'infernal_knight' && dist < e.def.aggroRange) {
            // Shield Phase — becomes invulnerable, summons fire adds
            if (e.bossShieldPhaseActive) {
                // Invulnerable visual — pulsing red glow particles
                if (Math.random() < 0.3) {
                    const angle = Math.random() * Math.PI * 2;
                    spawnParticle(e.row + Math.cos(angle) * 0.6, e.col + Math.sin(angle) * 0.6,
                        Math.cos(angle) * 0.5, Math.sin(angle) * 0.5, 0.3, '#ff6622', 0.6);
                }
                e.state = 'idle';
                e.animFrame = (e.animFrame + e.def.animSpeed * 0.3 * dt) % e.def.frames.idle;
                continue; // skip all other actions while shielded
            }

            // Flame Sweep — start telegraph, then sweep fires when telegraph ends
            if (e.bossFlameSweepTimer <= 0 && dist < e.def.flameSweepRadius + 0.5 && !e._telegraphing) {
                e.bossFlameSweepTimer = e.def.flameSweepCooldown * (e.bossPhase === 1 ? 0.6 : 1.0);
                const telegraphDur = e.bossPhase === 1 ? 0.8 : 1.0;
                e._telegraphing = true;
                e._telegraphTimer = telegraphDur;
                e._telegraphDuration = telegraphDur;
                e._telegraphType = 'arc';
                e._telegraphColor = '#ff6622';
                e._telegraphRadius = e.def.flameSweepRadius;
                e._telegraphRow = e.row;
                e._telegraphCol = e.col;
                e._telegraphAngle = Math.atan2(dc, dr);
                e._telegraphSpan = Math.PI * 0.6; // half of the 1.2*PI arc
                e._telegraphAttack = 'flame_sweep';
                sfxBossTelegraph(e.row, e.col);
                continue;
            }

            // Fire Trail — leaves burning ground where it walks
            // _permFireTrail (phase 2) drops trails faster
            const _fireTrailCD = e._permFireTrail ? 0.3 : 0.8;
            if ((e.def.fireTrail || e._permFireTrail) && e.bossFireTrailTimer <= 0 && e.state === 'walk') {
                e.bossFireTrailTimer = _fireTrailCD;
                e.fireTrails.push({
                    row: e.row, col: e.col,
                    life: e.def.fireTrailDuration * (e.bossPhase === 1 ? 1.5 : 1.0),
                    tickTimer: 1.0,
                });
                // Fire spawn particle
                for (let p = 0; p < 4; p++) {
                    spawnParticle(e.row, e.col, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, 0.3, '#ff4400', 0.6);
                }
            }

            // Shield Phase Initiation — only in enrage, periodic invulnerability + summons
            if (e.bossPhase === 1 && e.bossShieldPhaseTimer <= 0) {
                e.bossShieldPhaseTimer = e.def.shieldPhaseCooldown;
                e.bossShieldPhaseActive = true;
                e.bossShieldPhaseDur = e.def.shieldPhaseDuration;
                addScreenShake(6, 0.3);
                // Summon fire-armored adds during shield
                const addCount = e.def.summonCount + 1;
                for (let s = 0; s < addCount; s++) {
                    const angle = (s / addCount) * Math.PI * 2 + Math.random() * 0.5;
                    const spawnR = e.row + Math.cos(angle) * 2.0;
                    const spawnC = e.col + Math.sin(angle) * 2.0;
                    if (canEnemyMoveTo(spawnR, spawnC, 0.25, null)) {
                        const addMult = Math.max(1.0, (e.statMult || 1.0) * 0.6);
                        const add = spawnEnemy('armoredskel', spawnR, spawnC, addMult);
                        if (add) add.attackCooldown = 0.5 + Math.random();
                    }
                }
                // Shield burst particles
                for (let p = 0; p < 12; p++) {
                    const angle = (p / 12) * Math.PI * 2;
                    spawnParticle(e.row + Math.cos(angle) * 1.0, e.col + Math.sin(angle) * 1.0,
                        Math.cos(angle) * 2, Math.sin(angle) * 2, 0.5, '#ff8844', 0.8);
                }
                wave.bannerText = 'The Knight Shields!';
                wave.bannerSub = 'Destroy the minions!';
                wave.bannerAlpha = 1;
                wave.timer = 1.0;
                continue;
            }

            // Standard summon (non-enrage, slower)
            if (e.bossPhase === 0 && e.bossSummonTimer <= 0) {
                e.bossSummonTimer = e.def.summonCooldown;
                for (let s = 0; s < e.def.summonCount; s++) {
                    const angle = (s / e.def.summonCount) * Math.PI * 2 + Math.random() * 0.5;
                    const spawnR = e.row + Math.cos(angle) * 2.0;
                    const spawnC = e.col + Math.sin(angle) * 2.0;
                    if (canEnemyMoveTo(spawnR, spawnC, 0.25, null)) {
                        const addMult = Math.max(1.0, (e.statMult || 1.0) * 0.6);
                        const add = spawnEnemy('armoredskel', spawnR, spawnC, addMult);
                        if (add) add.attackCooldown = 0.5 + Math.random();
                    }
                }
                for (let p = 0; p < 6; p++) {
                    const angle = Math.random() * Math.PI * 2;
                    spawnParticle(e.row, e.col, Math.cos(angle) * 2, Math.sin(angle) * 2, 0.4, '#ff4422', 0.7);
                }
                addScreenShake(3, 0.15);
            }
        }

        // =====================================================
        // FROST WYRM ABILITIES (Zone 5 Boss)
        // =====================================================
        if (e.type === 'frost_wyrm' && dist < e.def.aggroRange) {
            // Ice Breath — start telegraph, then cone fires when telegraph ends
            if (e.bossIceBreathTimer <= 0 && dist < e.def.iceBreathRadius + 1 && !e._telegraphing) {
                e.bossIceBreathTimer = e.def.iceBreathCooldown * (e.bossPhase === 1 ? 0.65 : 1.0);
                const telegraphDur = e.bossPhase === 1 ? 0.8 : 1.0;
                e._telegraphing = true;
                e._telegraphTimer = telegraphDur;
                e._telegraphDuration = telegraphDur;
                e._telegraphType = 'cone';
                e._telegraphColor = '#44aaff';
                e._telegraphRadius = e.def.iceBreathRadius;
                e._telegraphRow = e.row;
                e._telegraphCol = e.col;
                e._telegraphAngle = Math.atan2(dc, dr);
                e._telegraphSpan = e.def.iceBreathAngle;
                e._telegraphAttack = 'ice_breath';
                sfxBossTelegraph(e.row, e.col);
                continue;
            }

            // Freeze Trap — telegraph at player's position, then freeze after delay
            if (e.bossFreezeTrapTimer <= 0 && dist < 8 && !e._telegraphing) {
                e.bossFreezeTrapTimer = e.def.freezeTrapCooldown * (e.bossPhase === 1 ? 0.7 : 1.0);
                const telegraphDur = e.bossPhase === 1 ? 0.7 : 1.0;
                e._telegraphing = true;
                e._telegraphTimer = telegraphDur;
                e._telegraphDuration = telegraphDur;
                e._telegraphType = 'circle';
                e._telegraphColor = '#66bbff';
                e._telegraphRadius = 1.2;
                e._telegraphRow = player.row;  // lock target position at telegraph start
                e._telegraphCol = player.col;
                e._telegraphAttack = 'freeze_trap';
                sfxBossTelegraph(e.row, e.col);
                continue;
            }

            // Shatter — AoE burst of ice shard projectiles (enrage only, or on long cooldown normally)
            if (e.bossShatterTimer <= 0 && (e.bossPhase === 1 || dist < 4)) {
                e.bossShatterTimer = e.def.shatterCooldown * (e.bossPhase === 1 ? 0.6 : 1.0);
                const shardCount = e.def.shatterProjectiles + (e.bossPhase === 1 ? 4 : 0);
                for (let p = 0; p < shardCount; p++) {
                    const angle = (p / shardCount) * Math.PI * 2;
                    enemyProjectiles.push({
                        row: e.row + Math.cos(angle) * 0.5,
                        col: e.col + Math.sin(angle) * 0.5,
                        vr: Math.cos(angle) * 4.0,
                        vc: Math.sin(angle) * 4.0,
                        life: 1.5,
                        damage: Math.round(e.def.shatterDamage * (e.bossPhase === 1 ? BOSS_SHATTER_PHASE_MULT : 1.0)),
                        type: 'ice_shard',
                        size: 5,
                    });
                }
                // Explosion particles
                for (let p = 0; p < 12; p++) {
                    const angle = (p / 12) * Math.PI * 2;
                    spawnParticle(e.row + Math.cos(angle) * 0.3, e.col + Math.sin(angle) * 0.3,
                        Math.cos(angle) * 5, Math.sin(angle) * 5, 0.4, '#66bbff', 0.9);
                }
                addScreenShake(6, 0.3);
                e.howlPaused = 0.5;
                continue;
            }

            // Shatter telegraph — visual warning 0.3s before shatter fires
            if (e.bossShatterTimer > 0 && e.bossShatterTimer <= 0.3 && (e.bossPhase === 1 || dist < 4)) {
                // Light blue warning particles radiating outward from boss
                if (Math.random() < 0.6) {
                    const angle = Math.random() * Math.PI * 2;
                    spawnParticle(e.row + Math.cos(angle) * 0.3, e.col + Math.sin(angle) * 0.3,
                        Math.cos(angle) * 0.5, Math.sin(angle) * 0.5, 0.15, '#aaddff', 0.95);
                }
            }

            // Summon frozen adds
            if (e.bossSummonTimer <= 0) {
                e.bossSummonTimer = e.def.summonCooldown * (e.bossPhase === 1 ? 0.6 : 1.0);
                const addCount = e.def.summonCount + (e.bossPhase === 1 ? 1 : 0);
                for (let s = 0; s < addCount; s++) {
                    const angle = (s / addCount) * Math.PI * 2 + Math.random() * 0.5;
                    const spawnR = e.row + Math.cos(angle) * 2.5;
                    const spawnC = e.col + Math.sin(angle) * 2.5;
                    if (canEnemyMoveTo(spawnR, spawnC, 0.25, null)) {
                        const addMult = Math.max(1.0, (e.statMult || 1.0) * 0.6);
                        const addType = Math.random() < 0.5 ? 'skelarch' : 'armoredskel';
                        const add = spawnEnemy(addType, spawnR, spawnC, addMult);
                        if (add) add.attackCooldown = 0.5 + Math.random();
                    }
                }
                for (let p = 0; p < 8; p++) {
                    const angle = Math.random() * Math.PI * 2;
                    spawnParticle(e.row, e.col, Math.cos(angle) * 2, Math.sin(angle) * 2, 0.4, '#44aaff', 0.7);
                }
                addScreenShake(3, 0.15);
            }
        }

        // =====================================================
        // RUINED KING ABILITIES (Zone 6 Boss)
        // =====================================================
        if (e.type === 'ruined_king' && dist < e.def.aggroRange) {
            // Tele-Slash — telegraph warning circle at player, then teleport + slash
            if (e.bossTeleSlashTimer <= 0 && dist < e.def.teleSlashRange && dist > 2.0 && !e._telegraphing) {
                const cdMult = e.bossPhase === 2 ? 0.5 : (e.bossPhase === 1 ? 0.7 : 1.0);
                e.bossTeleSlashTimer = e.def.teleSlashCooldown * cdMult;
                const telegraphDur = e.bossPhase === 2 ? 0.5 : (e.bossPhase === 1 ? 0.6 : 0.8);
                e._telegraphing = true;
                e._telegraphTimer = telegraphDur;
                e._telegraphDuration = telegraphDur;
                e._telegraphType = 'circle';
                e._telegraphColor = '#9944dd';
                e._telegraphRadius = 2.0;
                e._telegraphRow = player.row;  // mark where the slash will land
                e._telegraphCol = player.col;
                e._telegraphAttack = 'tele_slash';
                sfxBossTelegraph(e.row, e.col);
                continue;
            }

            // Void Pulse — expanding ring of dark energy
            if (e.bossVoidPulseTimer <= 0) {
                const cdMult = e.bossPhase === 2 ? 0.5 : (e.bossPhase === 1 ? 0.7 : 1.0);
                e.bossVoidPulseTimer = e.def.voidPulseCooldown * cdMult;
                const pulseR = e.def.voidPulseRadius;
                const projectileCount = e.bossPhase === 2 ? 16 : 12;
                // Fire projectiles outward in a ring
                for (let p = 0; p < projectileCount; p++) {
                    const angle = (p / projectileCount) * Math.PI * 2;
                    enemyProjectiles.push({
                        row: e.row + Math.cos(angle) * 0.3,
                        col: e.col + Math.sin(angle) * 0.3,
                        vr: Math.cos(angle) * 3.5,
                        vc: Math.sin(angle) * 3.5,
                        life: 1.8,
                        damage: Math.round(e.def.voidPulseDamage * (e.bossPhase >= 1 ? BOSS_VOID_PULSE_PHASE_MULT : 1.0)),
                        type: 'void_pulse',
                        size: 5,
                    });
                }
                // Central burst
                for (let p = 0; p < 16; p++) {
                    const angle = (p / 16) * Math.PI * 2;
                    spawnParticle(e.row + Math.cos(angle) * 0.3, e.col + Math.sin(angle) * 0.3,
                        Math.cos(angle) * 3, Math.sin(angle) * 3, 0.5, '#7722bb', 0.9);
                }
                addScreenShake(5, 0.25);
                e.howlPaused = 0.4;
                continue;
            }

            // Void Pulse telegraph — visual warning 0.3s before pulse fires
            if (e.bossVoidPulseTimer > 0 && e.bossVoidPulseTimer <= 0.3) {
                // Purple warning particles at boss center
                if (Math.random() < 0.6) {
                    const angle = Math.random() * Math.PI * 2;
                    spawnParticle(e.row + Math.cos(angle) * 0.4, e.col + Math.sin(angle) * 0.4,
                        Math.cos(angle) * 0.4, Math.sin(angle) * 0.4, 0.15, '#9944dd', 0.95);
                }
            }

            // Phase 2 (enrage): Summon mini-bosses — a small Slime King OR small Bone Colossus
            if (e.bossPhase >= 1 && e.bossSummonTimer <= 0) {
                e.bossSummonTimer = e.def.summonCooldown * (e.bossPhase === 2 ? 0.5 : 1.0);
                const miniType = Math.random() < 0.5 ? 'slime_king' : 'bone_colossus';
                const angle = Math.random() * Math.PI * 2;
                const spawnR = e.row + Math.cos(angle) * 3.0;
                const spawnC = e.col + Math.sin(angle) * 3.0;
                if (canEnemyMoveTo(spawnR, spawnC, 0.4, null)) {
                    const addMult = Math.max(1.5, (e.statMult || 1.0) * 0.35); // mini-bosses at 35% of king's power
                    const add = spawnEnemy(miniType, spawnR, spawnC, addMult);
                    if (add) {
                        add.attackCooldown = 1.0 + Math.random();
                        // Make mini-bosses smaller than the real thing
                        add.def.scale = add.def.scale * 0.7;
                    }
                }
                // Dark summoning burst
                for (let p = 0; p < 12; p++) {
                    const pAngle = (p / 12) * Math.PI * 2;
                    spawnParticle(spawnR + Math.cos(pAngle) * 0.5, spawnC + Math.sin(pAngle) * 0.5,
                        Math.cos(pAngle) * 2, Math.sin(pAngle) * 2, 0.5, '#9944dd', 0.8);
                }
                addScreenShake(4, 0.2);
                wave.bannerText = miniType === 'slime_king' ? 'A Shadow of the King!' : 'Bones Rise Again!';
                wave.bannerSub = '';
                wave.bannerAlpha = 1;
                wave.timer = 1.0;
            }

            // Phase 3 (desperate): Rapid dark slashes — AoE damage around the king
            if (e.bossPhase === 2 && e.bossDespTimer <= 0) {
                e.bossDespTimer = e.def.despCooldown;
                const despR = e.def.despRadius;
                // Dark slash particles in random directions
                for (let p = 0; p < 8; p++) {
                    const angle = Math.random() * Math.PI * 2;
                    const slashDist = Math.random() * despR;
                    spawnParticle(e.row + Math.cos(angle) * slashDist, e.col + Math.sin(angle) * slashDist,
                        Math.cos(angle) * 4, Math.sin(angle) * 4, 0.3, '#bb44ff', 0.9);
                }
                if (dist < despR) {
                    damagePlayer(e.def.despDamage, 'ruined_king');
                }
                addScreenShake(3, 0.15);
            }
        }

        // --- Boss charge attack (Werewolf only) ---
        if (e.type === 'werewolf' && e.isCharging) {
            e.chargeTimer -= dt;
            // Charge at 3x normal speed toward player
            const mLen = Math.sqrt(dr * dr + dc * dc) || 1;
            const chargeSpeed = e.def.speed * 3.0;
            const mr = (dr / mLen) * chargeSpeed;
            const mc = (dc / mLen) * chargeSpeed;
            const newR = e.row + mr * dt;
            const newC = e.col + mc * dt;
            if (canEnemyMoveTo(newR, newC, e.def.hitboxR, e)) {
                e.row = newR;
                e.col = newC;
            }
            e.state = 'walk';
            e.animFrame = (e.animFrame + e.def.animSpeed * 1.5 * dt) % e.def.frames.walk;

            // Charge ends after 0.3s
            if (e.chargeTimer <= 0) {
                e.isCharging = false;
                e.attackCooldown = 0.5; // brief cooldown after charge
            }
            continue;
        }

        // --- Boss charge initiation (periodic ~5s, Werewolf only) ---
        if (e.type === 'werewolf' && !e.isCharging && dist < e.def.aggroRange && e.attackCooldown <= 0) {
            e.chargeTimer += dt;

            // Charge telegraph — warning particles 0.3s before charge fires
            if (e.chargeTimer >= 4.7 && e.chargeTimer < 5.0) {
                // Red particles showing charge direction toward player
                if (Math.random() < 0.6) {
                    const angle = Math.atan2(dc, dr);
                    const chargePartDist = 0.5 + Math.random() * 0.5;
                    spawnParticle(e.row + Math.cos(angle) * chargePartDist, e.col + Math.sin(angle) * chargePartDist,
                        Math.cos(angle) * 0.5, Math.sin(angle) * 0.5, 0.15, '#ff3333', 0.95);
                }
            }

            if (e.chargeTimer >= 5.0) {
                e.isCharging = true;
                e.chargeTimer = 0.3; // charge duration
                e.attackCooldown = 6.0; // don't charge again for 6 seconds
                e.state = 'walk';
            }
        }

        // --- Not aggro'd: idle / patrol ---
        if (dist > e.def.aggroRange) {
            // Patrol: drift toward spawn point if too far
            const patrolRange = e.def.patrolRange || 1.5;
            const dsr = e.spawnRow - e.row;
            const dsc = e.spawnCol - e.col;
            const spawnDist = Math.sqrt(dsr * dsr + dsc * dsc);
            if (spawnDist > patrolRange) {
                // Walk back toward spawn
                const mLen = spawnDist || 1;
                const mr = (dsr / mLen) * e.def.speed * 0.4;
                const mc = (dsc / mLen) * e.def.speed * 0.4;
                const nr = e.row + mr * dt;
                const nc = e.col + mc * dt;
                if (canEnemyMoveTo(nr, nc, e.def.hitboxR, e)) {
                    e.row = nr; e.col = nc;
                }
                e.state = 'walk';
                e.animFrame = (e.animFrame + e.def.animSpeed * 0.5 * dt) % e.def.frames.walk;
            } else {
                e.state = 'idle';
                e.animFrame = (e.animFrame + e.def.animSpeed * dt) % e.def.frames.idle;
            }
            e.vr = 0; e.vc = 0;
            continue;
        }

        // --- In attack range? ---
        if (dist < e.def.attackRange && e.attackCooldown <= 0) {
            e.state = 'attack';
            e.attackTimer = e.def.attackDur;
            e.attackFired = false;
            e.animFrame = 0;
            continue;
        }

        // --- Movement AI ---
        let moveDir;
        let slowMult = e.slowTimer > 0 ? Math.max(0.2, 1 - 0.3 * getUpgrade('tower_slow')) : 1;
        // Sticky Landing slow stacks with tower slow (floor at 20% to prevent full freeze)
        if (e._stickySlowTimer > 0) slowMult = Math.max(0.2, slowMult * (e._stickySlowMult || 0.4));
        const enrageMult = e.def.isBoss && e.hp < e.maxHp * 0.5 ? 1.3 : 1.0;

        // --- Shield stance (Armored Skeleton) ---
        if (e.isShielding) {
            e.shieldTimer -= dt;
            if (e.shieldTimer <= 0) {
                e.isShielding = false;
            }
            // Walk slowly toward player while shielding
            const mLen = Math.sqrt(dr * dr + dc * dc) || 1;
            const shieldSpeed = e.def.speed * 0.35 * slowMult;
            const nr = e.row + (dr / mLen) * shieldSpeed * dt;
            const nc = e.col + (dc / mLen) * shieldSpeed * dt;
            if (canEnemyMoveTo(nr, nc, e.def.hitboxR, e)) { e.row = nr; e.col = nc; }
            e.state = 'walk';
            e.animFrame = (e.animFrame + e.def.animSpeed * 0.4 * dt) % e.def.frames.walk;
            continue;
        }

        // --- Lunge AI (Slime) ---
        if (e.def.ai === 'lunge') {
            if (e.lungeCooldownTimer > 0) e.lungeCooldownTimer -= dt;

            if (e.isLunging) {
                e.lungeTimer -= dt;
                const nr = e.row + e.lungeVr * dt;
                const nc = e.col + e.lungeVc * dt;
                if (canEnemyMoveTo(nr, nc, e.def.hitboxR, e)) { e.row = nr; e.col = nc; }
                e.state = 'walk';
                e.animFrame = (e.animFrame + e.def.animSpeed * 2 * dt) % e.def.frames.walk;
                if (e.lungeTimer <= 0) {
                    e.isLunging = false;
                    e.lungeCooldownTimer = e.def.lungeCooldown;
                }
                continue;
            }

            // Initiate lunge when close enough and cooldown ready
            if (dist < e.def.lungeRange && dist > e.def.attackRange && e.lungeCooldownTimer <= 0) {
                e.isLunging = true;
                e.lungeTimer = e.def.lungeDur;
                const mLen = dist || 1;
                e.lungeVr = (dr / mLen) * e.def.lungeSpeed;
                e.lungeVc = (dc / mLen) * e.def.lungeSpeed;
                continue;
            }

            // Normal chase when not lunging
            moveDir = dist > e.def.attackRange ? { dr, dc } : null;
        }
        // --- Flank AI (Skeleton) ---
        else if (e.def.ai === 'flank') {
            if (dist > e.def.flankDist || dist <= e.def.attackRange) {
                // Too far or in attack range: chase directly
                moveDir = dist > e.def.attackRange ? { dr, dc } : null;
            } else {
                // Flanking: approach at an angle
                const mLen = dist || 1;
                const normR = dr / mLen;
                const normC = dc / mLen;
                // Rotate the approach vector by flankAngle
                const cosA = Math.cos(e.def.flankAngle * e.flankSide);
                const sinA = Math.sin(e.def.flankAngle * e.flankSide);
                moveDir = {
                    dr: normR * cosA - normC * sinA,
                    dc: normR * sinA + normC * cosA,
                };
            }
        }
        // --- Ranged AI (Skeleton Archer) ---
        else if (e.def.ai === 'ranged' && dist < e.def.preferredDist) {
            // Retreat from player, but stop retreating if stuck (don't back into walls forever)
            if (e._stuckTimer && e._stuckTimer > 0.5) {
                moveDir = null; // stand ground instead of backing deeper into corner
            } else {
                moveDir = { dr: -dr, dc: -dc };
            }
        } else if (e.def.ai === 'ranged' && dist <= e.def.attackRange && e.attackCooldown <= 0) {
            moveDir = null;
        }
        // --- Default chase (shield when not shielding, werewolf, etc.) ---
        else {
            moveDir = dist > e.def.attackRange ? { dr, dc } : null;
        }

        if (moveDir) {
            const mLen = Math.sqrt(moveDir.dr * moveDir.dr + moveDir.dc * moveDir.dc) || 1;
            const mr = (moveDir.dr / mLen) * e.def.speed * slowMult * enrageMult;
            const mc = (moveDir.dc / mLen) * e.def.speed * slowMult * enrageMult;

            const newR = e.row + mr * dt;
            const newC = e.col + mc * dt;

            if (canEnemyMoveTo(newR, newC, e.def.hitboxR, e)) {
                e.row = newR;
                e.col = newC;
                e._stuckTimer = 0;
            } else {
                // Wall sliding: try each axis independently
                let moved = false;
                if (canEnemyMoveTo(newR, e.col, e.def.hitboxR, e)) {
                    e.row = newR;
                    moved = true;
                }
                if (canEnemyMoveTo(e.row, newC, e.def.hitboxR, e)) {
                    e.col = newC;
                    moved = true;
                }
                // Anti-stuck: if completely blocked, try increasingly aggressive escapes
                if (!moved) {
                    if (!e._stuckTimer) e._stuckTimer = 0;
                    e._stuckTimer += dt;

                    if (e._stuckTimer > 0.3) {
                        // Phase 1 (0.3s-1.5s): Perpendicular nudge to escape corners
                        const nudge = e.def.speed * 0.8 * dt;
                        const perpR = -moveDir.dc / mLen;
                        const perpC = moveDir.dr / mLen;
                        // Alternate nudge direction each attempt
                        const sign = (Math.floor(e._stuckTimer * 4) % 2 === 0) ? 1 : -1;
                        const nudgeR = e.row + perpR * nudge * sign;
                        const nudgeC = e.col + perpC * nudge * sign;
                        if (canEnemyMoveTo(nudgeR, nudgeC, e.def.hitboxR, e)) {
                            e.row = nudgeR;
                            e.col = nudgeC;
                        }
                    }

                    if (e._stuckTimer > 1.5) {
                        // Phase 2 (1.5s+): Try random directions to find ANY open path
                        for (let attempt = 0; attempt < 4; attempt++) {
                            const randAngle = Math.random() * Math.PI * 2;
                            const escape = e.def.speed * dt;
                            const tryR = e.row + Math.cos(randAngle) * escape;
                            const tryC = e.col + Math.sin(randAngle) * escape;
                            if (canEnemyMoveTo(tryR, tryC, e.def.hitboxR, e)) {
                                e.row = tryR;
                                e.col = tryC;
                                e._stuckTimer = 0;
                                break;
                            }
                        }
                    }

                    if (e._stuckTimer > 3.0) {
                        // Phase 3 (3s+): Warp toward player (clear line of sight)
                        // Move enemy 1 tile toward player, checking validity
                        const warpDist = 1.0;
                        const warpR = e.row + (dr / (dist || 1)) * warpDist;
                        const warpC = e.col + (dc / (dist || 1)) * warpDist;
                        if (canEnemyMoveTo(warpR, warpC, e.def.hitboxR, e)) {
                            e.row = warpR;
                            e.col = warpC;
                        }
                        e._stuckTimer = 0;
                    }
                } else {
                    e._stuckTimer = 0;
                }
            }

            e.state = 'walk';
            e.animFrame = (e.animFrame + e.def.animSpeed * dt) % e.def.frames.walk;
        } else {
            e.state = 'idle';
            e.animFrame = (e.animFrame + e.def.animSpeed * dt) % e.def.frames.idle;
        }
    }

    // --- Legendary Burn Zones: AoE damage to enemies ---
    updateBurnZones(dt);

    // --- Enemy-player contact damage ---
    if (playerInvTimer > 0) {
        playerInvTimer -= dt;
    } else {
        for (const e of enemies) {
            if (e.state === 'death' || e._ambushHidden) continue;
            const dr = player.row - e.row;
            const dc = player.col - e.col;
            const dist = Math.sqrt(dr * dr + dc * dc);
            if (dist < HITBOX_RADIUS + e.def.hitboxR + 0.1) {
                damagePlayer(Math.ceil(e.def.damage * ENEMY_CONTACT_DAMAGE_MULT), e.type, e.row, e.col); // contact = half damage
                // Juggernaut synergy: slime deals contact damage back to enemies
                if (typeof hasSynergy === 'function' && hasSynergy('juggernaut') && FormSystem.currentForm === 'slime') {
                    const jDmg = Math.round(8 + (typeof slimeState !== 'undefined' ? slimeState.currentSize * 3 : 0));
                    if (typeof applyEnemyHit === 'function') applyEnemyHit(e, jDmg, { skipHurtState: true });
                }
                break;
            }
        }
    }
}

// ----- LEGENDARY BURN ZONES -----
function updateBurnZones(dt) {
    // Tick veil cooldown
    if (veilUndyingCooldown > 0) veilUndyingCooldown -= dt;
    // Update each burn zone: deal AoE damage to enemies, decay lifetime
    for (let i = burnZones.length - 1; i >= 0; i--) {
        const bz = burnZones[i];
        bz.life -= dt;
        if (bz.life <= 0) {
            burnZones.splice(i, 1);
            continue;
        }
        bz.tickTimer -= dt;
        if (bz.tickTimer <= 0) {
            bz.tickTimer = bz.tickInterval || 0.5;
            // Damage all enemies within radius — use unified damage pipeline
            for (const e of enemies) {
                if (e.state === 'death') continue;
                const dr = e.row - bz.row;
                const dc = e.col - bz.col;
                if (Math.sqrt(dr * dr + dc * dc) < bz.radius) {
                    if (typeof applyEnemyHit === 'function') {
                        applyEnemyHit(e, bz.damage, { skipHurtState: true, skipSFX: true });
                    } else {
                        e.hp -= bz.damage;
                        if (e.hp <= 0) { e.state = 'death'; e.deathTimer = 0.7; }
                    }
                    spawnParticle(e.row, e.col, (Math.random()-0.5)*2, -1.5, 0.25, bz.color || '#ff4400', 0.6);
                }
            }
        }
    }
}

function drawBurnZones() {
    for (const bz of burnZones) {
        const pos = tileToScreen(bz.row, bz.col);
        const sx = pos.x + cameraX;
        const sy = pos.y + cameraY;
        const fadeAlpha = Math.min(1, bz.life / (bz.maxLife * 0.2)); // fade out in last 20%
        const pulseR = bz.radius * DIAMOND_W * (0.9 + Math.sin(performance.now() / 200) * 0.1);
        ctx.save();
        ctx.globalAlpha = 0.25 * fadeAlpha;
        ctx.globalCompositeOperation = 'screen';
        const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, pulseR);
        grad.addColorStop(0, (bz.color || '#ff4400') + 'cc');
        grad.addColorStop(0.6, (bz.color || '#ff4400') + '44');
        grad.addColorStop(1, (bz.color || '#ff4400') + '00');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(sx, sy, pulseR, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

// ----- ENEMY COLLISION (walls + other enemies) -----
function canEnemyMoveTo(row, col, radius, self) {
    // Wall/object collision
    const scanR0 = Math.floor(row - radius - 0.5);
    const scanR1 = Math.floor(row + radius + 0.5);
    const scanC0 = Math.floor(col - radius - 0.5);
    const scanC1 = Math.floor(col + radius + 0.5);

    for (let r = scanR0; r <= scanR1; r++) {
        for (let c = scanC0; c <= scanC1; c++) {
            if (r < 0 || r >= floorMap.length || c < 0 || c >= floorMap.length) {
                const pr0 = row - radius; const pr1 = row + radius;
                const pc0 = col - radius; const pc1 = col + radius;
                if (pr1 >= r && pr0 < r + 1 && pc1 >= c && pc0 < c + 1) return false;
                continue;
            }
            if (!blocked[r][c]) continue;
            if (blockType[r][c] === 'object') {
                const dist = Math.sqrt((row - r - 0.5) ** 2 + (col - c - 0.5) ** 2);
                if (dist < radius + objRadius[r][c]) return false;
            } else {
                const r0 = row - radius; const r1 = row + radius;
                const c0 = col - radius; const c1 = col + radius;
                if (r1 >= r && r0 < r + 1 && c1 >= c && c0 < c + 1) return false;
            }
        }
    }
    return true;
}

// ----- LEVEL-UP SYSTEM HELPERS -----
function grantXP(enemyType, statMult, row, col) {
    const baseAmount = ENEMY_XP[enemyType] || 5;
    // XP scales with sqrt of statMult — harder enemies give more XP but not linearly
    const scaledAmount = baseAmount * Math.sqrt(statMult || 1.0);
    const amount = Math.round(scaledAmount * getTalismanBonus().xpMult * killStreak.multiplier);
    xpState.xp += amount;
    // XP floating text feedback
    if (typeof pickupTexts !== 'undefined' && row !== undefined) {
        pickupTexts.push({ text: '+' + amount + ' XP', color: '#e8c840', row: row, col: col, offsetY: -18, life: 0.9 });
    }
    // Track kills for current form + evolution milestone toasts
    if (FormSystem.formData[FormSystem.currentForm]) {
        const _fd = FormSystem.formData[FormSystem.currentForm];
        _fd.totalKills++;
        // Evolution progress notifications at milestone kill counts
        if (typeof Notify !== 'undefined') {
            const _form = FormSystem.currentForm;
            const _req = typeof EVOLUTION_REQUIREMENTS !== 'undefined' ? (
                _form === 'slime' ? EVOLUTION_REQUIREMENTS.slime_to_skeleton :
                _form === 'skeleton' ? EVOLUTION_REQUIREMENTS.skeleton_to_wizard :
                _form === 'wizard' ? EVOLUTION_REQUIREMENTS.wizard_to_lich : null
            ) : null;
            if (_req && _req.kills) {
                const half = Math.floor(_req.kills / 2);
                if (_fd.totalKills === half) {
                    Notify.toast(`${Math.round((_fd.totalKills / _req.kills) * 100)}% kills toward evolution!`, { color: '#88ff88', duration: 3 });
                } else if (_fd.totalKills === _req.kills) {
                    Notify.toast('Kill requirement met — keep progressing!', { color: '#ffdd44', duration: 3.5 });
                }
            }
        }
    }
    // Wizard: track kills while below 30% mana (for lich evolution requirement)
    if (FormSystem.currentForm === 'wizard' && player.mana < (FORM_CONFIGS.wizard.maxMana || 100) * 0.3) {
        FormSystem.formData.wizard.lowManaKills++;
    }
    // Check level up
    if (xpState.xp >= xpState.xpToNext) {
        xpState.xp -= xpState.xpToNext;
        xpState.level++;
        xpState.xpToNext = xpForLevel(xpState.level);
        triggerLevelUp();
    }
}

function triggerLevelUp() {
    // Pick 3 random upgrades (no duplicates, respect maxStack)
    // Pity system: prefer upgrades not in recentlyOffered
    // Use the current form's upgrade pool
    const handler = FormSystem.getHandler();
    const currentPool = (handler && handler.getUpgradePool) ? handler.getUpgradePool() : UPGRADE_POOL;
    const lvl = xpState.level;
    const available = currentPool.filter(u => {
        if ((upgrades[u.id] || 0) >= u.maxStack) return false;
        const tier = u.tier || 'normal';
        if (tier === 'rare' && lvl < 5) return false;
        if (tier === 'legendary' && lvl < 10) return false;
        return true;
    });

    const choices = [];
    const pool = [...available];

    // Split pool into "fresh" (not recently offered) and "repeat" (recently offered)
    const fresh = pool.filter(u => !recentlyOffered.has(u.id));
    const repeat = pool.filter(u => recentlyOffered.has(u.id));

    // Prefer fresh upgrades, but use repeats if needed
    const priorityPool = fresh.length > 0 ? fresh : repeat;

    for (let i = 0; i < 3 && priorityPool.length > 0; i++) {
        const idx = Math.floor(Math.random() * priorityPool.length);
        const chosen = priorityPool[idx];
        choices.push(chosen);
        priorityPool.splice(idx, 1);

        // Also remove from the other pool to avoid duplicates
        const otherPool = priorityPool === fresh ? repeat : fresh;
        const otherIdx = otherPool.findIndex(u => u.id === chosen.id);
        if (otherIdx >= 0) otherPool.splice(otherIdx, 1);
    }

    // --- Guaranteed rare at level 7+, legendary at level 12+ ---
    if (lvl >= 7 && choices.length > 0) {
        const hasRare = choices.some(u => (u.tier || 'normal') === 'rare' || (u.tier || 'normal') === 'legendary');
        if (!hasRare) {
            // Try to swap last choice with a rare one from available pool
            const rarePool = available.filter(u => (u.tier || 'normal') === 'rare' && !choices.some(c => c.id === u.id));
            if (rarePool.length > 0) {
                choices[choices.length - 1] = rarePool[Math.floor(Math.random() * rarePool.length)];
            }
        }
    }
    if (lvl >= 12 && choices.length > 0) {
        const hasLegendary = choices.some(u => (u.tier || 'normal') === 'legendary');
        if (!hasLegendary) {
            // Try to swap last choice with a legendary one from available pool
            const legendPool = available.filter(u => (u.tier || 'normal') === 'legendary' && !choices.some(c => c.id === u.id));
            if (legendPool.length > 0) {
                choices[choices.length - 1] = legendPool[Math.floor(Math.random() * legendPool.length)];
            }
        }
    }

    if (choices.length === 0) {
        // All upgrades maxed — show celebration and continue playing
        pickupTexts.push({
            text: 'MAX POWER!',
            color: '#ffdd44',
            row: player.row, col: player.col,
            offsetY: 0, life: 2.0,
        });
        duckMusic(false);
        return;
    }

    // Track these offerings for pity system
    for (const choice of choices) {
        recentlyOffered.add(choice.id);
    }

    // Clear pity pool if it gets too large
    if (recentlyOffered.size >= PITY_POOL_SIZE) {
        recentlyOffered.clear();
    }

    xpState.levelUpChoices = choices;
    xpState.levelUpPending = true;
    xpState.levelUpHover = -1;
    xpState.levelUpKeyHover = -1;
    xpState.levelUpFadeIn = 0;
    xpState.levelUpRevealT = 0; // reset entrance animation timer
    xpState.levelUpHasLegendary = choices.some(c => (c.tier || 'normal') === 'legendary');
    // Duck music and play level-up sting + procedural chime
    duckMusic(true);
    playSting('levelUp');
    if (typeof sfxLevelUp === 'function') sfxLevelUp();
    // Legendary ceremony: extra slow-mo + golden screen flash on reveal
    if (xpState.levelUpHasLegendary) {
        addSlowMo(0.5, 0.15); // longer, deeper slow-mo for legendary
        if (typeof triggerScreenFlash === 'function') triggerScreenFlash(0.25, '#ffd855');
    }
    // Level-up shockwave — dramatic golden burst (research: slow-mo + shake + flash)
    addSlowMo(0.3, 0.2); // brief celebratory slow-mo
    addScreenShake(6, 0.25);
    if (typeof addCameraZoom === 'function') addCameraZoom(1.04, 0.8);
    if (typeof spawnImpactRipple === 'function') {
        const lvPos = tileToScreen(player.row, player.col);
        spawnImpactRipple(lvPos.x + cameraX, lvPos.y + cameraY, '#ffdd44', 140);
    }
    // Golden particle burst from player
    if (typeof _emitParticle === 'function') {
        const lvP = tileToScreen(player.row, player.col);
        const lpx = lvP.x + cameraX, lpy = lvP.y + cameraY - 20;
        for (let li = 0; li < 16; li++) {
            const la = (li / 16) * Math.PI * 2;
            const ls = 2.5 + Math.random() * 2;
            _emitParticle(lpx, lpy, Math.cos(la) * ls, Math.sin(la) * ls - 1,
                0.8 + Math.random() * 0.3, 3 + Math.random() * 2, '#ffdd44', 0.8, 'cast', 'screen');
        }
    }
    // Push nearby enemies away — brief breathing room
    for (const e of enemies) {
        if (e.state === 'death') continue;
        const dr = e.row - player.row, dc = e.col - player.col;
        const dist = Math.sqrt(dr * dr + dc * dc);
        if (dist < 4 && dist > 0.1) {
            e.knockVr = (e.knockVr || 0) + (dr / dist) * 3;
            e.knockVc = (e.knockVc || 0) + (dc / dist) * 3;
        }
    }
    // Tutorial hint on first level-up
    if (typeof Notify !== 'undefined') {
        Notify.hint('tutorial_levelup', 'Choose an upgrade! Hover cards to preview.', 4, { color: '#e8c868', borderColor: '#8a7030' });
    }
}

function applyUpgrade(upgradeId) {
    upgrades[upgradeId] = (upgrades[upgradeId] || 0) + 1;
    xpState.levelUpPending = false;
    duckMusic(false); // restore music volume
    xpState.levelUpChoices = [];
    setPixelCursor('none');
    // Power surge feedback — brief flash + particle burst from player
    addScreenShake(3, 0.15);
    if (typeof spawnParticleBurst === 'function') spawnParticleBurst(player.row, player.col, 30, '#e8c840');
    if (typeof sfxLevelUp === 'function') sfxLevelUp();
    // Check for newly unlocked upgrade synergies
    if (typeof checkSynergies === 'function') {
        const newSynergies = checkSynergies();
        for (const syn of newSynergies) {
            if (typeof Notify !== 'undefined') {
                Notify.toast('SYNERGY: ' + syn.name + ' — ' + syn.desc, { duration: 5, color: syn.color, borderColor: syn.color });
            }
            addScreenShake(6, 0.25);
            addSlowMo(0.4, 0.2);
            if (typeof spawnParticleBurst === 'function') spawnParticleBurst(player.row, player.col, 35, syn.color);
        }
    }
}

// Helper to get current stack count
function getUpgrade(id) { return upgrades[id] || 0; }

// ----- PLAYER DAMAGE -----
function damagePlayer(amount, enemyType = '', sourceRow, sourceCol) {
    if (player.dodging) return; // immune during phase jump
    if (typeof skeletonState !== 'undefined' && skeletonState.rolling) return;
    if (typeof slimeState !== 'undefined' && slimeState.bounceJumping) return;
    if (playerInvTimer > 0) return;
    // Skeleton shield reduces damage by 70%
    if (FormSystem.currentForm === 'skeleton' && typeof skeletonState !== 'undefined' && skeletonState.shieldUp) {
        const blockedDmg = amount - Math.round(amount * 0.3);
        FormSystem.formData.skeleton.shieldDamageBlocked += blockedDmg; // track for evolution
        amount = Math.round(amount * 0.3); // shield reduces 70%
    }
    // Lich Ethereal Form: 25% damage reduction per stack when above 80 soul energy
    if (FormSystem.currentForm === 'lich' && typeof lichState !== 'undefined' &&
        getUpgrade('ethereal_form') > 0 && lichState.soulEnergy >= 80) {
        amount = Math.round(amount * (1 - 0.25 * getUpgrade('ethereal_form')));
    }
    // Wizard Mana Shield: 15% damage reduction per stack while above 50% mana
    if (FormSystem.currentForm === 'wizard' && getUpgrade('mana_shield') > 0 &&
        player.mana >= MAX_MANA * 0.5) {
        amount = Math.round(amount * (1 - 0.15 * getUpgrade('mana_shield')));
    }
    // Skeleton combo armor: 3% reduction per combo stack (max 30%)
    if (FormSystem.currentForm === 'skeleton' && typeof skeletonState !== 'undefined' &&
        skeletonState.comboCount > 0) {
        const comboReduc = Math.min(0.30, skeletonState.comboCount * 0.03);
        amount = Math.round(amount * (1 - comboReduc));
    }
    const _potionReduc = typeof getPotionDmgReduc === 'function' ? getPotionDmgReduc() : 0;
    // Iron Bones upgrade (skeleton): flat damage reduction per stack
    const _ironBonesReduc = (FormSystem.currentForm === 'skeleton' && typeof getUpgrade === 'function') ? getUpgrade('iron_bones') * 0.05 : 0;
    let reducedAmt = Math.max(1, Math.round(amount * (1 - (equipBonus.dmgReduc || 0) - _potionReduc - _ironBonesReduc)));

    // === SLIME: Membrane shield absorbs damage before HP ===
    if (FormSystem.currentForm === 'slime' && typeof slimeState !== 'undefined' && slimeState.membraneShield > 0) {
        if (reducedAmt <= slimeState.membraneShield) {
            slimeState.membraneShield -= reducedAmt;
            pickupTexts.push({
                row: player.row, col: player.col,
                text: 'Shielded!', color: '#66ccff',
                life: 0.6, offsetY: -10,
            });
            // Still trigger inv frames but no HP loss
            playerInvTimer = PLAYER_INV_TIME;
            addScreenShake(2, 0.1);
            sfxPlayerHurt();
            return;
        } else {
            reducedAmt -= slimeState.membraneShield;
            slimeState.membraneShield = 0;
        }
    }

    // === SLIME: Volatile Mass — shed size in acid explosion on big hits ===
    if (FormSystem.currentForm === 'slime' && typeof slimeState !== 'undefined' &&
        getUpgrade('volatile_mass') > 0 && reducedAmt >= 15 && slimeState.size > 1.5) {
        _slimeVolatileMassBurst(reducedAmt);
    }

    player.hp -= reducedAmt;
    playerInvTimer = PLAYER_INV_TIME;
    // Kill streak breaks on taking damage
    killStreak.count = 0;
    killStreak.multiplier = 1.0;
    killStreak.timer = 0;
    // Scale feedback by damage taken — directional if source position known
    const shakeScale = Math.min(2.0, reducedAmt / 15);
    if (sourceRow !== undefined && typeof addDirectionalShake === 'function') {
        addDirectionalShake(sourceRow, sourceCol, 4 + 6 * shakeScale, 0.15 + 0.1 * shakeScale);
    } else {
        addScreenShake(4 + 6 * shakeScale, 0.15 + 0.1 * shakeScale);
    }
    addHitPause(0.03 + 0.04 * shakeScale);
    if (reducedAmt >= 25) addSlowMo(0.12, 0.3); // big hit slow-mo
    // ── COMBAT JUICE: Damage vignette — intensity scales with damage ──
    const vigStr = Math.min(1.0, reducedAmt / (PLAYER_STATS.maxHp * 0.4));
    dmgVignetteIntensity = Math.max(dmgVignetteIntensity, 0.3 + vigStr * 0.7);
    dmgVignetteTimer = 0.4 + vigStr * 0.3; // bigger hit = longer flash
    if (player.hp <= 0) {
        // LEGENDARY: Veil of the Undying — survive lethal damage once per zone
        let _veilSaved = false;
        if (typeof equipBonus !== 'undefined' && equipBonus.effects && typeof veilUndyingCooldown !== 'undefined' && veilUndyingCooldown <= 0) {
            for (const eff of equipBonus.effects) {
                if (eff.id === 'veil_undying') {
                    player.hp = Math.max(1, Math.round(getPlayerMaxHP() * 0.15));
                    veilUndyingCooldown = 60; // 60s cooldown
                    _veilSaved = true;
                    playerInvTimer = 1.5; // brief invulnerability
                    addScreenShake(10, 0.6);
                    if (typeof spawnParticleBurst === 'function') spawnParticleBurst(player.row, player.col, 30, '#ffd700');
                    pickupTexts.push({ text: 'UNDYING!', color: '#ffd700', row: player.row, col: player.col, offsetY: -20, life: 2.5 });
                    if (typeof sfxEvolution === 'function') sfxEvolution();
                    break;
                }
            }
        }
        // Skeleton Undying Resolve — survive lethal blow once per zone
        if (!_veilSaved && typeof skeletonState !== 'undefined' && skeletonState.undyingResolveReady && FormSystem.currentForm === 'skeleton') {
            player.hp = 1;
            skeletonState.undyingResolveReady = false;
            playerInvTimer = 1.5;
            addScreenShake(8, 0.5);
            addSlowMo(0.6, 0.2);
            if (typeof Notify !== 'undefined') Notify.toast('Undying Resolve!', { duration: 3, color: '#ffffff', borderColor: '#888888' });
            if (typeof spawnParticleBurst === 'function') spawnParticleBurst(player.row, player.col, 30, '#ffffff');
            _veilSaved = true;
        }
        // Lich Phylactery — consume soul energy to cheat death
        if (!_veilSaved && typeof lichState !== 'undefined' && lichState.soulEnergy >= 30 && FormSystem.currentForm === 'lich') {
            player.hp = Math.round(getPlayerMaxHP() * 0.3);
            lichState.soulEnergy -= 30;
            playerInvTimer = 1.5;
            addScreenShake(10, 0.6);
            addSlowMo(0.8, 0.15);
            if (typeof Notify !== 'undefined') Notify.toast('Phylactery Activated!', { duration: 3, color: '#aa44ff', borderColor: '#6622aa' });
            if (typeof spawnParticleBurst === 'function') spawnParticleBurst(player.row, player.col, 35, '#aa44ff');
            _veilSaved = true;
        }
        if (!_veilSaved) {
        player.hp = 0;
        gameDead = true;
        deathFadeTimer = 0;
        deathCause = enemyType || 'Unknown';
        deathRecapTimer = 0;
        placement.active = false;

        // ── Update player profile on death ──
        if (typeof playerProfile !== 'undefined') {
            playerProfile.totalDeaths++;
            playerProfile.totalRuns++;
            playerProfile.totalKills += wave.totalKilled;
            if (currentZone > playerProfile.bestZone || (currentZone === playerProfile.bestZone && wave.current > playerProfile.bestWave)) {
                playerProfile.bestZone = currentZone;
                playerProfile.bestWave = wave.current;
            }
            if (wave.totalKilled > playerProfile.bestKills) playerProfile.bestKills = wave.totalKilled;
            if (xpState.level > playerProfile.bestLevel) playerProfile.bestLevel = xpState.level;
            // Record death in bestiary (enemy that killed player)
            if (deathCause && deathCause !== 'Unknown') {
                if (!playerProfile.bestiary[deathCause]) playerProfile.bestiary[deathCause] = { killed: 0, killedBy: 0, name: deathCause };
                playerProfile.bestiary[deathCause].killedBy++;
            }
            // Add to run history (last 10)
            const _runTime = typeof runStartTime !== 'undefined' ? Math.round((Date.now() - runStartTime) / 1000) : 0;
            const _upgradeCount = typeof upgrades !== 'undefined' ? Object.values(upgrades).reduce(function(s, v) { return s + v; }, 0) : 0;
            playerProfile.runHistory.push({
                zone: currentZone, wave: wave.current, kills: wave.totalKilled,
                form: FormSystem.currentForm, level: xpState.level,
                gold: typeof runGoldEarned !== 'undefined' ? runGoldEarned : 0,
                upgrades: _upgradeCount, cause: deathCause,
                time: _runTime, timestamp: Date.now(),
            });
            if (playerProfile.runHistory.length > 10) playerProfile.runHistory.shift();
            // Check milestones
            if (typeof MILESTONE_DEFS !== 'undefined') {
                const _run = { zone: currentZone, wave: wave.current, kills: wave.totalKilled, form: FormSystem.currentForm };
                for (var mi = 0; mi < MILESTONE_DEFS.length; mi++) {
                    var ms = MILESTONE_DEFS[mi];
                    if (!playerProfile.milestones[ms.id] && ms.check(playerProfile, _run)) {
                        playerProfile.milestones[ms.id] = true;
                        if (typeof Notify !== 'undefined') {
                            Notify.toast('MILESTONE: ' + ms.name + ' — ' + ms.desc, { duration: 5, color: '#ffd700', borderColor: '#aa8800' });
                        }
                    }
                }
            }
        }
        if (typeof slimeState !== 'undefined') {
            slimeState.splitClones.length = 0;
            slimeState.acidPuddles.length = 0;
        }
        if (typeof resetSkeletonCombat !== 'undefined') {
            resetSkeletonCombat();
        }
        sfxPlayerDeath();
        // Fade to death music
        playMusic('death', 2.0);
        } // end if (!_veilSaved)
    } else {
        sfxPlayerHurt();
    }

    // Thorns of Flame: damage melee attackers (uses unified hit pipeline)
    if (getUpgrade('thorns') > 0) {
        const thornDmg = 15 * getUpgrade('thorns');
        sfxThorns();
        for (const e of enemies) {
            if (e.state === 'death') continue;
            const dr = e.row - player.row;
            const dc = e.col - player.col;
            if (Math.sqrt(dr*dr + dc*dc) < 1.5) {
                applyEnemyHit(e, thornDmg, { skipSFX: false });
            }
        }
    }

    // Augment passive effects on taking damage
    if (typeof equipBonus !== 'undefined' && equipBonus.effects) {
        for (const eff of equipBonus.effects) {
            // Toxic Blood: poison nearby melee attacker
            if (eff.id === 'toxic_blood') {
                for (const e of enemies) {
                    if (e.state === 'death') continue;
                    const dist = Math.sqrt((e.row - player.row) ** 2 + (e.col - player.col) ** 2);
                    if (dist < 1.5) {
                        applyEnemyHit(e, Math.round(eff.poisonDPS * eff.poisonDur), { skipHurtState: true, skipSFX: true });
                        spawnParticle(e.row, e.col, 0, -1, 0.5, '#44dd66', 0.7);
                    }
                }
            }
            // Adhesive Membrane: slow nearby attacker
            if (eff.id === 'adhesive_membrane') {
                for (const e of enemies) {
                    if (e.state === 'death') continue;
                    const dist = Math.sqrt((e.row - player.row) ** 2 + (e.col - player.col) ** 2);
                    if (dist < 1.5) {
                        e.slowTimer = Math.max(e.slowTimer || 0, eff.slowDur || 1.5);
                    }
                }
            }
        }
    }
}

// ----- FIREBALL → ENEMY COLLISION -----
function checkProjectileEnemyHits() {
    for (const p of projectiles) {
        if (p.hit) continue;
        for (const e of enemies) {
            if (e.state === 'death') continue;
            if (e._ambushHidden) continue; // pit lurker hidden — no collision
            if (p.hitEnemies && p.hitEnemies.has(e)) continue; // already hit this enemy
            const dr = p.row - e.row;
            const dc = p.col - e.col;
            const dist = Math.sqrt(dr * dr + dc * dc);
            if (dist < e.def.hitboxR + 0.25) {
                // Infernal Knight shield phase — immune to damage
                if (e.bossShieldPhaseActive) {
                    // Deflection particles
                    spawnParticle(e.row, e.col, (Math.random()-0.5)*3, (Math.random()-0.5)*3, 0.2, '#ff8844', 0.6);
                    if (!p.hitEnemies) p.hitEnemies = new Set();
                    p.hitEnemies.add(e);
                    continue;
                }
                // Hit!
                const baseProjDmg = p.damage || FIREBALL_DAMAGE; // use projectile's own damage if set
                const _bonus = calcPlayerDmgBonus();
                const dmgBonus = _bonus.flat;
                const shieldReduc = e.isShielding ? (1 - (e.def.shieldDmgReduc || 0)) : 1;
                let projFinalDmg = Math.round((baseProjDmg + dmgBonus) * shieldReduc * _bonus.mult);

                // ── COMBAT JUICE: Critical hit roll ──
                const isCrit = Math.random() < CRIT_CHANCE;
                if (isCrit) projFinalDmg = Math.round(projFinalDmg * CRIT_MULTIPLIER);

                // Elite shielded: reduce incoming damage by 30% when shield is active
                if (e.elite === 'shielded' && e._eliteShieldTimer > 0) {
                    projFinalDmg = Math.round(projFinalDmg * (1 - ELITE_SHIELDED_ABSORB));
                    e._eliteShieldFlash = 0.15;
                    spawnParticle(e.row, e.col, (Math.random()-0.5)*2, -1, 0.25, COLORS.ELITE_SHIELDED_TINT, 0.7);
                }
                // Elite thorned: reflect 15% damage back to player
                if (e.elite === 'thorned') {
                    const reflectDmg = Math.max(1, Math.round(projFinalDmg * ELITE_THORNED_REFLECT));
                    damagePlayer(reflectDmg, 'thorned_reflect');
                    spawnParticle(e.row, e.col, (Math.random()-0.5)*2, -1, 0.25, COLORS.ELITE_THORNED_TINT, 0.7);
                }

                // Talisman Echo: Bone Rhythm — increment hit combo on projectile hit
                if (typeof hasTalismanEcho === 'function' && hasTalismanEcho('spell_combo') && player._boneRhythmTimer > 0) {
                    player._boneRhythmHits = (player._boneRhythmHits || 0) + 1;
                    player._boneRhythmTimer = 1.5; // refresh window
                    var _brEcho = getTalismanEcho('spell_combo');
                    if (_brEcho && player._boneRhythmHits >= _brEcho.comboTarget) {
                        player._boneRhythmHits = 0;
                        player._boneRhythmSpeedBoost = _brEcho.boostDuration;
                        if (typeof Notify !== 'undefined') Notify.toast('Bone Rhythm!', { duration: 1.5, color: '#ddcc88' });
                        if (typeof spawnParticleBurst === 'function') spawnParticleBurst(player.row, player.col, 10, '#ddcc88');
                    }
                }

                // Marrow Spike upgrade (skeleton): bonus damage to low-HP enemies
                if (p.isBone && typeof getUpgrade === 'function' && getUpgrade('marrow_spike') > 0 &&
                    e.maxHp > 0 && e.hp / e.maxHp < 0.3) {
                    projFinalDmg = Math.round(projFinalDmg * (1 + 0.5 * getUpgrade('marrow_spike')));
                }

                e.hp -= projFinalDmg;
                e.hitFlashTimer = isCrit ? 0.18 : 0.1; // longer flash on crit

                // ── COMBAT JUICE: Impact scaling by enemy max HP ──
                const impactScale = Math.min(2.5, Math.max(0.8, (e.def.hp || 30) / 60));

                // Floating damage number (gold + bigger on crit) — stagger Y to prevent overlap
                if (!e._dmgNumTimer) e._dmgNumTimer = 0;
                if (!e._dmgNumOffset) e._dmgNumOffset = 0;
                const _projDmgNow = performance.now() / 1000;
                if (_projDmgNow - e._dmgNumTimer < 0.4) { e._dmgNumOffset -= 12; }
                else { e._dmgNumOffset = 0; }
                e._dmgNumTimer = _projDmgNow;
                pickupTexts.push({
                    text: isCrit ? '-' + projFinalDmg + '!' : '-' + projFinalDmg,
                    color: isCrit ? COLORS.DAMAGE_CRIT : COLORS.DAMAGE_RED,
                    row: e.row, col: e.col,
                    offsetY: -10 - Math.random() * 8 + (e._dmgNumOffset || 0),
                    life: isCrit ? 1.1 : 0.8,
                    isCrit: isCrit, // flag for scaled rendering
                });

                // Crit: bright white spark burst at impact
                if (isCrit) {
                    const critPos = tileToScreen(e.row, e.col);
                    const cx = critPos.x + cameraX, cy = critPos.y + cameraY;
                    const critCount = Math.max(4, Math.round(8 * GFX.particleMul));
                    for (let ci = 0; ci < critCount; ci++) {
                        const ca = (Math.PI * 2 * ci) / critCount + (Math.random() - 0.5) * 0.5;
                        _emitParticle(cx, cy,
                            Math.cos(ca) * (4 + Math.random() * 3),
                            Math.sin(ca) * (4 + Math.random() * 3),
                            0.25, 2 + Math.random() * 1.5,
                            '#ffffcc', 1.0, 'crit', 'screen'
                        );
                    }
                }

                if (!p.hitEnemies) p.hitEnemies = new Set();
                p.hitEnemies.add(e);

                // Hit feel: scaled by enemy size + crit
                const isKill = e.hp <= 0;
                const critMul = isCrit ? 2.0 : 1.0;
                addHitPause(isKill ? 0.06 * impactScale : 0.035 * impactScale * critMul);
                addScreenShake(
                    (isKill ? 4 : 2.5) * impactScale * critMul,
                    (isKill ? 0.15 : 0.08) * impactScale
                );

                // Knockback — varies by projectile type
                const kbMult = p.canExplode ? KNOCKBACK_MULT.explode : KNOCKBACK_MULT.normal;
                // Apply knockback resistance for boss enemies
                const kbResist = e.def.knockbackResist || 1.0;
                e.knockVr = (e.knockVr || 0) + (p.vr / ATK_SPEED) * ENEMY_KNOCKBACK * kbMult * kbResist;
                e.knockVc = (e.knockVc || 0) + (p.vc / ATK_SPEED) * ENEMY_KNOCKBACK * kbMult * kbResist;

                // Handle pierce
                if (p.pierceLeft > 0) {
                    p.pierceLeft--;
                    // Don't mark as hit, keep going
                } else {
                    p.hit = true;
                    p.life = 0.3;
                    // Acid spit leaves a mini puddle on impact
                    if (p.isAcid && typeof slimeState !== 'undefined') {
                        slimeState.acidPuddles.push({
                            row: p.row, col: p.col,
                            radius: 0.5, damage: 3 * (1 + getUpgrade('acid_potency') * 0.2),
                            life: 2.0, dmgTimer: 0,
                        });
                        // === CORROSIVE LINGER — acid DOT on hit enemy ===
                        const _lingerLvl = getUpgrade('corrosive_linger');
                        if (_lingerLvl > 0 && e.state !== 'death') {
                            const dotTicks = 3 + _lingerLvl;
                            const dotDmgPerTick = Math.round(projFinalDmg * 0.15 * (1 + getUpgrade('acid_potency') * 0.1));
                            // Refresh DOT: keep higher damage, reset tick count
                            if (e._corrosiveDot && e._corrosiveDot.ticks > 0) {
                                e._corrosiveDot.ticks = Math.max(e._corrosiveDot.ticks, dotTicks);
                                e._corrosiveDot.dmgPerTick = Math.max(e._corrosiveDot.dmgPerTick, dotDmgPerTick);
                            } else {
                                e._corrosiveDot = {
                                    ticks: dotTicks,
                                    dmgPerTick: dotDmgPerTick,
                                    interval: 0.5,
                                    timer: 0.5,
                                };
                            }
                        }
                        // === RICOCHET SPIT — bounce to nearby enemy ===
                        const _ricochetLvl = getUpgrade('ricochet_spit');
                        if (_ricochetLvl > 0 && !p._hasRicocheted) {
                            let bounceCount = _ricochetLvl;
                            let lastTarget = e;
                            let lastRow = p.row, lastCol = p.col;
                            for (let _rb = 0; _rb < bounceCount; _rb++) {
                                let _nearE = null, _nearD = Infinity;
                                for (const _ce of enemies) {
                                    if (_ce.state === 'death' || _ce === lastTarget) continue;
                                    if (p.hitEnemies && p.hitEnemies.has(_ce)) continue;
                                    const _d = Math.sqrt((_ce.row - lastRow) ** 2 + (_ce.col - lastCol) ** 2);
                                    if (_d < 4.0 && _d < _nearD) { _nearD = _d; _nearE = _ce; }
                                }
                                if (_nearE) {
                                    const ricochetDmg = Math.round(projFinalDmg * 0.6);
                                    _nearE.hp -= ricochetDmg;
                                    _nearE.hitFlashTimer = 0.1;
                                    if (_nearE.hp <= 0 && _nearE.state !== 'death') {
                                        _nearE.hp = 0; _nearE.state = 'death'; _nearE.deathTimer = 0.7; _nearE.animFrame = 0;
                                        sfxEnemyDeath(_nearE.row, _nearE.col); rollEnemyLoot(_nearE);
                                        if (typeof spawnDeathBurst === 'function') {
                                            const _dp = tileToScreen(_nearE.row, _nearE.col);
                                            spawnDeathBurst(_dp.x + cameraX, _dp.y + cameraY, _nearE.def.tint || '#ff6644');
                                        }
                                        if (_nearE.def.isBoss) { addSlowMo(0.4, 0.15); addScreenShake(12, 0.4); }
                                    } else if (_nearE.hp > 0) {
                                        _nearE.state = 'hurt'; _nearE.hurtTimer = 0.2; _nearE.animFrame = 0;
                                        sfxEnemyHurt(_nearE.row, _nearE.col);
                                    }
                                    pickupTexts.push({
                                        text: '-' + ricochetDmg,
                                        color: '#88ee44',
                                        row: _nearE.row, col: _nearE.col,
                                        offsetY: -10 - Math.random() * 8,
                                        life: 0.7,
                                    });
                                    // Apply corrosive DOT to ricochet target too
                                    if (_lingerLvl > 0 && _nearE.state !== 'death') {
                                        _nearE._corrosiveDot = {
                                            ticks: 3 + _lingerLvl,
                                            dmgPerTick: Math.round(ricochetDmg * 0.15 * (1 + getUpgrade('acid_potency') * 0.1)),
                                            interval: 0.5,
                                            timer: 0.5,
                                        };
                                    }
                                    // Ricochet particle trail
                                    const _rFrom = tileToScreen(lastRow, lastCol);
                                    const _rTo = tileToScreen(_nearE.row, _nearE.col);
                                    _emitParticle(
                                        _rFrom.x + cameraX, _rFrom.y + cameraY,
                                        (_rTo.x - _rFrom.x) * 2, (_rTo.y - _rFrom.y) * 2,
                                        0.2, 3, '#66dd33', 0.7, 'effect'
                                    );
                                    if (!p.hitEnemies) p.hitEnemies = new Set();
                                    p.hitEnemies.add(_nearE);
                                    lastTarget = _nearE;
                                    lastRow = _nearE.row;
                                    lastCol = _nearE.col;
                                } else break;
                            }
                            p._hasRicocheted = true;
                        }
                    }
                }

                // LEGENDARY: Burn Ground — 20% chance to leave fire on impact
                if (!p.isAcid && !p.isBone && !p.isDark && typeof equipBonus !== 'undefined' && equipBonus.effects) {
                    for (const eff of equipBonus.effects) {
                        if (eff.id === 'burn_ground' && Math.random() < (eff.chance || 0.20)) {
                            burnZones.push({ row: e.row, col: e.col, radius: 0.8, damage: eff.dmg || 3, life: eff.duration || 2, maxLife: eff.duration || 2, tickTimer: 0 });
                            break;
                        }
                    }
                }

                // SFX: fireball impact
                sfxFireballHit();

                // Explosion on impact
                if (p.canExplode) {
                    sfxExplosion();
                    addScreenShake(7, 0.25);
                    addHitPause(0.06);
                    addSlowMo(0.1, 0.25); // devastating explosion slow-mo
                    const explodeRadius = 2.5;
                    const explodeDmg = Math.round((baseProjDmg + dmgBonus) * 0.4 * p.explodeScale);
                    for (const e2 of enemies) {
                        if (e2.state === 'death' || e2 === e) continue;
                        const dr2 = p.row - e2.row;
                        const dc2 = p.col - e2.col;
                        if (Math.sqrt(dr2 * dr2 + dc2 * dc2) < explodeRadius) {
                            e2.hp -= explodeDmg;
                            e2.hitFlashTimer = 0.1;
                            // Radial knockback from explosion center
                            const kbDr2 = e2.row - p.row, kbDc2 = e2.col - p.col;
                            const kbLen2 = Math.sqrt(kbDr2 * kbDr2 + kbDc2 * kbDc2) || 1;
                            e2.knockVr = (e2.knockVr || 0) + (kbDr2 / kbLen2) * ENEMY_KNOCKBACK * KNOCKBACK_MULT.explode * (e2.def.knockbackResist || 1.0);
                            e2.knockVc = (e2.knockVc || 0) + (kbDc2 / kbLen2) * ENEMY_KNOCKBACK * KNOCKBACK_MULT.explode * (e2.def.knockbackResist || 1.0);
                            // Floating damage number for AoE hit — stagger offset
                            if (!e2._dmgNumTimer) e2._dmgNumTimer = 0;
                            if (!e2._dmgNumOffset) e2._dmgNumOffset = 0;
                            const _aoeDmgNow = performance.now() / 1000;
                            if (_aoeDmgNow - e2._dmgNumTimer < 0.4) { e2._dmgNumOffset -= 12; }
                            else { e2._dmgNumOffset = 0; }
                            e2._dmgNumTimer = _aoeDmgNow;
                            pickupTexts.push({
                                text: '-' + explodeDmg,
                                color: COLORS.DAMAGE_RED,
                                row: e2.row, col: e2.col,
                                offsetY: -10 - Math.random() * 8 + (e2._dmgNumOffset || 0),
                                life: 0.8,
                            });
                            if (e2.hp <= 0 && e2.state !== 'death') {
                                e2.hp = 0; e2.state = 'death'; e2.deathTimer = 0.7; e2.animFrame = 0;
                                sfxEnemyDeath(e2.row, e2.col); rollEnemyLoot(e2);
                                if (typeof spawnDeathBurst === 'function') {
                                    const _dp = tileToScreen(e2.row, e2.col);
                                    spawnDeathBurst(_dp.x + cameraX, _dp.y + cameraY, e2.def.tint || '#ff6644');
                                }
                            } else if (e2.hp > 0) {
                                e2.state = 'hurt'; e2.hurtTimer = 0.2; e2.animFrame = 0;
                                sfxEnemyHurt(e2.row, e2.col);
                                const hitPos2 = tileToScreen(e2.row, e2.col);
                                spawnHitSpark(hitPos2.x + cameraX, hitPos2.y + cameraY);
                            }
                        }
                    }
                    // Chain Reaction synergy: explosions spawn sub-projectiles outward
                    if (typeof hasSynergy === 'function' && hasSynergy('chain_reaction')) {
                        for (let si = 0; si < 4; si++) {
                            const sa = (si / 4) * Math.PI * 2 + Math.random() * 0.3;
                            const subProj = recycleProj(p.row, p.col, Math.cos(sa) * ATK_SPEED * 0.7, Math.sin(sa) * ATK_SPEED * 0.7);
                            subProj.damage = Math.round(explodeDmg * 0.5);
                            subProj.life = 0.6;
                            subProj.canExplode = false; // no infinite chain
                            subProj.pierce = true;
                        }
                    }
                }

                // Marrow Leech: skeleton bone hits heal player
                if (p.marrowLeech) {
                    const healAmt = Math.round(p.damage * MARROW_LEECH_HEAL_MULT);
                    player.hp = Math.min(getPlayerMaxHP(), player.hp + healAmt);
                }

                // Skeleton combo system: increment on bone hit
                if (p.isBone && typeof skeletonState !== 'undefined') {
                    skeletonState.comboCount = Math.min(skeletonState.maxCombo, skeletonState.comboCount + 1);
                    skeletonState.comboTimer = 0; // reset decay timer
                }

                // Bone Ricochet upgrade: chain bone to nearest enemy on hit
                if (p.isBone && typeof getUpgrade === 'function' && getUpgrade('bone_ricochet') > 0 &&
                    (!p._ricochetCount || p._ricochetCount < getUpgrade('bone_ricochet'))) {
                    let nearestE = null, nearestDist = 3.0; // 3 tile max chain range
                    for (const e2 of enemies) {
                        if (e2 === e || e2.state === 'death') continue;
                        if (p.hitEnemies && p.hitEnemies.has(e2)) continue;
                        const d2 = Math.sqrt((e2.row - e.row) ** 2 + (e2.col - e.col) ** 2);
                        if (d2 < nearestDist) { nearestDist = d2; nearestE = e2; }
                    }
                    if (nearestE) {
                        const chainProj = recycleProj(e.row, e.col,
                            ((nearestE.row - e.row) / nearestDist) * ATK_SPEED,
                            ((nearestE.col - e.col) / nearestDist) * ATK_SPEED);
                        chainProj.damage = Math.round(p.damage * 0.6); // 60% damage per bounce
                        chainProj.life = 0.5;
                        chainProj.isBone = true;
                        chainProj.marrowLeech = p.marrowLeech;
                        chainProj._ricochetCount = (p._ricochetCount || 0) + 1;
                    }
                }

                if (e.hp <= 0) {
                    e.hp = 0;
                    e.state = 'death';
                    e.deathTimer = 0.7;
                    e.animFrame = 0;
                    sfxEnemyDeath(e.row, e.col);
                    rollEnemyLoot(e);
                    // Bone Collector synergy: bone kills restore ammo
                    if (p.isBone && typeof hasSynergy === 'function' && hasSynergy('bone_collector') &&
                        typeof skeletonState !== 'undefined') {
                        skeletonState.boneAmmo = Math.min(skeletonState.maxBoneAmmo || 20, (skeletonState.boneAmmo || 0) + 2);
                    }
                    // Death particles — directional burst away from projectile
                    if (typeof spawnDeathBurst === 'function') {
                        const deathPos = tileToScreen(e.row, e.col);
                        spawnDeathBurst(deathPos.x + cameraX, deathPos.y + cameraY, e.def.tint || '#aa8866');
                    }
                    // Boss kill: dramatic slow-mo
                    if (e.def.isBoss) { addSlowMo(0.4, 0.15); addScreenShake(12, 0.4); }
                } else {
                    // Stagger with cooldown (prevents perma-stagger on bosses)
                    if (e.staggerCooldown <= 0) {
                        const _projHurtDur = e.def.isBoss ? 0.15 : 0.3;
                        e.state = 'hurt';
                        e.hurtTimer = _projHurtDur;
                        e.animFrame = 0;
                        e.staggerCooldown = 0.3;
                    }
                    sfxEnemyHurt(e.row, e.col);
                    // Spawn hit spark particle
                    const hitPos = tileToScreen(e.row, e.col);
                    spawnHitSpark(hitPos.x + cameraX, hitPos.y + cameraY);
                    // Retreat impulse for ranged enemies when hit
                    if (e.def.retreatOnHit && Math.random() < e.def.retreatOnHit) {
                        const rdr = e.row - player.row;
                        const rdc = e.col - player.col;
                        const rLen = Math.sqrt(rdr * rdr + rdc * rdc) || 1;
                        e.knockVr += (rdr / rLen) * 1.5;
                        e.knockVc += (rdc / rLen) * 1.5;
                    }
                }

                if (p.hit) break; // one hit per projectile unless piercing
            }
        }
    }
}

// ----- SKELETON ARCHER ARROW -----
function fireEnemyArrow(e, opts) {
    opts = opts || {};
    const dr = player.row - e.row;
    const dc = player.col - e.col;
    const len = Math.sqrt(dr * dr + dc * dc) || 1;
    const speed = 6;

    const screenVx = (dc / len) - (dr / len);
    const screenVy = ((dc / len) + (dr / len)) * 0.5;
    const angle = Math.atan2(screenVy, screenVx);

    // AI escalation: archers fire burst of 2-3 at high statMult
    const burstCount = (e.statMult || 1) >= 5 ? 3 : (e.statMult || 1) >= 3 ? 2 : 1;
    for (let b = 0; b < burstCount; b++) {
        // Spread shots slightly for bursts
        const spreadAngle = burstCount > 1 ? (b - (burstCount - 1) / 2) * 0.12 : 0;
        const cosS = Math.cos(spreadAngle);
        const sinS = Math.sin(spreadAngle);
        const normR = dr / len;
        const normC = dc / len;
        const spreadR = normR * cosS - normC * sinS;
        const spreadC = normR * sinS + normC * cosS;
        // Stagger burst timing with slight delay
        const delay = b * 0.15;
        const proj = {
            row: b === 0 ? e.row : e.row - spreadR * delay * speed,
            col: b === 0 ? e.col : e.col - spreadC * delay * speed,
            vr: spreadR * speed, vc: spreadC * speed,
            life: 2.5, angle,
            damage: b === 0 ? e.def.damage : Math.round(e.def.damage * ENEMY_PROJECTILE_BURST_MULT),
        };
        // Apply optional overrides (frost_arrow type, slow duration, etc.)
        if (opts.type) proj.type = opts.type;
        if (opts.slowDuration) proj.slowDuration = opts.slowDuration;
        enemyProjectiles.push(proj);
    }
    sfxArrowShoot(e.row, e.col);
}

function updateEnemyProjectiles(dt) {
    for (let i = enemyProjectiles.length - 1; i >= 0; i--) {
        const a = enemyProjectiles[i];
        a.life -= dt;
        const nr = a.row + a.vr * dt;
        const nc = a.col + a.vc * dt;

        // Update angle for rendering
        a.angle = Math.atan2(a.vc, a.vr);

        // Wall collision (special projectiles pass through walls)
        const passesWalls = a.type === 'void_pulse' || a.type === 'ice_shard';
        if (!passesWalls && !canMoveTo(nr, nc)) {
            enemyProjectiles.splice(i, 1);
            continue;
        }

        a.row = nr;
        a.col = nc;

        // Bone Wall upgrade: skeleton barriers block enemy projectiles
        if (typeof skeletonState !== 'undefined' && skeletonState.boneWalls && skeletonState.boneWalls.length > 0) {
            let blocked = false;
            for (const bw of skeletonState.boneWalls) {
                const bdr = a.row - bw.row, bdc = a.col - bw.col;
                if (Math.sqrt(bdr * bdr + bdc * bdc) < bw.radius) {
                    enemyProjectiles.splice(i, 1);
                    spawnParticle(a.row, a.col, (Math.random()-0.5)*3, -2, 0.3, '#ccaa66', 0.7);
                    blocked = true;
                    break;
                }
            }
            if (blocked) continue;
        }

        // Hit player
        if (!player.dodging && playerInvTimer <= 0) {
            const pdr = player.row - a.row;
            const pdc = player.col - a.col;
            if (Math.sqrt(pdr * pdr + pdc * pdc) < HITBOX_RADIUS + 0.15) {
                sfxArrowHit();
                const dmgSource = a.type === 'bone_cage' ? 'bone_colossus'
                    : a.type === 'ice_shard' ? 'frost_wyrm'
                    : a.type === 'void_pulse' ? 'ruined_king'
                    : a.type === 'frost_arrow' ? 'frost_archer'
                    : a.type === 'bone_aoe_proj' ? 'bone_mage'
                    : 'skelarch';
                damagePlayer(a.damage, dmgSource);
                // Frost arrow slow: apply movement slow to player on hit
                if (a.type === 'frost_arrow') {
                    player.slowTimer = Math.max(player.slowTimer || 0, a.slowDuration || 2.0);
                    player.slowMult = 0.7; // 30% movement slow
                    // Ice particle burst on player
                    for (let fp = 0; fp < 4; fp++) {
                        spawnParticle(player.row, player.col,
                            (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3 - 1,
                            0.3, '#88ccff', 0.7);
                    }
                }
                enemyProjectiles.splice(i, 1);
                continue;
            }
        }

        const mapBound = floorMap.length;
        if (a.life <= 0 || a.row < -1 || a.row > mapBound + 1 || a.col < -1 || a.col > mapBound + 1) {
            enemyProjectiles.splice(i, 1);
        }
    }
}

// ----- UPDATE GROUND HAZARDS (fire pools, bone mage AoE) -----
function updateGroundHazards(dt) {
    for (let i = groundHazards.length - 1; i >= 0; i--) {
        const h = groundHazards[i];
        h.life -= dt;
        if (h.life <= 0) {
            groundHazards.splice(i, 1);
            continue;
        }

        if (h.type === 'fire_pool' || h.type === 'lava_vent' || h.type === 'void_fissure') {
            // Damage player if standing in hazard
            const pdr = player.row - h.row;
            const pdc = player.col - h.col;
            if (Math.sqrt(pdr * pdr + pdc * pdc) < h.radius + HITBOX_RADIUS) {
                h.tickTimer -= dt;
                if (h.tickTimer <= 0) {
                    h.tickTimer = 1.0;
                    damagePlayer(h.damage, h.type);
                }
            }
            // Environmental hazards also damage enemies
            if (h.damagesEnemies) {
                if (!h._enemyTickTimer) h._enemyTickTimer = 0;
                h._enemyTickTimer -= dt;
                if (h._enemyTickTimer <= 0) {
                    h._enemyTickTimer = 1.0;
                    for (const e of enemies) {
                        if (e.state === 'death') continue;
                        const edr = e.row - h.row, edc = e.col - h.col;
                        if (Math.sqrt(edr * edr + edc * edc) < h.radius + (e.def.hitboxR || 0.4)) {
                            if (typeof applyEnemyHit === 'function') {
                                applyEnemyHit(e, h.damage, { skipHurtState: true, skipSFX: true });
                            }
                        }
                    }
                }
            }
            // Ambient particles (color varies by type)
            const hazColor = h.type === 'void_fissure' ? '#9944dd' : h.type === 'lava_vent' ? '#ff4400' : '#ff6622';
            if (Math.random() < 0.3 * GFX.particleMul) {
                const pAngle = Math.random() * Math.PI * 2;
                const pDist = Math.random() * h.radius * 0.6;
                spawnParticle(
                    h.row + Math.cos(pAngle) * pDist,
                    h.col + Math.sin(pAngle) * pDist,
                    (Math.random() - 0.5) * 0.5, -1 - Math.random(),
                    0.3, hazColor, 0.5
                );
            }
        }

        // Ice patch — slows everything that crosses it (player and enemies)
        if (h.type === 'ice_patch') {
            // Slow player
            const ipdr = player.row - h.row, ipdc = player.col - h.col;
            if (Math.sqrt(ipdr * ipdr + ipdc * ipdc) < h.radius + HITBOX_RADIUS) {
                player.slowTimer = Math.max(player.slowTimer || 0, 0.3);
            }
            // Slow enemies
            for (const e of enemies) {
                if (e.state === 'death') continue;
                const edr = e.row - h.row, edc = e.col - h.col;
                if (Math.sqrt(edr * edr + edc * edc) < h.radius + (e.def.hitboxR || 0.4)) {
                    e.slowTimer = Math.max(e.slowTimer || 0, 0.3);
                }
            }
        }

        if (h.type === 'bone_aoe_warning') {
            // Warning phase: show red/orange circle, then detonate
            h.tickTimer -= dt;
            if (h.tickTimer <= 0) {
                // Detonate: damage player if in radius
                const pdr = player.row - h.row;
                const pdc = player.col - h.col;
                if (Math.sqrt(pdr * pdr + pdc * pdc) < h.radius) {
                    damagePlayer(h.damage, 'bone_mage');
                }
                // Explosion particles
                for (let ep = 0; ep < 10; ep++) {
                    const angle = (ep / 10) * Math.PI * 2;
                    spawnParticle(h.row + Math.cos(angle) * h.radius * 0.5,
                        h.col + Math.sin(angle) * h.radius * 0.5,
                        Math.cos(angle) * 3, Math.sin(angle) * 3,
                        0.4, '#ffaa44', 0.9);
                }
                addScreenShake(3, 0.15);
                groundHazards.splice(i, 1);
                continue;
            }
        }
    }
}

// ----- ENVIRONMENTAL HAZARD SPAWNING (zone-specific, during combat) -----
function spawnEnvironmentHazards(dt) {
    if (wave.phase !== 'fighting') return;
    _envHazardTimer -= dt;
    if (_envHazardTimer > 0) return;
    _envHazardTimer = 8 + Math.random() * 6; // every 8-14 seconds

    const ms = floorMap.length;
    // Find a random walkable floor tile near player
    let attempts = 20;
    let hr = 0, hc = 0;
    while (attempts-- > 0) {
        hr = Math.floor(player.row + (Math.random() - 0.5) * 10);
        hc = Math.floor(player.col + (Math.random() - 0.5) * 10);
        if (hr >= 0 && hr < ms && hc >= 0 && hc < ms && floorMap[hr][hc] && !blocked[hr][hc]) break;
    }
    if (attempts <= 0) return;

    // Determine hazard type by zone (or procedural depth theme)
    const _isProcedural = currentZone >= 100;
    const _depth = _isProcedural ? (typeof abyssDepthFlags !== 'undefined' ? abyssDepthFlags.depth : currentZone - 99) : 0;
    const _isLavaZone = currentZone === 4 || (_isProcedural && _depth % 4 === 1);
    const _isIceZone = currentZone === 5 || (_isProcedural && _depth % 4 === 3);
    const _isVoidZone = currentZone === 6 || (_isProcedural && _depth % 4 === 0 && _depth > 4);

    if (_isLavaZone) {
        groundHazards.push({
            type: 'lava_vent', row: hr + 0.5, col: hc + 0.5,
            radius: 1.2, damage: 8 + (_isProcedural ? _depth : 0), life: 5.0, maxLife: 5.0,
            tickTimer: 0, damagesEnemies: true,
        });
        addScreenShake(2, 0.1);
    } else if (_isIceZone) {
        groundHazards.push({
            type: 'ice_patch', row: hr + 0.5, col: hc + 0.5,
            radius: 1.5, damage: 0, life: 8.0, maxLife: 8.0,
            tickTimer: 0, damagesEnemies: false,
        });
    } else if (_isVoidZone) {
        groundHazards.push({
            type: 'void_fissure', row: hr + 0.5, col: hc + 0.5,
            radius: 1.0, damage: 10 + (_isProcedural ? _depth : 0), life: 4.0, maxLife: 4.0,
            tickTimer: 0, damagesEnemies: true,
        });
    }
}

// ----- DRAW GROUND HAZARDS -----
function drawGroundHazards() {
    for (const h of groundHazards) {
        const pos = tileToScreen(h.row, h.col);
        const sx = pos.x + cameraX;
        const sy = pos.y + cameraY;

        if (h.type === 'fire_pool') {
            // Pulsing fire pool on ground
            const pulse = 0.4 + Math.sin(performance.now() / 200) * 0.15;
            const fadeAlpha = Math.min(1, h.life / 0.5); // fade out in last 0.5s
            ctx.save();
            ctx.globalAlpha = pulse * fadeAlpha;
            ctx.globalCompositeOperation = 'screen';
            const r = h.radius * DIAMOND_W * 0.8;
            const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
            grad.addColorStop(0, 'rgba(255, 100, 30, 0.6)');
            grad.addColorStop(0.5, 'rgba(255, 60, 10, 0.3)');
            grad.addColorStop(1, 'rgba(200, 40, 0, 0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.ellipse(sx, sy, r, r * 0.5, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        if (h.type === 'bone_aoe_warning') {
            // Growing warning circle that fills up before detonation
            const progress = 1 - (h.tickTimer / (h.maxLife || 1.5));
            const fadeAlpha = 0.3 + progress * 0.4; // brightens as it approaches detonation
            ctx.save();
            ctx.globalAlpha = fadeAlpha;
            const r = h.radius * DIAMOND_W * 0.8;
            // Outer warning ring
            ctx.strokeStyle = 'rgba(255, 80, 20, ' + (0.5 + progress * 0.5) + ')';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.ellipse(sx, sy, r, r * 0.5, 0, 0, Math.PI * 2);
            ctx.stroke();
            // Fill — grows with progress
            const fillR = r * progress;
            const fillGrad = ctx.createRadialGradient(sx, sy, 0, sx, sy, fillR || 1);
            fillGrad.addColorStop(0, 'rgba(255, 120, 40, 0.4)');
            fillGrad.addColorStop(1, 'rgba(255, 60, 20, 0.1)');
            ctx.fillStyle = fillGrad;
            ctx.beginPath();
            ctx.ellipse(sx, sy, fillR, fillR * 0.5, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        if (h.type === 'lava_vent') {
            const pulse = 0.5 + Math.sin(performance.now() / 150) * 0.2;
            const fadeAlpha = Math.min(1, h.life / 0.5);
            ctx.save();
            ctx.globalAlpha = pulse * fadeAlpha;
            ctx.globalCompositeOperation = 'screen';
            const r = h.radius * DIAMOND_W * 0.8;
            const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
            grad.addColorStop(0, 'rgba(255, 80, 0, 0.7)');
            grad.addColorStop(0.4, 'rgba(255, 40, 0, 0.4)');
            grad.addColorStop(1, 'rgba(180, 20, 0, 0)');
            ctx.fillStyle = grad;
            ctx.beginPath(); ctx.ellipse(sx, sy, r, r * 0.5, 0, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
        }

        if (h.type === 'ice_patch') {
            const fadeAlpha = Math.min(1, h.life / 0.5);
            ctx.save();
            ctx.globalAlpha = 0.25 * fadeAlpha;
            ctx.globalCompositeOperation = 'screen';
            const r = h.radius * DIAMOND_W * 0.8;
            const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
            grad.addColorStop(0, 'rgba(100, 180, 255, 0.5)');
            grad.addColorStop(0.6, 'rgba(80, 140, 220, 0.2)');
            grad.addColorStop(1, 'rgba(60, 100, 180, 0)');
            ctx.fillStyle = grad;
            ctx.beginPath(); ctx.ellipse(sx, sy, r, r * 0.5, 0, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
        }

        if (h.type === 'void_fissure') {
            const pulse = 0.4 + Math.sin(performance.now() / 250) * 0.25;
            const fadeAlpha = Math.min(1, h.life / 0.5);
            ctx.save();
            ctx.globalAlpha = pulse * fadeAlpha;
            ctx.globalCompositeOperation = 'screen';
            const r = h.radius * DIAMOND_W * 0.8;
            const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
            grad.addColorStop(0, 'rgba(140, 40, 220, 0.6)');
            grad.addColorStop(0.5, 'rgba(100, 20, 180, 0.3)');
            grad.addColorStop(1, 'rgba(60, 10, 120, 0)');
            ctx.fillStyle = grad;
            ctx.beginPath(); ctx.ellipse(sx, sy, r, r * 0.5, 0, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
        }
    }
}

// ----- DRAW SINGLE ENEMY -----
function drawEnemy(e) {
    // Pit Lurker: don't render while hidden (ambush)
    if (e._ambushHidden) return;

    const def = e.def;
    const prefix = def.prefix;
    let sheetKey, frameCount;

    switch (e.state) {
        case 'attack':
            sheetKey = 'enemy_' + prefix + '_attack'; frameCount = def.frames.attack; break;
        case 'walk':
            sheetKey = 'enemy_' + prefix + '_walk'; frameCount = def.frames.walk; break;
        case 'hurt':
            sheetKey = 'enemy_' + prefix + '_hurt'; frameCount = def.frames.hurt; break;
        case 'death':
            sheetKey = 'enemy_' + prefix + '_death'; frameCount = def.frames.death; break;
        default:
            sheetKey = 'enemy_' + prefix + '_idle'; frameCount = def.frames.idle; break;
    }

    const sheet = images[sheetKey];
    if (!sheet) return;

    const frame = Math.min(frameCount - 1, Math.floor(e.animFrame) % frameCount);
    const pos = tileToScreen(e.row, e.col);
    const sx = pos.x + cameraX;
    const sy = pos.y + cameraY;
    const dw = WIZARD_FRAME_W * def.scale;
    const dh = WIZARD_FRAME_H * def.scale;
    const drawY = sy - dh * def.yOff;

    // Calculate spawn fade effect
    const spawnAlpha = e.spawnFade > 0 ? Math.max(0, 1 - (e.spawnFade / 0.5)) : 1;
    const spawnScale = e.spawnFade > 0 ? 0.5 + 0.5 * (1 - (e.spawnFade / 0.5)) : 1;

    // Spawn telegraph — pulsing glow ring while enemy materializes
    if (e.spawnFade > 0.1 && typeof ctx !== 'undefined') {
        ctx.save();
        const fadeT = e.spawnFade / 0.5; // 1→0
        const ringR = 18 + fadeT * 12; // shrinks as spawn completes
        const ringAlpha = fadeT * 0.35;
        const eliteColor = e.elite ? (COLORS['ELITE_' + e.elite.toUpperCase() + '_TINT'] || '#ff8844') : '#cc8844';
        ctx.globalAlpha = ringAlpha;
        ctx.strokeStyle = eliteColor;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(sx, sy + 2, ringR, ringR * 0.45, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }

    // Shadow — soft blob shadow (bigger for bosses, tinted during enrage)
    ctx.save();
    const shadowAlpha = (e.state === 'death' ? 0.08 : 0.3) * spawnAlpha;
    const shadowRx = e.def.isBoss ? Math.min(36, 16 * def.scale * 0.5) : Math.max(10, 12 * def.scale);
    const shadowRy = e.def.isBoss ? Math.min(16, 7 * def.scale * 0.5) : Math.max(4, 5 * def.scale);
    // Phase-tinted shadows for bosses (red glow bleeds into shadow)
    if (e.def.isBoss && e.bossPhase >= 1) {
        const shadowGrad = ctx.createRadialGradient(sx, sy + 4, 0, sx, sy + 4, shadowRx);
        shadowGrad.addColorStop(0, e.bossPhase >= 2 ? 'rgba(120, 30, 60, 0.35)' : 'rgba(80, 20, 10, 0.3)');
        shadowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.globalAlpha = shadowAlpha * 1.4;
        ctx.fillStyle = shadowGrad;
    } else {
        ctx.globalAlpha = shadowAlpha;
        ctx.fillStyle = '#000';
    }
    ctx.beginPath();
    ctx.ellipse(sx, sy + 4, shadowRx, shadowRy, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Readability ground glow for non-elite/non-boss enemies (ensures visibility near darkness edge)
    if (!e.def.isBoss && !e.elite && e.state !== 'death' && spawnAlpha > 0.5) {
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = 0.12 * spawnAlpha;
        const _egR = Math.max(12, 10 * def.scale);
        const _egGrad = ctx.createRadialGradient(sx, sy + 2, 0, sx, sy + 2, _egR);
        _egGrad.addColorStop(0, 'rgba(255, 200, 140, 0.5)');
        _egGrad.addColorStop(1, 'rgba(255, 200, 140, 0)');
        ctx.fillStyle = _egGrad;
        ctx.beginPath();
        ctx.ellipse(sx, sy + 2, _egR, _egR * 0.45, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    // Boss glow aura — intensifies per phase (visual transformation)
    if (e.def.isBoss && e.state !== 'death') {
        ctx.save();
        // Phase 0: warm gold, Phase 1: angry red-orange, Phase 2: intense crimson-white
        const bossGlowColor = e.bossPhase >= 2 ? 'rgba(255, 80, 80, '
            : e.bossPhase === 1 ? 'rgba(255, 60, 30, '
            : 'rgba(255, 200, 80, ';
        // Pulse faster at higher phases
        const pulseSpeed = e.bossPhase >= 2 ? 180 : e.bossPhase === 1 ? 250 : 350;
        const pulseBase = e.bossPhase >= 2 ? 0.32 : e.bossPhase === 1 ? 0.26 : 0.20;
        const pulseRange = e.bossPhase >= 2 ? 0.15 : 0.10;
        const bossGlowPulse = pulseBase + Math.sin(performance.now() / pulseSpeed) * pulseRange;
        ctx.globalAlpha = bossGlowPulse * spawnAlpha;
        ctx.globalCompositeOperation = 'screen';
        const glowCY = drawY + dh * 0.5;
        const glowRadius = dw * (e.bossPhase >= 2 ? 0.9 : e.bossPhase === 1 ? 0.8 : 0.7);
        const glowGrad = ctx.createRadialGradient(sx, glowCY, 0, sx, glowCY, glowRadius);
        glowGrad.addColorStop(0, bossGlowColor + (e.bossPhase >= 2 ? '0.6)' : '0.4)'));
        glowGrad.addColorStop(1, bossGlowColor + '0)');
        ctx.fillStyle = glowGrad;
        ctx.beginPath();
        ctx.ellipse(sx, glowCY, dw * 0.7, dh * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
        // Boss ground ring (helps identify boss on dark floors)
        ctx.globalAlpha = (0.3 + Math.sin(performance.now() / 400) * 0.1) * spawnAlpha;
        ctx.strokeStyle = bossGlowColor + '0.6)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(sx, sy + 4, dw * 0.35, dw * 0.15, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }

    // Elite enemy glow aura
    if (e.elite && e.state !== 'death') {
        ctx.save();
        const eliteColors = {
            swift: 'rgba(255, 255, 100, ',
            vampiric: 'rgba(100, 255, 100, ',
            volatile: 'rgba(255, 120, 50, ',
            splitting: 'rgba(180, 100, 255, ',
            shielded: 'rgba(68, 136, 255, ',
            thorned: 'rgba(255, 68, 68, ',
            frenzy: 'rgba(255, 34, 0, ',
            necromancer: 'rgba(68, 255, 68, ',
        };
        const eliteColor = eliteColors[e.elite] || 'rgba(255, 255, 255, ';
        const elitePulse = 0.12 + Math.sin(performance.now() / 250) * 0.06;
        ctx.globalAlpha = elitePulse * spawnAlpha;
        ctx.globalCompositeOperation = 'screen';
        const eliteGrad = ctx.createRadialGradient(sx, sy - dh * 0.3, 0, sx, sy - dh * 0.3, dw * 0.45);
        eliteGrad.addColorStop(0, eliteColor + '0.35)');
        eliteGrad.addColorStop(1, eliteColor + '0)');
        ctx.fillStyle = eliteGrad;
        ctx.beginPath();
        ctx.ellipse(sx, sy - dh * 0.3, dw * 0.45, dh * 0.4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    // Hurt flash — red tint
    ctx.save();
    if (e.state === 'hurt') {
        ctx.filter = 'brightness(2.5) saturate(2) hue-rotate(-30deg)';
        ctx.globalAlpha = 0.6 + Math.sin(e.hurtTimer * 30) * 0.4;
    }
    if (e.state === 'death') {
        // Fade out only in last 1 second of linger
        const fadeStart = 1.0;
        ctx.globalAlpha = e.deathTimer > fadeStart ? 0.85 : Math.max(0.1, (e.deathTimer / fadeStart) * 0.85);
    }
    // Apply spawn fade alpha multiplier
    ctx.globalAlpha *= spawnAlpha;
    // Boss split phase — reduce alpha while split copies are active
    if (e._splitActive && e._splitAlpha !== undefined) ctx.globalAlpha *= e._splitAlpha;

    let scaledDW = dw * spawnScale;
    let scaledDH = dh * spawnScale;

    // Death squash-and-stretch — sprite deflates before burst
    if (e.state === 'death' && e._deathSquash > 0) {
        const _sqDt = typeof _frameDt !== 'undefined' ? _frameDt : 1/60;
        e._deathSquash = Math.max(0, e._deathSquash - _sqDt * 4); // drain over 0.25s
        const sq = e._deathSquash;
        scaledDW *= 1 + (1 - sq) * 0.3;  // stretch wider
        scaledDH *= sq * 0.7 + 0.3;      // squash flatter (1.0→0.3)
    }

    // Stagger wobble offset during hit flash (decays with flash timer)
    let staggerX = 0, staggerY = 0;
    if (e.hitFlashTimer > 0 && e._staggerOffX !== undefined) {
        const wobble = Math.min(1, e.hitFlashTimer / 0.08);
        staggerX = (e._staggerOffX || 0) * wobble;
        staggerY = (e._staggerOffY || 0) * wobble;
    } else {
        e._staggerOffX = 0;
        e._staggerOffY = 0;
    }

    if (e.facing === -1) {
        ctx.translate(sx + staggerX, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(sheet,
            frame * WIZARD_FRAME_W, 0, WIZARD_FRAME_W, WIZARD_FRAME_H,
            -scaledDW / 2, drawY - (scaledDH - dh) / 2 + staggerY, scaledDW, scaledDH);
    } else {
        ctx.drawImage(sheet,
            frame * WIZARD_FRAME_W, 0, WIZARD_FRAME_W, WIZARD_FRAME_H,
            sx - scaledDW / 2 + staggerX, drawY - (scaledDH - dh) / 2 + staggerY, scaledDW, scaledDH);
    }
    ctx.restore();

    // === COMBAT JUICE: Death flash — solid white frame on killing blow ===
    if (e._deathFlashTimer > 0 && e.state === 'death') {
        ctx.save();
        ctx.globalAlpha = Math.min(1, e._deathFlashTimer / 0.04) * 0.85 * spawnAlpha;
        ctx.globalCompositeOperation = 'lighter';
        ctx.filter = 'brightness(5) saturate(0)';
        if (e.facing === -1) {
            ctx.translate(sx, 0);
            ctx.scale(-1, 1);
            ctx.drawImage(sheet,
                frame * WIZARD_FRAME_W, 0, WIZARD_FRAME_W, WIZARD_FRAME_H,
                -scaledDW / 2, drawY - (scaledDH - dh) / 2, scaledDW, scaledDH);
        } else {
            ctx.drawImage(sheet,
                frame * WIZARD_FRAME_W, 0, WIZARD_FRAME_W, WIZARD_FRAME_H,
                sx - scaledDW / 2, drawY - (scaledDH - dh) / 2, scaledDW, scaledDH);
        }
        ctx.restore();
    }

    // === HIT FLASH — brief white overlay on any damage (independent of stagger) ===
    if (e.hitFlashTimer > 0 && e.state !== 'death') {
        ctx.save();
        const flashIntensity = Math.min(1, e.hitFlashTimer / 0.08); // peaks fast, fades out
        ctx.globalAlpha = flashIntensity * 0.7 * spawnAlpha;
        ctx.globalCompositeOperation = 'lighter'; // additive blend = bright white flash
        ctx.filter = 'brightness(3) saturate(0)'; // desaturate + overbrighten = white glow
        if (e.facing === -1) {
            ctx.translate(sx, 0);
            ctx.scale(-1, 1);
            ctx.drawImage(sheet,
                frame * WIZARD_FRAME_W, 0, WIZARD_FRAME_W, WIZARD_FRAME_H,
                -scaledDW / 2, drawY - (scaledDH - dh) / 2, scaledDW, scaledDH);
        } else {
            ctx.drawImage(sheet,
                frame * WIZARD_FRAME_W, 0, WIZARD_FRAME_W, WIZARD_FRAME_H,
                sx - scaledDW / 2, drawY - (scaledDH - dh) / 2, scaledDW, scaledDH);
        }
        ctx.restore();
    }

    // === ENEMY OUTLINE — dark edge for silhouette definition ===
    if (e.state !== 'death' && spawnAlpha > 0.5) {
        ctx.save();
        ctx.globalAlpha = 0.25 * spawnAlpha;
        ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
        ctx.shadowBlur = 4;
        const eDY = drawY - (scaledDH - dh) / 2;
        if (e.facing === -1) {
            ctx.translate(sx, 0);
            ctx.scale(-1, 1);
            ctx.drawImage(sheet,
                frame * WIZARD_FRAME_W, 0, WIZARD_FRAME_W, WIZARD_FRAME_H,
                -scaledDW / 2 - 1, eDY - 1, scaledDW + 2, scaledDH + 2);
        } else {
            ctx.drawImage(sheet,
                frame * WIZARD_FRAME_W, 0, WIZARD_FRAME_W, WIZARD_FRAME_H,
                sx - scaledDW / 2 - 1, eDY - 1, scaledDW + 2, scaledDH + 2);
        }
        ctx.restore();
    }

    // (Removed: old thin health bar — superseded by gradient health bar below)

    // --- Ranged attack telegraph — bright pre-fire warning glow ---
    // Shows during wind-up (before attackFired) so player can react
    if (e.state === 'attack' && e.def.ai === 'ranged' && !e.attackFired) {
        const windUpFrac = 1 - (e.attackTimer / e.def.attackDur); // 0→1 during wind-up
        const telegraphAlpha = windUpFrac * 0.8; // ramps up to fire moment
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = telegraphAlpha * spawnAlpha;
        // Weapon glow at hand position
        const handX = sx + (e.facing === -1 ? -12 : 12);
        const handY = drawY + dh * 0.35;
        const telegraphR = 12 + windUpFrac * 6;
        const tGrad = ctx.createRadialGradient(handX, handY, 0, handX, handY, telegraphR);
        tGrad.addColorStop(0, 'rgba(255, 220, 120, 0.9)');
        tGrad.addColorStop(0.4, 'rgba(255, 160, 60, 0.5)');
        tGrad.addColorStop(1, 'rgba(255, 100, 20, 0)');
        ctx.fillStyle = tGrad;
        ctx.fillRect(handX - telegraphR, handY - telegraphR, telegraphR * 2, telegraphR * 2);
        // Directional aim line toward player (faint)
        if (windUpFrac > 0.3) {
            const aimAlpha = (windUpFrac - 0.3) * 0.4;
            ctx.globalAlpha = aimAlpha * spawnAlpha;
            ctx.strokeStyle = 'rgba(255, 200, 100, 0.6)';
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 6]);
            const pPos = tileToScreen(player.row, player.col);
            const ppx = pPos.x + cameraX;
            const ppy = pPos.y + cameraY;
            const aimDx = ppx - handX;
            const aimDy = ppy - handY;
            const aimLen = Math.sqrt(aimDx * aimDx + aimDy * aimDy) || 1;
            const lineLen = Math.min(aimLen, 60);
            ctx.beginPath();
            ctx.moveTo(handX, handY);
            ctx.lineTo(handX + (aimDx / aimLen) * lineLen, handY + (aimDy / aimLen) * lineLen);
            ctx.stroke();
            ctx.setLineDash([]);
        }
        ctx.restore();
    }

    // --- Corpse interaction glow (always visible, brighter when close) ---
    if (e.state === 'death' && e.deathTimer > 0.5) {
        const pDist = Math.sqrt((e.row - player.row) ** 2 + (e.col - player.col) ** 2);
        const t = performance.now() / 1000;
        const corpPulse = 0.25 + Math.sin(t * 3) * 0.15;
        const _cf = FormSystem.currentForm;
        const corpCol = _cf === 'slime' ? 'rgba(80, 220, 100,' :
                       _cf === 'skeleton' ? 'rgba(200, 190, 150,' :
                       _cf === 'lich' ? 'rgba(160, 90, 220,' :
                       'rgba(100, 140, 200,';
        // Subtle glow always visible, strong pulse when close
        const nearMult = pDist < 2.5 ? 1.0 : (pDist < 5.0 ? 0.4 : 0.2);
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = corpPulse * nearMult * Math.min(1, (e.deathTimer - 0.5) / 0.5);
        const glowR = pDist < 2.5 ? 28 : 18;
        const corpGrad = ctx.createRadialGradient(sx, sy, 0, sx, sy, glowR);
        corpGrad.addColorStop(0, corpCol + ' 0.6)');
        corpGrad.addColorStop(0.5, corpCol + ' 0.2)');
        corpGrad.addColorStop(1, corpCol + ' 0)');
        ctx.fillStyle = corpGrad;
        ctx.beginPath();
        ctx.ellipse(sx, sy + 2, glowR, glowR * 0.45, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    // --- Shield stance glow (Armored Skeleton) ---
    if (e.isShielding) {
        ctx.save();
        const shieldPulse = 0.5 + 0.3 * Math.sin(e.shieldTimer * 6);
        ctx.globalAlpha = shieldPulse * (1 - e.spawnFade);
        ctx.strokeStyle = '#66aaff';
        ctx.lineWidth = 2;
        ctx.shadowColor = '#4488ff';
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(sx, sy - dh * 0.4, dw * 0.45, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }

    // HP bar above enemy (only when damaged and alive)
    if (e.state !== 'death' && e.hp < e.maxHp) {
        const barW = e.def.isBoss ? 44 : 34;
        const barH = e.def.isBoss ? 5 : 4;
        const bx = sx - barW / 2;
        const by = drawY - 8;
        const hpFrac = e.hp / e.maxHp;
        const fillW = Math.max(1, barW * hpFrac);

        ctx.save();

        // Dark track
        ctx.globalAlpha = 0.75;
        ctx.fillStyle = '#0a0404';
        ctx.beginPath();
        ctx.roundRect(bx, by, barW, barH, 2);
        ctx.fill();

        // Gradient fill — smooth color ramp based on HP percentage
        ctx.globalAlpha = 0.9;
        const hpGrad = ctx.createLinearGradient(bx, by, bx, by + barH);
        if (hpFrac > 0.5) {
            hpGrad.addColorStop(0, '#ee4444');
            hpGrad.addColorStop(1, '#aa2222');
        } else if (hpFrac > 0.25) {
            hpGrad.addColorStop(0, '#ee7733');
            hpGrad.addColorStop(1, '#aa4400');
        } else {
            hpGrad.addColorStop(0, '#ee2222');
            hpGrad.addColorStop(1, '#880000');
        }
        ctx.fillStyle = hpGrad;
        ctx.beginPath();
        ctx.roundRect(bx, by, fillW, barH, 2);
        ctx.fill();

        // Highlight stripe (tiny catch light)
        ctx.globalAlpha = 0.2;
        ctx.fillStyle = '#fff';
        ctx.fillRect(bx + 1, by, Math.max(1, fillW - 2), 1);

        // Border
        ctx.globalAlpha = 0.3;
        ctx.strokeStyle = '#442222';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.roundRect(bx, by, barW, barH, 2);
        ctx.stroke();

        ctx.restore();
    }
}

// ----- DRAW FIRE TRAILS -----
function drawFireTrails() {
    for (const e of enemies) {
        if (!e.fireTrails || e.fireTrails.length === 0) continue;
        for (const ft of e.fireTrails) {
            const pos = tileToScreen(ft.row, ft.col);
            const px = pos.x + cameraX;
            const py = pos.y + cameraY;
            const alpha = Math.min(0.7, ft.life / 2.0);
            // Pulsing fire circle on ground
            const pulse = 1.0 + Math.sin(performance.now() * 0.008 + ft.row * 3) * 0.15;
            const radius = 14 * pulse;
            ctx.save();
            ctx.globalAlpha = alpha;
            const grad = ctx.createRadialGradient(px, py, 0, px, py, radius);
            grad.addColorStop(0, '#ff6622');
            grad.addColorStop(0.5, '#ff4400');
            grad.addColorStop(1, 'rgba(255,68,0,0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(px, py, radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }
}

// ----- DRAW BOSS TELEGRAPHS — ground warning indicators -----
// Helper: convert hex color '#rrggbb' to 'r, g, b' string for rgba()
function _hexToRgb(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return r + ',' + g + ',' + b;
}

function drawBossTelegraphs() {
    for (const e of enemies) {
        if (!e.def.isBoss || !e._telegraphing) continue;

        const progress = 1.0 - (e._telegraphTimer / e._telegraphDuration); // 0 -> 1
        const sizeFrac = 0.5 + progress * 0.5; // grows from 50% to 100%
        const pulse = 0.4 + Math.sin(performance.now() * 0.012) * 0.15; // pulsing alpha
        const alpha = Math.min(0.6, pulse + progress * 0.2);
        const rgb = _hexToRgb(e._telegraphColor);

        if (e._telegraphType === 'circle') {
            // Red pulsing circle at boss position (slam)
            const pos = tileToScreen(e._telegraphRow, e._telegraphCol);
            const px = pos.x + cameraX;
            const py = pos.y + cameraY;
            // Convert tile radius to approximate screen pixels (isometric ellipse)
            const screenRX = e._telegraphRadius * HALF_DW * sizeFrac;
            const screenRY = e._telegraphRadius * HALF_DH * sizeFrac;

            ctx.save();
            ctx.globalAlpha = alpha;
            // Filled warning zone
            const grad = ctx.createRadialGradient(px, py, 0, px, py, Math.max(screenRX, screenRY));
            grad.addColorStop(0, 'rgba(' + rgb + ',0.25)');
            grad.addColorStop(0.7, 'rgba(' + rgb + ',0.12)');
            grad.addColorStop(1, 'rgba(' + rgb + ',0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.ellipse(px, py, screenRX, screenRY, 0, 0, Math.PI * 2);
            ctx.fill();
            // Outer ring
            ctx.strokeStyle = e._telegraphColor;
            ctx.lineWidth = 2 + progress * 2;
            ctx.globalAlpha = alpha * 1.2;
            ctx.beginPath();
            ctx.ellipse(px, py, screenRX, screenRY, 0, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();

        } else if (e._telegraphType === 'arc') {
            // Orange arc indicator (flame sweep)
            const pos = tileToScreen(e._telegraphRow, e._telegraphCol);
            const px = pos.x + cameraX;
            const py = pos.y + cameraY;
            const centerAngle = e._telegraphAngle;
            const span = e._telegraphSpan;

            ctx.save();
            ctx.globalAlpha = alpha;
            // Filled arc wedge
            ctx.fillStyle = 'rgba(' + rgb + ',0.2)';
            ctx.beginPath();
            ctx.moveTo(px, py);
            // Draw arc outline using line segments (isometric approx)
            const steps = 16;
            for (let i = 0; i <= steps; i++) {
                const a = centerAngle - span + (i / steps) * span * 2;
                const tileR = e._telegraphRadius * sizeFrac;
                const tr = e._telegraphRow + Math.cos(a) * tileR;
                const tc = e._telegraphCol + Math.sin(a) * tileR;
                const ep = tileToScreen(tr, tc);
                if (i === 0) ctx.moveTo(ep.x + cameraX, ep.y + cameraY);
                ctx.lineTo(ep.x + cameraX, ep.y + cameraY);
            }
            ctx.lineTo(px, py);
            ctx.closePath();
            ctx.fill();
            // Arc edge stroke
            ctx.strokeStyle = e._telegraphColor;
            ctx.lineWidth = 2 + progress * 2;
            ctx.globalAlpha = alpha * 1.2;
            ctx.stroke();
            ctx.restore();

        } else if (e._telegraphType === 'cone') {
            // Blue cone indicator (ice breath)
            const pos = tileToScreen(e._telegraphRow, e._telegraphCol);
            const px = pos.x + cameraX;
            const py = pos.y + cameraY;
            const centerAngle = e._telegraphAngle;
            const halfAngle = e._telegraphSpan;

            ctx.save();
            ctx.globalAlpha = alpha;
            // Filled cone
            ctx.fillStyle = 'rgba(' + rgb + ',0.18)';
            ctx.beginPath();
            ctx.moveTo(px, py);
            const steps = 16;
            for (let i = 0; i <= steps; i++) {
                const a = centerAngle - halfAngle + (i / steps) * halfAngle * 2;
                const tileR = e._telegraphRadius * sizeFrac;
                const tr = e._telegraphRow + Math.cos(a) * tileR;
                const tc = e._telegraphCol + Math.sin(a) * tileR;
                const ep = tileToScreen(tr, tc);
                ctx.lineTo(ep.x + cameraX, ep.y + cameraY);
            }
            ctx.lineTo(px, py);
            ctx.closePath();
            ctx.fill();
            // Cone edge stroke
            ctx.strokeStyle = e._telegraphColor;
            ctx.lineWidth = 2 + progress * 2;
            ctx.globalAlpha = alpha * 1.2;
            ctx.stroke();
            ctx.restore();
        }

        // Pulsing inner warning particles during telegraph
        if (Math.random() < 0.4) {
            const angle = Math.random() * Math.PI * 2;
            const pDist = Math.random() * e._telegraphRadius * 0.8;
            spawnParticle(
                e._telegraphRow + Math.cos(angle) * pDist,
                e._telegraphCol + Math.sin(angle) * pDist,
                0, -0.5, 0.3, e._telegraphColor, 0.6
            );
        }
    }
}

// ----- DRAW BOSS TELEGRAPH SCREEN-EDGE FLASH -----
function drawBossTelegraphFlash() {
    if (bossTelegraphFlashTimer <= 0) return;
    const alpha = Math.min(0.35, bossTelegraphFlashTimer * 2.5);
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = alpha;
    // Draw a vignette flash around the screen edges
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;
    const edgeSize = 60;
    // Top edge
    const topGrad = ctx.createLinearGradient(0, 0, 0, edgeSize);
    topGrad.addColorStop(0, bossTelegraphFlashColor);
    topGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = topGrad;
    ctx.fillRect(0, 0, w, edgeSize);
    // Bottom edge
    const botGrad = ctx.createLinearGradient(0, h, 0, h - edgeSize);
    botGrad.addColorStop(0, bossTelegraphFlashColor);
    botGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = botGrad;
    ctx.fillRect(0, h - edgeSize, w, edgeSize);
    // Left edge
    const leftGrad = ctx.createLinearGradient(0, 0, edgeSize, 0);
    leftGrad.addColorStop(0, bossTelegraphFlashColor);
    leftGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = leftGrad;
    ctx.fillRect(0, 0, edgeSize, h);
    // Right edge
    const rightGrad = ctx.createLinearGradient(w, 0, w - edgeSize, 0);
    rightGrad.addColorStop(0, bossTelegraphFlashColor);
    rightGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = rightGrad;
    ctx.fillRect(w - edgeSize, 0, edgeSize, h);
    ctx.restore();
}

// ----- DRAW ENEMY ARROWS & PROJECTILES -----
function drawEnemyProjectiles() {
    const arrowImg = images.enemy_skelarch_arrow;
    for (const a of enemyProjectiles) {
        const pos = tileToScreen(a.row, a.col);
        const px = pos.x + cameraX;
        const py = pos.y + cameraY;

        ctx.save();
        ctx.translate(px, py);

        // Type-specific projectile rendering
        if (a.type === 'bone_cage') {
            // Bone shard — orange/brown glowing orb
            ctx.globalAlpha = 0.9;
            const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, a.size || 4);
            grad.addColorStop(0, '#ffcc66');
            grad.addColorStop(1, '#aa7744');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(0, 0, a.size || 4, 0, Math.PI * 2);
            ctx.fill();
        } else if (a.type === 'ice_shard') {
            // Ice crystal — blue diamond shape
            ctx.globalAlpha = 0.85;
            ctx.fillStyle = '#88ccff';
            ctx.strokeStyle = '#44aaff';
            ctx.lineWidth = 1;
            const s = a.size || 5;
            ctx.beginPath();
            ctx.moveTo(0, -s);
            ctx.lineTo(s * 0.6, 0);
            ctx.lineTo(0, s);
            ctx.lineTo(-s * 0.6, 0);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            // Glow
            ctx.globalAlpha = 0.3;
            const glowGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, s * 2);
            glowGrad.addColorStop(0, '#88ccff');
            glowGrad.addColorStop(1, 'rgba(68,170,255,0)');
            ctx.fillStyle = glowGrad;
            ctx.beginPath();
            ctx.arc(0, 0, s * 2, 0, Math.PI * 2);
            ctx.fill();
        } else if (a.type === 'void_pulse') {
            // Dark energy orb — purple glow
            ctx.globalAlpha = 0.9;
            const s = a.size || 5;
            const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, s);
            grad.addColorStop(0, '#cc66ff');
            grad.addColorStop(0.6, '#7722bb');
            grad.addColorStop(1, 'rgba(119,34,187,0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(0, 0, s * 1.5, 0, Math.PI * 2);
            ctx.fill();
        } else {
            // Default: skeleton archer arrow — enhanced for readability
            // 1) Ground glow so projectile pops against dark floors
            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            ctx.globalAlpha = 0.4;
            const arrowGlowR = 18;
            const arrowGlow = ctx.createRadialGradient(0, 4, 0, 0, 4, arrowGlowR);
            arrowGlow.addColorStop(0, 'rgba(255, 200, 100, 0.5)');
            arrowGlow.addColorStop(0.5, 'rgba(255, 140, 50, 0.2)');
            arrowGlow.addColorStop(1, 'rgba(200, 80, 20, 0)');
            ctx.fillStyle = arrowGlow;
            ctx.beginPath();
            ctx.ellipse(0, 4, arrowGlowR, arrowGlowR * 0.45, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            ctx.rotate(a.angle);

            // 2) Bright arrow with high-contrast colors
            if (arrowImg) {
                const s = 0.35;
                ctx.drawImage(arrowImg, -50 * s, -50 * s, 100 * s, 100 * s);
                // Brightness boost overlay
                ctx.save();
                ctx.globalCompositeOperation = 'screen';
                ctx.globalAlpha = 0.5;
                ctx.drawImage(arrowImg, -50 * s, -50 * s, 100 * s, 100 * s);
                ctx.restore();
            } else {
                // Fallback: bright warm arrow shape
                ctx.strokeStyle = '#ffcc66';
                ctx.lineWidth = 2.5;
                ctx.beginPath();
                ctx.moveTo(-10, 0);
                ctx.lineTo(10, 0);
                ctx.stroke();
                ctx.fillStyle = '#ffdd88';
                ctx.beginPath();
                ctx.moveTo(10, 0);
                ctx.lineTo(6, -3);
                ctx.lineTo(6, 3);
                ctx.closePath();
                ctx.fill();
            }

            // 3) Hot tip glow — bright point at arrow tip for tracking
            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            ctx.globalAlpha = 0.7;
            const tipGrad = ctx.createRadialGradient(10, 0, 0, 10, 0, 6);
            tipGrad.addColorStop(0, 'rgba(255, 240, 180, 0.9)');
            tipGrad.addColorStop(0.5, 'rgba(255, 180, 80, 0.4)');
            tipGrad.addColorStop(1, 'rgba(255, 120, 30, 0)');
            ctx.fillStyle = tipGrad;
            ctx.fillRect(4, -6, 12, 12);
            ctx.restore();

            // 4) Short motion trail behind arrow
            ctx.save();
            ctx.globalAlpha = 0.35;
            ctx.strokeStyle = 'rgba(255, 180, 80, 0.6)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(-10, 0);
            ctx.lineTo(-20, 0);
            ctx.stroke();
            ctx.globalAlpha = 0.18;
            ctx.beginPath();
            ctx.moveTo(-20, 0);
            ctx.lineTo(-28, 0);
            ctx.stroke();
            ctx.restore();
        }
        ctx.restore();
    }
}

// ============================================================
