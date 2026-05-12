# SpawnPortal — iter 77 design pass.
#
# User feedback on the previous (iter 75/76) implementations:
#   "Portals look bad and feel poorly designed... too large, too bright,
#    visually noisy... look like flat UI decals instead of something
#    that belongs in the dungeon world... too much attention away from
#    the player, enemies, room exits."
#
# Design intent for this rewrite:
#   - Reads as a corrupted floor mark, NOT a glowing UI badge
#   - Total footprint ~32 px (was 80+ with aura) so multiple portals
#     don't dominate the screen
#   - Dark purple-magenta palette grounded in the dungeon, not neon
#   - Layers sit at z=1 (floor decor) so the hero / enemies / FX read
#     ABOVE the portal, not below it
#   - 4 explicit states: TELEGRAPH → ACTIVE → SPAWN_PULSE-on-emit →
#     COLLAPSE → queue_free
#
# Visual elements (back to front):
#   1. CrackMark    — 6 short jagged Line2D segments forming a broken
#                     circle (radius ~22). Dark purple, near-static.
#                     The PRIMARY readable element — "ground is cracked
#                     and something is coming through."
#   2. InnerGlow    — single Polygon2D filled circle (radius ~16),
#                     theme color, low alpha (0.30 peak). Breathes
#                     gently. Sits inside the crack ring.
#   3. RuneFragments — 3 BROKEN arc segments (~36° each) at radius 28,
#                      spaced 120° apart. Rotate slowly. Implies a
#                      ritual circle that's mostly worn away.
#   4. RisingEmbers — CPUParticles2D, 6 sparse particles drifting
#                     upward + slightly outward, theme color, fading.
#
# Animation states:
#   TELEGRAPH (0.6s): all elements fade in from alpha 0 → target alpha.
#                     Scale 0.85 → 1.0 with a gentle ease-out.
#   ACTIVE (variable): steady display. InnerGlow breathes ±0.08 alpha
#                      via sine. Embers continuously emit. Rune fragments
#                      slowly rotate.
#   SPAWN_PULSE (0.15s burst on emit_enemy()): InnerGlow alpha briefly
#                pulses to 0.55 + small scale bump 1.0 → 1.10 → 1.0.
#                Embers fire a small burst.
#   COLLAPSE (0.5s): everything fades to 0, scale 1.0 → 0.7.
#   REMOVED: queue_free.
#
# Placement constraints are handled by main.gd's _is_portal_position_valid
# — this script doesn't validate its own position.

class_name SpawnPortal
extends Node2D

# ─── TUNABLES (visual) ────────────────────────────────────────────
# Total visible radius ≈ 32 px. Half the iter-76 portal (radius 48 +
# aura 80). Three portals in a room no longer crowd the screen.
const CRACK_RADIUS: float = 22.0          # circle where crack segments sit
const INNER_GLOW_RADIUS: float = 16.0     # filled glow disc
const RUNE_FRAGMENT_RADIUS: float = 28.0  # rotating broken-ring fragments
const RUNE_FRAGMENT_ARC: float = 0.62     # ~36° per fragment (radians)
const RUNE_FRAGMENT_COUNT: int = 3
const CRACK_SEGMENT_COUNT: int = 6

# Peak alpha at ACTIVE steady state — keep all of these LOW. The previous
# implementation peaked rings at 1.0 alpha + bright colors → visually
# loud. Restraint goal: an attentive player notices, a fighting player
# isn't distracted.
const CRACK_PEAK_ALPHA: float = 0.85
const INNER_GLOW_PEAK_ALPHA: float = 0.30
const RUNE_PEAK_ALPHA: float = 0.55
const EMBER_PEAK_ALPHA: float = 0.65

# Phase timings.
const TELEGRAPH_DURATION: float = 0.6
const SPAWN_PULSE_DURATION: float = 0.15
const COLLAPSE_DURATION: float = 0.5

# Motion. Runes rotate slowly — fast rotation feels like a UI element.
const RUNE_ROTATION_SPEED: float = 0.45   # rad/s
const GLOW_BREATHE_HZ: float = 1.6        # cycles per sec
const GLOW_BREATHE_AMP: float = 0.08      # alpha amplitude

# Color palette — dark purple-magenta floor-mark feel. NOT neon.
const CRACK_COLOR: Color = Color(0.22, 0.10, 0.30, 1.0)  # alpha set in tick
const RUNE_COLOR: Color = Color(0.55, 0.30, 0.70, 1.0)   # muted magenta
# InnerGlow color uses theme_color blended toward magenta-purple at low
# saturation so dark-ambient rooms still see a hint of warmth.

# Particle tuning — small + sparse so the portal feels atmospheric, not
# spectacular. 6 particles over 1.2 s lifetime means ~5 visible at any
# given moment.
const EMBER_AMOUNT: int = 6
const EMBER_LIFETIME: float = 1.2
const EMBER_SPAWN_RADIUS: float = 8.0     # where embers originate (small disc)
const EMBER_VELOCITY_MIN: float = 16.0
const EMBER_VELOCITY_MAX: float = 38.0
const EMBER_GRAVITY: float = -28.0        # negative = rising

# Z-index. Portal stays at FLOOR LEVEL — hero (default z=0 → renders at
# tree order ~hero level) and FX (z=2/5) draw ABOVE the portal. The
# previous z=3 made the portal compete with combat elements; z=1
# matches floor decor convention.
const PORTAL_Z_INDEX: int = 1
const EMBER_Z_INDEX: int = 3   # embers rise visually above floor mark
# ──────────────────────────────────────────────────────────────────

enum Phase { TELEGRAPH, ACTIVE, COLLAPSE }
var _phase: int = Phase.TELEGRAPH
var _phase_elapsed: float = 0.0
var _theme_color: Color = Color(0.55, 0.30, 0.70, 1.0)

# SPAWN_PULSE rides on top of whatever phase we're in (typically ACTIVE).
# Stored as a remaining-time counter so back-to-back emits stack cleanly:
# each emit resets the counter; the visual decays naturally.
var _pulse_remaining: float = 0.0

# Visual children built in _ready, mutated in _process.
var _crack_lines: Array[Line2D] = []
var _inner_glow: Polygon2D = null
var _rune_fragments: Array[Line2D] = []
var _rune_group: Node2D = null
var _embers: CPUParticles2D = null

# ─── Public API ───────────────────────────────────────────────────
# Static factory — mirrors EmberBurst.spawn / PickupBanner.spawn.
# Loaded inside the function (NOT a top-level const) so the .tscn
# can ref this script without circular preload.
static func spawn(host: Node, world_pos: Vector2, theme_color: Color = Color(0.55, 0.30, 0.70, 1.0)) -> SpawnPortal:
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

# Flash the portal momentarily — called by main.gd when an enemy emerges
# through this portal. Stacks cleanly: rapid emits just keep resetting
# the pulse timer.
func emit_enemy() -> void:
	_pulse_remaining = SPAWN_PULSE_DURATION

# Begin the collapse animation. Idempotent.
func close() -> void:
	if _phase == Phase.COLLAPSE:
		return
	_phase = Phase.COLLAPSE
	_phase_elapsed = 0.0
	if _embers != null:
		_embers.emitting = false

# ─── Construction ─────────────────────────────────────────────────
func _ready() -> void:
	z_index = PORTAL_Z_INDEX
	_build_visuals()
	# Everything starts hidden — TELEGRAPH tick brings them in.
	_set_all_alpha(0.0)
	scale = Vector2(0.85, 0.85)

func _build_visuals() -> void:
	# Crack mark — 6 short jagged Line2D segments arranged around a
	# circle. Each segment is 3 points with mild perpendicular jitter so
	# the cracks look organic rather than geometric. Spaced 60° apart
	# with a small per-segment angular offset so the pattern isn't
	# obviously rotational-symmetric.
	for i in range(CRACK_SEGMENT_COUNT):
		var line: Line2D = Line2D.new()
		line.width = 2.2
		line.antialiased = true
		line.default_color = CRACK_COLOR
		var center_angle: float = (TAU / float(CRACK_SEGMENT_COUNT)) * float(i) + (0.13 * sin(float(i) * 2.7))
		var arc_half: float = 0.18   # ~10° each side of center
		var seg_pts: PackedVector2Array = PackedVector2Array()
		# Three points per segment with small inward/outward jitter.
		for j in range(3):
			var t: float = float(j) / 2.0
			var angle: float = center_angle - arc_half + t * (arc_half * 2.0)
			var jitter: float = (0.85 + 0.15 * sin(float(i * 3 + j) * 1.9))
			seg_pts.append(Vector2(cos(angle), sin(angle)) * (CRACK_RADIUS * jitter))
		line.points = seg_pts
		add_child(line)
		_crack_lines.append(line)

	# Inner glow — single filled Polygon2D, ~16 px radius, theme color
	# tinted toward magenta-purple so it reads as portal energy not
	# ambient room light.
	_inner_glow = Polygon2D.new()
	var glow_verts: PackedVector2Array = PackedVector2Array()
	for i in range(16):
		var a: float = (TAU / 16.0) * float(i)
		glow_verts.append(Vector2(cos(a), sin(a)) * INNER_GLOW_RADIUS)
	_inner_glow.polygon = glow_verts
	# Blend theme color with portal-purple base so dark themes still glow.
	_inner_glow.color = _portal_color(_theme_color, INNER_GLOW_PEAK_ALPHA)
	_inner_glow.z_index = 2
	add_child(_inner_glow)

	# Rune fragments — 3 broken arcs at 120° spacing, grouped under a
	# Node2D so we can rotate them as one unit. Each fragment is a Line2D
	# sampled across RUNE_FRAGMENT_ARC radians of circle.
	_rune_group = Node2D.new()
	_rune_group.z_index = 2
	add_child(_rune_group)
	for i in range(RUNE_FRAGMENT_COUNT):
		var frag: Line2D = Line2D.new()
		frag.width = 1.8
		frag.antialiased = true
		frag.default_color = Color(RUNE_COLOR.r, RUNE_COLOR.g, RUNE_COLOR.b, RUNE_PEAK_ALPHA)
		var center_angle: float = (TAU / float(RUNE_FRAGMENT_COUNT)) * float(i)
		var frag_pts: PackedVector2Array = PackedVector2Array()
		# Sample 6 points along each arc — enough for a smooth curve.
		for j in range(6):
			var t: float = float(j) / 5.0
			var a: float = center_angle - (RUNE_FRAGMENT_ARC * 0.5) + t * RUNE_FRAGMENT_ARC
			frag_pts.append(Vector2(cos(a), sin(a)) * RUNE_FRAGMENT_RADIUS)
		frag.points = frag_pts
		_rune_group.add_child(frag)
		_rune_fragments.append(frag)

	# Rising embers — sparse CPUParticles2D. The user spec said "small
	# ember/spark particles rising from the center" — keep them small +
	# few + slow. Negative gravity for the rising motion.
	_embers = CPUParticles2D.new()
	_embers.emitting = true
	_embers.amount = EMBER_AMOUNT
	_embers.lifetime = EMBER_LIFETIME
	_embers.preprocess = 0.4   # half-prewarmed so first frame isn't empty
	_embers.randomness = 0.55
	_embers.emission_shape = CPUParticles2D.EMISSION_SHAPE_SPHERE
	_embers.emission_sphere_radius = EMBER_SPAWN_RADIUS
	_embers.direction = Vector2(0, -1)
	_embers.spread = 25.0
	_embers.initial_velocity_min = EMBER_VELOCITY_MIN
	_embers.initial_velocity_max = EMBER_VELOCITY_MAX
	_embers.gravity = Vector2(0, EMBER_GRAVITY)
	_embers.scale_amount_min = 1.0
	_embers.scale_amount_max = 1.8
	var ember_grad: Gradient = Gradient.new()
	# Start at theme color, fade through magenta, end transparent.
	ember_grad.add_point(0.0, _portal_color(_theme_color, EMBER_PEAK_ALPHA))
	ember_grad.add_point(0.6, Color(0.75, 0.40, 0.85, 0.35))
	ember_grad.add_point(1.0, Color(0.50, 0.25, 0.65, 0.0))
	_embers.color_ramp = ember_grad
	_embers.z_index = EMBER_Z_INDEX
	add_child(_embers)

# Mix a theme color with the portal-purple base so dark-ambient rooms
# (ossuary cold-grey, ember warm-orange) still get a recognizable portal
# but the tint nudges biome-specific. Returns the mixed color with
# the requested alpha applied.
func _portal_color(theme: Color, target_alpha: float) -> Color:
	var base: Color = Color(0.55, 0.25, 0.75)
	return Color(
		base.r * 0.65 + theme.r * 0.35,
		base.g * 0.65 + theme.g * 0.35,
		base.b * 0.65 + theme.b * 0.35,
		target_alpha,
	)

# Set every visual element's alpha multiplier — used for the unified
# fade-in/out across phase transitions. Each element already has its
# own target alpha embedded in its color/gradient; this multiplies on
# top via the node's modulate.a, leaving the base color intact.
func _set_all_alpha(m: float) -> void:
	for line in _crack_lines:
		if line != null:
			line.modulate.a = m
	if _inner_glow != null:
		_inner_glow.modulate.a = m
	if _rune_group != null:
		_rune_group.modulate.a = m
	if _embers != null:
		_embers.modulate.a = m

# ─── Tick ─────────────────────────────────────────────────────────
func _process(delta: float) -> void:
	_phase_elapsed += delta
	if _pulse_remaining > 0.0:
		_pulse_remaining = max(0.0, _pulse_remaining - delta)
	# Rune fragments rotate continuously in every phase — gives the
	# portal a "thing is happening" baseline without being distracting.
	if _rune_group != null:
		_rune_group.rotation += RUNE_ROTATION_SPEED * delta
	match _phase:
		Phase.TELEGRAPH:
			_tick_telegraph()
		Phase.ACTIVE:
			_tick_active()
		Phase.COLLAPSE:
			_tick_collapse()

# TELEGRAPH — alpha + scale ease in from hidden state. The fade is
# slow enough to give the player time to read "danger here in ~0.6 s"
# without snapping in like a notification.
func _tick_telegraph() -> void:
	var t: float = clampf(_phase_elapsed / TELEGRAPH_DURATION, 0.0, 1.0)
	var ease_out: float = 1.0 - pow(1.0 - t, 2.0)
	_set_all_alpha(ease_out)
	scale = Vector2(0.85 + 0.15 * ease_out, 0.85 + 0.15 * ease_out)
	if _phase_elapsed >= TELEGRAPH_DURATION:
		_phase = Phase.ACTIVE
		_phase_elapsed = 0.0
		scale = Vector2(1.0, 1.0)

# ACTIVE — steady display with subtle breathing on the inner glow.
# emit_enemy() puts a brief brightness pulse on top via _pulse_remaining.
func _tick_active() -> void:
	# Base alpha 1.0 (full visibility per element's own alpha).
	_set_all_alpha(1.0)
	# Inner glow breathes ±0.08 alpha via sine — subtle, not a strobe.
	if _inner_glow != null:
		var breathe: float = sin(_phase_elapsed * TAU * GLOW_BREATHE_HZ) * GLOW_BREATHE_AMP
		var pulse: float = _pulse_brightness()   # 0..1
		var alpha: float = INNER_GLOW_PEAK_ALPHA + breathe + pulse * 0.25
		_inner_glow.color = _portal_color(_theme_color, clampf(alpha, 0.0, 1.0))
		var s: float = 1.0 + pulse * 0.10   # 1.0 → 1.10 → 1.0 on emit
		_inner_glow.scale = Vector2(s, s)

# COLLAPSE — fade everything out + shrink slightly, then queue_free.
func _tick_collapse() -> void:
	var t: float = clampf(_phase_elapsed / COLLAPSE_DURATION, 0.0, 1.0)
	var ease_in: float = pow(t, 1.6)
	var inv: float = 1.0 - ease_in
	_set_all_alpha(inv)
	scale = Vector2(1.0 - ease_in * 0.3, 1.0 - ease_in * 0.3)
	if t >= 1.0:
		queue_free()

# Returns 0..1 brightness multiplier for the current pulse, decaying
# linearly over SPAWN_PULSE_DURATION since the most recent emit_enemy().
func _pulse_brightness() -> float:
	if SPAWN_PULSE_DURATION <= 0.0:
		return 0.0
	return _pulse_remaining / SPAWN_PULSE_DURATION
