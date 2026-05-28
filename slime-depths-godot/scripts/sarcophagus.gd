# Sarcophagus — destructible stone tomb-lid that spawns at room init
# in select rooms. Two-hit breakable with random "loot or threat" payoff:
#   • 50% → drops 1-2 gold shards + chest_open chime
#   • 50% → spawns an ember enemy (light melee, the "haunt" of the spec)
#
# iter-256 / Wave 5B — DESTRUCTIBLE sarcophagi. Lives in the
# "obstacles" group so hero sword Hit 3 + dash pierce can find it.
# Visual: low rectangular stone slab with the iter-188 sigil grammar
# (chiseled, fallen). Same chip-burst + flash pattern as pillar.gd
# on hit. On break, the slab tweens away + the random roll fires.
class_name Sarcophagus
extends StaticBody2D

const MAX_HP: int = 2
const GOLD_SHARD_REWARD_MIN: int = 1
const GOLD_SHARD_REWARD_MAX: int = 2
# When the break-roll picks "spawn enemy" we use ember — the lightest
# melee archetype already in the registry, matching the spec's "haunt
# (light melee)" intent without forcing a new EnemyType resource.
const SPAWN_ENEMY_TYPE: String = "ember"

@onready var collision_shape: CollisionShape2D = $CollisionShape2D

var hp: int = MAX_HP
var _broken: bool = false

func _ready() -> void:
	add_to_group("obstacles")
	hp = MAX_HP

# iter-256 / Wave 5B — destructible interface. Same shape as Pillar.
# Hero sword Hit 3 = 2 damage (kills outright), dash pierce = 1
# (two passes to break). source_pos drives the chip burst direction.
func take_hit(damage: int, source_pos: Vector2 = Vector2.ZERO) -> void:
	if _broken:
		return
	hp -= damage
	# Flash on hit.
	var flash: Tween = create_tween()
	flash.tween_property(self, "modulate", Color(1.7, 1.6, 1.4, 1), 0.05)
	flash.tween_property(self, "modulate", Color(1, 1, 1, 1), 0.12)
	_spawn_chip_burst(source_pos)
	if hp <= 0:
		_break()

func _spawn_chip_burst(source_pos: Vector2) -> void:
	var host: Node = get_parent()
	if host == null:
		return
	var away: Vector2
	if source_pos == Vector2.ZERO:
		away = Vector2.UP
	else:
		var d: Vector2 = global_position - source_pos
		away = d.normalized() if d.length() > 0.01 else Vector2.UP
	var count: int = randi_range(4, 6)
	for _i in range(count):
		var chip: Polygon2D = Polygon2D.new()
		var sz: float = randf_range(2.0, 3.5)
		chip.polygon = PackedVector2Array([
			Vector2(-sz, -sz * 0.6),
			Vector2(sz, -sz * 0.7),
			Vector2(sz * 0.7, sz * 0.8),
			Vector2(-sz * 0.6, sz),
		])
		chip.color = Color(randf_range(0.25, 0.40), randf_range(0.22, 0.32), randf_range(0.20, 0.28), 1.0)
		chip.position = global_position + Vector2(0, -8)
		chip.z_index = 4
		host.add_child(chip)
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

# Break the sarcophagus — roll for gold vs enemy, queue self for free,
# disable collision so the spawned enemy (if any) can stand AT this
# tile without colliding with the dying body.
func _break() -> void:
	_broken = true
	remove_from_group("obstacles")
	if collision_shape != null:
		collision_shape.set_deferred("disabled", true)
	# Random payoff roll. 50/50 gold vs enemy.
	if randf() < 0.5:
		_drop_gold_shards()
	else:
		_spawn_ember_enemy()
	# Fade + shrink the slab visuals. Heavier than the pillar collapse
	# because the slab is short — a slight rotation + scale down
	# reads as "the lid cracked + sank."
	var tw: Tween = create_tween().set_parallel(true)
	tw.tween_property(self, "scale", Vector2(0.7, 0.5), 0.30)
	tw.tween_property(self, "rotation", deg_to_rad(randf_range(-8.0, 8.0)), 0.30)
	tw.tween_property(self, "modulate:a", 0.0, 0.30)
	tw.chain().tween_callback(queue_free)
	# Extra chip puff on break — the slab is shattering.
	_spawn_chip_burst(global_position + Vector2(0, 20))

func _drop_gold_shards() -> void:
	var host: Node = get_parent()
	if host == null:
		return
	var amount: int = randi_range(GOLD_SHARD_REWARD_MIN, GOLD_SHARD_REWARD_MAX)
	# Award ether shards via GameState — same currency the chest /
	# ether pickups use. award_ether_shards folds in the ether_magnet
	# 1.25× multiplier transparently.
	if Engine.has_singleton("GameState") or true:
		# GameState is always present as an autoload.
		GameState.award_ether_shards(amount)
	# Floating label so the player sees the drop.
	var label: DamageNumber = DamageNumber.spawn(
		global_position + Vector2(0, -28),
		"+%d SHARD" % amount,
		Color(0.6, 0.85, 1.0),
	)
	if label != null:
		host.add_child(label)
	# chest_open chime — same satisfying open sound the wooden chest uses.
	if Engine.has_singleton("Audio") or true:
		if Audio != null and Audio.has_method("_play"):
			Audio._play("chest_open", global_position)

# Spawn an ember enemy at the sarcophagus position via the same
# enemy_summon_requested signal that lore_stones / dreadmage uses,
# so the wave-clear counter naturally tracks it (joins "enemies"
# group, fires _on_enemy_died).
func _spawn_ember_enemy() -> void:
	# Audio cue — reuse the boss_enrage sting (low menacing sine ramp)
	# so the player can tell from feedback alone whether the break
	# was a gain or a threat.
	if Audio != null and Audio.has_method("_play"):
		Audio._play("boss_enrage", global_position)
	# Use the Events singleton's emit pattern; main.gd connects to
	# Events.enemy_summon_requested and creates an enemy of the given
	# type at the given position.
	Events.enemy_summon_requested.emit(global_position, SPAWN_ENEMY_TYPE)
	# Telegraph floater so the player understands what just happened.
	var host: Node = get_parent()
	if host != null:
		var label: DamageNumber = DamageNumber.spawn(
			global_position + Vector2(0, -28),
			"RISEN!",
			Color(1.0, 0.45, 0.30),
		)
		if label != null:
			host.add_child(label)
