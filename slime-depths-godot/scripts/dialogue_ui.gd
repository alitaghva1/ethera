# Dialogue — autoload singleton that owns a CanvasLayer + dialogue box
# Control. Any scene calls `Dialogue.show(["line 1", "line 2"], "Smith")`
# to start a conversation. Player presses the "interact" action (E) to
# advance the line; closes after the last line.
#
# Lives as an autoload so the same overlay survives scene changes —
# hamlet NPCs and (future) dungeon characters share one UI.
extends CanvasLayer

@onready var panel: Panel = $Panel
@onready var speaker_label: Label = $Panel/Speaker
@onready var body_label: Label = $Panel/Body
@onready var prompt_label: Label = $Panel/Prompt

var _lines: Array[String] = []
var _index := 0
var _active := false

signal opened
signal closed
signal advanced

func _ready() -> void:
	# Layer 100 → renders above all in-game HUD layers.
	layer = 100
	panel.visible = false

func show_lines(lines: Array, speaker: String = "") -> void:
	if lines.is_empty():
		return
	_lines.clear()
	for l in lines:
		_lines.append(str(l))
	_index = 0
	_active = true
	speaker_label.text = speaker
	body_label.text = _lines[0]
	panel.visible = true
	opened.emit()

func _input(ev: InputEvent) -> void:
	if not _active:
		return
	# Advance on either interact-press or LMB-click — players often try both.
	var pressed := false
	if ev.is_action_pressed("interact"):
		pressed = true
	elif ev is InputEventMouseButton and ev.pressed and ev.button_index == MOUSE_BUTTON_LEFT:
		pressed = true
	if not pressed:
		return
	get_viewport().set_input_as_handled()
	_index += 1
	if _index >= _lines.size():
		_close()
	else:
		body_label.text = _lines[_index]
		advanced.emit()

func _close() -> void:
	_active = false
	panel.visible = false
	closed.emit()

func is_open() -> bool:
	return _active
