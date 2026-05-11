# Floor — autoload that tracks "which room of the current floor is
# active" + the sequence of rooms in that floor. Replaces the implicit
# "main.tscn IS the dungeon" model with a proper room-progression
# state machine.
#
# Migration of slime-depths' src/floor.js (the floor-sequence half of
# floor.js / floorGraph.js). Branching DAG support is out of scope for
# this phase; this is a linear sequence. The data-driven RoomConfig
# pattern means upgrading to a DAG later is a structural change to
# this file only.
#
# Lifecycle:
#   Hamlet → DESCEND portal → RunState.start_floor() → load main.tscn
#   Room cleared (not last) → Door spawns → walk into → RunState.advance()
#     → reload main.tscn (which reads the new current_room_config)
#   Room cleared (last) → Pedestal spawns → claim → ESC → hamlet
#   Hero dies anywhere → death screen → RETRY (reload + reset to room 0)
#                                       or HAMLET (RunState.end_floor)
extends Node

# Ordered room sequence for the current floor. For Iter 6 we hardcode a
# single 3-room linear floor; future floors / biomes get their own
# arrays here (or a dict keyed by floor id).
const FLOOR_ROOMS: Array[String] = [
	"res://scenes/rooms/room_01.tres",
	"res://scenes/rooms/room_02.tres",
	"res://scenes/rooms/room_03.tres",
]

# Current room index (0-based). -1 = not in a floor (hamlet / menus).
var current_room_index: int = -1

# Cached RoomConfig for the active room. Read by the dungeon scene at
# _ready to configure itself. Lazily loaded from disk on advance() so
# editing a .tres in the editor between runs picks up cleanly.
var current_room_config: RoomConfig = null

# Total kills accumulated across the current floor (resets each run).
# Surfaces in the death screen / pedestal banner.
var floor_kills: int = 0

func start_floor() -> void:
	current_room_index = 0
	floor_kills = 0
	GameState.persisted_hp = -1   # fresh full HP on new run
	_load_current()

func advance() -> bool:
	# Returns true if there's another room; false if we just cleared
	# the last one (caller should route to hamlet / floor-summary).
	if current_room_index < 0:
		# Defensive — somebody called advance() without start_floor.
		# Treat as a fresh start.
		start_floor()
		return true
	current_room_index += 1
	if current_room_index >= FLOOR_ROOMS.size():
		current_room_index = FLOOR_ROOMS.size() - 1
		return false
	_load_current()
	return true

func end_floor() -> void:
	# Called when the player exits to hamlet (death-retry-to-hamlet,
	# pedestal claim, ESC). Clears state so the next descent starts
	# from room 0 via start_floor().
	current_room_index = -1
	current_room_config = null
	floor_kills = 0
	GameState.persisted_hp = -1   # no carry into the next run

func is_last_room() -> bool:
	if current_room_index < 0:
		return false
	return current_room_index >= FLOOR_ROOMS.size() - 1

func register_kill() -> void:
	floor_kills += 1

func _load_current() -> void:
	var path: String = FLOOR_ROOMS[current_room_index]
	var cfg: Resource = load(path)
	if cfg is RoomConfig:
		current_room_config = cfg
	else:
		push_error("Floor: failed to load RoomConfig at %s" % path)
		current_room_config = null
