# ParryPulse — iter 73 phasing rework. Iter 25 baseline: cyan expanding
# ring + spark burst (peak phase only). The parry now reads as three
# phases:
#   • PRE-FLASH (0..0.05s) — a bright cyan-white starburst at the parry
#     origin BEFORE the rings expand. Tells the eye "the parry just
#     connected" the instant it fires, instead of waiting for the ring
#     to grow into readability.
#   • PULSE (0.05..0.30s) — the iter-25 two-ring expansion + spark burst
#     unchanged. This is the "deflection" beat.
#   • LINGER — extended DURATION 0.30 → 0.36 with a slower core decay
#     so the cyan rings stay readable a fraction longer.
#
# The pre-flash uses a dedicated Polygon2D ("PreFlash") that lives in
# the .tscn — kept at full alpha for FLASH_DURATION then faded to zero
# over the next ~0.03s. This is cleaner than tweening any of the rings
# (which need to behave consistently with their own grow curves).
#
# Mirrors the shape of dash_impact.gd — two concentric Line2D rings
# scaling outward + fading with asymmetric ease decay (halo on t²,
# core on t³) so the kit reads cohesively across iter-13 slash_arc /
# dash_impact / iter-25 parry_pulse.
extends Node2D

const DURATION: float = 0.36   # iter 73: 0.30 → 0.36, longer linger after parry
const RING_SCALE_END: float = 2.4   # final scale on both rings
const FLASH_DURATION: float = 0.05   # bright pre-flash at parry origin
const FLASH_FADE_TAIL: float = 0.04   # fades over this many seconds after FLASH_DURATION

@onready var _halo: Line2D = $Halo
@onready var _core: Line2D = $Core
@onready var _pre_flash: Polygon2D = get_node_or_null("PreFlash")

var _elapsed: float = 0.0
var _halo_base_alpha: float = 1.0
var _core_base_alpha: float = 1.0
var _flash_base_color: Color = Color(1, 1, 1, 1)

func _ready() -> void:
	# Iter 69 — z_index 2 keeps the parry pulse on the same FX layer as
	# the other ring effects (dash_impact, shock_pulse, death_pulse).
	z_index = 2
	if _halo != null:
		_halo_base_alpha = _halo.default_color.a
	if _core != null:
		_core_base_alpha = _core.default_color.a
	if _pre_flash != null:
		_flash_base_color = _pre_flash.color

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
	# leading edge — same trick the dash_impact uses. Core fade is now
	# t^1.5 (was t^1.7) so the bright cyan edge lingers slightly longer
	# at the end of the parry beat.
	var halo_fade: float = 1.0 - pow(t, 2.5)
	var core_fade: float = 1.0 - pow(t, 1.5)
	if _halo != null:
		var halo_col: Color = _halo.default_color
		halo_col.a = _halo_base_alpha * halo_fade
		_halo.default_color = halo_col
	if _core != null:
		var core_col: Color = _core.default_color
		core_col.a = _core_base_alpha * core_fade
		_core.default_color = core_col
	# Pre-flash — bright cyan starburst at the parry origin. Holds at
	# full alpha for FLASH_DURATION then fades linearly over the next
	# FLASH_FADE_TAIL seconds. After that, it's invisible until queue_free.
	if _pre_flash != null:
		var fa: float = 0.0
		if _elapsed < FLASH_DURATION:
			fa = 1.0
		elif _elapsed < FLASH_DURATION + FLASH_FADE_TAIL:
			fa = 1.0 - ((_elapsed - FLASH_DURATION) / FLASH_FADE_TAIL)
		_pre_flash.color = Color(
			_flash_base_color.r,
			_flash_base_color.g,
			_flash_base_color.b,
			_flash_base_color.a * fa,
		)
