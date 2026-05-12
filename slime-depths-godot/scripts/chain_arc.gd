# ChainArc — iter 67 STORM × BLAST visual. A bright forked lightning bolt
# rendered as a jagged Line2D between two world positions. Spawned by the
# projectile when storm_chain_count > 0 fires on an enemy hit. Lifetime
# is brief (0.18s) — a quick flash, not a persistent beam.
#
# Why Line2D + procedural jitter (vs. CPUParticles2D or a pre-baked sprite):
# - The bolt has TWO authoritative endpoints (impact_pos + chain target).
#   Particles can't lock to both ends; a sprite would have to be scaled
#   and rotated and would always look "stretchy" at long distances.
# - Procedural jitter at spawn gives every arc a fresh fork — the player
#   doesn't see the same lightning shape twice. Reads as real plasma
#   discharge, not a re-used asset.
# - Three points minimum (start + 3-5 midpoints + end) is enough to feel
#   like classic forked lightning without a million verts. The midpoints
#   are perpendicular-offset off the start→end axis.
#
# Pairs with the existing STORM melee chain visual (chain_lightning relic)
# but applies on BLAST hits as the chain-spread variant of the BLAST × STORM
# ability evolution (theme_tier("storm") >= 1 = chain 1, >= 2 = chain 2 at
# 0.6× damage).
class_name ChainArc
extends Node2D

const LIFETIME: float = 0.18
# Jaggedness — how far perpendicular each midpoint can wander from the
# straight start→end line. Tuned so a 120px arc still reads as a discrete
# forked bolt (not a smooth curve, not a chaotic scribble).
const JITTER: float = 14.0
# Number of midpoints between endpoints. 4 = 5 segments per arc, enough
# bends to read as lightning, not a polygon line.
const MIDPOINTS: int = 4

# Optional spark Polygon2Ds at each endpoint — a quick burst that "lands"
# the bolt onto the impact site, like the cinder pulse on a tesla coil.
const SPARK_RADIUS: float = 6.0

var _elapsed: float = 0.0
var _core: Line2D = null
var _glow: Line2D = null
var _spark_a: Polygon2D = null
var _spark_b: Polygon2D = null
var _initialized: bool = false

# setup() is called by projectile.gd after instantiating and BEFORE adding
# to tree. World positions are stored, then _ready() builds the line geometry
# (so the arc visual reflects where the projectile actually impacted).
var _from: Vector2 = Vector2.ZERO
var _to: Vector2 = Vector2.ZERO

func setup(from_pos: Vector2, to_pos: Vector2) -> void:
	_from = from_pos
	_to = to_pos

func _ready() -> void:
	_build_arc()
	_initialized = true

# Build the jagged bolt. Core = bright white-cyan, narrow. Glow = wider
# saturated cyan halo. Two Line2Ds with shared geometry but different
# widths so the player sees a bright edge with a soft halo — same "blade
# + halo" trick the slash arc uses.
func _build_arc() -> void:
	# Compute jagged points between _from and _to.
	# Position the node at _from so the points are in local space (clean
	# math for future transformations like fading the segments individually).
	global_position = _from
	var local_to: Vector2 = _to - _from
	var dist: float = local_to.length()
	if dist < 0.1:
		# Degenerate — start == end. Skip so we don't crash on PackedVector2
		# operations and just queue_free shortly.
		return
	var dir: Vector2 = local_to / dist
	# Perpendicular axis for the per-midpoint random offset.
	var perp: Vector2 = Vector2(-dir.y, dir.x)
	var pts: PackedVector2Array = PackedVector2Array()
	pts.append(Vector2.ZERO)
	# Distribute the midpoints evenly along the line, each shoved perp by
	# a random amount in [-JITTER, JITTER]. The first and last midpoints
	# get slightly less jitter so the line "anchors" cleanly at start/end.
	for i in range(MIDPOINTS):
		var t: float = float(i + 1) / float(MIDPOINTS + 1)
		# Taper the jitter at the ends so the arc visibly STARTS at the
		# impact and ENDS at the target — pure cosmetic, but it sells the
		# "discharging from there to there" read.
		var taper: float = sin(t * PI)
		var offset: float = randf_range(-JITTER, JITTER) * taper
		var mid: Vector2 = dir * (dist * t) + perp * offset
		pts.append(mid)
	pts.append(local_to)

	# Glow layer — wider, saturated cyan, lower alpha. Drawn first (lower
	# z) so the core can sit on top.
	_glow = Line2D.new()
	_glow.points = pts
	_glow.width = 7.0
	_glow.default_color = Color(0.35, 0.85, 1.0, 0.55)
	_glow.joint_mode = 2   # LINE_JOINT_ROUND
	_glow.begin_cap_mode = 2
	_glow.end_cap_mode = 2
	_glow.antialiased = true
	_glow.z_index = -1
	add_child(_glow)

	# Core layer — narrow, bright white-cyan, opaque. The "lightning edge."
	_core = Line2D.new()
	_core.points = pts
	_core.width = 2.5
	_core.default_color = Color(0.95, 1.0, 1.0, 1.0)
	_core.joint_mode = 2
	_core.begin_cap_mode = 2
	_core.end_cap_mode = 2
	_core.antialiased = true
	add_child(_core)

	# Endpoint sparks — small octagonal Polygon2Ds at start + end. Bright
	# white core, sells the "the bolt LANDED here" beat.
	_spark_a = _make_spark(Vector2.ZERO)
	add_child(_spark_a)
	_spark_b = _make_spark(local_to)
	add_child(_spark_b)

# Build a tiny octagonal polygon at a local position. Used for both endpoints
# so the bolt looks like it's CONNECTING two charged points rather than
# floating in space.
func _make_spark(at: Vector2) -> Polygon2D:
	var poly: Polygon2D = Polygon2D.new()
	var verts: PackedVector2Array = PackedVector2Array()
	var n: int = 8
	for i in range(n):
		var a: float = (TAU / float(n)) * float(i)
		verts.append(at + Vector2(cos(a), sin(a)) * SPARK_RADIUS)
	poly.polygon = verts
	poly.color = Color(0.9, 1.0, 1.0, 0.85)
	return poly

# Drive the fade in _process so the arc visibly decays over LIFETIME.
# Could be done with Tween but _process keeps the lifecycle in one place
# and matches the slash_arc.gd pattern (the other "burst VFX in the scene
# briefly" precedent in the codebase).
func _process(delta: float) -> void:
	if not _initialized:
		return
	_elapsed += delta
	var t: float = _elapsed / LIFETIME
	if t >= 1.0:
		queue_free()
		return
	# Core lingers slightly longer than glow — same "the edge stays sharper
	# than the halo" trick as slash_arc.
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
	# Sparks pulse brighter then fade — gives the endpoints a "firing"
	# look at spawn that softens by the bolt's death.
	var spark_pulse: float = 1.0
	if t < 0.3:
		spark_pulse = 1.0 + (0.3 - t) * 2.0   # up to ~1.6× at t=0
	if _spark_a != null:
		var sa: Color = _spark_a.color
		sa.a = 0.85 * (1.0 - t) * spark_pulse
		_spark_a.color = sa
	if _spark_b != null:
		var sb: Color = _spark_b.color
		sb.a = 0.85 * (1.0 - t) * spark_pulse
		_spark_b.color = sb
