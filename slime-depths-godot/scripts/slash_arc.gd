# SlashArc — iter 73 phasing rework. Pre-iter-73 the slash was a single
# instantaneous flash (peak phase only). The shoot has four phases the
# eye can read — anticipation/travel/connection/theme — but the slash
# was just one beat with no anticipation tell and no connection cue.
#
# Iter 73 adds the missing phases:
#   • ANTICIPATION — HiltFlash node bursts a bright white-cyan circle
#     at the swing origin in the first 0.07s before the arcs read as
#     a coherent cut. The eye gets "the hero is about to swing" instead
#     of "where did that come from?"
#   • PEAK — three layered Line2Ds (outer halo / halo / core). Same
#     iter-29 geometry, kept intact.
#   • GHOST — a fourth widest, lowest-alpha "ghost arc" that lags
#     GHOST_LAG seconds behind the main arc, so the eye sees motion
#     blur. The ghost shares the same geometry as the outer halo but
#     is masked invisible until ghost_lag has elapsed, then fades on
#     a delayed timeline.
#   • LINGER — DURATION bumped 0.25 → 0.32 so the arc visibly lingers
#     instead of vanishing the instant the player notices it. The
#     decay curves get a slower tail so the silhouette breathes a
#     beat after the peak.
#
# Why a separate ghost Line2D vs. just animating the existing halo:
# decoupling lets the ghost track its own t-shifted decay curve. The
# halo blooms outward sharply; the ghost lingers behind the position
# the halo HAD at peak, so motion-blur reads correctly.
#
# Why Line2D + _process tween (vs. CPUParticles2D): we want a single
# coherent ARC shape, not a fan of particles. Particles would scatter
# and not preserve the arc silhouette. Tweening alpha + scale per-frame
# is one allocation, no physics, and lets the layers decay at their
# own rates.
extends Node2D

const DURATION: float = 0.32        # iter 73: 0.25 → 0.32, give it room to linger
const GHOST_LAG: float = 0.06       # ghost arc trails the main by this many seconds
const HALO_SCALE_BOOST: float = 0.85
const CORE_SCALE_BOOST: float = 0.35
const HILT_FLASH_DURATION: float = 0.08   # white anticipation pulse at swing origin

# Iter 29 — three halo layers for the energy-aura look. Iter 73 adds
# Ghost (outer-outermost, time-lagged) and HiltFlash (anticipation
# beat at origin).
@onready var _outer: Line2D = $OuterHalo
@onready var _halo: Line2D = $Halo
@onready var _core: Line2D = $Line2D
@onready var _ghost: Line2D = get_node_or_null("GhostArc")
@onready var _hilt_flash: Node2D = get_node_or_null("HiltFlash")

var _elapsed: float = 0.0
var _base_scale: Vector2 = Vector2.ONE
var _outer_base_alpha: float = 1.0
var _halo_base_alpha: float = 1.0
var _core_base_alpha: float = 1.0
var _ghost_base_alpha: float = 0.55
var _hilt_flash_base_modulate: Color = Color(1, 1, 1, 1)

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
	# Iter 69 — z_index 5 places the slash on the beam/arc layer
	# (above the standard ring FX at z=2). Per spec: slash_arc sits
	# visibly on top so the cut's silhouette reads clearly against the
	# rings/aura/etc. spawned during the same combo beat.
	z_index = 5
	_base_scale = scale
	if _outer != null:
		_outer_base_alpha = _outer.default_color.a
	if _halo != null:
		_halo_base_alpha = _halo.default_color.a
	if _core != null:
		_core_base_alpha = _core.default_color.a
	if _ghost != null:
		_ghost_base_alpha = _ghost.default_color.a
		# Start the ghost invisible — it fades IN as the main arc starts
		# fading out (motion-blur trail effect).
		var gc: Color = _ghost.default_color
		gc.a = 0.0
		_ghost.default_color = gc
	if _hilt_flash != null:
		_hilt_flash_base_modulate = _hilt_flash.modulate

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
	#   core   t^1.7  slowest decay — the sharp edge lingers (was t² in
	#                 iter-29; bumped softer for the iter-73 linger feel)
	# Combined: the wide energy aura puffs out and dies while the
	# sharp blade-cut edge is still visible. Same trick as iter-13
	# but with one more layer for a fuller crescent.
	var outer_fade: float = 1.0 - pow(t, 3.5)
	var halo_fade: float = 1.0 - pow(t, 3.0)
	var core_fade: float = 1.0 - pow(t, 1.7)
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
	# Ghost arc — fades IN over GHOST_LAG, then fades OUT on its own
	# softer curve. Reads as motion-blur trailing the main cut.
	if _ghost != null:
		var ga: float = 0.0
		if _elapsed < GHOST_LAG:
			# Anticipation phase — ghost ramps up linearly to its base.
			ga = (_elapsed / GHOST_LAG) * _ghost_base_alpha
		else:
			# After lag, ghost decays on a slow t^2.3 curve — slower
			# than halo so the trail visibly LAGS the main arc.
			var gt: float = (_elapsed - GHOST_LAG) / (DURATION - GHOST_LAG)
			ga = _ghost_base_alpha * (1.0 - pow(gt, 2.3))
		var gc: Color = _ghost.default_color
		gc.a = ga
		_ghost.default_color = gc
	# Hilt anticipation flash — bright at t=0, fades out over
	# HILT_FLASH_DURATION. After that, it's invisible. This is the
	# "the hero is winding up to swing" tell.
	if _hilt_flash != null:
		var fa: float = 0.0
		if _elapsed < HILT_FLASH_DURATION:
			fa = 1.0 - (_elapsed / HILT_FLASH_DURATION)
		_hilt_flash.modulate = Color(
			_hilt_flash_base_modulate.r,
			_hilt_flash_base_modulate.g,
			_hilt_flash_base_modulate.b,
			_hilt_flash_base_modulate.a * fa,
		)
