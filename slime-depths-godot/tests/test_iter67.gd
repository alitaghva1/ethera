extends SceneTree

# Iter 67 integration test — verify both parallel tracks landed.
func _initialize() -> void:
	var ok := true

	# Track A: projectile.gd has chain fields
	var proj_src := FileAccess.get_file_as_string("res://scripts/projectile.gd")
	if not proj_src.contains("storm_chain_count"):
		push_error("FAIL: projectile.gd missing storm_chain_count")
		ok = false
	elif not proj_src.contains("storm_chain_radius"):
		push_error("FAIL: projectile.gd missing storm_chain_radius")
		ok = false
	else:
		print("OK projectile.gd has storm_chain_count + storm_chain_radius")

	# Track A: hero.gd sets chain count from STORM tier
	var hero_src := FileAccess.get_file_as_string("res://scripts/hero.gd")
	if not hero_src.contains("storm_chain_count"):
		push_error("FAIL: hero.gd doesn't set storm_chain_count")
		ok = false
	elif not (hero_src.contains("theme_tier(\"storm\")") or hero_src.contains("theme_tier('storm')")):
		push_error("FAIL: hero.gd doesn't read storm theme tier")
		ok = false
	else:
		print("OK hero.gd reads storm theme_tier + sets chain count")

	# Track A: chain_arc scene exists
	var chain_arc := load("res://scenes/fx/chain_arc.tscn")
	if chain_arc == null:
		push_error("FAIL: chain_arc.tscn failed to load")
		ok = false
	else:
		print("OK chain_arc.tscn loads")

	# Track B: pedestal.gd has improved sync (custom_minimum_size + await process_frame)
	var ped_src := FileAccess.get_file_as_string("res://scripts/pedestal.gd")
	if not ped_src.contains("custom_minimum_size"):
		push_error("FAIL: pedestal.gd doesn't set custom_minimum_size")
		ok = false
	elif not ped_src.contains("await get_tree().process_frame"):
		push_error("FAIL: pedestal.gd doesn't await process_frame for sync")
		ok = false
	else:
		print("OK pedestal.gd pins custom_minimum_size + awaits process_frame")

	# Track B: room_06 has bone_summoner
	var room06: Resource = load("res://scenes/rooms/room_06.tres")
	if room06 == null:
		push_error("FAIL: room_06.tres failed to load")
		ok = false
	else:
		var has_summoner := false
		var waves: Array = room06.get("waves")
		for wave in waves:
			for entry in wave:
				if typeof(entry) == TYPE_ARRAY and entry.size() >= 1 and str(entry[0]) == "bone_summoner":
					has_summoner = true
		if not has_summoner:
			push_error("FAIL: room_06 doesn't include bone_summoner")
			ok = false
		else:
			print("OK room_06 includes bone_summoner in waves")

	if ok:
		print("=== ITER 67 INTEGRATION PASSED ===")
	else:
		print("=== ITER 67 INTEGRATION FAILED ===")
	quit(0 if ok else 1)
