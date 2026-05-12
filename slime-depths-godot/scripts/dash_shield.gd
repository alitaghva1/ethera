# DashShield — iter 94. Forward-facing energy shield that rides with the
# hero during a dash strike.
#
# Companion to dash_trail.tscn (the particle trail BEHIND the hero):
# user feedback was that the dash strike should read as "a shield effect
# with a particle effect behind it as it shoots you in the direction of
# the strike." dash_trail already supplied the particles. dash_shield
# supplies the leading shield.
#
# Visual:
#   • A cyan-gold bubble positioned ~28 px in front of the hero along
#     the dash direction (the "ram face" of the dash).
#   • Three-layer composition same as parry_shield (halo + core + rim)
#     but with a faster pulse (10 Hz vs. 6 Hz) so it reads as "speed"
#     rather than "channeling."
#   • Warmer tint (gold-cyan) vs. parry's pure cyan, so a glance at the
#     two effects in motion reveals which mechanic just fired.
#
# Lifecycle:
#   • _start_dash_strike (hero.gd) instantiates and parents as a CHILD
#     of the hero. Parenting (rather than free-floating in current_scene)
#     means the shield follows the hero's transform automatically across
#     the dash motion — no per-frame position sync needed.
#   • setup(aim) stores the dash direction; _ready() applies it to local
#     position + rotation.
#   • _process pulses the visual and queue_free's at LIFETIME.
extends Node2D

# DASH_STRIKE_DURATION in hero.gd is 0.28s. We outlive it by 60 ms so
# the trailing edge fades cleanly past the moment-of-impact rather than
# popping out mid-dash.
const LIFETIME: float = 0.34
const FADE_TIME: float = 0.12

# How far in front of the hero the shield sits. ATTACK_RANGE is 56 in
# hero.gd; 28 px puts the shield half-range out — close enough to read
# as "attached to the hero," far enough to read as "leading edge."
const FORWARD_OFFSET: float = 28.0

# Bubble shape — slightly smaller than the parry bubble (the dash
# shield is the leading face, parry is the full wrap). 24-px rim radius
# vs. parry's 32.
const BUBBLE_RADIUS: float = 24.0

# Faster pulse than parry (10 Hz vs. 6 Hz) — "speed" rhythm.
const PULSE_HZ: float = 10.0
const PULSE_SCALE_AMP: float = 0.06
const PULSE_ALPHA_AMP: float = 0.12

const HALO_BASE_ALPHA: float = 0.22
const CORE_BASE_ALPHA: float = 0.40
const RIM_BASE_ALPHA: float = 0.95

# Warmer than parry — gold-cyan blend, distinct visual identity.
const HALO_COLOR: Color = Color(0.78, 0.92, 1.00, 1.0)
const CORE_COLOR: Color = Color(0.95, 0.96, 0.86, 1.0)
const RIM_COLOR: Color  = Color(1.00, 0.90, 0.62, 1.0)

const RIM_SEGMENTS: int = 36
const RIM_WIDTH: float = 2.2

var _elapsed: float = 0.0
# Cached aim direction so _ready can place us correctly even though
# setup() is called BEFORE _ready in the standard spawn pattern.
var _aim: Vector2 = Vector2.RIGHT

func setup(aim: Vector2) -> void:
	if aim.length_squared() > 0.0001:
		_aim = aim.normalized()

func _ready() -> void:
	# z_index 3 — one above parry_shield's 2 so the dash shield reads
	# in front of any concurrent FX. Still well below the hero's draw
	# layer (the parent transforms anchor us to the hero anyway).
	z_index = 3
	# Add the aim-forward offset on top of whatever local position the
	# caller set (hero.gd anchors us at chest height Vector2(0, -28)).
	# Combined result: shield sits 28 px forward + 28 px above hero feet,
	# which lands it visually IN FRONT OF the hero's chest.
	position += _aim * FORWARD_OFFSET
	# Rotation isn't visually important (bubble is rotationally symmetric)
	# but apply it anyway so future asymmetric tweaks (e.g. a wedge front)
	# inherit the correct facing.
	rotation = _aim.angle()
	set_process(true)

func _process(delta: float) -> void:
	_elapsed += delta
	if _elapsed >= LIFETIME:
		queue_free()
		return
	queue_redraw()

func _draw() -> void:
	# Compute fade tail.
	var fade: float = 1.0
	var time_left: float = LIFETIME - _elapsed
	if time_left < FADE_TIME:
		fade = clampf(time_left / FADE_TIME, 0.0, 1.0)
	var t: float = Time.get_ticks_msec() / 1000.0
	var pulse: float = sin(t * TAU * PULSE_HZ)
	var s: float = 1.0 + PULSE_SCALE_AMP * pulse
	var pulse_alpha: float = 1.0 + PULSE_ALPHA_AMP * pulse
	var r: float = BUBBLE_RADIUS * s

	draw_circle(Vector2.ZERO, r * 1.18, Color(HALO_COLOR.r, HALO_COLOR.g, HALO_COLOR.b, HALO_BASE_ALPHA * pulse_alpha * fade))
	draw_circle(Vector2.ZERO, r * 0.82, Color(CORE_COLOR.r, CORE_COLOR.g, CORE_COLOR.b, CORE_BASE_ALPHA * pulse_alpha * fade))
	draw_arc(Vector2.ZERO, r, 0.0, TAU, RIM_SEGMENTS, Color(RIM_COLOR.r, RIM_COLOR.g, RIM_COLOR.b, RIM_BASE_ALPHA * pulse_alpha * fade), RIM_WIDTH, true)
