// Enemies — Tiny RPG sprites (100x100). Types now include melee, ranged, and
// explosive behaviors with attack telegraphs to make combat readable.
import { images } from './loader.js';
import { isWallAtWorld, spawnExtraFirePool } from './room.js';
import { deathBurst, hitSpark, sparkle, bloodDrip, killRing } from './particles.js';
import { playSfx } from './sfx.js';
import { shakeCamera, pulseZoom } from './camera.js';
import { damageHero, hero } from './hero.js';
import { spawnArrow, spawnOrb } from './projectiles.js';
import { dropGold } from './gold.js';
import { stats } from './stats.js';
import { spawnExplosion, spawnSoulBurst, etherealRegisterKill } from './synergies.js';
import { triggerScreenFlash } from './fx.js';

// ============================================================================
// ELITE AFFIXES — rolled on elite spawn (floors 2+). Each affix has a unique
// mechanic + a colored aura + a single-letter badge (not a text label).
// ============================================================================
export const ELITE_AFFIXES = {
  frost: {
    id: 'frost', badge: 'F',
    glow: 'rgba(120, 200, 255, ',
    auraColor: '#72c6ff',
    onHitHero: (_e) => { hero.slowTime = Math.max(hero.slowTime || 0, 0.7); hero.slowMul = 0.45; },
  },
  ember: {
    id: 'ember', badge: 'E',
    glow: 'rgba(255, 130, 70, ',
    auraColor: '#ff7a2a',
    trail: true,
    trailInterval: 0.22,
  },
  venom: {
    id: 'venom', badge: 'V',
    glow: 'rgba(120, 220, 120, ',
    auraColor: '#6ae08a',
    onHitHero: (_e) => { hero.poisonTime = Math.max(hero.poisonTime || 0, 4); hero.poisonRate = 0.5; },
  },
  warded: {
    id: 'warded', badge: 'W',
    glow: 'rgba(255, 220, 90, ',
    auraColor: '#ffd855',
    dmgReductionPct: 0.5,
    staggersToBreak: 2,
  },
};
const AFFIX_IDS = Object.keys(ELITE_AFFIXES);

// ---- Flame trail hazards spawned by ember elites ----
const _flames = [];
export function spawnEmberFlame(x, y) {
  _flames.push({ x, y, t: 0, life: 2.0, radius: 22 });
}
export function updateFlames(dt) {
  for (let i = _flames.length - 1; i >= 0; i--) {
    const f = _flames[i];
    f.t += dt;
    if (f.t >= f.life) { _flames.splice(i, 1); continue; }
    // Damage hero on contact (cooldown to prevent tick-spam)
    if (!hero._flameCD || hero._flameCD <= 0) {
      const dx = hero.x - f.x, dy = hero.y - f.y;
      if (dx*dx + dy*dy < (f.radius + 14) * (f.radius + 14) && hero.state !== 'dodge') {
        damageHero(1, f.x, f.y);
        hero._flameCD = 0.5;
      }
    }
  }
  if (hero._flameCD > 0) hero._flameCD -= dt;
}
export function drawFlames(ctx) {
  for (const f of _flames) {
    const t = f.t / f.life;
    const a = (1 - t) * 0.65;
    // Outer flicker halo
    const g = ctx.createRadialGradient(f.x, f.y, 4, f.x, f.y, f.radius + 6);
    g.addColorStop(0, 'rgba(255, 190, 100, ' + (a * 0.9).toFixed(3) + ')');
    g.addColorStop(0.6, 'rgba(255, 110, 50, ' + (a * 0.5).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(255, 60, 20, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(f.x - f.radius - 6, f.y - f.radius - 6, (f.radius + 6) * 2, (f.radius + 6) * 2);
    // Flicker core
    const jitter = Math.sin(f.t * 40) * 2;
    ctx.fillStyle = 'rgba(255, 220, 140, ' + (a * 0.9).toFixed(3) + ')';
    ctx.beginPath();
    ctx.arc(f.x + jitter, f.y, 5, 0, Math.PI * 2);
    ctx.fill();
  }
}
export function clearFlames() { _flames.length = 0; }

const SPR = 100;

// Behaviors:
//   melee   — chase, swing in arc-shaped hitbox
//   ranged  — keep distance, shoot projectiles
//   bomber  — charge fast, explode on contact OR death (AoE damage)
//
// Each melee enemy has:
//   attackReach  — how far the swing reaches from enemy center (matches telegraph)
//   attackArc    — how wide the swing arc is in radians (matches telegraph)
//   Hit detection uses BOTH distance and angle, so flanking matters.
export const TYPES = {
  slime:  {
    prefix: 'slime_',  drawSize: 80, radius: 18, speed: 95,  hp: 70,  damage: 1,
    color: '#6acc78', hitCD: 0.65, fps: 10, behavior: 'melee',
    attackReach: 42, attackArc: Math.PI * 0.42,
    windup: 0.25, swing: 0.22,
    telegraphColor: 'rgba(220, 80, 80, ',
    windupSfx: { key: 'slime_hit', rate: 0.75, volume: 0.4 },
    bloodColor: '#3a7a42',
    displayName: 'SLIME',
    flavor: 'what the ruin makes when it forgets what living was for',
  },
  skel:   {
    element: 'cold',                 // resists cold, weak to fire/shock
    prefix: 'skel_',   drawSize: 96, radius: 18, speed: 118, hp: 95,  damage: 1,
    color: '#cfd4d9', hitCD: 0.80, fps: 10, behavior: 'melee',
    attackReach: 54, attackArc: Math.PI * 0.48,
    windup: 0.28, swing: 0.22,
    telegraphColor: 'rgba(220, 60, 70, ',
    windupSfx: { key: 'footstep_0', rate: 1.7, volume: 0.55 },
    bloodColor: '#4a4038',             // skeletons leave dust and old bone-dark
    displayName: 'SKELETON',
    flavor: 'the dead who were promised rest, and given knives',
  },
  orc:    {
    // BALANCE PASS (sim: floor-1 boss p50 TTK was 2.7s — trivial).
    // Raised 150 → 200 for ~3.5s p50 TTK. Then bone_captain was also
    // bumped so floor 2 stays meaningfully tougher than floor 1.
    prefix: 'orc_',    drawSize: 100, radius: 20, speed: 80, hp: 200, damage: 2,
    color: '#7fa34a', hitCD: 0.92, fps: 8, behavior: 'melee',
    attackReach: 62, attackArc: Math.PI * 0.60,
    windup: 0.38, swing: 0.26,
    telegraphColor: 'rgba(210, 45, 55, ',
    displayName: 'WARCHIEF GRUDNOK',
    flavor: 'chieftain of the iron-bone clans',
    heavyChance: 0.30,
    heavyReach: 90, heavyArc: Math.PI * 0.85,
    heavyWindup: 0.70, heavySwing: 0.32,
    heavyDamage: 3,
    heavyColor: 'rgba(255, 140, 40, ',
    windupSfx: { key: 'hero_hurt', rate: 0.55, volume: 0.6 },
    heavyWindupSfx: { key: 'hero_hurt', rate: 0.38, volume: 0.85 },
  },
  archer: {
    prefix: 'archer_', drawSize: 96, radius: 16, speed: 100, hp: 60,  damage: 1,
    color: '#d8c7a8', attackRange: 420, hitCD: 1.0, fps: 10, behavior: 'ranged',
    windup: 0.36, swing: 0.20, preferDist: 220, minDist: 130,
    telegraphColor: 'rgba(220, 60, 70, ',
    windupSfx: { key: 'click', rate: 0.7, volume: 0.5 },
    displayName: 'ARCHER',
    flavor: 'chose the dark over starving. regrets neither.',
  },
  bomber: {
    prefix: 'slime_',  drawSize: 60, radius: 14, speed: 165, hp: 36,  damage: 2,
    color: '#ff9a5a', attackRange: 34, hitCD: 0.5, fps: 16, behavior: 'bomber',
    windup: 0.48, swing: 0.1, blastRadius: 92, blastDamage: 2,
    tintFilter: 'sepia(0.5) hue-rotate(-10deg) saturate(2.5)',
    windupSfx: { key: 'slime_hit', rate: 1.8, volume: 0.5 },
    bloodColor: '#c24a1a',
    displayName: 'BOMBER',
    flavor: 'a slime that learned ambition. it ends the same way.',
  },
  // ---- LANCER — charges in straight lines with a long telegraph ----
  // Keeps medium distance, then commits to a 380px linear charge that pierces.
  // Hero must sidestep the line, not dodge behind him.
  lancer: {
    prefix: 'lancer_', drawSize: 100, radius: 18, speed: 120, hp: 90, damage: 2,
    color: '#e8d4a0', hitCD: 1.3, fps: 10, behavior: 'lancer',
    chargeRange: 380,           // max charge distance
    chargeWidth: 36,              // line hitbox width
    chargeWindup: 0.60,
    chargeTravel: 0.28,            // time hero has to dodge once charge starts
    preferDist: 280, minDist: 180,
    telegraphColor: 'rgba(220, 200, 120, ',
    windupSfx: { key: 'footstep_0', rate: 0.85, volume: 0.55 },
    displayName: 'LANCER',
    flavor: 'rides the line. does not stop. will not turn.',
  },
  // ---- VANGUARD — armored melee with a frontal shield. Must be flanked. ----
  // Hits from the front ~140° arc get reduced by 82%. Shield has 4 HP; each
  // frontal hit costs 1 charge. Once depleted the unit is fully vulnerable.
  // Uses orc sprite with a cold steel tint + visible shield wedge.
  vanguard: {
    prefix: 'orc_',    drawSize: 100, radius: 20, speed: 70, hp: 120, damage: 2,
    color: '#a0b8d0', hitCD: 1.10, fps: 8, behavior: 'melee',
    attackReach: 66, attackArc: Math.PI * 0.62,
    windup: 0.50, swing: 0.28,
    telegraphColor: 'rgba(180, 200, 240, ',
    // Shield fields — read by takeDamage
    shieldCharges: 4,
    shieldArc: Math.PI * 0.78,      // front-facing arc that blocks (140°)
    shieldReduction: 0.82,           // 82% damage reduced when blocked
    tintFilter: 'hue-rotate(200deg) saturate(0.8) brightness(0.95)',
    windupSfx: { key: 'footstep_0', rate: 1.0, volume: 0.6 },
    displayName: 'VANGUARD',
    flavor: 'a shield that forgot its oath. still remembers its stance.',
  },
  // ---- REFLECTOR — caster with a front-facing mirror shield. Must be flanked.
  // Hybrid of wizard (casts orbs at distance) and vanguard (frontal damage
  // reduction). Creates a puzzle: dodge orbs while getting behind the mirror.
  reflector: {
    prefix: 'wiz_',    drawSize: 96, radius: 16, speed: 55, hp: 90, damage: 2,
    color: '#c8e0ff',  hitCD: 2.0, fps: 10, behavior: 'wizard',
    preferDist: 320, minDist: 220,
    castRange: 460, castWindup: 0.80, castCount: 1, castSpread: 0,
    telegraphColor: 'rgba(180, 220, 255, ',
    windupSfx: { key: 'click', rate: 0.4, volume: 0.55 },
    // Frontal mirror — reuses vanguard shield system
    shieldCharges: 3,
    shieldArc: Math.PI * 0.70,
    shieldReduction: 0.75,
    tintFilter: 'hue-rotate(-40deg) saturate(0.7) brightness(1.1)',
    element: 'shock',
    displayName: 'REFLECTOR',
    flavor: 'a mirror that asks the question: what will you do to be seen?',
  },
  // ---- WIZARD — backline caster. Homing orbs that track the hero. ----
  wizard: {
    element: 'shock',                // resists shock, weak to fire/cold
    prefix: 'wiz_',    drawSize: 96, radius: 16, speed: 60, hp: 70, damage: 2,
    color: '#b89cff', hitCD: 2.4, fps: 10, behavior: 'wizard',
    preferDist: 340, minDist: 240,
    castRange: 500,
    castWindup: 0.70,                // long, readable windup
    castCount: 2,                     // number of orbs fired per cast
    castSpread: 0.25,                  // radians between orbs
    telegraphColor: 'rgba(180, 140, 255, ',
    windupSfx: { key: 'click', rate: 0.4, volume: 0.6 },
    displayName: 'WIZARD',
    bloodColor: '#6a3aa0',             // deep arcane purple
    flavor: 'studied the old words. stayed when they asked too much.',
  },
  // ---- PRIEST — support caster. Avoids combat; heals nearby enemies. ----
  // Tinted cyan and moves slowly. Kill priority target — hero lives or dies
  // depending on whether she is prioritized fast.
  priest: {
    prefix: 'priest_', drawSize: 96, radius: 16, speed: 70, hp: 60, damage: 0,
    color: '#c8d4ff', hitCD: 2.2, fps: 10, behavior: 'priest',
    preferDist: 260, minDist: 180,
    healRange: 260,                // how far her heal reaches
    healAmount: 16,                // per tick
    healWindup: 0.55,
    healCD: 3.2,
    telegraphColor: 'rgba(140, 220, 180, ',
    windupSfx: { key: 'click', rate: 0.55, volume: 0.5 },
    displayName: 'PRIEST',
    bloodColor: '#c8c8ea',             // pale holy light — dissipates as dust
    flavor: 'heals the wrong side now. the old gods no longer check.',
  },
  // ---- Floor 2 boss: Bone Captain — armored skeleton with dash strike + summons ----
  // ---- ECHO OF SELF — a mini-boss haunting the player from their previous death.
  // Spawned by main.js at run start based on ruin.deaths. Uses orc sprite with
  // a ghostly blue filter. HP/damage scale with how loaded-out the past build was.
  echo: {
    prefix: 'orc_',    drawSize: 104, radius: 20, speed: 96, hp: 140, damage: 2,
    color: '#c8d8ff',  hitCD: 1.1, fps: 8, behavior: 'melee',
    attackReach: 68, attackArc: Math.PI * 0.66,
    windup: 0.42, swing: 0.26,
    telegraphColor: 'rgba(180, 200, 240, ',
    heavyChance: 0.35,
    heavyReach: 100, heavyArc: Math.PI * 0.88,
    heavyWindup: 0.72, heavySwing: 0.34,
    heavyDamage: 4,
    heavyColor: 'rgba(200, 220, 255, ',
    tintFilter: 'hue-rotate(190deg) saturate(1.3) brightness(1.3) contrast(1.1)',
    displayName: 'ECHO OF SELF',
    flavor: 'a ghost of who you were',
    windupSfx: { key: 'hero_hurt', rate: 0.7, volume: 0.5 },
    heavyWindupSfx: { key: 'hero_hurt', rate: 0.45, volume: 0.7 },
    bloodColor: '#6a8cc0',             // pale spectral blue — ectoplasm of a ghost
  },
  bone_captain: {
    // BALANCE PASS — paired with orc HP bump. 180 → 220 keeps floor-2
    // boss meaningfully tougher than floor-1 (660 → 858 effective HP
    // after 3x × 1.3 floor mul).
    prefix: 'bonecap_', drawSize: 108, radius: 22, speed: 115, hp: 220, damage: 2,
    color: '#cfd4d9', hitCD: 1.0, fps: 10, behavior: 'melee',
    attackReach: 72, attackArc: Math.PI * 0.52,
    windup: 0.40, swing: 0.24,
    telegraphColor: 'rgba(200, 220, 240, ',
    dashEvery: 3,
    dashSpeed: 580,
    dashWindup: 0.55,
    summonAt: [0.66, 0.33],
    enrageAt: 0.5, enrageSpeedMul: 1.3, enrageDamageMul: 1.4,
    windupSfx: { key: 'footstep_0', rate: 1.3, volume: 0.6 },
    displayName: 'THE IRON REVENANT',
    flavor: 'a king who refused to stay buried',
    bossTrack: 'boss',
  },
  // ---- Floor 3 boss: Broodmother — werebear with enrage + spawning bombers ----
  broodmother: {
    prefix: 'brood_',  drawSize: 134, radius: 28, speed: 58,  hp: 240, damage: 3,
    color: '#9a6b56', hitCD: 1.15, fps: 8, behavior: 'melee',
    attackReach: 86, attackArc: Math.PI * 0.70,
    windup: 0.55, swing: 0.32,
    telegraphColor: 'rgba(190, 100, 80, ',
    // Heavy smash variant (every 3rd swing)
    heavyChance: 0.38,
    heavyReach: 118, heavyArc: Math.PI * 0.95,
    heavyWindup: 0.90, heavySwing: 0.38,
    heavyDamage: 5,
    heavyColor: 'rgba(255, 120, 50, ',
    // Boss phases
    enrageAt: 0.5,                     // HP % below this -> enrage (perma)
    enrageSpeedMul: 1.45,
    enrageDamageMul: 1.3,
    bomberAt: [0.70, 0.40, 0.15],       // HP % thresholds that spawn a bomber
    windupSfx: { key: 'hero_hurt', rate: 0.42, volume: 0.8 },
    heavyWindupSfx: { key: 'hero_hurt', rate: 0.3, volume: 1.0 },
    displayName: 'THE BROODMOTHER',
    flavor: 'she who laid the first ruin',
    bossTrack: 'boss',
  },
  // ---- Floor 4 boss: EMBER TYRANT — heavily armored, fire-themed ----
  ember_tyrant: {
    element: 'fire',                 // resists fire, weak to cold/shock
    prefix: 'ember_',  drawSize: 118, radius: 24, speed: 82,  hp: 280, damage: 3,
    color: '#e85020', hitCD: 0.95, fps: 8, behavior: 'melee',
    attackReach: 78, attackArc: Math.PI * 0.62,
    windup: 0.42, swing: 0.28,
    telegraphColor: 'rgba(255, 140, 50, ',
    // Heavy swing variant
    heavyChance: 0.40,
    heavyReach: 104, heavyArc: Math.PI * 0.90,
    heavyWindup: 0.68, heavySwing: 0.34,
    heavyDamage: 4,
    heavyColor: 'rgba(255, 80, 30, ',
    // Boss phases — spawn bombers at thresholds + enrage
    enrageAt: 0.5,
    enrageSpeedMul: 1.35,
    enrageDamageMul: 1.25,
    bomberAt: [0.75, 0.50, 0.25],
    summonAt: [0.33],               // also summons an archer once
    windupSfx: { key: 'hero_hurt', rate: 0.42, volume: 0.9 },
    heavyWindupSfx: { key: 'hero_hurt', rate: 0.30, volume: 1.0 },
    tintFilter: 'hue-rotate(-18deg) saturate(1.4) brightness(1.05)',
    displayName: 'THE EMBER TYRANT',
    flavor: 'the wound at the heart of the world',
    bossTrack: 'boss',
  },

  // ==========================================================================
  // NEW ENEMIES (content pass B3) — ingested from third-party packs via
  // tools/ingest_enemy_pack.py. Each fills a specific design gap the audit
  // flagged (six melee-walk-swing duplicates = THIN enemy variety).
  // ==========================================================================

  // ---- WARDEN — slow executioner. Mini-boss-tier melee, heavy telegraphed
  // cleave, lower swing cadence than orc. Spawns in floor-2 event rooms as
  // the mini-boss variant (picked by floor.js makeMiniBossRoom).
  warden: {
    prefix: 'warden_',  drawSize: 110, radius: 22, speed: 65, hp: 140, damage: 2,
    color: '#8a8098',  hitCD: 1.15, fps: 8, behavior: 'melee',
    attackReach: 78, attackArc: Math.PI * 0.68,
    windup: 0.60, swing: 0.32,
    telegraphColor: 'rgba(200, 180, 255, ',
    heavyChance: 0.42,
    heavyReach: 116, heavyArc: Math.PI * 1.0,
    heavyWindup: 0.90, heavySwing: 0.42,
    heavyDamage: 3,
    heavyColor: 'rgba(255, 100, 80, ',
    windupSfx: { key: 'hero_hurt', rate: 0.50, volume: 0.65 },
    heavyWindupSfx: { key: 'hero_hurt', rate: 0.32, volume: 0.85 },
    bloodColor: '#5a4868',
    displayName: 'THE WARDEN',
    flavor: 'the executioner whose blade the ruin kept sharpened',
  },

  // ---- HERMIT — floor-4 mini-boss. Slow, imposing, keeps his distance and
  // unloads a wide triple-orb volley with long readable telegraphs. Rewards
  // patient play: close the gap during windup, back off during cast. Uses
  // the wizard sprite with a gold-amber tint so he reads as "other" from
  // both dreadmage and wizard in the same room.
  hermit: {
    element: 'shock',
    prefix: 'wiz_',      drawSize: 118, radius: 20, speed: 40, hp: 180, damage: 3,
    color: '#c9a86a',    hitCD: 2.4, fps: 8, behavior: 'wizard',
    preferDist: 420, minDist: 320,
    castRange: 520,
    castWindup: 1.10,                  // long telegraph — player gets a real read
    castCount: 3,
    castSpread: 0.42,                   // wide volley, forces positioning
    telegraphColor: 'rgba(201, 168, 106, ',
    windupSfx: { key: 'click', rate: 0.30, volume: 0.7 },
    tintFilter: 'sepia(0.55) hue-rotate(-15deg) saturate(1.4) brightness(0.9)',
    displayName: 'THE HERMIT',
    flavor: 'a lantern in every hollow; a question in every name',
    bloodColor: '#c9a86a',
  },

  // ---- DREAD-MAGE — tier-3 caster. Triple-orb volley with a tighter spread
  // than wizard, faster cast, slightly less HP. Priority kill target in
  // multi-caster comps (pair with priest or reflector).
  dreadmage: {
    element: 'shock',
    prefix: 'dreadmage_', drawSize: 102, radius: 16, speed: 72, hp: 95, damage: 2,
    color: '#b060ff',  hitCD: 2.1, fps: 10, behavior: 'wizard',
    preferDist: 340, minDist: 230,
    castRange: 500,
    castWindup: 0.62,                // faster than wizard (0.70)
    castCount: 3,                     // one more orb than wizard
    castSpread: 0.32,
    telegraphColor: 'rgba(180, 100, 255, ',
    windupSfx: { key: 'click', rate: 0.35, volume: 0.65 },
    displayName: 'DREAD-MAGE',
    bloodColor: '#7a3ac0',
    flavor: 'studied the old words until they answered back.',
  },

  // ---- HAUNT — aerial harasser. Ranged, moves over pillars (flies: true
  // can be read by room-collision code later; for now behaves like a fast
  // ranged enemy), lower HP, higher speed. Fills the "airborne threat"
  // design gap — nothing else in the roster hovers out of melee range.
  haunt: {
    prefix: 'haunt_',   drawSize: 86, radius: 14, speed: 130, hp: 55, damage: 1,
    color: '#ff8050', attackRange: 320, hitCD: 1.15, fps: 12, behavior: 'ranged',
    windup: 0.32, swing: 0.18, preferDist: 240, minDist: 160,
    telegraphColor: 'rgba(255, 100, 80, ',
    windupSfx: { key: 'click', rate: 1.35, volume: 0.5 },
    displayName: 'HAUNT',
    bloodColor: '#c8503a',
    flavor: 'a hunger with wings. it has time.',
    flies: true,                     // future-proof flag for airborne collision
  },
};

// ============================================================================
// CODEX — track which enemy types the player has encountered across all runs.
// The first time a new type is spawned, we emit a global hook the HUD can use
// to show a "bestiary entry" banner. Set persists across runs via localStorage.
// ============================================================================
const CODEX_KEY = 'ethera:seen_enemies:v1';
export const seenEnemyTypes = new Set();

// Codex persistence — safeLoadJSON imported from storage module.
// Inlined import because enemies.js doesn't import from storage elsewhere.
import { safeLoadJSON as _safeLoadJSON, safeSaveJSON as _safeSaveJSON } from './storage.js';

export function loadCodex() {
  const arr = _safeLoadJSON(CODEX_KEY, null, Array.isArray);
  if (arr) for (const id of arr) seenEnemyTypes.add(id);
}
function saveCodex() {
  _safeSaveJSON(CODEX_KEY, [...seenEnemyTypes]);
}

// Called from spawnEnemy. If this type has never been seen, mark it + queue
// the banner via a global hook (main.js owns the rendering). Bosses are shown
// by their own intro cinematic — they don't need a codex card on top.
function registerFirstEncounter(type, def, isBoss) {
  if (isBoss) return;                                // bosses get their own dramatic intro
  if (!def || !def.displayName || !def.flavor) return;
  if (seenEnemyTypes.has(type)) return;
  seenEnemyTypes.add(type);
  saveCodex();
  window.__pendingCodexEntry = {
    type,
    name: def.displayName,
    flavor: def.flavor,
    color: def.color || '#c0b090',
  };
}

// Play the windup SFX for a just-started attack. Picks the heavy variant for orc.
function playWindupSfx(e) {
  const cfg = (e._heavy && e.def.heavyWindupSfx) ? e.def.heavyWindupSfx : e.def.windupSfx;
  if (!cfg) return;
  playSfx(cfg.key, { rate: cfg.rate, rateJitter: 0.08, volume: cfg.volume });
}

export const enemies = [];

export function spawnEnemy(type, worldX, worldY, opts = {}) {
  const def = TYPES[type];
  if (!def) return;
  const elite = !!opts.elite;
  const boss = !!opts.boss;
  // First-encounter codex banner (skipped for bosses — they have cinematics)
  registerFirstEncounter(type, def, boss);

  // Scaling tiers: boss-elite > regular elite > normal
  let hpMul = 1, dmgMul = 1, sizeMul = 1, speedMul = 1;
  if (boss) {
    hpMul = 3; dmgMul = 2; sizeMul = 1.45; speedMul = 0.85;
  } else if (elite) {
    hpMul = 1.8; dmgMul = 1.4; sizeMul = 1.18; speedMul = 1.0;
  }

  // Per-floor + per-slot multipliers (supplied by floor.js spawn descriptors)
  if (opts.hpMul)       hpMul  *= opts.hpMul;
  if (opts.damageMul)   dmgMul *= opts.damageMul;
  if (opts.floorDmgMul) dmgMul *= opts.floorDmgMul;
  if (opts.floorHpMul)  hpMul  *= opts.floorHpMul;

  // ASCENSION — stack the tier's enemy-HP modifier on every spawn.
  // main.js exposes `__ascensionModifiers` to avoid an import cycle with
  // ascension.js; called here at spawn time so live tier changes apply.
  if (typeof window !== 'undefined' && window.__ascensionModifiers) {
    const am = window.__ascensionModifiers();
    if (am && am.enemyHpMul) hpMul *= am.enemyHpMul;
    // ASCENSION VIII — "The Counted": if the current floor has exceeded
    // its time limit, enemies gain a speed/damage multiplier for the
    // rest of the floor. Applied at spawn so enemies that pop mid-timeout
    // get the boost; enemies spawned before the timeout keep baseline.
    if (am && am.floorTimeLimitSec && typeof window.__floorStartTime === 'number') {
      const floorElapsed = (performance.now() - window.__floorStartTime) / 1000;
      if (floorElapsed > am.floorTimeLimitSec) {
        const mul = am.floorTimeoutEnemyMul || 1.4;
        hpMul *= mul;
        dmgMul *= mul;
      }
    }
  }

  // MEMORY OF NINE — the bargain is that bosses yield more easily (boss HP
  // −25%) but the world pushes back harder (normal enemy HP +40%). Read the
  // active memory via the window hook set at run start by main.js.
  if (typeof window !== 'undefined' && window.__activeMemory && window.__activeMemory.id === 'nine') {
    if (boss)       hpMul *= 0.75;
    else if (!elite) hpMul *= 1.40;
    // Elites sit at their normal scaling — Nine only reshapes the ends.
  }

  // Per-type elite flavor modifiers (on top of base elite scaling)
  let forceHeavy = false;
  let volleyCount = 1;
  let blastRadiusMul = 1;
  let splitOnDeath = false;
  if (elite && !boss) {
    if (type === 'skel')   speedMul *= 1.25;
    if (type === 'orc')    forceHeavy = true;
    if (type === 'archer') volleyCount = 3;
    if (type === 'bomber') { blastRadiusMul = 1.5; dmgMul *= 1.2; }
    if (type === 'slime')  splitOnDeath = true;
  }

  // Roll an affix for non-bomber elites (bombers are volatile enough already)
  let affix = null;
  if (elite && !boss && type !== 'bomber') {
    // Use explicit affix if requested, else roll random
    const pickedId = opts.affix || AFFIX_IDS[(Math.random() * AFFIX_IDS.length) | 0];
    affix = ELITE_AFFIXES[pickedId] || null;
  }

  enemies.push({
    type, def, elite, boss,
    affix,                          // elite affix config (or null)
    _trailT: 0,                     // ember trail spawn timer
    _staggerCount: 0,               // warded: track staggers for shield break
    _shieldBroken: false,           // warded: true after enough staggers
    x: worldX, y: worldY,
    facing: 1,
    radius: def.radius * (elite ? 1.20 : 1),
    hp: def.hp * hpMul, maxHp: def.hp * hpMul,
    damage: def.damage * dmgMul,
    speed: def.speed * speedMul,
    sizeMul,
    forceHeavy, volleyCount, blastRadiusMul, splitOnDeath,
    // Echo-of-Self carries past-death context for reclaim drops
    echoPastBuild: opts.echoPastBuild || null,
    echoCombo: opts.echoCombo || 0,
    state: 'idle',
    stateTime: 0,
    animTime: Math.random() * 1.0,
    hitFlash: 0,
    attackCD: 0.8 + Math.random() * 0.5,
    aimX: 1, aimY: 0,
    knockbackX: 0, knockbackY: 0,
    dead: false,
    removeTimer: 0,
    _swingHit: false,
    phase2Triggered: false,
    takeDamage(amount, dirX, dirY, opts = {}) {
      if (this.dead) return;
      // Warded affix: reduces incoming damage until enough staggers break it
      if (this.affix && this.affix.id === 'warded' && !this._shieldBroken) {
        amount *= (1 - this.affix.dmgReductionPct);
      }
      // ELEMENTAL WEAKNESS — damageType (fire/cold/shock) interacts with enemy element
      // Same-element: 0.65x (resist). Adjacent element: 1.5x (weak). No element: 1x.
      let elementTag = null;           // 'WEAK' / 'RESIST' / null — shown on damage number
      if (opts.damageType && def.element) {
        if (opts.damageType === def.element) {
          amount *= 0.65;
          elementTag = 'RESIST';
        } else {
          // Weakness rule: every element is weak to the other two
          amount *= 1.5;
          elementTag = 'WEAK';
        }
      }
      // Stash the tag so callers can display it when they spawn the damage number
      this._lastElementTag = elementTag;
      // VANGUARD shield — frontal arc blocks, each blocked hit drains a charge
      if (def.shieldCharges && (this._shieldChargesLeft === undefined ? def.shieldCharges : this._shieldChargesLeft) > 0 && !this._vShieldBroken) {
        if (this._shieldChargesLeft === undefined) this._shieldChargesLeft = def.shieldCharges;
        // Determine if hit is from the front: dirX/dirY is the attacker's aim direction
        // (direction of the blow). Vanguard's facing is this.facing * aimHorizontal vector.
        // Attacker's swing direction vs vanguard's facing.
        const facingX = this.facing < 0 ? -1 : 1;    // vanguard looks in facing direction
        // Blow-from-front check: attacker is hitting toward the vanguard, so
        // the attack vector points INTO the shield when (-dirX) aligns with facing.
        const incomingX = -(dirX || 0);
        const dot = incomingX * facingX;              // 1 = straight-on frontal, -1 = from behind
        const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
        if (angle < def.shieldArc / 2) {
          // Blocked: reduce damage, spend a charge
          amount *= (1 - def.shieldReduction);
          this._shieldChargesLeft--;
          this._shieldFlash = 0.22;
          hitSpark(this.x + facingX * 20, this.y - 18, -facingX, 0, '#c8d8ff');
          playSfx('click', { rate: 0.7, volume: 0.55 });
          if (this._shieldChargesLeft <= 0) {
            this._vShieldBroken = true;
            shakeCamera(7, 0.2);
            deathBurst(this.x + facingX * 20, this.y - 12, '#c8d8ff');
            playSfx('slime_death', { rate: 1.6, volume: 0.45 });
          }
        }
      }
      // Hit streak — consecutive hits within 1.2s on same enemy ramp up effect intensity
      const now = performance.now() / 1000;
      if (this._lastHitTime && now - this._lastHitTime < 1.2) {
        this._hitStreak = (this._hitStreak || 1) + 1;
      } else {
        this._hitStreak = 1;
      }
      this._lastHitTime = now;
      const actual = Math.max(0, Math.min(amount, this.hp));
      stats.damageDealt += actual;
      if (actual > stats.biggestHit) stats.biggestHit = actual;
      this.hp -= amount;
      // Hit reaction scales with DAMAGE RELATIVE to enemy max HP.
      // Big hits (>= 30% of max) get exaggerated knockback + stagger + flash.
      const damageRatio = Math.min(1.5, amount / Math.max(1, this.maxHp));
      const weightMul = 1 + damageRatio * 0.8;           // 1.0 for small hits, ~1.8 for huge
      // Hit flash intensifies with streak AND hit weight
      this.hitFlash = Math.min(0.3, 0.14 + this._hitStreak * 0.016 + damageRatio * 0.1);
      // Hit pop — brief sprite scale-up on hit. Makes hits feel punchy even
      // on enemies the player can't one-shot. Decays fast.
      this._hitPopT = Math.min(0.14, 0.06 + damageRatio * 0.08);
      this.knockbackX = (dirX || 0) * 320 * weightMul;
      this.knockbackY = (dirY || 0) * 320 * weightMul;
      this.stagger = Math.max(this.stagger || 0, 0.12 + damageRatio * 0.25);
      // Warded — count staggers toward shield break
      if (this.affix && this.affix.id === 'warded' && !this._shieldBroken) {
        this._staggerCount++;
        if (this._staggerCount >= this.affix.staggersToBreak) {
          this._shieldBroken = true;
          // Visual + audio cue: shield break
          deathBurst(this.x, this.y - 10, '#ffd855');
          shakeCamera(6, 0.18);
          playSfx('slime_death', { rate: 1.4, volume: 0.6 });
        }
      }
      // INTERRUPT: hitting an enemy during attack WIND-UP cancels the swing.
      // Heavy hits (>= 25% of maxHP) extend the stagger — big combo reward.
      if (this.state === 'attack' && def.behavior !== 'bomber') {
        const windup = this._heavy && def.heavyWindup ? def.heavyWindup : def.windup;
        if (this.stateTime < windup) {
          this.state = 'idle';
          this.stateTime = 0;
          this._swingHit = false;
          this._heavy = false;
          // Heavy-hit interrupts add extra attackCD (longer recovery stagger)
          const interruptBonus = damageRatio >= 0.25 ? 0.35 : 0;
          this.attackCD = Math.max(this.attackCD, 0.45 + interruptBonus);
          // Floating "INTERRUPT!" marker on big interrupts
          if (damageRatio >= 0.25 && typeof spawnDamageNumber !== 'undefined') {
            // Reuse damage number badge system via opts (faux-badge)
          }
        }
      }
      if (this.hp <= 0) {
        this.dead = true;
        stats.enemiesDefeated++;
        // Kill-streak tracking — consecutive kills within 1.5s stack up
        const now = performance.now() / 1000;
        if (window.__gameMetrics.lastKillTime && now - window.__gameMetrics.lastKillTime < 1.5) {
          window.__gameMetrics.killStreak = (window.__gameMetrics.killStreak || 1) + 1;
        } else {
          window.__gameMetrics.killStreak = 1;
        }
        window.__gameMetrics.lastKillTime = now;
        window.__gameMetrics.killStreakShowUntil = now + 1.2;         // HUD shows for 1.2s after last kill
        if (this.boss) stats.bossesKilled++;
        else if (this.elite) stats.elitesDefeated++;
        if (def.behavior === 'bomber') {
          this.state = 'exploding';
          this.stateTime = 0;
          this.removeTimer = 0.35;
        } else {
          this.state = 'death';
          this.stateTime = 0;
          this.removeTimer = 0.6;
        }
        // Per-type death VFX — each enemy kind has a distinct visual signature
        const t = this.type;
        if (t === 'slime') {
          // Slime splat — thick green goo bursts
          for (let i = 0; i < 4; i++) deathBurst(this.x, this.y - 12, '#4ad48a');
          deathBurst(this.x, this.y - 4, '#78e8a8');
        } else if (t === 'skel' || t === 'bone_captain') {
          // Bone shatter — white shards + dust puff
          for (let i = 0; i < 3; i++) deathBurst(this.x, this.y - 16, '#f4f0dc');
          deathBurst(this.x, this.y - 8, '#aa9a7a');
          deathBurst(this.x, this.y - 8, '#8a7a5a');
        } else if (t === 'orc' || t === 'vanguard') {
          // Heavy fall — blood + dust ground impact
          deathBurst(this.x, this.y - 16, '#a04848');
          for (let i = 0; i < 3; i++) deathBurst(this.x, this.y + 4, '#6a5040');
        } else if (t === 'archer') {
          // Archer — dust + small arrow-tip sparks
          deathBurst(this.x, this.y - 14, '#c89a60');
          deathBurst(this.x, this.y - 8, '#8a6840');
        } else if (t === 'lancer') {
          // Lancer — gold flash + heavy burst
          for (let i = 0; i < 3; i++) deathBurst(this.x, this.y - 14, '#e8d4a0');
        } else if (t === 'wizard') {
          // Wizard — purple dissolve smoke + sparkle twinkle
          for (let i = 0; i < 3; i++) deathBurst(this.x, this.y - 14, '#b89cff');
          for (let i = 0; i < 6; i++) sparkle(this.x + (Math.random() - 0.5) * 30, this.y - 12, '#d8c0ff');
        } else if (t === 'priest') {
          // Priest — white light fade + sparkles (blessed death)
          deathBurst(this.x, this.y - 14, '#ffffff');
          for (let i = 0; i < 8; i++) sparkle(this.x + (Math.random() - 0.5) * 28, this.y - 10, '#ffe8c0');
        } else if (t === 'broodmother' || t === 'ember_tyrant') {
          // Boss death — huge multi-burst
          for (let i = 0; i < 8; i++) deathBurst(this.x, this.y - 16, def.color);
          for (let i = 0; i < 4; i++) deathBurst(this.x, this.y, '#ff4a20');
        } else {
          // Fallback — use enemy color
          deathBurst(this.x, this.y - 16, def.color);
        }
        // Elite dying adds gold sparkle shower
        if (this.elite && !this.boss) {
          for (let i = 0; i < 6; i++) sparkle(this.x + (Math.random() - 0.5) * 32, this.y - 12, '#ffd27a');
        }
        // KILL RING — Hades-style shockwave on death. Scales with importance.
        // Colors: gold for elite, tint-tinted for boss, white for common.
        const killColor = this.boss ? '#ff9066' : this.elite ? '#ffd27a' : '#fff2e0';
        const killIntensity = this.boss ? 3 : this.elite ? 2 : 1;
        killRing(this.x, this.y - 8, killColor, killIntensity);
        // Camera punch — bosses + elites shake harder; also push a brief zoom
        // pulse for bosses so the screen feels like it's inhaling.
        shakeCamera(this.boss ? 14 : this.elite ? 7 : 4.5, this.boss ? 0.35 : 0.16);
        if (this.boss) pulseZoom(0.10, 0.9);
        else if (this.elite) pulseZoom(0.04, 0.4);
        playSfx('slime_death', { rate: elite ? 0.85 : 1.0, rateJitter: 0.1, volume: 0.9 });

        // Gold drops — scale with elite/boss. Tarot EMPRESS doubles drops.
        let coinCount = this.boss ? 40 : this.elite ? (6 + (Math.random() * 5 | 0)) : (1 + (Math.random() * 3 | 0));
        if (typeof window !== 'undefined' && window.__tarotEmpress) coinCount *= 2;
        dropGold(this.x, this.y - 8, coinCount);

        // SYNERGY: Explosive Kill — detonate on death
        if (hero.explosiveKill && !this.boss) {
          spawnExplosion(this.x, this.y - 8, 72, 22 * (hero.damageMul || 1));
        }
        // SYNERGY: Soul Burst — every 5th kill spawns a soul wave
        if (hero.soulBurst && !this.boss) {
          hero.soulKillCount = (hero.soulKillCount || 0) + 1;
          if (hero.soulKillCount % 5 === 0) {
            spawnSoulBurst(this.x, this.y - 12, 8, 18 * (hero.damageMul || 1));
          }
        }
        // LEGENDARY: Ethereal Binding — every 3rd kill grants 1s i-frames
        etherealRegisterKill();
        // SOULREAVER — kill stacks attack speed buff (max 3 stacks, refreshes timer)
        if (hero.soulreaver) {
          hero.soulreaverStacks = Math.min(3, hero.soulreaverStacks + 1);
          hero.soulreaverTime = 3.0;
        }

        // Elite slime splits into 2 small slimes on death
        if (this.splitOnDeath) {
          const jx = 18 + Math.random() * 10;
          spawnEnemy('slime', this.x - jx, this.y, {});
          spawnEnemy('slime', this.x + jx, this.y, {});
          for (const s of enemies.slice(-2)) {
            s.hp = Math.round(s.def.hp * 0.6);
            s.maxHp = s.hp;
            s.sizeMul = 0.8;
            s.radius = s.def.radius * 0.85;
          }
        }
        // ECHO OF SELF death — emit reclaim event so main.js can drop a relic pedestal
        if (this.type === 'echo' && this.echoPastBuild) {
          if (typeof window !== 'undefined' && window.__onEchoDefeated) {
            try { window.__onEchoDefeated(this); } catch (e) {}
          }
        }
      }
    },
  });
}

export function clearEnemies() {
  enemies.length = 0;
  corpses.length = 0;
}

// ============================================================================
// CORPSES — after an enemy fully despawns we leave a faint silhouette + blood
// splatter on the floor so combat rooms feel lived-in. Cleared on room change.
// ============================================================================
export const corpses = [];
const MAX_CORPSES = 40;

function pushCorpse(e) {
  if (e.state === 'exploding') return;        // bombers leave an ash ring via their explosion
  const c = {
    x: e.x,
    y: e.y,
    facing: e.facing || 1,
    size: e.def.drawSize * (e.sizeMul || 1),
    // Slight randomness to splatter shape so every corpse looks unique
    seed: Math.random(),
    boss: !!e.boss,
    elite: !!e.elite,
    color: e.def.bloodColor || '#6a1020',
    spawnTime: performance.now() / 1000,
  };
  corpses.push(c);
  // Cap the list so very long combats don't accumulate dozens of overlapping stains
  if (corpses.length > MAX_CORPSES) corpses.shift();
}

// Draw corpses on the floor — call BEFORE drawEnemy so living enemies render on top.
// Blood pool + darker splatter dots + faint body silhouette, all with slight
// per-corpse jitter from the seed.
export function drawCorpses(ctx) {
  const now = performance.now() / 1000;
  for (const c of corpses) {
    const age = now - c.spawnTime;
    // Blood pool expands for the first 0.4s, then holds steady
    const expand = Math.min(1, age / 0.4);
    const baseR = (c.boss ? 22 : c.elite ? 14 : 10) * expand;
    const jitter = ((c.seed * 7) % 1) * 6;
    const splatterR = baseR * 1.35;
    ctx.save();
    // Faint drop shadow where the body fell
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(c.x, c.y + 6, baseR * 1.2, baseR * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
    // Main blood pool
    const g = ctx.createRadialGradient(c.x, c.y + 4, 1, c.x, c.y + 4, splatterR);
    g.addColorStop(0, c.color);
    g.addColorStop(0.7, c.color + (c.color.length === 7 ? 'aa' : ''));
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(c.x, c.y + 4, splatterR, splatterR * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    // Splatter dots around the pool
    const dots = c.boss ? 10 : c.elite ? 6 : 4;
    for (let i = 0; i < dots; i++) {
      const a = (c.seed * 13 + i * 1.7) * Math.PI;
      const r = splatterR * (0.8 + ((c.seed * (i + 1)) % 1) * 0.7);
      const px = c.x + Math.cos(a) * r;
      const py = c.y + 4 + Math.sin(a) * r * 0.45;
      const ds = 1.4 + ((c.seed * (i + 3)) % 1) * 2.2;
      ctx.fillStyle = c.color;
      ctx.globalAlpha = 0.7;
      ctx.fillRect(px - ds / 2, py - ds / 2, ds, ds);
    }
    ctx.globalAlpha = 1;
    // Dark silhouette lump where the body collapsed — very faint
    ctx.fillStyle = 'rgba(10, 4, 8, 0.35)';
    ctx.beginPath();
    ctx.ellipse(c.x + jitter * 0.4, c.y, c.size * 0.18, c.size * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// Offscreen buffer for hit-flash compositing (same technique as before)
const _fx = document.createElement('canvas');
_fx.width = 200; _fx.height = 200;
const _fxCtx = _fx.getContext('2d');

function tryMove(e, dx, dy) {
  const nx = e.x + dx, ny = e.y + dy;
  let movedX = false, movedY = false;
  if (!isWallAtWorld(nx + Math.sign(dx) * e.radius, e.y)) { e.x = nx; movedX = Math.abs(dx) > 0.02; }
  if (!isWallAtWorld(e.x, ny + Math.sign(dy) * e.radius)) { e.y = ny; movedY = Math.abs(dy) > 0.02; }
  return movedX || movedY;
}

function setState(e, s) {
  if (e.state !== s) { e.state = s; e.stateTime = 0; e._swingHit = false; }
}

function explode(e) {
  // AoE damage to hero + other enemies in radius
  const R = e.def.blastRadius * (e.blastRadiusMul || 1);
  const dam = e.def.blastDamage * (e.elite ? 1.5 : 1);
  // Visual
  for (let i = 0; i < 24; i++) deathBurst(e.x, e.y - 8, e.def.color);
  shakeCamera(12, 0.3);
  playSfx('slime_death', { rate: 0.6, rateJitter: 0.08, volume: 1.0 });
  playSfx('hero_hurt',   { rate: 0.7, rateJitter: 0.05, volume: 0.6 });
  // Damage hero
  const dhx = hero.x - e.x, dhy = hero.y - e.y;
  if (dhx*dhx + dhy*dhy < R * R) damageHero(dam, e.x, e.y);
  // Damage other enemies
  for (const other of enemies) {
    if (other === e || other.dead) continue;
    const odx = other.x - e.x, ody = other.y - e.y;
    if (odx*odx + ody*ody < R * R) {
      other.takeDamage(dam * 18, odx, ody);  // huge dmg — blast cleans out nearby enemies
    }
  }
}

// Resolve which attack profile is active for a melee enemy this swing.
// Can be base / heavy / dash (for Bone Captain).
function currentAttackProfile(e) {
  if (e._dashWindup && e.def.dashWindup) {
    return {
      reach: e.def.attackReach,
      arc: e.def.attackArc,
      windup: e.def.dashWindup,
      swing: e.def.swing,
      damage: e.damage,
      color: 'rgba(120, 200, 255, ',
    };
  }
  if (e._heavy && e.def.heavyReach) {
    return {
      reach: e.def.heavyReach,
      arc: e.def.heavyArc,
      windup: e.def.heavyWindup,
      swing: e.def.heavySwing,
      damage: e.damage * (e.def.heavyDamage / e.def.damage),
      color: e.def.heavyColor,
    };
  }
  return {
    reach: e.def.attackReach,
    arc: e.def.attackArc,
    windup: e.def.windup,
    swing: e.def.swing,
    damage: e.damage,
    color: e.def.telegraphColor,
  };
}

function updateMelee(e, dt) {
  const dx = hero.x - e.x, dy = hero.y - e.y;
  const dist = Math.hypot(dx, dy) || 1;
  const nx = dx / dist, ny = dy / dist;
  e.facing = nx >= 0 ? 1 : -1;

  // Ember affix — drop flame trail while this enemy is moving
  if (e.affix && e.affix.trail) {
    e._trailT -= dt;
    if (e._trailT <= 0 && e.state === 'walk') {
      e._trailT = e.affix.trailInterval;
      spawnEmberFlame(e.x, e.y + 6);
    }
  }

  if (e.state === 'attack') {
    const prof = currentAttackProfile(e);
    // Dash-attack phase: enemy moves fast toward locked dash target during windup
    if (e._isDashing) {
      const ddx = e._dashTX - e.x, ddy = e._dashTY - e.y;
      const dd = Math.hypot(ddx, ddy);
      if (dd > 2) {
        const remaining = Math.max(0.001, e.def.dashWindup - e.stateTime);
        const step = Math.min(e.def.dashSpeed * dt, dd * (dt / remaining));
        tryMove(e, (ddx / dd) * step, (ddy / dd) * step);
      }
    }
    // Strike phase: check damage using BOTH distance and angle (arc hitbox).
    if (e.stateTime >= prof.windup && e.stateTime < prof.windup + prof.swing && !e._swingHit) {
      e._swingHit = true;
      const hdx = hero.x - e.x, hdy = hero.y - e.y;
      const hd = Math.hypot(hdx, hdy);
      const effectiveReach = prof.reach + 14;
      if (hd < effectiveReach) {
        const aimAngle = Math.atan2(e.aimY, e.aimX);
        const heroAngle = Math.atan2(hdy, hdx);
        let diff = heroAngle - aimAngle;
        while (diff >  Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        if (Math.abs(diff) <= prof.arc / 2) {
          const wasHit = damageHero(prof.damage | 0, e.x, e.y);
          // Affix onHitHero — frost/venom apply debuffs when a hit lands
          if (wasHit !== 'absorbed' && e.affix && e.affix.onHitHero) {
            e.affix.onHitHero(e);
          }
        }
      }
    }
    if (e.stateTime >= prof.windup + prof.swing) {
      e._heavy = false;
      e._isDashing = false;
      e._dashWindup = false;
      setState(e, 'idle');
    }
    return;
  }

  // Commit to a swing when in range (or farther, if dash-capable)
  const swingRange = e.def.attackReach + 12;
  const dashRange  = e.def.dashEvery ? 380 : swingRange;
  if (dist < swingRange && e.attackCD <= 0) {
    if (e.forceHeavy && e.def.heavyReach) e._heavy = true;
    else e._heavy = e.def.heavyChance ? Math.random() < e.def.heavyChance : false;
    const prof = currentAttackProfile(e);
    e.attackCD = e.def.hitCD + prof.windup + prof.swing;
    e.aimX = nx; e.aimY = ny;
    e._swingCount = (e._swingCount || 0) + 1;
    setState(e, 'attack');
    playWindupSfx(e);
    return;
  }
  // Bone Captain dash strike — triggers from farther when the counter hits
  if (e.def.dashEvery && dist < dashRange && dist > swingRange && e.attackCD <= 0 &&
      ((e._swingCount || 0) + 1) % e.def.dashEvery === 0) {
    e._swingCount = (e._swingCount || 0) + 1;
    e._isDashing = true;
    // Lock dash destination just short of hero (so we arrive with hero in reach)
    const land = Math.max(24, dist - e.def.attackReach * 0.6);
    e._dashTX = e.x + nx * land;
    e._dashTY = e.y + ny * land;
    e.aimX = nx; e.aimY = ny;
    e._heavy = false;
    // Override windup via a flag profile read by currentAttackProfile
    e._dashWindup = true;
    e.attackCD = e.def.hitCD + e.def.dashWindup + e.def.swing;
    setState(e, 'attack');
    playSfx('footstep_1', { rate: 0.55, volume: 0.85 });    // scrape-dash SFX
    return;
  }

  // Separation from other enemies
  let sepX = 0, sepY = 0;
  for (const other of enemies) {
    if (other === e || other.dead) continue;
    const odx = e.x - other.x, ody = e.y - other.y;
    const od = Math.hypot(odx, ody);
    const minD = (e.radius + other.radius) * 0.9;
    if (od > 0 && od < minD) {
      const push = (minD - od) / minD;
      sepX += (odx / od) * push;
      sepY += (ody / od) * push;
    }
  }
  // Primary move attempt toward hero
  const primaryDx = nx * e.speed * dt + sepX * 40 * dt;
  const primaryDy = ny * e.speed * dt + sepY * 40 * dt;
  const prevX = e.x, prevY = e.y;
  tryMove(e, primaryDx, primaryDy);
  // Obstacle-detour: if primary move was blocked (didn't make meaningful progress),
  // try sliding perpendicular to the goal direction. This steers around pillars.
  const moveDelta = Math.hypot(e.x - prevX, e.y - prevY);
  if (moveDelta < Math.abs(primaryDx) * 0.3 + Math.abs(primaryDy) * 0.3) {
    // Perpendicular vectors
    const pxL = -ny, pyL = nx;         // left-perp
    const pxR = ny, pyR = -nx;         // right-perp
    // Try the side that brings us closer to hero
    const tryLeft = { x: e.x + pxL * e.speed * dt * 0.85, y: e.y + pyL * e.speed * dt * 0.85 };
    const tryRight = { x: e.x + pxR * e.speed * dt * 0.85, y: e.y + pyR * e.speed * dt * 0.85 };
    const dLeft = Math.hypot(hero.x - tryLeft.x, hero.y - tryLeft.y);
    const dRight = Math.hypot(hero.x - tryRight.x, hero.y - tryRight.y);
    if (dLeft < dRight) tryMove(e, pxL * e.speed * dt * 0.85, pyL * e.speed * dt * 0.85);
    else tryMove(e, pxR * e.speed * dt * 0.85, pyR * e.speed * dt * 0.85);
  }
  // Stuck detection — if enemy hasn't moved meaningfully for 2.5s, unstick.
  if (e._lastPos === undefined) { e._lastPos = e.x + e.y * 0.01; e._stuckT = 0; }
  const curPos = e.x + e.y * 0.01;
  if (Math.abs(curPos - e._lastPos) < 0.2) {
    e._stuckT = (e._stuckT || 0) + dt;
    if (e._stuckT > 2.5) {
      // Nudge enemy by up to 24px in hero direction to break free
      const kick = 24;
      tryMove(e, nx * kick, ny * kick);
      // If still stuck after nudge, teleport to a slightly-offset cell near hero
      if (Math.hypot(e.x - prevX, e.y - prevY) < 2) {
        const tx = hero.x + nx * -50 + (Math.random() - 0.5) * 40;
        const ty = hero.y + ny * -50 + (Math.random() - 0.5) * 40;
        if (!isWallAtWorld(tx, ty)) { e.x = tx; e.y = ty; }
      }
      e._stuckT = 0;
    }
  } else {
    e._stuckT = 0;
    e._lastPos = curPos;
  }
  setState(e, 'walk');
}

function updateRanged(e, dt) {
  const dx = hero.x - e.x, dy = hero.y - e.y;
  const dist = Math.hypot(dx, dy) || 1;
  const nx = dx / dist, ny = dy / dist;
  e.facing = nx >= 0 ? 1 : -1;

  if (e.state === 'attack') {
    const windup = e.def.windup, swing = e.def.swing;
    if (e.stateTime >= windup && !e._swingHit) {
      e._swingHit = true;
      const n = e.volleyCount || 1;
      const spread = 0.22;
      const baseAngle = Math.atan2(hero.y - (e.y - 20), hero.x - e.x);
      for (let i = 0; i < n; i++) {
        const offset = n === 1 ? 0 : ((i / (n - 1)) - 0.5) * 2 * spread;
        const a = baseAngle + offset;
        const tx = e.x + Math.cos(a) * 600;
        const ty = (e.y - 20) + Math.sin(a) * 600;
        const arrow = spawnArrow(e.x, e.y - 20, tx, ty, e.damage);
        // Tag arrow with its source's affix so projectile-hit can apply debuffs
        if (arrow && e.affix) arrow.affix = e.affix;
      }
      playSfx('sword_swing', { rate: 1.4, rateJitter: 0.08, volume: 0.5 });
    }
    if (e.stateTime >= windup + swing) setState(e, 'idle');
    return;
  }

  // Keep-distance AI: approach until preferDist, back off if closer than minDist
  const pref = e.def.preferDist;
  const mn = e.def.minDist;
  let moveX = 0, moveY = 0;
  if (dist > pref) { moveX = nx; moveY = ny; }
  else if (dist < mn) { moveX = -nx; moveY = -ny; }
  else {
    // Strafe sideways at the edge of preferred range
    moveX = -ny; moveY = nx;
  }
  tryMove(e, moveX * e.speed * dt, moveY * e.speed * dt);

  // Shoot when in range and cooldown elapsed
  if (dist < e.def.attackRange && e.attackCD <= 0 && !isWallAtWorld(e.x, e.y)) {
    e.attackCD = e.def.hitCD + e.def.windup + e.def.swing;
    e.aimX = nx; e.aimY = ny;
    setState(e, 'attack');
    playWindupSfx(e);
    return;
  }
  setState(e, moveX !== 0 || moveY !== 0 ? 'walk' : 'idle');
}

function updateBomber(e, dt) {
  const dx = hero.x - e.x, dy = hero.y - e.y;
  const dist = Math.hypot(dx, dy) || 1;
  const nx = dx / dist, ny = dy / dist;
  e.facing = nx >= 0 ? 1 : -1;

  if (e.state === 'attack') {
    // Windup: flashing red, standing still. Strike phase = explode.
    if (e.stateTime >= e.def.windup && !e._swingHit) {
      e._swingHit = true;
      e.dead = true;
      e.state = 'exploding';
      e.stateTime = 0;
      e.removeTimer = 0.25;
      explode(e);
    }
    return;
  }

  if (dist < e.def.attackRange && e.attackCD <= 0) {
    e.attackCD = 99;
    e.aimX = nx; e.aimY = ny;
    setState(e, 'attack');
    playWindupSfx(e);
    return;
  }
  tryMove(e, nx * e.speed * dt, ny * e.speed * dt);
  setState(e, 'walk');
}

// ---- Lancer behavior: charge with linear hitbox ----
function updateLancer(e, dt) {
  const dx = hero.x - e.x, dy = hero.y - e.y;
  const dist = Math.hypot(dx, dy) || 1;
  const nx = dx / dist, ny = dy / dist;
  e.facing = nx >= 0 ? 1 : -1;

  if (e.state === 'attack') {
    const wu = e.def.chargeWindup, tr = e.def.chargeTravel;
    // Wind-up: hold position, show linear telegraph (handled in drawEnemyTelegraphs)
    if (e.stateTime < wu) {
      // locked telegraph — aim set when attack started
    } else if (e.stateTime < wu + tr) {
      // Travel phase: move fast along the locked direction, damage hero if crossed
      const speed = e.def.chargeRange / tr;
      tryMove(e, e.aimX * speed * dt, e.aimY * speed * dt);
      // Check linear hit along the charge axis at current position
      const hdx = hero.x - e.x, hdy = hero.y - e.y;
      // Project hero onto the charge axis — if close to the line, take damage
      const along = hdx * e.aimX + hdy * e.aimY;
      const perp = Math.abs(hdx * -e.aimY + hdy * e.aimX);
      const halfW = e.def.chargeWidth / 2 + 12;
      if (Math.abs(along) < 50 && perp < halfW && !e._swingHit) {
        e._swingHit = true;
        damageHero(e.damage, e.x, e.y);
        shakeCamera(7, 0.2);
      }
    } else {
      setState(e, 'idle');
    }
    return;
  }

  // Keep-distance AI (similar to archer)
  const pref = e.def.preferDist, mn = e.def.minDist;
  let moveX = 0, moveY = 0;
  if (dist > pref) { moveX = nx; moveY = ny; }
  else if (dist < mn) { moveX = -nx; moveY = -ny; }
  else { moveX = -ny; moveY = nx; }
  tryMove(e, moveX * e.speed * dt, moveY * e.speed * dt);

  // Commit to a charge when aligned + cooldown ready
  if (dist < e.def.chargeRange && dist > mn && e.attackCD <= 0) {
    e.attackCD = e.def.hitCD + e.def.chargeWindup + e.def.chargeTravel;
    e.aimX = nx; e.aimY = ny;
    e._swingHit = false;
    setState(e, 'attack');
    playWindupSfx(e);
    return;
  }
  setState(e, moveX !== 0 || moveY !== 0 ? 'walk' : 'idle');
}

// ---- Wizard behavior: keeps max distance, casts homing orb volleys ----
function updateWizard(e, dt) {
  const dx = hero.x - e.x, dy = hero.y - e.y;
  const dist = Math.hypot(dx, dy) || 1;
  const nx = dx / dist, ny = dy / dist;
  e.facing = nx >= 0 ? 1 : -1;

  if (e.state === 'attack') {
    if (e.stateTime >= e.def.castWindup && !e._swingHit) {
      e._swingHit = true;
      // Fire `castCount` orbs in a spread pattern
      const n = e.def.castCount;
      const spread = e.def.castSpread;
      const baseAngle = Math.atan2(hero.y - (e.y - 20), hero.x - e.x);
      for (let i = 0; i < n; i++) {
        const offset = n === 1 ? 0 : ((i / (n - 1)) - 0.5) * 2 * spread;
        const a = baseAngle + offset;
        const tx = e.x + Math.cos(a) * 400;
        const ty = (e.y - 20) + Math.sin(a) * 400;
        const orb = spawnOrb(e.x, e.y - 20, tx, ty, e.damage);
        if (orb && e.affix) orb.affix = e.affix;
      }
      playSfx('click', { rate: 0.9, volume: 0.6 });
    }
    if (e.stateTime >= e.def.castWindup + 0.35) setState(e, 'idle');
    return;
  }

  // Keep very large distance from hero (wizard is squishy)
  const pref = e.def.preferDist, mn = e.def.minDist;
  let moveX = 0, moveY = 0;
  if (dist > pref) { moveX = nx * 0.3; moveY = ny * 0.3; }      // lazy approach
  else if (dist < mn) { moveX = -nx; moveY = -ny; }               // back off aggressively
  else { moveX = -ny * 0.4; moveY = nx * 0.4; }                    // strafe sideways
  tryMove(e, moveX * e.speed * dt, moveY * e.speed * dt);

  // Cast when in range
  if (dist < e.def.castRange && e.attackCD <= 0 && !isWallAtWorld(e.x, e.y)) {
    e.attackCD = e.def.hitCD + e.def.castWindup + 0.35;
    e.aimX = nx; e.aimY = ny;
    setState(e, 'attack');
    playWindupSfx(e);
    return;
  }
  setState(e, moveX !== 0 || moveY !== 0 ? 'walk' : 'idle');
}

// ---- Priest behavior: heals the most-damaged nearby ally ----
function updatePriest(e, dt) {
  const dx = hero.x - e.x, dy = hero.y - e.y;
  const dist = Math.hypot(dx, dy) || 1;
  const nx = dx / dist, ny = dy / dist;
  e.facing = nx >= 0 ? 1 : -1;

  if (e.state === 'attack') {
    // Casting: lock target, beam shows via telegraph, heal fires at windup end
    if (e.stateTime >= e.def.healWindup && !e._swingHit) {
      e._swingHit = true;
      const target = e._healTarget;
      if (target && !target.dead && target.hp < target.maxHp) {
        target.hp = Math.min(target.maxHp, target.hp + e.def.healAmount);
        // Healed-flash on target (reuse hit flash slot)
        target.hitFlash = 0.14;
        // Green burst at target
        deathBurst(target.x, target.y - 16, '#86e3a8');
        shakeCamera(3, 0.1);
        playSfx('click', { rate: 2.0, volume: 0.5 });
      }
    }
    if (e.stateTime >= e.def.healWindup + 0.3) {
      e._healTarget = null;
      setState(e, 'idle');
    }
    return;
  }

  // Look for a damaged ally within heal range
  if (e.attackCD <= 0) {
    let bestTarget = null;
    let bestDeficit = 0;
    for (const other of enemies) {
      if (other === e || other.dead || other.type === 'priest') continue;
      const odx = other.x - e.x, ody = other.y - e.y;
      const od = Math.hypot(odx, ody);
      if (od > e.def.healRange) continue;
      const def = other.maxHp - other.hp;
      if (def > bestDeficit) { bestDeficit = def; bestTarget = other; }
    }
    if (bestTarget && bestDeficit > 10) {
      e._healTarget = bestTarget;
      e.attackCD = e.def.healCD + e.def.healWindup;
      setState(e, 'attack');
      playWindupSfx(e);
      return;
    }
  }

  // Otherwise, keep distance from hero (priest is fragile)
  const pref = e.def.preferDist, mn = e.def.minDist;
  let moveX = 0, moveY = 0;
  if (dist > pref) { moveX = nx * 0.4; moveY = ny * 0.4; }    // lazy approach
  else if (dist < mn) { moveX = -nx; moveY = -ny; }
  else { moveX = -ny * 0.3; moveY = nx * 0.3; }
  tryMove(e, moveX * e.speed * dt, moveY * e.speed * dt);
  setState(e, moveX !== 0 || moveY !== 0 ? 'walk' : 'idle');
}

export function updateEnemies(dt, _hero) {
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    e.animTime += dt;
    e.stateTime += dt;
    if (e.hitFlash > 0) e.hitFlash -= dt;
    if (e._hitPopT > 0) e._hitPopT -= dt;

    // Knockback decays
    if (Math.abs(e.knockbackX) > 1 || Math.abs(e.knockbackY) > 1) {
      tryMove(e, e.knockbackX * dt, e.knockbackY * dt);
      e.knockbackX *= Math.pow(0.001, dt);
      e.knockbackY *= Math.pow(0.001, dt);
    }

    // Dead/exploding: count down to removal
    if (e.dead) {
      e.removeTimer -= dt;
      if (e.removeTimer <= 0) {
        pushCorpse(e);
        enemies.splice(i, 1);
      }
      continue;
    }

    if (e.attackCD > 0) e.attackCD -= dt;
    if (e.stagger && e.stagger > 0) e.stagger -= dt;
    if (hero.state === 'dead') { setState(e, 'idle'); continue; }

    // Stagger gate — skip AI entirely while hit-stunned
    if (e.stagger > 0 && e.state !== 'attack') continue;

    // Boss phase triggers — HP-threshold mechanics
    // Summon-on-HP (Bone Captain)
    if (e.def.summonAt) {
      if (!e._summonsDone) e._summonsDone = new Array(e.def.summonAt.length).fill(false);
      for (let i = 0; i < e.def.summonAt.length; i++) {
        if (!e._summonsDone[i] && e.hp < e.maxHp * e.def.summonAt[i]) {
          e._summonsDone[i] = true;
          spawnEnemy('skel', e.x - 44, e.y + 30);
          spawnEnemy('skel', e.x + 44, e.y + 30);
          shakeCamera(11, 0.32);
          playSfx('slime_death', { rate: 0.55, volume: 0.75 });
        }
      }
    }
    // Spawn-bomber-on-HP (Broodmother)
    if (e.def.bomberAt) {
      if (!e._bomberDone) e._bomberDone = new Array(e.def.bomberAt.length).fill(false);
      for (let i = 0; i < e.def.bomberAt.length; i++) {
        if (!e._bomberDone[i] && e.hp < e.maxHp * e.def.bomberAt[i]) {
          e._bomberDone[i] = true;
          spawnEnemy('bomber', e.x + (Math.random() * 80 - 40), e.y + 50);
          shakeCamera(7, 0.22);
          playSfx('slime_hit', { rate: 1.5, volume: 0.7 });
        }
      }
    }
    // Enrage (Broodmother/Ember Tyrant/Bone Captain) — permanent speed + damage boost at low HP.
    // ASCENSION IV — "The Awakened": bosses enrage at 70% HP instead of 50%.
    let enrageAt = e.def.enrageAt;
    if (enrageAt && typeof window !== 'undefined' && window.__ascensionModifiers) {
      const am = window.__ascensionModifiers();
      if (am && am.bossEnrageAt) enrageAt = am.bossEnrageAt;
    }
    if (enrageAt && !e._enraged && e.hp < e.maxHp * enrageAt) {
      e._enraged = true;
      e.speed *= e.def.enrageSpeedMul;
      e.damage *= e.def.enrageDamageMul;
      // Dramatic enrage: shake, screen flash, shockwave burst, roar + zoom punch
      shakeCamera(22, 0.55);
      pulseZoom(0.18, 1.2);
      triggerScreenFlash('rgba(255, 50, 30, 0.55)', 0.5);
      for (let k = 0; k < 32; k++) deathBurst(e.x, e.y - 8, '#ff4030');
      // Trigger the cinematic PHASE 2 banner if main.js is listening
      if (typeof window !== 'undefined' && window.triggerBossPhaseIntro) {
        window.triggerBossPhaseIntro(e);
      }
      // Shockwave ring — knock enemies & damage nothing, just visual
      e._enrageShockTime = 0.8;
      playSfx('hero_hurt', { rate: 0.28, volume: 1.0 });
      playSfx('slime_death', { rate: 0.35, volume: 0.9 });
      // EMBER TYRANT — summons a ring of 6 fire pillars around itself on enrage.
      // These stay as environmental hazards for the rest of the fight.
      if (e.type === 'ember_tyrant') {
        const ringR = 120;
        for (let k = 0; k < 6; k++) {
          const ang = (k / 6) * Math.PI * 2 + Math.random() * 0.3;
          const fx = e.x + Math.cos(ang) * ringR;
          const fy = e.y + Math.sin(ang) * ringR * 0.6;   // slight isometric squash
          spawnExtraFirePool(fx, fy, k * 0.4);
        }
      }
    }
    // Animate the enrage shockwave decay
    if (e._enrageShockTime && e._enrageShockTime > 0) e._enrageShockTime -= dt;

    // Elite boss phase 2 — spawn 2 slimes at 50% HP (once)
    if (e.elite && !e.phase2Triggered && e.hp <= e.maxHp * 0.5) {
      e.phase2Triggered = true;
      spawnEnemy('slime', e.x - 40, e.y + 20);
      spawnEnemy('slime', e.x + 40, e.y + 20);
      shakeCamera(10, 0.3);
      playSfx('slime_death', { rate: 0.6, volume: 0.8 });
    }

    const b = e.def.behavior;
    if (b === 'melee') updateMelee(e, dt);
    else if (b === 'ranged') updateRanged(e, dt);
    else if (b === 'bomber') updateBomber(e, dt);
    else if (b === 'lancer') updateLancer(e, dt);
    else if (b === 'priest') updatePriest(e, dt);
    else if (b === 'wizard') updateWizard(e, dt);
  }
}

function enemyImg(e) {
  const s = e.state;
  const key = e.def.prefix + (s === 'walk' ? 'walk' : s === 'attack' ? 'attack' : s === 'death' ? 'death' : 'idle');
  return images[key] || images[e.def.prefix + 'idle'];
}

export function drawEnemy(ctx, e) {
  const img = enemyImg(e);
  if (!img) return;
  // Boss enrage shockwave — expanding red ring + inner glow
  if (e._enrageShockTime && e._enrageShockTime > 0) {
    const t = 1 - e._enrageShockTime / 0.6;
    const r = 60 + t * 260;
    const a = (1 - t) * 0.7;
    ctx.save();
    ctx.strokeStyle = `rgba(255, 60, 40, ${a.toFixed(3)})`;
    ctx.lineWidth = 5 * (1 - t * 0.6);
    ctx.beginPath();
    ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = `rgba(255, 160, 100, ${(a * 0.6).toFixed(3)})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(e.x, e.y, r * 0.85, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  const size = e.def.drawSize * (e.sizeMul || 1);
  const frames = Math.max(1, Math.floor(img.width / SPR));
  let f;
  if (e.state === 'attack' || e.state === 'death') {
    f = Math.min(frames - 1, Math.floor(e.stateTime * 14));
  } else if (e.state === 'exploding') {
    f = 0;
  } else {
    f = Math.floor(e.animTime * e.def.fps) % frames;
  }
  const sx = f * SPR;

  // Soft radial shadow
  const sg = ctx.createRadialGradient(e.x, e.y + 10, 2, e.x, e.y + 10, size * 0.32);
  sg.addColorStop(0, 'rgba(0,0,0,0.38)');
  sg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sg;
  ctx.fillRect(e.x - size * 0.35, e.y + 4, size * 0.7, 12);

  // Elite glow — affix color if any, else default gold.
  // Kept subtle: small tight halo at feet, not a huge field. Reads as "this
  // enemy is dangerous" without dominating the screen.
  if (e.elite && !e.boss && !e.dead) {
    const pulse = 0.85 + 0.15 * Math.sin(e.animTime * 4);
    const glowBase = e.affix ? e.affix.glow : 'rgba(255, 210, 90, ';
    const r = size * 0.35;
    const g = ctx.createRadialGradient(e.x, e.y + 8, 2, e.x, e.y + 8, r);
    g.addColorStop(0, glowBase + (0.28 * pulse).toFixed(3) + ')');
    g.addColorStop(0.55, glowBase + (0.08 * pulse).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(e.x - r, e.y + 8 - r, r * 2, r * 2);
  }
  // Vanguard shield wedge — visual readout of frontal block + charges
  if (e.def.shieldCharges && !e._vShieldBroken && !e.dead) {
    const charges = e._shieldChargesLeft === undefined ? e.def.shieldCharges : e._shieldChargesLeft;
    if (charges > 0) {
      const facingX = e.facing < 0 ? -1 : 1;
      const flashA = Math.min(0.7, (e._shieldFlash || 0) / 0.22);
      ctx.save();
      ctx.translate(e.x, e.y - 14);
      ctx.scale(facingX, 1);
      // Shield wedge arc in front
      ctx.strokeStyle = `rgba(180, 210, 255, ${(0.55 + flashA).toFixed(3)})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(18, 4, 24, -e.def.shieldArc / 2, e.def.shieldArc / 2);
      ctx.stroke();
      // Inner fill for extra readability
      ctx.fillStyle = `rgba(160, 200, 250, ${(0.12 + flashA * 0.4).toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(18, 4);
      ctx.arc(18, 4, 24, -e.def.shieldArc / 2, e.def.shieldArc / 2);
      ctx.closePath();
      ctx.fill();
      // Charge pips above the shield
      for (let k = 0; k < e.def.shieldCharges; k++) {
        ctx.fillStyle = k < charges ? 'rgba(210, 230, 255, 0.9)' : 'rgba(90, 110, 140, 0.35)';
        ctx.fillRect(10 + k * 5, -10, 3, 3);
      }
      ctx.restore();
      if (e._shieldFlash > 0) e._shieldFlash -= 0.016;
    }
  }
  // Enraged boss — persistent red aura for reads-at-a-glance danger
  if (e.boss && e._enraged && !e.dead) {
    const pulse = 0.75 + 0.25 * Math.sin(e.animTime * 5);
    const r = size * 0.55;
    const g = ctx.createRadialGradient(e.x, e.y + 4, 4, e.x, e.y + 4, r);
    g.addColorStop(0, `rgba(255, 50, 30, ${(0.34 * pulse).toFixed(3)})`);
    g.addColorStop(0.6, `rgba(255, 80, 40, ${(0.14 * pulse).toFixed(3)})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(e.x - r, e.y + 4 - r, r * 2, r * 2);
  }

  // Wound tier — drives tint/tremble/blood drip. Elites + bosses still suffer
  // wounds but skip the tremble so they don't feel fragile.
  const hpFrac = Math.max(0, Math.min(1, e.hp / Math.max(1, e.maxHp)));
  const wounded = !e.dead && hpFrac < 0.66;
  const critical = !e.dead && hpFrac < 0.33;
  // Blood drip emitter — probabilistic per frame so it's frame-rate independent.
  // ~1 drip/sec when wounded, ~2.2 drips/sec when critical.
  if (wounded && !e.hitFlash) {
    const chance = critical ? 0.035 : 0.016;
    if (Math.random() < chance) {
      bloodDrip(e.x + (Math.random() - 0.5) * 10, e.y - size * 0.35, critical ? 2 : 1, e.def.bloodColor || '#8a1a26');
    }
  }
  // Subtle tremble when critical (not bosses — they own their stance)
  const tremble = (critical && !e.boss)
    ? ((Math.random() - 0.5) * 0.8)
    : 0;

  // HIT POP — brief scale-up at peak of _hitPopT, sinusoidal taper. Sells the
  // punch of every hit. Horizontal squish is stronger than vertical for a
  // "compressed by impact" feel.
  let hitPopScaleX = 1, hitPopScaleY = 1;
  if (e._hitPopT && e._hitPopT > 0) {
    const popTotal = 0.14;
    const popT = Math.min(1, e._hitPopT / popTotal);    // 1 → 0 over lifetime
    const popCurve = Math.sin(popT * Math.PI);           // 0 → 1 → 0 arc
    hitPopScaleX = 1 + popCurve * 0.14;
    hitPopScaleY = 1 + popCurve * 0.06;
  }

  ctx.save();
  ctx.translate(e.x, e.y + tremble);
  ctx.scale(e.facing * hitPopScaleX, hitPopScaleY);

  // Death fade — if the enemy is dying, fade alpha + squish vertically
  if (e.dead && (e.state === 'death' || e.state === 'exploding')) {
    const total = e.state === 'exploding' ? 0.35 : 0.6;
    const elapsed = total - Math.max(0, e.removeTimer);
    const fadeT = Math.min(1, elapsed / total);
    ctx.globalAlpha = 1 - fadeT * 0.9;            // fade to 10% alpha
    const squish = 1 - fadeT * 0.22;               // 22% vertical compress
    ctx.scale(1, squish);
  }

  // Bomber tint filter (makes it visually distinct from regular slime)
  const needsFilter = !!e.def.tintFilter && !e.hitFlash;
  // Wound tint — compounds with bomber tint if applicable. Critical enemies
  // get a visible red shift + slight desaturation; wounded get a subtler hint.
  let woundFilter = '';
  if (critical && !e.hitFlash) {
    woundFilter = 'saturate(1.35) brightness(0.85) contrast(1.1) hue-rotate(-8deg)';
  } else if (wounded && !e.hitFlash) {
    woundFilter = 'saturate(1.12) brightness(0.93)';
  }

  if (e.hitFlash > 0) {
    // Offscreen hit-flash (white overlay clipped to sprite alpha).
    // Two-phase: first 40% frames full white; then fades to natural color.
    _fxCtx.globalCompositeOperation = 'source-over';
    _fxCtx.clearRect(0, 0, _fx.width, _fx.height);
    _fxCtx.drawImage(img, sx, 0, SPR, SPR, 0, 0, size, size);
    _fxCtx.globalCompositeOperation = 'source-atop';
    const t = e.hitFlash / 0.22;          // normalize against new max lifetime
    // Full-white snap during first burst, then fades
    const whiteA = t > 0.55 ? 1.0 : 0.85 * t * 1.5;
    _fxCtx.fillStyle = 'rgba(255,255,255,' + whiteA.toFixed(3) + ')';
    _fxCtx.fillRect(0, 0, size, size);
    ctx.drawImage(_fx, 0, 0, size, size, -size/2, -size * 0.78, size, size);
  } else {
    const combinedFilter = [
      needsFilter ? e.def.tintFilter : '',
      woundFilter,
    ].filter(Boolean).join(' ');
    if (combinedFilter) ctx.filter = combinedFilter;
    ctx.drawImage(img, sx, 0, SPR, SPR, -size/2, -size * 0.78, size, size);
    if (combinedFilter) ctx.filter = 'none';
  }
  ctx.restore();

  // Bomber "about to blow" pulse — visible from afar
  if (e.type === 'bomber' && e.state === 'attack') {
    const t = e.stateTime / e.def.windup;
    const r = 18 + 6 * Math.sin(t * 40);
    ctx.strokeStyle = 'rgba(255, 120, 60, ' + (0.4 + 0.4 * Math.sin(t * 25)).toFixed(3) + ')';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(e.x, e.y - 10, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // HP bar — boss red-orange, elite gold (or affix color), normal red.
  // Elites + bosses show bar ALWAYS (threat readability); normals only when hurt.
  if (!e.dead && (e.hp < e.maxHp || e.elite || e.boss)) {
    const w = e.boss ? 72 : e.elite ? 52 : 38;
    const h = e.boss ? 7 : e.elite ? 5 : 4;
    const yBar = e.y - size * 0.9;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(e.x - w/2, yBar, w, h);
    let barColor = e.boss ? '#ff7a55' : e.elite ? '#ffd155' : '#d8556a';
    if (e.affix) barColor = e.affix.auraColor;
    // Critical pulse — bar flashes brighter red when HP < 33%, drawing the eye
    if (critical) {
      const cp = 0.5 + 0.5 * Math.sin(e.animTime * 12);
      barColor = e.boss ? `rgba(255, ${(70 + cp * 60) | 0}, 40, 1)` : `rgba(255, ${(60 + cp * 40) | 0}, ${(60 + cp * 20) | 0}, 1)`;
    }
    ctx.fillStyle = barColor;
    ctx.fillRect(e.x - w/2 + 1, yBar + 1, (w - 2) * hpFrac, h - 2);
    // Gradient overlay for depth
    if (e.elite || e.boss) {
      const grad = ctx.createLinearGradient(0, yBar, 0, yBar + h);
      grad.addColorStop(0, 'rgba(255,255,255,0.25)');
      grad.addColorStop(1, 'rgba(0,0,0,0.2)');
      ctx.fillStyle = grad;
      ctx.fillRect(e.x - w/2 + 1, yBar + 1, (w - 2) * hpFrac, h - 2);
    }
    if (e.elite || e.boss) {
      ctx.strokeStyle = e.affix
        ? e.affix.glow + '0.9)'
        : e.boss ? 'rgba(255,160,100,0.9)' : 'rgba(255, 210, 110, 0.9)';
      ctx.lineWidth = 1;
      ctx.strokeRect(e.x - w/2 - 0.5, yBar - 0.5, w + 1, h + 1);
    }
    // Affix badge — compact colored pill with a single-letter glyph to the LEFT of the HP bar
    if (e.affix) {
      const bx = e.x - w/2 - 14;
      const by = yBar - 1;
      const bs = 12;
      // Filled rounded square
      ctx.fillStyle = e.affix.auraColor;
      ctx.fillRect(bx, by, bs, bs);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(bx + 1, by + bs - 2, bs - 2, 1);
      // Letter
      ctx.font = 'bold 9px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#1a0f10';
      ctx.fillText(e.affix.badge, bx + bs/2, by + bs/2 + 0.5);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    }
    // Warded shield indicator — bar above HP bar that depletes with staggers
    if (e.affix && e.affix.id === 'warded' && !e._shieldBroken) {
      const sbw = w, sbh = 2;
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.fillRect(e.x - sbw/2, yBar - 14, sbw, sbh);
      ctx.fillStyle = '#ffe495';
      const frac = 1 - (e._staggerCount / e.affix.staggersToBreak);
      ctx.fillRect(e.x - sbw/2 + 1, yBar - 13, (sbw - 2) * frac, sbh - 1);
    }
  }
}

// Attack telegraph — floor indicator during the wind-up. Draws the EXACT
// arc/reach that hit detection uses, so the red zone is the hit zone.
export function drawEnemyTelegraphs(ctx) {
  // FIRST PASS — proximity rings on melee enemies (shows their threat radius
  // as the hero approaches). Subtle dashed line; fades in when hero is nearby.
  for (const e of enemies) {
    if (e.dead || e.state === 'attack') continue;
    if (e.def.behavior !== 'melee' && e.def.behavior !== 'bomber') continue;
    const reach = e.def.attackReach || (e.def.blastRadius || 0);
    if (!reach) continue;
    const dx = hero.x - e.x, dy = hero.y - e.y;
    const dist = Math.hypot(dx, dy);
    const maxShowDist = reach + 80;
    if (dist > maxShowDist) continue;
    // Fade in as hero approaches
    const proximityFade = Math.max(0, Math.min(1, 1 - (dist - reach * 0.6) / 80));
    if (proximityFade < 0.05) continue;
    const alpha = proximityFade * (e.def.behavior === 'bomber' ? 0.28 : 0.18);
    const col = e.def.telegraphColor || 'rgba(220, 80, 80, ';
    ctx.save();
    ctx.strokeStyle = col + alpha.toFixed(3) + ')';
    ctx.lineWidth = e.def.behavior === 'bomber' ? 2 : 1.2;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.arc(e.x, e.y + 4, reach, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  for (const e of enemies) {
    if (e.state !== 'attack' || e.dead) continue;

    if (e.def.behavior === 'melee') {
      const prof = currentAttackProfile(e);
      const t = e.stateTime / prof.windup;
      if (t > 1) continue;
      const pulse = 0.55 + 0.35 * Math.sin(t * Math.PI * 4);
      // DANGER SNAP — last 25% of windup: RAMP to 3x pulse rate + white flash
      // This is the "strike imminent" warning — impossible to miss.
      const inDanger = t > 0.75;
      const inCritical = t > 0.88;                              // Final 12%: hit is inevitable
      const dangerPulseRate = inDanger ? (inCritical ? 28 : 18) : 4;
      const dangerBoost = inDanger ? (1 + 0.7 * Math.sin(t * Math.PI * dangerPulseRate)) : 1;
      const alpha = Math.min(1.0, pulse * (0.3 + 0.7 * t) * dangerBoost);
      const col = prof.color;
      const reach = prof.reach;
      const arc = prof.arc;
      const aim = Math.atan2(e.aimY, e.aimX);
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(aim);
      // Filled arc (radial gradient so the tip is saturated, the base is softer)
      const g = ctx.createRadialGradient(0, 0, 6, 0, 0, reach);
      g.addColorStop(0,   col + (alpha * 0.25).toFixed(3) + ')');
      g.addColorStop(0.6, col + (alpha * 0.55).toFixed(3) + ')');
      g.addColorStop(1,   col + (alpha * 0.1).toFixed(3) + ')');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, reach, -arc/2, arc/2);
      ctx.closePath();
      ctx.fill();
      // Leading edge rim — highlights the arc boundary
      ctx.strokeStyle = col + (alpha * 0.9).toFixed(3) + ')';
      ctx.lineWidth = e._heavy ? 3 : 2;
      ctx.beginPath();
      ctx.arc(0, 0, reach, -arc/2, arc/2);
      ctx.stroke();
      // Center aim line for extra readability on heavy swings
      if (e._heavy) {
        ctx.strokeStyle = 'rgba(255, 240, 180, ' + (alpha * 0.8).toFixed(3) + ')';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(reach, 0);
        ctx.stroke();
      }
      ctx.restore();

    } else if (e.def.behavior === 'ranged') {
      // Short path from archer to the locked-target point, with a crosshair
      // marker at the end. No more screen-spanning line.
      const t = e.stateTime / e.def.windup;
      if (t > 1) continue;
      const alpha = Math.min(0.85, (0.35 + 0.45 * Math.sin(t * Math.PI * 4)) * (0.3 + 0.7 * t));
      const range = Math.max(180, Math.min(e.def.attackRange, Math.hypot(hero.x - e.x, hero.y - e.y)));
      const endX = e.x + e.aimX * range;
      const endY = e.y - 10 + e.aimY * range;
      ctx.save();
      // Dashed path
      ctx.strokeStyle = e.def.telegraphColor + alpha.toFixed(3) + ')';
      ctx.lineWidth = 2;
      ctx.setLineDash([7, 6]);
      ctx.beginPath();
      ctx.moveTo(e.x, e.y - 10);
      ctx.lineTo(endX, endY);
      ctx.stroke();
      ctx.setLineDash([]);
      // Crosshair at target point
      ctx.strokeStyle = 'rgba(255, 220, 200, ' + alpha.toFixed(3) + ')';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(endX, endY, 10, 0, Math.PI * 2);
      ctx.moveTo(endX - 14, endY); ctx.lineTo(endX - 6, endY);
      ctx.moveTo(endX + 6, endY); ctx.lineTo(endX + 14, endY);
      ctx.moveTo(endX, endY - 14); ctx.lineTo(endX, endY - 6);
      ctx.moveTo(endX, endY + 6); ctx.lineTo(endX, endY + 14);
      ctx.stroke();
      ctx.restore();

    } else if (e.def.behavior === 'wizard') {
      // Circle-based telegraph: pulsing arcane circle on the ground where orbs spawn
      const t = e.stateTime / e.def.castWindup;
      if (t > 1) continue;
      const alpha = Math.min(0.85, (0.3 + 0.5 * Math.sin(t * Math.PI * 4)) * (0.3 + 0.7 * t));
      ctx.save();
      ctx.strokeStyle = e.def.telegraphColor + alpha.toFixed(3) + ')';
      ctx.lineWidth = 2.5;
      // Outer casting circle
      ctx.beginPath();
      ctx.arc(e.x, e.y - 10, 22 + t * 8, 0, Math.PI * 2);
      ctx.stroke();
      // Inner runic circle
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(e.x, e.y - 10, 12 + t * 4, 0, Math.PI * 2);
      ctx.stroke();
      // Four rune dots around the circle
      for (let k = 0; k < 4; k++) {
        const ang = (k / 4) * Math.PI * 2 + e.stateTime * 3;
        const rx = e.x + Math.cos(ang) * (18 + t * 6);
        const ry = (e.y - 10) + Math.sin(ang) * (18 + t * 6);
        ctx.fillStyle = e.def.telegraphColor + alpha.toFixed(3) + ')';
        ctx.fillRect(rx - 1.5, ry - 1.5, 3, 3);
      }
      // Trajectory preview — faint dashed line toward aim
      ctx.strokeStyle = e.def.telegraphColor + (alpha * 0.4).toFixed(3) + ')';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 8]);
      ctx.beginPath();
      ctx.moveTo(e.x, e.y - 10);
      ctx.lineTo(e.x + e.aimX * 200, e.y - 10 + e.aimY * 200);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    } else if (e.def.behavior === 'lancer') {
      // Long linear telegraph — rectangle along the charge path
      const t = e.stateTime / e.def.chargeWindup;
      if (t > 1) continue;
      const alpha = Math.min(0.85, (0.35 + 0.45 * Math.sin(t * Math.PI * 4)) * (0.3 + 0.7 * t));
      const range = e.def.chargeRange, width = e.def.chargeWidth;
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(Math.atan2(e.aimY, e.aimX));
      const g = ctx.createLinearGradient(0, 0, range, 0);
      g.addColorStop(0, e.def.telegraphColor + (alpha * 0.1).toFixed(3) + ')');
      g.addColorStop(0.3, e.def.telegraphColor + (alpha * 0.45).toFixed(3) + ')');
      g.addColorStop(1, e.def.telegraphColor + (alpha * 0.65).toFixed(3) + ')');
      ctx.fillStyle = g;
      ctx.fillRect(0, -width/2, range, width);
      ctx.strokeStyle = e.def.telegraphColor + alpha.toFixed(3) + ')';
      ctx.lineWidth = 2;
      ctx.strokeRect(0, -width/2, range, width);
      // Arrow tip at the end
      ctx.beginPath();
      ctx.moveTo(range, -width/2 - 4);
      ctx.lineTo(range + 14, 0);
      ctx.lineTo(range, width/2 + 4);
      ctx.stroke();
      ctx.restore();
    } else if (e.def.behavior === 'priest') {
      // Green beam from priest to heal target
      const t = e.stateTime / e.def.healWindup;
      if (t > 1) continue;
      const target = e._healTarget;
      if (!target || target.dead) continue;
      const alpha = Math.min(0.8, (0.3 + 0.4 * Math.sin(t * Math.PI * 4)) * (0.3 + 0.7 * t));
      ctx.save();
      ctx.strokeStyle = 'rgba(126, 220, 176, ' + alpha.toFixed(3) + ')';
      ctx.lineWidth = 4;
      ctx.setLineDash([8, 4]);
      ctx.beginPath();
      ctx.moveTo(e.x, e.y - 10);
      ctx.lineTo(target.x, target.y - 10);
      ctx.stroke();
      ctx.setLineDash([]);
      // Target highlight ring
      ctx.strokeStyle = 'rgba(200, 255, 210, ' + alpha.toFixed(3) + ')';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(target.x, target.y - 10, 22 + t * 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    } else if (e.def.behavior === 'bomber') {
      const t = e.stateTime / e.def.windup;
      if (t > 1) continue;
      const alpha = 0.35 + 0.35 * Math.sin(t * Math.PI * 3);
      const R = e.def.blastRadius;
      ctx.save();
      const g = ctx.createRadialGradient(e.x, e.y - 4, 4, e.x, e.y - 4, R);
      g.addColorStop(0, 'rgba(255, 80, 50, ' + (alpha * 0.55).toFixed(3) + ')');
      g.addColorStop(0.7, 'rgba(255, 60, 40, ' + (alpha * 0.25).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(255, 60, 40, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(e.x - R, e.y - 4 - R, R * 2, R * 2);
      ctx.strokeStyle = 'rgba(255, 80, 40, ' + alpha.toFixed(3) + ')';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(e.x, e.y - 4, R * t, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }
}
