# GameState — autoload singleton for state that survives scene
# transitions. Tracks session metrics + owned relics (the start of
# the run-loop progression system).
#
# Relic model (Iter 3 stub):
#   Each relic is a record in RELIC_REGISTRY keyed by id. Owned relics
#   are an array of ids on GameState. Damage/stat queries fold every
#   owned relic's bonuses into a single number — matches slime-depths'
#   approach in src/relics.js where hero.weaponDamageMul etc. is a
#   precomputed sum from all owned items.
#
# To add a relic:
#   1. Add an entry to RELIC_REGISTRY (id → name / description / mods)
#   2. Spawn a Pedestal with that relic_id somewhere in a scene
#   3. The hero auto-queries the bonus on attack/blast
extends Node

# ── Session metrics ──────────────────────────────────────────────────
# session_kills: accumulates across runs forever (lifetime counter).
# dungeon_runs: how many runs the player has STARTED (BEGIN pressed).
# last_run_kills: kills in the most recent run (resets on new run).
# best_run_kills: max last_run_kills across all runs (iter 23) — shown
#   on the main-menu stats panel. Updated at the START of each new run
#   by promoting the previous run's value, so death OR run-complete
#   both contribute (whichever flow ended the previous run).
var session_kills := 0
var dungeon_runs := 0
var last_run_kills := 0
var best_run_kills := 0

# HP carryover between rooms within a single floor run. -1 = no carry
# (Hero uses MAX_HP + max_hp_bonus on spawn). Set by Hero.gd's
# tree_exiting hook when leaving the dungeon scene alive; reset to -1
# by RunState.start_floor() / end_floor() so each new run begins fresh.
# Without this, every room transition would silently full-heal the
# player, defeating the multi-room difficulty curve.
var persisted_hp: int = -1

# ── Relic registry ───────────────────────────────────────────────────
# Modifier keys read by hero.gd:
#   sword_damage_bonus      (int)    added to LMB-swing damage
#   blast_damage_bonus      (int)    added to RMB-projectile damage
#   max_hp_bonus            (int)    added to Hero.MAX_HP at spawn
#   damage_taken_reduction  (int)    flat subtract from incoming damage
#   sword_cooldown_mul      (float)  multiplier delta on ATTACK_COOLDOWN
#   blast_cooldown_mul      (float)  multiplier delta on BLAST_COOLDOWN  (iter 17)
#   dodge_cooldown_mul      (float)  multiplier delta on DODGE_COOLDOWN
#   move_speed_mul          (float)  multiplier delta on SPEED
#   attack_range_mul        (float)  multiplier delta on ATTACK_RANGE  (iter 17)
#   knockback_force_mul     (float)  multiplier delta on melee + dash knockback  (iter 21)
#   dodge_iframes_bonus_f   (float)  extra seconds added to DODGE_IFRAMES  (iter 21)
#   projectile_speed_mul    (float)  multiplier delta on hero blast velocity  (iter 21)
#   attack_arc_mul          (float)  multiplier delta on ATTACK_ARC half-angle  (iter 21)
# Float-typed mods are folded via modifier_total_f (see below).
#
# Tier (iter 17): "common" / "rare" / "legendary". Drives the pedestal
# offer-roll weighting (commoners are likely in room 1, rares in room
# 2, legendaries gate to room 3) and future per-tier visual treatment.
#
# Triggered effects (iter 17 + iter 72) — relics whose effect can't be
# expressed (entirely) as a flat modifier. hero.gd checks has_relic(<id>)
# at the relevant beat. Listed for inventory clarity:
#   second_wind         revive once at 1 HP on the killing blow
#   bloodstone          heal +1 HP every 3 enemy kills
#   arcane_resonance    every 4th blast deals 2× damage
#   executioner         +150% damage to enemies below 25% HP
#   soul_burst          every 5th kill detonates an 80px AoE for 1 dmg
#   iron_resolve        first wound each room is absorbed
#   iron_fang           (iter 72) +1 sword dmg + every 6th hit drops ember burst
#   arcane_pulse        (iter 72) +1 blast dmg + every 5th cast forks bolt
#   stoneheart          (iter 72) +1 max HP + first kill each room heals +1
#   iron_skin           (iter 72) -1 dmg + deflect FX + every 4th block knocks back
const RELIC_REGISTRY := {
	# Iter 72 — IRON FANG redesign. +1 sword damage AS BEFORE, plus an
	# every-6th-hit ember burst at the impact point (40-px AoE for 1
	# damage, FLAME-orange ring visual). Mechanic + visual replaces the
	# old pure stat-stick — the ember burst is what a FLAME-themed
	# common relic should look like at-a-glance. Hero handler reads
	# the relic id with has_relic + a per-run _iron_fang_hit_counter
	# (mirrors _sword_hit_counter / _blast_counter pattern).
	"iron_fang": {
		"name": "IRON FANG",
		"description": "+1 sword damage. Every 6th sword hit detonates a small ember burst at the strike, scorching nearby enemies.",
		"tier": "common",
		"icon_path": "res://assets/icons/relic_damage.png",
		"mods": { "sword_damage_bonus": 1 },
		"themes": ["flame"],
	},
	# Iter 72 — ARCANE PULSE redesign. +1 blast damage AS BEFORE, plus an
	# every-5th-blast "arcane surge": that cast also forks a small
	# magenta-violet bolt to the nearest off-target enemy within 140px
	# for 1 damage. Visual: arcane_bolt FX (chain_arc grammar with a
	# distinct violet palette). The relic now COMPOSES with itself
	# (counter ticks every cast) rather than disappearing into the
	# damage line.
	"arcane_pulse": {
		"name": "ARCANE PULSE",
		"description": "+1 blast damage. Every 5th blast also forks a violet bolt to a nearby enemy.",
		"tier": "common",
		"icon_path": "res://assets/icons/relic_arcane_quiver.png",
		"mods": { "blast_damage_bonus": 1 },
		"themes": ["storm"],
	},
	# Iter 72 — STONEHEART redesign. +1 max HP AS BEFORE, plus a
	# first-kill-each-room emerald pulse around the hero that heals +1 HP
	# (capped). Reads as "the relic mends you on a kill" — visible, gated
	# on a per-room flag so it can't farm trivial heals from a long wave.
	# Independent of bloodstone (every-3rd-kill heal) so a player with
	# both gets: room kill 1 → stoneheart heal, kill 3 → bloodstone heal,
	# kill 6 → bloodstone, etc. Visible distinction in floater color.
	"stoneheart": {
		"name": "STONEHEART",
		"description": "+1 max HP. The first enemy felled each room sends a vital pulse — heal +1 HP.",
		"tier": "common",
		"icon_path": "res://assets/icons/relic_max_hp.png",
		"mods": { "max_hp_bonus": 1 },
		"themes": ["blood"],
	},
	# Iter 72 — IRON SKIN redesign. -1 incoming damage AS BEFORE, plus a
	# visible stone-shard deflect burst that fires every time the
	# reduction actually saves damage. Every 4th time the reduction
	# triggers, the hero also releases a 60-px shard-push that knocks
	# adjacent enemies away (no damage — purely defensive spacing tool).
	# Counter persists per-run (mirrors _sword_hit_counter pattern). The
	# new mechanic gives IRON SKIN a positional/defensive identity
	# distinct from iron_resolve (full first-hit absorb) and stalwart
	# (HP buffer + reduction).
	"iron_skin": {
		"name": "IRON SKIN",
		"description": "-1 incoming damage. Hits chip stone fragments off you. Every 4th deflection releases a shard-push that knocks back nearby enemies.",
		"tier": "common",
		"icon_path": "res://assets/icons/relic_ironhide.png",
		"mods": { "damage_taken_reduction": 1 },
		"themes": ["vow"],
	},
	"iron_will": {
		"name": "IRON WILL",
		"description": "Endure. +1 max HP, -1 incoming damage on the first hit each room.",
		"tier": "common",
		"icon_path": "res://assets/icons/relic_iron_greaves.png",
		"mods": { "max_hp_bonus": 1 },
		"themes": ["vow"],
	},
	"iron_grip": {
		"name": "IRON GRIP",
		"description": "Strikes shove harder. +25% knockback force.",
		"tier": "common",
		"icon_path": "res://assets/icons/relic_heavy_blow.png",
		"mods": { "knockback_force_mul": 0.25 },
		"themes": ["flame"],
	},
	"sturdy_step": {
		"name": "STURDY STEP",
		"description": "Steady on your feet. Dodge i-frames last +0.15s longer.",
		"tier": "common",
		"icon_path": "res://assets/icons/relic_iron_greaves.png",
		"mods": { "dodge_iframes_bonus_f": 0.15 },
		"themes": ["vow"],
	},
	"focused_eye": {
		"name": "FOCUSED EYE",
		"description": "Sharper casting. +1 blast damage, blast projectiles travel +20% faster.",
		"tier": "common",
		"icon_path": "res://assets/icons/relic_eye_of_ether.png",
		"mods": { "blast_damage_bonus": 1, "projectile_speed_mul": 0.2 },
		"themes": ["storm"],
	},
	# Iter 40 — new common BLOOD relic. Cheap entry into the BLOOD
	# theme so a player who finds 2 commons can hit BLOOD resonance
	# without legendary-tier picks.
	"lifestone": {
		"name": "LIFESTONE",
		"description": "A pulsing red gem fused to your heart. +1 max HP.",
		"tier": "common",
		"icon_path": "res://assets/icons/relic_bloodstone.png",
		"mods": { "max_hp_bonus": 1 },
		"themes": ["blood"],
	},
	"swift_strike": {
		"name": "SWIFT STRIKE",
		"description": "Sword cooldown -20%.",
		"tier": "rare",
		"icon_path": "res://assets/icons/relic_attack_speed.png",
		"mods": { "sword_cooldown_mul": -0.2 },
		"themes": ["flame"],
	},
	"dodge_master": {
		"name": "DODGE MASTER",
		"description": "Dodge cooldown -30%.",
		"tier": "rare",
		"icon_path": "res://assets/icons/relic_dodge.png",
		"mods": { "dodge_cooldown_mul": -0.3 },
		"themes": ["shadow"],
	},
	"nimble": {
		"name": "NIMBLE",
		"description": "Move speed +30%.",
		"tier": "rare",
		"icon_path": "res://assets/icons/relic_nimble_step.png",
		"mods": { "move_speed_mul": 0.3 },
		"themes": ["shadow"],
	},
	"swift_focus": {
		"name": "SWIFT FOCUS",
		"description": "Blast cooldown -30%. Cast faster.",
		"tier": "rare",
		"icon_path": "res://assets/icons/relic_swift_arm.png",
		"mods": { "blast_cooldown_mul": -0.3 },
		"themes": ["storm", "shadow"],
	},
	"long_reach": {
		"name": "LONG REACH",
		"description": "Sword swings reach +25% farther.",
		"tier": "rare",
		"icon_path": "res://assets/icons/relic_long_reach.png",
		"mods": { "attack_range_mul": 0.25 },
		"themes": ["flame"],
	},
	"arcane_quiver": {
		"name": "ARCANE QUIVER",
		"description": "Blast projectiles travel +30% faster.",
		"tier": "rare",
		"icon_path": "res://assets/icons/relic_arcane_quiver.png",
		"mods": { "projectile_speed_mul": 0.30 },
		"themes": ["storm"],
	},
	"wide_arc": {
		"name": "WIDE ARC",
		"description": "Sword swings cleave a +60% wider arc.",
		"tier": "rare",
		"icon_path": "res://assets/icons/relic_keen_edge.png",
		"mods": { "attack_arc_mul": 0.60 },
		"themes": ["flame"],
	},
	"stalwart": {
		"name": "STALWART",
		"description": "Stand your ground. +1 max HP, -1 incoming damage.",
		"tier": "rare",
		"icon_path": "res://assets/icons/relic_bulwark.png",
		"mods": { "max_hp_bonus": 1, "damage_taken_reduction": 1 },
		"themes": ["vow"],
	},
	"gale_step": {
		"name": "GALE STEP",
		"description": "Wind at your back. +20% move speed, +0.1s dodge i-frames.",
		"tier": "rare",
		"icon_path": "res://assets/icons/relic_gale_step.png",
		"mods": { "move_speed_mul": 0.2, "dodge_iframes_bonus_f": 0.1 },
		"themes": ["shadow"],
	},
	# Iter 40 — new rare VOW relic. Stronger VOW pick that gives both
	# the HP buffer AND the chip-damage reduction, so a stalwart-style
	# tank build is accessible at rare tier (not just legendary).
	"aegis_plate": {
		"name": "AEGIS PLATE",
		"description": "Lacquered armor of the old guard. +2 max HP, -1 incoming damage.",
		"tier": "rare",
		"icon_path": "res://assets/icons/relic_bulwark.png",
		"mods": { "max_hp_bonus": 2, "damage_taken_reduction": 1 },
		"themes": ["vow"],
	},
	# Iter 41 — projectile pipeline expansion. Adds two NEW modifier
	# keys (pierce_count, ricochet_count) read by hero._start_blast at
	# cast time and locked onto each spawned projectile.
	"piercing_quarrel": {
		"name": "PIERCING QUARREL",
		"description": "Blasts pass through 1 enemy before stopping.",
		"tier": "rare",
		"icon_path": "res://assets/icons/relic_long_reach.png",
		"mods": { "pierce_count": 1 },
		"themes": ["storm"],
	},
	"ricochet_talisman": {
		"name": "RICOCHET TALISMAN",
		"description": "Blasts ricochet to a nearby enemy after the first hit.",
		"tier": "rare",
		"icon_path": "res://assets/icons/relic_chain_lightning.png",
		"mods": { "ricochet_count": 1 },
		"themes": ["storm"],
	},
	# Iter 42 — multi-shot legendary. Doubles every blast into a spread
	# pair. Stacks with pierce_count + ricochet_count — a Twin Cast +
	# Piercing Quarrel + Ricochet Talisman build lays down 2 shots that
	# each pierce 1 enemy then bounce. Real bullet-hell density.
	"twin_cast": {
		"name": "TWIN CAST",
		"description": "Every blast fires two projectiles in a spread.",
		"tier": "legendary",
		"icon_path": "res://assets/icons/relic_echoing_strike.png",
		"mods": { "projectile_count": 1 },
		"themes": ["storm"],
	},
	# Iter 42 — crit chance entry-tier. Common so 2 picks can stack into
	# a 30% crit rate that still feels reliable. FLAME theme because
	# crits are flat damage amplification — the offense axis.
	"keen_focus": {
		"name": "KEEN FOCUS",
		"description": "+15% chance for hits to crit for 1.5× damage.",
		"tier": "common",
		"icon_path": "res://assets/icons/relic_eye_of_ether.png",
		"mods": { "crit_chance_f": 0.15 },
		"themes": ["flame"],
	},
	# Iter 42 — crit chance rare. Same mechanic, bigger stack. Stacks
	# multiplicatively with FLAME ascendance (fire pool on every kill)
	# because higher crit rate = more kills = more pools.
	"focused_strike": {
		"name": "FOCUSED STRIKE",
		"description": "+25% chance for hits to crit for 1.5× damage.",
		"tier": "rare",
		"icon_path": "res://assets/icons/relic_executioner.png",
		"mods": { "crit_chance_f": 0.25 },
		"themes": ["flame"],
	},
	# Iter 43 — burn DoT. New axis: applies a 1.6s burn (4 ticks of 1
	# damage @ 0.4s each) on hit. Compounds with FLAME ascendance fire
	# pools (pools damage in-zone; burns damage the moving enemies).
	# A FLAME-ascendant player with this relic chains: hit → burn ticks +
	# pool stands → kill → pool drops → next mob enters → repeat.
	"embers_of_ruin": {
		"name": "EMBERS OF RUIN",
		"description": "+25% chance for hits to ignite enemies. Burning enemies take 1 damage every 0.4s for 1.6s.",
		"tier": "rare",
		"icon_path": "res://assets/icons/relic_pyromancer.png",
		"mods": { "burn_chance_f": 0.25 },
		"themes": ["flame"],
	},
	# Iter 44 — lifesteal on kill. Independent of bloodstone (every-3rd
	# kill flat heal) so the two stack naturally: a player with both gets
	# bloodstone's deterministic regen + chance for extra heals on top.
	# Drinking Edge is dual-themed (BLOOD primary for the regen role,
	# FLAME secondary because it ALSO requires aggression to trigger).
	"drinking_edge": {
		"name": "DRINKING EDGE",
		"description": "+15% chance to heal 1 HP on enemy kill.",
		"tier": "rare",
		"icon_path": "res://assets/icons/relic_bloodstone.png",
		"mods": { "lifesteal_chance_f": 0.15 },
		"themes": ["blood", "flame"],
	},
	# Iter 44 — legendary lifesteal. Higher rate, BLOOD-only theme.
	# Pairs perfectly with executioner (kills below 25% HP) + crit
	# stacks (low-HP enemies one-shot more often → more kills).
	"crimson_hunger": {
		"name": "CRIMSON HUNGER",
		"description": "+30% chance to heal 1 HP on enemy kill. Vampiric tendrils stitch wounds shut.",
		"tier": "legendary",
		"icon_path": "res://assets/icons/relic_bloodstone.png",
		"mods": { "lifesteal_chance_f": 0.30 },
		"themes": ["blood"],
	},
	# Iter 45 — chance-based kill explosion. Drives the bullet-hell
	# chain-reaction loop: an exploding kill damages nearby enemies,
	# which may themselves explode, etc. Pair with executioner (+150%
	# damage to <25% HP enemies) and the chain death-cascade can clear
	# a wave from a single 1-shot kill on a wounded mob.
	"combustion_core": {
		"name": "COMBUSTION CORE",
		"description": "+20% chance for kills to detonate a 72-px AoE for 2 damage.",
		"tier": "rare",
		"icon_path": "res://assets/icons/relic_pyromancer.png",
		"mods": { "explode_on_kill_chance_f": 0.20 },
		"themes": ["flame"],
	},
	"detonator": {
		"name": "DETONATOR",
		"description": "+40% chance for kills to detonate a 72-px AoE for 2 damage. The brood remembers fire.",
		"tier": "legendary",
		"icon_path": "res://assets/icons/relic_cataclysm.png",
		"mods": { "explode_on_kill_chance_f": 0.40 },
		"themes": ["flame"],
	},
	# Iter 45 — dual-theme STORM/SHADOW relic. Cheap entry into BOTH
	# themes simultaneously, so one pick contributes to two resonance
	# tallies. Pairs naturally — both themes favor mobility + procs.
	"tempest_cloak": {
		"name": "TEMPEST CLOAK",
		"description": "Wind and lightning answer your call. +10% move speed, +0.05s dodge i-frames, +10% projectile speed.",
		"tier": "rare",
		"icon_path": "res://assets/icons/relic_gale_step.png",
		"mods": {
			"move_speed_mul": 0.10,
			"dodge_iframes_bonus_f": 0.05,
			"projectile_speed_mul": 0.10,
		},
		"themes": ["storm", "shadow"],
	},
	# Iter 46 — STORM slow debuff. Rare entry tier. Paired with chain
	# bolt / multi-shot / pierce / ricochet, slow stacks the chase
	# tempo against the enemy: they move at 55% speed for 1.4s while
	# you cleave + arc bolts. Anti-aggro positioning tool.
	"frost_pulse": {
		"name": "FROST PULSE",
		"description": "+30% chance for hits to slow enemies (55% speed for 1.4s).",
		"tier": "rare",
		"icon_path": "res://assets/icons/relic_chain_lightning.png",
		"mods": { "slow_chance_f": 0.30 },
		"themes": ["storm"],
	},
	# Iter 46 — STORM slow legendary. Higher rate + an HP buffer so
	# the player doesn't have to glass-cannon for the slow build. The
	# +max HP tag also gates a bit of synergy with BLOOD (a player
	# who picks this AND any 1 BLOOD relic gets BLOOD resonance from
	# the dual benefits even though the relic itself is mono-themed).
	"glacial_resonance": {
		"name": "GLACIAL RESONANCE",
		"description": "+50% chance for hits to slow enemies. +1 max HP. The cold seeps into your bones.",
		"tier": "legendary",
		"icon_path": "res://assets/icons/relic_echoing_strike.png",
		"mods": { "slow_chance_f": 0.50, "max_hp_bonus": 1 },
		"themes": ["storm"],
	},
	# Iter 50 — MYTHIC tier (4th rarity). Each one stacks multiple
	# axes of an existing build to a run-defining degree. Rolls only
	# on floor 2 (rooms 4-6) at 2-6% per offer. With 35 other relics
	# in the pool a player might see one mythic per 3-5 runs — they
	# stay as the chase prize that defines a memorable run.
	"cataclysm": {
		"name": "CATACLYSM",
		"description": "+50% chance for kills to detonate a 72-px AoE for 2 damage. +25% chance for hits to ignite. The dungeon answers your hunger.",
		"tier": "mythic",
		"icon_path": "res://assets/icons/relic_cataclysm.png",
		"mods": { "explode_on_kill_chance_f": 0.50, "burn_chance_f": 0.25 },
		"themes": ["flame"],
	},
	"eye_of_ether": {
		"name": "EYE OF ETHER",
		"description": "Blasts pierce 2, ricochet 2, and fire 1 extra projectile. The arcane sees through everything.",
		"tier": "mythic",
		"icon_path": "res://assets/icons/relic_eye_of_ether.png",
		"mods": { "pierce_count": 2, "ricochet_count": 2, "projectile_count": 1 },
		"themes": ["storm"],
	},
	"soul_reaver": {
		"name": "SOUL REAVER",
		"description": "+40% chance to heal 1 HP on kill. +2 max HP. +20% chance for hits to crit. Each life feeds the next.",
		"tier": "mythic",
		"icon_path": "res://assets/icons/relic_bloodstone.png",
		"mods": { "lifesteal_chance_f": 0.40, "max_hp_bonus": 2, "crit_chance_f": 0.20 },
		"themes": ["blood"],
	},
	"phantom_step": {
		"name": "PHANTOM STEP",
		"description": "+50% move speed. -40% dodge cooldown. +0.15s dodge i-frames. You move between heartbeats.",
		"tier": "mythic",
		"icon_path": "res://assets/icons/relic_nimble_step.png",
		"mods": {
			"move_speed_mul": 0.50,
			"dodge_cooldown_mul": -0.40,
			"dodge_iframes_bonus_f": 0.15,
		},
		"themes": ["shadow"],
	},
	# Iter 56 — familiar pet relics. Drive familiar_count modifier
	# which main.gd._sync_familiars reads to spawn / despawn wisps
	# that orbit the hero and auto-fire at nearby enemies. Pairs
	# perfectly with the STORM bullet-hell direction: hero swings +
	# chains arcs + multi-shot blasts + 1-3 familiars also fire =
	# full screen coverage.
	"wisp_companion": {
		"name": "WISP COMPANION",
		"description": "A glowing wisp orbits you and fires bolts at nearby enemies.",
		"tier": "rare",
		"icon_path": "res://assets/icons/relic_chain_lightning.png",
		"mods": { "familiar_count": 1 },
		"themes": ["storm"],
	},
	"phantom_squad": {
		"name": "PHANTOM SQUAD",
		"description": "Two more wisps join the orbit. Three lightning-bolts seek alongside you.",
		"tier": "legendary",
		"icon_path": "res://assets/icons/relic_echoing_strike.png",
		"mods": { "familiar_count": 2 },
		"themes": ["storm"],
	},
	"heart_of_stone": {
		"name": "HEART OF STONE",
		"description": "+2 max HP.",
		"tier": "legendary",
		"icon_path": "res://assets/icons/relic_max_hp.png",
		"mods": { "max_hp_bonus": 2 },
		"themes": ["blood"],
	},
	"boots_of_haste": {
		"name": "BOOTS OF HASTE",
		"description": "Move speed +60%. The dungeon blurs by.",
		"tier": "legendary",
		"icon_path": "res://assets/icons/relic_nimble_step.png",
		"mods": { "move_speed_mul": 0.6 },
		"themes": ["shadow"],
	},
	"second_wind": {
		"name": "SECOND WIND",
		"description": "Once per run, a killing blow leaves you at 1 HP instead.",
		"tier": "legendary",
		"icon_path": "res://assets/icons/relic_second_wind.png",
		"mods": {},   # triggered — see hero.take_damage
		"themes": ["blood"],
	},
	"bloodstone": {
		"name": "BLOODSTONE",
		"description": "Every 3rd enemy slain heals 1 HP.",
		"tier": "legendary",
		"icon_path": "res://assets/icons/relic_bloodstone.png",
		"mods": {},   # triggered — see hero._on_enemy_died_for_relics
		"themes": ["blood"],
	},
	"arcane_resonance": {
		"name": "ARCANE RESONANCE",
		"description": "Every 4th blast strikes for double.",
		"tier": "legendary",
		"icon_path": "res://assets/icons/relic_echoing_strike.png",
		"mods": {},   # triggered — see hero._start_blast
		"themes": ["storm"],
	},
	"chain_lightning": {
		"name": "CHAIN LIGHTNING",
		"description": "Every 4th sword hit arcs to a 2nd enemy nearby.",
		"tier": "legendary",
		"icon_path": "res://assets/icons/relic_chain_lightning.png",
		"mods": {},   # triggered — see hero._resolve_melee_strike
		"themes": ["storm"],
	},
	"phoenix_feather": {
		"name": "PHOENIX FEATHER",
		"description": "Once per run, a killing blow restores you to FULL HP.",
		"tier": "legendary",
		"icon_path": "res://assets/icons/relic_phoenix.png",
		"mods": {},   # triggered — see hero.take_damage (preempts second_wind)
		"themes": ["blood"],
	},
	"executioner": {
		"name": "EXECUTIONER",
		"description": "+150% damage to enemies below 25% HP.",
		"tier": "legendary",
		"icon_path": "res://assets/icons/relic_executioner.png",
		"mods": {},   # triggered — see hero._resolve_melee_strike / _resolve_dash_strike_hit / projectile.gd
		"themes": ["flame"],
	},
	"soul_burst": {
		"name": "SOUL BURST",
		"description": "Every 5th enemy slain detonates a small soul burst.",
		"tier": "legendary",
		"icon_path": "res://assets/icons/relic_soul_burst.png",
		"mods": {},   # triggered — see hero._on_enemy_died_for_relics
		"themes": ["flame"],
	},
	"iron_resolve": {
		"name": "IRON RESOLVE",
		"description": "The first wound each room is fully absorbed.",
		"tier": "legendary",
		"icon_path": "res://assets/icons/relic_iron_resolve.png",
		"mods": {},   # triggered — see hero.take_damage
		"themes": ["vow"],
	},
}

var owned_relics: Array[String] = []

# Iter 33 — shrine grants. Permanent (within-run) stat bonuses from
# Shrine Of Vows prayer rooms. Stacks WITH relic modifiers via
# modifier_total / modifier_total_f (both sum shrine_bonuses[key]
# into their relic-side total). Cleared on start_dungeon_run so
# bonuses don't carry across runs.
#
# Key naming matches the relic modifier convention (e.g.
# "max_hp_bonus", "melee_damage_bonus", "dodge_cd_mul_f") so callers
# don't need to know about shrines specifically — they just read the
# combined modifier_total and shrine values participate transparently.
var shrine_bonuses: Dictionary = {}

func grant_shrine_bonus(key: String, value) -> void:
	var current = shrine_bonuses.get(key, 0)
	shrine_bonuses[key] = current + value

# Iter 57 — achievements. Persistent across runs (save_to_dict
# includes unlocked_achievements). Tracks milestones that the player
# accomplishes across all play sessions, giving long-term goals
# beyond the per-run roguelite loop.
#
# Registry maps id → {name, description}. Adding a new achievement
# is a single entry here + the corresponding unlock check at the
# emit site (kill counter / combo / boss death / etc).
#
# Achievements never UN-lock — once granted, they persist forever
# (until the save file is deleted). The unlock_achievement helper
# guards against re-firing and emits Events.achievement_unlocked
# so the HUD popup banner can show.
const ACHIEVEMENTS := {
	"first_blood": {
		"name": "FIRST BLOOD",
		"description": "Slay your first enemy.",
	},
	"centurion": {
		"name": "CENTURION",
		"description": "Slay 100 enemies in a single run.",
	},
	"hot_streak": {
		"name": "HOT STREAK",
		"description": "Reach a 50-hit combo.",
	},
	"perfect_streak": {
		"name": "PERFECT STREAK",
		"description": "Reach a 100-hit combo.",
	},
	"mythic_find": {
		"name": "MYTHIC FIND",
		"description": "Claim a mythic-tier relic.",
	},
	"phase_3_survivor": {
		"name": "PHASE 3 SURVIVOR",
		"description": "Witness a boss enter phase 3.",
	},
	"iron_revenant_slain": {
		"name": "IRON CRYPT CLEARED",
		"description": "Defeat the Iron Revenant.",
	},
	"broodmother_slain": {
		"name": "QUEEN OF SPIDERS",
		"description": "Defeat the Broodmother.",
	},
	"flame_devotee": {
		"name": "FLAME DEVOTEE",
		"description": "Own 4 FLAME relics in one run.",
	},
	"storm_devotee": {
		"name": "STORM DEVOTEE",
		"description": "Own 4 STORM relics in one run.",
	},
	"blood_devotee": {
		"name": "BLOOD DEVOTEE",
		"description": "Own 4 BLOOD relics in one run.",
	},
	"vow_devotee": {
		"name": "VOW DEVOTEE",
		"description": "Own 4 VOW relics in one run.",
	},
	"shadow_devotee": {
		"name": "SHADOW DEVOTEE",
		"description": "Own 4 SHADOW relics in one run.",
	},
}

var unlocked_achievements: Array[String] = []

# Idempotent — re-fire is a silent no-op. Emits the unlock event +
# saves immediately so a crash after unlock doesn't lose the
# achievement. Returns true if this call actually unlocked it.
func unlock_achievement(id: String) -> bool:
	if not ACHIEVEMENTS.has(id):
		return false
	if id in unlocked_achievements:
		return false
	unlocked_achievements.append(id)
	Events.achievement_unlocked.emit(id)
	# Save immediately so the unlock persists even if the game crashes.
	if Engine.get_main_loop().root.has_node("/root/SaveSystem"):
		var ss = Engine.get_main_loop().root.get_node("/root/SaveSystem")
		if ss.has_method("save_now"):
			ss.save_now()
	return true

# Helper for the theme-devotee achievements — checks current count.
func _check_theme_devotee_achievements() -> void:
	var theme_to_id: Dictionary = {
		"flame": "flame_devotee",
		"storm": "storm_devotee",
		"blood": "blood_devotee",
		"vow": "vow_devotee",
		"shadow": "shadow_devotee",
	}
	for theme in theme_to_id.keys():
		if theme_count(theme) >= 4:
			unlock_achievement(theme_to_id[theme])

# Iter 39 — theme tagging + resonance. Each relic in RELIC_REGISTRY
# carries a "themes" array (one or two strings from STORM / FLAME /
# BLOOD / VOW / SHADOW). Owning N relics of a theme unlocks tiered
# bonuses:
#   tier 1 (RESONANCE)  — 2+ owned: small stat fold (handled in
#                         modifier_total via theme_stat_bonuses)
#   tier 2 (ASCENDANCE) — 4+ owned: mechanical flavor (e.g. STORM
#                         fires a mini-bolt on every Nth swing —
#                         hooked in hero.gd via theme_tier checks)
#
# theme_count tallies the player's currently-owned relics that
# include `theme` in their themes array. Used by HUD chips, by the
# resonance/ascendance gates in hero.gd, and by modifier_total's
# theme_stat_bonuses fold.
const RESONANCE_THRESHOLD: int = 2
const ASCENDANCE_THRESHOLD: int = 4

func theme_count(theme: String) -> int:
	var n: int = 0
	for rid in owned_relics:
		var info: Dictionary = RELIC_REGISTRY.get(rid, {})
		var themes: Array = info.get("themes", [])
		if theme in themes:
			n += 1
	return n

# Returns 0 (none), 1 (resonance, ≥2 owned), or 2 (ascendance, ≥4
# owned). Used by HUD + by hero.gd's combat hooks to gate the
# mechanical flavor (ascendance) effects.
func theme_tier(theme: String) -> int:
	var n: int = theme_count(theme)
	if n >= ASCENDANCE_THRESHOLD:
		return 2
	if n >= RESONANCE_THRESHOLD:
		return 1
	return 0

# Per-theme resonance bonuses. Returns a Dictionary of modifier_key →
# value to fold into modifier_total / modifier_total_f.
# Resonance bonus (≥2 owned):
#   STORM   +1 blast damage
#   FLAME   +1 sword damage
#   BLOOD   +1 max HP
#   VOW     +1 damage taken reduction on first hit each room
#           (stacks with iron_will's first-hit, applies to ALL
#           VOW owners — flat folded as 1 incoming dmg reduction).
#   SHADOW  +0.08s dodge i-frames
# Ascendance (≥4 owned) bonuses are mechanical effects, handled by
# hero.gd / projectile.gd hooks; this function only returns the
# stat-fold contributions.
func theme_stat_bonuses() -> Dictionary:
	var out: Dictionary = {}
	if theme_tier("storm") >= 1:
		out["blast_damage_bonus"] = int(out.get("blast_damage_bonus", 0)) + 1
	if theme_tier("flame") >= 1:
		out["sword_damage_bonus"] = int(out.get("sword_damage_bonus", 0)) + 1
	if theme_tier("blood") >= 1:
		out["max_hp_bonus"] = int(out.get("max_hp_bonus", 0)) + 1
	if theme_tier("vow") >= 1:
		out["damage_taken_reduction"] = int(out.get("damage_taken_reduction", 0)) + 1
	if theme_tier("shadow") >= 1:
		out["dodge_iframes_bonus_f"] = float(out.get("dodge_iframes_bonus_f", 0.0)) + 0.08
	return out

# Helper for HUD: returns the active themes (tier >= 1) keyed to
# their tier so the chip strip can render them in display order
# without re-counting.
func active_themes() -> Dictionary:
	var out: Dictionary = {}
	for theme in ["storm", "flame", "blood", "vow", "shadow"]:
		var t: int = theme_tier(theme)
		if t > 0:
			out[theme] = t
	return out

# ── Persisted settings ───────────────────────────────────────────────
# Master audio volume in linear 0..1 space. Source-of-truth for the
# settings slider; the slider seeds itself from this value on open and
# writes back through SaveSystem on change. Audio.set_master_volume()
# is the consumer (converts to dB for the Master bus).
var master_volume: float = 0.7

# ── Save / load serialization ────────────────────────────────────────
# Round-tripped through SaveSystem (user://ethera_save.json). Versioned
# so future schema changes can be migrated rather than dropped. Keep
# this dict flat — JSON tolerates nesting fine, but a flat shape is
# easiest to diff in a text editor when debugging save files.
func save_to_dict() -> Dictionary:
	return {
		"save_version": 3,   # iter 57 — added unlocked_achievements
		"owned_relics": owned_relics,
		"session_kills": session_kills,
		"dungeon_runs": dungeon_runs,
		"last_run_kills": last_run_kills,
		"best_run_kills": best_run_kills,
		"master_volume": master_volume,
		"unlocked_achievements": unlocked_achievements,
	}

# Tolerant loader: every field has a default, missing keys are ignored,
# wrong-type values fall back to defaults. This is the forward-compat
# contract for older save files (e.g. a v0 file with no master_volume
# still loads, just keeps the default volume). JSON round-trips ints
# as floats, so we coerce numeric fields back to int explicitly.
func load_from_dict(d: Dictionary) -> void:
	session_kills = int(d.get("session_kills", 0))
	dungeon_runs = int(d.get("dungeon_runs", 0))
	last_run_kills = int(d.get("last_run_kills", 0))
	# best_run_kills (iter 23) — defaults to last_run_kills when missing
	# (v1 save files), so an old save loaded into v2 gets a reasonable
	# starting "best" instead of 0.
	best_run_kills = int(d.get("best_run_kills", last_run_kills))
	master_volume = clampf(float(d.get("master_volume", 0.7)), 0.0, 1.0)

	# Array[String] needs a fresh typed array — JSON returns a plain
	# Array (no element typing) so we rebuild element-by-element and
	# skip anything that isn't actually a string. Defensive against a
	# user hand-editing the save file and putting garbage in here.
	var loaded_relics: Variant = d.get("owned_relics", [])
	var fresh: Array[String] = []
	if loaded_relics is Array:
		for rid in loaded_relics:
			if rid is String:
				fresh.append(rid)
	owned_relics = fresh
	# Iter 57 — load achievements. Same tolerant pattern as owned_relics:
	# typed Array[String] rebuild element-by-element, skip garbage.
	# Missing key on older save files → empty array (no unlocks yet),
	# graceful first-time-with-new-version upgrade.
	var loaded_achievements: Variant = d.get("unlocked_achievements", [])
	var fresh_ach: Array[String] = []
	if loaded_achievements is Array:
		for ach in loaded_achievements:
			if ach is String and ACHIEVEMENTS.has(ach):
				fresh_ach.append(ach)
	unlocked_achievements = fresh_ach

# ── Session API ──────────────────────────────────────────────────────
func start_dungeon_run() -> void:
	# Iter 23 — promote the PREVIOUS run's kill count to best_run_kills
	# BEFORE resetting last_run_kills. Captures both flows (death → menu
	# → BEGIN, and run-complete → menu → BEGIN) without requiring an
	# explicit end-run hook.
	if last_run_kills > best_run_kills:
		best_run_kills = last_run_kills
	dungeon_runs += 1
	last_run_kills = 0
	# Iter 16 bug fix: roguelite contract — a new run starts with no
	# relics. Previously owned_relics was never cleared, so relics from
	# the first run persisted into the second (and third, and fourth…),
	# defeating the choose-3-of-N decision loop. SaveSystem still
	# persists the array between sessions, but a fresh run wipes it.
	# Long-term metaprogression (true persistent unlocks) would live in
	# a separate field.
	owned_relics = []
	shrine_bonuses = {}            # iter 33 — clear stat grants from prior run
	persisted_hp = -1
	# Reset HP carryover too — without this, a quit-mid-run could leave
	# persisted_hp populated and the next run's hero would spawn at the
	# saved HP value instead of full health.

func register_run_kill() -> void:
	last_run_kills += 1
	session_kills += 1
	# Iter 57 — kill-based achievement checks.
	if last_run_kills == 1:
		unlock_achievement("first_blood")
	if last_run_kills >= 100:
		unlock_achievement("centurion")

# Back-compat for hamlet's existing call.
func register_kill() -> void:
	session_kills += 1

# ── Relic API ────────────────────────────────────────────────────────
func has_relic(id: String) -> bool:
	return id in owned_relics

func grant_relic(id: String) -> bool:
	if has_relic(id):
		return false
	if not RELIC_REGISTRY.has(id):
		push_warning("GameState.grant_relic: unknown id '%s'" % id)
		return false
	owned_relics.append(id)
	# Iter 57 — achievement triggers tied to relic grant.
	# Mythic find: any mythic-tier relic claimed unlocks the achievement.
	# Theme devotee: 4+ owned of a single theme.
	var info: Dictionary = RELIC_REGISTRY.get(id, {})
	if str(info.get("tier", "common")) == "mythic":
		unlock_achievement("mythic_find")
	_check_theme_devotee_achievements()
	return true

func relic_info(id: String) -> Dictionary:
	return RELIC_REGISTRY.get(id, {})

# Sum a modifier across all owned relics. Pass the modifier key
# (e.g. "sword_damage_bonus") and the default if no relic adds to it.
func modifier_total(key: String, default_value: int = 0) -> int:
	var total := default_value
	for rid in owned_relics:
		var info: Dictionary = RELIC_REGISTRY.get(rid, {})
		var mods: Dictionary = info.get("mods", {})
		total += int(mods.get(key, 0))
	# Iter 33 — fold shrine grants into the same total so callers
	# don't need a parallel API.
	total += int(shrine_bonuses.get(key, 0))
	# Iter 39 — fold theme resonance bonuses. theme_stat_bonuses()
	# computes the active resonance contributions once per call;
	# downstream consumers (hero.gd, projectile.gd) see one combined
	# total without needing to know about themes.
	var theme_bonuses: Dictionary = theme_stat_bonuses()
	total += int(theme_bonuses.get(key, 0))
	return total

# Float variant for fractional mods (e.g. -0.2 cooldown, +0.3 speed).
# Int casting in modifier_total would silently round these to 0, which
# is why this lives as a separate helper rather than a single overload.
func modifier_total_f(key: String, default_value: float = 0.0) -> float:
	var total := default_value
	for rid in owned_relics:
		var info: Dictionary = RELIC_REGISTRY.get(rid, {})
		var mods: Dictionary = info.get("mods", {})
		total += float(mods.get(key, 0.0))
	total += float(shrine_bonuses.get(key, 0.0))
	var theme_bonuses: Dictionary = theme_stat_bonuses()
	total += float(theme_bonuses.get(key, 0.0))
	return total
