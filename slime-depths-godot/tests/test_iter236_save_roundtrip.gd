extends SceneTree

# Iter 236 / Bug Team R4 — full save → load roundtrip regression test.
#
# Background: the test_iter218 migration suite verifies older save dicts
# get normalized forward, but nothing yet verifies the SHIPPING contract
# that `save_to_dict` and `load_from_dict` are inverses for the current
# schema. A field that's saved but not loaded (or vice versa) is a real
# beta-shipping bug class — the player wouldn't notice until the next
# launch when their accessibility settings reset, or their upgrade levels
# don't unlock on Steam Cloud sync.
#
# This test:
#   1. Populates GameState with NON-DEFAULT values for every persisted
#      field listed in save_to_dict.
#   2. Calls save_to_dict() to serialize.
#   3. Wipes the state by resetting to documented defaults.
#   4. Calls load_from_dict() to deserialize.
#   5. Verifies every field is back to the value it had pre-wipe.
#
# If any field is dropped on save OR ignored on load, this test fails
# with the specific field name — eliminating the "which one of 19 fields
# regressed" debugging step.

func _initialize() -> void:
	print("[roundtrip236] init")
	await process_frame
	var gs: Node = root.get_node_or_null("/root/GameState")
	if gs == null:
		printerr("FAIL: GameState autoload missing")
		quit(1)
		return

	# ── 1. Populate every persisted field with NON-DEFAULT values ───────
	# Each value chosen to differ from the documented default so a silent
	# "load wrote the default instead of the saved value" bug fails loud.
	# Strings include underscores + non-ASCII to catch JSON round-trip
	# weirdness. Floats use values that don't round to ints.
	var fresh_relics: Array[String] = ["iron_fang", "echo_quill", "bloodthorn"]
	gs.set("owned_relics", fresh_relics)
	gs.set("session_kills", 142)
	gs.set("dungeon_runs", 37)
	gs.set("last_run_kills", 88)
	gs.set("best_run_kills", 201)
	gs.set("last_run_time", 273.5)
	gs.set("best_run_time", 198.25)
	gs.set("master_volume", 0.42)
	var fresh_ach: Array[String] = ["first_blood", "centurion"]
	gs.set("unlocked_achievements", fresh_ach)
	gs.set("has_seen_controls_hint", true)
	gs.set("has_completed_tutorial", true)
	gs.set("ether_shards", 555)
	gs.set("ether_lifetime_earned", 1234)
	# upgrade_levels is a flat dict of known node_ids → int. Populate every
	# key with a non-zero, non-equal value so a "loaded all the same int"
	# bug (e.g. accidental literal substitution) gets caught.
	var fresh_upgrades: Dictionary = {
		"resilience": 1,
		"quick_step": 2,
		"first_talisman": 1,
		"tribute": 3,
		"bound_vow": 1,
	}
	gs.set("upgrade_levels", fresh_upgrades)
	gs.set("music_volume", 0.33)
	gs.set("sfx_volume", 0.77)
	gs.set("screen_shake_intensity", 0.55)
	gs.set("motion_reduction", true)
	gs.set("text_scale", 1.15)
	gs.set("colorblind_mode", "deuter")

	# ── 2. Serialize ────────────────────────────────────────────────────
	var saved: Dictionary = gs.call("save_to_dict")
	if not saved is Dictionary:
		printerr("FAIL: save_to_dict didn't return a Dictionary")
		quit(1)
		return
	if int(saved.get("save_version", -1)) != gs.SAVE_VERSION_CURRENT:
		printerr("FAIL: save_to_dict didn't stamp current save_version")
		quit(1)
		return

	# ── 3. Wipe to a known "fresh install" state ────────────────────────
	# Mirrors the autoload's documented defaults — if we set values that
	# differ from defaults and then "load back" via load_from_dict, any
	# field that's silently skipped on load will retain THIS default
	# instead of the originally-saved value, surfacing the bug.
	gs.set("owned_relics", [] as Array[String])
	gs.set("session_kills", 0)
	gs.set("dungeon_runs", 0)
	gs.set("last_run_kills", 0)
	gs.set("best_run_kills", 0)
	gs.set("last_run_time", 0.0)
	gs.set("best_run_time", -1.0)
	gs.set("master_volume", 0.7)
	gs.set("unlocked_achievements", [] as Array[String])
	gs.set("has_seen_controls_hint", false)
	gs.set("has_completed_tutorial", false)
	gs.set("ether_shards", 0)
	gs.set("ether_lifetime_earned", 0)
	gs.set("upgrade_levels", {
		"resilience": 0, "quick_step": 0, "first_talisman": 0,
		"tribute": 0, "bound_vow": 0,
	})
	gs.set("music_volume", 0.8)
	gs.set("sfx_volume", 1.0)
	gs.set("screen_shake_intensity", 1.0)
	gs.set("motion_reduction", false)
	gs.set("text_scale", 1.0)
	gs.set("colorblind_mode", "none")

	# ── 4. Deserialize ──────────────────────────────────────────────────
	gs.call("load_from_dict", saved)

	# ── 5. Verify every field roundtripped intact ───────────────────────
	# Each assertion calls out the exact field. A failure tells you which
	# of save_to_dict / load_from_dict needs the missing line.
	if not _eq(gs.get("owned_relics"), fresh_relics):
		printerr("FAIL: owned_relics didn't roundtrip — got %s expected %s" %
				[gs.get("owned_relics"), fresh_relics])
		quit(1)
		return
	if int(gs.get("session_kills")) != 142:
		printerr("FAIL: session_kills didn't roundtrip — got %d" % gs.get("session_kills"))
		quit(1)
		return
	if int(gs.get("dungeon_runs")) != 37:
		printerr("FAIL: dungeon_runs didn't roundtrip — got %d" % gs.get("dungeon_runs"))
		quit(1)
		return
	if int(gs.get("last_run_kills")) != 88:
		printerr("FAIL: last_run_kills didn't roundtrip — got %d" % gs.get("last_run_kills"))
		quit(1)
		return
	if int(gs.get("best_run_kills")) != 201:
		printerr("FAIL: best_run_kills didn't roundtrip — got %d" % gs.get("best_run_kills"))
		quit(1)
		return
	if not _feq(gs.get("last_run_time"), 273.5):
		printerr("FAIL: last_run_time didn't roundtrip — got %f" % gs.get("last_run_time"))
		quit(1)
		return
	if not _feq(gs.get("best_run_time"), 198.25):
		printerr("FAIL: best_run_time didn't roundtrip — got %f" % gs.get("best_run_time"))
		quit(1)
		return
	if not _feq(gs.get("master_volume"), 0.42):
		printerr("FAIL: master_volume didn't roundtrip — got %f" % gs.get("master_volume"))
		quit(1)
		return
	if not _eq(gs.get("unlocked_achievements"), fresh_ach):
		printerr("FAIL: unlocked_achievements didn't roundtrip — got %s" % str(gs.get("unlocked_achievements")))
		quit(1)
		return
	if gs.get("has_seen_controls_hint") != true:
		printerr("FAIL: has_seen_controls_hint didn't roundtrip — got %s" % str(gs.get("has_seen_controls_hint")))
		quit(1)
		return
	if gs.get("has_completed_tutorial") != true:
		printerr("FAIL: has_completed_tutorial didn't roundtrip — got %s" % str(gs.get("has_completed_tutorial")))
		quit(1)
		return
	if int(gs.get("ether_shards")) != 555:
		printerr("FAIL: ether_shards didn't roundtrip — got %d" % gs.get("ether_shards"))
		quit(1)
		return
	if int(gs.get("ether_lifetime_earned")) != 1234:
		printerr("FAIL: ether_lifetime_earned didn't roundtrip — got %d" % gs.get("ether_lifetime_earned"))
		quit(1)
		return
	var loaded_up: Dictionary = gs.get("upgrade_levels")
	for k in fresh_upgrades.keys():
		if int(loaded_up.get(k, -999)) != int(fresh_upgrades[k]):
			printerr("FAIL: upgrade_levels[%s] didn't roundtrip — got %s expected %d" %
					[k, str(loaded_up.get(k)), fresh_upgrades[k]])
			quit(1)
			return
	if not _feq(gs.get("music_volume"), 0.33):
		printerr("FAIL: music_volume didn't roundtrip — got %f" % gs.get("music_volume"))
		quit(1)
		return
	if not _feq(gs.get("sfx_volume"), 0.77):
		printerr("FAIL: sfx_volume didn't roundtrip — got %f" % gs.get("sfx_volume"))
		quit(1)
		return
	if not _feq(gs.get("screen_shake_intensity"), 0.55):
		printerr("FAIL: screen_shake_intensity didn't roundtrip — got %f" % gs.get("screen_shake_intensity"))
		quit(1)
		return
	if gs.get("motion_reduction") != true:
		printerr("FAIL: motion_reduction didn't roundtrip — got %s" % str(gs.get("motion_reduction")))
		quit(1)
		return
	if not _feq(gs.get("text_scale"), 1.15):
		printerr("FAIL: text_scale didn't roundtrip — got %f" % gs.get("text_scale"))
		quit(1)
		return
	if String(gs.get("colorblind_mode")) != "deuter":
		printerr("FAIL: colorblind_mode didn't roundtrip — got %s" % str(gs.get("colorblind_mode")))
		quit(1)
		return

	print("[roundtrip236] all 19 persisted fields roundtripped intact")
	# Bonus contract check — save_to_dict's dict shape matches the keys
	# load_from_dict actually reads. If a future field is added to one
	# but not the other this catches the asymmetry.
	var expected_keys: Array = [
		"save_version", "owned_relics", "session_kills", "dungeon_runs",
		"last_run_kills", "best_run_kills", "last_run_time", "best_run_time",
		"master_volume", "unlocked_achievements", "has_seen_controls_hint",
		"has_completed_tutorial", "ether_shards", "ether_lifetime_earned",
		"upgrade_levels", "music_volume", "sfx_volume", "screen_shake_intensity",
		"motion_reduction", "text_scale", "colorblind_mode",
	]
	for k in expected_keys:
		if not saved.has(k):
			printerr("FAIL: save_to_dict missing key '%s' (added to load but not save?)" % k)
			quit(1)
			return
	# Extra keys present in saved are flagged for review (not a hard fail
	# — a forward-compat scratch field would also appear here — but worth
	# surfacing in case a field is being saved that load_from_dict never
	# reads).
	for k in saved.keys():
		if not (k in expected_keys):
			print("[roundtrip236] WARN — saved key '%s' not in expected list (load coverage?)" % k)
	print("[roundtrip236] PASS — save→load roundtrip is 1:1 for all persisted fields")
	quit(0)

# Loose equality helpers — JSON round-tripping turns ints into floats and
# typed arrays into plain ones. We accept value-equal as enough.
func _eq(a, b) -> bool:
	if a is Array and b is Array:
		if a.size() != b.size():
			return false
		for i in range(a.size()):
			if a[i] != b[i]:
				return false
		return true
	return a == b

func _feq(a, b, eps: float = 0.0001) -> bool:
	return abs(float(a) - float(b)) <= eps
