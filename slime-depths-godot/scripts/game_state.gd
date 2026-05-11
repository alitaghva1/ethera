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
var session_kills := 0
var dungeon_runs := 0
var last_run_kills := 0

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
#   dodge_cooldown_mul      (float)  multiplier delta on DODGE_COOLDOWN
#   move_speed_mul          (float)  multiplier delta on SPEED
# Float-typed mods are folded via modifier_total_f (see below).
const RELIC_REGISTRY := {
	"iron_fang": {
		"name": "IRON FANG",
		"description": "Your sword hits harder. +1 sword damage.",
		"mods": { "sword_damage_bonus": 1 },
	},
	"arcane_pulse": {
		"name": "ARCANE PULSE",
		"description": "Each blast strikes twice as hard. +1 blast damage.",
		"mods": { "blast_damage_bonus": 1 },
	},
	"stoneheart": {
		"name": "STONEHEART",
		"description": "Bear another wound. +1 max HP.",
		"mods": { "max_hp_bonus": 1 },
	},
	"swift_strike": {
		"name": "SWIFT STRIKE",
		"description": "Sword cooldown -20%.",
		"mods": { "sword_cooldown_mul": -0.2 },
	},
	"dodge_master": {
		"name": "DODGE MASTER",
		"description": "Dodge cooldown -30%.",
		"mods": { "dodge_cooldown_mul": -0.3 },
	},
	"iron_skin": {
		"name": "IRON SKIN",
		"description": "Take 1 less damage per hit.",
		"mods": { "damage_taken_reduction": 1 },
	},
	"nimble": {
		"name": "NIMBLE",
		"description": "Move speed +30%.",
		"mods": { "move_speed_mul": 0.3 },
	},
	"heart_of_stone": {
		"name": "HEART OF STONE",
		"description": "+2 max HP.",
		"mods": { "max_hp_bonus": 2 },
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
		"save_version": 1,
		"owned_relics": owned_relics,
		"session_kills": session_kills,
		"dungeon_runs": dungeon_runs,
		"last_run_kills": last_run_kills,
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
	dungeon_runs += 1
	last_run_kills = 0

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
