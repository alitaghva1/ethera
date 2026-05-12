# FootstepDust — iter 85 immersion pass. Small ground-dust burst at
# hero's feet on every step. Hero.gd emits Events.hero_stepped at a
# distance-based cadence; that beat spawns one of these.
#
# Same restraint principle as iter-83 blood marks: a SMALL piece of
# visible floor contact per beat, so the player feels the hero TOUCHING
# the dungeon floor instead of gliding above it. Audio.gd's hero_stepped
# handler plays a step sound; this is the visual companion.
#
# Self-frees ~0.5s after spawn (lifetime 0.35 + grace).
class_name FootstepDust
extends Node2D

# Lifetime after which the node self-frees. Slightly longer than the
# particle lifetime so even the last few specks finish their alpha curve.
const SELF_FREE_AFTER: float = 0.55

# Y offset below hero center so dust spawns AT FEET, not center of
# hero sprite. Hero sprite is positioned at -23 in hero.tscn; feet
# are roughly at y=4-8 relative to hero global_position.
const FEET_Y_OFFSET: float = 8.0

# Static factory — mirrors BloodMark.spawn pattern. Loads the scene,
# positions at world_pos + FEET_Y_OFFSET, parents under host.
static func spawn(host: Node, world_pos: Vector2) -> FootstepDust:
	var scene: PackedScene = load("res://scenes/fx/footstep_dust.tscn") as PackedScene
	if scene == null:
		return null
	var d: FootstepDust = scene.instantiate() as FootstepDust
	if d == null:
		return null
	d.global_position = world_pos + Vector2(0, FEET_Y_OFFSET)
	host.add_child(d)
	return d

func _ready() -> void:
	# Self-free after lifetime + grace. The CPUParticles2D one_shot
	# fires its burst, particles age out, then the parent node frees.
	await get_tree().create_timer(SELF_FREE_AFTER).timeout
	if is_inside_tree():
		queue_free()
