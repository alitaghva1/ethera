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
        prefix: 'slime',  // reuses slime sprites, scaled up + tinted
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
    // --- ZONE 2 BOSS: Bone Colossus ---
    bone_colossus: {
        prefix: 'armoredskel',  // reuses armored skeleton sprites, scaled up
        hp: 400, speed: 1.4, damage: 24, attackRange: 1.5, aggroRange: 12,
        hitboxR: 0.5,
        frames: { idle: 6, walk: 8, attack: 6, hurt: 4, death: 4 },
        animSpeed: 7, attackDur: 0.6, attackCooldown: 1.6,
        scale: 2.5, yOff: 0.75,
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
        prefix: 'armoredskel',  // reuses armored skeleton sprites, scaled + red tint
        hp: 550, speed: 1.8, damage: 28, attackRange: 1.3, aggroRange: 12,
        hitboxR: 0.45,
        frames: { idle: 6, walk: 8, attack: 6, hurt: 4, death: 4 },
        animSpeed: 8, attackDur: 0.55, attackCooldown: 1.4,
        scale: 2.6, yOff: 0.75,
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
        prefix: 'werewolf',  // reuses werewolf sprites, blue tint + ice VFX
        hp: 700, speed: 2.0, damage: 26, attackRange: 6.0, aggroRange: 14,
        hitboxR: 0.5,
        frames: { idle: 6, walk: 8, attack: 6, hurt: 4, death: 4 },
        animSpeed: 7, attackDur: 0.6, attackCooldown: 2.0,
        scale: 2.8, yOff: 0.75,
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
        prefix: 'skel',  // reuses skeleton sprites, massive scale + dark purple VFX
        hp: 1000, speed: 2.2, damage: 32, attackRange: 1.5, aggroRange: 16,
        hitboxR: 0.5,
        frames: { idle: 6, walk: 8, attack: 6, hurt: 4, death: 4 },
        animSpeed: 9, attackDur: 0.5, attackCooldown: 1.2,
        scale: 3.0, yOff: 0.75,
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
};

const FIREBALL_DAMAGE = COMBAT.fireballDmg;
const ENEMY_KNOCKBACK = COMBAT.knockback;
// Knockback multipliers by context
const KNOCKBACK_MULT = { normal: 1.0, explode: 1.6, tower: 0.5, chain: 0.3, orbit: 0.7 };
const PLAYER_INV_TIME = 0.8;  // invincibility frames after getting hit
let playerInvTimer = 0;
let multiKillTimer = 0;
let multiKillCount = 0;

// ----- DEATH RECAP SYSTEM -----
let deathCause = '';  // What killed the player (enemy type or damage source)
let deathRecapTimer = 0;

// ----- UPGRADE PITY SYSTEM -----
let recentlyOffered = new Set();  // Tracks which upgrades were recently offered
const PITY_POOL_SIZE = 9;  // Clear pool when it reaches this size (allows rotation back in)

// ----- ENEMY ARRAY -----
const enemies = [];

// ----- ENEMY PROJECTILES (skeleton archer arrows) -----
const enemyProjectiles = [];

// ----- PARTICLE SYSTEM -----
const particles = [];
const MAX_PARTICLES = 200;
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
        ROOM_BOUNDS.push({ name: 'Cell', r1: 2, r2: 5, c1: 2, c2: 6, tint: '#1a1a3a' });           // cold blue
        ROOM_BOUNDS.push({ name: 'Corridor1', r1: 7, r2: 9, c1: 3, c2: 6, tint: '#2a2a2a' });      // neutral
        ROOM_BOUNDS.push({ name: 'GuardHall', r1: 10, r2: 16, c1: 1, c2: 8, tint: '#3a2a1a' });    // warm orange
        ROOM_BOUNDS.push({ name: 'Corridor2', r1: 11, r2: 14, c1: 10, c2: 11, tint: '#2a2a2a' });  // neutral
        ROOM_BOUNDS.push({ name: 'GreatHall', r1: 8, r2: 20, c1: 12, c2: 21, tint: '#2a2a2a' });   // neutral
        ROOM_BOUNDS.push({ name: 'Alcove', r1: 2, r2: 6, c1: 15, c2: 20, tint: '#1a3a2a' });       // green
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

// ----- ENHANCED PARTICLE SYSTEMS -----
// Spawn bursts for combat and events
function spawnDeathBurst(worldX, worldY, color) {
    const count = 8 + Math.floor(Math.random() * 5);
    for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4;
        const speed = 2.5 + Math.random() * 2;
        particles.push({
            x: worldX,
            y: worldY,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 0.5,
            maxLife: 0.5,
            size: 2.5 + Math.random() * 1.5,
            color: color || '#ff6644',
            alpha: 0.9,
            type: 'death',
            compositeOp: 'screen'
        });
    }
}

function spawnHitSpark(worldX, worldY) {
    const count = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 3.5 + Math.random() * 2.5;
        particles.push({
            x: worldX,
            y: worldY,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 0.2,
            maxLife: 0.2,
            size: 1.2 + Math.random() * 0.8,
            color: '#ffff99',
            alpha: 0.9,
            type: 'hitspark'
        });
    }
}

// Helper: spawn a single particle at tile coords (converted to screen internally)
function spawnParticle(tileRow, tileCol, vr, vc, life, color, alpha) {
    const pos = tileToScreen(tileRow, tileCol);
    particles.push({
        x: pos.x + cameraX, y: pos.y + cameraY,
        vx: vr, vy: vc,
        life: life, maxLife: life,
        size: 2 + Math.random() * 2,
        color: color || '#ffaa44',
        alpha: alpha || 0.8,
        type: 'effect',
    });
}

function spawnCastEffect(worldX, worldY) {
    const count = 4 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.6;
        const speed = 2.0 + Math.random() * 1.8;
        particles.push({
            x: worldX,
            y: worldY,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 0.3,
            maxLife: 0.3,
            size: 1.8 + Math.random() * 1.2,
            color: '#6688ff',
            alpha: 0.75,
            type: 'cast'
        });
    }
}

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
    { r: 19, c: 15 }, { r: 19, c: 18 }, { r: 20, c: 16 },
    // Room 4: Alcove (rows 2-6, cols 15-20)
    { r: 3, c: 17 }, { r: 4, c: 16 }, { r: 4, c: 19 },
    { r: 5, c: 17 }, { r: 6, c: 18 },
];

// Wave definitions: each wave has a list of enemies and a stat multiplier
const WAVES = [
    {
        // Wave 1: Slimes swarm early — feel the pressure immediately
        enemies: [
            { type: 'slime', count: 7 },
        ],
        statMult: 1.0,
        title: 'The Dungeon Stirs',
    },
    {
        // Wave 2: Skeletons join — mixed melee rush
        enemies: [
            { type: 'slime', count: 5 },
            { type: 'skeleton', count: 4 },
        ],
        statMult: 1.15,
        title: 'The Dead Rise',
    },
    {
        // Wave 3: Archers appear, big numbers
        enemies: [
            { type: 'slime', count: 6 },
            { type: 'skeleton', count: 5 },
            { type: 'skelarch', count: 3 },
        ],
        statMult: 1.35,
        title: 'Arrow and Bone',
    },
    {
        // Wave 4: BOSS — The Slime King + minion escort
        enemies: [
            { type: 'slime_king', count: 1 },
            { type: 'slime', count: 4 },
            { type: 'skeleton', count: 3 },
        ],
        statMult: 1.4,
        title: 'The Slime King Emerges',
        isBossWave: true,
        bossTitle: 'The Slime King Falls',
        bossSub: 'Sealed passages crumble... the depths beckon.',
    },
    // --- SECOND HALF: Sealed Wings (unlocked after Slime King) ---
    {
        // Wave 5: Heavy skeleton push from opened passages
        enemies: [
            { type: 'skeleton', count: 8 },
            { type: 'skelarch', count: 4 },
        ],
        statMult: 1.5,
        title: 'Sealed Passages Crumble',
    },
    {
        // Wave 6: Full mixed assault — the depths fight back
        enemies: [
            { type: 'slime', count: 4 },
            { type: 'skeleton', count: 6 },
            { type: 'skelarch', count: 5 },
        ],
        statMult: 1.65,
        title: 'The Deep Stirs',
    },
    {
        // Wave 7: Final push — overwhelming numbers
        enemies: [
            { type: 'skeleton', count: 8 },
            { type: 'skelarch', count: 6 },
            { type: 'slime', count: 6 },
        ],
        statMult: 1.8,
        title: 'The Undercroft\'s Last Stand',
    },
];

// ===== ZONE 2 WAVES =====
// Harder than Zone 1 — more enemies, heavier archer/skeleton mix
const ZONE2_WAVES = [
    {
        // Wave 1 (Zone 2): Skeletons lead the charge
        enemies: [
            { type: 'skeleton', count: 6 },
            { type: 'skelarch', count: 2 },
        ],
        statMult: 1.4,
        title: 'Bones Ascend',
    },
    {
        // Wave 2: Mixed assault with archers
        enemies: [
            { type: 'slime', count: 3 },
            { type: 'skeleton', count: 6 },
            { type: 'skelarch', count: 4 },
        ],
        statMult: 1.65,
        title: 'The Guard Post',
    },
    {
        // Wave 3: Armored skeletons arrive, mixed with archers
        enemies: [
            { type: 'skeleton', count: 4 },
            { type: 'armoredskel', count: 2 },
            { type: 'skelarch', count: 6 },
        ],
        statMult: 1.85,
        title: 'Iron and Arrows',
    },
    {
        // Wave 4: All-out assault with more armored units
        enemies: [
            { type: 'slime', count: 3 },
            { type: 'skeleton', count: 6 },
            { type: 'armoredskel', count: 3 },
            { type: 'skelarch', count: 6 },
        ],
        statMult: 2.1,
        title: 'The Tower\'s Wrath',
    },
    {
        // Wave 5: Heavy armored presence
        enemies: [
            { type: 'skeleton', count: 8 },
            { type: 'armoredskel', count: 4 },
            { type: 'skelarch', count: 8 },
        ],
        statMult: 2.4,
        title: 'Endless Legions',
    },
    {
        // Wave 6 (Final for Zone 2): BOSS — The Bone Colossus
        enemies: [
            { type: 'bone_colossus', count: 1 },
            { type: 'armoredskel', count: 3 },
            { type: 'skelarch', count: 4 },
        ],
        statMult: 2.4,
        title: 'The Bone Colossus Rises',
        isBossWave: true,
    },
];

// ===== ZONE 3 WAVES =====
// Boss arena — single brutal encounter
const ZONE3_WAVES = [
    {
        enemies: [
            { type: 'armoredskel', count: 6 },
            { type: 'skelarch', count: 8 },
            { type: 'skeleton', count: 10 },
        ],
        statMult: 3.0,
        title: 'The Spire\'s Guard',
    },
    {
        // BOSS — The Werewolf + elite guards
        enemies: [
            { type: 'werewolf', count: 1 },
            { type: 'armoredskel', count: 4 },
            { type: 'skelarch', count: 6 },
        ],
        statMult: 3.0,
        title: 'The Beast Awakens',
        isBossWave: true,
    },
];

// ===== ZONE 4 WAVES (THE INFERNO) =====
// Harder than Zone 3 — brutal hellfire gauntlet
const ZONE4_WAVES = [
    {
        // Wave 1: Hellfire vanguard — armored skeletons charge
        enemies: [
            { type: 'armoredskel', count: 8 },
            { type: 'skelarch', count: 6 },
        ],
        statMult: 3.5,
        title: 'The Inferno Awakens',
    },
    {
        // Wave 2: Full assault — everything at once
        enemies: [
            { type: 'skeleton', count: 10 },
            { type: 'armoredskel', count: 6 },
            { type: 'skelarch', count: 8 },
        ],
        statMult: 4.0,
        title: 'Burning Legions',
    },
    {
        // Wave 3: Werewolf shock troop — tests player before the real boss
        enemies: [
            { type: 'werewolf', count: 1 },
            { type: 'armoredskel', count: 8 },
            { type: 'skelarch', count: 8 },
        ],
        statMult: 4.2,
        title: 'The Damned March',
    },
    {
        // Wave 4: Elite guard with heavy armored focus
        enemies: [
            { type: 'armoredskel', count: 10 },
            { type: 'skelarch', count: 10 },
            { type: 'skeleton', count: 6 },
        ],
        statMult: 4.5,
        title: 'Hellfire Gauntlet',
    },
    {
        // Wave 5: BOSS — The Infernal Knight + fire escort
        enemies: [
            { type: 'infernal_knight', count: 1 },
            { type: 'armoredskel', count: 6 },
            { type: 'skelarch', count: 6 },
        ],
        statMult: 4.5,
        title: 'The Infernal Knight Descends',
        isBossWave: true,
    },
];

// ===== ZONE 5 WAVES (THE FROZEN ABYSS) =====
// Escalation from Zone 4 — more enemies, higher multipliers, culminates in Frost Wyrm
const ZONE5_WAVES = [
    {
        // Wave 1: Frozen vanguard — heavy armored push
        enemies: [
            { type: 'armoredskel', count: 10 },
            { type: 'skelarch', count: 8 },
        ],
        statMult: 5.0,
        title: 'The Abyss Stirs',
    },
    {
        // Wave 2: Swarm wave — overwhelming numbers
        enemies: [
            { type: 'skeleton', count: 14 },
            { type: 'armoredskel', count: 8 },
            { type: 'skelarch', count: 6 },
        ],
        statMult: 5.5,
        title: 'Frozen Legions',
    },
    {
        // Wave 3: Archer-heavy ambush
        enemies: [
            { type: 'skelarch', count: 14 },
            { type: 'armoredskel', count: 8 },
        ],
        statMult: 5.5,
        title: 'Arrows of Ice',
    },
    {
        // Wave 4: Werewolf pair + elite gauntlet — callback to Zone 3 boss
        enemies: [
            { type: 'werewolf', count: 2 },
            { type: 'armoredskel', count: 10 },
            { type: 'skelarch', count: 8 },
        ],
        statMult: 5.8,
        title: 'The Dead March',
    },
    {
        // Wave 5: BOSS — The Frost Wyrm + frozen elite guard
        enemies: [
            { type: 'frost_wyrm', count: 1 },
            { type: 'armoredskel', count: 8 },
            { type: 'skelarch', count: 8 },
        ],
        statMult: 6.0,
        title: 'The Wyrm Awakens',
        isBossWave: true,
    },
];

// ===== ZONE 6 WAVES (THRONE OF RUIN) =====
// The final gauntlet — boss rush callback + ultimate boss. Every previous boss reappears.
const ZONE6_WAVES = [
    {
        // Wave 1: Throne guard — full assault from the start
        enemies: [
            { type: 'armoredskel', count: 12 },
            { type: 'skelarch', count: 10 },
            { type: 'skeleton', count: 8 },
        ],
        statMult: 7.0,
        title: 'Ruin Awakens',
    },
    {
        // Wave 2: Boss rush callback — weakened echoes of past bosses
        enemies: [
            { type: 'slime_king', count: 1 },
            { type: 'bone_colossus', count: 1 },
            { type: 'armoredskel', count: 6 },
            { type: 'skelarch', count: 6 },
        ],
        statMult: 7.0,
        title: 'Echoes of the Fallen',
        isBossWave: true,
    },
    {
        // Wave 3: Werewolf pack + Infernal Knight — another callback
        enemies: [
            { type: 'werewolf', count: 2 },
            { type: 'infernal_knight', count: 1 },
            { type: 'armoredskel', count: 8 },
        ],
        statMult: 7.5,
        title: 'The Ruined Guard',
        isBossWave: true,
    },
    {
        // Wave 4: Overwhelming swarm — the world throws everything
        enemies: [
            { type: 'skeleton', count: 16 },
            { type: 'armoredskel', count: 14 },
            { type: 'skelarch', count: 14 },
        ],
        statMult: 8.0,
        title: 'Endless Ruin',
    },
    {
        // Wave 5: Elite vanguard before final boss
        enemies: [
            { type: 'frost_wyrm', count: 1 },
            { type: 'werewolf', count: 1 },
            { type: 'armoredskel', count: 10 },
            { type: 'skelarch', count: 10 },
        ],
        statMult: 8.5,
        title: 'The Last Stand',
        isBossWave: true,
    },
    {
        // Wave 6: FINAL BOSS — The Ruined King
        enemies: [
            { type: 'ruined_king', count: 1 },
            { type: 'armoredskel', count: 8 },
            { type: 'skelarch', count: 8 },
        ],
        statMult: 9.0,
        title: 'THE THRONE FALLS',
        isBossWave: true,
    },
];

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
    lastDeathRow: 0,     // position of last enemy killed
    lastDeathCol: 0,
};
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
        return;
    }
    wave.current = -1;
    wave.phase = 'pre';
    wave.timer = 4.0; // calm before wave 1
    wave.bannerText = '';
    wave.bannerSub = '';
    wave.bannerAlpha = 0;
    wave.totalKilled = 0;
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
    return {
        enemies: enemyList,
        statMult: baseMult * DIFFICULTY.scale,
        title: titles[tier % titles.length],
    };
}

function beginNextWave() {
    wave.current++;
    // Restore full light at wave start (tension effect dims it between waves)
    lightRadius = MAX_LIGHT;
    // Fixed waves exhausted — generate dynamic ones (no more victory screen, endless mode)
    let w;
    const waveArray = currentZone === 1 ? WAVES : currentZone === 2 ? ZONE2_WAVES : currentZone === 4 ? ZONE4_WAVES : currentZone === 5 ? ZONE5_WAVES : currentZone === 6 ? ZONE6_WAVES : ZONE3_WAVES;
    if (wave.current < waveArray.length) {
        w = waveArray[wave.current];
    } else {
        w = generateDynamicWave(wave.current);
    }

    wave.phase = 'countdown';
    wave.timer = w.isBossWave ? 5.0 : 4.0; // longer countdown for boss waves

    // Boss wave gets a special announcement
    if (w.isBossWave) {
        wave.bannerText = w.title;
        wave.bannerSub = 'A powerful enemy approaches...';
        wave.bannerAlpha = 1;
        addScreenShake(4, 0.3);
        // Play combat music
        const musicArray = currentZone === 1 ? WAVE_MUSIC : (currentZone === 2 ? ZONE2_WAVE_MUSIC : (currentZone === 4 ? ZONE3_WAVE_MUSIC : ZONE3_WAVE_MUSIC));
        const combatTrack = musicArray[Math.min(wave.current, musicArray.length - 1)];
        playMusic(combatTrack, 1.5);
        return;
    }

    // Atmospheric wave announcements — no numbers, keep the player guessing
    const ZONE_STIR_MESSAGES = {
        1: [
            { text: 'The Dungeon Stirs',       sub: 'Something awakens in the dark...' },
            { text: 'Darkness Gathers',         sub: 'They know you are here.' },
            { text: 'The Walls Tremble',        sub: 'More are coming.' },
            { text: 'Death Approaches',         sub: 'The dungeon will not forgive.' },
            { text: 'Bones Rattle Below',       sub: 'The sealed wings echo with fury.' },
            { text: 'The Depths Hunger',        sub: 'No mercy from what lies beneath.' },
            { text: 'A Final Reckoning',        sub: 'Stand or fall.' },
        ],
        2: [
            { text: 'The Tower Awakens',       sub: 'Ancient guardians stir...' },
            { text: 'Shadows Converge',         sub: 'The tower descends upon you.' },
            { text: 'The Spire Trembles',       sub: 'Reinforcements surge forth.' },
            { text: 'Spirits Manifest',         sub: 'The tower demands sacrifice.' },
        ],
        3: [
            { text: 'The Spire Watches',       sub: 'Eyes gleam in the heights above...' },
            { text: 'A Howl Echoes',           sub: 'Something terrible awaits at the summit.' },
        ],
        4: [
            { text: 'The Flames Rise',         sub: 'Heat scorches the very air...' },
            { text: 'Ash and Ember',           sub: 'The inferno hungers for you.' },
            { text: 'Hellfire Surges',         sub: 'There is no escape from the flames.' },
            { text: 'The Crucible Burns',      sub: 'Only ruin remains.' },
        ],
        5: [
            { text: 'The Ice Cracks',          sub: 'Something stirs beneath...' },
            { text: 'Frozen Wrath',            sub: 'The abyss will not release you.' },
            { text: 'Cold Embrace',            sub: 'The dead rise from frost.' },
            { text: 'Shatter',                 sub: 'There is no warmth here.' },
        ],
        6: [
            { text: 'The Throne Stirs',        sub: 'Your end awaits...' },
            { text: 'Ruin Descends',           sub: 'The walls close in.' },
            { text: 'No Mercy',                sub: 'The Throne demands blood.' },
            { text: 'Annihilation',            sub: 'This is where it ends.' },
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
    const musicArray = currentZone === 1 ? WAVE_MUSIC : (currentZone === 2 ? ZONE2_WAVE_MUSIC : (currentZone === 4 ? ZONE3_WAVE_MUSIC : ZONE3_WAVE_MUSIC));
    const combatTrack = musicArray[Math.min(wave.current, musicArray.length - 1)];
    playMusic(combatTrack, 1.5);
}

function spawnWaveEnemies() {
    let waveArray;
    if (currentZone === 1) waveArray = WAVES;
    else if (currentZone === 2) waveArray = ZONE2_WAVES;
    else if (currentZone === 3) waveArray = ZONE3_WAVES;
    else if (currentZone === 4) waveArray = ZONE4_WAVES;
    else if (currentZone === 5) waveArray = ZONE5_WAVES;
    else if (currentZone === 6) waveArray = ZONE6_WAVES;
    else waveArray = WAVES; // fallback

    const w = wave.current < waveArray.length ? waveArray[wave.current] : generateDynamicWave(wave.current);
    const mult = w.statMult;

    // Build flat list of enemies to spawn
    const toSpawn = [];
    for (const group of w.enemies) {
        for (let i = 0; i < group.count; i++) {
            toSpawn.push(group.type);
        }
    }

    // Build spawn zones dynamically from walkable floor tiles (works for any zone)
    let zones;
    if (currentZone === 1) {
        zones = [...SPAWN_ZONES];
    } else {
        // Auto-generate spawn zones from walkable tiles for zone 2/3
        zones = [];
        const ms = floorMap.length;
        for (let r = 1; r < ms - 1; r++) {
            for (let c = 1; c < ms - 1; c++) {
                if (floorMap[r][c] && !blocked[r][c] && !objectMap[r][c]) {
                    zones.push({ r, c });
                }
            }
        }
    }
    zones.sort(() => Math.random() - 0.5);

    // Filter zones that are at least ENEMY_SPAWN_MIN_DISTANCE tiles from the player
    const validZones = zones.filter(z => {
        const dr = z.r - player.row;
        const dc = z.c - player.col;
        return Math.sqrt(dr * dr + dc * dc) > ENEMY_SPAWN_MIN_DISTANCE;
    });

    // Use valid zones first, then fall back to any zone
    const useZones = validZones.length >= toSpawn.length ? validZones : zones;

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
        // Fade banner out
        if (wave.timer > 0) {
            wave.timer -= dt;
            wave.bannerAlpha = Math.max(0, wave.timer / 1.5);
        }

        // Count living enemies
        wave.enemiesAlive = enemies.filter(e => e.state !== 'death').length;

        // Wave cleared?
        if (wave.enemiesAlive <= 0 && enemies.length === 0) {
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
                wave.phase = 'cleared';
                // Check if this was a mid-zone boss wave (e.g. Slime King before sealed wings)
                const _zoneWaves = { 1: WAVES, 2: ZONE2_WAVES, 3: ZONE3_WAVES, 4: ZONE4_WAVES, 5: ZONE5_WAVES, 6: ZONE6_WAVES };
                const currentWaveDef = (_zoneWaves[currentZone] || WAVES)[wave.current];
                if (currentWaveDef && currentWaveDef.isBossWave) {
                    wave.timer = 10.0; // longer breather after boss
                    wave.bannerText = currentWaveDef.bossTitle || 'Boss Defeated';
                    wave.bannerSub = currentWaveDef.bossSub || 'The way ahead opens...';
                } else {
                    wave.timer = 8.0;
                    wave.bannerText = `Wave ${wave.current} Cleared`;
                    wave.bannerSub = '';
                }
                wave.bannerAlpha = 1;
                wave.tensionPhase = 0; // 0=calm, 1=building tension
                playSting('waveCleared');
                // Wave clear HP heal — 15% of max HP
                const formCfg = FORM_CONFIGS[FormSystem.currentForm] || {};
                const waveHealMaxHp = (formCfg.maxHp || 100) + (equipBonus.maxHpBonus || 0) + getTalismanBonus().hpBonus;
                const waveHealAmt = Math.round(waveHealMaxHp * 0.15);
                player.hp = Math.min(waveHealMaxHp, player.hp + waveHealAmt);
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
            }
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
            const formMaxHP = (FormSystem.getFormConfig() || FORM_CONFIGS.wizard).maxHp + getTalismanBonus().hpBonus;
            player.hp = Math.min(formMaxHP + (eb.maxHpBonus || 0), player.hp + 25);
            player.mana = MAX_MANA + (eb.maxManaBonus || 0);
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
            const zFormMaxHP = (FormSystem.getFormConfig() || FORM_CONFIGS.wizard).maxHp + getTalismanBonus().hpBonus;
            player.hp = zFormMaxHP + (eb.maxHpBonus || 0);
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
    // Center line
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
    // Small diamond at center
    ctx.fillStyle = '#c4a878';
    ctx.beginPath();
    ctx.moveTo(cx, y - 3);
    ctx.lineTo(cx + 3, y);
    ctx.moveTo(cx, y + 3);
    ctx.lineTo(cx - 3, y);
    ctx.moveTo(cx, y - 3);
    ctx.lineTo(cx + 3, y);
    ctx.lineTo(cx, y + 3);
    ctx.lineTo(cx - 3, y);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
}

function drawWaveBanner() {
    if (wave.bannerAlpha <= 0) return;

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
        const cy = canvasH * 0.20;

        // Subtle dark band behind the announcement
        ctx.globalAlpha = wave.bannerAlpha * 0.45;
        const bandGrad = ctx.createLinearGradient(0, cy - 80, 0, cy + 90);
        bandGrad.addColorStop(0, 'rgba(0,0,0,0)');
        bandGrad.addColorStop(0.3, 'rgba(0,0,0,0.7)');
        bandGrad.addColorStop(0.7, 'rgba(0,0,0,0.7)');
        bandGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = bandGrad;
        ctx.fillRect(0, cy - 80, canvasW, 170);

        ctx.globalAlpha = wave.bannerAlpha;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Decorative top line
        drawDecorLine(cx, cy - 32, 140, wave.bannerAlpha * 0.5);

        // Wave title
        ctx.font = '36px Georgia';
        ctx.fillStyle = '#e8d4aa';
        ctx.shadowColor = 'rgba(200, 160, 80, 0.4)';
        ctx.shadowBlur = 14;
        ctx.fillText(wave.bannerText, cx, cy);
        ctx.shadowBlur = 0;

        // Subtitle
        ctx.font = 'italic 15px Georgia';
        ctx.fillStyle = '#b09868';
        ctx.globalAlpha = wave.bannerAlpha * 0.8;
        ctx.fillText(wave.bannerSub, cx, cy + 28);

        // Decorative bottom line
        drawDecorLine(cx, cy + 46, 140, wave.bannerAlpha * 0.5);

        // Countdown number — large, pulsing
        const countNum = Math.ceil(wave.timer);
        if (countNum > 0 && countNum <= 3) {
            const countPulse = 1 + (wave.timer % 1) * 0.15;
            ctx.save();
            ctx.translate(cx, cy + 82);
            ctx.scale(countPulse, countPulse);
            ctx.font = 'bold 52px Georgia';
            ctx.globalAlpha = wave.bannerAlpha * 0.65;
            ctx.fillStyle = '#ffd070';
            ctx.shadowColor = 'rgba(255, 170, 40, 0.7)';
            ctx.shadowBlur = 28;
            ctx.fillText(countNum, 0, 0);
            ctx.restore();
        }

    } else if (wave.phase === 'fighting' || wave.phase === 'cleared' || wave.phase === 'zoneClear') {
        const cy = canvasH * 0.16;
        const isCleared = wave.phase === 'cleared' || wave.phase === 'zoneClear';
        const isZoneClear = wave.phase === 'zoneClear';

        // Faint dark band
        ctx.globalAlpha = wave.bannerAlpha * (isZoneClear ? 0.5 : 0.3);
        const bandGrad = ctx.createLinearGradient(0, cy - 50, 0, cy + 50);
        bandGrad.addColorStop(0, 'rgba(0,0,0,0)');
        bandGrad.addColorStop(0.3, 'rgba(0,0,0,0.6)');
        bandGrad.addColorStop(0.7, 'rgba(0,0,0,0.6)');
        bandGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = bandGrad;
        ctx.fillRect(0, cy - 50, canvasW, 100);

        ctx.globalAlpha = wave.bannerAlpha;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        ctx.font = isZoneClear ? '32px Georgia' : '28px Georgia';
        ctx.fillStyle = isZoneClear ? '#e8d88c' : (isCleared ? '#b8c8a8' : '#e0d0a8');
        ctx.shadowColor = isZoneClear ? 'rgba(230, 200, 80, 0.4)' : (isCleared ? 'rgba(150, 180, 130, 0.3)' : 'rgba(180, 150, 80, 0.3)');
        ctx.shadowBlur = 10;
        ctx.fillText(wave.bannerText, cx, cy);
        ctx.shadowBlur = 0;

        if (wave.bannerSub) {
            ctx.font = 'italic 14px Georgia';
            ctx.fillStyle = '#b09868';
            ctx.globalAlpha = wave.bannerAlpha * 0.7;
            ctx.fillText(wave.bannerSub, cx, cy + 24);
        }
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
function drawWaveHUD() {
    if (wave.phase !== 'fighting' && wave.phase !== 'cleared' && wave.phase !== 'countdown' && wave.phase !== 'zoneClear') return;

    ctx.save();
    const rx = canvasW - 20;
    const ry = 20;

    // Small subtle indicator — no numbers, just a vibe
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
        ctx.font = '9px monospace';
        ctx.fillStyle = '#aa6655';
        ctx.fillText('HOSTILE', rx - 18, ry + 13);
    } else if (wave.phase === 'cleared' || wave.phase === 'zoneClear') {
        ctx.globalAlpha = 0.35;
        ctx.textAlign = 'right';
        ctx.font = '9px monospace';
        ctx.fillStyle = wave.phase === 'zoneClear' ? '#c4a878' : '#7a9a6a';
        ctx.fillText(wave.phase === 'zoneClear' ? 'SAFE' : 'CALM', rx - 10, ry + 13);
    }

    ctx.restore();
}

// ----- BOSS HEALTH BAR (top center) -----
function drawBossHealthBar() {
    // Find any alive boss enemy
    const boss = enemies.find(e => e.def.isBoss && e.state !== 'death');
    if (!boss) return;

    ctx.save();
    const barW = 260;
    const barH = 14;
    const barX = (canvasW - barW) / 2;
    const barY = 30;

    // Boss name
    const bossNames = {
        slime_king: 'Slime King',
        bone_colossus: 'Bone Colossus',
        werewolf: 'The Beast',
        infernal_knight: 'Infernal Knight',
        frost_wyrm: 'Frost Wyrm',
        ruined_king: 'The Ruined King',
    };
    const bossName = bossNames[boss.type] || 'Boss';

    // Background
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.roundRect(barX - 4, barY - 18, barW + 8, barH + 24, 4);
    ctx.fill();

    // Name
    ctx.globalAlpha = 0.9;
    ctx.textAlign = 'center';
    ctx.font = 'bold 11px monospace';
    const phaseText = boss.bossPhase === 2 ? ' (Desperate)' : (boss.bossPhase === 1 ? ' (Enraged)' : '');
    const phaseColor = boss.bossPhase === 2 ? '#bb44ff' : (boss.bossPhase === 1 ? '#ff6644' : '#ddbb88');
    ctx.fillStyle = phaseColor;
    ctx.fillText(bossName + phaseText, canvasW / 2, barY - 4);

    // Health bar background
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#333';
    ctx.beginPath();
    ctx.roundRect(barX, barY, barW, barH, 3);
    ctx.fill();

    // Health bar fill
    const hpPct = Math.max(0, boss.hp / boss.maxHp);
    const fillColor = boss.bossPhase === 1 ? '#cc3322' : '#88cc44';
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = fillColor;
    if (hpPct > 0) {
        ctx.beginPath();
        ctx.roundRect(barX, barY, barW * hpPct, barH, 3);
        ctx.fill();
    }

    // Health bar border
    ctx.globalAlpha = 0.4;
    ctx.strokeStyle = '#aaa';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(barX, barY, barW, barH, 3);
    ctx.stroke();

    ctx.restore();
}

// ----- SPAWN SINGLE ENEMY WITH STAT SCALING -----
// All damage keys that scale with statMult on spawn
const _SCALED_DAMAGE_KEYS = [
    'slamDamage', 'sweepDamage', 'flameSweepDamage', 'fireTrailDamage',
    'iceBreathDamage', 'shatterDamage', 'teleSlashDamage', 'voidPulseDamage', 'despDamage',
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
    }

    enemies.push(enemy);
    const spawned = enemies[enemies.length - 1];

    // --- Elite Modifier System ---
    // Non-boss enemies in zone 3+ have a chance to become elite
    if (!baseDef.isBoss && currentZone >= 3) {
        const eliteChance = Math.min(ELITE_MAX_CHANCE, ELITE_BASE_CHANCE + (currentZone - 3) * ELITE_CHANCE_PER_ZONE);
        if (Math.random() < eliteChance) {
            const modifiers = ['swift', 'vampiric', 'volatile', 'splitting'];
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
            }
        }
    }

    return spawned;
}

// ----- ENEMY AI UPDATE -----
function updateEnemies(dt) {
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
                        damagePlayer(Math.round(e.def.damage * ENEMY_CONTACT_DAMAGE_MULT), e.type);
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
                }

                enemies.splice(i, 1);
                wave.totalKilled++;
                grantXP(e.type, e.statMult || 1.0);
                // Multi-kill tracking
                if (multiKillTimer > 0) {
                    multiKillCount++;
                    if (multiKillCount >= 3) {
                        addSlowMo(0.15, 0.2);
                        addScreenShake(5, 0.15);
                    }
                } else {
                    multiKillCount = 1;
                }
                multiKillTimer = 0.8; // 0.8s window to chain kills
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
                    const killMaxHP = (FormSystem.getFormConfig() || FORM_CONFIGS.wizard).maxHp + getTalismanBonus().hpBonus + (equipBonus.maxHpBonus || 0);
                    player.hp = Math.min(killMaxHP, player.hp + healAmt);
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
        if (e.howlCooldown > 0) e.howlCooldown -= dt;

        // Distance to player
        const dr = player.row - e.row;
        const dc = player.col - e.col;
        const dist = Math.sqrt(dr * dr + dc * dc);

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
                if (e.def.ai === 'ranged') {
                    fireEnemyArrow(e);
                } else {
                    // Melee: damage player if in range
                    if (dist < e.def.attackRange + 0.3) {
                        sfxEnemyHurt(e.row, e.col); // melee attack impact sound
                        damagePlayer(e.def.damage, e.type);
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

        // --- Boss enrage phase transition ---
        if (e.def.isBoss && e.bossPhase === 0 && e.hp < e.maxHp * 0.5) {
            e.bossPhase = 1;
            addScreenShake(8, 0.4);
            // Visual enrage burst
            for (let p = 0; p < 16; p++) {
                const angle = (p / 16) * Math.PI * 2;
                spawnParticle(e.row + Math.cos(angle) * 0.5, e.col + Math.sin(angle) * 0.5,
                    Math.cos(angle) * 3, Math.sin(angle) * 3, 0.6, e.def.tintColor || '#ff4444', 0.9);
            }
            // Boss-specific enrage banner
            if (e.type === 'slime_king') {
                wave.bannerText = 'The Slime King Rages!';
                wave.bannerSub = 'It grows more aggressive...';
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
        if (e.type === 'ruined_king' && e.bossPhase === 1 && e.hp < e.maxHp * 0.25) {
            e.bossPhase = 2;
            addScreenShake(12, 0.6);
            for (let p = 0; p < 24; p++) {
                const angle = (p / 24) * Math.PI * 2;
                spawnParticle(e.row + Math.cos(angle) * 0.5, e.col + Math.sin(angle) * 0.5,
                    Math.cos(angle) * 4, Math.sin(angle) * 4, 0.8, '#9944dd', 1.0);
            }
            wave.bannerText = 'THE KING UNLEASHES RUIN';
            wave.bannerSub = 'All shall perish...';
            wave.bannerAlpha = 1;
            wave.timer = 1.5;
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
        if (e.type === 'slime_king' && dist < e.def.aggroRange) {
            // Ground Slam — AoE damage around the boss
            if (e.bossSlamTimer <= 0 && dist < e.def.slamRadius + 1) {
                e.bossSlamTimer = e.def.slamCooldown * (e.bossPhase === 1 ? 0.7 : 1.0);
                const slamR = e.def.slamRadius;
                // Particle ring
                for (let p = 0; p < 16; p++) {
                    const angle = (p / 16) * Math.PI * 2;
                    spawnParticle(e.row + Math.cos(angle) * slamR, e.col + Math.sin(angle) * slamR,
                        Math.cos(angle) * 1.5, Math.sin(angle) * 1.5, 0.5, '#88ee44', 0.8);
                }
                // Damage player if in range
                if (dist < slamR) {
                    const slamDmg = Math.round(e.def.slamDamage * (e.bossPhase === 1 ? 1.3 : 1.0));
                    damagePlayer(slamDmg, 'slime_king');
                }
                addScreenShake(5, 0.25);
                e.howlPaused = 0.4; // brief pause after slam
                e.state = 'attack';
                e.animFrame = 0;
                e.attackTimer = 0.4;
                e.attackFired = true;
                continue;
            }

            // Slam telegraph — visual warning 0.3s before slam fires
            if (e.bossSlamTimer > 0 && e.bossSlamTimer <= 0.3 && dist < e.def.slamRadius + 1) {
                const slamR = e.def.slamRadius;
                // Red warning particles in expanding ring
                if (Math.random() < 0.5) {
                    const angle = Math.random() * Math.PI * 2;
                    spawnParticle(e.row + Math.cos(angle) * slamR, e.col + Math.sin(angle) * slamR,
                        Math.cos(angle) * 0.5, Math.sin(angle) * 0.5, 0.15, '#ff4444', 0.9);
                }
            }

            // Summon Slime Adds — spawns small slimes around the boss
            if (e.bossSummonTimer <= 0) {
                e.bossSummonTimer = e.def.summonCooldown * (e.bossPhase === 1 ? 0.6 : 1.0);
                const addCount = e.def.summonCount + (e.bossPhase === 1 ? 1 : 0);
                for (let s = 0; s < addCount; s++) {
                    const angle = (s / addCount) * Math.PI * 2 + Math.random() * 0.5;
                    const spawnR = e.row + Math.cos(angle) * 1.5;
                    const spawnC = e.col + Math.sin(angle) * 1.5;
                    if (canEnemyMoveTo(spawnR, spawnC, 0.25, null)) {
                        const addMult = Math.max(1.0, (e.statMult || 1.0) * 0.6); // adds are 60% of boss scaling
                        const add = spawnEnemy('slime', spawnR, spawnC, addMult);
                        if (add) add.attackCooldown = 0.5 + Math.random();
                    }
                }
                // Summon particles
                for (let p = 0; p < 8; p++) {
                    const angle = Math.random() * Math.PI * 2;
                    spawnParticle(e.row, e.col, Math.cos(angle) * 2, Math.sin(angle) * 2, 0.4, '#66cc22', 0.7);
                }
                addScreenShake(3, 0.15);
            }
        }

        // =====================================================
        // BONE COLOSSUS ABILITIES
        // =====================================================
        if (e.type === 'bone_colossus' && dist < e.def.aggroRange) {
            // Sweeping Attack — damages in a frontal arc
            if (e.bossSweepTimer <= 0 && dist < e.def.sweepRadius + 0.5) {
                e.bossSweepTimer = e.def.sweepCooldown * (e.bossPhase === 1 ? 0.65 : 1.0);
                // Sweep particle arc in facing direction
                const sweepCenter = Math.atan2(dc, dr);
                for (let p = 0; p < 10; p++) {
                    const angle = sweepCenter + (p / 10 - 0.5) * Math.PI;
                    const px = e.row + Math.cos(angle) * e.def.sweepRadius;
                    const py = e.col + Math.sin(angle) * e.def.sweepRadius;
                    spawnParticle(px, py, Math.cos(angle) * 1, Math.sin(angle) * 1, 0.4, '#ccaa66', 0.8);
                }
                // Damage if player in range
                if (dist < e.def.sweepRadius) {
                    const sweepDmg = Math.round(e.def.sweepDamage * (e.bossPhase === 1 ? 1.4 : 1.0));
                    damagePlayer(sweepDmg, 'bone_colossus');
                }
                addScreenShake(4, 0.2);
                e.howlPaused = 0.3;
                e.state = 'attack';
                e.animFrame = 0;
                e.attackTimer = 0.3;
                e.attackFired = true;
                continue;
            }

            // Sweep telegraph — visual warning 0.3s before sweep fires
            if (e.bossSweepTimer > 0 && e.bossSweepTimer <= 0.3 && dist < e.def.sweepRadius + 0.5) {
                const sweepCenter = Math.atan2(dc, dr);
                // Tan/brown warning particles in arc
                if (Math.random() < 0.4) {
                    const angle = sweepCenter + (Math.random() - 0.5) * Math.PI * 0.8;
                    const px = e.row + Math.cos(angle) * e.def.sweepRadius;
                    const py = e.col + Math.sin(angle) * e.def.sweepRadius;
                    spawnParticle(px, py, Math.cos(angle) * 0.3, Math.sin(angle) * 0.3, 0.15, '#dd8844', 0.9);
                }
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
                    // Fire inward toward where player was
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

            // Flame Sweep — wider arc than Bone Colossus, with lingering fire
            if (e.bossFlameSweepTimer <= 0 && dist < e.def.flameSweepRadius + 0.5) {
                e.bossFlameSweepTimer = e.def.flameSweepCooldown * (e.bossPhase === 1 ? 0.6 : 1.0);
                const sweepR = e.def.flameSweepRadius;
                const sweepCenter = Math.atan2(dc, dr);
                // Wide flame arc particles
                for (let p = 0; p < 14; p++) {
                    const angle = sweepCenter + (p / 14 - 0.5) * Math.PI * 1.2; // wider than Bone Colossus
                    const px = e.row + Math.cos(angle) * sweepR;
                    const py = e.col + Math.sin(angle) * sweepR;
                    spawnParticle(px, py, Math.cos(angle) * 1.5, Math.sin(angle) * 1.5, 0.5, '#ff6622', 0.9);
                }
                if (dist < sweepR) {
                    const sweepDmg = Math.round(e.def.flameSweepDamage * (e.bossPhase === 1 ? 1.4 : 1.0));
                    damagePlayer(sweepDmg, 'infernal_knight');
                }
                addScreenShake(5, 0.25);
                e.howlPaused = 0.35;
                e.state = 'attack';
                e.animFrame = 0;
                e.attackTimer = 0.35;
                e.attackFired = true;
                continue;
            }

            // Flame Sweep telegraph — visual warning 0.3s before sweep fires
            if (e.bossFlameSweepTimer > 0 && e.bossFlameSweepTimer <= 0.3 && dist < e.def.flameSweepRadius + 0.5) {
                const sweepCenter = Math.atan2(dc, dr);
                // Orange/red warning particles in wider arc
                if (Math.random() < 0.5) {
                    const angle = sweepCenter + (Math.random() - 0.5) * Math.PI;
                    const px = e.row + Math.cos(angle) * e.def.flameSweepRadius;
                    const py = e.col + Math.sin(angle) * e.def.flameSweepRadius;
                    spawnParticle(px, py, Math.cos(angle) * 0.5, Math.sin(angle) * 0.5, 0.15, '#ff8833', 0.95);
                }
            }

            // Fire Trail — leaves burning ground where it walks (every 0.8s while moving)
            if (e.def.fireTrail && e.bossFireTrailTimer <= 0 && e.state === 'walk') {
                e.bossFireTrailTimer = 0.8;
                e.fireTrails.push({
                    row: e.row, col: e.col,
                    life: e.def.fireTrailDuration * (e.bossPhase === 1 ? 1.5 : 1.0),
                    tickTimer: 0.5,
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
            // Ice Breath — cone attack in player direction
            if (e.bossIceBreathTimer <= 0 && dist < e.def.iceBreathRadius + 1) {
                e.bossIceBreathTimer = e.def.iceBreathCooldown * (e.bossPhase === 1 ? 0.65 : 1.0);
                const breathDir = Math.atan2(dc, dr);
                const breathR = e.def.iceBreathRadius;
                const halfAngle = e.def.iceBreathAngle;
                // Cone particles
                for (let p = 0; p < 16; p++) {
                    const angle = breathDir + (Math.random() - 0.5) * halfAngle * 2;
                    const dist2 = Math.random() * breathR;
                    const px = e.row + Math.cos(angle) * dist2;
                    const py = e.col + Math.sin(angle) * dist2;
                    spawnParticle(px, py, Math.cos(angle) * 3, Math.sin(angle) * 3, 0.5, '#88ccff', 0.8);
                }
                // Check if player is in cone
                const toPlayerAngle = Math.atan2(dc, dr);
                let angleDiff = Math.abs(toPlayerAngle - breathDir);
                if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;
                if (dist < breathR && angleDiff < halfAngle) {
                    const breathDmg = Math.round(e.def.iceBreathDamage * (e.bossPhase === 1 ? 1.3 : 1.0));
                    damagePlayer(breathDmg, 'frost_wyrm');
                    // Slow player briefly
                    player.slowTimer = (player.slowTimer || 0) + 0.8;
                }
                addScreenShake(4, 0.2);
                e.howlPaused = 0.4;
                e.state = 'attack';
                e.animFrame = 0;
                e.attackTimer = 0.4;
                e.attackFired = true;
                continue;
            }

            // Ice Breath telegraph — visual warning 0.3s before breath fires
            if (e.bossIceBreathTimer > 0 && e.bossIceBreathTimer <= 0.3 && dist < e.def.iceBreathRadius + 1) {
                const breathDir = Math.atan2(dc, dr);
                const breathR = e.def.iceBreathRadius;
                const halfAngle = e.def.iceBreathAngle;
                // Cyan warning particles in cone direction
                if (Math.random() < 0.5) {
                    const angle = breathDir + (Math.random() - 0.5) * halfAngle * 1.5;
                    const dist2 = Math.random() * breathR * 0.7;
                    const px = e.row + Math.cos(angle) * dist2;
                    const py = e.col + Math.sin(angle) * dist2;
                    spawnParticle(px, py, Math.cos(angle) * 0.8, Math.sin(angle) * 0.8, 0.15, '#44ccff', 0.95);
                }
            }

            // Freeze Trap — places a trap at player's current position
            if (e.bossFreezeTrapTimer <= 0 && dist < 8) {
                e.bossFreezeTrapTimer = e.def.freezeTrapCooldown * (e.bossPhase === 1 ? 0.7 : 1.0);
                // Warning particles at player position
                for (let p = 0; p < 8; p++) {
                    const angle = (p / 8) * Math.PI * 2;
                    spawnParticle(player.row + Math.cos(angle) * 0.5, player.col + Math.sin(angle) * 0.5,
                        0, -1, 0.6, '#aaddff', 0.7);
                }
                // After short delay, freeze triggers (immediate for gameplay)
                const trapDr = player.row - e.row;
                const trapDc = player.col - e.col;
                if (Math.sqrt(trapDr * trapDr + trapDc * trapDc) < 1.2) {
                    // Player is very close to where trap was laid — freeze them
                    player.frozenTimer = (player.frozenTimer || 0) + e.def.freezeTrapDuration;
                }
                // Ice burst at trap location
                for (let p = 0; p < 6; p++) {
                    spawnParticle(player.row, player.col,
                        (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, 0.4, '#44aaff', 0.8);
                }
                addScreenShake(3, 0.15);
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
            // Tele-Slash — teleports behind player, then slashes
            if (e.bossTeleSlashTimer <= 0 && dist < e.def.teleSlashRange && dist > 2.0) {
                const cdMult = e.bossPhase === 2 ? 0.5 : (e.bossPhase === 1 ? 0.7 : 1.0);
                e.bossTeleSlashTimer = e.def.teleSlashCooldown * cdMult;
                // Vanish particles at old position
                for (let p = 0; p < 10; p++) {
                    spawnParticle(e.row, e.col,
                        (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4, 0.4, '#7722bb', 0.8);
                }
                // Teleport behind player
                const behindAngle = Math.atan2(player.col - e.col, player.row - e.row) + Math.PI;
                const teleRow = player.row + Math.cos(behindAngle) * 1.2;
                const teleCol = player.col + Math.sin(behindAngle) * 1.2;
                if (canEnemyMoveTo(teleRow, teleCol, e.def.hitboxR, e)) {
                    e.row = teleRow;
                    e.col = teleCol;
                }
                // Appear particles at new position
                for (let p = 0; p < 10; p++) {
                    spawnParticle(e.row, e.col,
                        (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, 0.3, '#9944dd', 0.9);
                }
                // Immediate slash damage at new position
                const newDr = player.row - e.row;
                const newDc = player.col - e.col;
                const newDist = Math.sqrt(newDr * newDr + newDc * newDc);
                if (newDist < 2.0) {
                    const slashDmg = Math.round(e.def.teleSlashDamage * (e.bossPhase >= 1 ? 1.3 : 1.0));
                    damagePlayer(slashDmg, 'ruined_king');
                }
                addScreenShake(5, 0.2);
                e.state = 'attack';
                e.animFrame = 0;
                e.attackTimer = 0.3;
                e.attackFired = true;
                continue;
            }

            // Tele-Slash telegraph — visual warning 0.3s before slash fires
            if (e.bossTeleSlashTimer > 0 && e.bossTeleSlashTimer <= 0.3 && dist < e.def.teleSlashRange && dist > 2.0) {
                // Purple warning particles at player position (indicating incoming teleport)
                if (Math.random() < 0.5) {
                    const angle = Math.random() * Math.PI * 2;
                    spawnParticle(player.row + Math.cos(angle) * 0.6, player.col + Math.sin(angle) * 0.6,
                        Math.cos(angle) * 0.3, Math.sin(angle) * 0.3, 0.15, '#bb44ff', 0.95);
                }
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
        const slowMult = e.slowTimer > 0 ? Math.max(0.2, 1 - 0.3 * getUpgrade('tower_slow')) : 1;
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

    // --- Enemy-player contact damage ---
    if (playerInvTimer > 0) {
        playerInvTimer -= dt;
    } else {
        for (const e of enemies) {
            if (e.state === 'death') continue;
            const dr = player.row - e.row;
            const dc = player.col - e.col;
            const dist = Math.sqrt(dr * dr + dc * dc);
            if (dist < HITBOX_RADIUS + e.def.hitboxR + 0.1) {
                damagePlayer(Math.ceil(e.def.damage * ENEMY_CONTACT_DAMAGE_MULT), e.type); // contact = half damage
                break;
            }
        }
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
function grantXP(enemyType, statMult) {
    const baseAmount = ENEMY_XP[enemyType] || 5;
    // XP scales with sqrt of statMult — harder enemies give more XP but not linearly
    const scaledAmount = baseAmount * Math.sqrt(statMult || 1.0);
    const amount = Math.round(scaledAmount * getTalismanBonus().xpMult);
    xpState.xp += amount;
    // Track kills for current form
    if (FormSystem.formData[FormSystem.currentForm]) {
        FormSystem.formData[FormSystem.currentForm].totalKills++;
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
    const available = currentPool.filter(u => (upgrades[u.id] || 0) < u.maxStack);

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
    xpState.levelUpFadeIn = 0;
    // Duck music and play level-up sting
    duckMusic(true);
    playSting('levelUp');
}

function applyUpgrade(upgradeId) {
    upgrades[upgradeId] = (upgrades[upgradeId] || 0) + 1;
    xpState.levelUpPending = false;
    duckMusic(false); // restore music volume
    xpState.levelUpChoices = [];
    setPixelCursor('none');
}

// Helper to get current stack count
function getUpgrade(id) { return upgrades[id] || 0; }

// ----- PLAYER DAMAGE -----
function damagePlayer(amount, enemyType = '') {
    if (player.dodging) return; // immune during phase jump
    if (playerInvTimer > 0) return;
    // Skeleton shield reduces damage by 70%
    if (FormSystem.currentForm === 'skeleton' && typeof skeletonState !== 'undefined' && skeletonState.shieldUp) {
        const blocked = amount - Math.round(amount * 0.3);
        FormSystem.formData.skeleton.shieldDamageBlocked += blocked; // track for evolution
        amount = Math.round(amount * 0.3); // shield reduces 70%
    }
    // Lich Ethereal Form: 25% damage reduction per stack when above 80 soul energy
    if (FormSystem.currentForm === 'lich' && typeof lichState !== 'undefined' &&
        getUpgrade('ethereal_form') > 0 && lichState.soulEnergy >= 80) {
        amount = Math.round(amount * (1 - 0.25 * getUpgrade('ethereal_form')));
    }
    // Skeleton combo armor: 3% reduction per combo stack (max 30%)
    if (FormSystem.currentForm === 'skeleton' && typeof skeletonState !== 'undefined' &&
        skeletonState.comboCount > 0) {
        const comboReduc = Math.min(0.30, skeletonState.comboCount * 0.03);
        amount = Math.round(amount * (1 - comboReduc));
    }
    const reducedAmt = Math.max(1, Math.round(amount * (1 - (equipBonus.dmgReduc || 0))));
    player.hp -= reducedAmt;
    playerInvTimer = PLAYER_INV_TIME;
    // Scale feedback by damage taken
    const shakeScale = Math.min(2.0, reducedAmt / 15);
    addScreenShake(4 + 6 * shakeScale, 0.15 + 0.1 * shakeScale);
    addHitPause(0.03 + 0.04 * shakeScale);
    if (reducedAmt >= 25) addSlowMo(0.12, 0.3); // big hit slow-mo
    if (player.hp <= 0) {
        player.hp = 0;
        gameDead = true;
        deathFadeTimer = 0;
        deathCause = enemyType || 'Unknown';
        deathRecapTimer = 0;
        placement.active = false;
        if (typeof slimeState !== 'undefined') {
            slimeState.splitClones.length = 0;
            slimeState.acidPuddles.length = 0;
        }
        sfxPlayerDeath();
        // Fade to death music
        playMusic('death', 2.0);
    } else {
        sfxPlayerHurt();
    }

    // Thorns of Flame: damage melee attackers
    if (getUpgrade('thorns') > 0) {
        const thornDmg = 15 * getUpgrade('thorns');
        sfxThorns();
        // Damage all enemies within melee range
        for (const e of enemies) {
            if (e.state === 'death') continue;
            const dr = e.row - player.row;
            const dc = e.col - player.col;
            if (Math.sqrt(dr*dr + dc*dc) < 1.5) {
                e.hp -= thornDmg;
                e.state = 'hurt'; e.hurtTimer = 0.2; e.animFrame = 0;
                if (e.hp <= 0) {
                    e.hp = 0; e.state = 'death'; e.deathTimer = 0.7; e.animFrame = 0;
                    sfxEnemyDeath(e.row, e.col);
                    rollEnemyLoot(e);
                } else {
                    sfxEnemyHurt(e.row, e.col);
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
                const dmgBonus = (equipBonus.dmgBonus || 0) + getUpgrade('bigshot') * 5;
                const shieldReduc = e.isShielding ? (1 - (e.def.shieldDmgReduc || 0)) : 1;
                const talismanDmg = getTalismanBonus().dmgMult;
                e.hp -= Math.round((baseProjDmg + dmgBonus) * shieldReduc * talismanDmg);

                if (!p.hitEnemies) p.hitEnemies = new Set();
                p.hitEnemies.add(e);

                addHitPause(0.025);
                addScreenShake(2, 0.08);

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
                            if (e2.hp <= 0) {
                                e2.hp = 0; e2.state = 'death'; e2.deathTimer = 0.7; e2.animFrame = 0;
                                sfxEnemyDeath(e2.row, e2.col); rollEnemyLoot(e2);
                            } else {
                                e2.state = 'hurt'; e2.hurtTimer = 0.2; e2.animFrame = 0;
                                sfxEnemyHurt(e2.row, e2.col);
                                const hitPos2 = tileToScreen(e2.row, e2.col);
                                spawnHitSpark(hitPos2.x + cameraX, hitPos2.y + cameraY);
                            }
                        }
                    }
                }

                // Marrow Leech: skeleton bone hits heal player
                if (p.marrowLeech) {
                    const healAmt = Math.round(p.damage * MARROW_LEECH_HEAL_MULT);
                    const skelMaxHp = (FORM_CONFIGS.skeleton || {}).maxHp || 80;
                    const maxHp = skelMaxHp * (1 + getUpgrade('calcium_fort') * 0.15) + getTalismanBonus().hpBonus + (equipBonus.maxHpBonus || 0);
                    player.hp = Math.min(maxHp, player.hp + healAmt);
                }

                // Skeleton combo system: increment on bone hit
                if (p.isBone && typeof skeletonState !== 'undefined') {
                    skeletonState.comboCount = Math.min(skeletonState.maxCombo, skeletonState.comboCount + 1);
                    skeletonState.comboTimer = 0; // reset decay timer
                }

                if (e.hp <= 0) {
                    e.hp = 0;
                    e.state = 'death';
                    e.deathTimer = 0.7;
                    e.animFrame = 0;
                    sfxEnemyDeath(e.row, e.col);
                    rollEnemyLoot(e);
                    // Boss kill: dramatic slow-mo
                    if (e.def.isBoss) { addSlowMo(0.4, 0.15); addScreenShake(12, 0.4); }
                } else {
                    e.state = 'hurt';
                    e.hurtTimer = 0.3;
                    e.animFrame = 0;
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
function fireEnemyArrow(e) {
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
        if (b === 0) {
            enemyProjectiles.push({
                row: e.row, col: e.col,
                vr: spreadR * speed, vc: spreadC * speed,
                life: 2.5, angle, damage: e.def.damage,
            });
        } else {
            // Queue delayed projectile (simplified: spawn immediately with offset)
            enemyProjectiles.push({
                row: e.row - spreadR * delay * speed,
                col: e.col - spreadC * delay * speed,
                vr: spreadR * speed, vc: spreadC * speed,
                life: 2.5, angle, damage: Math.round(e.def.damage * ENEMY_PROJECTILE_BURST_MULT), // burst shots do less
            });
        }
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

        // Hit player
        if (!player.dodging && playerInvTimer <= 0) {
            const pdr = player.row - a.row;
            const pdc = player.col - a.col;
            if (Math.sqrt(pdr * pdr + pdc * pdc) < HITBOX_RADIUS + 0.15) {
                sfxArrowHit();
                const dmgSource = a.type === 'bone_cage' ? 'bone_colossus'
                    : a.type === 'ice_shard' ? 'frost_wyrm'
                    : a.type === 'void_pulse' ? 'ruined_king'
                    : 'skelarch';
                damagePlayer(a.damage, dmgSource);
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

// ----- DRAW SINGLE ENEMY -----
function drawEnemy(e) {
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

    // Enemy ground aura glow removed — looked unnatural per art direction

    // Shadow
    ctx.save();
    ctx.globalAlpha = (e.state === 'death' ? 0.1 : 0.25) * spawnAlpha;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(sx, sy + 4, 14, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // (Silhouette halo removed — felt unnatural)

    // Boss glow aura
    if (e.def.isBoss && e.state !== 'death') {
        ctx.save();
        const bossGlowColor = e.bossPhase === 1 ? 'rgba(255, 60, 30, ' : 'rgba(255, 200, 80, ';
        const bossGlowPulse = 0.15 + Math.sin(performance.now() / 300) * 0.08;
        ctx.globalAlpha = bossGlowPulse * spawnAlpha;
        ctx.globalCompositeOperation = 'screen';
        const glowGrad = ctx.createRadialGradient(sx, sy - dh * 0.3, 0, sx, sy - dh * 0.3, dw * 0.6);
        glowGrad.addColorStop(0, bossGlowColor + '0.4)');
        glowGrad.addColorStop(1, bossGlowColor + '0)');
        ctx.fillStyle = glowGrad;
        ctx.beginPath();
        ctx.ellipse(sx, sy - dh * 0.3, dw * 0.6, dh * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
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
        ctx.globalAlpha = e.deathTimer > fadeStart ? 0.7 : Math.max(0, (e.deathTimer / fadeStart) * 0.7);
    }
    // Apply spawn fade alpha multiplier
    ctx.globalAlpha *= spawnAlpha;

    const scaledDW = dw * spawnScale;
    const scaledDH = dh * spawnScale;

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

    // --- Corpse interaction glow (pulsing when player is nearby) ---
    if (e.state === 'death' && e.deathTimer > 0.5) {
        const pDist = Math.sqrt((e.row - player.row) ** 2 + (e.col - player.col) ** 2);
        if (pDist < 2.5) {
            const t = performance.now() / 1000;
            const corpPulse = 0.2 + Math.sin(t * 4) * 0.1;
            const _cf = FormSystem.currentForm;
            const corpCol = _cf === 'slime' ? 'rgba(200, 80, 60,' :
                           _cf === 'skeleton' ? 'rgba(200, 190, 150,' :
                           _cf === 'lich' ? 'rgba(140, 70, 200,' :
                           'rgba(100, 140, 200,';
            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            ctx.globalAlpha = corpPulse * Math.min(1, (e.deathTimer - 0.5) / 0.5);
            const corpGrad = ctx.createRadialGradient(sx, sy, 0, sx, sy, 20);
            corpGrad.addColorStop(0, corpCol + ' 0.4)');
            corpGrad.addColorStop(0.6, corpCol + ' 0.1)');
            corpGrad.addColorStop(1, corpCol + ' 0)');
            ctx.fillStyle = corpGrad;
            ctx.beginPath();
            ctx.ellipse(sx, sy + 2, 22, 10, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
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
        const barW = 34;
        const barH = 4;
        const bx = sx - barW / 2;
        const by = drawY - 8;
        const hpFrac = e.hp / e.maxHp;

        ctx.save();
        ctx.globalAlpha = 0.8;
        ctx.fillStyle = '#1a0000';
        ctx.fillRect(bx, by, barW, barH);
        ctx.fillStyle = hpFrac > 0.5 ? '#cc3333' : (hpFrac > 0.25 ? '#cc6600' : '#cc0000');
        ctx.fillRect(bx, by, barW * hpFrac, barH);
        ctx.strokeStyle = '#660000';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(bx, by, barW, barH);
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
            const pulse = 1.0 + Math.sin(Date.now() * 0.008 + ft.row * 3) * 0.15;
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
            ctx.moveTo(0, s);
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
            // Default: arrow
            ctx.rotate(a.angle);
            if (arrowImg) {
                const s = 0.35;
                ctx.drawImage(arrowImg, -50 * s, -50 * s, 100 * s, 100 * s);
            } else {
                ctx.strokeStyle = '#aaa';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(-8, 0);
                ctx.lineTo(8, 0);
                ctx.stroke();
            }
        }
        ctx.restore();
    }
}

// ============================================================
