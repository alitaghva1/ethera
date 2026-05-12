extends SceneTree

# Headless screenshot of the main menu — drops a PNG so we can visually
# verify the iter-92 redesign without launching the editor.
#
# Renders one frame, awaits a couple of process ticks so the ember
# particles draw (preprocess + a few frames in), then captures the
# viewport to disk.
func _initialize() -> void:
	var scene := load("res://scenes/main_menu.tscn") as PackedScene
	if scene == null:
		push_error("FAIL: main_menu.tscn won't load")
		quit(1)
		return
	var inst: Node = scene.instantiate()
	root.add_child(inst)
	# Wait several frames so the AnimationPlayer / Tween / particles have
	# a chance to draw at least the steady-state frame.
	for i in range(8):
		await process_frame
	var img: Image = root.get_texture().get_image()
	var path := "user://main_menu_snapshot.png"
	var err: int = img.save_png(path)
	if err != OK:
		push_error("FAIL: save_png returned %d" % err)
		quit(1)
		return
	print("OK saved snapshot to %s (resolved %s)" % [path, ProjectSettings.globalize_path(path)])
	quit(0)
