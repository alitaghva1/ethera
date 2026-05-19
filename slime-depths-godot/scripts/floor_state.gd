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
# Lifecycle (iter 12: hamlet removed; menu → dungeon directly):
#   Main menu BEGIN → start_dungeon_run() + start_floor() → load main.tscn
#   Room cleared (not last) → Door spawns → walk into → RunState.advance()
#     → reload main.tscn (which reads the new current_room_config)
#   Room cleared (last) → Pedestal spawns → claim → ESC → main menu
#   Hero dies anywhere → death screen → RETRY (reload + reset to room 0)
#                                       or MENU (RunState.end_floor)
extends Node

# Ordered room sequence for the current floor. As of the floor-2
# extension, ONE floor is now 6 rooms with 2 bosses (iron_revenant at
# room 3, broodmother at room 6). Rooms 1-3 = floor 1 (crypt mouth,
# rising threat into the iron revenant); rooms 4-6 = floor 2 (cold
# blue-grey crypt depths into the broodmother's sickly green chamber).
# Future biomes / DAG branching would key off a dict per floor id, but
# for now the linear array is the whole content surface.
const FLOOR_ROOMS: Array[String] = [
	"res://scenes/rooms/room_01.tres",
	"res://scenes/rooms/room_02.tres",
	"res://scenes/rooms/room_03.tres",
	"res://scenes/rooms/room_04.tres",
	"res://scenes/rooms/room_05.tres",
	"res://scenes/rooms/room_06.tres",
]

# Current room index (0-based). -1 = not in a floor (hamlet / menus).
var current_room_index: int = -1

# Cached RoomConfig for the active room. Read by the dungeon scene at
# _ready to configure itself. Lazily loaded from disk on advance() so
# editing a .tres in the editor between runs picks up cleanly.
var current_room_config: RoomConfig = null

# Iter 32 — pending branch modifier. Set by branch-door entry on its
# way to advance(); consumed by main.gd at next-room _ready and then
# cleared. "" = no modifier (legacy single-door path).
# Valid values: "" | "safe" | "standard" | "risk"
var pending_branch: String = ""

# Iter 33 — pending branch destination ROOM PATH. When non-empty,
# overrides the FLOOR_ROOMS[current_room_index] lookup in _load_current
# so a branch can route the player to a treasure / shrine / etc. room
# instead of the next combat slot. Consumed (cleared) the moment the
# override is read so subsequent advances return to the linear path.
# "" = use the next FLOOR_ROOMS entry as normal.
var pending_branch_path: String = ""

# Total kills accumulated across the current floor (resets each run).
# Surfaces in the death screen / pedestal banner.
var floor_kills: int = 0

# Iter 158 — run timer. Captured at start_floor() in Time.get_ticks_msec()
# (engine-tick clock, NOT wall clock — but the prototype uses
# Time.get_ticks_msec so a long compute spike wouldn't lose seconds).
# Surfaces in the HUD via run_elapsed_seconds() and gets snapshotted
# into GameState on run-end (death or victory).
var run_start_msec: int = 0

# Returns seconds elapsed since start_floor() was called. Returns 0.0
# when there's no active run (between runs / at the main menu).
func run_elapsed_seconds() -> float:
	if current_room_index < 0 or run_start_msec <= 0:
		return 0.0
	return float(Time.get_ticks_msec() - run_start_msec) / 1000.0

func start_floor() -> void:
	current_room_index = 0
	floor_kills = 0
	pending_branch = ""           # iter 32 — never carry a branch into a new run
	pending_branch_path = ""      # iter 33 — same, for destination override
	GameState.persisted_hp = -1   # fresh full HP on new run
	run_start_msec = Time.get_ticks_msec()   # iter 158 — run timer begins
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
	pending_branch = ""           # iter 32 — clear any pending branch
	pending_branch_path = ""      # iter 33
	GameState.persisted_hp = -1   # no carry into the next run

func is_last_room() -> bool:
	if current_room_index < 0:
		return false
	return current_room_index >= FLOOR_ROOMS.size() - 1

func register_kill() -> void:
	floor_kills += 1

func _load_current() -> void:
	# Iter 33 — branch destination override. If a branch-door set
	# pending_branch_path before calling advance(), we load THAT room
	# this turn instead of the linear FLOOR_ROOMS slot. Consume on
	# read so the next advance() returns to the linear path.
	var path: String = FLOOR_ROOMS[current_room_index]
	if pending_branch_path != "":
		path = pending_branch_path
		pending_branch_path = ""
	var cfg: Resource = load(path)
	if cfg is RoomConfig:
		current_room_config = cfg
	else:
		push_error("Floor: failed to load RoomConfig at %s" % path)
		current_room_config = null
