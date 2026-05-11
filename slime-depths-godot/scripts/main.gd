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
const RELIC_ICON_SCENE: PackedScene = preload("res://scenes/relic_icon.tscn")

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
	# Iter 17 — boss type. Spawned alone in room 3's final wave; the
	# is_boss flag drives the HP-bar UI and the boss tracking in
	# _process. Wave-clear detection treats it like any other enemy.
	"iron_revenant":     preload("res://scenes/enemies/iron_revenant.tres"),
	"broodmother":       preload("res://scenes/enemies/broodmother.tres"),
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
# Iter 15 — pacing pass. Earlier values felt sluggish: 1.6s between
# waves left dead-air, and 1.0s pre-first-wave kept the player idle on
# room entry. Tighter values keep the loop pumping.
const WAVE_CLEAR_PAUSE  := 0.9     # seconds between waves
const INITIAL_WAVE_DELAY := 0.6    # seconds from _ready to wave 1 spawn
# Stagger between enemies WITHIN a wave. ALL-at-once spawning made each
# wave feel chaotic; spacing the spawns ~0.18s apart sells "enemies are
# arriving" instead of "enemies popped." Combined with the spawn-in fade
# in enemy.gd, each individual unit has ~0.7s of telegraph before it
# actually engages — long enough to read, short enough to not stall combat.
const SPAWN_STAGGER     := 0.18
const DOOR_POSITION     := Vector2(1140, 384)   # east-wall door spawn

# Iter 22 — death cinematic tuning. The hero's lethal hit triggers a
# slow-mo + camera-zoom + radial-vignette + YOU DIED banner sequence
# before the existing death_screen overlay takes over. Time scale is
# OWNED by the cinematic during this window; do not reset it in
# _on_hero_died (the cinematic restores it at t=1.6s).
const DEATH_TIME_SCALE_MIN: float = 0.25
const DEATH_CAMERA_ZOOM_END: Vector2 = Vector2(1.4, 1.4)
const DEATH_BANNER_DELAY: float = 0.4
const DEATH_VEIL_FADE_TIME: float = 0.8
const DEATH_VEIL_FINAL_ALPHA: float = 0.72
const DEATH_RESTORE_AT: float = 1.2
const DEATH_SHOW_SCREEN_AT: float = 1.6

# Iter 22 — wave-start center banner. A big text overlay that fades in
# above the play field for each wave so the player gets a Hades-style
# "WAVE N" punctuation between rounds. Driven entirely by tween from
# _show_wave_banner; the existing wave_label corner readout stays.
const WAVE_BANNER_DURATION: float = 1.0   # total time visible
const WAVE_BANNER_HOLD: float = 0.4       # hold-at-peak before fading

# Iter 22 — boss intro feel. When an EnemyType with is_boss=true
# spawns we ALSO throw a heavy camera shake + a brief red wash to
# punctuate the moment. Pre-iter-22 bosses just appeared with the
# normal red spawn-in tint.
const BOSS_INTRO_SHAKE_AMP: float = 16.0
const BOSS_INTRO_SHAKE_TIME: float = 0.45

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
@onready var boss_bar: VBoxContainer = $UI/BossBar
@onready var boss_name: Label = $UI/BossBar/Name
@onready var boss_hp_bar: ProgressBar = $UI/BossBar/Bar
# HUD relic strip — horizontal row of small badges, one per owned
# relic. Populated by _rebuild_relic_strip on _ready and refreshed
# whenever Events.pickup_claimed fires (a new relic was just granted).
@onready var relic_strip: HBoxContainer = $UI/RelicStrip

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
# Iter 15 — count of enemies queued by _start_wave that haven't
# actually spawned yet (timer-deferred). The wave-clear check in
# _process needs to know about these so the staggered spawn window
# doesn't trigger false-positive "all enemies dead" between the first
# kill and the last spawn.
var _pending_spawns := 0
# Iter 16 — guard against pickup_claimed firing twice on the same room
# (e.g. a hypothetical double-event from a relic with multiple effects).
# Set true the first time a pedestal grants in this room; reset on
# scene reload. Drives the door/run-complete branch.
var _room_pickup_resolved := false
# Iter 17 — boss tracking. Set on spawn when an enemy_type with
# is_boss=true is instantiated. _process polls this each frame to
# refresh the HP bar. Cleared (instance invalid) when the boss
# dies, hiding the bar.
var _boss_ref: Enemy = null

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
		# Iter 18 — per-room ambient tint applied to the CanvasModulate.
		# Drives the "deeper = different mood" feeling: room 1 light
		# purple, room 2 deep purple, room 3 (boss) red-purple. The
		# torches layer their warm light on top, so the floor under
		# them still reads gold.
		var modulate_node: CanvasModulate = $CanvasModulate
		if modulate_node != null:
			modulate_node.color = _room.ambient_tint
		_spawn_torches(_room.torch_positions)
		# Decor — collidable stone pillars + breakable chests. Both spawn
		# from per-room arrays in the same data-driven shape as torches.
		# Order matters cosmetically (pillars first → chests render on
		# top in z-order) but neither one depends on the other.
		_spawn_pillars(_room.pillar_positions)
		_spawn_chests(_room.chest_positions)
		# Iter 18 — scatter procedural rubble across the play area so
		# the floor doesn't read as a blank slate. Runs AFTER pillar /
		# chest spawn so decor placement can avoid those positions.
		_scatter_decor(_room.decor_density)
		hero.global_position = _room.hero_spawn
		# Iter 18 — animate the room-name label on entry. Starts big +
		# bright, settles to small + dim over 2s. Gives the player a
		# Hades-style "you have arrived" beat without a separate UI.
		_animate_room_entry()
	else:
		push_warning("main.gd: no RoomConfig available; running with empty layout")

	hero.hp_changed.connect(_on_hero_hp_changed)
	hero.hero_died.connect(_on_hero_died)
	# Iter 22 — death cinematic. hero_death_started fires alongside
	# hero_died but lets us run the slow-mo / zoom / banner BEFORE
	# the death_screen overlay takes over (which _on_hero_died
	# defers to via a 1.6s timer in the cinematic).
	hero.hero_death_started.connect(_on_hero_death_started)
	hero.hit_received.connect(_on_hero_hit_received)
	# Iter 13 — react to hero offense beats. swing_connected fires when
	# a normal melee swing hits at least one enemy (brief hit-stop);
	# dash_strike_landed fires at the END of the dash AoE scan whether
	# or not it connected (heavy shake + impact VFX always; bigger
	# hit-stop only if it landed).
	hero.swing_connected.connect(_on_hero_swing_connected)
	hero.dash_strike_landed.connect(_on_hero_dash_strike_landed)
	# Iter 16 — pedestal offer flow. We listen on the Events bus rather
	# than per-pedestal because pedestals come and go in groups of 3
	# and we want one resolution path regardless of which one was
	# picked.
	Events.pickup_claimed.connect(_on_pickup_claimed)
	_death_screen = DEATH_SCREEN_SCENE.instantiate()
	add_child(_death_screen)
	_death_screen.retry_pressed.connect(_on_death_retry)
	_death_screen.menu_pressed.connect(_on_death_to_menu)
	_update_hp(hero.hp)
	_update_kills()
	_update_room_label()
	_rebuild_relic_strip()
	status_label.text = "LMB swing · RMB blast · SPACE dodge · Q shield · SHIFT dash"
	wave_label.text = "WAVE 1 / %d  incoming" % max(1, _waves.size())
	var t := get_tree().create_timer(INITIAL_WAVE_DELAY)
	t.timeout.connect(func (): _start_wave(0))

func _process(_delta: float) -> void:
	if _hit_stop_timer > 0.0:
		_hit_stop_timer -= 1.0 / 60.0
		if _hit_stop_timer <= 0.0:
			Engine.time_scale = 1.0
	# Iter 17 — boss HP bar refresh + hide on death. Polling avoids
	# adding an hp_changed signal to every enemy just to drive one UI.
	if _boss_ref != null:
		if is_instance_valid(_boss_ref) and _boss_ref.hp > 0:
			boss_hp_bar.value = float(_boss_ref.hp)
		else:
			boss_bar.visible = false
			_boss_ref = null
	if _wave_state == WaveState.ACTIVE:
		# Filter out "breakables" (chests) — they join the "enemies"
		# group so the hero's sword swing iteration finds them, but
		# they must NOT count toward the wave-clear threshold or wave
		# 1 would never clear while a chest still stood unbroken.
		var live: int = get_tree().get_nodes_in_group("enemies").filter(
			func (n: Node) -> bool: return not n.is_in_group("breakables")
		).size()
		# Iter 15: also wait for _pending_spawns to drain. Staggered
		# spawns from _start_wave defer enemy instantiation via timers;
		# without this guard, killing the first enemy before the second
		# spawns would false-positive "wave clear."
		if live == 0 and _pending_spawns == 0:
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

# Iter 18 — procedural decor scatter. Builds N small Polygon2D rubble
# clusters at random walkable positions, avoiding the hero spawn /
# enemy spawn points / room center so the decor doesn't crowd combat
# space. Each rubble is 4-5 irregular dark vertices at low alpha with
# slight Y-jitter and rotation — keeps the floor reading as "ancient"
# rather than "blank tile."
#
# Why procedural (vs hand-placed in RoomConfig): scatters are
# perceptually noise, not gameplay-significant. Hand-authoring 60
# positions across 3 rooms is wasted effort; randomness with a guard
# on minimum distance from gameplay-relevant points is cheaper +
# gives the room a different "feel" each load without re-authoring.
func _scatter_decor(count: int) -> void:
	if count <= 0:
		return
	# Walkable bounds — inside the wall colliders, with a margin so
	# decor doesn't visually clip into walls. Hardcoded to match
	# main.tscn's wall positions (96/1184 horizontally, 96/672
	# vertically) plus the 30-px decor radius.
	var play_left: float = 130.0
	var play_right: float = 1150.0
	var play_top: float = 130.0
	var play_bottom: float = 640.0
	var min_dist_spawn: float = 90.0
	var min_dist_pillar: float = 60.0
	var min_dist_chest: float = 50.0
	var min_dist_center: float = 100.0  # leave the middle clear (pedestal lands there)
	var center := Vector2(640, 384)
	var attempts: int = 0
	var placed: int = 0
	var max_attempts: int = count * 30  # generous; aborts if room is over-constrained
	while placed < count and attempts < max_attempts:
		attempts += 1
		var pos := Vector2(
			randf_range(play_left, play_right),
			randf_range(play_top, play_bottom),
		)
		if pos.distance_to(_room.hero_spawn) < min_dist_spawn:
			continue
		if pos.distance_to(center) < min_dist_center:
			continue
		var bad := false
		for sp in _room.spawn_points:
			if pos.distance_to(sp) < min_dist_spawn:
				bad = true
				break
		if bad:
			continue
		for pp in _room.pillar_positions:
			if pos.distance_to(pp) < min_dist_pillar:
				bad = true
				break
		if bad:
			continue
		for cp in _room.chest_positions:
			if pos.distance_to(cp) < min_dist_chest:
				bad = true
				break
		if bad:
			continue
		_spawn_decor_at(pos)
		placed += 1

# Build one rubble cluster at world position `pos`. Uses Polygon2D
# with 4 jittered vertices so each rubble has a slightly different
# silhouette — feels hand-placed without authoring each one.
func _spawn_decor_at(pos: Vector2) -> void:
	var rubble := Polygon2D.new()
	# 4 verts around an ellipse with random radii — fast, irregular,
	# reads as a small dark patch on the floor.
	var r1: float = randf_range(8.0, 14.0)
	var r2: float = randf_range(6.0, 11.0)
	var pts := PackedVector2Array()
	pts.append(Vector2(-r1 + randf_range(-2, 2), randf_range(-1, 1)))
	pts.append(Vector2(randf_range(-2, 2), -r2 + randf_range(-1, 1)))
	pts.append(Vector2(r1 + randf_range(-2, 2), randf_range(-1, 1)))
	pts.append(Vector2(randf_range(-2, 2), r2 + randf_range(-1, 1)))
	rubble.polygon = pts
	# Dark grey-brown, very low alpha — reads as "stain / cracked
	# stone" not "rock pile." z_index -1 so the hero / enemies draw
	# above.
	rubble.color = Color(
		randf_range(0.10, 0.18),
		randf_range(0.09, 0.14),
		randf_range(0.08, 0.13),
		randf_range(0.35, 0.55),
	)
	rubble.position = pos
	rubble.rotation = randf_range(0.0, TAU)
	rubble.z_index = -1
	add_child(rubble)

# Iter 18 — entry banner. The room_label sits permanently in the HUD
# but goes from FULL-ATTENTION (scale 1.6, full opacity, centered)
# down to a small persistent corner-style label over 2 seconds. The
# initial big state catches the eye as the scene loads; the settled
# state stays for orientation.
const ROOM_ENTRY_DURATION := 2.0
const ROOM_ENTRY_START_SCALE := 1.7
const ROOM_ENTRY_END_SCALE := 1.0
func _animate_room_entry() -> void:
	if room_label == null:
		return
	room_label.pivot_offset = room_label.size / 2.0
	room_label.scale = Vector2(ROOM_ENTRY_START_SCALE, ROOM_ENTRY_START_SCALE)
	room_label.modulate = Color(1, 1, 1, 1)
	var tween := create_tween().set_parallel(true)
	tween.tween_property(
		room_label, "scale",
		Vector2(ROOM_ENTRY_END_SCALE, ROOM_ENTRY_END_SCALE),
		ROOM_ENTRY_DURATION,
	).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tween.tween_property(
		room_label, "modulate:a",
		0.75,
		ROOM_ENTRY_DURATION,
	).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)

func _start_wave(idx: int) -> void:
	if not _alive or idx >= _waves.size():
		return
	_wave_index = idx
	_wave_state = WaveState.ACTIVE
	wave_label.text = "WAVE %d / %d" % [idx + 1, _waves.size()]
	# Iter 22 — center-screen wave banner. Punctuation between rounds;
	# the corner wave_label stays as the persistent readout.
	_show_wave_banner(idx + 1, _waves.size())
	# Iter 15 — flatten the wave composition, shuffle so the same type
	# doesn't always lead the parade, then dispatch spawns on a stagger.
	# _pending_spawns tracks the queue so _process's wave-clear check
	# can wait for it to drain (timers fire after first kills otherwise).
	var spawn_queue: Array[String] = []
	for pair in _waves[idx]:
		var type_id: String = pair[0]
		var count: int = pair[1]
		for i in range(count):
			spawn_queue.append(type_id)
	spawn_queue.shuffle()
	_pending_spawns = spawn_queue.size()
	for i in range(spawn_queue.size()):
		# Small jitter on top of the base stagger so the rhythm doesn't
		# feel metronomic. Tween-friendly Bind so each closure captures
		# its own type_id (vs all closures seeing the last one).
		var delay: float = i * SPAWN_STAGGER + randf_range(0.0, 0.08)
		var t: SceneTreeTimer = get_tree().create_timer(delay)
		var captured: String = spawn_queue[i]
		t.timeout.connect(func (): _spawn_enemy_type(captured))

func _on_wave_cleared() -> void:
	_wave_state = WaveState.CLEAR
	if _wave_index + 1 < _waves.size():
		wave_label.text = "WAVE %d CLEAR  ·  next in %.1fs" % [_wave_index + 1, WAVE_CLEAR_PAUSE]
		var t := get_tree().create_timer(WAVE_CLEAR_PAUSE)
		t.timeout.connect(func (): _start_wave(_wave_index + 1))
	else:
		_wave_state = WaveState.COMPLETE
		wave_label.text = "ROOM CLEAR"
		# Iter 16 — Hades-style chamber reward. Small heal + a 3-relic
		# choice spawn EVERY room (not just the last). The room only
		# becomes "done" once a pedestal is claimed; until then the
		# door / run-complete is gated behind the pickup.
		_heal_on_room_clear()
		status_label.text = "Choose a relic · walk near and press [E]"
		_spawn_pedestal_offer(3)

func _spawn_enemy_type(type_id: String) -> void:
	# Iter 15: drain the pending counter regardless of whether we
	# actually spawn — a dead player or empty spawn_points still
	# needs the counter to decrement so the wave-clear check unblocks.
	_pending_spawns = maxi(0, _pending_spawns - 1)
	if not _alive or _spawn_points.is_empty():
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
	# Iter 17 — boss spawn hook. The type's is_boss flag drives the HP
	# bar UI. We bind via reference + _process polling rather than
	# adding an hp_changed signal to every enemy (the bar only needs
	# updates for one enemy in the whole scene).
	if type_res != null and type_res.is_boss:
		_boss_ref = enemy
		boss_name.text = type_res.display_name.to_upper()
		boss_hp_bar.max_value = float(type_res.max_hp)
		boss_hp_bar.value = float(type_res.max_hp)
		boss_bar.visible = true
		# Iter 22 — boss intro punctuation. Heavy camera shake + brief
		# red screen wash to mark the moment a boss enters. The shake
		# is bigger than the dash-strike connect (10 amp) so the player
		# can tell "this is something serious." ScreenFlash autoload
		# handles the wash if it exists; FX autoload handles the shake.
		if Engine.has_singleton("FX") or true:   # FX is always available; autoload
			FX.shake(BOSS_INTRO_SHAKE_AMP, BOSS_INTRO_SHAKE_TIME)
		_show_boss_intro_banner(type_res.display_name)

# Iter 16 — Hades-style 3-pedestal choice (or fewer if the registry
# is running low). Pedestals spawn in a row centered on the room and
# join the "pedestal_offer" group; claiming one dismisses the others
# via pedestal.gd's _claim sibling-sweep. If the player has already
# picked the entire registry, we skip pedestals entirely and resolve
# straight to the door (otherwise we'd offer phantom claims).
# Iter 21 — tier weights per room. Earlier rooms favor commons; later
# rooms bias toward legendaries so the player feels progress with each
# clear. Each slot in the 3-pedestal offer rolls independently against
# these weights, then a relic of that tier is drawn (without
# replacement within the offer). Falls back to other tiers cleanly if
# the rolled tier has no unowned relics left.
const TIER_WEIGHTS_BY_ROOM := [
	{ "common": 75.0, "rare": 22.0, "legendary":  3.0 },   # room 1
	{ "common": 45.0, "rare": 45.0, "legendary": 10.0 },   # room 2
	{ "common": 20.0, "rare": 45.0, "legendary": 35.0 },   # room 3
]

func _spawn_pedestal_offer(count: int) -> void:
	# Bucket all unowned relics by tier so the roller can pick a tier
	# first then draw from that tier's pool. Drawing-without-replacement
	# within the offer prevents duplicates among the 3 pedestals.
	var by_tier: Dictionary = { "common": [], "rare": [], "legendary": [] }
	for rid in GameState.RELIC_REGISTRY.keys():
		if GameState.has_relic(rid):
			continue
		var info: Dictionary = GameState.relic_info(rid)
		var tier: String = str(info.get("tier", "common"))
		if by_tier.has(tier):
			(by_tier[tier] as Array).append(rid)
	# Pick the weight table for the current room index. -1 (no floor
	# state) falls through to room 1 weights as a defensive default.
	var room_idx: int = RunState.current_room_index if RunState.current_room_index >= 0 else 0
	room_idx = clampi(room_idx, 0, TIER_WEIGHTS_BY_ROOM.size() - 1)
	var weights: Dictionary = TIER_WEIGHTS_BY_ROOM[room_idx]
	# Roll up to `count` distinct relics, each from a tier-weighted draw.
	var picks: Array[String] = []
	for i in range(count):
		var tier_pick: String = _weighted_tier_pick(weights, by_tier)
		if tier_pick == "":
			break   # no unowned relics in any tier
		var pool: Array = by_tier[tier_pick]
		var idx: int = randi() % pool.size()
		picks.append(str(pool[idx]))
		pool.remove_at(idx)   # without-replacement inside the offer
	var n: int = picks.size()
	if n == 0:
		# Nothing left to offer; full heal as consolation, then route.
		hero.heal(99)
		_resolve_room_pickup()
		return
	# Lay out the pedestals in a horizontal row centered on the play
	# field. 200 px spacing reads as "three distinct choices" without
	# crowding the player into accidentally claiming the wrong one.
	var center_x: float = 640.0
	var y: float = 384.0
	var spacing: float = 200.0
	var start_x: float = center_x - spacing * (n - 1) / 2.0
	for i in range(n):
		var ped: Pedestal = PEDESTAL_SCENE.instantiate()
		ped.global_position = Vector2(start_x + spacing * i, y)
		ped.relic_id = picks[i]
		add_child(ped)

# Weighted random tier picker. Empty tiers are excluded from the roll
# entirely (their weight contribution becomes 0), so weights
# dynamically re-balance as the player drains the pool. Returns ""
# only when EVERY tier is empty — caller treats that as offer-exhausted.
func _weighted_tier_pick(weights: Dictionary, by_tier: Dictionary) -> String:
	var total: float = 0.0
	for tier in weights:
		var pool: Array = by_tier.get(tier, [])
		if not pool.is_empty():
			total += float(weights[tier])
	if total <= 0.0:
		return ""
	var roll: float = randf() * total
	var acc: float = 0.0
	for tier in weights:
		var pool2: Array = by_tier.get(tier, [])
		if pool2.is_empty():
			continue
		acc += float(weights[tier])
		if roll <= acc:
			return str(tier)
	return ""

# Heal the hero +1 on room clear (Hades chamber-heal convention).
# Spawns a green "+1" damage number rising from the hero's head so the
# beat is visible. No-op if already at cap so the number doesn't lie.
func _heal_on_room_clear() -> void:
	if not is_instance_valid(hero) or hero.hp <= 0:
		return
	var cap: int = Hero.MAX_HP + GameState.modifier_total("max_hp_bonus", 0)
	if hero.hp >= cap:
		return
	hero.heal(1)
	var n: DamageNumber = DamageNumber.spawn(
		hero.global_position + Vector2(0, -56),
		"+1",
		Color(0.55, 1.0, 0.55),
	)
	add_child(n)

# Single entry point invoked when a pedestal in the current offer is
# claimed. Drives the room-end branch (door vs run-complete). Guarded
# against double-fire by _room_pickup_resolved so a hypothetical
# secondary pickup event doesn't double-spawn doors.
func _resolve_room_pickup() -> void:
	if _room_pickup_resolved:
		return
	_room_pickup_resolved = true
	if _room != null and _room.is_last_room:
		_show_run_complete()
	else:
		status_label.text = "The way deeper has opened · walk east to descend"
		_spawn_door()

func _on_pickup_claimed(_world_pos: Vector2, _name: String) -> void:
	# Iter 20 bugfix — Events.pickup_claimed also fires when chests open
	# (with _name = "gold"). Pre-fix, breaking ANY chest in ANY wave
	# called _resolve_room_pickup() → spawned the floor-exit door right
	# in the middle of combat. Filter: only RELIC ids resolve the room.
	# Non-relic pickups (gold today, future keys/coins) still refresh
	# the HUD if relevant but don't advance the floor.
	if not GameState.RELIC_REGISTRY.has(_name):
		return
	# Pedestal-side dismissal of siblings already happened in
	# pedestal._claim; we only need to drive the room-end branch.
	# Also refresh the HUD relic strip — a new relic just landed in
	# GameState.owned_relics and the strip needs a badge for it.
	_rebuild_relic_strip()
	_resolve_room_pickup()

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
	# Iter 21 — bridge to the audio bus. audio.gd subscribes to
	# Events.hero_swing_connected for the slash_arc whoosh-cut layered
	# on the existing hero_swing sound. We're the only emitter; hero
	# already gates its swing_connected signal on hit_count > 0.
	Events.hero_swing_connected.emit(hero.global_position)
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
	# Iter 21 — bridge to the audio bus. audio.gd subscribes to
	# Events.hero_dash_impacted for the low-thud body of the impact.
	# Fires ONCE per dash regardless of hit_count — the per-enemy
	# enemy_hit chain handles the secondary "ka-tinks."
	Events.hero_dash_impacted.emit(world_pos)
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

# Rebuild the HUD relic strip from GameState.owned_relics. Called on
# _ready (so a hypothetical mid-run reload still shows the right
# badges) and on every pickup_claimed event. Clears the strip first,
# then spawns one RelicIcon per owned id. Each icon repaints itself
# in set_relic based on the tier/name pulled from RELIC_REGISTRY, so
# the strip doesn't need to know anything about visuals.
func _rebuild_relic_strip() -> void:
	if relic_strip == null:
		return
	for child in relic_strip.get_children():
		child.queue_free()
	for rid in GameState.owned_relics:
		var icon: RelicIcon = RELIC_ICON_SCENE.instantiate()
		relic_strip.add_child(icon)
		# set_relic must run after add_child — the script's _ready
		# may rely on the node being in the tree (autoload access,
		# parent lookup for tooltips).
		icon.set_relic(rid)

func _on_hero_died() -> void:
	_alive = false
	_wave_state = WaveState.DEAD
	status_label.text = ""
	wave_label.text = ""
	# Iter 22 — DO NOT reset Engine.time_scale here. The cinematic
	# triggered by hero_death_started owns the time scale for the next
	# 1.6 seconds (slow-mo to 0.25 then back to 1.0) and queues the
	# death_screen show. _on_hero_death_started runs at the same
	# moment as this handler, so the cinematic is already underway.

# Iter 22 — death cinematic. Slow-mo + camera zoom + crimson vignette
# fade + YOU DIED banner crashing in from above, then time scale
# restores and the death_screen overlay shows. All built from code
# (no scene file changes) so the sequence is one atomic addition.
# Tween pause modes are PROCESS so they keep running while time_scale
# is < 1.0 — otherwise the slow-mo would stall the tweens themselves.
func _on_hero_death_started(world_pos: Vector2) -> void:
	# Slow-mo: time_scale 1.0 → 0.25 over 0.4s.
	var t_time: Tween = create_tween()
	t_time.set_pause_mode(Tween.TWEEN_PAUSE_PROCESS)
	t_time.tween_property(Engine, "time_scale", DEATH_TIME_SCALE_MIN, 0.4)
	# Camera punch-in to 1.4× over 0.6s. The camera lives under Hero;
	# we tween its zoom directly.
	var cam: Camera2D = $Hero/Camera2D
	if cam != null:
		var t_cam: Tween = create_tween()
		t_cam.set_pause_mode(Tween.TWEEN_PAUSE_PROCESS)
		t_cam.tween_property(cam, "zoom", DEATH_CAMERA_ZOOM_END, 0.6).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	# Build a full-screen crimson veil + banner on a fresh CanvasLayer
	# above the HUD (layer 50; HUD is 0, death_screen is 200, so we
	# sit between). Veil fades to alpha 0.72; banner crashes in from
	# offset_top=-400 to -60 with a back-ease so it overshoots.
	var veil_layer: CanvasLayer = CanvasLayer.new()
	veil_layer.layer = 50
	add_child(veil_layer)
	var veil: ColorRect = ColorRect.new()
	veil.color = Color(0.1, 0.0, 0.0, 0.0)
	veil.anchor_right = 1.0
	veil.anchor_bottom = 1.0
	veil.mouse_filter = Control.MOUSE_FILTER_IGNORE
	veil_layer.add_child(veil)
	var t_veil: Tween = create_tween()
	t_veil.set_pause_mode(Tween.TWEEN_PAUSE_PROCESS)
	t_veil.tween_property(veil, "color:a", DEATH_VEIL_FINAL_ALPHA, DEATH_VEIL_FADE_TIME)
	var banner: Label = Label.new()
	banner.text = "YOU DIED"
	banner.add_theme_font_size_override("font_size", 96)
	banner.add_theme_color_override("font_color", Color(0.95, 0.1, 0.12))
	banner.add_theme_color_override("font_outline_color", Color(0, 0, 0))
	banner.add_theme_constant_override("outline_size", 8)
	banner.anchor_left = 0.5
	banner.anchor_right = 0.5
	banner.anchor_top = 0.3
	banner.anchor_bottom = 0.3
	banner.offset_left = -320
	banner.offset_right = 320
	banner.offset_top = -400   # off-screen above
	banner.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	veil_layer.add_child(banner)
	var t_banner: Tween = create_tween()
	t_banner.set_pause_mode(Tween.TWEEN_PAUSE_PROCESS)
	t_banner.tween_interval(DEATH_BANNER_DELAY)
	t_banner.tween_property(banner, "offset_top", -60.0, 0.35).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	# Restore time_scale at 1.2s, show death_screen at 1.6s.
	var t_end: Tween = create_tween()
	t_end.set_pause_mode(Tween.TWEEN_PAUSE_PROCESS)
	t_end.tween_interval(DEATH_RESTORE_AT)
	t_end.tween_property(Engine, "time_scale", 1.0, DEATH_SHOW_SCREEN_AT - DEATH_RESTORE_AT)
	t_end.tween_callback(func() -> void:
		if _death_screen != null and _death_screen.has_method("show_death"):
			_death_screen.show_death(_kills)
	)
	# world_pos param reserved for future use (e.g. spawn an arrow
	# pointing at the death site from the death_screen). Silences the
	# UNUSED_PARAMETER warning.
	var _unused: Vector2 = world_pos

func _on_death_retry() -> void:
	# Retry = restart THIS floor from room 0. Easier UX than dropping
	# the player into the room they died on with no preamble.
	Engine.time_scale = 1.0
	GameState.start_dungeon_run()
	RunState.start_floor()
	get_tree().reload_current_scene()

# Iter 16 — run-complete sequence. Replaces the previous "claim the
# pedestal, then ESC to leave" flow (which left the player staring at
# a stale 'walk to pedestal' status_label with no celebratory beat).
# Now: a brief gold banner + summary, then auto-return to menu after
# 2.5s so the run actually FEELS like it ended.
const RUN_COMPLETE_DELAY := 2.5
func _show_run_complete() -> void:
	wave_label.text = "RUN COMPLETE"
	# Compose a one-line summary of what the player walked out with.
	# Uses the GOLD color family so it reads distinctly from the
	# crimson death banner.
	var relic_names: Array[String] = []
	for rid in GameState.owned_relics:
		var info: Dictionary = GameState.relic_info(rid)
		relic_names.append(str(info.get("name", rid)))
	var summary: String = "%d kills" % _kills
	if relic_names.size() > 0:
		summary += "  ·  " + " · ".join(relic_names)
	status_label.text = summary
	# Big floating banner so the moment registers even if the player's
	# eyes are still tracking the hero, not the HUD corner.
	var banner: DamageNumber = DamageNumber.spawn(
		hero.global_position + Vector2(0, -96),
		"FLOOR COMPLETE",
		Color(1, 0.85, 0.45),
	)
	add_child(banner)
	Engine.time_scale = 1.0
	var t := get_tree().create_timer(RUN_COMPLETE_DELAY)
	t.timeout.connect(_on_death_to_menu)

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

# Iter 22 — center-screen wave banner. Spawns a one-shot Label on a
# fresh CanvasLayer above the HUD, tweens it through
#   ALPHA: 0 → 1 (0.18s in) → hold for WAVE_BANNER_HOLD → fade to 0
#   SCALE: 1.4 → 1.0 (0.18s in) — settles from "crash in" to neutral
# then queue_frees both the layer and label. Lives outside main.tscn
# so adding wave 4/5/6 doesn't need scene edits, and the corner
# wave_label keeps its persistent role.
func _show_wave_banner(wave_idx_1based: int, wave_total: int) -> void:
	var layer: CanvasLayer = CanvasLayer.new()
	layer.layer = 40   # above HUD (0), below death veil (50)
	add_child(layer)
	var lbl: Label = Label.new()
	lbl.text = "WAVE %d / %d" % [wave_idx_1based, wave_total]
	lbl.add_theme_font_size_override("font_size", 56)
	lbl.add_theme_color_override("font_color", Color(1, 0.92, 0.7, 1))
	lbl.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.95))
	lbl.add_theme_constant_override("outline_size", 6)
	lbl.anchor_left = 0.5
	lbl.anchor_right = 0.5
	lbl.anchor_top = 0.42
	lbl.anchor_bottom = 0.42
	lbl.offset_left = -260
	lbl.offset_right = 260
	lbl.offset_top = -36
	lbl.offset_bottom = 36
	lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	lbl.pivot_offset = Vector2(260, 36)
	lbl.modulate = Color(1, 1, 1, 0)
	lbl.scale = Vector2(1.4, 1.4)
	layer.add_child(lbl)
	# Punch-in: alpha + scale in parallel, then hold, then fade.
	var tw: Tween = create_tween().set_parallel(true)
	tw.tween_property(lbl, "modulate:a", 1.0, 0.18).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tw.tween_property(lbl, "scale", Vector2.ONE, 0.18).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	var tw2: Tween = create_tween()
	tw2.tween_interval(0.18 + WAVE_BANNER_HOLD)
	tw2.tween_property(lbl, "modulate:a", 0.0, WAVE_BANNER_DURATION - 0.18 - WAVE_BANNER_HOLD)
	tw2.tween_callback(layer.queue_free)

# Iter 22 — boss intro banner. Bigger + redder than the wave banner;
# also longer-lived. Pairs with the FX.shake(BOSS_INTRO_SHAKE_AMP)
# call in _spawn_enemy_type to mark "this is something serious."
func _show_boss_intro_banner(display_name: String) -> void:
	var layer: CanvasLayer = CanvasLayer.new()
	layer.layer = 40
	add_child(layer)
	var lbl: Label = Label.new()
	lbl.text = display_name.to_upper()
	lbl.add_theme_font_size_override("font_size", 72)
	lbl.add_theme_color_override("font_color", Color(1, 0.35, 0.35, 1))
	lbl.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.95))
	lbl.add_theme_constant_override("outline_size", 7)
	lbl.anchor_left = 0.5
	lbl.anchor_right = 0.5
	lbl.anchor_top = 0.36
	lbl.anchor_bottom = 0.36
	lbl.offset_left = -360
	lbl.offset_right = 360
	lbl.offset_top = -48
	lbl.offset_bottom = 48
	lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	lbl.pivot_offset = Vector2(360, 48)
	lbl.modulate = Color(1, 1, 1, 0)
	lbl.scale = Vector2(1.6, 1.6)
	layer.add_child(lbl)
	var tw: Tween = create_tween().set_parallel(true)
	tw.tween_property(lbl, "modulate:a", 1.0, 0.25).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tw.tween_property(lbl, "scale", Vector2.ONE, 0.25).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	var tw2: Tween = create_tween()
	tw2.tween_interval(0.95)
	tw2.tween_property(lbl, "modulate:a", 0.0, 0.5)
	tw2.tween_callback(layer.queue_free)
