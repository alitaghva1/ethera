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

# Iter 29 — third outermost halo for the energy-aura look. Bleeds
# into the dim dungeon palette; decays fastest of the three lines so
# the outer glow blooms then dies while the core edge lingers.
@onready var _outer: Line2D = $OuterHalo
@onready var _halo: Line2D = $Halo
@onready var _core: Line2D = $Line2D

var _elapsed: float = 0.0
var _base_scale: Vector2 = Vector2.ONE
var _outer_base_alpha: float = 1.0
var _halo_base_alpha: float = 1.0
var _core_base_alpha: float = 1.0

# Iter 19: setup accepts an optional sign for alternating swings. The
# arc geometry is symmetric around the aim axis, so the visible
# alternation comes from tilting the rotation a touch one way / the
# other (±SWING_TILT rad). Reads as "one-two combo" without re-authoring
# the line shape.
const SWING_TILT := 0.28

func setup(aim: Vector2, swing_sign: int = 1) -> void:
	if aim.length_squared() > 0.0001:
		rotation = aim.angle()
		# Apply a small CW/CCW tilt so consecutive swings visibly
		# alternate. Sign comes from the caller (ScreenFlash maintains
		# a counter); we just translate it into rotation offset here.
		rotation += SWING_TILT if swing_sign > 0 else -SWING_TILT

func _ready() -> void:
	# Iter 69 — z_index 2 places the slash on the standard FX layer
	# (consistent with dash_impact, parry_pulse, shock_pulse, death_pulse).
	z_index = 2
	_base_scale = scale
	if _outer != null:
		_outer_base_alpha = _outer.default_color.a
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
	# Iter 29 — three asymmetric decay curves, each layer has its own
	# "lifetime feel":
	#   outer  t^3.5  fastest decay — bloom-and-die atmospheric glow
	#   halo   t^3    mid decay
	#   core   t^2    slowest decay — the sharp edge lingers
	# Combined: the wide energy aura puffs out and dies while the
	# sharp blade-cut edge is still visible. Same trick as iter-13
	# but with one more layer for a fuller crescent.
	var outer_fade: float = 1.0 - pow(t, 3.5)
	var halo_fade: float = 1.0 - pow(t, 3.0)
	var core_fade: float = 1.0 - pow(t, 2.0)
	# Scale grows on the average across the layers — keeps the three
	# Line2Ds visually locked together as one slash even though their
	# alphas drift apart.
	var avg_boost: float = (HALO_SCALE_BOOST + CORE_SCALE_BOOST) * 0.5
	scale = _base_scale * (1.0 + avg_boost * t)
	if _outer != null:
		var outer_col: Color = _outer.default_color
		outer_col.a = _outer_base_alpha * outer_fade
		_outer.default_color = outer_col
	if _halo != null:
		var halo_col: Color = _halo.default_color
		halo_col.a = _halo_base_alpha * halo_fade
		_halo.default_color = halo_col
	if _core != null:
		var core_col: Color = _core.default_color
		core_col.a = _core_base_alpha * core_fade
		_core.default_color = core_col
