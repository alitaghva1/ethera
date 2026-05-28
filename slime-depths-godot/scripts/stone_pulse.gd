# StonePulse — iter 72 redesign FX for STONEHEART. A short emerald-green
# pulse around the hero spawned when the first enemy of a new room dies.
# Mirrors the shock_pulse / ember_burst ring grammar (two concentric
# Line2D rings + ease-out scale + halo-faster-than-core fade) so it
# fits the existing FX kit. Palette is BLOOD-themed cool green —
# distinct from the warm orange of ember_burst and the cyan of
# shock_pulse so a player who triggers multiple procs in the same
# room knows which one fired.
#
# Used as the visual confirmation of the STONEHEART "first kill of the
# room heals +1 HP" effect. Spawned at the hero (not the enemy) because
# the heal applies to the hero — so the pulse should originate where the
# heal lands. Snapshot-style: no damage, no enemy hit-test, purely a
# cosmetic beat marking a relic proc.
#
# Setup contract:
#   setup(radius)  — single param, since this FX never damages enemies.
#     - radius (float): final ring radius in px.
# Must be called BEFORE add_child so _ready sees the configured radius.
class_name StonePulse
extends Node2D

const DURATION: float = 0.45
const START_SCALE: float = 0.35
const BASE_RADIUS: float = 45.0
const POLY_SEGMENTS: int = 16

var _radius_target: float = 45.0

var _elapsed: float = 0.0
var _halo: Line2D = null
var _core: Line2D = null
var _scale_end: float = 1.0
var _initialized: bool = false

func setup(radius: float) -> void:
	_radius_target = max(1.0, radius)

func _ready() -> void:
	# Iter 69 — z_index 2 puts the ring on the standard FX layer alongside
	# dash_impact / parry_pulse / shock_pulse / ember_burst.
	z_index = 2
	_scale_end = _radius_target / BASE_RADIUS
	scale = Vector2(_scale_end * START_SCALE, _scale_end * START_SCALE)
	_build_rings()
	_initialized = true

# Two-ring construction — same halo + core grammar as ember_burst /
# shock_pulse, only the palette differs: warm emerald-green for the
# halo, bright lime-cream for the core. Reads as "earth / stone vitality"
# distinct from FLAME orange and STORM cyan.
func _build_rings() -> void:
	var pts: PackedVector2Array = _circle_points(BASE_RADIUS, POLY_SEGMENTS)
	# Halo — emerald-green bloom.
	_halo = Line2D.new()
	_halo.points = pts
	_halo.closed = true
	_halo.width = 8.0
	_halo.default_color = Color(0.40, 0.95, 0.55, 0.60)
	_halo.joint_mode = 2   # LINE_JOINT_ROUND
	_halo.begin_cap_mode = 2
	_halo.end_cap_mode = 2
	_halo.antialiased = true
	_halo.z_index = -1
	add_child(_halo)

	# Core — narrow, bright cream-lime.
	_core = Line2D.new()
	_core.points = pts
	_core.closed = true
	_core.width = 2.5
	_core.default_color = Color(0.85, 1.0, 0.75, 1.0)
	_core.joint_mode = 2
	_core.begin_cap_mode = 2
	_core.end_cap_mode = 2
	_core.antialiased = true
	add_child(_core)

func _circle_points(r: float, segments: int) -> PackedVector2Array:
	var out: PackedVector2Array = PackedVector2Array()
	for i in range(segments):
		var a: float = (TAU / float(segments)) * float(i)
		out.append(Vector2(cos(a), sin(a)) * r)
	return out

func _process(delta: float) -> void:
	if not _initialized:
		return
	_elapsed += delta
	var t: float = _elapsed / DURATION
	if t >= 1.0:
		queue_free()
		return
	# Ease-out scale: snaps fast, decelerates. Same curve as shock_pulse.
	var s_t: float = 1.0 - pow(1.0 - t, 2.0)
	var s_val: float = _scale_end * (START_SCALE + (1.0 - START_SCALE) * s_t)
	scale = Vector2(s_val, s_val)
	# Halo fades faster than core — same leading-edge trick as ember_burst.
	var halo_fade: float = 1.0 - pow(t, 1.7)
	var core_fade: float = 1.0 - pow(t, 2.4)
	if _halo != null:
		var hc: Color = _halo.default_color
		hc.a = 0.60 * halo_fade
		_halo.default_color = hc
	if _core != null:
		var cc: Color = _core.default_color
		cc.a = 1.0 * core_fade
		_core.default_color = cc
