extends SceneTree

# Iter 232 / Bug Team R3 — Extended save migration regression test.
#
# `test_iter218_save_migration.gd` only walked v0..v5. The schema has
# since advanced through v6 (ether shards), v7 (upgrade tree) and v8
# (accessibility settings), and those new migration steps were UNTESTED
# — a future tweak to one of those `if from_version < N:` blocks could
# silently drop new-field defaults and corrupt player progress on
# upgrade.
#
# Coverage:
#   • v5 → current populates ether_shards + ether_lifetime_earned (v6),
#     upgrade_levels (v7), and the six accessibility fields (v8) with
#     safe defaults — and preserves the v0..v5 fields untouched.
#   • v7 → current populates ONLY the v8 fields (does not stomp existing
#     ether_shards / upgrade_levels).
#   • End-to-end load_from_dict on a v5 dict round-trips through the
#     migration and ends with the autoload in a sane state (correct
#     defaults applied via load path, not just the dict).

func _initialize() -> void:
	print("[mig232] init")
	await process_frame
	var gs: Node = root.get_node_or_null("/root/GameState")
	if gs == null:
		printerr("FAIL: GameState autoload missing")
		quit(1)
		return

	# ── Test 1 — v5 → current ──────────────────────────────────────────
	# Seed a fully-populated v5 dict (every field that existed at v5).
	# Verify migration adds v6 + v7 + v8 fields without disturbing v5
	# values.
	var v5_dict: Dictionary = {
		"save_version": 5,
		"owned_relics": ["iron_fang", "stoneheart"],
		"session_kills": 33,
		"dungeon_runs": 4,
		"last_run_kills": 17,
		"best_run_kills": 22,
		"master_volume": 0.42,
		"unlocked_achievements": ["first_blood", "centurion"],
		"has_seen_controls_hint": true,
		"last_run_time": 123.5,
		"best_run_time": 99.0,
		"has_completed_tutorial": true,
	}
	var m: Dictionary = gs.call("_migrate_save_dict", v5_dict.duplicate(true))

	if int(m.get("save_version", -1)) != gs.SAVE_VERSION_CURRENT:
		printerr("FAIL: v5 → current didn't bump save_version (got %s)" % m.get("save_version", -1))
		quit(1)
		return
	# v6 fields
	for k in ["ether_shards", "ether_lifetime_earned"]:
		if not m.has(k):
			printerr("FAIL: v5 → current missing v6 key '%s'" % k)
			quit(1)
			return
		if int(m[k]) != 0:
			printerr("FAIL: v5 → current default '%s' = %d, expected 0" % [k, int(m[k])])
			quit(1)
			return
	# v7 field
	if not m.has("upgrade_levels"):
		printerr("FAIL: v5 → current missing v7 key 'upgrade_levels'")
		quit(1)
		return
	var ul: Dictionary = m["upgrade_levels"]
	for node_id in ["resilience", "quick_step", "first_talisman", "tribute", "bound_vow"]:
		if not ul.has(node_id):
			printerr("FAIL: v5 → current upgrade_levels missing '%s'" % node_id)
			quit(1)
			return
		if int(ul[node_id]) != 0:
			printerr("FAIL: v5 → current upgrade_levels['%s'] = %d, expected 0" % [node_id, int(ul[node_id])])
			quit(1)
			return
	# v8 fields — accessibility (six keys with specific defaults).
	var expected_v8: Dictionary = {
		"music_volume": 0.8,
		"sfx_volume": 1.0,
		"screen_shake_intensity": 1.0,
		"motion_reduction": false,
		"text_scale": 1.0,
		"colorblind_mode": "none",
	}
	for k in expected_v8.keys():
		if not m.has(k):
			printerr("FAIL: v5 → current missing v8 key '%s'" % k)
			quit(1)
			return
		var got = m[k]
		var want = expected_v8[k]
		# Float comparison via absf; everything else by equality.
		if want is float:
			if absf(float(got) - float(want)) > 0.0001:
				printerr("FAIL: v5 → current '%s' = %s, expected %s" % [k, str(got), str(want)])
				quit(1)
				return
		else:
			if got != want:
				printerr("FAIL: v5 → current '%s' = %s, expected %s" % [k, str(got), str(want)])
				quit(1)
				return
	# Existing v0..v5 fields should remain untouched.
	if float(m.get("master_volume", 0.0)) != 0.42:
		printerr("FAIL: v5 → current corrupted master_volume (%.3f != 0.42)" % float(m["master_volume"]))
		quit(1)
		return
	if int(m.get("best_run_kills", 0)) != 22:
		printerr("FAIL: v5 → current corrupted best_run_kills")
		quit(1)
		return
	if m.get("has_completed_tutorial", false) != true:
		printerr("FAIL: v5 → current corrupted has_completed_tutorial")
		quit(1)
		return
	print("[mig232] v5 → v%d OK (v6 + v7 + v8 fields populated, v0..v5 preserved)" % gs.SAVE_VERSION_CURRENT)

	# ── Test 2 — v7 → current preserves existing v6/v7 state ──────────
	# Existing ether_shards + upgrade_levels survive; only v8 fields
	# are added.
	var v7_dict: Dictionary = {
		"save_version": 7,
		"ether_shards": 555,
		"ether_lifetime_earned": 1200,
		"upgrade_levels": {
			"resilience": 2, "quick_step": 1, "first_talisman": 0,
			"tribute": 1, "bound_vow": 0,
		},
	}
	m = gs.call("_migrate_save_dict", v7_dict.duplicate(true))
	if int(m.get("save_version", -1)) != gs.SAVE_VERSION_CURRENT:
		printerr("FAIL: v7 → current didn't bump save_version")
		quit(1)
		return
	if int(m.get("ether_shards", -1)) != 555:
		printerr("FAIL: v7 → current overwrote ether_shards (got %d, expected 555)" % int(m.get("ether_shards", -1)))
		quit(1)
		return
	if int(m.get("ether_lifetime_earned", -1)) != 1200:
		printerr("FAIL: v7 → current overwrote ether_lifetime_earned")
		quit(1)
		return
	var preserved_ul: Dictionary = m.get("upgrade_levels", {})
	if int(preserved_ul.get("resilience", -1)) != 2 or int(preserved_ul.get("tribute", -1)) != 1:
		printerr("FAIL: v7 → current corrupted upgrade_levels")
		quit(1)
		return
	# v8 keys must now exist with defaults.
	for k in ["music_volume", "sfx_volume", "colorblind_mode"]:
		if not m.has(k):
			printerr("FAIL: v7 → current missing v8 key '%s'" % k)
			quit(1)
			return
	print("[mig232] v7 → v%d OK (v6/v7 fields preserved, v8 added)" % gs.SAVE_VERSION_CURRENT)

	# ── Test 3 — load_from_dict end-to-end through migration ──────────
	# A v5 dict fed to load_from_dict must (a) migrate to current,
	# (b) populate the autoload's v6+v7+v8 properties with defaults,
	# AND (c) read v5 fields off the dict into the autoload.
	gs.call("load_from_dict", v5_dict.duplicate(true))
	if int(gs.get("ether_shards")) != 0:
		printerr("FAIL: load_from_dict via v5 migration left ether_shards = %d, expected 0" % int(gs.get("ether_shards")))
		quit(1)
		return
	var live_ul: Dictionary = gs.get("upgrade_levels")
	if int(live_ul.get("resilience", -1)) != 0:
		printerr("FAIL: load_from_dict via v5 migration upgrade_levels.resilience = %d, expected 0" % int(live_ul.get("resilience", -1)))
		quit(1)
		return
	if absf(float(gs.get("music_volume")) - 0.8) > 0.0001:
		printerr("FAIL: load_from_dict via v5 migration music_volume = %.3f, expected 0.8" % float(gs.get("music_volume")))
		quit(1)
		return
	if String(gs.get("colorblind_mode")) != "none":
		printerr("FAIL: load_from_dict via v5 migration colorblind_mode = '%s', expected 'none'" % String(gs.get("colorblind_mode")))
		quit(1)
		return
	# v5 fields should also be read.
	if int(gs.get("best_run_kills")) != 22:
		printerr("FAIL: load_from_dict via v5 migration lost best_run_kills")
		quit(1)
		return
	print("[mig232] load_from_dict end-to-end (v5 → current) OK")

	print("[mig232] PASS — extended save migration coverage (v5 → v8)")
	quit(0)
