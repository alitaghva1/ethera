# Door — Area2D trigger spawned in the dungeon's east wall after the
# room clears. Walking into it advances RunState to the next room and
# reloads the dungeon scene.
#
# Iter 12: hamlet removed. Door is the ONLY scene-transition surface
# in active gameplay — it advances to the next room, or routes to the
# main menu defensively if RunState.advance() returns false (which
# normally shouldn't happen because the last room spawns a Pedestal,
# not a Door, but we handle it cleanly).
#
# Iter 18 visual rework: layered stone arched doorway. The pulse +
# scale animation lives on the inner Portal polygon now (not the
# whole node); the arch FRAME stays solid so the silhouette reads
# stably while the glow breathes. The PointLight2D + CPUParticles2D
# in the scene do the heavy lifting on "this is alive" — we just
# modulate the portal alpha + scale on a slow sine.
class_name Door
extends Area2D

@onready var portal: Polygon2D = $Portal
@onready var portal_glow: PointLight2D = $PortalGlow
@onready var label: Label = $Label

var _firing := false
var _base_portal_color: Color = Color(1, 1, 1, 1)
var _base_glow_energy: float = 1.4

func _ready() -> void:
	body_entered.connect(_on_body_entered)
	# Cache the design-time values so the per-frame pulse multiplies
	# them rather than overwriting them with hard-coded constants.
	if portal != null:
		_base_portal_color = portal.color
	if portal_glow != null:
		_base_glow_energy = portal_glow.energy

func _process(_delta: float) -> void:
	# Slow gold pulse — portal alpha oscillates ~0.78..1.0, glow
	# energy 1.2..1.6. Combined with the always-emitting motes the
	# door reads as breathing.
	var t := Time.get_ticks_msec() / 1000.0
	if portal != null:
		var pulse: float = 0.78 + 0.22 * (0.5 + 0.5 * sin(t * 2.4))
		portal.color = Color(
			_base_portal_color.r,
			_base_portal_color.g,
			_base_portal_color.b,
			_base_portal_color.a * pulse,
		)
	if portal_glow != null:
		portal_glow.energy = _base_glow_energy + 0.25 * sin(t * 2.4)

func _on_body_entered(body: Node) -> void:
	if _firing or not body.is_in_group("hero"):
		return
	_firing = true
	# Brief delay so the player sees they hit the door before the
	# screen swaps. Reset time_scale defensively in case a hit-stop
	# was still in flight.
	Engine.time_scale = 1.0
	if RunState.advance():
		# More rooms left — reload the dungeon scene so it re-reads
		# the new current_room_config from RunState.
		await get_tree().create_timer(0.15).timeout
		get_tree().change_scene_to_file("res://scenes/main.tscn")
	else:
		# Last room already cleared — RunState returned false. Should
		# not normally happen because the last room spawns a Pedestal
		# instead of a Door, but route to the main menu defensively.
		RunState.end_floor()
		await get_tree().create_timer(0.15).timeout
		get_tree().change_scene_to_file("res://scenes/main_menu.tscn")
