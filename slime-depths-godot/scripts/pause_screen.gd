# PauseScreen — mid-run pause overlay.
#
# Mounted by main.gd on the first ESC press during an active run; the
# overlay sets `get_tree().paused = true` and its CanvasLayer root
# carries PROCESS_MODE_WHEN_PAUSED (3) so the embers + button tweens
# keep ticking while the world below freezes.
#
# Three buttons:
#   • RESUME       → unpause + queue_free() this overlay
#   • SETTINGS     → swap in scenes/settings_screen.tscn via
#                    change_scene_to_file. The run state is owned by
#                    the RunState autoload (NOT by the dungeon Main
#                    scene), so this discards the dungeon scene but
#                    the run can still be resumed from the menu via
#                    BEGIN — same as the main_menu Settings flow.
#                    For an in-place overlay we'd need a re-entrant
#                    settings screen; deferred for now.
#   • QUIT TO MENU → unpause + change_scene_to_file(main_menu). No
#                    confirm dialog — fast path. If the player ESC'd
#                    by accident they can hit RESUME first.
#
# ESC while the overlay is up resumes (same as pressing RESUME). The
# host (main.gd) only mounts when not already paused; once the overlay
# exists, IT owns the ESC handling because its `_unhandled_input` runs
# (PROCESS_MODE_WHEN_PAUSED) while main.gd's does not.
extends CanvasLayer

const MAIN_MENU_SCENE_PATH := "res://scenes/main_menu.tscn"
const SETTINGS_SCENE_PATH := "res://scenes/settings_screen.tscn"
const SETTINGS_SCENE: PackedScene = preload("res://scenes/settings_screen.tscn")

const HOVER_SCALE := 1.05
const HOVER_TWEEN_TIME := 0.12

@onready var resume_button: Button = $CenterStack/ResumeButton
@onready var settings_button: Button = $CenterStack/SettingsButton
@onready var quit_button: Button = $CenterStack/QuitButton

# Per-button hover-tween cache — same pattern as main_menu.gd so a fast
# cursor pass doesn't leave a button stuck at scale 1.05.
var _hover_tweens: Dictionary = {}

func _ready() -> void:
	# Wire buttons.
	resume_button.pressed.connect(_on_resume_pressed)
	settings_button.pressed.connect(_on_settings_pressed)
	quit_button.pressed.connect(_on_quit_pressed)

	# Hover-scale wiring — mirrors main_menu.gd. Each button pivots at
	# its own center so the grow looks symmetric, and we re-pin on
	# resize for viewport-rescale safety.
	for btn in [resume_button, settings_button, quit_button]:
		var b: Button = btn
		b.pivot_offset = b.size / 2.0
		b.mouse_entered.connect(_on_button_hover_enter.bind(b))
		b.mouse_exited.connect(_on_button_hover_exit.bind(b))
		b.focus_entered.connect(_on_button_hover_enter.bind(b))
		b.focus_exited.connect(_on_button_hover_exit.bind(b))
		b.resized.connect(func ():
			b.pivot_offset = b.size / 2.0
		)

	# Pause the tree NOW — main.gd instantiates us but doesn't set
	# get_tree().paused, so owning that flip keeps the responsibility
	# local. _exit_tree() undoes it as a safety net.
	get_tree().paused = true

	# iter-102: fade-in tween. The pause overlay was hard-cutting to
	# full opacity in one frame — reads as an alt-tab. 0.20s is faster
	# than the death-screen fade (0.35s) because pause has to feel
	# responsive (player wants the menu NOW). process_mode + the tween's
	# pause_mode = PROCESS handles the get_tree().paused = true above:
	# without explicit pause_mode, the tween would freeze immediately
	# and the overlay would stay at alpha 0.
	# iter-107 FIX: CanvasLayer doesn't have a `modulate` property
	# (only CanvasItem subclasses do). Iter-102 broke load with
	# "Identifier 'modulate' not declared." Tween each CanvasItem
	# CHILD's modulate in parallel instead.
	var fade_tw: Tween = create_tween()
	fade_tw.set_parallel(true)
	fade_tw.set_pause_mode(Tween.TWEEN_PAUSE_PROCESS)
	fade_tw.set_trans(Tween.TRANS_QUAD)
	fade_tw.set_ease(Tween.EASE_OUT)
	for child in get_children():
		if child is CanvasItem:
			var ci: CanvasItem = child
			ci.modulate.a = 0.0
			fade_tw.tween_property(ci, "modulate:a", 1.0, 0.20)

	# Default keyboard focus on RESUME — the safest first action.
	# Defer by one frame so focus applies AFTER the layer becomes
	# visible (Control focus is not applied to a hidden subtree).
	await get_tree().process_frame
	resume_button.grab_focus()

func _exit_tree() -> void:
	# Defensive — if for any reason this overlay is freed without
	# routing through _on_resume_pressed (e.g. a scene change from a
	# button), make sure the tree is unpaused so the next scene runs.
	get_tree().paused = false

# ESC handling. Because our process_mode is PROCESS_MODE_WHEN_PAUSED,
# our _unhandled_input fires while main.gd's is frozen — so we own ESC
# while the overlay is up.
func _unhandled_input(ev: InputEvent) -> void:
	# Iter-71 polish: when settings is up as an overlay child, defer
	# ESC to it (its own _unhandled_input closes the overlay). Without
	# this guard, pressing ESC from the settings overlay would resume
	# the whole game instead of just closing settings back to pause.
	if has_node("SettingsOverlay"):
		return
	if ev is InputEventKey and ev.pressed and ev.physical_keycode == KEY_ESCAPE:
		_on_resume_pressed()
		get_viewport().set_input_as_handled()

func _on_resume_pressed() -> void:
	# iter-114: UI press cue + scaled-down volume so the resume click
	# doesn't punch over the (now-unpaused) dungeon ambient audio.
	Audio.play_ui_cue("ui_press", -2.0)
	get_tree().paused = false
	queue_free()

func _on_settings_pressed() -> void:
	Audio.play_ui_cue("ui_press", -2.0)
	# Iter-71 polish: open settings as a CHILD overlay so the dungeon
	# scene stays alive underneath. Without this, the previous flow did
	# change_scene_to_file(settings) → discarded the dungeon → BEGIN
	# from main menu reset the run via start_dungeon_run/start_floor.
	# Now: settings sits on top of the pause overlay, RESUME after BACK
	# returns the player straight into the same room mid-pause.
	var s: Control = SETTINGS_SCENE.instantiate()
	s.name = "SettingsOverlay"
	s.set("_is_overlay", true)
	# Inherit our PROCESS_MODE_WHEN_PAUSED so the settings UI keeps
	# ticking while the world below is frozen.
	s.process_mode = Node.PROCESS_MODE_WHEN_PAUSED
	# Hide our own pause UI to avoid stack-overlap — restore on close
	# via the tree_exited signal.
	for child in get_children():
		if child is Control:
			(child as Control).visible = false
	add_child(s)
	s.tree_exited.connect(func() -> void:
		if not is_inside_tree():
			return
		for child in get_children():
			if child is Control:
				(child as Control).visible = true
		resume_button.grab_focus()
	)

func _on_quit_pressed() -> void:
	# No confirm — fast path. If the player ESC'd by mistake they
	# hit RESUME first. Unpause + RunState.end_floor() so the menu
	# reads a clean slate (parallels what _on_death_to_menu does in
	# main.gd on the death path).
	#
	# iter-114: ui_press cue + fade-to-black before the scene change,
	# matching the dungeon→menu fade pattern from iter-112. Pre-iter-114
	# this transition hard-cut from "paused dungeon under overlay" to
	# "main menu" — incongruous with every other nav fade in the game.
	Audio.play_ui_cue("ui_press", -2.0)
	get_tree().paused = false
	if Engine.get_main_loop().root.has_node("/root/RunState"):
		var rs: Node = Engine.get_main_loop().root.get_node("/root/RunState")
		if rs.has_method("end_floor"):
			rs.end_floor()
	await ScreenFlash.fade_to_black(0.30)
	get_tree().change_scene_to_file(MAIN_MENU_SCENE_PATH)

func _on_button_hover_enter(button: Button) -> void:
	# iter-114: UI hover cue — same pattern as main_menu (soft 880 Hz pip
	# at -8 dB so the menu doesn't audio-spam as the cursor brushes the
	# button stack). Keyboard focus_entered fires this too via the
	# binding in _ready, so controller / keyboard nav gets the same beat.
	Audio.play_ui_cue("ui_hover", -8.0)
	_animate_scale(button, HOVER_SCALE)

func _on_button_hover_exit(button: Button) -> void:
	_animate_scale(button, 1.0)

func _animate_scale(button: Button, target: float) -> void:
	# Cancel any in-flight tween for this button — same race-guard as
	# main_menu.gd. Tweens default to PROCESS_MODE_PAUSABLE which would
	# freeze under our paused tree; bind to PROCESS_MODE_ALWAYS so the
	# button grow continues animating while everything else is frozen.
	var prev: Tween = _hover_tweens.get(button)
	if prev and prev.is_valid():
		prev.kill()
	var tween: Tween = create_tween()
	tween.set_pause_mode(Tween.TWEEN_PAUSE_PROCESS)
	tween.set_trans(Tween.TRANS_QUAD)
	tween.set_ease(Tween.EASE_OUT)
	tween.tween_property(button, "scale", Vector2(target, target), HOVER_TWEEN_TIME)
	_hover_tweens[button] = tween
