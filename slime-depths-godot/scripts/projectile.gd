# Projectile — the hero's blast spell. Area2D that flies in a straight
# line, damages the first enemy it overlaps, and frees itself on hit
# or after a lifetime cap (safety against runaway bullets).
#
# Slime-depths parity: this is the "2-blast" weapon from src/hero.js,
# simplified for the slice. Damage 1 base + relic bonuses (queried
# from GameState at spawn time so a pickup mid-wave takes effect on
# the very next cast).
class_name Projectile
extends Area2D

const SPEED    := 520.0
const LIFETIME := 1.4

var velocity := Vector2.ZERO
var damage   := 1

@onready var glow: PointLight2D = $PointLight2D
var _life := LIFETIME

func _ready() -> void:
	body_entered.connect(_on_body_entered)
	# Rotate visuals + light to match flight direction for a subtle
	# motion-vector read (not just a static orb).
	if velocity.length() > 0.0:
		rotation = velocity.angle()

func _physics_process(delta: float) -> void:
	global_position += velocity * delta
	_life -= delta
	if _life <= 0.0:
		queue_free()
	# Energy decay — the glow softens the longer the bolt flies, hinting
	# at "spell power running out" before lifetime cap.
	if glow != null:
		glow.energy = max(0.3, 1.6 * (_life / LIFETIME))

func _on_body_entered(body: Node) -> void:
	if body.is_in_group("enemies"):
		if body.has_method("take_hit"):
			body.take_hit(damage)
	# Either way (enemy or wall), the bolt ends here.
	queue_free()
