# Wraith phase-in shimmer — brief visual at the wraith's reappear point.
#
# Iter 68 — paired with the "wraith" enemy behavior in enemy.gd. When
# the wraith finishes PHASE_OUT and teleports BEHIND the hero, we spawn
# this scene at the new position so the reappearance reads on screen
# (otherwise the wraith would silently materialize and instantly swing).
#
# The visual: a violet Polygon2D ring expands from 0 → 30 px over 0.18s
# while modulating from full alpha to 0; three small spark Polygon2Ds
# offset around the center drift outward and fade in parallel. The parent
# Node2D self-frees via a SceneTreeTimer at LIFETIME + 0.05s (slightly
# after the tweens land) so we never leak nodes through hundreds of phase
# cycles per run. The tweens animate the CHILDREN's properties; the
# timer-driven queue_free recursively cleans them up.
#
# Why scripted instead of a static .tscn: building the ring annulus +
# spark verts at runtime keeps the resource file small (single .tscn
# with one Node2D root) and avoids fiddly Polygon2D vertex arrays in
# the .tscn text format. Same pattern the healer pulse uses.
extends Node2D

const LIFETIME: float = 0.18
const RING_END_RADIUS: float = 30.0
const RING_SEGMENTS: int = 24
const RING_WIDTH: float = 3.5
const RING_COLOR: Color = Color(0.55, 0.32, 0.95, 0.90)
const SPARK_COUNT: int = 3
const SPARK_RADIUS: float = 2.5
const SPARK_DRIFT: float = 18.0
const SPARK_COLOR: Color = Color(0.78, 0.55, 1.0, 0.95)

func _ready() -> void:
	z_index = 2   # above the wraith sprite so the shimmer reads on top
	_build_ring()
	_build_sparks()
	# Safety reap: even if a tween somehow stalls (parent freed mid-tween,
	# etc.), this timer ensures the FX node doesn't stick around forever.
	await get_tree().create_timer(LIFETIME + 0.05).timeout
	if is_inside_tree():
		queue_free()

# Build the expanding ring as a thin Polygon2D annulus. Outer ring is
# sampled CCW; inner ring is sampled CW so the resulting polygon is a
# true ring (no chord through the middle). Tween scales it from a small
# initial radius up to RING_END_RADIUS while fading alpha to 0.
func _build_ring() -> void:
	var ring: Polygon2D = Polygon2D.new()
	var outer_r: float = 6.0
	var inner_r: float = max(0.5, outer_r - RING_WIDTH)
	var verts: PackedVector2Array = PackedVector2Array()
	for i in range(RING_SEGMENTS):
		var a: float = (TAU / float(RING_SEGMENTS)) * float(i)
		verts.append(Vector2(cos(a), sin(a)) * outer_r)
	for i in range(RING_SEGMENTS - 1, -1, -1):
		var a: float = (TAU / float(RING_SEGMENTS)) * float(i)
		verts.append(Vector2(cos(a), sin(a)) * inner_r)
	ring.polygon = verts
	ring.color = RING_COLOR
	add_child(ring)
	var final_scale: float = RING_END_RADIUS / outer_r
	var tw: Tween = create_tween()
	tw.set_parallel(true)
	tw.tween_property(ring, "scale", Vector2(final_scale, final_scale), LIFETIME) \
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tw.tween_property(ring, "modulate:a", 0.0, LIFETIME) \
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)

# Three small violet sparks scattered around the center, drifting
# outward + fading in parallel with the ring. Adds visual texture so
# the reappearance reads as "shadow magic crystallizing" rather than a
# flat circle.
func _build_sparks() -> void:
	for i in range(SPARK_COUNT):
		var ang: float = (TAU / float(SPARK_COUNT)) * float(i) + randf_range(-0.4, 0.4)
		var spark: Polygon2D = Polygon2D.new()
		var verts: PackedVector2Array = PackedVector2Array()
		var segments: int = 6
		for j in range(segments):
			var a: float = (TAU / float(segments)) * float(j)
			verts.append(Vector2(cos(a), sin(a)) * SPARK_RADIUS)
		spark.polygon = verts
		spark.color = SPARK_COLOR
		spark.position = Vector2(cos(ang), sin(ang)) * 4.0
		add_child(spark)
		var drift: Vector2 = Vector2(cos(ang), sin(ang)) * SPARK_DRIFT
		var tw: Tween = create_tween()
		tw.set_parallel(true)
		tw.tween_property(spark, "position", spark.position + drift, LIFETIME) \
			.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
		tw.tween_property(spark, "modulate:a", 0.0, LIFETIME) \
			.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
