extends SceneTree

# Iter 108 — pedestal offer card readability bump.
#
# User playtest screenshot: "need to improve still the ui on those
# relics they are hard to read and partially look like they might be
# getting cut?"
#
# Diagnosis: NameLabel at font_size 18, DescLabel at font_size 12 on
# a 196×120-px card (3 cards at 200-px stride). The 12-pt body text
# on a dark backdrop was simply too small for comfortable reading
# from a normal play distance. The "might be getting cut" perception
# came from how dense the wrapped lines looked against the panel
# bottom edge.
#
# Fix: bump fonts so the cards read without leaning in.
#   - NameLabel font_size 18 → 20 (more impactful header)
#   - DescLabel font_size 12 → 14 (was the comfort-threshold issue)
#   - DescLabel offset_top 34 → 38 (clear the taller NameLabel area)
#   - NameLabel offset_bottom 32 → 36 (fit the bigger name font)
#   - DescLabel line_separation 2 (subtle breathing between wrapped lines)
#   - DescLabel font_color brightened (0.88,0.82,0.66) → (0.92,0.86,0.70)
#     for slightly more contrast against the dark panel fill
#   - MAX_PANEL_HEIGHT 160 → 220 in pedestal.gd so the dynamic
#     _sync_offer_panel_height can grow the panel upward to fit the
#     larger wrapped text without spilling
#   - DESC_FONT_SHRUNK 11 → 13 (fallback when text overflows still
#     readable; old 11 was basically smaller than the pre-iter-108 base)
#   - DESC_VERTICAL_MARGIN 38 → 42 in the height-sync helper to match
#     the new NameLabel area + paddings
func _initialize() -> void:
	var ok := true
	var p_src := FileAccess.get_file_as_string("res://scenes/pedestal.tscn")
	var gd_src := FileAccess.get_file_as_string("res://scripts/pedestal.gd")

	# ═══ NameLabel font + height bump ═══
	# Slice the NameLabel block from the .tscn (between its name= line
	# and the next [node] line) for precise assertions.
	var nl_idx: int = p_src.find("name=\"NameLabel\"")
	if nl_idx < 0:
		push_error("FAIL: NameLabel missing from pedestal.tscn")
		ok = false
	else:
		var nl_block: String = p_src.substr(nl_idx, 500)
		if "font_size = 20" not in nl_block:
			push_error("FAIL: NameLabel font_size not bumped to 20")
			ok = false
		if "offset_bottom = 36" not in nl_block:
			push_error("FAIL: NameLabel offset_bottom not bumped to 36 (needs to fit 20-pt font)")
			ok = false
		if ok:
			print("OK NameLabel: font_size 20 + offset_bottom 36")

	# ═══ DescLabel font + offsets ═══
	var dl_idx: int = p_src.find("name=\"DescLabel\"")
	if dl_idx < 0:
		push_error("FAIL: DescLabel missing from pedestal.tscn")
		ok = false
	else:
		var dl_block: String = p_src.substr(dl_idx, 600)
		if "font_size = 14" not in dl_block:
			push_error("FAIL: DescLabel font_size not bumped to 14")
			ok = false
		if "offset_top = 38" not in dl_block:
			push_error("FAIL: DescLabel offset_top not bumped to 38 (clearance from bigger name)")
			ok = false
		if "line_separation = 2" not in dl_block:
			push_error("FAIL: DescLabel line_separation not set to 2 (breathing room)")
			ok = false
		if ok:
			print("OK DescLabel: font_size 14, offset_top 38, line_separation 2")

	# ═══ MAX_PANEL_HEIGHT + DESC_FONT_SHRUNK + DESC_VERTICAL_MARGIN ═══
	if "MAX_PANEL_HEIGHT: float = 220.0" not in gd_src:
		push_error("FAIL: MAX_PANEL_HEIGHT not raised to 220 (was 160; bigger font needs more room)")
		ok = false
	else:
		print("OK MAX_PANEL_HEIGHT raised to 220")
	if "DESC_FONT_SHRUNK: int = 13" not in gd_src:
		push_error("FAIL: DESC_FONT_SHRUNK not raised to 13 (was 11 — barely readable fallback)")
		ok = false
	else:
		print("OK DESC_FONT_SHRUNK raised to 13")
	if "DESC_VERTICAL_MARGIN: float = 42.0" not in gd_src:
		push_error("FAIL: DESC_VERTICAL_MARGIN not raised to 42 (was 38; bigger name needs more)")
		ok = false
	else:
		print("OK DESC_VERTICAL_MARGIN raised to 42 (matches new NameLabel area)")

	# ═══ Runtime smoke — pedestal instantiates with new dimensions ═══
	var scene := load("res://scenes/pedestal.tscn") as PackedScene
	if scene == null:
		push_error("FAIL: pedestal.tscn no longer loads")
		ok = false
	else:
		var ped: Node = scene.instantiate()
		ped.relic_id = "iron_fang"
		root.add_child(ped)
		var nl: Label = ped.get_node_or_null("InfoPanel/NameLabel")
		var dl: Label = ped.get_node_or_null("InfoPanel/DescLabel")
		if nl == null or dl == null:
			push_error("FAIL: pedestal instance missing NameLabel or DescLabel")
			ok = false
		else:
			# Check that the font_size override resolved on the instance.
			var nl_font_size: int = nl.get_theme_font_size("font_size")
			var dl_font_size: int = dl.get_theme_font_size("font_size")
			if nl_font_size != 20:
				push_error("FAIL: NameLabel font_size resolved to %d (expected 20)" % nl_font_size)
				ok = false
			if dl_font_size != 14:
				push_error("FAIL: DescLabel font_size resolved to %d (expected 14)" % dl_font_size)
				ok = false
			if ok:
				print("OK instantiated pedestal has NameLabel @ 20pt + DescLabel @ 14pt")
		ped.queue_free()

	if ok:
		print("=== ITER 108 INTEGRATION PASSED ===")
	else:
		print("=== ITER 108 INTEGRATION FAILED ===")
	quit(0 if ok else 1)
