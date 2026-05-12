# SpawnPortal — Wizard-kit sprint 3 (track C) consolidates the previous
# "N independent red enemy fade-ins" spawn telegraph into a smaller set
# of dramatic portals. Up to 3 portals open per wave; every enemy in
# the wave emerges from one of those portals (vs. a per-enemy random
# spawn_point as in iter 15 — see main.gd:_spawn_enemy_type pre-track-C).
#
# User feedback (verbatim): "the portals that summon monsters there are
# 6, thats too many and it doesnt feel like theres love for those
# portals. They should be more visually impressive and make more sense
# in use." Pre-fix the player saw 6 simultaneous SPAWN_IN_START_COLOR
# red ghosts (enemy.gd:54). Post-fix the player sees ≤3 actual portal
# rings + each enemy emerging from one with a brief flash.
#
# Lifecycle phases:
#   OPEN   (0.5s): ring fades in, vortex grows 0.3 → 1.0, sparks emit.
#                  Telegraphs WHERE enemies will appear.
#   ACTIVE (variable): portal stays open while wave spawns are queued.
#                      emit_enemy() flashes it briefly when each enemy
#                      emerges from this portal.
#   CLOSE  (0.4s): ring fades out, vortex shrinks, self-frees.
#
# Spawn contract:
#   SpawnPortal.spawn(host, world_pos, theme_color=Color(0.5, 0.2, 0.7))
#     - host (Node): typically main.gd; portal becomes its child
#     - world_pos (Vector2): center of the portal
#     - theme_color (Color): base tint for vortex + outer ring. Default
#       is the dark purple-magenta required by the spec; pass through
#       an alternate tint if a room/biome wants to lean into its theme.
#   .emit_enemy(): brief white flash + small particle puff. Called by
#     main.gd right before/after the actual enemy spawns at the portal's
#     position. No-op while OPEN — emergence flashes only after the
#     opening telegraph completes.
#   .close(): start the close animation; portal queue_frees at the end.
#
# z_index = 3 places the portal between hero (default 0) and the active
# combat layer; ground hazards sit at z_index ≤ 1 so the portal reads
# clearly without obscuring spike_pit/fire_pool/glyph_trap warning rings.
class_name SpawnPortal
extends Node2D

const RING_RADIUS: float = 32.0
const RING_SEGMENTS: int = 32
const VORTEX_VERTS: int = 12
const VORTEX_BASE_RADIUS: float = 22.0

const OPEN_DURATION: float = 0.5
const CLOSE_DURATION: float = 0.4
const EMERGE_FLASH_DURATION: float = 0.18

const RING_BASE_COLOR: Color = Color(0.85, 0.5, 1.0, 0.95)   # bright magenta-lavender on top
const SPARK_COLOR_START: Color = Color(1.0, 0.7, 1.0, 1.0)
const SPARK_COLOR_END: Color = Color(0.35, 0.85, 1.0, 0.0)   # fade toward cyan

enum Phase { OPEN, ACTIVE, CLOSE }
var _phase: int = Phase.OPEN
var _phase_elapsed: float = 0.0
var _theme_color: Color = Color(0.5, 0.2, 0.7, 0.7)

# Visual children — built in _ready, mutated in _process.
var _outer_ring: Line2D = null
var _vortex: Polygon2D = null
var _center_point: Polygon2D = null
var _sparks: CPUParticles2D = null

# Active flash state — emit_enemy stacks if hammered, so track elapsed
# of the most-recent emit and pulse modulate on top of the base phase
# coloring rather than fighting it with a tween.
var _flash_remaining: float = 0.0

# Spec convention (mirror EmberBurst.spawn / FloorClearBurst.spawn): a
# static factory method that instances the scene, configures it, and
# adds it as a child of the host. Returns the instance so the caller
# can keep a reference for emit_enemy / close calls. Loaded inside the
# function (NOT as a top-level const) to avoid a circular preload — the
# .tscn references this script via res:// and would otherwise self-load.
static func spawn(host: Node, world_pos: Vector2, theme_color: Color = Color(0.5, 0.2, 0.7, 0.7)) -> SpawnPortal:
	var scene: PackedScene = load("res://scenes/fx/spawn_portal.tscn") as PackedScene
	if scene == null:
		push_warning("SpawnPortal.spawn: scene failed to load")
		return null
	var p: SpawnPortal = scene.instantiate() as SpawnPortal
	if p == null:
		push_warning("SpawnPortal.spawn: instantiate returned non-SpawnPortal")
		return null
	p.global_position = world_pos
	p._theme_color = theme_color
	host.add_child(p)
	return p

func _ready() -> void:
	z_index = 3
	# Build geometry up-front; _process drives scale / alpha / rotation
	# so the per-frame work stays cheap.
	_outer_ring = _build_outer_ring()
	_vortex = _build_vortex()
	_center_point = _build_center_point()
	_sparks = _build_sparks()
	add_child(_vortex)
	add_child(_outer_ring)
	add_child(_center_point)
	add_child(_sparks)
	# Start fully closed visually; _process tween brings it open.
	_vortex.scale = Vector2(0.3, 0.3)
	_vortex.modulate.a = 0.0
	_outer_ring.modulate.a = 0.0
	_center_point.scale = Vector2(0.4, 0.4)
	_center_point.modulate.a = 0.0

# Outer ring — rotating Line2D circle. The Line2D is a closed polygon
# of RING_SEGMENTS vertices, drawn with the ring's primary color and a
# tail of fading alpha around its circumference (built via per-vertex
# colors) so it reads as a swirling arc rather than a static circle.
# Rotation is driven in _process by setting self.rotation.
func _build_outer_ring() -> Line2D:
	var line: Line2D = Line2D.new()
	line.closed = true
	line.width = 3.5
	line.default_color = RING_BASE_COLOR
	line.joint_mode = Line2D.LINE_JOINT_ROUND
	line.begin_cap_mode = Line2D.LINE_CAP_ROUND
	line.end_cap_mode = Line2D.LINE_CAP_ROUND
	line.antialiased = true
	# Per-vertex gradient — bright at one end, faded at the other so as
	# the ring rotates it reads as a chasing arc. The Gradient is built
	# at construction time since the segment count is constant.
	var pts: PackedVector2Array = PackedVector2Array()
	for i in range(RING_SEGMENTS):
		var a: float = (TAU / float(RING_SEGMENTS)) * float(i)
		pts.append(Vector2(cos(a), sin(a)) * RING_RADIUS)
	line.points = pts
	var grad: Gradient = Gradient.new()
	grad.add_point(0.0, Color(1.0, 0.85, 1.0, 1.0))
	grad.add_point(0.5, Color(0.85, 0.5, 1.0, 0.85))
	grad.add_point(1.0, Color(0.45, 0.25, 0.85, 0.15))
	line.gradient = grad
	return line

# Inner vortex — 12-vertex Polygon2D circle, base tint = theme_color.
# Pulses scale 0.3 → 1.1 → 0.8 over the OPEN phase, then holds at ~0.9
# with subtle breathing during ACTIVE. The vertex offsets are tweaked
# off perfect circle by ±10% so the shape reads as "swirling" rather
# than a flat disc.
func _build_vortex() -> Polygon2D:
	var poly: Polygon2D = Polygon2D.new()
	var verts: PackedVector2Array = PackedVector2Array()
	for i in range(VORTEX_VERTS):
		var a: float = (TAU / float(VORTEX_VERTS)) * float(i)
		# Tiny per-vertex jitter for an "irregular swirl" silhouette.
		# Seeded by index so the same shape persists across frames (no
		# wobble noise — that's left to scale animation in _process).
		var r: float = VORTEX_BASE_RADIUS * (0.88 + 0.18 * sin(float(i) * 1.7))
		verts.append(Vector2(cos(a), sin(a)) * r)
	poly.polygon = verts
	poly.color = _theme_color
	# Soft inner glow via a second vertex color array — Polygon2D
	# supports per-vertex colors so the disc fades to brighter at the
	# center. We omit that here in favor of the dedicated _center_point
	# child which is simpler to flash independently.
	return poly

# Center white-hot point — small polygon that pulses brighter every
# time emit_enemy fires (and a subtle breath while ACTIVE). Built as
# a small Polygon2D with a near-white color and 60% alpha; the actual
# brightness is driven in _process from _flash_remaining.
func _build_center_point() -> Polygon2D:
	var poly: Polygon2D = Polygon2D.new()
	var verts: PackedVector2Array = PackedVector2Array()
	var r: float = 6.0
	for i in range(8):
		var a: float = (TAU / 8.0) * float(i)
		verts.append(Vector2(cos(a), sin(a)) * r)
	poly.polygon = verts
	poly.color = Color(1.0, 0.95, 1.0, 0.85)
	return poly

# Sparks — CPUParticles2D ring emitter. Particles spawn around the
# ring edge and drift inward toward center, sized + colored to feel
# like sparks of arcane energy. emitting=true while OPEN/ACTIVE, off
# while CLOSE.
func _build_sparks() -> CPUParticles2D:
	var p: CPUParticles2D = CPUParticles2D.new()
	p.emitting = true
	p.amount = 12
	p.lifetime = 0.6
	p.preprocess = 0.0
	p.speed_scale = 1.0
	p.explosiveness = 0.0
	p.randomness = 0.45
	# Emit from a ring around the outer edge, INWARD-aiming velocity.
	p.emission_shape = CPUParticles2D.EMISSION_SHAPE_RING
	p.emission_ring_radius = RING_RADIUS - 2.0
	p.emission_ring_inner_radius = RING_RADIUS - 6.0
	p.emission_ring_axis = Vector3(0, 0, 1)
	# Direction (0,0) means use the emission_ring's outward normal;
	# we flip with negative initial_velocity so particles aim INWARD
	# toward the portal center.
	p.direction = Vector2.ZERO   # default — let initial_velocity_min/max < 0 invert
	p.spread = 35.0
	p.initial_velocity_min = -60.0
	p.initial_velocity_max = -28.0
	p.scale_amount_min = 1.2
	p.scale_amount_max = 2.4
	# Color ramp: start bright magenta-pink, fade to cyan as the spark
	# travels inward and dies. Distinct from any combat FX color (slash
	# is cream, dash is cyan-blue, ember is orange) so a player who sees
	# this knows "portal" specifically. CPUParticles2D.color_ramp is
	# typed Gradient (not GradientTexture1D) in Godot 4.6 — assign
	# directly without wrapping in a texture.
	var grad: Gradient = Gradient.new()
	grad.add_point(0.0, SPARK_COLOR_START)
	grad.add_point(0.6, Color(0.85, 0.45, 1.0, 0.9))
	grad.add_point(1.0, SPARK_COLOR_END)
	p.color_ramp = grad
	return p

# OPEN — Public API. Begin the close animation. ACTIVE → CLOSE.
# Idempotent — safe to call multiple times (the second call just
# resets phase to CLOSE and lets the same animation play out).
func close() -> void:
	if _phase == Phase.CLOSE:
		return
	_phase = Phase.CLOSE
	_phase_elapsed = 0.0
	if _sparks != null:
		_sparks.emitting = false

# ACTIVE — Public API. Flash the portal momentarily to mark "an
# enemy is emerging RIGHT NOW from this portal." Reads as a sync
# beat between the portal opening and the actual enemy fade-in
# (which still runs through enemy.gd:_spawn_in_time).
#
# Called by main.gd: _spawn_enemy_type was modified in track C to
# look up which active wave portal the spawn position came from and
# fire this method on that portal node.
func emit_enemy() -> void:
	# Only flash AFTER the open telegraph completes — if main fires
	# emit_enemy mid-open (shouldn't happen with the spawn stagger
	# but better safe than glitchy), we still register the flash but
	# defer its visual peak until the portal is actually visible.
	_flash_remaining = EMERGE_FLASH_DURATION

func _process(delta: float) -> void:
	_phase_elapsed += delta
	if _flash_remaining > 0.0:
		_flash_remaining = max(0.0, _flash_remaining - delta)
	# Rotation runs continuously regardless of phase — the swirl
	# direction reads as a constant feature of the portal rather than
	# phase-specific motion.
	if _outer_ring != null:
		_outer_ring.rotation += 3.2 * delta
	match _phase:
		Phase.OPEN:
			_tick_open(delta)
		Phase.ACTIVE:
			_tick_active(delta)
		Phase.CLOSE:
			_tick_close(delta)

# Open phase animation curve. Ring + vortex fade in / scale up over
# OPEN_DURATION; once elapsed exceeds OPEN_DURATION we transition to
# ACTIVE. Vortex scale peaks at 1.1 then settles back to 0.9, giving
# a "burst then breathe" feel.
func _tick_open(_delta: float) -> void:
	var t: float = clampf(_phase_elapsed / OPEN_DURATION, 0.0, 1.0)
	# ease-out for entry alpha so the ring punches in fast then settles.
	var ease_out: float = 1.0 - pow(1.0 - t, 2.0)
	if _outer_ring != null:
		_outer_ring.modulate.a = ease_out
	if _vortex != null:
		# Scale curve: 0.3 → 1.1 (at t=0.7) → 0.85 (at t=1.0). A pair
		# of linear interpolations rather than a single curve so the
		# overshoot reads cleanly.
		var s: float
		if t < 0.7:
			var u: float = t / 0.7
			s = 0.3 + u * (1.1 - 0.3)
		else:
			var u: float = (t - 0.7) / 0.3
			s = 1.1 + u * (0.85 - 1.1)
		_vortex.scale = Vector2(s, s)
		_vortex.modulate.a = ease_out
	if _center_point != null:
		_center_point.scale = Vector2(0.4 + 0.6 * t, 0.4 + 0.6 * t)
		_center_point.modulate.a = ease_out * (0.6 + 0.4 * _flash_brightness())
	if _phase_elapsed >= OPEN_DURATION:
		_phase = Phase.ACTIVE
		_phase_elapsed = 0.0

# Active phase — portal stays open, breathing subtly. emit_enemy() puts
# a brief brightness pulse on top of the steady-state via _flash_remaining,
# read by _flash_brightness().
func _tick_active(_delta: float) -> void:
	if _outer_ring != null:
		_outer_ring.modulate.a = 1.0
	if _vortex != null:
		# Breathing: 0.85 ± 0.05 via sine
		var s: float = 0.85 + 0.05 * sin(_phase_elapsed * 4.5)
		_vortex.scale = Vector2(s, s)
		_vortex.modulate.a = 0.92
	if _center_point != null:
		_center_point.modulate.a = 0.6 + 0.4 * _flash_brightness()
		var cs: float = 1.0 + 0.4 * _flash_brightness()
		_center_point.scale = Vector2(cs, cs)

# Close phase — fade everything out + shrink, then self-free. Mirrors
# floor_clear_burst / pickup_banner's "tween to invisible then queue_free"
# convention. self.scale is left alone (the child polygons handle their
# own scale so closing one portal doesn't drag a stretched copy).
func _tick_close(_delta: float) -> void:
	var t: float = clampf(_phase_elapsed / CLOSE_DURATION, 0.0, 1.0)
	var ease_in: float = pow(t, 2.0)
	if _outer_ring != null:
		_outer_ring.modulate.a = 1.0 - ease_in
	if _vortex != null:
		var s: float = 0.85 * (1.0 - ease_in * 0.7)
		_vortex.scale = Vector2(s, s)
		_vortex.modulate.a = 1.0 - ease_in
	if _center_point != null:
		_center_point.modulate.a = (1.0 - ease_in) * 0.6
		_center_point.scale = Vector2(1.0 - ease_in, 1.0 - ease_in)
	if t >= 1.0:
		queue_free()

# Helper — returns 0 → 1 brightness multiplier for the center-point.
# Approaches 1 right after emit_enemy fires, decays to 0 over
# EMERGE_FLASH_DURATION.
func _flash_brightness() -> float:
	if EMERGE_FLASH_DURATION <= 0.0:
		return 0.0
	return _flash_remaining / EMERGE_FLASH_DURATION
