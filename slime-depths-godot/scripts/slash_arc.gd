# SlashArc — a curved white-gold streak drawn along the swing direction,
# fading and expanding outward over a short window. Spawned by the
# ScreenFlash autoload on `Events.hero_attacked(pos, aim)`.
#
# Why Line2D + _process tween (vs. CPUParticles2D): we want a single
# coherent ARC shape that reads as a sword's cutting edge — not a fan of
# loose particles. A pre-shaped Line2D with `width_curve` set in the
# .tscn (tapered ends) gives the slash that "drawn" feel, and animating
# scale + alpha in _process keeps it cheap (one node, no physics).
#
# The arc is authored in scene-space pointing right (+X). The `setup()`
# call rotates the whole Node2D so the arc faces the aim direction, then
# the per-frame tween scales it outward and fades it to zero alpha.
extends Node2D

const DURATION: float = 0.25
const SCALE_BOOST: float = 0.5  # final scale = 1.0 + SCALE_BOOST

@onready var _line: Line2D = $Line2D

var _elapsed: float = 0.0
var _base_scale: Vector2 = Vector2.ONE

func setup(aim: Vector2) -> void:
	# Orient the arc to face the aim direction. atan2 gives angle in
	# radians from +X axis, which matches the line's authored
	# orientation in the .tscn (points right, +X).
	if aim.length_squared() > 0.0001:
		rotation = aim.angle()

func _ready() -> void:
	# Cache the design-time scale so the per-frame growth multiplies it
	# correctly instead of overwriting whatever the .tscn set.
	_base_scale = scale

func _process(delta: float) -> void:
	_elapsed += delta
	var t: float = _elapsed / DURATION
	if t >= 1.0:
		queue_free()
		return
	# Linear fade is fine here — the slash is so brief (0.25s) that
	# easing differences read as noise. Alpha drives the perceived
	# fade since the Line2D's `default_color` is white-gold.
	var alpha: float = 1.0 - t
	var grow: float = 1.0 + SCALE_BOOST * t
	scale = _base_scale * grow
	if _line != null:
		var col: Color = _line.default_color
		col.a = alpha
		_line.default_color = col
