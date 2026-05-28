extends SceneTree

# Iter 118 — Portal redesign (part 4 of the visual presentation pass).
#
# Pre-iter-118 the door was a rectangular stone arch (120×180) with TWO
# counter-rotating Line2D rings + bright core + magenta-cyan PointLight2D
# at energy 1.8 + 20 large motes at 50-90 px/s velocity. Playtester read:
# "visually chaotic — competes with combat; doesn't feel like a
# destination so much as a particle accident." And placement was naive:
# decor scatter didn't know about door positions, so debris could spawn
# inside the portal silhouette.
#
# Iter-118 cleans up the visuals + adds placement rules:
#
#   CIRCULAR SILHOUETTE
#     Rectangular StoneFrame replaced with a closed Line2D ring at
#     radius 56, plus a thinner highlight ring at radius 52. PortalBack
#     polygon shrunk to radius 46. Single Vortex Line2D at radius 38
#     (no more counter-rotating pair). All driven from door.gd's
#     single `vortex` @onready ref.
#
#   FLOOR RUNE
#     New Sprite2D under everything at z=-3, painted with a warm-gold
#     radial gradient sub_resource. door.gd pulses its alpha in lockstep
#     with the core (RUNE_BASE_ALPHA ± RUNE_PULSE_DEPTH). Sells "this
#     is a destination grounded on a rune circle" without the visual
#     noise of pre-iter-118.
#
#   CONTROLLED MOTES
#     amount 20 → 10, velocity 50-90 → 30-55, scale 1.8-3.0 → 1.2-2.0.
#     PortalGlow energy 1.8 → 1.1, texture_scale 2.0 → 1.4. Total
#     visual budget cut roughly in half.
#
#   PLACEMENT RULES (main.gd)
#     DOOR_CLEARANCE_RADIUS = 90 px. _door_positions_for_room returns
#     every position a door MIGHT spawn (deterministic per room.tres).
#     _validate_door_placement pushes a warning if any torch / pillar /
#     chest / hazard / spawn_point lands within clearance — non-fatal,
#     surfaces misconfigured rooms at runtime. _scatter_decor uses the
#     same positions to gap rubble + piles from the portal silhouette.
func _initialize() -> void:
	var ok := true

	# ═══ door.tscn redesign ═══
	var door_src := FileAccess.get_file_as_string("res://scenes/door.tscn")
	if "name=\"FloorRune\"" not in door_src:
		push_error("FAIL: door.tscn missing FloorRune sprite")
		ok = false
	if "name=\"StoneRing\"" not in door_src:
		push_error("FAIL: door.tscn missing StoneRing Line2D (replacing rectangular StoneFrame)")
		ok = false
	if "name=\"Vortex\"" not in door_src:
		push_error("FAIL: door.tscn missing single Vortex Line2D (replaces VortexOuter+VortexInner pair)")
		ok = false
	# Iter-27 leftovers should be GONE
	if "name=\"VortexOuter\"" in door_src:
		push_error("FAIL: door.tscn still has VortexOuter from iter-27 (counter-rotating pair removed)")
		ok = false
	if "name=\"VortexInner\"" in door_src:
		push_error("FAIL: door.tscn still has VortexInner from iter-27")
		ok = false
	if "name=\"StoneFrame\"" in door_src:
		push_error("FAIL: door.tscn still has StoneFrame from iter-27 (rectangular arch replaced)")
		ok = false
	# Tamer PointLight2D
	if "energy = 1.1" not in door_src:
		push_error("FAIL: PortalGlow energy should be 1.1 (was 1.8)")
		ok = false
	if "texture_scale = 1.4" not in door_src:
		push_error("FAIL: PortalGlow texture_scale should be 1.4 (was 2.0)")
		ok = false
	# Reduced mote count
	if "amount = 10" not in door_src:
		push_error("FAIL: Motes amount should be 10 (was 20)")
		ok = false
	if ok:
		print("OK door.tscn: circular silhouette + floor rune + single vortex + tamer glow + 10 motes")

	# ═══ door.gd redesign ═══
	var door_gd := FileAccess.get_file_as_string("res://scripts/door.gd")
	if "@onready var vortex: Line2D" not in door_gd:
		push_error("FAIL: door.gd missing single vortex @onready ref")
		ok = false
	if "vortex_outer" in door_gd or "vortex_inner" in door_gd:
		push_error("FAIL: door.gd still references vortex_outer / vortex_inner (iter-27 pair)")
		ok = false
	if "VORTEX_RPS" not in door_gd:
		push_error("FAIL: door.gd missing VORTEX_RPS constant (single-ring rotation rate)")
		ok = false
	if "OUTER_RPS" in door_gd or "INNER_RPS" in door_gd:
		push_error("FAIL: door.gd still has iter-27 rotation rate constants")
		ok = false
	if "@onready var floor_rune" not in door_gd:
		push_error("FAIL: door.gd missing floor_rune @onready ref")
		ok = false
	if "RUNE_PULSE_DEPTH" not in door_gd:
		push_error("FAIL: door.gd missing RUNE_PULSE_DEPTH constant")
		ok = false
	if "_rune_base_alpha" not in door_gd:
		push_error("FAIL: door.gd doesn't capture rune base alpha before branch tinting")
		ok = false
	if ok:
		print("OK door.gd: single vortex + floor_rune pulse + rune base alpha capture")

	# ═══ Placement rules in main.gd ═══
	var main_src := FileAccess.get_file_as_string("res://scripts/main.gd")
	if "DOOR_CLEARANCE_RADIUS" not in main_src:
		push_error("FAIL: main.gd missing DOOR_CLEARANCE_RADIUS const")
		ok = false
	if "func _door_positions_for_room" not in main_src:
		push_error("FAIL: main.gd missing _door_positions_for_room helper")
		ok = false
	if "func _validate_door_placement" not in main_src:
		push_error("FAIL: main.gd missing _validate_door_placement audit")
		ok = false
	if "func _warn_if_within" not in main_src:
		push_error("FAIL: main.gd missing _warn_if_within helper")
		ok = false
	# Both door-spawn paths invoke the validator
	if not main_src.contains("_validate_door_placement([DOOR_POSITION])"):
		push_error("FAIL: _spawn_door doesn't validate the single-door position")
		ok = false
	if not main_src.contains("_validate_door_placement(positions)"):
		push_error("FAIL: _spawn_branch_doors doesn't validate the branch positions")
		ok = false
	# _scatter_decor uses door_positions to gap decor from portals
	if "door_positions: Array[Vector2] = _door_positions_for_room()" not in main_src:
		push_error("FAIL: _scatter_decor doesn't pull door positions for clearance check")
		ok = false
	# Both scatter loops (single decor + piles) check door clearance
	var door_clearance_checks: int = 0
	for line in main_src.split("\n"):
		if "DOOR_CLEARANCE_RADIUS" in line and "pos.distance_to(dp)" in line:
			door_clearance_checks += 1
	if door_clearance_checks < 2:
		push_error("FAIL: only %d door-clearance checks in scatter, expected ≥2 (singles + piles)" % door_clearance_checks)
		ok = false
	else:
		print("OK %d decor-loop door-clearance checks (DOOR_CLEARANCE_RADIUS = 90 px)" % door_clearance_checks)

	# ═══ Runtime: instantiate door scene and verify the new tree ═══
	var door_scene: PackedScene = load("res://scenes/door.tscn")
	if door_scene == null:
		push_error("FAIL: door.tscn no longer loads")
		ok = false
	else:
		var d: Node = door_scene.instantiate()
		for required in ["FloorRune", "StoneRing", "PortalBack", "Vortex", "PortalCore", "PortalGlow", "Motes"]:
			if d.get_node_or_null(NodePath(required)) == null:
				push_error("FAIL: instantiated door missing %s child" % required)
				ok = false
		# Iter-27 leftovers should NOT exist
		for forbidden in ["VortexOuter", "VortexInner", "StoneFrame", "StoneOutline"]:
			if d.get_node_or_null(NodePath(forbidden)) != null:
				push_error("FAIL: instantiated door still has %s (iter-27 leftover)" % forbidden)
				ok = false
		var portal_glow: PointLight2D = d.get_node_or_null("PortalGlow") as PointLight2D
		if portal_glow != null:
			if portal_glow.energy > 1.5:
				push_error("FAIL: PortalGlow runtime energy = %f (too bright; should be ~1.1)" % portal_glow.energy)
				ok = false
			else:
				print("OK runtime portal glow energy = %f (tamer than iter-27's 1.8)" % portal_glow.energy)
		d.queue_free()

	if ok:
		print("=== ITER 118 INTEGRATION PASSED ===")
	else:
		print("=== ITER 118 INTEGRATION FAILED ===")
	quit(0 if ok else 1)
