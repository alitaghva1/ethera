extends SceneTree

# Iter 68 integration test — verify both parallel tracks landed.
func _initialize() -> void:
	var ok := true

	# Track A: shock_pulse scene + script
	var sp := load("res://scenes/fx/shock_pulse.tscn")
	if sp == null:
		push_error("FAIL: shock_pulse.tscn failed to load")
		ok = false
	else:
		print("OK shock_pulse.tscn loads")

	# Track A: hero.gd spawns the STORM shock pulse. iter-95 reanchored
	# the trigger from dodge to dash_strike (dodge ability deleted) and
	# renamed the fn: _spawn_storm_shock_pulse → _spawn_storm_dash_shock_pulse.
	# Same scene + same tier scaling; only the spawn site moved.
	var hero_src := FileAccess.get_file_as_string("res://scripts/hero.gd")
	if not hero_src.contains("_spawn_storm_dash_shock_pulse"):
		push_error("FAIL: hero.gd missing _spawn_storm_dash_shock_pulse (renamed in iter-95)")
		ok = false
	elif not hero_src.contains("SHOCK_PULSE_SCENE"):
		push_error("FAIL: hero.gd missing SHOCK_PULSE_SCENE preload")
		ok = false
	else:
		print("OK hero.gd has _spawn_storm_dash_shock_pulse + SHOCK_PULSE_SCENE")

	# Track B: rogue_wraith.tres exists with wraith behavior
	var wraith_res: Resource = load("res://scenes/enemies/rogue_wraith.tres")
	if wraith_res == null:
		push_error("FAIL: rogue_wraith.tres failed to load")
		ok = false
	else:
		var beh: String = wraith_res.get("behavior")
		if beh != "wraith":
			push_error("FAIL: rogue_wraith behavior is %s" % beh)
			ok = false
		else:
			print("OK rogue_wraith behavior=%s hp=%d speed=%s" % [beh, int(wraith_res.get("max_hp")), wraith_res.get("move_speed")])

	# Track B: enemy.gd has wraith state machine
	var enemy_src := FileAccess.get_file_as_string("res://scripts/enemy.gd")
	if not enemy_src.contains("WraithState"):
		push_error("FAIL: enemy.gd missing WraithState enum")
		ok = false
	elif not enemy_src.contains("_tick_wraith"):
		push_error("FAIL: enemy.gd missing _tick_wraith")
		ok = false
	else:
		print("OK enemy.gd has WraithState + _tick_wraith")

	# Track B: main.gd registers rogue_wraith
	var main_src := FileAccess.get_file_as_string("res://scripts/main.gd")
	if not main_src.contains("rogue_wraith"):
		push_error("FAIL: main.gd doesn't register rogue_wraith")
		ok = false
	else:
		print("OK main.gd registers rogue_wraith")

	# Composition: room_06 still has bone_summoner from iter 67 AND new rogue_wraith
	var room06: Resource = load("res://scenes/rooms/room_06.tres")
	if room06 == null:
		push_error("FAIL: room_06.tres failed to load")
		ok = false
	else:
		var has_summoner := false
		var has_wraith := false
		var waves: Array = room06.get("waves")
		for wave in waves:
			for entry in wave:
				if typeof(entry) == TYPE_ARRAY and entry.size() >= 1:
					if str(entry[0]) == "bone_summoner": has_summoner = true
					if str(entry[0]) == "rogue_wraith": has_wraith = true
		if not has_summoner:
			push_error("FAIL: room_06 lost bone_summoner from iter 67")
			ok = false
		elif not has_wraith:
			push_error("FAIL: room_06 doesn't include rogue_wraith")
			ok = false
		else:
			print("OK room_06 has both bone_summoner (iter 67) and rogue_wraith (iter 68)")

	# Track B: wraith_phase_in fx exists
	var pi := load("res://scenes/fx/wraith_phase_in.tscn")
	if pi == null:
		push_error("FAIL: wraith_phase_in.tscn failed to load")
		ok = false
	else:
		print("OK wraith_phase_in.tscn loads")

	if ok:
		print("=== ITER 68 INTEGRATION PASSED ===")
	else:
		print("=== ITER 68 INTEGRATION FAILED ===")
	quit(0 if ok else 1)
