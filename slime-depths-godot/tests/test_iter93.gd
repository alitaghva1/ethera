extends SceneTree

# Iter 93 — main menu spacing polish + glow ghost-letter bug fix.
#
# After iter-92 landed the painted backdrop, playtesting revealed:
#   1. A "ghost letters" artifact behind the title — the TitleGlow Label
#      used text="ETHERA" while the foreground Title used "E T H E R A".
#      The dimmer orange glow letters peeked through the spaced gaps in
#      the cream foreground, reading as a duplicate.
#   2. TitleHairline{Top,Bottom} crowded the title + subtitle without
#      adding value (painted backdrop's arch frames the title already).
#   3. Subtitle sat ~5 px below the title — needed more breathing room.
#   4. RECORDS panel "last run" line clipped low against viewport bottom.
#
# Fixes:
#   • TitleGlow text → "E T H E R A" (matches foreground, kills ghost).
#   • Removed both TitleHairlines.
#   • Pushed subtitle down ~10 px (offset_top 148 → 150) AND moved title
#     itself down 20 px (TitleBlock offset_top 60 → 80) for headroom.
#   • Bumped StatsBlock up 18 px so the last-run line has clearance.
func _initialize() -> void:
	var ok := true
	var src := FileAccess.get_file_as_string("res://scenes/main_menu.tscn")

	# ═══ Glow text matches the foreground (kills ghost letters) ═══
	# Both Title and TitleGlow nodes must declare text = "E T H E R A".
	var title_count: int = 0
	var lines: PackedStringArray = src.split("\n")
	for line in lines:
		if line.strip_edges() == "text = \"E T H E R A\"":
			title_count += 1
	if title_count < 2:
		push_error("FAIL: Title + TitleGlow don't both use 'E T H E R A' — ghost-letter bug alive")
		ok = false
	else:
		print("OK both Title and TitleGlow use 'E T H E R A' (no ghost letters)")

	# ═══ Hairlines removed ═══
	for h in ["TitleHairlineTop", "TitleHairlineBottom"]:
		if src.contains("name=\"%s\"" % h):
			push_error("FAIL: %s still present (painted backdrop replaces this manuscript chrome)" % h)
			ok = false
	if ok:
		print("OK TitleHairlineTop + TitleHairlineBottom removed")

	# ═══ Title block moved down for headroom ═══
	# The TitleBlock now starts at y=80 (was 60). Look for the new offset
	# in the TitleBlock node's stanza.
	var tb_idx: int = src.find("name=\"TitleBlock\"")
	if tb_idx < 0:
		push_error("FAIL: TitleBlock node missing")
		ok = false
	else:
		# Slice the next ~400 chars to scan the TitleBlock properties.
		var tb_slice: String = src.substr(tb_idx, 400)
		if not tb_slice.contains("offset_top = 80.0"):
			push_error("FAIL: TitleBlock offset_top should be 80.0 for added top headroom")
			ok = false
		else:
			print("OK TitleBlock starts at y=80 (more top headroom)")

	# ═══ Subtitle pushed further from title baseline ═══
	# iter-93's spec was offset_top = 150. iter-127 nudged it to 144 to
	# leave room for the new SubtitleRule manuscript hairline at y=184.
	# Either value is fine — we just check the subtitle still has clear
	# breath from the title (offset_top ≥ 140).
	var sub_idx: int = src.find("name=\"Subtitle\"")
	if sub_idx < 0:
		push_error("FAIL: Subtitle node missing")
		ok = false
	else:
		var sub_slice: String = src.substr(sub_idx, 400)
		var has_breath: bool = sub_slice.contains("offset_top = 150.0") or sub_slice.contains("offset_top = 144.0")
		if not has_breath:
			push_error("FAIL: Subtitle offset_top not in the iter-93/iter-127 range (140-150)")
			ok = false
		else:
			print("OK Subtitle has breath from title baseline (iter-93 / iter-127 spacing)")

	# ═══ Stats block shifted up for bottom clearance ═══
	var sb_idx: int = src.find("name=\"StatsBlock\"")
	if sb_idx < 0:
		push_error("FAIL: StatsBlock missing")
		ok = false
	else:
		var sb_slice: String = src.substr(sb_idx, 400)
		if not sb_slice.contains("offset_top = -150.0") or not sb_slice.contains("offset_bottom = -46.0"):
			push_error("FAIL: StatsBlock not shifted up (last-run line will still clip low)")
			ok = false
		else:
			print("OK StatsBlock shifted up 18 px (last-run line clears viewport bottom)")

	# ═══ Scene still loads + has all expected nodes ═══
	var scene := load("res://scenes/main_menu.tscn") as PackedScene
	if scene == null:
		push_error("FAIL: main_menu.tscn no longer loads")
		ok = false
	else:
		var inst: Node = scene.instantiate()
		if inst == null:
			push_error("FAIL: main_menu.tscn failed to instantiate")
			ok = false
		else:
			# Hairlines GONE.
			if inst.get_node_or_null("TitleBlock/TitleHairlineTop") != null:
				push_error("FAIL: TitleHairlineTop survived instantiation")
				ok = false
			if inst.get_node_or_null("TitleBlock/TitleHairlineBottom") != null:
				push_error("FAIL: TitleHairlineBottom survived instantiation")
				ok = false
			# Title + glow + subtitle still present.
			for n in ["TitleBlock/Title", "TitleBlock/TitleGlow", "TitleBlock/Subtitle"]:
				if inst.get_node_or_null(n) == null:
					push_error("FAIL: %s missing after instantiation" % n)
					ok = false
			# Title + glow text match.
			var t: Label = inst.get_node_or_null("TitleBlock/Title")
			var g: Label = inst.get_node_or_null("TitleBlock/TitleGlow")
			if t != null and g != null and t.text != g.text:
				push_error("FAIL: Title text '%s' != TitleGlow text '%s'" % [t.text, g.text])
				ok = false
			else:
				print("OK Title.text == TitleGlow.text after instantiation")
			inst.queue_free()

	if ok:
		print("=== ITER 93 INTEGRATION PASSED ===")
	else:
		print("=== ITER 93 INTEGRATION FAILED ===")
	quit(0 if ok else 1)
