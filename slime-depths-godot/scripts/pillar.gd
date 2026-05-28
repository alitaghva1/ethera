# Pillar — static stone column the hero must walk AROUND. Solid
# collider at the base + a small warm PointLight2D up top so the
# column feels lit by an unseen brazier and softly pools light into
# the surrounding floor.
#
# Spawned by main.gd from RoomConfig.pillar_positions, same pattern
# as torches. Per-room placement makes the dungeon read as a series
# of distinct spaces rather than identical empty boxes.
#
# Visual = pure node-driven shading (3 stacked ColorRects on the
# .tscn side, no procedural draw). The script only owns the gentle
# light flicker — slower + softer than torches so the pillar reads
# as ambient warmth, not as a fire.
#
# iter-256 / Wave 5B — DESTRUCTIBLE pillars. Pillar joins the
# "obstacles" group at _ready so hero combat code (sword Hit 3 +
# dash-strike pierce) can find it. take_hit(damage, source_pos)
# decrements hp, plays a flash + dust puff, and on hp<=0 COLLAPSES
# into a small dark rubble pile that still blocks movement.
class_name Pillar
extends StaticBody2D

const BASE_ENERGY: float = 0.60
const FLICKER_SLOW: float = 0.06
const FLICKER_FAST: float = 0.03
const MAX_HP: int = 5

@onready var light: PointLight2D = $PointLight2D
@onready var collision_shape: CollisionShape2D = $CollisionShape2D

var _phase: float = randf() * TAU
var hp: int = MAX_HP
var _collapsed: bool = false

func _ready() -> void:
	# iter-256 / Wave 5B — register in the "obstacles" group so hero
	# combat code (sword Hit 3 + dash pierce) can iterate destructibles
	# alongside enemies. Pillars stay on collision_layer 1 (world) so
	# the hero physically walks around them; the group is purely a
	# search key.
	add_to_group("obstacles")

func _process(_delta: float) -> void:
	if light == null:
		return
	if _collapsed:
		return
	var t: float = Time.get_ticks_msec() / 1000.0
	var slow: float = sin(t * 1.8 + _phase) * FLICKER_SLOW
	var fast: float = sin(t * 5.2 + _phase * 1.3) * FLICKER_FAST
	light.energy = BASE_ENERGY + slow + fast

# iter-256 / Wave 5B — destructible interface. Called from hero.gd
# _resolve_melee_strike (when sword Hit 3 connects) and
# _resolve_dash_strike_hit / _apply_dash_pierce_tick when the hero
# dashes through a pillar. Damage 2 for heavy hit, 1 for dash pierce.
# source_pos drives the dust puff direction so chips fly AWAY from
# the impact (reads as "the hit knocked chips off the column").
func take_hit(damage: int, source_pos: Vector2 = Vector2.ZERO) -> void:
	if _collapsed:
		return
	hp -= damage
	# Brief modulate flash on each hit. The pillar visuals are three
	# stacked ColorRects + a top highlight + a base shadow; flashing
	# the StaticBody2D's modulate cascades to all children at once.
	var flash: Tween = create_tween()
	flash.tween_property(self, "modulate", Color(1.8, 1.6, 1.4, 1), 0.05)
	flash.tween_property(self, "modulate", Color(1, 1, 1, 1), 0.12)
	# Stone-chip dust puff. 4-6 small dark particles flying outward
	# from the hit direction. Computed as a unit vector from source_pos
	# → pillar center, then chips spread within a 60° arc opposite
	# (so they fly AWAY from the impact point).
	_spawn_chip_burst(source_pos)
	if hp <= 0:
		_collapse()

# Spawn 4-6 small stone-chip Polygon2Ds and tween them outward + down
# (gravity) + fade. Pooled via individual tweens — no CPUParticles2D
# because the chip count is small and a tween per chip lets each one
# rotate while flying.
func _spawn_chip_burst(source_pos: Vector2) -> void:
	var host: Node = get_parent()
	if host == null:
		return
	# Direction AWAY from the impact source. If source is the pillar
	# itself (default Vector2.ZERO), default upward for a generic burst.
	var away: Vector2
	if source_pos == Vector2.ZERO:
		away = Vector2.UP
	else:
		var d: Vector2 = global_position - source_pos
		away = d.normalized() if d.length() > 0.01 else Vector2.UP
	var count: int = randi_range(4, 6)
	for _i in range(count):
		var chip: Polygon2D = Polygon2D.new()
		# Tiny irregular quad — reads as a stone shard at scale.
		var sz: float = randf_range(2.0, 3.5)
		chip.polygon = PackedVector2Array([
			Vector2(-sz, -sz * 0.6),
			Vector2(sz, -sz * 0.7),
			Vector2(sz * 0.7, sz * 0.8),
			Vector2(-sz * 0.6, sz),
		])
		# Dark grey-brown stone color matching the pillar Middle band.
		chip.color = Color(randf_range(0.25, 0.40), randf_range(0.22, 0.32), randf_range(0.20, 0.28), 1.0)
		chip.position = global_position + Vector2(0, -28)
		chip.z_index = 4
		host.add_child(chip)
		# Trajectory: away vector + spread (±60° arc), random speed.
		var spread: float = randf_range(-PI / 3.0, PI / 3.0)
		var dir: Vector2 = away.rotated(spread)
		var speed: float = randf_range(36.0, 78.0)
		var arc_h: float = randf_range(20.0, 38.0)
		var target: Vector2 = chip.position + dir * speed + Vector2(0, arc_h)
		var tw: Tween = chip.create_tween().set_parallel(true)
		tw.tween_property(chip, "position", target, 0.45)\
			.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
		tw.tween_property(chip, "rotation", randf_range(-PI, PI), 0.45)\
			.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
		tw.tween_property(chip, "modulate:a", 0.0, 0.45)\
			.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
		tw.chain().tween_callback(chip.queue_free)

# Collapse the pillar — shrink the column visuals, rotate slightly,
# fade the light, and spawn a small rubble pile that still blocks the
# hero (collapsed-stone rubble pile, smaller footprint than the
# original column).
func _collapse() -> void:
	_collapsed = true
	# Spawn a rubble pile Polygon2D + StaticBody2D AT the pillar's
	# position before we kill ourselves. Smaller collision footprint
	# (~14 px radius) so the hero can squeeze past, but it still blocks
	# basic line-of-sight movement — "this was a column, now a hazard
	# you can step around."
	_spawn_rubble_pile()
	# Tween the column visuals away: shrink, rotate, fade light.
	# Disable the original collision (deferred) so the hero can step
	# THROUGH the original pillar tile while the rubble (smaller) sits
	# at the same world position.
	if collision_shape != null:
		collision_shape.set_deferred("disabled", true)
	# Drop out of the obstacles group so subsequent take_hit scans
	# don't find a "dead" pillar (the rubble pile in the group instead).
	remove_from_group("obstacles")
	var tw: Tween = create_tween().set_parallel(true)
	tw.tween_property(self, "scale", Vector2(0.4, 0.4), 0.35)\
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	# Random tilt direction so adjacent pillars collapsing in the same
	# room don't fall identically — reads as "stones broke independently."
	var tilt: float = deg_to_rad(randf_range(15.0, 25.0)) * (1.0 if randf() < 0.5 else -1.0)
	tw.tween_property(self, "rotation", tilt, 0.35)\
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	if light != null:
		tw.tween_property(light, "energy", 0.0, 0.35)
	tw.tween_property(self, "modulate:a", 0.4, 0.35)
	# Big chip burst on collapse — more chips fly out (the whole thing
	# is collapsing, not just chipping).
	_spawn_chip_burst(global_position + Vector2(0, 40))
	_spawn_chip_burst(global_position + Vector2(0, 40))

# Build a small dark rubble-pile body that BLOCKS movement at the
# pillar's tile. ~14 px radius collision, dark stone polygon visual,
# parented to our parent so it persists after we fade.
func _spawn_rubble_pile() -> void:
	var host: Node = get_parent()
	if host == null:
		return
	var rubble: StaticBody2D = StaticBody2D.new()
	rubble.collision_layer = 1
	rubble.collision_mask = 0
	rubble.global_position = global_position
	rubble.add_to_group("obstacles")
	# Smaller collision footprint than the original pillar (18 → 14).
	var shape: CollisionShape2D = CollisionShape2D.new()
	var circ: CircleShape2D = CircleShape2D.new()
	circ.radius = 14.0
	shape.shape = circ
	rubble.add_child(shape)
	# Dark, low, flat stone-pile polygon. Three small mounds of stone
	# with an irregular silhouette so it reads as collapsed masonry.
	var pile: Polygon2D = Polygon2D.new()
	pile.polygon = PackedVector2Array([
		Vector2(-18, 4),
		Vector2(-14, -4),
		Vector2(-6, -6),
		Vector2(2, -8),
		Vector2(10, -4),
		Vector2(16, -2),
		Vector2(18, 4),
		Vector2(10, 8),
		Vector2(0, 9),
		Vector2(-8, 7),
	])
	pile.color = Color(0.18, 0.16, 0.14, 1.0)
	rubble.add_child(pile)
	# Thin highlight line along the top of the pile so it reads as 3D
	# stone catching a sliver of ambient light, not a flat blob.
	var rim: Line2D = Line2D.new()
	rim.points = PackedVector2Array([
		Vector2(-14, -3), Vector2(-4, -5),
		Vector2(4, -7), Vector2(12, -3),
	])
	rim.width = 1.0
	rim.default_color = Color(0.38, 0.34, 0.30, 0.85)
	rim.antialiased = true
	rubble.add_child(rim)
	# Ground shadow under the pile — smaller than the original pillar
	# shadow.
	var shadow: Polygon2D = Polygon2D.new()
	var pts: PackedVector2Array = PackedVector2Array()
	for i in range(14):
		var a: float = (TAU / 14.0) * float(i)
		pts.append(Vector2(cos(a) * 22.0, sin(a) * 7.0))
	shadow.polygon = pts
	shadow.color = Color(0, 0, 0, 0.5)
	shadow.position = Vector2(0, 10)
	shadow.z_index = -1
	rubble.add_child(shadow)
	host.add_child(rubble)
