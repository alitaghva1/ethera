# Slime — trash-mob enemy. Chases the hero, body-bumps for damage.
# Dies in one hit. Mirrors slime-depths' `slime` def in src/enemies.js
# but simplified (no acid spitter variant, no bomber explode).
#
# Refactored Iter 4 to extend Enemy (base class). The 30 lines of
# HP / take_hit / death-machine / _hero / died_at / group / collision-
# disable plumbing all live in enemy.gd now.
class_name Slime
extends Enemy

const SPEED        := 95.0
const RADIUS       := 22.0
const HIT_COOLDOWN := 0.6        # sec between contact damage ticks
const TOUCH_RANGE  := 36.0       # px of hero+slime radii overlap

var _hit_cd := 0.0

func _enemy_ready() -> void:
	# Slime defaults. Setting max_hp is enough — Enemy._ready copies it
	# to hp after _enemy_ready returns.
	max_hp = 1
	death_duration = 0.7

func _enemy_tick(delta: float) -> void:
	_hit_cd = max(0.0, _hit_cd - delta)
	if _hero == null or not is_instance_valid(_hero):
		velocity = Vector2.ZERO
		sprite.play("idle")
		return

	var to_hero: Vector2 = _hero.global_position - global_position
	var dist := to_hero.length()
	if dist > 1.0:
		velocity = to_hero.normalized() * SPEED
		sprite.play("walk")
	else:
		velocity = Vector2.ZERO
		sprite.play("idle")
	move_and_slide()

	# Contact damage tick — body-bump every HIT_COOLDOWN sec while
	# touching. Distance check matches the radii-sum convention from
	# slime-depths (hero radius ~14 + slime radius ~22 = 36).
	if dist < TOUCH_RANGE and _hit_cd <= 0.0:
		_hit_cd = HIT_COOLDOWN
		if _hero.has_method("take_damage"):
			_hero.take_damage(1)
