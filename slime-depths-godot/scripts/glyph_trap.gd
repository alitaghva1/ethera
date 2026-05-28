# GlyphTrap — iter 72. Stationary hazard PLANTED by a glyph_warden enemy
# at its own feet during a glyph_warden WINDUP → PLACE cycle. The trap
# is added to the ROOM (not the warden) so it OUTLIVES the warden —
# kill the warden and its inscribed glyphs keep ticking on the floor.
#
# Design centerpiece:
#   - Glyph arms over GLYPH_ARM_TIME (0.6s) after placement. While
#     disarmed the inner ring pulses dim amber and the glyph deals NO
#     damage. While armed the inner ring is hot red and any hero
#     stepping into GLYPH_RADIUS triggers detonation.
#   - Detonation deals GLYPH_DAMAGE and applies a brief slow via
#     hero.take_damage + a slow_zone-style local debuff if the hero
#     exposes it. Then the glyph queue_frees with a tween-faded burst.
#   - If never triggered, the glyph SELF-DESPAWNS after GLYPH_LIFETIME
#     so a wave full of wardens doesn't pile-up dozens of stale traps.
#
# Visual stack:
#   - Outer ring: thin amber annulus (Polygon2D) — defines "the danger
#     edge." Always visible.
#   - Inner rune: 6-point star (two triangles) at center, color shifting
#     from amber (disarmed) → bright red (armed) → bright orange (boom).
#   - Slow rotation while armed sells "the rune is HOT."
#
# Collision: Area2D with collision_mask = 2 (hero layer, same as
# spike_pit). collision_layer = 0 so nothing else (enemies, projectiles)
# triggers on the glyph. monitorable = false; we just poll
# get_overlapping_bodies and react to the hero.
extends Area2D

const GLYPH_DAMAGE: int = 1
const GLYPH_RADIUS: float = 28.0
const GLYPH_ARM_TIME: float = 0.6
const GLYPH_LIFETIME: float = 6.0
const GLYPH_SLOW_DURATION: float = 1.2
# Visual constants.
const COLOR_DISARMED: Color = Color(1.0, 0.78, 0.32, 0.85)   # amber
const COLOR_ARMED: Color = Color(1.20, 0.32, 0.20, 0.95)     # hot red
const COLOR_DETONATE: Color = Color(1.50, 0.85, 0.30, 1.0)   # bright orange burst

var _life: float = GLYPH_LIFETIME
var _arm_timer: float = GLYPH_ARM_TIME
var _armed: bool = false
var _detonated: bool = false
# Cached child refs so the per-tick visual update is cheap.
var _ring: Polygon2D = null
var _tri_a: Polygon2D = null
var _tri_b: Polygon2D = null
# Wrapper to rotate the inner star without rotating the ring.
var _star_node: Node2D = null

func _ready() -> void:
	add_to_group("glyph_traps")
	# Collision: hero layer = bit 2 = mask 2 (same convention as spike_pit).
	collision_layer = 0
	collision_mask = 2
	monitorable = false
	# Iter-readability: z=1 puts the glyph footprint on the ground hazard
	# layer (above background, below hero z=5 + FX z=2/5). Matches the
	# convention used by fire_jet/spike_pit/lightning_rod ground footprints.
	# Was -1 historically, which (per iter-58/59 lesson) risked hiding the
	# glyph under the procedural_dungeon Background sprite. The hero
	# already renders on top via the iter-58 fix (tree-order in main.gd._ready).
	z_index = 1
	var shape: CollisionShape2D = CollisionShape2D.new()
	var circle: CircleShape2D = CircleShape2D.new()
	circle.radius = GLYPH_RADIUS
	shape.shape = circle
	add_child(shape)
	_build_visuals()

# Build the rune visual: outer thin ring + inner 6-pointed star
# (two interlocking triangles). The star is wrapped in a Node2D so we
# can rotate just the star, not the ring.
func _build_visuals() -> void:
	# Outer ring — thin amber annulus. Same trick the inscription-mark
	# and heal-pulse use: sample outer CCW + inner CW into one polygon.
	_ring = Polygon2D.new()
	var segments: int = 24
	var outer_r: float = GLYPH_RADIUS
	var inner_r: float = max(0.5, outer_r - 2.5)
	var verts: PackedVector2Array = PackedVector2Array()
	for i in range(segments):
		var a: float = (TAU / float(segments)) * float(i)
		verts.append(Vector2(cos(a), sin(a)) * outer_r)
	for i in range(segments - 1, -1, -1):
		var a: float = (TAU / float(segments)) * float(i)
		verts.append(Vector2(cos(a), sin(a)) * inner_r)
	_ring.polygon = verts
	_ring.color = COLOR_DISARMED
	add_child(_ring)
	# Inner star — two equilateral triangles offset 60°.
	_star_node = Node2D.new()
	add_child(_star_node)
	var star_r: float = GLYPH_RADIUS * 0.72
	_tri_a = Polygon2D.new()
	_tri_a.polygon = PackedVector2Array([
		Vector2(cos(-PI/2.0), sin(-PI/2.0)) * star_r,
		Vector2(cos(-PI/2.0 + TAU/3.0), sin(-PI/2.0 + TAU/3.0)) * star_r,
		Vector2(cos(-PI/2.0 + 2.0 * TAU/3.0), sin(-PI/2.0 + 2.0 * TAU/3.0)) * star_r,
	])
	_tri_a.color = COLOR_DISARMED
	_star_node.add_child(_tri_a)
	_tri_b = Polygon2D.new()
	_tri_b.polygon = PackedVector2Array([
		Vector2(cos(PI/2.0), sin(PI/2.0)) * star_r,
		Vector2(cos(PI/2.0 + TAU/3.0), sin(PI/2.0 + TAU/3.0)) * star_r,
		Vector2(cos(PI/2.0 + 2.0 * TAU/3.0), sin(PI/2.0 + 2.0 * TAU/3.0)) * star_r,
	])
	_tri_b.color = COLOR_DISARMED
	_star_node.add_child(_tri_b)

func _physics_process(delta: float) -> void:
	if _detonated:
		return
	# Arming phase — glyph still innocuous; ring + star pulse amber.
	if not _armed:
		_arm_timer -= delta
		# Pulse the ring alpha so the disarmed state reads as "loading."
		var pulse: float = 0.55 + 0.35 * (0.5 + 0.5 * sin(_arm_timer * 12.0))
		if _ring != null:
			_ring.modulate.a = pulse
		if _arm_timer <= 0.0:
			_armed = true
			# Visual snap to armed: ring + star both flash to red.
			if _ring != null:
				_ring.color = COLOR_ARMED
				_ring.modulate.a = 1.0
			if _tri_a != null:
				_tri_a.color = COLOR_ARMED
			if _tri_b != null:
				_tri_b.color = COLOR_ARMED
		return
	# Armed phase — slowly rotate the inner star + tick lifetime down +
	# check for hero overlap.
	if _star_node != null:
		_star_node.rotation += 1.8 * delta
	_life -= delta
	if _life <= 0.0:
		_fade_and_free()
		return
	# Tail-fade the ring across the last 0.5s so the player gets a small
	# "the glyph is timing out" read.
	if _life < 0.5:
		var fade_t: float = _life / 0.5
		if _ring != null:
			_ring.modulate.a = fade_t
		if _tri_a != null:
			_tri_a.modulate.a = fade_t
		if _tri_b != null:
			_tri_b.modulate.a = fade_t
	# Detection — poll overlapping bodies. We don't use body_entered/
	# body_exited because the hero may already be standing inside the
	# glyph at the moment it arms (if the warden placed the glyph at
	# the hero's feet, which is rare but possible). Polling each frame
	# catches that case cleanly.
	for body in get_overlapping_bodies():
		if not is_instance_valid(body):
			continue
		if not body.is_in_group("hero"):
			continue
		_detonate(body)
		return

# Trigger the detonation: deal damage, apply slow if hero exposes a
# slow API, spawn the burst FX, queue_free.
func _detonate(hero: Node) -> void:
	if _detonated:
		return
	_detonated = true
	monitoring = false
	if hero.has_method("take_damage"):
		# Pass source_pos = glyph center so iter-70 knockback shoves the
		# hero away from the glyph (consistent with other ground hazards
		# that pass global_position).
		hero.take_damage(GLYPH_DAMAGE, global_position)
	# Optional slow — hero.gd exposes apply_slow on some builds; if
	# present, layer a brief slow so the glyph reads as "tactical" not
	# "just damage." If not present, the damage alone still lands.
	if hero.has_method("apply_slow"):
		hero.apply_slow(GLYPH_SLOW_DURATION)
	# Burst visuals — both polygons flash to detonate color + scale up,
	# ring fades alpha out, then queue_free.
	if _ring != null:
		_ring.color = COLOR_DETONATE
	if _tri_a != null:
		_tri_a.color = COLOR_DETONATE
	if _tri_b != null:
		_tri_b.color = COLOR_DETONATE
	var tw: Tween = create_tween()
	tw.set_parallel(true)
	tw.tween_property(self, "scale", Vector2(1.55, 1.55), 0.28) \
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	if _ring != null:
		tw.tween_property(_ring, "modulate:a", 0.0, 0.28) \
			.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	if _tri_a != null:
		tw.tween_property(_tri_a, "modulate:a", 0.0, 0.28) \
			.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	if _tri_b != null:
		tw.tween_property(_tri_b, "modulate:a", 0.0, 0.28) \
			.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	tw.chain().tween_callback(queue_free)

# Timeout self-free path — glyph never triggered, just lived out its
# lifetime. Same fade pattern as detonate but no damage call.
func _fade_and_free() -> void:
	if _detonated:
		return
	_detonated = true   # treat as "done"; blocks re-entry
	monitoring = false
	var tw: Tween = create_tween()
	tw.set_parallel(true)
	if _ring != null:
		tw.tween_property(_ring, "modulate:a", 0.0, 0.3)
	if _tri_a != null:
		tw.tween_property(_tri_a, "modulate:a", 0.0, 0.3)
	if _tri_b != null:
		tw.tween_property(_tri_b, "modulate:a", 0.0, 0.3)
	tw.chain().tween_callback(queue_free)
