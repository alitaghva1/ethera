extends SceneTree

# Iter 75 integration test — three visual rebuilds.
#
# Track A: sword as energy weapon (slash_arc with rotating BladeRig)
# Track B: dash strike weightier (CentralFlash + Debris + Streaks)
# Track C: portal consolidation (3 max spawn portals per wave + SpawnPortal viz)
func _initialize() -> void:
	var ok := true

	# ═══ TRACK A — Sword as energy weapon ═══
	var slash_src := FileAccess.get_file_as_string("res://scripts/slash_arc.gd")
	if not (slash_src.contains("BladeRig") or slash_src.contains("blade_rig")):
		push_error("FAIL: slash_arc.gd missing BladeRig (swept blade element)")
		ok = false
	else:
		print("OK slash_arc.gd has BladeRig (swept blade)")

	# iter-73 nodes preserved
	if not (slash_src.contains("HiltFlash") or slash_src.contains("hilt_flash") or slash_src.contains("_hilt_flash")):
		push_error("FAIL: slash_arc.gd lost iter-73 HiltFlash reference")
		ok = false
	elif not (slash_src.contains("GhostArc") or slash_src.contains("ghost_arc") or slash_src.contains("_ghost")):
		push_error("FAIL: slash_arc.gd lost iter-73 GhostArc reference")
		ok = false
	else:
		print("OK slash_arc.gd preserves iter-73 HiltFlash + GhostArc")

	var slash_scene_src := FileAccess.get_file_as_string("res://scenes/fx/slash_arc.tscn")
	if not slash_scene_src.contains("BladeRig"):
		push_error("FAIL: slash_arc.tscn missing BladeRig node")
		ok = false
	elif not slash_scene_src.contains("Blade"):
		push_error("FAIL: slash_arc.tscn missing Blade node")
		ok = false
	else:
		print("OK slash_arc.tscn has BladeRig + Blade structure")

	# ═══ TRACK B — Dash strike weightier ═══
	var di_src := FileAccess.get_file_as_string("res://scripts/dash_impact.gd")
	if not (di_src.contains("CentralFlash") or di_src.contains("central_flash") or di_src.contains("_central_flash")):
		push_error("FAIL: dash_impact.gd missing CentralFlash (BAM frame)")
		ok = false
	else:
		print("OK dash_impact.gd has CentralFlash")

	# Streaks (motion lines)
	if not (di_src.contains("Streak") or di_src.contains("streak")):
		push_error("FAIL: dash_impact.gd missing streaks (motion lines)")
		ok = false
	else:
		print("OK dash_impact.gd has streaks")

	# set_dash_dir backward-compatible setter
	if not (di_src.contains("set_dash_dir") or di_src.contains("dash_dir")):
		push_error("FAIL: dash_impact.gd missing set_dash_dir setter")
		ok = false
	else:
		print("OK dash_impact.gd has set_dash_dir setter")

	# iter-73 cracks preserved
	if not (di_src.contains("crack") or di_src.contains("Crack")):
		push_error("FAIL: dash_impact.gd lost iter-73 ground cracks")
		ok = false
	else:
		print("OK dash_impact.gd preserves iter-73 ground cracks")

	var di_scene_src := FileAccess.get_file_as_string("res://scenes/fx/dash_impact.tscn")
	if not di_scene_src.contains("Debris"):
		push_error("FAIL: dash_impact.tscn missing Debris CPUParticles2D")
		ok = false
	else:
		print("OK dash_impact.tscn has Debris particles")

	# ═══ TRACK C — Portal consolidation ═══
	var portal := load("res://scenes/fx/spawn_portal.tscn")
	if portal == null:
		push_error("FAIL: spawn_portal.tscn failed to load")
		ok = false
	else:
		print("OK spawn_portal.tscn loads")

	var portal_src := FileAccess.get_file_as_string("res://scripts/spawn_portal.gd")
	if not portal_src.contains("static func spawn"):
		push_error("FAIL: spawn_portal.gd missing static spawn()")
		ok = false
	else:
		print("OK spawn_portal.gd has static spawn()")

	if not (portal_src.contains("emit_enemy") or portal_src.contains("flash_emit")):
		push_error("FAIL: spawn_portal.gd missing emit_enemy() flash")
		ok = false
	else:
		print("OK spawn_portal.gd has emit_enemy flash")

	if not portal_src.contains("close"):
		push_error("FAIL: spawn_portal.gd missing close() lifecycle")
		ok = false
	else:
		print("OK spawn_portal.gd has close() lifecycle")

	# main.gd portal-pool integration
	var main_src := FileAccess.get_file_as_string("res://scripts/main.gd")
	if not (main_src.contains("_active_wave_portals") or main_src.contains("_open_wave_portals")):
		push_error("FAIL: main.gd missing wave-portal pool state/function")
		ok = false
	else:
		print("OK main.gd has wave-portal pool")

	if not main_src.contains("MAX_WAVE_PORTALS"):
		push_error("FAIL: main.gd missing MAX_WAVE_PORTALS const (cap)")
		ok = false
	else:
		print("OK main.gd has MAX_WAVE_PORTALS cap")

	if not main_src.contains("SPAWN_PORTAL_SCENE"):
		push_error("FAIL: main.gd missing SPAWN_PORTAL_SCENE preload")
		ok = false
	else:
		print("OK main.gd preloads SPAWN_PORTAL_SCENE")

	if ok:
		print("=== ITER 75 INTEGRATION PASSED ===")
	else:
		print("=== ITER 75 INTEGRATION FAILED ===")
	quit(0 if ok else 1)
