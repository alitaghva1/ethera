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
# Iter 69 — idempotency guard for _fade_and_free. set_physics_process(false)
# stops future ticks, but a second call within the same frame (e.g. if the
# engine re-enters _physics_process for any reason) would start a second
# tween chain that calls queue_free twice. _fading short-circuits that.
var _fading: bool = false

var _disc: Polygon2D = null
# Iter 252 / Wave 2 lighting — _glow now resolves to the PointLight2D
# defined inside fire_pool.tscn (was code-built before). Held as a
# nullable so test harnesses that instantiate the script in isolation
# (without the scene tree) still execute without crashing on the cast.
var _glow: PointLight2D = null
var _pulse: Polygon2D = null
# Iter 252 — baseline energy for the flicker. Captured at _ready time so
# tier scaling / future overrides can bump the pool brightness without
# changing the flicker amplitude separately.
var _flicker_base_energy: float = 1.1
# Iter-readability: small ember dots that scatter ON TOP of the pool
# and pulse asynchronously — sells "actively burning fuel" rather than
# a flat decal. Three pips at different offsets, each driven by its own
# phase in _physics_process.
var _ember_a: Polygon2D = null
var _ember_b: Polygon2D = null
var _ember_c: Polygon2D = null

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
	# Iter-readability: z=1 puts the pool on the ground footprint layer
	# (above background, below hero/enemies/FX). Makes the pool read as
	# a floor hazard rather than a stamp on top of everything.
	z_index = 1
	_build_visuals()

func _build_visuals() -> void:
	# Disc — warm orange-red. Iter-readability pass: replaced the smooth
	# 12-vert near-circle with a JAGGED 16-vert flame outline (alternating
	# inner/outer radii) so the silhouette reads as FIRE not as a colored
	# coaster. Two adjacent outer points form each lick of flame.
	_disc = Polygon2D.new()
	var outline: PackedVector2Array = PackedVector2Array()
	var disc_segs: int = 16
	for i in range(disc_segs):
		var a: float = (TAU / float(disc_segs)) * float(i)
		# Alternate radii — outer 22 / inner 16 — for a flame-tongue edge.
		var r: float = 22.0 if (i % 2 == 0) else 16.0
		outline.append(Vector2(cos(a), sin(a)) * r)
	_disc.polygon = outline
	_disc.color = Color(0.95, 0.40, 0.18, 0.75)
	add_child(_disc)
	# Inner pulse ring — brighter, smaller. Also jagged so the inner core
	# matches the silhouette. Drives a fast sin wave on alpha + scale so
	# the pool reads as ACTIVE flame, not static decal.
	_pulse = Polygon2D.new()
	var inner_poly: PackedVector2Array = PackedVector2Array()
	for i in range(disc_segs):
		var a2: float = (TAU / float(disc_segs)) * float(i) + 0.196   # offset so points don't align
		var r2: float = 14.0 if (i % 2 == 0) else 9.0
		inner_poly.append(Vector2(cos(a2), sin(a2)) * r2)
	_pulse.polygon = inner_poly
	_pulse.color = Color(1.0, 0.75, 0.40, 0.90)
	add_child(_pulse)
	# Ember pips — three tiny bright yellow diamonds scattered across
	# the pool. Each gets its own sin-phase in _physics_process so they
	# crackle out of sync. Sells "this is burning fuel" rather than a
	# painted blob.
	_ember_a = _make_ember(Vector2(-7, 4))
	_ember_b = _make_ember(Vector2(8, -6))
	_ember_c = _make_ember(Vector2(2, 9))
	# Iter 252 / Wave 2 lighting — PointLight2D now lives in fire_pool.tscn
	# (warm orange, energy 1.1 baseline, texture_scale 0.8 → ~102 px radius).
	# Query the scene node; falls back to a code-built light only if the
	# scene node is missing (defensive — test harness or future refactor).
	_glow = get_node_or_null("PointLight2D") as PointLight2D
	if _glow == null:
		# Fallback: scene tree didn't carry one. Build a comparable light
		# in code so the test harness / isolation scenarios still glow.
		_glow = PointLight2D.new()
		_glow.energy = 1.1
		_glow.texture_scale = 0.8
		_glow.color = Color(1.0, 0.62, 0.28, 1.0)
		_glow.range_z_min = -1024
		_glow.range_z_max = 1024
		add_child(_glow)
	# Snapshot the baseline energy so the flicker in _physics_process can
	# oscillate around it (and the fade-out tween's final value of 0 is
	# computed from the same number).
	_flicker_base_energy = _glow.energy

# Small bright-yellow ember pip. Shared shape so the three embers are
# visually consistent (just at different positions / phases).
func _make_ember(offset: Vector2) -> Polygon2D:
	var pip: Polygon2D = Polygon2D.new()
	pip.position = offset
	pip.polygon = PackedVector2Array([
		Vector2(-2, 0), Vector2(0, -3), Vector2(2, 0), Vector2(0, 3),
	])
	pip.color = Color(1.0, 0.95, 0.55, 1.0)
	add_child(pip)
	return pip

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
	# Embers — each pip pulses on its own phase + freq so they crackle.
	# Phase offsets (0 / 1.7 / 3.4) make sure no two pips peak together.
	var et: float = (POOL_LIFETIME - _life)
	if _ember_a != null:
		_ember_a.modulate.a = 0.4 + 0.55 * (0.5 + 0.5 * sin(et * 14.0))
		var es_a: float = 0.7 + 0.5 * (0.5 + 0.5 * sin(et * 14.0))
		_ember_a.scale = Vector2(es_a, es_a)
	if _ember_b != null:
		_ember_b.modulate.a = 0.4 + 0.55 * (0.5 + 0.5 * sin(et * 11.0 + 1.7))
		var es_b: float = 0.7 + 0.5 * (0.5 + 0.5 * sin(et * 11.0 + 1.7))
		_ember_b.scale = Vector2(es_b, es_b)
	if _ember_c != null:
		_ember_c.modulate.a = 0.4 + 0.55 * (0.5 + 0.5 * sin(et * 17.0 + 3.4))
		var es_c: float = 0.7 + 0.5 * (0.5 + 0.5 * sin(et * 17.0 + 3.4))
		_ember_c.scale = Vector2(es_c, es_c)
	# Tail-fade — iter-readability: stretched from 0.4s → 0.6s so the
	# "ending soon" signal lands earlier. Also contracts the disc scale
	# slightly across the fade window — the pool VISIBLY shrinks before
	# it disappears, so the player can predict when it's safe to step in.
	var fade_t: float = clampf(_life / 0.6, 0.0, 1.0)
	if _disc != null:
		_disc.modulate.a = fade_t
		_disc.scale = Vector2(0.72 + 0.28 * fade_t, 0.72 + 0.28 * fade_t)
	# Iter 252 / Wave 2 lighting — flicker the light each frame so the
	# pool reads as ACTIVE flame, not a static decal. sin-driven 15%
	# amplitude around baseline gives a subtle crackle (0.85×–1.15×).
	# In the fade window (_life < 0.6) the flickered value also scales by
	# fade_t so the light dims with the disc instead of clipping at full
	# energy until the queue_free callback. Time.get_ticks_msec is the
	# canonical clock — survives time_scale changes by the slow-mo system
	# the way delta-based accumulation wouldn't.
	if _glow != null:
		var flicker_phase: float = Time.get_ticks_msec() * 0.02
		var flicker_mul: float = 1.0 + sin(flicker_phase) * 0.15
		var target_energy: float = _flicker_base_energy * flicker_mul
		if _life < 0.6:
			target_energy *= (fade_t * 0.6 + 0.4)
		_glow.energy = target_energy
	# In the final 0.6s, the embers cluster INWARD as fuel runs out —
	# tween-style scale-down on their positions (cheap to recompute).
	if _life < 0.6:
		var inset: float = _life / 0.6
		if _ember_a != null:
			_ember_a.position = Vector2(-7, 4) * inset
		if _ember_b != null:
			_ember_b.position = Vector2(8, -6) * inset
		if _ember_c != null:
			_ember_c.position = Vector2(2, 9) * inset
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
	# Iter 69 — idempotent. Second call no-ops so we never start two
	# parallel tweens both racing to queue_free this node.
	if _fading:
		return
	_fading = true
	monitoring = false
	var tween: Tween = create_tween().set_parallel(true)
	if _disc != null:
		tween.tween_property(_disc, "modulate:a", 0.0, 0.3)
	if _pulse != null:
		tween.tween_property(_pulse, "modulate:a", 0.0, 0.3)
	if _glow != null:
		tween.tween_property(_glow, "energy", 0.0, 0.3)
	# Embers fade with the rest of the pool — clean handoff to queue_free.
	if _ember_a != null:
		tween.tween_property(_ember_a, "modulate:a", 0.0, 0.25)
	if _ember_b != null:
		tween.tween_property(_ember_b, "modulate:a", 0.0, 0.25)
	if _ember_c != null:
		tween.tween_property(_ember_c, "modulate:a", 0.0, 0.25)
	tween.chain().tween_callback(queue_free)
