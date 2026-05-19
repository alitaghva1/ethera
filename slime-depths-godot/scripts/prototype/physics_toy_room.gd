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
# Pre-readability pass: uniform 0.06×/0.08s on every valid slam.
# Now scaled by impact velocity overshoot so a marginal-threshold tap
# freezes lightly + a heavy slam freezes hard. The player should INSTANTLY
# tell the difference between "barely qualified" and "real slam."
const HIT_STOP_SCALE_LIGHT: float = 0.18   # marginal slam (just over thresh)
const HIT_STOP_TIME_LIGHT: float = 0.05
const HIT_STOP_SCALE_HEAVY: float = 0.05   # full-bore slam
const HIT_STOP_TIME_HEAVY: float = 0.12
# Velocity overshoot above MIN_DAMAGE_VEL that maps to "heavy" slam.
# Below this we lerp between LIGHT and HEAVY values for smooth scaling.
const HIT_STOP_FULL_OVERSHOOT: float = 200.0

# ── Spawn config ─────────────────────────────────────────────────────
const ENEMIES_PER_WAVE: int = 5
const RESPAWN_DELAY: float = 1.2

# ── Shake mapping (impact_vel → camera amp) ──────────────────────────
# Same shape as hit-stop: ramps with overshoot rather than firing
# uniform amp on every valid hit. SHAKE_MIN ensures a slam-at-threshold
# still feels like an event.
const SHAKE_MIN: float = 5.0
const SHAKE_MAX: float = 16.0
const SHAKE_DUR: float = 0.16

# ── Reset / spawn anchor points ──────────────────────────────────────
# Room interior is x=300..980, y=140..580 → center is (640, 360).
# Gravestone home is 100 px right of hero — within the 100-px TETHER_REST
# so it reads "leashed" from the first frame.
const HERO_HOME: Vector2 = Vector2(640, 360)
const GRAVESTONE_HOME: Vector2 = Vector2(740, 360)

# Mirror of CursedGravestone.MIN_DAMAGE_VEL. Duplicated here so the
# debug panel can show the threshold every frame without taking a
# cross-file class_name dependency (see toy_hero.gd / cursed_gravestone.gd
# header notes — Godot 4's class_name registration is order-dependent
# on first project load).
const DEBUG_DAMAGE_VEL_THRESHOLD: float = 260.0

# ── Pillar layout (PILLAR_ROOM) ──────────────────────────────────────
# 4 pillars closer to center than before so the gravestone can
# realistically ricochet off + get caught on them mid-swing. Room
# interior is now 680×440; placing the pillars near (450, 260) /
# (830, 260) / (450, 460) / (830, 460) keeps a ~190-px-wide central
# corridor open for hero+gravestone maneuvering. Radius 30 px is a
# hair smaller than before; gravestone (~52 px) still wraps around
# them, chasers (~28 px) still path past them.
const PILLAR_RADIUS: float = 30.0
const PILLAR_POSITIONS: Array[Vector2] = [
	Vector2(450, 260),
	Vector2(830, 260),
	Vector2(450, 460),
	Vector2(830, 460),
]

# ── Chokepoint layout (CHOKEPOINT) ───────────────────────────────────
# Single horizontal interior wall splitting the room at y=400, with a
# narrower 140-px center gap (was 240 before the shrink). Forces
# enemies through a real squeeze where the gravestone can lock them
# in place. Wall slabs land at x=300..520 (left) and x=760..980 (right).
const CHOKEPOINT_LEFT_CENTER: Vector2 = Vector2(410, 400)
const CHOKEPOINT_LEFT_SIZE: Vector2 = Vector2(220, 36)
const CHOKEPOINT_RIGHT_CENTER: Vector2 = Vector2(870, 400)
const CHOKEPOINT_RIGHT_SIZE: Vector2 = Vector2(220, 36)

# ── Spawn points per room type ───────────────────────────────────────
# Loose ring around the hero at ~200 px so chasers reach contact in
# ~2.5 s at MOVE_SPEED 80. Stays within the tight interior bounds
# (x=300..980, y=140..580). Used by OPEN_ARENA + PILLAR_ROOM.
const SPAWN_RING: Array[Vector2] = [
	Vector2(640, 200),
	Vector2(820, 260),
	Vector2(820, 470),
	Vector2(460, 470),
	Vector2(460, 260),
]
# All 5 below the chokepoint wall (y > 470) so enemies MUST funnel up
# through the 140-px gap. Closer to the wall than before so the player
# doesn't wait 5 s for them to reach the chokepoint.
const SPAWN_CHOKEPOINT: Array[Vector2] = [
	Vector2(640, 540),
	Vector2(420, 500),
	Vector2(860, 500),
	Vector2(540, 560),
	Vector2(740, 560),
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
@onready var tether_line: Line2D = $TetherLine
@onready var debug_panel: Label = $UI/DebugPanel
@onready var hint_label: Label = $UI/HintLabel

var _hit_stop_timer: float = 0.0
var _respawn_pending: bool = false
# F1 toggles the debug panel visibility. Default visible.
var _debug_visible: bool = true

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
		KEY_F1:
			_debug_visible = not _debug_visible
			if debug_panel != null:
				debug_panel.visible = _debug_visible

func _switch_room(rt: RoomType) -> void:
	_room_type = rt
	_build_room(rt)
	_reset_entities_and_respawn()

# Reset clears entities and respawns the wave WITHOUT rebuilding
# obstacles. Same room geometry, fresh enemies, hero+gravestone home.
func _reset_current_room() -> void:
	_reset_entities_and_respawn()

# ── Per-frame: hit-stop tick + tether line + debug panel refresh ─────
func _process(_delta: float) -> void:
	if _hit_stop_timer > 0.0:
		_hit_stop_timer -= 1.0 / 60.0
		if _hit_stop_timer <= 0.0:
			Engine.time_scale = 1.0
	_update_tether_line()
	_update_debug_panel()

# Redraw the tether between hero and gravestone every frame. Two-point
# Line2D — straight cord, no slack physics. Cheap (just sets the
# points array); the Line2D renders behind both entities via the
# scene's z_index = -1.
func _update_tether_line() -> void:
	if tether_line == null or hero == null or gravestone == null:
		return
	tether_line.points = PackedVector2Array([
		hero.global_position,
		gravestone.global_position,
	])

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
			# Open arena AND pillar room share the ring layout. Ring
			# is at ~200 px from hero so combat starts within ~2.5 s
			# (MOVE_SPEED 80 × 2.5 = 200). For the pillar room, the
			# ring positions are between/outside the pillars so
			# chasers naturally path around them.
			return SPAWN_RING

func _spawn_blob(pos: Vector2) -> void:
	var blob: Node = ENEMY_SCENE.instantiate()
	if blob is CharacterBody2D:
		(blob as CharacterBody2D).global_position = pos
	blob.set("player_path", hero.get_path())
	enemy_layer.add_child(blob)

# ── Hit-feedback API (called by BlobChaser.take_hit) ─────────────────
# Hit-stop AND shake scale with impact overshoot. A marginal-threshold
# slam (just over MIN_DAMAGE_VEL) freezes lightly + shakes lightly; a
# full-bore slam freezes deep + shakes hard. The player should
# INSTANTLY tell the difference between "barely qualified hit" and
# "real slam" without reading the debug panel.
#
# Slow bumps (impact_vel < MIN_DAMAGE_VEL) never reach this function —
# they're filtered out in CursedGravestone._on_body_entered. Below-
# threshold contact produces NO feedback (no shake, no flash, no
# stop), which is the right contrast.
func on_gravestone_impact(world_pos: Vector2, impact_vel: float) -> void:
	# Mirror of CursedGravestone.MIN_DAMAGE_VEL — used as the base of
	# the overshoot calc here. Kept in sync via the matching constant
	# DEBUG_DAMAGE_VEL_THRESHOLD below.
	var overshoot: float = impact_vel - DEBUG_DAMAGE_VEL_THRESHOLD
	var t: float = clampf(overshoot / HIT_STOP_FULL_OVERSHOOT, 0.0, 1.0)
	# Lerp the hit-stop scale + duration AND the shake amp between the
	# LIGHT and HEAVY presets so the feel ramps smoothly with slam force.
	var stop_scale: float = lerpf(HIT_STOP_SCALE_LIGHT, HIT_STOP_SCALE_HEAVY, t)
	var stop_time: float = lerpf(HIT_STOP_TIME_LIGHT, HIT_STOP_TIME_HEAVY, t)
	var shake_amp: float = lerpf(SHAKE_MIN, SHAKE_MAX, t)
	Engine.time_scale = stop_scale
	_hit_stop_timer = stop_time
	FX.shake(shake_amp, SHAKE_DUR)
	# Fires audio.gd's enemy_hit beep AND fx.gd's HIT_SPARK particle
	# burst — both already subscribed to Events.enemy_hit.
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
