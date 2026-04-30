// Enemies — Tiny RPG sprites (100x100). Types now include melee, ranged, and
// explosive behaviors with attack telegraphs to make combat readable.
import { images } from './loader.js';
import { isWallAtWorld, spawnExtraFirePool } from './room.js';
import { deathBurst, hitSpark, sparkle, bloodDrip, killRing } from './particles.js';
import { playSfx } from './sfx.js';
import { shakeCamera, pulseZoom, worldToScreen } from './camera.js';
import { mouse, keys } from './input.js';
import { damageHero, hero } from './hero.js';
import { spawnArrow, spawnOrb } from './projectiles.js';
import { dropGold } from './gold.js';
import { stats } from './stats';
import { spawnExplosion, spawnSoulBurst, etherealRegisterKill } from './synergies.js';
import { triggerScreenFlash, spawnSoulTether, spawnDamageNumber } from './fx.js';
import { markSoulFired } from './counterPips.js';

// ============================================================================
// ELITE AFFIXES — rolled on elite spawn (floors 2+). Each affix has a unique
// mechanic + a colored aura + a single-letter badge (not a text label).
// ============================================================================
export const ELITE_AFFIXES = {
  frost: {
    id: 'frost', badge: 'F', name: 'Frost',
    desc: 'Hits chill you \u2014 movement slowed for 0.7s.',
    glow: 'rgba(120, 200, 255, ',
    auraColor: '#72c6ff',
    onHitHero: (_e) => { hero.slowTime = Math.max(hero.slowTime || 0, 0.7); hero.slowMul = 0.45; },
  },
  ember: {
    id: 'ember', badge: 'E', name: 'Ember',
    desc: 'Leaves a flame trail that burns on contact.',
    glow: 'rgba(255, 130, 70, ',
    auraColor: '#ff7a2a',
    trail: true,
    trailInterval: 0.22,
  },
  venom: {
    id: 'venom', badge: 'V', name: 'Venom',
    desc: 'Hits poison you for 4 seconds (0.5 dmg/sec).',
    glow: 'rgba(120, 220, 120, ',
    auraColor: '#6ae08a',
    onHitHero: (_e) => { hero.poisonTime = Math.max(hero.poisonTime || 0, 4); hero.poisonRate = 0.5; },
  },
  warded: {
    id: 'warded', badge: 'W', name: 'Warded',
    desc: 'Halves incoming damage until staggered twice.',
    glow: 'rgba(255, 220, 90, ',
    auraColor: '#ffd855',
    dmgReductionPct: 0.5,
    staggersToBreak: 2,
  },
};
const AFFIX_IDS = Object.keys(ELITE_AFFIXES);

// ---- Flame trail hazards spawned by ember elites (and Stride of Ash) ----
//
// Round-6 Stride of Ash mythic — hero-side flames fire on dodge end and
// damage ENEMIES, not the hero. Same visual + lifecycle as the bomber-
// elite flames; just flipped damage target via the `friendly` flag. The
// flag defaults false to preserve the original ember-elite behavior.
const _flames = [];
export function spawnEmberFlame(x, y, opts = {}) {
  _flames.push({
    x, y, t: 0,
    life: opts.life || 2.0,
    radius: opts.radius || 22,
    friendly: !!opts.friendly,
    damage: opts.damage || 1,
    hitSet: opts.friendly ? new Set() : null,    // per-enemy hit cooldown for friendly flames
  });
}
export function updateFlames(dt) {
  for (let i = _flames.length - 1; i >= 0; i--) {
    const f = _flames[i];
    f.t += dt;
    if (f.t >= f.life) { _flames.splice(i, 1); continue; }
    if (f.friendly) {
      // Damage enemies in range. Per-flame hitSet limits each enemy to
      // a single tick per flame (vs the once-every-0.5s pattern for the
      // hero-damage path) — Stride of Ash is meant to enable kiting,
      // not pin enemies in 30-tick burn lanes.
      const r2 = (f.radius + 14) * (f.radius + 14);
      for (const e of enemies) {
        if (e.dead || f.hitSet.has(e)) continue;
        const dx = e.x - f.x, dy = e.y - f.y;
        if (dx*dx + dy*dy < r2) {
          e.takeDamage(f.damage, 0, 0);
          f.hitSet.add(e);
        }
      }
    } else {
      // Damage hero on contact (cooldown to prevent tick-spam).
      if (!hero._flameCD || hero._flameCD <= 0) {
        const dx = hero.x - f.x, dy = hero.y - f.y;
        if (dx*dx + dy*dy < (f.radius + 14) * (f.radius + 14) && hero.state !== 'dodge') {
          damageHero(f.damage, f.x, f.y);
          hero._flameCD = 0.5;
        }
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

// ---- Ember Tyrant phase-2 fire rings ----
// Round-6 endgame audit: Ember Tyrant's enrage was mechanically thin
// (just speed +35% and a static 6-pillar fire ring, no new attack
// pattern). The rings here are a recurring radial wavefront — every
// emberRingInterval seconds while enraged, a new ring spawns at the
// boss's position and expands outward, dealing damage to anyone caught
// in the wavefront band [r-tol, r+tol]. Player must read the windup
// and step OFF the radial line, not just outrun it.
//
// Damage is resolved by per-ring "did we hit hero this pulse" flag —
// a single ring can hit the hero exactly once even if their position
// drifts back into the wavefront. Prevents the cheap multi-tick that
// would happen if hero stood still inside a slow-moving band.
const _emberRings = [];
const EMBER_RING_BAND = 28;        // hit tolerance — hero must clear ±28px of the leading edge

export function spawnEmberRing(x, y, maxR = 280, dur = 0.85, damage = 4) {
  _emberRings.push({ x, y, t: 0, dur, maxR, damage, hit: false });
}

export function updateEmberRings(dt) {
  for (let i = _emberRings.length - 1; i >= 0; i--) {
    const r = _emberRings[i];
    r.t += dt;
    if (r.t >= r.dur) { _emberRings.splice(i, 1); continue; }
    if (r.hit) continue;
    // Current ring radius — eased outward so the wavefront slows as it
    // reaches max range (gives the player a slightly longer reaction
    // window on the outer edge, where they're most likely to be).
    const k = r.t / r.dur;
    const ease = 1 - (1 - k) * (1 - k);    // ease-out quad
    const curR = ease * r.maxR;
    const dx = hero.x - r.x, dy = hero.y - r.y;
    const dh = Math.hypot(dx, dy);
    if (Math.abs(dh - curR) < EMBER_RING_BAND && hero.state !== 'dodge') {
      damageHero(r.damage, r.x, r.y);
      r.hit = true;     // one-shot per ring
    }
  }
}

export function drawEmberRings(ctx) {
  for (const r of _emberRings) {
    const k = r.t / r.dur;
    const ease = 1 - (1 - k) * (1 - k);
    const curR = ease * r.maxR;
    const a = (1 - k) * 0.85;
    // Outer glow band — wide gradient for the expanding wavefront.
    ctx.save();
    ctx.strokeStyle = `rgba(255, 140, 60, ${(a * 0.9).toFixed(3)})`;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(r.x, r.y, curR, 0, Math.PI * 2);
    ctx.stroke();
    // Inner bright leading edge — thinner, brighter, sells the fire crest.
    ctx.strokeStyle = `rgba(255, 220, 160, ${(a * 0.85).toFixed(3)})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(r.x, r.y, curR - 2, 0, Math.PI * 2);
    ctx.stroke();
    // Trailing soft afterglow — thinner band behind the leading edge.
    if (curR > 30) {
      ctx.strokeStyle = `rgba(220, 80, 30, ${(a * 0.45).toFixed(3)})`;
      ctx.lineWidth = 14;
      ctx.beginPath();
      ctx.arc(r.x, r.y, curR - 12, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
}

export function clearEmberRings() { _emberRings.length = 0; }

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
    // weight: per-enemy hit-shake multiplier consumed by hero.js's
    // melee swing handler. 0.6 = soft tap (slime). Heavier enemies
    // override this; bosses default to 1.0 explicit. Game-feel audit P0.
    weight: 0.6,
    // SIZING PASS — Tiny-RPG sprites fill only ~15% of their 100 cell while
    // the PixelLab mage hero fills 93% of its 128 cell. Without compensation
    // a minion drawSize of 80 reads as ~12 px visible vs the hero's ~56 px,
    // making combat unreadable. Bumped 80→200 so visible body lands ~30 px
    // — still smaller than the hero (intentional: slime is the tutorial mob)
    // but actually fightable instead of postage-stamp size.
    prefix: 'slime_',  drawSize: 200, radius: 22, speed: 95,  hp: 70,  damage: 1,
    color: '#6acc78', hitCD: 0.65, fps: 10, behavior: 'melee',
    attackReach: 42, attackArc: Math.PI * 0.42,
    windup: 0.25, swing: 0.22,
    // Round-6 AV audit — F1/F2 melee telegraphs were all monochrome red
    // (slime/skel/orc/archer all in the rgba(220,60-80,55-80) range), so
    // 4-6 winding enemies blurred into "general red soup" with no per-
    // enemy reading. Slime gets acidic green-yellow to match its body
    // tint (#6acc78); skeleton gets bone-white; orc stays canonical
    // melee-red; archer gets amber for "ranged threat". Heavy attacks
    // still flash orange via heavyColor across all enemies, preserving
    // the universal "this hits hard" reading.
    telegraphColor: 'rgba(170, 220, 90, ',
    windupSfx: { key: 'slime_hit', rate: 0.75, volume: 0.4 },
    bloodColor: '#3a7a42',
    displayName: 'SLIME',
    flavor: 'what the ruin makes when it forgets what living was for',
  },
  skel:   {
    weight: 0.85,
    element: 'cold',                 // resists cold, weak to fire/shock
    prefix: 'skel_',   drawSize: 220, radius: 22, speed: 118, hp: 95,  damage: 1,
    color: '#cfd4d9', hitCD: 0.80, fps: 10, behavior: 'melee',
    attackReach: 54, attackArc: Math.PI * 0.48,
    windup: 0.28, swing: 0.22,
    // Bone-white telegraph — matches the dust-and-bone body palette,
    // visually distinct from slime's acid-green and orc's blood-red so
    // a 3-skel + 2-orc + 1-slime room reads as three separate threats
    // not one red blob. (See slime def for the full Round-6 rationale.)
    telegraphColor: 'rgba(225, 215, 195, ',
    windupSfx: { key: 'footstep_0', rate: 1.7, volume: 0.55 },
    bloodColor: '#4a4038',             // skeletons leave dust and old bone-dark
    displayName: 'SKELETON',
    flavor: 'the dead who were promised rest, and given knives',
  },
  orc:    {
    weight: 1.15,
    // Common mid-tier melee. Boss-tier fields (WARCHIEF GRUDNOK display
    // name, boss flavor) moved to elite_orc when the boss sprite split
    // landed — orc def is now common-mob-only. Keeps the heavy-variant
    // swing for combat variety; HP stays at 200 (highest of the common
    // mobs) so the player feels orcs as the "heavy guy" tier in F2-F4
    // comps. SFX kept on hero_hurt so the windup still reads heavy.
    prefix: 'orc_',    drawSize: 220, radius: 26, speed: 80, hp: 200, damage: 2,
    color: '#7fa34a', hitCD: 0.92, fps: 8, behavior: 'melee',
    attackReach: 62, attackArc: Math.PI * 0.60,
    windup: 0.38, swing: 0.26,
    telegraphColor: 'rgba(210, 45, 55, ',
    displayName: 'ORC',
    flavor: 'iron-bone clansman. fights long after the chieftain falls.',
    heavyChance: 0.30,
    heavyReach: 90, heavyArc: Math.PI * 0.85,
    heavyWindup: 0.70, heavySwing: 0.32,
    heavyDamage: 3,
    heavyColor: 'rgba(255, 140, 40, ',
    windupSfx: { key: 'hero_hurt', rate: 0.55, volume: 0.6 },
    heavyWindupSfx: { key: 'hero_hurt', rate: 0.38, volume: 0.85 },
  },
  archer: {
    prefix: 'archer_', drawSize: 200, radius: 20, speed: 100, hp: 60,  damage: 1,
    color: '#d8c7a8', attackRange: 420, hitCD: 1.0, fps: 10, behavior: 'ranged',
    windup: 0.36, swing: 0.20, preferDist: 220, minDist: 130,
    // Amber telegraph — Round-6 AV diversification. Distinguishes the
    // archer's nock-and-loose from the melee red palette so the player
    // can tell "ranged threat at distance" from "melee about to swing"
    // without checking sprite identity in heavy combat.
    telegraphColor: 'rgba(245, 175, 80, ',
    windupSfx: { key: 'click', rate: 0.7, volume: 0.5 },
    displayName: 'ARCHER',
    flavor: 'chose the dark over starving. regrets neither.',
  },
  bomber: {
    prefix: 'slime_',  drawSize: 130, radius: 18, speed: 165, hp: 36,  damage: 2,
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
    prefix: 'lancer_', drawSize: 220, radius: 22, speed: 120, hp: 90, damage: 2,
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
    weight: 1.25,
    prefix: 'orc_',    drawSize: 220, radius: 26, speed: 70, hp: 120, damage: 2,
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
    prefix: 'wiz_',    drawSize: 220, radius: 20, speed: 55, hp: 90, damage: 2,
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
    prefix: 'wiz_',    drawSize: 200, radius: 20, speed: 60, hp: 70, damage: 2,
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
    prefix: 'priest_', drawSize: 200, radius: 20, speed: 70, hp: 60, damage: 0,
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
    prefix: 'orc_',    drawSize: 230, radius: 26, speed: 96, hp: 140, damage: 2,
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
    prefix: 'bonecap_', drawSize: 240, radius: 28, speed: 115, hp: 220, damage: 2,
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
    // LIFE-DRAIN — every successful hit on the hero heals the boss for
    // 4 HP (8 on enrage) and spawns a red soul-tether VFX from hero to
    // boss. The flavor + boss-clear loot pool ("life-drain: bloodstone,
    // reaver, bloodrite") promise this mechanic; this is its actual
    // implementation. Without it the floor-2 boss had zero mechanical
    // identity vs a generic captain.
    onHitHero: (e) => {
      const heal = e._enraged ? 8 : 4;
      e.hp = Math.min(e.maxHp, e.hp + heal);
      try { spawnSoulTether(hero.x, hero.y - 8, e.x, e.y - 12, {
        color: 'rgba(220, 60, 80, 0.9)',
        life: 0.55,
      }); } catch (_) {}
      // Floating green heal number above the boss so the player SEES
      // the cost of getting hit. Scales with enrage.
      try { spawnDamageNumber(e.x, e.y - 28, heal, {
        text: '+' + heal,
        color: '#86e3a8',
      }); } catch (_) {}
    },
  },
  // ---- Floor 3 boss: Broodmother — werebear with enrage + spawning bombers ----
  broodmother: {
    prefix: 'brood_',  drawSize: 280, radius: 34, speed: 58,  hp: 240, damage: 3,
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
  // Round-6 endgame audit retune (commit b5ca19d era):
  //   - heavyDamage 4 → 5: matches Broodmother's heavy bite. Final boss
  //     should never hit softer than the floor-3 boss.
  //   - emberRingInterval added: while enraged, the boss pulses an
  //     expanding fire ring from his position every 4s. Distinct from
  //     the floor-fire static pillars (which spawn on enrage but DO NOT
  //     change the boss's swing rhythm). The ring forces the player to
  //     find a kiting line away from the boss every cycle, which gives
  //     the climactic phase a mechanical identity beyond "+35% speed".
  ember_tyrant: {
    element: 'fire',                 // resists fire, weak to cold/shock
    prefix: 'ember_',  drawSize: 280, radius: 30, speed: 82,  hp: 280, damage: 3,
    color: '#e85020', hitCD: 0.95, fps: 8, behavior: 'melee',
    attackReach: 78, attackArc: Math.PI * 0.62,
    windup: 0.42, swing: 0.28,
    telegraphColor: 'rgba(255, 140, 50, ',
    // Heavy swing variant
    heavyChance: 0.40,
    heavyReach: 104, heavyArc: Math.PI * 0.90,
    heavyWindup: 0.68, heavySwing: 0.34,
    heavyDamage: 5,
    heavyColor: 'rgba(255, 80, 30, ',
    // Boss phases — spawn bombers at thresholds + enrage
    enrageAt: 0.5,
    enrageSpeedMul: 1.35,
    enrageDamageMul: 1.25,
    bomberAt: [0.75, 0.50, 0.25],
    summonAt: [0.33],               // also summons an archer once
    // Phase-2 fire-ring pulse — every emberRingInterval seconds while
    // the boss is enraged, an expanding ring of fire emanates from his
    // body. emberRingMaxR is the outer reach of the ring; the visual
    // grows from 0 to maxR over emberRingDur seconds, dealing damage
    // to anyone caught in the wavefront. Hero must read the windup
    // tell + sidestep along the radial line. See updateBossPhases.
    emberRingInterval: 4.0,
    emberRingDur: 0.85,
    emberRingMaxR: 280,
    emberRingDamage: 4,
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
    prefix: 'warden_',  drawSize: 240, radius: 28, speed: 65, hp: 140, damage: 2,
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
    prefix: 'wiz_',      drawSize: 240, radius: 24, speed: 40, hp: 180, damage: 3,
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
    prefix: 'dreadmage_', drawSize: 220, radius: 20, speed: 72, hp: 95, damage: 2,
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
    prefix: 'haunt_',   drawSize: 180, radius: 18, speed: 130, hp: 55, damage: 1,
    color: '#ff8050', attackRange: 320, hitCD: 1.15, fps: 12, behavior: 'ranged',
    windup: 0.32, swing: 0.18, preferDist: 240, minDist: 160,
    telegraphColor: 'rgba(255, 100, 80, ',
    windupSfx: { key: 'click', rate: 1.35, volume: 0.5 },
    displayName: 'HAUNT',
    bloodColor: '#c8503a',
    flavor: 'a hunger with wings. it has time.',
    flies: true,                     // future-proof flag for airborne collision
  },

  // ==========================================================================
  // TINY RPG KIT — six characters from the existing kit that were sitting
  // unused. Wired in by tools/ingest_enemy_pack.py. Each fills a specific
  // role gap from the audit:
  //   werewolf            — fast bestial skirmisher (F3 abyss)
  //   werebear            — heavy bestial brute (F3+F4)
  //   skel_archer         — bone ranged (replaces archer in F1 crypt)
  //   knight_enemy        — proper armored melee (retires vanguard's orc-retint)
  //   armored_skel        — heavy bone melee (F2 vault garrison)
  //   greatsword_skel     — heavy bone cleaver (F2/F3 elite slot)
  // All six bind to the existing behavior updaters (melee, ranged) — no new
  // combat code. Loader keys live at loader.js with a `_enemy` suffix where
  // they would otherwise collide with the player's knight slot.
  // ==========================================================================

  // ---- WEREWOLF — F3 fast bestial skirmisher. Closes gaps fast, short
  // windup makes it punishing if the player commits the wrong attack arc.
  // Pairs with werebear (slow brute) for the Spire's chase/corner dynamic.
  werewolf: {
    prefix: 'werewolf_', drawSize: 220, radius: 22, speed: 150, hp: 110, damage: 2,
    color: '#8a6a4a', hitCD: 0.70, fps: 12, behavior: 'melee',
    attackReach: 56, attackArc: Math.PI * 0.45,
    windup: 0.22, swing: 0.20,
    telegraphColor: 'rgba(220, 100, 80, ',
    windupSfx: { key: 'slime_hit', rate: 1.4, volume: 0.55 },
    bloodColor: '#5a3a28',
    displayName: 'WEREWOLF',
    flavor: 'the moon does not rise here. it does not need to.',
  },

  // ---- WEREBEAR — F3+F4 heavy bestial brute. Massive HP and damage,
  // very slow speed. Heavy variant on every third swing creates the
  // "wide telegraph, do not stand here" beat the audit flagged as
  // missing on floor 3. Reuses orc's heavy fields (no new combat code).
  werebear: {
    prefix: 'werebear_', drawSize: 250, radius: 30, speed: 60, hp: 180, damage: 3,
    color: '#6a5040', hitCD: 1.20, fps: 8, behavior: 'melee',
    attackReach: 80, attackArc: Math.PI * 0.65,
    windup: 0.55, swing: 0.32,
    telegraphColor: 'rgba(220, 80, 60, ',
    heavyChance: 0.35,
    heavyReach: 110, heavyArc: Math.PI * 0.95,
    heavyWindup: 0.85, heavySwing: 0.40,
    heavyDamage: 4,
    heavyColor: 'rgba(255, 110, 50, ',
    windupSfx: { key: 'hero_hurt', rate: 0.55, volume: 0.65 },
    heavyWindupSfx: { key: 'hero_hurt', rate: 0.40, volume: 0.85 },
    bloodColor: '#3a2818',
    displayName: 'WEREBEAR',
    flavor: 'remembers being a man. uses it for nothing.',
  },

  // ---- SKEL_ARCHER — bone-themed ranged unit. Same kit as the human
  // archer but reads as crypt-native instead of "guard who got lost".
  // Cold-element resistance matches skel; otherwise statline mirrors
  // archer so the COMP slots are drop-in compatible.
  skel_archer: {
    element: 'cold',
    prefix: 'skel_archer_', drawSize: 200, radius: 20, speed: 100, hp: 60, damage: 1,
    color: '#cfd4d9', attackRange: 420, hitCD: 1.0, fps: 10, behavior: 'ranged',
    windup: 0.36, swing: 0.20, preferDist: 220, minDist: 130,
    telegraphColor: 'rgba(220, 60, 70, ',
    windupSfx: { key: 'click', rate: 0.7, volume: 0.5 },
    displayName: 'BONE ARCHER',
    bloodColor: '#4a4038',
    flavor: 'the bow remembered the hand. the hand was new.',
  },

  // ---- KNIGHT_ENEMY — proper armored melee with a real shield in the
  // sprite. Drop-in replacement for vanguard's "orc with cyan filter"
  // hack. Same shield mechanics (4 charges, 140° arc, 82% reduction)
  // as vanguard so existing flank-to-break tactics still work. The
  // `_enemy` suffix in the prefix avoids collision with player knight
  // sprite keys (assets/characters/knight_*.png).
  knight_enemy: {
    prefix: 'knight_enemy_', drawSize: 220, radius: 24, speed: 75, hp: 130, damage: 2,
    color: '#b8c4d0', hitCD: 1.10, fps: 8, behavior: 'melee',
    attackReach: 64, attackArc: Math.PI * 0.60,
    windup: 0.45, swing: 0.26,
    telegraphColor: 'rgba(200, 220, 240, ',
    shieldCharges: 4,
    shieldArc: Math.PI * 0.78,
    shieldReduction: 0.82,
    windupSfx: { key: 'footstep_0', rate: 1.0, volume: 0.6 },
    displayName: 'KNIGHT',
    bloodColor: '#7a6a58',
    flavor: 'sworn to the gate that no longer holds.',
  },

  // ---- ARMORED_SKEL — heavy bone melee. F2 vault "former garrison"
  // theme. Lighter shield than knight (3 charges, narrower arc, less
  // reduction) so it dies faster but reads as the same "flank to
  // break" puzzle. Cold resist matches the skel family.
  armored_skel: {
    element: 'cold',
    prefix: 'armored_skel_', drawSize: 220, radius: 22, speed: 70, hp: 130, damage: 2,
    color: '#a8b4c0', hitCD: 1.05, fps: 9, behavior: 'melee',
    attackReach: 60, attackArc: Math.PI * 0.55,
    windup: 0.40, swing: 0.24,
    telegraphColor: 'rgba(200, 200, 230, ',
    shieldCharges: 3,
    shieldArc: Math.PI * 0.62,
    shieldReduction: 0.65,
    windupSfx: { key: 'footstep_0', rate: 1.4, volume: 0.55 },
    displayName: 'ARMORED SKELETON',
    bloodColor: '#4a4038',
    flavor: 'the garrison kept its post. the world changed around it.',
  },

  // ---- GREATSWORD_SKEL — heavy cleaver elite. Slow melee with massive
  // heavy-variant cleave (50% chance, 180° arc). Sits between bone_captain
  // (boss) and skel (light) in the bone-tier ladder. Floor 2 elite slot
  // and floor 3 tier-3 backline. Cold resist matches skel family.
  greatsword_skel: {
    element: 'cold',
    prefix: 'greatsword_skel_', drawSize: 240, radius: 26, speed: 70, hp: 170, damage: 3,
    color: '#b0b8c0', hitCD: 1.20, fps: 8, behavior: 'melee',
    attackReach: 70, attackArc: Math.PI * 0.65,
    windup: 0.55, swing: 0.30,
    telegraphColor: 'rgba(220, 200, 200, ',
    heavyChance: 0.50,
    heavyReach: 100, heavyArc: Math.PI * 1.0,
    heavyWindup: 0.85, heavySwing: 0.40,
    heavyDamage: 4,
    heavyColor: 'rgba(255, 100, 60, ',
    windupSfx: { key: 'hero_hurt', rate: 0.55, volume: 0.65 },
    heavyWindupSfx: { key: 'hero_hurt', rate: 0.40, volume: 0.85 },
    bloodColor: '#4a4038',
    displayName: 'GREATSWORD SKELETON',
    flavor: 'a blade too heavy for the living. perfect, then, for the dead.',
  },

  // ==========================================================================
  // TINY RPG KIT — full-roster pass (second batch). Closes the kit:
  //   F2 introduction:  soldier (basic armored, the "everyman" footsoldier)
  //   F3 introductions: swordsman, armored_axeman, armored_orc
  //   F4 introductions: knight_templar (holy elite), orc_rider (rare mounted)
  //   F1 boss sprite:   elite_orc (proper visual differentiation for Grudnok)
  // Stat rationale captured in each comment block below.
  // ==========================================================================

  // ---- SOLDIER — F2 basic armored melee. Lighter than knight_enemy
  // (no shield, fewer HP) so F2 garrison comps have a "rank-and-file"
  // tier beneath the elite armored layer. Reads as the "common guard"
  // archetype the player kills many of, vs knight_enemy as the rarer
  // shielded officer.
  soldier: {
    prefix: 'soldier_', drawSize: 220, radius: 22, speed: 80, hp: 100, damage: 2,
    color: '#c0c8d0', hitCD: 1.0, fps: 9, behavior: 'melee',
    attackReach: 60, attackArc: Math.PI * 0.55,
    windup: 0.38, swing: 0.24,
    telegraphColor: 'rgba(220, 220, 220, ',
    windupSfx: { key: 'footstep_0', rate: 1.1, volume: 0.55 },
    bloodColor: '#7a6a58',
    displayName: 'SOLDIER',
    flavor: 'wore the colors of a kingdom that no longer exists.',
  },

  // ---- SWORDSMAN — F3 agile mid-tier melee. Faster than the heavy
  // armored variants, shorter windup; rewards aggressive play but
  // punishes mistakes. Sits between werewolf (skirmisher) and
  // armored_axeman (heavy) on the F3 melee spectrum.
  swordsman: {
    prefix: 'swordsman_', drawSize: 220, radius: 20, speed: 115, hp: 95, damage: 2,
    color: '#d4c8a0', hitCD: 0.85, fps: 11, behavior: 'melee',
    attackReach: 62, attackArc: Math.PI * 0.50,
    windup: 0.26, swing: 0.20,
    telegraphColor: 'rgba(220, 180, 100, ',
    windupSfx: { key: 'footstep_0', rate: 1.5, volume: 0.55 },
    bloodColor: '#7a6a58',
    displayName: 'SWORDSMAN',
    flavor: 'practiced the form a thousand times. the form practices back.',
  },

  // ---- ARMORED_AXEMAN — F3 heavy axe brute. Human-armor counterpart to
  // greatsword_skel. Massive cleave, slow windup, big damage. Common
  // F3 elite slot; rewards staying out of the swing arc until commit.
  armored_axeman: {
    prefix: 'armored_axeman_', drawSize: 240, radius: 26, speed: 70, hp: 160, damage: 3,
    color: '#a8b0b8', hitCD: 1.15, fps: 8, behavior: 'melee',
    attackReach: 76, attackArc: Math.PI * 0.70,
    windup: 0.55, swing: 0.32,
    telegraphColor: 'rgba(220, 170, 80, ',
    heavyChance: 0.40,
    heavyReach: 110, heavyArc: Math.PI * 0.95,
    heavyWindup: 0.85, heavySwing: 0.40,
    heavyDamage: 4,
    heavyColor: 'rgba(255, 120, 60, ',
    windupSfx: { key: 'hero_hurt', rate: 0.55, volume: 0.65 },
    heavyWindupSfx: { key: 'hero_hurt', rate: 0.38, volume: 0.85 },
    bloodColor: '#5a4838',
    displayName: 'ARMORED AXEMAN',
    flavor: 'the axe is heavy. the doubt is heavier. neither slows him.',
  },

  // ---- ARMORED_ORC — F3 armored orc variant. Narrative call-back to
  // Grudnok's veterans: orcs that came back from F1 stronger. Heavier
  // than common orc, has a shield (3 charges, 65% reduction) plus the
  // heavy-swing field — combines vanguard mechanics with orc damage.
  armored_orc: {
    prefix: 'armored_orc_', drawSize: 230, radius: 28, speed: 75, hp: 180, damage: 2,
    color: '#9aa8a0', hitCD: 1.0, fps: 9, behavior: 'melee',
    attackReach: 64, attackArc: Math.PI * 0.60,
    windup: 0.42, swing: 0.26,
    telegraphColor: 'rgba(210, 80, 80, ',
    heavyChance: 0.32,
    heavyReach: 92, heavyArc: Math.PI * 0.88,
    heavyWindup: 0.72, heavySwing: 0.34,
    heavyDamage: 3,
    heavyColor: 'rgba(255, 130, 50, ',
    shieldCharges: 3,
    shieldArc: Math.PI * 0.70,
    shieldReduction: 0.65,
    windupSfx: { key: 'hero_hurt', rate: 0.60, volume: 0.6 },
    heavyWindupSfx: { key: 'hero_hurt', rate: 0.42, volume: 0.85 },
    bloodColor: '#3a4a3a',
    displayName: 'ARMORED ORC',
    flavor: 'survived the warchief. learned what survival costs.',
  },

  // ---- ELITE_ORC — F1 BOSS sprite (Grudnok). Replaces the orc-def-
  // doubles-as-boss hack so the F1 boss is visually distinct from the
  // common orcs the player kills in F2-F4. All boss-fight stats
  // (heavy variant 30%, the WARCHIEF GRUDNOK display name + flavor)
  // live here now. Common orc keeps its mid-tier mob role.
  // Also slots into the F2 mini-boss rotation as a callback to F1.
  elite_orc: {
    prefix: 'elite_orc_', drawSize: 230, radius: 28, speed: 85, hp: 200, damage: 2,
    color: '#7fa34a', hitCD: 0.92, fps: 9, behavior: 'melee',
    attackReach: 66, attackArc: Math.PI * 0.62,
    windup: 0.38, swing: 0.26,
    telegraphColor: 'rgba(210, 45, 55, ',
    heavyChance: 0.32,
    heavyReach: 96, heavyArc: Math.PI * 0.90,
    heavyWindup: 0.70, heavySwing: 0.34,
    heavyDamage: 3,
    heavyColor: 'rgba(255, 140, 40, ',
    windupSfx: { key: 'hero_hurt', rate: 0.55, volume: 0.6 },
    heavyWindupSfx: { key: 'hero_hurt', rate: 0.38, volume: 0.85 },
    bloodColor: '#3a4a30',
    displayName: 'WARCHIEF GRUDNOK',
    flavor: 'chieftain of the iron-bone clans',
    bossTrack: 'boss',
    // PHASE 2 — boss audit P1. Grudnok had no enrageAt at all so the
    // existing phase-intro audio sting + iframe scaffolding never fired
    // for the floor-1 boss. He was a pure stat-stick. Now: at 45% HP,
    // enrage triggers a "warchief roar" — heavyChance jumps from 0.32
    // to 0.65 so the slow heavy-cleave windup dominates phase 2, and
    // basic stat multipliers go up too. The roar effect (extra heavy
    // bias + 4 summoned orcs on FIRST enrage) lives in the enrage
    // hook in updateEnemies.
    enrageAt: 0.45, enrageSpeedMul: 1.25, enrageDamageMul: 1.20,
    enrageHeavyChance: 0.65,
    enrageSummonOrcs: 4,
  },

  // ---- KNIGHT_TEMPLAR — F4 holy armored elite. Pairs with priest
  // for "templar guard" comps. Highest shield reduction in the kit
  // (4 charges, 85% reduction) — the most imposing armored unit
  // short of a boss. Fire element matches the F4 inferno biome.
  knight_templar: {
    element: 'fire',
    prefix: 'knight_templar_', drawSize: 230, radius: 24, speed: 75, hp: 150, damage: 2,
    color: '#e8d8a0', hitCD: 1.10, fps: 8, behavior: 'melee',
    attackReach: 66, attackArc: Math.PI * 0.62,
    windup: 0.48, swing: 0.28,
    telegraphColor: 'rgba(255, 200, 120, ',
    shieldCharges: 4,
    shieldArc: Math.PI * 0.80,
    shieldReduction: 0.85,
    windupSfx: { key: 'footstep_0', rate: 0.85, volume: 0.6 },
    bloodColor: '#c9a86a',
    displayName: 'KNIGHT TEMPLAR',
    flavor: 'sworn to a fire that no longer warms anyone.',
  },

  // ---- ORC_RIDER — F4 rare mounted unit. Lancer-style charge behavior
  // suits the mounted theme (charges in straight lines, the rider-as-
  // missile read). Higher HP than lancer, longer charge range. Rare
  // slot in tier4; alternative F4 mini-boss option vs hermit.
  orc_rider: {
    prefix: 'orc_rider_', drawSize: 250, radius: 28, speed: 130, hp: 180, damage: 3,
    color: '#a89060', hitCD: 1.4, fps: 9, behavior: 'lancer',
    chargeRange: 460,
    chargeWidth: 42,
    chargeWindup: 0.65,
    chargeTravel: 0.30,
    preferDist: 320, minDist: 200,
    telegraphColor: 'rgba(220, 160, 90, ',
    windupSfx: { key: 'footstep_0', rate: 0.72, volume: 0.65 },
    bloodColor: '#3a4a30',
    displayName: 'ORC RIDER',
    flavor: 'rides a thing that should not still be running.',
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
      // Round-7-audit fix: push-only callers (Heart of the Wound's
      // 200px shockwave, Phoenix Cloak's explosive revive at radius=180
      // with damage=0) need knockback + brief stagger to displace
      // attackers, but should NOT trigger hit-streak / hit-flash /
      // hit-pop. The full hit-reaction at the bottom of this function
      // would fire for amount=0 — counter incremented, hitFlash 0.14,
      // _hitPopT 0.06 — making "I survived a lethal hit" look like
      // "I tickled the orc." Early-return here keeps the knockback
      // intent without the cosmetic crosstalk.
      if (amount <= 0) {
        this.knockbackX = (dirX || 0) * 320;
        this.knockbackY = (dirY || 0) * 320;
        this.stagger = Math.max(this.stagger || 0, 0.18);
        return;
      }
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
        // BLOOD ASCENDANCE — flat HP-on-kill at theme tier 2. Set by
        // themes.js applyThemeTiers; 0 unless 5/5 BLOOD relics are owned.
        // Memory of the Hollow gates this off (matches the lifesteal
        // gate at hero.js:1567) so the trap-pick warning is consistent.
        if (hero.themeLifeOnKill > 0 && !hero.memoryHollow && hero.hp < hero.maxHp) {
          hero.hp = Math.min(hero.maxHp, hero.hp + hero.themeLifeOnKill);
        }
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
        // Round-7 ROOM REWARD — gold-flagged rooms (door label "GOLD")
        // multiply per-kill drops by 1.5x so the door's promise matches
        // reality. Composes with EMPRESS (×2) and Coin of the Tyrant
        // (×1.5 via hero.goldMul, applied downstream in dropGold's
        // consumer logic).
        let coinCount = this.boss ? 40 : this.elite ? (6 + (Math.random() * 5 | 0)) : (1 + (Math.random() * 3 | 0));
        if (typeof window !== 'undefined' && window.__tarotEmpress) coinCount *= 2;
        const roomMul = (typeof window !== 'undefined' && window.__roomGoldMul) || 1;
        if (roomMul !== 1) coinCount = Math.max(1, Math.round(coinCount * roomMul));
        dropGold(this.x, this.y - 8, coinCount);

        // SYNERGY: Explosive Kill — detonate on death
        if (hero.explosiveKill && !this.boss) {
          spawnExplosion(this.x, this.y - 8, 72, 22 * (hero.damageMul || 1));
        }
        // SYNERGY: Soul Burst — every 5th kill spawns a soul wave
        if (hero.soulBurst && !this.boss) {
          hero.soulKillCount = (hero.soulKillCount || 0) + 1;
          if (hero.soulKillCount % 5 === 0) {
            markSoulFired();   // visible pip-row flash
            spawnSoulBurst(this.x, this.y - 12, 8, 18 * (hero.damageMul || 1));
          }
        }
        // LEGENDARY: Ethereal Binding — every 3rd kill grants 1s i-frames
        etherealRegisterKill();
        // MYTHIC: Coin of the Tyrant — every 8th kill drops a free common
        // relic at the corpse. Routed through a window callback set up in
        // main.js so enemies.js doesn't need to import pedestals/relics
        // directly (avoids the circular dep that bit us last time).
        if (hero.coinOfTyrant) {
          hero.coinOfTyrantCounter = (hero.coinOfTyrantCounter || 0) + 1;
          if (hero.coinOfTyrantCounter % 8 === 0
              && typeof window !== 'undefined'
              && typeof window.__coinOfTyrantSpawnRelic === 'function') {
            window.__coinOfTyrantSpawnRelic(this.x, this.y);
          }
        }
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

// Fade duration after room.cleared flips. After this many seconds the
// corpse is rendered at alpha 0 (effectively gone). Tuned so the room
// reads as "battle ended" within ~1.2s instead of "battle still
// happening" for the entire reward-pickup phase. Keeps the silhouette
// briefly so the player sees "where the fights were" without the red
// splatter clutter that competes with pedestal beams.
const CORPSE_FADE_DUR = 1.2;

// Draw corpses on the floor — call BEFORE drawEnemy so living enemies render on top.
// Blood pool + darker splatter dots + faint body silhouette, all with slight
// per-corpse jitter from the seed.
//
// `room` is optional: when present, corpses fade out over CORPSE_FADE_DUR
// once room.cleared is true (room.clearedAt timestamp drives the fade).
// Splatter dots are skipped entirely once cleared so the post-combat
// reward-pickup phase doesn't have red dots competing with pedestal
// beams + tier rings + sparkle particles in the same north-center band.
export function drawCorpses(ctx, room = null) {
  const now = performance.now() / 1000;
  const cleared = !!(room && room.cleared);
  const clearedAt = (room && room.clearedAt) || 0;
  // Compute the global fade multiplier ONCE (same for every corpse this
  // frame — we don't fade individual corpses by their own death time).
  let fadeAlpha = 1;
  if (cleared && clearedAt > 0) {
    fadeAlpha = Math.max(0, 1 - (now - clearedAt) / CORPSE_FADE_DUR);
    if (fadeAlpha <= 0) return;     // fully faded — skip all rendering
  }
  for (const c of corpses) {
    const age = now - c.spawnTime;
    // Blood pool expands for the first 0.4s, then holds steady
    const expand = Math.min(1, age / 0.4);
    const baseR = (c.boss ? 22 : c.elite ? 14 : 10) * expand;
    const jitter = ((c.seed * 7) % 1) * 6;
    const splatterR = baseR * 1.35;
    ctx.save();
    // Faint drop shadow where the body fell
    ctx.fillStyle = `rgba(0,0,0,${(0.25 * fadeAlpha).toFixed(3)})`;
    ctx.beginPath();
    ctx.ellipse(c.x, c.y + 6, baseR * 1.2, baseR * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
    // Main blood pool
    ctx.globalAlpha = fadeAlpha;
    const g = ctx.createRadialGradient(c.x, c.y + 4, 1, c.x, c.y + 4, splatterR);
    g.addColorStop(0, c.color);
    g.addColorStop(0.7, c.color + (c.color.length === 7 ? 'aa' : ''));
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(c.x, c.y + 4, splatterR, splatterR * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    // Splatter dots around the pool — SKIPPED ENTIRELY ONCE CLEARED so
    // they don't visually compete with pedestal beams + sparkle particles
    // in the post-combat reward-pickup phase.
    if (!cleared) {
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
    }
    ctx.globalAlpha = 1;
    // Dark silhouette lump where the body collapsed — very faint
    ctx.fillStyle = `rgba(10, 4, 8, ${(0.35 * fadeAlpha).toFixed(3)})`;
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

// ── RANGED-COUNTER: kite penalty ──────────────────────────────────────
// When the hero stands still at long range (e.g. wand player camping
// outside enemy reach), enemies that NEED to close — melee, bombers,
// lancers in chase phase — get a speed bonus toward the hero. Caps at
// +35% bonus after 2.5s of stationary kiting at >250px. Ramp-up over
// the first 1.9s of stillness so a player who pauses briefly to read
// a relic doesn't get instantly punished.
//
// Ranged enemies (wizard, dreadmage, priest, archer, haunt) DON'T get
// the bonus — they have their own preferDist/minDist and aren't
// trying to close. Their threat is already projectile-based.
//
// Hero stationary tracker is hero._stillT — already maintained by
// hero.js for iron_resolve parry. Reused here so we don't duplicate
// state. Reset on movement / dodge / dash by hero.js.
function kiteCloseSpeedMul(dist) {
  const stillT = hero._stillT || 0;
  if (stillT < 0.6 || dist < 250) return 1;
  // 0% at stillT=0.6, ramps to 35% at stillT=2.5
  const ramp = Math.min(1, (stillT - 0.6) / 1.9);
  return 1 + 0.35 * ramp;
}

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
  // Distance-falloff shake — game-feel audit P1. Old code shook the
  // camera 12 amp / 0.3s for EVERY bomber explosion regardless of
  // distance. In Broodmother rooms with 3-4 bombers detonating, four
  // 12-amp shakes inside 2 seconds was unreadable. Now scales by
  // hero-distance: nearby explosions still slam (12 amp at point-blank),
  // far-off bombers (300px+) drop to ~3.6 amp — present but not
  // dominant. Threshold at 0.3 floor so even a far-off explosion has
  // SOME camera response (it's still an explosion).
  const _bdx = hero.x - e.x, _bdy = hero.y - e.y;
  const _bdist = Math.hypot(_bdx, _bdy);
  const _shakeFalloff = Math.max(0.3, 1 - _bdist / 300);
  shakeCamera(12 * _shakeFalloff, 0.25);
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
          // Boss-def onHitHero — Iron Revenant uses this to heal himself
          // (life-drain mechanic). Defined per-def so any future boss can
          // hook in without changes here.
          //
          // Bug-hunt P0 gates:
          // (a) skip if boss is dead — a swing can land mid-death-anim
          //     and the dead boss would heal back to alive frame.
          // (b) skip if hero.hp is 0 — phoenix-revive sets hp to 30%
          //     AFTER damageHero returns 'hit'; in revival cases the
          //     player didn't pay HP for the hit, so the boss shouldn't
          //     gain from it. Guard on hero.hp > 0 catches the brief
          //     death-state window.
          if (wasHit !== 'absorbed' && !e.dead && hero.hp > 0
              && e.def && e.def.onHitHero) {
            e.def.onHitHero(e);
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
    else {
      // Enraged Grudnok biases hard toward heavy swings — visible
      // rhythm change in phase 2 instead of just stat multipliers.
      const heavyChance = (e._enraged && e.def.enrageHeavyChance)
        ? e.def.enrageHeavyChance
        : e.def.heavyChance;
      e._heavy = heavyChance ? Math.random() < heavyChance : false;
    }
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
  // Primary move attempt toward hero. Kite-close speed bonus applies
  // when the hero is stationary at long range — so a wand player can't
  // just stand still and outrange melee threats indefinitely.
  const kiteMul = kiteCloseSpeedMul(dist);
  const primaryDx = nx * e.speed * kiteMul * dt + sepX * 40 * dt;
  const primaryDy = ny * e.speed * kiteMul * dt + sepY * 40 * dt;
  const prevX = e.x, prevY = e.y;
  tryMove(e, primaryDx, primaryDy);
  // Obstacle-detour: if primary move was blocked (didn't make meaningful progress),
  // try sliding perpendicular to the goal direction. This steers around pillars.
  const moveDelta = Math.hypot(e.x - prevX, e.y - prevY);
  if (moveDelta < Math.abs(primaryDx) * 0.3 + Math.abs(primaryDy) * 0.3) {
    // Perpendicular vectors
    const pxL = -ny, pyL = nx;         // left-perp
    const pxR = ny, pyR = -nx;         // right-perp
    // Try the side that brings us closer to hero. Same kiteMul so
    // the perpendicular-slide path also accelerates when needed.
    const sideStep = e.speed * kiteMul * dt * 0.85;
    const tryLeft = { x: e.x + pxL * sideStep, y: e.y + pyL * sideStep };
    const tryRight = { x: e.x + pxR * sideStep, y: e.y + pyR * sideStep };
    const dLeft = Math.hypot(hero.x - tryLeft.x, hero.y - tryLeft.y);
    const dRight = Math.hypot(hero.x - tryRight.x, hero.y - tryRight.y);
    if (dLeft < dRight) tryMove(e, pxL * sideStep, pyL * sideStep);
    else tryMove(e, pxR * sideStep, pyR * sideStep);
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
  // Bombers are pure closers — kite penalty applies to make a
  // stationary wand player a high-priority target. They explode on
  // contact so the threat scales with how fast they reach you.
  const kiteMul = kiteCloseSpeedMul(dist);
  tryMove(e, nx * e.speed * kiteMul * dt, ny * e.speed * kiteMul * dt);
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
  // Kite penalty applies during chase movement (pref-distance close).
  const kiteMul = kiteCloseSpeedMul(dist);
  tryMove(e, moveX * e.speed * kiteMul * dt, moveY * e.speed * kiteMul * dt);

  // Commit to a charge when aligned + cooldown ready. Effective charge
  // range extends by up to +160px when the hero has been stationary
  // at long range — punishes wand camping. Without this extension a
  // ranged player can sit at 500px (just past lancer's 380 chargeRange)
  // and the lancer never commits.
  const stillT = hero._stillT || 0;
  const chargeReachBonus = stillT > 0.6 ? Math.min(160, (stillT - 0.6) * 100) : 0;
  const effectiveChargeRange = e.def.chargeRange + chargeReachBonus;
  if (dist < effectiveChargeRange && dist > mn && e.attackCD <= 0) {
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
      // Dramatic enrage: shake, screen flash, shockwave burst, roar + zoom punch.
      // Flash alpha dropped 0.55 → 0.30 — at 0.55 the red wash + shake 22 +
      // zoom 0.18 stacked into "blinded for 0.5s" territory. Player needs
      // to read the boss's new attack pattern in the same beat.
      shakeCamera(22, 0.55);
      pulseZoom(0.18, 1.2);
      triggerScreenFlash('rgba(255, 50, 30, 0.30)', 0.5);
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
      // GRUDNOK — "warchief roar" on enrage: heavyChance jumps from base
      // (read directly off the def at attack-roll time, see currentAttackProfile)
      // and 4 orcs spawn around him as reinforcements. The heavy-bias
      // shifts him from "swing-swing-swing" to "wind up the cleave" in
      // phase 2 — visibly different rhythm without inventing a new move.
      if (e.type === 'elite_orc' && e.def.enrageSummonOrcs) {
        const ringR = 100;
        for (let k = 0; k < e.def.enrageSummonOrcs; k++) {
          const ang = (k / e.def.enrageSummonOrcs) * Math.PI * 2;
          const sx = e.x + Math.cos(ang) * ringR;
          const sy = e.y + Math.sin(ang) * ringR * 0.6;
          spawnEnemy('orc', sx, sy);
        }
        // Roar audio — deeper than the standard hit sound, layered for weight.
        playSfx('hero_hurt', { rate: 0.25, volume: 1.0 });
      }
    }
    // Animate the enrage shockwave decay
    if (e._enrageShockTime && e._enrageShockTime > 0) e._enrageShockTime -= dt;

    // EMBER TYRANT phase-2 fire-ring pulse — see _emberRings system at
    // top of file. While the boss is enraged, every emberRingInterval
    // seconds a new ring emanates from his current position. Static
    // floor pillars from the enrage burst stay where they were spawned;
    // these rings track the boss as he pursues the hero, so the player
    // is forced to break the radial line instead of just standing in a
    // safe corner. Initial counter value gives the player a 1.5s
    // breathing window after the phase-2 cinematic before the first
    // ring fires (counter starts at interval - WARMUP).
    if (e._enraged && e.type === 'ember_tyrant' && !e.dead) {
      const interval = e.def.emberRingInterval || 4.0;
      const WARMUP = 1.5;
      if (e._emberRingT == null) e._emberRingT = interval - WARMUP;
      e._emberRingT += dt;
      if (e._emberRingT >= interval) {
        e._emberRingT = 0;
        spawnEmberRing(
          e.x, e.y - 4,
          e.def.emberRingMaxR || 280,
          e.def.emberRingDur || 0.85,
          e.def.emberRingDamage || 4,
        );
        // Audio + camera tell — a low whoosh + small shake cues the
        // player's eye to the boss right as the ring spawns. Without
        // this the wavefront could be the first thing they see at
        // their feet, with no anticipation.
        playSfx('hero_hurt', { rate: 0.32, volume: 0.5 });
        shakeCamera(4, 0.18);
      }
    }

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
      ctx.font = 'bold 10px Georgia, serif';
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

// Perfect-dodge ring — Round-6 combat audit. Perfect dodge is the
// highest-skill mechanic in the game (i-frame swap to a counter that
// crits + heavy-knockbacks the attacker), but the timing window had no
// player-facing telegraph. The DANGER SNAP visual on the enemy's arc
// (lines 2233-2238) tells you "this hits in a moment" but doesn't say
// "dodge NOW for the perfect-dodge bonus". Players were learning the
// timing across ~20 attempts instead of ~3.
//
// This function draws a thin gold ring around the hero whenever any
// enemy's melee windup has 0.15s or less remaining — the exact width
// of the perfect-dodge sweet spot. The ring pulses in sync with the
// pre-strike beat, sitting just outside the hero's collision radius so
// it reads as "your shield raises now" rather than "you got hit".
//
// Suppressed when:
//   - hero is currently mid-dodge (the slow-mo + counter celebration
//     already covers that case visually)
//   - hero has any iframes already (post-counter buffer, boss-intro,
//     etc. — drawing the ring during invuln would be misleading)
//   - the threat is bomber/ranged/dash (perfect dodge is melee-vs-arc;
//     bombers explode, archers fire, dashers commit linear; none gain
//     a perfect-dodge benefit, so the ring would teach the wrong thing)
export function drawPerfectDodgeRing(ctx, hero) {
  if (!hero || hero.dead) return;
  if (hero.state === 'dodge') return;
  if ((hero.iframes || 0) > 0.05) return;
  let bestRemain = Infinity;
  for (const e of enemies) {
    if (e.dead || e.state !== 'attack') continue;
    if (e.def.behavior !== 'melee') continue;
    const prof = currentAttackProfile(e);
    const remain = prof.windup - e.stateTime;
    // Window: ring appears in the last 0.15s of windup, mirroring the
    // dodge i-frame envelope. Shorter than DANGER SNAP (which fires at
    // 25% remaining ~= up to 0.10s on slime, 0.18s on orc) so the ring
    // is a STRICTER signal: "perfect-dodge sweet spot is RIGHT NOW".
    if (remain < 0 || remain > 0.15) continue;
    // Only show the ring if the enemy is actually targeting our hero —
    // for the typical "1 hero in the room" case this is always true,
    // but in case of future per-enemy aim divergence we read e.aimX/Y
    // and confirm the strike vector intersects the hero. Cheap dot
    // check: the strike's normalized aim vs (hero - enemy) vector must
    // share a positive cosine, i.e. enemy is "facing" the hero.
    const dx = hero.x - e.x;
    const dy = hero.y - e.y;
    const aimMag = Math.hypot(e.aimX, e.aimY) || 1;
    const facing = (dx * e.aimX + dy * e.aimY) / aimMag;
    if (facing < 0) continue;
    if (remain < bestRemain) bestRemain = remain;
  }
  if (bestRemain === Infinity) return;
  // Ring opacity ramps as the perfect-dodge moment approaches — soft
  // at 0.15s, peak at 0.05s. The pulse rate (10 Hz) is fast enough to
  // read as "act now" but not seizure-flickery.
  const t = 1 - Math.min(1, bestRemain / 0.15);    // 0 -> 1 over the window
  const pulse = 0.6 + 0.4 * Math.sin(performance.now() * 0.062);  // ~10 Hz
  const alpha = (0.35 + 0.45 * t) * pulse;
  const r = (hero.radius || 14) + 8;
  ctx.save();
  ctx.strokeStyle = `rgba(255, 220, 130, ${alpha.toFixed(3)})`;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(hero.x, hero.y + 2, r, 0, Math.PI * 2);
  ctx.stroke();
  // Inner halo — softer gold gradient so the ring reads layered, not
  // a flat dotted circle. Same color, lower alpha, smaller radius.
  ctx.strokeStyle = `rgba(255, 240, 180, ${(alpha * 0.45).toFixed(3)})`;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.arc(hero.x, hero.y + 2, r - 3, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// Elite affix info tooltip — gated on the player HOLDING TAB so it
// surfaces on demand rather than firing every time the mouse drifts
// near an elite mid-combat. Reading "F SLOWS / E BURNS / V POISONS /
// W RESISTS" was useful as a teach-this-once cue but became noise
// during sustained fights — hover-pan-throughs would pop the card
// over the action. New rule: hold TAB (or Shift) to ENTER inspect
// mode; release to dismiss. Cursor still drives "which elite";
// mouse-near logic preserved.
export function drawEliteAffixTooltips(ctx, w, h) {
  // Gate — only render if the player is explicitly asking via Tab/Shift.
  // Either key works: Tab is the canonical "info" key, Shift is the
  // ergonomic alternative for mouse-heavy players.
  const inspectHeld = keys['Tab'] || keys['ShiftLeft'] || keys['ShiftRight'];
  if (!inspectHeld) return;
  // Find the closest elite within hover range of the mouse cursor (screen px).
  // Range chosen to be forgiving but not overlapping multiple elites at once.
  const HOVER_RANGE_PX = 56;
  let target = null;
  let bestD2 = HOVER_RANGE_PX * HOVER_RANGE_PX;
  for (const e of enemies) {
    if (e.dead || !e.affix) continue;
    const sp = worldToScreen(e.x, e.y - 8);
    const dx = sp.x - mouse.x, dy = sp.y - mouse.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) { bestD2 = d2; target = e; }
  }
  if (!target) return;
  const a = target.affix;
  const sp = worldToScreen(target.x, target.y - 36);
  const tipW = 220;
  const tipH = 56;
  // Clamp so the tip doesn't run off-screen
  const tipX = Math.max(8, Math.min(w - tipW - 8, Math.round(sp.x - tipW / 2)));
  const tipY = Math.max(8, Math.min(h - tipH - 8, Math.round(sp.y - tipH - 8)));

  ctx.save();
  // Card backdrop — same grammar as fusion / theme tooltips so the UI reads coherent
  ctx.fillStyle = 'rgba(14, 18, 26, 0.95)';
  ctx.fillRect(tipX, tipY, tipW, tipH);
  ctx.strokeStyle = a.auraColor;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(tipX + 0.5, tipY + 0.5, tipW - 1, tipH - 1);
  // Affix badge in the top-left corner of the tip
  ctx.fillStyle = a.auraColor;
  ctx.fillRect(tipX + 8, tipY + 8, 16, 16);
  ctx.fillStyle = '#1a0f10';
  ctx.font = 'bold 12px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(a.badge, tipX + 16, tipY + 16);
  // Header — affix name + the word ELITE
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = a.auraColor;
  ctx.font = 'bold 11px Georgia, serif';
  ctx.fillText(a.name.toUpperCase() + '  ELITE', tipX + 30, tipY + 9);
  // Description
  ctx.fillStyle = '#dce4f0';
  ctx.font = 'italic 10px Georgia, serif';
  ctx.fillText(a.desc, tipX + 8, tipY + 30);
  // Warded special: show shield-stagger progress
  if (a.id === 'warded' && !target._shieldBroken) {
    const remaining = a.staggersToBreak - (target._staggerCount || 0);
    ctx.fillStyle = '#ffe495';
    ctx.font = 'bold 10px Georgia, serif';
    ctx.fillText(`Shield: ${remaining} stagger${remaining === 1 ? '' : 's'} to break`, tipX + 8, tipY + 44);
  }
  ctx.restore();
}
