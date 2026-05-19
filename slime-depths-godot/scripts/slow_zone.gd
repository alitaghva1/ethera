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

# Iter 182 — proximity emphasis. When the hero is close (within
# PROXIMITY_WAKE_RADIUS), the zone visually "wakes up" — ripple alpha
# multiplier goes 0.7 → 1.0, swirl spins faster, footprint halo pulses
# harder. Signals "you're entering a hazard" before the player crosses
# the threshold. Hades + Isaac both use this proximity-build pattern.
# Radius is in world pixels — slow zones are usually ~72 px radius so
# 120 gives the player about half-a-zone-width of "warning" approach.
const PROXIMITY_WAKE_RADIUS: float = 120.0
const PROXIMITY_BOOST_MAX: float = 1.0  # full boost at distance 0
const PROXIMITY_BOOST_MIN: float = 0.0  # no boost at or past radius
# Smoothed proximity factor — eased toward target each frame so we
# don't strobe when the hero is hovering at the radius edge.
var _proximity_factor: float = 0.0

func _ready() -> void:
	body_entered.connect(_on_body_entered)
	body_exited.connect(_on_body_exited)

func _physics_process(delta: float) -> void:
	_t += delta
	# Iter 182 — compute proximity factor 0..1 based on hero distance.
	# Resolve hero lazily so we don't depend on body_entered (the hero
	# can be at the proximity radius without being inside the zone).
	if _hero == null or not is_instance_valid(_hero):
		_hero = _resolve_hero()
	var target_proximity: float = 0.0
	if _hero != null and is_instance_valid(_hero):
		var dist: float = _hero.global_position.distance_to(global_position)
		if dist < PROXIMITY_WAKE_RADIUS:
			target_proximity = 1.0 - (dist / PROXIMITY_WAKE_RADIUS)
	# Smooth toward target so transitions feel like a "wake-up" not a
	# step function. 6 = ~0.16s time-to-converge — fast enough to feel
	# responsive, slow enough to feel like the zone is "noticing" you.
	_proximity_factor = lerp(_proximity_factor, target_proximity, clampf(delta * 6.0, 0.0, 1.0))
	# Ripple — alpha + scale sin-wave. Slow (period ~3.5s) so the
	# pulse reads as "thick liquid breathing" not "alarm strobe".
	# Iter 182 — proximity boosts the ripple's peak alpha (max +0.25)
	# so the hazard reads brighter as the hero closes in.
	var pulse: float = 0.5 + 0.5 * sin(_t * 1.8)
	var prox_boost: float = _proximity_factor * 0.25
	_ripple.modulate.a = 0.35 + 0.35 * pulse + prox_boost
	var s: float = 0.92 + 0.10 * pulse + _proximity_factor * 0.06
	_ripple.scale = Vector2(s, s)
	# Bubbles — offset phases so they rise out of sync.
	_bubble_a.modulate.a = 0.4 + 0.4 * sin(_t * 2.1)
	_bubble_b.modulate.a = 0.4 + 0.4 * sin(_t * 2.7 + 1.5)
	# Footprint halo — very slow alpha breathe so the OUTER edge of the
	# field is readable from a distance. Slower than the ripple so the
	# two pulses don't sync up and feel mechanical. Iter 182 — proximity
	# also boosts the halo so the hazard footprint is OBVIOUS when the
	# hero is approaching.
	if _footprint_halo != null:
		var hpulse: float = 0.5 + 0.5 * sin(_t * 1.1)
		_footprint_halo.modulate.a = 0.55 + 0.45 * hpulse + _proximity_factor * 0.30
	# Swirl rotation — clockwise, ~0.7 rad/s. Slow enough to read as
	# "thick magic stirring," fast enough to never look static. The
	# wisps trace a ring just inside the pool rim. Iter 182 — proximity
	# speeds up the swirl (max 2× speed at distance 0) so the field
	# reads as ACTIVELY churning when you're about to step in.
	if _swirl != null:
		_swirl.rotation += (0.7 + _proximity_factor * 0.7) * delta

# Lazy hero resolution — searches the scene tree once and caches. Group
# membership is set on hero.tscn ("hero" group); using groups avoids the
# autoload coupling that find_child would require.
func _resolve_hero() -> Node2D:
	var t: SceneTree = get_tree()
	if t == null:
		return null
	var heroes: Array[Node] = t.get_nodes_in_group("hero")
	if heroes.is_empty():
		return null
	var h: Node = heroes[0]
	if h is Node2D:
		return h as Node2D
	return null

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
