extends SceneTree

# Runtime test for spawn_portal.gd — surfaces property-assignment bugs
# that --check-only can't catch (e.g. CPUParticles3D properties used on
# CPUParticles2D instance). The headless harness wraps this in a tree
# so _ready fires and all _build_* methods execute.
func _initialize() -> void:
	var ok := true

	# Build a host so spawn() has a parent to attach to.
	var host := Node2D.new()
	root.add_child(host)

	# Call the static spawner — this exercises every _build_* path.
	var portal_scene := load("res://scenes/fx/spawn_portal.tscn")
	if portal_scene == null:
		push_error("FAIL: spawn_portal.tscn failed to load")
		quit(1)
		return
	print("OK spawn_portal.tscn loads")

	# spawn() is the public entry — calls _ready which builds rings,
	# vortex, center, sparks. If any property is invalid, this errors
	# at runtime (not parse time).
	var portal_script := load("res://scripts/spawn_portal.gd")
	if portal_script == null:
		push_error("FAIL: spawn_portal.gd failed to load")
		quit(1)
		return
	print("OK spawn_portal.gd loads")

	# Direct instantiation — bypasses static method for clean error surfacing.
	var portal: Node2D = portal_scene.instantiate()
	if portal == null:
		push_error("FAIL: portal instance is null")
		quit(1)
		return
	host.add_child(portal)
	print("OK portal instantiated + added to tree (all _build_* methods ran)")

	# Verify methods exist
	for fn in ["emit_enemy", "close"]:
		if not portal.has_method(fn):
			push_error("FAIL: portal missing method %s" % fn)
			ok = false
		else:
			print("OK portal has method %s" % fn)

	# Run emit_enemy once to flex the flash path
	portal.emit_enemy()
	print("OK emit_enemy() returned without crash")

	if ok:
		print("=== SPAWN_PORTAL RUNTIME PASSED ===")
	else:
		print("=== SPAWN_PORTAL RUNTIME FAILED ===")
	quit(0 if ok else 1)
