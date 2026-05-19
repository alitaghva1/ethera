# PhysicsToyRoom — root scene controller for the physics-tether
# prototype. Owns the hero, the gravestone, the enemy layer, the
# impact-feedback pipeline (hit-stop + shake + particles + audio),
# and (added this iteration) a room-type switcher with three layouts
# for testing the gravestone mechanic under different geometry.
#
# Room types (hot-swap via debug keys 1 / 2 / 3, reset via R):
#
#   OPEN_ARENA      Empty rectangle. Tests raw movement, pull,
#                   release, swing, and damage threshold.
#
#   PILLAR_ROOM     4 static circular pillars in an inner square.
#                   Tests ricochet, wrapping the tether around an
#                   obstacle, gravestone getting caught, and using
#                   the obstacle as cover.
#
#   CHOKEPOINT      One interior horizontal wall split into two
#                   slabs with a 240-px gap at center. Enemies
#                   spawn below; hero starts above. Tests using the
#                   gravestone defensively as a battering ram in
#                   the doorway.
#
# Architecture choice: one scene, one ObstacleLayer node. Switching
# rooms clears + rebuilds the ObstacleLayer programmatically. No new
# scenes, no new scripts — the room types are just different layout
# functions plus a state enum.
#
# Impact feedback pipeline runs through:
#   • Engine.time_scale freeze (HIT_STOP_SCALE for HIT_STOP_TIME
#     real-seconds). Timer decrements by 1/60 per frame so it
#     measures wall-clock time regardless of time_scale.
#   • FX.shake(amp, dur) — reuses the existing FX autoload.
#   • Events.enemy_hit.emit — fires audio.gd's enemy_hit beep AND
#     fx.gd's HIT_SPARK particle burst (both already subscribed in
#     the main project).
#
# Debug panel (top-right, multi-line Label) updates each frame with:
#   VEL      gravestone linear velocity in px/s
#   SLAM     "YES" / "no" — above MIN_DAMAGE_VEL threshold
#   ROOM     current room type label
#   ENEMIES  alive enemy count (excludes corpses mid-fade)
extends Node2D

const ENEMY_SCENE: PackedScene = preload("res://scenes/prototype/blob_chaser.tscn")

# ── Hit-stop tuning ──────────────────────────────────────────────────
const HIT_STOP_SCALE: float = 0.06   # 94% slowdown — deep freeze beat
const HIT_STOP_TIME: float = 0.08    # ~5 frames at 60fps real-time

# ── Spawn config ─────────────────────────────────────────────────────
const ENEMIES_PER_WAVE: int = 5
const RESPAWN_DELAY: float = 1.5

# ── Shake mapping (impact_vel → camera amp) ──────────────────────────
const SHAKE_PER_VEL: float = 0.035
const SHAKE_MAX: float = 18.0
const SHAKE_DUR: float = 0.18

# ── Reset / spawn anchor points ──────────────────────────────────────
const HERO_HOME: Vector2 = Vector2(640, 360)
const GRAVESTONE_HOME: Vector2 = Vector2(780, 360)

# Mirror of CursedGravestone.MIN_DAMAGE_VEL. Duplicated here so the
# debug panel can show the threshold every frame without taking a
# cross-file class_name dependency (see toy_hero.gd / cursed_gravestone.gd
# header notes — Godot 4's class_name registration is order-dependent
# on first project load).
const DEBUG_DAMAGE_VEL_THRESHOLD: float = 260.0

# ── Pillar layout (PILLAR_ROOM) ──────────────────────────────────────
# 4 pillars at the corners of an inner rectangle. Center stays open
# so the hero + gravestone have room to maneuver. Radius 32 px gives
# the gravestone (~44 px tall) something to wrap around without
# letting tiny chasers (28 px) get stuck on them.
const PILLAR_RADIUS: float = 32.0
const PILLAR_POSITIONS: Array[Vector2] = [
	Vector2(380, 220),
	Vector2(900, 220),
	Vector2(380, 500),
	Vector2(900, 500),
]

# ── Chokepoint layout (CHOKEPOINT) ───────────────────────────────────
# Single horizontal interior wall at y=400, split into two slabs with
# a 240-px gap at x=520..760. Enemies spawn below the wall; the hero
# above. Forces funneling.
const CHOKEPOINT_WALL_Y: float = 400.0
const CHOKEPOINT_WALL_HEIGHT: float = 40.0
const CHOKEPOINT_LEFT_CENTER: Vector2 = Vector2(300, 400)
const CHOKEPOINT_LEFT_SIZE: Vector2 = Vector2(440, 40)
const CHOKEPOINT_RIGHT_CENTER: Vector2 = Vector2(980, 400)
const CHOKEPOINT_RIGHT_SIZE: Vector2 = Vector2(440, 40)

# ── Spawn points per room type ───────────────────────────────────────
const SPAWN_OPEN_OR_PILLAR: Array[Vector2] = [
	Vector2(180, 160),
	Vector2(1100, 160),
	Vector2(180, 560),
	Vector2(1100, 560),
	Vector2(640, 140),
]
# All 5 below the chokepoint wall (y > 460) — enemies MUST funnel
# through the gap to reach the hero up top.
const SPAWN_CHOKEPOINT: Array[Vector2] = [
	Vector2(200, 620),
	Vector2(640, 640),
	Vector2(1080, 620),
	Vector2(420, 540),
	Vector2(860, 540),
]

# ── Room type state ──────────────────────────────────────────────────
enum RoomType { OPEN_ARENA, PILLAR_ROOM, CHOKEPOINT }
var _room_type: RoomType = RoomType.OPEN_ARENA

# ── Visual constants for procedurally-built obstacles ────────────────
const OBSTACLE_COLOR: Color = Color(0.32, 0.26, 0.36, 1.0)
const WALL_COLOR: Color = Color(0.22, 0.18, 0.26, 1.0)

# ── Node refs (base-typed; duck-typed at usage — see header) ─────────
@onready var hero: CharacterBody2D = $ToyHero
@onready var gravestone: RigidBody2D = $CursedGravestone
@onready var obstacle_layer: Node2D = $ObstacleLayer
@onready var enemy_layer: Node2D = $EnemyLayer
@onready var enemies_left_label: Label = $UI/EnemiesLeft
@onready var debug_panel: Label = $UI/DebugPanel

var _hit_stop_timer: float = 0.0
var _respawn_pending: bool = false

func _ready() -> void:
	gravestone.player_path = hero.get_path()
	# Build the default room (OPEN_ARENA = no obstacles) + first wave
	# on the next idle frame, so @onready resolution finishes and the
	# gravestone's _ready (which reads player_path) gets a chance to
	# run before chasers start chasing.
	_build_room(_room_type)
	call_deferred("_spawn_wave")

# ── Input: debug room-swap + reset ───────────────────────────────────
# Direct keycode read via _input rather than Input.is_action_just_pressed
# so we don't have to register 4 new InputMap actions for debug keys.
# event.echo guard so holding the key doesn't re-fire each frame.
func _input(event: InputEvent) -> void:
	if not (event is InputEventKey):
		return
	var ek := event as InputEventKey
	if not ek.pressed or ek.echo:
		return
	match ek.physical_keycode:
		KEY_1:
			_switch_room(RoomType.OPEN_ARENA)
		KEY_2:
			_switch_room(RoomType.PILLAR_ROOM)
		KEY_3:
			_switch_room(RoomType.CHOKEPOINT)
		KEY_R:
			_reset_current_room()

func _switch_room(rt: RoomType) -> void:
	_room_type = rt
	_build_room(rt)
	_reset_entities_and_respawn()

# Reset clears entities and respawns the wave WITHOUT rebuilding
# obstacles. Same room geometry, fresh enemies, hero+gravestone home.
func _reset_current_room() -> void:
	_reset_entities_and_respawn()

# ── Per-frame: hit-stop tick + debug panel refresh ───────────────────
func _process(_delta: float) -> void:
	if _hit_stop_timer > 0.0:
		_hit_stop_timer -= 1.0 / 60.0
		if _hit_stop_timer <= 0.0:
			Engine.time_scale = 1.0
	_update_label()
	_update_debug_panel()

func _update_label() -> void:
	if enemies_left_label == null or enemy_layer == null:
		return
	enemies_left_label.text = "ENEMIES  %d" % _alive_enemy_count()

func _update_debug_panel() -> void:
	if debug_panel == null:
		return
	var v: float = 0.0
	if gravestone != null:
		v = gravestone.linear_velocity.length()
	var slam_flag: String = "YES" if v >= DEBUG_DAMAGE_VEL_THRESHOLD else "no"
	debug_panel.text = (
		"VEL    %5.0f px/s\n" +
		"SLAM   %s\n" +
		"ROOM   %s\n" +
		"ENEMIES %d"
	) % [v, slam_flag, _room_type_label(_room_type), _alive_enemy_count()]

func _room_type_label(rt: RoomType) -> String:
	match rt:
		RoomType.OPEN_ARENA:
			return "OPEN ARENA"
		RoomType.PILLAR_ROOM:
			return "PILLAR ROOM"
		RoomType.CHOKEPOINT:
			return "CHOKEPOINT"
	return "?"

# Count chasers that are NOT in their fade-out animation.
func _alive_enemy_count() -> int:
	var n: int = 0
	for child in enemy_layer.get_children():
		if child.is_in_group("toy_enemies") and not bool(child.get("_dying")):
			n += 1
	return n

# ── Room-build dispatch ──────────────────────────────────────────────
func _build_room(rt: RoomType) -> void:
	_clear_obstacles()
	match rt:
		RoomType.OPEN_ARENA:
			pass  # empty rectangle — no obstacles to build
		RoomType.PILLAR_ROOM:
			for p in PILLAR_POSITIONS:
				_build_pillar(p, PILLAR_RADIUS)
		RoomType.CHOKEPOINT:
			_build_wall_slab(CHOKEPOINT_LEFT_CENTER, CHOKEPOINT_LEFT_SIZE)
			_build_wall_slab(CHOKEPOINT_RIGHT_CENTER, CHOKEPOINT_RIGHT_SIZE)

func _clear_obstacles() -> void:
	for child in obstacle_layer.get_children():
		child.queue_free()

# Build one circular pillar at `pos`. Layer 1 (world), mask 0
# (static — doesn't notice anyone, everyone notices it).
func _build_pillar(pos: Vector2, radius: float) -> void:
	var body := StaticBody2D.new()
	body.position = pos
	body.collision_layer = 1
	body.collision_mask = 0
	var shape_node := CollisionShape2D.new()
	var shape := CircleShape2D.new()
	shape.radius = radius
	shape_node.shape = shape
	body.add_child(shape_node)
	var visual := Polygon2D.new()
	var pts := PackedVector2Array()
	for i in range(16):
		var a: float = (float(i) / 16.0) * TAU
		pts.append(Vector2(cos(a), sin(a)) * radius)
	visual.polygon = pts
	visual.color = OBSTACLE_COLOR
	body.add_child(visual)
	obstacle_layer.add_child(body)

# Build one rectangular wall slab. Layer 1 / mask 0, same as the
# exterior walls in the .tscn — gravestone + enemies both collide.
func _build_wall_slab(center: Vector2, size: Vector2) -> void:
	var body := StaticBody2D.new()
	body.position = center
	body.collision_layer = 1
	body.collision_mask = 0
	var shape_node := CollisionShape2D.new()
	var shape := RectangleShape2D.new()
	shape.size = size
	shape_node.shape = shape
	body.add_child(shape_node)
	var visual := Polygon2D.new()
	var hw: float = size.x * 0.5
	var hh: float = size.y * 0.5
	visual.polygon = PackedVector2Array([
		Vector2(-hw, -hh), Vector2(hw, -hh),
		Vector2(hw, hh), Vector2(-hw, hh),
	])
	visual.color = WALL_COLOR
	body.add_child(visual)
	obstacle_layer.add_child(body)

# ── Entity reset / wave spawn ────────────────────────────────────────
func _reset_entities_and_respawn() -> void:
	# Cancel any in-flight hit-stop so the reset isn't sluggish.
	Engine.time_scale = 1.0
	_hit_stop_timer = 0.0
	# Wipe all chasers (including mid-fade corpses).
	for child in enemy_layer.get_children():
		child.queue_free()
	_respawn_pending = false
	# Reset hero + gravestone.
	if hero != null:
		hero.global_position = HERO_HOME
		hero.velocity = Vector2.ZERO
	if gravestone != null:
		gravestone.global_position = GRAVESTONE_HOME
		gravestone.linear_velocity = Vector2.ZERO
		gravestone.angular_velocity = 0.0
	# Respawn the wave on the next idle tick so queue_free of the old
	# chasers can flush first (otherwise our spawn count might
	# briefly include corpses).
	call_deferred("_spawn_wave")

func _spawn_wave() -> void:
	var points: Array[Vector2] = _spawn_points_for_current_room()
	for i in range(ENEMIES_PER_WAVE):
		var pos: Vector2 = points[i % points.size()]
		_spawn_blob(pos)

func _spawn_points_for_current_room() -> Array[Vector2]:
	match _room_type:
		RoomType.CHOKEPOINT:
			return SPAWN_CHOKEPOINT
		_:
			# Open arena AND pillar room share corner spawns. Pillars
			# are inside the rectangle, so spawn-corner pathing around
			# them tests the "chasers navigate obstacles" case.
			return SPAWN_OPEN_OR_PILLAR

func _spawn_blob(pos: Vector2) -> void:
	var blob: Node = ENEMY_SCENE.instantiate()
	if blob is CharacterBody2D:
		(blob as CharacterBody2D).global_position = pos
	blob.set("player_path", hero.get_path())
	enemy_layer.add_child(blob)

# ── Hit-feedback API (called by BlobChaser.take_hit) ─────────────────
func on_gravestone_impact(world_pos: Vector2, impact_vel: float) -> void:
	Engine.time_scale = HIT_STOP_SCALE
	_hit_stop_timer = HIT_STOP_TIME
	FX.shake(min(impact_vel * SHAKE_PER_VEL, SHAKE_MAX), SHAKE_DUR)
	Events.enemy_hit.emit(world_pos)

# Called by BlobChaser._die. Schedules a fresh wave if this kill
# emptied the room.
func on_enemy_killed(_blob: Node) -> void:
	if _respawn_pending:
		return
	var remaining: int = _alive_enemy_count() - 1
	if remaining > 0:
		return
	_respawn_pending = true
	await get_tree().create_timer(RESPAWN_DELAY, true, false, true).timeout
	_respawn_pending = false
	_spawn_wave()
