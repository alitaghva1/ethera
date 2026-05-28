extends SceneTree

# iter-259 / Wave 8 — VS-style level-up boon-choice smoke test.
#
# Replaces the silent mid-room pedestal spawn from iter-246 with a
# full pause-the-game, pick-one-of-three boon picker. This test verifies
# the contract:
#
#   A. boon_catalog.gd loads as a Script and exposes BOONS with 15
#      entries.
#   B. All 5 themes (flame/storm/blood/vow/shadow) are represented with
#      exactly 3 boons each.
#   C. get_boon(id) returns the matching entry; missing ids return {}.
#   D. Every boon's `mods` dict (where non-empty) uses keys that match
#      modifier names used elsewhere in the codebase — caught by a
#      source-grep against hero.gd / game_state.gd. This catches typos
#      like "sword_dmg_bonus" that would silently never affect anything.
#   E. main.gd source contains `_show_level_up_choice` (the new trigger)
#      and the BOON_MODAL_SCENE preload, AND the modal pauses the tree
#      via boon_modal.gd's `get_tree().paused = true`.
#   F. scenes/boon_modal.tscn loads as a PackedScene + instantiates
#      to a CanvasLayer with process_mode = PROCESS_MODE_WHEN_PAUSED.
#   G. audio.gd has the level_up_swell SOUND_CONFIGS entry.
#
# Headless source-grep + autoload checks. Doesn't actually mount the
# modal (a paused tree mid-test would block) — pause / unpause behavior
# is verified by source-inspection of the modal's _ready code.

func _initialize() -> void:
	print("[iter259boons] init")
	await process_frame
	var ok := true

	# ═══ A. BoonCatalog script loads + BOONS has 15 entries ════════════
	var catalog_script: Script = load("res://scripts/boon_catalog.gd") as Script
	if catalog_script == null:
		printerr("FAIL: boon_catalog.gd failed to load as Script")
		quit(1)
		return
	# Use Engine.get_singleton fallback via instance — class_name BoonCatalog
	# is a RefCounted so we can read static const via the script directly.
	# Godot 4 exposes script constants via Script.get_script_constant_map.
	var const_map: Dictionary = catalog_script.get_script_constant_map()
	if not const_map.has("BOONS"):
		printerr("FAIL: boon_catalog.gd missing BOONS const")
		quit(1)
		return
	var boons: Dictionary = const_map["BOONS"]
	if boons.size() != 15:
		printerr("FAIL: BOONS has %d entries, expected 15" % boons.size())
		ok = false
	else:
		print("[iter259boons] A OK — BOONS has 15 entries")

	# ═══ B. 5 themes × 3 boons each ════════════════════════════════════
	var theme_counts: Dictionary = {}
	for id in boons:
		var entry: Dictionary = boons[id]
		var theme: String = str(entry.get("theme", ""))
		theme_counts[theme] = int(theme_counts.get(theme, 0)) + 1
	var expected_themes: Array[String] = ["flame", "storm", "blood", "vow", "shadow"]
	for theme in expected_themes:
		var n: int = int(theme_counts.get(theme, 0))
		if n != 3:
			printerr("FAIL: theme '%s' has %d boons, expected 3" % [theme, n])
			ok = false
	if theme_counts.size() != expected_themes.size():
		printerr("FAIL: theme set is %s, expected exactly %s" % [theme_counts.keys(), expected_themes])
		ok = false
	if ok:
		print("[iter259boons] B OK — all 5 themes have exactly 3 boons each")

	# ═══ C. get_boon(id) returns expected entry / empty on miss ════════
	# Pick a known id from each theme + a bogus id and verify behavior
	# via direct static call on the script.
	var known_ids: Array[String] = ["flame_strike", "storm_chain", "blood_vigor", "vow_aegis", "shadow_step"]
	for id in known_ids:
		var entry: Dictionary = catalog_script.call("get_boon", id)
		if entry.is_empty():
			printerr("FAIL: get_boon('%s') returned empty — expected catalog entry" % id)
			ok = false
		elif str(entry.get("name", "")) == "":
			printerr("FAIL: get_boon('%s') missing name field" % id)
			ok = false
	var bogus: Dictionary = catalog_script.call("get_boon", "definitely_not_a_real_boon")
	if not bogus.is_empty():
		printerr("FAIL: get_boon('bogus') returned non-empty — expected {} on miss")
		ok = false
	if ok:
		print("[iter259boons] C OK — get_boon(id) returns expected entries; miss → {}")

	# ═══ D. mod keys match existing modifier names ═════════════════════
	# Source-grep hero.gd + game_state.gd for each unique mod key in the
	# catalog. If a key never appears in either file, modifier_total /
	# modifier_total_f never consume it — the boon would be a no-op.
	var hero_src: String = FileAccess.get_file_as_string("res://scripts/hero.gd")
	var gs_src: String = FileAccess.get_file_as_string("res://scripts/game_state.gd")
	var combined_src: String = hero_src + "\n" + gs_src
	if combined_src == "\n":
		printerr("FAIL: failed to read hero.gd or game_state.gd")
		quit(1)
		return
	var all_keys: Dictionary = {}    # key → first boon id using it
	for id in boons:
		var entry: Dictionary = boons[id]
		var mods: Dictionary = entry.get("mods", {})
		for key in mods:
			if not all_keys.has(key):
				all_keys[key] = id
	# Iterate the collected keys and ensure each appears somewhere in
	# either hero.gd or game_state.gd. Quoted form is what the source
	# uses — "max_hp_bonus" not max_hp_bonus.
	for key in all_keys:
		var needle: String = '"' + str(key) + '"'
		if combined_src.find(needle) < 0:
			printerr("FAIL: mod key %s (from boon '%s') doesn't appear in hero.gd or game_state.gd — modifier_total won't consume it" % [needle, all_keys[key]])
			ok = false
	if ok:
		print("[iter259boons] D OK — all %d mod keys map to existing modifier names" % all_keys.size())

	# ═══ E. main.gd has _show_level_up_choice + modal preload ══════════
	var main_src: String = FileAccess.get_file_as_string("res://scripts/main.gd")
	if main_src == "":
		printerr("FAIL: failed to read main.gd")
		quit(1)
		return
	if main_src.find("_show_level_up_choice") < 0:
		printerr("FAIL: main.gd does not contain _show_level_up_choice")
		ok = false
	if main_src.find("BOON_MODAL_SCENE") < 0:
		printerr("FAIL: main.gd does not preload BOON_MODAL_SCENE")
		ok = false
	# The advance-XP path must call _show_level_up_choice (not the old
	# _spawn_mid_room_boon) when the bar fills.
	var adv_idx: int = main_src.find("func _advance_room_xp")
	if adv_idx < 0:
		printerr("FAIL: main.gd missing _advance_room_xp function (iter-246 prereq)")
		ok = false
	else:
		var adv_next: int = main_src.find("\nfunc ", adv_idx + 5)
		var adv_body: String = main_src.substr(adv_idx, max(0, adv_next - adv_idx)) if adv_next >= 0 else main_src.substr(adv_idx)
		if adv_body.find("_show_level_up_choice") < 0:
			printerr("FAIL: _advance_room_xp does not call _show_level_up_choice on cross-100%")
			ok = false
	# Modal pauses tree.
	var modal_src: String = FileAccess.get_file_as_string("res://scripts/boon_modal.gd")
	if modal_src == "":
		printerr("FAIL: failed to read boon_modal.gd")
		quit(1)
		return
	if modal_src.find("get_tree().paused = true") < 0:
		printerr("FAIL: boon_modal.gd does not pause the tree")
		ok = false
	# Modal must not bind ESCAPE (un-dismissable until pick).
	if modal_src.find("KEY_ESCAPE") >= 0:
		printerr("FAIL: boon_modal.gd references KEY_ESCAPE — modal must be unmissable")
		ok = false
	if ok:
		print("[iter259boons] E OK — main.gd wires _show_level_up_choice; modal pauses + is un-dismissable")

	# ═══ F. scenes/boon_modal.tscn loads + instantiates ═══════════════
	var modal_scene: PackedScene = load("res://scenes/boon_modal.tscn") as PackedScene
	if modal_scene == null:
		printerr("FAIL: scenes/boon_modal.tscn failed to load as PackedScene")
		quit(1)
		return
	var inst: Node = modal_scene.instantiate()
	if inst == null:
		printerr("FAIL: boon_modal.tscn instantiate() returned null")
		quit(1)
		return
	if not (inst is CanvasLayer):
		printerr("FAIL: boon_modal.tscn root is not a CanvasLayer (got %s)" % inst.get_class())
		ok = false
	# process_mode == PROCESS_MODE_WHEN_PAUSED (enum value 3) so the
	# overlay processes while paused.
	if int(inst.get("process_mode")) != int(Node.PROCESS_MODE_WHEN_PAUSED):
		printerr("FAIL: boon_modal.tscn root process_mode != PROCESS_MODE_WHEN_PAUSED (got %d)" % int(inst.get("process_mode")))
		ok = false
	# Don't add_child + leave it dangling — the instantiate alone proves
	# the scene parses; we free it without mounting.
	inst.free()
	if ok:
		print("[iter259boons] F OK — boon_modal.tscn loads, root is CanvasLayer w/ PROCESS_MODE_WHEN_PAUSED")

	# ═══ G. audio.gd has level_up_swell ════════════════════════════════
	var audio_src: String = FileAccess.get_file_as_string("res://scripts/audio.gd")
	if audio_src.find("level_up_swell") < 0:
		printerr("FAIL: audio.gd does not have level_up_swell SOUND_CONFIGS entry")
		ok = false
	if ok:
		print("[iter259boons] G OK — audio.gd has level_up_swell SFX entry")

	if not ok:
		printerr("[iter259boons] FAIL — see errors above")
		quit(1)
		return
	print("[iter259boons] PASS — VS-style level-up choice wired end to end")
	quit(0)
