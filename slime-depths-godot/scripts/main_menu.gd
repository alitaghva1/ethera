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

# ── Iter 220 / Beta M1.1 — Upgrade tree panel ─────────────────────────
# Adds an UPGRADES button to the main menu CenterStack and an inline
# panel listing the 5 upgrade-tree nodes with invest buttons. Spend
# Ether Shards (M1.0 currency) to advance levels; effects fold into
# GameState.modifier_total at run time.

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
	_upgrade_panel = Control.new()
	_upgrade_panel.name = "UpgradePanel"
	_upgrade_panel.set_anchors_preset(Control.PRESET_FULL_RECT)
	_upgrade_panel.mouse_filter = Control.MOUSE_FILTER_STOP
	add_child(_upgrade_panel)
	var dim: ColorRect = ColorRect.new()
	dim.set_anchors_preset(Control.PRESET_FULL_RECT)
	dim.color = Color(0, 0, 0, 0.74)
	_upgrade_panel.add_child(dim)
	var center: CenterContainer = CenterContainer.new()
	center.set_anchors_preset(Control.PRESET_FULL_RECT)
	_upgrade_panel.add_child(center)
	var box: VBoxContainer = VBoxContainer.new()
	box.custom_minimum_size = Vector2(560, 0)
	box.add_theme_constant_override("separation", 12)
	center.add_child(box)
	var title: Label = Label.new()
	title.text = "PERMANENT BINDINGS"
	title.add_theme_color_override("font_color", Color(0.96, 0.88, 0.68))
	title.add_theme_font_size_override("font_size", 28)
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	box.add_child(title)
	var sub: Label = Label.new()
	sub.text = "ETHER ◇ %d" % GameState.ether_shards
	sub.add_theme_color_override("font_color", Color(0.78, 0.82, 0.95))
	sub.add_theme_font_size_override("font_size", 18)
	sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	box.add_child(sub)
	# One row per node.
	for node_id in GameState.UPGRADE_TREE.keys():
		var spec: Dictionary = GameState.UPGRADE_TREE[node_id]
		var row: HBoxContainer = HBoxContainer.new()
		row.add_theme_constant_override("separation", 12)
		box.add_child(row)
		var label: Label = Label.new()
		var lvl: int = GameState.upgrade_level(node_id)
		label.text = "%s  [%d/%d]" % [spec.get("display_name", node_id), lvl, spec.get("max_level", 0)]
		label.add_theme_color_override("font_color", Color(0.94, 0.92, 0.86))
		label.add_theme_font_size_override("font_size", 16)
		label.custom_minimum_size = Vector2(280, 0)
		row.add_child(label)
		var desc: Label = Label.new()
		desc.text = str(spec.get("description", ""))
		desc.add_theme_color_override("font_color", Color(0.78, 0.78, 0.74))
		desc.add_theme_font_size_override("font_size", 12)
		desc.autowrap_mode = TextServer.AUTOWRAP_WORD
		desc.custom_minimum_size = Vector2(180, 0)
		row.add_child(desc)
		var btn: Button = Button.new()
		var next_cost: int = GameState.upgrade_next_cost(node_id)
		if next_cost < 0:
			btn.text = "MAXED"
			btn.disabled = true
		else:
			btn.text = "INVEST ◇%d" % next_cost
			btn.disabled = (GameState.ether_shards < next_cost)
		btn.custom_minimum_size = Vector2(120, 32)
		btn.pressed.connect(_on_invest_pressed.bind(node_id))
		row.add_child(btn)
	# Close button
	var close_row: HBoxContainer = HBoxContainer.new()
	close_row.alignment = BoxContainer.ALIGNMENT_CENTER
	box.add_child(close_row)
	var close_btn: Button = Button.new()
	close_btn.text = "CLOSE"
	close_btn.custom_minimum_size = Vector2(140, 36)
	close_btn.pressed.connect(_close_upgrade_panel)
	close_row.add_child(close_btn)
	close_btn.grab_focus()

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
	_achievements_panel = Control.new()
	_achievements_panel.name = "AchievementsPanel"
	_achievements_panel.set_anchors_preset(Control.PRESET_FULL_RECT)
	_achievements_panel.mouse_filter = Control.MOUSE_FILTER_STOP
	add_child(_achievements_panel)
	# Full-screen dim so the menu visually fades out behind the modal.
	# Matches _show_upgrade_panel and pause_screen._show_quit_confirm
	# darkness levels.
	var dim: ColorRect = ColorRect.new()
	dim.set_anchors_preset(Control.PRESET_FULL_RECT)
	dim.color = Color(0, 0, 0, 0.74)
	_achievements_panel.add_child(dim)
	var center: CenterContainer = CenterContainer.new()
	center.set_anchors_preset(Control.PRESET_FULL_RECT)
	_achievements_panel.add_child(center)
	var box: VBoxContainer = VBoxContainer.new()
	box.custom_minimum_size = Vector2(600, 0)
	box.add_theme_constant_override("separation", 10)
	center.add_child(box)
	# Header — count of unlocked / total, matches the UPGRADES panel's
	# "ETHER ◇ N" sub-header pattern.
	var title: Label = Label.new()
	title.text = "ACHIEVEMENTS"
	title.add_theme_color_override("font_color", Color(0.96, 0.88, 0.68))
	title.add_theme_font_size_override("font_size", 28)
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	box.add_child(title)
	var total: int = GameState.ACHIEVEMENTS.size()
	var unlocked: int = GameState.unlocked_achievements.size()
	var sub: Label = Label.new()
	sub.text = "%d / %d  unlocked" % [unlocked, total]
	sub.add_theme_color_override("font_color", Color(0.78, 0.82, 0.95))
	sub.add_theme_font_size_override("font_size", 16)
	sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	box.add_child(sub)
	# Scrollable list — preempts overflow if achievement count grows
	# past what fits on 720h. Today 12 entries fit comfortably.
	var scroll: ScrollContainer = ScrollContainer.new()
	scroll.custom_minimum_size = Vector2(600, 420)
	box.add_child(scroll)
	var list_box: VBoxContainer = VBoxContainer.new()
	list_box.add_theme_constant_override("separation", 6)
	list_box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(list_box)
	# One row per achievement. Stable iteration order (GameState
	# constant uses dict literal, which Godot preserves insertion order
	# on).
	for id in GameState.ACHIEVEMENTS.keys():
		var spec: Dictionary = GameState.ACHIEVEMENTS[id]
		var is_unlocked: bool = id in GameState.unlocked_achievements
		list_box.add_child(_build_achievement_row(spec, is_unlocked))
	# Close
	var close_row: HBoxContainer = HBoxContainer.new()
	close_row.alignment = BoxContainer.ALIGNMENT_CENTER
	box.add_child(close_row)
	var close_btn: Button = Button.new()
	close_btn.text = "CLOSE"
	close_btn.custom_minimum_size = Vector2(140, 36)
	close_btn.pressed.connect(_close_achievements_panel)
	close_row.add_child(close_btn)
	close_btn.grab_focus()

# Iter 225 — single-row builder. Unlocked entries are bright +
# gold-tinted with an "OK" prefix glyph; locked entries are dim with
# a "—" prefix and the description hidden behind "???". Names stay
# visible regardless so the player has a hint what they're chasing
# (mythic_find = "MYTHIC FIND" already telegraphs "find a mythic
# relic" without spoiling specifics).
func _build_achievement_row(spec: Dictionary, is_unlocked: bool) -> HBoxContainer:
	var row: HBoxContainer = HBoxContainer.new()
	row.add_theme_constant_override("separation", 12)
	# Status glyph (24px column).
	var glyph: Label = Label.new()
	glyph.text = "OK" if is_unlocked else "—"
	glyph.custom_minimum_size = Vector2(36, 0)
	glyph.add_theme_font_size_override("font_size", 16)
	if is_unlocked:
		glyph.add_theme_color_override("font_color", Color(1.00, 0.82, 0.32))
	else:
		glyph.add_theme_color_override("font_color", Color(0.50, 0.50, 0.50))
	row.add_child(glyph)
	# Name column (180px).
	var name_label: Label = Label.new()
	name_label.text = str(spec.get("name", "???"))
	name_label.custom_minimum_size = Vector2(180, 0)
	name_label.add_theme_font_size_override("font_size", 16)
	if is_unlocked:
		name_label.add_theme_color_override("font_color", Color(0.96, 0.92, 0.78))
	else:
		name_label.add_theme_color_override("font_color", Color(0.62, 0.60, 0.56))
	row.add_child(name_label)
	# Description column — autowrap, fills remaining width.
	var desc_label: Label = Label.new()
	if is_unlocked:
		desc_label.text = str(spec.get("description", ""))
		desc_label.add_theme_color_override("font_color", Color(0.86, 0.86, 0.82))
	else:
		# Light spoiler protection — locked entries hide the
		# objective, keeping the player guessing the exact trigger.
		desc_label.text = "???"
		desc_label.add_theme_color_override("font_color", Color(0.46, 0.46, 0.44))
	desc_label.add_theme_font_size_override("font_size", 12)
	desc_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	desc_label.custom_minimum_size = Vector2(340, 0)
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
