# Main (dungeon room runner) — generic room scene that builds itself
# from the Floor autoload's current_room_config (a RoomConfig .tres
# resource). Same scene file handles all 3 rooms of a floor; per-room
# variation comes from data.
#
# Iter 6 architecture vs Iter 3-5 (single hardcoded room):
#   • SPAWN_POINTS + WAVES + torch positions now live in RoomConfig
#     .tres resources (scenes/rooms/room_NN.tres). main.gd reads
#     RunState.current_room_config at _ready and configures itself.
#   • main.tscn no longer has hand-placed Torch nodes; torches spawn
#     from the config so per-room layouts vary visually.
#   • On wave clear: spawn Door (not last room) OR Pedestal (last).
#   • Door → RunState.advance() → reload main.tscn → room rebuilds with
#     the next config. Linear progression; DAG/branching is future work.
#
# Hit-stop, death screen, kill counting, signals unchanged from Iter 5.
extends Node2D

const DAMAGE_NUMBER_SCENE         = preload("res://scenes/damage_number.tscn")
const PEDESTAL_SCENE: PackedScene = preload("res://scenes/pedestal.tscn")
const TORCH_SCENE: PackedScene    = preload("res://scenes/torch.tscn")
const PILLAR_SCENE: PackedScene   = preload("res://scenes/pillar.tscn")
const CHEST_SCENE: PackedScene    = preload("res://scenes/chest.tscn")
const DOOR_SCENE: PackedScene     = preload("res://scenes/door.tscn")
const DEATH_SCREEN_SCENE: PackedScene = preload("res://scenes/death_screen.tscn")

# Enemy roster — iter 14 data-driven shape. ONE shared enemy.tscn for
# all types; the type-specific data (sheets, stats, behavior, AI
# tunables) lives in EnemyType .tres files under scenes/enemies/.
# Adding a new enemy = one new .tres + one entry in this dict. No
# per-enemy scene, no per-enemy script, no manual AtlasTexture wrangling.
const ENEMY_SCENE: PackedScene = preload("res://scenes/enemy.tscn")
const ENEMY_TYPES := {
	"slime":             preload("res://scenes/enemies/slime.tres"),
	"crypt_spider":      preload("res://scenes/enemies/crypt_spider.tres"),
	"orc":               preload("res://scenes/enemies/orc.tres"),
	"ember":             preload("res://scenes/enemies/ember.tres"),
	"werewolf":          preload("res://scenes/enemies/werewolf.tres"),
	"skel":              preload("res://scenes/enemies/skel.tres"),
	"lancer":            preload("res://scenes/enemies/lancer.tres"),
	"armored_skeleton":  preload("res://scenes/enemies/armored_skeleton.tres"),
	"wizard":            preload("res://scenes/enemies/wiz.tres"),
	"archer":            preload("res://scenes/enemies/archer.tres"),
	"priest":            preload("res://scenes/enemies/priest.tres"),
	"dreadmage":         preload("res://scenes/enemies/dreadmage.tres"),
	"bonecap":           preload("res://scenes/enemies/bonecap.tres"),
}

const HIT_STOP_SCALE    := 0.05
const HIT_STOP_TIME     := 0.08
# Iter 13 — lighter hit-stop when the player CONNECTS (vs takes damage).
# Brief enough that mashing attack still feels responsive, heavy enough
# that each hit has a tiny "thud" of friction. Scales up slightly on
# multi-hit (clamped) so a clean cleave-through reads bigger.
const SWING_HIT_STOP_SCALE := 0.18
const SWING_HIT_STOP_TIME  := 0.035
const DASH_HIT_STOP_SCALE  := 0.10
const DASH_HIT_STOP_TIME   := 0.07
const DASH_IMPACT_SCENE: PackedScene = preload("res://scenes/fx/dash_impact.tscn")
const WAVE_CLEAR_PAUSE  := 1.6
const DOOR_POSITION     := Vector2(1140, 384)   # east-wall door spawn

# Fallback when main.tscn is launched directly without RunState.start_floor()
# having been called (e.g. F5 from the editor on main.tscn). Picks the
# first room so the scene is testable in isolation.
const FALLBACK_ROOM_CONFIG := "res://scenes/rooms/room_01.tres"

enum WaveState { PRE, ACTIVE, CLEAR, COMPLETE, DEAD }

@onready var hero: Hero = $Hero
@onready var hp_label: Label = $UI/HPLabel
@onready var status_label: Label = $UI/StatusLabel
@onready var kills_label: Label = $UI/KillsLabel
@onready var wave_label: Label = $UI/WaveLabel
@onready var room_label: Label = $UI/RoomLabel

# Active room config — driven by Floor autoload. Cached at _ready so
# late edits to RunState.current_room_config mid-run don't cause stutter.
var _room: RoomConfig = null
var _spawn_points: Array[Vector2] = []
var _waves: Array = []

var _wave_index := -1
var _wave_state := WaveState.PRE
var _alive := true
var _kills := 0
var _hit_stop_timer := 0.0
var _death_screen: Node = null

func _ready() -> void:
	# Resolve the active room config — fall back to room_01 for
	# editor-direct launches so the scene is debuggable in isolation.
	if RunState.current_room_config == null:
		# load() returns Variant in Godot 4 — explicit Resource typing
		# stops the := inference warning under strict 4.6 mode.
		var fb: Resource = load(FALLBACK_ROOM_CONFIG)
		if fb is RoomConfig:
			RunState.current_room_index = 0
			RunState.current_room_config = fb
	# Explicit cast — RunState is an autoload, parser sees its fields
	# as Variant. `as RoomConfig` keeps the typed _room field happy.
	_room = RunState.current_room_config as RoomConfig
	if _room != null:
		_spawn_points = _room.spawn_points
		_waves = _room.waves
		_spawn_torches(_room.torch_positions)
		# Decor — collidable stone pillars + breakable chests. Both spawn
		# from per-room arrays in the same data-driven shape as torches.
		# Order matters cosmetically (pillars first → chests render on
		# top in z-order) but neither one depends on the other.
		_spawn_pillars(_room.pillar_positions)
		_spawn_chests(_room.chest_positions)
		hero.global_position = _room.hero_spawn
	else:
		push_warning("main.gd: no RoomConfig available; running with empty layout")

	hero.hp_changed.connect(_on_hero_hp_changed)
	hero.hero_died.connect(_on_hero_died)
	hero.hit_received.connect(_on_hero_hit_received)
	# Iter 13 — react to hero offense beats. swing_connected fires when
	# a normal melee swing hits at least one enemy (brief hit-stop);
	# dash_strike_landed fires at the END of the dash AoE scan whether
	# or not it connected (heavy shake + impact VFX always; bigger
	# hit-stop only if it landed).
	hero.swing_connected.connect(_on_hero_swing_connected)
	hero.dash_strike_landed.connect(_on_hero_dash_strike_landed)
	_death_screen = DEATH_SCREEN_SCENE.instantiate()
	add_child(_death_screen)
	_death_screen.retry_pressed.connect(_on_death_retry)
	_death_screen.menu_pressed.connect(_on_death_to_menu)
	_update_hp(hero.hp)
	_update_kills()
	_update_room_label()
	status_label.text = "LMB swing · RMB blast · SPACE dodge · Q shield · SHIFT dash"
	wave_label.text = "WAVE 1 / %d  incoming" % max(1, _waves.size())
	var t := get_tree().create_timer(1.0)
	t.timeout.connect(func (): _start_wave(0))

func _process(_delta: float) -> void:
	if _hit_stop_timer > 0.0:
		_hit_stop_timer -= 1.0 / 60.0
		if _hit_stop_timer <= 0.0:
			Engine.time_scale = 1.0
	if _wave_state == WaveState.ACTIVE:
		# Filter out "breakables" (chests) — they join the "enemies"
		# group so the hero's sword swing iteration finds them, but
		# they must NOT count toward the wave-clear threshold or wave
		# 1 would never clear while a chest still stood unbroken.
		var live: int = get_tree().get_nodes_in_group("enemies").filter(
			func (n: Node) -> bool: return not n.is_in_group("breakables")
		).size()
		if live == 0:
			_on_wave_cleared()

func _spawn_torches(positions: Array[Vector2]) -> void:
	for pos in positions:
		var t: Node2D = TORCH_SCENE.instantiate()
		t.position = pos
		add_child(t)

func _spawn_pillars(positions: Array[Vector2]) -> void:
	for pos in positions:
		var p: Pillar = PILLAR_SCENE.instantiate()
		p.position = pos
		add_child(p)

func _spawn_chests(positions: Array[Vector2]) -> void:
	for pos in positions:
		var c: Chest = CHEST_SCENE.instantiate()
		c.position = pos
		add_child(c)

func _start_wave(idx: int) -> void:
	if not _alive or idx >= _waves.size():
		return
	_wave_index = idx
	_wave_state = WaveState.ACTIVE
	var comp: Array = _waves[idx]
	for pair in comp:
		var type_id: String = pair[0]
		var count: int = pair[1]
		for i in range(count):
			_spawn_enemy_type(type_id)
	wave_label.text = "WAVE %d / %d" % [idx + 1, _waves.size()]

func _on_wave_cleared() -> void:
	_wave_state = WaveState.CLEAR
	if _wave_index + 1 < _waves.size():
		wave_label.text = "WAVE %d CLEAR  ·  next in %.1fs" % [_wave_index + 1, WAVE_CLEAR_PAUSE]
		var t := get_tree().create_timer(WAVE_CLEAR_PAUSE)
		t.timeout.connect(func (): _start_wave(_wave_index + 1))
	else:
		_wave_state = WaveState.COMPLETE
		wave_label.text = "ROOM CLEAR"
		# Last room of the floor → pedestal; otherwise → door to next room.
		if _room != null and _room.is_last_room:
			status_label.text = "Claim the relic at the pedestal · [E] when close"
			_spawn_pedestal()
		else:
			status_label.text = "The way deeper has opened · walk east to descend"
			_spawn_door()

func _spawn_enemy_type(type_id: String) -> void:
	if _spawn_points.is_empty():
		return
	# Resolve EnemyType for this id; fall back to slime if missing
	# (typo'd a wave entry, or a room references an enemy that hasn't
	# landed yet). The resolved type is assigned to the spawned node
	# BEFORE add_child so enemy.gd's _ready can see it.
	var type_res: EnemyType = ENEMY_TYPES.get(type_id, ENEMY_TYPES["slime"])
	var enemy: Enemy = ENEMY_SCENE.instantiate()
	enemy.enemy_type = type_res
	enemy.global_position = _spawn_points[randi() % _spawn_points.size()]
	enemy.died_at.connect(_on_enemy_died)
	add_child(enemy)

func _spawn_pedestal() -> void:
	var available: Array = []
	for rid in GameState.RELIC_REGISTRY.keys():
		if not GameState.has_relic(rid):
			available.append(rid)
	var chosen: String = available[randi() % available.size()] if not available.is_empty() else "iron_fang"
	var ped: Pedestal = PEDESTAL_SCENE.instantiate()
	ped.global_position = Vector2(640, 384)
	ped.relic_id = chosen
	add_child(ped)

func _spawn_door() -> void:
	var door: Door = DOOR_SCENE.instantiate()
	door.global_position = DOOR_POSITION
	add_child(door)

func _on_enemy_died(world_pos: Vector2) -> void:
	_kills += 1
	GameState.register_run_kill()
	RunState.register_kill()
	_update_kills()
	var n: DamageNumber = DamageNumber.spawn(world_pos + Vector2(0, -36), "+1", Color(1, 0.95, 0.7))
	add_child(n)

func _on_hero_swing_connected(hit_count: int) -> void:
	# Brief hit-stop on a connecting melee swing. The freeze scale is
	# the hero-took-damage one's bigger sibling — same machinery, just
	# lighter / shorter. Don't stack: if we're already mid-stop from
	# the hero-getting-hit handler, leave that one alone (it's bigger).
	if _hit_stop_timer > 0.0:
		return
	# Tiny bonus on multi-hit, clamped so a cleave-through doesn't
	# freeze the screen.
	var multi_bonus: float = mini(hit_count - 1, 2) * 0.01
	Engine.time_scale = SWING_HIT_STOP_SCALE
	_hit_stop_timer = SWING_HIT_STOP_TIME + multi_bonus

func _on_hero_dash_strike_landed(world_pos: Vector2, hit_count: int) -> void:
	# Spawn impact VFX at the end of the dash regardless of hits —
	# the player committed to the dash and deserves visual payoff.
	var impact: Node2D = DASH_IMPACT_SCENE.instantiate() as Node2D
	if impact != null:
		impact.global_position = world_pos
		add_child(impact)
	# Heavy shake on connect; lighter "thump" shake on whiff so the
	# dash still has some recoil weight even when you miss.
	if hit_count > 0:
		FX.shake(10.0, 0.16)
		# Hit-stop only on connect — a whiffed dash shouldn't freeze
		# the screen mid-movement. Skip if a heavier hero-damage stop
		# is already running.
		if _hit_stop_timer <= 0.0:
			Engine.time_scale = DASH_HIT_STOP_SCALE
			_hit_stop_timer = DASH_HIT_STOP_TIME
	else:
		FX.shake(4.0, 0.10)

func _on_hero_hit_received() -> void:
	Engine.time_scale = HIT_STOP_SCALE
	_hit_stop_timer = HIT_STOP_TIME
	var n: DamageNumber = DamageNumber.spawn(
		hero.global_position + Vector2(0, -50),
		"-1",
		Color(1, 0.45, 0.45)
	)
	add_child(n)

func _on_hero_hp_changed(new_hp: int) -> void:
	_update_hp(new_hp)

func _update_hp(v: int) -> void:
	var hearts := ""
	var max_hp: int = Hero.MAX_HP + GameState.modifier_total("max_hp_bonus", 0)
	for i in range(max_hp):
		hearts += "♥ " if i < v else "♡ "
	hp_label.text = hearts.strip_edges()

func _update_kills() -> void:
	kills_label.text = "KILLS  %d" % _kills

func _update_room_label() -> void:
	if _room == null or RunState.current_room_index < 0:
		room_label.text = ""
		return
	var total: int = RunState.FLOOR_ROOMS.size()
	var idx: int = RunState.current_room_index + 1
	room_label.text = "%s  ·  ROOM %d / %d" % [_room.display_name, idx, total]

func _on_hero_died() -> void:
	_alive = false
	_wave_state = WaveState.DEAD
	Engine.time_scale = 1.0
	status_label.text = ""
	wave_label.text = ""
	if _death_screen != null and _death_screen.has_method("show_death"):
		_death_screen.show_death(_kills)

func _on_death_retry() -> void:
	# Retry = restart THIS floor from room 0. Easier UX than dropping
	# the player into the room they died on with no preamble.
	Engine.time_scale = 1.0
	GameState.start_dungeon_run()
	RunState.start_floor()
	get_tree().reload_current_scene()

func _on_death_to_menu() -> void:
	# Iter 12: hamlet removed. ESC / MENU button returns to the main
	# menu — the menu's BEGIN re-seeds RunState.start_floor() so we
	# end_floor here defensively rather than relying on the menu side.
	Engine.time_scale = 1.0
	RunState.end_floor()
	get_tree().change_scene_to_file("res://scenes/main_menu.tscn")

func _unhandled_input(ev: InputEvent) -> void:
	if not _alive and ev is InputEventKey and ev.pressed:
		if ev.physical_keycode == KEY_R:
			_on_death_retry()
		elif ev.physical_keycode == KEY_ESCAPE:
			_on_death_to_menu()
	# ESC return after final-room pedestal claim too.
	if _wave_state == WaveState.COMPLETE and _alive and ev is InputEventKey and ev.pressed:
		if ev.physical_keycode == KEY_ESCAPE:
			_on_death_to_menu()
