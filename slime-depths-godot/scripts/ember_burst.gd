# EmberBurst — iter 72 redesign FX for IRON FANG. A small orange ember
# ring spawned at the impact point of every 6th sword hit. Mirrors the
# shock_pulse (iter 68) / dash_impact ring grammar so it slots into the
# existing FX cell language: two concentric Line2D rings (cyan replaced
# with FLAME orange/red), expanding + fading over a short duration.
#
# Why a ring + sparks (vs. just particles): the iter-13 / iter-25 / iter-68
# kit settled on rings as the dominant "AoE landed here" idiom. A pure
# particle burst would read as "small effect" rather than "ember
# detonation"; the ring sells the snapshot AoE shape.
#
# Pairs with the FLAME palette (red/orange) so a player who sees this
# proc knows it's the FLAME-theme relic firing. Distinct from soul_burst
# (red ember tinted dash_impact) and FLAME ascendance fire pools (the
# 2s lingering ground hazard).
#
# Setup contract:
#   setup(radius, damage)
#     - radius (float): final ring radius in px. Used for both the visual
#       end-scale AND the enemy hit-test sweep (snapshot AoE at spawn).
#     - damage (int): damage dealt to each enemy in radius. Single tick
#       at spawn — the ring is not a damaging zone.
# Must be called BEFORE add_child so _ready sees the configured values.
class_name EmberBurst
extends Node2D

const DURATION: float = 0.32
const START_SCALE: float = 0.25
const BASE_RADIUS: float = 40.0
const POLY_SEGMENTS: int = 14

var _radius_target: float = 40.0
var _damage: int = 1

var _elapsed: float = 0.0
var _halo: Line2D = null
var _core: Line2D = null
var _scale_end: float = 1.0
var _initialized: bool = false

func setup(radius: float, damage: int) -> void:
	_radius_target = max(1.0, radius)
	_damage = max(0, damage)

func _ready() -> void:
	# Iter 69 — z_index 2 puts the ring on the standard FX layer alongside
	# dash_impact / parry_pulse / shock_pulse. Matches the rest of the kit.
	z_index = 2
	_scale_end = _radius_target / BASE_RADIUS
	scale = Vector2(_scale_end * START_SCALE, _scale_end * START_SCALE)
	_build_rings()
	_apply_damage()
	_initialized = true

# Two-ring construction — same "halo + core" grammar as shock_pulse,
# only the palette differs (orange/red vs cyan/white). Halo is a wide
# warm bloom, core is a bright cream-orange edge.
func _build_rings() -> void:
	var pts: PackedVector2Array = _circle_points(BASE_RADIUS, POLY_SEGMENTS)
	# Halo — wide orange-red bloom under the core.
	_halo = Line2D.new()
	_halo.points = pts
	_halo.closed = true
	_halo.width = 9.0
	_halo.default_color = Color(1.0, 0.45, 0.18, 0.65)
	_halo.joint_mode = 2   # LINE_JOINT_ROUND
	_halo.begin_cap_mode = 2
	_halo.end_cap_mode = 2
	_halo.antialiased = true
	_halo.z_index = -1
	add_child(_halo)

	# Core — narrow, bright cream-yellow. The "leading edge" of the
	# ember detonation.
	_core = Line2D.new()
	_core.points = pts
	_core.closed = true
	_core.width = 2.5
	_core.default_color = Color(1.0, 0.92, 0.55, 1.0)
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

# Snapshot AoE — every enemy in group "enemies" within _radius_target
# of spawn position takes _damage. Same iteration pattern as shock_pulse
# and the existing kill-explosion path in hero.gd.
func _apply_damage() -> void:
	for enemy in get_tree().get_nodes_in_group("enemies"):
		if not is_instance_valid(enemy):
			continue
		if enemy.global_position.distance_to(global_position) > _radius_target:
			continue
		if _damage > 0 and enemy.has_method("take_hit"):
			enemy.take_hit(_damage)

func _process(delta: float) -> void:
	if not _initialized:
		return
	_elapsed += delta
	var t: float = _elapsed / DURATION
	if t >= 1.0:
		queue_free()
		return
	# Ease-out scale — same s_t curve as shock_pulse so the kit reads
	# cohesively across FLAME and STORM bursts.
	var s_t: float = 1.0 - pow(1.0 - t, 2.0)
	var s_val: float = _scale_end * (START_SCALE + (1.0 - START_SCALE) * s_t)
	scale = Vector2(s_val, s_val)
	# Halo fades faster than core — leading-edge trick from iter-25
	# parry_pulse / iter-68 shock_pulse.
	var halo_fade: float = 1.0 - pow(t, 1.8)
	var core_fade: float = 1.0 - pow(t, 2.6)
	if _halo != null:
		var hc: Color = _halo.default_color
		hc.a = 0.65 * halo_fade
		_halo.default_color = hc
	if _core != null:
		var cc: Color = _core.default_color
		cc.a = 1.0 * core_fade
		_core.default_color = cc
