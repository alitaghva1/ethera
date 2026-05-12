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

# iter-75 followup rebuild (per user feedback: "Portals look lame"):
# the v1 portal was a single static-looking ring + one jagged disc that
# read as a sticker rather than a vortex. v2 adds depth via:
#   • soft outer aura halo (radius 80) — bleeds theme color outward
#   • counter-rotating inner + outer rings (parallax sells "spinning vortex")
#   • dark VortexVoid center with a bright rim (suggests depth — something
#     is coming THROUGH here)
#   • 4 tendril rays radiating outward, rotating slowly counter to the
#     outer ring (the "energy reaching out" beat)
# Size bumped 32 → 48 for the primary ring so portals feel substantial.
const RING_RADIUS: float = 48.0
const RING_SEGMENTS: int = 36
const AURA_RADIUS: float = 80.0
const INNER_RING_RADIUS: float = 34.0
const VORTEX_RIM_RADIUS: float = 28.0
const VORTEX_VOID_RADIUS: float = 16.0
const VORTEX_VERTS: int = 16

const OPEN_DURATION: float = 0.5
const CLOSE_DURATION: float = 0.4
const EMERGE_FLASH_DURATION: float = 0.18

# Rotation speeds — outer CW, inner CCW (counter-rotation = depth).
# Tendrils slow CCW so they read as a steady "reaching outward" beat.
const OUTER_RING_SPIN: float = 3.2
const INNER_RING_SPIN: float = -4.4
const TENDRIL_SPIN: float = -1.1

const RING_BASE_COLOR: Color = Color(0.85, 0.5, 1.0, 0.95)   # bright magenta-lavender on top
const SPARK_COLOR_START: Color = Color(1.0, 0.7, 1.0, 1.0)
const SPARK_COLOR_END: Color = Color(0.35, 0.85, 1.0, 0.0)   # fade toward cyan

enum Phase { OPEN, ACTIVE, CLOSE }
var _phase: int = Phase.OPEN
var _phase_elapsed: float = 0.0
var _theme_color: Color = Color(0.5, 0.2, 0.7, 0.7)

# Visual children — built in _ready, mutated in _process.
var _aura: Polygon2D = null
var _outer_ring: Line2D = null
var _inner_ring: Line2D = null
var _tendril_group: Node2D = null
var _vortex_rim: Polygon2D = null
var _vortex_void: Polygon2D = null
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
	# Z-order back-to-front: aura halo → outer ring → tendrils → inner
	# ring → vortex rim → vortex void → center point → sparks.
	_aura = _build_aura()
	_outer_ring = _build_outer_ring()
	_inner_ring = _build_inner_ring()
	_tendril_group = _build_tendrils()
	_vortex_rim = _build_vortex_rim()
	_vortex_void = _build_vortex_void()
	_center_point = _build_center_point()
	_sparks = _build_sparks()
	add_child(_aura)
	add_child(_outer_ring)
	add_child(_tendril_group)
	add_child(_inner_ring)
	add_child(_vortex_rim)
	add_child(_vortex_void)
	add_child(_center_point)
	add_child(_sparks)
	# Start fully closed visually; _process tween brings it open.
	for n in [_aura, _outer_ring, _inner_ring, _vortex_rim, _vortex_void, _center_point]:
		if n != null:
			n.modulate.a = 0.0
	if _tendril_group != null:
		_tendril_group.modulate.a = 0.0
	if _vortex_rim != null:
		_vortex_rim.scale = Vector2(0.3, 0.3)
	if _vortex_void != null:
		_vortex_void.scale = Vector2(0.3, 0.3)
	if _center_point != null:
		_center_point.scale = Vector2(0.4, 0.4)

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

# Outer aura halo — wide soft Polygon2D circle that bleeds theme color
# outward beyond the rings. Low alpha so it doesn't dominate, but big
# enough to give the portal "presence" in the room. Static, no rotation.
func _build_aura() -> Polygon2D:
	var poly: Polygon2D = Polygon2D.new()
	var verts: PackedVector2Array = PackedVector2Array()
	for i in range(20):
		var a: float = (TAU / 20.0) * float(i)
		verts.append(Vector2(cos(a), sin(a)) * AURA_RADIUS)
	poly.polygon = verts
	poly.color = Color(_theme_color.r, _theme_color.g, _theme_color.b, 0.18)
	return poly

# Inner counter-rotating ring — Line2D circle at INNER_RING_RADIUS.
# Spins OPPOSITE direction to outer ring so the two layers parallax,
# selling "deep spinning vortex" rather than "one flat disc rotating."
func _build_inner_ring() -> Line2D:
	var line: Line2D = Line2D.new()
	line.closed = true
	line.width = 2.5
	line.joint_mode = Line2D.LINE_JOINT_ROUND
	line.antialiased = true
	var pts: PackedVector2Array = PackedVector2Array()
	for i in range(RING_SEGMENTS):
		var a: float = (TAU / float(RING_SEGMENTS)) * float(i)
		pts.append(Vector2(cos(a), sin(a)) * INNER_RING_RADIUS)
	line.points = pts
	var grad: Gradient = Gradient.new()
	grad.add_point(0.0, Color(0.95, 0.65, 1.0, 0.95))
	grad.add_point(0.5, Color(0.5, 0.25, 0.85, 0.55))
	grad.add_point(1.0, Color(0.95, 0.65, 1.0, 0.10))
	line.gradient = grad
	return line

# Tendril rays — 4 short Line2Ds radiating outward from the rings into
# the aura. Grouped under a Node2D so they rotate together (slow CCW)
# while the outer ring rotates CW above and the inner ring rotates CCW
# below. Counter-rotation across 3 layers gives the eye three distinct
# motion vectors, reading as 3D depth in a 2D scene.
func _build_tendrils() -> Node2D:
	var group: Node2D = Node2D.new()
	var inner: float = RING_RADIUS - 6.0
	var outer: float = AURA_RADIUS - 8.0
	for i in range(4):
		var ray: Line2D = Line2D.new()
		ray.width = 2.0
		ray.antialiased = true
		var a: float = (TAU / 4.0) * float(i) + 0.18   # slight offset off cardinal axes
		ray.points = PackedVector2Array([
			Vector2(cos(a), sin(a)) * inner,
			Vector2(cos(a), sin(a)) * outer,
		])
		# Gradient: bright at portal-side, fade at the outward tip — reads
		# as energy beaming OUT from the portal core.
		var rg: Gradient = Gradient.new()
		rg.add_point(0.0, Color(_theme_color.r * 1.4, _theme_color.g * 1.2, _theme_color.b * 1.4, 0.85))
		rg.add_point(1.0, Color(_theme_color.r, _theme_color.g, _theme_color.b, 0.0))
		ray.gradient = rg
		group.add_child(ray)
	return group

# Vortex rim — bright filled Polygon2D at VORTEX_RIM_RADIUS that reads
# as the GLOWING EDGE of the void. Sits behind the dark void center so
# the layered effect is "bright halo → dark hole in space → white spark."
# Vertex jitter (±12%) breaks the perfect circle so the silhouette swirls
# rather than reading as a flat disc.
func _build_vortex_rim() -> Polygon2D:
	var poly: Polygon2D = Polygon2D.new()
	var verts: PackedVector2Array = PackedVector2Array()
	for i in range(VORTEX_VERTS):
		var a: float = (TAU / float(VORTEX_VERTS)) * float(i)
		var r: float = VORTEX_RIM_RADIUS * (0.88 + 0.18 * sin(float(i) * 1.7))
		verts.append(Vector2(cos(a), sin(a)) * r)
	poly.polygon = verts
	# Brighter than _theme_color base — this IS the glowing rim. Mix
	# theme color with a hot magenta-cream so darker theme palettes
	# still get a luminous edge.
	poly.color = Color(
		min(1.0, _theme_color.r + 0.30),
		min(1.0, _theme_color.g + 0.18),
		min(1.0, _theme_color.b + 0.30),
		0.85,
	)
	return poly

# Vortex void — DARK filled polygon nested INSIDE the rim, suggesting
# a hole in space. Slightly smaller than the rim, near-black with low
# theme-color bleed so it doesn't go pure-black against a dark room
# floor. The contrast against the bright rim is what sells depth.
func _build_vortex_void() -> Polygon2D:
	var poly: Polygon2D = Polygon2D.new()
	var verts: PackedVector2Array = PackedVector2Array()
	for i in range(VORTEX_VERTS):
		var a: float = (TAU / float(VORTEX_VERTS)) * float(i) + 0.12   # offset rotation from rim
		var r: float = VORTEX_VOID_RADIUS * (0.92 + 0.10 * sin(float(i) * 2.3))
		verts.append(Vector2(cos(a), sin(a)) * r)
	poly.polygon = verts
	# Deep purple-black — dark enough to read as "void" but tinted just
	# enough to feel magical, not just a hole.
	poly.color = Color(
		_theme_color.r * 0.18,
		_theme_color.g * 0.12,
		_theme_color.b * 0.22,
		0.92,
	)
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
	# Iter-75 bug-fix: CPUParticles2D only has EMISSION_SHAPE_SPHERE_SURFACE
	# (a ring outline in 2D) — EMISSION_SHAPE_RING + emission_ring_radius/
	# emission_ring_inner_radius/emission_ring_axis are CPUParticles3D-only
	# and threw "Invalid assignment of property" at scene load. The 2D
	# equivalent is SPHERE_SURFACE with emission_sphere_radius (single
	# radius, no inner-band fidelity — collapsed to the midpoint).
	p.emission_shape = CPUParticles2D.EMISSION_SHAPE_SPHERE_SURFACE
	p.emission_sphere_radius = RING_RADIUS - 4.0
	# Direction (0,0) means use the emission's outward normal from the
	# sphere surface; we flip with negative initial_velocity so particles
	# aim INWARD toward the portal center.
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
	# Counter-rotation across three layers — the eye reads three distinct
	# motion vectors as depth. Rotation runs continuously regardless of
	# phase so the swirl is a constant feature of the portal.
	if _outer_ring != null:
		_outer_ring.rotation += OUTER_RING_SPIN * delta
	if _inner_ring != null:
		_inner_ring.rotation += INNER_RING_SPIN * delta
	if _tendril_group != null:
		_tendril_group.rotation += TENDRIL_SPIN * delta
	match _phase:
		Phase.OPEN:
			_tick_open(delta)
		Phase.ACTIVE:
			_tick_active(delta)
		Phase.CLOSE:
			_tick_close(delta)

# Open phase animation curve. All visual layers fade in over OPEN_DURATION
# with slightly staggered timings — aura first, then rings, then vortex
# rim, then void+center — so the portal reads as MATERIALIZING in layers
# rather than appearing all at once. Vortex rim scale peaks at 1.1 then
# settles to 0.85 ("burst then breathe").
func _tick_open(_delta: float) -> void:
	var t: float = clampf(_phase_elapsed / OPEN_DURATION, 0.0, 1.0)
	var ease_out: float = 1.0 - pow(1.0 - t, 2.0)
	# Aura fades in first (peak alpha 1.0 multiplied by aura's built-in 0.18).
	if _aura != null:
		_aura.modulate.a = ease_out
	if _outer_ring != null:
		_outer_ring.modulate.a = ease_out
	if _inner_ring != null:
		# Slight delay so the inner ring punches in AFTER the outer one.
		var inner_t: float = clampf((t - 0.15) / 0.85, 0.0, 1.0)
		_inner_ring.modulate.a = 1.0 - pow(1.0 - inner_t, 2.0)
	if _tendril_group != null:
		# Tendrils arrive last — feels like the portal "reaches outward"
		# only once the rim is established.
		var tg_t: float = clampf((t - 0.30) / 0.70, 0.0, 1.0)
		_tendril_group.modulate.a = tg_t
	if _vortex_rim != null:
		# Scale: 0.3 → 1.1 (at t=0.7) → 0.85 (at t=1.0). Burst-then-settle.
		var s: float
		if t < 0.7:
			var u: float = t / 0.7
			s = 0.3 + u * (1.1 - 0.3)
		else:
			var u: float = (t - 0.7) / 0.3
			s = 1.1 + u * (0.85 - 1.1)
		_vortex_rim.scale = Vector2(s, s)
		_vortex_rim.modulate.a = ease_out
	if _vortex_void != null:
		# Void grows in slightly later than the rim so the dark center
		# "opens" once the rim has formed — reads as "the rim made a hole."
		var void_t: float = clampf((t - 0.20) / 0.80, 0.0, 1.0)
		var vs: float = 0.3 + void_t * 0.55   # 0.3 → 0.85
		_vortex_void.scale = Vector2(vs, vs)
		_vortex_void.modulate.a = void_t
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
	if _aura != null:
		_aura.modulate.a = 0.9 + 0.10 * sin(_phase_elapsed * 2.8)
	if _outer_ring != null:
		_outer_ring.modulate.a = 1.0
	if _inner_ring != null:
		_inner_ring.modulate.a = 0.95
	if _tendril_group != null:
		# Tendrils breathe slightly out of phase with the aura so the
		# rays don't reinforce the aura pulse — feels alive.
		_tendril_group.modulate.a = 0.85 + 0.15 * sin(_phase_elapsed * 3.6 + 1.2)
	if _vortex_rim != null:
		# Breathing: 0.85 ± 0.05 via sine — same as v1 vortex.
		var s: float = 0.85 + 0.05 * sin(_phase_elapsed * 4.5)
		_vortex_rim.scale = Vector2(s, s)
		_vortex_rim.modulate.a = 0.92
	if _vortex_void != null:
		# Void breathes in COUNTERPHASE to the rim — when rim expands,
		# void shrinks slightly. The contrast oscillation sells "depth
		# breathing."
		var vs: float = 0.85 - 0.06 * sin(_phase_elapsed * 4.5)
		_vortex_void.scale = Vector2(vs, vs)
		_vortex_void.modulate.a = 0.92
	if _center_point != null:
		_center_point.modulate.a = 0.6 + 0.4 * _flash_brightness()
		var cs: float = 1.0 + 0.4 * _flash_brightness()
		_center_point.scale = Vector2(cs, cs)

# Close phase — fade everything out + shrink, then self-free. Mirrors
# floor_clear_burst / pickup_banner's "tween to invisible then queue_free"
# convention. self.scale is left alone (children handle their own scale).
func _tick_close(_delta: float) -> void:
	var t: float = clampf(_phase_elapsed / CLOSE_DURATION, 0.0, 1.0)
	var ease_in: float = pow(t, 2.0)
	var inv: float = 1.0 - ease_in
	for n in [_aura, _outer_ring, _inner_ring, _vortex_rim, _vortex_void, _center_point]:
		if n != null:
			n.modulate.a = inv * 1.0
	if _tendril_group != null:
		_tendril_group.modulate.a = inv
	if _vortex_rim != null:
		var s: float = 0.85 * (1.0 - ease_in * 0.7)
		_vortex_rim.scale = Vector2(s, s)
	if _vortex_void != null:
		var vs: float = 0.85 * (1.0 - ease_in * 0.85)
		_vortex_void.scale = Vector2(vs, vs)
	if _center_point != null:
		_center_point.scale = Vector2(inv, inv)
	if t >= 1.0:
		queue_free()

# Helper — returns 0 → 1 brightness multiplier for the center-point.
# Approaches 1 right after emit_enemy fires, decays to 0 over
# EMERGE_FLASH_DURATION.
func _flash_brightness() -> float:
	if EMERGE_FLASH_DURATION <= 0.0:
		return 0.0
	return _flash_remaining / EMERGE_FLASH_DURATION
