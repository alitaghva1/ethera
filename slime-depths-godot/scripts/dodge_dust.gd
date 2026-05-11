# Dodge dust — gray puff trailing the hero on a dodge roll. The FX
# autoload sets `rotation` at spawn-time to point AWAY from the dodge
# direction; the CPUParticles2D uses that rotation as its emission
# direction so the dust sprays behind the hero, not in a uniform halo.
extends Node2D

const LIFETIME := 0.7

func _ready() -> void:
	await get_tree().create_timer(LIFETIME).timeout
	queue_free()
