// Pooled particles — hit sparks, death bursts, dust.
// Noise-floor audit raised cap 300 → 420: high-proc combos (chain
// lightning + pyromancer + soul_burst all firing in the same frame
// during a 5-enemy room) plus the boss-clear cascade (~25 coin
// sparkles + kill ring + death bursts) regularly pushed past 300,
// causing the oldest particles (often the player's own crit sparks)
// to drop mid-animation. 420 covers the worst observed concurrency
// without measurable perf cost on modern browsers — each particle is
// a 9-field object, ~80 bytes total = ~33KB pool ceiling.
const MAX = 420;
const pool = [];
const live = [];

function alloc() {
  return pool.pop() || { x:0, y:0, vx:0, vy:0, life:0, maxLife:0, size:0, color:'#fff', alpha:1, grav:0, drag:1, kind:'dot' };
}

function emit(p) {
  if (live.length >= MAX) {
    const dead = live.shift();
    pool.push(dead);
  }
  live.push(p);
}

export function hitSpark(x, y, dirX, dirY, color = '#ffddaa') {
  for (let i = 0; i < 8; i++) {
    const p = alloc();
    const a = Math.atan2(dirY, dirX) + (Math.random() * 1.4 - 0.7);
    const s = 180 + Math.random() * 240;
    p.x = x; p.y = y;
    p.vx = Math.cos(a) * s; p.vy = Math.sin(a) * s;
    p.life = 0.28 + Math.random() * 0.12; p.maxLife = p.life;
    p.size = 2 + Math.random() * 2; p.color = color; p.alpha = 1;
    p.grav = 0; p.drag = 0.86; p.kind = 'dot';
    emit(p);
  }
}

export function deathBurst(x, y, color = '#4ad48a') {
  for (let i = 0; i < 18; i++) {
    const p = alloc();
    const a = Math.random() * Math.PI * 2;
    const s = 60 + Math.random() * 220;
    p.x = x; p.y = y;
    p.vx = Math.cos(a) * s; p.vy = Math.sin(a) * s - 60;
    p.life = 0.45 + Math.random() * 0.3; p.maxLife = p.life;
    p.size = 3 + Math.random() * 3; p.color = color; p.alpha = 1;
    p.grav = 280; p.drag = 0.9; p.kind = 'blob';
    emit(p);
  }
}

export function dashTrail(x, y, color = '#aa88ff') {
  const p = alloc();
  p.x = x; p.y = y;
  p.vx = 0; p.vy = 0;
  p.life = 0.35; p.maxLife = p.life;
  p.size = 14; p.color = color; p.alpha = 0.6;
  p.grav = 0; p.drag = 1; p.kind = 'ring';
  emit(p);
}

// Foot puff — small clustered dust particles under the hero's feet when walking.
// Grounds the hero in the floor. Biome-tinted so dust reads per environment.
export function footPuff(x, y, color = '#8a7a5a') {
  for (let i = 0; i < 3; i++) {
    const p = alloc();
    const a = (Math.random() - 0.5) * Math.PI * 0.6 + Math.PI;   // spread down-and-out
    const s = 12 + Math.random() * 14;
    p.x = x + (Math.random() - 0.5) * 4;
    p.y = y + (Math.random() - 0.5) * 2;
    p.vx = Math.cos(a) * s;
    p.vy = Math.sin(a) * s * 0.5 - 6;    // slight upward drift
    p.life = 0.35 + Math.random() * 0.15; p.maxLife = p.life;
    p.size = 1.5 + Math.random() * 1.5;
    p.color = color;
    p.alpha = 0.55;
    p.grav = 20;
    p.drag = 0.82;
    p.kind = 'dot';
    emit(p);
  }
}

// Landing burst — larger directional dust kick when hero ends a dodge. Hades
// sells dodges with these; adds weight to what otherwise reads as a glide.
export function landingBurst(x, y, dirX = 0, dirY = 0, color = '#9a8a6a') {
  // 8 dust particles fanning opposite to dodge direction
  const back = Math.atan2(-dirY, -dirX);
  for (let i = 0; i < 8; i++) {
    const p = alloc();
    const spread = (Math.random() - 0.5) * Math.PI * 0.9;
    const a = back + spread;
    const s = 90 + Math.random() * 140;
    p.x = x;
    p.y = y;
    p.vx = Math.cos(a) * s;
    p.vy = Math.sin(a) * s * 0.5 - 30;
    p.life = 0.4 + Math.random() * 0.3; p.maxLife = p.life;
    p.size = 2 + Math.random() * 2;
    p.color = color;
    p.alpha = 0.75;
    p.grav = 120;
    p.drag = 0.86;
    p.kind = 'blob';
    emit(p);
  }
}

// Kill ring — bigger, slower expanding shockwave on enemy death. Hades-style.
// Intensity 1 = normal, 2 = elite, 3 = boss (bigger + extra inner ring).
export function killRing(x, y, color = '#ffd27a', intensity = 1) {
  const sizeBase = intensity === 3 ? 48 : intensity === 2 ? 30 : 22;
  const lifeBase = intensity === 3 ? 0.6 : intensity === 2 ? 0.45 : 0.34;
  const p = alloc();
  p.x = x; p.y = y;
  p.vx = 0; p.vy = 0;
  p.life = lifeBase; p.maxLife = lifeBase;
  p.size = sizeBase; p.color = color; p.alpha = 0.78;
  p.grav = 0; p.drag = 1; p.kind = 'ring';
  emit(p);
  // Inner secondary ring for elite/boss — staggered start for "double-tap" feel
  if (intensity >= 2) {
    const q = alloc();
    q.x = x; q.y = y;
    q.vx = 0; q.vy = 0;
    q.life = lifeBase * 0.7; q.maxLife = lifeBase * 0.7;
    q.size = sizeBase * 0.55; q.color = color; q.alpha = 0.5;
    q.grav = 0; q.drag = 1; q.kind = 'ring';
    emit(q);
  }
}

// Blood drip — used by wounded enemies. 1-2 dark-red droplets falling
// downward with gravity, leaving a visual cue that an enemy is badly hurt.
// Intensity 1 = single drip (moderate wound), 2 = multi-drip (critical).
export function bloodDrip(x, y, intensity = 1, color = '#8a1a26') {
  const count = intensity === 2 ? 3 : 1;
  for (let i = 0; i < count; i++) {
    const p = alloc();
    p.x = x + (Math.random() - 0.5) * 10;
    p.y = y + (Math.random() - 0.5) * 4;
    p.vx = (Math.random() - 0.5) * 18;
    p.vy = 30 + Math.random() * 40;
    p.life = 0.7 + Math.random() * 0.5; p.maxLife = p.life;
    p.size = 2 + Math.random() * 1.5;
    p.color = color; p.alpha = 0.95;
    p.grav = 380; p.drag = 0.92; p.kind = 'blob';
    emit(p);
  }
}

// Sparkle — used in sanctuary rooms / pickup flashes. Small drifting glints.
export function sparkle(x, y, color = '#f4d9a0') {
  const p = alloc();
  const a = Math.random() * Math.PI * 2;
  const s = 6 + Math.random() * 18;
  p.x = x + (Math.random() - 0.5) * 6;
  p.y = y + (Math.random() - 0.5) * 6;
  p.vx = Math.cos(a) * s; p.vy = Math.sin(a) * s - 14;
  p.life = 0.8 + Math.random() * 0.7; p.maxLife = p.life;
  p.size = 1.5 + Math.random() * 1.5;
  p.color = color; p.alpha = 0.9;
  p.grav = 10; p.drag = 0.94; p.kind = 'dot';
  emit(p);
}

// Ambient dust motes — long-lived drifting particles for atmosphere.
// Updated per tick and auto-respawned near camera when they expire.
// Biome-aware: color + motion changes with the active biome.
//
// Counts + alphas were tuned down (DUST_COUNT 36 → 22; alpha values
// reduced ~30%) after the playable-rect mask landed: with dust now
// hidden inside the room, the entire population renders in the void
// edges around the walls. At the previous density that made the void
// itself feel busy, and dust at low alpha against the dark void was
// reading as faint greenish optical-illusion dots through screenshot
// JPEG compression. Quieter atmospheric depth in the void; cleaner
// visual frame around the playable area.
const DUST_COUNT = 22;
const dust = [];
let dustInit = false;
let dustBiome = 'vault';

// Per-biome dust style — tuned for atmosphere
const DUST_STYLES = {
  crypt:   { color: [170, 220, 255], vyMin: -4,  vyRng: 6,  drift: 3,  sizeBase: 0.7, sizeRng: 1.0, alpha: 0.18, glow: false },
  vault:   { color: [255, 220, 180], vyMin: -8,  vyRng: 10, drift: 4,  sizeBase: 0.8, sizeRng: 1.2, alpha: 0.22, glow: false },
  abyss:   { color: [255, 120, 80],  vyMin: -14, vyRng: 14, drift: 6,  sizeBase: 1.0, sizeRng: 1.4, alpha: 0.26, glow: true },
  inferno: { color: [255, 90, 40],   vyMin: -22, vyRng: 22, drift: 10, sizeBase: 1.2, sizeRng: 1.6, alpha: 0.38, glow: true },
};

export function setDustBiome(id) {
  if (DUST_STYLES[id]) dustBiome = id;
}

function respawnDust(d, cameraX, cameraY) {
  const st = DUST_STYLES[dustBiome] || DUST_STYLES.vault;
  d.x = cameraX + (Math.random() * 1600 - 800);
  d.y = cameraY + (Math.random() * 900 - 450);
  d.vx = (Math.random() * 2 - 1) * st.drift;
  d.vy = st.vyMin - Math.random() * st.vyRng;
  d.life = 3 + Math.random() * 3;
  d.maxLife = d.life;
  d.size = st.sizeBase + Math.random() * st.sizeRng;
  d.phase = Math.random() * Math.PI * 2;
  d.jitter = dustBiome === 'inferno' ? 1.0 : dustBiome === 'abyss' ? 0.5 : 0.1;
}

export function updateDust(dt, cameraX, cameraY) {
  if (!dustInit) {
    for (let i = 0; i < DUST_COUNT; i++) {
      const d = {};
      respawnDust(d, cameraX, cameraY);
      // Start at random lifetime so they don't all respawn at once
      d.life = Math.random() * d.maxLife;
      dust.push(d);
    }
    dustInit = true;
  }
  const st = DUST_STYLES[dustBiome] || DUST_STYLES.vault;
  for (const d of dust) {
    const driftAmp = st.drift * 0.8;
    d.x += d.vx * dt + Math.sin(d.phase + d.life * 2) * driftAmp * dt;
    d.y += d.vy * dt;
    // Ember jitter for inferno — makes embers flicker upward in bursts
    if (d.jitter) {
      d.vy += (Math.random() - 0.5) * 12 * d.jitter * dt * 60 * dt;
      d.vx += (Math.random() - 0.5) * 8 * d.jitter * dt * 60 * dt;
    }
    d.life -= dt;
    if (d.life <= 0) respawnDust(d, cameraX, cameraY);
  }
}

// Draw dust. Optional `maskRect` defines a rectangle inside which
// particles render at `maskAlphaInside` instead of full alpha — used to
// fade ambient motes out of the playable dungeon space during combat.
// No mask = render everywhere (default). maskAlphaInside: 1 = full
// (visible), 0 = invisible. Smooth fade transitions are driven by the
// caller lerping maskAlphaInside between 0 and 1 frame-by-frame.
export function drawDust(ctx, maskRect = null, maskAlphaInside = 1) {
  const st = DUST_STYLES[dustBiome] || DUST_STYLES.vault;
  const [r, g, b] = st.color;
  const hasMask = !!(maskRect
    && Number.isFinite(maskRect.left) && Number.isFinite(maskRect.right)
    && Number.isFinite(maskRect.top)  && Number.isFinite(maskRect.bottom));
  const inMask = hasMask
    ? (x, y) => x >= maskRect.left && x <= maskRect.right && y >= maskRect.top && y <= maskRect.bottom
    : () => false;
  const insideMul = Math.max(0, Math.min(1, maskAlphaInside));
  // Glow pass (inferno/abyss) — additive-style bloom via white composite
  if (st.glow) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const d of dust) {
      const mul = inMask(d.x, d.y) ? insideMul : 1;
      if (mul <= 0.005) continue;
      const t = d.life / d.maxLife;
      const fade = Math.min(t, 1 - t) * 2;
      const a = Math.max(0, Math.min(st.alpha, fade * st.alpha)) * 0.6 * mul;
      if (a <= 0.005) continue;
      ctx.fillStyle = `rgba(${r},${g},${b},${a.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.size * 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  for (const d of dust) {
    const mul = inMask(d.x, d.y) ? insideMul : 1;
    if (mul <= 0.005) continue;
    const t = d.life / d.maxLife;
    const fade = Math.min(t, 1 - t) * 2;
    const a = Math.max(0, Math.min(st.alpha, fade * st.alpha)) * mul;
    if (a <= 0.005) continue;
    ctx.fillStyle = `rgba(${r},${g},${b},${a.toFixed(3)})`;
    ctx.fillRect(d.x, d.y, d.size, d.size);
  }
}

// ============================================================================
// BIOME WEATHER — larger, more dramatic ambient particles layered on top of
// dust. Each biome has its own character:
//   crypt    → falling ice motes (cold, slow drift down)
//   vault    → warm dust motes (diagonal drift)
//   abyss    → rising ember sparks (purple-crimson, flickering up)
//   inferno  → falling ash + occasional rising spark (orange mixed)
// Far more visible than dust; sells "this floor feels different."
// ============================================================================
const WEATHER_COUNT = 26;
const weather = [];
let weatherInit = false;
let weatherBiome = 'vault';

// Lateral drift values are LATERAL SWAY VELOCITY peaks (px/s). Originally
// tuned at 14-22, but those values produced visibly meandering particles
// that wandered side-to-side as much as they fell — reading as "drunk
// mosquito" rather than "atmospheric drift." Especially bad in vault
// (slow 8-18 px/s fall + 22 px/s sway = particle nearly horizontal).
// Combined with the 4.8 s sine period, that produced visible direction
// reversals every ~2.4 s — the "janky at times" symptom in playtest.
// Halved to ~30-50% of fall speed: particles read as "wind catches them"
// rather than "actively swinging." Oscillation frequency also slowed
// from 1.3 to 0.7 in updateWeather (period 4.8 s → 9 s), so reversals
// are gentler S-curves rather than sharp zigzags.
const WEATHER_STYLES = {
  crypt: {
    color: [200, 230, 255],       // pale ice blue
    fallDir: 1,                    // +1 = down, -1 = up
    speed: 16, speedRng: 12,
    drift: 9,
    sizeBase: 1.5, sizeRng: 1.8,
    alpha: 0.55,
    glow: true,
    life: 8, lifeRng: 5,
  },
  vault: {
    color: [245, 215, 160],       // warm gold dust
    fallDir: 1,
    speed: 8, speedRng: 10,
    drift: 6,
    sizeBase: 1.2, sizeRng: 1.2,
    alpha: 0.4,
    glow: false,
    life: 10, lifeRng: 6,
  },
  abyss: {
    color: [220, 120, 200],       // purple-magenta embers
    fallDir: -1,                   // rise
    speed: 14, speedRng: 14,
    drift: 8,
    sizeBase: 1.6, sizeRng: 1.8,
    alpha: 0.62,
    glow: true,
    life: 7, lifeRng: 4,
  },
  inferno: {
    color: [255, 160, 80],        // orange ash
    fallDir: 1,                    // falling — like ash from above
    speed: 20, speedRng: 18,
    drift: 7,
    sizeBase: 1.8, sizeRng: 2.0,
    alpha: 0.62,
    glow: true,
    life: 6, lifeRng: 4,
    // Some particles rise (embers) — 30% chance
    riseChance: 0.3,
  },
};

export function setWeatherBiome(id) {
  if (WEATHER_STYLES[id]) weatherBiome = id;
}

function respawnWeather(w, cameraX, cameraY) {
  const st = WEATHER_STYLES[weatherBiome] || WEATHER_STYLES.vault;
  // Spawn near the camera, off-screen on the leading edge for the biome's drift
  const screenW = 1280, screenH = 720;
  w.x = cameraX - screenW / 2 + Math.random() * screenW;
  // Spawn on the opposite side from which they drift, so they travel across
  if (st.fallDir > 0 && !w.rising) {
    w.y = cameraY - screenH / 2 - 20 + Math.random() * 40;
  } else {
    w.y = cameraY + screenH / 2 - 40 + Math.random() * 60;
  }
  const baseSpeed = st.speed + Math.random() * st.speedRng;
  w.rising = st.riseChance && Math.random() < st.riseChance;
  w.vy = (w.rising ? -1 : st.fallDir) * baseSpeed;
  w.vx = (Math.random() - 0.5) * 8;
  w.size = st.sizeBase + Math.random() * st.sizeRng;
  w.life = st.life + Math.random() * st.lifeRng;
  w.maxLife = w.life;
  w.phase = Math.random() * Math.PI * 2;
  w.driftAmp = st.drift * (0.5 + Math.random() * 0.8);
}

export function updateWeather(dt, cameraX, cameraY) {
  if (!weatherInit) {
    for (let i = 0; i < WEATHER_COUNT; i++) {
      const w = {};
      respawnWeather(w, cameraX, cameraY);
      w.life = Math.random() * w.maxLife;   // desync on first init
      weather.push(w);
    }
    weatherInit = true;
  }
  for (const w of weather) {
    // Lateral drift via sine wave. Frequency multiplier 0.7 (was 1.3) —
    // period extended from 4.8 s to ~9 s so most particles complete only
    // ONE direction reversal over their 6-13 s lifetime instead of 2-3.
    // Reads as "particle gets caught by a slow gust" rather than "particle
    // visibly zigzagging."
    w.x += w.vx * dt + Math.sin(w.phase + w.life * 0.7) * w.driftAmp * dt;
    w.y += w.vy * dt;
    w.life -= dt;
    // Offscreen cull. Buffer (1100×640) is intentionally larger than the
    // 1280×720 design viewport so particles don't pop in/out at the
    // visible edge on widescreen monitors where the canvas can be wider
    // than the design width. Previous values (720×420) culled particles
    // that were still visible inside ultrawide viewports, which combined
    // with the fade-in alpha produced visible blink-out moments at the
    // screen edge.
    const offX = Math.abs(w.x - cameraX) > 1100;
    const offY = Math.abs(w.y - cameraY) > 640;
    if (w.life <= 0 || offX || offY) respawnWeather(w, cameraX, cameraY);
  }
}

// Draw weather. Mirrors drawDust's signature: optional `maskRect`
// defines a rectangle inside which particles render at maskAlphaInside
// instead of full alpha. Default maskAlphaInside = 0 preserves the
// "weather only outside the playable rect" behavior. Caller can lerp
// maskAlphaInside between 0 and 1 to crossfade weather in/out of the
// playable area as combat begins/ends.
//
// Format: maskRect = { left, top, right, bottom } in world-space pixels.
export function drawWeather(ctx, maskRect = null, maskAlphaInside = 0) {
  const st = WEATHER_STYLES[weatherBiome] || WEATHER_STYLES.vault;
  const [r, g, b] = st.color;
  const hasMask = !!(maskRect
    && Number.isFinite(maskRect.left) && Number.isFinite(maskRect.right)
    && Number.isFinite(maskRect.top)  && Number.isFinite(maskRect.bottom));
  const inMask = hasMask
    ? (x, y) => x >= maskRect.left && x <= maskRect.right && y >= maskRect.top && y <= maskRect.bottom
    : () => false;
  const insideMul = Math.max(0, Math.min(1, maskAlphaInside));
  // Additive glow pass for hot biomes
  if (st.glow) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const w of weather) {
      const mul = inMask(w.x, w.y) ? insideMul : 1;
      if (mul <= 0.005) continue;
      const t = w.life / w.maxLife;
      const fade = Math.min(t, 1 - t) * 2;
      const a = Math.max(0, Math.min(st.alpha, fade * st.alpha)) * 0.55 * mul;
      if (a <= 0.005) continue;
      ctx.fillStyle = `rgba(${r},${g},${b},${a.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(w.x, w.y, w.size * 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  // Solid core pass
  for (const w of weather) {
    const mul = inMask(w.x, w.y) ? insideMul : 1;
    if (mul <= 0.005) continue;
    const t = w.life / w.maxLife;
    const fade = Math.min(t, 1 - t) * 2;
    const a = Math.max(0, Math.min(st.alpha, fade * st.alpha)) * mul;
    if (a <= 0.005) continue;
    ctx.fillStyle = `rgba(${r},${g},${b},${a.toFixed(3)})`;
    ctx.fillRect(w.x, w.y, w.size, w.size);
  }
}

// ============================================================================
// AMBIENT CREATURES — small silhouettes that drift across rooms occasionally.
// Bats dart, ravens glide, moths flutter. Purely cosmetic; makes the world
// feel inhabited by things other than the hero and its enemies.
// ============================================================================
const creatures = [];
let _creatureSpawnT = 0;

export function updateAmbientCreatures(dt, cameraX, cameraY) {
  _creatureSpawnT -= dt;
  if (_creatureSpawnT <= 0) {
    _creatureSpawnT = 18 + Math.random() * 32;     // next spawn in 18-50s
    spawnAmbientCreature(cameraX, cameraY);
  }
  for (let i = creatures.length - 1; i >= 0; i--) {
    const c = creatures[i];
    c.life -= dt;
    c.t += dt;
    // Bats/moths flutter with sine; ravens glide steady
    if (c.kind === 'bat' || c.kind === 'moth') {
      c.y += Math.sin(c.t * c.flutterF) * c.flutterA * dt;
    }
    c.x += c.vx * dt;
    c.y += c.vy * dt;
    if (c.life <= 0) creatures.splice(i, 1);
  }
}

function spawnAmbientCreature(cameraX, cameraY) {
  const kinds = ['bat', 'raven', 'moth'];
  const kind = kinds[(Math.random() * kinds.length) | 0];
  // Spawn just off the left or right edge of the visible area
  const fromLeft = Math.random() < 0.5;
  const x = fromLeft ? cameraX - 720 : cameraX + 720;
  const y = cameraY - 280 + Math.random() * 360;     // anywhere in mid-upper band
  const vx = (fromLeft ? 1 : -1) * (kind === 'raven' ? 110 : kind === 'bat' ? 180 : 60);
  const vy = kind === 'moth' ? (Math.random() - 0.5) * 20 : -8;
  creatures.push({
    kind, x, y, vx, vy,
    t: 0,
    life: 12,
    flutterF: kind === 'bat' ? 18 : 6,
    flutterA: kind === 'bat' ? 60 : 18,
    facing: fromLeft ? 1 : -1,
  });
}

export function drawAmbientCreatures(ctx) {
  for (const c of creatures) {
    // Silhouette — near-black with slight tint
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.translate(c.x, c.y);
    ctx.scale(c.facing, 1);
    if (c.kind === 'bat') {
      // 3 frames of wing flap via sine
      const wing = Math.sin(c.t * 18) * 0.5 + 0.5;
      ctx.fillStyle = '#0a0610';
      // Body
      ctx.fillRect(-2, -1, 4, 3);
      // Wings flap — tall when wing=1, flat when wing=0
      const wingH = 2 + wing * 4;
      ctx.beginPath();
      ctx.moveTo(-2, 0);
      ctx.lineTo(-10, -wingH);
      ctx.lineTo(-6, 1);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(2, 0);
      ctx.lineTo(10, -wingH);
      ctx.lineTo(6, 1);
      ctx.closePath();
      ctx.fill();
    } else if (c.kind === 'raven') {
      // Raven glides — body + stretched wings, barely flapping
      const wing = Math.sin(c.t * 4) * 0.3 + 0.7;
      ctx.fillStyle = '#0a0308';
      ctx.fillRect(-3, -1, 6, 3);
      ctx.beginPath();
      ctx.moveTo(-3, 0);
      ctx.lineTo(-14, -3 * wing);
      ctx.lineTo(-10, 1);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(3, 0);
      ctx.lineTo(14, -3 * wing);
      ctx.lineTo(10, 1);
      ctx.closePath();
      ctx.fill();
    } else if (c.kind === 'moth') {
      // Moth — tiny dot with fluttering wings
      const wing = Math.sin(c.t * 22) * 0.4 + 0.6;
      ctx.fillStyle = 'rgba(230, 210, 180, 0.6)';
      ctx.fillRect(-1, 0, 2, 2);
      ctx.beginPath();
      ctx.ellipse(-3, 0, 3, 1.5 * wing, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(3, 0, 3, 1.5 * wing, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

export function clearAmbientCreatures() {
  creatures.length = 0;
  _creatureSpawnT = 10 + Math.random() * 15;   // small delay after room load
}

export function updateParticles(dt) {
  for (let i = live.length - 1; i >= 0; i--) {
    const p = live[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= Math.pow(p.drag, dt * 60);
    p.vy *= Math.pow(p.drag, dt * 60);
    p.vy += p.grav * dt;
    p.life -= dt;
    if (p.life <= 0) {
      live.splice(i, 1);
      pool.push(p);
    }
  }
}

export function drawParticles(ctx) {
  for (const p of live) {
    const t = Math.max(0, p.life / p.maxLife);
    ctx.globalAlpha = p.alpha * t;
    ctx.fillStyle = p.color;
    if (p.kind === 'ring') {
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (2 - t), 0, Math.PI * 2);
      ctx.stroke();
    } else {
      const s = p.size * (p.kind === 'blob' ? (0.7 + t * 0.6) : 1);
      ctx.fillRect(p.x - s/2, p.y - s/2, s, s);
    }
  }
  ctx.globalAlpha = 1;
}
