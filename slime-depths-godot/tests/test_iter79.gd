extends SceneTree

# Iter 79 — Workstream C of the post-iter-78 plan: delete the spawn portal
# system. Iters 75-78 invented a "summoning portal" visual on top of the
# iter-15 enemy spawn-in fade; four passes of patching never got it right.
# The JS reference doesn't have a portal system at all — enemies just
# appear. This test verifies the deletion + the iter-15 spawn-in retune.
func _initialize() -> void:
	var ok := true

	# ═══ Portal system DELETED ═══

	# spawn_portal scene + script are gone.
	var portal_scene = load("res://scenes/fx/spawn_portal.tscn")
	if portal_scene != null:
		push_error("FAIL: spawn_portal.tscn still loads — should be deleted")
		ok = false
	else:
		print("OK spawn_portal.tscn no longer exists")

	var main_src := FileAccess.get_file_as_string("res://scripts/main.gd")

	# Portal preload + cap consts gone.
	if main_src.contains("SPAWN_PORTAL_SCENE: PackedScene = preload"):
		push_error("FAIL: main.gd still preloads SPAWN_PORTAL_SCENE")
		ok = false
	else:
		print("OK main.gd has no SPAWN_PORTAL_SCENE preload")

	if main_src.contains("MAX_WAVE_PORTALS:"):
		push_error("FAIL: main.gd still defines MAX_WAVE_PORTALS")
		ok = false
	else:
		print("OK main.gd has no MAX_WAVE_PORTALS")

	# All 11 PORTAL_MIN_DIST_FROM_* constants gone.
	for c in [
		"PORTAL_MIN_DIST_FROM_HERO",
		"PORTAL_MIN_DIST_FROM_HAZARD",
		"PORTAL_MIN_DIST_FROM_TORCH",
		"PORTAL_MIN_DIST_FROM_PILLAR",
		"PORTAL_MIN_DIST_FROM_CHEST",
		"PORTAL_MIN_DIST_FROM_DOOR",
		"PORTAL_MIN_DIST_FROM_LORESTONE",
		"PORTAL_MIN_DIST_FROM_SHRINE",
		"PORTAL_MIN_DIST_FROM_WALL_RECT",
		"PORTAL_MIN_DIST_FROM_OTHER_PORTAL",
		"PORTAL_MIN_DIST_FROM_ROOM_CENTER",
	]:
		if main_src.contains(c + ":"):
			push_error("FAIL: main.gd still defines %s constant" % c)
			ok = false
	if ok:
		print("OK all 11 PORTAL_MIN_DIST_FROM_* constants removed")

	# Functions gone.
	for fn in [
		"func _open_wave_portals",
		"func _spawn_wave_enemy",
		"func _close_active_wave_portals",
		"func _is_portal_position_valid",
	]:
		if main_src.contains(fn):
			push_error("FAIL: main.gd still defines %s" % fn)
			ok = false
	if ok:
		print("OK all 4 portal functions removed")

	# State vars gone.
	for v in ["_active_wave_portals:", "_active_wave_portal_nodes:", "_wave_spawn_override_pos:"]:
		if main_src.contains("var " + v):
			push_error("FAIL: main.gd still declares %s state var" % v)
			ok = false
	if ok:
		print("OK all 3 portal state vars removed")

	# _gather_hazard_positions KEPT (it's a useful helper).
	if not main_src.contains("func _gather_hazard_positions"):
		push_error("FAIL: _gather_hazard_positions was removed but it's a useful helper to keep")
		ok = false
	else:
		print("OK _gather_hazard_positions retained as a useful helper")

	# _spawn_enemy_type reverted to direct random spawn_point pick.
	var idx: int = main_src.find("func _spawn_enemy_type")
	if idx < 0:
		push_error("FAIL: _spawn_enemy_type not found")
		ok = false
	else:
		var body: String = main_src.substr(idx, 1500)
		if body.contains("_wave_spawn_override_pos"):
			push_error("FAIL: _spawn_enemy_type still references _wave_spawn_override_pos")
			ok = false
		elif not body.contains("enemy.global_position = _spawn_points[randi()"):
			push_error("FAIL: _spawn_enemy_type doesn't pick random spawn_point directly")
			ok = false
		else:
			print("OK _spawn_enemy_type uses random spawn_point pick directly")

	# ═══ enemy.gd SPAWN_IN retune ═══

	var enemy_src := FileAccess.get_file_as_string("res://scripts/enemy.gd")

	# Duration shortened to 0.35.
	if not enemy_src.contains("SPAWN_IN_DURATION := 0.35"):
		push_error("FAIL: SPAWN_IN_DURATION should be 0.35 (was 0.5)")
		ok = false
	else:
		print("OK SPAWN_IN_DURATION shortened to 0.35s")

	# Start color desaturated.
	if enemy_src.contains("SPAWN_IN_START_COLOR := Color(1.8, 0.3, 0.3, 0.3)"):
		push_error("FAIL: SPAWN_IN_START_COLOR still has aggressive iter-15 bright-red value")
		ok = false
	elif not enemy_src.contains("SPAWN_IN_START_COLOR := Color(1.25, 0.45, 0.55, 0.40)"):
		push_error("FAIL: SPAWN_IN_START_COLOR not at the new muted value (1.25, 0.45, 0.55, 0.40)")
		ok = false
	else:
		print("OK SPAWN_IN_START_COLOR retuned to muted pink-red")

	if ok:
		print("=== ITER 79 INTEGRATION PASSED ===")
	else:
		print("=== ITER 79 INTEGRATION FAILED ===")
	quit(0 if ok else 1)
