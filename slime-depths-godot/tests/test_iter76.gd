extends SceneTree

# Iter 76 — placement/visual fix on iter-75's portal.
# Note: iter-77 design pass superseded iter-76's specific layer names
# (aura/outer_ring/inner_ring/tendril_group/vortex_rim/vortex_void/
# center_point) with a smaller, more restrained dungeon-floor mark
# (crack_lines / inner_glow / rune_fragments / embers). This test
# preserves the iter-76 *intent* — verify the hazard-aware placement
# constants still exist, even though their implementation moved into
# the iter-77 _is_portal_position_valid validator.
func _initialize() -> void:
	var ok := true

	# Portal placement constants (iter-76 introduced PORTAL_MIN_DIST_*;
	# iter-77 promoted them to module-level constants in main.gd).
	var main_src := FileAccess.get_file_as_string("res://scripts/main.gd")

	if not main_src.contains("_gather_hazard_positions"):
		push_error("FAIL: main.gd missing _gather_hazard_positions helper")
		ok = false
	else:
		print("OK main.gd has _gather_hazard_positions helper")

	if not main_src.contains("PORTAL_MIN_DIST_FROM_HAZARD"):
		push_error("FAIL: main.gd missing PORTAL_MIN_DIST_FROM_HAZARD constant")
		ok = false
	else:
		print("OK main.gd has PORTAL_MIN_DIST_FROM_HAZARD constant")

	if not main_src.contains("PORTAL_MIN_DIST_FROM_HERO"):
		push_error("FAIL: main.gd missing PORTAL_MIN_DIST_FROM_HERO constant")
		ok = false
	else:
		print("OK main.gd has PORTAL_MIN_DIST_FROM_HERO constant")

	# Hazard filtering must be applied in the portal-opening pipeline.
	# iter-76 had this inline in _open_wave_portals; iter-77 extracted
	# it into _is_portal_position_valid which is CALLED from
	# _open_wave_portals.
	if not main_src.contains("_is_portal_position_valid"):
		push_error("FAIL: main.gd missing _is_portal_position_valid validator")
		ok = false
	else:
		print("OK main.gd has _is_portal_position_valid validator")

	# Confirm _open_wave_portals calls the validator (the hazard filter
	# is now inside the validator, so the validator must be called).
	var idx: int = main_src.find("_open_wave_portals")
	if idx < 0:
		push_error("FAIL: _open_wave_portals not found in main.gd")
		ok = false
	else:
		var body: String = main_src.substr(idx, 4000)
		if not body.contains("_is_portal_position_valid"):
			push_error("FAIL: _open_wave_portals doesn't call _is_portal_position_valid")
			ok = false
		else:
			print("OK _open_wave_portals calls _is_portal_position_valid")

	if ok:
		print("=== ITER 76 INTEGRATION PASSED ===")
	else:
		print("=== ITER 76 INTEGRATION FAILED ===")
	quit(0 if ok else 1)
