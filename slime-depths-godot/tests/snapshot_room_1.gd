extends SceneTree

# Headless screenshot of a fresh room so we can visually audit the cycle
# 3 art-direction changes without running the full editor / playtest
# loop. Sets up the minimum RunState needed for main.gd to render a
# room, waits a handful of frames so all the spawn pipeline finishes
# (chrome / overlays / prop clusters / focal anchor), captures the
# viewport.
#
# Usage:
#   godot --headless --path . --script tests/snapshot_room_1.gd
# Output: user://room_1_snapshot.png (printed on success)
func _initialize() -> void:
	# RunState is the autoload that holds the active run's room index +
	# config list. main.gd reads from it on _ready to pick which room
	# to load. We just need to ensure it's in a "room 1 of run" state.
	# Defaults are usually fine but force-set in case.
	var rs: Node = root.get_node_or_null("/root/RunState")
	if rs != null:
		# current_room_index = 0 → "ROOM 1 / 6". current_floor / dungeon_runs
		# already default to 0, which is what we want for a fresh-state
		# screenshot.
		rs.set("current_room_index", 0)
	# Load the main combat scene directly — bypasses the menu fade-in.
	var scene := load("res://scenes/main.tscn") as PackedScene
	if scene == null:
		push_error("FAIL: main.tscn won't load")
		quit(1)
		return
	var inst: Node = scene.instantiate()
	root.add_child(inst)
	# Wait many frames so:
	#   • All spawn pipeline functions run (chrome, props, decor, etc.)
	#   • PointLight2D contributions settle into the canvas
	#   • Any tweens (room intro / pedestal pulse / etc.) advance to
	#     mid-animation so we capture a "lived-in" frame, not the
	#     pristine pre-entry state.
	for i in range(20):
		await process_frame
	var img: Image = root.get_texture().get_image()
	var path := "user://room_1_snapshot.png"
	var err: int = img.save_png(path)
	if err != OK:
		push_error("FAIL: save_png returned %d" % err)
		quit(1)
		return
	print("OK saved snapshot to %s (resolved %s)" % [path, ProjectSettings.globalize_path(path)])
	quit(0)
