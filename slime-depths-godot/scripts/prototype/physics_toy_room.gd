# PhysicsToyRoom — root scene controller for the physics-tether
# prototype. Owns the hero, the gravestone, the enemy layer, and the
# impact-feedback pipeline (hit-stop + shake + particles + audio).
#
# Single-screen 1280×720 rectangle. Five blob chasers spawn at the
# corners + top-center; when the count hits 0, a new wave spawns
# after RESPAWN_DELAY so testing can continue without restarting the
# scene.
#
# Impact feedback runs through:
#   • Engine.time_scale freeze (HIT_STOP_SCALE for HIT_STOP_TIME real-
#     seconds). The timer decrements in _process by a fixed 1/60 each
#     frame so it counts wall-clock time regardless of time_scale —
#     same trick main.gd uses for its hit-stop timer.
#   • FX.shake(amp, dur) — reuses the existing FX autoload from the
#     main project. The autoload walks the current scene for a
#     Camera2D named "Camera2D", so we have one as a direct child of
#     this room.
#   • Events.enemy_hit.emit(world_pos) — fires the existing audio.gd
#     enemy_hit sting + fx.gd hit_spark spawn. Reusing the bus rather
#     than building local audio/FX keeps this scene under 100 lines.
#
# The audio "placeholder" is the existing enemy_hit beep (audio.gd
# generates it procedurally — no asset needed). That's enough to
# answer "does the slam feel satisfying with sound?"
extends Node2D

const ENEMY_SCENE: PackedScene = preload("res://scenes/prototype/blob_chaser.tscn")

# ── Hit-stop tuning ──────────────────────────────────────────────────
const HIT_STOP_SCALE: float = 0.06   # 94% slowdown — deep freeze beat
const HIT_STOP_TIME: float = 0.08    # ~5 frames at 60fps real-time

# ── Spawn config ─────────────────────────────────────────────────────
const ENEMIES_PER_WAVE: int = 5
const RESPAWN_DELAY: float = 1.5

# ── Shake mapping (impact_vel → camera amp) ──────────────────────────
# A min-velocity hit (260 px/s) → amp ~9. A peak hit (~600 px/s) → 21
# but capped at 18 so the screen doesn't go nauseous on heavy slams.
const SHAKE_PER_VEL: float = 0.035
const SHAKE_MAX: float = 18.0
const SHAKE_DUR: float = 0.18

# Base-typed (not class_name'd) because Godot 4's class_name registration
# is order-dependent on first project load — strong-typing across files
# can hit "Could not find type 'X' in scope" on a fresh boot. Each of
# these duck-types into the prototype-specific surface:
#   hero:        reads .pulling (ToyHero)
#   gravestone:  writes .player_path (CursedGravestone)
#   enemy_layer: standard Node2D
@onready var hero: CharacterBody2D = $ToyHero
@onready var gravestone: RigidBody2D = $CursedGravestone
@onready var enemy_layer: Node2D = $EnemyLayer
@onready var enemies_left_label: Label = $UI/EnemiesLeft

var _hit_stop_timer: float = 0.0
var _respawn_pending: bool = false

# Spawn positions for the 5 chasers. Hand-picked to be at the room
# corners + top-center so the player has to move to engage all of
# them — no single safe spot at room start.
var _spawn_points: Array[Vector2] = [
	Vector2(180, 160),
	Vector2(1100, 160),
	Vector2(180, 560),
	Vector2(1100, 560),
	Vector2(640, 140),
]

func _ready() -> void:
	# Wire the gravestone's player_path AT RUNTIME using ABSOLUTE
	# paths. Relative get_path_to() requires both nodes to be in the
	# tree under a common parent — fine for nodes already in the
	# .tscn, but fragile if we ever spawn the gravestone dynamically.
	# Absolute paths work in both cases.
	gravestone.player_path = hero.get_path()
	# Defer wave spawn so @onready resolution and the gravestone's
	# _ready (which reads player_path) both finish before chasers
	# start trying to chase a not-yet-fully-initialized hero.
	call_deferred("_spawn_wave")

func _process(_delta: float) -> void:
	# Hit-stop tick. Decrement at 1/60 per FRAME (not delta!) so the
	# timer measures wall-clock time, not engine time. When time_scale
	# is 0.06, delta is ~0.001s — counting that would mean the freeze
	# lasts 16× longer than intended.
	if _hit_stop_timer > 0.0:
		_hit_stop_timer -= 1.0 / 60.0
		if _hit_stop_timer <= 0.0:
			Engine.time_scale = 1.0
	_update_label()

func _update_label() -> void:
	if enemies_left_label == null or enemy_layer == null:
		return
	enemies_left_label.text = "ENEMIES  %d" % _alive_enemy_count()

# Count chasers that are NOT in their fade-out animation. The dying
# chaser stays in the tree for 0.25s while its alpha tweens; for
# the HUD readout we want the "fightable" count, not the tree count.
# Dynamic property access avoids a class_name dependency on BlobChaser.
func _alive_enemy_count() -> int:
	var n: int = 0
	for child in enemy_layer.get_children():
		if child.is_in_group("toy_enemies") and not bool(child.get("_dying")):
			n += 1
	return n

func _spawn_wave() -> void:
	for i in range(ENEMIES_PER_WAVE):
		var pos: Vector2 = _spawn_points[i % _spawn_points.size()]
		_spawn_blob(pos)

func _spawn_blob(pos: Vector2) -> void:
	var blob: Node = ENEMY_SCENE.instantiate()
	if blob is CharacterBody2D:
		(blob as CharacterBody2D).global_position = pos
	# Use the hero's ABSOLUTE path. The blob isn't in the tree until
	# add_child below — get_path_to (relative) would fail with "no
	# common parent." set() before add_child means blob._ready (which
	# resolves the path) sees a populated NodePath on first tick.
	blob.set("player_path", hero.get_path())
	enemy_layer.add_child(blob)

# ── Hit-feedback API (called by BlobChaser.take_hit) ─────────────────
func on_gravestone_impact(world_pos: Vector2, impact_vel: float) -> void:
	# Hit-stop: freeze the world for a tactile beat. Overwrites any
	# in-flight stop so consecutive slams always land at the new
	# scale (rather than the smaller of the two).
	Engine.time_scale = HIT_STOP_SCALE
	_hit_stop_timer = HIT_STOP_TIME
	# Camera shake scaled by impact velocity. Capped so a max-velocity
	# slam doesn't shake the screen into nausea.
	FX.shake(min(impact_vel * SHAKE_PER_VEL, SHAKE_MAX), SHAKE_DUR)
	# Fires audio.gd's enemy_hit beep AND fx.gd's HIT_SPARK particle
	# burst — both subscribed to Events.enemy_hit in the main project.
	# Reusing the bus means we don't duplicate audio gen + particle
	# spawning inside the prototype.
	Events.enemy_hit.emit(world_pos)

# Called by BlobChaser._die. Schedules a fresh wave if this kill
# emptied the room. The (child_count - 1) accounts for the dying
# chaser still being in the tree at this exact moment (queue_free is
# deferred + the fade-out tween runs first).
func on_enemy_killed(_blob: Node) -> void:
	if _respawn_pending:
		return
	var remaining: int = _alive_enemy_count() - 1
	if remaining > 0:
		return
	_respawn_pending = true
	# Process-true timer so the wait clears even during a hit-stop
	# (time_scale = 0.06 would otherwise stretch a 1.5s real-second
	# delay to 25 seconds of player wait).
	await get_tree().create_timer(RESPAWN_DELAY, true, false, true).timeout
	_respawn_pending = false
	_spawn_wave()
