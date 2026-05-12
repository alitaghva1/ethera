extends SceneTree

# Iter 85 — fire visual rebuild + enemy spawn-in immersion.
#
# Two pieces:
#   1. fire_jet's scale-flickering rectangle replaced with per-vertex
#      wobble + rising ember particles + smoke wisps at the top.
#   2. New SpawnBurst FX companion fires alongside enemy spawn-in
#      (floor crack + rising wisps). Restrained — NOT a portal.
func _initialize() -> void:
	var ok := true

	# ═══ Fire jet rebuild ═══

	var fj_src := FileAccess.get_file_as_string("res://scripts/fire_jet.gd")

	if not fj_src.contains("func _wobble_polygon"):
		push_error("FAIL: fire_jet.gd missing _wobble_polygon helper")
		ok = false
	else:
		print("OK fire_jet.gd has _wobble_polygon (replaces scale.y flicker)")

	if not (fj_src.contains("_flame_body_base") and fj_src.contains("_flame_halo_base")):
		push_error("FAIL: fire_jet.gd missing base polygon caches")
		ok = false
	else:
		print("OK fire_jet.gd caches base polygons in _ready")

	for c in ["FLAME_WOBBLE_AMPLITUDE", "FLAME_WOBBLE_FREQ_HZ", "FLAME_WOBBLE_PHASE_STRIDE"]:
		if not fj_src.contains("const %s" % c):
			push_error("FAIL: fire_jet.gd missing wobble const %s" % c)
			ok = false
	if ok:
		print("OK fire_jet.gd exposes all 3 wobble tuning constants")

	if not (fj_src.contains("_rising_embers") and fj_src.contains("_smoke_wisps")):
		push_error("FAIL: fire_jet.gd missing _rising_embers or _smoke_wisps refs")
		ok = false
	else:
		print("OK fire_jet.gd references RisingEmbers + SmokeWisps")

	var fj_scene_src := FileAccess.get_file_as_string("res://scenes/hazards/fire_jet.tscn")
	for node_name in ["RisingEmbers", "SmokeWisps"]:
		if not fj_scene_src.contains("name=\"%s\"" % node_name):
			push_error("FAIL: fire_jet.tscn missing %s node" % node_name)
			ok = false
	if ok:
		print("OK fire_jet.tscn has RisingEmbers + SmokeWisps CPUParticles2D nodes")

	var fj_scene := load("res://scenes/hazards/fire_jet.tscn")
	if fj_scene == null:
		push_error("FAIL: fire_jet.tscn no longer loads")
		ok = false
	else:
		var host := Node2D.new()
		root.add_child(host)
		var fj: Node = fj_scene.instantiate()
		if fj == null:
			push_error("FAIL: fire_jet failed to instantiate")
			ok = false
		else:
			host.add_child(fj)
			if fj.get_node_or_null("RisingEmbers") == null:
				push_error("FAIL: instantiated fire_jet missing RisingEmbers child")
				ok = false
			elif fj.get_node_or_null("SmokeWisps") == null:
				push_error("FAIL: instantiated fire_jet missing SmokeWisps child")
				ok = false
			else:
				print("OK fire_jet instantiates with all new children")

	# ═══ SpawnBurst companion ═══

	var sb_scene := load("res://scenes/fx/spawn_burst.tscn")
	if sb_scene == null:
		push_error("FAIL: spawn_burst.tscn failed to load")
		ok = false
	else:
		print("OK spawn_burst.tscn loads")

	var sb_script := load("res://scripts/spawn_burst.gd")
	if sb_script == null or not sb_script.has_method("spawn"):
		push_error("FAIL: SpawnBurst missing static spawn()")
		ok = false
	else:
		print("OK SpawnBurst has static spawn()")

	var host2 := Node2D.new()
	root.add_child(host2)
	var burst = sb_script.spawn(host2, Vector2(640, 384))
	if burst == null:
		push_error("FAIL: SpawnBurst.spawn returned null")
		ok = false
	else:
		print("OK SpawnBurst.spawn instantiates + parents to host")
		if burst.z_index != 1:
			push_error("FAIL: SpawnBurst z_index should be 1, got %d" % burst.z_index)
			ok = false
		else:
			print("OK SpawnBurst z_index = 1")

	var enemy_src := FileAccess.get_file_as_string("res://scripts/enemy.gd")
	if not enemy_src.contains("SpawnBurst.spawn"):
		push_error("FAIL: enemy.gd doesn't spawn SpawnBurst at spawn-in")
		ok = false
	else:
		print("OK enemy.gd _ready spawns SpawnBurst alongside sprite fade")

	var sb_src := FileAccess.get_file_as_string("res://scripts/spawn_burst.gd")
	for c in ["LIFETIME", "CRACK_RADIUS", "CRACK_PEAK_ALPHA", "FEET_Y_OFFSET"]:
		if not sb_src.contains("const %s" % c):
			push_error("FAIL: spawn_burst.gd missing const %s" % c)
			ok = false
	if ok:
		print("OK spawn_burst.gd exposes 4 tuning constants")

	if ok:
		print("=== ITER 85 INTEGRATION PASSED ===")
	else:
		print("=== ITER 85 INTEGRATION FAILED ===")
	quit(0 if ok else 1)
