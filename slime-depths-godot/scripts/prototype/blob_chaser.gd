# BlobChaser — placeholder enemy for the physics-tether prototype.
#
# Pure chase AI: every physics tick, move toward the player at a
# constant speed. No telegraphs, no attacks, no animations, no
# behavior tree, no nothing. The existence of this script is to give
# the gravestone something to hit so we can answer: does the swing
# feel satisfying against something that moves?
#
# Damage model: the gravestone calls take_hit() directly when its
# linear velocity exceeds MIN_DAMAGE_VEL on collision. take_hit decrements
# hp, sets a knockback velocity (linear-decayed across KNOCKBACK_TIME),
# and notifies the room scene so it can fire the impact feedback
# (hit-stop + shake + particles + audio).
#
# Knockback: the gravestone passes a velocity vector (magnitude scaled
# by impact strength × ENEMY_KNOCKBACK_MULT). We just adopt it as our
# velocity for KNOCKBACK_TIME seconds, lerping back to zero so the
# chaser eases out of the knockback rather than snapping to a stop.
#
# Death: 2 HP. On reaching 0, fade alpha → 0 over 0.25 s, then
# queue_free. The room controller's on_enemy_killed callback handles
# respawn scheduling.
class_name BlobChaser
extends CharacterBody2D

const MOVE_SPEED: float = 80.0
const MAX_HP: int = 2
const KNOCKBACK_TIME: float = 0.25
# How fast the knockback velocity decays back to zero (exponential).
# Higher = snappier recovery; lower = longer slide.
const KNOCKBACK_DECAY: float = 8.0

var hp: int = MAX_HP
var _dying: bool = false
var _knockback_velocity: Vector2 = Vector2.ZERO
var _knockback_time: float = 0.0

@export var player_path: NodePath
var _player: Node2D = null

func _ready() -> void:
	add_to_group("toy_enemies")
	if player_path != NodePath():
		_player = get_node_or_null(player_path)

func _physics_process(delta: float) -> void:
	if _dying:
		return
	if _knockback_time > 0.0:
		_knockback_time -= delta
		# Hold the knockback velocity, decaying it exponentially so
		# the recovery feels smooth (snap-stop reads as a stutter).
		velocity = _knockback_velocity
		_knockback_velocity = _knockback_velocity.lerp(
			Vector2.ZERO,
			clamp(KNOCKBACK_DECAY * delta, 0.0, 1.0),
		)
	elif _player != null and is_instance_valid(_player):
		var to_player: Vector2 = _player.global_position - global_position
		if to_player.length() > 0.001:
			velocity = to_player.normalized() * MOVE_SPEED
		else:
			velocity = Vector2.ZERO
	else:
		velocity = Vector2.ZERO
	move_and_slide()

# Called by CursedGravestone._on_body_entered when this chaser is
# slammed at sufficient velocity. impact_vel is the gravestone's
# velocity magnitude at contact (used to scale shake intensity);
# knockback_impulse is the pre-computed velocity vector we adopt.
func take_hit(impact_vel: float, knockback_impulse: Vector2) -> void:
	if _dying:
		return
	hp -= 1
	_knockback_velocity = knockback_impulse
	_knockback_time = KNOCKBACK_TIME
	# Tell the room to fire the impact feedback. Going through a
	# room-level callback (not autoloads) keeps the prototype scene
	# self-contained and easy to reason about.
	var room: Node = get_tree().current_scene
	if room != null and room.has_method("on_gravestone_impact"):
		room.on_gravestone_impact(global_position, impact_vel)
	if hp <= 0:
		_die()

func _die() -> void:
	_dying = true
	# Disable further collisions so the corpse doesn't block knockback
	# trajectories of nearby chasers.
	set_collision_layer_value(3, false)
	set_collision_mask_value(1, false)
	set_collision_mask_value(2, false)
	set_collision_mask_value(4, false)
	var room: Node = get_tree().current_scene
	if room != null and room.has_method("on_enemy_killed"):
		room.on_enemy_killed(self)
	var tw: Tween = create_tween()
	tw.tween_property(self, "modulate:a", 0.0, 0.25)
	tw.tween_callback(queue_free)
