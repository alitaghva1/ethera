# CryptSpider — fast small trash mob. Like a slime in role (body-bump,
# 1 HP, dies in one hit) but VISUALLY DISTINCT (8-legged silhouette,
# magenta tint) and FASTER. Adds the "scuttle in from a corner" beat.
#
# Slime-depths parity: matches the `crypt_spider` def in src/enemies.js
# (drawSize 54, radius 16, speed 145, hp 50, damage 1, fps 12).
# In the slice we use 1 HP not 50, but otherwise the role is the same.
#
# Uses the Enemy base class — only behavior + tuning lives here.
class_name CryptSpider
extends Enemy

const SPEED        := 145.0
const TOUCH_RANGE  := 28.0       # smaller body → tighter touch range
const HIT_COOLDOWN := 0.55       # faster contact ticks than slime

var _hit_cd := 0.0

func _enemy_ready() -> void:
	max_hp = 1
	death_duration = 0.85

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
	# Face the direction of motion — slime-depths spider's run anim
	# has a directional bias, h-flip reads better than always-forward.
	sprite.flip_h = to_hero.x < 0
	move_and_slide()

	if dist < TOUCH_RANGE and _hit_cd <= 0.0:
		_hit_cd = HIT_COOLDOWN
		if _hero.has_method("take_damage"):
			_hero.take_damage(1)
