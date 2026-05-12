# DashImpact — radial shockwave + spark burst at the end of dash strike.
# Two concentric Line2D circles (halo + core) scale outward from radius
# ~22 to ~2.7× over DURATION while fading to alpha 0. A CPUParticles2D
# burst fires sparks radially outward in the same beat.
#
# Why a Line2D ring vs a textured radial gradient: a Line2D circle reads
# crisply at any scale, doesn't need a baked texture asset, and reuses
# the same "thin halo + sharp core" trick the iter-13 slash_arc uses for
# visual consistency. The ring grows OUT past the hero, which sells the
# "AoE radius" intuitively — the visual extent of the ring at the end
# of its lifetime matches the radius of the actual hit-test in
# hero.gd's _resolve_dash_strike_hit (≈60 px).
#
# Lifetime is short (0.3s) so the impact reads as a single punctuated
# beat, not a lingering effect. main.gd pairs it with a heavier camera
# shake on hit.
extends Node2D

const DURATION: float = 0.3
const RING_SCALE_END: float = 2.7   # final scale on both rings

@onready var _halo: Line2D = $Halo
@onready var _core: Line2D = $Core

var _elapsed: float = 0.0
var _halo_base_alpha: float = 1.0
var _core_base_alpha: float = 1.0

func _ready() -> void:
	# Iter 69 — z_index 2 standardizes the iter-60+ ring FX layer
	# (shock_pulse, parry_pulse, death_pulse, dash_impact). Above floor,
	# below the hero's z_index. Chain/beam FX sit at z=5 above this.
	z_index = 2
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
	# Scale grows on an ease-out curve so the ring snaps outward fast then
	# decelerates — visually reads as energy expanding into resistance.
	var s_t: float = 1.0 - pow(1.0 - t, 2.0)
	scale = Vector2(1.0 + (RING_SCALE_END - 1.0) * s_t, 1.0 + (RING_SCALE_END - 1.0) * s_t)
	# Halo fades faster than core so the inner "sharp ring" reads as the
	# leading edge of the wave. Same asymmetry trick as slash_arc.
	var halo_fade: float = 1.0 - pow(t, 2.5)
	var core_fade: float = 1.0 - pow(t, 1.7)
	if _halo != null:
		var halo_col: Color = _halo.default_color
		halo_col.a = _halo_base_alpha * halo_fade
		_halo.default_color = halo_col
	if _core != null:
		var core_col: Color = _core.default_color
		core_col.a = _core_base_alpha * core_fade
		_core.default_color = core_col
