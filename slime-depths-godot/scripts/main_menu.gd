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

# Iter 239 / Fun Ideas Team R4 — FloorModifiers script preload. Same
# pattern as main.gd / game_state.gd; preload to bypass headless-mode
# class_name resolution flakiness.
const FloorModifiers: Script = preload("res://scripts/floor_modifiers.gd")

# Button hover scale tween parameters.
const HOVER_SCALE := 1.05
const HOVER_TWEEN_TIME := 0.12

# iter-130 — Title scale pulse + title parallax both retired.
# Playtester read on the iter-111 pulse: "moving like a 3D movie." Every
# real dark-fantasy menu (Dark Souls, Elden Ring, Bloodborne, Hollow
# Knight) keeps the LOGO completely static — no scale, no parallax, no
# breath. The world has motion (embers, smoke, fog) but the brand is
# rock solid. That contrast is the gravitas.
# TITLE_PULSE_MIN / MAX / HALF_DURATION constants removed alongside
# the _start_title_pulse / _apply_title_scale functions.

# iter-111: Mouse parallax for the backdrop layer. The painted backdrop
# drifts gently OPPOSITE to the cursor — the world reacts to cursor
# movement, giving subtle depth.
# iter-130: PARALLAX_TITLE_MAX_PX dropped 4.0 → 0.0. Title no longer
# drifts with the cursor — it stays anchored as the brand should.
# Backdrop parallax kept at 10 px (the world moves; the title doesn't).
const PARALLAX_BACKDROP_MAX_PX := 10.0
const PARALLAX_TITLE_MAX_PX := 0.0
const PARALLAX_LERP_RATE := 6.0

# iter-128 — SUBTITLE_ALPHA_* constants removed alongside the Subtitle
# Label they animated. The "beneath the ruin" tagline got cut after
# a design review against genre peers (Elden Ring / Dark Souls /
# Bloodborne / Hades / Hollow Knight all show TITLE alone, never a
# separate subtitle Label). See scenes/main_menu.tscn for the full
# rationale.

@onready var begin_button: Button = $CenterStack/BeginButton
@onready var settings_button: Button = $CenterStack/SettingsButton
@onready var quit_button: Button = $CenterStack/QuitButton
@onready var title: Label = $TitleBlock/Title
@onready var title_glow: Label = $TitleBlock/TitleGlow
# iter-129 — title_shadow @onready ref removed alongside the
# TitleShadow Label it referenced. Carved-stone-depth concept was
# producing a 3D-movie-headline read rather than the intended carved
# inscription; see scenes/main_menu.tscn for the deletion rationale.
@onready var title_halo: TextureRect = $TitleHalo
@onready var title_block: Control = $TitleBlock
@onready var backdrop_image: TextureRect = $BackdropImage
# iter-129 — ember_particles @onready ref removed alongside the
# EmberParticles bottom spray. See scenes/main_menu.tscn for the
# design rationale ("tiny random spray that adds almost nothing").
@onready var left_torch_embers: CPUParticles2D = $LeftTorchEmbers
@onready var right_torch_embers: CPUParticles2D = $RightTorchEmbers
@onready var mist_particles: CPUParticles2D = $MistParticles
# Persistent stats panel (bottom-left). Populated from GameState at _ready;
# SaveSystem already round-trips the underlying fields so a player returning
# between sessions sees their accumulated runs / kills / best run carry over.
@onready var stats_runs: Label = $StatsBlock/StatsRuns
# Iter 164 — order swapped so the player's eye flows top-down RUNS →
# BEST TIME → BEST KILLS (the three records they actually chase).
# Lifetime kills + last-run labels dropped — duplicate info / vanity
# stats that bloated the corner.
@onready var stats_best_time: Label = $StatsBlock/StatsBestTime
@onready var stats_best: Label = $StatsBlock/StatsBestRun

# Per-button tween cache. Storing the active tween lets a follow-up
# hover_exited correctly kill the in-flight grow-in animation so the
# button doesn't end up stuck at scale 1.05 if the cursor passes
# quickly. (Same pattern as the JS fx.js tween management.)
var _hover_tweens: Dictionary = {}
# iter-130 — _title_tween var removed. Title scale pulse system gone;
# nothing tweens the title anymore.

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
	# Iter 220 / Beta M1.1 — UPGRADES button. Built programmatically so
	# we don't need to edit main_menu.tscn. Inserted right after the
	# BEGIN button so the meta-progression hook is in the player's
	# primary scan path.
	_inject_upgrades_button()
	# Iter 225 / Polish Team — ACHIEVEMENTS button. Injected just below
	# UPGRADES so the meta-progression and the long-term-goal hooks sit
	# adjacent in the menu's scan path. Opens a modal listing all 12+
	# achievements with locked/unlocked state pulled from
	# GameState.unlocked_achievements.
	_inject_achievements_button()

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

	# iter-130 — title scale pulse retired; pivot-centering kept so any
	# future static layout / hover tween targets the label's center
	# rather than its top-left. Re-pinned on resize.
	_recenter_title_pivots()
	title.resized.connect(_recenter_title_pivots)
	title_glow.resized.connect(_recenter_title_pivots)

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
	# Iter 164 — three records, in the order the player cares about
	# them top-down: how many runs, what's my fastest, what's my
	# kill peak. Dotted-leader strings keep the right-edge values
	# visually aligned (the body_font isn't monospace, so the dots
	# substitute for tabular numbers).
	var best: int = max(GameState.best_run_kills, GameState.last_run_kills)
	# Iter 219 / Beta M1.0 — surface persistent ether shard balance
	# alongside the run records so the player can see the meta currency
	# accumulate even before the upgrade hub (M1.1) lands. Stamping it
	# into stats_runs's text (which already has the most room) so we
	# don't need a new HUD node yet.
	stats_runs.text     = "runs ··············· %d   ◇ %d" % [
		GameState.dungeon_runs, GameState.ether_shards
	]
	stats_best_time.text = "best time ··········· %s" % _format_best_time()
	stats_best.text     = "best kills ·········· %d" % best

# Iter 159 — format GameState.best_run_time as m:ss, or "--" when no
# run has completed yet. The promotion from last_run_time → best_run_time
# happens at start_dungeon_run() (game_state.gd), so by the time the
# main menu is shown after a death the value is already up-to-date.
func _format_best_time() -> String:
	var t: float = GameState.best_run_time
	if t < 0.0:
		return "--"
	var total_sec: int = maxi(0, int(t))
	var m: int = mini(99, total_sec / 60)
	var s: int = total_sec % 60
	return "%d:%02d" % [m, s]

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
	# iter-129 — ember_particles reposition removed; the bottom emitter
	# is gone. Function name retained for tree-history continuity even
	# though it now only handles torch + mist emitters.
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
	# iter-109: UI press cue. ui_press is a short downward chunk
	# (420 → 260 Hz over 90 ms) so the player has audible confirmation
	# the BEGIN actually committed before the scene change kicks in.
	Audio.play_ui_cue("ui_press", -2.0)
	# Iter 239 / Fun Ideas Team R4 — pre-run MODIFIERS modal. Pops up
	# instead of going straight into the dungeon. The player can toggle
	# 0-3 difficulty modifiers (HEAT WAVE / SWIFT FOES / etc.) for an
	# additive ether-shard reward multiplier. CONFIRM finalizes the
	# choice + walks through the original BEGIN flow. SKIP clears all
	# modifiers and proceeds. CANCEL returns to the main menu without
	# transitioning.
	_show_modifiers_modal()

# Iter 239 — actual transition into the dungeon. Pulled out of
# _on_begin_pressed so the new modifiers modal can call it AFTER the
# player confirms their pact selection. Exposed via the modal's
# CONFIRM/SKIP buttons.
func _commit_begin_and_enter_dungeon() -> void:
	if _transitioning:
		return
	_transitioning = true
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

# iter-130 — _start_title_pulse / _apply_title_scale removed entirely.
# The title is now STATIC: no scale animation, no halo alpha coupling.
# TitleHalo renders at its texture's natural ~0.22 peak alpha (set
# baked into the gradient sub-resource in main_menu.tscn). That's a
# quiet warm pool of light behind the title; without the iter-129
# multiplier (0.36..0.50) on top, the halo is slightly brighter at
# rest — exactly what an ancient torchlit logo should look like.
#
# Genre reference: Dark Souls / Elden Ring / Bloodborne / Hollow Knight
# all keep the title LOGO rock-solid. World motion (embers, fog, smoke)
# is intentionally contrasted against a still logo — that contrast is
# the gravitas.
#
# iter-128 — _start_subtitle_pulse + SUBTITLE_ALPHA_* constants
# removed alongside the Subtitle Label. See scenes/main_menu.tscn for
# the design rationale (no genre peer uses a separate subtitle Label).

# iter-128 — _apply_subtitle_alpha removed; Subtitle Label is gone.

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

# ── Iter 240 / Polish Team R5 — Themed modal builders ────────────────
# Shared StyleBox + helper machinery so the BINDINGS, ACHIEVEMENTS,
# and (future) MODIFIERS modals all use the same dark-fantasy
# vocabulary. Pre-iter-240 each modal was raw Labels on a single
# ColorRect dim — the main-menu title and buttons bled through the
# overlay. The visual diagnosis:
#   • No backing panel → the menu read through the modal text.
#   • Ad-hoc column widths in HBoxContainer rows → name/desc/button
#     drifted out of alignment on long descriptions.
#   • Default Button colors → INVEST looked the same regardless of
#     affordability; player couldn't tell what was a real choice.
#   • Locked/unlocked achievements differed only by "OK" / "—"
#     prefix → no celebratory delta when one unlocked.
#
# This iter pulls the shared chrome into _build_themed_modal_panel
# (full-screen scrim + center container + styled PanelContainer +
# inner gold border + title + sub-header + close button row) and
# styles each row inside that frame consistently. Three button
# StyleBoxes (affordable / unaffordable / maxed / close) keep state
# legible at a glance.

# Panel chrome constants — referenced by _build_themed_modal_panel +
# the row builders so tweaks land in one place.
const MODAL_SCRIM_COLOR: Color = Color(0, 0, 0, 0.72)
const MODAL_PANEL_BG: Color = Color(0.10, 0.08, 0.06, 0.96)
const MODAL_PANEL_BORDER_OUTER: Color = Color(0.72, 0.58, 0.30)
const MODAL_PANEL_BORDER_INNER: Color = Color(0.40, 0.30, 0.16)
const MODAL_TITLE_COLOR: Color = Color(0.92, 0.78, 0.42)
const MODAL_SUBTITLE_COLOR: Color = Color(0.78, 0.72, 0.62)
const MODAL_BODY_COLOR: Color = Color(0.88, 0.82, 0.70)
const MODAL_MUTED_COLOR: Color = Color(0.62, 0.56, 0.46)
const MODAL_DISABLED_COLOR: Color = Color(0.46, 0.42, 0.38)
# Affordable / maxed / locked-button accent palettes.
const MODAL_BUTTON_GOLD: Color = Color(0.78, 0.62, 0.32)
const MODAL_BUTTON_GOLD_FILL: Color = Color(0.18, 0.14, 0.08, 0.95)
const MODAL_BUTTON_GOLD_HOVER: Color = Color(0.92, 0.74, 0.40)
const MODAL_BUTTON_DEAD: Color = Color(0.32, 0.22, 0.32)
const MODAL_BUTTON_DEAD_FILL: Color = Color(0.10, 0.08, 0.10, 0.92)
const MODAL_BUTTON_MAXED_FILL: Color = Color(0.30, 0.22, 0.08, 0.98)
const MODAL_ROW_HOVER_TINT: Color = Color(1.10, 1.08, 1.04)

# Builds the canonical modal chrome and returns the inner VBoxContainer
# the caller appends rows into. Caller is responsible for hooking up a
# CLOSE button via _append_modal_close_row (or wiring ESC via the
# returned root). The root is added to the MainMenu scene; close it
# with queue_free().
#
# Returned dict shape:
#   {
#     "root": Control,        # full-screen overlay (free this to close)
#     "panel": PanelContainer, # the actual gold-bordered panel
#     "body": VBoxContainer,   # append content here
#   }
func _build_themed_modal_panel(title_text: String, sub_text: String, min_size: Vector2) -> Dictionary:
	var root: Control = Control.new()
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_STOP
	# Full-screen darkening scrim.
	var scrim: ColorRect = ColorRect.new()
	scrim.set_anchors_preset(Control.PRESET_FULL_RECT)
	scrim.color = MODAL_SCRIM_COLOR
	scrim.mouse_filter = Control.MOUSE_FILTER_STOP
	root.add_child(scrim)
	# Center container holds the styled PanelContainer.
	var center: CenterContainer = CenterContainer.new()
	center.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.add_child(center)
	# Outer PanelContainer with double-border ornament feel — outer
	# warm gold + inner thinner band.
	var panel: PanelContainer = PanelContainer.new()
	panel.custom_minimum_size = min_size
	panel.add_theme_stylebox_override("panel", _make_panel_stylebox())
	center.add_child(panel)
	# Body VBox — content rows go in here. Inner padding is already
	# provided by the panel's stylebox content margins.
	var body: VBoxContainer = VBoxContainer.new()
	body.add_theme_constant_override("separation", 12)
	body.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	panel.add_child(body)
	# Title — large, warm gold, centered, with a thin gold rule beneath.
	var title: Label = Label.new()
	title.text = title_text
	title.add_theme_color_override("font_color", MODAL_TITLE_COLOR)
	title.add_theme_font_size_override("font_size", 30)
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	body.add_child(title)
	# Gold separator rule — slim ColorRect that visually closes the
	# title from the content rows.
	var rule: ColorRect = ColorRect.new()
	rule.color = Color(MODAL_PANEL_BORDER_OUTER.r, MODAL_PANEL_BORDER_OUTER.g, MODAL_PANEL_BORDER_OUTER.b, 0.65)
	rule.custom_minimum_size = Vector2(0, 1)
	rule.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	body.add_child(rule)
	# Optional sub-header (caller passes "" to suppress).
	if sub_text != "":
		var sub: Label = Label.new()
		sub.text = sub_text
		sub.add_theme_color_override("font_color", MODAL_SUBTITLE_COLOR)
		sub.add_theme_font_size_override("font_size", 14)
		sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		body.add_child(sub)
	return {
		"root": root,
		"panel": panel,
		"body": body,
	}

# StyleBox factory for the modal frame — deep warm-dark fill with a
# 2px warm-gold outer border and rounded corners. The inner thinner
# band is faked by setting expand_margin so the outer border's inner
# edge reads as a second line.
func _make_panel_stylebox() -> StyleBoxFlat:
	var sb: StyleBoxFlat = StyleBoxFlat.new()
	sb.bg_color = MODAL_PANEL_BG
	sb.border_color = MODAL_PANEL_BORDER_OUTER
	sb.border_width_left = 2
	sb.border_width_top = 2
	sb.border_width_right = 2
	sb.border_width_bottom = 2
	sb.corner_radius_top_left = 12
	sb.corner_radius_top_right = 12
	sb.corner_radius_bottom_left = 12
	sb.corner_radius_bottom_right = 12
	sb.content_margin_left = 28
	sb.content_margin_right = 28
	sb.content_margin_top = 24
	sb.content_margin_bottom = 24
	# Subtle drop shadow so the panel reads as RAISED off the scrim.
	sb.shadow_color = Color(0, 0, 0, 0.55)
	sb.shadow_size = 8
	sb.shadow_offset = Vector2(0, 4)
	return sb

# StyleBox factory for buttons — three states:
#   "affordable" — gold border, warm-cream text, hover scales fill
#   "unaffordable" — muted violet border, dim grey text (disabled look)
#   "maxed" — solid gold panel, dark text, "MAXED" label
#   "close" — cream background with gold border, for CLOSE/dismiss
func _make_button_stylebox(state: String) -> StyleBoxFlat:
	var sb: StyleBoxFlat = StyleBoxFlat.new()
	sb.corner_radius_top_left = 4
	sb.corner_radius_top_right = 4
	sb.corner_radius_bottom_left = 4
	sb.corner_radius_bottom_right = 4
	sb.border_width_left = 1
	sb.border_width_top = 1
	sb.border_width_right = 1
	sb.border_width_bottom = 1
	sb.content_margin_left = 12
	sb.content_margin_right = 12
	sb.content_margin_top = 6
	sb.content_margin_bottom = 6
	match state:
		"affordable":
			sb.bg_color = MODAL_BUTTON_GOLD_FILL
			sb.border_color = MODAL_BUTTON_GOLD
		"affordable_hover":
			sb.bg_color = Color(0.28, 0.20, 0.10, 0.98)
			sb.border_color = MODAL_BUTTON_GOLD_HOVER
		"unaffordable":
			sb.bg_color = MODAL_BUTTON_DEAD_FILL
			sb.border_color = MODAL_BUTTON_DEAD
		"maxed":
			sb.bg_color = MODAL_BUTTON_MAXED_FILL
			sb.border_color = MODAL_BUTTON_GOLD
			sb.border_width_left = 2
			sb.border_width_top = 2
			sb.border_width_right = 2
			sb.border_width_bottom = 2
		"close":
			sb.bg_color = Color(0.16, 0.13, 0.10, 0.96)
			sb.border_color = MODAL_BUTTON_GOLD
		"close_hover":
			sb.bg_color = Color(0.24, 0.18, 0.12, 0.98)
			sb.border_color = MODAL_BUTTON_GOLD_HOVER
		_:
			sb.bg_color = MODAL_PANEL_BG
			sb.border_color = MODAL_BUTTON_GOLD
	return sb

# Apply per-state styling + hover behavior to a Button. `state` is
# one of "affordable" / "unaffordable" / "maxed" / "close". Hover
# state for affordable + close transitions the stylebox via tween.
func _style_modal_button(btn: Button, state: String) -> void:
	var normal_sb: StyleBoxFlat = _make_button_stylebox(state)
	btn.add_theme_stylebox_override("normal", normal_sb)
	btn.add_theme_stylebox_override("pressed", normal_sb)
	btn.add_theme_stylebox_override("focus", normal_sb)
	btn.add_theme_stylebox_override("disabled", _make_button_stylebox("unaffordable"))
	# Hover styling — affordable/close get the brighter variant.
	if state == "affordable":
		btn.add_theme_stylebox_override("hover", _make_button_stylebox("affordable_hover"))
		btn.add_theme_color_override("font_color", Color(0.96, 0.88, 0.72))
		btn.add_theme_color_override("font_hover_color", Color(1.0, 0.94, 0.78))
	elif state == "close":
		btn.add_theme_stylebox_override("hover", _make_button_stylebox("close_hover"))
		btn.add_theme_color_override("font_color", MODAL_TITLE_COLOR)
		btn.add_theme_color_override("font_hover_color", Color(1.0, 0.94, 0.78))
	elif state == "unaffordable":
		btn.add_theme_stylebox_override("hover", normal_sb)
		btn.add_theme_color_override("font_color", MODAL_DISABLED_COLOR)
	elif state == "maxed":
		btn.add_theme_stylebox_override("hover", normal_sb)
		btn.add_theme_color_override("font_color", MODAL_TITLE_COLOR)
	btn.add_theme_font_size_override("font_size", 13)
	# Hover scale tween — 1.0 → 1.04 over 80ms, same idiom as menu
	# button hover so the doctrine stays consistent.
	btn.pivot_offset = btn.size / 2.0
	btn.resized.connect(func ():
		btn.pivot_offset = btn.size / 2.0
	)
	btn.mouse_entered.connect(_on_modal_button_hover_enter.bind(btn))
	btn.mouse_exited.connect(_on_modal_button_hover_exit.bind(btn))
	btn.focus_entered.connect(_on_modal_button_hover_enter.bind(btn))
	btn.focus_exited.connect(_on_modal_button_hover_exit.bind(btn))

func _on_modal_button_hover_enter(btn: Button) -> void:
	if btn.disabled:
		return
	Audio.play_ui_cue("ui_hover", -10.0)
	var tween: Tween = create_tween()
	tween.set_trans(Tween.TRANS_QUAD)
	tween.set_ease(Tween.EASE_OUT)
	tween.tween_property(btn, "scale", Vector2(1.04, 1.04), 0.08)

func _on_modal_button_hover_exit(btn: Button) -> void:
	var tween: Tween = create_tween()
	tween.set_trans(Tween.TRANS_QUAD)
	tween.set_ease(Tween.EASE_OUT)
	tween.tween_property(btn, "scale", Vector2(1.0, 1.0), 0.10)

# Centered CLOSE-button row appended to the body. Smaller than the
# pre-iter-240 close: ~120 × 34 px with the close-style stylebox.
# The caller passes the dismiss callable.
func _append_modal_close_row(body: VBoxContainer, on_close: Callable) -> Button:
	var spacer: Control = Control.new()
	spacer.custom_minimum_size = Vector2(0, 4)
	body.add_child(spacer)
	var close_row: HBoxContainer = HBoxContainer.new()
	close_row.alignment = BoxContainer.ALIGNMENT_CENTER
	body.add_child(close_row)
	var close_btn: Button = Button.new()
	close_btn.text = "CLOSE"
	close_btn.custom_minimum_size = Vector2(120, 34)
	_style_modal_button(close_btn, "close")
	close_btn.pressed.connect(on_close)
	close_row.add_child(close_btn)
	return close_btn

# Diamond glyph as a small Polygon2D — used as the achievement status
# icon. Gold filled for unlocked, dim outlined for locked. 24×24 cell
# minimum. We wrap it in a Control sized 24×24 so it sits in column 1
# of the achievement row.
func _build_diamond_glyph(unlocked: bool) -> Control:
	var wrap: Control = Control.new()
	wrap.custom_minimum_size = Vector2(24, 24)
	var poly: Polygon2D = Polygon2D.new()
	# Diamond points around center (12, 12), 10 px radius.
	poly.polygon = PackedVector2Array([
		Vector2(12, 2),   # top
		Vector2(22, 12),  # right
		Vector2(12, 22),  # bottom
		Vector2(2, 12),   # left
	])
	if unlocked:
		poly.color = MODAL_TITLE_COLOR
	else:
		# Locked → near-transparent dark with just outline showing.
		poly.color = Color(0.30, 0.26, 0.20, 0.45)
	wrap.add_child(poly)
	# Outline — second Polygon2D drawn slightly larger (line trick),
	# clipped to inner via z order. Cheaper than a Line2D loop here.
	if not unlocked:
		var outline: Polygon2D = Polygon2D.new()
		outline.polygon = PackedVector2Array([
			Vector2(12, 1),
			Vector2(23, 12),
			Vector2(12, 23),
			Vector2(1, 12),
		])
		outline.color = MODAL_MUTED_COLOR
		wrap.add_child(outline)
		wrap.move_child(outline, 0)  # draw outline behind fill
	return wrap

# Small ETHER currency chip — drawn above the bindings row list to
# anchor the "what you can spend" reading. Returns the root Control
# so the caller can swap it out on currency change if desired (we
# currently rebuild the whole panel after every spend).
func _build_currency_chip() -> PanelContainer:
	var chip: PanelContainer = PanelContainer.new()
	var chip_sb: StyleBoxFlat = StyleBoxFlat.new()
	chip_sb.bg_color = Color(0.14, 0.10, 0.06, 0.94)
	chip_sb.border_color = MODAL_BUTTON_GOLD
	chip_sb.border_width_left = 1
	chip_sb.border_width_top = 1
	chip_sb.border_width_right = 1
	chip_sb.border_width_bottom = 1
	chip_sb.corner_radius_top_left = 6
	chip_sb.corner_radius_top_right = 6
	chip_sb.corner_radius_bottom_left = 6
	chip_sb.corner_radius_bottom_right = 6
	chip_sb.content_margin_left = 14
	chip_sb.content_margin_right = 14
	chip_sb.content_margin_top = 4
	chip_sb.content_margin_bottom = 4
	chip.add_theme_stylebox_override("panel", chip_sb)
	chip.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	var label: Label = Label.new()
	label.text = "ETHER  ◇  %d" % GameState.ether_shards
	label.add_theme_color_override("font_color", MODAL_TITLE_COLOR)
	label.add_theme_font_size_override("font_size", 18)
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	chip.add_child(label)
	return chip

# ── Iter 220 / Beta M1.1 — Upgrade tree panel ─────────────────────────
# Adds an UPGRADES button to the main menu CenterStack and an inline
# panel listing the 5 upgrade-tree nodes with invest buttons. Spend
# Ether Shards (M1.0 currency) to advance levels; effects fold into
# GameState.modifier_total at run time.
#
# iter-240 redesign — panel chrome now comes from
# _build_themed_modal_panel: full-screen scrim + center container +
# gold-bordered PanelContainer + title rule + sub-header. Row layout
# is now glyph / name+level / description / invest-button — clean
# 4-column grid via HBoxContainer with fixed widths. INVEST buttons
# now display their state via StyleBoxFlat variant: affordable (gold
# border, gold text), unaffordable (muted violet border, dim grey
# text, disabled), or maxed (solid gold panel, "MAXED" label).

var _upgrades_button: Button = null
var _upgrade_panel: Control = null

func _inject_upgrades_button() -> void:
	var center_stack: Node = $CenterStack
	if center_stack == null or begin_button == null:
		return
	_upgrades_button = Button.new()
	_upgrades_button.text = "UPGRADES"
	_upgrades_button.theme = begin_button.theme  # inherit menu look
	# Insert at index of BeginButton + 1 so the button sits BELOW BEGIN
	# but ABOVE SETTINGS.
	center_stack.add_child(_upgrades_button)
	var idx: int = begin_button.get_index() + 1
	center_stack.move_child(_upgrades_button, idx)
	_upgrades_button.pressed.connect(_on_upgrades_pressed)
	_upgrades_button.pivot_offset = _upgrades_button.size / 2.0
	_upgrades_button.mouse_entered.connect(_on_button_hover_enter.bind(_upgrades_button))
	_upgrades_button.mouse_exited.connect(_on_button_hover_exit.bind(_upgrades_button))
	_upgrades_button.focus_entered.connect(_on_button_hover_enter.bind(_upgrades_button))
	_upgrades_button.focus_exited.connect(_on_button_hover_exit.bind(_upgrades_button))
	_upgrades_button.resized.connect(func ():
		_upgrades_button.pivot_offset = _upgrades_button.size / 2.0
	)

func _on_upgrades_pressed() -> void:
	Audio.play_ui_cue("ui_press", -2.0)
	_show_upgrade_panel()

func _show_upgrade_panel() -> void:
	if _upgrade_panel != null and is_instance_valid(_upgrade_panel):
		return
	# iter-240 redesign — use the shared themed-modal helper.
	var modal: Dictionary = _build_themed_modal_panel(
		"PERMANENT BINDINGS",
		"Bind your ether to permanent gifts.",
		Vector2(580, 480),
	)
	_upgrade_panel = modal["root"]
	_upgrade_panel.name = "UpgradePanel"
	add_child(_upgrade_panel)
	var body: VBoxContainer = modal["body"]
	# Currency chip — centered above the row list. Reads "ETHER ◇ N".
	var chip_row: HBoxContainer = HBoxContainer.new()
	chip_row.alignment = BoxContainer.ALIGNMENT_CENTER
	body.add_child(chip_row)
	chip_row.add_child(_build_currency_chip())
	# One row per node — 4-column layout (glyph / name+level / desc / button).
	for node_id in GameState.UPGRADE_TREE.keys():
		var spec: Dictionary = GameState.UPGRADE_TREE[node_id]
		body.add_child(_build_upgrade_row(node_id, spec))
	# Close button row + ESC keybind.
	_append_modal_close_row(body, _close_upgrade_panel).grab_focus()

# Iter 240 — single-row builder for the BINDINGS panel. Columns:
#   1. status glyph (24×24 diamond, gold filled if any level invested)
#   2. name + level (e.g. "RESILIENCE   1/3")
#   3. description (single-line, truncated if too long)
#   4. INVEST button (affordable / unaffordable / maxed state)
# Total row width: 540 px (32 + 220 + 200 + 130 with separators).
func _build_upgrade_row(node_id: String, spec: Dictionary) -> HBoxContainer:
	var row: HBoxContainer = HBoxContainer.new()
	row.add_theme_constant_override("separation", 16)
	row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	# Column 1 — diamond glyph (gold if invested at all, dim outline otherwise).
	var lvl: int = GameState.upgrade_level(node_id)
	row.add_child(_build_diamond_glyph(lvl > 0))
	# Column 2 — name + level. Two labels in an HBox so we can color
	# the "1/3" portion dimmer than the name.
	var name_box: HBoxContainer = HBoxContainer.new()
	name_box.add_theme_constant_override("separation", 8)
	name_box.custom_minimum_size = Vector2(220, 0)
	var name_label: Label = Label.new()
	name_label.text = str(spec.get("display_name", node_id))
	name_label.add_theme_color_override("font_color", MODAL_BODY_COLOR)
	name_label.add_theme_font_size_override("font_size", 17)
	name_box.add_child(name_label)
	var lvl_label: Label = Label.new()
	lvl_label.text = "%d/%d" % [lvl, spec.get("max_level", 0)]
	lvl_label.add_theme_color_override("font_color", MODAL_MUTED_COLOR)
	lvl_label.add_theme_font_size_override("font_size", 14)
	name_box.add_child(lvl_label)
	row.add_child(name_box)
	# Column 3 — description (single line, clipped if it would wrap).
	var desc: Label = Label.new()
	desc.text = str(spec.get("description", ""))
	desc.add_theme_color_override("font_color", MODAL_MUTED_COLOR)
	desc.add_theme_font_size_override("font_size", 13)
	desc.custom_minimum_size = Vector2(220, 0)
	desc.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	desc.clip_text = true
	row.add_child(desc)
	# Column 4 — INVEST button with state-appropriate styling.
	var btn: Button = Button.new()
	var next_cost: int = GameState.upgrade_next_cost(node_id)
	if next_cost < 0:
		btn.text = "MAXED"
		btn.disabled = true
		_style_modal_button(btn, "maxed")
	else:
		btn.text = "INVEST  ◇%d" % next_cost
		if GameState.ether_shards >= next_cost:
			_style_modal_button(btn, "affordable")
		else:
			btn.disabled = true
			_style_modal_button(btn, "unaffordable")
	btn.custom_minimum_size = Vector2(130, 32)
	btn.pressed.connect(_on_invest_pressed.bind(node_id))
	row.add_child(btn)
	return row

func _on_invest_pressed(node_id: String) -> void:
	if not GameState.upgrade_node(node_id):
		Audio.play_ui_cue("ui_hover", -10.0)  # soft denial
		return
	Audio.play_ui_cue("ui_press", -2.0)
	SaveSystem.save_now()
	_populate_stats()  # refresh menu's records line
	# Rebuild panel so labels reflect new state.
	_close_upgrade_panel()
	_show_upgrade_panel()

# Iter 240 — ESC keybind closes whichever modal is up. Without this
# the player had to mouse to the CLOSE button; ESC felt like it
# should work but didn't. Order of dismissal matches stacking
# expectations: modifiers (top-most when BEGIN pressed) → achievements
# → bindings.
func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and event.physical_keycode == KEY_ESCAPE:
		if _modifiers_panel != null and is_instance_valid(_modifiers_panel):
			_on_modifiers_cancel()
			get_viewport().set_input_as_handled()
			return
		if _achievements_panel != null and is_instance_valid(_achievements_panel):
			_close_achievements_panel()
			get_viewport().set_input_as_handled()
			return
		if _upgrade_panel != null and is_instance_valid(_upgrade_panel):
			_close_upgrade_panel()
			get_viewport().set_input_as_handled()
			return

func _close_upgrade_panel() -> void:
	if _upgrade_panel != null and is_instance_valid(_upgrade_panel):
		_upgrade_panel.queue_free()
		_upgrade_panel = null
	if _upgrades_button != null:
		_upgrades_button.grab_focus()

# ── Iter 225 / Polish Team — Achievements viewer ──────────────────────
# Player-Experience audit (BETA_ROADMAP.md) flagged that the 12
# achievements in GameState.ACHIEVEMENTS unlock SILENTLY into
# unlocked_achievements[] with no in-game way to view them after the
# popup banner clears. Without a viewer the player loses the long-term-
# goal hook: they can't see what's left to chase, can't show off the
# ones they earned, and the meta layer collapses to "stuff that
# happens" instead of "a list I'm filling in."
#
# This adds:
#   • ACHIEVEMENTS button injected into the main menu CenterStack just
#     below UPGRADES (programmatic — no main_menu.tscn edit).
#   • Modal panel listing every entry in GameState.ACHIEVEMENTS with
#     name, description, and locked/unlocked state pulled from
#     GameState.unlocked_achievements.
#
# Unlocked entries render bright with a UNICODE 'OK' glyph + golden
# tint; locked entries dim out (greyscale, name as "???" for spoiler
# protection on the description text but the achievement title still
# shows so the player has a hint). Tests show 12 entries fit on a
# 720-tall viewport without scrolling; the panel uses a ScrollContainer
# anyway so future additions don't break layout.
var _achievements_button: Button = null
var _achievements_panel: Control = null

func _inject_achievements_button() -> void:
	var center_stack: Node = $CenterStack
	if center_stack == null or begin_button == null:
		return
	_achievements_button = Button.new()
	_achievements_button.text = "ACHIEVEMENTS"
	_achievements_button.theme = begin_button.theme  # inherit menu look
	center_stack.add_child(_achievements_button)
	# Place below UPGRADES if present, otherwise just after BEGIN. This
	# orders the meta block as: BEGIN → UPGRADES → ACHIEVEMENTS →
	# SETTINGS → QUIT.
	var anchor: Button = _upgrades_button if _upgrades_button != null else begin_button
	var idx: int = anchor.get_index() + 1
	center_stack.move_child(_achievements_button, idx)
	_achievements_button.pressed.connect(_on_achievements_pressed)
	_achievements_button.pivot_offset = _achievements_button.size / 2.0
	_achievements_button.mouse_entered.connect(_on_button_hover_enter.bind(_achievements_button))
	_achievements_button.mouse_exited.connect(_on_button_hover_exit.bind(_achievements_button))
	_achievements_button.focus_entered.connect(_on_button_hover_enter.bind(_achievements_button))
	_achievements_button.focus_exited.connect(_on_button_hover_exit.bind(_achievements_button))
	_achievements_button.resized.connect(func ():
		_achievements_button.pivot_offset = _achievements_button.size / 2.0
	)

func _on_achievements_pressed() -> void:
	Audio.play_ui_cue("ui_press", -2.0)
	_show_achievements_panel()

func _show_achievements_panel() -> void:
	if _achievements_panel != null and is_instance_valid(_achievements_panel):
		return
	# iter-240 redesign — themed-modal chrome + 3-column rows with
	# diamond glyphs in place of "OK" / "—" prefixes.
	var total: int = GameState.ACHIEVEMENTS.size()
	var unlocked_count: int = GameState.unlocked_achievements.size()
	var sub_text: String = "%d / %d  UNLOCKED" % [unlocked_count, total]
	var modal: Dictionary = _build_themed_modal_panel(
		"ACHIEVEMENTS",
		sub_text,
		Vector2(640, 540),
	)
	_achievements_panel = modal["root"]
	_achievements_panel.name = "AchievementsPanel"
	add_child(_achievements_panel)
	var body: VBoxContainer = modal["body"]
	# Scrollable list — preempts overflow if achievement count grows.
	var scroll: ScrollContainer = ScrollContainer.new()
	scroll.custom_minimum_size = Vector2(580, 380)
	scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	body.add_child(scroll)
	var list_box: VBoxContainer = VBoxContainer.new()
	list_box.add_theme_constant_override("separation", 8)
	list_box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(list_box)
	for id in GameState.ACHIEVEMENTS.keys():
		var spec: Dictionary = GameState.ACHIEVEMENTS[id]
		var is_unlocked: bool = id in GameState.unlocked_achievements
		list_box.add_child(_build_achievement_row(spec, is_unlocked))
	# Close button + focus
	_append_modal_close_row(body, _close_achievements_panel).grab_focus()

# Iter 240 — redesigned row builder. Columns:
#   1. 24×24 diamond glyph (gold filled if unlocked, dim outlined if locked)
#   2. name (warm gold if unlocked, dim grey if locked)
#   3. description (cream if unlocked; "???" in dim grey if locked for
#      spoiler protection)
# Layout uses fixed widths so all three columns align across rows
# regardless of name/description length.
func _build_achievement_row(spec: Dictionary, is_unlocked: bool) -> HBoxContainer:
	var row: HBoxContainer = HBoxContainer.new()
	row.add_theme_constant_override("separation", 14)
	row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	# Column 1 — diamond status glyph (gold/dim).
	row.add_child(_build_diamond_glyph(is_unlocked))
	# Column 2 — name (200 px column).
	var name_label: Label = Label.new()
	name_label.text = str(spec.get("name", "???"))
	name_label.custom_minimum_size = Vector2(200, 0)
	name_label.add_theme_font_size_override("font_size", 16)
	if is_unlocked:
		name_label.add_theme_color_override("font_color", MODAL_TITLE_COLOR)
	else:
		name_label.add_theme_color_override("font_color", MODAL_DISABLED_COLOR)
	row.add_child(name_label)
	# Column 3 — description (fills remaining width).
	var desc_label: Label = Label.new()
	if is_unlocked:
		desc_label.text = str(spec.get("description", ""))
		desc_label.add_theme_color_override("font_color", MODAL_BODY_COLOR)
	else:
		desc_label.text = "???"
		desc_label.add_theme_color_override("font_color", MODAL_DISABLED_COLOR)
	desc_label.add_theme_font_size_override("font_size", 13)
	desc_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	desc_label.custom_minimum_size = Vector2(300, 0)
	desc_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(desc_label)
	return row

func _close_achievements_panel() -> void:
	if _achievements_panel != null and is_instance_valid(_achievements_panel):
		_achievements_panel.queue_free()
		_achievements_panel = null
	if _achievements_button != null:
		_achievements_button.grab_focus()
	Audio.play_ui_cue("ui_press", -4.0)

# ── Iter 239 / Fun Ideas Team R4 — Pre-run Modifiers modal ────────────
# Pops over the main menu when BEGIN is pressed. Lists the 5 catalog
# entries with a toggle button each; shows the current ether multiplier
# at the bottom; CONFIRM finalizes + walks the original BEGIN flow,
# SKIP clears modifiers + proceeds, CANCEL returns to the menu.
#
# Pattern mirrors _show_upgrade_panel + _show_achievements_panel — full-
# screen dim + centered VBox + scroll-friendly. Tested visually at
# 1280×720; the 5 rows fit without scrolling but the layout is
# scroll-tolerant if the catalog ever grows.
var _modifiers_panel: Control = null
var _modifiers_total_label: Label = null

func _show_modifiers_modal() -> void:
	if _modifiers_panel != null and is_instance_valid(_modifiers_panel):
		return
	_modifiers_panel = Control.new()
	_modifiers_panel.name = "ModifiersPanel"
	_modifiers_panel.set_anchors_preset(Control.PRESET_FULL_RECT)
	_modifiers_panel.mouse_filter = Control.MOUSE_FILTER_STOP
	add_child(_modifiers_panel)
	var dim: ColorRect = ColorRect.new()
	dim.set_anchors_preset(Control.PRESET_FULL_RECT)
	dim.color = Color(0, 0, 0, 0.78)
	_modifiers_panel.add_child(dim)
	var center: CenterContainer = CenterContainer.new()
	center.set_anchors_preset(Control.PRESET_FULL_RECT)
	_modifiers_panel.add_child(center)
	var box: VBoxContainer = VBoxContainer.new()
	box.custom_minimum_size = Vector2(640, 0)
	box.add_theme_constant_override("separation", 10)
	center.add_child(box)
	# Header — "PACT OF PUNISHMENT" framing, gold accent matching
	# achievements panel for visual consistency.
	var title: Label = Label.new()
	title.text = "ENTER THE DEPTHS"
	title.add_theme_color_override("font_color", Color(0.96, 0.88, 0.68))
	title.add_theme_font_size_override("font_size", 28)
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	box.add_child(title)
	var sub: Label = Label.new()
	sub.text = "Bind yourself to a harsher path — earn more ether."
	sub.add_theme_color_override("font_color", Color(0.78, 0.82, 0.95))
	sub.add_theme_font_size_override("font_size", 14)
	sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	box.add_child(sub)
	# One row per modifier.
	for entry in FloorModifiers.catalog():
		box.add_child(_build_modifier_row(entry))
	# Footer — running total ether multiplier display.
	var spacer: Control = Control.new()
	spacer.custom_minimum_size = Vector2(0, 8)
	box.add_child(spacer)
	_modifiers_total_label = Label.new()
	_modifiers_total_label.text = ""
	_modifiers_total_label.add_theme_color_override("font_color", Color(1.0, 0.85, 0.50))
	_modifiers_total_label.add_theme_font_size_override("font_size", 18)
	_modifiers_total_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	box.add_child(_modifiers_total_label)
	_refresh_modifiers_total_label()
	# Button row.
	var button_row: HBoxContainer = HBoxContainer.new()
	button_row.alignment = BoxContainer.ALIGNMENT_CENTER
	button_row.add_theme_constant_override("separation", 14)
	box.add_child(button_row)
	var confirm_btn: Button = Button.new()
	confirm_btn.text = "BEGIN"
	confirm_btn.custom_minimum_size = Vector2(160, 38)
	confirm_btn.pressed.connect(_on_modifiers_confirm)
	button_row.add_child(confirm_btn)
	var skip_btn: Button = Button.new()
	skip_btn.text = "NO MODIFIERS"
	skip_btn.custom_minimum_size = Vector2(160, 38)
	skip_btn.pressed.connect(_on_modifiers_skip)
	button_row.add_child(skip_btn)
	var cancel_btn: Button = Button.new()
	cancel_btn.text = "CANCEL"
	cancel_btn.custom_minimum_size = Vector2(120, 38)
	cancel_btn.pressed.connect(_on_modifiers_cancel)
	button_row.add_child(cancel_btn)
	confirm_btn.grab_focus()

# Build a single modifier row: label / description / toggle button.
# Tested layout: 220 + 260 + 100 px columns fit cleanly inside the
# 640 px box width with 16 px of separator slack.
func _build_modifier_row(entry: Dictionary) -> HBoxContainer:
	var row: HBoxContainer = HBoxContainer.new()
	row.add_theme_constant_override("separation", 12)
	var mod_id: String = str(entry.get("id", ""))
	var is_active: bool = mod_id in GameState.active_floor_modifiers
	# Label (gold-tinted, fixed 220 px column).
	var name_label: Label = Label.new()
	name_label.text = str(entry.get("label", mod_id))
	name_label.custom_minimum_size = Vector2(220, 0)
	name_label.add_theme_font_size_override("font_size", 16)
	if is_active:
		name_label.add_theme_color_override("font_color", Color(0.95, 0.55, 0.32))  # active = burnt orange
	else:
		name_label.add_theme_color_override("font_color", Color(0.78, 0.74, 0.66))
	row.add_child(name_label)
	# Description — autowrap, fills remaining width.
	var desc_label: Label = Label.new()
	desc_label.text = "%s   (+%d%% ether)" % [
		str(entry.get("description", "")),
		int(round(float(entry.get("ether_bonus", 0.0)) * 100.0))
	]
	desc_label.add_theme_font_size_override("font_size", 12)
	desc_label.add_theme_color_override("font_color", Color(0.78, 0.78, 0.74))
	desc_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	desc_label.custom_minimum_size = Vector2(280, 0)
	desc_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(desc_label)
	# Toggle button.
	var btn: Button = Button.new()
	btn.text = "ACTIVE" if is_active else "INACTIVE"
	btn.custom_minimum_size = Vector2(100, 32)
	btn.pressed.connect(_on_modifier_toggle.bind(mod_id))
	row.add_child(btn)
	return row

func _on_modifier_toggle(mod_id: String) -> void:
	Audio.play_ui_cue("ui_press", -4.0)
	FloorModifiers.toggle(mod_id)
	# Cheap rebuild — the row count is small enough (5) that a full
	# panel redraw isn't a perf concern, and rebuilding ensures every
	# label's color + total field reflect the new state.
	_close_modifiers_modal_internal()
	_show_modifiers_modal()

func _refresh_modifiers_total_label() -> void:
	if _modifiers_total_label == null:
		return
	var mul: float = FloorModifiers.compute_ether_multiplier()
	var pct: int = int(round((mul - 1.0) * 100.0))
	if pct <= 0:
		_modifiers_total_label.text = "Reward: 1.00× ether shards"
	else:
		_modifiers_total_label.text = "Reward: %.2f× ether shards  (+%d%%)" % [mul, pct]

func _on_modifiers_confirm() -> void:
	Audio.play_ui_cue("ui_press", -2.0)
	_close_modifiers_modal_internal()
	_commit_begin_and_enter_dungeon()

func _on_modifiers_skip() -> void:
	Audio.play_ui_cue("ui_press", -2.0)
	FloorModifiers.clear_all()
	_close_modifiers_modal_internal()
	_commit_begin_and_enter_dungeon()

func _on_modifiers_cancel() -> void:
	Audio.play_ui_cue("ui_press", -4.0)
	# Discard the player's choices on cancel — they explicitly said no.
	FloorModifiers.clear_all()
	_close_modifiers_modal_internal()
	if begin_button != null:
		begin_button.grab_focus()

func _close_modifiers_modal_internal() -> void:
	if _modifiers_panel != null and is_instance_valid(_modifiers_panel):
		_modifiers_panel.queue_free()
		_modifiers_panel = null
	_modifiers_total_label = null
