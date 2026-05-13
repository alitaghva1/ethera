extends SceneTree

# Iter 127 — Full visual polish pass on the main menu.
#
# Playtest screenshot showed iter-126's typography fix in place but the
# UI layer still read as "underdesigned, disconnected from the painted
# world." User asked for Dark Souls / Elden Ring-level polish:
#   • Title felt blunt + pasted — needed depth, carved-stone presence
#   • Subtitle's "◇  b e n e a t h  …" letterspacing felt stretched
#   • Buttons read as plain transparent rectangles, not dark-fantasy UI
#   • RECORDS + version felt like dev-build leftovers
#
# Iter-127 lands five coordinated changes:
#
#   1. TITLE DROP-SHADOW
#      New TitleShadow Label sits behind TitleGlow + Title in the
#      TitleBlock subtree. Same letterforms + title_font, offset
#      (+3, +4) down-right, dark warm-brown (0.08, 0.04, 0.02, 0.90).
#      No outline, no glow — pure shape. Reads as "carved into stone
#      lit from above-left." main_menu.gd::_apply_title_scale tracks
#      the shadow alongside title + glow so the 3-layer stack pulses
#      as one composition.
#
#   2. SUBTITLE REFINED
#      "◇   b e n e a t h   t h e   r u i n   ◇" → "beneath the ruin".
#      Italic via body_font_italic SystemFont (Cinzel italic if
#      installed, falls back to Georgia/Times italic). Size 19 → 15,
#      alpha 0.95 → 0.62, outline_size 2 → 1. Whispers below the title.
#
#   3. MANUSCRIPT HAIRLINE
#      New SubtitleRule Panel beneath the subtitle — 160 px wide × 1 px
#      gold hairline (reusing the corner-flourish hairline_style).
#      Anchors the title block as a composed unit; reads as a quiet
#      manuscript divider, not a UI element.
#
#   4. BUTTONS — STONE PLAQUES
#      Pre-iter-127: full 1-px gold border on all 4 sides, modern
#      rounded corners (radius 2), thin transparent fill (0.38 alpha).
#      Iter-127: top + bottom gold borders only (no side borders) at
#      2 px, squared corners (radius 0), darker fill (0.66 alpha),
#      drop shadow (offset 0/+2). Hover/focus get warm-amber glow
#      via shadow_color instead of just brighter border lines.
#      Width 320 → 360, height 56/52 → 58/54. body_font/title_font
#      replace default Noto Sans on button text. AWAKEN 22 pt stays;
#      SETTINGS/QUIT 20 → 18 pt so AWAKEN reads as the hero CTA.
#
#   5. RECORDS + VERSION DIMMED FURTHER
#      Records: font 14/12 → 11/10, alpha 0.85 → 0.55, outlines removed.
#      Version: font 11 → 9, alpha 0.75 → 0.45, outline removed, text
#      tightened "ETHERA · godot port · v0.6" → "ETHERA  ·  v0.6".
#      Both read as quiet footnotes; menu hierarchy fully respected.
func _initialize() -> void:
	var ok := true

	var tscn := FileAccess.get_file_as_string("res://scenes/main_menu.tscn")
	var gd := FileAccess.get_file_as_string("res://scripts/main_menu.gd")

	# ═══ 1. Title drop-shadow ═══
	if "name=\"TitleShadow\" type=\"Label\" parent=\"TitleBlock\"" not in tscn:
		push_error("FAIL: TitleShadow Label missing from TitleBlock")
		ok = false
	# Dark warm-brown shadow color
	if "Color(0.08, 0.04, 0.02, 0.90)" not in tscn:
		push_error("FAIL: TitleShadow font_color should be (0.08, 0.04, 0.02, 0.90) — dark warm brown")
		ok = false
	# Wired into main_menu.gd
	if "@onready var title_shadow: Label" not in gd:
		push_error("FAIL: main_menu.gd missing title_shadow @onready ref")
		ok = false
	if "title_shadow.scale = v" not in gd:
		push_error("FAIL: title pulse doesn't scale title_shadow alongside title + glow")
		ok = false
	if "title_shadow.pivot_offset" not in gd:
		push_error("FAIL: _recenter_title_pivots doesn't center title_shadow")
		ok = false
	if ok:
		print("OK title drop-shadow wired (3-layer stack: shadow + glow + foreground)")

	# ═══ 2. Subtitle refined ═══
	if "[sub_resource type=\"SystemFont\" id=\"body_font_italic\"]" not in tscn:
		push_error("FAIL: missing body_font_italic SystemFont sub_resource")
		ok = false
	if "font_italic = true" not in tscn:
		push_error("FAIL: body_font_italic doesn't set font_italic = true")
		ok = false
	# Subtitle text simplified
	if "text = \"beneath the ruin\"" not in tscn:
		push_error("FAIL: subtitle text should be 'beneath the ruin' (no letterspacing / diamonds)")
		ok = false
	# Old letterspaced text gone
	if "b e n e a t h" in tscn:
		push_error("FAIL: pre-iter-127 letterspaced subtitle still present")
		ok = false
	# Subtitle uses italic font
	if "theme_override_fonts/font = SubResource(\"body_font_italic\")" not in tscn:
		push_error("FAIL: Subtitle doesn't use body_font_italic")
		ok = false
	if ok:
		print("OK subtitle: 'beneath the ruin' in italic body_font @ alpha 0.62")

	# ═══ 3. Manuscript hairline ═══
	if "name=\"SubtitleRule\" type=\"Panel\"" not in tscn:
		push_error("FAIL: SubtitleRule Panel (manuscript hairline) missing")
		ok = false
	if ok:
		print("OK manuscript hairline divider added beneath subtitle")

	# ═══ 4. Buttons restyled ═══
	# button_normal: top/bottom borders only, squared corners
	var normal_idx: int = tscn.find("id=\"button_normal\"")
	if normal_idx < 0:
		push_error("FAIL: button_normal stylebox missing")
		ok = false
	else:
		var normal_block: String = tscn.substr(normal_idx, 800)
		if "border_width_left = 0" not in normal_block:
			push_error("FAIL: button_normal should have NO side borders (plaque feel)")
			ok = false
		if "border_width_top = 2" not in normal_block:
			push_error("FAIL: button_normal top border should be 2 px")
			ok = false
		if "corner_radius_top_left = 0" not in normal_block:
			push_error("FAIL: button_normal corner_radius should be 0 (stone doesn't round)")
			ok = false
	# Hover gets warm-amber glow
	var hover_idx: int = tscn.find("id=\"button_hover\"")
	if hover_idx >= 0:
		var hover_block: String = tscn.substr(hover_idx, 800)
		if "shadow_color = Color(0.96, 0.70, 0.32, 0.45)" not in hover_block:
			push_error("FAIL: button_hover missing warm-amber shadow glow")
			ok = false
		if "shadow_size = 14" not in hover_block:
			push_error("FAIL: button_hover shadow_size should be 14")
			ok = false
	# Focus state has thicker top/bottom + thin sides + brighter glow
	var focus_idx: int = tscn.find("id=\"button_focus\"")
	if focus_idx >= 0:
		var focus_block: String = tscn.substr(focus_idx, 800)
		if "border_width_top = 3" not in focus_block:
			push_error("FAIL: button_focus top border should be 3 (thicker than normal)")
			ok = false
		if "shadow_size = 18" not in focus_block:
			push_error("FAIL: button_focus shadow_size should be 18")
			ok = false
	# Buttons wear title_font for serif text
	if "BeginButton" in tscn:
		var begin_idx: int = tscn.find("name=\"BeginButton\"")
		var begin_block: String = tscn.substr(begin_idx, 800)
		if "theme_override_fonts/font = SubResource(\"title_font\")" not in begin_block:
			push_error("FAIL: AWAKEN button doesn't use title_font")
			ok = false
	if ok:
		print("OK buttons: stone-plaque (top/bottom-only gold trim) + warm-amber glow + title_font")

	# ═══ 5. Records + version dimmed ═══
	# Records header alpha 0.55
	if "Color(0.82, 0.68, 0.42, 0.55)" not in tscn:
		push_error("FAIL: StatsTitle alpha should be 0.55 (was 0.85)")
		ok = false
	# Records body alpha 0.55
	if "Color(0.92, 0.86, 0.72, 0.55)" not in tscn:
		push_error("FAIL: records body alpha should be 0.55")
		ok = false
	# Records body font size 10
	if "theme_override_font_sizes/font_size = 10" not in tscn:
		push_error("FAIL: records body font_size should be 10 (was 12)")
		ok = false
	# Version dimmed
	if "Color(0.62, 0.52, 0.38, 0.45)" not in tscn:
		push_error("FAIL: version label alpha should be 0.45 (was 0.75)")
		ok = false
	# Version shortened
	if "text = \"ETHERA  ·  v0.6\"" not in tscn:
		push_error("FAIL: version text should be tightened to 'ETHERA  ·  v0.6'")
		ok = false
	if ok:
		print("OK records + version dimmed (alpha 0.55 / 0.45) + smaller fonts")

	# ═══ Runtime ═══
	var scene: PackedScene = load("res://scenes/main_menu.tscn")
	if scene == null:
		push_error("FAIL: main_menu.tscn no longer loads after iter-127 redesign")
		ok = false

	if ok:
		print("=== ITER 127 INTEGRATION PASSED ===")
	else:
		print("=== ITER 127 INTEGRATION FAILED ===")
	quit(0 if ok else 1)
