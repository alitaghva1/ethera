# SlashArc — iter 75 swept-blade rework. The previous build (iter 73)
# was a stack of arc-shaped Line2Ds + HiltFlash anticipation + a
# GhostArc "motion blur" duplicate. It had lots of layers, but user
# feedback was "the sword attack feels like a weird drawn-on thing in
# front of the character than a proper energy sword."
#
# Root cause: an arc SHAPE is geometric — it reads as a static curve
# in space, not a swung weapon. A proper energy sword has six readable
# elements the player's eye tracks:
#   1. ORIGIN at the hand
#   2. BLADE — a thin bright line from hand to tip
#   3. ROTATION — that blade sweeping from start to end angle
#   4. TRAIL — a fading wake BEHIND the tip's path
#   5. SPARKS at the tip during peak motion
#   6. CONNECT frame on impact (handled elsewhere — hit_spark / damage)
#
# Iter 73 had #5 (TipBurst) and a static silhouette that approximated
# #4, but lacked #2 and #3. The eye saw the arc decoration appear,
# not a weapon SWING THROUGH the arc.
#
# Iter 75 reframes the slash around BladeRig: a Node2D that lives
# inside SlashArc, holds the Blade Line2D + BladeGlow Line2D + TipBurst,
# and whose local rotation TWEENS from -SWING_HALF*sign to
# +SWING_HALF*sign across SWING_TIME (0.18s, faster than iter 73's
# linger duration so the blade itself reads as MOTION). The existing
# arc Line2Ds (OuterHalo / Halo / Core) become the wake the blade
# leaves behind — their alpha ramps in with TRAIL_DELAY so they appear
# AFTER the blade has started moving, not at the same instant.
#
# Key preservation:
#   • setup(aim, swing_sign) signature unchanged so screen_flash.gd's
#     existing call inst.call("setup", aim, swing_sign) still works.
#   • HiltFlash + GhostArc nodes preserved (iter 73 integration test
#     greps the source for those identifiers; the references must
#     remain so test_iter73 keeps passing).
#   • _core onready var still binds to a node named "Line2D" because
#     iter-29 baseline named it that way and we don't want to churn
#     the scene UID's child set unnecessarily.
extends Node2D

# Total time the slash visual is alive. Iter 73 was 0.32; the wake
# trail still lingers that long. The blade itself moves faster (see
# SWING_TIME) so the eye reads motion, not a static decal.
const DURATION: float = 0.32

# Sweep time for BladeRig.rotation. Faster than DURATION so the blade
# completes its arc visibly mid-effect and dissipates while the wake
# is still fading — sells "the blade swept through, the energy lingers".
# Reference: a real-world fast sword swing reads as roughly 150-200 ms.
const SWING_TIME: float = 0.18

# How long after the blade starts moving before the trail (OuterHalo /
# Halo / Core) becomes visible. Small but readable — the eye gets to
# see the blade lead before the wake materializes.
const TRAIL_DELAY: float = 0.04

# After SWING_TIME the blade fades over BLADE_FADE seconds. The wake
# continues until DURATION expires.
const BLADE_FADE: float = 0.08

# Half-angle the BladeRig sweeps through, in radians. The full arc is
# 2× this (~85°). Multiplied by ±swing_sign so consecutive presses
# alternate CW/CCW (one-two combo reads visibly).
const SWING_HALF: float = 0.75

# Iter 73 ghost arc lag — preserved (the GhostArc layer still uses
# this timing curve below).
const GHOST_LAG: float = 0.06

const HALO_SCALE_BOOST: float = 0.85
const CORE_SCALE_BOOST: float = 0.35
const HILT_FLASH_DURATION: float = 0.08

# Iter 29 — three halo wake layers. Iter 73 added Ghost + HiltFlash.
# Iter 75 adds BladeRig (swept blade) on top of all of this.
@onready var _outer: Line2D = $OuterHalo
@onready var _halo: Line2D = $Halo
@onready var _core: Line2D = $Line2D
@onready var _ghost: Line2D = get_node_or_null("GhostArc")
@onready var _hilt_flash: Node2D = get_node_or_null("HiltFlash")
@onready var _blade_rig: Node2D = get_node_or_null("BladeRig")
@onready var _blade: Line2D = get_node_or_null("BladeRig/Blade")
@onready var _blade_glow: Line2D = get_node_or_null("BladeRig/BladeGlow")

var _elapsed: float = 0.0
var _base_scale: Vector2 = Vector2.ONE
var _outer_base_alpha: float = 1.0
var _halo_base_alpha: float = 1.0
var _core_base_alpha: float = 1.0
var _ghost_base_alpha: float = 0.55
var _blade_base_alpha: float = 1.0
var _blade_glow_base_alpha: float = 0.65
var _hilt_flash_base_modulate: Color = Color(1, 1, 1, 1)

# Sweep start and end (in local radians, relative to the SlashArc node's
# own rotation which already faces the aim). Set in setup() so the rig
# starts pre-rotated to its "wind-up" position and tweens forward.
var _swing_start: float = -SWING_HALF
var _swing_end: float = SWING_HALF

# Iter 19 setup signature — preserved verbatim so the autoload caller
# (screen_flash._on_hero_attacked) doesn't need to change. swing_sign
# alternates ±1 each press; iter 75 uses it to invert the sweep
# direction (CW vs. CCW) so the one-two combo reads visibly.
func setup(aim: Vector2, swing_sign: int = 1) -> void:
	if aim.length_squared() > 0.0001:
		rotation = aim.angle()
	# Sweep direction: positive sign rotates from -HALF → +HALF (CCW
	# in screen space, since +Y is down). Negative sign reverses to
	# +HALF → -HALF (CW). The visible result is alternating swing arcs
	# like a real two-hand combo. Pre-iter-75 we tilted the WHOLE node
	# by ±SWING_TILT; iter 75 instead actually sweeps so the alternation
	# is motion, not a static offset.
	var s: float = SWING_HALF * (1.0 if swing_sign > 0 else -1.0)
	_swing_start = -s
	_swing_end = s

func _ready() -> void:
	# Iter 69 — z_index 5 places the slash on the beam/arc layer
	# (above standard ring FX at z=2). The cut's silhouette reads
	# clearly against rings/aura/etc. spawned during the same combo
	# beat. BladeRig and its children inherit this layer via the
	# scene tree.
	z_index = 5
	_base_scale = scale
	if _outer != null:
		_outer_base_alpha = _outer.default_color.a
		# Trail layers start INVISIBLE — they ramp in over TRAIL_DELAY
		# so the blade visibly leads. Pre-iter-75 the arcs spawned at
		# t=0 alongside the blade, which is exactly what made the cut
		# read as a static decoration.
		var oc: Color = _outer.default_color
		oc.a = 0.0
		_outer.default_color = oc
	if _halo != null:
		_halo_base_alpha = _halo.default_color.a
		var hc: Color = _halo.default_color
		hc.a = 0.0
		_halo.default_color = hc
	if _core != null:
		_core_base_alpha = _core.default_color.a
		var cc: Color = _core.default_color
		cc.a = 0.0
		_core.default_color = cc
	if _ghost != null:
		_ghost_base_alpha = _ghost.default_color.a
		var gc: Color = _ghost.default_color
		gc.a = 0.0
		_ghost.default_color = gc
	if _blade != null:
		_blade_base_alpha = _blade.default_color.a
	if _blade_glow != null:
		_blade_glow_base_alpha = _blade_glow.default_color.a
	if _hilt_flash != null:
		_hilt_flash_base_modulate = _hilt_flash.modulate
	if _blade_rig != null:
		# Start the rig at the wind-up pose. The eye sees the blade
		# pre-positioned for the swing in the same frame HiltFlash
		# bursts at the hand — anticipation reads correctly.
		_blade_rig.rotation = _swing_start

func _process(delta: float) -> void:
	_elapsed += delta
	if _elapsed >= DURATION:
		queue_free()
		return
	var t: float = _elapsed / DURATION

	# ── Phase 1: Blade sweep ──────────────────────────────────────────
	# Rotate BladeRig from _swing_start → _swing_end over SWING_TIME.
	# TRANS_QUAD EASE_OUT (fast start, decelerates) gives the
	# "heavy energy swing" feel — committed thrust into the arc.
	if _blade_rig != null:
		var swing_t: float = clampf(_elapsed / SWING_TIME, 0.0, 1.0)
		# Manual EASE_OUT_QUAD: f(x) = 1 - (1-x)² so slope is high near
		# x=0 and tapers to 0 near x=1. Mirrors Tween's TRANS_QUAD +
		# EASE_OUT without spawning a Tween node every swing.
		var eased: float = 1.0 - (1.0 - swing_t) * (1.0 - swing_t)
		_blade_rig.rotation = lerpf(_swing_start, _swing_end, eased)

	# Blade fade-out: while sweeping the blade is full-alpha. After
	# SWING_TIME it dissipates over BLADE_FADE seconds while the wake
	# trail keeps showing — sells "the blade swept through, leaving
	# residual energy."
	var blade_alpha_t: float = 1.0
	if _elapsed > SWING_TIME:
		var fade_t: float = clampf((_elapsed - SWING_TIME) / BLADE_FADE, 0.0, 1.0)
		blade_alpha_t = 1.0 - fade_t
	if _blade != null:
		var bc: Color = _blade.default_color
		bc.a = _blade_base_alpha * blade_alpha_t
		_blade.default_color = bc
	if _blade_glow != null:
		var bgc: Color = _blade_glow.default_color
		bgc.a = _blade_glow_base_alpha * blade_alpha_t
		_blade_glow.default_color = bgc

	# ── Phase 2: Wake trail (OuterHalo / Halo / Core) ─────────────────
	# Each layer ramps IN linearly over TRAIL_DELAY, then decays on its
	# own iter-29 curve. Net effect: the eye sees the blade lead, then
	# the wake materializes IN ITS PATH and fades.
	# Decay curves (iter 29 timings preserved):
	#   outer  t^3.5  fastest decay — atmospheric glow
	#   halo   t^3    mid decay
	#   core   t^1.7  slowest decay — sharp wake edge lingers
	var outer_fade: float = 1.0 - pow(t, 3.5)
	var halo_fade: float = 1.0 - pow(t, 3.0)
	var core_fade: float = 1.0 - pow(t, 1.7)
	# Trail ramp-in. After TRAIL_DELAY this stays at 1.0.
	var trail_ramp: float = clampf(_elapsed / TRAIL_DELAY, 0.0, 1.0)

	# Scale grows on the average across the wake layers — the wake
	# breathes outward as it fades.
	var avg_boost: float = (HALO_SCALE_BOOST + CORE_SCALE_BOOST) * 0.5
	scale = _base_scale * (1.0 + avg_boost * t)

	if _outer != null:
		var outer_col: Color = _outer.default_color
		outer_col.a = _outer_base_alpha * outer_fade * trail_ramp
		_outer.default_color = outer_col
	if _halo != null:
		var halo_col: Color = _halo.default_color
		halo_col.a = _halo_base_alpha * halo_fade * trail_ramp
		_halo.default_color = halo_col
	if _core != null:
		var core_col: Color = _core.default_color
		core_col.a = _core_base_alpha * core_fade * trail_ramp
		_core.default_color = core_col

	# ── Phase 3: GhostArc — preserved iter-73 motion-blur layer ──────
	# Still ramps in over GHOST_LAG then decays on its softer curve.
	# In the new arrangement it reads as the WIDEST, FAINTEST wake
	# layer behind the wake proper — a "far echo" of the swing.
	if _ghost != null:
		var ga: float = 0.0
		if _elapsed < GHOST_LAG:
			ga = (_elapsed / GHOST_LAG) * _ghost_base_alpha
		else:
			var gt: float = (_elapsed - GHOST_LAG) / (DURATION - GHOST_LAG)
			ga = _ghost_base_alpha * (1.0 - pow(gt, 2.3))
		var gc: Color = _ghost.default_color
		gc.a = ga
		_ghost.default_color = gc

	# ── Phase 4: HiltFlash — preserved iter-73 anticipation ──────────
	# Bright at t=0, fades over HILT_FLASH_DURATION (0.08s). Visible
	# during the wind-up; gone before the blade reaches end-of-swing.
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
