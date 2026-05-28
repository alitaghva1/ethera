# DeathPulse — crimson radial shockwave + radial blood spray for the
# hero's death cinematic. Mirrors dash_impact.gd's shape (two concentric
# Line2D rings scaling outward + alpha fade) but tuned bigger and red:
#
#   • Lifetime 0.6s (vs dash_impact's 0.3s) so the wave breathes longer —
#     the slow-mo ramp main.gd lays on top stretches perception further.
#   • Final ring scale 2.5× off a base radius of 32 → ~80 px outer edge,
#     significantly larger than dash_impact's ~60 px. The hero's death
#     reads as an event with REACH; dash impact is a poke by comparison.
#   • Crimson palette (no cream highlight). The "warm cream core" trick
#     dash_impact uses to sell magic energy would dilute the blood tone.
#     Two reds (deep crimson halo + brighter blood core) keep the read.
#
# Spawned by hero.gd's take_damage lethal branch, parented to the hero's
# parent (current scene / room) so it persists at the death position
# even though the hero corpse stays put.
extends Node2D

const DURATION: float = 0.6
const RING_SCALE_END: float = 2.5

@onready var _halo: Line2D = $Halo
@onready var _core: Line2D = $Core

var _elapsed: float = 0.0
var _halo_base_alpha: float = 1.0
var _core_base_alpha: float = 1.0

func _ready() -> void:
	# Iter 69 — z_index 2 matches the rest of the iter-60+ ring FX layer
	# (dash_impact, parry_pulse, shock_pulse). Death is dramatic but it's
	# still a ring effect, not an always-on-top beam.
	z_index = 2
	if _halo != null:
		_halo_base_alpha = _halo.default_color.a
	if _core != null:
		_core_base_alpha = _core.default_color.a

func _process(delta: float) -> void:
	_elapsed += delta
	var t: float = clampf(_elapsed / DURATION, 0.0, 1.0)
	if t >= 1.0:
		queue_free()
		return
	# Ease-out scale grow. Same curve as dash_impact — energy snaps
	# outward then settles. Slightly slower exponent (1.8 vs 2.0) so the
	# wave keeps expanding visibly through the slow-mo middle section.
	var s_t: float = 1.0 - pow(1.0 - t, 1.8)
	var s: float = 1.0 + (RING_SCALE_END - 1.0) * s_t
	scale = Vector2(s, s)
	# Asymmetric fade — halo dies faster so the inner core reads as the
	# advancing edge of the wave. Same trick as dash_impact / slash_arc.
	var halo_fade: float = 1.0 - pow(t, 2.2)
	var core_fade: float = 1.0 - pow(t, 1.5)
	if _halo != null:
		var halo_col: Color = _halo.default_color
		halo_col.a = _halo_base_alpha * halo_fade
		_halo.default_color = halo_col
	if _core != null:
		var core_col: Color = _core.default_color
		core_col.a = _core_base_alpha * core_fade
		_core.default_color = core_col
