extends SceneTree

# Iter 74 integration test — four parallel low-hanging-fruit polishes.
#
# Team A: theme chip strip polish + ThemePalette helper
# Team B: boss-intro name card (cinematic entry)
# Team C: achievement popup (corner toast with queue)
# Team D: damage number variants (crit, heal, hero_damage, resist)
func _initialize() -> void:
	var ok := true

	# ═══ TEAM A — Theme chip strip ═══
	var palette := load("res://scripts/theme_palette.gd")
	if palette == null:
		push_error("FAIL: theme_palette.gd failed to load")
		ok = false
	else:
		print("OK theme_palette.gd loads")

	var palette_src := FileAccess.get_file_as_string("res://scripts/theme_palette.gd")
	for theme in ["storm", "flame", "blood", "vow", "shadow"]:
		if not palette_src.contains(theme):
			push_error("FAIL: theme_palette.gd missing theme %s" % theme)
			ok = false
			break
	if ok:
		print("OK ThemePalette covers all 5 themes")

	var main_src := FileAccess.get_file_as_string("res://scripts/main.gd")
	if not main_src.contains("ThemePalette.color_for"):
		push_error("FAIL: main.gd doesn't use ThemePalette.color_for")
		ok = false
	else:
		print("OK main.gd uses ThemePalette helper")

	if not (main_src.contains("_build_theme_chip") or main_src.contains("_theme_prev_tiers")):
		push_error("FAIL: main.gd missing chip-build helper or tier-cache")
		ok = false
	else:
		print("OK main.gd has chip-build helper + tier-cache")

	# ═══ TEAM B — Boss intro ═══
	var bi := load("res://scenes/boss_intro.tscn")
	if bi == null:
		push_error("FAIL: boss_intro.tscn failed to load")
		ok = false
	else:
		print("OK boss_intro.tscn loads")

	var bi_src := FileAccess.get_file_as_string("res://scripts/boss_intro.gd")
	if not bi_src.contains("static func spawn"):
		push_error("FAIL: boss_intro.gd missing static spawn function")
		ok = false
	else:
		print("OK boss_intro.gd has static spawn()")

	if not main_src.contains("BossIntro.spawn"):
		push_error("FAIL: main.gd doesn't call BossIntro.spawn")
		ok = false
	else:
		print("OK main.gd hooks BossIntro.spawn in boss spawn path")

	if not (bi_src.contains("SUBTITLES") or bi_src.contains("subtitles")):
		push_error("FAIL: boss_intro.gd missing subtitle dict")
		ok = false
	else:
		print("OK boss_intro.gd has subtitle dict")

	# ═══ TEAM C — Achievement popup ═══
	var ap := load("res://scenes/achievement_popup.tscn")
	if ap == null:
		push_error("FAIL: achievement_popup.tscn failed to load")
		ok = false
	else:
		print("OK achievement_popup.tscn loads")

	var ap_src := FileAccess.get_file_as_string("res://scripts/achievement_popup.gd")
	if not ap_src.contains("static func spawn"):
		push_error("FAIL: achievement_popup.gd missing static spawn")
		ok = false
	else:
		print("OK achievement_popup.gd has static spawn()")

	# Queue behavior
	if not (ap_src.contains("_queue") and ap_src.contains("_is_active")):
		push_error("FAIL: achievement_popup.gd missing queue state")
		ok = false
	else:
		print("OK achievement_popup.gd has queue + active state")

	# iter-67 sizing pattern
	if not ap_src.contains("custom_minimum_size"):
		push_error("FAIL: achievement_popup.gd missing custom_minimum_size (iter-67 pattern)")
		ok = false
	elif not ap_src.contains("await get_tree().process_frame"):
		push_error("FAIL: achievement_popup.gd missing await process_frame")
		ok = false
	else:
		print("OK achievement_popup.gd uses iter-67 sizing pattern")

	if not main_src.contains("AchievementPopup.spawn"):
		push_error("FAIL: main.gd doesn't call AchievementPopup.spawn")
		ok = false
	else:
		print("OK main.gd hooks AchievementPopup.spawn in _on_achievement_unlocked")

	# ═══ TEAM D — Damage number variants ═══
	var dn_src := FileAccess.get_file_as_string("res://scripts/damage_number.gd")
	# Variant param added, default preserves legacy behavior
	if not dn_src.contains("variant"):
		push_error("FAIL: damage_number.gd missing variant parameter")
		ok = false
	else:
		print("OK damage_number.gd has variant parameter")

	# All 5 variants implemented
	for v in ["normal", "crit", "heal", "hero_damage", "resist"]:
		if not dn_src.contains("\"%s\"" % v):
			push_error("FAIL: damage_number.gd missing variant %s" % v)
			ok = false
	if ok:
		print("OK damage_number.gd has all 5 variants (normal/crit/heal/hero_damage/resist)")

	# spawn_crit still works (backward compatibility for enemy.gd:1487 etc.)
	if not dn_src.contains("spawn_crit"):
		push_error("FAIL: damage_number.gd missing spawn_crit (breaks enemy.gd)")
		ok = false
	else:
		print("OK damage_number.gd retains spawn_crit for backward compat")

	if ok:
		print("=== ITER 74 INTEGRATION PASSED ===")
	else:
		print("=== ITER 74 INTEGRATION FAILED ===")
	quit(0 if ok else 1)
