# DashTrail — magenta-purple-cyan particle trail spawned at dash strike
# start. Lives just long enough to cover the dash window + the natural
# tail of the slowest particles, then queue_free's.
#
# setup(aim) orients the node so its +X points along the dash direction.
# The .tscn's CPUParticles2D emits in -X (direction = (-1, 0)), so
# particles trail BACKWARDS along the dash path. local_coords = false
# means each particle bakes its world position at emit time and stays
# there as the hero races past — that's the magic that makes the trail
# read as "left behind" rather than "stuck to me."
extends Node2D

const LIFETIME := 0.7

func setup(aim: Vector2) -> void:
	if aim.length_squared() > 0.0001:
		rotation = aim.angle()

func _ready() -> void:
	await get_tree().create_timer(LIFETIME).timeout
	queue_free()
