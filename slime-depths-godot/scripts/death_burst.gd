# Death burst — red-ember radial spray with downward gravity. Spawned
# on enemy_died (and hero_died, for an oh-shit beat). Self-cleans after
# the particle lifetime + a small margin so the trailing falling
# particles render fully before the node disappears.
extends Node2D

const LIFETIME := 1.0

func _ready() -> void:
	await get_tree().create_timer(LIFETIME).timeout
	queue_free()
