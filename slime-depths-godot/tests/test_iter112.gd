extends SceneTree

# Iter 112 — Scene-transition fade-to-black / fade-from-black.
#
# Pre-iter-112 the menu → dungeon transition was a hard snap: AWAKEN press
# played its UI cue, the menu scene unloaded, room 1 loaded immediately.
# The 0.30s gap between cue and on-screen state-change felt disconnected.
# Same harsh snap on door-walk-through (room → room), on death-retry
# (death screen → room 1), and on death-menu (dungeon → main menu).
#
# Iter-112 adds a 0.25-0.30s fade-to-opaque-black on every outbound
# transition, paired with a 0.40-0.45s fade-from-black on every inbound
# scene's _ready. The ScreenFlash autoload — which already survives scene
# changes and owns a full-viewport ColorRect — gains two new public
# methods (fade_to_black + fade_from_black) that both build on the same
# rect. The transition cascade:
#
#   1. Source scene: button pressed → UI cue → `await fade_to_black` →
#      change_scene_to_file. Player sees the world dim out cleanly.
#   2. ScreenFlash autoload survives the swap; rect stays at opaque
#      black.
#   3. Destination scene._ready calls fade_from_black; rect tweens to
#      transparent. Player sees the new world fade up from black.
#
# Hooked transitions:
#   • main_menu AWAKEN / SETTINGS / QUIT
#   • settings_screen BACK (scene mode only — overlay mode skips, the
#     dungeon is alive underneath)
#   • death_screen RETRY → main._on_death_retry
#   • death_screen MAIN MENU → main._on_death_to_menu
#   • door walk-through → main.tscn or main_menu.tscn
#
# Destination fade-in:
#   • main.gd._ready
#   • main_menu.gd._ready
#   • settings_screen.gd._ready (scene mode only)
func _initialize() -> void:
	var ok := true

	# ═══ ScreenFlash gains fade_to_black + fade_from_black ═══
	var sf_src := FileAccess.get_file_as_string("res://scripts/screen_flash.gd")
	if "func fade_to_black" not in sf_src:
		push_error("FAIL: screen_flash.gd missing fade_to_black helper")
		ok = false
	if "func fade_from_black" not in sf_src:
		push_error("FAIL: screen_flash.gd missing fade_from_black helper")
		ok = false
	if "FADE_BLACK" not in sf_src:
		push_error("FAIL: screen_flash.gd missing FADE_BLACK constant")
		ok = false
	if ok:
		print("OK ScreenFlash has fade_to_black + fade_from_black")

	# ═══ main_menu.gd uses fades on outbound + inbound ═══
	var menu_src := FileAccess.get_file_as_string("res://scripts/main_menu.gd")
	if "await ScreenFlash.fade_to_black" not in menu_src:
		push_error("FAIL: main_menu.gd doesn't await fade_to_black before scene change")
		ok = false
	if "ScreenFlash.fade_from_black" not in menu_src:
		push_error("FAIL: main_menu.gd doesn't call fade_from_black on _ready")
		ok = false
	if "_transitioning" not in menu_src:
		push_error("FAIL: main_menu.gd missing _transitioning guard")
		ok = false
	# Count fade_to_black call sites — should be 3 (begin / settings / quit).
	var menu_fade_calls: int = 0
	for line in menu_src.split("\n"):
		if "await ScreenFlash.fade_to_black" in line:
			menu_fade_calls += 1
	if menu_fade_calls < 3:
		push_error("FAIL: main_menu has %d fade_to_black calls, expected 3 (begin/settings/quit)" % menu_fade_calls)
		ok = false
	else:
		print("OK main_menu.gd: fade_from_black on _ready + %d fade_to_black on press" % menu_fade_calls)

	# ═══ main.gd fades from black on _ready + on death paths ═══
	var main_src := FileAccess.get_file_as_string("res://scripts/main.gd")
	if "ScreenFlash.fade_from_black" not in main_src:
		push_error("FAIL: main.gd missing fade_from_black on _ready")
		ok = false
	if not main_src.contains("await ScreenFlash.fade_to_black(0.30)"):
		push_error("FAIL: main.gd death-retry/menu paths don't fade to black")
		ok = false
	# At least 2 fade_to_black calls — one for retry, one for menu.
	var main_fade_calls: int = 0
	for line in main_src.split("\n"):
		if "await ScreenFlash.fade_to_black" in line:
			main_fade_calls += 1
	if main_fade_calls < 2:
		push_error("FAIL: main.gd has %d fade_to_black calls, expected ≥2 (retry+menu)" % main_fade_calls)
		ok = false
	else:
		print("OK main.gd: fade_from_black on _ready + %d fade_to_black on death paths" % main_fade_calls)

	# ═══ door.gd fades before scene change ═══
	var door_src := FileAccess.get_file_as_string("res://scripts/door.gd")
	if "await ScreenFlash.fade_to_black" not in door_src:
		push_error("FAIL: door.gd doesn't fade to black before room transition")
		ok = false
	# Should NOT have the bare create_timer(0.15) wait anymore
	if door_src.contains("await get_tree().create_timer(0.15).timeout"):
		push_error("FAIL: door.gd still uses the 0.15s bare timer (should be fade)")
		ok = false
	if ok:
		print("OK door.gd replaces bare 0.15s timer with fade_to_black")

	# ═══ settings_screen.gd fades on back (scene mode) ═══
	var settings_src := FileAccess.get_file_as_string("res://scripts/settings_screen.gd")
	if "ScreenFlash.fade_from_black" not in settings_src:
		push_error("FAIL: settings_screen.gd missing fade_from_black on _ready")
		ok = false
	if "await ScreenFlash.fade_to_black" not in settings_src:
		push_error("FAIL: settings_screen.gd doesn't fade on back press")
		ok = false
	# Should still respect _is_overlay (no fade when opened as overlay)
	if "if not _is_overlay" not in settings_src:
		push_error("FAIL: settings_screen.gd should gate fade_from_black on overlay state")
		ok = false
	if ok:
		print("OK settings_screen.gd has fade_from_black (scene mode) + fade_to_black on back")

	# ═══ Runtime: instantiate ScreenFlash autoload and call the fades ═══
	var sf_scene = load("res://scripts/screen_flash.gd")
	if sf_scene == null:
		push_error("FAIL: screen_flash.gd no longer loads as Script")
		ok = false
	else:
		# Instantiate the autoload-style CanvasLayer via the script
		var sf_instance = sf_scene.new()
		root.add_child(sf_instance)
		# Wait a frame so _ready runs and builds _rect
		await process_frame
		if not sf_instance.has_method("fade_to_black"):
			push_error("FAIL: ScreenFlash instance missing fade_to_black method")
			ok = false
		if not sf_instance.has_method("fade_from_black"):
			push_error("FAIL: ScreenFlash instance missing fade_from_black method")
			ok = false
		# Calling fade_from_black should set the rect to black-then-tween-clear.
		# We just verify the method calls don't crash + the rect is non-null.
		sf_instance.fade_from_black(0.10)
		await process_frame
		var rect = sf_instance.get("_rect")
		if rect == null:
			push_error("FAIL: ScreenFlash _rect is null after _ready")
			ok = false
		else:
			print("OK runtime fade_from_black ran without crash")
		sf_instance.queue_free()

	if ok:
		print("=== ITER 112 INTEGRATION PASSED ===")
	else:
		print("=== ITER 112 INTEGRATION FAILED ===")
	quit(0 if ok else 1)
