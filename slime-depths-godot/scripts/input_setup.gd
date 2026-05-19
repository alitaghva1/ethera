# Autoload that registers input actions at startup. Avoids writing the
# (verbose, error-prone) input map straight into project.godot — Godot
# normalizes input events on first save anyway, so registering them in
# code is cleaner and easier to audit/diff.
#
# Actions wired:
#   move_up      W
#   move_down    S
#   move_left    A
#   move_right   D
#   attack       Left mouse button
#   blast        Right mouse button (added Iter 3 — ranged spell)
#   shield       Q (Iter 5 → renamed from parry in iter-95)
#   dash_strike  Shift (Iter 5 — burst + AoE slash; iter-95 made it the
#                only defensive movement option after dodge was removed)
#   interact     E (added Iter 2 — talk to NPCs, advance dialogue)
#
# iter-95: dodge binding (Space) deleted along with the dodge ability.
# The defensive toolkit is now shield (timing-based catch) + dash_strike
# (movement-based engage with i-frames). Space remains unbound.
extends Node

func _ready() -> void:
	_bind_key("move_up",     KEY_W)
	_bind_key("move_down",   KEY_S)
	_bind_key("move_left",   KEY_A)
	_bind_key("move_right",  KEY_D)
	_bind_key("shield",      KEY_Q)
	_bind_key("dash_strike", KEY_SHIFT)
	_bind_key("interact",    KEY_E)
	_bind_mouse("attack", MOUSE_BUTTON_LEFT)
	_bind_mouse("blast",  MOUSE_BUTTON_RIGHT)
	# Physics-tether prototype (post-iter-157 pivot). Held to yank the
	# CursedGravestone toward the player; release for momentum. Right
	# mouse is bound to both `blast` (used by the main game) and
	# `tether_pull` (used by the prototype) — they coexist because
	# each scene only reads one of them.
	_bind_key("tether_pull",   KEY_SPACE)
	_bind_mouse("tether_pull", MOUSE_BUTTON_RIGHT)

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
