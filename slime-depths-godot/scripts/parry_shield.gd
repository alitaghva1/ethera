# ParryShield — iter 29. Kite-silhouette shield that appears in front
# of the hero during the parry window. Replaces the iter-25 ring-pulse
# as the primary "I am blocking" visual — the ring reads as OFFENSIVE
# (it expands outward FROM the hero), this shape reads as DEFENSIVE
# (it sits IN FRONT of the hero, oriented toward the threat).
#
# Lifecycle:
#   _start_parry (hero.gd) instantiates this scene, calls setup(aim),
#   parents to current_scene. The shield lives ALIVE_TIME seconds with
#   a steady pulse on _process — alpha breathes 0.85..1.0, scale
#   1.0..1.05 on a 6-Hz sine so it reads as "actively channeling."
#   When the parry window ends WITHOUT a catch, the shield fades out
#   over the natural ALIVE_TIME.
#
#   If the parry CATCHES a hit, hero.gd calls shatter() on the active
#   shield instance. shatter() tweens scale to 1.6× while fading
#   alpha to 0 over 0.18s — "the shield deflected and dispersed."
extends Node2D

const ALIVE_TIME: float = 0.30   # parry_window 0.20 + 0.10 fadeout
const FADE_TIME: float = 0.10
const PULSE_HZ: float = 6.0
const PULSE_ALPHA_AMP: float = 0.08
const PULSE_SCALE_AMP: float = 0.025

# Offset distance from the hero — shield sits ~36 px in front so it
# visually decouples from the body and reads as a deliberate guard
# position. Caller (hero.gd) anchors this node at the hero's chest;
# setup() adds the forward offset.
const FORWARD_OFFSET: float = 36.0

var _elapsed: float = 0.0
var _shattered: bool = false
# Cached base alpha so the pulse modulates RELATIVE to whatever the
# shield's natural opacity is rather than overwriting it.
var _base_modulate: Color = Color(1, 1, 1, 1)

func setup(aim: Vector2) -> void:
	# Orient + offset the shield so it sits in front of the hero. The
	# Halo/Core/Boss verts are authored pointing +X, so rotation =
	# aim.angle() puts the tip toward the aim direction. Position is
	# nudged forward along the aim vector so the shield doesn't sit ON
	# the hero's body.
	if aim.length_squared() > 0.0001:
		var dir: Vector2 = aim.normalized()
		rotation = dir.angle()
		position += dir * FORWARD_OFFSET

func _ready() -> void:
	# Iter 69 — z_index 2 keeps the shield on the standard FX layer.
	# The kite silhouette sits IN FRONT of the hero spatially (offset
	# by FORWARD_OFFSET) so the z bump just guarantees it draws above
	# the floor regardless of which sub-room it's spawned into.
	z_index = 2
	_base_modulate = modulate

func _process(delta: float) -> void:
	_elapsed += delta
	# After ALIVE_TIME the shield dies naturally (unless shatter() was
	# called externally, which marks _shattered and queue_frees on its
	# own timer).
	if _shattered:
		return
	if _elapsed >= ALIVE_TIME:
		queue_free()
		return
	# Pulse — sin-driven scale + alpha so the shield reads as "actively
	# channeling magical energy," not a static decal.
	var t: float = Time.get_ticks_msec() / 1000.0
	var pulse: float = sin(t * TAU * PULSE_HZ)
	var s: float = 1.0 + PULSE_SCALE_AMP * pulse
	scale = Vector2(s, s)
	var a: float = clampf(_base_modulate.a + PULSE_ALPHA_AMP * pulse, 0.0, 1.0)
	# Fade-out tail in the final FADE_TIME — eases the shield off-screen
	# rather than snapping it away on the ALIVE_TIME boundary.
	var time_left: float = ALIVE_TIME - _elapsed
	if time_left < FADE_TIME:
		a *= time_left / FADE_TIME
	modulate = Color(_base_modulate.r, _base_modulate.g, _base_modulate.b, a)

# Called by hero.gd when the parry catches an incoming hit. Tweens the
# shield to scale 1.6× while fading alpha to 0 over 0.18s. After the
# tween, queue_free's. Idempotent — multiple calls in the same frame
# (e.g. two hits caught in the same window) are no-ops after the first.
func shatter() -> void:
	if _shattered:
		return
	_shattered = true
	var tw: Tween = create_tween().set_parallel(true)
	tw.tween_property(self, "scale", scale * 1.6, 0.18).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tw.tween_property(self, "modulate:a", 0.0, 0.18)
	tw.chain().tween_callback(queue_free)
