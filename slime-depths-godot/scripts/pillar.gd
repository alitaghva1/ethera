# Pillar — static stone column the hero must walk AROUND. Solid
# collider at the base + a small warm PointLight2D up top so the
# column feels lit by an unseen brazier and softly pools light into
# the surrounding floor.
#
# Spawned by main.gd from RoomConfig.pillar_positions, same pattern
# as torches. Per-room placement makes the dungeon read as a series
# of distinct spaces rather than identical empty boxes.
#
# Visual = pure node-driven shading (3 stacked ColorRects on the
# .tscn side, no procedural draw). The script only owns the gentle
# light flicker — slower + softer than torches so the pillar reads
# as ambient warmth, not as a fire.
class_name Pillar
extends StaticBody2D

const BASE_ENERGY: float = 0.60
const FLICKER_SLOW: float = 0.06
const FLICKER_FAST: float = 0.03

@onready var light: PointLight2D = $PointLight2D

var _phase: float = randf() * TAU

func _process(_delta: float) -> void:
	if light == null:
		return
	var t: float = Time.get_ticks_msec() / 1000.0
	var slow: float = sin(t * 1.8 + _phase) * FLICKER_SLOW
	var fast: float = sin(t * 5.2 + _phase * 1.3) * FLICKER_FAST
	light.energy = BASE_ENERGY + slow + fast
