extends SceneTree

# Iter 71 integration test — three parallel tracks + central-controller
# polish (overlay-mode settings).
#
# Track A: pause menu (ESC handler + new pause_screen scene)
# Track B: in-run pickup banner
# Track C: floor-clear / boss-clear celebration burst
# Polish:  pause→settings is an overlay (not a destructive scene change)
func _initialize() -> void:
	var ok := true

	# ── Track A: pause menu ──────────────────────────────────────
	var ps := load("res://scenes/pause_screen.tscn")
	if ps == null:
		push_error("FAIL: pause_screen.tscn failed to load")
		ok = false
	else:
		print("OK pause_screen.tscn loads")

	var main_src := FileAccess.get_file_as_string("res://scripts/main.gd")
	if not main_src.contains("PAUSE_SCREEN_SCENE"):
		push_error("FAIL: main.gd missing PAUSE_SCREEN_SCENE preload")
		ok = false
	else:
		print("OK main.gd preloads PAUSE_SCREEN_SCENE")

	if not main_src.contains("KEY_ESCAPE"):
		push_error("FAIL: main.gd missing KEY_ESCAPE handler for pause")
		ok = false
	else:
		print("OK main.gd has KEY_ESCAPE handler")

	# Multi-mount guard (don't stack pause screens)
	if not main_src.contains("has_node(\"PauseScreen\")"):
		push_error("FAIL: main.gd missing PauseScreen multi-mount guard")
		ok = false
	else:
		print("OK main.gd guards against double-pause-mount")

	# ── Track B: pickup banner ───────────────────────────────────
	var pb := load("res://scenes/pickup_banner.tscn")
	if pb == null:
		push_error("FAIL: pickup_banner.tscn failed to load")
		ok = false
	else:
		print("OK pickup_banner.tscn loads")

	if not main_src.contains("PickupBanner.spawn"):
		push_error("FAIL: main.gd doesn't call PickupBanner.spawn")
		ok = false
	else:
		print("OK main.gd calls PickupBanner.spawn in _on_pickup_claimed")

	# pickup_banner uses iter-67 sizing fix (custom_minimum_size + await)
	var pb_src := FileAccess.get_file_as_string("res://scripts/pickup_banner.gd")
	if not pb_src.contains("custom_minimum_size"):
		push_error("FAIL: pickup_banner.gd doesn't pin custom_minimum_size")
		ok = false
	elif not pb_src.contains("await get_tree().process_frame"):
		push_error("FAIL: pickup_banner.gd doesn't await process_frame")
		ok = false
	else:
		print("OK pickup_banner.gd uses iter-67 sizing pattern")

	# Mythic special-case wired
	if not pb_src.contains("mythic"):
		push_error("FAIL: pickup_banner.gd doesn't special-case mythic tier")
		ok = false
	else:
		print("OK pickup_banner.gd handles mythic tier")

	# ── Track C: floor-clear burst ───────────────────────────────
	var fc := load("res://scenes/fx/floor_clear_burst.tscn")
	if fc == null:
		push_error("FAIL: floor_clear_burst.tscn failed to load")
		ok = false
	else:
		print("OK floor_clear_burst.tscn loads")

	if not main_src.contains("FloorClearBurst") and not main_src.contains("floor_clear_burst"):
		push_error("FAIL: main.gd doesn't reference floor_clear_burst")
		ok = false
	else:
		print("OK main.gd hooks floor_clear_burst")

	if not main_src.contains("_room_had_boss"):
		push_error("FAIL: main.gd missing _room_had_boss helper")
		ok = false
	else:
		print("OK main.gd has _room_had_boss helper")

	# ── Polish: pause→settings overlay ────────────────────────────
	var pause_src := FileAccess.get_file_as_string("res://scripts/pause_screen.gd")
	if not pause_src.contains("SettingsOverlay"):
		push_error("FAIL: pause_screen.gd doesn't open settings as overlay")
		ok = false
	elif not pause_src.contains("_is_overlay"):
		push_error("FAIL: pause_screen.gd doesn't set _is_overlay flag")
		ok = false
	else:
		print("OK pause_screen.gd opens settings as overlay child")

	var settings_src := FileAccess.get_file_as_string("res://scripts/settings_screen.gd")
	if not settings_src.contains("_is_overlay"):
		push_error("FAIL: settings_screen.gd doesn't have _is_overlay field")
		ok = false
	elif not settings_src.contains("queue_free()"):
		push_error("FAIL: settings_screen.gd doesn't queue_free in overlay mode")
		ok = false
	else:
		print("OK settings_screen.gd queue_frees in overlay mode")

	# ESC chain: pause defers to overlay when present
	if not pause_src.contains("has_node(\"SettingsOverlay\")"):
		push_error("FAIL: pause_screen.gd ESC handler doesn't defer to overlay")
		ok = false
	else:
		print("OK pause_screen ESC defers to SettingsOverlay when present")

	if ok:
		print("=== ITER 71 INTEGRATION PASSED ===")
	else:
		print("=== ITER 71 INTEGRATION FAILED ===")
	quit(0 if ok else 1)
