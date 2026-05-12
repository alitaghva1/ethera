# ShockPulse — iter 68 DODGE × STORM visual + damage event. Spawned at
# the hero's dodge START position when STORM tier >= 1. An expanding
# cyan-white electric ring that scales out to a target radius, damaging
# (and at tier 2, stunning) every enemy inside.
#
# Why a Line2D-based expanding ring (vs CPUParticles2D or a textured
# radial gradient):
# - The kit already uses Line2D rings for dash_impact / parry_pulse /
#   soul_burst (the iter-13 visual language). A new STORM cell fits in
#   immediately if it speaks the same shape grammar.
# - The ring needs an authoritative radius — it's both visual AND a
#   hit-test boundary. Line2D scaling makes "visual end-state matches
#   hit radius" a one-line truth (radius_target == final scaled extent).
# - Procedural color + width + scale keeps the asset small (no baked
#   texture) and lets tier 1 vs tier 2 use the same scene with different
#   radii driven by setup().
#
# Pairs cleanly with _spawn_shadow_dodge_trail — STORM tier 1 spawns
# this ring AT the dodge start, SHADOW tier 1 spawns the dash_trail
# behind the hero along the dodge direction. Both layer on the same
# dodge event without conflict (separate spawn calls in _start_dodge).
#
# Setup contract:
#   setup(radius, damage, stun_duration)
#     - radius (float): final ring radius in px. Used for both the visual
#       end-scale AND the enemy hit-test sweep.
#     - damage (int): integer damage dealt to each enemy in radius. One
#       hit at spawn — the ring is a snapshot AoE, not a damaging tick.
#     - stun_duration (float): if > 0, every hit enemy gets stunned
#       (apply_slow with multiplier 0.0) for this many seconds. Tier 2
#       (4+ STORM) passes 0.5, tier 1 passes 0.0 = no stun.
# Must be called BEFORE add_child so _ready sees the configured values.
class_name ShockPulse
extends Node2D

# Total lifetime of the expansion + fade. 0.4s — long enough to read
# as a discrete pulse, short enough to feel snappy (matches the dodge's
# 0.25s motion + 0.45s iframes window).
const DURATION: float = 0.4
# Scale ratio at spawn (relative to the final scale = 1.0). 0.2 means
# the ring is born already at 20% of its final extent — gives it a
# "punched out, expanding" character rather than starting from a point.
const START_SCALE: float = 0.2
# Base polygon radius — the geometry rings are built at this radius and
# then scaled to (radius_target / BASE_RADIUS) so they end up exactly
# at the configured radius. BASE_RADIUS is 60 by design so a tier-1
# (80px) call uses scale 1.33 and a tier-2 (120px) call uses scale 2.0.
const BASE_RADIUS: float = 60.0
# Number of polygon vertices for the circle approximation. 16 reads
# smooth at 120px on a 1080p screen; more verts just costs draw time.
const POLY_SEGMENTS: int = 16

var _radius_target: float = 80.0
var _damage: int = 1
var _stun_duration: float = 0.0

var _elapsed: float = 0.0
var _halo: Line2D = null
var _core: Line2D = null
# Final scale factor on the parent Node2D. Computed from radius_target
# / BASE_RADIUS so the visible ring end-state matches the hit radius.
var _scale_end: float = 1.0
var _initialized: bool = false
# Damage + stun applied ONCE on spawn — the ring is a snapshot AoE.
# Guard so a queued re-ready during weird tree manipulation doesn't
# double-fire.
var _hit_applied: bool = false

func setup(radius: float, damage: int, stun_duration: float = 0.0) -> void:
	_radius_target = max(1.0, radius)
	_damage = max(0, damage)
	_stun_duration = max(0.0, stun_duration)

func _ready() -> void:
	_scale_end = _radius_target / BASE_RADIUS
	# Start at START_SCALE × end so the ring "punches out" already
	# partway expanded — softens the otherwise-flat zero-size start.
	scale = Vector2(_scale_end * START_SCALE, _scale_end * START_SCALE)
	_build_rings()
	if not _hit_applied:
		_apply_damage_and_stun()
		_hit_applied = true
	_initialized = true

# Two-ring construction: outer wide cyan glow, inner crisp white core.
# Same two-ring "halo + core" grammar as iter-13 slash_arc / iter-25
# parry_pulse so the kit reads consistently — only the palette + size
# differs (STORM cyan-white vs SHADOW indigo vs FLAME red).
func _build_rings() -> void:
	var pts: PackedVector2Array = _circle_points(BASE_RADIUS, POLY_SEGMENTS)
	# Halo — wide cyan bloom under the core. Lower alpha so the core
	# reads as the sharp ring on top.
	_halo = Line2D.new()
	_halo.points = pts
	_halo.closed = true
	_halo.width = 10.0
	_halo.default_color = Color(0.35, 0.85, 1.0, 0.65)
	_halo.joint_mode = 2   # LINE_JOINT_ROUND
	_halo.begin_cap_mode = 2
	_halo.end_cap_mode = 2
	_halo.antialiased = true
	_halo.z_index = -1
	add_child(_halo)

	# Core — narrow, bright white. The "leading edge" of the wave.
	_core = Line2D.new()
	_core.points = pts
	_core.closed = true
	_core.width = 3.0
	_core.default_color = Color(0.95, 1.0, 1.0, 1.0)
	_core.joint_mode = 2
	_core.begin_cap_mode = 2
	_core.end_cap_mode = 2
	_core.antialiased = true
	add_child(_core)

# Build a closed circle as N points on a circle of `r`. Used directly
# in Line2D.points — closed=true wraps the last segment back to the
# first so the ring is a continuous polygon.
func _circle_points(r: float, segments: int) -> PackedVector2Array:
	var out: PackedVector2Array = PackedVector2Array()
	for i in range(segments):
		var a: float = (TAU / float(segments)) * float(i)
		out.append(Vector2(cos(a), sin(a)) * r)
	return out

# Snapshot AoE: every enemy in group "enemies" within _radius_target of
# the spawn position takes _damage; if _stun_duration > 0 they get
# apply_slow(stun_duration, 0.0) which freezes them via the iter-46
# slow system (0.0 multiplier = 0 movement). This is the "stun" channel
# — no formal stun field exists on enemy.gd, but slow at 0× speed reads
# as stun. Matches how chain_lightning / explosive_kill scan enemies.
func _apply_damage_and_stun() -> void:
	for enemy in get_tree().get_nodes_in_group("enemies"):
		if not is_instance_valid(enemy):
			continue
		if enemy.global_position.distance_to(global_position) > _radius_target:
			continue
		if _damage > 0 and enemy.has_method("take_hit"):
			enemy.take_hit(_damage)
		# Tier-2 stun. apply_slow(duration, 0.0) freezes the enemy for
		# the duration — chosen over a hypothetical apply_stun() because
		# enemy.gd has no separate stun field, and the slow=0.0 path
		# already routes through _effective_move_speed() consistently.
		if _stun_duration > 0.0 and is_instance_valid(enemy) and enemy.has_method("apply_slow"):
			enemy.apply_slow(_stun_duration, 0.0)

# Expansion + fade. Scale interpolates from START_SCALE × end → 1.0 × end
# on an ease-out curve so the ring snaps outward fast then settles —
# same s_t curve as dash_impact / parry_pulse so the kit reads cohesively.
func _process(delta: float) -> void:
	if not _initialized:
		return
	_elapsed += delta
	var t: float = _elapsed / DURATION
	if t >= 1.0:
		queue_free()
		return
	# Ease-out scale: 1 - (1-t)^2. Snaps fast, decelerates.
	var s_t: float = 1.0 - pow(1.0 - t, 2.0)
	var s_val: float = _scale_end * (START_SCALE + (1.0 - START_SCALE) * s_t)
	scale = Vector2(s_val, s_val)
	# Modulate alpha 1.0 → 0.0 over the full duration. Linear-ish fade
	# (slight ease-in via pow 1.5) so the ring lingers visibly before
	# disappearing — beats a flat linear which reads "abrupt cut."
	var alpha: float = 1.0 - pow(t, 1.5)
	modulate.a = alpha
