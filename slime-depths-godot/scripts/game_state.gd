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
# by Floor.start_floor() / end_floor() so each new run begins fresh.
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
