# Skeleton — telegraphed melee enemy. Approaches the hero, stops in
# range, plays a 0.55s wind-up (sprite tints red as cue), then swings.
# The wind-up commits the attack — if you dodge mid-windup the skel
# still swings at empty air. Mirrors slime-depths' `skel` def.
#
# Refactored Iter 4 to extend Enemy. Attack state machine lives here;
# universal HP/death plumbing inherited from the base class.
class_name Skeleton
extends Enemy

const SPEED             := 118.0
const RADIUS            := 22.0
const ATTACK_REACH      := 54.0
const ATTACK_WINDUP     := 0.55
const ATTACK_SWING      := 0.35
const ATTACK_COOLDOWN   := 0.90
const ATTACK_DAMAGE     := 1
const ATTACK_CONE       := PI * 0.40   # half-angle of the strike fan

# Attack state machine:
#   IDLE     approach hero
#   WINDUP   stop, play telegraph, lock aim
#   SWING    deal damage on first frame (if hero still in cone+range)
#   COOLDOWN can't restart attack yet, still approaches
enum AttackState { IDLE, WINDUP, SWING, COOLDOWN }
var _attack_state: AttackState = AttackState.IDLE
var _attack_timer := 0.0
var _attack_aim := Vector2.RIGHT

func _enemy_ready() -> void:
	max_hp = 2
	death_duration = 0.9

func _enemy_tick(delta: float) -> void:
	if _hero == null or not is_instance_valid(_hero):
		velocity = Vector2.ZERO
		sprite.play("idle")
		return

	var to_hero: Vector2 = _hero.global_position - global_position
	var dist := to_hero.length()
	sprite.flip_h = to_hero.x < 0

	match _attack_state:
		AttackState.IDLE:
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
			# Telegraph — red tint pulses over the windup duration.
			velocity = Vector2.ZERO
			sprite.play("idle")
			var t := 1.0 - (_attack_timer / ATTACK_WINDUP)
			sprite.modulate = Color(1, 1.0 - t * 0.6, 1.0 - t * 0.6, 1)
			_attack_timer -= delta
			if _attack_timer <= 0.0:
				_attack_state = AttackState.SWING
				_attack_timer = ATTACK_SWING
				sprite.play("attack")
				# Damage check happens at swing-start so a dodging hero
				# escapes the cone and avoids the hit.
				var final_to_hero: Vector2 = _hero.global_position - global_position
				if final_to_hero.length() <= ATTACK_REACH \
				   and abs(final_to_hero.angle_to(_attack_aim)) < ATTACK_CONE \
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
