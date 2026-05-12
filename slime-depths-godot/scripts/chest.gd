# Chest — breakable wooden box. The hero's sword swing (or dash-strike)
# hits it the same way it hits an enemy: hero.gd's _start_attack +
# _resolve_dash_strike_hit iterate the "enemies" group and call
# take_hit(damage) on each target in range. So the chest joins the
# "enemies" group to receive the swing, but ALSO joins "breakables"
# so main.gd can filter it out of the wave-clear live-enemy count
# (otherwise wave 1 would never clear while a chest still stands).
#
# Two HP. One charged dash-strike OR two sword swings → opens. On open
# we flip to the OPEN visual state (lid back / gold inside), kill the
# collider so the hero can walk over it, emit Events.pickup_claimed so
# audio + screen-flash systems react, and spawn a "+5 GOLD" floating
# label via the existing DamageNumber helper.
#
# Pure ColorRect visuals — closed = solid brown box with a gold lock
# band across the lid line. Open = darker box, lid tipped back, bright
# gold band inside replacing the lock.
class_name Chest
extends CharacterBody2D

const MAX_HP: int = 2
const GOLD_REWARD: int = 5

@onready var closed_root: Node2D = $Closed
@onready var open_root: Node2D = $Open
@onready var collision_shape: CollisionShape2D = $CollisionShape2D

var hp: int = MAX_HP
var _opened: bool = false

signal chest_opened(world_pos: Vector2)

func _ready() -> void:
	# Hero's swing iterates "enemies" → call take_hit. main.gd's
	# wave-clear logic filters "breakables" out of the live count so
	# chests never block room progression.
	add_to_group("enemies")
	add_to_group("breakables")
	hp = MAX_HP
	# Start in CLOSED visual state. Open visuals are pre-built but
	# hidden so we can swap modulate/visibility on break with zero
	# extra instantiation.
	if open_root != null:
		open_root.visible = false
	if closed_root != null:
		closed_root.visible = true

# iter-101 BUG FIX: signature was `take_hit(damage)` (1 arg). The iter-43
# crit pass updated every primary damage path (sword swing, dash strike,
# dash pierce, blast projectile, STORM chain) to pass `(damage, is_crit)`
# (2 args). Chests join the "enemies" group at _ready (line 37), so
# get_tree().get_nodes_in_group("enemies") iterators dispatched 2-arg
# calls to a 1-arg signature → Godot 4 GDScript "Invalid call,
# Nonexistent function with 2 arguments" at runtime → call returns null
# → chest never takes damage. Chests were unbreakable by ordinary melee
# + dash + blast. Only legacy 1-arg callers (soul_burst, kill_explosion,
# shadow_shockwave, ember_burst, fire_pool, shock_pulse) could break
# them. Defaulted `_is_crit` arg accepts the 2-arg dispatch without
# changing chest visuals (no crit color needed on a treasure box).
func take_hit(damage: int, _is_crit: bool = false) -> void:
	if _opened:
		return
	hp -= damage
	# Flash white on each hit — same convention as Enemy.take_hit so
	# the chest reads as "yes, that connected" without any new VFX.
	if closed_root != null:
		var tween: Tween = create_tween()
		tween.tween_property(closed_root, "modulate", Color(2, 2, 2, 1), 0.04)
		tween.tween_property(closed_root, "modulate", Color(1, 1, 1, 1), 0.10)
	Events.enemy_hit.emit(global_position)
	if hp <= 0:
		_open()

func _open() -> void:
	_opened = true
	# Stop participating in the "enemies" iteration entirely — leaving
	# the chest in the group after opening would let further swings
	# re-trigger take_hit (cheap, but visually noisy if a player keeps
	# attacking the spot).
	remove_from_group("enemies")
	# Disable the body collider so the hero can walk OVER the opened
	# chest. Deferred so we don't mutate physics state mid-callback.
	if collision_shape != null:
		collision_shape.set_deferred("disabled", true)
	# Visual swap: closed → open. The open node tree was already
	# instanced in the scene file; we just flip visibility.
	if closed_root != null:
		closed_root.visible = false
	if open_root != null:
		open_root.visible = true
	# Floating "+5 GOLD" label using the existing damage-number system
	# so it shares font / outline / rise animation with combat numbers.
	var n: DamageNumber = DamageNumber.spawn(
		global_position + Vector2(0, -36),
		"+%d GOLD" % GOLD_REWARD,
		Color(1, 0.86, 0.36)
	)
	# iter-72 bug-fix: defensive get_parent() null guard. If the chest
	# is opened during scene teardown (e.g. a queued attack lands on the
	# same frame as a scene change), get_parent() can be null and the
	# add_child call would crash. Free the orphan DamageNumber if we
	# can't park it under our parent.
	var parent_node: Node = get_parent()
	if parent_node != null:
		parent_node.add_child(n)
	else:
		n.queue_free()
	# Fire the same pickup event a pedestal claim fires → audio /
	# screen flash autoloads respond without any chest-specific code.
	Events.pickup_claimed.emit(global_position, "gold")
	chest_opened.emit(global_position)
