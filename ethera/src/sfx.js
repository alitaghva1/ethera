// ============================================================
//  SFX SYSTEM — Procedural sounds via Web Audio API
// ============================================================
let sfxCtx = null;          // AudioContext (created on first interaction)
let sfxMasterGain = null;   // Master gain node
let sfxVolume = 0.35;       // SFX master volume (0-1)
// Polyphony control — max simultaneous SFX channels
const SFX_MAX_CHANNELS = 6;
let sfxActiveCount = 0;
const SFX_PRIORITY = { playerDeath: 3, playerHurt: 3, explosion: 2, enemyDeath: 1, fireballHit: 1, default: 0 };

function initSFX() {
    if (sfxCtx) return;
    sfxCtx = new (window.AudioContext || window.webkitAudioContext)();
    sfxMasterGain = sfxCtx.createGain();
    sfxMasterGain.gain.value = sfxVolume;
    sfxMasterGain.connect(sfxCtx.destination);
}

// Check if a new SFX can play (polyphony limiting)
function canPlaySFX(priority) {
    if (sfxActiveCount < SFX_MAX_CHANNELS) return true;
    return (priority || 0) >= 2; // high priority can always play
}
function trackSFXChannel(duration) {
    sfxActiveCount++;
    setTimeout(() => { sfxActiveCount = Math.max(0, sfxActiveCount - 1); }, duration * 1000);
}

// Helper: create noise buffer (for whooshes, hits, explosions)
function createNoiseBuffer(duration) {
    const len = sfxCtx.sampleRate * duration;
    const buf = sfxCtx.createBuffer(1, len, sfxCtx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
}

// Distance attenuation — reduce volume based on tile distance from player
function sfxDistanceVol(row, col) {
    if (row === undefined || col === undefined) return 1.0;
    const dr = row - player.row;
    const dc = col - player.col;
    const dist = Math.sqrt(dr * dr + dc * dc);
    return Math.min(1.0, 1.0 / (1 + dist * dist * 0.04));
}

// Stereo panning — compute L/R pan from tile-space position relative to player
// Returns -1 (left) to +1 (right). Uses isometric screen-X offset.
function sfxPanValue(row, col) {
    if (row === undefined || col === undefined) return 0;
    const dr = row - player.row;
    const dc = col - player.col;
    // Convert to screen-space X: screenX = (col - row) * HALF_DW
    const screenXOffset = (dc - dr) * (typeof HALF_DW !== 'undefined' ? HALF_DW : 57);
    // Normalize: full pan at ~400px offset, clamped to [-1, 1]
    return Math.max(-1, Math.min(1, screenXOffset / 400));
}

// Create a panned gain node chain: source → panner → gain → master
function createPannedOutput(pan) {
    if (!sfxCtx || !sfxCtx.createStereoPanner) {
        // Fallback if StereoPanner not supported
        return sfxMasterGain;
    }
    const panner = sfxCtx.createStereoPanner();
    panner.pan.value = pan || 0;
    panner.connect(sfxMasterGain);
    return panner;
}

// Helper: play a shaped noise burst (optional dest for stereo panning)
function playNoise(duration, freq, Q, vol, attack, decay, dest) {
    const now = sfxCtx.currentTime;
    const noise = sfxCtx.createBufferSource();
    noise.buffer = createNoiseBuffer(duration);
    const filter = sfxCtx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    filter.Q.value = Q;
    const gain = sfxCtx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(vol, now + attack);
    gain.gain.exponentialRampToValueAtTime(0.001, now + decay);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(dest || sfxMasterGain);
    noise.start(now);
    noise.stop(now + duration);
}

// Helper: play a tone with pitch sweep (optional dest for stereo panning)
function playTone(type, startFreq, endFreq, duration, vol, attack, decay, dest) {
    const now = sfxCtx.currentTime;
    const osc = sfxCtx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration);
    const gain = sfxCtx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(vol, now + (attack || 0.01));
    gain.gain.exponentialRampToValueAtTime(0.001, now + (decay || duration));
    osc.connect(gain);
    gain.connect(dest || sfxMasterGain);
    osc.start(now);
    osc.stop(now + duration);
}

// ---- SOUND DEFINITIONS ----

function sfxFireballShoot() {
    if (!sfxCtx) return;
    // Magical whoosh: rising tone + filtered noise burst
    playTone('sine', 200, 600, 0.15, 0.25, 0.01, 0.15);
    playTone('triangle', 400, 900, 0.1, 0.12, 0.005, 0.1);
    playNoise(0.12, 2000, 2, 0.15, 0.005, 0.1);
}

function sfxFireballHit() {
    if (!sfxCtx || !canPlaySFX(1)) return;
    trackSFXChannel(0.12);
    playTone('sine', 150, 60, 0.12, 0.3, 0.005, 0.12);
    playNoise(0.08, 1200, 3, 0.2, 0.003, 0.07);
}

function sfxEnemyHurt(row, col) {
    if (!sfxCtx || !canPlaySFX(0)) return;
    const v = sfxDistanceVol(row, col);
    if (v < 0.05) return;
    trackSFXChannel(0.08);
    const pan = sfxPanValue(row, col);
    const dest = createPannedOutput(pan);
    playTone('square', 180, 80, 0.08, 0.15 * v, 0.003, 0.08, dest);
    playNoise(0.06, 800, 4, 0.1 * v, 0.003, 0.05, dest);
}

function sfxEnemyDeath(row, col) {
    if (!sfxCtx) return;
    const v = sfxDistanceVol(row, col);
    if (v < 0.05) return;
    const pan = sfxPanValue(row, col);
    const dest = createPannedOutput(pan);
    playTone('sawtooth', 300, 50, 0.3, 0.2 * v, 0.01, 0.25, dest);
    playTone('sine', 200, 40, 0.35, 0.15 * v, 0.01, 0.3, dest);
    playNoise(0.25, 600, 2, 0.18 * v, 0.01, 0.2, dest);
}

function sfxPlayerHurt() {
    if (!sfxCtx) return;
    // Harsh, urgent impact
    playTone('sawtooth', 250, 100, 0.15, 0.3, 0.003, 0.12);
    playTone('square', 120, 50, 0.2, 0.2, 0.005, 0.18);
    playNoise(0.12, 1500, 3, 0.25, 0.003, 0.1);
}

function sfxDodge() {
    if (!sfxCtx) return;
    // Quick arcane whoosh — rising then falling
    playTone('sine', 300, 800, 0.08, 0.2, 0.005, 0.08);
    playTone('sine', 800, 200, 0.12, 0.15, 0.005, 0.12);
    playNoise(0.15, 3000, 1.5, 0.12, 0.005, 0.12);
}

// ---- SKELETON-SPECIFIC SFX ----

function sfxSkeletonRoll() {
    if (!sfxCtx) return;
    // Rattling bone tumble — dry clatter + low thud
    playTone('square', 180, 80, 0.1, 0.12, 0.005, 0.1);
    playNoise(0.18, 1200, 4, 0.18, 0.005, 0.15);
    playTone('triangle', 100, 50, 0.12, 0.1, 0.01, 0.12);
}

function sfxSkeletonBoneThrow() {
    if (!sfxCtx) return;
    // Sharp crack + whistling arc
    playNoise(0.08, 3000, 5, 0.15, 0.002, 0.06);
    playTone('sawtooth', 600, 300, 0.12, 0.1, 0.005, 0.1);
}

// ---- LICH-SPECIFIC SFX ----

function sfxShadowStep() {
    if (!sfxCtx) return;
    // Dark ethereal whoosh — deep reverse reverb + high whisper
    playTone('sine', 100, 400, 0.2, 0.2, 0.005, 0.2);
    playTone('sine', 600, 200, 0.15, 0.12, 0.01, 0.15);
    playNoise(0.2, 800, 6, 0.1, 0.01, 0.18);
    // Ghost whisper tail
    playTone('triangle', 1200, 400, 0.3, 0.06, 0.05, 0.3);
}

function sfxLichSoulBolt() {
    if (!sfxCtx) return;
    // Haunting pulse — low drone + spectral crackle
    playTone('sine', 150, 300, 0.15, 0.18, 0.005, 0.15);
    playTone('sawtooth', 500, 800, 0.1, 0.08, 0.003, 0.1);
    playNoise(0.1, 1800, 3, 0.12, 0.005, 0.08);
}

function sfxLevelUp() {
    if (!sfxCtx) return;
    // Triumphant ascending chime — three-note arpeggio
    playTone('sine', 523, 523, 0.15, 0.2, 0.005, 0.15); // C5
    setTimeout(() => { if (sfxCtx) playTone('sine', 659, 659, 0.15, 0.2, 0.005, 0.15); }, 80); // E5
    setTimeout(() => { if (sfxCtx) playTone('sine', 784, 784, 0.25, 0.25, 0.005, 0.25); }, 160); // G5
    setTimeout(() => { if (sfxCtx) playTone('triangle', 1047, 1047, 0.3, 0.15, 0.005, 0.3); }, 240); // C6
}

// ---- SLIME-SPECIFIC SFX ----

function sfxSlimeAcidSpit() {
    if (!sfxCtx) return;
    // Wet splat spit — low frequency bubble pop + filtered noise
    playTone('sine', 120, 60, 0.12, 0.22, 0.005, 0.12);
    playTone('sine', 280, 150, 0.08, 0.15, 0.003, 0.08);
    playNoise(0.1, 600, 3, 0.18, 0.005, 0.09);
    // Tiny high-freq pop for crispness
    playTone('square', 900, 300, 0.04, 0.08, 0.002, 0.04);
}

function sfxSlimeBounce() {
    if (!sfxCtx) return;
    // Elastic spring bounce — rising rubbery tone + squish noise
    playTone('sine', 80, 320, 0.18, 0.2, 0.01, 0.18);
    playTone('triangle', 160, 500, 0.12, 0.1, 0.005, 0.12);
    playNoise(0.08, 400, 5, 0.12, 0.005, 0.07);
}

function sfxSlimeLand() {
    if (!sfxCtx) return;
    // Wet heavy impact — deep thud + splat noise
    playTone('sine', 100, 40, 0.15, 0.3, 0.005, 0.15);
    playTone('sine', 60, 25, 0.2, 0.2, 0.01, 0.2);
    playNoise(0.12, 500, 2, 0.2, 0.005, 0.1);
    // Squelchy overtone
    playTone('square', 200, 80, 0.06, 0.1, 0.003, 0.06);
}

function sfxSlimeAbsorb() {
    if (!sfxCtx) return;
    // Wet slurp — rising then settling tone + bubbly noise
    playTone('sine', 80, 220, 0.2, 0.18, 0.01, 0.2);
    playTone('sine', 220, 100, 0.15, 0.12, 0.01, 0.15);
    playNoise(0.15, 700, 4, 0.12, 0.005, 0.12);
    // Bubbly high component
    playTone('triangle', 500, 300, 0.1, 0.06, 0.005, 0.1);
}

function sfxTowerShoot(row, col) {
    if (!sfxCtx) return;
    const v = sfxDistanceVol(row, col);
    if (v < 0.05) return;
    const pan = sfxPanValue(row, col);
    const dest = createPannedOutput(pan);
    playTone('sine', 800, 400, 0.1, 0.15 * v, 0.003, 0.1, dest);
    playTone('triangle', 1200, 600, 0.08, 0.1 * v, 0.003, 0.08, dest);
}

function sfxTowerSummon() {
    if (!sfxCtx) return;
    // Magical materializing — rising shimmer
    playTone('sine', 200, 800, 0.4, 0.2, 0.02, 0.35);
    playTone('triangle', 400, 1200, 0.35, 0.12, 0.03, 0.3);
    playTone('sine', 600, 1600, 0.3, 0.08, 0.05, 0.25);
    playNoise(0.3, 4000, 2, 0.08, 0.02, 0.25);
}

function sfxItemPickup() {
    if (!sfxCtx) return;
    // Bright ascending chime
    playTone('sine', 500, 500, 0.08, 0.2, 0.005, 0.08);
    playTone('sine', 750, 750, 0.08, 0.18, 0.005, 0.08);
    // Stagger the second note
    const now = sfxCtx.currentTime;
    const osc = sfxCtx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 1000;
    const g = sfxCtx.createGain();
    g.gain.setValueAtTime(0, now + 0.06);
    g.gain.linearRampToValueAtTime(0.15, now + 0.07);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    osc.connect(g);
    g.connect(sfxMasterGain);
    osc.start(now + 0.06);
    osc.stop(now + 0.25);
}

function sfxExplosion() {
    if (!sfxCtx || !canPlaySFX(2)) return;
    trackSFXChannel(0.4);
    // Big boom: low rumble + noise burst
    playTone('sine', 80, 30, 0.4, 0.35, 0.005, 0.35);
    playTone('sawtooth', 120, 40, 0.3, 0.2, 0.005, 0.25);
    playNoise(0.3, 400, 1, 0.3, 0.005, 0.25);
    playNoise(0.15, 2000, 2, 0.2, 0.003, 0.12);
}

function sfxArrowShoot(row, col) {
    if (!sfxCtx) return;
    const v = sfxDistanceVol(row, col);
    if (v < 0.05) return;
    const pan = sfxPanValue(row, col);
    const dest = createPannedOutput(pan);
    playTone('triangle', 600, 200, 0.1, 0.18 * v, 0.003, 0.08, dest);
    playNoise(0.12, 3500, 3, 0.12 * v, 0.003, 0.1, dest);
}

function sfxArrowHit() {
    if (!sfxCtx) return;
    // Thwack
    playTone('square', 200, 80, 0.06, 0.2, 0.003, 0.06);
    playNoise(0.05, 1500, 4, 0.15, 0.003, 0.04);
}

function sfxOrbitHit() {
    if (!sfxCtx) return;
    // Quick sizzle
    playTone('sine', 400, 200, 0.06, 0.12, 0.003, 0.06);
    playNoise(0.05, 2500, 3, 0.08, 0.003, 0.04);
}

function sfxThorns() {
    if (!sfxCtx) return;
    // Fiery retaliation snap
    playTone('sawtooth', 500, 250, 0.08, 0.15, 0.003, 0.07);
    playNoise(0.06, 1800, 3, 0.1, 0.003, 0.05);
}

function sfxChainLightning() {
    if (!sfxCtx) return;
    // Electric crackle
    playTone('sawtooth', 1000, 300, 0.12, 0.12, 0.003, 0.1);
    playNoise(0.1, 5000, 2, 0.15, 0.003, 0.08);
}

function sfxChestOpen() {
    if (!sfxCtx) return;
    // Latch click + rewarding sparkle
    playNoise(0.04, 1200, 4, 0.12, 0.002, 0.03);
    playTone('triangle', 600, 900, 0.2, 0.08, 0.01, 0.15);
    setTimeout(() => {
        playTone('sine', 900, 1100, 0.15, 0.06, 0.01, 0.1);
    }, 80);
}

function sfxWaveStart() {
    if (!sfxCtx) return;
    // Ominous horn-like tone
    playTone('sawtooth', 100, 100, 0.5, 0.15, 0.05, 0.4);
    playTone('sine', 150, 150, 0.5, 0.12, 0.05, 0.4);
    playTone('triangle', 200, 200, 0.4, 0.08, 0.08, 0.35);
}

function sfxPlayerDeath() {
    if (!sfxCtx) return;
    // Heavy, dark death toll
    playTone('sine', 120, 40, 0.8, 0.3, 0.01, 0.7);
    playTone('sawtooth', 80, 30, 0.6, 0.15, 0.02, 0.5);
    playNoise(0.4, 300, 1, 0.15, 0.01, 0.35);
}

// ----- CINEMATIC SFX -----
function sfxCinematicHeartbeat() {
    if (!sfxCtx) return;
    // Deep, resonant double-thump heartbeat
    playTone('sine', 55, 35, 0.25, 0.3, 0.01, 0.2);
    setTimeout(() => {
        if (!sfxCtx) return;
        playTone('sine', 60, 38, 0.2, 0.25, 0.01, 0.18);
    }, 280);
}

function sfxCinematicStir() {
    if (!sfxCtx) return;
    // Bone-crack / stone scrape — gritty noise + low creak
    playNoise(0.3, 400, 3, 0.12, 0.01, 0.25);
    playTone('sawtooth', 80, 50, 0.35, 0.08, 0.02, 0.3);
    playNoise(0.15, 1200, 5, 0.06, 0.05, 0.12);
}

function sfxCinematicStand() {
    if (!sfxCtx) return;
    // Resonant magical tone — the wizard stands, power stirs
    playTone('sine', 220, 440, 0.6, 0.2, 0.05, 0.5);
    playTone('triangle', 330, 660, 0.5, 0.1, 0.08, 0.45);
    playTone('sine', 110, 165, 0.7, 0.12, 0.1, 0.6);
}

// ----- DEATH & HIT FEEDBACK -----
let gameDead = false;
let deathFadeTimer = 0;
let deathBtnRect = null;
let screenShakeTimer = 0;
let screenShakeIntensity = 0;
let hitPauseTimer = 0;
// Stacking caps for game feel
const MAX_SCREEN_SHAKE = 18;
const MAX_HIT_PAUSE = 0.15;
// Slow-mo system for big moments
let slowMoTimer = 0;
let slowMoScale = 1.0; // 1.0 = normal, 0.3 = slow
function addScreenShake(intensity, duration) {
    screenShakeIntensity = Math.min(MAX_SCREEN_SHAKE, screenShakeIntensity + intensity);
    screenShakeTimer = Math.max(screenShakeTimer, duration);
}
function addHitPause(duration) {
    hitPauseTimer = Math.min(MAX_HIT_PAUSE, hitPauseTimer + duration);
}
function addSlowMo(duration, scale) {
    slowMoTimer = Math.max(slowMoTimer, duration);
    slowMoScale = scale || 0.3;
}
let gamePaused = false;

// ----- LEVEL-UP SYSTEM -----
const xpState = {
    xp: 0,
    level: 1,
    xpToNext: 40,      // first level-up at 40 XP
    levelUpPending: false,
    levelUpChoices: [], // 3 upgrade options to show
    levelUpHover: -1,   // which choice is hovered (-1 = none)
    levelUpFadeIn: 0,   // animation timer
};

// XP per enemy type
const ENEMY_XP = { slime: 5, skeleton: 10, skelarch: 15, armoredskel: 30, werewolf: 200, slime_king: 100, bone_colossus: 150, infernal_knight: 250, frost_wyrm: 350, ruined_king: 500 };

// XP scaling: each level needs more
// Lv2: 40, Lv3: 68, Lv4: 102, Lv5: 142, Lv6: 188, Lv7: 240
function xpForLevel(lvl) { return Math.round(40 + (lvl - 1) * 25 + (lvl - 1) * (lvl - 1) * 3); }

// Upgrade state: tracks how many times each upgrade has been taken
const upgrades = {};

// ---- UPGRADE DEFINITIONS ----
const UPGRADE_POOL = [
    // === WAND MODIFIERS (layered onto fireball — still one click) ===
    {
        id: 'multishot',
        name: 'Split Bolt',
        desc: 'Fire +1 additional fireball per shot',
        icon: 'split',
        maxStack: 4,
        category: 'wand',
    },
    {
        id: 'pierce',
        name: 'Piercing Flame',
        desc: 'Fireballs pierce through +1 enemy',
        icon: 'pierce',
        maxStack: 5,
        category: 'wand',
    },
    {
        id: 'explode',
        name: 'Detonation',
        desc: 'Fireballs explode on impact, dealing 40% dmg in area',
        icon: 'explode',
        maxStack: 3,
        category: 'wand',
    },
    {
        id: 'firerate',
        name: 'Rapid Cast',
        desc: 'Attack 15% faster',
        icon: 'speed',
        maxStack: 5,
        category: 'wand',
    },
    {
        id: 'bigshot',
        name: 'Emberstorm',
        desc: 'Fireballs are 25% larger and deal +5 damage',
        icon: 'big',
        maxStack: 3,
        category: 'wand',
    },
    {
        id: 'bounce',
        name: 'Ricochet',
        desc: 'Fireballs bounce off walls once',
        icon: 'bounce',
        maxStack: 3,
        category: 'wand',
    },
    // === PASSIVE AURAS/EFFECTS ===
    {
        id: 'orbit',
        name: 'Arcane Orbit',
        desc: '+1 fireball orbits around you, damaging enemies',
        icon: 'orbit',
        maxStack: 4,
        category: 'passive',
    },
    {
        id: 'thorns',
        name: 'Thorns of Flame',
        desc: 'Enemies that hit you take 15 fire damage',
        icon: 'thorns',
        maxStack: 3,
        category: 'passive',
    },
    {
        id: 'regen',
        name: 'Siphon Life',
        desc: 'Regen 2 HP per kill',
        icon: 'regen',
        maxStack: 3,
        category: 'passive',
    },
    {
        id: 'manasurge',
        name: 'Mana Surge',
        desc: '+25% mana regeneration',
        icon: 'mana',
        maxStack: 4,
        category: 'passive',
    },
    {
        id: 'dodge_reset',
        name: 'Phase Flux',
        desc: 'Kills have 15% chance to reset dodge cooldown',
        icon: 'phase',
        maxStack: 3,
        category: 'passive',
    },
    // === TOWER UPGRADES ===
    {
        id: 'tower_extra',
        name: 'Twin Summon',
        desc: '+1 maximum active tower',
        icon: 'tower',
        maxStack: 2,
        category: 'tower',
    },
    {
        id: 'tower_chain',
        name: 'Chain Lightning',
        desc: 'Tower bolts chain to 1 nearby enemy for 50% damage',
        icon: 'chain',
        maxStack: 3,
        category: 'tower',
    },
    {
        id: 'tower_slow',
        name: 'Frost Obelisk',
        desc: 'Tower shots slow enemies by 30% for 2s',
        icon: 'slow',
        maxStack: 2,
        category: 'tower',
    },
];

let orbitAngle = 0;

// ----- PICKUP TEXTS -----
const pickupTexts = [];

// ----- MENU STATE -----
const menuEmbers = [];       // atmospheric floating particles
let menuTime = 0;            // animation timer
let menuHover = null;        // which button is hovered: 'start', 'controls', 'back', or null
let menuFadeAlpha = 0;       // for fade-in/out transitions
let preMenuAlpha = 0;        // fade-in for "click anywhere" pre-menu screen
let menuFadeDir = 1;         // 1 = fading in, -1 = fading out
let menuFadeTarget = null;   // gamePhase to switch to after fade-out

// Journal reading state
let journalOpen = false;
let journalPage = 0;         // which page is displayed (0-indexed)
let journalItemId = null;    // which key item's pages we're reading
let journalFadeIn = 0;

// Name entry state
let nameEntryAlpha = 0;
let nameEntryBlink = 0;
let nameInputEl = null; // reference to hidden input, set in init

// Load/save screen state
let loadScreenAlpha = 0;
let loadScreenHover = -1; // which save slot is hovered (0-2), -1 = none

// Initialize menu embers
function initMenuEmbers() {
    menuEmbers.length = 0;
    for (let i = 0; i < 60; i++) {
        menuEmbers.push({
            x: Math.random() * 1920,
            y: Math.random() * 1080,
            vx: (Math.random() - 0.5) * 12,
            vy: -Math.random() * 25 - 8,
            size: Math.random() * 2.5 + 0.5,
            life: Math.random(),
            maxLife: Math.random() * 4 + 3,
            brightness: Math.random(),
            flicker: Math.random() * 10,
        });
    }
}

// ============================================================
//  AMBIENT SOUNDSCAPES — Procedural per-zone atmospheric audio
// ============================================================
let ambientNodes = [];   // active audio nodes for current zone
let ambientZone = -1;    // which zone ambient is playing for

const AMBIENT_VOLUME = 0.12; // master ambient volume (subtle)

function stopAmbient() {
    if (!sfxCtx) { ambientNodes = []; ambientZone = -1; return; }
    for (const n of ambientNodes) {
        try { n.gain.gain.linearRampToValueAtTime(0, sfxCtx.currentTime + 0.5); } catch (_) {}
        try { setTimeout(() => { n.source.stop(); }, 600); } catch (_) {}
        // Stop extra oscillators (LFOs etc.)
        if (n.extras) {
            for (const ex of n.extras) { try { ex.stop(); } catch (_) {} }
        }
    }
    ambientNodes = [];
    ambientZone = -1;
}

function startAmbient(zone) {
    if (!sfxCtx) return;
    if (zone === ambientZone) return; // already playing
    stopAmbient();
    ambientZone = zone;

    if (zone === 0) {
        // Hamlet: gentle wind + distant thunder rumbles
        _ambientWind(0.08, 200, 600);
        _ambientThunder();
    } else if (zone === 1) {
        // Undercroft: cave drips + low stone hum
        _ambientDrips(0.6);
        _ambientDrone(65, 0.04, 'sine');
    } else if (zone === 2) {
        // Ruined Tower: wind through stone + creaks
        _ambientWind(0.06, 150, 400);
        _ambientCreaks();
    } else if (zone === 3) {
        // Spire: eerie tonal hum + occasional metallic resonance
        _ambientDrone(110, 0.05, 'triangle');
        _ambientDrone(165, 0.025, 'sine');
    } else if (zone === 4) {
        // Inferno: crackling fire + deep rumble
        _ambientFire(0.10);
        _ambientDrone(45, 0.06, 'sawtooth');
    } else if (zone === 5) {
        // Frozen Abyss: cold wind + ice crackle
        _ambientWind(0.07, 300, 900);
        _ambientIceCrackle();
    } else if (zone === 6) {
        // Throne of Ruin: ominous pulse + whispers
        _ambientDrone(55, 0.07, 'sine');
        _ambientPulse(0.8, 55);
    }
}

// --- Ambient building blocks ---

function _ambientWind(vol, freqLo, freqHi) {
    const buf = sfxCtx.createBuffer(1, sfxCtx.sampleRate * 4, sfxCtx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1);
    const src = sfxCtx.createBufferSource();
    src.buffer = buf; src.loop = true;
    const bp = sfxCtx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = (freqLo + freqHi) / 2; bp.Q.value = 0.5;
    const gain = sfxCtx.createGain();
    gain.gain.value = vol * AMBIENT_VOLUME;
    // Slow LFO to modulate filter frequency for wind variation
    const lfo = sfxCtx.createOscillator();
    const lfoGain = sfxCtx.createGain();
    lfo.frequency.value = 0.15; lfoGain.gain.value = (freqHi - freqLo) / 2;
    lfo.connect(lfoGain); lfoGain.connect(bp.frequency);
    lfo.start();
    src.connect(bp); bp.connect(gain); gain.connect(sfxMasterGain);
    src.start();
    ambientNodes.push({ source: src, gain: gain, extras: [lfo] });
}

function _ambientThunder() {
    let running = true;
    const thunderLoop = () => {
        if (!running || ambientZone !== 0) return;
        if (sfxCtx && sfxCtx.state === 'running') {
            const t = sfxCtx.currentTime;
            // Deep rumble burst
            const osc = sfxCtx.createOscillator();
            osc.type = 'sine'; osc.frequency.value = 40 + Math.random() * 20;
            const g = sfxCtx.createGain();
            g.gain.setValueAtTime(0, t);
            g.gain.linearRampToValueAtTime(0.05 * AMBIENT_VOLUME, t + 0.2);
            g.gain.linearRampToValueAtTime(0.02 * AMBIENT_VOLUME, t + 0.8);
            g.gain.linearRampToValueAtTime(0, t + 2.0);
            osc.connect(g); g.connect(sfxMasterGain);
            osc.start(t); osc.stop(t + 2.2);
        }
        setTimeout(thunderLoop, (8 + Math.random() * 12) * 1000);
    };
    setTimeout(thunderLoop, 3000);
    ambientNodes.push({ source: { stop() { running = false; } }, gain: sfxCtx.createGain() });
}

function _ambientDrips(interval) {
    // Schedule periodic drip sounds
    let running = true;
    const dripLoop = () => {
        if (!running || ambientZone !== 1) return;
        if (sfxCtx && sfxCtx.state === 'running') {
            const t = sfxCtx.currentTime;
            const osc = sfxCtx.createOscillator();
            const g = sfxCtx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(800 + Math.random() * 600, t);
            osc.frequency.exponentialRampToValueAtTime(200, t + 0.08);
            g.gain.setValueAtTime(0.03 * AMBIENT_VOLUME, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
            osc.connect(g); g.connect(sfxMasterGain);
            osc.start(t); osc.stop(t + 0.15);
        }
        setTimeout(dripLoop, (interval + Math.random() * interval) * 1000);
    };
    setTimeout(dripLoop, 500);
    // Dummy node for cleanup tracking
    const dummySrc = sfxCtx.createBufferSource();
    const dummyGain = sfxCtx.createGain(); dummyGain.gain.value = 0;
    dummySrc.connect(dummyGain);
    ambientNodes.push({ source: { stop() { running = false; } }, gain: dummyGain });
}

function _ambientDrone(freq, vol, type) {
    const osc = sfxCtx.createOscillator();
    osc.type = type; osc.frequency.value = freq;
    const gain = sfxCtx.createGain();
    gain.gain.value = vol * AMBIENT_VOLUME;
    osc.connect(gain); gain.connect(sfxMasterGain);
    osc.start();
    ambientNodes.push({ source: osc, gain: gain });
}

function _ambientCreaks() {
    let running = true;
    const creakLoop = () => {
        if (!running || ambientZone !== 2) return;
        if (sfxCtx && sfxCtx.state === 'running') {
            const t = sfxCtx.currentTime;
            const osc = sfxCtx.createOscillator();
            const g = sfxCtx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(60 + Math.random() * 40, t);
            osc.frequency.linearRampToValueAtTime(40 + Math.random() * 30, t + 0.3);
            g.gain.setValueAtTime(0.02 * AMBIENT_VOLUME, t);
            g.gain.linearRampToValueAtTime(0, t + 0.35);
            osc.connect(g); g.connect(sfxMasterGain);
            osc.start(t); osc.stop(t + 0.4);
        }
        setTimeout(creakLoop, (2 + Math.random() * 4) * 1000);
    };
    setTimeout(creakLoop, 1000);
    ambientNodes.push({ source: { stop() { running = false; } }, gain: sfxCtx.createGain() });
}

function _ambientFire(vol) {
    // Filtered noise that sounds like crackling fire
    const buf = sfxCtx.createBuffer(1, sfxCtx.sampleRate * 2, sfxCtx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (Math.random() > 0.7 ? 1 : 0.3);
    const src = sfxCtx.createBufferSource();
    src.buffer = buf; src.loop = true;
    const hp = sfxCtx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 1000; hp.Q.value = 0.3;
    const lp = sfxCtx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 4000;
    const gain = sfxCtx.createGain();
    gain.gain.value = vol * AMBIENT_VOLUME;
    src.connect(hp); hp.connect(lp); lp.connect(gain); gain.connect(sfxMasterGain);
    src.start();
    ambientNodes.push({ source: src, gain: gain });
}

function _ambientIceCrackle() {
    let running = true;
    const crackleLoop = () => {
        if (!running || ambientZone !== 5) return;
        if (sfxCtx && sfxCtx.state === 'running') {
            const t = sfxCtx.currentTime;
            // Sharp high-frequency crack
            const buf = sfxCtx.createBuffer(1, Math.floor(sfxCtx.sampleRate * 0.05), sfxCtx.sampleRate);
            const d = buf.getChannelData(0);
            for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
            const s = sfxCtx.createBufferSource();
            s.buffer = buf;
            const g = sfxCtx.createGain();
            g.gain.setValueAtTime(0.04 * AMBIENT_VOLUME, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
            s.connect(g); g.connect(sfxMasterGain);
            s.start(t);
        }
        setTimeout(crackleLoop, (1.5 + Math.random() * 3) * 1000);
    };
    setTimeout(crackleLoop, 800);
    ambientNodes.push({ source: { stop() { running = false; } }, gain: sfxCtx.createGain() });
}

function _ambientPulse(interval, freq) {
    let running = true;
    const pulseLoop = () => {
        if (!running || ambientZone !== 6) return;
        if (sfxCtx && sfxCtx.state === 'running') {
            const t = sfxCtx.currentTime;
            const osc = sfxCtx.createOscillator();
            osc.type = 'sine'; osc.frequency.value = freq;
            const g = sfxCtx.createGain();
            g.gain.setValueAtTime(0, t);
            g.gain.linearRampToValueAtTime(0.06 * AMBIENT_VOLUME, t + 0.3);
            g.gain.linearRampToValueAtTime(0, t + 0.8);
            osc.connect(g); g.connect(sfxMasterGain);
            osc.start(t); osc.stop(t + 1.0);
        }
        setTimeout(pulseLoop, interval * 1000);
    };
    setTimeout(pulseLoop, 200);
    ambientNodes.push({ source: { stop() { running = false; } }, gain: sfxCtx.createGain() });
}
