# Secret crackable wall — the Binding of Isaac flavor "find a hidden
# cache" hook. A small (~48×48) wall block embedded in the room
# perimeter with a SUBTLE violet glow that observant players can spot.
# Two hits with sword Hit 3 / dash pierce, breaks → +30 ether shards
# + glowing violet light burst + pickup_legendary chime.
#
# iter-256 / Wave 5C — destructible secret walls. Spawned by main.gd
# at room init with ~30% chance per room, at a random perimeter wall
# position. Sits in the "secret_walls" group so hero combat code can
# find it the same way it iterates obstacles + lanterns.
class_name SecretWall
extends StaticBody2D

const MAX_HP: int = 2
const ETHER_REWARD: int = 30

@onready var collision_shape: CollisionShape2D = $CollisionShape2D
@onready var hint_light: PointLight2D = $HintLight

var hp: int = MAX_HP
var _broken: bool = false

func _ready() -> void:
	add_to_group("secret_walls")
	hp = MAX_HP

# iter-256 / Wave 5C — destructible interface. Same shape as Pillar.
# Hero sword Hit 3 = 2 damage (breaks outright), dash pierce = 1
# (two passes). On break: spawn glowing violet light + floater +
# award shards.
func take_hit(damage: int, source_pos: Vector2 = Vector2.ZERO) -> void:
	if _broken:
		return
	hp -= damage
	# Flash brighter than other destructibles — the violet hint should
	# pulse on hit so the player feels they've found something special.
	var flash: Tween = create_tween()
	flash.tween_property(self, "modulate", Color(1.6, 1.3, 2.0, 1), 0.06)
	flash.tween_property(self, "modulate", Color(1, 1, 1, 1), 0.14)
	# Same chip-burst pattern as pillar/sarcophagus but with violet tint
	# so it reads as "magical stone" rather than mundane.
	_spawn_violet_chip_burst(source_pos)
	if hp <= 0:
		_break()

func _spawn_violet_chip_burst(source_pos: Vector2) -> void:
	var host: Node = get_parent()
	if host == null:
		return
	var away: Vector2
	if source_pos == Vector2.ZERO:
		away = Vector2.UP
	else:
		var d: Vector2 = global_position - source_pos
		away = d.normalized() if d.length() > 0.01 else Vector2.UP
	var count: int = randi_range(5, 7)
	for _i in range(count):
		var chip: Polygon2D = Polygon2D.new()
		var sz: float = randf_range(2.0, 3.0)
		chip.polygon = PackedVector2Array([
			Vector2(-sz, -sz * 0.6),
			Vector2(sz, -sz * 0.7),
			Vector2(sz * 0.7, sz * 0.8),
			Vector2(-sz * 0.6, sz),
		])
		# Violet-magenta — distinct from sarcophagus/pillar stone chips.
		chip.color = Color(randf_range(0.5, 0.7), randf_range(0.2, 0.35), randf_range(0.6, 0.85), 1.0)
		chip.position = global_position
		chip.z_index = 4
		host.add_child(chip)
		var spread: float = randf_range(-PI / 3.0, PI / 3.0)
		var dir: Vector2 = away.rotated(spread)
		var speed: float = randf_range(48.0, 92.0)
		var arc_h: float = randf_range(12.0, 28.0)
		var target: Vector2 = chip.position + dir * speed + Vector2(0, arc_h)
		var tw: Tween = chip.create_tween().set_parallel(true)
		tw.tween_property(chip, "position", target, 0.45)\
			.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
		tw.tween_property(chip, "rotation", randf_range(-PI, PI), 0.45)\
			.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
		tw.tween_property(chip, "modulate:a", 0.0, 0.45)\
			.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
		tw.chain().tween_callback(chip.queue_free)

# Break — award ether shards, spawn a bright violet PointLight2D burst,
# play the pickup_legendary chime, free the wall.
func _break() -> void:
	_broken = true
	remove_from_group("secret_walls")
	if collision_shape != null:
		collision_shape.set_deferred("disabled", true)
	# Award the cache.
	GameState.award_ether_shards(ETHER_REWARD)
	# Audio — pickup_legendary, the existing relic-pickup chime.
	if Audio != null and Audio.has_method("_play"):
		Audio._play("pickup_legendary", global_position)
	# Spawn a bright violet PointLight2D that fades over ~1.2s. Reads
	# as "the hidden cache RELEASED its glow." Hosted on parent so it
	# survives our queue_free.
	_spawn_violet_burst_light()
	# Floating treasure label.
	var host: Node = get_parent()
	if host != null:
		var label: DamageNumber = DamageNumber.spawn(
			global_position + Vector2(0, -30),
			"+%d SHARD" % ETHER_REWARD,
			Color(0.85, 0.55, 1.0),
		)
		if label != null:
			host.add_child(label)
	# Fade + scale the wall away.
	var tw: Tween = create_tween().set_parallel(true)
	tw.tween_property(self, "scale", Vector2(0.5, 0.5), 0.30)
	tw.tween_property(self, "modulate:a", 0.0, 0.30)
	tw.chain().tween_callback(queue_free)
	# Extra chip puff on break.
	_spawn_violet_chip_burst(global_position + Vector2(0, 20))

# Build a temporary bright violet PointLight2D + GradientTexture2D and
# fade it out over 1.2s on the parent so it persists past our free.
func _spawn_violet_burst_light() -> void:
	var host: Node = get_parent()
	if host == null:
		return
	var light: PointLight2D = PointLight2D.new()
	light.color = Color(0.78, 0.45, 1.0, 1.0)
	light.energy = 2.2
	light.texture_scale = 1.8
	# Build a radial-falloff gradient texture in code — same recipe as
	# the torch / fire pool lights so the burst matches the project's
	# light grammar.
	var grad: Gradient = Gradient.new()
	grad.offsets = PackedFloat32Array([0.0, 1.0])
	grad.colors = PackedColorArray([Color(1, 1, 1, 1), Color(1, 1, 1, 0)])
	var tex: GradientTexture2D = GradientTexture2D.new()
	tex.gradient = grad
	tex.width = 128
	tex.height = 128
	tex.fill = 1   # GradientTexture2D.FILL_RADIAL
	tex.fill_from = Vector2(0.5, 0.5)
	tex.fill_to = Vector2(1.0, 0.5)
	light.texture = tex
	light.global_position = global_position
	host.add_child(light)
	var tw: Tween = light.create_tween()
	tw.tween_property(light, "energy", 0.0, 1.2)\
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tw.tween_callback(light.queue_free)
