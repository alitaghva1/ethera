extends SceneTree

# Iter 66 integration test — verify both parallel tracks landed.
func _initialize() -> void:
	var ok := true

	# Track B: bone_summoner.tres exists with summoner behavior
	var summoner_res: Resource = load("res://scenes/enemies/bone_summoner.tres")
	if summoner_res == null:
		push_error("FAIL: bone_summoner.tres failed to load")
		ok = false
	else:
		var beh: String = summoner_res.get("behavior")
		var hp: int = summoner_res.get("max_hp")
		var spd: float = summoner_res.get("move_speed")
		if beh != "summoner":
			push_error("FAIL: bone_summoner behavior is %s, expected summoner" % beh)
			ok = false
		else:
			print("OK bone_summoner behavior=%s hp=%d speed=%s" % [beh, hp, spd])

	# Track B: enemy.gd has summoner state machine
	var enemy_src := FileAccess.get_file_as_string("res://scripts/enemy.gd")
	if not enemy_src.contains("SummonerState"):
		push_error("FAIL: enemy.gd missing SummonerState enum")
		ok = false
	elif not enemy_src.contains("_tick_summoner"):
		push_error("FAIL: enemy.gd missing _tick_summoner")
		ok = false
	else:
		print("OK enemy.gd has SummonerState + _tick_summoner")

	# Track A: hero.gd has BLOOD lifesteal hook
	var hero_src := FileAccess.get_file_as_string("res://scripts/hero.gd")
	if not hero_src.contains("_try_blood_lifesteal"):
		push_error("FAIL: hero.gd missing _try_blood_lifesteal")
		ok = false
	elif not hero_src.contains("theme_tier(\"blood\")") and not hero_src.contains("theme_tier('blood')"):
		push_error("FAIL: hero.gd doesn't read blood theme tier")
		ok = false
	else:
		print("OK hero.gd has _try_blood_lifesteal + reads blood theme_tier")

	# Track B: main.gd registers bone_summoner
	var main_src := FileAccess.get_file_as_string("res://scripts/main.gd")
	if not main_src.contains("bone_summoner"):
		push_error("FAIL: main.gd doesn't register bone_summoner")
		ok = false
	else:
		print("OK main.gd registers bone_summoner")

	if ok:
		print("=== ITER 66 INTEGRATION PASSED ===")
	else:
		print("=== ITER 66 INTEGRATION FAILED ===")
	quit(0 if ok else 1)
