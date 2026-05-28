extends SceneTree

# iter-244 / Director Phase 2 — visual hierarchy + reward placement
# smoke test.
#
# Phase 2 retints the slow zone from yellow to violet, drops floor
# cluster density 50%, retints pillars + obstacle slabs + perimeter
# highlight to neutral stone, widens torch glow +25%, shifts the
# pedestal offer cluster off central hazards, and fades hazards during
# offer presentation. All visual / source-grep checks here.
#
# Checks:
#   A. main.gd::_spawn_material_story_clusters uses randi_range(1, 2)
#      (cluster density -50% vs the iter-209 randi_range(2, 3)).
#   B. main.gd contains the pedestal-vs-hazard offset logic
#      (`_pedestal_offer_y_offset` helper + the call site that adds the
#      offset to y).
#   C. game_state.gd contains no `cetonate` typo (regression guard for
#      the COMBUSTION CORE description). The fix is a 1-character
#      correction to `detonate`.
#   D. scenes/hazards/slow_zone.tscn Pool color is violet not yellow-
#      green. Specifically the Color(0.36, 0.20, 0.48 …) violet replaces
#      the iter-183 Color(0.22, 0.30, 0.13) toxic-green.
#   E. scenes/hazards/slow_zone.tscn ToxicLight color is violet
#      Color(0.78, 0.55, 1.0) replacing the iter-189 green-tinted pool
#      Color(0.40, 0.85, 0.32).
#   F. scenes/torch.tscn texture_scale ≥ 3.5 (iter-183 had 2.85; +25%
#      lands at 3.56).
#   G. scenes/pillar.tscn Top band color is neutral stone Color(0.42,
#      0.38, 0.36) replacing the iter-30 warm-grey Color(0.42, 0.40,
#      0.46) — green-channel drops to 0.38 (no purple tint).
#   H. main.gd::_build_interior_wall uses neutral stone top_edge color
#      Color(0.62, 0.58, 0.54, 0.85) replacing the iter-184 warm tan
#      Color(0.58, 0.50, 0.40, 0.85).
#   I. main.gd::CHROME_WALL_TOP_HIGHLIGHT is neutral stone
#      Color(0.62, 0.58, 0.54, 0.85) replacing the iter-178 tan
#      Color(0.48, 0.42, 0.32, 0.85).

func _initialize() -> void:
	print("[iter244] init")
	await process_frame

	# ── A. main.gd cluster density randi_range(1, 2) ──────────────────
	var main_script: Script = load("res://scripts/main.gd") as Script
	if main_script == null:
		printerr("FAIL: main.gd failed to load")
		quit(1)
		return
	var main_src: String = main_script.source_code
	# Look for _spawn_material_story_clusters specifically (other helpers
	# in main.gd also use randi_range so we must scope the search).
	var msc_idx: int = main_src.find("func _spawn_material_story_clusters")
	if msc_idx < 0:
		printerr("FAIL: main.gd missing _spawn_material_story_clusters")
		quit(1)
		return
	# Window into the next ~1500 chars of source (covers the whole
	# function body including the iter-244 retune comment block).
	var msc_window: String = main_src.substr(msc_idx, 1500)
	if msc_window.find("rng.randi_range(1, 2)") < 0:
		printerr("FAIL: _spawn_material_story_clusters NOT capped at randi_range(1, 2) (cluster density -50% missing)")
		quit(1)
		return
	# Defensive: the old 2-3 range should be gone from THIS function body.
	if msc_window.find("rng.randi_range(2, 3)") >= 0:
		printerr("FAIL: _spawn_material_story_clusters still contains randi_range(2, 3) (iter-244 should remove this)")
		quit(1)
		return
	print("[iter244] A. cluster density randi_range(1, 2) OK")

	# ── B. main.gd pedestal-vs-hazard offset logic ────────────────────
	if main_src.find("_pedestal_offer_y_offset") < 0:
		printerr("FAIL: main.gd missing _pedestal_offer_y_offset helper")
		quit(1)
		return
	if main_src.find("PEDESTAL_OFFER_HAZARD_THRESHOLD") < 0:
		printerr("FAIL: main.gd missing PEDESTAL_OFFER_HAZARD_THRESHOLD const")
		quit(1)
		return
	if main_src.find("PEDESTAL_OFFER_HAZARD_OFFSET_Y") < 0:
		printerr("FAIL: main.gd missing PEDESTAL_OFFER_HAZARD_OFFSET_Y const")
		quit(1)
		return
	# Verify the offset is actually applied (the call site at the top of
	# the offer spawn, before the dais / pedestal positions are computed).
	if main_src.find("y += hazard_offset_y") < 0:
		printerr("FAIL: pedestal offer y not adjusted by hazard_offset_y")
		quit(1)
		return
	# Verify the offer-active hazard fade helpers exist + are wired.
	if main_src.find("_fade_central_hazards_for_offer") < 0:
		printerr("FAIL: main.gd missing _fade_central_hazards_for_offer helper")
		quit(1)
		return
	if main_src.find("_restore_central_hazards_after_offer") < 0:
		printerr("FAIL: main.gd missing _restore_central_hazards_after_offer helper")
		quit(1)
		return
	print("[iter244] B. pedestal-vs-hazard offset + hazard fade OK")

	# ── C. game_state.gd no `cetonate` typo ───────────────────────────
	var gs_script: Script = load("res://scripts/game_state.gd") as Script
	if gs_script == null:
		printerr("FAIL: game_state.gd failed to load")
		quit(1)
		return
	var gs_src: String = gs_script.source_code
	if gs_src.find("cetonate") >= 0:
		printerr("FAIL: game_state.gd contains 'cetonate' typo (should be 'detonate')")
		quit(1)
		return
	# Sanity: at least one canonical 'detonate' reference exists.
	if gs_src.find("detonate") < 0:
		printerr("FAIL: game_state.gd missing 'detonate' (COMBUSTION CORE description)")
		quit(1)
		return
	print("[iter244] C. game_state.gd no cetonate typo OK")

	# ── D. slow_zone.tscn Pool color is violet ────────────────────────
	var sz_f := FileAccess.open("res://scenes/hazards/slow_zone.tscn", FileAccess.READ)
	if sz_f == null:
		printerr("FAIL: could not open slow_zone.tscn")
		quit(1)
		return
	var sz_text: String = sz_f.get_as_text()
	sz_f.close()
	if sz_text.find("Color(0.36, 0.20, 0.48, 0.82)") < 0:
		printerr("FAIL: slow_zone Pool color not violet Color(0.36, 0.20, 0.48, 0.82)")
		quit(1)
		return
	# Defensive: the old yellow-green Pool color must be gone.
	if sz_text.find("Color(0.22, 0.30, 0.13, 0.82)") >= 0:
		printerr("FAIL: slow_zone still has old toxic-green Pool color")
		quit(1)
		return
	print("[iter244] D. slow_zone Pool color violet OK")

	# ── E. slow_zone.tscn ToxicLight color is violet ──────────────────
	if sz_text.find("color = Color(0.78, 0.55, 1.0, 1)") < 0:
		printerr("FAIL: slow_zone ToxicLight color not violet Color(0.78, 0.55, 1.0, 1)")
		quit(1)
		return
	# Defensive: the old green light color must be gone.
	if sz_text.find("Color(0.40, 0.85, 0.32, 1)") >= 0:
		printerr("FAIL: slow_zone ToxicLight still tinted green")
		quit(1)
		return
	print("[iter244] E. slow_zone ToxicLight color violet OK")

	# ── F. torch.tscn texture_scale ≥ 3.5 ─────────────────────────────
	var torch_f := FileAccess.open("res://scenes/torch.tscn", FileAccess.READ)
	if torch_f == null:
		printerr("FAIL: could not open torch.tscn")
		quit(1)
		return
	var torch_text: String = torch_f.get_as_text()
	torch_f.close()
	# Hand-parse the line. PointLight2D texture_scale = N.NN
	var ts_val: float = -1.0
	for line in torch_text.split("\n"):
		var s: String = (line as String).strip_edges()
		if s.begins_with("texture_scale"):
			var eq: int = s.find("=")
			if eq < 0:
				continue
			var rhs: String = s.substr(eq + 1).strip_edges()
			ts_val = rhs.to_float()
			break
	if ts_val < 3.5:
		printerr("FAIL: torch.tscn texture_scale=%f, expected ≥ 3.5 (+25% from 2.85)" % ts_val)
		quit(1)
		return
	print("[iter244] F. torch.tscn texture_scale=%f (≥ 3.5) OK" % ts_val)

	# ── G. pillar.tscn Top band neutral stone Color(0.42, 0.38, 0.36) ─
	var pi_f := FileAccess.open("res://scenes/pillar.tscn", FileAccess.READ)
	if pi_f == null:
		printerr("FAIL: could not open pillar.tscn")
		quit(1)
		return
	var pi_text: String = pi_f.get_as_text()
	pi_f.close()
	if pi_text.find("Color(0.42, 0.38, 0.36, 1)") < 0:
		printerr("FAIL: pillar Top band not neutral stone Color(0.42, 0.38, 0.36, 1)")
		quit(1)
		return
	# Verify the cool/highlight retint also landed.
	if pi_text.find("Color(0.62, 0.58, 0.54, 1)") < 0:
		printerr("FAIL: pillar Highlight not cool-stone Color(0.62, 0.58, 0.54, 1)")
		quit(1)
		return
	# Defensive: pre-iter-244 highlight gold Color(0.62, 0.52, 0.38, 1) gone.
	if pi_text.find("Color(0.62, 0.52, 0.38, 1)") >= 0:
		printerr("FAIL: pillar Highlight still warm-gold Color(0.62, 0.52, 0.38, 1)")
		quit(1)
		return
	print("[iter244] G. pillar Top + Highlight neutral stone OK")

	# ── H. wall_rects (_build_interior_wall) top_edge neutral stone ───
	# The iter-184 top_edge was Color(0.58, 0.50, 0.40, 0.85) warm tan.
	# iter-244 retints to Color(0.62, 0.58, 0.54, 0.85) neutral stone.
	# We search the WHOLE main.gd for the new color since it's used in
	# multiple chiseled-edge places.
	if main_src.find("Color(0.62, 0.58, 0.54, 0.85)") < 0:
		printerr("FAIL: main.gd missing neutral-stone Color(0.62, 0.58, 0.54, 0.85) for wall top_edge")
		quit(1)
		return
	# Defensive: the warm tan iter-184 value must be replaced everywhere
	# we care (in the top_edge default_color line specifically).
	# We do a windowed search around _build_interior_wall.
	var biw_idx: int = main_src.find("func _build_interior_wall")
	if biw_idx >= 0:
		var biw_window: String = main_src.substr(biw_idx, 3000)
		if biw_window.find("Color(0.58, 0.50, 0.40, 0.85)") >= 0:
			printerr("FAIL: _build_interior_wall still has warm-tan top_edge Color(0.58, 0.50, 0.40, 0.85)")
			quit(1)
			return
	print("[iter244] H. wall_rect top_edge neutral stone OK")

	# ── I. CHROME_WALL_TOP_HIGHLIGHT neutral stone ────────────────────
	# Pre-iter-244 const was Color(0.48, 0.42, 0.32, 0.85). iter-244
	# retints to Color(0.62, 0.58, 0.54, 0.85).
	var chwth_idx: int = main_src.find("const CHROME_WALL_TOP_HIGHLIGHT")
	if chwth_idx < 0:
		printerr("FAIL: main.gd missing CHROME_WALL_TOP_HIGHLIGHT const")
		quit(1)
		return
	var chwth_line: String = main_src.substr(chwth_idx, 200)
	if chwth_line.find("Color(0.62, 0.58, 0.54, 0.85)") < 0:
		printerr("FAIL: CHROME_WALL_TOP_HIGHLIGHT not retinted to neutral stone Color(0.62, 0.58, 0.54, 0.85)")
		quit(1)
		return
	if chwth_line.find("Color(0.48, 0.42, 0.32, 0.85)") >= 0:
		printerr("FAIL: CHROME_WALL_TOP_HIGHLIGHT still warm tan Color(0.48, 0.42, 0.32, 0.85)")
		quit(1)
		return
	print("[iter244] I. CHROME_WALL_TOP_HIGHLIGHT neutral stone OK")

	print("[iter244] PASS")
	quit(0)
