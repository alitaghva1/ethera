# SettingsScreen — volume slider + canonical controls list. Slider
# routes to the Audio autoload (which writes to AudioServer's master
# bus). Value isn't persisted across sessions yet — that lands when
# we add a save system.
#
# The controls list is read-only tabulated labels for now. Remap-
# friendly UI is a follow-up; the controls match input_setup.gd's
# bindings 1:1.
#
# Visuals: same layered radial-bloom background + back-glow Label trick
# on the title as the main menu, for visual continuity between screens.
extends Control

const MAIN_MENU_SCENE_PATH := "res://scenes/main_menu.tscn"
const HOVER_SCALE := 1.05
const HOVER_TWEEN_TIME := 0.12
# Title pulse — slower / shallower than the main menu so the settings
# screen feels calmer.
const TITLE_PULSE_MIN := 0.98
const TITLE_PULSE_MAX := 1.02
const TITLE_PULSE_HALF_DURATION := 1.4

@onready var back_button: Button = $Content/BackButton
@onready var volume_slider: HSlider = $Content/VolumeRow/VolumeSlider
@onready var volume_value: Label = $Content/VolumeRow/VolumeValue
@onready var title: Label = $TitleBlock/Title
@onready var title_glow: Label = $TitleBlock/TitleGlow

var _hover_tween: Tween
var _title_tween: Tween

# Iter-71 polish: when opened from the pause overlay rather than as a
# top-level scene (e.g. from main menu or death screen), we are a child
# Control of PauseScreen and need to queue_free on BACK instead of
# scene-changing. PauseScreen sets this flag right after instantiation.
var _is_overlay: bool = false

func _ready() -> void:
	# iter-112: Fade up from black on settings entry — unless we were
	# opened as an OVERLAY on top of the pause menu (in which case the
	# pause screen is alive underneath and a black wash would dim it
	# inappropriately). _is_overlay is set by PauseScreen BEFORE add_child,
	# so by _ready time it's already correct. Scene-mode entries (from
	# the main menu) get the fade.
	if not _is_overlay:
		ScreenFlash.fade_from_black(0.40)
	# Seed the slider from the persisted GameState value BEFORE wiring
	# the value_changed signal — otherwise this initial set fires the
	# handler and triggers a redundant save on screen open.
	# master_volume is in linear 0..1 space; slider is 0..100.
	volume_slider.set_value_no_signal(GameState.master_volume * 100.0)

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

	# Title pulse — identical pattern to main_menu.gd, just gentler.
	_recenter_title_pivots()
	title.resized.connect(_recenter_title_pivots)
	title_glow.resized.connect(_recenter_title_pivots)
	_start_title_pulse()

	# BACK is the primary action on this screen, so it gets initial
	# keyboard focus. Players who want to drag the slider grab it with
	# the mouse or Tab through.
	back_button.grab_focus()
	volume_value.text = str(int(volume_slider.value))
	# Push the current slider value through Audio on open so the live
	# bus volume matches whatever the slider's at — important if the
	# scene re-opens after the user changed something.
	Audio.set_master_volume(volume_slider.value / 100.0)

func _on_volume_changed(value: float) -> void:
	volume_value.text = str(int(value))
	# 0..100 linear slider → 0..1 linear → dB via Audio autoload helper.
	# linear_to_db clamps to a usable range; mute below threshold.
	var linear: float = value / 100.0
	Audio.set_master_volume(linear)
	# Persist immediately so volume survives a quit. Slider drag fires
	# value_changed continuously, but SaveSystem.save_now() is cheap
	# (small JSON, .tmp + rename) so flushing on every tick is fine
	# for our save-file size. If save cost ever balloons, debounce here.
	GameState.master_volume = linear
	SaveSystem.save_now()

func _on_back_pressed() -> void:
	# Overlay mode (opened from PauseScreen): the dungeon scene is alive
	# underneath and we just queue_free ourselves — the pause menu is
	# restored to interactive state. Scene-mode: jump back to main menu
	# as before. iter-112: in scene-mode, fade to black first so the
	# transition back to the main menu mirrors the AWAKEN → dungeon
	# fade. Overlay mode skips the fade (settings is just dismissed,
	# the dungeon below is already visible).
	# iter-114: ui_press cue on either path.
	Audio.play_ui_cue("ui_press", -2.0)
	if _is_overlay:
		queue_free()
		return
	await ScreenFlash.fade_to_black(0.30)
	get_tree().change_scene_to_file(MAIN_MENU_SCENE_PATH)

func _on_back_hover_enter() -> void:
	# iter-114: ui_hover cue. Matches main_menu / pause_screen /
	# death_screen so navigating the BACK button feels acoustically
	# consistent with every other UI screen in the kit.
	Audio.play_ui_cue("ui_hover", -8.0)
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
	# ESC closes settings — back to title in scene mode, back to the
	# pause overlay in overlay mode. _on_back_pressed branches on
	# _is_overlay so the same handler covers both cases.
	if ev is InputEventKey and ev.pressed and ev.physical_keycode == KEY_ESCAPE:
		_on_back_pressed()
		# Iter-71 polish: claim the event so PauseScreen's ESC handler
		# (which would resume the whole game) doesn't fire.
		if _is_overlay:
			get_viewport().set_input_as_handled()

func _recenter_title_pivots() -> void:
	title.pivot_offset = title.size / 2.0
	title_glow.pivot_offset = title_glow.size / 2.0

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
	title_glow.scale = v * 1.02
