extends SceneTree

# Iter 82 — biome-specific ambient particle systems.
#
# The iter-51 ambient mote system was one generic emitter with only
# tint varying per biome. All 4 biomes shared the same motion / density
# / scale, so the player couldn't read crypt vs ember from the AIR
# alone. This iter gives each biome its own motion grammar:
#   CRYPT      pale dust falling downward (gravity-pulled)
#   OSSUARY    bone-pale motes swirling lazily (angular + tangential)
#   EMBER      orange sparks rising (negative gravity) + secondary
#              big-ember accent emitter
#   SANCTUARY  cool-blue runes drifting up + outward + slow rotation,
#              plus secondary glyph-fleck accent
func _initialize() -> void:
	var ok := true

	var main_src := FileAccess.get_file_as_string("res://scripts/main.gd")

	# Two new builder methods that the rewrite introduces.
	if not main_src.contains("func _build_ambient_mote_primary"):
		push_error("FAIL: main.gd missing _build_ambient_mote_primary builder")
		ok = false
	else:
		print("OK _build_ambient_mote_primary exists")

	if not main_src.contains("func _build_ambient_mote_accent"):
		push_error("FAIL: main.gd missing _build_ambient_mote_accent builder")
		ok = false
	else:
		print("OK _build_ambient_mote_accent exists")

	# Find the primary builder and confirm all 4 biomes have explicit
	# match branches — not just generic tint differences.
	var idx: int = main_src.find("func _build_ambient_mote_primary")
	if idx < 0:
		push_error("FAIL: primary builder not found")
		ok = false
	else:
		var body: String = main_src.substr(idx, 4000)
		for biome in ["crypt", "ossuary", "ember", "sanctuary"]:
			if not body.contains("\"%s\":" % biome):
				push_error("FAIL: primary builder missing match branch for %s" % biome)
				ok = false
		if ok:
			print("OK primary builder has explicit branches for all 4 biomes")

		# Each biome should set DIFFERENT motion parameters. Spot-check
		# a few of the iter-82 distinguishing signals:
		#   - crypt direction (0,1) = DOWN (was always up)
		#   - ember gravity (0, -12) = negative = rising acceleration
		#   - ossuary angular_velocity_max = 40 = lazy swirls
		#   - sanctuary tangential_accel = outward drift
		if not body.contains("Vector2(0, 1)"):
			push_error("FAIL: crypt biome should drift downward (Vector2(0, 1))")
			ok = false
		else:
			print("OK crypt mote direction is downward")

		if not body.contains("Vector2(0, -12"):
			push_error("FAIL: ember biome should have rising gravity (Vector2(0, -12)+)")
			ok = false
		else:
			print("OK ember mote gravity is negative (rising)")

		if not body.contains("angular_velocity_max = 40"):
			push_error("FAIL: ossuary biome should have angular_velocity 40 (lazy swirls)")
			ok = false
		else:
			print("OK ossuary has lazy-swirl angular velocity")

		if not body.contains("tangential_accel"):
			push_error("FAIL: ossuary/sanctuary should use tangential_accel for orbiting/outward drift")
			ok = false
		else:
			print("OK swirling biomes use tangential_accel")

	# Accent builder returns null for crypt/ossuary, configured emitter
	# for ember/sanctuary.
	var idx2: int = main_src.find("func _build_ambient_mote_accent")
	if idx2 < 0:
		push_error("FAIL: accent builder not found")
		ok = false
	else:
		var body2: String = main_src.substr(idx2, 3000)
		# ember accent — should exist with big-ember tuning
		if not body2.contains("\"ember\":"):
			push_error("FAIL: accent builder missing ember case")
			ok = false
		# sanctuary accent — drifting runes
		elif not body2.contains("\"sanctuary\":"):
			push_error("FAIL: accent builder missing sanctuary case")
			ok = false
		# default returns null for non-decorated biomes
		elif not body2.contains("return null"):
			push_error("FAIL: accent builder should return null for non-accented biomes")
			ok = false
		else:
			print("OK accent builder: ember + sanctuary cases, null for crypt/ossuary")

	# Old iter-51 monolithic function shouldn't have the same shape
	# anymore — it should now be a dispatcher calling the two builders.
	var idx3: int = main_src.find("func _spawn_ambient_motes")
	if idx3 >= 0:
		var body3: String = main_src.substr(idx3, 500)
		if not body3.contains("_build_ambient_mote_primary"):
			push_error("FAIL: _spawn_ambient_motes doesn't dispatch to _build_ambient_mote_primary")
			ok = false
		else:
			print("OK _spawn_ambient_motes dispatches to the new builders")

	if ok:
		print("=== ITER 82 INTEGRATION PASSED ===")
	else:
		print("=== ITER 82 INTEGRATION FAILED ===")
	quit(0 if ok else 1)
