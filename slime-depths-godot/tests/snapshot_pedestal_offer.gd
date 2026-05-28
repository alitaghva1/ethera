extends SceneTree

# Headless snapshot of three pedestals side-by-side, mimicking the
# actual pedestal-offer layout in _spawn_pedestal_offer (main.gd:1814).
# Drops a PNG so we can visually verify the iter-108 readability bump.
func _initialize() -> void:
	var scene := load("res://scenes/pedestal.tscn") as PackedScene
	if scene == null:
		quit(1)
		return
	# Solid dark background ColorRect so the panel reads against context.
	var bg: ColorRect = ColorRect.new()
	bg.color = Color(0.10, 0.08, 0.12, 1.0)
	bg.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.add_child(bg)
	# Three pedestals at 200-px stride centered on 640. Set relic_ids
	# to match the user's screenshot (iron_fang / stoneheart / iron_will)
	# so we can compare apples-to-apples.
	var relic_ids: Array[String] = ["iron_fang", "stoneheart", "iron_will"]
	var spacing: float = 200.0
	var start_x: float = 640.0 - spacing * (relic_ids.size() - 1) / 2.0
	var y: float = 460.0   # match the typical offer y (close to center vertical)
	var peds: Array = []
	for i in range(relic_ids.size()):
		var ped: Node = scene.instantiate()
		ped.relic_id = relic_ids[i]
		ped.position = Vector2(start_x + spacing * i, y)
		root.add_child(ped)
		peds.append(ped)
	# Wait enough frames for pedestal.gd's two-phase _sync_offer_panel_height
	# (custom_minimum_size apply + autowrap settle, then re-measure for cap).
	for i in range(10):
		await process_frame
	var img: Image = root.get_texture().get_image()
	var path := "user://pedestal_offer_snapshot.png"
	var err: int = img.save_png(path)
	if err != OK:
		quit(1)
		return
	print("OK saved snapshot to %s (resolved %s)" % [path, ProjectSettings.globalize_path(path)])
	quit(0)
