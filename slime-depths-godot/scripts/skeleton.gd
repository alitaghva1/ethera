# Skeleton — second enemy type. Tougher than the slime (2 HP), slower,
# but has a real attack with a windup telegraph instead of body-bumping.
#
# Mirrors slime-depths' 'skel' def in src/enemies.js:
#   HP 95, speed 118, drawSize 80, windup 0.55s, swing 0.35s, reach 54.
# Slice tuning: 2 HP (so the player feels weight on the kill), telegraph
# is visual-only (sprite tint shifts during windup) — no projectile.
class_name Skeleton
extends CharacterBody2D

const SPEED              := 118.0
const RADIUS             := 22.0
const HP_MAX             := 2
const ATTACK_REACH       := 54.0
const ATTACK_WINDUP      := 0.55
const ATTACK_SWING       := 0.35
const ATTACK_COOLDOWN    := 0.90
const ATTACK_DAMAGE      := 1
const DEATH_DURATION     := 0.9

@onready var sprite: AnimatedSprite2D = $AnimatedSprite2D

var hp := HP_MAX
var _dying := false
var _death_timer := 0.0
var _hero: Hero = null

# Attack state machine: IDLE → WINDUP (telegraph) → SWING (deal damage on first frame) → COOLDOWN
enum AttackState { IDLE, WINDUP, SWING, COOLDOWN }
var _attack_state := AttackState.IDLE
var _attack_timer := 0.0
var _attack_aim := Vector2.RIGHT

signal died_at(world_pos: Vector2)

func _ready() -> void:
	add_to_group("enemies")
	sprite.play("idle")
	var heroes := get_tree().get_nodes_in_group("hero")
	if heroes.size() > 0 and heroes[0] is Hero:
		_hero = heroes[0]

func _physics_process(delta: float) -> void:
	if _dying:
		_death_timer -= delta
		if _death_timer <= 0.0:
			queue_free()
		return
	if _hero == null or not is_instance_valid(_hero):
		velocity = Vector2.ZERO
		sprite.play("idle")
		return

	var to_hero: Vector2 = _hero.global_position - global_position
	var dist := to_hero.length()
	sprite.flip_h = to_hero.x < 0

	match _attack_state:
		AttackState.IDLE:
			# Approach hero. When in range, start windup.
			if dist > ATTACK_REACH * 0.85:
				velocity = to_hero.normalized() * SPEED
				sprite.play("walk")
				move_and_slide()
			else:
				velocity = Vector2.ZERO
				sprite.play("idle")
				_attack_state = AttackState.WINDUP
				_attack_timer = ATTACK_WINDUP
				_attack_aim = to_hero.normalized()
		AttackState.WINDUP:
			# Telegraph — sprite tint pulses red so the player has a
			# clear "back off NOW" cue. No movement during windup.
			velocity = Vector2.ZERO
			sprite.play("idle")
			var t := 1.0 - (_attack_timer / ATTACK_WINDUP)
			sprite.modulate = Color(1, 1.0 - t * 0.6, 1.0 - t * 0.6, 1)
			_attack_timer -= delta
			if _attack_timer <= 0.0:
				_attack_state = AttackState.SWING
				_attack_timer = ATTACK_SWING
				sprite.play("attack")
				# Damage the hero if they're STILL in reach + cone — the
				# whole point of telegraph is they had time to dodge.
				var final_to_hero: Vector2 = _hero.global_position - global_position
				if final_to_hero.length() <= ATTACK_REACH \
				   and abs(final_to_hero.angle_to(_attack_aim)) < PI * 0.40 \
				   and _hero.has_method("take_damage"):
					_hero.take_damage(ATTACK_DAMAGE)
		AttackState.SWING:
			velocity = Vector2.ZERO
			_attack_timer -= delta
			if _attack_timer <= 0.0:
				_attack_state = AttackState.COOLDOWN
				_attack_timer = ATTACK_COOLDOWN - ATTACK_SWING
				sprite.modulate = Color(1, 1, 1, 1)
		AttackState.COOLDOWN:
			# Back to "approach" behavior during cooldown but can't restart
			# the attack until the timer expires.
			if dist > ATTACK_REACH * 0.85:
				velocity = to_hero.normalized() * SPEED
				sprite.play("walk")
				move_and_slide()
			else:
				velocity = Vector2.ZERO
				sprite.play("idle")
			_attack_timer -= delta
			if _attack_timer <= 0.0:
				_attack_state = AttackState.IDLE

func take_hit(damage: int) -> void:
	if _dying:
		return
	hp -= damage
	# Flash white briefly on hit — same convention as slime-depths.
	var flash := create_tween()
	flash.tween_property(sprite, "modulate", Color(2, 2, 2, 1), 0.04)
	flash.tween_property(sprite, "modulate", Color(1, 1, 1, 1), 0.10)
	if hp <= 0:
		_dying = true
		_death_timer = DEATH_DURATION
		velocity = Vector2.ZERO
		sprite.play("death")
		sprite.modulate = Color(1, 1, 1, 1)
		set_collision_layer_value(3, false)
		set_collision_mask_value(2, false)
		died_at.emit(global_position)
