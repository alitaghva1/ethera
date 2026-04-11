// ============================================================
//  MUSIC SYSTEM
// ============================================================
const MUSIC_BASE = 'assets/music/';
const MUSIC_TRACKS = {
    // Menu & ambient
    menu:       { path: 'Loops/mp3/29. Arcane Whispers.mp3',       vol: 0.40, loop: true  },
    // Cinematic awakening
    cinematic:  { path: 'Loops/mp3/7. Chant of the Fallen.mp3',    vol: 0.50, loop: true  },
    // Combat per wave (escalating intensity)
    combat1:    { path: 'Loops/mp3/1. Dawn of Blades.mp3',         vol: 0.50, loop: true  },
    combat2:    { path: 'Loops/mp3/15. Legends of the Flame.mp3',  vol: 0.50, loop: true  },
    combat3:    { path: 'Loops/mp3/5. Riders of the Storm.mp3',    vol: 0.55, loop: true  },
    combat4:    { path: 'Loops/mp3/24. Blood and Honor.mp3',       vol: 0.55, loop: true  },
    // Death
    death:      { path: 'Tracks/mp3/27. The Broken Crown.mp3',     vol: 0.45, loop: false },
    // Victory
    victory:    { path: 'Tracks/mp3/17. Hymn of Valor.mp3',        vol: 0.50, loop: false },
    // Stings (short FX)
    waveCleared:{ path: 'Tracks/mp3/Fx 1.mp3',                     vol: 0.35, loop: false },
    levelUp:    { path: 'Tracks/mp3/Fx 2.mp3',                     vol: 0.40, loop: false },

    // --- Zone-specific tracks ---
    // Zone 0 (Hamlet)
    hamlet:         { path: 'Loops/mp3/4. Ballad of Ashenwood.mp3',     vol: 0.45, loop: true  },
    hamlet2:        { path: 'Loops/mp3/9. The Old Tavern.mp3',          vol: 0.45, loop: true  },
    // Zone 2 combat
    zone2_combat1:  { path: 'Loops/mp3/2. Echoes of the Keep.mp3',     vol: 0.50, loop: true  },
    zone2_combat2:  { path: 'Loops/mp3/12. March of Iron.mp3',         vol: 0.50, loop: true  },
    // Zone 3
    zone3_combat1:  { path: 'Loops/mp3/3. Twilight March.mp3',         vol: 0.50, loop: true  },
    zone3_explore:  { path: 'Loops/mp3/13. The Forgotten Grove.mp3',   vol: 0.45, loop: true  },
    // Zone 4
    zone4_combat1:  { path: 'Loops/mp3/18. The Dark Moor.mp3',        vol: 0.50, loop: true  },
    zone4_explore:  { path: 'Loops/mp3/16. Silent Citadel.mp3',       vol: 0.45, loop: true  },
    // Zone 5
    zone5_combat1:  { path: 'Loops/mp3/8. Frostbound Path.mp3',       vol: 0.50, loop: true  },
    zone5_explore:  { path: 'Loops/mp3/11. Whispers in the Fog.mp3',  vol: 0.45, loop: true  },
    // Zone 6
    zone6_combat1:  { path: 'Loops/mp3/10. Crown of Thorns.mp3',      vol: 0.55, loop: true  },
    zone6_combat2:  { path: 'Loops/mp3/19. Call of the Raven.mp3',     vol: 0.55, loop: true  },
    // Boss & special
    boss_final:     { path: 'Loops/mp3/20. Lament of Kings.mp3',      vol: 0.55, loop: true  },
    evolution:      { path: 'Loops/mp3/14. Sacred Springs.mp3',        vol: 0.50, loop: true  },
    endless_deep:   { path: 'Loops/mp3/26. Echoes of Eternity.mp3',   vol: 0.50, loop: true  },
    secret:         { path: 'Loops/mp3/30. The Hidden Glade.mp3',     vol: 0.45, loop: false },
};

// Combat tracks for each zone — per-zone identity via dedicated tracks
const WAVE_MUSIC = ['combat1', 'combat2', 'combat3', 'combat4'];
const ZONE2_WAVE_MUSIC = ['zone2_combat1', 'zone2_combat2', 'combat3', 'combat4'];
const ZONE3_WAVE_MUSIC = ['zone3_combat1', 'combat2', 'zone3_combat1', 'combat3'];
const ZONE4_WAVE_MUSIC = ['zone4_combat1', 'combat3', 'zone4_combat1', 'combat4'];
const ZONE5_WAVE_MUSIC = ['zone5_combat1', 'zone5_combat1', 'combat3', 'combat4'];
const ZONE6_WAVE_MUSIC = ['zone6_combat1', 'zone6_combat2', 'zone6_combat1', 'combat4'];

// Boss-specific music assignments — override normal wave music rotation
const BOSS_MUSIC = {
    slime_king: 'combat2',
    bone_colossus: 'combat3',
    infernal_knight: 'combat4',
    frost_wyrm: 'combat1',
    ruined_king: 'boss_final',
};

// Audio engine state
const music = {
    channels: [null, null],   // two Audio channels for crossfading
    activeChannel: 0,         // which channel is currently playing
    currentTrack: null,       // track ID currently playing
    masterVolume: 0.6,        // overall music volume (0-1)
    channelVolume: [0, 0],    // current volume per channel
    targetVolume: [0, 0],     // target volume per channel
    fadeSpeed: [1.5, 1.5],    // fade speed per channel (vol/sec)
    ducking: false,           // true when ducking for level-up
    duckVolume: 1.0,          // duck multiplier (0-1)
    duckTarget: 1.0,
    stingAudio: null,         // separate channel for one-shot stings
    initialized: false,       // requires user interaction to init
};

function initMusic() {
    if (music.initialized) return;
    music.channels[0] = new Audio();
    music.channels[1] = new Audio();
    music.channels[0].preload = 'auto';
    music.channels[1].preload = 'auto';
    music.stingAudio = new Audio();
    music.stingAudio.preload = 'auto';
    music.initialized = true;
    // Preload critical tracks to avoid first-play stutter
    const preloadTracks = ['cinematic', 'combat1', 'death'];
    for (const id of preloadTracks) {
        const def = MUSIC_TRACKS[id];
        if (def) {
            const preload = new Audio();
            preload.preload = 'auto';
            preload.src = MUSIC_BASE + def.path;
            preload.load();
        }
    }
}

// Play a music track with crossfade
function playMusic(trackId, fadeDuration) {
    if (!music.initialized) initMusic();
    if (trackId === music.currentTrack) return; // already playing

    const def = MUSIC_TRACKS[trackId];
    if (!def) return;

    fadeDuration = fadeDuration || 1.5;

    // Fade out the current channel
    const oldCh = music.activeChannel;
    music.targetVolume[oldCh] = 0;
    music.fadeSpeed[oldCh] = 1.0 / Math.max(0.1, fadeDuration);

    // Switch to the other channel
    const newCh = 1 - oldCh;
    music.activeChannel = newCh;
    music.currentTrack = trackId;

    const audio = music.channels[newCh];
    audio.src = MUSIC_BASE + def.path;
    audio.loop = def.loop;
    audio.volume = 0;
    music.channelVolume[newCh] = 0;
    music.targetVolume[newCh] = def.vol;
    music.fadeSpeed[newCh] = 1.0 / Math.max(0.1, fadeDuration);

    audio.play().catch(() => {}); // ignore autoplay errors
}

// Play a short sting (doesn't interrupt main music)
function playSting(trackId) {
    if (!music.initialized) initMusic();
    const def = MUSIC_TRACKS[trackId];
    if (!def) return;
    music.stingAudio.src = MUSIC_BASE + def.path;
    music.stingAudio.volume = def.vol * music.masterVolume;
    music.stingAudio.loop = false;
    music.stingAudio.play().catch(() => {});
}

// Stop all music (fade to silence)
function stopMusic(fadeDuration) {
    fadeDuration = fadeDuration || 1.0;
    music.targetVolume[0] = 0;
    music.targetVolume[1] = 0;
    music.fadeSpeed[0] = 1.0 / Math.max(0.1, fadeDuration);
    music.fadeSpeed[1] = 1.0 / Math.max(0.1, fadeDuration);
    music.currentTrack = null;
}

// Duck music volume (for level-up screen and cinematic transitions)
// NOTE: Callers must call duckMusic(false) to restore volume.
// Current callers:
//   - enemies.js line 1148: duckMusic(true) during calm phase in wave system
//   - enemies.js line 1171: duckMusic(false) when tension builds
//   - enemies.js line 2875: duckMusic(true) when level-up menu opens
//   - enemies.js line 2882: duckMusic(false) after upgrade selection
//   - enemies.js line 2856: duckMusic(false) after victory upgrade
//   - gameloop.js line 202: duckMusic(true) during cinematic SFX fade-in
//   - gameloop.js line 206: duckMusic(false) after cinematic SFX fades
//   - gameloop.js line 2105: duckMusic(false) on wave restart
function duckMusic(on) {
    music.duckTarget = on ? 0.25 : 1.0;
}

// Update music volumes each frame (call from gameLoop)
function updateMusic(dt) {
    if (!music.initialized) return;

    // Smooth duck
    if (music.duckVolume !== music.duckTarget) {
        const duckSpeed = 3.0;
        if (music.duckVolume < music.duckTarget) {
            music.duckVolume = Math.min(music.duckTarget, music.duckVolume + dt * duckSpeed);
        } else {
            music.duckVolume = Math.max(music.duckTarget, music.duckVolume - dt * duckSpeed);
        }
    }

    // Fade channels
    for (let i = 0; i < 2; i++) {
        const target = music.targetVolume[i];
        const speed = music.fadeSpeed[i];
        if (music.channelVolume[i] !== target) {
            if (music.channelVolume[i] < target) {
                music.channelVolume[i] = Math.min(target, music.channelVolume[i] + dt * speed);
            } else {
                music.channelVolume[i] = Math.max(target, music.channelVolume[i] - dt * speed);
            }
        }

        const ch = music.channels[i];
        if (ch) {
            const finalVol = music.channelVolume[i] * music.masterVolume * music.duckVolume;
            ch.volume = Math.max(0, Math.min(1, finalVol));

            // Stop audio when fully faded out to save resources
            if (music.channelVolume[i] <= 0 && !ch.paused && i !== music.activeChannel) {
                ch.pause();
            }
        }
    }
}

// Pause/resume music (for game pause)
function pauseMusic() {
    if (!music.initialized) return;
    for (const ch of music.channels) {
        if (ch && !ch.paused) ch.pause();
    }
}

function resumeMusic() {
    if (!music.initialized) return;
    const ch = music.channels[music.activeChannel];
    if (ch && ch.paused && music.currentTrack) {
        ch.play().catch(() => {});
    }
}

// Handle tab visibility changes — pause/resume audio
document.addEventListener('visibilitychange', function() {
    if (document.hidden) {
        // Pause music when tab is hidden
        if (typeof pauseMusic === 'function') pauseMusic();
    } else {
        // Resume when tab becomes visible
        if (typeof sfxCtx !== 'undefined' && sfxCtx && sfxCtx.state === 'suspended') {
            sfxCtx.resume();
        }
        if (typeof resumeMusic === 'function') resumeMusic();
    }
});
