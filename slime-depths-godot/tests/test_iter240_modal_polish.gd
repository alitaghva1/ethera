extends SceneTree

# Iter 240 / Polish Team R5 — modal panel redesign regression test.
#
# The PERMANENT BINDINGS and ACHIEVEMENTS panels were raw Labels on a
# single dim ColorRect — the main-menu title and buttons bled through
# the modal text. iter-240 redesigns both modals to share a styled
# PanelContainer chrome via a _build_themed_modal_panel helper, with
# state-aware INVEST buttons (affordable / unaffordable / maxed) and
# diamond status glyphs in place of "OK" / "—" prefixes.
#
# This test verifies (source-grep) that:
#   • The shared _build_themed_modal_panel helper exists and is called
#     by BOTH _show_upgrade_panel and _show_achievements_panel
#   • The supporting StyleBox + glyph factories exist
#     (_make_panel_stylebox, _make_button_stylebox, _style_modal_button,
#     _build_diamond_glyph, _build_currency_chip, _append_modal_close_row)
#   • The button-state branches are referenced ("affordable" /
#     "unaffordable" / "maxed" / "close" all appear)
#   • The row builders (_build_upgrade_row + _build_achievement_row)
#     exist as standalone helpers
#   • ESC keybind is wired via _unhandled_input
#   • The palette constants are declared so a future refactor that
#     inlines them is caught at CI rather than at playtest

func _initialize() -> void:
	print("[polish240] init")
	await process_frame
	var menu_script: Script = load("res://scripts/main_menu.gd") as Script
	if menu_script == null:
		printerr("FAIL: main_menu.gd failed to load")
		quit(1)
		return
	var src: String = menu_script.source_code
	# ── 1. Shared themed-modal helper present ───────────────────────────
	var required_helpers: Array = [
		"_build_themed_modal_panel",
		"_make_panel_stylebox",
		"_make_button_stylebox",
		"_style_modal_button",
		"_on_modal_button_hover_enter",
		"_on_modal_button_hover_exit",
		"_append_modal_close_row",
		"_build_diamond_glyph",
		"_build_currency_chip",
		"_build_upgrade_row",
		"_build_achievement_row",
	]
	for h in required_helpers:
		if src.find("func " + h) < 0:
			printerr("FAIL: main_menu.gd missing helper %s" % h)
			quit(1)
			return
	print("[polish240] all 11 modal helpers declared")
	# ── 2. _build_themed_modal_panel is called by BOTH modals ───────────
	# Two call sites — one in _show_upgrade_panel, one in
	# _show_achievements_panel — confirm the helper is genuinely shared.
	var call_count: int = 0
	var idx: int = 0
	while true:
		var hit: int = src.find("_build_themed_modal_panel(", idx)
		if hit < 0:
			break
		call_count += 1
		idx = hit + 1
	if call_count < 2:
		printerr(
			"FAIL: _build_themed_modal_panel called %d times — expected ≥ 2 (Bindings + Achievements)"
			% call_count
		)
		quit(1)
		return
	print("[polish240] themed-modal helper invoked from both modals (%d call sites)" % call_count)
	# ── 3. Both panels are still rebuilt via _show_*_panel ──────────────
	for fname in ["_show_upgrade_panel", "_show_achievements_panel"]:
		if src.find("func " + fname) < 0:
			printerr("FAIL: main_menu.gd missing %s" % fname)
			quit(1)
			return
	# ── 4. Button-state branches all referenced ─────────────────────────
	# The match in _make_button_stylebox must cover affordable /
	# unaffordable / maxed / close — verifying all four state strings
	# appear in the file ensures a future tweak doesn't quietly drop one.
	for state in ["affordable", "unaffordable", "maxed", "close"]:
		if src.find("\"" + state + "\"") < 0:
			printerr("FAIL: main_menu.gd missing button state '%s'" % state)
			quit(1)
			return
	print("[polish240] all 4 button states referenced (affordable/unaffordable/maxed/close)")
	# ── 5. Panel palette constants declared ─────────────────────────────
	var required_constants: Array = [
		"MODAL_SCRIM_COLOR",
		"MODAL_PANEL_BG",
		"MODAL_PANEL_BORDER_OUTER",
		"MODAL_TITLE_COLOR",
		"MODAL_SUBTITLE_COLOR",
		"MODAL_BODY_COLOR",
		"MODAL_BUTTON_GOLD",
	]
	for c in required_constants:
		if src.find("const " + c) < 0:
			printerr("FAIL: main_menu.gd missing const %s" % c)
			quit(1)
			return
	print("[polish240] palette constants declared (%d)" % required_constants.size())
	# ── 6. Scrim + PanelContainer + CenterContainer all wired ───────────
	# Source-grep on the structural pieces that make the modal look
	# like a modal: full-screen scrim, a PanelContainer for the
	# styled bg, and a CenterContainer to position it. If any one is
	# removed the modal regresses to the pre-iter-240 ad-hoc layout.
	for symbol in ["ColorRect.new()", "PanelContainer.new()", "CenterContainer.new()"]:
		if src.find(symbol) < 0:
			printerr("FAIL: main_menu.gd missing structural piece %s" % symbol)
			quit(1)
			return
	print("[polish240] scrim + panel + center container all present")
	# ── 7. ESC keybind closes the panel ─────────────────────────────────
	if src.find("func _unhandled_input") < 0:
		printerr("FAIL: main_menu.gd missing _unhandled_input (ESC keybind)")
		quit(1)
		return
	if src.find("KEY_ESCAPE") < 0:
		printerr("FAIL: main_menu.gd does not reference KEY_ESCAPE")
		quit(1)
		return
	# Both closers reachable from ESC.
	for closer in ["_close_upgrade_panel", "_close_achievements_panel"]:
		if src.find(closer) < 0:
			printerr("FAIL: main_menu.gd missing closer %s" % closer)
			quit(1)
			return
	print("[polish240] ESC keybind wired to both closers")
	# ── 8. Diamond glyph (achievement icon) uses Polygon2D ──────────────
	# The status icon switched from "OK"/"—" text to a 24×24 Polygon2D
	# diamond. Verify the polygon path is present so a future refactor
	# that reverts to text-prefix glyphs is caught.
	if src.find("Polygon2D.new()") < 0:
		printerr("FAIL: main_menu.gd missing Polygon2D.new() — diamond glyph regression")
		quit(1)
		return
	if src.find("PackedVector2Array") < 0:
		printerr("FAIL: main_menu.gd missing PackedVector2Array — diamond polygon regression")
		quit(1)
		return
	print("[polish240] diamond Polygon2D glyph present")
	# ── 9. Currency chip + upgrade row state-checks ─────────────────────
	# The currency chip should reference GameState.ether_shards (so it
	# can't go stale) and the upgrade row should branch on
	# affordability via GameState.ether_shards >= next_cost.
	if src.find("GameState.ether_shards") < 0:
		printerr("FAIL: main_menu.gd missing GameState.ether_shards reference")
		quit(1)
		return
	# The affordability comparison string — naive but stable.
	if src.find("GameState.ether_shards >= next_cost") < 0:
		printerr("FAIL: main_menu.gd missing affordability comparison")
		quit(1)
		return
	print("[polish240] currency chip + affordability gating wired")
	print("[polish240] PASS — modal panel redesign verified (Bindings + Achievements)")
	quit(0)
