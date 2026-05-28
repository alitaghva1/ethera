# ArcaneBolt — iter 72 redesign FX for ARCANE PULSE. A magenta forked
# bolt rendered between two world positions, spawned when every 5th
# blast triggers the "arcane surge" proc — finds the nearest off-target
# enemy and zaps it for +1 damage. Mirrors the chain_arc.gd (iter 67)
# pattern almost exactly, only the palette differs: chain_arc uses
# STORM cyan-white, arcane_bolt uses ARCANE PULSE magenta-violet so a
# player who owns both relics can tell which one fired.
#
# Why a separate FX (vs. reusing chain_arc with a different color modulate):
# - chain_arc's palette is baked in as default_color on its Line2Ds, so a
#   modulate would tint OVER the cyan instead of replacing it — the result
#   reads as muddy lavender, not crisp arcane purple.
# - Splitting the scenes makes the "STORM theme chain bolt" vs "ARCANE
#   PULSE every-5th bolt" visually distinct, which matters because they
#   can co-occur (both relics owned).
#
# Setup contract:
#   setup(from_pos, to_pos)
#     - from_pos (Vector2): world position the bolt originates from
#     - to_pos (Vector2): world position the bolt terminates at
# Must be called BEFORE add_child so _ready sees the endpoints.
class_name ArcaneBolt
extends Node2D

const LIFETIME: float = 0.20
# Jaggedness — same value as chain_arc. Reads as discrete forked bolt,
# not a smooth curve or a chaotic scribble.
const JITTER: float = 14.0
const MIDPOINTS: int = 4
const SPARK_RADIUS: float = 6.0

var _elapsed: float = 0.0
var _core: Line2D = null
var _glow: Line2D = null
var _spark_a: Polygon2D = null
var _spark_b: Polygon2D = null
var _initialized: bool = false
var _from: Vector2 = Vector2.ZERO
var _to: Vector2 = Vector2.ZERO

func setup(from_pos: Vector2, to_pos: Vector2) -> void:
	_from = from_pos
	_to = to_pos

func _ready() -> void:
	# Iter 69 — z_index 5 puts the beam above the standard ring FX layer
	# (z=2 for dash_impact / parry_pulse / shock_pulse). Matches chain_arc's
	# convention so two arcane procs in the same beat never occlude each
	# other.
	z_index = 5
	_build_arc()
	_initialized = true

func _build_arc() -> void:
	global_position = _from
	var local_to: Vector2 = _to - _from
	var dist: float = local_to.length()
	if dist < 0.1:
		return
	var dir: Vector2 = local_to / dist
	var perp: Vector2 = Vector2(-dir.y, dir.x)
	var pts: PackedVector2Array = PackedVector2Array()
	pts.append(Vector2.ZERO)
	for i in range(MIDPOINTS):
		var t: float = float(i + 1) / float(MIDPOINTS + 1)
		var taper: float = sin(t * PI)
		var offset: float = randf_range(-JITTER, JITTER) * taper
		var mid: Vector2 = dir * (dist * t) + perp * offset
		pts.append(mid)
	pts.append(local_to)

	# Glow — wider, saturated magenta-violet, lower alpha. Drawn first
	# so the core can sit on top.
	_glow = Line2D.new()
	_glow.points = pts
	_glow.width = 7.0
	_glow.default_color = Color(0.85, 0.45, 1.0, 0.55)
	_glow.joint_mode = 2
	_glow.begin_cap_mode = 2
	_glow.end_cap_mode = 2
	_glow.antialiased = true
	_glow.z_index = -1
	add_child(_glow)

	# Core — narrow, bright violet-white. The crisp arcane edge.
	_core = Line2D.new()
	_core.points = pts
	_core.width = 2.5
	_core.default_color = Color(1.0, 0.85, 1.0, 1.0)
	_core.joint_mode = 2
	_core.begin_cap_mode = 2
	_core.end_cap_mode = 2
	_core.antialiased = true
	add_child(_core)

	# Endpoint sparks — same octagonal Polygon2D pattern as chain_arc, only
	# the color tilts violet. Sells the "the bolt LANDED here" beat.
	_spark_a = _make_spark(Vector2.ZERO)
	add_child(_spark_a)
	_spark_b = _make_spark(local_to)
	add_child(_spark_b)

func _make_spark(at: Vector2) -> Polygon2D:
	var poly: Polygon2D = Polygon2D.new()
	var verts: PackedVector2Array = PackedVector2Array()
	var n: int = 8
	for i in range(n):
		var a: float = (TAU / float(n)) * float(i)
		verts.append(at + Vector2(cos(a), sin(a)) * SPARK_RADIUS)
	poly.polygon = verts
	poly.color = Color(0.95, 0.8, 1.0, 0.85)
	return poly

func _process(delta: float) -> void:
	if not _initialized:
		return
	_elapsed += delta
	var t: float = _elapsed / LIFETIME
	if t >= 1.0:
		queue_free()
		return
	# Core lingers slightly longer than glow — same trick chain_arc uses.
	var glow_fade: float = 1.0 - pow(t, 1.5)
	var core_fade: float = 1.0 - pow(t, 2.5)
	if _glow != null:
		var gc: Color = _glow.default_color
		gc.a = 0.55 * glow_fade
		_glow.default_color = gc
	if _core != null:
		var cc: Color = _core.default_color
		cc.a = 1.0 * core_fade
		_core.default_color = cc
	# Spark pulse — brighter at spawn, fading by the bolt's death.
	var spark_pulse: float = 1.0
	if t < 0.3:
		spark_pulse = 1.0 + (0.3 - t) * 2.0
	if _spark_a != null:
		var sa: Color = _spark_a.color
		sa.a = 0.85 * (1.0 - t) * spark_pulse
		_spark_a.color = sa
	if _spark_b != null:
		var sb: Color = _spark_b.color
		sb.a = 0.85 * (1.0 - t) * spark_pulse
		_spark_b.color = sb
