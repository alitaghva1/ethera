# ParryShield — iter 94 rewrite.
#
# Previous iterations (29 → 73 → 87): a kite-silhouette shield IN FRONT
# of the hero with BeamFan reflect beams, plus a parry_burst sprite-sheet
# activation flash on top. User feedback: "the parry/shield are a bit
# much, lets just keep a shield or parry." Iter-94 collapses both visuals
# into a single procedural BUBBLE AURA centered on the hero — a soft
# cyan sphere that wraps the body during the parry window.
#
# Rendering: a single Node2D with a custom _draw() overlay. Three
# concentric layers:
#   1. Outer halo  — wide soft cyan disk (alpha ~0.18) — the "field"
#   2. Inner core  — narrower cyan-white disk (alpha ~0.35)
#   3. Rim arc     — a thin bright cyan circle outline (the "skin" of
#                    the bubble)
#
# Drawing them via draw_circle / draw_arc avoids the Polygon2D vertex
# tax of approximating a circle with many points + keeps the script the
# only authoritative source for the visual (no scene-vs-code drift).
#
# Lifecycle (same API as before so hero.gd doesn't change):
#   • _start_parry → instantiate, setup(aim), parent to scene, retain
#   • _process pulses scale + alpha on PULSE_HZ sine for ALIVE_TIME
#   • If the parry window ends without a catch → natural fade-out via
#     FADE_TIME tail.
#   • If a hit is caught → shatter() tweens scale to 1.6× and alpha to
#     0 over 0.18s, then queue_free. "The bubble burst outward, deflecting."
extends Node2D

const ALIVE_TIME: float = 0.30   # parry_window 0.20 + 0.10 fadeout
const FADE_TIME: float = 0.10

# Bubble radii — the rim sits at BUBBLE_RADIUS; halo extends ~15% past
# it (soft outer glow); core is ~85% inside (brighter inner pool). Tuned
# so the bubble visually wraps the hero's ~28-px-tall draw silhouette
# from chest down (parent positions us at chest height via VFX_HEIGHT_OFFSET).
const BUBBLE_RADIUS: float = 32.0

# Pulse parameters — gentle "channeling" pulse on top of the static
# bubble. PULSE_HZ matches the legacy shield so the feel is unchanged.
const PULSE_HZ: float = 6.0
const PULSE_SCALE_AMP: float = 0.05
const PULSE_ALPHA_AMP: float = 0.10

# Per-layer base alphas. Halo is softer (it's the diffuse glow), core
# is mid (the "inside" of the bubble), rim is brightest (the surface).
const HALO_BASE_ALPHA: float = 0.20
const CORE_BASE_ALPHA: float = 0.35
const RIM_BASE_ALPHA: float = 0.92

# Color anchors — cool cyan, distinct from the warm gold of the hero
# theme palette. Matches the dodge/iframe color family.
const HALO_COLOR: Color = Color(0.50, 0.95, 1.00, 1.0)
const CORE_COLOR: Color = Color(0.78, 1.00, 1.00, 1.0)
const RIM_COLOR: Color  = Color(0.85, 1.00, 1.00, 1.0)

# Arc resolution for the rim outline — 48 segments around the full
# circle. At 32-px radius that's well below pixel resolution per segment;
# the outline looks smooth without burning vertices.
const RIM_SEGMENTS: int = 48
const RIM_WIDTH: float = 2.5

var _elapsed: float = 0.0
var _shattered: bool = false
# Override scale tween from shatter() needs to stamp on the actual
# transform; pulse multiplies against this stored base so shatter
# expands the bubble cleanly to (BASE * 1.6).
var _shatter_scale_active: bool = false

# setup(aim) preserved for API compatibility. The bubble is rotationally
# symmetric so aim direction has no visible effect, but the parameter
# stays so hero.gd's existing call site (parry_shield_ref.setup(aim))
# remains valid.
func setup(_aim: Vector2) -> void:
	pass

func _ready() -> void:
	# z_index 2 — same standard FX layer as the legacy kite shield.
	# Bubble draws above floor regardless of which sub-room hosts it.
	z_index = 2
	# Kick the redraw cycle so _draw() runs every frame for the pulse.
	set_process(true)

func _process(delta: float) -> void:
	_elapsed += delta
	if _shattered:
		# shatter()'s tween owns scale + modulate while shattering;
		# _process still ticks to allow draws to refresh but doesn't
		# fight the tween.
		queue_redraw()
		return
	if _elapsed >= ALIVE_TIME:
		queue_free()
		return
	queue_redraw()

func _draw() -> void:
	# Compute fade tail and pulse multiplier.
	var fade: float = 1.0
	if not _shattered:
		var time_left: float = ALIVE_TIME - _elapsed
		if time_left < FADE_TIME:
			fade = clampf(time_left / FADE_TIME, 0.0, 1.0)
	# Wall-clock pulse (same convention as legacy parry_shield) so the
	# pulse rhythm reads at a consistent tempo even during PARRY_HIT_SLOWMO.
	var t: float = Time.get_ticks_msec() / 1000.0
	var pulse: float = sin(t * TAU * PULSE_HZ)
	var s: float = 1.0 + PULSE_SCALE_AMP * pulse
	var pulse_alpha: float = 1.0 + PULSE_ALPHA_AMP * pulse

	var r: float = BUBBLE_RADIUS * s
	# Layered draws, back to front: outer halo → core → rim outline.
	draw_circle(Vector2.ZERO, r * 1.15, Color(HALO_COLOR.r, HALO_COLOR.g, HALO_COLOR.b, HALO_BASE_ALPHA * pulse_alpha * fade))
	draw_circle(Vector2.ZERO, r * 0.85, Color(CORE_COLOR.r, CORE_COLOR.g, CORE_COLOR.b, CORE_BASE_ALPHA * pulse_alpha * fade))
	draw_arc(Vector2.ZERO, r, 0.0, TAU, RIM_SEGMENTS, Color(RIM_COLOR.r, RIM_COLOR.g, RIM_COLOR.b, RIM_BASE_ALPHA * pulse_alpha * fade), RIM_WIDTH, true)

# Called by hero.gd when the parry catches an incoming hit. Tweens the
# whole node's scale to 1.6× while fading its modulate alpha to 0 over
# 0.18s; then queue_free's. The _draw layers ride the scale/modulate
# tween automatically — no special teardown path required.
func shatter() -> void:
	if _shattered:
		return
	_shattered = true
	_shatter_scale_active = true
	var tw: Tween = create_tween().set_parallel(true)
	tw.tween_property(self, "scale", scale * 1.6, 0.18).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tw.tween_property(self, "modulate:a", 0.0, 0.18)
	tw.chain().tween_callback(queue_free)
