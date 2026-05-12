extends SceneTree

# Iter 65 integration test (backfilled) — verifies iter-65 deliverables
# still hold on current HEAD. Source commit: 9e6541e.
#
# Track A: BLAST + FLAME impact fire pool
#   - projectile.gd has flame_impact_pool_life field (default 0.0)
#   - hero.gd sets it from GameState.theme_tier("flame")
#
# Track B: Spectral Priest healer enemy
#   - scenes/enemies/spectral_priest.tres exists with behavior="healer",
#     max_hp=4, move_speed=60.0
#   - enemy.gd has HealerState enum + _tick_healer
#   - room_05.tres wave 2 includes "spectral_priest"
#   - main.gd ENEMY_TYPES registers "spectral_priest"
func _initialize() -> void:
	var ok := true

	# Track A: projectile.gd flame_impact_pool_life field
	var proj_src := FileAccess.get_file_as_string("res://scripts/projectile.gd")
	if not proj_src.contains("flame_impact_pool_life"):
		push_error("FAIL: projectile.gd missing flame_impact_pool_life")
		ok = false
	elif not proj_src.contains("FIRE_POOL_SCENE"):
		push_error("FAIL: projectile.gd missing FIRE_POOL_SCENE preload")
		ok = false
	else:
		print("OK projectile.gd has flame_impact_pool_life + FIRE_POOL_SCENE")

	# Track A: hero.gd sets flame_impact_pool_life from FLAME theme tier
	var hero_src := FileAccess.get_file_as_string("res://scripts/hero.gd")
	if not hero_src.contains("flame_impact_pool_life"):
		push_error("FAIL: hero.gd doesn't set flame_impact_pool_life on blast")
		ok = false
	elif not (hero_src.contains("theme_tier(\"flame\")") or hero_src.contains("theme_tier('flame')")):
		push_error("FAIL: hero.gd doesn't read flame theme tier")
		ok = false
	else:
		print("OK hero.gd reads flame theme_tier + sets flame_impact_pool_life")

	# Track B: spectral_priest.tres healer config
	var priest_res: Resource = load("res://scenes/enemies/spectral_priest.tres")
	if priest_res == null:
		push_error("FAIL: spectral_priest.tres failed to load")
		ok = false
	else:
		var beh: String = priest_res.get("behavior")
		var hp: int = priest_res.get("max_hp")
		var spd: float = priest_res.get("move_speed")
		if beh != "healer":
			push_error("FAIL: spectral_priest behavior=%s, expected healer" % beh)
			ok = false
		elif hp != 4:
			push_error("FAIL: spectral_priest max_hp=%d, expected 4" % hp)
			ok = false
		elif not is_equal_approx(spd, 60.0):
			push_error("FAIL: spectral_priest move_speed=%s, expected 60.0" % spd)
			ok = false
		else:
			print("OK spectral_priest behavior=%s hp=%d speed=%s" % [beh, hp, spd])

	# Track B: enemy.gd has HealerState + _tick_healer
	var enemy_src := FileAccess.get_file_as_string("res://scripts/enemy.gd")
	if not enemy_src.contains("HealerState"):
		push_error("FAIL: enemy.gd missing HealerState enum")
		ok = false
	elif not enemy_src.contains("_tick_healer"):
		push_error("FAIL: enemy.gd missing _tick_healer")
		ok = false
	else:
		print("OK enemy.gd has HealerState + _tick_healer")

	# Track B: main.gd ENEMY_TYPES registers spectral_priest
	var main_src := FileAccess.get_file_as_string("res://scripts/main.gd")
	if not main_src.contains("spectral_priest"):
		push_error("FAIL: main.gd doesn't register spectral_priest in ENEMY_TYPES")
		ok = false
	else:
		print("OK main.gd registers spectral_priest")

	# Track B: room_05 includes spectral_priest in waves
	var room05: Resource = load("res://scenes/rooms/room_05.tres")
	if room05 == null:
		push_error("FAIL: room_05.tres failed to load")
		ok = false
	else:
		var has_priest := false
		var waves: Array = room05.get("waves")
		for wave in waves:
			for entry in wave:
				if typeof(entry) == TYPE_ARRAY and entry.size() >= 1 and str(entry[0]) == "spectral_priest":
					has_priest = true
		if not has_priest:
			push_error("FAIL: room_05 doesn't include spectral_priest in any wave")
			ok = false
		else:
			print("OK room_05 includes spectral_priest in waves")

	if ok:
		print("=== ITER 65 INTEGRATION PASSED ===")
	else:
		print("=== ITER 65 INTEGRATION FAILED ===")
	quit(0 if ok else 1)
