# Door — Area2D trigger spawned in the dungeon's east wall after the
# room clears. Walking into it advances RunState to the next room and
# reloads the dungeon scene.
#
# Iter 12: hamlet removed. Door is now the ONLY scene-transition surface
# in active gameplay — it advances to the next room, or routes to the
# main menu defensively if RunState.advance() returns false (which
# normally shouldn't happen because the last room spawns a Pedestal,
# not a Door, but we handle it cleanly).
#
# Visual: a wide glowing rectangle pulsing with the same warm gold as
# torchlight, so it reads as "warmth ahead" rather than a separate
# magic portal. Floor-clear cinematic in a future phase can dramatize
# it more.
class_name Door
extends Area2D

@onready var glow: ColorRect = $Glow
@onready var label: Label = $Label

var _firing := false

func _ready() -> void:
	body_entered.connect(_on_body_entered)

func _process(_delta: float) -> void:
	# Soft alpha pulse — same recipe as Portal so the visual language
	# of "step here to transition" is consistent.
	var t := Time.get_ticks_msec() / 1000.0
	glow.modulate.a = 0.55 + 0.25 * sin(t * 3.0)

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
