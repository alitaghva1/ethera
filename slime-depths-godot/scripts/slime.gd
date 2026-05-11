# Slime enemy — chase the hero, body-bump for damage. Dies in one hit.
#
# Behavior mirrors slime-depths' 'melee' enemy: pursue while alive, do
# contact damage on touch with a per-enemy cooldown so a stack of slimes
# doesn't insta-shred the player. Death plays the death anim then frees.
class_name Slime
extends CharacterBody2D

const SPEED               := 95.0
const RADIUS              := 22.0
const HIT_COOLDOWN        := 0.6      # sec between contact damage ticks
const DRAW_SIZE           := 58       # render size in design pixels
const DEATH_ANIM_DURATION := 0.7

@onready var sprite: AnimatedSprite2D = $AnimatedSprite2D

var hp := 1
var _hit_cd := 0.0
var _dying := false
var _death_timer := 0.0
var _hero: Hero = null

func _ready() -> void:
	add_to_group("enemies")
	sprite.play("idle")
	# Hero is in group "hero" — picked up from the level on spawn.
	var heroes := get_tree().get_nodes_in_group("hero")
	if heroes.size() > 0 and heroes[0] is Hero:
		_hero = heroes[0]

func _physics_process(delta: float) -> void:
	_hit_cd = max(0.0, _hit_cd - delta)
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
	if dist > 1.0:
		velocity = to_hero.normalized() * SPEED
		sprite.play("walk")
	else:
		velocity = Vector2.ZERO
		sprite.play("idle")
	move_and_slide()

	# Contact damage — body-bump every HIT_COOLDOWN seconds while
	# touching the hero (radius overlap).
	if dist < RADIUS + 14.0 and _hit_cd <= 0.0:
		_hit_cd = HIT_COOLDOWN
		if _hero.has_method("take_damage"):
			_hero.take_damage(1)

func take_hit(damage: int) -> void:
	if _dying:
		return
	hp -= damage
	if hp <= 0:
		_dying = true
		_death_timer = DEATH_ANIM_DURATION
		velocity = Vector2.ZERO
		sprite.play("death")
		# Stop colliding with hero so corpse doesn't keep dealing damage.
		set_collision_layer_value(3, false)
		set_collision_mask_value(2, false)
