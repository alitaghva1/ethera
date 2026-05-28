# Blood drop — small upward-then-falling red spatter spawned when the
# hero takes a hit. Reads as "ouch" without overdoing it — only 5
# particles, fast lifetime. Pairs with the 12-pixel camera shake on
# hero_damaged for the full impact beat.
extends Node2D

const LIFETIME := 0.7

func _ready() -> void:
	await get_tree().create_timer(LIFETIME).timeout
	queue_free()
