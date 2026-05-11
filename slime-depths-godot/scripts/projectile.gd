# Projectile — a flying bolt that damages whatever group it's aimed at.
# Used for both the hero's blast spell AND enemy ranged casts (wizard's
# arcane orb, future bomber lobs, etc).
#
# Configure per-instance:
#   • target_group   "enemies" (hero blast) or "hero" (enemy cast)
#   • damage         flat damage on hit
#   • velocity       initial direction × speed
#   • orb_tint       optional Color (defaults to magenta for hero,
#                     cyan-blue for enemy)
#
# Refactored Iter 4 to support both hero + enemy attacks via a single
# scene + script. Previously hero-only. The collision_mask is set in
# code (not in the .tscn) so the project doesn't need two parallel
# scenes with hardcoded masks for the same behavior.
class_name Projectile
extends Area2D

const SPEED    := 520.0
const LIFETIME := 1.4

@export var target_group: String = "enemies"
@export var orb_tint: Color = Color(1, 0.55, 1, 1)         # magenta default

var velocity := Vector2.ZERO
var damage   := 1

@onready var glow: PointLight2D = $PointLight2D
@onready var orb: Sprite2D = $Sprite2D
var _life := LIFETIME

func _ready() -> void:
	body_entered.connect(_on_body_entered)
	# Configure collisions based on who we're meant to hurt.
	# Layer naming (project.godot): 1=world, 2=hero, 3=enemies, 4=hero_attack
	# Always hit world walls (1). Plus the target's layer:
	#   target=enemies → mask=1+4=5 (world + enemies layer 3)
	#   target=hero    → mask=1+2=3 (world + hero layer 2)
	collision_mask = 1 + (4 if target_group == "enemies" else 2)
	# Place self on the matching attack layer so anything that filters
	# "incoming attacks" can pick us out.
	collision_layer = 8 if target_group == "enemies" else 16
	# Apply tint + light color from per-cast configuration.
	if orb != null:
		orb.modulate = orb_tint
	if glow != null:
		glow.color = orb_tint
	# Align visuals to flight direction.
	if velocity.length() > 0.0:
		rotation = velocity.angle()

func _physics_process(delta: float) -> void:
	global_position += velocity * delta
	_life -= delta
	if _life <= 0.0:
		queue_free()
	if glow != null:
		glow.energy = max(0.3, 1.6 * (_life / LIFETIME))

func _on_body_entered(body: Node) -> void:
	if body.is_in_group(target_group):
		# Enemies expose take_hit; hero exposes take_damage. Both are
		# safe-to-call no-ops if missing.
		if body.has_method("take_hit"):
			body.take_hit(damage)
		elif body.has_method("take_damage"):
			body.take_damage(damage)
	queue_free()
