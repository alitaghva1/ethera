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
# executioner relic — set TRUE at fire time by hero._start_blast when the
# relic was owned at cast. Locked at fire time so a late pickup doesn't
# retroactively buff in-flight orbs. Evaluated against the target's HP
# ratio in _on_body_entered (the only point at which the projectile knows
# WHO it's about to hurt).
var executioner_active: bool = false

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
	# Iter 19 — spawn-pop. Start at 60% scale and ease out to full
	# size over 50 ms. Combined with the muzzle flash spawned by
	# hero.gd at the same world position, the launch reads as a
	# punctuated "BANG fire" instead of "projectile fades in".
	scale = Vector2(0.6, 0.6)
	var tw: Tween = create_tween()
	tw.set_trans(Tween.TRANS_QUAD)
	tw.set_ease(Tween.EASE_OUT)
	tw.tween_property(self, "scale", Vector2.ONE, 0.05)

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
		var dmg_out: int = damage
		# executioner — gate ONLY on enemy bodies (skip for friendly-fire
		# orbs aimed at "hero"). 25% HP threshold matches the melee path.
		if executioner_active and target_group == "enemies" and _is_low_hp(body):
			dmg_out = int(round(float(damage) * 2.5))
		if body.has_method("take_hit"):
			body.take_hit(dmg_out)
		elif body.has_method("take_damage"):
			body.take_damage(dmg_out)
	queue_free()

# executioner helper — duplicated shape of hero._is_executable so the
# projectile can evaluate at impact without coupling to the hero node.
# Reads body.hp (int) and body.enemy_type.max_hp (int); returns false
# defensively on missing fields so a degenerate enemy never crashes.
func _is_low_hp(body: Node) -> bool:
	if not is_instance_valid(body):
		return false
	if not ("hp" in body):
		return false
	var cur_hp: int = int(body.get("hp"))
	var max_val: int = 0
	if "enemy_type" in body:
		var et: Variant = body.get("enemy_type")
		if et != null and "max_hp" in et:
			max_val = int(et.get("max_hp"))
	if max_val <= 0:
		return false
	var ratio: float = float(cur_hp) / float(max_val)
	return ratio < 0.25
