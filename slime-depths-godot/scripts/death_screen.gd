# DeathScreen — full-screen overlay (CanvasLayer @ layer 200) that
# the dungeon scene shows on hero death. Reads `GameState.last_run_kills`,
# `GameState.dungeon_runs`, and `GameState.owned_relics` for its
# stats / relics summary, then emits `retry_pressed` or `hamlet_pressed`
# to let the host scene decide what to do next.
#
# Self-contained — does NOT change scenes by itself. The host owns the
# transition (probably reload_current_scene for RETRY, change_scene_to_file
# for HAMLET). Keeping the navigation out of here means the death
# screen can be reused from any future combat scene (boss arena, etc.)
# without baking in scene paths.
#
# Visual treatment: panel reads as a scroll (thick top/bottom borders +
# crimson→black gradient inside), the title "YOU DIED" gets the same
# back-glow Label trick as the main menu, and the kills/runs stats are
# laid out as big gold numbers with small cream sub-captions beneath.
extends CanvasLayer

signal retry_pressed
signal hamlet_pressed

const HOVER_SCALE := 1.05
const HOVER_TWEEN_TIME := 0.12

@onready var panel: Panel = $Panel
@onready var title: Label = $Panel/Stack/TitleBlock/Title
@onready var title_glow: Label = $Panel/Stack/TitleBlock/TitleGlow
@onready var kills_number: Label = $Panel/Stack/StatsRow/KillsBlock/KillsNumber
@onready var runs_number: Label = $Panel/Stack/StatsRow/RunsBlock/RunsNumber
@onready var relics_title: Label = $Panel/Stack/RelicsTitle
@onready var relics_list: VBoxContainer = $Panel/Stack/RelicsList
@onready var retry_button: Button = $Panel/Stack/ButtonRow/RetryButton
@onready var hamlet_button: Button = $Panel/Stack/ButtonRow/HamletButton

var _hover_tweens: Dictionary = {}

func _ready() -> void:
	retry_button.pressed.connect(_on_retry_pressed)
	hamlet_button.pressed.connect(_on_hamlet_pressed)
	for btn in [retry_button, hamlet_button]:
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
	_rebuild_relics_list()
	visible = true
	# Defer focus by one frame — the CanvasLayer becomes visible THIS
	# frame, but Control children's focus_mode isn't applied to a
	# hidden tree. One frame later they're ready.
	await get_tree().process_frame
	retry_button.grab_focus()

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
	hide_death()
	retry_pressed.emit()

func _on_hamlet_pressed() -> void:
	hide_death()
	hamlet_pressed.emit()

func _on_button_hover_enter(button: Button) -> void:
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
