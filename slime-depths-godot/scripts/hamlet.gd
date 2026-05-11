# Hamlet — the player-controlled hub between dungeon runs. Three NPCs
# the player can talk to + a portal at the south leading to the
# dungeon (main.tscn). Surfaces session state (last run kills, owned
# relics) on load so progress is visible immediately on return.
extends Node2D

@onready var status_label: Label = $UI/StatusLabel
@onready var run_label: Label = $UI/RunLabel
@onready var relics_panel: VBoxContainer = $UI/RelicsPanel
@onready var relics_title: Label = $UI/RelicsPanel/Title

func _ready() -> void:
	if GameState.dungeon_runs > 0:
		run_label.text = "Last run  ·  %d kills  ·  run %d" % [
			GameState.last_run_kills, GameState.dungeon_runs
		]
	else:
		run_label.text = ""
	status_label.text = "Hamlet — [E] talk to NPCs · walk south to descend"
	_render_relics()

func _render_relics() -> void:
	# Clear any prior relic rows under the title.
	for child in relics_panel.get_children():
		if child.name != "Title":
			child.queue_free()
	if GameState.owned_relics.is_empty():
		relics_title.text = "RELICS  (none yet)"
		return
	relics_title.text = "RELICS"
	for rid in GameState.owned_relics:
		var info: Dictionary = GameState.relic_info(rid)
		var name_label := Label.new()
		name_label.text = "·  " + str(info.get("name", rid))
		name_label.add_theme_font_size_override("font_size", 14)
		name_label.add_theme_color_override("font_color", Color(0.96, 0.85, 0.63))
		relics_panel.add_child(name_label)
		var desc_label := Label.new()
		desc_label.text = "    " + str(info.get("description", ""))
		desc_label.add_theme_font_size_override("font_size", 11)
		desc_label.add_theme_color_override("font_color", Color(0.65, 0.58, 0.45))
		desc_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		desc_label.custom_minimum_size = Vector2(280, 0)
		relics_panel.add_child(desc_label)
