// Relic system — passive modifiers applied for the rest of the run.
// Registry is pure data; effects live as functions that mutate the hero
// object when applied. Everything stacks additively so picks always matter.
import { hero } from './hero.js';
import { stats } from './stats';
import { recomputeThemeTiers, THEMES, RELIC_THEMES } from './themes.js';
import { recomputeSlotTiers } from './slots.js';
import { pushNotification } from './notifications.js';
import { synthChord, synthPing } from './synth.js';

/**
 * Phase 5 audit fix #6 — RelicDef shape, documented as a typedef.
 * RELIC_DEFS holds 67 entries; each is structurally identical and
 * applied via def.apply(hero) at pickup. The simulator (scripts/
 * relic_sim.py) and pedestal renderer + fusion graph all consume
 * this shape.
 *
 * `affects` is the ability-slot mask (Sprint 3B) — used by:
 *   - HUD slot-resonance chips (sword/blast/shield counts)
 *   - Pedestal teaser-particle visualization
 *   - Adaptive Edge's off-slot scaling
 *   - The simulator's slot-stacker heuristic
 *
 * `weaponOnly` gates a relic to a specific weapon class. Set when the
 * relic's effect only makes sense with that weapon (e.g. Razor Pace's
 * "every 5th dagger hit" doesn't translate to sword/wand). The
 * rollRelicOffer pool filters these out for non-matching weapons.
 *
 * @typedef {Object} RelicDef
 * @property {string} id                  - stable key matching the registry slot
 * @property {string} name                - display name on pedestal + HUD
 * @property {string} desc                - one-line mechanic description
 * @property {string} flavor              - italic lore line shown on hover
 * @property {('common'|'rare'|'legendary'|'mythic')} tier - rarity tier
 * @property {string[]} affects           - slot mask: ['sword'|'blast'|'shield'|'any'] (Sprint 3B)
 * @property {?string} weaponOnly         - 'sword'|'dagger'|'hammer'|'wand' to gate by weapon class
 * @property {string} icon                - loader.js sprite key
 * @property {string} tint                - hex color for HUD strip + pickup banner
 * @property {(hero: Hero) => void} apply - mutate hero at pickup time
 */

export const RELIC_DEFS = {
  serrated_edge: {
    id: 'serrated_edge',
    affects: ['sword', 'blast'],
    name: 'Serrated Edge',
    desc: '+30% attack damage',
    flavor: 'Sharpened on bone. It remembers the screams.',
    icon: 'relic_serrated_edge',
    tint: '#ff7a55',
    apply: () => { hero.damageMul *= 1.30; },
  },
  swift_arm: {
    id: 'swift_arm',
    affects: ['sword', 'blast'],
    name: 'Swift Arm',
    desc: 'Attacks -25% cooldown',
    flavor: 'The weight of a hundred duels, forgotten by the shoulder.',
    icon: 'relic_swift_arm',
    tint: '#ffcc55',
    apply: () => { hero.attackCooldownMul *= 0.75; },
  },
  long_reach: {
    // SYSTEMS PASS — was pure +25% range (dead stat stick, −16 DPS corr).
    // Now a real "poke" playstyle: hits landed at the outer 20% of your
    // reach deal bonus damage. Rewards spacing and timing.
    id: 'long_reach',
    affects: ['sword', 'blast'],
    name: 'Long Reach',
    desc: '+25% range · hits past 80% reach deal +40% damage',
    flavor: 'A duelist\u2019s last breath, coiled in iron.',
    icon: 'relic_long_reach',
    tint: '#b49aff',
    // RANGED branch: when the hero is wielding the wand, +25% reach
    // doesn't translate to arc geometry (no swing), so we redirect the
    // benefit to a +30% bolt range via boltLifeMul. Speartip flag (the
    // outer-20% bonus damage) only fires for melee since it keys off
    // swing-arc geometry — the wand's bolts have no arc to outer-edge.
    apply: () => {
      hero.reachMul *= 1.25;
      if (hero.weapon === 'wand') {
        hero.boltLifeMul *= 1.30;
      } else {
        hero.speartip = true;
      }
    },
  },
  nimble_step: {
    // SYSTEMS PASS — was pure CD -50% (dead stat stick, −12 DPS corr).
    // Now solves a specific gameplay problem: frost/venom elite affixes
    // slow and poison you. Dodging now clears those debuffs, so Nimble
    // Step becomes a COUNTER-PLAY tool to specific threats.
    id: 'nimble_step',
    affects: ['shield'],
    name: 'Nimble Step',
    desc: 'Shield cooldown -50% · raising the shield cleanses poison/slow',
    flavor: 'Worn thin by the feet of a thief who never died in a cell.',
    icon: 'relic_nimble_step',
    tint: '#7edfff',
    apply: () => { hero.dodgeCooldownMul *= 0.50; hero.dodgeCleanses = true; },
  },
  iron_greaves: {
    // BALANCE PASS (3000-run sim, 2026-04-30) — Iron Greaves was the only
    // relic <30% pick rate across ALL five player heuristics (random,
    // greedy, synergy-fusion, theme, slot). Root cause: the previous
    // "first hit after 2s of continuous motion" trigger was invisible
    // to the player — no UI counter, no telegraph, just an internal
    // _moveTime accumulator. The crit fired but felt random.
    //
    // NEW TRIGGER — per-enemy first-strike. The first hit you land on
    // any enemy crits. Mental model: "the boots open the engagement."
    // Visible in every fight (yellow CRIT damage number on each
    // enemy's first hit) without needing a UI counter.
    //
    // Pairs naturally with the kiting/skirmish identity the +20% speed
    // is already pushing — engage a new target, free crit, disengage,
    // repeat. Multi-enemy rooms get N free crits at the open beat,
    // rewarding "fight the whole room" play over "tunnel one target."
    id: 'iron_greaves',
    affects: ['sword', 'blast'],
    name: 'Iron Greaves',
    desc: '+20% speed · first strike on each enemy crits',
    flavor: 'They never rusted. Perhaps they never touched the earth.',
    icon: 'relic_iron_greaves',
    tint: '#9bd8ff',
    apply: () => { hero.speedMul *= 1.20; hero.firstStrikeOnEnemy = true; },
  },
  ironhide: {
    // BALANCE PASS — was pure +2 maxHp stat stick with −14 DPS corr.
    // Now: +3 maxHp AND 10% damage reduction. Still defensive, but the
    // dmg-reduction multiplier compounds with Iron Resolve / Stalwart
    // fusion for actual tanky-build identity.
    id: 'ironhide',
    affects: ['any'],
    name: 'Ironhide',
    desc: '+3 max HP · −10% damage taken',
    flavor: 'Skin hardened by a prayer made too late.',
    icon: 'relic_ironhide',
    tint: '#ff9ab4',
    apply: () => {
      hero.maxHp += 3;
      hero.hp = hero.maxHp;
      hero.damageTakenMul *= 0.90;
    },
  },
  bloodstone: {
    // SYSTEMS PASS — kept the base 10% lifesteal (that's fine as a baseline),
    // added a punchy conditional: kills under 25% HP heal +3 HP. Stacks with
    // Executioner for a real finisher/sustain archetype.
    id: 'bloodstone',
    affects: ['sword'],
    name: 'Bloodstone',
    desc: '10% lifesteal · finishing kills (target under 25% HP) heal +3 HP',
    flavor: 'What you take from them, you keep.',
    icon: 'relic_bloodstone',
    tint: '#d95a82',
    apply: () => { hero.lifesteal += 0.10; hero.finisherHeal = 3; },
  },
  phoenix_tear: {
    // BALANCE PASS — "revive at 1 HP" meant the revive often did nothing
    // (you'd just die on the next tick of a boss cleave). damageHero in
    // hero.js already uses ceil(maxHp * 0.3) for the revive, so this
    // relic was already 30% — the desc was stale. Updated text to match
    // what the code actually does, which is the minimum needed to SURVIVE
    // the revive beat.
    id: 'phoenix_tear',
    affects: ['any'],
    name: 'Phoenix Tear',
    desc: 'Revive once at 30% HP · brief invulnerability',
    flavor: 'The last thing she gave the world before the fire took her.',
    icon: 'relic_phoenix_tear',
    tint: '#ffc860',
    apply: () => { hero.revives += 1; },
  },
  // ---------- Expanded pool (floor 1.5+ onward) ----------
  iron_resolve: {
    id: 'iron_resolve',
    affects: ['shield'],
    name: 'Iron Resolve',
    desc: '-20% damage taken · facing hits while held still PARRY for -85%',
    flavor: 'The knight still stood, long after the war had ended.',
    icon: 'relic_iron_resolve',
    tint: '#a0c8ff',
    apply: () => { hero.damageTakenMul *= 0.80; hero.ironResolveParry = true; },
  },
  keen_edge: {
    id: 'keen_edge',
    affects: ['sword', 'blast'],
    name: 'Keen Edge',
    desc: '15% crit chance, 2x damage',
    flavor: 'Hone it once. It will remember.',
    icon: 'relic_keen_edge',
    tint: '#ffe27a',
    apply: () => { hero.critChance += 0.15; },
  },
  vitality: {
    // BALANCE PASS — was 1HP/8s, which over a median 10-minute run
    // totals ~75 HP regen (nice) but the moment-to-moment feel is
    // imperceptible. Doubled rate to 1HP/4s so it actually closes
    // wounds in the pause between rooms.
    id: 'vitality',
    affects: ['any'],
    name: 'Vitality',
    desc: 'Regen 1 HP every 4 seconds',
    flavor: 'A moss that closes wounds in exchange for sleep.',
    icon: 'relic_vitality',
    tint: '#8ad4a2',
    apply: () => { hero.regenRate += 0.25; hero.regenCD = 1 / hero.regenRate; },
  },
  heavy_blow: {
    // SYSTEMS PASS — knockback without payoff didn't convert to DPS. Now
    // the first hit on a KNOCKED-BACK enemy is a guaranteed crit. Rewards
    // you for the hit→chase→hit rhythm the big knockback already creates.
    id: 'heavy_blow',
    affects: ['sword'],
    name: 'Heavy Blow',
    desc: 'Knockback ×2.5 · the next hit on a knocked-back enemy crits',
    flavor: 'Meant for doors. It works on ribs, too.',
    icon: 'relic_heavy_blow',
    tint: '#c86a4a',
    apply: () => { hero.knockbackMul *= 2.5; hero.knockbackCrit = true; },
  },
  dash_master: {
    // SYSTEMS PASS — extended +35% dodge distance. Perfect-dodges now
    // fully refund the dodge cooldown so chaining perfect-dodges is its
    // own build identity (pairs brilliantly with counterstrike).
    id: 'dash_master',
    affects: ['shield'],
    name: 'Dash Master',
    desc: 'Shield duration +35% · perfect blocks refund the shield cooldown',
    flavor: 'A step that ends before it begins.',
    icon: 'relic_dash_master',
    tint: '#a0e0ff',
    apply: () => { hero.dodgeDistMul *= 1.35; hero.perfectDodgeRefund = true; },
  },
  executioner: {
    id: 'executioner',
    affects: ['sword', 'blast'],
    name: 'Executioner',
    desc: '+50% dmg vs low-HP enemies',
    flavor: 'Mercy, for those already broken. One clean cut.',
    icon: 'relic_executioner',
    tint: '#d25555',
    apply: () => { hero.executeThreshold = Math.max(hero.executeThreshold, 0.40); hero.executeMul = 1.5; },
  },
  warlord: {
    id: 'warlord',
    affects: ['sword', 'blast'],
    name: 'Warlord',
    desc: '+8% dmg per relic owned',
    flavor: 'Every treasure at your belt sings when you swing.',
    icon: 'relic_warlord',
    tint: '#ffb065',
    // apply() runs BEFORE the relic is pushed into `equipped`, so a
    // first-pick Warlord would see length=0 and grant +0%. Past that,
    // the original code never re-multiplied for future picks. Fix:
    // (1) retroactive bonus for relics ALREADY equipped at pickup;
    // (2) flag so applyRelic() multiplies on EVERY subsequent pickup
    //     (matching the memoryBell pattern at line ~1032).
    apply: () => {
      hero.warlord = true;
      if (equipped.length > 0) hero.damageMul *= (1 + 0.08 * equipped.length);
    },
  },
  reaver: {
    id: 'reaver',
    affects: ['sword', 'blast'],
    name: 'Reaver',
    // Round-6 economy retune — was +15% lifesteal + 8% crit floor,
    // measured at ~5.75% effective lifesteal stacked with bloodstone +
    // keen_edge (the canonical lifesteal-on-crit pair). Audit flagged
    // it as a strict downgrade. Bumped to 25% lifesteal + 12% crit
    // floor so reaver actually lifts a no-keen-edge build into crit
    // territory and outpaces bloodstone's 10% flat lifesteal.
    desc: '+25% lifesteal on crit',
    flavor: 'The wound breathes — so do you.',
    icon: 'relic_reaver',
    tint: '#ff6a8e',
    apply: () => { hero.lifesteal += 0.25; hero.critChance = Math.max(hero.critChance, 0.12); },
  },
  // ---------- EFFECT RELICS — synergies & spectacle ----------
  chain_lightning: {
    id: 'chain_lightning',
    affects: ['sword', 'blast'],
    name: 'Chain Lightning',
    desc: 'Every 3rd hit arcs to a nearby enemy',
    flavor: 'A storm bound to a man\u2019s heart, waiting to be spent.',
    icon: 'relic_chain_lightning',
    tint: '#a0e8ff',
    tier: 'rare',
    apply: () => { hero.chainLightning = true; },
  },
  explosive_kill: {
    id: 'explosive_kill',
    affects: ['sword', 'blast'],
    name: 'Explosive Kill',
    desc: 'Enemies explode on death',
    flavor: 'Their bodies were never meant to hold so much hatred.',
    icon: 'relic_explosive_kill',
    tint: '#ff8040',
    tier: 'rare',
    apply: () => { hero.explosiveKill = true; },
  },
  soul_burst: {
    id: 'soul_burst',
    affects: ['sword', 'blast'],
    name: 'Soul Burst',
    desc: 'Every 5th kill releases a wave of souls',
    flavor: 'The things you kill do not leave you. They gather.',
    icon: 'relic_soul_burst',
    tint: '#b4d8ff',
    tier: 'rare',
    apply: () => { hero.soulBurst = true; },
  },
  thunder_step: {
    id: 'thunder_step',
    affects: ['shield'],
    name: 'Thunder Step',
    desc: 'Shield raise discharges a lightning pulse',
    flavor: 'The air forgets to close behind her.',
    icon: 'relic_thunder_step',
    tint: '#e8ffff',
    tier: 'rare',
    apply: () => { hero.thunderStep = true; },
  },
  vampiric_aura: {
    id: 'vampiric_aura',
    affects: ['sword'],
    name: 'Vampiric Aura',
    desc: 'Nearby enemies take damage \u00b7 you heal on hit',
    flavor: 'Their fear is warm. You can feel it from here.',
    icon: 'relic_vampiric_aura',
    tint: '#ff5078',
    tier: 'rare',
    apply: () => { hero.vampiricAura = true; },
  },
  echoing_strike: {
    id: 'echoing_strike',
    affects: ['sword', 'blast'],
    name: 'Echoing Strike',
    desc: 'Your hits echo 0.15s later for 40% damage',
    flavor: 'The blade strikes twice. You only swing once.',
    icon: 'relic_echoing_strike',
    tint: '#ffddaa',
    tier: 'rare',
    apply: () => { hero.echoingStrike = true; },
  },
  // ==================== LEGENDARY RELICS ====================
  // Game-changing anchors. Only roll on floor 3+ or from the post-boss shop.
  // ---------- MYTHIC tier ----------
  // Named, story-anchored relics. Appear only on floor 4 at ~6% per pick.
  // Visual + audio treatment is elevated — bell + sub-bass + extended banner.
  eye_of_ether: {
    id: 'eye_of_ether',
    affects: ['sword', 'blast'],
    name: 'Eye of Ether',
    desc: '+20% crit \u00b7 crits PIERCE through enemies',
    flavor: 'They say she tore it from her own skull the night the city burned.',
    icon: 'relic_eye_of_ether',
    tint: '#e6c8ff',
    tier: 'mythic',
    apply: () => { hero.critChance += 0.20; hero.pierceCrit = true; },
  },
  cataclysm: {
    id: 'cataclysm',
    affects: ['sword', 'blast'],
    name: 'Cataclysm',
    desc: 'Every 10th hit erupts the room',
    flavor: 'The last thing the last god held. He never set it down.',
    icon: 'relic_cataclysm',
    tint: '#ff9455',
    tier: 'mythic',
    apply: () => { hero.cataclysm = true; },
  },
  // Round-6 endgame audit added 3 new mythics. Old pool was 2 (cataclysm
  // + eye_of_ether), making a "mythic-blessed" run binary — players
  // either rolled one of two fire-themed AoE relics or felt mythic-less.
  // These three add a defensive identity (heart_of_wound), a movement /
  // control identity (stride_of_ash), and an economy identity
  // (coin_of_tyrant) so a mythic roll has thematic variety.
  heart_of_wound: {
    id: 'heart_of_wound',
    affects: ['any'],
    name: 'Heart of the Wound',
    // Once-per-run pseudo-revive — when the next lethal hit lands, the
    // hero is reduced to 1 HP instead of dying AND a 200px shockwave
    // pushes nearby enemies back + grants 1.6s of iframes to recover.
    // Distinct from phoenix_cloak (which gives a full revive at 30%);
    // heart_of_wound is the "skin of your teeth" survival, the kind of
    // moment players will tell each other about. Wired in hero.js's
    // damage path right alongside hero.revives.
    desc: 'First lethal blow leaves you at 1 HP and pushes back attackers',
    flavor: 'The wound learned a name. You. It will not let you go.',
    icon: 'relic_phoenix_cloak',     // shared icon — phoenix imagery fits both revival relics
    tint: '#ff5070',
    tier: 'mythic',
    apply: () => { hero.heartOfWoundAvailable = true; },
  },
  stride_of_ash: {
    id: 'stride_of_ash',
    affects: ['shield'],
    name: 'Stride of Ash',
    // Wizard-kit Sprint 1 rebind — the trigger is now SHIELD RAISE
    // (was the legacy dodge-roll motion). Same ember-flame hazard
    // system as bomber trails, just hero-side. Pools deal 1 dmg/tick
    // to enemies, last 1.4s each, drop ~3 around the shield raise.
    // Turns the hero's defensive cast into an offensive lane closer.
    desc: 'Raising your shield scatters embers that scorch nearby enemies',
    flavor: 'You walked through the wound, and the wound learned to walk with you.',
    icon: 'relic_avatar_of_flame',
    tint: '#ff8a40',
    tier: 'mythic',
    apply: () => { hero.strideOfAsh = true; },
  },
  coin_of_tyrant: {
    id: 'coin_of_tyrant',
    affects: ['any'],
    name: 'Coin of the Tyrant',
    // Kills drop +50% gold AND every 8th kill drops a free random
    // common relic on the floor (auto-applies on contact). Fills the
    // economy slot in the mythic pool — a player rolling Coin of the
    // Tyrant is making bank for the rest of the descent and starting
    // builds they couldn't afford otherwise.
    desc: 'Kills drop +50% gold; every 8th kill drops a free relic',
    flavor: 'He counted his dead in coins. The coins remember.',
    icon: 'relic_gilded_hoard',
    tint: '#ffd070',
    tier: 'mythic',
    apply: () => {
      hero.coinOfTyrant = true;
      hero.goldMul = (hero.goldMul || 1) * 1.5;
    },
  },
  wanderers_cloak: {
    id: 'wanderers_cloak',
    affects: ['shield'],
    name: "Wanderer's Cloak",
    desc: 'Shield raise grants 2s of doubled attack speed',
    flavor: 'Whoever wears it was never where you last looked.',
    icon: 'relic_wanderers_cloak',
    tint: '#b4e8ff',
    tier: 'legendary',
    apply: () => { hero.wandererCloak = true; },
  },
  ethereal_binding: {
    id: 'ethereal_binding',
    affects: ['any'],
    name: 'Ethereal Binding',
    desc: 'Every 3 kills: 1s invulnerability',
    flavor: 'The dead hold your shape a moment, that you may not die.',
    icon: 'relic_ethereal_binding',
    tint: '#ffe088',
    tier: 'legendary',
    apply: () => { hero.etherealBinding = true; },
  },
  // ---------- Expanded pool (overnight session) ----------
  phoenix_cloak: {
    id: 'phoenix_cloak',
    affects: ['any'],
    name: 'Phoenix Cloak',
    desc: 'Revive on death \u00b7 explode on revive',
    flavor: 'Born from ash. What comes back is always a little less human.',
    icon: 'relic_phoenix_cloak',
    tint: '#ff9a50',
    tier: 'legendary',
    apply: () => { hero.revives += 1; hero.phoenixCloak = true; },
  },
  avatar_of_flame: {
    id: 'avatar_of_flame',
    affects: ['sword'],
    name: 'Avatar of Flame',
    desc: 'Weapon always ignited \u00b7 trails fire',
    flavor: 'The fire did not take you. It married you.',
    icon: 'relic_avatar_of_flame',
    tint: '#ff6a28',
    tier: 'legendary',
    apply: () => { hero.avatarOfFlame = true; hero.damageMul *= 1.15; },
  },
  pyromancer: {
    id: 'pyromancer',
    affects: ['sword', 'blast'],
    name: 'Pyromancer',
    desc: 'Every 4th hit spawns a small explosion',
    flavor: 'Every swing, a promise. Every fourth, a reminder.',
    icon: 'relic_pyromancer',
    tint: '#ff8040',
    tier: 'rare',
    apply: () => { hero.pyromancer = true; },
  },
  soulreaver: {
    id: 'soulreaver',
    affects: ['sword', 'blast'],
    name: 'Soulreaver',
    desc: 'Each kill grants 0.5s attack speed buff (stacks)',
    flavor: 'The blade drinks, and the blade wants more.',
    icon: 'relic_soulreaver',
    tint: '#b4e8ff',
    tier: 'rare',
    apply: () => { hero.soulreaver = true; },
  },
  counterstrike: {
    id: 'counterstrike',
    affects: ['shield'],
    name: 'Counterstrike',
    desc: 'Perfect-block counter hits explode, dealing 2x damage',
    flavor: 'Patience is a blade. The swing is just the punctuation.',
    icon: 'relic_counterstrike',
    tint: '#ffeb99',
    tier: 'rare',
    apply: () => { hero.counterstrike = true; },
  },
  aegis_pulse: {
    id: 'aegis_pulse',
    affects: ['shield'],
    name: 'Aegis Pulse',
    desc: 'Below 30% HP: every 4s, emit shockwave that staggers nearby enemies',
    flavor: 'A dying heart beats louder. Loud enough to push the world back.',
    icon: 'relic_aegis_pulse',
    tint: '#a0d8ff',
    tier: 'rare',
    apply: () => { hero.aegisPulse = true; },
  },
  bloodrite: {
    id: 'bloodrite',
    affects: ['sword', 'blast'],
    name: 'Bloodrite',
    // Round-6 economy retune — was +15% below 50% HP. Marrow Pact (also
    // common) gives +40% at the same threshold, making bloodrite a
    // strict downgrade. Bumped to +25% so bloodrite stacks meaningfully
    // with marrow_pact (+65% combined) for a real sub-50% glass-cannon
    // identity rather than picking marrow_pact and ignoring bloodrite.
    desc: '+25% damage while below 50% HP',
    flavor: 'Offer your own blood. The gods of Ethera listen.',
    icon: 'relic_bloodrite',
    tint: '#d85a5a',
    tier: 'common',
    apply: () => { hero.bloodrite = true; },
  },
  gale_step: {
    id: 'gale_step',
    affects: ['shield'],
    name: 'Gale Step',
    // Round-6 economy retune — was a flat +35% dodge distance with no
    // hook. nimble_step (cleanse) and dash_master (cooldown refund)
    // both ate its niche. Bumped to +55% AND adds a brief post-dodge
    // speed burst (+30% for 0.4s) so gale_step becomes the "tempo"
    // dodge relic — chain dodges into runs, kite swarms, reposition
    // mid-combat. nimble_step still owns "cleanse on dodge",
    // dash_master still owns "shorter cooldown".
    desc: 'Shield duration +55%; brief speed burst when the shield drops',
    flavor: 'Ride the breath the ruin exhales between killings.',
    icon: 'relic_gale_step',
    tint: '#b0e8ff',
    tier: 'common',
    apply: () => { hero.dodgeDistMul *= 1.55; hero.galeStep = true; },
  },

  // ==========================================================================
  // NEW MECHANICAL RELICS (systems pass — session 1)
  //
  // These fill design gaps in the common pool: a frontal-defense identity
  // (bulwark) and a per-room resource identity (second_wind). Both measured
  // to stand on their own without a fusion partner.
  // ==========================================================================
  bulwark: {
    id: 'bulwark',
    affects: ['shield'],
    name: 'Bulwark',
    desc: 'Damage from the front is halved',
    flavor: 'A stance older than the word for "no."',
    icon: 'relic_bulwark',
    tint: '#8ab8d8',
    tier: 'common',
    apply: () => { hero.bulwark = true; hero.bulwarkArc = Math.PI * 0.66; hero.bulwarkReduction = 0.5; },
  },
  second_wind: {
    id: 'second_wind',
    affects: ['shield'],
    name: 'Second Wind',
    desc: 'The first shield each room ignores cooldown',
    flavor: 'One breath held past the end. One more step taken.',
    icon: 'relic_second_wind',
    tint: '#b0e8a0',
    tier: 'common',
    apply: () => { hero.secondWind = true; },
  },

  // ==========================================================================
  // APRIL 2026 CONTENT EXPANSION — 10 new relics built from the icon bank.
  // Mechanics chosen to fill gaps in the existing palette: reflect/retaliation,
  // on-kill AOE, low-HP scaling, gold economy, aura DoT, dodge-based tempo.
  // ==========================================================================

  // Damage reflection — retaliation identity. Pairs with Counterstrike
  // (fusion_shatterpoint) for crit-reflection builds.
  mirror_shard: {
    id: 'mirror_shard',
    affects: ['shield'],
    name: 'Mirror Shard',
    desc: 'Reflect 20% of damage taken back to the attacker',
    flavor: 'It only shows what struck it last.',
    icon: 'relic_mirror_shard',
    tint: '#d8e8ff',
    tier: 'common',
    apply: () => { hero.mirrorShard = true; hero.mirrorReflect = 0.20; },
  },
  // On-kill area splash — turns every kill into a tiny second strike.
  spore_bloom: {
    id: 'spore_bloom',
    affects: ['sword', 'blast'],
    name: 'Spore Bloom',
    desc: 'Kills release a spore burst dealing 3 damage in an 80px radius',
    flavor: 'Something feeds on what you end.',
    icon: 'relic_spore_bloom',
    tint: '#a0e868',
    tier: 'common',
    apply: () => { hero.sporeBloom = true; hero.sporeDamage = 3; hero.sporeRadius = 80; },
  },
  // Counter-ring on successful dodge — rewards aggressive positioning.
  // Different from Bulwark (passive frontal) — this is an active retaliate.
  oathshield: {
    id: 'oathshield',
    affects: ['shield'],
    name: 'Oathshield',
    desc: 'After raising your shield, your next hit within 1s deals +50% damage',
    flavor: 'The vow was simple. The blade remembered it.',
    icon: 'relic_oathshield',
    tint: '#9ab0c8',
    tier: 'common',
    apply: () => { hero.oathshield = true; hero.oathshieldBonus = 0.5; },
  },

  // Rare-tier additions
  // Chain splash — every 4th swing clips a second nearby foe. Rewards
  // crowd positioning and favors dense rooms.
  arcane_quiver: {
    id: 'arcane_quiver',
    affects: ['sword'],
    name: 'Arcane Quiver',
    desc: 'Every 4th melee hit splashes to one nearby enemy for 40% damage',
    flavor: 'The string that draws itself.',
    icon: 'relic_arcane_quiver',
    tint: '#c8a0ff',
    tier: 'rare',
    apply: () => { hero.arcaneQuiver = true; },
  },
  // Low-HP scaling — rewards staying in the red instead of healing up.
  marrow_pact: {
    id: 'marrow_pact',
    affects: ['sword', 'blast'],
    name: 'Marrow Pact',
    desc: 'At or below 50% HP, your damage dealt is +40%',
    flavor: 'Your bones bargain well.',
    icon: 'relic_marrow_pact',
    tint: '#d85858',
    tier: 'rare',
    apply: () => { hero.marrowPact = true; hero.marrowPactBonus = 0.4; },
  },
  // Gold economy — multiplies all gold pickups. High synergy with the
  // between-floor shop and the Purse of Depths meta unlock.
  gilded_hoard: {
    id: 'gilded_hoard',
    affects: ['any'],
    name: 'Gilded Hoard',
    // Round-6 economy retune — was rare-tier with +30% gold. With
    // reroll + altar economy, +30% gold compounds into ~2 free rerolls
    // per floor, which is roughly the value of a legendary stat-stick.
    // Audit measured this as the single most run-warping rare. Bumped
    // to +40% gold AND reclassed to legendary so the tier reflects
    // its actual impact.
    desc: '+40% gold from all sources',
    flavor: 'The chalice never empties; it remembers what was poured.',
    icon: 'relic_gilded_hoard',
    tint: '#f4d9a0',
    tier: 'legendary',
    apply: () => { hero.gildedHoard = true; hero.goldMul = (hero.goldMul || 1) * 1.4; },
  },
  // Ambient fire aura — passive DPS while moving through combat rooms.
  hymn_of_embers: {
    id: 'hymn_of_embers',
    affects: ['any'],
    name: 'Hymn of Embers',
    desc: 'Enemies within 80px take 2 damage per second',
    flavor: 'The choir sings low. The air forgets how to cool.',
    icon: 'relic_hymn_of_embers',
    tint: '#ffaa58',
    tier: 'rare',
    apply: () => { hero.hymnOfEmbers = true; hero.hymnRadius = 80; hero.hymnDps = 2; },
  },

  // Legendary-tier additions
  // Slow-mo on perfect dodge — rewards frame-tight play with stylish payoff.
  temporal_eye: {
    id: 'temporal_eye',
    affects: ['shield'],
    name: 'Temporal Eye',
    desc: 'Perfect blocks trigger 0.35s of slow-motion',
    flavor: 'The sand stops for those who see it falling.',
    icon: 'relic_temporal_eye',
    tint: '#a8e0e8',
    tier: 'legendary',
    apply: () => { hero.temporalEye = true; hero.temporalSlowDuration = 0.35; },
  },
  // Post-dodge crit window — the next hit after a dodge is a guaranteed crit.
  // Pairs with mobility-focused builds (nimble_step, gale_step).
  whisper_veil: {
    id: 'whisper_veil',
    affects: ['shield'],
    name: 'Whisper Veil',
    desc: 'For 0.5s after a shield, your next hit is a guaranteed crit',
    flavor: 'She is the space the ruin forgot to fill.',
    icon: 'relic_whisper_veil',
    tint: '#8058c8',
    tier: 'legendary',
    apply: () => { hero.whisperVeil = true; hero.whisperVeilWindow = 0.5; },
  },
  // Periodic lightning — ambient offensive that scales with room density.
  stormcaller: {
    id: 'stormcaller',
    affects: ['any'],
    name: 'Stormcaller',
    desc: 'Every 1.5s, strike the nearest enemy within 220px for 8 damage',
    flavor: 'The cloud remembers every name it has spoken.',
    icon: 'relic_stormcaller',
    tint: '#80c8ff',
    tier: 'legendary',
    apply: () => { hero.stormcaller = true; hero.stormcallerInterval = 1.5; hero.stormcallerDamage = 8; hero.stormcallerRange = 220; },
  },

  // Rehomes the orphan `relic_hourglass.png` asset into the active pool.
  // Panic-button design — once-per-minute damage reduction at low HP.
  hourglass_of_respite: {
    id: 'hourglass_of_respite',
    affects: ['any'],
    name: 'Hourglass of Respite',
    desc: 'At 30% HP or below, incoming damage is halved. Triggers once per minute.',
    flavor: 'The sand knows when to stop. The hand does not always obey.',
    icon: 'relic_hourglass',
    tint: '#e8c880',
    tier: 'common',
    apply: () => { hero.hourglassRespite = true; hero.hourglassReadyAt = 0; },
  },

  // ── BLAST-SLOT RELICS (formerly weaponOnly: 'wand') ──────────────────
  // Wizard-kit Sprint 3A — these were wand-locked when wand was its own
  // weapon variant. With the new weapon-slot architecture, BLAST is the
  // ranged option and these relics universally affect it. The hero flags
  // they set (boltSplit / boltChain / boltCritOnCharge) are read by
  // spawnHeroBolt + the bolt-collision handler — both apply to blast
  // bolts unchanged. Pickable on any run.

  splintered_light: {
    // Bolts split into two smaller bolts on first hit (wall or enemy).
    // Sub-bolts go at ±25° at 70% damage. Adds tactical AoE potential
    // — aim at a tight pack and the spread cleans up the survivors.
    id: 'splintered_light',
    affects: ['blast'],
    name: 'Splintered Light',
    desc: 'Blast bolts split into two on first hit',
    flavor: 'The light remembered being many before it was taught to be one.',
    icon: 'relic_attack_speed',
    tint: '#c0a0ff',
    tier: 'rare',
    apply: () => { hero.boltSplit = true; },
  },

  storm_conduit: {
    // Bolt hit arcs lightning to the nearest enemy within 140px (1
    // chain). Reuses the existing spawnLightningArc from synergies.js
    // so the visual + audio are consistent with chain_lightning relic.
    // Damage on the chain is 50% of the bolt's damage — meaningful but
    // not the primary kill source.
    id: 'storm_conduit',
    affects: ['blast'],
    name: 'Storm Conduit',
    desc: 'Blast hits arc lightning to the nearest enemy',
    flavor: 'A weather she had once watched from a window.',
    icon: 'relic_stormcaller',
    tint: '#9adfff',
    tier: 'rare',
    apply: () => { hero.boltChain = true; },
  },

  // ── SWORD-THEMED (weaponOnly: 'sword') ────────────────────────────
  // Sword is the balanced "default" weapon. Its identity is reliable
  // mid-range damage with a 3-swing combo finisher. Sword-only relics
  // reward learning the swing-chain rhythm.

  honest_edge: {
    // Finisher swings (every 3rd hit) ALWAYS crit. Sword's identity is
    // its 3-swing combo; this relic doubles down — committing to the
    // full chain reliably crits the third hit. Pairs with executioner
    // for a real "wind up the finisher on bosses" playstyle.
    id: 'honest_edge',
    affects: ['sword'],
    name: 'Honest Edge',
    desc: 'Sword finishers (3rd hit in chain) always crit',
    flavor: 'A lie cuts only once. The truth, three times.',
    icon: 'relic_keen_edge',
    tint: '#ffe5a0',
    tier: 'rare',
    weaponOnly: 'sword',
    apply: () => { hero.honestEdge = true; },
  },

  ringing_steel: {
    // Each hit in a continuous chain (within swingChainTime window)
    // adds +6% damage to the next swing, capped at +30% (5 stacks).
    // Reset when chain expires. Rewards uninterrupted offense — sword
    // is the "stay on target" weapon. Pairs with attack speed relics
    // for a building-DPS feel.
    id: 'ringing_steel',
    affects: ['sword'],
    name: 'Ringing Steel',
    desc: 'Sword chain hits add +6% damage each, max +30%',
    flavor: 'The blade hums when struck, and remembers the song.',
    icon: 'relic_serrated_edge',
    tint: '#ffd27a',
    tier: 'rare',
    weaponOnly: 'sword',
    apply: () => { hero.ringingSteel = true; },
  },

  vow_eternal: {
    // First hit each room is a guaranteed crit. The "vow" is renewed
    // every threshold — sword as the disciplined weapon. Lands as
    // an opener on every encounter, pairs powerfully with Long Reach
    // (poke from range, opening crit punishes the closing enemy).
    // hero.vowEternalReady is refreshed by loadRoom() in main.js;
    // consumed on first damage-dealing hit per room.
    id: 'vow_eternal',
    affects: ['sword'],
    name: 'Vow Eternal',
    desc: 'First sword hit each room is a guaranteed crit',
    flavor: 'Spoken once. Kept forever, so long as iron remembers iron.',
    icon: 'relic_warlord',
    tint: '#ffd680',
    tier: 'legendary',
    weaponOnly: 'sword',
    apply: () => { hero.vowEternal = true; hero.vowEternalReady = true; },
  },

  // ── DAGGER-THEMED (weaponOnly: 'dagger') ──────────────────────────
  // Dagger is the precision/skirmish weapon — narrow arc, fast swings,
  // higher crit baseline (+10% innate). Dagger-only relics reward the
  // weave/dodge/strike playstyle.

  twin_pulse: {
    // Every 2nd dagger hit ALSO damages the nearest other enemy within
    // 80px for 60% damage. Reads as "the strike echoes" — narrow-arc
    // dagger lets you tag a single target while the echo cleans up
    // adjacent enemies. Pairs with shadow theme for crit-spread.
    id: 'twin_pulse',
    affects: ['sword'],
    name: 'Twin Pulse',
    desc: 'Every 2nd dagger hit echoes to nearest enemy (60% dmg)',
    flavor: 'Two breaths. Two cuts. The same heart, twice.',
    icon: 'relic_serrated_edge',
    tint: '#a0e8ff',
    tier: 'rare',
    weaponOnly: 'dagger',
    apply: () => { hero.twinPulse = true; },
  },

  flicker_step: {
    // Perfect-dodge counter window 1.5s → 3.0s. Dagger's identity is
    // weaving between attacks; this gives the player twice as long to
    // capitalize on a perfect dodge. Pairs with whisper_veil + shadow
    // theme for a "every dodge becomes a kill" build.
    id: 'flicker_step',
    affects: ['shield'],
    name: 'Flicker Step',
    desc: 'Dagger doubles the perfect-block counter window',
    flavor: 'A breath taken between two heartbeats. Time enough to answer.',
    icon: 'relic_nimble_step',
    tint: '#b0e0ff',
    tier: 'rare',
    weaponOnly: 'dagger',
    apply: () => { hero.flickerStep = true; },
  },

  razor_pace: {
    // Every 5th dagger hit deals 2.5x damage. Reads as a "rhythm
    // crescendo" — dagger's fast cadence means the threshold lands
    // every 1.5–2s of sustained pressure. Counter resets when not
    // attacking for ~3s so it can't be banked. Pairs with crit /
    // executioner / shadow theme.
    id: 'razor_pace',
    affects: ['sword'],
    name: 'Razor Pace',
    desc: 'Every 5th dagger hit deals 2.5× damage',
    flavor: 'Five strokes to the rhythm. The fifth is the song.',
    icon: 'relic_ascendant',
    tint: '#b0e0ff',
    tier: 'legendary',
    weaponOnly: 'dagger',
    apply: () => { hero.razorPace = true; hero.razorPaceHits = 0; },
  },

  // ── HAMMER-THEMED (weaponOnly: 'hammer') ──────────────────────────
  // Hammer is the slow/heavy weapon — wide arc, big damage, long
  // commitment. Hammer-only relics reward landing the big hits.

  mountain_strike: {
    // Every 3rd hammer swing spawns a 70px shockwave at impact for
    // 50% weapon damage. Reads as "the ground answers" — hammer is
    // the AoE weapon, this relic adds AoE on a rhythm. Pairs with
    // heavy_blow for a "knockback + shockwave" combo.
    id: 'mountain_strike',
    affects: ['sword'],
    name: 'Mountain Strike',
    desc: 'Every 3rd hammer swing spawns a shockwave',
    flavor: 'The mountain answers in kind. A blow for a blow.',
    icon: 'relic_heavy_blow',
    tint: '#ffae6c',
    tier: 'rare',
    weaponOnly: 'hammer',
    apply: () => { hero.mountainStrike = true; },
  },

  earthen_hold: {
    // Charged hammer hits stagger enemies for +0.6s on top of the
    // base stagger. Hammer's charge is already a commitment — this
    // makes the payoff harder to escape. Pairs with iron_resolve for
    // a "tank charge → counter-attack" stance build.
    id: 'earthen_hold',
    affects: ['sword'],
    name: 'Earthen Hold',
    desc: 'Charged hammer hits stagger enemies for +0.6s',
    flavor: 'Stand still, the earth tells them. They obey, briefly.',
    icon: 'relic_ironhide',
    tint: '#c8a060',
    tier: 'rare',
    weaponOnly: 'hammer',
    apply: () => { hero.earthenHold = true; },
  },

  world_ender: {
    // Hammer finisher swings (every 3rd swing — same beat as the
    // base finisher VFX) instantly shatter enemy shields. This is
    // the answer to Warded affixes + future shielded enemies — the
    // hammer's narrative says "nothing stops it on the third swing".
    // Reads massive in practice because Warded elites have been a
    // dagger/wand misery; hammer becomes the shield-buster spec.
    id: 'world_ender',
    affects: ['sword'],
    name: 'World-Ender',
    desc: 'Hammer finisher swings shatter enemy shields',
    flavor: 'Three blows for the world below. The third is the door.',
    icon: 'relic_executioner',
    tint: '#ffae6c',
    tier: 'legendary',
    weaponOnly: 'hammer',
    apply: () => { hero.worldEnder = true; },
  },

  patient_lens: {
    // Charged shots get a +50% damage bump AND mark the hit as a CRIT
    // for the damage-number badge + any crit-hit downstream procs. The
    // legendary tier on this relic pays off the patient playstyle —
    // sit on charge, time the release, hit hard. Does nothing for
    // tap-fire bolts (skill expression for charge-release timing).
    id: 'patient_lens',
    affects: ['blast'],
    name: 'Patient Lens',
    desc: 'Charged blast bolts crit · +50% damage',
    flavor: 'Sight does not hurry. The arrow that flies fastest is rarely seen.',
    icon: 'relic_eye_of_ether',
    tint: '#ffd680',
    tier: 'legendary',
    apply: () => { hero.boltCritOnCharge = true; },
  },

  // ============================================================================
  // CROSS-ABILITY SYNERGY RELICS — wizard-kit Sprint 3C
  //
  // These five relics only matter in the new weapon-swap kit. They reward
  // swap rhythm play: kill with one weapon, swap, get a buff; blink after a
  // perfect-block, your next blast empowers; etc. A pure-sword build sees
  // most of them as dead picks — that's the design (these are the
  // "balanced kit" payoff, not a mandatory tax).
  //
  // affects: ['sword', 'blast'] for the three that buff both weapons; the
  // two single-slot ones (Phase Flicker = blast, Echo Step = blast/shield)
  // are tagged where their PAYOFF lands.
  // ============================================================================

  resonance_stone: {
    id: 'resonance_stone',
    affects: ['sword', 'blast'],
    name: 'Resonance Stone',
    // Killing with one weapon arms a 3s "echo" window: when you swap to
    // the OTHER weapon, the next attack is a guaranteed crit. Reads as
    // "the unused weapon waits its turn — but it remembers."
    desc: 'Kill with one weapon → next swap-to-other-weapon attack crits (3s)',
    flavor: 'The unused blade waits its turn. It does not forget.',
    icon: 'relic_keen_edge',
    tint: '#e8d8ff',
    tier: 'rare',
    apply: () => { hero.resonanceStone = true; },
  },

  twin_fang_pact: {
    id: 'twin_fang_pact',
    affects: ['sword', 'blast'],
    name: 'Twin Fang Pact',
    // Swapping weapons grants 0.4s of +50% damage. Active swappers get
    // burst windows — the more you swap, the more you damage. Pairs
    // perfectly with Resonance Stone for swap-rhythm builds.
    desc: 'Swapping weapons grants +50% damage for 0.4s',
    flavor: 'Two fangs in one mouth. Both teach the same lesson.',
    icon: 'relic_serrated_edge',
    tint: '#ffd680',
    tier: 'legendary',
    apply: () => { hero.twinFangPact = true; },
  },

  phase_flicker: {
    id: 'phase_flicker',
    affects: ['blast'],
    name: 'Phase Flicker',
    // Blink during the 1.0s window after a perfect-block → next blast
    // costs 0 CD AND chains to 2 nearby enemies. Three-input combo:
    // shield-perfect → blink → blast. The cool magic-trick relic.
    desc: 'Blink within 1s of a perfect-block → next blast is a free chain cast',
    flavor: 'A breath stolen between two heartbeats. The world catches up later.',
    icon: 'relic_temporal_eye',
    tint: '#a8e0ff',
    tier: 'legendary',
    apply: () => { hero.phaseFlicker = true; },
  },

  echo_step: {
    id: 'echo_step',
    affects: ['shield'],
    name: 'Echo Step',
    // Post-blink, the next 2s of incoming damage is a free perfect-
    // block. Single-use; consumed on first eligible hit. Reads as
    // "your origin point holds your shape until something strikes
    // through it." A blast-side defensive option that doesn't need
    // shield to be raised.
    desc: 'After blinking, the next hit within 2s is a free perfect-block',
    flavor: 'You leave a shape behind. The shape catches what hunts you.',
    icon: 'relic_whisper_veil',
    tint: '#b0d8ff',
    tier: 'rare',
    apply: () => { hero.echoStep = true; },
  },

  adaptive_edge: {
    id: 'adaptive_edge',
    affects: ['sword', 'blast'],
    name: 'Adaptive Edge',
    // Active weapon's damage scales by +5% per OFF-SLOT relic owned.
    // A pure sword build with no blast picks gets 0% bonus (not a stat
    // stick). A 1-sword + 4-blast hybrid gets +20% on sword swings AND
    // +5% on bolts (since they have 1 sword-side relic). Rewards
    // BALANCED builds — the more you spread, the more you scale.
    desc: 'Active weapon: +5% damage per relic of the OFF-slot',
    flavor: 'What you have not yet drawn still sharpens what you wield.',
    icon: 'relic_warlord',
    tint: '#c8d8ff',
    tier: 'rare',
    apply: () => { hero.adaptiveEdge = true; },
  },
};

export const ALL_RELIC_IDS = Object.keys(RELIC_DEFS);

// Default tier is 'common' if a relic has no tier field.
export function relicTier(id) {
  const def = RELIC_DEFS[id];
  return def && def.tier ? def.tier : 'common';
}

// Returns true if a relic is compatible with the hero's currently
// equipped weapon — i.e. either it has no `weaponOnly` field (works
// for everything) or its `weaponOnly` matches the weapon. Used by
// every relic-pool filter in the codebase (rollRelicOffer, boss
// rewards, tarot start-with bonuses, daily challenge relic, etc.) so
// a sword/dagger/hammer player never gets handed a wand-only relic
// as a guaranteed pickup.
//
// THE FOOL tarot starts the player with `hero.weapon = null` until the
// first room clear grants one. While weapon is null, we allow ALL
// weapon-only relics through — the FOOL player should be able to pick
// any weapon-themed relic and have it MATTER once they earn a weapon.
// (Previously, null fell through to 'sword' here, which meant a FOOL
// player saw only sword-themed picks regardless of what weapon they'd
// eventually be granted — silent build trap.)
export function isRelicForWeapon(id, weapon) {
  const def = RELIC_DEFS[id];
  if (!def) return false;
  if (!def.weaponOnly) return true;
  if (weapon === null) return true;     // FOOL: weapon-pending, allow all
  return def.weaponOnly === (weapon || 'sword');
}

// Tier weight distribution per floor — higher floors see more rare/legendary.
// MYTHIC appears only on floor 4 and is rare (~6%). This is the Diablo
// "Windforce moment" — the unique drop players screenshot and remember.
const TIER_WEIGHTS_BY_FLOOR = {
  1: { common: 1.0,  rare: 0.0,  legendary: 0.0,  mythic: 0.0 },
  // Pacing review P0 — floor 2 had 0% legendary alongside the tier3
  // enemy difficulty bump, so a player who hit the cliff couldn't roll
  // a build-defining piece to compensate. 5% legendary gives roughly
  // 1-in-20 picks a chance to land hot, without disrupting the
  // common→rare progression rhythm.
  2: { common: 0.60, rare: 0.35, legendary: 0.05, mythic: 0.0 },
  3: { common: 0.45, rare: 0.40, legendary: 0.15, mythic: 0.0 },
  // Pacing review P1 — mythic was 6% on floor 4 = ~0.54 expected per
  // run, so half of victorious players never saw the "Windforce
  // moment" they were ostensibly working toward. 10% raises expected
  // to ~0.9 — most successful F4 runs see one without it becoming
  // routine. The Ember Tyrant 20% boss-drop is unchanged.
  4: { common: 0.25, rare: 0.42, legendary: 0.23, mythic: 0.10 },
};

function weightedTier(floorLevel) {
  const weights = TIER_WEIGHTS_BY_FLOOR[floorLevel] || TIER_WEIGHTS_BY_FLOOR[1];
  const r = Math.random();
  let acc = 0;
  for (const t in weights) {
    acc += weights[t];
    if (r <= acc) return t;
  }
  return 'common';
}

// Hero's picked relics for this run
export const equipped = [];

export function resetRelics() {
  equipped.length = 0;
  clearFusions();
  hero.relicCount = 0;
  recomputeThemeTiers(equipped);   // zeroes all theme bonus fields
  recomputeSlotTiers(equipped);    // zeroes all slot bonus fields (Sprint 3B)
}

// Enforce any memory-imposed max-HP cap AFTER a relic is applied. Called
// from applyRelic below. Without this, a relic like Ironhide (+2 maxHp) or
// Vitality (regen + maxHp) would silently raise the hero past the cap that
// Memory of Ash (4) or Memory of the Hungry Blade (5) set at run start.
function enforceMemoryMaxHpCap() {
  let cap = Infinity;
  if (hero.memoryAsh) cap = Math.min(cap, 4);
  // CONTENT PASS B1 — Hungry Blade's HP-cap removed (reframed to
  // dodge-costs-HP). Ash is now the only HP-cap memory; makes its
  // identity distinct instead of overlapping.
  if (cap < Infinity && hero.maxHp > cap) {
    hero.maxHp = cap;
    if (hero.hp > hero.maxHp) hero.hp = hero.maxHp;
  }
}

// ============================================================================
// RELIC GLYPHS — 34 relics share only 8 base sprites, which made pickups feel
// repetitive. Solution: overlay a distinguishing pixel-art glyph on top of the
// base sprite at render time. Combined with per-relic tint hue-rotation, each
// relic becomes visually unique without commissioning new art.
//
// Glyph types (canvas-drawn, see renderRelicGlyph in fx.js):
//   sword   — attack/edge relics
//   bolt    — lightning/electric
//   flame   — fire/explosion
//   shield  — defense/resist
//   heart   — HP / sustain / lifesteal
//   eye     — crit / precision
//   wind    — speed / dodge / movement
//   skull   — execute / death
//   phoenix — revive
//   star    — soul / magic / ethereal
//   rune    — binding / echo
// ============================================================================
export const RELIC_GLYPHS = {
  // Base pool
  serrated_edge:    'sword',
  swift_arm:        'wind',        // base wind glyph — pure "speed" feel
  long_reach:       'sword',
  nimble_step:      'step',        // footprint — walking/agility
  iron_greaves:     'greaves',     // armored boot
  ironhide:         'shield',
  bloodstone:       'heart',
  phoenix_tear:     'phoenix',
  // Expanded common
  iron_resolve:     'shield',
  keen_edge:        'eye',
  vitality:         'heart',
  heavy_blow:       'sword',
  dash_master:      'dash',        // arrow + speed streaks
  executioner:      'skull',
  warlord:          'sword',
  reaver:           'skull',
  // Rare
  chain_lightning:  'bolt',
  explosive_kill:   'flame',
  soul_burst:       'star',
  thunder_step:     'bolt',
  vampiric_aura:    'heart',
  echoing_strike:   'rune',
  // Legendary
  eye_of_ether:     'eye',
  cataclysm:        'flame',
  wanderers_cloak:  'cloak',       // hooded figure silhouette
  ethereal_binding: 'rune',
  phoenix_cloak:    'phoenix',
  avatar_of_flame:  'flame',
  pyromancer:       'flame',
  soulreaver:       'star',
  counterstrike:    'sword',
  aegis_pulse:      'shield',
  bloodrite:        'skull',
  gale_step:        'gale',        // swirl / tornado
  bulwark:          'shield',
  second_wind:      'breath',      // wind + heart — recovery identity
  // Sprint 1 additions — these relics landed without glyph mappings and were
  // rendering as the undifferentiated base sprite + hue-rotate, defeating
  // the visual-identity system. Mapped to the closest thematic existing glyph.
  mirror_shard:         'rune',    // reflection / binding
  spore_bloom:          'flame',   // on-kill burst
  oathshield:           'shield',
  arcane_quiver:        'rune',    // arcane splash
  marrow_pact:          'skull',   // bones / pact / low-HP
  gilded_hoard:         'star',    // treasure glint
  hymn_of_embers:       'flame',   // fire aura
  temporal_eye:         'eye',     // time dilation
  whisper_veil:         'cloak',   // veil / phantom
  stormcaller:          'bolt',    // lightning
  hourglass_of_respite: 'breath',  // recovery at low HP
  // Wand-themed (weaponOnly: 'wand') — see RELIC_DEFS additions:
  splintered_light:     'star',    // shattered/dispersed magical light
  storm_conduit:        'bolt',    // lightning chain on bolt hit
  patient_lens:         'eye',     // patient sight, charged-shot crit
  // Sword-themed (weaponOnly: 'sword'):
  honest_edge:          'sword',   // finisher always crits
  ringing_steel:        'sword',   // chain damage build
  vow_eternal:          'sword',   // first hit each room is a guaranteed crit
  // Dagger-themed (weaponOnly: 'dagger'):
  twin_pulse:           'bolt',    // echo-strike to nearest enemy
  flicker_step:         'wind',    // perfect-dodge window doubled
  razor_pace:           'eye',     // every 5th hit lands a 2.5x crescendo
  // Hammer-themed (weaponOnly: 'hammer'):
  mountain_strike:      'sword',   // shockwave (no shockwave glyph)
  earthen_hold:         'shield',  // stagger / hold the line
  world_ender:          'sword',   // finisher shatters shields
  // Cross-ability synergy relics (Sprint 3C):
  resonance_stone:      'rune',    // binding / echo
  twin_fang_pact:       'sword',   // double-edged commitment
  phase_flicker:        'wind',    // teleport / phase
  echo_step:            'wind',    // afterimage / phase
  adaptive_edge:        'star',    // shifting / off-axis scaling
};

export function getRelicGlyph(id) {
  return RELIC_GLYPHS[id] || null;
}

// Pick N random relics not already owned, weighted by floor tier distribution.
// Falls back to next-lower tier if the rolled tier has no available relics.
export function rollRelicOffer(n, floorLevel = 1, opts = {}) {
  const ownedIds = new Set(equipped.map(r => r.id));
  const availableByTier = { common: [], rare: [], legendary: [], mythic: [] };
  // ASCENSION VI — "The Purged": legendary relics removed from the pool.
  // Mythics are blocked at the same tier (their effect budget is in the same league).
  const am = (typeof window !== 'undefined' && window.__ascensionModifiers) ? window.__ascensionModifiers() : {};
  const legendaryBlocked = !!(am && am.legendaryDisabled);
  // Weapon-class filter — relics tagged `weaponOnly: '<id>'` only roll
  // into the offer pool when the hero has that weapon equipped. Keeps
  // offer relevance high regardless of weapon choice (a sword player
  // never sees wand-themed relics; a wand player gets their themed
  // relics WITHOUT crowding the common pool with sword-only entries).
  const heroWeapon = hero.weapon || 'sword';
  for (const id of ALL_RELIC_IDS) {
    if (ownedIds.has(id)) continue;
    const def = RELIC_DEFS[id];
    if (def.weaponOnly && def.weaponOnly !== heroWeapon) continue;
    const t = relicTier(id);
    if (legendaryBlocked && (t === 'legendary' || t === 'mythic')) continue;
    if (availableByTier[t]) availableByTier[t].push(id);
  }
  // Theme handling — when opts.theme is set, themed pedestals deliver
  // a coherent set: every offer is pulled from the requested theme's
  // sub-pool. The earlier 70% bias produced ~1 off-theme card per
  // 3-slot modal, which broke the "this is a FLAME offering" contract
  // the pedestal makes visually. Pool sizes (8 storm, 12 flame, 13
  // blood, 15 vow, 14 shadow) are comfortable for 3 unseen picks.
  //
  // The picks loop runs two passes: first themed-only across all
  // fallback tiers, then un-themed as a last-resort safety net (only
  // triggers if every themed tier is exhausted, which is essentially
  // unreachable at our pool sizes). For un-themed pedestals the
  // first pass is skipped and the second pass is the only path.
  const themeBias = opts.theme;
  const pickFromTier = (t, themedOnly) => {
    const arr = availableByTier[t];
    if (!arr || !arr.length) return null;
    if (themedOnly && themeBias) {
      // Collect every themed index in this tier, pick one uniformly.
      const themedIdx = [];
      for (let i = 0; i < arr.length; i++) {
        if (RELIC_THEMES[arr[i]] === themeBias) themedIdx.push(i);
      }
      if (themedIdx.length === 0) return null;
      const idx = themedIdx[(Math.random() * themedIdx.length) | 0];
      const id = arr[idx];
      arr.splice(idx, 1);
      return id;
    }
    const i = (Math.random() * arr.length) | 0;
    const id = arr[i];
    arr.splice(i, 1);
    return id;
  };
  // Fallback order: mythic → legendary → rare → common (so a missed mythic
  // roll prefers legendary over dropping straight to common).
  const fallbackOrder = ['mythic', 'legendary', 'rare', 'common'];
  // minTier — skip any tier BELOW this in both primary pick + fallback.
  // Used by elite/perilous rooms to guarantee rare+ rewards.
  const minTier = opts.minTier || null;
  const TIER_ORDER = { common: 0, rare: 1, legendary: 2, mythic: 3 };
  const belowMin = (t) => minTier != null && TIER_ORDER[t] < TIER_ORDER[minTier];
  const picks = [];
  for (let k = 0; k < n; k++) {
    let target = weightedTier(floorLevel);
    if (belowMin(target)) target = minTier;   // promote the target to at least minTier
    const tryOrder = [target, ...fallbackOrder.filter(t => t !== target)].filter(t => !belowMin(t));
    let got = null;
    // Pass 1 — themed only (only when themeBias is set). Guarantees a
    // coherent set: all offers from the same theme. Walks the tier
    // fallback order so a missed mythic theme-roll prefers a legendary
    // theme-roll over dropping to common.
    if (themeBias) {
      for (const t of tryOrder) {
        got = pickFromTier(t, true);
        if (got) break;
      }
    }
    // Pass 2 — un-themed (uniform). Primary path for un-themed
    // pedestals; safety net for themed ones if all themed tiers run dry.
    if (!got) {
      for (const t of tryOrder) {
        got = pickFromTier(t, false);
        if (got) break;
      }
    }
    if (!got) break;
    picks.push(RELIC_DEFS[got]);
  }
  return picks;
}

import { checkFusionsOnPickup, clearFusions } from './fusions.js';
import { showTip, TIPS } from './tips.js';

// Persistent "ever seen" set — drives the Chronicles relicpedia. Every relic
// the player has ever picked up gets stored here across runs.
import { safeLoadJSON as _safeLoadJSON, safeSaveJSON as _safeSaveJSON } from './storage.js';

const RELIC_SEEN_KEY = 'ethera:seen_relics:v1';
export const seenRelicIds = new Set();
export function loadSeenRelics() {
  const arr = _safeLoadJSON(RELIC_SEEN_KEY, null, Array.isArray);
  if (arr) for (const id of arr) seenRelicIds.add(id);
}
function saveSeenRelics() {
  _safeSaveJSON(RELIC_SEEN_KEY, [...seenRelicIds]);
}

export function applyRelic(id) {
  const def = RELIC_DEFS[id];
  if (!def) return;
  if (equipped.find(r => r.id === id)) return;  // already owned
  def.apply();
  equipped.push(def);
  stats.relicsObtained++;
  // Maintain hero.relicCount so hero.js can read it without importing
  // relics.js (would create a circular dependency). Used by Memory of the
  // Bell (+8% damage per relic owned).
  hero.relicCount = equipped.length;
  // MEMORY OF THE BELL — +8% damage per relic owned, applied at pickup.
  // Compounds multiplicatively (1.08^N for N relics). The memory's own
  // apply() retroactively multiplies for any relics already equipped when
  // the memory first activates.
  if (hero.memoryBell) hero.damageMul *= 1.08;
  // WARLORD relic — same pattern. Once Warlord is owned, every future
  // pickup adds +8% dmg. The relic's own apply() handles the retroactive
  // bonus for relics already owned at the moment Warlord is picked.
  if (hero.warlord && def.id !== 'warlord') hero.damageMul *= 1.08;
  // Enforce memory-imposed max-HP caps AFTER each relic applies, so that
  // later relics with +maxHp effects can't silently undo the cap.
  enforceMemoryMaxHpCap();
  // Record first-time discovery for the codex.
  if (!seenRelicIds.has(id)) {
    seenRelicIds.add(id);
    saveSeenRelics();
  }
  // Onboarding — first time the player picks a weaponOnly relic, drop a
  // tip explaining why some relics don't show up for them ("only sword,
  // dagger, hammer or wand variants appear for your class").
  if (def.weaponOnly) showTip('first_weaponOnly');
  // Check for fusion formations after this relic joins the build
  try {
    const equippedIds = equipped.map(r => r.id);
    const formed = checkFusionsOnPickup(id, equippedIds, hero);
    if (formed.length > 0 && typeof window !== 'undefined' && window.__onFusionFormed) {
      for (const f of formed) window.__onFusionFormed(f);
    }
  } catch (e) {}
  // Theme set-bonus tiers — recompute AFTER fusion check so fusion-granted
  // flags don't get overwritten (fusions don't set theme bonus fields).
  // Snapshot prior tiers so we can detect transitions:
  //   0→≥1 = first_resonance tip (3-of-a-theme, RESONANCE active)
  //   1→2  = ascendance tip (5-of-a-theme, ASCENDANCE active — the
  //          rarer/bigger payoff that previously had NO feedback,
  //          only the aura quietly thickened. Now lands as a moment.)
  const priorTiers = hero.activeThemes ? { ...hero.activeThemes } : null;
  // Wizard-kit Sprint 3B — slot resonance also recomputes on every
  // pickup. Tracked in parallel with theme tiers; transitions can
  // surface as their own toast + audio in a future polish pass.
  const priorSlotTiers = hero.slotTiers ? { ...hero.slotTiers } : null;
  recomputeThemeTiers(equipped);
  recomputeSlotTiers(equipped);
  // Sprint 3B — slot resonance/ascendance toast. Mirrors the theme
  // toast pattern: 0→≥1 = "RESONANCE active"; 1→2 = "ASCENDANCE
  // active." Lighter audio than theme since multiple slots can fire
  // per pickup (a multi-slot relic could push BOTH sword + blast
  // tiers in one beat).
  if (priorSlotTiers && hero.slotTiers) {
    for (const k of Object.keys(hero.slotTiers)) {
      const before = priorSlotTiers[k] | 0;
      const after = hero.slotTiers[k] | 0;
      if (before < 1 && after >= 1) {
        try {
          pushNotification({
            kind: 'slot',
            title: `${k.toUpperCase()} · RESONANCE`,
            body: 'Three relics align. The ability sharpens.',
            tint: k === 'sword' ? '#ffd680' : k === 'blast' ? '#a0e8ff' : '#b0c8d8',
            life: 3.0,
          });
          synthChord(220, 0.5, 1.0);
        } catch (_e) {}
      } else if (before < 2 && after >= 2) {
        try {
          pushNotification({
            kind: 'slot',
            title: `${k.toUpperCase()} · ASCENDANCE`,
            body: 'Five relics shape this craft. Your ability transforms.',
            tint: k === 'sword' ? '#ffe5a0' : k === 'blast' ? '#d8f0ff' : '#d0e0f0',
            life: 4.5,
          });
          synthChord(294, 0.7, 1.4);
          synthPing(880, 0.8, 0.4);
        } catch (_e) {}
      }
    }
  }
  if (priorTiers && hero.activeThemes) {
    let firedResonance = false;
    let ascendedTheme = null;
    for (const k of Object.keys(hero.activeThemes)) {
      const before = priorTiers[k] | 0;
      const after = hero.activeThemes[k] | 0;
      if (before < 1 && after >= 1) {
        // First-time tip is one-shot per profile (educational beat). But
        // every subsequent resonance proc gets a per-run rail toast so
        // the moment is never silent. Playtest report: "Resonance kicked
        // in two relics ago and I didn't notice. No toast, no '+lifesteal'
        // floater. Whisper of an aura."
        if (!firedResonance) {
          showTip('first_resonance');
          firedResonance = true;
        }
        try {
          const themeName = k.toUpperCase();
          const themeColor = (THEMES[k] && THEMES[k].color) || '#c9a86a';
          pushNotification({
            kind: 'theme',
            title: `${themeName} · RESONANCE`,
            body: 'Three relics align. The aura settles under your feet.',
            tint: themeColor,
            life: 3.5,
          });
          // Audio cue — Round-6 AV audit: the resonance moment is
          // visually rich (toast + aura under hero) but was completely
          // silent. A run-defining 3-of-a-theme threshold deserves a
          // beat the player hears. Mid-warm chord at G3 (196 Hz) — sits
          // beneath any concurrent crit/pickup pings without crowding
          // the music bed.
          synthChord(196, 0.55, 0.9);
        } catch (_e) {}
      }
      if (before < 2 && after >= 2 && !ascendedTheme) {
        ascendedTheme = k;
      }
    }
    if (ascendedTheme) {
      // Ascendance is the player's 5-of-a-theme payoff. The first-ever
      // ascendance per theme still fires its educational tip via the
      // injected TIPS entry (one-shot per profile). Every ascendance
      // proc — first or repeat — also fires a rail toast so the moment
      // never goes silent on later runs.
      const tipKey = `ascendance_${ascendedTheme}`;
      const themeName = ascendedTheme.toUpperCase();
      try {
        TIPS[tipKey] = { text: `${themeName} ASCENDED — the fifth relic settles. The aura you carry deepens.` };
        showTip(tipKey);
      } catch (_e) {}
      try {
        const themeColor = (THEMES[ascendedTheme] && THEMES[ascendedTheme].color) || '#f4d9a0';
        pushNotification({
          kind: 'theme',
          title: `${themeName} · ASCENDED`,
          body: 'Five relics. The aura deepens. Mechanics shift.',
          tint: themeColor,
          life: 4.5,
          header: '— A NEW POWER STIRS —',
        });
        // Audio cue — ascendance is the bigger payoff (5-of-a-theme,
        // adds tier-2 mechanics like the STORM dodge-shock or BLOOD
        // room-clear regen). Larger chord at C4 (262 Hz) + a bright
        // ping 200ms later for the "lift" moment, mirroring how the
        // mythic-pickup banner pairs a chord with a sub-bell.
        synthChord(262, 0.7, 1.1);
        setTimeout(() => synthPing(1320, 0.18, 0.45), 200);
      } catch (_e) {}
    }
  }
}
