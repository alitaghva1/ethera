# Main (dungeon) — wave runner. Three sequential waves of escalating
# composition. Clearing wave 3 spawns a relic pedestal at the center;
# claiming it grants a permanent relic (persisted through GameState).
#
# Iter 3 architecture vs Iter 1 (random spawn timer):
#   • State machine: PRE → WAVE_ACTIVE → WAVE_CLEAR → next or COMPLETE
#   • Each wave is a composition declared in WAVES (type id + count
#     pairs). Spawn all at start; transition on "no enemies alive".
#   • Pedestal spawned at center on COMPLETE. Once claimed, the
#     status label changes to "RUN COMPLETE — ESC return to hamlet".
#   • Skipped from Iter 1: random-timer spawn, MAX_CONCURRENT cap
#     (wave structure replaces both).
extends Node2D

const DAMAGE_NUMBER_SCENE         = preload("res://scenes/damage_number.tscn")
const PEDESTAL_SCENE: PackedScene = preload("res://scenes/pedestal.tscn")

# Enemy type → scene lookup. Adding a new enemy type = drop a scene
# into res://scenes/ and add ONE entry here. The wave compositions
# below reference enemies by these keys.
const ENEMY_SCENES := {
	"slime":        preload("res://scenes/slime.tscn"),
	"skel":         preload("res://scenes/skeleton.tscn"),
	"crypt_spider": preload("res://scenes/crypt_spider.tscn"),
	"wizard":       preload("res://scenes/wizard.tscn"),
}

const TILE        := 32
const MAP_WIDTH   := 1280
const MAP_HEIGHT  := 768

# Wave compositions — list of (type_id, count) pairs per wave.
# Iter 4 design:
#   W1 light skirmish (3 slimes + 1 spider) → easy ramp-in
#   W2 mixed melee (2 slimes + 2 skels + 2 spiders) → dodging windups
#       and chasing spiders simultaneously
#   W3 ranged-pressure climax (1 skel + 2 spiders + 1 wizard) → the
#       wizard kites and casts; player must close OR pillar-dodge while
#       fighting the melee front
const WAVES := [
	[["slime", 3], ["crypt_spider", 1]],
	[["slime", 2], ["skel", 2], ["crypt_spider", 2]],
	[["skel", 1], ["crypt_spider", 2], ["wizard", 1]],
]

const SPAWN_POINTS: Array[Vector2] = [
	Vector2( 5 * TILE,  5 * TILE),
	Vector2(34 * TILE,  5 * TILE),
	Vector2( 5 * TILE, 18 * TILE),
	Vector2(34 * TILE, 18 * TILE),
	Vector2(20 * TILE,  5 * TILE),
	Vector2(20 * TILE, 18 * TILE),
]

const HIT_STOP_SCALE    := 0.05
const HIT_STOP_TIME     := 0.08
const WAVE_CLEAR_PAUSE  := 1.6   # sec between waves (breather + read)

enum WaveState { PRE, ACTIVE, CLEAR, COMPLETE, DEAD }

@onready var hero: Hero = $Hero
@onready var hp_label: Label = $UI/HPLabel
@onready var status_label: Label = $UI/StatusLabel
@onready var kills_label: Label = $UI/KillsLabel
@onready var wave_label: Label = $UI/WaveLabel

var _wave_index := -1
var _wave_state := WaveState.PRE
var _alive := true
var _kills := 0
var _hit_stop_timer := 0.0

func _ready() -> void:
	hero.hp_changed.connect(_on_hero_hp_changed)
	hero.hero_died.connect(_on_hero_died)
	hero.hit_received.connect(_on_hero_hit_received)
	_update_hp(hero.hp)
	_update_kills()
	# Start the run timer — wave 1 launches after a brief beat so the
	# player can orient before the first spawn rush.
	status_label.text = "RUINS — LMB swing · RMB blast · SPACE dodge"
	wave_label.text = "WAVE 1 / %d  incoming" % WAVES.size()
	var t := get_tree().create_timer(1.0)
	t.timeout.connect(func (): _start_wave(0))

func _process(_delta: float) -> void:
	# Hit-stop release — wall-clock countdown since delta is scaled.
	if _hit_stop_timer > 0.0:
		_hit_stop_timer -= 1.0 / 60.0
		if _hit_stop_timer <= 0.0:
			Engine.time_scale = 1.0
	# Wave clear detection — purely live-enemy-count driven.
	if _wave_state == WaveState.ACTIVE:
		var live := get_tree().get_nodes_in_group("enemies").size()
		if live == 0:
			_on_wave_cleared()

func _start_wave(idx: int) -> void:
	if not _alive:
		return
	_wave_index = idx
	_wave_state = WaveState.ACTIVE
	var comp: Array = WAVES[idx]
	for pair in comp:
		var type_id: String = pair[0]
		var count: int = pair[1]
		for i in range(count):
			_spawn_enemy_type(type_id)
	wave_label.text = "WAVE %d / %d" % [idx + 1, WAVES.size()]

func _on_wave_cleared() -> void:
	_wave_state = WaveState.CLEAR
	if _wave_index + 1 < WAVES.size():
		wave_label.text = "WAVE %d CLEAR  ·  next in %.1fs" % [_wave_index + 1, WAVE_CLEAR_PAUSE]
		var t := get_tree().create_timer(WAVE_CLEAR_PAUSE)
		t.timeout.connect(func (): _start_wave(_wave_index + 1))
	else:
		# All waves cleared — drop a pedestal at the center as the reward.
		_wave_state = WaveState.COMPLETE
		wave_label.text = "ROOM CLEAR"
		status_label.text = "Claim the relic at the pedestal · [E] when close"
		_spawn_pedestal()

func _spawn_enemy_type(type_id: String) -> void:
	# Data-driven dispatch — no if/else chain. Falls back to slime on
	# unknown types so a typo in WAVES doesn't crash mid-run.
	var scene: PackedScene = ENEMY_SCENES.get(type_id, ENEMY_SCENES["slime"])
	var enemy: Enemy = scene.instantiate()
	enemy.global_position = SPAWN_POINTS[randi() % SPAWN_POINTS.size()]
	enemy.died_at.connect(_on_enemy_died)
	add_child(enemy)

func _spawn_pedestal() -> void:
	# Pick a relic the player doesn't already own; if they own all,
	# offer iron_fang again (no-op grant, but the pickup banner still
	# fires so the run has a clear "you finished it" beat).
	var available: Array = []
	for rid in GameState.RELIC_REGISTRY.keys():
		if not GameState.has_relic(rid):
			available.append(rid)
	var chosen: String = available[randi() % available.size()] if not available.is_empty() else "iron_fang"
	var ped: Pedestal = PEDESTAL_SCENE.instantiate()
	ped.global_position = Vector2(640, 384)
	ped.relic_id = chosen
	add_child(ped)

func _on_enemy_died(world_pos: Vector2) -> void:
	_kills += 1
	GameState.register_run_kill()
	_update_kills()
	var n: DamageNumber = DamageNumber.spawn(world_pos + Vector2(0, -36), "+1", Color(1, 0.95, 0.7))
	add_child(n)

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
	var max_hp := Hero.MAX_HP + GameState.modifier_total("max_hp_bonus", 0)
	for i in range(max_hp):
		hearts += "♥ " if i < v else "♡ "
	hp_label.text = hearts.strip_edges()

func _update_kills() -> void:
	kills_label.text = "KILLS  %d" % _kills

func _on_hero_died() -> void:
	_alive = false
	_wave_state = WaveState.DEAD
	Engine.time_scale = 1.0
	status_label.text = "YOU DIED  ·  R retry · ESC return to hamlet"
	wave_label.text = ""

func _unhandled_input(ev: InputEvent) -> void:
	if not _alive and ev is InputEventKey and ev.pressed:
		if ev.physical_keycode == KEY_R:
			Engine.time_scale = 1.0
			GameState.start_dungeon_run()
			get_tree().reload_current_scene()
		elif ev.physical_keycode == KEY_ESCAPE:
			Engine.time_scale = 1.0
			get_tree().change_scene_to_file("res://scenes/hamlet.tscn")
	# Also allow ESC return from a completed/post-pedestal room.
	if _wave_state == WaveState.COMPLETE and ev is InputEventKey and ev.pressed:
		if ev.physical_keycode == KEY_ESCAPE:
			Engine.time_scale = 1.0
			get_tree().change_scene_to_file("res://scenes/hamlet.tscn")
