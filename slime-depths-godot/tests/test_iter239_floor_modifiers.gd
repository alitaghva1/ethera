extends SceneTree

# Iter 239 / Fun Ideas Team R4 — Floor Modifiers regression test.
#
# Floor Modifiers are a "Pact of Punishment lite". The player toggles
# 0-3 difficulty modifiers (HEAT WAVE / SWIFT FOES / etc.) at the
# pre-run modal before BEGIN finalizes; each modifier adds to an
# additive ether-shard reward multiplier consulted by
# GameState.award_ether_shards.
#
# This test verifies:
#   1. FloorModifiers.MODIFIER_CATALOG declares exactly 5 modifiers
#      with the expected ids (heat_wave, swift_foes, thicker_blood,
#      darker_paths, clocked). Each entry has the required field shape.
#   2. compute_ether_multiplier() returns 1.0 with no active modifiers.
#   3. compute_ether_multiplier() returns 1.0 + sum(ether_bonus) when
#      modifiers are stacked — verifies the additive math.
#   4. award_ether_shards integration: amount × multiplier round-trip
#      through GameState.ether_shards.
#   5. start_dungeon_run preserves active_floor_modifiers (so the
#      modal can write BEFORE the transition without being wiped).
#   6. is_active / toggle / clear_all behave correctly.
#   7. Hero take_damage source-greps verify the heat_wave gate is
#      wired (HEAT WAVE is the only fully-wired combat-side modifier
#      this round; others compute the multiplier correctly but their
#      gameplay effects are scaffolded for follow-up sprints).
#   8. main.gd HUD chip strip + main_menu.gd modal are source-greppable
#      (FloorModifiersScript preload, _build_floor_modifier_chips,
#      _show_modifiers_modal).
#
# FULLY WIRED THIS ROUND:
#   • Ether multiplier (all 5 modifiers contribute correctly to math)
#   • HEAT WAVE → +25% incoming damage to hero (via hero.take_damage)
#   • HUD chip strip + pre-run modal (UI parity)
#
# SCAFFOLDED FOR FOLLOW-UP:
#   • SWIFT_FOES → enemy.gd needs a SWIFT_FOES_SPEED_MUL hook in the
#     chase_contact velocity branch.
#   • THICKER_BLOOD → enemy_type.gd needs an HP scalar at spawn.
#   • DARKER_PATHS → main.gd/_spawn_pedestal_offer needs a tier shift.
#   • CLOCKED → enemy spawn timer in main.gd needs * 0.75 scalar.
#   Each of these would land in <30 LoC follow-up patches.
#
# Test pattern follows test_iter235_cursed_pickup.gd — load catalog
# from the Script's exported member, exercise the static helpers,
# verify GameState round-trip.

func _initialize() -> void:
	print("[funideas239] init")
	await process_frame
	var gs: Node = root.get_node_or_null("/root/GameState")
	if gs == null:
		printerr("FAIL: GameState autoload missing")
		quit(1)
		return
	# ── 1. FloorModifiers script + catalog shape ──────────────────────
	var fm_script: Script = load("res://scripts/floor_modifiers.gd") as Script
	if fm_script == null:
		printerr("FAIL: scripts/floor_modifiers.gd failed to load")
		quit(1)
		return
	var catalog: Array = fm_script.get("MODIFIER_CATALOG")
	if catalog == null or catalog.is_empty():
		printerr("FAIL: FloorModifiers.MODIFIER_CATALOG is null/empty")
		quit(1)
		return
	if catalog.size() != 5:
		printerr("FAIL: MODIFIER_CATALOG has %d entries, expected 5" % catalog.size())
		quit(1)
		return
	print("[funideas239] MODIFIER_CATALOG has 5 entries (correct)")
	# Required ids present.
	var expected_ids: Array = [
		"heat_wave", "swift_foes", "thicker_blood", "darker_paths", "clocked",
	]
	var seen_ids: Array[String] = []
	for entry in catalog:
		seen_ids.append(str(entry.get("id", "")))
	for required_id in expected_ids:
		if not (required_id in seen_ids):
			printerr("FAIL: MODIFIER_CATALOG missing id '%s'" % required_id)
			quit(1)
			return
	# Each catalog entry has the required field shape.
	for entry in catalog:
		for required_field in ["id", "label", "description", "ether_bonus", "tag"]:
			if not entry.has(required_field):
				printerr(
					"FAIL: catalog entry '%s' missing field '%s'"
					% [str(entry.get("id", "?")), required_field]
				)
				quit(1)
				return
		# ether_bonus must be a non-negative float.
		var bonus_val = entry.get("ether_bonus", -1.0)
		if not (bonus_val is float):
			printerr("FAIL: entry '%s' ether_bonus is not float" % str(entry.get("id", "?")))
			quit(1)
			return
		if bonus_val < 0.0:
			printerr("FAIL: entry '%s' ether_bonus is negative" % str(entry.get("id", "?")))
			quit(1)
			return
	print("[funideas239] catalog field shape OK — all 5 entries declare id/label/description/ether_bonus/tag")
	# ── 2. compute_ether_multiplier with empty active set ─────────────
	# Fresh state — start_dungeon_run clears per-run state but NOT
	# active_floor_modifiers (the modal writes BEFORE the call); the
	# test resets the field directly to ensure a clean baseline.
	gs.set("active_floor_modifiers", [] as Array[String])
	var mul_empty: float = fm_script.call("compute_ether_multiplier")
	if absf(mul_empty - 1.0) > 0.001:
		printerr(
			"FAIL: compute_ether_multiplier() with empty active = %.3f, expected 1.0"
			% mul_empty
		)
		quit(1)
		return
	print("[funideas239] compute_ether_multiplier() = 1.0 with no modifiers (correct)")
	# ── 3. compute_ether_multiplier with stacked modifiers ────────────
	# heat_wave (0.20) + swift_foes (0.15) + thicker_blood (0.25) +
	# darker_paths (0.30) + clocked (0.20) = +1.10 → total 2.10×
	var all_active: Array[String] = [
		"heat_wave", "swift_foes", "thicker_blood", "darker_paths", "clocked",
	]
	gs.set("active_floor_modifiers", all_active)
	var mul_all: float = fm_script.call("compute_ether_multiplier")
	var expected_total: float = 1.0 + 0.20 + 0.15 + 0.25 + 0.30 + 0.20
	if absf(mul_all - expected_total) > 0.001:
		printerr(
			"FAIL: compute_ether_multiplier() with all 5 = %.3f, expected %.3f"
			% [mul_all, expected_total]
		)
		quit(1)
		return
	print(
		"[funideas239] compute_ether_multiplier() with all 5 stacked = %.3f (correct, expected %.3f)"
		% [mul_all, expected_total]
	)
	# Single-modifier check — heat_wave alone should be 1.20.
	gs.set("active_floor_modifiers", ["heat_wave"] as Array[String])
	var mul_one: float = fm_script.call("compute_ether_multiplier")
	if absf(mul_one - 1.20) > 0.001:
		printerr(
			"FAIL: compute_ether_multiplier() with heat_wave alone = %.3f, expected 1.20"
			% mul_one
		)
		quit(1)
		return
	print("[funideas239] compute_ether_multiplier() with heat_wave alone = %.3f (correct)" % mul_one)
	# ── 4. award_ether_shards integration ─────────────────────────────
	# Clean GameState — wipe relics (else ether_magnet etc. could fold
	# into the multiplier and confuse the test).
	gs.call("start_dungeon_run")
	gs.set("active_floor_modifiers", [] as Array[String])
	gs.set("ether_shards", 0)
	gs.set("ether_lifetime_earned", 0)
	# Baseline — 10 shards with no modifiers should award exactly 10.
	gs.call("award_ether_shards", 10)
	var baseline: int = int(gs.get("ether_shards"))
	if baseline != 10:
		printerr("FAIL: baseline award_ether_shards(10) = %d, expected 10" % baseline)
		quit(1)
		return
	print("[funideas239] award_ether_shards(10) baseline = 10 (correct)")
	# With HEAT WAVE active → 10 * 1.20 = 12 shards.
	gs.set("ether_shards", 0)
	gs.set("active_floor_modifiers", ["heat_wave"] as Array[String])
	gs.call("award_ether_shards", 10)
	var heat_wave_award: int = int(gs.get("ether_shards"))
	if heat_wave_award != 12:
		printerr(
			"FAIL: award_ether_shards(10) with heat_wave = %d, expected 12"
			% heat_wave_award
		)
		quit(1)
		return
	print("[funideas239] award_ether_shards(10) with heat_wave = 12 (correct, 1.20×)")
	# With ALL FIVE active → 10 * 2.10 = 21 shards.
	gs.set("ether_shards", 0)
	gs.set("active_floor_modifiers", all_active)
	gs.call("award_ether_shards", 10)
	var all_award: int = int(gs.get("ether_shards"))
	if all_award != 21:
		printerr(
			"FAIL: award_ether_shards(10) with all 5 = %d, expected 21"
			% all_award
		)
		quit(1)
		return
	print("[funideas239] award_ether_shards(10) with all 5 stacked = 21 (correct, 2.10×)")
	# ── 5. start_dungeon_run preserves active_floor_modifiers ─────────
	# The modal writes to the field BEFORE calling start_dungeon_run,
	# so the field must survive the transition. Verifying this is
	# critical — a regression here would silently wipe the player's
	# pact choices on every BEGIN press.
	gs.set("active_floor_modifiers", ["heat_wave", "swift_foes"] as Array[String])
	gs.call("start_dungeon_run")
	var after_sdr: Array = gs.get("active_floor_modifiers")
	if after_sdr.size() != 2 or not ("heat_wave" in after_sdr) or not ("swift_foes" in after_sdr):
		printerr(
			"FAIL: active_floor_modifiers wiped by start_dungeon_run — got %s, expected [heat_wave, swift_foes]"
			% str(after_sdr)
		)
		quit(1)
		return
	print("[funideas239] start_dungeon_run preserves active_floor_modifiers (correct)")
	# ── 6. is_active / toggle / clear_all ─────────────────────────────
	gs.set("active_floor_modifiers", [] as Array[String])
	if fm_script.call("is_active", "heat_wave"):
		printerr("FAIL: is_active('heat_wave') = true on empty set")
		quit(1)
		return
	# Toggle on → true; toggle again → false.
	var toggled_on: bool = fm_script.call("toggle", "heat_wave")
	if not toggled_on:
		printerr("FAIL: toggle('heat_wave') first call returned false")
		quit(1)
		return
	if not fm_script.call("is_active", "heat_wave"):
		printerr("FAIL: is_active('heat_wave') = false after toggle on")
		quit(1)
		return
	var toggled_off: bool = fm_script.call("toggle", "heat_wave")
	if toggled_off:
		printerr("FAIL: toggle('heat_wave') second call returned true")
		quit(1)
		return
	if fm_script.call("is_active", "heat_wave"):
		printerr("FAIL: is_active('heat_wave') = true after toggle off")
		quit(1)
		return
	# clear_all should wipe everything.
	gs.set("active_floor_modifiers", ["heat_wave", "clocked"] as Array[String])
	fm_script.call("clear_all")
	var after_clear: Array = gs.get("active_floor_modifiers")
	if not after_clear.is_empty():
		printerr("FAIL: clear_all() left non-empty array: %s" % str(after_clear))
		quit(1)
		return
	print("[funideas239] is_active / toggle / clear_all behave correctly")
	# Unknown id toggle should silently no-op (return false), not crash.
	var unknown_result: bool = fm_script.call("toggle", "nonexistent_mod_xyz")
	if unknown_result:
		printerr("FAIL: toggle('nonexistent_mod_xyz') returned true (should silently no-op)")
		quit(1)
		return
	print("[funideas239] toggle() silently no-ops on unknown id")
	# ── 7. Hero source-grep: heat_wave wired into take_damage ─────────
	var hero_script: Script = load("res://scripts/hero.gd") as Script
	if hero_script == null:
		printerr("FAIL: hero.gd failed to load")
		quit(1)
		return
	var hero_src: String = hero_script.source_code
	if hero_src.find("FloorModifiers.is_active(\"heat_wave\")") < 0:
		printerr("FAIL: hero.gd missing FloorModifiers.is_active(\"heat_wave\") gate")
		quit(1)
		return
	if hero_src.find("HEAT_WAVE_DAMAGE_MUL") < 0:
		printerr("FAIL: hero.gd missing HEAT_WAVE_DAMAGE_MUL reference")
		quit(1)
		return
	print("[funideas239] hero.gd take_damage wires heat_wave gate (full combat-side wiring)")
	# ── 8. main.gd HUD chip strip wiring ──────────────────────────────
	var main_script: Script = load("res://scripts/main.gd") as Script
	if main_script == null:
		printerr("FAIL: main.gd failed to load")
		quit(1)
		return
	var main_src: String = main_script.source_code
	for required in [
		"FloorModifiersScript",
		"_build_floor_modifier_chips",
		"_update_floor_modifier_chips",
		"_floor_modifier_strip",
	]:
		if main_src.find(required) < 0:
			printerr("FAIL: main.gd missing '%s'" % required)
			quit(1)
			return
	print("[funideas239] main.gd HUD chip strip wiring present")
	# ── 9. main_menu.gd pre-run modal wiring ──────────────────────────
	var menu_script: Script = load("res://scripts/main_menu.gd") as Script
	if menu_script == null:
		printerr("FAIL: main_menu.gd failed to load")
		quit(1)
		return
	var menu_src: String = menu_script.source_code
	for required in [
		"_show_modifiers_modal",
		"_commit_begin_and_enter_dungeon",
		"FloorModifiers.catalog()",
		"_on_modifiers_confirm",
	]:
		if menu_src.find(required) < 0:
			printerr("FAIL: main_menu.gd missing '%s'" % required)
			quit(1)
			return
	# The original direct call into start_dungeon_run from BEGIN must
	# now go through the modal, not directly — verify _on_begin_pressed
	# routes through _show_modifiers_modal.
	if menu_src.find("_show_modifiers_modal()") < 0:
		printerr("FAIL: main_menu.gd never calls _show_modifiers_modal()")
		quit(1)
		return
	print("[funideas239] main_menu.gd pre-run modal wiring present")
	# ── 10. GameState field declaration ───────────────────────────────
	var gs_script: Script = load("res://scripts/game_state.gd") as Script
	var gs_src: String = gs_script.source_code
	if gs_src.find("var active_floor_modifiers: Array[String]") < 0:
		printerr("FAIL: game_state.gd missing 'var active_floor_modifiers: Array[String]'")
		quit(1)
		return
	if gs_src.find("FloorModifiers.compute_ether_multiplier()") < 0:
		printerr("FAIL: game_state.gd missing FloorModifiers.compute_ether_multiplier() call")
		quit(1)
		return
	print("[funideas239] game_state.gd field declaration + award_ether_shards hook present")
	# ── Done ──────────────────────────────────────────────────────────
	print(
		"[funideas239] PASS — 5 modifiers cataloged, multiplier math correct, "
		+ "HEAT WAVE fully wired, modal + HUD chips wired, GameState integration verified"
	)
	quit(0)
