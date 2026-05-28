extends SceneTree

# Iter 253 / Wave 3 — HAZARD REACTIVITY MATRIX smoke test.
#
# Verifies the hazard × hazard mixing system ships in a working state:
#
#   A. project.godot registers HazardInteractions as an autoload at the
#      expected path. A regression that drops the autoload would silently
#      kill the entire reactivity system without a runtime error.
#
#   B. The MIXING_MATRIX dictionary on HazardInteractions has all five
#      expected reactions and only uses canonical hazard_kind strings.
#      Catches typos like "firejet" or "spikes_pit" that would
#      silently always-return-empty from reaction_for().
#
#   C. Pair-key normalization: matrix_key(a, b) == matrix_key(b, a)
#      regardless of input order. Same for reaction_for.
#
#   D. Spawning two hazards (fire_jet + slow_zone) at the same position
#      and running a manual scan produces a "boiling_acid" HazardMix
#      child node. Verifies the runtime end-to-end (group lookup +
#      overlap math + scene instantiate + field set).
#
#   E. Mix fields match expectations: mix_kind == "boiling_acid",
#      radius > 0, lifetime > 0. Each is set BEFORE _ready by the
#      autoload, so a regression that changes the field-set order
#      would corrupt the visual.
#
#   F. Anti-loop guard: running the scan twice in a row from the same
#      hazard pair must NOT double-spawn — the DEDUPE_RADIUS guard
#      should suppress the second clone.
#
# Pattern follows test_iter231_reaction_web.gd / test_iter252_dynamic_
# lights.gd: source-grep + headless instantiate. No main scene load.

func _initialize() -> void:
	print("[iter253hazardmix] init")
	await process_frame

	# ── A. project.godot registers the autoload ──────────────────────
	var pg: String = FileAccess.get_file_as_string("res://project.godot")
	if pg.is_empty():
		printerr("FAIL: project.godot unreadable")
		quit(1)
		return
	if pg.find("HazardInteractions=") < 0:
		printerr("FAIL: project.godot missing HazardInteractions autoload registration")
		quit(1)
		return
	if pg.find("res://scripts/hazard_interactions.gd") < 0:
		printerr("FAIL: project.godot HazardInteractions registration not pointing at expected script path")
		quit(1)
		return
	print("[iter253hazardmix] A OK — HazardInteractions autoload registered")

	# ── B. MIXING_MATRIX shape ───────────────────────────────────────
	var hi_script: Script = load("res://scripts/hazard_interactions.gd") as Script
	if hi_script == null:
		printerr("FAIL: hazard_interactions.gd failed to load as Script")
		quit(1)
		return
	var matrix: Dictionary = hi_script.get("MIXING_MATRIX")
	if matrix == null:
		printerr("FAIL: HazardInteractions.MIXING_MATRIX is null")
		quit(1)
		return
	if matrix.size() != 5:
		printerr("FAIL: MIXING_MATRIX has %d entries, expected 5" % matrix.size())
		quit(1)
		return
	# Expected key → result lookups (post-normalization).
	var expected: Dictionary = {
		["fire_jet", "slow_zone"]:        "boiling_acid",
		["lightning_rod", "slow_zone"]:   "electrified_font",
		["fire_pool", "spike_pit"]:       "burning_spikes",
		["slow_zone", "spike_pit"]:       "submerged_spikes",
		["fire_jet", "fire_pool"]:        "greater_fire",
	}
	for pair in expected.keys():
		var a: String = pair[0]
		var b: String = pair[1]
		var want: String = expected[pair]
		# reaction_for is a static method — call via the script.
		var got: String = hi_script.call("reaction_for", a, b)
		if got != want:
			printerr("FAIL: reaction_for(%s,%s) = %s; expected %s" % [a, b, got, want])
			quit(1)
			return
	print("[iter253hazardmix] B OK — MIXING_MATRIX has all 5 reactions")

	# ── C. Symmetric pair key ────────────────────────────────────────
	var k_ab: String = hi_script.call("matrix_key", "fire_jet", "slow_zone")
	var k_ba: String = hi_script.call("matrix_key", "slow_zone", "fire_jet")
	if k_ab != k_ba:
		printerr("FAIL: matrix_key not symmetric: %s vs %s" % [k_ab, k_ba])
		quit(1)
		return
	var r_ab: String = hi_script.call("reaction_for", "fire_jet", "slow_zone")
	var r_ba: String = hi_script.call("reaction_for", "slow_zone", "fire_jet")
	if r_ab != r_ba or r_ab != "boiling_acid":
		printerr("FAIL: reaction_for not symmetric: %s vs %s" % [r_ab, r_ba])
		quit(1)
		return
	# Same-kind pair returns "" (no reaction defined for symmetric pairs).
	var r_same: String = hi_script.call("reaction_for", "fire_jet", "fire_jet")
	if r_same != "":
		printerr("FAIL: same-kind pair should not react, got %s" % r_same)
		quit(1)
		return
	# Unknown pair returns "" (no reaction defined).
	var r_unknown: String = hi_script.call("reaction_for", "spike_pit", "fire_jet")
	if r_unknown != "":
		printerr("FAIL: undefined pair should return empty, got %s" % r_unknown)
		quit(1)
		return
	print("[iter253hazardmix] C OK — matrix_key + reaction_for symmetric")

	# ── D + E. End-to-end spawn ──────────────────────────────────────
	# We can't directly reach the HazardInteractions autoload instance
	# from a SceneTree extension (autoloads only attach during a full
	# scene-tree boot via the engine config). We exercise the same code
	# path by instantiating two dummy hazard Node2Ds in the test tree,
	# the autoload script in headless mode, and calling the scan.
	#
	# This indirectly validates: group-lookup, distance check, matrix
	# resolution, scene instantiation, field copy, parenting.
	var hi: Node = hi_script.new()
	# Manually run _ready to load the mix scene. The autoload normally
	# fires _ready on engine boot.
	hi.call("_ready")
	root.add_child(hi)
	# Two stubby hazard Node2Ds — minimum surface: group, hazard_kind,
	# and a global_position via add_child. These stand in for fire_jet
	# / slow_zone scenes without their visual children.
	var fj: Node2D = _make_hazard_stub("fire_jet", Vector2(0, 0))
	var sz: Node2D = _make_hazard_stub("slow_zone", Vector2(20, 0))
	root.add_child(fj)
	root.add_child(sz)
	await process_frame
	# Manually trigger the scan (bypass the 0.6s accumulator).
	hi.call("_scan_and_spawn_mixes")
	await process_frame
	# Count HazardMix children of root.
	var found_mix: Node = _find_first_mix_by_kind(root, "boiling_acid")
	if found_mix == null:
		printerr("FAIL: no boiling_acid mix spawned for fire_jet+slow_zone overlap")
		quit(1)
		return
	# E. Mix field sanity.
	var m_kind: String = found_mix.get("mix_kind") as String
	var m_radius: float = found_mix.get("radius") as float
	var m_lifetime: float = found_mix.get("lifetime") as float
	if m_kind != "boiling_acid":
		printerr("FAIL: mix_kind = %s; expected boiling_acid" % m_kind)
		quit(1)
		return
	if m_radius <= 0.0:
		printerr("FAIL: mix radius non-positive (%f)" % m_radius)
		quit(1)
		return
	if m_lifetime <= 0.0:
		printerr("FAIL: mix lifetime non-positive (%f)" % m_lifetime)
		quit(1)
		return
	# Expected lifetime is REACTION_LIFETIME (4.0).
	var expected_life: float = hi_script.get("REACTION_LIFETIME") as float
	if abs(m_lifetime - expected_life) > 0.01:
		printerr("FAIL: mix lifetime %f != REACTION_LIFETIME %f" % [m_lifetime, expected_life])
		quit(1)
		return
	print("[iter253hazardmix] D+E OK — mix spawned with correct fields")

	# ── F. Dedupe — second scan does NOT double-spawn ────────────────
	hi.call("_scan_and_spawn_mixes")
	await process_frame
	var mixes: Array = _find_all_mixes_by_kind(root, "boiling_acid")
	if mixes.size() != 1:
		printerr("FAIL: second scan double-spawned boiling_acid (got %d, expected 1)" % mixes.size())
		quit(1)
		return
	print("[iter253hazardmix] F OK — second scan suppressed by DEDUPE_RADIUS")

	# Cleanup
	for m in mixes:
		if is_instance_valid(m):
			m.queue_free()
	if is_instance_valid(fj):
		fj.queue_free()
	if is_instance_valid(sz):
		sz.queue_free()
	if is_instance_valid(hi):
		hi.queue_free()

	print("[iter253hazardmix] PASS")
	quit(0)

# Build a stub hazard node — Node2D in "hazards" group with a
# hazard_kind script var. Mimics what the four real hazard scripts
# expose to HazardInteractions (group + field), nothing else needed.
func _make_hazard_stub(kind: String, pos: Vector2) -> Node2D:
	var n: Node2D = Node2D.new()
	# GDScript dynamic var attach. Use set_meta as a fallback channel
	# since plain Node2D doesn't have a hazard_kind field. The autoload's
	# _kind_of uses `"hazard_kind" in node` which would fail for meta;
	# wrap in a tiny dynamic script instead.
	var stub_script: GDScript = GDScript.new()
	stub_script.source_code = "extends Node2D\nvar hazard_kind: String = \"\"\n"
	var err: int = stub_script.reload()
	if err != OK:
		printerr("FAIL: stub script reload err=%d" % err)
	n.set_script(stub_script)
	n.set("hazard_kind", kind)
	n.add_to_group("hazards")
	n.global_position = pos
	return n

# Find the first HazardMix child of `root` whose mix_kind matches.
# Recursive walk because the autoload parents under current_scene
# which == root in our headless harness.
func _find_first_mix_by_kind(node: Node, kind: String) -> Node:
	for c in node.get_children():
		if not is_instance_valid(c):
			continue
		# Detect mix nodes by the mix_kind property.
		if "mix_kind" in c:
			var k: String = c.get("mix_kind") as String
			if k == kind:
				return c
		var nested: Node = _find_first_mix_by_kind(c, kind)
		if nested != null:
			return nested
	return null

# Return every mix node matching `kind` under `root`. Used by the
# dedupe-guard assertion (must be exactly one).
func _find_all_mixes_by_kind(node: Node, kind: String) -> Array:
	var out: Array = []
	for c in node.get_children():
		if not is_instance_valid(c):
			continue
		if "mix_kind" in c:
			var k: String = c.get("mix_kind") as String
			if k == kind:
				out.append(c)
		out.append_array(_find_all_mixes_by_kind(c, kind))
	return out
