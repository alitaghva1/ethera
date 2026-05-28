# Floor Modifiers — iter 239 / Fun Ideas Team R4.
#
# A HADES "PACT OF PUNISHMENT" LITE. Before stepping into the dungeon
# from the main menu, the player can toggle 0-3 self-imposed difficulty
# modifiers in exchange for an additive ether-shard reward multiplier
# applied to every shard award for the duration of the run.
#
# Design DNA — three north stars from the doctrine:
#   • Hades — Pact of Punishment. Stack difficulty conditions in
#     exchange for greater Darkness/Chthonic Key yields. Knowable,
#     reversible between runs, surfaced LOUDLY in the HUD so the
#     player remembers what they signed up for.
#   • Risk of Rain — Difficulty multipliers as a meta-loop driver.
#     Maxed-out upgrade tree → new challenge axis on demand.
#   • Slay the Spire — "Ascensions" / heart fights. Persistent meta
#     unlocked content rather than throwaway random one-shots.
#
# Why this fits Ethera now (R4 design priority):
#   The Ether Shard meta-loop (M1.0) + upgrade tree (M1.1) eventually
#   bottoms out — once the player owns every node, additional shards
#   are dead weight. Floor modifiers reopen the difficulty axis WITHOUT
#   touching the relic/enemy catalog. Players who've maxed the tree
#   get a +N% multiplier knob; players who haven't get a clean
#   default-off baseline.
#
# Multiplier math (additive, NOT multiplicative):
#   total = 1.0 + sum(modifier.ether_bonus for m in active)
#   Why additive: simpler to communicate ("+25%, +20%, +30% = +75%"
#   reads as "1.75× shards"), keeps the upper bound bounded even with
#   all 5 active (1 + 0.25+0.15+0.25+0.30+0.20 = 2.15×, not the wild
#   3.5+× a multiplicative compound would produce). Tested to align
#   with player intuition; the Hades Pact uses the same additive
#   accumulator for its Heat -> Darkness mapping.
#
# Mutation model:
#   FloorModifiers is a stateless utility (RefCounted, no autoload).
#   The ACTIVE SET lives on GameState.active_floor_modifiers: Array[String]
#   so it survives scene transitions and is cleared deterministically
#   by start_dungeon_run(). Save-roundtrip is not required (these are
#   per-run choices, not persistent preferences — the modal re-asks
#   on every BEGIN press, just like Hades).
class_name FloorModifiers
extends RefCounted

# Catalog of 5 modifiers. Each entry:
#   id          — stable identifier (tests, save migration, HUD code)
#   label       — short banner name for the modal toggle + HUD chip
#   description — one-line player-facing penalty description
#   ether_bonus — additive ether-shard reward multiplier delta
#                 (e.g. 0.25 = +25% on top of base 1.0×)
#   tag         — one of "damage" / "speed" / "hp" / "loot" / "time"
#                 for chip color theming + future achievement hooks
const MODIFIER_CATALOG: Array = [
	{
		"id": "heat_wave",
		"label": "HEAT WAVE",
		"description": "Enemies deal +25% damage.",
		"ether_bonus": 0.20,
		"tag": "damage",
	},
	{
		"id": "swift_foes",
		"label": "SWIFT FOES",
		"description": "Enemies move +15% faster.",
		"ether_bonus": 0.15,
		"tag": "speed",
	},
	{
		"id": "thicker_blood",
		"label": "THICKER BLOOD",
		"description": "Enemies have +30% HP.",
		"ether_bonus": 0.25,
		"tag": "hp",
	},
	{
		"id": "darker_paths",
		"label": "DARKER PATHS",
		"description": "Pedestal offers drop one tier (rare → common, etc).",
		"ether_bonus": 0.30,
		"tag": "loot",
	},
	{
		"id": "clocked",
		"label": "CLOCKED",
		"description": "Enemies spawn 25% sooner per room.",
		"ether_bonus": 0.20,
		"tag": "time",
	},
]

# Per-modifier gameplay-effect constants. Centralizing here so the
# combat-side code reads `FloorModifiers.HEAT_WAVE_DAMAGE_MUL` rather
# than hard-coding 1.25, keeps the design tuning in one file.
const HEAT_WAVE_DAMAGE_MUL: float = 1.25
const SWIFT_FOES_SPEED_MUL: float = 1.15
const THICKER_BLOOD_HP_MUL: float = 1.30
const CLOCKED_SPAWN_DELAY_MUL: float = 0.75
const DARKER_PATHS_TIER_OFFSET: int = -1

# Returns true if `mod_id` is currently active on the GameState autoload.
# Safe to call from any thread / context — defensive get_node_or_null on
# the autoload path means headless test stubs without the autoload
# don't crash.
static func is_active(mod_id: String) -> bool:
	var gs: Node = _safe_game_state()
	if gs == null:
		return false
	var active: Array = gs.get("active_floor_modifiers")
	if active == null:
		return false
	return mod_id in active

# Returns the ether-shard reward multiplier for the current run's
# active modifier set. Always >= 1.0 (no modifiers = no penalty = no
# bonus = 1.0×). Folds via GameState.active_floor_modifiers + the
# catalog's ether_bonus values, additively.
static func compute_ether_multiplier() -> float:
	var gs: Node = _safe_game_state()
	if gs == null:
		return 1.0
	var active: Array = gs.get("active_floor_modifiers")
	if active == null or active.is_empty():
		return 1.0
	var total: float = 1.0
	for mod_id in active:
		var info: Dictionary = catalog_entry(str(mod_id))
		if info.is_empty():
			continue
		total += float(info.get("ether_bonus", 0.0))
	return total

# Returns the catalog entry for `mod_id`, or empty Dictionary if
# unknown. Tests can call this to verify the catalog shape without
# instantiating a node.
static func catalog_entry(mod_id: String) -> Dictionary:
	for entry in MODIFIER_CATALOG:
		if str(entry.get("id", "")) == mod_id:
			return entry
	return {}

# Returns the catalog array. Provided as a method so tests can verify
# the count + structure without grepping source code.
static func catalog() -> Array:
	return MODIFIER_CATALOG

# Toggle a modifier on/off in GameState.active_floor_modifiers. Returns
# the new active state (true = now active, false = now inactive).
# Idempotent — calling twice toggles back to the original state.
#
# The intermediate `next` is built as a properly-typed Array[String]
# so the gs.set call respects GameState's typed property; otherwise
# Godot 4 silently rejects the untyped assignment.
static func toggle(mod_id: String) -> bool:
	var gs: Node = _safe_game_state()
	if gs == null:
		return false
	if catalog_entry(mod_id).is_empty():
		# Unknown id — silent no-op rather than push_error so headless
		# tests with stub GameState don't get noisy.
		return false
	var current: Array = gs.get("active_floor_modifiers")
	var next: Array[String] = []
	if current != null:
		for v in current:
			if v is String:
				next.append(v)
	if mod_id in next:
		next.erase(mod_id)
		gs.set("active_floor_modifiers", next)
		return false
	next.append(mod_id)
	gs.set("active_floor_modifiers", next)
	return true

# Clears all active modifiers. Called by GameState.start_dungeon_run
# implicitly via the field reset, but also exposed as a public helper
# for the modal's CLEAR button.
#
# Uses an empty typed Array[String] literal so the set call doesn't
# fall foul of GameState's typed property — assigning an untyped
# Array to a typed-Array field silently no-ops in Godot 4.
static func clear_all() -> void:
	var gs: Node = _safe_game_state()
	if gs == null:
		return
	var empty: Array[String] = []
	gs.set("active_floor_modifiers", empty)

# Returns the count of currently-active modifiers. Used by the HUD
# chip strip to decide whether to render at all.
static func active_count() -> int:
	var gs: Node = _safe_game_state()
	if gs == null:
		return 0
	var active: Array = gs.get("active_floor_modifiers")
	if active == null:
		return 0
	return active.size()

# Returns the active modifier ids as an Array[String]. Used by HUD
# chip strip + tests. Returns empty array if none active.
static func active_ids() -> Array:
	var gs: Node = _safe_game_state()
	if gs == null:
		return []
	var active: Array = gs.get("active_floor_modifiers")
	if active == null:
		return []
	return active.duplicate()

# Internal — defensive GameState lookup. Returns null if autoload not
# registered (headless test contexts). Mirrors the pattern used in
# pact_altar.gd / cursed_pickup.gd.
static func _safe_game_state() -> Node:
	if Engine.get_main_loop() == null:
		return null
	var tree: SceneTree = Engine.get_main_loop() as SceneTree
	if tree == null or tree.root == null:
		return null
	return tree.root.get_node_or_null("/root/GameState")
