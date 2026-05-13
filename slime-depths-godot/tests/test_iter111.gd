extends SceneTree

# Iter 111 — MENU #4: parallax + breathing fog (audit-team visual polish).
#
# Three changes to the main menu, all atmosphere:
#
#   1. Title pulse range widened. Pre-iter-111 TITLE_PULSE_MIN/MAX were
#      0.97/1.03 — a 6% peak-to-peak range that playtesters reported as
#      "is the title even animated?" Iter-111 doubles it to 0.94/1.06
#      (12% range), still gentle but now reads as breath without anyone
#      having to squint.
#
#   2. Mouse parallax. Backdrop + torch embers + mist particles drift
#      OPPOSITE to the cursor at 10 px max. Title block + halo drift
#      SAME direction at 4 px max. PARALLAX_LERP_RATE = 6/s damps the
#      tracking so the canvas feels like it's settling toward where
#      you're looking — not snapping. Physically incorrect (real
#      parallax shifts everything in the same direction at different
#      rates) but the inverse-coupling reads strongly as depth on a 2D
#      plane and matches the "card hover" pattern modern UIs use.
#
#   3. Breathing fog. New CPUParticles2D MistParticles at the stair-mist
#      line (78% viewport height). 32 large soft puffs (scale 2.5-4.0
#      against 32×32 texture = 80-128px puffs) at near-zero velocity
#      (6-14 px/s), drifting slightly up + right. Cool blue-gray color
#      ramp peaking at 0.32 alpha so it reads as fog, not opaque clouds.
#      _reposition_embers re-pins it on viewport resize.
func _initialize() -> void:
	var ok := true

	# ═══ 1. Title pulse range widened ═══
	var menu_src := FileAccess.get_file_as_string("res://scripts/main_menu.gd")
	if "TITLE_PULSE_MIN := 0.94" not in menu_src:
		push_error("FAIL: TITLE_PULSE_MIN should be 0.94 (was 0.97)")
		ok = false
	if "TITLE_PULSE_MAX := 1.06" not in menu_src:
		push_error("FAIL: TITLE_PULSE_MAX should be 1.06 (was 1.03)")
		ok = false
	if ok:
		print("OK title pulse widened 0.97/1.03 → 0.94/1.06")

	# ═══ 2. Mouse parallax wiring ═══
	if "PARALLAX_BACKDROP_MAX_PX" not in menu_src:
		push_error("FAIL: missing PARALLAX_BACKDROP_MAX_PX constant")
		ok = false
	if "PARALLAX_TITLE_MAX_PX" not in menu_src:
		push_error("FAIL: missing PARALLAX_TITLE_MAX_PX constant")
		ok = false
	if "PARALLAX_LERP_RATE" not in menu_src:
		push_error("FAIL: missing PARALLAX_LERP_RATE constant")
		ok = false
	if "var _parallax_offset" not in menu_src:
		push_error("FAIL: missing _parallax_offset state var")
		ok = false
	if "var _parallax_target" not in menu_src:
		push_error("FAIL: missing _parallax_target state var")
		ok = false
	if "func _process(delta: float)" not in menu_src:
		push_error("FAIL: main_menu.gd missing _process for parallax tick")
		ok = false
	if "func _capture_parallax_bases" not in menu_src:
		push_error("FAIL: missing _capture_parallax_bases helper")
		ok = false
	# Verify the inversion: backdrop drift uses NEGATIVE _parallax_offset,
	# title drift uses POSITIVE.
	if not menu_src.contains("-_parallax_offset * PARALLAX_BACKDROP_MAX_PX"):
		push_error("FAIL: backdrop drift should invert _parallax_offset")
		ok = false
	if not menu_src.contains("_parallax_offset * PARALLAX_TITLE_MAX_PX"):
		push_error("FAIL: title drift should be POSITIVE _parallax_offset")
		ok = false
	if ok:
		print("OK mouse parallax wired (backdrop opposite, title same direction)")

	# ═══ 3. Mist particles in scene ═══
	var scene_src := FileAccess.get_file_as_string("res://scenes/main_menu.tscn")
	if "name=\"MistParticles\"" not in scene_src:
		push_error("FAIL: main_menu.tscn missing MistParticles node")
		ok = false
	if "mist_color_gradient" not in scene_src:
		push_error("FAIL: main_menu.tscn missing mist_color_gradient sub_resource")
		ok = false
	if "mist_scale_curve" not in scene_src:
		push_error("FAIL: main_menu.tscn missing mist_scale_curve sub_resource")
		ok = false
	if "MIST_REL_Y" not in menu_src:
		push_error("FAIL: main_menu.gd missing MIST_REL_Y constant")
		ok = false
	if "@onready var mist_particles" not in menu_src:
		push_error("FAIL: main_menu.gd missing mist_particles @onready var")
		ok = false
	# _reposition_embers must also place the mist
	if not menu_src.contains("mist_particles.position = Vector2(vp_size.x * 0.5, vp_size.y * MIST_REL_Y)"):
		push_error("FAIL: _reposition_embers doesn't position mist_particles via MIST_REL_Y")
		ok = false
	if ok:
		print("OK MistParticles wired in scene + reposition handler")

	# ═══ Runtime: instantiate menu scene + verify parallax targets exist ═══
	var menu_scene := load("res://scenes/main_menu.tscn") as PackedScene
	if menu_scene != null:
		var m: Node = menu_scene.instantiate()
		root.add_child(m)
		# Direct child lookups confirm the node tree shape is what main_menu.gd
		# @onready expects. If any of these are missing, the _ready cascade
		# would silently null and parallax would no-op.
		var nodes_required := ["BackdropImage", "TitleHalo", "TitleBlock", "MistParticles", "LeftTorchEmbers", "RightTorchEmbers"]
		for n in nodes_required:
			if m.get_node_or_null(NodePath(n)) == null:
				push_error("FAIL: main_menu scene missing %s child" % n)
				ok = false
		var mist: CPUParticles2D = m.get_node_or_null("MistParticles") as CPUParticles2D
		if mist != null:
			if mist.amount != 32:
				push_error("FAIL: MistParticles.amount = %d, expected 32" % mist.amount)
				ok = false
			if mist.lifetime < 9.5 or mist.lifetime > 10.5:
				push_error("FAIL: MistParticles.lifetime = %f, expected ~10" % mist.lifetime)
				ok = false
			if mist.color_ramp == null:
				push_error("FAIL: MistParticles missing color_ramp")
				ok = false
			else:
				print("OK MistParticles instance has amount=%d lifetime=%fs color_ramp" % [mist.amount, mist.lifetime])
		m.queue_free()
	else:
		push_error("FAIL: main_menu.tscn no longer loads")
		ok = false

	if ok:
		print("=== ITER 111 INTEGRATION PASSED ===")
	else:
		print("=== ITER 111 INTEGRATION FAILED ===")
	quit(0 if ok else 1)
