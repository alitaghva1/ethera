# MainMenu — title-screen Control. Three buttons (BEGIN / SETTINGS /
# QUIT). Buttons grow 1.05× on hover via a small Tween, and the BEGIN
# button is focused on _ready so the player can drive the menu with
# the keyboard from frame 1.
extends Control

const HAMLET_SCENE_PATH := "res://scenes/hamlet.tscn"
const SETTINGS_SCENE_PATH := "res://scenes/settings_screen.tscn"
const HOVER_SCALE := 1.05
const HOVER_TWEEN_TIME := 0.12

@onready var begin_button: Button = $CenterStack/BeginButton
@onready var settings_button: Button = $CenterStack/SettingsButton
@onready var quit_button: Button = $CenterStack/QuitButton

# Per-button tween cache. Storing the active tween lets a follow-up
# hover_exited correctly kill the in-flight grow-in animation so the
# button doesn't end up stuck at scale 1.05 if the cursor passes
# quickly. (Same pattern as slime-depths' fx.js tween management.)
var _hover_tweens: Dictionary = {}

func _ready() -> void:
	# Wire button presses.
	begin_button.pressed.connect(_on_begin_pressed)
	settings_button.pressed.connect(_on_settings_pressed)
	quit_button.pressed.connect(_on_quit_pressed)

	# Hover scale transitions — each button's own pivot is its center
	# so the grow looks symmetric.
	for btn in [begin_button, settings_button, quit_button]:
		var b: Button = btn
		b.pivot_offset = b.size / 2.0
		b.mouse_entered.connect(_on_button_hover_enter.bind(b))
		b.mouse_exited.connect(_on_button_hover_exit.bind(b))
		b.focus_entered.connect(_on_button_hover_enter.bind(b))
		b.focus_exited.connect(_on_button_hover_exit.bind(b))
		# Resize hooks — pivot follows the button as the viewport rescales.
		b.resized.connect(func ():
			b.pivot_offset = b.size / 2.0
		)

	# Default keyboard focus.
	begin_button.grab_focus()

func _on_begin_pressed() -> void:
	get_tree().change_scene_to_file(HAMLET_SCENE_PATH)

func _on_settings_pressed() -> void:
	get_tree().change_scene_to_file(SETTINGS_SCENE_PATH)

func _on_quit_pressed() -> void:
	get_tree().quit()

func _on_button_hover_enter(button: Button) -> void:
	_animate_scale(button, HOVER_SCALE)

func _on_button_hover_exit(button: Button) -> void:
	_animate_scale(button, 1.0)

func _animate_scale(button: Button, target: float) -> void:
	# Cancel any in-flight tween for this button before starting a new
	# one — avoids the "stuck at 1.05" race when the cursor crosses
	# the button mid-tween.
	var prev: Tween = _hover_tweens.get(button)
	if prev and prev.is_valid():
		prev.kill()
	var tween := create_tween()
	tween.set_trans(Tween.TRANS_QUAD)
	tween.set_ease(Tween.EASE_OUT)
	tween.tween_property(button, "scale", Vector2(target, target), HOVER_TWEEN_TIME)
	_hover_tweens[button] = tween
