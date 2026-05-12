extends SceneTree

# Iter 83 — persistent battle marks. Enemies leave blood pools on the
# floor at the kill site; marks linger ~30s so the room visibly
# accumulates battle damage through a wave. Matches the JS reference's
# drawRoomMarks atmosphere (slime-depths/src/room.js line 686+).
func _initialize() -> void:
	var ok := true

	# BloodMark scene + script exist
	var bm := load("res://scenes/fx/blood_mark.tscn")
	if bm == null:
		push_error("FAIL: blood_mark.tscn failed to load")
		ok = false
	else:
		print("OK blood_mark.tscn loads")

	var bm_script := load("res://scripts/blood_mark.gd")
	if bm_script == null:
		push_error("FAIL: blood_mark.gd failed to load")
		ok = false
	else:
		print("OK blood_mark.gd loads")

	# Static spawn() exists
	if bm_script != null and not bm_script.has_method("spawn"):
		push_error("FAIL: BloodMark missing static spawn()")
		ok = false
	else:
		print("OK BloodMark has static spawn()")

	# Runtime smoke — instantiate + add to tree to exercise _ready
	var host := Node2D.new()
	root.add_child(host)
	var mark = bm_script.spawn(host, Vector2(640, 384))
	if mark == null:
		push_error("FAIL: BloodMark.spawn returned null")
		ok = false
	else:
		print("OK BloodMark.spawn instantiates + parents to host")
		# z_index = -1 (above floor wash, below decor/hero)
		if mark.z_index != -1:
			push_error("FAIL: BloodMark z_index should be -1, got %d" % mark.z_index)
			ok = false
		else:
			print("OK BloodMark z_index = -1 (floor mark layer)")

	# main.gd hooks the spawn into _on_enemy_died
	var main_src := FileAccess.get_file_as_string("res://scripts/main.gd")
	var idx: int = main_src.find("func _on_enemy_died")
	if idx < 0:
		push_error("FAIL: _on_enemy_died not found in main.gd")
		ok = false
	else:
		var body: String = main_src.substr(idx, 800)
		if not body.contains("BloodMark.spawn"):
			push_error("FAIL: _on_enemy_died doesn't spawn BloodMark")
			ok = false
		else:
			print("OK main.gd _on_enemy_died spawns BloodMark")

	# Required tuning constants in the script for designer-tunability
	var bm_src := FileAccess.get_file_as_string("res://scripts/blood_mark.gd")
	for c in ["FULL_LIFE", "FADE_START", "RADIUS_BASE", "HALO_ALPHA", "CORE_ALPHA"]:
		if not bm_src.contains("const %s" % c):
			push_error("FAIL: blood_mark.gd missing const %s" % c)
			ok = false
	if ok:
		print("OK blood_mark.gd exposes all 5 tuning constants")

	# Two-layer render (halo + core) — both draw calls present in _draw
	if not bm_src.contains("draw_colored_polygon"):
		push_error("FAIL: blood_mark.gd doesn't use draw_colored_polygon")
		ok = false
	else:
		var halo_count: int = bm_src.count("draw_colored_polygon")
		if halo_count < 2:
			push_error("FAIL: blood_mark.gd should render TWO polygons (halo + core), got %d" % halo_count)
			ok = false
		else:
			print("OK blood_mark.gd renders two layers (halo + core)")

	if ok:
		print("=== ITER 83 INTEGRATION PASSED ===")
	else:
		print("=== ITER 83 INTEGRATION FAILED ===")
	quit(0 if ok else 1)
