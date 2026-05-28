extends SceneTree

# iter-248 — sword 3-hit combo state machine.
#
# Verifies the new combo machinery added in sub-commit 2 of the ETHERA
# combat redesign:
#   1. Source-level: combo constants (window, per-hit data arrays,
#      committed flag) all present in hero.gd at the expected sizes.
#   2. Source-level: damage multiplier applied in _resolve_melee_strike;
#      knockback multiplier folded into the knockback_mul value.
#   3. Source-level: combo window timer decrement + reset block exists
#      in _physics_process.
#   4. Source-level: blast input branch checks _combo_committed.
#   5. Source-level: audio config "hero_swing_heavy" exists with the
#      design's freq sweep (380→140 Hz).
#
# We skip a full SceneTree instantiation because the hero scene needs
# the entire autoload stack (GameState, RunState, Audio, etc.) up and
# running to compute relic modifiers etc. — source assertions cover
# the structural contract for the combo machinery.

func _initialize() -> void:
	print("[iter248combo] init")
	await process_frame
	var ok := true

	var hero_src: String = FileAccess.get_file_as_string("res://scripts/hero.gd")
	if hero_src.is_empty():
		printerr("FAIL: hero.gd unreadable")
		quit(1)
		return

	# ── 1. Combo constants ────────────────────────────────────────────
	var required_consts: Array = [
		"COMBO_WINDOW",
		"COMBO_HIT_STARTUP",
		"COMBO_HIT_ACTIVE",
		"COMBO_HIT_RECOVERY",
		"COMBO_HIT_DAMAGE_MUL",
		"COMBO_HIT_KNOCKBACK_MUL",
		"COMBO_RESET_TIMER_MAX",
	]
	for c in required_consts:
		if hero_src.find("const " + c) < 0:
			printerr("FAIL: hero.gd missing const %s" % c)
			ok = false
		else:
			print("[iter248combo] const %s present" % c)

	# ── 2. Combo state vars ───────────────────────────────────────────
	var required_vars: Array = [
		"_combo_index",
		"_combo_window_timer",
		"_combo_committed",
	]
	for v in required_vars:
		if hero_src.find("var " + v) < 0:
			printerr("FAIL: hero.gd missing var %s" % v)
			ok = false
		else:
			print("[iter248combo] var %s present" % v)

	# ── 3. Damage + knockback multiplier wiring ──────────────────────
	if hero_src.find("COMBO_HIT_DAMAGE_MUL[_combo_index]") < 0:
		printerr("FAIL: _resolve_melee_strike does not apply COMBO_HIT_DAMAGE_MUL")
		ok = false
	else:
		print("[iter248combo] damage multiplier applied per combo index")
	if hero_src.find("COMBO_HIT_KNOCKBACK_MUL[_combo_index]") < 0:
		printerr("FAIL: _resolve_melee_strike does not apply COMBO_HIT_KNOCKBACK_MUL")
		ok = false
	else:
		print("[iter248combo] knockback multiplier applied per combo index")

	# ── 4. Combo advance in _start_attack ─────────────────────────────
	# Look for the chain-advance check at the top of _start_attack.
	if hero_src.find("if _combo_window_timer > 0.0 and _combo_index < COMBO_RESET_TIMER_MAX:") < 0:
		printerr("FAIL: _start_attack does not advance combo when window is open")
		ok = false
	else:
		print("[iter248combo] _start_attack advances combo within window")

	# ── 5. Combo window decrement + reset block in _physics_process ──
	if hero_src.find("_combo_window_timer = max(0.0, _combo_window_timer - delta)") < 0:
		printerr("FAIL: _physics_process does not decrement _combo_window_timer")
		ok = false
	else:
		print("[iter248combo] _physics_process decrements _combo_window_timer")
	if hero_src.find("_combo_index = 0") < 0:
		printerr("FAIL: _combo_index never reset anywhere")
		ok = false
	else:
		print("[iter248combo] _combo_index reset path present")

	# ── 6. Window arm at end of _resolve_melee_strike ────────────────
	if hero_src.find("_combo_window_timer = COMBO_WINDOW") < 0:
		printerr("FAIL: _resolve_melee_strike does not arm _combo_window_timer")
		ok = false
	else:
		print("[iter248combo] window armed after swing resolves")

	# ── 7. Heavy hit committed gate on blast input ───────────────────
	if hero_src.find("not _combo_committed") < 0:
		printerr("FAIL: input precedence chain has no _combo_committed guard")
		ok = false
	else:
		print("[iter248combo] _combo_committed gates blast cancel during heavy recovery")

	# ── 8. Heavy hit fires the audio variant ─────────────────────────
	if hero_src.find("hero_swing_heavy") < 0:
		printerr("FAIL: hero.gd never plays the hero_swing_heavy audio variant")
		ok = false
	else:
		print("[iter248combo] hero_swing_heavy audio cued for heavy hit")

	# ── 9. audio.gd has the heavy variant entry ──────────────────────
	var audio_src: String = FileAccess.get_file_as_string("res://scripts/audio.gd")
	if audio_src.find("\"hero_swing_heavy\":") < 0:
		printerr("FAIL: audio.gd missing hero_swing_heavy SOUND_CONFIGS entry")
		ok = false
	elif audio_src.find("\"freq_start\": 380.0") < 0:
		printerr("FAIL: audio.gd hero_swing_heavy not the 380Hz design spec")
		ok = false
	else:
		print("[iter248combo] audio.gd hero_swing_heavy present at design spec")

	# ── 10. Blade tint helper exists ─────────────────────────────────
	if hero_src.find("_apply_combo_blade_tint") < 0:
		printerr("FAIL: hero.gd missing _apply_combo_blade_tint helper")
		ok = false
	else:
		print("[iter248combo] blade tint helper present")

	# ── 11. Const ARRAY shapes — verify the constants are length-3 ──
	# We grep for the literal "[0.10, 0.10, 0.20]" / similar so a future
	# accidental 4-element edit shows up in the test. Brittle but
	# intentional — array shape IS the contract.
	if hero_src.find("[0.10, 0.10, 0.20]") < 0:
		printerr("FAIL: COMBO_HIT_STARTUP not in expected shape [0.10, 0.10, 0.20]")
		ok = false
	if hero_src.find("[0.08, 0.08, 0.10]") < 0:
		printerr("FAIL: COMBO_HIT_ACTIVE not in expected shape [0.08, 0.08, 0.10]")
		ok = false
	if hero_src.find("[0.16, 0.16, 0.32]") < 0:
		printerr("FAIL: COMBO_HIT_RECOVERY not in expected shape [0.16, 0.16, 0.32]")
		ok = false
	if hero_src.find("[1.0,  1.0,  2.0]") < 0 and hero_src.find("[1.0, 1.0, 2.0]") < 0:
		printerr("FAIL: COMBO_HIT_DAMAGE_MUL not in expected shape — hit 3 should be 2.0× base")
		ok = false
	if hero_src.find("[1.0,  1.0,  1.5]") < 0 and hero_src.find("[1.0, 1.0, 1.5]") < 0:
		printerr("FAIL: COMBO_HIT_KNOCKBACK_MUL not in expected shape — hit 3 should be 1.5× knockback")
		ok = false
	print("[iter248combo] combo frame data array shapes verified")

	if ok:
		print("[iter248combo] PASS")
		quit(0)
	else:
		print("[iter248combo] FAIL")
		quit(1)
