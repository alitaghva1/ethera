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

# ── Relic registry ───────────────────────────────────────────────────
# Modifier keys read by hero.gd:
#   sword_damage_bonus  (int)  added to LMB-swing damage
#   blast_damage_bonus  (int)  added to RMB-projectile damage
#   max_hp_bonus        (int)  added to Hero.MAX_HP at spawn
# Future relics can add more keys (move_speed_mul, dodge_cd_mul, etc.)
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
