# SettingsScreen — volume slider + canonical controls list. Slider
# routes to the Audio autoload (which writes to AudioServer's master
# bus). Value isn't persisted across sessions yet — that lands when
# we add a save system.
#
# The controls list is read-only labels for now. Remap-friendly UI is
# a follow-up; the controls match input_setup.gd's bindings 1:1.
extends Control

const MAIN_MENU_SCENE_PATH := "res://scenes/main_menu.tscn"
const HOVER_SCALE := 1.05
const HOVER_TWEEN_TIME := 0.12

@onready var back_button: Button = $Content/BackButton
@onready var volume_slider: HSlider = $Content/VolumeRow/VolumeSlider
@onready var volume_value: Label = $Content/VolumeRow/VolumeValue

var _hover_tween: Tween

func _ready() -> void:
	back_button.pressed.connect(_on_back_pressed)
	volume_slider.value_changed.connect(_on_volume_changed)

	# Same hover-grow recipe as MainMenu — kept inline rather than
	# extracted into a shared helper because there's only one button
	# here. If a third screen reuses the pattern, lift to a UiHelpers
	# autoload.
	back_button.pivot_offset = back_button.size / 2.0
	back_button.mouse_entered.connect(_on_back_hover_enter)
	back_button.mouse_exited.connect(_on_back_hover_exit)
	back_button.focus_entered.connect(_on_back_hover_enter)
	back_button.focus_exited.connect(_on_back_hover_exit)
	back_button.resized.connect(func ():
		back_button.pivot_offset = back_button.size / 2.0
	)

	# Slider grabs initial focus so keyboard players can adjust volume
	# without reaching for the mouse.
	volume_slider.grab_focus()
	volume_value.text = str(int(volume_slider.value))
	# Push the current slider value through Audio on open so the live
	# bus volume matches whatever the slider's at — important if the
	# scene re-opens after the user changed something.
	Audio.set_master_volume(volume_slider.value / 100.0)

func _on_volume_changed(value: float) -> void:
	volume_value.text = str(int(value))
	# 0..100 linear slider → 0..1 linear → dB via Audio autoload helper.
	# linear_to_db clamps to a usable range; mute below threshold.
	Audio.set_master_volume(value / 100.0)

func _on_back_pressed() -> void:
	get_tree().change_scene_to_file(MAIN_MENU_SCENE_PATH)

func _on_back_hover_enter() -> void:
	_animate_back_scale(HOVER_SCALE)

func _on_back_hover_exit() -> void:
	_animate_back_scale(1.0)

func _animate_back_scale(target: float) -> void:
	if _hover_tween and _hover_tween.is_valid():
		_hover_tween.kill()
	_hover_tween = create_tween()
	_hover_tween.set_trans(Tween.TRANS_QUAD)
	_hover_tween.set_ease(Tween.EASE_OUT)
	_hover_tween.tween_property(back_button, "scale", Vector2(target, target), HOVER_TWEEN_TIME)

func _unhandled_input(ev: InputEvent) -> void:
	# ESC also returns to the title — a common convention players try.
	if ev is InputEventKey and ev.pressed and ev.physical_keycode == KEY_ESCAPE:
		_on_back_pressed()
