// Hero controller — top-down movement, directional attack, dodge roll
import { images } from './loader.js';
import { keys, mouse, keyJustPressed } from './input.js';
import { playSfx } from './sfx.js';
import { isWallAtWorld, TILE, hitCrackedWall, damageCrackedWall, roomSecrets, tryHitUrn, roomTorches, room } from './room.js';
import { hitSpark, dashTrail, footPuff, landingBurst, killRing, sparkle } from './particles.js';
import { shakeCamera, pulseZoom } from './camera.js';
import { triggerHitStop, spawnDamageNumber, spawnSlash, triggerPerfectDodge, hasCounterAttack, consumeCounterAttack, triggerScreenFlash, spawnHitMarker } from './fx.js';
import { stats } from './stats';
import { WEAPONS } from './weapons.js';
import {
  spawnLightningArc, scheduleEchoHit, registerComboHit,
  beginThunderTrail, addThunderTrailPoint, endThunderTrail,
  cataclysmRegisterHit, pierceLine, wandererOnDodge,
  spawnExplosion, combo,
} from './synergies.js';
import { spawnEmberFlame, enemies as activeEnemies } from './enemies.js';
import { dropGold } from './gold.js';
import { deathBurst } from './particles.js';
import { showTip } from './tips.js';
import { markChainFired, markPyroFired } from './counterPips.js';
import { synthSwoosh, synthClick } from './synth.js';
import { spawnHeroBolt } from './projectiles.js';

// ── DASH STRIKE + DODGE — AFTERIMAGE GHOST TRAILS ───────────────────────
// Both abilities capture hero pose at intervals during travel and render
// fading copies as a "where I just was" trail. They share the same buffer
// + render path; the per-entry `kind` field flags 'dash' (golden, hero
// sprite hidden, magical teleport read) vs 'dodge' (cool blue, hero
// sprite at 35% alpha, snappy roll read).
//
// DASH (Q): 0.10s @ 1700 px/s constant — teleport read with magical pops.
// DODGE (Space): 0.32s @ 580 px/s constant — snappier than the old decel
//                feel (was 620 with quadratic decel — the last third
//                felt stuck mid-roll). Duration kept at 0.32 to preserve
//                iframes + perfect-dodge timing window.
//
// Total dash distance is ~170px (close to the original ~185px); dodge
// distance is now ~186px (was ~99px — the decel had been halving the
// integral). Player feedback flagged dodge as feeling "off" relative
// to the new dash polish; the new constant speed gives dodge real reach.
const DASH_DUR = 0.10;
const DASH_SPEED = 1700;
const AFTERIMAGE_LIFE = 0.20;
const AFTERIMAGE_INTERVAL = 0.018;     // capture roughly every other frame
const DODGE_AFTERIMAGE_INTERVAL = 0.05;  // sparser captures — dodge isn't a teleport
// Captured during dash/dodge advance, drained by drawHero. Each entry:
// { x, y, dir, age, kind ('dash' | 'dodge') }
const _dashAfterimages = [];
let _dashAfterimageNextT = 0;          // accumulator vs. AFTERIMAGE_INTERVAL

const SPR = 128;                  // 8-directional sprite sheet cell size (was 100 for horizontal-strip sheets)
const HERO_DRAW = 60;              // on-screen hero size for combat rooms
const HERO_DRAW_HAMLET = 48;       // smaller in the hub — hamlet NPCs draw at
                                   // 56px and the painted scene props (anvil,
                                   // tent, gravestones) read as ~24-32px tall;
                                   // 60px hero felt oversized vs the scene.
                                   // 48 puts the hero on parity with NPCs and
                                   // feels grounded against the painted props.
                                   // after a sizing audit found the hero
                                   // was 2-3× taller than every boss in
                                   // the game. The PixelLab mage fills
                                   // 93% of its 128 cell while Tiny-RPG
                                   // enemies fill 11-23% of their 100
                                   // cells — they were never rebalanced.
                                   // 60 brings hero visible body to ~56
                                   // px, closer to the heavier minions
                                   // and below the bosses (boss drawSize
                                   // tuning is a follow-up pass).
const HERO_RADIUS = 14;            // collision
const HERO_SPEED = 230;
// Dodge tuning. SPEED was 620 with a `(1 - t*t)` quadratic decel — the
// last third felt stuck mid-roll. Replaced by constant 580 px/s
// (effectively reaches further: 0.32 × 580 × dodgeDistMul ≈ 186px,
// vs the old ~99px under the decel curve). DURATION held at 0.32 to
// preserve iframes (DODGE_DUR + 0.05 = 0.37s) and the perfect-dodge
// timing window. Cooldown unchanged.
const DODGE_SPEED = 580;
const DODGE_DUR = 0.32;
const DODGE_COOLDOWN = 0.6;
const IFRAME_AFTER_HIT = 0.55;

export const DODGE_COOLDOWN_BASE = DODGE_COOLDOWN;

// Weapon accessor — hero.weapon stores the id; this reads the def.
function weaponDef() { return WEAPONS[hero.weapon] || WEAPONS.sword; }

export const hero = {
  x: 0, y: 0,
  vx: 0, vy: 0,
  facing: 1,
  lastDirection: 4,                 // 8-dir sprite row index (0=N, 2=E, 4=S, 6=W); default SOUTH
  aimX: 1, aimY: 0,
  attackFacingX: 1, attackFacingY: 0,     // body facing locked at swing trigger; see heroDirection()
  weapon: 'sword',                   // id into WEAPONS; set by main.js run start
  hp: 8, maxHp: 8,
  state: 'idle',                     // idle | walk | attack | dodge | hurt | dead
  stateTime: 0,
  animTime: 0,
  attackCooldown: 0,
  dodgeCooldown: 0,
  iframes: 0,
  attackHitDone: false,
  hitThisSwing: new Set(),
  dodgeDirX: 0, dodgeDirY: 0,
  footstepT: 0,
  // Debuffs from elite affixes (frost/venom). Tick down over time.
  slowTime: 0,                 // remaining time slowed
  slowMul: 0.5,                // slow multiplier when active
  poisonTime: 0,               // remaining poison duration
  poisonRate: 0,               // HP damage per second
  _poisonTick: 0,
  _flameCD: 0,                 // ember trail damage cooldown
  // Synergy relic flags/state
  chainLightning: false,
  chainCount: 0,
  explosiveKill: false,
  soulBurst: false,
  soulKillCount: 0,
  thunderStep: false,
  vampiricAura: false,
  echoingStrike: false,
  // Legendary flags
  pierceCrit: false,
  cataclysm: false,
  wandererCloak: false,
  wandererBuffTime: 0,
  etherealBinding: false,
  phoenixCloak: false,             // explosive revive
  avatarOfFlame: false,             // weapon trails fire
  flameTrailT: 0,                   // ticker for fire trail spawn
  pyromancer: false,                // every 4th hit explodes
  pyroCount: 0,
  soulreaver: false,                // kills stack attack speed
  soulreaverStacks: 0,               // each +0.5s buff
  soulreaverTime: 0,                 // time remaining on stacks
  counterstrike: false,              // counter-hits explode
  aegisPulse: false,                 // low-HP shockwave
  _aegisT: 0,                        // cooldown for aegis pulse
  bloodrite: false,                  // +15% dmg below 50% HP
  // Weapon swing chain — tracks consecutive attack inputs within a window
  // so each weapon can deliver a distinct 3rd-hit "finisher".
  swingIndex: 0,                     // 0 / 1 / 2 — cycles 1→2→FINISHER→reset
  swingChainTime: 0,                 // decays; resets swingIndex to 0 when it hits 0
  // Charge attack — hold LMB past a threshold to unleash a heavy strike
  chargeTime: 0,                     // accumulated while LMB held during idle
  chargeReleased: false,             // snap once charged release is triggered
  // DASH STRIKE (Q) — offensive gap-closer: lunges toward cursor, damages all in path
  dashStrikeCD: 0,                   // cooldown timer; 0 = ready
  dashStrikeTime: 0,                 // remaining travel time during execution
  dashStrikeDirX: 0,                 // locked aim x at activation
  dashStrikeDirY: 0,                 // locked aim y
  dashStrikeHit: new Set(),           // enemies already struck this dash
  // Relic-driven modifiers. Base = 1.0x / 0. Relics mutate these.
  damageMul: 1,
  attackCooldownMul: 1,
  reachMul: 1,
  // Ranged (wand) — bolt-range multiplier. Long Reach + future range
  // relics extend a bolt's life (which caps its travel distance) when
  // the hero has wand equipped, mirroring how reachMul extends melee
  // arc reach. Defaults 1 so non-wand runs read as no-op.
  boltLifeMul: 1,
  // Synergy flags exposed by wand-themed relics:
  //   boltSplit       — Splintered Light: bolts split on first hit
  //   boltChain       — Storm Conduit: bolt hit arcs to nearest enemy
  //   boltCritOnCharge — Patient Lens: charged shots always crit + bonus
  boltSplit: false,
  boltChain: false,
  boltCritOnCharge: false,
  dodgeCooldownMul: 1,
  speedMul: 1,
  lifesteal: 0,
  revives: 0,
  // Expanded pool stats
  damageTakenMul: 1,          // Iron Resolve: ×0.75
  critChance: 0,               // Keen Edge: +0.15
  critMul: 2,                  // crit damage multiplier
  regenRate: 0,                // Vitality: 0.125 (1 HP per 8s); continuous trickle
  regenCD: 0,                  // timer for next regen tick
  knockbackMul: 1,             // Heavy Blow: ×2.5
  dodgeDistMul: 1,             // Dash Master: ×1.35
  executeThreshold: 0,         // Executioner: 0.4
  executeMul: 1.5,             // damage multiplier below threshold
};

export function resetHero() {
  hero.x = TILE * 10; hero.y = TILE * 10;
  hero.vx = 0; hero.vy = 0;
  hero.maxHp = 3;               // bare-bones roguelite start. HP grows via:
                                //   - Vitality Charm (meta, +3)
                                //   - Memory of Fortitude (+3)
                                //   - Vitality relic (+2)
                                //   - Bloodstone / regen relics
                                //   - sanctuary / altar / between-floor heals
                                // Every HP upgrade feels meaningful because
                                // 3 is the baseline the curve builds from.
  hero.hp = hero.maxHp;
  hero.state = 'idle'; hero.stateTime = 0; hero.animTime = 0;
  hero.attackCooldown = 0; hero.dodgeCooldown = 0;
  hero.iframes = 0;
  hero.hitThisSwing.clear();
  hero.attackHitDone = false;
  // Reset all relic-driven modifiers to base values
  hero.damageMul = 1;
  hero.attackCooldownMul = 1;
  hero.reachMul = 1;
  hero.dodgeCooldownMul = 1;
  hero.speedMul = 1;
  hero.lifesteal = 0;
  hero.revives = 0;
  hero.damageTakenMul = 1;
  hero.critChance = 0;
  hero.critMul = 2;
  hero.regenRate = 0;
  hero.regenCD = 0;
  hero.knockbackMul = 1;
  hero.dodgeDistMul = 1;
  hero.executeThreshold = 0;
  hero.executeMul = 1.5;
  // Reset synergy flags
  hero.chainLightning = false;
  hero.chainCount = 0;
  hero.explosiveKill = false;
  hero.soulBurst = false;
  hero.soulKillCount = 0;
  hero.thunderStep = false;
  hero.vampiricAura = false;
  hero.echoingStrike = false;
  hero.pierceCrit = false;
  hero.cataclysm = false;
  hero.wandererCloak = false;
  hero.wandererBuffTime = 0;
  hero.etherealBinding = false;
  hero.phoenixCloak = false;
  hero.avatarOfFlame = false;
  hero.flameTrailT = 0;
  hero.pyromancer = false;
  hero.pyroCount = 0;
  hero.soulreaver = false;
  hero.soulreaverStacks = 0;
  hero.soulreaverTime = 0;
  hero.counterstrike = false;
  hero.aegisPulse = false;
  hero._aegisT = 0;
  hero.bloodrite = false;
  // FUSION FLAGS — must all reset, or they persist across runs as a
  // phantom build the player doesn't actually own. Caught this during audit:
  // previously none of these cleared, so a run with Tesla Storm would leak
  // that flag into every subsequent run.
  hero.fusionTeslaStorm = false;
  hero.fusionBloodMoon = false;
  hero.fusionRebirthPyre = false;
  hero.fusionConflagration = false;
  hero.fusionPhantomBlade = false;
  hero.fusionStormDance = false;
  hero.fusionRiposte = false;
  hero.fusionMountainsHeart = false;
  hero.fusionObsidianEdge = false;
  hero.fusionTempest = false;
  hero.fusionFinalVerdict = false;
  hero.fusionStalwart = false;
  hero.fusionSparrowsDance = false;
  hero.fusionWitness = false;
  hero.sparrowCounter = 0;
  hero._sparrowPending = false;
  hero._sparrowFired = false;
  // MEMORY WEAVE flags — cleared every run so a stale memory flag can't leak
  // across descents. Set at run start by applySelectedMemory() in main.js.
  hero.memoryStillness = false;
  hero.memoryAsh = false;
  hero.memoryDebtor = false;
  hero.memoryHollow = false;
  hero.memoryBell = false;
  hero.memoryNine = false;
  hero.memoryHungryBlade = false;
  // Migrated from tarot (review #3 meta consolidation)
  hero.memoryHermit = false;
  hero.memoryHanged = false;
  // SYSTEMS PASS — relic mechanical variety. All flags reset per run.
  hero.speartip = false;
  hero.dodgeCleanses = false;
  hero.movementCrit = false;
  hero._moveTime = 0;
  hero.finisherHeal = 0;
  hero.knockbackCrit = false;
  hero.perfectDodgeRefund = false;
  hero.bulwark = false;
  hero.bulwarkArc = Math.PI * 0.66;
  hero.bulwarkReduction = 0.5;
  hero.secondWind = false;
  hero.secondWindAvailable = false;
  hero.ironResolveParry = false;   // conditional parry on face+hold-still
  hero._stillT = 0;
  hero.startingGold = 0;
  hero.relicCount = 0;     // maintained by relics.js for Memory of the Bell
  hero.swingIndex = 0;
  hero.swingChainTime = 0;
  hero.chargeTime = 0;
  hero.chargeReleased = false;
  hero.dashStrikeCD = 0;
  hero.dashStrikeTime = 0;
  hero.dashStrikeHit.clear();
  // RANGED (wand) — must reset or these leak across runs as a phantom
  // build (same bug pattern called out in the FUSION FLAGS comment at
  // line 246). long_reach branches on weapon and writes boltLifeMul;
  // splintered_light/storm_conduit/patient_lens write the boolean
  // flags. Without reset, a run-1 wand build with these picks would
  // pass the buffs into run-2 even on a sword class.
  hero.boltLifeMul = 1;
  hero.boltSplit = false;
  hero.boltChain = false;
  hero.boltCritOnCharge = false;
  // Sword-themed signature relics:
  hero.honestEdge = false;       // finisher swings always crit
  hero.ringingSteel = false;     // chain hits stack +6% dmg, max +30%
  hero.ringingSteelStacks = 0;   // current chain count for ringing_steel
  hero.vowEternal = false;       // first sword hit each room is a guaranteed crit
  hero.vowEternalReady = false;  // refreshed by loadRoom in main.js
  // Dagger-themed signature relics:
  hero.twinPulse = false;        // every 2nd hit echoes to nearest enemy
  hero.twinPulseTick = 0;        // alternating counter (0/1)
  hero.flickerStep = false;      // perfect-dodge counter window doubled
  hero.razorPace = false;        // every 5th dagger hit deals 2.5x damage
  hero.razorPaceHits = 0;        // hit counter for razor_pace
  // Hammer-themed signature relics:
  hero.mountainStrike = false;        // every 3rd swing spawns shockwave
  hero.mountainStrikeCounter = 0;     // swing counter for mountain_strike
  hero.earthenHold = false;      // charged hits add +0.6s stagger
  hero.worldEnder = false;       // hammer finishers shatter shields
  // April 2026 content expansion — new relic/fusion state flags.
  hero.mirrorShard = false;       hero.mirrorReflect = 0;     hero.mirrorReflectCrit = 1;
  hero.sporeBloom = false;        hero.sporeDamage = 0;       hero.sporeRadius = 0;
  hero.oathshield = false;        hero.oathshieldBonus = 0;   hero.oathshieldUntil = 0;
  hero.arcaneQuiver = false;      hero.arcaneQuiverHits = 0;
  hero.marrowPact = false;        hero.marrowPactBonus = 0;
  hero.gildedHoard = false;       hero.goldMul = 1;
  hero.hymnOfEmbers = false;      hero.hymnRadius = 0;        hero.hymnDps = 0;         hero.hymnTick = 0;
  hero.temporalEye = false;       hero.temporalSlowDuration = 0;
  hero.whisperVeil = false;       hero.whisperVeilWindow = 0; hero.whisperVeilUntil = 0; hero.whisperVeilNextCrit = false;
  hero.stormcaller = false;       hero.stormcallerInterval = 0; hero.stormcallerDamage = 0; hero.stormcallerRange = 0; hero.stormcallerTick = 0;
  hero.fusionShatterpoint = false;
  hero.fusionWildfireChoir = false;
  hero.fusionMartyrBloom = false;
  hero.fusionStormveil = false;
  // Orphan-icon rehomes
  hero.hourglassRespite = false; hero.hourglassReadyAt = 0;
  hero.fusionRingbearer = false;
  hero.fusionStarweave = false;
}

function setState(s) {
  if (hero.state !== s) {
    hero.state = s;
    hero.stateTime = 0;
    if (s === 'attack') { hero.hitThisSwing.clear(); hero._wallHitThisSwing = false; hero._counterUsedThisSwing = false; hero._urnHitThisSwing = false; hero._torchSparkedThisSwing = false; hero._sparrowFired = false; }
  }
}

function moveAxis(axis, delta) {
  // Attempt move, revert if would hit wall
  const steps = 2; // sub-steps for smoother collision at corners
  for (let i = 0; i < steps; i++) {
    const d = delta / steps;
    if (axis === 'x') {
      const nx = hero.x + d;
      if (!isWallAtWorld(nx + Math.sign(d) * HERO_RADIUS, hero.y)) hero.x = nx;
    } else {
      const ny = hero.y + d;
      if (!isWallAtWorld(hero.x, ny + Math.sign(d) * HERO_RADIUS)) hero.y = ny;
    }
  }
}

export function updateHero(dt, enemies, mouseWorld) {
  hero.stateTime += dt;
  hero.animTime += dt;
  if (hero.attackCooldown > 0) hero.attackCooldown -= dt;
  if (hero.dodgeCooldown > 0) hero.dodgeCooldown -= dt;
  if (hero.dashStrikeCD > 0) hero.dashStrikeCD -= dt;
  if (hero.iframes > 0) hero.iframes -= dt;
  // Age afterimages (teleport ghost trail) — fade out over AFTERIMAGE_LIFE.
  // Runs every frame so post-dash images keep fading even after
  // dashStrikeTime hits 0 (otherwise the trail would freeze on screen
  // for 0.2s as a static row of ghosts at the end of the dash).
  if (_dashAfterimages.length > 0) {
    for (let i = _dashAfterimages.length - 1; i >= 0; i--) {
      _dashAfterimages[i].age += dt;
      if (_dashAfterimages[i].age >= AFTERIMAGE_LIFE) _dashAfterimages.splice(i, 1);
    }
  }
  // INPUT BUFFERING — remember attack presses for 0.15s so snappy combo feel
  // doesn't require pixel-perfect cooldown timing.
  if (mouse.pressed) hero._attackBuffer = 0.15;
  if (hero._attackBuffer > 0) hero._attackBuffer -= dt;
  // Swing chain window decays — drops swingIndex to 0 after 0.8s of no attacks
  if (hero.swingChainTime > 0) {
    hero.swingChainTime -= dt;
    if (hero.swingChainTime <= 0) {
      hero.swingIndex = 0;
      // Chain-dependent relic state resets together. Ringing Steel's
      // damage stacks zero out; Twin Pulse's alternating echo tick
      // also restarts so the next chain begins on the off-beat;
      // Razor Pace's 5-hit counter resets so the crescendo can't be
      // banked across long pauses (would feel like a cheap surprise).
      hero.ringingSteelStacks = 0;
      hero.twinPulseTick = 0;
      hero.razorPaceHits = 0;
    }
  }
  // Charge attack — accumulate while LMB held, but not during attack/dodge/hurt states
  if (mouse.down && hero.state !== 'attack' && hero.state !== 'dodge' && hero.state !== 'hurt' && hero.attackCooldown <= 0) {
    hero.chargeTime += dt;
  }
  // Reset charge when LMB released without triggering
  if (!mouse.down) {
    hero.chargeTime = 0;
    hero.chargeReleased = false;
  }

  // Vitality regen
  if (hero.regenRate > 0 && hero.hp < hero.maxHp) {
    hero.regenCD -= dt;
    if (hero.regenCD <= 0) {
      hero.hp = Math.min(hero.maxHp, hero.hp + 1);
      hero.regenCD = 1 / hero.regenRate;
    }
  }

  // HYMN OF EMBERS — passive fire aura. Ticks every 1s for hymnDps damage to
  // every enemy within hymnRadius. Fusion Wildfire Choir bumps the radius
  // (handled in apply:) and could add a burn-over-time (TODO follow-up round).
  if (hero.hymnOfEmbers && enemies) {
    hero.hymnTick -= dt;
    if (hero.hymnTick <= 0) {
      hero.hymnTick = 1.0;
      const r2 = hero.hymnRadius * hero.hymnRadius;
      for (const e of enemies) {
        if (e.dead || e.state === 'dead') continue;
        const dx = e.x - hero.x, dy = e.y - hero.y;
        if (dx * dx + dy * dy <= r2) {
          e.takeDamage(hero.hymnDps, 0, 0);
        }
      }
    }
  }
  // FLAME T2 ascendance — heat aura: enemies within 50px take 1 dmg/s.
  // Independent tick from hymn_of_embers so the two stack cleanly when both
  // are active; smaller radius + lower dps so it complements rather than
  // replicates hymn. Tagged 'fire' so elemental resists apply.
  if ((hero.activeThemes?.flame || 0) >= 2 && enemies) {
    hero.themeFlameTick = (hero.themeFlameTick || 0) - dt;
    if (hero.themeFlameTick <= 0) {
      hero.themeFlameTick = 1.0;
      const r2 = 50 * 50;
      for (const e of enemies) {
        if (e.dead || e.state === 'dead') continue;
        const dx = e.x - hero.x, dy = e.y - hero.y;
        if (dx * dx + dy * dy <= r2) {
          e.takeDamage(1 * (hero.damageMul || 1), 0, 0, { damageType: 'fire' });
        }
      }
    }
  }
  // STORMCALLER — periodic strike on the nearest enemy in range.
  if (hero.stormcaller && enemies) {
    hero.stormcallerTick -= dt;
    if (hero.stormcallerTick <= 0) {
      hero.stormcallerTick = hero.stormcallerInterval;
      // Stormveil fusion doubles the strike rate during Whisper Veil's window.
      if (hero.fusionStormveil && hero.whisperVeilNextCrit) {
        hero.stormcallerTick = hero.stormcallerInterval * 0.5;
      }
      let nearest = null, nearestD = hero.stormcallerRange;
      for (const e of enemies) {
        if (e.dead || e.state === 'dead') continue;
        const d = Math.hypot(e.x - hero.x, e.y - hero.y);
        if (d < nearestD) { nearest = e; nearestD = d; }
      }
      if (nearest) {
        nearest.takeDamage(hero.stormcallerDamage, 0, 0);
        // Small visual cue — reuse the sparkle particle for a flash at the target.
        sparkle(nearest.x, nearest.y - 8, '#80c8ff');
        sparkle(nearest.x, nearest.y - 2, '#ffffff');
      }
    }
  }

  // Affix debuff timers
  if (hero.slowTime > 0) hero.slowTime -= dt;
  if (hero.poisonTime > 0) {
    hero.poisonTime -= dt;
    hero._poisonTick -= dt;
    if (hero._poisonTick <= 0) {
      hero._poisonTick = 1 / (hero.poisonRate || 0.5);
      if (hero.hp > 1 && hero.state !== 'dead') {
        hero.hp = Math.max(1, hero.hp - 1);
        stats.damageTaken += 1;
      }
    }
  }
  // Soulreaver — decay buff over time
  if (hero.soulreaverTime > 0) {
    hero.soulreaverTime -= dt;
    if (hero.soulreaverTime <= 0) hero.soulreaverStacks = 0;
  }
  // AEGIS PULSE — every 4s while below 30% HP, emit shockwave that staggers enemies
  if (hero.aegisPulse) {
    hero._aegisT = (hero._aegisT || 0) - dt;
    if (hero._aegisT <= 0 && hero.hp > 0 && hero.hp < hero.maxHp * 0.3) {
      hero._aegisT = 4.0;
      // Damage + stagger nearby
      const R = 140;
      for (const e of enemies) {
        if (e.dead) continue;
        const dx = e.x - hero.x, dy = e.y - hero.y;
        if (dx*dx + dy*dy < R * R) {
          e.takeDamage(10, dx * 0.03, dy * 0.03);
          e.stagger = Math.max(e.stagger || 0, 0.4);
        }
      }
      shakeCamera(8, 0.22);
      // VFX SUBTRACTION PASS: aegis pulse flash halved 0.22 → 0.12. Fires
      // every 4s while under 30% HP — can strobe in sustained low-HP combat.
      triggerScreenFlash('rgba(160, 220, 255, 0.12)', 0.25);
      spawnExplosion(hero.x, hero.y, R, 0);   // visual-only blast
    } else if (hero._aegisT <= 0) {
      hero._aegisT = 0.5;        // keep polling until HP drops
    }
  }
  // AVATAR OF FLAME — drop fire trail while moving
  if (hero.avatarOfFlame) {
    hero.flameTrailT -= dt;
    if (hero.flameTrailT <= 0 && hero.state === 'walk') {
      hero.flameTrailT = 0.18;
      spawnEmberFlame(hero.x, hero.y + 4);
    }
  }

  if (hero.state === 'dead') return;

  // Aim vector (toward mouse world pos)
  const ax = mouseWorld.x - hero.x;
  const ay = mouseWorld.y - hero.y;
  const am = Math.hypot(ax, ay) || 1;
  hero.aimX = ax / am;
  hero.aimY = ay / am;
  hero.facing = hero.aimX >= 0 ? 1 : -1;

  // State transitions
  if (hero.state === 'hurt') {
    if (hero.stateTime > 0.22) setState('idle');
  }

  if (hero.state !== 'attack' && hero.state !== 'dodge' && hero.state !== 'hurt') {
    // Dash Strike (Q) — offensive gap-closer: lunges toward aim + 2x damage to all in path.
    // Suppressed in hamlet (non-combat hub).
    if (room.kind !== 'hamlet' && keyJustPressed('KeyQ') && hero.dashStrikeCD <= 0) {
      showTip('first_dash');
      hero.dashStrikeCD = 5.0;
      hero.dashStrikeTime = DASH_DUR;
      // Lock direction at aim vector (normalized)
      const m = Math.hypot(hero.aimX, hero.aimY) || 1;
      hero.dashStrikeDirX = hero.aimX / m;
      hero.dashStrikeDirY = hero.aimY / m;
      hero.dashStrikeHit.clear();
      // Reset afterimage capture cadence + clear stale trail from prior dash
      _dashAfterimages.length = 0;
      _dashAfterimageNextT = 0;
      hero.iframes = 0.35;
      setState('dodge');                          // reuse dodge state for anim + invuln
      // TELEPORT AUDIO — magical zip + flash thud, replacing the old
      // sword-swing + slime-hit pair that read as a melee attack.
      try { synthSwoosh(1.4, 0.85, 0.08); } catch (_e) {}
      try { synthClick(1.6, 0.7); } catch (_e) {}
      shakeCamera(6, 0.15);
      pulseZoom(0.05, 0.28);
      // ORIGIN POP — golden sparkle ring + a few rays where the mage
      // was standing. Reads as "the cast point" — a place the player
      // came FROM, not a swing they made. 14 sparkles around an arc
      // pointing in the dash direction.
      const ox = hero.x, oy = hero.y - 8;
      for (let i = 0; i < 14; i++) {
        const ang = (i / 14) * Math.PI * 2;
        const r = 16 + Math.random() * 8;
        sparkle(ox + Math.cos(ang) * r, oy + Math.sin(ang) * r * 0.7, '#ffe5a0');
      }
      // Slash arc — kept (still reads as "magical strike in transit")
      spawnSlash(hero.x, hero.y - 8, hero.dashStrikeDirX, hero.dashStrikeDirY, 110, {
        color: 'rgba(255, 200, 120, ',
        width: 14,
        trailCount: 4,
        arc: Math.PI * 1.3,
        dur: 0.3,
      });
      // Subtle screen flash (kept from prior pass — 0.08 alpha is fine)
      triggerScreenFlash('rgba(255, 220, 140, 0.08)', 0.18);
    }
    // Dodge — blocked entirely by Memory of Stillness (the pact: you traded
    // your dodge for other gifts; pressing Space is a null input).
    // SYSTEMS PASS — SECOND WIND relic gates a free first-dodge-per-room,
    // so the CD check also passes when secondWindAvailable is true.
    else if (
      keyJustPressed('Space') &&
      !hero.memoryStillness &&
      (hero.dodgeCooldown <= 0 || (hero.secondWind && hero.secondWindAvailable))
    ) {
      showTip('first_dodge');
      // Consume the Second Wind charge if we used it.
      const usedSecondWind = hero.dodgeCooldown > 0 && hero.secondWind && hero.secondWindAvailable;
      if (usedSecondWind) hero.secondWindAvailable = false;
      // Dodge in move direction or aim direction
      let dx = 0, dy = 0;
      if (keys.KeyW) dy -= 1;
      if (keys.KeyS) dy += 1;
      if (keys.KeyA) dx -= 1;
      if (keys.KeyD) dx += 1;
      if (dx === 0 && dy === 0) { dx = hero.aimX; dy = hero.aimY; }
      const m = Math.hypot(dx, dy) || 1;
      hero.dodgeDirX = dx / m;
      hero.dodgeDirY = dy / m;
      hero.dodgeCooldown = DODGE_COOLDOWN * hero.dodgeCooldownMul;
      // Reset afterimage capture cadence + clear stale trail from a prior
      // dash/dodge so the new dodge starts with a fresh visual budget.
      _dashAfterimages.length = 0;
      _dashAfterimageNextT = 0;
      // Never shorten a longer invuln window already in-flight (post-hurt stagger,
      // Aegis Pulse, etc.) — take the max so dodging can't strip safety frames.
      hero.iframes = Math.max(hero.iframes || 0, DODGE_DUR + 0.05);
      // SYSTEMS PASS — NIMBLE STEP now cleanses slow + poison on dodge start.
      if (hero.dodgeCleanses) {
        hero.slowTime = 0;
        hero.poisonTime = 0;
      }
      // CONTENT PASS B1 — MEMORY OF THE HUNGRY BLADE: every dodge costs 1 HP.
      // Forces aggressive play so the buffed lifesteal has teeth to matter.
      // Never self-kills: dodges at 1 HP are prevented entirely.
      if (hero.memoryHungryBlade && hero.hp > 1) {
        hero.hp -= 1;
      }
      setState('dodge');
      hero._stillT = 0;   // iron_resolve parry window resets on dodge
      playSfx('footstep_1', { rate: 0.85, volume: 0.8 });
      // Departure burst — dust kicks in the direction the hero is leaving FROM
      // (opposite of dodge direction). Grounds the dodge in physical weight.
      const biome = (typeof window !== 'undefined' && window.__currentBiome) || 'vault';
      const dustColor = biome === 'crypt' ? '#7a8a9a'
                      : biome === 'abyss' ? '#6a4050'
                      : biome === 'inferno' ? '#6a3020'
                      : '#9a8a6a';
      landingBurst(hero.x, hero.y + 12, hero.dodgeDirX, hero.dodgeDirY, dustColor);
      // SYNERGY: Thunder Step — start a lightning trail along dodge path
      if (hero.thunderStep) {
        const dmg = 20 * (hero.damageMul || 1);
        beginThunderTrail(dmg);
        addThunderTrailPoint(hero.x, hero.y);
      }
      // LEGENDARY: Wanderer's Cloak — 2s doubled attack speed post-dodge
      wandererOnDodge();
      // SHADOW T2 ascendance — 0.8s flanking window: every hit during the
      // window is forced-crit. Stronger than whisper_veil (which is one hit
      // only) — ascendance should feel transformative.
      if ((hero.activeThemes?.shadow || 0) >= 2) {
        const _now = (typeof performance !== 'undefined') ? performance.now() / 1000 : 0;
        hero.themeShadowFlankingUntil = _now + 0.8;
      }
      // STORM T2 ascendance — releases a small shock pulse at the dodge
      // start point. Tagged 'shock' so it interacts with elemental resists.
      // Smaller radius/damage than spells; intended as an opportunistic
      // side-effect of mobility, not a primary DPS source.
      if ((hero.activeThemes?.storm || 0) >= 2) {
        const dmg = 14 * (hero.damageMul || 1);
        spawnExplosion(hero.x, hero.y - 6, 56, dmg, 'shock');
      }
    }
    // Attack — fresh tap, buffered tap (late press honored), combo follow-up, or charge release.
    // SUPPRESSED IN HAMLET — the canvas hamlet is a non-combat hub; clicks
    // still consume hero._attackBuffer via mouse.pressed but no swing fires.
    else if (room.kind !== 'hamlet' && (mouse.pressed || hero._attackBuffer > 0 || (mouse.down && hero.chargeTime >= 0.35 && !hero.chargeReleased)) && hero.attackCooldown <= 0) {
      // Consume the buffer so it doesn't re-trigger on next idle frame
      hero._attackBuffer = 0;
      const w = weaponDef();

      // ── RANGED WEAPON BRANCH (wand) ─────────────────────────────────
      // Bypasses the entire melee swing flow — no swing index, no
      // finisher logic, no slash arc, no charge AoE. The bolt is a
      // single-shot projectile spawned in the aim direction; cooldown
      // comes straight from the weapon's `cooldown` field (with the
      // standard hero.attackCooldownMul + STORM atk-spd theme bonus
      // applied so existing relics still affect ranged cadence).
      //
      // Combo / charge / finisher beats explicitly NOT supported in v1
      // — players choosing the wand are signing up for a different
      // playstyle, and the existing "every 3rd swing is a finisher"
      // rhythm doesn't translate to projectile spam. Future work could
      // add a "charged bolt" via mouse hold, but v1 keeps the rhythm
      // simple: tap LMB, fire bolt, repeat.
      if (w.ranged) {
        // CHARGED SHOT: hold LMB ≥0.35s to fire an empowered bolt on
        // release. 2.5× damage, pierces 3 enemies, gold-tinted, slightly
        // faster. Reuses the existing chargeTime accumulator + charge-
        // ring UI from melee — same skill ceiling, ranged flavor.
        // Cooldown after a charged shot is 1.4× normal (commitment
        // trade — you can't spam them).
        const isCharged = hero.chargeTime >= 0.35;
        const stormAtkSpd = 1 - (hero.themeAtkSpdBonus || 0);
        const wandererMulR = hero.wandererBuffTime > 0 ? 0.5 : 1;
        const cooldownMul = isCharged ? 1.4 : 1.0;
        hero.attackCooldown = w.cooldown * hero.attackCooldownMul * wandererMulR * stormAtkSpd * cooldownMul;
        setState('attack');
        hero.attackFacingX = hero.aimX;
        hero.attackFacingY = hero.aimY;
        // Lock the charge state so the player can't trigger a second
        // shot from the same hold + reset the accumulator on release.
        if (isCharged) { hero.chargeReleased = true; showTip('first_charge'); }
        // Spawn the bolt from a "cast point" slightly forward of the
        // hero so it doesn't visually emit from inside the body.
        const aimMag = Math.hypot(hero.aimX, hero.aimY) || 1;
        const dirX = hero.aimX / aimMag;
        const dirY = hero.aimY / aimMag;
        const baseDmg = w.damage * hero.damageMul;
        // Bolt range modifier — relics like Long Reach (wand-branched)
        // extend the bolt's life, which caps its travel distance. Same
        // pattern as melee reachMul scaling the swing-arc reach.
        const lifeMul = hero.boltLifeMul || 1;
        if (isCharged) {
          // Charged: 2.5× damage (or +50% more if Patient Lens), pierces
          // 3, faster bolt + longer life. Patient Lens forces a CRIT
          // tag on charged hits — the legendary pays off the patient
          // playstyle of wind-up shots.
          const chargedMul = hero.boltCritOnCharge ? 2.5 * 1.5 : 2.5;
          spawnHeroBolt(hero.x + dirX * 18, hero.y - 8 + dirY * 12,
                        dirX, dirY, baseDmg * chargedMul, 720, 1.2 * lifeMul,
                        { charged: true, pierce: 3 });
          // Heavier audio + camera kick for the charge release moment.
          try { synthClick(1.0, 0.85); } catch (_e) {}
          try { synthSwoosh(0.9, 0.6, 0.18); } catch (_e) {}
          shakeCamera(6, 0.18);
          pulseZoom(0.04, 0.22);
          // Brief gold flash so the release reads as a committed beat.
          triggerScreenFlash('rgba(255, 220, 140, 0.07)', 0.18);
        } else {
          // Tap-fire: standard bolt, no pierce, snappier audio.
          spawnHeroBolt(hero.x + dirX * 18, hero.y - 8 + dirY * 12,
                        dirX, dirY, baseDmg, w.boltSpeed, w.boltLife * lifeMul);
          try { synthClick(1.7, 0.6); } catch (_e) {}
          shakeCamera(2.5, 0.10);
        }
        showTip('first_combat');
        // Reset charge state so the next cycle starts fresh
        hero.chargeTime = 0;
        // Stash flags — charged ranged sets the charged flag so any
        // downstream consumer (themes, hooks) sees a charged release.
        hero._swingIsFinisher = false;
        hero._swingIsCharged = isCharged;
        // NOTE: we deliberately fall through to the rest of the
        // updateHero body so the attack-state END block (line ~1311)
        // still runs to transition state back to idle when the
        // animation finishes. The melee code below is wrapped in
        // !w.ranged so it doesn't execute.
      } else {

      const wandererMul = hero.wandererBuffTime > 0 ? 0.5 : 1;
      const soulreaverMul = Math.max(0.55, 1 - hero.soulreaverStacks * 0.15);
      // Charge release: any LMB state with chargeTime accumulated
      const isCharged = hero.chargeTime >= 0.35;
      // Combo index: advance if another swing happens within window
      const inCombo = hero.swingChainTime > 0;
      if (inCombo) hero.swingIndex = (hero.swingIndex + 1) % 3;
      else hero.swingIndex = 0;
      const isFinisher = hero.swingIndex === 2;      // 3rd hit in chain
      hero.swingChainTime = 0.8;
      // Mark charge as released so we don't re-trigger while held
      if (isCharged) { hero.chargeReleased = true; showTip('first_charge'); }
      // Cooldown extended a touch on finisher & charged (they're bigger)
      const bigSwingMul = (isFinisher || isCharged) ? 1.35 : 1.0;
      // STORM set-bonus — faster swings at 3/5 theme stacks
      const stormAtkSpd = 1 - (hero.themeAtkSpdBonus || 0);
      hero.attackCooldown = w.cooldown * hero.attackCooldownMul * wandererMul * soulreaverMul * bigSwingMul * stormAtkSpd;
      setState('attack');
      // Lock the body's facing direction at trigger time. heroDirection()
      // reads these instead of the live aim during the swing so the sprite
      // commits to the swing direction — flicking the mouse mid-swing no
      // longer rotates the body (the slash arc is also locked at trigger,
      // so body + slash now stay in sync).
      hero.attackFacingX = hero.aimX;
      hero.attackFacingY = hero.aimY;
      // FUSION: Sparrow's Dance — every 5th attack releases a wind ring that
      // damages all nearby enemies. The counter is tracked independently of
      // the swing-chain index so combos don't interfere.
      if (hero.fusionSparrowsDance) {
        hero.sparrowCounter = (hero.sparrowCounter || 0) + 1;
        if (hero.sparrowCounter >= 5) {
          hero.sparrowCounter = 0;
          hero._sparrowPending = true;   // consumed below to spawn the ring
        }
      }
      // Audio variations for swing flavor — per-weapon pitch + jitter.
      // Dagger: fast, high. Hammer: slow, deep. Sword: mid.
      const swingRate = w.swingRate * (isCharged ? 0.7 : isFinisher ? 0.85 : 1);
      const swingVol = w.id === 'hammer' ? 1.0 : w.id === 'dagger' ? 0.7 : 0.85;
      playSfx('sword_swing', { rate: swingRate, rateJitter: 0.12, volume: swingVol });
      // Hammer swing adds a deep pre-impact thump
      if (w.id === 'hammer') playSfx('slime_death', { rate: 0.4, volume: 0.35 });
      // Slash VFX — widen + slow for finisher/charge
      const slashWidth = w.slashWidth * (isCharged ? 1.6 : isFinisher ? 1.3 : 1);
      const slashTrails = w.slashTrailCount + (isCharged ? 3 : isFinisher ? 1 : 0);
      const slashArc = w.arc * (isCharged ? 1.25 : isFinisher ? 1.15 : 1);
      const slashDur = w.swingDur * 0.65 * (isCharged ? 1.4 : isFinisher ? 1.15 : 1);
      // Slash color logic:
      //  - Charged release: gold
      //  - Finisher (3rd hit): per-weapon "signature color" — sword fiery red,
      //    dagger electric cyan, hammer molten orange
      //  - Chain mid-hits (swingIndex 1): slight tinted brightening of base
      //  - Default: weapon base slashColor
      let slashColor;
      if (isCharged) {
        slashColor = 'rgba(255, 230, 140, ';
      } else if (isFinisher) {
        slashColor = w.id === 'sword'  ? 'rgba(255, 120, 80, '       // fiery red
                   : w.id === 'dagger' ? 'rgba(130, 240, 255, '      // electric cyan
                   : w.id === 'hammer' ? 'rgba(255, 160, 60, '       // molten orange
                   : 'rgba(255, 200, 140, ';
      } else if (hero.swingIndex === 1) {
        // 2nd-hit — subtle brightening tint to signal a chain is building
        slashColor = w.id === 'sword'  ? 'rgba(255, 235, 200, '
                   : w.id === 'dagger' ? 'rgba(210, 240, 255, '
                   : w.id === 'hammer' ? 'rgba(255, 210, 160, '
                   : w.slashColor;
      } else {
        slashColor = w.slashColor;
      }
      spawnSlash(hero.x, hero.y - 8, hero.aimX, hero.aimY, w.reach * hero.reachMul * (isCharged ? 1.15 : 1), {
        color: slashColor,
        width: slashWidth,
        trailCount: slashTrails,
        arc: slashArc,
        dur: slashDur,
      });
      // Reset charge state after releasing the swing
      hero.chargeTime = 0;
      // Stash flags that hit logic reads during the swing window
      hero._swingIsFinisher = isFinisher;
      hero._swingIsCharged = isCharged;
      } // end melee branch (else of if (w.ranged))
    }
    // Movement
    else {
      let dx = 0, dy = 0;
      if (keys.KeyW) dy -= 1;
      if (keys.KeyS) dy += 1;
      if (keys.KeyA) dx -= 1;
      if (keys.KeyD) dx += 1;
      const m = Math.hypot(dx, dy);
      if (m > 0) {
        dx /= m; dy /= m;
        // Persist normalized input direction so heroDirection() can read
        // it during walk state. Without this, hero.vx/vy stay at 0 and
        // vecToDirection() falls through to AIM direction, making the
        // body always face the mouse — the bug behind 'moves left/right
        // without facing that direction.'
        hero.vx = dx;
        hero.vy = dy;
        const slowMul = hero.slowTime > 0 ? hero.slowMul : 1;
        // Attack-commit slow: while in 'attack' state the hero plants
        // their feet for the swing — full-speed running while sword is
        // mid-arc reads as 'moonwalking with weapon turned the wrong way.'
        // 35% speed during attack matches Hades/Diablo/PoE 'committed-
        // swing' feel without removing all repositioning. State stays
        // 'attack' (sprite still faces the locked attack direction); only
        // velocity is reduced.
        const attackSlowMul = hero.state === 'attack' ? 0.35 : 1;
        const spd = HERO_SPEED * hero.speedMul * slowMul * attackSlowMul;
        moveAxis('x', dx * spd * dt);
        moveAxis('y', dy * spd * dt);
        // Don't downgrade state to 'walk' if we're mid-attack — body
        // sprite + animation should keep the attack frames + locked dir.
        if (hero.state !== 'attack') setState('walk');
        // SYSTEMS PASS — IRON GREAVES: track continuous movement time.
        // Reset on any non-walk transition (attack/dodge/idle below).
        hero._moveTime = (hero._moveTime || 0) + dt;
        hero._stillT = 0;   // iron_resolve parry window resets on motion
        hero.footstepT -= dt;
        if (hero.footstepT <= 0) {
          hero.footstepT = 0.32 / hero.speedMul;
          // Biome-varied footstep pitch — deeper on crypt stone, lighter on vault, crunchy on abyss/inferno
          const biome = (typeof window !== 'undefined' && window.__currentBiome) || 'vault';
          const biomeFootRate = biome === 'crypt' ? 0.92 : biome === 'vault' ? 1.1 : biome === 'abyss' ? 1.25 : biome === 'inferno' ? 1.35 : 1.1;
          playSfx(Math.random() < 0.5 ? 'footstep_0' : 'footstep_1', { rate: biomeFootRate, rateJitter: 0.12, volume: 0.45 });
          // Visual dust puff at hero's feet — biome-tinted so dust reads per floor.
          const dustColor = biome === 'crypt' ? '#7a8a9a'
                          : biome === 'abyss' ? '#6a4050'
                          : biome === 'inferno' ? '#5a3020'
                          : '#8a7a5a';
          footPuff(hero.x, hero.y + 14, dustColor);
        }
      } else {
        setState('idle');
        // Iron Greaves movement streak resets when the hero stops moving.
        hero._moveTime = 0;
        // Iron Resolve parry — track "stance time" while idle. The parry
        // window opens at ≥0.3s of uninterrupted stillness.
        hero._stillT = (hero._stillT || 0) + dt;
        // Clear movement velocity so heroDirection() stops reading a
        // stale walk direction once the player releases WASD. Without
        // this, the body keeps facing the last walk direction during
        // idle (which is fine semantically — heroDirection falls back
        // to lastDirection — but lastDirection is updated every frame
        // anyway, so clearing vx/vy keeps the state honest).
        hero.vx = 0;
        hero.vy = 0;
      }
    }
  }

  // Dodge / Dash Strike motion — shared state, different behavior
  if (hero.state === 'dodge') {
    const isDashStrike = hero.dashStrikeTime > 0;
    if (isDashStrike) {
      // Constant-speed teleport (no decel). The hero sprite is hidden
      // by drawHero while dashStrikeTime > 0; afterimages do the visual
      // work and the bursts at start/end frame the moment.
      moveAxis('x', hero.dashStrikeDirX * DASH_SPEED * dt);
      moveAxis('y', hero.dashStrikeDirY * DASH_SPEED * dt);
      // Capture afterimage at intervals — drawHero renders these as
      // fading copies of the hero's pose so the player reads "where I
      // just was" instead of an interpolated body sliding through.
      _dashAfterimageNextT -= dt;
      if (_dashAfterimageNextT <= 0) {
        _dashAfterimageNextT = AFTERIMAGE_INTERVAL;
        _dashAfterimages.push({
          x: hero.x,
          y: hero.y,
          dir: heroDirection(hero),
          age: 0,
          kind: 'dash',     // golden tint, no live hero sprite
        });
      }
      // Golden trail still runs for extra streak feel (the dashTrail
      // particles render under the afterimages so they read as motion
      // exhaust, not the body).
      dashTrail(hero.x, hero.y, '#ffd27a');
      // Hit all enemies along the dash path
      const w = weaponDef();
      const reach = 42;
      const dmg = w.damage * hero.damageMul * 2.0;
      for (const e of enemies) {
        if (e.dead || hero.dashStrikeHit.has(e)) continue;
        const dx = e.x - hero.x, dy = e.y - hero.y;
        if (dx * dx + dy * dy < (reach + e.radius) * (reach + e.radius)) {
          hero.dashStrikeHit.add(e);
          e.takeDamage(dmg, hero.dashStrikeDirX, hero.dashStrikeDirY);
          hitSpark(e.x, e.y - 18, -hero.dashStrikeDirX, -hero.dashStrikeDirY, '#ffeb99');
          spawnDamageNumber(e.x, e.y - 36, dmg, { crit: true, dir: { x: hero.dashStrikeDirX, y: hero.dashStrikeDirY }, elementTag: e._lastElementTag });
          triggerHitStop(0.05);
          registerComboHit();
        }
      }
      hero.dashStrikeTime -= dt;
      if (hero.dashStrikeTime <= 0) {
        setState('idle');
        hero.dashStrikeHit.clear();
        // ARRIVAL POP — bigger sparkle ring + arrival snap audio.
        // Frames the moment the player "reappears" instead of just
        // ending the slide on an idle pose.
        const ax = hero.x, ay = hero.y - 8;
        for (let i = 0; i < 18; i++) {
          const ang = (i / 18) * Math.PI * 2;
          const r = 18 + Math.random() * 10;
          sparkle(ax + Math.cos(ang) * r, ay + Math.sin(ang) * r * 0.7, '#fff2c8');
        }
        try { synthClick(1.2, 0.6); } catch (_e) {}
      }
    } else {
      // Dodge motion: constant DODGE_SPEED (no decel). dodgeDistMul
      // stays in the calc so Wanderer's Cloak / boots / memories that
      // scale dodge distance still work.
      const speed = DODGE_SPEED * hero.dodgeDistMul;
      moveAxis('x', hero.dodgeDirX * speed * dt);
      moveAxis('y', hero.dodgeDirY * speed * dt);
      // Capture cool-blue afterimage ghosts. Sparser interval than the
      // dash (dodge happens 5-10× per fight; we don't want a beefy
      // golden trail every Space tap). The cool tint distinguishes
      // dodge from dash visually so the player reads them as different
      // abilities at a glance.
      _dashAfterimageNextT -= dt;
      if (_dashAfterimageNextT <= 0) {
        _dashAfterimageNextT = DODGE_AFTERIMAGE_INTERVAL;
        _dashAfterimages.push({
          x: hero.x,
          y: hero.y,
          dir: heroDirection(hero),
          age: 0,
          kind: 'dodge',     // cool blue tint, hero sprite stays at low alpha
        });
      }
      if (Math.random() < 0.6) dashTrail(hero.x, hero.y);
      // Add a trail point every frame during dodge for Thunder Step
      if (hero.thunderStep) addThunderTrailPoint(hero.x, hero.y);
      if (hero.stateTime >= DODGE_DUR) {
        if (hero.thunderStep) endThunderTrail();
        // Landing burst — dust kicks opposite to the dodge direction, grounding
        // the landing. Biome-tinted so it matches the floor surface.
        const biome = (typeof window !== 'undefined' && window.__currentBiome) || 'vault';
        const dustColor = biome === 'crypt' ? '#7a8a9a'
                        : biome === 'abyss' ? '#6a4050'
                        : biome === 'inferno' ? '#6a3020'
                        : '#9a8a6a';
        landingBurst(hero.x, hero.y + 12, hero.dodgeDirX, hero.dodgeDirY, dustColor);
        setState('idle');
      }
    }
  }

  // Attack hitbox — active in middle of the swing.
  // Ranged weapons (wand) skip the arc hitbox entirely — they damage
  // via the projectile collision in projectiles.js, not the swing-arc
  // sweep. The state-end transition at the bottom of this block still
  // runs so the wand's "attack" state cleanly transitions back to idle
  // when stateTime exceeds w.swingDur.
  if (hero.state === 'attack') {
    const w = weaponDef();
    const t = hero.stateTime / w.swingDur;
    if (!w.ranged && t > 0.25 && t < 0.75) {
      const reach = w.reach * hero.reachMul;
      // FLAME set-bonus — +10%/+20% base damage at 3/5 theme stacks
      const flameMul = 1 + (hero.themeDmgBonus || 0);
      const damage = w.damage * hero.damageMul * flameMul;
      const arc = w.arc;
      // Torch interaction — swing near a torch spawns sparks once per swing
      if (!hero._torchSparkedThisSwing && roomTorches) {
        for (const torch of roomTorches) {
          const dx = torch.x - hero.x, dy = torch.y - hero.y;
          const d = Math.hypot(dx, dy);
          if (d < reach + 20) {
            hero._torchSparkedThisSwing = true;
            // Burst a few spark particles from the torch
            for (let k = 0; k < 5; k++) {
              hitSpark(torch.x, torch.y, (Math.random() - 0.5) * 2, 0.3, '#ffd060');
            }
            break;
          }
        }
      }
      // Cracked wall — single hit per swing
      if (!hero._wallHitThisSwing && hitCrackedWall(hero.x, hero.y, hero.aimX, hero.aimY, reach)) {
        hero._wallHitThisSwing = true;
        const res = damageCrackedWall();
        hitSpark(roomSecrets.crackX * TILE + TILE/2, roomSecrets.crackY * TILE + TILE/2, -hero.aimX, -hero.aimY, '#ffe5a0');
        shakeCamera(res === 'broken' ? 12 : 5, 0.2);
        playSfx('slime_hit', { rate: res === 'broken' ? 0.6 : 1.3, volume: 0.9 });
      }
      // Trove urns — break on hit, spawn loot burst
      if (!hero._urnHitThisSwing) {
        const urnRes = tryHitUrn(hero.x, hero.y, hero.aimX, hero.aimY, reach);
        if (urnRes.hit) {
          hero._urnHitThisSwing = true;
          hitSpark(urnRes.wx, urnRes.wy, -hero.aimX, -hero.aimY, '#e8c878');
          deathBurst(urnRes.wx, urnRes.wy, '#8a6a3a');
          shakeCamera(4, 0.12);
          playSfx('slime_hit', { rate: 0.9, volume: 0.55 });
          // Loot roll — trove urns are generous (40/25/8/27), combat props are sparse (15/8/2/75)
          const r = Math.random();
          if (urnRes.isProp) {
            // Sparse combat-room loot
            if (r < 0.15) {
              dropGold(urnRes.wx, urnRes.wy, 2 + (Math.random() * 2 | 0));
            } else if (r < 0.23) {
              if (hero.hp < hero.maxHp) hero.hp = Math.min(hero.maxHp, hero.hp + 1);
              for (let k = 0; k < 4; k++) deathBurst(urnRes.wx, urnRes.wy - 10, '#86e3a8');
              playSfx('click', { rate: 1.8, volume: 0.55 });
            } else if (r < 0.25) {
              dropGold(urnRes.wx, urnRes.wy, 8 + (Math.random() * 4 | 0));
              for (let k = 0; k < 6; k++) deathBurst(urnRes.wx, urnRes.wy - 4, '#f4d9a0');
              playSfx('click', { rate: 0.8, volume: 0.75 });
            }
          } else {
            // Trove urns — full loot odds
            if (r < 0.40) {
              dropGold(urnRes.wx, urnRes.wy, 3 + (Math.random() * 4 | 0));
            } else if (r < 0.65) {
              if (hero.hp < hero.maxHp) hero.hp = Math.min(hero.maxHp, hero.hp + 1);
              for (let k = 0; k < 5; k++) deathBurst(urnRes.wx, urnRes.wy - 10, '#86e3a8');
              playSfx('click', { rate: 1.8, volume: 0.6 });
            } else if (r < 0.73) {
              dropGold(urnRes.wx, urnRes.wy, 10 + (Math.random() * 6 | 0));
              for (let k = 0; k < 8; k++) deathBurst(urnRes.wx, urnRes.wy - 4, '#f4d9a0');
              playSfx('click', { rate: 0.8, volume: 0.85 });
            }
          }
        }
      }
      // FUSION: Sparrow's Dance — if a wind burst is pending for this swing,
      // fire it once (gated by _sparrowFired this swing) at the hit window.
      // Damages all enemies in a generous radius + spawns a wind ring VFX.
      if (hero._sparrowPending && !hero._sparrowFired) {
        hero._sparrowFired = true;
        hero._sparrowPending = false;
        const R = 120;
        const windDmg = 18 * (hero.damageMul || 1);
        for (const e of enemies) {
          if (e.dead) continue;
          const dx = e.x - hero.x, dy = e.y - hero.y;
          if (dx * dx + dy * dy <= R * R) {
            e.takeDamage(windDmg, (dx / (R || 1)) * 0.6, (dy / (R || 1)) * 0.6);
          }
        }
        killRing(hero.x, hero.y, '#b0e8ff', 2);
        playSfx('click', { rate: 0.6, volume: 0.5 });
      }
      for (const e of enemies) {
        if (e.dead || hero.hitThisSwing.has(e)) continue;
        const dx = e.x - hero.x;
        const dy = e.y - hero.y;
        const dist = Math.hypot(dx, dy);
        if (dist > reach + e.radius) continue;
        // Angle check — is enemy within swing arc toward aim?
        const enemyAngle = Math.atan2(dy, dx);
        const aimAngle = Math.atan2(hero.aimY, hero.aimX);
        let diff = enemyAngle - aimAngle;
        while (diff > Math.PI)  diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        if (Math.abs(diff) <= arc / 2) {
          hero.hitThisSwing.add(e);
          // Counter-attack: perfect-dodge grants next swing guaranteed crit + 1.5x bonus
          const isCounter = !hero._counterUsedThisSwing && hasCounterAttack();
          if (isCounter) { consumeCounterAttack(); hero._counterUsedThisSwing = true; showTip('first_counter'); }
          // SYSTEMS PASS — forced-crit sources stack with RNG crit:
          //   HEAVY BLOW: first hit on a knocked-back enemy
          //   IRON GREAVES: first hit after 2+ seconds of continuous motion
          const forcedCrit = (
            (hero.knockbackCrit && e._kbCritPending) ||
            (hero.movementCrit && (hero._moveTime || 0) >= 2.0) ||
            // HONEST EDGE (sword-only) — finisher swings always crit
            (hero.honestEdge && hero._swingIsFinisher) ||
            // VOW ETERNAL (sword-only legendary) — first sword hit
            // each room is a guaranteed crit. vowEternalReady is set
            // on relic pick + refreshed by loadRoom in main.js.
            // Consumed below on the first damage-dealing hit.
            (hero.vowEternal && hero.vowEternalReady && w.id === 'sword')
          );
          if (hero.knockbackCrit && e._kbCritPending) e._kbCritPending = false;
          if (hero.movementCrit && (hero._moveTime || 0) >= 2.0) hero._moveTime = 0;
          if (hero.vowEternal && hero.vowEternalReady && w.id === 'sword') {
            hero.vowEternalReady = false;
          }
          // DAGGER SIGNATURE — flat +10% crit chance when wielded. Twin Fang
          // is "the precision weapon" — its identity between finishers is
          // that crits happen more often than with sword or hammer.
          const _daggerCritBonus = (w.id === 'dagger') ? 0.10 : 0;
          // SHADOW set-bonus — flat crit chance add at 3/5 theme stacks
          const _shadowCritBonus = hero.themeCritBonus || 0;
          const _totalCritChance = hero.critChance + _daggerCritBonus + _shadowCritBonus;
          // SHADOW T2 ascendance — flanking window after dodge: every hit crits
          const _hcNow = (typeof performance !== 'undefined') ? performance.now() / 1000 : 0;
          const _shadowFlanking = hero.themeShadowFlankingUntil > _hcNow;
          const isCrit = isCounter || forcedCrit || _shadowFlanking || (_totalCritChance > 0 && Math.random() < _totalCritChance);
          const isExec = hero.executeThreshold > 0 && e.hp / e.maxHp < hero.executeThreshold;
          // SYSTEMS PASS — LONG REACH: hits landed past 80% of your reach
          // deal +40% damage. Rewards spacing + positioning. Folded in
          // below alongside the other pre-multiplier adjustments.
          const speartipBonus = (hero.speartip && dist > reach * 0.8) ? 1.4 : 1.0;
          if (isExec) showTip('first_execute');
          // RINGING STEEL (sword-only) — chained hits add +6% damage
          // each, max +30% (5 stacks). Stacks read from
          // hero.ringingSteelStacks, capped before the multiplier.
          // Stacks reset when the swing chain expires (handled in the
          // chainTime decay block at top of updateHero).
          const ringingSteelMul = hero.ringingSteel
            ? 1 + 0.06 * Math.min(5, hero.ringingSteelStacks | 0)
            : 1;
          let finalDmg = damage * speartipBonus * ringingSteelMul;
          // SHADOW T2 — +0.5 crit multiplier bump (so a 2.0× crit becomes 2.5×)
          const _effectiveCritMul = hero.critMul + (hero.themeCritMulBonus || 0);
          if (isCrit) finalDmg *= _effectiveCritMul;
          if (isExec) finalDmg *= hero.executeMul;
          // FUSION: Final Verdict — crit on a below-threshold enemy = instakill.
          // Pumps damage to multiples of the target's max HP so nothing survives.
          if (hero.fusionFinalVerdict && isCrit && isExec && !e.boss) {
            finalDmg = Math.max(finalDmg, (e.maxHp || 999) * 3);
          }
          if (isCounter) finalDmg *= (hero.counterstrike ? 2.0 : 1.5);
          // BLOODRITE — +15% damage while below 50% HP
          if (hero.bloodrite && hero.hp < hero.maxHp * 0.5) finalDmg *= 1.15;
          // MARROW PACT — +40% damage at or below 50% HP. Stacks with Bloodrite.
          if (hero.marrowPact && hero.hp <= hero.maxHp * 0.5) finalDmg *= (1 + hero.marrowPactBonus);
          // OATHSHIELD / WHISPER VEIL — both open a post-dodge window.
          const _hnow = (typeof performance !== 'undefined') ? performance.now() / 1000 : 0;
          if (hero.oathshield && _hnow < hero.oathshieldUntil) {
            finalDmg *= (1 + hero.oathshieldBonus);
            hero.oathshieldUntil = 0;    // consumed
          }
          if (hero.whisperVeilNextCrit && _hnow < hero.whisperVeilUntil) {
            hero.whisperVeilNextCrit = false;
            if (!isCrit) { finalDmg *= hero.critMul; }
          } else if (hero.whisperVeilNextCrit && _hnow >= hero.whisperVeilUntil) {
            // Window expired without consuming — clear so it doesn't linger.
            hero.whisperVeilNextCrit = false;
          }
          // CHARGE ATTACK — guaranteed crit vibe: 1.85x dmg + forces isCrit for VFX
          const chargedHit = hero._swingIsCharged;
          if (chargedHit) finalDmg *= 1.85;
          // WEAPON FINISHER — 3rd swing in chain — per-weapon unique bonus
          const finisherHit = hero._swingIsFinisher;
          if (finisherHit) {
            showTip('first_finisher');
            if (w.id === 'sword')       finalDmg *= 1.5;      // sword: +50% dmg
            else if (w.id === 'dagger') finalDmg *= 1.25;     // dagger: modest +25%, will also pierce (handled below)
            else if (w.id === 'hammer') finalDmg *= 1.6;      // hammer: +60% + AoE (handled below)
          }
          // COMBO BONUS — keeping a streak going rewards damage.
          // FUSION: Tempest — combo bonus ~doubles at RAMPAGE+ and CARNAGE.
          // SWORD SIGNATURE — thresholds halved (3/7/15/30 vs 5/10/20/40).
          // Sword is "the sustained weapon" — reaches each combo tier faster,
          // rewarding long engagements without changing the ceiling.
          const cc = combo.count || 0;
          const tempestMul = hero.fusionTempest ? 2 : 1;
          const _swordTier = (w.id === 'sword');
          const t40 = _swordTier ? 30 : 40;
          const t20 = _swordTier ? 15 : 20;
          const t10 = _swordTier ? 7  : 10;
          const t5  = _swordTier ? 3  : 5;
          if (cc >= t40)      finalDmg *= 1 + 0.35 * tempestMul;   // +35% / +70%
          else if (cc >= t20) finalDmg *= 1 + 0.22 * tempestMul;
          else if (cc >= t10) finalDmg *= 1 + 0.12 * tempestMul;
          else if (cc >= t5)  { finalDmg *= 1.05; showTip('first_crit'); }
          // FUSION: Mountain's Heart — at full HP, +10% damage
          if (hero.fusionMountainsHeart && hero.hp >= hero.maxHp) {
            finalDmg *= 1.10;
          }
          // RAZOR PACE (dagger-only legendary) — every 5th dagger hit
          // deals 2.5x damage. Counter increments BEFORE the threshold
          // check so the 5th hit is the one that pops, not the 6th.
          // Reset is handled by the swing-chain decay block + room
          // teardown — see the resetHero list and the chainTime guard
          // earlier in updateHero. razorPaceCrescendo flag cues VFX.
          let razorPaceCrescendo = false;
          if (hero.razorPace && w.id === 'dagger') {
            hero.razorPaceHits = (hero.razorPaceHits | 0) + 1;
            if (hero.razorPaceHits >= 5) {
              finalDmg *= 2.5;
              hero.razorPaceHits = 0;
              razorPaceCrescendo = true;
            }
          }
          // WORLD-ENDER (hammer-only legendary) — finisher hits instantly
          // shatter enemy shields (Warded affix + Vanguard def shields).
          // Breaks happen BEFORE takeDamage runs, so the finisher hit
          // itself bypasses the shield's damage reduction. Reads as
          // "the third blow opens the door" — the fantasy is overwhelming
          // force, not slow grind. Won't double-fire on already-broken.
          let worldEnderShatter = false;
          if (hero.worldEnder && w.id === 'hammer' && finisherHit && !e.dead) {
            if (e.affix && e.affix.id === 'warded' && !e._shieldBroken) {
              e._shieldBroken = true;
              e._staggerCount = (e.affix.staggersToBreak | 0) || 99;
              worldEnderShatter = true;
            }
            if (e.def && e.def.shieldCharges && !e._vShieldBroken) {
              e._vShieldBroken = true;
              e._shieldChargesLeft = 0;
              worldEnderShatter = true;
            }
          }
          // HAMMER SIGNATURE — non-finisher swings get +50% knockback on top
          // of the weapon's base 2.2x. The finisher already has the ground-
          // slam AoE, so this fills the "middle" swings with weight too —
          // every Dreadmaul hit should feel like a THUNK, not just the 3rd.
          const _hammerTempo = (w.id === 'hammer' && !finisherHit) ? 1.5 : 1;
          const kbScale = hero.knockbackMul * w.knockbackMul * _hammerTempo * (isCounter ? 1.8 : 1);
          // SYSTEMS PASS — BLOODSTONE: capture enemy HP pre-hit for the
          // sub-25% finisher-heal check after takeDamage resolves.
          const eHpBefore = e.hp;
          e.takeDamage(finalDmg, hero.aimX * kbScale, hero.aimY * kbScale);
          // SYSTEMS PASS — HEAVY BLOW: after a hit with big knockback, mark
          // the enemy so the NEXT hero hit on them forces a crit.
          if (hero.knockbackCrit && kbScale >= 2 && !e.dead) {
            e._kbCritPending = true;
          }
          // SYSTEMS PASS — BLOODSTONE: kills of enemies under 25% HP heal +3.
          // Applies only when THIS hit is the killing blow on an already-
          // weakened target (no farming mid-HP kills).
          if (hero.finisherHeal && e.dead && eHpBefore <= e.maxHp * 0.25 && hero.hp < hero.maxHp) {
            hero.hp = Math.min(hero.maxHp, hero.hp + hero.finisherHeal);
          }
          // SPORE BLOOM — on kill, release a cloud dealing sporeDamage to all
          // other enemies within sporeRadius. Reuses the dying enemy's position.
          if (hero.sporeBloom && e.dead && hero.sporeDamage > 0) {
            const r2 = hero.sporeRadius * hero.sporeRadius;
            for (const other of enemies) {
              if (other === e || other.dead || other.state === 'dead') continue;
              const dx = other.x - e.x, dy = other.y - e.y;
              if (dx * dx + dy * dy <= r2) {
                other.takeDamage(hero.sporeDamage, 0, 0);
              }
            }
            // Green spore burst
            for (let i = 0; i < 8; i++) {
              sparkle(e.x + (Math.random() - 0.5) * 60, e.y - 10 + (Math.random() - 0.5) * 60, '#a0e868');
            }
          }
          // ARCANE QUIVER — every 4th melee hit splashes to the nearest OTHER
          // enemy within 260px for 40% of the hit damage. Rewards dense rooms.
          if (hero.arcaneQuiver && !e.dead) {
            hero.arcaneQuiverHits = (hero.arcaneQuiverHits || 0) + 1;
            if (hero.arcaneQuiverHits % 4 === 0) {
              let splashTarget = null, splashD2 = 260 * 260;
              for (const other of enemies) {
                if (other === e || other.dead || other.state === 'dead') continue;
                const dx = other.x - e.x, dy = other.y - e.y;
                const d2 = dx * dx + dy * dy;
                if (d2 < splashD2) { splashTarget = other; splashD2 = d2; }
              }
              if (splashTarget) {
                splashTarget.takeDamage(finalDmg * 0.4, 0, 0);
                sparkle(splashTarget.x, splashTarget.y - 8, '#c8a0ff');
                sparkle(splashTarget.x, splashTarget.y - 14, '#ffffff');
              }
            }
          }

          // ── WEAPON SIGNATURE RELIC HOOKS — fire after damage resolves
          // so the relic effects layer on top of base damage rather than
          // changing the headline number. All gated on weapon class +
          // relic flag so they're no-ops when not applicable.

          // RINGING STEEL (sword-only) — increment chain stack to feed
          // the next hit's damage multiplier. Cap at 5 stacks (+30%).
          // Reset is handled by the swingChainTime decay block.
          if (hero.ringingSteel && w.id === 'sword') {
            hero.ringingSteelStacks = Math.min(5, (hero.ringingSteelStacks | 0) + 1);
          }

          // TWIN PULSE (dagger-only) — every 2nd dagger hit echoes
          // damage to nearest other enemy within 80px for 60%. The
          // 80px range is tighter than Arcane Quiver's 260 because
          // dagger's identity is precision/short-range — the echo
          // cleans up adjacent enemies, not a room-wide AOE.
          if (hero.twinPulse && w.id === 'dagger' && !e.dead) {
            hero.twinPulseTick = (hero.twinPulseTick + 1) | 0;
            if (hero.twinPulseTick % 2 === 0) {
              let echoTarget = null, echoD2 = 80 * 80;
              for (const other of enemies) {
                if (other === e || other.dead || other.state === 'dead') continue;
                const dx = other.x - e.x, dy = other.y - e.y;
                const d2 = dx * dx + dy * dy;
                if (d2 < echoD2) { echoTarget = other; echoD2 = d2; }
              }
              if (echoTarget) {
                echoTarget.takeDamage(finalDmg * 0.6, 0, 0);
                sparkle(echoTarget.x, echoTarget.y - 8, '#a0e8ff');
                sparkle(echoTarget.x, echoTarget.y - 14, '#ffffff');
              }
            }
          }

          // MOUNTAIN STRIKE (hammer-only) — every 3rd hammer hit spawns
          // a 70px shockwave at impact for 50% weapon damage. Fire the
          // explosion via the synergies system (same path as pyromancer
          // / soul_burst) so it integrates cleanly with affixes.
          if (hero.mountainStrike && w.id === 'hammer' && !e.dead) {
            hero.mountainStrikeCounter = (hero.mountainStrikeCounter | 0) + 1;
            if (hero.mountainStrikeCounter % 3 === 0) {
              const shockDmg = (w.damage * (hero.damageMul || 1)) * 0.5;
              spawnExplosion(e.x, e.y - 6, 70, shockDmg, 'physical');
              // Visual punch — extra dust burst for the ground-strike
              // read, plus a heavier hit-stop than the regular swing.
              for (let k = 0; k < 8; k++) {
                sparkle(e.x + (Math.random() - 0.5) * 40, e.y + 4 + (Math.random() - 0.5) * 16, '#ffae6c');
              }
              triggerHitStop(0.06);
            }
          }

          // EARTHEN HOLD (hammer-only) — charged hammer hits add +0.6s
          // stagger on top of whatever stagger the base hit applied.
          // Stagger is already a field that enemies' AI reads (e.stagger
          // ticks down per frame, gates attack/movement while > 0).
          if (hero.earthenHold && w.id === 'hammer' && chargedHit && !e.dead) {
            e.stagger = Math.max(e.stagger || 0, 0) + 0.6;
            sparkle(e.x, e.y, '#c8a060');
            sparkle(e.x - 4, e.y - 2, '#a07840');
          }

          // RAZOR PACE crescendo VFX — the 5th-hit pop deserves to read.
          // Cyan ring + extra hit-stop so the rhythm beat lands in the
          // player's hands. Fires post-takeDamage so numbers update first.
          if (razorPaceCrescendo) {
            for (let k = 0; k < 10; k++) {
              const ang = (k / 10) * Math.PI * 2;
              sparkle(e.x + Math.cos(ang) * 18, e.y - 10 + Math.sin(ang) * 18, '#b0e0ff');
            }
            sparkle(e.x, e.y - 14, '#ffffff');
            triggerHitStop(0.07);
          }

          // WORLD-ENDER shield-shatter VFX — bright sapphire burst at the
          // shield's spawn point. The fantasy is the door opening; the
          // burst signals the player can now pour damage into the same
          // enemy without it being absorbed.
          if (worldEnderShatter) {
            for (let k = 0; k < 14; k++) {
              const ang = Math.random() * Math.PI * 2;
              const r = 8 + Math.random() * 24;
              sparkle(e.x + Math.cos(ang) * r, e.y - 12 + Math.sin(ang) * r, '#c8d8ff');
            }
            deathBurst(e.x, e.y - 12, '#c8d8ff');
            shakeCamera(8, 0.18);
            triggerHitStop(0.1);
          }
          hitSpark(e.x, e.y - 18, hero.aimX * -1, hero.aimY * -1, isCounter ? '#ffeb99' : isExec ? '#ff6a55' : '#ffddaa');
          const wpnShake = w.shakeMul || 1;
          const wpnHs = w.hitStopMul || 1;
          shakeCamera((isCounter ? 10 : isCrit ? 7 : 4.5) * wpnShake, (isCounter ? 0.2 : 0.14) * Math.max(0.85, wpnShake));
          // Weapon-specific hit audio — dagger rings high and sharp, hammer thuds deep
          const wpnHitBase = w.id === 'dagger' ? 1.4 : w.id === 'hammer' ? 0.55 : 1.0;
          const wpnHitVol  = w.id === 'hammer' ? 1.05 : w.id === 'dagger' ? 0.75 : 0.9;
          const critMul = isCrit ? 0.85 : 1.0;
          playSfx('slime_hit', { rate: wpnHitBase * critMul, rateJitter: 0.1, volume: wpnHitVol });
          // Finisher adds a layered secondary note — weapon's signature stinger
          if (finisherHit) {
            const finRate = w.id === 'dagger' ? 2.2 : w.id === 'hammer' ? 0.38 : 0.7;
            playSfx('slime_hit', { rate: finRate, volume: 0.55, rateJitter: 0.05 });
          }
          // Charged release adds a heavy low thump regardless of weapon
          if (chargedHit) {
            playSfx('slime_death', { rate: 0.5, volume: 0.65 });
          }
          // HUD LEGIBILITY PASS (review #2): pass charged/finisher flags so
          // the damage number surfaces the player-action badges (CHARGE!,
          // FINISH!). Without these, a chargedHit doing 1.85× damage reads
          // as just "a big crit" to the player.
          spawnDamageNumber(e.x, e.y - 36, finalDmg, { crit: isCrit, exec: isExec, counter: isCounter, charged: chargedHit, finisher: finisherHit, dir: { x: hero.aimX, y: hero.aimY }, elementTag: e._lastElementTag });
          spawnHitMarker(e.x, e.y - 20, isCrit || isCounter || isExec || chargedHit || finisherHit);
          triggerHitStop((isCounter ? 0.12 : isCrit ? 0.08 : 0.045) * wpnHs);
          // Camera zoom-in pulse on big hits — counter/exec/finisher/charged all pop
          if (isCounter) pulseZoom(0.06, 0.3);
          else if (isExec) pulseZoom(0.05, 0.25);
          else if (chargedHit) pulseZoom(0.05, 0.28);
          else if (finisherHit) pulseZoom(0.04, 0.22);
          else if (isCrit) pulseZoom(0.03, 0.18);
          // COUNTERSTRIKE — counter-hits detonate with a small AoE when relic owned
          if (isCounter && hero.counterstrike) {
            spawnExplosion(e.x, e.y - 8, 64, finalDmg * 0.7);
          }
          // HAMMER FINISHER — ground slam AoE around impact point
          if (finisherHit && w.id === 'hammer') {
            spawnExplosion(e.x, e.y - 6, 96, finalDmg * 0.45);
            shakeCamera(12, 0.28);
          }
          // CHARGE ATTACK — explosion on hit for screen-clearing feel
          if (chargedHit) {
            spawnExplosion(e.x, e.y - 6, 80, finalDmg * 0.35);
            shakeCamera(11, 0.24);
            triggerHitStop(0.09 * wpnHs);
          }
          registerComboHit();
          // Lifesteal — accumulate fractional heal so tiny hits don't get wasted.
          // FUSION: Blood Moon — scales up to 3× at 25% HP (desperate heal).
          // MEMORY: Hollow — the hollow shape cannot be filled; lifesteal
          // still fires its VFX/sounds (handled elsewhere) but grants no HP.
          // BLOOD set-bonus — folds a flat lifesteal add on top of any relic lifesteal
          const _effectiveLifesteal = (hero.lifesteal || 0) + (hero.themeLifestealBonus || 0);
          if (_effectiveLifesteal > 0 && hero.hp < hero.maxHp && !hero.memoryHollow) {
            let lsRate = _effectiveLifesteal;
            if (hero.fusionBloodMoon) {
              const missingFrac = 1 - (hero.hp / hero.maxHp);
              lsRate *= 1 + missingFrac * 3;          // 1× at full, 4× at 0 HP
            }
            // FUSION: Martyr Bloom — lifesteal doubles while at or below 50% HP.
            // Stacks with Blood Moon for high-risk vampiric builds.
            if (hero.fusionMartyrBloom && hero.hp <= hero.maxHp * 0.5) {
              lsRate *= 2;
            }
            hero._lifestealCarry = (hero._lifestealCarry || 0) + finalDmg * lsRate;
            if (hero._lifestealCarry >= 1) {
              const whole = Math.floor(hero._lifestealCarry);
              const before = hero.hp;
              hero.hp = Math.min(hero.maxHp, hero.hp + whole);
              hero._lifestealCarry -= whole;
              // FUSION: Witness — every actual HP gained from lifesteal grants
              // a breath of invulnerability. Makes sustain a shield.
              if (hero.fusionWitness && hero.hp > before) {
                hero.iframes = Math.max(hero.iframes || 0, 0.4);
              }
            }
          }
          // SYNERGY: Chain Lightning — every 3rd hit, arc to nearest other enemy
          if (hero.chainLightning) {
            hero.chainCount = (hero.chainCount + 1) % 3;
            if (hero.chainCount === 0) {
              markChainFired();   // visible pip-row flash
              let best = null, bestD = 99999;
              for (const other of enemies) {
                if (other === e || other.dead) continue;
                const dx = other.x - e.x, dy = other.y - e.y;
                const d2 = dx*dx + dy*dy;
                if (d2 < bestD && d2 < 240 * 240) { bestD = d2; best = other; }
              }
              if (best) {
                spawnLightningArc(e.x, e.y - 16, best.x, best.y - 16);
                // Chain Lightning = shock element: weak vs fire/cold, resisted by shock
                best.takeDamage(finalDmg * 0.7, (best.x - e.x) * 0.04, (best.y - e.y) * 0.04, { damageType: 'shock' });
                hitSpark(best.x, best.y - 18, 0, 0, '#a0e8ff');
                spawnDamageNumber(best.x, best.y - 36, finalDmg * 0.7, { color: '#a0e8ff', elementTag: best._lastElementTag });
                playSfx('click', { rate: 2.4, volume: 0.6 });
                // FUSION: Tesla Storm — chain arc also detonates as an explosion
                if (hero.fusionTeslaStorm) {
                  spawnExplosion(best.x, best.y - 8, 68, finalDmg * 0.5, 'shock');
                }
              }
            }
          }
          // SYNERGY: Echoing Strike — queue a delayed second hit
          if (hero.echoingStrike) {
            // BALANCE PASS (sim showed Echoing Strike in 67.5% of top
            // builds with +68 DPS uplift — clear outlier). Reduced echo
            // coefficient 0.60 → 0.40. Still the premier rare DPS relic,
            // but no longer a universal must-pick.
            scheduleEchoHit(e, 0.15, finalDmg * 0.4, hero.aimX, hero.aimY);
          }
          // LEGENDARY: Eye of Ether — crits pierce enemies in a line behind target
          if (isCrit && hero.pierceCrit) {
            pierceLine(hero.x, hero.y, e.x, e.y, finalDmg * 0.7, hero.aimX, hero.aimY);
          }
          // LEGENDARY: Cataclysm — track hit count, pulse room every 10th
          cataclysmRegisterHit(hero.damageMul || 1);
          // PYROMANCER: every 4th hit spawns a small fire explosion.
          // FUSION: Conflagration — bumps to every 2nd hit with bigger radius.
          if (hero.pyromancer) {
            const threshold = hero.fusionConflagration ? 2 : 4;
            hero.pyroCount = (hero.pyroCount + 1) % threshold;
            if (hero.pyroCount === 0) {
              markPyroFired();   // visible pip-row flash
              const radius = hero.fusionConflagration ? 70 : 52;
              const dmg = (hero.fusionConflagration ? 26 : 18) * (hero.damageMul || 1);
              spawnExplosion(e.x, e.y - 6, radius, dmg, 'fire');
            }
          }
        }
      }
    }
    if (hero.stateTime >= weaponDef().swingDur) {
      setState('idle');
      hero._swingIsFinisher = false;
      hero._swingIsCharged = false;
    }
  }
}

// Returns: 'hit' | 'absorbed' | 'perfect' — so callers can apply affix effects only on real hits
export function damageHero(amount, fromX, fromY) {
  if (hero.state === 'dead') return 'absorbed';
  // Perfect dodge: only fires on a TRUE dodge (Space input), not on
  // dash strikes that reuse the 'dodge' state for animation + iframes.
  // The dashStrikeTime guard distinguishes them — without it, every
  // hostile projectile that hit during a dash strike silently triggered
  // perfect-dodge bonuses (counter crit, whisper veil window, dash
  // master CD refund, oathshield boost, etc.). Dash strike has its
  // own iframes for safety; the damage gets absorbed lower in the
  // function via the iframes check.
  if (hero.state === 'dodge' && hero.dashStrikeTime <= 0) {
    // FLICKER STEP (dagger-only) — doubles the perfect-dodge counter
    // window. Counter-attack stays viable for 4.0s instead of 2.0s.
    const counterWindowMul = (hero.flickerStep && hero.weapon === 'dagger') ? 2 : 1;
    triggerPerfectDodge(counterWindowMul);
    stats.perfectDodges++;
    // SYSTEMS PASS — DASH MASTER: perfect dodges refund the dodge cooldown,
    // letting expert play chain perfect-dodges indefinitely. Pairs great
    // with counterstrike (explosion every counter-hit).
    if (hero.perfectDodgeRefund) hero.dodgeCooldown = 0;
    // TEMPORAL EYE — brief slow-motion on perfect dodge. Uses the
    // hit-stop pipeline already wired in fx.js (drives getTimeScale()).
    if (hero.temporalEye) { triggerHitStop(hero.temporalSlowDuration || 0.35); }
    // Chromatic aberration accent on perfect dodge — subtle 0.18 strength.
    // Makes the reward beat for frame-tight play visibly distinct.
    if (window.__triggerChromAberr) window.__triggerChromAberr(0.35, 0.18);
    // WHISPER VEIL — open a post-dodge window where the next hit is a crit.
    if (hero.whisperVeil) {
      hero.whisperVeilUntil = (typeof performance !== 'undefined') ? performance.now() / 1000 + hero.whisperVeilWindow : 0;
      hero.whisperVeilNextCrit = true;
    }
    // OATHSHIELD — next hit within 1s deals +50% damage.
    if (hero.oathshield) {
      hero.oathshieldUntil = (typeof performance !== 'undefined') ? performance.now() / 1000 + 1.0 : 0;
    }
    return 'perfect';
  }
  // SYSTEMS PASS — BULWARK: damage from within the frontal arc (aim-facing
  // cone, default ~120°) is halved. Rewards active positioning.
  if (hero.bulwark) {
    const dxF = fromX - hero.x, dyF = fromY - hero.y;
    const srcA = Math.atan2(dyF, dxF);
    const aimA = Math.atan2(hero.aimY, hero.aimX);
    let diffA = srcA - aimA;
    while (diffA > Math.PI) diffA -= Math.PI * 2;
    while (diffA < -Math.PI) diffA += Math.PI * 2;
    if (Math.abs(diffA) <= hero.bulwarkArc / 2) {
      amount *= hero.bulwarkReduction;
    }
  }
  // IRON RESOLVE parry — if the hero has held their ground (≥0.3s still)
  // AND is facing the attacker (±60°), the hit is turned aside: -85% dmg
  // + slow the attacker by 60% for 0.5s. Rewards defensive stance play.
  // Base -20% dmg-taken mul still applies (set in apply()); parry is ON TOP.
  if (hero.ironResolveParry && (hero._stillT || 0) >= 0.3) {
    const dxF = fromX - hero.x, dyF = fromY - hero.y;
    const srcA = Math.atan2(dyF, dxF);
    const aimA = Math.atan2(hero.aimY, hero.aimX);
    let diffA = srcA - aimA;
    while (diffA > Math.PI) diffA -= Math.PI * 2;
    while (diffA < -Math.PI) diffA += Math.PI * 2;
    if (Math.abs(diffA) <= Math.PI / 3) {    // ±60° arc
      amount *= 0.15;                        // -85%
      // Spark burst + brief slow on the nearest attacker candidate
      for (let k = 0; k < 8; k++) {
        const ang = aimA + (k - 4) * 0.12;
        hitSpark(hero.x + Math.cos(ang) * 18, hero.y + Math.sin(ang) * 18, 0, 0, '#cfe4ff');
      }
      // Stagger the nearest enemy near the damage source (uses the existing
      // stagger duration field the combat system already reads).
      for (const e of activeEnemies) {
        if (e.dead || e.state === 'dead') continue;
        const edx = e.x - fromX, edy = e.y - fromY;
        if (edx * edx + edy * edy < 36 * 36) {
          e.stagger = Math.max(e.stagger || 0, 0.45);
        }
      }
      triggerScreenFlash('rgba(180, 210, 240, 0.18)', 0.25);
      playSfx('click', { rate: 2.4, volume: 0.7 });
    }
  }
  // HOURGLASS OF RESPITE — at 30% HP or below, halve incoming damage once
  // per minute. Panic-button safety for low-HP play; cooldown prevents it
  // from trivializing sustained low-HP builds.
  if (hero.hourglassRespite && hero.hp / hero.maxHp <= 0.30) {
    const _hgNow = (typeof performance !== 'undefined') ? performance.now() : 0;
    if (_hgNow > hero.hourglassReadyAt) {
      amount *= 0.5;
      hero.hourglassReadyAt = _hgNow + 60000;   // 60s cooldown
      triggerScreenFlash('rgba(232, 200, 128, 0.25)', 0.4);
    }
  }
  if (hero.iframes > 0) return 'absorbed';
  if (window.GOD) return 'absorbed';
  // VOW T2 ascendance — the first strike in each room is turned aside.
  // Consumed here (after bulwark/hourglass reductions) so all defensive
  // relics still get their fractional damage-reduction effect on "what the
  // shield would have blocked", and THEN the shield eats the remainder.
  if (hero.themeVowShieldAvailable && (hero.activeThemes?.vow || 0) >= 2) {
    hero.themeVowShieldAvailable = false;
    triggerScreenFlash('rgba(190, 210, 240, 0.28)', 0.35);
    hero.iframes = Math.max(hero.iframes || 0, 0.35);
    return 'absorbed';
  }
  // Round damage to integer so HP stays clean (no floating-point HP text).
  // FUSION: Mountain's Heart — at full HP, 15% damage resist.
  // FUSION: Stalwart — below 50% HP, resistance doubles (0.67x multiplier
  //          on takenMul so damageTakenMul 0.75 becomes 0.50 effective).
  let takenMul = hero.damageTakenMul || 1;
  // VOW set-bonus — flat damage-taken reduction at 3/5 theme stacks
  if (hero.themeDmgTakenReduction > 0) takenMul *= (1 - hero.themeDmgTakenReduction);
  if (hero.fusionMountainsHeart && hero.hp >= hero.maxHp) takenMul *= 0.85;
  if (hero.fusionStalwart && hero.hp < hero.maxHp * 0.5) takenMul *= 0.67;
  const taken = Math.max(1, Math.round(amount * takenMul));
  stats.damageTaken += taken;
  hero.hp -= taken;
  // MIRROR SHARD — reflect a fraction of the damage taken back to the enemy
  // closest to the damage source. Shatterpoint fusion crits the reflection.
  // Guard: if a reflector enemy's own reflection re-triggers damageHero (or
  // if an AoE reflection cascades across multiple concurrent hits), the
  // `_inReflection` flag ensures we only reflect ONCE per source hit.
  if (hero.mirrorShard && hero.mirrorReflect > 0 && activeEnemies.length && !hero._inReflection) {
    let closest = null, closestD = 200 * 200;
    for (const e of activeEnemies) {
      if (e.dead || e.state === 'dead') continue;
      const dx = e.x - fromX, dy = e.y - fromY;
      const d2 = dx * dx + dy * dy;
      if (d2 < closestD) { closest = e; closestD = d2; }
    }
    if (closest) {
      let reflectDmg = taken * hero.mirrorReflect;
      if (hero.fusionShatterpoint) reflectDmg *= (hero.mirrorReflectCrit || 2.5);
      hero._inReflection = true;
      try {
        closest.takeDamage(reflectDmg, 0, 0);
      } finally {
        hero._inReflection = false;
      }
      sparkle(closest.x, closest.y - 10, '#d8e8ff');
      sparkle(closest.x, closest.y - 4, '#ffffff');
    }
  }
  // Store hit direction for the damage-source arrow UI
  window.__gameMetrics.lastHitFromX = fromX;
  window.__gameMetrics.lastHitFromY = fromY;
  window.__gameMetrics.lastHitTime = performance.now();
  if (hero.hp / hero.maxHp <= 0.30) showTip('first_low_hp');
  hero.iframes = IFRAME_AFTER_HIT;
  // Shake scales with hit weight — heavy hits feel punishing
  const hitWeight = Math.min(2, taken / 3);
  shakeCamera(7 * hitWeight, 0.2);
  // Red screen flash — sharp, brief, less intrusive than before.
  // Capped lower so the playfield stays readable even at low HP.
  // VFX SUBTRACTION PASS: alpha halved 0.22 → 0.11 so rapid enemy hits
  // don't strobe the playfield into noise.
  const flashDur = Math.min(0.22, 0.08 + taken * 0.03);
  triggerScreenFlash('rgba(220, 40, 50, 0.11)', flashDur);
  // Chromatic aberration — now PUNCTUATION, not ambient. Only fires when
  // the hit brings hero to low HP (<=30%) or when a boss hits; ordinary
  // trash-mob taps stay clean so the pixel art reads.
  const _lowHpNow = (hero.hp / Math.max(1, hero.maxHp)) <= 0.30;
  if (window.__triggerChromAberr && _lowHpNow) {
    window.__triggerChromAberr(Math.min(0.5, 0.22 + taken * 0.04), Math.min(1.6, 0.8 + hitWeight * 0.5));
  }
  playSfx('hero_hurt', { rate: 1.0, rateJitter: 0.05, volume: 0.9 });
  if (hero.hp <= 0) {
    if (hero.revives > 0) {
      hero.revives -= 1;
      hero.hp = Math.max(1, Math.ceil(hero.maxHp * 0.3));         // Phoenix Cloak revives at 30%
      hero.iframes = 1.8;
      setState('hurt');
      shakeCamera(18, 0.4);
      // PHOENIX CLOAK — explosive revive that clears nearby enemies
      if (hero.phoenixCloak) {
        spawnExplosion(hero.x, hero.y, 180, 80);
      }
      // Return 'hit' (not undefined) — the damage DID land before
      // the revive consumed it. Callers that key off the result
      // (e.g. projectiles.js running affix.onHitHero on real hits)
      // would otherwise silently skip their on-hit triggers when a
      // revived hit was the proc. Bug found in smoothing review.
      return 'hit';
    }
    hero.hp = 0;
    setState('dead');
    // Death punctuation — strong chromatic smear marks the moment. Strength
    // maxed so the final frame reads as "something broke in the world."
    if (window.__triggerChromAberr) window.__triggerChromAberr(0.85, 1.6);
  } else {
    setState('hurt');
    // Light knockback
    const dx = hero.x - fromX, dy = hero.y - fromY;
    const m = Math.hypot(dx, dy) || 1;
    const kb = 90;
    moveAxis('x', (dx / m) * kb * 0.02);
    moveAxis('y', (dy / m) * kb * 0.02);
  }
  return 'hit';
}

// Pick sprite + frame count based on state
function heroFrameInfo() {
  switch (hero.state) {
    case 'attack': return { img: images.knight_attack, fps: 18, loop: false };
    case 'hurt':   return { img: images.knight_hurt,   fps: 12, loop: false };
    case 'dead':   return { img: images.knight_death,  fps: 8,  loop: false };
    case 'walk':
    case 'dodge':  return { img: images.knight_walk,   fps: 12, loop: true };
    default:       return { img: images.knight_idle,   fps: 6,  loop: true };
  }
}

// Convert a screen-space vector (dx, dy; +Y = down) to a compass bucket index:
// 0=N, 1=NE, 2=E, 3=SE, 4=S, 5=SW, 6=W, 7=NW. Returns null if vector is ~zero.
function vecToDirection(dx, dy) {
  if (!isFinite(dx) || !isFinite(dy)) return null;
  if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return null;
  // atan2 gives [-π, π] with 0=EAST, +Y=SOUTH (screen space).
  // Shift by +π/2 so NORTH becomes 0 radians, then normalize to [0, 2π),
  // divide by (π/4), round, mod 8. 0=N → 2=E → 4=S → 6=W as required.
  let a = Math.atan2(dy, dx) + Math.PI / 2;
  const TAU = Math.PI * 2;
  a = ((a % TAU) + TAU) % TAU;
  const bucket = Math.round(a / (Math.PI / 4)) % 8;
  return bucket;
}

// Return an integer 0–7 row index for the current hero state. Uses aim vector
// during attack/dodge/dashStrike (dashStrike lives under state==='dodge' with
// dashStrikeTime>0; aim is still the correct source). Uses velocity during
// walk. Falls back to hero.lastDirection for idle/hurt/dead or ambiguous input.
// Side effect: updates hero.lastDirection whenever a valid new direction is
// derived, so subsequent idle/hurt frames have a sensible facing to resume.
export function heroDirection(h = hero) {
  let dir = null;
  const st = h.state;
  if (st === 'attack') {
    // Body locks to the aim direction sampled at swing-trigger time so
    // the body commits to the swing — flicking the mouse mid-attack no
    // longer rotates the sprite. Falls back to live aim if the locked
    // values aren't set yet (first frame of an attack).
    dir = vecToDirection(h.attackFacingX ?? h.aimX, h.attackFacingY ?? h.aimY);
  } else if (st === 'dodge') {
    // Dodge body locks to the LOCKED direction (set at activation),
    // not live aim. Two flavors:
    //   - Dash-strike (offensive lunge, Q key): body faces the
    //     dash direction (dashStrikeDirX/Y, derived from aim at trigger).
    //   - Regular dodge (Space): body faces the roll direction
    //     (dodgeDirX/Y, derived from WASD input at trigger, falls
    //     back to aim if no WASD held).
    // Reads as 'the hero commits to the maneuver they triggered' —
    // the body doesn't pirouette to chase the mouse mid-dodge.
    if (h.dashStrikeTime > 0) {
      dir = vecToDirection(h.dashStrikeDirX, h.dashStrikeDirY);
    } else {
      dir = vecToDirection(h.dodgeDirX, h.dodgeDirY);
    }
    // Final fallback — if both lock vectors are stale (zero), fall
    // back to live aim so we never return null from this branch.
    if (dir === null) dir = vecToDirection(h.aimX, h.aimY);
  } else if (st === 'walk') {
    dir = vecToDirection(h.vx, h.vy);
    if (dir === null) dir = vecToDirection(h.aimX, h.aimY);
  }
  // idle / hurt / dead and any fallback: keep previous direction.
  if (dir === null) return h.lastDirection ?? 4;
  h.lastDirection = dir;
  return dir;
}

// Render the dash/dodge afterimage ghost trail. Each entry is a hero
// pose captured at intervals during travel; we render them as fading
// copies so the player reads "where I just was" instead of an
// interpolated body sliding through. Drawn BEFORE the main hero sprite
// so afterimages sit underneath the arrived hero (during the few frames
// after the move ends and the trail is still draining).
//
// Per-entry `kind` tints + peak alpha differ per ability:
//   dash  — golden, peak alpha 0.5 (live hero is hidden, ghosts carry
//           the visual entirely)
//   dodge — cool blue, peak alpha 0.35 (live hero stays at low alpha,
//           ghosts add the motion-blur read on top)
//
// The two filters use the same hue-rotate technique on a saturated
// silhouette — sharp tinted ghosts that don't duplicate the hero's
// detail (which would read as "two heroes" instead of "trail").
const _AFTERIMAGE_FILTER_GOLD = 'brightness(0) saturate(100%) sepia(100%) hue-rotate(-10deg) saturate(700%) brightness(1.4)';
const _AFTERIMAGE_FILTER_BLUE = 'brightness(0) saturate(100%) sepia(100%) hue-rotate(170deg) saturate(700%) brightness(1.4)';
function drawDashAfterimages(ctx) {
  if (_dashAfterimages.length === 0) return;
  const info = heroFrameInfo();
  const img = info.img;
  if (!img) return;
  const drawSize = room.kind === 'hamlet' ? HERO_DRAW_HAMLET : HERO_DRAW;
  const sx0 = 0;
  ctx.save();
  for (const a of _dashAfterimages) {
    // Fade curve: opaque when newest, fade to 0 over AFTERIMAGE_LIFE.
    // Peak alpha differs per kind — dash trails carry the visual alone
    // so they're brighter; dodge ghosts share the screen with a
    // dimmed live hero so they're more subdued.
    const isDash = a.kind === 'dash';
    const peakAlpha = isDash ? 0.5 : 0.35;
    const lifeFrac = 1 - (a.age / AFTERIMAGE_LIFE);
    const alpha = peakAlpha * lifeFrac * lifeFrac;     // ease-out
    if (alpha <= 0.02) continue;
    ctx.globalAlpha = alpha;
    ctx.filter = isDash ? _AFTERIMAGE_FILTER_GOLD : _AFTERIMAGE_FILTER_BLUE;
    const sy = a.dir * SPR;
    ctx.drawImage(img, sx0, sy, SPR, SPR,
                  a.x - drawSize / 2, a.y - drawSize * 0.75,
                  drawSize, drawSize);
  }
  ctx.filter = 'none';
  ctx.restore();
}

export function drawHero(ctx) {
  // Render dash afterimage ghosts FIRST so they sit beneath the live
  // hero (which is itself hidden mid-dash). They're in world-space, so
  // they can't share the ctx.translate further down.
  drawDashAfterimages(ctx);
  const info = heroFrameInfo();
  const img = info.img;
  if (!img) return;
  const frames = Math.max(1, Math.floor(img.width / SPR));
  let f;
  if (info.loop) {
    f = Math.floor(hero.animTime * info.fps) % frames;
  } else {
    f = Math.min(frames - 1, Math.floor(hero.stateTime * info.fps));
  }
  const sx = f * SPR;
  const sy = heroDirection(hero) * SPR;
  // I-frame flicker
  const flicker = hero.iframes > 0 && Math.floor(hero.stateTime * 20) % 2 === 0;
  ctx.save();
  ctx.globalAlpha = flicker ? 0.45 : 1;
  // Warm halo beneath hero — helps read against dark floor without looking spotlit
  const hx = hero.x, hy = hero.y - 20;
  const halo = ctx.createRadialGradient(hx, hy, 4, hx, hy, 46);
  halo.addColorStop(0, 'rgba(255, 210, 140, 0.15)');
  halo.addColorStop(0.5, 'rgba(255, 180, 110, 0.06)');
  halo.addColorStop(1, 'rgba(255, 160, 80, 0)');
  ctx.fillStyle = halo;
  ctx.fillRect(hx - 46, hy - 46, 92, 92);

  // Charge-up ring — fills around hero while LMB is held, locks golden once armed
  if (hero.chargeTime > 0.08 && !hero.chargeReleased) {
    const t = Math.min(1, hero.chargeTime / 0.35);
    const armed = t >= 1;
    const pulse = armed ? (0.75 + 0.25 * Math.sin(performance.now() / 70)) : 1;
    const r = 28 + t * 10;
    ctx.save();
    // Arc sweep showing fill
    ctx.strokeStyle = armed
      ? `rgba(255, 235, 140, ${(0.85 * pulse).toFixed(3)})`
      : `rgba(255, 200, 120, ${(0.55 * t).toFixed(3)})`;
    ctx.lineWidth = armed ? 3 : 2;
    ctx.beginPath();
    ctx.arc(hx, hy + 4, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * t);
    ctx.stroke();
    // Inner soft glow when armed
    if (armed) {
      const ag = ctx.createRadialGradient(hx, hy + 4, 4, hx, hy + 4, r + 10);
      ag.addColorStop(0, `rgba(255, 230, 140, ${(0.18 * pulse).toFixed(3)})`);
      ag.addColorStop(1, 'rgba(255, 230, 140, 0)');
      ctx.fillStyle = ag;
      ctx.fillRect(hx - (r + 10), hy + 4 - (r + 10), (r + 10) * 2, (r + 10) * 2);
    }
    ctx.restore();
  }

  // Shadow — soft radial gradient. Sized proportionally to the hero's
  // current draw size so it reads as standing (not levitating) at any zoom.
  // Lighter alpha in hamlet so it doesn't fight the painted scene's own
  // baked shadows under trees/walls.
  const shX = hero.x, shY = hero.y + 14;
  const inHamlet = room.kind === 'hamlet';
  const shadowR = (inHamlet ? HERO_DRAW_HAMLET : HERO_DRAW) * 0.27;
  const shadowAlpha = inHamlet ? 0.22 : 0.45;
  const sg = ctx.createRadialGradient(shX, shY, 1, shX, shY, shadowR);
  sg.addColorStop(0, `rgba(0,0,0,${shadowAlpha})`);
  sg.addColorStop(0.6, `rgba(0,0,0,${(shadowAlpha * 0.5).toFixed(3)})`);
  sg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save();
  ctx.fillStyle = sg;
  ctx.beginPath();
  ctx.ellipse(shX, shY, shadowR, shadowR * 0.36, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // 8-directional sprites handle facing natively — no horizontal flip.
  // Idle bob — subtle sinusoidal y offset when not attacking/dodging, for a
  // "breathing" character. Tiny (< 2px) so it doesn't look floaty.
  const idleBob = (hero.state === 'idle') ? Math.sin(hero.animTime * 2.6) * 1.2 : 0;
  ctx.translate(hero.x, hero.y + idleBob);
  // Hamlet uses a smaller draw size so the hero reads at proper scale
  // against the painted backdrop's NPCs + props (see HERO_DRAW_HAMLET).
  const drawSize = room.kind === 'hamlet' ? HERO_DRAW_HAMLET : HERO_DRAW;
  // TELEPORT FEEL — during the dash strike, hide the hero sprite
  // entirely. Afterimages (drawn earlier in drawDashAfterimages) carry
  // the visual; the live body would otherwise slide across the screen
  // and break the teleport read. Halo + shadow stay visible (the
  // teleport leaves a footprint), only the sprite + rim are skipped.
  if (hero.dashStrikeTime > 0) {
    ctx.restore();
    return;
  }
  // DODGE — hero sprite renders at low alpha so the live body reads as
  // motion-blurred instead of a fully-visible slide. Afterimage ghosts
  // (cool blue, dropped at intervals during the dodge) do most of the
  // visual work; the live sprite stays partly visible so the player
  // still reads the hero's rough position. Skipping the rim pass too
  // since rim-on-translucent-body looks broken.
  let dodgeAlpha = 1;
  if (hero.state === 'dodge') {
    dodgeAlpha = 0.35;
  }
  // Rim light pass — draw sprite offset in 4 directions with a warm tint to create
  // an outline. Makes hero pop off the floor, AAA-style silhouette polish.
  // Skip during i-frame flicker, dodge state, or death.
  if (!flicker && hero.state !== 'dead' && hero.state !== 'dodge') {
    const rimFilter = 'brightness(0) saturate(100%) sepia(100%) hue-rotate(-10deg) saturate(800%) brightness(1.6)';
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.filter = rimFilter;
    const rim = 1.2;
    ctx.drawImage(img, sx, sy, SPR, SPR, -drawSize/2 - rim, -drawSize * 0.75,        drawSize, drawSize);
    ctx.drawImage(img, sx, sy, SPR, SPR, -drawSize/2 + rim, -drawSize * 0.75,        drawSize, drawSize);
    ctx.drawImage(img, sx, sy, SPR, SPR, -drawSize/2,        -drawSize * 0.75 - rim, drawSize, drawSize);
    ctx.drawImage(img, sx, sy, SPR, SPR, -drawSize/2,        -drawSize * 0.75 + rim, drawSize, drawSize);
    ctx.filter = 'none';
    ctx.restore();
  }
  const wf = weaponDef().heroFilter;
  if (wf) ctx.filter = wf;
  if (dodgeAlpha < 1) ctx.globalAlpha = (ctx.globalAlpha || 1) * dodgeAlpha;
  ctx.drawImage(img, sx, sy, SPR, SPR, -drawSize/2, -drawSize * 0.75, drawSize, drawSize);
  if (wf) ctx.filter = 'none';
  ctx.restore();
}

export const HERO_CONSTS = { HERO_RADIUS };
