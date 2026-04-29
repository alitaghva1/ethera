// Relic system — passive modifiers applied for the rest of the run.
// Registry is pure data; effects live as functions that mutate the hero
// object when applied. Everything stacks additively so picks always matter.
import { hero } from './hero.js';
import { stats } from './stats';
import { recomputeThemeTiers } from './themes.js';

export const RELIC_DEFS = {
  serrated_edge: {
    id: 'serrated_edge',
    name: 'Serrated Edge',
    desc: '+30% attack damage',
    flavor: 'Sharpened on bone. It remembers the screams.',
    icon: 'relic_serrated_edge',
    tint: '#ff7a55',
    apply: () => { hero.damageMul *= 1.30; },
  },
  swift_arm: {
    id: 'swift_arm',
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
    name: 'Nimble Step',
    desc: 'Dodge cooldown -50% · dodging cleanses poison/slow',
    flavor: 'Worn thin by the feet of a thief who never died in a cell.',
    icon: 'relic_nimble_step',
    tint: '#7edfff',
    apply: () => { hero.dodgeCooldownMul *= 0.50; hero.dodgeCleanses = true; },
  },
  iron_greaves: {
    // SYSTEMS PASS — was pure +20% move speed (dead stat stick, −16 DPS).
    // Now rewards CONTINUOUS MOVEMENT: first hit after 2s of non-stop
    // motion is a guaranteed crit. Creates kiting / hit-and-run identity.
    id: 'iron_greaves',
    name: 'Iron Greaves',
    desc: '+20% speed · first hit after 2s of movement crits',
    flavor: 'They never rusted. Perhaps they never touched the earth.',
    icon: 'relic_iron_greaves',
    tint: '#9bd8ff',
    apply: () => { hero.speedMul *= 1.20; hero.movementCrit = true; },
  },
  ironhide: {
    // BALANCE PASS — was pure +2 maxHp stat stick with −14 DPS corr.
    // Now: +3 maxHp AND 10% damage reduction. Still defensive, but the
    // dmg-reduction multiplier compounds with Iron Resolve / Stalwart
    // fusion for actual tanky-build identity.
    id: 'ironhide',
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
    name: 'Iron Resolve',
    desc: '-20% damage taken · facing hits while held still PARRY for -85%',
    flavor: 'The knight still stood, long after the war had ended.',
    icon: 'relic_iron_resolve',
    tint: '#a0c8ff',
    apply: () => { hero.damageTakenMul *= 0.80; hero.ironResolveParry = true; },
  },
  keen_edge: {
    id: 'keen_edge',
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
    name: 'Heavy Blow',
    desc: 'Knockback ×2.5 · hitting a knocked-back enemy is a guaranteed crit',
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
    name: 'Dash Master',
    desc: 'Dodge distance +35% · perfect dodges refund the dodge cooldown',
    flavor: 'A step that ends before it begins.',
    icon: 'relic_dash_master',
    tint: '#a0e0ff',
    apply: () => { hero.dodgeDistMul *= 1.35; hero.perfectDodgeRefund = true; },
  },
  executioner: {
    id: 'executioner',
    name: 'Executioner',
    desc: '+50% dmg vs low-HP enemies',
    flavor: 'Mercy, for those already broken. One clean cut.',
    icon: 'relic_executioner',
    tint: '#d25555',
    apply: () => { hero.executeThreshold = Math.max(hero.executeThreshold, 0.40); hero.executeMul = 1.5; },
  },
  warlord: {
    id: 'warlord',
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
    name: 'Reaver',
    desc: '+15% lifesteal on crit',
    flavor: 'The wound breathes — so do you.',
    icon: 'relic_reaver',
    tint: '#ff6a8e',
    apply: () => { hero.lifesteal += 0.15; hero.critChance = Math.max(hero.critChance, 0.08); },
  },
  // ---------- EFFECT RELICS — synergies & spectacle ----------
  chain_lightning: {
    id: 'chain_lightning',
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
    name: 'Thunder Step',
    desc: 'Dodge leaves a damaging lightning trail',
    flavor: 'The air forgets to close behind her.',
    icon: 'relic_thunder_step',
    tint: '#e8ffff',
    tier: 'rare',
    apply: () => { hero.thunderStep = true; },
  },
  vampiric_aura: {
    id: 'vampiric_aura',
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
    name: 'Cataclysm',
    desc: 'Every 10th hit erupts the room',
    flavor: 'The last thing the last god held. He never set it down.',
    icon: 'relic_cataclysm',
    tint: '#ff9455',
    tier: 'mythic',
    apply: () => { hero.cataclysm = true; },
  },
  wanderers_cloak: {
    id: 'wanderers_cloak',
    name: "Wanderer's Cloak",
    desc: 'Dodge grants 2s of doubled attack speed',
    flavor: 'Whoever wears it was never where you last looked.',
    icon: 'relic_wanderers_cloak',
    tint: '#b4e8ff',
    tier: 'legendary',
    apply: () => { hero.wandererCloak = true; },
  },
  ethereal_binding: {
    id: 'ethereal_binding',
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
    name: 'Counterstrike',
    desc: 'Perfect dodge counter hits explode, dealing 2x damage',
    flavor: 'Patience is a blade. The swing is just the punctuation.',
    icon: 'relic_counterstrike',
    tint: '#ffeb99',
    tier: 'rare',
    apply: () => { hero.counterstrike = true; },
  },
  aegis_pulse: {
    id: 'aegis_pulse',
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
    name: 'Bloodrite',
    desc: '+15% damage while below 50% HP',
    flavor: 'Offer your own blood. The gods of Ethera listen.',
    icon: 'relic_bloodrite',
    tint: '#d85a5a',
    tier: 'common',
    apply: () => { hero.bloodrite = true; },
  },
  gale_step: {
    id: 'gale_step',
    name: 'Gale Step',
    desc: 'Dodge distance +35%',
    flavor: 'Ride the breath the ruin exhales between killings.',
    icon: 'relic_gale_step',
    tint: '#b0e8ff',
    tier: 'common',
    apply: () => { hero.dodgeDistMul *= 1.35; },
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
    name: 'Second Wind',
    desc: 'The first dodge in every room ignores cooldown',
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
    name: 'Oathshield',
    desc: 'After dodging, your next hit within 1s deals +50% damage',
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
    name: 'Gilded Hoard',
    desc: '+30% gold from all sources',
    flavor: 'The chalice never empties; it remembers what was poured.',
    icon: 'relic_gilded_hoard',
    tint: '#f4d9a0',
    tier: 'rare',
    apply: () => { hero.gildedHoard = true; hero.goldMul = (hero.goldMul || 1) * 1.3; },
  },
  // Ambient fire aura — passive DPS while moving through combat rooms.
  hymn_of_embers: {
    id: 'hymn_of_embers',
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
    name: 'Temporal Eye',
    desc: 'Perfect dodges trigger 0.35s of slow-motion',
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
    name: 'Whisper Veil',
    desc: 'For 0.5s after a dodge, your next hit is a guaranteed crit',
    flavor: 'She is the space the ruin forgot to fill.',
    icon: 'relic_whisper_veil',
    tint: '#8058c8',
    tier: 'legendary',
    apply: () => { hero.whisperVeil = true; hero.whisperVeilWindow = 0.5; },
  },
  // Periodic lightning — ambient offensive that scales with room density.
  stormcaller: {
    id: 'stormcaller',
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
    name: 'Hourglass of Respite',
    desc: 'At 30% HP or below, incoming damage is halved. Triggers once per minute.',
    flavor: 'The sand knows when to stop. The hand does not always obey.',
    icon: 'relic_hourglass',
    tint: '#e8c880',
    tier: 'common',
    apply: () => { hero.hourglassRespite = true; hero.hourglassReadyAt = 0; },
  },

  // ── WAND-THEMED RELICS (weaponOnly: 'wand') ──────────────────────────
  // Only roll into the offer pool when the player has the wand
  // equipped. Sword/dagger/hammer players won't see these in their
  // pedestal options — keeps offer relevance high regardless of weapon
  // choice. Synergize with the wand's pierce + charged-bolt mechanics
  // already shipped in projectiles.js + hero.js.

  splintered_light: {
    // Bolts split into two smaller bolts on first hit (wall or enemy).
    // Sub-bolts go at ±25° at 70% damage. Adds tactical AoE potential
    // — aim at a tight pack and the spread cleans up the survivors.
    id: 'splintered_light',
    name: 'Splintered Light',
    desc: 'Wand bolts split into two on first hit',
    flavor: 'The light remembered being many before it was taught to be one.',
    icon: 'relic_attack_speed',
    tint: '#c0a0ff',
    tier: 'rare',
    weaponOnly: 'wand',
    apply: () => { hero.boltSplit = true; },
  },

  storm_conduit: {
    // Bolt hit arcs lightning to the nearest enemy within 140px (1
    // chain). Reuses the existing spawnLightningArc from synergies.js
    // so the visual + audio are consistent with chain_lightning relic.
    // Damage on the chain is 50% of the bolt's damage — meaningful but
    // not the primary kill source.
    id: 'storm_conduit',
    name: 'Storm Conduit',
    desc: 'Bolt hits arc lightning to the nearest enemy',
    flavor: 'A weather she had once watched from a window.',
    icon: 'relic_stormcaller',
    tint: '#9adfff',
    tier: 'rare',
    weaponOnly: 'wand',
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
    name: 'Flicker Step',
    desc: 'Dagger doubles the perfect-dodge counter window',
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
    name: 'Patient Lens',
    desc: 'Charged wand shots crit · +50% damage',
    flavor: 'Sight does not hurry. The arrow that flies fastest is rarely seen.',
    icon: 'relic_eye_of_ether',
    tint: '#ffd680',
    tier: 'legendary',
    weaponOnly: 'wand',
    apply: () => { hero.boltCritOnCharge = true; },
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
  2: { common: 0.65, rare: 0.35, legendary: 0.0,  mythic: 0.0 },
  3: { common: 0.45, rare: 0.40, legendary: 0.15, mythic: 0.0 },
  4: { common: 0.28, rare: 0.44, legendary: 0.22, mythic: 0.06 },
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
  const pickFromTier = (t) => {
    const arr = availableByTier[t];
    if (!arr || !arr.length) return null;
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
    for (const t of tryOrder) {
      got = pickFromTier(t);
      if (got) break;
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
  recomputeThemeTiers(equipped);
  if (priorTiers && hero.activeThemes) {
    let firedResonance = false;
    let ascendedTheme = null;
    for (const k of Object.keys(hero.activeThemes)) {
      const before = priorTiers[k] | 0;
      const after = hero.activeThemes[k] | 0;
      if (before < 1 && after >= 1 && !firedResonance) {
        showTip('first_resonance');
        firedResonance = true;
      }
      if (before < 2 && after >= 2 && !ascendedTheme) {
        ascendedTheme = k;
      }
    }
    if (ascendedTheme) {
      // Ascendance is the player's 5-of-a-theme payoff. Fire a
      // dedicated tip per-theme so each theme's first ascendance
      // reads as a moment ("STORM ASCENDED", "FLAME ASCENDED",
      // etc.) — and only ONCE per theme via the firstSeen registry.
      const tipKey = `ascendance_${ascendedTheme}`;
      const themeName = (ascendedTheme[0].toUpperCase() + ascendedTheme.slice(1)).toUpperCase();
      // Inject into the live TIPS registry once per theme so each
      // ascendance reads as a moment with its own first-seen lock.
      try {
        TIPS[tipKey] = { text: `${themeName} ASCENDED — the fifth relic settles. The aura you carry deepens.` };
        showTip(tipKey);
      } catch (_e) {}
    }
  }
}
