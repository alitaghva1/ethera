# DashImpact — physical slam at the end of the dash strike.
#
# iter-98 rewrite: pre-iter-98 had FIVE elements on top of each other
#   1. central white-hot Polygon2D flash disc
#   2. 6 jagged radial motion streaks
#   3. expanding halo + core rings (magenta-pink)
#   4. 24 debris chunks
#   5. 5 ground cracks
# Playtest read this as "a bizarre lighting effect" — three of the five
# (flash + streaks + magenta rings) screamed "magic spell going off"
# when the dash is supposed to be a knight charging through stone. The
# painted dark-fantasy palette didn't survive the lighting bloom.
#
# iter-98 keeps the THREE PHYSICAL elements:
#   1. RINGS (halo + core, iter-98 recolored to warm dust gold/cream
#      in the .tscn — reads as heat shimmer / dust expansion)
#   2. DEBRIS burst (24 brown-cream chunks with gravity, omni-directional)
#   3. GROUND CRACKS (5 jagged Line2Ds, cream-gold, linger 0.55s)
# and DELETES the central flash + motion streaks. The cracks + debris
# are what sell "the floor took a beating" without any magic vibe.
#
# This scene is reused as a generic radial AoE VFX for soul_burst,
# kill_explosion, SHADOW shockwave (see hero.gd::SOUL_BURST_SCENE).
# Removing the flash + streaks benefits those too — they were getting
# extra magic glare on every proc.
#
# Z-index layering inside this scene:
#   cracks  z = -1  (on the floor, under everything)
#   rings   z =  0  (default node z)
#   debris  z =  1  (above rings)
# The whole Node2D ships at z_index 2 (iter-69 ring-FX layer
# standard); these per-child z values stack relative to that base.
extends Node2D

const DURATION: float = 0.3
const RING_SCALE_END: float = 2.7   # final scale on both rings
const RING_PEAK_TIME: float = 0.06   # t at which rings hit hot-peak alpha
const RING_PEAK_BOOST: float = 1.45  # alpha multiplier at peak

const CRACK_COUNT: int = 5
const CRACK_BASE_LENGTH: float = 38.0   # base outward extent per crack
const CRACK_FADE_DURATION: float = 0.55  # iter 75 — cracks linger longer
const CRACK_FADE_EXP: float = 1.6        # iter 75 — slower decay curve

# iter-98: FLASH_* + STREAK_* constants removed. The central white-hot
# disc + 6 motion streaks were the "bizarre lighting effect" piece;
# deleted entirely. Cracks + debris carry the impact.

@onready var _halo: Line2D = $Halo
@onready var _core: Line2D = $Core

var _elapsed: float = 0.0
var _halo_base_alpha: float = 1.0
var _core_base_alpha: float = 1.0
var _cracks: Array[Line2D] = []
var _crack_base_alphas: Array[float] = []

# iter-98: _streaks, _streak_base_alphas, _flash, _flash_base_color
# state vars removed alongside their spawn functions. set_dash_dir
# remains as a NO-OP API for any caller that still hands us a hint —
# we just don't render any streaks to bias.
var _dash_dir: Vector2 = Vector2.ZERO
var _has_dir_hint: bool = false

# Preserved API surface — main.gd may still hand us a direction hint.
# Pre-iter-98 this oriented the motion streaks; iter-98 dropped the
# streaks, so the hint is now informational only. Kept for backward
# compat with any future call site that wants to extend the visual.
func set_dash_dir(dir: Vector2) -> void:
	if dir.length_squared() < 0.0001:
		return
	_dash_dir = dir.normalized()
	_has_dir_hint = true

func _ready() -> void:
	# Iter 69 — z_index 2 standardizes the iter-60+ ring FX layer
	# (shock_pulse, parry_pulse, death_pulse, dash_impact). Above floor,
	# below the hero's z_index. Chain/beam FX sit at z=5 above this.
	z_index = 2
	if _halo != null:
		_halo_base_alpha = _halo.default_color.a
	if _core != null:
		_core_base_alpha = _core.default_color.a
	_spawn_ground_cracks()
	# iter-98: _spawn_motion_streaks() and _spawn_central_flash() calls
	# removed alongside their functions. The cracks + debris + rings
	# alone are the impact now.

# Spawn N Line2D "crack" lines radiating from the impact center. Each
# crack is a 3-segment polyline with slight angle jitter so it reads as
# a fracture, not a straight ray. The angle jitter is seeded per-crack
# by adding small per-segment offsets — cheap, no asset cost.
func _spawn_ground_cracks() -> void:
	for i in range(CRACK_COUNT):
		var angle: float = (TAU / float(CRACK_COUNT)) * float(i) + randf_range(-0.18, 0.18)
		var line := Line2D.new()
		line.name = "Crack%d" % i
		line.width = 2.6
		# Bright cream-gold at the center fading to translucent black —
		# reads as "the floor split, dust kicked up from the crack."
		line.default_color = Color(1.0, 0.9, 0.7, 0.95)
		line.joint_mode = Line2D.LINE_JOINT_BEVEL
		line.begin_cap_mode = Line2D.LINE_CAP_ROUND
		line.end_cap_mode = Line2D.LINE_CAP_ROUND
		line.antialiased = true
		line.z_index = -1   # under the rings, on the floor
		# 3-segment fracture: each segment branches at a small jitter
		# angle so the crack zigzags outward.
		var pts := PackedVector2Array()
		pts.push_back(Vector2.ZERO)
		var step1: float = CRACK_BASE_LENGTH * 0.4
		var step2: float = CRACK_BASE_LENGTH * 0.7
		var step3: float = CRACK_BASE_LENGTH
		var a1: float = angle + randf_range(-0.25, 0.25)
		var a2: float = angle + randf_range(-0.3, 0.3)
		var a3: float = angle + randf_range(-0.2, 0.2)
		pts.push_back(Vector2(cos(a1), sin(a1)) * step1)
		pts.push_back(Vector2(cos(a2), sin(a2)) * step2)
		pts.push_back(Vector2(cos(a3), sin(a3)) * step3)
		line.points = pts
		add_child(line)
		_cracks.append(line)
		_crack_base_alphas.append(line.default_color.a)

# iter-98: _spawn_motion_streaks() and _spawn_central_flash() deleted.
# Both rendered "magic spell" energy on top of the physical impact —
# motion streaks as jagged white-cyan lasers, central flash as a
# pulsing Polygon2D disc. The cracks + debris + rings carry the slam
# feel without any lighting bloom.

func _process(delta: float) -> void:
	_elapsed += delta
	# iter-98: max_life simplified — rings die at DURATION (0.3s), cracks
	# at CRACK_FADE_DURATION (0.55s). Cracks outlast and gate queue_free.
	# Pre-iter-98 also tracked STREAK_FADE_DURATION; streaks are gone.
	var max_life: float = maxf(DURATION, CRACK_FADE_DURATION)
	if _elapsed >= max_life:
		queue_free()
		return

	# ─── Ring scaling/fade (rings die at DURATION) ─────────────────────
	if _elapsed < DURATION:
		var t: float = _elapsed / DURATION
		# Scale grows on an ease-out curve so the ring snaps outward fast
		# then decelerates — visually reads as energy expanding into
		# resistance.
		var s_t: float = 1.0 - pow(1.0 - t, 2.0)
		scale = Vector2(1.0 + (RING_SCALE_END - 1.0) * s_t, 1.0 + (RING_SCALE_END - 1.0) * s_t)
		# Halo fades faster than core so the inner "sharp ring" reads as
		# the leading edge of the wave. Same asymmetry trick as slash_arc.
		var halo_fade: float = 1.0 - pow(t, 2.5)
		var core_fade: float = 1.0 - pow(t, 1.7)
		# Iter 75 — brief hot-peak boost at RING_PEAK_TIME so the rings
		# catch the eye alongside the central flash. Triangular bump:
		# 0 → 1 → 0 around peak_time over a small window.
		var peak_window: float = 0.10
		var peak_boost: float = 0.0
		if _elapsed >= RING_PEAK_TIME - peak_window and _elapsed <= RING_PEAK_TIME + peak_window:
			var pd: float = absf(_elapsed - RING_PEAK_TIME) / peak_window
			peak_boost = (1.0 - pd) * (RING_PEAK_BOOST - 1.0)
		var halo_mul: float = halo_fade * (1.0 + peak_boost)
		var core_mul: float = core_fade * (1.0 + peak_boost)
		if _halo != null:
			var halo_col: Color = _halo.default_color
			halo_col.a = clampf(_halo_base_alpha * halo_mul, 0.0, 1.0)
			_halo.default_color = halo_col
		if _core != null:
			var core_col: Color = _core.default_color
			core_col.a = clampf(_core_base_alpha * core_mul, 0.0, 1.0)
			_core.default_color = core_col
	else:
		# After DURATION, hide the rings cleanly (alpha 0) so the cracks
		# can finish fading on their own without the rings sticking around.
		if _halo != null:
			var hc: Color = _halo.default_color
			hc.a = 0.0
			_halo.default_color = hc
		if _core != null:
			var cc: Color = _core.default_color
			cc.a = 0.0
			_core.default_color = cc

	# iter-98: central flash + motion streak per-frame update blocks
	# removed alongside their spawn functions. _process now only animates
	# rings (above) and cracks (below).

	# ─── Ground cracks (die at CRACK_FADE_DURATION) ────────────────────
	# Cracks DON'T scale with the parent — wait, actually they DO ride
	# the parent transform since they're children of this Node2D. That's
	# fine — they expand alongside the ring at first, then linger as the
	# parent scale stops growing past DURATION. Decay on t^1.6 (was 1.4)
	# so they hold longer.
	var ct: float = clampf(_elapsed / CRACK_FADE_DURATION, 0.0, 1.0)
	var crack_fade: float = 1.0 - pow(ct, CRACK_FADE_EXP)
	for i in range(_cracks.size()):
		var line: Line2D = _cracks[i]
		if not is_instance_valid(line):
			continue
		var base_a: float = _crack_base_alphas[i] if i < _crack_base_alphas.size() else 0.9
		var col: Color = line.default_color
		col.a = base_a * crack_fade
		line.default_color = col
