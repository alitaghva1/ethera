// Hero controller — top-down movement, directional attack, dodge roll
import { images } from './loader.js';
import { keys, mouse, keyJustPressed } from './input.js';
import { playSfx } from './sfx.js';
import { isWallAtWorld, TILE, hitCrackedWall, damageCrackedWall, roomSecrets, tryHitUrn, roomTorches } from './room.js';
import { hitSpark, dashTrail, footPuff, landingBurst, killRing } from './particles.js?v=8';
import { shakeCamera, pulseZoom } from './camera.js?v=2';
import { triggerHitStop, spawnDamageNumber, spawnSlash, triggerPerfectDodge, hasCounterAttack, consumeCounterAttack, triggerScreenFlash, spawnHitMarker } from './fx.js';
import { stats } from './stats.js';
import { WEAPONS } from './weapons.js';
import {
  spawnLightningArc, scheduleEchoHit, registerComboHit,
  beginThunderTrail, addThunderTrailPoint, endThunderTrail,
  cataclysmRegisterHit, pierceLine, wandererOnDodge,
  spawnExplosion, combo,
} from './synergies.js';
import { spawnEmberFlame } from './enemies.js';
import { dropGold } from './gold.js';
import { deathBurst } from './particles.js?v=8';
import { showTip } from './tips.js';

const SPR = 100;                  // Tiny RPG native frame size
const HERO_DRAW = 96;              // on-screen hero size (slightly scaled down)
const HERO_RADIUS = 14;            // collision
const HERO_SPEED = 230;
const DODGE_SPEED = 620;
const DODGE_DUR = 0.32;      // was 0.28 — slightly more generous perfect-dodge window
const DODGE_COOLDOWN = 0.6;
const IFRAME_AFTER_HIT = 0.55;

export const DODGE_COOLDOWN_BASE = DODGE_COOLDOWN;

// Weapon accessor — hero.weapon stores the id; this reads the def.
function weaponDef() { return WEAPONS[hero.weapon] || WEAPONS.sword; }

export const hero = {
  x: 0, y: 0,
  vx: 0, vy: 0,
  facing: 1,
  aimX: 1, aimY: 0,
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
  hero.maxHp = 8;               // was 10 — fragile start, rewards meta HP unlocks
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
  hero.startingGold = 0;
  hero.relicCount = 0;     // maintained by relics.js for Memory of the Bell
  hero.swingIndex = 0;
  hero.swingChainTime = 0;
  hero.chargeTime = 0;
  hero.chargeReleased = false;
  hero.dashStrikeCD = 0;
  hero.dashStrikeTime = 0;
  hero.dashStrikeHit.clear();
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
  // INPUT BUFFERING — remember attack presses for 0.15s so snappy combo feel
  // doesn't require pixel-perfect cooldown timing.
  if (mouse.pressed) hero._attackBuffer = 0.15;
  if (hero._attackBuffer > 0) hero._attackBuffer -= dt;
  // Swing chain window decays — drops swingIndex to 0 after 0.8s of no attacks
  if (hero.swingChainTime > 0) {
    hero.swingChainTime -= dt;
    if (hero.swingChainTime <= 0) hero.swingIndex = 0;
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
      triggerScreenFlash('rgba(160, 220, 255, 0.22)', 0.25);
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
    // Dash Strike (Q) — offensive gap-closer: lunges toward aim + 2x damage to all in path
    if (keyJustPressed('KeyQ') && hero.dashStrikeCD <= 0) {
      showTip('first_dash');
      hero.dashStrikeCD = 5.0;
      hero.dashStrikeTime = 0.22;
      // Lock direction at aim vector (normalized)
      const m = Math.hypot(hero.aimX, hero.aimY) || 1;
      hero.dashStrikeDirX = hero.aimX / m;
      hero.dashStrikeDirY = hero.aimY / m;
      hero.dashStrikeHit.clear();
      hero.iframes = 0.35;
      setState('dodge');                          // reuse dodge state for anim + invuln
      playSfx('sword_swing', { rate: 0.6, volume: 1.0 });
      playSfx('slime_hit', { rate: 0.7, volume: 0.75 });
      shakeCamera(6, 0.15);
      pulseZoom(0.05, 0.28);
      // Big slash arc at dash start for visual flair
      spawnSlash(hero.x, hero.y - 8, hero.dashStrikeDirX, hero.dashStrikeDirY, 110, {
        color: 'rgba(255, 200, 120, ',
        width: 14,
        trailCount: 4,
        arc: Math.PI * 1.3,
        dur: 0.3,
      });
      triggerScreenFlash('rgba(255, 220, 140, 0.16)', 0.18);
    }
    // Dodge — blocked entirely by Memory of Stillness (the pact: you traded
    // your dodge for other gifts; pressing Space is a null input).
    else if (keyJustPressed('Space') && hero.dodgeCooldown <= 0 && !hero.memoryStillness) {
      showTip('first_dodge');
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
      hero.iframes = DODGE_DUR + 0.05;
      setState('dodge');
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
    }
    // Attack — fresh tap, buffered tap (late press honored), combo follow-up, or charge release
    else if ((mouse.pressed || hero._attackBuffer > 0 || (mouse.down && hero.chargeTime >= 0.35 && !hero.chargeReleased)) && hero.attackCooldown <= 0) {
      // Consume the buffer so it doesn't re-trigger on next idle frame
      hero._attackBuffer = 0;
      const w = weaponDef();
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
      hero.attackCooldown = w.cooldown * hero.attackCooldownMul * wandererMul * soulreaverMul * bigSwingMul;
      setState('attack');
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
        const slowMul = hero.slowTime > 0 ? hero.slowMul : 1;
        const spd = HERO_SPEED * hero.speedMul * slowMul;
        moveAxis('x', dx * spd * dt);
        moveAxis('y', dy * spd * dt);
        setState('walk');
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
      }
    }
  }

  // Dodge / Dash Strike motion — shared state, different behavior
  if (hero.state === 'dodge') {
    const isDashStrike = hero.dashStrikeTime > 0;
    if (isDashStrike) {
      const dur = 0.22;
      const t = 1 - (hero.dashStrikeTime / dur);
      const speed = 900 * (1 - t * 0.6);    // faster than dodge, linear decel
      moveAxis('x', hero.dashStrikeDirX * speed * dt);
      moveAxis('y', hero.dashStrikeDirY * speed * dt);
      // Golden trail
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
      }
    } else {
      const t = hero.stateTime / DODGE_DUR;
      const speed = DODGE_SPEED * hero.dodgeDistMul * (1 - t * t);
      moveAxis('x', hero.dodgeDirX * speed * dt);
      moveAxis('y', hero.dodgeDirY * speed * dt);
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

  // Attack hitbox — active in middle of the swing
  if (hero.state === 'attack') {
    const w = weaponDef();
    const t = hero.stateTime / w.swingDur;
    if (t > 0.25 && t < 0.75) {
      const reach = w.reach * hero.reachMul;
      const damage = w.damage * hero.damageMul;
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
          if (isCounter) { consumeCounterAttack(); hero._counterUsedThisSwing = true; }
          const isCrit = isCounter || (hero.critChance > 0 && Math.random() < hero.critChance);
          const isExec = hero.executeThreshold > 0 && e.hp / e.maxHp < hero.executeThreshold;
          let finalDmg = damage;
          if (isCrit) finalDmg *= hero.critMul;
          if (isExec) finalDmg *= hero.executeMul;
          // FUSION: Final Verdict — crit on a below-threshold enemy = instakill.
          // Pumps damage to multiples of the target's max HP so nothing survives.
          if (hero.fusionFinalVerdict && isCrit && isExec && !e.boss) {
            finalDmg = Math.max(finalDmg, (e.maxHp || 999) * 3);
          }
          if (isCounter) finalDmg *= (hero.counterstrike ? 2.0 : 1.5);
          // BLOODRITE — +15% damage while below 50% HP
          if (hero.bloodrite && hero.hp < hero.maxHp * 0.5) finalDmg *= 1.15;
          // CHARGE ATTACK — guaranteed crit vibe: 1.85x dmg + forces isCrit for VFX
          const chargedHit = hero._swingIsCharged;
          if (chargedHit) finalDmg *= 1.85;
          // WEAPON FINISHER — 3rd swing in chain — per-weapon unique bonus
          const finisherHit = hero._swingIsFinisher;
          if (finisherHit) {
            if (w.id === 'sword')       finalDmg *= 1.5;      // sword: +50% dmg
            else if (w.id === 'dagger') finalDmg *= 1.25;     // dagger: modest +25%, will also pierce (handled below)
            else if (w.id === 'hammer') finalDmg *= 1.6;      // hammer: +60% + AoE (handled below)
          }
          // COMBO BONUS — keeping a streak going rewards damage.
          // FUSION: Tempest — combo bonus ~doubles at RAMPAGE+ and CARNAGE.
          const cc = combo.count || 0;
          const tempestMul = hero.fusionTempest ? 2 : 1;
          if (cc >= 40)      finalDmg *= 1 + 0.35 * tempestMul;   // +35% / +70%
          else if (cc >= 20) finalDmg *= 1 + 0.22 * tempestMul;
          else if (cc >= 10) finalDmg *= 1 + 0.12 * tempestMul;
          else if (cc >= 5)  { finalDmg *= 1.05; showTip('first_crit'); }
          // FUSION: Mountain's Heart — at full HP, +10% damage
          if (hero.fusionMountainsHeart && hero.hp >= hero.maxHp) {
            finalDmg *= 1.10;
          }
          const kbScale = hero.knockbackMul * w.knockbackMul * (isCounter ? 1.8 : 1);
          e.takeDamage(finalDmg, hero.aimX * kbScale, hero.aimY * kbScale);
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
          spawnDamageNumber(e.x, e.y - 36, finalDmg, { crit: isCrit, exec: isExec, counter: isCounter, dir: { x: hero.aimX, y: hero.aimY }, elementTag: e._lastElementTag });
          spawnHitMarker(e.x, e.y - 20, isCrit || isCounter || isExec);
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
          if (hero.lifesteal > 0 && hero.hp < hero.maxHp && !hero.memoryHollow) {
            let lsRate = hero.lifesteal;
            if (hero.fusionBloodMoon) {
              const missingFrac = 1 - (hero.hp / hero.maxHp);
              lsRate *= 1 + missingFrac * 3;          // 1× at full, 4× at 0 HP
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
            scheduleEchoHit(e, 0.15, finalDmg * 0.6, hero.aimX, hero.aimY);
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
  if (hero.state === 'dodge') {
    triggerPerfectDodge();
    stats.perfectDodges++;
    return 'perfect';
  }
  if (hero.iframes > 0) return 'absorbed';
  if (window.GOD) return 'absorbed';
  // Round damage to integer so HP stays clean (no floating-point HP text).
  // FUSION: Mountain's Heart — at full HP, 15% damage resist.
  // FUSION: Stalwart — below 50% HP, resistance doubles (0.67x multiplier
  //          on takenMul so damageTakenMul 0.75 becomes 0.50 effective).
  let takenMul = hero.damageTakenMul || 1;
  if (hero.fusionMountainsHeart && hero.hp >= hero.maxHp) takenMul *= 0.85;
  if (hero.fusionStalwart && hero.hp < hero.maxHp * 0.5) takenMul *= 0.67;
  const taken = Math.max(1, Math.round(amount * takenMul));
  stats.damageTaken += taken;
  hero.hp -= taken;
  // Store hit direction for the damage-source arrow UI
  window.__lastHitFromX = fromX;
  window.__lastHitFromY = fromY;
  window.__lastHitTime = performance.now();
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
  // Chromatic aberration trigger — function is a no-op this pass (see main.js).
  // Call kept so if we re-enable, this damage path still drives it.
  if (window.__triggerChromAberr) {
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
      return;
    }
    hero.hp = 0;
    setState('dead');
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

export function drawHero(ctx) {
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

  // Shadow — softer and smaller so hero reads as standing, not levitating
  const shX = hero.x, shY = hero.y + 14;
  const sg = ctx.createRadialGradient(shX, shY, 2, shX, shY, 20);
  sg.addColorStop(0, 'rgba(0,0,0,0.45)');
  sg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sg;
  ctx.fillRect(shX - 20, shY - 6, 40, 12);
  // Sprite (flipped if facing left). Apply weapon-tint filter for build readability.
  // Idle bob — subtle sinusoidal y offset when not attacking/dodging, for a
  // "breathing" character. Tiny (< 2px) so it doesn't look floaty.
  const idleBob = (hero.state === 'idle') ? Math.sin(hero.animTime * 2.6) * 1.2 : 0;
  ctx.translate(hero.x, hero.y + idleBob);
  ctx.scale(hero.facing, 1);
  // Rim light pass — draw sprite offset in 4 directions with a warm tint to create
  // an outline. Makes hero pop off the floor, AAA-style silhouette polish.
  // Skip during i-frame flicker or dodge to avoid visual clutter.
  if (!flicker && hero.state !== 'dead') {
    const rimFilter = 'brightness(0) saturate(100%) sepia(100%) hue-rotate(-10deg) saturate(800%) brightness(1.6)';
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.filter = rimFilter;
    const rim = 1.2;
    ctx.drawImage(img, sx, 0, SPR, SPR, -HERO_DRAW/2 - rim, -HERO_DRAW * 0.75,        HERO_DRAW, HERO_DRAW);
    ctx.drawImage(img, sx, 0, SPR, SPR, -HERO_DRAW/2 + rim, -HERO_DRAW * 0.75,        HERO_DRAW, HERO_DRAW);
    ctx.drawImage(img, sx, 0, SPR, SPR, -HERO_DRAW/2,        -HERO_DRAW * 0.75 - rim, HERO_DRAW, HERO_DRAW);
    ctx.drawImage(img, sx, 0, SPR, SPR, -HERO_DRAW/2,        -HERO_DRAW * 0.75 + rim, HERO_DRAW, HERO_DRAW);
    ctx.filter = 'none';
    ctx.restore();
  }
  const wf = weaponDef().heroFilter;
  if (wf) ctx.filter = wf;
  ctx.drawImage(img, sx, 0, SPR, SPR, -HERO_DRAW/2, -HERO_DRAW * 0.75, HERO_DRAW, HERO_DRAW);
  if (wf) ctx.filter = 'none';
  ctx.restore();
}

export const HERO_CONSTS = { HERO_RADIUS };
