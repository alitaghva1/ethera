// Hero controller — top-down movement, directional attack, dodge roll
import { images } from './loader.js';
import { keys, mouse, keyJustPressed, virtualMove, wheel } from './input.js';
import { isMobileMode } from './mobileMode.js';
import { playSfx } from './sfx.js';
import { isWallAtWorld, TILE, hitCrackedWall, damageCrackedWall, roomSecrets, tryHitUrn, roomTorches, room } from './room.js';
// Wizard-kit Sprint 1 — landingBurst is no longer used. The old dodge
// fired a landing-dust burst when it ended; the shield is stationary
// so there's no landing to mark. Sprint 2 may reintroduce a small
// "shield down" dust on shield-end if the lift transition needs more
// weight — for now the cone fade-out handles it.
import { hitSpark, dashTrail, footPuff, killRing, sparkle } from './particles.js';
import { shakeCamera, pulseZoom } from './camera.js';
import { triggerHitStop, spawnDamageNumber, spawnSlash, triggerPerfectDodge, hasCounterAttack, consumeCounterAttack, grantCounterAttack, triggerScreenFlash, spawnHitMarker } from './fx.js';
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
import { markChainFired, markPyroFired, markQuiverFired, markRingingFired, markTwinFired, markMountainFired, markRazorFired } from './counterPips.js';
import { synthSwoosh, synthClick, synthPing, synthThud, synthChord } from './synth.js';
import { spawnHeroBolt } from './projectiles.js';
import { settings } from './settings';

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
// Wizard-kit Sprint 1 — was used for the cool-blue afterimage trail
// on the old movement-dodge. Shield is stationary (no afterimages),
// so this constant has no consumer. Kept as `_DODGE_AFTERIMAGE_INTERVAL`
// for one release in case Sprint 2 needs it back for sustained-block
// VFX, then can be deleted.
const _DODGE_AFTERIMAGE_INTERVAL = 0.05;
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
// Legacy dodge constants — kept under DODGE_* names because save data,
// relics, and meta unlocks all reference the legacy `dodgeCooldown` /
// `dodgeCooldownMul` fields. DODGE_COOLDOWN drives the shield CD now
// (same 0.6s base; relic multipliers stack the same way). The shield
// uses its own SHIELD_DUR / SHIELD_PERFECT_WINDOW constants below —
// 0.32s dodge duration was tuned for movement-with-iframes, the shield
// is stationary so 0.35s reads as a clearer defensive beat.
const _DODGE_SPEED = 580;             // unused since shield is stationary
const _DODGE_DUR = 0.32;              // unused; SHIELD_DUR replaces it
const DODGE_COOLDOWN = 0.6;
const SHIELD_DUR = 0.35;
const SHIELD_PERFECT_WINDOW = 0.10;
const SHIELD_MOVE_MUL = 0.5;        // hero moves at half speed while shielding
const IFRAME_AFTER_HIT = 0.55;

export const DODGE_COOLDOWN_BASE = DODGE_COOLDOWN;

// Weapon accessor — hero.weapon stores the id; this reads the def.
function weaponDef() { return WEAPONS[hero.weapon] || WEAPONS.sword; }

/**
 * Phase 5 audit fix #6 — Hero shape, documented as a typedef. The hero
 * is a singleton mutable object with 100+ fields touched by 30+ modules.
 * No runtime guards, no validation, no setter discipline — any module
 * that imports `hero` can mutate any field. This typedef captures the
 * SHAPE so consumers (and humans reading the code) have a contract,
 * even though tsconfig has checkJs:false (so it's documentation, not
 * enforcement).
 *
 * Bumping fields:
 *   - New stat field → add under the matching category (vital signs,
 *     multipliers, counters, flags) so groupings stay readable.
 *   - New flag for a relic effect → goes under "relic flags." Most
 *     are booleans; a few are numbers (counter values).
 *   - New ability state → if it persists across rooms, add to the
 *     RunSnapshot typedef in main.js too (and bump RUN_SNAPSHOT_SCHEMA
 *     + add a migration if old saves should still load).
 *
 * @typedef {Object} Hero
 * @property {number} x                   - world position
 * @property {number} y                   - world position
 * @property {number} vx                  - velocity (computed each frame)
 * @property {number} vy                  - velocity (computed each frame)
 * @property {number} aimX                - normalized aim vector x
 * @property {number} aimY                - normalized aim vector y
 * @property {('sword'|'dagger'|'hammer'|'wand')} weapon - weapon class id
 * @property {('sword'|'blast')} activeWeapon - wizard-kit slot
 * @property {number} hp                  - current HP
 * @property {number} maxHp               - max HP
 * @property {string} state               - idle/walk/attack/shield/dash/blink/hurt/dead
 * @property {number} stateTime           - seconds since state entered
 * @property {number} attackCooldown      - seconds remaining until next swing
 * @property {number} dodgeCooldown       - shield CD (legacy field name)
 * @property {number} iframes             - invulnerability seconds remaining
 * @property {number} damageMul           - outgoing damage multiplier (cumulative)
 * @property {number} damageTakenMul      - incoming damage multiplier (cumulative)
 * @property {number} attackCooldownMul   - swing cooldown multiplier
 * @property {number} dodgeCooldownMul    - shield cooldown multiplier
 * @property {number} speedMul            - move speed multiplier
 * @property {number} reachMul            - sword reach multiplier
 * @property {number} knockbackMul        - knockback magnitude multiplier
 * @property {number} dodgeDistMul        - shield duration multiplier (legacy name)
 * @property {number} critChance          - 0..1 crit roll probability
 * @property {number} critMul             - crit damage multiplier
 * @property {number} lifesteal           - 0..1 fraction of damage healed
 * @property {number} regenRate           - HP regen per second
 * @property {number} executeThreshold    - HP fraction below which execute fires
 * @property {number} executeMul          - execute damage multiplier
 * @property {number} revives             - phoenix consumable count
 * @property {?string} _lastHurtBy        - enemy/hazard type id of last damage source (for run-end narrative)
 * @property {number} relicCount          - len(equipped relics) — read by Memory of the Bell + Warlord
 * @property {Object<string,number>} activeThemes - { storm, flame, blood, vow, shadow } → tier 0/1/2
 * @property {Set} hitThisSwing           - per-swing dedup set
 * @property {boolean} chainLightning     - example flag (one of 60+ relic flags)
 * @property {boolean} firstStrikeOnEnemy - Iron Greaves armed
 * @property {boolean} resonanceStone     - Sprint 3C cross-ability flag
 * @property {boolean} twinFangPact       - Sprint 3C cross-ability flag
 * @property {boolean} phaseFlicker       - Sprint 3C cross-ability flag
 * @property {boolean} echoStep           - Sprint 3C cross-ability flag
 * @property {boolean} adaptiveEdge       - Sprint 3C cross-ability flag
 *
 * (Many fields elided for brevity — the full set is the literal below.
 * Add new ones via category, keep groupings together.)
 */
export const hero = {
  x: 0, y: 0,
  vx: 0, vy: 0,
  facing: 1,
  lastDirection: 4,                 // 8-dir sprite row index (0=N, 2=E, 4=S, 6=W); default SOUTH
  aimX: 1, aimY: 0,
  attackFacingX: 1, attackFacingY: 0,     // body facing locked at swing trigger; see heroDirection()
  weapon: 'sword',                   // id into WEAPONS; set by main.js run start
  hp: 8, maxHp: 8,
  // Wizard-kit Sprint 1+2A — state values:
  //   idle / walk     — ambient
  //   attack          — sword swing in progress
  //   shield          — Space-tap defensive stance (stationary, ~0.35s,
  //                     front-180° directional check; first 0.10s = perfect)
  //   dash            — Q dash-strike's iframe + animation window
  //                     (sword-only as of Sprint 2A polish)
  //   hurt / dead     — knockback + run-end
  state: 'idle',
  stateTime: 0,
  animTime: 0,
  attackCooldown: 0,
  // Cooldown timer for the shield raise. The legacy field name is kept
  // because save snapshots, relic apply() functions (nimble_step,
  // dash_master, gale_step, second_wind), and meta unlocks (swift_boots)
  // all read/write `dodgeCooldown` / `dodgeCooldownMul`. Migrating the
  // names would break save compat for in-flight runs. Semantically these
  // now control the shield's CD; the variable name is legacy.
  dodgeCooldown: 0,
  iframes: 0,
  attackHitDone: false,
  hitThisSwing: new Set(),
  // Wizard-kit Sprint 1 — dodgeDirX/Y are unused now (shield is
  // stationary, no direction vector). Kept on the object to avoid
  // breaking any code path that still reads them; the dash-strike
  // path uses dashStrikeDirX/Y instead.
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
  // Wand-only counterpart to the melee 3-swing rhythm. Round-6 combat
  // audit flagged that wand had NO combo cadence — sword/dagger/hammer
  // all reward a 3rd-hit finisher, but wand was tap-tap-tap forever.
  // Now every 3rd bolt fires as a "SPELL WEAVE" with +60% damage and
  // an amber tint so the rhythm muscle memory carries across all four
  // weapon classes. Counter increments on tap-fire only (charged shots
  // bypass — they're already a committed beat with their own visuals).
  boltIndex: 0,                      // 0 / 1 / 2 — every 3rd bolt is woven
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
  // Round-6 mythic relics (Ember Tyrant pool expansion):
  //   heartOfWoundAvailable — first lethal hit reduces to 1 HP + push
  //     attackers + iframes (consumed on use, like phoenix_cloak revive
  //     except it doesn't restore HP).
  //   strideOfAsh — dodging spawns 3 ember flames along the dodge path
  //     (uses spawnEmberFlame from enemies.js, the bomber-trail system).
  //   coinOfTyrant — kills tick a counter; every 8th drops a free
  //     common relic on the floor. Also bumps goldMul by 1.5× (set in
  //     the relic's apply() — no separate flag needed for that part).
  //   coinOfTyrantCounter — the kill-tick counter (0..7).
  heartOfWoundAvailable: false,
  strideOfAsh: false,
  coinOfTyrant: false,
  coinOfTyrantCounter: 0,
  // Expanded pool stats
  damageTakenMul: 1,          // Iron Resolve: ×0.75
  critChance: 0,               // Keen Edge: +0.15
  critMul: 2,                  // crit damage multiplier
  regenRate: 0,                // Vitality: 0.125 (1 HP per 8s); continuous trickle
  regenCD: 0,                  // timer for next regen tick
  knockbackMul: 1,             // Heavy Blow: ×2.5
  dodgeDistMul: 1,             // Dash Master: ×1.35
  galeStep: false,             // Gale Step (Round-6 retune): post-dodge speed burst
  galeBurstTime: 0,            // remaining seconds on the post-dodge burst (0 = inactive)
  executeThreshold: 0,         // Executioner: 0.4
  executeMul: 1.5,             // damage multiplier below threshold

  // ── WIZARD KIT v2 (Sprint 2A) ────────────────────────────────────
  // Two-weapon slot architecture: 'sword' (slot 1) and 'blast' (slot 2)
  // are loaded simultaneously. Press 1 / 2 / mouse wheel to make one
  // ACTIVE — LMB and RMB then route to the active weapon's primary +
  // secondary actions. Shield (Space) and Dash Strike (Q) are utility
  // abilities that work weapon-agnostically.
  //
  //   activeWeapon === 'sword':
  //     LMB tap   = sword swing (uses hero.weapon variant: sword/dagger/hammer)
  //     LMB hold  = charged heavy strike
  //     RMB       = LUNGE THRUST (forward dash + extended reach)
  //   activeWeapon === 'blast':
  //     LMB tap   = single bolt cast (~0.4s cadence)
  //     LMB hold  = charged sniper bolt (planned, Sprint 2B)
  //     RMB       = CHAIN CAST (heavier bolt that arcs to 2 more enemies)
  activeWeapon: 'sword',       // 'sword' | 'blast'

  // Sword RMB — currently empty. Lunge Thrust was removed in Sprint
  // 2A polish because it functionally overlapped with Dash Strike
  // (Q): both were "forward thrust through enemies" with similar
  // i-frame + reach profiles. Sword Q is now the sole melee mobility
  // commit. Sprint 2B will fill RMB with a properly distinct sword
  // secondary (Sword Throw boomerang OR Parry Stance OR Whirlwind).

  // Blast LMB — single bolt cast. Hold-to-autofire (mouse.down) so the
  // mage's primary attack feels responsive without finger-spam. Each
  // shot is gated by blastBoltCD; holding LMB just means "fire the
  // next bolt as soon as the cadence allows." Roguelite players
  // expect this rhythm (Vampire Survivors / Brotato / Risk of Rain).
  // Tuning targets:
  //   - blastBoltCD 0.28s gives ~3.5 bolts/sec sustained — meaningful
  //     range pressure without trivializing close-quarters trade.
  //   - blastBoltDamage 18 vs sword tap 32 → 56% sword DPS ratio at
  //     max cadence, which tracks the design intent ("blast pressures,
  //     sword finishes").
  //   - blastBoltSpeed 850 reduces enemy-dodging vs the old 700 (700
  //     felt slow enough that fast walkers could sidestep).
  //   - blastBoltRadius 9 vs old 6 — more forgiving hitbox, matches
  //     the wand-charged radius (10) so the read is "this is real
  //     range damage, not a pea-shooter."
  blastBoltCD: 0,
  blastBoltMaxCD: 0.28,
  blastBoltDamage: 18,
  blastBoltSpeed: 850,
  blastBoltLife: 1.0,
  blastBoltRadius: 13,

  // Blast Q — Blink Teleport (wizard-kit Sprint 2B). Short-range
  // non-damage teleport for caster mobility. Distinct from Sword Q
  // (Dash Strike): blink is "I'm somewhere else now" — no hit on
  // path, no afterimage trail, brief i-frames. Pairs naturally with
  // hold-LMB autofire ("retreat-shoot-retreat" rhythm).
  blinkCD: 0,
  blinkMaxCD: 3.5,             // faster CD than dash strike's 5s
  blinkRange: 140,             // travel distance in aim direction
  blinkTime: 0,                // tick during teleport animation (very brief)
  blinkDirX: 0, blinkDirY: 0,

  // Legacy fields — chainCastCD / blastCD kept on the object so any
  // stray reader doesn't crash. Sprint 2B doesn't write to them; the
  // chain-cast logic in projectiles.js still works if a future relic
  // ("Forked Cast") opts a bolt into the chainCast flag pipeline.
  chainCastCD: 0,
  blastCD: 0,
  blastMaxCD: 1.5,

  // ── CROSS-ABILITY SYNERGY RELICS (Sprint 3C) ────────────────────
  // Each flag is set by the relic's apply() and read in the relevant
  // hot path. Windows track a deadline (performance.now()/1000) past
  // which the proc is dead; a value of 0 means "not armed."
  //
  // Resonance Stone — kill with one weapon arms a crit on the OTHER
  // weapon's next attack. resonanceKillWeapon stores which weapon
  // landed the kill; resonanceKillUntil is the 3s expiry.
  resonanceStone: false,
  resonanceKillWeapon: null,
  resonanceKillUntil: 0,
  resonanceCritReady: false,        // armed at swap, consumed on next hit

  // Twin Fang Pact — weapon swap grants 0.4s of +50% damage. Window
  // ticks down purely on wall-clock; no charges to count.
  twinFangPact: false,
  twinFangBuffUntil: 0,

  // Phase Flicker — blink within 1s after a perfect-block grants the
  // next blast a free chain cast (0 CD AND chainCount: 2).
  phaseFlicker: false,
  phaseFlickerArmedUntil: 0,        // window opened by perfect-block
  phaseFlickerNextBlast: false,     // armed by blink-during-window

  // Echo Step — post-blink, the next 2s of incoming damage is treated
  // as a perfect-block (no front-cone gate). Single-use; consumed on
  // first eligible hit OR when window expires.
  echoStep: false,
  echoStepUntil: 0,

  // Adaptive Edge — passive +5% active-weapon damage per relic owned
  // of the OFF-slot's affects. Recomputed in applyRelic alongside
  // theme/slot tiers; written here so attack calc reads it directly.
  adaptiveEdge: false,
  adaptiveEdgeBlastSideCount: 0,    // for sword-active reads
  adaptiveEdgeSwordSideCount: 0,    // for blast-active reads
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
  // Wizard-kit Sprint 2A — weapon slots reset to sword equipped, all
  // weapon CDs cleared. activeWeapon persists across rooms within a
  // run (intentional — last-equipped sticks); only resetHero rolls
  // it back to sword default.
  hero.activeWeapon = 'sword';
  hero.blastBoltCD = 0;
  hero.chainCastCD = 0;
  hero.blastCD = 0;
  hero.blinkCD = 0;
  hero.blinkTime = 0;
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
  hero.galeStep = false;
  hero.galeBurstTime = 0;
  hero.heartOfWoundAvailable = false;
  hero.strideOfAsh = false;
  hero.coinOfTyrant = false;
  hero.coinOfTyrantCounter = 0;
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
  // Iron Greaves — first-strike-on-each-enemy crit flag (replaces the
  // earlier invisible 2s-motion trigger). Per-enemy `_heroFirstStrike`
  // flags live on the enemy objects and are naturally cleaned up when
  // the enemy dies; no global tracking needed beyond this gate.
  hero.firstStrikeOnEnemy = false;
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
  // Weapon-signature fusions (April 2026)
  hero.fusionSwornReply = false;
  hero.fusionMortalCadence = false;
  hero.fusionAvalanche = false;
  hero.fusionCrescendo = false;
  hero.fusionForkedSky = false;
  // Wired-up dead fusions (kingslayer / weaving_step) per bug review
  hero.fusionKingslayer = false;
  hero.fusionWeavingStep = false;
  hero.weavingStepReady = false;
  // VOW T2 + SHADOW T2 + FLAME ascendance auxiliary fields — gated by
  // hero.activeThemes everywhere they're read, so a stale value can't
  // leak the actual buff. Reset here as defense in depth so future
  // refactors that drop the activeThemes gate don't silently inherit.
  hero.themeShadowFlankingUntil = 0;
  hero.themeVowShieldAvailable = false;
  hero.themeFlameTick = 0;
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
  // Wizard-kit Sprint 2A — weapon-slot cooldowns. Each weapon's CDs
  // tick independently of which weapon is currently active so
  // swapping mid-fight doesn't pause a recovering CD on the inactive
  // slot (matches Borderlands / Diablo weapon-swap behavior where
  // the off-hand recharges in your pocket).
  if (hero.blastBoltCD > 0) hero.blastBoltCD -= dt;
  if (hero.blinkCD > 0) hero.blinkCD -= dt;
  // Legacy Sprint 1 field — kept ticking so any old code path still
  // reads sensible values; Sprint 2A doesn't write to it.
  if (hero.blastCD > 0) hero.blastCD -= dt;
  if (hero.dashStrikeCD > 0) hero.dashStrikeCD -= dt;
  if (hero.iframes > 0) hero.iframes -= dt;
  if (hero.galeBurstTime > 0) hero.galeBurstTime -= dt;

  // ── HAMLET — SOFT REFUSAL OF COMBAT INPUTS ────────────────────────
  // The hamlet is a non-combat hub: LMB swing, LMB blast, RMB / 1 / 2 /
  // wheel swap, and Q (dash strike or blink) all hit `room.kind !==
  // 'hamlet'` gate clauses below and silently no-op. Without
  // acknowledgment, an attempt feels like the controller broke —
  // so this block runs FIRST and confirms the input registered:
  //
  //   • Once-per-profile tip the very first attempt:
  //     "Your blade rests here — the hamlet keeps no quarrel with itself"
  //   • Throttled (0.18s) muffled-tap audio — synthClick at low pitch
  //     reads as cloth/sheath, not a metallic clang.
  //   • Two warm sparkles around the hero's chest, drifting INWARD
  //     so the visual reads "the impulse settled" rather than "the
  //     swing escaped." Particles already gated to dt-based fade so
  //     they cost almost nothing per frame.
  //
  // Space (shield) is NOT included — the shield raise produces a
  // visible cone in hamlet too, so it's already self-acknowledging.
  // Movement keys are obviously not combat. Only the truly silent
  // inputs get the cue.
  if (room.kind === 'hamlet') {
    const triedCombat = mouse.pressed
      || mouse.rightPressed
      || keyJustPressed('KeyQ')
      || keyJustPressed('Digit1')
      || keyJustPressed('Digit2')
      || wheel.delta !== 0;
    if (triedCombat) {
      // Diegetic teaching beat — fires once per profile via showTip's
      // localStorage-backed seen-set. Subsequent attempts get only
      // the audio + sparkle (no rail spam).
      showTip('first_hamlet_peace');
      // Throttle audio + visual to one cue per 0.18s so a player who
      // mashes attack doesn't get a stack of clicks.
      const _hnow = (typeof performance !== 'undefined') ? performance.now() / 1000 : 0;
      if (!hero._hamletRefuseUntil || _hnow >= hero._hamletRefuseUntil) {
        hero._hamletRefuseUntil = _hnow + 0.18;
        try { synthClick(0.55, 0.25); } catch (_e) {}
        sparkle(hero.x - 6, hero.y - 14, '#c9a86a');
        sparkle(hero.x + 6, hero.y - 10, '#d8b87a');
      }
      // Eat the wheel accumulator so a single scroll doesn't keep
      // re-firing the cue across frames (the swap branch below
      // would also eat it but only when in dungeon — gate-mismatch).
      if (wheel.delta !== 0) wheel.delta = 0;
    }
  }

  // ── WEAPON SWAP — wizard-kit Sprint 2B ──────────────────────────
  // Multiple inputs all swap weapons (free, no CD, no lockout):
  //   • RMB (mouse.rightPressed)  — primary input. Single-button,
  //     mouse-hand fluid. The "right-click swaps tools" feel
  //     (Borderlands / Hyper Light Drifter).
  //   • Number keys 1 / 2          — direct slot select (re-pressing
  //     the active weapon's number is a no-op).
  //   • Mouse wheel up/down        — cycle weapons.
  //
  // Suppressed in hamlet (the canvas hub is a non-combat scene).
  if (room.kind !== 'hamlet') {
    let wantSwap = null;
    if (keyJustPressed('Digit1') && hero.activeWeapon !== 'sword') wantSwap = 'sword';
    else if (keyJustPressed('Digit2') && hero.activeWeapon !== 'blast') wantSwap = 'blast';
    else if (wheel.delta !== 0) {
      wantSwap = hero.activeWeapon === 'sword' ? 'blast' : 'sword';
      wheel.delta = 0;
    } else if (mouse.rightPressed) {
      // RMB toggle — flips to the other slot. With 2 slots this is
      // a strict toggle; future-3-slot direction would advance.
      wantSwap = hero.activeWeapon === 'sword' ? 'blast' : 'sword';
    }
    if (wantSwap && wantSwap !== hero.activeWeapon) {
      hero.activeWeapon = wantSwap;
      // First-swap onboarding tip — confirms the input registered and
      // teaches all four ways to trigger it. Subsequent swaps stay
      // silent (showTip() de-dupes via localStorage).
      showTip('first_swap');
      // Clear any in-flight LMB-charge so the new weapon doesn't
      // inherit the prior weapon's charge meter.
      hero.chargeTime = 0;
      hero.chargeReleased = false;
      // Audio cue — light "shing" for the swap. Reuse synthClick
      // at a higher pitch so the moment reads tactile without
      // needing a dedicated synth preset yet.
      try { synthClick(1.5, 0.35); } catch (_e) {}

      // ── CROSS-ABILITY RELIC HOOKS — Sprint 3C ────────────────
      const swapNow = (typeof performance !== 'undefined') ? performance.now() / 1000 : 0;

      // Twin Fang Pact — swap grants 0.4s of +50% damage. The buff
      // is read in the damage-calc paths (sword swing + blast bolt
      // spawn) via twinFangBuffUntil > now.
      if (hero.twinFangPact) {
        hero.twinFangBuffUntil = swapNow + 0.4;
      }

      // Resonance Stone — if the swap is into a weapon DIFFERENT from
      // the one that landed the recent kill, AND we're within the 3s
      // armed window, prime the next attack to crit.
      if (hero.resonanceStone
        && hero.resonanceKillWeapon
        && hero.resonanceKillWeapon !== hero.activeWeapon
        && hero.resonanceKillUntil > swapNow) {
        hero.resonanceCritReady = true;
      }
    } else if (wheel.delta !== 0) {
      // Wheel-scroll on a 2-slot system already handled above; just
      // ensure the accumulator doesn't stack across frames.
      wheel.delta = 0;
    }
  }
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
  // INPUT BUFFERING — remember presses for 0.15s so snappy feel
  // doesn't require pixel-perfect cooldown timing. Phase 2 audit fix: was
  // attack-only; players who pressed Space (shield) or Q (dash/blink) at
  // the tail of an attack lockout had the input silently eaten — felt
  // like a class of "I pressed it, the game ate it" frustrations. Now
  // all three combat keys carry the same 150ms grace.
  if (mouse.pressed) hero._attackBuffer = 0.15;
  if (hero._attackBuffer > 0) hero._attackBuffer -= dt;
  if (keyJustPressed('Space')) hero._shieldBuffer = 0.15;
  if (hero._shieldBuffer > 0) hero._shieldBuffer -= dt;
  if (keyJustPressed('KeyQ')) hero._qBuffer = 0.15;
  if (hero._qBuffer > 0) hero._qBuffer -= dt;
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
      // FUSION: Crescendo — Ringing Steel stacks PERSIST across the
      // chain decay (and across kills). The pact is "the bell, struck
      // once, rings until the song is over" — only a death/run-end
      // resets the chain.
      if (!hero.fusionCrescendo) hero.ringingSteelStacks = 0;
      hero.twinPulseTick = 0;
      hero.razorPaceHits = 0;
    }
  }
  // Charge attack — accumulate while LMB held, but not during attack/shield/dash/lunge/hurt states.
  // Wizard-kit Sprint 2A: also gated on activeWeapon === 'sword'.
  // When BLAST is the active weapon, holding LMB does NOT charge (Sprint 2B
  // adds blast charged-bolt as a separate accumulator); the sword's charge
  // meter would otherwise tick under a wrong-weapon hold and surprise the
  // player on next swap.
  if (mouse.down && hero.activeWeapon === 'sword' && hero.state !== 'attack' && hero.state !== 'shield' && hero.state !== 'dash' && hero.state !== 'blink' && hero.state !== 'hurt' && hero.attackCooldown <= 0) {
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

  // Aim vector. Default: toward mouse world pos. On mobile (no mouse), we
  // auto-aim toward the nearest live enemy in a generous radius; if no
  // enemy is in range we aim in the joystick movement direction (so
  // attacks fire forward as you move). Falling back further to the last
  // facing keeps the swing direction stable when the player is idle.
  let useAutoAim = false;
  if (isMobileMode()) {
    // Heuristic: if the mouse hasn't moved into the canvas yet (player
    // is touch-only), or virtualMove is active, auto-aim wins. The
    // canvas's pointer listeners still update mouseWorld for taps,
    // but on a phone there's no hover, so the position will be wherever
    // the last touch was — not useful for aim. Auto-aim is the correct
    // default for touch.
    useAutoAim = true;
  }
  if (useAutoAim) {
    let bestE = null;
    let bestScore = 380 * 380;  // ~380px aim radius — generous, enemies usually closer
    // Mobile UX audit P0 — naive "nearest enemy" sent charged swings
    // INTO bombers (which explode on contact) and made vanguards
    // (frontal-block 0 dmg) preferred targets. Score adjustments:
    //   - Bombers: ×1.6 on the squared-distance score so they're
    //     deprioritized unless they're the only thing around.
    //   - Vanguards facing the hero: ×2.0 (treated as "very far") since
    //     hitting their front is wasted; the player has to flank manually.
    for (let i = 0; i < activeEnemies.length; i++) {
      const e = activeEnemies[i];
      if (!e || e.dead || e.hp <= 0) continue;
      const dx = e.x - hero.x;
      const dy = e.y - hero.y;
      let score = dx * dx + dy * dy;
      const beh = e.def && e.def.behavior;
      if (beh === 'bomber') score *= 1.6;
      // Vanguards have a frontal block — if their facing dot the
      // hero-toward-vanguard vector is positive, the hero would be
      // approaching their shield. Push them way down the aim list.
      if (e.type === 'vanguard') {
        const facingX = e.facing || 1;
        // dot of facing vector and (hero -> enemy) — positive = enemy
        // is facing AWAY from hero (so vulnerable from behind), negative
        // = enemy is facing toward hero (shield-up).
        const heroToEnemy = -dx;     // facing is just X-flipped 1/-1
        if (facingX * heroToEnemy < 0) score *= 2.0;
      }
      if (score < bestScore) { bestScore = score; bestE = e; }
    }
    if (bestE) {
      const dx = bestE.x - hero.x;
      const dy = bestE.y - hero.y;
      const m = Math.hypot(dx, dy) || 1;
      hero.aimX = dx / m;
      hero.aimY = dy / m;
    } else if (virtualMove.active && (virtualMove.x !== 0 || virtualMove.y !== 0)) {
      // No enemy nearby — aim in the direction the joystick is pushing
      // so charged attacks/dashes fire where the player is heading.
      const m = Math.hypot(virtualMove.x, virtualMove.y) || 1;
      hero.aimX = virtualMove.x / m;
      hero.aimY = virtualMove.y / m;
    }
    // else: hero.aimX/aimY retain last frame's value — stable idle facing.
  } else {
    const ax = mouseWorld.x - hero.x;
    const ay = mouseWorld.y - hero.y;
    const am = Math.hypot(ax, ay) || 1;
    hero.aimX = ax / am;
    hero.aimY = ay / am;
  }
  hero.facing = hero.aimX >= 0 ? 1 : -1;

  // State transitions
  if (hero.state === 'hurt') {
    if (hero.stateTime > 0.22) setState('idle');
  }

  if (hero.state !== 'attack' && hero.state !== 'shield' && hero.state !== 'dash' && hero.state !== 'blink' && hero.state !== 'blink' && hero.state !== 'hurt') {
    // Q (sword equipped) → Dash Strike: damage along path, golden afterimage.
    // Q (blast equipped) → Blink: short teleport, no damage, cyan ring.
    //
    // Each weapon's Q has a distinct role:
    //   - Sword Q is "I'm coming through" (commit + damage burst)
    //   - Blast Q is "I'm somewhere else now" (escape + reposition)
    //
    // Both share the Q keybind to keep muscle memory clean. The
    // active-weapon gate routes the input to the right handler.
    if (room.kind !== 'hamlet' && hero.activeWeapon === 'sword' && (keyJustPressed('KeyQ') || hero._qBuffer > 0) && hero.dashStrikeCD <= 0) {
      hero._qBuffer = 0;     // consume buffered press
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
      // Never shorten an existing longer iframe window (post-hurt stagger,
      // Aegis Pulse, etc.). Mirrors the dodge guard at line ~649. Without
      // this, dashing into a hit-cleanup window would strip safety frames.
      hero.iframes = Math.max(hero.iframes || 0, 0.35);
      // Wizard-kit Sprint 1 — dash strike now uses its own 'dash'
      // state instead of piggybacking on 'dodge' (which became the
      // SHIELD state). Splitting them out lets the perfect-block
      // detection in damageHero be unambiguous: only 'shield' state
      // triggers perfect-block; 'dash' just gets normal iframe
      // absorption via the iframes path.
      setState('dash');
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
    // ── BLINK (Q, blast equipped) — wizard-kit Sprint 2B ──────────
    // Short non-damaging teleport for caster mobility. Distinct from
    // dash strike: shorter range, no enemies-in-path damage, faster
    // CD, briefer i-frames, cyan visuals (no afterimage trail —
    // teleport reads as "phase out → phase in," not "I lunged").
    // Movement is INSTANT (single-frame teleport with brief animation
    // window for visuals + iframes); blinkTime > 0 just keeps the
    // 'blink' state alive long enough to render the arrival ring.
    else if (
      room.kind !== 'hamlet' &&
      hero.activeWeapon === 'blast' &&
      (keyJustPressed('KeyQ') || hero._qBuffer > 0) &&
      hero.blinkCD <= 0
    ) {
      hero._qBuffer = 0;     // consume buffered press
      // First-blink onboarding tip — players who learned `Q = dash` with
      // sword equipped need to know it MUTATES into a no-damage teleport
      // when blast is active. Without this, Q-with-blast feels like the
      // dash got broken.
      showTip('first_blink');
      hero.blinkCD = hero.blinkMaxCD;
      hero.blinkTime = 0.15;          // visual-window duration
      const m = Math.hypot(hero.aimX, hero.aimY) || 1;
      const dirX = hero.aimX / m, dirY = hero.aimY / m;
      hero.blinkDirX = dirX;
      hero.blinkDirY = dirY;
      // Origin position before the teleport — used for the "departure"
      // ring (drawn by drawHero while in blink state).
      hero._blinkOriginX = hero.x;
      hero._blinkOriginY = hero.y;
      // Walk-tested teleport: try the full blinkRange in aim direction;
      // if a wall blocks, walk the distance back step-by-step until
      // we land in clear space. Prevents teleporting INTO walls.
      const targetDist = hero.blinkRange;
      const stepCount = 8;
      let landed = false;
      for (let s = 0; s < stepCount; s++) {
        const tryDist = targetDist * (1 - s / stepCount);
        const tx = hero.x + dirX * tryDist;
        const ty = hero.y + dirY * tryDist;
        if (!isWallAtWorld(tx + Math.sign(dirX) * HERO_RADIUS, ty)
          && !isWallAtWorld(tx, ty + Math.sign(dirY) * HERO_RADIUS)) {
          hero.x = tx;
          hero.y = ty;
          landed = true;
          break;
        }
      }
      if (!landed) {
        // Even the smallest step was blocked — abort the cast (refund
        // CD) so the player isn't punished for blinking into a wall.
        hero.blinkCD = 0;
        hero.blinkTime = 0;
      } else {
        hero.iframes = Math.max(hero.iframes || 0, 0.15);
        setState('blink');
        hero._stillT = 0;
        // Audio: high-pitched zip + secondary ping for the arrival
        try { synthSwoosh(2.0, 0.6, 0.08); } catch (_e) {}
        try { synthPing(1240, 0.55, 0.20); } catch (_e) {}
        shakeCamera(3, 0.10);
        // Origin ring — cyan sparkles where the hero VANISHED FROM
        for (let i = 0; i < 14; i++) {
          const ang = (i / 14) * Math.PI * 2;
          const r = 14 + Math.random() * 6;
          sparkle(
            hero._blinkOriginX + Math.cos(ang) * r,
            hero._blinkOriginY - 8 + Math.sin(ang) * r * 0.7,
            '#a0e8ff'
          );
        }
        // Arrival ring — brighter sparkles where the hero APPEARED
        for (let i = 0; i < 14; i++) {
          const ang = (i / 14) * Math.PI * 2;
          const r = 16 + Math.random() * 8;
          sparkle(
            hero.x + Math.cos(ang) * r,
            hero.y - 8 + Math.sin(ang) * r * 0.7,
            '#d8f0ff'
          );
        }
        triggerScreenFlash('rgba(160, 220, 255, 0.10)', 0.18);

        // ── CROSS-ABILITY RELIC HOOKS (Sprint 3C) ────────────────
        const _bnow = (typeof performance !== 'undefined') ? performance.now() / 1000 : 0;

        // Phase Flicker — if the player blinks during the post-perfect-
        // block window, arm the next blast for a free chain cast. The
        // window is consumed AND the chain is queued; if the player
        // doesn't fire blast soon, the queue persists (no expiry —
        // intentional: you earned the empowered shot).
        if (hero.phaseFlicker && _bnow < hero.phaseFlickerArmedUntil) {
          hero.phaseFlickerArmedUntil = 0;
          hero.phaseFlickerNextBlast = true;
          // Distinct audio sting — chord up to mark the moment.
          try { synthChord(440, 0.55, 0.65); } catch (_e) {}
          try { synthPing(1480, 0.45, 0.18); } catch (_e) {}
        }

        // Echo Step — post-blink, the next 2s of incoming damage is
        // treated as a free perfect-block (no front-cone gate, no
        // counter consumption — pure absorption with the standard
        // perfect-block FX). Single-use; the damageHero handler
        // resets echoStepUntil to 0 on consume.
        if (hero.echoStep) {
          hero.echoStepUntil = _bnow + 2.0;
        }
      }
    }
    // Shield (Space) — wizard-kit Sprint 1. Replaces the old dodge:
    // same key, same cooldown timing, same iframe behavior, but the
    // hero is stationary and a directional front-cone block applies
    // in damageHero. The first 0.10s of the raise is a PERFECT BLOCK
    // window that grants the same counter-attack hooks the old
    // perfect-dodge granted. All existing relic triggers (thunder
    // step, wanderer cloak, stride of ash, storm/shadow ascendance,
    // weaving step) fire on shield raise — they were ability-start
    // hooks, not movement hooks, so the rebind is automatic.
    //
    // Memory of Stillness still gates the input (the pact: you
    // traded your defensive cast for other gifts).
    // Second Wind still grants a free first-shield-per-room.
    else if (
      (keyJustPressed('Space') || hero._shieldBuffer > 0) &&
      !hero.memoryStillness &&
      (hero.dodgeCooldown <= 0 || (hero.secondWind && hero.secondWindAvailable))
    ) {
      hero._shieldBuffer = 0;     // consume buffered press
      showTip('first_dodge');
      // Consume the Second Wind charge if we used it.
      const usedSecondWind = hero.dodgeCooldown > 0 && hero.secondWind && hero.secondWindAvailable;
      if (usedSecondWind) hero.secondWindAvailable = false;
      // Shield CD — uses the legacy `dodgeCooldownMul` field name so
      // nimble_step / dash_master / swift_boots all keep working.
      // dodgeDistMul (was dodge distance) now scales the SHIELD
      // duration — relics that "made you dodge further" instead make
      // the shield linger longer. Same ×1.35 / ×1.55 multipliers,
      // same player intuition: "this relic stretches my defensive
      // ability."
      hero.dodgeCooldown = DODGE_COOLDOWN * hero.dodgeCooldownMul;
      // Iframes for the shield duration + a short trailing window.
      // The directional check in damageHero blocks frontal hits via
      // the iframes path; back/side hits get the front-cone check
      // (see damageHero perfect-block branch).
      const shieldDur = SHIELD_DUR * (hero.dodgeDistMul || 1);
      hero.iframes = Math.max(hero.iframes || 0, shieldDur + 0.05);
      // NIMBLE STEP cleanses slow + poison on shield raise (same
      // behavior the old dodge had — relic gate is `dodgeCleanses`).
      if (hero.dodgeCleanses) {
        hero.slowTime = 0;
        hero.poisonTime = 0;
        // FUSION: Weaving Step — cleansing shield raise arms a flag
        // that grants 0.3s of i-frames on the player's next melee
        // hit. Consumed on first damage-landed swing.
        if (hero.fusionWeavingStep) hero.weavingStepReady = true;
      }
      // MEMORY OF THE HUNGRY BLADE: shield raise costs 1 HP (was
      // dodge cost). Same aggressive-play forcing function — the
      // memory pays for buffed lifesteal with HP-per-defensive-cast.
      // Never self-kills: skip the cost at 1 HP.
      if (hero.memoryHungryBlade && hero.hp > 1) {
        hero.hp -= 1;
      }
      setState('shield');
      hero._stillT = 0;   // iron_resolve parry window resets on shield raise
      // Audio — reuse the footstep_1 sample at lower rate as a "raise"
      // thunk. Sprint 2 will add a dedicated shield-raise synth preset.
      playSfx('footstep_1', { rate: 0.85, volume: 0.8 });
      // SYNERGY: Thunder Step — fires a single lightning pulse at the
      // raise point (no trail since the hero doesn't move). Reads as
      // "the shield discharges static when raised."
      if (hero.thunderStep) {
        const dmg = 20 * (hero.damageMul || 1);
        beginThunderTrail(dmg);
        addThunderTrailPoint(hero.x, hero.y);
        // End immediately — no path to trace, just a single discharge point.
        endThunderTrail();
      }
      // LEGENDARY: Wanderer's Cloak — 2s doubled attack speed post-shield
      wandererOnDodge();
      // SHADOW T2 ascendance — 0.8s flanking window after shield raise.
      if ((hero.activeThemes?.shadow || 0) >= 2) {
        const _now = (typeof performance !== 'undefined') ? performance.now() / 1000 : 0;
        hero.themeShadowFlankingUntil = _now + 0.8;
      }
      // STORM T2 ascendance — small shock pulse at the shield raise
      // point. Reads as "the static collapses outward when the shield
      // forms." Sprint 2 may relocate this to perfect-block to make
      // it feel earned rather than spammable.
      if ((hero.activeThemes?.storm || 0) >= 2) {
        const dmg = 14 * (hero.damageMul || 1);
        spawnExplosion(hero.x, hero.y - 6, 56, dmg, 'shock');
      }
    }
    // ── BLAST LMB — hold-to-autofire bolt (wizard-kit Sprint 2A) ──
    // Fires only when the BLAST slot is the active weapon. Hold-LMB
    // (mouse.down) auto-fires bolts as soon as blastBoltCD recovers —
    // matches Vampire Survivors / Risk of Rain mage primary feel. The
    // 0.28s cadence keeps it responsive without trivializing trades.
    //
    // SPAWN POSITION: bolt originates from a point 18px in front of
    // the hero in the aim direction (matches the wand's spawn pattern
    // at line ~1170). Spawning AT hero.x put the bolt inside the
    // sprite, which read as "the bolt drifts off-screen instead of
    // shooting from the hand" — the user's "aim feels off" complaint
    // was the missing forward offset, not actual aim math.
    //
    // This block sits ahead of the sword attack block in the if-else
    // chain so when blast is active, the sword swing branch is never
    // reached — keeps the rhythms cleanly separated per weapon.
    else if (
      room.kind !== 'hamlet' &&
      hero.activeWeapon === 'blast' &&
      mouse.down &&
      hero.blastBoltCD <= 0 &&
      hero.state !== 'hurt' &&
      hero.state !== 'dead'
    ) {
      // Wizard-kit Sprint 3B — blast slot resonance T1 (3 blast relics)
      // shrinks bolt cadence by 15% (slotBoltCDMul = 0.85).
      hero.blastBoltCD = hero.blastBoltMaxCD * (hero.slotBoltCDMul || 1);
      // ── AIM ASSIST — wizard-kit Sprint 2B ───────────────────────
      // Standard action-roguelite affordance: when the player fires a
      // bolt, snap the bolt's direction toward the closest enemy
      // within a 30° cone of the cursor direction (and within sane
      // range). Without this, a slightly-off cursor + a moving enemy
      // = whiff every shot, which read as "blast doesn't hit" in
      // playtest. The assist is mild enough that aiming AT an enemy
      // still works pinpoint; the snap only kicks in when the cursor
      // is within ~30° of a real target — close-enough is now hits.
      let ax = hero.aimX, ay = hero.aimY;
      const ASSIST_CONE = Math.PI / 6;       // 30°
      const ASSIST_RANGE = 380;              // px max — don't snap to enemies across the room
      let bestAssistE = null;
      let bestAssistScore = ASSIST_CONE;     // smaller angle = better
      const aimA = Math.atan2(ay, ax);
      for (const e of enemies) {
        if (!e || e.dead || e.hp <= 0) continue;
        const ex = e.x - hero.x, ey = e.y - hero.y;
        const dist = Math.hypot(ex, ey);
        if (dist > ASSIST_RANGE) continue;
        const eA = Math.atan2(ey, ex);
        let diff = eA - aimA;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const absDiff = Math.abs(diff);
        if (absDiff < bestAssistScore) {
          bestAssistScore = absDiff;
          bestAssistE = e;
        }
      }
      if (bestAssistE) {
        // Snap aim TOWARD the assist target — fully if the cursor is
        // close (within ~10°), partially if it's at the edge of the
        // cone. Hard-snap at edge would be too aggressive; lerp gives
        // a natural feel where pinpoint aim ALWAYS wins.
        const tx = bestAssistE.x - hero.x;
        const ty = bestAssistE.y - hero.y;
        const tm = Math.hypot(tx, ty) || 1;
        const ttx = tx / tm, tty = ty / tm;
        // Blend factor: 1.0 at perfect aim (0° diff), 0.4 at cone edge.
        const t = 1.0 - (bestAssistScore / ASSIST_CONE) * 0.6;
        ax = ax * (1 - t) + ttx * t;
        ay = ay * (1 - t) + tty * t;
        const m = Math.hypot(ax, ay) || 1;
        ax /= m;
        ay /= m;
      }
      // Spawn IN FRONT of hero — 18px forward + 8px up to read as "from
      // the outstretched hand" instead of from the chest cavity.
      const spawnX = hero.x + ax * 18;
      const spawnY = hero.y - 8 + ay * 12;
      // Cross-ability damage modifiers (Sprint 3C). Applied at spawn
      // time so the bolt carries the buff into projectiles.js's hit
      // resolution. Twin Fang and Adaptive Edge both scale base
      // damage; consumed by Twin Fang's window-tick (no charges).
      let _boltDmg = hero.blastBoltDamage * (hero.damageMul || 1);
      const _boltNow = (typeof performance !== 'undefined') ? performance.now() / 1000 : 0;
      if (hero.twinFangPact && _boltNow < hero.twinFangBuffUntil) {
        _boltDmg *= 1.5;
      }
      if (hero.adaptiveEdge) {
        // Blast active → reads sword-side count.
        const _otherCount = hero.adaptiveEdgeSwordSideCount | 0;
        if (_otherCount > 0) _boltDmg *= (1 + 0.05 * _otherCount);
      }
      // RESONANCE STONE (Sprint 3C bug-fix) — armed at swap when the
      // OTHER weapon (sword) landed a recent kill. Was previously
      // consumed only in the sword swing handler, which meant
      // sword-kill→swap-to-blast→shoot didn't actually crit. Now the
      // bolt damage is pre-multiplied by the crit multiplier and
      // p.forcedCrit is set so the damage number reads CRIT.
      let _boltForcedCrit = false;
      if (hero.resonanceCritReady) {
        _boltForcedCrit = true;
        const _critMul = hero.critMul + (hero.themeCritMulBonus || 0);
        _boltDmg *= _critMul;
        hero.resonanceCritReady = false;
        hero.resonanceKillWeapon = null;     // reset arming
      }
      // PHASE FLICKER (Sprint 3C) — armed by blink-after-perfect-block.
      // Consume on the next blast tap: spawn an empowered chain bolt
      // (chainCast pipeline) and refund the CD spent on this tap.
      const _phaseFlickerFire = hero.phaseFlickerNextBlast;
      if (_phaseFlickerFire) {
        hero.phaseFlickerNextBlast = false;
        hero.blastBoltCD = 0;        // refund — free shot
      }
      spawnHeroBolt(
        spawnX,
        spawnY,
        ax,
        ay,
        _boltDmg,
        hero.blastBoltSpeed,
        hero.blastBoltLife,
        {
          color: _phaseFlickerFire ? '#d8f0ff' : (_boltForcedCrit ? '#ffe5a0' : '#a0e8ff'),
          // Slot ascendance T2: bolts pierce 1 extra enemy.
          // Phase Flicker also adds chain to 2 nearby foes.
          pierce: hero.slotBoltPierceBonus || 0,
          radius: _phaseFlickerFire ? hero.blastBoltRadius + 2 : hero.blastBoltRadius,
          chainCast: _phaseFlickerFire,
          chainCount: _phaseFlickerFire ? 2 : 0,
          chainDamage: _phaseFlickerFire ? Math.round(_boltDmg * 0.7) : 0,
          chainRange: _phaseFlickerFire ? 150 : 0,
          // Resonance Stone-fueled bolts read as CRIT in the damage
          // number. Tinted gold instead of cyan to telegraph the
          // resonance moment mid-flight.
          forcedCrit: _boltForcedCrit,
        }
      );
      // Muzzle flash — small sparkle burst at the spawn point so the
      // player sees instant feedback on click (vs the bolt traveling
      // 100px before the eye registers it). Three sparkles in a tight
      // cluster forward of the hero.
      for (let _k = 0; _k < 3; _k++) {
        const _spread = (Math.random() - 0.5) * 0.4;
        const _bx = spawnX + (ax + Math.cos(_spread) * 0.2) * 6;
        const _by = spawnY + (ay + Math.sin(_spread) * 0.2) * 6;
        sparkle(_bx, _by, '#d8f0ff');
      }
      // Light "cast" feel — same primitives as wand tap-fire. Sprint
      // 2B will swap to a dedicated synth preset distinct from wand.
      try { synthPing(620, 0.65, 0.18); } catch (_e) {}
      shakeCamera(2, 0.05);
    }
    // RMB is now bound to weapon-swap (handled at the top of update,
    // alongside Digit1/Digit2/wheel). RMB is no longer per-weapon
    // secondary attack — playtest feedback flagged the chain cast +
    // sword RMB approach as "doesn't feel good." Single-button swap
    // (right-click any time) reads more fluid than committing to two
    // different secondary attacks per weapon. Sprint 2C if needed:
    // restore RMB-as-secondary if the weapon-swap version doesn't
    // earn the slot.
    //
    // SWORD RMB — empty for now. Lunge Thrust was removed in Sprint
    // 2A polish (functionally redundant with Dash Strike on Q —
    // both were "forward thrust through enemies"). Sprint 2B will
    // fill this slot with a properly distinct sword secondary.
    //
    // ── SWORD LMB — fresh tap, buffered tap, combo follow-up, charge release ──
    // Only fires when the SWORD slot is active (wizard-kit Sprint 2A
    // gate). When BLAST is active, the LMB tap goes through the blast
    // bolt branch above; this block is skipped entirely. Suppressed
    // in hamlet (non-combat hub).
    //
    // Accessibility — settings.chargeMode = 'short' lowers the hold-to-charge
    // threshold to 0.15s for players with limited grip strength. Default
    // 'hold' keeps the original 0.35s threshold so existing muscle memory
    // is preserved.
    else if (
      room.kind !== 'hamlet' &&
      hero.activeWeapon === 'sword' &&
      (mouse.pressed || hero._attackBuffer > 0 || (mouse.down && hero.chargeTime >= (settings.chargeMode === 'short' ? 0.15 : 0.35) && !hero.chargeReleased)) &&
      hero.attackCooldown <= 0
    ) {
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
        // Captured here so the post-spawn flag block (which previously
        // hardcoded _swingIsFinisher = false) can route the woven bolt
        // through the same finisher-treatment downstream consumers
        // already understand. Defaults to false for charged shots.
        let isWoven = false;
        hero.attackCooldown = w.cooldown * hero.attackCooldownMul * wandererMulR * stormAtkSpd * cooldownMul;
        setState('attack');
        hero.attackFacingX = hero.aimX;
        hero.attackFacingY = hero.aimY;
        // Lock the charge state so the player can't trigger a second
        // shot from the same hold + reset the accumulator on release.
        // first_wand_charge tip — distinct from first_charge (melee
        // is a wide AoE blow, wand is a piercing damage burst).
        if (isCharged) { hero.chargeReleased = true; showTip('first_wand_charge'); }
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
          // Patient Lens — distinct gold ping over the swoosh, telegraphs
          // "this bolt will crit" before it lands. Pairs with the stronger
          // gold flash below so the release feels different from a base
          // charged shot.
          if (hero.boltCritOnCharge) {
            try { synthPing(1980, 0.55, 0.22); } catch (_e) {}
          }
          shakeCamera(6, 0.18);
          pulseZoom(0.04, 0.22);
          // Brief gold flash so the release reads as a committed beat.
          // Patient Lens brightens the flash so the player learns: "this
          // is the version that auto-crits."
          triggerScreenFlash(hero.boltCritOnCharge ? 'rgba(255, 220, 140, 0.16)' : 'rgba(255, 220, 140, 0.07)', 0.18);
        } else {
          // Tap-fire: standard bolt, no pierce, snappier audio.
          // SPELL WEAVE — every 3rd tap-bolt fires as a heavier woven
          // shot. +60% damage, amber tint, slightly larger sprite, a
          // distinct mid-pitched ping. Mirrors the melee 3-hit-finisher
          // rhythm so wand carries the same muscle memory. Bypassed on
          // charged shots (those are already a committed beat).
          hero.boltIndex = (hero.boltIndex + 1) % 3;
          isWoven = hero.boltIndex === 0;     // 0 = the freshly-rolled-over slot, i.e. the 3rd bolt
          const wovenMul = isWoven ? 1.6 : 1.0;
          spawnHeroBolt(hero.x + dirX * 18, hero.y - 8 + dirY * 12,
                        dirX, dirY, baseDmg * wovenMul, w.boltSpeed, w.boltLife * lifeMul,
                        isWoven ? { woven: true } : undefined);
          if (isWoven) {
            // Layered audio for the woven beat — the click is the same
            // tap-fire snap, but a chord-ish ping sells the "heavier"
            // bolt at a different register. Camera shake is 1.4× the
            // normal tap so the player FEELS the rhythm beat without
            // jarring out of repeat-tap flow.
            try { synthClick(1.7, 0.6); } catch (_e) {}
            try { synthPing(820, 0.14, 0.28); } catch (_e) {}
            shakeCamera(3.5, 0.12);
          } else {
            try { synthClick(1.7, 0.6); } catch (_e) {}
            shakeCamera(2.5, 0.10);
          }
        }
        showTip('first_combat');
        // Reset charge state so the next cycle starts fresh
        hero.chargeTime = 0;
        // Stash flags — charged ranged sets the charged flag so any
        // downstream consumer (themes, hooks) sees a charged release.
        // Woven tap-bolts get the _swingIsFinisher tag so existing
        // combo-tracker / relic-on-finisher consumers fire on the
        // wand's 3-bolt rhythm, matching melee's 3rd-hit treatment.
        hero._swingIsFinisher = isWoven;
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
      // Mobile virtual joystick — supplements keyboard. Joystick wins
      // ONLY when it has a non-zero deflection. If the player is
      // touching the stick but holding it inside the dead zone, both
      // x and y are 0 and we fall back to whatever WASD said —
      // important for hybrid setups (Steam Deck etc.) where the
      // player might use both inputs and a deadzoned touch shouldn't
      // freeze movement. Bug-hunt P2.
      if (virtualMove.active && (virtualMove.x !== 0 || virtualMove.y !== 0)) {
        dx = virtualMove.x;
        dy = virtualMove.y;
      }
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
        // GALE STEP — Round-6 retune. While galeBurstTime > 0, hero
        // moves at +30% speed. Set on dodge end (DODGE_DUR boundary
        // above), ticked down further down in the per-frame block.
        const galeMul = hero.galeBurstTime > 0 ? 1.30 : 1;
        // Wizard-kit Sprint 1 — half-speed shield-walk. The hero
        // isn't rooted (rooting felt punishing in playtest reasoning)
        // but movement is committed: you trade speed for a directional
        // block. The shield arc still tracks live aim, so swiveling
        // to redirect protection is free; positional repositioning
        // costs the move-speed penalty.
        const shieldSlowMul = hero.state === 'shield' ? SHIELD_MOVE_MUL : 1;
        const spd = HERO_SPEED * hero.speedMul * slowMul * attackSlowMul * galeMul * shieldSlowMul;
        moveAxis('x', dx * spd * dt);
        moveAxis('y', dy * spd * dt);
        // Don't downgrade state to 'walk' if we're mid-attack — body
        // sprite + animation should keep the attack frames + locked dir.
        // Wizard-kit Sprint 1 — also preserve 'shield' and 'dash'
        // states. Shield-walk is movement-DURING-shield (state stays
        // 'shield' so the cone keeps drawing + iframes keep applying);
        // dash is teleport motion driven by its own block above.
        if (hero.state !== 'attack' && hero.state !== 'shield' && hero.state !== 'dash' && hero.state !== 'blink') setState('walk');
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
        // Wizard-kit Sprint 1 — only downgrade to idle if NOT in an
        // active ability state. Shield + dash motion blocks below
        // own the state-exit timing; if we forced idle here the
        // shield would lift the moment the player released WASD.
        if (hero.state !== 'shield' && hero.state !== 'dash' && hero.state !== 'blink') setState('idle');
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

  // ── DASH STRIKE motion — Q ability, offensive teleport ──────────
  // Wizard-kit Sprint 1 — split out from the old combined dodge/dash
  // block. Now uses its own state value 'dash' so the perfect-block
  // detection on 'shield' is unambiguous.
  if (hero.state === 'dash') {
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
  }

  // ── BLINK animation window — wizard-kit Sprint 2B ────────────────
  // Blink is a single-frame teleport (the position change happened
  // in the trigger block above). This block keeps the 'blink' state
  // alive long enough for the arrival visuals to render + iframes
  // to stick, then transitions back to idle. No movement, no damage
  // — it's purely an animation/state-window holder.
  if (hero.state === 'blink') {
    hero.blinkTime -= dt;
    if (hero.blinkTime <= 0) {
      setState('idle');
    }
  }

  // ── SHIELD motion — Space ability, stationary defensive cast ────
  // Wizard-kit Sprint 1 — replaces the old dodge motion block. Hero
  // is stationary (the regular movement block above runs at half
  // speed via SHIELD_MOVE_MUL when state==='shield'; this block
  // handles state-exit + relic ticks). Iframes are already set on
  // raise; the directional-cone check lives in damageHero.
  if (hero.state === 'shield') {
    // STRIDE OF ASH — instead of laying flames along a dodge path,
    // the shield raise drops one ember pool BENEATH the hero on
    // entry. We arm _strideAshT on raise (in the trigger block above)
    // — actually, simpler: drop a single pool here on the FIRST tick
    // of the shield state, then no more. Reads as "the shield
    // discharges heat outward when it forms."
    if (hero.strideOfAsh && hero.stateTime <= 0.02 && !hero._strideAshDropped) {
      spawnEmberFlame(hero.x, hero.y + 4, { friendly: true, damage: 2, life: 1.4, radius: 30 });
      hero._strideAshDropped = true;
    }
    // Exit at SHIELD_DUR scaled by dodgeDistMul (relic-stretched).
    const shieldDur = SHIELD_DUR * (hero.dodgeDistMul || 1);
    if (hero.stateTime >= shieldDur) {
      hero._strideAshDropped = false;
      // GALE STEP — post-shield 0.4s speed burst. Same intent as the
      // old post-dodge burst: chained casts read as flow, not as
      // discrete commits. galeBurstTime is consumed in the movement
      // block above.
      if (hero.galeStep) hero.galeBurstTime = 0.4;
      setState('idle');
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
      // Cracked wall — single hit per swing.
      // Round-6 AV audit: cracked-wall break used pitched-down `slime_hit`,
      // identical to a slime body hit. Players couldn't audibly tell
      // they'd just opened a secret room from "I hit a slime." Now uses
      // a synthThud sub-bass + synthClick for the "break" beat — more
      // architecturally distinct and unmistakably "stone gave way".
      // Mid-progress hits still get a shorter thud for tactile feedback.
      if (!hero._wallHitThisSwing && hitCrackedWall(hero.x, hero.y, hero.aimX, hero.aimY, reach)) {
        hero._wallHitThisSwing = true;
        const res = damageCrackedWall();
        hitSpark(roomSecrets.crackX * TILE + TILE/2, roomSecrets.crackY * TILE + TILE/2, -hero.aimX, -hero.aimY, '#ffe5a0');
        shakeCamera(res === 'broken' ? 12 : 5, 0.2);
        if (res === 'broken') {
          // Wall collapses — layered sub-bass thud + dust-fall chord
          // sells "stone gave way to something behind it". The player
          // hears this once per secret-room reveal so it earns the
          // dedicated audio moment.
          try { synthThud(70, 0.95, 0.5); } catch (_e) {}
          try { synthThud(45, 0.7, 0.7); } catch (_e) {}
          try { synthClick(0.45, 0.55); } catch (_e) {}
        } else {
          // Mid-progress hit — chunkier than a slime tap, lighter than
          // the break. synthThud at higher freq + click stack reads as
          // "this is masonry, not flesh".
          try { synthThud(120, 0.55, 0.18); } catch (_e) {}
          try { synthClick(0.7, 0.5); } catch (_e) {}
        }
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
          //   HONEST EDGE: finisher swings (sword-only)
          //   VOW ETERNAL: first sword hit each room (sword-only legendary)
          // Count active sources so the crit multiplier scales when MULTIPLE
          // forced-crit relics fire on the same swing — without this, a sword
          // player with both Iron Greaves and Vow Eternal would consume both
          // flags on their room-opener but only get a single crit's worth of
          // damage. +0.25× per extra source rewards stacking without making
          // a single crit relic feel weak.
          // Iron Greaves — first sword hit on each enemy crits. Per-enemy
          // `_heroFirstStrike` flag, set on consume below. Naturally
          // dies with the enemy; no per-room reset needed.
          const _fcMove = !!(hero.firstStrikeOnEnemy && !e._heroFirstStrike);
          const _fcKB = !!(hero.knockbackCrit && e._kbCritPending);
          const _fcHE = !!(hero.honestEdge && hero._swingIsFinisher);
          const _fcVE = !!(hero.vowEternal && hero.vowEternalReady && w.id === 'sword');
          // RESONANCE STONE (Sprint 3C) — armed at swap when the OTHER
          // weapon landed a recent kill. First sword hit consumes it.
          const _fcRS = !!hero.resonanceCritReady;
          const _forcedCount = (_fcMove ? 1 : 0) + (_fcKB ? 1 : 0) + (_fcHE ? 1 : 0) + (_fcVE ? 1 : 0) + (_fcRS ? 1 : 0);
          const forcedCrit = _forcedCount > 0;
          // Consume Resonance Stone on the FIRST hit of this swing
          // (not every enemy in a multi-hit arc — that'd be too strong).
          if (_fcRS && hero.hitThisSwing.size === 1) {
            hero.resonanceCritReady = false;
            hero.resonanceKillWeapon = null;     // reset arming
          }
          // Extra crit multiplier when ≥2 forced-crit sources fire together.
          const _forcedCritBonus = Math.max(0, _forcedCount - 1) * 0.25;
          if (hero.knockbackCrit && e._kbCritPending) e._kbCritPending = false;
          // Iron Greaves consume — mark this enemy as first-struck so
          // subsequent hits on the same enemy don't re-fire the crit.
          if (_fcMove) e._heroFirstStrike = true;
          if (hero.vowEternal && hero.vowEternalReady && w.id === 'sword') {
            hero.vowEternalReady = false;
            // Bell-tone on consume — the literal "vow rung" once per
            // room. High clear ping cuts through the swing audio.
            try { synthPing(1320, 0.55, 0.32); } catch (_e) {}
            // FUSION: Sworn Reply — opening crit also opens the
            // counter-attack window. Lets the player chain the
            // first-hit crit into a full counter-attack on the next
            // swing, which extends the opening into an opening burst.
            if (hero.fusionSwornReply) grantCounterAttack();
          }
          // DAGGER SIGNATURE — flat +10% crit chance when wielded. Twin Fang
          // is "the precision weapon" — its identity between finishers is
          // that crits happen more often than with sword or hammer.
          const _daggerCritBonus = (w.id === 'dagger') ? 0.10 : 0;
          // SHADOW set-bonus — flat crit chance add at 3/5 theme stacks
          const _shadowCritBonus = hero.themeCritBonus || 0;
          // FUSION: Kingslayer — speartip hits past 80% reach get +15%
          // crit chance on top of the +40% damage. Pairs with the
          // existing speartipBonus block below.
          const _kingslayerCritBonus = (hero.fusionKingslayer && hero.speartip && dist > reach * 0.8) ? 0.15 : 0;
          const _totalCritChance = hero.critChance + _daggerCritBonus + _shadowCritBonus + _kingslayerCritBonus;
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
          // Forced-crit overlap bonus — see _forcedCritBonus computation above.
          // Two forced-crit sources firing together → 2.25×; three → 2.5×.
          const _effectiveCritMul = hero.critMul + (hero.themeCritMulBonus || 0) + _forcedCritBonus;
          if (isCrit) finalDmg *= _effectiveCritMul;
          if (isExec) finalDmg *= hero.executeMul;
          // FUSION: Final Verdict — crit on a below-threshold enemy = instakill.
          // Pumps damage to multiples of the target's max HP so nothing survives.
          if (hero.fusionFinalVerdict && isCrit && isExec && !e.boss) {
            finalDmg = Math.max(finalDmg, (e.maxHp || 999) * 3);
          }
          if (isCounter) finalDmg *= (hero.counterstrike ? 2.0 : 1.5);
          // BLOODRITE — +15% damage while below 50% HP
          if (hero.bloodrite && hero.hp < hero.maxHp * 0.5) finalDmg *= 1.25;
          // MARROW PACT — +40% damage at or below 50% HP. Stacks with Bloodrite.
          if (hero.marrowPact && hero.hp <= hero.maxHp * 0.5) finalDmg *= (1 + hero.marrowPactBonus);
          // OATHSHIELD / WHISPER VEIL — both open a post-dodge window.
          const _hnow = (typeof performance !== 'undefined') ? performance.now() / 1000 : 0;
          if (hero.oathshield && _hnow < hero.oathshieldUntil) {
            finalDmg *= (1 + hero.oathshieldBonus);
            hero.oathshieldUntil = 0;    // consumed
          }
          // TWIN FANG PACT (Sprint 3C) — 0.4s post-swap damage burst.
          // Window-based, no charge consumption — every hit during the
          // window benefits, rewarding aggressive post-swap chains.
          if (hero.twinFangPact && _hnow < hero.twinFangBuffUntil) {
            finalDmg *= 1.5;
          }
          // ADAPTIVE EDGE (Sprint 3C) — +5% per off-slot relic owned.
          // Sword-active reads blast-side count; blast-active reads
          // sword-side count. Kept on hero in apply()/recompute path.
          if (hero.adaptiveEdge) {
            const _otherCount = hero.activeWeapon === 'sword'
              ? (hero.adaptiveEdgeBlastSideCount | 0)
              : (hero.adaptiveEdgeSwordSideCount | 0);
            if (_otherCount > 0) finalDmg *= (1 + 0.05 * _otherCount);
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
          // FUSION: Mortal Cadence — 5th hit always counts as a
          // crescendo execute, jumping damage to 4×. Bosses still
          // have their HP pool, but for everything else the rhythm
          // beat is the kill.
          let razorPaceCrescendo = false;
          if (hero.razorPace && w.id === 'dagger') {
            hero.razorPaceHits = (hero.razorPaceHits | 0) + 1;
            if (hero.razorPaceHits >= 5) {
              finalDmg *= hero.fusionMortalCadence ? 4.0 : 2.5;
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
          // Phase 1 audit fix #5 — knockback direction is IMPACT NORMAL
          // (vector from hero to enemy), not hero.aim. The previous aim-
          // based code pushed enemies in the direction the hero was
          // facing, regardless of WHERE on the swing arc they were. For
          // an enemy at the rim of the cone (offset up to ~85° from
          // aim on sword's wide swing), that meant the knockback
          // shoved them sideways instead of away — felt arbitrary and
          // broke the "I hit it, it flew" intuition. Now: enemy at the
          // edge of the arc gets pushed AWAY from the impact point.
          // Magnitude formula (kbScale) untouched.
          const _kbDx = e.x - hero.x;
          const _kbDy = e.y - hero.y;
          const _kbMag = Math.hypot(_kbDx, _kbDy) || 1;
          const _kbNx = _kbDx / _kbMag;
          const _kbNy = _kbDy / _kbMag;
          e.takeDamage(finalDmg, _kbNx * kbScale, _kbNy * kbScale);
          // SYSTEMS PASS — HEAVY BLOW: after a hit with big knockback, mark
          // the enemy so the NEXT hero hit on them forces a crit.
          if (hero.knockbackCrit && kbScale >= 2 && !e.dead) {
            e._kbCritPending = true;
          }
          // FUSION: Weaving Step — first hit after a cleansing dodge
          // grants 0.3s of i-frames. Consumed on first damage-landed
          // swing. Stacks with existing iframes (Math.max).
          if (hero.weavingStepReady) {
            hero.weavingStepReady = false;
            hero.iframes = Math.max(hero.iframes || 0, 0.3);
          }
          // SYSTEMS PASS — BLOODSTONE: kills of enemies under 25% HP heal +3.
          // Applies only when THIS hit is the killing blow on an already-
          // weakened target (no farming mid-HP kills).
          if (hero.finisherHeal && e.dead && eHpBefore <= e.maxHp * 0.25 && hero.hp < hero.maxHp) {
            hero.hp = Math.min(hero.maxHp, hero.hp + hero.finisherHeal);
          }
          // RESONANCE STONE (Sprint 3C) — sword kill arms a 3s crit
          // window for the player's next attack with the OTHER
          // weapon. Captures activeWeapon at kill time so a
          // mid-swing-into-swap chain doesn't lose the trigger.
          if (hero.resonanceStone && e.dead) {
            const _now = (typeof performance !== 'undefined') ? performance.now() / 1000 : 0;
            hero.resonanceKillWeapon = hero.activeWeapon;     // 'sword' here
            hero.resonanceKillUntil = _now + 3.0;
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
              markQuiverFired();   // visible pip-row flash
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
            const wasMax = (hero.ringingSteelStacks | 0) >= 5;
            hero.ringingSteelStacks = Math.min(5, (hero.ringingSteelStacks | 0) + 1);
            // Pip flash fires once when the chain first hits max stacks
            // — telegraphs the "fully wound up" moment without spamming
            // the row on every sustained-chain swing.
            if (!wasMax && hero.ringingSteelStacks >= 5) markRingingFired();
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
                // Echo ping — distant cyan note, audibly the "second
                // voice" of the dagger pair. Quieter than primary hit.
                try { synthPing(1760, 0.35, 0.10); } catch (_e) {}
              }
              markTwinFired();   // visible pip-row flash
            }
          }

          // MOUNTAIN STRIKE (hammer-only) — every 3rd hammer hit spawns
          // a shockwave at impact. Round-6 economy retune: base radius
          // bumped 70 → 110 (still smaller than the Avalanche-fusion
          // 160) so the shockwave actually extends beyond the hammer's
          // own 120-140px swing arc. Was previously a sub-arc cosmetic
          // pulse on most hits — now meaningfully reaches enemies the
          // swing missed. Damage stays at 50% so single-target builds
          // don't get over-buffed.
          if (hero.mountainStrike && w.id === 'hammer' && !e.dead) {
            hero.mountainStrikeCounter = (hero.mountainStrikeCounter | 0) + 1;
            if (hero.mountainStrikeCounter % 3 === 0) {
              const shockDmg = (w.damage * (hero.damageMul || 1)) * 0.5;
              // FUSION: Avalanche — radius doubles (110 → 160) and
              // hits inside the shockwave are marked for next-hit
              // crit (the heavy_blow knockback-crit hook).
              const shockR = hero.fusionAvalanche ? 160 : 110;
              spawnExplosion(e.x, e.y - 6, shockR, shockDmg, 'physical');
              // Deep earth thud — short bass pulse so the shockwave
              // reads in the chest, not just the eyes. Avalanche fires
              // the same thud at higher volume.
              try { synthThud(50, hero.fusionAvalanche ? 1.2 : 0.85, 0.28); } catch (_e) {}
              if (hero.fusionAvalanche) {
                // Mark every enemy inside the shockwave for crit on
                // next hit — turns the 3rd-swing tremor into a setup
                // for a room-wide burst on the FOLLOWING swing.
                const r2 = shockR * shockR;
                for (const other of enemies) {
                  if (other.dead || other.state === 'dead') continue;
                  const dx = other.x - e.x, dy = other.y - (e.y - 6);
                  if (dx * dx + dy * dy <= r2) other._kbCritPending = true;
                }
              }
              // Visual punch — extra dust burst for the ground-strike
              // read, plus a heavier hit-stop than the regular swing.
              const dustCount = hero.fusionAvalanche ? 14 : 8;
              for (let k = 0; k < dustCount; k++) {
                sparkle(e.x + (Math.random() - 0.5) * (shockR * 0.6), e.y + 4 + (Math.random() - 0.5) * 16, '#ffae6c');
              }
              triggerHitStop(hero.fusionAvalanche ? 0.10 : 0.06);
              markMountainFired();   // visible pip-row flash
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
            // Stone-grind tone — short low thud that says "the earth
            // pinned them." Lower than mountain_strike's shock.
            try { synthThud(75, 0.55, 0.18); } catch (_e) {}
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
            // Two-note crescendo — the 5th-hit beat rings as a fast
            // upward third (high cyan tone). Reads as "the song lands."
            try { synthPing(1480, 0.5, 0.12); } catch (_e) {}
            try { setTimeout(() => synthPing(1980, 0.45, 0.18), 70); } catch (_e) {}
            markRazorFired();   // visible pip-row flash
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
            // Glass-crack chord — high splinter tone over a low thud.
            // The thud lands on the same beat as the camera shake.
            try { synthThud(60, 0.85, 0.22); } catch (_e) {}
            try { synthChord(560, 0.6, 0.45); } catch (_e) {}
          }
          // Special-hit sparks keep their identity colors (counter gold,
          // exec red); generic hits now pull the enemy's bloodColor so a
          // wizard pop reads visibly purple, an orc strike visibly red,
          // a slime smack green. Falls back to enemy.color when no
          // bloodColor is defined. Game-feel audit P0.
          const sparkColor = isCounter ? '#ffeb99'
                           : isExec ? '#ff6a55'
                           : (e.def && (e.def.bloodColor || e.def.color)) || '#ffddaa';
          hitSpark(e.x, e.y - 18, hero.aimX * -1, hero.aimY * -1, sparkColor);
          const wpnShake = w.shakeMul || 1;
          const wpnHs = w.hitStopMul || 1;
          // Per-enemy weight multiplier — a slime tap shouldn't shake
          // the camera as hard as a vanguard slam. Read from def.weight
          // (defaults 1.0). Game-feel audit P0.
          const enemyWeight = (e.def && e.def.weight) || 1.0;
          shakeCamera((isCounter ? 10 : isCrit ? 7 : 4.5) * wpnShake * enemyWeight,
                      (isCounter ? 0.2 : 0.14) * Math.max(0.85, wpnShake));
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
          // Wizard-kit Sprint 3B — slot resonance T1 adds +0.05s hit-stop
          // to all sword hits (additive on top of the base hit-stop).
          // Only applies on the SWORD slot (this code path is the sword
          // swing handler — blast bolts have their own hit-stop in
          // projectiles.js).
          const slotHitStopBonus = (hero.slotSwordHitStopBonus || 0);
          triggerHitStop(((isCounter ? 0.12 : isCrit ? 0.08 : 0.045) + slotHitStopBonus) * wpnHs);
          // Camera zoom-in pulse on big hits — counter/exec/finisher/charged all pop.
          // Game-feel audit P0: previous values clustered within 0.01 of
          // each other (0.06/0.05/0.05/0.04/0.03) — players couldn't read
          // which special hit type fired from camera punch alone. New
          // ladder spreads them so counter feels ~3× crit, exec feels
          // distinctly weighty, charged sits between counter + exec.
          if (isCounter) pulseZoom(0.09, 0.40);
          else if (isExec) pulseZoom(0.07, 0.30);
          else if (chargedHit) pulseZoom(0.06, 0.32);
          else if (finisherHit) pulseZoom(0.04, 0.22);
          else if (isCrit) pulseZoom(0.025, 0.15);
          // COUNTERSTRIKE — counter-hits detonate with a small AoE when relic owned
          if (isCounter && hero.counterstrike) {
            spawnExplosion(e.x, e.y - 8, 64, finalDmg * 0.7);
          }
          // HAMMER FINISHER — ground slam AoE around impact point
          if (finisherHit && w.id === 'hammer') {
            spawnExplosion(e.x, e.y - 6, 96, finalDmg * 0.45);
            shakeCamera(12, 0.28);
          }
          // Wizard-kit Sprint 3B — slot ascendance T2 (5 sword relics)
          // empowers every finisher swing: spark burst around impact +
          // bonus knockback. Smaller than hammer's full AoE so it doesn't
          // overshadow weapon-specific finisher VFX, but visible enough
          // that the player reads "this is the sword build paying off."
          if (finisherHit && hero.slotSwordEmpowered) {
            for (let _k = 0; _k < 8; _k++) {
              const _ang = (_k / 8) * Math.PI * 2;
              const _r = 28 + Math.random() * 8;
              hitSpark(
                e.x + Math.cos(_ang) * _r,
                e.y - 16 + Math.sin(_ang) * _r * 0.7,
                Math.cos(_ang),
                Math.sin(_ang),
                '#ffe5a0'
              );
            }
            shakeCamera(6, 0.14);
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
// Phase 4 work — optional `sourceType` (e.g. 'slime', 'orc', 'bomber',
// 'wizard', 'broodmother', 'spike', 'fire_pool') is recorded on
// hero._lastHurtBy so the death-cause tracker + run-end narrative can
// describe what actually killed you. Callers that don't supply it just
// leave the prior value (which is fine for environmental stragglers
// after a real kill source already landed).
export function damageHero(amount, fromX, fromY, sourceType = null) {
  if (sourceType) hero._lastHurtBy = sourceType;
  if (hero.state === 'dead') return 'absorbed';

  // ── ECHO STEP (Sprint 3C) ─────────────────────────────────────
  // Post-blink window: the first hit during the 2s window is treated
  // as a free perfect-block (no cone gate, no shield needed). Single-
  // use; consumed on first eligible hit. Fires BEFORE the shield
  // perfect-block branch so an Echo Step trigger doesn't double up
  // with a shield perfect during the same frame (the player has
  // already "earned" the absorb via blink — no additional counter
  // grant beyond what perfect-block normally gives).
  const _esNow = (typeof performance !== 'undefined') ? performance.now() / 1000 : 0;
  if (hero.echoStep && hero.echoStepUntil > _esNow) {
    hero.echoStepUntil = 0;        // consumed
    // Same downstream as a normal perfect-block: counter window,
    // slow-mo, chrom-aberr, etc. Reuses triggerPerfectDodge for the
    // counter mechanism (legacy name; rebound to perfect-block
    // semantically since Sprint 1).
    triggerPerfectDodge(1);
    stats.perfectDodges++;
    try { synthPing(1980, 0.6, 0.22); } catch (_e) {}
    if (hero.perfectDodgeRefund) hero.dodgeCooldown = 0;
    if (hero.temporalEye) { triggerHitStop(hero.temporalSlowDuration || 0.35); }
    if (window.__triggerChromAberr) window.__triggerChromAberr(0.35, 0.18);
    if (hero.whisperVeil) {
      hero.whisperVeilUntil = _esNow + hero.whisperVeilWindow;
      hero.whisperVeilNextCrit = true;
    }
    return 'perfect';
  }

  // ── PERFECT BLOCK — wizard-kit Sprint 1 ─────────────────────────
  // Renamed from "perfect dodge" with the same downstream hooks:
  // counter-attack window, slow-mo, chrom-aberr, whisper veil,
  // oathshield, dash-master CD refund. Triggers when:
  //   1. hero.state === 'shield' (the Space-tap defensive cast)
  //   2. shield is in its first SHIELD_PERFECT_WINDOW (0.10s) of life
  //   3. the damage source is in the front 180° (the cone the
  //      shield faces, locked to aim direction).
  // Hits AFTER the perfect window but during shield, in the front
  // cone, fall through to the iframes check below (absorbed but no
  // counter granted). Hits from behind/side bypass the shield
  // entirely — they take damage normally. This is the directional
  // depth the design relies on: facing matters, panic-mashing Space
  // doesn't grant omnidirectional immunity.
  //
  // Dash strike (state==='dash') gets its own iframes via the
  // existing iframes check below — it does NOT trigger perfect-block
  // (the player isn't shielding, just teleporting through).
  if (hero.state === 'shield') {
    // Front-cone check first — applies to BOTH perfect window and
    // post-perfect block. If outside the front 180° the shield does
    // nothing for this hit.
    const dxF = fromX - hero.x, dyF = fromY - hero.y;
    const srcA = Math.atan2(dyF, dxF);
    const aimA = Math.atan2(hero.aimY, hero.aimX);
    let diffA = srcA - aimA;
    while (diffA > Math.PI) diffA -= Math.PI * 2;
    while (diffA < -Math.PI) diffA += Math.PI * 2;
    // Wizard-kit Sprint 3B — slot ascendance T2 (5 shield relics)
    // widens the front cone by +20° (Math.PI/9). Default is ±90°
    // (180° total); ascendance pushes to ±110° (220° total).
    const coneHalf = Math.PI / 2 + (hero.slotShieldConeBonus || 0);
    const inFrontCone = Math.abs(diffA) <= coneHalf;
    if (inFrontCone) {
      // Wizard-kit Sprint 3B — slot resonance T1 (3 shield relics)
      // extends the perfect-block window by +0.05s (0.10s → 0.15s).
      const perfectWin = SHIELD_PERFECT_WINDOW + (hero.slotShieldPerfectBonus || 0);
      // Inside the perfect window → grant counter + all the relic hooks.
      // After the perfect window → fall through to iframes (absorbed
      // silently, no counter, no whisper-veil etc.). The iframes set
      // on shield raise are what carries non-perfect blocks.
      if (hero.stateTime <= perfectWin) {
        // FLICKER STEP (dagger-only) — doubles the counter window.
        // Counter-attack stays viable for 4.0s instead of 2.0s.
        const counterWindowMul = (hero.flickerStep && hero.weapon === 'dagger') ? 2 : 1;
        triggerPerfectDodge(counterWindowMul);
        stats.perfectDodges++;
        // Audio cue — high-pitched ping. Same primitive perfect-dodge
        // used; sells the "you nailed it" moment over combat audio.
        try { synthPing(1980, 0.6, 0.22); } catch (_e) {}
        // DASH MASTER — perfect block refunds the shield CD so expert
        // play can chain perfect blocks indefinitely (the relic
        // gate is `perfectDodgeRefund`, kept name for save compat).
        if (hero.perfectDodgeRefund) hero.dodgeCooldown = 0;
        // TEMPORAL EYE — brief slow-motion on perfect block.
        if (hero.temporalEye) { triggerHitStop(hero.temporalSlowDuration || 0.35); }
        // Chromatic aberration accent — subtle 0.18 strength.
        if (window.__triggerChromAberr) window.__triggerChromAberr(0.35, 0.18);
        // WHISPER VEIL — post-block window where next hit is a crit.
        if (hero.whisperVeil) {
          hero.whisperVeilUntil = (typeof performance !== 'undefined') ? performance.now() / 1000 + hero.whisperVeilWindow : 0;
          hero.whisperVeilNextCrit = true;
        }
        // OATHSHIELD — next hit within 1s deals +50% damage.
        if (hero.oathshield) {
          hero.oathshieldUntil = (typeof performance !== 'undefined') ? performance.now() / 1000 + 1.0 : 0;
        }
        // PHASE FLICKER (Sprint 3C) — arm a 1.0s window where a Q
        // blink (blast slot) will set the next blast LMB up as a free
        // chain bolt. The window itself doesn't do anything; it
        // gates the blink trigger below.
        if (hero.phaseFlicker) {
          hero.phaseFlickerArmedUntil = (typeof performance !== 'undefined') ? performance.now() / 1000 + 1.0 : 0;
        }
        return 'perfect';
      }
      // Past perfect window but still in shield + front cone →
      // damage is absorbed via iframes (set on shield raise).
      // Returns 'absorbed' so affix effects (frost slow, venom DOT)
      // also skip — same as old dodge iframes did.
      return 'absorbed';
    }
    // Outside the front cone — shield does nothing. Fall through to
    // normal damage processing (bulwark / iron resolve / iframes
    // / actual HP loss).
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
    // HEART OF THE WOUND (mythic) — once-per-run pseudo-revive that
    // leaves the hero at 1 HP instead of the 30% Phoenix Cloak grant.
    // Pushes attackers back via the same explosion the cloak uses (no
    // damage component on the push) and burns 1.6s of iframes for
    // recovery. Fires BEFORE phoenix_cloak.revives so the cheaper
    // 1-HP save is used first; if both are equipped the player gets
    // two saves total (heart at 1 HP, then a cloak revive at 30%).
    if (hero.heartOfWoundAvailable) {
      hero.heartOfWoundAvailable = false;
      hero.hp = 1;
      hero.iframes = 1.6;
      setState('hurt');
      shakeCamera(20, 0.45);
      // Explosion-style push (uses 0 damage so the survival doesn't
      // contribute to "I killed myself by clutch-saving into my own
      // proc"). Same 200px radius as the agent spec.
      spawnExplosion(hero.x, hero.y, 200, 0);
      // Audio + screen — heavy, distinct from a normal hurt. Mid-bass
      // thud + a high "spared" chord sells the moment.
      try { synthThud(45, 1.0, 0.6); } catch (_e) {}
      try { synthChord(330, 0.8, 1.0); } catch (_e) {}
      try { triggerScreenFlash('rgba(255, 80, 110, 0.20)', 0.5); } catch (_e) {}
      return 'hit';
    }
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
    case 'walk':   return { img: images.knight_walk,   fps: 12, loop: true };
    // Wizard-kit: 'shield' uses idle pose (hero is mostly rooted —
    // shield-walk is half-speed, idle anim still reads as right).
    // 'dash' uses the walk sheet (afterimage trail does most of
    // the visual; the live sprite is hidden during dash anyway).
    case 'shield': return { img: images.knight_idle,   fps: 6,  loop: true };
    case 'dash':   return { img: images.knight_walk,   fps: 12, loop: true };
    // Wizard-kit Sprint 2B — blink renders the idle pose: the hero
    // is visible at the ARRIVAL position (post-teleport) for the
    // brief blink-window. Sparkle rings drawn separately convey
    // the teleport effect.
    case 'blink':  return { img: images.knight_idle,   fps: 6,  loop: true };
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
// during attack and shield (shield faces aim — the cone the block covers).
// Uses dashStrikeDirX/Y during dash. Uses velocity during walk. Falls back
// to hero.lastDirection for idle/hurt/dead or ambiguous input.
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
  } else if (st === 'shield') {
    // Wizard-kit: shield faces live aim direction. Player can swivel
    // mid-shield to redirect the front-cone block toward incoming
    // threats — that's the core of the directional defense design.
    dir = vecToDirection(h.aimX, h.aimY);
  } else if (st === 'dash') {
    // Dash strike body locks to the dash direction (dashStrikeDirX/Y,
    // derived from aim at trigger). Body commits to the maneuver — no
    // mid-dash pirouette to chase the mouse.
    dir = vecToDirection(h.dashStrikeDirX, h.dashStrikeDirY);
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

  // ── CROSS-ABILITY RELIC AURAS (Sprint 3C polish) ────────────────
  // Visual telegraphs for armed / windowed states so the player
  // FEELS the relic procs.
  const _auraNow = (typeof performance !== 'undefined') ? performance.now() / 1000 : 0;

  // Twin Fang Pact — 0.4s post-swap warm-amber pulse aura. Reads as
  // "your weapons are in resonance right now" — distinct from the
  // base warm halo because the pulse is amplitude-modulated.
  if (hero.twinFangPact && _auraNow < hero.twinFangBuffUntil) {
    const t = 1 - (hero.twinFangBuffUntil - _auraNow) / 0.4;
    const pulse = Math.sin(t * Math.PI);          // peaks mid-window, fades end
    const r = 60 + pulse * 14;
    const g = ctx.createRadialGradient(hx, hy, 6, hx, hy, r);
    g.addColorStop(0, `rgba(255, 220, 140, ${(0.45 * pulse).toFixed(3)})`);
    g.addColorStop(0.6, `rgba(255, 180, 100, ${(0.20 * pulse).toFixed(3)})`);
    g.addColorStop(1, 'rgba(255, 150, 60, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(hx - r, hy - r, r * 2, r * 2);
  }

  // Echo Step — 2s post-blink cyan ring trailing the hero, indicates
  // the next-hit-is-perfect-block grace window.
  if (hero.echoStep && hero.echoStepUntil > _auraNow) {
    const remain = hero.echoStepUntil - _auraNow;
    const fade = Math.min(1, remain / 0.6);        // fade in last 0.6s
    const baseR = 38;
    const ringR = baseR + Math.sin(_auraNow * 4.5) * 3;
    ctx.save();
    ctx.strokeStyle = `rgba(160, 220, 255, ${(0.55 * fade).toFixed(3)})`;
    ctx.lineWidth = 1.4;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.arc(hx, hy, ringR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  // Phase Flicker — 1.0s post-perfect-block window: faint cyan halo
  // that reads "blink to consume." Only shows while the player has
  // blast equipped (the only weapon that can blink).
  if (hero.phaseFlicker && hero.phaseFlickerArmedUntil > _auraNow && hero.activeWeapon === 'blast') {
    const remain = hero.phaseFlickerArmedUntil - _auraNow;
    const fade = Math.min(1, remain / 0.4);
    const r = 52 + Math.sin(_auraNow * 5) * 4;
    const g = ctx.createRadialGradient(hx, hy, 8, hx, hy, r);
    g.addColorStop(0, `rgba(170, 230, 255, ${(0.30 * fade).toFixed(3)})`);
    g.addColorStop(1, 'rgba(150, 200, 240, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(hx - r, hy - r, r * 2, r * 2);
  }

  // Phase Flicker — armed-next-blast indicator: pulsing cyan dot
  // above the hero that reads "your next blast is empowered."
  if (hero.phaseFlickerNextBlast) {
    const pp = 0.6 + 0.4 * Math.sin(_auraNow * 5.5);
    ctx.save();
    ctx.fillStyle = `rgba(220, 240, 255, ${(0.85 * pp).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(hx, hy - 50, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `rgba(140, 200, 255, ${(0.6 * pp).toFixed(3)})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(hx, hy - 50, 7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // ── SHIELD ARC CONE — wizard-kit Sprint 1 ──────────────────────
  // Draws a translucent blue 180° arc in front of the hero while the
  // shield is up. The cone faces aimX/aimY (live aim, not locked at
  // raise) so the player can swivel to redirect protection. Brighter
  // during the perfect-block window (first 0.10s) to telegraph the
  // skill-test moment; fades to a calmer band after. Sprint 2 will
  // add particles, ripple-on-impact, and a meter for sustained-block
  // (hold-Space).
  if (hero.state === 'shield') {
    const aim = Math.atan2(hero.aimY || 0, hero.aimX || 1);
    // Wizard-kit Sprint 3B — slot bonuses widen the perfect window AND
    // the front cone visually so the player sees the ascendance pay off.
    const perfectWin = SHIELD_PERFECT_WINDOW + (hero.slotShieldPerfectBonus || 0);
    const inPerfect = hero.stateTime <= perfectWin;
    const lifeT = Math.min(1, hero.stateTime / SHIELD_DUR);
    const fade = 1 - lifeT * 0.6;                  // shrinks from 1.0 → 0.4 over duration
    const innerR = 18;
    const outerR = 30;
    const arc = Math.PI + (hero.slotShieldConeBonus || 0) * 2; // +20° at T2 (each side)
    ctx.save();
    // Outer band — softer translucent blue, shows the cone reach
    ctx.fillStyle = inPerfect
      ? `rgba(180, 230, 255, ${(0.32 * fade).toFixed(3)})`
      : `rgba(140, 200, 240, ${(0.20 * fade).toFixed(3)})`;
    ctx.beginPath();
    ctx.moveTo(hx, hy + 4);
    ctx.arc(hx, hy + 4, outerR, aim - arc / 2, aim + arc / 2);
    ctx.closePath();
    ctx.fill();
    // Inner band — denser cyan core, makes the cone feel "solid"
    ctx.fillStyle = inPerfect
      ? `rgba(220, 240, 255, ${(0.45 * fade).toFixed(3)})`
      : `rgba(180, 220, 250, ${(0.30 * fade).toFixed(3)})`;
    ctx.beginPath();
    ctx.moveTo(hx, hy + 4);
    ctx.arc(hx, hy + 4, innerR, aim - arc / 2, aim + arc / 2);
    ctx.closePath();
    ctx.fill();
    // Edge stroke — bright cyan rim. Stronger during perfect window
    // so the player can see the skill-test indicator without UI text.
    ctx.strokeStyle = inPerfect
      ? `rgba(255, 255, 255, ${(0.85 * fade).toFixed(3)})`
      : `rgba(180, 220, 250, ${(0.55 * fade).toFixed(3)})`;
    ctx.lineWidth = inPerfect ? 2.2 : 1.4;
    ctx.beginPath();
    ctx.arc(hx, hy + 4, outerR, aim - arc / 2, aim + arc / 2);
    ctx.stroke();
    ctx.restore();
  }

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
  // Wizard-kit: 'dash' state is the only one that hides the live sprite
  // (afterimage trail does the visual work). 'shield' state KEEPS the
  // sprite at full alpha — the player needs to see the hero clearly to
  // aim the front-cone block. Sprint 2 adds the shield arc cone visual
  // in front; until then the hero just stands at full alpha.
  if (hero.state === 'dash') {
    dodgeAlpha = 0.35;
  }
  // Rim light pass — draw sprite offset in 4 directions with a warm tint to create
  // an outline. Makes hero pop off the floor, AAA-style silhouette polish.
  // Skip during i-frame flicker, dash teleport, or death.
  if (!flicker && hero.state !== 'dead' && hero.state !== 'dash') {
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
