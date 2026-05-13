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

# Title pulse — 0.94× → 1.06× over ~1.25s, then back. Loops forever.
# iter-111: widened from 0.97/1.03 → 0.94/1.06 so the breath actually reads
# at a glance. Pre-iter-111 the pulse was almost imperceptible — playtester
# feedback was "is the title even animated?" The new range is ~2× more
# motion but still well shy of "wobble" territory.
const TITLE_PULSE_MIN := 0.94
const TITLE_PULSE_MAX := 1.06
const TITLE_PULSE_HALF_DURATION := 1.25

# iter-111: Mouse parallax. The painted backdrop drifts gently OPPOSITE to
# the cursor while the title block drifts SAME direction at lower magnitude
# — the "card floats toward your cursor" trick. Physically wrong (real
# parallax shifts everything in the same direction at different rates) but
# the inverse-coupling reads strongly as depth on a 2D plane, and is the
# pattern modern UIs use (the JS reference's menu has the same touch).
# Tuning: backdrop max 10 px, title max 4 px, lerp rate 6.0/s — slow
# enough to feel like the canvas is "settling," not snapping.
const PARALLAX_BACKDROP_MAX_PX := 10.0
const PARALLAX_TITLE_MAX_PX := 4.0
const PARALLAX_LERP_RATE := 6.0

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
@onready var title_halo: TextureRect = $TitleHalo
@onready var title_block: Control = $TitleBlock
@onready var backdrop_image: TextureRect = $BackdropImage
@onready var ember_particles: CPUParticles2D = $EmberParticles
@onready var left_torch_embers: CPUParticles2D = $LeftTorchEmbers
@onready var right_torch_embers: CPUParticles2D = $RightTorchEmbers
@onready var mist_particles: CPUParticles2D = $MistParticles
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

# iter-111: Parallax state. _parallax_offset is the SMOOTHED [-1..1]-ish
# vector currently driving the layered offsets; _parallax_target is the
# raw mouse-from-center delta updated each frame. We lerp from offset →
# target so cursor moves feel like the canvas is settling toward your
# eye, not snapping. Base positions are captured once at _ready so we
# always parallax around the original layout, never against the previously
# offset position (which would let drift accumulate).
var _parallax_offset: Vector2 = Vector2.ZERO
var _parallax_target: Vector2 = Vector2.ZERO
var _backdrop_base_pos: Vector2 = Vector2.ZERO
var _title_block_base_pos: Vector2 = Vector2.ZERO
var _title_halo_base_pos: Vector2 = Vector2.ZERO
var _left_torch_base_pos: Vector2 = Vector2.ZERO
var _right_torch_base_pos: Vector2 = Vector2.ZERO
var _mist_base_pos: Vector2 = Vector2.ZERO

func _ready() -> void:
	# iter-112: Fade up from black on menu entry. Matches the destination-
	# side fade in main.gd / settings_screen.gd, so navigating BACK to the
	# menu from settings or from the death-screen "MAIN MENU" button
	# completes the cross-fade. On first launch the rect is already
	# transparent so this is a single-frame black-flash → fade-up; trivial.
	ScreenFlash.fade_from_black(0.40)
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
	# stretch its emission_rect_extents to the viewport width. iter-92
	# also re-pins the two torch ember emitters to track where the painted
	# torches land after keep_aspect_covered scaling. The scene's baked
	# positions target 1280×720; resize handler rescales them.
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
#
# iter-92: also re-pin the two torch emitters to track the painted torches
# under keep_aspect_covered scaling. The torches sit at roughly 38.7% and
# 61.3% of the viewport width, at ~50.7% of the height in the 1280×720
# native composition. We keep those percentages so a resized viewport still
# centers the embers on the painted flames.
const LEFT_TORCH_REL_X: float = 0.387
const RIGHT_TORCH_REL_X: float = 0.613
const TORCH_REL_Y: float = 0.507
# iter-111: MIST emitter sits where the painted stairs descend into fog
# — roughly the lower third of the backdrop. Slow horizontal drift,
# huge soft particles, near-transparent. Reads as "the dungeon breathes
# cold air up the stairs at you."
const MIST_REL_Y: float = 0.78
func _reposition_embers() -> void:
	var vp_size: Vector2 = get_viewport_rect().size
	ember_particles.position = Vector2(vp_size.x * 0.5, vp_size.y + 40.0)
	ember_particles.emission_rect_extents = Vector2(vp_size.x * 0.5 + 60.0, 4.0)
	if left_torch_embers != null:
		left_torch_embers.position = Vector2(vp_size.x * LEFT_TORCH_REL_X, vp_size.y * TORCH_REL_Y)
	if right_torch_embers != null:
		right_torch_embers.position = Vector2(vp_size.x * RIGHT_TORCH_REL_X, vp_size.y * TORCH_REL_Y)
	if mist_particles != null:
		mist_particles.position = Vector2(vp_size.x * 0.5, vp_size.y * MIST_REL_Y)
		# Emission band spans the full viewport width so the mist sells the
		# whole stair landing, not just a centered puff.
		mist_particles.emission_rect_extents = Vector2(vp_size.x * 0.5 + 80.0, 6.0)
	# iter-111: parallax bases — captured here (rather than _ready) so that
	# resize events re-anchor the parallax to the new layout. Otherwise a
	# fullscreen toggle would leave the parallax drifting around stale
	# positions that no longer match where the layers actually live.
	_capture_parallax_bases()

# iter-112: AWAKEN/SETTINGS/QUIT all gain a 0.30s fade-to-black BEFORE
# the scene change kicks in. Pre-iter-112 the menu snapped instantly to
# main.tscn (or quit) — abrupt enough that the AWAKEN button's UI cue
# felt disconnected from the actual transition. The fade gives the
# moment proper weight: cue plays → screen darkens → world arrives.
# main.gd._ready calls ScreenFlash.fade_from_black to complete the
# cross-fade from the destination side.
const TRANSITION_FADE_DUR: float = 0.30

# Track whether a transition is in flight so the player can't queue
# multiple scene changes by rapid-clicking different buttons during the
# fade window. Once set, all button handlers early-out.
var _transitioning: bool = false

func _on_begin_pressed() -> void:
	if _transitioning:
		return
	_transitioning = true
	# iter-109: UI press cue. ui_press is a short downward chunk
	# (420 → 260 Hz over 90 ms) so the player has audible confirmation
	# the BEGIN actually committed before the scene change kicks in.
	Audio.play_ui_cue("ui_press", -2.0)
	# BEGIN goes straight into the dungeon. RunState.start_floor() seeds
	# room 0 + resets HP/kills so main.tscn reads a fresh
	# current_room_config at _ready(). We start the floor BEFORE the
	# fade so the autoload state is set even if the scene change is
	# delayed; the fade is purely cosmetic.
	GameState.start_dungeon_run()
	RunState.start_floor()
	await ScreenFlash.fade_to_black(TRANSITION_FADE_DUR)
	get_tree().change_scene_to_file(DUNGEON_SCENE_PATH)

func _on_settings_pressed() -> void:
	if _transitioning:
		return
	_transitioning = true
	Audio.play_ui_cue("ui_press", -2.0)
	await ScreenFlash.fade_to_black(TRANSITION_FADE_DUR)
	get_tree().change_scene_to_file(SETTINGS_SCENE_PATH)

func _on_quit_pressed() -> void:
	if _transitioning:
		return
	_transitioning = true
	Audio.play_ui_cue("ui_press", -2.0)
	await ScreenFlash.fade_to_black(TRANSITION_FADE_DUR)
	get_tree().quit()

func _on_button_hover_enter(button: Button) -> void:
	# iter-109: UI hover cue. ui_hover is a soft high pip (880 Hz, 40 ms)
	# played quietly so the menu doesn't audio-spam as the cursor brushes
	# the button stack. Fires on focus_entered as well (wired in _ready),
	# so keyboard navigation gets the same feedback.
	Audio.play_ui_cue("ui_hover", -8.0)
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
	# iter-92: title halo modulate.a tracks the breath. Maps the scale
	# range (TITLE_PULSE_MIN..TITLE_PULSE_MAX) onto a (0.78..1.0) alpha
	# window so the warm pool behind the title swells and dims with the
	# typography rather than just sitting flat.
	if title_halo != null:
		var t: float = (s - TITLE_PULSE_MIN) / (TITLE_PULSE_MAX - TITLE_PULSE_MIN)
		var a: float = lerp(0.78, 1.0, clampf(t, 0.0, 1.0))
		var c: Color = title_halo.modulate
		c.a = a
		title_halo.modulate = c

func _apply_subtitle_alpha(a: float) -> void:
	var c: Color = subtitle.modulate
	c.a = a
	subtitle.modulate = c

# iter-111: Capture the layout-resolved positions of every parallax target.
# Called from _reposition_embers (which runs on _ready AND on every
# viewport resize), so the parallax always operates around the current
# canonical layout — never against the previously-offset position, which
# would let drift accumulate over a long session.
#
# Note: backdrop_image is a fully-stretched Control; setting its `position`
# shifts the rendered texture by that offset relative to the anchor-derived
# layout, which is exactly what we want for parallax. Same applies to the
# title block + halo. For the CPUParticles2D (Node2D) children we store
# the world-space position assigned in _reposition_embers.
func _capture_parallax_bases() -> void:
	if backdrop_image != null:
		_backdrop_base_pos = backdrop_image.position
	if title_block != null:
		_title_block_base_pos = title_block.position
	if title_halo != null:
		_title_halo_base_pos = title_halo.position
	if left_torch_embers != null:
		_left_torch_base_pos = left_torch_embers.position
	if right_torch_embers != null:
		_right_torch_base_pos = right_torch_embers.position
	if mist_particles != null:
		_mist_base_pos = mist_particles.position
	# Reset offset so a resize doesn't snap-shift the canvas; the parallax
	# will re-converge on the new layout from zero.
	_parallax_offset = Vector2.ZERO

# iter-111: Per-frame parallax tick. Reads mouse position, normalizes to
# [-1, 1] across viewport size, lerps the smoothed offset toward that
# target, then applies it. Backdrop + torch embers + mist drift OPPOSITE
# to the cursor; title block + halo drift SAME direction at smaller
# magnitude. Lerp damping (PARALLAX_LERP_RATE) keeps the canvas from
# tracking the cursor like a laser pointer — it should feel like the
# painting is gently settling toward where you're looking.
func _process(delta: float) -> void:
	var vp_size: Vector2 = get_viewport_rect().size
	if vp_size.x <= 0.0 or vp_size.y <= 0.0:
		return
	var mouse_pos: Vector2 = get_viewport().get_mouse_position()
	var center: Vector2 = vp_size * 0.5
	# Normalized [-1, 1] mouse offset (clamped so out-of-window cursors
	# don't fling the canvas off-axis).
	_parallax_target = Vector2(
		clampf((mouse_pos.x - center.x) / center.x, -1.0, 1.0),
		clampf((mouse_pos.y - center.y) / center.y, -1.0, 1.0),
	)
	var lerp_t: float = clampf(PARALLAX_LERP_RATE * delta, 0.0, 1.0)
	_parallax_offset = _parallax_offset.lerp(_parallax_target, lerp_t)

	# Backdrop layer (OPPOSITE direction).
	var backdrop_drift: Vector2 = -_parallax_offset * PARALLAX_BACKDROP_MAX_PX
	if backdrop_image != null:
		backdrop_image.position = _backdrop_base_pos + backdrop_drift
	if left_torch_embers != null:
		left_torch_embers.position = _left_torch_base_pos + backdrop_drift
	if right_torch_embers != null:
		right_torch_embers.position = _right_torch_base_pos + backdrop_drift
	if mist_particles != null:
		mist_particles.position = _mist_base_pos + backdrop_drift

	# Foreground / title layer (SAME direction, lower magnitude).
	var title_drift: Vector2 = _parallax_offset * PARALLAX_TITLE_MAX_PX
	if title_block != null:
		title_block.position = _title_block_base_pos + title_drift
	if title_halo != null:
		title_halo.position = _title_halo_base_pos + title_drift
