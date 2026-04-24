// Pooled particles — hit sparks, death bursts, dust
const MAX = 300;
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
const DUST_COUNT = 36;
const dust = [];
let dustInit = false;
let dustBiome = 'vault';

// Per-biome dust style — tuned for atmosphere
const DUST_STYLES = {
  crypt:   { color: [170, 220, 255], vyMin: -4,  vyRng: 6,  drift: 3,  sizeBase: 0.7, sizeRng: 1.0, alpha: 0.28, glow: false },
  vault:   { color: [255, 220, 180], vyMin: -8,  vyRng: 10, drift: 4,  sizeBase: 0.8, sizeRng: 1.2, alpha: 0.32, glow: false },
  abyss:   { color: [255, 120, 80],  vyMin: -14, vyRng: 14, drift: 6,  sizeBase: 1.0, sizeRng: 1.4, alpha: 0.38, glow: true },
  inferno: { color: [255, 90, 40],   vyMin: -22, vyRng: 22, drift: 10, sizeBase: 1.2, sizeRng: 1.6, alpha: 0.55, glow: true },
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

export function drawDust(ctx) {
  const st = DUST_STYLES[dustBiome] || DUST_STYLES.vault;
  const [r, g, b] = st.color;
  // Glow pass (inferno/abyss) — additive-style bloom via white composite
  if (st.glow) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const d of dust) {
      const t = d.life / d.maxLife;
      const fade = Math.min(t, 1 - t) * 2;
      const a = Math.max(0, Math.min(st.alpha, fade * st.alpha)) * 0.6;
      if (a <= 0.005) continue;
      ctx.fillStyle = `rgba(${r},${g},${b},${a.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.size * 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  for (const d of dust) {
    const t = d.life / d.maxLife;
    const fade = Math.min(t, 1 - t) * 2;
    const a = Math.max(0, Math.min(st.alpha, fade * st.alpha));
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

const WEATHER_STYLES = {
  crypt: {
    color: [200, 230, 255],       // pale ice blue
    fallDir: 1,                    // +1 = down, -1 = up
    speed: 16, speedRng: 12,
    drift: 18,                     // lateral sway amplitude
    sizeBase: 1.5, sizeRng: 1.8,
    alpha: 0.55,
    glow: true,
    life: 8, lifeRng: 5,
  },
  vault: {
    color: [245, 215, 160],       // warm gold dust
    fallDir: 1,
    speed: 8, speedRng: 10,
    drift: 22,
    sizeBase: 1.2, sizeRng: 1.2,
    alpha: 0.4,
    glow: false,
    life: 10, lifeRng: 6,
  },
  abyss: {
    color: [220, 120, 200],       // purple-magenta embers
    fallDir: -1,                   // rise
    speed: 14, speedRng: 14,
    drift: 20,
    sizeBase: 1.6, sizeRng: 1.8,
    alpha: 0.62,
    glow: true,
    life: 7, lifeRng: 4,
  },
  inferno: {
    color: [255, 160, 80],        // orange ash
    fallDir: 1,                    // falling — like ash from above
    speed: 20, speedRng: 18,
    drift: 14,
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
    // Lateral drift via sine wave
    w.x += w.vx * dt + Math.sin(w.phase + w.life * 1.3) * w.driftAmp * dt;
    w.y += w.vy * dt;
    w.life -= dt;
    // Offscreen cull
    const offX = Math.abs(w.x - cameraX) > 720;
    const offY = Math.abs(w.y - cameraY) > 420;
    if (w.life <= 0 || offX || offY) respawnWeather(w, cameraX, cameraY);
  }
}

export function drawWeather(ctx) {
  const st = WEATHER_STYLES[weatherBiome] || WEATHER_STYLES.vault;
  const [r, g, b] = st.color;
  // Additive glow pass for hot biomes
  if (st.glow) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const w of weather) {
      const t = w.life / w.maxLife;
      const fade = Math.min(t, 1 - t) * 2;
      const a = Math.max(0, Math.min(st.alpha, fade * st.alpha)) * 0.55;
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
    const t = w.life / w.maxLife;
    const fade = Math.min(t, 1 - t) * 2;
    const a = Math.max(0, Math.min(st.alpha, fade * st.alpha));
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
