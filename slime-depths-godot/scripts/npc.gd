# NPC — a static character the hero can talk to. Walks into Area2D
# detection range → "[E] talk to NAME" prompt → press E → Dialogue.show.
#
# Slice approach: placeholder ColorRect body + name label above + a
# floating "!" hint when player is in range. Real pixel-art NPC art
# is a follow-up (the slime-depths cainos hamlet assets are an option;
# we'd just swap the ColorRect for a Sprite2D).
class_name NPC
extends Area2D

@export var npc_name: String = "Stranger"
@export var lines: Array[String] = ["..."]
@export var body_color: Color = Color(0.78, 0.65, 0.41, 1)
# When set, the Sprite child renders this pixel-art texture and the
# ColorRect placeholder body is hidden. Null = use ColorRect fallback.
@export var npc_texture: Texture2D = null

@onready var body: ColorRect = $Body
@onready var sprite: Sprite2D = $Sprite
@onready var name_label: Label = $NameLabel
@onready var prompt: Label = $Prompt

var _player_in_range := false

func _ready() -> void:
	if npc_texture != null:
		sprite.texture = npc_texture
		sprite.visible = true
		body.visible = false
	else:
		body.color = body_color
		body.visible = true
		sprite.visible = false
	name_label.text = npc_name
	prompt.visible = false
	body_entered.connect(_on_body_entered)
	body_exited.connect(_on_body_exited)

func _on_body_entered(body: Node) -> void:
	if body.is_in_group("hero"):
		_player_in_range = true
		prompt.visible = true

func _on_body_exited(body: Node) -> void:
	if body.is_in_group("hero"):
		_player_in_range = false
		prompt.visible = false

func _input(ev: InputEvent) -> void:
	if not _player_in_range:
		return
	if ev.is_action_pressed("interact") and not Dialogue.is_open():
		Dialogue.show_lines(lines, npc_name)
		get_viewport().set_input_as_handled()
