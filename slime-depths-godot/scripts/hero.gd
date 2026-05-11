# Hero — CharacterBody2D with WASD movement + mouse-direction attack.
#
# Slice-mode simplifications vs slime-depths/src/hero.js:
#   • No dodge, dash-strike, or weapon-swap. Just walk + attack.
#   • No 8-direction sprites. South-facing sheet, h-flipped when moving
#     west. North/south facings reuse the south pose (acceptable for
#     "does the engine feel good?" testing — full direction handling
#     comes in iteration 2 if the answer is yes).
#   • Attack hitbox = circular Area2D wedge in the click direction,
#     active for 0.18s during the swing.
#
# Mirrors slime-depths constants:
#   HERO_RADIUS = 14         (collision)
#   HERO_DRAW   = 60         (visible body height)
#   SPEED       = 200 px/s   (matches the JS version)
class_name Hero
extends CharacterBody2D

const SPEED              := 200.0
const HERO_DRAW          := 60          # render size in design pixels
const ATTACK_RANGE       := 56          # px from hero center
const ATTACK_ARC         := PI * 0.55   # radians (half-arc each side)
const ATTACK_COOLDOWN    := 0.40        # sec between swings
const ATTACK_SWING_TIME  := 0.18        # sec the hitbox is "live"
const MAX_HP             := 3

@onready var sprite: AnimatedSprite2D = $AnimatedSprite2D

var hp: int = MAX_HP
var _attack_cd := 0.0
var _attack_live := 0.0          # > 0 while the swing's hitbox is active
var _attack_aim := Vector2.RIGHT  # direction of current swing
var _is_attacking := false
var _facing_west := false         # h-flip the sprite when true

signal hp_changed(new_hp: int)
signal hero_died

func _ready() -> void:
	sprite.play("idle")
	add_to_group("hero")

func _physics_process(delta: float) -> void:
	_attack_cd = max(0.0, _attack_cd - delta)
	_attack_live = max(0.0, _attack_live - delta)
	if _attack_live <= 0.0:
		_is_attacking = false

	var input := Input.get_vector("move_left", "move_right", "move_up", "move_down")
	# Hero keeps walking through the attack animation (combat felt
	# stilted otherwise in early playtests).
	velocity = input * SPEED
	move_and_slide()

	if input.x < -0.1:
		_facing_west = true
	elif input.x > 0.1:
		_facing_west = false
	sprite.flip_h = _facing_west

	# Animation state machine — attack overrides walk, walk overrides idle.
	if _is_attacking:
		sprite.play("attack")
	elif input.length() > 0.1:
		sprite.play("walk")
	else:
		sprite.play("idle")

	if Input.is_action_pressed("attack") and _attack_cd <= 0.0 and not _is_attacking:
		_start_attack()

func _start_attack() -> void:
	var aim_world := get_global_mouse_position() - global_position
	if aim_world.length() < 1.0:
		aim_world = Vector2(1, 0) if not _facing_west else Vector2(-1, 0)
	_attack_aim = aim_world.normalized()
	_attack_cd = ATTACK_COOLDOWN
	_attack_live = ATTACK_SWING_TIME
	_is_attacking = true
	# Pre-emptively flip toward aim — feels more responsive than waiting
	# for the next input vector.
	_facing_west = _attack_aim.x < 0
	sprite.flip_h = _facing_west
	sprite.frame = 0
	sprite.play("attack")
	# Damage resolution — every frame the swing is live, check overlaps
	# with the "enemies" group. Slime takes one hit and dies.
	for enemy in get_tree().get_nodes_in_group("enemies"):
		if not is_instance_valid(enemy):
			continue
		var to_enemy: Vector2 = enemy.global_position - global_position
		if to_enemy.length() > ATTACK_RANGE:
			continue
		if abs(to_enemy.angle_to(_attack_aim)) > ATTACK_ARC:
			continue
		if enemy.has_method("take_hit"):
			enemy.take_hit(1)

func take_damage(amount: int) -> void:
	if hp <= 0:
		return
	hp -= amount
	hp_changed.emit(hp)
	if hp <= 0:
		hero_died.emit()
