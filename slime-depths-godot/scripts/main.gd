# Main scene controller — spawns slimes on a timer, listens for hero
# death, and draws a minimal HP HUD. Kept dead simple on purpose: the
# point of this slice is to feel out Godot's engine fit, not to recreate
# the whole game.
extends Node2D

const SLIME_SCENE: PackedScene = preload("res://scenes/slime.tscn")
const TILE        := 32         # native TMX tile size — Godot uses the raw bake
const MAP_WIDTH   := 1280       # 40 tiles × 32 px
const MAP_HEIGHT  := 768        # 24 tiles × 32 px

# Spawn points (tile-coord). The procedural dungeon has a 3-tile wall
# border, so all spawns sit at row/col 4..19 vertically / 4..36 horiz.
# Six entry points spread around the playable area.
const SPAWN_POINTS: Array[Vector2] = [
	Vector2( 5 * TILE,  5 * TILE),  # NW
	Vector2(34 * TILE,  5 * TILE),  # NE
	Vector2( 5 * TILE, 18 * TILE),  # SW
	Vector2(34 * TILE, 18 * TILE),  # SE
	Vector2(20 * TILE,  5 * TILE),  # N midline
	Vector2(20 * TILE, 18 * TILE),  # S midline
]

@onready var hero: Hero = $Hero
@onready var hp_label: Label = $UI/HPLabel
@onready var status_label: Label = $UI/StatusLabel

var _spawn_timer := 0.0
var _alive := true

func _ready() -> void:
	hero.hp_changed.connect(_on_hero_hp_changed)
	hero.hero_died.connect(_on_hero_died)
	_update_hp(hero.hp)
	status_label.text = "RUINS — kill the slimes (LMB to swing)"

func _process(delta: float) -> void:
	if not _alive:
		return
	# Cap concurrent slimes at 5 so the slice doesn't grind into a
	# mob-density showcase. New slime every ~2.5s up to the cap.
	_spawn_timer -= delta
	var live_slimes := get_tree().get_nodes_in_group("enemies").size()
	if _spawn_timer <= 0.0 and live_slimes < 5:
		_spawn_slime()
		_spawn_timer = 2.5

func _spawn_slime() -> void:
	var slime: CharacterBody2D = SLIME_SCENE.instantiate()
	var pt: Vector2 = SPAWN_POINTS[randi() % SPAWN_POINTS.size()]
	slime.global_position = pt
	add_child(slime)

func _on_hero_hp_changed(new_hp: int) -> void:
	_update_hp(new_hp)

func _update_hp(v: int) -> void:
	var hearts := ""
	for i in range(Hero.MAX_HP):
		hearts += "♥ " if i < v else "♡ "
	hp_label.text = hearts.strip_edges()

func _on_hero_died() -> void:
	_alive = false
	status_label.text = "YOU DIED — press R to restart"

func _unhandled_input(ev: InputEvent) -> void:
	if not _alive and ev is InputEventKey and ev.pressed and ev.physical_keycode == KEY_R:
		get_tree().reload_current_scene()
