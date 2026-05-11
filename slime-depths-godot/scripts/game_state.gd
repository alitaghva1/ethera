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
# Triggered effects (iter 17) — relics whose effect can't be expressed
# as a flat modifier. The mods dict is empty; hero.gd checks
# GameState.has_relic(<id>) at the relevant beat. Listed for inventory
# clarity:
#   second_wind         revive once at 1 HP on the killing blow
#   bloodstone          heal +1 HP every 3 enemy kills
#   arcane_resonance    every 4th blast deals 2× damage
#   executioner         +150% damage to enemies below 25% HP
#   soul_burst          every 5th kill detonates an 80px AoE for 1 dmg
#   iron_resolve        first wound each room is absorbed
const RELIC_REGISTRY := {
	"iron_fang": {
		"name": "IRON FANG",
		"description": "Your sword hits harder. +1 sword damage.",
		"tier": "common",
		"mods": { "sword_damage_bonus": 1 },
	},
	"arcane_pulse": {
		"name": "ARCANE PULSE",
		"description": "Each blast strikes twice as hard. +1 blast damage.",
		"tier": "common",
		"mods": { "blast_damage_bonus": 1 },
	},
	"stoneheart": {
		"name": "STONEHEART",
		"description": "Bear another wound. +1 max HP.",
		"tier": "common",
		"mods": { "max_hp_bonus": 1 },
	},
	"iron_skin": {
		"name": "IRON SKIN",
		"description": "Take 1 less damage per hit.",
		"tier": "common",
		"mods": { "damage_taken_reduction": 1 },
	},
	"iron_will": {
		"name": "IRON WILL",
		"description": "Endure. +1 max HP, -1 incoming damage on the first hit each room.",
		"tier": "common",
		"mods": { "max_hp_bonus": 1 },
	},
	"iron_grip": {
		"name": "IRON GRIP",
		"description": "Strikes shove harder. +25% knockback force.",
		"tier": "common",
		"mods": { "knockback_force_mul": 0.25 },
	},
	"sturdy_step": {
		"name": "STURDY STEP",
		"description": "Steady on your feet. Dodge i-frames last +0.15s longer.",
		"tier": "common",
		"mods": { "dodge_iframes_bonus_f": 0.15 },
	},
	"focused_eye": {
		"name": "FOCUSED EYE",
		"description": "Sharper casting. +1 blast damage, blast projectiles travel +20% faster.",
		"tier": "common",
		"mods": { "blast_damage_bonus": 1, "projectile_speed_mul": 0.2 },
	},
	"swift_strike": {
		"name": "SWIFT STRIKE",
		"description": "Sword cooldown -20%.",
		"tier": "rare",
		"mods": { "sword_cooldown_mul": -0.2 },
	},
	"dodge_master": {
		"name": "DODGE MASTER",
		"description": "Dodge cooldown -30%.",
		"tier": "rare",
		"mods": { "dodge_cooldown_mul": -0.3 },
	},
	"nimble": {
		"name": "NIMBLE",
		"description": "Move speed +30%.",
		"tier": "rare",
		"mods": { "move_speed_mul": 0.3 },
	},
	"swift_focus": {
		"name": "SWIFT FOCUS",
		"description": "Blast cooldown -30%. Cast faster.",
		"tier": "rare",
		"mods": { "blast_cooldown_mul": -0.3 },
	},
	"long_reach": {
		"name": "LONG REACH",
		"description": "Sword swings reach +25% farther.",
		"tier": "rare",
		"mods": { "attack_range_mul": 0.25 },
	},
	"arcane_quiver": {
		"name": "ARCANE QUIVER",
		"description": "Blast projectiles travel +30% faster.",
		"tier": "rare",
		"mods": { "projectile_speed_mul": 0.30 },
	},
	"wide_arc": {
		"name": "WIDE ARC",
		"description": "Sword swings cleave a +60% wider arc.",
		"tier": "rare",
		"mods": { "attack_arc_mul": 0.60 },
	},
	"stalwart": {
		"name": "STALWART",
		"description": "Stand your ground. +1 max HP, -1 incoming damage.",
		"tier": "rare",
		"mods": { "max_hp_bonus": 1, "damage_taken_reduction": 1 },
	},
	"gale_step": {
		"name": "GALE STEP",
		"description": "Wind at your back. +20% move speed, +0.1s dodge i-frames.",
		"tier": "rare",
		"mods": { "move_speed_mul": 0.2, "dodge_iframes_bonus_f": 0.1 },
	},
	"heart_of_stone": {
		"name": "HEART OF STONE",
		"description": "+2 max HP.",
		"tier": "legendary",
		"mods": { "max_hp_bonus": 2 },
	},
	"boots_of_haste": {
		"name": "BOOTS OF HASTE",
		"description": "Move speed +60%. The dungeon blurs by.",
		"tier": "legendary",
		"mods": { "move_speed_mul": 0.6 },
	},
	"second_wind": {
		"name": "SECOND WIND",
		"description": "Once per run, a killing blow leaves you at 1 HP instead.",
		"tier": "legendary",
		"mods": {},   # triggered — see hero.take_damage
	},
	"bloodstone": {
		"name": "BLOODSTONE",
		"description": "Every 3rd enemy slain heals 1 HP.",
		"tier": "legendary",
		"mods": {},   # triggered — see hero._on_enemy_died_for_relics
	},
	"arcane_resonance": {
		"name": "ARCANE RESONANCE",
		"description": "Every 4th blast strikes for double.",
		"tier": "legendary",
		"mods": {},   # triggered — see hero._start_blast
	},
	"chain_lightning": {
		"name": "CHAIN LIGHTNING",
		"description": "Every 4th sword hit arcs to a 2nd enemy nearby.",
		"tier": "legendary",
		"mods": {},   # triggered — see hero._resolve_melee_strike
	},
	"phoenix_feather": {
		"name": "PHOENIX FEATHER",
		"description": "Once per run, a killing blow restores you to FULL HP.",
		"tier": "legendary",
		"mods": {},   # triggered — see hero.take_damage (preempts second_wind)
	},
	"executioner": {
		"name": "EXECUTIONER",
		"description": "+150% damage to enemies below 25% HP.",
		"tier": "legendary",
		"mods": {},   # triggered — see hero._resolve_melee_strike / _resolve_dash_strike_hit / projectile.gd
	},
	"soul_burst": {
		"name": "SOUL BURST",
		"description": "Every 5th enemy slain detonates a small soul burst.",
		"tier": "legendary",
		"mods": {},   # triggered — see hero._on_enemy_died_for_relics
	},
	"iron_resolve": {
		"name": "IRON RESOLVE",
		"description": "The first wound each room is fully absorbed.",
		"tier": "legendary",
		"mods": {},   # triggered — see hero.take_damage
	},
}

var owned_relics: Array[String] = []

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
		"save_version": 2,
		"owned_relics": owned_relics,
		"session_kills": session_kills,
		"dungeon_runs": dungeon_runs,
		"last_run_kills": last_run_kills,
		"best_run_kills": best_run_kills,
		"master_volume": master_volume,
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
	persisted_hp = -1
	# Reset HP carryover too — without this, a quit-mid-run could leave
	# persisted_hp populated and the next run's hero would spawn at the
	# saved HP value instead of full health.

func register_run_kill() -> void:
	last_run_kills += 1
	session_kills += 1

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
	return total
