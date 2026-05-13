extends SceneTree

# Iter 114 — UI sound + scene-transition fade consistency.
#
# Iter-109 wired ui_hover + ui_press on the main_menu. Iter-112 wired
# the fade-to-black scene-transition pattern (menu, settings, door,
# death-paths). Both passes left the OTHER three UI screens audibly
# silent and (in pause's case) hard-cutting to the main menu on QUIT:
#
#   • pause_screen.gd: no hover / press cues on any button. The QUIT
#     button hard-changed scenes (no fade).
#   • death_screen.gd: no hover / press cues on RETRY or MAIN MENU.
#     (Fade was already wired on the host side via main._on_death_*.)
#   • settings_screen.gd: no hover cue on BACK + no press cue on BACK.
#     (Fade was already wired in iter-112 for the scene-mode exit.)
#
# Iter-114 closes the gap so all four UI screens share the same audio
# + visual transition vocabulary:
#
#   - ui_hover (-8 dB) on mouse_entered AND focus_entered (so keyboard
#     navigation gets the same beat).
#   - ui_press (-2 dB) on every button press handler.
#   - pause_screen QUIT TO MENU adds the fade_to_black before the
#     scene change.
func _initialize() -> void:
	var ok := true

	# ═══ pause_screen.gd ═══
	var pause_src := FileAccess.get_file_as_string("res://scripts/pause_screen.gd")
	if "Audio.play_ui_cue(\"ui_hover\"" not in pause_src:
		push_error("FAIL: pause_screen.gd missing ui_hover cue")
		ok = false
	if "Audio.play_ui_cue(\"ui_press\"" not in pause_src:
		push_error("FAIL: pause_screen.gd missing ui_press cue")
		ok = false
	if "await ScreenFlash.fade_to_black" not in pause_src:
		push_error("FAIL: pause_screen.gd QUIT doesn't fade to black before scene change")
		ok = false
	# Should have 3 ui_press call sites (resume / settings / quit)
	var pause_press_count: int = 0
	for line in pause_src.split("\n"):
		if "Audio.play_ui_cue(\"ui_press\"" in line:
			pause_press_count += 1
	if pause_press_count < 3:
		push_error("FAIL: pause_screen has %d ui_press calls, expected 3 (resume/settings/quit)" % pause_press_count)
		ok = false
	else:
		print("OK pause_screen.gd: ui_hover + %d ui_press sites + fade_to_black on QUIT" % pause_press_count)

	# ═══ death_screen.gd ═══
	var death_src := FileAccess.get_file_as_string("res://scripts/death_screen.gd")
	if "Audio.play_ui_cue(\"ui_hover\"" not in death_src:
		push_error("FAIL: death_screen.gd missing ui_hover cue")
		ok = false
	if "Audio.play_ui_cue(\"ui_press\"" not in death_src:
		push_error("FAIL: death_screen.gd missing ui_press cue")
		ok = false
	# Two press sites (RETRY + MAIN MENU)
	var death_press_count: int = 0
	for line in death_src.split("\n"):
		if "Audio.play_ui_cue(\"ui_press\"" in line:
			death_press_count += 1
	if death_press_count < 2:
		push_error("FAIL: death_screen has %d ui_press calls, expected 2 (retry+menu)" % death_press_count)
		ok = false
	else:
		print("OK death_screen.gd: ui_hover + %d ui_press sites (retry/menu)" % death_press_count)

	# ═══ settings_screen.gd ═══
	var settings_src := FileAccess.get_file_as_string("res://scripts/settings_screen.gd")
	if "Audio.play_ui_cue(\"ui_hover\"" not in settings_src:
		push_error("FAIL: settings_screen.gd missing ui_hover on BACK button")
		ok = false
	if "Audio.play_ui_cue(\"ui_press\"" not in settings_src:
		push_error("FAIL: settings_screen.gd missing ui_press on BACK button")
		ok = false
	if ok:
		print("OK settings_screen.gd: ui_hover + ui_press on BACK")

	# ═══ Runtime: ensure all three scenes still instantiate cleanly ═══
	# (the audio.gd autoload may or may not be present in test context —
	# play_ui_cue is a no-op if Audio isn't registered, but we just check
	# instantiation doesn't crash.)
	for path in ["res://scenes/pause_screen.tscn", "res://scenes/death_screen.tscn", "res://scenes/settings_screen.tscn"]:
		var scene = load(path) as PackedScene
		if scene == null:
			push_error("FAIL: %s no longer loads as PackedScene" % path)
			ok = false
	if ok:
		print("OK all 3 UI scenes still load as PackedScenes")

	if ok:
		print("=== ITER 114 INTEGRATION PASSED ===")
	else:
		print("=== ITER 114 INTEGRATION FAILED ===")
	quit(0 if ok else 1)
