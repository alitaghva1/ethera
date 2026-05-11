# Portal — Area2D trigger that loads a target scene when the hero
# walks into it. Used for hamlet → dungeon entry (and any future
# scene-to-scene transitions).
#
# Configure per-instance via @export target_scene_path. Visual is a
# colored Sprite2D + label; collision is handled by the parent Area2D.
class_name Portal
extends Area2D

@export_file("*.tscn") var target_scene_path: String = ""
@export var portal_label: String = "DUNGEON"
@export var portal_color: Color = Color(0.45, 0.25, 0.65, 0.8)

@onready var glow: ColorRect = $Glow
@onready var label: Label = $Label

var _firing := false

func _ready() -> void:
	glow.color = portal_color
	label.text = portal_label
	body_entered.connect(_on_body_entered)

func _process(delta: float) -> void:
	# Pulse the glow alpha so the portal reads as "active" instead of
	# decorative. Mirrors slime-depths' pedestal/door pulse behavior.
	var t := Time.get_ticks_msec() / 1000.0
	var pulse := 0.55 + 0.25 * sin(t * 3.0)
	glow.modulate.a = pulse

func _on_body_entered(body: Node) -> void:
	if _firing or target_scene_path.is_empty():
		return
	if not body.is_in_group("hero"):
		return
	_firing = true
	# GameState hook — dungeon entries are tracked.
	if target_scene_path.find("main.tscn") >= 0:
		GameState.start_dungeon_run()
	# Brief delay so the player sees they walked into the portal before
	# the scene swap. Use a Timer so we don't block input.
	var t := get_tree().create_timer(0.15)
	t.timeout.connect(func ():
		Engine.time_scale = 1.0   # safety reset before changing scenes
		get_tree().change_scene_to_file(target_scene_path)
	)
