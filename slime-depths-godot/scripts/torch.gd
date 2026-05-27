# Torch — flickering warm PointLight2D + a small flame Sprite2D-stub.
#
# Why this is here: the single biggest visual upgrade Godot gives us
# vs the JS canvas is real-time 2D lighting. Each torch is one node
# with built-in radial gradient + energy modulation. In the JS game,
# slime-depths/src/room.js paints torches via canvas radialGradient
# every frame with manual flicker math — works, but expensive +
# code-heavy. Godot does it natively + correctly z-ordered.
#
# Flicker model: layered sin waves at different periods + tiny
# random per-frame jitter. The same recipe slime-depths uses in
# main.js torch rendering, ported to GDScript.
#
# iter-256 / Wave 5B — DESTRUCTIBLE lanterns. Torch joins the
# "breakable_lanterns" group at _ready so hero combat (sword Hit 3)
# and projectile.gd (blast impact) can break it. Breaking spawns a
# 40-px fire pool at the torch's position via fire_pool.tscn, then
# tweens the light energy to zero and queues the node for free.
class_name Torch
extends Node2D

# iter-256 / Wave 5B — preload fire_pool so lantern breaks can drop
# a 3s flame pool at their position. Same scene the projectile/melee
# FLAME paths use — keeps the pool's overlap-damage + visual look
# consistent.
const FIRE_POOL_SCENE: PackedScene = preload("res://scenes/fire_pool.tscn")
const MAX_HP: int = 1

# iter-116: BASE_ENERGY 1.40 → 1.55 to match the brighter torch.tscn
# rest pool. Flicker amplitudes scaled up proportionally so the relative
# flicker depth (fast / slow / jitter as % of base) stays the same —
# otherwise torches would feel weirdly stable under the brighter base.
# Iter 187 batch 3 — BUG FOUND: iter-183 item 3 bumped torch.tscn energy
# 1.55 → 1.95, but _process here OVERWRITES light.energy every frame
# with BASE_ENERGY + flicker, ignoring the .tscn value. My iter-183
# torch boost was a no-op at runtime. Fix: bump BASE_ENERGY 1.55 → 1.95
# to match the intended brighter rest pool. Flicker amps scaled +25%
# proportionally so depth holds.
const BASE_ENERGY   := 1.95
const FLICKER_FAST  := 0.25    # high-freq sin amplitude
const FLICKER_SLOW  := 0.14    # low-freq sin amplitude
const JITTER        := 0.07    # per-frame random amplitude

@onready var light: PointLight2D = $PointLight2D
@onready var flame: Sprite2D = $Flame

# Per-torch phase so adjacent torches don't pulse in lockstep.
var _phase := randf() * TAU

# Iter 35 — per-torch dim multiplier. main.gd's dim_lights wave_event
# tweens this from 1.0 down (e.g. 0.45) so the final energy = base +
# flicker, then * energy_mul. Tweening this instead of light.energy
# directly survives _process's per-frame energy assignment.
var energy_mul: float = 1.0

# iter-256 / Wave 5B — destructible state. hp starts at MAX_HP; one
# hit from sword Hit 3 / projectile blast breaks the lantern, spawns
# a fire pool, and queue_frees the node after the energy fade.
var hp: int = MAX_HP
var _broken: bool = false

func _ready() -> void:
	# iter-256 / Wave 5B — register in the "breakable_lanterns" group.
	# Lanterns are NOT in "obstacles" — they're decorative wall sconces
	# the hero walks past freely, only relevant when struck. Group
	# membership is the search key hero combat code iterates.
	add_to_group("breakable_lanterns")

func _process(_delta: float) -> void:
	if _broken:
		return
	var t := Time.get_ticks_msec() / 1000.0
	var fast := sin(t * 9.5 + _phase) * FLICKER_FAST
	var slow := sin(t * 2.7 + _phase * 1.7) * FLICKER_SLOW
	var jitter := randf_range(-JITTER, JITTER)
	light.energy = (BASE_ENERGY + fast + slow + jitter) * energy_mul
	# Flame sprite scales subtly with the brightness for visual coupling.
	var s := 1.0 + (fast + slow) * 0.6
	flame.scale = Vector2(s, s)
	# Iter 187 batch 3 — alpha flicker on the flame sprite. Pre-iter-187
	# the flame's brightness was constant while the light pulsed; eye
	# could see the LIGHT flicker but the source orb stayed static.
	# Now alpha varies ~0.78..1.0 in sync with the brightness curve so
	# the flame visually IS the pulse, not just casting it.
	# Modifies only the alpha channel — RGB is set by main.gd per biome
	# (sanctuary blue-white, ember hot red, etc).
	flame.modulate.a = 0.85 + (fast + slow) * 0.35

# iter-256 / Wave 5B — destructible interface. Called from hero.gd
# _resolve_melee_strike when sword Hit 3 connects, or from
# projectile.gd _on_body_entered when a blast collides with a lantern.
# damage > 0 → drop hp, on hp<=0 spawn fire pool + go dark + free.
func take_hit(damage: int) -> void:
	if _broken:
		return
	hp -= damage
	if hp > 0:
		return
	_broken = true
	# Remove from group so subsequent scans don't re-hit a dying lantern.
	remove_from_group("breakable_lanterns")
	# Spawn a 3s fire pool at this torch's world position. Hosted on
	# our parent (main scene root) so the pool persists after our
	# queue_free. _life override before add_child so fire_pool's
	# _physics_process picks up the 3.0s lifetime. POOL_LIFETIME's
	# default is 2.0, but lantern fires are bigger fuel sources — 3s
	# reads as "this lantern just spilled."
	var host: Node = get_parent()
	if host != null:
		var pool: Node2D = FIRE_POOL_SCENE.instantiate() as Node2D
		if pool != null:
			pool.global_position = global_position
			pool.set("_life", 3.0)
			host.add_child(pool)
	# Spark burst — 8-10 orange particles flying outward as the lantern
	# breaks. Reads as "the flame burst free of its sconce."
	_spawn_spark_burst()
	# Tween the light energy to zero, then queue_free. 0.4s gives the
	# player a moment to see the lantern darken before disappearing.
	if light != null:
		var tw: Tween = create_tween()
		tw.tween_property(light, "energy", 0.0, 0.4)
		# Fade the flame sprite alongside so the source visibly winks out.
		if flame != null:
			tw.parallel().tween_property(flame, "modulate:a", 0.0, 0.4)
		tw.tween_callback(queue_free)
	else:
		queue_free()

# 8-10 orange spark particles flying outward. Mirrors pillar's
# _spawn_chip_burst (tween-per-chip pattern) but with brighter warm
# colors + smaller chips — sparks, not stone.
func _spawn_spark_burst() -> void:
	var host: Node = get_parent()
	if host == null:
		return
	var count: int = randi_range(8, 10)
	for _i in range(count):
		var spark: Polygon2D = Polygon2D.new()
		var sz: float = randf_range(1.4, 2.4)
		spark.polygon = PackedVector2Array([
			Vector2(-sz, 0),
			Vector2(0, -sz),
			Vector2(sz, 0),
			Vector2(0, sz),
		])
		spark.color = Color(1.0, randf_range(0.55, 0.80), randf_range(0.20, 0.35), 1.0)
		spark.position = global_position
		spark.z_index = 5
		host.add_child(spark)
		var angle: float = randf_range(0.0, TAU)
		var speed: float = randf_range(56.0, 110.0)
		var dir: Vector2 = Vector2.RIGHT.rotated(angle)
		var arc_h: float = randf_range(10.0, 26.0)
		var target: Vector2 = spark.position + dir * speed + Vector2(0, arc_h)
		var tw: Tween = spark.create_tween().set_parallel(true)
		tw.tween_property(spark, "position", target, 0.40)\
			.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
		tw.tween_property(spark, "modulate:a", 0.0, 0.40)\
			.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
		tw.chain().tween_callback(spark.queue_free)
