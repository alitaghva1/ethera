extends SceneTree

# Iter 241 / Polish Team R5 patch — Floor Modifiers modal regression test.
#
# The iter-239 pre-run Modifiers modal (ENTER THE DEPTHS) was built BEFORE
# iter-240 introduced the shared _build_themed_modal_panel helper. Same
# regression iter-240 fixed for BINDINGS + ACHIEVEMENTS:
#   • No backing panel → main-menu title + 5 menu buttons bled through
#     the modal text.
#   • Toggle buttons all looked identical — no visual delta between
#     ACTIVE and INACTIVE rows.
#   • Multiplier line was a plain Label, not the gold-bordered chip the
#     other modals use for their currency surface.
#   • BEGIN / NO MODIFIERS / CANCEL all rendered as default Buttons.
#
# This test verifies (source-grep) that:
#   1. _show_modifiers_modal calls _build_themed_modal_panel (the same
#      doctrine iter-240 enforces for the other two modals).
#   2. Toggle buttons use _style_modal_button with "affordable" /
#      "unaffordable" branches (state-aware styling).
#   3. The three action buttons (BEGIN / NO MODIFIERS / CANCEL) all
#      route through _style_modal_button.
#   4. The multiplier chip helper exists and references MODAL_BUTTON_GOLD
#      (the gold-bordered pill that replaces the plain "Reward: …" line).
#   5. ESC keybind closes the modifiers modal (already wired in iter-240's
#      _unhandled_input — verify the modifiers branch still leads).
#   6. _on_modifiers_cancel / _on_modifiers_skip / _on_modifiers_confirm
#      still exist (iter-239 contract preserved).
#
# Runtime assertion (not just source-grep):
#   7. Build the modal in a SceneTree-attached MainMenu instance,
#      confirm the panel root carries the PanelContainer + ColorRect
#      scrim, and the 5 modifier catalog rows render as HBoxContainers
#      with the expected name labels (HEAT WAVE, SWIFT FOES, etc.).

# Lazy load (not preload) — preloading a scene that itself references
# the ScreenFlash autoload at module-load time can trip a compile-error
# race if the autoload registration order isn't yet complete for the
# script-mode SceneTree. Same defensive pattern as snapshot_main_menu.gd.

func _initialize() -> void:
	print("[polish241] init")
	await process_frame
	# ── 1. _build_themed_modal_panel is invoked by the modifiers modal ──
	var menu_script: Script = load("res://scripts/main_menu.gd") as Script
	if menu_script == null:
		printerr("FAIL: main_menu.gd failed to load")
		quit(1)
		return
	var src: String = menu_script.source_code
	# Locate the modifiers modal builder.
	var modifiers_fn_idx: int = src.find("func _show_modifiers_modal")
	if modifiers_fn_idx < 0:
		printerr("FAIL: main_menu.gd missing func _show_modifiers_modal")
		quit(1)
		return
	# The next function definition after _show_modifiers_modal — slice
	# out the body so we can verify it (specifically) calls the helper.
	var next_fn_idx: int = src.find("\nfunc ", modifiers_fn_idx + 1)
	if next_fn_idx < 0:
		next_fn_idx = src.length()
	var modifiers_body: String = src.substr(modifiers_fn_idx, next_fn_idx - modifiers_fn_idx)
	if modifiers_body.find("_build_themed_modal_panel(") < 0:
		printerr("FAIL: _show_modifiers_modal does not call _build_themed_modal_panel — iter-241 doctrine missed")
		quit(1)
		return
	print("[polish241] _show_modifiers_modal routes through _build_themed_modal_panel")
	# ── 2. Toggle buttons use state-styled _style_modal_button ─────────
	var row_fn_idx: int = src.find("func _build_modifier_row")
	if row_fn_idx < 0:
		printerr("FAIL: main_menu.gd missing func _build_modifier_row")
		quit(1)
		return
	var row_end_idx: int = src.find("\nfunc ", row_fn_idx + 1)
	if row_end_idx < 0:
		row_end_idx = src.length()
	var row_body: String = src.substr(row_fn_idx, row_end_idx - row_fn_idx)
	if row_body.find("_style_modal_button(btn, \"affordable\")") < 0:
		printerr("FAIL: _build_modifier_row does not style ACTIVE toggle with 'affordable' state")
		quit(1)
		return
	if row_body.find("_style_modal_button(btn, \"unaffordable\")") < 0:
		printerr("FAIL: _build_modifier_row does not style INACTIVE toggle with 'unaffordable' state")
		quit(1)
		return
	print("[polish241] toggle buttons use state-styled _style_modal_button (active=affordable, inactive=unaffordable)")
	# ── 3. Action buttons (BEGIN/SKIP/CANCEL) styled via the helper ────
	# All three should appear in the modifiers builder body — count
	# occurrences of _style_modal_button in that slice.
	var style_calls_in_modal: int = 0
	var search_idx: int = 0
	while true:
		var hit: int = modifiers_body.find("_style_modal_button(", search_idx)
		if hit < 0:
			break
		style_calls_in_modal += 1
		search_idx = hit + 1
	if style_calls_in_modal < 3:
		printerr(
			"FAIL: _show_modifiers_modal calls _style_modal_button %d times — expected ≥ 3 (BEGIN/SKIP/CANCEL)"
			% style_calls_in_modal
		)
		quit(1)
		return
	print("[polish241] action buttons (BEGIN/SKIP/CANCEL) all routed through _style_modal_button (%d calls)" % style_calls_in_modal)
	# ── 4. Multiplier chip helper exists with gold-border styling ──────
	if src.find("func _build_modifier_multiplier_chip") < 0:
		printerr("FAIL: main_menu.gd missing func _build_modifier_multiplier_chip — multiplier chip regression")
		quit(1)
		return
	# The chip should reference MODAL_BUTTON_GOLD (the gold border the
	# bindings ETHER chip also uses — visual consistency).
	var chip_fn_idx: int = src.find("func _build_modifier_multiplier_chip")
	var chip_end_idx: int = src.find("\nfunc ", chip_fn_idx + 1)
	if chip_end_idx < 0:
		chip_end_idx = src.length()
	var chip_body: String = src.substr(chip_fn_idx, chip_end_idx - chip_fn_idx)
	if chip_body.find("MODAL_BUTTON_GOLD") < 0:
		printerr("FAIL: _build_modifier_multiplier_chip does not use MODAL_BUTTON_GOLD border")
		quit(1)
		return
	if chip_body.find("MODAL_TITLE_COLOR") < 0:
		printerr("FAIL: _build_modifier_multiplier_chip does not use MODAL_TITLE_COLOR for the multiplier text")
		quit(1)
		return
	print("[polish241] multiplier chip helper uses MODAL_BUTTON_GOLD border + MODAL_TITLE_COLOR text")
	# ── 5. ESC keybind still closes the modifiers modal ────────────────
	# iter-240 already wired this; verify the modifiers branch survives.
	var unhandled_idx: int = src.find("func _unhandled_input")
	if unhandled_idx < 0:
		printerr("FAIL: main_menu.gd missing func _unhandled_input")
		quit(1)
		return
	var unhandled_end_idx: int = src.find("\nfunc ", unhandled_idx + 1)
	if unhandled_end_idx < 0:
		unhandled_end_idx = src.length()
	var unhandled_body: String = src.substr(unhandled_idx, unhandled_end_idx - unhandled_idx)
	if unhandled_body.find("_modifiers_panel") < 0:
		printerr("FAIL: _unhandled_input does not reference _modifiers_panel (ESC keybind regression)")
		quit(1)
		return
	if unhandled_body.find("_on_modifiers_cancel") < 0:
		printerr("FAIL: _unhandled_input does not call _on_modifiers_cancel on ESC")
		quit(1)
		return
	print("[polish241] ESC keybind still wired to _on_modifiers_cancel")
	# ── 6. iter-239 modal API contract preserved ───────────────────────
	for required_fn in [
		"_on_modifiers_confirm",
		"_on_modifiers_skip",
		"_on_modifiers_cancel",
		"_close_modifiers_modal_internal",
		"_on_modifier_toggle",
	]:
		if src.find("func " + required_fn) < 0:
			printerr("FAIL: main_menu.gd missing func %s (iter-239 contract)" % required_fn)
			quit(1)
			return
	print("[polish241] iter-239 modal API contract preserved (5 callbacks intact)")
	# ── 7. Runtime: instantiate the menu + build the modal + inspect ───
	# Verify the actual scene tree matches the source-grep claims.
	# Reset active set so we get a clean modal.
	var gs: Node = root.get_node_or_null("/root/GameState")
	if gs == null:
		printerr("FAIL: GameState autoload missing")
		quit(1)
		return
	gs.set("active_floor_modifiers", [] as Array[String])
	var menu_scene: PackedScene = load("res://scenes/main_menu.tscn") as PackedScene
	if menu_scene == null:
		printerr("FAIL: main_menu.tscn failed to load")
		quit(1)
		return
	var menu_inst: Node = menu_scene.instantiate()
	root.add_child(menu_inst)
	await process_frame
	await process_frame
	# Call the modal builder directly (BEGIN press would route through
	# the rest of the start_dungeon_run flow; we only want the modal).
	menu_inst.call("_show_modifiers_modal")
	await process_frame
	var modal_root: Control = menu_inst.get("_modifiers_panel")
	if modal_root == null or not is_instance_valid(modal_root):
		printerr("FAIL: _modifiers_panel is null after _show_modifiers_modal — modal failed to attach")
		quit(1)
		return
	# Find the PanelContainer (the gold-bordered backing panel — the
	# heart of the iter-240 doctrine the iter-239 modal was missing).
	var has_panel_container: bool = _find_first_of_type(modal_root, "PanelContainer") != null
	if not has_panel_container:
		printerr("FAIL: modal tree has no PanelContainer — backing panel regression")
		quit(1)
		return
	# Find the scrim (ColorRect).
	var has_scrim: bool = _find_first_of_type(modal_root, "ColorRect") != null
	if not has_scrim:
		printerr("FAIL: modal tree has no ColorRect scrim — backing panel regression")
		quit(1)
		return
	print("[polish241] modal scene tree carries PanelContainer + ColorRect scrim (iter-240 doctrine)")
	# Verify all 5 modifier rows render — count Buttons whose text is
	# either ACTIVE or INACTIVE (one per modifier row, after iter-241's
	# rewrite the toggle is always one of those two strings).
	var toggles_found: int = _count_toggle_buttons(modal_root)
	if toggles_found != 5:
		printerr(
			"FAIL: modal rendered %d toggle buttons (ACTIVE/INACTIVE) — expected 5 (one per catalog entry)"
			% toggles_found
		)
		quit(1)
		return
	print("[polish241] modal renders 5 modifier toggle buttons (matches FloorModifiers.catalog().size())")
	# Verify the 5 expected modifier labels (HEAT WAVE, SWIFT FOES,
	# THICKER BLOOD, DARKER PATHS, CLOCKED) are present in the tree.
	var label_texts: Array[String] = _collect_label_texts(modal_root)
	var expected_labels: Array[String] = [
		"HEAT WAVE", "SWIFT FOES", "THICKER BLOOD", "DARKER PATHS", "CLOCKED",
	]
	for needle in expected_labels:
		if not (needle in label_texts):
			printerr(
				"FAIL: modal missing label '%s' — modifier row not rendered. Labels seen: %s"
				% [needle, str(label_texts)]
			)
			quit(1)
			return
	print("[polish241] all 5 modifier name labels render (HEAT WAVE / SWIFT FOES / THICKER BLOOD / DARKER PATHS / CLOCKED)")
	# Simulate ESC press via _unhandled_input.
	var esc_event: InputEventKey = InputEventKey.new()
	esc_event.pressed = true
	esc_event.physical_keycode = KEY_ESCAPE
	menu_inst.call("_unhandled_input", esc_event)
	await process_frame
	var modal_after_esc: Control = menu_inst.get("_modifiers_panel")
	if modal_after_esc != null and is_instance_valid(modal_after_esc):
		printerr("FAIL: _modifiers_panel still valid after ESC — keybind didn't close the modal")
		quit(1)
		return
	print("[polish241] ESC closes the modal at runtime")
	# Clean up.
	menu_inst.queue_free()
	await process_frame
	print("[polish241] PASS — Floor Modifiers modal adopts iter-240 panel doctrine")
	quit(0)

# Recursively find the first descendant of `node` whose class_name
# matches `type_name`. Returns null if none found.
func _find_first_of_type(node: Node, type_name: String) -> Node:
	if node.get_class() == type_name:
		return node
	for child in node.get_children():
		var found: Node = _find_first_of_type(child, type_name)
		if found != null:
			return found
	return null

# Count Buttons whose .text is "ACTIVE" or "INACTIVE" (one per modifier row).
func _count_toggle_buttons(node: Node) -> int:
	var count: int = 0
	if node is Button:
		var btn: Button = node as Button
		if btn.text == "ACTIVE" or btn.text == "INACTIVE":
			count += 1
	for child in node.get_children():
		count += _count_toggle_buttons(child)
	return count

# Recursively collect all Label.text values for source-grep-style assertions.
func _collect_label_texts(node: Node) -> Array[String]:
	var out: Array[String] = []
	if node is Label:
		out.append((node as Label).text)
	for child in node.get_children():
		out.append_array(_collect_label_texts(child))
	return out
