extends SceneTree

# Iter 208 — load gate for main.tscn. Forces all transitive script
# preloads (main.gd → enemy.gd, hero.gd, projectile.gd, etc) to
# compile + parse. If anything is broken, this prints an error.
func _initialize() -> void:
	print("[check] Loading main.tscn")
	var scene := load("res://scenes/main.tscn") as PackedScene
	if scene == null:
		printerr("FAIL: main.tscn could not be loaded as PackedScene")
		quit(1)
		return
	print("[check] PackedScene loaded; instantiating")
	var inst: Node = scene.instantiate()
	if inst == null:
		printerr("FAIL: scene.instantiate() returned null")
		quit(1)
		return
	print("[check] instantiated; root has %d children" % inst.get_child_count())
	# Check key nodes exist
	for path in ["Hero", "Walls", "UI", "BaseFloor", "CanvasModulate"]:
		var n: Node = inst.get_node_or_null(path)
		if n == null:
			printerr("FAIL: missing expected node '%s'" % path)
		else:
			print("[check] found %s (%s)" % [path, n.get_class()])
	# Tear down without running _ready
	inst.free()
	print("[check] OK")
	quit(0)
