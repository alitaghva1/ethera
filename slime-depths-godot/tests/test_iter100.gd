extends SceneTree

# Iter 100 — clean up stale "dodge" + "parry" UI text after iter-95.
#
# User playtest screenshot caught the HUD still saying:
#   "LMB swing · RMB blast · SPACE dodge · Q parry · SHIFT dash"
# Plus several other stale references the iter-95 dodge-removal +
# parry→shield rename missed:
#
#   1. main.gd:439 status_label control hint (HUD bottom-left)
#   2. main.tscn baked status_label fallback text
#   3. main.gd:239 VOW theme ascendance description ("each parry...")
#   4. main.gd:242-243 SHADOW theme descriptions (dodge i-frames /
#      dodge shockwave)
#   5. main.gd:1738 shrine stat_kinds array ("hp", "dodge", "atk")
#   6. shrine.gd SHRINE_KINDS dict — "dodge" entry pointing at the
#      dead `dodge_cd_reduction_f` key (which never existed as a live
#      modifier anyway)
#   7. settings_screen.tscn R4 row (SPACE → dodge) — Space is now
#      unbound, the row was misleading
#   8. room_config.gd shrine_positions comment (HP/DODGE_CD/ATK_DMG
#      → HP/DASH_CD/ATK_DMG)
#
# All player-facing references now read SHIELD (defensive timing catch
# on Q) and DASH (mobility + i-frames on Shift). The shrine "dodge"
# entry was renamed to "dash" and granted a LIVE modifier key
# (dash_strike_cooldown_mul) instead of the dead one.
func _initialize() -> void:
	var ok := true

	# ═══ 1. main.gd HUD control hint ═══
	var main_src := FileAccess.get_file_as_string("res://scripts/main.gd")
	if "SPACE dodge" in main_src or "Q parry" in main_src:
		push_error("FAIL: main.gd status_label still says SPACE dodge or Q parry")
		ok = false
	if not main_src.contains("Q shield · SHIFT dash"):
		push_error("FAIL: main.gd status_label doesn't say 'Q shield · SHIFT dash'")
		ok = false
	else:
		print("OK main.gd HUD control hint is current (Q shield · SHIFT dash)")

	# ═══ 2. main.tscn baked status text ═══
	var main_tscn := FileAccess.get_file_as_string("res://scenes/main.tscn")
	if "SPACE dodge" in main_tscn:
		push_error("FAIL: main.tscn baked status_label still says 'SPACE dodge'")
		ok = false
	else:
		print("OK main.tscn no longer bakes 'SPACE dodge' fallback text")

	# ═══ 3-4. main.gd theme descriptions ═══
	if "each parry restores 1 HP" in main_src:
		push_error("FAIL: main.gd VOW ascendance still says 'each parry restores 1 HP'")
		ok = false
	if "+0.08s dodge i-frames" in main_src:
		push_error("FAIL: main.gd SHADOW resonance still says '+0.08s dodge i-frames' (stale, dead key)")
		ok = false
	if "dodge fires a 60-px shockwave" in main_src:
		push_error("FAIL: main.gd SHADOW ascendance still says 'dodge fires a 60-px shockwave'")
		ok = false
	if "each shield catch restores 1 HP" not in main_src:
		push_error("FAIL: main.gd VOW ascendance doesn't say 'each shield catch restores 1 HP'")
		ok = false
	if "dash strike fires a 60-px shockwave" not in main_src:
		push_error("FAIL: main.gd SHADOW ascendance doesn't mention dash strike shockwave")
		ok = false
	if ok:
		print("OK main.gd theme descriptions match iter-95/96 reality")

	# ═══ 5. main.gd shrine stat_kinds list ═══
	if "[\"hp\", \"dodge\", \"atk\"]" in main_src:
		push_error("FAIL: main.gd stat_kinds still includes 'dodge'")
		ok = false
	if "[\"hp\", \"dash\", \"atk\"]" not in main_src:
		push_error("FAIL: main.gd stat_kinds should be ['hp', 'dash', 'atk']")
		ok = false
	else:
		print("OK main.gd shrine stat_kinds = ['hp', 'dash', 'atk']")

	# ═══ 6. shrine.gd SHRINE_KINDS dict ═══
	var shrine_src := FileAccess.get_file_as_string("res://scripts/shrine.gd")
	# The "dodge" entry must be gone — match the literal dict key.
	if "\"dodge\": {" in shrine_src:
		push_error("FAIL: shrine.gd SHRINE_KINDS still has 'dodge' entry")
		ok = false
	if "\"dash\": {" not in shrine_src:
		push_error("FAIL: shrine.gd SHRINE_KINDS missing the new 'dash' entry")
		ok = false
	# Modifier key must be a LIVE one. Dead `dodge_cd_reduction_f` gone
	# from any ACTIVE code (comments documenting the rename are fine).
	var shrine_lines: PackedStringArray = shrine_src.split("\n")
	for line in shrine_lines:
		var trimmed: String = line.strip_edges()
		if trimmed.begins_with("#"):
			continue
		if "dodge_cd_reduction_f" in line:
			push_error("FAIL: shrine.gd still uses dead modifier_key dodge_cd_reduction_f in active code")
			ok = false
	# Confirm dash entry points at the live key.
	var dash_idx: int = shrine_src.find("\"dash\": {")
	if dash_idx >= 0:
		var dash_block: String = shrine_src.substr(dash_idx, 400)
		if "dash_strike_cooldown_mul" not in dash_block:
			push_error("FAIL: shrine 'dash' entry doesn't use dash_strike_cooldown_mul as modifier_key")
			ok = false
		else:
			print("OK shrine 'dash' entry grants dash_strike_cooldown_mul (live key)")

	# ═══ 7. settings_screen.tscn R4 row removed ═══
	var ss_tscn := FileAccess.get_file_as_string("res://scenes/settings_screen.tscn")
	if "name=\"R4\"" in ss_tscn:
		push_error("FAIL: settings_screen.tscn R4 row (SPACE→dodge) still present")
		ok = false
	# The action label "dodge" should be gone from the controls list.
	if "text = \"dodge\"" in ss_tscn:
		push_error("FAIL: settings_screen.tscn still has a 'dodge' action label")
		ok = false
	# The SPACE key label inside the controls list should also be gone.
	# (settings_screen.tscn may still mention SPACE elsewhere, but the
	# specific R4 row is gone.)
	if not ss_tscn.contains("text = \"shield\""):
		push_error("FAIL: settings_screen.tscn missing 'shield' action label (R5 should survive)")
		ok = false
	else:
		print("OK settings_screen.tscn: R4 (SPACE→dodge) removed, R5 (Q→shield) survives")

	# ═══ 8. room_config.gd shrine comment updated ═══
	var rc_src := FileAccess.get_file_as_string("res://scripts/room_config.gd")
	# Active-code refs would be the issue; the comment containing
	# "DODGE_CD" should now also mention "DASH_CD" or note the iter-100
	# rename.
	if "HP / DODGE_CD / ATK_DMG" in rc_src and "DASH_CD" not in rc_src:
		push_error("FAIL: room_config.gd comment still references DODGE_CD without DASH_CD note")
		ok = false
	else:
		print("OK room_config.gd shrine comment notes the dodge→dash rename")

	# ═══ 9. Runtime — shrine scene loads with the dash kind ═══
	var sh_scene := load("res://scenes/shrine.tscn") as PackedScene
	if sh_scene == null:
		push_error("FAIL: shrine.tscn won't load")
		ok = false
	else:
		var sh: Node = sh_scene.instantiate()
		# Set stat_kind = "dash" — used to be "dodge". Verify it resolves
		# to a real entry in SHRINE_KINDS.
		sh.stat_kind = "dash"
		# SHRINE_KINDS is a class const; verify via the script directly.
		var sh_script = sh.get_script()
		if sh_script != null:
			var kinds = sh_script.get("SHRINE_KINDS")
			if kinds != null and kinds is Dictionary:
				if not kinds.has("dash"):
					push_error("FAIL: shrine SHRINE_KINDS const missing 'dash' key")
					ok = false
				elif kinds.has("dodge"):
					push_error("FAIL: shrine SHRINE_KINDS const still has 'dodge' key")
					ok = false
				else:
					print("OK shrine SHRINE_KINDS has 'dash' (no 'dodge')")
		sh.queue_free()

	if ok:
		print("=== ITER 100 INTEGRATION PASSED ===")
	else:
		print("=== ITER 100 INTEGRATION FAILED ===")
	quit(0 if ok else 1)
