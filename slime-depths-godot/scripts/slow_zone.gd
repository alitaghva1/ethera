# SlowZone — iter 31. Passive Area2D hazard. Does no damage; instead
# halves the hero's walk speed while they stand inside. Visually a
# pooled mire patch on the floor (greenish, with a slow bubbling
# pulse) so the player reads "swamp, slows you" at a glance.
#
# Design rationale:
#   - Spike pits and fire jets demand AVOIDANCE under threat of
#     damage. Slow zones do the same WITHOUT punishing miscalculation
#     with HP loss — they punish with positioning vulnerability
#     (slow = easier to hit by enemies, harder to dodge projectiles).
#   - Stacks via hero.enter_slow_zone / exit_slow_zone counters so
#     two overlapping zones don't fight each other.
#   - Pulses surface bubbles via shader-free Polygon2D ripple ring
#     (a slow alpha sin-wave) so the zone reads as ACTIVE, not
#     static decor.
extends Area2D

# 50% walk speed inside. Tested at 0.5: feels "stuck in tar" without
# being totally helpless — the player can still strafe / kite.
const SLOW_MULTIPLIER: float = 0.5

var _hero: Node2D = null
var _hero_inside: bool = false

# Visual pulse — modulate the ripple ring alpha with sin(_t * 2).
var _t: float = 0.0
@onready var _ripple: Polygon2D = $RippleRing
@onready var _bubble_a: Polygon2D = $BubbleA
@onready var _bubble_b: Polygon2D = $BubbleB
# Iter-readability additions: footprint halo (wider faint outer disc to
# show the field's reach) + swirl wrapper (rotated slowly so the zone
# reads as MAGIC field, not static decor).
@onready var _footprint_halo: Polygon2D = $FootprintHalo
@onready var _swirl: Node2D = $Swirl

func _ready() -> void:
	body_entered.connect(_on_body_entered)
	body_exited.connect(_on_body_exited)

func _physics_process(delta: float) -> void:
	_t += delta
	# Ripple — alpha + scale sin-wave. Slow (period ~3.5s) so the
	# pulse reads as "thick liquid breathing" not "alarm strobe".
	var pulse: float = 0.5 + 0.5 * sin(_t * 1.8)
	_ripple.modulate.a = 0.35 + 0.35 * pulse
	var s: float = 0.92 + 0.10 * pulse
	_ripple.scale = Vector2(s, s)
	# Bubbles — offset phases so they rise out of sync.
	_bubble_a.modulate.a = 0.4 + 0.4 * sin(_t * 2.1)
	_bubble_b.modulate.a = 0.4 + 0.4 * sin(_t * 2.7 + 1.5)
	# Footprint halo — very slow alpha breathe so the OUTER edge of the
	# field is readable from a distance. Slower than the ripple so the
	# two pulses don't sync up and feel mechanical.
	if _footprint_halo != null:
		var hpulse: float = 0.5 + 0.5 * sin(_t * 1.1)
		_footprint_halo.modulate.a = 0.55 + 0.45 * hpulse
	# Swirl rotation — clockwise, ~0.7 rad/s. Slow enough to read as
	# "thick magic stirring," fast enough to never look static. The
	# wisps trace a ring just inside the pool rim.
	if _swirl != null:
		_swirl.rotation += 0.7 * delta

func _on_body_entered(body: Node) -> void:
	if body.is_in_group("hero") and body.has_method("enter_slow_zone"):
		_hero = body
		_hero_inside = true
		body.enter_slow_zone(SLOW_MULTIPLIER)

func _on_body_exited(body: Node) -> void:
	if body.is_in_group("hero") and body.has_method("exit_slow_zone"):
		_hero_inside = false
		body.exit_slow_zone(SLOW_MULTIPLIER)

# If the slow zone is freed (room cleared) while hero is inside, the
# body_exited signal does NOT fire automatically — undo the slow
# manually to avoid leaving the hero stuck at half-speed.
func _exit_tree() -> void:
	if _hero_inside and _hero != null and is_instance_valid(_hero) and _hero.has_method("exit_slow_zone"):
		_hero.exit_slow_zone(SLOW_MULTIPLIER)
