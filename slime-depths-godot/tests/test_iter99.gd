extends SceneTree

# Iter 99 — dash impact ground cracks → particle dust cloud.
#
# Playtest of iter-98 surfaced: "dash strike does a weird spider web
# look." Source: the 5 radial ground cracks (Line2Ds, 38 px each) ride
# the parent transform's 1.0 → 2.7× scale ramp, stretching to ~100 px.
# Long straight radial lines + the circular ring = spider web.
#
# iter-99 replaces the cracks with a particle emitter.
#
# Changes:
#   1. Delete CRACK_COUNT / CRACK_BASE_LENGTH / CRACK_FADE_DURATION /
#      CRACK_FADE_EXP constants in dash_impact.gd
#   2. Delete _cracks / _crack_base_alphas state vars
#   3. Delete _spawn_ground_cracks() function
#   4. Delete the _ready call to it
#   5. Delete the per-frame crack fade block in _process
#   6. Simplify max_life — drop CRACK_FADE_DURATION term, use a
#      PARTICLE_LIFE_BUDGET constant instead
#   7. Add a new DustCloud CPUParticles2D node in dash_impact.tscn:
#      28 particles, 0.55s lifetime, no gravity, slow radial spread,
#      high damping → ground-level dust haze
func _initialize() -> void:
	var ok := true
	var di_gd := FileAccess.get_file_as_string("res://scripts/dash_impact.gd")

	# ═══ 1. Crack-related symbols removed from active code ═══
	var lines: PackedStringArray = di_gd.split("\n")
	var live_refs: int = 0
	for line in lines:
		var trimmed: String = line.strip_edges()
		if trimmed.begins_with("#"):
			continue
		# Constants
		if "const CRACK_" in line:
			live_refs += 1
			push_error("FAIL: dash_impact.gd still declares CRACK_* const: %s" % trimmed)
		# Function definition
		if "func _spawn_ground_cracks" in line:
			live_refs += 1
			push_error("FAIL: _spawn_ground_cracks function still defined")
		# State var declarations
		for tok in ["_cracks:", "_crack_base_alphas:"]:
			if "var %s" % tok in line:
				live_refs += 1
				push_error("FAIL: dash_impact.gd still declares %s state var" % tok)
		# Calls
		if "_spawn_ground_cracks()" in line:
			live_refs += 1
			push_error("FAIL: dash_impact.gd still calls _spawn_ground_cracks()")
	if live_refs == 0:
		print("OK dash_impact.gd has no live crack references")
	else:
		ok = false

	# ═══ 2. DustCloud emitter exists in the scene ═══
	var di_tscn := FileAccess.get_file_as_string("res://scenes/fx/dash_impact.tscn")
	if "name=\"DustCloud\"" not in di_tscn:
		push_error("FAIL: dash_impact.tscn missing DustCloud node")
		ok = false
	else:
		print("OK dash_impact.tscn has DustCloud CPUParticles2D node")
	if "dustcloud_grad" not in di_tscn:
		push_error("FAIL: dash_impact.tscn missing dustcloud_grad gradient")
		ok = false
	else:
		print("OK dash_impact.tscn declares dustcloud_grad gradient")

	# ═══ 3. DustCloud tuning matches the brief ═══
	# Find the DustCloud node block + verify key fields.
	var dc_idx: int = di_tscn.find("name=\"DustCloud\"")
	if dc_idx > 0:
		var dc_block: String = di_tscn.substr(dc_idx, 600)
		# No gravity — sits at floor level
		if "gravity = Vector2(0, 0)" not in dc_block:
			push_error("FAIL: DustCloud should have no gravity (floor-level dust)")
			ok = false
		# 180° spread (full radial)
		if "spread = 180.0" not in dc_block:
			push_error("FAIL: DustCloud should have 180° spread")
			ok = false
		# Slow velocity (30-90)
		if not (dc_block.contains("initial_velocity_min = 30.0") and dc_block.contains("initial_velocity_max = 90.0")):
			push_error("FAIL: DustCloud velocity not 30–90 (would streak out instead of pooling)")
			ok = false
		# Lifetime 0.55s
		if "lifetime = 0.55" not in dc_block:
			push_error("FAIL: DustCloud lifetime should be 0.55s")
			ok = false
		# High damping (settles)
		if not (dc_block.contains("damping_min = 4.0") and dc_block.contains("damping_max = 7.0")):
			push_error("FAIL: DustCloud damping not 4–7 (would streak instead of settle)")
			ok = false
		# Uses the new gradient
		if "color_ramp = SubResource(\"dustcloud_grad\")" not in dc_block:
			push_error("FAIL: DustCloud doesn't use dustcloud_grad color ramp")
			ok = false
		if ok:
			print("OK DustCloud tuned: no gravity, 180° spread, 30-90 vel, 0.55s life, damping 4-7")

	# ═══ 4. Runtime — scene instantiates with the new node ═══
	var di_scene := load("res://scenes/fx/dash_impact.tscn") as PackedScene
	if di_scene == null:
		push_error("FAIL: dash_impact.tscn no longer loads")
		ok = false
	else:
		var inst: Node = di_scene.instantiate()
		if inst == null:
			push_error("FAIL: dash_impact failed to instantiate")
			ok = false
		else:
			# Keeps: Halo, Core, the spark CPUParticles2D (anonymous "CPUParticles2D"), Debris, DustCloud
			for keep in ["Halo", "Core", "Debris", "DustCloud"]:
				if inst.get_node_or_null(keep) == null:
					push_error("FAIL: dash_impact missing expected child %s" % keep)
					ok = false
			# Verify DustCloud is a CPUParticles2D (not some other type)
			var dc: Node = inst.get_node_or_null("DustCloud")
			if dc != null and not (dc is CPUParticles2D):
				push_error("FAIL: DustCloud is not a CPUParticles2D (got %s)" % dc.get_class())
				ok = false
			print("OK dash_impact instantiates with Halo + Core + Debris + DustCloud, no Crack nodes")
			# Ensure no Crack* children exist (they were named "Crack0..4")
			for child in inst.get_children():
				if String(child.name).begins_with("Crack"):
					push_error("FAIL: dash_impact still spawns Crack node: %s" % child.name)
					ok = false
			inst.queue_free()

	if ok:
		print("=== ITER 99 INTEGRATION PASSED ===")
	else:
		print("=== ITER 99 INTEGRATION FAILED ===")
	quit(0 if ok else 1)
