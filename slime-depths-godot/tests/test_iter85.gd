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

	# ═══ Spawn-in companion (iter-86 SpawnBurst SUPERSEDED by iter-88) ═══
	# iter-86 procedural SpawnBurst (floor crack + wisps CPUParticles2D)
	# replaced by iter-88's Frostwindz hand-painted spawn_portal sprite
	# sheet (7 frames @ 14fps). enemy.gd now calls FxSprite.spawn with
	# the "spawn_portal" sheet. The intent — companion FX that reads as
	# "the floor opens, enemy steps through" — survives; the rendering
	# went from procedural to painted. See test_iter88.gd for the
	# sprite-sheet assertions.
	var enemy_src := FileAccess.get_file_as_string("res://scripts/enemy.gd")
	if not enemy_src.contains("\"spawn_portal\""):
		push_error("FAIL: enemy.gd no longer spawns the portal companion FX")
		ok = false
	else:
		print("OK enemy.gd spawns spawn_portal FxSprite at spawn-in (iter-88 supersedes iter-86 SpawnBurst)")

	if ok:
		print("=== ITER 85 INTEGRATION PASSED ===")
	else:
		print("=== ITER 85 INTEGRATION FAILED ===")
	quit(0 if ok else 1)
