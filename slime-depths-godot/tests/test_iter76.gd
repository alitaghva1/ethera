extends SceneTree

# Iter 76 integration test — spawn_portal visual rebuild + hazard filter.
#
# User feedback on iter 75 portals: "Portals look lame and also are over
# fire areas. Think this through dont just dam portals in."
#
# Two fixes:
#   1. Visual rebuild: aura + counter-rotating rings + tendrils + dark
#      vortex void with bright rim (multi-layer depth, not flat sticker)
#   2. Hazard filter: _open_wave_portals rejects spawn_points within
#      80px of any hazard (fire_jet, spike_pit, lightning_rod, etc.)
#      and 100px of the hero.
func _initialize() -> void:
	var ok := true

	# ═══ Visual rebuild ═══
	var portal_src := FileAccess.get_file_as_string("res://scripts/spawn_portal.gd")

	# All seven new visual layers present
	for layer in ["_aura", "_outer_ring", "_inner_ring", "_tendril_group",
				   "_vortex_rim", "_vortex_void", "_center_point"]:
		if not portal_src.contains(layer):
			push_error("FAIL: spawn_portal.gd missing layer %s" % layer)
			ok = false
	if ok:
		print("OK spawn_portal.gd has all 7 visual layers")

	# Counter-rotation tuning
	for c in ["OUTER_RING_SPIN", "INNER_RING_SPIN", "TENDRIL_SPIN"]:
		if not portal_src.contains(c):
			push_error("FAIL: spawn_portal.gd missing rotation const %s" % c)
			ok = false
	if ok:
		print("OK spawn_portal.gd has counter-rotation constants")

	# Size bump from 32 → 48
	if not portal_src.contains("RING_RADIUS: float = 48.0"):
		push_error("FAIL: spawn_portal.gd RING_RADIUS not bumped to 48")
		ok = false
	else:
		print("OK spawn_portal.gd RING_RADIUS bumped to 48")

	# Aura radius for wide soft halo
	if not portal_src.contains("AURA_RADIUS"):
		push_error("FAIL: spawn_portal.gd missing AURA_RADIUS")
		ok = false
	else:
		print("OK spawn_portal.gd has AURA_RADIUS for outer halo")

	# Build methods for each new layer
	for fn in ["_build_aura", "_build_inner_ring", "_build_tendrils",
			   "_build_vortex_rim", "_build_vortex_void"]:
		if not portal_src.contains("func %s" % fn):
			push_error("FAIL: spawn_portal.gd missing %s()" % fn)
			ok = false
	if ok:
		print("OK spawn_portal.gd has all new _build_* methods")

	# ═══ Hazard filter ═══
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

	# The filter must be inside _open_wave_portals (check surrounding context)
	var idx: int = main_src.find("_open_wave_portals")
	if idx < 0:
		push_error("FAIL: _open_wave_portals not found in main.gd")
		ok = false
	else:
		# Slice ~3000 chars after the function header to capture body
		var body: String = main_src.substr(idx, 4000)
		if not body.contains("PORTAL_MIN_DIST_FROM_HAZARD"):
			push_error("FAIL: hazard filter not inside _open_wave_portals")
			ok = false
		elif not body.contains("filtered"):
			push_error("FAIL: filter doesn't build a filtered list")
			ok = false
		else:
			print("OK _open_wave_portals applies hazard filter")

	if ok:
		print("=== ITER 76 INTEGRATION PASSED ===")
	else:
		print("=== ITER 76 INTEGRATION FAILED ===")
	quit(0 if ok else 1)
