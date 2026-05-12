extends SceneTree

# Iter 77 integration test — design pass on enemy spawn portals.
#
# User feedback was extensive: portals were too large, too bright, looked
# like UI decals, spawned on top of fire/torches/walls. Treat as a
# proper design pass — comprehensive placement validator + restrained
# floor-mark visual.
func _initialize() -> void:
	var ok := true

	# ═══ Visual redesign ═══
	var portal_src := FileAccess.get_file_as_string("res://scripts/spawn_portal.gd")

	# New restrained architecture: cracks + inner glow + rune fragments + embers.
	# NOT the iter-76 neon-ring system.
	for layer in ["_crack_lines", "_inner_glow", "_rune_fragments", "_rune_group", "_embers"]:
		if not portal_src.contains(layer):
			push_error("FAIL: spawn_portal.gd missing %s (iter-77 visual layer)" % layer)
			ok = false
	if ok:
		print("OK spawn_portal.gd has all iter-77 visual layers")

	# Smaller, more restrained footprint — total ~32 px vs iter-76's 80+.
	if not portal_src.contains("CRACK_RADIUS: float = 22.0"):
		push_error("FAIL: CRACK_RADIUS should be 22 (restrained footprint)")
		ok = false
	elif not portal_src.contains("RUNE_FRAGMENT_RADIUS: float = 28.0"):
		push_error("FAIL: RUNE_FRAGMENT_RADIUS should be 28 (outer extent)")
		ok = false
	else:
		print("OK portal footprint is restrained (crack 22 + rune 28)")

	# Subtle peak alpha — design brief said "subtle inner glow", "gentle pulsing alpha".
	if not portal_src.contains("INNER_GLOW_PEAK_ALPHA: float = 0.30"):
		push_error("FAIL: INNER_GLOW_PEAK_ALPHA should be ≤0.30 (subtle, not neon)")
		ok = false
	else:
		print("OK inner glow alpha is restrained (0.30)")

	# 3 explicit phase states (TELEGRAPH → ACTIVE → COLLAPSE) per design brief.
	for fn in ["_tick_telegraph", "_tick_active", "_tick_collapse"]:
		if not portal_src.contains("func %s" % fn):
			push_error("FAIL: spawn_portal.gd missing phase tick %s" % fn)
			ok = false
	if ok:
		print("OK spawn_portal.gd has all 3 phase ticks")

	# Phase enum lists TELEGRAPH/ACTIVE/COLLAPSE (the named states).
	if not (portal_src.contains("TELEGRAPH") and portal_src.contains("COLLAPSE")):
		push_error("FAIL: Phase enum missing TELEGRAPH/COLLAPSE")
		ok = false
	else:
		print("OK Phase enum has TELEGRAPH + ACTIVE + COLLAPSE")

	# emit_enemy pulses (SPAWN_PULSE phase rides on top of ACTIVE).
	if not (portal_src.contains("SPAWN_PULSE_DURATION") and portal_src.contains("_pulse_remaining")):
		push_error("FAIL: spawn_portal.gd missing SPAWN_PULSE logic")
		ok = false
	else:
		print("OK spawn_portal.gd has SPAWN_PULSE logic on emit_enemy")

	# Z-index = 1 (floor decor layer) NOT z=3 (above combat).
	# Design brief: "base circle/crack should be part of the floor layer
	# or just above floor decoration."
	if not portal_src.contains("PORTAL_Z_INDEX: int = 1"):
		push_error("FAIL: portal z_index should be 1 (floor decor), iter-76 had 3")
		ok = false
	else:
		print("OK portal z_index = 1 (floor decor layer)")

	# ═══ Comprehensive placement validator ═══
	var main_src := FileAccess.get_file_as_string("res://scripts/main.gd")

	if not main_src.contains("_is_portal_position_valid"):
		push_error("FAIL: main.gd missing _is_portal_position_valid")
		ok = false
	else:
		print("OK main.gd has _is_portal_position_valid")

	# Every feature-type constraint must have a min-dist constant.
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
		if not main_src.contains(c):
			push_error("FAIL: main.gd missing constraint %s" % c)
			ok = false
	if ok:
		print("OK main.gd has all 11 portal placement constants")

	# Fallback sampling — design brief required "fallback logic if there
	# are not enough valid positions."
	if not main_src.contains("PORTAL_FALLBACK_ATTEMPTS"):
		push_error("FAIL: main.gd missing PORTAL_FALLBACK_ATTEMPTS (fallback sampling)")
		ok = false
	else:
		print("OK main.gd has fallback random-sample logic")

	# Anti-clustering — already_chosen parameter to the validator.
	# Look for the function DEFINITION (not its call sites).
	var idx: int = main_src.find("func _is_portal_position_valid")
	if idx >= 0:
		var body: String = main_src.substr(idx, 4000)
		if not body.contains("already_chosen"):
			push_error("FAIL: validator doesn't enforce anti-clustering")
			ok = false
		elif not body.contains("PORTAL_MIN_DIST_FROM_OTHER_PORTAL"):
			push_error("FAIL: validator doesn't apply OTHER_PORTAL min-dist")
			ok = false
		else:
			print("OK validator enforces anti-clustering against already_chosen")

	if ok:
		print("=== ITER 77 INTEGRATION PASSED ===")
	else:
		print("=== ITER 77 INTEGRATION FAILED ===")
	quit(0 if ok else 1)
