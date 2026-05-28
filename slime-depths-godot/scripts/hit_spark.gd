# Hit spark — small gold radial burst spawned when an enemy takes
# damage. Self-cleans after the particle lifetime so we never leak
# orphan particle nodes after a long run.
#
# Why a script at all (the CPUParticles2D could just run one_shot=true
# and stop on its own): "stopped emitting" still leaves the node in
# the scene tree. queue_free'ing on a timer keeps the dungeon's
# child-count flat across hundreds of hits.
extends Node2D

const LIFETIME := 0.6

func _ready() -> void:
	await get_tree().create_timer(LIFETIME).timeout
	queue_free()
