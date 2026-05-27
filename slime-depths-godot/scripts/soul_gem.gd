# iter-242 / Loop Tightening LEVER 1 — per-kill soul gem.
#
# Why this exists: the loop diagnosis profiled that every kill produces
# hit-feedback (damage number, blood, shake, audio) but NOTHING the player
# can pick up between kills. Vampire Survivors / Risk of Rain / Hades / BoI
# all emit a small collectible per kill that gravitates to the player. The
# tactile grammar of "kill → tiny collectible spawns → flies to me → my
# count goes up" is what makes those loops feel kinetic. We don't need an
# XP-leveling system to ship that grammar — just the collectible itself.
#
# Visual: 8×8 violet/cyan diamond (Polygon2D, no texture). Reads as a soul
# essence wisp consistent with Ethera's dark-fantasy palette. After a brief
# pause the gem starts gravitating toward the hero with accelerating speed
# (the Risk-of-Rain-style "magnet pull" feel). On hero contact: queue_free,
# bump GameState.session_kills (already tracked), play gem_pickup chime.
#
# Note: gems are decoupled from XP / leveling on purpose. session_kills is
# already a lifetime counter and there's no level system to feed; the gem
# is pure tactile feedback. A future XP system can read session_kills or
# add a separate hero_xp field without changing this scene's contract.

extends Node2D
class_name SoulGem

# Magnetism — pre-pull delay then accelerating attraction. Pre-pull avoids
# the gem snapping to the hero before it's visibly spawned. After 0.15 s
# the magnet engages and speed ramps from MAGNET_START up to MAGNET_MAX
# over the gem's lifetime. MAGNET_MAX is fast enough that even at the
# 1280×768 viewport edge the gem reaches the hero in under a second.
const PRE_PULL_DELAY: float = 0.15
const MAGNET_START: float = 80.0
const MAGNET_MAX: float = 760.0
const MAGNET_ACCEL: float = 1600.0
# Pickup happens when the gem is within this radius. Comfortably wider than
# the hero collider (~14 px) so the player doesn't need pixel-precise pass
# through the gem.
const PICKUP_RADIUS: float = 28.0
# Lifetime safety — a gem with no hero reference (test scenes, hero died
# mid-flight) self-frees after this so it doesn't leak into the SceneTree.
const SAFETY_LIFETIME: float = 8.0

var _speed: float = MAGNET_START
var _elapsed: float = 0.0
var _hero_ref: Node2D = null
# Locked once we begin gravitating so the speed curve is monotonic even if
# the hero teleports (dash, veilstep, room load between kills).
var _magnet_active: bool = false
# Set externally by main.gd's spawner so we play the chime AFTER the gem
# reaches the player. If null, we still queue_free silently on contact.
var _audio_ref: Node = null

func _ready() -> void:
	# Tiny diamond polygon — 8×8 violet/cyan two-tone. Built procedurally
	# so we don't need an asset import for an 8-px shape. The polygon is
	# centered on origin so global_position == gem center.
	var poly := Polygon2D.new()
	poly.polygon = PackedVector2Array([
		Vector2(0, -5),   # top point
		Vector2(4, 0),    # right point
		Vector2(0, 5),    # bottom point
		Vector2(-4, 0),   # left point
	])
	# Cool violet-cyan gradient for "soul essence" feel. Slightly biased
	# toward violet because pure cyan reads "ice" against the dark-fantasy
	# rooms; violet sits between the cool-magic family and the warm gold
	# of the relic strip. Matches the Ascendance SHADOW theme tint.
	poly.color = Color(0.72, 0.62, 1.0, 1.0)
	add_child(poly)
	# A tiny inner highlight for readability against dark floors. Single
	# white pixel cluster pulled toward the top of the diamond — same
	# gestural trick Hades / Hyper Light use on small VFX shapes.
	var highlight := Polygon2D.new()
	highlight.polygon = PackedVector2Array([
		Vector2(0, -3), Vector2(1, -2), Vector2(0, -1), Vector2(-1, -2),
	])
	highlight.color = Color(0.95, 0.92, 1.0, 0.85)
	add_child(highlight)
	# Lift gem above the floor a touch so it doesn't get buried in floor
	# decor on dense rooms. Slightly above ground but below hero (which
	# typically sits z=10).
	z_index = 4
	# Auto-clean after SAFETY_LIFETIME no matter what — guard against
	# orphaned gems that lose their hero target (room transitions etc).
	var timer := get_tree().create_timer(SAFETY_LIFETIME)
	timer.timeout.connect(_self_destruct)
	# Tiny initial scatter pop — gem appears at the kill site then drifts
	# outward briefly before gravitating. Reads as an "ejected essence"
	# rather than a teleported pickup. 30 px in 0.15 s easing out.
	var pop_dir: Vector2 = Vector2.from_angle(randf() * TAU)
	var target_pop: Vector2 = global_position + pop_dir * 30.0
	var tw: Tween = create_tween()
	tw.tween_property(self, "global_position", target_pop, PRE_PULL_DELAY)\
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)

func bind(hero: Node2D, audio: Node = null) -> void:
	# Called by the spawner immediately after add_child. Stores refs the
	# gem polls each physics frame to track gravitation + emit audio.
	_hero_ref = hero
	_audio_ref = audio

func _physics_process(delta: float) -> void:
	_elapsed += delta
	if _elapsed < PRE_PULL_DELAY:
		return
	if _hero_ref == null or not is_instance_valid(_hero_ref):
		return
	_magnet_active = true
	# Ramp speed each frame so the gem accelerates instead of snapping at
	# constant velocity. Capped at MAGNET_MAX so we don't tunnel past the
	# hero on long-distance pulls.
	_speed = min(MAGNET_MAX, _speed + MAGNET_ACCEL * delta)
	var to_hero: Vector2 = _hero_ref.global_position - global_position
	var dist: float = to_hero.length()
	if dist <= PICKUP_RADIUS:
		_on_collected()
		return
	# Move toward the hero. We use a unit-vector step so direction stays
	# stable as the hero moves; long-distance frames may step further than
	# `dist` so cap to `dist - 1` so we don't overshoot.
	var step: float = min(_speed * delta, dist - 1.0)
	if step <= 0.0:
		_on_collected()
		return
	global_position += to_hero.normalized() * step

# Pickup resolution — bump the lifetime kill counter (already tracked by
# GameState; we just emit it here so kills made BEFORE gem collection don't
# double-count), play the chime, free the gem. Note: session_kills is
# bumped at enemy-death time in main.gd::_on_enemy_died; the gem's pickup
# fires the AUDIBLE cue but does not add to the kill total. Wiring it that
# way means a gem orphaned by safety timeout doesn't lose its kill from
# the counter.
func _on_collected() -> void:
	if _audio_ref != null and is_instance_valid(_audio_ref):
		if _audio_ref.has_method("_play"):
			_audio_ref._play("gem_pickup", global_position, -8.0)
	queue_free()

func _self_destruct() -> void:
	# Final fallback so an orphan gem (hero died before pickup, scene
	# teardown mid-flight) doesn't linger in the SceneTree.
	if is_instance_valid(self):
		queue_free()
