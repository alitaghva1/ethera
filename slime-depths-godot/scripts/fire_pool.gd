# FirePool — iter 40. Short-lived AoE patch dropped by FLAME-ascendant
# kills (hero owns 4+ FLAME relics). Damages ENEMIES that walk through
# it (not the hero — this is a player buff, not a self-hazard). Lives
# for ~2s then fades out + queue_frees.
#
# Bullet-hell scaling: every kill spawns a pool, pools stack overlap,
# and with FLAME-ascendance the player effectively turns kills into
# new damage zones. Combined with chain_lightning / executioner /
# soul_burst, big mob clusters cascade into damage carpets.
#
# Designed as Area2D so the contact-damage check is a clean
# overlapping_bodies poll — no manual distance math per enemy.
extends Area2D

const POOL_DAMAGE: int = 1
const POOL_TICK_INTERVAL: float = 0.4
const POOL_LIFETIME: float = 2.0
const POOL_RADIUS: float = 22.0

# Iter 61 — per-instance _life lets callers spawn shorter-lived pools
# (e.g. melee swing connect creates a brief 0.6s mini-pool vs the
# 2.0s kill pool). Set BEFORE add_child to override the default.
var _life: float = POOL_LIFETIME
var _tick: float = 0.0
# Per-enemy hit cooldown so each enemy takes one tick per
# POOL_TICK_INTERVAL inside the pool. Mapping: instance_id -> next
# eligible time. Defends against multi-tick on a single overlap.
var _next_hit: Dictionary = {}

var _disc: Polygon2D = null
var _glow: PointLight2D = null
var _pulse: Polygon2D = null

func _ready() -> void:
	# Iter 61 — join "fire_pools" group so tests / future systems can
	# find all active pools without walking the scene tree by parent.
	add_to_group("fire_pools")
	# Detection shape — circle radius 22.
	var shape: CollisionShape2D = CollisionShape2D.new()
	var circle: CircleShape2D = CircleShape2D.new()
	circle.radius = POOL_RADIUS
	shape.shape = circle
	add_child(shape)
	# Collision: pools should detect enemies (layer 3 in this project).
	# Pulled from spike_pit pattern but routed for enemies, not hero.
	collision_layer = 0
	collision_mask = 4   # bit 3 = enemies (layer 3 sets bit 3 = value 4)
	monitorable = false
	_build_visuals()

func _build_visuals() -> void:
	# Disc — warm orange-red, semi-transparent. 12-vert near-circle so
	# the outline reads as a real burn pool, not a perfect disc.
	_disc = Polygon2D.new()
	_disc.polygon = PackedVector2Array([
		Vector2(22, 0), Vector2(19, 11), Vector2(11, 19),
		Vector2(0, 22), Vector2(-11, 19), Vector2(-19, 11),
		Vector2(-22, 0), Vector2(-19, -11), Vector2(-11, -19),
		Vector2(0, -22), Vector2(11, -19), Vector2(19, -11),
	])
	_disc.color = Color(0.95, 0.40, 0.18, 0.75)
	add_child(_disc)
	# Inner pulse ring — brighter, smaller. Drives a fast sin wave on
	# alpha + scale so the pool reads as ACTIVE flame, not static decal.
	_pulse = Polygon2D.new()
	_pulse.polygon = PackedVector2Array([
		Vector2(14, 0), Vector2(12, 7), Vector2(7, 12),
		Vector2(0, 14), Vector2(-7, 12), Vector2(-12, 7),
		Vector2(-14, 0), Vector2(-12, -7), Vector2(-7, -12),
		Vector2(0, -14), Vector2(7, -12), Vector2(12, -7),
	])
	_pulse.color = Color(1.0, 0.75, 0.40, 0.90)
	add_child(_pulse)
	# Light — warm orange. Modest energy so a single pool doesn't
	# dominate, but a CARPET of pools turns the floor orange (the
	# desired bullet-hell aesthetic).
	_glow = PointLight2D.new()
	_glow.energy = 0.8
	_glow.texture_scale = 0.9
	_glow.color = Color(1.0, 0.55, 0.25, 1.0)
	_glow.range_z_min = -1024
	_glow.range_z_max = 1024
	add_child(_glow)

func _physics_process(delta: float) -> void:
	_life -= delta
	if _life <= 0.0:
		_fade_and_free()
		set_physics_process(false)
		return
	# Pulse animation — fast sin on the inner pulse polygon.
	if _pulse != null:
		var t: float = (POOL_LIFETIME - _life) * 6.0
		var s: float = 1.0 + 0.18 * sin(t)
		_pulse.scale = Vector2(s, s)
		_pulse.modulate.a = 0.6 + 0.4 * (0.5 + 0.5 * sin(t * 0.7))
	# Tail-fade — last 0.4s of life dims the disc + light.
	var fade_t: float = clampf(_life / 0.4, 0.0, 1.0)
	if _disc != null:
		_disc.modulate.a = fade_t
	if _glow != null:
		_glow.energy = 0.8 * (fade_t * 0.6 + 0.4)
	# Tick damage — count down a shared tick interval, then poll all
	# overlapping enemies and damage anyone whose per-enemy cooldown
	# has elapsed.
	_tick -= delta
	if _tick > 0.0:
		return
	_tick = POOL_TICK_INTERVAL
	var now: float = Time.get_ticks_msec() / 1000.0
	for body in get_overlapping_bodies():
		if not is_instance_valid(body):
			continue
		if not body.is_in_group("enemies"):
			continue
		# Per-enemy cooldown so two pools overlapping don't deal double
		# damage per tick from each pool.
		var bid: int = body.get_instance_id()
		var next: float = float(_next_hit.get(bid, 0.0))
		if now < next:
			continue
		_next_hit[bid] = now + POOL_TICK_INTERVAL * 0.9   # slight grace
		if body.has_method("take_hit"):
			body.take_hit(POOL_DAMAGE)

func _fade_and_free() -> void:
	monitoring = false
	var tween: Tween = create_tween().set_parallel(true)
	if _disc != null:
		tween.tween_property(_disc, "modulate:a", 0.0, 0.3)
	if _pulse != null:
		tween.tween_property(_pulse, "modulate:a", 0.0, 0.3)
	if _glow != null:
		tween.tween_property(_glow, "energy", 0.0, 0.3)
	tween.chain().tween_callback(queue_free)
