# ToyHero — stripped-down CharacterBody2D for the physics-tether prototype.
#
# Why a new script instead of reusing hero.gd:
# hero.gd is ~2500 lines and carries the full combat surface (sword
# chain, dash strike, blast, parry, theme procs, relic mods, hurt
# anim, footstep dust, walk bob). None of that helps answer the
# question this prototype asks: is dragging a heavy physics object
# around fun? So we start clean — pure WASD movement plus a single
# read-only `pulling` flag the gravestone polls each tick.
#
# Public surface (the gravestone reads this):
#   pulling: bool   — true while the player holds the pull input
#                     (tether_pull = right mouse OR space, see
#                     input_setup.gd)
#
# No attack inputs. No HP. No anim states. The hero is just an
# anchor that the tether pulls toward.
class_name ToyHero
extends CharacterBody2D

const MOVE_SPEED: float = 220.0
# Exponential approach to target velocity. ~85% of target velocity
# is reached in ~6 frames at 60fps with ACCEL = 14 — fast enough
# for the hero to feel responsive, slow enough that the gravestone
# tether has time to react to direction changes.
const ACCEL: float = 14.0

var pulling: bool = false

func _physics_process(delta: float) -> void:
	var input := Vector2.ZERO
	input.x = Input.get_axis("move_left", "move_right")
	input.y = Input.get_axis("move_up", "move_down")
	if input.length() > 1.0:
		input = input.normalized()
	var target_vel := input * MOVE_SPEED
	velocity = velocity.lerp(target_vel, clamp(ACCEL * delta, 0.0, 1.0))
	move_and_slide()
	pulling = Input.is_action_pressed("tether_pull")
