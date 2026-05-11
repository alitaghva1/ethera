# Wizard — ranged caster enemy. Maintains distance from the hero and
# fires arcane orbs at long range. Mirror of the hero's blast spell:
# the projectile uses the same Projectile scene with target_group set
# to "hero" + a cyan-blue tint.
#
# Behavior (slime-depths' `wizard` def in src/enemies.js, simplified):
#   • Kite — back away if hero is closer than MIN_DIST
#   • Approach lazily — close to PREFER_DIST if too far
#   • Hold + cast — when in range, play cast windup then spawn orb
#   • Slow — speed 70 vs slime 95, skel 118
#   • 2 HP — peer with skeleton, but harder to reach
#
# Showcases the Enemy base class with a different role (ranged) — no
# new combat code needed in the base, just override _enemy_tick.
class_name Wizard
extends Enemy

const SPEED            := 70.0
const PREFER_DIST      := 320.0    # ideal range — sit here if possible
const MIN_DIST         := 220.0    # kite back if hero is closer
const CAST_RANGE       := 480.0    # max range the wizard will commit a cast
const CAST_WINDUP      := 0.70     # sec of telegraph before the orb fires
const CAST_COOLDOWN    := 1.80     # sec between casts
const PROJECTILE_SCENE = preload("res://scenes/projectile.tscn")

enum CastState { IDLE, WINDUP, COOLDOWN }
var _cast_state: CastState = CastState.IDLE
var _cast_timer := 0.0
var _cast_aim := Vector2.RIGHT

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

	match _cast_state:
		CastState.IDLE:
			# Position management — kite or approach, then cast if in
			# range. Movement is suspended during windup so the player
			# has a clear "back away" target.
			if dist < MIN_DIST:
				velocity = -to_hero.normalized() * SPEED
				sprite.play("walk")
				move_and_slide()
			elif dist > PREFER_DIST:
				velocity = to_hero.normalized() * SPEED
				sprite.play("walk")
				move_and_slide()
			else:
				velocity = Vector2.ZERO
				sprite.play("idle")
			# Trigger a cast when in range. Cooldown gate prevents
			# back-to-back spam.
			if dist <= CAST_RANGE and _cast_timer <= 0.0:
				_cast_state = CastState.WINDUP
				_cast_timer = CAST_WINDUP
				_cast_aim = to_hero.normalized()
				sprite.play("attack")
			else:
				_cast_timer = max(0.0, _cast_timer - delta)
		CastState.WINDUP:
			# Telegraph — cyan tint pulses over the windup so the player
			# can read "wizard about to cast" at a glance, distinct from
			# the skeleton's red telegraph for melee swings.
			velocity = Vector2.ZERO
			sprite.play("attack")
			var t := 1.0 - (_cast_timer / CAST_WINDUP)
			sprite.modulate = Color(1.0 - t * 0.5, 1.0, 1.0, 1)
			_cast_timer -= delta
			if _cast_timer <= 0.0:
				_fire_orb()
				_cast_state = CastState.COOLDOWN
				_cast_timer = CAST_COOLDOWN
				sprite.modulate = Color(1, 1, 1, 1)
		CastState.COOLDOWN:
			# Reset to neutral pose; the next IDLE tick handles motion.
			# Cooldown handled by the IDLE branch's _cast_timer countdown.
			_cast_state = CastState.IDLE
			sprite.play("idle")

func _fire_orb() -> void:
	# Re-aim at hero at the moment of cast — if the hero ran during the
	# windup, the orb still tracks them. This is the slime-depths
	# convention; pure "lead at windup" feels too dodgable in practice.
	if _hero != null and is_instance_valid(_hero):
		_cast_aim = (_hero.global_position - global_position).normalized()
	var p: Projectile = PROJECTILE_SCENE.instantiate()
	p.target_group = "hero"
	p.orb_tint = Color(0.4, 0.7, 1, 1)        # cool blue — enemy magic
	p.global_position = global_position + Vector2(0, -28) + _cast_aim * 22.0
	p.velocity = _cast_aim * Projectile.SPEED
	p.damage = 1
	get_parent().add_child(p)
