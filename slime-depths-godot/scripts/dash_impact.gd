# DashImpact — physical slam at the end of the dash strike.
#
# iter-98 dropped the central white-hot flash + 6 motion streaks (the
# "magic burst" elements). Playtest of iter-98 surfaced the next layer:
# the 5 radial GROUND CRACKS read as a SPIDER WEB. Each crack was a
# jagged 3-segment Line2D radiating from the impact center, and since
# cracks ride the parent transform's 1.0 → 2.7× scale ramp, they
# stretched out to ~100 px — long straight radial lines + the circular
# ring = unmistakable spider-web silhouette.
#
# iter-99 replaces the cracks with PARTICLES. Particles read as organic
# dust, not geometric fracture lines. The full impact stack is now:
#   1. RINGS (Halo + Core Line2Ds) — heat-shimmer / dust expansion
#   2. SPARKS (CPUParticles2D) — small radial embers
#   3. DEBRIS (CPUParticles2D with gravity) — falling brown-cream chunks
#   4. DUSTCLOUD (CPUParticles2D, iter-99 NEW) — slow ground-level
#      dust burst, no gravity, settles around the impact radius
# Every visible element is now particle-based or a smooth ring — no
# more straight radial lines that read as geometric / procedural.
#
# This scene is reused as a generic radial AoE VFX for soul_burst,
# kill_explosion, SHADOW shockwave (see hero.gd::SOUL_BURST_SCENE).
# All three benefit: the spider-web look is gone from those procs too.
#
# Z-index layering inside this scene:
#   rings      z = 0 (default — outer wave)
#   debris     z = 1 (above rings — falling chunks)
#   dustcloud  z = 1 (alongside debris — ground-level haze)
# The whole Node2D ships at z_index 2 (iter-69 ring-FX layer standard).
extends Node2D

const DURATION: float = 0.3
const RING_SCALE_END: float = 2.7   # final scale on both rings
const RING_PEAK_TIME: float = 0.06   # t at which rings hit hot-peak alpha
const RING_PEAK_BOOST: float = 1.45  # alpha multiplier at peak

# iter-99: CRACK_* constants removed. The 5 jagged radial Line2Ds
# scaled with the parent transform (38px × 2.7 = ~100px at peak) and
# read as a spider web. Replaced by the DustCloud CPUParticles2D in
# dash_impact.tscn.

# iter-98: FLASH_* + STREAK_* constants removed. The central white-hot
# disc + 6 motion streaks were the "bizarre lighting effect" piece;
# deleted entirely.

@onready var _halo: Line2D = $Halo
@onready var _core: Line2D = $Core

var _elapsed: float = 0.0
var _halo_base_alpha: float = 1.0
var _core_base_alpha: float = 1.0

# iter-99: _cracks / _crack_base_alphas state vars removed alongside
# the _spawn_ground_cracks function and per-frame crack fade block.
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
	# iter-99: _spawn_ground_cracks() call removed. DustCloud particle
	# emitter declared statically in dash_impact.tscn fires its burst at
	# _ready time via emitting=true; no runtime code needed.

# iter-99: _spawn_ground_cracks() deleted. The 5 radial Line2Ds read
# as a spider web at peak parent-scale. Replaced by particle emitter
# in the .tscn — see DustCloud node.

# iter-98: _spawn_motion_streaks() and _spawn_central_flash() deleted.
# Both rendered "magic spell" energy on top of the physical impact —
# motion streaks as jagged white-cyan lasers, central flash as a
# pulsing Polygon2D disc.

func _process(delta: float) -> void:
	_elapsed += delta
	# iter-99: max_life is now driven by the longest particle lifetime
	# (DustCloud at 0.55s). Rings die at DURATION (0.3s); particles
	# live up to ~0.55s. The CPUParticles2D nodes self-emit and animate;
	# we just need to outlive them before queue_free.
	const PARTICLE_LIFE_BUDGET: float = 0.6
	if _elapsed >= maxf(DURATION, PARTICLE_LIFE_BUDGET):
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

	# iter-99: per-frame ground-crack fade block removed alongside the
	# cracks themselves. _process now only animates the rings (above);
	# all particle emitters (Sparks / Debris / DustCloud) self-animate
	# via their own lifetime + color_ramp.
	# iter-98: central flash + motion streak per-frame update blocks
	# also removed.
