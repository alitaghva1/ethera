# DeathScreen — full-screen overlay (CanvasLayer @ layer 200) that
# the dungeon scene shows on hero death. Reads `GameState.last_run_kills`,
# `GameState.dungeon_runs`, and `GameState.owned_relics` for its
# stats / relics summary, then emits `retry_pressed` or `menu_pressed`
# to let the host scene decide what to do next.
#
# Self-contained — does NOT change scenes by itself. The host owns the
# transition (probably reload_current_scene for RETRY, change_scene_to_file
# to main_menu for MENU). Keeping the navigation out of here means the
# death screen can be reused from any future combat scene (boss arena,
# etc.) without baking in scene paths.
#
# Visual treatment: panel reads as a scroll (thick top/bottom borders +
# crimson→black gradient inside), the title "YOU DIED" gets the same
# back-glow Label trick as the main menu, and the kills/runs stats are
# laid out as big gold numbers with small cream sub-captions beneath.
extends CanvasLayer

signal retry_pressed
signal menu_pressed

const HOVER_SCALE := 1.05
const HOVER_TWEEN_TIME := 0.12

@onready var panel: Panel = $Panel
@onready var title: Label = $Panel/Stack/TitleBlock/Title
@onready var title_glow: Label = $Panel/Stack/TitleBlock/TitleGlow
@onready var kills_number: Label = $Panel/Stack/StatsRow/KillsBlock/KillsNumber
@onready var runs_number: Label = $Panel/Stack/StatsRow/RunsBlock/RunsNumber
# Iter 159 — TimeBlock readouts. last_run_time was snapshotted at
# hero-death by GameState.finalize_run_time (iter-158). The caption
# flips to "best!" + warm gold when this run set a new best.
@onready var time_number: Label = $Panel/Stack/StatsRow/TimeBlock/TimeNumber
@onready var time_caption: Label = $Panel/Stack/StatsRow/TimeBlock/TimeCaption
@onready var relics_title: Label = $Panel/Stack/RelicsTitle
@onready var relics_list: VBoxContainer = $Panel/Stack/RelicsList
@onready var retry_button: Button = $Panel/Stack/ButtonRow/RetryButton
@onready var menu_button: Button = $Panel/Stack/ButtonRow/MenuButton

var _hover_tweens: Dictionary = {}

func _ready() -> void:
	retry_button.pressed.connect(_on_retry_pressed)
	menu_button.pressed.connect(_on_menu_pressed)
	for btn in [retry_button, menu_button]:
		var b: Button = btn
		b.pivot_offset = b.size / 2.0
		b.mouse_entered.connect(_on_button_hover_enter.bind(b))
		b.mouse_exited.connect(_on_button_hover_exit.bind(b))
		b.focus_entered.connect(_on_button_hover_enter.bind(b))
		b.focus_exited.connect(_on_button_hover_exit.bind(b))
		b.resized.connect(func ():
			b.pivot_offset = b.size / 2.0
		)

	# Pivot the title labels at their center so any future scale/glow
	# tween anchors symmetrically. No infinite pulse on the death screen
	# — the screen wants stillness, not life.
	_recenter_title_pivots()
	title.resized.connect(_recenter_title_pivots)
	title_glow.resized.connect(_recenter_title_pivots)

# Show the overlay with the kills count from this run. Reads dungeon_runs
# + owned_relics straight from GameState — keeps the show_death signature
# small while still letting it summarize the meta state. _has_game_state
# guards make the scene runnable in isolation (no autoload registered)
# for in-editor preview without crashing.
func show_death(kills: int) -> void:
	var runs: int = 0
	if _has_game_state():
		runs = GameState.dungeon_runs
	kills_number.text = str(kills)
	runs_number.text = str(runs)
	# Iter 159 — read run time from GameState (snapshotted at hero
	# death by iter-158's finalize_run_time hook). Compare against
	# best_run_time to decide whether this is a NEW BEST (faster).
	# Sentinel: best_run_time < 0 means "no completed run yet" — in
	# that case the FIRST completed run is automatically a best.
	var last_t: float = 0.0
	var best_t: float = -1.0
	if _has_game_state():
		last_t = GameState.last_run_time
		best_t = GameState.best_run_time
	if time_number != null:
		time_number.text = _format_mss(last_t)
	if time_caption != null:
		var is_best: bool = last_t > 0.0 and (best_t < 0.0 or last_t <= best_t)
		if is_best:
			time_caption.text = "best!"
			time_caption.add_theme_color_override("font_color", Color(1.0, 0.85, 0.42, 1.0))
		else:
			time_caption.text = "time"
			time_caption.add_theme_color_override("font_color", Color(0.78, 0.72, 0.62, 1.0))
	# Iter 49 — death-screen polish. Three new content blocks injected
	# at show time (vs hardcoded scene nodes) so adding a 4th later is
	# cheap and the .tscn stays lean. _rebuild_relics_list already
	# clears+rebuilds its panel; the new blocks follow that pattern.
	_rebuild_reached_label(kills)
	_rebuild_themes_summary()
	_rebuild_relics_list()
	# iter-102: fade in instead of hard-cut. Every other cinematic
	# transition in the kit tweens (boss intro 0.25s, pickup banner,
	# floor card) — the death overlay was the only one that slammed
	# to full opacity in one frame. Reads more like an alt-tab than
	# a polished death. 0.35s ease-out feels weighty without dragging.
	# iter-107 FIX: CanvasLayer doesn't have a `modulate` property
	# (only CanvasItem subclasses do). Iter-102 broke load with
	# "Identifier 'modulate' not declared." Tween each CanvasItem
	# CHILD's modulate in parallel instead.
	visible = true
	var fade_tw: Tween = create_tween()
	fade_tw.set_parallel(true)
	fade_tw.set_trans(Tween.TRANS_QUAD)
	fade_tw.set_ease(Tween.EASE_OUT)
	for child in get_children():
		if child is CanvasItem:
			var ci: CanvasItem = child
			ci.modulate.a = 0.0
			fade_tw.tween_property(ci, "modulate:a", 1.0, 0.35)
	# Defer focus by one frame — the CanvasLayer becomes visible THIS
	# frame, but Control children's focus_mode isn't applied to a
	# hidden tree. One frame later they're ready.
	await get_tree().process_frame
	retry_button.grab_focus()

# Iter 49 — "REACHED" line: shows the room display_name + floor/room
# index of the death site. Optionally a "NEW BEST!" callout if this
# run's kills beat the prior best. Injected above the StatsRow so
# it reads first as the player scans the screen.
var _reached_label: Label = null
var _best_callout: Label = null
func _rebuild_reached_label(kills: int) -> void:
	if not _has_game_state():
		return
	# Pull room info from RunState autoload.
	var run_state: Node = Engine.get_main_loop().root.get_node_or_null("/root/RunState")
	if run_state == null:
		return
	var idx: int = int(run_state.get("current_room_index"))
	var cfg = run_state.get("current_room_config")
	var room_name: String = "DUNGEON"
	if cfg != null and "display_name" in cfg:
		room_name = str(cfg.get("display_name"))
	# Floor numbering: rooms 1-3 = floor 1, 4-6 = floor 2 (matches
	# floor_state.gd's 2-boss-per-floor layout). Special detour rooms
	# (treasure/shrine) report the slot they replaced.
	var floor_n: int = 1 if idx < 3 else 2
	var room_n: int = (idx % 3) + 1
	# Stack injection: insert above StatsRow.
	var stack: VBoxContainer = $Panel/Stack as VBoxContainer
	if _reached_label != null and is_instance_valid(_reached_label):
		_reached_label.queue_free()
	_reached_label = Label.new()
	_reached_label.text = "REACHED %s  ·  FLOOR %d · ROOM %d" % [room_name, floor_n, room_n]
	_reached_label.add_theme_font_size_override("font_size", 14)
	_reached_label.add_theme_color_override("font_color", Color(0.78, 0.65, 0.41, 1))
	_reached_label.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.95))
	_reached_label.add_theme_constant_override("outline_size", 2)
	_reached_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	stack.add_child(_reached_label)
	stack.move_child(_reached_label, 2)   # below TitleBlock+Divider, above StatsRow
	# "NEW BEST!" callout when this run's kills beat the prior best.
	# start_dungeon_run promotes prior → best BEFORE the new run starts,
	# so best_run_kills here = prior best (not yet updated for the dying
	# run). Comparison is therefore against the previous PB.
	if _best_callout != null and is_instance_valid(_best_callout):
		_best_callout.queue_free()
	_best_callout = null   # clear ref so subsequent !null checks work
	var prior_best: int = int(GameState.best_run_kills)
	if kills > prior_best and prior_best > 0:
		_best_callout = Label.new()
		_best_callout.text = "★  NEW BEST  ★"
		_best_callout.add_theme_font_size_override("font_size", 18)
		_best_callout.add_theme_color_override("font_color", Color(1.0, 0.92, 0.45, 1))
		_best_callout.add_theme_color_override("font_outline_color", Color(0.45, 0.20, 0.0, 0.95))
		_best_callout.add_theme_constant_override("outline_size", 3)
		_best_callout.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		stack.add_child(_best_callout)
		stack.move_child(_best_callout, 3)

# Iter 49 — active themes summary. Shows a small horizontal strip
# of theme chips on the death screen so the player sees what build
# they were running at death. Resonance chips ◆, ascendance chips ◆◆.
var _themes_strip: HBoxContainer = null
func _rebuild_themes_summary() -> void:
	if not _has_game_state():
		return
	if not GameState.has_method("active_themes"):
		return
	var stack: VBoxContainer = $Panel/Stack as VBoxContainer
	if _themes_strip != null and is_instance_valid(_themes_strip):
		_themes_strip.queue_free()
	_themes_strip = HBoxContainer.new()
	_themes_strip.add_theme_constant_override("separation", 12)
	_themes_strip.alignment = BoxContainer.ALIGNMENT_CENTER
	stack.add_child(_themes_strip)
	# Position: just above the RelicsTitle (which is index 5 typically,
	# but iter 49 inserts reached_label + best_callout above, so
	# RelicsTitle is now at a higher index. Move via end-of-stack +
	# move_child for clarity).
	var relics_title_idx: int = stack.get_children().find($Panel/Stack/RelicsTitle)
	if relics_title_idx >= 0:
		stack.move_child(_themes_strip, relics_title_idx)
	var active: Dictionary = GameState.active_themes()
	if active.is_empty():
		_themes_strip.visible = false
		return
	var theme_colors: Dictionary = {
		"storm": Color(0.55, 0.85, 1.0, 1.0),
		"flame": Color(1.0, 0.55, 0.30, 1.0),
		"blood": Color(0.95, 0.45, 0.45, 1.0),
		"vow": Color(0.92, 0.92, 0.78, 1.0),
		"shadow": Color(0.78, 0.65, 1.0, 1.0),
	}
	for theme in active.keys():
		var tier: int = int(active[theme])
		var glyph: String = "◆" if tier == 1 else "◆◆"
		var lbl: Label = Label.new()
		lbl.text = "%s  %s" % [str(theme).to_upper(), glyph]
		lbl.add_theme_font_size_override("font_size", 13)
		lbl.add_theme_color_override("font_color", theme_colors.get(theme, Color.WHITE))
		lbl.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.92))
		lbl.add_theme_constant_override("outline_size", 3)
		_themes_strip.add_child(lbl)

func hide_death() -> void:
	visible = false

func _rebuild_relics_list() -> void:
	# Clear previous run's entries.
	for child in relics_list.get_children():
		child.queue_free()
	if not _has_game_state():
		relics_title.visible = false
		return
	var owned: Array = GameState.owned_relics
	if owned.is_empty():
		relics_title.visible = true
		var none_lbl: Label = Label.new()
		none_lbl.text = "(none)"
		none_lbl.add_theme_font_size_override("font_size", 13)
		none_lbl.add_theme_color_override("font_color", Color(0.55, 0.48, 0.36, 1))
		none_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		relics_list.add_child(none_lbl)
		return
	relics_title.visible = true
	for rid in owned:
		var info: Dictionary = GameState.relic_info(rid)
		var nm: String = info.get("name", rid)
		# Bullet glyph (• U+2022) prefixed at gold, name in cream. A
		# single Label with both colors would need BBCode; using one
		# label is fine here since the bullet reads as part of the line.
		var lbl: Label = Label.new()
		lbl.text = "•  %s" % nm
		lbl.add_theme_font_size_override("font_size", 14)
		lbl.add_theme_color_override("font_color", Color(0.96, 0.85, 0.63, 1))
		lbl.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.95))
		lbl.add_theme_constant_override("outline_size", 2)
		lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		relics_list.add_child(lbl)

func _has_game_state() -> bool:
	# When the scene is run in isolation (no autoload registered) the
	# GameState identifier won't resolve. Guarded property access lets
	# the overlay still render its skeleton without crashing.
	return ResourceLoader.exists("res://scripts/game_state.gd") and Engine.get_main_loop().root.has_node("/root/GameState")

func _on_retry_pressed() -> void:
	# iter-114: ui_press cue. Matches the main_menu / pause_screen
	# convention so the death-screen actions feel acoustically part
	# of the same UI family.
	Audio.play_ui_cue("ui_press", -2.0)
	hide_death()
	retry_pressed.emit()

func _on_menu_pressed() -> void:
	Audio.play_ui_cue("ui_press", -2.0)
	hide_death()
	menu_pressed.emit()

func _on_button_hover_enter(button: Button) -> void:
	# iter-114: ui_hover cue at -8 dB (same level as the main menu).
	# Focus_entered is also bound to this handler in _ready, so keyboard
	# nav (Tab between RETRY / MAIN MENU) gets the same audible cue.
	Audio.play_ui_cue("ui_hover", -8.0)
	_animate_scale(button, HOVER_SCALE)

func _on_button_hover_exit(button: Button) -> void:
	_animate_scale(button, 1.0)

func _animate_scale(button: Button, target: float) -> void:
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

# Iter 159 — format a duration in seconds as "m:ss". Used by the
# death-screen TIME block. Capped at 99:59 (a run exceeding that is
# off-design and overflowing the column width assumption).
func _format_mss(secs: float) -> String:
	var total_sec: int = maxi(0, int(secs))
	var m: int = mini(99, total_sec / 60)
	var s: int = total_sec % 60
	return "%d:%02d" % [m, s]
