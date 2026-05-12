# DashImpact — violent SLAM at the end of the dash strike.
#
# The dash strike is a MOTION-BASED action: the hero rockets from point
# A to point B and HITS at B. Earlier iterations emphasized only the
# impact LOCATION (rings + cracks at endpoint). The motion itself
# wasn't sold — symmetric rings read more like a clean magic spell than
# a brutal slam. Iter 75 rebuilds the visual around the COLLISION feel:
#
#   1. Central white-hot FLASH (Polygon2D disc) — the "BAM" frame that
#      sells the instant of impact. Pops in fast (~0.10s), fades by
#      ~0.18s. Layered above the rings.
#
#   2. Directional motion STREAKS — 6 jagged Line2Ds spawned outward
#      from the impact center. If a direction hint is provided
#      (`set_dash_dir(dir)`), streaks bias backward along `-dir` to
#      read as "the hero just slammed in from that way." Without a
#      hint they spread in a wide arc (default Vector2.RIGHT, then a
#      random ±90° spread) so the burst still reads as collision
#      debris from any direction.
#
#   3. DEBRIS burst (CPUParticles2D) — 24 brown-cream chunks fired
#      omnidirectionally with gravity, settling on the ground over
#      ~0.45s. Reads as "floor chunks knocked loose."
#
#   4. Existing rings (Halo + Core) get a brief bright HOT PEAK at
#      t=0.06s (alpha 0.7 → 0.95 → 0.7) so the leading edge of the
#      ring catches the eye alongside the central flash.
#
#   5. Existing ground cracks (iter 73) linger longer: 0.55s window,
#      t^1.6 decay (was 0.4s / t^1.4) so the floor damage outlasts
#      the flash and the player sees the "wound."
#
# Backward compat: this scene is also reused as a generic radial AoE
# VFX for soul_burst, kill_explosion, SHADOW shockwave (see
# hero.gd::SOUL_BURST_SCENE). Those call sites set `modulate` and
# `scale` but never call `set_dash_dir`, so streaks fall back to the
# default "wide spread" which still reads as a violent burst — fine
# for proc rings that have no inherent direction.
#
# Z-index layering inside this scene:
#   cracks  z = -1  (on the floor, under everything)
#   rings   z =  0  (default node z — outer layer)
#   debris  z =  1  (above rings, below flash)
#   streaks z =  2  (radial speed lines — above debris)
#   flash   z =  3  (central BAM — top, brightest)
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

const FLASH_RADIUS: float = 36.0
const FLASH_DURATION: float = 0.18
const FLASH_PEAK_TIME: float = 0.10
const FLASH_SCALE_START: float = 0.3
const FLASH_SCALE_END: float = 1.6

const STREAK_COUNT: int = 6
const STREAK_LENGTH_MIN: float = 60.0
const STREAK_LENGTH_MAX: float = 90.0
const STREAK_FADE_DURATION: float = 0.25
const STREAK_DEFAULT_SPREAD: float = PI * 0.55  # ±~100° fan when no dir hint

@onready var _halo: Line2D = $Halo
@onready var _core: Line2D = $Core

var _elapsed: float = 0.0
var _halo_base_alpha: float = 1.0
var _core_base_alpha: float = 1.0
var _cracks: Array[Line2D] = []
var _crack_base_alphas: Array[float] = []
var _streaks: Array[Line2D] = []
var _streak_base_alphas: Array[float] = []
var _flash: Polygon2D = null
var _flash_base_color: Color = Color(1.0, 1.0, 0.95, 0.95)

# Optional direction hint — caller may set this BEFORE add_child to
# orient the streaks. Vector pointing in the DIRECTION OF DASH MOTION
# (so we draw streaks pointing AWAY from the impact along -dir, i.e.
# back toward where the hero came from). If unset, _spawn_motion_streaks
# falls back to a wide radial spread.
var _dash_dir: Vector2 = Vector2.ZERO
var _has_dir_hint: bool = false

# Backward-compatible setter. main.gd's current dash_strike_landed
# handler does NOT call this — streaks will fan out without a bias,
# which still reads as a violent burst. A future iter that wants the
# directional sell can call this before add_child:
#   var impact = DASH_IMPACT_SCENE.instantiate()
#   impact.set_dash_dir(_dash_strike_dir)
#   impact.global_position = world_pos
#   parent.add_child(impact)
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
	_spawn_motion_streaks()
	_spawn_central_flash()

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

# Spawn directional motion streaks — 4-segment jagged Line2Ds that
# point AWAY from the impact center in the OPPOSITE direction of
# `_dash_dir` (i.e. back toward where the hero came from). Each streak
# gets a slight angular offset (±15°) and perpendicular jitter so the
# group reads as motion lines, not lasers.
#
# Without a direction hint, streaks fan out in a wide arc around the
# default backward axis — still reads as a violent burst.
func _spawn_motion_streaks() -> void:
	# `base_back_angle` is the angle pointing FROM the impact center
	# BACK toward where the hero came from. If _dash_dir = (1, 0), the
	# hero came from -X, so back-angle = atan2(0, -1) = PI.
	var base_back_angle: float
	var fan_spread: float
	if _has_dir_hint:
		var back: Vector2 = -_dash_dir
		base_back_angle = back.angle()
		# Narrow fan when we know the direction — streaks cluster
		# tightly along the incoming axis for a clear "slammed in
		# from THAT way" read.
		fan_spread = PI * 0.18   # ±~16° around back-axis
	else:
		# No hint — pick a random base angle and fan widely so the
		# burst doesn't always point right. Still reads as collision
		# debris, just without the directional bias.
		base_back_angle = randf() * TAU
		fan_spread = STREAK_DEFAULT_SPREAD

	for i in range(STREAK_COUNT):
		# Spread streaks across the fan with small per-streak jitter.
		var t_streak: float = 0.0
		if STREAK_COUNT > 1:
			t_streak = float(i) / float(STREAK_COUNT - 1)
		var angle: float = base_back_angle + (t_streak - 0.5) * 2.0 * fan_spread
		angle += randf_range(-0.08, 0.08)   # per-streak jitter

		var line := Line2D.new()
		line.name = "Streak%d" % i
		line.width = randf_range(2.2, 3.4)
		# White-cyan core matching the dash_trail's cyan ramp tail —
		# reads as the same arcane energy ripping outward from impact.
		line.default_color = Color(0.85, 0.98, 1.0, 0.95)
		line.joint_mode = Line2D.LINE_JOINT_BEVEL
		line.begin_cap_mode = Line2D.LINE_CAP_ROUND
		line.end_cap_mode = Line2D.LINE_CAP_ROUND
		line.antialiased = true
		line.z_index = 2   # above rings (z=0) and debris (z=1)

		# 4-point jagged path: start at center, jitter perpendicular
		# at each segment so the streak shows a quick "lightning" feel
		# rather than a clean ray.
		var length: float = randf_range(STREAK_LENGTH_MIN, STREAK_LENGTH_MAX)
		var fwd: Vector2 = Vector2(cos(angle), sin(angle))
		var perp: Vector2 = Vector2(-fwd.y, fwd.x)
		var pts := PackedVector2Array()
		pts.push_back(Vector2.ZERO)
		# Three intermediate jagged points along the streak.
		var step_lens: PackedFloat32Array = PackedFloat32Array([0.33, 0.66, 0.88])
		var jitter_amts: PackedFloat32Array = PackedFloat32Array([5.0, 7.0, 4.0])
		for j in range(step_lens.size()):
			var along: float = length * step_lens[j]
			var jitter: float = randf_range(-jitter_amts[j], jitter_amts[j])
			pts.push_back(fwd * along + perp * jitter)
		pts.push_back(fwd * length)
		line.points = pts
		add_child(line)
		_streaks.append(line)
		_streak_base_alphas.append(line.default_color.a)

# Spawn the central white-hot disc — a 16-vert Polygon2D at the impact
# center. Scales up from 0.3× to 1.6× during the flash window, alpha
# fades from 0.95 to 0 over FLASH_DURATION. This is the "BAM" frame.
func _spawn_central_flash() -> void:
	var poly := Polygon2D.new()
	poly.name = "CentralFlash"
	poly.color = _flash_base_color
	poly.z_index = 3   # top of the stack inside this scene
	var verts := PackedVector2Array()
	var seg: int = 16
	for i in range(seg):
		var a: float = (TAU / float(seg)) * float(i)
		verts.push_back(Vector2(cos(a), sin(a)) * FLASH_RADIUS)
	poly.polygon = verts
	poly.scale = Vector2(FLASH_SCALE_START, FLASH_SCALE_START)
	add_child(poly)
	_flash = poly

func _process(delta: float) -> void:
	_elapsed += delta
	# Track all three timelines and queue_free after the LONGEST.
	# Rings/flash die at DURATION (0.3s); streaks at STREAK_FADE_DURATION
	# (0.25s); cracks at CRACK_FADE_DURATION (0.55s). The cracks now
	# outlast everything else — they read as residual floor damage.
	var max_life: float = maxf(maxf(DURATION, CRACK_FADE_DURATION), STREAK_FADE_DURATION)
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

	# ─── Central flash (dies at FLASH_DURATION) ────────────────────────
	if _flash != null and is_instance_valid(_flash):
		if _elapsed < FLASH_DURATION:
			var ft: float = _elapsed / FLASH_DURATION
			# Two-phase scale: rapid ramp from 0.3× → 1.6× over the
			# FLASH_PEAK_TIME window, then a slight hold-then-puff up to
			# 1.7× by FLASH_DURATION end (mostly invisible due to alpha
			# decay but adds final-frame energy).
			var scale_t: float = clampf(_elapsed / FLASH_PEAK_TIME, 0.0, 1.0)
			# Ease-out for the punch-in.
			var se: float = 1.0 - pow(1.0 - scale_t, 2.5)
			var s_val: float = FLASH_SCALE_START + (FLASH_SCALE_END - FLASH_SCALE_START) * se
			_flash.scale = Vector2(s_val, s_val)
			# Alpha: full at 0, holds briefly through PEAK_TIME, then
			# fades to 0 by FLASH_DURATION. t^1.4 keeps it punchy.
			var a_t: float = clampf((_elapsed - 0.02) / (FLASH_DURATION - 0.02), 0.0, 1.0)
			var alpha: float = _flash_base_color.a * (1.0 - pow(a_t, 1.4))
			var fc: Color = _flash_base_color
			fc.a = alpha
			_flash.color = fc
		else:
			var fc2: Color = _flash.color
			fc2.a = 0.0
			_flash.color = fc2

	# ─── Motion streaks (die at STREAK_FADE_DURATION) ──────────────────
	# Streaks DON'T scale with the parent — they sit at their spawned
	# length and fade. We override their alpha each frame.
	var s_t2: float = clampf(_elapsed / STREAK_FADE_DURATION, 0.0, 1.0)
	# TRANS_QUAD EASE_OUT equivalent: 1 - (1-t)^2
	var streak_fade: float = 1.0 - pow(s_t2, 2.0)
	for i in range(_streaks.size()):
		var line: Line2D = _streaks[i]
		if not is_instance_valid(line):
			continue
		var base_a: float = _streak_base_alphas[i] if i < _streak_base_alphas.size() else 0.95
		var col: Color = line.default_color
		col.a = base_a * streak_fade
		line.default_color = col

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
