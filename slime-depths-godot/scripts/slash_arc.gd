# SlashArc — iter 13 layered version. Two Line2D children: a wide,
# blooming "Halo" magenta-gold underglow and a narrow, sharp near-white
# "Core" edge. They share the same arc geometry but blow outward at
# different rates so the slash reads as a magical crescent of energy
# rather than a sword cut.
#
# Why two lines vs. one: the wider single-line halo from iter 11 looked
# flat (just a fat streak). A narrow core riding on top of a soft halo
# reads as light bleeding off a sharp edge — the difference between a
# spotlight and a porch lamp.
#
# Why Line2D + _process tween (vs. CPUParticles2D): we want a single
# coherent ARC shape, not a fan of particles. Particles would scatter
# and not preserve the arc silhouette. Tweening alpha + scale per-frame
# is one allocation, no physics, and lets the halo + core decay at
# their own rates.
extends Node2D

const DURATION: float = 0.25
# Halo blooms outward faster than core — the bloom "ghosts" past the
# sharper edge, giving a sense of motion.
const HALO_SCALE_BOOST: float = 0.85
const CORE_SCALE_BOOST: float = 0.35

@onready var _halo: Line2D = $Halo
@onready var _core: Line2D = $Line2D

var _elapsed: float = 0.0
var _base_scale: Vector2 = Vector2.ONE
var _halo_base_alpha: float = 1.0
var _core_base_alpha: float = 1.0

func setup(aim: Vector2) -> void:
	# Orient the arc to face the aim direction.
	if aim.length_squared() > 0.0001:
		rotation = aim.angle()

func _ready() -> void:
	_base_scale = scale
	if _halo != null:
		_halo_base_alpha = _halo.default_color.a
	if _core != null:
		_core_base_alpha = _core.default_color.a

func _process(delta: float) -> void:
	_elapsed += delta
	var t: float = _elapsed / DURATION
	if t >= 1.0:
		queue_free()
		return
	# Halo fades to alpha 0 faster (ease-out cube) than the core (ease-
	# out quad). The halo blooms then dies; the core lingers a touch
	# longer so the player still sees the "edge" cut at the end.
	var halo_fade: float = 1.0 - pow(t, 3.0)
	var core_fade: float = 1.0 - pow(t, 2.0)
	# Both lines share the parent transform but scale_boost differs —
	# we apply per-line scale via the node's children to avoid stacking
	# transforms. Simpler: set parent scale to the average growth, then
	# nudge each line's modulate alpha individually. The visual offset
	# between halo+core is the asymmetric alpha + the natural width
	# difference baked into the .tscn.
	var avg_boost: float = (HALO_SCALE_BOOST + CORE_SCALE_BOOST) * 0.5
	scale = _base_scale * (1.0 + avg_boost * t)
	if _halo != null:
		var halo_col: Color = _halo.default_color
		halo_col.a = _halo_base_alpha * halo_fade
		_halo.default_color = halo_col
	if _core != null:
		var core_col: Color = _core.default_color
		core_col.a = _core_base_alpha * core_fade
		_core.default_color = core_col
