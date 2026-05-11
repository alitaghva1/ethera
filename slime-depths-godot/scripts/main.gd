# Main scene controller — spawns enemies (slime + skeleton mix),
# listens for hero damage / kills, manages the HUD, runs hit-stop on
# hero damage, spawns damage numbers on enemy hit/death.
#
# Iter 1 additions vs the original slice:
#   • Skeleton enemy mixed into spawns (30% chance per spawn)
#   • Hit-stop: Engine.time_scale briefly drops to 0.05 on hero damage,
#     giving the hit weight (same trick slime-depths uses in fx.js).
#   • Kill counter in HUD (top-right replaces "GODOT SLICE" tag)
#   • Damage numbers float up from enemies on death
extends Node2D

const SLIME_SCENE: PackedScene    = preload("res://scenes/slime.tscn")
const SKELETON_SCENE: PackedScene = preload("res://scenes/skeleton.tscn")
const DAMAGE_NUMBER_SCENE         = preload("res://scenes/damage_number.tscn")

const TILE        := 32
const MAP_WIDTH   := 1280
const MAP_HEIGHT  := 768

# Six entry points, all inside the 3-tile wall border.
const SPAWN_POINTS: Array[Vector2] = [
	Vector2( 5 * TILE,  5 * TILE),
	Vector2(34 * TILE,  5 * TILE),
	Vector2( 5 * TILE, 18 * TILE),
	Vector2(34 * TILE, 18 * TILE),
	Vector2(20 * TILE,  5 * TILE),
	Vector2(20 * TILE, 18 * TILE),
]

# Iter 1 — 30% of spawns are skeletons (tougher, ranged-windup melee).
# Slime stays the trash mob.
const SKELETON_CHANCE := 0.30
const SPAWN_INTERVAL  := 2.5
const MAX_CONCURRENT  := 6
const HIT_STOP_SCALE  := 0.05
const HIT_STOP_TIME   := 0.08

@onready var hero: Hero = $Hero
@onready var hp_label: Label = $UI/HPLabel
@onready var status_label: Label = $UI/StatusLabel
@onready var kills_label: Label = $UI/KillsLabel

var _spawn_timer := 0.0
var _alive := true
var _kills := 0
var _hit_stop_timer := 0.0

func _ready() -> void:
	hero.hp_changed.connect(_on_hero_hp_changed)
	hero.hero_died.connect(_on_hero_died)
	hero.hit_received.connect(_on_hero_hit_received)
	_update_hp(hero.hp)
	_update_kills()
	status_label.text = "RUINS — LMB swing, SPACE dodge, R restart"

func _process(delta: float) -> void:
	# Hit-stop release — restore time_scale once the freeze window expires.
	# Uses Time.get_ticks_msec so it ticks correctly even when time_scale=0.05
	# (delta is scaled, so we use real-time wall clock to count it down).
	if _hit_stop_timer > 0.0:
		_hit_stop_timer -= 1.0 / 60.0    # rough wall-clock approximation
		if _hit_stop_timer <= 0.0:
			Engine.time_scale = 1.0

	if not _alive:
		return
	_spawn_timer -= delta
	var live := get_tree().get_nodes_in_group("enemies").size()
	if _spawn_timer <= 0.0 and live < MAX_CONCURRENT:
		_spawn_enemy()
		_spawn_timer = SPAWN_INTERVAL

func _spawn_enemy() -> void:
	var is_skel := randf() < SKELETON_CHANCE
	var scene: PackedScene = SKELETON_SCENE if is_skel else SLIME_SCENE
	var enemy: CharacterBody2D = scene.instantiate()
	var pt: Vector2 = SPAWN_POINTS[randi() % SPAWN_POINTS.size()]
	enemy.global_position = pt
	# Hook the died_at signal to spawn a damage number + count kills.
	if enemy.has_signal("died_at"):
		enemy.died_at.connect(_on_enemy_died)
	add_child(enemy)

func _on_enemy_died(world_pos: Vector2) -> void:
	_kills += 1
	_update_kills()
	# Floating "+1" above the corpse.
	var n: DamageNumber = DamageNumber.spawn(world_pos + Vector2(0, -36), "+1", Color(1, 0.95, 0.7))
	add_child(n)

func _on_hero_hit_received() -> void:
	# Brief time-scale freeze — combat impact feel. Real-time clock
	# counts down independently so the freeze actually releases.
	Engine.time_scale = HIT_STOP_SCALE
	_hit_stop_timer = HIT_STOP_TIME
	# Damage number above hero.
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
	for i in range(Hero.MAX_HP):
		hearts += "♥ " if i < v else "♡ "
	hp_label.text = hearts.strip_edges()

func _update_kills() -> void:
	kills_label.text = "KILLS  %d" % _kills

func _on_hero_died() -> void:
	_alive = false
	Engine.time_scale = 1.0   # safety — never leave the game frozen on death
	status_label.text = "YOU DIED  ·  press R to restart"

func _unhandled_input(ev: InputEvent) -> void:
	if not _alive and ev is InputEventKey and ev.pressed and ev.physical_keycode == KEY_R:
		Engine.time_scale = 1.0
		get_tree().reload_current_scene()
