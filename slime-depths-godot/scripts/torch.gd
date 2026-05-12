# Torch — flickering warm PointLight2D + a small flame Sprite2D-stub.
#
# Why this is here: the single biggest visual upgrade Godot gives us
# vs the JS canvas is real-time 2D lighting. Each torch is one node
# with built-in radial gradient + energy modulation. In the JS game,
# slime-depths/src/room.js paints torches via canvas radialGradient
# every frame with manual flicker math — works, but expensive +
# code-heavy. Godot does it natively + correctly z-ordered.
#
# Flicker model: layered sin waves at different periods + tiny
# random per-frame jitter. The same recipe slime-depths uses in
# main.js torch rendering, ported to GDScript.
extends Node2D

const BASE_ENERGY   := 1.40
const FLICKER_FAST  := 0.18    # high-freq sin amplitude
const FLICKER_SLOW  := 0.10    # low-freq sin amplitude
const JITTER        := 0.05    # per-frame random amplitude

@onready var light: PointLight2D = $PointLight2D
@onready var flame: Sprite2D = $Flame

# Per-torch phase so adjacent torches don't pulse in lockstep.
var _phase := randf() * TAU

# Iter 35 — per-torch dim multiplier. main.gd's dim_lights wave_event
# tweens this from 1.0 down (e.g. 0.45) so the final energy = base +
# flicker, then * energy_mul. Tweening this instead of light.energy
# directly survives _process's per-frame energy assignment.
var energy_mul: float = 1.0

func _process(delta: float) -> void:
	var t := Time.get_ticks_msec() / 1000.0
	var fast := sin(t * 9.5 + _phase) * FLICKER_FAST
	var slow := sin(t * 2.7 + _phase * 1.7) * FLICKER_SLOW
	var jitter := randf_range(-JITTER, JITTER)
	light.energy = (BASE_ENERGY + fast + slow + jitter) * energy_mul
	# Flame sprite scales subtly with the brightness for visual coupling.
	var s := 1.0 + (fast + slow) * 0.6
	flame.scale = Vector2(s, s)
