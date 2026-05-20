extends SceneTree

# Iter 232 / Bug Team R3 — Achievement unlock regression test.
#
# `GameState.unlock_achievement` is referenced from multiple sites
# (kill counters, theme-devotee checks, mythic-relic grant, boss death
# hooks) and surfaced via the iter-225 achievement viewer. The unlock
# path was never tested end-to-end — risk that an idempotency regression
# or a silent rejection of valid IDs would erode permanent player progress.
#
# Coverage:
#   1. unlock_achievement("first_blood") adds to unlocked_achievements
#      and returns true.
#   2. A second unlock_achievement("first_blood") is idempotent — returns
#      false, list length unchanged.
#   3. Unknown ID rejected — returns false, not added to the list.
#   4. Multiple distinct unlocks accumulate correctly in the list.
#   5. Achievement IDs survive a save → load roundtrip (uses the same
#      tolerant-array rebuild that owned_relics uses).

func _initialize() -> void:
	print("[ach232] init")
	await process_frame
	var gs: Node = root.get_node_or_null("/root/GameState")
	if gs == null:
		printerr("FAIL: GameState autoload missing")
		quit(1)
		return

	# Clean slate — wipe any unlocked_achievements from earlier session.
	# Field is typed Array[String] on the autoload, so we must assign a
	# typed empty array (a plain `Array` would fail with "Invalid
	# assignment of property" in Godot 4's strict typing).
	var empty_typed: Array[String] = []
	gs.unlocked_achievements = empty_typed

	# ── 1. First unlock — returns true, appears in the list ─────────────
	var ok: bool = gs.call("unlock_achievement", "first_blood")
	if not ok:
		printerr("FAIL: first unlock_achievement('first_blood') returned false")
		quit(1)
		return
	if not ("first_blood" in gs.unlocked_achievements):
		printerr("FAIL: 'first_blood' not in unlocked_achievements after unlock")
		quit(1)
		return
	if gs.unlocked_achievements.size() != 1:
		printerr("FAIL: unlocked_achievements size = %d, expected 1" % gs.unlocked_achievements.size())
		quit(1)
		return
	print("[ach232] first unlock 'first_blood' OK — list size 1")

	# ── 2. Idempotent — second unlock returns false, list unchanged ────
	ok = gs.call("unlock_achievement", "first_blood")
	if ok:
		printerr("FAIL: duplicate unlock_achievement('first_blood') returned true")
		quit(1)
		return
	if gs.unlocked_achievements.size() != 1:
		printerr(
			"FAIL: duplicate unlock changed list size to %d, expected 1" % gs.unlocked_achievements.size()
		)
		quit(1)
		return
	print("[ach232] duplicate unlock is idempotent OK")

	# ── 3. Unknown ID rejected ──────────────────────────────────────────
	var pre_size: int = gs.unlocked_achievements.size()
	ok = gs.call("unlock_achievement", "definitely_not_a_real_id_xyz")
	if ok:
		printerr("FAIL: unlock_achievement('definitely_not_a_real_id_xyz') returned true")
		quit(1)
		return
	if gs.unlocked_achievements.size() != pre_size:
		printerr(
			"FAIL: unknown unlock changed list size from %d to %d" % [pre_size, gs.unlocked_achievements.size()]
		)
		quit(1)
		return
	if "definitely_not_a_real_id_xyz" in gs.unlocked_achievements:
		printerr("FAIL: unknown id leaked into unlocked_achievements")
		quit(1)
		return
	print("[ach232] unknown id rejected OK")

	# ── 4. Multiple distinct unlocks accumulate ─────────────────────────
	ok = gs.call("unlock_achievement", "centurion")
	if not ok:
		printerr("FAIL: unlock_achievement('centurion') returned false")
		quit(1)
		return
	ok = gs.call("unlock_achievement", "mythic_find")
	if not ok:
		printerr("FAIL: unlock_achievement('mythic_find') returned false")
		quit(1)
		return
	if gs.unlocked_achievements.size() != 3:
		printerr(
			"FAIL: 3 distinct unlocks → list size = %d, expected 3" % gs.unlocked_achievements.size()
		)
		quit(1)
		return
	for expected_id in ["first_blood", "centurion", "mythic_find"]:
		if not (expected_id in gs.unlocked_achievements):
			printerr("FAIL: '%s' missing from unlocked_achievements after 3 unlocks" % expected_id)
			quit(1)
			return
	print("[ach232] 3 distinct unlocks accumulate OK")

	# ── 5. Save → load roundtrip preserves unlocks ──────────────────────
	# Build a dict via save_to_dict, wipe in-memory state, reload.
	var saved: Dictionary = gs.call("save_to_dict")
	if not saved.has("unlocked_achievements"):
		printerr("FAIL: save_to_dict missing unlocked_achievements")
		quit(1)
		return
	var empty_typed2: Array[String] = []
	gs.unlocked_achievements = empty_typed2
	gs.call("load_from_dict", saved)
	if gs.unlocked_achievements.size() != 3:
		printerr(
			"FAIL: roundtrip unlocked_achievements size = %d, expected 3" % gs.unlocked_achievements.size()
		)
		quit(1)
		return
	for expected_id in ["first_blood", "centurion", "mythic_find"]:
		if not (expected_id in gs.unlocked_achievements):
			printerr("FAIL: '%s' lost in save → load roundtrip" % expected_id)
			quit(1)
			return
	print("[ach232] save → load roundtrip preserved 3 unlocks OK")

	# ── 6. load_from_dict scrubs garbage entries in unlocked_achievements
	# (an attacker / corrupt-save hand-edit shouldn't smuggle in
	# non-string OR unknown-id values).
	var bad_dict: Dictionary = saved.duplicate(true)
	bad_dict["unlocked_achievements"] = [
		"first_blood",                # valid
		"not_a_real_achievement_xyz", # invalid id — should be dropped
		42,                           # invalid type — should be dropped
		"centurion",                  # valid
	]
	gs.call("load_from_dict", bad_dict)
	if gs.unlocked_achievements.size() != 2:
		printerr(
			"FAIL: corrupt-load → size = %d, expected 2 (garbage scrubbed)" % gs.unlocked_achievements.size()
		)
		quit(1)
		return
	if not ("first_blood" in gs.unlocked_achievements) or not ("centurion" in gs.unlocked_achievements):
		printerr("FAIL: corrupt-load scrubbed valid entries too")
		quit(1)
		return
	print("[ach232] corrupt-save scrub keeps only known string ids OK")

	print("[ach232] PASS — achievement unlock flow correct (idempotent, validated, persistent)")
	quit(0)
