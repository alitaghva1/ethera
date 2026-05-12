extends SceneTree

# Iter 73 integration test — hazard readability + character action FX phasing.
#
# Track A: hazard readability pass — every hazard gets 3 distinct visible
#          states (IDLE / TELEGRAPH / ACTIVE) and a persistent ground footprint
#          so danger zones are readable at a distance.
# Track B: character action FX phasing — bring sword/dodge/parry/dash-strike
#          up to the shoot's multi-phase quality (anticipation + peak + decay).
func _initialize() -> void:
	var ok := true

	# ═══ TRACK A — HAZARD READABILITY ═══

	# fire_jet got GroundFootprint + PreFireSpark + back-half telegraph
	var fj_src := FileAccess.get_file_as_string("res://scripts/fire_jet.gd")
	if not fj_src.contains("_ground_footprint"):
		push_error("FAIL: fire_jet.gd missing ground footprint")
		ok = false
	elif not fj_src.contains("_pre_fire_spark"):
		push_error("FAIL: fire_jet.gd missing pre-fire spark")
		ok = false
	else:
		print("OK fire_jet has ground footprint + pre-fire spark")

	# lightning_rod got ground footprint + tip sparks
	var lr_src := FileAccess.get_file_as_string("res://scripts/lightning_rod.gd")
	if not lr_src.contains("_ground_footprint"):
		push_error("FAIL: lightning_rod.gd missing ground footprint")
		ok = false
	elif not (lr_src.contains("_tip_spark_a") and lr_src.contains("_tip_spark_b")):
		push_error("FAIL: lightning_rod.gd missing tip sparks")
		ok = false
	else:
		print("OK lightning_rod has ground footprint + tip sparks")

	# spike_pit got DangerHalo
	var sp_scene := load("res://scenes/hazards/spike_pit.tscn")
	var sp_src := FileAccess.get_file_as_string("res://scripts/spike_pit.gd")
	if sp_scene == null:
		push_error("FAIL: spike_pit.tscn failed to load")
		ok = false
	elif not (sp_src.contains("DangerHalo") or sp_src.contains("danger_halo") or sp_src.contains("_danger_halo")):
		push_error("FAIL: spike_pit.gd missing danger halo reference")
		ok = false
	else:
		print("OK spike_pit has danger halo")

	# slow_zone got FootprintHalo + Swirl
	var sz_src := FileAccess.get_file_as_string("res://scripts/slow_zone.gd")
	if not (sz_src.contains("FootprintHalo") or sz_src.contains("footprint_halo") or sz_src.contains("_footprint_halo")):
		push_error("FAIL: slow_zone.gd missing footprint halo")
		ok = false
	elif not (sz_src.contains("Swirl") or sz_src.contains("_swirl")):
		push_error("FAIL: slow_zone.gd missing swirl motion")
		ok = false
	else:
		print("OK slow_zone has footprint halo + swirl")

	# fire_pool got jagged flame silhouette + embers
	var fp_src := FileAccess.get_file_as_string("res://scripts/fire_pool.gd")
	if not (fp_src.contains("ember") or fp_src.contains("Ember")):
		push_error("FAIL: fire_pool.gd missing ember pip references")
		ok = false
	else:
		print("OK fire_pool has ember pips")

	# glyph_trap z-index fixed
	var gt_src := FileAccess.get_file_as_string("res://scripts/glyph_trap.gd")
	if gt_src.contains("z_index = -1"):
		push_error("FAIL: glyph_trap.gd still has z=-1 (should be z=1 per iter-69)")
		ok = false
	else:
		print("OK glyph_trap.gd z-index updated per iter-69 standard")

	# ═══ TRACK B — CHARACTER ACTION FX PHASING ═══

	# slash_arc: HiltFlash anticipation + GhostArc motion blur
	var slash_src := FileAccess.get_file_as_string("res://scripts/slash_arc.gd")
	if not (slash_src.contains("HiltFlash") or slash_src.contains("hilt_flash") or slash_src.contains("_hilt_flash")):
		push_error("FAIL: slash_arc.gd missing HiltFlash anticipation node")
		ok = false
	elif not (slash_src.contains("GhostArc") or slash_src.contains("ghost_arc") or slash_src.contains("_ghost_arc")):
		push_error("FAIL: slash_arc.gd missing GhostArc motion-blur layer")
		ok = false
	else:
		print("OK slash_arc has HiltFlash + GhostArc")

	# parry_pulse: PreFlash anticipation
	var pp_src := FileAccess.get_file_as_string("res://scripts/parry_pulse.gd")
	if not (pp_src.contains("PreFlash") or pp_src.contains("pre_flash") or pp_src.contains("_pre_flash")):
		push_error("FAIL: parry_pulse.gd missing PreFlash anticipation")
		ok = false
	else:
		print("OK parry_pulse has PreFlash anticipation")

	# parry_shield: BeamFan additions
	var ps_scene_src := FileAccess.get_file_as_string("res://scenes/fx/parry_shield.tscn")
	if not ps_scene_src.contains("BeamFan"):
		push_error("FAIL: parry_shield.tscn missing BeamFan beams")
		ok = false
	else:
		print("OK parry_shield has BeamFan reflect beams")

	# dodge_dust beefed up
	var dd_src := FileAccess.get_file_as_string("res://scripts/dodge_dust.gd")
	if not (dd_src.contains("BackStreak") or dd_src.contains("back_streak") or dd_src.contains("_back_streak") or dd_src.contains("GroundStreak") or dd_src.contains("ground_streak")):
		push_error("FAIL: dodge_dust.gd missing BackStreak/GroundStreak")
		ok = false
	else:
		print("OK dodge_dust has BackStreak/GroundStreak additions")

	# dash_impact: radial ground cracks
	var di_src := FileAccess.get_file_as_string("res://scripts/dash_impact.gd")
	if not (di_src.contains("crack") or di_src.contains("Crack")):
		push_error("FAIL: dash_impact.gd missing ground cracks")
		ok = false
	else:
		print("OK dash_impact has ground cracks")

	# ═══ Scene loads still work ═══
	for fx in ["slash_arc", "parry_pulse", "parry_shield", "dodge_dust", "dash_trail"]:
		var scn := load("res://scenes/fx/%s.tscn" % fx)
		if scn == null:
			push_error("FAIL: %s.tscn failed to load" % fx)
			ok = false
		else:
			print("OK %s.tscn loads" % fx)

	for hz in ["fire_jet", "lightning_rod", "slow_zone", "spike_pit"]:
		var scn := load("res://scenes/hazards/%s.tscn" % hz)
		if scn == null:
			push_error("FAIL: %s.tscn failed to load" % hz)
			ok = false
		else:
			print("OK %s.tscn loads" % hz)

	if ok:
		print("=== ITER 73 INTEGRATION PASSED ===")
	else:
		print("=== ITER 73 INTEGRATION FAILED ===")
	quit(0 if ok else 1)
