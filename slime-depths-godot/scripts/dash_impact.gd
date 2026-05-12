# DashImpact — radial shockwave + spark burst at the end of dash strike.
# Two concentric Line2D circles (halo + core) scale outward from radius
# ~22 to ~2.7× over DURATION while fading to alpha 0. A CPUParticles2D
# burst fires sparks radially outward in the same beat.
#
# Iter 73 phasing rework: dash_impact was already a good two-layer ring
# (halo + core + sparks). What was missing was the GROUND CRACK reading.
# A real heavy impact cracks the floor — we now spawn 5 radial Line2D
# "crack" lines at angles 0/72/144/216/288 degrees from the impact
# center, each fading over CRACK_FADE_DURATION. The cracks zigzag
# outward (3 segments each) so they read as fractures, not rays.
#
# Why a Line2D ring vs a textured radial gradient: a Line2D circle reads
# crisply at any scale, doesn't need a baked texture asset, and reuses
# the same "thin halo + sharp core" trick the iter-13 slash_arc uses for
# visual consistency. The ring grows OUT past the hero, which sells the
# "AoE radius" intuitively — the visual extent of the ring at the end
# of its lifetime matches the radius of the actual hit-test in
# hero.gd's _resolve_dash_strike_hit (≈60 px).
#
# Lifetime is short (0.3s) so the impact reads as a single punctuated
# beat, not a lingering effect. main.gd pairs it with a heavier camera
# shake on hit. Cracks fade over a slightly longer window (0.4s) so the
# floor damage "lingers" a beat after the ring dissipates.
extends Node2D

const DURATION: float = 0.3
const RING_SCALE_END: float = 2.7   # final scale on both rings
const CRACK_COUNT: int = 5
const CRACK_BASE_LENGTH: float = 38.0   # base outward extent per crack
const CRACK_FADE_DURATION: float = 0.4   # cracks linger past the ring

@onready var _halo: Line2D = $Halo
@onready var _core: Line2D = $Core

var _elapsed: float = 0.0
var _halo_base_alpha: float = 1.0
var _core_base_alpha: float = 1.0
var _cracks: Array[Line2D] = []
var _crack_base_alphas: Array[float] = []

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

func _process(delta: float) -> void:
	_elapsed += delta
	# Track both timelines: the rings die at DURATION, the cracks die at
	# CRACK_FADE_DURATION. queue_free only after the LONGER of the two.
	var max_life: float = maxf(DURATION, CRACK_FADE_DURATION)
	if _elapsed >= max_life:
		queue_free()
		return
	# Ring scaling/fade — only active while _elapsed < DURATION.
	if _elapsed < DURATION:
		var t: float = _elapsed / DURATION
		# Scale grows on an ease-out curve so the ring snaps outward fast then
		# decelerates — visually reads as energy expanding into resistance.
		var s_t: float = 1.0 - pow(1.0 - t, 2.0)
		scale = Vector2(1.0 + (RING_SCALE_END - 1.0) * s_t, 1.0 + (RING_SCALE_END - 1.0) * s_t)
		# Halo fades faster than core so the inner "sharp ring" reads as the
		# leading edge of the wave. Same asymmetry trick as slash_arc.
		var halo_fade: float = 1.0 - pow(t, 2.5)
		var core_fade: float = 1.0 - pow(t, 1.7)
		if _halo != null:
			var halo_col: Color = _halo.default_color
			halo_col.a = _halo_base_alpha * halo_fade
			_halo.default_color = halo_col
		if _core != null:
			var core_col: Color = _core.default_color
			core_col.a = _core_base_alpha * core_fade
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
	# Crack fade — independent timeline, runs for the full CRACK_FADE_DURATION.
	# Cracks DON'T scale with the parent (they ride the same scale, which is
	# fine — they expand alongside the ring at first). Decay on t^1.4 so
	# they linger ~80% of their life at low alpha, reading as "lingering
	# damage on the floor."
	var ct: float = clampf(_elapsed / CRACK_FADE_DURATION, 0.0, 1.0)
	var crack_fade: float = 1.0 - pow(ct, 1.4)
	for i in range(_cracks.size()):
		var line: Line2D = _cracks[i]
		if not is_instance_valid(line):
			continue
		var base_a: float = _crack_base_alphas[i] if i < _crack_base_alphas.size() else 0.9
		var col: Color = line.default_color
		col.a = base_a * crack_fade
		line.default_color = col
