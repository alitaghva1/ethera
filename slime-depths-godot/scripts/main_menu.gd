# MainMenu — dark-fantasy title screen.
#
# Three buttons (BEGIN / SETTINGS / QUIT). Buttons grow 1.05× on hover via a
# small Tween, and BEGIN is keyboard-focused on _ready so the player can
# drive the menu without the mouse from frame 1. Existing functionality
# (start_dungeon_run → start_floor → change_scene_to_file) is preserved
# verbatim; this iter only refreshes visuals + animation.
#
# Visual layer:
#   • CPUParticles2D ember field at the viewport bottom — warm amber sparks
#     drift upward to keep the screen feeling alive (mirrors the JS reference
#     at slime-depths/src/menuEmbers.js).
#   • Title block pulses gently (scale 0.97 → 1.03 over 2.5s loops) for a
#     subtle "breathing" feel.
#   • Subtitle alpha pulses (0.65 → 1.0 over 3s loops) — independent of the
#     title scale so the tagline feels like an ember itself.
#   • All glow effects are rendered via outline-Label "fat-copy" workaround
#     because Godot Labels don't blur natively. This is the same trick the
#     prior implementation used; only the colors + sizing changed.
extends Control

const DUNGEON_SCENE_PATH := "res://scenes/main.tscn"
const SETTINGS_SCENE_PATH := "res://scenes/settings_screen.tscn"

# Button hover scale tween parameters.
const HOVER_SCALE := 1.05
const HOVER_TWEEN_TIME := 0.12

# Title pulse — 0.97× → 1.03× over ~1.25s, then back. Loops forever.
const TITLE_PULSE_MIN := 0.97
const TITLE_PULSE_MAX := 1.03
const TITLE_PULSE_HALF_DURATION := 1.25

# Subtitle alpha pulse — 0.65 → 1.0 over 1.5s, then back (3s full cycle).
# Slow enough to read as "atmospheric breathing," not a strobe.
const SUBTITLE_ALPHA_MIN := 0.65
const SUBTITLE_ALPHA_MAX := 1.0
const SUBTITLE_PULSE_HALF_DURATION := 1.5

@onready var begin_button: Button = $CenterStack/BeginButton
@onready var settings_button: Button = $CenterStack/SettingsButton
@onready var quit_button: Button = $CenterStack/QuitButton
@onready var title: Label = $TitleBlock/Title
@onready var title_glow: Label = $TitleBlock/TitleGlow
@onready var subtitle: Label = $TitleBlock/Subtitle
@onready var ember_particles: CPUParticles2D = $EmberParticles
# Persistent stats panel (bottom-left). Populated from GameState at _ready;
# SaveSystem already round-trips the underlying fields so a player returning
# between sessions sees their accumulated runs / kills / best run carry over.
@onready var stats_runs: Label = $StatsBlock/StatsRuns
@onready var stats_best: Label = $StatsBlock/StatsBestRun
@onready var stats_lifetime: Label = $StatsBlock/StatsLifetimeKills
@onready var stats_last: Label = $StatsBlock/StatsLastRun

# Per-button tween cache. Storing the active tween lets a follow-up
# hover_exited correctly kill the in-flight grow-in animation so the
# button doesn't end up stuck at scale 1.05 if the cursor passes
# quickly. (Same pattern as the JS fx.js tween management.)
var _hover_tweens: Dictionary = {}
var _title_tween: Tween
var _subtitle_tween: Tween

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
	_start_subtitle_pulse()

	# Position the ember emission line along the actual viewport bottom +
	# stretch its emission_rect_extents to the viewport width. The scene's
	# baked values target 1280×720, but the viewport may scale — re-pin
	# here and on resize so embers always emit from the bottom edge.
	_reposition_embers()
	get_viewport().size_changed.connect(_reposition_embers)

	# Default keyboard focus.
	begin_button.grab_focus()
	# Populate the persistent stats panel. start_dungeon_run promotes
	# last_run_kills → best_run_kills BEFORE resetting, so by the time the
	# player returns to this menu the "best" already reflects the run they
	# just finished.
	_populate_stats()

# Pull the four stat lines from GameState. The dotted padding makes the
# values align in a fixed-width-feel even though the font isn't monospace
# — same trick the slime-depths JS HUD uses for its records screen.
# Numeric formatting via "%d" so big numbers don't break the layout.
func _populate_stats() -> void:
	var best: int = max(GameState.best_run_kills, GameState.last_run_kills)
	stats_runs.text = "runs ··············· %d" % GameState.dungeon_runs
	stats_best.text = "best run kills ······ %d" % best
	stats_lifetime.text = "lifetime kills ······· %d" % GameState.session_kills
	# Only show last-run line after at least one run completed; an empty
	# line on first launch avoids the "0 kills" lie before the player has
	# played anything.
	if GameState.dungeon_runs > 0:
		stats_last.text = "last run ············ %d kills" % GameState.last_run_kills
	else:
		stats_last.text = ""

# Embers emit from a thin horizontal strip just below the visible bottom of
# the viewport so the first spawn frame isn't visible. The preprocess on the
# CPUParticles2D node already advances each particle 3s into its lifetime,
# so the field is full from frame 0.
func _reposition_embers() -> void:
	var vp_size: Vector2 = get_viewport_rect().size
	ember_particles.position = Vector2(vp_size.x * 0.5, vp_size.y + 40.0)
	ember_particles.emission_rect_extents = Vector2(vp_size.x * 0.5 + 60.0, 4.0)

func _on_begin_pressed() -> void:
	# BEGIN goes straight into the dungeon. RunState.start_floor() seeds
	# room 0 + resets HP/kills so main.tscn reads a fresh
	# current_room_config at _ready().
	GameState.start_dungeon_run()
	RunState.start_floor()
	get_tree().change_scene_to_file(DUNGEON_SCENE_PATH)

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

# Infinite-loop pulse on the title scale. The glow Label rides along so the
# bloom stays anchored under the foreground text.
func _start_title_pulse() -> void:
	if _title_tween and _title_tween.is_valid():
		_title_tween.kill()
	_title_tween = create_tween()
	_title_tween.set_loops()
	_title_tween.set_trans(Tween.TRANS_SINE)
	_title_tween.set_ease(Tween.EASE_IN_OUT)
	_title_tween.tween_method(_apply_title_scale, TITLE_PULSE_MIN, TITLE_PULSE_MAX, TITLE_PULSE_HALF_DURATION)
	_title_tween.tween_method(_apply_title_scale, TITLE_PULSE_MAX, TITLE_PULSE_MIN, TITLE_PULSE_HALF_DURATION)

# Infinite-loop alpha pulse on the subtitle. Slow enough (3s full cycle) to
# read as ambient atmosphere rather than a strobe. Independent timing from
# the title pulse so the two animations don't reinforce each other into a
# single hard beat.
func _start_subtitle_pulse() -> void:
	if _subtitle_tween and _subtitle_tween.is_valid():
		_subtitle_tween.kill()
	_subtitle_tween = create_tween()
	_subtitle_tween.set_loops()
	_subtitle_tween.set_trans(Tween.TRANS_SINE)
	_subtitle_tween.set_ease(Tween.EASE_IN_OUT)
	_subtitle_tween.tween_method(_apply_subtitle_alpha, SUBTITLE_ALPHA_MIN, SUBTITLE_ALPHA_MAX, SUBTITLE_PULSE_HALF_DURATION)
	_subtitle_tween.tween_method(_apply_subtitle_alpha, SUBTITLE_ALPHA_MAX, SUBTITLE_ALPHA_MIN, SUBTITLE_PULSE_HALF_DURATION)

func _apply_title_scale(s: float) -> void:
	var v: Vector2 = Vector2(s, s)
	title.scale = v
	# Glow breathes a hair wider than the main title so the bloom feels
	# softly anchored without "clicking" alignment-wise.
	title_glow.scale = v * 1.02

func _apply_subtitle_alpha(a: float) -> void:
	var c: Color = subtitle.modulate
	c.a = a
	subtitle.modulate = c
