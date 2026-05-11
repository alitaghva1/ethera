# Enemy — base class for all dungeon mobs. Pulls the shared scaffolding
# out of Slime / Skeleton / CryptSpider so adding a new enemy is just
# "extends Enemy, override _enemy_tick" instead of recopying 30 lines
# of HP/take_hit/death-state plumbing.
#
# Common ground covered here:
#   • HP tracking + take_hit() with white-flash tween
#   • Dying state machine (locks input, plays death anim, queue_frees
#     after _death_duration)
#   • _hero reference auto-populated via group lookup in _ready
#   • Adds self to "enemies" group (so the hero's swing + main.gd's
#     wave-clear count + projectile detection all just work)
#   • Emits died_at(world_pos) on death — main.gd hooks this for the
#     +1 damage number + GameState kill registration
#   • Disables collision layer on death so the corpse doesn't keep
#     dealing body-bump damage
#
# Subclasses override:
#   • _enemy_tick(delta)        per-frame AI / motion logic
#   • _on_death()    (optional) extra death effects (loot drops, etc.)
#
# Subclasses MUST set in _ready() or via @export:
#   • max_hp        starting + cap HP
#   • death_anim    AnimatedSprite2D anim name (default "death")
class_name Enemy
extends CharacterBody2D

@export var max_hp: int = 1
@export var death_anim: StringName = &"death"
@export var death_duration: float = 0.7

@onready var sprite: AnimatedSprite2D = $AnimatedSprite2D

var hp: int = 1
var _dying := false
var _death_timer := 0.0
var _hero: Node2D = null

signal died_at(world_pos: Vector2)

func _ready() -> void:
	add_to_group("enemies")
	# Cache the hero reference on spawn. _hero stays null in scenes that
	# don't have one (e.g. hamlet) — subclass tick code must guard.
	var heroes := get_tree().get_nodes_in_group("hero")
	if heroes.size() > 0:
		_hero = heroes[0]
	# Subclass init runs BEFORE we copy max_hp → hp, so subclasses can
	# just set max_hp = N in _enemy_ready and get the matching starting
	# hp without having to also set hp manually. Removes a fragile
	# "remember to set both" footgun the slime/skel scripts had before.
	_enemy_ready()
	hp = max_hp

# ── Override hooks ────────────────────────────────────────────────────
# Subclasses do most of their work here. Keeping them as no-op virtuals
# lets the base handle the universal stuff (die / flash / signals) while
# the subclass keeps full control of behavior.

func _enemy_ready() -> void:
	# Subclasses can override for additional init (e.g. signal hookups).
	pass

func _enemy_tick(_delta: float) -> void:
	# Override in subclasses. Called only while alive.
	pass

func _on_death() -> void:
	# Override for extra death FX (loot drops, spawn child enemies, etc.).
	pass

# ── Common machinery ──────────────────────────────────────────────────

func _physics_process(delta: float) -> void:
	if _dying:
		_death_timer -= delta
		if _death_timer <= 0.0:
			queue_free()
		return
	_enemy_tick(delta)

func take_hit(damage: int) -> void:
	if _dying:
		return
	hp -= damage
	# White flash on hit — same convention as slime-depths' fx.js.
	# Tween-based so it self-cleans; cancels any in-flight flash so
	# rapid hits don't queue up modulate changes.
	if sprite != null:
		var tween := create_tween()
		tween.tween_property(sprite, "modulate", Color(2, 2, 2, 1), 0.04)
		tween.tween_property(sprite, "modulate", Color(1, 1, 1, 1), 0.10)
	Events.enemy_hit.emit(global_position)
	if hp <= 0:
		_die()

func _die() -> void:
	_dying = true
	_death_timer = death_duration
	velocity = Vector2.ZERO
	if sprite != null:
		sprite.modulate = Color(1, 1, 1, 1)
		if sprite.sprite_frames != null and sprite.sprite_frames.has_animation(death_anim):
			sprite.play(death_anim)
	# Stop colliding so the corpse can't body-bump the hero anymore.
	# (Layer 3 = enemies; mask 2 = hero in projectile-detection systems.)
	set_collision_layer_value(3, false)
	set_collision_mask_value(2, false)
	died_at.emit(global_position)
	Events.enemy_died.emit(global_position)
	_on_death()
