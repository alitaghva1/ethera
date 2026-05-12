# SlashArc — iter 81 rewrite (Workstream A of the post-iter-78 plan).
#
# Ported from slime-depths/src/fx.js drawSlashes. Previous Godot
# slash_arc accumulated layers across iters 60/73/75 (BladeRig +
# GhostArc + 3 arc Line2Ds + HiltFlash + TipBurst + HiltSparkle) trying
# to read as "a swept blade." User feedback (iter 78 conclusion): it
# still felt like a "drawn-on thing in front of the character."
#
# Diagnosis after studying the JS reference: the JS draws a multi-trail
# COMPOSITE every frame via canvas paths — N quadratic-curve strokes
# at time offsets, plus a wider additive-glow pass underneath. The eye
# reads motion blur of one arc, not a static node tree of overlapping
# ring-shapes.
#
# This rewrite is _draw()-based, not Line2D-based. Each frame:
#
#   PASS 1 (glow, 2 ghost layers max): wide soft stroke, alpha ~0.35,
#     width = base_width × 3. Stacks beneath the crisp pass to bloom
#     the slash.
#   PASS 2 (crisp): N strokes (trail_count from setup opts), each at
#     time-offset k × 0.07 behind the leading edge. Width tapers as
#     k increases; alpha fades as k increases AND as t advances.
#
# Each stroke is a quadratic Bezier sampled at 10 points — bulges
# outward at the tip like a real blade arc, not a straight line endpoint.
#
# Phases:
#   ANTICIPATION (HiltFlash): first ~0.08s — bright burst at swing origin.
#   SWEEP: 0 → dur, multi-trail composite tracks the sweep angle.
#   LINGER: 0 → 0.15s post-dur, trail decays to alpha 0 then queue_free.
#
# setup() takes (aim: Vector2, opts: Dictionary | int = 1). opts is the
# dict returned by AttackFeel.compose_slash_opts; the int form preserves
# the pre-iter-81 signature (legacy swing_sign param) for any caller
# that hasn't been migrated yet.
extends Node2D

# Linger phase — fixed +0.15s on top of dur so the last trail fades.
const LINGER_DURATION: float = 0.15

# Per-trail time offset (seconds). Each ghost k is k × this far behind
# the leading edge in the sweep. JS uses 0.07.
const TRAIL_OFFSET: float = 0.07

# Glow pass tuning — wider stroke + lower alpha than crisp pass.
const GLOW_WIDTH_MUL: float = 3.0
const GLOW_ALPHA_MUL: float = 0.35
const GLOW_LAYERS: int = 2   # JS uses min(2, trails); we hardcode 2

# Quadratic curve sampling — points per stroke. Higher = smoother arc
# but more draw calls. 10 reads smooth at the camera's zoom.
const CURVE_SAMPLES: int = 10

# Anticipation flash at swing origin.
const HILT_FLASH_DURATION: float = 0.08
const HILT_FLASH_RADIUS: float = 14.0

# z_index — per iter-69 convention slash sits at the beam layer above
# ring FX so it reads clearly on top of any ground decor.
const SLASH_Z_INDEX: int = 5

# Setup-time params (filled by setup()). Defaults match a base sword swing
# so a script-only spawn still draws something sane in tests.
var _aim: float = 0.0
var _reach: float = 60.0
var _width: float = 14.0
var _trail_count: int = 3
var _arc: float = PI * 0.75
var _dur: float = 0.20
var _color: Color = Color(1.0, 1.0, 1.0, 1.0)
var _swing_sign: int = 1

# Live state.
var _t: float = 0.0
var _hilt_flash_remaining: float = HILT_FLASH_DURATION

# setup(aim, opts) — opts may be a Dictionary (iter-81 path, output of
# AttackFeel.compose_slash_opts) or an int (legacy iter-75 swing_sign).
# The dual signature keeps backwards compat for any caller still using
# the int form during the transition.
func setup(aim: Vector2, opts = 1) -> void:
	if aim.length_squared() > 0.0001:
		_aim = aim.angle()
	if typeof(opts) == TYPE_DICTIONARY:
		_width       = float(opts.get("width", _width))
		_trail_count = int(opts.get("trail_count", _trail_count))
		_arc         = float(opts.get("arc", _arc))
		_dur         = float(opts.get("dur", _dur))
		_color       = opts.get("color", _color)
		_swing_sign  = int(opts.get("swing_sign", 1))
		_reach       = float(opts.get("reach", _reach))
	elif typeof(opts) == TYPE_INT:
		_swing_sign = int(opts)
	# Clamp trail count to a sane range — too many reads as a fan, too
	# few reads as a single strike with no motion.
	_trail_count = clampi(_trail_count, 2, 6)

func _ready() -> void:
	z_index = SLASH_Z_INDEX
	queue_redraw()

func _process(delta: float) -> void:
	_t += delta
	if _hilt_flash_remaining > 0.0:
		_hilt_flash_remaining = max(0.0, _hilt_flash_remaining - delta)
	queue_redraw()
	if _t >= _dur + LINGER_DURATION:
		queue_free()

func _draw() -> void:
	# Local t in [0..1] across the visible window (dur + linger).
	var total: float = _dur + LINGER_DURATION
	var t_norm: float = clampf(_t / total, 0.0, 1.0)

	# Anticipation flash (first ~80ms) — soft cream disc at swing origin.
	if _hilt_flash_remaining > 0.0:
		var ha: float = _hilt_flash_remaining / HILT_FLASH_DURATION
		var flash_color: Color = Color(
			min(1.0, _color.r * 1.1),
			min(1.0, _color.g * 1.05),
			min(1.0, _color.b * 1.1),
			ha * 0.85,
		)
		draw_circle(Vector2.ZERO, HILT_FLASH_RADIUS * (0.6 + 0.4 * (1.0 - ha)), flash_color)

	# Multi-trail composite. Each trail k has its own sweep-time kt that
	# lags by k × TRAIL_OFFSET. The leading trail (k=0) draws the most-
	# advanced sweep position; trailing trails draw earlier sweep angles,
	# leaving a fading wake behind the leading edge.
	for k in range(_trail_count):
		var kt: float = max(0.0, _t - float(k) * TRAIL_OFFSET) / _dur
		if kt <= 0.0:
			continue
		kt = clampf(kt, 0.0, 1.0)
		# Sweep angle for this trail. _swing_sign flips CW vs CCW.
		var sweep: float = float(_swing_sign) * (-_arc * 0.5 + _arc * kt)
		# Crisp alpha fades with t_norm + trail-depth.
		var alpha: float = (1.0 - float(k) * 0.9 / float(_trail_count)) * (1.0 - t_norm) * 0.9
		alpha = clampf(alpha, 0.0, 1.0)
		# Width tapers as trail ages and as overall t advances.
		var width: float = (_width - float(k) * (_width / float(_trail_count + 1))) * (1.0 - t_norm * 0.4)
		width = max(1.0, width)
		var points: PackedVector2Array = _sample_blade_curve(_aim + sweep, kt)
		# GLOW pass — only for first GLOW_LAYERS trails. Wider stroke,
		# lower alpha, blends as a soft halo under the crisp blade.
		if k < GLOW_LAYERS:
			var glow_color: Color = Color(_color.r, _color.g, _color.b, alpha * GLOW_ALPHA_MUL)
			draw_polyline(points, glow_color, width * GLOW_WIDTH_MUL, true)
		# CRISP pass — narrower, higher alpha. The blade edge itself.
		var crisp_color: Color = Color(_color.r, _color.g, _color.b, alpha)
		draw_polyline(points, crisp_color, width, true)

# Sample the blade curve for a given world-relative angle and sweep
# parameter. Returns CURVE_SAMPLES+1 points in local space.
#
# JS curve: quadratic Bezier from (r*0.55, -3) via control (r*0.85, 0)
# to (r*0.55, 3). The control bulges the curve outward beyond the
# endpoints — gives the slash a tapered-blade silhouette, not a straight
# chord. Sampled explicitly and rotated into world-relative space.
func _sample_blade_curve(angle: float, kt: float) -> PackedVector2Array:
	var pts: PackedVector2Array = PackedVector2Array()
	# Reach contracts slightly as the trail ages — JS uses
	# r = reach × (0.6 + 0.25 × (1 - kt)) so r at kt=0 is 0.85×reach,
	# r at kt=1 is 0.60×reach.
	var r: float = _reach * (0.60 + 0.25 * (1.0 - kt))
	var p0: Vector2 = Vector2(r * 0.55, -3.0)
	var p1: Vector2 = Vector2(r * 0.85,  0.0)
	var p2: Vector2 = Vector2(r * 0.55,  3.0)
	var cos_a: float = cos(angle)
	var sin_a: float = sin(angle)
	for i in range(CURVE_SAMPLES + 1):
		var u: float = float(i) / float(CURVE_SAMPLES)
		var iu: float = 1.0 - u
		# Quadratic Bezier: B(u) = (1-u)² p0 + 2u(1-u) p1 + u² p2
		var bx: float = iu * iu * p0.x + 2.0 * u * iu * p1.x + u * u * p2.x
		var by: float = iu * iu * p0.y + 2.0 * u * iu * p1.y + u * u * p2.y
		# Rotate into world-relative space.
		var x: float = bx * cos_a - by * sin_a
		var y: float = bx * sin_a + by * cos_a
		pts.append(Vector2(x, y))
	return pts
