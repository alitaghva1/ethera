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

# iter-116: BASE_ENERGY 1.40 → 1.55 to match the brighter torch.tscn
# rest pool. Flicker amplitudes scaled up proportionally so the relative
# flicker depth (fast / slow / jitter as % of base) stays the same —
# otherwise torches would feel weirdly stable under the brighter base.
# Iter 187 batch 3 — BUG FOUND: iter-183 item 3 bumped torch.tscn energy
# 1.55 → 1.95, but _process here OVERWRITES light.energy every frame
# with BASE_ENERGY + flicker, ignoring the .tscn value. My iter-183
# torch boost was a no-op at runtime. Fix: bump BASE_ENERGY 1.55 → 1.95
# to match the intended brighter rest pool. Flicker amps scaled +25%
# proportionally so depth holds.
const BASE_ENERGY   := 1.95
const FLICKER_FAST  := 0.25    # high-freq sin amplitude
const FLICKER_SLOW  := 0.14    # low-freq sin amplitude
const JITTER        := 0.07    # per-frame random amplitude

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
	# Iter 187 batch 3 — alpha flicker on the flame sprite. Pre-iter-187
	# the flame's brightness was constant while the light pulsed; eye
	# could see the LIGHT flicker but the source orb stayed static.
	# Now alpha varies ~0.78..1.0 in sync with the brightness curve so
	# the flame visually IS the pulse, not just casting it.
	# Modifies only the alpha channel — RGB is set by main.gd per biome
	# (sanctuary blue-white, ember hot red, etc).
	flame.modulate.a = 0.85 + (fast + slow) * 0.35
