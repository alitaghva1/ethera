extends SceneTree

# Iter 225 / Polish Team — UX polish smoke test.
#
# Verifies the two deliverables shipped by the Polish Team:
#   1. Ability cooldown chip strip in main.gd — _build_ability_cooldown_strip
#      builds an HBoxContainer with 4 chips, one per ability (LMB sword,
#      RMB blast, Q parry, SHIFT dash). Each chip's hero_field meta-prop
#      maps to the corresponding hero.gd cooldown var (read-only — we
#      cannot mutate hero.gd per Polish Team mandate).
#   2. Achievement viewer modal in main_menu.gd — _show_achievements_panel
#      builds a row per entry in GameState.ACHIEVEMENTS. Button is
#      injected into the CenterStack just below UPGRADES.
#
# Test pattern follows check_main_loads.gd — load script sources +
# verify structural invariants without instantiating into the SceneTree
# (which would require the full autoload stack — GameState, RunState,
# Audio, etc. — that the SceneTree-test harness doesn't bootstrap).

func _initialize() -> void:
	print("[polish225] init")
	await process_frame
	# ── A. main.gd ability cooldown chip strip ────────────────────────
	# Load + source-inspect. We confirm:
	#   • _build_ability_cooldown_strip and _update_ability_cooldown_chips
	#     exist as funcs
	#   • The specs array references all 4 expected hero fields
	#   • The strip is wired into _ready
	#   • The updater is wired into _process
	var main_script: Script = load("res://scripts/main.gd") as Script
	if main_script == null:
		printerr("FAIL: main.gd failed to load as Script")
		quit(1)
		return
	var src: String = main_script.source_code
	var required_main_helpers: Array = [
		"_build_ability_cooldown_strip",
		"_update_ability_cooldown_chips",
	]
	for h in required_main_helpers:
		if src.find("func " + h) < 0:
			printerr("FAIL: main.gd missing helper %s" % h)
			quit(1)
			return
	# All 4 hero fields referenced in the specs array.
	var required_fields: Array = [
		"_attack_cd", "_blast_cd", "_shield_cd", "_dash_strike_cd"
	]
	for f in required_fields:
		if src.find("\"" + f + "\"") < 0:
			printerr("FAIL: main.gd specs array missing field %s" % f)
			quit(1)
			return
	# The strip builder runs from _ready + the updater runs from _process.
	# Naive substring check: confirm the call sites exist.
	if src.find("_build_ability_cooldown_strip()") < 0:
		printerr("FAIL: main.gd never calls _build_ability_cooldown_strip()")
		quit(1)
		return
	if src.find("_update_ability_cooldown_chips()") < 0:
		printerr("FAIL: main.gd never calls _update_ability_cooldown_chips()")
		quit(1)
		return
	# Also verify the @onready cache + dict declarations land at module
	# scope (these are the storage the helpers depend on).
	if src.find("_ability_cd_strip") < 0 or src.find("_ability_cd_chips") < 0:
		printerr("FAIL: main.gd missing _ability_cd_strip / _ability_cd_chips state")
		quit(1)
		return
	print("[polish225] cooldown strip OK — helpers + state + call sites in place")
	# ── B. main_menu.gd achievement viewer ────────────────────────────
	var menu_script: Script = load("res://scripts/main_menu.gd") as Script
	if menu_script == null:
		printerr("FAIL: main_menu.gd failed to load as Script")
		quit(1)
		return
	var menu_src: String = menu_script.source_code
	var required_menu_helpers: Array = [
		"_inject_achievements_button",
		"_show_achievements_panel",
		"_build_achievement_row",
		"_close_achievements_panel",
		"_on_achievements_pressed",
	]
	for h in required_menu_helpers:
		if menu_src.find("func " + h) < 0:
			printerr("FAIL: main_menu.gd missing helper %s" % h)
			quit(1)
			return
	# Button-inject is wired from _ready.
	if menu_src.find("_inject_achievements_button()") < 0:
		printerr("FAIL: main_menu.gd never calls _inject_achievements_button()")
		quit(1)
		return
	# Data sanity — GameState.ACHIEVEMENTS exists, has entries, each
	# with name + description shape.
	if GameState.ACHIEVEMENTS.size() < 1:
		printerr("FAIL: GameState.ACHIEVEMENTS empty")
		quit(1)
		return
	for id in GameState.ACHIEVEMENTS.keys():
		var spec = GameState.ACHIEVEMENTS[id]
		if not (spec is Dictionary):
			printerr("FAIL: achievement %s spec is not Dictionary" % str(id))
			quit(1)
			return
		if not spec.has("name") or not spec.has("description"):
			printerr("FAIL: achievement %s missing name/description" % str(id))
			quit(1)
			return
	print(
		"[polish225] achievement viewer OK — %d achievements, 5 helpers, wired from _ready"
		% GameState.ACHIEVEMENTS.size()
	)
	print("[polish225] PASS")
	quit(0)
