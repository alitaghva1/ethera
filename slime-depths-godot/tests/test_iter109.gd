extends SceneTree

# Iter 109 — two more audit-team findings: ROOM #4 + MENU #3.
#
# ROOM #4: Point-light shadows. Pre-iter-109 every PointLight2D had
# `shadow_enabled = false` and no LightOccluder2D existed anywhere —
# torches lit pillars from one side and the FAR side identically.
# Iter-109 turns shadow_enabled on for the torch lights and gives
# pillars an octagonal OccluderPolygon2D matching their 18-px collision.
# Result: pillars now cast long shadows across the floor when a torch
# sits behind them relative to the camera. Real depth perception
# replaces the pre-iter-109 "flat-darkened void with stones placed
# on it" feel.
#
# MENU #3: UI hover/press SFX. Pre-iter-109 the start screen was
# audibly mute. Iter-109 adds two new SOUND_CONFIGS entries
# (ui_hover / ui_press), a public Audio.play_ui_cue helper, and wires
# button hover + press in main_menu.gd. Keyboard focus_entered fires
# the same hover cue so controller / keyboard navigation gets the
# audio feedback too.
func _initialize() -> void:
	var ok := true

	# ═══ ROOM #4 — Light occluders + shadows ═══
	var pillar_src := FileAccess.get_file_as_string("res://scenes/pillar.tscn")
	if "OccluderPolygon2D" not in pillar_src:
		push_error("FAIL: pillar.tscn missing OccluderPolygon2D resource")
		ok = false
	if "name=\"LightOccluder2D\"" not in pillar_src:
		push_error("FAIL: pillar.tscn missing LightOccluder2D node")
		ok = false
	if ok:
		print("OK pillar.tscn has LightOccluder2D + OccluderPolygon2D")

	var torch_src := FileAccess.get_file_as_string("res://scenes/torch.tscn")
	# torch.tscn must enable shadows. Pre-iter-109: shadow_enabled = false.
	if not torch_src.contains("shadow_enabled = true"):
		push_error("FAIL: torch.tscn PointLight2D doesn't enable shadows")
		ok = false
	if not torch_src.contains("shadow_color"):
		push_error("FAIL: torch.tscn missing shadow_color tuning")
		ok = false
	if ok:
		print("OK torch.tscn PointLight2D casts soft shadows")

	# Runtime — instantiate a pillar + verify it has a LightOccluder2D child
	var pillar_scene := load("res://scenes/pillar.tscn") as PackedScene
	if pillar_scene == null:
		push_error("FAIL: pillar.tscn no longer loads")
		ok = false
	else:
		var p: Node = pillar_scene.instantiate()
		root.add_child(p)
		var occluder: LightOccluder2D = null
		for child in p.get_children():
			if child is LightOccluder2D:
				occluder = child
				break
		if occluder == null:
			push_error("FAIL: instantiated pillar has no LightOccluder2D child")
			ok = false
		elif occluder.occluder == null:
			push_error("FAIL: pillar LightOccluder2D has no OccluderPolygon2D resource")
			ok = false
		else:
			print("OK instantiated pillar carries a working LightOccluder2D")
		p.queue_free()

	# ═══ MENU #3 — UI hover/press SFX ═══
	var audio_src := FileAccess.get_file_as_string("res://scripts/audio.gd")
	if "\"ui_hover\"" not in audio_src:
		push_error("FAIL: audio.gd missing ui_hover SOUND_CONFIG")
		ok = false
	if "\"ui_press\"" not in audio_src:
		push_error("FAIL: audio.gd missing ui_press SOUND_CONFIG")
		ok = false
	if "func play_ui_cue" not in audio_src:
		push_error("FAIL: audio.gd missing public play_ui_cue helper")
		ok = false
	if ok:
		print("OK audio.gd has ui_hover + ui_press SOUND_CONFIGS + play_ui_cue helper")

	# main_menu.gd should invoke play_ui_cue on hover + each pressed handler.
	var menu_src := FileAccess.get_file_as_string("res://scripts/main_menu.gd")
	if not menu_src.contains("Audio.play_ui_cue(\"ui_hover\""):
		push_error("FAIL: main_menu.gd doesn't play ui_hover on button hover")
		ok = false
	if not menu_src.contains("Audio.play_ui_cue(\"ui_press\""):
		push_error("FAIL: main_menu.gd doesn't play ui_press on button activation")
		ok = false
	# Count distinct press call sites — should be 3 (begin / settings / quit).
	var press_count: int = 0
	for line in menu_src.split("\n"):
		var t: String = String(line).strip_edges()
		if t.begins_with("#"):
			continue
		if "Audio.play_ui_cue(\"ui_press\"" in line:
			press_count += 1
	if press_count < 3:
		push_error("FAIL: only %d ui_press call sites, expected ≥3 (begin / settings / quit)" % press_count)
		ok = false
	else:
		print("OK main_menu.gd wires ui_press at %d button-press sites" % press_count)

	if ok:
		print("=== ITER 109 INTEGRATION PASSED ===")
	else:
		print("=== ITER 109 INTEGRATION FAILED ===")
	quit(0 if ok else 1)
