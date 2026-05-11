# Autoload that registers input actions at startup. Avoids writing the
# (verbose, error-prone) input map straight into project.godot — Godot
# normalizes input events on first save anyway, so registering them in
# code is cleaner and easier to audit/diff.
#
# Actions wired:
#   move_up    W
#   move_down  S
#   move_left  A
#   move_right D
#   attack     Left mouse button
#   dodge      Space (added Iter 1)
#   interact   E (added Iter 2 — talk to NPCs, advance dialogue)
extends Node

func _ready() -> void:
	_bind_key("move_up",    KEY_W)
	_bind_key("move_down",  KEY_S)
	_bind_key("move_left",  KEY_A)
	_bind_key("move_right", KEY_D)
	_bind_key("dodge",      KEY_SPACE)
	_bind_key("interact",   KEY_E)
	_bind_mouse("attack", MOUSE_BUTTON_LEFT)

func _bind_key(action: StringName, keycode: int) -> void:
	if not InputMap.has_action(action):
		InputMap.add_action(action)
	var ev := InputEventKey.new()
	ev.physical_keycode = keycode
	InputMap.action_add_event(action, ev)

func _bind_mouse(action: StringName, button: int) -> void:
	if not InputMap.has_action(action):
		InputMap.add_action(action)
	var ev := InputEventMouseButton.new()
	ev.button_index = button
	InputMap.action_add_event(action, ev)
