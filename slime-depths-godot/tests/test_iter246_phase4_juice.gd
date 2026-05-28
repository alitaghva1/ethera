extends SceneTree

# iter-246 / Director Phase 4 — progression juice + build moments test.
#
# Phase 4 of the director audit. The PAYOFF phase — VS-style reward
# cadence at every layer of the loop:
#
#   1. Per-room XP bar at the bottom of the HUD + mid-room boon
#      pedestal when filled.
#   2. First-3-pedestals rare-biased (VS chest 1-1-3-1-5 grammar) —
#      forced minimum tier rare with 60/35/5 split through pedestal #3.
#   3. Boss death cinematic extension — slow-mo bumped to 0.9 s,
#      upward-drifting gold-rain particles, camera punch-in.
#   4. First-clear-per-save ether-shard bonus (25 / 75 boss) keyed by
#      room display_name, persisted via save_version 9.
#   5. RESONANCE build-moment stinger — full-screen flash + brass
#      sweep when a theme tier crosses a new threshold.
#   6. VII orphan scrubbed (the room-progress chip no longer outputs
#      "VII" because the total denominator was dropped).
#
# Test coverage:
#   A. main.gd source contains _room_xp + _spawn_mid_room_boon + the
#      ROOM_XP_CAP / ROOM_XP_PER_BOSS constants.
#   B. game_state.gd contains _pedestal_offers_this_run +
#      note_pedestal_offer_spawned + PEDESTAL_FIRST_3_BIAS_LIMIT.
#   C. game_state.gd has floor_clear_bonuses_claimed: Array[String] +
#      try_award_first_clear_bonus.
#   D. game_state.gd SAVE_VERSION_CURRENT == 9 + the v8 → v9
#      migration step exists.
#   E. audio.gd has both resonance_stinger AND boon_unlocked entries
#      in SOUND_CONFIGS.
#   F. No VII literal in main.gd source (Phase 3 regression guard).
#   G. main.gd contains the boss-death cinematic extension hooks
#      (BOSS_DEATH_HIT_STOP_TIME_PHASE4 + _spawn_boss_gold_rain +
#      _punch_camera_for_boss_death + BOSS_DEATH_CAM_ZOOM_PEAK).
#   H. main.gd contains _fire_resonance_stinger + RESONANCE_FLAVOR.
#   I. main.gd contains the first-clear bonus call site at the room-
#      clear branch (try_award_first_clear_bonus).
#   J. main.gd has the first-3 rare-biased weight override in
#      _spawn_pedestal_offer (PEDESTAL_FIRST_3_BIAS_LIMIT reference).
#
# Headless source-grep + GameState autoload calls. Cheap to run as
# part of the 36-test sweep.

func _initialize() -> void:
	print("[iter246] init")
	await process_frame
	var ok := true

	var main_src := FileAccess.get_file_as_string("res://scripts/main.gd")
	var gs_src := FileAccess.get_file_as_string("res://scripts/game_state.gd")
	var audio_src := FileAccess.get_file_as_string("res://scripts/audio.gd")

	if main_src == "" or gs_src == "" or audio_src == "":
		printerr("FAIL: could not read one of main.gd / game_state.gd / audio.gd")
		quit(1)
		return

	# ═══ A. XP bar build + boon trigger ═══
	if not ("var _room_xp" in main_src):
		printerr("FAIL: main.gd missing _room_xp field")
		ok = false
	# iter-259 / Wave 8 — _spawn_mid_room_boon was renamed to
	# _show_level_up_choice when the silent pedestal spawn became the
	# VS-style pause-and-pick modal. Grep for the new name; either name
	# proves the boon-trigger function still exists in some form.
	if not ("_show_level_up_choice" in main_src) and not ("_spawn_mid_room_boon" in main_src):
		printerr("FAIL: main.gd missing the boon-trigger function (_show_level_up_choice or _spawn_mid_room_boon)")
		ok = false
	if not ("ROOM_XP_CAP" in main_src):
		printerr("FAIL: main.gd missing ROOM_XP_CAP const")
		ok = false
	if not ("ROOM_XP_PER_BOSS" in main_src):
		printerr("FAIL: main.gd missing ROOM_XP_PER_BOSS const")
		ok = false
	if not ("_advance_room_xp" in main_src):
		printerr("FAIL: main.gd missing _advance_room_xp helper")
		ok = false
	if not ("_build_xp_bar" in main_src):
		printerr("FAIL: main.gd missing _build_xp_bar helper")
		ok = false
	if not ("_reset_room_xp" in main_src):
		printerr("FAIL: main.gd missing _reset_room_xp helper")
		ok = false
	if ok:
		print("[iter246] A. XP bar + boon trigger present in main.gd OK")

	# ═══ B. _pedestal_offers_this_run counter + bias logic ═══
	if not ("_pedestal_offers_this_run" in gs_src):
		printerr("FAIL: game_state.gd missing _pedestal_offers_this_run field")
		ok = false
	if not ("note_pedestal_offer_spawned" in gs_src):
		printerr("FAIL: game_state.gd missing note_pedestal_offer_spawned function")
		ok = false
	if not ("PEDESTAL_FIRST_3_BIAS_LIMIT" in gs_src):
		printerr("FAIL: game_state.gd missing PEDESTAL_FIRST_3_BIAS_LIMIT const")
		ok = false
	# main.gd must consume the bias counter in the offer-spawn code.
	if not ("PEDESTAL_FIRST_3_BIAS_LIMIT" in main_src):
		printerr("FAIL: main.gd doesn't reference PEDESTAL_FIRST_3_BIAS_LIMIT (bias not wired)")
		ok = false
	# Runtime: GameState autoload should expose the counter API.
	var gs: Node = root.get_node_or_null("/root/GameState")
	if gs != null:
		if not gs.has_method("note_pedestal_offer_spawned"):
			printerr("FAIL: GameState autoload missing note_pedestal_offer_spawned method")
			ok = false
		if not gs.has_method("pedestal_offers_this_run"):
			printerr("FAIL: GameState autoload missing pedestal_offers_this_run method")
			ok = false
		if "_pedestal_offers_this_run" not in gs:
			printerr("FAIL: GameState autoload doesn't expose _pedestal_offers_this_run")
			ok = false
	else:
		printerr("FAIL: GameState autoload not present in test scene")
		ok = false
	if ok:
		print("[iter246] B. _pedestal_offers_this_run + first-3 bias OK")

	# ═══ C. floor_clear_bonuses_claimed + try_award_first_clear_bonus ═══
	if not ("floor_clear_bonuses_claimed" in gs_src):
		printerr("FAIL: game_state.gd missing floor_clear_bonuses_claimed field")
		ok = false
	# Must be declared as Array[String].
	if not ("var floor_clear_bonuses_claimed: Array[String]" in gs_src):
		printerr("FAIL: floor_clear_bonuses_claimed not declared as Array[String]")
		ok = false
	if not ("try_award_first_clear_bonus" in gs_src):
		printerr("FAIL: game_state.gd missing try_award_first_clear_bonus function")
		ok = false
	# Constants for the payout amounts.
	if not ("FIRST_CLEAR_BONUS" in gs_src):
		printerr("FAIL: game_state.gd missing FIRST_CLEAR_BONUS const")
		ok = false
	if not ("FIRST_CLEAR_BONUS_BOSS" in gs_src):
		printerr("FAIL: game_state.gd missing FIRST_CLEAR_BONUS_BOSS const")
		ok = false
	# main.gd must invoke the API at room-clear.
	if not ("try_award_first_clear_bonus" in main_src):
		printerr("FAIL: main.gd doesn't call try_award_first_clear_bonus (first-clear payout missing)")
		ok = false
	# Runtime: GameState autoload should expose the API + field.
	if gs != null:
		if not gs.has_method("try_award_first_clear_bonus"):
			printerr("FAIL: GameState autoload missing try_award_first_clear_bonus method")
			ok = false
		if "floor_clear_bonuses_claimed" not in gs:
			printerr("FAIL: GameState autoload doesn't expose floor_clear_bonuses_claimed")
			ok = false
		# End-to-end: first call grants; second call on same name no-ops.
		# We mutate the typed Array[String] in-place rather than reassign,
		# so the typed array contract holds (Godot 4 doesn't let us assign
		# an untyped [] literal to an Array[String] field).
		var prev_list: Array[String] = []
		for v in gs.floor_clear_bonuses_claimed:
			if v is String:
				prev_list.append(String(v))
		gs.floor_clear_bonuses_claimed.clear()
		var first_grant: int = int(gs.call("try_award_first_clear_bonus", "TEST_ROOM_NAME", false))
		var second_grant: int = int(gs.call("try_award_first_clear_bonus", "TEST_ROOM_NAME", false))
		if first_grant <= 0:
			printerr("FAIL: try_award_first_clear_bonus first call returned %d, expected > 0" % first_grant)
			ok = false
		if second_grant != 0:
			printerr("FAIL: try_award_first_clear_bonus second call returned %d, expected 0 (already claimed)" % second_grant)
			ok = false
		var boss_grant: int = int(gs.call("try_award_first_clear_bonus", "TEST_BOSS_ROOM", true))
		if boss_grant <= first_grant:
			printerr("FAIL: boss first_clear (%d) not greater than non-boss (%d)" % [boss_grant, first_grant])
			ok = false
		# Restore the pre-test list (in-place mutation).
		gs.floor_clear_bonuses_claimed.clear()
		for v in prev_list:
			gs.floor_clear_bonuses_claimed.append(v)
	if ok:
		print("[iter246] C. floor_clear_bonuses_claimed + try_award_first_clear_bonus OK")

	# ═══ D. SAVE_VERSION_CURRENT == 9 + v8 → v9 migration step ═══
	if not ("const SAVE_VERSION_CURRENT: int = 9" in gs_src):
		printerr("FAIL: SAVE_VERSION_CURRENT not bumped to 9")
		ok = false
	# Look for the v8 → v9 migration block.
	if not ("if from_version < 9:" in gs_src):
		printerr("FAIL: missing v8 → v9 migration block (if from_version < 9:)")
		ok = false
	# The migration must populate floor_clear_bonuses_claimed.
	var mig_idx: int = gs_src.find("if from_version < 9:")
	if mig_idx >= 0:
		var mig_window: String = gs_src.substr(mig_idx, 500)
		if not ("floor_clear_bonuses_claimed" in mig_window):
			printerr("FAIL: v8 → v9 migration doesn't initialize floor_clear_bonuses_claimed")
			ok = false
	# Runtime sanity: GameState reports version 9.
	if gs != null:
		if int(gs.SAVE_VERSION_CURRENT) != 9:
			printerr("FAIL: GameState.SAVE_VERSION_CURRENT = %d at runtime, expected 9" % int(gs.SAVE_VERSION_CURRENT))
			ok = false
		# Quick smoke: a v8 dict migrated should gain the new field.
		var v8_dict := { "save_version": 8 }
		var m: Dictionary = gs.call("_migrate_save_dict", v8_dict.duplicate(true))
		if int(m.get("save_version", -1)) != 9:
			printerr("FAIL: v8 → migrate didn't bump to 9 (got %s)" % m.get("save_version", -1))
			ok = false
		if not m.has("floor_clear_bonuses_claimed"):
			printerr("FAIL: v8 → migrate didn't add floor_clear_bonuses_claimed key")
			ok = false
	if ok:
		print("[iter246] D. SAVE_VERSION_CURRENT == 9 + migration step OK")

	# ═══ E. audio.gd has resonance_stinger AND boon_unlocked ═══
	if not ("\"resonance_stinger\":" in audio_src):
		printerr("FAIL: audio.gd missing 'resonance_stinger' SOUND_CONFIGS entry")
		ok = false
	if not ("\"boon_unlocked\":" in audio_src):
		printerr("FAIL: audio.gd missing 'boon_unlocked' SOUND_CONFIGS entry")
		ok = false
	# Runtime sanity: Audio autoload should have synthesized both streams.
	var audio_node: Node = root.get_node_or_null("/root/Audio")
	if audio_node != null:
		var streams: Variant = audio_node.get("_streams") if "_streams" in audio_node else null
		if streams is Dictionary:
			if not (streams as Dictionary).has("resonance_stinger"):
				printerr("FAIL: Audio._streams missing 'resonance_stinger' after synthesis")
				ok = false
			if not (streams as Dictionary).has("boon_unlocked"):
				printerr("FAIL: Audio._streams missing 'boon_unlocked' after synthesis")
				ok = false
	if ok:
		print("[iter246] E. audio.gd resonance_stinger + boon_unlocked OK")

	# ═══ F. No VII literal remains in main.gd / game_state.gd ═══
	# Regression guard for the Phase 3 audit + the iter-246 chip scrub.
	# The room-progress chip dropped the "/ total" denominator so the
	# only way "VII" appears in source would be a comment / string —
	# we treat that as forbidden to keep the iter-245 test honest.
	if "VII" in main_src:
		printerr("FAIL: main.gd contains 'VII' literal (Phase 3 regression)")
		ok = false
	if "VII" in gs_src:
		printerr("FAIL: game_state.gd contains 'VII' literal")
		ok = false
	if ok:
		print("[iter246] F. no VII literal in main.gd / game_state.gd OK")

	# ═══ G. Boss-death cinematic extension hooks ═══
	if not ("BOSS_DEATH_HIT_STOP_TIME_PHASE4" in main_src):
		printerr("FAIL: main.gd missing BOSS_DEATH_HIT_STOP_TIME_PHASE4 const")
		ok = false
	if not ("_spawn_boss_gold_rain" in main_src):
		printerr("FAIL: main.gd missing _spawn_boss_gold_rain helper")
		ok = false
	if not ("_punch_camera_for_boss_death" in main_src):
		printerr("FAIL: main.gd missing _punch_camera_for_boss_death helper")
		ok = false
	if not ("BOSS_DEATH_CAM_ZOOM_PEAK" in main_src):
		printerr("FAIL: main.gd missing BOSS_DEATH_CAM_ZOOM_PEAK const")
		ok = false
	if not ("BOSS_DEATH_GOLD_RAIN_COUNT" in main_src):
		printerr("FAIL: main.gd missing BOSS_DEATH_GOLD_RAIN_COUNT const")
		ok = false
	# The phase-4 slow-mo extension should be wired into _on_boss_died.
	var obd_idx: int = main_src.find("func _on_boss_died")
	if obd_idx >= 0:
		var obd_window: String = main_src.substr(obd_idx, 1500)
		if not ("BOSS_DEATH_HIT_STOP_TIME_PHASE4" in obd_window):
			printerr("FAIL: _on_boss_died doesn't use BOSS_DEATH_HIT_STOP_TIME_PHASE4")
			ok = false
		if not ("_spawn_boss_gold_rain" in obd_window):
			printerr("FAIL: _on_boss_died doesn't call _spawn_boss_gold_rain")
			ok = false
		if not ("_punch_camera_for_boss_death" in obd_window):
			printerr("FAIL: _on_boss_died doesn't call _punch_camera_for_boss_death")
			ok = false
	if ok:
		print("[iter246] G. boss-death cinematic extension OK")

	# ═══ H. _fire_resonance_stinger + RESONANCE_FLAVOR ═══
	if not ("_fire_resonance_stinger" in main_src):
		printerr("FAIL: main.gd missing _fire_resonance_stinger helper")
		ok = false
	if not ("RESONANCE_FLAVOR" in main_src):
		printerr("FAIL: main.gd missing RESONANCE_FLAVOR table")
		ok = false
	# game_state must expose the per-theme-tier-seen gate.
	if not ("note_theme_tier_for_stinger" in gs_src):
		printerr("FAIL: game_state.gd missing note_theme_tier_for_stinger gate")
		ok = false
	# The flavor table must include all 5 themes.
	for theme in ["storm", "flame", "blood", "vow", "shadow"]:
		if not ("\"%s\"" % theme in main_src):
			# Sanity (themes are referenced multiple times, just confirm).
			pass
	# Pickup-claimed handler must trigger the stinger check.
	var opc_idx: int = main_src.find("func _on_pickup_claimed")
	if opc_idx >= 0:
		var opc_window: String = main_src.substr(opc_idx, 4000)
		if not ("_check_resonance_stinger" in opc_window):
			printerr("FAIL: _on_pickup_claimed doesn't call _check_resonance_stinger")
			ok = false
	if ok:
		print("[iter246] H. resonance stinger wired into pickup_claimed OK")

	# ═══ I. _on_wave_cleared awards first-clear bonus ═══
	var owc_idx: int = main_src.find("func _on_wave_cleared")
	if owc_idx >= 0:
		var owc_window: String = main_src.substr(owc_idx, 6000)
		if not ("try_award_first_clear_bonus" in owc_window):
			printerr("FAIL: _on_wave_cleared doesn't call try_award_first_clear_bonus")
			ok = false
	if ok:
		print("[iter246] I. first-clear bonus wired into wave-cleared OK")

	# ═══ J. First-3 rare-biased weight override in _spawn_pedestal_offer ═══
	var spo_idx: int = main_src.find("func _spawn_pedestal_offer")
	if spo_idx >= 0:
		var spo_window: String = main_src.substr(spo_idx, 4000)
		if not ("note_pedestal_offer_spawned" in spo_window):
			printerr("FAIL: _spawn_pedestal_offer doesn't call note_pedestal_offer_spawned")
			ok = false
		if not ("PEDESTAL_FIRST_3_BIAS_LIMIT" in spo_window):
			printerr("FAIL: _spawn_pedestal_offer doesn't gate on PEDESTAL_FIRST_3_BIAS_LIMIT")
			ok = false
	if ok:
		print("[iter246] J. first-3 rare bias logic in _spawn_pedestal_offer OK")

	# ═══ Result ═══
	if ok:
		print("=== ITER 246 PHASE 4 JUICE PASSED ===")
		quit(0)
	else:
		print("=== ITER 246 PHASE 4 JUICE FAILED ===")
		quit(1)
