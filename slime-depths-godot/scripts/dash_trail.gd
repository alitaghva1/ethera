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
#
# Iter 75 — trail LIFETIME bumped from 0.7 → 1.0 so the longer particle
# lifetime (now 0.65, was 0.55) + the spread emission window (0.5
# explosiveness over ~0.325s) doesn't get clipped by an early
# queue_free. With particles emitted over the first 0.325s + 0.65s
# lifetime each, the LAST particle dies at ~0.975s — the node free at
# 1.0s gives a small margin without leaving an invisible orphan.
extends Node2D

const LIFETIME := 1.0

func setup(aim: Vector2) -> void:
	if aim.length_squared() > 0.0001:
		rotation = aim.angle()

func _ready() -> void:
	await get_tree().create_timer(LIFETIME).timeout
	queue_free()
