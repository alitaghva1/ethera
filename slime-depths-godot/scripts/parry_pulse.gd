# ParryPulse — iter 25. Cyan expanding ring + spark burst spawned at
# the hero on Q tap (immediate input confirm) AND on a successful
# parry catch (bigger via hero scaling the instance 1.6×).
#
# Mirrors the shape of dash_impact.gd — two concentric Line2D rings
# scaling outward + fading with asymmetric ease decay (halo on t²,
# core on t³) so the kit reads cohesively across iter-13 slash_arc /
# dash_impact / iter-25 parry_pulse.
extends Node2D

const DURATION: float = 0.30
const RING_SCALE_END: float = 2.4   # final scale on both rings

@onready var _halo: Line2D = $Halo
@onready var _core: Line2D = $Core

var _elapsed: float = 0.0
var _halo_base_alpha: float = 1.0
var _core_base_alpha: float = 1.0

func _ready() -> void:
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
	# Ease-out scale: snaps outward fast, decelerates as it expands.
	# Multiplies into existing parent scale so a hero-side .scale = 1.6×
	# on the catch-pulse instance still gets the same growth curve on
	# top, just at 1.6× starting size.
	var s_t: float = 1.0 - pow(1.0 - t, 2.0)
	var s_val: float = 1.0 + (RING_SCALE_END - 1.0) * s_t
	scale = Vector2(s_val, s_val)
	# Halo fades faster than core so the inner sharp ring reads as the
	# leading edge — same trick the dash_impact uses.
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
