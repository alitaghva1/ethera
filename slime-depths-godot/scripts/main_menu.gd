# MainMenu — title-screen Control. Three buttons (BEGIN / SETTINGS /
# QUIT). Buttons grow 1.05× on hover via a small Tween, and the BEGIN
# button is focused on _ready so the player can drive the menu with
# the keyboard from frame 1.
#
# Visuals: layered radial-purple-bloom background + glow-Label-behind
# trick on the title (Godot Labels don't blur, so a fatter copy sits
# behind at gold half-opacity). Title pulses subtly via an infinite
# tween, hairlines flank the title above + below.
extends Control

const HAMLET_SCENE_PATH := "res://scenes/hamlet.tscn"
const SETTINGS_SCENE_PATH := "res://scenes/settings_screen.tscn"
const HOVER_SCALE := 1.05
const HOVER_TWEEN_TIME := 0.12
# Title pulse — 0.97×→1.03× over ~1.25s, then back. Loops forever.
const TITLE_PULSE_MIN := 0.97
const TITLE_PULSE_MAX := 1.03
const TITLE_PULSE_HALF_DURATION := 1.25

@onready var begin_button: Button = $CenterStack/BeginButton
@onready var settings_button: Button = $CenterStack/SettingsButton
@onready var quit_button: Button = $CenterStack/QuitButton
@onready var title: Label = $TitleBlock/Title
@onready var title_glow: Label = $TitleBlock/TitleGlow

# Per-button tween cache. Storing the active tween lets a follow-up
# hover_exited correctly kill the in-flight grow-in animation so the
# button doesn't end up stuck at scale 1.05 if the cursor passes
# quickly. (Same pattern as slime-depths' fx.js tween management.)
var _hover_tweens: Dictionary = {}
var _title_tween: Tween

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

	# Pivot both title labels at their own center so the pulse looks
	# symmetric. Done once at _ready and re-pinned on resize.
	_recenter_title_pivots()
	title.resized.connect(_recenter_title_pivots)
	title_glow.resized.connect(_recenter_title_pivots)
	_start_title_pulse()

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
	var tween: Tween = create_tween()
	tween.set_trans(Tween.TRANS_QUAD)
	tween.set_ease(Tween.EASE_OUT)
	tween.tween_property(button, "scale", Vector2(target, target), HOVER_TWEEN_TIME)
	_hover_tweens[button] = tween

func _recenter_title_pivots() -> void:
	title.pivot_offset = title.size / 2.0
	title_glow.pivot_offset = title_glow.size / 2.0

# Infinite-loop pulse on the title scale. The glow Label rides along so
# the bloom stays anchored under the foreground text.
func _start_title_pulse() -> void:
	if _title_tween and _title_tween.is_valid():
		_title_tween.kill()
	_title_tween = create_tween()
	_title_tween.set_loops()
	_title_tween.set_trans(Tween.TRANS_SINE)
	_title_tween.set_ease(Tween.EASE_IN_OUT)
	_title_tween.tween_method(_apply_title_scale, TITLE_PULSE_MIN, TITLE_PULSE_MAX, TITLE_PULSE_HALF_DURATION)
	_title_tween.tween_method(_apply_title_scale, TITLE_PULSE_MAX, TITLE_PULSE_MIN, TITLE_PULSE_HALF_DURATION)

func _apply_title_scale(s: float) -> void:
	var v: Vector2 = Vector2(s, s)
	title.scale = v
	# Glow breathes a hair wider than the main title so the bloom feels
	# softly anchored without "clicking" alignment-wise.
	title_glow.scale = v * 1.02
