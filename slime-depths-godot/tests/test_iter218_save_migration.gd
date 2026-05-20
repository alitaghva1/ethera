extends SceneTree

# Iter 218 / Beta M0.F — Save migration regression test.
# Verifies _migrate_save_dict normalizes older save dicts forward to the
# current schema. Each tested "from version" must surface the expected
# new fields with safe defaults.

func _initialize() -> void:
	print("[save-mig] init")
	await process_frame
	var gs: Node = root.get_node_or_null("/root/GameState")
	if gs == null:
		printerr("FAIL: GameState autoload missing")
		quit(1)
		return
	# Test 1 — v0 (no save_version): should default to v1 fields.
	var v0_dict: Dictionary = {
		"owned_relics": ["iron_fang"],
		"session_kills": 12,
		"last_run_kills": 10,
	}
	var migrated: Dictionary = gs.call("_migrate_save_dict", v0_dict)
	if int(migrated.get("save_version", -1)) != gs.SAVE_VERSION_CURRENT:
		printerr("FAIL: v0 dict didn't migrate to current version (got %s)" % migrated.get("save_version", -1))
		quit(1)
		return
	for k in ["best_run_kills", "master_volume", "unlocked_achievements",
			"has_seen_controls_hint", "last_run_time", "best_run_time",
			"has_completed_tutorial"]:
		if not migrated.has(k):
			printerr("FAIL: v0 → current missing key '%s'" % k)
			quit(1)
			return
	print("[save-mig] v0 → v%d OK (all new fields populated)" % gs.SAVE_VERSION_CURRENT)
	# Test 2 — v3 already has some fields; check it gets only v4+ defaults
	# added without overwriting existing values.
	var v3_dict: Dictionary = {
		"save_version": 3,
		"owned_relics": ["iron_fang"],
		"session_kills": 5,
		"dungeon_runs": 7,
		"last_run_kills": 5,
		"best_run_kills": 9,
		"master_volume": 0.5,
		"unlocked_achievements": ["first_blood"],
	}
	migrated = gs.call("_migrate_save_dict", v3_dict)
	if migrated.get("master_volume") != 0.5:
		printerr("FAIL: v3 → current overwrote master_volume (got %.3f)" % migrated.get("master_volume"))
		quit(1)
		return
	if not migrated.has("has_completed_tutorial"):
		printerr("FAIL: v3 → current didn't add has_completed_tutorial")
		quit(1)
		return
	if int(migrated.get("save_version", -1)) != gs.SAVE_VERSION_CURRENT:
		printerr("FAIL: v3 dict didn't migrate to current version")
		quit(1)
		return
	print("[save-mig] v3 → v%d OK (existing fields preserved, new fields added)" % gs.SAVE_VERSION_CURRENT)
	# Test 3 — v5 (current) should be a no-op.
	var v5_dict: Dictionary = {
		"save_version": gs.SAVE_VERSION_CURRENT,
		"owned_relics": ["echo_quill"],
		"master_volume": 0.8,
		"unlocked_achievements": [],
		"has_completed_tutorial": true,
	}
	migrated = gs.call("_migrate_save_dict", v5_dict)
	if migrated.get("master_volume") != 0.8 or migrated.get("has_completed_tutorial") != true:
		printerr("FAIL: current-version migrate corrupted fields")
		quit(1)
		return
	print("[save-mig] current-version migrate is no-op (OK)")
	# Test 4 — full load_from_dict roundtrip on a v0 dict.
	gs.call("load_from_dict", v0_dict.duplicate())
	if int(gs.get("session_kills")) != 12:
		printerr("FAIL: load_from_dict didn't read session_kills after migration")
		quit(1)
		return
	if not ("iron_fang" in gs.get("owned_relics")):
		printerr("FAIL: load_from_dict lost owned_relics through migration")
		quit(1)
		return
	print("[save-mig] load_from_dict end-to-end through migration OK")
	print("[save-mig] PASS — migration foundation working")
	quit(0)
